"""Focused examples for the optional feature brief on mansion creation."""

import pytest

from haunted_house.core.mansion_requests import (
    MAX_BRIEF_CHARS,
    InvalidRequest,
    MansionRequest,
    normalize_mansion_brief,
    parse_create_mansion_request,
    parse_mansion_request,
)

pytestmark = pytest.mark.core


def test_create_accepts_name_only_and_name_with_brief():
    assert parse_create_mansion_request({"name": "lab"}) == MansionRequest(name="lab")
    assert parse_create_mansion_request(
        {"name": "lab", "brief": "  A weather station.\r\nWith alerts.\t\n"}
    ) == MansionRequest(name="lab", brief="A weather station.\nWith alerts.")


def test_blank_brief_is_no_brief():
    for blank in ("", "   ", "\n\t\r\n"):
        assert parse_create_mansion_request({"name": "lab", "brief": blank}).brief is None


def test_brief_length_limit_counts_code_points_after_trim():
    exact = "👻" * MAX_BRIEF_CHARS
    assert normalize_mansion_brief(f"  {exact}  ") == exact
    with pytest.raises(InvalidRequest):
        normalize_mansion_brief("a" * (MAX_BRIEF_CHARS + 1))


@pytest.mark.parametrize(
    "char", ["\x00", "\x07", "\x1b", "\x1c", "\x1f", "\x7f", "\x85", "\x9f", "\ud800"]
)
def test_control_characters_and_lone_surrogates_are_refused_even_at_the_ends(char):
    for text in (f"ok{char}ok", f"{char}ok", f"ok{char}"):
        with pytest.raises(InvalidRequest):
            normalize_mansion_brief(text)


@pytest.mark.parametrize(
    "body",
    [
        {"name": "lab", "brief": None},
        {"name": "lab", "brief": 7},
        {"name": "lab", "brief": ["x"]},
        {"name": 7, "brief": "x"},
        {"brief": "x"},
        {"name": "lab", "Brief": "x"},
        {"name": "lab", "brief": "x", "path": "/tmp"},
        {"name": "lab", "path": "/tmp"},
        ["lab"],
        "lab",
    ],
)
def test_create_rejects_every_other_shape(body):
    with pytest.raises(InvalidRequest) as raised:
        parse_create_mansion_request(body)
    assert str(raised.value) == "invalid_request"


def test_open_still_refuses_a_brief():
    with pytest.raises(InvalidRequest):
        parse_mansion_request({"name": "lab", "brief": "x"})
