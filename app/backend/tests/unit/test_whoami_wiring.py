"""Tests for GET /api/whoami wired to the gateway client (task 6.2).

End-to-end tests run the backend as `main()` builds it (`build_live_app`) on
an aiohttp TestServer, in front of a fake gateway on a second TestServer, and
send it requests signed the way Crew's proxy signs them. The manifest is a
temp file, so nothing here depends on app/app.json.

`gateway_status_from` and `probe_gateway_version` are also tested directly.
"""
import asyncio
import json
import logging
import re
import secrets
import socket
import time
from pathlib import Path

import aiohttp
import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from haunted_house import server
from haunted_house.adapters.gateway_client import ERROR_KINDS, GatewayClient, GatewayError
from haunted_house.adapters.settings import Settings
from haunted_house.core.proxy_signature import sign
from haunted_house.server import (
    GATEWAY_ERRORS,
    PROXY_HEADER,
    build_live_app,
    gateway_status_from,
    probe_gateway_version,
)

KEY = "app-k3y-wh0"  # short on purpose: not a real credential
APP = "haunted-house"
EXCHANGE = "/api/apps/haunted-house/token"
ALLOWED = ["/api/version", "/apps/haunted-house/api/*"]
NOW = 1_731_400_000
LOGGER = "haunted_house.server"
UI_STATUS = Path(__file__).resolve().parents[3] / "ui" / "src" / "core" / "backend-status.ts"


class FakeGateway:
    """Stand-in for the Crew gateway: the token exchange and /api/version.

    The exchange issues a fresh token when X-App-Secret is KEY, else 403.
    /api/version answers 0.12.1 to an issued token, else 401. `version`
    replaces that handler. With `stall`, /api/version waits until `release()`.
    """

    def __init__(self, version=None, stall=False) -> None:
        self.issued: list[str] = []
        self.exchanges = 0
        self.version_calls = 0
        self.version = version
        self.stall = stall
        self._released: asyncio.Event | None = None

    def app(self) -> web.Application:
        self._released = asyncio.Event()
        app = web.Application()
        app.router.add_post(EXCHANGE, self._exchange)
        app.router.add_get("/api/version", self._version)
        return app

    def release(self) -> None:
        if self._released is not None:
            self._released.set()

    async def _exchange(self, request: web.Request) -> web.Response:
        self.exchanges += 1
        if request.headers.get("X-App-Secret") != KEY:
            return web.json_response({"error": "bad_secret"}, status=403)
        token = "tk-" + secrets.token_hex(4)  # built at runtime, short
        self.issued.append(token)
        return web.json_response({"token": token})

    async def _version(self, request: web.Request) -> web.Response:
        self.version_calls += 1
        if self.stall:
            await self._released.wait()
        if self.version is not None:
            return await self.version(request)
        if request.query.get("token") not in self.issued:
            return web.json_response({"error": "bad_token"}, status=401)
        return web.json_response({"version": "0.12.1"})


def write_manifest(tmp_path: Path) -> Path:
    path = tmp_path / "app.json"
    path.write_text(json.dumps({"name": APP, "permissions": {"api": ALLOWED}}))
    return path


def settings_for(origin: str | None) -> Settings:
    return Settings(port=1, secret=KEY, gateway_origin=origin, app_name=APP)


def closed_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


async def signed_whoami(backend: web.Application, now: int, times: int = 1):
    """Serve `backend` and send it `times` signed whoami requests.
    Returns a list of (status, body text)."""
    replies = []
    async with TestClient(TestServer(backend)) as client:
        for _ in range(times):
            header = sign(KEY, now, "GET", "/api/whoami", b"")
            async with client.get("/api/whoami", headers={PROXY_HEADER: header}) as resp:
                replies.append((resp.status, await resp.text()))
    return replies


def whoami_via(gateway: FakeGateway, manifest: Path, *, origin=None, timeout=5.0, times=1):
    """Start `gateway`, put a live backend in front of it, send signed whoamis.

    `origin` overrides the gateway origin the backend is given.
    """

    async def go():
        async with TestServer(gateway.app()) as gw:
            settings = settings_for(origin or f"http://127.0.0.1:{gw.port}")
            backend = build_live_app(
                settings, manifest_path=manifest, clock=lambda: NOW, gateway_timeout=timeout
            )
            try:
                return await signed_whoami(backend, NOW, times)
            finally:
                gateway.release()

    return asyncio.run(go())


def assert_whoami(reply, gateway: FakeGateway, expected_gateway: dict) -> None:
    status, text = reply
    assert status == 200
    assert json.loads(text) == {"backend": "ok", "gateway": expected_gateway}
    assert KEY not in text
    assert all(token not in text for token in gateway.issued)


# --- End to end ------------------------------------------------------------


def test_main_serves_the_gateway_version_on_whoami(monkeypatch, tmp_path):
    gateway = FakeGateway()
    monkeypatch.setattr(server, "MANIFEST_PATH", write_manifest(tmp_path))
    built = []
    monkeypatch.setattr(web, "run_app", lambda app, **_kwargs: built.append(app))

    async def go():
        async with TestServer(gateway.app()) as gw:
            monkeypatch.setenv("PORT", "1")
            monkeypatch.setenv("KIROCREW_PROXY_SECRET", KEY)
            monkeypatch.setenv("KIROCREW_GATEWAY_ORIGIN", f"http://127.0.0.1:{gw.port}")
            monkeypatch.setenv("KIROCREW_APP_NAME", APP)
            assert server.main() == 0
            [backend] = built
            return await signed_whoami(backend, int(time.time()))

    [reply] = asyncio.run(go())

    assert_whoami(reply, gateway, {"version": "0.12.1"})
    assert gateway.exchanges == 1


def test_one_session_per_app_is_reused_and_closed_on_cleanup(monkeypatch, tmp_path):
    gateway = FakeGateway()
    sessions = []
    real_session = aiohttp.ClientSession

    def recording_session(*args, **kwargs):
        session = real_session(*args, **kwargs)
        sessions.append(session)
        return session

    monkeypatch.setattr(server.aiohttp, "ClientSession", recording_session)

    replies = whoami_via(gateway, write_manifest(tmp_path), times=2)

    for reply in replies:
        assert_whoami(reply, gateway, {"version": "0.12.1"})
    assert len(sessions) == 1
    assert sessions[0].closed
    assert gateway.exchanges == 1  # the token is cached across whoami calls


def test_version_refused_twice_reports_denied(tmp_path):
    async def forbidden(_request):
        return web.json_response({"error": "forbidden"}, status=403)

    gateway = FakeGateway(version=forbidden)
    [reply] = whoami_via(gateway, write_manifest(tmp_path))

    assert_whoami(reply, gateway, {"error": "denied"})
    assert gateway.version_calls == 2


def test_a_slow_gateway_reports_timeout(tmp_path):
    gateway = FakeGateway(stall=True)
    [reply] = whoami_via(gateway, write_manifest(tmp_path), timeout=0.3)

    assert_whoami(reply, gateway, {"error": "timeout"})


def test_a_gateway_that_is_down_reports_unreachable(tmp_path):
    gateway = FakeGateway()
    origin = f"http://127.0.0.1:{closed_port()}"
    [reply] = whoami_via(gateway, write_manifest(tmp_path), origin=origin)

    assert_whoami(reply, gateway, {"error": "unreachable"})


def test_a_non_loopback_origin_reports_config_and_sends_nothing(tmp_path):
    gateway = FakeGateway()
    [reply] = whoami_via(gateway, write_manifest(tmp_path), origin="http://192.0.2.10:5476")

    assert_whoami(reply, gateway, {"error": "config"})
    assert (gateway.exchanges, gateway.version_calls) == (0, 0)


def test_a_missing_manifest_reports_config_and_sends_nothing(tmp_path):
    gateway = FakeGateway()
    [reply] = whoami_via(gateway, tmp_path / "missing" / "app.json")

    assert_whoami(reply, gateway, {"error": "config"})
    assert (gateway.exchanges, gateway.version_calls) == (0, 0)


def test_a_gateway_500_reports_unreachable(tmp_path):
    async def broken(_request):
        return web.json_response({"code": "internal"}, status=500)

    gateway = FakeGateway(version=broken)
    [reply] = whoami_via(gateway, write_manifest(tmp_path))

    assert_whoami(reply, gateway, {"error": "unreachable"})


# --- gateway_status_from ---------------------------------------------------

UNREACHABLE = {"error": "unreachable"}


@pytest.mark.parametrize(
    "outcome, expected",
    [
        ({"version": "0.12.1"}, {"version": "0.12.1"}),
        ({"version": " 0.12.1\n", "extra": 1}, {"version": "0.12.1"}),
        ({"version": ""}, UNREACHABLE),
        ({"version": "   "}, UNREACHABLE),
        ({"version": 12}, UNREACHABLE),
        ({"version": None}, UNREACHABLE),
        ({}, UNREACHABLE),
        ([("version", "0.12.1")], UNREACHABLE),
        ("0.12.1", UNREACHABLE),
        (None, UNREACHABLE),
        (RuntimeError(KEY), UNREACHABLE),
    ],
)
def test_results_map_to_a_version_or_unreachable(outcome, expected):
    assert gateway_status_from(outcome) == expected


KIND_TO_STATUS = {
    "timeout": "timeout",
    "unreachable": "unreachable",
    "denied": "denied",
    "config": "config",
    "http": "unreachable",
}


@pytest.mark.parametrize("kind", sorted(KIND_TO_STATUS))
def test_gateway_errors_map_to_their_kind_and_never_their_message(kind):
    error = GatewayError(kind, f"failed for {KEY}", status=500, code="internal")

    assert gateway_status_from(error) == {"error": KIND_TO_STATUS[kind]}


def test_every_client_error_kind_maps_to_a_kind_the_ui_accepts():
    assert set(KIND_TO_STATUS) == ERROR_KINDS
    assert set(KIND_TO_STATUS.values()) == GATEWAY_ERRORS


def test_whoami_error_kinds_match_the_ui_parser():
    source = UI_STATUS.read_text(encoding="utf-8")
    match = re.search(r"GATEWAY_ERROR_KINDS = \[([^\]]*)\]", source)
    assert match, f"GATEWAY_ERROR_KINDS not found in {UI_STATUS}"

    assert set(re.findall(r"'([a-z]+)'", match.group(1))) == GATEWAY_ERRORS


# --- probe_gateway_version -------------------------------------------------


class BrokenSession:
    """Session stand-in whose request fails with an error the client does not
    expect, carrying the secret and a token-like query in its message."""

    def request(self, *_args, **_kwargs):
        raise RuntimeError(f"boom {KEY} /api/version?token=tk-leak")


def test_an_unexpected_exception_is_unreachable_and_logged_by_type_only(caplog):
    caplog.set_level(logging.DEBUG)
    client = GatewayClient(settings_for("http://127.0.0.1:9"), BrokenSession(), ALLOWED)

    result = asyncio.run(probe_gateway_version(client, timeout=5, secret=KEY))

    assert result == UNREACHABLE
    warnings = [r for r in caplog.records if r.name == LOGGER and r.levelno == logging.WARNING]
    assert len(warnings) == 1
    assert "RuntimeError" in warnings[0].getMessage()
    for record in caplog.records:
        message = record.getMessage()
        for needle in (KEY, "boom", "tk-leak"):
            assert needle not in message
        assert record.exc_info is None
