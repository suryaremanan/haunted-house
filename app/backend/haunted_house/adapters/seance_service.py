"""Backend persistence pipeline for raw Crew envelopes and history recovery.

``SeanceService`` joins the pure pieces without owning storage: it reads
acknowledged records through the ``CanonicalEventWriter`` interface, folds
them into the server scope registry, runs the one Backend_Normalizer, and
appends the resulting candidates through the same writer.  It never receives
a log path or file handle, keeps no state between calls, and has no second
copy of the Crew mapping.

Live ingest and history reconciliation share one path:

    envelopes -> scope registry -> normalizer -> writer -> acknowledged events

A batch is atomic.  One envelope with an unregistered slot, a missing source
identifier, or an invalid JSON value rejects the whole batch before anything
is appended.  An approval decision whose permission ``mid`` is not yet known
is not an error: its decision evidence is persisted, no approval fact is
invented, and the slot is returned for history reconciliation.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Literal, Protocol

from haunted_house.adapters.gateway_client import GatewayError
from haunted_house.core.crew_event_normalizer import (
    CrewEnvelope,
    NormalizationContext,
    NormalizationDiagnosticCode,
    normalize_crew_envelope,
)
from haunted_house.core.mansion_names import is_valid_mansion_name
from haunted_house.core.seance_event import (
    MAX_INGEST_BATCH_SIZE,
    AppEvent,
    AppEventCandidate,
)
from haunted_house.core.seance_history import plan_history_recovery
from haunted_house.core.seance_persistence import (
    MAX_READ_LIMIT,
    CanonicalEventWriter,
    CanonicalReadResult,
    WriterDiagnostic,
)
from haunted_house.core.seance_scope_registry import (
    ScopeRegistry,
    build_scope_registry,
)

__all__ = [
    "MAX_RECONCILE_SLOTS",
    "EnvelopeDiagnostic",
    "IngestOutcome",
    "ReconcileOutcome",
    "SeanceService",
    "SeanceStatus",
    "SessionHistoryReader",
    "SlotRecovery",
]

MAX_RECONCILE_SLOTS = 8

SeanceStatus = Literal[
    "ok",
    "invalid_mansion_id",
    "invalid_request",
    "invalid_envelope",
    "invalid_candidate",
    "mansion_not_found",
    "log_not_found",
    "log_integrity_failed",
    "persistence_failed",
]

SlotRecoveryStatus = Literal["recovered", "history_partial", "history_unavailable"]


class SessionHistoryReader(Protocol):
    """The one gateway read reconciliation needs (``GatewayClient`` has it)."""

    async def session_history(self, slot: str) -> dict[str, Any]: ...


@dataclass(frozen=True, slots=True)
class EnvelopeDiagnostic:
    """A safe, typed normalization diagnostic for one envelope of a batch."""

    index: int
    code: str
    field: str
    reason: str


@dataclass(frozen=True, slots=True)
class IngestOutcome:
    status: SeanceStatus = "ok"
    events: tuple[AppEvent, ...] = ()
    duplicate_record_ids: tuple[str, ...] = ()
    highest_sequence: int = 0
    envelope_diagnostics: tuple[EnvelopeDiagnostic, ...] = ()
    writer_diagnostics: tuple[WriterDiagnostic, ...] = ()
    reconcile_slots: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class SlotRecovery:
    slot: str
    status: SlotRecoveryStatus
    reasons: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class ReconcileOutcome:
    status: SeanceStatus = "ok"
    events: tuple[AppEvent, ...] = ()
    duplicate_record_ids: tuple[str, ...] = ()
    highest_sequence: int = 0
    slots: tuple[SlotRecovery, ...] = ()
    envelope_diagnostics: tuple[EnvelopeDiagnostic, ...] = ()
    writer_diagnostics: tuple[WriterDiagnostic, ...] = ()

    @property
    def history_partial(self) -> bool:
        return any(slot.status != "recovered" for slot in self.slots)


@dataclass(frozen=True, slots=True)
class _Loaded:
    status: SeanceStatus
    events: tuple[AppEvent, ...] = ()
    highest_sequence: int = 0
    diagnostics: tuple[WriterDiagnostic, ...] = ()


@dataclass(frozen=True, slots=True)
class _Appended:
    status: SeanceStatus = "ok"
    events: tuple[AppEvent, ...] = ()
    duplicate_record_ids: tuple[str, ...] = ()
    highest_sequence: int = 0
    diagnostics: tuple[WriterDiagnostic, ...] = ()


class SeanceService:
    """Normalize and persist Crew envelopes through the sole event writer."""

    def __init__(
        self,
        writer: CanonicalEventWriter,
        *,
        history: SessionHistoryReader | None = None,
    ) -> None:
        self._writer = writer
        self._history = history

    async def ingest(
        self, mansion_id: object, envelopes: Sequence[CrewEnvelope]
    ) -> IngestOutcome:
        """Persist the facts of one raw-envelope batch, or reject it whole."""

        if not _valid_mansion_id(mansion_id):
            return IngestOutcome(status="invalid_mansion_id")
        assert isinstance(mansion_id, str)
        if not 1 <= len(envelopes) <= MAX_INGEST_BATCH_SIZE:
            return IngestOutcome(status="invalid_request")

        loaded = await self._load(mansion_id)
        if loaded.status != "ok":
            return IngestOutcome(
                status=loaded.status,
                highest_sequence=loaded.highest_sequence,
                writer_diagnostics=loaded.diagnostics,
            )

        registry = build_scope_registry(mansion_id, loaded.events)
        context = NormalizationContext(
            scope_by_slot=registry.scope_by_slot,
            approval_mid_by_decision={},
        )
        candidates: list[AppEventCandidate] = []
        rejected: list[EnvelopeDiagnostic] = []
        unmatched: list[EnvelopeDiagnostic] = []
        reconcile_slots: list[str] = []
        for index, envelope in enumerate(envelopes):
            result = normalize_crew_envelope(envelope, context)
            diagnostic = result.diagnostic
            if diagnostic is None:
                candidates.extend(result.candidates)
                continue
            entry = EnvelopeDiagnostic(
                index=index,
                code=diagnostic.code.value,
                field=diagnostic.field,
                reason=diagnostic.reason.value,
            )
            if diagnostic.code is NormalizationDiagnosticCode.APPROVAL_UNMATCHED:
                candidates.extend(result.candidates)
                unmatched.append(entry)
                for slot in result.reconcile_slots:
                    if slot not in reconcile_slots:
                        reconcile_slots.append(slot)
            else:
                rejected.append(entry)

        if rejected:
            return IngestOutcome(
                status="invalid_envelope",
                highest_sequence=loaded.highest_sequence,
                envelope_diagnostics=tuple(rejected),
            )

        appended = await self._append(mansion_id, candidates, loaded)
        return IngestOutcome(
            status=appended.status,
            events=appended.events,
            duplicate_record_ids=appended.duplicate_record_ids,
            highest_sequence=appended.highest_sequence,
            envelope_diagnostics=tuple(unmatched) if appended.status == "ok" else (),
            writer_diagnostics=appended.diagnostics,
            reconcile_slots=tuple(reconcile_slots) if appended.status == "ok" else (),
        )

    async def read_events(
        self, mansion_id: object, after_sequence: int, limit: int
    ) -> CanonicalReadResult:
        """Return one canonical page; the writer validates every argument."""

        if not _valid_mansion_id(mansion_id):
            return CanonicalReadResult(status="invalid")
        assert isinstance(mansion_id, str)
        return await self._writer.read_after(mansion_id, after_sequence, limit)

    async def reconcile(
        self, mansion_id: object, slots: Sequence[str]
    ) -> ReconcileOutcome:
        """Recover proved facts of registered slots from bounded Crew history."""

        if not _valid_mansion_id(mansion_id):
            return ReconcileOutcome(status="invalid_mansion_id")
        assert isinstance(mansion_id, str)
        requested = list(dict.fromkeys(slots))
        if not 1 <= len(requested) <= MAX_RECONCILE_SLOTS or len(requested) != len(slots):
            return ReconcileOutcome(status="invalid_request")

        loaded = await self._load(mansion_id)
        if loaded.status != "ok":
            return ReconcileOutcome(
                status=loaded.status,
                highest_sequence=loaded.highest_sequence,
                writer_diagnostics=loaded.diagnostics,
            )

        registry = build_scope_registry(mansion_id, loaded.events)
        unknown = tuple(
            EnvelopeDiagnostic(
                index=index,
                code=NormalizationDiagnosticCode.UNKNOWN_SESSION.value,
                field="slots",
                reason="unregistered_slot",
            )
            for index, slot in enumerate(requested)
            if registry.get(slot) is None
        )
        if unknown:
            # Only server-registered app-owned sessions are ever read.
            return ReconcileOutcome(
                status="invalid_envelope",
                highest_sequence=loaded.highest_sequence,
                envelope_diagnostics=unknown,
            )

        candidates: list[AppEventCandidate] = []
        recoveries: list[SlotRecovery] = []
        for slot in requested:
            recovery, recovered = await self._recover_slot(slot, registry, loaded.events)
            recoveries.append(recovery)
            candidates.extend(recovered)

        appended = await self._append(mansion_id, candidates, loaded)
        if appended.status != "ok":
            return ReconcileOutcome(
                status=appended.status,
                highest_sequence=appended.highest_sequence,
                writer_diagnostics=appended.diagnostics,
            )
        return ReconcileOutcome(
            events=_unique_events(appended.events),
            duplicate_record_ids=tuple(dict.fromkeys(appended.duplicate_record_ids)),
            highest_sequence=appended.highest_sequence,
            slots=tuple(recoveries),
            writer_diagnostics=appended.diagnostics,
        )

    async def _recover_slot(
        self,
        slot: str,
        registry: ScopeRegistry,
        persisted: tuple[AppEvent, ...],
    ) -> tuple[SlotRecovery, list[AppEventCandidate]]:
        registered = registry.get(slot)
        assert registered is not None
        if self._history is None:
            return SlotRecovery(slot, "history_unavailable", ("history_reader_missing",)), []
        try:
            history = await self._history.session_history(slot)
        except GatewayError as error:
            # Only the fixed kind: a gateway message never reaches a response.
            return SlotRecovery(slot, "history_unavailable", (f"gateway_{error.kind}",)), []

        plan = plan_history_recovery(history, registered, persisted)
        reasons = list(plan.partial_reasons)
        candidates: list[AppEventCandidate] = []
        for recovered in plan.envelopes:
            result = normalize_crew_envelope(
                recovered.envelope,
                NormalizationContext(
                    scope_by_slot=registry.scope_by_slot,
                    approval_mid_by_decision=recovered.approval_mid_by_decision,
                ),
            )
            if result.diagnostic is not None:
                # The history could not prove this fact; nothing is invented.
                if "envelope_unproved" not in reasons:
                    reasons.append("envelope_unproved")
                continue
            candidates.extend(result.candidates)
        status: SlotRecoveryStatus = "history_partial" if reasons else "recovered"
        return SlotRecovery(slot, status, tuple(reasons)), candidates

    async def _load(self, mansion_id: str) -> _Loaded:
        """Read every authoritative record of one Mansion through the writer."""

        events: list[AppEvent] = []
        after = 0
        while True:
            page = await self._writer.read_after(mansion_id, after, MAX_READ_LIMIT)
            if page.status != "ok":
                return _Loaded(
                    status=_READ_STATUS.get(page.status, "persistence_failed"),
                    highest_sequence=page.highest_sequence,
                    diagnostics=page.diagnostics,
                )
            if not page.events:
                return _Loaded(
                    status="ok",
                    events=tuple(events),
                    highest_sequence=page.highest_sequence,
                )
            events.extend(page.events)
            after = page.events[-1].sequence

    async def _append(
        self,
        mansion_id: str,
        candidates: Sequence[AppEventCandidate],
        loaded: _Loaded,
    ) -> _Appended:
        if not candidates:
            return _Appended(highest_sequence=loaded.highest_sequence)
        appended = await self._writer.append_candidates(mansion_id, candidates)
        return _Appended(
            status=(
                "ok"
                if appended.status == "ok"
                else _APPEND_STATUS.get(appended.status, "persistence_failed")
            ),
            events=appended.events,
            duplicate_record_ids=appended.duplicate_record_ids,
            highest_sequence=appended.highest_sequence,
            diagnostics=appended.diagnostics,
        )


# Writer statuses mapped to the service's stable outcome vocabulary.
_READ_STATUS: dict[str, SeanceStatus] = {
    "invalid": "invalid_mansion_id",
    "mansion_not_found": "mansion_not_found",
    "unsafe_path": "mansion_not_found",
    "log_not_found": "log_not_found",
    "invalid_log": "log_integrity_failed",
    "failed": "persistence_failed",
}
_APPEND_STATUS: dict[str, SeanceStatus] = {
    "invalid": "invalid_candidate",
    "mansion_not_found": "mansion_not_found",
    "unsafe_path": "mansion_not_found",
    "log_not_found": "log_not_found",
    "invalid_log": "log_integrity_failed",
    "conflict": "persistence_failed",
    "failed": "persistence_failed",
}


def _valid_mansion_id(value: object) -> bool:
    return type(value) is str and is_valid_mansion_name(value)


def _unique_events(events: Sequence[AppEvent]) -> tuple[AppEvent, ...]:
    return tuple({event.record_id: event for event in events}.values())
