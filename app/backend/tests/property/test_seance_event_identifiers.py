"""Property 2 for canonical séance event identifier boundaries.

Each generated candidate is valid and redaction-safe. Every mutation changes one
contract field at a time, separating Event_ID inputs, Record_ID-only candidate
inputs, and writer-owned metadata.
"""

from dataclasses import replace
import string

import pytest
from hypothesis import event, given, note, settings
from hypothesis import strategies as st

from haunted_house.core.seance_event import (
    EVENT_TYPES,
    AppEvent,
    AppEventCandidate,
    EventScope,
    EventSource,
    calculate_event_id,
    calculate_record_id,
    validate_candidate,
)

pytestmark = pytest.mark.core

HEX = "0123456789abcdef"
IDENTIFIER_ALPHABET = string.ascii_lowercase + string.digits + "-_."
IDENTITY_PART_ALPHABET = IDENTIFIER_ALPHABET + " "

identifiers = st.text(IDENTIFIER_ALPHABET, min_size=1, max_size=18)
mansion_ids = st.text(string.ascii_lowercase + string.digits, min_size=1, max_size=18)
identity_parts = st.lists(
    st.text(IDENTITY_PART_ALPHABET, max_size=18), min_size=1, max_size=3
).map(tuple)
event_refs = st.lists(
    st.text(HEX, min_size=64, max_size=64).map(lambda digest: "e1:" + digest),
    max_size=3,
).map(tuple)
json_values = st.recursive(
    st.one_of(
        st.none(),
        st.booleans(),
        st.integers(min_value=-(10**9), max_value=10**9),
        st.text(IDENTITY_PART_ALPHABET, max_size=18),
    ),
    lambda children: st.one_of(
        st.lists(children, max_size=4),
        st.dictionaries(identifiers, children, max_size=4),
    ),
    max_leaves=12,
)


@st.composite
def valid_candidates(draw):
    """Generate candidates whose payload remains valid for every event type."""

    return AppEventCandidate(
        schema_version=1,
        event_type=draw(st.sampled_from(EVENT_TYPES)),
        scope=EventScope(
            mansion_id=draw(mansion_ids),
            ghost_id=draw(identifiers),
            session_slot=draw(identifiers),
            run_id=draw(identifiers),
            run_sequence=draw(st.integers(min_value=0, max_value=10**9)),
        ),
        source=EventSource(
            origin=draw(st.sampled_from(("crew", "house"))),
            source_type=draw(identifiers),
            identity_parts=draw(identity_parts),
            revision=draw(st.integers(min_value=0, max_value=10**9)),
            generation=draw(st.text(IDENTIFIER_ALPHABET, max_size=18)),
            source_sequence=draw(st.integers(min_value=0, max_value=10**9)),
        ),
        caused_by=draw(event_refs),
        occurred_at_ms=draw(
            st.one_of(st.none(), st.integers(min_value=0, max_value=10**12))
        ),
        payload={
            "domain": draw(identifiers),
            "kind": draw(identifiers),
            "entity_id": draw(identifiers),
            "data": draw(json_values),
        },
    )


def changed_digest(identifier: str) -> str:
    """Return a syntactically valid digest identifier different from its input."""

    prefix, digest = identifier.split(":", 1)
    replacement = "1" if digest[0] == "0" else "0"
    return f"{prefix}:{replacement}{digest[1:]}"


def next_event_type(event_type: str) -> str:
    index = EVENT_TYPES.index(event_type)
    return EVENT_TYPES[(index + 1) % len(EVENT_TYPES)]


def next_optional_time(value: int | None) -> int:
    return 0 if value is None else value + 1


# Feature: seance-log-and-ghost-state, Property 2: Event and record identifiers exclude writer metadata
@settings(max_examples=200)
@given(
    candidate=valid_candidates(),
    sequence=st.integers(min_value=1, max_value=10**9),
    persisted_at_ms=st.integers(min_value=0, max_value=10**12),
    prev_hash=st.text(HEX, min_size=64, max_size=64).map(lambda value: "h1:" + value),
    record_hash=st.text(HEX, min_size=64, max_size=64).map(
        lambda value: "h1:" + value
    ),
)
def test_event_and_record_identifier_boundaries(
    candidate, sequence, persisted_at_ms, prev_hash, record_hash
):
    """**Validates: Requirements 1.8, 1.9, 5.1**"""

    assert validate_candidate(candidate).ok
    original_event_id = calculate_event_id(candidate)
    original_record_id = calculate_record_id(candidate)
    persisted = AppEvent(
        schema_version=candidate.schema_version,
        event_id=original_event_id,
        record_id=original_record_id,
        sequence=sequence,
        event_type=candidate.event_type,
        scope=candidate.scope,
        source=candidate.source,
        caused_by=candidate.caused_by,
        occurred_at_ms=candidate.occurred_at_ms,
        persisted_at_ms=persisted_at_ms,
        payload=candidate.payload,
        prev_hash=prev_hash,
        hash=record_hash,
    )

    writer_mutations = {
        "event_id": replace(persisted, event_id=changed_digest(original_event_id)),
        "record_id": replace(persisted, record_id=changed_digest(original_record_id)),
        "sequence": replace(persisted, sequence=sequence + 1),
        "persisted_at_ms": replace(
            persisted, persisted_at_ms=persisted_at_ms + 1
        ),
        "prev_hash": replace(persisted, prev_hash=changed_digest(prev_hash)),
        "hash": replace(persisted, hash=changed_digest(record_hash)),
        "tamper_pair_presence": replace(persisted, prev_hash=None, hash=None),
    }
    for field, changed in writer_mutations.items():
        note(f"excluded writer field: {field}")
        assert calculate_event_id(changed) == original_event_id
        assert calculate_record_id(changed) == original_record_id

    identity_mutations = {
        "event_type": replace(
            candidate, event_type=next_event_type(candidate.event_type)
        ),
        "scope.mansion_id": replace(
            candidate,
            scope=replace(
                candidate.scope, mansion_id=candidate.scope.mansion_id + "-x"
            ),
        ),
        "scope.ghost_id": replace(
            candidate,
            scope=replace(candidate.scope, ghost_id=candidate.scope.ghost_id + "x"),
        ),
        "scope.session_slot": replace(
            candidate,
            scope=replace(
                candidate.scope, session_slot=candidate.scope.session_slot + "x"
            ),
        ),
        "scope.run_id": replace(
            candidate,
            scope=replace(candidate.scope, run_id=candidate.scope.run_id + "x"),
        ),
        "scope.run_sequence": replace(
            candidate,
            scope=replace(
                candidate.scope, run_sequence=candidate.scope.run_sequence + 1
            ),
        ),
        "source.origin": replace(
            candidate,
            source=replace(
                candidate.source,
                origin="house" if candidate.source.origin == "crew" else "crew",
            ),
        ),
        "source.source_type": replace(
            candidate,
            source=replace(
                candidate.source, source_type=candidate.source.source_type + "x"
            ),
        ),
        "source.identity_parts": replace(
            candidate,
            source=replace(
                candidate.source,
                identity_parts=candidate.source.identity_parts + ("changed",),
            ),
        ),
    }
    for field, changed in identity_mutations.items():
        note(f"included Event_ID field: {field}")
        assert validate_candidate(changed).ok
        assert calculate_event_id(changed) != original_event_id
        assert calculate_record_id(changed) != original_record_id

    record_only_mutations = {
        "source.revision": replace(
            candidate,
            source=replace(candidate.source, revision=candidate.source.revision + 1),
        ),
        "source.generation": replace(
            candidate,
            source=replace(
                candidate.source, generation=candidate.source.generation + "x"
            ),
        ),
        "source.source_sequence": replace(
            candidate,
            source=replace(
                candidate.source,
                source_sequence=candidate.source.source_sequence + 1,
            ),
        ),
        "caused_by": replace(
            candidate, caused_by=candidate.caused_by + ("e1:" + "f" * 64,)
        ),
        "occurred_at_ms": replace(
            candidate, occurred_at_ms=next_optional_time(candidate.occurred_at_ms)
        ),
        "payload": replace(
            candidate,
            payload={
                **candidate.payload,
                "data": {"changed": candidate.payload["data"]},
            },
        ),
    }
    for field, changed in record_only_mutations.items():
        note(f"Record_ID-only candidate field: {field}")
        assert validate_candidate(changed).ok
        assert calculate_event_id(changed) == original_event_id
        assert calculate_record_id(changed) != original_record_id

    event(f"base event type: {candidate.event_type}")
