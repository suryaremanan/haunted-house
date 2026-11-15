"""Properties 3 and 4 for exact Door proposals and decisions.

Feature: doors-and-guardrails, Property 3: A Door decision applies only to the current artifact revision
Feature: doors-and-guardrails, Property 4: The first exact Door decision wins

Validates: Requirements 2.1–2.6, 6.6, 8.3, 8.5.
"""

from __future__ import annotations

import asyncio
from dataclasses import replace

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from haunted_house.core import guardrail_events as ge
from haunted_house.core.guardrail_events import PHASES, Phase
from haunted_house.core.workflow import (
    ArtifactRevision,
    DecideDoor,
    DoorStatus,
    PhaseStatus,
    SupersedeDoor,
    decide_transition,
    fold_workflow,
)
from tests.guardrail_support import (
    OPERATOR,
    SESSION_SCOPE,
    SHAS,
    MemoryWriter,
    MANSION,
    WorkflowDriver,
    other_event,
    output_path,
)

pytestmark = pytest.mark.core

_MUTATIONS = ("proposal_id", "phase", "document_path", "revision", "sha256", "size_bytes", "version")


def _waiting_at(target: Phase, revision_sha: int, noise: int) -> WorkflowDriver:
    """Drive a fresh workflow until ``target`` has one pending Door_Proposal."""

    driver = WorkflowDriver()
    for phase in PHASES[: PHASES.index(target) + 1]:
        assert driver.run(driver.command("start", phase, 0)).ok
        assert driver.run(driver.command("confirm", phase, 0)).ok
        if phase is target:
            for index in range(noise):
                driver.append(other_event(f"noise-{index}"))
        assert driver.run(driver.command("submit", phase, revision_sha)).ok
        if phase is not target:
            assert driver.run(driver.command("approve", phase, 0)).ok
    return driver


def _exact(driver: WorkflowDriver, phase: Phase, approve: bool, command_id: str) -> DecideDoor:
    proposal = driver.projection.phases[phase].proposal
    return DecideDoor(
        OPERATOR, proposal.proposal_id, phase, proposal.document_path,
        proposal.artifact_revision, driver.projection.version, approve, "operator", command_id,
    )


def _mutate(decision: DecideDoor, field: str, salt: int) -> DecideDoor:
    artifact = decision.artifact_revision
    if field == "proposal_id":
        return replace(decision, proposal_id=f"{decision.proposal_id}-x{salt}")
    if field == "phase":
        others = [phase for phase in PHASES if phase is not decision.phase]
        return replace(decision, phase=others[salt % len(others)])
    if field == "document_path":
        others = [output_path(phase) for phase in PHASES if output_path(phase) != decision.document_path]
        return replace(decision, document_path=others[salt % len(others)])
    if field == "revision":
        return replace(decision, artifact_revision=replace(artifact, revision=artifact.revision + 1 + salt))
    if field == "sha256":
        others = [sha for sha in SHAS if sha != artifact.sha256]
        return replace(decision, artifact_revision=replace(artifact, sha256=others[salt % len(others)]))
    if field == "size_bytes":
        return replace(decision, artifact_revision=replace(artifact, size_bytes=artifact.size_bytes + 1 + salt))
    return replace(decision, expected_version=decision.expected_version + (1 + salt) * (-1 if salt % 2 else 1))


@settings(max_examples=150)
@given(
    target=st.sampled_from(PHASES),
    variant=st.sampled_from([0, 1, 2, 4, 5]),
    noise=st.integers(min_value=0, max_value=3),
    approve=st.booleans(),
    mutations=st.sets(st.sampled_from(_MUTATIONS), max_size=4),
    salt=st.integers(min_value=0, max_value=4),
    change_document=st.booleans(),
)
def test_a_door_decision_applies_only_to_the_current_artifact_revision(
    target, variant, noise, approve, mutations, salt, change_document
):
    driver = _waiting_at(target, variant, noise)
    view = driver.projection.phases[target]
    proposal = view.proposal
    # Exactly one proposal, bound to phase, path, revision, and identifier.
    assert proposal.status == "pending" and proposal.phase is target
    assert proposal.document_path == output_path(target)
    assert driver.projection.waiting_count == 1

    decision = _exact(driver, target, approve, "cmd-decide")
    for field in sorted(mutations):
        decision = _mutate(decision, field, salt)

    before = driver.projection
    result = decide_transition(before, decision)
    if mutations:
        assert not result.ok and result.candidates == ()
        assert result.expected_sequence is None
    else:
        assert result.ok and len(result.candidates) == 1
        assert result.expected_sequence == before.version

    # Even if a stale decision record reached the log, the fold ignores it.
    if mutations and mutations != {"version"} and "phase" not in mutations:
        builder = ge.door_approved if approve else ge.door_rejected
        stale = builder(
            OPERATOR, phase=target, proposal_id=decision.proposal_id,
            document_path=decision.document_path, revision=decision.artifact_revision.revision,
            sha256=decision.artifact_revision.sha256,
            size_bytes=decision.artifact_revision.size_bytes, actor="operator", command_id="cmd-stale",
        )
        driver.append(stale)
        assert driver.projection.phases == before.phases
        assert driver.projection.diagnostics[-1].kind == stale.payload["kind"]

    if change_document and target is not Phase.IMPLEMENTATION:
        # Changing the artifact never approves the old bytes: the pending
        # proposal must be superseded and a new revision proposed.
        path = proposal.document_path
        new = ArtifactRevision(1, [s for s in SHAS if s != proposal.artifact_revision.sha256][0], 3)
        driver.append(
            ge.spec_write_prepared(
                SESSION_SCOPE, write_id="w-1", phase=target, document_path=path,
                base_revision=0, base_sha256=None, revision=1, sha256=new.sha256, size_bytes=3),
            ge.spec_document_written(
                SESSION_SCOPE, write_id="w-1", phase=target, document_path=path,
                revision=1, sha256=new.sha256, size_bytes=3),
        )
        again = _exact(driver, target, True, "cmd-after-edit")
        refused = decide_transition(driver.projection, again)
        assert (refused.ok, refused.code) == (False, "artifact_changed")
        assert driver.projection.phases[target].door is DoorStatus.WAITING
        assert driver.run(SupersedeDoor(SESSION_SCOPE, target)).ok
        superseded = driver.projection.phases[target]
        assert superseded.proposal.status == "superseded"
        assert (superseded.status, superseded.door) == (PhaseStatus.WORKING, DoorStatus.SEALED)
        assert decide_transition(
            driver.projection, replace(again, expected_version=driver.projection.version)
        ).code == "no_pending_proposal"
        return

    if not mutations:
        driver.append(*result.candidates)
        decided = driver.projection.phases[target]
        assert decided.door is (DoorStatus.OPEN if approve else DoorStatus.REJECTED)
        assert decided.proposal.status == ("approved" if approve else "rejected")
        assert decided.proposal.artifact_revision == proposal.artifact_revision
    assert fold_workflow(driver.events) == driver.projection


@settings(max_examples=150)
@given(
    target=st.sampled_from(PHASES),
    choices=st.lists(st.booleans(), min_size=2, max_size=6),
    order=st.randoms(use_true_random=False),
    late_refresh=st.booleans(),
)
def test_the_first_exact_door_decision_wins(target, choices, order, late_refresh):
    driver = _waiting_at(target, 1, 0)
    writer = MemoryWriter()
    writer.events.extend(driver.events)
    expected = driver.projection.version

    # Every decider saw the same projection and decided an exact decision.
    decisions = []
    for index, approve in enumerate(choices):
        result = decide_transition(
            driver.projection, _exact(driver, target, approve, f"cmd-race-{index}")
        )
        assert result.ok and result.expected_sequence == expected
        decisions.append((approve, result))
    order.shuffle(decisions)

    async def race():
        return [
            (approve, await writer.compare_and_append(MANSION, result.expected_sequence, result.candidates))
            for approve, result in decisions
        ]

    outcomes = asyncio.run(race())
    winners = [(approve, ack) for approve, ack in outcomes if ack.status == "ok"]
    assert len(winners) == 1
    assert all(ack.status == "conflict" and ack.events == () for _, ack in outcomes[1:])
    won, acknowledgement = winners[0]
    assert winners[0] == outcomes[0]
    assert len(writer.events) == expected + 1

    folded = fold_workflow(writer.events)
    view = folded.phases[target]
    assert view.door is (DoorStatus.OPEN if won else DoorStatus.REJECTED)
    assert view.proposal.decision_event_id == acknowledgement.events[0].event_id
    assert folded.diagnostics == ()

    if late_refresh:
        # A loser that refreshes and re-decides is refused before the writer.
        retry = _exact(driver, target, not won, "cmd-late")
        retry = replace(retry, expected_version=folded.version)
        refused = decide_transition(folded, retry)
        assert (refused.ok, refused.candidates) == (False, ())
        assert refused.code == "no_pending_proposal"
