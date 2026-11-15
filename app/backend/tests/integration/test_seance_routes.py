"""Signed Canonical_Event_API and reconciliation integration tests (task 6.5).

Every test builds the real application with `build_app`, the real
`SeanceLogStore` on a temporary Mansion root, and the real `SeanceService`.
Requests are signed exactly as Crew's proxy signs them.  Session history comes
from a fake gateway served by aiohttp's TestServer through the real
`GatewayClient`; no real Crew gateway is contacted.

Validates: Requirements 2.1, 4.7–4.9, 9.1, 9.3–9.8, 11.1–11.7.
"""

from __future__ import annotations

import asyncio
import json
import secrets
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import aiohttp
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from yarl import URL

from haunted_house.adapters.gateway_client import (
    SECRET_HEADER,
    SESSION_HISTORY_GRANT,
    GatewayClient,
    token_exchange_path,
)
from haunted_house.adapters.seance_log_store import SeanceLogStore
from haunted_house.adapters.seance_service import SeanceService
from haunted_house.adapters.settings import Settings
from haunted_house.core.crew_event_normalizer import CrewEnvelope
from haunted_house.core.proxy_signature import sign
from haunted_house.core.seance_event import (
    MAX_INGEST_BATCH_SIZE,
    MAX_INGEST_REQUEST_BYTES,
    AppEventCandidate,
    EventScope,
    EventSource,
    validate_event,
)
from haunted_house.core.seance_log_parser import parse_event_log
from haunted_house.server import PROXY_HEADER, build_app

KEY = "k3y-for-tests"  # short on purpose: not a real credential
APP = "haunted-house"
NOW = 1_731_400_000
REGISTERED_AT_MS = 1_731_400_000_000
MANSION = "demo-mansion"
SLOT = "study-slot"
LOG_NAME = "events.v1." + "jsonl"
INGEST = f"/api/mansions/{MANSION}/seance/ingest"
EVENTS = f"/api/mansions/{MANSION}/seance/events"
RECONCILE = f"/api/mansions/{MANSION}/seance/reconcile"
IN_RUN_TS = "2024-11-12T08:30:00+00:00"  # after REGISTERED_AT_MS
BEFORE_RUN_TS = "2024-11-01T08:30:00+00:00"

SCOPE = EventScope(
    mansion_id=MANSION,
    ghost_id="archivist",
    session_slot=SLOT,
    run_id="requirements-1",
    run_sequence=1,
)


def _run_started(scope: EventScope = SCOPE) -> AppEventCandidate:
    return AppEventCandidate(
        schema_version=1,
        event_type="run_started",
        scope=scope,
        source=EventSource(
            origin="house",
            source_type="run",
            identity_parts=(scope.run_id,),
            revision=0,
            generation="",
            source_sequence=0,
        ),
        caused_by=(),
        occurred_at_ms=None,
        payload={"reason": "assigned"},
    )


@dataclass
class Reply:
    status: int
    text: str

    @property
    def json(self) -> Any:
        return json.loads(self.text)


@dataclass
class House:
    """One running backend plus direct access to its temporary Mansion root."""

    client: TestClient
    store: SeanceLogStore
    root: Path
    log: Path
    service_calls: list[tuple[str, tuple[CrewEnvelope, ...]]] = field(default_factory=list)

    async def send(
        self,
        method: str,
        target: str,
        body: bytes = b"",
        *,
        signed: bool = True,
        content_type: str | None = "application/json",
        key: str = KEY,
    ) -> Reply:
        headers: dict[str, str] = {}
        if signed:
            headers[PROXY_HEADER] = sign(key, NOW, method, target, body)
        if content_type is not None and method != "GET":
            headers["Content-Type"] = content_type
        async with self.client.request(
            method, URL(target, encoded=True), headers=headers, data=body
        ) as response:
            return Reply(response.status, await response.text())

    async def ingest(self, envelopes: list[dict[str, Any]], **kwargs: Any) -> Reply:
        body = json.dumps({"envelopes": envelopes}).encode()
        return await self.send("POST", INGEST, body, **kwargs)

    async def register(self, scope: EventScope = SCOPE) -> None:
        appended = await self.store.append_candidates(MANSION, [_run_started(scope)])
        assert appended.status == "ok"

    def log_bytes(self) -> bytes:
        return self.log.read_bytes() if self.log.exists() else b""


class FakeGateway:
    """Token exchange plus one session-history response per requested slot."""

    def __init__(self) -> None:
        self.issued: list[str] = []
        self.history_paths: list[str] = []
        self.refuse = 0
        self.delay = 0.0
        self.histories: dict[str, object] = {}

    def app(self) -> web.Application:
        app = web.Application()
        app.router.add_post(token_exchange_path(APP), self._exchange)
        app.router.add_get("/api/chat/slots/{slot}", self._history)
        return app

    async def _exchange(self, request: web.Request) -> web.Response:
        if request.headers.get(SECRET_HEADER) != KEY:
            return web.json_response({"error": "bad_secret"}, status=403)
        token = "tk-" + secrets.token_hex(4)
        self.issued.append(token)
        return web.json_response({"token": token})

    async def _history(self, request: web.Request) -> web.Response:
        self.history_paths.append(request.raw_path.partition("?")[0])
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.refuse > 0:
            self.refuse -= 1
            return web.json_response({"error": "token_expired"}, status=401)
        if request.query.get("token") != self.issued[-1]:
            return web.json_response({"error": "bad_token"}, status=401)
        slot = request.match_info["slot"]
        return web.json_response(self.histories.get(slot, {"messages": []}))


Scenario = Callable[[House], Awaitable[Any]]


def serve(
    tmp_path: Path,
    scenario: Scenario,
    *,
    gateway: FakeGateway | None = None,
    history_timeout: float = 5.0,
    known_secrets: tuple[str, ...] = (),
    gate: Callable[[str], Awaitable[bool]] | None = None,
    create_mansion: bool = True,
) -> Any:
    """Run `scenario` against a live test server over a temporary root."""

    async def go() -> Any:
        root = tmp_path / "mansions"
        root.mkdir(parents=True, exist_ok=True)
        if create_mansion:
            (root / MANSION).mkdir(exist_ok=True)
        store = SeanceLogStore(
            root,
            known_secrets=[KEY, *known_secrets],
            clock_ms=lambda: REGISTERED_AT_MS,
        )
        settings = Settings(
            port=1,
            secret=KEY,
            gateway_origin=None,
            app_name=APP,
            mansion_root=root,
            approved_roots=(tmp_path,),
        )
        async with aiohttp.ClientSession() as session:
            history = None
            gateway_server: TestServer | None = None
            if gateway is not None:
                gateway_server = TestServer(gateway.app())
                await gateway_server.start_server()
                gateway_settings = Settings(
                    port=1,
                    secret=KEY,
                    gateway_origin=f"http://127.0.0.1:{gateway_server.port}",
                    app_name=APP,
                )
                gateway_client = GatewayClient(
                    gateway_settings, session, [SESSION_HISTORY_GRANT]
                )

                class History:
                    async def session_history(self, slot: str) -> dict[str, Any]:
                        return await gateway_client.session_history(
                            slot, timeout=history_timeout
                        )

                history = History()
            try:
                app = build_app(
                    settings,
                    clock=lambda: NOW,
                    seance_service=SeanceService(store, history=history),
                    seance_mansion_gate=gate,
                )
                async with TestClient(TestServer(app)) as client:
                    house = House(
                        client=client,
                        store=store,
                        root=root,
                        log=root / MANSION / ".haunted-house" / "seance" / LOG_NAME,
                    )
                    return await scenario(house)
            finally:
                if gateway_server is not None:
                    await gateway_server.close()

    return asyncio.run(go())


def chunk(seq: int, content: str = "DONE ", slot: str = SLOT) -> dict[str, Any]:
    return {
        "type": "chat_chunk",
        "data": {"slot": slot, "content": content, "seq": seq, "gen": "generation-a"},
    }


def chat_done(slot: str = SLOT) -> dict[str, Any]:
    return {
        "type": "chat_done",
        "data": {
            "slot": slot,
            "turn": 3,
            "turn_gen": "generation-a",
            "continuing": False,
            "needs_input": False,
        },
    }


# --- ingest ------------------------------------------------------------------


def test_signed_ingest_persists_then_returns_canonical_events(tmp_path):
    async def scenario(house: House):
        await house.register()
        reply = await house.ingest([chunk(9), chunk(10, "notes"), chat_done()])
        return reply, house.log_bytes()

    reply, raw = serve(tmp_path, scenario)

    assert reply.status == 200
    body = reply.json
    assert [event["event_type"] for event in body["events"]] == [
        "response_chunk_recorded",
        "response_chunk_recorded",
        "crew_turn_ended",
    ]
    assert [event["sequence"] for event in body["events"]] == [2, 3, 4]
    assert body["highest_sequence"] == 4
    assert body["duplicate_record_ids"] == []
    assert body["diagnostics"] == []
    assert body["reconcile_slots"] == []
    # Durable acknowledgment: every returned event is a physical log line.
    parsed = parse_event_log(raw)
    assert parsed.ok and parsed.highest_sequence == 4
    for returned, stored in zip(body["events"], parsed.events[1:], strict=True):
        assert validate_event(returned).value == stored
        assert returned["scope"] == {
            "mansion_id": MANSION,
            "ghost_id": "archivist",
            "session_slot": SLOT,
            "run_id": "requirements-1",
            "run_sequence": 1,
        }
        assert returned["source"]["origin"] == "crew"
        assert returned["hash"].startswith("h1:")


def test_chat_done_is_acknowledged_only_as_a_transport_fact(tmp_path):
    async def scenario(house: House):
        await house.register()
        return (await house.ingest([chat_done()])).json

    body = serve(tmp_path, scenario)

    assert [event["event_type"] for event in body["events"]] == ["crew_turn_ended"]
    assert body["events"][0]["payload"] == {
        "generation": "generation-a",
        "turn": 3,
        "continuing": False,
        "needs_input": False,
    }


def test_the_raw_envelope_reaches_the_normalizer_unchanged(tmp_path):
    seen: list[tuple[str, list[CrewEnvelope]]] = []

    async def scenario(house: House):
        await house.register()
        original = SeanceService.ingest

        async def spy(self, mansion_id, envelopes):
            seen.append((mansion_id, list(envelopes)))
            return await original(self, mansion_id, envelopes)

        SeanceService.ingest = spy  # type: ignore[method-assign]
        try:
            raw = {
                "type": "chat_message",
                "data": {
                    "slot": SLOT,
                    "role": "user",
                    "content": "Create the notes file.",
                    "ts": IN_RUN_TS,
                    "cls": "msg msg-u",
                    "meta": {"mid": "m-1", "turnActor": "app", "extra": [1, 2.5, None]},
                    "mansion_id": "another-mansion",
                    "ghost_id": "intruder",
                    "run_id": "forged-run",
                },
            }
            return raw, (await house.ingest([raw])).json
        finally:
            SeanceService.ingest = original  # type: ignore[method-assign]

    raw, body = serve(tmp_path, scenario)

    assert seen == [(MANSION, [CrewEnvelope(type=raw["type"], data=raw["data"])])]
    event = body["events"][0]
    # Scope comes from the server registry; browser-supplied scope is ignored.
    assert event["scope"]["mansion_id"] == MANSION
    assert event["scope"]["ghost_id"] == "archivist"
    assert event["scope"]["run_id"] == "requirements-1"
    assert event["payload"] == {
        "mid": "m-1",
        "role": "user",
        "content": "Create the notes file.",
    }


def test_unsigned_forged_and_stale_ingest_is_refused_before_any_handler(tmp_path):
    async def scenario(house: House):
        await house.register()
        before = house.log_bytes()
        body = json.dumps({"envelopes": [chunk(1)]}).encode()
        unsigned = await house.send("POST", INGEST, body, signed=False)
        forged = await house.send("POST", INGEST, body, key="0ther-k3y")
        async with house.client.request(
            "POST",
            INGEST,
            data=body,
            headers={
                PROXY_HEADER: sign(KEY, NOW - 10_000, "POST", INGEST, body),
                "Content-Type": "application/json",
            },
        ) as response:
            stale = Reply(response.status, await response.text())
        tampered_body = json.dumps({"envelopes": [chunk(2)]}).encode()
        async with house.client.request(
            "POST",
            INGEST,
            data=tampered_body,
            headers={
                PROXY_HEADER: sign(KEY, NOW, "POST", INGEST, body),
                "Content-Type": "application/json",
            },
        ) as response:
            tampered = Reply(response.status, await response.text())
        unsigned_read = await house.send("GET", EVENTS, signed=False)
        unsigned_reconcile = await house.send(
            "POST", RECONCILE, b'{"slots":["study-slot"]}', signed=False
        )
        return (
            [unsigned, forged, stale, tampered, unsigned_read, unsigned_reconcile],
            before == house.log_bytes(),
        )

    replies, unchanged = serve(tmp_path, scenario)

    assert [reply.status for reply in replies] == [401] * 6
    assert all(reply.json == {"error": "bad_proxy_signature"} for reply in replies)
    assert unchanged


def test_an_unregistered_slot_is_refused_and_appends_nothing(tmp_path):
    async def scenario(house: House):
        await house.register()
        before = house.log_bytes()
        reply = await house.ingest([chunk(1, slot="someone-elses-chat")])
        decision = await house.ingest(
            [
                {
                    "type": "shared_crew.decision",
                    "data": {
                        "decision": {
                            "session_key": "someone-elses-chat",
                            "decision_id": "approval:1:someone-elses-chat:1",
                            "revision": 1,
                            "kind": "approval",
                            "state": "pending",
                        }
                    },
                }
            ]
        )
        return reply, decision, before == house.log_bytes()

    reply, decision, unchanged = serve(tmp_path, scenario)

    for refused in (reply, decision):
        assert refused.status == 400
        assert refused.json["error"]["code"] == "invalid_envelope"
        assert refused.json["diagnostics"] == [
            {
                "code": "unknown_session",
                "index": 0,
                "field": "data.slot",
                "reason": "unregistered_slot",
            }
        ]
        assert "someone-elses-chat" not in refused.text
    assert unchanged


def test_a_crew_envelope_cannot_register_its_own_scope(tmp_path):
    async def scenario(house: House):
        await house.register()
        # A Crew-origin record never registers a slot, whatever it claims.
        forged = await house.ingest(
            [{"type": "chat_run_started", "data": {"slot": "new-slot", "id": "x"}}]
        )
        observed = await house.ingest(
            [{"type": "chat_run_started", "data": {"slot": SLOT, "id": "x"}}]
        )
        follow_up = await house.ingest([chunk(1, slot="new-slot")])
        return forged, observed, follow_up

    forged, observed, follow_up = serve(tmp_path, scenario)

    assert forged.status == 400
    assert observed.status == 200
    assert observed.json["events"][0]["event_type"] == "source_event_observed"
    assert follow_up.status == 400


def test_one_invalid_envelope_rejects_the_whole_batch(tmp_path):
    async def scenario(house: House):
        await house.register()
        before = house.log_bytes()
        reply = await house.ingest(
            [
                chunk(1),
                {"type": "tool_call", "data": {"slot": SLOT, "tool": "Write File"}},
                chunk(2),
                {"type": "activity_event", "data": {"slot": SLOT, "text": "noise"}},
            ]
        )
        after = house.log_bytes()
        retry = await house.ingest([chunk(1), chunk(2)])
        return reply, before == after, retry

    reply, unchanged, retry = serve(tmp_path, scenario)

    assert reply.status == 400
    assert reply.json["error"]["code"] == "invalid_envelope"
    assert reply.json["highest_sequence"] == 1
    assert reply.json["diagnostics"] == [
        {
            "code": "invalid_envelope",
            "index": 1,
            "field": "data.tool_call_id",
            "reason": "missing_field",
        },
        {
            "code": "invalid_envelope",
            "index": 3,
            "field": "type",
            "reason": "unsupported_type",
        },
    ]
    assert unchanged
    assert [event["sequence"] for event in retry.json["events"]] == [2, 3]


def test_malformed_requests_are_400_and_append_nothing(tmp_path):
    bodies: list[tuple[str, bytes, str | None]] = [
        ("not-json", b"{not json", "application/json"),
        ("bad-utf8", b"\xff\xfe", "application/json"),
        ("array", b"[]", "application/json"),
        ("missing-key", b"{}", "application/json"),
        ("empty-batch", b'{"envelopes":[]}', "application/json"),
        ("extra-key", b'{"envelopes":[],"mansion_id":"x"}', "application/json"),
        ("not-a-list", b'{"envelopes":{}}', "application/json"),
        ("non-object-envelope", b'{"envelopes":["chat_done"]}', "application/json"),
        ("missing-data", b'{"envelopes":[{"type":"chat_done"}]}', "application/json"),
        (
            "extra-envelope-key",
            b'{"envelopes":[{"type":"chat_done","data":{},"scope":{}}]}',
            "application/json",
        ),
        (
            "non-string-type",
            b'{"envelopes":[{"type":7,"data":{}}]}',
            "application/json",
        ),
        (
            "duplicate-key",
            b'{"envelopes":[{"type":"chat_done","type":"chat_chunk","data":{}}]}',
            "application/json",
        ),
        ("nan", b'{"envelopes":[{"type":"chat_done","data":{"x":NaN}}]}', "application/json"),
        (
            "wrong-content-type",
            json.dumps({"envelopes": [chunk(1)]}).encode(),
            "text/plain",
        ),
    ]

    async def scenario(house: House):
        await house.register()
        before = house.log_bytes()
        replies = [
            await house.send("POST", INGEST, body, content_type=content_type)
            for _name, body, content_type in bodies
        ]
        not_an_object = await house.ingest([{"type": "chat_done", "data": [1, 2]}])
        return replies, not_an_object, before == house.log_bytes()

    replies, not_an_object, unchanged = serve(tmp_path, scenario)

    for (name, _body, _type), reply in zip(bodies, replies, strict=True):
        assert reply.status == 400, name
        assert reply.json["error"]["code"] == "invalid_request", name
    assert not_an_object.status == 400
    assert not_an_object.json["error"]["code"] == "invalid_envelope"
    assert unchanged


def test_body_and_batch_limits_are_enforced(tmp_path):
    async def scenario(house: House):
        await house.register()
        before = house.log_bytes()
        at_limit = await house.ingest(
            [chunk(index) for index in range(MAX_INGEST_BATCH_SIZE)]
        )
        after_limit = house.log_bytes()
        over_count = await house.ingest(
            [chunk(1000 + index) for index in range(MAX_INGEST_BATCH_SIZE + 1)]
        )
        huge = json.dumps(
            {"envelopes": [chunk(5000, "x" * MAX_INGEST_REQUEST_BYTES)]}
        ).encode()
        over_bytes = await house.send("POST", INGEST, huge)
        return at_limit, over_count, over_bytes, before, after_limit, house.log_bytes()

    at_limit, over_count, over_bytes, before, after_limit, final = serve(tmp_path, scenario)

    assert at_limit.status == 200
    assert len(at_limit.json["events"]) == MAX_INGEST_BATCH_SIZE
    assert over_count.status == 413
    assert over_count.json["error"]["code"] == "too_many_envelopes"
    assert over_bytes.status == 413
    assert after_limit.startswith(before)
    assert final == after_limit


def test_exact_redelivery_returns_the_prior_records_without_appending(tmp_path):
    async def scenario(house: House):
        await house.register()
        first = await house.ingest([chunk(9), chat_done()])
        committed = house.log_bytes()
        again = await house.ingest([chunk(9), chat_done()])
        mixed = await house.ingest([chat_done(), chunk(10)])
        return first.json, again.json, mixed.json, committed, house.log_bytes()

    first, again, mixed, committed, final = serve(tmp_path, scenario)

    assert again["events"] == first["events"]
    assert again["duplicate_record_ids"] == [
        event["record_id"] for event in first["events"]
    ]
    assert again["highest_sequence"] == first["highest_sequence"] == 3
    assert [event["sequence"] for event in mixed["events"]] == [3, 4]
    assert mixed["duplicate_record_ids"] == [first["events"][1]["record_id"]]
    assert final.startswith(committed)
    assert final.count(b"\n") == 4


def test_an_unmatched_approval_keeps_decision_evidence_and_asks_for_history(tmp_path):
    async def scenario(house: House):
        await house.register()
        pending = {
            "type": "shared_crew.decision",
            "data": {
                "type": "shared_crew.decision",
                "schema_version": 1,
                "decision": {
                    "decision_id": f"approval:5:{SLOT}:2",
                    "kind": "approval",
                    "session_key": SLOT,
                    "state": "pending",
                    "revision": 1,
                    "outcome": "",
                    "resolved_at": None,
                },
            },
        }
        no_mid = {"type": "approval_resolved", "data": {"slot": SLOT, "id": "2", "approved": True}}
        with_mid = {
            "type": "approval_resolved",
            "data": {"slot": SLOT, "id": "2", "approved": True, "mid": "m-permission"},
        }
        return (
            (await house.ingest([pending, no_mid])).json,
            (await house.ingest([with_mid])).json,
        )

    unmatched, matched = serve(tmp_path, scenario)

    assert [event["event_type"] for event in unmatched["events"]] == ["decision_recorded"]
    assert "mid" not in unmatched["events"][0]["payload"]
    assert unmatched["reconcile_slots"] == [SLOT]
    assert [(item["code"], item["index"]) for item in unmatched["diagnostics"]] == [
        ("approval_unmatched", 0),
        ("approval_unmatched", 1),
    ]
    assert [event["event_type"] for event in matched["events"]] == ["approval_decided"]
    assert matched["events"][0]["payload"] == {"mid": "m-permission", "outcome": "approved"}
    assert matched["reconcile_slots"] == []


def test_responses_and_log_bytes_are_redacted(tmp_path):
    planted = "sk-" + "planted" + secrets.token_hex(6)
    home = "/" + "Users" + "/casper/workspace/notes.md"

    async def scenario(house: House):
        await house.register()
        reply = await house.ingest(
            [chunk(1, f"token {planted} at {home} and proxy {KEY}")]
        )
        page = await house.send("GET", EVENTS + "?after_sequence=1")
        return reply, page, house.log_bytes()

    reply, page, raw = serve(tmp_path, scenario, known_secrets=(planted,))

    assert reply.status == 200
    content = reply.json["events"][0]["payload"]["content"]
    assert content == "token [redacted] at [home]/workspace/notes.md and proxy [redacted]"
    for surface in (reply.text, page.text, raw.decode("utf-8")):
        assert planted not in surface
        assert KEY not in surface
        assert "casper" not in surface
    assert page.json["events"] == reply.json["events"]


def test_errors_never_echo_request_text_or_host_paths(tmp_path):
    marker = "echo-" + secrets.token_hex(6)

    async def scenario(house: House):
        await house.register()
        return [
            await house.ingest([chunk(1, slot=marker)]),
            await house.ingest([{"type": marker, "data": {"slot": SLOT}}]),
            await house.send("POST", INGEST, f'{{"{marker}":1}}'.encode()),
            await house.send("GET", EVENTS + f"?after_sequence={marker}"),
            await house.send("POST", RECONCILE, json.dumps({"slots": [marker]}).encode()),
        ]

    replies = serve(tmp_path, scenario)

    for reply in replies:
        assert reply.status == 400
        assert marker not in reply.text
        assert str(tmp_path) not in reply.text
        assert "Traceback" not in reply.text


# --- mansion resolution ------------------------------------------------------


def test_invalid_mansion_ids_are_400_before_any_path_is_touched(tmp_path):
    async def scenario(house: House):
        replies = []
        for mansion_id in ("Demo-Mansion", "demo_mansion", "a" * 41, "-x", "x-", "%2e%2e"):
            target = f"/api/mansions/{mansion_id}/seance/events"
            replies.append(await house.send("GET", target))
            replies.append(
                await house.send(
                    "POST",
                    f"/api/mansions/{mansion_id}/seance/ingest",
                    json.dumps({"envelopes": [chunk(1)]}).encode(),
                )
            )
        return replies, sorted(path.name for path in house.root.iterdir())

    replies, entries = serve(tmp_path, scenario)

    assert [reply.status for reply in replies] == [400] * len(replies)
    assert all(reply.json["error"]["code"] == "invalid_mansion_id" for reply in replies)
    assert entries == [MANSION]


def test_a_missing_mansion_or_log_is_404_and_nothing_is_created(tmp_path):
    async def scenario(house: House):
        missing = "absent-mansion"
        replies = [
            await house.send("GET", f"/api/mansions/{missing}/seance/events"),
            await house.send(
                "POST",
                f"/api/mansions/{missing}/seance/ingest",
                json.dumps({"envelopes": [chunk(1)]}).encode(),
            ),
            await house.send(
                "POST",
                f"/api/mansions/{missing}/seance/reconcile",
                json.dumps({"slots": [SLOT]}).encode(),
            ),
            # The Mansion exists but no producer has started a log yet.
            await house.send("GET", EVENTS),
            await house.ingest([chunk(1)]),
        ]
        return (
            replies,
            sorted(path.name for path in house.root.iterdir()),
            list((house.root / MANSION).iterdir()),
        )

    replies, entries, mansion_entries = serve(tmp_path, scenario)

    assert [reply.status for reply in replies] == [404] * 5
    assert [reply.json["error"]["code"] for reply in replies] == [
        "mansion_not_found",
        "mansion_not_found",
        "mansion_not_found",
        "log_not_found",
        "log_not_found",
    ]
    assert entries == [MANSION]
    assert mansion_entries == []


def test_the_mansion_gate_decides_before_any_log_access(tmp_path):
    asked: list[str] = []

    async def gate(mansion_id: str) -> bool:
        asked.append(mansion_id)
        return mansion_id == "other-mansion"

    async def scenario(house: House):
        await house.register()
        before = house.log_bytes()
        refused = await house.ingest([chunk(1)])
        read = await house.send("GET", EVENTS)
        return refused, read, before == house.log_bytes()

    refused, read, unchanged = serve(tmp_path, scenario, gate=gate)

    assert refused.status == read.status == 404
    assert refused.json["error"]["code"] == "mansion_not_found"
    assert asked == [MANSION, MANSION]
    assert unchanged


def test_a_failing_gate_is_unavailable_not_a_bypass(tmp_path):
    async def gate(_mansion_id: str) -> bool:
        raise RuntimeError("registry at /private/path is broken")

    async def scenario(house: House):
        await house.register()
        before = house.log_bytes()
        return await house.ingest([chunk(1)]), before == house.log_bytes()

    reply, unchanged = serve(tmp_path, scenario, gate=gate)

    assert reply.status == 503
    assert reply.json["error"]["code"] == "seance_unavailable"
    assert "private" not in reply.text
    assert unchanged


def test_a_symlinked_mansion_is_not_followed(tmp_path):
    outside = tmp_path / "outside"
    outside.mkdir()

    async def scenario(house: House):
        (house.root / "linked-mansion").symlink_to(outside, target_is_directory=True)
        return await house.send("GET", "/api/mansions/linked-mansion/seance/events")

    reply = serve(tmp_path, scenario)

    assert reply.status == 404
    assert list(outside.iterdir()) == []


# --- read-after paging -------------------------------------------------------


def test_pages_cover_every_record_once_in_sequence_order(tmp_path):
    async def scenario(house: House):
        await house.register()
        await house.ingest([chunk(index) for index in range(1, 12)])
        pages = []
        after = 0
        while True:
            page = (await house.send("GET", f"{EVENTS}?after_sequence={after}&limit=5")).json
            pages.append(page)
            if not page["events"]:
                break
            after = page["events"][-1]["sequence"]
        default = (await house.send("GET", EVENTS)).json
        return pages, default

    pages, default = serve(tmp_path, scenario)

    sequences = [event["sequence"] for page in pages for event in page["events"]]
    assert sequences == list(range(1, 13))
    assert [len(page["events"]) for page in pages] == [5, 5, 2, 0]
    assert [page["has_more"] for page in pages] == [True, True, False, False]
    assert all(page["highest_sequence"] == 12 for page in pages)
    assert all(page["integrity"] == "ok" and page["diagnostics"] == [] for page in pages)
    assert default["events"] == [event for page in pages for event in page["events"]]
    assert default["valid_prefix_sequence"] == 12
    assert default["valid_prefix_lines"] == 12


def test_invalid_paging_arguments_are_400(tmp_path):
    queries = [
        "after_sequence=-1",
        "after_sequence=1.5",
        "after_sequence=abc",
        "after_sequence=01",
        "after_sequence=1&after_sequence=2",
        "limit=0",
        "limit=501",
        "limit=abc",
        "limit=+5",
        "after_sequence=",
    ]

    async def scenario(house: House):
        await house.register()
        return [await house.send("GET", f"{EVENTS}?{query}") for query in queries]

    replies = serve(tmp_path, scenario)

    for query, reply in zip(queries, replies, strict=True):
        assert reply.status == 400, query
        assert reply.json["error"]["code"] == "invalid_request", query


def test_a_damaged_log_returns_its_valid_prefix_and_refuses_ingest(tmp_path):
    async def scenario(house: House):
        await house.register()
        await house.ingest([chunk(1), chunk(2), chunk(3)])
        lines = house.log_bytes().splitlines(keepends=True)
        record = json.loads(lines[2])
        record["persisted_at_ms"] += 1  # tamper without fixing the hash
        house.log.write_bytes(
            lines[0] + lines[1] + json.dumps(record).encode() + b"\n" + lines[3]
        )
        damaged = house.log_bytes()
        page = await house.send("GET", EVENTS)
        refused = await house.ingest([chunk(4)])
        return page, refused, damaged == house.log_bytes()

    page, refused, unchanged = serve(tmp_path, scenario)

    assert page.status == 200
    assert [event["sequence"] for event in page.json["events"]] == [1, 2]
    assert page.json["integrity"] == "failed"
    assert page.json["highest_sequence"] == 2
    assert page.json["valid_prefix_sequence"] == 2
    assert page.json["valid_prefix_lines"] == 2
    assert page.json["diagnostics"] == [
        {"code": "hash_mismatch", "reason": "record_hash_mismatch", "line": 3, "field": "hash"}
    ]
    assert refused.status == 409
    assert refused.json["error"]["code"] == "log_integrity_failed"
    assert unchanged


def test_there_is_no_mutating_or_generic_append_route(tmp_path):
    async def scenario(house: House):
        await house.register()
        before = house.log_bytes()
        attempts = [
            ("DELETE", EVENTS),
            ("PUT", EVENTS),
            ("PATCH", EVENTS),
            ("POST", EVENTS),
            ("GET", INGEST),
            ("DELETE", INGEST),
            ("POST", f"/api/mansions/{MANSION}/seance/append"),
            ("POST", f"/api/mansions/{MANSION}/seance/candidates"),
            ("POST", f"/api/mansions/{MANSION}/seance/truncate"),
            ("POST", f"/api/mansions/{MANSION}/seance/repair"),
            ("GET", f"/api/mansions/{MANSION}/seance/ws"),
        ]
        replies = [await house.send(method, target) for method, target in attempts]
        return replies, before == house.log_bytes()

    replies, unchanged = serve(tmp_path, scenario)

    assert {reply.status for reply in replies} <= {404, 405}
    assert unchanged


# --- reconciliation ----------------------------------------------------------


def _history(messages: list[dict[str, Any]], **extra: Any) -> dict[str, Any]:
    return {"slot": SLOT, "messages": messages, "has_more": False, **extra}


def _pending_decision(approval_id: str = "2", revision: int = 1) -> dict[str, Any]:
    return {
        "type": "shared_crew.decision",
        "data": {
            "decision": {
                "decision_id": f"approval:5:{SLOT}:{approval_id}",
                "kind": "approval",
                "session_key": SLOT,
                "state": "pending",
                "revision": revision,
                "outcome": "",
            }
        },
    }


def test_history_recovers_missed_facts_through_the_same_pipeline(tmp_path):
    gateway = FakeGateway()
    gateway.histories[SLOT] = _history(
        [
            {
                "role": "user",
                "content": "from an earlier run",
                "ts": BEFORE_RUN_TS,
                "meta": {"mid": "m-old"},
            },
            {
                "role": "user",
                "content": "Create the notes file.",
                "ts": IN_RUN_TS,
                "meta": {"mid": "m-1"},
            },
            {
                "role": "permission",
                "content": "Write File",
                "ts": IN_RUN_TS,
                "tool_name": "fs_write",
                "tool_input": {"path": "spec-x/notes.md"},
                "meta": {"mid": "m-permission", "approval_id": "2"},
            },
        ]
    )

    async def scenario(house: House):
        await house.register()
        live = await house.ingest(
            [
                {
                    "type": "chat_message",
                    "data": {
                        "slot": SLOT,
                        "role": "user",
                        "content": "Create the notes file.",
                        "meta": {"mid": "m-1"},
                    },
                },
                _pending_decision(),
            ]
        )
        first = await house.send("POST", RECONCILE, json.dumps({"slots": [SLOT]}).encode())
        committed = house.log_bytes()
        second = await house.send("POST", RECONCILE, json.dumps({"slots": [SLOT]}).encode())
        page = await house.send("GET", EVENTS + "?after_sequence=3")
        return live.json, first, second, page.json, committed == house.log_bytes()

    live, first, second, page, idempotent = serve(tmp_path, scenario, gateway=gateway)

    assert first.status == 200
    body = first.json
    assert gateway.history_paths == [f"/api/chat/slots/{SLOT}"] * 2
    assert body["history_partial"] is False
    assert body["slots"] == [{"slot": SLOT, "status": "recovered", "reasons": []}]
    assert body["diagnostics"] == []
    by_type = {event["event_type"]: event for event in body["events"]}
    # The live message and decision are exact duplicates, not second records.
    assert sorted(body["duplicate_record_ids"]) == sorted(
        event["record_id"] for event in live["events"]
    )
    new = [event for event in body["events"] if event["sequence"] > 3]
    assert [(event["sequence"], event["event_type"]) for event in new] == [
        (4, "message_recorded"),
        (5, "approval_requested"),
    ]
    assert new[0]["payload"] == {"mid": "m-permission", "role": "permission", "content": "Write File"}
    assert by_type["approval_requested"]["payload"] == {"mid": "m-permission"}
    assert by_type["approval_requested"]["source"]["identity_parts"] == ["m-permission"]
    assert body["highest_sequence"] == 5
    assert "m-old" not in first.text
    assert "fs_write" not in first.text and "spec-x" not in first.text
    assert page["events"] == new
    # A second reconciliation recovers nothing new.
    assert second.json["highest_sequence"] == 5
    assert idempotent


def test_unproved_history_is_reported_partial_and_invents_nothing(tmp_path):
    gateway = FakeGateway()
    gateway.histories[SLOT] = {
        "slot": SLOT,
        "has_more": True,
        "messages": [
            {"role": "user", "content": "no identifier", "ts": IN_RUN_TS},
            {"role": "user", "content": "no time", "meta": {"mid": "m-2"}},
            {
                "role": "permission",
                "content": "Run command",
                "ts": IN_RUN_TS,
                "meta": {"mid": "m-unmatched", "approval_id": "9"},
            },
            "not an object",
        ],
    }

    async def scenario(house: House):
        await house.register()
        reply = await house.send("POST", RECONCILE, json.dumps({"slots": [SLOT]}).encode())
        return reply, house.log_bytes()

    reply, raw = serve(tmp_path, scenario, gateway=gateway)

    assert reply.status == 200
    body = reply.json
    assert body["history_partial"] is True
    assert body["slots"] == [
        {
            "slot": SLOT,
            "status": "history_partial",
            "reasons": ["history_truncated", "message_unproved", "approval_unmatched"],
        }
    ]
    assert {"code": "history_partial"} in body["diagnostics"]
    # Only the proved permission message is recorded; no approval is invented.
    assert [event["event_type"] for event in body["events"]] == ["message_recorded"]
    assert b"approval_requested" not in raw
    assert b"approval_decided" not in raw
    assert parse_event_log(raw).highest_sequence == 2


def test_history_for_another_session_is_never_recorded(tmp_path):
    gateway = FakeGateway()
    gateway.histories[SLOT] = {
        "slot": "someone-elses-chat",
        "has_more": False,
        "messages": [
            {"role": "user", "content": "private", "ts": IN_RUN_TS, "meta": {"mid": "m-x"}}
        ],
    }

    async def scenario(house: House):
        await house.register()
        before = house.log_bytes()
        reply = await house.send("POST", RECONCILE, json.dumps({"slots": [SLOT]}).encode())
        return reply, before == house.log_bytes()

    reply, unchanged = serve(tmp_path, scenario, gateway=gateway)

    assert reply.json["slots"][0] == {
        "slot": SLOT,
        "status": "history_partial",
        "reasons": ["history_scope_unproved"],
    }
    assert reply.json["events"] == []
    assert "private" not in reply.text
    assert unchanged


def test_only_registered_slots_are_ever_read_from_the_gateway(tmp_path):
    gateway = FakeGateway()

    async def scenario(house: House):
        await house.register()
        before = house.log_bytes()
        replies = [
            await house.send("POST", RECONCILE, json.dumps({"slots": slots}).encode())
            for slots in (["someone-elses-chat"], [SLOT, "someone-elses-chat"])
        ]
        malformed = [
            await house.send("POST", RECONCILE, body)
            for body in (
                b"{}",
                b'{"slots":[]}',
                b'{"slots":"study-slot"}',
                b'{"slots":[7]}',
                b'{"slots":["study-slot","study-slot"]}',
                json.dumps({"slots": [f"slot-{index}" for index in range(9)]}).encode(),
                b'{"slots":["study-slot"],"limit":9999}',
            )
        ]
        return replies, malformed, before == house.log_bytes()

    replies, malformed, unchanged = serve(tmp_path, scenario, gateway=gateway)

    assert [reply.status for reply in replies] == [400, 400]
    assert all(reply.json["error"]["code"] == "invalid_envelope" for reply in replies)
    assert replies[1].json["diagnostics"] == [
        {"code": "unknown_session", "index": 1, "field": "slots", "reason": "unregistered_slot"}
    ]
    assert [reply.status for reply in malformed] == [400] * len(malformed)
    assert gateway.history_paths == []
    assert unchanged


def test_a_refused_token_is_refreshed_once_during_reconciliation(tmp_path):
    gateway = FakeGateway()
    gateway.refuse = 1
    gateway.histories[SLOT] = _history(
        [{"role": "user", "content": "hello", "ts": IN_RUN_TS, "meta": {"mid": "m-1"}}]
    )

    async def scenario(house: House):
        await house.register()
        return await house.send("POST", RECONCILE, json.dumps({"slots": [SLOT]}).encode())

    reply = serve(tmp_path, scenario, gateway=gateway)

    assert reply.status == 200
    assert len(gateway.issued) == 2
    assert len(gateway.history_paths) == 2
    assert reply.json["slots"][0]["status"] == "recovered"
    assert [event["event_type"] for event in reply.json["events"]] == ["message_recorded"]
    for token in gateway.issued:
        assert token not in reply.text


def test_gateway_failures_leave_the_log_unchanged_and_report_unavailable(tmp_path):
    def attempt(gateway: FakeGateway | None, timeout: float = 5.0):
        async def scenario(house: House):
            await house.register()
            before = house.log_bytes()
            reply = await house.send(
                "POST", RECONCILE, json.dumps({"slots": [SLOT]}).encode()
            )
            return reply, before == house.log_bytes()

        return serve(tmp_path, scenario, gateway=gateway, history_timeout=timeout)

    slow = FakeGateway()
    slow.delay = 2.0
    denied = FakeGateway()
    denied.refuse = 9

    timed_out, unchanged_after_timeout = attempt(slow, timeout=0.05)
    refused, unchanged_after_denial = attempt(denied)
    no_reader, unchanged_without_reader = attempt(None)

    assert timed_out.json["slots"] == [
        {"slot": SLOT, "status": "history_unavailable", "reasons": ["gateway_timeout"]}
    ]
    assert refused.json["slots"][0]["reasons"] == ["gateway_denied"]
    assert no_reader.json["slots"][0]["reasons"] == ["history_reader_missing"]
    for reply in (timed_out, refused, no_reader):
        assert reply.status == 200
        assert reply.json["history_partial"] is True
        assert reply.json["events"] == []
        assert {"code": "history_partial"} in reply.json["diagnostics"]
        assert "token" not in reply.text
    assert unchanged_after_timeout and unchanged_after_denial and unchanged_without_reader


def test_history_tokens_and_secrets_never_reach_the_log_or_response(tmp_path):
    gateway = FakeGateway()
    planted = "sk-" + "planted" + secrets.token_hex(6)

    async def scenario(house: House):
        await house.register()
        # Prime the client's token, then echo it back inside the history.
        await house.send("POST", RECONCILE, json.dumps({"slots": [SLOT]}).encode())
        gateway.histories[SLOT] = _history(
            [
                {
                    "role": "assistant",
                    "content": f"saw {gateway.issued[-1]} and {planted} and {KEY}",
                    "ts": IN_RUN_TS,
                    "meta": {"mid": "m-1"},
                }
            ]
        )
        reply = await house.send("POST", RECONCILE, json.dumps({"slots": [SLOT]}).encode())
        return reply, house.log_bytes().decode("utf-8")

    reply, raw = serve(tmp_path, scenario, gateway=gateway, known_secrets=(planted,))

    assert reply.status == 200
    assert reply.json["events"][0]["payload"]["content"] == (
        "saw [redacted] and [redacted] and [redacted]"
    )
    for surface in (reply.text, raw):
        assert planted not in surface
        assert KEY not in surface
        assert all(token not in surface for token in gateway.issued)
