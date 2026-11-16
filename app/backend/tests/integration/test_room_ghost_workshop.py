"""The parallel Workshop through the wired services (room-ghosts tasks 7.3,
10.3).

The scheduler, claims, Task_Claim_Gate, terminal gate, and checkbox writer
are the real ones over the real Spec 2 writer; only Crew is fake.  A Tinker
is played through the same ``RoomToolService`` the room MCP gate calls, with
task claims required, as in the live backend.

Validates: Requirements 7.9, 7.10, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8,
9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 12.7.
"""

from __future__ import annotations

import asyncio
import json
import re

import pytest

from haunted_house.core.ghost_result import GhostStatus
from haunted_house.core.guardrail_events import Phase
from haunted_house.core.room_ghost_events import select_room_ghost_records
from haunted_house.services.room_ghost_service import RoomGhostError
from tests.room_ghost_runtime_support import DESIGN, REQUIREMENTS, WORKSHOP_TASKS
from tests.room_ghost_stage import Play, result_text
from tests.workflow_support import MANSION, SPEC, house, tinker_delete

FILES = {
    "1.1": "src/guestbook/model.py",
    "1.2": "src/guestbook/store.py",
    "1.3": "src/guestbook/render.py",
    "1.4": "src/guestbook/feed.py",
    "2.1": "src/guestbook/app.py",
    "2.2": "tests/test_store.py",
    "2.3": "src/guestbook/templates/base.html",
}


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def _run(scenario, tmp_path, **options):
    async def main():
        async with house(tmp_path, room_ghosts=options or True) as h:
            return await scenario(Play(h))

    return asyncio.run(main())


def _assignment(prompt: str) -> dict:
    line = next(item for item in prompt.splitlines() if item.startswith("ASSIGNMENT: "))
    return json.loads(line.removeprefix("ASSIGNMENT: "))


async def _done(play: Play, task_id: str) -> None:
    room = play.tinker(task_id)
    await play.complete_task(room, task_id, {FILES[task_id]: f"# {task_id}\n"})


def test_three_disjoint_tasks_start_and_the_fourth_waits_for_a_seat(tmp_path):
    async def scenario(play: Play):
        await play.open_workshop(WORKSHOP_TASKS)
        tinkers = play.tinkers()
        prompts = {room.run_id: play.turns(room.slot)[0] for room in tinkers}
        tasks = await play.tasks()
        body = await play.read()
        phase = (await play.h.view(reconcile=False)).read.projection.phases[Phase.IMPLEMENTATION]
        # One finishes: its checkbox is written, its claim released, and the
        # queued fourth task takes the freed seat.
        await _done(play, "1.1")
        after = await play.tasks()
        seats = [(room.ghost, room.run_id) for room in play.tinkers()]
        return tinkers, prompts, tasks, body, phase, after, seats, await play.claims()

    tinkers, prompts, tasks, body, phase, after, seats, claims = _run(scenario, tmp_path)
    assert [(room.ghost, room.run_id) for room in tinkers] == [
        ("tinker-1", "task-1-1-a1"), ("tinker-2", "task-1-2-a1"), ("tinker-3", "task-1-3-a1"),
    ]
    assert phase.status.value == "working" and phase.session_slot == tinkers[0].slot
    for room, task_id in zip(tinkers, ("1.1", "1.2", "1.3")):
        prompt = prompts[room.run_id]
        assert prompt.startswith('<room-skill name="scoped-implementation">')
        assignment = _assignment(prompt)
        # Exactly one Selected_Task, its claim, and the approved upstream digests.
        assert assignment["task_id"] == task_id and assignment["attempt"] == 1
        assert assignment["claim"] == list(tasks[task_id]["writes"])
        assert [item["path"].rsplit("/", 1)[1] for item in assignment["upstream"]] == [
            "requirements.md", "design.md", "tasks.md",
        ]
        assert assignment["expected_revisions"][0] == {"path": FILES[task_id], "sha256": None}
        # No other task's title or claim is in this Tinker's prompt.
        others = [tasks[other] for other in tasks if other != task_id]
        own = prompt.split("</room-skill>", 1)[1]
        assert not any(other["title"] in own for other in others)
        assert not any(other["writes"][0] in own for other in others)
    assert [tasks[t]["outcome"]["status"] for t in ("1.1", "1.2", "1.3", "1.4")] == [
        "active", "active", "active", "queued",
    ]
    assert all(tasks[t]["selected"] for t in tasks)
    assert tasks["2.1"]["outcome"] == {"status": "queued", "attempt": 0, "run_id": None, "reason_code": None}
    runs = {run["run_id"]: run for run in body["runs"] if run["phase"] == "implementation"}
    assert set(runs) == {"task-1-1-a1", "task-1-2-a1", "task-1-3-a1"}
    assert runs["task-1-3-a1"]["claim_paths"] == ["src/guestbook/render.py", "src/guestbook/templates/*.html"]
    assert all(run["task_id"] and not run["can_retry"] and not run["can_cancel"] for run in runs.values())
    # After the completion.
    assert after["1.1"]["complete"] is True and after["1.1"]["outcome"]["status"] == "complete"
    assert after["1.4"]["outcome"]["status"] == "active"
    assert seats[-1] == ("tinker-1", "task-1-4-a1")
    assert claims["1.1"].release_outcome == "complete" and claims["1.4"].active


def test_a_wave_is_a_barrier_and_the_house_submits_the_finished_workshop(tmp_path):
    async def scenario(play: Play):
        await play.open_workshop(WORKSHOP_TASKS)
        for task_id in ("1.1", "1.2", "1.3"):
            await _done(play, task_id)
        mid = await play.tasks()
        started_mid = [room.run_id for room in play.tinkers()]
        await _done(play, "1.4")
        second = [room.run_id for room in play.tinkers()]
        for task_id in ("2.1", "2.2", "2.3"):
            await _done(play, task_id)
        projection = (await play.h.view(reconcile=False)).read.projection
        records = select_room_ghost_records(await play.h.events()).records
        tasks_md = (play.h.mansion / ".kiro" / "specs" / SPEC / "tasks.md").read_text()
        return mid, started_mid, second, projection, records, tasks_md, await play.read()

    mid, started_mid, second, projection, records, tasks_md, body = _run(scenario, tmp_path)
    # Wave 1 does not start while task 1.4 of wave 0 is unfinished, seats or not.
    assert mid["1.4"]["outcome"]["status"] == "active"
    assert all(mid[t]["outcome"]["status"] == "queued" for t in ("2.1", "2.2", "2.3"))
    assert not any(run_id.startswith("task-2-") for run_id in started_mid)
    assert sorted(run_id for run_id in second if run_id.startswith("task-2-")) == [
        "task-2-1-a1", "task-2-2-a1", "task-2-3-a1",
    ]
    # Every box is checked exactly once and nothing else in the plan changed.
    assert tasks_md.count("- [x]") == 7 and not re.search(r"- \[ \]\*? [0-9]+\.[0-9]+ ", tasks_md)
    released = [r for r in records if r.kind.value == "task_claim_released"]
    acquired = [r for r in records if r.kind.value == "task_claim_acquired"]
    assert len(acquired) == 7 and len(released) == 7
    assert len({r.entity_id for r in released}) == 7  # each claim released exactly once
    assert {r.data["outcome"] for r in released} == {"complete"}
    # The house, not a Tinker, submitted the implementation output.
    implementation = projection.phases[Phase.IMPLEMENTATION]
    assert implementation.status.value == "waiting" and implementation.proposal.status == "pending"
    assert implementation.proposal.document_path in FILES.values()
    assert all(task["complete"] for task in body["task_plan"]["tasks"])
    assert body["task_plan"]["waves"] == [[], []] or all(
        task["wave"] is not None for task in body["task_plan"]["tasks"]
    )


def test_a_task_claim_only_narrows_what_a_tinker_may_do(tmp_path):
    async def scenario(play: Play):
        await play.open_workshop(WORKSHOP_TASKS)
        one, two = play.tinker("1.1"), play.tinker("1.2")
        outside = await play.write_file(one, FILES["1.2"], "stolen\n")
        spec = await play.write_file(one, f".kiro/specs/{SPEC}/tasks.md", "- [x] 1.1\n")
        no_digest = await play.tool(one, "write_room_file", {"path": FILES["1.1"], "content": "x\n"})
        first = await play.write_file(one, FILES["1.1"], "v1\n")
        stale = await play.write_file(one, FILES["1.1"], "v2\n", expected_sha256="0" * 64)
        on_disk = (play.h.mansion / FILES["1.1"]).read_text()
        # A risky action outside the claim is refused before Spec 4 sees it.
        foreign = await play.tool(two, "propose_risky_action", {"action": tinker_delete(FILES["1.1"])})
        # Inside the claim it still needs the Operator: Spec 4 decides.
        await play.write_file(two, FILES["1.2"], "old\n")
        proposed = await play.tool(two, "propose_risky_action", {"action": tinker_delete(FILES["1.2"])})
        early = await play.tool(
            two, "execute_approved_action",
            {"proposal_id": proposed["proposal_id"], "action": tinker_delete(FILES["1.2"])},
        )
        await play.h.decide_risky(proposed["proposal_id"], proposed["action_digest"])
        ran = await play.tool(
            two, "execute_approved_action",
            {"proposal_id": proposed["proposal_id"], "action": tinker_delete(FILES["1.2"])},
        )
        # A Tinker whose claim is gone can do nothing at all.
        await play.finish(one, result_text(one, status=GhostStatus.FAILED, task_id="1.1", reason="gave_up"))
        after = await play.tool(one, "read_room_file", {"path": FILES["1.1"]})
        kinds = await play.h.kinds()
        return outside, spec, no_digest, first, stale, on_disk, foreign, proposed, early, ran, after, kinds

    (outside, spec, no_digest, first, stale, on_disk, foreign, proposed, early, ran, after,
     kinds) = _run(scenario, tmp_path)
    assert (outside["ok"], outside["code"], outside["reason"]) == (False, "task_claim_denied", "outside_task_claim")
    assert spec["ok"] is False  # never a spec document, claim or not
    assert (no_digest["ok"], no_digest["code"]) == (False, "expected_digest_required")
    assert first["ok"] is True
    assert (stale["ok"], stale["code"]) == (False, "stale_revision") and on_disk == "v1\n"
    assert (foreign["ok"], foreign["code"]) == (False, "task_claim_denied")
    assert proposed["ok"] is True and proposed["status"] == "pending"
    assert early["ok"] is False and early.get("status") == "waiting"
    assert ran["ok"] is True and ran["consumed"] is True
    assert (after["ok"], after["code"], after["reason"]) == (False, "task_claim_denied", "task_claim_required")
    assert kinds.count("path_denied") >= 2


def test_concurrent_completions_lose_no_checkbox(tmp_path):
    async def scenario(play: Play):
        await play.open_workshop(WORKSHOP_TASKS)
        rooms = {task_id: play.tinker(task_id) for task_id in ("1.1", "1.2", "1.3")}
        for task_id, room in rooms.items():
            written = await play.write_file(room, FILES[task_id], f"# {task_id}\n")
            assert written["ok"]
            play.say(room, result_text(room, {FILES[task_id]: f"# {task_id}\n"}, task_id=task_id))
        # All three turn ends arrive before the house looks: one pump settles them.
        frames = [
            {"type": "chat_done", "data": {"slot": room.slot, "turn": n, "turn_gen": f"g{n}",
                                             "continuing": False, "needs_input": False}}
            for n, room in enumerate(rooms.values(), start=1)
        ]
        assert (await play.h.ingest(frames)).status == "ok"
        await asyncio.gather(play.rooms.pump(MANSION), play.rooms.pump(MANSION), play.rooms.pump(MANSION))
        tasks_md = (play.h.mansion / ".kiro" / "specs" / SPEC / "tasks.md").read_text()
        return tasks_md, await play.tasks(), await play.terminals(), await play.claims()

    tasks_md, tasks, terminals, claims = _run(scenario, tmp_path)
    assert tasks_md.count("- [x]") == 3
    assert all(tasks[t]["complete"] for t in ("1.1", "1.2", "1.3"))
    completed = [item for item in terminals if item[0].startswith("task-") and item[1] == "completed"]
    assert sorted(item[0] for item in completed) == ["task-1-1-a1", "task-1-2-a1", "task-1-3-a1"]
    assert all(claims[t].release_outcome == "complete" for t in ("1.1", "1.2", "1.3"))


def test_a_failed_task_blocks_its_dependents_until_an_explicit_retry(tmp_path):
    async def scenario(play: Play):
        await play.open_workshop(WORKSHOP_TASKS)
        failing = play.tinker("1.2")
        await play.finish(failing, result_text(failing, status=GhostStatus.FAILED, task_id="1.2", reason="tests_failed"))
        for task_id in ("1.1", "1.3", "1.4"):
            await _done(play, task_id)
        stuck = await play.tasks()
        runs = {run["run_id"]: run for run in (await play.read())["runs"]}
        started = [room.run_id for room in play.tinkers()]
        tasks_md = (play.h.mansion / ".kiro" / "specs" / SPEC / "tasks.md").read_text()
        await play.rooms.retry(
            MANSION, "task-1-2-a1", command_id="cmd-retry-00001", expected_version=await play.version()
        )
        retried = await play.tasks()
        fresh = play.tinker("1.2", attempt=2)
        await play.complete_task(fresh, "1.2", {FILES["1.2"]: "# fixed\n"})
        final = await play.tasks()
        return stuck, runs, started, tasks_md, retried, failing, fresh, final, [r.run_id for r in play.tinkers()]

    stuck, runs, started, tasks_md, retried, failing, fresh, final, all_runs = _run(scenario, tmp_path)
    assert stuck["1.2"]["complete"] is False
    assert stuck["1.2"]["outcome"] == {
        "status": "failed", "attempt": 1, "run_id": "task-1-2-a1", "reason_code": "tests_failed",
    }
    # Nothing of the next wave was dispatched and the box stayed unchecked.
    assert not any(run_id.startswith("task-2-") for run_id in started)
    assert all(stuck[t]["outcome"]["status"] == "queued" for t in ("2.1", "2.2", "2.3"))
    assert "- [ ] 1.2" in tasks_md
    assert runs["task-1-2-a1"]["can_retry"] is True and runs["task-1-2-a1"]["reason_code"] == "tests_failed"
    # The retry is a fresh slot, a greater Run_Sequence, and attempt two.
    assert retried["1.2"]["outcome"]["status"] == "active" and retried["1.2"]["outcome"]["attempt"] == 2
    assert fresh.slot != failing.slot and fresh.run_id == "task-1-2-a2"
    assert final["1.2"]["complete"] is True
    assert [run_id for run_id in all_runs if run_id.startswith("task-2-")]


def test_capacity_refusals_back_off_and_then_block_as_capacity_unavailable(tmp_path):
    clock = Clock()

    async def scenario(play: Play):
        crew = play.h.crew
        await play.pass_phase(Phase.REQUIREMENTS, REQUIREMENTS)
        await play.pass_phase(Phase.DESIGN, DESIGN)
        await play.pass_phase(Phase.TASKS, WORKSHOP_TASKS)
        # Tinker one starts.  Crew then refuses the next slot for capacity.
        await play.rooms.start_workshop(
            MANSION, SPEC, ["1.1"], command_id="cmd-start-000001", expected_version=await play.version()
        )
        crew.pressure("create_slot", "crew_active_limit", times=1, retry_after=3)
        await play.rooms.start_workshop(
            MANSION, SPEC, ["1.2"], command_id="cmd-start-000002", expected_version=await play.version()
        )
        first = (await play.tasks())["1.2"]
        creates = crew.steps().count("create_slot")
        # Inside the delay nothing is sent again, however often the house looks.
        await play.rooms.pump(MANSION)
        await play.rooms.pump(MANSION)
        held = crew.steps().count("create_slot")
        delays = [first["backpressure"]["next_delay_seconds"]]
        # Four more refusals: 2, 4, 8 seconds, then the task is blocked.
        crew.pressure("send_turn", "principal_queue_full", times=4)
        for _ in range(4):
            clock.now += 61
            await play.rooms.pump(MANSION)
            task = (await play.tasks())["1.2"]
            if task["backpressure"] is not None:
                delays.append(task["backpressure"]["next_delay_seconds"])
        blocked = (await play.tasks())["1.2"]
        clock.now += 600
        await play.rooms.pump(MANSION)
        after_block = crew.steps().count("create_slot")
        runs = {run["run_id"]: run for run in (await play.read())["runs"]}
        claims = [
            (r.kind.value, r.data.get("outcome"))
            for r in select_room_ghost_records(await play.h.events()).records
            if r.data.get("task_id") == "1.2"
        ]
        # The Operator selects it again: one more explicit try, same attempt number.
        await play.rooms.start_workshop(
            MANSION, SPEC, ["1.2"], command_id="cmd-start-000003", expected_version=await play.version()
        )
        return first, creates, held, delays, blocked, after_block, runs, claims, await play.tasks(), play.tinker("1.2")

    (first, creates, held, delays, blocked, after_block, runs, claims, final,
     tinker) = _run(scenario, tmp_path, clock=clock)
    # Still queued, attempt untouched, and waiting at least Crew's Retry-After.
    assert first["outcome"] == {"status": "queued", "attempt": 0, "run_id": None, "reason_code": None}
    assert first["backpressure"] == {"dispatch_failures": 1, "next_delay_seconds": 3, "last_reason": "crew_capacity"}
    assert held == creates
    assert delays == [3, 2, 4, 8]
    assert blocked["outcome"]["status"] == "blocked"
    assert blocked["outcome"]["reason_code"] == "capacity_unavailable" and blocked["outcome"]["attempt"] == 0
    assert blocked["backpressure"] is None
    # Blocked means blocked: no further dispatch without the Operator.
    assert after_block == creates + 4
    # Each refused send released its provisional claim; none became an attempt.
    assert claims.count(("task_claim_released", "not_started")) == 4
    refused = [run for run_id, run in runs.items() if run_id.startswith("task-1-2-")]
    assert len(refused) == 4 and all(run["reason_code"] == "crew_capacity" for run in refused)
    assert all(run["can_retry"] is False and run["attempt"] == 1 for run in refused)
    assert final["1.2"]["outcome"]["status"] == "active" and final["1.2"]["outcome"]["attempt"] == 1
    assert tinker.run_id == "task-1-2-a1-d5"


def test_an_unknown_refusal_blocks_the_task_instead_of_retrying(tmp_path):
    async def scenario(play: Play):
        crew = play.h.crew
        await play.pass_phase(Phase.REQUIREMENTS, REQUIREMENTS)
        await play.pass_phase(Phase.DESIGN, DESIGN)
        await play.pass_phase(Phase.TASKS, WORKSHOP_TASKS)
        await play.rooms.start_workshop(
            MANSION, SPEC, ["1.1"], command_id="cmd-start-000001", expected_version=await play.version()
        )
        # A Crew fault (not capacity), and a queued receipt (not a refusal).
        crew.fail_once["create_slot"] = [(503, {"code": "task_store_unavailable"}, {"Retry-After": "30"})]
        await play.rooms.start_workshop(
            MANSION, SPEC, ["1.2", "1.3"], command_id="cmd-start-000002", expected_version=await play.version()
        )
        tasks = await play.tasks()
        creates = crew.steps().count("create_slot")
        await play.rooms.pump(MANSION)
        return tasks, creates, crew.steps().count("create_slot"), crew.steps().count("send_turn")

    tasks, creates, later, sends = _run(scenario, tmp_path)
    assert tasks["1.2"]["outcome"]["status"] == "blocked" and tasks["1.2"]["outcome"]["reason_code"] == "crew_failed"
    assert tasks["1.2"]["backpressure"] is None
    assert tasks["1.3"]["outcome"]["status"] == "active"
    assert later == creates  # the fault is not retried
    assert sends == 3 + 2    # three phase turns, two Tinker turns: nothing sent twice


def test_the_workshop_does_not_start_before_the_tasks_door_or_with_unknown_tasks(tmp_path):
    async def scenario(play: Play):
        codes = []

        async def attempt(task_ids, version=None):
            try:
                await play.rooms.start_workshop(
                    MANSION, SPEC, task_ids, command_id=play.command_id(),
                    expected_version=await play.version() if version is None else version,
                )
                codes.append("accepted")
            except RoomGhostError as error:
                codes.append(error.code)

        await play.pass_phase(Phase.REQUIREMENTS, REQUIREMENTS)
        await play.pass_phase(Phase.DESIGN, DESIGN)
        foreman = await play.start(Phase.TASKS)
        await play.write_spec(foreman, WORKSHOP_TASKS)
        await play.finish(foreman, result_text(foreman, {f".kiro/specs/{SPEC}/tasks.md": WORKSHOP_TASKS}))
        await attempt(["1.1"])                  # the tasks Door still waits
        await play.h.decide_door(True, phase=Phase.TASKS)
        await attempt(["9.9"])                  # not a task of the plan
        await attempt(["1.1"], version=1)       # a stale view
        steps = play.h.crew.steps().count("create_slot")
        await attempt(["1.1"])
        return codes, steps, await play.h.kinds()

    codes, steps, kinds = _run(scenario, tmp_path)
    assert codes == ["predecessor_door_sealed", "task_not_selectable", "stale_version", "accepted"]
    assert steps == 3  # no Tinker session before the accepted start
    assert kinds.count("phase_start_reserved") == 4


def test_a_workshop_start_crew_refuses_fails_closed_and_repeats_as_a_failure(tmp_path):
    async def scenario(play: Play):
        crew = play.h.crew
        await play.pass_phase(Phase.REQUIREMENTS, REQUIREMENTS)
        await play.pass_phase(Phase.DESIGN, DESIGN)
        await play.pass_phase(Phase.TASKS, WORKSHOP_TASKS)
        version = await play.version()
        crew.pressure("create_slot", "session_create_rate", times=1, retry_after=60)
        codes = []
        for _ in range(2):  # the transport repeats the same command
            try:
                await play.rooms.start_workshop(
                    MANSION, SPEC, ["1.1"], command_id="cmd-start-000001", expected_version=version
                )
                codes.append("accepted")
            except RoomGhostError as error:
                codes.append(error.code)
        phase = (await play.h.view(reconcile=False)).read.projection.phases[Phase.IMPLEMENTATION]
        creates = crew.steps().count("create_slot")
        # A new explicit start is allowed from the failed state.
        await play.rooms.start_workshop(
            MANSION, SPEC, ["1.1"], command_id="cmd-start-000002", expected_version=await play.version()
        )
        return codes, phase, creates, await play.tasks(), await play.claims()

    codes, phase, creates, tasks, claims = _run(scenario, tmp_path)
    assert codes == ["crew_capacity", "crew_capacity"]
    assert phase.status.value == "failed" and phase.failure_code == "crew_capacity"
    assert creates == 4  # three phase sessions and the one refused attempt: never re-sent
    assert tasks["1.1"]["outcome"]["status"] == "active" and tasks["1.1"]["outcome"]["attempt"] == 1
    assert claims["1.1"].active
