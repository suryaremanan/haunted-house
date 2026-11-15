"""Properties 1 and 2 for the pure Phase_State_Machine.

Feature: doors-and-guardrails, Property 1: Phase order and explicit advancement always hold
Feature: doors-and-guardrails, Property 2: Workflow folding is deterministic over canonical Sequence

Validates: Requirements 1.1–1.9, 10.2, 12.1.
"""

from __future__ import annotations

import random

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from haunted_house.core.guardrail_events import PHASES, Phase, read_domain_record
from haunted_house.core.workflow import (
    DoorStatus,
    PhaseStatus,
    advance_workflow,
    fold_workflow,
    initial_workflow,
)
from tests.guardrail_support import (
    WORKFLOW_ACTIONS,
    WorkflowDriver,
    foreign_domain_event,
    natural_step,
    other_event,
)

pytestmark = pytest.mark.core

_IDLE = (PhaseStatus.NOT_STARTED, PhaseStatus.READY)
_STEP = st.tuples(
    # Mostly decided commands, sometimes a raw record that skips the machine,
    # sometimes a record from another domain or event type.
    st.sampled_from(["command"] * 6 + ["raw", "raw", "other", "foreign"]),
    st.sampled_from(WORKFLOW_ACTIONS),
    st.sampled_from(PHASES),
    st.integers(min_value=0, max_value=7),
)
_STEPS = st.lists(_STEP, min_size=1, max_size=45)
# A walk biased toward progress so later phases are reached often.
_PROGRESS = st.lists(
    st.one_of(
        st.tuples(
            st.just("advance"),
            st.just("start"),
            st.just(Phase.REQUIREMENTS),
            st.sampled_from([0, 1, 2, 2, 3, 3, 4, 5, 6, 7]),
        ),
        _STEP,
    ),
    min_size=10,
    max_size=60,
)


def _drive(steps):
    """Yield (driver, before, new events) after every acknowledged batch."""

    driver = WorkflowDriver()
    for mode, action, phase, variant in steps:
        before = driver.projection
        if mode == "advance":
            mode = "command"
            action, phase = natural_step(driver, variant)
            variant = 2
        if mode == "command":
            result = driver.run(driver.command(action, phase, variant))
            if not result.ok:
                # A refused command produced no candidate and changed nothing.
                assert result.candidates == ()
                assert driver.projection == before
                continue
            new = driver.events[-1:]
        elif mode == "raw":
            new = driver.append(driver.raw(action, phase, variant))
        elif mode == "other":
            new = driver.append(other_event(driver.new_id("chat")))
        else:
            new = driver.append(foreign_domain_event(driver.new_id("foreign")))
        yield driver, before, new


def _assert_phase_order(projection) -> None:
    for index, phase in enumerate(PHASES):
        view = projection.phases[phase]
        earlier_open = all(
            projection.phases[earlier].door is DoorStatus.OPEN for earlier in PHASES[:index]
        )
        if view.status not in _IDLE:
            # Active or terminal only behind open predecessor Doors.
            assert earlier_open, (phase, view.status)
        if index > 0:
            previous = projection.phases[PHASES[index - 1]]
            if view.status is PhaseStatus.NOT_STARTED:
                assert previous.door is not DoorStatus.OPEN
            else:
                assert previous.door is DoorStatus.OPEN
        # A Door is open exactly when its phase's proposal was approved.
        assert (view.door is DoorStatus.OPEN) == (view.status is PhaseStatus.APPROVED)
        if view.door is DoorStatus.OPEN:
            assert view.proposal is not None and view.proposal.status == "approved"


@settings(max_examples=200)
@given(steps=st.one_of(_STEPS, _PROGRESS))
def test_phase_order_and_explicit_advancement_always_hold(steps):
    for driver, before, new in _drive(steps):
        after = driver.projection
        _assert_phase_order(after)
        (event,) = new
        record = read_domain_record(event)
        kind = getattr(record, "kind", None)
        for phase in PHASES:
            was, now = before.phases[phase], after.phases[phase]
            if now.status is PhaseStatus.WORKING and was.status is not PhaseStatus.WORKING:
                # Working is entered only by an explicit start record for
                # this phase (or by superseding its own pending proposal).
                assert kind in ("phase_started", "revision_started", "door_superseded")
                assert record.data["phase"] == phase.value
                assert was.status in (
                    PhaseStatus.STARTING, PhaseStatus.REVISION_REQUIRED, PhaseStatus.WAITING,
                )
            if now.status is PhaseStatus.STARTING and was.status is not PhaseStatus.STARTING:
                assert kind == "phase_start_reserved"
        if kind == "door_approved" and after.phases != before.phases:
            approved = Phase(record.data["phase"])
            index = PHASES.index(approved)
            for position, phase in enumerate(PHASES):
                if phase is approved:
                    assert after.phases[phase].door is DoorStatus.OPEN
                elif position == index + 1:
                    # Only the immediate successor becomes ready, never working.
                    assert before.phases[phase].status is PhaseStatus.NOT_STARTED
                    assert after.phases[phase].status is PhaseStatus.READY
                else:
                    assert after.phases[phase] == before.phases[phase]
        if kind == "door_rejected" and after.phases != before.phases:
            rejected = Phase(record.data["phase"])
            assert after.phases[rejected].status is PhaseStatus.REVISION_REQUIRED
            for later in PHASES[PHASES.index(rejected) + 1 :]:
                assert after.phases[later].status is PhaseStatus.NOT_STARTED
                assert after.phases[later].door is DoorStatus.SEALED


@settings(max_examples=200)
@given(steps=st.one_of(_STEPS, _PROGRESS), seed=st.integers(min_value=0, max_value=2**16))
def test_workflow_folding_is_deterministic_over_canonical_sequence(steps, seed):
    driver = None
    for driver, before, new in _drive(steps):
        (event,) = new
        after = driver.projection
        # Projection_Version is the highest canonical Sequence observed.
        assert after.version == event.sequence == len(driver.events)
        record = read_domain_record(event)
        if record is None:
            # Another domain or event type changes no domain state.
            assert (after.phases, after.documents, after.diagnostics) == (
                before.phases, before.documents, before.diagnostics,
            )
        elif len(after.diagnostics) > len(before.diagnostics):
            # An invalid transition preserves the preceding valid projection.
            assert after.diagnostics[-1].sequence == event.sequence
            assert (after.phases, after.documents, after.pending_writes) == (
                before.phases, before.documents, before.pending_writes,
            )
    if driver is None:
        return

    events = list(driver.events)
    fresh = fold_workflow(events)
    assert fresh == fold_workflow(events) == driver.projection

    shuffled = list(events)
    random.Random(seed).shuffle(shuffled)
    assert fold_workflow(shuffled) == fresh

    cut = seed % (len(events) + 1)
    assert advance_workflow(advance_workflow(initial_workflow(), events[:cut]), events[cut:]) == fresh

    domain_only = [event for event in events if read_domain_record(event) is not None]
    reduced = fold_workflow(domain_only)
    assert reduced.phases == fresh.phases
    assert reduced.documents == fresh.documents
    assert [d.code for d in reduced.diagnostics] == [d.code for d in fresh.diagnostics]
