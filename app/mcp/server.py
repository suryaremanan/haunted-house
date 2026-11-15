#!/usr/bin/env python3
"""Haunted House room MCP server: the bounded stdio protocol adapter.

Crew starts one process per room server entry and session as
``<gateway python> -s <app-root>/mcp/server.py`` with ``HH_ROOM`` from the
manifest and ``KIROCREW_SESSION_LABEL`` set by Crew.  This file only frames
and parses JSON-RPC; which tools exist and whether a call is allowed is
decided in ``room_tools`` and the backend from trusted launch context.

Standard library only.  Nothing but protocol replies is written to stdout,
and nothing sensitive is written anywhere: stderr gets at most a fixed,
content-free line.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, BinaryIO

SERVER_NAME = "haunted-house-room"
SERVER_VERSION = "0.1.0"
PROTOCOL_VERSIONS = ("2024-11-05", "2025-03-26", "2025-06-18")
MAX_LINE_BYTES = 512 * 1024
_CALL_PARAMS = frozenset({"name", "arguments", "_meta"})

PARSE_ERROR = (-32700, "parse error")
INVALID_REQUEST = (-32600, "invalid request")
METHOD_NOT_FOUND = (-32601, "method not found")
INVALID_PARAMS = (-32602, "invalid params")


def app_root_from_file(file: str) -> Path | None:
    """The installed app root: the real parent of this file's ``mcp`` folder."""

    here = Path(os.path.realpath(file))
    root = here.parent.parent
    if here.parent.name != "mcp" or not (root / "app.json").is_file():
        return None
    if not (root / "backend" / "haunted_house").is_dir():
        return None
    return root


def _error(request_id: object, error: tuple[int, str]) -> dict[str, Any]:
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": error[0], "message": error[1]},
    }


def _is_id(value: object) -> bool:
    return type(value) in (str, int)


class Server:
    """One JSON-RPC message in, at most one out.  Parsing only; no authority."""

    def __init__(self, tools: Any, launch: Any) -> None:
        # ``tools`` is the room_tools module, or None when the backend
        # package could not be loaded; ``launch`` derives the trusted context.
        self._tools = tools
        self._launch = launch
        self._context: Any = None
        self._waited = False

    def _current(self, *, wait: bool) -> Any:
        """The trusted context; derived again while it is still blocked."""

        if self._tools is None:
            return None
        if not isinstance(self._context, self._tools.RoomContext):
            # Only the first listing waits for a record that is a moment late.
            self._context = self._launch(wait and not self._waited)
            self._waited = self._waited or wait
        return self._context

    def handle(self, message: object) -> dict[str, Any] | None:
        if type(message) is not dict or message.get("jsonrpc") != "2.0":
            return _error(None, INVALID_REQUEST)
        method = message.get("method")
        if "id" not in message:
            # A notification (for example notifications/initialized): no reply.
            return None
        request_id = message["id"]
        if not _is_id(request_id) or type(method) is not str:
            return _error(None, INVALID_REQUEST)
        params = message.get("params", {})
        if type(params) is not dict:
            return _error(request_id, INVALID_PARAMS)

        if method == "initialize":
            requested = params.get("protocolVersion")
            version = requested if requested in PROTOCOL_VERSIONS else PROTOCOL_VERSIONS[0]
            result: dict[str, Any] = {
                "protocolVersion": version,
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
            }
        elif method == "ping":
            result = {}
        elif method == "tools/list":
            context = self._current(wait=True)
            result = {"tools": self._tools.visible_tools(context) if self._tools else []}
        elif method == "tools/call":
            if not set(params) <= _CALL_PARAMS or type(params.get("name")) is not str:
                return _error(request_id, INVALID_PARAMS)
            if self._tools is None:
                outcome: dict[str, Any] = {
                    "ok": False,
                    "code": "blocked",
                    "reason": "backend_package_unavailable",
                    "ghost_state": "blocked",
                }
            else:
                # ``_meta`` is accepted by the protocol and never read.
                outcome = self._tools.call_tool(
                    self._current(wait=False), params["name"], params.get("arguments", {})
                )
            result = {
                "content": [{"type": "text", "text": json.dumps(outcome, sort_keys=True)}],
                "isError": outcome.get("ok") is not True,
            }
        else:
            return _error(request_id, METHOD_NOT_FOUND)
        return {"jsonrpc": "2.0", "id": request_id, "result": result}


def _read_line(stream: BinaryIO) -> bytes | None:
    """One bounded line.  ``None`` at end of input, ``b""`` when over-long."""

    line = stream.readline(MAX_LINE_BYTES + 1)
    if not line:
        return None
    if len(line) > MAX_LINE_BYTES and not line.endswith(b"\n"):
        # Discard the rest of the oversized line without keeping it.
        while True:
            rest = stream.readline(MAX_LINE_BYTES)
            if not rest or rest.endswith(b"\n"):
                break
        return b""
    return line


def serve(server: Server, stdin: BinaryIO, stdout: BinaryIO) -> None:
    while True:
        line = _read_line(stdin)
        if line is None:
            return
        if line == b"":
            reply: dict[str, Any] | None = _error(None, INVALID_REQUEST)
        elif not line.strip():
            continue
        else:
            try:
                message = json.loads(line)
            except (ValueError, RecursionError):
                reply = _error(None, PARSE_ERROR)
            else:
                try:
                    reply = server.handle(message)
                except Exception:  # noqa: BLE001 - never a traceback on a protocol stream
                    request_id = message.get("id") if type(message) is dict else None
                    reply = _error(request_id if _is_id(request_id) else None, (-32603, "internal error"))
        if reply is not None:
            stdout.write(json.dumps(reply, ensure_ascii=True).encode("ascii") + b"\n")
            stdout.flush()


def main() -> int:
    # Keep the protocol stream private: anything that prints goes to stderr.
    protocol_out = os.fdopen(os.dup(sys.stdout.fileno()), "wb")
    os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
    sys.stdout = sys.stderr

    app_root = app_root_from_file(__file__)
    tools = None
    if app_root is not None:
        # The backend package is found from this file's real location only.
        sys.path.insert(0, os.fspath(app_root / "backend"))
        try:
            import room_tools as tools  # noqa: PLC0415
        except Exception:  # noqa: BLE001 - fail closed with no catalog
            tools = None

    def launch(wait: bool) -> Any:
        assert tools is not None
        return tools.derive_context(
            os.environ,
            app_root,
            wait_seconds=tools.BINDING_WAIT_SECONDS if wait else 0.0,
        )

    try:
        serve(Server(tools, launch), sys.stdin.buffer, protocol_out)
    except (BrokenPipeError, KeyboardInterrupt):
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
