"""Property 6 for the validated terminal gate (task 5.3).

Feature: room-ghosts, Property 6: Completion requires a canonical turn end and valid matching artifact

Each example builds a phase or task run in the in-memory world, injects at
most a few faults, and settles it.  A reference predicate says whether every
condition holds; the gate completes exactly then.  The Door and the task
checkbox are read back from the real Spec 4 fold and the plan text.

Validates: Requirements 5.5, 5.6, 6.5, 6.6, 7.8, 7.9, 9.6, 9.7, 10.9, 10.10, 10.11, 13.2.
"""

from __future__ import annotations

import asyncio
from dataclasses import replace

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from haunted_house.core.findings import finding
from haunted_house.core.guardrail_events import Phase
from haunted_house.core.task_plan import parse_task_plan
from haunted_house.core.workflow import DoorStatus
from tests.room_ghost_runtime_support import (
    DESIGN,
    REQUIREMENTS,
    WORKSHOP_TASKS,
    MemoryWorld,
    chat_done,
    ready_result,
    sha256_text,
    spec_doc,
)

pytestmark = pytest.mark.core

TEXT = {Phase.REQUIREMENTS: REQUIREMENTS, Phase.DESIGN: DESIGN, Phase.TASKS: WORKSHOP_TASKS}
TASK_FILE = "src/guestbook/model.py"
TASK_TEXT = "class Entry: ...\n"

KINDS = st.sampled_from([Phase.REQUIREMENTS, Phase.DESIGN, Phase.TASKS, Phase.IMPLEMENTATION])
FAULTS = {
    "turn": ["other_scope", "never_acknowledged", "raw", "wrong_type", "continuing"],
    "result": ["prose", "prefixed", "other_run", "other_task", "blocked", "failed",
               "unknown_status", "extra_key", "duplicate_key", "oversized"],
    "artifact": ["wrong_path", "hash_mismatch", "missing", "none", "unrecorded_or_outside", "extra"],
    "upstream": ["changed_on_disk", "stale_start_hash"],
    "claim": ["none", "released", "other_claim"],
    "validator_ok": [False],
    "spec4_ok": [False],
}
VALID = {"turn": "acknowledged", "result": "valid", "artifact": "valid", "upstream": "valid",
         "claim": "held", "validator_ok": True, "spec4_ok": True}


@st.composite
def _cases(draw: st.DrawFn) -> dict:
    """No fault, exactly one fault, or an arbitrary mix of faults."""

    case = dict(VALID)
    mode = draw(st.sampled_from(["none", "one", "one", "one", "mixed"]))
    names = sorted(FAULTS)
    chosen = (
        [] if mode == "none"
        else [draw(st.sampled_from(names))] if mode == "one"
        else draw(st.lists(st.sampled_from(names), min_size=2, max_size=4, unique=True))
    )
    for name in chosen:
        case[name] = draw(st.sampled_from(FAULTS[name]))
    return case


def _final_text(run, fault: str, artifacts: dict[str, str]) -> str:
    good = ready_result(run, artifacts)
    if fault == "prose":
        return "The work is done."
    if fault == "prefixed":
        return "Result:\n" + good
    if fault == "other_run":
        return good.replace(f'"run_id":"{run.run_id}"', '"run_id":"elsewhere-9"')
    if fault == "other_task":
        other = '"task_id":"7.7"'
        return good.replace('"task_id":null', other).replace(f'"task_id":"{run.task_id}"', other)
    if fault in ("blocked", "failed"):
        return (
            good.replace('"status":"ready"', f'"status":"{fault}"')
            .replace('"reason_code":null', '"reason_code":"stuck"')
        )
    if fault == "unknown_status":
        return good.replace('"status":"ready"', '"status":"done"')
    if fault == "extra_key":
        return good[:-1] + ',"approved":true}'
    if fault == "duplicate_key":
        return good[:-1] + ',"status":"ready"}'
    if fault == "oversized":
        return good + " " * 70_000
    return good


async def _run(kind, turn_fault, result_fault, artifact_fault, upstream_fault, claim_fault,
               validator_ok, spec4_ok):
    world = MemoryWorld()
    # History up to the run under test, decided by the real Spec 4 machine.
    order = [Phase.REQUIREMENTS, Phase.DESIGN, Phase.TASKS, Phase.IMPLEMENTATION]
    for phase in order[: order.index(kind)]:
        await world.pass_phase(phase, TEXT[phase])
    upstream = {spec_doc(phase): sha256_text(TEXT[phase]) for phase in order[: order.index(kind)]}
    is_task = kind is Phase.IMPLEMENTATION
    run = await world.start(kind, ghost="tinker-1" if is_task else None)

    claim_ok = True
    if is_task:
        claim_id = "claim-" + "0" * 40
        if claim_fault != "none":
            held = await world.claims.acquire(run.scope, "1.1", (TASK_FILE,), 1)
            claim_id = held.claim.claim_id
            if claim_fault == "released":
                assert (await world.claims.release_provisional("demo-mansion", claim_id)).ok
            if claim_fault == "other_claim":
                claim_id = "claim-" + "f" * 40
        claim_ok = claim_fault == "held"
        run = replace(run, task_id="1.1", claim_id=claim_id)
        path, text = TASK_FILE, TASK_TEXT
        world.files[path] = text.encode()
    else:
        path, text = spec_doc(kind), TEXT[kind]
        await world.write_spec(run, text)

    # Upstream faults only exist when there is an upstream artifact.
    upstream_ok = True
    if upstream and upstream_fault == "changed_on_disk":
        first = spec_doc(Phase.REQUIREMENTS)
        world.files[first] = world.files[first] + b"\n"
        upstream_ok = False
    elif upstream and upstream_fault == "stale_start_hash":
        upstream[spec_doc(Phase.REQUIREMENTS)] = "0" * 64
        upstream_ok = False
    run = replace(run, upstream_hashes=upstream)

    # Artifact faults.
    artifacts = {path: text}
    artifact_ok = artifact_fault == "valid"
    if artifact_fault == "wrong_path":
        artifacts = {"notes/other.md": text}
        world.files["notes/other.md"] = text.encode()
    elif artifact_fault == "hash_mismatch":
        artifacts = {path: text + "drift"}
    elif artifact_fault == "missing":
        del world.files[path]
    elif artifact_fault == "none":
        artifacts = {}
    elif artifact_fault == "extra":
        artifacts = {path: text, "README.md": "extra"}
        world.files["README.md"] = b"extra"
    elif artifact_fault == "unrecorded_or_outside":
        if is_task:
            artifacts = {"src/guestbook/store.py": "x"}
            world.files["src/guestbook/store.py"] = b"x"
        else:
            # The file changed behind the house: its digest is not the recorded revision.
            world.files[path] = (text + "\nunrecorded\n").encode()
            artifacts = {path: text + "\nunrecorded\n"}

    world.findings = () if validator_ok else (finding("ears_missing", "Use one EARS pattern.", "criterion", 1),)
    world.refuse_output = None if spec4_ok else "invalid_state"

    # The turn end: always forwarded raw through Spec 2 ingest first.
    frame = chat_done(run.slot, continuing=turn_fault == "continuing")
    turn = (await world.ingest(frame)).events[0]
    if turn_fault == "other_scope":
        turn = replace(turn, scope=replace(turn.scope, session_slot="slot-elsewhere"))
    elif turn_fault == "never_acknowledged":
        turn = replace(turn, source=replace(turn.source, identity_parts=("gen-x", "9")))
    elif turn_fault == "raw":
        turn = frame
    elif turn_fault == "wrong_type":
        turn = next(event for event in world.memory.events if event.event_type == "run_started")

    before = await world.projection()
    plan_before = world.files.get(spec_doc(Phase.TASKS))
    outcome = await world.gate().settle_turn(run, turn, _final_text(run, result_fault, artifacts))
    after = await world.projection()

    conditions = [
        turn_fault == "acknowledged",
        result_fault == "valid",
        artifact_ok,
        upstream_ok,
        claim_ok,
        # The phase validator and Spec 4 submission judge spec phases; a task
        # is judged by its evidence and the plan writer.
        validator_ok or is_task,
        spec4_ok or is_task,
    ]
    return world, run, outcome, all(conditions), before, after, plan_before, turn_fault


@settings(max_examples=300)
@given(kind=KINDS, case=_cases())
def test_completion_requires_a_canonical_turn_end_and_a_valid_matching_artifact(kind, case) -> None:
    # Feature: room-ghosts, Property 6: Completion requires a canonical turn end and valid matching artifact
    turn, result, artifact, upstream, claim = (
        case["turn"], case["result"], case["artifact"], case["upstream"], case["claim"]
    )
    validator_ok, spec4_ok = case["validator_ok"], case["spec4_ok"]
    world, run, outcome, expected, before, after, plan_before, turn_fault = asyncio.run(
        _run(kind, turn, result, artifact, upstream, claim, validator_ok, spec4_ok)
    )
    terminals = [
        event for event in world.memory.events
        if event.scope == run.scope and event.event_type in ("run_completed", "run_failed", "run_blocked")
    ]
    completed = [event for event in terminals if event.event_type == "run_completed"]
    is_task = kind is Phase.IMPLEMENTATION

    assert (outcome.status == "completed") is expected
    assert len(completed) == (1 if expected else 0)
    assert len(terminals) <= 1

    if expected:
        assert outcome.event == completed[0] and outcome.event.source.origin == "house"
        if is_task:
            assert world.checkbox_writes == ["1.1"] and outcome.claim_released
            leaves = {leaf.task_id: leaf for leaf in parse_task_plan(
                world.files[spec_doc(Phase.TASKS)].decode()).leaves}
            assert leaves["1.1"].complete and not leaves["1.2"].complete
        else:
            view = after.phases[kind]
            assert view.door is DoorStatus.WAITING
            assert view.proposal.proposal_id == outcome.proposal_id
            assert view.proposal.artifact_revision.sha256 == sha256_text(TEXT[kind])
        # Validation and Spec 4 acceptance came first.
        assert world.validated_at and world.validated_at[-1] < completed[0].sequence
        return

    # Any failed check: the Door stays as it was and the task stays unchecked.
    assert after.phases == before.phases
    assert world.submissions == 3 if is_task else world.submissions == [
        Phase.REQUIREMENTS, Phase.DESIGN, Phase.TASKS].index(kind)
    assert world.checkbox_writes == []
    assert world.files.get(spec_doc(Phase.TASKS)) == plan_before
    if not is_task:
        assert after.phases[kind].door is DoorStatus.SEALED and after.phases[kind].proposal is None
    if turn_fault != "acknowledged":
        # Not a settlement at all: nothing terminal is recorded.
        assert outcome.status in ("rejected", "pending") and outcome.event is None and not terminals
    else:
        assert outcome.status in ("failed", "blocked")
        assert outcome.event == terminals[0]
        assert terminals[0].event_type == ("run_blocked" if outcome.status == "blocked" else "run_failed")
        # Model text never reaches the record.
        assert "The work is done" not in str(terminals[0].payload)
