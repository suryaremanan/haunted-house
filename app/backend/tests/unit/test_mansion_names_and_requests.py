"""Focused examples for mansion names and request parsing (task 2.1)."""

from dataclasses import FrozenInstanceError
from types import MappingProxyType

import pytest

from haunted_house.core.mansion_names import (
    MANSION_NAME_PATTERN,
    MAX_MANSION_NAME_LENGTH,
    is_valid_mansion_name,
)
from haunted_house.core.mansion_requests import (
    INVALID_REQUEST_CODE,
    InvalidRequest,
    MansionRequest,
    parse_mansion_request,
)

pytestmark = pytest.mark.core


@pytest.mark.parametrize(
    "name",
    [
        "a",
        "0",
        "weather-station",
        "mansion2-room7",
        "a" * 40,
    ],
)
def test_mansion_name_accepts_exact_kebab_names_through_the_length_bound(name):
    assert is_valid_mansion_name(name)
    assert len(name) <= MAX_MANSION_NAME_LENGTH
    assert MANSION_NAME_PATTERN.fullmatch(name) is not None


@pytest.mark.parametrize(
    "value",
    [
        "",
        "a" * 41,
        "-mansion",
        "mansion-",
        "mansion--room",
        "Mansion",
        " mansion",
        "mansion ",
        "mansion_room",
        "mansion/room",
        "mansion\n",
        "café",
        "cafe\N{COMBINING ACUTE ACCENT}",
        None,
        7,
        b"mansion",
    ],
)
def test_mansion_name_rejects_out_of_language_values_without_normalizing(value):
    assert not is_valid_mansion_name(value)


def test_request_parser_accepts_only_shape_and_preserves_the_exact_string():
    raw_name = " Mansion "

    request = parse_mansion_request({"name": raw_name})

    assert request == MansionRequest(name=raw_name)
    assert request.name is raw_name
    assert not is_valid_mansion_name(request.name)


def test_request_parser_accepts_read_only_mapping_objects():
    request = parse_mansion_request(MappingProxyType({"name": "weather-station"}))

    assert request == MansionRequest(name="weather-station")


@pytest.mark.parametrize(
    "value",
    [
        None,
        True,
        1,
        "weather-station",
        ["weather-station"],
        {},
        {"mansion": "weather-station"},
        {"name": "weather-station", "extra": None},
        {"name": None},
        {"name": 1},
        {"name": ["weather-station"]},
    ],
)
def test_request_parser_rejects_every_non_exact_example_with_stable_code(value):
    with pytest.raises(InvalidRequest) as raised:
        parse_mansion_request(value)

    assert raised.value.code == INVALID_REQUEST_CODE == "invalid_request"
    assert str(raised.value) == "invalid_request"


def test_mansion_request_is_immutable():
    request = MansionRequest(name="weather-station")

    with pytest.raises(FrozenInstanceError):
        request.name = "changed"
