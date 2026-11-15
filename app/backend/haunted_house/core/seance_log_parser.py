"""Pure Canonical_Parser for the physical séance Event_Log.

The parser reads canonical JSON lines and classifies every problem as one of
two kinds:

* an *independent line diagnostic* — a line that is not one complete, valid,
  supported canonical record.  It is reported with its one-based line number
  and skipped; later independently valid records are still read.
* an *integrity failure* — a structurally valid record whose Sequence, hash
  link, record hash, integrity mode, or Record_ID contradicts the records
  before it.  Parsing stops there.  Only records before the first integrity
  failure are authoritative, and nothing is repaired.

A corrupted record therefore never hides a gap: the next valid record no
longer continues the Sequence (or the hash chain) and becomes the first
integrity failure.

This module performs no filesystem, network, environment, or clock access.
Diagnostics carry fixed codes, a line number, and a schema field name only.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from dataclasses import dataclass
from typing import cast

from haunted_house.core.seance_event import (
    AppEvent,
    EventValidationCode,
    validate_event,
)
from haunted_house.core.seance_persistence import (
    GENESIS_HASH,
    WriterDiagnostic,
    WriterDiagnosticCode,
    calculate_event_hash,
)

__all__ = [
    "MAX_LINE_DIAGNOSTICS",
    "ParsedEventLog",
    "parse_event_line",
    "parse_event_log",
    "split_log_lines",
]

# A log with more unreadable lines than this is not worth recovering; the
# parser stops so a damaged file cannot produce an unbounded diagnostic list.
MAX_LINE_DIAGNOSTICS = 64


@dataclass(frozen=True, slots=True)
class ParsedEventLog:
    """The authoritative records of one physical log plus safe diagnostics.

    ``events`` holds every valid record before the first integrity failure,
    in physical order, skipping independently malformed lines.
    ``valid_prefix_lines`` counts the leading physical lines that precede the
    first diagnostic of any kind and ``valid_prefix_sequence`` is the Sequence
    of the last record inside that leading prefix.  ``integrity_failure_line``
    is the one-based line of the first integrity failure, or ``None``.
    """

    events: tuple[AppEvent, ...] = ()
    highest_sequence: int = 0
    valid_prefix_sequence: int = 0
    valid_prefix_lines: int = 0
    integrity_linked: bool | None = None
    last_hash: str | None = None
    diagnostics: tuple[WriterDiagnostic, ...] = ()
    integrity_failure_line: int | None = None

    @property
    def ok(self) -> bool:
        return not self.diagnostics


class _LineError(ValueError):
    pass


def split_log_lines(data: bytes) -> tuple[bytes, ...]:
    """Split raw log bytes into physical lines, keeping each line ending.

    A final fragment without a newline is returned as its own incomplete
    line so the parser can report it instead of silently dropping it.
    """

    return tuple(_split_on_newline(data))


def parse_event_line(raw_line: bytes, line: int) -> AppEvent | WriterDiagnostic:
    """Parse one physical line into a valid record or a line diagnostic."""

    if not raw_line.endswith(b"\n"):
        return _line_diagnostic(
            WriterDiagnosticCode.INVALID_RECORD, "incomplete_json_line", line
        )
    try:
        raw = json.loads(
            raw_line.decode("utf-8"),
            object_pairs_hook=_unique_object,
            parse_constant=_reject_constant,
        )
    except (UnicodeDecodeError, ValueError, RecursionError):
        return _line_diagnostic(
            WriterDiagnosticCode.INVALID_RECORD, "malformed_json_line", line
        )

    validated = validate_event(raw)
    if validated.error is not None:
        code = (
            WriterDiagnosticCode.UNSUPPORTED_SCHEMA
            if validated.error.code is EventValidationCode.UNSUPPORTED_SCHEMA
            else WriterDiagnosticCode.INVALID_RECORD
        )
        return _line_diagnostic(
            code,
            validated.error.reason.value,
            line,
            path=validated.error.field,
        )
    return cast(AppEvent, validated.value)


def parse_event_log(lines: bytes | Iterable[bytes]) -> ParsedEventLog:
    """Parse physical lines and verify Sequence and hash-chain integrity.

    ``lines`` is the raw log bytes or an iterable of physical lines that keep
    their line endings.  An empty log yields no records, Sequence zero, and no
    diagnostic.  The function never raises for malformed content.
    """

    physical = split_log_lines(lines) if isinstance(lines, bytes) else lines

    events: list[AppEvent] = []
    record_ids: set[str] = set()
    diagnostics: list[WriterDiagnostic] = []
    linked: bool | None = None
    last_hash: str | None = None
    valid_prefix_lines = 0
    valid_prefix_sequence = 0
    integrity_failure_line: int | None = None

    for line_number, raw_line in enumerate(physical, start=1):
        parsed = parse_event_line(raw_line, line_number)
        if isinstance(parsed, WriterDiagnostic):
            diagnostics.append(parsed)
            if len(diagnostics) >= MAX_LINE_DIAGNOSTICS:
                integrity_failure_line = line_number
                break
            continue

        failure = _integrity_failure(
            parsed,
            line_number,
            expected_sequence=(events[-1].sequence + 1) if events else 1,
            linked=linked,
            last_hash=last_hash,
            record_ids=record_ids,
        )
        if failure is not None:
            diagnostics.append(failure)
            integrity_failure_line = line_number
            break

        if linked is None:
            linked = parsed.prev_hash is not None
        if linked:
            last_hash = parsed.hash
        events.append(parsed)
        record_ids.add(parsed.record_id)
        if not diagnostics:
            valid_prefix_lines = line_number
            valid_prefix_sequence = parsed.sequence

    return ParsedEventLog(
        events=tuple(events),
        highest_sequence=events[-1].sequence if events else 0,
        valid_prefix_sequence=valid_prefix_sequence,
        valid_prefix_lines=valid_prefix_lines,
        integrity_linked=linked,
        last_hash=last_hash,
        diagnostics=tuple(diagnostics),
        integrity_failure_line=integrity_failure_line,
    )


def _integrity_failure(
    event: AppEvent,
    line: int,
    *,
    expected_sequence: int,
    linked: bool | None,
    last_hash: str | None,
    record_ids: set[str],
) -> WriterDiagnostic | None:
    if event.sequence != expected_sequence:
        code = (
            WriterDiagnosticCode.DUPLICATE_SEQUENCE
            if event.sequence < expected_sequence
            else WriterDiagnosticCode.MISSING_SEQUENCE
        )
        return _line_diagnostic(
            code, "sequence_not_contiguous", line, path="sequence"
        )

    event_linked = event.prev_hash is not None
    if linked is not None and linked != event_linked:
        return _line_diagnostic(
            WriterDiagnosticCode.MIXED_INTEGRITY_MODE,
            "integrity_mode_changed",
            line,
        )

    if event_linked:
        expected_previous = last_hash if last_hash is not None else GENESIS_HASH
        if event.prev_hash != expected_previous:
            return _line_diagnostic(
                WriterDiagnosticCode.HASH_LINK_BROKEN,
                "previous_hash_mismatch",
                line,
                path="prev_hash",
            )
        if event.hash != calculate_event_hash(event):
            return _line_diagnostic(
                WriterDiagnosticCode.HASH_MISMATCH,
                "record_hash_mismatch",
                line,
                path="hash",
            )

    if event.record_id in record_ids:
        return _line_diagnostic(
            WriterDiagnosticCode.INVALID_RECORD,
            "duplicate_record_id",
            line,
            path="record_id",
        )
    return None


def _split_on_newline(data: bytes) -> list[bytes]:
    # Only the newline byte ends a canonical line; a bare carriage return
    # stays inside its line and is rejected there.
    pieces = data.split(b"\n")
    lines = [piece + b"\n" for piece in pieces[:-1]]
    if pieces[-1]:
        lines.append(pieces[-1])
    return lines


def _line_diagnostic(
    code: WriterDiagnosticCode,
    detail: str,
    line: int,
    *,
    path: str | None = None,
) -> WriterDiagnostic:
    return WriterDiagnostic(code=code, safe_detail=detail, line=line, path=path)


def _unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise _LineError()
        result[key] = value
    return result


def _reject_constant(_value: str) -> object:
    raise _LineError()
