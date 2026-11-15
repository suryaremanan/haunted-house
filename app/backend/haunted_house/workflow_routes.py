"""Signed workflow and decision API (Doors and Guardrails, Requirement 8).

`register_workflow_routes` adds six routes to an application whose
proxy-signature middleware already guards every `/api/` path:

    GET  /api/mansions/{mansion_id}/workflow
         200   <WorkflowProjection>            (core.workflow_dto, schema 1)
    POST /api/mansions/{mansion_id}/phases/{phase}/start
         body  {"command_id", "expected_version"[, "assignments": [...]]}
    POST /api/mansions/{mansion_id}/doors/{proposal_id}/approve | reject
         body  {"command_id", "expected_version", "phase", "document_path",
                "artifact_revision": {"revision", "sha256", "size_bytes"}}
    POST /api/mansions/{mansion_id}/approvals/{proposal_id}/approve | reject
         body  {"command_id", "expected_version", "action_digest"}

    mutation 200 = {"event_id", "sequence", "version", "workflow"}
    error        = {"error": {"code", "message"}[, "workflow": <projection>]}

A mutation returns the acknowledged App_Event of the command and the
projection folded after it.  A retry with the same `command_id` and content
returns the same record.  A stale Projection_Version, proposal, revision, or
digest is 409 with the current projection and appends nothing; invalid input
is 400 before any candidate is built; an unknown Mansion or proposal is 404;
unavailable canonical integrity is 423; a Crew failure is 502 or 504.

The browser never appends a record: there is no generic candidate route, and
event reads and integrity diagnostics stay on the Spec 2 routes.  Error
messages are fixed text chosen by code, so no request text, Crew text, host
path, or exception text can reach a response.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Literal, cast

from aiohttp import web

from haunted_house.adapters.workflow_service import (
    CommandResult,
    WorkflowError,
    WorkflowService,
    WorkflowView,
)
from haunted_house.core.guardrail_events import is_safe_code
from haunted_house.core.seance_event import JSONValue, canonical_json
from haunted_house.core.workflow_requests import (
    MAX_REQUEST_BYTES,
    RequestError,
    parse_decision,
    parse_door_decision,
    parse_mansion_id,
    parse_phase,
    parse_proposal_id,
    parse_risky_decision,
    parse_start,
)

__all__ = [
    "APPROVAL_DECISION_PATH",
    "DOOR_DECISION_PATH",
    "ERROR_MESSAGES",
    "ERROR_STATUSES",
    "PHASE_START_PATH",
    "WORKFLOW_PATH",
    "WorkflowReply",
    "WorkflowServiceProvider",
    "register_workflow_routes",
    "run_workflow_command",
    "workflow_error_status",
]

WORKFLOW_PATH = "/api/mansions/{mansion_id}/workflow"
PHASE_START_PATH = "/api/mansions/{mansion_id}/phases/{phase}/start"
DOOR_DECISION_PATH = "/api/mansions/{mansion_id}/doors/{proposal_id}/{decision}"
APPROVAL_DECISION_PATH = "/api/mansions/{mansion_id}/approvals/{proposal_id}/{decision}"

ERROR_STATUSES: dict[str, int] = {
    "invalid_request": 400,
    "invalid_mansion_id": 400,
    "invalid_command": 400,
    "request_too_large": 413,
    "mansion_not_found": 404,
    "proposal_not_found": 404,
    "conflict": 409,
    "stale_version": 409,
    "stale_proposal": 409,
    "stale_revision": 409,
    "stale_digest": 409,
    "already_decided": 409,
    "no_pending_proposal": 409,
    "invalid_state": 409,
    "predecessor_door_sealed": 409,
    "command_conflict": 409,
    "artifact_changed": 409,
    "proposal_blocked": 409,
    "workshop_full": 409,
    "integrity_unavailable": 423,
    "crew_failed": 502,
    "crew_timeout": 504,
    "workflow_unavailable": 503,
}

ERROR_MESSAGES: dict[str, str] = {
    "invalid_request": "The workflow request was not understood. Nothing was recorded.",
    "invalid_mansion_id": "Use 1-40 lowercase letters, numbers, and single hyphens.",
    "invalid_command": "The workflow request was not understood. Nothing was recorded.",
    "request_too_large": "The workflow request is too large.",
    "mansion_not_found": "This mansion is not available.",
    "proposal_not_found": "This proposal does not exist.",
    "conflict": "The house changed before this arrived. Nothing was recorded.",
    "stale_version": "The house changed before this arrived. Nothing was recorded.",
    "stale_proposal": "This proposal is no longer the current one. Nothing was recorded.",
    "stale_revision": "The document changed after this proposal. Nothing was recorded.",
    "stale_digest": "This is not the action that was proposed. Nothing was recorded.",
    "already_decided": "This proposal was already decided. Nothing was recorded.",
    "no_pending_proposal": "There is no pending proposal to decide. Nothing was recorded.",
    "invalid_state": "This phase cannot do that now. Nothing was recorded.",
    "predecessor_door_sealed": "The door before this phase is still sealed. Nothing was started.",
    "command_conflict": "This command id was already used for something else. Nothing was recorded.",
    "artifact_changed": "The document changed after this proposal. A new proposal is required.",
    "proposal_blocked": "This action cannot be shown exactly, so it cannot be approved.",
    "workshop_full": "The workshop already runs three ghosts. Nothing was started.",
    "integrity_unavailable": "The séance log failed its integrity check. The house accepts no decisions.",
    "crew_failed": "Crew did not do its part. Check the state shown before trying again.",
    "crew_timeout": "Crew did not answer in time. Check the state shown before trying again.",
    "workflow_unavailable": "The house is unavailable. Try again.",
}

log = logging.getLogger(__name__)

# Returns the service, or None while it cannot be built.
WorkflowServiceProvider = Callable[[], WorkflowService | None]
CommandKind = Literal["start", "door", "approval"]


@dataclass(frozen=True, slots=True)
class WorkflowReply:
    status: int
    body: dict[str, JSONValue]


def workflow_error_status(code: str) -> tuple[str, int]:
    """The response code and HTTP status of a service refusal.

    A refusal the pure state machine names but this table does not (for
    example ``duplicate_proposal``) is a conflict with current state.
    """

    if code in ERROR_STATUSES:
        return code, ERROR_STATUSES[code]
    if code in ("writer_unavailable", "binding_failed", "identity_unavailable"):
        return "workflow_unavailable", 503
    return "conflict", 409


def _error_reply(code: str, view: WorkflowView | None = None) -> WorkflowReply:
    known, status = workflow_error_status(code if is_safe_code(code) else "workflow_unavailable")
    body: dict[str, JSONValue] = {"error": {"code": known, "message": ERROR_MESSAGES[known]}}
    if view is not None:
        try:
            body["workflow"] = view.to_json()
        except Exception:  # noqa: BLE001 - an unreadable projection is simply omitted
            log.warning("workflow projection could not be serialized")
    return WorkflowReply(status, body)


def _success_reply(result: CommandResult) -> WorkflowReply:
    workflow = result.view.to_json()
    return WorkflowReply(
        200,
        {
            "event_id": result.event.event_id,
            "sequence": result.event.sequence,
            "version": workflow["version"],
            "workflow": workflow,
        },
    )


async def run_workflow_command(
    service: WorkflowService,
    kind: CommandKind,
    *,
    mansion_id: object,
    target: object,
    decision: object = None,
    body: object,
) -> WorkflowReply:
    """Validate one mutation completely, then hand it to the service.

    ``target`` is the phase (``start``) or the proposal identifier.  Parsing
    finishes before the service is called, so invalid input builds no
    candidate and reaches neither Crew nor the writer.
    """

    try:
        mansion = parse_mansion_id(mansion_id)
        if kind == "start":
            phase = parse_phase(target)
            start = parse_start(body)
            call: Callable[[], Awaitable[CommandResult]] = lambda: service.start_phase(  # noqa: E731
                mansion,
                phase,
                command_id=start.command_id,
                expected_version=start.expected_version,
                assignments=start.assignments,
            )
        elif kind == "door":
            proposal_id = parse_proposal_id(target)
            approve = parse_decision(decision)
            door = parse_door_decision(body)
            call = lambda: service.decide_door(  # noqa: E731
                mansion,
                proposal_id,
                approve=approve,
                phase=door.phase,
                document_path=door.document_path,
                artifact_revision=door.artifact_revision,
                command_id=door.command_id,
                expected_version=door.expected_version,
            )
        elif kind == "approval":
            proposal_id = parse_proposal_id(target)
            approve = parse_decision(decision)
            risky = parse_risky_decision(body)
            call = lambda: service.decide_risky_action(  # noqa: E731
                mansion,
                proposal_id,
                approve=approve,
                action_digest=risky.action_digest,
                command_id=risky.command_id,
                expected_version=risky.expected_version,
            )
        else:
            return _error_reply("invalid_request")
    except RequestError as error:
        return _error_reply(error.code)

    try:
        return _success_reply(await call())
    except WorkflowError as error:
        return _error_reply(error.code, error.view)


def register_workflow_routes(
    app: web.Application, service: WorkflowService | WorkflowServiceProvider
) -> None:
    """Add the workflow routes to `app`.

    `service` is a `WorkflowService`, or a zero-argument callable returning
    the current one (None while it cannot be built).  Call this before the
    application starts.
    """
    provider: WorkflowServiceProvider = (
        (lambda: service) if isinstance(service, WorkflowService) else service
    )

    async def workflow(request: web.Request) -> web.Response:
        async def run(current: WorkflowService) -> WorkflowReply:
            try:
                mansion = parse_mansion_id(request.match_info.get("mansion_id"))
            except RequestError as error:
                return _error_reply(error.code)
            try:
                view = await current.projection(mansion)
            except WorkflowError as error:
                return _error_reply(error.code, error.view)
            return WorkflowReply(200, view.to_json())

        return await _guarded(provider, run)

    def mutation(kind: CommandKind, target: str):
        async def handle(request: web.Request) -> web.Response:
            async def run(current: WorkflowService) -> WorkflowReply:
                body = await _read_json(request)
                if isinstance(body, WorkflowReply):
                    return body
                return await run_workflow_command(
                    current,
                    kind,
                    mansion_id=request.match_info.get("mansion_id"),
                    target=request.match_info.get(target),
                    decision=request.match_info.get("decision"),
                    body=body,
                )

            return await _guarded(provider, run)

        return handle

    app.router.add_get(WORKFLOW_PATH, workflow, allow_head=False)
    app.router.add_post(PHASE_START_PATH, mutation("start", "phase"))
    app.router.add_post(DOOR_DECISION_PATH, mutation("door", "proposal_id"))
    app.router.add_post(APPROVAL_DECISION_PATH, mutation("approval", "proposal_id"))


async def _guarded(
    provider: WorkflowServiceProvider,
    run: Callable[[WorkflowService], Awaitable[WorkflowReply]],
) -> web.Response:
    """Run one handler and map every failure to a stable error body."""
    current = provider()
    if current is None:
        reply = _error_reply("workflow_unavailable")
    else:
        try:
            reply = await run(current)
        except web.HTTPException:
            raise
        except Exception as error:  # never let exception text reach the client
            log.warning(
                "workflow request failed unexpectedly (%s): workflow_unavailable",
                type(error).__name__,
            )
            reply = _error_reply("workflow_unavailable")
    # Canonical JSON keeps number and key encoding identical to the log.
    return web.Response(
        body=canonical_json(cast(JSONValue, reply.body)),
        status=reply.status,
        content_type="application/json",
        charset="utf-8",
    )


async def _read_json(request: web.Request) -> object:
    """The strictly parsed JSON body the signature middleware verified."""
    if request.content_type != "application/json":
        return _error_reply("invalid_request")
    raw = await request.read()
    if len(raw) > MAX_REQUEST_BYTES:
        return _error_reply("request_too_large")
    try:
        return json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=_object_without_duplicates,
            parse_constant=_reject_constant,
            parse_float=_reject_constant,
        )
    except (ValueError, RecursionError):
        # UnicodeDecodeError and JSONDecodeError are ValueErrors.
        return _error_reply("invalid_request")


def _object_without_duplicates(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate key")
        result[key] = value
    return result


def _reject_constant(_value: str) -> object:
    raise ValueError("non-standard JSON number")
