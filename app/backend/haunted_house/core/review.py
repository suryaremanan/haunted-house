"""The bounded Séance Room review (stretch scope, Requirement 14).

The Medium's verdict rides in an ordinary Ghost_Result: ``ready`` is a pass,
``failed`` with reason ``changes_requested`` lists one to five findings in
its summary, and ``blocked`` means the review could not be done.  This
module parses that verdict strictly, turns each finding into one explicit
repair-task proposal, and steps the Review_Cycle:

- a review starts only where the Séance Room is enabled and the Workshop is
  complete;
- ``pass`` ends the review: no successor cycle;
- ``changes_requested`` below the third cycle proposes one repair per
  finding; only repairs the Operator approves are handed to the normal
  Workshop scheduler, and the next cycle starts when they are done;
- the third cycle that does not pass blocks the review.  There is no fourth.

Pure: no I/O, no clock.  Nothing here starts a session or writes a file.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, replace
from typing import Literal

from haunted_house.core.ghost_result import GhostResult, GhostStatus
from haunted_house.core.task_plan import (
    LeafTask,
    TaskPlan,
    claims_may_overlap,
    is_claim_path,
    is_requirement_id,
    requirement_sort_key,
)

__all__ = [
    "CHANGES_REQUESTED",
    "MAX_FINDINGS",
    "MAX_REVIEW_CYCLES",
    "DecideRepair",
    "RepairProposal",
    "RepairsFinished",
    "ReviewError",
    "ReviewEvent",
    "ReviewFinding",
    "ReviewState",
    "ReviewVerdict",
    "StartReview",
    "VerdictReceived",
    "advance_review",
    "approved_repair_tasks",
    "parse_review_verdict",
    "propose_repairs",
    "repair_waves",
]

MAX_REVIEW_CYCLES = 3
MAX_FINDINGS = 5
CHANGES_REQUESTED = "changes_requested"
_MAX_TITLE = 200

_FINDING = re.compile(
    r"F([1-5]) \[criteria ([1-9][0-9]{0,2}\.[1-9][0-9]{0,2}(?:, [1-9][0-9]{0,2}\.[1-9][0-9]{0,2})*)\] "
    r"\[([^\]\s]+)\] (\S.*)"
)

VerdictStatus = Literal["pass", "changes_requested", "blocked"]
ReviewStatus = Literal["idle", "reviewing", "pass", "changes_requested", "blocked"]
RepairStatus = Literal["proposed", "approved", "rejected"]


class ReviewError(ValueError):
    """A verdict that is not in the contract.  ``code`` is stable."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


@dataclass(frozen=True, slots=True)
class ReviewFinding:
    finding_id: str
    requirement_ids: tuple[str, ...]
    paths: tuple[str, ...]
    summary: str


@dataclass(frozen=True, slots=True)
class ReviewVerdict:
    status: VerdictStatus
    cycle: int
    findings: tuple[ReviewFinding, ...] = ()


@dataclass(frozen=True, slots=True)
class RepairProposal:
    task_id: str
    finding_id: str
    title: str
    writes: tuple[str, ...]
    requirements: tuple[str, ...]
    status: RepairStatus = "proposed"


def parse_review_verdict(
    result: GhostResult,
    cycle: int,
    requirement_ids: frozenset[str],
    changed_paths: frozenset[str],
) -> ReviewVerdict:
    """The verdict of one Medium run, or :class:`ReviewError`.

    ``requirement_ids`` and ``changed_paths`` are what the assignment listed:
    a finding that cites anything else is refused, never repaired.
    """

    if type(cycle) is not int or not 1 <= cycle <= MAX_REVIEW_CYCLES:
        raise ReviewError("invalid_cycle")
    if not isinstance(result, GhostResult) or result.task_id is not None or result.artifacts:
        # A review produces no file and belongs to no task.
        raise ReviewError("verdict_invalid")
    if result.status is GhostStatus.READY:
        return ReviewVerdict("pass", cycle)
    if result.status is GhostStatus.BLOCKED:
        return ReviewVerdict("blocked", cycle)
    if result.reason_code != CHANGES_REQUESTED:
        # A Medium that failed for another reason reviewed nothing.
        return ReviewVerdict("blocked", cycle)

    findings: list[ReviewFinding] = []
    for index, part in enumerate(result.summary.split("; "), start=1):
        match = _FINDING.fullmatch(part)
        if match is None or int(match.group(1)) != index:
            raise ReviewError("finding_malformed")
        ids = tuple(match.group(2).split(", "))
        path = match.group(3)
        if len(set(ids)) != len(ids) or not all(is_requirement_id(item) for item in ids):
            raise ReviewError("finding_malformed")
        if not requirement_ids.issuperset(ids):
            raise ReviewError("finding_unknown_requirement")
        if not is_claim_path(path) or path not in changed_paths:
            raise ReviewError("finding_unknown_path")
        findings.append(
            ReviewFinding(
                finding_id=f"f-{index}",
                requirement_ids=tuple(sorted(ids, key=requirement_sort_key)),
                paths=(path,),
                summary=match.group(4).strip(),
            )
        )
    if not 1 <= len(findings) <= MAX_FINDINGS:
        raise ReviewError("finding_count")
    return ReviewVerdict("changes_requested", cycle, tuple(findings))


def _next_group(plan: TaskPlan, taken: frozenset[str]) -> int:
    groups = [int(task_id.split(".")[0]) for task_id in (*[leaf.task_id for leaf in plan.leaves], *taken)]
    return max(groups, default=0) + 1


def propose_repairs(
    verdict: ReviewVerdict, plan: TaskPlan, taken: frozenset[str] = frozenset()
) -> tuple[RepairProposal, ...]:
    """Exactly one repair-task proposal per finding, in finding order.

    The proposals take a new task group after every existing one (and after
    ``taken``, the ids of earlier cycles), so no identifier is reused.
    """

    if verdict.status != "changes_requested":
        return ()
    group = _next_group(plan, taken)
    proposals: list[RepairProposal] = []
    for index, item in enumerate(verdict.findings, start=1):
        title = f"Repair {item.finding_id} of review cycle {verdict.cycle}: {item.summary}"
        proposals.append(
            RepairProposal(
                task_id=f"{group}.{index}",
                finding_id=item.finding_id,
                title=title[:_MAX_TITLE].rstrip(),
                writes=item.paths,
                requirements=item.requirement_ids,
            )
        )
    return tuple(proposals)


def repair_waves(repairs: tuple[RepairProposal, ...]) -> tuple[tuple[str, ...], ...]:
    """Waves of the approved repairs: no two claims that may overlap share one."""

    waves: list[list[RepairProposal]] = []
    for repair in repairs:
        if repair.status != "approved":
            continue
        for wave in waves:
            if not any(claims_may_overlap(repair.writes, other.writes) for other in wave):
                wave.append(repair)
                break
        else:
            waves.append([repair])
    return tuple(tuple(item.task_id for item in wave) for wave in waves)


def approved_repair_tasks(
    repairs: tuple[RepairProposal, ...], first_document_index: int
) -> tuple[LeafTask, ...]:
    """The incomplete leaf tasks of the approved repairs, for the scheduler."""

    return tuple(
        LeafTask(
            task_id=repair.task_id,
            title=repair.title,
            optional=False,
            complete=False,
            requirements=repair.requirements,
            writes=repair.writes,
            document_index=first_document_index + offset,
        )
        for offset, repair in enumerate(item for item in repairs if item.status == "approved")
    )


# --- the Review_Cycle ----------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ReviewState:
    """``cycle`` is the cycle running or last finished (0 before the first)."""

    cycle: int = 0
    status: ReviewStatus = "idle"
    findings: tuple[ReviewFinding, ...] = ()
    repairs: tuple[RepairProposal, ...] = ()
    # Reviews started over the whole history: never more than three.
    reviews_started: int = 0
    # Every repair task id ever proposed, so none is reused.
    proposed_ids: frozenset[str] = frozenset()

    @property
    def terminated(self) -> bool:
        return self.status in ("pass", "blocked")


@dataclass(frozen=True, slots=True)
class StartReview:
    """Start (or continue with) a review cycle."""

    enabled: bool
    workshop_complete: bool


@dataclass(frozen=True, slots=True)
class VerdictReceived:
    verdict: ReviewVerdict
    plan: TaskPlan


@dataclass(frozen=True, slots=True)
class DecideRepair:
    """The Operator's explicit decision on one proposal."""

    finding_id: str
    approve: bool


@dataclass(frozen=True, slots=True)
class RepairsFinished:
    """Every approved repair of the cycle reached a terminal outcome."""


ReviewEvent = StartReview | VerdictReceived | DecideRepair | RepairsFinished


def advance_review(state: ReviewState, event: ReviewEvent) -> tuple[ReviewState, str]:
    """Apply one event.  A refused event returns the state unchanged and a code."""

    if isinstance(event, StartReview):
        if not event.enabled:
            return state, "seance_disabled"
        if not event.workshop_complete:
            return state, "workshop_incomplete"
        if state.terminated:
            return state, "review_finished"
        if state.status == "reviewing":
            return state, "review_running"
        if state.status == "changes_requested":
            if any(item.status == "proposed" for item in state.repairs):
                return state, "repairs_undecided"
        if state.cycle >= MAX_REVIEW_CYCLES:
            return state, "review_limit"
        return (
            replace(
                state,
                cycle=state.cycle + 1,
                status="reviewing",
                findings=(),
                repairs=(),
                reviews_started=state.reviews_started + 1,
            ),
            "ok",
        )
    if isinstance(event, VerdictReceived):
        verdict = event.verdict
        if state.status != "reviewing" or verdict.cycle != state.cycle:
            return state, "verdict_unexpected"
        if verdict.status == "pass":
            return replace(state, status="pass", findings=(), repairs=()), "ok"
        if verdict.status == "blocked" or state.cycle >= MAX_REVIEW_CYCLES:
            # A blocked review, or the third cycle without a pass.
            return replace(state, status="blocked", findings=verdict.findings, repairs=()), "ok"
        repairs = propose_repairs(verdict, event.plan, state.proposed_ids)
        return (
            replace(
                state,
                status="changes_requested",
                findings=verdict.findings,
                repairs=repairs,
                proposed_ids=state.proposed_ids | {item.task_id for item in repairs},
            ),
            "ok",
        )
    if isinstance(event, DecideRepair):
        if state.status != "changes_requested":
            return state, "no_open_repairs"
        target = next((item for item in state.repairs if item.finding_id == event.finding_id), None)
        if target is None:
            return state, "repair_missing"
        if target.status != "proposed":
            return state, "already_decided"
        decided = replace(target, status="approved" if event.approve else "rejected")
        return (
            replace(
                state,
                repairs=tuple(decided if item is target else item for item in state.repairs),
            ),
            "ok",
        )
    if isinstance(event, RepairsFinished):
        if state.status != "changes_requested":
            return state, "no_open_repairs"
        if any(item.status == "proposed" for item in state.repairs):
            return state, "repairs_undecided"
        return state, "ok"
    return state, "unsupported_event"
