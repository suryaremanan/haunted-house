"""Focused real-filesystem checks for ``SeanceLogStore`` task 4.3.

The later task 4.5 owns injected I/O failures and multi-process race coverage.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

from haunted_house.adapters.seance_log_store import SeanceLogStore
from haunted_house.core.seance_event import AppEventCandidate, EventScope, EventSource
from haunted_house.core.seance_persistence import WriterDiagnosticCode


def _candidate(identity: str, *, revision: int = 0) -> AppEventCandidate:
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
            revision=revision,
            generation="generation-1",
            source_sequence=revision,
        ),
        caused_by=(),
        occurred_at_ms=1_731_400_000_000 + revision,
        payload={"text": identity, "revision": revision},
    )


def _run(awaitable):
    return asyncio.run(awaitable)


def _existing_mansion(tmp_path: Path) -> tuple[Path, Path, Path]:
    root = tmp_path / "mansions"
    mansion = root / "demo-mansion"
    mansion.mkdir(parents=True)
    log = mansion / ".haunted-house" / "seance" / "events.v1.jsonl"
    return root, mansion, log


def test_append_is_contiguous_linked_durable_and_exact_retries_are_no_ops(tmp_path):
    root, _mansion, log = _existing_mansion(tmp_path)
    ticks = iter((101, 102, 103))
    store = SeanceLogStore(root, clock_ms=lambda: next(ticks))
    first_candidate = _candidate("message-1")
    second_candidate = _candidate("message-2")

    first = _run(store.append_candidates("demo-mansion", [first_candidate, second_candidate]))

    assert first.status == "ok"
    assert [event.sequence for event in first.events] == [1, 2]
    assert first.highest_sequence == 2
    assert first.events[0].prev_hash is not None
    assert first.events[1].prev_hash == first.events[0].hash
    committed = log.read_bytes()
    assert committed.count(b"\n") == 2

    duplicate = _run(store.append_candidates("demo-mansion", [first_candidate]))

    assert duplicate.status == "ok"
    assert duplicate.events == (first.events[0],)
    assert duplicate.duplicate_record_ids == (first.events[0].record_id,)
    assert duplicate.highest_sequence == 2
    assert log.read_bytes() == committed

    page = _run(store.read_after("demo-mansion", after_sequence=1, limit=1))
    assert page.status == "ok"
    assert page.events == (first.events[1],)
    assert page.highest_sequence == 2
    assert page.valid_prefix_sequence == 2
    assert page.valid_prefix_lines == 2


def test_compare_and_append_checks_current_sequence_while_preserving_prefix(tmp_path):
    root, _mansion, log = _existing_mansion(tmp_path)
    store = SeanceLogStore(root, clock_ms=lambda: 200)
    initial = _run(store.append_candidates("demo-mansion", [_candidate("message-1")]))
    prefix = log.read_bytes()

    stale = _run(
        store.compare_and_append(
            "demo-mansion", expected_sequence=0, candidates=[_candidate("message-2")]
        )
    )
    assert stale.status == "conflict"
    assert stale.highest_sequence == 1
    assert stale.events == ()
    assert log.read_bytes() == prefix

    appended = _run(
        store.compare_and_append(
            "demo-mansion", expected_sequence=1, candidates=[_candidate("message-2")]
        )
    )
    assert appended.status == "ok"
    assert appended.events[0].sequence == 2
    assert log.read_bytes().startswith(prefix)
    assert initial.events[0] == _run(
        store.read_after("demo-mansion", after_sequence=0, limit=1)
    ).events[0]


def test_existing_log_keeps_its_writer_selected_unlinked_mode(tmp_path):
    root, _mansion, _log = _existing_mansion(tmp_path)
    unlinked = SeanceLogStore(root, hash_linking=False, clock_ms=lambda: 300)
    first = _run(unlinked.append_candidates("demo-mansion", [_candidate("message-1")]))

    reopened = SeanceLogStore(root, hash_linking=True, clock_ms=lambda: 301)
    second = _run(reopened.append_candidates("demo-mansion", [_candidate("message-2")]))

    assert first.events[0].prev_hash is None
    assert first.events[0].hash is None
    assert second.events[0].prev_hash is None
    assert second.events[0].hash is None


def test_missing_or_symlinked_mansion_is_refused_without_creating_a_log(tmp_path):
    root = tmp_path / "mansions"
    root.mkdir()
    store = SeanceLogStore(root)

    missing = _run(store.append_candidates("demo-mansion", [_candidate("message-1")]))
    assert missing.status == "mansion_not_found"
    assert not (root / "demo-mansion").exists()

    outside = tmp_path / "outside"
    outside.mkdir()
    (root / "demo-mansion").symlink_to(outside, target_is_directory=True)
    escaped = _run(store.append_candidates("demo-mansion", [_candidate("message-1")]))
    assert escaped.status == "unsafe_path"
    assert not (outside / ".haunted-house").exists()


def test_integrity_failure_exposes_only_the_safe_valid_prefix_and_blocks_append(tmp_path):
    root, _mansion, log = _existing_mansion(tmp_path)
    store = SeanceLogStore(root, clock_ms=lambda: 400)
    original = _run(
        store.append_candidates(
            "demo-mansion", [_candidate("message-1"), _candidate("message-2")]
        )
    )
    first_line = log.read_bytes().splitlines(keepends=True)[0]
    log.write_bytes(first_line + b'{"schema_version":1')
    damaged = log.read_bytes()

    read = _run(store.read_after("demo-mansion", after_sequence=0, limit=10))

    assert read.status == "invalid_log"
    assert read.events == (original.events[0],)
    assert read.highest_sequence == 1
    assert read.valid_prefix_sequence == 1
    assert read.valid_prefix_lines == 1
    assert len(read.diagnostics) == 1
    assert read.diagnostics[0].code is WriterDiagnosticCode.INVALID_RECORD
    assert read.diagnostics[0].line == 2
    assert "message-2" not in repr(read.diagnostics)

    refused = _run(store.append_candidates("demo-mansion", [_candidate("message-3")]))
    assert refused.status == "invalid_log"
    assert refused.highest_sequence == 1
    assert log.read_bytes() == damaged
