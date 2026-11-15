"""Unit tests for Action_Descriptor canonicalization and the Approval_Ledger
(tasks 4.1, 4.3).

Validates: Requirements 3.1–3.9, 4.1, 4.2, 4.5, 4.6, 6.8, 9.3, 9.4, 11.5, 11.6.
"""

from __future__ import annotations

import ast
import copy
import inspect
import json
from dataclasses import replace

import pytest

from haunted_house.core import action_descriptor, approvals
from haunted_house.core import guardrail_events as ge
from haunted_house.core.action_descriptor import ActionError, ActionErrorCode
from haunted_house.core.approvals import (
    EXECUTION_TOOL,
    ExecutionRequest,
    PendingPermission,
    ProposalStatus,
    RiskyDecisionRequest,
    action_digest,
    advance_ledger,
    authorize_execution,
    build_outcome_candidate,
    canonical_action,
    correlate_permission,
    decide_consumption,
    decide_external_resolution,
    decide_risky_decision,
    empty_ledger,
    fold_approval_ledger,
    parse_action_descriptor,
    parse_canonical_action,
    permission_for_proposal,
)
from haunted_house.core.seance_persistence import prepare_candidates
from tests.guardrail_support import (
    ALLOWED,
    DENIED,
    MANSION,
    OPERATOR,
    SESSION_SCOPE,
    SHA_B,
    acknowledge,
    command_descriptor,
    delete_descriptor,
    git_descriptor,
    other_event,
    parsed,
)

pytestmark = pytest.mark.core


class Ledger:
    def __init__(self) -> None:
        self.events: list = []
        self.ledger = empty_ledger()

    def append(self, *candidates):
        new = acknowledge(candidates, start=len(self.events) + 1)
        self.events.extend(new)
        self.ledger = advance_ledger(self.ledger, new)
        return new

    def propose(self, proposal_id="act-1", raw=None, scope=SESSION_SCOPE):
        descriptor = parsed(raw or delete_descriptor())
        self.append(ge.risky_action_proposed(scope, proposal_id=proposal_id, descriptor=descriptor))
        return descriptor

    def decide(self, proposal_id="act-1", approve=True, command_id="cmd-1", **overrides):
        proposal = self.ledger.proposals[proposal_id]
        fields = dict(
            proposal_id=proposal_id,
            action_digest=proposal.action_digest,
            expected_version=self.ledger.projection_version,
            approve=approve,
            actor="operator",
            command_id=command_id,
            scope=OPERATOR,
        )
        fields.update(overrides)
        result = decide_risky_decision(self.ledger, RiskyDecisionRequest(**fields))
        if result.ok:
            self.append(result.candidate)
        return result

    def request(self, proposal_id="act-1", raw=None, claim_id="claim-1", **overrides):
        fields = dict(
            proposal_id=proposal_id,
            descriptor=raw or delete_descriptor(),
            scope=SESSION_SCOPE,
            room="workshop",
            claim_id=claim_id,
            path_decisions=(ALLOWED,),
            confinement_available=True,
        )
        fields.update(overrides)
        return ExecutionRequest(**fields)


# --- canonicalization ------------------------------------------------------------


@pytest.mark.parametrize("raw", [delete_descriptor(), command_descriptor(), git_descriptor(),
                                 git_descriptor("commit", ("src/app.py", "docs/a.md")),
                                 git_descriptor("commit", ())])
def test_canonical_bytes_are_stable_sorted_and_round_trip(raw):
    descriptor = parsed(raw)
    data = canonical_action(descriptor)
    assert data == json.dumps(
        json.loads(data), sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode()
    assert parse_canonical_action(data) == descriptor
    assert len(action_digest(descriptor)) == 64
    reordered = dict(reversed(list(raw.items())))
    reordered["path_intents"] = list(reversed(raw["path_intents"]))
    assert canonical_action(parsed(reordered)) == data
    spaced = json.dumps(json.loads(data), indent=1).encode()
    assert parse_canonical_action(spaced) == ActionError(ActionErrorCode.NOT_CANONICAL, "$")


@pytest.mark.parametrize(
    ("mutate", "code"),
    [
        (lambda d: d.update(arguments={"command": "rm -rf build"}), "unknown_field"),
        (lambda d: d.update(arguments={"argv": "pytest -q", "timeout_seconds": 5}), "invalid_type"),
        (lambda d: d["arguments"].update(env={"PATH": "/tmp"}), "unknown_field"),
        (lambda d: d.update(environment={"A": "b"}), "unknown_field"),
        (lambda d: d["arguments"].update(timeout_seconds=1.5), "float_not_allowed"),
        (lambda d: d["arguments"].update(timeout_seconds=True), "invalid_type"),
        (lambda d: d["arguments"].update(timeout_seconds=0), "invalid_value"),
        (lambda d: d["arguments"].update(argv=[]), "invalid_value"),
        (lambda d: d["arguments"].update(argv=["echo", "a\nb"]), "not_displayable"),
        (lambda d: d["arguments"].update(argv=["echo", "a\x1b[31m"]), "not_displayable"),
        (lambda d: d["arguments"].update(argv=["echo", "café"]), "not_displayable"),
        (lambda d: d["arguments"].update(argv=["echo", "‮gnp.exe"]), "not_displayable"),
        (lambda d: d["arguments"].update(argv=["cat", "/Users/somebody/notes"]), "not_displayable"),
        (lambda d: d["arguments"].update(argv=["echo", "x" * 5000]), "too_large"),
        (lambda d: d.update(kind="shell"), "unsupported_action"),
        (lambda d: d.update(schema_version=2), "unsupported_schema"),
        (lambda d: d.update(mansion_id="Not Kebab"), "invalid_value"),
        (lambda d: d.update(room="attic"), "invalid_value"),
        (lambda d: d.update(working_directory="../outside"), "invalid_path"),
        (lambda d: d.update(working_directory="/tmp"), "invalid_path"),
        (lambda d: d["path_intents"].append({"access": "delete", "path": "src"}), "intent_mismatch"),
        (lambda d: d["path_intents"].append({"access": "command_read", "path": "../x"}), "invalid_path"),
        (lambda d: d["path_intents"].append(d["path_intents"][0]), "invalid_value"),
        (lambda d: d.pop("path_intents"), "missing_field"),
    ],
)
def test_unsafe_or_undisplayable_descriptors_are_refused(mutate, code):
    raw = copy.deepcopy(command_descriptor())
    mutate(raw)
    result = parse_action_descriptor(raw)
    assert isinstance(result, ActionError) and result.code == code
    assert set(ActionError.__dataclass_fields__) == {"code", "field"}


def test_delete_and_git_intents_must_equal_their_arguments():
    for raw in (
        delete_descriptor(path_intents=[]),
        delete_descriptor(path_intents=[{"access": "delete", "path": "src/other.py"}]),
        delete_descriptor(working_directory="src"),
        delete_descriptor(arguments={"path": "src/old.py", "target": "tree"}),
        delete_descriptor(arguments={"path": "src/old.py", "target": "file", "recursive": True}),
        git_descriptor(path_intents=[]),
        git_descriptor("push"),
        git_descriptor("reset"),
        git_descriptor("add", ()),
        {**git_descriptor("commit"), "arguments": {"operation": "commit", "pathspecs": []}},
    ):
        assert isinstance(parse_action_descriptor(raw), ActionError), raw
    hand_built = replace(parsed(delete_descriptor()), kind="shell")
    with pytest.raises(Exception):
        canonical_action(hand_built)


# --- ledger fold -------------------------------------------------------------------


def test_the_full_lifecycle_of_one_risky_action():
    book = Ledger()
    descriptor = book.propose()
    proposal = book.ledger.proposals["act-1"]
    assert (proposal.status, proposal.displayable) == (ProposalStatus.PENDING, True)
    assert proposal.action_digest == action_digest(descriptor)
    assert authorize_execution(book.ledger, book.request()) == "proposal_pending"

    approved = book.decide()
    assert approved.ok and approved.expected_sequence == 1
    assert book.ledger.proposals["act-1"].status is ProposalStatus.APPROVED
    decision = book.ledger.decisions_by_command["cmd-1"]
    assert (decision.outcome, decision.actor, decision.sequence) == ("approved", "operator", 2)
    assert decision.event_id == book.events[-1].event_id

    consume = decide_consumption(book.ledger, book.request())
    assert consume.allowed and consume.expected_sequence == 2 and consume.denial is None
    assert build_outcome_candidate(
        book.ledger, scope=SESSION_SCOPE, proposal_id="act-1", claim_id="claim-1",
        succeeded=True, code="done") is None
    book.append(consume.candidate)
    consumed = book.ledger.proposals["act-1"]
    assert (consumed.status, consumed.claim_id, consumed.consumed_sequence) == (
        ProposalStatus.CONSUMED, "claim-1", 3)

    again = decide_consumption(book.ledger, book.request(claim_id="claim-2"))
    assert (again.allowed, again.code, again.candidate) == (False, "proposal_consumed", None)
    assert again.denial.payload["kind"] == "risky_action_denied"

    assert build_outcome_candidate(
        book.ledger, scope=SESSION_SCOPE, proposal_id="act-1", claim_id="claim-2",
        succeeded=True, code="done") is None
    failed = build_outcome_candidate(
        book.ledger, scope=SESSION_SCOPE, proposal_id="act-1", claim_id="claim-1",
        succeeded=False, code="exit_nonzero", exit_code=2, output_bytes=40)
    book.append(failed)
    assert book.ledger.proposals["act-1"].status is ProposalStatus.FAILED
    assert book.ledger.proposals["act-1"].outcome_code == "exit_nonzero"
    # A failure never restores the approval; a retry needs a new proposal.
    assert authorize_execution(book.ledger, book.request(claim_id="claim-3")) == "proposal_consumed"
    assert book.ledger.diagnostics == ()
    assert fold_approval_ledger(book.events) == book.ledger
    assert fold_approval_ledger(reversed(book.events)) == book.ledger
    assert book.ledger.projection_version == len(book.events)


@pytest.mark.parametrize(
    ("overrides", "code"),
    [
        ({"proposal_id": "act-9"}, "proposal_missing"),
        ({"action_digest": SHA_B}, "stale_digest"),
        ({"expected_version": 0}, "stale_version"),
        ({"expected_version": 7}, "stale_version"),
        ({"actor": "ghost"}, "invalid_request"),
        ({"command_id": "bad id"}, "invalid_request"),
        ({"approve": "yes"}, "invalid_request"),
    ],
)
def test_a_risky_decision_must_be_exact(overrides, code):
    book = Ledger()
    book.propose()
    before = book.ledger
    request = dict(
        proposal_id="act-1", action_digest=before.proposals["act-1"].action_digest,
        expected_version=1, approve=True, actor="operator", command_id="cmd-1", scope=OPERATOR)
    request.update(overrides)
    result = decide_risky_decision(before, RiskyDecisionRequest(**request))
    assert (result.ok, result.code, result.candidate) == (False, code, None)


def test_decisions_are_first_wins_and_idempotent_by_command():
    book = Ledger()
    book.propose()
    assert book.decide(approve=False).ok
    assert book.ledger.proposals["act-1"].status is ProposalStatus.REJECTED
    assert authorize_execution(book.ledger, book.request()) == "proposal_rejected"
    duplicate = book.decide(approve=False)
    assert duplicate.code == "duplicate_command"
    assert duplicate.duplicate_of == book.ledger.decisions_by_command["cmd-1"]
    assert book.decide(approve=True).code == "command_conflict"
    assert book.decide(approve=True, command_id="cmd-2").code == "already_decided"

    # A competing decision that somehow reached the log changes nothing.
    late = ge.risky_action_approved(
        OPERATOR, proposal_id="act-1", action_digest=book.ledger.proposals["act-1"].action_digest,
        actor="operator", command_id="cmd-3")
    book.append(late)
    assert book.ledger.proposals["act-1"].status is ProposalStatus.REJECTED
    assert [d.code for d in book.ledger.diagnostics] == ["already_decided"]


def test_execution_requires_the_exact_approved_action_identity_paths_and_confinement():
    book = Ledger()
    book.propose(raw=command_descriptor())
    book.decide()
    good = dict(raw=command_descriptor(), path_decisions=(ALLOWED, ALLOWED))
    assert authorize_execution(book.ledger, book.request(**good)) == "ok"

    other_scope = replace(SESSION_SCOPE, session_slot="workshop-slot-2")
    other_mansion = replace(SESSION_SCOPE, mansion_id="other-mansion")
    cases = {
        "descriptor_mismatch": [
            dict(good, raw=command_descriptor(("pytest", "-x"))),
            dict(good, raw=command_descriptor(working_directory="src")),
            dict(good, raw=command_descriptor(path_intents=[{"access": "command_read", "path": "tests"}])),
            dict(good, raw=command_descriptor(session_slot="workshop-slot-2"), scope=other_scope),
        ],
        "invalid_descriptor": [dict(good, raw={"command": "pytest -q"}), dict(good, raw="pytest -q")],
        "identity_mismatch": [
            dict(good, scope=other_scope),
            dict(good, scope=other_mansion),
            dict(good, room="study"),
            dict(good, scope="scope"),
        ],
        "path_denied": [
            dict(good, path_decisions=(ALLOWED, DENIED)),
            dict(good, path_decisions=(ALLOWED,)),
            dict(good, path_decisions=()),
            dict(good, path_decisions=(ALLOWED, True)),
        ],
        "confinement_unavailable": [dict(good, confinement_available=False)],
        "invalid_request": [dict(good, claim_id="bad claim"), dict(good, proposal_id="")],
        "proposal_missing": [dict(good, proposal_id="act-2")],
    }
    for code, requests in cases.items():
        for request in requests:
            decision = decide_consumption(book.ledger, book.request(**request))
            assert (decision.allowed, decision.code, decision.candidate) == (False, code, None), request
            assert decision.expected_sequence is None
    # None of the refused attempts changed the approval.
    assert book.ledger.proposals["act-1"].status is ProposalStatus.APPROVED

    # Guarded delete needs no process confinement.
    book.propose("act-del")
    book.decide("act-del", command_id="cmd-del")
    assert authorize_execution(
        book.ledger, book.request("act-del", confinement_available=False)) == "ok"


def test_superseded_and_blocked_proposals_never_authorize():
    book = Ledger()
    book.propose()
    book.decide()
    digest = book.ledger.proposals["act-1"].action_digest
    book.append(ge.risky_action_superseded(SESSION_SCOPE, proposal_id="act-1", action_digest=digest, code="replaced"))
    assert authorize_execution(book.ledger, book.request()) == "proposal_superseded"

    # A descriptor altered after the builder (as Spec 2 redaction would) no
    # longer matches its digest: the proposal is visible but blocked.
    candidate = ge.risky_action_proposed(
        SESSION_SCOPE, proposal_id="act-2", descriptor=parsed(command_descriptor(("echo", "value"))))
    payload = copy.deepcopy(candidate.payload)
    payload["data"]["descriptor"]["arguments"]["argv"][1] = "[redacted]"
    book.append(replace(candidate, payload=payload))
    blocked = book.ledger.proposals["act-2"]
    assert (blocked.status, blocked.displayable, blocked.descriptor) == (ProposalStatus.PENDING, False, None)
    assert book.decide("act-2", command_id="cmd-2").code == "proposal_blocked"
    assert book.decide("act-2", approve=False, command_id="cmd-3").ok

    # A proposal recorded under another session's scope is blocked too.
    foreign = replace(SESSION_SCOPE, session_slot="study-slot")
    book.propose("act-3", scope=foreign)
    assert not book.ledger.proposals["act-3"].displayable
    book.append(ge.risky_action_approved(
        OPERATOR, proposal_id="act-3", action_digest=book.ledger.proposals["act-3"].action_digest,
        actor="operator", command_id="cmd-4"))
    assert book.ledger.diagnostics[-1].code == "proposal_blocked"
    assert authorize_execution(book.ledger, book.request("act-3")) == "proposal_blocked"


def test_invalid_ledger_records_are_diagnosed_and_change_nothing():
    book = Ledger()
    book.propose()
    digest = book.ledger.proposals["act-1"].action_digest
    before = book.ledger.proposals
    book.append(
        ge.risky_action_proposed(SESSION_SCOPE, proposal_id="act-1", descriptor=parsed(command_descriptor())),
        ge.risky_action_consumed(SESSION_SCOPE, proposal_id="act-1", action_digest=digest,
                                 claim_id="c1", session_slot=SESSION_SCOPE.session_slot),
        ge.risky_action_succeeded(SESSION_SCOPE, proposal_id="act-1", action_digest=digest,
                                  claim_id="c1", code="done"),
        ge.risky_action_approved(OPERATOR, proposal_id="act-1", action_digest=SHA_B,
                                 actor="operator", command_id="cmd-x"),
        ge.risky_action_approved(OPERATOR, proposal_id="act-404", action_digest=digest,
                                 actor="operator", command_id="cmd-y"),
        ge.risky_action_denied(SESSION_SCOPE, proposal_id="act-404", action_digest=None,
                               denial_id="d1", session_slot="s", code="proposal_missing"),
        other_event("chat"),
    )
    assert dict(book.ledger.proposals) == dict(before)
    assert [d.code for d in book.ledger.diagnostics] == [
        "duplicate_proposal", "not_approved", "not_consumed", "digest_mismatch", "proposal_missing"]
    assert book.ledger.projection_version == 8


# --- Crew correlation ---------------------------------------------------------------


def _permission(proposal_id="act-1", raw=None, **overrides):
    fields = dict(
        slot=SESSION_SCOPE.session_slot,
        mid="m-1",
        approval_id="1",
        tool_name=EXECUTION_TOOL,
        tool_input={"proposal_id": proposal_id, "descriptor": raw or delete_descriptor()},
    )
    fields.update(overrides)
    return PendingPermission(**fields)


def test_permission_correlation_needs_slot_mid_tool_proposal_and_digest():
    book = Ledger()
    book.propose()
    good = _permission()
    assert correlate_permission(good, book.ledger) == approvals.Correlation(True, "ok", "act-1")
    for message, code in [
        (_permission(mid=""), "ambiguous"),
        (_permission(mid=None), "ambiguous"),
        (_permission(slot=""), "ambiguous"),
        (_permission(slot="study-slot"), "slot_mismatch"),
        (_permission(tool_name="fs_write"), "tool_mismatch"),
        (_permission(proposal_id="act-2"), "proposal_missing"),
        (_permission(tool_input={"approval_id": "1"}), "proposal_missing"),
        (_permission(tool_input="act-1"), "proposal_missing"),
        (_permission(raw=delete_descriptor("src/other.py")), "digest_mismatch"),
        (_permission(action_digest=SHA_B), "digest_mismatch"),
        (_permission(tool_input={"proposal_id": "act-1"}), "digest_mismatch"),
    ]:
        result = correlate_permission(message, book.ledger)
        assert (result.matched, result.code, result.proposal_id) == (False, code, None), message
    namespaced = _permission(tool_name="mcp__room__execute")
    assert correlate_permission(
        namespaced, book.ledger, tool_names=frozenset({"mcp__room__execute"})).matched


def test_external_resolutions_decide_or_are_ignored_without_authority():
    book = Ledger()
    book.propose()
    ignored = decide_external_resolution(
        book.ledger, _permission(slot="study-slot"), approved=True, scope=OPERATOR, command_id="ext-1")
    assert (ignored.ok, ignored.code) == (False, "ignored")
    assert ignored.candidate.payload["kind"] == "approval_resolution_ignored"
    assert ignored.candidate.payload["data"]["code"] == "slot_mismatch"
    book.append(ignored.candidate)
    assert book.ledger.proposals["act-1"].status is ProposalStatus.PENDING

    matched = decide_external_resolution(
        book.ledger, _permission(), approved=True, scope=OPERATOR, command_id="ext-2")
    assert matched.ok and matched.expected_sequence == book.ledger.projection_version
    data = matched.candidate.payload["data"]
    assert (data["actor"], data["crew_slot"], data["crew_mid"]) == ("crew", SESSION_SCOPE.session_slot, "m-1")
    assert "approval_id" not in json.dumps(matched.candidate.payload)
    assert permission_for_proposal(book.ledger, "act-1", [_permission()]) is None
    book.append(matched.candidate)
    assert book.ledger.proposals["act-1"].decision.actor == "crew"

    # After the acknowledged decision, exactly one prompt may be answered.
    assert permission_for_proposal(book.ledger, "act-1", [_permission()]) == _permission()
    assert permission_for_proposal(book.ledger, "act-1", [_permission(), _permission(mid="m-2")]) is None
    assert permission_for_proposal(book.ledger, "act-1", [_permission(slot="other")]) is None
    late = decide_external_resolution(
        book.ledger, _permission(), approved=False, scope=OPERATOR, command_id="ext-3")
    assert late.code == "ignored" and late.candidate.payload["data"]["code"] == "not_pending"


def test_ledger_candidates_survive_spec_2_preparation_unchanged():
    book = Ledger()
    book.propose(raw=command_descriptor())
    result = book.decide()
    consume = decide_consumption(
        book.ledger, book.request(raw=command_descriptor(), path_decisions=(ALLOWED, ALLOWED)))
    for candidate in (result.candidate, consume.candidate):
        (prepared,) = prepare_candidates([candidate]).candidates
        assert prepared.candidate == candidate
    assert consume.candidate.scope.mansion_id == MANSION


def test_the_modules_are_pure():
    for module in (approvals, action_descriptor):
        roots = set()
        for node in ast.walk(ast.parse(inspect.getsource(module))):
            if isinstance(node, ast.Import):
                roots.update(alias.name.partition(".")[0] for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                roots.add(node.module.partition(".")[0])
        assert roots <= {
            "__future__", "collections", "dataclasses", "enum", "types", "typing",
            "hashlib", "json", "re", "unicodedata", "haunted_house",
        }
