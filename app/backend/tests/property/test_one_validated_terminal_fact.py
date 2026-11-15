"""Property 11 for canonical room integration (task 5.4).

Feature: room-ghosts, Property 11: Canonical room integration has one validated terminal fact

A room run is driven through a generated interleaving of raw ``chat_done``
deliveries (duplicated), canonical redeliveries (a later Crew revision),
artifact writes, settlements (good and bad final text), and backend restarts
(a fresh gate over the same log).  Everything is in memory: the real Spec 2
ingest service and folds, the real Spec 4 machine, and the real gate.

Validates: Requirements 10.1–10.12.
"""

from __future__ import annotations

import asyncio

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from haunted_house.core.ghost_state import GhostSnapshot, reduce_ghost_snapshot, select_events
from haunted_house.core.guardrail_events import Phase
from haunted_house.core.seance_log_parser import parse_event_log
from haunted_house.core.seance_persistence import serialize_app_event
from haunted_house.core.workflow import DoorStatus, advance_workflow, initial_workflow
from haunted_house.core.workflow_projector import replay_projection
from tests.room_ghost_runtime_support import (
    MANSION,
    REQUIREMENTS,
    MemoryWorld,
    chat_done,
    ready_result,
    sha256_text,
    spec_doc,
)

pytestmark = pytest.mark.core

DOC = spec_doc(Phase.REQUIREMENTS)
STEPS = st.lists(
    st.sampled_from(
        ["write", "raw", "raw", "redeliver", "settle_good", "settle_good", "settle_bad",
         "settle_raw", "restart", "other_ghost_noise"]
    ),
    min_size=1,
    max_size=14,
)


def _room(events, run) -> tuple:
    """The joined room outcome: Ghost state, Door, artifact readiness, terminal."""

    selected = select_events(events).events
    projection = replay_projection(selected)
    view = projection.phases[Phase.REQUIREMENTS]
    snapshot: GhostSnapshot = reduce_ghost_snapshot(selected, MANSION, run.ghost_name)
    terminal = [
        (event.event_type, event.record_id)
        for event in selected
        if event.scope == run.scope and event.event_type in ("run_completed", "run_failed", "run_blocked")
    ]
    ready = view.proposal.artifact_revision.sha256 if view.proposal is not None else None
    return snapshot.state, snapshot.reason, view.status, view.door, ready, tuple(terminal)


async def _drive(steps: list[str]):
    world = MemoryWorld()
    run = await world.start(Phase.REQUIREMENTS)
    gate = world.gate()
    good = ready_result(run, {DOC: REQUIREMENTS})
    turns: list = []
    seen_records: set[str] = set()
    revision = 0
    written = False
    # The live view is folded one acknowledged record at a time.
    live = initial_workflow()
    folded = 0

    def advance() -> None:
        nonlocal live, folded
        new = world.memory.events[folded:]
        folded = len(world.memory.events)
        live = advance_workflow(live, new)

    for step in steps:
        if step == "write" and not written:
            await world.write_spec(run, REQUIREMENTS)
            written = True
        elif step == "raw":
            outcome = await world.ingest(chat_done(run.slot))  # the browser forwards the frame
            turns.append(outcome.events[0])
        elif step == "redeliver":
            revision += 1
            outcome = await world.ingest(chat_done(run.slot, revision=revision))
            turns.append(outcome.events[0])
        elif step == "other_ghost_noise":
            other = await world.register(Phase.REQUIREMENTS, world.new_id("noise"), "draughtsman", 7)
            await world.ingest(chat_done(other.slot, generation="gen-noise"))
        elif step == "restart":
            gate = world.gate()  # nothing but the log survives
        elif step == "settle_raw":
            refused = await gate.settle_turn(run, chat_done(run.slot), good)
            assert refused.status == "rejected" and refused.event is None
        elif step in ("settle_good", "settle_bad") and turns:
            turn = turns[-1] if step == "settle_good" else turns[0]
            seen_records.add(turn.record_id)
            before = len(await world.terminals(run))
            result = await gate.settle_turn(run, turn, good if step == "settle_good" else "nonsense")
            assert result.status in ("completed", "failed")
            # At most one terminal fact, whoever asks and however often.
            assert len(await world.terminals(run)) == 1
            assert result.duplicate is (before == 1)
        advance()
    return world, run, live, turns, seen_records


@settings(max_examples=150)
@given(steps=STEPS)
def test_canonical_room_integration_has_one_validated_terminal_fact(steps: list[str]) -> None:
    # Feature: room-ghosts, Property 11: Canonical room integration has one validated terminal fact
    world, run, live, turns, seen = asyncio.run(_drive(steps))
    events = list(world.memory.events)
    own = [event for event in events if event.scope == run.scope]

    # Spec 2 assigns one logical turn-end fact however often Crew delivers it.
    turn_ends = [event for event in own if event.event_type == "crew_turn_ended"]
    assert len({event.event_id for event in turn_ends}) <= 1
    assert len({event.record_id for event in turn_ends}) == len(turn_ends)  # no duplicate record
    assert all(event.source.origin == "crew" for event in turn_ends)
    assert len([e for e in select_events(events).events if e.scope == run.scope
                and e.event_type == "crew_turn_ended"]) <= 1
    # Room Ghosts never wrote a Crew-origin record and never a second terminal.
    house_made = [event for event in own if event.source.origin == "house"]
    terminals = [e for e in house_made if e.event_type in ("run_completed", "run_failed", "run_blocked")]
    completed = [event for event in terminals if event.event_type == "run_completed"]
    assert len(terminals) <= 1 and len(completed) <= 1
    assert len({event.record_id for event in events}) == len(events)
    # Each acknowledged Record_ID was acted on at most once: one Door proposal.
    proposals = [
        event for event in events
        if event.event_type == "domain_event_recorded" and event.payload.get("kind") == "phase_output_ready"
    ]
    assert world.submissions == len(proposals) <= 1

    # No successful terminal event before validation and Spec 4 acceptance.
    if completed:
        done = completed[0]
        assert proposals and proposals[0].sequence < done.sequence
        assert world.validated_at and world.validated_at[0] < done.sequence
        assert any(event.sequence < done.sequence for event in turn_ends)
        assert done.caused_by and done.caused_by[0] == turn_ends[0].event_id
        assert done.payload["artifacts"] == [{"path": DOC, "sha256": sha256_text(REQUIREMENTS)}]
    else:
        assert not proposals
    for cut in range(len(events) + 1):
        state = reduce_ghost_snapshot(events[:cut], MANSION, run.ghost_name).state
        assert (state == "done") == any(e.event_type == "run_completed" and e.scope == run.scope
                                        for e in events[:cut])

    # Live incremental state equals a replay of the one serialized Event_Log.
    log = b"".join(serialize_app_event(event) for event in events)
    parsed = parse_event_log(log)
    assert parsed.diagnostics == () and [e.record_id for e in parsed.events] == [e.record_id for e in events]
    assert _room(parsed.events, run) == _room(events, run)
    replay = replay_projection(parsed.events)
    assert replay.phases == live.phases and replay.documents == live.documents
    state, _reason, _status, door, ready, terminal = _room(parsed.events, run)
    if completed:
        assert (state, door, ready) == ("done", DoorStatus.WAITING, sha256_text(REQUIREMENTS))
    else:
        assert door is DoorStatus.SEALED and ready is None
        assert state == ("failed" if terminals else "working")
    assert len(terminal) == len(terminals)
