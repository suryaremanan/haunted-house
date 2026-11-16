"""Property 13 for the stretch Séance Room review (task 7.7).

Feature: room-ghosts, Property 13: The review loop terminates within three cycles

Validates: Requirements 14.3, 14.4, 14.5, 14.6.
"""

from __future__ import annotations

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from haunted_house.core.ghost_result import GhostResult, GhostStatus
from haunted_house.core.review import (
    MAX_REVIEW_CYCLES,
    DecideRepair,
    RepairsFinished,
    ReviewError,
    ReviewFinding,
    ReviewState,
    ReviewVerdict,
    StartReview,
    VerdictReceived,
    advance_review,
    approved_repair_tasks,
    parse_review_verdict,
    repair_waves,
)
from haunted_house.core.task_plan import LeafTask, TaskPlan, claims_may_overlap

pytestmark = pytest.mark.core

PLAN = TaskPlan(
    leaves=(
        LeafTask("1.1", "Implement the store", False, True, ("1.1",), ("src/store.py",), 0),
        LeafTask("2.1", "Implement the page", False, True, ("1.2",), ("src/page.py",), 1),
    ),
    waves=(),
)
PATHS = ("src/store.py", "src/page.py", "tests/test_store.py")
REQUIREMENTS = frozenset({"1.1", "1.2", "2.1"})


@st.composite
def findings(draw: st.DrawFn) -> tuple[ReviewFinding, ...]:
    count = draw(st.integers(min_value=1, max_value=5))
    return tuple(
        ReviewFinding(
            finding_id=f"f-{index}",
            requirement_ids=tuple(sorted(draw(st.sets(st.sampled_from(sorted(REQUIREMENTS)), min_size=1)))),
            paths=(draw(st.sampled_from(PATHS)),),
            summary=f"finding {index} is still present",
        )
        for index in range(1, count + 1)
    )


VERDICT = st.one_of(
    st.just(("pass", ())),
    st.just(("blocked", ())),
    findings().map(lambda items: ("changes_requested", items)),
)


@settings(max_examples=300)
@given(
    verdicts=st.lists(VERDICT, max_size=6),
    approvals=st.lists(st.booleans(), min_size=30, max_size=30),
)
def test_the_review_loop_terminates_within_three_cycles(verdicts, approvals) -> None:
    # Feature: room-ghosts, Property 13: The review loop terminates within three cycles
    state = ReviewState()
    decided = iter(approvals)
    proposed_before: set[str] = set()

    for status, items in verdicts:
        started, code = advance_review(state, StartReview(enabled=True, workshop_complete=True))
        if state.terminated:
            # A pass or a block has no successor cycle.
            assert code == "review_finished" and started == state
            break
        assert code == "ok"
        assert started.cycle == state.cycle + 1 <= MAX_REVIEW_CYCLES
        assert started.status == "reviewing"
        state = started

        verdict = ReviewVerdict(status, state.cycle, items)
        state, code = advance_review(state, VerdictReceived(verdict, PLAN))
        assert code == "ok"
        if status == "pass":
            assert state.status == "pass" and state.repairs == () and state.findings == ()
        elif status == "blocked" or verdict.cycle == MAX_REVIEW_CYCLES:
            # The third cycle without a pass blocks the review.
            assert state.status == "blocked" and state.repairs == ()
        else:
            assert state.status == "changes_requested"
            # Exactly one proposal per finding, each tracing to its finding.
            assert [repair.finding_id for repair in state.repairs] == [f.finding_id for f in items]
            for repair, finding in zip(state.repairs, items):
                assert repair.status == "proposed"
                assert repair.writes == finding.paths
                assert repair.requirements == finding.requirement_ids
            ids = {repair.task_id for repair in state.repairs}
            assert len(ids) == len(state.repairs)
            # No identifier of the plan or of an earlier cycle is reused.
            assert ids.isdisjoint({leaf.task_id for leaf in PLAN.leaves} | proposed_before)
            proposed_before |= ids
            # The next cycle cannot start while a proposal is undecided.
            assert advance_review(state, StartReview(True, True))[1] == "repairs_undecided"
            assert advance_review(state, RepairsFinished())[1] == "repairs_undecided"
            for finding in items:
                state, code = advance_review(state, DecideRepair(finding.finding_id, next(decided)))
                assert code == "ok"
            # Only approved repairs reach the scheduler, in waves that cannot conflict.
            approved = [repair for repair in state.repairs if repair.status == "approved"]
            tasks = approved_repair_tasks(state.repairs, first_document_index=len(PLAN.leaves))
            assert [task.task_id for task in tasks] == [repair.task_id for repair in approved]
            assert all(not task.complete for task in tasks)
            waves = repair_waves(state.repairs)
            assert sorted(task for wave in waves for task in wave) == sorted(t.task_id for t in tasks)
            by_id = {repair.task_id: repair for repair in approved}
            for wave in waves:
                for left in wave:
                    for right in wave:
                        if left != right:
                            assert not claims_may_overlap(by_id[left].writes, by_id[right].writes)
            assert advance_review(state, RepairsFinished())[1] == "ok"

        assert state.reviews_started <= MAX_REVIEW_CYCLES
        assert state.cycle <= MAX_REVIEW_CYCLES

    # However long the verdict sequence, there is never a fourth review.
    assert state.reviews_started <= MAX_REVIEW_CYCLES
    if state.cycle == MAX_REVIEW_CYCLES and state.status != "reviewing":
        assert state.terminated
        assert advance_review(state, StartReview(True, True)) == (state, "review_finished")


def test_a_review_needs_the_seance_room_and_a_finished_workshop() -> None:
    idle = ReviewState()
    assert advance_review(idle, StartReview(enabled=False, workshop_complete=True)) == (idle, "seance_disabled")
    assert advance_review(idle, StartReview(enabled=True, workshop_complete=False)) == (idle, "workshop_incomplete")
    running, code = advance_review(idle, StartReview(True, True))
    assert code == "ok" and advance_review(running, StartReview(True, True)) == (running, "review_running")
    stale = ReviewVerdict("pass", 2)
    assert advance_review(running, VerdictReceived(stale, PLAN)) == (running, "verdict_unexpected")


def _result(status: GhostStatus, summary: str, reason: str | None) -> GhostResult:
    return GhostResult(1, "review-1", status, summary, (), None, reason)


def test_verdict_parsing_is_strict() -> None:
    changed = frozenset(PATHS)
    passed = parse_review_verdict(_result(GhostStatus.READY, "All criteria met.", None), 1, REQUIREMENTS, changed)
    assert passed == ReviewVerdict("pass", 1)
    blocked = parse_review_verdict(
        _result(GhostStatus.BLOCKED, "Design changed.", "upstream_changed"), 2, REQUIREMENTS, changed
    )
    assert blocked.status == "blocked" and blocked.cycle == 2
    summary = (
        "F1 [criteria 1.2, 1.1] [src/store.py] empty address is stored; "
        "F2 [criteria 2.1] [tests/test_store.py] no test reaches the limit"
    )
    verdict = parse_review_verdict(
        _result(GhostStatus.FAILED, summary, "changes_requested"), 1, REQUIREMENTS, changed
    )
    assert verdict.status == "changes_requested"
    assert [item.finding_id for item in verdict.findings] == ["f-1", "f-2"]
    assert verdict.findings[0].requirement_ids == ("1.1", "1.2")
    assert verdict.findings[0].paths == ("src/store.py",)
    assert verdict.findings[1].summary == "no test reaches the limit"

    def refused(text: str) -> str:
        with pytest.raises(ReviewError) as caught:
            parse_review_verdict(_result(GhostStatus.FAILED, text, "changes_requested"), 1, REQUIREMENTS, changed)
        return caught.value.code

    assert refused("the store is wrong") == "finding_malformed"
    assert refused("F2 [criteria 1.1] [src/store.py] numbered out of order") == "finding_malformed"
    assert refused("F1 [criteria 9.9] [src/store.py] cites an unknown criterion") == "finding_unknown_requirement"
    assert refused("F1 [criteria 1.1] [src/other.py] cites a file not reviewed") == "finding_unknown_path"
    assert refused("F1 [criteria 1.1] [../escape.py] leaves the mansion") == "finding_unknown_path"
    with pytest.raises(ReviewError):
        parse_review_verdict(_result(GhostStatus.READY, "ok", None), 4, REQUIREMENTS, changed)
    # A Medium that failed for another reason reviewed nothing.
    other = parse_review_verdict(_result(GhostStatus.FAILED, "x", "tool_error"), 1, REQUIREMENTS, changed)
    assert other.status == "blocked"
