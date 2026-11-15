"""Harness for the room MCP tests: an installed-app copy in a temporary
directory, the backend room gate on a private loopback port, and a client
that speaks MCP to the real ``mcp/server.py`` over stdio.

Nothing here touches the real Crew home, a real Mansion root, or a gateway.
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import sys
import threading
from pathlib import Path
from typing import Any

from haunted_house.adapters.command_runner import (
    ActionOutcome,
    ApprovedActionExecutor,
    UnavailableRunner,
)
from haunted_house.adapters.guarded_filesystem import GuardedFilesystem
from haunted_house.adapters.guardrail_port import GuardrailPort
from haunted_house.adapters.room_tool_service import RoomToolService
from haunted_house.adapters.workflow_service import WorkflowMansion, WorkflowService
from haunted_house.adapters.session_bindings import (
    RoomBinding,
    SessionBindingStore,
    new_capability,
    session_label,
)
from haunted_house.core import guardrail_events as ge
from haunted_house.core.guardrail_events import Phase
from haunted_house.core.path_policy import room_policy
from haunted_house.room_gate import RoomGate
from tests.guardrail_support import MANSION, OPERATOR, SPEC, MemoryWriter, spec_path

APP_SOURCE = Path(__file__).resolve().parents[2]  # app/
PHASES = [Phase.REQUIREMENTS, Phase.DESIGN, Phase.TASKS, Phase.IMPLEMENTATION]


def install_app(target: Path) -> Path:
    """Copy what Crew would install: manifest, MCP launcher, backend package."""

    target.mkdir(parents=True)
    shutil.copy2(APP_SOURCE / "app.json", target / "app.json")
    shutil.copytree(APP_SOURCE / "mcp", target / "mcp", ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copytree(
        APP_SOURCE / "backend" / "haunted_house",
        target / "backend" / "haunted_house",
        ignore=shutil.ignore_patterns("__pycache__"),
    )
    (target / "data").mkdir()
    return target


PHASE_BY_ROLE = {
    "archivist": Phase.REQUIREMENTS,
    "draughtsman": Phase.DESIGN,
    "foreman": Phase.TASKS,
    "tinker": Phase.IMPLEMENTATION,
}


ROLE_BY_PHASE = {phase: role for role, phase in PHASE_BY_ROLE.items()}


def room_binding(
    role: str, mansion_root: Path, *, slot: str | None = None, mansion: str = MANSION, **changes
) -> RoomBinding:
    """The record the backend would write for one Ghost session."""

    policy = room_policy(role, SPEC)
    fields = dict(
        slot=slot or f"hh-{role}-1",
        ghost=f"{role}-1",
        role=role,
        room=policy.room if policy is not None else "workshop",
        mansion=mansion,
        mansion_root=str(mansion_root),
        spec=SPEC,
        phase=PHASE_BY_ROLE[role],
        run_id=f"{role}-run-1",
        run_sequence=1,
        capability=new_capability(),
    )
    fields.update(changes)
    return RoomBinding(**fields)


class RecordingRunner:
    """A confined-runner double: records dispatches, starts no process."""

    def __init__(self, outcome: ActionOutcome | None = None, *, available: bool = True, fail: bool = False):
        self.outcome = outcome or ActionOutcome(True, "exited", 0, 3, "ran", False, True)
        self.available = available
        self.fail = fail
        self.runs: list[str] = []
        self.on_run = None

    async def run(self, descriptor, mansion_directory):
        self.runs.append(descriptor.kind)
        if self.on_run:
            self.on_run()
        if self.fail:
            raise RuntimeError("runner exploded")
        return self.outcome


def build_service(writer, mansions: Path, *, runner=None, operations: bool = True, id_factory=None):
    """RoomToolService wired as the backend wires it.

    The room operations are the real WorkflowService over the real
    ApprovedActionExecutor; only Crew, the reconciler, and the confined
    process runner are absent or doubles.  ``operations=False`` leaves the
    workflow service out, as on a backend that could not build it.
    """

    port = GuardrailPort(writer)
    workflow = None
    if operations:
        executor = ApprovedActionExecutor(
            port,
            lambda mansion: GuardedFilesystem(mansions, mansion),
            runner if runner is not None else UnavailableRunner(),
            mansion_directory=lambda mansion: mansions / mansion,
            id_factory=id_factory,
        )

        async def resolve(mansion_id: str):
            if not (mansions / mansion_id).is_dir():
                return None
            return WorkflowMansion(mansion_id, SPEC, mansions)

        workflow = WorkflowService(
            writer,
            mansions=resolve,
            crew=None,  # room operations never talk to Crew
            executor=executor,
            reconciler=None,
            id_factory=id_factory,
        )
    return RoomToolService(port, mansions, operations=workflow, id_factory=id_factory)


class GateThread:
    """Runs a RoomGate on its own event loop, as the backend process would."""

    def __init__(self, service: RoomToolService, bindings: SessionBindingStore) -> None:
        self.loop = asyncio.new_event_loop()
        self.gate = RoomGate(service, bindings)
        self._thread = threading.Thread(target=self.loop.run_forever, daemon=True)
        self._thread.start()
        self.port = self.run(self.gate.start())

    def run(self, coroutine):
        return asyncio.run_coroutine_threadsafe(coroutine, self.loop).result(timeout=30)

    def stop(self) -> None:
        try:
            self.run(self.gate.stop())
        finally:
            self.loop.call_soon_threadsafe(self.loop.stop)
            self._thread.join(timeout=10)
            self.loop.close()


class McpClient:
    """Speaks newline-delimited JSON-RPC to one ``mcp/server.py`` process."""

    def __init__(self, app_root: Path, env: dict[str, str], cwd: Path) -> None:
        self.stdout_lines: list[bytes] = []
        self._id = 0
        self.process = subprocess.Popen(
            # -S: no site-packages at all, so the server is standard library only.
            [sys.executable, "-S", "-s", str(app_root / "mcp" / "server.py")],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            cwd=cwd,
        )

    def send_raw(self, line: bytes) -> None:
        assert self.process.stdin is not None
        self.process.stdin.write(line)
        self.process.stdin.flush()

    def read(self) -> dict[str, Any]:
        assert self.process.stdout is not None
        line = self.process.stdout.readline()
        assert line, "server closed stdout: " + self.stderr_tail()
        self.stdout_lines.append(line)
        return json.loads(line)

    def request(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        self._id += 1
        message: dict[str, Any] = {"jsonrpc": "2.0", "id": self._id, "method": method}
        if params is not None:
            message["params"] = params
        self.send_raw(json.dumps(message).encode() + b"\n")
        reply = self.read()
        assert reply["id"] == self._id, reply
        return reply

    def initialize(self) -> dict[str, Any]:
        reply = self.request(
            "initialize",
            {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "t", "version": "0"}},
        )
        self.send_raw(b'{"jsonrpc":"2.0","method":"notifications/initialized"}\n')
        return reply["result"]

    def tools(self) -> list[str]:
        return [tool["name"] for tool in self.request("tools/list")["result"]["tools"]]

    def call(self, name: str, arguments: Any = None, **extra: Any) -> dict[str, Any]:
        params: dict[str, Any] = {"name": name, **extra}
        if arguments is not None:
            params["arguments"] = arguments
        result = self.request("tools/call", params)["result"]
        outcome = json.loads(result["content"][0]["text"])
        assert result["isError"] is (outcome["ok"] is not True)
        return outcome

    def stderr_tail(self) -> str:
        return ""

    def close(self) -> tuple[bytes, bytes]:
        """End input and return everything written to stdout and stderr."""

        assert self.process.stdin is not None
        self.process.stdin.close()
        assert self.process.stdout is not None and self.process.stderr is not None
        rest = self.process.stdout.read()
        stderr = self.process.stderr.read()
        self.process.wait(timeout=15)
        self.process.stdout.close()
        self.process.stderr.close()
        return b"".join(self.stdout_lines) + rest, stderr


class House:
    """One temporary installed app, Mansion root, writer, and running gate."""

    def __init__(self, tmp_path: Path, *, writer=None, runner=None) -> None:
        self.tmp = tmp_path
        self.app_root = install_app(tmp_path / "crew-home" / "apps" / "haunted-house")
        self.mansions = tmp_path / "workspace" / "mansions"
        self.mansion = self.mansions / MANSION
        (self.mansion / "src").mkdir(parents=True)
        (self.mansion / "src" / "old.py").write_text("old\n")
        (self.mansion / ".kiro" / "specs" / SPEC).mkdir(parents=True)
        self.other = self.mansions / "other-mansion"
        self.other.mkdir()
        (self.other / "keep.txt").write_text("keep")
        self.elsewhere = tmp_path / "elsewhere"
        self.elsewhere.mkdir()
        self.writer = writer if writer is not None else MemoryWriter()
        self.port = GuardrailPort(self.writer)
        self.runner = runner
        self.service = build_service(self.writer, self.mansions, runner=runner)
        self.bindings = SessionBindingStore(self.app_root / "data")
        self.backend = GateThread(self.service, self.bindings)
        self.clients: list[McpClient] = []
        self.capabilities: list[str] = []

    # --- backend side -------------------------------------------------------------

    def binding(self, role: str, **changes) -> RoomBinding:
        return room_binding(role, self.mansions, **changes)

    def open(self, binding: RoomBinding) -> RoomBinding:
        """What the backend does before it creates the Crew slot."""

        self.bindings.write(binding)
        self.capabilities.append(binding.capability)
        return binding

    def close_session(self, slot: str) -> None:
        self.bindings.remove(session_label(slot))

    def append(self, *candidates) -> None:
        assert self.backend.run(self.port.append(MANSION, list(candidates))).ok

    def projection(self):
        return self.backend.run(self.port.projection(MANSION))

    def kinds(self) -> list[str]:
        events = self.backend.run(self.port.read(MANSION)).events
        return [event.payload["kind"] for event in events]

    def start(self, phase: Phase) -> None:
        self.append(
            ge.phase_start_reserved(
                OPERATOR, phase=phase, reservation_id=f"res-{phase.value}", command_id=f"cmd-{phase.value}"
            ),
            ge.phase_started(
                OPERATOR, phase=phase, reservation_id=f"res-{phase.value}",
                session_slot=f"hh-{ROLE_BY_PHASE[phase]}-1",
            ),
        )

    def working(self, phase: Phase) -> None:
        """Open every earlier Door through acknowledged records, then start."""

        for earlier in PHASES[: PHASES.index(phase)]:
            if self.projection().phases[earlier].status.value == "approved":
                continue
            self.start(earlier)
            fields = dict(
                phase=earlier, proposal_id=f"door-{earlier.value}",
                document_path=spec_path(earlier), revision=1, sha256="a" * 64, size_bytes=1,
            )  # fmt: skip
            self.append(ge.phase_output_ready(OPERATOR, **fields))
            self.append(
                ge.door_approved(OPERATOR, actor="operator", command_id=f"ok-{earlier.value}", **fields)
            )
        self.start(phase)

    def decide(self, proposal_id: str, digest: str, *, approve: bool = True) -> None:
        builder = ge.risky_action_approved if approve else ge.risky_action_rejected
        self.append(
            builder(
                OPERATOR, proposal_id=proposal_id, action_digest=digest,
                actor="operator", command_id=f"cmd-{proposal_id}-{approve}",
            )  # fmt: skip
        )

    # --- ghost side ---------------------------------------------------------------

    def env(self, role: str | None, label: str | None, **extra: str) -> dict[str, str]:
        env = {"PATH": os.defpath, "HOME": str(self.tmp / "ghost-home"), "LANG": "C.UTF-8"}
        if role is not None:
            env["HH_ROOM"] = role
        if label is not None:
            env["KIROCREW_SESSION_LABEL"] = label
        env.update(extra)
        return env

    def launch(self, role: str | None, label: str | None, *, cwd: Path | None = None, **extra: str) -> McpClient:
        # Like kiro-cli, start in the session's working directory by default.
        client = McpClient(self.app_root, self.env(role, label, **extra), cwd or self.mansion)
        self.clients.append(client)
        return client

    def ghost(self, role: str, **kwargs) -> McpClient:
        """Open a bound session for ``role`` and start its MCP server."""

        binding = self.open(self.binding(role))
        client = self.launch(role, binding.label, **kwargs)
        client.initialize()
        return client

    def shutdown(self) -> None:
        for client in self.clients:
            if client.process.poll() is None:
                client.process.kill()
                client.process.wait(timeout=10)
            for stream in (client.process.stdin, client.process.stdout, client.process.stderr):
                if stream is not None and not stream.closed:
                    stream.close()
        self.backend.stop()
