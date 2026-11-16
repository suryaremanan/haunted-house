"""Signed Room Ghosts routes (Spec 5 design, "Backend API extensions").

`register_room_ghost_routes` adds five routes to an application whose
proxy-signature middleware already guards every `/api/` path:

    GET  /api/mansions/{mansion_id}/specs/{spec}/room-ghosts
         200   <RoomGhosts read model>          (core.room_projection, schema 1)
    POST /api/mansions/{mansion_id}/specs/{spec}/feedback
         body  {"command_id", "expected_version", "phase", "feedback"}
    POST /api/mansions/{mansion_id}/specs/{spec}/workshop/start
         body  {"command_id", "expected_version", "task_ids": [...]}
    POST /api/room-ghosts/runs/{run_id}/cancel
    POST /api/room-ghosts/runs/{run_id}/retry
         body  {"command_id", "expected_version", "mansion_id"}

    accepted 202 = {"accepted": true, "command_id", "version", "run_id", "duplicate"}
    error        = {"error": {"code", "message"}}

A command is accepted, not finished: what follows is shown by the read model
and the canonical events.  A retry with the same `command_id` and content is
the same command.  Invalid input is 400 before any service is called, an
unknown Mansion, spec, or run 404, a stale view or an illegal state 409,
unavailable canonical integrity 423, a Crew failure 502 or 504, and an
unavailable prerequisite contract 503.

These are the only mutations Room Ghosts adds.  Phase starts and Door or
risky-action decisions stay on the Spec 4 routes: there is no approval route,
no state route, and no generic candidate route here.  Error messages are
fixed text chosen by code, so no request text, Crew text, host path, or
exception text can reach a response.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import cast

from aiohttp import web

from haunted_house.core.guardrail_events import is_safe_code
from haunted_house.core.room_ghost_requests import (
    parse_feedback,
    parse_run_command,
    parse_run_id,
    parse_spec_name,
    parse_workshop_start,
)
from haunted_house.core.seance_event import JSONValue, canonical_json
from haunted_house.core.workflow_requests import RequestError, parse_mansion_id
from haunted_house.services.room_ghost_service import CommandOutcome, RoomGhostError
from haunted_house.services.room_ghosts import RoomGhosts
from haunted_house.workflow_routes import WorkflowReply, read_json_body

__all__ = [
    "ERROR_MESSAGES",
    "ERROR_STATUSES",
    "FEEDBACK_PATH",
    "ROOM_GHOSTS_PATH",
    "RUN_COMMAND_PATH",
    "WORKSHOP_START_PATH",
    "RoomGhostsProvider",
    "register_room_ghost_routes",
    "room_ghost_error_status",
]

ROOM_GHOSTS_PATH = "/api/mansions/{mansion_id}/specs/{spec}/room-ghosts"
FEEDBACK_PATH = "/api/mansions/{mansion_id}/specs/{spec}/feedback"
WORKSHOP_START_PATH = "/api/mansions/{mansion_id}/specs/{spec}/workshop/start"
RUN_COMMAND_PATH = "/api/room-ghosts/runs/{run_id}/{command}"
_RUN_COMMANDS = ("cancel", "retry")

ERROR_STATUSES: dict[str, int] = {
    "invalid_request": 400,
    "invalid_mansion_id": 400,
    "request_too_large": 413,
    "mansion_not_found": 404,
    "spec_not_found": 404,
    "run_not_found": 404,
    "conflict": 409,
    "stale_version": 409,
    "invalid_state": 409,
    "command_conflict": 409,
    "predecessor_door_sealed": 409,
    "task_plan_invalid": 409,
    "task_not_selectable": 409,
    "document_missing": 409,
    "run_active": 409,
    "run_not_active": 409,
    "run_already_done": 409,
    "run_superseded": 409,
    "cancel_pending": 409,
    "cancel_unconfirmed": 409,
    "attempt_limit": 409,
    "integrity_unavailable": 423,
    "crew_failed": 502,
    "crew_capacity": 502,
    "capacity_unavailable": 502,
    "crew_timeout": 504,
    "contract_unavailable": 503,
    "room_ghosts_unavailable": 503,
}

ERROR_MESSAGES: dict[str, str] = {
    "invalid_request": "The request was not understood. Nothing was done.",
    "invalid_mansion_id": "Use 1-40 lowercase letters, numbers, and single hyphens.",
    "request_too_large": "The request is too large.",
    "mansion_not_found": "This mansion is not available.",
    "spec_not_found": "This mansion has no spec of that name.",
    "run_not_found": "This run does not exist.",
    "conflict": "The room changed before this arrived. Nothing was done.",
    "stale_version": "The room changed before this arrived. Nothing was done.",
    "invalid_state": "The room cannot do that now. Nothing was done.",
    "command_conflict": "This command id was already used for something else. Nothing was done.",
    "predecessor_door_sealed": "The tasks door is still sealed. Nothing was started.",
    "task_plan_invalid": "The task plan is missing or not valid. Nothing was started.",
    "task_not_selectable": "One of those tasks is not an open task of the plan. Nothing was started.",
    "document_missing": "There is no document to revise yet. Retry the run instead.",
    "run_active": "A ghost is still working on this. Nothing was done.",
    "run_not_active": "This run has already ended. Nothing was done.",
    "run_already_done": "This run completed. Nothing was done.",
    "run_superseded": "A newer attempt replaced this run. Nothing was done.",
    "cancel_pending": "Cancellation was already requested. Nothing more was sent.",
    "cancel_unconfirmed": "This run's cancellation was never confirmed, so it cannot be retried.",
    "attempt_limit": "This work already had three attempts. Nothing was started.",
    "integrity_unavailable": "The séance log failed its integrity check. The house accepts no requests.",
    "crew_failed": "Crew did not do its part. Check the state shown before trying again.",
    "crew_capacity": "Crew has no capacity right now. Nothing was started.",
    "capacity_unavailable": "Crew has no capacity right now. Nothing was started.",
    "crew_timeout": "Crew did not answer in time. Check the state shown before trying again.",
    "contract_unavailable": "A contract the house depends on is unavailable. Nothing was done.",
    "room_ghosts_unavailable": "The house is unavailable. Try again.",
}

# Refusals that mean the house itself could not act (not the request's fault).
_UNAVAILABLE = frozenset(
    {
        "writer_unavailable", "binding_failed", "identity_unavailable", "session_unavailable",
        "workflow_unavailable", "skill_missing", "skill_invalid", "skill_unreadable",
        "skill_role_unknown", "prompt_invalid", "prompt_too_large", "upstream_not_approved",
    }
)

log = logging.getLogger(__name__)

# Returns the services, or None while they cannot be built.
RoomGhostsProvider = Callable[[], RoomGhosts | None]


def room_ghost_error_status(code: str) -> tuple[str, int]:
    """The response code and HTTP status of a refusal.

    A refusal this table does not name is a conflict with current state; one
    that means the house could not act is ``room_ghosts_unavailable``.
    """

    if code in ERROR_STATUSES:
        return code, ERROR_STATUSES[code]
    if code in _UNAVAILABLE:
        return "room_ghosts_unavailable", 503
    return "conflict", 409


def _error_reply(code: str) -> WorkflowReply:
    known, status = room_ghost_error_status(code if is_safe_code(code) else "room_ghosts_unavailable")
    return WorkflowReply(status, {"error": {"code": known, "message": ERROR_MESSAGES[known]}})


def _accepted(command_id: str, outcome: CommandOutcome) -> WorkflowReply:
    return WorkflowReply(
        202,
        {
            "accepted": True,
            "command_id": command_id,
            "version": outcome.version,
            "run_id": outcome.run_id,
            "duplicate": outcome.duplicate,
        },
    )


def register_room_ghost_routes(
    app: web.Application, service: RoomGhosts | RoomGhostsProvider
) -> None:
    """Add the Room Ghosts routes to `app`.

    `service` is a `RoomGhosts`, or a zero-argument callable returning the
    current one (None while it cannot be built).  Call this before the
    application starts.
    """

    provider: RoomGhostsProvider = (lambda: service) if isinstance(service, RoomGhosts) else service

    async def read(request: web.Request) -> web.Response:
        async def run(rooms: RoomGhosts) -> WorkflowReply:
            mansion = parse_mansion_id(request.match_info.get("mansion_id"))
            spec = parse_spec_name(request.match_info.get("spec"))
            return WorkflowReply(200, await rooms.read(mansion, spec))

        return await _guarded(provider, run)

    async def feedback(request: web.Request) -> web.Response:
        async def run(rooms: RoomGhosts) -> WorkflowReply:
            mansion = parse_mansion_id(request.match_info.get("mansion_id"))
            spec = parse_spec_name(request.match_info.get("spec"))
            raw = await read_json_body(request)
            if isinstance(raw, WorkflowReply):
                return raw
            body = parse_feedback(raw)
            outcome = await rooms.feedback(
                mansion, spec, body.phase, body.feedback,
                command_id=body.command_id, expected_version=body.expected_version,
            )
            return _accepted(body.command_id, outcome)

        return await _guarded(provider, run)

    async def workshop_start(request: web.Request) -> web.Response:
        async def run(rooms: RoomGhosts) -> WorkflowReply:
            mansion = parse_mansion_id(request.match_info.get("mansion_id"))
            spec = parse_spec_name(request.match_info.get("spec"))
            raw = await read_json_body(request)
            if isinstance(raw, WorkflowReply):
                return raw
            body = parse_workshop_start(raw)
            outcome = await rooms.start_workshop(
                mansion, spec, body.task_ids,
                command_id=body.command_id, expected_version=body.expected_version,
            )
            return _accepted(body.command_id, outcome)

        return await _guarded(provider, run)

    async def run_command(request: web.Request) -> web.Response:
        async def run(rooms: RoomGhosts) -> WorkflowReply:
            command = request.match_info.get("command")
            if command not in _RUN_COMMANDS:
                raise web.HTTPNotFound()
            run_id = parse_run_id(request.match_info.get("run_id"))
            raw = await read_json_body(request)
            if isinstance(raw, WorkflowReply):
                return raw
            body = parse_run_command(raw)
            call = rooms.cancel if command == "cancel" else rooms.retry
            outcome = await call(
                body.mansion_id, run_id,
                command_id=body.command_id, expected_version=body.expected_version,
            )
            return _accepted(body.command_id, outcome)

        return await _guarded(provider, run)

    app.router.add_get(ROOM_GHOSTS_PATH, read, allow_head=False)
    app.router.add_post(FEEDBACK_PATH, feedback)
    app.router.add_post(WORKSHOP_START_PATH, workshop_start)
    app.router.add_post(RUN_COMMAND_PATH, run_command)


async def _guarded(
    provider: RoomGhostsProvider,
    run: Callable[[RoomGhosts], Awaitable[WorkflowReply]],
) -> web.Response:
    """Run one handler and map every failure to a stable error body."""

    rooms = provider()
    if rooms is None:
        reply = _error_reply("room_ghosts_unavailable")
    else:
        try:
            reply = await run(rooms)
        except web.HTTPException:
            raise
        except RequestError as error:
            reply = _error_reply(error.code)
        except RoomGhostError as error:
            reply = _error_reply(error.code)
        except Exception as error:  # never let exception text reach the client
            log.warning(
                "room ghosts request failed unexpectedly (%s): room_ghosts_unavailable",
                type(error).__name__,
            )
            reply = _error_reply("room_ghosts_unavailable")
    return web.Response(
        body=canonical_json(cast(JSONValue, reply.body)),
        status=reply.status,
        content_type="application/json",
        charset="utf-8",
    )
