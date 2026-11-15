#!/usr/bin/env python3
"""S9 reference stdio MCP server: room tools bound to trusted launch context.

Spike code, standard library only.  It answers one question for the
``doors-and-guardrails`` design: can a room-scoped MCP server decide *which
session, Ghost, Mansion and Room it serves* without reading any authority
from model-controlled data?

Trusted inputs (none of them reachable from a tool call):

* the app root, taken from this file's own real location;
* ``KIROCREW_SESSION_LABEL``, which Crew sets last on the per-session
  ``mcpServers`` element of a server that opts in with
  ``"x-kirocrew-session-label": true``;
* ``HH_ROOM``, static per agent profile, written by Crew from the app package;
* a binding record the app backend writes under ``<app-root>/data`` before it
  starts the session.

Untrusted inputs: tool names, tool arguments, ``_meta``, the process working
directory, and every other environment variable.

When the trusted context cannot be established the server lists no tools and
refuses every call (Requirement 6.9, 11.7).
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import stat
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

SESSION_LABEL_ENV = "KIROCREW_SESSION_LABEL"
ROOM_ENV = "HH_ROOM"
BINDING_DIR = ("data", "session-bindings")
BINDING_SCHEMA = 1
LABEL_PATTERN = re.compile(r"dashboard:[A-Za-z0-9._-]{1,128}")
NAME_PATTERN = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
SEGMENT_PATTERN = re.compile(r"[A-Za-z0-9._-]{1,100}")

SPEC_DOCUMENT_BY_ROOM = {
    "archivist": "requirements.md",
    "draughtsman": "design.md",
    "foreman": "tasks.md",
}
ROOMS = (*SPEC_DOCUMENT_BY_ROOM, "tinker")
READ_TOOLS = ("list_room_files", "read_room_file")
TOOLS_BY_ROOM = {
    "archivist": (*READ_TOOLS, "write_spec_document", "submit_phase_output"),
    "draughtsman": (*READ_TOOLS, "write_spec_document", "submit_phase_output"),
    "foreman": (*READ_TOOLS, "write_spec_document", "submit_phase_output"),
    "tinker": (
        *READ_TOOLS,
        "submit_phase_output",
        "write_room_file",
        "propose_risky_action",
        "execute_approved_action",
    ),
}
# Exact argument sets.  No tool accepts session, slot, Ghost, Mansion, Room,
# capability, or absolute-path authority.
TOOL_ARGUMENTS = {
    "list_room_files": {},
    "read_room_file": {"path": "string"},
    "write_spec_document": {"content": "string"},
    "submit_phase_output": {},
    "write_room_file": {"path": "string", "content": "string"},
    "propose_risky_action": {"kind": "string"},
    "execute_approved_action": {"proposal": "string"},
}


@dataclass(frozen=True)
class RoomContext:
    """Identity derived only from trusted launch inputs."""

    label: str
    ghost: str
    mansion: str
    room: str
    spec: str
    mansion_dir: Path


@dataclass(frozen=True)
class Blocked:
    """Why trusted context is unavailable.  ``code`` is content-free."""

    code: str


def app_root_from_file(file: str) -> Path | None:
    """The installed app root: the real parent of this file's ``mcp`` folder."""
    here = Path(os.path.realpath(file))
    root = here.parent.parent
    if here.parent.name != "mcp" or not (root / "app.json").is_file():
        return None
    return root


def _read_trusted_record(path: Path, app_root: Path) -> dict[str, Any] | None:
    """Read one backend-written record, refusing links and loose permissions."""
    directory = app_root
    for part in BINDING_DIR:
        directory = directory / part
        try:
            info = os.lstat(directory)
        except OSError:
            return None
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid():
            return None
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    except OSError:
        return None
    try:
        info = os.fstat(fd)
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_nlink != 1
            or info.st_uid != os.getuid()
            or info.st_mode & (stat.S_IWGRP | stat.S_IWOTH)
            or info.st_size > 4096
        ):
            return None
        raw = os.read(fd, 4097)
    finally:
        os.close(fd)
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) else None


def derive_context(env: Mapping[str, str], app_root: Path | None) -> RoomContext | Blocked:
    """Bind session, Ghost, Mansion and Room, or say why that is impossible."""
    if app_root is None:
        return Blocked("app_root_unverified")
    label = env.get(SESSION_LABEL_ENV, "")
    if not label:
        return Blocked("session_label_absent")
    if LABEL_PATTERN.fullmatch(label) is None:
        return Blocked("session_label_malformed")
    room = env.get(ROOM_ENV, "")
    if room not in ROOMS:
        return Blocked("profile_room_absent")
    digest = hashlib.sha256(label.encode("utf-8")).hexdigest()
    record = _read_trusted_record(app_root.joinpath(*BINDING_DIR, f"{digest}.json"), app_root)
    if record is None:
        return Blocked("session_binding_absent")
    expected = {"schema", "label", "ghost", "mansion", "room", "spec", "mansionDir"}
    if set(record) != expected or record["schema"] != BINDING_SCHEMA:
        return Blocked("session_binding_invalid")
    if record["label"] != label:
        return Blocked("session_binding_invalid")
    if record["room"] != room:
        return Blocked("profile_room_mismatch")
    for key in ("ghost", "mansion", "spec"):
        if not isinstance(record[key], str) or NAME_PATTERN.fullmatch(record[key]) is None:
            return Blocked("session_binding_invalid")
    raw_dir = record["mansionDir"]
    if not isinstance(raw_dir, str) or not os.path.isabs(raw_dir):
        return Blocked("session_binding_invalid")
    mansion_dir = Path(raw_dir)
    try:
        info = os.lstat(mansion_dir)
    except OSError:
        return Blocked("mansion_unavailable")
    if (
        not stat.S_ISDIR(info.st_mode)
        or os.path.realpath(mansion_dir) != os.fspath(mansion_dir)
        or mansion_dir.name != record["mansion"]
    ):
        return Blocked("mansion_unavailable")
    return RoomContext(label, record["ghost"], record["mansion"], room, record["spec"], mansion_dir)


def visible_tools(context: RoomContext | Blocked) -> tuple[str, ...]:
    """Exact per-room catalog.  A blocked server exposes nothing."""
    return TOOLS_BY_ROOM[context.room] if isinstance(context, RoomContext) else ()


def _tool_schema(name: str) -> dict[str, Any]:
    arguments = TOOL_ARGUMENTS[name]
    return {
        "name": name,
        "description": f"Haunted House room tool: {name.replace('_', ' ')}.",
        "inputSchema": {
            "type": "object",
            "properties": {key: {"type": kind} for key, kind in arguments.items()},
            "required": sorted(arguments),
            "additionalProperties": False,
        },
    }


def _relative_parts(raw: str) -> tuple[str, ...] | None:
    """Tiny stand-in for Path_Guard parsing; the real guard is task 5.x."""
    if not raw or raw.startswith("/") or "\\" in raw or "%" in raw:
        return None
    parts = tuple(raw.split("/"))
    if any(part in ("", ".", "..") or SEGMENT_PATTERN.fullmatch(part) is None for part in parts):
        return None
    if parts[0] in (".git", ".haunted-house"):
        return None
    return parts


def _write_inside(context: RoomContext, parts: tuple[str, ...], content: str) -> str:
    """Descriptor-relative, no-follow write below the bound Mansion only."""
    directory = os.open(context.mansion_dir, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in parts[:-1]:
            try:
                os.mkdir(part, 0o700, dir_fd=directory)
            except FileExistsError:
                pass
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
            os.close(directory)
            directory = child
        fd = os.open(
            parts[-1],
            os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW,
            0o600,
            dir_fd=directory,
        )
        try:
            if os.fstat(fd).st_nlink != 1:
                return "path_denied"
            os.write(fd, content.encode("utf-8"))
        finally:
            os.close(fd)
    except OSError:
        return "path_denied"
    finally:
        os.close(directory)
    return "written"


def call_tool(context: RoomContext | Blocked, name: object, arguments: object) -> dict[str, Any]:
    """Authorize from trusted context, then act.  Returns a content-free result."""
    if isinstance(context, Blocked):
        return {"ok": False, "code": "blocked", "reason": context.code}
    if not isinstance(name, str) or name not in visible_tools(context):
        return {"ok": False, "code": "tool_not_available"}
    expected = TOOL_ARGUMENTS[name]
    if (
        not isinstance(arguments, dict)
        or set(arguments) != set(expected)
        or any(not isinstance(value, str) for value in arguments.values())
    ):
        return {"ok": False, "code": "invalid_arguments"}
    bound = {"ghost": context.ghost, "mansion": context.mansion, "room": context.room}
    if name == "write_spec_document":
        parts = (".kiro", "specs", context.spec, SPEC_DOCUMENT_BY_ROOM[context.room])
        outcome = _write_inside(context, parts, arguments["content"])
        return {"ok": outcome == "written", "code": outcome, "path": "/".join(parts), **bound}
    if name == "write_room_file":
        parts = _relative_parts(arguments["path"])
        if parts is None or parts[:2] == (".kiro", "specs"):
            return {"ok": False, "code": "path_denied", **bound}
        outcome = _write_inside(context, parts, arguments["content"])
        return {"ok": outcome == "written", "code": outcome, **bound}
    if name == "list_room_files":
        return {"ok": True, "code": "listed", "count": len(os.listdir(context.mansion_dir)), **bound}
    return {"ok": False, "code": "not_implemented_in_spike", **bound}


def handle(context: RoomContext | Blocked, message: object) -> dict[str, Any] | None:
    """One JSON-RPC message in, at most one out.  Parsing only; no authority."""
    if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
        return {"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "invalid request"}}
    method, request_id = message.get("method"), message.get("id")
    if request_id is None:
        return None
    if method == "initialize":
        result: dict[str, Any] = {
            "protocolVersion": "2024-11-05",
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": "haunted-house-room", "version": "0.0.0-spike"},
        }
    elif method == "tools/list":
        result = {"tools": [_tool_schema(name) for name in visible_tools(context)]}
    elif method == "tools/call":
        params = message.get("params")
        params = params if isinstance(params, dict) else {}
        outcome = call_tool(context, params.get("name"), params.get("arguments", {}))
        result = {
            "content": [{"type": "text", "text": json.dumps(outcome, sort_keys=True)}],
            "isError": not outcome["ok"],
        }
    else:
        return {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32601, "message": "method not found"}}
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def main() -> int:
    context = derive_context(os.environ, app_root_from_file(__file__))
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            message = None
        reply = handle(context, message)
        if reply is not None:
            sys.stdout.write(json.dumps(reply) + "\n")
            sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
