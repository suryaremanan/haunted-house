"""CancellationService: stop one owned session's turn (RG-S3).

Disabled by default.  RG-S3 established the request and its confirmation in
isolation only; until the owner's live step passes, ``enabled`` stays false,
no stop is ever sent, and every request answers ``contract_unavailable``.

When enabled, one request:

1. appends a house-origin ``ghost_progressed`` candidate with progress kind
   ``cancel_requested`` (compare-and-append, so the Operator acted on the
   state they saw);
2. sends exactly one bodyless stop to the owned slot.  It is never repeated
   and never forced: a second stop while the first is pending would reset
   the session and discard its queue;
3. waits up to 30 seconds for the confirmation: Crew's reply says the cancel
   settled, and the session's own ``stop_event`` row names how; and
4. settles the run through the validated terminal gate: ``cancelled``
   releases the claim, ``cancel_unconfirmed`` retains it.

Earlier acknowledged events of the run are never touched: the only records
appended are the request and the terminal outcome.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable

from haunted_house.adapters.crew_chat import CrewChat, CrewChatError
from haunted_house.core.ghost_run import GhostRunBinding
from haunted_house.core.room_runs import CANCEL_PROGRESS, RunFact
from haunted_house.core.run_recovery import (
    CANCEL_CONFIRM_SECONDS,
    RunView,
    cancel_refusal,
    cancel_settlement,
)
from haunted_house.core.seance_event import AppEventCandidate, EventSource
from haunted_house.services.canonical_port import CanonicalRunPort
from haunted_house.services.terminal_gate import ValidatedTerminalGate

__all__ = ["STOPPED_STATES", "CancellationService", "cancel_request_candidate"]

log = logging.getLogger(__name__)

# ``stop_event`` states that mean the turn is no longer running (RG-S3).
# ``stop_declined_compacting`` is not a cancellation.
STOPPED_STATES = frozenset({"stopped", "force_stopped", "stop_failed_reset"})


def cancel_request_candidate(binding: GhostRunBinding, command_id: str) -> AppEventCandidate:
    """The house-origin fact that a cancellation was asked for."""

    return AppEventCandidate(
        schema_version=1,
        event_type="ghost_progressed",
        scope=binding.scope,
        source=EventSource(
            origin="house",
            source_type="run_progress",
            identity_parts=(binding.run_id, CANCEL_PROGRESS),
            revision=0,
            generation="",
            source_sequence=0,
        ),
        caused_by=(),
        occurred_at_ms=None,
        payload={
            "reason": "Cancellation requested",
            "progress_kind": CANCEL_PROGRESS,
            "command_id": command_id,
        },
    )


class CancellationService:
    def __init__(
        self,
        *,
        port: CanonicalRunPort,
        crew: CrewChat,
        gate: ValidatedTerminalGate,
        enabled: bool = False,
        confirm_seconds: float = CANCEL_CONFIRM_SECONDS,
        poll_seconds: float = 1.0,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        clock: Callable[[], float] = time.monotonic,
        now_ms: Callable[[], int] = lambda: int(time.time() * 1000),
    ) -> None:
        self._port = port
        self._crew = crew
        self._gate = gate
        self._enabled = enabled is True
        self._confirm_seconds = float(confirm_seconds)
        self._poll_seconds = float(poll_seconds)
        self._sleep = sleep
        self._clock = clock
        self._now_ms = now_ms
        self._tasks: dict[str, asyncio.Task[None]] = {}

    @property
    def enabled(self) -> bool:
        return self._enabled

    def pending(self) -> bool:
        return any(not task.done() for task in self._tasks.values())

    async def request(
        self, binding: GhostRunBinding, view: RunView, *, command_id: str, expected_version: int
    ) -> str:
        """Ask for cancellation.  Returns ``accepted`` or a refusal code."""

        refusal = cancel_refusal(view, enabled=self._enabled)
        if refusal is not None:
            return refusal
        acknowledged = await self._port.compare_and_append(
            binding.mansion_id, expected_version, [cancel_request_candidate(binding, command_id)]
        )
        if acknowledged.status == "conflict":
            return "stale_version"
        if not acknowledged.ok:
            return "writer_unavailable"
        key = f"{binding.mansion_id}\x00{binding.slot}\x00{binding.run_id}"
        self._tasks[key] = asyncio.create_task(self._confirm(binding))
        return "accepted"

    async def _confirm(self, binding: GhostRunBinding) -> None:
        deadline = self._clock() + self._confirm_seconds
        confirmed = False
        try:
            # One request.  A timeout or a failure is never followed by another.
            reply = await asyncio.wait_for(
                self._crew.stop_turn(binding.slot), timeout=self._confirm_seconds
            )
            while reply.status == "stopped":
                try:
                    turn = await self._crew.read_turn(binding.slot)
                except CrewChatError:
                    turn = None
                if turn is not None and turn.stop_state in STOPPED_STATES:
                    confirmed = True
                    break
                if self._clock() >= deadline:
                    break
                await self._sleep(self._poll_seconds)
        except (CrewChatError, TimeoutError):
            confirmed = False
        except asyncio.CancelledError:
            # Shutdown: the request record stays, and ``settle_stale`` of the
            # next process blocks the run as unconfirmed after the deadline.
            raise
        try:
            await self._gate.settle_blocked(binding, cancel_settlement(confirmed))
        except Exception as error:  # noqa: BLE001 - settled again by the next pump
            log.warning("cancellation outcome was not recorded (%s)", type(error).__name__)

    async def settle_stale(self, run: RunFact, binding: GhostRunBinding) -> None:
        """Block a run whose cancellation no task of this process is confirming.

        After a restart the stop is not sent again.  Once the request is older
        than the confirmation window the run is ``cancel_unconfirmed``.
        """

        if not run.active or not run.cancel_requested:
            return
        key = f"{binding.mansion_id}\x00{binding.slot}\x00{binding.run_id}"
        task = self._tasks.get(key)
        if task is not None and not task.done():
            return
        requested = run.cancel_request
        asked_at = (requested or run.started).persisted_at_ms
        age_ms = self._now_ms() - asked_at
        if age_ms >= self._confirm_seconds * 1000:
            await self._gate.settle_blocked(binding, cancel_settlement(False))

    async def stop(self) -> None:
        """Cancel every confirmation still waiting (backend shutdown)."""

        tasks = [task for task in self._tasks.values() if not task.done()]
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self._tasks.clear()
