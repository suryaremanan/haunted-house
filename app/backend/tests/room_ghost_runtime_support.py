"""Shared builders for the Room Ghosts runtime tests (claims, scheduling).

Acknowledged records are built with the real Spec 2 preparation and record
builder, so a test folds exactly what the writer would have returned.
"""

from __future__ import annotations

import hashlib
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from hypothesis import strategies as st

from haunted_house.adapters.guarded_filesystem import GuardedFilesystem
from haunted_house.adapters.room_tool_service import RoomToolService
from haunted_house.adapters.session_bindings import RoomBinding
from haunted_house.core.ghost_result import ArtifactRef, GhostResult, GhostStatus, print_ghost_result
from haunted_house.core.ghost_run import GhostRunBinding
from haunted_house.core.guardrail_events import Phase
from haunted_house.services.canonical_port import CanonicalRunPort
from haunted_house.services.room_artifacts import (
    GuardedArtifactInspector,
    RoomGhostOutputValidator,
    WorkflowOutputPort,
    run_binding_for,
)
from haunted_house.services.task_claims import TaskClaimService
from haunted_house.services.task_plan_writer import TaskPlanWriter
from haunted_house.services.terminal_gate import ValidatedTerminalGate

from haunted_house.core.seance_event import AppEvent, AppEventCandidate, EventScope
from haunted_house.core.seance_persistence import build_app_event, prepare_candidates
from haunted_house.core.task_claims import ClaimState, TaskClaim, claim_id_for
from haunted_house.core.task_plan import LeafTask, TaskPlan, print_task_plan
from haunted_house.core.workshop_scheduler import TaskOutcome, WorkshopState
from tests.room_ghost_support import read_fixture, task_plans

MANSION = "demo-mansion"
CLOCK_MS = 1_731_400_000_000
# Paths that overlap one another in known ways, plus disjoint ones.
SHARED_CLAIMS = (
    ("src/shared/**",),
    ("src/shared/a.py",),
    ("src/shared/b.py",),
    ("src/*.py",),
    ("src/main.py",),
    ("docs/guide.md",),
    ("lib/**", "docs/guide.md"),
    ("weird/[ab].py",),  # unmodelled glob syntax: always a possible overlap
)
STATUSES = ("queued", "active", "complete", "failed", "cancelled", "blocked", "skipped")


def tinker_scope(seat: int, run_sequence: int = 1, mansion: str = MANSION) -> EventScope:
    return EventScope(
        mansion_id=mansion,
        ghost_id=f"tinker-{seat}",
        session_slot=f"slot-tinker-{seat}-{run_sequence}",
        run_id=f"implementation-{run_sequence}",
        run_sequence=run_sequence,
    )


def acknowledge(
    candidates: Sequence[AppEventCandidate], *, after: int = 0
) -> tuple[AppEvent, ...]:
    """What the Spec 2 writer would acknowledge for ``candidates``."""

    prepared = prepare_candidates(list(candidates))
    assert prepared.ok, prepared.diagnostics
    return tuple(
        build_app_event(item, sequence=after + index + 1, persisted_at_ms=CLOCK_MS, prev_hash=None)
        for index, item in enumerate(prepared.candidates)
    )


def claim(task_id: str, paths: tuple[str, ...], seat: int = 1, attempt: int = 1) -> TaskClaim:
    scope = tinker_scope(seat)
    return TaskClaim(
        claim_id=claim_id_for(scope, task_id, attempt),
        run_id=scope.run_id,
        task_id=task_id,
        paths=paths,
        acquired_record_id="r1:" + "0" * 64,
        scope=scope,
        attempt=attempt,
        acquired_sequence=seat,
        state=ClaimState.ACTIVE,
    )


@st.composite
def workshop_states(draw: st.DrawFn) -> WorkshopState:
    """Any Workshop state: plans whose claims may collide, any outcomes."""

    base: TaskPlan = draw(task_plans(min_leaves=1, max_leaves=8))
    # A fresh Workshop (nothing done yet) is where several tasks start at once.
    fresh = draw(st.booleans())
    leaves = []
    for leaf in base.leaves:
        writes = leaf.writes
        if draw(st.integers(min_value=0, max_value=3 if fresh else 2)) == 0:
            writes = draw(st.sampled_from(SHARED_CLAIMS))
        leaves.append(
            type(leaf)(
                task_id=leaf.task_id,
                title=leaf.title,
                optional=leaf.optional,
                complete=leaf.complete and not fresh,
                requirements=leaf.requirements,
                writes=writes,
                document_index=leaf.document_index,
            )
        )
    waves = base.waves
    if fresh:
        graphed = {task for wave in waves for task in wave}
        missing = tuple(leaf.task_id for leaf in leaves if leaf.task_id not in graphed)
        waves = ((*(waves[0] if waves else ()), *missing), *waves[1:])
    plan = TaskPlan(leaves=tuple(leaves), waves=waves)
    ids = [leaf.task_id for leaf in plan.leaves]
    selected = frozenset(draw(st.lists(st.sampled_from(ids), unique=True, max_size=len(ids))))
    if fresh or draw(st.booleans()):
        selected = frozenset(ids)
    outcomes: dict[str, TaskOutcome] = {}
    for task_id in ids:
        if fresh or draw(st.integers(min_value=0, max_value=2)) == 0:
            continue  # no record: the checkbox decides
        outcomes[task_id] = TaskOutcome(
            status=draw(st.sampled_from(STATUSES)),
            attempt=draw(st.integers(min_value=0, max_value=3)),
        )
    active_ids = [task_id for task_id, outcome in outcomes.items() if outcome.status == "active"]
    by_id = {leaf.task_id: leaf for leaf in plan.leaves}
    claims = [
        claim(task_id, by_id[task_id].writes, seat=index + 1)
        for index, task_id in enumerate(active_ids[:3])
    ]
    # A claim retained by an unconfirmed cancellation belongs to no active task.
    if len(claims) < 3 and draw(st.booleans()):
        claims.append(claim("99.1", draw(st.sampled_from(SHARED_CLAIMS)), seat=len(claims) + 1))
    return WorkshopState(
        plan=plan,
        selected=selected,
        outcomes=outcomes,
        active_claims=tuple(claims),
        backpressure={},
    )


# --- the wired Room Ghosts runtime over a Spec 4 test house -------------------------

REQUIREMENTS = read_fixture("requirements-valid.md")
DESIGN = read_fixture("design-valid.md")
TASKS = read_fixture("task-plan-valid.md")
VALID_DOCUMENT = {Phase.REQUIREMENTS: REQUIREMENTS, Phase.DESIGN: DESIGN, Phase.TASKS: TASKS}


def spec5_validator(root: Path) -> RoomGhostOutputValidator:
    """``house(validator=spec5_validator)``: the Spec 5 output boundary."""

    return RoomGhostOutputValidator(lambda mansion_id: GuardedFilesystem(root, mansion_id))


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def chat_done(slot: str, turn: int = 1, generation: str = "gen-1", **extra: Any) -> dict[str, Any]:
    """Crew's raw frame for an ended turn (only Spec 2 ingest may read it)."""

    data = {"slot": slot, "turn": turn, "turn_gen": generation, "continuing": False,
            "needs_input": False, **extra}
    return {"type": "chat_done", "data": data}


def ready_result(binding: GhostRunBinding, artifacts: dict[str, str], summary: str = "Done.") -> str:
    """The final text of a Ghost that reports ``ready`` (path -> file text)."""

    return print_ghost_result(
        GhostResult(
            schema_version=1,
            run_id=binding.run_id,
            status=GhostStatus.READY,
            summary=summary,
            artifacts=tuple(ArtifactRef(path, sha256_text(text)) for path, text in artifacts.items()),
            task_id=binding.task_id,
            reason_code=None,
        )
    )


@dataclass
class Runtime:
    """Room Ghosts services wired over one ``workflow_support.House``."""

    house: Any
    port: CanonicalRunPort
    claims: TaskClaimService
    writer: TaskPlanWriter
    gate: ValidatedTerminalGate
    rooms: RoomToolService

    def run(self, room: RoomBinding, **facts: Any) -> GhostRunBinding:
        return run_binding_for(room, **facts)

    async def turn_ended(self, slot: str, **frame: Any):
        """Forward one raw ``chat_done`` through Spec 2 ingest; return its record."""

        outcome = await self.house.ingest([chat_done(slot, **frame)])
        assert outcome.status == "ok", outcome
        return outcome.events[0]

    async def terminals(self, binding: GhostRunBinding | None = None) -> list[Any]:
        return [
            event
            for event in (await self.port.read(self.house.mansion.name)).events
            if event.event_type in ("run_completed", "run_failed", "run_blocked")
            and (binding is None or event.scope == binding.scope)
        ]


def runtime(h: Any) -> Runtime:
    """Build the gate, claim service, and plan writer the way the backend will."""

    port = CanonicalRunPort(h.writer)
    claims = TaskClaimService(port)
    writer = TaskPlanWriter(port, lambda mansion_id: GuardedFilesystem(h.root, mansion_id))
    gate = ValidatedTerminalGate(
        port,
        artifacts=GuardedArtifactInspector(h.bindings),
        outputs=WorkflowOutputPort(h.service, port, h.bindings),
        tasks=writer,
        claims=claims,
    )
    rooms = RoomToolService(h.port, h.root, operations=h.service, require_task_claims=True)
    return Runtime(h, port, claims, writer, gate, rooms)


# --- a Workshop with four independent tasks in its first wave ------------------------

WORKSHOP_PLAN = TaskPlan(
    leaves=(
        LeafTask("1.1", "Implement the entry model", False, False, ("1.1", "1.2"),
                 ("src/guestbook/model.py",), 0),
        LeafTask("1.2", "Implement the entry store", False, False, ("1.3", "2.1"),
                 ("src/guestbook/store.py",), 1),
        LeafTask("1.3", "Implement the page renderer", False, False, ("2.2", "2.3"),
                 ("src/guestbook/render.py", "src/guestbook/templates/*.html"), 2),
        LeafTask("1.4", "Implement the feed endpoint", False, False, ("3.1", "3.2"),
                 ("src/guestbook/feed.py",), 3),
        LeafTask("2.1", "Wire the application", False, False, ("3.1",),
                 ("src/guestbook/app.py",), 4),
        LeafTask("2.2", "Write store ordering tests", True, False, ("1.3",),
                 ("tests/test_store.py",), 5),
        # Overlaps task 1.3, which is why it sits in a later wave.
        LeafTask("2.3", "Refine the page templates", False, False, ("2.3",),
                 ("src/guestbook/templates/**",), 6),
    ),
    waves=(("1.1", "1.2", "1.3", "1.4"), ("2.1", "2.2", "2.3")),
)
WORKSHOP_TASKS = print_task_plan(WORKSHOP_PLAN)


async def open_workshop(h: Any, tasks: str = WORKSHOP_TASKS, sessions: int = 4) -> list[RoomBinding]:
    """Approve the three spec Doors and start the Workshop.

    ``sessions`` assignments are requested; Spec 4 seats at most three.
    Returns the bound Tinker sessions in seat order.
    """

    await h.pass_phase(Phase.REQUIREMENTS, REQUIREMENTS)
    await h.pass_phase(Phase.DESIGN, DESIGN)
    await h.pass_phase(Phase.TASKS, tasks)
    await h.start(Phase.IMPLEMENTATION, assignments=[f"seat-{n}" for n in range(sessions)])
    bound = [h.bindings.load(f"dashboard:{key}") for key in h.crew.slots]
    return sorted(
        (item for item in bound if item is not None and item.role == "tinker"),
        key=lambda item: item.ghost,
    )


# --- an in-memory world for property tests (no filesystem, no gateway) ----------------

from haunted_house.adapters.guardrail_port import GuardrailPort  # noqa: E402
from haunted_house.adapters.seance_service import SeanceService  # noqa: E402
from haunted_house.core import guardrail_events as _ge  # noqa: E402
from haunted_house.core.crew_event_normalizer import CrewEnvelope  # noqa: E402
from haunted_house.core.guardrail_events import operator_scope  # noqa: E402
from haunted_house.core.seance_event import AppEventCandidate as _Candidate  # noqa: E402
from haunted_house.core.seance_event import EventSource as _Source  # noqa: E402
from haunted_house.core.task_checkbox import check_task  # noqa: E402
from haunted_house.core.workflow import (  # noqa: E402
    ArtifactRevision,
    ConfirmStart,
    DecideDoor,
    StartPhase,
    SubmitOutput,
    decide_transition,
)
from haunted_house.services.task_plan_writer import CompletionResult  # noqa: E402
from haunted_house.services.terminal_gate import (  # noqa: E402
    ArtifactError,
    ArtifactSnapshot,
    OutputDecision,
)
from tests.guardrail_support import MemoryWriter  # noqa: E402

SPEC = "demo-feature"
_ROLE = {
    Phase.REQUIREMENTS: "archivist", Phase.DESIGN: "draughtsman",
    Phase.TASKS: "foreman", Phase.IMPLEMENTATION: "tinker",
}


def spec_doc(phase: Phase) -> str:
    return f".kiro/specs/{SPEC}/{phase.value}.md"


class MemoryWorld:
    """Spec 2 and Spec 4 pure pieces over one in-memory writer.

    Files live in a dict.  Workflow records are decided by the real Spec 4
    machine and appended through the real ports, raw Crew frames go through
    the real Spec 2 ingest service, and the gate under test is the real one.
    Only the three gate ports are in-memory stand-ins for Spec 4 adapters.
    """

    def __init__(self) -> None:
        self.memory = MemoryWriter()
        self.port = CanonicalRunPort(self.memory)
        self.guardrails = GuardrailPort(self.memory)
        self.seance = SeanceService(self.memory)
        self.claims = TaskClaimService(self.port)
        self.files: dict[str, bytes] = {}
        self.refuse_output: str | None = None
        self.findings: tuple = ()
        self.validated_at: list[int] = []  # highest Sequence when a validation passed
        self.submissions = 0
        self.checkbox_writes: list[str] = []
        self._n = 0
        self.operator = operator_scope(MANSION)

    # --- ids and appends -------------------------------------------------------------

    def new_id(self, prefix: str) -> str:
        self._n += 1
        return f"{prefix}-{self._n:04d}"

    async def _commit(self, command) -> None:
        read = await self.guardrails.read(MANSION)
        decision = decide_transition(read.projection, command)
        assert decision.ok, (decision.code, command)
        ack = await self.guardrails.compare_and_append(
            MANSION, decision.expected_sequence, decision.candidates
        )
        assert ack.ok, ack

    async def projection(self):
        return (await self.guardrails.read(MANSION)).projection

    # --- Spec 4 history ---------------------------------------------------------------

    async def start(self, phase: Phase, ghost: str | None = None, run_sequence: int = 1) -> GhostRunBinding:
        """Reserve and confirm a phase start and register the run with Spec 2."""

        version = (await self.projection()).version
        reservation = self.new_id("res")
        await self._commit(StartPhase(self.operator, phase, self.new_id("cmd"), reservation, version))
        slot = self.new_id("slot")
        await self._commit(ConfirmStart(self.operator, phase, reservation, slot))
        return await self.register(phase, slot, ghost or _ROLE[phase], run_sequence)

    async def register(self, phase: Phase, slot: str, ghost: str, run_sequence: int = 1) -> GhostRunBinding:
        binding = GhostRunBinding(
            run_id=f"{phase.value}-{run_sequence}",
            run_sequence=run_sequence,
            mansion_id=MANSION,
            spec_name=SPEC,
            phase=phase,
            ghost_name=ghost,
            slot=slot,
        )
        started = _Candidate(
            schema_version=1,
            event_type="run_started",
            scope=binding.scope,
            source=_Source("house", "run", (binding.run_id,), 0, "", 0),
            caused_by=(),
            occurred_at_ms=None,
            payload={"reason": "Working", "room": "study"},
        )
        assert (await self.port.append(MANSION, [started])).ok
        return binding

    async def write_spec(self, binding: GhostRunBinding, text: str) -> None:
        """What the room tool records when a Ghost writes its Spec_Document."""

        path = spec_doc(binding.phase)
        data = text.encode("utf-8")
        known = (await self.projection()).documents.get(path)
        base = known.revision if known is not None else 0
        write_id = self.new_id("write")
        common = dict(write_id=write_id, phase=binding.phase, document_path=path,
                      revision=base + 1, sha256=sha256_text(text), size_bytes=len(data))
        prepared = _ge.spec_write_prepared(
            binding.scope, base_revision=base,
            base_sha256=known.sha256 if known is not None else None, **common,
        )
        assert (await self.guardrails.append(MANSION, [prepared])).ok
        self.files[path] = data
        assert (await self.guardrails.append(
            MANSION, [_ge.spec_document_written(binding.scope, **common)]
        )).ok

    async def approve(self, phase: Phase) -> None:
        projection = await self.projection()
        proposal = projection.phases[phase].proposal
        assert proposal is not None and proposal.status == "pending"
        await self._commit(
            DecideDoor(
                self.operator, proposal.proposal_id, phase, proposal.document_path,
                proposal.artifact_revision, projection.version, True, "operator", self.new_id("cmd"),
            )
        )

    async def pass_phase(self, phase: Phase, text: str) -> GhostRunBinding:
        binding = await self.start(phase)
        await self.write_spec(binding, text)
        decision = await self.submit(binding, await self.inspect(binding, spec_doc(phase)))
        assert decision.ok, decision
        await self.approve(phase)
        return binding

    # --- raw Crew frames: Spec 2 ingest only ---------------------------------------------

    async def ingest(self, *frames: dict[str, Any]):
        outcome = await self.seance.ingest(
            MANSION, [CrewEnvelope(type=frame["type"], data=frame["data"]) for frame in frames]
        )
        assert outcome.status == "ok", outcome
        return outcome

    # --- the gate's ports ---------------------------------------------------------------------

    async def inspect(self, binding: GhostRunBinding, path: str) -> ArtifactSnapshot:
        data = self.files.get(path)
        if data is None:
            raise ArtifactError("artifact_missing")
        return ArtifactSnapshot(path, hashlib.sha256(data).hexdigest(), len(data), data)

    async def submit(self, binding: GhostRunBinding, artifact: ArtifactSnapshot) -> OutputDecision:
        """Spec 4 output submission, decided by the real Phase_State_Machine."""

        if self.refuse_output is not None:
            return OutputDecision(False, self.refuse_output)
        read = await self.guardrails.read(MANSION)
        view = read.projection.phases[binding.phase]
        if view.proposal is not None and view.proposal.status == "pending":
            same = view.proposal.artifact_revision.sha256 == artifact.sha256
            return OutputDecision(same, "ok" if same else "artifact_mismatch", view.proposal.proposal_id)
        known = read.projection.documents.get(artifact.path)
        if known is None:
            return OutputDecision(False, "document_missing")
        proposal_id = self.new_id("door")
        decision = decide_transition(
            read.projection, SubmitOutput(binding.scope, binding.phase, proposal_id, artifact.path, known)
        )
        if not decision.ok:
            return OutputDecision(False, decision.code)
        ack = await self.guardrails.compare_and_append(
            MANSION, decision.expected_sequence, decision.candidates
        )
        if not ack.ok:
            return OutputDecision(False, "writer_unavailable")
        self.submissions += 1
        return OutputDecision(True, "ok", proposal_id)

    def validate(self, phase: Phase, text: str, requirement_ids: frozenset[str]) -> tuple:
        if not self.findings:
            self.validated_at.append(self.memory.highest)
        return self.findings

    async def complete_task(self, scope, *, spec_name, task_id, claim_id, evidence=()):
        """The plan writer's contract over the in-memory ``tasks.md``."""

        path = spec_doc(Phase.TASKS)
        edit = check_task(self.files[path].decode("utf-8"), task_id)
        if edit.changed:
            self.files[path] = edit.text.encode("utf-8")
            self.checkbox_writes.append(task_id)
        self.validated_at.append(self.memory.highest)
        return CompletionResult(True, "ok", None, sha256_text(edit.text), duplicate=not edit.changed)

    def gate(self, **overrides: Any) -> ValidatedTerminalGate:
        """A fresh gate: also what a restarted backend builds."""

        ports = type("Ports", (), {"inspect": staticmethod(self.inspect), "submit": staticmethod(self.submit)})
        options: dict[str, Any] = dict(
            artifacts=ports, outputs=ports, tasks=self, claims=self.claims, validator=self.validate
        )
        options.update(overrides)
        return ValidatedTerminalGate(self.port, **options)

    async def terminals(self, binding: GhostRunBinding | None = None) -> list[Any]:
        return [
            event
            for event in self.memory.events
            if event.event_type in ("run_completed", "run_failed", "run_blocked")
            and (binding is None or event.scope == binding.scope)
        ]
