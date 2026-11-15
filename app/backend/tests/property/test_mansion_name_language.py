"""Property 1 for haunted_house.core.mansion_names.

The oracle below is a hand-written scanner that never uses ``re``. It walks
the candidate one code point at a time, so it shares no machinery with the
implementation's compiled pattern.
"""

import string

import pytest
from hypothesis import example, given
from hypothesis import strategies as st

from haunted_house.core.mansion_names import (
    MAX_MANSION_NAME_LENGTH,
    is_valid_mansion_name,
)

pytestmark = pytest.mark.core

# Feature: mansion-lifecycle, Property 1: Mansion name validation matches the exact language

ALLOWED = frozenset("abcdefghijklmnopqrstuvwxyz0123456789")
SEGMENT_ALPHABET = string.ascii_lowercase + string.digits


def reference_accepts(value: object) -> bool:
    """Scanner for ``[a-z0-9]+(-[a-z0-9]+)*`` bounded at 40 characters."""
    if type(value) is not str:
        # A str subclass is still a string; nothing else is.
        if not isinstance(value, str):
            return False
    if len(value) == 0 or len(value) > 40:
        return False
    previous_was_hyphen = True  # a leading hyphen is refused like a double one
    for character in value:
        if character == "-":
            if previous_was_hyphen:
                return False
            previous_was_hyphen = True
        elif character in ALLOWED:
            previous_was_hyphen = False
        else:
            return False
    return not previous_was_hyphen


segments = st.text(alphabet=SEGMENT_ALPHABET, min_size=1, max_size=12)
kebab_names = st.lists(segments, min_size=1, max_size=8).map("-".join)
boundary_names = st.sampled_from([39, 40, 41]).flatmap(
    lambda size: st.text(alphabet=SEGMENT_ALPHABET, min_size=size, max_size=size)
)
near_miss_text = st.text(
    alphabet=st.sampled_from(list("abz019-AZ_ ./\\\n\téаａ٠‐")),
    max_size=45,
)
any_text = st.text(max_size=60)


@st.composite
def mutated_names(draw) -> str:
    """A valid-looking name with one edit that may or may not break it."""
    base = draw(kebab_names)
    index = draw(st.integers(min_value=0, max_value=len(base)))
    insertion = draw(
        st.one_of(
            st.sampled_from(
                ["-", "--", " ", "\n", "A", "_", ".", "..", "/", "\x00", "é", "а", "٣"]
            ),
            st.characters(),
        )
    )
    return base[:index] + insertion + base[index:]


non_strings = st.one_of(
    st.none(),
    st.booleans(),
    st.integers(),
    st.floats(allow_nan=True),
    st.binary(max_size=20),
    st.lists(st.text(max_size=5), max_size=3),
    st.dictionaries(st.text(max_size=3), st.text(max_size=3), max_size=2),
    st.tuples(st.text(max_size=5)),
)

candidates = st.one_of(
    kebab_names,
    boundary_names,
    near_miss_text,
    mutated_names(),
    any_text,
    non_strings,
)


@given(value=candidates)
@example(value="")
@example(value="a")
@example(value="a" * 39)
@example(value="a" * 40)
@example(value="a" * 41)
@example(value="a-" * 19 + "ab")  # 40 characters with hyphens
@example(value="a-" * 20 + "a")  # 41 characters with hyphens
@example(value="-a")
@example(value="a-")
@example(value="a--b")
@example(value="a\n")
@example(value="\na")
@example(value=" a")
@example(value="a ")
@example(value="Weather-Station")
@example(value="weather_station")
@example(value="..")
@example(value="../etc")
@example(value="a/b")
@example(value="café")
@example(value="ａｂｃ")  # full-width letters that NFKC would fold
@example(value="١٢٣")  # Arabic-Indic digits: \d but not [0-9]
@example(value=b"abc")
@example(value=None)
@example(value=7)
@example(value=["abc"])
def test_validator_accepts_exactly_the_bounded_kebab_language(value):
    expected = reference_accepts(value)

    assert is_valid_mansion_name(value) is expected


@given(name=st.one_of(kebab_names, boundary_names))
def test_generated_kebab_names_are_valid_exactly_within_the_length_bound(name):
    assert is_valid_mansion_name(name) is (len(name) <= MAX_MANSION_NAME_LENGTH)


@given(
    name=kebab_names.filter(lambda value: len(value) <= 38),
    padding=st.sampled_from([" ", "\t", "\n", "\r\n", " ", "​"]),
)
def test_validator_never_trims_case_folds_or_normalizes(name, padding):
    assert is_valid_mansion_name(name) is True

    # Values that would equal the valid name only after trimming.
    assert is_valid_mansion_name(padding + name) is False
    assert is_valid_mansion_name(name + padding) is False

    # Values that would equal the valid name only after case folding.
    if name.upper() != name:
        assert is_valid_mansion_name(name.upper()) is False
        assert is_valid_mansion_name(name.capitalize()) is (
            name.capitalize() == name
        )

    # Values that would equal the valid name only after NFKC normalization.
    full_width = "".join(
        chr(ord(character) + 0xFEE0) if character != "-" else character
        for character in name
    )
    assert is_valid_mansion_name(full_width) is False

    # Values that would equal the valid name only after substitution.
    assert is_valid_mansion_name(name.replace("-", "_") + "_x") is False
