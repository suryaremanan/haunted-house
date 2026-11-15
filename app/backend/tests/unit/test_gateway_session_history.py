"""Example tests for ``GatewayClient.session_history`` (task 6.4).

The client runs against a fake gateway served by aiohttp's TestServer on
127.0.0.1.  Tests that must prove nothing was sent use a session stand-in
that records any request attempt.

Validates: Requirements 2.12, 11.5, 12.2.
"""

from __future__ import annotations

import asyncio
import json
import secrets

import aiohttp
import pytest
from aiohttp import web
from aiohttp.test_utils import TestServer

from haunted_house.adapters.gateway_client import (
    DEFAULT_HISTORY_MESSAGES,
    MAX_HISTORY_MESSAGES,
    MAX_HISTORY_RESPONSE_BYTES,
    ROUTES,
    SECRET_HEADER,
    SESSION_HISTORY_GRANT,
    SESSION_HISTORY_PATH_PREFIX,
    GatewayClient,
    GatewayError,
    token_exchange_path,
)
from haunted_house.adapters.settings import Settings
from haunted_house.core.scope import path_allowed

APP_KEY = "app-k3y-x1"  # short on purpose: not a real credential
APP = "haunted-house"
ALLOWED = ["/api/version", SESSION_HISTORY_GRANT, "/apps/haunted-house/api/*"]


class FakeGateway:
    """Token exchange plus a history handler that records what it was asked."""

    def __init__(self) -> None:
        self.issued: list[str] = []
        self.history_requests: list[tuple[str, str, dict[str, str], dict[str, str]]] = []
        self.refuse = 0
        self.body: object = {"slot": "study-slot", "messages": [], "has_more": False}
        self.raw_body: bytes | None = None
        self.delay = 0.0

    def app(self) -> web.Application:
        app = web.Application()
        app.router.add_post(token_exchange_path(APP), self._exchange)
        app.router.add_route("*", "/{tail:.*}", self._any)
        return app

    async def _exchange(self, request: web.Request) -> web.Response:
        if request.headers.get(SECRET_HEADER) != APP_KEY:
            return web.json_response({"error": "bad_secret"}, status=403)
        token = "tk-" + secrets.token_hex(4)
        self.issued.append(token)
        return web.json_response({"token": token})

    async def _any(self, request: web.Request) -> web.Response:
        self.history_requests.append(
            (
                request.method,
                request.raw_path.partition("?")[0],
                dict(request.query),
                dict(request.headers),
            )
        )
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.refuse > 0:
            self.refuse -= 1
            return web.json_response({"error": "token_expired"}, status=401)
        if request.query.get("token") != self.issued[-1]:
            return web.json_response({"error": "bad_token"}, status=401)
        if self.raw_body is not None:
            return web.Response(body=self.raw_body, content_type="application/json")
        return web.json_response(self.body)


class NoNetwork:
    def __init__(self) -> None:
        self.attempts: list[object] = []

    def request(self, *args, **kwargs):
        self.attempts.append((args, kwargs))
        raise AssertionError("the client tried to send a request")


def _settings(origin: str | None) -> Settings:
    return Settings(port=1, secret=APP_KEY, gateway_origin=origin, app_name=APP)


def _run(gateway: FakeGateway, scenario, *, allowed=ALLOWED):
    async def go():
        async with TestServer(gateway.app()) as server, aiohttp.ClientSession() as session:
            client = GatewayClient(
                _settings(f"http://127.0.0.1:{server.port}"), session, allowed
            )
            return await scenario(client)

    return asyncio.run(go())


async def _error(awaitable) -> GatewayError:
    with pytest.raises(GatewayError) as info:
        await awaitable
    return info.value


def test_history_is_one_bounded_get_for_the_named_slot():
    gateway = FakeGateway()
    gateway.body = {
        "slot": "study-slot",
        "messages": [{"role": "user", "content": "hello", "meta": {"mid": "m-1"}}],
        "total": 1,
        "has_more": False,
    }

    result = _run(gateway, lambda client: client.session_history("study-slot"))

    assert result == gateway.body
    assert len(gateway.history_requests) == 1
    method, raw_path, query, headers = gateway.history_requests[0]
    assert method == "GET"
    assert raw_path == "/api/chat/slots/study-slot"
    assert query == {"limit": str(DEFAULT_HISTORY_MESSAGES), "token": gateway.issued[-1]}
    assert SECRET_HEADER not in headers
    assert "Authorization" not in headers


def test_the_slot_is_percent_encoded_as_one_path_segment():
    gateway = FakeGateway()

    _run(gateway, lambda client: client.session_history("hh:study.slot_1", limit=7))

    _method, raw_path, query, _headers = gateway.history_requests[0]
    assert raw_path == "/api/chat/slots/hh%3Astudy.slot_1"
    assert raw_path.count("/") == 4
    assert query["limit"] == "7"


@pytest.mark.parametrize(
    "slot",
    [
        "",
        ".",
        "..",
        "../version",
        "a/b",
        "a%2Fb",
        "a?token=x",
        "a#b",
        "a b",
        "a\nb",
        "-leading",
        "x" * 161,
        None,
        7,
    ],
)
def test_an_unsafe_slot_is_a_config_error_and_sends_nothing(slot):
    session = NoNetwork()
    client = GatewayClient(_settings("http://127.0.0.1:1"), session, ALLOWED)

    error = asyncio.run(_error(client.session_history(slot)))

    assert error.kind == "config"
    assert session.attempts == []


@pytest.mark.parametrize("limit", [0, -1, MAX_HISTORY_MESSAGES + 1, True, 2.0, "5", None])
def test_an_out_of_range_limit_is_a_config_error_and_sends_nothing(limit):
    session = NoNetwork()
    client = GatewayClient(_settings("http://127.0.0.1:1"), session, ALLOWED)

    error = asyncio.run(_error(client.session_history("study-slot", limit=limit)))

    assert error.kind == "config"
    assert session.attempts == []


def test_history_needs_the_chat_prefix_in_the_manifest_grants():
    session = NoNetwork()
    client = GatewayClient(
        _settings("http://127.0.0.1:1"),
        session,
        ["/api/version", "/apps/haunted-house/api/*"],
    )

    error = asyncio.run(_error(client.session_history("study-slot")))

    assert error.kind == "config"
    assert session.attempts == []
    assert path_allowed([SESSION_HISTORY_GRANT], SESSION_HISTORY_PATH_PREFIX + "study-slot")
    # The history read is not a fixed route and cannot be reached by name.
    assert all(not path.startswith("/api/chat") for _method, path in ROUTES.values())


def test_a_refused_token_is_refreshed_once_for_history():
    gateway = FakeGateway()
    gateway.refuse = 1

    result = _run(gateway, lambda client: client.session_history("study-slot"))

    assert result["messages"] == []
    assert len(gateway.issued) == 2
    assert len(gateway.history_requests) == 2
    assert gateway.history_requests[0][2]["token"] == gateway.issued[0]
    assert gateway.history_requests[1][2]["token"] == gateway.issued[1]


def test_history_refused_twice_is_denied_without_a_third_request():
    gateway = FakeGateway()
    gateway.refuse = 5

    error = _run(gateway, lambda client: _error(client.session_history("study-slot")))

    assert error.kind == "denied"
    assert len(gateway.history_requests) == 2


def test_a_slow_history_read_times_out():
    gateway = FakeGateway()
    gateway.delay = 5.0

    error = _run(
        gateway,
        lambda client: _error(client.session_history("study-slot", timeout=0.05)),
    )

    assert error.kind == "timeout"
    assert "token" not in str(error)


def test_an_oversized_history_response_is_dropped():
    gateway = FakeGateway()
    gateway.raw_body = json.dumps(
        {"messages": [{"content": "x" * (MAX_HISTORY_RESPONSE_BYTES + 1)}]}
    ).encode()

    error = _run(gateway, lambda client: _error(client.session_history("study-slot")))

    assert error.kind == "http"
    assert "x" * 64 not in str(error)


def test_a_non_object_history_body_is_an_http_error():
    gateway = FakeGateway()
    gateway.body = ["not", "an", "object"]

    error = _run(gateway, lambda client: _error(client.session_history("study-slot")))

    assert error.kind == "http"


def test_history_strings_are_redacted_before_they_are_returned():
    gateway = FakeGateway()

    async def scenario(client: GatewayClient):
        first = await client.session_history("study-slot")
        token = gateway.issued[-1]
        gateway.body = {
            "messages": [
                {"content": f"echo {token} and {APP_KEY}", "meta": {token: "value"}}
            ]
        }
        return token, first, await client.session_history("study-slot")

    token, _first, second = _run(gateway, scenario)

    text = json.dumps(second)
    assert token not in text
    assert APP_KEY not in text
    assert "[redacted]" in text
