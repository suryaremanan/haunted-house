"""Signed Mansion_API routes: list, create, and open.

`register_mansion_routes` adds exactly three routes to an application whose
proxy-signature middleware already guards every `/api/` path:

    GET  /api/mansions       200 {"schemaVersion": 1, "mansions": [descriptor...]}
    POST /api/mansions       201 {"outcome": "created", "mansion": descriptor}
                             200 {"outcome": "existing_compatible", "mansion": descriptor}
    POST /api/mansions/open  200 {"mansion": descriptor}

    descriptor = {"name", "projectSpec", "displayPath", "status"}
    error      = {"error": {"code": <stable code>, "message": <fixed copy>}}

POST bodies must be `application/json` holding exactly `{"name": <string>}`.
The client never sends a path. Error messages are fixed text chosen by code,
so no request text, host path, or exception text can reach a response. Logs
carry the stable code and, for unexpected failures, the exception class name.

There is no delete, rename, or any other mutation route. aiohttp answers other
methods with 405 and other paths with 404 without calling the service.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from pathlib import Path

from aiohttp import web

from haunted_house.adapters.mansion_filesystem import MansionFilesystem
from haunted_house.adapters.mansion_metadata import (
    FileMansionMetadataStore,
    MetadataUnavailable,
)
from haunted_house.adapters.mansion_service import (
    MansionService,
    MansionServiceError,
)
from haunted_house.adapters.settings import Settings
from haunted_house.core.mansion_descriptors import MansionDescriptor
from haunted_house.core.mansion_planner import CreateOutcome
from haunted_house.core.mansion_requests import (
    InvalidRequest,
    MansionRequest,
    parse_mansion_request,
)

__all__ = [
    "ERROR_MESSAGES",
    "ERROR_STATUSES",
    "LIST_SCHEMA_VERSION",
    "MANSIONS_PATH",
    "OPEN_MANSION_PATH",
    "MansionServiceProvider",
    "live_mansion_service",
    "register_mansion_routes",
]

MANSIONS_PATH = "/api/mansions"
OPEN_MANSION_PATH = "/api/mansions/open"
LIST_SCHEMA_VERSION = 1

ERROR_STATUSES: dict[str, int] = {
    "invalid_request": 400,
    "invalid_mansion_name": 422,
    "mansion_not_registered": 404,
    "mansion_missing": 409,
    "mansion_conflict": 409,
    "symlink_escape": 409,
    "unsafe_mansion_root": 500,
    "metadata_unavailable": 500,
    "filesystem_error": 500,
}

ERROR_MESSAGES: dict[str, str] = {
    "invalid_request": "The mansion request was not understood.",
    "invalid_mansion_name": "Use 1-40 lowercase letters, numbers, and single hyphens.",
    "mansion_not_registered": "This mansion is not registered. Refresh the list and try again.",
    "mansion_missing": "This mansion is missing from storage.",
    "mansion_conflict": "Existing content conflicts with this mansion. Nothing was changed.",
    "symlink_escape": "The mansion path is not safe to use.",
    "unsafe_mansion_root": "Mansion storage is not configured safely.",
    "metadata_unavailable": "Mansion records are unavailable. Try again.",
    "filesystem_error": "Mansion storage could not be accessed.",
}

log = logging.getLogger(__name__)

# Returns the service, or None while it cannot be built (for example when the
# app-data directory is missing); requests then get `metadata_unavailable`.
MansionServiceProvider = Callable[[], MansionService | None]


class _DuplicateKey(ValueError):
    pass


def live_mansion_service(
    settings: Settings, *, app_root: Path | None = None
) -> MansionServiceProvider:
    """Return a provider that builds the live service once it can.

    The service uses `settings.mansion_root`, `settings.approved_roots`, and
    Crew's verified `<app-root>/data` directory (`app_root` defaults to the
    working directory Crew starts the backend in). Building it writes nothing.
    While the app-data directory is missing or unsafe the provider returns
    None and tries again on the next call; no fallback location is used.
    """
    built: MansionService | None = None

    def provide() -> MansionService | None:
        nonlocal built
        if built is None:
            try:
                store = FileMansionMetadataStore(app_root)
            except MetadataUnavailable:
                return None
            built = MansionService(
                MansionFilesystem(settings.mansion_root, settings.approved_roots),
                store,
            )
        return built

    return provide


def register_mansion_routes(
    app: web.Application, service: MansionService | MansionServiceProvider
) -> None:
    """Add the three Mansion_API routes to `app`.

    `service` is a `MansionService`, or a zero-argument callable returning the
    current one. Call this before the application starts.
    """
    provider: MansionServiceProvider = (
        (lambda: service) if isinstance(service, MansionService) else service
    )

    async def list_mansions(_request: web.Request) -> web.Response:
        async def run(current: MansionService) -> web.Response:
            mansions = await current.list_mansions()
            return web.json_response(
                {
                    "schemaVersion": LIST_SCHEMA_VERSION,
                    "mansions": [_descriptor_body(item) for item in mansions],
                }
            )

        return await _guarded(provider, run)

    async def create_mansion(request: web.Request) -> web.Response:
        parsed = await _read_request(request)
        if parsed is None:
            return _error("invalid_request")

        async def run(current: MansionService) -> web.Response:
            result = await current.create_mansion(parsed.name)
            created = result.outcome is CreateOutcome.CREATED
            return web.json_response(
                {
                    "outcome": result.outcome.value,
                    "mansion": _descriptor_body(result.mansion),
                },
                status=201 if created else 200,
            )

        return await _guarded(provider, run)

    async def open_mansion(request: web.Request) -> web.Response:
        parsed = await _read_request(request)
        if parsed is None:
            return _error("invalid_request")

        async def run(current: MansionService) -> web.Response:
            mansion = await current.open_mansion(parsed.name)
            return web.json_response({"mansion": _descriptor_body(mansion)})

        return await _guarded(provider, run)

    async def build_at_startup(_app: web.Application) -> None:
        try:
            if provider() is None:
                log.warning("mansion service is unavailable: metadata_unavailable")
        except Exception as error:
            log.warning(
                "mansion service could not be built (%s)", type(error).__name__
            )

    app.on_startup.append(build_at_startup)
    app.router.add_get(MANSIONS_PATH, list_mansions, allow_head=False)
    app.router.add_post(MANSIONS_PATH, create_mansion)
    app.router.add_post(OPEN_MANSION_PATH, open_mansion)


async def _guarded(
    provider: MansionServiceProvider,
    run: Callable[[MansionService], object],
) -> web.Response:
    """Run one service call and map every failure to a stable error body."""
    try:
        service = provider()
        if service is None:
            log.warning("mansion request refused: metadata_unavailable (no service)")
            return _error("metadata_unavailable")
        return await run(service)  # type: ignore[misc]
    except MansionServiceError as error:
        code = error.code if error.code in ERROR_STATUSES else "filesystem_error"
        log.info("mansion request refused: %s", code)
        return _error(code)
    except Exception as error:  # never let exception text reach the client
        log.warning(
            "mansion request failed unexpectedly (%s): filesystem_error",
            type(error).__name__,
        )
        return _error("filesystem_error")


async def _read_request(request: web.Request) -> MansionRequest | None:
    """Return the parsed body, or None for anything but the exact shape.

    The signature middleware has already read the body, so `read()` returns
    the cached bytes that were verified.
    """
    if request.content_type != "application/json":
        return None
    try:
        text = (await request.read()).decode("utf-8")
        value = json.loads(
            text,
            object_pairs_hook=_object_without_duplicates,
            parse_constant=_reject_constant,
        )
        return parse_mansion_request(value)
    except (InvalidRequest, ValueError, RecursionError):
        # UnicodeDecodeError and JSONDecodeError are ValueErrors.
        return None


def _object_without_duplicates(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise _DuplicateKey
        result[key] = value
    return result


def _reject_constant(_value: str) -> object:
    raise ValueError("non-standard JSON number")


def _descriptor_body(descriptor: MansionDescriptor) -> dict[str, str]:
    return {
        "name": descriptor.name,
        "projectSpec": descriptor.project_spec,
        "displayPath": descriptor.display_path,
        "status": descriptor.status.value,
    }


def _error(code: str) -> web.Response:
    return web.json_response(
        {"error": {"code": code, "message": ERROR_MESSAGES[code]}},
        status=ERROR_STATUSES[code],
    )
