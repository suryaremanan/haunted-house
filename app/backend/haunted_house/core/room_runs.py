"""Pure folds of what Room Ghosts knows about runs and Workshop tasks.

Nothing here is a store.  Every value is recomputed from the acknowledged
canonical records Spec 2 selected: house-origin ``run_started`` records (the
runs), Crew-origin turn and error facts (transport evidence), Room Ghosts
domain records (claims, completions, selections, revision and retry
commands), and Spec 4's phase-start reservations.

The domain terminal vocabulary belongs to the validated terminal gate, so
the caller passes ``classify``: it maps a record to ``(status, code)`` when
the record is a house-origin run terminal and to ``None`` otherwise.

Pure: no I/O, no clock.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from types import MappingProxyType
from typing import Literal, cast

from haunted_house.core.guardrail_events import (
    GuardrailEventKind,
    Phase,
    select_domain_records,
)
from haunted_house.core.room_ghost_events import (
    RoomGhostEventKind,
    RoomGhostRecord,
    select_room_ghost_records,
)
from haunted_house.core.run_recovery import CANCEL_UNCONFIRMED, MAX_ATTEMPTS
from haunted_house.core.seance_event import AppEvent, EventScope
from haunted_house.core.task_claims import ClaimLedger, TaskClaim, fold_claims
from haunted_house.core.task_plan import TaskPlan
from haunted_house.core.workshop_scheduler import TaskOutcome

__all__ = [
    "CANCEL_PROGRESS",
    "PHASE_BY_GHOST",
    "REQUEUE_CODES",
    "RoomFacts",
    "RunFact",
    "TerminalClassifier",
    "fold_room_facts",
    "is_tinker",
    "phase_of_ghost",
    "task_outcomes",
]

K = RoomGhostEventKind
CANCEL_PROGRESS = "cancel_requested"
# A run blocked with one of these never started work: its task goes back to
# the queue and the dispatch is not an attempt (RG-S5).
REQUEUE_CODES = frozenset({"crew_capacity"})
PHASE_BY_GHOST: Mapping[str, Phase] = MappingProxyType(
    {
        "archivist": Phase.REQUIREMENTS,
        "draughtsman": Phase.DESIGN,
        "foreman": Phase.TASKS,
    }
)

RunStatus = Literal["active", "completed", "failed", "blocked"]
TerminalClassifier = Callable[[AppEvent], "tuple[str, str] | None"]


def is_tinker(ghost_id: str) -> bool:
    return ghost_id == "tinker" or (
        ghost_id.startswith("tinker-") and ghost_id[7:].isdigit() and len(ghost_id) <= 16
    )


def phase_of_ghost(ghost_id: str) -> Phase | None:
    """The phase a Ghost works in, from its fixed name."""

    if ghost_id in PHASE_BY_GHOST:
        return PHASE_BY_GHOST[ghost_id]
    return Phase.IMPLEMENTATION if is_tinker(ghost_id) else None


@dataclass(frozen=True, slots=True)
class RunFact:
    """One registered run and what the log says happened to it."""

    scope: EventScope
    phase: Phase
    started: AppEvent
    status: RunStatus
    # The terminal record's code (``ready`` when completed), else ``None``.
    code: str | None
    terminal: AppEvent | None
    # The newest Crew turn end of the run that is not ``continuing``.
    turn_ended: AppEvent | None
    crew_error: AppEvent | None
    # Crew produced at least one record for the run: its turn really ran.
    crew_seen: bool
    # The house's acknowledged request to cancel the run, if there is one.
    cancel_request: AppEvent | None
    # The claim of a Tinker run (active or released), else ``None``.
    claim: TaskClaim | None
    attempt: int

    @property
    def run_id(self) -> str:
        return self.scope.run_id

    @property
    def task_id(self) -> str | None:
        return self.claim.task_id if self.claim is not None else None

    @property
    def active(self) -> bool:
        return self.status == "active"

    @property
    def cancel_requested(self) -> bool:
        return self.cancel_request is not None


@dataclass(frozen=True, slots=True)
class RoomFacts:
    runs: tuple[RunFact, ...]
    ledger: ClaimLedger
    # Task ids the Operator selected since the latest implementation start.
    selected: frozenset[str]
    # task id -> (sequence, attempt) of its newest explicit retry command
    task_retries: Mapping[str, tuple[int, int]]
    # run id -> the command records that named it
    commands: Mapping[str, RoomGhostRecord]
    records: tuple[RoomGhostRecord, ...]
    # phase -> Sequence of its latest start reservation (0 when never started)
    reserved_at: Mapping[Phase, int]

    def run(self, run_id: object) -> RunFact | None:
        """The one run named ``run_id``; ``None`` when unknown or ambiguous."""

        found = [item for item in self.runs if item.run_id == run_id]
        return found[0] if len(found) == 1 else None

    def run_of_scope(self, scope: EventScope) -> RunFact | None:
        return next((item for item in self.runs if item.scope == scope), None)

    def latest_phase_run(self, phase: Phase) -> RunFact | None:
        """The newest run of a spec phase since its latest start reservation."""

        runs = [
            item
            for item in self.runs
            if item.phase is phase and item.started.sequence > self.reserved_at.get(phase, 0)
        ]
        return runs[-1] if runs else None

    def latest_task_run(self, task_id: str) -> RunFact | None:
        runs = [item for item in self.runs if item.task_id == task_id]
        return runs[-1] if runs else None

    def command(self, command_id: object) -> RoomGhostRecord | None:
        return self.commands.get(command_id) if type(command_id) is str else None


def _latest_reservations(events: Iterable[AppEvent]) -> dict[Phase, int]:
    reserved: dict[Phase, int] = {}
    for record in select_domain_records(events).records:
        if record.kind is GuardrailEventKind.PHASE_START_RESERVED:
            phase = Phase(cast(str, record.data["phase"]))
            reserved[phase] = max(reserved.get(phase, 0), record.sequence)
    return reserved


def _mid(event: AppEvent) -> str | None:
    mid = event.payload.get("mid") if type(event.payload) is dict else None
    return mid if type(mid) is str else None


def _still_open(turn_ended: AppEvent, waiting_for_operator: bool) -> bool:
    """Whether a turn-end record leaves the run's turn open.

    Crew marks a turn it will continue by itself, and a turn that stopped to
    wait for input.  While a tool prompt of the run is unanswered, a turn that
    waits for input is waiting for the Operator, not finished.
    """

    payload = turn_ended.payload if type(turn_ended.payload) is dict else {}
    if payload.get("continuing") is True:
        return True
    return payload.get("needs_input") is True and waiting_for_operator


def fold_room_facts(events: Iterable[AppEvent], classify: TerminalClassifier) -> RoomFacts:
    """Fold acknowledged records into runs, claims, and Operator commands."""

    ordered = sorted(events, key=lambda event: (event.sequence, event.event_id))
    ledger = fold_claims(ordered)
    reserved_at = _latest_reservations(ordered)
    records = select_room_ghost_records(ordered).records

    claims_by_scope: dict[EventScope, TaskClaim] = {}
    for claim in sorted(ledger.claims.values(), key=lambda item: item.acquired_sequence):
        claims_by_scope[claim.scope] = claim

    by_scope: dict[EventScope, list[AppEvent]] = {}
    for event in ordered:
        by_scope.setdefault(event.scope, []).append(event)

    runs: list[RunFact] = []
    phase_runs: dict[Phase, list[int]] = {}
    for started in ordered:
        if started.event_type != "run_started" or started.source.origin != "house":
            continue
        scope = started.scope
        phase = phase_of_ghost(scope.ghost_id)
        if phase is None or any(item.scope == scope for item in runs):
            continue
        scoped = [event for event in by_scope[scope] if event.sequence >= started.sequence]
        terminal: AppEvent | None = None
        status: RunStatus = "active"
        code: str | None = None
        for event in scoped:
            outcome = classify(event)
            if outcome is not None:
                terminal, status, code = event, cast(RunStatus, outcome[0]), outcome[1]
                break
        crew = [event for event in scoped if event.source.origin == "crew"]
        asked = {_mid(event) for event in crew if event.event_type == "approval_requested"}
        answered = {_mid(event) for event in crew if event.event_type == "approval_decided"}
        waiting_for_operator = bool(asked - answered - {None})
        turn_ended = next(
            (
                event
                for event in reversed(crew)
                if event.event_type == "crew_turn_ended"
                and not _still_open(event, waiting_for_operator)
            ),
            None,
        )
        crew_error = next(
            (event for event in reversed(crew) if event.event_type == "crew_error_observed"), None
        )
        cancel_request = next(
            (
                event
                for event in scoped
                if event.event_type == "ghost_progressed"
                and event.source.origin == "house"
                and type(event.payload) is dict
                and event.payload.get("progress_kind") == CANCEL_PROGRESS
            ),
            None,
        )
        claim = claims_by_scope.get(scope)
        if claim is not None:
            attempt = claim.attempt
        else:
            # A phase run: every run since the phase's latest start counts.
            earlier = [
                sequence
                for sequence in phase_runs.get(phase, [])
                if sequence > reserved_at.get(phase, 0)
            ]
            attempt = 1 + len(earlier) if started.sequence > reserved_at.get(phase, 0) else 1
        phase_runs.setdefault(phase, []).append(started.sequence)
        runs.append(
            RunFact(
                scope=scope,
                phase=phase,
                started=started,
                status=status,
                code=code,
                terminal=terminal,
                turn_ended=turn_ended,
                crew_error=crew_error,
                crew_seen=bool(crew),
                cancel_request=cancel_request,
                claim=claim,
                attempt=min(max(attempt, 1), MAX_ATTEMPTS),
            )
        )

    selected: set[str] = set()
    retries: dict[str, tuple[int, int]] = {}
    commands: dict[str, RoomGhostRecord] = {}
    workshop_since = reserved_at.get(Phase.IMPLEMENTATION, 0)
    for record in records:
        if record.kind is K.WORKSHOP_SELECTED:
            commands.setdefault(record.entity_id, record)
            if record.sequence > workshop_since:
                selected.update(cast(list[str], record.data["task_ids"]))
        elif record.kind is K.REVISION_REQUESTED:
            commands.setdefault(record.entity_id, record)
        elif record.kind is K.RETRY_REQUESTED:
            commands.setdefault(record.entity_id, record)
            task_id = record.data["task_id"]
            if type(task_id) is str:
                retries[task_id] = (record.sequence, cast(int, record.data["attempt"]))
    return RoomFacts(
        runs=tuple(runs),
        ledger=ledger,
        selected=frozenset(selected),
        task_retries=MappingProxyType(retries),
        commands=MappingProxyType(commands),
        records=records,
        reserved_at=MappingProxyType(reserved_at),
    )


def task_outcomes(facts: RoomFacts, plan: TaskPlan) -> dict[str, TaskOutcome]:
    """What is known about each task that was selected or ever claimed.

    ``attempt`` counts attempts that really started.  A dispatch Crew refused
    for capacity is not one.  A task is ``complete`` only when its checkbox
    says so: the plan is the record of completion.
    """

    outcomes: dict[str, TaskOutcome] = {}
    by_task: dict[str, list[TaskClaim]] = {}
    for claim in sorted(facts.ledger.claims.values(), key=lambda item: item.acquired_sequence):
        by_task.setdefault(claim.task_id, []).append(claim)

    for leaf in plan.leaves:
        claims = by_task.get(leaf.task_id, [])
        latest = claims[-1] if claims else None
        if latest is None:
            if leaf.task_id in facts.selected and not leaf.complete:
                outcomes[leaf.task_id] = TaskOutcome("queued")
            elif leaf.task_id in facts.selected:
                outcomes[leaf.task_id] = TaskOutcome("complete")
            continue
        run = facts.run_of_scope(latest.scope)
        run_id = latest.run_id
        if leaf.complete:
            outcomes[leaf.task_id] = TaskOutcome("complete", latest.attempt, run_id)
            continue
        code = run.code if run is not None else None
        if latest.active:
            if run is None or run.active:
                outcomes[leaf.task_id] = TaskOutcome("active", latest.attempt, run_id)
            else:
                # The run ended and its claim is retained (an unconfirmed stop).
                outcomes[leaf.task_id] = TaskOutcome(
                    "blocked", latest.attempt, run_id, reason_code=code or CANCEL_UNCONFIRMED
                )
            continue
        released = latest.release_outcome
        if released == "not_started" or code in REQUEUE_CODES:
            outcomes[leaf.task_id] = TaskOutcome("queued", latest.attempt - 1, None)
            continue
        retry = facts.task_retries.get(leaf.task_id)
        if retry is not None and retry[0] > latest.acquired_sequence and retry[1] == latest.attempt + 1:
            # An explicit Retry put it back in the queue for a fresh attempt.
            outcomes[leaf.task_id] = TaskOutcome("queued", latest.attempt, None)
            continue
        if released == "cancelled":
            status: Literal["failed", "cancelled", "blocked", "queued"] = "cancelled"
        elif released == "blocked":
            status = "blocked"
        elif released == "failed":
            status = "failed"
        else:
            # Released as complete, yet the checkbox is not checked: run it again.
            status = "queued"
        outcomes[leaf.task_id] = TaskOutcome(
            status, latest.attempt, run_id if status != "queued" else None,
            reason_code=None if status == "queued" else code,
        )
    return outcomes
