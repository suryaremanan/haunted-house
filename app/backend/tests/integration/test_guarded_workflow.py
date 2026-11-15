"""The guarded workflow end to end (Doors and Guardrails tasks 16.1, 16.2).

Everything real except Crew: the signed HTTP application, the Spec 2 file
writer and ingest route, the WorkflowService, the Session_Reconciler, the
room gate, and the room MCP server running as its own stdio process from an
installed-app copy.  A fake Crew gateway plays the S6 chat routes; the test
plays the Operator's browser (signed requests, raw frame forwarding) and the
Ghosts (MCP tool calls).

Validates: Requirements 1.3–1.7, 2.1–2.6, 3.2, 3.4–3.7, 3.9, 4.3, 4.5, 4.6,
5.1, 5.3, 5.8, 6.8, 6.9, 7.1, 7.6–7.9, 8.1, 10.1, 10.4, 10.7, 11.5–11.8,
12.1–12.3.
"""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Any

from aiohttp.test_utils import TestClient, TestServer
from yarl import URL

from haunted_house.adapters.room_tool_service import RoomToolService
from haunted_house.adapters.settings import Settings
from haunted_house.core.guardrail_events import PHASES, Phase
from haunted_house.core.proxy_signature import sign
from haunted_house.core.seance_log_parser import parse_event_log
from haunted_house.core.workflow_dto import workflow_projection_to_json
from haunted_house.core.workflow_projector import replay_projection
from haunted_house.room_gate import RoomGate
from haunted_house.server import PROXY_HEADER, build_app
from tests.room_mcp_support import McpClient, install_app
from tests.workflow_support import (
    APP,
    APP_KEY,
    MANSION,
    SPEC,
    TOOL,
    execution_input,
    house,
    pending_decision_frame,
    resolved_frame,
    tinker_delete,
)

NOW = 1_731_400_000
BASE = f"/api/mansions/{MANSION}"
ROLE = {
    Phase.REQUIREMENTS: "archivist",
    Phase.DESIGN: "draughtsman",
    Phase.TASKS: "foreman",
    Phase.IMPLEMENTATION: "tinker",
}
DOCUMENT_BODY = "The ghosts SHALL keep this sentence out of the log."


class Stage:
    """The Operator's browser and the Ghosts' MCP processes for one house."""

    def __init__(self, h, client: TestClient, app_root: Path, tmp: Path) -> None:
        self.h = h
        self.client = client
        self.app_root = app_root
        self.tmp = tmp
        self.ghosts: list[McpClient] = []
        self._n = 0

    # --- the Operator's browser --------------------------------------------------

    async def send(self, method: str, target: str, body: Any = None) -> tuple[int, Any]:
        data = b"" if body is None else json.dumps(body).encode()
        headers = {PROXY_HEADER: sign(APP_KEY, NOW, method, target, data)}
        if method != "GET":
            headers["Content-Type"] = "application/json"
        async with self.client.request(
            method, URL(target, encoded=True), headers=headers, data=data
        ) as response:
            return response.status, json.loads(await response.text())

    async def workflow(self) -> dict:
        status, body = await self.send("GET", f"{BASE}/workflow")
        assert status == 200, body
        return body

    def command_id(self) -> str:
        self._n += 1
        return f"cmd-e2e-{self._n:05d}"

    async def start(self, phase: Phase) -> tuple[int, Any]:
        version = (await self.workflow())["version"]
        return await self.send(
            "POST", f"{BASE}/phases/{phase.value}/start",
            {"command_id": self.command_id(), "expected_version": version},
        )

    async def decide_door(self, phase: Phase, verb: str = "approve", **change) -> tuple[int, Any]:
        workflow = await self.workflow()
        proposal = workflow["phases"][PHASES.index(phase)]["door"]["proposal"]
        body = {
            "command_id": self.command_id(),
            "expected_version": workflow["version"],
            "phase": proposal["phase"],
            "document_path": proposal["document_path"],
            "artifact_revision": dict(proposal["artifact_revision"]),
        }
        body.update(change)
        return await self.send("POST", f"{BASE}/doors/{proposal['proposal_id']}/{verb}", body)

    async def decide_risky(self, proposal_id: str, digest: str, verb: str = "approve") -> tuple[int, Any]:
        version = (await self.workflow())["version"]
        return await self.send(
            "POST", f"{BASE}/approvals/{proposal_id}/{verb}",
            {"command_id": self.command_id(), "expected_version": version, "action_digest": digest},
        )

    async def forward(self, *frames: dict) -> Any:
        """The browser forwards raw Crew envelopes to the Spec 2 ingest route."""

        status, body = await self.send("POST", f"{BASE}/seance/ingest", {"envelopes": list(frames)})
        assert status == 200, body
        return body

    # --- the Ghosts ---------------------------------------------------------------

    def launch(self, role: str | None, label: str | None) -> McpClient:
        env = {"PATH": os.defpath, "HOME": str(self.tmp / "ghost-home"), "LANG": "C.UTF-8"}
        if role is not None:
            env["HH_ROOM"] = role
        if label is not None:
            env["KIROCREW_SESSION_LABEL"] = label
        ghost = McpClient(self.app_root, env, self.h.mansion)
        self.ghosts.append(ghost)
        return ghost

    async def ghost(self, phase: Phase) -> tuple[McpClient, str]:
        """Start the MCP server Crew would start for the phase's session."""

        workflow = (await self.h.view(reconcile=False)).read.projection
        slot = workflow.phases[phase].session_slot
        ghost = self.launch(ROLE[phase], f"dashboard:{slot}")
        await asyncio.to_thread(ghost.initialize)
        return ghost, slot

    @staticmethod
    async def call(ghost: McpClient, tool: str, arguments: Any = None) -> dict:
        return await asyncio.to_thread(ghost.call, tool, arguments if arguments is not None else {})

    @staticmethod
    async def tools(ghost: McpClient) -> list[str]:
        return await asyncio.to_thread(ghost.tools)

    def close(self) -> None:
        for ghost in self.ghosts:
            if ghost.process.poll() is None:
                ghost.process.kill()
                ghost.process.wait(timeout=10)
            for stream in (ghost.process.stdin, ghost.process.stdout, ghost.process.stderr):
                if stream is not None and not stream.closed:
                    stream.close()


def _play(tmp_path: Path, scenario):
    async def go():
        app_root = install_app(tmp_path / "crew-home" / "apps" / "haunted-house")
        async with house(tmp_path / "work", data_dir=app_root / "data") as h:
            rooms = RoomToolService(h.port, h.root, operations=h.service)
            gate = RoomGate(rooms, h.bindings)
            await gate.start()
            settings = Settings(port=1, secret=APP_KEY, gateway_origin=None, app_name=APP)
            app = build_app(settings, clock=lambda: NOW, workflow_service=h.service, seance_service=h.seance)
            async with TestClient(TestServer(app)) as client:
                stage = Stage(h, client, app_root, tmp_path)
                try:
                    return await scenario(stage)
                finally:
                    stage.close()
                    await gate.stop()

    return asyncio.run(go())


async def _spec_phase(stage: Stage, phase: Phase) -> McpClient:
    """Start a spec phase, let its Ghost write and submit, approve the Door."""

    status, body = await stage.start(phase)
    assert status == 200, body
    ghost, _slot = await stage.ghost(phase)
    written = await stage.call(
        ghost, "write_spec_document",
        {"content": f"# {phase.value}\n\n{DOCUMENT_BODY}\n", "expected_revision": 0},
    )
    assert written["ok"], written
    submitted = await stage.call(ghost, "submit_phase_output")
    assert submitted["ok"], submitted
    status, body = await stage.decide_door(phase)
    assert status == 200, body
    return ghost


def test_the_guarded_workflow_from_requirements_to_implementation(tmp_path):
    async def scenario(stage: Stage):
        h = stage.h
        notes: dict[str, Any] = {}
        (h.mansion / "src").mkdir()
        for name in ("old.py", "second.py", "keep.py"):
            (h.mansion / "src" / name).write_text("print('x')\n", encoding="utf-8")
        (h.mansion / ".env").write_text("API_TOKEN=do-not-read\n", encoding="utf-8")
        other = h.root / "other-mansion"
        other.mkdir()
        (other / "keep.txt").write_text("someone else's project\n", encoding="utf-8")

        # --- requirements: refusal, explicit start, exact Door ----------------------
        notes["sealed"] = [await stage.start(phase) for phase in PHASES[1:]]
        notes["crew_before_start"] = list(h.crew.calls)
        status, body = await stage.start(Phase.REQUIREMENTS)
        assert status == 200, body
        notes["setup_order"] = h.crew.steps()
        archivist, _slot = await stage.ghost(Phase.REQUIREMENTS)
        notes["archivist_tools"] = await stage.tools(archivist)
        notes["archivist_out_of_room"] = [
            await stage.call(archivist, "write_room_file", {"path": "src/app.py", "content": "x"}),
            await stage.call(archivist, "read_room_file", {"path": "../other-mansion/keep.txt"}),
            await stage.call(archivist, "read_room_file", {"path": ".env"}),
            await stage.call(archivist, "read_room_file", {"path": ".haunted-house/seance/events.v1.jsonl"}),
        ]
        assert (await stage.call(
            archivist, "write_spec_document",
            {"content": f"# requirements\n\n{DOCUMENT_BODY}\n", "expected_revision": 0}))["ok"]
        notes["stale_write"] = await stage.call(
            archivist, "write_spec_document", {"content": "again", "expected_revision": 0})
        assert (await stage.call(archivist, "submit_phase_output"))["ok"]
        notes["waiting"] = await stage.workflow()
        notes["early_design"] = await stage.start(Phase.DESIGN)
        notes["wrong_revision"] = await stage.decide_door(
            Phase.REQUIREMENTS, artifact_revision={"revision": 2, "sha256": "f" * 64, "size_bytes": 1})
        crew_calls = len(h.crew.calls)
        status, body = await stage.decide_door(Phase.REQUIREMENTS)
        assert status == 200, body
        notes["after_requirements"] = body["workflow"]
        notes["door_started_nothing"] = len(h.crew.calls) == crew_calls

        # --- design and tasks ---------------------------------------------------------
        await _spec_phase(stage, Phase.DESIGN)
        foreman = await _spec_phase(stage, Phase.TASKS)
        notes["foreman_after_door"] = await stage.call(
            foreman, "write_spec_document", {"content": "late edit", "expected_revision": 1})

        # --- implementation: explicit start, guarded tools ---------------------------
        notes["before_implementation"] = (await stage.workflow())["phases"][3]["status"]
        status, body = await stage.start(Phase.IMPLEMENTATION)
        assert status == 200, body
        tinker, slot = await stage.ghost(Phase.IMPLEMENTATION)
        notes["tinker_tools"] = await stage.tools(tinker)
        notes["tinker_write"] = await stage.call(
            tinker, "write_room_file", {"path": "src/app.py", "content": "print('built')\n"})
        notes["tinker_out_of_room"] = [
            await stage.call(tinker, "write_room_file",
                             {"path": f".kiro/specs/{SPEC}/tasks.md", "content": "rewritten"}),
            await stage.call(tinker, "write_room_file", {"path": "../other-mansion/x.py", "content": "x"}),
            await stage.call(tinker, "write_room_file", {"path": ".git/config", "content": "x"}),
            await stage.call(tinker, "propose_risky_action", {"action": tinker_delete(".env")}),
            await stage.call(tinker, "propose_risky_action",
                             {"action": tinker_delete("../other-mansion/keep.txt")}),
        ]

        # --- an app decision, answered to Crew exactly ----------------------------------
        action = tinker_delete("src/old.py")
        proposed = await stage.call(tinker, "propose_risky_action", {"action": action})
        assert proposed["ok"], proposed
        first, digest = proposed["proposal_id"], proposed["action_digest"]
        notes["before_approval"] = await stage.call(
            tinker, "execute_approved_action", {"proposal_id": first, "action": action})
        # Crew asks for the tool call; the browser forwards the raw frame.
        h.crew.prompt(slot, "m-ask-1", execution_input(first, action), approval_id="2")
        notes["live_ingest"] = await stage.forward(pending_decision_frame(slot, "2"))
        notes["needs_you"] = await stage.workflow()
        status, body = await stage.decide_risky(first, digest)
        assert status == 200, body
        notes["app_decision"] = body
        notes["crew_answers"] = [call[2] for call in h.crew.calls if call[0] == "approve"]
        await stage.forward(resolved_frame(slot, "m-ask-1", True, "2"))
        notes["mismatched"] = await stage.call(
            tinker, "execute_approved_action", {"proposal_id": first, "action": tinker_delete("src/keep.py")})
        notes["executed"] = await stage.call(
            tinker, "execute_approved_action", {"proposal_id": first, "action": action})
        notes["again"] = await stage.call(
            tinker, "execute_approved_action", {"proposal_id": first, "action": action})

        # --- an external Crew decision ------------------------------------------------------
        second_action = tinker_delete("src/second.py")
        proposed = await stage.call(tinker, "propose_risky_action", {"action": second_action})
        second = proposed["proposal_id"]
        h.crew.prompt(slot, "m-ask-2", execution_input(second, second_action), approval_id="2")
        await stage.forward(pending_decision_frame(slot, "2", revision=2))
        await stage.workflow()
        h.crew.resolve_externally(slot, "m-ask-2", "approved")
        await stage.forward(resolved_frame(slot, "m-ask-2", True, "2"))
        notes["external"] = await stage.workflow()
        notes["external_executed"] = await stage.call(
            tinker, "execute_approved_action", {"proposal_id": second, "action": second_action})

        # --- Crew approved the tool call, the house did not approve the action -----------
        third_action = tinker_delete("src/keep.py")
        proposed = await stage.call(tinker, "propose_risky_action", {"action": third_action})
        third = proposed["proposal_id"]
        # Crew's floor lets a call through for a *different* action under the same id.
        h.crew.prompt(slot, "m-ask-3", execution_input(third, tinker_delete("src/app.py")), approval_id="2")
        h.crew.resolve_externally(slot, "m-ask-3", "approved")
        await stage.forward(resolved_frame(slot, "m-ask-3", True, "2"))
        notes["bypass_view"] = await stage.workflow()
        notes["bypassed"] = [
            await stage.call(tinker, "execute_approved_action",
                             {"proposal_id": third, "action": tinker_delete("src/app.py")}),
            await stage.call(tinker, "execute_approved_action", {"proposal_id": third, "action": third_action}),
        ]

        # --- forged or absent identity ------------------------------------------------------
        forged = stage.launch("tinker", "dashboard:slot-1")  # the archivist's session
        await asyncio.to_thread(forged.initialize)
        absent = stage.launch("tinker", "dashboard:slot-999")
        await asyncio.to_thread(absent.initialize)
        notes["forged"] = (await stage.tools(forged), await stage.call(
            forged, "execute_approved_action", {"proposal_id": third, "action": third_action}))
        notes["absent"] = (await stage.tools(absent), await stage.call(
            absent, "write_room_file", {"path": "src/x.py", "content": "x"}))

        # --- implementation output and the last Door ---------------------------------------
        submitted = await stage.call(tinker, "submit_phase_output", {"path": "src/app.py"})
        assert submitted["ok"], submitted
        status, body = await stage.decide_door(Phase.IMPLEMENTATION)
        assert status == 200, body
        notes["final"] = body["workflow"]

        read = await h.port.read(MANSION)
        notes["read"] = read
        notes["log"] = next(h.mansion.rglob("events.v1.*")).read_bytes()
        notes["files"] = {
            name: (h.mansion / "src" / name).exists() for name in ("old.py", "second.py", "keep.py", "app.py")
        }
        notes["other"] = (other / "keep.txt").read_text(encoding="utf-8")
        notes["env"] = (h.mansion / ".env").read_text(encoding="utf-8")
        notes["capabilities"] = [h.binding(key).capability for key in h.crew.slots]
        notes["crew"] = h.crew
        notes["third"] = third
        notes["slot"] = slot
        return notes

    notes = _play(tmp_path, scenario)

    # Phase refusal: nothing later than the sealed Door ever started.
    assert [(status, body["error"]["code"]) for status, body in notes["sealed"]] == [
        (409, "predecessor_door_sealed")] * 3
    assert notes["crew_before_start"] == []
    assert notes["setup_order"] == ["create_slot", "set_project", "set_mode", "send_turn"]
    assert notes["early_design"][1]["error"]["code"] == "predecessor_door_sealed"

    # Room catalogs and out-of-room denials.
    assert notes["archivist_tools"] == [
        "list_room_files", "read_room_file", "write_spec_document", "submit_phase_output"]
    assert notes["tinker_tools"] == [
        "list_room_files", "read_room_file", "submit_phase_output", "write_room_file",
        "propose_risky_action", "execute_approved_action"]
    assert [item["ok"] for item in notes["archivist_out_of_room"]] == [False] * 4
    assert notes["archivist_out_of_room"][0]["code"] == "tool_not_available"
    assert all("do-not-read" not in json.dumps(item) and "someone else" not in json.dumps(item)
               for item in notes["archivist_out_of_room"])
    assert notes["stale_write"]["ok"] is False and notes["stale_write"]["code"] == "conflict"
    assert notes["tinker_write"]["ok"] is True
    assert [item["ok"] for item in notes["tinker_out_of_room"]] == [False] * 5
    assert notes["foreman_after_door"]["ok"] is False
    assert notes["other"] == "someone else's project\n" and notes["env"] == "API_TOKEN=do-not-read\n"

    # Exact Door approval; approving starts nothing.
    waiting = notes["waiting"]["phases"][0]
    assert (waiting["status"], waiting["door"]["status"]) == ("waiting", "waiting")
    assert notes["wrong_revision"][0] == 409 and notes["wrong_revision"][1]["error"]["code"] == "stale_revision"
    after = notes["after_requirements"]["phases"]
    assert (after[0]["door"]["status"], after[1]["status"]) == ("open", "ready")
    assert notes["door_started_nothing"] and notes["before_implementation"] == "ready"

    # App decision: canonical record first, then Crew answered with the exact prompt.
    assert notes["before_approval"]["code"] == "proposal_pending"
    assert notes["live_ingest"]["reconcile_slots"] == [notes["slot"]]
    prompt = notes["needs_you"]["pending_permissions"]
    assert [(item["mid"], item["tool_name"], item["proposal_id"]) for item in prompt] == [
        ("m-ask-1", TOOL, notes["app_decision"]["workflow"]["risky_proposals"][0]["proposal_id"])]
    assert notes["needs_you"]["waiting_count"] == 2
    assert notes["crew_answers"] == [
        {"action": "approved", "request_id": "2", "request_mid": "m-ask-1", "origin": "native"}]
    assert notes["mismatched"]["ok"] is False and notes["mismatched"]["code"] == "descriptor_mismatch"
    assert notes["executed"]["ok"] is True and notes["executed"]["consumed"] is True
    assert notes["again"]["ok"] is False and notes["again"]["code"] == "proposal_consumed"

    # External Session_Approval: one crew decision, then one execution.
    external = {item["proposal_id"]: item for item in notes["external"]["risky_proposals"]}
    crew_decided = [item for item in external.values() if item["decision"] and item["decision"]["actor"] == "crew"]
    assert len(crew_decided) == 1 and crew_decided[0]["status"] == "approved"
    assert notes["external_executed"]["ok"] is True

    # A Crew-side allow for another action authorizes nothing here.
    third = {item["proposal_id"]: item for item in notes["bypass_view"]["risky_proposals"]}[notes["third"]]
    assert third["status"] == "pending" and third["decision"] is None
    assert [item["ok"] for item in notes["bypassed"]] == [False, False]
    assert {item["code"] for item in notes["bypassed"]} == {"proposal_pending"}
    assert notes["files"] == {"old.py": False, "second.py": False, "keep.py": True, "app.py": True}

    # Forged or absent identity exposes no tool and refuses every call.
    for tools, refused in (notes["forged"], notes["absent"]):
        assert tools == [] and refused["ok"] is False and refused["code"] == "blocked"

    # All four Doors are open, each by an explicit start and an exact decision.
    assert [phase["door"]["status"] for phase in notes["final"]["phases"]] == ["open"] * 4
    assert [phase["ghost_ids"] for phase in notes["final"]["phases"]] == [
        ["archivist"], ["draughtsman"], ["foreman"], ["tinker-1"]]
    crew = notes["crew"]
    assert len(crew.slots) == 4 and all(slot["mode"] == "normal" for slot in crew.slots.values())
    assert crew.unknown == [] and crew.websocket_attempts == 0

    # --- complete canonical evidence, replayable by Spec 2 and Spec 4 --------------------
    read = notes["read"]
    physical = parse_event_log(notes["log"])
    assert physical.diagnostics == () and read.integrity == "valid"
    assert read.projection.diagnostics == () and read.projection.ledger.diagnostics == ()
    replayed = replay_projection(physical.events)
    assert replayed == read.projection
    assert workflow_projection_to_json(replayed, mansion_id=MANSION, events=physical.events)["phases"] == (
        notes["final"]["phases"])
    kinds = [record.kind.value for record in read.domain.records]
    for kind, count in {
        "phase_start_reserved": 4, "phase_started": 4, "spec_document_written": 3,
        "phase_output_ready": 4, "door_approved": 4, "risky_action_proposed": 3,
        "risky_action_approved": 2, "risky_action_consumed": 2, "risky_action_succeeded": 2,
    }.items():
        assert kinds.count(kind) == count, (kind, kinds.count(kind))
    # Refused attempts left content-free evidence: the mismatched action and the
    # second use of a spent approval.  Waiting for a decision is not a refusal.
    assert kinds.count("path_denied") >= 6 and kinds.count("risky_action_denied") == 2
    assert kinds.count("approval_resolution_ignored") == 1
    order = {kind: [i for i, value in enumerate(kinds) if value == kind] for kind in set(kinds)}
    # Every start follows the approval of the Door before it.
    for index in range(1, 4):
        assert order["door_approved"][index - 1] < order["phase_start_reserved"][index]
    # Every consumption follows its exact approval and precedes its outcome.
    for index, consumed in enumerate(order["risky_action_consumed"]):
        assert order["risky_action_approved"][index] < consumed < order["risky_action_succeeded"][index]
    crew_types = {event.event_type for event in read.events if event.source.origin == "crew"}
    assert {"decision_recorded", "approval_requested", "approval_decided"} <= crew_types
    registered = [event.scope.ghost_id for event in read.events if event.event_type == "run_started"]
    assert registered == ["archivist", "draughtsman", "foreman", "tinker-1"]

    # No document body, credential, capability, or host path reached the log.
    text = notes["log"].decode("utf-8")
    assert DOCUMENT_BODY not in text and "do-not-read" not in text and "print(" not in text
    assert APP_KEY not in text and str(tmp_path) not in text and "/Users/" not in text
    assert all(capability not in text for capability in notes["capabilities"])
    assert len(notes["capabilities"]) == 4 and len(set(notes["capabilities"])) == 4
