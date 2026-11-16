"""Strict parsers for the signed workflow and decision API.

Browser values are untrusted.  Every request is checked for exact shape,
type, length, and enumeration before any candidate is built: an unknown or
missing field, a wrong type (a boolean is not an integer), an identifier
outside its alphabet, a path that is not already clean, or a digest that is
not 64 lowercase hex digits is refused with a fixed code and a field name.
A refusal never echoes the rejected value.

The parsed values are plain typed data.  Whether a command is *allowed*
(Mansion registered, transition legal, Projection_Version current, proposal
exact) is decided later by the workflow service against the canonical fold.

Pure: no filesystem, network, clock, or logging.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import cast

from haunted_house.core.action_descriptor import is_action_digest
from haunted_house.core.guardrail_events import MAX_SIZE_BYTES, Phase, is_identifier
from haunted_house.core.mansion_names import is_valid_mansion_name
from haunted_house.core.path_policy import PathError, join_parts, parse_relative_path
from haunted_house.core.workflow import ArtifactRevision

__all__ = [
    "COMMON_FIELDS",
    "DECISIONS",
    "MAX_ASSIGNMENTS",
    "MAX_PROJECTION_VERSION",
    "MAX_REQUEST_BYTES",
    "DoorDecisionBody",
    "RequestError",
    "RiskyDecisionBody",
    "StartBody",
    "parse_decision",
    "parse_door_decision",
    "parse_command_header",
    "parse_mansion_id",
    "parse_object",
    "parse_phase",
    "parse_proposal_id",
    "parse_risky_decision",
    "parse_start",
]

MAX_REQUEST_BYTES = 16 * 1024
MAX_PROJECTION_VERSION = 2**53 - 1
MAX_ASSIGNMENTS = 16
DECISIONS = ("approve", "reject")

_COMMAND_ID = re.compile(r"[A-Za-z0-9-]{8,64}")
_ASSIGNMENT = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,39}")
_MAX_REVISION = 2**31 - 1


class RequestError(ValueError):
    """A refused request: a fixed code and the schema field at fault."""

    def __init__(self, field: str, code: str = "invalid_request") -> None:
        self.field = field
        self.code = code
        super().__init__(f"{code}:{field}")


@dataclass(frozen=True, slots=True)
class StartBody:
    command_id: str
    expected_version: int
    # Optional implementation work items; at most three run at once.
    assignments: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class DoorDecisionBody:
    command_id: str
    expected_version: int
    phase: Phase
    document_path: str
    artifact_revision: ArtifactRevision


@dataclass(frozen=True, slots=True)
class RiskyDecisionBody:
    command_id: str
    expected_version: int
    action_digest: str


def parse_mansion_id(value: object) -> str:
    if type(value) is not str or not is_valid_mansion_name(value):
        raise RequestError("mansion_id", "invalid_mansion_id")
    return cast(str, value)


def parse_phase(value: object) -> Phase:
    if type(value) is not str or value not in Phase._value2member_map_:
        raise RequestError("phase")
    return Phase(value)


def parse_proposal_id(value: object) -> str:
    if not is_identifier(value):
        raise RequestError("proposal_id")
    return cast(str, value)


def parse_decision(value: object) -> bool:
    """``True`` for ``approve``, ``False`` for ``reject``."""

    if type(value) is not str or value not in DECISIONS:
        raise RequestError("decision")
    return value == "approve"


def _object(
    value: object, required: frozenset[str], optional: frozenset[str] = frozenset()
) -> dict[str, object]:
    if type(value) is not dict:
        raise RequestError("$")
    record = cast(dict[object, object], value)
    if not all(type(key) is str for key in record):
        raise RequestError("$")
    keys = set(cast(dict[str, object], record))
    unknown = keys - required - optional
    if unknown:
        # The field name is ours to report only when it is a known shape;
        # an unknown key is request text and is never echoed.
        raise RequestError("$", "invalid_request")
    missing = required - keys
    if missing:
        raise RequestError(sorted(missing)[0])
    return cast(dict[str, object], record)


def _integer(value: object, field: str, minimum: int, maximum: int) -> int:
    if type(value) is not int or not minimum <= cast(int, value) <= maximum:
        raise RequestError(field)
    return cast(int, value)


def _command_id(value: object) -> str:
    if type(value) is not str or _COMMAND_ID.fullmatch(value) is None:
        raise RequestError("command_id")
    return cast(str, value)


def _common(record: dict[str, object]) -> tuple[str, int]:
    return (
        _command_id(record["command_id"]),
        _integer(record["expected_version"], "expected_version", 0, MAX_PROJECTION_VERSION),
    )


_COMMON = frozenset({"command_id", "expected_version"})

# The same strict object and command-header checks, for the routes of a later
# spec (Room Ghosts) that carry the same ``command_id`` and ``expected_version``.
COMMON_FIELDS = _COMMON
parse_object = _object
parse_command_header = _common


def parse_start(value: object) -> StartBody:
    """``{"command_id", "expected_version"}`` and optional ``assignments``."""

    record = _object(value, _COMMON, frozenset({"assignments"}))
    command_id, expected_version = _common(record)
    assignments: tuple[str, ...] = ()
    if "assignments" in record:
        raw = record["assignments"]
        if type(raw) is not list or not 1 <= len(cast(list, raw)) <= MAX_ASSIGNMENTS:
            raise RequestError("assignments")
        items = cast(list[object], raw)
        if not all(type(item) is str and _ASSIGNMENT.fullmatch(item) for item in items):
            raise RequestError("assignments")
        if len(set(cast(list[str], items))) != len(items):
            raise RequestError("assignments")
        assignments = tuple(cast(list[str], items))
    return StartBody(command_id, expected_version, assignments)


def parse_door_decision(value: object) -> DoorDecisionBody:
    """``{"command_id", "expected_version", "phase", "document_path",
    "artifact_revision": {"revision", "sha256", "size_bytes"}}``."""

    record = _object(
        value, _COMMON | {"phase", "document_path", "artifact_revision"}
    )
    command_id, expected_version = _common(record)
    phase = parse_phase(record["phase"])
    raw_path = record["document_path"]
    parts = parse_relative_path(raw_path)
    if isinstance(parts, PathError) or join_parts(parts) != raw_path:
        raise RequestError("document_path")
    try:
        artifact = _object(
            record["artifact_revision"], frozenset({"revision", "sha256", "size_bytes"})
        )
    except RequestError:
        raise RequestError("artifact_revision") from None
    if not is_action_digest(artifact["sha256"]):
        raise RequestError("artifact_revision.sha256")
    return DoorDecisionBody(
        command_id=command_id,
        expected_version=expected_version,
        phase=phase,
        document_path=cast(str, raw_path),
        artifact_revision=ArtifactRevision(
            revision=_integer(artifact["revision"], "artifact_revision.revision", 1, _MAX_REVISION),
            sha256=cast(str, artifact["sha256"]),
            size_bytes=_integer(
                artifact["size_bytes"], "artifact_revision.size_bytes", 0, MAX_SIZE_BYTES
            ),
        ),
    )


def parse_risky_decision(value: object) -> RiskyDecisionBody:
    """``{"command_id", "expected_version", "action_digest"}``."""

    record = _object(value, _COMMON | {"action_digest"})
    command_id, expected_version = _common(record)
    if not is_action_digest(record["action_digest"]):
        raise RequestError("action_digest")
    return RiskyDecisionBody(command_id, expected_version, cast(str, record["action_digest"]))
