"""Pure Phase_State_Machine and exact Door decisions.

The workflow projection is a deterministic fold over acknowledged canonical
App_Events.  Only ``doors_and_guardrails`` domain records change domain
state; every other record still advances Projection_Version, because a
decision is compared against the highest canonical Sequence so that any
intervening write is detected by ``compare_and_append``.

An invalid domain record never raises and never changes state: it yields a
transition diagnostic and the preceding valid projection is preserved.

Commands are decided by building the candidate and applying it to the
current projection with the same transition function the fold uses, so a
decision is accepted exactly when its record would be a valid transition.
Nothing here persists, starts a session, or reads a clock.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, replace
from enum import StrEnum
from types import MappingProxyType
from typing import Literal, cast

from haunted_house.core import guardrail_events as events_module
from haunted_house.core.approvals import (
    ApprovalLedger,
    ProposalStatus,
    RiskyProposal,
    advance_ledger,
    empty_ledger,
)
from haunted_house.core.guardrail_events import (
    PHASES,
    DomainRecord,
    GuardrailEventKind,
    GuardrailPayloadError,
    Phase,
    is_identifier,
    select_domain_records,
)
from haunted_house.core.path_policy import (
    PathError,
    is_valid_spec_name,
    parse_relative_path,
)
from haunted_house.core.action_descriptor import descriptor_to_json
from haunted_house.core.seance_event import AppEvent, AppEventCandidate, EventScope, JSONValue

__all__ = [
    "ArtifactRevision",
    "ConfirmStart",
    "DecideDoor",
    "DoorProposal",
    "DoorStatus",
    "FailStart",
    "Integrity",
    "PendingWrite",
    "Phase",
    "PhaseStatus",
    "PhaseView",
    "StartPhase",
    "StartRevision",
    "SubmitOutput",
    "SupersedeDoor",
    "TransitionDiagnostic",
    "TransitionResult",
    "WorkflowCommand",
    "WorkflowProjection",
    "advance_workflow",
    "build_workflow_candidate",
    "decide_transition",
    "fold_workflow",
    "initial_workflow",
    "observe_sequence",
    "predecessor",
    "projection_to_json",
    "spec_document_phase",
    "successor",
]

K = GuardrailEventKind
Integrity = Literal["valid", "corrupt", "uncertain"]


class PhaseStatus(StrEnum):
    NOT_STARTED = "not_started"
    READY = "ready"
    STARTING = "starting"
    WORKING = "working"
    WAITING = "waiting"
    REVISION_REQUIRED = "revision_required"
    APPROVED = "approved"
    FAILED = "failed"
    DONE = "done"


class DoorStatus(StrEnum):
    SEALED = "sealed"
    WAITING = "waiting"
    OPEN = "open"
    REJECTED = "rejected"


def predecessor(phase: Phase) -> Phase | None:
    index = PHASES.index(phase)
    return PHASES[index - 1] if index > 0 else None


def successor(phase: Phase) -> Phase | None:
    index = PHASES.index(phase)
    return PHASES[index + 1] if index + 1 < len(PHASES) else None


@dataclass(frozen=True, slots=True)
class ArtifactRevision:
    revision: int
    sha256: str
    size_bytes: int


@dataclass(frozen=True, slots=True)
class DoorProposal:
    proposal_id: str
    phase: Phase
    document_path: str
    artifact_revision: ArtifactRevision
    status: Literal["pending", "approved", "rejected", "superseded"]
    created_sequence: int
    decision_event_id: str | None = None
    decision_actor: str | None = None


@dataclass(frozen=True, slots=True)
class PhaseView:
    phase: Phase
    status: PhaseStatus
    door: DoorStatus
    proposal: DoorProposal | None = None
    reservation_id: str | None = None
    session_slot: str | None = None
    last_revision: int = 0
    failure_code: str | None = None


@dataclass(frozen=True, slots=True)
class PendingWrite:
    write_id: str
    phase: Phase
    document_path: str
    base_revision: int
    base_sha256: str | None
    artifact_revision: ArtifactRevision
    uncertain: bool = False


@dataclass(frozen=True, slots=True)
class TransitionDiagnostic:
    sequence: int
    event_id: str
    kind: str
    code: str


@dataclass(frozen=True, slots=True)
class WorkflowProjection:
    version: int
    phases: Mapping[Phase, PhaseView]
    risky_proposals: Mapping[str, RiskyProposal]
    # Crew permission prompts acknowledged by Spec 2 and not yet decided,
    # keyed by ``(session slot, mid)``; the value is the request Sequence.
    pending_permissions: Mapping[tuple[str, str], int]
    waiting_count: int
    integrity: Integrity
    documents: Mapping[str, ArtifactRevision]
    pending_writes: Mapping[str, PendingWrite]
    proposal_ids: frozenset[str]
    command_ids: frozenset[str]
    ledger: ApprovalLedger
    diagnostics: tuple[TransitionDiagnostic, ...] = ()


def initial_workflow(integrity: Integrity = "valid") -> WorkflowProjection:
    phases = {
        phase: PhaseView(
            phase=phase,
            status=PhaseStatus.READY if index == 0 else PhaseStatus.NOT_STARTED,
            door=DoorStatus.SEALED,
        )
        for index, phase in enumerate(PHASES)
    }
    return WorkflowProjection(
        version=0,
        phases=MappingProxyType(phases),
        risky_proposals=MappingProxyType({}),
        pending_permissions=MappingProxyType({}),
        waiting_count=0,
        integrity=integrity,
        documents=MappingProxyType({}),
        pending_writes=MappingProxyType({}),
        proposal_ids=frozenset(),
        command_ids=frozenset(),
        ledger=empty_ledger(),
    )


def fold_workflow(
    events: Iterable[AppEvent], *, integrity: Integrity = "valid"
) -> WorkflowProjection:
    """Fold selected canonical records into the workflow projection."""

    return advance_workflow(initial_workflow(integrity), events)


def advance_workflow(
    projection: WorkflowProjection, events: Iterable[AppEvent]
) -> WorkflowProjection:
    """Apply further acknowledged records; equal to a fresh fold of all."""

    batch = sorted(events, key=lambda event: (event.sequence, event.event_id))
    selection = select_domain_records(batch)
    state = _State.of(projection)
    diagnostics = list(projection.diagnostics)
    for diagnostic in selection.diagnostics:
        diagnostics.append(
            TransitionDiagnostic(
                diagnostic.sequence, diagnostic.event_id, "invalid_payload", diagnostic.reason
            )
        )
    for record in selection.records:
        code = _apply(state, record)
        if code is not None:
            diagnostics.append(
                TransitionDiagnostic(record.sequence, record.event_id, record.kind.value, code)
            )
    diagnostics.sort(key=lambda item: (item.sequence, item.event_id))

    permissions = dict(projection.pending_permissions)
    for event in batch:
        mid = event.payload.get("mid") if type(event.payload) is dict else None
        if type(mid) is not str or event.source.origin != "crew":
            continue
        key = (event.scope.session_slot, mid)
        if event.event_type == "approval_requested":
            permissions.setdefault(key, event.sequence)
        elif event.event_type == "approval_decided":
            permissions.pop(key, None)

    ledger = advance_ledger(projection.ledger, batch)
    return _finish(
        state,
        version=max(projection.version, selection.highest_sequence),
        ledger=ledger,
        permissions=permissions,
        integrity=projection.integrity,
        diagnostics=tuple(diagnostics),
    )


def observe_sequence(projection: WorkflowProjection, sequence: int) -> WorkflowProjection:
    """Raise Projection_Version to a canonical Sequence that was read.

    Spec 2's selection folds one variant of a logical record, so the newest
    physical record is not always among the folded ones.  The writer compares
    against the highest Sequence it holds; a projection that stopped below it
    could never win ``compare_and_append``.  State is unchanged: only the
    version (and the ledger's copy of it) moves, and never backwards.
    """

    if type(sequence) is not int or sequence <= projection.version:
        return projection
    return replace(
        projection,
        version=sequence,
        ledger=replace(
            projection.ledger,
            projection_version=max(projection.ledger.projection_version, sequence),
        ),
    )


# --- transition function ---------------------------------------------------------


@dataclass(slots=True)
class _State:
    phases: dict[Phase, PhaseView]
    documents: dict[str, ArtifactRevision]
    pending_writes: dict[str, PendingWrite]
    proposal_ids: set[str]
    command_ids: set[str]

    @classmethod
    def of(cls, projection: WorkflowProjection) -> _State:
        return cls(
            phases=dict(projection.phases),
            documents=dict(projection.documents),
            pending_writes=dict(projection.pending_writes),
            proposal_ids=set(projection.proposal_ids),
            command_ids=set(projection.command_ids),
        )


def _finish(
    state: _State,
    *,
    version: int,
    ledger: ApprovalLedger,
    permissions: dict[tuple[str, str], int],
    integrity: Integrity,
    diagnostics: tuple[TransitionDiagnostic, ...],
) -> WorkflowProjection:
    waiting = (
        sum(
            1
            for view in state.phases.values()
            if view.proposal is not None and view.proposal.status == "pending"
        )
        + sum(
            1
            for proposal in ledger.proposals.values()
            if proposal.status is ProposalStatus.PENDING
        )
        + len(permissions)
    )
    return WorkflowProjection(
        version=version,
        phases=MappingProxyType(dict(state.phases)),
        risky_proposals=ledger.proposals,
        pending_permissions=MappingProxyType(dict(permissions)),
        waiting_count=waiting,
        integrity=integrity,
        documents=MappingProxyType(dict(state.documents)),
        pending_writes=MappingProxyType(dict(state.pending_writes)),
        proposal_ids=frozenset(state.proposal_ids),
        command_ids=frozenset(state.command_ids),
        ledger=ledger,
        diagnostics=diagnostics,
    )


def spec_document_phase(document_path: str) -> tuple[str, Phase] | None:
    """Return ``(spec name, phase)`` for a Spec_Document path, else ``None``."""

    parts = parse_relative_path(document_path)
    if isinstance(parts, PathError) or len(parts) != 4:
        return None
    if parts[:2] != (".kiro", "specs") or not is_valid_spec_name(parts[2]):
        return None
    for phase in PHASES[:3]:
        if parts[3] == f"{phase.value}.md":
            return parts[2], phase
    return None


def _artifact(data: Mapping[str, object]) -> ArtifactRevision:
    return ArtifactRevision(
        revision=cast(int, data["revision"]),
        sha256=cast(str, data["sha256"]),
        size_bytes=cast(int, data["size_bytes"]),
    )


def _path_fits_phase(phase: Phase, document_path: str) -> bool:
    if phase is Phase.IMPLEMENTATION:
        # The implementation result is not a Spec_Document.
        return spec_document_phase(document_path) is None
    found = spec_document_phase(document_path)
    return found is not None and found[1] is phase


def _predecessor_doors_open(state: _State, phase: Phase) -> bool:
    return all(
        state.phases[earlier].door is DoorStatus.OPEN
        for earlier in PHASES[: PHASES.index(phase)]
    )


def _path_has_pending_write(state: _State, document_path: str) -> bool:
    return any(write.document_path == document_path for write in state.pending_writes.values())


def _apply(state: _State, record: DomainRecord) -> str | None:
    """Apply one record in place, or return a diagnostic code and change nothing."""

    kind, data = record.kind, record.data
    if kind not in _WORKFLOW_KINDS:
        return None  # approval and denial evidence belongs to the ledger fold

    phase = Phase(cast(str, data["phase"]))
    view = state.phases[phase]

    if kind is K.PHASE_START_DENIED:
        return None  # audit evidence only

    if kind is K.PHASE_START_RESERVED:
        command_id = cast(str, data["command_id"])
        if command_id in state.command_ids:
            return "duplicate_command"
        if not _predecessor_doors_open(state, phase):
            return "predecessor_door_sealed"
        if view.status not in (
            PhaseStatus.READY,
            PhaseStatus.FAILED,
            PhaseStatus.REVISION_REQUIRED,
        ):
            return "invalid_state"
        state.command_ids.add(command_id)
        state.phases[phase] = replace(
            view,
            status=PhaseStatus.STARTING,
            reservation_id=cast(str, data["reservation_id"]),
            failure_code=None,
        )
        return None

    if kind in (K.PHASE_STARTED, K.PHASE_START_FAILED):
        if view.status is not PhaseStatus.STARTING:
            return "invalid_state"
        if data["reservation_id"] != view.reservation_id:
            return "reservation_mismatch"
        if kind is K.PHASE_STARTED:
            state.phases[phase] = replace(
                view,
                status=PhaseStatus.WORKING,
                session_slot=cast(str, data["session_slot"]),
            )
        else:
            state.phases[phase] = replace(
                view, status=PhaseStatus.FAILED, failure_code=cast(str, data["code"])
            )
        return None

    if kind is K.REVISION_STARTED:
        command_id = cast(str, data["command_id"])
        if command_id in state.command_ids:
            return "duplicate_command"
        if view.status is not PhaseStatus.REVISION_REQUIRED:
            return "invalid_state"
        state.command_ids.add(command_id)
        state.phases[phase] = replace(
            view,
            status=PhaseStatus.WORKING,
            session_slot=cast(str, data["session_slot"]),
        )
        return None

    if kind is K.PHASE_OUTPUT_READY:
        proposal_id = cast(str, data["proposal_id"])
        document_path = cast(str, data["document_path"])
        artifact = _artifact(data)
        if view.status is not PhaseStatus.WORKING:
            return "invalid_state"
        if proposal_id in state.proposal_ids:
            return "duplicate_proposal"
        if not _path_fits_phase(phase, document_path):
            return "document_mismatch"
        if artifact.revision <= view.last_revision:
            return "stale_revision"
        if _path_has_pending_write(state, document_path):
            return "write_pending"
        known = state.documents.get(document_path)
        if known is not None and known != artifact:
            return "artifact_mismatch"
        state.proposal_ids.add(proposal_id)
        state.phases[phase] = replace(
            view,
            status=PhaseStatus.WAITING,
            door=DoorStatus.WAITING,
            last_revision=artifact.revision,
            proposal=DoorProposal(
                proposal_id=proposal_id,
                phase=phase,
                document_path=document_path,
                artifact_revision=artifact,
                status="pending",
                created_sequence=record.sequence,
            ),
        )
        return None

    if kind in (K.DOOR_SUPERSEDED, K.DOOR_APPROVED, K.DOOR_REJECTED):
        proposal = view.proposal
        if (
            view.status is not PhaseStatus.WAITING
            or proposal is None
            or proposal.status != "pending"
        ):
            return "no_pending_proposal"
        if data["proposal_id"] != proposal.proposal_id:
            return "stale_proposal"
        current = proposal.artifact_revision
        if data["revision"] != current.revision or data["sha256"] != current.sha256:
            return "stale_revision"
        if kind is K.DOOR_SUPERSEDED:
            state.phases[phase] = replace(
                view,
                status=PhaseStatus.WORKING,
                door=DoorStatus.SEALED,
                proposal=replace(proposal, status="superseded"),
            )
            return None

        command_id = cast(str, data["command_id"])
        if command_id in state.command_ids:
            return "duplicate_command"
        if (
            data["document_path"] != proposal.document_path
            or data["size_bytes"] != current.size_bytes
        ):
            return "stale_revision"
        known = state.documents.get(proposal.document_path)
        if (known is not None and known != current) or _path_has_pending_write(
            state, proposal.document_path
        ):
            # The document changed after the proposal: it must be superseded.
            return "artifact_changed"
        state.command_ids.add(command_id)
        if kind is K.DOOR_APPROVED:
            state.phases[phase] = replace(
                view,
                status=PhaseStatus.APPROVED,
                door=DoorStatus.OPEN,
                proposal=replace(
                    proposal,
                    status="approved",
                    decision_event_id=record.event_id,
                    decision_actor=cast(str, data["actor"]),
                ),
            )
            following = successor(phase)
            if following is not None:
                next_view = state.phases[following]
                if next_view.status is PhaseStatus.NOT_STARTED:
                    state.phases[following] = replace(next_view, status=PhaseStatus.READY)
        else:
            state.phases[phase] = replace(
                view,
                status=PhaseStatus.REVISION_REQUIRED,
                door=DoorStatus.REJECTED,
                proposal=replace(
                    proposal,
                    status="rejected",
                    decision_event_id=record.event_id,
                    decision_actor=cast(str, data["actor"]),
                ),
            )
        return None

    # --- Spec_Document write evidence -------------------------------------------
    write_id = cast(str, data["write_id"])
    document_path = cast(str, data["document_path"])
    if kind is K.SPEC_WRITE_PREPARED:
        found = spec_document_phase(document_path)
        if found is None or found[1] is not phase:
            return "document_mismatch"
        if view.status not in (PhaseStatus.WORKING, PhaseStatus.WAITING):
            return "invalid_state"
        if write_id in state.pending_writes or _path_has_pending_write(state, document_path):
            return "write_pending"
        known = state.documents.get(document_path)
        base_revision = known.revision if known is not None else 0
        # With no recorded revision the base digest describes whatever file
        # (if any) was on disk before the house first wrote this document.
        base_sha = cast("str | None", data["base_sha256"])
        if data["base_revision"] != base_revision:
            return "stale_revision"
        if known is not None and base_sha != known.sha256:
            return "stale_revision"
        if data["revision"] != base_revision + 1:
            return "stale_revision"
        state.pending_writes[write_id] = PendingWrite(
            write_id=write_id,
            phase=phase,
            document_path=document_path,
            base_revision=base_revision,
            base_sha256=base_sha,
            artifact_revision=_artifact(data),
        )
        return None

    pending = state.pending_writes.get(write_id)
    if pending is None:
        return "write_missing"
    if pending.phase is not phase or pending.document_path != document_path:
        return "write_mismatch"
    if kind is K.SPEC_DOCUMENT_WRITTEN:
        if _artifact(data) != pending.artifact_revision:
            return "write_mismatch"
        del state.pending_writes[write_id]
        state.documents[document_path] = pending.artifact_revision
        return None
    if kind is K.SPEC_WRITE_RECOVERED:
        del state.pending_writes[write_id]
        if data["outcome"] == "completed":
            state.documents[document_path] = pending.artifact_revision
        return None
    # SPEC_WRITE_UNCERTAIN: keep blocking the path until recovery settles it.
    state.pending_writes[write_id] = replace(pending, uncertain=True)
    return None


_WORKFLOW_KINDS = frozenset(
    {
        K.PHASE_START_RESERVED,
        K.PHASE_STARTED,
        K.PHASE_START_FAILED,
        K.PHASE_START_DENIED,
        K.PHASE_OUTPUT_READY,
        K.REVISION_STARTED,
        K.DOOR_SUPERSEDED,
        K.DOOR_APPROVED,
        K.DOOR_REJECTED,
        K.SPEC_WRITE_PREPARED,
        K.SPEC_DOCUMENT_WRITTEN,
        K.SPEC_WRITE_RECOVERED,
        K.SPEC_WRITE_UNCERTAIN,
    }
)


# --- commands ---------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class StartPhase:
    """Explicit Phase_Start_Command: reserve before any Crew setup."""

    scope: EventScope
    phase: Phase
    command_id: str
    reservation_id: str
    expected_version: int


@dataclass(frozen=True, slots=True)
class ConfirmStart:
    scope: EventScope
    phase: Phase
    reservation_id: str
    session_slot: str


@dataclass(frozen=True, slots=True)
class FailStart:
    scope: EventScope
    phase: Phase
    reservation_id: str
    code: str


@dataclass(frozen=True, slots=True)
class StartRevision:
    scope: EventScope
    phase: Phase
    command_id: str
    session_slot: str
    expected_version: int


@dataclass(frozen=True, slots=True)
class SubmitOutput:
    """A Phase_Output that the upstream boundary already validated."""

    scope: EventScope
    phase: Phase
    proposal_id: str
    document_path: str
    artifact_revision: ArtifactRevision


@dataclass(frozen=True, slots=True)
class SupersedeDoor:
    scope: EventScope
    phase: Phase
    code: str = "document_changed"


@dataclass(frozen=True, slots=True)
class DecideDoor:
    """One exact Door decision; every field must equal the current proposal."""

    scope: EventScope
    proposal_id: str
    phase: Phase
    document_path: str
    artifact_revision: ArtifactRevision
    expected_version: int
    approve: bool
    actor: str
    command_id: str


WorkflowCommand = (
    StartPhase
    | ConfirmStart
    | FailStart
    | StartRevision
    | SubmitOutput
    | SupersedeDoor
    | DecideDoor
)


@dataclass(frozen=True, slots=True)
class TransitionResult:
    """A candidate to append, or a refusal that appends nothing.

    ``expected_sequence`` is the Projection_Version the decision was made
    against and must be passed to ``compare_and_append``.
    """

    ok: bool
    code: str
    candidates: tuple[AppEventCandidate, ...] = ()
    expected_sequence: int | None = None


def build_workflow_candidate(
    projection: WorkflowProjection, command: WorkflowCommand
) -> AppEventCandidate:
    """Build the domain candidate for ``command`` without judging it.

    Raises :class:`GuardrailPayloadError` for a malformed command.
    """

    scope = command.scope
    if isinstance(command, StartPhase):
        return events_module.phase_start_reserved(
            scope,
            phase=command.phase,
            reservation_id=command.reservation_id,
            command_id=command.command_id,
        )
    if isinstance(command, ConfirmStart):
        return events_module.phase_started(
            scope,
            phase=command.phase,
            reservation_id=command.reservation_id,
            session_slot=command.session_slot,
        )
    if isinstance(command, FailStart):
        return events_module.phase_start_failed(
            scope, phase=command.phase, reservation_id=command.reservation_id, code=command.code
        )
    if isinstance(command, StartRevision):
        return events_module.revision_started(
            scope,
            phase=command.phase,
            command_id=command.command_id,
            session_slot=command.session_slot,
        )
    if isinstance(command, SubmitOutput):
        artifact = command.artifact_revision
        return events_module.phase_output_ready(
            scope,
            phase=command.phase,
            proposal_id=command.proposal_id,
            document_path=command.document_path,
            revision=artifact.revision,
            sha256=artifact.sha256,
            size_bytes=artifact.size_bytes,
        )
    if isinstance(command, SupersedeDoor):
        view = projection.phases.get(_as_phase(command.phase))
        proposal = view.proposal if view is not None else None
        if proposal is None:
            raise GuardrailPayloadError(
                events_module.PayloadDiagnostic("proposal", "no_pending_proposal")
            )
        return events_module.door_superseded(
            scope,
            phase=command.phase,
            proposal_id=proposal.proposal_id,
            revision=proposal.artifact_revision.revision,
            sha256=proposal.artifact_revision.sha256,
            code=command.code,
        )
    if isinstance(command, DecideDoor):
        if type(command.approve) is not bool:
            raise GuardrailPayloadError(
                events_module.PayloadDiagnostic("approve", "invalid_type")
            )
        artifact = command.artifact_revision
        builder = events_module.door_approved if command.approve else events_module.door_rejected
        return builder(
            scope,
            phase=command.phase,
            proposal_id=command.proposal_id,
            document_path=command.document_path,
            revision=artifact.revision,
            sha256=artifact.sha256,
            size_bytes=artifact.size_bytes,
            actor=command.actor,
            command_id=command.command_id,
        )
    raise GuardrailPayloadError(events_module.PayloadDiagnostic("command", "unsupported_value"))


def _as_phase(value: object) -> Phase | None:
    try:
        return Phase(value)  # type: ignore[arg-type]
    except ValueError:
        return None


def decide_transition(
    projection: WorkflowProjection, command: WorkflowCommand
) -> TransitionResult:
    """Accept ``command`` only if its record is a valid transition now.

    A refusal carries a stable code and no candidate, so nothing reaches the
    writer.  An accepted command returns exactly one candidate.
    """

    if projection.integrity != "valid":
        return TransitionResult(False, "integrity_unavailable")
    expected = getattr(command, "expected_version", projection.version)
    if type(expected) is not int or expected != projection.version:
        return TransitionResult(False, "stale_version")
    command_id = getattr(command, "command_id", None)
    if command_id is not None and (
        not is_identifier(command_id) or command_id in projection.command_ids
    ):
        return TransitionResult(
            False, "duplicate_command" if is_identifier(command_id) else "invalid_command"
        )
    try:
        candidate = build_workflow_candidate(projection, command)
    except GuardrailPayloadError as error:
        if error.diagnostic.reason == "no_pending_proposal":
            return TransitionResult(False, "no_pending_proposal")
        return TransitionResult(False, "invalid_command")
    except (AttributeError, TypeError):
        return TransitionResult(False, "invalid_command")

    record = _dry_run_record(candidate, projection.version + 1)
    code = _apply(_State.of(projection), record)
    if code is not None:
        return TransitionResult(False, code)
    return TransitionResult(True, "ok", (candidate,), projection.version)


def _dry_run_record(candidate: AppEventCandidate, sequence: int) -> DomainRecord:
    payload = cast(dict[str, object], candidate.payload)
    return DomainRecord(
        kind=GuardrailEventKind(cast(str, payload["kind"])),
        entity_id=cast(str, payload["entity_id"]),
        data=cast(dict, payload["data"]),
        event_id="",
        sequence=sequence,
        scope=candidate.scope,
    )


# --- projection DTO ------------------------------------------------------------------


def projection_to_json(projection: WorkflowProjection) -> dict[str, JSONValue]:
    """The content-free domain-vector form of a projection.

    It lists every folded detail (documents, pending writes, diagnostics) and
    is what ``fixtures/guardrails/domain-vectors.json`` records.  It is not
    sent over HTTP: the one wire form the dashboard and the replay page parse
    is ``core.workflow_dto.workflow_projection_to_json``.

    Lists are ordered deterministically (phases in workflow order, everything
    else by identifier) so two runtimes can compare the result directly.
    """

    def proposal_json(proposal: DoorProposal | None) -> JSONValue:
        if proposal is None:
            return None
        return {
            "proposal_id": proposal.proposal_id,
            "phase": proposal.phase.value,
            "document_path": proposal.document_path,
            "revision": proposal.artifact_revision.revision,
            "sha256": proposal.artifact_revision.sha256,
            "size_bytes": proposal.artifact_revision.size_bytes,
            "status": proposal.status,
            "created_sequence": proposal.created_sequence,
            "decision_event_id": proposal.decision_event_id,
            "decision_actor": proposal.decision_actor,
        }

    def risky_json(proposal: RiskyProposal) -> JSONValue:
        decision = proposal.decision
        return {
            "proposal_id": proposal.proposal_id,
            "action_digest": proposal.action_digest,
            "status": proposal.status.value,
            "displayable": proposal.displayable,
            "descriptor": (
                descriptor_to_json(proposal.descriptor)
                if proposal.descriptor is not None
                else None
            ),
            "session_slot": proposal.session_slot,
            "created_sequence": proposal.created_sequence,
            "decision": None
            if decision is None
            else {
                "outcome": decision.outcome,
                "actor": decision.actor,
                "command_id": decision.command_id,
                "event_id": decision.event_id,
                "sequence": decision.sequence,
            },
            "claim_id": proposal.claim_id,
            "consumed_sequence": proposal.consumed_sequence,
            "outcome_code": proposal.outcome_code,
        }

    return {
        "version": projection.version,
        "integrity": projection.integrity,
        "waiting_count": projection.waiting_count,
        "phases": [
            {
                "phase": view.phase.value,
                "status": view.status.value,
                "door": view.door.value,
                "session_slot": view.session_slot,
                "failure_code": view.failure_code,
                "last_revision": view.last_revision,
                "proposal": proposal_json(view.proposal),
            }
            for view in (projection.phases[phase] for phase in PHASES)
        ],
        "risky_proposals": [
            risky_json(projection.risky_proposals[key])
            for key in sorted(projection.risky_proposals)
        ],
        "pending_permissions": [
            {"slot": slot, "mid": mid, "sequence": projection.pending_permissions[(slot, mid)]}
            for slot, mid in sorted(projection.pending_permissions)
        ],
        "documents": [
            {
                "document_path": path,
                "revision": projection.documents[path].revision,
                "sha256": projection.documents[path].sha256,
                "size_bytes": projection.documents[path].size_bytes,
            }
            for path in sorted(projection.documents)
        ],
        "pending_writes": [
            {
                "write_id": write.write_id,
                "phase": write.phase.value,
                "document_path": write.document_path,
                "uncertain": write.uncertain,
            }
            for write in (projection.pending_writes[key] for key in sorted(projection.pending_writes))
        ],
        "diagnostics": [
            {"sequence": item.sequence, "kind": item.kind, "code": item.code}
            for item in (*projection.diagnostics, *projection.ledger.diagnostics)
        ],
    }
