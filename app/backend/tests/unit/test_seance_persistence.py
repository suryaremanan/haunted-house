"""Focused examples for pure canonical persistence preparation (task 4.3)."""

from __future__ import annotations

import ast
import inspect

import pytest

from haunted_house.core import seance_persistence
from haunted_house.core.redact import MARKER
from haunted_house.core.seance_event import (
    AppEventCandidate,
    EventScope,
    EventSource,
    calculate_event_id,
    calculate_record_id,
    validate_event,
)
from haunted_house.core.seance_persistence import (
    GENESIS_HASH,
    WriterDiagnosticCode,
    build_app_event,
    calculate_event_hash,
    prepare_candidates,
    serialize_app_event,
)

pytestmark = pytest.mark.core


def _candidate(*, identity: str = "message-1", payload=None) -> AppEventCandidate:
    return AppEventCandidate(
        schema_version=1,
        event_type="message_recorded",
        scope=EventScope(
            mansion_id="demo-mansion",
            ghost_id="archivist",
            session_slot="study-slot",
            run_id="requirements-1",
            run_sequence=0,
        ),
        source=EventSource(
            origin="crew",
            source_type="chat_message",
            identity_parts=(identity,),
            revision=0,
            generation="generation-1",
            source_sequence=1,
        ),
        caused_by=(),
        occurred_at_ms=1_731_400_000_000,
        payload={"text": "hello"} if payload is None else payload,
    )


def test_preparation_redacts_before_calculating_identifiers():
    known = "".join(("writer-", "known-value"))
    credential_value = "".join(("ordinary-", "sensitive-value"))
    result = prepare_candidates(
        [
            _candidate(
                payload={
                    "text": f"message {known}",
                    "api_token": credential_value,
                    "cwd": "/home/operator/project",
                }
            )
        ],
        [known],
    )

    assert result.ok
    [prepared] = result.candidates
    assert prepared.candidate.payload == {
        "text": f"message {MARKER}",
        "api_token": MARKER,
        "cwd": "[home]/project",
    }
    assert prepared.event_id == calculate_event_id(prepared.candidate)
    assert prepared.record_id == calculate_record_id(prepared.candidate)
    assert known not in repr(prepared)


def test_one_invalid_or_residual_candidate_rejects_the_complete_batch_safely():
    forbidden = "".join(("private ", "document body"))
    invalid = _candidate(payload={"body": forbidden})
    result = prepare_candidates(
        [_candidate(identity="accepted"), invalid],
        forbidden_document_bodies=[forbidden],
    )

    assert not result.ok
    assert result.candidates == ()
    assert len(result.diagnostics) == 1
    diagnostic = result.diagnostics[0]
    assert diagnostic == seance_persistence.WriterDiagnostic(
        code=WriterDiagnosticCode.INVALID_CANDIDATE,
        safe_detail="forbidden_document_body",
        candidate_index=1,
    )
    assert forbidden not in repr(result.diagnostics)


def test_linked_event_hash_covers_writer_fields_and_serializes_one_line():
    preparation = prepare_candidates([_candidate()])
    [prepared] = preparation.candidates

    event = build_app_event(
        prepared,
        sequence=1,
        persisted_at_ms=1_731_400_001_000,
        prev_hash=GENESIS_HASH,
    )
    encoded = serialize_app_event(event)

    assert event.hash == calculate_event_hash(event)
    assert event.prev_hash == GENESIS_HASH
    assert validate_event(event).value == event
    assert encoded.endswith(b"\n")
    assert encoded.count(b"\n") == 1
    assert b'"hash":"h1:' in encoded


def test_persistence_core_imports_no_filesystem_network_or_clock_modules():
    tree = ast.parse(inspect.getsource(seance_persistence))
    imported_roots = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported_roots.update(alias.name.partition(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported_roots.add(node.module.partition(".")[0])

    assert imported_roots.isdisjoint(
        {"aiohttp", "asyncio", "fcntl", "os", "pathlib", "socket", "subprocess", "time"}
    )
