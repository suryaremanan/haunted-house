"""Pure preparation and writer contracts for the canonical séance log.

The persistence boundary validates a complete candidate batch, redacts every
JSON string, checks that no sensitive value remains, and only then calculates
Event_ID and Record_ID.  This module performs no filesystem, network,
environment, logging, or clock access.  The filesystem adapter supplies
Sequence, persistence time, and optional integrity links.
"""

from __future__ import annotations

import hashlib
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from enum import StrEnum
from typing import Literal, Protocol, cast

from haunted_house.core.deep_redact import (
    DeepRedactionError,
    deep_redact,
    detect_redaction_residual,
)
from haunted_house.core.seance_event import (
    HASH_PREFIX,
    AppEvent,
    AppEventCandidate,
    EventValidationException,
    JSONValue,
    app_event_to_dict,
    calculate_event_id,
    calculate_record_id,
    candidate_to_dict,
    canonical_json,
    validate_candidate,
    validate_event,
)

__all__ = [
    "GENESIS_HASH",
    "MAX_READ_LIMIT",
    "AppendResult",
    "CandidatePreparationResult",
    "CanonicalEventWriter",
    "CanonicalReadResult",
    "PreparedCandidate",
    "WriterDiagnostic",
    "WriterDiagnosticCode",
    "WriterStatus",
    "build_app_event",
    "calculate_event_hash",
    "prepare_candidates",
    "serialize_app_event",
]

GENESIS_HASH = HASH_PREFIX + "0" * 64
MAX_READ_LIMIT = 500


class WriterDiagnosticCode(StrEnum):
    """Stable diagnostic categories shared by writer and parser results."""

    INVALID_CANDIDATE = "invalid_candidate"
    INVALID_RECORD = "invalid_record"
    UNSUPPORTED_SCHEMA = "unsupported_schema"
    DUPLICATE_SEQUENCE = "duplicate_sequence"
    MISSING_SEQUENCE = "missing_sequence"
    HASH_MISMATCH = "hash_mismatch"
    HASH_LINK_BROKEN = "hash_link_broken"
    MIXED_INTEGRITY_MODE = "mixed_integrity_mode"
    CONFLICTING_VARIANT = "conflicting_variant"
    PERSISTENCE_FAILED = "persistence_failed"


WriterStatus = Literal[
    "ok",
    "conflict",
    "invalid",
    "invalid_log",
    "mansion_not_found",
    "log_not_found",
    "unsafe_path",
    "failed",
]


@dataclass(frozen=True, slots=True)
class WriterDiagnostic:
    """A bounded diagnostic that never carries rejected values or paths."""

    code: WriterDiagnosticCode
    safe_detail: str
    candidate_index: int | None = None
    line: int | None = None
    path: str | None = None


@dataclass(frozen=True, slots=True)
class PreparedCandidate:
    """A validated, redacted candidate with deterministic identifiers."""

    candidate: AppEventCandidate
    event_id: str
    record_id: str


@dataclass(frozen=True, slots=True)
class CandidatePreparationResult:
    """All prepared candidates, or diagnostics for a rejected whole batch."""

    candidates: tuple[PreparedCandidate, ...] = ()
    diagnostics: tuple[WriterDiagnostic, ...] = ()

    @property
    def ok(self) -> bool:
        return not self.diagnostics


@dataclass(frozen=True, slots=True)
class AppendResult:
    """Canonical acknowledgements from one append or compare-and-append."""

    events: tuple[AppEvent, ...] = ()
    duplicate_record_ids: tuple[str, ...] = ()
    highest_sequence: int = 0
    diagnostics: tuple[WriterDiagnostic, ...] = ()
    status: WriterStatus = "ok"


@dataclass(frozen=True, slots=True)
class CanonicalReadResult:
    """One physical page and the authoritative valid-prefix boundary."""

    events: tuple[AppEvent, ...] = ()
    highest_sequence: int = 0
    valid_prefix_sequence: int = 0
    valid_prefix_lines: int = 0
    diagnostics: tuple[WriterDiagnostic, ...] = ()
    status: WriterStatus = "ok"

    @property
    def integrity_ok(self) -> bool:
        return self.status == "ok" and not self.diagnostics


class CanonicalEventWriter(Protocol):
    """The only mutation interface exposed to backend event producers."""

    async def append_candidates(
        self, mansion_id: str, candidates: Sequence[object]
    ) -> AppendResult: ...

    async def compare_and_append(
        self,
        mansion_id: str,
        expected_sequence: int,
        candidates: Sequence[object],
    ) -> AppendResult: ...

    async def read_after(
        self, mansion_id: str, after_sequence: int, limit: int
    ) -> CanonicalReadResult: ...


def prepare_candidates(
    candidates: Sequence[object],
    known_secrets: Iterable[str | None] = (),
    *,
    forbidden_document_bodies: Iterable[str] = (),
) -> CandidatePreparationResult:
    """Validate, redact, residual-check, and identify one atomic batch.

    The returned tuple is empty if any member fails.  Diagnostics contain only
    a candidate index, a schema field, and fixed categories.  Candidate data,
    secret values, document bodies, and payload keys are never copied into a
    diagnostic.
    """

    try:
        batch = tuple(candidates)
        secrets = tuple(known_secrets)
        bodies = tuple(forbidden_document_bodies)
    except (TypeError, ValueError, RuntimeError):
        return CandidatePreparationResult(
            diagnostics=(_invalid_candidate_detail("invalid_batch"),)
        )

    prepared: list[PreparedCandidate] = []
    diagnostics: list[WriterDiagnostic] = []
    for index, raw in enumerate(batch):
        initial = validate_candidate(raw)
        if initial.error is not None:
            diagnostics.append(
                WriterDiagnostic(
                    code=WriterDiagnosticCode(initial.error.code.value),
                    safe_detail=initial.error.reason.value,
                    candidate_index=index,
                    path=initial.error.field,
                )
            )
            continue

        candidate = cast(AppEventCandidate, initial.value)
        try:
            redacted_json = deep_redact(
                cast(JSONValue, candidate_to_dict(candidate)), secrets
            )
            residual = detect_redaction_residual(
                redacted_json,
                secrets,
                forbidden_document_bodies=bodies,
            )
        except DeepRedactionError as error:
            diagnostics.append(
                WriterDiagnostic(
                    code=WriterDiagnosticCode.INVALID_CANDIDATE,
                    safe_detail=error.code.value,
                    candidate_index=index,
                )
            )
            continue

        if residual is not None:
            diagnostics.append(
                WriterDiagnostic(
                    code=WriterDiagnosticCode.INVALID_CANDIDATE,
                    safe_detail=residual.category.value,
                    candidate_index=index,
                )
            )
            continue

        final = validate_candidate(redacted_json)
        if final.error is not None:
            diagnostics.append(
                WriterDiagnostic(
                    code=WriterDiagnosticCode(final.error.code.value),
                    safe_detail=final.error.reason.value,
                    candidate_index=index,
                    path=final.error.field,
                )
            )
            continue

        redacted_candidate = cast(AppEventCandidate, final.value)
        prepared.append(
            PreparedCandidate(
                candidate=redacted_candidate,
                event_id=calculate_event_id(redacted_candidate),
                record_id=calculate_record_id(redacted_candidate),
            )
        )

    if diagnostics:
        return CandidatePreparationResult(diagnostics=tuple(diagnostics))
    return CandidatePreparationResult(candidates=tuple(prepared))


def build_app_event(
    prepared: PreparedCandidate,
    *,
    sequence: int,
    persisted_at_ms: int,
    prev_hash: str | None,
) -> AppEvent:
    """Assign writer metadata and optionally hash-link one prepared record."""

    candidate = prepared.candidate
    placeholder_hash = GENESIS_HASH if prev_hash is not None else None
    event = AppEvent(
        schema_version=candidate.schema_version,
        event_id=prepared.event_id,
        record_id=prepared.record_id,
        sequence=sequence,
        event_type=candidate.event_type,
        scope=candidate.scope,
        source=candidate.source,
        caused_by=cast(tuple[str, ...], candidate.caused_by),
        occurred_at_ms=candidate.occurred_at_ms,
        persisted_at_ms=persisted_at_ms,
        payload=candidate.payload,
        prev_hash=prev_hash,
        hash=placeholder_hash,
    )
    if prev_hash is not None:
        event = AppEvent(
            schema_version=event.schema_version,
            event_id=event.event_id,
            record_id=event.record_id,
            sequence=event.sequence,
            event_type=event.event_type,
            scope=event.scope,
            source=event.source,
            caused_by=event.caused_by,
            occurred_at_ms=event.occurred_at_ms,
            persisted_at_ms=event.persisted_at_ms,
            payload=event.payload,
            prev_hash=event.prev_hash,
            hash=calculate_event_hash(event),
        )

    result = validate_event(event)
    if result.error is not None:
        raise EventValidationException(result.error)
    return cast(AppEvent, result.value)


def calculate_event_hash(event: AppEvent) -> str:
    """Calculate the linked-record hash over every field except ``hash``."""

    if event.prev_hash is None or event.hash is None:
        raise ValueError("hash_pair_required")
    raw = app_event_to_dict(event)
    del raw["hash"]
    return HASH_PREFIX + hashlib.sha256(canonical_json(raw)).hexdigest()


def serialize_app_event(event: AppEvent) -> bytes:
    """Return one deterministic UTF-8 JSON object and one trailing newline."""

    return canonical_json(app_event_to_dict(event)) + b"\n"


def _invalid_candidate_detail(detail: str) -> WriterDiagnostic:
    return WriterDiagnostic(
        code=WriterDiagnosticCode.INVALID_CANDIDATE,
        safe_detail=detail,
    )
