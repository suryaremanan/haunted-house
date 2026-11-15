"""The séance routes as `build_live_app` wires them, over temporary roots.

Uses the real Mansion service, registry and filesystem adapter as the
Mansion gate, the real `SeanceLogStore`, and `live_seance_service`.  A Mansion
is created through the signed Mansion_API, a backend producer registers a Run
through the writer, and the browser path then ingests, reads and reconciles.
No real Crew gateway or Mansion root is used.

Validates: Requirements 9.5–9.7, 11.1, 11.2, 12.1, 12.2.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from aiohttp.test_utils import TestClient, TestServer

from haunted_house import server
from haunted_house.adapters.seance_log_store import SeanceLogStore
from haunted_house.adapters.settings import Settings
from haunted_house.core.proxy_signature import sign
from haunted_house.core.seance_event import AppEventCandidate, EventScope, EventSource
from haunted_house.mansion_routes import live_mansion_service
from haunted_house.seance_routes import live_seance_service, mansion_service_gate
from haunted_house.server import PROXY_HEADER, build_app, build_live_app

KEY = "k3y-for-tests"  # short on purpose: not a real credential
NOW = 1_731_400_000
NAME = "weather-station"
SLOT = "study-slot"


def _settings(tmp_path: Path) -> tuple[Settings, Path]:
    approved = tmp_path / "home" / "workspace"
    approved.mkdir(parents=True)
    app_root = tmp_path / "crew" / "apps" / "haunted-house"
    (app_root / "data").mkdir(parents=True)
    (app_root / "app.json").write_text("{}", encoding="utf-8")
    settings = Settings(
        port=1,
        secret=KEY,
        gateway_origin=None,
        app_name="haunted-house",
        mansion_root=approved / "haunted-house" / "mansions",
        approved_roots=(approved,),
    )
    return settings, app_root


def _run_started(mansion_id: str) -> AppEventCandidate:
    return AppEventCandidate(
        schema_version=1,
        event_type="run_started",
        scope=EventScope(mansion_id, "archivist", SLOT, "requirements-1", 1),
        source=EventSource("house", "run", ("requirements-1",), 0, "", 0),
        caused_by=(),
        occurred_at_ms=None,
        payload={"reason": "assigned"},
    )


async def _send(client: TestClient, method: str, path: str, body: Any = None):
    raw = b"" if body is None else json.dumps(body).encode()
    headers = {PROXY_HEADER: sign(KEY, NOW, method, path, raw)}
    if body is not None:
        headers["Content-Type"] = "application/json"
    async with client.request(method, path, headers=headers, data=raw or None) as response:
        return response.status, await response.json()


def test_registered_mansions_ingest_and_read_through_the_live_wiring(tmp_path):
    settings, app_root = _settings(tmp_path)
    mansions = live_mansion_service(settings, app_root=app_root)
    app = build_app(
        settings,
        clock=lambda: NOW,
        mansion_service=mansions,
        seance_service=live_seance_service(settings, lambda: None),
        seance_mansion_gate=mansion_service_gate(mansions),
    )
    events_path = f"/api/mansions/{NAME}/seance/events"
    ingest_path = f"/api/mansions/{NAME}/seance/ingest"
    chunk = {
        "type": "chat_chunk",
        "data": {"slot": SLOT, "content": f"proxy {KEY}", "seq": 1, "gen": "g"},
    }

    async def scenario():
        async with TestClient(TestServer(app)) as client:
            before_create = await _send(client, "GET", events_path)
            created = await _send(client, "POST", "/api/mansions", {"name": NAME})
            no_log = await _send(client, "GET", events_path)
            early = await _send(client, "POST", ingest_path, {"envelopes": [chunk]})

            # A backend producer registers the Run through the one writer.
            producer = SeanceLogStore(settings.mansion_root, known_secrets=[KEY])
            started = await producer.append_candidates(NAME, [_run_started(NAME)])

            ingested = await _send(client, "POST", ingest_path, {"envelopes": [chunk]})
            page = await _send(client, "GET", events_path + "?after_sequence=0&limit=10")
            reconciled = await _send(
                client,
                "POST",
                f"/api/mansions/{NAME}/seance/reconcile",
                {"slots": [SLOT]},
            )

            # A directory under the root that the registry does not know.
            (settings.mansion_root / "squatter").mkdir()
            await producer.append_candidates("squatter", [_run_started("squatter")])
            squatter = await _send(client, "GET", "/api/mansions/squatter/seance/events")
            return (
                before_create,
                created,
                no_log,
                early,
                started,
                ingested,
                page,
                reconciled,
                squatter,
            )

    (
        before_create,
        created,
        no_log,
        early,
        started,
        ingested,
        page,
        reconciled,
        squatter,
    ) = asyncio.run(scenario())

    assert before_create[0] == 404
    assert before_create[1]["error"]["code"] == "mansion_not_found"
    assert created[0] == 201
    assert no_log[0] == 404
    assert set(no_log[1]) == {"error"}
    assert no_log[1]["error"]["code"] == "log_not_found"
    assert early[0] == 404 and early[1]["error"]["code"] == "log_not_found"
    assert started.status == "ok"

    assert ingested[0] == 200
    (event,) = ingested[1]["events"]
    assert event["sequence"] == 2
    assert event["scope"]["mansion_id"] == NAME
    assert event["payload"]["content"] == "proxy [redacted]"
    assert page[0] == 200
    assert [item["sequence"] for item in page[1]["events"]] == [1, 2]
    assert page[1]["events"][1] == event
    assert page[1]["integrity"] == "ok"

    # No gateway client is running: nothing is read and nothing is invented.
    assert reconciled[0] == 200
    assert reconciled[1]["history_partial"] is True
    assert reconciled[1]["slots"] == [
        {"slot": SLOT, "status": "history_unavailable", "reasons": ["gateway_unreachable"]}
    ]
    assert reconciled[1]["events"] == []

    # Registration decides, not the existence of a directory with a log.
    assert squatter[0] == 404
    assert squatter[1]["error"]["code"] == "mansion_not_found"

    log = settings.mansion_root / NAME / ".haunted-house" / "seance"
    assert [path.name for path in log.iterdir()] == ["events.v1." + "jsonl"]
    assert KEY not in (log / ("events.v1." + "jsonl")).read_text(encoding="utf-8")


def test_an_unavailable_registry_refuses_instead_of_bypassing_the_gate(tmp_path):
    settings, app_root = _settings(tmp_path)
    (settings.mansion_root / NAME).mkdir(parents=True)
    # No app-data directory: the Mansion service cannot be built.
    missing_app_root = tmp_path / "crew" / "apps" / "absent"
    mansions = live_mansion_service(settings, app_root=missing_app_root)
    app = build_app(
        settings,
        clock=lambda: NOW,
        seance_service=live_seance_service(settings, lambda: None),
        seance_mansion_gate=mansion_service_gate(mansions),
    )
    del app_root

    async def scenario():
        async with TestClient(TestServer(app)) as client:
            return await _send(client, "GET", f"/api/mansions/{NAME}/seance/events")

    status, body = asyncio.run(scenario())

    assert status == 503
    assert body["error"]["code"] == "seance_unavailable"
    assert list((settings.mansion_root / NAME).iterdir()) == []


def test_build_live_app_registers_exactly_the_three_seance_routes(tmp_path, monkeypatch):
    settings, app_root = _settings(tmp_path)
    monkeypatch.chdir(app_root)
    manifest = tmp_path / "app.json"
    manifest.write_text(
        json.dumps({"permissions": {"api": ["/api/version", "/api/chat/*"]}}),
        encoding="utf-8",
    )

    app = build_live_app(settings, manifest_path=manifest, clock=lambda: NOW)

    seance = sorted(
        (route.method, route.resource.canonical)
        for route in app.router.routes()
        if "/seance/" in route.resource.canonical
    )
    assert seance == [
        ("GET", "/api/mansions/{mansion_id}/seance/events"),
        ("POST", "/api/mansions/{mansion_id}/seance/ingest"),
        ("POST", "/api/mansions/{mansion_id}/seance/reconcile"),
    ]
    assert server.register_seance_routes is not None

    async def scenario():
        async with TestClient(TestServer(app)) as client:
            unsigned = await client.get(f"/api/mansions/{NAME}/seance/events")
            signed = await _send(client, "GET", f"/api/mansions/{NAME}/seance/events")
            return unsigned.status, signed

    unsigned_status, signed = asyncio.run(scenario())

    assert unsigned_status == 401
    # Signed, but the Mansion is not registered in this temporary registry.
    assert signed[0] == 404
    assert signed[1]["error"]["code"] == "mansion_not_found"
