"""TurnWatcher: the backend settles Ghost runs without an open dashboard.

Design decision 2026-11-16.  A Crew turn end reaches the séance log as a
``crew_turn_ended`` record.  Before this watcher that record came only from a
dashboard that forwarded Crew's ``chat_done``; with no browser open a run
never settled.  The watcher closes that gap without a second path:

* it reads only ACTIVE app-owned sessions (``active_slots``: runs that have
  not ended and still have a current session binding);
* it reads them through Spec 2's bounded history reconciliation
  (``reconcile`` = ``SeanceService.reconcile``), which calls
  ``GatewayClient.session_history`` and sends what the history proves through
  the one Backend_Normalizer and the one Canonical_Event_Writer.  A turn end
  a dashboard forwards later collapses on Record_ID;
* when given ``answer`` (decision 2026-11-16, ``RoomToolAnswerer``), it lets
  the house approve the slot's open non-risky room-tool prompts in the same
  bounded read slot;
* it then calls ``settle`` (``RoomGhosts.pump``), which hands every ended
  turn to the validated terminal gate.

Bounds: each Mansion has its own interval (``base_seconds``, growing by half
after a quiet pass and doubling after a failed read, up to ``max_seconds``,
and back to the base when a pass recorded something new); a Mansion with
nothing active is dropped; at most ``max_concurrent_reads`` history reads run
at once over all Mansions, and at most one per slot; at most
``max_slots_per_pass`` slots of one Mansion are read per pass.  Every gateway
or writer failure is caught and only slows that Mansion down.  Registered
Mansions are rescanned every ``rescan_seconds`` (and once at start), so a
run started before a restart, or by a route that does not notify the
watcher, is still watched.  Clock and sleeper are injectable.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass

__all__ = ["TurnWatcher", "TurnWatcherOptions"]

log = logging.getLogger(__name__)

ActiveSlots = Callable[[str], Awaitable[Sequence[str]]]
Reconcile = Callable[[str, list[str]], Awaitable[object]]
Settle = Callable[[str], Awaitable[object]]
# (mansion, slot) -> True: answered a prompt; False: nothing to answer; None: failed.
Answer = Callable[[str, str], Awaitable[bool | None]]
Mansions = Callable[[], Awaitable[Sequence[str]]]


@dataclass(frozen=True, slots=True)
class TurnWatcherOptions:
    base_seconds: float = 2.0
    max_seconds: float = 15.0
    quiet_growth: float = 1.5
    max_concurrent_reads: int = 2
    max_slots_per_pass: int = 8
    max_mansions: int = 64
    rescan_seconds: float = 60.0
    # How often the loop wakes to look for a due Mansion.
    resolution_seconds: float = 0.5


@dataclass(slots=True)
class _Watch:
    due: float
    interval: float


class TurnWatcher:
    def __init__(
        self,
        *,
        active_slots: ActiveSlots,
        reconcile: Reconcile,
        settle: Settle,
        mansions: Mansions | None = None,
        answer: Answer | None = None,
        options: TurnWatcherOptions = TurnWatcherOptions(),
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Awaitable[object]] = asyncio.sleep,
    ) -> None:
        self._active_slots = active_slots
        self._reconcile = reconcile
        self._settle = settle
        self._mansions = mansions
        self._answer = answer
        self._options = options
        self._clock = clock
        self._sleep = sleep
        self._watches: dict[str, _Watch] = {}
        self._busy: dict[str, asyncio.Task[None]] = {}
        self._reading: set[tuple[str, str]] = set()
        self._reads = asyncio.Semaphore(max(1, options.max_concurrent_reads))
        self._next_rescan: float | None = None
        self._loop: asyncio.Task[None] | None = None

    # --- what is watched ---------------------------------------------------------------

    @property
    def watched(self) -> frozenset[str]:
        return frozenset(self._watches)

    def interval(self, mansion_id: str) -> float | None:
        watch = self._watches.get(mansion_id)
        return watch.interval if watch is not None else None

    def watch(self, mansion_id: str) -> None:
        """Watch a Mansion from now on, with the base interval."""

        if type(mansion_id) is not str or not mansion_id:
            return
        current = self._watches.get(mansion_id)
        if current is None:
            if len(self._watches) >= self._options.max_mansions:
                return
            self._watches[mansion_id] = _Watch(self._clock(), self._options.base_seconds)
        else:
            current.interval = self._options.base_seconds
            current.due = min(current.due, self._clock() + self._options.base_seconds)

    # --- one pass ------------------------------------------------------------------------

    async def tick(self) -> list[asyncio.Task[None]]:
        """Start a pass for every due Mansion that has none running."""

        now = self._clock()
        if self._mansions is not None and (self._next_rescan is None or now >= self._next_rescan):
            self._next_rescan = now + self._options.rescan_seconds
            await self._rescan()
        started: list[asyncio.Task[None]] = []
        for mansion_id, watch in sorted(self._watches.items()):
            if watch.due > now or mansion_id in self._busy:
                continue
            task = asyncio.create_task(self._pass(mansion_id))
            self._busy[mansion_id] = task
            task.add_done_callback(lambda _t, m=mansion_id: self._busy.pop(m, None))
            started.append(task)
        return started

    async def idle(self) -> None:
        """Wait for every running pass (tests)."""

        while self._busy:
            await asyncio.gather(*list(self._busy.values()), return_exceptions=True)

    async def _rescan(self) -> None:
        assert self._mansions is not None
        try:
            names = await self._mansions()
        except Exception as error:  # noqa: BLE001 - the next rescan tries again
            log.warning("turn watcher could not list mansions (%s)", type(error).__name__)
            return
        for name in list(names)[: self._options.max_mansions]:
            if name not in self._watches:
                self.watch(name)

    async def _pass(self, mansion_id: str) -> None:
        try:
            slots = list(await self._active_slots(mansion_id))
        except Exception as error:  # noqa: BLE001
            log.warning("turn watcher could not read runs (%s)", type(error).__name__)
            self._backoff(mansion_id, failed=True)
            return
        if not slots:
            # Nothing in flight: the next command, read, or rescan watches it again.
            self._watches.pop(mansion_id, None)
            return
        reads = [
            self._read(mansion_id, slot)
            for slot in sorted(set(slots))[: self._options.max_slots_per_pass]
            if (mansion_id, slot) not in self._reading
        ]
        results = await asyncio.gather(*reads)
        failed = any(result is None for result in results)
        progressed = any(result for result in results if result is not None)
        try:
            await self._settle(mansion_id)
        except Exception as error:  # noqa: BLE001 - the next pass settles again
            log.warning("turn watcher could not settle (%s)", type(error).__name__)
            failed = True
        if progressed:
            watch = self._watches.get(mansion_id)
            if watch is not None:
                watch.interval = self._options.base_seconds
                watch.due = self._clock() + watch.interval
        else:
            self._backoff(mansion_id, failed=failed)

    async def _read(self, mansion_id: str, slot: str) -> bool | None:
        """Reconcile one slot.  True: something new was recorded; None: failed."""

        key = (mansion_id, slot)
        self._reading.add(key)
        answered: bool | None = False
        try:
            async with self._reads:
                outcome = await self._reconcile(mansion_id, [slot])
                if self._answer is not None:
                    try:
                        answered = await self._answer(mansion_id, slot)
                    except Exception as error:  # noqa: BLE001 - the human path stays open
                        log.warning("turn watcher answer failed (%s)", type(error).__name__)
                        answered = None
        except Exception as error:  # noqa: BLE001 - a gateway error only slows us down
            log.warning("turn watcher read failed (%s)", type(error).__name__)
            return None
        finally:
            self._reading.discard(key)
        if getattr(outcome, "status", None) != "ok" or answered is None:
            return None
        if any(
            getattr(recovery, "status", "") == "history_unavailable"
            for recovery in getattr(outcome, "slots", ()) or ()
        ):
            return None
        duplicates = set(getattr(outcome, "duplicate_record_ids", ()) or ())
        return answered or any(
            getattr(event, "record_id", None) not in duplicates
            for event in getattr(outcome, "events", ()) or ()
        )

    def _backoff(self, mansion_id: str, *, failed: bool) -> None:
        watch = self._watches.get(mansion_id)
        if watch is None:
            return
        growth = 2.0 if failed else self._options.quiet_growth
        watch.interval = min(self._options.max_seconds, watch.interval * growth)
        watch.due = self._clock() + watch.interval

    # --- lifecycle -------------------------------------------------------------------------

    async def start(self) -> None:
        if self._loop is None or self._loop.done():
            self._loop = asyncio.create_task(self._run())

    async def stop(self) -> None:
        loop, self._loop = self._loop, None
        pending = [task for task in (loop, *self._busy.values()) if task is not None and not task.done()]
        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
        self._busy.clear()
        self._reading.clear()

    async def _run(self) -> None:
        while True:
            try:
                await self.tick()
            except Exception as error:  # noqa: BLE001 - the loop never dies
                log.warning("turn watcher tick failed (%s)", type(error).__name__)
            await self._sleep(self._options.resolution_seconds)
