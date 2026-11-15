"""MCP and scheduler integration for Workshop task claims (task 6.10).

The real Spec 2 file writer, the real Spec 4 WorkflowService, room gate and
room MCP server (its own stdio process from an installed-app copy), and the
Room Ghosts claim service, scheduler, plan writer, and terminal gate.  A fake
Crew gateway plays the chat routes.

Validates: Requirements 8.1–8.8, 9.2–9.8.
"""

from __future__ import annotations

import asyncio
import os
from dataclasses import replace
from pathlib import Path

from haunted_house.adapters.guarded_filesystem import GuardedFilesystem
from haunted_house.core.guardrail_events import Phase
from haunted_house.core.task_checkbox import fold_completions
from haunted_house.core.task_claims import fold_claims
from haunted_house.core.task_plan import LeafTask, TaskPlan, parse_task_plan
from haunted_house.core.workshop_scheduler import (
    MAX_TINKERS,
    TaskOutcome,
    WorkshopState,
    choose_dispatches,
    free_seats,
    record_refusal,
)
from haunted_house.room_gate import RoomGate
from haunted_house.services.task_plan_writer import TaskPlanWriter
from tests.room_ghost_runtime_support import (
    WORKSHOP_PLAN,
    open_workshop,
    ready_result,
    runtime,
    sha256_text,
    spec5_validator,
)
from tests.room_mcp_support import McpClient, install_app
from tests.workflow_support import MANSION, SPEC, FlakyWriter, house, tinker_delete

TASKS_PATH = f".kiro/specs/{SPEC}/tasks.md"
LEAF = {leaf.task_id: leaf for leaf in WORKSHOP_PLAN.leaves}
ALL = frozenset(LEAF)


def play(tmp_path, scenario, **options):
    async def go():
        async with house(tmp_path, validator=spec5_validator, **options) as h:
            return await scenario(h, runtime(h))

    return asyncio.run(go())


async def _state(rt, plan: TaskPlan = WORKSHOP_PLAN, outcomes=None) -> WorkshopState:
    """The Workshop state the canonical log and ``tasks.md`` describe."""

    events = (await rt.port.read(MANSION)).events
    text = (rt.house.mansion / TASKS_PATH).read_text(encoding="utf-8")
    current = parse_task_plan(text) if plan is WORKSHOP_PLAN else plan
    return WorkshopState(
        plan=current,
        selected=frozenset(leaf.task_id for leaf in current.leaves),
        outcomes=dict(outcomes or {}),
        active_claims=fold_claims(events).active,
        backpressure={},
    )


async def _claim(rt, room, task_id: str, attempt: int = 1):
    held = await rt.claims.acquire(room.scope, task_id, LEAF[task_id].writes, attempt)
    assert held.ok, held
    return rt.run(room, task_id=task_id, claim_id=held.claim.claim_id, attempt=attempt)


async def _write(rt, room, path: str, text: str, expected=None):
    return await rt.rooms.call(
        room, "write_room_file", {"path": path, "content": text, "expected_sha256": expected}
    )


async def _finish(rt, room, run, files: dict[str, str]):
    """The Tinker writes its files, its turn ends, and the gate settles it."""

    for path, text in files.items():
        assert (await _write(rt, room, path, text))["ok"], path
    turn = await rt.turn_ended(room.slot)
    return await rt.gate.settle_turn(run, turn, ready_result(run, files))


def _checked(h) -> set[str]:
    plan = parse_task_plan((h.mansion / TASKS_PATH).read_text(encoding="utf-8"))
    return {leaf.task_id for leaf in plan.leaves if leaf.complete}


async def _released(rt) -> list[str]:
    return [
        event.payload["entity_id"]
        for event in (await rt.port.read(MANSION)).events
        if event.event_type == "domain_event_recorded"
        and event.payload.get("kind") == "task_claim_released"
    ]


# --- three disjoint tasks, a queued fourth, the real MCP server ---------------------


def test_three_disjoint_tinkers_work_through_the_real_mcp_server(tmp_path) -> None:
    async def go():
        app_root = install_app(tmp_path / "crew-home" / "apps" / "haunted-house")
        async with house(tmp_path / "work", data_dir=app_root / "data", validator=spec5_validator) as h:
            rt = runtime(h)
            gate = RoomGate(rt.rooms, h.bindings)  # the room gate with Task_Claim_Gate on
            await gate.start()
            ghosts: list[McpClient] = []
            try:
                tinkers = await open_workshop(h)
                assert [room.ghost for room in tinkers] == ["tinker-1", "tinker-2", "tinker-3"]
                assert free_seats(h.service.workshop(MANSION)) == 0  # Spec 4: three seats taken

                # The scheduler picks three disjoint tasks; the fourth waits.
                state = await _state(rt)
                dispatches = choose_dispatches(state, MAX_TINKERS)
                assert [item.task_id for item in dispatches] == ["1.1", "1.2", "1.3"]
                runs = [await _claim(rt, room, item.task_id) for room, item in zip(tinkers, dispatches, strict=True)]
                assert choose_dispatches(await _state(rt), MAX_TINKERS) == ()
                fourth = replace(tinkers[0].scope, ghost_id="tinker-4", session_slot="slot-extra")
                assert (await rt.claims.acquire(fourth, "1.4", LEAF["1.4"].writes, 1)).code == "workshop_full"

                def launch(room) -> McpClient:
                    env = {
                        "PATH": os.defpath, "HOME": str(tmp_path / "ghost-home"), "LANG": "C.UTF-8",
                        "HH_ROOM": "tinker", "KIROCREW_SESSION_LABEL": f"dashboard:{room.slot}",
                    }
                    ghost = McpClient(app_root, env, h.mansion)
                    ghosts.append(ghost)
                    return ghost

                first = launch(tinkers[0])
                await asyncio.to_thread(first.initialize)

                async def call(tool: str, arguments: dict) -> dict:
                    return await asyncio.to_thread(first.call, tool, arguments)

                model = "class Entry:\n    pass\n"
                # No expected digest: refused before anything is written.
                missing = await call("write_room_file", {"path": "src/guestbook/model.py", "content": model})
                assert (missing["ok"], missing["code"]) == (False, "expected_digest_required")
                # A model-supplied claim or task identity is not an argument at all.
                forged = await call(
                    "write_room_file",
                    {"path": "src/guestbook/store.py", "content": "x", "expected_sha256": None,
                     "claim_id": runs[1].claim_id},
                )
                assert forged["code"] == "invalid_arguments"
                # Another Tinker's file, an unclaimed file, and a Spec_Document.
                for path in ("src/guestbook/store.py", "src/guestbook/feed.py", TASKS_PATH, "README.md"):
                    denied = await call("write_room_file", {"path": path, "content": "x", "expected_sha256": None})
                    assert (denied["code"], denied["reason"]) == ("task_claim_denied", "outside_task_claim"), path
                assert not (h.mansion / "src").exists()

                written = await call(
                    "write_room_file",
                    {"path": "src/guestbook/model.py", "content": model, "expected_sha256": None},
                )
                assert written["ok"] and written["sha256"] == sha256_text(model)
                # A stale digest keeps the current bytes.
                for stale in (None, "0" * 64):
                    refused = await call(
                        "write_room_file",
                        {"path": "src/guestbook/model.py", "content": "lost", "expected_sha256": stale},
                    )
                    assert refused["code"] == "stale_revision"
                assert (h.mansion / "src/guestbook/model.py").read_text(encoding="utf-8") == model
                better = model + "# reviewed\n"
                assert (await call(
                    "write_room_file",
                    {"path": "src/guestbook/model.py", "content": better,
                     "expected_sha256": sha256_text(model)},
                ))["ok"]
                # Reads stay as wide as the room allows.
                assert (await call("read_room_file", {"path": TASKS_PATH}))["ok"]

                # The first Tinker finishes; its claim is released; the fourth task is next.
                turn = await rt.turn_ended(tinkers[0].slot)
                done = await rt.gate.settle_turn(
                    runs[0], turn, ready_result(runs[0], {"src/guestbook/model.py": better})
                )
                assert (done.status, done.claim_released) == ("completed", True)
                assert _checked(h) == {"1.1"}
                after = await call(
                    "write_room_file",
                    {"path": "src/guestbook/model.py", "content": "late", "expected_sha256": sha256_text(better)},
                )
                assert (after["code"], after["reason"]) == ("task_claim_denied", "task_claim_required")
                assert [item.task_id for item in choose_dispatches(await _state(rt), MAX_TINKERS)] == ["1.4"]

                # The other two finish at the same moment.
                both = await asyncio.gather(
                    _finish(rt, tinkers[1], runs[1], {"src/guestbook/store.py": "STORE = []\n"}),
                    _finish(rt, tinkers[2], runs[2], {
                        "src/guestbook/render.py": "def render(): ...\n",
                        "src/guestbook/templates/page.html": "<p>hi</p>\n",
                    }),
                )
                assert [item.status for item in both] == ["completed", "completed"]
                assert _checked(h) == {"1.1", "1.2", "1.3"}
                events = (await rt.port.read(MANSION)).events
                ledger = fold_claims(events)
                assert ledger.active == () and ledger.diagnostics == ()
                # Each claim released exactly once, after its durable completion.
                assert sorted(await _released(rt)) == sorted(run.claim_id for run in runs)
                assert set(fold_completions(events).completed) == {"1.1", "1.2", "1.3"}
                # Wave 1 stays shut while task 1.4 of wave 0 is open.
                assert [item.task_id for item in choose_dispatches(await _state(rt), MAX_TINKERS)] == ["1.4"]
                # Every denial was recorded through the one canonical writer.
                denials = [
                    record for record in (await h.port.read(MANSION)).domain.records
                    if record.kind.value == "path_denied" and record.data["code"] == "task_claim"
                ]
                assert len(denials) >= 5
            finally:
                for ghost in ghosts:
                    if ghost.process.poll() is None:
                        ghost.process.kill()
                        ghost.process.wait(timeout=10)
                    for stream in (ghost.process.stdin, ghost.process.stdout, ghost.process.stderr):
                        if stream is not None and not stream.closed:
                            stream.close()
                await gate.stop()

    asyncio.run(go())


# --- claims -----------------------------------------------------------------------------


def test_a_tinker_without_a_claim_can_do_nothing(tmp_path) -> None:
    async def scenario(h, rt):
        tinkers = await open_workshop(h)
        room = tinkers[0]
        for tool, arguments in (
            ("list_room_files", {}),
            ("read_room_file", {"path": TASKS_PATH}),
            ("write_room_file", {"path": "src/a.py", "content": "x", "expected_sha256": None}),
            ("propose_risky_action", {"action": tinker_delete("src/a.py")}),
            ("submit_phase_output", {"path": "RESULT.md"}),
        ):
            answer = await rt.rooms.call(room, tool, arguments)
            assert (answer["code"], answer["reason"]) == ("task_claim_denied", "task_claim_required"), tool
        assert not (h.mansion / "src").exists()
        # The spec Ghosts are not Tinkers: the claim gate does not concern them.
        assert "risky_action_proposed" not in await h.kinds()

    play(tmp_path, scenario)


def test_overlapping_claims_are_serialized(tmp_path) -> None:
    async def scenario(h, rt):
        tinkers = await open_workshop(h)
        # Scheduler: two tasks of one wave whose claims may overlap never run together.
        clash = TaskPlan(
            leaves=(
                replace(LEAF["1.3"], document_index=0),
                replace(LEAF["2.3"], document_index=1),
                LeafTask("3.1", "Unknown glob", False, False, ("1.1",), ("weird/[ab].py",), 2),
            ),
            waves=(("1.3", "2.3", "3.1"),),
        )
        state = WorkshopState(clash, frozenset({"1.3", "2.3", "3.1"}), {})
        assert [item.task_id for item in choose_dispatches(state, 3)] == ["1.3"]

        first = await _claim(rt, tinkers[0], "1.3")
        refused = await rt.claims.acquire(tinkers[1].scope, "2.3", LEAF["2.3"].writes, 1)
        assert (refused.ok, refused.code) == (False, "claim_overlap")
        unknown = await rt.claims.acquire(tinkers[1].scope, "3.1", ("weird/[ab].py",), 1)
        assert unknown.code == "claim_overlap"  # an unknown relationship counts as overlap
        held = replace(state, active_claims=(await rt.claims.ledger(MANSION)).active,
                       outcomes={"1.3": TaskOutcome("active", 1)})
        assert choose_dispatches(held, 3) == ()

        done = await _finish(rt, tinkers[0], first, {"src/guestbook/render.py": "x = 1\n"})
        assert done.status == "completed" and done.claim_released
        assert (await rt.claims.acquire(tinkers[1].scope, "2.3", LEAF["2.3"].writes, 1)).ok

        # Two racing acquisitions of one task: exactly one holds.
        racing = await asyncio.gather(
            rt.claims.acquire(tinkers[2].scope, "1.2", LEAF["1.2"].writes, 1),
            rt.claims.acquire(replace(tinkers[2].scope, ghost_id="tinker-9", session_slot="slot-9"),
                              "1.2", LEAF["1.2"].writes, 1),
        )
        assert sorted(item.ok for item in racing) == [False, True]
        assert len([c for c in (await rt.claims.ledger(MANSION)).active if c.task_id == "1.2"]) == 1

    play(tmp_path, scenario)


def test_risky_actions_need_the_claim_and_the_spec_4_approval(tmp_path) -> None:
    async def scenario(h, rt):
        tinkers = await open_workshop(h)
        room = tinkers[0]
        await _claim(rt, room, "1.1")
        (h.mansion / "src" / "guestbook").mkdir(parents=True)
        (h.mansion / "src" / "guestbook" / "model.py").write_text("old\n", encoding="utf-8")
        (h.mansion / "src" / "guestbook" / "store.py").write_text("keep\n", encoding="utf-8")

        # Outside the claim: refused before any proposal exists.
        outside = tinker_delete("src/guestbook/store.py")
        refused = await rt.rooms.call(room, "propose_risky_action", {"action": outside})
        assert (refused["code"], refused["reason"]) == ("task_claim_denied", "outside_task_claim")
        assert "risky_action_proposed" not in await h.kinds()

        # Inside the claim: still only a proposal, and Spec 4 still decides.
        action = tinker_delete("src/guestbook/model.py")
        proposed = await rt.rooms.call(room, "propose_risky_action", {"action": action})
        assert proposed["ok"], proposed
        waiting = await rt.rooms.call(
            room, "execute_approved_action", {"proposal_id": proposed["proposal_id"], "action": action}
        )
        assert waiting["ok"] is False and (h.mansion / "src/guestbook/model.py").exists()
        await h.decide_risky(proposed["proposal_id"], proposed["action_digest"])
        # An approval for one path cannot be spent on another, claimed or not.
        swapped = await rt.rooms.call(
            room, "execute_approved_action", {"proposal_id": proposed["proposal_id"], "action": outside}
        )
        assert swapped["code"] == "task_claim_denied"
        executed = await rt.rooms.call(
            room, "execute_approved_action", {"proposal_id": proposed["proposal_id"], "action": action}
        )
        assert executed["ok"] and executed["consumed"], executed
        assert not (h.mansion / "src/guestbook/model.py").exists()
        assert (h.mansion / "src/guestbook/store.py").read_text(encoding="utf-8") == "keep\n"

    play(tmp_path, scenario)


# --- outcomes ---------------------------------------------------------------------------


def test_failed_and_invalid_tinker_results_leave_the_task_unchecked(tmp_path) -> None:
    async def scenario(h, rt):
        tinkers = await open_workshop(h)
        failed_run = await _claim(rt, tinkers[0], "1.1")
        outside_run = await _claim(rt, tinkers[1], "1.2")
        stale_run = await _claim(rt, tinkers[2], "1.3")

        # A Tinker that reports failure.
        turn = await rt.turn_ended(tinkers[0].slot)
        text = (
            '{"artifacts":[],"reason_code":"tests_failed","run_id":"%s","schema_version":1,'
            '"status":"failed","summary":"Tests fail.","task_id":"1.1"}' % failed_run.run_id
        )
        failed = await rt.gate.settle_turn(failed_run, turn, text)
        assert (failed.status, failed.code, failed.claim_released) == ("failed", "tests_failed", True)

        # A Tinker that claims a file outside its Path_Claim as evidence.
        (h.mansion / "README.md").write_text("hello\n", encoding="utf-8")
        turn = await rt.turn_ended(tinkers[1].slot)
        outside = await rt.gate.settle_turn(outside_run, turn, ready_result(outside_run, {"README.md": "hello\n"}))
        assert (outside.status, outside.code) == ("failed", "artifact_outside_claim")

        # A Tinker whose evidence digest is not what is on disk, then no evidence.
        assert (await _write(rt, tinkers[2], "src/guestbook/render.py", "v1\n"))["ok"]
        turn = await rt.turn_ended(tinkers[2].slot)
        stale = await rt.gate.settle_turn(
            stale_run, turn, ready_result(stale_run, {"src/guestbook/render.py": "v2\n"})
        )
        assert (stale.status, stale.code) == ("failed", "artifact_hash_mismatch")

        assert _checked(h) == set()
        assert fold_completions((await rt.port.read(MANSION)).events).completed == {}
        ledger = await rt.claims.ledger(MANSION)
        assert ledger.active == () and len(await _released(rt)) == 3
        # Requirement 12.7: while wave 0 has failed tasks, nothing of wave 1
        # starts; the untouched task of wave 0 still may.
        outcomes = {task: TaskOutcome("failed", 1) for task in ("1.1", "1.2", "1.3")}
        assert [i.task_id for i in choose_dispatches(await _state(rt, outcomes=outcomes), 3)] == ["1.4"]
        outcomes["1.4"] = TaskOutcome("complete", 1)
        assert choose_dispatches(await _state(rt, outcomes=outcomes), 3) == ()
        # An explicit retry queues the task again with its attempt counted.
        outcomes["1.1"] = TaskOutcome("queued", 1)
        assert [i.task_id for i in choose_dispatches(await _state(rt, outcomes=outcomes), 3)] == ["1.1"]
        outcomes["1.1"] = TaskOutcome("queued", 3)
        assert choose_dispatches(await _state(rt, outcomes=outcomes), 3) == ()

    play(tmp_path, scenario)


def test_wrong_claim_identity_cannot_complete_a_task(tmp_path) -> None:
    async def scenario(h, rt):
        tinkers = await open_workshop(h)
        run = await _claim(rt, tinkers[0], "1.1")
        assert (await _write(rt, tinkers[0], "src/guestbook/model.py", "ok\n"))["ok"]
        turn = await rt.turn_ended(tinkers[0].slot)
        final = ready_result(run, {"src/guestbook/model.py": "ok\n"})
        # A binding that names another claim or task is not this run's authority.
        forged_claim = replace(run, claim_id="claim-" + "f" * 40)
        assert (await rt.gate.settle_turn(forged_claim, turn, final)).code == "task_claim_required"
        return _checked(h)

    assert play(tmp_path, scenario) == set()


def test_claim_is_retained_when_cancellation_is_unconfirmed(tmp_path) -> None:
    async def scenario(h, rt):
        tinkers = await open_workshop(h)
        retained = await _claim(rt, tinkers[0], "1.1")
        cancelled = await _claim(rt, tinkers[1], "1.2")

        blocked = await rt.gate.settle_blocked(retained, "cancel_unconfirmed")
        assert (blocked.status, blocked.code, blocked.claim_released) == ("blocked", "cancel_unconfirmed", False)
        confirmed = await rt.gate.settle_blocked(cancelled, "cancelled")
        assert (confirmed.status, confirmed.claim_released) == ("blocked", True)

        ledger = await rt.claims.ledger(MANSION)
        assert [claim.task_id for claim in ledger.active] == ["1.1"]
        assert ledger.get(cancelled.claim_id).release_outcome == "cancelled"
        direct = await rt.claims.release(MANSION, retained.claim_id, blocked.event.record_id)
        assert (direct.ok, direct.code) == (False, "claim_retained")
        # The retained claim keeps its paths out of the schedule.
        state = await _state(rt, outcomes={"1.1": TaskOutcome("blocked", 1), "1.2": TaskOutcome("cancelled", 1)})
        assert [item.task_id for item in choose_dispatches(state, 3)] == ["1.3", "1.4"]
        assert _checked(h) == set()

    play(tmp_path, scenario)


def test_capacity_backpressure_releases_the_provisional_claim_without_an_attempt(tmp_path) -> None:
    async def scenario(h, rt):
        tinkers = await open_workshop(h)
        scope = replace(tinkers[0].scope, session_slot="hh-tinker-next", run_id="implementation-2",
                        run_sequence=2)
        outcome, pressure = TaskOutcome("queued", attempt=0), None
        delays = []
        for _ in range(4):
            held = await rt.claims.acquire(scope, "1.4", LEAF["1.4"].writes, 1)
            assert held.ok
            # Crew refuses the turn for capacity: the claim was only provisional.
            released = await rt.claims.release_provisional(MANSION, held.claim.claim_id)
            assert released.ok and released.claim.release_outcome == "not_started"
            step = record_refusal(outcome, pressure, "1.4", "crew_capacity")
            outcome, pressure = step.outcome, step.backpressure
            delays.append(pressure.next_delay_seconds)
            state = await _state(rt, outcomes={"1.4": outcome, "1.1": TaskOutcome("complete"),
                                               "1.2": TaskOutcome("complete"), "1.3": TaskOutcome("complete")})
            assert [item.task_id for item in choose_dispatches(state, 3)] == ["1.4"]
            # The same deterministic claim identifier cannot be replayed: a
            # released claim stays released, so the next try is refused until
            # the house names a fresh session.
            scope = replace(scope, session_slot=f"{scope.session_slot}x")
        assert delays == [1, 2, 4, 8] and outcome == TaskOutcome("queued", attempt=0)
        final = record_refusal(outcome, pressure, "1.4", "crew_capacity")
        assert final.capacity_unavailable and final.outcome.attempt == 0
        state = await _state(rt, outcomes={"1.4": final.outcome, "1.1": TaskOutcome("complete"),
                                           "1.2": TaskOutcome("complete"), "1.3": TaskOutcome("complete")})
        assert choose_dispatches(state, 3) == ()
        assert (await rt.claims.ledger(MANSION)).active == ()

        # A claim whose session ran is released only by its terminal outcome.
        run = await _claim(rt, tinkers[1], "1.2")
        await rt.turn_ended(tinkers[1].slot)
        assert (await rt.claims.release_provisional(MANSION, run.claim_id)).code == "run_started"

    play(tmp_path, scenario)


# --- the serialized plan writer ---------------------------------------------------------


class _Interfering(GuardedFilesystem):
    """A filesystem where someone edits ``tasks.md`` just before a replace."""

    edits: list = []

    def _checkpoint(self, stage: str) -> None:
        if stage == "before_replace" and self.edits:
            self.edits.pop(0)()


def test_a_change_behind_the_writer_keeps_its_bytes_and_the_checkbox(tmp_path) -> None:
    async def scenario(h, rt):
        tinkers = await open_workshop(h)
        run = await _claim(rt, tinkers[0], "1.1")
        document = h.mansion / TASKS_PATH
        note = "\nOperator note: do not lose me.\n"

        def edit() -> None:
            replacement = document.with_suffix(".tmp-test")
            replacement.write_text(document.read_text(encoding="utf-8") + note, encoding="utf-8")
            os.replace(replacement, document)

        _Interfering.edits = [edit]
        writer = TaskPlanWriter(rt.port, lambda mansion_id: _Interfering(h.root, mansion_id))
        result = await writer.complete_task(
            run.scope, spec_name=SPEC, task_id="1.1", claim_id=run.claim_id
        )
        assert result.ok and not result.duplicate
        text = document.read_text(encoding="utf-8")
        assert text.endswith(note) and _checked(h) == {"1.1"}
        assert result.sha256 == sha256_text(text)
        kinds = [
            event.payload["kind"] for event in (await rt.port.read(MANSION)).events
            if event.event_type == "domain_event_recorded" and event.payload["domain"] == "room_ghosts"
        ]
        assert kinds[-4:] == [
            "task_completion_intended", "task_completion_abandoned",
            "task_completion_intended", "task_completed",
        ]

    play(tmp_path, scenario)


def test_an_interrupted_completion_is_settled_after_a_restart(tmp_path) -> None:
    async def before(h, rt):
        tinkers = await open_workshop(h)
        run = await _claim(rt, tinkers[0], "1.1")
        assert (await _write(rt, tinkers[0], "src/guestbook/model.py", "ok\n"))["ok"]
        turn = await rt.turn_ended(tinkers[0].slot)
        h.writer.fail["task_completed"] = ["failed"]  # the file is replaced, the evidence is not
        outcome = await rt.gate.settle_turn(run, turn, ready_result(run, {"src/guestbook/model.py": "ok\n"}))
        assert (outcome.status, outcome.code) == ("pending", "completion_unacknowledged")
        assert _checked(h) == {"1.1"} and await rt.terminals() == []
        assert (await rt.claims.ledger(MANSION)).active_for_scope(run.scope) is not None
        return tinkers[0].slot, run, turn

    slot, run, turn = play(tmp_path, before, wrap_writer=FlakyWriter)

    async def after(h, rt):
        outcome = await rt.gate.settle_turn(run, turn, ready_result(run, {"src/guestbook/model.py": "ok\n"}))
        assert (outcome.status, outcome.claim_released) == ("completed", True)
        events = (await rt.port.read(MANSION)).events
        completions = fold_completions(events)
        assert set(completions.completed) == {"1.1"} and not completions.pending
        assert _checked(h) == {"1.1"} and len(await _released(rt)) == 1
        # Settling yet again changes nothing.
        again = await rt.gate.settle_turn(run, turn, "{}")
        assert again.duplicate and again.status == "completed"
        assert len((await rt.port.read(MANSION)).events) == len(events)

    play(tmp_path, after)


def test_the_writer_checks_only_a_claimed_task(tmp_path) -> None:
    async def scenario(h, rt):
        tinkers = await open_workshop(h)
        run = await _claim(rt, tinkers[0], "1.1")
        before = (h.mansion / TASKS_PATH).read_bytes()
        for arguments in (
            {"task_id": "1.2", "claim_id": run.claim_id},  # another task
            {"task_id": "1.1", "claim_id": "claim-" + "0" * 40},  # another claim
            {"task_id": "9.9", "claim_id": run.claim_id},
        ):
            result = await rt.writer.complete_task(run.scope, spec_name=SPEC, **arguments)
            assert (result.ok, result.code) == (False, "task_claim_required")
        other = await rt.writer.complete_task(
            tinkers[1].scope, spec_name=SPEC, task_id="1.1", claim_id=run.claim_id
        )
        assert other.code == "task_claim_required"
        assert (h.mansion / TASKS_PATH).read_bytes() == before

    play(tmp_path, scenario)
