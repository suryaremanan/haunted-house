"""Property 4 for haunted_house.core.mansion_planner.

Every generated tree already has an entry at the mansion path. Required
entries take every kind (missing, directory, file, symlink, other) at every
position, with canonical locations inside the target, equal to it, in a prefix
sibling, outside it, or unknown. Extra entries carry opaque bytes. The
compatibility oracle compares plain component tuples and shares no helper with
the planner.
"""

import copy
from pathlib import PurePosixPath

import pytest
from hypothesis import given
from hypothesis import strategies as st

from haunted_house.core.mansion_planner import (
    CreateOutcome,
    EntryFact,
    EntryKind,
    ModelMansionRecord,
    ModelState,
    ProjectSnapshot,
    ProjectStatus,
    apply_model_create,
    classify_project,
    plan_create,
)

pytestmark = pytest.mark.core

# Feature: mansion-lifecycle, Property 4: Existing project classification preserves every entry

ROOT = PurePosixPath("/approved/mansions")
ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789"

segments = st.text(alphabet=ALNUM, min_size=1, max_size=8)
valid_names = st.lists(segments, min_size=1, max_size=3).map("-".join)
opaque_bytes = st.binary(max_size=48)
EXISTING_KINDS = [
    EntryKind.DIRECTORY,
    EntryKind.FILE,
    EntryKind.SYMLINK,
    EntryKind.OTHER,
]


def reference_contained(target: PurePosixPath | None, entry: PurePosixPath | None) -> bool:
    if target is None or entry is None:
        return False
    target_parts, entry_parts = tuple(target.parts), tuple(entry.parts)
    return (
        len(entry_parts) > len(target_parts)
        and entry_parts[: len(target_parts)] == target_parts
    )


def reference_compatible(snapshot: ProjectSnapshot) -> bool:
    """Requirement 5.4: every required entry is a real contained directory."""
    if snapshot.target.kind != EntryKind.DIRECTORY or snapshot.target.canonical is None:
        return False
    for required in (snapshot.kiro, snapshot.specs, snapshot.project_spec):
        if required.kind != EntryKind.DIRECTORY:
            return False
        if not reference_contained(snapshot.target.canonical, required.canonical):
            return False
    return True


@st.composite
def existing_snapshots(draw):
    """A compatible tree with zero to three generated defects applied.

    A defect changes the kind of one required entry (file, symlink, other,
    missing) or moves its canonical location (equal to the target, a prefix
    sibling, the parent, outside, elsewhere inside, or unknown).
    """
    name = draw(valid_names)
    base = ROOT / name
    tails = ((), (".kiro",), (".kiro", "specs"), (".kiro", "specs", name))
    kinds = [EntryKind.DIRECTORY] * 4
    canonicals: list[PurePosixPath | None] = [base.joinpath(*tail) for tail in tails]

    for _ in range(draw(st.sampled_from((0, 0, 0, 1, 1, 1, 2, 3)))):
        position = draw(st.integers(min_value=0, max_value=3))
        if draw(st.booleans()):
            allowed = EXISTING_KINDS if position == 0 else [*EXISTING_KINDS, EntryKind.MISSING]
            kinds[position] = draw(st.sampled_from(allowed))
        else:
            canonicals[position] = draw(
                st.sampled_from(
                    [
                        base,  # equality is not containment
                        base,
                        base.with_name(base.name + "-old") / ".kiro",
                        base.with_name(base.name + "-old").joinpath(*tails[position]),
                        base.with_name(base.name + "x"),
                        base.parent,
                        PurePosixPath("/outside/place"),
                        base / "other" / "inside",  # in-target, elsewhere
                        base.joinpath(*tails[position]),
                        None,
                    ]
                )
            )

    facts = [
        EntryFact(
            lexical=base.joinpath(*tail),
            canonical=canonical,
            kind=kind,
            opaque_content=draw(opaque_bytes),
        )
        for tail, canonical, kind in zip(tails, canonicals, kinds, strict=True)
    ]
    target = facts[0]

    extra_names = draw(
        st.lists(
            st.one_of(
                st.sampled_from(
                    [
                        "README.md",
                        "src",
                        "src/main.py",
                        ".git",
                        ".git/HEAD",
                        ".kiro/steering",
                        ".kiro/steering/tech.md",
                        ".kiro/specs/other-spec",
                        f".kiro/specs/{name}/requirements.md",
                        "link-out",
                    ]
                ),
                segments,
            ),
            unique=True,
            max_size=6,
        )
    )
    extras = tuple(
        EntryFact(
            lexical=base / extra,
            canonical=draw(
                st.one_of(
                    st.just(base / extra), st.just(PurePosixPath("/outside") / extra), st.none()
                )
            ),
            kind=draw(st.sampled_from(EXISTING_KINDS)),
            opaque_content=draw(opaque_bytes),
        )
        for extra in extra_names
    )
    snapshot = ProjectSnapshot(
        target=target,
        kiro=facts[1],
        specs=facts[2],
        project_spec=facts[3],
        extra_entries=extras,
    )
    return name, snapshot


@st.composite
def registries(draw, name: str):
    others = draw(st.lists(valid_names.filter(lambda item: item != name), unique=True, max_size=3))
    registered = draw(st.booleans())
    names = sorted([*others, name] if registered else others)
    return (
        tuple(
            ModelMansionRecord(
                name=item,
                project_spec=item,
                relative_path=item,
                origin=draw(st.sampled_from(["created", "existing"])),
            )
            for item in names
        ),
        registered,
    )


@given(data=st.data(), case=existing_snapshots())
def test_existing_trees_are_classified_exactly_and_never_changed(data, case):
    name, snapshot = case
    registry, registered = data.draw(registries(name))
    state = ModelState(project=snapshot, registry=registry)
    before = copy.deepcopy(state)
    compatible = reference_compatible(snapshot)

    status = classify_project(snapshot)
    plan = plan_create(snapshot, registered=registered)
    result = apply_model_create(state, name)

    # Classification: compatible exactly when the reference says so. An
    # existing target is never reported as absent (and so never creatable).
    assert status == (ProjectStatus.READY if compatible else ProjectStatus.CONFLICT)
    assert plan.action != "create_tree"
    assert result.operations == ()
    assert result.plan == plan

    # Both branches: every project entry and opaque byte is preserved.
    assert result.state.project == before.project
    assert result.state.project.extra_entries == before.project.extra_entries
    assert [entry.opaque_content for entry in result.state.project.extra_entries] == [
        entry.opaque_content for entry in before.project.extra_entries
    ]
    for field in ("target", "kiro", "specs", "project_spec"):
        assert getattr(result.state.project, field) == getattr(before.project, field)
    assert state == before  # the input model itself was not mutated

    if compatible:
        # Compatible branch: at most the app-owned registry changes.
        assert plan.error_code is None
        assert result.outcome == CreateOutcome.EXISTING_COMPATIBLE
        records = [record for record in result.state.registry if record.name == name]
        assert len(records) == 1
        assert result.record == records[0]
        assert records[0].project_spec == name
        assert records[0].relative_path == name
        other_before = [record for record in before.registry if record.name != name]
        other_after = [record for record in result.state.registry if record.name != name]
        assert other_after == other_before
        if registered:
            assert plan.action == "return_existing"
            assert result.state == before
        else:
            assert plan.action == "register_existing"
            assert records[0].origin == "existing"
    else:
        # Conflict branch: no state changes at all.
        assert plan.action == "reject"
        assert plan.error_code == "mansion_conflict"
        assert result.outcome is None
        assert result.record is None
        assert result.state == before


@given(case=existing_snapshots(), extra_bytes=opaque_bytes, extra_name=segments)
def test_extra_entries_never_affect_compatibility(case, extra_bytes, extra_name):
    name, snapshot = case
    base = snapshot.target.lexical
    added = EntryFact(
        lexical=base / "added" / extra_name,
        canonical=base / "added" / extra_name,
        kind=EntryKind.FILE,
        opaque_content=extra_bytes,
    )
    with_extra = ProjectSnapshot(
        target=snapshot.target,
        kiro=snapshot.kiro,
        specs=snapshot.specs,
        project_spec=snapshot.project_spec,
        extra_entries=(*snapshot.extra_entries, added),
    )
    without_extras = ProjectSnapshot(
        target=snapshot.target,
        kiro=snapshot.kiro,
        specs=snapshot.specs,
        project_spec=snapshot.project_spec,
    )

    assert (
        classify_project(with_extra)
        == classify_project(snapshot)
        == classify_project(without_extras)
    )
    result = apply_model_create(ModelState(project=with_extra), name)
    assert result.state.project.extra_entries[-1] == added
    assert result.state.project == with_extra
