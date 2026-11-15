"""Property 4 for Task_Plan validation.

Feature: room-ghosts, Property 4: Invalid task graphs and conflicting waves are rejected

For any valid task plan, deleting an incomplete leaf from the graph,
duplicating an assignment, substituting a missing/non-leaf ID, making waves
noncontiguous, placing possibly overlapping claims in one wave, or removing
all coverage for a requirement produces a finding that identifies the
violated task, wave, claim, or requirement.

Validates: Requirements 7.4, 7.5, 7.6, 7.7, 13.8.
"""

from __future__ import annotations

import json
from dataclasses import replace

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from haunted_house.core.findings import Finding
from haunted_house.core.task_plan import (
    GRAPH_HEADING,
    TaskPlan,
    check_task_plan,
    print_task_plan,
    validate_task_plan,
)
from tests.room_ghost_support import covered_requirements, task_plans

pytestmark = pytest.mark.core

FAULTS = (
    "delete_incomplete_leaf",
    "duplicate_assignment",
    "substitute_missing_id",
    "substitute_group_id",
    "noncontiguous_waves",
    "overlapping_claims",
    "uncovered_requirement",
)


def _two_open_leaves(plan: TaskPlan) -> TaskPlan:
    """The same plan with its first two leaves incomplete and in the graph."""

    leaves = list(plan.leaves)
    waves = [list(wave) for wave in plan.waves] or [[]]
    for index in (0, 1):
        leaves[index] = replace(leaves[index], complete=False)
        if not any(leaves[index].task_id in wave for wave in waves):
            waves[-1].append(leaves[index].task_id)
    return TaskPlan(leaves=tuple(leaves), waves=tuple(tuple(wave) for wave in waves if wave))


def _wave_of(plan: TaskPlan, task_id: str) -> int:
    return next(index for index, wave in enumerate(plan.waves) if task_id in wave)


def _has(findings: tuple[Finding, ...], code: str, location: str) -> bool:
    return any(item.code == code and item.location == location for item in findings)


def _with_graph(markdown: str, graph: object) -> str:
    head, _, _ = markdown.partition(GRAPH_HEADING)
    return f"{head}{GRAPH_HEADING}\n\n```json\n{json.dumps(graph)}\n```\n"


@settings(max_examples=300)
@given(
    base=task_plans(min_leaves=2),
    fault=st.sampled_from(FAULTS),
    data=st.data(),
)
def test_invalid_graphs_and_conflicting_waves_are_rejected(
    base: TaskPlan, fault: str, data: st.DataObject
) -> None:
    # Feature: room-ghosts, Property 4: Invalid task graphs and conflicting waves are rejected
    plan = _two_open_leaves(base)
    requirement_ids = covered_requirements(plan)
    assert validate_task_plan(plan, requirement_ids) == ()
    assert check_task_plan(print_task_plan(plan), requirement_ids).ok

    open_leaves = [leaf for leaf in plan.leaves if not leaf.complete]
    victim = data.draw(st.sampled_from(open_leaves), label="victim")
    wave_index = _wave_of(plan, victim.task_id)
    waves = [list(wave) for wave in plan.waves]
    leaves = list(plan.leaves)

    if fault == "noncontiguous_waves":
        # Only the text can spell a wave id, so this fault mutates the document.
        graph = [{"id": index, "tasks": list(wave)} for index, wave in enumerate(plan.waves)]
        kind = data.draw(st.sampled_from(["gap", "repeat", "offset"]), label="kind")
        target = data.draw(st.integers(min_value=0, max_value=len(graph) - 1), label="wave")
        if kind == "gap":
            bad_id = graph[target]["id"] = target + data.draw(st.integers(1, 5), label="gap")
        elif kind == "repeat" and target > 0:
            bad_id = graph[target]["id"] = target - 1
        else:
            for entry in graph:
                entry["id"] += 1
            bad_id = 1
        check = check_task_plan(_with_graph(print_task_plan(plan), {"waves": graph}), requirement_ids)
        assert check.plan is None and not check.ok
        assert _has(check.findings, "wave_not_contiguous", f"wave:{bad_id}")
        return

    expected: tuple[str, str]
    if fault == "delete_incomplete_leaf":
        waves[wave_index].remove(victim.task_id)
        expected = ("graph_missing_task", f"task:{victim.task_id}")
    elif fault == "duplicate_assignment":
        target = data.draw(st.integers(min_value=0, max_value=len(waves) - 1), label="wave")
        waves[target].append(victim.task_id)
        expected = ("graph_duplicate_task", f"task:{victim.task_id}")
    elif fault == "substitute_missing_id":
        missing = data.draw(
            st.sampled_from(["99.99", "0.1", "1.2.3", "task", "", "1.1 ", "x" * 80]),
            label="missing",
        )
        waves[wave_index][waves[wave_index].index(victim.task_id)] = missing
        safe = missing if missing in ("99.99", "0.1", "1.2.3", "task") else "?"
        expected = ("graph_unknown_task", f"task:{safe}")
    elif fault == "substitute_group_id":
        group = victim.task_id.split(".")[0]
        waves[wave_index][waves[wave_index].index(victim.task_id)] = group
        expected = ("graph_non_leaf_task", f"task:{group}")
    elif fault == "overlapping_claims":
        other = data.draw(
            st.sampled_from([leaf for leaf in open_leaves if leaf is not victim]), label="other"
        )
        shared = victim.writes[0]
        folder = shared.rsplit("/", 1)[0]
        clash = data.draw(
            st.sampled_from(
                [shared, shared.upper(), folder, f"{folder}/**", f"{folder}/*.py", "**", "src/*/main.py", f"{folder}/[a-z]*"]
            ),
            label="clash",
        )
        position = leaves.index(other)
        leaves[position] = replace(other, writes=(*other.writes, clash))
        # Put both tasks in one wave.
        waves[_wave_of(plan, other.task_id)].remove(other.task_id)
        waves[wave_index].append(other.task_id)
        first, second = sorted(
            (victim.task_id, other.task_id), key=waves[wave_index].index
        )
        waves = [wave for wave in waves if wave]
        new_index = next(index for index, wave in enumerate(waves) if victim.task_id in wave)
        expected = ("claim_conflict", f"wave:{new_index} {first} {second}")
    else:
        assert fault == "uncovered_requirement"
        lost = data.draw(st.sampled_from(sorted(requirement_ids)), label="lost")
        keep = "9.9"
        requirement_ids = requirement_ids | {keep}
        leaves = [
            replace(
                leaf,
                requirements=tuple(ref for ref in leaf.requirements if ref != lost) or (keep,),
            )
            for leaf in leaves
        ]
        # Every leaf that lost its only reference now covers 9.9; make sure
        # 9.9 is covered even if none did, so the one fault is the lost id.
        leaves[0] = replace(
            leaves[0], requirements=tuple(dict.fromkeys((*leaves[0].requirements, keep)))
        )
        expected = ("requirement_uncovered", f"requirement:{lost}")

    mutated = TaskPlan(
        leaves=tuple(leaves), waves=tuple(tuple(wave) for wave in waves if wave)
    )
    findings = validate_task_plan(mutated, requirement_ids)
    assert findings, fault
    assert _has(findings, *expected), (fault, expected, findings)

    # The same fault is found when the plan arrives as a document.
    check = check_task_plan(print_task_plan(mutated), requirement_ids)
    assert not check.ok
    assert check.findings == findings

