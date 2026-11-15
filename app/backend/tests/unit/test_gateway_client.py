"""Example tests for haunted_house.adapters.gateway_client.

Most tests run the client against a fake gateway served by aiohttp's
TestServer on 127.0.0.1 (which passes the loopback check) and inspect the
requests the fake received. Tests that must prove nothing was sent at all use
NoNetwork, a session stand-in that records any request attempt.
Properties 6 to 8 live in tests/property/.
"""
import asyncio
import inspect
import json
import logging
import secrets
import socket
from dataclasses import dataclass

import aiohttp
import pytest
from aiohttp import web
from aiohttp.test_utils import TestServer

from haunted_house.adapters.gateway_client import (
    LOGGER_NAME,
    ROUTES,
    SECRET_HEADER,
    GatewayClient,
    GatewayError,
    load_allowed_prefixes,
    token_exchange_path,
)
from haunted_house.adapters.settings import Settings

APP_KEY = "app-k3y-x1"  # short on purpose: not a real credential
APP = "haunted-house"
EXCHANGE = token_exchange_path(APP)
ALLOWED = ["/api/version", "/apps/haunted-house/api/*"]


def new_token() -> str:
    # Built at runtime and short, so no literal looks like a credential.
    return "tk-" + secrets.token_hex(4)


@dataclass
class Seen:
    method: str
    path: str
    query: dict[str, str]
    headers: dict[str, str]


class FakeGateway:
    """Stand-in for the Crew gateway: the token exchange and /api/version.

    The exchange issues a fresh token when X-App-Secret matches APP_KEY and
    answers 403 otherwise. /api/version accepts only the newest token, read
    from the query. `refuse` makes the next N version requests get 401.
    `version` and `exchange` replace a handler when a test needs to.
    Every request, including ones to unknown paths, is recorded in `seen`.
    """

    def __init__(self) -> None:
        self.seen: list[Seen] = []
        self.issued: list[str] = []
        self.refuse = 0
        self.version = None
        self.exchange = None

    def app(self) -> web.Application:
        app = web.Application()
        app.router.add_post(EXCHANGE, self._exchange)
        app.router.add_get("/api/version", self._version)
        app.router.add_route("*", "/{tail:.*}", self._other)
        return app

    def _record(self, request: web.Request) -> None:
        self.seen.append(
            Seen(request.method, request.path, dict(request.query), dict(request.headers))
        )

    async def _exchange(self, request: web.Request) -> web.StreamResponse:
        self._record(request)
        if self.exchange is not None:
            return await self.exchange(request)
        if request.headers.get(SECRET_HEADER) != APP_KEY:
            return web.json_response({"error": "bad_secret"}, status=403)
        token = new_token()
        self.issued.append(token)
        return web.json_response({"token": token})

    async def _version(self, request: web.Request) -> web.StreamResponse:
        self._record(request)
        if self.version is not None:
            return await self.version(request)
        if self.refuse > 0:
            self.refuse -= 1
            return web.json_response({"error": "token_expired"}, status=401)
        if not self.issued or request.query.get("token") != self.issued[-1]:
            return web.json_response({"error": "bad_token"}, status=401)
        return web.json_response({"version": "0.12.1"})

    async def _other(self, request: web.Request) -> web.StreamResponse:
        self._record(request)
        return web.json_response({"error": "not_found"}, status=404)

    def to(self, path: str) -> list[Seen]:
        return [seen for seen in self.seen if seen.path == path]


class NoNetwork:
    """Session stand-in that records request attempts and refuses them."""

    def __init__(self) -> None:
        self.attempts: list[tuple] = []

    def request(self, *args, **kwargs):
        self.attempts.append((args, kwargs))
        raise AssertionError("the client tried to send a request")


def make_settings(origin: str | None, key: str | None = APP_KEY) -> Settings:
    return Settings(port=1, secret=key, gateway_origin=origin, app_name=APP)


def run(gateway: FakeGateway, scenario, *, key: str | None = APP_KEY, allowed=ALLOWED):
    """Start `gateway`, build a client for it, and return `await scenario(client)`."""

    async def go():
        async with TestServer(gateway.app()) as server, aiohttp.ClientSession() as session:
            origin = f"http://127.0.0.1:{server.port}"
            client = GatewayClient(make_settings(origin, key), session, allowed)
            return await scenario(client)

    return asyncio.run(go())


async def expect_error(awaitable) -> GatewayError:
    with pytest.raises(GatewayError) as info:
        await awaitable
    return info.value


def assert_clean(error: GatewayError, gateway: FakeGateway) -> None:
    text = str(error)
    assert "?" not in text
    assert APP_KEY not in text
    assert all(token not in text for token in gateway.issued)
    assert error.__cause__ is None and error.__context__ is None


# --- Happy path ------------------------------------------------------------


def test_call_exchanges_the_secret_for_a_token_and_returns_the_json_object():
    gateway = FakeGateway()

    async def scenario(client):
        return await client.call("version"), await client.call("version")

    first, second = run(gateway, scenario)

    assert first == second == {"version": "0.12.1"}
    exchanges = gateway.to(EXCHANGE)
    assert len(exchanges) == 1  # the token is cached for the second call
    assert exchanges[0].method == "POST"
    assert exchanges[0].headers.get(SECRET_HEADER) == APP_KEY
    assert "token" not in exchanges[0].query
    assert len(gateway.to("/api/version")) == 2


def test_token_goes_in_the_query_and_never_in_a_header():
    gateway = FakeGateway()
    run(gateway, lambda client: client.call("version"))

    (target,) = gateway.to("/api/version")
    assert target.query == {"token": gateway.issued[0]}
    assert "Authorization" not in target.headers
    assert SECRET_HEADER not in target.headers
    assert all(gateway.issued[0] not in value for value in target.headers.values())


# --- Refresh and denial ----------------------------------------------------


def test_a_refused_token_is_refreshed_once_and_the_call_retried(caplog):
    gateway = FakeGateway()
    gateway.refuse = 1
    caplog.set_level(logging.DEBUG, logger=LOGGER_NAME)

    result = run(gateway, lambda client: client.call("version"))

    assert result == {"version": "0.12.1"}
    assert len(gateway.to(EXCHANGE)) == 2
    targets = gateway.to("/api/version")
    assert [t.query["token"] for t in targets] == gateway.issued  # retry uses the new token

    messages = [record.getMessage() for record in caplog.records]
    assert any("GET /api/version" in message for message in messages)
    for message in messages:
        assert "?" not in message
        assert APP_KEY not in message
        assert all(token not in message for token in gateway.issued)


@pytest.mark.parametrize("status", [401, 403])
def test_a_second_refusal_is_denied_after_exactly_one_retry(status):
    gateway = FakeGateway()

    async def refuse(_request):
        return web.json_response({"error": "forbidden"}, status=status)

    gateway.version = refuse
    error = run(gateway, lambda client: expect_error(client.call("version")))

    assert error.kind == "denied"
    assert error.status == status
    assert error.code == "forbidden"
    assert len(gateway.to("/api/version")) == 2
    assert len(gateway.to(EXCHANGE)) == 2
    assert_clean(error, gateway)


def test_a_refused_secret_is_denied_without_calling_the_target():
    gateway = FakeGateway()
    error = run(gateway, lambda client: expect_error(client.call("version")), key="wrong-k3y")

    assert error.kind == "denied"
    assert error.status == 403
    assert len(gateway.to(EXCHANGE)) == 1
    assert gateway.to("/api/version") == []
    assert "wrong-k3y" not in str(error)


# --- Other gateway answers -------------------------------------------------


def test_other_error_statuses_are_http_errors_with_the_gateway_code():
    gateway = FakeGateway()

    async def broken(_request):
        return web.json_response({"code": "internal"}, status=500)

    gateway.version = broken
    error = run(gateway, lambda client: expect_error(client.call("version")))

    assert (error.kind, error.status, error.code) == ("http", 500, "internal")
    assert len(gateway.to("/api/version")) == 1  # no retry for non-auth errors
    assert_clean(error, gateway)


@pytest.mark.parametrize("body", [b"not json", b"[1, 2]", b'"text"', b""])
def test_a_body_that_is_not_a_json_object_is_an_http_error(body):
    gateway = FakeGateway()

    async def odd(_request):
        return web.Response(body=body, content_type="application/json")

    gateway.version = odd
    error = run(gateway, lambda client: expect_error(client.call("version")))

    assert (error.kind, error.status) == ("http", 200)


def test_redirects_are_not_followed():
    gateway = FakeGateway()

    async def redirect(_request):
        raise web.HTTPTemporaryRedirect("/elsewhere")

    gateway.exchange = redirect
    error = run(gateway, lambda client: expect_error(client.call("version")))

    assert (error.kind, error.status) == ("http", 307)
    assert [seen.path for seen in gateway.seen] == [EXCHANGE]


def test_echoed_tokens_are_redacted_from_the_returned_object():
    gateway = FakeGateway()

    async def echo(request):
        return web.json_response({"url": str(request.rel_url), "token": request.query["token"]})

    gateway.version = echo
    result = run(gateway, lambda client: client.call("version"))

    assert result["token"] == "[redacted]"
    assert gateway.issued[0] not in json.dumps(result)


# --- Timeouts and connection failures --------------------------------------


def test_default_timeout_is_30_seconds():
    assert inspect.signature(GatewayClient.call).parameters["timeout"].default == 30


def test_a_gateway_that_does_not_answer_in_time_gives_a_timeout_error():
    gateway = FakeGateway()

    async def scenario(client):
        release = asyncio.Event()

        async def stall(_request):
            await release.wait()
            return web.json_response({"version": "late"})

        gateway.version = stall
        try:
            return await expect_error(client.call("version", timeout=0.2))
        finally:
            release.set()

    error = run(gateway, scenario)

    assert error.kind == "timeout"
    assert "GET /api/version" in str(error)
    assert_clean(error, gateway)


def closed_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def test_a_gateway_that_is_not_listening_is_unreachable():
    async def go():
        async with aiohttp.ClientSession() as session:
            origin = f"http://127.0.0.1:{closed_port()}"
            client = GatewayClient(make_settings(origin), session, ALLOWED)
            return await expect_error(client.call("version", timeout=5))

    error = asyncio.run(go())

    assert error.kind == "unreachable"
    assert APP_KEY not in str(error)
    assert error.__cause__ is None and error.__context__ is None


# --- Refusals before any request -------------------------------------------


def test_a_path_outside_permissions_api_is_refused_without_a_request():
    gateway = FakeGateway()
    error = run(
        gateway, lambda client: expect_error(client.call("version")), allowed=["/api/chat"]
    )

    assert error.kind == "config"
    assert gateway.seen == []


@pytest.mark.parametrize(
    "origin",
    [
        None,
        "http://192.168.1.10:5476",
        "https://127.0.0.1:5476",
        "http://127.0.0.1.example.com:5476",
        "http://user@127.0.0.1:5476",
    ],
)
def test_a_non_loopback_origin_is_refused_without_a_request(origin):
    session = NoNetwork()
    client = GatewayClient(make_settings(origin), session, ALLOWED)

    error = asyncio.run(expect_error(client.call("version")))

    assert error.kind == "config"
    assert session.attempts == []
    assert APP_KEY not in str(error)


def test_a_missing_secret_is_refused_without_a_request():
    gateway = FakeGateway()
    error = run(gateway, lambda client: expect_error(client.call("version")), key=None)

    assert error.kind == "config"
    assert gateway.seen == []


def test_an_unknown_route_is_refused_without_a_request():
    session = NoNetwork()
    client = GatewayClient(make_settings("http://127.0.0.1:5476"), session, ALLOWED)

    error = asyncio.run(expect_error(client.call("no-such-route")))

    assert error.kind == "config"
    assert session.attempts == []


def test_every_route_path_is_inside_the_default_allow_list():
    from haunted_house.core.scope import path_allowed

    assert all(path_allowed(ALLOWED, path) for _method, path in ROUTES.values())


# --- GatewayError and the manifest loader ----------------------------------


def test_gateway_error_messages_drop_queries_and_redact_secrets():
    error = GatewayError(
        "http", "GET /api/version?token=abc123 failed for abc123", code="abc123", secrets=["abc123"]
    )

    assert str(error) == "GET /api/version failed for [redacted]"
    assert error.code == "[redacted]"
    with pytest.raises(ValueError):
        GatewayError("nope")


# Built from short pieces so no literal looks like a credential. Both hold
# "?", "#", "&" and a space. The query strip removes text from a "?" to the
# next whitespace, so if it ran before redaction it would cut these apart and
# leave pieces that redaction no longer recognises.
ODD_KEY = "Qv7x9" + "?k#2&m" + " Zp4w"
ODD_TOKEN = "tK8r" + "?w#5&j" + " Hq3"


def fragments(value: str, size: int = 5) -> set[str]:
    """Every `size`-character substring of `value`. Any longer substring
    contains one of them."""
    return {value[i : i + size] for i in range(len(value) - size + 1)}


def test_credentials_with_url_characters_leave_no_fragment_behind(caplog):
    gateway = FakeGateway()

    async def grant(_request):
        return web.json_response({"token": ODD_TOKEN})

    async def echo(request):
        # A gateway that echoes the token it got and the secret header the
        # exchange got in its error code.
        (exchange,) = gateway.to(EXCHANGE)
        code = f"bad token {request.query['token']} for {exchange.headers[SECRET_HEADER]}"
        return web.json_response({"code": code}, status=500)

    gateway.exchange = grant
    gateway.version = echo
    caplog.set_level(logging.DEBUG, logger=LOGGER_NAME)

    async def scenario(client):
        echoed = await expect_error(client.call("version"))
        # A 500 keeps the cached token, so this refusal's message and its log
        # line are cleaned of both credentials.
        named = await expect_error(client.call(f"route {ODD_KEY} {ODD_TOKEN}"))
        return echoed, named

    echoed, named = run(gateway, scenario, key=ODD_KEY)
    built = GatewayError(
        "http",
        f"GET /api/version?token={ODD_TOKEN} failed: {ODD_KEY} / {ODD_TOKEN}",
        code=f"{ODD_KEY}|{ODD_TOKEN}",
        secrets=[ODD_KEY, ODD_TOKEN],
    )
    logs = [record.getMessage() for record in caplog.records]

    # The fake really saw both credentials, so the echo carried them.
    assert gateway.to(EXCHANGE)[0].headers[SECRET_HEADER] == ODD_KEY
    assert gateway.to("/api/version")[0].query["token"] == ODD_TOKEN
    assert (echoed.kind, echoed.status) == ("http", 500)
    assert echoed.code == "bad token [redacted] for [redacted]"
    assert named.kind == "config"
    assert str(named) == "unknown gateway route 'route [redacted] [redacted]'"
    assert any(str(named) in line for line in logs)
    assert str(built) == "GET /api/version failed: [redacted] / [redacted]"
    assert built.code == "[redacted]|[redacted]"

    outputs = [echoed.code, built.code, *logs]
    for error in (echoed, named, built):
        outputs += [str(error), repr(error)]
    for text in outputs:
        for piece in fragments(ODD_KEY) | fragments(ODD_TOKEN):
            assert piece not in text, f"{piece!r} survives in {text!r}"


def test_load_allowed_prefixes_reads_permissions_api(tmp_path):
    manifest = tmp_path / "app.json"
    manifest.write_text(json.dumps({"permissions": {"api": ALLOWED + [7, ""]}}))

    assert load_allowed_prefixes(manifest) == ALLOWED


@pytest.mark.parametrize("content", [None, "{not json", '{"permissions": {}}', "[]"])
def test_load_allowed_prefixes_returns_nothing_for_a_bad_manifest(tmp_path, content):
    manifest = tmp_path / "app.json"
    if content is not None:
        manifest.write_text(content)

    assert load_allowed_prefixes(manifest) == []
