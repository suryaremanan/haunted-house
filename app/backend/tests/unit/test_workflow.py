"""Unit tests for the pure Phase_State_Machine and Door rules (tasks 3.1, 3.4).

Validates: Requirements 1.1–1.9, 2.1–2.6, 6.6, 8.3, 8.5, 10.2, 12.1.
"""

from __future__ import annotations

import ast
import inspect
from dataclasses import replace

import pytest

from haunted_house.core import guardrail_events as ge
from haunted_house.core import workflow
from haunted_house.core.guardrail_events import Phase, operator_scope
from haunted_house.core.workflow import (
    ArtifactRevision,
    ConfirmStart,
    DecideDoor,
    DoorStatus,
    FailStart,
    PhaseStatus,
    StartPhase,
    StartRevision,
    SubmitOutput,
    SupersedeDoor,
    advance_workflow,
    decide_transition,
    fold_workflow,
    initial_workflow,
)
from tests.guardrail_support import (
    MANSION,
    SESSION_SCOPE,
    SHA_A,
    SHA_B,
    acknowledge,
    foreign_domain_event,
    other_event,
    spec_path,
)

pytestmark = pytest.mark.core

OP = operator_scope(MANSION)
ART = ArtifactRevision(1, SHA_A, 100)


class Driver:
    """Applies accepted commands the way a service would: decide, then fold."""

    def __init__(self) -> None:
        self.events: list = []
        self.projection = initial_workflow()
        self._n = 0

    def id(self, prefix: str) -> str:
        self._n += 1
        return f"{prefix}-{self._n}"

    def append(self, *candidates):
        new = acknowledge(candidates, start=len(self.events) + 1)
        self.events.extend(new)
        self.projection = advance_workflow(self.projection, new)
        return new

    def run(self, command):
        result = decide_transition(self.projection, command)
        if result.ok:
            assert result.expected_sequence == self.projection.version
            self.append(*result.candidates)
        return result

    def start(self, phase: Phase):
        reservation = self.id("res")
        result = self.run(StartPhase(OP, phase, self.id("cmd"), reservation, self.projection.version))
        if not result.ok:
            return result
        return self.run(ConfirmStart(OP, phase, reservation, f"{phase.value}-slot"))

    def submit(self, phase: Phase, artifact: ArtifactRevision = ART, path: str | None = None):
        path = path or ("src/result.txt" if phase is Phase.IMPLEMENTATION else spec_path(phase))
        return self.run(SubmitOutput(SESSION_SCOPE, phase, self.id("door"), path, artifact))

    def decide(self, at: Phase, approve: bool = True, **overrides):
        phase = at
        proposal = self.projection.phases[phase].proposal
        fields = dict(
            scope=OP,
            proposal_id=proposal.proposal_id,
            phase=phase,
            document_path=proposal.document_path,
            artifact_revision=proposal.artifact_revision,
            expected_version=self.projection.version,
            approve=approve,
            actor="operator",
            command_id=self.id("cmd"),
        )
        fields.update(overrides)
        return self.run(DecideDoor(**fields))


def test_initial_projection():
    projection = initial_workflow()
    assert projection.version == 0
    assert [view.status for view in projection.phases.values()] == [
        PhaseStatus.READY,
        PhaseStatus.NOT_STARTED,
        PhaseStatus.NOT_STARTED,
        PhaseStatus.NOT_STARTED,
    ]
    assert all(view.door is DoorStatus.SEALED for view in projection.phases.values())
    assert list(projection.phases) == list(Phase)
    assert fold_workflow([]) == projection


def test_the_four_phases_advance_only_through_explicit_starts_and_doors():
    driver = Driver()
    for index, phase in enumerate(Phase):
        later = list(Phase)[index + 1 :]
        for skipped in later:
            assert driver.start(skipped).code == "predecessor_door_sealed"
        assert driver.projection.phases[phase].status is PhaseStatus.READY
        assert driver.start(phase).ok
        assert driver.projection.phases[phase].status is PhaseStatus.WORKING
        assert driver.submit(phase).ok
        view = driver.projection.phases[phase]
        assert (view.status, view.door) == (PhaseStatus.WAITING, DoorStatus.WAITING)
        assert driver.projection.waiting_count == 1
        for skipped in later:
            assert driver.projection.phases[skipped].status is PhaseStatus.NOT_STARTED
        assert driver.decide(phase).ok
        view = driver.projection.phases[phase]
        assert (view.status, view.door) == (PhaseStatus.APPROVED, DoorStatus.OPEN)
        assert view.proposal.status == "approved" and view.proposal.decision_actor == "operator"
        assert view.proposal.decision_event_id == driver.events[-1].event_id
        if later:
            # The successor is ready, never working, until its own start.
            assert driver.projection.phases[later[0]].status is PhaseStatus.READY
            for further in later[1:]:
                assert driver.projection.phases[further].status is PhaseStatus.NOT_STARTED
    assert driver.projection.waiting_count == 0
    assert driver.projection.diagnostics == ()
    assert fold_workflow(driver.events) == driver.projection
    assert driver.projection.version == len(driver.events)


def test_start_reservation_failure_and_explicit_retry():
    driver = Driver()
    assert driver.run(StartPhase(OP, Phase.REQUIREMENTS, "cmd-a", "res-a", 0)).ok
    assert driver.projection.phases[Phase.REQUIREMENTS].status is PhaseStatus.STARTING
    assert driver.run(StartPhase(OP, Phase.REQUIREMENTS, "cmd-b", "res-b", 1)).code == "invalid_state"
    assert driver.run(ConfirmStart(OP, Phase.REQUIREMENTS, "res-x", "slot")).code == "reservation_mismatch"
    assert driver.run(FailStart(OP, Phase.REQUIREMENTS, "res-a", "crew_unavailable")).ok
    view = driver.projection.phases[Phase.REQUIREMENTS]
    assert (view.status, view.failure_code) == (PhaseStatus.FAILED, "crew_unavailable")
    # A used command cannot be replayed; a fresh explicit command retries.
    assert driver.run(StartPhase(OP, Phase.REQUIREMENTS, "cmd-a", "res-c", 2)).code == "duplicate_command"
    assert driver.run(StartPhase(OP, Phase.REQUIREMENTS, "cmd-c", "res-c", 2)).ok
    assert driver.run(ConfirmStart(OP, Phase.REQUIREMENTS, "res-c", "slot")).ok
    assert driver.projection.phases[Phase.REQUIREMENTS].status is PhaseStatus.WORKING


def test_rejection_requires_revision_and_keeps_successors_sealed():
    driver = Driver()
    driver.start(Phase.REQUIREMENTS)
    driver.submit(Phase.REQUIREMENTS)
    assert driver.decide(Phase.REQUIREMENTS, approve=False).ok
    view = driver.projection.phases[Phase.REQUIREMENTS]
    assert (view.status, view.door) == (PhaseStatus.REVISION_REQUIRED, DoorStatus.REJECTED)
    assert view.proposal.status == "rejected"
    assert driver.projection.phases[Phase.DESIGN].status is PhaseStatus.NOT_STARTED
    assert driver.start(Phase.DESIGN).code == "predecessor_door_sealed"
    assert driver.submit(Phase.REQUIREMENTS, ArtifactRevision(2, SHA_B, 5)).code == "invalid_state"

    version = driver.projection.version
    assert driver.run(StartRevision(OP, Phase.REQUIREMENTS, "rev-1", "slot", version)).ok
    assert driver.projection.phases[Phase.REQUIREMENTS].status is PhaseStatus.WORKING
    # A new proposal needs a newer revision than the rejected one.
    assert driver.submit(Phase.REQUIREMENTS, ART).code == "stale_revision"
    assert driver.submit(Phase.REQUIREMENTS, ArtifactRevision(2, SHA_B, 5)).ok
    assert driver.decide(Phase.REQUIREMENTS).ok
    assert driver.projection.phases[Phase.DESIGN].status is PhaseStatus.READY


@pytest.mark.parametrize(
    ("overrides", "code"),
    [
        ({"proposal_id": "door-other"}, "stale_proposal"),
        ({"phase": Phase.DESIGN}, "no_pending_proposal"),
        ({"document_path": spec_path("design")}, "stale_revision"),
        ({"artifact_revision": ArtifactRevision(2, SHA_A, 100)}, "stale_revision"),
        ({"artifact_revision": ArtifactRevision(1, SHA_B, 100)}, "stale_revision"),
        ({"artifact_revision": ArtifactRevision(1, SHA_A, 101)}, "stale_revision"),
        ({"expected_version": 0}, "stale_version"),
        ({"expected_version": 99}, "stale_version"),
        ({"expected_version": "3"}, "stale_version"),
        ({"actor": "ghost"}, "invalid_command"),
        ({"approve": 1}, "invalid_command"),
        ({"command_id": "bad id"}, "invalid_command"),
    ],
)
def test_a_door_decision_must_match_the_current_proposal_exactly(overrides, code):
    for approve in (True, False):
        driver = Driver()
        driver.start(Phase.REQUIREMENTS)
        driver.submit(Phase.REQUIREMENTS)
        before = driver.projection
        if "approve" in overrides:
            approve = overrides["approve"]
        result = driver.decide(Phase.REQUIREMENTS, **{"approve": approve, **overrides})
        assert (result.ok, result.code) == (False, code)
        assert result.candidates == ()
        assert driver.projection == before


def test_a_changed_document_supersedes_the_proposal_instead_of_approving_old_bytes():
    driver = Driver()
    driver.start(Phase.REQUIREMENTS)
    path = spec_path("requirements")
    driver.append(
        ge.spec_write_prepared(
            SESSION_SCOPE, write_id="w1", phase=Phase.REQUIREMENTS, document_path=path,
            base_revision=0, base_sha256=None, revision=1, sha256=SHA_A, size_bytes=100,
        ),
        ge.spec_document_written(
            SESSION_SCOPE, write_id="w1", phase=Phase.REQUIREMENTS, document_path=path,
            revision=1, sha256=SHA_A, size_bytes=100,
        ),
    )
    assert driver.projection.documents[path] == ART
    assert driver.submit(Phase.REQUIREMENTS, ArtifactRevision(1, SHA_B, 100)).code == "artifact_mismatch"
    assert driver.submit(Phase.REQUIREMENTS).ok
    old = driver.projection.phases[Phase.REQUIREMENTS].proposal

    # The Ghost edits the document while the Door is waiting.
    driver.append(
        ge.spec_write_prepared(
            SESSION_SCOPE, write_id="w2", phase=Phase.REQUIREMENTS, document_path=path,
            base_revision=1, base_sha256=SHA_A, revision=2, sha256=SHA_B, size_bytes=7,
        )
    )
    assert driver.decide(Phase.REQUIREMENTS).code == "artifact_changed"
    driver.append(
        ge.spec_document_written(
            SESSION_SCOPE, write_id="w2", phase=Phase.REQUIREMENTS, document_path=path,
            revision=2, sha256=SHA_B, size_bytes=7,
        )
    )
    assert driver.decide(Phase.REQUIREMENTS).code == "artifact_changed"
    assert driver.projection.phases[Phase.REQUIREMENTS].door is DoorStatus.WAITING

    assert driver.run(SupersedeDoor(SESSION_SCOPE, Phase.REQUIREMENTS)).ok
    view = driver.projection.phases[Phase.REQUIREMENTS]
    assert (view.status, view.door, view.proposal.status) == (
        PhaseStatus.WORKING, DoorStatus.SEALED, "superseded",
    )
    # The superseded proposal can no longer be decided.
    stale = DecideDoor(OP, old.proposal_id, Phase.REQUIREMENTS, path, old.artifact_revision,
                       driver.projection.version, True, "operator", "cmd-late")
    assert driver.run(stale).code == "no_pending_proposal"
    assert driver.run(SupersedeDoor(SESSION_SCOPE, Phase.REQUIREMENTS)).code == "no_pending_proposal"
    assert driver.submit(Phase.REQUIREMENTS, ArtifactRevision(2, SHA_B, 7)).ok
    assert driver.decide(Phase.REQUIREMENTS).ok
    assert fold_workflow(driver.events) == driver.projection


def test_spec_write_evidence_tracks_revisions_and_recovery():
    driver = Driver()
    driver.start(Phase.REQUIREMENTS)
    path = spec_path("requirements")

    def prepared(write_id, base, base_sha, revision, sha, phase=Phase.REQUIREMENTS, doc=path):
        return ge.spec_write_prepared(
            SESSION_SCOPE, write_id=write_id, phase=phase, document_path=doc,
            base_revision=base, base_sha256=base_sha, revision=revision, sha256=sha, size_bytes=1,
        )

    def codes():
        return [d.code for d in driver.projection.diagnostics]

    driver.append(prepared("w0", 0, None, 1, SHA_A, phase=Phase.DESIGN, doc=spec_path("design")))
    driver.append(prepared("w0", 3, SHA_B, 4, SHA_A))
    driver.append(prepared("w0", 0, None, 1, SHA_A, doc=spec_path("design")))
    assert codes() == ["invalid_state", "stale_revision", "document_mismatch"]
    driver.append(prepared("w1", 0, None, 1, SHA_A))
    assert driver.projection.pending_writes["w1"].artifact_revision == ArtifactRevision(1, SHA_A, 1)
    driver.append(prepared("w2", 0, None, 1, SHA_B))
    assert codes()[-1] == "write_pending"
    assert driver.submit(Phase.REQUIREMENTS, ArtifactRevision(1, SHA_A, 1)).code == "write_pending"

    driver.append(ge.spec_write_uncertain(
        SESSION_SCOPE, write_id="w1", phase=Phase.REQUIREMENTS, document_path=path, code="digest_unknown"))
    assert driver.projection.pending_writes["w1"].uncertain
    assert driver.submit(Phase.REQUIREMENTS, ArtifactRevision(1, SHA_A, 1)).code == "write_pending"
    driver.append(ge.spec_write_recovered(
        SESSION_SCOPE, write_id="w1", phase=Phase.REQUIREMENTS, document_path=path, outcome="not_applied"))
    assert not driver.projection.pending_writes and path not in driver.projection.documents

    driver.append(prepared("w3", 0, None, 1, SHA_A))
    driver.append(ge.spec_write_recovered(
        SESSION_SCOPE, write_id="w3", phase=Phase.REQUIREMENTS, document_path=path, outcome="completed"))
    assert driver.projection.documents[path] == ArtifactRevision(1, SHA_A, 1)
    driver.append(ge.spec_document_written(
        SESSION_SCOPE, write_id="w3", phase=Phase.REQUIREMENTS, document_path=path,
        revision=1, sha256=SHA_A, size_bytes=1))
    assert codes()[-1] == "write_missing"
    assert fold_workflow(driver.events) == driver.projection


def test_invalid_records_yield_diagnostics_and_preserve_the_valid_projection():
    driver = Driver()
    driver.start(Phase.REQUIREMENTS)
    before = driver.projection
    bogus = [
        ge.phase_started(OP, phase=Phase.DESIGN, reservation_id="res-z", session_slot="s"),
        ge.phase_start_reserved(OP, phase=Phase.TASKS, reservation_id="res-y", command_id="cmd-y"),
        ge.door_approved(
            OP, phase=Phase.REQUIREMENTS, proposal_id="door-none", document_path=spec_path("requirements"),
            revision=1, sha256=SHA_A, size_bytes=1, actor="operator", command_id="cmd-z"),
        ge.phase_output_ready(
            SESSION_SCOPE, phase=Phase.REQUIREMENTS, proposal_id="door-9",
            document_path=spec_path("design"), revision=1, sha256=SHA_A, size_bytes=1),
        ge.phase_output_ready(
            SESSION_SCOPE, phase=Phase.IMPLEMENTATION, proposal_id="door-8",
            document_path="src/x.py", revision=1, sha256=SHA_A, size_bytes=1),
        ge.phase_start_denied(OP, phase=Phase.DESIGN, command_id="cmd-d", code="predecessor_door_sealed"),
        other_event("chat-1"),
        foreign_domain_event("f-1"),
    ]
    driver.append(*bogus)
    after = driver.projection
    assert after.phases == before.phases
    assert after.version == before.version + len(bogus)
    assert [(d.sequence - before.version, d.kind, d.code) for d in after.diagnostics] == [
        (1, "phase_started", "invalid_state"),
        (2, "phase_start_reserved", "predecessor_door_sealed"),
        (3, "door_approved", "no_pending_proposal"),
        (4, "phase_output_ready", "document_mismatch"),
        (5, "phase_output_ready", "invalid_state"),
    ]
    assert fold_workflow(driver.events) == after
    assert fold_workflow(reversed(driver.events)) == after


def test_crew_permission_prompts_count_as_waiting_until_decided():
    crew = replace(other_event("perm"), event_type="approval_requested")
    crew = replace(crew, source=replace(crew.source, source_type="crew_approval"), payload={"mid": "m-1"})
    decided = replace(crew, event_type="approval_decided", payload={"mid": "m-1", "outcome": "approved"})
    events = acknowledge([crew])
    projection = fold_workflow(events)
    assert dict(projection.pending_permissions) == {(SESSION_SCOPE.session_slot, "m-1"): 1}
    assert projection.waiting_count == 1
    projection = advance_workflow(projection, acknowledge([decided], start=2))
    assert not projection.pending_permissions and projection.waiting_count == 0


def test_decisions_are_refused_while_integrity_is_not_valid():
    for integrity in ("corrupt", "uncertain"):
        projection = fold_workflow([], integrity=integrity)
        result = decide_transition(projection, StartPhase(OP, Phase.REQUIREMENTS, "c", "r", 0))
        assert (result.ok, result.code, result.candidates) == (False, "integrity_unavailable", ())


def test_malformed_commands_are_refused_without_a_candidate():
    projection = initial_workflow()
    for command in (
        StartPhase(OP, "review", "c", "r", 0),  # type: ignore[arg-type]
        StartPhase(OP, Phase.REQUIREMENTS, "c", "bad reservation", 0),
        StartPhase("scope", Phase.REQUIREMENTS, "c", "r", 0),  # type: ignore[arg-type]
        SubmitOutput(SESSION_SCOPE, Phase.REQUIREMENTS, "d", "../x.md", ART),
        SubmitOutput(SESSION_SCOPE, Phase.REQUIREMENTS, "d", spec_path("requirements"), "art"),  # type: ignore[arg-type]
        FailStart(OP, Phase.REQUIREMENTS, "r", "Free text error"),
    ):
        result = decide_transition(projection, command)
        assert (result.ok, result.candidates) == (False, ()), command
        assert result.code == "invalid_command"


def test_the_module_is_pure():
    for module in (workflow,):
        roots = set()
        for node in ast.walk(ast.parse(inspect.getsource(module))):
            if isinstance(node, ast.Import):
                roots.update(alias.name.partition(".")[0] for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                roots.add(node.module.partition(".")[0])
        assert roots <= {"__future__", "collections", "dataclasses", "enum", "types", "typing", "haunted_house"}
