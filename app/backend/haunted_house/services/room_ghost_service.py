"""RoomGhostService: role-run coordination over Spec 2 and Spec 4.

This service starts nothing by itself and stores no ghost, Door, or event
state.  It supplies what the Spec 4 ``WorkflowService`` needs to run a role
(the bounded prompt of a phase run, a terminal record for a run whose turn
could not be sent) and it reacts to acknowledged canonical records:

- ``settle`` hands every ended Crew turn of a registered run to the
  validated terminal gate together with the run's final text, which it reads
  from the owned session's bounded history.  A raw Crew frame never reaches
  it: the turn end is the canonical ``crew_turn_ended`` record Spec 2
  acknowledged, and each such record is settled at most once.
- ``feedback`` sends bounded revision feedback to the same session before
  the Door is approved; the Door is sealed again first.
- ``retry`` gives a failed or cancelled run one explicit fresh attempt.
- ``projection`` joins the canonical read with the room documents into the
  Room Ghosts read model.

Every state it acts on is a fold of the canonical read it just made
(``core.room_runs``).  The only things kept in memory are conveniences that
may be lost at any time: which turn-end records this process already
settled, and the bounded summary of a run's Ghost_Result for display.

A missing or incompatible prerequisite interface answers
``contract_unavailable`` and starts no Ghost.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, replace
from typing import cast

from haunted_house.adapters.crew_chat import CrewChat, CrewChatError, SessionTurn
from haunted_house.adapters.guardrail_port import GuardrailRead
from haunted_house.adapters.session_bindings import BindingError, RoomBinding, session_label
from haunted_house.adapters.workflow_service import (
    ROLE_BY_PHASE,
    WorkflowError,
    WorkflowMansion,
    WorkflowService,
)
from haunted_house.core.findings import Finding
from haunted_house.core.ghost_result import GhostResultError, parse_ghost_result
from haunted_house.core.ghost_run import GhostRunBinding
from haunted_house.core.guardrail_events import Phase, is_safe_code, operator_scope
from haunted_house.core.path_policy import is_valid_spec_name
from haunted_house.core.room_ghost_events import (
    RoomGhostEventKind,
    RoomGhostPayloadError,
    build_room_ghost_candidate,
)
from haunted_house.core.room_projection import (
    DOCUMENT_PHASES,
    RunOptions,
    ReviewView,
    review_json,
    room_ghosts_to_json,
    run_recovery_view,
    runs_json,
    task_plan_json,
)
from haunted_house.core.room_runs import (
    REQUEUE_CODES,
    RoomFacts,
    RunFact,
    fold_room_facts,
    task_outcomes,
)
from haunted_house.core.run_recovery import MAX_ATTEMPTS, next_attempt, retry_refusal
from haunted_house.core.seance_event import EventScope, JSONValue
from haunted_house.core.workflow import DoorStatus, PhaseStatus
from haunted_house.core.workshop_scheduler import (
    CREW_CAPACITY_NOTICE,
    BackpressureState,
    TaskOutcome,
    classify_crew_refusal,
)
from haunted_house.services.canonical_port import CanonicalRunPort
from haunted_house.services.contracts import (
    CONTRACT_UNAVAILABLE,
    ContractStatus,
    check_prerequisites,
)
from haunted_house.services.room_artifacts import BindingProvider, resolve_room_binding
from haunted_house.services.room_documents import RoomDocuments, RoomDocumentsState
from haunted_house.services.room_prompts import PromptRefused, RoomPromptBuilder, spec_document
from haunted_house.services.task_claims import TaskClaimService
from haunted_house.services.terminal_gate import (
    TerminalOutcome,
    ValidatedTerminalGate,
    terminal_outcome,
)

__all__ = [
    "CORRECTABLE_CODES",
    "START_UNCONFIRMED",
    "CommandOutcome",
    "RoomGhostError",
    "RoomGhostService",
    "WorkshopOverlay",
]

log = logging.getLogger(__name__)

K = RoomGhostEventKind
SPEC_PHASES = DOCUMENT_PHASES
# A validation failure the same Ghost can repair from deterministic findings.
CORRECTABLE_CODES = frozenset({"artifact_invalid", "ghost_result_invalid"})
START_UNCONFIRMED = "start_unconfirmed"
_MAX_SUMMARIES = 256
_MAX_CONSUMED = 4096


class RoomGhostError(Exception):
    """A refused Room Ghosts command, described by a stable code."""

    def __init__(self, code: str) -> None:
        self.code = code if is_safe_code(code) else "room_ghosts_unavailable"
        super().__init__(self.code)


@dataclass(frozen=True, slots=True)
class CommandOutcome:
    """An accepted command: asynchronous work may still follow."""

    version: int
    run_id: str | None = None
    duplicate: bool = False


@dataclass(frozen=True, slots=True)
class WorkshopOverlay:
    """What the Workshop service knows that no record announces."""

    backpressure: Mapping[str, BackpressureState]
    # task id -> reason of a task this process blocked without a run.
    blocked: Mapping[str, str]


def _no_overlay(_mansion_id: str) -> WorkshopOverlay:
    return WorkshopOverlay({}, {})


class RoomGhostService:
    def __init__(
        self,
        *,
        port: CanonicalRunPort,
        workflow: WorkflowService,
        crew: CrewChat,
        bindings: BindingProvider,
        gate: ValidatedTerminalGate,
        claims: TaskClaimService,
        prompts: RoomPromptBuilder,
        documents: RoomDocuments,
        mansions: Callable[[str], Awaitable[WorkflowMansion | None]],
        contracts: Callable[[], ContractStatus] = check_prerequisites,
        history: Callable[[str, list[str]], Awaitable[object]] | None = None,
        overlay: Callable[[str], WorkshopOverlay] = _no_overlay,
        cancellation_enabled: Callable[[], bool] = lambda: False,
        session_links_enabled: bool = False,
        seance_enabled: bool = False,
        auto_correct: bool = True,
        start_deadline_seconds: float = 180.0,
        result_grace_seconds: float = 60.0,
        clock: Callable[[], float] = time.monotonic,
        now_ms: Callable[[], int] = lambda: int(time.time() * 1000),
    ) -> None:
        self._port = port
        self._workflow = workflow
        self._crew = crew
        self._bindings = bindings
        self._gate = gate
        self._claims = claims
        self._prompts = prompts
        self._documents = documents
        self._mansions = mansions
        self._contracts = contracts
        self._history = history
        self._overlay = overlay
        self._cancellation_enabled = cancellation_enabled
        self._session_links_enabled = session_links_enabled
        self._seance_enabled = seance_enabled
        self._auto_correct = auto_correct
        self._start_deadline = float(start_deadline_seconds)
        self._result_grace = float(result_grace_seconds)
        self._clock = clock
        self._now_ms = now_ms
        self._locks: dict[str, asyncio.Lock] = {}
        # Turn-end Record_IDs this process already settled (applied at most once).
        self._consumed: dict[str, None] = {}
        self._waiting_since: dict[str, float] = {}
        self._summaries: dict[EventScope, str] = {}

    # --- shared reads ------------------------------------------------------------------

    def lock(self, mansion_id: str) -> asyncio.Lock:
        return self._locks.setdefault(mansion_id, asyncio.Lock())

    def require_contracts(self) -> None:
        try:
            status = self._contracts()
        except Exception:  # noqa: BLE001 - an unreadable contract is unavailable
            status = ContractStatus(False, ("contracts",))
        if not status.ok:
            raise RoomGhostError(CONTRACT_UNAVAILABLE)

    async def mansion(self, mansion_id: str, spec_name: str | None = None) -> WorkflowMansion:
        """The registered Mansion; its one spec must be ``spec_name`` when given."""

        try:
            found = await self._mansions(mansion_id)
        except Exception:  # noqa: BLE001 - the registry is unavailable
            raise RoomGhostError("room_ghosts_unavailable") from None
        if found is None or not is_valid_spec_name(found.spec_name):
            raise RoomGhostError("mansion_not_found")
        if spec_name is not None and found.spec_name != spec_name:
            raise RoomGhostError("spec_not_found")
        return found

    @staticmethod
    def facts(read: GuardrailRead) -> RoomFacts:
        return fold_room_facts(read.events, terminal_outcome)

    def room_binding(self, run: RunFact) -> RoomBinding | None:
        """The trusted session binding of ``run`` when it is still that run's."""

        store = self._bindings() if callable(self._bindings) else self._bindings
        if store is None:
            return None
        try:
            found = store.load(session_label(run.scope.session_slot))
        except Exception:  # noqa: BLE001 - an unreadable record is no identity
            return None
        return found if found is not None and found.scope == run.scope else None

    def session_binding(self, run: RunFact) -> RoomBinding | None:
        """The binding of the session ``run`` used, whichever of that
        session's runs it currently names (a revision turn Crew refused leaves
        the slot bound to the run before it)."""

        store = self._bindings() if callable(self._bindings) else self._bindings
        if store is None:
            return None
        try:
            found = store.load(session_label(run.scope.session_slot))
        except Exception:  # noqa: BLE001
            return None
        if (
            found is None
            or found.mansion != run.scope.mansion_id
            or found.ghost != run.scope.ghost_id
            or found.phase is not run.phase
        ):
            return None
        return found

    @staticmethod
    def run_binding(run: RunFact, room: RoomBinding | str, read: GuardrailRead) -> GhostRunBinding:
        """The GhostRunBinding of a registered run, from trusted facts only.

        ``room`` is the session's trusted binding, or just the Mansion's spec
        name for a run whose binding record is gone: its identity is then the
        scope the house itself registered in the log.
        """

        upstream: dict[str, str] = {}
        for phase in SPEC_PHASES:
            if phase is run.phase:
                break
            proposal = read.projection.phases[phase].proposal
            if proposal is not None and read.projection.phases[phase].door is DoorStatus.OPEN:
                upstream[proposal.document_path] = proposal.artifact_revision.sha256
        claim = run.claim
        scope = run.scope
        return GhostRunBinding(
            run_id=scope.run_id,
            run_sequence=scope.run_sequence,
            mansion_id=scope.mansion_id,
            spec_name=room if isinstance(room, str) else room.spec,
            phase=run.phase,
            ghost_name=scope.ghost_id,
            slot=scope.session_slot,
            attempt=run.attempt,
            task_id=claim.task_id if claim is not None else None,
            claim_id=claim.claim_id if claim is not None else None,
            upstream_hashes=upstream,
        )

    # --- seams the Spec 4 WorkflowService calls ---------------------------------------

    async def phase_turn(self, binding: RoomBinding, mansion: WorkflowMansion) -> str:
        """``TurnPlanner``: the bounded role prompt of a spec-phase run."""

        try:
            self.require_contracts()
            read = await self._port.read(mansion.mansion_id)
            return await self._prompts.phase(read, binding)
        except (RoomGhostError, PromptRefused) as error:
            raise WorkflowError(error.code) from None

    async def launch_failed(self, binding: RoomBinding, code: str, error: BaseException) -> None:
        """``LaunchFailureHook``: a registered run whose turn was never sent.

        A verified Crew capacity refusal is not a failure of the run: its
        provisional claim is released and the run is blocked as
        ``crew_capacity``, so the task goes back to the queue without
        spending an attempt.  Anything else fails the run.
        """

        read = await self._port.read(binding.mansion)
        run = self.facts(read).run_of_scope(binding.scope)
        if run is None:
            return
        target = self.run_binding(run, binding, read)
        capacity = isinstance(error, CrewChatError) and classify_crew_refusal(
            error.status, error.gateway_code
        )
        if capacity:
            if target.claim_id is not None:
                await self._claims.release_provisional(binding.mansion, target.claim_id)
            await self._gate.settle_blocked(target, "crew_capacity")
        else:
            await self._gate.settle_failed(target, code)

    # --- settling ended turns ------------------------------------------------------------

    def _remember(self, record_id: str) -> None:
        self._consumed[record_id] = None
        self._waiting_since.pop(record_id, None)
        while len(self._consumed) > _MAX_CONSUMED:
            self._consumed.pop(next(iter(self._consumed)))

    def _keep_summary(self, scope: EventScope, final_text: str | None) -> None:
        if not final_text:
            return
        try:
            result = parse_ghost_result(final_text)
        except (GhostResultError, ValueError):
            return
        self._summaries[scope] = result.summary
        while len(self._summaries) > _MAX_SUMMARIES:
            self._summaries.pop(next(iter(self._summaries)))

    async def _read_turn(self, slot: str) -> SessionTurn | None:
        try:
            return await self._crew.read_turn(slot)
        except CrewChatError:
            return None

    async def settle(
        self, mansion_id: str, read: GuardrailRead | None = None
    ) -> list[TerminalOutcome]:
        """Settle every registered run whose Crew turn ended.  Idempotent.

        ``read`` is a canonical read the caller just made, to save another.
        """

        read = read if read is not None else await self._port.read(mansion_id)
        if not read.writable:
            return []
        outcomes: list[TerminalOutcome] = []
        for run in self.facts(read).runs:
            if not run.active:
                continue
            room = self.room_binding(run)
            outcome: TerminalOutcome | None = None
            if room is None:
                # No session of this backend carries the run any more (its
                # binding was withdrawn when its start failed).  Nothing can
                # end it, so past the start deadline the house does.
                outcome = await self._settle_orphan(run, read)
                if outcome is not None and outcome.terminal:
                    outcomes.append(outcome)
                continue
            binding = self.run_binding(run, room, read)
            if run.turn_ended is not None:
                outcome = await self._settle_turn(read, run, room, binding)
            elif run.crew_error is not None:
                # Crew reported an error and no turn end followed (12.4).
                outcome = await self._gate.settle_failed(
                    binding, "crew_error", caused_by=(run.crew_error.event_id,)
                )
            elif not run.crew_seen and not run.cancel_requested:
                outcome = await self._check_start(run, binding)
            if outcome is not None and outcome.terminal:
                outcomes.append(outcome)
        return outcomes

    async def _settle_turn(
        self, read: GuardrailRead, run: RunFact, room: RoomBinding, binding: GhostRunBinding
    ) -> TerminalOutcome | None:
        turn_ended = run.turn_ended
        assert turn_ended is not None
        key = turn_ended.record_id
        if key in self._consumed:
            return None
        turn = await self._read_turn(binding.slot)
        if turn is None:
            # The session's history cannot be read: nothing is decided yet.
            since = self._waiting_since.setdefault(key, self._clock())
            if self._clock() - since < self._result_grace:
                return None
            outcome = await self._gate.settle_failed(
                binding, "ghost_result_unavailable", caused_by=(turn_ended.event_id,)
            )
        elif turn.final_text is None and CREW_CAPACITY_NOTICE in turn.notices:
            outcome = await self._gate.settle_blocked(
                binding, "crew_capacity", caused_by=(turn_ended.event_id,)
            )
        else:
            outcome = await self._gate.settle_turn(binding, turn_ended, turn.final_text or "")
        if outcome.status == "pending" or outcome.code in (
            CONTRACT_UNAVAILABLE, "integrity_unavailable",
        ):
            return outcome  # call again: nothing was recorded
        self._remember(key)
        if outcome.terminal and turn is not None:
            self._keep_summary(binding.scope, turn.final_text)
        if (
            self._auto_correct
            and outcome.status == "failed"
            and not outcome.duplicate
            and outcome.code in CORRECTABLE_CODES
            and binding.phase in SPEC_PHASES
            and run.attempt < MAX_ATTEMPTS
        ):
            await self._send_correction(room, outcome.findings)
        return outcome

    async def _settle_orphan(self, run: RunFact, read: GuardrailRead) -> TerminalOutcome | None:
        if run.crew_seen or self._now_ms() - run.started.persisted_at_ms < self._start_deadline * 1000:
            return None
        try:
            mansion = await self.mansion(run.scope.mansion_id)
        except RoomGhostError:
            return None
        return await self._gate.settle_blocked(
            self.run_binding(run, mansion.spec_name, read), "session_lost"
        )

    async def _check_start(self, run: RunFact, binding: GhostRunBinding) -> TerminalOutcome | None:
        """A turn Crew accepted and never started (RG-S5).

        Crew answers 200 for a turn that then waits behind its unattended-turn
        cap and sends no refusal, so the house keeps its own deadline.  Past
        it the session's history decides: an abandoned-turn notice is
        capacity, any activity means the turn is running, and silence blocks
        the run so its claim is released.
        """

        age_ms = self._now_ms() - run.started.persisted_at_ms
        if age_ms < self._start_deadline * 1000:
            return None
        turn = await self._read_turn(binding.slot)
        if turn is None:
            return None
        if CREW_CAPACITY_NOTICE in turn.notices:
            return await self._gate.settle_blocked(binding, "crew_capacity")
        if turn.activity or turn.final_text is not None:
            # The turn runs; the canonical log is behind.  Ask Spec 2 to catch up.
            if self._history is not None:
                try:
                    await self._history(binding.mansion_id, [binding.slot])
                except Exception as error:  # noqa: BLE001 - recovery is best effort
                    log.warning("history reconciliation failed (%s)", type(error).__name__)
            return None
        return await self._gate.settle_blocked(binding, START_UNCONFIRMED)

    async def _send_correction(self, room: RoomBinding, findings: tuple[Finding, ...]) -> None:
        """Return deterministic findings to the same session (5.6, 6.6, 7.9)."""

        if not findings:
            return
        try:
            mansion = await self.mansion(room.mansion, room.spec)

            async def turn(binding: RoomBinding) -> str:
                read = await self._port.read(binding.mansion)
                return await self._prompts.revision(read, binding, feedback=None, findings=findings)

            await self._workflow.launch_session(
                mansion, room.phase, room.role, room.ghost, slot=room.slot, turn=turn
            )
        except (RoomGhostError, PromptRefused, WorkflowError, CrewChatError, BindingError) as error:
            # The run stays failed; the Operator can still send feedback or retry.
            log.info("no correction turn was sent (%s)", getattr(error, "code", "error"))

    # --- Operator commands ---------------------------------------------------------------

    async def _begin(
        self, mansion_id: str, spec_name: str | None, command_id: str, expected_version: int
    ) -> tuple[WorkflowMansion, GuardrailRead, RoomFacts]:
        self.require_contracts()
        mansion = await self.mansion(mansion_id, spec_name)
        read = await self._port.read(mansion_id)
        if not read.writable:
            raise RoomGhostError("integrity_unavailable")
        return mansion, read, self.facts(read)

    @staticmethod
    def _prior(
        facts: RoomFacts, read: GuardrailRead, command_id: str, kind: RoomGhostEventKind, **same: object
    ) -> bool:
        """Whether ``command_id`` already recorded exactly this command."""

        prior = facts.command(command_id)
        if prior is None:
            if command_id in read.projection.command_ids:
                raise RoomGhostError("command_conflict")
            return False
        if prior.kind is not kind or any(prior.data.get(key) != value for key, value in same.items()):
            raise RoomGhostError("command_conflict")
        return True

    @staticmethod
    def _require_started(facts: RoomFacts, command_id: str, phase: Phase) -> None:
        """A repeated command is accepted only if its run was really started.

        The command record is appended before the session is asked for, so a
        Crew failure leaves the record without a run.  Repeating that command
        must not read as success.
        """

        record = facts.command(command_id)
        if record is None:
            return
        after = [
            run for run in facts.runs
            if run.phase is phase and run.started.sequence > record.sequence
        ]
        # A run that ended with no sign of Crew is one whose turn was never sent.
        if not any(run.active or run.crew_seen for run in after[:1]):
            raise RoomGhostError("crew_failed")

    async def record_command(
        self, mansion_id: str, expected_version: int, kind: RoomGhostEventKind, data: dict[str, object]
    ) -> int:
        try:
            candidate = build_room_ghost_candidate(self._operator(mansion_id), kind, data)
        except RoomGhostPayloadError:
            raise RoomGhostError("invalid_request") from None
        acknowledged = await self._port.compare_and_append(mansion_id, expected_version, [candidate])
        if acknowledged.status == "conflict":
            raise RoomGhostError("stale_version")
        if not acknowledged.ok:
            raise RoomGhostError("writer_unavailable")
        return acknowledged.highest_sequence

    @staticmethod
    def _operator(mansion_id: str) -> EventScope:
        return operator_scope(mansion_id)

    async def feedback(
        self,
        mansion_id: str,
        spec_name: str,
        phase: Phase,
        text: str,
        *,
        command_id: str,
        expected_version: int,
    ) -> CommandOutcome:
        """Send bounded revision feedback to the phase's own session.

        Allowed only before the Door is approved and only while no run of the
        phase is active.  The Door is sealed again (a pending proposal is
        superseded) before the Ghost hears anything.
        """

        if phase not in SPEC_PHASES:
            raise RoomGhostError("invalid_request")
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        async with self.lock(mansion_id):
            mansion, read, facts = await self._begin(mansion_id, spec_name, command_id, expected_version)
            if self._prior(
                facts, read, command_id, K.REVISION_REQUESTED, phase=phase.value, feedback_sha256=digest
            ):
                self._require_started(facts, command_id, phase)
                return CommandOutcome(read.projection.version, duplicate=True)
            if expected_version != read.projection.version:
                raise RoomGhostError("stale_version")
            view = read.projection.phases[phase]
            if view.door is DoorStatus.OPEN or view.status not in (
                PhaseStatus.WORKING, PhaseStatus.WAITING, PhaseStatus.REVISION_REQUIRED,
            ):
                raise RoomGhostError("invalid_state")
            run = facts.latest_phase_run(phase)
            if run is None:
                raise RoomGhostError("invalid_state")
            if run.active:
                raise RoomGhostError("run_active")
            room = self.session_binding(run)
            if room is None:
                raise RoomGhostError("session_unavailable")
            if read.projection.documents.get(spec_document(spec_name, phase)) is None:
                # Nothing to revise yet: a fresh attempt is the way forward.
                raise RoomGhostError("document_missing")

            await self.record_command(
                mansion_id,
                expected_version,
                K.REVISION_REQUESTED,
                {
                    "command_id": command_id,
                    "phase": phase.value,
                    "run_id": run.run_id,
                    "feedback_sha256": digest,
                    "size_bytes": len(text.encode("utf-8")),
                },
            )
            try:
                await self._workflow.reopen_for_revision(
                    mansion_id, phase, command_id=command_id, session_slot=room.slot
                )
            except WorkflowError as error:
                raise RoomGhostError(error.code) from None

            findings: tuple[Finding, ...] = ()
            if run.code in CORRECTABLE_CODES:
                state = await self._documents.read(
                    await self._port.read(mansion_id), mansion_id, spec_name
                )
                findings = state.document(phase).findings

            async def turn(binding: RoomBinding) -> str:
                current = await self._port.read(mansion_id)
                return await self._prompts.revision(current, binding, feedback=text, findings=findings)

            started = await self._launch(
                lambda: self._workflow.launch_session(
                    mansion, phase, room.role, room.ghost, slot=room.slot, turn=turn
                )
            )
            after = await self._port.read(mansion_id)
            return CommandOutcome(after.projection.version, started.run_id)

    @staticmethod
    async def _launch(start: Callable[[], Awaitable[RoomBinding]]) -> RoomBinding:
        try:
            return await start()
        except CrewChatError as error:
            raise RoomGhostError(error.code) from None
        except BindingError:
            raise RoomGhostError("binding_failed") from None
        except (WorkflowError, PromptRefused) as error:
            raise RoomGhostError(error.code) from None

    async def retry(
        self,
        mansion_id: str,
        run_id: str,
        *,
        command_id: str,
        expected_version: int,
        plan_state: RoomDocumentsState | None = None,
    ) -> CommandOutcome:
        """One explicit fresh attempt for a failed, blocked, or cancelled run.

        A phase run gets a fresh session here.  A Tinker task only goes back
        to the queue: the Workshop scheduler dispatches it with a new claim,
        a fresh slot, and the next attempt number.
        """

        async with self.lock(mansion_id):
            mansion, read, facts = await self._begin(mansion_id, None, command_id, expected_version)
            run = facts.run(run_id)
            if run is None:
                raise RoomGhostError("run_not_found")
            if self._prior(facts, read, command_id, K.RETRY_REQUESTED, run_id=run_id):
                if run.task_id is None:
                    self._require_started(facts, command_id, run.phase)
                return CommandOutcome(read.projection.version, duplicate=True)
            if expected_version != read.projection.version:
                raise RoomGhostError("stale_version")
            view = run_recovery_view(run, facts)
            refusal = retry_refusal(view)
            if refusal is not None:
                raise RoomGhostError(refusal)
            if run.task_id is not None and run.code in REQUEUE_CODES:
                raise RoomGhostError("invalid_state")  # already back in the queue
            phase_view = read.projection.phases[run.phase]
            if phase_view.status is not PhaseStatus.WORKING or phase_view.door is DoorStatus.OPEN:
                raise RoomGhostError("invalid_state")
            attempt = next_attempt(view)
            if run.task_id is not None:
                state = plan_state or await self._documents.read(read, mansion_id, mansion.spec_name)
                outcome = (
                    task_outcomes(facts, state.plan).get(run.task_id) if state.plan is not None else None
                )
                if outcome is None or outcome.status not in ("failed", "cancelled", "blocked"):
                    raise RoomGhostError("invalid_state")
            version = await self.record_command(
                mansion_id,
                expected_version,
                K.RETRY_REQUESTED,
                {"command_id": command_id, "run_id": run_id, "task_id": run.task_id, "attempt": attempt},
            )
            if run.task_id is not None:
                return CommandOutcome(version)
            role = ROLE_BY_PHASE[run.phase]
            started = await self._launch(
                lambda: self._workflow.launch_session(
                    mansion, run.phase, role, run.scope.ghost_id,
                    turn=lambda binding: self.phase_turn(binding, mansion),
                )
            )
            after = await self._port.read(mansion_id)
            return CommandOutcome(after.projection.version, started.run_id)

    # --- the read model -----------------------------------------------------------------

    def outcomes(
        self, mansion_id: str, facts: RoomFacts, state: RoomDocumentsState
    ) -> dict[str, TaskOutcome]:
        """Folded task outcomes with what this process blocked laid over them."""

        if state.plan is None:
            return {}
        outcomes = task_outcomes(facts, state.plan)
        for task_id, reason in self._overlay(mansion_id).blocked.items():
            known = outcomes.get(task_id)
            if known is not None and known.status == "queued":
                outcomes[task_id] = replace(known, status="blocked", reason_code=reason)
        return outcomes

    async def projection(self, mansion_id: str, spec_name: str) -> dict[str, JSONValue]:
        """The Room Ghosts answer of one spec at the current canonical Sequence."""

        self.require_contracts()
        await self.mansion(mansion_id, spec_name)
        read = await self._port.read(mansion_id)
        facts = self.facts(read)
        state = await self._documents.read(read, mansion_id, spec_name)
        outcomes = self.outcomes(mansion_id, facts, state)
        overlay = self._overlay(mansion_id)
        retryable = frozenset(
            phase
            for phase in (*SPEC_PHASES, Phase.IMPLEMENTATION)
            if read.projection.phases[phase].status is PhaseStatus.WORKING
            and read.projection.phases[phase].door is not DoorStatus.OPEN
        )
        options = RunOptions(
            cancellation_enabled=self._cancellation_enabled() and read.writable,
            session_links_enabled=self._session_links_enabled,
            retryable_phases=retryable if read.writable else frozenset(),
            summaries=self._summaries,
        )
        return room_ghosts_to_json(
            mansion_id=mansion_id,
            spec_name=spec_name,
            version=read.projection.version,
            integrity=cast(str, read.projection.integrity),
            documents=state.documents,
            task_plan=task_plan_json(
                state.plan,
                selected=facts.selected,
                outcomes=outcomes,
                backpressure={
                    key: value
                    for key, value in overlay.backpressure.items()
                    if outcomes.get(key) is not None and outcomes[key].status == "queued"
                },
                findings=state.plan_findings,
            ),
            runs=runs_json(facts, outcomes, options),
            seance_enabled=self._seance_enabled,
            review=review_json(self.review(mansion_id)),
        )

    def review(self, mansion_id: str) -> ReviewView | None:
        """The stretch review.  Absent: the Séance Room is off (14.7)."""

        return None
