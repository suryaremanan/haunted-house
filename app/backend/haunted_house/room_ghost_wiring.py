"""Wiring of the Room Ghosts services over one Spec 2 writer and the Spec 4
``WorkflowService``.

Room Ghosts and the WorkflowService need each other: the WorkflowService
calls Room Ghosts for a role's prompt, for the Workshop start, and for the
outcome of a turn that could not be sent, while Room Ghosts calls the
WorkflowService for sessions, Doors, and output submission.
``RoomGhostSeams`` breaks that circle: it is built first, handed to the
WorkflowService as plain callables, and bound to the services afterwards.
Until it is bound every seam answers ``contract_unavailable`` and starts no
Ghost.

Nothing here opens a log, normalizes a Crew frame, or holds state: the one
writer the caller passes is shared with Spec 2 ingest and Spec 4.

Two contracts ship disabled until their live acceptance passes (see
``.kiro/steering/tech.md``): owned-session cancellation (RG-S3) and
existing-session navigation (RG-S4).  The stretch Séance Room is off.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

from haunted_house.adapters.crew_chat import CrewChat
from haunted_house.adapters.guarded_filesystem import GuardedFilesystem
from haunted_house.adapters.session_bindings import RoomBinding
from haunted_house.adapters.workflow_service import (
    PhaseOutput,
    WorkflowError,
    WorkflowMansion,
    WorkflowService,
)
from haunted_house.core.guardrail_events import Phase
from haunted_house.core.seance_persistence import CanonicalEventWriter
from haunted_house.services.canonical_port import CanonicalRunPort
from haunted_house.services.cancellation import CancellationService
from haunted_house.services.contracts import CONTRACT_UNAVAILABLE
from haunted_house.services.room_artifacts import (
    BindingProvider,
    GuardedArtifactInspector,
    RoomGhostOutputValidator,
    WorkflowOutputPort,
)
from haunted_house.services.room_documents import RoomDocuments
from haunted_house.services.room_ghost_service import RoomGhostService
from haunted_house.services.room_ghosts import RoomGhosts
from haunted_house.services.room_prompts import RoomPromptBuilder
from haunted_house.services.task_claims import TaskClaimService
from haunted_house.services.task_plan_writer import TaskPlanWriter
from haunted_house.services.terminal_gate import ValidatedTerminalGate
from haunted_house.services.workshop_service import WorkshopService

__all__ = ["RoomGhostOptions", "RoomGhostSeams", "build_room_ghosts"]


@dataclass(frozen=True, slots=True)
class RoomGhostOptions:
    """Feature switches.  The defaults are what ships."""

    # RG-S3: flips only after the owner's live cancellation step passes.
    cancellation_enabled: bool = False
    # RG-S4: flips only after the four manual navigation steps pass.
    session_links_enabled: bool = False
    # Stretch scope: the Medium and the Séance Room review.
    seance_enabled: bool = False
    # Return deterministic findings to the same session once validation fails.
    auto_correct: bool = True
    # RG-S5: how long an accepted turn may show no sign of running.
    start_deadline_seconds: float = 180.0
    tick_seconds: float = 2.0
    # How long a read waits for the pump before answering from the log as it is.
    read_budget_seconds: float = 5.0
    # Decision 2026-11-16: the backend reads active owned sessions' history
    # itself, so a run settles with no dashboard open.
    turn_watcher_enabled: bool = True
    # Decision 2026-11-16: the house approves NON-RISKY room-tool prompts
    # (list/read room files, write its own Spec_Document or room file, submit
    # phase output) on its own bound sessions.  Off leaves every prompt for
    # the human.  Risky tools and Doors are never answered by the house.
    house_answers_room_tools: bool = True


class RoomGhostSeams:
    """The callables the WorkflowService is constructed with."""

    def __init__(self, mansion_root: Path) -> None:
        self._mansion_root = Path(mansion_root)
        self.room_ghosts: RoomGhosts | None = None
        # A Ghost that calls submit_phase_output itself opens no Door on an
        # artifact the Spec 5 validators refuse.
        self._validator = RoomGhostOutputValidator(self.filesystem)

    def filesystem(self, mansion_id: str) -> GuardedFilesystem:
        return GuardedFilesystem(self._mansion_root, mansion_id)

    def _bound(self) -> RoomGhosts:
        if self.room_ghosts is None:
            raise WorkflowError(CONTRACT_UNAVAILABLE)
        return self.room_ghosts

    async def validator(self, output: PhaseOutput) -> str | None:
        refusal = await self._validator(output)
        if refusal is None and output.phase is Phase.IMPLEMENTATION:
            # Only a finished Workshop proposes the implementation Door.
            if self.room_ghosts is None:
                return CONTRACT_UNAVAILABLE
            return await self.room_ghosts.workshop.output_refusal(output.mansion_id, output.spec_name)
        return refusal

    async def turns(self, binding: RoomBinding, mansion: WorkflowMansion) -> str:
        return await self._bound().ghosts.phase_turn(binding, mansion)

    async def implementation(
        self, mansion: WorkflowMansion, reservation_id: str, assignments: Sequence[str]
    ) -> RoomBinding:
        return await self._bound().workshop.starter(mansion, reservation_id, assignments)

    async def on_launch_failure(self, binding: RoomBinding, code: str, error: BaseException) -> None:
        if self.room_ghosts is not None:
            await self.room_ghosts.ghosts.launch_failed(binding, code, error)


def build_room_ghosts(
    seams: RoomGhostSeams,
    *,
    writer: CanonicalEventWriter,
    workflow: WorkflowService,
    crew: CrewChat,
    bindings: BindingProvider,
    mansions: Callable[[str], Awaitable[WorkflowMansion | None]],
    app_root: Path,
    history: Callable[[str, list[str]], Awaitable[object]] | None = None,
    options: RoomGhostOptions = RoomGhostOptions(),
    **overrides: object,
) -> RoomGhosts:
    """Build the Room Ghosts services and bind them to ``seams``.

    ``workflow`` must have been constructed with the seams' ``validator``,
    ``turns``, ``implementation``, and ``on_launch_failure``.  ``overrides``
    are clocks and deadlines for tests: ``clock`` and ``now_ms`` reach every
    service, the cancellation timings reach the cancellation service, and the
    rest reaches ``RoomGhostService``.
    """

    port = CanonicalRunPort(writer)
    claims = TaskClaimService(port)
    plan_writer = TaskPlanWriter(port, seams.filesystem)
    gate = ValidatedTerminalGate(
        port,
        artifacts=GuardedArtifactInspector(bindings),
        outputs=WorkflowOutputPort(workflow, port, bindings),
        tasks=plan_writer,
        claims=claims,
    )
    prompts = RoomPromptBuilder(app_root, seams.filesystem)
    documents = RoomDocuments(seams.filesystem)
    cancellation = CancellationService(
        port=port,
        crew=crew,
        gate=gate,
        enabled=options.cancellation_enabled,
        **{key: overrides.pop(key) for key in ("confirm_seconds", "poll_seconds", "sleep") if key in overrides},  # type: ignore[arg-type]
        **{key: overrides[key] for key in ("clock", "now_ms") if key in overrides},  # type: ignore[arg-type]
    )
    holder: dict[str, WorkshopService] = {}
    ghosts = RoomGhostService(
        port=port,
        workflow=workflow,
        crew=crew,
        bindings=bindings,
        gate=gate,
        claims=claims,
        prompts=prompts,
        documents=documents,
        mansions=mansions,
        history=history,
        overlay=lambda mansion_id: holder["workshop"].overlay(mansion_id),
        cancellation_enabled=lambda: cancellation.enabled,
        session_links_enabled=options.session_links_enabled,
        seance_enabled=options.seance_enabled,
        auto_correct=options.auto_correct,
        start_deadline_seconds=options.start_deadline_seconds,
        **overrides,  # type: ignore[arg-type]
    )
    workshop = WorkshopService(
        ghosts=ghosts,
        port=port,
        workflow=workflow,
        claims=claims,
        prompts=prompts,
        documents=documents,
        bindings=bindings,
        **({"clock": overrides["clock"]} if "clock" in overrides else {}),  # type: ignore[arg-type]
    )
    holder["workshop"] = workshop
    room_ghosts = RoomGhosts(
        port=port,
        ghosts=ghosts,
        workshop=workshop,
        cancellation=cancellation,
        tick_seconds=options.tick_seconds,
        read_budget_seconds=options.read_budget_seconds,
    )
    seams.room_ghosts = room_ghosts
    return room_ghosts
