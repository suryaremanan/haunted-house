"""A run settles with no dashboard open (design decision 2026-11-16).

Everything is real except Crew: the Spec 2 writer and reconciliation, the
Spec 4 WorkflowService, the Room Ghosts services, and the TurnWatcher.  No
``chat_done`` is ever forwarded here unless a test plays the dashboard late.
"""

from __future__ import annotations

import asyncio

from haunted_house.core.guardrail_events import Phase
from haunted_house.services.turn_watcher import TurnWatcher
from tests.room_ghost_runtime_support import REQUIREMENTS
from tests.room_ghost_stage import DOCUMENT, Play, result_text
from tests.workflow_support import IN_RUN_TS, MANSION, house


class Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def _watcher(play: Play, clock: Clock) -> TurnWatcher:
    watcher = TurnWatcher(
        active_slots=play.rooms.active_slots,
        reconcile=play.h.seance.reconcile,
        settle=play.rooms.pump,
        clock=clock,
    )
    play.rooms.on_watch = watcher.watch
    return watcher


async def _pass(watcher: TurnWatcher, clock: Clock) -> None:
    clock.now += 100
    await watcher.tick()
    await watcher.idle()


def _say(play: Play, room, text: str) -> None:
    """The Ghost's final message, stored the way Crew stores it (with a ``mid``)."""

    play.h.crew.messages[room.slot].append(
        {"role": "assistant", "content": text, "ts": IN_RUN_TS, "meta": {"mid": "m-final-1"}}
    )


def _run(scenario, tmp_path):
    async def main():
        async with house(tmp_path, room_ghosts=True) as h:
            return await scenario(Play(h))

    return asyncio.run(main())


def test_an_ended_turn_is_settled_from_history_and_a_late_chat_done_collapses(tmp_path):
    async def scenario(play: Play):
        clock = Clock()
        watcher = _watcher(play, clock)
        room = await play.start(Phase.REQUIREMENTS)
        await play.read()  # the dashboard looked once, then closed
        assert MANSION in watcher.watched
        assert await play.rooms.active_slots(MANSION) == [room.slot]
        await play.write_spec(room, REQUIREMENTS)
        _say(play, room, result_text(room, {DOCUMENT[Phase.REQUIREMENTS]: REQUIREMENTS}))

        # Still running: the history proves nothing, nothing settles.
        play.h.crew.turn_status(room.slot, running=True, turn=1, generation="gen-1")
        await _pass(watcher, clock)
        running = await play.terminals()

        # Crew finished the turn; no browser forwards chat_done.
        play.h.crew.turn_status(room.slot, running=False, turn=1, generation="gen-1")
        await _pass(watcher, clock)
        settled = await play.terminals()
        ended = await play.events("crew_turn_ended")
        projection = (await play.h.view(reconcile=False)).read.projection

        # A dashboard that opens later forwards the same turn's chat_done.
        late = await play.turn_ended(room)
        ended_after = await play.events("crew_turn_ended")
        # Nothing active any more: the watcher stops reading.
        await _pass(watcher, clock)
        reads = len([step for step in play.h.crew.steps() if step == "get_session"])
        await _pass(watcher, clock)
        reads_after = len([step for step in play.h.crew.steps() if step == "get_session"])
        return running, settled, ended, projection, late, ended_after, watcher.watched, reads, reads_after

    (running, settled, ended, projection, late, ended_after, watched, reads,
     reads_after) = _run(scenario, tmp_path)
    assert running == []
    assert settled == [("requirements-1", "completed", "ready")]
    assert len(ended) == 1 and ended[0].source.origin == "crew"
    # The Door waits for the Operator: nothing auto-advances.
    phase = projection.phases[Phase.REQUIREMENTS]
    assert phase.status.value == "waiting" and phase.door.value == "waiting"
    assert late.record_id == ended[0].record_id and len(ended_after) == 1
    assert watched == frozenset() and reads_after == reads


def test_gateway_errors_settle_nothing_and_do_not_stop_the_watcher(tmp_path):
    async def scenario(play: Play):
        clock = Clock()
        watcher = _watcher(play, clock)
        room = await play.start(Phase.REQUIREMENTS)
        await play.read()
        await play.write_spec(room, REQUIREMENTS)
        _say(play, room, result_text(room, {DOCUMENT[Phase.REQUIREMENTS]: REQUIREMENTS}))
        play.h.crew.turn_status(room.slot, running=False, turn=1, generation="gen-1")
        play.h.crew.fail["get_session"] = (502, {"error": "bad gateway"})
        await _pass(watcher, clock)
        failed = await play.terminals()
        interval = watcher.interval(MANSION)
        del play.h.crew.fail["get_session"]
        await _pass(watcher, clock)
        return failed, interval, await play.terminals()

    failed, interval, settled = _run(scenario, tmp_path)
    assert failed == [] and interval is not None and interval > 2.0
    assert settled == [("requirements-1", "completed", "ready")]
