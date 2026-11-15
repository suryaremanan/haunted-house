"""Property 15 for the Spec 4 projections.

Feature: doors-and-guardrails, Property 15: Spec 4 live and replay projections agree

For any valid selected canonical history, incremental Spec 4 folding and a
fresh fold over the same Sequence-ordered domain records produce equal Phase,
Door, Waiting_State, proposal, approval, consumption, and outcome projections.

Validates: Requirements 10.4, 10.5, 10.6.
"""

from __future__ import annotations

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from haunted_house.core import guardrail_events as ge
from haunted_house.core.approvals import ExecutionRequest, decide_consumption
from haunted_house.core.ghost_state import select_events
from haunted_house.core.guardrail_events import PHASES, Phase
from haunted_house.core.seance_event import AppEventCandidate, EventSource
from haunted_house.core.seance_persistence import prepare_candidates
from haunted_house.core.workflow import fold_workflow, observe_sequence
from haunted_house.core.workflow_dto import workflow_projection_to_json
from haunted_house.core.workflow_projector import (
    advance_projector,
    empty_projector,
    projection_summary,
    replay_projection,
)
from tests.guardrail_support import (
    ALLOWED,
    MANSION,
    OPERATOR,
    SESSION_SCOPE,
    WORKFLOW_ACTIONS,
    WorkflowDriver,
    command_descriptor,
    delete_descriptor,
    foreign_domain_event,
    git_descriptor,
    natural_step,
    other_event,
    parsed,
)

pytestmark = pytest.mark.core

_DESCRIPTORS = (delete_descriptor, command_descriptor, git_descriptor)
_STEP = st.tuples(
    st.sampled_from(
        ["advance"] * 6
        + ["command", "command", "raw", "other", "foreign"]
        + ["propose", "propose", "decide", "decide", "consume", "outcome", "supersede"]
        + ["crew_ask", "crew_ask", "crew_answer", "crew_variant"]
    ),
    st.sampled_from(WORKFLOW_ACTIONS),
    st.sampled_from(PHASES),
    st.integers(min_value=0, max_value=7),
)
_STEPS = st.lists(_STEP, min_size=1, max_size=60)


def _crew_approval(event_type: str, mid: str, revision: int, outcome: str | None = None):
    payload = {"mid": mid} if outcome is None else {"mid": mid, "outcome": outcome}
    return AppEventCandidate(
        schema_version=1,
        event_type=event_type,  # type: ignore[arg-type]
        scope=SESSION_SCOPE,
        source=EventSource(
            origin="crew",
            source_type="crew_approval",
            identity_parts=(mid,),
            revision=revision,
            generation="",
            source_sequence=0,
        ),
        caused_by=(),
        occurred_at_ms=None,
        payload=payload,
    )


def _history(steps):
    """Build one acknowledged canonical history through the pure machines."""

    driver = WorkflowDriver()
    proposals: list[str] = []
    # A writer acknowledges an exact retry without a second record.
    recorded: set[str] = set()
    revisions = iter(range(2, 10_000))

    def add(candidate) -> None:
        record_id = prepare_candidates((candidate,)).candidates[0].record_id
        if record_id not in recorded:
            recorded.add(record_id)
            driver.append(candidate)

    for mode, action, phase, variant in steps:
        ledger = driver.projection.ledger
        target = proposals[variant % len(proposals)] if proposals else "act-none"
        known = ledger.proposals.get(target)
        if mode == "advance":
            action, phase = natural_step(driver, variant)
            driver.run(driver.command(action, phase, 2))
        elif mode == "command":
            driver.run(driver.command(action, phase, variant))
        elif mode == "raw":
            add(driver.raw(action, phase, variant))
        elif mode == "other":
            add(other_event(driver.new_id("chat")))
        elif mode == "foreign":
            add(foreign_domain_event(driver.new_id("foreign")))
        elif mode == "propose":
            proposal_id = driver.new_id("act")
            raw = _DESCRIPTORS[variant % 3]()
            add(
                ge.risky_action_proposed(SESSION_SCOPE, proposal_id=proposal_id, descriptor=parsed(raw))
            )
            proposals.append(proposal_id)
        elif known is None and mode in ("decide", "consume", "outcome", "supersede"):
            continue
        elif mode == "decide":
            builder = ge.risky_action_approved if variant % 3 else ge.risky_action_rejected
            add(
                builder(
                    OPERATOR, proposal_id=target, action_digest=known.action_digest,
                    actor="operator" if variant % 2 else "crew", command_id=driver.new_id("cmd"),
                    crew_slot=SESSION_SCOPE.session_slot if variant % 2 == 0 else None,
                    crew_mid=f"mid-{variant}" if variant % 2 == 0 else None,
                )
            )
        elif mode == "consume":
            decision = decide_consumption(
                ledger,
                ExecutionRequest(
                    target, known.descriptor, SESSION_SCOPE, "workshop", driver.new_id("claim"),
                    tuple(ALLOWED for _ in known.descriptor.path_intents), True,
                ),
            )
            # An unauthorized claim leaves only denial evidence; both are valid records.
            add(decision.candidate or decision.denial)
        elif mode == "outcome":
            builder = ge.risky_action_succeeded if variant % 2 else ge.risky_action_failed
            add(
                builder(
                    SESSION_SCOPE, proposal_id=target, action_digest=known.action_digest,
                    claim_id=known.claim_id or "claim-none", code="exited" if variant % 2 else "nonzero_exit",
                    exit_code=variant % 3, output_bytes=variant,
                )
            )
        elif mode == "supersede":
            add(
                ge.risky_action_superseded(
                    SESSION_SCOPE, proposal_id=target, action_digest=known.action_digest, code="replaced")
            )
        elif mode == "crew_ask":
            add(_crew_approval("approval_requested", f"mid-{variant}", 1))
        elif mode == "crew_variant":
            # A later revision of the same Crew fact: Spec 2 selects one variant.
            add(_crew_approval("approval_requested", f"mid-{variant}", next(revisions)))
        elif mode == "crew_answer":
            add(
                _crew_approval("approval_decided", f"mid-{variant}", 1, "approved" if variant % 2 else "rejected")
            )
    return driver


@settings(max_examples=200)
@given(steps=_STEPS, cuts=st.lists(st.integers(min_value=0, max_value=80), max_size=12), data=st.data())
def test_spec_4_live_and_replay_projections_agree(steps, cuts, data):
    driver = _history(steps)
    events = tuple(driver.events)
    replayed = replay_projection(events)
    # Replay is a pure function of the selected records.
    assert replayed == replay_projection(reversed(events))
    assert replayed == observe_sequence(fold_workflow(select_events(events).events), len(events))

    # Live: the same records arrive in arbitrary acknowledged batches.
    boundaries = sorted({min(cut, len(events)) for cut in cuts} | {len(events)})
    state = empty_projector()
    start = 0
    for end in boundaries:
        batch = list(events[start:end])
        if batch and data.draw(st.booleans(), label="redeliver"):
            batch = [*events[max(0, start - 2):start], *batch]  # an exact re-delivery
        state = advance_projector(state, batch)
        prefix = replay_projection(events[:end])
        assert state.projection == prefix
        assert projection_summary(state.projection) == projection_summary(prefix)
        assert state.version == (events[end - 1].sequence if end else 0)
        start = end

    live = state.projection
    assert live == replayed
    assert projection_summary(live) == projection_summary(replayed)
    # The wire form the dashboard and the replay page parse is equal too.
    selected = select_events(events).events
    assert workflow_projection_to_json(live, mansion_id=MANSION, events=state.events) == (
        workflow_projection_to_json(replayed, mansion_id=MANSION, events=selected)
    )
    # Projection_Version is the highest canonical Sequence, whatever the domain.
    assert live.version == len(events)
    summary = projection_summary(live)
    assert summary["waiting_count"] == (
        sum(1 for phase in summary["phases"] if phase["proposal"] and phase["proposal"]["status"] == "pending")
        + sum(1 for proposal in summary["risky_proposals"] if proposal["status"] == "pending")
        + len(summary["pending_permissions"])
    )
    for proposal in summary["risky_proposals"]:
        # Consumption and outcome are reproduced exactly, never inferred.
        assert proposal["consumed"] == (proposal["consumed_sequence"] is not None)
        if proposal["outcome"] is not None:
            assert proposal["consumed"] and proposal["claim_id"] is not None


@settings(max_examples=100)
@given(steps=_STEPS, keep=st.integers(min_value=0, max_value=60))
def test_a_valid_prefix_and_its_integrity_verdict_are_carried_not_recomputed(steps, keep):
    events = tuple(_history(steps).events)
    prefix = events[: min(keep, len(events))]
    for integrity in ("corrupt", "uncertain"):
        replayed = replay_projection(prefix, integrity=integrity)
        live = advance_projector(empty_projector(), prefix, integrity=integrity).projection
        assert live == replayed and replayed.integrity == integrity
        # Only the authoritative prefix was folded.
        assert replayed.version == (prefix[-1].sequence if prefix else 0)
        valid = replay_projection(prefix)
        expected = projection_summary(valid) | {"integrity": integrity}
        assert projection_summary(replayed) == expected


def test_a_phase_walk_replays_to_the_same_doors():
    driver = WorkflowDriver()
    for _ in range(40):
        action, phase = natural_step(driver, 2)
        driver.run(driver.command(action, phase, 2))
    state = empty_projector()
    for event in driver.events:
        state = advance_projector(state, [event])
    summary = projection_summary(state.projection)
    assert summary == projection_summary(replay_projection(driver.events))
    assert [phase["door"] for phase in summary["phases"]] == ["open"] * 4
    assert state.projection.phases[Phase.IMPLEMENTATION].proposal.decision_actor == "operator"
