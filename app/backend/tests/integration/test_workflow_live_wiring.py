"""The workflow as `build_live_app` wires it (Doors and Guardrails task 16.1).

Uses `live_workflow` over the real Mansion registry, the real Spec 2 writer,
the room gate, and the binding store under a temporary installed-app root.
No Crew gateway exists here, so a phase start fails closed; the point is the
wiring: one writer, signed routes, a running room gate, a confinement canary,
and no fallback when the app-data directory is missing.

Validates: Requirements 6.9, 7.2, 8.1, 8.8, 10.1, 10.8, 11.7.
"""

from __future__ import annotations

import ast
import asyncio
import inspect
import json
from pathlib import Path
from typing import Any

from aiohttp.test_utils import TestClient, TestServer

from haunted_house import server, workflow_wiring
from haunted_house.adapters.command_runner import ConfinedRunner
from haunted_house.adapters.session_bindings import ENDPOINT_FILENAME, SessionBindingStore
from haunted_house.adapters.settings import Settings
from haunted_house.core.proxy_signature import sign
from haunted_house.mansion_routes import live_mansion_service
from haunted_house.seance_routes import live_seance_service, mansion_service_gate
from haunted_house.server import PROXY_HEADER, build_app, build_live_app
from haunted_house.workflow_wiring import live_workflow

KEY = "k3y-for-tests"  # short on purpose: not a real credential
NOW = 1_731_400_000
NAME = "weather-station"


def _settings(tmp_path: Path, *, with_data: bool = True) -> tuple[Settings, Path]:
    approved = tmp_path / "home" / "workspace"
    approved.mkdir(parents=True)
    app_root = tmp_path / "crew" / "apps" / "haunted-house"
    app_root.mkdir(parents=True)
    if with_data:
        (app_root / "data").mkdir()
    (app_root / "app.json").write_text("{}", encoding="utf-8")
    settings = Settings(
        port=1, secret=KEY, gateway_origin=None, app_name="haunted-house",
        mansion_root=approved / "haunted-house" / "mansions", approved_roots=(approved,),
    )
    return settings, app_root


async def _send(client: TestClient, method: str, path: str, body: Any = None):
    raw = b"" if body is None else json.dumps(body).encode()
    headers = {PROXY_HEADER: sign(KEY, NOW, method, path, raw)}
    if body is not None:
        headers["Content-Type"] = "application/json"
    async with client.request(method, path, headers=headers, data=raw or None) as response:
        return response.status, await response.json()


def _app(settings: Settings, app_root: Path, runner: ConfinedRunner):
    mansions = live_mansion_service(settings, app_root=app_root)
    seance = live_seance_service(settings, lambda: None)
    workflow = live_workflow(
        settings, gateway=lambda: None, mansions=mansions, seance=seance,
        app_root=app_root, runner=runner,
    )
    app = build_app(
        settings, clock=lambda: NOW, mansion_service=mansions, seance_service=seance,
        seance_mansion_gate=mansion_service_gate(mansions), workflow_service=workflow.provider,
    )
    app.cleanup_ctx.append(workflow.lifecycle)
    return app, workflow


def test_the_live_wiring_serves_the_workflow_and_starts_the_room_gate(tmp_path):
    settings, app_root = _settings(tmp_path)
    runner = ConfinedRunner(platform="none")  # no sandbox on this "host"
    app, workflow = _app(settings, app_root, runner)

    async def scenario():
        async with TestClient(TestServer(app)) as client:
            port = SessionBindingStore(app_root / "data").read_endpoint()
            unknown = await _send(client, "GET", f"/api/mansions/{NAME}/workflow")
            created = await _send(client, "POST", "/api/mansions", {"name": NAME})
            empty = await _send(client, "GET", f"/api/mansions/{NAME}/workflow")
            start = await _send(
                client, "POST", f"/api/mansions/{NAME}/phases/requirements/start",
                {"command_id": "cmd-live-0001", "expected_version": 0},
            )
            events = await _send(client, "GET", f"/api/mansions/{NAME}/seance/events")
            # The gate is a separate loopback listener and knows no such session.
            async with client.session.post(
                f"http://127.0.0.1:{port}/room/v1/session",
                headers={"X-HH-Session-Label": "dashboard:nobody", "X-HH-Room-Capability": "0" * 64},
                json={},
            ) as response:
                gate = (response.status, await response.json())
            return port, unknown, created, empty, start, events, gate
        
    port, unknown, created, empty, start, events, gate = asyncio.run(scenario())
    assert isinstance(port, int) and gate[0] == 401 and gate[1]["code"] == "blocked"
    assert unknown[0] == 404 and unknown[1]["error"]["code"] == "mansion_not_found"
    assert created[0] in (200, 201)
    assert empty[0] == 200 and empty[1]["mansion_id"] == NAME and empty[1]["version"] == 0
    # No gateway: the start is reserved, fails closed, and stays retryable.
    assert start[0] == 502 and start[1]["error"]["code"] == "crew_failed"
    assert start[1]["workflow"]["phases"][0]["status"] == "failed"
    # The same one log Spec 2 serves holds exactly the two domain records.
    kinds = [event["payload"].get("kind") for event in events[1]["events"]]
    assert kinds == ["phase_start_reserved", "phase_start_failed"]
    assert runner.available is False and workflow.provider() is workflow.provider()
    # After shutdown the endpoint record is still only an owner-only file.
    assert (app_root / "data" / ENDPOINT_FILENAME).stat().st_mode & 0o077 == 0
    files = sorted(path.name for path in (app_root / "data").iterdir())
    assert files == ["mansions-v1.json", "room-backend.json", "session-bindings"]


def test_without_a_verified_app_data_directory_nothing_is_served_or_written(tmp_path):
    settings, app_root = _settings(tmp_path, with_data=False)
    app, workflow = _app(settings, app_root, ConfinedRunner(platform="none"))

    async def scenario():
        async with TestClient(TestServer(app)) as client:
            return (
                await _send(client, "GET", f"/api/mansions/{NAME}/workflow"),
                await _send(
                    client, "POST", f"/api/mansions/{NAME}/phases/requirements/start",
                    {"command_id": "cmd-live-0001", "expected_version": 0},
                ),
            )

    read, start = asyncio.run(scenario())
    assert read[0] == start[0] == 503
    assert read[1]["error"]["code"] == start[1]["error"]["code"] == "workflow_unavailable"
    assert workflow.provider() is None
    assert sorted(path.name for path in app_root.iterdir()) == ["app.json"]
    assert not settings.mansion_root.exists()


def test_build_live_app_registers_the_workflow_routes_and_lifecycle(tmp_path, monkeypatch):
    settings, app_root = _settings(tmp_path)
    monkeypatch.chdir(app_root)  # Crew starts the backend in the app root
    app = build_live_app(settings, manifest_path=app_root / "app.json", clock=lambda: NOW)
    paths = {route.resource.canonical for route in app.router.routes()}
    assert {
        "/api/mansions/{mansion_id}/workflow",
        "/api/mansions/{mansion_id}/phases/{phase}/start",
        "/api/mansions/{mansion_id}/doors/{proposal_id}/{decision}",
        "/api/mansions/{mansion_id}/approvals/{proposal_id}/{decision}",
    } <= paths
    assert len(app.cleanup_ctx) == 2  # the gateway session and the workflow lifecycle


def test_the_wiring_adds_no_store_normalizer_or_websocket():
    for module in (workflow_wiring, server):
        tree = ast.parse(inspect.getsource(module))
        names = {node.attr for node in ast.walk(tree) if isinstance(node, ast.Attribute)} | {
            node.id for node in ast.walk(tree) if isinstance(node, ast.Name)
        }
        assert not names & {
            "ws_connect", "WebSocketResponse", "normalize_crew_envelope", "parse_event_log",
            "build_app_event", "serialize_app_event",
        }, module.__name__
    source = inspect.getsource(workflow_wiring)
    # One writer instance is shared by the API, the room gate, and the reconciler.
    assert source.count("SeanceLogStore(") == 1 and source.count("GuardrailPort(") == 1
