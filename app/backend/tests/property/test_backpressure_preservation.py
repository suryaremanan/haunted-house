"""Property 8 for Workshop backpressure (task 6.5).

Feature: room-ghosts, Property 8: Backpressure preserves task identity and attempt

Validates: Requirements 8.6, 8.7.
"""

from __future__ import annotations

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from haunted_house.core.task_plan import LeafTask, TaskPlan
from haunted_house.core.workshop_scheduler import (
    BACKPRESSURE_DELAYS,
    MAX_CREW_REFUSALS,
    BackpressureState,
    TaskOutcome,
    WorkshopState,
    backpressure_delay,
    choose_dispatches,
    classify_crew_refusal,
    clear_backpressure,
    record_refusal,
)

pytestmark = pytest.mark.core

REASONS = st.sampled_from(["crew_capacity", "local_capacity", "claim_busy"])
# "accepted": Crew took the dispatch.  "completed": an active Tinker finished.
STEPS = st.lists(st.one_of(REASONS, st.sampled_from(["accepted", "completed"])), max_size=40)


def _plan() -> TaskPlan:
    leaves = tuple(
        LeafTask(f"1.{n}", f"Task {n}", False, False, ("1.1",), (f"src/t{n}/main.py",), n - 1)
        for n in (1, 2, 3)
    )
    return TaskPlan(leaves=leaves, waves=(tuple(leaf.task_id for leaf in leaves),))


@settings(max_examples=200)
@given(steps=STEPS, attempt=st.integers(min_value=0, max_value=2))
def test_backpressure_preserves_task_identity_and_attempt(steps: list[str], attempt: int) -> None:
    # Feature: room-ghosts, Property 8: Backpressure preserves task identity and attempt
    task_id = "1.2"
    outcome = TaskOutcome("queued", attempt=attempt)
    pressure: dict[str, BackpressureState] = {}
    failures = crew = 0
    plan = _plan()

    for step in steps:
        if step in ("accepted", "completed"):
            # An accepted dispatch or an active completion resets the count.
            pressure = clear_backpressure(pressure, task_id if step == "accepted" else None)
            assert task_id not in pressure
            failures = crew = 0
            continue

        result = record_refusal(outcome, pressure.get(task_id), task_id, step)  # type: ignore[arg-type]
        failures += 1
        crew += step == "crew_capacity"
        # A refusal is never an attempt and never loses the task.
        assert result.outcome.attempt == attempt
        if crew >= MAX_CREW_REFUSALS:
            # Bounded: the fifth uninterrupted Crew refusal blocks the task.
            assert result.capacity_unavailable and result.backpressure is None
            assert result.outcome.status == "blocked"
            assert result.outcome.reason_code == "capacity_unavailable"
            blocked = WorkshopState(plan, frozenset({"1.1", "1.2", "1.3"}), {task_id: result.outcome})
            assert task_id not in [item.task_id for item in choose_dispatches(blocked, 3)]
            return
        state = result.backpressure
        assert state is not None and not result.capacity_unavailable
        assert result.outcome.status == "queued" and result.outcome.reason_code is None
        assert state.task_id == task_id and state.last_reason == step
        assert state.dispatch_failures == failures and state.crew_refusals == crew
        assert state.next_delay_seconds == BACKPRESSURE_DELAYS[min(failures, 5) - 1]
        assert state.next_delay_seconds == backpressure_delay(failures) <= 15
        pressure[task_id] = state
        outcome = result.outcome

        # Still queued in document order: when capacity returns, the same
        # task is dispatched exactly where the plan puts it.
        queued = WorkshopState(
            plan, frozenset({"1.1", "1.2", "1.3"}), {task_id: outcome}, backpressure=pressure
        )
        assert [item.task_id for item in choose_dispatches(queued, 3)] == ["1.1", "1.2", "1.3"]
        assert [item.task_id for item in choose_dispatches(queued, 0)] == []


def test_delays_follow_the_fixed_sequence() -> None:
    assert [backpressure_delay(n) for n in range(1, 9)] == [1, 2, 4, 8, 15, 15, 15, 15]


def test_five_uninterrupted_crew_refusals_block_without_an_attempt() -> None:
    outcome, state = TaskOutcome("queued", attempt=1), None
    delays = []
    for _ in range(4):
        step = record_refusal(outcome, state, "1.1", "crew_capacity")
        outcome, state = step.outcome, step.backpressure
        delays.append(state.next_delay_seconds)
    assert delays == [1, 2, 4, 8]
    final = record_refusal(outcome, state, "1.1", "crew_capacity")
    assert final.capacity_unavailable and final.outcome == TaskOutcome(
        "blocked", attempt=1, reason_code="capacity_unavailable"
    )


def test_local_refusals_never_reach_capacity_unavailable() -> None:
    outcome, state = TaskOutcome("queued"), None
    for count in range(1, 40):
        reason = "local_capacity" if count % 2 else "claim_busy"
        step = record_refusal(outcome, state, "1.1", reason)  # type: ignore[arg-type]
        assert not step.capacity_unavailable
        outcome, state = step.outcome, step.backpressure
        assert state.crew_refusals == 0 and state.next_delay_seconds == backpressure_delay(count)


def test_state_of_another_task_is_not_inherited() -> None:
    other = BackpressureState("1.9", 4, 8, "crew_capacity", 4)
    step = record_refusal(TaskOutcome("queued"), other, "1.1", "crew_capacity")
    assert step.backpressure == BackpressureState("1.1", 1, 1, "crew_capacity", 1)


def test_only_verified_crew_signals_are_capacity() -> None:
    # RG-S5: 429 with one of five codes, or the abandoned-turn notice.
    for code in ("principal_active_limit", "principal_queue_full", "crew_active_limit",
                 "crew_queue_full", "session_create_rate"):
        assert classify_crew_refusal(429, code) == "crew_capacity"
    assert classify_crew_refusal(notice="background_turn_abandoned") == "crew_capacity"
    for status, code in ((503, "task_store_unavailable"), (503, "containment_unavailable"),
                         (507, "storage_limit"), (404, "slot_not_found"), (409, None),
                         (429, "something_new"), (429, None), (200, "crew_active_limit"),
                         (None, None)):
        assert classify_crew_refusal(status, code) is None


def test_retry_after_only_lengthens_the_delay() -> None:
    assert backpressure_delay(1, 10) == 10 and backpressure_delay(5, 10) == 15
    assert backpressure_delay(2, 600) == 60 and backpressure_delay(3, None) == 4
    assert backpressure_delay(3, "10") == 4 and backpressure_delay(3, -5) == 4
    step = record_refusal(TaskOutcome("queued"), None, "1.1", "crew_capacity", retry_after_seconds=10)
    assert step.backpressure.next_delay_seconds == 10 and step.outcome.attempt == 0
