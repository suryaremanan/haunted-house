"""HTTP server for the Haunted House backend.

Crew's gateway proxies `/apps/haunted-house/api/<rest>` to this server as
`/api/<rest>` and signs each request with the `X-KiroCrew-Proxy` header (see
`haunted_house.core.proxy_signature`). Every request under `/api/` must carry
a valid signature, or it gets 401 and no handler runs. `/health` is public
because Crew's health check is not signed. Other paths skip the check and
return 404, since no route exists outside `/api/` apart from `/health`.

`GET /api/whoami` reports the gateway's state. `build_app` takes the probe it
awaits, so tests can pass their own. `main()` uses `build_live_app`, whose
probe asks the gateway for `/api/version` through one `GatewayClient` and one
`aiohttp.ClientSession` that live as long as the app.

The server listens on 127.0.0.1 only. Access logs are off so that query
strings never reach the logs.
"""

from __future__ import annotations

import logging
import os
import time
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from pathlib import Path
from typing import Any

import aiohttp
from aiohttp import web

from haunted_house.adapters.gateway_client import (
    DEFAULT_TIMEOUT,
    MANIFEST_PATH,
    GatewayClient,
    GatewayError,
    load_allowed_prefixes,
)
from haunted_house.adapters.settings import Settings, SettingsError
from haunted_house.core.proxy_signature import Verdict, verify
from haunted_house.core.redact import redact

__all__ = [
    "GATEWAY_ERRORS",
    "HOST",
    "PROXY_HEADER",
    "Clock",
    "GatewayProbe",
    "build_app",
    "build_live_app",
    "gateway_status_from",
    "main",
    "no_gateway_probe",
    "probe_gateway_version",
]

PROXY_HEADER = "X-KiroCrew-Proxy"
HOST = "127.0.0.1"
LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"
# The gateway error kinds whoami reports; the UI accepts exactly these.
GATEWAY_ERRORS = frozenset({"timeout", "unreachable", "denied", "config"})

log = logging.getLogger(__name__)

Clock = Callable[[], float]
# Returns {"version": "<gateway version>"} or
# {"error": "timeout" | "unreachable" | "denied" | "config"}.
GatewayProbe = Callable[[], Awaitable[dict[str, str]]]


async def no_gateway_probe() -> dict[str, str]:
    """Probe for apps built without a gateway client: reports `config`."""
    return {"error": "config"}


def gateway_status_from(outcome: object) -> dict[str, str]:
    """Turn what `client.call("version")` returned or raised into whoami's
    `gateway` field.

    - A dict whose `version` is a string with non-space text gives
      `{"version": <it, stripped>}`.
    - A `GatewayError` keeps its kind when it is in `GATEWAY_ERRORS`. Kind
      `http` (an odd status or body from the gateway) becomes `unreachable`.
    - Anything else, including any other exception, gives
      `{"error": "unreachable"}`.

    Only the kind of an error is used, never its message, so nothing the
    client saw can reach the response this way. Pure; never raises.
    """
    if isinstance(outcome, GatewayError):
        kind = outcome.kind
        return {"error": kind if kind in GATEWAY_ERRORS else "unreachable"}
    if isinstance(outcome, dict):
        version = outcome.get("version")
        if isinstance(version, str) and version.strip():
            return {"version": version.strip()}
    return {"error": "unreachable"}


async def probe_gateway_version(
    client: GatewayClient,
    *,
    timeout: float = DEFAULT_TIMEOUT,
    secret: str | None = None,
) -> dict[str, str]:
    """Ask the gateway for its version through `client` and return whoami's
    `gateway` field (see `gateway_status_from`).

    Never raises, apart from task cancellation, which it lets through.
    `GatewayError`s are already logged, redacted, by the client. Any other
    exception is logged here at warning level by type name only, through
    `redact` with `secret`; its message is never logged or returned.
    """
    try:
        result: Any = await client.call("version", timeout=timeout)
    except GatewayError as err:
        return gateway_status_from(err)
    except Exception as exc:  # whoami must answer whatever went wrong
        log.warning(
            redact(
                f"gateway probe failed unexpectedly ({type(exc).__name__}); "
                "reporting the gateway as unreachable",
                [secret],
            )
        )
        return gateway_status_from(exc)
    return gateway_status_from(result)


def _under_api(path: str) -> bool:
    return path == "/api" or path.startswith("/api/")


def _needs_signature(request: web.Request) -> bool:
    # The router matches on a partly decoded path, so check both the decoded
    # path and the raw one: "/%61pi/whoami" must not slip past the check.
    raw_path = request.raw_path.partition("?")[0]
    return _under_api(request.path) or _under_api(raw_path)


def build_app(
    settings: Settings,
    *,
    clock: Clock = time.time,
    gateway_probe: GatewayProbe | None = None,
) -> web.Application:
    """Build the backend application.

    `clock` gives the verifier's current time in unix seconds. `gateway_probe`
    is awaited by `GET /api/whoami` to report the gateway's state.

    The signature middleware reads the whole body with `request.read()`, so
    handlers must use `request.read()`, `.text()` or `.json()` (which reuse
    the cached body), not `request.content`.
    """
    probe = gateway_probe or no_gateway_probe
    if not settings.secret:
        log.warning(
            "KIROCREW_PROXY_SECRET is not set; every /api/ request will be refused with 401"
        )

    @web.middleware
    async def check_proxy_signature(
        request: web.Request,
        handler: Callable[[web.Request], Awaitable[web.StreamResponse]],
    ) -> web.StreamResponse:
        if not _needs_signature(request):
            return await handler(request)
        body = await request.read()
        verdict = verify(
            request.headers.get(PROXY_HEADER),
            method=request.method,
            target=request.raw_path,  # raw path plus raw query, as the gateway signed it
            body=body,
            secret=settings.secret,
            now=clock(),
        )
        if verdict is not Verdict.ACCEPT:
            # Never log the header; the path is logged without its query.
            log.debug(
                "refused %s %r: proxy signature %s",
                request.method,
                request.path,
                verdict.value,
            )
            return web.json_response({"error": "bad_proxy_signature"}, status=401)
        return await handler(request)

    async def health(_request: web.Request) -> web.Response:
        return web.json_response({"status": "ok"})

    async def whoami(_request: web.Request) -> web.Response:
        return web.json_response({"backend": "ok", "gateway": await probe()})

    app = web.Application(middlewares=[check_proxy_signature])
    app.router.add_get("/health", health)
    app.router.add_get("/api/whoami", whoami)
    return app


def build_live_app(
    settings: Settings,
    *,
    manifest_path: Path | None = None,
    clock: Clock = time.time,
    gateway_timeout: float = DEFAULT_TIMEOUT,
) -> web.Application:
    """Build the application as `main()` runs it, with a real gateway probe.

    On startup the app reads `permissions.api` from `manifest_path` (default
    `MANIFEST_PATH`, the installed `app.json`), opens one
    `aiohttp.ClientSession` and builds one `GatewayClient` on it; on cleanup
    it closes the session. `GET /api/whoami` then calls the gateway's
    `/api/version` with `gateway_timeout` seconds for the whole call. A
    missing or unreadable manifest makes every call a `config` error.
    """
    path = MANIFEST_PATH if manifest_path is None else manifest_path
    client: GatewayClient | None = None

    async def gateway_session(_app: web.Application) -> AsyncIterator[None]:
        nonlocal client
        allowed = load_allowed_prefixes(path)
        async with aiohttp.ClientSession() as session:
            client = GatewayClient(settings, session, allowed)
            try:
                yield
            finally:
                client = None

    async def probe() -> dict[str, str]:
        if client is None:
            # Only outside the app's lifetime: there is no session to send with.
            return {"error": "unreachable"}
        return await probe_gateway_version(
            client, timeout=gateway_timeout, secret=settings.secret
        )

    app = build_app(settings, clock=clock, gateway_probe=probe)
    app.cleanup_ctx.append(gateway_session)
    return app


def main(argv: Sequence[str] | None = None) -> int:
    """Run the backend until it is stopped. Returns the process exit code.

    Settings come from the environment (see `haunted_house.adapters.settings`);
    `argv` is accepted for a conventional entry point and is not used.
    """
    logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)
    try:
        settings = Settings.from_env(os.environ)
    except SettingsError as err:
        log.error("cannot start: %s", err)
        return 1

    def announce(*_args: object, **_kwargs: object) -> None:
        # run_app calls this once the socket is bound.
        log.info("listening on http://%s:%d", HOST, settings.port)

    web.run_app(
        build_live_app(settings),
        host=HOST,
        port=settings.port,
        access_log=None,
        print=announce,
    )
    return 0
