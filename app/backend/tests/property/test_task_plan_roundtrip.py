"""Property 3 for the Task_Plan codec.

Feature: room-ghosts, Property 3: Task_Plan serialization round trip

For any valid TaskPlan, printing and then parsing produces an equivalent
ordered model of task IDs, checkbox states, optional markers, requirement
references, Path_Claims, and waves, and the printed document uses the
Kiro-compatible Task_Plan_Grammar.

Validates: Requirements 7.2, 7.3, 7.4, 13.5, 13.6, 13.7.
"""

from __future__ import annotations

import json
import re

import pytest
from hypothesis import given, settings

from haunted_house.core.task_plan import (
    GRAPH_HEADING,
    TaskPlan,
    check_task_plan,
    parse_task_plan,
    print_task_plan,
    validate_task_plan,
)
from tests.room_ghost_support import covered_requirements, task_plans

pytestmark = pytest.mark.core

_GROUP_LINE = re.compile(r"- \[[ x]\] [1-9][0-9]*\. \S.*")
_LEAF_LINE = re.compile(r"  - \[[ x]\]\*? [1-9][0-9]*\.[1-9][0-9]* \S.*")
_META_LINE = re.compile(r"    - _(Writes|Requirements): \S.*_")


@settings(max_examples=200)
@given(plan=task_plans())
def test_task_plan_serialization_round_trip(plan: TaskPlan) -> None:
    # Feature: room-ghosts, Property 3: Task_Plan serialization round trip
    requirement_ids = covered_requirements(plan)
    assert validate_task_plan(plan, requirement_ids) == ()

    printed = print_task_plan(plan)
    parsed = parse_task_plan(printed)

    # The whole ordered model survives: ids, states, markers, refs, claims, waves.
    assert parsed == plan
    assert [leaf.task_id for leaf in parsed.leaves] == [leaf.task_id for leaf in plan.leaves]
    assert [leaf.document_index for leaf in parsed.leaves] == list(range(len(plan.leaves)))
    assert parsed.waves == plan.waves

    # Printing is canonical and the printed plan is still valid.
    assert print_task_plan(parsed) == printed
    assert check_task_plan(printed, requirement_ids).ok
    # Windows line endings are the same document.
    assert parse_task_plan(printed.replace("\n", "\r\n")) == plan

    # The document uses the Kiro grammar: numbered group and leaf checkboxes,
    # the optional marker, metadata bullets, and one fenced JSON graph.
    body, _, graph_section = printed.partition(GRAPH_HEADING)
    task_lines = [line for line in body.splitlines() if line.lstrip().startswith("- ")]
    assert task_lines
    for line in task_lines:
        assert _GROUP_LINE.fullmatch(line) or _LEAF_LINE.fullmatch(line) or _META_LINE.fullmatch(line)
    leaf_lines = [line for line in task_lines if _LEAF_LINE.fullmatch(line)]
    assert len(leaf_lines) == len(plan.leaves)
    for line, leaf in zip(leaf_lines, plan.leaves, strict=True):
        assert line.startswith("  - [x]" if leaf.complete else "  - [ ]")
        assert (line[7] == "*") == leaf.optional
    fenced = graph_section.strip()
    assert fenced.startswith("```json\n") and fenced.endswith("\n```")
    graph = json.loads(fenced[len("```json\n") : -len("\n```")])
    assert graph == {
        "waves": [{"id": index, "tasks": list(wave)} for index, wave in enumerate(plan.waves)]
    }
