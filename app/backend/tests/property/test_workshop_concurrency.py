"""Property 11 for the Workshop scheduler.

Feature: doors-and-guardrails, Property 11: Implementation concurrency never exceeds three

For any assignment queue and session lifecycle, the scheduler holds at most
three implementation sessions in ``starting`` or ``working`` states.

Validates: Requirements 7.9.
"""

from __future__ import annotations

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from haunted_house.core.workshop_scheduler import (
    MAX_WORKSHOP_SESSIONS,
    Admit,
    Complete,
    Confirm,
    Enqueue,
    Fail,
    Retry,
    SeatState,
    Stop,
    active_count,
    admissible,
    admit_ready,
    apply_event,
    empty_schedule,
    fold_schedule,
)

pytestmark = pytest.mark.core

_IDS = [f"task-{n}" for n in range(8)]
_EVENTS = (Enqueue, Admit, Confirm, Complete, Fail, Stop, Retry)
_ACTIVE = (SeatState.STARTING, SeatState.WORKING)

events = st.lists(
    st.tuples(st.sampled_from(_EVENTS), st.sampled_from([*_IDS, "", "bad id", "task-unknown"])),
    max_size=120,
)
# ``None`` stands for "admit everything a free seat allows".
steps = st.lists(st.one_of(st.none(), st.tuples(st.sampled_from(_EVENTS), st.sampled_from(_IDS))), max_size=120)


def _check(schedule) -> None:
    active = [item for item in schedule.assignments if item.state in _ACTIVE]
    assert len(active) == active_count(schedule) <= MAX_WORKSHOP_SESSIONS
    seats = [item.seat for item in active]
    assert len(set(seats)) == len(seats)
    assert all(seat in range(1, MAX_WORKSHOP_SESSIONS + 1) for seat in seats)
    assert all(item.seat is None for item in schedule.assignments if item.state not in _ACTIVE)
    ids = [item.assignment_id for item in schedule.assignments]
    assert len(set(ids)) == len(ids)
    assert len(admissible(schedule)) <= MAX_WORKSHOP_SESSIONS - len(active)


@settings(max_examples=300)
@given(events)
def test_concurrency_never_exceeds_three_for_any_event_sequence(sequence):
    schedule = empty_schedule()
    for kind, assignment_id in sequence:
        before = schedule
        schedule = apply_event(schedule, kind(assignment_id))
        _check(schedule)
        was = before.get(assignment_id) if isinstance(assignment_id, str) else None
        now = schedule.get(assignment_id) if isinstance(assignment_id, str) else None
        if kind is Admit and now is not None and now is not was:
            # A seat is taken only from the head of the line into a free seat.
            assert was is not None and was.state is SeatState.QUEUED
            assert assignment_id in admissible(before)
        if now is not None and was is not None and now.state in _ACTIVE and was.state not in _ACTIVE:
            # Nothing but an explicit admission starts a session: a failed or
            # stopped assignment never restarts by itself.
            assert kind is Admit
        if kind is Retry and now is not was and now is not None:
            assert was.state in (SeatState.FAILED, SeatState.STOPPED) and now.state is SeatState.QUEUED
    # The fold is deterministic.
    replayed = fold_schedule(kind(assignment_id) for kind, assignment_id in sequence)
    assert replayed == schedule


@settings(max_examples=300)
@given(steps)
def test_greedy_admission_fills_seats_in_queue_order_and_never_more(sequence):
    schedule = empty_schedule()
    for step in sequence:
        if step is None:
            waiting_before = [
                item.assignment_id
                for item in sorted(schedule.assignments, key=lambda item: item.queue_position)
                if item.state is SeatState.QUEUED
            ]
            free = MAX_WORKSHOP_SESSIONS - active_count(schedule)
            schedule, admitted = admit_ready(schedule)
            assert [item.assignment_id for item in admitted] == waiting_before[:free]
            assert all(item.state is SeatState.STARTING for item in admitted)
            # After admission either the seats are full or nobody is waiting.
            assert active_count(schedule) == MAX_WORKSHOP_SESSIONS or not admissible(schedule)
        else:
            kind, assignment_id = step
            schedule = apply_event(schedule, kind(assignment_id))
        _check(schedule)


def test_a_fourth_assignment_waits_until_a_seat_frees_and_a_failure_needs_a_retry():
    schedule = fold_schedule(Enqueue(name) for name in _IDS[:5])
    schedule, admitted = admit_ready(schedule)
    assert [item.assignment_id for item in admitted] == _IDS[:3]
    assert [item.seat for item in admitted] == [1, 2, 3]
    assert apply_event(schedule, Admit(_IDS[3])) == schedule  # no free seat
    assert admit_ready(schedule) == (schedule, ())

    schedule = apply_event(schedule, Confirm(_IDS[0]))
    schedule = apply_event(schedule, Fail(_IDS[1]))  # fails while still starting
    assert active_count(schedule) == 2
    # The fifth cannot jump the line.
    assert apply_event(schedule, Admit(_IDS[4])) == schedule
    schedule, admitted = admit_ready(schedule)
    assert [(item.assignment_id, item.seat) for item in admitted] == [(_IDS[3], 2)]

    assert schedule.get(_IDS[1]).state is SeatState.FAILED
    assert _IDS[1] not in admissible(schedule)
    schedule = apply_event(schedule, Retry(_IDS[1]))
    retried = schedule.get(_IDS[1])
    assert retried.state is SeatState.QUEUED
    assert retried.queue_position > schedule.get(_IDS[4]).queue_position
    schedule = apply_event(schedule, Complete(_IDS[0]))
    schedule, admitted = admit_ready(schedule)
    assert [item.assignment_id for item in admitted] == [_IDS[4]]
    assert apply_event(schedule, Stop(_IDS[4])).get(_IDS[4]).state is SeatState.STOPPED
