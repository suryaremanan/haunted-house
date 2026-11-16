"""The wire form of the Room Ghosts read route (schema 1).

``GET /api/mansions/{mansion}/specs/{spec}/room-ghosts`` answers with what
Room Ghosts owns: the three room documents with their validation findings,
the task plan with claims and outcomes, the runs with their recovery state,
and the stretch review.  Ghost state stays with Spec 2 and phase, Door, and
approval state with Spec 4; the dashboard joins the three.

The dashboard parses this strictly (``app/ui/src/core/room-projection.ts``;
normative vectors in ``fixtures/room-ghosts/room-projection-vectors.json``)
and refuses a body that differs in any respect.  So this serializer emits
only values inside that contract: anything it cannot represent exactly is
left out (a document body that is too large, a task plan with an identifier
the contract has no form for) rather than sent malformed.

The body holds identifiers, enumerations, digests, clean relative paths,
counts, deterministic findings, and the room documents the Operator is
entitled to read.  It never holds a credential, capability, tool input, tool
output, transcript, or absolute path.

Pure: no filesystem, network, clock, or logging.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass

from haunted_house.core.findings import Finding
from haunted_house.core.guardrail_events import Phase
from haunted_house.core.review import RepairProposal, ReviewFinding
from haunted_house.core.room_runs import REQUEUE_CODES, RoomFacts, RunFact
from haunted_house.core.run_recovery import (
    CANCEL_UNCONFIRMED,
    CANCELLED,
    MAX_ATTEMPTS,
    RunView,
    cancel_refusal,
    retry_refusal,
)
from haunted_house.core.seance_event import EventScope, JSONValue
from haunted_house.core.task_plan import TaskPlan
from haunted_house.core.workflow import ArtifactRevision
from haunted_house.core.workshop_scheduler import BackpressureState, TaskOutcome

__all__ = [
    "DOCUMENT_PHASES",
    "MAX_CONTENT_CHARACTERS",
    "MAX_RUNS",
    "ROOM_GHOSTS_SCHEMA_VERSION",
    "DocumentView",
    "ReviewView",
    "RunOptions",
    "document_json",
    "review_json",
    "room_ghosts_to_json",
    "run_recovery_view",
    "runs_json",
    "task_plan_json",
]

ROOM_GHOSTS_SCHEMA_VERSION = 1
DOCUMENT_PHASES = (Phase.REQUIREMENTS, Phase.DESIGN, Phase.TASKS)
MAX_CONTENT_CHARACTERS = 512 * 1024
MAX_FINDINGS = 50
MAX_TASKS = 200
MAX_RUNS = 64
MAX_PATHS = 32
MAX_REQUIREMENT_REFS = 64
MAX_SUMMARY_CHARACTERS = 1000
MAX_TITLE_CHARACTERS = 200
MAX_PATH_CHARACTERS = 1024
MAX_ID_CHARACTERS = 160
MAX_REVIEW_FINDINGS = 50
MAX_REVIEW_CYCLES = 3
_MAX_DELAY_SECONDS = 15

_CONTROL = re.compile(r"[\u0000-\u001f\u007f-\u009f  ]")
_CONTROL_IN_PROSE = re.compile(r"[\u0000-\u0008\u000b-\u001f\u007f-\u009f  ]")
_IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,159}")
_CODE = re.compile(r"[a-z][a-z0-9_]{0,63}")
_DECIMAL_ID = re.compile(r"[1-9][0-9]{0,3}\.[1-9][0-9]{0,3}")
_SLOT_KEY = re.compile(r"[A-Za-z0-9-]{1,160}")
_SHA256 = re.compile(r"[0-9a-f]{64}")


def _line(value: object, limit: int = MAX_ID_CHARACTERS) -> str | None:
    """Bounded, non-empty, single-line text, or ``None``."""

    if type(value) is not str or not value or len(value) > limit or _CONTROL.search(value):
        return None
    return value


def _path(value: object) -> str | None:
    text = _line(value, MAX_PATH_CHARACTERS)
    if text is None or text.startswith(("/", "~")) or "\\" in text:
        return None
    if any(part in ("", ".", "..") for part in text.split("/")):
        return None
    return text


def _paths(values: Iterable[object]) -> list[JSONValue] | None:
    paths = [_path(item) for item in values]
    if len(paths) > MAX_PATHS or any(item is None for item in paths) or len(set(paths)) != len(paths):
        return None
    return list(paths)  # type: ignore[arg-type]


def _code(value: object) -> str | None:
    return value if type(value) is str and _CODE.fullmatch(value) else None


def _findings(findings: Iterable[Finding]) -> list[JSONValue]:
    shown: list[JSONValue] = []
    for item in findings:
        if len(shown) == MAX_FINDINGS:
            break
        code = _code(item.code)
        location = _line(_CONTROL.sub(" ", item.location)[:96].strip(), 96)
        message = _line(_CONTROL.sub(" ", item.message)[:200].strip(), 200)
        if code is None or location is None or message is None:
            continue
        shown.append({"code": code, "location": location, "message": message})
    return shown


# --- documents --------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class DocumentView:
    """One room document as the house currently holds it."""

    phase: Phase
    document_path: str
    # The revision Spec 4 recorded; ``None`` until the Ghost wrote the document.
    revision: ArtifactRevision | None = None
    # The deterministic validator accepted exactly this revision.
    validated: bool = False
    # The document text, or ``None`` when it is withheld.
    content: str | None = None
    findings: tuple[Finding, ...] = ()


def document_json(view: DocumentView) -> dict[str, JSONValue]:
    artifact: JSONValue = None
    revision = view.revision
    if (
        revision is not None
        and type(revision.revision) is int
        and revision.revision >= 1
        and _SHA256.fullmatch(revision.sha256)
        and type(revision.size_bytes) is int
        and revision.size_bytes >= 0
    ):
        content = view.content
        if type(content) is not str or len(content) > MAX_CONTENT_CHARACTERS:
            content = None
        artifact = {
            "artifact_revision": {
                "revision": revision.revision,
                "sha256": revision.sha256,
                "size_bytes": revision.size_bytes,
            },
            "validated": view.validated is True,
            "content": content,
            "findings": _findings(view.findings),
        }
    return {
        "phase": view.phase.value,
        "document_path": view.document_path,
        # A spec Ghost may write exactly its own document.
        "write_scope": [view.document_path],
        "artifact": artifact,
    }


# --- task plan ----------------------------------------------------------------------


def _outcome_json(outcome: TaskOutcome | None, complete: bool) -> JSONValue:
    if outcome is None:
        return None
    status = outcome.status
    # The checkbox is the record of completion: the two always agree.
    if complete and status != "complete":
        status = "complete"
    if status == "complete" and not complete:
        return None
    run_id = outcome.run_id
    return {
        "status": status,
        "attempt": min(max(outcome.attempt, 0), MAX_ATTEMPTS),
        "run_id": run_id if type(run_id) is str and _IDENTIFIER.fullmatch(run_id) else None,
        "reason_code": _code(outcome.reason_code) if status not in ("complete", "queued", "active") else None,
    }


def task_plan_json(
    plan: TaskPlan | None,
    *,
    selected: frozenset[str] = frozenset(),
    outcomes: Mapping[str, TaskOutcome] | None = None,
    backpressure: Mapping[str, BackpressureState] | None = None,
    findings: Sequence[Finding] = (),
) -> JSONValue:
    """The parsed plan, or ``None`` when there is none the contract can carry."""

    if plan is None or len(plan.leaves) > MAX_TASKS or len(plan.waves) > MAX_TASKS:
        return None
    outcomes = outcomes or {}
    backpressure = backpressure or {}
    ids = [leaf.task_id for leaf in plan.leaves]
    if len(set(ids)) != len(ids) or not all(_DECIMAL_ID.fullmatch(item) for item in ids):
        return None
    # A task belongs to the first wave that lists it; a wave lists only its own.
    wave_of: dict[str, int] = {}
    for index, wave in enumerate(plan.waves):
        for task_id in wave:
            if task_id in ids:
                wave_of.setdefault(task_id, index)
    waves: list[JSONValue] = [
        [task_id for task_id in dict.fromkeys(wave) if wave_of.get(task_id) == index]
        for index, wave in enumerate(plan.waves)
    ]
    tasks: list[JSONValue] = []
    active = 0
    for leaf in plan.leaves:
        title = _line(leaf.title, MAX_TITLE_CHARACTERS)
        writes = _paths(leaf.writes)
        requirements = list(leaf.requirements)
        if (
            title is None
            or writes is None
            or len(requirements) > MAX_REQUIREMENT_REFS
            or len(set(requirements)) != len(requirements)
            or not all(_DECIMAL_ID.fullmatch(item) for item in requirements)
        ):
            return None
        outcome = _outcome_json(outcomes.get(leaf.task_id), leaf.complete)
        if isinstance(outcome, dict) and outcome["status"] == "active":
            active += 1
        pressure = backpressure.get(leaf.task_id)
        tasks.append(
            {
                "task_id": leaf.task_id,
                "title": title,
                "optional": leaf.optional,
                "complete": leaf.complete,
                "requirements": requirements,  # type: ignore[dict-item]
                "writes": writes,
                "wave": wave_of.get(leaf.task_id),
                "selected": leaf.task_id in selected,
                "outcome": outcome,
                "backpressure": None
                if pressure is None or leaf.complete
                else {
                    "dispatch_failures": min(max(pressure.dispatch_failures, 0), 1_000_000),
                    "next_delay_seconds": min(max(pressure.next_delay_seconds, 0), _MAX_DELAY_SECONDS),
                    "last_reason": pressure.last_reason,
                },
            }
        )
    if active > MAX_ATTEMPTS:  # MAX_TINKERS is also three
        return None
    return {"tasks": tasks, "waves": waves, "findings": _findings(findings)}


# --- runs ------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class RunOptions:
    """What the route knows beyond the log when it shows the runs."""

    # RG-S3: cancellation is offered only once the stop contract is verified.
    cancellation_enabled: bool = False
    # RG-S4: an existing session is linked only once navigation is verified.
    session_links_enabled: bool = False
    # Phases whose runs may get a fresh attempt (working, Door not open).
    retryable_phases: frozenset[Phase] = frozenset()
    # Bounded Ghost_Result summaries the backend still holds, by run scope.
    summaries: Mapping[EventScope, str] | None = None


def run_recovery_view(fact: RunFact, facts: RoomFacts) -> RunView:
    """The cancellation and retry view of one run."""

    status = fact.status
    if status == "blocked" and fact.code == CANCELLED:
        status = "cancelled"  # type: ignore[assignment]
    elif status == "blocked" and fact.code == CANCEL_UNCONFIRMED:
        status = "cancel_unconfirmed"  # type: ignore[assignment]
    if fact.task_id is not None:
        latest = facts.latest_task_run(fact.task_id) is fact
    else:
        latest = facts.latest_phase_run(fact.phase) is fact
    return RunView(status, fact.attempt, fact.cancel_requested and fact.active, latest)  # type: ignore[arg-type]


def _run_json(
    fact: RunFact,
    facts: RoomFacts,
    outcomes: Mapping[str, TaskOutcome],
    options: RunOptions,
) -> dict[str, JSONValue] | None:
    scope = fact.scope
    task_id = fact.task_id
    if (task_id is not None) != (fact.phase is Phase.IMPLEMENTATION):
        return None  # a Tinker run without a claim has no task to show
    if task_id is not None and not _DECIMAL_ID.fullmatch(task_id):
        return None
    ghost, slot = _line(scope.ghost_id), _line(scope.session_slot)
    if not _IDENTIFIER.fullmatch(scope.run_id) or ghost is None or slot is None:
        return None
    view = run_recovery_view(fact, facts)
    can_cancel = cancel_refusal(view, enabled=options.cancellation_enabled) is None
    # A task refused for capacity is already back in the queue: nothing to retry.
    can_retry = retry_refusal(view) is None and not (
        task_id is not None and fact.code in REQUEUE_CODES
    )
    if can_retry and fact.phase not in options.retryable_phases:
        can_retry = False
    if can_retry and task_id is not None:
        outcome = outcomes.get(task_id)
        can_retry = outcome is not None and outcome.status in ("failed", "cancelled", "blocked")
    claim = fact.claim
    claim_paths = _paths(claim.paths) if claim is not None and claim.active else []
    summary = (options.summaries or {}).get(scope)
    if (
        type(summary) is not str
        or not summary.strip()
        or len(summary) > MAX_SUMMARY_CHARACTERS
        or _CONTROL_IN_PROSE.search(summary)
    ):
        summary = None
    link = scope.session_slot if options.session_links_enabled else None
    return {
        "run_id": scope.run_id,
        "run_sequence": min(max(scope.run_sequence, 0), 1_000_000),
        "ghost_id": ghost,
        "session_slot": slot,
        "phase": fact.phase.value,
        "task_id": task_id,
        "attempt": fact.attempt,
        "can_cancel": can_cancel and not can_retry,
        "cancel_requested": view.cancel_requested,
        "can_retry": can_retry,
        "session_link": link if link is not None and _SLOT_KEY.fullmatch(link) else None,
        "summary": summary,
        "reason_code": None if fact.status in ("active", "completed") else _code(fact.code),
        "claim_paths": claim_paths or [],
    }


def runs_json(
    facts: RoomFacts,
    outcomes: Mapping[str, TaskOutcome] | None = None,
    options: RunOptions | None = None,
) -> list[JSONValue]:
    """The newest runs, oldest first, each run identifier once."""

    shown: dict[str, dict[str, JSONValue]] = {}
    for fact in reversed(facts.runs):
        if len(shown) == MAX_RUNS:
            break
        if fact.run_id in shown:
            continue  # an older run under a reused identifier
        body = _run_json(fact, facts, outcomes or {}, options or RunOptions())
        if body is not None:
            shown[fact.run_id] = body
    return list(reversed(shown.values()))  # type: ignore[arg-type]


# --- stretch review ----------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ReviewView:
    cycle: int
    status: str  # reviewing | pass | changes_requested | blocked
    ghost_id: str = "medium"
    session_slot: str | None = None
    findings: tuple[ReviewFinding, ...] = ()
    repairs: tuple[RepairProposal, ...] = ()


def review_json(view: ReviewView | None, *, session_links_enabled: bool = False) -> JSONValue:
    if view is None or view.status not in ("reviewing", "pass", "changes_requested", "blocked"):
        return None
    if not 1 <= view.cycle <= MAX_REVIEW_CYCLES:
        return None
    findings: list[JSONValue] = []
    known: set[str] = set()
    if view.status != "pass":
        for item in view.findings[:MAX_REVIEW_FINDINGS]:
            paths = _paths(item.paths)
            summary = item.summary
            if (
                not _IDENTIFIER.fullmatch(item.finding_id)
                or item.finding_id in known
                or paths is None
                or not all(_DECIMAL_ID.fullmatch(ref) for ref in item.requirement_ids)
                or not summary.strip()
                or len(summary) > MAX_SUMMARY_CHARACTERS
                or _CONTROL_IN_PROSE.search(summary)
            ):
                continue
            known.add(item.finding_id)
            findings.append(
                {
                    "finding_id": item.finding_id,
                    "requirement_ids": list(dict.fromkeys(item.requirement_ids)),
                    "paths": paths,
                    "summary": summary,
                }
            )
    repairs: list[JSONValue] = []
    answered: set[str] = set()
    tasks: set[str] = set()
    if view.status != "pass":
        for repair in view.repairs[:MAX_REVIEW_FINDINGS]:
            title = _line(repair.title, MAX_TITLE_CHARACTERS)
            writes = _paths(repair.writes)
            if (
                repair.finding_id not in known
                or repair.finding_id in answered
                or repair.task_id in tasks
                or not _DECIMAL_ID.fullmatch(repair.task_id)
                or title is None
                or writes is None
            ):
                continue
            answered.add(repair.finding_id)
            tasks.add(repair.task_id)
            repairs.append(
                {
                    "task_id": repair.task_id,
                    "finding_id": repair.finding_id,
                    "title": title,
                    "writes": writes,
                    "status": repair.status,
                }
            )
    slot = view.session_slot if session_links_enabled else None
    return {
        "cycle": view.cycle,
        "status": view.status,
        "ghost_id": _line(view.ghost_id) or "medium",
        "session_link": slot if slot is not None and _SLOT_KEY.fullmatch(slot) else None,
        "findings": findings,
        "repairs": repairs,
    }


# --- the answer -----------------------------------------------------------------------------


def room_ghosts_to_json(
    *,
    mansion_id: str,
    spec_name: str,
    version: int,
    integrity: str,
    documents: Sequence[DocumentView],
    task_plan: JSONValue = None,
    runs: Sequence[JSONValue] = (),
    seance_enabled: bool = False,
    review: JSONValue = None,
) -> dict[str, JSONValue]:
    """Assemble the answer.  ``version`` is the canonical Sequence the caller
    folded: the same number as the workflow Projection_Version."""

    by_phase = {view.phase: view for view in documents}
    ordered = [
        document_json(
            by_phase.get(phase)
            or DocumentView(phase, f".kiro/specs/{spec_name}/{phase.value}.md")
        )
        for phase in DOCUMENT_PHASES
    ]
    return {
        "schema_version": ROOM_GHOSTS_SCHEMA_VERSION,
        "mansion_id": mansion_id,
        "spec_name": spec_name,
        "version": version,
        "integrity": integrity if integrity in ("valid", "corrupt", "uncertain") else "uncertain",
        "seance_enabled": seance_enabled is True,
        "documents": ordered,  # type: ignore[dict-item]
        "task_plan": task_plan,
        "runs": list(runs),
        # The stretch review exists only where the Séance Room is on.
        "review": review if seance_enabled is True else None,
    }
