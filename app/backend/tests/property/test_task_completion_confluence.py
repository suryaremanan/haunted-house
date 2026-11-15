"""Property 10 for the serialized Task_Plan checkbox writer (task 6.9).

Feature: room-ghosts, Property 10: Parallel task completion is confluent

Distinct successful completions are applied through the one writer in every
generated order, including truly concurrent calls.  Canonical records live in
memory (Spec 2's pure pieces); ``tasks.md`` is a real guarded file in a
temporary Mansion.

Validates: Requirements 8.5, 9.8.
"""

from __future__ import annotations

import asyncio
import hashlib
import os
import tempfile
from dataclasses import replace
from pathlib import Path

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from haunted_house.adapters.guarded_filesystem import GuardedFilesystem
from haunted_house.core.ghost_result import ArtifactRef
from haunted_house.core.seance_event import AppEventCandidate, EventSource
from haunted_house.core.task_checkbox import fold_completions
from haunted_house.core.task_claims import fold_claims
from haunted_house.core.task_plan import TaskPlan, parse_task_plan, print_task_plan
from haunted_house.services.canonical_port import CanonicalRunPort
from haunted_house.services.task_claims import TaskClaimService
from haunted_house.services.task_plan_writer import TaskPlanWriter, tasks_document_path
from tests.guardrail_support import MemoryWriter
from tests.room_ghost_runtime_support import MANSION, tinker_scope
from tests.room_ghost_support import task_plans

SPEC = "demo-feature"
NOTE = "\nNotes kept by a human: `- [ ] 9.9 not a task`\n"


def _terminal(scope) -> AppEventCandidate:
    return AppEventCandidate(
        schema_version=1,
        event_type="run_completed",
        scope=scope,
        source=EventSource("house", "run_terminal", (scope.run_id,), 0, "", 0),
        caused_by=(),
        occurred_at_ms=None,
        payload={"reason": "Task complete", "code": "ready"},
    )


@st.composite
def _cases(draw: st.DrawFn):
    plan: TaskPlan = draw(task_plans(min_leaves=2, max_leaves=7))
    open_ids = [leaf.task_id for leaf in plan.leaves if not leaf.complete]
    done = (
        draw(st.lists(st.sampled_from(open_ids), unique=True, min_size=1, max_size=3))
        if open_ids
        else []
    )
    orders = [draw(st.permutations(done)) for _ in range(3)]
    return plan, tuple(done), orders, draw(st.booleans())


async def _apply(root: Path, plan: TaskPlan, order: tuple[str, ...], concurrent: bool):
    mansion = root / MANSION
    document = mansion / ".kiro" / "specs" / SPEC / "tasks.md"
    document.parent.mkdir(parents=True)
    original = print_task_plan(plan) + NOTE
    document.write_text(original, encoding="utf-8")

    memory = MemoryWriter()
    port = CanonicalRunPort(memory)
    claims = TaskClaimService(port)
    writer = TaskPlanWriter(port, lambda mansion_id: GuardedFilesystem(root, mansion_id))
    by_id = {leaf.task_id: leaf for leaf in plan.leaves}

    async def finish(seat: int, task_id: str) -> str:
        scope = replace(tinker_scope(seat), run_id=f"implementation-{seat}", run_sequence=seat)
        held = await claims.acquire(scope, task_id, by_id[task_id].writes, 1)
        assert held.ok, held
        evidence = (ArtifactRef(by_id[task_id].writes[0], hashlib.sha256(task_id.encode()).hexdigest()),)
        result = await writer.complete_task(
            scope, spec_name=SPEC, task_id=task_id, claim_id=held.claim.claim_id, evidence=evidence
        )
        assert result.ok and not result.duplicate, result
        # A repeated completion is the same durable fact, not a second edit.
        again = await writer.complete_task(
            scope, spec_name=SPEC, task_id=task_id, claim_id=held.claim.claim_id, evidence=evidence
        )
        assert again.ok and again.duplicate and again.event == result.event
        terminal = (await port.append(MANSION, [_terminal(scope)])).events[0]
        released = await claims.release(MANSION, held.claim.claim_id, terminal.record_id)
        assert released.ok and not released.duplicate
        # The durable completion precedes the release.
        assert result.event.sequence < terminal.sequence < released.event.sequence
        repeat = await claims.release(MANSION, held.claim.claim_id, terminal.record_id)
        assert repeat.ok and repeat.duplicate and repeat.event is None
        return held.claim.claim_id

    if concurrent:
        claim_ids = await asyncio.gather(
            *(finish(seat, task_id) for seat, task_id in enumerate(order, start=1))
        )
    else:
        claim_ids = [await finish(seat, task_id) for seat, task_id in enumerate(order, start=1)]
    return original, document.read_text(encoding="utf-8"), memory.events, list(claim_ids)


@settings(max_examples=100)
@given(case=_cases())
def test_parallel_task_completion_is_confluent(case) -> None:
    # Feature: room-ghosts, Property 10: Parallel task completion is confluent
    plan, done, orders, concurrent = case
    expected = TaskPlan(
        leaves=tuple(
            replace(leaf, complete=leaf.complete or leaf.task_id in done) for leaf in plan.leaves
        ),
        waves=plan.waves,
    )
    finals = set()
    for order in orders:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(os.path.realpath(raw))
            original, final, events, claim_ids = asyncio.run(
                _apply(root, plan, tuple(order), concurrent)
            )
        finals.add(final)
        # Exactly the completed tasks are checked; ids, optional markers,
        # requirement references, Path_Claims, and waves are unchanged.
        assert parse_task_plan(final) == expected
        # Unrelated bytes are preserved: only "[ ]" -> "[x]" on changed lines.
        before, after = original.splitlines(keepends=True), final.splitlines(keepends=True)
        assert len(before) == len(after)
        changed = [(a, b) for a, b in zip(before, after, strict=True) if a != b]
        assert len(changed) == len(done)
        assert all(a.replace("[ ]", "[x]", 1) == b for a, b in changed)
        assert final.endswith(NOTE)
        # One durable completion per task, and every claim released exactly once.
        assert set(fold_completions(events).completed) == set(done)
        assert not fold_completions(events).pending
        ledger = fold_claims(events)
        assert ledger.active == () and ledger.diagnostics == ()
        released = [
            event for event in events
            if event.event_type == "domain_event_recorded"
            and event.payload["kind"] == "task_claim_released"
        ]
        assert sorted(event.payload["entity_id"] for event in released) == sorted(claim_ids)
    # Any order gives the same document.
    assert len(finals) == 1
