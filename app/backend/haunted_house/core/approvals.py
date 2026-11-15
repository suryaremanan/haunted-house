"""Pure Approval_Ledger: exact, one-time Risky_Action authority.

Approval state is a fold, not a store.  The ledger is derived from
acknowledged Spec 4 domain records in canonical Sequence order, and every
decision this module returns is an App_Event_Candidate plus the
Projection_Version it was decided against.  The caller must obtain the
writer's acknowledgement (``compare_and_append``) before acting on it; this
module never executes, persists, or reads a clock.

An approval is necessary but never sufficient: the presented descriptor, the
trusted session identity, every Path_Guard decision, and confinement must all
agree with the approved proposal, and a consumed approval stays consumed
whatever the execution outcome.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, replace
from enum import StrEnum
from types import MappingProxyType
from typing import cast

from haunted_house.core import guardrail_events as events_module
from haunted_house.core.action_descriptor import (
    ActionDescriptor,
    ActionError,
    PathIntent,
    action_digest,
    canonical_action,
    descriptor_to_json,
    parse_action_descriptor,
    parse_canonical_action,
)
from haunted_house.core.guardrail_events import (
    DomainRecord,
    GuardrailEventKind,
    GuardrailPayloadError,
    is_identifier,
    select_domain_records,
)
from haunted_house.core.path_policy import PathDecision
from haunted_house.core.seance_event import AppEvent, AppEventCandidate, EventScope, JSONValue

__all__ = [
    "EXECUTION_TOOL",
    "ActionDescriptor",
    "ApprovalLedger",
    "ConsumeDecision",
    "Correlation",
    "DecisionRef",
    "DecisionResult",
    "ExecutionRequest",
    "LedgerDiagnostic",
    "PathIntent",
    "PendingPermission",
    "ProposalStatus",
    "RiskyDecisionRequest",
    "RiskyProposal",
    "action_digest",
    "advance_ledger",
    "authorize_execution",
    "build_outcome_candidate",
    "canonical_action",
    "correlate_permission",
    "decide_consumption",
    "decide_external_resolution",
    "decide_risky_decision",
    "empty_ledger",
    "fold_approval_ledger",
    "parse_action_descriptor",
    "parse_canonical_action",
    "permission_digest",
    "permission_for_proposal",
]

EXECUTION_TOOL = "execute_approved_action"
_CONFINED_KINDS = frozenset({"run_command", "git_write"})
K = GuardrailEventKind


class ProposalStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    SUPERSEDED = "superseded"
    CONSUMED = "consumed"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


@dataclass(frozen=True, slots=True)
class DecisionRef:
    command_id: str
    proposal_id: str
    outcome: str
    actor: str
    event_id: str
    sequence: int
    crew_slot: str | None = None
    crew_mid: str | None = None


@dataclass(frozen=True, slots=True)
class RiskyProposal:
    proposal_id: str
    action_digest: str
    # ``None`` when the recorded descriptor no longer parses to the recorded
    # digest (for example after redaction): the proposal is shown as blocked
    # and can never be approved or executed.
    descriptor: ActionDescriptor | None
    status: ProposalStatus
    session_slot: str
    created_sequence: int
    proposal_event_id: str
    decision: DecisionRef | None = None
    claim_id: str | None = None
    consumed_sequence: int | None = None
    outcome_code: str | None = None

    @property
    def displayable(self) -> bool:
        return self.descriptor is not None


@dataclass(frozen=True, slots=True)
class LedgerDiagnostic:
    sequence: int
    event_id: str
    kind: str
    code: str


@dataclass(frozen=True, slots=True)
class ApprovalLedger:
    projection_version: int
    proposals: Mapping[str, RiskyProposal]
    decisions_by_command: Mapping[str, DecisionRef]
    diagnostics: tuple[LedgerDiagnostic, ...] = ()


def empty_ledger() -> ApprovalLedger:
    return ApprovalLedger(0, MappingProxyType({}), MappingProxyType({}))


def fold_approval_ledger(events: Iterable[AppEvent]) -> ApprovalLedger:
    """Fold acknowledged canonical records into the ledger."""

    return advance_ledger(empty_ledger(), events)


def advance_ledger(ledger: ApprovalLedger, events: Iterable[AppEvent]) -> ApprovalLedger:
    """Apply further acknowledged records; equal to a fresh fold of all."""

    selection = select_domain_records(events)
    proposals = dict(ledger.proposals)
    decisions = dict(ledger.decisions_by_command)
    diagnostics = list(ledger.diagnostics)
    for record in selection.records:
        code = _apply(proposals, decisions, record)
        if code is not None:
            diagnostics.append(
                LedgerDiagnostic(record.sequence, record.event_id, record.kind.value, code)
            )
    return ApprovalLedger(
        projection_version=max(ledger.projection_version, selection.highest_sequence),
        proposals=MappingProxyType(proposals),
        decisions_by_command=MappingProxyType(decisions),
        diagnostics=tuple(diagnostics),
    )


def _recorded_descriptor(record: DomainRecord) -> ActionDescriptor | None:
    parsed = parse_action_descriptor(record.data["descriptor"])
    if isinstance(parsed, ActionError):
        return None
    if action_digest(parsed) != record.data["action_digest"]:
        return None
    if (
        parsed.mansion_id != record.scope.mansion_id
        or parsed.session_slot != record.scope.session_slot
    ):
        return None
    return parsed


def _apply(
    proposals: dict[str, RiskyProposal],
    decisions: dict[str, DecisionRef],
    record: DomainRecord,
) -> str | None:
    """Apply one record in place; return a diagnostic code when invalid."""

    kind, data = record.kind, record.data
    if kind is K.RISKY_ACTION_PROPOSED:
        proposal_id = cast(str, data["proposal_id"])
        if proposal_id in proposals:
            return "duplicate_proposal"
        proposals[proposal_id] = RiskyProposal(
            proposal_id=proposal_id,
            action_digest=cast(str, data["action_digest"]),
            descriptor=_recorded_descriptor(record),
            status=ProposalStatus.PENDING,
            session_slot=record.scope.session_slot,
            created_sequence=record.sequence,
            proposal_event_id=record.event_id,
        )
        return None

    if kind not in _LEDGER_KINDS:
        return None

    proposal = proposals.get(cast(str, data["proposal_id"]))
    if kind is K.RISKY_ACTION_DENIED:
        return None  # evidence only: a denied attempt changes no authority
    if proposal is None:
        return "proposal_missing"
    if data["action_digest"] != proposal.action_digest:
        return "digest_mismatch"

    if kind in (K.RISKY_ACTION_APPROVED, K.RISKY_ACTION_REJECTED):
        approved = kind is K.RISKY_ACTION_APPROVED
        command_id = cast(str, data["command_id"])
        if proposal.status is not ProposalStatus.PENDING:
            return "already_decided"
        if command_id in decisions:
            return "duplicate_command"
        if approved and not proposal.displayable:
            return "proposal_blocked"
        decision = DecisionRef(
            command_id=command_id,
            proposal_id=proposal.proposal_id,
            outcome="approved" if approved else "rejected",
            actor=cast(str, data["actor"]),
            event_id=record.event_id,
            sequence=record.sequence,
            crew_slot=cast("str | None", data["crew_slot"]),
            crew_mid=cast("str | None", data["crew_mid"]),
        )
        decisions[command_id] = decision
        proposals[proposal.proposal_id] = replace(
            proposal,
            status=ProposalStatus.APPROVED if approved else ProposalStatus.REJECTED,
            decision=decision,
        )
        return None

    if kind is K.RISKY_ACTION_SUPERSEDED:
        if proposal.status not in (ProposalStatus.PENDING, ProposalStatus.APPROVED):
            return "not_supersedable"
        proposals[proposal.proposal_id] = replace(proposal, status=ProposalStatus.SUPERSEDED)
        return None

    if kind is K.RISKY_ACTION_CONSUMED:
        if proposal.status is not ProposalStatus.APPROVED:
            return "not_approved"
        if not proposal.displayable or data["session_slot"] != proposal.session_slot:
            return "identity_mismatch"
        if record.scope.session_slot != proposal.session_slot:
            return "identity_mismatch"
        proposals[proposal.proposal_id] = replace(
            proposal,
            status=ProposalStatus.CONSUMED,
            claim_id=cast(str, data["claim_id"]),
            consumed_sequence=record.sequence,
        )
        return None

    # Outcome: only the claim that consumed the approval may settle it.
    if proposal.status is not ProposalStatus.CONSUMED:
        return "not_consumed"
    if data["claim_id"] != proposal.claim_id:
        return "claim_mismatch"
    proposals[proposal.proposal_id] = replace(
        proposal,
        status=(
            ProposalStatus.SUCCEEDED
            if kind is K.RISKY_ACTION_SUCCEEDED
            else ProposalStatus.FAILED
        ),
        outcome_code=cast(str, data["code"]),
    )
    return None


_LEDGER_KINDS = frozenset(
    {
        K.RISKY_ACTION_APPROVED,
        K.RISKY_ACTION_REJECTED,
        K.RISKY_ACTION_SUPERSEDED,
        K.RISKY_ACTION_CONSUMED,
        K.RISKY_ACTION_DENIED,
        K.RISKY_ACTION_SUCCEEDED,
        K.RISKY_ACTION_FAILED,
    }
)


# --- operator and external decisions ---------------------------------------------


@dataclass(frozen=True, slots=True)
class RiskyDecisionRequest:
    proposal_id: str
    action_digest: str
    expected_version: int
    approve: bool
    actor: str
    command_id: str
    scope: EventScope
    crew_slot: str | None = None
    crew_mid: str | None = None


@dataclass(frozen=True, slots=True)
class DecisionResult:
    """A candidate to compare-and-append, or a refusal that appends nothing."""

    ok: bool
    code: str
    candidate: AppEventCandidate | None = None
    expected_sequence: int | None = None
    duplicate_of: DecisionRef | None = None


def decide_risky_decision(
    ledger: ApprovalLedger, request: RiskyDecisionRequest
) -> DecisionResult:
    """Decide one exact approval or rejection of a pending proposal."""

    if type(request.approve) is not bool or not is_identifier(request.command_id):
        return DecisionResult(False, "invalid_request")
    prior = ledger.decisions_by_command.get(request.command_id)
    if prior is not None:
        same = (
            prior.proposal_id == request.proposal_id
            and prior.outcome == ("approved" if request.approve else "rejected")
        )
        return DecisionResult(
            False, "duplicate_command" if same else "command_conflict", duplicate_of=prior
        )
    if type(request.expected_version) is not int or (
        request.expected_version != ledger.projection_version
    ):
        return DecisionResult(False, "stale_version")
    proposal = ledger.proposals.get(request.proposal_id)
    if proposal is None:
        return DecisionResult(False, "proposal_missing")
    if proposal.status is not ProposalStatus.PENDING:
        return DecisionResult(False, "already_decided")
    if request.action_digest != proposal.action_digest:
        return DecisionResult(False, "stale_digest")
    if request.approve and not proposal.displayable:
        return DecisionResult(False, "proposal_blocked")
    builder = (
        events_module.risky_action_approved
        if request.approve
        else events_module.risky_action_rejected
    )
    try:
        candidate = builder(
            request.scope,
            proposal_id=proposal.proposal_id,
            action_digest=proposal.action_digest,
            actor=request.actor,
            command_id=request.command_id,
            crew_slot=request.crew_slot,
            crew_mid=request.crew_mid,
        )
    except GuardrailPayloadError:
        return DecisionResult(False, "invalid_request")
    return DecisionResult(True, "ok", candidate, ledger.projection_version)


# --- execution -------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ExecutionRequest:
    """One execution attempt.

    ``descriptor`` is what the Ghost presents now (model input).  ``scope``
    and ``room`` come from the trusted launch context, never from the model.
    ``path_decisions`` holds one Path_Guard decision per path intent.
    """

    proposal_id: str
    descriptor: object
    scope: EventScope
    room: str
    claim_id: str
    path_decisions: tuple[PathDecision, ...]
    confinement_available: bool = False


@dataclass(frozen=True, slots=True)
class ConsumeDecision:
    allowed: bool
    code: str
    candidate: AppEventCandidate | None = None
    expected_sequence: int | None = None
    # Content-free evidence of a refused attempt, when one can be built.
    denial: AppEventCandidate | None = None


def _presented(descriptor: object) -> ActionDescriptor | None:
    try:
        raw = (
            descriptor_to_json(descriptor)
            if isinstance(descriptor, ActionDescriptor)
            else descriptor
        )
    except Exception:  # noqa: BLE001 - a malformed instance is simply refused
        return None
    parsed = parse_action_descriptor(raw)
    return None if isinstance(parsed, ActionError) else parsed


_STATUS_CODES = {
    ProposalStatus.PENDING: "proposal_pending",
    ProposalStatus.REJECTED: "proposal_rejected",
    ProposalStatus.SUPERSEDED: "proposal_superseded",
    ProposalStatus.CONSUMED: "proposal_consumed",
    ProposalStatus.SUCCEEDED: "proposal_consumed",
    ProposalStatus.FAILED: "proposal_consumed",
}


def authorize_execution(ledger: ApprovalLedger, request: ExecutionRequest) -> str:
    """Return ``"ok"`` only for one exact, approved, unconsumed action."""

    if not is_identifier(request.proposal_id) or not is_identifier(request.claim_id):
        return "invalid_request"
    presented = _presented(request.descriptor)
    if presented is None:
        return "invalid_descriptor"
    proposal = ledger.proposals.get(request.proposal_id)
    if proposal is None:
        return "proposal_missing"
    if proposal.descriptor is None:
        return "proposal_blocked"
    if proposal.status is not ProposalStatus.APPROVED:
        return _STATUS_CODES[proposal.status]
    if (
        action_digest(presented) != proposal.action_digest
        or canonical_action(presented) != canonical_action(proposal.descriptor)
    ):
        return "descriptor_mismatch"
    approved = proposal.descriptor
    if (
        not isinstance(request.scope, EventScope)
        or request.scope.mansion_id != approved.mansion_id
        or request.scope.session_slot != approved.session_slot
        or request.room != approved.room
    ):
        return "identity_mismatch"
    decisions = request.path_decisions
    if len(decisions) != len(approved.path_intents) or not all(
        isinstance(decision, PathDecision) and decision.allowed is True
        for decision in decisions
    ):
        return "path_denied"
    if approved.kind in _CONFINED_KINDS and request.confinement_available is not True:
        return "confinement_unavailable"
    return "ok"


def decide_consumption(ledger: ApprovalLedger, request: ExecutionRequest) -> ConsumeDecision:
    """Return the one consumption candidate for an authorized attempt.

    The caller must ``compare_and_append`` the candidate at
    ``expected_sequence`` and receive the acknowledgement before dispatch.
    A conflict means another claim or write won: fold again and re-decide.
    """

    code = authorize_execution(ledger, request)
    if code != "ok":
        return ConsumeDecision(False, code, denial=_denial(ledger, request, code))
    proposal = ledger.proposals[request.proposal_id]
    candidate = events_module.risky_action_consumed(
        request.scope,
        proposal_id=proposal.proposal_id,
        action_digest=proposal.action_digest,
        claim_id=request.claim_id,
        session_slot=request.scope.session_slot,
    )
    return ConsumeDecision(True, "ok", candidate, ledger.projection_version)


def _denial(
    ledger: ApprovalLedger, request: ExecutionRequest, code: str
) -> AppEventCandidate | None:
    if not isinstance(request.scope, EventScope):
        return None
    proposal = ledger.proposals.get(request.proposal_id) if is_identifier(request.proposal_id) else None
    try:
        return events_module.risky_action_denied(
            request.scope,
            proposal_id=request.proposal_id,
            action_digest=proposal.action_digest if proposal is not None else None,
            denial_id=request.claim_id,
            session_slot=request.scope.session_slot,
            code=code,
        )
    except GuardrailPayloadError:
        return None


def build_outcome_candidate(
    ledger: ApprovalLedger,
    *,
    scope: EventScope,
    proposal_id: str,
    claim_id: str,
    succeeded: bool,
    code: str,
    exit_code: int | None = None,
    output_bytes: int = 0,
) -> AppEventCandidate | None:
    """The redacted outcome of the claim that consumed ``proposal_id``.

    Returns ``None`` unless that exact claim is recorded as consumed and
    unsettled.  A failure never restores the approval.
    """

    proposal = ledger.proposals.get(proposal_id)
    if (
        proposal is None
        or proposal.status is not ProposalStatus.CONSUMED
        or proposal.claim_id != claim_id
    ):
        return None
    builder = (
        events_module.risky_action_succeeded
        if succeeded is True
        else events_module.risky_action_failed
    )
    try:
        return builder(
            scope,
            proposal_id=proposal_id,
            action_digest=proposal.action_digest,
            claim_id=claim_id,
            code=code,
            exit_code=exit_code,
            output_bytes=output_bytes,
        )
    except GuardrailPayloadError:
        return None


# --- Crew permission correlation ----------------------------------------------------


@dataclass(frozen=True, slots=True)
class PendingPermission:
    """A Crew permission message.  ``(slot, mid)`` is its identity.

    ``approval_id`` repeats across turns and slots; it is carried only so the
    answer sent back to Crew can quote it, and it is never used to match.
    """

    slot: str
    mid: str
    approval_id: str
    tool_name: str
    tool_input: Mapping[str, JSONValue]
    action_digest: str | None = None


@dataclass(frozen=True, slots=True)
class Correlation:
    matched: bool
    code: str
    proposal_id: str | None = None


def permission_digest(tool_input: object) -> str | None:
    """Action_Digest of the descriptor inside an execution tool input."""

    if not isinstance(tool_input, Mapping):
        return None
    presented = _presented(tool_input.get("descriptor"))
    return None if presented is None else action_digest(presented)


def _correlate(
    message: PendingPermission,
    ledger: ApprovalLedger,
    tool_names: frozenset[str],
    statuses: frozenset[ProposalStatus],
) -> Correlation:
    if not isinstance(message, PendingPermission):
        return Correlation(False, "invalid_permission")
    if type(message.mid) is not str or message.mid == "":
        # An approval_id without the message identity names no one prompt.
        return Correlation(False, "ambiguous")
    if type(message.slot) is not str or message.slot == "":
        return Correlation(False, "ambiguous")
    if type(message.tool_name) is not str or message.tool_name not in tool_names:
        return Correlation(False, "tool_mismatch")
    if not isinstance(message.tool_input, Mapping):
        return Correlation(False, "proposal_missing")
    proposal_id = message.tool_input.get("proposal_id")
    proposal = ledger.proposals.get(proposal_id) if is_identifier(proposal_id) else None
    if proposal is None:
        return Correlation(False, "proposal_missing")
    computed = permission_digest(message.tool_input)
    if computed is None or computed != proposal.action_digest:
        return Correlation(False, "digest_mismatch")
    if message.action_digest is not None and message.action_digest != computed:
        return Correlation(False, "digest_mismatch")
    if proposal.descriptor is None or proposal.descriptor.session_slot != message.slot:
        return Correlation(False, "slot_mismatch")
    if proposal.status not in statuses:
        return Correlation(False, "not_pending")
    return Correlation(True, "ok", proposal.proposal_id)


_DEFAULT_TOOLS = frozenset({EXECUTION_TOOL})
_PENDING_ONLY = frozenset({ProposalStatus.PENDING})


def correlate_permission(
    message: PendingPermission,
    ledger: ApprovalLedger,
    *,
    tool_names: frozenset[str] = _DEFAULT_TOOLS,
) -> Correlation:
    """Match a permission to one pending proposal by slot, ``mid``, tool
    name, proposal identifier, and Action_Digest."""

    return _correlate(message, ledger, tool_names, _PENDING_ONLY)


def permission_for_proposal(
    ledger: ApprovalLedger,
    proposal_id: str,
    permissions: Iterable[PendingPermission],
    *,
    tool_names: frozenset[str] = _DEFAULT_TOOLS,
) -> PendingPermission | None:
    """The one Crew prompt to answer after an acknowledged app decision.

    Returns ``None`` unless the proposal is decided and exactly one
    permission message correlates with it.
    """

    proposal = ledger.proposals.get(proposal_id)
    if proposal is None or proposal.decision is None:
        return None
    matches = [
        message
        for message in permissions
        if _correlate(message, ledger, tool_names, frozenset(ProposalStatus))
        == Correlation(True, "ok", proposal_id)
    ]
    if len({(message.slot, message.mid) for message in matches}) != 1:
        return None
    return matches[0]


def decide_external_resolution(
    ledger: ApprovalLedger,
    message: PendingPermission,
    *,
    approved: bool,
    scope: EventScope,
    command_id: str,
    tool_names: frozenset[str] = _DEFAULT_TOOLS,
) -> DecisionResult:
    """Turn a Crew-side resolution into one domain candidate.

    A matched resolution becomes an exact ``crew`` decision; anything else
    becomes ``approval_resolution_ignored`` and grants no authority.  Either
    candidate must win ``compare_and_append`` to take effect.
    """

    correlation = _correlate(message, ledger, tool_names, _PENDING_ONLY)
    if correlation.matched:
        proposal = ledger.proposals[cast(str, correlation.proposal_id)]
        return decide_risky_decision(
            ledger,
            RiskyDecisionRequest(
                proposal_id=proposal.proposal_id,
                action_digest=proposal.action_digest,
                expected_version=ledger.projection_version,
                approve=approved,
                actor="crew",
                command_id=command_id,
                scope=scope,
                crew_slot=message.slot,
                crew_mid=message.mid,
            ),
        )
    if not isinstance(message, PendingPermission):
        return DecisionResult(False, "invalid_request")
    try:
        candidate = events_module.approval_resolution_ignored(
            scope,
            resolution_id=command_id,
            session_slot=message.slot,
            mid=message.mid,
            outcome="approved" if approved is True else "rejected",
            code=correlation.code,
        )
    except GuardrailPayloadError:
        return DecisionResult(False, "invalid_request")
    return DecisionResult(False, "ignored", candidate, ledger.projection_version)
