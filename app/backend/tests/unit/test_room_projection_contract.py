"""The Room Ghosts read route's wire contract (tasks 8.1, 10.6).

The oracle in ``tests/room_projection_contract.py`` is proved against the
normative vectors the dashboard parser is tested with; the serializer is then
shown to emit, for each vector scenario, exactly a body of the valid set and
nothing the dashboard refuses.

Validates: Requirements 10.4, 10.5, 10.7, 11.1.
"""

from __future__ import annotations

import json
from pathlib import Path
from types import MappingProxyType

import pytest

from haunted_house.core.findings import Finding
from haunted_house.core.guardrail_events import Phase
from haunted_house.core.review import RepairProposal, ReviewFinding
from haunted_house.core.room_projection import (
    DocumentView,
    ReviewView,
    document_json,
    review_json,
    room_ghosts_to_json,
    task_plan_json,
)
from haunted_house.core.task_plan import LeafTask, TaskPlan
from haunted_house.core.workflow import ArtifactRevision
from haunted_house.core.workshop_scheduler import BackpressureState, TaskOutcome
from tests.room_projection_contract import refusal_path

pytestmark = pytest.mark.core

VECTORS = json.loads(
    (Path(__file__).resolve().parents[4] / "fixtures" / "room-ghosts" / "room-projection-vectors.json")
    .read_text(encoding="utf-8")
)
VALID = {item["name"]: item["value"] for item in VECTORS["valid"]}


@pytest.mark.parametrize("vector", VECTORS["valid"], ids=lambda item: item["name"])
def test_the_oracle_accepts_every_valid_vector(vector):
    assert refusal_path(vector["value"]) is None
    assert refusal_path(vector["value"], "demo-mansion", "demo") is None


@pytest.mark.parametrize("vector", VECTORS["invalid"], ids=lambda item: item["name"])
def test_the_oracle_refuses_every_invalid_vector_where_the_dashboard_does(vector):
    assert refusal_path(vector["value"]) == vector["refused_at"]


def test_the_oracle_refuses_an_answer_about_another_mansion_or_spec():
    assert refusal_path(VALID["empty"], "other-mansion", "demo") == "$.mansion_id"
    assert refusal_path(VALID["empty"], "demo-mansion", "other") == "$.spec_name"


# --- the serializer reproduces the vector scenarios ------------------------------------


def _document(phase: Phase, revision: int | None = None, digest: str = "", size: int = 0, **more) -> DocumentView:
    return DocumentView(
        phase,
        f".kiro/specs/demo/{phase.value}.md",
        None if revision is None else ArtifactRevision(revision, digest * 64, size),
        **more,
    )


def _content(name: str, index: int) -> str:
    return VALID[name]["documents"][index]["artifact"]["content"]


PLAN = TaskPlan(
    leaves=(
        LeafTask("1.1", "Create the entry model", False, True, ("1.1", "1.2"), ("src/guestbook/model.py",), 0),
        LeafTask("1.2", "Implement the entry store", False, False, ("1.3", "2.1", "2.2", "2.3"),
                 ("src/guestbook/store.py",), 1),
        LeafTask("1.3", "Write the property test for store ordering", True, False, ("1.3",),
                 ("tests/test_store_order.py",), 2),
        LeafTask("2.1", "Implement the page renderer", False, False, ("3.1", "3.2"),
                 ("src/guestbook/render.py", "src/guestbook/templates/*.html"), 3),
        LeafTask("2.2", "Write renderer unit tests", True, False, ("3.1", "3.2"), ("tests/render/**",), 4),
    ),
    waves=(("1.2", "2.1"), ("1.3", "2.2")),
)


def test_the_empty_scenario_is_emitted_exactly():
    body = room_ghosts_to_json(
        mansion_id="demo-mansion", spec_name="demo", version=0, integrity="valid", documents=()
    )
    assert body == VALID["empty"]
    assert refusal_path(body, "demo-mansion", "demo") is None


def test_the_invalid_requirements_scenario_is_emitted_exactly():
    expected = VALID["study_invalid_requirements"]
    findings = tuple(
        Finding(item["code"], item["location"], item["message"])
        for item in expected["documents"][0]["artifact"]["findings"]
    )
    body = room_ghosts_to_json(
        mansion_id="demo-mansion", spec_name="demo", version=14, integrity="valid",
        documents=[
            _document(Phase.REQUIREMENTS, 1, "a", 1200, content=_content("study_invalid_requirements", 0),
                      findings=findings),
        ],
        runs=expected["runs"],
    )
    assert body == expected
    assert refusal_path(body) is None


def test_the_workshop_scenario_is_emitted_exactly():
    expected = VALID["workshop_at_work"]
    plan = task_plan_json(
        PLAN,
        selected=frozenset({"1.2", "1.3", "2.1"}),
        outcomes={
            "1.2": TaskOutcome("active", 1, "task-1-2-a1"),
            "1.3": TaskOutcome("queued"),
            "2.1": TaskOutcome("queued"),
        },
        backpressure={"2.1": BackpressureState("2.1", 2, 4, "crew_capacity", 2)},
    )
    assert plan == expected["task_plan"]
    body = room_ghosts_to_json(
        mansion_id="demo-mansion", spec_name="demo", version=42, integrity="valid",
        documents=[
            _document(Phase.REQUIREMENTS, 1, "a", 1200, validated=True, content=_content("workshop_at_work", 0)),
            _document(Phase.DESIGN, 2, "b", 4871, validated=True, content=_content("workshop_at_work", 1)),
            _document(Phase.TASKS, 1, "c", 912, validated=True, content=_content("workshop_at_work", 2)),
        ],
        task_plan=plan,
        runs=expected["runs"],
    )
    assert body == expected
    assert refusal_path(body) is None


def test_the_review_scenario_is_emitted_exactly():
    expected = VALID["seance_review_changes_requested"]
    done = TaskPlan(
        leaves=tuple(
            LeafTask(leaf.task_id, leaf.title, leaf.optional, True, leaf.requirements, leaf.writes, leaf.document_index)
            for leaf in PLAN.leaves
        ),
        waves=(),
    )
    review = review_json(
        ReviewView(
            cycle=2,
            status="changes_requested",
            findings=(ReviewFinding("f-1", ("1.3",), ("src/guestbook/store.py",),
                                    "Entries are sorted by name, not kept in insertion order."),),
            repairs=(RepairProposal("4.1", "f-1", "Keep insertion order in the store",
                                    ("src/guestbook/store.py",), ("1.3",)),),
        )
    )
    body = room_ghosts_to_json(
        mansion_id="demo-mansion", spec_name="demo", version=60, integrity="valid",
        documents=[
            _document(Phase.REQUIREMENTS, 1, "a", 1200, validated=True, content=_content("workshop_at_work", 0)),
            _document(Phase.DESIGN, 2, "b", 4871, validated=True, content=_content("workshop_at_work", 1)),
            _document(Phase.TASKS, 1, "c", 912, validated=True, content=_content("workshop_at_work", 2)),
        ],
        task_plan=task_plan_json(done),
        seance_enabled=True,
        review=review,
    )
    assert body == expected
    assert refusal_path(body) is None


# --- whatever the inputs, nothing outside the contract is emitted ----------------------


def test_a_review_is_never_emitted_while_the_seance_room_is_off():
    review = review_json(ReviewView(cycle=1, status="reviewing"))
    body = room_ghosts_to_json(
        mansion_id="demo-mansion", spec_name="demo", version=3, integrity="valid",
        documents=(), review=review, seance_enabled=False,
    )
    assert body["review"] is None and refusal_path(body) is None


def test_a_pass_carries_no_finding_and_an_impossible_cycle_no_review():
    passed = review_json(
        ReviewView(1, "pass", findings=(ReviewFinding("f-1", ("1.1",), ("a.py",), "x"),))
    )
    assert passed is not None and passed["findings"] == [] and passed["repairs"] == []
    assert review_json(ReviewView(4, "blocked")) is None
    assert review_json(ReviewView(1, "idle")) is None


def test_unrepresentable_values_are_withheld_not_sent_malformed():
    # A document body over the limit is withheld; the revision is still shown.
    huge = document_json(_document(Phase.DESIGN, 1, "d", 9, content="x" * (512 * 1024 + 1)))
    assert huge["artifact"]["content"] is None
    # A plan with an identifier the contract has no form for is not sent at all.
    deep = TaskPlan((LeafTask("1.2.3", "Deep task", False, False, ("1.1",), ("src/a.py",), 0),), (("1.2.3",),))
    assert task_plan_json(deep) is None
    control = TaskPlan((LeafTask("1.1", "Bad\x07title", False, False, ("1.1",), ("src/a.py",), 0),), (("1.1",),))
    assert task_plan_json(control) is None
    # A checkbox decides completion: an outcome can never disagree with it.
    plan = task_plan_json(
        PLAN,
        outcomes={"1.1": TaskOutcome("failed", 2, "task-1-1-a2", reason_code="ghost_failed"),
                  "1.2": TaskOutcome("complete", 1, "task-1-2-a1")},
    )
    tasks = {task["task_id"]: task for task in plan["tasks"]}
    assert tasks["1.1"]["outcome"]["status"] == "complete"
    assert tasks["1.2"]["outcome"] is None
    # A delay Crew's Retry-After stretched is shown at the contract's cap.
    slow = task_plan_json(PLAN, backpressure={"2.1": BackpressureState("2.1", 1, 60, "crew_capacity", 1)})
    assert {t["task_id"]: t for t in slow["tasks"]}["2.1"]["backpressure"]["next_delay_seconds"] == 15
    body = room_ghosts_to_json(
        mansion_id="demo-mansion", spec_name="demo", version=1, integrity="broken",
        documents=[_document(Phase.DESIGN, 1, "d", 9, content="ok")], task_plan=plan,
    )
    assert body["integrity"] == "uncertain"
    assert refusal_path(body) is None


def test_a_wave_lists_only_tasks_that_name_it():
    plan = TaskPlan(
        leaves=(
            LeafTask("1.1", "One", False, False, ("1.1",), ("a.py",), 0),
            LeafTask("1.2", "Two", False, False, ("1.1",), ("b.py",), 1),
        ),
        # An invalid graph: 1.1 twice, and an unknown task.
        waves=(("1.1", "9.9"), ("1.1", "1.2")),
    )
    body = task_plan_json(plan)
    assert body["waves"] == [["1.1"], ["1.2"]]
    whole = room_ghosts_to_json(
        mansion_id="demo-mansion", spec_name="demo", version=1, integrity="valid", documents=(), task_plan=body
    )
    assert refusal_path(whole) is None
    assert MappingProxyType(whole)["task_plan"]["tasks"][0]["wave"] == 0
