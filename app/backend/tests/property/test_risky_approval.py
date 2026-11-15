"""Properties 6, 7 and 8 for the Approval_Ledger.

Feature: doors-and-guardrails, Property 6: A risky action never runs without one exact approval
Feature: doors-and-guardrails, Property 7: A risky approval is consumed at most once
Feature: doors-and-guardrails, Property 8: Crew permission correlation requires message identity and exact action

Validates: Requirements 3.2–3.9, 4.1, 4.2, 4.5, 4.6, 6.8.
"""

from __future__ import annotations

import asyncio
import copy
from dataclasses import replace

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from haunted_house.core import guardrail_events as ge
from haunted_house.core.approvals import (
    EXECUTION_TOOL,
    ExecutionRequest,
    PendingPermission,
    ProposalStatus,
    RiskyDecisionRequest,
    authorize_execution,
    build_outcome_candidate,
    correlate_permission,
    decide_consumption,
    decide_external_resolution,
    decide_risky_decision,
    fold_approval_ledger,
)
from tests.guardrail_support import (
    ALLOWED,
    DENIED,
    MANSION,
    OPERATOR,
    SESSION_SCOPE,
    SHA_C,
    MemoryWriter,
    acknowledge,
    command_descriptor,
    delete_descriptor,
    git_descriptor,
    other_event,
    parsed,
)

pytestmark = pytest.mark.core

_BASES = {
    "delete": delete_descriptor,
    "command": command_descriptor,
    "git": git_descriptor,
}
_STATES = ("missing", "pending", "approved", "rejected", "superseded", "consumed", "failed", "succeeded")
_MUTATIONS = (
    "proposal_id", "mansion", "session", "room", "kind", "arguments",
    "working_directory", "path_intents", "path_denied", "path_count", "confinement",
)


def _history(state: str, raw: dict) -> list:
    """Acknowledged records leaving proposal ``act-1`` in ``state``."""

    if state == "missing":
        return list(acknowledge([other_event("only-noise")]))
    descriptor = parsed(raw)
    digest_of = ge.risky_action_proposed(SESSION_SCOPE, proposal_id="act-1", descriptor=descriptor)
    digest = digest_of.payload["data"]["action_digest"]
    candidates = [digest_of]
    if state == "rejected":
        candidates.append(ge.risky_action_rejected(
            OPERATOR, proposal_id="act-1", action_digest=digest, actor="operator", command_id="cmd-1"))
    elif state != "pending":
        candidates.append(ge.risky_action_approved(
            OPERATOR, proposal_id="act-1", action_digest=digest, actor="operator", command_id="cmd-1"))
    if state == "superseded":
        candidates.append(ge.risky_action_superseded(
            SESSION_SCOPE, proposal_id="act-1", action_digest=digest, code="replaced"))
    if state in ("consumed", "failed", "succeeded"):
        candidates.append(ge.risky_action_consumed(
            SESSION_SCOPE, proposal_id="act-1", action_digest=digest, claim_id="claim-0",
            session_slot=SESSION_SCOPE.session_slot))
    if state in ("failed", "succeeded"):
        builder = ge.risky_action_failed if state == "failed" else ge.risky_action_succeeded
        candidates.append(builder(
            SESSION_SCOPE, proposal_id="act-1", action_digest=digest, claim_id="claim-0", code="done"))
    return list(acknowledge(candidates))


def _mutated_request(kind: str, raw: dict, mutations: frozenset) -> ExecutionRequest:
    presented = copy.deepcopy(raw)
    scope = SESSION_SCOPE
    room = "workshop"
    proposal_id = "act-1"
    decisions = [ALLOWED] * len(parsed(raw).path_intents)
    confinement = True
    if "proposal_id" in mutations:
        proposal_id = "act-2"
    if "mansion" in mutations:
        scope = replace(scope, mansion_id="other-mansion")
    if "session" in mutations:
        scope = replace(scope, session_slot="workshop-slot-2")
    if "room" in mutations:
        room = "study"
    if "kind" in mutations:
        presented = _BASES["command" if kind != "command" else "delete"]()
        decisions = [ALLOWED] * len(parsed(presented).path_intents)
    elif "arguments" in mutations:
        if kind == "delete":
            presented = delete_descriptor("src/other.py")
        elif kind == "command":
            presented["arguments"]["argv"].append("--force")
        else:
            presented = git_descriptor("add", ("src/app.py", "src/extra.py"))
            decisions = [ALLOWED, ALLOWED]
    if "working_directory" in mutations and presented["kind"] != "delete_path":
        presented["working_directory"] = "src"
    if "path_intents" in mutations and presented["kind"] == "run_command":
        presented["path_intents"] = presented["path_intents"][:1]
        decisions = [ALLOWED]
    if "path_denied" in mutations and decisions:
        decisions[-1] = DENIED
    if "path_count" in mutations:
        decisions = decisions + [ALLOWED]
    if "confinement" in mutations:
        confinement = False
    return ExecutionRequest(
        proposal_id=proposal_id,
        descriptor=presented,
        scope=scope,
        room=room,
        claim_id="claim-9",
        path_decisions=tuple(decisions),
        confinement_available=confinement,
    )


def _effective(kind: str, raw: dict, mutations: frozenset) -> bool:
    """Whether a mutation set really changes something for this action."""

    for name in mutations:
        if name == "working_directory" and (kind == "delete" and "kind" not in mutations):
            continue
        if name == "path_intents" and not (
            (kind == "command" and "kind" not in mutations)
            or (kind != "command" and "kind" in mutations)
        ):
            continue
        if name == "path_denied" and not parsed(raw).path_intents and "kind" not in mutations and not (
            kind == "git" and "arguments" in mutations
        ):
            continue
        if name == "confinement" and kind == "delete" and "kind" not in mutations:
            continue
        return True
    return False


@settings(max_examples=400)
@given(
    kind=st.sampled_from(sorted(_BASES)),
    state=st.sampled_from(_STATES + ("approved",) * 6),
    mutations=st.frozensets(st.sampled_from(_MUTATIONS), max_size=3),
    empty_git=st.booleans(),
)
def test_a_risky_action_never_runs_without_one_exact_approval(kind, state, mutations, empty_git):
    raw = _BASES[kind]()
    if kind == "git" and empty_git:
        raw = git_descriptor("commit", ())
    ledger = fold_approval_ledger(_history(state, raw))
    request = _mutated_request(kind, raw, mutations)

    exact = state == "approved" and not _effective(kind, raw, mutations)
    code = authorize_execution(ledger, request)
    assert (code == "ok") is exact, (code, state, sorted(mutations))

    decision = decide_consumption(ledger, request)
    assert decision.allowed is exact
    if exact:
        data = decision.candidate.payload["data"]
        assert decision.candidate.payload["kind"] == "risky_action_consumed"
        assert data["proposal_id"] == "act-1"
        assert data["action_digest"] == ledger.proposals["act-1"].action_digest
        assert decision.expected_sequence == ledger.projection_version
        assert decision.denial is None
    else:
        # No consumption candidate exists, so nothing can be dispatched.
        assert decision.candidate is None and decision.expected_sequence is None
        assert decision.code != "ok"

    # Authority is never granted by the request alone: without the approval
    # record the same request is refused.
    if exact:
        unapproved = fold_approval_ledger(_history("pending", raw))
        assert authorize_execution(unapproved, request) == "proposal_pending"


_CLAIM_OPS = st.lists(
    st.one_of(
        st.tuples(st.just("refresh"), st.integers(0, 2)),
        st.tuples(st.just("claim"), st.integers(0, 2)),
        st.tuples(st.just("refresh_claim"), st.integers(0, 2)),
        st.tuples(st.just("noise"), st.just(0)),
        st.tuples(st.just("settle"), st.integers(0, 1)),
        st.tuples(st.just("approve_again"), st.just(0)),
    ),
    min_size=2,
    max_size=25,
)


@settings(max_examples=200)
@given(kind=st.sampled_from(sorted(_BASES)), ops=_CLAIM_OPS)
def test_a_risky_approval_is_consumed_at_most_once(kind, ops):
    raw = _BASES[kind]()
    writer = MemoryWriter()
    writer.events.extend(_history("approved", raw))
    decisions = (ALLOWED,) * len(parsed(raw).path_intents)

    def fold():
        return fold_approval_ledger(writer.events)

    snapshots = {actor: fold() for actor in range(3)}
    winner: str | None = None
    settled = False
    claims = 0

    def claim(actor: int) -> None:
        nonlocal winner, claims
        claims += 1
        claim_id = f"claim-{actor}-{claims}"
        snapshot = snapshots[actor]
        decision = decide_consumption(
            snapshot,
            ExecutionRequest("act-1", raw, SESSION_SCOPE, "workshop", claim_id, decisions, True),
        )
        fresh = snapshot.projection_version == writer.highest
        if not decision.allowed:
            # The snapshot already shows the approval as consumed.
            assert winner is not None and decision.code == "proposal_consumed"
            return
        assert snapshot.proposals["act-1"].status is ProposalStatus.APPROVED
        ack = asyncio.run(
            writer.compare_and_append(MANSION, decision.expected_sequence, [decision.candidate])
        )
        if fresh and winner is None:
            assert ack.status == "ok" and len(ack.events) == 1
            winner = claim_id
        else:
            # A stale snapshot can never win, whatever it believes.
            assert ack.status == "conflict" and ack.events == ()

    for op, argument in ops:
        if op == "refresh":
            snapshots[argument] = fold()
        elif op == "claim":
            claim(argument)
        elif op == "refresh_claim":
            snapshots[argument] = fold()
            claim(argument)
        elif op == "noise":
            asyncio.run(writer.append_candidates(MANSION, [other_event(f"noise-{writer.highest}")]))
        elif op == "settle" and winner is not None and not settled:
            outcome = build_outcome_candidate(
                fold(), scope=SESSION_SCOPE, proposal_id="act-1", claim_id=winner,
                succeeded=bool(argument), code="finished", exit_code=0 if argument else 1)
            assert outcome is not None
            assert build_outcome_candidate(
                fold(), scope=SESSION_SCOPE, proposal_id="act-1", claim_id="claim-forged",
                succeeded=True, code="finished") is None
            asyncio.run(writer.append_candidates(MANSION, [outcome]))
            settled = True
        elif op == "approve_again":
            # A second approval of the same proposal is refused before the writer.
            ledger = fold()
            again = decide_risky_decision(
                ledger,
                RiskyDecisionRequest(
                    "act-1", ledger.proposals["act-1"].action_digest,
                    ledger.projection_version, True, "operator", "cmd-again", OPERATOR),
            )
            assert not again.ok and again.candidate is None

        ledger = fold()
        consumed = [
            event for event in writer.events
            if isinstance(event.payload, dict) and event.payload.get("kind") == "risky_action_consumed"
        ]
        assert len(consumed) == (1 if winner else 0)
        proposal = ledger.proposals["act-1"]
        if winner is None:
            assert proposal.status is ProposalStatus.APPROVED
        else:
            assert proposal.claim_id == winner == consumed[0].payload["data"]["claim_id"]
            assert proposal.status in (
                ProposalStatus.CONSUMED, ProposalStatus.SUCCEEDED, ProposalStatus.FAILED)
            assert (proposal.status is ProposalStatus.CONSUMED) is (not settled)
        assert ledger.diagnostics == ()

    if winner is not None:
        # Later claims fail forever, including after an execution failure.
        final = decide_consumption(
            fold(), ExecutionRequest("act-1", raw, SESSION_SCOPE, "workshop", "claim-late", decisions, True))
        assert (final.allowed, final.code, final.candidate) == (False, "proposal_consumed", None)


_SLOTS = ("workshop-slot-1", "workshop-slot-2", "workshop-slot-3")


@st.composite
def _correlation_case(draw):
    proposals = []
    for index in range(draw(st.integers(1, 4))):
        slot = draw(st.sampled_from(_SLOTS))
        path = draw(st.sampled_from(["src/a.py", "src/b.py", "docs/c.md"]))
        status = draw(st.sampled_from(["pending", "pending", "pending", "approved", "rejected"]))
        proposals.append((f"act-{index}", slot, path, status))
    target = draw(st.sampled_from(proposals))
    message = dict(
        slot=draw(st.sampled_from(_SLOTS + (target[1],) * 4)),
        mid=draw(st.sampled_from(["m-1", "m-2", "m-1", "m-1", ""])),
        # One approval_id is deliberately reused across every slot and mid.
        approval_id=draw(st.sampled_from(["1", "1", "2"])),
        tool_name=draw(st.sampled_from([EXECUTION_TOOL] * 4 + ["fs_write", "execute_bash"])),
        proposal_id=draw(st.sampled_from([target[0]] * 4 + ["act-9"] + [p[0] for p in proposals])),
        path=draw(st.sampled_from([target[2]] * 4 + ["src/a.py", "src/zz.py"])),
        descriptor_slot=draw(st.sampled_from([target[1]] * 4 + list(_SLOTS))),
        stated_digest=draw(st.sampled_from(["computed", "computed", "none", "wrong"])),
    )
    return proposals, message, draw(st.booleans())


@settings(max_examples=400)
@given(case=_correlation_case())
def test_crew_permission_correlation_requires_message_identity_and_exact_action(case):
    proposals, message, approved = case
    candidates = []
    recorded = {}
    for proposal_id, slot, path, status in proposals:
        scope = replace(SESSION_SCOPE, session_slot=slot, ghost_id=f"tinker-{slot[-1]}")
        proposal = ge.risky_action_proposed(
            scope, proposal_id=proposal_id, descriptor=parsed(delete_descriptor(path, session_slot=slot)))
        digest = proposal.payload["data"]["action_digest"]
        recorded[proposal_id] = (slot, path, status, digest)
        candidates.append(proposal)
        if status != "pending":
            builder = ge.risky_action_approved if status == "approved" else ge.risky_action_rejected
            candidates.append(builder(
                OPERATOR, proposal_id=proposal_id, action_digest=digest, actor="operator",
                command_id=f"cmd-{proposal_id}"))
    ledger = fold_approval_ledger(acknowledge(candidates))

    descriptor = delete_descriptor(message["path"], session_slot=message["descriptor_slot"])
    computed = ge.risky_action_proposed(
        replace(SESSION_SCOPE, session_slot=message["descriptor_slot"]),
        proposal_id="probe", descriptor=parsed(descriptor)).payload["data"]["action_digest"]
    stated = {"computed": computed, "none": None, "wrong": SHA_C}[message["stated_digest"]]
    permission = PendingPermission(
        slot=message["slot"], mid=message["mid"], approval_id=message["approval_id"],
        tool_name=message["tool_name"],
        tool_input={"proposal_id": message["proposal_id"], "descriptor": descriptor},
        action_digest=stated,
    )

    named = recorded.get(message["proposal_id"])
    exact_action = (
        message["tool_name"] == EXECUTION_TOOL
        and named is not None
        and named[2] == "pending"
        and named[3] == computed
        and message["stated_digest"] != "wrong"
    )
    expected = exact_action and message["mid"] != "" and named[0] == message["slot"]
    correlation = correlate_permission(permission, ledger)
    assert correlation.matched is expected
    assert correlation.proposal_id == (message["proposal_id"] if expected else None)

    # The same approval_id on another slot or message grants nothing extra.
    for other_slot in _SLOTS:
        for other_mid in ("m-1", "m-7"):
            twin = replace(permission, slot=other_slot, mid=other_mid)
            twin_expected = exact_action and other_slot == named[0]
            assert correlate_permission(twin, ledger).matched is twin_expected
    assert not correlate_permission(replace(permission, mid=""), ledger).matched
    assert not correlate_permission(
        replace(permission, tool_input={"approval_id": message["approval_id"]}), ledger).matched

    result = decide_external_resolution(
        ledger, permission, approved=approved, scope=OPERATOR, command_id="ext-1")
    if expected:
        assert result.ok and result.expected_sequence == ledger.projection_version
        data = result.candidate.payload["data"]
        assert result.candidate.payload["kind"] == (
            "risky_action_approved" if approved else "risky_action_rejected")
        assert (data["proposal_id"], data["action_digest"]) == (message["proposal_id"], named[3])
        assert (data["actor"], data["crew_slot"], data["crew_mid"]) == (
            "crew", message["slot"], message["mid"])
        after = fold_approval_ledger(
            list(acknowledge(candidates)) + list(acknowledge([result.candidate], start=len(candidates) + 1)))
        assert after.proposals[message["proposal_id"]].status is (
            ProposalStatus.APPROVED if approved else ProposalStatus.REJECTED)
    else:
        assert not result.ok
        before = {key: value.status for key, value in ledger.proposals.items()}
        if result.candidate is not None:
            assert result.candidate.payload["kind"] == "approval_resolution_ignored"
            after = fold_approval_ledger(
                list(acknowledge(candidates)) + list(acknowledge([result.candidate], start=len(candidates) + 1)))
            # An ignored resolution authorizes nothing.
            assert {key: value.status for key, value in after.proposals.items()} == before
            assert after.diagnostics == ledger.diagnostics
        else:
            assert message["mid"] == ""
