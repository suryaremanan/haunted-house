"""RG-C1: the prerequisite conformance harness for Room Ghosts (task 1.1).

Characterization tests over the completed Spec 2 and Spec 4 public
interfaces, composed the way Room Ghosts uses them.  They prove the six
cross-spec invariants of the Room Ghosts design:

1. a phase start gives one acknowledged ``run_started`` and a Spec 4 working
   projection with the same Mansion, slot, Ghost, and run identity;
2. Door, risky-action, path-denial, task-claim, and cancellation candidates
   all return through the one Spec 2 writer and replay from the one Event_Log;
3. approval authorization folds acknowledged records and consumes through
   Spec 2 compare-and-append;
4. raw Crew envelopes enter only Spec 2 ingest;
5. ``crew_turn_ended`` leaves a run nonterminal until Room Ghosts validates,
   after which exactly one domain terminal fact exists; and
6. the blocked reasons Room Ghosts needs are schema-valid.

Nothing here adapts a prerequisite.  A missing or incompatible interface
makes the contract check name it and Room Ghosts answer
``contract_unavailable``.

Validates: Requirements 9.5, 10.1–10.12, 15.9.
"""

from __future__ import annotations

import ast
import asyncio
import importlib
import types
from pathlib import Path

import pytest

from haunted_house.adapters.crew_chat import CrewChat
from haunted_house.adapters.guardrail_port import GuardrailPort
from haunted_house.adapters.room_tool_service import RoomToolService
from haunted_house.adapters.seance_log_store import SeanceLogStore
from haunted_house.adapters.session_reconciler import SessionReconciler
from haunted_house.adapters.workflow_service import WorkflowService
from haunted_house.core.approvals import ApprovalLedger, ProposalStatus
from haunted_house.core.ghost_state import fold_ghost_events, reduce_ghost_snapshot, select_events
from haunted_house.core.guardrail_events import GuardrailEventKind, Phase
from haunted_house.core.seance_event import (
    ALLOWED_EVENT_TYPES,
    SCHEMA_VERSION,
    AppEvent,
    AppEventCandidate,
    EventScope,
    EventSource,
    validate_candidate,
)
from haunted_house.core.seance_log_parser import parse_event_log
from haunted_house.core.seance_persistence import CanonicalEventWriter, prepare_candidates
from haunted_house.core.workflow import DoorProposal, DoorStatus, PhaseStatus, fold_workflow
from haunted_house.core.workflow_projector import replay_projection
from haunted_house.services.canonical_port import CanonicalRunPort
from haunted_house.services.contracts import (
    CONTRACT_UNAVAILABLE,
    REQUIRED_EVENT_TYPES,
    REQUIRED_INTERFACES,
    check_prerequisites,
    inspect_prerequisites,
)
from tests.room_ghost_runtime_support import (
    DESIGN,
    REQUIREMENTS,
    TASKS,
    chat_done,
    ready_result,
    runtime,
    spec5_validator,
)
from tests.workflow_support import MANSION, SPEC, house, tinker_delete

PACKAGE = Path(__file__).resolve().parents[2] / "haunted_house"
DOC = f".kiro/specs/{SPEC}/requirements.md"


class RecordingWriter:
    """The real Spec 2 writer, with a note of how each record was submitted."""

    def __init__(self, inner) -> None:
        self.inner = inner
        self.fail: dict = {}
        self.submitted: list[tuple[str, int | None, str]] = []

    def _note(self, how: str, expected: int | None, candidates) -> None:
        for candidate in candidates:
            kind = candidate.event_type
            if kind == "domain_event_recorded":
                kind = candidate.payload["kind"]
            self.submitted.append((how, expected, kind))

    async def append_candidates(self, mansion_id, candidates):
        self._note("append", None, candidates)
        return await self.inner.append_candidates(mansion_id, candidates)

    async def compare_and_append(self, mansion_id, expected_sequence, candidates):
        result = await self.inner.compare_and_append(mansion_id, expected_sequence, candidates)
        if result.status == "ok":
            self._note("compare_and_append", expected_sequence, candidates)
        return result

    async def read_after(self, mansion_id, after_sequence, limit):
        return await self.inner.read_after(mansion_id, after_sequence, limit)


def play(tmp_path, scenario):
    async def go():
        async with house(tmp_path, validator=spec5_validator, wrap_writer=RecordingWriter) as h:
            return await scenario(h, runtime(h))

    return asyncio.run(go())


def _logs(h) -> list[Path]:
    return sorted(h.mansion.rglob("*.jsonl"))


# --- the interfaces exist, at the version Room Ghosts was built against -------------


def test_prerequisite_interfaces_are_present_and_compatible() -> None:
    status = inspect_prerequisites()
    assert status.ok and status.missing == () and status.code == "ok"
    assert check_prerequisites() == status
    assert SCHEMA_VERSION == 1 and REQUIRED_EVENT_TYPES <= ALLOWED_EVENT_TYPES
    # The named public types are the ones Room Ghosts imports, not copies.
    for cls in (AppEvent, AppEventCandidate, CanonicalEventWriter, WorkflowService, DoorProposal,
                ApprovalLedger, RoomToolService, CrewChat, SessionReconciler, GuardrailPort):
        assert cls.__module__.startswith("haunted_house.")
    assert {"append_candidates", "compare_and_append", "read_after"} <= set(dir(SeanceLogStore))
    assert [phase.value for phase in Phase] == ["requirements", "design", "tasks", "implementation"]


@pytest.mark.parametrize(
    "module, attribute",
    [
        ("core.seance_event", None),
        ("adapters.workflow_service", None),
        ("core.seance_persistence", "CanonicalEventWriter"),
        ("core.workflow", "decide_transition"),
        ("adapters.crew_chat", "CrewChat"),
        ("core.ghost_state", "reduce_ghost_snapshot"),
    ],
)
def test_an_absent_prerequisite_is_named_and_fails_closed(module: str, attribute: str | None) -> None:
    def loader(name: str):
        real = importlib.import_module(name)
        if name != "haunted_house." + module:
            return real
        if attribute is None:
            raise ImportError("prerequisite missing")
        clone = types.ModuleType(name)
        clone.__dict__.update({k: v for k, v in vars(real).items() if k != attribute})
        return clone

    status = inspect_prerequisites(loader)
    expected = module if attribute is None else f"{module}.{attribute}"
    assert not status.ok and status.code == CONTRACT_UNAVAILABLE
    assert any(item == expected or item.startswith(expected + ".") for item in status.missing)


def test_a_version_incompatible_prerequisite_fails_closed() -> None:
    def changed(name: str, **overrides):
        def loader(requested: str):
            real = importlib.import_module(requested)
            if requested != "haunted_house." + name:
                return real
            clone = types.ModuleType(requested)
            clone.__dict__.update(vars(real))
            clone.__dict__.update(overrides)
            return clone

        return inspect_prerequisites(loader)

    assert "core.seance_event.SCHEMA_VERSION==1" in changed("core.seance_event", SCHEMA_VERSION=2).missing
    fewer = changed("core.seance_event", ALLOWED_EVENT_TYPES=ALLOWED_EVENT_TYPES - {"crew_turn_ended"})
    assert "core.seance_event.event_type:crew_turn_ended" in fewer.missing

    class Writer:  # a writer whose compare-and-append lost its expectation
        async def append_candidates(self, mansion_id, candidates): ...
        async def compare_and_append(self, mansion_id, candidates): ...
        async def read_after(self, mansion_id, after_sequence, limit): ...

    drifted = changed("core.seance_persistence", CanonicalEventWriter=Writer)
    assert "core.seance_persistence.CanonicalEventWriter.compare_and_append()" in drifted.missing
    assert not changed("core.guardrail_events", PHASES=()).ok
    # No required module is silently optional.
    for name in REQUIRED_INTERFACES:
        assert name in changed_missing(name)


def changed_missing(name: str) -> tuple[str, ...]:
    def loader(requested: str):
        if requested == "haunted_house." + name:
            raise ModuleNotFoundError(requested)
        return importlib.import_module(requested)

    return inspect_prerequisites(loader).missing


# --- invariant 1: shared run identity --------------------------------------------------


def test_phase_start_gives_one_run_started_with_the_projection_identity(tmp_path) -> None:
    async def scenario(h, rt):
        await h.start(Phase.REQUIREMENTS)
        read = await h.port.read(MANSION)
        view = read.projection.phases[Phase.REQUIREMENTS]
        started = [e for e in read.events if e.event_type == "run_started"]
        assert len(started) == 1 and started[0].source.origin == "house"
        room = h.binding(view.session_slot)
        assert view.status is PhaseStatus.WORKING and view.door is DoorStatus.SEALED
        assert started[0].scope == room.scope == EventScope(
            MANSION, "archivist", view.session_slot, "requirements-1", 1
        )
        snapshot = reduce_ghost_snapshot(read.events, MANSION, "archivist")
        assert (snapshot.state, snapshot.run_id, snapshot.run_sequence) == ("working", "requirements-1", 1)
        # Room Ghosts reads the same records through its own narrow port.
        assert (await rt.port.ghost_snapshot(MANSION, "archivist")) == snapshot
        assert (await rt.port.read(MANSION)).events == read.events

    play(tmp_path, scenario)


# --- invariants 2 and 3: one writer, one log, compare-and-append authority -------------------


def test_every_domain_candidate_returns_through_the_one_writer_and_log(tmp_path) -> None:
    async def scenario(h, rt):
        await h.pass_phase(Phase.REQUIREMENTS, REQUIREMENTS)  # Door proposal and approval
        await h.pass_phase(Phase.DESIGN, DESIGN)
        await h.pass_phase(Phase.TASKS, TASKS)
        await h.start(Phase.IMPLEMENTATION)
        slot = (await h.view(reconcile=False)).read.projection.phases[Phase.IMPLEMENTATION].session_slot
        tinker = h.binding(slot)
        run = rt.run(tinker)

        rooms = RoomToolService(h.port, h.root, operations=h.service)
        denied = await rooms.call(tinker, "write_room_file", {"path": "../x.py", "content": "x"})
        assert denied["ok"] is False  # path denial
        (h.mansion / "src").mkdir()
        (h.mansion / "src" / "old.py").write_text("x\n", encoding="utf-8")
        action = tinker_delete("src/old.py")
        proposal_id, digest, descriptor = await h.propose(tinker, action)  # risky proposal
        stale = (await h.view(reconcile=False)).version - 1
        with pytest.raises(Exception) as refused:
            await h.service.decide_risky_action(
                MANSION, proposal_id, approve=True, action_digest=digest,
                command_id="cmd-stale", expected_version=stale,
            )
        assert refused.value.code == "stale_version"
        await h.decide_risky(proposal_id, digest)
        executed = await h.service.consume_and_execute(tinker, proposal_id, descriptor)
        assert executed.status == "succeeded"

        claim = await rt.claims.acquire(tinker.scope, "1.2", ("src/guestbook/store.py",), 1)  # task claim
        assert claim.ok
        run = rt.run(tinker, task_id="1.2", claim_id=claim.claim.claim_id)
        requested = AppEventCandidate(  # cancellation requested
            schema_version=1, event_type="ghost_progressed", scope=run.scope,
            source=EventSource("house", "run_progress", (run.run_id, "cancel_requested"), 0, "", 0),
            caused_by=(), occurred_at_ms=None,
            payload={"kind": "cancel_requested", "reason": "Cancelling"},
        )
        assert (await rt.port.append(MANSION, [requested])).ok
        cancelled = await rt.gate.settle_blocked(run, "cancelled")  # cancellation confirmed
        assert cancelled.status == "blocked" and cancelled.claim_released

        # One Event_Log, and it replays to exactly what the services read.
        logs = _logs(h)
        assert len(logs) == 1 and logs[0].parent.name == "seance"
        parsed = parse_event_log(logs[0].read_bytes())
        assert parsed.diagnostics == ()
        live = await h.port.read(MANSION)
        assert [e.record_id for e in select_events(parsed.events).events] == [e.record_id for e in live.events]
        kinds = {
            e.payload.get("kind") if e.event_type == "domain_event_recorded" else e.event_type
            for e in parsed.events
        }
        assert {
            "run_started", "phase_output_ready", "door_approved", "path_denied",
            "risky_action_proposed", "risky_action_approved", "risky_action_consumed",
            "risky_action_succeeded", "task_claim_acquired", "task_claim_released",
            "ghost_progressed", "run_blocked",
        } <= kinds
        # Every record in the log was submitted through the injected writer.
        assert len(h.writer.submitted) >= len(parsed.events)
        assert {kind for _how, _expected, kind in h.writer.submitted} >= kinds
        assert fold_workflow(parsed.events).phases == live.projection.phases
        assert replay_projection(parsed.events).risky_proposals.keys() == live.projection.risky_proposals.keys()

        # Authority is decided against the highest Sequence and consumed by CAS.
        by_kind = {kind: (how, expected) for how, expected, kind in h.writer.submitted}
        for kind in ("door_approved", "risky_action_approved", "risky_action_consumed",
                     "phase_start_reserved", "phase_output_ready", "task_claim_acquired",
                     "task_claim_released", "run_blocked"):
            how, expected = by_kind[kind]
            assert how == "compare_and_append" and isinstance(expected, int), kind
        consumed = next(e for e in parsed.events if e.event_type == "domain_event_recorded"
                        and e.payload["kind"] == "risky_action_consumed")
        assert by_kind["risky_action_consumed"][1] == consumed.sequence - 1
        ledger = live.projection.ledger
        assert ledger.proposals[proposal_id].status is ProposalStatus.SUCCEEDED
        # A second use of the consumed approval is refused.
        again = await h.service.consume_and_execute(tinker, proposal_id, descriptor)
        assert again.status != "succeeded"

        # Room Ghosts' port refuses anything that is not its own kind of fact.
        foreign = next(e for e in parsed.events if e.event_type == "domain_event_recorded"
                       and e.payload["kind"] == "door_approved")
        crew_made = next(e for e in parsed.events if e.event_type == "run_started")
        for candidate in (
            AppEventCandidate(1, foreign.event_type, foreign.scope, foreign.source, (), None, foreign.payload),
            AppEventCandidate(1, "run_completed", crew_made.scope,
                              EventSource("crew", "run_terminal", ("x",), 0, "", 0), (), None, {}),
            AppEventCandidate(1, "crew_turn_ended", crew_made.scope,
                              EventSource("house", "run_terminal", ("x",), 0, "", 0), (), None, {}),
        ):
            assert (await rt.port.append(MANSION, [candidate])).code == "not_a_room_ghost_candidate"
        assert (await rt.port.append(MANSION, [chat_done("slot-1")])).status == "refused"  # type: ignore[list-item]

    play(tmp_path, scenario)


# --- invariant 4: raw Crew envelopes enter only Spec 2 ingest -----------------------------------


def test_only_spec_2_maps_raw_crew_envelopes() -> None:
    importers = []
    for path in sorted(PACKAGE.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and (node.module or "").endswith("crew_event_normalizer"):
                importers.append(path.relative_to(PACKAGE).as_posix())
    assert sorted(set(importers)) == [
        "adapters/seance_service.py", "core/seance_history.py", "seance_routes.py",
    ]
    # One canonical writer implementation, one log parser.
    stores = [p.name for p in PACKAGE.rglob("*.py") if "def compare_and_append" in p.read_text(encoding="utf-8")]
    assert sorted(stores) == [
        "canonical_port.py", "guardrail_port.py", "seance_log_store.py", "seance_persistence.py",
    ]


def test_duplicate_raw_delivery_is_one_canonical_fact(tmp_path) -> None:
    async def scenario(h, rt):
        await h.start(Phase.REQUIREMENTS)
        slot = (await h.view(reconcile=False)).read.projection.phases[Phase.REQUIREMENTS].session_slot
        first = await h.ingest([chat_done(slot)])
        second = await h.ingest([chat_done(slot), chat_done(slot)])
        assert second.events[0].record_id == first.events[0].record_id
        turn_ends = [e for e in await h.events() if e.event_type == "crew_turn_ended"]
        assert len(turn_ends) == 1 and turn_ends[0].source.origin == "crew"
        # An envelope for a slot the house never registered is refused whole.
        assert (await h.seance.ingest(MANSION, [])).status == "invalid_request"

    play(tmp_path, scenario)


# --- invariant 5: a turn end is not an outcome --------------------------------------------------


def test_turn_end_is_nonterminal_until_room_ghosts_validates(tmp_path) -> None:
    async def scenario(h, rt):
        await h.start(Phase.REQUIREMENTS)
        slot = (await h.view(reconcile=False)).read.projection.phases[Phase.REQUIREMENTS].session_slot
        room = h.binding(slot)
        run = rt.run(room)
        await h.write_spec(room, REQUIREMENTS)
        turn = (await h.ingest([chat_done(slot)])).events[0]

        events = await h.events()
        projection = fold_ghost_events(events)
        assert [s.state for s in projection.snapshots if s.ghost_id == "archivist"] == ["working"]
        assert not [e for e in events if e.event_type in ("run_completed", "run_failed", "run_blocked")]
        view = (await h.view(reconcile=False)).read.projection.phases[Phase.REQUIREMENTS]
        assert view.status is PhaseStatus.WORKING and view.door is DoorStatus.SEALED

        outcome = await rt.gate.settle_turn(run, turn, ready_result(run, {DOC: REQUIREMENTS}))
        again = await rt.gate.settle_turn(run, turn, ready_result(run, {DOC: REQUIREMENTS}))
        assert outcome.status == "completed" and again.duplicate and again.event == outcome.event
        terminals = [e for e in await h.events() if e.event_type in ("run_completed", "run_failed", "run_blocked")]
        assert [e.record_id for e in terminals] == [outcome.event.record_id]
        assert terminals[0].source.origin == "house"
        assert reduce_ghost_snapshot(await h.events(), MANSION, "archivist").state == "done"

    play(tmp_path, scenario)


# --- invariant 6: the reasons Room Ghosts needs are schema-valid --------------------------------


@pytest.mark.parametrize(
    "reason", ["cancelled", "cancel_unconfirmed", "capacity_unavailable", "contract_unavailable"]
)
def test_blocked_reasons_are_schema_valid_and_survive_redaction(reason: str) -> None:
    scope = EventScope(MANSION, "tinker-1", "slot-9", "implementation-1", 1)
    started = AppEventCandidate(
        1, "run_started", scope, EventSource("house", "run", ("implementation-1",), 0, "", 0),
        (), None, {"reason": "Building", "room": "workshop"},
    )
    progressed = AppEventCandidate(
        1, "ghost_progressed", scope,
        EventSource("house", "run_progress", ("implementation-1", "cancel_requested"), 0, "", 0),
        (), None, {"kind": "cancel_requested", "reason": "Cancelling"},
    )
    blocked = AppEventCandidate(
        1, "run_blocked", scope, EventSource("house", "run_terminal", ("implementation-1",), 0, "", 0),
        (), None, {"reason": reason, "code": reason, "phase": "implementation", "attempt": 1,
                   "task_id": "1.2", "findings": []},
    )
    for candidate in (started, progressed, blocked):
        assert validate_candidate(candidate).ok
    prepared = prepare_candidates([started, progressed, blocked])
    assert prepared.ok
    assert [item.candidate.payload for item in prepared.candidates] == [
        started.payload, progressed.payload, blocked.payload
    ]  # nothing in them is credential shaped
    from tests.room_ghost_runtime_support import acknowledge

    events = acknowledge([started, progressed, blocked])
    assert reduce_ghost_snapshot(events[:2], MANSION, "tinker-1").state == "working"
    snapshot = reduce_ghost_snapshot(events, MANSION, "tinker-1")
    assert (snapshot.state, snapshot.reason) == ("blocked", reason)


def test_room_ghosts_port_holds_no_log_state() -> None:
    names = set(vars(CanonicalRunPort(writer=object())))  # type: ignore[arg-type]
    assert names == {"_writer", "_reader"}
    assert GuardrailEventKind.PATH_DENIED.value == "path_denied"
