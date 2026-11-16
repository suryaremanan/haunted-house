"""Typed Doors-and-Guardrails domain payloads over the canonical App_Event.

Spec 4 owns no event envelope.  Every fact below is an ordinary
``domain_event_recorded`` App_Event_Candidate whose payload is exactly
``{"domain", "kind", "entity_id", "data"}``.  This module validates the
``kind`` and its closed ``data`` shape and builds candidates; Event_ID,
Record_ID, Sequence, persistence time, and hash links are assigned only by
the Canonical_Event_Writer and are read back here as acknowledged metadata.

Every field is a bounded identifier, enumeration, digest, clean relative
path, count, or structured Action_Descriptor.  No field can hold a document
body, credential, capability, raw tool input, tool output, or error text, so
a payload is content-free before Spec 2 applies its final redaction.

Pure: no filesystem, network, clock, or logging.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import cast

from haunted_house.core.action_descriptor import (
    ActionDescriptor,
    ActionError,
    action_digest,
    descriptor_to_json,
    is_action_digest,
    parse_action_descriptor,
)
from haunted_house.core.deep_redact import DeepRedactionError, deep_redact
from haunted_house.core.mansion_names import is_valid_mansion_name
from haunted_house.core.path_policy import (
    Access,
    PathError,
    join_parts,
    parse_relative_path,
)
from haunted_house.core.seance_event import (
    AppEvent,
    AppEventCandidate,
    EventScope,
    EventSource,
    JSONValue,
    validate_candidate,
)

__all__ = [
    "ACTORS",
    "DOMAIN",
    "EVENT_TYPE",
    "MAX_IDENTIFIER_LENGTH",
    "MAX_LABEL_LENGTH",
    "MAX_SIZE_BYTES",
    "OPERATOR_GHOST_ID",
    "HOUSE_ANSWERED_TOOLS",
    "PHASES",
    "SOURCE_TYPE",
    "DomainRecord",
    "DomainSelection",
    "GuardrailEventKind",
    "GuardrailPayloadError",
    "PayloadDiagnostic",
    "Phase",
    "RecordDiagnostic",
    "approval_resolution_ignored",
    "build_candidate",
    "build_payload",
    "door_approved",
    "door_rejected",
    "door_superseded",
    "is_identifier",
    "is_safe_code",
    "is_unsafe_text",
    "operator_scope",
    "path_denied",
    "phase_output_ready",
    "phase_start_denied",
    "phase_start_failed",
    "phase_start_reserved",
    "phase_started",
    "read_domain_record",
    "revision_started",
    "risky_action_approved",
    "risky_action_consumed",
    "risky_action_denied",
    "risky_action_failed",
    "risky_action_proposed",
    "risky_action_rejected",
    "risky_action_succeeded",
    "risky_action_superseded",
    "room_tool_answered",
    "select_domain_records",
    "spec_document_written",
    "spec_write_prepared",
    "spec_write_recovered",
    "spec_write_uncertain",
    "validate_payload",
]

DOMAIN = "doors_and_guardrails"
EVENT_TYPE = "domain_event_recorded"
SOURCE_TYPE = "guardrail"
OPERATOR_GHOST_ID = "house-operator"
ACTORS = ("operator", "crew")
MAX_SIZE_BYTES = 2**53 - 1
_MAX_REVISION = 2**31 - 1

# House-minted identifiers and Crew slot or message labels are short and use
# a closed alphabet, so free text, encoded values, and long opaque values
# (a Session_Capability is longer than ``MAX_LABEL_LENGTH``) cannot be one.
MAX_IDENTIFIER_LENGTH = 64
MAX_LABEL_LENGTH = 128
_IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,63}")
_LABEL = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}")
_SAFE_CODE = re.compile(r"[a-z][a-z0-9_]{0,63}")


class Phase(StrEnum):
    REQUIREMENTS = "requirements"
    DESIGN = "design"
    TASKS = "tasks"
    IMPLEMENTATION = "implementation"


PHASES: tuple[Phase, ...] = tuple(Phase)


class GuardrailEventKind(StrEnum):
    PHASE_START_RESERVED = "phase_start_reserved"
    PHASE_STARTED = "phase_started"
    PHASE_START_FAILED = "phase_start_failed"
    PHASE_START_DENIED = "phase_start_denied"
    PHASE_OUTPUT_READY = "phase_output_ready"
    REVISION_STARTED = "revision_started"
    DOOR_SUPERSEDED = "door_superseded"
    DOOR_APPROVED = "door_approved"
    DOOR_REJECTED = "door_rejected"
    RISKY_ACTION_PROPOSED = "risky_action_proposed"
    RISKY_ACTION_APPROVED = "risky_action_approved"
    RISKY_ACTION_REJECTED = "risky_action_rejected"
    RISKY_ACTION_SUPERSEDED = "risky_action_superseded"
    RISKY_ACTION_CONSUMED = "risky_action_consumed"
    RISKY_ACTION_DENIED = "risky_action_denied"
    RISKY_ACTION_SUCCEEDED = "risky_action_succeeded"
    RISKY_ACTION_FAILED = "risky_action_failed"
    APPROVAL_RESOLUTION_IGNORED = "approval_resolution_ignored"
    PATH_DENIED = "path_denied"
    SPEC_WRITE_PREPARED = "spec_write_prepared"
    SPEC_DOCUMENT_WRITTEN = "spec_document_written"
    SPEC_WRITE_RECOVERED = "spec_write_recovered"
    SPEC_WRITE_UNCERTAIN = "spec_write_uncertain"
    # Design decision 2026-11-16: the house approved a non-risky room-tool
    # permission prompt on its own bound session.
    ROOM_TOOL_ANSWERED = "room_tool_answered"


@dataclass(frozen=True, slots=True)
class PayloadDiagnostic:
    """A value-free refusal: only a schema field name and a fixed reason."""

    field: str
    reason: str


class GuardrailPayloadError(ValueError):
    """Raised by builders; the message never contains a rejected value."""

    def __init__(self, diagnostic: PayloadDiagnostic) -> None:
        self.diagnostic = diagnostic
        super().__init__(f"{diagnostic.field}:{diagnostic.reason}")


class _Bad(Exception):
    def __init__(self, reason: str) -> None:
        self.reason = reason


# --- field validators ----------------------------------------------------------


def is_identifier(value: object) -> bool:
    return type(value) is str and _IDENTIFIER.fullmatch(cast(str, value)) is not None


def is_safe_code(value: object) -> bool:
    return type(value) is str and _SAFE_CODE.fullmatch(cast(str, value)) is not None


def _identifier(value: object) -> str:
    if not is_identifier(value):
        raise _Bad("invalid_identifier")
    return cast(str, value)


def _label(value: object) -> str:
    if type(value) is not str or _LABEL.fullmatch(cast(str, value)) is None:
        raise _Bad("invalid_label")
    return cast(str, value)


def _code(value: object) -> str:
    if not is_safe_code(value):
        raise _Bad("invalid_code")
    return cast(str, value)


def _phase(value: object) -> str:
    if type(value) is not str or value not in Phase._value2member_map_:
        raise _Bad("unsupported_value")
    return cast(str, value)


def _digest(value: object) -> str:
    if not is_action_digest(value):
        raise _Bad("invalid_digest")
    return cast(str, value)


def _path(value: object) -> str:
    if type(value) is not str:
        raise _Bad("invalid_path")
    parsed = parse_relative_path(value)
    if isinstance(parsed, PathError):
        raise _Bad("invalid_path")
    return join_parts(parsed)


def _int_between(minimum: int, maximum: int) -> Callable[[object], int]:
    def check(value: object) -> int:
        if type(value) is not int or not minimum <= cast(int, value) <= maximum:
            raise _Bad("out_of_range")
        return cast(int, value)

    return check


def _one_of(*allowed: str) -> Callable[[object], str]:
    def check(value: object) -> str:
        if type(value) is not str or value not in allowed:
            raise _Bad("unsupported_value")
        return cast(str, value)

    return check


def _optional(inner: Callable[[object], object]) -> Callable[[object], object]:
    def check(value: object) -> object:
        return None if value is None else inner(value)

    return check


def _descriptor(value: object) -> object:
    # Shape only when reading.  The Approval_Ledger re-parses it and compares
    # the digest, so a descriptor that the persistence boundary redacted stays
    # visible as a blocked proposal instead of vanishing from the projection.
    # Building is strict: see ``_check_built``.
    if type(value) is not dict:
        raise _Bad("invalid_descriptor")
    return value


_revision = _int_between(1, _MAX_REVISION)
_base_revision = _int_between(0, _MAX_REVISION)
_size = _int_between(0, MAX_SIZE_BYTES)
_exit_code = _optional(_int_between(-255, 255))
_actor = _one_of(*ACTORS)
# The only room tools the house ever answers for a Ghost (decision 2026-11-16).
# The proposal and execution tools are not here, and never will be.
HOUSE_ANSWERED_TOOLS = (
    "list_room_files",
    "read_room_file",
    "write_spec_document",
    "write_room_file",
    "submit_phase_output",
)
_access = _one_of(*(access.value for access in Access))

_ARTIFACT = {
    "document_path": _path,
    "revision": _revision,
    "sha256": _digest,
    "size_bytes": _size,
}
_DOOR_DECISION = {
    "phase": _phase,
    "proposal_id": _identifier,
    **_ARTIFACT,
    "actor": _actor,
    "command_id": _identifier,
}
_RISKY_DECISION = {
    "proposal_id": _identifier,
    "action_digest": _digest,
    "actor": _actor,
    "command_id": _identifier,
    "crew_slot": _optional(_label),
    "crew_mid": _optional(_label),
}
_RISKY_OUTCOME = {
    "proposal_id": _identifier,
    "action_digest": _digest,
    "claim_id": _identifier,
    "code": _code,
    "exit_code": _exit_code,
    "output_bytes": _size,
}

K = GuardrailEventKind

# kind -> (data schema, entity field, identity fields)
_SCHEMAS: dict[
    GuardrailEventKind,
    tuple[dict[str, Callable[[object], object]], str, tuple[str, ...]],
] = {
    K.PHASE_START_RESERVED: (
        {"phase": _phase, "reservation_id": _identifier, "command_id": _identifier},
        "phase",
        ("reservation_id",),
    ),
    K.PHASE_STARTED: (
        {"phase": _phase, "reservation_id": _identifier, "session_slot": _label},
        "phase",
        ("reservation_id",),
    ),
    K.PHASE_START_FAILED: (
        {"phase": _phase, "reservation_id": _identifier, "code": _code},
        "phase",
        ("reservation_id",),
    ),
    K.PHASE_START_DENIED: (
        {"phase": _phase, "command_id": _identifier, "code": _code},
        "phase",
        ("command_id",),
    ),
    K.PHASE_OUTPUT_READY: (
        {"phase": _phase, "proposal_id": _identifier, **_ARTIFACT},
        "proposal_id",
        ("proposal_id",),
    ),
    K.REVISION_STARTED: (
        {"phase": _phase, "command_id": _identifier, "session_slot": _label},
        "phase",
        ("command_id",),
    ),
    K.DOOR_SUPERSEDED: (
        {
            "phase": _phase,
            "proposal_id": _identifier,
            "revision": _revision,
            "sha256": _digest,
            "code": _code,
        },
        "proposal_id",
        ("proposal_id",),
    ),
    K.DOOR_APPROVED: (_DOOR_DECISION, "proposal_id", ("command_id",)),
    K.DOOR_REJECTED: (_DOOR_DECISION, "proposal_id", ("command_id",)),
    K.RISKY_ACTION_PROPOSED: (
        {"proposal_id": _identifier, "action_digest": _digest, "descriptor": _descriptor},
        "proposal_id",
        ("proposal_id",),
    ),
    K.RISKY_ACTION_APPROVED: (_RISKY_DECISION, "proposal_id", ("command_id",)),
    K.RISKY_ACTION_REJECTED: (_RISKY_DECISION, "proposal_id", ("command_id",)),
    K.RISKY_ACTION_SUPERSEDED: (
        {"proposal_id": _identifier, "action_digest": _digest, "code": _code},
        "proposal_id",
        ("proposal_id",),
    ),
    K.RISKY_ACTION_CONSUMED: (
        {
            "proposal_id": _identifier,
            "action_digest": _digest,
            "claim_id": _identifier,
            "session_slot": _label,
        },
        "proposal_id",
        ("claim_id",),
    ),
    K.RISKY_ACTION_DENIED: (
        {
            "proposal_id": _identifier,
            "action_digest": _optional(_digest),
            "denial_id": _identifier,
            "session_slot": _label,
            "code": _code,
        },
        "proposal_id",
        ("denial_id",),
    ),
    K.RISKY_ACTION_SUCCEEDED: (_RISKY_OUTCOME, "proposal_id", ("claim_id",)),
    K.RISKY_ACTION_FAILED: (_RISKY_OUTCOME, "proposal_id", ("claim_id",)),
    K.APPROVAL_RESOLUTION_IGNORED: (
        {
            "resolution_id": _identifier,
            "session_slot": _label,
            "mid": _label,
            "outcome": _one_of("approved", "rejected"),
            "code": _code,
        },
        "resolution_id",
        ("resolution_id",),
    ),
    K.PATH_DENIED: (
        {
            "denial_id": _identifier,
            "session_slot": _label,
            "room": _code,
            "access": _access,
            "code": _code,
            "path": _optional(_path),
        },
        "denial_id",
        ("denial_id",),
    ),
    K.SPEC_WRITE_PREPARED: (
        {
            "write_id": _identifier,
            "phase": _phase,
            "document_path": _path,
            "base_revision": _base_revision,
            "base_sha256": _optional(_digest),
            "revision": _revision,
            "sha256": _digest,
            "size_bytes": _size,
        },
        "write_id",
        ("write_id",),
    ),
    K.SPEC_DOCUMENT_WRITTEN: (
        {"write_id": _identifier, "phase": _phase, **_ARTIFACT},
        "write_id",
        ("write_id",),
    ),
    K.SPEC_WRITE_RECOVERED: (
        {
            "write_id": _identifier,
            "phase": _phase,
            "document_path": _path,
            "outcome": _one_of("completed", "not_applied"),
        },
        "write_id",
        ("write_id",),
    ),
    K.SPEC_WRITE_UNCERTAIN: (
        {
            "write_id": _identifier,
            "phase": _phase,
            "document_path": _path,
            "code": _code,
        },
        "write_id",
        ("write_id",),
    ),
    K.ROOM_TOOL_ANSWERED: (
        {
            "answer_id": _identifier,
            "session_slot": _label,
            "mid": _label,
            "tool": _one_of(*HOUSE_ANSWERED_TOOLS),
            "outcome": _one_of("approved"),
            "actor": _one_of("house"),
            "reason": _one_of("non_risky_room_tool"),
        },
        "answer_id",
        ("answer_id",),
    ),
}

_PAYLOAD_FIELDS = frozenset({"domain", "kind", "entity_id", "data"})


def _check_data(kind: GuardrailEventKind, data: object) -> dict[str, JSONValue]:
    schema, _entity_field, _identity = _SCHEMAS[kind]
    if type(data) is not dict:
        raise GuardrailPayloadError(PayloadDiagnostic("data", "invalid_type"))
    record = cast(dict[object, object], data)
    if not all(type(key) is str and key in schema for key in record):
        raise GuardrailPayloadError(PayloadDiagnostic("data", "unknown_field"))
    if len(record) != len(schema):
        raise GuardrailPayloadError(PayloadDiagnostic("data", "missing_field"))
    checked: dict[str, JSONValue] = {}
    for name, check in schema.items():
        try:
            checked[name] = cast(JSONValue, check(record[name]))
        except _Bad as bad:
            raise GuardrailPayloadError(
                PayloadDiagnostic(f"data.{name}", bad.reason)
            ) from None
    return checked


def _check_built(kind: GuardrailEventKind, checked: dict[str, JSONValue]) -> None:
    """Extra refusals that apply only to a payload this process is creating."""

    if kind is GuardrailEventKind.RISKY_ACTION_PROPOSED:
        parsed = parse_action_descriptor(checked["descriptor"])
        if isinstance(parsed, ActionError) or action_digest(parsed) != checked["action_digest"]:
            raise GuardrailPayloadError(
                PayloadDiagnostic("data.descriptor", "invalid_descriptor")
            )
    try:
        unchanged = deep_redact(checked) == checked
    except DeepRedactionError:
        unchanged = False
    if unchanged:
        unchanged = not any(
            is_unsafe_text(text, path=name in _PATH_FIELDS)
            for name, value in checked.items()
            for text in _texts(value)
        )
    if not unchanged:
        # The Spec 2 redactor would alter this payload: it carries something
        # credential shaped, so it is not a content-free summary.
        raise GuardrailPayloadError(PayloadDiagnostic("data", "sensitive_value"))


# Fields that hold a Mansion-relative path.  A real room path never holds a
# Session_Capability-shaped hex run, so one there is refused as well.
_PATH_FIELDS = frozenset({"document_path", "path"})
_DECODE_ROUNDS = 3
_CAPABILITY_SHAPE = re.compile(r"[0-9A-Fa-f]{64,}")
_ERROR_TEXT = re.compile(r"Traceback \(most recent call last\)")


def is_unsafe_text(text: str, *, path: bool = False) -> bool:
    """Whether one payload string is not a content-free summary.

    Root cause fixed 2026-11-16: a path field accepted any clean relative
    path, and only the raw text was checked against the Spec 2 redactor, so a
    single-line credential (an authorization token, a percent-encoded secret,
    an opaque capability) or error text could be stored as a "path".  Now the
    text and each of its percent-decoded forms must be unchanged by
    ``deep_redact`` and hold no error text, and a path holds no
    capability-shaped hex run.
    """

    forms = [text]
    for _ in range(_DECODE_ROUNDS):
        decoded = _unquote_plus(forms[-1])
        if decoded == forms[-1]:
            break
        forms.append(decoded)
    for form in forms:
        try:
            if deep_redact(form) != form:
                return True
        except DeepRedactionError:
            return True
        if _ERROR_TEXT.search(form) is not None:
            return True
        if path and _CAPABILITY_SHAPE.search(form) is not None:
            return True
    return False


_PERCENT = re.compile(r"%[0-9A-Fa-f]{2}")


def _unquote_plus(text: str) -> str:
    """``urllib.parse.unquote_plus`` with ``re`` only (this module stays pure)."""

    spaced = text.replace("+", " ")
    out: list[str] = []
    position = 0
    for match in re.finditer(r"(?:%[0-9A-Fa-f]{2})+", spaced):
        out.append(spaced[position : match.start()])
        raw = bytes(int(item[1:], 16) for item in _PERCENT.findall(match.group(0)))
        out.append(raw.decode("utf-8", "replace"))
        position = match.end()
    out.append(spaced[position:])
    return "".join(out)


def _texts(value: object) -> Iterable[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for key, item in value.items():
            yield str(key)
            yield from _texts(item)
    elif isinstance(value, list):
        for item in value:
            yield from _texts(item)


def build_payload(kind: GuardrailEventKind, data: Mapping[str, object]) -> dict[str, JSONValue]:
    """Return the exact domain payload for ``kind`` or raise a safe error."""

    if not isinstance(kind, GuardrailEventKind):
        raise GuardrailPayloadError(PayloadDiagnostic("kind", "unsupported_value"))
    checked = _check_data(kind, dict(data) if isinstance(data, Mapping) else data)
    _check_built(kind, checked)
    return _payload(kind, checked)


def _payload(kind: GuardrailEventKind, checked: dict[str, JSONValue]) -> dict[str, JSONValue]:
    return {
        "domain": DOMAIN,
        "kind": kind.value,
        "entity_id": cast(str, checked[_SCHEMAS[kind][1]]),
        "data": checked,
    }


def validate_payload(payload: object) -> dict[str, JSONValue] | PayloadDiagnostic:
    """Validate a payload read back from a canonical record."""

    if type(payload) is not dict or set(cast(dict, payload)) != _PAYLOAD_FIELDS:
        return PayloadDiagnostic("payload", "invalid_shape")
    record = cast(dict[str, object], payload)
    if record["domain"] != DOMAIN:
        return PayloadDiagnostic("domain", "unsupported_value")
    kind = record["kind"]
    if type(kind) is not str or kind not in GuardrailEventKind._value2member_map_:
        return PayloadDiagnostic("kind", "unsupported_value")
    try:
        member = GuardrailEventKind(kind)
        built = _payload(member, _check_data(member, record["data"]))
    except GuardrailPayloadError as error:
        return error.diagnostic
    if record["entity_id"] != built["entity_id"]:
        return PayloadDiagnostic("entity_id", "mismatch")
    return built


def operator_scope(mansion_id: str) -> EventScope:
    """The scope of a house or operator fact that belongs to no Ghost session."""

    return EventScope(
        mansion_id=mansion_id,
        ghost_id=OPERATOR_GHOST_ID,
        session_slot=OPERATOR_GHOST_ID,
        run_id="workflow",
        run_sequence=0,
    )


def build_candidate(
    scope: EventScope,
    kind: GuardrailEventKind,
    data: Mapping[str, object],
    *,
    caused_by: Iterable[str] = (),
    occurred_at_ms: int | None = None,
) -> AppEventCandidate:
    """Build one house-origin candidate.  No writer field is assigned.

    The source identity is ``(kind, entity, fact identifier)``, so an exact
    retry is the same record and a different fact is a different Event_ID.
    """

    payload = build_payload(kind, data)
    checked = cast(dict[str, JSONValue], payload["data"])
    if not isinstance(scope, EventScope) or not is_valid_mansion_name(scope.mansion_id):
        raise GuardrailPayloadError(PayloadDiagnostic("scope", "invalid_scope"))
    identity = (kind.value, cast(str, payload["entity_id"])) + tuple(
        cast(str, checked[name]) for name in _SCHEMAS[kind][2]
    )
    candidate = AppEventCandidate(
        schema_version=1,
        event_type=EVENT_TYPE,
        scope=scope,
        source=EventSource(
            origin="house",
            source_type=SOURCE_TYPE,
            identity_parts=identity,
            revision=0,
            generation="",
            source_sequence=0,
        ),
        caused_by=tuple(caused_by),
        occurred_at_ms=occurred_at_ms,
        payload=payload,
    )
    result = validate_candidate(candidate)
    if result.error is not None:
        raise GuardrailPayloadError(
            PayloadDiagnostic(result.error.field, result.error.reason.value)
        )
    return cast(AppEventCandidate, result.value)


# --- acknowledged records -------------------------------------------------------


@dataclass(frozen=True, slots=True)
class DomainRecord:
    """One validated Spec 4 fact with its read-only canonical metadata."""

    kind: GuardrailEventKind
    entity_id: str
    data: Mapping[str, JSONValue]
    event_id: str
    sequence: int
    scope: EventScope


@dataclass(frozen=True, slots=True)
class RecordDiagnostic:
    sequence: int
    event_id: str
    field: str
    reason: str


@dataclass(frozen=True, slots=True)
class DomainSelection:
    records: tuple[DomainRecord, ...]
    diagnostics: tuple[RecordDiagnostic, ...]
    highest_sequence: int


def read_domain_record(event: AppEvent) -> DomainRecord | PayloadDiagnostic | None:
    """Read one acknowledged record; ``None`` when it is not a Spec 4 fact."""

    if event.event_type != EVENT_TYPE:
        return None
    payload = event.payload
    if type(payload) is not dict or cast(dict, payload).get("domain") != DOMAIN:
        return None
    if event.source.origin != "house" or event.source.source_type != SOURCE_TYPE:
        return PayloadDiagnostic("source", "untrusted_source")
    checked = validate_payload(payload)
    if isinstance(checked, PayloadDiagnostic):
        return checked
    return DomainRecord(
        kind=GuardrailEventKind(cast(str, checked["kind"])),
        entity_id=cast(str, checked["entity_id"]),
        data=cast(dict[str, JSONValue], checked["data"]),
        event_id=event.event_id,
        sequence=event.sequence,
        scope=event.scope,
    )


def select_domain_records(events: Iterable[AppEvent]) -> DomainSelection:
    """Filter and validate Spec 4 facts in canonical Sequence order.

    ``highest_sequence`` covers every record seen, including other domains,
    because Projection_Version must detect any intervening write.
    """

    ordered = sorted(events, key=lambda event: (event.sequence, event.event_id))
    records: list[DomainRecord] = []
    diagnostics: list[RecordDiagnostic] = []
    highest = 0
    for event in ordered:
        highest = max(highest, event.sequence)
        read = read_domain_record(event)
        if read is None:
            continue
        if isinstance(read, PayloadDiagnostic):
            diagnostics.append(
                RecordDiagnostic(event.sequence, event.event_id, read.field, read.reason)
            )
            continue
        records.append(read)
    return DomainSelection(tuple(records), tuple(diagnostics), highest)


# --- typed builders ---------------------------------------------------------------


def phase_start_reserved(
    scope: EventScope, *, phase: Phase, reservation_id: str, command_id: str
) -> AppEventCandidate:
    return build_candidate(
        scope,
        K.PHASE_START_RESERVED,
        {"phase": _value(phase), "reservation_id": reservation_id, "command_id": command_id},
    )


def phase_started(
    scope: EventScope, *, phase: Phase, reservation_id: str, session_slot: str
) -> AppEventCandidate:
    return build_candidate(
        scope,
        K.PHASE_STARTED,
        {"phase": _value(phase), "reservation_id": reservation_id, "session_slot": session_slot},
    )


def phase_start_failed(
    scope: EventScope, *, phase: Phase, reservation_id: str, code: str
) -> AppEventCandidate:
    return build_candidate(
        scope,
        K.PHASE_START_FAILED,
        {"phase": _value(phase), "reservation_id": reservation_id, "code": code},
    )


def phase_start_denied(
    scope: EventScope, *, phase: Phase, command_id: str, code: str
) -> AppEventCandidate:
    return build_candidate(
        scope,
        K.PHASE_START_DENIED,
        {"phase": _value(phase), "command_id": command_id, "code": code},
    )


def phase_output_ready(
    scope: EventScope,
    *,
    phase: Phase,
    proposal_id: str,
    document_path: str,
    revision: int,
    sha256: str,
    size_bytes: int,
) -> AppEventCandidate:
    return build_candidate(
        scope,
        K.PHASE_OUTPUT_READY,
        {
            "phase": _value(phase),
            "proposal_id": proposal_id,
            "document_path": document_path,
            "revision": revision,
            "sha256": sha256,
            "size_bytes": size_bytes,
        },
    )


def revision_started(
    scope: EventScope, *, phase: Phase, command_id: str, session_slot: str
) -> AppEventCandidate:
    return build_candidate(
        scope,
        K.REVISION_STARTED,
        {"phase": _value(phase), "command_id": command_id, "session_slot": session_slot},
    )


def door_superseded(
    scope: EventScope,
    *,
    phase: Phase,
    proposal_id: str,
    revision: int,
    sha256: str,
    code: str,
) -> AppEventCandidate:
    return build_candidate(
        scope,
        K.DOOR_SUPERSEDED,
        {
            "phase": _value(phase),
            "proposal_id": proposal_id,
            "revision": revision,
            "sha256": sha256,
            "code": code,
        },
    )


def _door_decision(
    kind: GuardrailEventKind,
    scope: EventScope,
    *,
    phase: Phase,
    proposal_id: str,
    document_path: str,
    revision: int,
    sha256: str,
    size_bytes: int,
    actor: str,
    command_id: str,
) -> AppEventCandidate:
    return build_candidate(
        scope,
        kind,
        {
            "phase": _value(phase),
            "proposal_id": proposal_id,
            "document_path": document_path,
            "revision": revision,
            "sha256": sha256,
            "size_bytes": size_bytes,
            "actor": actor,
            "command_id": command_id,
        },
    )


def door_approved(scope: EventScope, **fields: object) -> AppEventCandidate:
    return _door_decision(K.DOOR_APPROVED, scope, **fields)  # type: ignore[arg-type]


def door_rejected(scope: EventScope, **fields: object) -> AppEventCandidate:
    return _door_decision(K.DOOR_REJECTED, scope, **fields)  # type: ignore[arg-type]


def risky_action_proposed(
    scope: EventScope, *, proposal_id: str, descriptor: ActionDescriptor
) -> AppEventCandidate:
    """Record a pending proposal for one complete, validated descriptor.

    The digest is always computed here; a caller cannot supply one.
    """

    try:
        digest = action_digest(descriptor)
        as_json = descriptor_to_json(descriptor)
    except Exception:  # noqa: BLE001 - any failure is the same safe refusal
        raise GuardrailPayloadError(
            PayloadDiagnostic("data.descriptor", "invalid_descriptor")
        ) from None
    if isinstance(parse_action_descriptor(as_json), ActionError):
        raise GuardrailPayloadError(
            PayloadDiagnostic("data.descriptor", "invalid_descriptor")
        )
    return build_candidate(
        scope,
        K.RISKY_ACTION_PROPOSED,
        {"proposal_id": proposal_id, "action_digest": digest, "descriptor": as_json},
    )


def _risky_decision(
    kind: GuardrailEventKind,
    scope: EventScope,
    *,
    proposal_id: str,
    action_digest: str,
    actor: str,
    command_id: str,
    crew_slot: str | None = None,
    crew_mid: str | None = None,
) -> AppEventCandidate:
    return build_candidate(
        scope,
        kind,
        {
            "proposal_id": proposal_id,
            "action_digest": action_digest,
            "actor": actor,
            "command_id": command_id,
            "crew_slot": crew_slot,
            "crew_mid": crew_mid,
        },
    )


def risky_action_approved(scope: EventScope, **fields: object) -> AppEventCandidate:
    return _risky_decision(K.RISKY_ACTION_APPROVED, scope, **fields)  # type: ignore[arg-type]


def risky_action_rejected(scope: EventScope, **fields: object) -> AppEventCandidate:
    return _risky_decision(K.RISKY_ACTION_REJECTED, scope, **fields)  # type: ignore[arg-type]


def risky_action_superseded(
    scope: EventScope, *, proposal_id: str, action_digest: str, code: str
) -> AppEventCandidate:
    return build_candidate(
        scope,
        K.RISKY_ACTION_SUPERSEDED,
        {"proposal_id": proposal_id, "action_digest": action_digest, "code": code},
    )


def risky_action_consumed(
    scope: EventScope,
    *,
    proposal_id: str,
    action_digest: str,
    claim_id: str,
    session_slot: str,
) -> AppEventCandidate:
    return build_candidate(
        scope,
        K.RISKY_ACTION_CONSUMED,
        {
            "proposal_id": proposal_id,
            "action_digest": action_digest,
            "claim_id": claim_id,
            "session_slot": session_slot,
        },
    )


def risky_action_denied(
    scope: EventScope,
    *,
    proposal_id: str,
    action_digest: str | None,
    denial_id: str,
    session_slot: str,
    code: str,
) -> AppEventCandidate:
    return build_candidate(
        scope,
        K.RISKY_ACTION_DENIED,
        {
            "proposal_id": proposal_id,
            "action_digest": action_digest,
            "denial_id": denial_id,
            "session_slot": session_slot,
            "code": code,
        },
    )


def _risky_outcome(
    kind: GuardrailEventKind,
    scope: EventScope,
    *,
    proposal_id: str,
    action_digest: str,
    claim_id: str,
    code: str,
    exit_code: int | None = None,
    output_bytes: int = 0,
) -> AppEventCandidate:
    return build_candidate(
        scope,
        kind,
        {
            "proposal_id": proposal_id,
            "action_digest": action_digest,
            "claim_id": claim_id,
            "code": code,
            "exit_code": exit_code,
            "output_bytes": output_bytes,
        },
    )


def risky_action_succeeded(scope: EventScope, **fields: object) -> AppEventCandidate:
    return _risky_outcome(K.RISKY_ACTION_SUCCEEDED, scope, **fields)  # type: ignore[arg-type]


def risky_action_failed(scope: EventScope, **fields: object) -> AppEventCandidate:
    return _risky_outcome(K.RISKY_ACTION_FAILED, scope, **fields)  # type: ignore[arg-type]


def approval_resolution_ignored(
    scope: EventScope,
    *,
    resolution_id: str,
    session_slot: str,
    mid: str,
    outcome: str,
    code: str,
) -> AppEventCandidate:
    return build_candidate(
        scope,
        K.APPROVAL_RESOLUTION_IGNORED,
        {
            "resolution_id": resolution_id,
            "session_slot": session_slot,
            "mid": mid,
            "outcome": outcome,
            "code": code,
        },
    )


def room_tool_answered(
    scope: EventScope,
    *,
    answer_id: str,
    session_slot: str,
    mid: str,
    tool: str,
) -> AppEventCandidate:
    """The house approved one non-risky room-tool prompt of ``session_slot``."""

    return build_candidate(
        scope,
        K.ROOM_TOOL_ANSWERED,
        {
            "answer_id": answer_id,
            "session_slot": session_slot,
            "mid": mid,
            "tool": tool,
            "outcome": "approved",
            "actor": "house",
            "reason": "non_risky_room_tool",
        },
    )


def path_denied(
    scope: EventScope,
    *,
    denial_id: str,
    session_slot: str,
    room: str,
    access: Access,
    code: str,
    raw_path: object,
) -> AppEventCandidate:
    """Record a denial.

    A path that did not parse cleanly, or that carries a recognizable
    credential, is never stored: the record keeps only the denial code.
    """

    parsed = parse_relative_path(raw_path)
    shown: str | None = None
    if not isinstance(parsed, PathError):
        shown = join_parts(parsed)
        if is_unsafe_text(shown, path=True):
            shown = None
    return build_candidate(
        scope,
        K.PATH_DENIED,
        {
            "denial_id": denial_id,
            "session_slot": session_slot,
            "room": room,
            "access": _value(access),
            "code": code,
            "path": shown,
        },
    )


def spec_write_prepared(
    scope: EventScope,
    *,
    write_id: str,
    phase: Phase,
    document_path: str,
    base_revision: int,
    base_sha256: str | None,
    revision: int,
    sha256: str,
    size_bytes: int,
) -> AppEventCandidate:
    return build_candidate(
        scope,
        K.SPEC_WRITE_PREPARED,
        {
            "write_id": write_id,
            "phase": _value(phase),
            "document_path": document_path,
            "base_revision": base_revision,
            "base_sha256": base_sha256,
            "revision": revision,
            "sha256": sha256,
            "size_bytes": size_bytes,
        },
    )


def spec_document_written(
    scope: EventScope,
    *,
    write_id: str,
    phase: Phase,
    document_path: str,
    revision: int,
    sha256: str,
    size_bytes: int,
) -> AppEventCandidate:
    return build_candidate(
        scope,
        K.SPEC_DOCUMENT_WRITTEN,
        {
            "write_id": write_id,
            "phase": _value(phase),
            "document_path": document_path,
            "revision": revision,
            "sha256": sha256,
            "size_bytes": size_bytes,
        },
    )


def spec_write_recovered(
    scope: EventScope, *, write_id: str, phase: Phase, document_path: str, outcome: str
) -> AppEventCandidate:
    return build_candidate(
        scope,
        K.SPEC_WRITE_RECOVERED,
        {
            "write_id": write_id,
            "phase": _value(phase),
            "document_path": document_path,
            "outcome": outcome,
        },
    )


def spec_write_uncertain(
    scope: EventScope, *, write_id: str, phase: Phase, document_path: str, code: str
) -> AppEventCandidate:
    return build_candidate(
        scope,
        K.SPEC_WRITE_UNCERTAIN,
        {
            "write_id": write_id,
            "phase": _value(phase),
            "document_path": document_path,
            "code": code,
        },
    )


def _value(member: object) -> object:
    return member.value if isinstance(member, StrEnum) else member
