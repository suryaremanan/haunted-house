"""The Room Ghosts routes and lifecycle end to end (room-ghosts tasks 8.1,
8.2, 8.3).

Everything real except Crew: the signed HTTP application with the Spec 2,
Spec 4, and Room Ghosts routes, the file writer and ingest route, the
WorkflowService wired with the Room Ghosts seams, the room gate with task
claims required, and the shipped room MCP server as its own stdio process
from an installed-app copy.  The test plays the Operator's browser (signed
requests, raw frame forwarding) and the Ghosts (MCP tool calls).

Validates: Requirements 3.8, 5.6, 5.7, 6.6, 6.7, 7.9, 7.10, 8.1, 9.2, 9.3,
10.4, 10.5, 10.7, 10.8, 10.9, 11.1, 12.1, 12.3, 12.4, 12.5, 12.6, 15.2.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from aiohttp.test_utils import TestClient, TestServer

from haunted_house import room_ghost_routes
from haunted_house.adapters.room_tool_service import RoomToolService
from haunted_house.adapters.settings import Settings
from haunted_house.core.guardrail_events import Phase
from haunted_house.room_gate import RoomGate
from haunted_house.core.proxy_signature import sign
from haunted_house.server import PROXY_HEADER, build_app
from haunted_house.services.contracts import ContractStatus
from tests.integration.test_guarded_workflow import BASE, NOW, Stage
from tests.room_ghost_runtime_support import DESIGN, REQUIREMENTS, WORKSHOP_TASKS, chat_done, sha256_text
from tests.room_ghost_stage import DOCUMENT, result_text
from tests.room_mcp_support import install_app
from tests.room_projection_contract import refusal_path
from tests.workflow_support import APP, APP_KEY, MANSION, SPEC, house

ROOMS = f"{BASE}/specs/{SPEC}"
ROLE = {Phase.REQUIREMENTS: "archivist", Phase.DESIGN: "draughtsman", Phase.TASKS: "foreman"}


class RoomStage(Stage):
    """The guarded-workflow stage plus the Room Ghosts routes."""

    turn = 0

    async def room(self) -> dict:
        status, body = await self.send("GET", f"{ROOMS}/room-ghosts")
        assert status == 200, body
        assert refusal_path(body, MANSION, SPEC) is None, refusal_path(body, MANSION, SPEC)
        workflow = await self.workflow()
        # The same canonical Sequence as the workflow projection at this instant.
        assert body["version"] == workflow["version"]
        return body

    async def post(self, path: str, **body: Any) -> tuple[int, Any]:
        body.setdefault("command_id", self.command_id())
        if "expected_version" not in body:
            body["expected_version"] = (await self.workflow())["version"]
        return await self.send("POST", path, body)

    async def session(self, phase: Phase):
        facts = self.h.rooms.ghosts.facts(await self.h.port.read(MANSION))
        run = facts.latest_phase_run(phase)
        return self.h.binding(run.scope.session_slot)

    async def ghost_for(self, room, role: str):
        ghost = self.launch(role, f"dashboard:{room.slot}")
        await asyncio.to_thread(ghost.initialize)
        return ghost

    async def turn_ended(self, slot: str) -> None:
        RoomStage.turn += 1
        await self.forward(chat_done(slot, turn=RoomStage.turn, generation=f"gen-{RoomStage.turn}"))

    async def deliver(self, phase: Phase, text: str) -> None:
        """A spec Ghost writes its document over MCP, answers, and its turn ends."""

        room = await self.session(phase)
        ghost = await self.ghost_for(room, ROLE[phase])
        known = self.h.service  # noqa: F841 - the revision comes from the tool itself
        revision = 0
        while True:
            written = await self.call(
                ghost, "write_spec_document", {"content": text, "expected_revision": revision}
            )
            if written["ok"]:
                break
            assert written["code"] == "conflict", written
            revision = written["current_revision"]
        self.h.crew.answer(room.slot, result_text(room, {DOCUMENT[phase]: text}))
        await self.turn_ended(room.slot)
        await self.room()  # the dashboard re-reads: the house settles the turn

    async def pass_phase(self, phase: Phase, text: str) -> None:
        status, body = await self.start(phase)
        assert status == 200, body
        await self.deliver(phase, text)
        status, body = await self.decide_door(phase)
        assert status == 200, body


def _play(tmp_path: Path, scenario, **options):
    async def go():
        app_root = tmp_path / "crew-home" / "apps" / "haunted-house"
        if not app_root.exists():  # a second run over the same directory is a restart
            install_app(app_root)
        async with house(tmp_path / "work", data_dir=app_root / "data", room_ghosts=options or True) as h:
            rooms = RoomToolService(h.port, h.root, operations=h.service, require_task_claims=True)
            gate = RoomGate(rooms, h.bindings)
            await gate.start()
            settings = Settings(port=1, secret=APP_KEY, gateway_origin=None, app_name=APP)
            app = build_app(
                settings, clock=lambda: NOW, workflow_service=h.service, seance_service=h.seance,
                room_ghosts=h.rooms,
            )
            async with TestClient(TestServer(app)) as client:
                stage = RoomStage(h, client, app_root, tmp_path)
                try:
                    return await scenario(stage)
                finally:
                    stage.close()
                    await gate.stop()

    return asyncio.run(go())


def test_the_read_route_is_signed_strict_and_starts_empty(tmp_path):
    async def scenario(stage: RoomStage):
        async with stage.client.get(f"{ROOMS}/room-ghosts") as unsigned:
            refused = unsigned.status, await unsigned.json()
        empty = await stage.room()
        answers = [
            await stage.send("GET", f"{BASE}/specs/another-spec/room-ghosts"),
            await stage.send("GET", f"{BASE}/specs/Bad_Spec/room-ghosts"),
            await stage.send("GET", "/api/mansions/other-mansion/specs/demo-feature/room-ghosts"),
            await stage.send("GET", "/api/mansions/BAD/specs/demo-feature/room-ghosts"),
        ]
        target = f"{ROOMS}/room-ghosts"
        async with stage.client.post(
            target, data=b"{}",
            headers={PROXY_HEADER: sign(APP_KEY, NOW, "POST", target, b"{}"), "Content-Type": "application/json"},
        ) as wrong_method:
            answers.append((wrong_method.status, {}))
        return refused, empty, answers, await stage.h.events(), stage.h.crew.calls

    refused, empty, answers, events, calls = _play(tmp_path, scenario)
    assert refused == (401, {"error": "bad_proxy_signature"})
    assert empty["version"] == 0 and empty["runs"] == [] and empty["task_plan"] is None
    assert empty["seance_enabled"] is False and empty["review"] is None
    assert [doc["artifact"] for doc in empty["documents"]] == [None, None, None]
    assert [(status, body.get("error", {}).get("code")) for status, body in answers[:4]] == [
        (404, "spec_not_found"), (400, "invalid_request"), (404, "mansion_not_found"),
        (400, "invalid_mansion_id"),
    ]
    assert answers[4][0] == 405
    # Reading wrote nothing and called nobody.
    assert events == () and calls == []


def test_invalid_commands_are_refused_before_any_service_runs(tmp_path):
    async def scenario(stage: RoomStage):
        good = {"command_id": "cmd-room-00000001", "expected_version": 0}
        cases = [
            (f"{ROOMS}/feedback", {**good, "phase": "requirements"}),                       # missing field
            (f"{ROOMS}/feedback", {**good, "phase": "implementation", "feedback": "x"}),   # no such room document
            (f"{ROOMS}/feedback", {**good, "phase": "requirements", "feedback": "   "}),
            (f"{ROOMS}/feedback", {**good, "phase": "requirements", "feedback": "x" * 4097}),
            (f"{ROOMS}/feedback", {**good, "phase": "requirements", "feedback": "bell\x07"}),
            (f"{ROOMS}/feedback", {**good, "phase": "requirements", "feedback": "x", "approve": True}),
            (f"{ROOMS}/feedback", {"command_id": "short", "expected_version": 0, "phase": "design", "feedback": "x"}),
            (f"{ROOMS}/feedback", {**good, "expected_version": True, "phase": "design", "feedback": "x"}),
            (f"{ROOMS}/workshop/start", {**good, "task_ids": []}),
            (f"{ROOMS}/workshop/start", {**good, "task_ids": ["1.1", "1.1"]}),
            (f"{ROOMS}/workshop/start", {**good, "task_ids": ["../etc"]}),
            (f"{ROOMS}/workshop/start", {**good, "task_ids": "1.1"}),
            ("/api/room-ghosts/runs/requirements-1/cancel", good),                          # no mansion
            ("/api/room-ghosts/runs/requirements-1/retry", {**good, "mansion_id": "BAD"}),
            ("/api/room-ghosts/runs/bad%20run/retry", {**good, "mansion_id": MANSION}),
        ]
        answers = [await stage.send("POST", path, body) for path, body in cases]
        raw = b'{"command_id":"cmd-room-00000001","command_id":"cmd-room-00000002","expected_version":0,"mansion_id":"demo-mansion"}'
        target = "/api/room-ghosts/runs/requirements-1/retry"
        async with stage.client.post(
            target, data=raw,
            headers={PROXY_HEADER: sign(APP_KEY, NOW, "POST", target, raw), "Content-Type": "application/json"},
        ) as duplicate:
            answers.append((duplicate.status, await duplicate.json()))
        target = "/api/room-ghosts/runs/requirements-1/approve"
        raw = json.dumps({**good, "mansion_id": MANSION}).encode()
        async with stage.client.post(
            target, data=raw,
            headers={PROXY_HEADER: sign(APP_KEY, NOW, "POST", target, raw), "Content-Type": "application/json"},
        ) as no_such_command:
            unknown = (no_such_command.status, None)
        return answers, unknown, await stage.h.events(), stage.h.crew.calls

    answers, unknown, events, calls = _play(tmp_path, scenario)
    assert [status for status, _body in answers] == [400] * len(answers)
    codes = {body["error"]["code"] for _status, body in answers}
    assert codes <= {"invalid_request", "invalid_mansion_id"}
    # No rejected value is echoed back.
    assert not any("bell" in json.dumps(body) or "../etc" in json.dumps(body) for _s, body in answers)
    assert unknown[0] == 404
    assert events == () and calls == []


def test_room_ghosts_adds_no_approval_or_state_route():
    paths = [
        room_ghost_routes.ROOM_GHOSTS_PATH, room_ghost_routes.FEEDBACK_PATH,
        room_ghost_routes.WORKSHOP_START_PATH, room_ghost_routes.RUN_COMMAND_PATH,
    ]
    from aiohttp import web

    app = web.Application()
    room_ghost_routes.register_room_ghost_routes(app, lambda: None)
    registered = sorted((route.method, route.resource.canonical) for route in app.router.routes())
    assert registered == sorted(
        [("GET", paths[0]), ("POST", paths[1]), ("POST", paths[2]), ("POST", paths[3])]
    )
    for path in paths:
        assert not any(word in path for word in ("approve", "approval", "door", "workflow", "phases", "spawn"))


def test_the_study_through_the_signed_routes_and_the_mcp_server(tmp_path):
    bad = "# Requirements Document\n\nNothing testable here.\n"
    revised = REQUIREMENTS + "\n<!-- revised after feedback -->\n"

    async def scenario(stage: RoomStage):
        h = stage.h
        notes: dict[str, Any] = {}
        status, body = await stage.start(Phase.REQUIREMENTS)
        assert status == 200, body
        room = await stage.session(Phase.REQUIREMENTS)
        notes["prompt"] = h.crew.slots[room.slot]["turns"][0]
        ghost = await stage.ghost_for(room, "archivist")
        notes["tools"] = await stage.tools(ghost)

        # A Ghost that submits by itself opens no Door on an invalid artifact.
        written = await stage.call(ghost, "write_spec_document", {"content": bad, "expected_revision": 0})
        assert written["ok"], written
        notes["direct_submit"] = await stage.call(ghost, "submit_phase_output")
        notes["door_after_direct_submit"] = (await stage.workflow())["phases"][0]["door"]
        # Feedback while the run is active is refused; nothing is recorded.
        notes["busy"] = await stage.post(f"{ROOMS}/feedback", phase="requirements", feedback="Hurry up.")

        # The valid document goes through the house: turn end, validation, proposal.
        written = await stage.call(ghost, "write_spec_document", {"content": REQUIREMENTS, "expected_revision": 1})
        assert written["ok"], written
        h.crew.answer(room.slot, result_text(room, {DOCUMENT[Phase.REQUIREMENTS]: REQUIREMENTS}, summary="Six criteria."))
        notes["before_turn_end"] = await stage.room()
        await stage.turn_ended(room.slot)
        notes["settled"] = await stage.room()
        notes["waiting"] = (await stage.workflow())["phases"][0]

        # Revision feedback before approval: stale, then accepted, then idempotent.
        notes["stale"] = await stage.post(f"{ROOMS}/feedback", phase="requirements", feedback="x", expected_version=1)
        version = (await stage.workflow())["version"]
        feedback = {"phase": "requirements", "feedback": "Cap the list at 500 entries.",
                    "command_id": "cmd-feedback-000001", "expected_version": version}
        notes["accepted"] = await stage.post(f"{ROOMS}/feedback", **feedback)
        notes["repeated"] = await stage.post(f"{ROOMS}/feedback", **feedback)
        notes["conflict"] = await stage.post(f"{ROOMS}/feedback", **{**feedback, "feedback": "Something else."})
        notes["resealed"] = (await stage.workflow())["phases"][0]
        notes["turns"] = list(h.crew.slots[room.slot]["turns"])
        revision = await stage.session(Phase.REQUIREMENTS)
        written = await stage.call(ghost, "write_spec_document", {"content": revised, "expected_revision": 2})
        assert written["ok"], written
        h.crew.answer(room.slot, result_text(revision, {DOCUMENT[Phase.REQUIREMENTS]: revised}))
        await stage.turn_ended(room.slot)
        notes["revised"] = await stage.room()
        status, body = await stage.decide_door(Phase.REQUIREMENTS)
        assert status == 200, body
        notes["late"] = await stage.post(f"{ROOMS}/feedback", phase="requirements", feedback="Too late.")
        notes["final"] = await stage.room()
        notes["bodies"] = json.dumps([notes[key] for key in ("settled", "revised", "final", "accepted", "busy")])
        notes["steps"] = h.crew.steps()
        notes["capability"] = room.capability
        return notes

    notes = _play(tmp_path, scenario)
    assert notes["prompt"].startswith('<room-skill name="ears-requirements">')
    assert set(notes["tools"]) == {"list_room_files", "read_room_file", "write_spec_document", "submit_phase_output"}
    assert notes["direct_submit"]["ok"] is False and notes["direct_submit"]["code"] == "artifact_invalid"
    assert notes["door_after_direct_submit"] == {"status": "sealed", "proposal": None}
    assert notes["busy"][0] == 409 and notes["busy"][1]["error"]["code"] == "run_active"
    # No successful room state before the validated terminal event.
    assert notes["before_turn_end"]["runs"][0]["summary"] is None
    assert notes["before_turn_end"]["documents"][0]["artifact"]["validated"] is True
    settled = notes["settled"]["runs"][0]
    assert settled["summary"] == "Six criteria." and settled["reason_code"] is None
    assert notes["waiting"]["status"] == "waiting" and notes["waiting"]["door"]["status"] == "waiting"
    assert notes["stale"][0] == 409 and notes["stale"][1]["error"]["code"] == "stale_version"
    status, accepted = notes["accepted"]
    assert status == 202 and accepted == {
        "accepted": True, "command_id": "cmd-feedback-000001", "version": accepted["version"],
        "run_id": "requirements-2", "duplicate": False,
    }
    assert notes["repeated"][0] == 202 and notes["repeated"][1]["duplicate"] is True
    assert notes["conflict"][0] == 409 and notes["conflict"][1]["error"]["code"] == "command_conflict"
    assert notes["resealed"]["status"] == "working" and notes["resealed"]["door"]["status"] == "sealed"
    assert len(notes["turns"]) == 2 and "Cap the list at 500 entries." in notes["turns"][1]
    assert [run["run_id"] for run in notes["revised"]["runs"]] == ["requirements-1", "requirements-2"]
    assert notes["revised"]["documents"][0]["artifact"]["artifact_revision"]["revision"] == 3
    assert notes["late"][0] == 409 and notes["late"][1]["error"]["code"] == "invalid_state"
    assert notes["final"]["runs"][-1]["can_retry"] is False
    # One session for the whole Study, and nothing but the S6 chat routes.
    assert notes["steps"].count("create_slot") == 1 and notes["steps"].count("send_turn") == 2
    # Responses carry no credential, capability, or host path.
    assert APP_KEY not in notes["bodies"] and notes["capability"] not in notes["bodies"]
    assert str(tmp_path) not in notes["bodies"] and "/Users/" not in notes["bodies"]


def test_the_workshop_through_the_signed_routes_and_the_mcp_server(tmp_path):
    async def scenario(stage: RoomStage):
        h = stage.h
        notes: dict[str, Any] = {}
        await stage.pass_phase(Phase.REQUIREMENTS, REQUIREMENTS)
        await stage.pass_phase(Phase.DESIGN, DESIGN)
        status, body = await stage.start(Phase.TASKS)
        assert status == 200, body
        await stage.deliver(Phase.TASKS, WORKSHOP_TASKS)
        notes["sealed"] = await stage.post(f"{ROOMS}/workshop/start", task_ids=["1.1"])
        status, body = await stage.decide_door(Phase.TASKS)
        assert status == 200, body
        notes["unknown_task"] = await stage.post(f"{ROOMS}/workshop/start", task_ids=["9.9"])
        start = {"task_ids": ["1.1", "1.2"], "command_id": "cmd-workshop-000001",
                 "expected_version": (await stage.workflow())["version"]}
        notes["started"] = await stage.post(f"{ROOMS}/workshop/start", **start)
        notes["repeated"] = await stage.post(f"{ROOMS}/workshop/start", **start)
        notes["room"] = await stage.room()
        tinkers = sorted(
            (item for item in (h.bindings.load(f"dashboard:{key}") for key in h.crew.slots)
             if item is not None and item.role == "tinker"),
            key=lambda item: item.ghost,
        )
        one, two = tinkers
        ghost = await stage.ghost_for(one, "tinker")
        notes["tools"] = await stage.tools(ghost)
        path = "src/guestbook/model.py"
        notes["outside"] = await stage.call(
            ghost, "write_room_file", {"path": "src/guestbook/store.py", "content": "x\n", "expected_sha256": None}
        )
        notes["no_digest"] = await stage.call(ghost, "write_room_file", {"path": path, "content": "x\n"})
        written = await stage.call(
            ghost, "write_room_file", {"path": path, "content": "class Entry: ...\n", "expected_sha256": None}
        )
        notes["written"] = written
        notes["tinker_submit"] = await stage.call(ghost, "submit_phase_output", {"path": path})
        # Recovery controls over HTTP.
        notes["cancel"] = await stage.post("/api/room-ghosts/runs/task-1-1-a1/cancel", mansion_id=MANSION)
        notes["retry_running"] = await stage.post("/api/room-ghosts/runs/task-1-1-a1/retry", mansion_id=MANSION)
        notes["retry_unknown"] = await stage.post("/api/room-ghosts/runs/task-9-9-a1/retry", mansion_id=MANSION)
        h.crew.answer(one.slot, result_text(one, {path: "class Entry: ...\n"}, task_id="1.1"))
        await stage.turn_ended(one.slot)
        notes["after_one"] = await stage.room()
        # The second Tinker reports failure: an explicit retry is offered and accepted.
        from haunted_house.core.ghost_result import GhostStatus

        h.crew.answer(two.slot, result_text(two, status=GhostStatus.FAILED, task_id="1.2", reason="tests_failed"))
        await stage.turn_ended(two.slot)
        notes["after_two"] = await stage.room()
        notes["retry"] = await stage.post("/api/room-ghosts/runs/task-1-2-a1/retry", mansion_id=MANSION)
        notes["after_retry"] = await stage.room()
        notes["workflow"] = await stage.workflow()
        notes["steps"] = h.crew.steps()
        notes["unknown"] = h.crew.unknown
        return notes

    notes = _play(tmp_path, scenario)
    assert notes["sealed"][0] == 409 and notes["sealed"][1]["error"]["code"] == "predecessor_door_sealed"
    assert notes["unknown_task"][0] == 409 and notes["unknown_task"][1]["error"]["code"] == "task_not_selectable"
    assert notes["started"][0] == 202 and notes["started"][1]["accepted"] is True
    assert notes["repeated"][0] == 202 and notes["repeated"][1]["duplicate"] is True
    tasks = {task["task_id"]: task for task in notes["room"]["task_plan"]["tasks"]}
    assert tasks["1.1"]["outcome"]["status"] == tasks["1.2"]["outcome"]["status"] == "active"
    assert tasks["1.3"]["selected"] is False and tasks["1.3"]["outcome"] is None
    runs = {run["run_id"]: run for run in notes["room"]["runs"] if run["phase"] == "implementation"}
    assert set(runs) == {"task-1-1-a1", "task-1-2-a1"}
    assert runs["task-1-1-a1"]["claim_paths"] == ["src/guestbook/model.py"]
    # The MCP gate refuses what the claim does not cover and requires a digest.
    assert "write_room_file" in notes["tools"]
    assert notes["outside"]["ok"] is False and notes["outside"]["code"] == "task_claim_denied"
    assert notes["no_digest"]["code"] == "expected_digest_required"
    assert notes["written"]["ok"] is True and notes["written"]["sha256"] == sha256_text("class Entry: ...\n")
    # A Tinker cannot propose the implementation Door for its one task.
    assert notes["tinker_submit"]["ok"] is False and notes["tinker_submit"]["code"] == "workshop_incomplete"
    # The shipped default: no cancellation contract, and nothing was sent to Crew.
    assert notes["cancel"][0] == 503 and notes["cancel"][1]["error"]["code"] == "contract_unavailable"
    assert "stop" not in notes["steps"]
    assert notes["retry_running"][0] == 409 and notes["retry_running"][1]["error"]["code"] == "run_active"
    assert notes["retry_unknown"][0] == 404 and notes["retry_unknown"][1]["error"]["code"] == "run_not_found"
    after = {task["task_id"]: task for task in notes["after_one"]["task_plan"]["tasks"]}
    assert after["1.1"]["complete"] is True and after["1.1"]["outcome"]["status"] == "complete"
    failed = {task["task_id"]: task for task in notes["after_two"]["task_plan"]["tasks"]}["1.2"]
    assert failed["outcome"]["status"] == "failed" and failed["outcome"]["reason_code"] == "tests_failed"
    offered = {run["run_id"]: run for run in notes["after_two"]["runs"]}["task-1-2-a1"]
    assert offered["can_retry"] is True, (offered, notes["after_two"]["task_plan"]["tasks"][1])
    assert notes["retry"][0] == 202
    retried = {task["task_id"]: task for task in notes["after_retry"]["task_plan"]["tasks"]}["1.2"]
    assert retried["outcome"] == {"status": "active", "attempt": 2, "run_id": "task-1-2-a2", "reason_code": None}
    # A Tinker never opened the implementation Door by itself.
    assert notes["workflow"]["phases"][3]["status"] == "working"
    assert notes["unknown"] == []


def test_a_restart_rebuilds_the_room_from_the_log_and_settles_what_was_left(tmp_path):
    async def before(stage: RoomStage):
        status, body = await stage.start(Phase.REQUIREMENTS)
        assert status == 200, body
        room = await stage.session(Phase.REQUIREMENTS)
        ghost = await stage.ghost_for(room, "archivist")
        written = await stage.call(ghost, "write_spec_document", {"content": REQUIREMENTS, "expected_revision": 0})
        assert written["ok"], written
        # The turn ends and is acknowledged, and the backend stops before settling it.
        await stage.turn_ended(room.slot)
        return room.slot, room.run_id, await stage.h.events()

    slot, run_id, events = _play(tmp_path, before)

    async def after(stage: RoomStage):
        h = stage.h
        # The restarted gateway double has no memory: rebuild the one session's history.
        h.crew.slots[slot] = {"create": {}, "project": None, "mode": None, "turns": []}
        h.crew.messages[slot] = [{"role": "user", "content": "assignment", "meta": {}}]
        room = h.binding(slot)
        h.crew.answer(slot, result_text(room, {DOCUMENT[Phase.REQUIREMENTS]: REQUIREMENTS}))
        first = await stage.room()
        second = await stage.room()
        from haunted_house.services.terminal_gate import terminal_outcome

        terminals = [terminal_outcome(event) for event in await h.events() if terminal_outcome(event)]
        return first, second, terminals, (await stage.workflow())["phases"][0], h.crew.steps()

    first, second, terminals, phase, steps = _play(tmp_path, after)
    assert not any(event.event_type.startswith("run_") and event.event_type != "run_started" for event in events)
    assert terminals == [("completed", "ready")]  # exactly one terminal fact, after the restart
    assert first["runs"] == second["runs"] and first["runs"][0]["run_id"] == run_id
    assert first["runs"][0]["reason_code"] is None and first["documents"][0]["artifact"]["validated"] is True
    assert phase["status"] == "waiting"
    # Recovery repeated no side effect: no session was created, no turn re-sent.
    assert "create_slot" not in steps and "send_turn" not in steps


def test_an_unavailable_prerequisite_contract_answers_503_and_starts_nothing(tmp_path):
    async def scenario(stage: RoomStage):
        missing = lambda: ContractStatus(False, ("core.seance_event.SCHEMA_VERSION==1",))  # noqa: E731
        stage.h.rooms.ghosts._contracts = missing  # noqa: SLF001 - simulate an incompatible prerequisite
        read = await stage.send("GET", f"{ROOMS}/room-ghosts")
        feedback = await stage.post(f"{ROOMS}/feedback", phase="requirements", feedback="x", expected_version=0)
        start = await stage.post(f"{ROOMS}/workshop/start", task_ids=["1.1"], expected_version=0)
        retry = await stage.post("/api/room-ghosts/runs/requirements-1/retry", mansion_id=MANSION, expected_version=0)
        phase = await stage.start(Phase.REQUIREMENTS)
        return read, feedback, start, retry, phase, stage.h.crew.steps(), (await stage.workflow())["phases"][0]

    read, feedback, start, retry, phase, steps, view = _play(tmp_path, scenario)
    for status, body in (read, feedback, start, retry):
        assert status == 503 and body["error"]["code"] == "contract_unavailable"
    # The Spec 4 start failed closed too: a slot may exist, but no turn was sent.
    assert phase[0] != 200 and "send_turn" not in steps
    assert view["status"] == "failed"
