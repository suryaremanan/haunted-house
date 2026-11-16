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
    "CHAT_APPROVAL_ACTIONS",
    "CHAT_GRANT",
    "CHAT_MEMORY_MODE",
    "CHAT_MODE",
    "CHAT_SEND_PATH",
    "CHAT_SLOTS_PATH",
    "CHAT_MODE_PATH",
    "MAX_CHAT_MESSAGE_BYTES",
    "STOP_TIMEOUT",
    "DEFAULT_HISTORY_MESSAGES",
    "DEFAULT_TIMEOUT",
    "ERROR_KINDS",
    "LOGGER_NAME",
    "MANIFEST_PATH",
    "MAX_HISTORY_MESSAGES",
    "MAX_HISTORY_RESPONSE_BYTES",
    "ROUTES",
    "SECRET_HEADER",
    "SESSION_HISTORY_GRANT",
    "SESSION_HISTORY_PATH_PREFIX",
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

# Session history is one read per server-registered slot. Its path carries the
# slot, so it is not a fixed ROUTES entry: the manifest grants the prefix and
# ``GatewayClient.session_history`` builds the percent-encoded path itself.
SESSION_HISTORY_GRANT = "/api/chat/*"
SESSION_HISTORY_PATH_PREFIX = "/api/chat/slots/"
MAX_HISTORY_MESSAGES = 500
DEFAULT_HISTORY_MESSAGES = 200
MAX_HISTORY_RESPONSE_BYTES = 1024 * 1024

# App-owned chat sessions (Doors and Guardrails, S6). These are the only
# session routes the app calls: create a slot, set its project folder, keep it
# in interactive approval mode, queue one turn, and answer one exact
# permission prompt. Like session history they carry dynamic values, so each
# has a typed method that builds its own path instead of a ROUTES entry, and
# every path is covered by the same ``/api/chat/*`` grant (which also covers
# ``/api/chat`` itself). There is no spawn route, no global approval route and
# no WebSocket.
CHAT_GRANT = SESSION_HISTORY_GRANT
CHAT_SEND_PATH = "/api/chat"
CHAT_SLOTS_PATH = "/api/chat/slots"
CHAT_MODE_PATH = "/api/chat/mode"
CHAT_MODE = "normal"  # interactive: Crew asks before each tool call
CHAT_MEMORY_MODE = "temporary"
CHAT_APPROVAL_ACTIONS = frozenset({"approved", "rejected"})
# One role prompt: the Room_Skill block (at most 12 KiB) in front of a bounded
# assignment (at most 32 KiB), Room Ghosts RG-S2.
MAX_CHAT_MESSAGE_BYTES = 48 * 1024
# RG-S3: Crew answers a stop only after the cancel settled; its own soft-stop
# budget is 10 s (owner-configurable to 60), so the client waits at least 30 s.
STOP_TIMEOUT = 35.0
_MAX_RETRY_AFTER = 3600
_MAX_PROJECT_BYTES = 1024

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
_TOO_LARGE = object()
# One Crew session slot, as the gateway names app-owned sessions.
_SLOT = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,159}")
# A session name or an agent's short name.
_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}")
# A Crew approval request id or permission message id.
_REQUEST = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}")
_UNSAFE_TEXT = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


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
    when it is a string. ``retry_after`` is the whole number of seconds of a
    429 answer's ``Retry-After`` header, when it had one.

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
        retry_after: int | None = None,
    ) -> None:
        if kind not in ERROR_KINDS:
            raise ValueError(f"unknown GatewayError kind {kind!r}")
        hidden = list(secrets)
        self.kind = kind
        self.status = status
        self.retry_after = retry_after if type(retry_after) is int else None
        self.code = None if code is None else _clean(code, hidden)[:_MAX_CODE_CHARS]
        super().__init__(_clean(message or kind, hidden))


def token_exchange_path(app_name: str) -> str:
    """The gateway path that trades the app secret for an app token."""
    return f"/api/apps/{quote(app_name, safe='')}/token"


class _CallState:
    """What one ``call()`` needs to keep its output clean."""

    __slots__ = ("base", "secret", "secrets", "last", "retry_after")

    def __init__(self, secret: str | None, cached_token: str | None) -> None:
        self.base = ""
        self.secret = secret
        # Grows with every token obtained during the call.
        self.secrets: list[str | None] = [secret, cached_token]
        # "METHOD /path" of the last request started, for error messages.
        self.last = ""
        # Seconds of the last 429 answer's Retry-After header, if it had one.
        self.retry_after: int | None = None


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
        return await self._run(state, method, path, path, body, timeout)

    async def session_history(
        self,
        slot: str,
        *,
        limit: int = DEFAULT_HISTORY_MESSAGES,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> dict[str, Any]:
        """Read bounded history of one app-owned session slot.

        Sends ``GET /api/chat/slots/<slot>?limit=<limit>`` with the slot
        percent-encoded as one path segment. The caller passes only slots the
        server registered; ``slot`` is still checked here, so a value with a
        path separator, a dot segment or a control character is a ``config``
        error and sends nothing. ``limit`` must be a whole number from 1 to
        ``MAX_HISTORY_MESSAGES``. A response larger than
        ``MAX_HISTORY_RESPONSE_BYTES`` is an ``http`` error and is dropped.

        Token handling, the single retry, the deadline, redaction and the
        ``permissions.api`` check are those of ``call``. Raises
        ``GatewayError``.
        """
        state = _CallState(self._settings.secret, self._token)
        if type(slot) is not str or _SLOT.fullmatch(slot) is None or slot in (".", ".."):
            raise self._fail(state, "config", "session history needs one valid slot name")
        if type(limit) is not int or not 1 <= limit <= MAX_HISTORY_MESSAGES:
            raise self._fail(
                state,
                "config",
                f"session history limit must be 1 to {MAX_HISTORY_MESSAGES}",
            )
        path = SESSION_HISTORY_PATH_PREFIX + quote(slot, safe="")
        return await self._run(
            state,
            "GET",
            path,
            f"{path}?limit={limit}",
            None,
            timeout,
            max_bytes=MAX_HISTORY_RESPONSE_BYTES,
        )

    # --- app-owned chat sessions -------------------------------------------------

    async def create_chat_slot(
        self, name: str, agent: str, *, timeout: float = DEFAULT_TIMEOUT
    ) -> dict[str, Any]:
        """Create one app-owned session slot: ``POST /api/chat/slots``.

        Sends exactly ``{"name", "agent", "memory_mode"}``. ``name`` and
        ``agent`` (the agent's short name) must be plain labels; anything else
        is a ``config`` error and sends nothing. The gateway answers with the
        slot ``key``. Raises ``GatewayError``.
        """
        state = _CallState(self._settings.secret, self._token)
        if not _is_name(name) or not _is_name(agent):
            raise self._fail(state, "config", "a chat slot needs a plain name and agent")
        body = {"name": name, "agent": agent, "memory_mode": CHAT_MEMORY_MODE}
        return await self._run(state, "POST", CHAT_SLOTS_PATH, CHAT_SLOTS_PATH, body, timeout)

    async def set_chat_slot_project(
        self, slot: str, project: str, *, timeout: float = DEFAULT_TIMEOUT
    ) -> dict[str, Any]:
        """Set a slot's working folder: ``POST /api/chat/slots/<slot>/project``.

        ``project`` is the server-resolved absolute Mansion directory, never
        request input. Sends exactly ``{"project": project}``.
        """
        state = _CallState(self._settings.secret, self._token)
        path = self._slot_path(state, slot, "/project")
        if (
            type(project) is not str
            or not project.startswith("/")
            or len(project.encode("utf-8", "replace")) > _MAX_PROJECT_BYTES
            or _UNSAFE_TEXT.search(project) is not None
            or "\n" in project
            or "\r" in project
            or ".." in project.split("/")
        ):
            raise self._fail(state, "config", "a slot project must be one absolute folder")
        return await self._run(state, "POST", path, path, {"project": project}, timeout)

    async def set_chat_slot_interactive(
        self, slot: str, *, timeout: float = DEFAULT_TIMEOUT
    ) -> dict[str, Any]:
        """Keep a slot in interactive approval mode: ``POST /api/chat/mode``.

        Sends exactly ``{"mode": "normal", "slot": slot}``. No other mode can
        be requested through this client.
        """
        state = _CallState(self._settings.secret, self._token)
        self._slot_path(state, slot, "")
        body = {"mode": CHAT_MODE, "slot": slot}
        return await self._run(state, "POST", CHAT_MODE_PATH, CHAT_MODE_PATH, body, timeout)

    async def send_chat_turn(
        self, slot: str, message: str, *, timeout: float = DEFAULT_TIMEOUT
    ) -> dict[str, Any]:
        """Queue one user turn on a slot: ``POST /api/chat?ws=1``.

        Sends exactly ``{"slot": slot, "message": message}``. With ``ws=1``
        the gateway answers with a receipt as soon as the message is accepted
        instead of streaming the reply. ``message`` is house-authored text of
        at most ``MAX_CHAT_MESSAGE_BYTES``.
        """
        state = _CallState(self._settings.secret, self._token)
        self._slot_path(state, slot, "")
        if (
            type(message) is not str
            or not message.strip()
            or len(message.encode("utf-8", "replace")) > MAX_CHAT_MESSAGE_BYTES
            or _UNSAFE_TEXT.search(message) is not None
        ):
            raise self._fail(state, "config", "a chat turn needs bounded plain text")
        body = {"slot": slot, "message": message}
        return await self._run(
            state, "POST", CHAT_SEND_PATH, f"{CHAT_SEND_PATH}?ws=1", body, timeout
        )

    async def resolve_chat_approval(
        self,
        slot: str,
        request_id: str,
        request_mid: str,
        action: str,
        *,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> dict[str, Any]:
        """Answer one exact permission prompt:
        ``POST /api/chat/slots/<slot>/approve``.

        Sends exactly ``{"action", "request_id", "request_mid", "origin":
        "native"}``. ``request_id`` repeats across turns, so the gateway is
        told the permission message (``request_mid``) too and refuses a
        prompt that is no longer that one. ``action`` is ``approved`` or
        ``rejected``; no trust or session-wide grant can be sent.
        """
        state = _CallState(self._settings.secret, self._token)
        path = self._slot_path(state, slot, "/approve")
        if (
            action not in CHAT_APPROVAL_ACTIONS
            or type(request_id) is not str
            or _REQUEST.fullmatch(request_id) is None
            or type(request_mid) is not str
            or _REQUEST.fullmatch(request_mid) is None
        ):
            raise self._fail(state, "config", "an approval answer needs its request id and mid")
        body = {
            "action": action,
            "request_id": request_id,
            "request_mid": request_mid,
            "origin": "native",
        }
        return await self._run(state, "POST", path, path, body, timeout)

    async def stop_chat_slot(self, slot: str, *, timeout: float = STOP_TIMEOUT) -> dict[str, Any]:
        """Ask Crew to stop the owned session's turn: one bodyless
        ``POST /api/chat/slots/<slot>/stop`` (RG-S3).

        Sent at most once: a second stop while the first is pending is a
        forced stop that resets the session, so a refused token is not
        refreshed and retried here, and ``force`` is never sent. ``timeout``
        is at least 30 seconds. The answer is ``{"ok": true}`` only after the
        cancel settled; one carrying ``info`` stopped nothing.
        """
        state = _CallState(self._settings.secret, self._token)
        path = self._slot_path(state, slot, "/stop")
        return await self._run(state, "POST", path, path, None, max(float(timeout), 30.0), once=True)

    def _slot_path(self, state: _CallState, slot: object, suffix: str) -> str:
        if type(slot) is not str or _SLOT.fullmatch(slot) is None or slot in (".", ".."):
            raise self._fail(state, "config", "a chat call needs one valid slot name")
        return SESSION_HISTORY_PATH_PREFIX + quote(slot, safe="") + suffix

    async def _run(
        self,
        state: _CallState,
        method: str,
        path: str,
        target: str,
        body: dict[str, Any] | None,
        timeout: float,
        *,
        max_bytes: int | None = None,
        once: bool = False,
    ) -> dict[str, Any]:
        """Check that the call is safe, then make it under one deadline.

        ``path`` is checked against ``permissions.api`` and named in logs;
        ``target`` is ``path`` plus any query the request carries.
        """
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
                return await self._call(
                    state, method, path, target, body, max_bytes, once
                )
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
        target: str,
        body: dict[str, Any] | None,
        max_bytes: int | None,
        once: bool = False,
    ) -> dict[str, Any]:
        status, data = await self._target(state, method, target, body, max_bytes)
        if status in _REFUSED and once:
            # The target request is never sent a second time.
            raise self._fail(
                state,
                "denied",
                f"{method} {path} was refused ({status})",
                status=status,
                code=_error_code(data),
            )
        if status in _REFUSED:
            self._log(
                logging.INFO,
                state,
                f"{method} {path} got {status}; getting a new app token and retrying once",
            )
            status, data = await self._target(state, method, target, body, max_bytes)
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
        if data is _TOO_LARGE:
            raise self._fail(
                state,
                "http",
                f"{method} {path} returned more than {max_bytes} bytes",
                status=status,
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
        target: str,
        body: dict[str, Any] | None,
        max_bytes: int | None = None,
    ) -> tuple[int, Any]:
        """Send one target request with a token, getting one first if needed.
        On 401 or 403 the token is dropped (unless another call already
        replaced it)."""
        token = self._token or await self._exchange(state)
        status, data = await self._send(
            state,
            method,
            with_token(target, token),
            json_body=body,
            max_bytes=max_bytes,
        )
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
        max_bytes: int | None = None,
    ) -> tuple[int, Any]:
        """Send one request and return (status, parsed JSON or _NOT_JSON).
        A body longer than ``max_bytes`` is returned as ``_TOO_LARGE``."""
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
            state.retry_after = _retry_after(response) if status == 429 else None
        self._log(logging.DEBUG, state, f"{state.last} -> {status}")
        if max_bytes is not None and len(raw) > max_bytes:
            return status, _TOO_LARGE
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
        error = GatewayError(
            kind,
            message,
            status=status,
            code=code,
            secrets=state.secrets,
            retry_after=state.retry_after if status == 429 else None,
        )
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


def _retry_after(response: object) -> int | None:
    """Whole seconds of a ``Retry-After`` header; a date form is ignored."""
    headers = getattr(response, "headers", None)
    try:
        value = headers.get("Retry-After") if headers is not None else None
    except Exception:  # noqa: BLE001 - a response without usable headers
        return None
    if type(value) is not str or not value.strip().isdigit() or len(value.strip()) > 6:
        return None
    return min(int(value.strip()), _MAX_RETRY_AFTER)


def _is_name(value: object) -> bool:
    return type(value) is str and _NAME.fullmatch(value) is not None


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
