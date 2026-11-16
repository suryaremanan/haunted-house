"""The house answers non-risky room-tool prompts on its own bound sessions
(design decision 2026-11-16).

Real Spec 2 writer, Spec 4 WorkflowService, binding store and Room Ghosts;
only Crew is the fake gateway.  Every house answer is a canonical
``room_tool_answered`` record; risky tools, Crew built-ins, ambiguous names,
other Mansions, and the OFF setting are left for the human.
"""

from __future__ import annotations

import asyncio

from haunted_house.adapters.crew_chat import CrewChat
from haunted_house.core.guardrail_events import GuardrailEventKind, Phase
from haunted_house.core.room_catalog import EXECUTION_TOOL, PROPOSAL_TOOL
from haunted_house.services.room_tool_answers import (
    RoomToolAnswerer,
    answer_bound_slot,
    answer_id_for,
    house_tool_names,
)
from haunted_house.services.turn_watcher import TurnWatcher
from tests.room_ghost_stage import Play
from tests.workflow_support import MANSION, house

ARCHIVIST = "haunted-house:room-archivist"


def _run(scenario, tmp_path):
    async def main():
        async with house(tmp_path, room_ghosts=True) as h:
            return await scenario(Play(h))

    return asyncio.run(main())


def _answerer(play: Play, enabled: bool = True) -> RoomToolAnswerer:
    return RoomToolAnswerer(play.h.port, CrewChat(play.h.client), enabled=enabled)


def _approvals(play: Play) -> list[tuple[str, str, str]]:
    return [
        (body["request_id"], body["request_mid"], body["action"])
        for step, _path, body in play.h.crew.calls
        if step == "approve"
    ]


async def _answered_records(play: Play):
    read = await play.h.port.read(MANSION)
    return [record for record in read.domain.records if record.kind is GuardrailEventKind.ROOM_TOOL_ANSWERED]


def test_role_names_are_namespaced_and_never_risky():
    tinker = house_tool_names("tinker")
    assert set(tinker.values()) == {"list_room_files", "read_room_file", "write_room_file", "submit_phase_output"}
    archivist = house_tool_names("archivist")
    assert set(archivist.values()) == {
        "list_room_files", "read_room_file", "write_spec_document", "submit_phase_output",
    }
    for role in ("archivist", "draughtsman", "foreman", "tinker"):
        names = house_tool_names(role)
        assert not {EXECUTION_TOOL, PROPOSAL_TOOL} & set(names.values())
        # No bare tool name: every spelling names the room server.
        assert all("/" in name for name in names)
    assert "haunted-house:room-archivist/read_room_file" in archivist
    assert "@haunted-house:room-archivist/read_room_file" in archivist
    assert "room-archivist/read_room_file" in archivist
    assert house_tool_names("medium") == {}


def test_a_non_risky_prompt_is_recorded_then_answered_once(tmp_path):
    async def scenario(play: Play):
        room = await play.start(Phase.REQUIREMENTS)
        crew = play.h.crew
        crew.prompt(room.slot, "m-read-1", {"path": "README.md"}, approval_id="7",
                    tool_name="read_room_file", server=ARCHIVIST)
        answerer = _answerer(play)
        first = await answerer.answer(MANSION, room)
        again = await answerer.answer(MANSION, room)
        records = await _answered_records(play)
        read = await play.h.port.read(MANSION)
        return room, first, again, _approvals(play), records, read

    room, first, again, approvals, records, read = _run(scenario, tmp_path)
    assert first.answered == ((room.slot, "m-read-1", "read_room_file"),) and not first.failed
    assert again.answered == ()  # resolved now: nothing to answer twice
    assert approvals == [("7", "m-read-1", "approved")]
    (record,) = records
    assert record.data == {
        "answer_id": answer_id_for(room.slot, "m-read-1"),
        "session_slot": room.slot,
        "mid": "m-read-1",
        "tool": "read_room_file",
        "outcome": "approved",
        "actor": "house",
        "reason": "non_risky_room_tool",
    }
    # The log stays readable and the Door is untouched: nothing auto-advances.
    assert read.writable
    assert read.projection.phases[Phase.REQUIREMENTS].door.value == "sealed"


def test_risky_foreign_ambiguous_and_resolved_prompts_are_left_for_the_human(tmp_path):
    async def scenario(play: Play):
        room = await play.start(Phase.REQUIREMENTS)
        crew = play.h.crew
        prompts = [
            # The execution and proposal tools, even under this room's server.
            ("m-exec", EXECUTION_TOOL, ARCHIVIST),
            ("m-exec-t", EXECUTION_TOOL, "haunted-house:room-tinker"),
            ("m-prop", PROPOSAL_TOOL, "haunted-house:room-tinker"),
            # A tool this role is not granted (only the Tinker writes room files).
            ("m-write", "write_room_file", ARCHIVIST),
            # Another role's server.
            ("m-other", "read_room_file", "haunted-house:room-tinker"),
            # A bare name with no server, and a Crew built-in.
            ("m-bare", "read_room_file", None),
            ("m-shell", "execute_bash", None),
            ("m-fs", "fs_write", None),
        ]
        for mid, tool, server in prompts:
            crew.prompt(room.slot, mid, {"path": "x"}, approval_id=mid, tool_name=tool, server=server)
        crew.prompt(room.slot, "m-done", {"path": "x"}, approval_id="9", tool_name="read_room_file", server=ARCHIVIST)
        crew.resolve_externally(room.slot, "m-done", "rejected")
        report = await _answerer(play).answer(MANSION, room)
        # A binding is only ever answered for its own Mansion.
        foreign = await _answerer(play).answer("another-mansion", room)
        return report, foreign, _approvals(play), await _answered_records(play)

    report, foreign, approvals, records = _run(scenario, tmp_path)
    assert report.answered == () and foreign.answered == ()
    assert approvals == [] and records == []


def test_off_leaves_every_prompt_for_the_human(tmp_path):
    async def scenario(play: Play):
        room = await play.start(Phase.REQUIREMENTS)
        play.h.crew.prompt(room.slot, "m-read-1", {"path": "README.md"}, tool_name="read_room_file", server=ARCHIVIST)
        off = _answerer(play, enabled=False)
        report = await off.answer(MANSION, room)
        seam = await answer_bound_slot(off, play.h.bindings, MANSION, room.slot)
        pending = [
            message for message in play.h.crew.messages[room.slot]
            if message["role"] == "permission" and not message["meta"].get("resolved")
        ]
        return report, seam, _approvals(play), await _answered_records(play), pending

    report, seam, approvals, records, pending = _run(scenario, tmp_path)
    assert report.answered == () and seam is False
    assert approvals == [] and records == [] and len(pending) == 1


def test_the_watcher_answers_through_the_bound_slot_seam(tmp_path):
    async def scenario(play: Play):
        clock = [0.0]
        answerer = _answerer(play)
        watcher = TurnWatcher(
            active_slots=play.rooms.active_slots,
            reconcile=play.h.seance.reconcile,
            settle=play.rooms.pump,
            answer=lambda mansion_id, slot: answer_bound_slot(answerer, play.h.bindings, mansion_id, slot),
            clock=lambda: clock[0],
        )
        room = await play.start(Phase.REQUIREMENTS)
        watcher.watch(MANSION)
        play.h.crew.prompt(room.slot, "m-list-1", {}, approval_id="3", tool_name="list_room_files", server=ARCHIVIST)
        # An unknown slot has no binding: nothing is answered.
        unknown = await answer_bound_slot(answerer, play.h.bindings, MANSION, "slot-unknown")
        await watcher.tick()
        await watcher.idle()
        return unknown, _approvals(play), await _answered_records(play), watcher.interval(MANSION)

    unknown, approvals, records, interval = _run(scenario, tmp_path)
    assert unknown is False
    assert approvals == [("3", "m-list-1", "approved")]
    assert [record.data["tool"] for record in records] == ["list_room_files"]
    assert interval == 2.0  # an answer is progress: the base interval holds
