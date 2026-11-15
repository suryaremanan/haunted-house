"""Property 1 for the canonical séance-event schema.

The reference model below is transcribed from the design contract rather than
from ``seance_event.py``.  Generated valid candidates and events exercise both
accepted envelope shapes.  Invalid cases begin with one of those valid values
and change, add, or remove exactly one field.  Arbitrary JSON values exercise
the validator's total, typed-error boundary for values outside either schema.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
import re
import string
from dataclasses import dataclass
from typing import Literal

import pytest
from hypothesis import event, given, settings
from hypothesis import strategies as st

from haunted_house.core.seance_event import (
    EventValidationCode,
    EventValidationError,
    EventValidationReason,
    validate_candidate,
    validate_event,
)

pytestmark = pytest.mark.core

# Independent schema constants copied from the design document.
MODEL_SCHEMA_VERSION = 1
MODEL_MAX_MANSION_ID_LENGTH = 40
MODEL_MAX_IDENTIFIER_BYTES = 160
MODEL_MAX_IDENTITY_PARTS = 8
MODEL_MAX_IDENTITY_PART_BYTES = 512
MODEL_MAX_CAUSAL_PREDECESSORS = 32
MODEL_MAX_PAYLOAD_BYTES = 256 * 1024
MODEL_EVENT_TYPES = frozenset(
    {
        "run_started",
        "ghost_progressed",
        "message_recorded",
        "message_updated",
        "response_segment_started",
        "response_chunk_recorded",
        "crew_turn_ended",
        "crew_error_observed",
        "run_completed",
        "run_blocked",
        "run_failed",
        "tool_started",
        "tool_updated",
        "tool_finished",
        "approval_requested",
        "approval_decided",
        "decision_recorded",
        "domain_event_recorded",
        "source_event_observed",
    }
)

MODEL_CANDIDATE_FIELDS = frozenset(
    {
        "schema_version",
        "event_type",
        "scope",
        "source",
        "caused_by",
        "occurred_at_ms",
        "payload",
    }
)
MODEL_EVENT_REQUIRED_FIELDS = MODEL_CANDIDATE_FIELDS | frozenset(
    {"event_id", "record_id", "sequence", "persisted_at_ms"}
)
MODEL_EVENT_OPTIONAL_FIELDS = frozenset({"prev_hash", "hash"})
MODEL_SCOPE_FIELDS = frozenset(
    {"mansion_id", "ghost_id", "session_slot", "run_id", "run_sequence"}
)
MODEL_SOURCE_FIELDS = frozenset(
    {
        "origin",
        "source_type",
        "identity_parts",
        "revision",
        "generation",
        "source_sequence",
    }
)
MODEL_DOMAIN_FIELDS = frozenset({"domain", "kind", "entity_id", "data"})

MODEL_MANSION_ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
MODEL_EVENT_ID = re.compile(r"e1:[0-9a-f]{64}")
MODEL_RECORD_ID = re.compile(r"r1:[0-9a-f]{64}")
MODEL_HASH_ID = re.compile(r"h1:[0-9a-f]{64}")


# --- Independent reference model -------------------------------------------


def _has_exact_fields(
    value: object, required: frozenset[str], optional: frozenset[str] = frozenset()
) -> bool:
    return (
        type(value) is dict
        and all(type(key) is str for key in value)
        and required.issubset(value)
        and set(value).issubset(required | optional)
    )


def _is_utf8_string(
    value: object, *, maximum: int, allow_empty: bool
) -> bool:
    if type(value) is not str:
        return False
    try:
        encoded = value.encode("utf-8")
    except UnicodeEncodeError:
        return False
    return len(encoded) <= maximum and (allow_empty or bool(encoded))


def _is_non_negative_integer(value: object) -> bool:
    return type(value) is int and value >= 0


def _is_positive_integer(value: object) -> bool:
    return type(value) is int and value > 0


def _is_json(value: object, active: set[int] | None = None) -> bool:
    if value is None or type(value) in (bool, int, str):
        if type(value) is str:
            try:
                value.encode("utf-8")
            except UnicodeEncodeError:
                return False
        return True
    if type(value) is float:
        return math.isfinite(value)
    if type(value) not in (list, dict):
        return False

    active = active if active is not None else set()
    identity = id(value)
    if identity in active:
        return False
    active.add(identity)
    try:
        if type(value) is list:
            return all(_is_json(item, active) for item in value)
        return all(
            type(key) is str
            and _is_utf8_string(key, maximum=2**63 - 1, allow_empty=True)
            and _is_json(item, active)
            for key, item in value.items()
        )
    finally:
        active.remove(identity)


def _model_float(value: float) -> str:
    if value == 0:
        return "0"
    negative = value < 0
    absolute = -value if negative else value
    raw = repr(absolute).lower()
    if "e" in raw:
        coefficient, exponent_text = raw.split("e", 1)
        exponent = int(exponent_text)
    else:
        coefficient = raw
        exponent = 0
    integer, dot, fraction = coefficient.partition(".")
    if dot and not fraction.strip("0"):
        fraction = ""
    digits = integer + fraction
    decimal_position = len(integer) + exponent
    if 1e-6 <= absolute < 1e21:
        if decimal_position <= 0:
            rendered = "0." + "0" * (-decimal_position) + digits
        elif decimal_position >= len(digits):
            rendered = digits + "0" * (decimal_position - len(digits))
        else:
            rendered = digits[:decimal_position] + "." + digits[decimal_position:]
    else:
        digits = digits.lstrip("0") or "0"
        scientific_exponent = decimal_position - 1
        rendered = digits[0]
        if len(digits) > 1:
            rendered += "." + digits[1:]
        rendered += ("e+" if scientific_exponent >= 0 else "e-") + str(
            abs(scientific_exponent)
        )
    return "-" + rendered if negative else rendered


def _model_canonical_text(value: object) -> str:
    if value is None:
        return "null"
    if type(value) is bool:
        return "true" if value else "false"
    if type(value) is int:
        return str(value)
    if type(value) is float:
        return _model_float(value)
    if type(value) is str:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if type(value) is list:
        return "[" + ",".join(_model_canonical_text(item) for item in value) + "]"
    return "{" + ",".join(
        json.dumps(key, ensure_ascii=False, separators=(",", ":"))
        + ":"
        + _model_canonical_text(value[key])
        for key in sorted(value)
    ) + "}"


def _canonical_bytes(value: object) -> bytes:
    return _model_canonical_text(value).encode("utf-8")


def _is_identifier(value: object) -> bool:
    return _is_utf8_string(
        value, maximum=MODEL_MAX_IDENTIFIER_BYTES, allow_empty=False
    )


def _is_digest(value: object, pattern: re.Pattern[str]) -> bool:
    return type(value) is str and pattern.fullmatch(value) is not None


def _scope_satisfies_model(value: object) -> bool:
    if not _has_exact_fields(value, MODEL_SCOPE_FIELDS):
        return False
    mansion_id = value["mansion_id"]
    return (
        type(mansion_id) is str
        and len(mansion_id) <= MODEL_MAX_MANSION_ID_LENGTH
        and MODEL_MANSION_ID.fullmatch(mansion_id) is not None
        and _is_identifier(value["ghost_id"])
        and _is_identifier(value["session_slot"])
        and _is_identifier(value["run_id"])
        and _is_non_negative_integer(value["run_sequence"])
    )


def _source_satisfies_model(value: object) -> bool:
    if not _has_exact_fields(value, MODEL_SOURCE_FIELDS):
        return False
    parts = value["identity_parts"]
    return (
        type(value["origin"]) is str
        and value["origin"] in ("crew", "house")
        and _is_identifier(value["source_type"])
        and type(parts) is list
        and 1 <= len(parts) <= MODEL_MAX_IDENTITY_PARTS
        and all(
            _is_utf8_string(
                part, maximum=MODEL_MAX_IDENTITY_PART_BYTES, allow_empty=True
            )
            for part in parts
        )
        and _is_non_negative_integer(value["revision"])
        and _is_utf8_string(
            value["generation"],
            maximum=MODEL_MAX_IDENTIFIER_BYTES,
            allow_empty=True,
        )
        and _is_non_negative_integer(value["source_sequence"])
    )


def _payload_satisfies_model(value: object, event_type: str) -> bool:
    if event_type == "domain_event_recorded":
        if not _has_exact_fields(value, MODEL_DOMAIN_FIELDS):
            return False
        if not all(
            _is_identifier(value[field]) for field in ("domain", "kind", "entity_id")
        ):
            return False
        if not _is_json(value["data"]):
            return False
    if not _is_json(value):
        return False
    try:
        return len(_canonical_bytes(value)) <= MODEL_MAX_PAYLOAD_BYTES
    except (OverflowError, RecursionError, TypeError, UnicodeEncodeError, ValueError):
        return False


def _candidate_satisfies_model(value: object) -> bool:
    if not _has_exact_fields(value, MODEL_CANDIDATE_FIELDS):
        return False
    if type(value["schema_version"]) is not int or value["schema_version"] != 1:
        return False
    event_type = value["event_type"]
    if type(event_type) is not str or event_type not in MODEL_EVENT_TYPES:
        return False
    caused_by = value["caused_by"]
    occurred_at_ms = value["occurred_at_ms"]
    return (
        _scope_satisfies_model(value["scope"])
        and _source_satisfies_model(value["source"])
        and type(caused_by) is list
        and len(caused_by) <= MODEL_MAX_CAUSAL_PREDECESSORS
        and all(_is_digest(item, MODEL_EVENT_ID) for item in caused_by)
        and (
            occurred_at_ms is None
            or _is_non_negative_integer(occurred_at_ms)
        )
        and _payload_satisfies_model(value["payload"], event_type)
    )


def _candidate_portion(value: dict[str, object]) -> dict[str, object]:
    return {field: value[field] for field in MODEL_CANDIDATE_FIELDS}


def _model_event_id(candidate: dict[str, object]) -> str:
    source = candidate["source"]
    identity = [
        candidate["schema_version"],
        candidate["event_type"],
        candidate["scope"],
        {
            "origin": source["origin"],
            "source_type": source["source_type"],
            "identity_parts": source["identity_parts"],
        },
    ]
    return "e1:" + hashlib.sha256(_canonical_bytes(identity)).hexdigest()


def _model_record_id(candidate: dict[str, object]) -> str:
    return "r1:" + hashlib.sha256(_canonical_bytes(candidate)).hexdigest()


def _event_satisfies_model(value: object) -> bool:
    if not _has_exact_fields(
        value, MODEL_EVENT_REQUIRED_FIELDS, MODEL_EVENT_OPTIONAL_FIELDS
    ):
        return False
    candidate = _candidate_portion(value)
    if not _candidate_satisfies_model(candidate):
        return False
    if not (
        _is_digest(value["event_id"], MODEL_EVENT_ID)
        and _is_digest(value["record_id"], MODEL_RECORD_ID)
        and _is_positive_integer(value["sequence"])
        and _is_non_negative_integer(value["persisted_at_ms"])
    ):
        return False

    has_prev_hash = "prev_hash" in value
    has_hash = "hash" in value
    if has_prev_hash != has_hash:
        return False
    if has_prev_hash and not (
        _is_digest(value["prev_hash"], MODEL_HASH_ID)
        and _is_digest(value["hash"], MODEL_HASH_ID)
    ):
        return False
    return (
        value["event_id"] == _model_event_id(candidate)
        and value["record_id"] == _model_record_id(candidate)
    )


# --- Generators -------------------------------------------------------------


UNICODE_SCALAR = st.characters(blacklist_categories=("Cs",))
MANSION_COMPONENT = st.text(
    alphabet=string.ascii_lowercase + string.digits, min_size=1, max_size=8
)
MANSION_IDS = st.one_of(
    st.lists(MANSION_COMPONENT, min_size=1, max_size=4).map("-".join),
    st.just("m" * MODEL_MAX_MANSION_ID_LENGTH),
)
IDENTIFIERS = st.one_of(
    st.text(alphabet=UNICODE_SCALAR, min_size=1, max_size=32),
    st.sampled_from(
        ["i" * MODEL_MAX_IDENTIFIER_BYTES, "é" * (MODEL_MAX_IDENTIFIER_BYTES // 2)]
    ),
)
GENERATIONS = st.one_of(st.just(""), IDENTIFIERS)
IDENTITY_PARTS = st.one_of(
    st.text(alphabet=UNICODE_SCALAR, max_size=64),
    st.sampled_from(
        [
            "p" * MODEL_MAX_IDENTITY_PART_BYTES,
            "é" * (MODEL_MAX_IDENTITY_PART_BYTES // 2),
        ]
    ),
)
NON_NEGATIVE_INTEGERS = st.integers(min_value=0, max_value=2**63)
POSITIVE_INTEGERS = st.integers(min_value=1, max_value=2**63)
DIGEST_HEX = st.binary(min_size=32, max_size=32).map(bytes.hex)
EVENT_IDS = DIGEST_HEX.map(lambda digest: f"e1:{digest}")
HASH_IDS = DIGEST_HEX.map(lambda digest: f"h1:{digest}")

JSON_LEAVES = st.one_of(
    st.none(),
    st.booleans(),
    st.integers(),
    st.floats(allow_nan=False, allow_infinity=False),
    st.text(alphabet=UNICODE_SCALAR, max_size=40),
)
JSON_VALUES = st.recursive(
    JSON_LEAVES,
    lambda children: st.one_of(
        st.lists(children, max_size=5),
        st.dictionaries(
            st.text(alphabet=UNICODE_SCALAR, max_size=20), children, max_size=5
        ),
    ),
    max_leaves=20,
)


@st.composite
def valid_candidates(draw, event_type: str | None = None):
    selected_event_type = event_type or draw(st.sampled_from(sorted(MODEL_EVENT_TYPES)))
    if selected_event_type == "domain_event_recorded":
        payload = {
            "domain": draw(IDENTIFIERS),
            "kind": draw(IDENTIFIERS),
            "entity_id": draw(IDENTIFIERS),
            "data": draw(JSON_VALUES),
        }
    else:
        payload = draw(JSON_VALUES)

    return {
        "schema_version": MODEL_SCHEMA_VERSION,
        "event_type": selected_event_type,
        "scope": {
            "mansion_id": draw(MANSION_IDS),
            "ghost_id": draw(IDENTIFIERS),
            "session_slot": draw(IDENTIFIERS),
            "run_id": draw(IDENTIFIERS),
            "run_sequence": draw(NON_NEGATIVE_INTEGERS),
        },
        "source": {
            "origin": draw(st.sampled_from(["crew", "house"])),
            "source_type": draw(IDENTIFIERS),
            "identity_parts": draw(
                st.lists(
                    IDENTITY_PARTS,
                    min_size=1,
                    max_size=MODEL_MAX_IDENTITY_PARTS,
                )
            ),
            "revision": draw(NON_NEGATIVE_INTEGERS),
            "generation": draw(GENERATIONS),
            "source_sequence": draw(NON_NEGATIVE_INTEGERS),
        },
        "caused_by": draw(
            st.lists(EVENT_IDS, max_size=MODEL_MAX_CAUSAL_PREDECESSORS)
        ),
        "occurred_at_ms": draw(st.one_of(st.none(), NON_NEGATIVE_INTEGERS)),
        "payload": payload,
    }


@st.composite
def valid_events(
    draw,
    candidate: dict[str, object] | None = None,
    linked: bool | None = None,
):
    raw_candidate = copy.deepcopy(candidate or draw(valid_candidates()))
    value = copy.deepcopy(raw_candidate)
    value.update(
        {
            "event_id": _model_event_id(raw_candidate),
            "record_id": _model_record_id(raw_candidate),
            "sequence": draw(POSITIVE_INTEGERS),
            "persisted_at_ms": draw(NON_NEGATIVE_INTEGERS),
        }
    )
    include_hashes = draw(st.booleans()) if linked is None else linked
    if include_hashes:
        value["prev_hash"] = draw(HASH_IDS)
        value["hash"] = draw(HASH_IDS)
    return value


@dataclass(frozen=True)
class SchemaCase:
    shape: Literal["candidate", "event"]
    value: object


@st.composite
def valid_schema_values(draw):
    shape = draw(st.sampled_from(["candidate", "event"]))
    value = draw(valid_candidates() if shape == "candidate" else valid_events())
    return SchemaCase(shape=shape, value=value)


COMMON_MUTATIONS = (
    "unsupported_schema",
    "missing_payload",
    "unknown_top_level_field",
    "unknown_event_type",
    "invalid_mansion_id",
    "empty_ghost_id",
    "empty_session_slot",
    "empty_run_id",
    "negative_run_sequence",
    "boolean_run_sequence",
    "unknown_scope_field",
    "unknown_source_origin",
    "empty_source_type",
    "empty_identity_parts",
    "oversized_identity_part",
    "negative_source_revision",
    "oversized_generation",
    "negative_source_sequence",
    "missing_source_field",
    "invalid_causal_identifier",
    "too_many_causal_predecessors",
    "negative_occurrence_time",
    "non_finite_payload_number",
    "non_json_payload_value",
    "non_string_payload_key",
    "oversized_payload",
    "malformed_domain_payload",
)
EVENT_MUTATIONS = (
    "malformed_event_id",
    "mismatched_event_id",
    "malformed_record_id",
    "mismatched_record_id",
    "zero_sequence",
    "boolean_sequence",
    "negative_persistence_time",
    "prev_hash_without_hash",
    "hash_without_prev_hash",
    "malformed_hash",
)
ALL_MUTATIONS = COMMON_MUTATIONS + EVENT_MUTATIONS


@st.composite
def one_field_invalid_values(draw):
    mutation = draw(st.sampled_from(ALL_MUTATIONS))
    forced_event_type = (
        "domain_event_recorded" if mutation == "malformed_domain_payload" else None
    )
    candidate = draw(valid_candidates(event_type=forced_event_type))

    if mutation in EVENT_MUTATIONS:
        shape: Literal["candidate", "event"] = "event"
    else:
        shape = draw(st.sampled_from(["candidate", "event"]))

    linked: bool | None = None
    if mutation in ("prev_hash_without_hash", "hash_without_prev_hash"):
        linked = False
    elif mutation == "malformed_hash":
        linked = True
    value = (
        draw(valid_events(candidate=candidate, linked=linked))
        if shape == "event"
        else copy.deepcopy(candidate)
    )

    if mutation == "unsupported_schema":
        value["schema_version"] = 2
    elif mutation == "missing_payload":
        del value["payload"]
    elif mutation == "unknown_top_level_field":
        value["unexpected"] = None
    elif mutation == "unknown_event_type":
        value["event_type"] = "message_created"
    elif mutation == "invalid_mansion_id":
        value["scope"]["mansion_id"] = "Invalid Mansion"
    elif mutation == "empty_ghost_id":
        value["scope"]["ghost_id"] = ""
    elif mutation == "empty_session_slot":
        value["scope"]["session_slot"] = ""
    elif mutation == "empty_run_id":
        value["scope"]["run_id"] = ""
    elif mutation == "negative_run_sequence":
        value["scope"]["run_sequence"] = -1
    elif mutation == "boolean_run_sequence":
        value["scope"]["run_sequence"] = True
    elif mutation == "unknown_scope_field":
        value["scope"]["room"] = "study"
    elif mutation == "unknown_source_origin":
        value["source"]["origin"] = "browser"
    elif mutation == "empty_source_type":
        value["source"]["source_type"] = ""
    elif mutation == "empty_identity_parts":
        value["source"]["identity_parts"] = []
    elif mutation == "oversized_identity_part":
        value["source"]["identity_parts"] = [
            "é" * (MODEL_MAX_IDENTITY_PART_BYTES // 2 + 1)
        ]
    elif mutation == "negative_source_revision":
        value["source"]["revision"] = -1
    elif mutation == "oversized_generation":
        value["source"]["generation"] = "é" * (
            MODEL_MAX_IDENTIFIER_BYTES // 2 + 1
        )
    elif mutation == "negative_source_sequence":
        value["source"]["source_sequence"] = -1
    elif mutation == "missing_source_field":
        del value["source"]["generation"]
    elif mutation == "invalid_causal_identifier":
        value["caused_by"] = ["e1:not-a-digest"]
    elif mutation == "too_many_causal_predecessors":
        value["caused_by"] = [
            "e1:" + f"{number:064x}"
            for number in range(MODEL_MAX_CAUSAL_PREDECESSORS + 1)
        ]
    elif mutation == "negative_occurrence_time":
        value["occurred_at_ms"] = -1
    elif mutation == "non_finite_payload_number":
        if value["event_type"] == "domain_event_recorded":
            value["payload"]["data"] = {"number": float("nan")}
        else:
            value["payload"] = {"number": float("nan")}
    elif mutation == "non_json_payload_value":
        if value["event_type"] == "domain_event_recorded":
            value["payload"]["data"] = b"not-json"
        else:
            value["payload"] = b"not-json"
    elif mutation == "non_string_payload_key":
        if value["event_type"] == "domain_event_recorded":
            value["payload"]["data"] = {1: "not-json"}
        else:
            value["payload"] = {1: "not-json"}
    elif mutation == "oversized_payload":
        oversized = "x" * MODEL_MAX_PAYLOAD_BYTES
        if value["event_type"] == "domain_event_recorded":
            value["payload"]["data"] = oversized
        else:
            value["payload"] = oversized
    elif mutation == "malformed_domain_payload":
        del value["payload"]["data"]
    elif mutation == "malformed_event_id":
        value["event_id"] = "e1:short"
    elif mutation == "mismatched_event_id":
        value["event_id"] = (
            "e1:" + "1" * 64
            if value["event_id"] == "e1:" + "0" * 64
            else "e1:" + "0" * 64
        )
    elif mutation == "malformed_record_id":
        value["record_id"] = "r1:short"
    elif mutation == "mismatched_record_id":
        value["record_id"] = (
            "r1:" + "1" * 64
            if value["record_id"] == "r1:" + "0" * 64
            else "r1:" + "0" * 64
        )
    elif mutation == "zero_sequence":
        value["sequence"] = 0
    elif mutation == "boolean_sequence":
        value["sequence"] = True
    elif mutation == "negative_persistence_time":
        value["persisted_at_ms"] = -1
    elif mutation == "prev_hash_without_hash":
        value["prev_hash"] = "h1:" + "0" * 64
    elif mutation == "hash_without_prev_hash":
        value["hash"] = "h1:" + "0" * 64
    elif mutation == "malformed_hash":
        value["hash"] = "h1:short"
    else:  # pragma: no cover - makes additions to the mutation list fail loudly
        raise AssertionError(f"unhandled mutation: {mutation}")

    return SchemaCase(shape=shape, value=value), mutation


# --- Property ---------------------------------------------------------------


def _validator_for(shape: Literal["candidate", "event"]):
    return validate_candidate if shape == "candidate" else validate_event


def _model_for(shape: Literal["candidate", "event"]):
    return _candidate_satisfies_model if shape == "candidate" else _event_satisfies_model


def _assert_validation_matches_model(case: SchemaCase) -> None:
    expected = _model_for(case.shape)(case.value)
    result = _validator_for(case.shape)(case.value)  # rejection must not raise

    assert result.ok is expected
    if expected:
        assert result.value is not None
        assert result.error is None
    else:
        assert result.value is None
        assert isinstance(result.error, EventValidationError)
        assert isinstance(result.error.code, EventValidationCode)
        assert isinstance(result.error.reason, EventValidationReason)


# Feature: seance-log-and-ghost-state, Property 1: Canonical schema validation matches the schema model
@settings(max_examples=200)
@given(case=valid_schema_values())
def test_every_generated_valid_schema_value_is_accepted(case):
    """**Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7**"""
    event(f"shape={case.shape}")
    assert _model_for(case.shape)(case.value)

    _assert_validation_matches_model(case)


# Feature: seance-log-and-ghost-state, Property 1: Canonical schema validation matches the schema model
@settings(max_examples=300)
@given(invalid_case=one_field_invalid_values())
def test_every_one_field_invalid_mutation_returns_a_typed_error(invalid_case):
    """**Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7**"""
    case, mutation = invalid_case
    event(f"shape={case.shape}")
    event(f"mutation={mutation}")
    assert not _model_for(case.shape)(case.value)

    _assert_validation_matches_model(case)


# Feature: seance-log-and-ghost-state, Property 1: Canonical schema validation matches the schema model
@settings(max_examples=200)
@given(
    shape=st.sampled_from(["candidate", "event"]),
    value=JSON_VALUES,
)
def test_arbitrary_json_values_match_the_schema_model_without_raising(shape, value):
    """**Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7**"""
    case = SchemaCase(shape=shape, value=value)
    event(f"shape={shape}")
    event(f"model accepts={_model_for(shape)(value)}")

    _assert_validation_matches_model(case)
