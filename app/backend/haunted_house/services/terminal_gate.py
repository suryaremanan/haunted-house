"""The validated terminal gate: the only path from an ended Crew turn to a
successful room outcome.

A canonical ``crew_turn_ended`` record is transport evidence.  This gate
turns it into a domain outcome only after it has:

1. checked that the record is acknowledged, Crew-origin, and in the run's
   own Event_Scope;
2. parsed the bounded final text as one Ghost_Result naming this run/task;
3. checked that the artifacts are the ones the run may produce;
4. read each artifact through the Spec 4 guarded-file interface;
5. checked the current Artifact_Revision and digests, upstream ones included;
6. run the phase validator (or the task evidence checks); and
7. handed the output to Spec 4 (Door proposal) or, for a Tinker task, to
   the serialized Task_Plan writer.

Only then is one house-origin ``run_completed`` candidate appended through
the Spec 2 writer.  Any failed check appends one redacted ``run_failed`` or
``run_blocked`` candidate instead and leaves the Door and the task checkbox
exactly as they were.

Settlement is idempotent by run: the terminal record of a run is looked up
in the canonical read before anything is judged, and it is appended with
compare-and-append, so a duplicate turn end, a retry, or a restart returns
the existing record.  The gate never accepts a raw Crew frame and maps no
Crew field; it stores nothing between calls.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Literal, Protocol

from haunted_house.core.artifact_validation import (
    extract_requirement_ids,
    ghost_result_findings,
    validate_phase_artifact,
)
from haunted_house.core.findings import Finding, bound_findings, finding
from haunted_house.core.ghost_result import ArtifactRef, GhostResult, GhostStatus
from haunted_house.core.ghost_run import GhostRunBinding
from haunted_house.core.guardrail_events import Phase, is_safe_code
from haunted_house.core.path_policy import join_parts, spec_document_parts
from haunted_house.core.seance_event import (
    AppEvent,
    AppEventCandidate,
    EventSource,
    JSONValue,
    validate_event,
)
from haunted_house.core.task_claims import TaskClaim, fold_claims
from haunted_house.core.task_plan import claim_covers
from haunted_house.core.workflow import DoorStatus
from haunted_house.adapters.guardrail_port import GuardrailRead
from haunted_house.services.canonical_port import CanonicalRunPort
from haunted_house.services.contracts import (
    CONTRACT_UNAVAILABLE,
    ContractStatus,
    check_prerequisites,
)

__all__ = [
    "MAX_FINAL_TEXT_CHARS",
    "TERMINAL_EVENT_TYPES",
    "ArtifactError",
    "ArtifactInspector",
    "ArtifactSnapshot",
    "ArtifactValidator",
    "ClaimReleaser",
    "OutputDecision",
    "PhaseOutputPort",
    "TaskCompletionPort",
    "TerminalGate",
    "TerminalOutcome",
    "ValidatedTerminalGate",
    "run_terminal",
    "terminal_candidate",
]

TERMINAL_EVENT_TYPES = ("run_completed", "run_failed", "run_blocked")
# Nothing longer is even parsed: a Ghost_Result is at most 64 KiB.
MAX_FINAL_TEXT_CHARS = 64 * 1024
_CAS_ATTEMPTS = 8
_MAX_FINDING_CODES = 20
_READY_REASON = {
    Phase.REQUIREMENTS: "Requirements ready for the Door",
    Phase.DESIGN: "Design ready for the Door",
    Phase.TASKS: "Task plan ready for the Door",
    Phase.IMPLEMENTATION: "Task complete",
}
_SPEC_PHASES = (Phase.REQUIREMENTS, Phase.DESIGN, Phase.TASKS)

TerminalStatus = Literal["completed", "failed", "blocked", "pending", "rejected"]


# --- ports --------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ArtifactSnapshot:
    """The current bytes of one artifact, read through the Spec 4 guard."""

    path: str
    sha256: str
    size_bytes: int
    content: bytes = field(repr=False, default=b"")


class ArtifactError(Exception):
    """An artifact could not be inspected; ``code`` is content-free."""

    def __init__(self, code: str) -> None:
        self.code = code if is_safe_code(code) else "artifact_unavailable"
        super().__init__(self.code)


class ArtifactInspector(Protocol):
    """Reads a run's artifact with that run's own Room_Policy."""

    async def inspect(self, binding: GhostRunBinding, path: str) -> ArtifactSnapshot: ...


@dataclass(frozen=True, slots=True)
class OutputDecision:
    ok: bool
    code: str
    proposal_id: str | None = None


class PhaseOutputPort(Protocol):
    """Spec 4 output submission: the Door_Proposal for a validated artifact."""

    async def submit(
        self, binding: GhostRunBinding, artifact: ArtifactSnapshot
    ) -> OutputDecision: ...


class TaskCompletionPort(Protocol):
    """The serialized Task_Plan writer (``TaskPlanWriter``)."""

    async def complete_task(
        self,
        scope: object,
        *,
        spec_name: str,
        task_id: str,
        claim_id: str,
        evidence: Sequence[ArtifactRef] = (),
    ) -> object: ...


class ClaimReleaser(Protocol):
    """Releases a claim after its run's terminal record (``TaskClaimService``)."""

    async def release(self, mansion_id: str, claim_id: str, terminal_record_id: str) -> object: ...


ArtifactValidator = Callable[[Phase, str, frozenset[str]], tuple[Finding, ...]]


class TerminalGate(Protocol):
    async def settle_turn(
        self, binding: GhostRunBinding, turn_ended: AppEvent, final_text: str
    ) -> "TerminalOutcome": ...


# --- outcome --------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class TerminalOutcome:
    """What settlement decided.

    ``completed``, ``failed`` and ``blocked`` carry the acknowledged terminal
    App_Event.  ``pending`` (the turn goes on, or a boundary could not answer
    yet: call again) and ``rejected`` (the call was not a valid settlement)
    append nothing.
    """

    status: TerminalStatus
    code: str
    event: AppEvent | None = None
    findings: tuple[Finding, ...] = ()
    duplicate: bool = False
    proposal_id: str | None = None
    artifacts: tuple[ArtifactRef, ...] = ()
    claim_released: bool = False

    @property
    def terminal(self) -> bool:
        return self.event is not None


# The boundary could not answer.  Nothing was decided, so nothing terminal is
# recorded: the run stays nonterminal and settlement can be called again.
_UNDECIDED = frozenset(
    {
        "writer_unavailable",
        "integrity_unavailable",
        "workflow_unavailable",
        "stale_version",
        "completion_unacknowledged",
    }
)


@dataclass(frozen=True, slots=True)
class _Verdict:
    event_type: Literal["run_completed", "run_failed", "run_blocked", "undecided"]
    code: str
    findings: tuple[Finding, ...] = ()
    artifacts: tuple[ArtifactRef, ...] = ()
    proposal_id: str | None = None


def _fail(code: str, findings: Sequence[Finding] = ()) -> _Verdict:
    if code in _UNDECIDED:
        return _Verdict("undecided", code)
    return _Verdict("run_failed", code, bound_findings(findings))


def run_terminal(read: GuardrailRead, binding: GhostRunBinding) -> AppEvent | None:
    """The run's acknowledged house-origin terminal record, if it has one."""

    scope = binding.scope
    return next(
        (
            event
            for event in read.events
            if event.event_type in TERMINAL_EVENT_TYPES
            and event.source.origin == "house"
            and event.scope == scope
        ),
        None,
    )


def terminal_candidate(
    binding: GhostRunBinding,
    event_type: Literal["run_completed", "run_failed", "run_blocked"],
    code: str,
    *,
    caused_by: Sequence[str] = (),
    findings: Sequence[Finding] = (),
    artifacts: Sequence[ArtifactRef] = (),
    proposal_id: str | None = None,
) -> AppEventCandidate:
    """One house-origin terminal candidate.  Content-free: codes, digests,
    Mansion-relative paths, and identifiers only."""

    safe = code if is_safe_code(code) else "run_failed"
    payload: dict[str, JSONValue] = {
        "reason": _READY_REASON[binding.phase] if event_type == "run_completed" else safe,
        "code": "ready" if event_type == "run_completed" else safe,
        "phase": binding.phase.value,
        "attempt": binding.attempt,
        "task_id": binding.task_id,
    }
    if event_type == "run_completed":
        payload["artifacts"] = [{"path": item.path, "sha256": item.sha256} for item in artifacts]
        payload["proposal_id"] = proposal_id
    else:
        payload["findings"] = [item.code for item in findings][:_MAX_FINDING_CODES]
    return AppEventCandidate(
        schema_version=1,
        event_type=event_type,
        scope=binding.scope,
        source=EventSource(
            origin="house",
            source_type="run_terminal",
            identity_parts=(binding.run_id,),
            revision=0,
            generation="",
            source_sequence=0,
        ),
        caused_by=tuple(caused_by),
        occurred_at_ms=None,
        payload=payload,
    )


def _status(event: AppEvent) -> TerminalStatus:
    return {"run_completed": "completed", "run_failed": "failed", "run_blocked": "blocked"}[
        event.event_type
    ]  # type: ignore[return-value]


def _payload_code(event: AppEvent) -> str:
    code = event.payload.get("code") if type(event.payload) is dict else None
    return code if type(code) is str else event.event_type


def _spec_document(binding: GhostRunBinding, phase: Phase) -> str:
    return join_parts(spec_document_parts(binding.spec_name, f"{phase.value}.md"))


class ValidatedTerminalGate:
    def __init__(
        self,
        port: CanonicalRunPort,
        *,
        artifacts: ArtifactInspector,
        outputs: PhaseOutputPort,
        tasks: TaskCompletionPort | None = None,
        claims: ClaimReleaser | None = None,
        validator: ArtifactValidator = validate_phase_artifact,
        contracts: Callable[[], ContractStatus] = check_prerequisites,
    ) -> None:
        self._port = port
        self._artifacts = artifacts
        self._outputs = outputs
        self._tasks = tasks
        self._claims = claims
        self._validator = validator
        self._contracts = contracts
        self._locks: dict[str, asyncio.Lock] = {}

    # --- public -----------------------------------------------------------------------

    async def settle_turn(
        self, binding: GhostRunBinding, turn_ended: AppEvent, final_text: str
    ) -> TerminalOutcome:
        """Settle one run from its acknowledged ``crew_turn_ended`` and final text."""

        refusal = self._usable(binding)
        if refusal is not None:
            return refusal
        if not isinstance(turn_ended, AppEvent):
            # A raw Crew envelope (or anything else) is never settled here: it
            # belongs to Spec 2 ingest, which acknowledges a canonical record.
            return TerminalOutcome("rejected", "raw_envelope_rejected")
        if (
            validate_event(turn_ended).error is not None
            or turn_ended.event_type != "crew_turn_ended"
            or turn_ended.source.origin != "crew"
        ):
            return TerminalOutcome("rejected", "not_a_turn_end")
        if turn_ended.scope != binding.scope:
            return TerminalOutcome("rejected", "scope_mismatch")

        async with self._lock(binding.mansion_id):
            read = await self._port.read(binding.mansion_id)
            if not read.writable:
                return TerminalOutcome("rejected", "integrity_unavailable")
            existing = run_terminal(read, binding)
            if existing is not None:
                return await self._finish(binding, existing, duplicate=True)
            acknowledged = next(
                (
                    event
                    for event in read.events
                    if event.event_id == turn_ended.event_id
                    and event.event_type == "crew_turn_ended"
                    and event.source.origin == "crew"
                    and event.scope == binding.scope
                ),
                None,
            )
            if acknowledged is None:
                return TerminalOutcome("rejected", "turn_not_acknowledged")
            if not self._registered(read, binding):
                return TerminalOutcome("rejected", "run_not_registered")
            payload = acknowledged.payload if type(acknowledged.payload) is dict else {}
            if payload.get("continuing") is True:
                # Crew is still working on this turn: nothing to judge yet.
                return TerminalOutcome("pending", "turn_continuing")

            verdict = await self._judge(binding, read, final_text)
            return await self._record(binding, verdict, caused_by=(acknowledged.event_id,))

    async def settle_failed(
        self, binding: GhostRunBinding, code: str, *, caused_by: Sequence[str] = ()
    ) -> TerminalOutcome:
        """Record ``run_failed`` for a run that ended without a usable turn
        (a Crew error, a closed turn, an exhausted budget).  Idempotent."""

        return await self._settle_without_result(binding, "run_failed", code, caused_by)

    async def settle_blocked(
        self, binding: GhostRunBinding, code: str, *, caused_by: Sequence[str] = ()
    ) -> TerminalOutcome:
        """Record ``run_blocked`` (``cancelled``, ``cancel_unconfirmed``,
        ``capacity_unavailable``, ...).  Idempotent.  The claim is released
        unless the reason retains it."""

        return await self._settle_without_result(binding, "run_blocked", code, caused_by)

    # --- internals --------------------------------------------------------------------

    def _lock(self, mansion_id: str) -> asyncio.Lock:
        return self._locks.setdefault(mansion_id, asyncio.Lock())

    def _usable(self, binding: object) -> TerminalOutcome | None:
        try:
            status = self._contracts()
        except Exception:  # noqa: BLE001 - an unreadable contract is unavailable
            status = ContractStatus(False, ("contracts",))
        if not status.ok:
            return TerminalOutcome("rejected", CONTRACT_UNAVAILABLE)
        if not isinstance(binding, GhostRunBinding) or not isinstance(binding.phase, Phase):
            return TerminalOutcome("rejected", "invalid_binding")
        if (binding.task_id is None) != (binding.claim_id is None):
            return TerminalOutcome("rejected", "invalid_binding")
        if binding.task_id is not None and binding.phase is not Phase.IMPLEMENTATION:
            return TerminalOutcome("rejected", "invalid_binding")
        return None

    @staticmethod
    def _registered(read: GuardrailRead, binding: GhostRunBinding) -> bool:
        scope = binding.scope
        return any(
            event.event_type == "run_started"
            and event.source.origin == "house"
            and event.scope == scope
            for event in read.events
        )

    async def _settle_without_result(
        self,
        binding: GhostRunBinding,
        event_type: Literal["run_failed", "run_blocked"],
        code: str,
        caused_by: Sequence[str],
    ) -> TerminalOutcome:
        refusal = self._usable(binding)
        if refusal is not None:
            return refusal
        if not is_safe_code(code):
            return TerminalOutcome("rejected", "invalid_code")
        async with self._lock(binding.mansion_id):
            read = await self._port.read(binding.mansion_id)
            if not read.writable:
                return TerminalOutcome("rejected", "integrity_unavailable")
            existing = run_terminal(read, binding)
            if existing is not None:
                return await self._finish(binding, existing, duplicate=True)
            if not self._registered(read, binding):
                return TerminalOutcome("rejected", "run_not_registered")
            return await self._record(binding, _Verdict(event_type, code), caused_by=caused_by)

    async def _record(
        self, binding: GhostRunBinding, verdict: _Verdict, *, caused_by: Sequence[str]
    ) -> TerminalOutcome:
        if verdict.event_type == "undecided":
            return TerminalOutcome("pending", verdict.code)
        candidate = terminal_candidate(
            binding,
            verdict.event_type,
            verdict.code,
            caused_by=caused_by,
            findings=verdict.findings,
            artifacts=verdict.artifacts,
            proposal_id=verdict.proposal_id,
        )
        for _ in range(_CAS_ATTEMPTS):
            read = await self._port.read(binding.mansion_id)
            existing = run_terminal(read, binding)
            if existing is not None:
                return await self._finish(binding, existing, duplicate=True)
            acknowledged = await self._port.compare_and_append(
                binding.mansion_id, read.projection.version, [candidate]
            )
            if acknowledged.status == "conflict":
                continue  # another record took the Sequence: look again
            if not acknowledged.ok:
                # Not recorded.  Whatever Spec 4 or the plan writer accepted is
                # idempotent, so the same settlement can be called again.
                return TerminalOutcome("pending", "writer_unavailable", findings=verdict.findings)
            return await self._finish(
                binding,
                acknowledged.events[0],
                duplicate=False,
                findings=verdict.findings,
                artifacts=verdict.artifacts,
                proposal_id=verdict.proposal_id,
            )
        return TerminalOutcome("pending", "stale_version", findings=verdict.findings)

    async def _finish(
        self,
        binding: GhostRunBinding,
        event: AppEvent,
        *,
        duplicate: bool,
        findings: tuple[Finding, ...] = (),
        artifacts: tuple[ArtifactRef, ...] = (),
        proposal_id: str | None = None,
    ) -> TerminalOutcome:
        """Release the run's claim after its acknowledged terminal record."""

        released = False
        if binding.claim_id is not None and self._claims is not None:
            # Idempotent, and refused by the releaser when the reason retains
            # the claim (an unconfirmed cancellation).
            result = await self._claims.release(
                binding.mansion_id, binding.claim_id, event.record_id
            )
            released = getattr(result, "ok", False) is True
        if type(event.payload) is dict and proposal_id is None:
            stored = event.payload.get("proposal_id")
            proposal_id = stored if type(stored) is str else None
        return TerminalOutcome(
            status=_status(event),
            code=_payload_code(event),
            event=event,
            findings=findings,
            duplicate=duplicate,
            proposal_id=proposal_id,
            artifacts=artifacts,
            claim_released=released,
        )

    # --- judgement --------------------------------------------------------------------

    async def _judge(
        self, binding: GhostRunBinding, read: GuardrailRead, final_text: object
    ) -> _Verdict:
        if type(final_text) is not str or len(final_text) > MAX_FINAL_TEXT_CHARS:
            return _fail(
                "ghost_result_invalid",
                [finding("ghost_result_too_large", "The final response is too large.", "ghost_result")],
            )
        result, problems = ghost_result_findings(final_text, binding.identity)
        if result is None:
            return _fail("ghost_result_invalid", problems)
        if result.status is GhostStatus.BLOCKED:
            return _Verdict("run_blocked", result.reason_code or "ghost_blocked")
        if result.status is GhostStatus.FAILED:
            return _Verdict("run_failed", result.reason_code or "ghost_failed")

        if binding.is_task_run:
            return await self._judge_task(binding, read, result)
        if binding.phase not in _SPEC_PHASES:
            # An implementation run without a task has nothing to validate.
            return _fail("task_claim_required")
        return await self._judge_phase(binding, read, result)

    async def _snapshot(
        self, binding: GhostRunBinding, reference: ArtifactRef
    ) -> ArtifactSnapshot | _Verdict:
        try:
            snapshot = await self._artifacts.inspect(binding, reference.path)
        except ArtifactError as error:
            return _fail(error.code)
        if snapshot.sha256 != reference.sha256:
            return _fail("artifact_hash_mismatch")
        return snapshot

    async def _upstream(
        self, binding: GhostRunBinding, read: GuardrailRead
    ) -> tuple[frozenset[str], _Verdict | None]:
        """Check the approved upstream artifacts; return the requirement ids."""

        requirement_ids: frozenset[str] = frozenset()
        tasks_path = _spec_document(binding, Phase.TASKS)
        earlier = (
            _SPEC_PHASES[: _SPEC_PHASES.index(binding.phase)]
            if binding.phase in _SPEC_PHASES
            else _SPEC_PHASES
        )
        for phase in earlier:
            path = _spec_document(binding, phase)
            view = read.projection.phases[phase]
            approved = view.proposal.artifact_revision if view.proposal is not None else None
            if view.door is not DoorStatus.OPEN or approved is None:
                return requirement_ids, _fail("upstream_not_approved")
            wanted = binding.upstream_hashes.get(path)
            if wanted is not None and wanted != approved.sha256:
                return requirement_ids, _fail("upstream_changed")
            if path == tasks_path and binding.is_task_run:
                # Checkboxes legitimately change the plan while Tinkers work.
                continue
            try:
                snapshot = await self._artifacts.inspect(binding, path)
            except ArtifactError as error:
                return requirement_ids, _fail(error.code)
            if snapshot.sha256 != approved.sha256:
                return requirement_ids, _fail("upstream_changed")
            if phase is Phase.REQUIREMENTS:
                try:
                    requirement_ids = extract_requirement_ids(snapshot.content.decode("utf-8"))
                except UnicodeDecodeError:
                    return requirement_ids, _fail("upstream_changed")
        unknown = set(binding.upstream_hashes) - {
            _spec_document(binding, phase) for phase in _SPEC_PHASES
        }
        if unknown:
            return requirement_ids, _fail("upstream_changed")
        return requirement_ids, None

    async def _judge_phase(
        self, binding: GhostRunBinding, read: GuardrailRead, result: GhostResult
    ) -> _Verdict:
        expected_path = _spec_document(binding, binding.phase)
        if result.task_id is not None:
            return _fail("ghost_result_invalid")
        if len(result.artifacts) != 1 or result.artifacts[0].path != expected_path:
            return _fail("artifact_not_permitted")
        snapshot = await self._snapshot(binding, result.artifacts[0])
        if isinstance(snapshot, _Verdict):
            return snapshot
        recorded = read.projection.documents.get(expected_path)
        if (
            recorded is None
            or recorded.sha256 != snapshot.sha256
            or recorded.size_bytes != snapshot.size_bytes
            or any(write.document_path == expected_path for write in read.projection.pending_writes.values())
        ):
            # Not the revision the house recorded when the Ghost wrote it.
            return _fail("stale_revision")
        requirement_ids, refusal = await self._upstream(binding, read)
        if refusal is not None:
            return refusal
        try:
            text = snapshot.content.decode("utf-8")
        except UnicodeDecodeError:
            return _fail("artifact_not_text")
        try:
            problems = bound_findings(self._validator(binding.phase, text, requirement_ids))
        except Exception:  # noqa: BLE001 - a validator fault is never a pass
            return _fail("validator_unavailable")
        if problems:
            return _fail("artifact_invalid", problems)
        try:
            decision = await self._outputs.submit(binding, snapshot)
        except Exception:  # noqa: BLE001 - no detail from the boundary travels on
            return _fail("output_submission_failed")
        if decision.ok is not True:
            return _fail(decision.code if is_safe_code(decision.code) else "output_rejected")
        return _Verdict(
            "run_completed", "ready", artifacts=result.artifacts, proposal_id=decision.proposal_id
        )

    async def _judge_task(
        self, binding: GhostRunBinding, read: GuardrailRead, result: GhostResult
    ) -> _Verdict:
        claim: TaskClaim | None = fold_claims(read.events).active_for_scope(binding.scope)
        if (
            claim is None
            or claim.claim_id != binding.claim_id
            or claim.task_id != binding.task_id
            or claim.attempt != binding.attempt
        ):
            return _fail("task_claim_required")
        if not result.artifacts:
            return _fail("evidence_missing")
        if any(not claim_covers(claim.paths, item.path) for item in result.artifacts):
            return _fail("artifact_outside_claim")
        for item in result.artifacts:
            snapshot = await self._snapshot(binding, item)
            if isinstance(snapshot, _Verdict):
                return snapshot
        _ids, refusal = await self._upstream(binding, read)
        if refusal is not None:
            return refusal
        if self._tasks is None:
            return _fail(CONTRACT_UNAVAILABLE)
        try:
            completion = await self._tasks.complete_task(
                binding.scope,
                spec_name=binding.spec_name,
                task_id=binding.task_id or "",
                claim_id=claim.claim_id,
                evidence=result.artifacts,
            )
        except Exception:  # noqa: BLE001
            return _fail("task_completion_failed")
        if getattr(completion, "ok", False) is not True:
            code = getattr(completion, "code", "task_completion_failed")
            return _fail(code if is_safe_code(code) else "task_completion_failed")
        return _Verdict("run_completed", "ready", artifacts=result.artifacts)
