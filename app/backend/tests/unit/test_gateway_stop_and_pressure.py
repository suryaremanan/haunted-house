"""``GatewayClient`` additions for Room Ghosts: the single stop request
(RG-S3) and the ``Retry-After`` of a 429 answer (RG-S5).

Validates: Requirements 8.6, 12.1, 12.3.
"""

from __future__ import annotations

import asyncio
import secrets

import aiohttp
import pytest
from aiohttp import web
from aiohttp.test_utils import TestServer

from haunted_house.adapters.gateway_client import (
    MAX_CHAT_MESSAGE_BYTES,
    SECRET_HEADER,
    STOP_TIMEOUT,
    GatewayClient,
    GatewayError,
    token_exchange_path,
)
from haunted_house.adapters.settings import Settings
from haunted_house.core.prompts import MAX_PROMPT_BYTES
from haunted_house.core.profile_contracts import MAX_SKILL_BYTES

APP_KEY = "app-k3y-x1"  # short on purpose: not a real credential
APP = "haunted-house"
ALLOWED = ["/api/version", "/api/chat/*", "/apps/haunted-house/api/*"]


class Gateway:
    def __init__(self) -> None:
        self.issued: list[str] = []
        self.requests: list[tuple[str, str, bytes, dict[str, str]]] = []
        self.answers: list[web.Response] = []

    def app(self) -> web.Application:
        app = web.Application()
        app.router.add_post(token_exchange_path(APP), self._exchange)
        app.router.add_route("*", "/{tail:.*}", self._any)
        return app

    async def _exchange(self, request: web.Request) -> web.Response:
        assert request.headers.get(SECRET_HEADER) == APP_KEY
        self.issued.append("tk-" + secrets.token_hex(4))
        return web.json_response({"token": self.issued[-1]})

    async def _any(self, request: web.Request) -> web.Response:
        self.requests.append(
            (request.method, request.raw_path.partition("?")[0], await request.read(), dict(request.query))
        )
        if self.answers:
            return self.answers.pop(0)
        return web.json_response({"ok": True})


def _with_client(gateway: Gateway, run):
    return asyncio.run(_client_call(gateway, run))


async def _client_call(gateway: Gateway, run):
    async with TestServer(gateway.app()) as server, aiohttp.ClientSession() as session:
        settings = Settings(
            port=1, secret=APP_KEY, gateway_origin=f"http://127.0.0.1:{server.port}",
            app_name=APP, mansion_root=None, approved_roots=(),  # type: ignore[arg-type]
        )
        return await run(GatewayClient(settings, session, ALLOWED))


def test_stop_is_one_bodyless_post_without_force():
    gateway = Gateway()
    reply = _with_client(gateway, lambda client: client.stop_chat_slot("hh-tinker-1-ab"))
    assert reply == {"ok": True}
    assert [(m, p, b) for m, p, b, _q in gateway.requests] == [
        ("POST", "/api/chat/slots/hh-tinker-1-ab/stop", b"")
    ]
    assert set(gateway.requests[0][3]) == {"token"}  # no force flag, nothing else


def test_a_refused_stop_is_never_sent_a_second_time():
    gateway = Gateway()
    gateway.answers = [web.json_response({"error": "token_expired"}, status=401)]
    with pytest.raises(GatewayError) as caught:
        _with_client(gateway, lambda client: client.stop_chat_slot("slot-1"))
    assert caught.value.kind == "denied" and caught.value.status == 401
    assert len(gateway.requests) == 1


def test_stop_refuses_an_unsafe_slot_without_sending():
    gateway = Gateway()
    with pytest.raises(GatewayError) as caught:
        _with_client(gateway, lambda client: client.stop_chat_slot("../other"))
    assert caught.value.kind == "config" and gateway.requests == []


def test_the_stop_timeout_is_at_least_thirty_seconds():
    assert STOP_TIMEOUT >= 30.0


def test_a_429_reports_code_and_retry_after():
    gateway = Gateway()
    gateway.answers = [
        web.json_response(
            {"error": "busy", "code": "crew_queue_full", "capacity": {}},
            status=429, headers={"Retry-After": "10"},
        )
    ]
    with pytest.raises(GatewayError) as caught:
        _with_client(gateway, lambda client: client.send_chat_turn("slot-1", "hello"))
    error = caught.value
    assert (error.kind, error.status, error.code, error.retry_after) == ("http", 429, "crew_queue_full", 10)
    assert len(gateway.requests) == 1  # a refused turn is not re-sent


def test_other_failures_carry_no_retry_after():
    gateway = Gateway()
    gateway.answers = [
        web.json_response({"code": "task_store_unavailable"}, status=503, headers={"Retry-After": "30"})
    ]
    with pytest.raises(GatewayError) as caught:
        _with_client(gateway, lambda client: client.send_chat_turn("slot-1", "hello"))
    assert caught.value.status == 503 and caught.value.retry_after is None


def test_one_message_holds_a_skill_block_and_a_bounded_prompt():
    assert MAX_CHAT_MESSAGE_BYTES >= MAX_SKILL_BYTES + MAX_PROMPT_BYTES
