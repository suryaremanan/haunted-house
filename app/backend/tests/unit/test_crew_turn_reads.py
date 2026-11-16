"""CrewChat additions for Room Ghosts: the latest turn, the stop request, and
the status and code of a refusal (RG-S3, RG-S5).  Requirements 8.6, 12.1."""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from haunted_house.adapters.crew_chat import CrewChat, CrewChatError, SessionBinding
from haunted_house.adapters.gateway_client import GatewayError
from haunted_house.core.workshop_scheduler import classify_crew_refusal


class Gateway:
    def __init__(self, messages: list[dict[str, Any]] | None = None) -> None:
        self.messages = messages or []
        self.stop_reply: dict[str, Any] = {"ok": True}
        self.stops = 0
        self.send_error: GatewayError | None = None

    async def session_history(self, slot: str) -> dict[str, Any]:
        return {"messages": self.messages}

    async def stop_chat_slot(self, slot: str) -> dict[str, Any]:
        self.stops += 1
        return self.stop_reply

    async def send_chat_turn(self, slot: str, message: str) -> dict[str, Any]:
        if self.send_error is not None:
            raise self.send_error
        return {"ok": True, "queued": True}


def run(coroutine):
    return asyncio.run(coroutine)


def test_final_text_is_the_last_assistant_message_of_the_latest_turn():
    gateway = Gateway(
        [
            {"role": "user", "content": "first"},
            {"role": "assistant", "content": "old answer"},
            {"role": "user", "content": "second"},
            {"role": "assistant", "content": "thinking"},
            {"role": "permission", "content": "Run a tool", "meta": {"mid": "m1"}},
            {"role": "assistant", "content": '{"schema_version":1}'},
        ]
    )
    turn = run(CrewChat(gateway).read_turn("slot-1"))
    assert turn.final_text == '{"schema_version":1}'
    assert turn.notices == () and turn.stop_state is None


def test_a_turn_without_an_answer_has_no_final_text():
    gateway = Gateway(
        [
            {"role": "assistant", "content": "an earlier turn"},
            {"role": "user", "content": "now"},
            {"role": "assistant", "content": "   "},
            "not a row",
        ]
    )
    assert run(CrewChat(gateway).read_turn("slot-1")).final_text is None
    assert run(CrewChat(Gateway()).read_turn("slot-1")).final_text is None


def test_notices_and_stop_state_of_the_latest_turn_are_reported():
    gateway = Gateway(
        [
            {"role": "user", "content": "go"},
            {"role": "error", "content": "x", "meta": {"notice": "background_turn_abandoned"}},
            {"role": "system", "content": "", "meta": {"kind": "stop_event", "state": "stopping"}},
            {"role": "system", "content": "", "meta": {"kind": "stop_event", "state": "stopped"}},
        ]
    )
    turn = run(CrewChat(gateway).read_turn("slot-1"))
    assert turn.notices == ("background_turn_abandoned",)
    assert turn.stop_state == "stopped"
    assert classify_crew_refusal(notice=turn.notices[0]) == "crew_capacity"


def test_stop_is_confirmed_only_by_ok_without_info():
    gateway = Gateway()
    chat = CrewChat(gateway)
    assert run(chat.stop_turn("slot-1")).status == "stopped"
    gateway.stop_reply = {"ok": True, "info": "no active turn"}
    assert run(chat.stop_turn("slot-1")).status == "not_stopped"
    gateway.stop_reply = {"ok": False}
    assert run(chat.stop_turn("slot-1")).status == "not_stopped"
    assert gateway.stops == 3  # one request per call: never a retry


def test_a_refusal_carries_status_code_and_retry_after():
    gateway = Gateway()
    gateway.send_error = GatewayError(
        "http", "POST /api/chat returned 429", status=429, code="crew_queue_full", retry_after=10
    )
    with pytest.raises(CrewChatError) as caught:
        run(CrewChat(gateway).send_turn(SessionBinding("slot-1"), "hello"))
    error = caught.value
    assert (error.code, error.status, error.gateway_code, error.retry_after) == (
        "crew_failed", 429, "crew_queue_full", 10,
    )
    assert classify_crew_refusal(error.status, error.gateway_code) == "crew_capacity"
    gateway.send_error = GatewayError("http", "x", status=503, code="task_store_unavailable")
    with pytest.raises(CrewChatError) as caught:
        run(CrewChat(gateway).send_turn(SessionBinding("slot-1"), "hello"))
    assert classify_crew_refusal(caught.value.status, caught.value.gateway_code) is None


def test_a_queued_receipt_is_accepted_not_a_refusal():
    result = run(CrewChat(Gateway()).send_turn(SessionBinding("slot-1"), "hello"))
    assert result.queued is True
