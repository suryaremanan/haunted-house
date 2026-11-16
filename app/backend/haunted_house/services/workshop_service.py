"""WorkshopService: Tinker dispatch over an approved Task_Plan.

The Workshop runs at most three Tinkers.  Each run has exactly one
Selected_Task, a durable Task_Claim acquired before its turn is sent, a
fresh app-owned session, and a one-task prompt.  What is dispatched is
decided by the pure scheduler from a fold of the canonical read: the lowest
unsettled wave, document order, provably disjoint claims.

    select tasks -> acquire claim (compare-and-append) -> fresh session ->
    one-task prompt -> validated terminal outcome (the gate checks the box
    and releases the claim) -> next dispatch

A wave is a barrier: a task whose predecessor failed, was cancelled, or is
blocked is not dispatched until the Operator retries it.

Crew capacity (RG-S5): a dispatch Crew refuses with a verified capacity
signal releases its provisional claim, stays queued with the same attempt,
and is tried again after 1, 2, 4, 8, 15 seconds (never sooner than Crew's
own ``Retry-After``).  Five uninterrupted refusals block the task as
``capacity_unavailable``.  Any other refusal blocks the task; nothing is
retried on a guess.  An accepted or queued turn is never sent again.

When every Selected_Task is complete the house itself submits the
implementation output to Spec 4; Tinkers are told not to.

The canonical log is the only durable state.  Backpressure counters and
tasks blocked before a run existed live in memory and are rebuilt empty
after a restart.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable, Sequence
from typing import cast

from haunted_house.adapters.crew_chat import CrewChatError
from haunted_house.adapters.guardrail_port import GuardrailRead
from haunted_house.adapters.session_bindings import BindingError, RoomBinding, session_label
from haunted_house.adapters.workflow_service import WorkflowError, WorkflowMansion, WorkflowService
from haunted_house.core.guardrail_events import (
    GuardrailEventKind,
    Phase,
    is_safe_code,
    operator_scope,
)
from haunted_house.core.room_ghost_events import (
    RoomGhostEventKind,
    RoomGhostPayloadError,
    build_room_ghost_candidate,
)
from haunted_house.core.room_runs import RoomFacts
from haunted_house.core.task_checkbox import fold_completions
from haunted_house.core.task_plan import TaskPlan
from haunted_house.core.workflow import DoorStatus, PhaseStatus
from haunted_house.core.workshop_scheduler import (
    MAX_TINKERS,
    BackpressureState,
    Dispatch,
    TaskOutcome,
    WorkshopState,
    choose_dispatches,
    classify_crew_refusal,
    clear_backpressure,
    record_refusal,
)
from haunted_house.services.canonical_port import CanonicalRunPort
from haunted_house.services.room_artifacts import BindingProvider
from haunted_house.services.room_documents import RoomDocuments, RoomDocumentsState
from haunted_house.services.room_ghost_service import (
    CommandOutcome,
    RoomGhostError,
    RoomGhostService,
    WorkshopOverlay,
)
from haunted_house.services.room_prompts import PromptRefused, RoomPromptBuilder
from haunted_house.services.task_claims import TaskClaimService

__all__ = ["CAPACITY_UNAVAILABLE", "WorkshopService"]

log = logging.getLogger(__name__)

K = RoomGhostEventKind
CAPACITY_UNAVAILABLE = "capacity_unavailable"
_START_STATES = (PhaseStatus.READY, PhaseStatus.FAILED, PhaseStatus.REVISION_REQUIRED)


class WorkshopService:
    def __init__(
        self,
        *,
        ghosts: RoomGhostService,
        port: CanonicalRunPort,
        workflow: WorkflowService,
        claims: TaskClaimService,
        prompts: RoomPromptBuilder,
        documents: RoomDocuments,
        bindings: BindingProvider,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._ghosts = ghosts
        self._port = port
        self._workflow = workflow
        self._claims = claims
        self._prompts = prompts
        self._documents = documents
        self._bindings = bindings
        self._clock = clock
        self._pressure: dict[str, dict[str, BackpressureState]] = {}
        self._not_before: dict[str, dict[str, float]] = {}
        self._blocked: dict[str, dict[str, str]] = {}
        # The selection of a start command, handed to ``starter`` (same task).
        self._pending: dict[str, tuple[str, tuple[str, ...]]] = {}
        # Projection_Version at which the house last tried to submit the output.
        self._submitted_at: dict[str, int] = {}

    # --- what no record announces -------------------------------------------------------

    def overlay(self, mansion_id: str) -> WorkshopOverlay:
        return WorkshopOverlay(
            dict(self._pressure.get(mansion_id, {})), dict(self._blocked.get(mansion_id, {}))
        )

    def next_due(self, mansion_id: str) -> float | None:
        """Seconds until the earliest backpressured dispatch may be tried."""

        waiting = self._not_before.get(mansion_id)
        if not waiting:
            return None
        return max(0.0, min(waiting.values()) - self._clock())

    # --- selection and start ------------------------------------------------------------

    @staticmethod
    def _selectable(state: RoomDocumentsState, task_ids: Sequence[str]) -> tuple[str, ...]:
        """The requested incomplete leaves, in document order, or a refusal."""

        if not state.plan_valid or state.plan is None:
            raise RoomGhostError("task_plan_invalid")
        leaves = {leaf.task_id: leaf for leaf in state.plan.leaves}
        wanted = list(dict.fromkeys(task_ids)) or [
            leaf.task_id for leaf in state.plan.leaves if not leaf.complete
        ]
        if not wanted or any(item not in leaves or leaves[item].complete for item in wanted):
            raise RoomGhostError("task_not_selectable")
        return tuple(leaf.task_id for leaf in state.plan.leaves if leaf.task_id in wanted)

    async def start(
        self,
        mansion_id: str,
        spec_name: str,
        task_ids: Sequence[str],
        *,
        command_id: str,
        expected_version: int,
    ) -> CommandOutcome:
        """Select validated tasks and start (or extend) the Workshop."""

        ghosts = self._ghosts
        async with ghosts.lock(mansion_id):
            ghosts.require_contracts()
            mansion = await ghosts.mansion(mansion_id, spec_name)
            read = await self._port.read(mansion_id)
            if not read.writable:
                raise RoomGhostError("integrity_unavailable")
            facts = ghosts.facts(read)
            prior = facts.command(command_id)
            if prior is not None:
                if prior.kind is not K.WORKSHOP_SELECTED:
                    raise RoomGhostError("command_conflict")
                # The same command again.  If its phase start failed, it failed.
                view = read.projection.phases[Phase.IMPLEMENTATION]
                reserved = next(
                    (
                        record
                        for record in read.domain.records
                        if record.kind is GuardrailEventKind.PHASE_START_RESERVED
                        and record.data.get("command_id") == command_id
                    ),
                    None,
                )
                if (
                    reserved is not None
                    and view.status is PhaseStatus.FAILED
                    and view.reservation_id == reserved.data["reservation_id"]
                ):
                    raise RoomGhostError(view.failure_code or "crew_failed")
                return CommandOutcome(read.projection.version, duplicate=True)
            if expected_version != read.projection.version:
                raise RoomGhostError("stale_version")
            projection = read.projection
            if projection.phases[Phase.TASKS].door is not DoorStatus.OPEN:
                raise RoomGhostError("predecessor_door_sealed")
            state = await self._documents.read(read, mansion_id, spec_name)
            selected = self._selectable(state, task_ids)
            status = projection.phases[Phase.IMPLEMENTATION].status
            for task_id in selected:
                # An explicit selection is the Operator's decision to try again.
                self._blocked.get(mansion_id, {}).pop(task_id, None)
                self._pressure.get(mansion_id, {}).pop(task_id, None)
                self._not_before.get(mansion_id, {}).pop(task_id, None)

            if status in _START_STATES:
                self._pending[mansion_id] = (command_id, selected)
                try:
                    await self._workflow.start_phase(
                        mansion_id,
                        Phase.IMPLEMENTATION,
                        command_id=command_id,
                        expected_version=expected_version,
                    )
                except WorkflowError as error:
                    raise RoomGhostError(error.code) from None
                finally:
                    self._pending.pop(mansion_id, None)
            elif status is PhaseStatus.WORKING:
                await ghosts.record_command(
                    mansion_id,
                    expected_version,
                    K.WORKSHOP_SELECTED,
                    {"command_id": command_id, "task_ids": list(selected)},
                )
                await self._dispatch(mansion)
            else:
                raise RoomGhostError("invalid_state")
            after = await self._port.read(mansion_id)
            return CommandOutcome(after.projection.version)

    async def starter(
        self, mansion: WorkflowMansion, reservation_id: str, assignments: Sequence[str]
    ) -> RoomBinding:
        """``ImplementationStarter``: called by Spec 4 once the phase start is
        reserved.  Records the selection, dispatches the first wave, and
        returns the first Tinker session for the phase's start record."""

        name = mansion.mansion_id
        try:
            self._ghosts.require_contracts()
            command_id, selected = self._pending.get(name, (reservation_id, ()))
            if not selected:
                # The Spec 4 start route: its assignments name the tasks, or all.
                read = await self._port.read(name)
                state = await self._documents.read(read, name, mansion.spec_name)
                selected = self._selectable(state, tuple(assignments))
            try:
                candidate = build_room_ghost_candidate(
                    operator_scope(name),
                    K.WORKSHOP_SELECTED,
                    {"command_id": command_id, "task_ids": list(selected)},
                )
            except RoomGhostPayloadError:
                raise RoomGhostError("invalid_request") from None
            acknowledged = await self._port.append(name, [candidate])
            if not acknowledged.ok:
                raise RoomGhostError("writer_unavailable")
        except RoomGhostError as error:
            raise WorkflowError(error.code) from None
        started, failure = await self._dispatch(mansion, starting=True)
        if not started:
            raise WorkflowError(failure or "workshop_not_started")
        return started[0]

    # --- dispatch -------------------------------------------------------------------------

    def _workshop_state(
        self, mansion_id: str, facts: RoomFacts, state: RoomDocumentsState
    ) -> WorkshopState | None:
        if state.plan is None or not state.plan_valid:
            return None
        return WorkshopState(
            plan=state.plan,
            selected=facts.selected,
            outcomes=self._ghosts.outcomes(mansion_id, facts, state),
            active_claims=facts.ledger.active,
            backpressure=self._pressure.get(mansion_id, {}),
        )

    async def advance(self, mansion_id: str) -> None:
        """Dispatch what may start now and submit the output when all is done."""

        async with self._ghosts.lock(mansion_id):
            try:
                mansion = await self._ghosts.mansion(mansion_id)
            except RoomGhostError:
                return
            read = await self._port.read(mansion_id)
            if not read.writable:
                return
            if read.projection.phases[Phase.IMPLEMENTATION].status is not PhaseStatus.WORKING:
                return
            await self._dispatch(mansion)
            await self._submit_when_done(mansion)

    async def _dispatch(
        self, mansion: WorkflowMansion, *, starting: bool = False
    ) -> tuple[list[RoomBinding], str | None]:
        """Start every Tinker the scheduler allows.  Returns the sessions
        started and, when none was, the code of the first refusal."""

        name = mansion.mansion_id
        read = await self._port.read(name)
        facts = self._ghosts.facts(read)
        state = await self._documents.read(read, name, mansion.spec_name)
        workshop = self._workshop_state(name, facts, state)
        if workshop is None:
            return [], "task_plan_invalid"
        chosen = choose_dispatches(workshop, MAX_TINKERS - len(workshop.active_claims))
        started: list[RoomBinding] = []
        failure: str | None = None
        now = self._clock()
        for dispatch in chosen:
            if self._not_before.get(name, {}).get(dispatch.task_id, 0.0) > now and not starting:
                continue  # still inside its backpressure delay
            outcome = workshop.outcomes.get(dispatch.task_id) or TaskOutcome("queued")
            binding, code = await self._launch(mansion, state, dispatch, outcome)
            if binding is not None:
                started.append(binding)
            elif failure is None:
                failure = code
        return started, failure

    def _seat(self, facts: RoomFacts) -> str:
        taken = {claim.scope.ghost_id for claim in facts.ledger.active}
        return next(
            (f"tinker-{seat}" for seat in range(1, MAX_TINKERS + 1) if f"tinker-{seat}" not in taken),
            "tinker-1",
        )

    @staticmethod
    def _run_id(facts: RoomFacts, task_id: str, attempt: int) -> str:
        """A run identifier no other run of the Mansion has."""

        base = f"task-{task_id.replace('.', '-')}-a{attempt}"
        used = {run.run_id for run in facts.runs}
        candidate, ordinal = base, 1
        while candidate in used:
            ordinal += 1
            candidate = f"{base}-d{ordinal}"
        return candidate

    async def _launch(
        self,
        mansion: WorkflowMansion,
        state: RoomDocumentsState,
        dispatch: Dispatch,
        outcome: TaskOutcome,
    ) -> tuple[RoomBinding | None, str | None]:
        """Claim, bind, and start one Tinker for ``dispatch``."""

        name, task_id = mansion.mansion_id, dispatch.task_id
        attempt = outcome.attempt + 1
        plan = cast(TaskPlan, state.plan)
        read = await self._port.read(name)
        facts = self._ghosts.facts(read)
        held: dict[str, object] = {}

        async def before_turn(binding: RoomBinding) -> None:
            # Durable before anything is registered or sent (design: claims
            # are acquired through the canonical boundary before session start).
            result = await self._claims.acquire(binding.scope, task_id, dispatch.paths, attempt)
            if not result.ok or result.claim is None:
                raise WorkflowError(result.code if is_safe_code(result.code) else "claim_busy")
            held["claim"] = result.claim

        async def turn(binding: RoomBinding) -> str:
            current = await self._port.read(name)
            return await self._prompts.tinker(
                current, binding, plan=plan, claim=held["claim"],  # type: ignore[arg-type]
                requirement_ids=state.requirement_ids,
            )

        try:
            binding = await self._workflow.launch_session(
                mansion,
                Phase.IMPLEMENTATION,
                "tinker",
                self._seat(facts),
                run_id=self._run_id(facts, task_id, attempt),
                turn=turn,
                before_turn=before_turn,
            )
        except (CrewChatError, BindingError, WorkflowError, PromptRefused) as error:
            return None, await self._refused(name, task_id, outcome, held.get("claim"), error)
        # Accepted (queued counts): the refusal count starts over.
        self._pressure[name] = clear_backpressure(self._pressure.get(name, {}), task_id)
        self._not_before.get(name, {}).pop(task_id, None)
        return binding, None

    async def _refused(
        self, mansion_id: str, task_id: str, outcome: TaskOutcome, claim: object, error: BaseException
    ) -> str:
        """Account for one dispatch that did not start."""

        code = getattr(error, "code", None)
        code = code if is_safe_code(code) else "crew_failed"
        claim_id = getattr(claim, "claim_id", None)
        if claim_id is not None:
            # Released against its own acquisition when no turn ever ran; a run
            # the launch-failure hook already settled released it itself.
            await self._claims.release_provisional(mansion_id, claim_id)
        capacity = isinstance(error, CrewChatError) and classify_crew_refusal(
            error.status, error.gateway_code
        )
        if capacity:
            pressure = self._pressure.setdefault(mansion_id, {})
            step = record_refusal(
                outcome,
                pressure.get(task_id),
                task_id,
                "crew_capacity",
                retry_after_seconds=cast(CrewChatError, error).retry_after,
            )
            if step.capacity_unavailable or step.backpressure is None:
                pressure.pop(task_id, None)
                self._not_before.get(mansion_id, {}).pop(task_id, None)
                self._blocked.setdefault(mansion_id, {})[task_id] = CAPACITY_UNAVAILABLE
                return CAPACITY_UNAVAILABLE
            pressure[task_id] = step.backpressure
            self._not_before.setdefault(mansion_id, {})[task_id] = (
                self._clock() + step.backpressure.next_delay_seconds
            )
            return "crew_capacity"
        if code in ("claim_busy", "claim_conflict", "stale_version"):
            return code  # another claim won the Sequence: scheduled again later
        scope = getattr(claim, "scope", None)
        facts = self._ghosts.facts(await self._port.read(mansion_id))
        run = facts.run_of_scope(scope) if scope is not None else None
        if run is None or run.active:
            # No run carries the refusal, so no record does: it is never retried
            # on a guess, and the Operator selects the task again to clear it.
            self._blocked.setdefault(mansion_id, {})[task_id] = code
        return code

    # --- the implementation output ----------------------------------------------------------

    async def output_refusal(self, mansion_id: str, spec_name: str) -> str | None:
        """Why the implementation output may not be proposed yet, or ``None``.

        The implementation Door is proposed once: when every Selected_Task is
        complete and no claim is held.  A Tinker that calls
        ``submit_phase_output`` for its one task before that would seal the
        Workshop for every other Tinker, so its submission is refused.
        """

        read = await self._port.read(mansion_id)
        facts = self._ghosts.facts(read)
        if not facts.selected or facts.ledger.active:
            return "workshop_incomplete"
        state = await self._documents.read(read, mansion_id, spec_name)
        if state.plan is None:
            return "workshop_incomplete"
        complete = {leaf.task_id for leaf in state.plan.leaves if leaf.complete}
        return None if facts.selected <= complete else "workshop_incomplete"

    async def _submit_when_done(self, mansion: WorkflowMansion) -> None:
        """Once every Selected_Task is complete, the house submits the output."""

        name = mansion.mansion_id
        read = await self._port.read(name)
        facts = self._ghosts.facts(read)
        if read.projection.phases[Phase.IMPLEMENTATION].status is not PhaseStatus.WORKING:
            return
        if self._submitted_at.get(name) == read.projection.version:
            return  # nothing changed since the last attempt
        if await self.output_refusal(name, mansion.spec_name) is not None:
            return
        evidence = self._evidence(read, facts)
        if evidence is None:
            return
        room, path = evidence
        self._submitted_at[name] = read.projection.version
        result = await self._workflow.submit_phase_output(room, path)
        if result.ok is not True:
            log.info("implementation output was not submitted (%s)", result.code)

    def _evidence(self, read: GuardrailRead, facts: RoomFacts) -> tuple[RoomBinding, str] | None:
        """The newest completed task's first evidence file and its session."""

        store = self._bindings() if callable(self._bindings) else self._bindings
        if store is None:
            return None
        completed = sorted(
            fold_completions(read.events).completed.values(), key=lambda record: record.sequence
        )
        for record in reversed(completed):
            if record.data["task_id"] not in facts.selected:
                continue
            items = cast(list[dict[str, str]], record.data["evidence"])
            if not items:
                continue
            try:
                room = store.load(session_label(record.scope.session_slot))
            except Exception:  # noqa: BLE001
                room = None
            if room is not None and room.scope == record.scope:
                return room, items[0]["path"]
        return None
