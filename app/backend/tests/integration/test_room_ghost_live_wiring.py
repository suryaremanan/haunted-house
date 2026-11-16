"""Room Ghosts as `build_live_app` wires it (room-ghosts task 8.2).

Uses `live_workflow` over the real Mansion registry, the real Spec 2 writer,
the room gate, and the binding store under a temporary installed-app root.
No Crew gateway exists here, so nothing can start; the point is the wiring:
the same one writer, the Room Ghosts seams on the WorkflowService, task
claims required by the room gate, the background pump inside the application
lifecycle, and the unverified contracts off by default.

Validates: Requirements 3.1, 3.5, 10.1, 10.8, 10.12, 12.8.
"""

from __future__ import annotations

import ast
import asyncio
import inspect
import json
from pathlib import Path
from typing import Any

from aiohttp.test_utils import TestClient, TestServer

from haunted_house import room_ghost_routes, room_ghost_wiring, server, workflow_wiring
from haunted_house.adapters import workflow_service
from haunted_house.adapters.command_runner import ConfinedRunner
from haunted_house.adapters.settings import Settings
from haunted_house.core.proxy_signature import sign
from haunted_house.mansion_routes import live_mansion_service
from haunted_house.room_ghost_wiring import RoomGhostOptions
from haunted_house.seance_routes import live_seance_service, mansion_service_gate
from haunted_house.server import PROXY_HEADER, build_app, build_live_app
from haunted_house.workflow_wiring import live_workflow
from tests.room_projection_contract import refusal_path

KEY = "k3y-for-tests"  # short on purpose: not a real credential
NOW = 1_731_400_000
NAME = "weather-station"
PACKAGE = Path(room_ghost_wiring.__file__).resolve().parent


def _settings(tmp_path: Path) -> tuple[Settings, Path]:
    approved = tmp_path / "home" / "workspace"
    approved.mkdir(parents=True)
    app_root = tmp_path / "crew" / "apps" / "haunted-house"
    (app_root / "data").mkdir(parents=True)
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


def _app(settings: Settings, app_root: Path):
    mansions = live_mansion_service(settings, app_root=app_root)
    seance = live_seance_service(settings, lambda: None)
    workflow = live_workflow(
        settings, gateway=lambda: None, mansions=mansions, seance=seance,
        app_root=app_root, runner=ConfinedRunner(platform="none"),
    )
    app = build_app(
        settings, clock=lambda: NOW, mansion_service=mansions, seance_service=seance,
        seance_mansion_gate=mansion_service_gate(mansions), workflow_service=workflow.provider,
        room_ghosts=workflow.room_ghosts,
    )
    app.cleanup_ctx.append(workflow.lifecycle)
    return app, workflow


def test_the_live_wiring_serves_room_ghosts_with_unverified_contracts_off(tmp_path):
    settings, app_root = _settings(tmp_path)
    app, workflow = _app(settings, app_root)

    async def scenario():
        async with TestClient(TestServer(app)) as client:
            rooms = workflow.room_ghosts()
            running = rooms._loop is not None and not rooms._loop.done()  # noqa: SLF001
            created = await _send(client, "POST", "/api/mansions", {"name": NAME})
            base = f"/api/mansions/{NAME}/specs/{NAME}"
            read = await _send(client, "GET", f"{base}/room-ghosts")
            wrong = await _send(client, "GET", f"/api/mansions/{NAME}/specs/another/room-ghosts")
            command = {"command_id": "cmd-live-0001", "expected_version": 0}
            cancel = await _send(client, "POST", "/api/room-ghosts/runs/requirements-1/cancel",
                                 {**command, "mansion_id": NAME})
            start = await _send(client, "POST", f"{base}/workshop/start", {**command, "task_ids": ["1.1"]})
            # No gateway: the Spec 4 start goes through the Room Ghosts prompt
            # seam and fails closed before any turn exists.
            phase = await _send(client, "POST", f"/api/mansions/{NAME}/phases/requirements/start", command)
            events = await _send(client, "GET", f"/api/mansions/{NAME}/seance/events")
            workflow_view = await _send(client, "GET", f"/api/mansions/{NAME}/workflow")
            after = await _send(client, "GET", f"{base}/room-ghosts")
            return rooms, running, created, read, wrong, cancel, start, phase, events, workflow_view, after

    (rooms, running, created, read, wrong, cancel, start, phase, events, workflow_view,
     after) = asyncio.run(scenario())
    assert created[0] in (200, 201)
    assert running is True
    assert rooms._loop is None  # noqa: SLF001 - the pump stopped with the application
    assert rooms.cancellation.enabled is False and not rooms.cancellation.pending()
    assert read[0] == 200 and refusal_path(read[1], NAME, NAME) is None
    assert read[1]["seance_enabled"] is False and read[1]["review"] is None and read[1]["runs"] == []
    assert wrong[0] == 404 and wrong[1]["error"]["code"] == "spec_not_found"
    assert cancel[0] == 503 and cancel[1]["error"]["code"] == "contract_unavailable"
    assert start[0] == 409 and start[1]["error"]["code"] == "predecessor_door_sealed"
    assert phase[0] == 502 and phase[1]["error"]["code"] == "crew_failed"
    kinds = [event["payload"].get("kind") for event in events[1]["events"]]
    assert kinds == ["phase_start_reserved", "phase_start_failed"]
    # One canonical Sequence for both projections.
    assert after[1]["version"] == workflow_view[1]["version"] == 2
    assert workflow.room_ghosts() is rooms and workflow.provider() is workflow.provider()
    files = sorted(path.name for path in (app_root / "data").iterdir())
    assert files == ["mansions-v1.json", "room-backend.json", "session-bindings"]


def test_without_a_verified_app_data_directory_room_ghosts_is_unavailable(tmp_path):
    settings, app_root = _settings(tmp_path)
    (app_root / "data").rmdir()
    app, workflow = _app(settings, app_root)

    async def scenario():
        async with TestClient(TestServer(app)) as client:
            return await _send(client, "GET", f"/api/mansions/{NAME}/specs/{NAME}/room-ghosts")

    status, body = asyncio.run(scenario())
    assert status == 503 and body["error"]["code"] == "room_ghosts_unavailable"
    assert workflow.room_ghosts() is None and not settings.mansion_root.exists()


def test_build_live_app_registers_the_room_ghost_routes(tmp_path, monkeypatch):
    settings, app_root = _settings(tmp_path)
    monkeypatch.chdir(app_root)
    app = build_live_app(settings, manifest_path=app_root / "app.json", clock=lambda: NOW)
    paths = {route.resource.canonical for route in app.router.routes()}
    assert {
        room_ghost_routes.ROOM_GHOSTS_PATH, room_ghost_routes.FEEDBACK_PATH,
        room_ghost_routes.WORKSHOP_START_PATH, room_ghost_routes.RUN_COMMAND_PATH,
    } <= paths
    # Still two cleanup contexts: Room Ghosts lives inside the workflow lifecycle.
    assert len(app.cleanup_ctx) == 2
    # Every Room Ghosts route sits under the app's own backend prefix.
    assert all(path.startswith("/api/") for path in paths if "room-ghosts" in path or "/specs/" in path)


def test_the_shipped_switches_keep_unverified_contracts_off():
    options = RoomGhostOptions()
    assert options.cancellation_enabled is False   # RG-S3 not verified live
    assert options.session_links_enabled is False  # RG-S4 not verified live
    assert options.seance_enabled is False         # stretch scope
    # With the Séance Room off there is no Medium agent to start a session with (14.7).
    assert "medium" not in workflow_service.DEFAULT_AGENTS
    assert "medium" not in workflow_service.ROLE_BY_PHASE.values()
    source = inspect.getsource(workflow_wiring)
    # The live wiring passes no switch of its own: the defaults are what ships.
    assert "cancellation_enabled=True" not in source and "session_links_enabled=True" not in source
    # Claims are required by the same wiring that builds the Workshop service.
    assert "require_task_claims=True" in source and "build_room_ghosts(" in source
    assert source.index("build_room_ghosts(") < source.index("require_task_claims=True")
    # The WorkflowService is built with the Spec 5 validator and all three seams.
    for seam in ("validator=seams.validator", "turns=seams.turns",
                 "implementation=seams.implementation", "on_launch_failure=seams.on_launch_failure"):
        assert seam in source


def test_room_ghosts_adds_no_store_normalizer_websocket_or_spawn():
    modules = [
        room_ghost_wiring, room_ghost_routes, workflow_wiring, server,
        *(PACKAGE / "services").glob("*.py"),
        PACKAGE / "core" / "room_runs.py", PACKAGE / "core" / "room_projection.py",
        PACKAGE / "core" / "run_recovery.py", PACKAGE / "core" / "review.py",
        PACKAGE / "core" / "room_ghost_requests.py",
    ]
    forbidden = {
        "ws_connect", "WebSocketResponse", "ClientWebSocketResponse", "normalize_crew_envelope",
        "parse_event_log", "build_app_event", "serialize_app_event", "prepare_candidates", "open",
    }
    for module in modules:
        source = module.read_text(encoding="utf-8") if isinstance(module, Path) else inspect.getsource(module)
        name = module.name if isinstance(module, Path) else module.__name__
        tree = ast.parse(source)
        names = {node.attr for node in ast.walk(tree) if isinstance(node, ast.Attribute)} | {
            node.id for node in ast.walk(tree) if isinstance(node, ast.Name)
        }
        assert not names & forbidden, (name, names & forbidden)
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                assert "/api/spawn" not in node.value or "never" in node.value.lower() or "no " in node.value.lower(), name
                assert "/api/approvals" not in node.value, name
    # One writer instance is shared by Spec 2 ingest, Spec 4, and Room Ghosts.
    assert inspect.getsource(workflow_wiring).count("SeanceLogStore(") == 1
    assert "SeanceLogStore" not in inspect.getsource(room_ghost_wiring)
