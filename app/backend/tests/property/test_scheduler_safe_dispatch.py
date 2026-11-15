"""Property 7 for the Room Ghosts Workshop scheduler (task 6.3).

Feature: room-ghosts, Property 7: Scheduler dispatches only safe ready work

The scheduler is compared with a small reference written without sharing its
selection logic, and every dispatch is checked against the safety rules one
by one.

Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.8, 12.7.
"""

from __future__ import annotations

import itertools

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from haunted_house.core.task_plan import claims_may_overlap
from haunted_house.core.workshop_scheduler import (
    MAX_ATTEMPTS,
    MAX_TINKERS,
    TaskOutcome,
    WorkshopState,
    choose_dispatches,
)
from tests.room_ghost_runtime_support import workshop_states

pytestmark = pytest.mark.core

_SETTLED = {"complete", "skipped"}


def _status(state: WorkshopState, task_id: str) -> TaskOutcome:
    leaf = next(item for item in state.plan.leaves if item.task_id == task_id)
    return state.outcomes.get(task_id) or TaskOutcome("complete" if leaf.complete else "queued")


def _reference(state: WorkshopState, available: int) -> list[str]:
    """Walk waves upward; stop at the first with unsettled selected work."""

    seats = max(0, min(available, 3, 3 - len(state.active_claims)))
    known = {leaf.task_id for leaf in state.plan.leaves}
    for wave in state.plan.waves:
        members = [task for task in wave if task in known and task in state.selected]
        if all(_status(state, task).status in _SETTLED for task in members):
            continue
        busy = [claim.paths for claim in state.active_claims]
        picked: list[str] = []
        order = {leaf.task_id: leaf.document_index for leaf in state.plan.leaves}
        writes = {leaf.task_id: leaf.writes for leaf in state.plan.leaves}
        for task in sorted(members, key=order.__getitem__):
            outcome = _status(state, task)
            if len(picked) == seats:
                break
            if outcome.status != "queued" or outcome.attempt >= 3:
                continue
            if any(claim.task_id == task for claim in state.active_claims):
                continue
            if any(claims_may_overlap(writes[task], other) for other in busy):
                continue
            busy.append(writes[task])
            picked.append(task)
        return picked
    return []


@settings(max_examples=200)
@given(state=workshop_states(), available=st.integers(min_value=-2, max_value=6))
def test_scheduler_dispatches_only_safe_ready_work(state: WorkshopState, available: int) -> None:
    # Feature: room-ghosts, Property 7: Scheduler dispatches only safe ready work
    dispatches = choose_dispatches(state, available)
    chosen = [item.task_id for item in dispatches]

    assert chosen == _reference(state, available)
    assert choose_dispatches(state, available) == dispatches  # deterministic

    leaves = {leaf.task_id: leaf for leaf in state.plan.leaves}
    wave_of = {task: index for index, wave in enumerate(state.plan.waves) for task in wave}
    # The three-Tinker cap, counting the claims already held.
    assert len(chosen) <= max(0, min(available, MAX_TINKERS))
    assert len(chosen) + len(state.active_claims) <= max(MAX_TINKERS, len(state.active_claims))
    assert len(set(chosen)) == len(chosen)

    for item in dispatches:
        leaf = leaves[item.task_id]
        outcome = _status(state, item.task_id)
        assert item.task_id in state.selected
        assert item.paths == leaf.writes
        # Never a completed, running, failed, cancelled, blocked or skipped task.
        assert outcome.status == "queued" and not (
            item.task_id not in state.outcomes and leaf.complete
        )
        assert outcome.attempt < MAX_ATTEMPTS
        # Every selected task of every lower wave is complete or skipped, so
        # no dependent of a failed, cancelled, or blocked task is chosen.
        for other, index in wave_of.items():
            if index < wave_of[item.task_id] and other in state.selected and other in leaves:
                assert _status(state, other).status in _SETTLED
        # Provably disjoint from every active claim.
        for held in state.active_claims:
            assert held.task_id != item.task_id
            assert not claims_may_overlap(item.paths, held.paths)
    # All chosen tasks share one wave and are pairwise disjoint.
    assert len({wave_of[task] for task in chosen}) <= 1
    for left, right in itertools.combinations(dispatches, 2):
        assert not claims_may_overlap(left.paths, right.paths)
    # Document order.
    indexes = [leaves[task].document_index for task in chosen]
    assert indexes == sorted(indexes)
