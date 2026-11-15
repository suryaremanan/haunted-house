"""Property 2 for the pure mansion request model.

Model states are generated freely: absent, compatible and conflicting project
snapshots with opaque extra entries, and registries of any size. Rejected
values are produced by generators that never consult the validator; an
independent scanner then confirms each one is outside the name language.
"""

import copy
from pathlib import PurePosixPath

import pytest
from hypothesis import example, given
from hypothesis import strategies as st

from haunted_house.core.mansion_planner import (
    INVALID_MANSION_NAME,
    EntryFact,
    EntryKind,
    ModelMansionRecord,
    ModelState,
    ProjectSnapshot,
    apply_model_create_request,
    apply_model_open_request,
)

pytestmark = pytest.mark.core

# Feature: mansion-lifecycle, Property 2: Invalid names cause no state transition

ROOT = PurePosixPath("/approved/mansions")
ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789"

segments = st.text(alphabet=ALNUM, min_size=1, max_size=8)
valid_names = st.lists(segments, min_size=1, max_size=4).map("-".join)


def outside_language(value: object) -> bool:
    """Independent scanner: true when ``value`` is not a bounded kebab name."""
    if not isinstance(value, str) or not 1 <= len(value) <= 40:
        return True
    pieces = value.split("-")
    return any(
        piece == "" or any(character not in ALNUM for character in piece)
        for piece in pieces
    )


# Every strategy here produces only rejected values by construction.
invalid_strings = st.one_of(
    st.just(""),
    st.text(alphabet=ALNUM, min_size=41, max_size=60),
    valid_names.map(lambda name: "-" + name),
    valid_names.map(lambda name: name + "-"),
    st.tuples(valid_names, valid_names).map(lambda pair: pair[0] + "--" + pair[1]),
    valid_names.map(str.upper).filter(lambda name: name.lower() != name),
    st.tuples(valid_names, st.sampled_from([" ", "\n", "\t", "\x00", "_", ".", "/", "\\"]),
              st.booleans()).map(
        lambda parts: parts[1] + parts[0] if parts[2] else parts[0] + parts[1]
    ),
    st.sampled_from(
        [
            "..",
            "../x",
            "../../etc/passwd",
            "/abs",
            "a/b",
            "a\\b",
            ".",
            "~",
            "~/workspace",
            "café",
            "ａｂｃ",
            "١٢",
            "name​",
            "Weather-Station",
            " weather-station",
            "weather-station ",
            "weather_station",
        ]
    ),
    st.text(
        alphabet=st.characters(exclude_characters=ALNUM + "-"), min_size=1, max_size=20
    ),
)
invalid_non_strings = st.one_of(
    st.none(),
    st.booleans(),
    st.integers(),
    st.floats(allow_nan=False),
    st.binary(max_size=10),
    st.lists(valid_names, max_size=2),
    st.dictionaries(st.just("name"), valid_names, max_size=1),
    st.tuples(valid_names),
)
rejected_values = st.one_of(invalid_strings, invalid_strings, invalid_non_strings)

entry_kinds = st.sampled_from(list(EntryKind))
opaque_bytes = st.binary(max_size=24)


@st.composite
def entry(draw, lexical: PurePosixPath) -> EntryFact:
    canonical = draw(
        st.one_of(
            st.just(lexical),
            st.just(lexical),
            st.just(PurePosixPath("/elsewhere") / lexical.name),
            st.none(),
        )
    )
    return EntryFact(
        lexical=lexical,
        canonical=canonical,
        kind=draw(entry_kinds),
        opaque_content=draw(opaque_bytes),
    )


@st.composite
def model_states(draw) -> ModelState:
    project_name = draw(valid_names)
    base = ROOT / project_name
    extras = tuple(
        draw(entry(base / name))
        for name in draw(
            st.lists(
                st.sampled_from(["README.md", "src", "src/app.py", ".git", ".kiro/steering"]),
                unique=True,
                max_size=4,
            )
        )
    )
    project = ProjectSnapshot(
        target=draw(entry(base)),
        kiro=draw(entry(base / ".kiro")),
        specs=draw(entry(base / ".kiro" / "specs")),
        project_spec=draw(entry(base / ".kiro" / "specs" / project_name)),
        extra_entries=extras,
    )
    names = draw(st.lists(valid_names, unique=True, max_size=4))
    if draw(st.booleans()) and project_name not in names:
        names.append(project_name)
    registry = tuple(
        ModelMansionRecord(
            name=name,
            project_spec=name,
            relative_path=name,
            origin=draw(st.sampled_from(["created", "existing"])),
        )
        for name in sorted(names)
    )
    return ModelState(project=project, registry=registry)


@given(state=model_states(), value=rejected_values)
@example(
    state=ModelState(
        project=ProjectSnapshot(
            target=EntryFact(ROOT / "a", ROOT / "a", EntryKind.MISSING),
            kiro=EntryFact(ROOT / "a/.kiro", ROOT / "a/.kiro", EntryKind.MISSING),
            specs=EntryFact(
                ROOT / "a/.kiro/specs", ROOT / "a/.kiro/specs", EntryKind.MISSING
            ),
            project_spec=EntryFact(
                ROOT / "a/.kiro/specs/a", ROOT / "a/.kiro/specs/a", EntryKind.MISSING
            ),
        )
    ),
    value="A",
)
def test_rejected_names_return_invalid_mansion_name_and_change_nothing(state, value):
    assert outside_language(value)
    before = copy.deepcopy(state)

    created = apply_model_create_request(state, value)
    opened = apply_model_open_request(state, value)

    for outcome in (created, opened):
        assert outcome.error_code == INVALID_MANSION_NAME == "invalid_mansion_name"
        # No transition ran: no plan, no operations, no record.
        assert outcome.result is None
        assert outcome.record is None
        # The complete model state is returned untouched.
        assert outcome.state is state
        assert outcome.state == before

    assert state == before
    assert state.project.extra_entries == before.project.extra_entries
    assert state.registry == before.registry


@given(state=model_states(), values=st.lists(rejected_values, min_size=1, max_size=6))
def test_any_sequence_of_rejected_requests_is_a_fixed_point(state, values):
    before = copy.deepcopy(state)
    current = state

    for index, value in enumerate(values):
        apply = apply_model_create_request if index % 2 == 0 else apply_model_open_request
        outcome = apply(current, value)
        assert outcome.error_code == "invalid_mansion_name"
        current = outcome.state

    assert current == before


@given(state=model_states())
def test_open_requests_with_valid_names_also_leave_the_model_unchanged(state):
    # Opening is read-only for every name, so the no-op half of the property
    # cannot be an accident of the validation branch alone.
    before = copy.deepcopy(state)
    for name in (state.project.target.lexical.name, "not-registered-anywhere"):
        outcome = apply_model_open_request(state, name)
        assert outcome.error_code != "invalid_mansion_name"
        assert outcome.state == before
