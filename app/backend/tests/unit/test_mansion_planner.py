"""Focused examples for the pure mansion creation planner (task 2.5)."""

from dataclasses import replace
from itertools import permutations
from pathlib import PurePosixPath

import pytest

from haunted_house.core.mansion_planner import (
    MANSION_CONFLICT,
    CreateOutcome,
    EntryFact,
    EntryKind,
    ModelCreateRequest,
    ModelMansionRecord,
    ModelState,
    ProjectSnapshot,
    ProjectStatus,
    RequiredEntryStatus,
    apply_model_create,
    classify_project,
    classify_required_entry,
    execute_same_name_creates,
    minimal_project_tree_operations,
    plan_create,
)

pytestmark = pytest.mark.core


def fact(path, kind=EntryKind.DIRECTORY, *, canonical=None, content=b""):
    lexical = PurePosixPath(path)
    return EntryFact(
        lexical=lexical,
        canonical=PurePosixPath(canonical) if canonical else lexical,
        kind=kind,
        opaque_content=content,
    )


def snapshot(name="weather-station", *, target=EntryKind.DIRECTORY, extras=()):
    base = PurePosixPath("/approved/mansions") / name
    return ProjectSnapshot(
        target=fact(base, target),
        kiro=fact(base / ".kiro"),
        specs=fact(base / ".kiro/specs"),
        project_spec=fact(base / ".kiro/specs" / name),
        extra_entries=extras,
    )


def absent_snapshot(name="weather-station"):
    value = snapshot(name, target=EntryKind.MISSING)
    return replace(
        value,
        kiro=replace(value.kiro, kind=EntryKind.MISSING),
        specs=replace(value.specs, kind=EntryKind.MISSING),
        project_spec=replace(value.project_spec, kind=EntryKind.MISSING),
    )


def test_required_entries_must_be_real_strictly_contained_directories():
    target = fact("/approved/mansions/weather-station")

    assert (
        classify_required_entry(target, fact(target.lexical / ".kiro"))
        is RequiredEntryStatus.READY
    )
    assert (
        classify_required_entry(
            target,
            fact(target.lexical / ".kiro", EntryKind.MISSING),
        )
        is RequiredEntryStatus.MISSING
    )
    assert (
        classify_required_entry(
            target,
            fact(target.lexical / ".kiro", EntryKind.SYMLINK),
        )
        is RequiredEntryStatus.CONFLICT
    )
    assert (
        classify_required_entry(
            target,
            fact(
                target.lexical / ".kiro",
                canonical="/outside/.kiro",
            ),
        )
        is RequiredEntryStatus.CONFLICT
    )


@pytest.mark.parametrize(
    ("field", "replacement"),
    [
        ("target", fact("/approved/mansions/weather-station", EntryKind.FILE)),
        ("kiro", fact("/approved/mansions/weather-station/.kiro", EntryKind.FILE)),
        (
            "specs",
            fact(
                "/approved/mansions/weather-station/.kiro/specs",
                EntryKind.SYMLINK,
            ),
        ),
        (
            "project_spec",
            fact(
                "/approved/mansions/weather-station/.kiro/specs/weather-station",
                EntryKind.OTHER,
            ),
        ),
    ],
)
def test_any_conflicting_required_entry_makes_the_project_conflicting(
    field, replacement
):
    assert (
        classify_project(replace(snapshot(), **{field: replacement}))
        is ProjectStatus.CONFLICT
    )


def test_compatible_project_accepts_and_preserves_opaque_extra_entries():
    extras = (
        fact(
            "/approved/mansions/weather-station/README.md",
            EntryKind.FILE,
            content=b"opaque project bytes\x00\xff",
        ),
        fact(
            "/approved/mansions/weather-station/vendor-link",
            EntryKind.SYMLINK,
            canonical="/outside/vendor",
            content=b"opaque link payload",
        ),
    )
    project = snapshot(extras=extras)

    assert classify_project(project) is ProjectStatus.READY
    result = apply_model_create(ModelState(project=project), "weather-station")

    assert result.plan.action == "register_existing"
    assert result.outcome is CreateOutcome.EXISTING_COMPATIBLE
    assert result.operations == ()
    assert result.state.project is project
    assert result.state.project.extra_entries is extras
    assert result.state.project.extra_entries == extras
    assert result.record == ModelMansionRecord(
        name="weather-station",
        project_spec="weather-station",
        relative_path="weather-station",
        origin="existing",
    )


def test_plan_distinguishes_create_adopt_repeat_and_conflict():
    ready = snapshot()
    missing = absent_snapshot()
    conflict = replace(ready, kiro=replace(ready.kiro, kind=EntryKind.FILE))

    assert classify_project(missing) is ProjectStatus.MISSING
    assert plan_create(missing, registered=False).action == "create_tree"
    assert plan_create(ready, registered=False).action == "register_existing"
    assert plan_create(ready, registered=True).action == "return_existing"
    rejected = plan_create(conflict, registered=False)
    assert rejected.action == "reject"
    assert rejected.error_code == MANSION_CONFLICT


def test_inconsistent_absent_snapshot_is_rejected_without_losing_opaque_data():
    extra = fact(
        "/approved/mansions/weather-station/unreachable.bin",
        EntryKind.FILE,
        content=b"must survive",
    )
    project = replace(absent_snapshot(), extra_entries=(extra,))
    state = ModelState(project=project)

    result = apply_model_create(state, "weather-station")

    assert result.plan.action == "reject"
    assert result.plan.error_code == MANSION_CONFLICT
    assert result.outcome is None
    assert result.operations == ()
    assert result.state is state
    assert result.state.project.extra_entries == (extra,)


def test_creation_authorizes_exact_minimal_directory_tree_and_one_record():
    other = ModelMansionRecord(
        name="alpha",
        project_spec="alpha",
        relative_path="alpha",
        origin="existing",
    )
    initial = ModelState(project=absent_snapshot(), registry=(other,))

    result = apply_model_create(initial, "weather-station")

    assert result.outcome is CreateOutcome.CREATED
    assert [operation.action for operation in result.operations] == [
        "create_directory",
        "create_directory",
        "create_directory",
        "create_directory",
    ]
    assert tuple(operation.relative_path for operation in result.operations) == (
        PurePosixPath("weather-station"),
        PurePosixPath("weather-station/.kiro"),
        PurePosixPath("weather-station/.kiro/specs"),
        PurePosixPath("weather-station/.kiro/specs/weather-station"),
    )
    assert result.operations == minimal_project_tree_operations("weather-station")
    assert classify_project(result.state.project) is ProjectStatus.READY
    assert {entry.kind for entry in (
        result.state.project.target,
        *result.state.project.required_descendants,
    )} == {EntryKind.DIRECTORY}
    assert result.record == ModelMansionRecord(
        name="weather-station",
        project_spec="weather-station",
        relative_path="weather-station",
        origin="created",
    )
    assert result.state.registry == (other, result.record)


def test_repeated_create_is_a_fixed_point_and_returns_the_same_record():
    first = apply_model_create(
        ModelState(project=absent_snapshot()), "weather-station"
    )
    second = apply_model_create(first.state, "weather-station")

    assert first.outcome is CreateOutcome.CREATED
    assert second.outcome is CreateOutcome.EXISTING_COMPATIBLE
    assert second.plan.action == "return_existing"
    assert second.operations == ()
    assert second.record is first.record
    assert second.state is first.state
    assert len(second.state.registry) == 1


def test_conflict_transition_preserves_the_complete_state():
    extra = fact(
        "/approved/mansions/weather-station/notes.bin",
        EntryKind.FILE,
        content=b"do not touch",
    )
    project = replace(
        snapshot(extras=(extra,)),
        specs=replace(snapshot().specs, kind=EntryKind.FILE, opaque_content=b"x"),
    )
    state = ModelState(project=project)

    result = apply_model_create(state, "weather-station")

    assert result.plan.action == "reject"
    assert result.plan.error_code == MANSION_CONFLICT
    assert result.state is state
    assert result.state.project.extra_entries == (extra,)


def test_same_name_scheduling_orders_converge_with_at_most_one_created_outcome():
    initial = ModelState(project=absent_snapshot())
    requests = (
        ModelCreateRequest("request-a", "weather-station"),
        ModelCreateRequest("request-b", "weather-station"),
        ModelCreateRequest("request-c", "weather-station"),
    )
    executions = [
        execute_same_name_creates(initial, order)
        for order in permutations(requests)
    ]

    assert all(execution.state == executions[0].state for execution in executions)
    for execution in executions:
        outcomes = [response.result.outcome for response in execution.responses]
        assert outcomes.count(CreateOutcome.CREATED) == 1
        assert outcomes.count(CreateOutcome.EXISTING_COMPATIBLE) == 2
        assert len(execution.state.registry) == 1
        assert classify_project(execution.state.project) is ProjectStatus.READY


def test_same_name_executor_refuses_to_model_different_targets():
    state = ModelState(project=absent_snapshot())

    with pytest.raises(ValueError, match="same_name_requests_required"):
        execute_same_name_creates(
            state,
            (
                ModelCreateRequest("one", "weather-station"),
                ModelCreateRequest("two", "other-mansion"),
            ),
        )
