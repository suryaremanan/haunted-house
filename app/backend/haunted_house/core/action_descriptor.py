"""Pure Action_Descriptor parsing, canonical bytes, and Action_Digest.

An Action_Descriptor is the complete, structured description of one
Risky_Action.  It is a closed schema: every execution-relevant value is a
named field, shell strings and caller-supplied environments have no field to
live in, and a value an operator could not read exactly (control or format
characters, non-NFC text, floats, or anything the persistence redactor would
alter) is refused before a digest exists.

Canonical bytes reuse the Spec 2 canonical JSON encoder; this module defines
no serializer of its own.  It performs no I/O.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from types import MappingProxyType
from typing import Literal, cast

from haunted_house.core.deep_redact import DeepRedactionError, deep_redact
from haunted_house.core.mansion_names import is_valid_mansion_name
from haunted_house.core.path_policy import (
    Access,
    PathError,
    join_parts,
    parse_relative_path,
)
from haunted_house.core.seance_event import (
    CanonicalJsonError,
    JSONValue,
    canonical_json,
)

__all__ = [
    "ACTION_KINDS",
    "ACTION_SCHEMA_VERSION",
    "MAX_ACTION_BYTES",
    "MAX_ARGV_ITEMS",
    "MAX_COMMAND_TIMEOUT_SECONDS",
    "MAX_PATH_INTENTS",
    "ROOMS",
    "ActionDescriptor",
    "ActionError",
    "ActionErrorCode",
    "PathIntent",
    "action_digest",
    "canonical_action",
    "descriptor_to_json",
    "is_action_digest",
    "is_displayable_label",
    "parse_action_descriptor",
    "parse_canonical_action",
]

ACTION_SCHEMA_VERSION = 1
ACTION_KINDS = ("delete_path", "run_command", "git_write")
ROOMS = ("study", "drafting_room", "workshop")
MAX_ACTION_BYTES = 32 * 1024
MAX_ARGV_ITEMS = 64
MAX_ARGUMENT_BYTES = 4096
MAX_PATH_INTENTS = 64
MAX_COMMAND_TIMEOUT_SECONDS = 600
MAX_COMMIT_MESSAGE_BYTES = 2000
MAX_LABEL_BYTES = 160

_DIGEST = re.compile(r"[0-9a-f]{64}")
_UNDISPLAYABLE = frozenset({"Cc", "Cf", "Cs", "Co", "Cn", "Zl", "Zp"})
_RISKY_INTENTS = {
    "delete_path": frozenset({Access.DELETE}),
    "run_command": frozenset({Access.COMMAND_READ, Access.COMMAND_WRITE}),
    "git_write": frozenset({Access.GIT_WRITE}),
}
_FIELDS = frozenset(
    {
        "schema_version",
        "mansion_id",
        "session_slot",
        "room",
        "kind",
        "working_directory",
        "arguments",
        "path_intents",
    }
)


class ActionErrorCode(StrEnum):
    INVALID_TYPE = "invalid_type"
    UNKNOWN_FIELD = "unknown_field"
    MISSING_FIELD = "missing_field"
    UNSUPPORTED_SCHEMA = "unsupported_schema"
    UNSUPPORTED_ACTION = "unsupported_action"
    INVALID_VALUE = "invalid_value"
    INVALID_PATH = "invalid_path"
    FLOAT_NOT_ALLOWED = "float_not_allowed"
    NOT_DISPLAYABLE = "not_displayable"
    TOO_LARGE = "too_large"
    INTENT_MISMATCH = "intent_mismatch"
    NOT_CANONICAL = "not_canonical"


@dataclass(frozen=True, slots=True)
class ActionError:
    """A safe refusal naming only a schema field, never a rejected value."""

    code: ActionErrorCode
    field: str


@dataclass(frozen=True, slots=True, order=True)
class PathIntent:
    access: Access
    path: str


@dataclass(frozen=True, slots=True)
class ActionDescriptor:
    schema_version: Literal[1]
    mansion_id: str
    session_slot: str
    room: str
    kind: Literal["delete_path", "run_command", "git_write"]
    working_directory: str
    arguments: Mapping[str, JSONValue]
    path_intents: tuple[PathIntent, ...]


class _Refused(Exception):
    def __init__(self, code: ActionErrorCode, field: str) -> None:
        self.error = ActionError(code, field)


def is_action_digest(value: object) -> bool:
    return type(value) is str and _DIGEST.fullmatch(value) is not None


def is_displayable_label(value: object, *, maximum: int = MAX_LABEL_BYTES) -> bool:
    """Whether ``value`` is a non-empty bounded string shown exactly as is."""

    if type(value) is not str or value == "":
        return False
    text = cast(str, value)
    try:
        size = len(text.encode("utf-8"))
    except UnicodeEncodeError:
        return False
    return (
        size <= maximum
        and unicodedata.normalize("NFC", text) == text
        and not any(unicodedata.category(char) in _UNDISPLAYABLE for char in text)
    )


def parse_action_descriptor(raw: object) -> ActionDescriptor | ActionError:
    """Validate the JSON object form of an Action_Descriptor.

    Key order is irrelevant.  Path intents are a set: any order is accepted
    and stored sorted, while a duplicate is refused.
    """

    try:
        return _parse(raw)
    except _Refused as refused:
        return refused.error


def descriptor_to_json(descriptor: ActionDescriptor) -> dict[str, JSONValue]:
    """Return the JSON object whose canonical bytes define the digest."""

    return {
        "schema_version": descriptor.schema_version,
        "mansion_id": descriptor.mansion_id,
        "session_slot": descriptor.session_slot,
        "room": descriptor.room,
        "kind": descriptor.kind,
        "working_directory": descriptor.working_directory,
        "arguments": _thaw(descriptor.arguments),
        "path_intents": [
            {"access": intent.access.value, "path": intent.path}
            for intent in descriptor.path_intents
        ],
    }


def canonical_action(descriptor: ActionDescriptor) -> bytes:
    """Stable canonical bytes: UTF-8, sorted keys, no whitespace, no floats.

    The descriptor is validated again, so a hand-built instance that skipped
    :func:`parse_action_descriptor` cannot obtain bytes or a digest.
    """

    checked = _parse(_unchecked_json(descriptor))
    return canonical_json(descriptor_to_json(checked))


def action_digest(descriptor: ActionDescriptor) -> str:
    return hashlib.sha256(canonical_action(descriptor)).hexdigest()


def parse_canonical_action(data: object) -> ActionDescriptor | ActionError:
    """Parse canonical bytes; any other spelling of the same value fails."""

    if type(data) is not bytes:
        return ActionError(ActionErrorCode.INVALID_TYPE, "$")
    if len(cast(bytes, data)) > MAX_ACTION_BYTES:
        return ActionError(ActionErrorCode.TOO_LARGE, "$")
    try:
        raw = json.loads(
            cast(bytes, data).decode("utf-8"),
            parse_float=_refuse_float,
            parse_constant=_refuse_float,
            object_pairs_hook=_unique_object,
        )
    except _Refused as refused:
        return refused.error
    except (ValueError, RecursionError):
        return ActionError(ActionErrorCode.NOT_CANONICAL, "$")
    parsed = parse_action_descriptor(raw)
    if isinstance(parsed, ActionError):
        return parsed
    if canonical_action(parsed) != data:
        return ActionError(ActionErrorCode.NOT_CANONICAL, "$")
    return parsed


# --- internals ----------------------------------------------------------------


def _refuse_float(_text: str) -> object:
    raise _Refused(ActionErrorCode.FLOAT_NOT_ALLOWED, "$")


def _unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise _Refused(ActionErrorCode.NOT_CANONICAL, "$")
        result[key] = value
    return result


def _thaw(value: object) -> JSONValue:
    if isinstance(value, Mapping):
        return {key: _thaw(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_thaw(item) for item in value]
    return cast(JSONValue, value)


def _freeze(value: JSONValue) -> object:
    if type(value) is dict:
        return MappingProxyType(
            {key: _freeze(item) for key, item in cast(dict, value).items()}
        )
    if type(value) is list:
        return tuple(_freeze(item) for item in cast(list, value))
    return value


def _unchecked_json(descriptor: object) -> object:
    if not isinstance(descriptor, ActionDescriptor):
        raise _Refused(ActionErrorCode.INVALID_TYPE, "$")
    intents: list[object] = []
    for intent in descriptor.path_intents:
        if not isinstance(intent, PathIntent):
            raise _Refused(ActionErrorCode.INVALID_TYPE, "path_intents")
        access = intent.access
        intents.append(
            {
                "access": access.value if isinstance(access, Access) else access,
                "path": intent.path,
            }
        )
    return {
        "schema_version": descriptor.schema_version,
        "mansion_id": descriptor.mansion_id,
        "session_slot": descriptor.session_slot,
        "room": descriptor.room,
        "kind": descriptor.kind,
        "working_directory": descriptor.working_directory,
        "arguments": _thaw(descriptor.arguments),
        "path_intents": intents,
    }


def _object(raw: object, fields: frozenset[str], field: str) -> dict[str, object]:
    if type(raw) is not dict:
        raise _Refused(ActionErrorCode.INVALID_TYPE, field)
    record = cast(dict[object, object], raw)
    if not all(type(key) is str for key in record):
        raise _Refused(ActionErrorCode.UNKNOWN_FIELD, field)
    keys = set(cast(dict[str, object], record))
    if not keys <= fields:
        raise _Refused(ActionErrorCode.UNKNOWN_FIELD, field)
    if keys != fields:
        raise _Refused(ActionErrorCode.MISSING_FIELD, field)
    return cast(dict[str, object], record)


def _reject_floats(value: object, field: str) -> None:
    stack = [value]
    while stack:
        current = stack.pop()
        if type(current) is float:
            raise _Refused(ActionErrorCode.FLOAT_NOT_ALLOWED, field)
        if type(current) is dict:
            stack.extend(cast(dict, current).values())
        elif type(current) in (list, tuple):
            stack.extend(cast(list, current))


def _text(value: object, field: str, *, maximum: int) -> str:
    if type(value) is not str:
        raise _Refused(ActionErrorCode.INVALID_TYPE, field)
    if value == "":
        raise _Refused(ActionErrorCode.INVALID_VALUE, field)
    if not is_displayable_label(value, maximum=maximum):
        text = cast(str, value)
        try:
            too_large = len(text.encode("utf-8")) > maximum
        except UnicodeEncodeError:
            too_large = False
        raise _Refused(
            ActionErrorCode.TOO_LARGE if too_large else ActionErrorCode.NOT_DISPLAYABLE,
            field,
        )
    return cast(str, value)


def _path(value: object, field: str) -> str:
    if type(value) is not str:
        raise _Refused(ActionErrorCode.INVALID_TYPE, field)
    parsed = parse_relative_path(value)
    if isinstance(parsed, PathError):
        raise _Refused(ActionErrorCode.INVALID_PATH, field)
    return join_parts(parsed)


def _paths(value: object, field: str, *, minimum: int) -> list[str]:
    if type(value) is not list:
        raise _Refused(ActionErrorCode.INVALID_TYPE, field)
    items = cast(list[object], value)
    if not minimum <= len(items) <= MAX_PATH_INTENTS:
        raise _Refused(ActionErrorCode.INVALID_VALUE, field)
    paths = [_path(item, field) for item in items]
    if len(set(paths)) != len(paths):
        raise _Refused(ActionErrorCode.INVALID_VALUE, field)
    return paths


def _arguments(kind: str, raw: object) -> dict[str, JSONValue]:
    field = "arguments"
    if kind == "delete_path":
        record = _object(raw, frozenset({"path", "target"}), field)
        target = record["target"]
        if type(target) is not str:
            raise _Refused(ActionErrorCode.INVALID_TYPE, "arguments.target")
        if target not in ("file", "empty_directory"):
            raise _Refused(ActionErrorCode.INVALID_VALUE, "arguments.target")
        return {"path": _path(record["path"], "arguments.path"), "target": target}

    if kind == "run_command":
        record = _object(raw, frozenset({"argv", "timeout_seconds"}), field)
        argv = record["argv"]
        if type(argv) is not list:
            raise _Refused(ActionErrorCode.INVALID_TYPE, "arguments.argv")
        items = cast(list[object], argv)
        if not 1 <= len(items) <= MAX_ARGV_ITEMS:
            raise _Refused(ActionErrorCode.INVALID_VALUE, "arguments.argv")
        timeout = record["timeout_seconds"]
        if type(timeout) is not int:
            raise _Refused(ActionErrorCode.INVALID_TYPE, "arguments.timeout_seconds")
        if not 1 <= timeout <= MAX_COMMAND_TIMEOUT_SECONDS:
            raise _Refused(ActionErrorCode.INVALID_VALUE, "arguments.timeout_seconds")
        return {
            "argv": [
                _text(item, "arguments.argv", maximum=MAX_ARGUMENT_BYTES)
                for item in items
            ],
            "timeout_seconds": timeout,
        }

    # git_write: only ``add`` and ``commit`` exist.
    if type(raw) is not dict:
        raise _Refused(ActionErrorCode.INVALID_TYPE, field)
    operation = cast(dict[object, object], raw).get("operation")
    if type(operation) is not str:
        raise _Refused(ActionErrorCode.INVALID_TYPE, "arguments.operation")
    if operation == "add":
        record = _object(raw, frozenset({"operation", "pathspecs"}), field)
        return {
            "operation": "add",
            "pathspecs": cast(
                JSONValue, _paths(record["pathspecs"], "arguments.pathspecs", minimum=1)
            ),
        }
    if operation == "commit":
        record = _object(raw, frozenset({"operation", "pathspecs", "message"}), field)
        return {
            "operation": "commit",
            "message": _text(
                record["message"], "arguments.message", maximum=MAX_COMMIT_MESSAGE_BYTES
            ),
            "pathspecs": cast(
                JSONValue, _paths(record["pathspecs"], "arguments.pathspecs", minimum=0)
            ),
        }
    raise _Refused(ActionErrorCode.UNSUPPORTED_ACTION, "arguments.operation")


def _intents(kind: str, raw: object) -> tuple[PathIntent, ...]:
    field = "path_intents"
    if type(raw) is not list:
        raise _Refused(ActionErrorCode.INVALID_TYPE, field)
    items = cast(list[object], raw)
    if len(items) > MAX_PATH_INTENTS:
        raise _Refused(ActionErrorCode.TOO_LARGE, field)
    intents: list[PathIntent] = []
    for item in items:
        record = _object(item, frozenset({"access", "path"}), field)
        access = record["access"]
        if type(access) is not str:
            raise _Refused(ActionErrorCode.INVALID_TYPE, "path_intents.access")
        try:
            parsed_access = Access(access)
        except ValueError:
            raise _Refused(ActionErrorCode.INVALID_VALUE, "path_intents.access") from None
        if parsed_access not in _RISKY_INTENTS[kind]:
            raise _Refused(ActionErrorCode.INTENT_MISMATCH, "path_intents.access")
        intents.append(
            PathIntent(access=parsed_access, path=_path(record["path"], "path_intents.path"))
        )
    if len(set(intents)) != len(intents):
        raise _Refused(ActionErrorCode.INVALID_VALUE, field)
    return tuple(sorted(intents))


def _parse(raw: object) -> ActionDescriptor:
    _reject_floats(raw, "$")
    record = _object(raw, _FIELDS, "$")

    version = record["schema_version"]
    if type(version) is not int or version != ACTION_SCHEMA_VERSION:
        raise _Refused(ActionErrorCode.UNSUPPORTED_SCHEMA, "schema_version")

    mansion_id = record["mansion_id"]
    if type(mansion_id) is not str:
        raise _Refused(ActionErrorCode.INVALID_TYPE, "mansion_id")
    if not is_valid_mansion_name(mansion_id):
        raise _Refused(ActionErrorCode.INVALID_VALUE, "mansion_id")

    session_slot = _text(record["session_slot"], "session_slot", maximum=MAX_LABEL_BYTES)

    room = record["room"]
    if type(room) is not str:
        raise _Refused(ActionErrorCode.INVALID_TYPE, "room")
    if room not in ROOMS:
        raise _Refused(ActionErrorCode.INVALID_VALUE, "room")

    kind = record["kind"]
    if type(kind) is not str:
        raise _Refused(ActionErrorCode.INVALID_TYPE, "kind")
    if kind not in ACTION_KINDS:
        raise _Refused(ActionErrorCode.UNSUPPORTED_ACTION, "kind")

    working_directory = record["working_directory"]
    if type(working_directory) is not str:
        raise _Refused(ActionErrorCode.INVALID_TYPE, "working_directory")
    # The empty string is the Mansion root; anything else is a clean path.
    if working_directory != "":
        working_directory = _path(working_directory, "working_directory")

    arguments = _arguments(kind, record["arguments"])
    intents = _intents(kind, record["path_intents"])

    if kind == "delete_path":
        expected = (PathIntent(Access.DELETE, cast(str, arguments["path"])),)
        if intents != expected or working_directory != "":
            raise _Refused(ActionErrorCode.INTENT_MISMATCH, "path_intents")
    elif kind == "git_write":
        pathspecs = cast(list[str], arguments["pathspecs"])
        expected = tuple(sorted(PathIntent(Access.GIT_WRITE, path) for path in pathspecs))
        if intents != expected:
            raise _Refused(ActionErrorCode.INTENT_MISMATCH, "path_intents")

    descriptor = ActionDescriptor(
        schema_version=1,
        mansion_id=mansion_id,
        session_slot=session_slot,
        room=room,
        kind=cast(Literal["delete_path", "run_command", "git_write"], kind),
        working_directory=working_directory,
        arguments=cast(Mapping[str, JSONValue], _freeze(arguments)),
        path_intents=intents,
    )

    as_json = descriptor_to_json(descriptor)
    try:
        encoded = canonical_json(as_json)
        redacted = deep_redact(as_json)
    except (CanonicalJsonError, DeepRedactionError):
        raise _Refused(ActionErrorCode.INVALID_VALUE, "$") from None
    if len(encoded) > MAX_ACTION_BYTES:
        raise _Refused(ActionErrorCode.TOO_LARGE, "$")
    if redacted != as_json:
        # The persistence boundary would alter this value, so the operator
        # could never be shown exactly what would run.
        raise _Refused(ActionErrorCode.NOT_DISPLAYABLE, "$")
    return descriptor
