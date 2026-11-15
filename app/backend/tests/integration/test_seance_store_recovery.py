"""Store-level recovery and failure-atomicity checks for the séance log.

Tasks 4.5 and 6.1.  These cover the behaviors the writer integration file
leaves to the Canonical_Parser task: recovery past independently malformed
lines, the valid-prefix boundary, read-after paging, and the three failure
modes in which an append must leave no unacknowledged trace.

Validates: Requirements 3.6–3.8, 5.6, 7.4–7.6, 9.4, 9.5, 9.8.
"""

from __future__ import annotations

import asyncio
import os
import subprocess
import sys
from pathlib import Path

import pytest

from haunted_house.adapters.seance_log_store import SeanceLogStore
from haunted_house.core.seance_event import (
    AppEventCandidate,
    EventScope,
    EventSource,
)
from haunted_house.core.seance_persistence import (
    MAX_READ_LIMIT,
    WriterDiagnosticCode,
)

_MANSION = "demo-mansion"
_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_LOG_NAME = "events.v1." + "jsonl"


def _candidate(identity: str) -> AppEventCandidate:
    return AppEventCandidate(
        schema_version=1,
        event_type="message_recorded",
        scope=EventScope(
            mansion_id=_MANSION,
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
            source_sequence=0,
        ),
        caused_by=(),
        occurred_at_ms=None,
        payload={"text": f"body of {identity}"},
    )


def _run(awaitable):
    return asyncio.run(awaitable)


def _mansion(tmp_path: Path) -> tuple[Path, Path]:
    root = tmp_path / "mansions"
    (root / _MANSION).mkdir(parents=True)
    return root, root / _MANSION / ".haunted-house" / "seance" / _LOG_NAME


def _seed(tmp_path: Path, count: int, *, hash_linking: bool = True):
    root, log = _mansion(tmp_path)
    store = SeanceLogStore(root, hash_linking=hash_linking, clock_ms=lambda: 7)
    appended = _run(
        store.append_candidates(
            _MANSION, [_candidate(f"message-{index}") for index in range(count)]
        )
    )
    assert appended.status == "ok"
    return store, log, appended.events, log.read_bytes().splitlines(keepends=True)


@pytest.mark.parametrize("hash_linking", [True, False])
@pytest.mark.parametrize(
    "junk",
    [b"not json\n", b"{}\n", b"\n", b'{"schema_version":2}\n', b"\xff\xfe\n"],
    ids=["text", "empty-object", "blank", "unsupported-schema", "bad-utf8"],
)
def test_an_extra_malformed_line_is_diagnosed_and_later_records_are_still_read(
    tmp_path, hash_linking, junk
):
    store, log, events, lines = _seed(tmp_path, 4, hash_linking=hash_linking)
    log.write_bytes(lines[0] + lines[1] + junk + lines[2] + lines[3])
    damaged = log.read_bytes()

    read = _run(store.read_after(_MANSION, 0, 10))

    assert read.status == "invalid_log"
    assert read.integrity_ok is False
    assert read.events == events
    assert read.highest_sequence == 4
    assert read.valid_prefix_lines == 2
    assert read.valid_prefix_sequence == 2
    assert [diagnostic.line for diagnostic in read.diagnostics] == [3]
    assert read.diagnostics[0].code in {
        WriterDiagnosticCode.INVALID_RECORD,
        WriterDiagnosticCode.UNSUPPORTED_SCHEMA,
    }

    refused = _run(store.append_candidates(_MANSION, [_candidate("later")]))
    assert refused.status == "invalid_log"
    assert refused.events == ()
    assert log.read_bytes() == damaged


@pytest.mark.parametrize("hash_linking", [True, False])
def test_a_corrupted_record_cannot_hide_the_gap_it_leaves(tmp_path, hash_linking):
    store, log, events, lines = _seed(tmp_path, 4, hash_linking=hash_linking)
    log.write_bytes(lines[0] + lines[1][:-10] + b"\n" + lines[2] + lines[3])

    read = _run(store.read_after(_MANSION, 0, 10))

    assert read.status == "invalid_log"
    assert read.events == events[:1]
    assert read.highest_sequence == 1
    assert read.valid_prefix_lines == 1
    assert [(d.line, d.code) for d in read.diagnostics] == [
        (2, WriterDiagnosticCode.INVALID_RECORD),
        (3, WriterDiagnosticCode.MISSING_SEQUENCE),
    ]


def test_read_after_pages_physical_records_by_sequence_and_fixed_limits(tmp_path):
    store, _log, events, _lines = _seed(tmp_path, 7)

    collected = []
    after = 0
    while True:
        page = _run(store.read_after(_MANSION, after, 3))
        assert page.status == "ok"
        assert page.highest_sequence == 7
        assert page.valid_prefix_sequence == 7
        assert len(page.events) <= 3
        if not page.events:
            break
        assert page.events[0].sequence == after + 1
        collected.extend(page.events)
        after = page.events[-1].sequence

    assert tuple(collected) == events
    assert _run(store.read_after(_MANSION, 7, MAX_READ_LIMIT)).events == ()
    assert _run(store.read_after(_MANSION, 99, 1)).events == ()
    assert _run(store.read_after(_MANSION, 0, MAX_READ_LIMIT + 1)).status == "invalid"


def test_a_failed_fsync_leaves_no_unacknowledged_record(tmp_path, monkeypatch):
    store, log, events, _lines = _seed(tmp_path, 1)
    committed = log.read_bytes()

    def failing_fsync(_descriptor: int) -> None:
        raise OSError("disk unavailable")

    with monkeypatch.context() as patched:
        patched.setattr(os, "fsync", failing_fsync)
        failed = _run(store.append_candidates(_MANSION, [_candidate("lost")]))
        stale = _run(
            store.compare_and_append(_MANSION, 1, [_candidate("lost-too")])
        )

    assert failed.status == "failed"
    assert failed.events == ()
    assert stale.status == "failed"
    assert log.read_bytes() == committed

    read = _run(store.read_after(_MANSION, 0, 10))
    assert read.status == "ok"
    assert read.events == events

    retried = _run(store.compare_and_append(_MANSION, 1, [_candidate("lost")]))
    assert retried.status == "ok"
    assert retried.duplicate_record_ids == ()
    assert [event.sequence for event in retried.events] == [2]
    assert log.read_bytes().startswith(committed)


def test_a_failed_write_leaves_no_torn_line(tmp_path, monkeypatch):
    store, log, _events, _lines = _seed(tmp_path, 1)
    committed = log.read_bytes()
    real_write = os.write

    def torn_write(descriptor: int, data) -> int:
        real_write(descriptor, bytes(data)[:9])
        raise OSError("no space left")

    with monkeypatch.context() as patched:
        patched.setattr(os, "write", torn_write)
        failed = _run(store.append_candidates(_MANSION, [_candidate("torn")]))

    assert failed.status == "failed"
    assert failed.events == ()
    assert log.read_bytes() == committed
    assert _run(store.append_candidates(_MANSION, [_candidate("next")])).status == "ok"


def test_a_stale_comparison_against_an_absent_log_creates_nothing(tmp_path):
    root, log = _mansion(tmp_path)
    store = SeanceLogStore(root)

    stale = _run(store.compare_and_append(_MANSION, 5, [_candidate("first")]))

    assert stale.status == "conflict"
    assert stale.highest_sequence == 0
    assert stale.events == ()
    assert list((root / _MANSION).iterdir()) == []
    assert _run(store.read_after(_MANSION, 0, 1)).status == "log_not_found"

    first = _run(store.compare_and_append(_MANSION, 0, [_candidate("first")]))
    assert first.status == "ok"
    assert first.highest_sequence == 1
    assert log.is_file()


_FIRST_APPEND_WORKER = """
import asyncio, sys
from pathlib import Path
from haunted_house.adapters.seance_log_store import SeanceLogStore
from haunted_house.core.seance_event import AppEventCandidate, EventScope, EventSource

candidate = AppEventCandidate(
    schema_version=1,
    event_type="message_recorded",
    scope=EventScope("demo-mansion", "archivist", "study-slot", "requirements-1", 0),
    source=EventSource("crew", "chat_message", (sys.argv[2],), 0, "generation-1", 0),
    caused_by=(),
    occurred_at_ms=None,
    payload={"worker": sys.argv[2]},
)
result = asyncio.run(
    SeanceLogStore(Path(sys.argv[1])).append_candidates("demo-mansion", [candidate])
)
print(result.status)
"""


def test_processes_racing_to_create_the_log_all_append(tmp_path):
    env = {**os.environ, "PYTHONPATH": str(_BACKEND_ROOT)}
    for trial in range(8):
        root = tmp_path / f"trial-{trial}" / "mansions"
        (root / _MANSION).mkdir(parents=True)
        workers = [
            subprocess.Popen(
                [sys.executable, "-c", _FIRST_APPEND_WORKER, str(root), str(index)],
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            for index in range(6)
        ]
        outcomes = [worker.communicate(timeout=60)[0].strip() for worker in workers]

        assert outcomes == ["ok"] * 6
        read = _run(SeanceLogStore(root).read_after(_MANSION, 0, 10))
        assert read.status == "ok"
        assert [event.sequence for event in read.events] == [1, 2, 3, 4, 5, 6]
