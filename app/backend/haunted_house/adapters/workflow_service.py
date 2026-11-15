"""WorkflowService: phases, Doors, risky approvals, and guarded room actions.

The service coordinates the pure decisions with the adapters.  Every
accepted fact becomes one domain candidate submitted through the injected
Spec 2 writer; the workflow and approval state it acts on is always a fold of
the canonical read it just made.  The same writer serves the signed API, the
room MCP operations, and external Crew resolutions.

A phase start reserves before any Crew call:

    read -> phase_start_reserved (compare-and-append) -> create slot, set
    project, set interactive mode -> write the session binding -> register
    the run -> send the turn -> phase_started, or phase_start_failed

``phase_started`` is appended only once Crew accepted the turn, so a Crew
failure at any step leaves the phase ``failed`` and retryable by an explicit
command, never ``working`` with no Ghost.  Approving a Door never starts
anything.  A risky action runs only after its exact consumption record was
acknowledged (``ApprovedActionExecutor``).

Errors are ``WorkflowError`` with a stable code and, when the log could be
read, the current view.  No path, token, capability, or document body is
ever placed in an error, a view, or a domain record.
"""

from __future__ import annotations

import asyncio
import logging
import secrets
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Protocol, cast

from haunted_house.adapters.command_runner import ApprovedActionExecutor, ExecutionResult
from haunted_house.adapters.crew_chat import (
    CrewChat,
    CrewChatError,
    SessionBinding,
    SessionRequest,
)
from haunted_house.adapters.guarded_filesystem import (
    GuardedFilesystem,
    GuardedFilesystemError,
    GuardedRoomAccess,
)
from haunted_house.adapters.guardrail_port import GuardrailPort, GuardrailRead
from haunted_house.adapters.session_bindings import (
    BindingError,
    RoomBinding,
    SessionBindingStore,
    new_capability,
)
from haunted_house.adapters.session_reconciler import (
    PermissionInfo,
    ReconcileReport,
    SessionReconciler,
)
from haunted_house.core import guardrail_events as events_module
from haunted_house.core.action_descriptor import (
    ACTION_SCHEMA_VERSION,
    ActionError,
    action_digest,
    descriptor_to_json,
    parse_action_descriptor,
)
from haunted_house.core.approvals import (
    ProposalStatus,
    RiskyDecisionRequest,
    decide_risky_decision,
)
from haunted_house.core.guardrail_events import (
    PHASES,
    DomainRecord,
    GuardrailEventKind,
    GuardrailPayloadError,
    Phase,
    operator_scope,
)
from haunted_house.core.mansion_names import is_valid_mansion_name
from haunted_house.core.path_policy import (
    Access,
    PathRule,
    RoomPolicy,
    is_valid_spec_name,
    join_parts,
    parse_relative_path,
    room_policy,
    spec_document_parts,
)
from haunted_house.core.seance_event import (
    AppEvent,
    AppEventCandidate,
    EventScope,
    EventSource,
    JSONValue,
)
from haunted_house.core.seance_persistence import CanonicalEventWriter
from haunted_house.core.workflow import (
    ArtifactRevision,
    ConfirmStart,
    DecideDoor,
    DoorProposal,
    FailStart,
    PhaseStatus,
    StartPhase,
    SubmitOutput,
    SupersedeDoor,
    WorkflowCommand,
    decide_transition,
    spec_document_phase,
)
from haunted_house.core.workflow_dto import workflow_projection_to_json
from haunted_house.core.workshop_scheduler import (
    Confirm,
    Enqueue,
    Fail,
    Stop,
    WorkshopSchedule,
    admit_ready,
    apply_event,
    empty_schedule,
)

__all__ = [
    "DEFAULT_AGENTS",
    "ROLE_BY_PHASE",
    "CommandResult",
    "MansionResolver",
    "OutputValidator",
    "PhaseOutput",
    "RoomResult",
    "WorkflowError",
    "WorkflowMansion",
    "WorkflowService",
    "WorkflowView",
    "accept_non_empty_output",
]

log = logging.getLogger(__name__)

K = GuardrailEventKind
ROLE_BY_PHASE: Mapping[Phase, str] = {
    Phase.REQUIREMENTS: "archivist",
    Phase.DESIGN: "draughtsman",
    Phase.TASKS: "foreman",
    Phase.IMPLEMENTATION: "tinker",
}
# The short names of the runtime Ghost agents the app package declares.
DEFAULT_AGENTS: Mapping[str, str] = {
    "archivist": "hh-archivist",
    "draughtsman": "hh-draughtsman",
    "foreman": "hh-foreman",
    "tinker": "hh-tinker",
}
_RUN_REASON: Mapping[Phase, str] = {
    Phase.REQUIREMENTS: "Writing requirements",
    Phase.DESIGN: "Drawing the design",
    Phase.TASKS: "Planning the tasks",
    Phase.IMPLEMENTATION: "Building",
}
_ROOM_LABEL = {"study": "study", "drafting_room": "drafting-room", "workshop": "workshop"}
_SPEC_TURN = (
    "You are the {role} of this mansion. Work on the spec named {spec}. "
    "Write the complete {phase} document with the write_spec_document tool, "
    "then call submit_phase_output. Use only your room tools. "
    "Stop when the output is submitted; the Operator decides the Door."
)
_TINKER_TURN = (
    "You are a tinker of this mansion. Implement the tasks of the spec named {spec} "
    "(assignment {assignment}). Use only your room tools. A delete, command, or git "
    "action needs propose_risky_action, then execute_approved_action after the "
    "Operator approves it. When the work is done, call submit_phase_output with the "
    "path of your result file."
)
_CAS_ATTEMPTS = 4
_MAX_ASSIGNMENTS = 16
_MAX_OUTPUT_BYTES = 4 * 1024 * 1024


@dataclass(frozen=True, slots=True)
class WorkflowMansion:
    """A registered Mansion as the server resolved it."""

    mansion_id: str
    spec_name: str
    root: Path  # the configured parent directory; never request input

    @property
    def directory(self) -> Path:
        return self.root / self.mansion_id


class MansionResolver(Protocol):
    """Returns the registered, ready Mansion, or ``None`` when there is none.
    Raises when the registry itself is unavailable."""

    def __call__(self, mansion_id: str) -> Awaitable[WorkflowMansion | None]: ...


@dataclass(frozen=True, slots=True)
class PhaseOutput:
    mansion_id: str
    spec_name: str
    phase: Phase
    document_path: str
    artifact_revision: ArtifactRevision
    content: bytes


class OutputValidator(Protocol):
    """The upstream (Spec 5) artifact validation boundary.  Returns ``None``
    to accept, or a safe refusal code."""

    def __call__(self, output: PhaseOutput) -> Awaitable[str | None]: ...


async def accept_non_empty_output(output: PhaseOutput) -> str | None:
    """Baseline validation until the room-ghosts spec supplies its own."""

    return None if output.content.strip() else "empty_output"


@dataclass(frozen=True, slots=True)
class WorkflowView:
    """The current projection of one Mansion and what correlation knows."""

    mansion_id: str
    read: GuardrailRead
    permissions: Mapping[tuple[str, str], PermissionInfo] = field(default_factory=dict)
    uncertain: bool = False

    @property
    def version(self) -> int:
        return self.read.projection.version

    def to_json(self) -> dict[str, JSONValue]:
        body = workflow_projection_to_json(
            self.read.projection, mansion_id=self.mansion_id, events=self.read.events
        )
        if self.uncertain and body["integrity"] == "valid":
            # Crew state could not be confirmed current: no decision yet.
            body["integrity"] = "uncertain"
        for item in cast(list[dict[str, JSONValue]], body["pending_permissions"]):
            info = self.permissions.get((cast(str, item["slot"]), cast(str, item["mid"])))
            if info is not None:
                item["tool_name"] = info.tool_name
                item["action_digest"] = info.action_digest
                item["proposal_id"] = info.proposal_id
        return body


class WorkflowError(Exception):
    """A refused or failed workflow operation, described by a stable code."""

    def __init__(self, code: str, view: WorkflowView | None = None) -> None:
        self.code = code
        self.view = view
        super().__init__(code)


@dataclass(frozen=True, slots=True)
class CommandResult:
    """The acknowledged record of a command and the projection after it."""

    event: AppEvent
    view: WorkflowView
    duplicate: bool = False


@dataclass(frozen=True, slots=True)
class RoomResult:
    """The redacted answer to one room operation."""

    ok: bool
    code: str
    data: Mapping[str, JSONValue] = field(default_factory=dict)

    def to_json(self) -> dict[str, JSONValue]:
        return {"ok": self.ok, "code": self.code, **self.data}


class WorkflowService:
    def __init__(
        self,
        writer: CanonicalEventWriter,
        *,
        mansions: MansionResolver,
        crew: CrewChat,
        executor: ApprovedActionExecutor,
        reconciler: SessionReconciler,
        bindings: SessionBindingStore | Callable[[], SessionBindingStore | None] | None = None,
        filesystem: Callable[[WorkflowMansion], GuardedFilesystem] | None = None,
        validator: OutputValidator = accept_non_empty_output,
        agents: Mapping[str, str] = DEFAULT_AGENTS,
        id_factory: Callable[[], str] | None = None,
    ) -> None:
        self._writer = writer
        self._port = GuardrailPort(writer)
        self._mansions = mansions
        self._crew = crew
        self._executor = executor
        self._reconciler = reconciler
        self._bindings: Callable[[], SessionBindingStore | None] = (
            bindings if callable(bindings) else (lambda: bindings)
        )
        self._filesystem = filesystem or (
            lambda mansion: GuardedFilesystem(mansion.root, mansion.mansion_id)
        )
        self._validator = validator
        self._agents = dict(agents)
        self._new_id = id_factory or (lambda: secrets.token_hex(16))
        self._locks: dict[str, asyncio.Lock] = {}
        self._live_reservations: set[str] = set()
        self._recovered: set[str] = set()
        self._workshops: dict[str, WorkshopSchedule] = {}

    @property
    def port(self) -> GuardrailPort:
        return self._port

    # --- reading -----------------------------------------------------------------------

    async def _mansion(self, mansion_id: object) -> WorkflowMansion:
        if type(mansion_id) is not str or not is_valid_mansion_name(mansion_id):
            raise WorkflowError("invalid_mansion_id")
        try:
            mansion = await self._mansions(mansion_id)
        except WorkflowError:
            raise
        except Exception:  # noqa: BLE001 - the registry is unavailable
            raise WorkflowError("workflow_unavailable") from None
        if mansion is None or not is_valid_spec_name(mansion.spec_name):
            raise WorkflowError("mansion_not_found")
        return mansion

    async def _view(
        self, mansion_id: str, report: ReconcileReport | None = None
    ) -> WorkflowView:
        if report is not None:
            return WorkflowView(mansion_id, report.read, report.permissions, report.uncertain)
        return WorkflowView(mansion_id, await self._port.read(mansion_id))

    async def projection(self, mansion_id: object, *, reconcile: bool = True) -> WorkflowView:
        """Fold the current canonical records of one Mansion.

        With ``reconcile`` the Session_Reconciler runs first, so external
        Crew resolutions and prompt correlation are part of what is shown.
        A reconciliation failure never hides the projection.
        """

        mansion = await self._mansion(mansion_id)
        await self._ensure_recovered(mansion)
        report: ReconcileReport | None = None
        if reconcile:
            try:
                report = await self._reconciler.reconcile(mansion.mansion_id)
            except Exception as error:  # noqa: BLE001
                log.warning("session reconciliation failed (%s)", type(error).__name__)
        return await self._view(mansion.mansion_id, report)

    def _lock(self, mansion_id: str) -> asyncio.Lock:
        return self._locks.setdefault(mansion_id, asyncio.Lock())

    async def _writable(self, mansion_id: str) -> GuardrailRead:
        read = await self._port.read(mansion_id)
        if not read.writable:
            raise WorkflowError("integrity_unavailable", WorkflowView(mansion_id, read))
        return read

    async def _refuse(self, mansion_id: str, code: str) -> WorkflowError:
        return WorkflowError(code, await self._view(mansion_id))

    @staticmethod
    def _command_record(read: GuardrailRead, command_id: str) -> DomainRecord | None:
        return next(
            (
                record
                for record in read.domain.records
                if record.data.get("command_id") == command_id
            ),
            None,
        )

    @staticmethod
    def _event(read: GuardrailRead, event_id: str) -> AppEvent | None:
        return next((event for event in read.events if event.event_id == event_id), None)

    # --- recovery ------------------------------------------------------------------------

    async def _ensure_recovered(self, mansion: WorkflowMansion) -> None:
        if mansion.mansion_id in self._recovered:
            return
        self._recovered.add(mansion.mansion_id)
        try:
            await self.recover(mansion.mansion_id)
        except Exception as error:  # noqa: BLE001 - recovery never blocks reads
            log.warning("workflow recovery failed (%s)", type(error).__name__)

    async def recover(self, mansion_id: object) -> tuple[AppEvent, ...]:
        """Settle what an earlier process left unfinished.

        - a reservation with no start or failure becomes ``phase_start_failed``;
        - a prepared Spec_Document write is settled by guarded digest inspection;
        - a consumed risky action with no outcome becomes ``failed``.

        Nothing is retried: each needs a new explicit command or proposal.
        """

        mansion = await self._mansion(mansion_id)
        read = await self._port.read(mansion.mansion_id)
        if not read.writable:
            return ()
        settled: list[AppEvent] = []
        scope = operator_scope(mansion.mansion_id)
        for phase in PHASES:
            view = read.projection.phases[phase]
            if (
                view.status is PhaseStatus.STARTING
                and view.reservation_id is not None
                and view.reservation_id not in self._live_reservations
            ):
                result = decide_transition(
                    read.projection, FailStart(scope, phase, view.reservation_id, "interrupted")
                )
                if result.ok:
                    acknowledged = await self._port.append(mansion.mansion_id, result.candidates)
                    settled.extend(acknowledged.events)
                    read = await self._port.read(mansion.mansion_id)
        if read.projection.pending_writes:
            access = GuardedRoomAccess(self._filesystem(mansion), self._port, id_factory=self._new_id)
            try:
                await access.recover_spec_writes(scope)
            except GuardedFilesystemError:
                pass
        settled.extend(await self._executor.settle_interrupted(mansion.mansion_id))
        return tuple(settled)

    # --- phase start ---------------------------------------------------------------------

    async def start_phase(
        self,
        mansion_id: object,
        phase: Phase,
        *,
        command_id: str,
        expected_version: int,
        assignments: Sequence[str] = (),
    ) -> CommandResult:
        """Explicit Phase_Start_Command: reserve, bind a Crew session, start."""

        mansion = await self._mansion(mansion_id)
        await self._ensure_recovered(mansion)
        name = mansion.mansion_id
        if len(assignments) > _MAX_ASSIGNMENTS or (assignments and phase is not Phase.IMPLEMENTATION):
            raise WorkflowError("invalid_request")
        async with self._lock(name):
            read = await self._writable(name)
            prior = self._command_record(read, command_id)
            if prior is not None:
                same = prior.kind is K.PHASE_START_RESERVED and prior.data["phase"] == phase.value
                if not same:
                    raise WorkflowError("command_conflict", WorkflowView(name, read))
                event = self._event(read, prior.event_id)
                assert event is not None
                return CommandResult(event, WorkflowView(name, read), duplicate=True)

            reservation_id = self._new_id()
            decision = decide_transition(
                read.projection,
                StartPhase(operator_scope(name), phase, command_id, reservation_id, expected_version),
            )
            if not decision.ok:
                raise WorkflowError(decision.code, WorkflowView(name, read))
            self._live_reservations.add(reservation_id)
            try:
                reserved = await self._port.compare_and_append(
                    name, cast(int, decision.expected_sequence), decision.candidates
                )
                if not reserved.ok:
                    raise await self._refuse(
                        name, "stale_version" if reserved.status == "conflict" else "writer_unavailable"
                    )
                failure = await self._start_sessions(mansion, phase, reservation_id, assignments)
            finally:
                self._live_reservations.discard(reservation_id)
            view = await self._view(name)
            if failure is not None:
                raise WorkflowError(failure, view)
            return CommandResult(reserved.events[0], view)

    async def _start_sessions(
        self,
        mansion: WorkflowMansion,
        phase: Phase,
        reservation_id: str,
        assignments: Sequence[str],
    ) -> str | None:
        """Bind the phase's Crew session(s).  Returns a failure code or None."""

        name = mansion.mansion_id
        scope = operator_scope(name)
        role = ROLE_BY_PHASE[phase]
        seats: list[tuple[str, str]] = [(role, reservation_id)]
        if phase is Phase.IMPLEMENTATION:
            # A new attempt replaces the sessions of the previous one.
            schedule = self._workshops.get(name, empty_schedule())
            for item in schedule.assignments:
                schedule = apply_event(schedule, Stop(item.assignment_id))
            ids = list(dict.fromkeys(assignments)) or [reservation_id]
            for assignment_id in ids:
                schedule = apply_event(schedule, Enqueue(f"{reservation_id[:16]}.{assignment_id}"[:64]))
            schedule, admitted = admit_ready(schedule)
            self._workshops[name] = schedule
            seats = [(f"tinker-{item.seat}", item.assignment_id) for item in admitted]
            if not seats:
                return await self._fail_start(name, scope, phase, reservation_id, "workshop_full")

        code: str | None = None
        binding: RoomBinding | None = None
        try:
            binding = await self._launch(mansion, phase, role, seats[0][0], seats[0][1])
        except CrewChatError as error:
            code = error.code
        except BindingError:
            code = "binding_failed"
        except WorkflowError as error:
            code = error.code
        if code is not None or binding is None:
            self._seat(name, phase, seats[0][1], Fail)
            return await self._fail_start(name, scope, phase, reservation_id, code or "crew_failed")

        read = await self._port.read(name)
        confirmed = decide_transition(
            read.projection, ConfirmStart(scope, phase, reservation_id, binding.slot)
        )
        acknowledged = (
            await self._port.append(name, confirmed.candidates) if confirmed.ok else None
        )
        if acknowledged is None or not acknowledged.ok:
            self._seat(name, phase, seats[0][1], Fail)
            return await self._fail_start(name, scope, phase, reservation_id, "writer_unavailable")
        self._seat(name, phase, seats[0][1], Confirm)

        # Further admitted assignments run beside the phase's first session.
        for ghost, assignment_id in seats[1:]:
            try:
                await self._launch(mansion, phase, role, ghost, assignment_id)
                self._seat(name, phase, assignment_id, Confirm)
            except (CrewChatError, BindingError, WorkflowError):
                self._seat(name, phase, assignment_id, Fail)
        return None

    def _seat(self, mansion_id: str, phase: Phase, assignment_id: str, event: type) -> None:
        if phase is Phase.IMPLEMENTATION and mansion_id in self._workshops:
            self._workshops[mansion_id] = apply_event(
                self._workshops[mansion_id], event(assignment_id)
            )

    def workshop(self, mansion_id: str) -> WorkshopSchedule:
        """The implementation seats this process is tracking."""

        return self._workshops.get(mansion_id, empty_schedule())

    async def _fail_start(
        self, mansion_id: str, scope: EventScope, phase: Phase, reservation_id: str, code: str
    ) -> str:
        read = await self._port.read(mansion_id)
        safe = code if events_module.is_safe_code(code) else "crew_failed"
        failed = decide_transition(read.projection, FailStart(scope, phase, reservation_id, safe))
        if failed.ok:
            await self._port.append(mansion_id, failed.candidates)
        return safe

    async def _launch(
        self, mansion: WorkflowMansion, phase: Phase, role: str, ghost: str, assignment_id: str
    ) -> RoomBinding:
        """Create one app-owned session, bind it, register its run, send its turn."""

        name = mansion.mansion_id
        policy = room_policy(role, mansion.spec_name)
        agent = self._agents.get(role)
        store = self._bindings()
        if policy is None or agent is None:
            raise WorkflowError("identity_unavailable")
        if store is None:
            # Without a binding the room tools would expose nothing.
            raise BindingError("binding_store_unavailable")
        read = await self._port.read(name)
        run_sequence = 1 + sum(
            1
            for event in read.events
            if event.event_type == "run_started"
            and event.source.origin == "house"
            and event.scope.ghost_id == ghost
        )
        # The house names the slot, so the session label is known before Crew
        # creates the session and starts its MCP server: the binding is on
        # disk first.
        slot_name = f"hh-{ghost}-{self._new_id()}"[:64]
        binding = RoomBinding(
            slot=slot_name,
            ghost=ghost,
            role=role,
            room=policy.room,
            mansion=name,
            mansion_root=str(mansion.root),
            spec=mansion.spec_name,
            phase=phase,
            run_id=f"{phase.value}-{run_sequence}",
            run_sequence=run_sequence,
            capability=new_capability(),
        )
        await asyncio.to_thread(store.write, binding)
        try:
            session: SessionBinding = await self._crew.create_bound_session(
                SessionRequest(
                    name=slot_name, agent=agent, project_directory=str(mansion.directory)
                )
            )
            if session.slot != slot_name:
                # Crew keyed the slot differently: bind the key it reported.
                provisional = binding
                binding = replace(binding, slot=session.slot)
                await asyncio.to_thread(store.write, binding)
                await asyncio.to_thread(store.remove, provisional.label)
            registered = await self._writer.append_candidates(
                name, [_run_started(binding, policy)]
            )
            if registered.status != "ok":
                raise WorkflowError("writer_unavailable")
            if role == "tinker":
                text = _TINKER_TURN.format(spec=mansion.spec_name, assignment=assignment_id[-32:])
            else:
                text = _SPEC_TURN.format(role=role, spec=mansion.spec_name, phase=phase.value)
            await self._crew.send_turn(session, text)
        except BaseException:
            # No session may keep a binding the house did not finish starting.
            await asyncio.to_thread(store.remove, binding.label)
            raise
        return binding

    # --- Door decisions ------------------------------------------------------------------

    async def decide_door(
        self,
        mansion_id: object,
        proposal_id: str,
        *,
        approve: bool,
        phase: Phase,
        document_path: str,
        artifact_revision: ArtifactRevision,
        command_id: str,
        expected_version: int,
    ) -> CommandResult:
        """One exact Door decision; the first compare-and-append wins."""

        mansion = await self._mansion(mansion_id)
        name = mansion.mansion_id
        read = await self._writable(name)
        view = WorkflowView(name, read)
        wanted = K.DOOR_APPROVED if approve else K.DOOR_REJECTED
        prior = self._command_record(read, command_id)
        if prior is not None:
            same = (
                prior.kind is wanted
                and prior.data["proposal_id"] == proposal_id
                and prior.data["phase"] == phase.value
                and prior.data["document_path"] == document_path
                and prior.data["revision"] == artifact_revision.revision
                and prior.data["sha256"] == artifact_revision.sha256
                and prior.data["size_bytes"] == artifact_revision.size_bytes
            )
            event = self._event(read, prior.event_id)
            if not same or event is None:
                raise WorkflowError("command_conflict", view)
            return CommandResult(event, view, duplicate=True)

        current = next(
            (
                item.proposal
                for item in read.projection.phases.values()
                if item.proposal is not None and item.proposal.proposal_id == proposal_id
            ),
            None,
        )
        if current is None:
            known = proposal_id in read.projection.proposal_ids
            raise WorkflowError("stale_proposal" if known else "proposal_not_found", view)

        scope = operator_scope(name)
        if current.status == "pending" and await self._document_changed(mansion, current):
            # The document moved after the proposal: supersede it, decide nothing.
            superseded = decide_transition(read.projection, SupersedeDoor(scope, current.phase))
            if superseded.ok:
                await self._port.compare_and_append(
                    name, cast(int, superseded.expected_sequence), superseded.candidates
                )
            raise await self._refuse(name, "artifact_changed")

        return await self._commit(
            name,
            read,
            DecideDoor(
                scope, proposal_id, phase, document_path, artifact_revision,
                expected_version, approve, "operator", command_id,
            ),
        )

    async def _document_changed(self, mansion: WorkflowMansion, proposal: DoorProposal) -> bool:
        parts = parse_relative_path(proposal.document_path)
        if not isinstance(parts, tuple):
            return True
        reader = RoomPolicy("house", (PathRule(parts, frozenset({Access.READ})),), ())
        try:
            found = await asyncio.to_thread(
                self._filesystem(mansion).digest, reader, proposal.document_path
            )
        except GuardedFilesystemError:
            return True
        return found is None or found.sha256 != proposal.artifact_revision.sha256

    async def _commit(
        self, mansion_id: str, read: GuardrailRead, command: WorkflowCommand
    ) -> CommandResult:
        decision = decide_transition(read.projection, command)
        if not decision.ok:
            raise WorkflowError(decision.code, WorkflowView(mansion_id, read))
        acknowledged = await self._port.compare_and_append(
            mansion_id, cast(int, decision.expected_sequence), decision.candidates
        )
        if not acknowledged.ok:
            raise await self._refuse(
                mansion_id,
                "stale_version" if acknowledged.status == "conflict" else "writer_unavailable",
            )
        return CommandResult(acknowledged.events[0], await self._view(mansion_id))

    # --- risky decisions -----------------------------------------------------------------

    async def decide_risky_action(
        self,
        mansion_id: object,
        proposal_id: str,
        *,
        approve: bool,
        action_digest: str,
        command_id: str,
        expected_version: int,
    ) -> CommandResult:
        """One exact risky-action decision, then the matching Crew answer."""

        mansion = await self._mansion(mansion_id)
        name = mansion.mansion_id
        read = await self._writable(name)
        view = WorkflowView(name, read)
        ledger = read.projection.ledger
        if command_id in read.projection.command_ids:
            raise WorkflowError("command_conflict", view)

        def request(slot: str | None, mid: str | None) -> RiskyDecisionRequest:
            return RiskyDecisionRequest(
                proposal_id=proposal_id,
                action_digest=action_digest,
                expected_version=expected_version,
                approve=approve,
                actor="operator",
                command_id=command_id,
                scope=operator_scope(name),
                crew_slot=slot,
                crew_mid=mid,
            )

        decision = decide_risky_decision(ledger, request(None, None))
        if decision.code == "duplicate_command" and decision.duplicate_of is not None:
            event = self._event(read, decision.duplicate_of.event_id)
            if event is None or decision.duplicate_of.proposal_id != proposal_id:
                raise WorkflowError("command_conflict", view)
            return CommandResult(event, view, duplicate=True)
        if not decision.ok:
            raise WorkflowError(
                "proposal_not_found" if decision.code == "proposal_missing" else decision.code, view
            )

        # Name the open Crew prompt in the record when exactly one asks for
        # this action; it is answered only after the record is acknowledged.
        permission = await self._reconciler.permission_for(ledger, proposal_id)
        if permission is not None:
            named = decide_risky_decision(ledger, request(permission.slot, permission.mid))
            if named.ok:
                decision = named
            else:
                permission = None
        assert decision.candidate is not None and decision.expected_sequence is not None
        acknowledged = await self._port.compare_and_append(
            name, decision.expected_sequence, [decision.candidate]
        )
        if not acknowledged.ok:
            raise await self._refuse(
                name, "stale_version" if acknowledged.status == "conflict" else "writer_unavailable"
            )
        if permission is not None:
            try:
                await self._reconciler.answer(permission, "approved" if approve else "rejected")
            except CrewChatError as error:
                # The decision stands; the reconciler answers Crew again later.
                raise WorkflowError(error.code, await self._view(name)) from None
        return CommandResult(acknowledged.events[0], await self._view(name))

    # --- room operations (called with a trusted session binding) --------------------------

    def _room(self, binding: RoomBinding) -> tuple[WorkflowMansion, RoomPolicy] | None:
        policy = room_policy(binding.role, binding.spec)
        if policy is None or policy.room != binding.room:
            return None
        return WorkflowMansion(binding.mansion, binding.spec, Path(binding.mansion_root)), policy

    async def _bound(self, binding: RoomBinding) -> tuple[WorkflowMansion, RoomPolicy] | RoomResult:
        """Check the binding against the registry and the live projection."""

        room = self._room(binding)
        if room is None:
            return RoomResult(False, "identity_unavailable")
        try:
            mansion = await self._mansion(binding.mansion)
        except WorkflowError as error:
            return RoomResult(False, error.code)
        if mansion.spec_name != binding.spec or str(mansion.root) != binding.mansion_root:
            return RoomResult(False, "identity_unavailable")
        return mansion, room[1]

    async def submit_phase_output(self, binding: RoomBinding, path: object = None) -> RoomResult:
        """Create the Door_Proposal for a validated Phase_Output.

        A spec Ghost submits its own Spec_Document at the revision the house
        recorded when it was written.  A tinker names its result file.
        """

        bound = await self._bound(binding)
        if isinstance(bound, RoomResult):
            return bound
        mansion, policy = bound
        name, phase, scope = mansion.mansion_id, binding.phase, binding.scope
        filesystem = self._filesystem(mansion)
        for _ in range(_CAS_ATTEMPTS):
            read = await self._port.read(name)
            if not read.writable:
                return RoomResult(False, "integrity_unavailable")
            view = read.projection.phases[phase]
            if not _session_current(read, binding):
                return RoomResult(False, "session_not_current")
            if phase is Phase.IMPLEMENTATION:
                parts = parse_relative_path(path)
                if not isinstance(parts, tuple) or spec_document_phase(join_parts(parts)) is not None:
                    return RoomResult(False, "invalid_path")
                document_path = join_parts(parts)
                revision: int | None = view.last_revision + 1
            else:
                if path is not None:
                    return RoomResult(False, "invalid_request")
                document_path = join_parts(spec_document_parts(mansion.spec_name, f"{phase.value}.md"))
                known = read.projection.documents.get(document_path)
                if known is None:
                    return RoomResult(False, "document_missing")
                revision = None
            try:
                content, digest = await asyncio.to_thread(filesystem.read_file, policy, document_path)
            except GuardedFilesystemError as error:
                if error.denied:
                    await self._record_path_denial(scope, policy, Access.READ, error.code, document_path)
                return RoomResult(False, error.code if events_module.is_safe_code(error.code) else "read_failed")
            if len(content) > _MAX_OUTPUT_BYTES:
                return RoomResult(False, "too_large")
            if revision is None:
                known = read.projection.documents[document_path]
                if known.sha256 != digest.sha256 or known.size_bytes != digest.size_bytes:
                    return RoomResult(False, "artifact_mismatch")
                artifact = known
            else:
                artifact = ArtifactRevision(revision, digest.sha256, digest.size_bytes)
            refusal = await self._validator(
                PhaseOutput(name, mansion.spec_name, phase, document_path, artifact, content)
            )
            if refusal is not None:
                return RoomResult(False, refusal if events_module.is_safe_code(refusal) else "output_invalid")
            proposal_id = self._new_id()
            decision = decide_transition(
                read.projection, SubmitOutput(scope, phase, proposal_id, document_path, artifact)
            )
            if not decision.ok:
                return RoomResult(False, decision.code)
            acknowledged = await self._port.compare_and_append(
                name, cast(int, decision.expected_sequence), decision.candidates
            )
            if acknowledged.status == "conflict":
                continue
            if not acknowledged.ok:
                return RoomResult(False, "writer_unavailable")
            return RoomResult(
                True,
                "waiting_for_door",
                {
                    "proposal_id": proposal_id,
                    "document_path": document_path,
                    "artifact_revision": {
                        "revision": artifact.revision,
                        "sha256": artifact.sha256,
                        "size_bytes": artifact.size_bytes,
                    },
                },
            )
        return RoomResult(False, "stale_version")

    async def _record_path_denial(
        self, scope: EventScope, policy: RoomPolicy, access: Access, code: str, raw_path: object
    ) -> None:
        try:
            candidate = events_module.path_denied(
                scope,
                denial_id=self._new_id(),
                session_slot=scope.session_slot,
                room=policy.room,
                access=access,
                code=code if events_module.is_safe_code(code) else "path_denied",
                raw_path=raw_path,
            )
        except GuardrailPayloadError:
            return
        await self._port.append(scope.mansion_id, [candidate])

    async def propose_risky_action(
        self, binding: RoomBinding, fields: Mapping[str, object]
    ) -> RoomResult:
        """Record one pending proposal for a complete, exact descriptor.

        Session, Mansion, and Room come from the binding; the model supplies
        only the action itself.  A proposal never approves anything.
        """

        bound = await self._bound(binding)
        if isinstance(bound, RoomResult):
            return bound
        mansion, policy = bound
        if binding.role != "tinker":
            return RoomResult(False, "tool_not_available")
        if not isinstance(fields, Mapping) or set(fields) != {
            "kind", "working_directory", "arguments", "path_intents"
        }:
            return RoomResult(False, "invalid_descriptor")
        raw = {
            "schema_version": ACTION_SCHEMA_VERSION,
            "mansion_id": binding.mansion,
            "session_slot": binding.slot,
            "room": binding.room,
            **dict(fields),
        }
        descriptor = parse_action_descriptor(raw)
        if isinstance(descriptor, ActionError):
            return RoomResult(False, "invalid_descriptor", {"field": descriptor.field, "reason": descriptor.code.value})
        name, scope = mansion.mansion_id, binding.scope
        read = await self._port.read(name)
        if not read.writable:
            return RoomResult(False, "integrity_unavailable")
        if not _session_current(read, binding):
            return RoomResult(False, "session_not_current")

        filesystem = self._filesystem(mansion)
        for intent in descriptor.path_intents:
            try:
                filesystem.precheck(policy, intent.path, intent.access)
            except GuardedFilesystemError as error:
                # An approval could never widen the room: refuse it now.
                await self._record_path_denial(scope, policy, intent.access, error.code, intent.path)
                return RoomResult(False, "path_denied")

        digest = action_digest(descriptor)
        for proposal in read.projection.ledger.proposals.values():
            if (
                proposal.action_digest == digest
                and proposal.session_slot == binding.slot
                and proposal.status in (ProposalStatus.PENDING, ProposalStatus.APPROVED)
            ):
                return _proposal_result(proposal.proposal_id, digest, descriptor, proposal.status.value)
        proposal_id = self._new_id()
        try:
            candidate = events_module.risky_action_proposed(
                scope, proposal_id=proposal_id, descriptor=descriptor
            )
        except GuardrailPayloadError:
            return RoomResult(False, "invalid_descriptor")
        acknowledged = await self._port.append(name, [candidate])
        if not acknowledged.ok:
            return RoomResult(False, "writer_unavailable")
        return _proposal_result(proposal_id, digest, descriptor, "pending")

    async def consume_and_execute(
        self, binding: RoomBinding, proposal_id: object, descriptor: object
    ) -> ExecutionResult:
        """Run an approved action once.  Approval alone is never enough: the
        executor re-checks identity, descriptor, room policy, and confinement
        and consumes the approval before anything runs."""

        bound = await self._bound(binding)
        if isinstance(bound, RoomResult):
            return ExecutionResult("denied", bound.code)
        return await self._executor.execute(
            binding.scope,
            role=binding.role,
            spec_name=binding.spec,
            proposal_id=proposal_id,
            descriptor=descriptor,
        )


def _session_current(read: GuardrailRead, binding: RoomBinding) -> bool:
    """Whether ``binding`` is a session of its phase's current attempt.

    The phase records one slot (``phase_started``).  Further sessions of the
    same attempt, such as the other implementation seats, are the runs the
    house registered for that phase after its latest start reservation.
    """

    phase = binding.phase
    if read.projection.phases[phase].session_slot == binding.slot:
        return True
    reserved = max(
        (
            record.sequence
            for record in read.domain.records
            if record.kind is K.PHASE_START_RESERVED and record.data["phase"] == phase.value
        ),
        default=None,
    )
    if reserved is None:
        return False
    return any(
        event.event_type == "run_started"
        and event.source.origin == "house"
        and event.scope == binding.scope
        and event.sequence > reserved
        for event in read.events
    )


def _proposal_result(proposal_id: str, digest: str, descriptor: object, status: str) -> RoomResult:
    return RoomResult(
        True,
        "proposal_" + status,
        {
            "proposal_id": proposal_id,
            "action_digest": digest,
            "descriptor": descriptor_to_json(descriptor),  # type: ignore[arg-type]
            "status": status,
        },
    )


def _run_started(binding: RoomBinding, policy: RoomPolicy) -> AppEventCandidate:
    """Register the session's Event_Scope with Spec 2 (a house-origin run)."""

    return AppEventCandidate(
        schema_version=1,
        event_type="run_started",
        scope=binding.scope,
        source=EventSource(
            origin="house",
            source_type="run",
            identity_parts=(binding.run_id,),
            revision=0,
            generation="",
            source_sequence=0,
        ),
        caused_by=(),
        occurred_at_ms=None,
        payload={
            "reason": _RUN_REASON[binding.phase],
            "room": _ROOM_LABEL.get(policy.room, policy.room),
        },
    )

