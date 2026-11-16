"""Typed Room Ghosts domain payloads over the canonical App_Event.

Room Ghosts owns no event envelope, log, or writer.  A task claim and a task
completion are ordinary ``domain_event_recorded`` candidates whose payload is
exactly ``{"domain", "kind", "entity_id", "data"}`` with the domain
``room_ghosts``.  Spec 4's fold skips other domains (they only advance
Projection_Version), so these records never change a Phase, Door, or
approval.  Event_ID, Record_ID, Sequence, and persistence time are assigned
only by the Spec 2 Canonical_Event_Writer.

Every field is a bounded identifier, digest, clean Mansion-relative path or
claim pattern, count, or fixed code.  No field can hold a document body,
model output, credential, or capability.

Pure: no filesystem, network, clock, or logging.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import cast

from haunted_house.core.deep_redact import DeepRedactionError, deep_redact
from haunted_house.core.ghost_result import is_task_id
from haunted_house.core.guardrail_events import is_identifier, is_safe_code
from haunted_house.core.mansion_names import is_valid_mansion_name
from haunted_house.core.path_policy import PathError, join_parts, parse_relative_path
from haunted_house.core.seance_event import (
    AppEvent,
    AppEventCandidate,
    EventScope,
    EventSource,
    JSONValue,
    validate_candidate,
)
from haunted_house.core.task_plan import is_claim_path

__all__ = [
    "DOMAIN",
    "EVENT_TYPE",
    "MAX_ATTEMPT",
    "MAX_CLAIM_PATHS",
    "MAX_EVIDENCE",
    "MAX_SELECTED_TASKS",
    "RELEASE_OUTCOMES",
    "SOURCE_TYPE",
    "RoomGhostEventKind",
    "RoomGhostPayloadError",
    "RoomGhostRecord",
    "RoomGhostSelection",
    "build_room_ghost_candidate",
    "is_room_ghost_candidate",
    "read_room_ghost_record",
    "select_room_ghost_records",
]

DOMAIN = "room_ghosts"
EVENT_TYPE = "domain_event_recorded"
SOURCE_TYPE = "room_ghost"
MAX_CLAIM_PATHS = 32
MAX_EVIDENCE = 64
MAX_ATTEMPT = 3
MAX_SELECTED_TASKS = 200
_REVISABLE_PHASES = ("requirements", "design", "tasks")
# ``not_started``: a provisional claim whose session Crew never accepted.
RELEASE_OUTCOMES = ("complete", "failed", "cancelled", "blocked", "not_started")
_MAX_SIZE = 2**53 - 1

_SHA256 = re.compile(r"[0-9a-f]{64}")
_RECORD_ID = re.compile(r"r1:[0-9a-f]{64}")


class RoomGhostEventKind(StrEnum):
    TASK_CLAIM_ACQUIRED = "task_claim_acquired"
    TASK_CLAIM_RELEASED = "task_claim_released"
    TASK_COMPLETION_INTENDED = "task_completion_intended"
    TASK_COMPLETED = "task_completed"
    TASK_COMPLETION_ABANDONED = "task_completion_abandoned"
    # Operator commands Room Ghosts owns.  Each is keyed by its command id, so
    # a repeated command is the same record.
    WORKSHOP_SELECTED = "workshop_selected"
    REVISION_REQUESTED = "revision_requested"
    RETRY_REQUESTED = "retry_requested"


class RoomGhostPayloadError(ValueError):
    """A value-free refusal: a schema field name and a fixed reason."""

    def __init__(self, field: str, reason: str) -> None:
        self.field = field
        self.reason = reason
        super().__init__(f"{field}:{reason}")


class _Bad(Exception):
    def __init__(self, reason: str) -> None:
        self.reason = reason


def _identifier(value: object) -> str:
    if not is_identifier(value):
        raise _Bad("invalid_identifier")
    return cast(str, value)


def _task_id(value: object) -> str:
    if not is_task_id(value):
        raise _Bad("invalid_task_id")
    return cast(str, value)


def _code(value: object) -> str:
    if not is_safe_code(value):
        raise _Bad("invalid_code")
    return cast(str, value)


def _sha256(value: object) -> str:
    if type(value) is not str or _SHA256.fullmatch(value) is None:
        raise _Bad("invalid_digest")
    return value


def _optional_sha256(value: object) -> str | None:
    return None if value is None else _sha256(value)


def _record_id(value: object) -> str:
    if type(value) is not str or _RECORD_ID.fullmatch(value) is None:
        raise _Bad("invalid_record_id")
    return value


def _path(value: object) -> str:
    parts = parse_relative_path(value)
    if isinstance(parts, PathError) or join_parts(parts) != value:
        raise _Bad("invalid_path")
    return cast(str, value)


def _claim_paths(value: object) -> list[JSONValue]:
    if type(value) not in (list, tuple):
        raise _Bad("invalid_paths")
    items = list(cast("list[object] | tuple[object, ...]", value))
    if not 1 <= len(items) <= MAX_CLAIM_PATHS:
        raise _Bad("out_of_range")
    if not all(is_claim_path(item) for item in items):
        raise _Bad("invalid_path")
    if len({cast(str, item) for item in items}) != len(items):
        raise _Bad("duplicate_path")
    return [cast(str, item) for item in items]


def _task_ids(value: object) -> list[JSONValue]:
    if type(value) not in (list, tuple):
        raise _Bad("invalid_task_ids")
    items = list(cast("list[object] | tuple[object, ...]", value))
    if not 1 <= len(items) <= MAX_SELECTED_TASKS:
        raise _Bad("out_of_range")
    if not all(is_task_id(item) for item in items):
        raise _Bad("invalid_task_id")
    if len({cast(str, item) for item in items}) != len(items):
        raise _Bad("duplicate_task_id")
    return [cast(str, item) for item in items]


def _optional_task_id(value: object) -> str | None:
    return None if value is None else _task_id(value)


def _evidence(value: object) -> list[JSONValue]:
    if type(value) not in (list, tuple):
        raise _Bad("invalid_evidence")
    items = list(cast("list[object] | tuple[object, ...]", value))
    if len(items) > MAX_EVIDENCE:
        raise _Bad("out_of_range")
    checked: list[JSONValue] = []
    for item in items:
        if type(item) is not dict or set(cast(dict, item)) != {"path", "sha256"}:
            raise _Bad("invalid_evidence")
        entry = cast(dict[str, object], item)
        checked.append({"path": _path(entry["path"]), "sha256": _sha256(entry["sha256"])})
    return checked


def _int_between(minimum: int, maximum: int) -> Callable[[object], int]:
    def check(value: object) -> int:
        if type(value) is not int or not minimum <= value <= maximum:
            raise _Bad("out_of_range")
        return value

    return check


def _one_of(*allowed: str) -> Callable[[object], str]:
    def check(value: object) -> str:
        if type(value) is not str or value not in allowed:
            raise _Bad("unsupported_value")
        return value

    return check


K = RoomGhostEventKind
_COMPLETION = {
    "completion_id": _identifier,
    "task_id": _task_id,
    "claim_id": _identifier,
    "document_path": _path,
}

# kind -> (data schema, entity field, identity fields)
_SCHEMAS: dict[
    RoomGhostEventKind,
    tuple[dict[str, Callable[[object], object]], str, tuple[str, ...]],
] = {
    K.TASK_CLAIM_ACQUIRED: (
        {
            "claim_id": _identifier,
            "task_id": _task_id,
            "paths": _claim_paths,
            "attempt": _int_between(1, MAX_ATTEMPT),
        },
        "claim_id",
        ("claim_id",),
    ),
    K.TASK_CLAIM_RELEASED: (
        {
            "claim_id": _identifier,
            "task_id": _task_id,
            "terminal_record_id": _record_id,
            "outcome": _one_of(*RELEASE_OUTCOMES),
        },
        "claim_id",
        ("claim_id",),
    ),
    K.TASK_COMPLETION_INTENDED: (
        {
            **_COMPLETION,
            "base_sha256": _sha256,
            "sha256": _sha256,
            "size_bytes": _int_between(0, _MAX_SIZE),
        },
        "completion_id",
        ("completion_id",),
    ),
    K.TASK_COMPLETED: (
        {
            **_COMPLETION,
            "sha256": _sha256,
            "size_bytes": _int_between(0, _MAX_SIZE),
            "evidence": _evidence,
        },
        "completion_id",
        ("completion_id",),
    ),
    K.TASK_COMPLETION_ABANDONED: (
        {**_COMPLETION, "code": _code},
        "completion_id",
        ("completion_id",),
    ),
    K.WORKSHOP_SELECTED: (
        {"command_id": _identifier, "task_ids": _task_ids},
        "command_id",
        ("command_id",),
    ),
    K.REVISION_REQUESTED: (
        {
            "command_id": _identifier,
            "phase": _one_of(*_REVISABLE_PHASES),
            # The run the feedback was given about; the text itself is never recorded.
            "run_id": _identifier,
            "feedback_sha256": _sha256,
            "size_bytes": _int_between(1, _MAX_SIZE),
        },
        "command_id",
        ("command_id",),
    ),
    K.RETRY_REQUESTED: (
        {
            "command_id": _identifier,
            # The failed or cancelled run a fresh attempt replaces.
            "run_id": _identifier,
            "task_id": _optional_task_id,
            "attempt": _int_between(2, MAX_ATTEMPT),
        },
        "command_id",
        ("command_id",),
    ),
}
_PAYLOAD_FIELDS = frozenset({"domain", "kind", "entity_id", "data"})


def _check_data(kind: RoomGhostEventKind, data: object) -> dict[str, JSONValue]:
    schema = _SCHEMAS[kind][0]
    if type(data) is not dict:
        raise RoomGhostPayloadError("data", "invalid_type")
    record = cast(dict[object, object], data)
    if not all(type(key) is str and key in schema for key in record):
        raise RoomGhostPayloadError("data", "unknown_field")
    if len(record) != len(schema):
        raise RoomGhostPayloadError("data", "missing_field")
    checked: dict[str, JSONValue] = {}
    for name, check in schema.items():
        try:
            checked[name] = cast(JSONValue, check(record[name]))
        except _Bad as bad:
            raise RoomGhostPayloadError(f"data.{name}", bad.reason) from None
    return checked


def _payload(kind: RoomGhostEventKind, checked: dict[str, JSONValue]) -> dict[str, JSONValue]:
    return {
        "domain": DOMAIN,
        "kind": kind.value,
        "entity_id": cast(str, checked[_SCHEMAS[kind][1]]),
        "data": checked,
    }


def build_room_ghost_candidate(
    scope: EventScope,
    kind: RoomGhostEventKind,
    data: Mapping[str, object],
    *,
    caused_by: Iterable[str] = (),
) -> AppEventCandidate:
    """Build one house-origin candidate.  No writer field is assigned.

    The source identity is ``(kind, entity, fact identifier)``: an exact
    retry is the same record, a different fact is a different Event_ID.
    """

    if not isinstance(kind, RoomGhostEventKind):
        raise RoomGhostPayloadError("kind", "unsupported_value")
    checked = _check_data(kind, dict(data) if isinstance(data, Mapping) else data)
    try:
        unchanged = deep_redact(checked) == checked
    except DeepRedactionError:
        unchanged = False
    if not unchanged:
        # Spec 2 redaction would alter it: it is not a content-free summary.
        raise RoomGhostPayloadError("data", "sensitive_value")
    if not isinstance(scope, EventScope) or not is_valid_mansion_name(scope.mansion_id):
        raise RoomGhostPayloadError("scope", "invalid_scope")
    payload = _payload(kind, checked)
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
        occurred_at_ms=None,
        payload=payload,
    )
    result = validate_candidate(candidate)
    if result.error is not None:
        raise RoomGhostPayloadError(result.error.field, result.error.reason.value)
    return cast(AppEventCandidate, result.value)


def is_room_ghost_candidate(candidate: object, mansion_id: str) -> bool:
    """Whether ``candidate`` is a well-formed Room Ghosts fact of ``mansion_id``."""

    if not isinstance(candidate, AppEventCandidate):
        return False
    return (
        candidate.event_type == EVENT_TYPE
        and candidate.scope.mansion_id == mansion_id
        and candidate.source.origin == "house"
        and candidate.source.source_type == SOURCE_TYPE
        and _validated(candidate.payload) is not None
    )


def _validated(payload: object) -> dict[str, JSONValue] | None:
    if type(payload) is not dict or set(cast(dict, payload)) != _PAYLOAD_FIELDS:
        return None
    record = cast(dict[str, object], payload)
    kind = record["kind"]
    if record["domain"] != DOMAIN or kind not in RoomGhostEventKind._value2member_map_:
        return None
    try:
        member = RoomGhostEventKind(cast(str, kind))
        built = _payload(member, _check_data(member, record["data"]))
    except RoomGhostPayloadError:
        return None
    return built if record["entity_id"] == built["entity_id"] else None


@dataclass(frozen=True, slots=True)
class RoomGhostRecord:
    """One validated Room Ghosts fact with its read-only canonical metadata."""

    kind: RoomGhostEventKind
    entity_id: str
    data: Mapping[str, JSONValue]
    event_id: str
    record_id: str
    sequence: int
    scope: EventScope


@dataclass(frozen=True, slots=True)
class RoomGhostSelection:
    records: tuple[RoomGhostRecord, ...]
    # Sequences of records that claim this domain and failed validation.
    invalid_sequences: tuple[int, ...]


def read_room_ghost_record(event: AppEvent) -> RoomGhostRecord | None | bool:
    """The record of ``event``; ``None`` when it is another domain's fact and
    ``False`` when it claims this domain and is untrusted or malformed."""

    if event.event_type != EVENT_TYPE:
        return None
    payload = event.payload
    if type(payload) is not dict or cast(dict, payload).get("domain") != DOMAIN:
        return None
    if event.source.origin != "house" or event.source.source_type != SOURCE_TYPE:
        return False
    checked = _validated(payload)
    if checked is None:
        return False
    return RoomGhostRecord(
        kind=RoomGhostEventKind(cast(str, checked["kind"])),
        entity_id=cast(str, checked["entity_id"]),
        data=cast(dict[str, JSONValue], checked["data"]),
        event_id=event.event_id,
        record_id=event.record_id,
        sequence=event.sequence,
        scope=event.scope,
    )


def select_room_ghost_records(events: Iterable[AppEvent]) -> RoomGhostSelection:
    """Filter and validate Room Ghosts facts in canonical Sequence order."""

    records: list[RoomGhostRecord] = []
    invalid: list[int] = []
    for event in sorted(events, key=lambda item: (item.sequence, item.event_id)):
        read = read_room_ghost_record(event)
        if read is None:
            continue
        if read is False:
            invalid.append(event.sequence)
            continue
        records.append(cast(RoomGhostRecord, read))
    return RoomGhostSelection(tuple(records), tuple(invalid))
