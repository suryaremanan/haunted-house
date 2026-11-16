"""The pure Room Ghosts folds: runs, selections, and task outcomes
(room-ghosts tasks 7.1, 7.3, 7.4).

Records are built with the real Spec 2 preparation, so a test folds exactly
what the writer would have acknowledged.

Validates: Requirements 8.5, 8.6, 9.7, 10.4, 10.5, 12.5, 12.7, 12.8.
"""

from __future__ import annotations

import pytest

from haunted_house.core import guardrail_events as ge
from haunted_house.core.guardrail_events import Phase, operator_scope
from haunted_house.core.room_ghost_events import (
    RoomGhostEventKind,
    RoomGhostPayloadError,
    build_room_ghost_candidate,
)
from haunted_house.core.room_projection import RunOptions, run_recovery_view, runs_json
from haunted_house.core.room_runs import fold_room_facts, phase_of_ghost, task_outcomes
from haunted_house.core.seance_event import AppEventCandidate, EventScope, EventSource
from haunted_house.core.task_claims import acquire_candidate, claim_id_for, release_candidate
from haunted_house.core.task_plan import LeafTask, TaskPlan
from haunted_house.services.cancellation import cancel_request_candidate
from haunted_house.services.terminal_gate import terminal_candidate, terminal_outcome
from haunted_house.core.ghost_run import GhostRunBinding
from tests.room_ghost_runtime_support import MANSION, acknowledge

pytestmark = pytest.mark.core

K = RoomGhostEventKind
OPERATOR = operator_scope(MANSION)
PLAN = TaskPlan(
    leaves=(
        LeafTask("1.1", "Model", False, False, ("1.1",), ("src/model.py",), 0),
        LeafTask("1.2", "Store", False, False, ("1.2",), ("src/store.py",), 1),
        LeafTask("2.1", "App", False, False, ("1.3",), ("src/app.py",), 2),
    ),
    waves=(("1.1", "1.2"), ("2.1",)),
)


def scope(ghost: str, run_id: str, sequence: int = 1, slot: str | None = None) -> EventScope:
    return EventScope(MANSION, ghost, slot or f"slot-{run_id}", run_id, sequence)


def started(target: EventScope) -> AppEventCandidate:
    return AppEventCandidate(
        1, "run_started", target, EventSource("house", "run", (target.run_id,), 0, "", 0), (), None,
        {"reason": "Working", "room": "workshop"},
    )


def binding(target: EventScope, phase: Phase, task_id: str | None = None, attempt: int = 1) -> GhostRunBinding:
    return GhostRunBinding(
        target.run_id, target.run_sequence, MANSION, "demo", phase, target.ghost_id, target.session_slot,
        attempt, task_id, claim_id_for(target, task_id, attempt) if task_id else None,
    )


class Log:
    """Appends candidates the way the writer acknowledges them."""

    def __init__(self) -> None:
        self.events: list = []

    def add(self, *candidates: AppEventCandidate):
        acknowledged = acknowledge(list(candidates), after=len(self.events))
        self.events.extend(acknowledged)
        return acknowledged[-1]

    def facts(self):
        return fold_room_facts(self.events, terminal_outcome)

    def claim(self, target: EventScope, task_id: str, attempt: int = 1):
        leaf = next(item for item in PLAN.leaves if item.task_id == task_id)
        self.add(acquire_candidate(target, task_id, leaf.writes, attempt), started(target))
        return self.facts().ledger.get(claim_id_for(target, task_id, attempt))

    def end(self, target: EventScope, phase: Phase, kind: str, code: str, task_id=None, attempt=1, release=None):
        terminal = self.add(terminal_candidate(binding(target, phase, task_id, attempt), kind, code))
        if release is not None:
            claim = self.facts().ledger.get(claim_id_for(target, task_id, attempt))
            self.add(release_candidate(claim, terminal.record_id, release))
        return terminal

    def select(self, *task_ids: str, command: str = "cmd-select-0001"):
        self.add(build_room_ghost_candidate(OPERATOR, K.WORKSHOP_SELECTED,
                                            {"command_id": command, "task_ids": list(task_ids)}))

    def reserve(self, phase: Phase, reservation: str = "res-0001", command: str = "cmd-start-0001"):
        self.add(ge.phase_start_reserved(OPERATOR, phase=phase, reservation_id=reservation, command_id=command))


def test_a_ghost_name_fixes_its_phase():
    assert phase_of_ghost("archivist") is Phase.REQUIREMENTS
    assert phase_of_ghost("draughtsman") is Phase.DESIGN
    assert phase_of_ghost("foreman") is Phase.TASKS
    assert phase_of_ghost("tinker-2") is Phase.IMPLEMENTATION
    assert phase_of_ghost("operator") is None and phase_of_ghost("tinker-x") is None


def test_phase_attempts_count_runs_since_the_latest_start_and_stop_at_three():
    log = Log()
    log.reserve(Phase.REQUIREMENTS)
    for number in (1, 2, 3, 4):
        target = scope("archivist", f"requirements-{number}", number)
        log.add(started(target))
        log.end(target, Phase.REQUIREMENTS, "run_failed", "ghost_failed")
    facts = log.facts()
    assert [run.attempt for run in facts.runs] == [1, 2, 3, 3]
    assert facts.latest_phase_run(Phase.REQUIREMENTS).run_id == "requirements-4"
    # Only the newest run of the phase is offered a retry, and never a fourth attempt.
    views = [run_recovery_view(run, facts) for run in facts.runs]
    assert [view.latest for view in views] == [False, False, False, True]
    shown = runs_json(facts, {}, RunOptions(retryable_phases=frozenset({Phase.REQUIREMENTS})))
    assert [run["can_retry"] for run in shown] == [False, False, False, False]
    # A new explicit phase start begins the count again.
    log.reserve(Phase.REQUIREMENTS, "res-0002", "cmd-start-0002")
    fresh = scope("archivist", "requirements-5", 5)
    log.add(started(fresh))
    log.end(fresh, Phase.REQUIREMENTS, "run_blocked", "tool_blocked")
    facts = log.facts()
    assert facts.runs[-1].attempt == 1
    shown = runs_json(facts, {}, RunOptions(retryable_phases=frozenset({Phase.REQUIREMENTS})))
    assert [run["can_retry"] for run in shown] == [False, False, False, False, True]


def test_task_outcomes_follow_claims_terminals_and_explicit_retries():
    log = Log()
    log.reserve(Phase.IMPLEMENTATION)
    log.select("1.1", "1.2", "2.1")
    assert task_outcomes(log.facts(), PLAN)["1.1"].status == "queued"
    one, two = scope("tinker-1", "task-1-1-a1"), scope("tinker-2", "task-1-2-a1")
    log.claim(one, "1.1")
    log.claim(two, "1.2")
    outcomes = task_outcomes(log.facts(), PLAN)
    assert (outcomes["1.1"].status, outcomes["1.1"].attempt, outcomes["1.1"].run_id) == ("active", 1, "task-1-1-a1")
    assert outcomes["2.1"].status == "queued" and outcomes["2.1"].attempt == 0

    log.end(one, Phase.IMPLEMENTATION, "run_failed", "tests_failed", "1.1", release="failed")
    failed = task_outcomes(log.facts(), PLAN)["1.1"]
    assert (failed.status, failed.attempt, failed.reason_code) == ("failed", 1, "tests_failed")

    # An explicit retry puts it back in the queue with one attempt used.
    log.add(build_room_ghost_candidate(OPERATOR, K.RETRY_REQUESTED, {
        "command_id": "cmd-retry-0001", "run_id": "task-1-1-a1", "task_id": "1.1", "attempt": 2,
    }))
    queued = task_outcomes(log.facts(), PLAN)["1.1"]
    assert (queued.status, queued.attempt, queued.run_id) == ("queued", 1, None)
    assert log.facts().command("cmd-retry-0001").kind is K.RETRY_REQUESTED

    again = scope("tinker-1", "task-1-1-a2", 2)
    log.claim(again, "1.1", attempt=2)
    assert task_outcomes(log.facts(), PLAN)["1.1"].attempt == 2
    # The old retry command does not requeue the new attempt when it fails too.
    log.end(again, Phase.IMPLEMENTATION, "run_failed", "tests_failed", "1.1", attempt=2, release="failed")
    assert task_outcomes(log.facts(), PLAN)["1.1"].status == "failed"

    # The checkbox is the record of completion, whatever the log says.
    done = TaskPlan(
        tuple(LeafTask(l.task_id, l.title, l.optional, l.task_id == "1.1", l.requirements, l.writes, l.document_index)
              for l in PLAN.leaves),
        PLAN.waves,
    )
    assert task_outcomes(log.facts(), done)["1.1"].status == "complete"


def test_a_refused_dispatch_is_not_an_attempt():
    log = Log()
    log.reserve(Phase.IMPLEMENTATION)
    log.select("1.1", "1.2")
    refused = scope("tinker-1", "task-1-1-a1")
    claim = log.claim(refused, "1.1")
    log.add(release_candidate(claim, claim.acquired_record_id, "not_started"))
    log.end(refused, Phase.IMPLEMENTATION, "run_blocked", "crew_capacity", "1.1")
    outcome = task_outcomes(log.facts(), PLAN)["1.1"]
    assert (outcome.status, outcome.attempt, outcome.run_id) == ("queued", 0, None)
    # A turn Crew accepted and then abandoned: blocked as capacity, queued again.
    abandoned = scope("tinker-2", "task-1-2-a1")
    log.claim(abandoned, "1.2")
    log.end(abandoned, Phase.IMPLEMENTATION, "run_blocked", "crew_capacity", "1.2", release="blocked")
    outcome = task_outcomes(log.facts(), PLAN)["1.2"]
    assert (outcome.status, outcome.attempt) == ("queued", 0)
    shown = runs_json(log.facts(), task_outcomes(log.facts(), PLAN),
                      RunOptions(retryable_phases=frozenset({Phase.IMPLEMENTATION})))
    assert [(run["reason_code"], run["can_retry"]) for run in shown] == [
        ("crew_capacity", False), ("crew_capacity", False),
    ]


def test_an_unconfirmed_cancellation_keeps_the_claim_and_the_task_blocked():
    log = Log()
    log.reserve(Phase.IMPLEMENTATION)
    log.select("1.1")
    target = scope("tinker-1", "task-1-1-a1")
    log.claim(target, "1.1")
    log.add(cancel_request_candidate(binding(target, Phase.IMPLEMENTATION, "1.1"), "cmd-cancel-0001"))
    facts = log.facts()
    run = facts.runs[0]
    assert run.cancel_requested and run.active
    shown = runs_json(facts, task_outcomes(facts, PLAN), RunOptions(cancellation_enabled=True))[0]
    assert (shown["can_cancel"], shown["cancel_requested"]) == (False, True)
    log.end(target, Phase.IMPLEMENTATION, "run_blocked", "cancel_unconfirmed", "1.1")
    facts = log.facts()
    outcome = task_outcomes(facts, PLAN)["1.1"]
    assert (outcome.status, outcome.reason_code) == ("blocked", "cancel_unconfirmed")
    assert facts.ledger.active_for_task("1.1") is not None
    shown = runs_json(facts, {"1.1": outcome}, RunOptions(retryable_phases=frozenset({Phase.IMPLEMENTATION})))[0]
    assert shown["can_retry"] is False and shown["claim_paths"] == ["src/model.py"]
    assert shown["cancel_requested"] is False


def test_selections_count_only_since_the_latest_workshop_start():
    log = Log()
    log.reserve(Phase.IMPLEMENTATION)
    log.select("1.1", "1.2", command="cmd-select-0001")
    assert log.facts().selected == {"1.1", "1.2"}
    log.reserve(Phase.IMPLEMENTATION, "res-0002", "cmd-start-0002")
    assert log.facts().selected == frozenset()
    log.select("2.1", command="cmd-select-0002")
    facts = log.facts()
    assert facts.selected == {"2.1"}
    # Both commands stay known, so a repeated command is recognized.
    assert facts.command("cmd-select-0001") is not None and facts.command("cmd-select-0002") is not None
    assert facts.command("cmd-unknown") is None and facts.command(None) is None


def test_runs_with_a_reused_identifier_or_without_a_task_are_never_shown_twice_or_malformed():
    log = Log()
    # Two legacy Tinker runs under one identifier, neither with a claim.
    log.add(started(scope("tinker-1", "implementation-1")), started(scope("tinker-2", "implementation-1")))
    log.add(started(scope("archivist", "requirements-1")))
    facts = log.facts()
    assert facts.run("implementation-1") is None  # ambiguous: no command may target it
    shown = runs_json(facts, {}, RunOptions())
    assert [run["run_id"] for run in shown] == ["requirements-1"]
    assert shown[0]["task_id"] is None and shown[0]["session_link"] is None
    linked = runs_json(facts, {}, RunOptions(session_links_enabled=True))
    assert linked[0]["session_link"] == "slot-requirements-1"


def test_command_records_refuse_anything_but_bounded_identifiers():
    good = {"command_id": "cmd-feedback-0001", "phase": "design", "run_id": "design-1",
            "feedback_sha256": "a" * 64, "size_bytes": 12}
    assert build_room_ghost_candidate(OPERATOR, K.REVISION_REQUESTED, good).payload["kind"] == "revision_requested"
    for change in (
        {"phase": "implementation"}, {"feedback_sha256": "A" * 64}, {"size_bytes": 0},
        {"feedback": "the text itself"}, {"run_id": "bad run"},
    ):
        with pytest.raises(RoomGhostPayloadError):
            build_room_ghost_candidate(OPERATOR, K.REVISION_REQUESTED, {**good, **change})
    for task_ids in ([], ["1.1", "1.1"], ["../x"], "1.1"):
        with pytest.raises(RoomGhostPayloadError):
            build_room_ghost_candidate(OPERATOR, K.WORKSHOP_SELECTED,
                                       {"command_id": "cmd-select-0001", "task_ids": task_ids})
    for attempt in (1, 4):
        with pytest.raises(RoomGhostPayloadError):
            build_room_ghost_candidate(OPERATOR, K.RETRY_REQUESTED, {
                "command_id": "cmd-retry-0001", "run_id": "design-1", "task_id": None, "attempt": attempt,
            })


def _crew(target: EventScope, event_type: str, identity: str, payload: dict) -> AppEventCandidate:
    return AppEventCandidate(
        1, event_type, target, EventSource("crew", "chat", (identity,), 0, "gen-1", 0), (), None, payload
    )


def test_a_turn_that_waits_for_the_operator_is_not_an_ended_turn():
    log = Log()
    target = scope("archivist", "requirements-1")
    log.add(started(target))
    log.add(_crew(target, "crew_turn_ended", "t1", {"generation": "gen-1", "turn": 1, "continuing": True}))
    assert log.facts().runs[0].turn_ended is None  # Crew goes on by itself
    log.add(_crew(target, "approval_requested", "m-1", {"mid": "m-1"}))
    log.add(_crew(target, "crew_turn_ended", "t2", {"generation": "gen-1", "turn": 2, "needs_input": True}))
    run = log.facts().runs[0]
    assert run.turn_ended is None and run.crew_seen  # a tool prompt is open: not finished
    log.add(_crew(target, "approval_decided", "m-1d", {"mid": "m-1", "outcome": "approved"}))
    log.add(_crew(target, "crew_turn_ended", "t3", {"generation": "gen-1", "turn": 3, "continuing": False}))
    ended = log.facts().runs[0].turn_ended
    assert ended is not None and ended.payload["turn"] == 3
    # Without an open prompt, a turn that stops for input has ended with no result.
    other = scope("draughtsman", "design-1")
    log.add(started(other))
    log.add(_crew(other, "crew_turn_ended", "t4", {"generation": "gen-2", "turn": 1, "needs_input": True}))
    assert log.facts().run_of_scope(other).turn_ended is not None
