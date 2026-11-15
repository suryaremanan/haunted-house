"""The exact room tool catalog shared by the MCP server, profiles, and backend.

One table says which Ghost role sees which MCP_Gate tool and what each tool
accepts.  The stdio server lists from it, the backend room gate authorizes
from it, the agent profiles are checked against it, and Crew permission
correlation takes its tool names from it, so the four can never drift.

No tool schema has a field for session, slot, Ghost, Mansion, Room, or a
capability: that identity comes only from the trusted launch context.  A
risky tool takes the model's ``action`` (kind, working directory, arguments,
path intents); :func:`complete_descriptor` adds the trusted identity to make
the Action_Descriptor that is canonicalized, shown, approved, and consumed.

Pure: no I/O, standard library only (the MCP process imports it).
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any, Final

__all__ = [
    "ACTION_FIELDS",
    "APP_NAME",
    "EXECUTION_TOOL",
    "EXECUTION_TOOL_NAMES",
    "MAX_CONTENT_BYTES",
    "MAX_REQUEST_BYTES",
    "MUTATION_TOOLS",
    "PROPOSAL_TOOL",
    "ROLES",
    "ROOM_ENV",
    "SERVER_BY_ROLE",
    "SESSION_LABEL_ENV",
    "TOOLS",
    "TOOLS_BY_ROLE",
    "check_arguments",
    "complete_descriptor",
    "is_room_tool_name",
    "room_tool_names",
    "server_name",
    "tool_schema",
    "tool_selector",
    "tool_selectors",
]

APP_NAME: Final = "haunted-house"
SESSION_LABEL_ENV: Final = "KIROCREW_SESSION_LABEL"
ROOM_ENV: Final = "HH_ROOM"

ROLES: Final = ("archivist", "draughtsman", "foreman", "tinker")
SERVER_BY_ROLE: Final[Mapping[str, str]] = {role: f"room-{role}" for role in ROLES}

# One Spec_Document or room file a Ghost may send in one call.
MAX_CONTENT_BYTES: Final = 256 * 1024
# One JSON-RPC line or one gate request body.
MAX_REQUEST_BYTES: Final = 512 * 1024
_MAX_PATH_CHARS: Final = 1024
_MAX_IDENTIFIER_CHARS: Final = 128
_MAX_REVISION: Final = 2**31 - 1

EXECUTION_TOOL: Final = "execute_approved_action"
PROPOSAL_TOOL: Final = "propose_risky_action"

_READ_TOOLS = ("list_room_files", "read_room_file")
_SPEC_TOOLS = (*_READ_TOOLS, "write_spec_document", "submit_phase_output")
TOOLS_BY_ROLE: Final[Mapping[str, tuple[str, ...]]] = {
    "archivist": _SPEC_TOOLS,
    "draughtsman": _SPEC_TOOLS,
    "foreman": _SPEC_TOOLS,
    "tinker": (
        *_READ_TOOLS,
        "submit_phase_output",
        "write_room_file",
        PROPOSAL_TOOL,
        EXECUTION_TOOL,
    ),
}
MUTATION_TOOLS: Final = frozenset(
    {
        "write_spec_document",
        "submit_phase_output",
        "write_room_file",
        PROPOSAL_TOOL,
        EXECUTION_TOOL,
    }
)

# The model-chosen part of an Action_Descriptor.  Identity is never here.
ACTION_FIELDS: Final = frozenset({"kind", "working_directory", "arguments", "path_intents"})

_PATH = {"type": "string", "minLength": 1, "maxLength": _MAX_PATH_CHARS}
_CONTENT = {"type": "string", "maxLength": MAX_CONTENT_BYTES}
_SHA256_PATTERN: Final = re.compile(r"[0-9a-f]{64}")
_EXPECTED_SHA256 = {"type": ["string", "null"], "pattern": "^[0-9a-f]{64}$"}
_ACTION = {
    "type": "object",
    "description": (
        "The complete structured action. It is shown to the operator exactly "
        "as given and must be repeated unchanged when executing."
    ),
    "properties": {
        "kind": {"type": "string", "enum": ["delete_path", "run_command", "git_write"]},
        "working_directory": {
            "type": "string",
            "maxLength": _MAX_PATH_CHARS,
            "description": "Mansion-relative directory; the empty string is the Mansion root.",
        },
        "arguments": {"type": "object"},
        "path_intents": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"access": {"type": "string"}, "path": _PATH},
                "required": ["access", "path"],
                "additionalProperties": False,
            },
        },
    },
    "required": sorted(ACTION_FIELDS),
    "additionalProperties": False,
}

# name -> (description, properties, required)
_TOOL_TABLE: Final[Mapping[str, tuple[str, Mapping[str, Any], tuple[str, ...]]]] = {
    "list_room_files": (
        "List one directory of the Mansion this Ghost is bound to. Omit path for the root.",
        {"path": _PATH},
        (),
    ),
    "read_room_file": (
        "Read one UTF-8 text file of the Mansion by its relative path.",
        {"path": _PATH},
        ("path",),
    ),
    "write_spec_document": (
        "Replace this room's own Spec_Document. expected_revision is the revision "
        "last read or written (0 when the document does not exist yet).",
        {
            "content": _CONTENT,
            "expected_revision": {"type": "integer", "minimum": 0, "maximum": _MAX_REVISION},
        },
        ("content", "expected_revision"),
    ),
    "submit_phase_output": (
        "Mark this room's Spec_Document ready for the operator's Door decision.",
        {},
        (),
    ),
    "write_room_file": (
        "Create or replace one project file inside this room's allowed paths. "
        "expected_sha256 is the SHA-256 of the file as last read, or null when "
        "the file must not exist yet; it is required while a task claim is active.",
        {"path": _PATH, "content": _CONTENT, "expected_sha256": _EXPECTED_SHA256},
        ("path", "content"),
    ),
    PROPOSAL_TOOL: (
        "Propose one risky action (delete, command, or git add/commit) for the "
        "operator to approve. It does not run anything.",
        {"action": _ACTION},
        ("action",),
    ),
    EXECUTION_TOOL: (
        "Run one action the operator approved. The action must equal the "
        "proposal exactly; an approval covers one attempt.",
        {
            "proposal_id": {"type": "string", "minLength": 1, "maxLength": _MAX_IDENTIFIER_CHARS},
            "action": _ACTION,
        },
        ("proposal_id", "action"),
    ),
}
TOOLS: Final = tuple(_TOOL_TABLE)

# A Tinker has no Spec_Document: it names the result file it submits.
_ROLE_OVERRIDES: Final[Mapping[tuple[str, str], tuple[str, Mapping[str, Any], tuple[str, ...]]]] = {
    ("tinker", "submit_phase_output"): (
        "Mark the implementation ready for the operator's Door decision. path "
        "names the result file (not a spec document) that records the work.",
        {"path": _PATH},
        ("path",),
    ),
}


def _entry(tool: str, role: str | None) -> tuple[str, Mapping[str, Any], tuple[str, ...]]:
    return _ROLE_OVERRIDES.get((role or "", tool), _TOOL_TABLE[tool])


def server_name(role: str) -> str:
    return SERVER_BY_ROLE[role]


def tool_selector(role: str, tool: str) -> str:
    """The exact agent-profile selector of one room tool."""

    if tool not in TOOLS_BY_ROLE[role]:
        raise KeyError(tool)
    return f"@{APP_NAME}:{SERVER_BY_ROLE[role]}/{tool}"


def tool_selectors(role: str) -> tuple[str, ...]:
    return tuple(tool_selector(role, tool) for tool in TOOLS_BY_ROLE[role])


def room_tool_names(role: str, tool: str) -> frozenset[str]:
    """Every spelling under which Crew may report one room tool.

    The bare MCP name, the profile selector, and the selector without its
    ``@``.  A name is only ever one input to an exact match that also needs
    slot, message identity, proposal, and Action_Digest.
    """

    selector = tool_selector(role, tool)
    return frozenset({tool, selector, selector[1:]})


def is_room_tool_name(name: object, role: str, tool: str) -> bool:
    return (
        type(name) is str
        and role in TOOLS_BY_ROLE
        and tool in TOOLS_BY_ROLE[role]
        and name in room_tool_names(role, tool)
    )


# Only the Tinker can execute; these are the names Crew permission
# correlation accepts for that one tool.
EXECUTION_TOOL_NAMES: Final = room_tool_names("tinker", EXECUTION_TOOL)


def tool_schema(tool: str, role: str | None = None) -> dict[str, Any]:
    """The MCP ``tools/list`` entry of one tool as ``role`` sees it."""

    description, properties, required = _entry(tool, role)
    return {
        "name": tool,
        "description": description,
        "inputSchema": {
            "type": "object",
            "properties": {key: dict(value) for key, value in properties.items()},
            "required": list(required),
            "additionalProperties": False,
        },
    }


def _is_text(value: object, *, minimum: int, maximum: int) -> bool:
    return type(value) is str and minimum <= len(value) <= maximum


def _is_action(value: object) -> bool:
    return (
        type(value) is dict
        and all(type(key) is str for key in value)
        and set(value) == ACTION_FIELDS
        and type(value["kind"]) is str
        and type(value["working_directory"]) is str
        and type(value["arguments"]) is dict
        and type(value["path_intents"]) is list
    )


def check_arguments(tool: str, arguments: object, role: str | None = None) -> str | None:
    """Shape-check one call.  Returns ``None`` or a content-free code.

    This is the shallow, protocol-side check: exact keys, JSON types, and
    bounds.  Paths, descriptors, revisions, and policy are judged by the
    backend from trusted context.
    """

    if tool not in _TOOL_TABLE:
        return "tool_not_available"
    _description, properties, required = _entry(tool, role)
    if type(arguments) is not dict or not all(type(key) is str for key in arguments):
        return "invalid_arguments"
    if not set(required) <= set(arguments) <= set(properties):
        return "invalid_arguments"
    for key, value in arguments.items():
        if key == "path":
            valid = _is_text(value, minimum=1, maximum=_MAX_PATH_CHARS)
        elif key == "content":
            if type(value) is not str:
                return "invalid_arguments"
            try:
                size = len(value.encode("utf-8"))
            except UnicodeEncodeError:
                return "invalid_arguments"
            if size > MAX_CONTENT_BYTES:
                return "too_large"
            valid = True
        elif key == "expected_revision":
            valid = type(value) is int and 0 <= value <= _MAX_REVISION
        elif key == "expected_sha256":
            valid = value is None or (
                type(value) is str and _SHA256_PATTERN.fullmatch(value) is not None
            )
        elif key == "proposal_id":
            valid = _is_text(value, minimum=1, maximum=_MAX_IDENTIFIER_CHARS)
        else:  # action
            valid = _is_action(value)
        if not valid:
            return "invalid_arguments"
    return None


def complete_descriptor(
    action: object, *, mansion_id: str, session_slot: str, room: str
) -> dict[str, Any] | None:
    """Join a model ``action`` with trusted identity into a raw descriptor.

    Returns ``None`` when ``action`` is not exactly the four model fields, so
    a model-supplied ``mansion_id``, ``session_slot``, ``room``, or
    ``schema_version`` can never reach the descriptor.  The result still has
    to pass ``parse_action_descriptor``.
    """

    if not _is_action(action):
        return None
    assert isinstance(action, dict)
    return {
        "schema_version": 1,
        "mansion_id": mansion_id,
        "session_slot": session_slot,
        "room": room,
        "kind": action["kind"],
        "working_directory": action["working_directory"],
        "arguments": action["arguments"],
        "path_intents": action["path_intents"],
    }
