"""Signed Canonical_Event_API routes: ingest, read, and reconcile.

`register_seance_routes` adds exactly three routes to an application whose
proxy-signature middleware already guards every `/api/` path:

    POST /api/mansions/{mansion_id}/seance/ingest
         body  {"envelopes": [{"type": <string>, "data": <JSON>}, ...]}   1..100
         200   {"events": [AppEvent...], "duplicate_record_ids": [...],
                "highest_sequence": n, "diagnostics": [...],
                "reconcile_slots": [...]}
    GET  /api/mansions/{mansion_id}/seance/events?after_sequence=<n>&limit=<1..500>
         200   {"events": [AppEvent...], "highest_sequence": n,
                "valid_prefix_sequence": n, "valid_prefix_lines": n,
                "integrity": "ok" | "failed", "has_more": bool,
                "diagnostics": [...]}
    POST /api/mansions/{mansion_id}/seance/reconcile
         body  {"slots": [<registered session slot>, ...]}                1..8
         200   {"events": [AppEvent...], "duplicate_record_ids": [...],
                "highest_sequence": n, "history_partial": bool,
                "slots": [{"slot", "status", "reasons": [...]}],
                "diagnostics": [...]}

    error = {"error": {"code": <stable code>, "message": <fixed copy>},
             "diagnostics": [...], "highest_sequence": n}

The browser sends raw Crew envelopes only.  An envelope object holds exactly
`type` and `data`; scope, identifiers, Sequence, and hashes are never accepted
from a request.  Events are returned only after the writer acknowledged them
durably, and every returned event is the redacted canonical record.

Error messages are fixed text chosen by code, and diagnostics hold fixed
categories, field names, an envelope index, or a line number, so no request
text, Crew payload, host path, or exception text can reach a response.

There is no update, delete, truncate, repair, or renumber route, and no
generic candidate-append route: backend domains call the writer in process.
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Awaitable, Callable
from typing import cast

from aiohttp import web

from haunted_house.adapters.gateway_client import GatewayClient, GatewayError
from haunted_house.adapters.mansion_service import (
    MansionService,
    MansionServiceError,
)
from haunted_house.adapters.seance_log_store import SeanceLogStore
from haunted_house.adapters.seance_service import (
    MAX_RECONCILE_SLOTS,
    EnvelopeDiagnostic,
    SeanceService,
)
from haunted_house.adapters.settings import Settings
from haunted_house.core.crew_event_normalizer import CrewEnvelope
from haunted_house.core.mansion_names import is_valid_mansion_name
from haunted_house.core.seance_event import (
    MAX_IDENTIFIER_BYTES,
    MAX_INGEST_BATCH_SIZE,
    MAX_INGEST_REQUEST_BYTES,
    AppEvent,
    JSONValue,
    app_event_to_dict,
    canonical_json,
)
from haunted_house.core.seance_persistence import MAX_READ_LIMIT, WriterDiagnostic

__all__ = [
    "DEFAULT_READ_LIMIT",
    "ERROR_MESSAGES",
    "ERROR_STATUSES",
    "EVENTS_PATH",
    "INGEST_PATH",
    "RECONCILE_PATH",
    "MansionGate",
    "SeanceServiceProvider",
    "live_seance_service",
    "mansion_service_gate",
    "register_seance_routes",
]

INGEST_PATH = "/api/mansions/{mansion_id}/seance/ingest"
EVENTS_PATH = "/api/mansions/{mansion_id}/seance/events"
RECONCILE_PATH = "/api/mansions/{mansion_id}/seance/reconcile"
DEFAULT_READ_LIMIT = 200

ERROR_STATUSES: dict[str, int] = {
    "invalid_request": 400,
    "invalid_mansion_id": 400,
    "invalid_envelope": 400,
    "invalid_candidate": 400,
    "request_too_large": 413,
    "too_many_envelopes": 413,
    "mansion_not_found": 404,
    "log_not_found": 404,
    "log_integrity_failed": 409,
    "persistence_failed": 500,
    "seance_unavailable": 503,
}

ERROR_MESSAGES: dict[str, str] = {
    "invalid_request": "The séance request was not understood.",
    "invalid_mansion_id": "Use 1-40 lowercase letters, numbers, and single hyphens.",
    "invalid_envelope": "An event could not be recorded. Nothing was saved.",
    "invalid_candidate": "An event could not be recorded safely. Nothing was saved.",
    "request_too_large": "The séance request is too large.",
    "too_many_envelopes": "The séance request holds too many events.",
    "mansion_not_found": "This mansion is not available.",
    "log_not_found": "This mansion has no séance log yet.",
    "log_integrity_failed": "The séance log failed its integrity check. Nothing was saved.",
    "persistence_failed": "The séance log could not be written. Nothing was saved.",
    "seance_unavailable": "The séance log is unavailable. Try again.",
}

log = logging.getLogger(__name__)

# Returns True only for a registered, ready Mansion under the configured
# root.  The routes never receive or build a filesystem path themselves.
MansionGate = Callable[[str], Awaitable[bool]]
# Returns the service, or None while it cannot be built.
SeanceServiceProvider = Callable[[], SeanceService | None]

_DECIMAL = re.compile(r"(?:0|[1-9][0-9]{0,14})")
_ENVELOPE_KEYS = frozenset({"type", "data"})


class _BadRequest(Exception):
    def __init__(self, code: str = "invalid_request") -> None:
        self.code = code
        super().__init__(code)


def live_seance_service(
    settings: Settings,
    gateway: Callable[[], GatewayClient | None],
) -> SeanceService:
    """Build the live service over the one log writer and the gateway client.

    The writer resolves every log below `settings.mansion_root` and redacts
    the app secret.  `gateway` returns the application's current
    `GatewayClient`, or None outside the application's lifetime; history
    reads then fail as `unreachable` and reconciliation reports
    `history_unavailable`.  Building the service touches no file.
    """

    class _History:
        async def session_history(self, slot: str) -> dict[str, object]:
            client = gateway()
            if client is None:
                raise GatewayError("unreachable", "the gateway client is not running")
            return await client.session_history(slot)

    return SeanceService(
        SeanceLogStore(settings.mansion_root, known_secrets=[settings.secret]),
        history=_History(),
    )


def mansion_service_gate(
    mansions: MansionService | Callable[[], MansionService | None],
) -> MansionGate:
    """Return a gate that admits only registered, ready Mansions.

    It asks the Mansion registry through `MansionService.open_mansion`, which
    revalidates the registered project without writing.  An unregistered,
    missing, conflicting, or unsafe Mansion is refused.  While the registry
    itself is unavailable the gate raises, and the request gets
    `seance_unavailable` rather than a silent bypass.
    """
    provider: Callable[[], MansionService | None] = (
        (lambda: mansions) if isinstance(mansions, MansionService) else mansions
    )

    async def gate(mansion_id: str) -> bool:
        service = provider()
        if service is None:
            raise RuntimeError("mansion registry unavailable")
        try:
            await service.open_mansion(mansion_id)
        except MansionServiceError as error:
            if error.code in _REFUSED_MANSION_CODES:
                return False
            raise RuntimeError("mansion registry unavailable") from None
        return True

    return gate


_REFUSED_MANSION_CODES = frozenset(
    {
        "invalid_mansion_name",
        "mansion_not_registered",
        "mansion_missing",
        "mansion_conflict",
        "symlink_escape",
    }
)


def register_seance_routes(
    app: web.Application,
    service: SeanceService | SeanceServiceProvider,
    *,
    mansion_gate: MansionGate | None = None,
) -> None:
    """Add the three Canonical_Event_API routes to `app`.

    `service` is a `SeanceService`, or a zero-argument callable returning the
    current one.  `mansion_gate`, when given, must confirm the Mansion_ID is
    registered before any log is read or written; without it the writer's own
    confinement under the configured Mansion root is the only resolution.
    Call this before the application starts.
    """
    provider: SeanceServiceProvider = (
        (lambda: service) if isinstance(service, SeanceService) else service
    )

    async def admitted(request: web.Request) -> tuple[SeanceService, str] | web.Response:
        mansion_id = request.match_info.get("mansion_id", "")
        if not is_valid_mansion_name(mansion_id):
            return _error("invalid_mansion_id")
        current = provider()
        if current is None:
            return _error("seance_unavailable")
        if mansion_gate is not None and not await mansion_gate(mansion_id):
            return _error("mansion_not_found")
        return current, mansion_id

    async def ingest(request: web.Request) -> web.Response:
        async def run() -> web.Response:
            envelopes = _parse_envelopes(await _read_json(request))
            target = await admitted(request)
            if isinstance(target, web.Response):
                return target
            current, mansion_id = target
            outcome = await current.ingest(mansion_id, envelopes)
            if outcome.status != "ok":
                return _error(
                    outcome.status,
                    diagnostics=_diagnostics(
                        outcome.envelope_diagnostics, outcome.writer_diagnostics
                    ),
                    highest_sequence=outcome.highest_sequence,
                )
            return _json(
                {
                    "events": [_event_body(event) for event in outcome.events],
                    "duplicate_record_ids": list(outcome.duplicate_record_ids),
                    "highest_sequence": outcome.highest_sequence,
                    "diagnostics": _diagnostics(
                        outcome.envelope_diagnostics, outcome.writer_diagnostics
                    ),
                    "reconcile_slots": list(outcome.reconcile_slots),
                }
            )

        return await _guarded(run)

    async def read_events(request: web.Request) -> web.Response:
        async def run() -> web.Response:
            after_sequence = _query_integer(request, "after_sequence", 0)
            limit = _query_integer(request, "limit", DEFAULT_READ_LIMIT)
            if not 1 <= limit <= MAX_READ_LIMIT:
                raise _BadRequest()
            target = await admitted(request)
            if isinstance(target, web.Response):
                return target
            current, mansion_id = target
            page = await current.read_events(mansion_id, after_sequence, limit)
            if page.status not in ("ok", "invalid_log"):
                return _error(
                    _READ_ERRORS.get(page.status, "persistence_failed"),
                    diagnostics=_diagnostics((), page.diagnostics),
                )
            last = page.events[-1].sequence if page.events else after_sequence
            return _json(
                {
                    "events": [_event_body(event) for event in page.events],
                    "highest_sequence": page.highest_sequence,
                    "valid_prefix_sequence": page.valid_prefix_sequence,
                    "valid_prefix_lines": page.valid_prefix_lines,
                    "integrity": "ok" if page.integrity_ok else "failed",
                    "has_more": last < page.highest_sequence,
                    "diagnostics": _diagnostics((), page.diagnostics),
                }
            )

        return await _guarded(run)

    async def reconcile(request: web.Request) -> web.Response:
        async def run() -> web.Response:
            slots = _parse_slots(await _read_json(request))
            target = await admitted(request)
            if isinstance(target, web.Response):
                return target
            current, mansion_id = target
            outcome = await current.reconcile(mansion_id, slots)
            if outcome.status != "ok":
                return _error(
                    outcome.status,
                    diagnostics=_diagnostics(
                        outcome.envelope_diagnostics, outcome.writer_diagnostics
                    ),
                    highest_sequence=outcome.highest_sequence,
                )
            diagnostics = _diagnostics((), outcome.writer_diagnostics)
            if outcome.history_partial:
                diagnostics.append({"code": "history_partial"})
            return _json(
                {
                    "events": [_event_body(event) for event in outcome.events],
                    "duplicate_record_ids": list(outcome.duplicate_record_ids),
                    "highest_sequence": outcome.highest_sequence,
                    "history_partial": outcome.history_partial,
                    "slots": [
                        {
                            "slot": recovery.slot,
                            "status": recovery.status,
                            "reasons": list(recovery.reasons),
                        }
                        for recovery in outcome.slots
                    ],
                    "diagnostics": diagnostics,
                }
            )

        return await _guarded(run)

    app.router.add_post(INGEST_PATH, ingest)
    app.router.add_get(EVENTS_PATH, read_events, allow_head=False)
    app.router.add_post(RECONCILE_PATH, reconcile)


_READ_ERRORS: dict[str, str] = {
    "invalid": "invalid_request",
    "mansion_not_found": "mansion_not_found",
    "unsafe_path": "mansion_not_found",
    "log_not_found": "log_not_found",
    "failed": "persistence_failed",
}


async def _guarded(run: Callable[[], Awaitable[web.Response]]) -> web.Response:
    """Run one handler and map every failure to a stable error body."""
    try:
        return await run()
    except _BadRequest as error:
        return _error(error.code)
    except web.HTTPException:
        raise
    except Exception as error:  # never let exception text reach the client
        log.warning(
            "seance request failed unexpectedly (%s): seance_unavailable",
            type(error).__name__,
        )
        return _error("seance_unavailable")


async def _read_json(request: web.Request) -> object:
    """Return the strictly parsed JSON body the signature middleware verified."""
    if request.content_type != "application/json":
        raise _BadRequest()
    body = await request.read()
    if len(body) > MAX_INGEST_REQUEST_BYTES:
        raise _BadRequest("request_too_large")
    try:
        return json.loads(
            body.decode("utf-8"),
            object_pairs_hook=_object_without_duplicates,
            parse_constant=_reject_constant,
        )
    except (ValueError, RecursionError):
        # UnicodeDecodeError and JSONDecodeError are ValueErrors.
        raise _BadRequest() from None


def _parse_envelopes(value: object) -> list[CrewEnvelope]:
    if type(value) is not dict or set(cast(dict[str, object], value)) != {"envelopes"}:
        raise _BadRequest()
    raw = cast(dict[str, object], value)["envelopes"]
    if type(raw) is not list or not raw:
        raise _BadRequest()
    items = cast(list[object], raw)
    if len(items) > MAX_INGEST_BATCH_SIZE:
        raise _BadRequest("too_many_envelopes")
    envelopes: list[CrewEnvelope] = []
    for item in items:
        if type(item) is not dict or set(cast(dict[str, object], item)) != _ENVELOPE_KEYS:
            raise _BadRequest()
        envelope = cast(dict[str, object], item)
        if type(envelope["type"]) is not str:
            raise _BadRequest()
        # `data` is forwarded unchanged; only the normalizer interprets it.
        envelopes.append(
            CrewEnvelope(
                type=cast(str, envelope["type"]),
                data=cast(JSONValue, envelope["data"]),
            )
        )
    return envelopes


def _parse_slots(value: object) -> list[str]:
    if type(value) is not dict or set(cast(dict[str, object], value)) != {"slots"}:
        raise _BadRequest()
    raw = cast(dict[str, object], value)["slots"]
    if type(raw) is not list:
        raise _BadRequest()
    slots = cast(list[object], raw)
    if not 1 <= len(slots) <= MAX_RECONCILE_SLOTS or len(set(map(repr, slots))) != len(slots):
        raise _BadRequest()
    for slot in slots:
        if (
            type(slot) is not str
            or not slot
            or len(slot.encode("utf-8", "replace")) > MAX_IDENTIFIER_BYTES
        ):
            raise _BadRequest()
    return cast(list[str], slots)


def _query_integer(request: web.Request, name: str, default: int) -> int:
    values = request.query.getall(name, [])
    if not values:
        return default
    if len(values) != 1 or _DECIMAL.fullmatch(values[0]) is None:
        raise _BadRequest()
    return int(values[0])


def _event_body(event: AppEvent) -> JSONValue:
    return cast(JSONValue, app_event_to_dict(event))


def _diagnostics(
    envelopes: tuple[EnvelopeDiagnostic, ...],
    writer: tuple[WriterDiagnostic, ...],
) -> list[JSONValue]:
    """Project typed diagnostics onto bounded, value-free JSON objects."""
    result: list[JSONValue] = [
        {
            "code": item.code,
            "index": item.index,
            "field": item.field,
            "reason": item.reason,
        }
        for item in envelopes
    ]
    for item in writer:
        body: dict[str, JSONValue] = {
            "code": item.code.value,
            "reason": item.safe_detail,
        }
        if item.candidate_index is not None:
            body["candidate_index"] = item.candidate_index
        if item.line is not None:
            body["line"] = item.line
        if item.path is not None:
            body["field"] = item.path
        result.append(body)
    return result


def _json(body: JSONValue, *, status: int = 200) -> web.Response:
    # Canonical JSON keeps number and key encoding identical to the log.
    return web.Response(
        body=canonical_json(body),
        status=status,
        content_type="application/json",
        charset="utf-8",
    )


def _error(
    code: str,
    *,
    diagnostics: list[JSONValue] | None = None,
    highest_sequence: int | None = None,
) -> web.Response:
    known = code if code in ERROR_STATUSES else "seance_unavailable"
    body: dict[str, JSONValue] = {
        "error": {"code": known, "message": ERROR_MESSAGES[known]}
    }
    # An absent Mansion or log is fully described by its code.
    if diagnostics and ERROR_STATUSES[known] != 404:
        body["diagnostics"] = diagnostics
    if highest_sequence is not None:
        body["highest_sequence"] = highest_sequence
    return _json(body, status=ERROR_STATUSES[known])


def _object_without_duplicates(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate key")
        result[key] = value
    return result


def _reject_constant(_value: str) -> object:
    raise ValueError("non-standard JSON number")
