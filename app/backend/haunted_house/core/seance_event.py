"""Pure canonical event models, validation, JSON, and identifiers.

This module defines Haunted House's only persisted event envelope.  It has no
filesystem, network, environment, logging, or clock dependencies.  Callers
must supply occurrence and persistence times explicitly.

Validation diagnostics deliberately contain only fixed codes and schema field
names.  They never include rejected values, payload keys, or object reprs.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from dataclasses import dataclass
from enum import StrEnum
from typing import Generic, Literal, TypeAlias, TypeVar, cast

__all__ = [
    "ALLOWED_EVENT_TYPES",
    "EVENT_TYPES",
    "HASH_PREFIX",
    "MAX_CAUSAL_PREDECESSORS",
    "MAX_IDENTIFIER_BYTES",
    "MAX_IDENTITY_PART_BYTES",
    "MAX_IDENTITY_PARTS",
    "MAX_INGEST_BATCH_SIZE",
    "MAX_INGEST_REQUEST_BYTES",
    "MAX_MANSION_ID_LENGTH",
    "MAX_PAYLOAD_BYTES",
    "SCHEMA_VERSION",
    "AppEvent",
    "AppEventCandidate",
    "CanonicalJsonError",
    "DomainEventPayload",
    "EventRef",
    "EventScope",
    "EventSource",
    "EventType",
    "EventValidationCode",
    "EventValidationError",
    "EventValidationException",
    "EventValidationReason",
    "JSONValue",
    "ValidationResult",
    "app_event_to_dict",
    "calculate_event_id",
    "calculate_record_id",
    "candidate_to_dict",
    "canonical_json",
    "canonical_json_text",
    "event_ref",
    "validate_app_event",
    "validate_app_event_candidate",
    "validate_candidate",
    "validate_event",
]

SCHEMA_VERSION = 1
MAX_MANSION_ID_LENGTH = 40
MAX_IDENTIFIER_BYTES = 160
MAX_IDENTITY_PARTS = 8
MAX_IDENTITY_PART_BYTES = 512
MAX_CAUSAL_PREDECESSORS = 32
MAX_PAYLOAD_BYTES = 256 * 1024
MAX_INGEST_BATCH_SIZE = 100
MAX_INGEST_REQUEST_BYTES = 1024 * 1024
HASH_PREFIX = "h1:"

EVENT_TYPES = (
    "run_started",
    "ghost_progressed",
    "message_recorded",
    "message_updated",
    "response_segment_started",
    "response_chunk_recorded",
    "crew_turn_ended",
    "crew_error_observed",
    "run_completed",
    "run_blocked",
    "run_failed",
    "tool_started",
    "tool_updated",
    "tool_finished",
    "approval_requested",
    "approval_decided",
    "decision_recorded",
    "domain_event_recorded",
    "source_event_observed",
)
ALLOWED_EVENT_TYPES = frozenset(EVENT_TYPES)

EventType: TypeAlias = Literal[
    "run_started",
    "ghost_progressed",
    "message_recorded",
    "message_updated",
    "response_segment_started",
    "response_chunk_recorded",
    "crew_turn_ended",
    "crew_error_observed",
    "run_completed",
    "run_blocked",
    "run_failed",
    "tool_started",
    "tool_updated",
    "tool_finished",
    "approval_requested",
    "approval_decided",
    "decision_recorded",
    "domain_event_recorded",
    "source_event_observed",
]
JSONScalar: TypeAlias = None | bool | int | float | str
JSONValue: TypeAlias = JSONScalar | list["JSONValue"] | dict[str, "JSONValue"]
# The requirements define a causal predecessor as an Event_ID.  The alias
# keeps candidate APIs explicit without inventing a second persisted shape.
EventRef: TypeAlias = str

_MANSION_ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
_EVENT_ID = re.compile(r"e1:[0-9a-f]{64}")
_RECORD_ID = re.compile(r"r1:[0-9a-f]{64}")
_HASH_ID = re.compile(r"h1:[0-9a-f]{64}")


@dataclass(frozen=True, slots=True)
class EventScope:
    mansion_id: str
    ghost_id: str
    session_slot: str
    run_id: str
    run_sequence: int


@dataclass(frozen=True, slots=True)
class EventSource:
    origin: Literal["crew", "house"]
    source_type: str
    identity_parts: tuple[str, ...]
    revision: int
    generation: str
    source_sequence: int


@dataclass(frozen=True, slots=True)
class DomainEventPayload:
    domain: str
    kind: str
    entity_id: str
    data: JSONValue


@dataclass(frozen=True, slots=True)
class AppEventCandidate:
    schema_version: Literal[1]
    event_type: EventType
    scope: EventScope
    source: EventSource
    caused_by: tuple[EventRef, ...]
    occurred_at_ms: int | None
    payload: JSONValue


@dataclass(frozen=True, slots=True)
class AppEvent:
    schema_version: Literal[1]
    event_id: str
    record_id: str
    sequence: int
    event_type: EventType
    scope: EventScope
    source: EventSource
    caused_by: tuple[str, ...]
    occurred_at_ms: int | None
    persisted_at_ms: int
    payload: JSONValue
    prev_hash: str | None = None
    hash: str | None = None


class EventValidationCode(StrEnum):
    INVALID_CANDIDATE = "invalid_candidate"
    INVALID_RECORD = "invalid_record"
    UNSUPPORTED_SCHEMA = "unsupported_schema"


class EventValidationReason(StrEnum):
    INVALID_TYPE = "invalid_type"
    MISSING_FIELD = "missing_field"
    UNKNOWN_FIELD = "unknown_field"
    UNSUPPORTED_VALUE = "unsupported_value"
    OUT_OF_RANGE = "out_of_range"
    INVALID_IDENTIFIER = "invalid_identifier"
    INVALID_JSON = "invalid_json"
    NON_FINITE_NUMBER = "non_finite_number"
    INVALID_UTF8 = "invalid_utf8"
    PAYLOAD_TOO_LARGE = "payload_too_large"
    HASH_PAIR_REQUIRED = "hash_pair_required"
    IDENTIFIER_MISMATCH = "identifier_mismatch"


@dataclass(frozen=True, slots=True)
class EventValidationError:
    """A bounded, redaction-safe schema diagnostic."""

    code: EventValidationCode
    field: str
    reason: EventValidationReason

    def as_dict(self) -> dict[str, str]:
        return {
            "code": self.code.value,
            "field": self.field,
            "reason": self.reason.value,
        }


T = TypeVar("T")


@dataclass(frozen=True, slots=True)
class ValidationResult(Generic[T]):
    value: T | None = None
    error: EventValidationError | None = None

    @property
    def ok(self) -> bool:
        return self.error is None


class EventValidationException(ValueError):
    """Raised by transforms that require an already-valid event value."""

    def __init__(self, error: EventValidationError) -> None:
        self.error = error
        super().__init__(
            f"{error.code.value}:{error.field}:{error.reason.value}"
        )


class CanonicalJsonError(ValueError):
    """A safe failure from :func:`canonical_json`."""

    def __init__(self, reason: EventValidationReason) -> None:
        self.reason = reason
        super().__init__(reason.value)


class _Invalid(Exception):
    def __init__(
        self,
        field: str,
        reason: EventValidationReason,
        *,
        unsupported_schema: bool = False,
    ) -> None:
        self.field = field
        self.reason = reason
        self.unsupported_schema = unsupported_schema


_CANDIDATE_FIELDS = frozenset(
    {
        "schema_version",
        "event_type",
        "scope",
        "source",
        "caused_by",
        "occurred_at_ms",
        "payload",
    }
)
_EVENT_REQUIRED_FIELDS = frozenset(
    {
        "schema_version",
        "event_id",
        "record_id",
        "sequence",
        "event_type",
        "scope",
        "source",
        "caused_by",
        "occurred_at_ms",
        "persisted_at_ms",
        "payload",
    }
)
_EVENT_OPTIONAL_FIELDS = frozenset({"prev_hash", "hash"})
_SCOPE_FIELDS = frozenset(
    {"mansion_id", "ghost_id", "session_slot", "run_id", "run_sequence"}
)
_SOURCE_FIELDS = frozenset(
    {
        "origin",
        "source_type",
        "identity_parts",
        "revision",
        "generation",
        "source_sequence",
    }
)
_DOMAIN_FIELDS = frozenset({"domain", "kind", "entity_id", "data"})


def canonical_json(value: object) -> bytes:
    """Return deterministic cross-runtime UTF-8 JSON without whitespace.

    Object keys use Unicode code-point order.  Finite numbers use the JSON
    number spelling produced by ECMAScript, including fixed notation from
    ``1e-6`` through values below ``1e21``.  This keeps Python identifiers and
    serialized records byte-for-byte equal to the browser implementation.
    A trailing newline belongs to the later log serializer.
    """

    issue = _json_issue(value)
    if issue is not None:
        raise CanonicalJsonError(issue)
    try:
        return _canonical_json_text(value).encode("utf-8")
    except (OverflowError, RecursionError, TypeError, UnicodeEncodeError, ValueError):
        raise CanonicalJsonError(EventValidationReason.INVALID_JSON) from None


def _canonical_json_text(value: object) -> str:
    if value is None:
        return "null"
    if type(value) is bool:
        return "true" if value else "false"
    if type(value) is int:
        return str(value)
    if type(value) is float:
        return _canonical_float(cast(float, value))
    if type(value) is str:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if type(value) is list:
        return "[" + ",".join(_canonical_json_text(item) for item in value) + "]"
    if type(value) is dict:
        record = cast(dict[str, object], value)
        return "{" + ",".join(
            json.dumps(key, ensure_ascii=False, separators=(",", ":"))
            + ":"
            + _canonical_json_text(record[key])
            for key in sorted(record)
        ) + "}"
    raise TypeError("value is not JSON-compatible")


def _canonical_float(value: float) -> str:
    """Spell a finite binary64 number like ``JSON.stringify``.

    Python and ECMAScript use the same shortest round-trippable digits but
    choose different fixed/exponent thresholds and exponent padding.  Expand
    Python's shortest representation in ECMAScript's fixed range and
    normalize the remaining exponent form.
    """

    if value == 0:
        return "0"

    negative = value < 0
    absolute = -value if negative else value
    raw = repr(absolute).lower()
    if "e" in raw:
        coefficient, exponent_text = raw.split("e", 1)
        exponent = int(exponent_text)
    else:
        coefficient = raw
        exponent = 0

    integer, dot, fraction = coefficient.partition(".")
    if dot and not fraction.strip("0"):
        fraction = ""
    digits = integer + fraction
    decimal_position = len(integer) + exponent

    if 1e-6 <= absolute < 1e21:
        if decimal_position <= 0:
            rendered = "0." + "0" * (-decimal_position) + digits
        elif decimal_position >= len(digits):
            rendered = digits + "0" * (decimal_position - len(digits))
        else:
            rendered = digits[:decimal_position] + "." + digits[decimal_position:]
    else:
        digits = digits.lstrip("0") or "0"
        scientific_exponent = decimal_position - 1
        rendered = digits[0]
        if len(digits) > 1:
            rendered += "." + digits[1:]
        sign = "+" if scientific_exponent >= 0 else "-"
        rendered += "e" + sign + str(abs(scientific_exponent))

    return "-" + rendered if negative else rendered


def canonical_json_text(value: object) -> str:
    return canonical_json(value).decode("utf-8")


def validate_candidate(value: object) -> ValidationResult[AppEventCandidate]:
    """Validate and normalize an AppEventCandidate without raising."""

    try:
        candidate = _parse_candidate(_candidate_input(value))
    except _Invalid as invalid:
        return ValidationResult(
            error=_error_for(invalid, EventValidationCode.INVALID_CANDIDATE)
        )
    return ValidationResult(value=candidate)


def validate_event(value: object) -> ValidationResult[AppEvent]:
    """Validate and normalize a persisted AppEvent without raising."""

    try:
        raw, has_prev_hash, has_hash = _event_input(value)
        _expect_fields(
            raw,
            _EVENT_REQUIRED_FIELDS,
            _EVENT_OPTIONAL_FIELDS,
            "$",
        )
        candidate_raw = {name: raw[name] for name in _CANDIDATE_FIELDS}
        candidate = _parse_candidate(candidate_raw)

        event_id = _digest_identifier(raw["event_id"], _EVENT_ID, "event_id")
        record_id = _digest_identifier(raw["record_id"], _RECORD_ID, "record_id")
        sequence = _positive_integer(raw["sequence"], "sequence")
        persisted_at_ms = _non_negative_integer(
            raw["persisted_at_ms"], "persisted_at_ms"
        )

        if has_prev_hash != has_hash:
            raise _Invalid(
                "prev_hash/hash", EventValidationReason.HASH_PAIR_REQUIRED
            )
        prev_hash: str | None = None
        record_hash: str | None = None
        if has_prev_hash:
            prev_hash = _digest_identifier(
                raw["prev_hash"], _HASH_ID, "prev_hash"
            )
            record_hash = _digest_identifier(raw["hash"], _HASH_ID, "hash")

        expected_event_id = _calculate_event_id(candidate)
        if event_id != expected_event_id:
            raise _Invalid("event_id", EventValidationReason.IDENTIFIER_MISMATCH)
        expected_record_id = _calculate_record_id(candidate)
        if record_id != expected_record_id:
            raise _Invalid("record_id", EventValidationReason.IDENTIFIER_MISMATCH)

        event = AppEvent(
            schema_version=SCHEMA_VERSION,
            event_id=event_id,
            record_id=record_id,
            sequence=sequence,
            event_type=candidate.event_type,
            scope=candidate.scope,
            source=candidate.source,
            caused_by=cast(tuple[str, ...], candidate.caused_by),
            occurred_at_ms=candidate.occurred_at_ms,
            persisted_at_ms=persisted_at_ms,
            payload=candidate.payload,
            prev_hash=prev_hash,
            hash=record_hash,
        )
    except _Invalid as invalid:
        return ValidationResult(error=_error_for(invalid, EventValidationCode.INVALID_RECORD))
    return ValidationResult(value=event)


# Explicit names make call sites self-documenting; concise aliases remain useful
# inside the writer and parser.
validate_app_event_candidate = validate_candidate
validate_app_event = validate_event


def calculate_event_id(value: AppEventCandidate | AppEvent) -> str:
    """Calculate Event_ID from stable source identity, scope, and event type.

    Writer metadata and mutable source revision/progress fields are excluded.
    The input's candidate portion must be valid; any error raised is bounded.
    """

    candidate = _valid_candidate_portion(value)
    return _calculate_event_id(candidate)


def calculate_record_id(value: AppEventCandidate | AppEvent) -> str:
    """Calculate Record_ID from only the complete canonical candidate.

    For AppEvent input, ``sequence``, ``persisted_at_ms``, ``event_id``,
    ``record_id``, ``prev_hash``, and ``hash`` are deliberately ignored.
    Event_ID is derived independently and is therefore not Record_ID input.
    """

    candidate = _valid_candidate_portion(value)
    return _calculate_record_id(candidate)


def event_ref(value: AppEventCandidate | AppEvent) -> EventRef:
    """Return the Event_ID that identifies ``value`` as a predecessor."""

    return calculate_event_id(value)


def candidate_to_dict(value: AppEventCandidate | AppEvent) -> dict[str, JSONValue]:
    """Return the candidate portion in its canonical JSON object shape."""

    candidate = _valid_candidate_portion(value)
    return _candidate_dict(candidate)


def app_event_to_dict(value: AppEvent) -> dict[str, JSONValue]:
    """Return a valid AppEvent in its canonical JSON object shape."""

    result = validate_event(value)
    if result.error is not None:
        raise EventValidationException(result.error)
    event = cast(AppEvent, result.value)
    output = _candidate_dict(_candidate_from_event(event))
    output.update(
        {
            "event_id": event.event_id,
            "record_id": event.record_id,
            "sequence": event.sequence,
            "persisted_at_ms": event.persisted_at_ms,
        }
    )
    if event.prev_hash is not None:
        output["prev_hash"] = event.prev_hash
        output["hash"] = cast(str, event.hash)
    return output


def _error_for(
    invalid: _Invalid, default_code: EventValidationCode
) -> EventValidationError:
    code = (
        EventValidationCode.UNSUPPORTED_SCHEMA
        if invalid.unsupported_schema
        else default_code
    )
    return EventValidationError(code=code, field=invalid.field, reason=invalid.reason)


def _candidate_input(value: object) -> dict[str, object]:
    if isinstance(value, AppEventCandidate):
        return {
            "schema_version": value.schema_version,
            "event_type": value.event_type,
            "scope": value.scope,
            "source": value.source,
            "caused_by": value.caused_by,
            "occurred_at_ms": value.occurred_at_ms,
            "payload": value.payload,
        }
    if type(value) is dict:
        return cast(dict[str, object], value)
    raise _Invalid("$", EventValidationReason.INVALID_TYPE)


def _event_input(value: object) -> tuple[dict[str, object], bool, bool]:
    if isinstance(value, AppEvent):
        raw: dict[str, object] = {
            "schema_version": value.schema_version,
            "event_id": value.event_id,
            "record_id": value.record_id,
            "sequence": value.sequence,
            "event_type": value.event_type,
            "scope": value.scope,
            "source": value.source,
            "caused_by": value.caused_by,
            "occurred_at_ms": value.occurred_at_ms,
            "persisted_at_ms": value.persisted_at_ms,
            "payload": value.payload,
        }
        if value.prev_hash is not None:
            raw["prev_hash"] = value.prev_hash
        if value.hash is not None:
            raw["hash"] = value.hash
        return raw, value.prev_hash is not None, value.hash is not None
    if type(value) is dict:
        raw = cast(dict[str, object], value)
        return raw, "prev_hash" in raw, "hash" in raw
    raise _Invalid("$", EventValidationReason.INVALID_TYPE)


def _parse_candidate(raw: dict[str, object]) -> AppEventCandidate:
    _expect_fields(raw, _CANDIDATE_FIELDS, frozenset(), "$")
    _schema_version(raw["schema_version"])
    event_type = _event_type(raw["event_type"])
    scope = _scope(raw["scope"])
    source = _source(raw["source"])
    caused_by = _caused_by(raw["caused_by"])
    occurred_at_ms = _optional_non_negative_integer(
        raw["occurred_at_ms"], "occurred_at_ms"
    )
    payload = _payload(raw["payload"], event_type)
    return AppEventCandidate(
        schema_version=SCHEMA_VERSION,
        event_type=event_type,
        scope=scope,
        source=source,
        caused_by=caused_by,
        occurred_at_ms=occurred_at_ms,
        payload=payload,
    )


def _expect_fields(
    value: object,
    required: frozenset[str],
    optional: frozenset[str],
    field: str,
) -> None:
    if type(value) is not dict:
        raise _Invalid(field, EventValidationReason.INVALID_TYPE)
    keys = set(cast(dict[object, object], value))
    if not all(type(key) is str for key in keys):
        raise _Invalid(field, EventValidationReason.UNKNOWN_FIELD)
    if not required.issubset(keys):
        raise _Invalid(field, EventValidationReason.MISSING_FIELD)
    if not keys.issubset(required | optional):
        raise _Invalid(field, EventValidationReason.UNKNOWN_FIELD)


def _schema_version(value: object) -> None:
    if type(value) is not int or value != SCHEMA_VERSION:
        raise _Invalid(
            "schema_version",
            EventValidationReason.UNSUPPORTED_VALUE,
            unsupported_schema=True,
        )


def _event_type(value: object) -> EventType:
    if type(value) is not str:
        raise _Invalid("event_type", EventValidationReason.INVALID_TYPE)
    if value not in ALLOWED_EVENT_TYPES:
        raise _Invalid("event_type", EventValidationReason.UNSUPPORTED_VALUE)
    return cast(EventType, value)


def _scope(value: object) -> EventScope:
    if isinstance(value, EventScope):
        raw: dict[str, object] = {
            "mansion_id": value.mansion_id,
            "ghost_id": value.ghost_id,
            "session_slot": value.session_slot,
            "run_id": value.run_id,
            "run_sequence": value.run_sequence,
        }
    elif type(value) is dict:
        raw = cast(dict[str, object], value)
    else:
        raise _Invalid("scope", EventValidationReason.INVALID_TYPE)
    _expect_fields(raw, _SCOPE_FIELDS, frozenset(), "scope")

    mansion_id = raw["mansion_id"]
    if (
        type(mansion_id) is not str
        or len(mansion_id) > MAX_MANSION_ID_LENGTH
        or _MANSION_ID.fullmatch(mansion_id) is None
    ):
        raise _Invalid("scope.mansion_id", EventValidationReason.INVALID_IDENTIFIER)

    return EventScope(
        mansion_id=mansion_id,
        ghost_id=_identifier(raw["ghost_id"], "scope.ghost_id"),
        session_slot=_identifier(raw["session_slot"], "scope.session_slot"),
        run_id=_identifier(raw["run_id"], "scope.run_id"),
        run_sequence=_non_negative_integer(
            raw["run_sequence"], "scope.run_sequence"
        ),
    )


def _source(value: object) -> EventSource:
    if isinstance(value, EventSource):
        raw: dict[str, object] = {
            "origin": value.origin,
            "source_type": value.source_type,
            "identity_parts": value.identity_parts,
            "revision": value.revision,
            "generation": value.generation,
            "source_sequence": value.source_sequence,
        }
    elif type(value) is dict:
        raw = cast(dict[str, object], value)
    else:
        raise _Invalid("source", EventValidationReason.INVALID_TYPE)
    _expect_fields(raw, _SOURCE_FIELDS, frozenset(), "source")

    origin = raw["origin"]
    if type(origin) is not str:
        raise _Invalid("source.origin", EventValidationReason.INVALID_TYPE)
    if origin not in ("crew", "house"):
        raise _Invalid("source.origin", EventValidationReason.UNSUPPORTED_VALUE)

    parts_value = raw["identity_parts"]
    if type(parts_value) not in (list, tuple):
        raise _Invalid("source.identity_parts", EventValidationReason.INVALID_TYPE)
    parts = cast(list[object] | tuple[object, ...], parts_value)
    if not 1 <= len(parts) <= MAX_IDENTITY_PARTS:
        raise _Invalid("source.identity_parts", EventValidationReason.OUT_OF_RANGE)
    identity_parts = tuple(
        _bounded_string(
            part,
            "source.identity_parts",
            maximum=MAX_IDENTITY_PART_BYTES,
            allow_empty=True,
        )
        for part in parts
    )

    generation = _bounded_string(
        raw["generation"],
        "source.generation",
        maximum=MAX_IDENTIFIER_BYTES,
        allow_empty=True,
    )
    return EventSource(
        origin=cast(Literal["crew", "house"], origin),
        source_type=_identifier(raw["source_type"], "source.source_type"),
        identity_parts=identity_parts,
        revision=_non_negative_integer(raw["revision"], "source.revision"),
        generation=generation,
        source_sequence=_non_negative_integer(
            raw["source_sequence"], "source.source_sequence"
        ),
    )


def _caused_by(value: object) -> tuple[EventRef, ...]:
    if type(value) not in (list, tuple):
        raise _Invalid("caused_by", EventValidationReason.INVALID_TYPE)
    refs = cast(list[object] | tuple[object, ...], value)
    if len(refs) > MAX_CAUSAL_PREDECESSORS:
        raise _Invalid("caused_by", EventValidationReason.OUT_OF_RANGE)
    return tuple(
        _digest_identifier(item, _EVENT_ID, "caused_by") for item in refs
    )


def _payload(value: object, event_type: EventType) -> JSONValue:
    if isinstance(value, DomainEventPayload):
        value = {
            "domain": value.domain,
            "kind": value.kind,
            "entity_id": value.entity_id,
            "data": value.data,
        }
    if event_type == "domain_event_recorded":
        value = _domain_payload(value)

    issue = _json_issue(value)
    if issue is not None:
        raise _Invalid("payload", issue)
    try:
        encoded = canonical_json(value)
    except CanonicalJsonError as error:
        raise _Invalid("payload", error.reason) from None
    if len(encoded) > MAX_PAYLOAD_BYTES:
        raise _Invalid("payload", EventValidationReason.PAYLOAD_TOO_LARGE)
    return cast(JSONValue, value)


def _domain_payload(value: object) -> dict[str, JSONValue]:
    if type(value) is not dict:
        raise _Invalid("payload", EventValidationReason.INVALID_TYPE)
    raw = cast(dict[str, object], value)
    _expect_fields(raw, _DOMAIN_FIELDS, frozenset(), "payload")
    data_issue = _json_issue(raw["data"])
    if data_issue is not None:
        raise _Invalid("payload.data", data_issue)
    return {
        "domain": _identifier(raw["domain"], "payload.domain"),
        "kind": _identifier(raw["kind"], "payload.kind"),
        "entity_id": _identifier(raw["entity_id"], "payload.entity_id"),
        "data": cast(JSONValue, raw["data"]),
    }


def _identifier(value: object, field: str) -> str:
    return _bounded_string(
        value,
        field,
        maximum=MAX_IDENTIFIER_BYTES,
        allow_empty=False,
    )


def _bounded_string(
    value: object,
    field: str,
    *,
    maximum: int,
    allow_empty: bool,
) -> str:
    if type(value) is not str:
        raise _Invalid(field, EventValidationReason.INVALID_TYPE)
    try:
        encoded = value.encode("utf-8")
    except UnicodeEncodeError:
        raise _Invalid(field, EventValidationReason.INVALID_UTF8) from None
    if len(encoded) > maximum or (not allow_empty and not encoded):
        raise _Invalid(field, EventValidationReason.OUT_OF_RANGE)
    return value


def _non_negative_integer(value: object, field: str) -> int:
    if type(value) is not int:
        raise _Invalid(field, EventValidationReason.INVALID_TYPE)
    if value < 0:
        raise _Invalid(field, EventValidationReason.OUT_OF_RANGE)
    return value


def _positive_integer(value: object, field: str) -> int:
    result = _non_negative_integer(value, field)
    if result == 0:
        raise _Invalid(field, EventValidationReason.OUT_OF_RANGE)
    return result


def _optional_non_negative_integer(value: object, field: str) -> int | None:
    if value is None:
        return None
    return _non_negative_integer(value, field)


def _digest_identifier(value: object, pattern: re.Pattern[str], field: str) -> str:
    if type(value) is not str:
        raise _Invalid(field, EventValidationReason.INVALID_TYPE)
    if pattern.fullmatch(value) is None:
        raise _Invalid(field, EventValidationReason.INVALID_IDENTIFIER)
    return value


def _json_issue(value: object) -> EventValidationReason | None:
    """Check JSON compatibility iteratively, including cycles and surrogates."""

    stack: list[tuple[object, bool]] = [(value, False)]
    active_containers: set[int] = set()
    while stack:
        current, leaving = stack.pop()
        if leaving:
            active_containers.remove(id(current))
            continue
        if current is None or type(current) is bool or type(current) is int:
            continue
        if type(current) is float:
            if not math.isfinite(cast(float, current)):
                return EventValidationReason.NON_FINITE_NUMBER
            continue
        if type(current) is str:
            try:
                cast(str, current).encode("utf-8")
            except UnicodeEncodeError:
                return EventValidationReason.INVALID_UTF8
            continue
        if type(current) is list:
            container_id = id(current)
            if container_id in active_containers:
                return EventValidationReason.INVALID_JSON
            active_containers.add(container_id)
            stack.append((current, True))
            for item in reversed(cast(list[object], current)):
                stack.append((item, False))
            continue
        if type(current) is dict:
            container_id = id(current)
            if container_id in active_containers:
                return EventValidationReason.INVALID_JSON
            active_containers.add(container_id)
            stack.append((current, True))
            for key, item in reversed(list(cast(dict[object, object], current).items())):
                if type(key) is not str:
                    return EventValidationReason.INVALID_JSON
                try:
                    cast(str, key).encode("utf-8")
                except UnicodeEncodeError:
                    return EventValidationReason.INVALID_UTF8
                stack.append((item, False))
            continue
        return EventValidationReason.INVALID_JSON
    return None


def _valid_candidate_portion(value: AppEventCandidate | AppEvent) -> AppEventCandidate:
    if isinstance(value, AppEvent):
        value = _candidate_from_event(value)
    result = validate_candidate(value)
    if result.error is not None:
        raise EventValidationException(result.error)
    return cast(AppEventCandidate, result.value)


def _candidate_from_event(event: AppEvent) -> AppEventCandidate:
    return AppEventCandidate(
        schema_version=event.schema_version,
        event_type=event.event_type,
        scope=event.scope,
        source=event.source,
        caused_by=event.caused_by,
        occurred_at_ms=event.occurred_at_ms,
        payload=event.payload,
    )


def _scope_dict(scope: EventScope) -> dict[str, JSONValue]:
    return {
        "mansion_id": scope.mansion_id,
        "ghost_id": scope.ghost_id,
        "session_slot": scope.session_slot,
        "run_id": scope.run_id,
        "run_sequence": scope.run_sequence,
    }


def _source_dict(source: EventSource) -> dict[str, JSONValue]:
    return {
        "origin": source.origin,
        "source_type": source.source_type,
        "identity_parts": list(source.identity_parts),
        "revision": source.revision,
        "generation": source.generation,
        "source_sequence": source.source_sequence,
    }


def _candidate_dict(candidate: AppEventCandidate) -> dict[str, JSONValue]:
    return {
        "schema_version": candidate.schema_version,
        "event_type": candidate.event_type,
        "scope": _scope_dict(candidate.scope),
        "source": _source_dict(candidate.source),
        "caused_by": list(candidate.caused_by),
        "occurred_at_ms": candidate.occurred_at_ms,
        "payload": candidate.payload,
    }


def _calculate_event_id(candidate: AppEventCandidate) -> str:
    identity: JSONValue = [
        candidate.schema_version,
        candidate.event_type,
        _scope_dict(candidate.scope),
        {
            "origin": candidate.source.origin,
            "source_type": candidate.source.source_type,
            "identity_parts": list(candidate.source.identity_parts),
        },
    ]
    return "e1:" + hashlib.sha256(canonical_json(identity)).hexdigest()


def _calculate_record_id(candidate: AppEventCandidate) -> str:
    return "r1:" + hashlib.sha256(canonical_json(_candidate_dict(candidate))).hexdigest()
