"""Drives the wired Room Ghosts services the way Crew and the dashboard do.

Built on ``workflow_support.house(room_ghosts=...)``: the real Spec 2 file
writer and ingest, the real Spec 4 WorkflowService, guarded filesystem and
binding store, the real Room Ghosts services, and a fake Crew gateway that
records every call.  ``Play`` plays the two outside parties:

- the Ghost: it writes through the same guarded access the room MCP tools
  use and leaves its final message in the fake session's history;
- the dashboard: it forwards Crew's raw ``chat_done`` frame to Spec 2 ingest
  (the only place a raw frame may go) and reads the Room Ghosts answer.

Nothing here normalizes a frame or talks to a real gateway.
"""

from __future__ import annotations

from typing import Any

from haunted_house.adapters.room_tool_service import RoomToolService
from haunted_house.adapters.session_bindings import RoomBinding
from haunted_house.core.ghost_result import (
    ArtifactRef,
    GhostResult,
    GhostStatus,
    print_ghost_result,
)
from haunted_house.core.guardrail_events import Phase
from haunted_house.services.terminal_gate import terminal_outcome
from tests.room_ghost_runtime_support import DESIGN, REQUIREMENTS, chat_done, sha256_text
from tests.room_projection_contract import refusal_path
from tests.workflow_support import MANSION, SPEC

DOCUMENT = {
    Phase.REQUIREMENTS: f".kiro/specs/{SPEC}/requirements.md",
    Phase.DESIGN: f".kiro/specs/{SPEC}/design.md",
    Phase.TASKS: f".kiro/specs/{SPEC}/tasks.md",
}


def result_text(
    room: RoomBinding,
    artifacts: dict[str, str] | None = None,
    *,
    status: GhostStatus = GhostStatus.READY,
    task_id: str | None = None,
    reason: str | None = None,
    summary: str = "Done.",
) -> str:
    """A Ghost's final message for the run ``room`` is bound to."""

    return print_ghost_result(
        GhostResult(
            schema_version=1,
            run_id=room.run_id,
            status=status,
            summary=summary,
            artifacts=tuple(
                ArtifactRef(path, sha256_text(text)) for path, text in (artifacts or {}).items()
            ),
            task_id=task_id,
            reason_code=reason,
        )
    )


class Play:
    def __init__(self, h: Any) -> None:
        self.h = h
        self.rooms = h.rooms
        # Live wiring: Tinker calls pass the Task_Claim_Gate first.
        self.tools = RoomToolService(h.port, h.root, operations=h.service, require_task_claims=True)
        self._turn = 0

    # --- reads ---------------------------------------------------------------------------

    async def read(self) -> dict[str, Any]:
        """The Room Ghosts answer; always one the dashboard parser accepts."""

        body = await self.rooms.read(MANSION, SPEC)
        assert refusal_path(body, MANSION, SPEC) is None, refusal_path(body, MANSION, SPEC)
        workflow = await self.h.view(reconcile=False)
        # Never behind the workflow projection, and equal once nothing moves.
        assert body["version"] <= workflow.version
        return body

    async def version(self) -> int:
        return (await self.h.view(reconcile=False)).version

    async def events(self, *types: str) -> list[Any]:
        return [event for event in await self.h.events() if not types or event.event_type in types]

    async def terminals(self) -> list[tuple[str, str, str]]:
        """``(run_id, status, code)`` of every house terminal, in order."""

        found = []
        for event in await self.h.events():
            outcome = terminal_outcome(event)
            if outcome is not None:
                found.append((event.scope.run_id, *outcome))
        return found

    def session(self, slot: str) -> RoomBinding:
        return self.h.binding(slot)

    async def phase_session(self, phase: Phase) -> RoomBinding:
        """The session of the phase's newest registered run."""

        facts = self.rooms.ghosts.facts(await self.h.port.read(MANSION))
        run = facts.latest_phase_run(phase)
        assert run is not None
        return self.session(run.scope.session_slot)

    def tinkers(self) -> list[RoomBinding]:
        found = [self.h.bindings.load(f"dashboard:{key}") for key in self.h.crew.slots]
        return sorted(
            (item for item in found if item is not None and item.role == "tinker"),
            key=lambda item: (item.run_sequence, item.ghost),
        )

    def turns(self, slot: str) -> list[str]:
        return list(self.h.crew.slots[slot]["turns"])

    # --- the Ghost -------------------------------------------------------------------------

    async def write_spec(self, room: RoomBinding, text: str):
        known = (await self.h.view(reconcile=False)).read.projection.documents.get(DOCUMENT[room.phase])
        outcome = await self.h.write_spec(room, text, known.revision if known is not None else 0)
        assert outcome.status == "written", outcome
        return outcome

    async def tool(self, room: RoomBinding, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """One room tool call as the MCP gate's backend half answers it."""

        return await self.tools.call(room, name, arguments)

    async def write_file(self, room: RoomBinding, path: str, text: str, **more: Any) -> dict[str, Any]:
        """A Tinker's ``write_room_file`` with the digest it last read."""

        arguments = {"path": path, "content": text, "expected_sha256": None, **more}
        if "expected_sha256" not in more:
            read = await self.tool(room, "read_room_file", {"path": path})
            arguments["expected_sha256"] = read.get("sha256") if read.get("ok") else None
        return await self.tool(room, "write_room_file", arguments)

    def say(self, room: RoomBinding, text: str) -> None:
        self.h.crew.answer(room.slot, text)

    # --- the dashboard ---------------------------------------------------------------------

    async def turn_ended(self, room: RoomBinding, **frame: Any):
        """Forward Crew's raw ``chat_done`` through Spec 2 ingest, then pump."""

        self._turn += 1
        outcome = await self.h.ingest(
            [chat_done(room.slot, turn=self._turn, generation=f"gen-{self._turn}", **frame)]
        )
        assert outcome.status == "ok", outcome
        await self.rooms.pump(MANSION)
        return outcome.events[0]

    async def finish(self, room: RoomBinding, final_text: str) -> None:
        self.say(room, final_text)
        await self.turn_ended(room)

    # --- whole steps ------------------------------------------------------------------------

    async def start(self, phase: Phase) -> RoomBinding:
        await self.h.start(phase)
        return await self.phase_session(phase)

    async def pass_phase(self, phase: Phase, text: str) -> RoomBinding:
        """Start a spec phase, let its Ghost deliver ``text``, approve the Door."""

        room = await self.start(phase)
        await self.write_spec(room, text)
        await self.finish(room, result_text(room, {DOCUMENT[phase]: text}))
        await self.h.decide_door(True, phase=phase)
        return room

    async def open_workshop(self, tasks: str, task_ids: list[str] | None = None) -> None:
        """Approve the three spec Doors and start the Workshop."""

        await self.pass_phase(Phase.REQUIREMENTS, REQUIREMENTS)
        await self.pass_phase(Phase.DESIGN, DESIGN)
        await self.pass_phase(Phase.TASKS, tasks)
        await self.rooms.start_workshop(
            MANSION, SPEC, task_ids or [], command_id=self.command_id(),
            expected_version=await self.version(),
        )

    def command_id(self) -> str:
        self._turn += 1
        return f"cmd-room-{self._turn:05d}"

    async def complete_task(self, room: RoomBinding, task_id: str, files: dict[str, str]) -> None:
        for path, text in files.items():
            written = await self.write_file(room, path, text)
            assert written["ok"], written
        await self.finish(room, result_text(room, files, task_id=task_id))

    async def claims(self) -> dict[str, Any]:
        """Every claim of the Mansion, by task id (newest per task)."""

        ledger = self.rooms.ghosts.facts(await self.h.port.read(MANSION)).ledger
        return {
            claim.task_id: claim
            for claim in sorted(ledger.claims.values(), key=lambda item: item.acquired_sequence)
        }

    async def tasks(self) -> dict[str, dict[str, Any]]:
        body = await self.read()
        assert body["task_plan"] is not None
        return {task["task_id"]: task for task in body["task_plan"]["tasks"]}

    def tinker(self, task_id: str, *, attempt: int | None = None) -> RoomBinding:
        """The newest Tinker session whose run is for ``task_id``."""

        marker = f"task-{task_id.replace('.', '-')}-a{attempt if attempt is not None else ''}"
        found = [room for room in self.tinkers() if room.run_id.startswith(marker)]
        assert found, (task_id, [room.run_id for room in self.tinkers()])
        return found[-1]
