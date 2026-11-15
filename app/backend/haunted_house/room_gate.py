"""The room gate: the capability-bound backend operation the MCP server calls.

A second, loopback-only listener, separate from the signed routes the Crew
gateway proxies.  Its only caller is the room MCP process, which is not the
gateway and holds no proxy secret; it authenticates with its Crew session
label and the Session_Capability from that session's owner-only binding
record (``SessionBindingStore.authenticate``).

The gate turns that pair into the trusted :class:`RoomBinding` and passes the
tool name and arguments to :class:`RoomToolService`.  A request body never
says which session, Ghost, Mansion, or Room it is for.  The gate's port is
published to the MCP process through the store's owner-only endpoint record.

It exposes no log path, file handle, or writer: only the room tools.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from typing import Any, Final

from aiohttp import web

from haunted_house.adapters.room_tool_service import RoomToolService
from haunted_house.adapters.session_bindings import RoomBinding, SessionBindingStore
from haunted_house.core.room_catalog import MAX_REQUEST_BYTES, TOOLS

__all__ = [
    "CAPABILITY_HEADER",
    "GATE_HOST",
    "LABEL_HEADER",
    "SESSION_PATH",
    "TOOL_PATH_PREFIX",
    "RoomGate",
    "build_gate_app",
]

log = logging.getLogger(__name__)

GATE_HOST: Final = "127.0.0.1"
LABEL_HEADER: Final = "X-HH-Session-Label"
CAPABILITY_HEADER: Final = "X-HH-Room-Capability"
SESSION_PATH: Final = "/room/v1/session"
TOOL_PATH_PREFIX: Final = "/room/v1/tools/"


def _refusal(status: int, reason: str) -> web.Response:
    return web.json_response(
        {"ok": False, "code": "blocked", "reason": reason, "ghost_state": "blocked"},
        status=status,
    )


def build_gate_app(service: RoomToolService, bindings: SessionBindingStore) -> web.Application:
    """The gate's aiohttp application: one identity read and the room tools."""

    def guarded(handler):
        async def handle(request: web.Request) -> web.Response:
            # A browser cannot be the caller: it always sends Origin on a
            # POST, and a rebinding page would carry a foreign Host.
            host = request.headers.get("Host", "")
            if "Origin" in request.headers or host.partition(":")[0] != GATE_HOST:
                return _refusal(403, "caller_not_allowed")
            if request.method != "POST":
                return _refusal(405, "method_not_allowed")
            session = bindings.authenticate(
                request.headers.get(LABEL_HEADER), request.headers.get(CAPABILITY_HEADER)
            )
            if session is None:
                # Never log either header value.
                return _refusal(401, "session_unknown")
            try:
                return await handler(request, session)
            except web.HTTPException as error:
                return _refusal(error.status, "request_refused")
            except Exception:  # noqa: BLE001 - no detail may reach the Ghost
                log.error("room gate request failed")
                return _refusal(500, "gate_error")

        return handle

    async def describe(_request: web.Request, session: RoomBinding) -> web.Response:
        return web.json_response(
            {
                "ok": True,
                "code": "bound",
                "label": session.label,
                "ghost": session.ghost,
                "mansion": session.mansion,
                "room": session.role,
                "spec": session.spec,
                "tools": list(service.catalog(session)),
            }
        )

    async def call(request: web.Request, session: RoomBinding) -> web.Response:
        tool = request.match_info["tool"]
        if tool not in TOOLS:
            return web.json_response({"ok": False, "code": "tool_not_available"})
        try:
            arguments: Any = json.loads(await request.read())
        except (ValueError, RecursionError):
            return web.json_response({"ok": False, "code": "invalid_arguments"})
        return web.json_response(await service.call(session, tool, arguments))

    app = web.Application(client_max_size=MAX_REQUEST_BYTES)
    app.router.add_route("*", SESSION_PATH, guarded(describe))
    app.router.add_route("*", TOOL_PATH_PREFIX + "{tool}", guarded(call))
    return app


class RoomGate:
    """Owns the loopback listener and publishes its port to the MCP process.

    Wiring: ``app.cleanup_ctx.append(gate.lifecycle)``.  Sessions are opened
    and closed by writing and removing their binding record in ``bindings``.
    """

    def __init__(self, service: RoomToolService, bindings: SessionBindingStore) -> None:
        self._service = service
        self._bindings = bindings
        self._runner: web.AppRunner | None = None
        self._port: int | None = None

    @property
    def port(self) -> int | None:
        return self._port

    async def start(self) -> int:
        if self._runner is not None and self._port is not None:
            return self._port
        runner = web.AppRunner(build_gate_app(self._service, self._bindings), access_log=None)
        await runner.setup()
        try:
            site = web.TCPSite(runner, GATE_HOST, 0)
            await site.start()
            port = int(runner.addresses[0][1])
            # Without the endpoint record no MCP process can find the gate.
            self._bindings.write_endpoint(port)
        except BaseException:
            await runner.cleanup()
            raise
        self._runner, self._port = runner, port
        log.info("room gate listening on loopback")
        return port

    async def stop(self) -> None:
        runner, self._runner, self._port = self._runner, None, None
        if runner is not None:
            await runner.cleanup()

    async def lifecycle(self, _app: web.Application) -> AsyncIterator[None]:
        await self.start()
        try:
            yield
        finally:
            await self.stop()
