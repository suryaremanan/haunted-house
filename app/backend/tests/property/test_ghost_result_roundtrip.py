"""Property 2 for the Ghost_Result codec.

Feature: room-ghosts, Property 2: Ghost_Result serialization round trip

For any valid Ghost_Result, printing and then parsing produces an equivalent
value, and the printed representation is one canonical UTF-8 JSON object with
sorted keys and no forbidden field.

Validates: Requirements 13.1, 13.3, 13.4.
"""

from __future__ import annotations

import json

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from haunted_house.core.ghost_result import (
    FIELDS,
    GhostIdentity,
    GhostResult,
    ghost_result_to_dict,
    parse_ghost_result,
    print_ghost_result,
)
from tests.room_ghost_support import ghost_results

pytestmark = pytest.mark.core


@settings(max_examples=200)
@given(result=ghost_results(), indent=st.sampled_from([None, 0, 2]), ascii_only=st.booleans())
def test_ghost_result_serialization_round_trip(
    result: GhostResult, indent: int | None, ascii_only: bool
) -> None:
    # Feature: room-ghosts, Property 2: Ghost_Result serialization round trip
    printed = print_ghost_result(result)

    # Print then parse gives the same value, with or without its identity check.
    assert parse_ghost_result(printed) == result
    identity = GhostIdentity(run_id=result.run_id, task_id=result.task_id)
    assert parse_ghost_result(printed, identity) == result

    # One canonical UTF-8 JSON object: sorted keys, no whitespace, stable bytes.
    encoded = printed.encode("utf-8")
    assert encoded.decode("utf-8") == printed
    decoded = json.loads(printed)
    assert type(decoded) is dict
    assert list(decoded) == sorted(decoded)
    assert printed == json.dumps(
        decoded, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    assert print_ghost_result(parse_ghost_result(printed)) == printed

    # No field beyond the schema, at either level.
    assert set(decoded) == FIELDS
    assert all(set(item) == {"path", "sha256"} for item in decoded["artifacts"])
    assert decoded == ghost_result_to_dict(result)

    # Any other spelling of the same object (key order, indentation, escapes)
    # parses to the same value and prints back to the canonical text.
    respelled = json.dumps(
        dict(reversed(list(decoded.items()))), indent=indent, ensure_ascii=ascii_only
    )
    assert parse_ghost_result(f"\n {respelled}\n") == result
    assert print_ghost_result(parse_ghost_result(respelled)) == printed
