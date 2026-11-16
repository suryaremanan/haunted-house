"""Cancellation, explicit retry, and Session_Link through the wired services
(room-ghosts tasks 7.4, 10.4).

Cancellation (RG-S3) and existing-session navigation (RG-S4) ship disabled.
These tests cover both states: the shipped default, which answers
``contract_unavailable`` and sends nothing, and the enabled path against the
fake gateway's stop route, which is what flips on after live acceptance.

Validates: Requirements 11.2, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8.
"""

from __future__ import annotations

import asyncio

import pytest

from haunted_house.core.ghost_result import GhostStatus
from haunted_house.core.guardrail_events import Phase
from haunted_house.core.room_ghost_events import select_room_ghost_records
from haunted_house.services.room_ghost_service import RoomGhostError
from tests.room_ghost_runtime_support import WORKSHOP_TASKS
from tests.room_ghost_stage import Play, result_text
from tests.workflow_support import CLOCK_MS, MANSION, SPEC, house

FAST = {"confirm_seconds": 0.3, "poll_seconds": 0.01}
# The confirmed path holds Crew's stop reply across several HTTP round trips;
# a slow CI runner must not push it past the window into "unconfirmed".
CONFIRMABLE = {"confirm_seconds": 30.0, "poll_seconds": 0.01}


def _run(scenario, tmp_path, **options):
    async def main():
        async with house(tmp_path, room_ghosts=options or True) as h:
            h.crew.echo_names = True  # the slot key is the name the house chose
            return await scenario(Play(h))

    return asyncio.run(main())


def _tool_frame(slot: str, call: str = "toolu_01") -> dict:
    return {"type": "tool_call", "data": {"slot": slot, "tool": "read_room_file", "kind": "read",
                                          "is_shell": False, "tool_call_id": call}}


async def _settled(play: Play, run_id: str, attempts: int = 200) -> None:
    for _ in range(attempts):
        if any(item[0] == run_id for item in await play.terminals()):
            return
        await asyncio.sleep(0.01)
    raise AssertionError(f"{run_id} was never settled")


async def _cancel(play: Play, run_id: str, command_id: str = "cmd-cancel-00001") -> str:
    try:
        outcome = await play.rooms.cancel(
            MANSION, run_id, command_id=command_id, expected_version=await play.version()
        )
        return "duplicate" if outcome.duplicate else "accepted"
    except RoomGhostError as error:
        return error.code


def test_cancellation_ships_disabled_and_sends_nothing(tmp_path):
    async def scenario(play: Play):
        await play.open_workshop(WORKSHOP_TASKS, ["1.1"])
        before = await play.h.events()
        code = await _cancel(play, "task-1-1-a1")
        unknown = await _cancel(play, "no-such-run")
        body = await play.read()
        return code, unknown, before, await play.h.events(), play.h.crew.steps(), body

    code, unknown, before, after, steps, body = _run(scenario, tmp_path)
    # The contract is unavailable whatever the run is: nothing is revealed or sent.
    assert code == unknown == "contract_unavailable"
    assert "stop" not in steps and after == before
    run = body["runs"][-1]
    assert run["can_cancel"] is False and run["cancel_requested"] is False
    assert run["session_link"] is None


def test_a_confirmed_cancellation_blocks_the_run_and_releases_its_claim_once(tmp_path):
    async def scenario(play: Play):
        crew = play.h.crew
        await play.open_workshop(WORKSHOP_TASKS, ["1.1", "2.1"])
        tinker = play.tinker("1.1")
        assert (await play.h.ingest([_tool_frame(tinker.slot)])).status == "ok"
        history = await play.h.events()
        offered = (await play.read())["runs"][-1]
        gate = asyncio.Event()
        crew.hooks["stop"] = gate.wait
        first = await _cancel(play, "task-1-1-a1")
        pending = (await play.read())["runs"][-1]
        second = await _cancel(play, "task-1-1-a1", "cmd-cancel-00002")
        same = await _cancel(play, "task-1-1-a1")
        gate.set()
        await _settled(play, "task-1-1-a1")
        del crew.hooks["stop"]
        await play.rooms.pump(MANSION)
        body = await play.read()
        events = await play.h.events()
        records = select_room_ghost_records(events).records
        tool = await play.tool(tinker, "read_room_file", {"path": "README.md"})
        stops = crew.slots[tinker.slot].get("stops", [])
        calls = [call for call in crew.calls if call[0] == "stop"]
        return (offered, first, pending, second, same, history, events, records, body, tool, stops, calls,
                await play.terminals(), [room.run_id for room in play.tinkers()])

    (offered, first, pending, second, same, history, events, records, body, tool, stops, calls,
     terminals, runs) = _run(scenario, tmp_path, cancellation_enabled=True, **CONFIRMABLE)
    assert offered["can_cancel"] is True and offered["can_retry"] is False
    assert first == "accepted"
    assert pending["cancel_requested"] is True and pending["can_cancel"] is False
    # Never a second stop while one is pending; the same command is the same command.
    assert second == "cancel_pending" and same == "duplicate"
    assert len(stops) == 1 and set(stops[0]) == {"token"}  # bodyless, never forced
    assert calls[0][2] is None
    # Everything acknowledged before the cancellation is still there, unchanged.
    assert events[: len(history)] == history
    appended = [event.event_type for event in events[len(history):]]
    assert appended[0] == "ghost_progressed"
    assert events[len(history)].payload["progress_kind"] == "cancel_requested"
    assert ("task-1-1-a1", "blocked", "cancelled") in terminals
    released = [r for r in records if r.kind.value == "task_claim_released" and r.data["task_id"] == "1.1"]
    assert [r.data["outcome"] for r in released] == ["cancelled"]
    task = {t["task_id"]: t for t in body["task_plan"]["tasks"]}
    assert task["1.1"]["complete"] is False and task["1.1"]["outcome"]["status"] == "cancelled"
    # The dependent of a cancelled task is not dispatched (12.7).
    assert task["2.1"]["outcome"]["status"] == "queued" and runs == ["task-1-1-a1"]
    run = next(item for item in body["runs"] if item["run_id"] == "task-1-1-a1")
    assert run["can_retry"] is True and run["reason_code"] == "cancelled" and run["claim_paths"] == []
    # The cancelled session has no claim left: its tools are refused.
    assert (tool["ok"], tool["code"]) == (False, "task_claim_denied")


def test_an_unconfirmed_cancellation_blocks_the_run_and_retains_the_claim(tmp_path):
    async def scenario(play: Play):
        crew = play.h.crew
        await play.open_workshop(WORKSHOP_TASKS, ["1.1", "1.2", "1.3", "1.4"])
        crew.stop_reply = {"ok": True, "info": "no active turn"}  # nothing was stopped
        first = await _cancel(play, "task-1-1-a1")
        await _settled(play, "task-1-1-a1")
        # A stop that gets no answer inside the window is unconfirmed too.
        never = asyncio.Event()
        crew.hooks["stop"] = never.wait
        second = await _cancel(play, "task-1-2-a1", "cmd-cancel-00002")
        await _settled(play, "task-1-2-a1")
        del crew.hooks["stop"]
        await play.rooms.pump(MANSION)
        body = await play.read()
        try:
            await play.rooms.retry(
                MANSION, "task-1-1-a1", command_id="cmd-retry-00001", expected_version=await play.version()
            )
            retried = "accepted"
        except RoomGhostError as error:
            retried = error.code
        claims = await play.claims()
        stops = [call for call in crew.calls if call[0] == "stop"]
        return first, second, body, retried, claims, stops, await play.terminals(), [r.run_id for r in play.tinkers()]

    first, second, body, retried, claims, stops, terminals, runs = _run(
        scenario, tmp_path, cancellation_enabled=True, **FAST
    )
    assert first == second == "accepted"
    assert ("task-1-1-a1", "blocked", "cancel_unconfirmed") in terminals
    assert ("task-1-2-a1", "blocked", "cancel_unconfirmed") in terminals
    # The session may still be writing: its claim and its seat stay taken.
    assert claims["1.1"].active and claims["1.2"].active
    assert "task-1-4-a1" not in runs
    task = {t["task_id"]: t for t in body["task_plan"]["tasks"]}
    assert task["1.1"]["outcome"] == {
        "status": "blocked", "attempt": 1, "run_id": "task-1-1-a1", "reason_code": "cancel_unconfirmed",
    }
    run = next(item for item in body["runs"] if item["run_id"] == "task-1-1-a1")
    assert run["can_retry"] is False and run["claim_paths"] == ["src/guestbook/model.py"]
    assert retried == "cancel_unconfirmed"
    assert len(stops) == 2  # one per run, never repeated


def test_a_cancellation_left_by_a_restart_is_never_sent_again(tmp_path):
    async def before(play: Play):
        await play.open_workshop(WORKSHOP_TASKS, ["1.1"])
        never = asyncio.Event()
        play.h.crew.hooks["stop"] = never.wait
        assert await _cancel(play, "task-1-1-a1") == "accepted"
        await asyncio.sleep(0.02)
        return len([call for call in play.h.crew.calls if call[0] == "stop"])

    sent = _run(before, tmp_path, cancellation_enabled=True, confirm_seconds=30, poll_seconds=0.01)

    async def after(play: Play):
        await play.rooms.pump(MANSION)
        early = await play.terminals()
        return early, play.h.crew.steps()

    early, steps = _run(after, tmp_path, cancellation_enabled=True)
    assert sent == 1
    # Inside the window the restarted backend waits; it never sends a second stop.
    assert not any(item[0] == "task-1-1-a1" for item in early) and "stop" not in steps

    async def later(play: Play):
        await play.rooms.pump(MANSION)
        return await play.terminals(), play.h.crew.steps(), await play.claims()

    terminals, steps, claims = _run(
        later, tmp_path, cancellation_enabled=True, now_ms=lambda: CLOCK_MS + 31_000
    )
    assert ("task-1-1-a1", "blocked", "cancel_unconfirmed") in terminals
    assert "stop" not in steps and claims["1.1"].active


def test_a_phase_run_is_retried_in_a_fresh_session_at_most_three_times(tmp_path):
    async def scenario(play: Play):
        crew = play.h.crew
        slots, codes = [], []
        room = await play.start(Phase.REQUIREMENTS)
        for attempt in (1, 2, 3):
            slots.append(room.slot)
            await play.finish(room, result_text(room, status=GhostStatus.FAILED, reason="could_not_do_it"))
            body = await play.read()
            run = body["runs"][-1]
            assert (run["attempt"], run["can_retry"]) == (attempt, attempt < 3), run
            try:
                await play.rooms.retry(
                    MANSION, run["run_id"], command_id=f"cmd-retry-{attempt:05d}",
                    expected_version=await play.version(),
                )
                codes.append("accepted")
                room = await play.phase_session(Phase.REQUIREMENTS)
            except RoomGhostError as error:
                codes.append(error.code)
        # An older attempt can never be retried again.
        try:
            await play.rooms.retry(
                MANSION, "requirements-1", command_id="cmd-retry-99999", expected_version=await play.version()
            )
        except RoomGhostError as error:
            codes.append(error.code)
        return slots, codes, await play.terminals(), crew.steps(), await play.read()

    slots, codes, terminals, steps, body = _run(scenario, tmp_path, auto_correct=False)
    assert codes == ["accepted", "accepted", "attempt_limit", "run_superseded"]
    assert len(set(slots)) == 3 and steps.count("create_slot") == 3
    # Every attempt stays in the log with its own outcome.
    assert terminals == [
        ("requirements-1", "failed", "could_not_do_it"),
        ("requirements-2", "failed", "could_not_do_it"),
        ("requirements-3", "failed", "could_not_do_it"),
    ]
    assert [(run["run_id"], run["attempt"]) for run in body["runs"]] == [
        ("requirements-1", 1), ("requirements-2", 2), ("requirements-3", 3),
    ]
    assert [run["run_sequence"] for run in body["runs"]] == [1, 2, 3]


def test_a_task_gets_no_fourth_attempt(tmp_path):
    async def scenario(play: Play):
        await play.open_workshop(WORKSHOP_TASKS, ["1.1"])
        codes = []
        for attempt in (1, 2, 3):
            tinker = play.tinker("1.1", attempt=attempt)
            await play.finish(tinker, result_text(tinker, status=GhostStatus.FAILED, task_id="1.1", reason="broke"))
            try:
                await play.rooms.retry(
                    MANSION, tinker.run_id, command_id=f"cmd-retry-{attempt:05d}",
                    expected_version=await play.version(),
                )
                codes.append("accepted")
            except RoomGhostError as error:
                codes.append(error.code)
        await play.rooms.pump(MANSION)
        tasks = await play.tasks()
        runs = (await play.read())["runs"]
        return codes, tasks, runs, [room.slot for room in play.tinkers()]

    codes, tasks, runs, slots = _run(scenario, tmp_path)
    assert codes == ["accepted", "accepted", "attempt_limit"]
    assert tasks["1.1"]["outcome"] == {
        "status": "failed", "attempt": 3, "run_id": "task-1-1-a3", "reason_code": "broke",
    }
    tinkers = [run for run in runs if run["phase"] == "implementation"]
    assert [(run["run_id"], run["attempt"], run["can_retry"]) for run in tinkers] == [
        ("task-1-1-a1", 1, False), ("task-1-1-a2", 2, False), ("task-1-1-a3", 3, False),
    ]
    assert len(set(slots)) == 3  # each attempt had its own fresh session


def test_a_retry_command_is_idempotent_and_checked_against_the_view(tmp_path):
    async def scenario(play: Play):
        room = await play.start(Phase.REQUIREMENTS)
        codes = []
        for run_id, version, command in (
            ("requirements-1", None, "cmd-retry-00001"),   # still running
            ("no-such-run", None, "cmd-retry-00002"),
        ):
            try:
                await play.rooms.retry(MANSION, run_id, command_id=command, expected_version=await play.version())
            except RoomGhostError as error:
                codes.append(error.code)
        await play.finish(room, result_text(room, status=GhostStatus.FAILED, reason="nope"))
        try:
            await play.rooms.retry(MANSION, "requirements-1", command_id="cmd-retry-00003", expected_version=1)
        except RoomGhostError as error:
            codes.append(error.code)
        version = await play.version()
        first = await play.rooms.retry(MANSION, "requirements-1", command_id="cmd-retry-00004", expected_version=version)
        again = await play.rooms.retry(MANSION, "requirements-1", command_id="cmd-retry-00004", expected_version=version)
        return codes, first, again, play.h.crew.steps().count("create_slot")

    codes, first, again, created = _run(scenario, tmp_path, auto_correct=False)
    assert codes == ["run_active", "run_not_found", "stale_version"]
    assert first.run_id == "requirements-2" and again.duplicate is True
    assert created == 2


def test_a_session_link_names_the_existing_slot_and_never_creates_a_chat(tmp_path):
    async def scenario(play: Play):
        room = await play.start(Phase.REQUIREMENTS)
        created = play.h.crew.steps().count("create_slot")
        body = await play.read()
        again = await play.read()
        return room, body, again, created, play.h.crew.steps().count("create_slot"), play.h.crew.unknown

    room, body, again, created, later, unknown = _run(scenario, tmp_path, session_links_enabled=True)
    link = body["runs"][0]["session_link"]
    # The slot key itself: not a session key, a title, or a URL.
    assert link == room.slot == body["runs"][0]["session_slot"]
    assert not link.startswith("dashboard:") and "/" not in link and "?" not in link
    assert again["runs"] == body["runs"]
    assert later == created and unknown == []


def test_a_turn_crew_never_started_is_handled_by_the_house_deadline(tmp_path):
    clock = {"ms": CLOCK_MS}

    async def scenario(play: Play):
        crew = play.h.crew
        await play.open_workshop(WORKSHOP_TASKS, ["1.1", "1.2", "1.3"])
        one, two, three = play.tinker("1.1"), play.tinker("1.2"), play.tinker("1.3")
        await play.rooms.pump(MANSION)
        early = await play.terminals()
        clock["ms"] += 181_000
        # One turn was abandoned behind Crew's cap, one is visibly running, one is silent.
        crew.messages[one.slot].append(
            {"role": "error", "content": "", "meta": {"notice": "background_turn_abandoned"}}
        )
        crew.messages[two.slot].append({"role": "assistant", "content": "Reading the plan.", "meta": {}})
        await play.rooms.pump(MANSION)
        # The store stamps records with a fixed clock: put "now" back so the
        # run dispatched just now is not itself past the deadline.
        clock["ms"] = CLOCK_MS
        terminals = await play.terminals()
        tasks = await play.tasks()
        return early, terminals, tasks, await play.claims(), [room.run_id for room in play.tinkers()]

    early, terminals, tasks, claims, runs = _run(scenario, tmp_path, now_ms=lambda: clock["ms"])
    assert not any(item[0].startswith("task-") for item in early)
    assert ("task-1-1-a1", "blocked", "crew_capacity") in terminals
    assert ("task-1-3-a1", "blocked", "start_unconfirmed") in terminals
    assert not any(item[0] == "task-1-2-a1" for item in terminals)
    # Capacity is not an attempt: the task was dispatched again as attempt one.
    assert tasks["1.1"]["outcome"]["status"] == "active" and tasks["1.1"]["outcome"]["attempt"] == 1
    assert "task-1-1-a1-d2" in runs
    assert tasks["1.2"]["outcome"]["status"] == "active"
    # Silence blocks the task and gives its claim back; the Operator decides.
    assert tasks["1.3"]["outcome"] == {
        "status": "blocked", "attempt": 1, "run_id": "task-1-3-a1", "reason_code": "start_unconfirmed",
    }
    assert not claims["1.3"].active


def test_a_feedback_or_retry_crew_refuses_is_reported_and_stays_recoverable(tmp_path):
    async def scenario(play: Play):
        from tests.room_ghost_runtime_support import REQUIREMENTS
        from tests.room_ghost_stage import DOCUMENT

        crew = play.h.crew
        room = await play.start(Phase.REQUIREMENTS)
        await play.write_spec(room, REQUIREMENTS)
        await play.finish(room, result_text(room, {DOCUMENT[Phase.REQUIREMENTS]: REQUIREMENTS}))
        codes = []
        version = await play.version()
        crew.pressure("send_turn", "crew_queue_full", times=1)
        for _ in range(2):  # the same command twice: the failure is not turned into success
            try:
                await play.rooms.feedback(
                    MANSION, SPEC, Phase.REQUIREMENTS, "Shorter.", command_id="cmd-feedback-0001",
                    expected_version=version,
                )
                codes.append("accepted")
            except RoomGhostError as error:
                codes.append(error.code)
        body = await play.read()
        phase = (await play.h.view(reconcile=False)).read.projection.phases[Phase.REQUIREMENTS]
        # The refused run can be retried in a fresh session, or feedback sent again.
        refused = body["runs"][-1]
        await play.rooms.feedback(
            MANSION, SPEC, Phase.REQUIREMENTS, "Shorter.", command_id="cmd-feedback-0002",
            expected_version=await play.version(),
        )
        return codes, refused, phase, play.turns(room.slot), await play.terminals(), h_binding(play, room.slot)

    def h_binding(play: Play, slot: str):
        return play.h.binding(slot).run_id

    codes, refused, phase, turns, terminals, bound = _run(scenario, tmp_path)
    assert codes == ["crew_failed", "crew_failed"]
    assert (refused["run_id"], refused["reason_code"], refused["can_retry"]) == (
        "requirements-2", "crew_capacity", True,
    )
    # The Door was sealed before the Ghost was asked, and stays sealed.
    assert phase.status.value == "working" and phase.door.value == "sealed"
    assert ("requirements-2", "blocked", "crew_capacity") in terminals
    # The session kept its binding and took the second feedback as a new run.
    assert len(turns) == 2 and bound == "requirements-3"


def test_a_run_whose_session_binding_is_gone_is_ended_by_the_house(tmp_path):
    clock = {"ms": CLOCK_MS}

    async def scenario(play: Play):
        room = await play.start(Phase.REQUIREMENTS)
        play.h.bindings.remove(room.label)
        await play.rooms.pump(MANSION)
        early = await play.terminals()
        clock["ms"] += 181_000
        await play.rooms.pump(MANSION)
        return early, await play.terminals(), (await play.read())["runs"][0]

    early, terminals, run = _run(scenario, tmp_path, now_ms=lambda: clock["ms"], auto_correct=False)
    assert early == [] and terminals == [("requirements-1", "blocked", "session_lost")]
    assert run["can_retry"] is True and run["reason_code"] == "session_lost"
