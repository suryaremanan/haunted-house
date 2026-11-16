"""RoomGhosts: the one object the Room Ghosts routes and lifecycle use.

It joins the role-run service, the Workshop service, and the cancellation
service, and owns the only moving part of the feature: ``pump``, which
settles ended turns, dispatches ready Tinkers, and submits a finished
Workshop.  ``pump`` acts only on acknowledged canonical records, so it is
safe to call at any time and any number of times.

It is called after every Room Ghosts command, before every read (the
dashboard re-reads whenever the canonical Sequence moves, so an acknowledged
turn end is settled promptly), and by a background loop while a Mansion has
work in flight (backpressure delays and deadlines no request announces).
The loop and every cancellation confirmation stop with the application.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable, Sequence

from haunted_house.core.guardrail_events import Phase
from haunted_house.core.room_projection import run_recovery_view
from haunted_house.core.seance_event import JSONValue
from haunted_house.core.workflow import PhaseStatus
from haunted_house.services.canonical_port import CanonicalRunPort
from haunted_house.services.cancellation import CancellationService
from haunted_house.services.contracts import CONTRACT_UNAVAILABLE
from haunted_house.services.room_ghost_service import (
    CommandOutcome,
    RoomGhostError,
    RoomGhostService,
)
from haunted_house.services.workshop_service import WorkshopService

__all__ = ["RoomGhosts"]

log = logging.getLogger(__name__)


class RoomGhosts:
    def __init__(
        self,
        *,
        port: CanonicalRunPort,
        ghosts: RoomGhostService,
        workshop: WorkshopService,
        cancellation: CancellationService,
        tick_seconds: float = 2.0,
        read_budget_seconds: float = 5.0,
    ) -> None:
        self._port = port
        self.ghosts = ghosts
        self.workshop = workshop
        self.cancellation = cancellation
        self._tick = float(tick_seconds)
        self._read_budget = float(read_budget_seconds)
        self._background: set[asyncio.Task[bool]] = set()
        self._watched: set[str] = set()
        self._pumping: dict[str, asyncio.Lock] = {}
        self._loop: asyncio.Task[None] | None = None
        # The backend's own turn watcher (decision 2026-11-16), told about every
        # Mansion this object starts watching.  None in tests that run without it.
        self.on_watch: Callable[[str], None] | None = None

    def _watch(self, mansion_id: str) -> None:
        self._watched.add(mansion_id)
        if self.on_watch is not None:
            self.on_watch(mansion_id)

    async def active_slots(self, mansion_id: str) -> list[str]:
        """The owned session slots of every run of the Mansion still in flight.

        Only a run that has not ended and still has a current binding of this
        backend counts: those are the app-owned sessions the house may read.
        """

        read = await self._port.read(mansion_id)
        if not read.writable:
            return []
        slots: set[str] = set()
        for run in self.ghosts.facts(read).runs:
            if not run.active:
                continue
            room = self.ghosts.room_binding(run)
            if room is not None:
                slots.add(room.slot)
        return sorted(slots)

    # --- the pump ---------------------------------------------------------------------------

    async def pump(self, mansion_id: str) -> bool:
        """Settle, dispatch, and submit for one Mansion.  Idempotent.

        Returns whether the Mansion still has work in flight (a run that has
        not ended, a Workshop with queued tasks, a backpressure delay), which
        is what keeps the background loop watching it.  A Mansion with
        nothing in flight costs one canonical read.
        """

        lock = self._pumping.setdefault(mansion_id, asyncio.Lock())
        async with lock:
            read = await self._port.read(mansion_id)
            if not read.writable:
                return False
            facts = self.ghosts.facts(read)
            if any(run.active for run in facts.runs):
                for run in facts.runs:
                    if run.active and run.cancel_requested:
                        room = self.ghosts.room_binding(run)
                        if room is not None:
                            await self.cancellation.settle_stale(
                                run, self.ghosts.run_binding(run, room, read)
                            )
                await self.ghosts.settle(mansion_id, read)
            working = (
                read.projection.phases[Phase.IMPLEMENTATION].status is PhaseStatus.WORKING
                and bool(facts.selected)
            )
            if working:
                # A Tinker that just finished freed the seat the next one needs.
                await self.workshop.advance(mansion_id)
            after = read if not (working or facts.runs) else await self._port.read(mansion_id)
            return (
                any(run.active for run in self.ghosts.facts(after).runs)
                or self.workshop.next_due(mansion_id) is not None
            )

    async def _pump_quietly(self, mansion_id: str) -> bool:
        self._watch(mansion_id)
        try:
            return await self.pump(mansion_id)
        except RoomGhostError:
            return False
        except Exception as error:  # noqa: BLE001 - the next pump tries again
            log.warning("room ghosts pump failed (%s)", type(error).__name__)
            return True

    # --- routes -------------------------------------------------------------------------------

    async def read(self, mansion_id: str, spec_name: str) -> dict[str, JSONValue]:
        self.ghosts.require_contracts()
        await self.ghosts.mansion(mansion_id, spec_name)
        # Settle what the log already shows, but never make a read wait on Crew:
        # past the budget the pump finishes on its own and the answer is what
        # the log holds now.  The dashboard reads again when the Sequence moves.
        task = asyncio.create_task(self._pump_quietly(mansion_id))
        self._background.add(task)
        task.add_done_callback(self._background.discard)
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=self._read_budget)
        except TimeoutError:
            pass
        return await self.ghosts.projection(mansion_id, spec_name)

    async def feedback(
        self, mansion_id: str, spec_name: str, phase: Phase, text: str, *, command_id: str,
        expected_version: int,
    ) -> CommandOutcome:
        outcome = await self.ghosts.feedback(
            mansion_id, spec_name, phase, text, command_id=command_id, expected_version=expected_version
        )
        self._watch(mansion_id)
        return outcome

    async def start_workshop(
        self, mansion_id: str, spec_name: str, task_ids: Sequence[str], *, command_id: str,
        expected_version: int,
    ) -> CommandOutcome:
        outcome = await self.workshop.start(
            mansion_id, spec_name, task_ids, command_id=command_id, expected_version=expected_version
        )
        self._watch(mansion_id)
        return outcome

    async def retry(
        self, mansion_id: str, run_id: str, *, command_id: str, expected_version: int
    ) -> CommandOutcome:
        outcome = await self.ghosts.retry(
            mansion_id, run_id, command_id=command_id, expected_version=expected_version
        )
        await self._pump_quietly(mansion_id)
        return outcome

    async def cancel(
        self, mansion_id: str, run_id: str, *, command_id: str, expected_version: int
    ) -> CommandOutcome:
        ghosts = self.ghosts
        ghosts.require_contracts()
        await ghosts.mansion(mansion_id)
        if not self.cancellation.enabled:
            # RG-S3 is not verified live: no stop is sent, whatever the run is.
            raise RoomGhostError(CONTRACT_UNAVAILABLE)
        read = await self._port.read(mansion_id)
        if not read.writable:
            raise RoomGhostError("integrity_unavailable")
        facts = ghosts.facts(read)
        run = facts.run(run_id)
        if run is None:
            raise RoomGhostError("run_not_found")
        request = run.cancel_request
        if (
            request is not None
            and type(request.payload) is dict
            and request.payload.get("command_id") == command_id
        ):
            return CommandOutcome(read.projection.version, run_id, duplicate=True)
        if expected_version != read.projection.version:
            raise RoomGhostError("stale_version")
        room = ghosts.room_binding(run)
        if room is None:
            raise RoomGhostError("session_unavailable")
        code = await self.cancellation.request(
            ghosts.run_binding(run, room, read),
            run_recovery_view(run, facts),
            command_id=command_id,
            expected_version=expected_version,
        )
        if code != "accepted":
            raise RoomGhostError(code)
        self._watch(mansion_id)
        after = await self._port.read(mansion_id)
        return CommandOutcome(after.projection.version, run_id)

    # --- lifecycle ----------------------------------------------------------------------------

    async def start(self) -> None:
        if self._loop is None or self._loop.done():
            self._loop = asyncio.create_task(self._run())

    async def stop(self) -> None:
        loop, self._loop = self._loop, None
        pending = [task for task in (loop, *self._background) if task is not None and not task.done()]
        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
        self._background.clear()
        await self.cancellation.stop()

    async def _run(self) -> None:
        while True:
            await asyncio.sleep(self._tick)
            for mansion_id in sorted(self._watched):
                if not await self._pump_quietly(mansion_id):
                    # Nothing in flight: the next command or read watches it again.
                    self._watched.discard(mansion_id)
