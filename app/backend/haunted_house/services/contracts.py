"""RG-C1 at run time: are the Spec 2 and Spec 4 public interfaces present?

Room Ghosts adapts nothing.  Before it settles or starts anything it checks
that the prerequisite interfaces it calls exist with the names, schema
version, event types, and parameters it was built against.  A missing or
incompatible interface is reported by name and the caller answers
``contract_unavailable``; there is no fallback store, writer, reducer,
matcher, path gate, or normalizer here.
"""

from __future__ import annotations

import importlib
import inspect
from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from types import ModuleType

__all__ = [
    "CONTRACT_UNAVAILABLE",
    "REQUIRED_EVENT_TYPES",
    "REQUIRED_INTERFACES",
    "REQUIRED_PARAMETERS",
    "ContractStatus",
    "check_prerequisites",
    "inspect_prerequisites",
]

CONTRACT_UNAVAILABLE = "contract_unavailable"
_PACKAGE = "haunted_house."

# module -> public names Room Ghosts imports or calls
REQUIRED_INTERFACES: dict[str, tuple[str, ...]] = {
    # Spec 2: canonical event, writer contract, selection, Ghost_State fold.
    "core.seance_event": (
        "SCHEMA_VERSION", "ALLOWED_EVENT_TYPES", "AppEvent", "AppEventCandidate",
        "EventScope", "EventSource", "validate_candidate", "validate_event",
        "calculate_event_id", "calculate_record_id",
    ),
    "core.seance_persistence": (
        "CanonicalEventWriter", "AppendResult", "CanonicalReadResult", "prepare_candidates",
    ),
    "core.seance_log_parser": ("parse_event_log",),
    "core.seance_scope_registry": ("build_scope_registry",),
    "core.ghost_state": (
        "GhostSnapshot", "select_events", "reduce_ghost_snapshot", "fold_ghost_events",
    ),
    "core.crew_event_normalizer": ("normalize_crew_envelope", "CrewEnvelope"),
    "adapters.seance_log_store": ("SeanceLogStore",),
    "adapters.seance_service": ("SeanceService",),
    # Spec 4: phases, Doors, approvals, paths, sessions.
    "core.guardrail_events": (
        "DOMAIN", "Phase", "PHASES", "GuardrailEventKind", "select_domain_records",
        "operator_scope", "path_denied",
    ),
    "core.workflow": (
        "WorkflowProjection", "DoorProposal", "ArtifactRevision", "PhaseStatus", "DoorStatus",
        "SubmitOutput", "fold_workflow", "decide_transition",
    ),
    "core.workflow_projector": ("replay_projection",),
    "core.approvals": ("ApprovalLedger", "fold_approval_ledger", "decide_consumption"),
    "core.path_policy": ("Access", "RoomPolicy", "room_policy", "policy_allows"),
    "core.room_catalog": ("TOOLS_BY_ROLE", "check_arguments"),
    "adapters.guardrail_port": ("GuardrailPort", "GuardrailRead", "GuardrailAck"),
    "adapters.guarded_filesystem": ("GuardedFilesystem", "GuardedRoomAccess", "FileDigest"),
    "adapters.workflow_service": ("WorkflowService", "PhaseOutput", "RoomResult"),
    "adapters.room_tool_service": ("RoomToolService",),
    "adapters.crew_chat": ("CrewChat", "SessionBinding", "SessionRequest"),
    "adapters.session_bindings": ("RoomBinding", "SessionBindingStore", "session_label"),
    "adapters.session_reconciler": ("SessionReconciler",),
}

# Canonical event types Room Ghosts consumes or produces.
REQUIRED_EVENT_TYPES = frozenset(
    {
        "run_started", "ghost_progressed", "crew_turn_ended", "crew_error_observed",
        "run_completed", "run_blocked", "run_failed", "domain_event_recorded",
    }
)

# (module, dotted attribute) -> parameters it must accept, in order
REQUIRED_PARAMETERS: dict[tuple[str, str], tuple[str, ...]] = {
    ("core.seance_persistence", "CanonicalEventWriter.append_candidates"): (
        "self", "mansion_id", "candidates",
    ),
    ("core.seance_persistence", "CanonicalEventWriter.compare_and_append"): (
        "self", "mansion_id", "expected_sequence", "candidates",
    ),
    ("core.seance_persistence", "CanonicalEventWriter.read_after"): (
        "self", "mansion_id", "after_sequence", "limit",
    ),
    ("core.ghost_state", "reduce_ghost_snapshot"): ("events", "mansion_id", "ghost_id"),
    ("adapters.workflow_service", "WorkflowService.start_phase"): ("self", "mansion_id", "phase"),
    ("adapters.workflow_service", "WorkflowService.submit_phase_output"): (
        "self", "binding", "path",
    ),
    ("adapters.workflow_service", "WorkflowService.decide_door"): (
        "self", "mansion_id", "proposal_id",
    ),
    ("adapters.workflow_service", "WorkflowService.decide_risky_action"): (
        "self", "mansion_id", "proposal_id",
    ),
    ("adapters.workflow_service", "WorkflowService.projection"): ("self", "mansion_id"),
    ("adapters.guardrail_port", "GuardrailPort.read"): ("self", "mansion_id"),
    ("adapters.guarded_filesystem", "GuardedFilesystem.read_file"): ("self", "policy", "raw_path"),
    ("adapters.guarded_filesystem", "GuardedFilesystem.write_file"): (
        "self", "policy", "raw_path", "data",
    ),
    ("adapters.crew_chat", "CrewChat.create_bound_session"): ("self", "request"),
    ("adapters.crew_chat", "CrewChat.send_turn"): ("self", "binding", "text"),
    ("adapters.session_reconciler", "SessionReconciler.reconcile"): ("self", "mansion_id"),
    ("adapters.room_tool_service", "RoomToolService.call"): (
        "self", "session", "tool", "arguments",
    ),
}


@dataclass(frozen=True, slots=True)
class ContractStatus:
    """``missing`` names each absent or incompatible interface."""

    ok: bool
    missing: tuple[str, ...] = ()

    @property
    def code(self) -> str:
        return "ok" if self.ok else CONTRACT_UNAVAILABLE


def _resolve(module: ModuleType, dotted: str) -> object:
    target: object = module
    for part in dotted.split("."):
        target = getattr(target, part)
    return target


def inspect_prerequisites(
    loader: Callable[[str], ModuleType] = importlib.import_module,
) -> ContractStatus:
    """Check every required interface; never raises."""

    missing: list[str] = []
    modules: dict[str, ModuleType] = {}
    for name, attributes in REQUIRED_INTERFACES.items():
        try:
            module = loader(_PACKAGE + name)
        except Exception:  # noqa: BLE001 - an absent prerequisite, whatever the cause
            missing.append(name)
            continue
        modules[name] = module
        missing.extend(f"{name}.{item}" for item in attributes if not hasattr(module, item))

    events = modules.get("core.seance_event")
    if events is not None:
        if getattr(events, "SCHEMA_VERSION", None) != 1:
            missing.append("core.seance_event.SCHEMA_VERSION==1")
        allowed = getattr(events, "ALLOWED_EVENT_TYPES", frozenset())
        missing.extend(
            f"core.seance_event.event_type:{item}"
            for item in sorted(REQUIRED_EVENT_TYPES)
            if item not in allowed
        )
    guardrails = modules.get("core.guardrail_events")
    if guardrails is not None:
        phases = tuple(getattr(item, "value", None) for item in getattr(guardrails, "PHASES", ()))
        if phases != ("requirements", "design", "tasks", "implementation"):
            missing.append("core.guardrail_events.PHASES")

    for (name, dotted), wanted in REQUIRED_PARAMETERS.items():
        module = modules.get(name)
        if module is None:
            continue
        try:
            parameters = tuple(inspect.signature(_resolve(module, dotted)).parameters)  # type: ignore[arg-type]
        except (AttributeError, TypeError, ValueError):
            missing.append(f"{name}.{dotted}")
            continue
        if parameters[: len(wanted)] != wanted:
            missing.append(f"{name}.{dotted}()")
    return ContractStatus(not missing, tuple(missing))


@lru_cache(maxsize=1)
def check_prerequisites() -> ContractStatus:
    """The cached status for this process (the interfaces cannot change)."""

    return inspect_prerequisites()
