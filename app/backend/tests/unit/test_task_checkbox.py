"""The pure Task_Plan checkbox edit and completion fold (task 6.8).

Validates: Requirements 8.5, 9.6, 9.7, 9.8.
"""

from __future__ import annotations

import pytest

from haunted_house.core.room_ghost_events import RoomGhostEventKind as K
from haunted_house.core.room_ghost_events import build_room_ghost_candidate
from haunted_house.core.task_checkbox import (
    CheckboxError,
    check_task,
    completion_id_for,
    fold_completions,
)
from haunted_house.core.task_plan import parse_task_plan
from tests.room_ghost_runtime_support import TASKS, WORKSHOP_TASKS, acknowledge, tinker_scope

pytestmark = pytest.mark.core

SHA = {name: name * 64 for name in "abc"}
PATH = ".kiro/specs/demo-feature/tasks.md"


def test_exactly_one_checkbox_changes() -> None:
    edit = check_task(WORKSHOP_TASKS, "1.3")
    assert edit.changed
    before, after = WORKSHOP_TASKS.splitlines(), edit.text.splitlines()
    changed = [(a, b) for a, b in zip(before, after, strict=True) if a != b]
    assert changed == [("  - [ ] 1.3 Implement the page renderer", "  - [x] 1.3 Implement the page renderer")]
    plan = parse_task_plan(edit.text)
    assert [leaf.task_id for leaf in plan.leaves if leaf.complete] == ["1.3"]
    assert plan.waves == parse_task_plan(WORKSHOP_TASKS).waves == edit.plan.waves


def test_optional_marker_line_endings_and_trailing_bytes_survive() -> None:
    text = WORKSHOP_TASKS.replace("\n", "\r\n") + "\r\nfooter without newline"
    edit = check_task(text, "2.2")
    assert "  - [x]* 2.2 Write store ordering tests\r\n" in edit.text
    assert edit.text.replace("[x]* 2.2", "[ ]* 2.2") == text
    assert parse_task_plan(edit.text).leaves[5].optional


def test_already_checked_task_is_not_edited() -> None:
    edit = check_task(TASKS, "1.1")  # complete in the fixture
    assert not edit.changed and edit.text == TASKS
    once = check_task(WORKSHOP_TASKS, "1.1")
    assert check_task(once.text, "1.1").text == once.text


def test_a_lookalike_line_outside_the_plan_is_never_the_one_changed() -> None:
    lookalike = "```text\n  - [ ] 1.2 Implement the entry store\n```\n\n"
    text = WORKSHOP_TASKS.replace("## Tasks\n", "## Tasks\n\n" + lookalike, 1)
    try:
        edit = check_task(text, "1.2")
    except CheckboxError as error:
        assert error.code in ("task_plan_invalid", "task_not_found")  # refused, never guessed
    else:
        assert lookalike in edit.text and edit.text.count("[x] 1.2") == 1
        assert [leaf.task_id for leaf in parse_task_plan(edit.text).leaves if leaf.complete] == ["1.2"]


@pytest.mark.parametrize(
    "text, task_id, code",
    [
        (WORKSHOP_TASKS, "9.9", "task_not_found"),
        (WORKSHOP_TASKS, "1", "invalid_request"),
        (WORKSHOP_TASKS, "../1.1", "invalid_request"),
        ("not a plan", "1.1", "task_plan_invalid"),
        (None, "1.1", "invalid_request"),
    ],
)
def test_refusals_are_codes(text, task_id, code) -> None:
    with pytest.raises(CheckboxError) as refused:
        check_task(text, task_id)
    assert refused.value.code == code


def _record(scope, kind, completion_id, task_id="1.1", **extra):
    data = {"completion_id": completion_id, "task_id": task_id, "claim_id": "claim-1",
            "document_path": PATH, **extra}
    return build_room_ghost_candidate(scope, kind, data)


def test_completion_fold_needs_an_intent_and_settles_it() -> None:
    scope = tinker_scope(1)
    first = completion_id_for(scope, "1.1", SHA["a"])
    assert completion_id_for(scope, "1.1", SHA["a"], 1) != first
    assert completion_id_for(tinker_scope(2), "1.1", SHA["a"]) != first
    intent = _record(scope, K.TASK_COMPLETION_INTENDED, first, base_sha256=SHA["a"], sha256=SHA["b"], size_bytes=9)
    done = _record(scope, K.TASK_COMPLETED, first, sha256=SHA["b"], size_bytes=9, evidence=[])
    abandoned = _record(scope, K.TASK_COMPLETION_ABANDONED, first, code="stale_revision")
    orphan = _record(scope, K.TASK_COMPLETED, "done-orphan", task_id="1.2", sha256=SHA["b"], size_bytes=9,
                     evidence=[{"path": "src/a.py", "sha256": SHA["c"]}])
    wrong_digest = _record(scope, K.TASK_COMPLETED, first, sha256=SHA["c"], size_bytes=9, evidence=[])

    pending = fold_completions(acknowledge([intent]))
    assert list(pending.pending) == [first] and not pending.completed
    assert pending.pending_for_document(PATH) and pending.intent_count(scope, "1.1") == 1

    settled = fold_completions(acknowledge([intent, done]))
    assert set(settled.completed) == {"1.1"} and not settled.pending
    withdrawn = fold_completions(acknowledge([intent, abandoned, done]))
    assert not withdrawn.completed and not withdrawn.pending  # evidence after a withdrawal counts for nothing
    assert not fold_completions(acknowledge([orphan, done])).completed  # no intent, no completion
    mismatch = fold_completions(acknowledge([intent, wrong_digest]))
    assert not mismatch.completed and list(mismatch.pending) == [first]
