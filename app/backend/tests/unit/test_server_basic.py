"""Example tests for haunted_house.server: the public health check, a signed
whoami that reaches its handler, and unsigned or bad requests that don't.

Property 4 lives in tests/property/; the fuller server unit tests build on
these.
"""

import asyncio

import pytest
from aiohttp.test_utils import TestClient, TestServer
from yarl import URL

from haunted_house.adapters.settings import Settings
from haunted_house.core.proxy_signature import WINDOW_SECONDS, sign
from haunted_house.server import PROXY_HEADER, build_app

KEY = "k3y-for-tests"  # short on purpose: not a real credential
NOW = 1_731_400_000


class SpyProbe:
    """Gateway probe that counts calls. Only the whoami handler calls it."""

    def __init__(self) -> None:
        self.calls = 0

    async def __call__(self) -> dict[str, str]:
        self.calls += 1
        return {"version": "0.12.1"}


def make_settings(secret: str | None = KEY) -> Settings:
    return Settings(port=1, secret=secret, gateway_origin=None, app_name="haunted-house")


def request(app, method, target, headers=None):
    """Send one request to `app` and return (status, json body).

    `target` goes on the wire exactly as written (no re-encoding).
    """

    async def go():
        async with TestClient(TestServer(app)) as client:
            url = URL(target, encoded=True)
            async with client.request(method, url, headers=headers or {}) as resp:
                return resp.status, await resp.json(content_type=None)

    return asyncio.run(go())


def test_health_returns_ok_without_a_signature():
    status, body = request(build_app(make_settings(), clock=lambda: NOW), "GET", "/health")
    assert status == 200
    assert body == {"status": "ok"}


def test_signed_whoami_with_a_query_reaches_the_handler():
    probe = SpyProbe()
    app = build_app(make_settings(), clock=lambda: NOW, gateway_probe=probe)
    target = "/api/whoami?b=2&a=%2F"  # raw query is part of what the gateway signs
    header = sign(KEY, NOW, "GET", target, b"")

    status, body = request(app, "GET", target, {PROXY_HEADER: header})

    assert status == 200
    assert body == {"backend": "ok", "gateway": {"version": "0.12.1"}}
    assert probe.calls == 1


def test_whoami_reports_a_config_error_until_a_gateway_probe_is_given():
    app = build_app(make_settings(), clock=lambda: NOW)
    header = sign(KEY, NOW, "GET", "/api/whoami", b"")

    status, body = request(app, "GET", "/api/whoami", {PROXY_HEADER: header})

    assert status == 200
    assert body == {"backend": "ok", "gateway": {"error": "config"}}


@pytest.mark.parametrize(
    "target, header",
    [
        pytest.param("/api/whoami", None, id="no header"),
        pytest.param("/api/whoami", "garbage", id="malformed"),
        pytest.param(
            "/api/whoami",
            sign(KEY, NOW - WINDOW_SECONDS - 1, "GET", "/api/whoami", b""),
            id="stale",
        ),
        pytest.param(
            "/api/whoami?x=1", sign(KEY, NOW, "GET", "/api/whoami", b""), id="query added"
        ),
        pytest.param("/%61pi/whoami", None, id="percent-encoded prefix"),
    ],
)
def test_bad_or_missing_signature_is_refused_before_the_handler(target, header):
    probe = SpyProbe()
    app = build_app(make_settings(), clock=lambda: NOW, gateway_probe=probe)
    headers = {PROXY_HEADER: header} if header is not None else {}

    status, body = request(app, "GET", target, headers)

    assert status == 401
    assert body == {"error": "bad_proxy_signature"}
    assert probe.calls == 0


def test_signed_requests_are_refused_when_the_secret_is_missing():
    probe = SpyProbe()
    app = build_app(make_settings(secret=None), clock=lambda: NOW, gateway_probe=probe)
    header = sign(KEY, NOW, "GET", "/api/whoami", b"")

    status, body = request(app, "GET", "/api/whoami", {PROXY_HEADER: header})

    assert status == 401
    assert body == {"error": "bad_proxy_signature"}
    assert probe.calls == 0
