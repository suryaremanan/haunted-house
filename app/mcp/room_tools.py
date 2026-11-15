"""Room tool module of the Haunted House MCP server.

Authorization lives here and in the backend, never in protocol parsing.
This module decides *which session this process serves* from trusted launch
inputs only, lists the exact catalog of that session's room, shape-checks a
call, and relays it to the backend room gate with the session capability.

Trusted inputs:

* the installed app root (the real location of ``server.py``);
* ``KIROCREW_SESSION_LABEL``, set last by Crew on the per-session element;
* ``HH_ROOM``, static per manifest server entry;
* the owner-only binding and endpoint records the backend wrote under
  ``<app-root>/data``;
* the backend's own answer about that label and capability.

Never trusted: tool names, tool arguments, ``_meta``, the working directory,
and every other environment variable (the process inherits kiro-cli's).

Anything missing or inconsistent yields :class:`Blocked`: no tool is listed
and every call is refused.  This process opens no project file and no log;
the capability never appears in a result.
"""

from __future__ import annotations

import http.client
import json
import re
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from haunted_house.adapters.session_bindings import RoomBinding, SessionBindingStore
from haunted_house.core.room_catalog import (
    MAX_REQUEST_BYTES,
    ROLES,
    ROOM_ENV,
    SESSION_LABEL_ENV,
    TOOLS_BY_ROLE,
    check_arguments,
    tool_schema,
)

GATE_HOST = "127.0.0.1"
DATA_DIRECTORY = "data"
LABEL_HEADER = "X-HH-Session-Label"
CAPABILITY_HEADER = "X-HH-Room-Capability"
SESSION_PATH = "/room/v1/session"
TOOL_PATH_PREFIX = "/room/v1/tools/"
DESCRIBE_TIMEOUT_SECONDS = 5.0
# An approved command may run for ten minutes; the gate answers after it.
CALL_TIMEOUT_SECONDS = 660.0
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
# The backend writes the record before it creates the Crew slot; this short
# wait only covers a process that Crew happens to start a moment early.
BINDING_WAIT_SECONDS = 1.5
_BINDING_POLL_SECONDS = 0.1
_LABEL = re.compile(r"dashboard:[A-Za-z0-9][A-Za-z0-9._-]{0,127}")


@dataclass(frozen=True)
class Blocked:
    """Why trusted context is unavailable.  ``code`` is content-free."""

    code: str


@dataclass(frozen=True)
class RoomContext:
    """Identity derived only from trusted launch inputs."""

    label: str
    ghost: str
    mansion: str
    room: str
    spec: str
    tools: tuple[str, ...]
    gate: GateClient = field(repr=False)


def _blocked_result(reason: str) -> dict[str, Any]:
    return {"ok": False, "code": "blocked", "reason": reason, "ghost_state": "blocked"}


class GateClient:
    """Loopback client of the backend room gate for one session capability."""

    def __init__(self, port: int, label: str, capability: str) -> None:
        self._port = port
        self._label = label
        self._capability = capability

    def _post(self, path: str, body: Mapping[str, Any], timeout: float) -> dict[str, Any]:
        try:
            payload = json.dumps(body, ensure_ascii=True, allow_nan=False).encode("ascii")
        except (TypeError, ValueError, RecursionError):
            return {"ok": False, "code": "invalid_arguments"}
        if len(payload) > MAX_REQUEST_BYTES:
            return {"ok": False, "code": "too_large"}
        # http.client reads no proxy or other environment configuration.
        connection = http.client.HTTPConnection(GATE_HOST, self._port, timeout=timeout)
        try:
            connection.request(
                "POST",
                path,
                body=payload,
                headers={
                    "Content-Type": "application/json",
                    LABEL_HEADER: self._label,
                    CAPABILITY_HEADER: self._capability,
                },
            )
            response = connection.getresponse()
            raw = response.read(MAX_RESPONSE_BYTES + 1)
            status = response.status
        except (OSError, http.client.HTTPException):
            return _blocked_result("gate_unavailable")
        finally:
            connection.close()
        if len(raw) > MAX_RESPONSE_BYTES:
            return {"ok": False, "code": "too_large"}
        try:
            result = json.loads(raw)
        except (ValueError, RecursionError):
            return _blocked_result("gate_unavailable")
        if (
            type(result) is not dict
            or type(result.get("ok")) is not bool
            or type(result.get("code")) is not str
            or (status != 200 and result["ok"])
            or self._capability in raw.decode("utf-8", "replace")
        ):
            return _blocked_result("gate_unavailable")
        return result

    def describe(self) -> dict[str, Any]:
        return self._post(SESSION_PATH, {}, DESCRIBE_TIMEOUT_SECONDS)

    def call(self, tool: str, arguments: Mapping[str, Any]) -> dict[str, Any]:
        return self._post(TOOL_PATH_PREFIX + tool, arguments, CALL_TIMEOUT_SECONDS)


def _bind(binding: RoomBinding, port: int, room: str) -> RoomContext | Blocked:
    if binding.role != room:
        return Blocked("profile_room_mismatch")
    gate = GateClient(port, binding.label, binding.capability)
    described = gate.describe()
    if described.get("ok") is not True:
        return Blocked("session_binding_stale")
    expected = {
        "label": binding.label,
        "ghost": binding.ghost,
        "mansion": binding.mansion,
        "room": binding.role,
        "spec": binding.spec,
    }
    if any(described.get(key) != value for key, value in expected.items()):
        return Blocked("session_binding_stale")
    tools = TOOLS_BY_ROLE[room]
    if described.get("tools") != list(tools):
        # The backend and this package disagree about the catalog.
        return Blocked("catalog_mismatch")
    return RoomContext(
        label=binding.label,
        ghost=binding.ghost,
        mansion=binding.mansion,
        room=room,
        spec=binding.spec,
        tools=tools,
        gate=gate,
    )


def derive_context(
    env: Mapping[str, str],
    app_root: Path | None,
    *,
    wait_seconds: float = 0.0,
    sleep: Callable[[float], None] = time.sleep,
) -> RoomContext | Blocked:
    """Bind session, Ghost, Mansion and Room, or say why that is impossible."""

    if app_root is None:
        return Blocked("app_root_unverified")
    label = env.get(SESSION_LABEL_ENV, "")
    if not label:
        return Blocked("session_label_absent")
    if _LABEL.fullmatch(label) is None:
        return Blocked("session_label_malformed")
    room = env.get(ROOM_ENV, "")
    if room not in ROLES:
        return Blocked("profile_room_absent")
    store = SessionBindingStore(app_root / DATA_DIRECTORY)
    waited = 0.0
    while True:
        # Missing, linked, shared, oversized, and malformed records all read
        # as absent: none of them is a binding.
        binding = store.load(label)
        if binding is not None:
            break
        if waited >= wait_seconds:
            return Blocked("session_binding_absent")
        sleep(_BINDING_POLL_SECONDS)
        waited += _BINDING_POLL_SECONDS
    port = store.read_endpoint()
    if port is None:
        return Blocked("backend_endpoint_absent")
    return _bind(binding, port, room)


def visible_tools(context: RoomContext | Blocked) -> list[dict[str, Any]]:
    """Exact per-room catalog.  A blocked server exposes nothing."""

    if not isinstance(context, RoomContext):
        return []
    return [tool_schema(name, context.room) for name in context.tools]


def call_tool(context: RoomContext | Blocked, name: object, arguments: object) -> dict[str, Any]:
    """Shape-check from trusted context, then relay.  Content-free on refusal."""

    if not isinstance(context, RoomContext):
        return _blocked_result(context.code)
    if type(name) is not str or name not in context.tools:
        return {"ok": False, "code": "tool_not_available"}
    problem = check_arguments(name, arguments, context.room)
    if problem is not None:
        return {"ok": False, "code": problem}
    assert isinstance(arguments, dict)
    return context.gate.call(name, arguments)
