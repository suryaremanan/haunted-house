"""Property 5 for haunted_house.core.mansion_planner.

Each example starts from a safe absent target and a valid registry, then
serializes a non-empty batch of labelled same-name create requests in two
generated orders. The expected Minimal_Project_Tree is written out here by
hand rather than taken from the planner.
"""

import copy
from collections import Counter
from pathlib import PurePosixPath

import pytest
from hypothesis import given
from hypothesis import strategies as st

from haunted_house.core.mansion_planner import (
    CreateOutcome,
    EntryFact,
    EntryKind,
    ModelCreateRequest,
    ModelMansionRecord,
    ModelState,
    ProjectSnapshot,
    ProjectStatus,
    apply_model_create,
    classify_project,
    execute_same_name_creates,
)

pytestmark = pytest.mark.core

# Feature: mansion-lifecycle, Property 5: Creation is exact, idempotent, and confluent

ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789"
segments = st.text(alphabet=ALNUM, min_size=1, max_size=10)
valid_names = st.one_of(
    st.lists(segments, min_size=1, max_size=4).map("-".join).filter(
        lambda name: len(name) <= 40
    ),
    st.sampled_from(["a", "0", "a" * 40, "a-" * 19 + "ab", "weather-station"]),
)
root_paths = st.lists(
    st.sampled_from(["home", "op", "workspace", "haunted-house", "mansions", "x"]),
    min_size=1,
    max_size=4,
).map(lambda parts: PurePosixPath("/", *parts))


def absent_snapshot(root: PurePosixPath, name: str) -> ProjectSnapshot:
    base = root / name

    def missing(path: PurePosixPath) -> EntryFact:
        return EntryFact(lexical=path, canonical=path, kind=EntryKind.MISSING)

    return ProjectSnapshot(
        target=missing(base),
        kiro=missing(base / ".kiro"),
        specs=missing(base / ".kiro" / "specs"),
        project_spec=missing(base / ".kiro" / "specs" / name),
    )


@st.composite
def initial_states(draw):
    name = draw(valid_names)
    root = draw(root_paths)
    others = draw(
        st.lists(valid_names.filter(lambda item: item != name), unique=True, max_size=4)
    )
    # A record may already exist for a project that has since gone missing.
    names = [*others, name] if draw(st.booleans()) else others
    registry = tuple(
        ModelMansionRecord(
            name=item,
            project_spec=item,
            relative_path=item,
            origin=draw(st.sampled_from(["created", "existing"])),
        )
        for item in sorted(names)
    )
    return name, root, ModelState(project=absent_snapshot(root, name), registry=registry)


@st.composite
def scenarios(draw):
    name, root, state = draw(initial_states())
    count = draw(st.integers(min_value=1, max_value=6))
    requests = [ModelCreateRequest(request_id=f"r{index}", name=name) for index in range(count)]
    first_order = draw(st.permutations(requests))
    second_order = draw(st.permutations(requests))
    return name, root, state, tuple(first_order), tuple(second_order)


def directories(snapshot: ProjectSnapshot) -> list[tuple[PurePosixPath, EntryKind]]:
    return [
        (entry.lexical, entry.kind)
        for entry in (
            snapshot.target,
            snapshot.kiro,
            snapshot.specs,
            snapshot.project_spec,
        )
    ]


@given(scenario=scenarios())
def test_same_name_creates_are_exact_idempotent_and_confluent(scenario):
    name, root, initial, first_order, second_order = scenario
    before = copy.deepcopy(initial)
    initial_record = next((r for r in initial.registry if r.name == name), None)
    assert classify_project(initial.project) == ProjectStatus.MISSING

    execution = execute_same_name_creates(initial, first_order)
    first = execution.responses[0].result
    final = execution.state

    # Exact: the first operation adds the mansion directory and its three
    # required descendants, in parent-before-child order, and nothing else.
    assert first.outcome == CreateOutcome.CREATED
    assert [str(op.relative_path) for op in first.operations] == [
        name,
        f"{name}/.kiro",
        f"{name}/.kiro/specs",
        f"{name}/.kiro/specs/{name}",
    ]
    assert all(op.action == "create_directory" for op in first.operations)
    assert all(not op.relative_path.is_absolute() for op in first.operations)
    assert all(".." not in op.relative_path.parts for op in first.operations)
    base = root / name
    assert directories(first.state.project) == [
        (base, EntryKind.DIRECTORY),
        (base / ".kiro", EntryKind.DIRECTORY),
        (base / ".kiro" / "specs", EntryKind.DIRECTORY),
        (base / ".kiro" / "specs" / name, EntryKind.DIRECTORY),
    ]
    # No file: no extra entry appears and no created entry carries content.
    assert first.state.project.extra_entries == ()
    for entry in (
        first.state.project.target,
        first.state.project.kiro,
        first.state.project.specs,
        first.state.project.project_spec,
    ):
        assert entry.opaque_content == b""
        assert entry.kind != EntryKind.FILE
    assert classify_project(first.state.project) == ProjectStatus.READY

    # Project_Spec equals Mansion_Name; exactly one record for the name.
    assert first.record is not None
    assert first.record.name == first.record.project_spec == name
    assert first.record.relative_path == name
    assert first.record.origin == (initial_record.origin if initial_record else "created")
    matching = [record for record in final.registry if record.name == name]
    assert matching == [first.record]
    assert [r for r in final.registry if r.name != name] == [
        r for r in before.registry if r.name != name
    ]
    assert [r.name for r in final.registry] == sorted(r.name for r in final.registry)
    assert len({r.name for r in final.registry}) == len(final.registry)

    # At most one ``created``; every later operation is an unchanged return.
    outcomes = [response.result.outcome for response in execution.responses]
    assert outcomes.count(CreateOutcome.CREATED) == 1
    assert outcomes[0] == CreateOutcome.CREATED
    for response in execution.responses[1:]:
        assert response.result.outcome == CreateOutcome.EXISTING_COMPATIBLE
        assert response.result.operations == ()
        assert response.result.state == first.state
        assert response.result.record == first.record
    assert final == first.state

    # Fixed point: more creates after convergence change nothing.
    again = apply_model_create(final, name)
    assert again.state == final
    assert again.outcome == CreateOutcome.EXISTING_COMPATIBLE
    assert again.operations == ()
    assert execute_same_name_creates(final, first_order).state == final

    # Confluent: another scheduling reaches the same tree and record, with
    # the same multiset of outcomes; only the winner's label may differ.
    other = execute_same_name_creates(initial, second_order)
    assert other.state == final
    assert Counter(r.result.outcome for r in other.responses) == Counter(outcomes)
    assert {r.request_id for r in other.responses} == {
        r.request_id for r in execution.responses
    }
    assert [r.request_id for r in other.responses] == [r.request_id for r in second_order]
    assert other.responses[0].result.outcome == CreateOutcome.CREATED

    # The initial model value was never mutated in place.
    assert initial == before


@given(case=initial_states(), other=valid_names)
def test_requests_for_different_names_cannot_share_one_execution(case, other):
    name, _root, state = case
    if other == name:
        other = name + "-x" if len(name) <= 38 else "x"
    requests = (
        ModelCreateRequest(request_id="r0", name=name),
        ModelCreateRequest(request_id="r1", name=other),
    )

    with pytest.raises(ValueError):
        execute_same_name_creates(state, requests)

    assert execute_same_name_creates(state, ()).state == state
