"""Client for the Crew gateway's REST API.

Every gateway call the backend makes goes through ``GatewayClient.call``,
which:

- refuses to run unless the route is in ``ROUTES``, the gateway origin is a
  loopback address, the app secret is set, and the route's path is covered by
  the manifest's ``permissions.api``. Each refusal is a ``config`` error and
  sends nothing, so the secret never leaves the machine and a wrong path
  fails in tests instead of as a 403 in front of a judge;
- gets an app token on first need with ``POST /api/apps/<app>/token`` and the
  ``X-App-Secret`` header, and keeps it in memory only;
- sends the token as the ``token`` query parameter (the gateway reads tokens
  only from there, never from ``Authorization``);
- on a 401 or 403 drops the token, gets a new one and retries once, so one
  call makes at most two target requests and two token exchanges;
- gives the whole call one deadline (30 seconds by default);
- never follows redirects, so the secret header can't be forwarded elsewhere.

Nothing the client logs, raises or returns contains the app secret or a
token: every log line, error message and returned string goes through
``redact``, and URLs are logged as method plus path, never with the query.
aiohttp exceptions (whose text can hold a ``?token=`` URL) are never
re-raised or chained; ``GatewayError`` is raised outside the ``except`` block
so its ``__context__`` stays empty.

The client uses only ``session.request(method, url, **kwargs)`` as an async
context manager, ``response.status`` and ``await response.read()``. A test
can pass any object with that surface in place of an ``aiohttp.ClientSession``.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any
from urllib.parse import quote

import aiohttp
from yarl import URL

from haunted_house.adapters.settings import Settings
from haunted_house.core.origin import is_loopback_origin
from haunted_house.core.redact import redact
from haunted_house.core.scope import path_allowed
from haunted_house.core.urls import with_token

__all__ = [
    "DEFAULT_TIMEOUT",
    "ERROR_KINDS",
    "LOGGER_NAME",
    "MANIFEST_PATH",
    "ROUTES",
    "SECRET_HEADER",
    "GatewayClient",
    "GatewayError",
    "load_allowed_prefixes",
    "token_exchange_path",
]

# Every gateway path the app calls: route name -> (method, path). The manifest
# test (task 7.2) checks permissions.api against these paths.
ROUTES: dict[str, tuple[str, str]] = {
    "version": ("GET", "/api/version"),
}

DEFAULT_TIMEOUT = 30.0
SECRET_HEADER = "X-App-Secret"
ERROR_KINDS = frozenset({"timeout", "unreachable", "denied", "http", "config"})
LOGGER_NAME = "haunted_house.gateway"
# The installed manifest: <app root>/app.json, three folders above this file
# (<app root>/backend/haunted_house/adapters/).
MANIFEST_PATH = Path(__file__).resolve().parents[3] / "app.json"

log = logging.getLogger(LOGGER_NAME)

_REFUSED = frozenset({401, 403})
# A "?" and everything up to the next whitespace: a URL query.
_QUERY = re.compile(r"\?\S*")
_MAX_CODE_CHARS = 100
_NOT_JSON = object()


class GatewayError(Exception):
    """A gateway call failed. ``kind`` says how:

    - ``timeout``: no complete answer within the call's timeout.
    - ``unreachable``: the connection to the gateway failed.
    - ``denied``: the gateway refused the app secret (token exchange 401/403)
      or refused the token again after one refresh.
    - ``http``: any other non-2xx status (redirects included), or a body that
      is not a JSON object.
    - ``config``: the call can't be made safely: unknown route, missing or
      non-loopback origin, no app secret, or a path outside
      ``permissions.api``. Nothing was sent.

    ``status`` is the HTTP status when there was one. ``code`` is the
    gateway's error code from the JSON body (``code``, or else ``error``),
    when it is a string.

    The message and ``code`` are cleaned at construction: URL queries are
    removed and every value in ``secrets`` is redacted. ``secrets`` is not
    stored.
    """

    def __init__(
        self,
        kind: str,
        message: str = "",
        *,
        status: int | None = None,
        code: str | None = None,
        secrets: Iterable[str | None] = (),
    ) -> None:
        if kind not in ERROR_KINDS:
            raise ValueError(f"unknown GatewayError kind {kind!r}")
        hidden = list(secrets)
        self.kind = kind
        self.status = status
        self.code = None if code is None else _clean(code, hidden)[:_MAX_CODE_CHARS]
        super().__init__(_clean(message or kind, hidden))


def token_exchange_path(app_name: str) -> str:
    """The gateway path that trades the app secret for an app token."""
    return f"/api/apps/{quote(app_name, safe='')}/token"


class _CallState:
    """What one ``call()`` needs to keep its output clean."""

    __slots__ = ("base", "secret", "secrets", "last")

    def __init__(self, secret: str | None, cached_token: str | None) -> None:
        self.base = ""
        self.secret = secret
        # Grows with every token obtained during the call.
        self.secrets: list[str | None] = [secret, cached_token]
        # "METHOD /path" of the last request started, for error messages.
        self.last = ""


class GatewayClient:
    """Calls the gateway's REST API on behalf of the app.

    ``allowed`` is the manifest's ``permissions.api`` list (see
    ``load_allowed_prefixes``). Settings are checked on every call, not here,
    so a backend with bad settings still starts and reports ``config``.
    """

    def __init__(
        self,
        settings: Settings,
        session: aiohttp.ClientSession,
        allowed: Iterable[str],
    ) -> None:
        self._settings = settings
        self._session = session
        self._allowed = tuple(allowed)
        self._token: str | None = None  # memory only; never written anywhere

    async def call(
        self,
        route: str,
        body: dict[str, Any] | None = None,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> dict[str, Any]:
        """Call the gateway route named ``route`` and return its JSON object.

        ``body``, if given, is sent as JSON. ``timeout`` (seconds) covers the
        whole call, token exchanges and the retry included. Every string in
        the returned dict has been through ``redact``. Raises ``GatewayError``.
        """
        state = _CallState(self._settings.secret, self._token)
        spec = ROUTES.get(route)
        if spec is None:
            raise self._fail(state, "config", f"unknown gateway route {route!r}")
        method, path = spec
        origin = self._settings.gateway_origin
        if origin is None or not is_loopback_origin(origin):
            raise self._fail(
                state,
                "config",
                "gateway origin is missing or not a loopback address; nothing was sent",
            )
        if not state.secret:
            raise self._fail(
                state, "config", "the app secret (KIROCREW_PROXY_SECRET) is not set"
            )
        if not path_allowed(self._allowed, path):
            raise self._fail(
                state,
                "config",
                f"{method} {_path_only(path)} is not covered by permissions.api in app.json",
            )
        state.base = origin.rstrip("/")

        try:
            async with asyncio.timeout(timeout):
                return await self._call(state, method, path, body)
        except TimeoutError:  # also aiohttp's own timeouts, which subclass it
            kind, message = "timeout", f"{state.last} got no answer within {timeout:g} s"
        except (aiohttp.ClientError, OSError) as exc:
            # Only the type name: str(exc) can hold the URL and its query.
            kind = "unreachable"
            message = f"{state.last} could not reach the gateway ({type(exc).__name__})"
        # Raised here, outside the except blocks, so the aiohttp exception is
        # neither the cause nor the context of the GatewayError.
        raise self._fail(state, kind, message) from None

    async def _call(
        self,
        state: _CallState,
        method: str,
        path: str,
        body: dict[str, Any] | None,
    ) -> dict[str, Any]:
        status, data = await self._target(state, method, path, body)
        if status in _REFUSED:
            self._log(
                logging.INFO,
                state,
                f"{method} {path} got {status}; getting a new app token and retrying once",
            )
            status, data = await self._target(state, method, path, body)
            if status in _REFUSED:
                raise self._fail(
                    state,
                    "denied",
                    f"{method} {path} was refused ({status}) after a token refresh",
                    status=status,
                    code=_error_code(data),
                )
        if not 200 <= status < 300:
            raise self._fail(
                state,
                "http",
                f"{method} {path} returned {status}",
                status=status,
                code=_error_code(data),
            )
        if not isinstance(data, dict):
            raise self._fail(
                state,
                "http",
                f"{method} {path} returned {status} without a JSON object",
                status=status,
            )
        cleaned = _redact_json(data, state.secrets)
        if not isinstance(cleaned, dict):  # nesting too deep to clean
            raise self._fail(
                state, "http", f"{method} {path} returned an unusable body", status=status
            )
        return cleaned

    async def _target(
        self,
        state: _CallState,
        method: str,
        path: str,
        body: dict[str, Any] | None,
    ) -> tuple[int, Any]:
        """Send one target request with a token, getting one first if needed.
        On 401 or 403 the token is dropped (unless another call already
        replaced it)."""
        token = self._token or await self._exchange(state)
        status, data = await self._send(state, method, with_token(path, token), json_body=body)
        if status in _REFUSED and self._token == token:
            self._token = None
        return status, data

    async def _exchange(self, state: _CallState) -> str:
        """Trade the app secret for a token and cache it."""
        path = token_exchange_path(self._settings.app_name)
        status, data = await self._send(
            state, "POST", path, headers={SECRET_HEADER: state.secret or ""}
        )
        if status in _REFUSED:
            raise self._fail(
                state,
                "denied",
                f"POST {path} was refused ({status}); the app may need re-enabling "
                "or a permission approval",
                status=status,
                code=_error_code(data),
            )
        if not 200 <= status < 300:
            raise self._fail(
                state,
                "http",
                f"POST {path} returned {status}",
                status=status,
                code=_error_code(data),
            )
        token = data.get("token") if isinstance(data, dict) else None
        if not isinstance(token, str) or not token:
            raise self._fail(state, "http", f"POST {path} returned no token", status=status)
        state.secrets.append(token)
        self._token = token
        return token

    async def _send(
        self,
        state: _CallState,
        method: str,
        path_and_query: str,
        *,
        headers: Mapping[str, str] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> tuple[int, Any]:
        """Send one request and return (status, parsed JSON or _NOT_JSON)."""
        state.last = f"{method} {_path_only(path_and_query)}"
        kwargs: dict[str, Any] = {"allow_redirects": False}
        if headers:
            kwargs["headers"] = dict(headers)
        if json_body is not None:
            kwargs["json"] = json_body
        # encoded=True: with_token already percent-encoded the token.
        url = URL(state.base + path_and_query, encoded=True)
        async with self._session.request(method, url, **kwargs) as response:
            status = response.status
            raw = await response.read()
        self._log(logging.DEBUG, state, f"{state.last} -> {status}")
        return status, _parse_json(raw)

    def _fail(
        self,
        state: _CallState,
        kind: str,
        message: str,
        *,
        status: int | None = None,
        code: str | None = None,
    ) -> GatewayError:
        error = GatewayError(kind, message, status=status, code=code, secrets=state.secrets)
        self._log(logging.WARNING, state, f"gateway call failed ({kind}): {error}")
        return error

    @staticmethod
    def _log(level: int, state: _CallState, message: str) -> None:
        if log.isEnabledFor(level):
            # No args, so logging never %-formats the already-clean text.
            log.log(level, _clean(message, state.secrets))


def load_allowed_prefixes(app_json_path: Path) -> list[str]:
    """Return ``permissions.api`` from the installed manifest at ``app_json_path``.

    Non-string and empty entries are skipped. If the file can't be read, is
    not JSON, or has no list at ``permissions.api``, this logs a warning and
    returns ``[]``; every gateway call then fails with a ``config`` error.
    """
    try:
        manifest = json.loads(Path(app_json_path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        log.warning("cannot read %s (%s); gateway calls will be refused", app_json_path, type(exc).__name__)
        return []
    permissions = manifest.get("permissions") if isinstance(manifest, dict) else None
    api = permissions.get("api") if isinstance(permissions, dict) else None
    if not isinstance(api, list):
        log.warning("%s has no permissions.api list; gateway calls will be refused", app_json_path)
        return []
    return [entry for entry in api if isinstance(entry, str) and entry]


def _clean(text: str, secrets: Iterable[str | None]) -> str:
    # Redact before the query strip: a secret or token that contains "?"
    # would otherwise be cut by the strip, and the pieces left behind no
    # longer match. Redact again after it, since removing a query can join
    # text into a new occurrence.
    hidden = list(secrets)
    return redact(_QUERY.sub("", redact(text, hidden)), hidden)


def _path_only(path_and_query: str) -> str:
    return path_and_query.partition("?")[0]


def _parse_json(raw: bytes) -> Any:
    parsed: Any = _NOT_JSON
    try:
        parsed = json.loads(raw)
    except (ValueError, RecursionError):  # bad JSON, bad UTF-8, or too deep
        pass
    return parsed


def _error_code(data: Any) -> str | None:
    if isinstance(data, dict):
        for key in ("code", "error"):
            value = data.get(key)
            if isinstance(value, str) and value:
                return value
    return None


def _redact_json(value: Any, secrets: list[str | None]) -> Any:
    """Redact every string (keys included) in a parsed JSON value. Returns
    _NOT_JSON if the value is nested too deeply to walk."""
    try:
        return _redact_walk(value, secrets)
    except RecursionError:
        return _NOT_JSON


def _redact_walk(value: Any, secrets: list[str | None]) -> Any:
    if isinstance(value, str):
        return redact(value, secrets)
    if isinstance(value, list):
        return [_redact_walk(item, secrets) for item in value]
    if isinstance(value, dict):
        return {redact(key, secrets): _redact_walk(item, secrets) for key, item in value.items()}
    return value
