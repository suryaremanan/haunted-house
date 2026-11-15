"""Pure three-session Workshop cap for implementation Ghosts.

The schedule is a projection of explicit events: an assignment is queued,
admitted into a seat (``starting``), confirmed (``working``), and leaves its
seat by completing, failing, or being stopped.  A failed or stopped
assignment runs again only through an explicit retry, which queues it behind
everything already waiting.

At most ``MAX_WORKSHOP_SESSIONS`` assignments are ``starting`` or ``working``
at any time.  An event that would break that, or that does not fit the
assignment's state, changes nothing.  There is no other way to start a
session: no fallback path bypasses the queue.

Room Ghosts adds dependency scheduling on top of that cap (the second half
of this module): ``choose_dispatches`` picks, from an approved Task_Plan,
the Selected_Tasks of the lowest eligible wave whose Path_Claims are provably
disjoint from every active claim and from each other, never more than the
seats that are free.  ``record_refusal`` is the deterministic backpressure
transition for a dispatch that could not start.

Pure: no filesystem, network, clock, or logging.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, replace
from enum import StrEnum
from typing import Literal

from haunted_house.core.guardrail_events import is_identifier
from haunted_house.core.task_claims import TaskClaim
from haunted_house.core.task_plan import LeafTask, TaskPlan, claims_may_overlap

__all__ = [
    "BACKPRESSURE_DELAYS",
    "CREW_CAPACITY_CODES",
    "CREW_CAPACITY_NOTICE",
    "MAX_ATTEMPTS",
    "MAX_CREW_REFUSALS",
    "MAX_QUEUED_ASSIGNMENTS",
    "MAX_TINKERS",
    "MAX_WORKSHOP_SESSIONS",
    "Admit",
    "Assignment",
    "BackpressureState",
    "Complete",
    "Confirm",
    "Dispatch",
    "Enqueue",
    "Fail",
    "RefusalReason",
    "RefusalStep",
    "Retry",
    "SchedulerEvent",
    "SeatState",
    "Stop",
    "TaskOutcome",
    "TaskStatus",
    "WorkshopSchedule",
    "WorkshopState",
    "active_count",
    "admissible",
    "admit_ready",
    "apply_event",
    "backpressure_delay",
    "choose_dispatches",
    "classify_crew_refusal",
    "claims_may_overlap",
    "clear_backpressure",
    "eligible_wave",
    "empty_schedule",
    "fold_schedule",
    "free_seats",
    "record_refusal",
    "task_outcome",
]

MAX_WORKSHOP_SESSIONS = 3
MAX_QUEUED_ASSIGNMENTS = 64


class SeatState(StrEnum):
    QUEUED = "queued"
    STARTING = "starting"
    WORKING = "working"
    COMPLETED = "completed"
    FAILED = "failed"
    STOPPED = "stopped"


_ACTIVE = frozenset({SeatState.STARTING, SeatState.WORKING})


@dataclass(frozen=True, slots=True)
class Assignment:
    assignment_id: str
    state: SeatState
    # Position in the waiting line; a retry takes a new, later position.
    queue_position: int
    # The seat (1..MAX_WORKSHOP_SESSIONS) while starting or working.
    seat: int | None = None
    attempts: int = 0


@dataclass(frozen=True, slots=True)
class WorkshopSchedule:
    assignments: tuple[Assignment, ...] = ()
    next_position: int = 0

    def get(self, assignment_id: str) -> Assignment | None:
        return next(
            (item for item in self.assignments if item.assignment_id == assignment_id), None
        )


@dataclass(frozen=True, slots=True)
class Enqueue:
    assignment_id: str


@dataclass(frozen=True, slots=True)
class Admit:
    """Take a free seat and begin Crew setup (``queued`` -> ``starting``)."""

    assignment_id: str


@dataclass(frozen=True, slots=True)
class Confirm:
    """The session is bound (``starting`` -> ``working``)."""

    assignment_id: str


@dataclass(frozen=True, slots=True)
class Complete:
    assignment_id: str


@dataclass(frozen=True, slots=True)
class Fail:
    assignment_id: str


@dataclass(frozen=True, slots=True)
class Stop:
    assignment_id: str


@dataclass(frozen=True, slots=True)
class Retry:
    """Explicitly queue a failed or stopped assignment again."""

    assignment_id: str


SchedulerEvent = Enqueue | Admit | Confirm | Complete | Fail | Stop | Retry


def empty_schedule() -> WorkshopSchedule:
    return WorkshopSchedule()


def active_count(schedule: WorkshopSchedule) -> int:
    """Sessions holding a seat: starting and working both count."""

    return sum(1 for item in schedule.assignments if item.state in _ACTIVE)


def admissible(schedule: WorkshopSchedule) -> tuple[str, ...]:
    """Queued assignments that may take a seat now, first come first served."""

    free = MAX_WORKSHOP_SESSIONS - active_count(schedule)
    if free <= 0:
        return ()
    waiting = sorted(
        (item for item in schedule.assignments if item.state is SeatState.QUEUED),
        key=lambda item: item.queue_position,
    )
    return tuple(item.assignment_id for item in waiting[:free])


def _free_seat(schedule: WorkshopSchedule) -> int | None:
    taken = {item.seat for item in schedule.assignments if item.state in _ACTIVE}
    return next(
        (seat for seat in range(1, MAX_WORKSHOP_SESSIONS + 1) if seat not in taken), None
    )


def _replace(schedule: WorkshopSchedule, updated: Assignment, **changes: int) -> WorkshopSchedule:
    return replace(
        schedule,
        assignments=tuple(
            updated if item.assignment_id == updated.assignment_id else item
            for item in schedule.assignments
        ),
        **changes,
    )


def apply_event(schedule: WorkshopSchedule, event: SchedulerEvent) -> WorkshopSchedule:
    """Apply one event, or return ``schedule`` unchanged when it does not fit."""

    assignment_id = getattr(event, "assignment_id", None)
    if not is_identifier(assignment_id):
        return schedule
    current = schedule.get(assignment_id)

    if isinstance(event, Enqueue):
        waiting = sum(1 for item in schedule.assignments if item.state is SeatState.QUEUED)
        if current is not None or waiting >= MAX_QUEUED_ASSIGNMENTS:
            return schedule
        return replace(
            schedule,
            assignments=(
                *schedule.assignments,
                Assignment(assignment_id, SeatState.QUEUED, schedule.next_position),
            ),
            next_position=schedule.next_position + 1,
        )
    if current is None:
        return schedule

    if isinstance(event, Admit):
        # Only the head of the line may take a seat, and only a free one.
        if current.state is not SeatState.QUEUED or assignment_id not in admissible(schedule):
            return schedule
        seat = _free_seat(schedule)
        if seat is None:
            return schedule
        return _replace(
            schedule,
            replace(current, state=SeatState.STARTING, seat=seat, attempts=current.attempts + 1),
        )
    if isinstance(event, Confirm):
        if current.state is not SeatState.STARTING:
            return schedule
        return _replace(schedule, replace(current, state=SeatState.WORKING))
    if isinstance(event, Complete):
        if current.state is not SeatState.WORKING:
            return schedule
        return _replace(schedule, replace(current, state=SeatState.COMPLETED, seat=None))
    if isinstance(event, Fail):
        if current.state not in _ACTIVE:
            return schedule
        return _replace(schedule, replace(current, state=SeatState.FAILED, seat=None))
    if isinstance(event, Stop):
        if current.state not in (*_ACTIVE, SeatState.QUEUED):
            return schedule
        return _replace(schedule, replace(current, state=SeatState.STOPPED, seat=None))
    if isinstance(event, Retry):
        if current.state not in (SeatState.FAILED, SeatState.STOPPED):
            return schedule
        return _replace(
            schedule,
            replace(current, state=SeatState.QUEUED, queue_position=schedule.next_position),
            next_position=schedule.next_position + 1,
        )
    return schedule


def fold_schedule(events: Iterable[SchedulerEvent]) -> WorkshopSchedule:
    schedule = empty_schedule()
    for event in events:
        schedule = apply_event(schedule, event)
    return schedule


def admit_ready(schedule: WorkshopSchedule) -> tuple[WorkshopSchedule, tuple[Assignment, ...]]:
    """Admit every assignment a free seat allows; return those admitted."""

    admitted: list[Assignment] = []
    for assignment_id in admissible(schedule):
        schedule = apply_event(schedule, Admit(assignment_id))
        seated = schedule.get(assignment_id)
        if seated is not None and seated.state is SeatState.STARTING:
            admitted.append(seated)
    return schedule, tuple(admitted)


# --- Room Ghosts: dependency scheduling over task claims ---------------------------

MAX_TINKERS = MAX_WORKSHOP_SESSIONS
MAX_ATTEMPTS = 3

TaskStatus = Literal[
    "queued", "active", "complete", "failed", "cancelled", "blocked", "skipped"
]
# A wave barrier is satisfied only by these.
_SETTLED: frozenset[str] = frozenset({"complete", "skipped"})


@dataclass(frozen=True, slots=True)
class TaskOutcome:
    """What is known about one task.  ``attempt`` counts started attempts."""

    status: TaskStatus
    attempt: int = 0
    run_id: str | None = None
    evidence: tuple[tuple[str, str], ...] = ()  # (path, sha256)
    reason_code: str | None = None


RefusalReason = Literal["crew_capacity", "local_capacity", "claim_busy"]


@dataclass(frozen=True, slots=True)
class BackpressureState:
    task_id: str
    # Every refusal since the last accepted dispatch or active completion.
    dispatch_failures: int
    next_delay_seconds: int
    last_reason: RefusalReason
    # Uninterrupted refusals that Crew itself gave (verified capacity signals).
    crew_refusals: int = 0


@dataclass(frozen=True, slots=True)
class WorkshopState:
    plan: TaskPlan
    selected: frozenset[str]
    outcomes: Mapping[str, TaskOutcome]
    active_claims: tuple[TaskClaim, ...] = ()
    backpressure: Mapping[str, BackpressureState] | None = None


@dataclass(frozen=True, slots=True)
class Dispatch:
    task_id: str
    paths: tuple[str, ...]


def free_seats(schedule: WorkshopSchedule) -> int:
    """Seats the Spec 4 session cap still has free."""

    return max(0, MAX_WORKSHOP_SESSIONS - active_count(schedule))


def task_outcome(state: WorkshopState, leaf: LeafTask) -> TaskOutcome:
    """The recorded outcome of ``leaf``, else what its checkbox says."""

    known = state.outcomes.get(leaf.task_id)
    if known is not None:
        return known
    return TaskOutcome("complete" if leaf.complete else "queued")


def eligible_wave(state: WorkshopState) -> int | None:
    """The lowest wave that still holds unsettled selected work.

    A wave is a barrier: nothing above it may start while one of its selected
    tasks is not complete or explicitly skipped, whatever the reason.
    """

    leaves = {leaf.task_id: leaf for leaf in state.plan.leaves}
    for index, wave in enumerate(state.plan.waves):
        for task_id in wave:
            leaf = leaves.get(task_id)
            if leaf is None or task_id not in state.selected:
                continue
            if task_outcome(state, leaf).status not in _SETTLED:
                return index
    return None


def choose_dispatches(state: WorkshopState, available: int) -> tuple[Dispatch, ...]:
    """Selected tasks that may start now, in document order.

    Only the lowest eligible wave is considered.  A task is chosen when it is
    queued with attempts left, holds no active claim, and its Path_Claim is
    provably disjoint from every active claim and every task chosen before
    it.  ``available`` is clamped to ``0..MAX_TINKERS`` and to the seats the
    active claims leave free.  Deterministic: equal inputs, equal output.
    """

    capacity = available if type(available) is int else 0
    capacity = min(max(capacity, 0), MAX_TINKERS, MAX_TINKERS - len(state.active_claims))
    wave_index = eligible_wave(state)
    if capacity <= 0 or wave_index is None:
        return ()
    wave = frozenset(state.plan.waves[wave_index])
    claimed_tasks = {claim.task_id for claim in state.active_claims}
    held = [claim.paths for claim in state.active_claims]
    chosen: list[Dispatch] = []
    for leaf in sorted(state.plan.leaves, key=lambda item: item.document_index):
        if len(chosen) >= capacity:
            break
        if leaf.task_id not in wave or leaf.task_id not in state.selected:
            continue
        outcome = task_outcome(state, leaf)
        if outcome.status != "queued" or outcome.attempt >= MAX_ATTEMPTS:
            continue
        if leaf.task_id in claimed_tasks:
            continue
        if any(claims_may_overlap(leaf.writes, paths) for paths in held):
            continue
        held.append(leaf.writes)
        chosen.append(Dispatch(leaf.task_id, leaf.writes))
    return tuple(chosen)


# --- Room Ghosts: deterministic backpressure ----------------------------------------

BACKPRESSURE_DELAYS: tuple[int, ...] = (1, 2, 4, 8, 15)
MAX_CREW_REFUSALS = 5
# RG-S5: the only retryable Crew signals.  An admission refusal is HTTP 429
# with one of these codes; an accepted turn that never ran leaves this notice.
CREW_CAPACITY_CODES = frozenset(
    {
        "principal_active_limit",
        "principal_queue_full",
        "crew_active_limit",
        "crew_queue_full",
        "session_create_rate",
    }
)
CREW_CAPACITY_NOTICE = "background_turn_abandoned"
MAX_RETRY_AFTER_SECONDS = 60


def classify_crew_refusal(
    status: object = None, code: object = None, notice: object = None
) -> RefusalReason | None:
    """``crew_capacity`` for a verified retryable Crew signal, else ``None``.

    Anything unknown (a Crew fault such as 503 or 507, a conflict, a missing
    slot, an unrecognized code) is not capacity: the caller blocks the task
    instead of retrying it.
    """

    if notice == CREW_CAPACITY_NOTICE:
        return "crew_capacity"
    if status == 429 and type(code) is str and code in CREW_CAPACITY_CODES:
        return "crew_capacity"
    return None


def backpressure_delay(dispatch_failures: int, retry_after_seconds: object = None) -> int:
    """Seconds to wait after the ``dispatch_failures``-th refusal: 1, 2, 4, 8, 15, 15...

    Never sooner than Crew's own ``Retry-After`` (bounded to one minute).
    """

    index = min(max(dispatch_failures, 1), len(BACKPRESSURE_DELAYS)) - 1
    delay = BACKPRESSURE_DELAYS[index]
    if type(retry_after_seconds) is int and retry_after_seconds > delay:
        delay = min(retry_after_seconds, MAX_RETRY_AFTER_SECONDS)
    return delay


@dataclass(frozen=True, slots=True)
class RefusalStep:
    """The task after one refused dispatch.

    ``backpressure`` is ``None`` once the task is blocked as
    ``capacity_unavailable``; the task then needs an explicit Retry.
    """

    outcome: TaskOutcome
    backpressure: BackpressureState | None
    capacity_unavailable: bool = False


def record_refusal(
    outcome: TaskOutcome,
    backpressure: BackpressureState | None,
    task_id: str,
    reason: RefusalReason,
    *,
    retry_after_seconds: int | None = None,
) -> RefusalStep:
    """One dispatch of ``task_id`` could not start.

    The task stays queued with the same attempt.  Only a Crew refusal counts
    toward ``MAX_CREW_REFUSALS``; the local cap and claim contention just
    wait.  The fifth uninterrupted Crew refusal blocks the task as
    ``capacity_unavailable`` and still does not count as an attempt.
    """

    previous = backpressure if backpressure is not None and backpressure.task_id == task_id else None
    failures = (previous.dispatch_failures if previous else 0) + 1
    crew = (previous.crew_refusals if previous else 0) + (1 if reason == "crew_capacity" else 0)
    if crew >= MAX_CREW_REFUSALS:
        return RefusalStep(
            replace(outcome, status="blocked", reason_code="capacity_unavailable"),
            None,
            capacity_unavailable=True,
        )
    return RefusalStep(
        replace(outcome, status="queued"),
        BackpressureState(
            task_id=task_id,
            dispatch_failures=failures,
            next_delay_seconds=backpressure_delay(failures, retry_after_seconds),
            last_reason=reason,
            crew_refusals=crew,
        ),
    )


def clear_backpressure(
    backpressure: Mapping[str, BackpressureState], task_id: str | None = None
) -> dict[str, BackpressureState]:
    """Reset after an accepted dispatch (``task_id``) or an active completion
    (``None``: capacity was released, so every waiting task starts over)."""

    if task_id is None:
        return {}
    return {key: value for key, value in backpressure.items() if key != task_id}
