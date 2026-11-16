"""TurnWatcher bounds (design decision 2026-11-16: the backend settles runs
without a browser).  Fakes only: no gateway, no log, no real clock."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

from haunted_house.services.turn_watcher import TurnWatcher, TurnWatcherOptions


@dataclass
class Event:
    record_id: str


@dataclass
class Recovery:
    slot: str
    status: str = "recovered"


@dataclass
class Outcome:
    status: str = "ok"
    events: tuple = ()
    duplicate_record_ids: tuple = ()
    slots: tuple = ()


class Clock:
    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        return self.now


@dataclass
class World:
    active: dict[str, list[str]] = field(default_factory=dict)
    outcomes: list[object] = field(default_factory=list)
    reads: list[tuple[str, tuple[str, ...]]] = field(default_factory=list)
    settled: list[str] = field(default_factory=list)
    in_flight: int = 0
    peak: int = 0
    gate: asyncio.Event | None = None
    settle_raises: bool = False

    async def active_slots(self, mansion_id: str):
        return self.active.get(mansion_id, [])

    async def reconcile(self, mansion_id: str, slots: list[str]):
        self.reads.append((mansion_id, tuple(slots)))
        self.in_flight += 1
        self.peak = max(self.peak, self.in_flight)
        try:
            if self.gate is not None:
                await self.gate.wait()
            result = self.outcomes.pop(0) if self.outcomes else Outcome()
            if isinstance(result, Exception):
                raise result
            return result
        finally:
            self.in_flight -= 1

    async def settle(self, mansion_id: str):
        self.settled.append(mansion_id)
        if self.settle_raises:
            raise RuntimeError("boom")


def watcher(world: World, clock: Clock, mansions=None, **options) -> TurnWatcher:
    return TurnWatcher(
        active_slots=world.active_slots,
        reconcile=world.reconcile,
        settle=world.settle,
        mansions=mansions,
        options=TurnWatcherOptions(**options),
        clock=clock,
    )


async def run_pass(subject: TurnWatcher) -> None:
    await subject.tick()
    await subject.idle()


def test_an_active_slot_is_read_through_reconcile_then_settled():
    async def go():
        world, clock = World(active={"m": ["s1"]}), Clock()
        subject = watcher(world, clock)
        subject.watch("m")
        await run_pass(subject)
        assert world.reads == [("m", ("s1",))]
        assert world.settled == ["m"]

    asyncio.run(go())


def test_nothing_active_stops_watching_and_reads_nothing():
    async def go():
        world, clock = World(), Clock()
        subject = watcher(world, clock)
        subject.watch("m")
        await run_pass(subject)
        assert world.reads == [] and world.settled == []
        assert subject.watched == frozenset()

    asyncio.run(go())


def test_a_quiet_pass_backs_off_and_new_records_reset_the_interval():
    async def go():
        world, clock = World(active={"m": ["s1"]}), Clock()
        subject = watcher(world, clock, base_seconds=2.0, max_seconds=10.0, quiet_growth=2.0)
        subject.watch("m")
        await run_pass(subject)
        assert subject.interval("m") == 4.0
        # Not due yet: no read.
        clock.now += 3.9
        await run_pass(subject)
        assert len(world.reads) == 1
        for expected in (8.0, 10.0, 10.0):
            clock.now += 100
            await run_pass(subject)
            assert subject.interval("m") == expected
        # A pass that records something new goes back to the base interval.
        world.outcomes.append(Outcome(events=(Event("r-new"),)))
        clock.now += 100
        await run_pass(subject)
        assert subject.interval("m") == 2.0
        # Only duplicates is not progress.
        world.outcomes.append(Outcome(events=(Event("r-old"),), duplicate_record_ids=("r-old",)))
        clock.now += 100
        await run_pass(subject)
        assert subject.interval("m") == 4.0

    asyncio.run(go())


def test_gateway_errors_double_the_interval_and_never_escape():
    async def go():
        world, clock = World(active={"m": ["s1"]}), Clock()
        subject = watcher(world, clock, base_seconds=1.0, max_seconds=6.0, quiet_growth=1.0)
        subject.watch("m")
        world.outcomes.extend(
            [
                RuntimeError("gateway down"),
                Outcome(status="persistence_failed"),
                Outcome(slots=(Recovery("s1", "history_unavailable"),)),
            ]
        )
        for expected in (2.0, 4.0, 6.0):
            await run_pass(subject)
            assert subject.interval("m") == expected
            clock.now += 100
        # A settle failure is also only a slower next pass.
        world.settle_raises = True
        await run_pass(subject)
        assert subject.interval("m") == 6.0 and "m" in subject.watched

    asyncio.run(go())


def test_concurrent_reads_are_capped_and_one_read_per_slot():
    async def go():
        world, clock = World(active={"a": ["s1", "s2", "s3"], "b": ["s4"]}), Clock()
        world.gate = asyncio.Event()
        subject = watcher(world, clock, max_concurrent_reads=2)
        subject.watch("a")
        subject.watch("b")
        await subject.tick()
        for _ in range(20):
            await asyncio.sleep(0)
        assert world.in_flight == 2
        # A second tick while passes run starts nothing new for the busy Mansions.
        clock.now += 100
        assert await subject.tick() == []
        world.gate.set()
        await subject.idle()
        assert world.peak == 2
        assert sorted(world.reads) == [("a", ("s1",)), ("a", ("s2",)), ("a", ("s3",)), ("b", ("s4",))]

    asyncio.run(go())


def test_slots_per_pass_and_mansions_are_bounded():
    async def go():
        world, clock = World(active={"m": [f"s{n}" for n in range(12)]}), Clock()
        subject = watcher(world, clock, max_slots_per_pass=3, max_mansions=2)
        for name in ("m", "n", "o"):
            subject.watch(name)
        assert subject.watched == frozenset({"m", "n"})
        await run_pass(subject)
        assert len(world.reads) == 3

    asyncio.run(go())


def test_registered_mansions_are_rescanned_at_start_and_periodically():
    async def go():
        world, clock = World(active={"m": ["s1"]}), Clock()
        calls: list[float] = []

        async def mansions():
            calls.append(clock.now)
            return ["m", "idle"]

        subject = watcher(world, clock, mansions=mansions, rescan_seconds=60.0)
        await run_pass(subject)
        assert calls == [100.0]
        assert world.reads == [("m", ("s1",))]
        assert subject.watched == frozenset({"m"})  # "idle" had nothing active
        clock.now += 30
        await run_pass(subject)
        assert calls == [100.0]
        clock.now += 31
        await run_pass(subject)
        assert calls == [100.0, 161.0]

    asyncio.run(go())


def test_a_failing_mansion_listing_is_survived():
    async def go():
        world, clock = World(), Clock()

        async def mansions():
            raise RuntimeError("registry unavailable")

        subject = watcher(world, clock, mansions=mansions)
        await run_pass(subject)
        assert subject.watched == frozenset()

    asyncio.run(go())


def test_start_and_stop_run_the_loop_with_the_injected_sleeper():
    async def go():
        world, clock = World(active={"m": ["s1"]}), Clock()
        sleeps: list[float] = []

        async def sleep(seconds: float) -> None:
            sleeps.append(seconds)
            clock.now += seconds
            await asyncio.sleep(0)

        subject = TurnWatcher(
            active_slots=world.active_slots,
            reconcile=world.reconcile,
            settle=world.settle,
            options=TurnWatcherOptions(base_seconds=1.0, resolution_seconds=0.5),
            clock=clock,
            sleep=sleep,
        )
        subject.watch("m")
        await subject.start()
        for _ in range(200):
            await asyncio.sleep(0)
        await subject.stop()
        assert world.reads and world.settled
        assert set(sleeps) == {0.5}
        calls = len(world.reads)
        for _ in range(50):
            await asyncio.sleep(0)
        assert len(world.reads) == calls  # stopped means stopped

    asyncio.run(go())
