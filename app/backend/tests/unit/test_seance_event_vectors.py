"""Cross-language examples for the canonical séance event vectors.

The same scrubbed fixture is consumed by the TypeScript example tests. The
fixture is normative: identifier validation and canonical bytes must agree.

Validates: Requirements 1.1–1.10, 7.1–7.6.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest

from haunted_house.core.seance_event import (
    app_event_to_dict,
    calculate_event_id,
    calculate_record_id,
    candidate_to_dict,
    canonical_json,
    canonical_json_text,
    validate_candidate,
    validate_event,
)

pytestmark = pytest.mark.core

_REPO_ROOT = Path(__file__).resolve().parents[4]
_VECTOR_PATH = _REPO_ROOT / "fixtures" / "seance" / "canonical-vectors.json"
_VECTORS = json.loads(_VECTOR_PATH.read_text(encoding="utf-8"))


def _canonical_vector(name: str) -> dict[str, Any]:
    return next(
        vector for vector in _VECTORS["canonical_vectors"] if vector["name"] == name
    )


def _mutate(base: object, mutation: dict[str, Any]) -> object:
    value = copy.deepcopy(base)
    parent = value
    path = mutation["path"]
    for segment in path[:-1]:
        assert isinstance(parent, dict)
        parent = parent[segment]
    assert isinstance(parent, dict)
    if mutation["operation"] == "delete":
        del parent[path[-1]]
    else:
        parent[path[-1]] = copy.deepcopy(mutation["value"])
    return value


def _base_value(vector: dict[str, Any]) -> object:
    base = _canonical_vector(vector["base"])
    return base["candidate" if vector["target"] == "candidate" else "redacted_event"]


def test_shared_vectors_are_scrubbed_and_have_no_unfilled_values() -> None:
    raw = _VECTOR_PATH.read_text(encoding="utf-8")
    forbidden_home_prefixes = (
        "/" + "Users" + "/",
        "/" + "home" + "/",
        "C:" + "\\" + "Users" + "\\",
    )

    assert _VECTORS["format_version"] == 1
    assert "[redacted]" in raw
    assert "[home]/" in raw
    assert "__" not in raw
    assert all(prefix not in raw for prefix in forbidden_home_prefixes)


@pytest.mark.parametrize(
    "vector", _VECTORS["canonical_vectors"], ids=lambda vector: vector["name"]
)
def test_python_consumes_shared_canonical_vectors(vector: dict[str, Any]) -> None:
    candidate_result = validate_candidate(vector["candidate"])
    assert candidate_result.ok, candidate_result.error
    assert candidate_result.value is not None
    candidate = candidate_result.value
    expected = vector["expected"]

    assert candidate_to_dict(candidate) == vector["candidate"]
    assert calculate_event_id(candidate) == expected["event_id"]
    assert calculate_record_id(candidate) == expected["record_id"]

    event_result = validate_event(vector["redacted_event"])
    assert event_result.ok, event_result.error
    assert event_result.value is not None
    event = event_result.value

    assert candidate_to_dict(event) == vector["candidate"]
    assert app_event_to_dict(event) == vector["redacted_event"]
    assert event.event_id == expected["event_id"]
    assert event.record_id == expected["record_id"]
    assert event.sequence == expected["sequence"]

    integrity = expected["integrity"]
    if integrity is None:
        assert event.prev_hash is None
        assert event.hash is None
    else:
        assert event.prev_hash == integrity["prev_hash"]
        assert event.hash == integrity["hash"]

    if expected["domain_payload"] is not None:
        assert event.payload == expected["domain_payload"]

    serialized = canonical_json(app_event_to_dict(event)) + b"\n"
    assert serialized.hex() == expected["canonical_jsonl_utf8_hex"]
    assert serialized.endswith(b"\n")
    reparsed = validate_event(json.loads(serialized))
    assert reparsed.value == event
    assert canonical_json(app_event_to_dict(reparsed.value)) + b"\n" == serialized


@pytest.mark.parametrize(
    "vector", _VECTORS["validation_errors"], ids=lambda vector: vector["name"]
)
def test_python_validation_errors_match_shared_vectors(vector: dict[str, Any]) -> None:
    mutated = _mutate(_base_value(vector), vector["mutation"])
    result = (
        validate_candidate(mutated)
        if vector["target"] == "candidate"
        else validate_event(mutated)
    )

    assert not result.ok
    assert result.value is None
    assert result.error is not None
    assert result.error.as_dict() == vector["expected"]["python"]


@pytest.mark.parametrize(
    "vector", _VECTORS["canonical_json_vectors"], ids=lambda vector: vector["name"]
)
def test_python_canonical_number_format_matches_shared_vectors(
    vector: dict[str, Any],
) -> None:
    assert canonical_json_text(vector["value"]) == vector["expected"]


def test_shared_vectors_record_no_cross_language_disagreement() -> None:
    assert _VECTORS["parity_disagreements"] == []
