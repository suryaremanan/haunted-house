"""Live wiring of the guarded workflow (Doors and Guardrails task 16.1).

`live_workflow` builds, around one Spec 2 writer:

    signed workflow routes -> WorkflowService -> GuardrailPort -> writer
    room MCP gate          -> RoomToolService -> WorkflowService (room operations)
    Session_Reconciler     -> canonical records + CrewChat snapshots
    ApprovedActionExecutor -> GuardedFilesystem / ConfinedRunner

There is no Spec 4 event store, parser, Crew normalizer, or WebSocket here:
raw Crew events still enter only through the Spec 2 ingest route, and every
domain record goes through the same writer.

Room Ghosts (Spec 5) is wired around the same writer and the same services:

    WorkflowService seams  -> role prompts, Workshop start, launch failures,
                              and the Spec 5 output validator
    RoomToolService        -> Task_Claim_Gate required for every Tinker call
    RoomGhosts             -> validated terminal gate, claims, scheduler,
                              cancellation (disabled), and its background pump

The Task_Claim_Gate is enabled together with the Workshop service that
acquires claims, never without it.  The Room Ghosts pump and every pending
cancellation confirmation stop with the application.

The TurnWatcher (design decision 2026-11-16) starts and stops with the
application too: it reads the bounded history of active owned sessions
through Spec 2's reconciliation (same normalizer, same writer) and then runs
the Room Ghosts pump, so a turn settles with no dashboard open.

Nothing is built or touched at import or call time.  The service is built on
first use, once Crew's verified `<app-root>/data` directory and the Mansion
registry are available; until then the routes answer `workflow_unavailable`.
The confinement canary and the room gate start with the application.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from pathlib import Path

from aiohttp import web

from haunted_house.adapters.command_runner import ApprovedActionExecutor, ConfinedRunner
from haunted_house.adapters.crew_chat import CrewChat
from haunted_house.adapters.gateway_client import MANIFEST_PATH, GatewayClient
from haunted_house.adapters.guarded_filesystem import GuardedFilesystem
from haunted_house.adapters.guardrail_port import GuardrailPort
from haunted_house.adapters.mansion_metadata import (
    MetadataUnavailable,
    resolve_app_data_directory,
)
from haunted_house.adapters.mansion_service import MansionService, MansionServiceError
from haunted_house.adapters.room_tool_service import RoomToolService
from haunted_house.adapters.seance_log_store import SeanceLogStore
from haunted_house.adapters.seance_service import SeanceService
from haunted_house.adapters.session_bindings import SessionBindingStore
from haunted_house.adapters.session_reconciler import SessionReconciler
from haunted_house.adapters.settings import Settings
from haunted_house.adapters.workflow_service import (
    WorkflowMansion,
    WorkflowService,
)
from haunted_house.room_gate import RoomGate
from haunted_house.core.mansion_planner import ProjectStatus
from haunted_house.room_ghost_wiring import RoomGhostOptions, RoomGhostSeams, build_room_ghosts
from haunted_house.services.room_ghosts import RoomGhosts
from haunted_house.services.room_tool_answers import RoomToolAnswerer, answer_bound_slot
from haunted_house.services.turn_watcher import TurnWatcher

__all__ = ["LiveWorkflow", "live_workflow"]

log = logging.getLogger(__name__)

_REFUSED_MANSION_CODES = frozenset(
    {
        "invalid_mansion_name",
        "mansion_not_registered",
        "mansion_missing",
        "mansion_conflict",
        "symlink_escape",
    }
)


@dataclass(frozen=True, slots=True)
class LiveWorkflow:
    """What the application needs: a service provider and a lifecycle."""

    provider: Callable[[], WorkflowService | None]
    lifecycle: Callable[[web.Application], AsyncIterator[None]]
    runner: ConfinedRunner
    # The Room Ghosts services (None while the workflow cannot be built).
    room_ghosts: Callable[[], RoomGhosts | None] = lambda: None
    # The running TurnWatcher, or None outside the application's lifetime.
    turn_watcher: Callable[[], TurnWatcher | None] = lambda: None


def live_workflow(
    settings: Settings,
    *,
    gateway: Callable[[], GatewayClient | None],
    mansions: MansionService | Callable[[], MansionService | None],
    seance: SeanceService | None = None,
    app_root: Path | None = None,
    runner: ConfinedRunner | None = None,
    room_ghost_options: RoomGhostOptions = RoomGhostOptions(),
) -> LiveWorkflow:
    """Build the live workflow wiring.  Touches no file until it is used.

    `gateway` returns the application's current `GatewayClient`. `mansions`
    is the Mansion registry (or its provider); only a registered, ready
    Mansion is ever resolved, and its directory always comes from
    `settings.mansion_root`, never from a request. `seance` supplies Spec 2's
    bounded history reconciliation. `app_root` defaults to the working
    directory Crew starts the backend in. `room_ghost_options` are the Room
    Ghosts switches; the defaults keep cancellation, Session_Link, and the
    Séance Room off.
    """

    mansion_provider: Callable[[], MansionService | None] = (
        (lambda: mansions) if isinstance(mansions, MansionService) else mansions
    )
    confined = runner if runner is not None else ConfinedRunner(known_secrets=[settings.secret])
    built: dict[str, object] = {}

    def bindings() -> SessionBindingStore | None:
        store = built.get("bindings")
        if store is None:
            try:
                store = SessionBindingStore(resolve_app_data_directory(app_root))
            except MetadataUnavailable:
                return None
            built["bindings"] = store
        return store  # type: ignore[return-value]

    async def resolve(mansion_id: str) -> WorkflowMansion | None:
        registry = mansion_provider()
        if registry is None:
            raise RuntimeError("mansion registry unavailable")
        try:
            descriptor = await registry.open_mansion(mansion_id)
        except MansionServiceError as error:
            if error.code in _REFUSED_MANSION_CODES:
                return None
            raise RuntimeError("mansion registry unavailable") from None
        return WorkflowMansion(descriptor.name, descriptor.project_spec, settings.mansion_root)

    def provide() -> WorkflowService | None:
        service = built.get("service")
        if service is None:
            store = bindings()
            if store is None:
                # No verified app-data directory: no session could be bound.
                return None
            writer = SeanceLogStore(settings.mansion_root, known_secrets=[settings.secret])
            port = GuardrailPort(writer)
            chat = CrewChat(gateway)
            executor = ApprovedActionExecutor(
                port,
                lambda mansion_id: GuardedFilesystem(settings.mansion_root, mansion_id),
                confined,
                mansion_directory=lambda mansion_id: settings.mansion_root / mansion_id,
            )
            reconciler = SessionReconciler(
                port, chat, history=seance.reconcile if seance is not None else None
            )
            # Room Ghosts: the house validates and submits phase output, renders
            # each role's bounded prompt, and owns Tinker dispatch.
            seams = RoomGhostSeams(settings.mansion_root)
            service = WorkflowService(
                writer,
                mansions=resolve,
                crew=chat,
                executor=executor,
                reconciler=reconciler,
                bindings=store,
                validator=seams.validator,
                turns=seams.turns,
                implementation=seams.implementation,
                on_launch_failure=seams.on_launch_failure,
            )
            built["answerer"] = RoomToolAnswerer(
                port, chat, enabled=room_ghost_options.house_answers_room_tools
            )
            built["room_ghosts"] = build_room_ghosts(
                seams,
                writer=writer,
                workflow=service,
                crew=chat,
                bindings=store,
                mansions=resolve,
                # The installed app root holds the Room_Skills (RG-S2).
                app_root=app_root if app_root is not None else MANIFEST_PATH.parent,
                history=seance.reconcile if seance is not None else None,
                options=room_ghost_options,
            )
            built["service"] = service
            # Claims are required only because the Workshop above acquires them.
            built["rooms"] = RoomToolService(
                port, settings.mansion_root, operations=service, require_task_claims=True
            )
        return service  # type: ignore[return-value]

    def provide_room_ghosts() -> RoomGhosts | None:
        return built.get("room_ghosts") if provide() is not None else None  # type: ignore[return-value]

    async def registered_mansions() -> list[str]:
        registry = mansion_provider()
        if registry is None:
            return []
        return [
            descriptor.name
            for descriptor in await registry.list_mansions()
            if descriptor.status is ProjectStatus.READY
        ]

    async def answer_room_tools(mansion_id: str, slot: str) -> bool | None:
        answerer = built.get("answerer")
        return await answer_bound_slot(
            answerer if isinstance(answerer, RoomToolAnswerer) else None,
            bindings(),
            mansion_id,
            slot,
        )

    def provide_turn_watcher() -> TurnWatcher | None:
        return built.get("turn_watcher")  # type: ignore[return-value]

    async def lifecycle(_app: web.Application) -> AsyncIterator[None]:
        # Prove confinement once, before any command could ask for it.
        available = await asyncio.to_thread(confined.probe)
        if not available:
            log.warning(
                "process confinement is unavailable: command and git actions are disabled"
            )
        gate: RoomGate | None = None
        service = provide()
        store = bindings()
        rooms = built.get("rooms")
        if service is not None and store is not None and isinstance(rooms, RoomToolService):
            gate = RoomGate(rooms, store)
            try:
                await gate.start()
            except Exception as error:  # noqa: BLE001 - room tools then stay blocked
                gate = None
                log.warning("room gate could not start (%s)", type(error).__name__)
        else:
            log.warning("app data directory is unavailable: room tools are blocked")
        room_ghosts = provide_room_ghosts()
        if room_ghosts is not None:
            await room_ghosts.start()
        watcher: TurnWatcher | None = None
        if (
            room_ghosts is not None
            and seance is not None
            and room_ghost_options.turn_watcher_enabled
        ):
            watcher = TurnWatcher(
                active_slots=room_ghosts.active_slots,
                reconcile=seance.reconcile,
                settle=room_ghosts.pump,
                mansions=registered_mansions,
                answer=answer_room_tools,
            )
            room_ghosts.on_watch = watcher.watch
            await watcher.start()
            built["turn_watcher"] = watcher
        try:
            yield
        finally:
            if watcher is not None:
                built.pop("turn_watcher", None)
                if room_ghosts is not None:
                    room_ghosts.on_watch = None
                await watcher.stop()
            # Scheduler timers and cancellation confirmations end with the app.
            if room_ghosts is not None:
                await room_ghosts.stop()
            if gate is not None:
                await gate.stop()

    return LiveWorkflow(provide, lifecycle, confined, provide_room_ghosts, provide_turn_watcher)
