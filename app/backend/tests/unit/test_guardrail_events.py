"""Unit tests for Spec 4 domain payload models and builders (task 2.1).

Validates: Requirements 2.2, 2.3, 3.1–3.3, 5.8, 6.7, 10.1–10.3, 10.7, 10.8.
"""

from __future__ import annotations

import ast
import inspect

import pytest

from haunted_house.core import guardrail_events
from haunted_house.core.action_descriptor import action_digest, parse_action_descriptor
from haunted_house.core.guardrail_events import (
    DOMAIN,
    DomainRecord,
    GuardrailEventKind,
    GuardrailPayloadError,
    PayloadDiagnostic,
    Phase,
    build_candidate,
    build_payload,
    door_approved,
    operator_scope,
    path_denied,
    phase_start_reserved,
    read_domain_record,
    risky_action_proposed,
    select_domain_records,
    validate_payload,
)
from haunted_house.core.path_policy import Access
from haunted_house.core.seance_event import validate_candidate
from haunted_house.core.seance_persistence import prepare_candidates
from tests.guardrail_support import (
    MANSION,
    SESSION_SCOPE,
    SHA_A,
    acknowledge,
    foreign_domain_event,
    other_event,
    spec_path,
)

pytestmark = pytest.mark.core

_OPERATOR = operator_scope(MANSION)
_DESCRIPTOR = {
    "schema_version": 1,
    "mansion_id": MANSION,
    "session_slot": SESSION_SCOPE.session_slot,
    "room": "workshop",
    "kind": "delete_path",
    "working_directory": "",
    "arguments": {"path": "src/old.py", "target": "file"},
    "path_intents": [{"access": "delete", "path": "src/old.py"}],
}


def _door(**overrides):
    fields = dict(
        phase=Phase.REQUIREMENTS,
        proposal_id="door-1",
        document_path=spec_path("requirements"),
        revision=1,
        sha256=SHA_A,
        size_bytes=120,
        actor="operator",
        command_id="cmd-1",
    )
    fields.update(overrides)
    return door_approved(_OPERATOR, **fields)


def test_every_kind_has_one_closed_schema():
    assert set(guardrail_events._SCHEMAS) == set(GuardrailEventKind)
    for kind, (schema, entity_field, identity) in guardrail_events._SCHEMAS.items():
        assert entity_field in schema, kind
        assert set(identity) <= set(schema), kind
        # No field name is one the Spec 2 redactor treats as a credential key.
        from haunted_house.core.deep_redact import _is_credential_key

        assert not any(_is_credential_key(name) for name in schema), kind


def test_a_built_candidate_is_a_plain_house_domain_candidate():
    candidate = _door()
    assert validate_candidate(candidate).ok
    assert candidate.event_type == "domain_event_recorded"
    assert candidate.source.origin == "house"
    assert candidate.source.identity_parts == ("door_approved", "door-1", "cmd-1")
    assert set(candidate.payload) == {"domain", "kind", "entity_id", "data"}
    assert candidate.payload["domain"] == DOMAIN == "doors_and_guardrails"
    assert candidate.payload["entity_id"] == "door-1"
    # No writer field exists on a candidate.
    assert not {"event_id", "record_id", "sequence", "persisted_at_ms", "hash"} & set(
        type(candidate).__dataclass_fields__
    )
    # The Spec 2 redactor leaves a built payload byte-for-byte unchanged.
    (prepared,) = prepare_candidates([candidate]).candidates
    assert prepared.candidate == candidate


def test_distinct_facts_have_distinct_event_ids_and_retries_are_identical():
    first, retry, other = _door(), _door(), _door(command_id="cmd-2")
    a, b, c = (prepare_candidates([item]).candidates[0] for item in (first, retry, other))
    assert a.record_id == b.record_id
    assert a.event_id != c.event_id


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"phase": "review"}, "data.phase"),
        ({"proposal_id": "has space"}, "data.proposal_id"),
        ({"proposal_id": "x" * 97}, "data.proposal_id"),
        ({"document_path": "../escape.md"}, "data.document_path"),
        ({"document_path": "/abs/requirements.md"}, "data.document_path"),
        ({"revision": 0}, "data.revision"),
        ({"revision": True}, "data.revision"),
        ({"revision": 1.0}, "data.revision"),
        ({"sha256": "A" * 64}, "data.sha256"),
        ({"sha256": "a" * 63}, "data.sha256"),
        ({"size_bytes": -1}, "data.size_bytes"),
        ({"actor": "ghost"}, "data.actor"),
        ({"command_id": ""}, "data.command_id"),
        ({"command_id": None}, "data.command_id"),
    ],
)
def test_builders_refuse_invalid_fields_without_echoing_them(overrides, field):
    with pytest.raises(GuardrailPayloadError) as raised:
        _door(**overrides)
    assert raised.value.diagnostic.field == field
    for value in overrides.values():
        if isinstance(value, str) and len(value) > 3:
            assert value not in str(raised.value)


def test_unknown_missing_and_extra_data_fields_are_refused():
    good = dict(_door().payload["data"])
    with pytest.raises(GuardrailPayloadError):
        build_payload(GuardrailEventKind.DOOR_APPROVED, {**good, "document_body": "text"})
    missing = dict(good)
    del missing["sha256"]
    with pytest.raises(GuardrailPayloadError):
        build_payload(GuardrailEventKind.DOOR_APPROVED, missing)
    with pytest.raises(GuardrailPayloadError):
        build_payload("door_approved", good)  # type: ignore[arg-type]
    with pytest.raises(GuardrailPayloadError):
        build_payload(GuardrailEventKind.DOOR_APPROVED, [good])  # type: ignore[arg-type]
    with pytest.raises(GuardrailPayloadError):
        build_candidate("not-a-scope", GuardrailEventKind.DOOR_APPROVED, good)  # type: ignore[arg-type]


def test_a_proposal_digest_is_computed_and_never_supplied():
    descriptor = parse_action_descriptor(_DESCRIPTOR)
    candidate = risky_action_proposed(SESSION_SCOPE, proposal_id="act-1", descriptor=descriptor)
    data = candidate.payload["data"]
    assert data["action_digest"] == action_digest(descriptor)
    assert data["descriptor"] == _DESCRIPTOR
    with pytest.raises(GuardrailPayloadError):
        risky_action_proposed(SESSION_SCOPE, proposal_id="act-1", descriptor=_DESCRIPTOR)  # type: ignore[arg-type]


def test_a_denial_stores_only_a_clean_credential_free_path():
    def stored(raw):
        return path_denied(
            SESSION_SCOPE,
            denial_id="deny-1",
            session_slot="slot",
            room="workshop",
            access=Access.READ,
            code="protected_path",
            raw_path=raw,
        ).payload["data"]["path"]

    assert stored(".env") == ".env"
    assert stored("../../etc/passwd") is None
    assert stored("/Users/someone/private") is None
    assert stored("a\x00b") is None
    assert stored(12) is None
    assert stored("AKIA" + "ABCDEFGHIJKLMNOP") is None


def test_acknowledged_records_are_read_with_canonical_metadata_only():
    events = acknowledge(
        [
            other_event("m1"),
            phase_start_reserved(
                _OPERATOR, phase=Phase.REQUIREMENTS, reservation_id="res-1", command_id="cmd-1"
            ),
            foreign_domain_event("f1"),
            _door(),
        ]
    )
    assert read_domain_record(events[0]) is None
    assert read_domain_record(events[2]) is None
    record = read_domain_record(events[1])
    assert isinstance(record, DomainRecord)
    assert (record.sequence, record.event_id) == (2, events[1].event_id)
    assert record.kind is GuardrailEventKind.PHASE_START_RESERVED
    assert record.entity_id == "requirements"

    selection = select_domain_records(reversed(events))
    assert [item.sequence for item in selection.records] == [2, 4]
    assert selection.highest_sequence == 4
    assert selection.diagnostics == ()


def test_malformed_or_untrusted_domain_records_become_diagnostics():
    good = _door().payload
    bad_payloads = [
        {**good, "kind": "door_unsealed"},
        {**good, "entity_id": "door-2"},
        {**good, "data": {**good["data"], "revision": 0}},
        {**good, "data": {**good["data"], "note": "extra"}},
        {**good, "data": None},
    ]
    for payload in bad_payloads:
        assert isinstance(validate_payload(payload), PayloadDiagnostic)
    assert validate_payload(good) == good
    assert isinstance(validate_payload({"domain": DOMAIN}), PayloadDiagnostic)

    from dataclasses import replace

    crew_claim = replace(
        _door(), source=replace(_door().source, origin="crew", source_type="chat_message")
    )
    broken = replace(_door(command_id="cmd-9"), payload=bad_payloads[2])
    events = acknowledge([crew_claim, broken, _door(command_id="cmd-3")])
    selection = select_domain_records(events)
    assert [item.sequence for item in selection.records] == [3]
    assert [(d.sequence, d.field) for d in selection.diagnostics] == [
        (1, "source"),
        (2, "data.revision"),
    ]
    assert selection.highest_sequence == 3


def test_the_module_is_pure_and_defines_no_envelope_or_serializer():
    tree = ast.parse(inspect.getsource(guardrail_events))
    roots = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            roots.update(alias.name.partition(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            roots.add(node.module.partition(".")[0])
    assert roots <= {"__future__", "re", "collections", "dataclasses", "enum", "typing", "haunted_house"}
    names = {node.id for node in ast.walk(tree) if isinstance(node, ast.Name)} | {
        node.attr for node in ast.walk(tree) if isinstance(node, ast.Attribute)
    }
    assert not names & {
        "hashlib", "json", "calculate_event_id", "calculate_record_id",
        "build_app_event", "serialize_app_event", "calculate_event_hash", "open",
    }
