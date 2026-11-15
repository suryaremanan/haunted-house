"""Cross-spec terminal and restart tests for the validated gate (task 5.5).

Real pieces everywhere except Crew: the Spec 2 file writer, ingest service
and folds, the Spec 4 WorkflowService, guarded filesystem and session
bindings, and the Room Ghosts gate over them.  Raw Crew frames enter only
through Spec 2 ingest; every assertion reads acknowledged canonical records.

Validates: Requirements 5.5, 5.6, 6.5, 6.6, 7.8, 7.9, 10.2–10.12.
"""

from __future__ import annotations

import ast
import asyncio
from dataclasses import replace as _replace
from pathlib import Path

from haunted_house.core.ghost_state import reduce_ghost_snapshot
from haunted_house.core.guardrail_events import Phase
from haunted_house.core.seance_log_parser import parse_event_log
from haunted_house.core.workflow import DoorStatus, PhaseStatus
from haunted_house.core.workflow_projector import replay_projection
from haunted_house.services.contracts import ContractStatus
from haunted_house.services.terminal_gate import ValidatedTerminalGate
from tests.room_ghost_runtime_support import (
    DESIGN,
    REQUIREMENTS,
    TASKS,
    chat_done,
    ready_result,
    runtime,
    sha256_text,
    spec5_validator,
)
from tests.workflow_support import MANSION, SPEC, FlakyWriter, house

DOC = {phase: f".kiro/specs/{SPEC}/{phase.value}.md" for phase in Phase if phase is not Phase.IMPLEMENTATION}
PACKAGE = Path(__file__).resolve().parents[2] / "haunted_house"


def play(tmp_path, scenario, **options):
    options.setdefault("validator", spec5_validator)

    async def go():
        async with house(tmp_path, **options) as h:
            return await scenario(h, runtime(h))

    return asyncio.run(go())


async def _started(h, phase: Phase):
    await h.start(phase)
    view = (await h.view(reconcile=False)).read.projection.phases[phase]
    return h.binding(view.session_slot)


async def _phase(h, phase: Phase):
    return (await h.view(reconcile=False)).read.projection.phases[phase]


async def _ghost(rt, binding):
    events = (await rt.port.read(MANSION)).events
    return reduce_ghost_snapshot(events, MANSION, binding.ghost_name)


def _log(h) -> Path:
    logs = list(h.mansion.rglob("*.jsonl"))
    assert len(logs) == 1, logs  # one Event_Log, and Room Ghosts opened none
    return logs[0]


# --- a valid artifact ------------------------------------------------------------


def test_valid_requirements_complete_only_after_validation(tmp_path) -> None:
    async def scenario(h, rt):
        room = await _started(h, Phase.REQUIREMENTS)
        run = rt.run(room)
        assert (await h.write_spec(room, REQUIREMENTS)).status == "written"

        turn = await rt.turn_ended(room.slot)
        # The turn ended: transport evidence only.  Nothing is terminal yet.
        assert turn.event_type == "crew_turn_ended" and turn.source.origin == "crew"
        assert (await _ghost(rt, run)).state == "working"
        assert await rt.terminals() == []
        assert (await _phase(h, Phase.REQUIREMENTS)).door is DoorStatus.SEALED

        outcome = await rt.gate.settle_turn(
            run, turn, ready_result(run, {DOC[Phase.REQUIREMENTS]: REQUIREMENTS})
        )
        assert (outcome.status, outcome.code, outcome.duplicate) == ("completed", "ready", False)
        assert outcome.event.event_type == "run_completed"
        assert outcome.event.source.origin == "house" and outcome.event.scope == run.scope
        assert outcome.event.caused_by == (turn.event_id,)

        view = await _phase(h, Phase.REQUIREMENTS)
        assert view.status is PhaseStatus.WAITING and view.door is DoorStatus.WAITING
        assert view.proposal.proposal_id == outcome.proposal_id
        assert view.proposal.artifact_revision.sha256 == sha256_text(REQUIREMENTS)
        assert (await _ghost(rt, run)).state == "done"
        assert [event.record_id for event in await rt.terminals()] == [outcome.event.record_id]

        # The document body never reaches a canonical record.
        raw = _log(h).read_text(encoding="utf-8")
        assert "Guestbook" not in raw and "SHALL" not in raw

        # Never a successful room before the validated terminal record: at
        # every prefix the Ghost is done only once run_completed is in it.
        events = sorted((await rt.port.read(MANSION)).events, key=lambda event: event.sequence)
        kinds = [
            event.payload.get("kind") if event.event_type == "domain_event_recorded" else event.event_type
            for event in events
        ]
        assert kinds.index("crew_turn_ended") < kinds.index("phase_output_ready") < kinds.index("run_completed")
        for cut in range(len(events) + 1):
            state = reduce_ghost_snapshot(events[:cut], MANSION, run.ghost_name).state
            assert (state == "done") == any(e.event_type == "run_completed" for e in events[:cut])

        # Approving the Door is still a separate explicit decision.
        await h.decide_door(True)
        assert (await _phase(h, Phase.REQUIREMENTS)).door is DoorStatus.OPEN
        assert (await _phase(h, Phase.DESIGN)).status is PhaseStatus.READY
        return outcome

    play(tmp_path, scenario)


def test_ghost_that_already_submitted_is_settled_against_its_proposal(tmp_path) -> None:
    async def scenario(h, rt):
        room = await _started(h, Phase.REQUIREMENTS)
        run = rt.run(room)
        await h.write_spec(room, REQUIREMENTS)
        submitted = await h.service.submit_phase_output(room)  # the room tool
        assert submitted.ok
        turn = await rt.turn_ended(room.slot)
        outcome = await rt.gate.settle_turn(
            run, turn, ready_result(run, {DOC[Phase.REQUIREMENTS]: REQUIREMENTS})
        )
        assert outcome.status == "completed"
        assert outcome.proposal_id == submitted.data["proposal_id"]
        assert (await h.kinds()).count("phase_output_ready") == 1

    play(tmp_path, scenario)


def test_whole_spec_chain_validates_each_phase_against_approved_upstream(tmp_path) -> None:
    async def scenario(h, rt):
        hashes: dict[str, str] = {}
        for phase, text in ((Phase.REQUIREMENTS, REQUIREMENTS), (Phase.DESIGN, DESIGN), (Phase.TASKS, TASKS)):
            room = await _started(h, phase)
            run = rt.run(room, upstream_hashes=dict(hashes))
            assert (await h.write_spec(room, text)).status == "written"
            turn = await rt.turn_ended(room.slot)
            outcome = await rt.gate.settle_turn(run, turn, ready_result(run, {DOC[phase]: text}))
            assert outcome.status == "completed", (phase, outcome)
            await h.decide_door(True)
            hashes[DOC[phase]] = sha256_text(text)
        assert len(await rt.terminals()) == 3

    play(tmp_path, scenario)


# --- every failed check keeps the Door sealed ----------------------------------------


def _sealed(view) -> bool:
    return view.door is DoorStatus.SEALED and view.proposal is None and view.status is PhaseStatus.WORKING


def test_malformed_and_mismatched_results_fail_without_touching_the_door(tmp_path) -> None:
    cases = {
        "prose": lambda run: "All done! The requirements are ready.",
        "prefixed": lambda run: "Here you go: " + ready_result(run, {DOC[Phase.REQUIREMENTS]: REQUIREMENTS}),
        "other_run": lambda run: ready_result(run, {DOC[Phase.REQUIREMENTS]: REQUIREMENTS}).replace(
            run.run_id, "requirements-99"
        ),
        "unknown_status": lambda run: ready_result(run, {DOC[Phase.REQUIREMENTS]: REQUIREMENTS}).replace(
            '"ready"', '"approved"'
        ),
    }
    for name, final_text in cases.items():
        async def scenario(h, rt, final_text=final_text):
            room = await _started(h, Phase.REQUIREMENTS)
            run = rt.run(room)
            await h.write_spec(room, REQUIREMENTS)
            turn = await rt.turn_ended(room.slot)
            outcome = await rt.gate.settle_turn(run, turn, final_text(run))
            assert (outcome.status, outcome.code) == ("failed", "ghost_result_invalid"), name
            assert outcome.findings and outcome.findings[0].code.startswith("ghost_result_")
            assert outcome.event.event_type == "run_failed"
            assert _sealed(await _phase(h, Phase.REQUIREMENTS))
            assert "phase_output_ready" not in await h.kinds()
            assert (await _ghost(rt, run)).state == "failed"
            # No model text reached the record.
            assert "All done" not in str(outcome.event.payload)

        play(tmp_path / name, scenario)


def test_blocked_and_failed_ghost_results_open_no_door(tmp_path) -> None:
    for status, event_type in (("blocked", "run_blocked"), ("failed", "run_failed")):
        async def scenario(h, rt, status=status, event_type=event_type):
            room = await _started(h, Phase.REQUIREMENTS)
            run = rt.run(room)
            await h.write_spec(room, REQUIREMENTS)
            turn = await rt.turn_ended(room.slot)
            text = (
                '{"artifacts":[],"reason_code":"needs_brief","run_id":"%s","schema_version":1,'
                '"status":"%s","summary":"Cannot continue.","task_id":null}' % (run.run_id, status)
            )
            outcome = await rt.gate.settle_turn(run, turn, text)
            assert (outcome.status, outcome.code) == (status, "needs_brief")
            assert outcome.event.event_type == event_type
            assert _sealed(await _phase(h, Phase.REQUIREMENTS))

        play(tmp_path / status, scenario)


def test_invalid_artifact_returns_deterministic_findings(tmp_path) -> None:
    async def scenario(h, rt):
        room = await _started(h, Phase.REQUIREMENTS)
        run = rt.run(room)
        broken = REQUIREMENTS.replace("SHALL", "might")
        await h.write_spec(room, broken)
        # The Ghost's own submit tool is refused by the same validator.
        assert (await h.service.submit_phase_output(room)).code == "artifact_invalid"
        turn = await rt.turn_ended(room.slot)
        outcome = await rt.gate.settle_turn(run, turn, ready_result(run, {DOC[Phase.REQUIREMENTS]: broken}))
        assert (outcome.status, outcome.code) == ("failed", "artifact_invalid")
        assert outcome.findings
        assert outcome.event.payload["findings"] == [item.code for item in outcome.findings][:20]
        assert _sealed(await _phase(h, Phase.REQUIREMENTS))
        return [(item.code, item.location) for item in outcome.findings]

    first = play(tmp_path / "a", scenario)
    assert play(tmp_path / "b", scenario) == first  # deterministic


def test_stale_hash_and_unrecorded_revision_are_refused(tmp_path) -> None:
    async def stale_hash(h, rt):
        room = await _started(h, Phase.REQUIREMENTS)
        run = rt.run(room)
        await h.write_spec(room, REQUIREMENTS)
        turn = await rt.turn_ended(room.slot)
        outcome = await rt.gate.settle_turn(
            run, turn, ready_result(run, {DOC[Phase.REQUIREMENTS]: REQUIREMENTS + "\n"})
        )
        assert (outcome.status, outcome.code) == ("failed", "artifact_hash_mismatch")
        assert _sealed(await _phase(h, Phase.REQUIREMENTS))

    async def changed_behind_the_house(h, rt):
        room = await _started(h, Phase.REQUIREMENTS)
        run = rt.run(room)
        await h.write_spec(room, REQUIREMENTS)
        edited = REQUIREMENTS + "\nA line nobody recorded.\n"
        (h.mansion / DOC[Phase.REQUIREMENTS]).write_text(edited, encoding="utf-8")
        turn = await rt.turn_ended(room.slot)
        outcome = await rt.gate.settle_turn(run, turn, ready_result(run, {DOC[Phase.REQUIREMENTS]: edited}))
        assert (outcome.status, outcome.code) == ("failed", "stale_revision")
        assert _sealed(await _phase(h, Phase.REQUIREMENTS))

    async def wrong_artifact(h, rt):
        room = await _started(h, Phase.REQUIREMENTS)
        run = rt.run(room)
        await h.write_spec(room, REQUIREMENTS)
        turn = await rt.turn_ended(room.slot)
        outcome = await rt.gate.settle_turn(run, turn, ready_result(run, {"src/app.py": "x"}))
        assert (outcome.status, outcome.code) == ("failed", "artifact_not_permitted")

    async def missing_artifact(h, rt):
        room = await _started(h, Phase.REQUIREMENTS)
        run = rt.run(room)
        turn = await rt.turn_ended(room.slot)
        outcome = await rt.gate.settle_turn(run, turn, ready_result(run, {DOC[Phase.REQUIREMENTS]: REQUIREMENTS}))
        assert (outcome.status, outcome.code) == ("failed", "artifact_missing")

    play(tmp_path / "hash", stale_hash)
    play(tmp_path / "revision", changed_behind_the_house)
    play(tmp_path / "path", wrong_artifact)
    play(tmp_path / "missing", missing_artifact)


def test_changed_upstream_fails_the_downstream_run(tmp_path) -> None:
    async def scenario(h, rt):
        await h.pass_phase(Phase.REQUIREMENTS, REQUIREMENTS)
        room = await _started(h, Phase.DESIGN)
        run = rt.run(room, upstream_hashes={DOC[Phase.REQUIREMENTS]: sha256_text(REQUIREMENTS)})
        await h.write_spec(room, DESIGN)
        # The approved requirements change on disk after the Door opened.
        (h.mansion / DOC[Phase.REQUIREMENTS]).write_text(REQUIREMENTS + "\n", encoding="utf-8")
        turn = await rt.turn_ended(room.slot)
        outcome = await rt.gate.settle_turn(run, turn, ready_result(run, {DOC[Phase.DESIGN]: DESIGN}))
        assert (outcome.status, outcome.code) == ("failed", "upstream_changed")
        assert _sealed(await _phase(h, Phase.DESIGN))

    async def stale_start(h, rt):
        await h.pass_phase(Phase.REQUIREMENTS, REQUIREMENTS)
        room = await _started(h, Phase.DESIGN)
        run = rt.run(room, upstream_hashes={DOC[Phase.REQUIREMENTS]: "0" * 64})
        await h.write_spec(room, DESIGN)
        turn = await rt.turn_ended(room.slot)
        outcome = await rt.gate.settle_turn(run, turn, ready_result(run, {DOC[Phase.DESIGN]: DESIGN}))
        assert (outcome.status, outcome.code) == ("failed", "upstream_changed")

    play(tmp_path / "disk", scenario)
    play(tmp_path / "start", stale_start)


def test_door_rejection_by_spec_4_fails_the_run(tmp_path) -> None:
    async def refuse(_output):
        return "house_rule"  # Spec 4's output boundary says no

    async def scenario(h, rt):
        room = await _started(h, Phase.REQUIREMENTS)
        run = rt.run(room)
        await h.write_spec(room, REQUIREMENTS)
        turn = await rt.turn_ended(room.slot)
        outcome = await rt.gate.settle_turn(run, turn, ready_result(run, {DOC[Phase.REQUIREMENTS]: REQUIREMENTS}))
        assert (outcome.status, outcome.code) == ("failed", "house_rule")
        assert outcome.event.event_type == "run_failed"
        assert _sealed(await _phase(h, Phase.REQUIREMENTS))
        assert [event.event_type for event in await rt.terminals()] == ["run_failed"]

    play(tmp_path, scenario, validator=lambda _root: refuse)


def test_an_unavailable_writer_decides_nothing_and_can_be_retried(tmp_path) -> None:
    async def scenario(h, rt):
        room = await _started(h, Phase.REQUIREMENTS)
        run = rt.run(room)
        await h.write_spec(room, REQUIREMENTS)
        turn = await rt.turn_ended(room.slot)
        final = ready_result(run, {DOC[Phase.REQUIREMENTS]: REQUIREMENTS})
        h.writer.fail["phase_output_ready"] = ["failed"]  # Spec 4 cannot record the proposal
        outcome = await rt.gate.settle_turn(run, turn, final)
        assert (outcome.status, outcome.code, outcome.event) == ("pending", "writer_unavailable", None)
        assert await rt.terminals() == [] and _sealed(await _phase(h, Phase.REQUIREMENTS))
        assert (await _ghost(rt, run)).state == "working"
        assert (await rt.gate.settle_turn(run, turn, final)).status == "completed"
        assert len(await rt.terminals()) == 1

    play(tmp_path, scenario, wrap_writer=FlakyWriter)


# --- one terminal fact ---------------------------------------------------------------


def test_duplicate_raw_and_canonical_turn_ends_settle_once(tmp_path) -> None:
    async def scenario(h, rt):
        room = await _started(h, Phase.REQUIREMENTS)
        run = rt.run(room)
        await h.write_spec(room, REQUIREMENTS)
        final = ready_result(run, {DOC[Phase.REQUIREMENTS]: REQUIREMENTS})

        first = await h.ingest([chat_done(room.slot)])
        again = await h.ingest([chat_done(room.slot)])  # duplicate raw delivery
        assert again.duplicate_record_ids == (first.events[0].record_id,)
        assert again.events[0] == first.events[0]
        turn = first.events[0]

        outcomes = await asyncio.gather(*(rt.gate.settle_turn(run, turn, final) for _ in range(4)))
        assert sorted(item.duplicate for item in outcomes) == [False, True, True, True]
        assert len({item.event.record_id for item in outcomes}) == 1
        assert all(item.status == "completed" for item in outcomes)

        # Canonical redelivery: Crew sends the same turn end with a later revision.
        redelivered = (await h.ingest([chat_done(room.slot, revision=3)])).events[0]
        assert redelivered.event_id == turn.event_id and redelivered.record_id != turn.record_id
        late = await rt.gate.settle_turn(run, redelivered, final)
        assert late.duplicate and late.event.record_id == outcomes[0].event.record_id

        # A later settlement with a worse answer cannot replace the outcome.
        worse = await rt.gate.settle_turn(run, turn, "not a result")
        assert worse.status == "completed" and worse.duplicate
        assert len(await rt.terminals()) == 1
        assert (await h.kinds()).count("phase_output_ready") == 1

    play(tmp_path, scenario)


def test_a_failed_run_stays_failed(tmp_path) -> None:
    async def scenario(h, rt):
        room = await _started(h, Phase.REQUIREMENTS)
        run = rt.run(room)
        await h.write_spec(room, REQUIREMENTS)
        turn = await rt.turn_ended(room.slot)
        assert (await rt.gate.settle_turn(run, turn, "{}")).status == "failed"
        retried = await rt.gate.settle_turn(run, turn, ready_result(run, {DOC[Phase.REQUIREMENTS]: REQUIREMENTS}))
        assert retried.status == "failed" and retried.duplicate
        assert [event.event_type for event in await rt.terminals()] == ["run_failed"]
        assert _sealed(await _phase(h, Phase.REQUIREMENTS))

    play(tmp_path, scenario)


def test_reconnect_and_backend_restart_return_the_same_record(tmp_path) -> None:
    async def before(h, rt):
        room = await _started(h, Phase.REQUIREMENTS)
        run = rt.run(room)
        await h.write_spec(room, REQUIREMENTS)
        turn = await rt.turn_ended(room.slot)
        outcome = await rt.gate.settle_turn(run, turn, ready_result(run, {DOC[Phase.REQUIREMENTS]: REQUIREMENTS}))
        return room.slot, turn, outcome

    slot, turn, outcome = play(tmp_path, before)

    async def after(h, rt):
        room = h.binding(slot)  # the owner-only binding record survived
        run = rt.run(room)
        # The browser reconnects and forwards the same frame again.
        replayed = (await h.ingest([chat_done(slot)])).events[0]
        assert replayed.record_id == turn.record_id
        again = await rt.gate.settle_turn(run, replayed, ready_result(run, {DOC[Phase.REQUIREMENTS]: REQUIREMENTS}))
        assert again.duplicate and again.event == outcome.event
        assert len(await rt.terminals()) == 1

        # Live incremental state equals a replay of the one Event_Log.
        live = await rt.port.read(MANSION)
        parsed = parse_event_log(_log(h).read_bytes())
        assert [event.record_id for event in parsed.events] == [
            event.record_id for event in sorted(live.events, key=lambda event: event.sequence)
        ]
        replay = replay_projection(parsed.events)
        assert replay.phases[Phase.REQUIREMENTS].door is DoorStatus.WAITING
        assert replay.phases[Phase.REQUIREMENTS].proposal == live.projection.phases[Phase.REQUIREMENTS].proposal
        assert reduce_ghost_snapshot(parsed.events, MANSION, run.ghost_name) == await _ghost(rt, run)

    play(tmp_path, after)


def test_restart_between_door_proposal_and_terminal_record_settles_once(tmp_path) -> None:
    async def before(h, rt):
        room = await _started(h, Phase.REQUIREMENTS)
        run = rt.run(room)
        await h.write_spec(room, REQUIREMENTS)
        turn = await rt.turn_ended(room.slot)
        h.writer.fail["run_completed"] = ["failed"]  # the process dies right after Spec 4 accepted
        outcome = await rt.gate.settle_turn(run, turn, ready_result(run, {DOC[Phase.REQUIREMENTS]: REQUIREMENTS}))
        assert (outcome.status, outcome.code) == ("pending", "writer_unavailable")
        assert await rt.terminals() == []
        return room.slot, turn

    slot, turn = play(tmp_path, before, wrap_writer=FlakyWriter)

    async def after(h, rt):
        run = rt.run(h.binding(slot))
        outcome = await rt.gate.settle_turn(run, turn, ready_result(run, {DOC[Phase.REQUIREMENTS]: REQUIREMENTS}))
        assert outcome.status == "completed" and not outcome.duplicate
        assert (await h.kinds()).count("phase_output_ready") == 1
        assert len(await rt.terminals()) == 1

    play(tmp_path, after)


# --- what is not a settlement ----------------------------------------------------------


def test_raw_frames_and_foreign_records_are_rejected_without_a_record(tmp_path) -> None:
    async def scenario(h, rt):
        room = await _started(h, Phase.REQUIREMENTS)
        run = rt.run(room)
        await h.write_spec(room, REQUIREMENTS)
        final = ready_result(run, {DOC[Phase.REQUIREMENTS]: REQUIREMENTS})
        before = len((await rt.port.read(MANSION)).events)

        raw = chat_done(room.slot)
        assert (await rt.gate.settle_turn(run, raw, final)).code == "raw_envelope_rejected"
        assert (await rt.gate.settle_turn(run, raw["data"], final)).code == "raw_envelope_rejected"

        turn = await rt.turn_ended(room.slot)
        events = (await rt.port.read(MANSION)).events
        started = next(event for event in events if event.event_type == "run_started")
        assert (await rt.gate.settle_turn(run, started, final)).code == "not_a_turn_end"
        other = _replace(run, run_id="requirements-9", run_sequence=9)
        assert (await rt.gate.settle_turn(other, turn, final)).code == "scope_mismatch"
        # A record this log never acknowledged (forged in memory).
        forged = _replace(turn, sequence=turn.sequence + 50)
        forged_scope = _replace(turn, scope=_replace(turn.scope, session_slot="slot-x"))
        assert (await rt.gate.settle_turn(run, forged_scope, final)).status == "rejected"
        unknown = (await h.ingest([chat_done(room.slot, turn=2, generation="gen-2", continuing=True)])).events[0]
        assert (await rt.gate.settle_turn(run, unknown, final)).code == "turn_continuing"
        assert forged.event_id == turn.event_id  # same logical fact: accepted below

        assert len((await rt.port.read(MANSION)).events) == before + 2  # two turn ends only
        assert await rt.terminals() == []
        assert _sealed(await _phase(h, Phase.REQUIREMENTS))
        assert (await rt.gate.settle_turn(run, forged, final)).status == "completed"

    play(tmp_path, scenario)


def test_missing_prerequisite_contract_fails_closed(tmp_path) -> None:
    async def scenario(h, rt):
        room = await _started(h, Phase.REQUIREMENTS)
        run = rt.run(room)
        await h.write_spec(room, REQUIREMENTS)
        turn = await rt.turn_ended(room.slot)
        gate = ValidatedTerminalGate(
            rt.port,
            artifacts=rt.gate._artifacts,
            outputs=rt.gate._outputs,
            contracts=lambda: ContractStatus(False, ("core.workflow",)),
        )
        final = ready_result(run, {DOC[Phase.REQUIREMENTS]: REQUIREMENTS})
        outcome = await gate.settle_turn(run, turn, final)
        assert (outcome.status, outcome.code, outcome.event) == ("rejected", "contract_unavailable", None)
        assert (await gate.settle_failed(run, "crew_error")).code == "contract_unavailable"
        assert await rt.terminals() == [] and _sealed(await _phase(h, Phase.REQUIREMENTS))

    play(tmp_path, scenario)


def test_runs_that_end_without_a_result_are_settled_once(tmp_path) -> None:
    async def scenario(h, rt):
        room = await _started(h, Phase.REQUIREMENTS)
        run = rt.run(room)
        failed = await rt.gate.settle_failed(run, "crew_error")
        assert (failed.status, failed.code) == ("failed", "crew_error")
        again = await rt.gate.settle_blocked(run, "cancelled")
        assert again.duplicate and again.event == failed.event
        assert (await rt.gate.settle_failed(run, "Not A Code")).code == "invalid_code"
        unknown = _replace(run, run_id="requirements-7", run_sequence=7)
        assert (await rt.gate.settle_blocked(unknown, "cancelled")).code == "run_not_registered"
        assert len(await rt.terminals()) == 1

    play(tmp_path, scenario)


# --- ownership -------------------------------------------------------------------------


def test_room_ghosts_modules_own_no_log_writer_or_normalizer() -> None:
    owned = [
        *(PACKAGE / "services").glob("*.py"),
        PACKAGE / "core" / "room_ghost_events.py",
        PACKAGE / "core" / "task_claims.py",
        PACKAGE / "core" / "task_checkbox.py",
        PACKAGE / "core" / "ghost_run.py",
    ]
    assert len(owned) >= 9
    forbidden_modules = (
        "seance_log_store", "seance_log_parser", "crew_event_normalizer", "gateway_client",
        "aiohttp", "websockets",
    )
    forbidden_calls = {"open", "normalize_crew_envelope", "prepare_candidates", "build_app_event"}
    for path in owned:
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, ast.Import | ast.ImportFrom):
                names = [alias.name for alias in node.names] + [getattr(node, "module", "") or ""]
                assert not any(bad in name for name in names for bad in forbidden_modules), path.name
            if isinstance(node, ast.Call):
                called = getattr(node.func, "id", getattr(node.func, "attr", ""))
                assert called not in forbidden_calls, (path.name, called)
                # No canonical record is constructed and no writer field assigned.
                assert called != "AppEvent", path.name
                assert not {keyword.arg for keyword in node.keywords} & {
                    "persisted_at_ms", "prev_hash", "hash"
                }, path.name
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                assert "/api/spawn" not in node.value or "no " in node.value.lower(), path.name
        # No raw Crew frame name is mapped here.
        assert '"chat_done"' not in source and "'chat_done'" not in source, path.name
