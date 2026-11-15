"""Safety regression fixture (Doors and Guardrails task 16.3).

``fixtures/guardrails/safety-trace.events.jsonl`` is a scrubbed canonical
trace.  It is replayed through Spec 2 (parser, hash chain, selection) and
through the Spec 4 folds, and must keep proving three things: phase order,
exact approval before risky execution, and no project access outside
Effective_Room_Policy.  Removing the evidence a safety rule depends on must
make the fold refuse what followed.

Validates: Requirements 1.4, 1.7, 3.4, 3.7, 3.9, 5.3, 5.7, 10.4, 10.7.
"""

from __future__ import annotations

import asyncio
import re
import shutil
from pathlib import Path

from haunted_house.adapters.guardrail_port import GuardrailPort
from haunted_house.adapters.seance_log_store import SeanceLogStore
from haunted_house.core.action_descriptor import action_digest, parse_action_descriptor
from haunted_house.core.approvals import ProposalStatus
from haunted_house.core.guardrail_events import PHASES, select_domain_records
from haunted_house.core.path_policy import Access, parse_relative_path, policy_allows, room_policy
from haunted_house.core.seance_log_parser import parse_event_log
from haunted_house.core.workflow import DoorStatus, PhaseStatus, predecessor
from haunted_house.core.workflow_projector import (
    advance_projector,
    empty_projector,
    projection_summary,
    replay_projection,
)
from tests.guardrail_trace import FIXTURE, build_trace
from tests.workflow_support import MANSION, SPEC

ROLE_BY_GHOST = {"archivist": "archivist", "draughtsman": "draughtsman", "foreman": "foreman"}


def _events():
    parsed = parse_event_log(FIXTURE.read_bytes())
    assert parsed.diagnostics == ()
    return parsed.events


def _records(events=None):
    return select_domain_records(events if events is not None else _events()).records


def _role(ghost_id: str) -> str:
    return ROLE_BY_GHOST.get(ghost_id, "tinker")


def test_the_committed_trace_is_exactly_what_the_house_writes(tmp_path):
    assert asyncio.run(build_trace(tmp_path)) == FIXTURE.read_bytes()


def test_spec_2_accepts_the_trace_and_spec_4_replays_it_without_a_diagnostic(tmp_path):
    events = _events()
    assert [event.sequence for event in events] == list(range(1, len(events) + 1))

    # The real writer reads it back with an intact hash chain.
    log = tmp_path / "mansions" / MANSION / (".haunted-" + "house") / "seance"
    log.mkdir(parents=True)
    shutil.copyfile(FIXTURE, log / ("events.v1." + "jsonl"))
    read = asyncio.run(GuardrailPort(SeanceLogStore(tmp_path / "mansions")).read(MANSION))
    assert (read.status, read.integrity, read.highest_sequence) == ("ok", "valid", len(events))
    assert read.events == events

    projection = replay_projection(events)
    assert projection == read.projection
    assert projection.diagnostics == () and projection.ledger.diagnostics == ()
    assert [projection.phases[phase].door for phase in PHASES] == [DoorStatus.OPEN] * 4
    assert projection.waiting_count == 0 and projection.pending_writes == {}

    # Live folding record by record reaches the same state as the replay.
    state = empty_projector()
    for event in events:
        state = advance_projector(state, [event])
    assert projection_summary(state.projection) == projection_summary(projection)


def test_no_phase_was_active_behind_a_sealed_door():
    state = empty_projector()
    reservations = 0
    for event in _events():
        before = state.projection
        state = advance_projector(state, [event])
        after = state.projection
        for index, phase in enumerate(PHASES):
            was, now = before.phases[phase], after.phases[phase]
            if now.status is PhaseStatus.STARTING and was.status is not PhaseStatus.STARTING:
                reservations += 1
                # An explicit command, and every earlier Door already open.
                assert event.payload["kind"] == "phase_start_reserved"
                assert all(before.phases[earlier].door is DoorStatus.OPEN for earlier in PHASES[:index])
            if now.door is DoorStatus.OPEN and was.door is not DoorStatus.OPEN:
                assert event.payload["kind"] == "door_approved"
                follower = PHASES[index + 1] if index + 1 < len(PHASES) else None
                if follower is not None:
                    # The successor becomes ready and nothing more.
                    assert after.phases[follower].status is PhaseStatus.READY
    # Four phases, one of them restarted after a rejection.
    assert reservations == 5
    kinds = [record.kind.value for record in _records()]
    assert kinds.count("door_rejected") == 1 and kinds.count("door_approved") == 4


def test_every_risky_execution_followed_one_exact_approval():
    records = _records()
    proposed = {r.data["proposal_id"]: r for r in records if r.kind.value == "risky_action_proposed"}
    approved = {r.data["proposal_id"]: r for r in records if r.kind.value == "risky_action_approved"}
    consumed = [r for r in records if r.kind.value == "risky_action_consumed"]
    outcomes = [r for r in records if r.kind.value in ("risky_action_succeeded", "risky_action_failed")]
    assert len(proposed) == 3 and len(approved) == 2 and len(consumed) == 2 and len(outcomes) == 2

    for record in consumed:
        proposal_id = record.data["proposal_id"]
        proposal, approval = proposed[proposal_id], approved[proposal_id]
        descriptor = parse_action_descriptor(proposal.data["descriptor"])
        # The approval names the digest of exactly the action that was shown.
        assert action_digest(descriptor) == proposal.data["action_digest"] == approval.data["action_digest"]
        assert record.data["action_digest"] == approval.data["action_digest"]
        assert proposal.sequence < approval.sequence < record.sequence
        assert record.scope.session_slot == descriptor.session_slot == proposal.scope.session_slot
        settled = [o for o in outcomes if o.data["claim_id"] == record.data["claim_id"]]
        assert len(settled) == 1 and settled[0].sequence > record.sequence
    assert len({record.data["proposal_id"] for record in consumed}) == len(consumed)

    # Refused attempts are evidence, never executions.
    denied = sorted(r.data["code"] for r in records if r.kind.value == "risky_action_denied")
    assert denied == ["descriptor_mismatch", "proposal_consumed", "proposal_rejected"]
    statuses = sorted(item.status for item in replay_projection(_events()).risky_proposals.values())
    assert statuses == sorted([ProposalStatus.SUCCEEDED, ProposalStatus.FAILED, ProposalStatus.REJECTED])


def test_no_recorded_access_left_the_effective_room_policy():
    records = _records()
    denials = [r for r in records if r.kind.value == "path_denied"]
    assert len(denials) == 7
    assert {r.data["code"] for r in denials} == {"parent_segment", "protected_path", "room_policy"}
    for record in denials:
        policy = room_policy(_role(record.scope.ghost_id), SPEC)
        if record.data["path"] is None:
            continue  # a path that did not parse is never stored
        parts = parse_relative_path(record.data["path"])
        assert isinstance(parts, tuple)
        assert not policy_allows(policy, Access(record.data["access"]), parts)

    # Everything that was written, proposed for a Door, or executed is inside
    # the room of the Ghost that did it.
    for record in records:
        policy = room_policy(_role(record.scope.ghost_id), SPEC)
        kind, data = record.kind.value, record.data
        if kind in ("spec_write_prepared", "spec_document_written"):
            assert policy_allows(policy, Access.WRITE, parse_relative_path(data["document_path"]))
        elif kind == "phase_output_ready":
            assert policy_allows(policy, Access.READ, parse_relative_path(data["document_path"]))
        elif kind == "risky_action_proposed":
            descriptor = parse_action_descriptor(data["descriptor"])
            assert descriptor.mansion_id == MANSION and descriptor.room == policy.room
            for intent in descriptor.path_intents:
                assert policy_allows(policy, intent.access, parse_relative_path(intent.path))
    # No Ghost ever touched a path it had been denied.
    denied_paths = {(r.scope.ghost_id, r.data["path"]) for r in denials}
    touched = {
        (r.scope.ghost_id, r.data["document_path"]) for r in records
        if r.kind.value in ("spec_document_written", "phase_output_ready")
    }
    assert touched and not (denied_paths & touched)


def test_removing_the_evidence_a_rule_depends_on_makes_the_fold_refuse(tmp_path):
    events = list(_events())
    kinds = [event.payload.get("kind") for event in events]

    # Without the requirements approval, design could never have started.
    without_door = [event for index, event in enumerate(events) if index != kinds.index("door_approved")]
    projection = replay_projection(without_door)
    codes = {item.code for item in projection.diagnostics}
    assert "predecessor_door_sealed" in codes
    assert projection.phases[PHASES[1]].status is PhaseStatus.NOT_STARTED
    assert projection.phases[PHASES[3]].door is DoorStatus.SEALED
    assert predecessor(PHASES[1]) is PHASES[0]

    # Without the approval, the consumption is not authority and nothing ran.
    without_approval = [
        event for index, event in enumerate(events) if index != kinds.index("risky_action_approved")
    ]
    projection = replay_projection(without_approval)
    assert "not_approved" in {item.code for item in projection.ledger.diagnostics}
    assert ProposalStatus.PENDING in {item.status for item in projection.risky_proposals.values()}
    assert sum(
        1 for item in projection.risky_proposals.values() if item.status is ProposalStatus.SUCCEEDED
    ) == 0

    # A changed byte is Spec 2's finding, not Spec 4's.
    tampered = FIXTURE.read_bytes().replace(b'"cmd-trace-00001"', b'"cmd-trace-99999"', 1)
    log = tmp_path / "mansions" / MANSION / (".haunted-" + "house") / "seance"
    log.mkdir(parents=True)
    (log / ("events.v1." + "jsonl")).write_bytes(tampered)
    read = asyncio.run(GuardrailPort(SeanceLogStore(tmp_path / "mansions")).read(MANSION))
    assert read.integrity == "corrupt" and not read.writable


def test_the_trace_is_scrubbed():
    text = FIXTURE.read_text(encoding="utf-8")
    for needle in ("/Users/", "/home/", "/private/", "/var/folders", "~/", "token", "secret",
                   "password", "capability", "Synthetic", "First draft", "Second draft",
                   "x = 1", "y = 2", "EXAMPLE"):
        assert needle not in text, needle
    events = _events()
    assert {event.scope.mansion_id for event in events} == {MANSION}
    assert {event.scope.ghost_id for event in events} == {
        "house-operator", "archivist", "draughtsman", "foreman", "tinker-1"}
    # Only identifiers, enumerations, digests, counts, clean relative paths,
    # and structured descriptors: every string is short and plain.
    for record in _records(events):
        for value in _strings(record.data):
            assert len(value) <= 128 and re.fullmatch(r"[A-Za-z0-9._:/@-]*", value), value


def _strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from _strings(item)
    elif isinstance(value, (list, tuple)):
        for item in value:
            yield from _strings(item)


assert Path(FIXTURE).name.startswith("safety-trace")
