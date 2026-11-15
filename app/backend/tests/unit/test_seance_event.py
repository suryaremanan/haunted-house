"""Focused examples for the canonical séance event model (task 2.1).

The numbered schema and identifier properties belong to tasks 2.4 and 2.5;
this file proves the concrete contract and important validation boundaries.
"""

import ast
import hashlib
import inspect
from dataclasses import replace

import pytest

from haunted_house.core import seance_event
from haunted_house.core.seance_event import (
    ALLOWED_EVENT_TYPES,
    EVENT_TYPES,
    MAX_PAYLOAD_BYTES,
    AppEvent,
    AppEventCandidate,
    DomainEventPayload,
    EventScope,
    EventSource,
    EventValidationCode,
    EventValidationReason,
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

PREDECESSOR = "e1:" + "a" * 64
GENESIS_HASH = "h1:" + "0" * 64
RECORD_HASH = "h1:" + "b" * 64


def candidate(
    *,
    event_type="message_recorded",
    payload=None,
    caused_by=(),
):
    if payload is None:
        payload = {"text": "hello", "visible": True}
    return AppEventCandidate(
        schema_version=1,
        event_type=event_type,
        scope=EventScope(
            mansion_id="demo-mansion",
            ghost_id="archivist",
            session_slot="slot-1",
            run_id="requirements-1",
            run_sequence=0,
        ),
        source=EventSource(
            origin="crew",
            source_type="chat_message",
            identity_parts=("message-7",),
            revision=0,
            generation="generation-2",
            source_sequence=7,
        ),
        caused_by=caused_by,
        occurred_at_ms=1_731_400_000_123,
        payload=payload,
    )


def persisted(value=None, **changes):
    value = value or candidate()
    event = AppEvent(
        schema_version=value.schema_version,
        event_id=calculate_event_id(value),
        record_id=calculate_record_id(value),
        sequence=1,
        event_type=value.event_type,
        scope=value.scope,
        source=value.source,
        caused_by=value.caused_by,
        occurred_at_ms=value.occurred_at_ms,
        persisted_at_ms=1_731_400_001_000,
        payload=value.payload,
        prev_hash=GENESIS_HASH,
        hash=RECORD_HASH,
    )
    return replace(event, **changes)


def test_valid_candidate_and_persisted_event_normalize_to_frozen_models():
    raw_candidate = candidate_to_dict(candidate(caused_by=(PREDECESSOR,)))

    candidate_result = validate_candidate(raw_candidate)
    assert candidate_result.ok
    assert candidate_result.error is None
    assert candidate_result.value == candidate(caused_by=(PREDECESSOR,))

    raw_event = app_event_to_dict(persisted(candidate_result.value))
    event_result = validate_event(raw_event)
    assert event_result.ok
    assert event_result.error is None
    assert event_result.value == persisted(candidate_result.value)


def test_every_allowed_event_type_is_accepted_and_the_list_is_exact():
    assert ALLOWED_EVENT_TYPES == frozenset(EVENT_TYPES)
    assert len(EVENT_TYPES) == 19

    for event_type in EVENT_TYPES:
        payload = (
            DomainEventPayload(
                domain="workflow",
                kind="phase-approved",
                entity_id="requirements",
                data={"approved": True},
            )
            if event_type == "domain_event_recorded"
            else {"example": event_type}
        )
        assert validate_candidate(candidate(event_type=event_type, payload=payload)).ok


def test_domain_event_requires_and_normalizes_its_owned_payload_envelope():
    result = validate_candidate(
        candidate(
            event_type="domain_event_recorded",
            payload=DomainEventPayload(
                domain="workflow",
                kind="door-opened",
                entity_id="requirements-door",
                data={"actor": "operator", "revision": 2},
            ),
        )
    )

    assert result.ok
    assert result.value.payload == {
        "domain": "workflow",
        "kind": "door-opened",
        "entity_id": "requirements-door",
        "data": {"actor": "operator", "revision": 2},
    }

    malformed = candidate_to_dict(candidate())
    malformed["event_type"] = "domain_event_recorded"
    malformed["payload"] = {"kind": "door-opened"}
    error = validate_candidate(malformed).error
    assert error is not None
    assert error.code is EventValidationCode.INVALID_CANDIDATE
    assert error.field == "payload"
    assert error.reason is EventValidationReason.MISSING_FIELD


def test_canonical_json_is_utf8_sorted_compact_and_has_no_log_newline():
    value = {"z": [3, {"b": False, "a": None}], "é": "café", "a": 1}

    encoded = canonical_json(value)

    assert encoded == '{"a":1,"z":[3,{"a":null,"b":false}],"é":"café"}'.encode()
    assert canonical_json_text(value) == encoded.decode()
    assert not encoded.endswith(b"\n")


def test_event_id_uses_only_the_document_defined_by_the_design():
    value = candidate(caused_by=(PREDECESSOR,))
    identity = [
        1,
        "message_recorded",
        {
            "mansion_id": "demo-mansion",
            "ghost_id": "archivist",
            "session_slot": "slot-1",
            "run_id": "requirements-1",
            "run_sequence": 0,
        },
        {
            "origin": "crew",
            "source_type": "chat_message",
            "identity_parts": ["message-7"],
        },
    ]
    expected = "e1:" + hashlib.sha256(canonical_json(identity)).hexdigest()

    assert calculate_event_id(value) == expected


def test_record_id_hashes_the_complete_candidate_object():
    value = candidate(caused_by=(PREDECESSOR,))
    expected = "r1:" + hashlib.sha256(
        canonical_json(candidate_to_dict(value))
    ).hexdigest()

    assert calculate_record_id(value) == expected


def test_identifiers_ignore_writer_metadata_but_record_id_keeps_candidate_fields():
    original = persisted()
    changed_metadata = replace(
        original,
        event_id="e1:" + "f" * 64,
        record_id="r1:" + "e" * 64,
        sequence=999,
        persisted_at_ms=9_999_999,
        prev_hash="h1:" + "c" * 64,
        hash="h1:" + "d" * 64,
    )

    assert calculate_event_id(changed_metadata) == calculate_event_id(original)
    assert calculate_record_id(changed_metadata) == calculate_record_id(original)

    revised = replace(original, source=replace(original.source, revision=1))
    assert calculate_event_id(revised) == calculate_event_id(original)
    assert calculate_record_id(revised) != calculate_record_id(original)

    new_identity = replace(
        original,
        source=replace(original.source, identity_parts=("message-8",)),
    )
    assert calculate_event_id(new_identity) != calculate_event_id(original)


def test_payload_limit_is_measured_from_canonical_utf8_json():
    accepted = candidate(payload="x" * (MAX_PAYLOAD_BYTES - 2))
    rejected = candidate(payload="x" * (MAX_PAYLOAD_BYTES - 1))

    assert validate_candidate(accepted).ok
    error = validate_candidate(rejected).error
    assert error is not None
    assert error.field == "payload"
    assert error.reason is EventValidationReason.PAYLOAD_TOO_LARGE


@pytest.mark.parametrize(
    ("mutate", "code", "field", "reason"),
    [
        (
            lambda raw: raw.update(schema_version=2),
            EventValidationCode.UNSUPPORTED_SCHEMA,
            "schema_version",
            EventValidationReason.UNSUPPORTED_VALUE,
        ),
        (
            lambda raw: raw.update(event_type="message_created"),
            EventValidationCode.INVALID_CANDIDATE,
            "event_type",
            EventValidationReason.UNSUPPORTED_VALUE,
        ),
        (
            lambda raw: raw["scope"].update(mansion_id="Demo Mansion"),
            EventValidationCode.INVALID_CANDIDATE,
            "scope.mansion_id",
            EventValidationReason.INVALID_IDENTIFIER,
        ),
        (
            lambda raw: raw["scope"].update(run_sequence=-1),
            EventValidationCode.INVALID_CANDIDATE,
            "scope.run_sequence",
            EventValidationReason.OUT_OF_RANGE,
        ),
        (
            lambda raw: raw["source"].update(identity_parts=[]),
            EventValidationCode.INVALID_CANDIDATE,
            "source.identity_parts",
            EventValidationReason.OUT_OF_RANGE,
        ),
        (
            lambda raw: raw.update(payload={"value": float("nan")}),
            EventValidationCode.INVALID_CANDIDATE,
            "payload",
            EventValidationReason.NON_FINITE_NUMBER,
        ),
        (
            lambda raw: raw.update(sequence=1),
            EventValidationCode.INVALID_CANDIDATE,
            "$",
            EventValidationReason.UNKNOWN_FIELD,
        ),
    ],
)
def test_candidate_validation_returns_typed_safe_errors(mutate, code, field, reason):
    raw = candidate_to_dict(candidate())
    mutate(raw)

    result = validate_candidate(raw)

    assert not result.ok
    assert result.value is None
    assert result.error is not None
    assert result.error.code is code
    assert result.error.field == field
    assert result.error.reason is reason
    diagnostic = str(result.error.as_dict())
    assert "hello" not in diagnostic
    assert "message-7" not in diagnostic


@pytest.mark.parametrize(
    ("changes", "field", "reason"),
    [
        ({"sequence": 0}, "sequence", EventValidationReason.OUT_OF_RANGE),
        (
            {"persisted_at_ms": -1},
            "persisted_at_ms",
            EventValidationReason.OUT_OF_RANGE,
        ),
        (
            {"event_id": "e1:" + "A" * 64},
            "event_id",
            EventValidationReason.INVALID_IDENTIFIER,
        ),
        (
            {"record_id": "r1:" + "0" * 64},
            "record_id",
            EventValidationReason.IDENTIFIER_MISMATCH,
        ),
        (
            {"prev_hash": GENESIS_HASH, "hash": None},
            "prev_hash/hash",
            EventValidationReason.HASH_PAIR_REQUIRED,
        ),
        (
            {"prev_hash": GENESIS_HASH, "hash": "h1:short"},
            "hash",
            EventValidationReason.INVALID_IDENTIFIER,
        ),
    ],
)
def test_persisted_event_validates_sequence_identifiers_and_hash_pair(
    changes, field, reason
):
    result = validate_event(persisted(**changes))

    assert not result.ok
    assert result.error is not None
    assert result.error.code is EventValidationCode.INVALID_RECORD
    assert result.error.field == field
    assert result.error.reason is reason


def test_unlinked_event_omits_both_optional_integrity_fields():
    event = persisted(prev_hash=None, hash=None)

    raw = app_event_to_dict(event)

    assert "prev_hash" not in raw
    assert "hash" not in raw
    assert validate_event(raw).value == event


def test_core_module_imports_no_io_network_or_clock_modules():
    tree = ast.parse(inspect.getsource(seance_event))
    imported_roots = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported_roots.update(alias.name.partition(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported_roots.add(node.module.partition(".")[0])

    assert imported_roots.isdisjoint(
        {"aiohttp", "asyncio", "os", "pathlib", "socket", "subprocess", "time"}
    )
