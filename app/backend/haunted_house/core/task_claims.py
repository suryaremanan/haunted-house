"""Task_Claim models, conservative overlap, and the pure claim ledger.

A Task_Claim (File_Ownership_Claim) binds one Ghost_Run to one Selected_Task
and its Path_Claim.  The ledger is a deterministic fold over acknowledged
canonical ``room_ghosts`` records: a claim is ``active`` from its acquisition
record until its release record.  An acquisition that would break an
invariant (a second claim for the run or task, a possible overlap with an
active claim, a fourth active claim) changes nothing and yields a diagnostic,
so two racing acquisitions can never both hold.

A claim only narrows authority.  ``authorize_claim_access`` answers whether
a request may be *forwarded* to the Spec 4 MCP_Gate and Path_Guard; it never
allows anything by itself.  Identity is the trusted Event_Scope of the
session, never a tool argument.

Pure: no filesystem, network, clock, or logging.
"""

from __future__ import annotations

import hashlib
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, replace
from enum import StrEnum
from types import MappingProxyType
from typing import cast

from haunted_house.core.path_policy import Access
from haunted_house.core.room_ghost_events import (
    RoomGhostEventKind,
    RoomGhostPayloadError,
    RoomGhostRecord,
    build_room_ghost_candidate,
    select_room_ghost_records,
)
from haunted_house.core.seance_event import (
    AppEvent,
    AppEventCandidate,
    EventScope,
    canonical_json,
)
from haunted_house.core.task_plan import claim_covers, claims_may_overlap

__all__ = [
    "MAX_ACTIVE_CLAIMS",
    "MUTATING_ACCESS",
    "ClaimAccess",
    "ClaimDecision",
    "ClaimDiagnostic",
    "ClaimLedger",
    "ClaimState",
    "TaskClaim",
    "acquire_candidate",
    "authorize_claim_access",
    "claim_id_for",
    "claims_may_overlap",
    "decide_acquire",
    "decide_release",
    "empty_ledger",
    "fold_claims",
    "release_candidate",
]

MAX_ACTIVE_CLAIMS = 3
K = RoomGhostEventKind
# Accesses that change the Mansion: these must lie inside the Path_Claim.
MUTATING_ACCESS = frozenset(
    {Access.WRITE, Access.DELETE, Access.COMMAND_WRITE, Access.GIT_WRITE}
)


class ClaimState(StrEnum):
    ACTIVE = "active"
    RELEASED = "released"


@dataclass(frozen=True, slots=True)
class TaskClaim:
    """One acknowledged claim.  Every field comes from a canonical record."""

    claim_id: str
    run_id: str
    task_id: str
    paths: tuple[str, ...]
    acquired_record_id: str
    scope: EventScope
    attempt: int
    acquired_sequence: int
    state: ClaimState = ClaimState.ACTIVE
    released_record_id: str | None = None
    release_outcome: str | None = None

    @property
    def active(self) -> bool:
        return self.state is ClaimState.ACTIVE


@dataclass(frozen=True, slots=True)
class ClaimDiagnostic:
    sequence: int
    kind: str
    code: str


@dataclass(frozen=True, slots=True)
class ClaimLedger:
    """Every claim of one Mansion, keyed by claim identifier."""

    claims: Mapping[str, TaskClaim]
    diagnostics: tuple[ClaimDiagnostic, ...] = ()

    @property
    def active(self) -> tuple[TaskClaim, ...]:
        return tuple(
            sorted(
                (claim for claim in self.claims.values() if claim.active),
                key=lambda claim: (claim.acquired_sequence, claim.claim_id),
            )
        )

    def get(self, claim_id: object) -> TaskClaim | None:
        return self.claims.get(claim_id) if type(claim_id) is str else None

    def active_for_scope(self, scope: EventScope) -> TaskClaim | None:
        return next((claim for claim in self.active if claim.scope == scope), None)

    def active_for_task(self, task_id: str) -> TaskClaim | None:
        return next((claim for claim in self.active if claim.task_id == task_id), None)


def empty_ledger() -> ClaimLedger:
    return ClaimLedger(MappingProxyType({}))


def claim_id_for(scope: EventScope, task_id: str, attempt: int) -> str:
    """The deterministic identifier of one run's claim on one task attempt."""

    identity = [
        scope.mansion_id,
        scope.ghost_id,
        scope.session_slot,
        scope.run_id,
        scope.run_sequence,
        task_id,
        attempt,
    ]
    return "claim-" + hashlib.sha256(canonical_json(identity)).hexdigest()[:40]


# --- candidates -------------------------------------------------------------------


def acquire_candidate(
    scope: EventScope, task_id: str, paths: Iterable[str], attempt: int
) -> AppEventCandidate:
    """The acquisition candidate.  Raises ``RoomGhostPayloadError`` when malformed."""

    return build_room_ghost_candidate(
        scope,
        K.TASK_CLAIM_ACQUIRED,
        {
            "claim_id": claim_id_for(scope, task_id, attempt)
            if type(task_id) is str and type(attempt) is int
            else None,
            "task_id": task_id,
            "paths": list(paths) if not isinstance(paths, str) else paths,
            "attempt": attempt,
        },
    )


def release_candidate(
    claim: TaskClaim, terminal_record_id: str, outcome: str
) -> AppEventCandidate:
    """The release candidate of ``claim`` after ``terminal_record_id``."""

    return build_room_ghost_candidate(
        claim.scope,
        K.TASK_CLAIM_RELEASED,
        {
            "claim_id": claim.claim_id,
            "task_id": claim.task_id,
            "terminal_record_id": terminal_record_id,
            "outcome": outcome,
        },
    )


# --- fold ---------------------------------------------------------------------------


def _apply(claims: dict[str, TaskClaim], record: RoomGhostRecord) -> str | None:
    """Apply one record in place, or return a diagnostic code and change nothing."""

    data = record.data
    claim_id = cast(str, data["claim_id"])
    task_id = cast(str, data["task_id"])
    active = [claim for claim in claims.values() if claim.active]
    if record.kind is K.TASK_CLAIM_ACQUIRED:
        paths = tuple(cast(list[str], data["paths"]))
        attempt = cast(int, data["attempt"])
        if claim_id in claims:
            return "duplicate_claim"
        if claim_id != claim_id_for(record.scope, task_id, attempt):
            return "claim_identity_mismatch"
        if any(claim.scope == record.scope for claim in active):
            return "run_has_claim"
        if any(claim.task_id == task_id for claim in active):
            return "task_claimed"
        if any(claims_may_overlap(claim.paths, paths) for claim in active):
            return "claim_overlap"
        if len(active) >= MAX_ACTIVE_CLAIMS:
            return "workshop_full"
        claims[claim_id] = TaskClaim(
            claim_id=claim_id,
            run_id=record.scope.run_id,
            task_id=task_id,
            paths=paths,
            acquired_record_id=record.record_id,
            scope=record.scope,
            attempt=attempt,
            acquired_sequence=record.sequence,
        )
        return None

    current = claims.get(claim_id)
    if current is None:
        return "claim_missing"
    if not current.active:
        return "already_released"
    if current.task_id != task_id or current.scope != record.scope:
        return "claim_mismatch"
    outcome = cast(str, data["outcome"])
    terminal = cast(str, data["terminal_record_id"])
    if (outcome == "not_started") != (terminal == current.acquired_record_id):
        # A provisional release names its own acquisition; any other release
        # names the acknowledged terminal outcome of the run.
        return "terminal_mismatch"
    claims[claim_id] = replace(
        current,
        state=ClaimState.RELEASED,
        released_record_id=record.record_id,
        release_outcome=outcome,
    )
    return None


_CLAIM_KINDS = frozenset({K.TASK_CLAIM_ACQUIRED, K.TASK_CLAIM_RELEASED})


def fold_claims(events: Iterable[AppEvent]) -> ClaimLedger:
    """Fold acknowledged canonical records into the claim ledger."""

    claims: dict[str, TaskClaim] = {}
    diagnostics: list[ClaimDiagnostic] = []
    selection = select_room_ghost_records(events)
    for sequence in selection.invalid_sequences:
        diagnostics.append(ClaimDiagnostic(sequence, "invalid_payload", "invalid_payload"))
    for record in selection.records:
        if record.kind not in _CLAIM_KINDS:
            continue
        code = _apply(claims, record)
        if code is not None:
            diagnostics.append(ClaimDiagnostic(record.sequence, record.kind.value, code))
    diagnostics.sort(key=lambda item: item.sequence)
    return ClaimLedger(MappingProxyType(claims), tuple(diagnostics))


# --- decisions ----------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ClaimDecision:
    """A candidate to compare-and-append, or a refusal that appends nothing."""

    ok: bool
    code: str
    candidate: AppEventCandidate | None = None
    claim_id: str | None = None


def _dry_run(candidate: AppEventCandidate, ledger: ClaimLedger) -> str | None:
    payload = cast(dict, candidate.payload)
    record = RoomGhostRecord(
        kind=RoomGhostEventKind(payload["kind"]),
        entity_id=payload["entity_id"],
        data=payload["data"],
        event_id="",
        record_id="",
        sequence=0,
        scope=candidate.scope,
    )
    return _apply(dict(ledger.claims), record)


def decide_acquire(
    ledger: ClaimLedger, scope: EventScope, task_id: str, paths: Iterable[str], attempt: int
) -> ClaimDecision:
    """Accept an acquisition only if its record would be a valid transition now."""

    try:
        candidate = acquire_candidate(scope, task_id, paths, attempt)
    except (RoomGhostPayloadError, TypeError):
        return ClaimDecision(False, "invalid_claim")
    code = _dry_run(candidate, ledger)
    if code is not None:
        return ClaimDecision(False, code)
    return ClaimDecision(True, "ok", candidate, cast(dict, candidate.payload)["entity_id"])


def decide_release(
    ledger: ClaimLedger, claim_id: object, terminal_record_id: str, outcome: str
) -> ClaimDecision:
    """Accept a release of an active claim; a released claim is a refusal."""

    claim = ledger.get(claim_id)
    if claim is None:
        return ClaimDecision(False, "claim_missing")
    if not claim.active:
        return ClaimDecision(False, "already_released", claim_id=claim.claim_id)
    try:
        candidate = release_candidate(claim, terminal_record_id, outcome)
    except RoomGhostPayloadError:
        return ClaimDecision(False, "invalid_release")
    code = _dry_run(candidate, ledger)
    if code is not None:
        return ClaimDecision(False, code)
    return ClaimDecision(True, "ok", candidate, claim.claim_id)


# --- Task_Claim_Gate (pure half) -----------------------------------------------------


@dataclass(frozen=True, slots=True)
class ClaimAccess:
    """Whether a request may be forwarded to the Spec 4 gates."""

    forward: bool
    code: str
    claim: TaskClaim | None = None


def authorize_claim_access(
    ledger: ClaimLedger,
    scope: EventScope,
    access: Access,
    path: object,
    *,
    claim_id: str | None = None,
) -> ClaimAccess:
    """Check trusted identity and the Path_Claim.  Never widens anything.

    ``scope`` is the session's trusted Event_Scope.  ``claim_id`` is the
    identifier the house bound to the run, when the caller holds one; a
    different or released claim is refused.  A mutating access must lie
    inside the claim.  A read needs only the active claim: what may be read
    is still decided by the Room_Policy afterwards.
    """

    if not isinstance(scope, EventScope) or not isinstance(access, Access):
        return ClaimAccess(False, "task_claim_required")
    claim = ledger.active_for_scope(scope)
    if claim is None:
        return ClaimAccess(False, "task_claim_required")
    if claim_id is not None and claim_id != claim.claim_id:
        return ClaimAccess(False, "task_claim_mismatch")
    if access in MUTATING_ACCESS and (
        type(path) is not str or not claim_covers(claim.paths, path)
    ):
        return ClaimAccess(False, "outside_task_claim", claim)
    return ClaimAccess(True, "ok", claim)
