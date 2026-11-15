"""Examples for the Task_Plan codec: grammar, findings, and claim overlap.

Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 13.5, 13.6, 13.7, 13.8.
"""

from __future__ import annotations

import itertools
from dataclasses import replace

import pytest

from haunted_house.core.findings import MAX_FINDINGS, TRUNCATED_CODE
from haunted_house.core.task_plan import (
    GRAPH_HEADING,
    MAX_LEAVES,
    MAX_PLAN_BYTES,
    LeafTask,
    TaskPlan,
    TaskPlanError,
    check_task_plan,
    claim_covers,
    claims_may_overlap,
    is_claim_path,
    parse_task_plan,
    print_task_plan,
    validate_task_plan,
)
from tests.room_ghost_support import load_fixture, read_fixture

pytestmark = pytest.mark.core

_EXPECTED = load_fixture("task-plan-valid.json")
_VALID = read_fixture("task-plan-valid.md")
_REQUIREMENTS = frozenset(_EXPECTED["requirement_ids"])


def _codes(markdown: str, requirement_ids: frozenset[str] = _REQUIREMENTS) -> list[tuple[str, str]]:
    return [(item.code, item.location) for item in check_task_plan(markdown, requirement_ids).findings]


def _parse_codes(markdown: object) -> list[tuple[str, str]]:
    with pytest.raises(TaskPlanError) as caught:
        parse_task_plan(markdown)  # type: ignore[arg-type]
    return [(item.code, item.location) for item in caught.value.findings]


def _graph(body: str) -> str:
    return f"{GRAPH_HEADING}\n\n```json\n{body}\n```\n"


_ONE = "- [ ] 1. Group\n  - [ ] 1.1 Leaf\n    - _Writes: src/a.py_\n    - _Requirements: 1.1_\n\n"


def test_the_fixture_document_parses_to_the_expected_model() -> None:
    plan = parse_task_plan(_VALID)
    assert [
        {
            "task_id": leaf.task_id,
            "title": leaf.title,
            "optional": leaf.optional,
            "complete": leaf.complete,
            "requirements": list(leaf.requirements),
            "writes": list(leaf.writes),
        }
        for leaf in plan.leaves
    ] == _EXPECTED["leaves"]
    assert [leaf.document_index for leaf in plan.leaves] == list(range(len(plan.leaves)))
    assert [list(wave) for wave in plan.waves] == _EXPECTED["waves"]
    check = check_task_plan(_VALID, _REQUIREMENTS)
    assert check.ok and check.plan == plan


def test_printing_the_fixture_is_canonical_and_equivalent() -> None:
    plan = parse_task_plan(_VALID)
    printed = print_task_plan(plan)
    assert parse_task_plan(printed) == plan
    assert print_task_plan(parse_task_plan(printed)) == printed
    assert "- [ ] 1. Task group 1" in printed
    assert "  - [x] 1.1 Create the entry model" in printed
    assert "  - [ ]* 1.3 Write the property test for store ordering" in printed
    assert "    - _Requirements: 1.3, 2.1, 2.2, 2.3_" in printed
    # A group is checked only when every leaf in it is complete.
    done = TaskPlan(tuple(replace(leaf, complete=True) for leaf in plan.leaves), ())
    assert "- [x] 1. Task group 1" in print_task_plan(done)


@pytest.mark.parametrize(
    ("markdown", "expected"),
    [
        ("", ("document_empty", "document")),
        ("  \n\t\n", ("document_empty", "document")),
        (_ONE, ("graph_missing", "graph")),
        (_ONE + GRAPH_HEADING + "\n\nno block here\n", ("graph_missing", "graph")),
        (_ONE + GRAPH_HEADING + "\n\n```json\n{\"waves\": []}\n", ("graph_missing", "graph")),
        (_ONE + _graph("{not json"), ("graph_invalid", "graph")),
        (_ONE + _graph('{"waves": [], "waves": []}'), ("graph_invalid", "graph")),
        (_ONE + _graph('{"waves": {}}'), ("graph_invalid", "graph")),
        (_ONE + _graph('{"waves": [], "extra": 1}'), ("graph_invalid", "graph")),
        (_ONE + _graph('{"waves": [["1.1"]]}'), ("graph_invalid", "wave:0")),
        (_ONE + _graph('{"waves": [{"id": "0", "tasks": ["1.1"]}]}'), ("graph_invalid", "wave:0")),
        (_ONE + _graph('{"waves": [{"id": true, "tasks": ["1.1"]}]}'), ("graph_invalid", "wave:0")),
        (_ONE + _graph('{"waves": [{"id": 0, "tasks": [1.1]}]}'), ("graph_invalid", "wave:0")),
        (_ONE + _graph('{"waves": [{"id": 1, "tasks": ["1.1"]}]}'), ("wave_not_contiguous", "wave:1")),
        (
            _ONE + _graph('{"waves": [{"id": 0, "tasks": ["1.1"]}]}') + _graph('{"waves": []}'),
            ("graph_duplicate", "line:11"),
        ),
        ("- [ ] 1.01 Leaf\n" + _graph('{"waves": []}'), ("task_id_invalid", "line:1")),
        ("- [ ] 1.2.3 Leaf\n" + _graph('{"waves": []}'), ("task_id_invalid", "line:1")),
        ("- [ ] Leaf without a number\n" + _graph('{"waves": []}'), ("task_id_missing", "line:1")),
        (
            _ONE.replace("src/a.py", "../outside.py") + _graph('{"waves": []}'),
            ("claim_invalid", "task:1.1"),
        ),
        (
            _ONE.replace("src/a.py", "/etc/hosts") + _graph('{"waves": []}'),
            ("claim_invalid", "task:1.1"),
        ),
        (
            _ONE.replace("src/a.py", "src/a**b.py") + _graph('{"waves": []}'),
            ("claim_invalid", "task:1.1"),
        ),
        (
            _ONE.replace("_Requirements: 1.1_", "_Requirements: Requirement 1_")
            + _graph('{"waves": []}'),
            ("requirement_reference_malformed", "task:1.1"),
        ),
        (
            _ONE.replace("_Requirements: 1.1_", "_Requirements: 1.3-1.1_") + _graph('{"waves": []}'),
            ("requirement_reference_malformed", "task:1.1"),
        ),
        (
            _ONE + "    - _Writes: src/b.py_\n" + _graph('{"waves": []}'),
            ("task_metadata_duplicate", "task:1.1"),
        ),
        (_ONE.replace("Leaf", "Le\x00af") + _graph('{"waves": []}'), ("document_invalid", "document")),
    ],
)
def test_text_that_does_not_parse_names_the_fault(markdown: str, expected: tuple[str, str]) -> None:
    assert expected in _parse_codes(markdown)
    check = check_task_plan(markdown, frozenset({"1.1"}))
    assert check.plan is None and not check.ok


def test_non_text_and_oversized_documents() -> None:
    assert _parse_codes(None) == [("document_invalid", "document")]
    assert _parse_codes(b"- [ ] 1.1 x") == [("document_invalid", "document")]
    assert _parse_codes("x" * (MAX_PLAN_BYTES + 1)) == [("document_too_large", "document")]
    many = "".join(f"- [ ] 1.{index} Leaf\n" for index in range(1, MAX_LEAVES + 2))
    assert ("plan_too_large", "document") in _parse_codes(many + _graph('{"waves": []}'))


def test_group_metadata_prose_and_fenced_checkboxes_are_not_leaves() -> None:
    markdown = (
        "- [ ] 1. Group\n"
        "  - _Requirements: 9.9_\n"
        "  - [ ] 1.1. Leaf with a trailing dot\n"
        "    - plain prose bullet\n"
        "    _Requirements: 1.1, 1.1, 1.1-1.2_\n"
        "    * _Writes: `src/a_b_`, src/c d.py ,_\n"
        "- [X]* 2. Optional group\n"
        "```\n- [ ] 7.7 fenced\n```\n" + _graph('{ "waves": [ { "id": 0, "tasks": ["1.1"] } ] }')
        + "\nTrailing prose with a - [ ] 8.8 checkbox is ignored after the graph.\n"
    )
    plan = parse_task_plan(markdown)
    assert plan == TaskPlan(
        leaves=(
            LeafTask(
                "1.1",
                "Leaf with a trailing dot",
                False,
                False,
                ("1.1", "1.2"),
                ("src/a_b_", "src/c d.py"),
                0,
            ),
        ),
        waves=(("1.1",),),
    )
    assert parse_task_plan(print_task_plan(plan)) == plan


@pytest.mark.parametrize(
    ("change", "expected"),
    [
        (lambda text: text.replace('"1.2", "2.1"', '"2.1"'), ("graph_missing_task", "task:1.2")),
        (lambda text: text.replace('"1.3", "2.2"', '"1.3", "2.2", "1.2"'), ("graph_duplicate_task", "task:1.2")),
        (lambda text: text.replace('"1.3", "2.2"', '"1.3", "2.2", "4.1"'), ("graph_unknown_task", "task:4.1")),
        (lambda text: text.replace('"1.3", "2.2"', '"1.3", "2.2", "3"'), ("graph_non_leaf_task", "task:3")),
        (
            lambda text: text.replace('{ "id": 1, "tasks": ["1.3", "2.2"] }', '{ "id": 1, "tasks": ["1.3", "2.2"] },\n    { "id": 2, "tasks": [] }'),
            ("wave_empty", "wave:2"),
        ),
        (
            lambda text: text.replace("_Writes: src/guestbook/render.py,", "_Writes: src/guestbook/**,"),
            ("claim_conflict", "wave:0 1.2 2.1"),
        ),
        (
            lambda text: text.replace("    - _Writes: tests/render/**_\n", ""),
            ("claim_missing", "task:2.2"),
        ),
        (
            lambda text: text.replace("tests/render/**", ".kiro/specs/guest-book/tasks.md"),
            ("claim_not_writable", "task:2.2"),
        ),
        (
            lambda text: text.replace("tests/render/**", "config/.env"),
            ("claim_not_writable", "task:2.2"),
        ),
        (
            lambda text: text.replace("    - _Requirements: 1.1, 1.2_\n", ""),
            ("requirements_missing", "task:1.1"),
        ),
        (
            lambda text: text.replace("_Requirements: 1.1, 1.2_", "_Requirements: 1.1_"),
            ("requirement_uncovered", "requirement:1.2"),
        ),
        (
            lambda text: text.replace("_Requirements: 1.1, 1.2_", "_Requirements: 1.1, 1.2, 7.7_"),
            ("requirement_unknown", "task:1.1"),
        ),
        (
            lambda text: text.replace("- [ ] 2.1 Implement", "- [ ] 1.2 Implement"),
            ("task_duplicate", "task:1.2"),
        ),
        (
            lambda text: text.replace("- [ ]* 2.2 Write", "- [ ]* 1.4 Write").replace('"2.2"', '"1.4"'),
            ("task_order", "task:1.4"),
        ),
        (
            lambda text: text.replace("- [ ] 2.1 Implement the page renderer", "- [ ] 2.1"),
            ("task_title_invalid", "task:2.1"),
        ),
    ],
)
def test_each_semantic_fault_names_its_task_wave_or_requirement(change, expected) -> None:  # type: ignore[no-untyped-def]
    mutated = change(_VALID)
    assert mutated != _VALID
    assert expected in _codes(mutated)


def test_findings_are_bounded_and_carry_no_document_text() -> None:
    leaves = "".join(f"- [ ] 1.{index} SECRET-TITLE-{index}\n" for index in range(1, 120))
    check = check_task_plan(leaves + _graph('{"waves": [{"id": 0, "tasks": ["<script>"]}]}'), frozenset())
    assert len(check.findings) == MAX_FINDINGS
    assert check.findings[-1].code == TRUNCATED_CODE
    assert all("SECRET-TITLE" not in item.message + item.location for item in check.findings)
    unknown = check_task_plan(_ONE + _graph('{"waves": [{"id": 0, "tasks": ["<script>", "1.1"]}]}'), frozenset({"1.1"}))
    assert [(item.code, item.location) for item in unknown.findings] == [("graph_unknown_task", "task:?")]


def test_print_refuses_a_plan_the_grammar_cannot_spell() -> None:
    good = LeafTask("1.1", "Leaf", False, False, ("1.1",), ("src/a.py",), 0)
    for bad in (
        replace(good, task_id="1"),
        replace(good, title="two\nlines"),
        replace(good, title=" padded"),
        replace(good, title=""),
        replace(good, writes=("a,b",)),
        replace(good, writes=("../a",)),
        replace(good, requirements=("one",)),
        replace(good, document_index=3),
    ):
        with pytest.raises(TaskPlanError):
            print_task_plan(TaskPlan((bad,), ()))
        assert validate_task_plan(TaskPlan((bad,), ()), frozenset({"1.1"}))
    with pytest.raises(TaskPlanError):
        print_task_plan(TaskPlan((good, good), ()))


@pytest.mark.parametrize(
    ("left", "right", "overlap"),
    [
        (("src/a.py",), ("src/b.py",), False),
        (("src/a.py",), ("src/a.py",), True),
        (("src/a.py",), ("SRC/A.PY",), True),
        (("src",), ("src/a.py",), True),
        (("src/**",), ("src/deep/a.py",), True),
        (("src/**",), ("tests/**",), False),
        (("src/*.py",), ("src/a.md",), False),
        (("src/*.py",), ("src/a.py",), True),
        (("src/*.py",), ("src/sub/a.py",), False),
        # docs/b.md could be a folder that holds an a.py: undecided, so overlap.
        (("**/a.py",), ("docs/b.md",), True),
        (("docs/**/a.py",), ("src/b.md",), False),
        (("**/a.py",), ("docs/a.py",), True),
        (("a*b",), ("c*",), False),
        (("a*b",), ("ab*",), True),
        (("src/[ab].py",), ("docs/x.md",), True),
        (("src/a?.py",), ("docs/x.md",), True),
        (("../x",), ("docs/x.md",), True),
        ((), ("docs/x.md",), True),
        (("src/a.py", "docs/x.md"), ("tests/t.py", "docs/x.md"), True),
        (("src/a.py", "docs/x.md"), ("tests/t.py", "docs/y.md"), False),
    ],
)
def test_claim_overlap_examples(left: tuple[str, ...], right: tuple[str, ...], overlap: bool) -> None:
    assert claims_may_overlap(left, right) is overlap
    assert claims_may_overlap(right, left) is overlap


def test_disjoint_claims_never_share_a_path() -> None:
    """Exhaustive reference check: ``False`` from the overlap test is a proof."""

    names = ("a", "b", "ab")
    paths = [
        "/".join(parts)
        for depth in (1, 2, 3)
        for parts in itertools.product(names, repeat=depth)
    ]
    components = ("a", "b", "ab", "*", "a*", "*b", "**")
    patterns = [
        "/".join(parts)
        for depth in (1, 2, 3)
        for parts in itertools.product(components, repeat=depth)
    ]
    matches = {
        pattern: frozenset(path for path in paths if claim_covers((pattern,), path))
        for pattern in patterns
    }
    assert matches["a/**"] == frozenset(path for path in paths if path.startswith("a/") or path == "a")
    proven = 0
    for left, right in itertools.combinations(patterns, 2):
        if claims_may_overlap((left,), (right,)):
            continue
        proven += 1
        assert not matches[left] & matches[right], (left, right)
        # Nor is a file of one inside a folder the other names.
        assert not any(
            deep.startswith(shallow + "/")
            for shallow in matches[left]
            for deep in matches[right]
        ), (left, right)
        assert not any(
            deep.startswith(shallow + "/")
            for shallow in matches[right]
            for deep in matches[left]
        ), (left, right)
    assert proven > 1000


def test_claim_covers_reads_like_a_room_policy_allow_list() -> None:
    claim = ("src/guestbook/**", "docs/*.md", "README.md")
    for inside in ("src/guestbook/a.py", "src/guestbook/x/y.py", "docs/guide.md", "README.md"):
        assert claim_covers(claim, inside)
    for outside in (
        "src/other/a.py",
        "docs/sub/guide.md",
        "readme.md",
        "../README.md",
        "/README.md",
        "src/guestbook/.env",
        "src/guestbook/.git/config",
    ):
        assert not claim_covers(claim, outside)
    assert not claim_covers(("src/[ab].py",), "src/a.py")
    assert not claim_covers((), "README.md")
    assert is_claim_path("src/a b.py") and not is_claim_path(" src/a.py")
