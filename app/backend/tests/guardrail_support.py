"""Shared builders for the Doors-and-Guardrails tests.

Canonical records are produced by the real Spec 2 preparation path
(``prepare_candidates`` + ``build_app_event``), so tests never hand-assemble
an Event_ID, Record_ID, or Sequence.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence

from haunted_house.core.guardrail_events import GuardrailEventKind, Phase
from haunted_house.core.seance_event import AppEvent, AppEventCandidate, EventScope, EventSource
from haunted_house.core.seance_persistence import (
    AppendResult,
    CanonicalReadResult,
    WriterDiagnostic,
    WriterDiagnosticCode,
    build_app_event,
    prepare_candidates,
)

MANSION = "demo-mansion"
SPEC = "demo-feature"
SHA_A = "a" * 64
SHA_B = "b" * 64
SHA_C = "c" * 64

SESSION_SCOPE = EventScope(
    mansion_id=MANSION,
    ghost_id="tinker-1",
    session_slot="workshop-slot-1",
    run_id="implementation-1",
    run_sequence=1,
)


def spec_path(phase: Phase | str, spec: str = SPEC) -> str:
    return f".kiro/specs/{spec}/{Phase(phase).value}.md"


def other_event(identity: str, scope: EventScope = SESSION_SCOPE) -> AppEventCandidate:
    """A valid record that is not a Spec 4 fact."""

    return AppEventCandidate(
        schema_version=1,
        event_type="message_recorded",
        scope=scope,
        source=EventSource(
            origin="crew",
            source_type="chat_message",
            identity_parts=(identity,),
            revision=0,
            generation="",
            source_sequence=0,
        ),
        caused_by=(),
        occurred_at_ms=None,
        payload={"role": "assistant"},
    )


def foreign_domain_event(identity: str, kind: str = "door_approved") -> AppEventCandidate:
    """Another domain reusing a Spec 4 kind name."""

    return AppEventCandidate(
        schema_version=1,
        event_type="domain_event_recorded",
        scope=SESSION_SCOPE,
        source=EventSource(
            origin="house",
            source_type="other_domain",
            identity_parts=(identity,),
            revision=0,
            generation="",
            source_sequence=0,
        ),
        caused_by=(),
        occurred_at_ms=None,
        payload={
            "domain": "room_ghosts",
            "kind": kind,
            "entity_id": identity,
            "data": {"phase": "requirements"},
        },
    )


def acknowledge(
    candidates: Iterable[object], *, start: int = 1, existing: Sequence[AppEvent] = ()
) -> tuple[AppEvent, ...]:
    """Turn candidates into acknowledged records with contiguous Sequence."""

    prepared = prepare_candidates(tuple(candidates))
    assert prepared.ok, prepared.diagnostics
    return tuple(
        build_app_event(item, sequence=start + index, persisted_at_ms=1_731_400_000_000, prev_hash=None)
        for index, item in enumerate(prepared.candidates)
    )


class MemoryWriter:
    """An in-memory ``CanonicalEventWriter`` built from Spec 2's pure pieces.

    It models the contract (all-or-nothing batches, exact-retry
    acknowledgement, optimistic comparison) and counts calls so tests can
    assert acknowledgement order.  It is a test double, not a second store.
    """

    def __init__(self) -> None:
        self.events: list[AppEvent] = []
        self.calls: list[tuple[str, int | None, int]] = []
        self.fail_next: list[str] = []
        self.fail_reads = False

    @property
    def highest(self) -> int:
        return len(self.events)

    async def append_candidates(self, mansion_id, candidates) -> AppendResult:
        return self._append(mansion_id, candidates, None)

    async def compare_and_append(self, mansion_id, expected_sequence, candidates) -> AppendResult:
        return self._append(mansion_id, candidates, expected_sequence)

    def _append(self, mansion_id, candidates, expected) -> AppendResult:
        batch = tuple(candidates)
        self.calls.append(("cas" if expected is not None else "append", expected, len(batch)))
        if self.fail_next:
            status = self.fail_next.pop(0)
            if status:
                return AppendResult(
                    highest_sequence=self.highest,
                    diagnostics=(WriterDiagnostic(WriterDiagnosticCode.PERSISTENCE_FAILED, status),),
                    status=status,  # type: ignore[arg-type]
                )
        prepared = prepare_candidates(batch)
        if not prepared.ok:
            return AppendResult(diagnostics=prepared.diagnostics, status="invalid")
        if any(item.candidate.scope.mansion_id != mansion_id for item in prepared.candidates):
            return AppendResult(status="invalid")
        if expected is not None and expected != self.highest:
            return AppendResult(highest_sequence=self.highest, status="conflict")
        by_record = {event.record_id: event for event in self.events}
        acknowledged: list[AppEvent] = []
        duplicates: list[str] = []
        for item in prepared.candidates:
            if item.record_id in by_record:
                acknowledged.append(by_record[item.record_id])
                duplicates.append(item.record_id)
                continue
            event = build_app_event(
                item,
                sequence=self.highest + 1,
                persisted_at_ms=1_731_400_000_000,
                prev_hash=None,
            )
            self.events.append(event)
            by_record[event.record_id] = event
            acknowledged.append(event)
        return AppendResult(
            events=tuple(acknowledged),
            duplicate_record_ids=tuple(duplicates),
            highest_sequence=self.highest,
        )

    async def read_after(self, mansion_id, after_sequence, limit) -> CanonicalReadResult:
        if self.fail_reads:
            return CanonicalReadResult(status="failed")
        page = tuple(event for event in self.events if event.sequence > after_sequence)[:limit]
        return CanonicalReadResult(
            events=page,
            highest_sequence=self.highest,
            valid_prefix_sequence=self.highest,
            valid_prefix_lines=self.highest,
        )


ALL_KINDS = tuple(GuardrailEventKind)


# --- workflow driving -----------------------------------------------------------

from haunted_house.core import guardrail_events as _ge  # noqa: E402
from haunted_house.core.guardrail_events import operator_scope  # noqa: E402
from haunted_house.core.workflow import (  # noqa: E402
    ArtifactRevision,
    ConfirmStart,
    DecideDoor,
    FailStart,
    StartPhase,
    StartRevision,
    SubmitOutput,
    SupersedeDoor,
    advance_workflow,
    decide_transition,
    initial_workflow,
)

OPERATOR = operator_scope(MANSION)
SHAS = (SHA_A, SHA_B, SHA_C)


def output_path(phase: Phase) -> str:
    return "build/result.txt" if phase is Phase.IMPLEMENTATION else spec_path(phase)


class WorkflowDriver:
    """Decide with the pure machine, acknowledge, and fold incrementally."""

    def __init__(self) -> None:
        self.events: list[AppEvent] = []
        self.projection = initial_workflow()
        self._n = 0

    def new_id(self, prefix: str) -> str:
        self._n += 1
        return f"{prefix}-{self._n}"

    def append(self, *candidates) -> tuple[AppEvent, ...]:
        new = acknowledge(candidates, start=len(self.events) + 1)
        self.events.extend(new)
        self.projection = advance_workflow(self.projection, new)
        return new

    def run(self, command):
        result = decide_transition(self.projection, command)
        if result.ok:
            self.append(*result.candidates)
        return result

    def command(self, action: str, phase: Phase, variant: int):
        """Build one abstract operator or ghost command for the current state."""

        view = self.projection.phases[phase]
        version = self.projection.version
        if action == "start":
            return StartPhase(OPERATOR, phase, self.new_id("cmd"), self.new_id("res"), version)
        if action == "confirm":
            return ConfirmStart(OPERATOR, phase, view.reservation_id or "res-none", "slot-" + phase.value)
        if action == "fail":
            return FailStart(OPERATOR, phase, view.reservation_id or "res-none", "crew_unavailable")
        if action == "revise":
            return StartRevision(OPERATOR, phase, self.new_id("cmd"), "slot-" + phase.value, version)
        if action == "submit":
            artifact = ArtifactRevision(view.last_revision + 1 - (variant % 2 and variant % 3 == 0), SHAS[variant % 3], 10 + variant)
            return SubmitOutput(SESSION_SCOPE, phase, self.new_id("door"), output_path(phase), artifact)
        if action == "supersede":
            return SupersedeDoor(SESSION_SCOPE, phase)
        proposal = view.proposal
        if proposal is None:
            return DecideDoor(
                OPERATOR, "door-none", phase, output_path(phase), ArtifactRevision(1, SHA_A, 1),
                version, action == "approve", "operator", self.new_id("cmd"),
            )
        return DecideDoor(
            OPERATOR, proposal.proposal_id, phase, proposal.document_path,
            proposal.artifact_revision, version, action == "approve", "operator", self.new_id("cmd"),
        )

    def raw(self, action: str, phase: Phase, variant: int) -> AppEventCandidate:
        """A well-formed record that skips the machine's decision entirely."""

        if action == "start":
            return _ge.phase_start_reserved(
                OPERATOR, phase=phase, reservation_id=self.new_id("res"), command_id=self.new_id("cmd"))
        if action == "confirm":
            return _ge.phase_started(
                OPERATOR, phase=phase, reservation_id=f"res-{variant}", session_slot="slot-x")
        if action == "fail":
            return _ge.phase_start_failed(OPERATOR, phase=phase, reservation_id=f"res-{variant}", code="x")
        if action == "revise":
            return _ge.revision_started(
                OPERATOR, phase=phase, command_id=self.new_id("cmd"), session_slot="slot-x")
        if action == "submit":
            return _ge.phase_output_ready(
                SESSION_SCOPE, phase=phase, proposal_id=self.new_id("door"),
                document_path=output_path(phase), revision=1 + variant % 3,
                sha256=SHAS[variant % 3], size_bytes=variant)
        if action == "supersede":
            return _ge.door_superseded(
                SESSION_SCOPE, phase=phase, proposal_id=f"door-{variant}", revision=1,
                sha256=SHAS[variant % 3], code="document_changed")
        builder = _ge.door_approved if action == "approve" else _ge.door_rejected
        return builder(
            OPERATOR, phase=phase, proposal_id=f"door-{variant}", document_path=output_path(phase),
            revision=1 + variant % 3, sha256=SHAS[variant % 3], size_bytes=variant,
            actor="operator", command_id=self.new_id("cmd"))


def natural_step(driver: WorkflowDriver, variant: int) -> tuple[str, Phase]:
    """The next sensible action on the frontier phase, so walks make progress."""

    from haunted_house.core.workflow import PhaseStatus

    frontier = next(
        (view for view in driver.projection.phases.values() if view.status != PhaseStatus.APPROVED),
        None,
    )
    if frontier is None:
        return "start", Phase.IMPLEMENTATION
    action = {
        PhaseStatus.READY: "start",
        PhaseStatus.FAILED: "start",
        PhaseStatus.STARTING: "fail" if variant == 7 else "confirm",
        PhaseStatus.WORKING: "submit",
        PhaseStatus.WAITING: ("reject", "supersede", "approve", "approve")[min(variant, 3)],
        PhaseStatus.REVISION_REQUIRED: "revise" if variant % 2 else "start",
    }.get(frontier.status, "start")
    return action, frontier.phase


WORKFLOW_ACTIONS = ("start", "confirm", "fail", "revise", "submit", "supersede", "approve", "reject")


# --- risky actions ----------------------------------------------------------------

from haunted_house.core.action_descriptor import parse_action_descriptor as _parse_action  # noqa: E402
from haunted_house.core.path_policy import PathDecision, PathDecisionCode  # noqa: E402

ALLOWED = PathDecision(True, PathDecisionCode.OK)
DENIED = PathDecision(False, PathDecisionCode.ROOM_POLICY)


def delete_descriptor(path: str = "src/old.py", **overrides) -> dict:
    raw = {
        "schema_version": 1,
        "mansion_id": MANSION,
        "session_slot": SESSION_SCOPE.session_slot,
        "room": "workshop",
        "kind": "delete_path",
        "working_directory": "",
        "arguments": {"path": path, "target": "file"},
        "path_intents": [{"access": "delete", "path": path}],
    }
    raw.update(overrides)
    return raw


def command_descriptor(argv=("pytest", "-q"), **overrides) -> dict:
    raw = {
        "schema_version": 1,
        "mansion_id": MANSION,
        "session_slot": SESSION_SCOPE.session_slot,
        "room": "workshop",
        "kind": "run_command",
        "working_directory": "",
        "arguments": {"argv": list(argv), "timeout_seconds": 60},
        "path_intents": [
            {"access": "command_read", "path": "tests"},
            {"access": "command_write", "path": "build"},
        ],
    }
    raw.update(overrides)
    return raw


def git_descriptor(operation: str = "add", pathspecs=("src/app.py",), **overrides) -> dict:
    arguments = {"operation": operation, "pathspecs": list(pathspecs)}
    if operation == "commit":
        arguments["message"] = "Add app module"
    raw = {
        "schema_version": 1,
        "mansion_id": MANSION,
        "session_slot": SESSION_SCOPE.session_slot,
        "room": "workshop",
        "kind": "git_write",
        "working_directory": "",
        "arguments": arguments,
        "path_intents": [{"access": "git_write", "path": path} for path in pathspecs],
    }
    raw.update(overrides)
    return raw


def parsed(raw: dict):
    descriptor = _parse_action(raw)
    assert not hasattr(descriptor, "code"), descriptor
    return descriptor
