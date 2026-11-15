"""WorkflowService, restart, and recovery (Doors and Guardrails tasks 9.1,
9.2, 9.4).

The real Spec 2 file writer, the guarded filesystem, and the executor run in
temporary directories around a fake Crew gateway.  The tests cover phase
order and explicit starts, failed reservations, exact Door and risky
decisions, prepared writes, consumed actions without outcomes, late
resolutions, writer failures, restart reads, and the canonical evidence that
tells allowed, denied, and failed operations apart.

Validates: Requirements 1.3–1.8, 2.1–2.6, 3.2, 3.3, 3.5, 3.8, 5.8, 6.7,
7.9, 8.2, 8.6, 8.7, 10.1, 10.4, 10.5, 10.7.
"""

from __future__ import annotations

import asyncio
import hashlib
from dataclasses import replace

import pytest

from haunted_house.adapters.workflow_service import WorkflowError
from haunted_house.core import guardrail_events as ge
from haunted_house.core.approvals import ProposalStatus
from haunted_house.core.guardrail_events import Phase, operator_scope
from haunted_house.core.seance_event import AppEventCandidate, EventSource
from haunted_house.core.workflow import DoorStatus, PhaseStatus
from haunted_house.core.workflow_projector import projection_summary, replay_projection
from tests.workflow_support import (
    MANSION,
    SPEC,
    FlakyWriter,
    UnavailableRunner,
    execution_input,
    house,
    resolved_frame,
    tinker_delete,
)

REQUIREMENTS, DESIGN, TASKS, IMPLEMENTATION = Phase


def _run(scenario, tmp_path, **options):
    async def go():
        async with house(tmp_path, **options) as built:
            return await scenario(built)

    return asyncio.run(go())


async def _error(awaitable) -> WorkflowError:
    with pytest.raises(WorkflowError) as error:
        await awaitable
    return error.value


def _phase(view, phase):
    return view.read.projection.phases[phase]


# --- phase order and explicit starts ---------------------------------------------------------


def test_the_four_phases_advance_only_through_explicit_starts_and_exact_doors(tmp_path):
    async def scenario(h):
        seen = []
        for phase in (REQUIREMENTS, DESIGN, TASKS):
            # Nothing later can start while this Door is sealed.
            for later in list(Phase)[list(Phase).index(phase) + 1:]:
                refused = await _error(h.start(later))
                assert refused.code == "predecessor_door_sealed"
            calls = len(h.crew.calls)
            started = await h.start(phase)
            assert h.crew.steps()[calls:] == ["create_slot", "set_project", "set_mode", "send_turn"]
            assert _phase(started.view, phase).status is PhaseStatus.WORKING
            binding = h.binding(_phase(started.view, phase).session_slot)
            assert (await h.write_spec(binding, f"# {phase.value}\n\nBody.\n")).status == "written"
            submitted = await h.service.submit_phase_output(binding)
            waiting = await h.view(reconcile=False)
            assert submitted.ok and _phase(waiting, phase).status is PhaseStatus.WAITING
            calls = len(h.crew.calls)
            approved = await h.decide_door(True)
            successor = list(Phase)[list(Phase).index(phase) + 1]
            # The Door opens; the successor is only ready, and Crew was not called.
            assert _phase(approved.view, phase).door is DoorStatus.OPEN
            assert _phase(approved.view, successor).status is PhaseStatus.READY
            assert len(h.crew.calls) == calls
            seen.append((binding.ghost, binding.role, binding.room, binding.run_id))
        started = await h.start(IMPLEMENTATION)
        tinker = h.binding(_phase(started.view, IMPLEMENTATION).session_slot)
        (h.mansion / "build").mkdir()
        (h.mansion / "build" / "result.txt").write_text("done\n", encoding="utf-8")
        submitted = await h.service.submit_phase_output(tinker, "build/result.txt")
        final = await h.decide_door(True)
        return seen, tinker, submitted, final, h

    seen, tinker, submitted, final, h = _run(scenario, tmp_path)
    assert seen == [
        ("archivist", "archivist", "study", "requirements-1"),
        ("draughtsman", "draughtsman", "drafting_room", "design-1"),
        ("foreman", "foreman", "workshop", "tasks-1"),
    ]
    assert (tinker.ghost, tinker.role, tinker.room) == ("tinker-1", "tinker", "workshop")
    assert submitted.ok and submitted.data["document_path"] == "build/result.txt"
    assert [view.door for view in final.view.read.projection.phases.values()] == [DoorStatus.OPEN] * 4
    assert [slot["create"]["agent"] for slot in h.crew.slots.values()] == [
        "hh-archivist", "hh-draughtsman", "hh-foreman", "hh-tinker"]
    assert all(slot["mode"] == "normal" and len(slot["turns"]) == 1 for slot in h.crew.slots.values())
    body = final.view.to_json()
    assert [phase["ghost_ids"] for phase in body["phases"]] == [
        ["archivist"], ["draughtsman"], ["foreman"], ["tinker-1"]]
    assert body["waiting_count"] == 0 and body["version"] == final.view.version


def test_start_commands_are_exact_idempotent_and_never_stale(tmp_path):
    async def scenario(h):
        stale = await _error(
            h.service.start_phase(MANSION, REQUIREMENTS, command_id="cmd-stale-01", expected_version=7))
        unknown = await _error(
            h.service.start_phase("other-mansion", REQUIREMENTS, command_id="cmd-other-01", expected_version=0))
        invalid = await _error(
            h.service.start_phase("Not A Mansion", REQUIREMENTS, command_id="cmd-other-02", expected_version=0))
        untouched = (len(h.crew.calls), (await h.view(reconcile=False)).version)

        first = await h.service.start_phase(MANSION, REQUIREMENTS, command_id="cmd-start-01", expected_version=0)
        calls = len(h.crew.calls)
        again = await h.service.start_phase(MANSION, REQUIREMENTS, command_id="cmd-start-01", expected_version=0)
        conflict = await _error(
            h.service.start_phase(MANSION, DESIGN, command_id="cmd-start-01", expected_version=first.view.version))
        twice = await _error(h.start(REQUIREMENTS))
        return stale, unknown, invalid, untouched, first, again, conflict, twice, calls, h

    stale, unknown, invalid, untouched, first, again, conflict, twice, calls, h = _run(scenario, tmp_path)
    assert (stale.code, unknown.code, invalid.code) == ("stale_version", "mansion_not_found", "invalid_mansion_id")
    assert stale.view is not None and stale.view.version == 0
    assert untouched == (0, 0)  # refused commands reached neither Crew nor the log
    assert first.event.payload["kind"] == "phase_start_reserved" and not first.duplicate
    assert again.duplicate and again.event == first.event
    assert len(h.crew.calls) == calls  # the retry started no second session
    assert conflict.code == "command_conflict"
    assert twice.code == "invalid_state"


# --- failed reservations -----------------------------------------------------------------------


@pytest.mark.parametrize(
    ("step", "status", "code", "sent"),
    [
        ("create_slot", 500, "crew_failed", False),
        ("set_project", 403, "crew_failed", False),
        ("set_mode", 400, "crew_failed", False),
        ("send_turn", 502, "crew_failed", False),
    ],
)
def test_a_crew_failure_leaves_the_phase_failed_and_retryable_only_explicitly(tmp_path, step, status, code, sent):
    async def scenario(h):
        h.crew.fail[step] = (status, {"error": "nope"})
        failed = await _error(h.start(REQUIREMENTS))
        view = failed.view
        turns = [slot["turns"] for slot in h.crew.slots.values()]
        kinds = await h.kinds()
        calls = len(h.crew.calls)
        idle = await h.view()  # reading never restarts anything
        h.crew.fail = {}
        retried = await h.start(REQUIREMENTS)
        return failed, view, turns, kinds, calls, idle, retried, len(h.crew.calls)

    failed, view, turns, kinds, calls, idle, retried, calls_after = _run(scenario, tmp_path)
    assert failed.code == code
    assert _phase(view, REQUIREMENTS).status is PhaseStatus.FAILED
    assert _phase(view, REQUIREMENTS).failure_code == code
    assert kinds == ["phase_start_reserved", "phase_start_failed"]
    assert all(not turn for turn in turns)
    assert _phase(idle, REQUIREMENTS).status is PhaseStatus.FAILED
    assert _phase(retried.view, REQUIREMENTS).status is PhaseStatus.WORKING
    assert calls_after == calls + 4


def test_a_missing_binding_store_or_a_writer_failure_fails_the_start_closed(tmp_path):
    async def no_bindings(h):
        failed = await _error(h.start(REQUIREMENTS))
        return failed.code, _phase(failed.view, REQUIREMENTS).failure_code, h.crew.steps()

    code, recorded, steps = _run(no_bindings, tmp_path / "a", with_bindings=False)
    assert (code, recorded) == ("binding_failed", "binding_failed")
    # No session was created for a Ghost whose room tools could not be bound.
    assert steps == []

    holder = {}

    def wrap(store):
        holder["writer"] = FlakyWriter(store)
        return holder["writer"]

    async def flaky(h):
        writer = holder["writer"]
        writer.fail["phase_start_reserved"] = ["failed"]
        unreserved = await _error(h.start(REQUIREMENTS))
        nothing = (h.crew.steps(), (await h.view(reconcile=False)).version)

        writer.fail["run_started"] = ["failed"]
        unregistered = await _error(h.start(REQUIREMENTS))
        turns = [slot["turns"] for slot in h.crew.slots.values()]

        writer.fail["phase_started"] = ["failed"]
        unconfirmed = await _error(h.start(REQUIREMENTS))
        state = _phase(unconfirmed.view, REQUIREMENTS)

        writer.fail_reads = True
        blocked = await _error(h.start(REQUIREMENTS))
        shown = await h.view()
        writer.fail_reads = False
        return unreserved, nothing, unregistered, turns, unconfirmed, state, blocked, shown

    unreserved, nothing, unregistered, turns, unconfirmed, state, blocked, shown = _run(
        flaky, tmp_path / "b", wrap_writer=wrap)
    assert unreserved.code == "writer_unavailable" and nothing == ([], 0)
    assert unregistered.code == "writer_unavailable" and turns == [[]]
    assert unconfirmed.code == "writer_unavailable"
    assert (state.status, state.failure_code) == (PhaseStatus.FAILED, "writer_unavailable")
    assert blocked.code == "integrity_unavailable"
    assert shown.to_json()["integrity"] == "uncertain"


# --- exact Door decisions ---------------------------------------------------------------------


async def _waiting_requirements(h, text="# Requirements\n\nBody.\n"):
    await h.start(REQUIREMENTS)
    view = await h.view(reconcile=False)
    binding = h.binding(_phase(view, REQUIREMENTS).session_slot)
    assert (await h.write_spec(binding, text)).status == "written"
    assert (await h.service.submit_phase_output(binding)).ok
    view = await h.view(reconcile=False)
    return binding, _phase(view, REQUIREMENTS).proposal, view


def test_a_door_decision_must_name_the_current_proposal_revision_and_version(tmp_path):
    async def scenario(h):
        binding, proposal, view = await _waiting_requirements(h)
        exact = dict(
            approve=True, phase=proposal.phase, document_path=proposal.document_path,
            artifact_revision=proposal.artifact_revision, command_id="cmd-door-0001",
            expected_version=view.version,
        )
        artifact = proposal.artifact_revision
        changes = {
            "stale_version": dict(expected_version=view.version - 1),
            "stale_revision": dict(artifact_revision=replace(artifact, revision=artifact.revision + 1)),
            "stale_revision ": dict(artifact_revision=replace(artifact, sha256="f" * 64)),
            "stale_revision  ": dict(artifact_revision=replace(artifact, size_bytes=artifact.size_bytes + 1)),
            "stale_revision   ": dict(document_path=".kiro/specs/demo-feature/design.md"),
            "no_pending_proposal": dict(phase=DESIGN),
        }
        refused = {}
        for code, change in changes.items():
            error = await _error(h.service.decide_door(MANSION, proposal.proposal_id, **{**exact, **change}))
            refused[code] = error.code
        missing = await _error(h.service.decide_door(MANSION, "door-unknown", **exact))
        before = (await h.kinds(), (await h.view(reconcile=False)).version)

        approved = await h.service.decide_door(MANSION, proposal.proposal_id, **exact)
        retry = await h.service.decide_door(MANSION, proposal.proposal_id, **exact)
        rival = await _error(
            h.service.decide_door(
                MANSION, proposal.proposal_id,
                **{**exact, "approve": False, "command_id": "cmd-door-0002",
                   "expected_version": approved.view.version},
            )
        )
        reused = await _error(
            h.service.decide_door(MANSION, proposal.proposal_id, **{**exact, "approve": False}))
        return refused, missing, before, view, approved, retry, rival, reused, await h.kinds()

    refused, missing, before, view, approved, retry, rival, reused, kinds = _run(scenario, tmp_path)
    assert {code.strip(): got for code, got in refused.items()} == {
        "stale_version": "stale_version",
        "stale_revision": "stale_revision",
        "no_pending_proposal": "no_pending_proposal",
    }
    assert missing.code == "proposal_not_found"
    # Not one refused decision appended a record or opened the Door.
    assert before == (["phase_start_reserved", "phase_started", "spec_write_prepared",
                       "spec_document_written", "phase_output_ready"], view.version)
    assert approved.event.payload["kind"] == "door_approved"
    assert approved.event.sequence == approved.view.version
    assert retry.duplicate and retry.event == approved.event
    assert rival.code == "no_pending_proposal" and reused.code == "command_conflict"
    assert kinds.count("door_approved") == 1 and "door_rejected" not in kinds


def test_concurrent_door_decisions_have_exactly_one_winner(tmp_path):
    async def scenario(h):
        _binding, proposal, view = await _waiting_requirements(h)

        async def decide(index: int):
            try:
                return await h.service.decide_door(
                    MANSION, proposal.proposal_id,
                    approve=index % 2 == 0, phase=proposal.phase,
                    document_path=proposal.document_path,
                    artifact_revision=proposal.artifact_revision,
                    command_id=f"cmd-race-{index:04d}", expected_version=view.version,
                )
            except WorkflowError as error:
                return error

        outcomes = await asyncio.gather(*(decide(index) for index in range(6)))
        return outcomes, await h.view(reconcile=False), await h.kinds()

    outcomes, final, kinds = _run(scenario, tmp_path)
    winners = [item for item in outcomes if not isinstance(item, WorkflowError)]
    losers = [item for item in outcomes if isinstance(item, WorkflowError)]
    assert len(winners) == 1 and len(losers) == 5
    assert {error.code for error in losers} <= {"stale_version", "no_pending_proposal"}
    decided = winners[0].event.payload["kind"]
    assert kinds.count("door_approved") + kinds.count("door_rejected") == 1
    proposal = _phase(final, REQUIREMENTS).proposal
    assert proposal.status == ("approved" if decided == "door_approved" else "rejected")
    assert proposal.decision_event_id == winners[0].event.event_id


def test_a_rejection_requires_a_revision_started_by_a_separate_command(tmp_path):
    async def scenario(h):
        _binding, _proposal, _view = await _waiting_requirements(h)
        calls = len(h.crew.calls)
        rejected = await h.decide_door(False)
        untouched = len(h.crew.calls) == calls
        sealed = await _error(h.start(DESIGN))
        restarted = await h.start(REQUIREMENTS)
        second = h.binding(_phase(restarted.view, REQUIREMENTS).session_slot)
        stale = await h.write_spec(second, "# Requirements\n\nRevised.\n", expected_revision=0)
        written = await h.write_spec(second, "# Requirements\n\nRevised.\n", expected_revision=1)
        submitted = await h.service.submit_phase_output(second)
        approved = await h.decide_door(True)
        return rejected, untouched, sealed, restarted, second, stale, written, submitted, approved

    rejected, untouched, sealed, restarted, second, stale, written, submitted, approved = _run(
        scenario, tmp_path)
    view = _phase(rejected.view, REQUIREMENTS)
    assert (view.status, view.door) == (PhaseStatus.REVISION_REQUIRED, DoorStatus.REJECTED)
    assert _phase(rejected.view, DESIGN).status is PhaseStatus.NOT_STARTED
    assert untouched and sealed.code == "predecessor_door_sealed"
    assert _phase(restarted.view, REQUIREMENTS).status is PhaseStatus.WORKING
    assert (second.slot, second.run_id, second.run_sequence) == ("slot-2", "requirements-2", 2)
    assert (stale.status, stale.code) == ("conflict", "stale_revision")
    assert written.status == "written" and submitted.data["artifact_revision"]["revision"] == 2
    assert _phase(approved.view, REQUIREMENTS).door is DoorStatus.OPEN


def test_a_changed_document_supersedes_the_proposal_instead_of_being_approved(tmp_path):
    async def scenario(h):
        binding, proposal, view = await _waiting_requirements(h)
        # The Ghost writes again after proposing: the old proposal is superseded.
        rewritten = await h.write_spec(binding, "# Requirements\n\nChanged.\n", expected_revision=1)
        old = await _error(
            h.service.decide_door(
                MANSION, proposal.proposal_id, approve=True, phase=proposal.phase,
                document_path=proposal.document_path, artifact_revision=proposal.artifact_revision,
                command_id="cmd-door-0001", expected_version=(await h.view(reconcile=False)).version,
            )
        )
        assert (await h.service.submit_phase_output(binding)).ok
        fresh = await h.view(reconcile=False)
        current = _phase(fresh, REQUIREMENTS).proposal

        # Now the file changes behind the house's back.
        path = h.mansion / ".kiro" / "specs" / SPEC / "requirements.md"
        path.write_text("# Requirements\n\nEdited outside the tool.\n", encoding="utf-8")
        outside = await _error(
            h.service.decide_door(
                MANSION, current.proposal_id, approve=True, phase=current.phase,
                document_path=current.document_path, artifact_revision=current.artifact_revision,
                command_id="cmd-door-0002", expected_version=fresh.version,
            )
        )
        return rewritten, old, current, outside, await h.kinds()

    rewritten, old, current, outside, kinds = _run(scenario, tmp_path)
    assert rewritten.status == "written" and old.code == "no_pending_proposal"
    assert current.artifact_revision.revision == 2
    assert outside.code == "artifact_changed"
    assert _phase(outside.view, REQUIREMENTS).door is DoorStatus.SEALED
    assert _phase(outside.view, REQUIREMENTS).proposal.status == "superseded"
    assert kinds.count("door_superseded") == 2 and "door_approved" not in kinds


def test_output_is_accepted_only_from_the_current_session_and_a_valid_document(tmp_path):
    async def scenario(h):
        await h.start(REQUIREMENTS)
        view = await h.view(reconcile=False)
        binding = h.binding(_phase(view, REQUIREMENTS).session_slot)
        unwritten = await h.service.submit_phase_output(binding)
        with_path = await h.service.submit_phase_output(binding, "notes.md")
        assert (await h.write_spec(binding, "   \n")).status == "written"
        empty = await h.service.submit_phase_output(binding)
        impostor = await h.service.submit_phase_output(replace(binding, slot="slot-9"))
        wrong_room = await h.service.submit_phase_output(replace(binding, room="workshop"))
        wrong_spec = await h.service.submit_phase_output(replace(binding, spec="other-spec"))
        other = await h.service.submit_phase_output(replace(binding, mansion="other-mansion"))
        assert (await h.write_spec(binding, "# Requirements\n", expected_revision=1)).status == "written"
        accepted = await h.service.submit_phase_output(binding)
        twice = await h.service.submit_phase_output(binding)
        return unwritten, with_path, empty, impostor, wrong_room, wrong_spec, other, accepted, twice, await h.kinds()

    (unwritten, with_path, empty, impostor, wrong_room, wrong_spec, other, accepted, twice,
     kinds) = _run(scenario, tmp_path)
    assert [item.code for item in (unwritten, with_path, empty, impostor, wrong_room, wrong_spec, other)] == [
        "document_missing", "invalid_request", "empty_output", "session_not_current",
        "identity_unavailable", "identity_unavailable", "mansion_not_found"]
    assert accepted.ok and twice.code == "invalid_state"
    assert kinds.count("phase_output_ready") == 1


# --- risky decisions and evidence chains ------------------------------------------------------------


def test_allowed_denied_and_failed_operations_are_told_apart_by_canonical_evidence(tmp_path):
    async def scenario(h):
        (h.mansion / "src").mkdir()
        for name in ("old.py", "gone.py", "keep.py"):
            (h.mansion / "src" / name).write_text("x\n", encoding="utf-8")
        (h.mansion / ".env").write_text("TOKEN=1\n", encoding="utf-8")
        binding = await h.reach_workshop()

        # Denied before any proposal exists: a path no approval could reach.
        protected = await h.service.propose_risky_action(binding, tinker_delete(".env"))
        spec_doc = await h.service.propose_risky_action(
            binding, tinker_delete(f".kiro/specs/{SPEC}/tasks.md"))
        shell = await h.service.propose_risky_action(
            binding, {**tinker_delete(), "arguments": {"path": "src/old.py", "target": "file", "shell": "rm"}})
        authority = await h.service.propose_risky_action(
            binding, {**tinker_delete(), "mansion_id": "other-mansion"})

        allowed_id, allowed_digest, allowed = await h.propose(binding, tinker_delete("src/old.py"))
        same = await h.service.propose_risky_action(binding, tinker_delete("src/old.py"))
        failing_id, failing_digest, failing = await h.propose(binding, tinker_delete("src/gone.py"))
        rejected_id, rejected_digest, rejected = await h.propose(binding, tinker_delete("src/keep.py"))

        early = await h.service.consume_and_execute(binding, allowed_id, allowed)
        stale = await _error(
            h.service.decide_risky_action(
                MANSION, allowed_id, approve=True, action_digest="0" * 64,
                command_id="cmd-risky-0001", expected_version=(await h.view(reconcile=False)).version))
        await h.decide_risky(allowed_id, allowed_digest, True)
        await h.decide_risky(failing_id, failing_digest, True)
        await h.decide_risky(rejected_id, rejected_digest, False)
        twice = await _error(h.decide_risky(allowed_id, allowed_digest, False))

        mismatched = await h.service.consume_and_execute(binding, allowed_id, failing)
        ran = await h.service.consume_and_execute(binding, allowed_id, allowed)
        again = await h.service.consume_and_execute(binding, allowed_id, allowed)
        (h.mansion / "src" / "gone.py").unlink()
        failed = await h.service.consume_and_execute(binding, failing_id, failing)
        refused = await h.service.consume_and_execute(binding, rejected_id, rejected)
        return (protected, spec_doc, shell, authority, same, allowed_id, early, stale, twice,
                mismatched, ran, again, failed, refused, await h.view(reconcile=False), h)

    (protected, spec_doc, shell, authority, same, allowed_id, early, stale, twice, mismatched,
     ran, again, failed, refused, view, h) = _run(scenario, tmp_path)
    assert [item.code for item in (protected, spec_doc, shell, authority)] == [
        "path_denied", "path_denied", "invalid_descriptor", "invalid_descriptor"]
    assert same.ok and same.data["proposal_id"] == allowed_id  # one proposal per exact action
    assert (early.status, early.code) == ("waiting", "proposal_pending")
    assert stale.code == "stale_digest" and twice.code == "already_decided"
    assert (mismatched.status, mismatched.code) == ("denied", "descriptor_mismatch")
    assert (ran.status, again.code) == ("succeeded", "proposal_consumed")
    assert (failed.status, failed.code) == ("failed", "not_found")
    assert (refused.status, refused.code) == ("denied", "proposal_rejected")
    assert not (h.mansion / "src" / "old.py").exists() and (h.mansion / "src" / "keep.py").exists()
    assert (h.mansion / ".env").exists()

    statuses = sorted(item.status.value for item in view.read.projection.risky_proposals.values())
    assert statuses == ["failed", "rejected", "succeeded"]
    by_kind: dict[str, list[dict]] = {}
    for record in view.read.domain.records:
        by_kind.setdefault(record.kind.value, []).append(dict(record.data))
    assert [item["code"] for item in by_kind["path_denied"]] == ["protected_path", "room_policy"]
    assert [item["path"] for item in by_kind["path_denied"]] == [".env", f".kiro/specs/{SPEC}/tasks.md"]
    assert len(by_kind["risky_action_proposed"]) == 3
    assert len(by_kind["risky_action_consumed"]) == 2
    assert [item["code"] for item in by_kind["risky_action_succeeded"]] == ["deleted"]
    assert [item["code"] for item in by_kind["risky_action_failed"]] == ["not_found"]
    assert sorted(item["code"] for item in by_kind["risky_action_denied"]) == [
        "descriptor_mismatch", "proposal_consumed", "proposal_rejected"]
    # Every consumption is preceded by its exact approval and followed by one outcome.
    order = [record.kind.value for record in view.read.domain.records]
    for index, kind in enumerate(order):
        if kind == "risky_action_consumed":
            assert "risky_action_approved" in order[:index]
            assert order[index + 1] in ("risky_action_succeeded", "risky_action_failed")
    text = "".join(repr(event.payload) for event in view.read.events)
    assert "TOKEN" not in text and "x\\n" not in text


def test_commands_and_git_are_refused_without_confinement_but_delete_still_works(tmp_path):
    async def scenario(h):
        (h.mansion / "src").mkdir()
        (h.mansion / "src" / "old.py").write_text("x\n", encoding="utf-8")
        binding = await h.reach_workshop()
        command = {
            "kind": "run_command", "working_directory": "",
            "arguments": {"argv": ["python3", "-m", "pytest", "-q"], "timeout_seconds": 60},
            "path_intents": [{"access": "command_read", "path": "src"}],
        }
        command_id, digest, descriptor = await h.propose(binding, command)
        await h.decide_risky(command_id, digest, True)
        blocked = await h.service.consume_and_execute(binding, command_id, descriptor)
        delete_id, delete_digest, delete = await h.propose(binding, tinker_delete())
        await h.decide_risky(delete_id, delete_digest, True)
        deleted = await h.service.consume_and_execute(binding, delete_id, delete)
        view = await h.view(reconcile=False)
        return blocked, deleted, view.read.projection.risky_proposals[command_id], await h.kinds()

    blocked, deleted, proposal, kinds = _run(scenario, tmp_path, runner=UnavailableRunner())
    assert (blocked.status, blocked.code) == ("denied", "confinement_unavailable")
    assert proposal.status is ProposalStatus.APPROVED  # not spent on a refusal
    assert deleted.status == "succeeded"
    assert kinds.count("risky_action_consumed") == 1


def test_only_a_tinker_in_its_current_session_may_propose(tmp_path):
    async def scenario(h):
        await h.start(REQUIREMENTS)
        archivist = h.binding("slot-1")
        return await h.service.propose_risky_action(archivist, tinker_delete())

    assert _run(scenario, tmp_path).code == "tool_not_available"


# --- restart and recovery ---------------------------------------------------------------------------


def test_a_restart_folds_the_same_projection_and_settles_what_was_left_unfinished(tmp_path):
    async def first_process(h):
        (h.mansion / "src").mkdir()
        (h.mansion / "src" / "old.py").write_text("x\n", encoding="utf-8")
        binding = await h.reach_workshop()
        proposal_id, digest, descriptor = await h.propose(binding, tinker_delete())
        await h.decide_risky(proposal_id, digest, True)
        # The process dies between the consumption record and the delete.
        consumed = ge.risky_action_consumed(
            binding.scope, proposal_id=proposal_id, action_digest=digest,
            claim_id="claim-crashed", session_slot=binding.slot)
        assert (await h.port.append(MANSION, [consumed])).ok
        view = await h.view(reconcile=False)
        return binding, proposal_id, descriptor, projection_summary(view.read.projection), view.to_json()

    async def second_process(h):
        cold = await h.port.read(MANSION)
        summary = projection_summary(cold.projection)
        replayed = projection_summary(replay_projection(cold.events))
        view = await h.view()  # the first touch runs recovery
        binding = h.binding(_phase(view, IMPLEMENTATION).session_slot)
        return summary, replayed, view, binding, h.crew.calls, (h.mansion / "src" / "old.py").exists()

    binding, proposal_id, descriptor, before, wire = asyncio.run(_first(tmp_path, first_process))
    summary, replayed, view, restored, calls, still_there = asyncio.run(_first(tmp_path, second_process))
    assert summary == before == replayed
    assert restored == binding  # the binding record survived the restart
    proposal = view.read.projection.risky_proposals[proposal_id]
    assert (proposal.status, proposal.outcome_code) == (ProposalStatus.FAILED, "interrupted")
    # The approval is spent and nothing was run or retried by the restart.
    assert still_there and calls == []
    assert wire["phases"] == view.to_json()["phases"]


async def _first(tmp_path, scenario):
    async with house(tmp_path) as built:
        return await scenario(built)


def test_a_reservation_and_a_prepared_write_left_by_a_crash_are_settled(tmp_path):
    async def crashed(h):
        binding = await h.pass_phase(REQUIREMENTS)
        scope = operator_scope(MANSION)
        # A reservation with no session, and a prepared write of design.md.
        version = (await h.view(reconcile=False)).version
        reserved = ge.phase_start_reserved(
            scope, phase=DESIGN, reservation_id="res-crashed", command_id="cmd-crashed-01")
        assert (await h.port.compare_and_append(MANSION, version, [reserved])).ok
        return binding

    async def restarted(h):
        view = await h.view()
        failed = _phase(view, DESIGN)
        calls = len(h.crew.calls)
        started = await h.start(DESIGN)
        draughtsman = h.binding(_phase(started.view, DESIGN).session_slot)

        # A write that was prepared and applied, but never acknowledged.
        data = b"# Design\n\nApplied before the crash.\n"
        prepared = ge.spec_write_prepared(
            draughtsman.scope, write_id="write-crashed", phase=DESIGN,
            document_path=f".kiro/specs/{SPEC}/design.md", base_revision=0, base_sha256=None,
            revision=1, sha256=hashlib.sha256(data).hexdigest(), size_bytes=len(data))
        assert (await h.port.append(MANSION, [prepared])).ok
        (h.mansion / ".kiro" / "specs" / SPEC / "design.md").write_bytes(data)
        blocked = await h.service.submit_phase_output(draughtsman)
        settled = await h.service.recover(MANSION)
        submitted = await h.service.submit_phase_output(draughtsman)
        return failed, calls, len(h.crew.calls), blocked, settled, submitted, await h.kinds()

    asyncio.run(_first(tmp_path, crashed))
    failed, calls, calls_after, blocked, settled, submitted, kinds = asyncio.run(_first(tmp_path, restarted))
    assert (failed.status, failed.failure_code) == (PhaseStatus.FAILED, "interrupted")
    assert calls == 0 and calls_after == 4  # recovery started nothing; the explicit start did
    assert blocked.code == "document_missing"
    assert settled == ()  # the write is settled through the guarded access, not returned here
    assert "spec_write_recovered" in kinds and submitted.ok


def test_a_late_crew_resolution_after_consumption_changes_nothing(tmp_path):
    async def scenario(h):
        (h.mansion / "src").mkdir()
        (h.mansion / "src" / "old.py").write_text("x\n", encoding="utf-8")
        binding = await h.reach_workshop()
        proposal_id, digest, descriptor = await h.propose(binding, tinker_delete())
        await h.decide_risky(proposal_id, digest, True)
        assert (await h.service.consume_and_execute(binding, proposal_id, descriptor)).status == "succeeded"
        h.crew.prompt(binding.slot, "m-late", execution_input(proposal_id, tinker_delete()))
        h.crew.resolve_externally(binding.slot, "m-late", "rejected")
        await h.ingest([resolved_frame(binding.slot, "m-late", False)])
        view = await h.view()
        return view.read.projection.risky_proposals[proposal_id], await h.kinds()

    proposal, kinds = _run(scenario, tmp_path)
    assert proposal.status is ProposalStatus.SUCCEEDED and proposal.decision.outcome == "approved"
    assert kinds[-1] == "approval_resolution_ignored"
    assert kinds.count("risky_action_rejected") == 0


def test_integrity_failure_blocks_every_mutation_and_folds_only_the_valid_prefix(tmp_path):
    async def scenario(h):
        _binding, proposal, view = await _waiting_requirements(h)
        log = next(h.mansion.rglob("events.v1.*"))
        with log.open("ab") as handle:
            handle.write(b"{this is not a canonical record}\n")
        shown = await h.view()
        decide = await _error(
            h.service.decide_door(
                MANSION, proposal.proposal_id, approve=True, phase=proposal.phase,
                document_path=proposal.document_path, artifact_revision=proposal.artifact_revision,
                command_id="cmd-door-0001", expected_version=view.version))
        start = await _error(h.start(DESIGN))
        return view, shown, decide, start, len(h.crew.calls)

    view, shown, decide, start, calls = _run(scenario, tmp_path)
    body = shown.to_json()
    assert body["integrity"] == "corrupt" and body["version"] == view.version
    assert body["phases"][0]["door"]["proposal"]["status"] == "pending"
    assert decide.code == start.code == "integrity_unavailable"
    assert decide.view is not None and decide.view.to_json()["integrity"] == "corrupt"
    assert calls == 4  # only the original start ever reached Crew


def test_a_record_that_loses_spec_2_selection_does_not_strand_decisions(tmp_path):
    def message(revision: int) -> AppEventCandidate:
        return AppEventCandidate(
            schema_version=1, event_type="message_recorded",
            scope=operator_scope(MANSION),
            source=EventSource("crew", "chat_message", ("m-1",), revision, "", 0),
            caused_by=(), occurred_at_ms=None, payload={"role": "assistant"},
        )

    async def scenario(h):
        _binding, proposal, _view = await _waiting_requirements(h)
        # A newer revision, then an older one: the newest physical record is
        # not the variant Spec 2 selects.
        assert (await h.store.append_candidates(MANSION, [message(5)])).status == "ok"
        assert (await h.store.append_candidates(MANSION, [message(1)])).status == "ok"
        read = await h.port.read(MANSION)
        approved = await h.decide_door(True)
        return read, approved

    read, approved = _run(scenario, tmp_path)
    assert read.projection.version == read.highest_sequence == read.projection.ledger.projection_version
    assert max(event.sequence for event in read.events) < read.highest_sequence
    assert approved.event.payload["kind"] == "door_approved"


# --- the Workshop cap -------------------------------------------------------------------------------


def test_at_most_three_implementation_sessions_are_ever_started(tmp_path):
    async def scenario(h):
        for phase in (REQUIREMENTS, DESIGN, TASKS):
            await h.pass_phase(phase)
        calls = len(h.crew.slots)
        started = await h.start(IMPLEMENTATION, assignments=[f"task-{n}" for n in range(1, 6)])
        schedule = h.service.workshop(MANSION)
        tinkers = [h.binding(slot) for slot in list(h.crew.slots)[calls:]]
        too_many = await _error(
            h.service.start_phase(
                MANSION, REQUIREMENTS, command_id="cmd-many-0001",
                expected_version=started.view.version, assignments=["task-1"]))
        return started, schedule, tinkers, too_many, len(h.crew.slots) - calls

    started, schedule, tinkers, too_many, created = _run(scenario, tmp_path)
    assert created == 3
    assert sorted(binding.ghost for binding in tinkers) == ["tinker-1", "tinker-2", "tinker-3"]
    states = [item.state.value for item in schedule.assignments]
    assert states.count("working") == 3 and states.count("queued") == 2
    assert _phase(started.view, IMPLEMENTATION).status is PhaseStatus.WORKING
    assert too_many.code == "invalid_request"


# --- binding order and concurrent sessions ------------------------------------------------------------


@pytest.mark.parametrize("echo_names", [True, False])
def test_the_binding_is_on_disk_before_crew_creates_the_session(tmp_path, echo_names):
    async def scenario(h):
        h.crew.echo_names = echo_names
        seen = []

        async def at_create():
            name = h.crew.calls[-1][2]["name"]
            seen.append((name, h.bindings.load(f"dashboard:{name}")))

        h.crew.hooks["create_slot"] = at_create
        started = await h.start(REQUIREMENTS)
        slot = _phase(started.view, REQUIREMENTS).session_slot
        records = sorted(path.name for path in h.bindings.directory.iterdir())
        return seen, slot, h.binding(slot), records, h.bindings.load(f"dashboard:{seen[0][0]}")

    seen, slot, binding, records, provisional = _run(scenario, tmp_path)
    (name, early), = seen
    # The record for the label Crew will hand the MCP server existed first.
    assert early is not None and early.slot == name and early.role == "archivist"
    assert binding.slot == slot and len(records) == 1
    assert binding.capability == early.capability
    if echo_names:
        assert slot == name and provisional == binding
    else:
        # Crew reported its own key: only that key stays bound.
        assert slot == "slot-1" and provisional is None


@pytest.mark.parametrize("step", ["create_slot", "set_project", "set_mode", "send_turn"])
def test_a_failed_setup_leaves_no_binding_behind(tmp_path, step):
    async def scenario(h):
        h.crew.echo_names = True
        h.crew.fail[step] = (500, {"error": "nope"})
        failed = await _error(h.start(REQUIREMENTS))
        return failed.code, list(h.bindings.directory.iterdir())

    assert _run(scenario, tmp_path) == ("crew_failed", [])


def test_every_seated_tinker_of_the_current_attempt_may_use_its_room(tmp_path):
    async def scenario(h):
        (h.mansion / "src").mkdir()
        for name in ("a.py", "b.py", "c.py"):
            (h.mansion / "src" / name).write_text("x\n", encoding="utf-8")
        for phase in (REQUIREMENTS, DESIGN, TASKS):
            await h.pass_phase(phase)
        before = set(h.crew.slots)
        await h.start(IMPLEMENTATION, assignments=["task-1", "task-2", "task-3"])
        tinkers = sorted((h.binding(slot) for slot in set(h.crew.slots) - before), key=lambda b: b.ghost)
        proposed = [
            await h.service.propose_risky_action(binding, tinker_delete(f"src/{name}"))
            for binding, name in zip(tinkers, ("a.py", "b.py", "c.py"))
        ]
        stranger = replace(tinkers[1], slot="slot-99")
        refused = await h.service.propose_risky_action(stranger, tinker_delete("src/a.py"))
        stale_run = replace(tinkers[1], run_id="implementation-9")
        other_run = await h.service.propose_risky_action(stale_run, tinker_delete("src/a.py"))
        return tinkers, proposed, refused, other_run

    tinkers, proposed, refused, other_run = _run(scenario, tmp_path)
    assert [binding.ghost for binding in tinkers] == ["tinker-1", "tinker-2", "tinker-3"]
    assert all(result.ok for result in proposed)
    assert refused.code == other_run.code == "session_not_current"
