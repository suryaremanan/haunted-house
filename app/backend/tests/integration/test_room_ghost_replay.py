"""Live and replayed Room Ghosts state from one Event_Log (room-ghosts task
10.6, backend side).

A whole feature is run through the wired services: three spec Doors, a
risky action decided through Spec 4, raw Crew frames from the recorded S6
session, a Workshop with a completed, a failed, and a retried task.  The
Event_Log that run left behind is then parsed by Spec 2's own parser and the
Room Ghosts answer is folded again from nothing but those records and the
Mansion's files, by services that can reach no gateway and no writer.

Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.7, 10.9, 10.12, 11.1,
11.6, 15.2.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from haunted_house.adapters.crew_chat import CrewChat
from haunted_house.core.ghost_result import GhostStatus
from haunted_house.core.ghost_state import reduce_ghost_snapshot
from haunted_house.core.guardrail_events import Phase
from haunted_house.core.seance_log_parser import parse_event_log
from haunted_house.core.workflow_dto import workflow_projection_to_json
from haunted_house.room_ghost_wiring import RoomGhostSeams, build_room_ghosts
from haunted_house.services.terminal_gate import terminal_outcome
from tests.guardrail_support import MemoryWriter
from tests.integration.test_room_ghosts_conformance import RecordingWriter
from tests.room_ghost_runtime_support import WORKSHOP_TASKS
from tests.room_ghost_stage import Play, result_text
from tests.room_projection_contract import refusal_path
from tests.workflow_support import APP_KEY, CLOCK_MS, MANSION, SPEC, house, tinker_delete

REPO = Path(__file__).resolve().parents[4]
S6 = REPO / "spikes" / "fixtures" / "s6-app-session-approval.jsonl"
APP_ROOT = Path(__file__).resolve().parents[3]


def _s6_frames(slot: str) -> list[dict[str, Any]]:
    """The recorded S6 tool frames, addressed to the session under test.

    Only the slot is rewritten, the way a real session would carry its own;
    every other field is Crew's, untouched, for Spec 2 to normalize.
    """

    frames = []
    for line in S6.read_text(encoding="utf-8").splitlines():
        frame = json.loads(line)["frame"]
        data = frame.get("data")
        if frame.get("type") in ("tool_call", "tool_result") and isinstance(data, dict):
            frames.append({"type": frame["type"], "data": {**data, "slot": slot}})
    return frames


class ReadOnlyLog(MemoryWriter):
    """A replay source: the parsed records, and no way to append."""

    async def append_candidates(self, mansion_id, candidates):
        raise AssertionError("replay appended a record")

    async def compare_and_append(self, mansion_id, expected_sequence, candidates):
        raise AssertionError("replay appended a record")


class NoGateway:
    """Any call is a failed test: replay may not reach Crew."""

    def __getattr__(self, name: str):
        raise AssertionError(f"replay called the gateway ({name})")


async def _feature(play: Play) -> dict[str, Any]:
    h = play.h
    await play.open_workshop(WORKSHOP_TASKS, ["1.1", "1.2", "1.3"])
    one, two, three = play.tinker("1.1"), play.tinker("1.2"), play.tinker("1.3")
    # Raw Crew frames of a real recorded session: Spec 2 ingest, exactly once.
    frames = _s6_frames(one.slot)
    first = await h.ingest(frames)
    again = await h.ingest(frames)
    # A risky action inside the claim, decided by the Operator through Spec 4.
    await play.write_file(two, "src/guestbook/store.py", "old\n")
    proposed = await play.tool(two, "propose_risky_action", {"action": tinker_delete("src/guestbook/store.py")})
    await h.decide_risky(proposed["proposal_id"], proposed["action_digest"])
    ran = await play.tool(
        two, "execute_approved_action",
        {"proposal_id": proposed["proposal_id"], "action": tinker_delete("src/guestbook/store.py")},
    )
    await play.complete_task(one, "1.1", {"src/guestbook/model.py": "class Entry: ...\n"})
    await play.complete_task(two, "1.2", {"src/guestbook/store.py": "class Store: ...\n"})
    await play.finish(three, result_text(three, status=GhostStatus.FAILED, task_id="1.3", reason="tests_failed"))
    await play.rooms.retry(MANSION, "task-1-3-a1", command_id="cmd-retry-00001", expected_version=await play.version())
    live = await play.read()
    workflow = (await h.view(reconcile=False)).to_json()
    events = await h.events()
    snapshots = {
        ghost: reduce_ghost_snapshot(events, MANSION, ghost)
        for ghost in ("archivist", "draughtsman", "foreman", "tinker-1", "tinker-2", "tinker-3")
    }
    logs = sorted(h.mansion.rglob("*.jsonl"))
    return {
        "live": live, "workflow": workflow, "snapshots": snapshots, "events": events,
        "first": first, "again": again, "ran": ran, "logs": logs,
        "log_bytes": logs[0].read_bytes() if logs else b"",
        "submitted": list(h.writer.submitted), "root": h.root,
        "capabilities": [room.capability for room in play.tinkers()],
        "calls": len(h.crew.calls),
    }


def test_live_and_replayed_room_state_agree_from_one_event_log(tmp_path):
    async def main():
        async with house(tmp_path, room_ghosts=True, wrap_writer=RecordingWriter) as h:
            h.crew.echo_names = True
            notes = await _feature(Play(h))

        # --- replay: Spec 2's parser, a read-only source, no gateway ---------------
        parsed = parse_event_log(notes["log_bytes"])
        source = ReadOnlyLog()
        source.events = list(parsed.events)
        seams = RoomGhostSeams(notes["root"])

        async def resolve(mansion_id: str):
            from haunted_house.adapters.workflow_service import WorkflowMansion

            return WorkflowMansion(MANSION, SPEC, notes["root"]) if mansion_id == MANSION else None

        replayed = build_room_ghosts(
            seams, writer=source, workflow=None, crew=CrewChat(NoGateway()),  # type: ignore[arg-type]
            bindings=lambda: None, mansions=resolve, app_root=APP_ROOT, now_ms=lambda: CLOCK_MS,
        )
        notes["replay"] = await replayed.ghosts.projection(MANSION, SPEC)
        read = await replayed.ghosts._port.read(MANSION)  # noqa: SLF001
        notes["replay_workflow"] = workflow_projection_to_json(
            read.projection, mansion_id=MANSION, events=read.events
        )
        notes["replay_snapshots"] = {
            ghost: reduce_ghost_snapshot(read.events, MANSION, ghost) for ghost in notes["snapshots"]
        }
        notes["parsed"] = parsed
        return notes

    notes = asyncio.run(main())
    live, replay = notes["live"], notes["replay"]

    # One log, whole and valid.
    assert len(notes["logs"]) == 1
    parsed = notes["parsed"]
    assert parsed.integrity_failure_line is None and not parsed.diagnostics
    # What the live house folded is Spec 2's selection of exactly these records.
    assert {event.record_id for event in notes["events"]} <= {event.record_id for event in parsed.events}

    # The replayed answer is one the dashboard accepts and equals the live one.
    assert refusal_path(replay, MANSION, SPEC) is None
    assert replay["version"] == live["version"] == notes["workflow"]["version"]
    assert replay["documents"] == live["documents"]
    assert replay["task_plan"] == live["task_plan"]

    def comparable(run: dict) -> dict:
        # Display-only memory of the live process, and controls replay never offers.
        return {key: value for key, value in run.items() if key != "summary"}

    assert [comparable(run) for run in replay["runs"]] == [comparable(run) for run in live["runs"]]
    assert all(run["summary"] is None for run in replay["runs"])
    # Spec 4's projection (Doors, the decided risky action) folds to the same wire form.
    assert notes["replay_workflow"]["phases"] == notes["workflow"]["phases"]
    assert notes["replay_workflow"]["risky_proposals"] == notes["workflow"]["risky_proposals"]
    assert [door["door"]["status"] for door in notes["workflow"]["phases"]] == ["open", "open", "open", "sealed"]
    assert notes["workflow"]["risky_proposals"][0]["decision"]["outcome"] == "approved"
    # Spec 2's Ghost_Snapshot is the same fold of the same records.
    assert notes["replay_snapshots"] == notes["snapshots"]
    assert notes["snapshots"]["archivist"].state == "done"
    assert notes["snapshots"]["tinker-3"].state == "failed"
    # The retried task's fresh attempt took the first free seat.
    assert notes["snapshots"]["tinker-1"].state == "working"
    assert notes["snapshots"]["tinker-1"].run_id == "task-1-3-a2"

    # What the run actually was.
    tasks = {task["task_id"]: task for task in live["task_plan"]["tasks"]}
    assert tasks["1.1"]["complete"] and tasks["1.2"]["complete"] and not tasks["1.3"]["complete"]
    assert tasks["1.3"]["outcome"] == {"status": "active", "attempt": 2, "run_id": "task-1-3-a2", "reason_code": None}
    assert notes["ran"]["ok"] is True

    # Raw frames entered through Spec 2 ingest once; a redelivery adds no record.
    assert notes["first"].status == "ok" and len(notes["first"].events) >= 2
    assert notes["again"].status == "ok"
    assert set(notes["again"].duplicate_record_ids) == {event.record_id for event in notes["first"].events}
    crew = [event for event in notes["events"] if event.source.origin == "crew"]
    assert len({event.record_id for event in crew}) == len(crew)

    # One canonical writer: every house record of the run went through it.
    house_records = [event for event in parsed.events if event.source.origin == "house"]
    assert len(notes["submitted"]) == len(house_records)
    # No successful terminal record precedes the turn end that caused it.
    by_id = {event.event_id: event for event in notes["events"]}
    for event in notes["events"]:
        outcome = terminal_outcome(event)
        if outcome is not None and outcome[0] == "completed":
            causes = [by_id[cause] for cause in event.caused_by]
            assert causes and all(
                cause.event_type == "crew_turn_ended" and cause.sequence < event.sequence for cause in causes
            )
    completed = [
        event.scope for event in notes["events"]
        if (terminal_outcome(event) or ("", ""))[0] == "completed"
    ]
    assert len(completed) == len(set(completed))  # at most one per logical run

    # The log holds no credential, capability, document body, or host path.
    text = notes["log_bytes"].decode("utf-8")
    assert APP_KEY not in text and str(tmp_path) not in text and "/Users/" not in text
    assert not any(capability in text for capability in notes["capabilities"])
    assert "class Entry" not in text and "Requirements Document" not in text
    assert "tests_failed" in text  # stable codes, yes; content, no
