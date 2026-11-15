"""Property 10 for pure Project_Path parsing.

Feature: doors-and-guardrails, Property 10: Traversal-shaped paths are rejected before access

For any path that is absolute or contains a forbidden empty, dot, parent,
backslash, NUL, control, or encoded traversal component, parsing returns a
PathError and no normalized Project_Path.

Validates: Requirements 5.2.
"""

from __future__ import annotations

from urllib.parse import quote, unquote

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from haunted_house.core.path_policy import (
    PathError,
    PathErrorCode,
    join_parts,
    parse_relative_path,
)

pytestmark = pytest.mark.core

_SAFE_ALPHABET = "abcXYZ019._- éß"
_SAFE_SEGMENT = st.text(alphabet=_SAFE_ALPHABET, min_size=1, max_size=8).filter(
    lambda value: value not in (".", "..")
)
_CONTROLS = st.sampled_from(
    ["\x00", "\x01", "\t", "\n", "\r", "\x1b", "\x7f", "\x85", "​", "‮", " "]
)


def _encode_all(text: str, rounds: int) -> str:
    encoded = "".join(f"%{byte:02x}" for byte in text.encode("utf-8"))
    for _ in range(rounds - 1):
        encoded = quote(encoded, safe="")
    return encoded


_ENCODED = st.builds(
    _encode_all,
    st.sampled_from(["..", ".", "/", "\\", "a/b", "../x", "a\\b", "\x00", "a\nb"]),
    st.integers(min_value=1, max_value=3),
)
_FORBIDDEN_SEGMENT = st.one_of(
    st.just(""),
    st.just("."),
    st.just(".."),
    st.tuples(_SAFE_SEGMENT, st.just("\\"), _SAFE_SEGMENT).map("".join),
    st.tuples(_SAFE_SEGMENT, _CONTROLS, _SAFE_SEGMENT).map("".join),
    _ENCODED,
    st.tuples(_SAFE_SEGMENT, _ENCODED).map("".join).filter(
        lambda value: any(
            bad in unquote(unquote(unquote(value))) for bad in ("/", "\\", "\x00", "\n")
        )
    ),
)


@st.composite
def _traversal_shaped(draw) -> str:
    before = draw(st.lists(_SAFE_SEGMENT, max_size=3))
    after = draw(st.lists(_SAFE_SEGMENT, max_size=3))
    if draw(st.booleans()):
        # An absolute path made only of otherwise clean segments.
        return "/" + "/".join(before + [draw(_SAFE_SEGMENT)] + after)
    bad = draw(_FORBIDDEN_SEGMENT)
    return "/".join(before + [bad] + after)


@settings(max_examples=400)
@given(raw=_traversal_shaped())
def test_traversal_shaped_paths_are_rejected_before_access(raw):
    parsed = parse_relative_path(raw)
    assert isinstance(parsed, PathError)
    assert isinstance(parsed.code, PathErrorCode)
    # The failure carries no normalized Project_Path and no rejected value.
    assert not hasattr(parsed, "parts")
    assert set(PathError.__dataclass_fields__) == {"code"}


@settings(max_examples=200)
@given(segments=st.lists(_SAFE_SEGMENT, min_size=1, max_size=6))
def test_clean_paths_parse_to_exactly_their_own_components(segments):
    raw = "/".join(segments)
    parsed = parse_relative_path(raw)
    assert parsed == tuple(segments)
    assert join_parts(parsed) == raw


@settings(max_examples=200)
@given(raw=st.text(max_size=40))
def test_any_accepted_path_is_free_of_traversal_shapes(raw):
    parsed = parse_relative_path(raw)
    if isinstance(parsed, PathError):
        return
    assert join_parts(parsed) == raw
    assert not raw.startswith("/")
    for part in parsed:
        assert part not in ("", ".", "..")
        assert "/" not in part and "\\" not in part and "\x00" not in part
        decoded = part
        for _ in range(4):
            decoded = unquote(decoded, errors="strict") if "%" in decoded else decoded
            assert decoded not in ("", ".", "..")
            assert "/" not in decoded and "\\" not in decoded
