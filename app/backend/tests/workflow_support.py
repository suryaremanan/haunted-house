"""Shared fixtures for the Doors-and-Guardrails service and route tests.

``FakeCrew`` is a fake Crew gateway served by aiohttp's TestServer on
127.0.0.1.  It implements only the S6 chat routes the app calls and records
every request, so tests can assert order, bodies, and that nothing else was
called.  ``House`` wires the real pieces around it in temporary directories:
the Spec 2 file writer and ingest service, the Mansion directory, the binding
store, the guarded filesystem, the action executor, the Session_Reconciler,
and the WorkflowService.  No real Crew gateway, home directory, or Mansion
root is ever touched.
"""

from __future__ import annotations

import json
import os
import secrets
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import aiohttp
from aiohttp import web
from aiohttp.test_utils import TestServer

from haunted_house.adapters.command_runner import (
    ActionOutcome,
    ApprovedActionExecutor,
    UnavailableRunner,
)
from haunted_house.adapters.crew_chat import CrewChat
from haunted_house.adapters.gateway_client import (
    SECRET_HEADER,
    GatewayClient,
    token_exchange_path,
)
from haunted_house.adapters.guarded_filesystem import GuardedFilesystem, GuardedRoomAccess
from haunted_house.adapters.guardrail_port import GuardrailPort
from haunted_house.adapters.seance_log_store import SeanceLogStore
from haunted_house.adapters.seance_service import SeanceService
from haunted_house.adapters.session_bindings import RoomBinding, SessionBindingStore
from haunted_house.adapters.session_reconciler import (
    EXECUTION_TOOL_NAME,
    SessionReconciler,
    execution_tool_names,
)
from haunted_house.adapters.settings import Settings
from haunted_house.adapters.workflow_service import WorkflowMansion, WorkflowService
from haunted_house.core.crew_event_normalizer import CrewEnvelope
from haunted_house.core.guardrail_events import Phase
from haunted_house.core.path_policy import room_policy

APP = "haunted-house"
APP_KEY = "app-k3y-x1"  # short on purpose: not a real credential
MANSION = "demo-mansion"
SPEC = "demo-feature"
SERVER = "haunted-house:room-tinker"
TOOL = f"{SERVER}/{EXECUTION_TOOL_NAME}"
ALLOWED = ["/api/version", "/api/chat/*", "/apps/haunted-house/api/*"]
CLOCK_MS = 1_731_400_000_000
# Inside every run these tests register (runs are registered at CLOCK_MS).
IN_RUN_TS = "2024-11-12T08:30:00+00:00"


class FakeCrew:
    """The S6 chat routes of a Crew gateway, and nothing else."""

    def __init__(self) -> None:
        self.issued: list[str] = []
        self.calls: list[tuple[str, str, Any]] = []
        self.unknown: list[tuple[str, str]] = []
        self.slots: dict[str, dict[str, Any]] = {}
        self.messages: dict[str, list[dict[str, Any]]] = {}
        self.fail: dict[str, tuple[int, dict[str, Any]]] = {}
        # step -> answers used once each, before ``fail``: (status, body, headers)
        self.fail_once: dict[str, list[tuple[int, dict[str, Any], dict[str, str]]]] = {}
        # What the stop route answers (RG-S3) and what it does to the slot.
        self.stop_reply: dict[str, Any] = {"ok": True}
        self.stop_state: str | None = "stopped"
        self.refuse_tokens = 0
        self.echo_names = False
        # step -> async callable run just before the fake handles that call
        self.hooks: dict[str, Any] = {}
        self.websocket_attempts = 0
        # slot -> the head fields Crew adds to that slot's history response
        # (``running``, ``turn``, ``turn_gen``); none by default.
        self.status: dict[str, dict[str, Any]] = {}
        self._n = 0

    def app(self) -> web.Application:
        app = web.Application()
        app.router.add_post(token_exchange_path(APP), self._exchange)
        app.router.add_post("/api/chat/slots", self._guard("create_slot", self._create))
        app.router.add_post("/api/chat/slots/{slot}/project", self._guard("set_project", self._project))
        app.router.add_post("/api/chat/mode", self._guard("set_mode", self._mode))
        app.router.add_post("/api/chat", self._guard("send_turn", self._send))
        app.router.add_get("/api/chat/slots/{slot}", self._guard("get_session", self._history))
        app.router.add_post("/api/chat/slots/{slot}/approve", self._guard("approve", self._approve))
        app.router.add_post("/api/chat/slots/{slot}/stop", self._guard("stop", self._stop))
        app.router.add_route("*", "/{tail:.*}", self._other)
        return app

    async def _exchange(self, request: web.Request) -> web.Response:
        if request.headers.get(SECRET_HEADER) != APP_KEY:
            return web.json_response({"error": "bad_secret"}, status=403)
        token = "tk-" + secrets.token_hex(4)
        self.issued.append(token)
        return web.json_response({"token": token})

    def _guard(self, step: str, handler):
        async def run(request: web.Request) -> web.Response:
            if request.headers.get("Upgrade", "").lower() == "websocket":
                self.websocket_attempts += 1
            if self.refuse_tokens > 0:
                self.refuse_tokens -= 1
                return web.json_response({"error": "token_expired"}, status=401)
            if not self.issued or request.query.get("token") != self.issued[-1]:
                return web.json_response({"error": "bad_token"}, status=401)
            body = await request.json() if request.can_read_body else None
            self.calls.append((step, request.raw_path.partition("?")[0], body))
            if step in self.hooks:
                await self.hooks[step]()
            if self.fail_once.get(step):
                status, payload, headers = self.fail_once[step].pop(0)
                return web.json_response(payload, status=status, headers=headers)
            if step in self.fail:
                status, payload = self.fail[step]
                return web.json_response(payload, status=status)
            return await handler(request, body)

        return run

    async def _other(self, request: web.Request) -> web.Response:
        if request.headers.get("Upgrade", "").lower() == "websocket":
            self.websocket_attempts += 1
        self.unknown.append((request.method, request.path))
        return web.json_response({"error": "not_found"}, status=404)

    async def _create(self, request: web.Request, body: Any) -> web.Response:
        self._n += 1
        # A gateway may key the slot by the requested name or by its own key.
        key = body.get("name") if self.echo_names else f"slot-{self._n}"
        self.slots[key] = {"create": body, "project": None, "mode": None, "turns": []}
        self.messages[key] = []
        return web.json_response({"key": key, "name": body.get("name")})

    def _slot(self, request: web.Request) -> dict[str, Any] | None:
        return self.slots.get(request.match_info["slot"])

    async def _project(self, request: web.Request, body: Any) -> web.Response:
        slot = self._slot(request)
        if slot is None:
            return web.json_response({"error": "slot not found"}, status=404)
        slot["project"] = body.get("project")
        return web.json_response({"ok": True})

    async def _mode(self, request: web.Request, body: Any) -> web.Response:
        slot = self.slots.get(body.get("slot"))
        if slot is None:
            return web.json_response({"error": "slot not found"}, status=404)
        slot["mode"] = body.get("mode")
        return web.json_response({"ok": True, "mode": body.get("mode")})

    async def _send(self, request: web.Request, body: Any) -> web.Response:
        slot = self.slots.get(body.get("slot"))
        if slot is None or request.query.get("ws") != "1":
            return web.json_response({"error": "bad send"}, status=400)
        slot["turns"].append(body.get("message"))
        # Crew keeps the house's message in the session's history.
        self.messages[body.get("slot")].append(
            {"role": "user", "content": body.get("message"), "meta": {}}
        )
        return web.json_response({"ok": True, "slot": body.get("slot")})

    async def _history(self, request: web.Request, _body: Any) -> web.Response:
        key = request.match_info["slot"]
        if key not in self.slots:
            return web.json_response({"error": "slot not found"}, status=404)
        return web.json_response(
            {"slot": key, **self.status.get(key, {}), "messages": self.messages[key], "has_more": False}
        )

    async def _approve(self, request: web.Request, body: Any) -> web.Response:
        key = request.match_info["slot"]
        for message in self.messages.get(key, []):
            meta = message.get("meta", {})
            if (
                message.get("role") == "permission"
                and meta.get("approval_id") == body.get("request_id")
                and meta.get("mid") == body.get("request_mid")
                and not meta.get("resolved")
            ):
                meta["resolved"] = body.get("action")
                return web.json_response({"ok": True})
        return web.json_response(
            {"error": "no pending approval", "code": "approval_not_pending"}, status=404
        )

    async def _stop(self, request: web.Request, _body: Any) -> web.Response:
        """RG-S3: one bodyless stop; the reply comes after the cancel settled."""

        key = request.match_info["slot"]
        if key not in self.slots:
            return web.json_response({"error": "slot not found", "code": "slot_not_found"}, status=404)
        self.slots[key].setdefault("stops", []).append(dict(request.query))
        if self.stop_reply.get("ok") is True and "info" not in self.stop_reply and self.stop_state:
            self.messages[key].append(
                {"role": "system", "content": "", "meta": {
                    "kind": "stop_event", "id": "stop-0a1b", "state": self.stop_state,
                }}
            )
        return web.json_response(self.stop_reply)

    # --- test controls ---------------------------------------------------------------

    def answer(self, slot: str, text: str) -> None:
        """The Ghost's final message of its current turn."""

        self.messages[slot].append({"role": "assistant", "content": text, "ts": IN_RUN_TS})

    def turn_status(self, slot: str, *, running: bool, turn: int | None = None, generation: str | None = None) -> None:
        """What the slot's history head says about its turn (Crew 0.12 slot detail)."""

        head: dict[str, Any] = {"running": running}
        if turn is not None and generation is not None:
            head.update(turn=turn, turn_gen=generation)
        self.status[slot] = head

    def pressure(self, step: str, code: str = "crew_queue_full", times: int = 1, retry_after: int | None = None) -> None:
        """RG-S5: Crew refuses the next ``times`` calls of ``step`` for capacity."""

        headers = {} if retry_after is None else {"Retry-After": str(retry_after)}
        self.fail_once.setdefault(step, []).extend(
            [(429, {"error": "busy", "code": code, "capacity": {}}, headers)] * times
        )

    def steps(self) -> list[str]:
        return [step for step, _path, _body in self.calls]

    def prompt(
        self,
        slot: str,
        mid: str,
        tool_input: Any,
        *,
        approval_id: str = "2",
        tool_name: str = EXECUTION_TOOL_NAME,
        server: str | None = SERVER,
        as_text: bool = True,
    ) -> None:
        """Add one pending permission message the way Crew stores it."""

        meta: dict[str, Any] = {
            "mid": mid,
            "approval_id": approval_id,
            "tool_name": tool_name,
            "tool_input": json.dumps(tool_input) if as_text else tool_input,
        }
        if server is not None:
            meta["mcp_server"] = server
        self.messages[slot].append(
            {"role": "permission", "content": "Run a tool", "ts": IN_RUN_TS, "meta": meta}
        )

    def resolve_externally(self, slot: str, mid: str, action: str) -> None:
        for message in self.messages[slot]:
            if message["meta"].get("mid") == mid:
                message["meta"]["resolved"] = action


class FlakyWriter:
    """The real writer, with scripted failures for one kind of record.

    ``fail`` maps a domain kind (or an event type) to the statuses its next
    appends return instead of being written.
    """

    def __init__(self, inner: Any) -> None:
        self.inner = inner
        self.fail: dict[str, list[str]] = {}
        self.fail_reads = False

    def _planned(self, candidates) -> str | None:
        for candidate in candidates:
            payload = getattr(candidate, "payload", None)
            kind = payload.get("kind") if isinstance(payload, dict) else None
            for key in (kind, getattr(candidate, "event_type", None)):
                if key in self.fail and self.fail[key]:
                    return self.fail[key].pop(0)
        return None

    async def append_candidates(self, mansion_id, candidates):
        from haunted_house.core.seance_persistence import AppendResult

        status = self._planned(candidates)
        if status is not None:
            return AppendResult(status=status)  # type: ignore[arg-type]
        return await self.inner.append_candidates(mansion_id, candidates)

    async def compare_and_append(self, mansion_id, expected_sequence, candidates):
        from haunted_house.core.seance_persistence import AppendResult

        status = self._planned(candidates)
        if status is not None:
            return AppendResult(status=status)  # type: ignore[arg-type]
        return await self.inner.compare_and_append(mansion_id, expected_sequence, candidates)

    async def read_after(self, mansion_id, after_sequence, limit):
        from haunted_house.core.seance_persistence import CanonicalReadResult

        if self.fail_reads:
            return CanonicalReadResult(status="failed")
        return await self.inner.read_after(mansion_id, after_sequence, limit)


class SpyRunner:
    """Counts starts and reports whatever outcome a test sets."""

    def __init__(self) -> None:
        self.available = True
        self.outcome = ActionOutcome(True, "exited", 0, 3, "ok\n", False, True)
        self.started: list[str] = []

    async def run(self, descriptor, mansion_directory):
        self.started.append(descriptor.kind)
        return self.outcome


@dataclass
class House:
    crew: FakeCrew
    client: GatewayClient
    root: Path
    data: Path
    store: SeanceLogStore
    seance: SeanceService
    bindings: SessionBindingStore
    runner: Any
    service: WorkflowService
    reconciler: SessionReconciler
    writer: Any = None
    ids: list[str] = field(default_factory=list)
    # The Room Ghosts services, when ``house(room_ghosts=...)`` wired them.
    rooms: Any = None

    @property
    def mansion(self) -> Path:
        return self.root / MANSION

    @property
    def port(self) -> GuardrailPort:
        return self.service.port

    async def view(self, **options):
        return await self.service.projection(MANSION, **options)

    async def kinds(self) -> list[str]:
        read = await self.port.read(MANSION)
        return [record.kind.value for record in read.domain.records]

    async def events(self):
        return (await self.port.read(MANSION)).events

    def binding(self, slot: str) -> RoomBinding:
        found = self.bindings.load(f"dashboard:{slot}")
        assert found is not None
        return found

    def access(self) -> GuardedRoomAccess:
        return GuardedRoomAccess(GuardedFilesystem(self.root, MANSION), self.port)

    async def write_spec(self, binding: RoomBinding, text: str, expected_revision: int = 0):
        """What the room MCP tool does for ``write_spec_document``."""

        return await self.access().write_spec_document(
            binding.scope,
            role=binding.role,
            spec_name=binding.spec,
            phase=binding.phase,
            data=text.encode("utf-8"),
            expected_revision=expected_revision,
        )

    async def ingest(self, frames: list[dict[str, Any]]):
        """Send raw Crew frames through the one Spec 2 ingest path."""

        return await self.seance.ingest(
            MANSION, [CrewEnvelope(type=frame["type"], data=frame["data"]) for frame in frames]
        )

    async def start(self, phase: Phase, command_id: str | None = None, **options):
        view = await self.view(reconcile=False)
        return await self.service.start_phase(
            MANSION, phase,
            command_id=command_id or f"cmd-start-{phase.value}-{view.version}",
            expected_version=view.version,
            **options,
        )

    async def decide_door(self, approve: bool = True, command_id: str | None = None, phase: Phase | None = None):
        view = await self.view(reconcile=False)
        proposal = next(
            item.proposal
            for item in view.read.projection.phases.values()
            if item.proposal is not None
            and item.proposal.status == "pending"
            and (phase is None or item.phase is phase)
        )
        return await self.service.decide_door(
            MANSION, proposal.proposal_id,
            approve=approve,
            phase=proposal.phase,
            document_path=proposal.document_path,
            artifact_revision=proposal.artifact_revision,
            command_id=command_id or f"cmd-door-{view.version}",
            expected_version=view.version,
        )

    async def reach_workshop(self) -> RoomBinding:
        """Approve the three spec Doors and start one tinker session."""

        for phase in (Phase.REQUIREMENTS, Phase.DESIGN, Phase.TASKS):
            await self.pass_phase(phase)
        await self.start(Phase.IMPLEMENTATION)
        view = await self.view(reconcile=False)
        return self.binding(view.read.projection.phases[Phase.IMPLEMENTATION].session_slot)

    async def propose(self, binding: RoomBinding, fields: dict[str, Any]):
        result = await self.service.propose_risky_action(binding, fields)
        assert result.ok, result
        return result.data["proposal_id"], result.data["action_digest"], result.data["descriptor"]

    async def decide_risky(self, proposal_id: str, digest: str, approve: bool = True, command_id: str | None = None):
        view = await self.view(reconcile=False)
        return await self.service.decide_risky_action(
            MANSION, proposal_id,
            approve=approve,
            action_digest=digest,
            command_id=command_id or f"cmd-risky-{view.version}",
            expected_version=view.version,
        )

    async def pass_phase(self, phase: Phase, text: str | None = None) -> RoomBinding:
        """Start a spec phase, write and submit its document, approve its Door."""

        await self.start(phase)
        binding = self.binding((await self.view(reconcile=False)).read.projection.phases[phase].session_slot)
        written = await self.write_spec(binding, text or f"# {phase.value}\n\nBody of {phase.value}.\n")
        assert written.status == "written", written
        submitted = await self.service.submit_phase_output(binding)
        assert submitted.ok, submitted
        await self.decide_door(True)
        return binding


@asynccontextmanager
async def house(
    tmp_path: Path,
    *,
    runner: Any = None,
    min_interval: float = 0.0,
    wrap_writer: Any = None,
    with_bindings: bool = True,
    data_dir: Path | None = None,
    validator: Any = None,
    room_ghosts: Any = None,
):
    """One wired backend around a fake Crew gateway, all in ``tmp_path``.

    Entering it again over the same ``tmp_path`` is a backend restart: the
    log, the Mansion, and the binding records are still there.
    """

    base = Path(os.path.realpath(tmp_path))
    root = base / "mansions"
    # A ready Mansion already holds its spec folder (Mansion Lifecycle).
    (root / MANSION / ".kiro" / "specs" / SPEC).mkdir(parents=True, exist_ok=True)
    data = Path(os.path.realpath(data_dir)) if data_dir is not None else base / "data"
    data.mkdir(exist_ok=True)
    crew = FakeCrew()
    async with TestServer(crew.app()) as server, aiohttp.ClientSession() as session:
        settings = Settings(
            port=1, secret=APP_KEY, gateway_origin=f"http://127.0.0.1:{server.port}",
            app_name=APP, mansion_root=root, approved_roots=(base,),
        )
        client = GatewayClient(settings, session, ALLOWED)
        store = SeanceLogStore(root, known_secrets=[APP_KEY], clock_ms=lambda: CLOCK_MS)
        writer = wrap_writer(store) if wrap_writer is not None else store
        seance = SeanceService(store, history=client)
        chat = CrewChat(client)
        port = GuardrailPort(writer)
        counter = {"n": 0}
        boot = secrets.token_hex(3)  # a restart must not mint the same ids again

        def new_id() -> str:
            counter["n"] += 1
            return f"id-{boot}-{counter['n']:04d}"

        chosen = runner if runner is not None else SpyRunner()
        executor = ApprovedActionExecutor(
            port,
            lambda mansion_id: GuardedFilesystem(root, mansion_id),
            chosen,
            mansion_directory=lambda mansion_id: root / mansion_id,
            id_factory=new_id,
        )
        reconciler = SessionReconciler(
            port, chat,
            history=seance.reconcile,
            tool_names=execution_tool_names((SERVER,)),
            min_interval_seconds=min_interval,
        )
        bindings = SessionBindingStore(data)

        async def resolve(mansion_id: str) -> WorkflowMansion | None:
            if mansion_id != MANSION:
                return None
            return WorkflowMansion(MANSION, SPEC, root)

        # Room Ghosts (Spec 5), wired the way the backend wires it:
        # ``room_ghosts`` is ``True`` or a dict of ``build_room_ghosts`` options.
        seams = None
        ghost_options: dict[str, Any] = {}
        if room_ghosts:
            from haunted_house.room_ghost_wiring import RoomGhostSeams

            seams = RoomGhostSeams(root)
            ghost_options = {
                "validator": seams.validator,
                "turns": seams.turns,
                "implementation": seams.implementation,
                "on_launch_failure": seams.on_launch_failure,
            }
        service = WorkflowService(
            writer,
            mansions=resolve,
            crew=chat,
            executor=executor,
            reconciler=reconciler,
            bindings=bindings if with_bindings else None,
            id_factory=new_id,
            # The Spec 5 artifact validation boundary, when a test supplies it.
            **({"validator": validator(root)} if validator is not None else {}),
            **ghost_options,
        )
        rooms = None
        if seams is not None:
            from haunted_house.room_ghost_wiring import RoomGhostOptions, build_room_ghosts

            # Records are stamped with the fixed test clock; so is the house's "now".
            given = {"now_ms": lambda: CLOCK_MS}
            given.update(room_ghosts if isinstance(room_ghosts, dict) else {})
            fields = RoomGhostOptions.__dataclass_fields__
            rooms = build_room_ghosts(
                seams,
                writer=writer,
                workflow=service,
                crew=chat,
                bindings=bindings,
                mansions=resolve,
                app_root=Path(__file__).resolve().parents[2],
                history=seance.reconcile,
                options=RoomGhostOptions(**{k: v for k, v in given.items() if k in fields}),
                **{k: v for k, v in given.items() if k not in fields},
            )
        try:
            yield House(
                crew, client, root, data, store, seance, bindings, chosen, service, reconciler,
                writer, rooms=rooms,
            )
        finally:
            if rooms is not None:
                await rooms.stop()


class MemoryCrew:
    """An in-process ``ChatGateway``: the same routes with no HTTP at all."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple[Any, ...]]] = []
        self.messages: dict[str, list[dict[str, Any]]] = {}
        self._n = 0

    async def create_chat_slot(self, name, agent):
        self._n += 1
        key = f"slot-{self._n}"
        self.calls.append(("create_slot", (name, agent)))
        self.messages[key] = []
        return {"key": key}

    async def set_chat_slot_project(self, slot, project):
        self.calls.append(("set_project", (slot, project)))
        return {"ok": True}

    async def set_chat_slot_interactive(self, slot):
        self.calls.append(("set_mode", (slot,)))
        return {"ok": True}

    async def send_chat_turn(self, slot, message):
        self.calls.append(("send_turn", (slot,)))
        return {"ok": True, "slot": slot}

    async def session_history(self, slot):
        return {"messages": self.messages.get(slot, [])}

    async def resolve_chat_approval(self, slot, request_id, request_mid, action):
        self.calls.append(("approve", (slot, request_id, request_mid, action)))
        return {"ok": True}


def memory_house(tmp_path: Path, writer: Any):
    """A WorkflowService over ``writer`` and an in-process fake Crew.

    For property tests: no event loop resources, no HTTP, real guarded files
    under ``tmp_path``.  Returns ``(service, crew, bindings, root)``.
    """

    base = Path(os.path.realpath(tmp_path))
    root = base / "mansions"
    (root / MANSION / ".kiro" / "specs" / SPEC).mkdir(parents=True, exist_ok=True)
    data = base / "data"
    data.mkdir(exist_ok=True)
    crew = MemoryCrew()
    chat = CrewChat(crew)
    port = GuardrailPort(writer)
    counter = {"n": 0}

    def new_id() -> str:
        counter["n"] += 1
        return f"id-{counter['n']:05d}"

    executor = ApprovedActionExecutor(
        port,
        lambda mansion_id: GuardedFilesystem(root, mansion_id),
        SpyRunner(),
        mansion_directory=lambda mansion_id: root / mansion_id,
        id_factory=new_id,
    )
    reconciler = SessionReconciler(port, chat, tool_names=execution_tool_names((SERVER,)))
    bindings = SessionBindingStore(data)

    async def resolve(mansion_id: str) -> WorkflowMansion | None:
        return WorkflowMansion(MANSION, SPEC, root) if mansion_id == MANSION else None

    service = WorkflowService(
        writer, mansions=resolve, crew=chat, executor=executor,
        reconciler=reconciler, bindings=bindings, id_factory=new_id,
    )
    return service, crew, bindings, root


def pending_decision_frame(slot: str, approval_id: str = "2", revision: int = 1) -> dict[str, Any]:
    """Crew's raw frame for a tool prompt that is waiting for an answer."""

    return {
        "type": "shared_crew.decision",
        "data": {
            "type": "shared_crew.decision",
            "schema_version": 1,
            "decision": {
                "decision_id": f"approval:5:{slot}:{approval_id}",
                "kind": "approval",
                "session_key": slot,
                "state": "pending",
                "revision": revision,
                "outcome": "",
            },
        },
    }


def resolved_frame(slot: str, mid: str, approved: bool, approval_id: str = "2") -> dict[str, Any]:
    """Crew's raw frame once a prompt was answered (by anyone)."""

    return {
        "type": "approval_resolved",
        "data": {"id": approval_id, "approved": approved, "slot": slot, "mid": mid},
    }


def execution_input(proposal_id: str, action: dict[str, Any]) -> dict[str, Any]:
    """What a tinker passes to ``execute_approved_action``."""

    return {"proposal_id": proposal_id, "action": action}


def tinker_delete(path: str = "src/old.py") -> dict[str, Any]:
    """The model-supplied part of a delete proposal."""

    return {
        "kind": "delete_path",
        "working_directory": "",
        "arguments": {"path": path, "target": "file"},
        "path_intents": [{"access": "delete", "path": path}],
    }


def full_descriptor(binding: RoomBinding, fields: dict[str, Any]) -> dict[str, Any]:
    policy = room_policy(binding.role, binding.spec)
    assert policy is not None
    return {
        "schema_version": 1,
        "mansion_id": binding.mansion,
        "session_slot": binding.slot,
        "room": policy.room,
        **fields,
    }


__all__ = [
    "ALLOWED", "APP", "APP_KEY", "MANSION", "SERVER", "SPEC", "TOOL",
    "FakeCrew", "FlakyWriter", "House", "MemoryCrew", "SpyRunner", "memory_house", "UnavailableRunner", "full_descriptor", "house",
    "execution_input", "pending_decision_frame", "resolved_frame", "tinker_delete", "IN_RUN_TS", "CLOCK_MS",
]
