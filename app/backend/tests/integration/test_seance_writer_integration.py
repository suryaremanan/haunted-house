"""Filesystem and process-integration checks for the sole séance log writer.

Task 4.5.  Every test uses a temporary Mansion root.  Sensitive-looking
values are assembled at runtime so that no credential-shaped literal lives in
the repository.

Validates: Requirements 3.1–3.9, 4.7–4.9, 5.3–5.8, 7.4–7.6, 9.5, 9.7, 12.1, 12.4.
"""

from __future__ import annotations

import ast
import asyncio
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

from haunted_house.adapters.seance_log_store import SeanceLogStore
from haunted_house.core.seance_event import (
    AppEvent,
    AppEventCandidate,
    EventScope,
    EventSource,
    calculate_event_id,
)
from haunted_house.core.seance_persistence import (
    WriterDiagnosticCode,
    build_app_event,
    prepare_candidates,
    serialize_app_event,
)

_MANSION = "demo-mansion"
_GENESIS = "h1:" + "0" * 64
_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_APP_ROOT = _BACKEND_ROOT.parent
_PACKAGE_ROOT = _BACKEND_ROOT / "haunted_house"
_LOG_NAME = "events.v1." + "jsonl"


def _candidate(
    identity: str,
    *,
    revision: int = 0,
    payload: Any = None,
    mansion_id: str = _MANSION,
) -> AppEventCandidate:
    return AppEventCandidate(
        schema_version=1,
        event_type="message_recorded",
        scope=EventScope(
            mansion_id=mansion_id,
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
            source_sequence=0,
        ),
        caused_by=(),
        occurred_at_ms=1_731_400_000_000,
        payload={"text": f"body of {identity}"} if payload is None else payload,
    )


def _run(awaitable):
    return asyncio.run(awaitable)


def _mansion(tmp_path: Path) -> tuple[Path, Path, Path]:
    root = tmp_path / "mansions"
    mansion = root / _MANSION
    mansion.mkdir(parents=True)
    return root, mansion, mansion / ".haunted-house" / "seance" / _LOG_NAME


def _reference_json(value: object) -> bytes:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")


def _reference_hash(record: dict[str, Any]) -> str:
    unhashed = {key: item for key, item in record.items() if key != "hash"}
    return "h1:" + hashlib.sha256(_reference_json(unhashed)).hexdigest()


def _verify_linked_log(raw: bytes) -> list[dict[str, Any]]:
    """Independent verifier: canonical lines, contiguous Sequence, hash chain."""

    assert raw.endswith(b"\n")
    records: list[dict[str, Any]] = []
    previous = _GENESIS
    for index, line in enumerate(raw.split(b"\n")[:-1], start=1):
        record = json.loads(line)
        assert _reference_json(record) == line
        assert record["sequence"] == index
        assert record["prev_hash"] == previous
        assert record["hash"] == _reference_hash(record)
        previous = record["hash"]
        records.append(record)
    return records


def _unlinked_event(identity: str, sequence: int) -> AppEvent:
    [prepared] = prepare_candidates([_candidate(identity)]).candidates
    return build_app_event(
        prepared, sequence=sequence, persisted_at_ms=500 + sequence, prev_hash=None
    )


def _write_log(log: Path, lines: list[bytes]) -> bytes:
    log.parent.mkdir(parents=True)
    log.write_bytes(b"".join(lines))
    return log.read_bytes()


def _assert_safe(diagnostics: object, tmp_path: Path) -> None:
    text = repr(diagnostics)
    assert "body of" not in text
    assert str(tmp_path) not in text
    assert str(Path.home()) not in text


def _assert_append_refused(store: SeanceLogStore, log: Path, damaged: bytes) -> None:
    refused = _run(store.append_candidates(_MANSION, [_candidate("later")]))
    assert refused.status == "invalid_log"
    assert refused.events == ()
    assert log.read_bytes() == damaged


# --- validation and redaction -------------------------------------------------


def test_one_invalid_member_rejects_the_whole_batch_before_any_byte(tmp_path):
    root, mansion, log = _mansion(tmp_path)
    store = SeanceLogStore(root)
    invalid = {"schema_version": 1, "event_type": "not_an_event_type"}

    result = _run(
        store.append_candidates(_MANSION, [_candidate("first"), invalid, object()])
    )

    assert result.status == "invalid"
    assert result.events == ()
    assert result.duplicate_record_ids == ()
    assert [diagnostic.candidate_index for diagnostic in result.diagnostics] == [1, 2]
    assert all(
        diagnostic.code is WriterDiagnosticCode.INVALID_CANDIDATE
        and diagnostic.line is None
        for diagnostic in result.diagnostics
    )
    assert "not_an_event_type" not in repr(result.diagnostics)
    _assert_safe(result.diagnostics, tmp_path)
    assert not log.exists()
    assert not (mansion / ".haunted-house").exists()


def test_a_candidate_scoped_to_another_mansion_rejects_the_whole_batch(tmp_path):
    root, mansion, _log = _mansion(tmp_path)
    (root / "other-mansion").mkdir()
    store = SeanceLogStore(root)

    result = _run(
        store.append_candidates(
            _MANSION,
            [_candidate("first"), _candidate("second", mansion_id="other-mansion")],
        )
    )

    assert result.status == "invalid"
    assert result.events == ()
    [diagnostic] = result.diagnostics
    assert diagnostic.candidate_index == 1
    assert diagnostic.path == "scope.mansion_id"
    assert not (mansion / ".haunted-house").exists()
    assert not (root / "other-mansion" / ".haunted-house").exists()


def test_redaction_runs_before_identifiers_and_persisted_bytes(tmp_path):
    root, _mansion_dir, log = _mansion(tmp_path)
    known = "".join(("writer-", "known/", "value"))
    encoded = known.replace("/", "%2F")
    credential_value = "".join(("ordinary-", "sensitive-value"))
    home_path = "/" + "home" + "/operator/project"
    store = SeanceLogStore(root, known_secrets=[known], clock_ms=lambda: 700)

    result = _run(
        store.append_candidates(
            _MANSION,
            [
                _candidate(
                    "sensitive",
                    payload={
                        "text": f"see {known} now",
                        "link": f"https://example.invalid/?t={encoded}",
                        "api_token": credential_value,
                        "cwd": home_path,
                    },
                )
            ],
        )
    )

    assert result.status == "ok"
    [event] = result.events
    equivalent = _candidate(
        "sensitive",
        payload={
            "text": "see [redacted] now",
            "link": "https://example.invalid/?t=[redacted]",
            "api_token": "[redacted]",
            "cwd": "[home]/project",
        },
    )
    assert event.payload == equivalent.payload
    [prepared] = prepare_candidates([equivalent]).candidates
    assert event.event_id == prepared.event_id
    assert event.record_id == prepared.record_id

    persisted = log.read_bytes()
    for forbidden in (known, encoded, credential_value, "/home/operator"):
        assert forbidden.encode() not in persisted
        assert forbidden not in repr(result)
    [record] = _verify_linked_log(persisted)
    assert record["record_id"] == event.record_id
    assert record["hash"] == event.hash


def test_post_redaction_residual_rejects_the_batch_without_bytes(tmp_path):
    root, mansion, log = _mansion(tmp_path)
    forbidden = "".join(("private ", "document body"))
    store = SeanceLogStore(root, forbidden_document_bodies=[forbidden])

    result = _run(
        store.append_candidates(
            _MANSION,
            [_candidate("safe"), _candidate("leaky", payload={"body": forbidden})],
        )
    )

    assert result.status == "invalid"
    assert result.events == ()
    [diagnostic] = result.diagnostics
    assert diagnostic.candidate_index == 1
    assert diagnostic.safe_detail == "forbidden_document_body"
    assert forbidden not in repr(result)
    assert not log.exists()
    assert not (mansion / ".haunted-house").exists()


# --- concurrency and durability -----------------------------------------------

_WORKER = """
import asyncio, sys
from pathlib import Path
from haunted_house.adapters.seance_log_store import SeanceLogStore
from haunted_house.core.seance_event import AppEventCandidate, EventScope, EventSource

root, worker, count = Path(sys.argv[1]), sys.argv[2], int(sys.argv[3])

def candidate(index):
    return AppEventCandidate(
        schema_version=1,
        event_type="message_recorded",
        scope=EventScope("demo-mansion", "archivist", "study-slot", "requirements-1", 0),
        source=EventSource("crew", "chat_message", (f"{worker}-{index}",), 0, "g", 0),
        caused_by=(),
        occurred_at_ms=None,
        payload={"worker": worker, "index": index, "pad": "x" * 2048},
    )

async def main():
    store = SeanceLogStore(root)
    for index in range(count):
        result = await store.append_candidates("demo-mansion", [candidate(index)])
        assert result.status == "ok", result.status
        assert len(result.events) == 1

asyncio.run(main())
"""


def test_separate_processes_append_without_torn_lines_or_sequence_gaps(tmp_path):
    root, _mansion_dir, log = _mansion(tmp_path)
    workers, per_worker = 4, 12
    # The log exists before the race starts.  Racing its very first creation
    # is a separate case owned by the store's create path.
    seeded = _run(SeanceLogStore(root).append_candidates(_MANSION, [_candidate("seed")]))
    assert seeded.status == "ok"
    env = {**os.environ, "PYTHONPATH": str(_BACKEND_ROOT)}
    processes = [
        subprocess.Popen(
            [sys.executable, "-c", _WORKER, str(root), f"w{index}", str(per_worker)],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        for index in range(workers)
    ]
    for process in processes:
        _out, err = process.communicate(timeout=120)
        assert process.returncode == 0, err.decode("utf-8", "replace")[-400:]

    records = _verify_linked_log(log.read_bytes())
    assert records[0]["record_id"] == seeded.events[0].record_id
    assert len(records) == workers * per_worker + 1
    assert len({record["record_id"] for record in records}) == len(records)
    for worker in range(workers):
        indexes = [
            record["payload"]["index"]
            for record in records[1:]
            if record["payload"]["worker"] == f"w{worker}"
        ]
        assert indexes == list(range(per_worker))

    page = _run(SeanceLogStore(root).read_after(_MANSION, 0, 500))
    assert page.status == "ok"
    assert page.highest_sequence == workers * per_worker + 1


def test_stale_compare_and_append_between_two_store_instances(tmp_path):
    root, _mansion_dir, log = _mansion(tmp_path)
    first_store = SeanceLogStore(root, clock_ms=lambda: 10)
    second_store = SeanceLogStore(root, clock_ms=lambda: 20)

    won = _run(first_store.compare_and_append(_MANSION, 0, [_candidate("first")]))
    committed = log.read_bytes()
    lost = _run(second_store.compare_and_append(_MANSION, 0, [_candidate("second")]))

    assert won.status == "ok"
    assert lost.status == "conflict"
    assert lost.events == ()
    assert lost.highest_sequence == 1
    assert log.read_bytes() == committed

    retried = _run(
        second_store.compare_and_append(
            _MANSION, lost.highest_sequence, [_candidate("second")]
        )
    )
    assert retried.status == "ok"
    assert retried.events[0].sequence == 2
    assert retried.events[0].prev_hash == won.events[0].hash
    assert log.read_bytes().startswith(committed)


@pytest.mark.parametrize("expected_sequence", [-1, True, 1.0, "0", None])
def test_compare_and_append_rejects_a_non_sequence_expectation(
    tmp_path, expected_sequence
):
    root, mansion, _log = _mansion(tmp_path)

    result = _run(
        SeanceLogStore(root).compare_and_append(
            _MANSION, expected_sequence, [_candidate("first")]
        )
    )

    assert result.status == "invalid"
    assert result.events == ()
    assert not (mansion / ".haunted-house").exists()


def test_the_complete_line_is_in_the_file_before_fsync_and_acknowledgement(
    tmp_path, monkeypatch
):
    root, _mansion_dir, log = _mansion(tmp_path)
    store = SeanceLogStore(root, clock_ms=lambda: 30)
    real_fsync = os.fsync
    observed: list[bytes] = []
    order: list[str] = []

    def recording_fsync(descriptor: int) -> None:
        observed.append(log.read_bytes())
        order.append("fsync")
        real_fsync(descriptor)

    monkeypatch.setattr(os, "fsync", recording_fsync)

    async def append() -> Any:
        result = await store.append_candidates(
            _MANSION, [_candidate("first"), _candidate("second")]
        )
        order.append("acknowledged")
        return result

    result = _run(append())

    assert result.status == "ok"
    assert order == ["fsync", "acknowledged"]
    assert observed == [log.read_bytes()]
    assert observed[0] == b"".join(serialize_app_event(event) for event in result.events)
    assert observed[0].endswith(b"\n") and observed[0].count(b"\n") == 2


def test_a_duplicate_only_batch_needs_no_write_or_fsync(tmp_path, monkeypatch):
    root, _mansion_dir, log = _mansion(tmp_path)
    store = SeanceLogStore(root, clock_ms=lambda: 40)
    first = _run(store.append_candidates(_MANSION, [_candidate("first")]))
    committed = log.read_bytes()
    calls: list[int] = []
    real_fsync = os.fsync
    monkeypatch.setattr(
        os, "fsync", lambda descriptor: (calls.append(descriptor), real_fsync(descriptor))
    )

    again = _run(
        SeanceLogStore(root, clock_ms=lambda: 99).append_candidates(
            _MANSION, [_candidate("first"), _candidate("first")]
        )
    )

    assert again.status == "ok"
    assert again.events == (first.events[0], first.events[0])
    assert again.duplicate_record_ids == (first.events[0].record_id,) * 2
    assert again.highest_sequence == 1
    assert again.diagnostics == ()
    assert calls == []
    assert log.read_bytes() == committed


def test_an_fsync_failure_acknowledges_no_event(tmp_path, monkeypatch):
    root, _mansion_dir, log = _mansion(tmp_path)
    store = SeanceLogStore(root, clock_ms=lambda: 50)
    committed_result = _run(store.append_candidates(_MANSION, [_candidate("first")]))
    assert committed_result.status == "ok"
    committed = log.read_bytes()

    def failing_fsync(_descriptor: int) -> None:
        raise OSError(5, "injected fsync failure")

    monkeypatch.setattr(os, "fsync", failing_fsync)
    failed = _run(store.append_candidates(_MANSION, [_candidate("second")]))

    assert failed.status == "failed"
    assert failed.events == ()
    assert failed.duplicate_record_ids == ()
    [diagnostic] = failed.diagnostics
    assert diagnostic.code is WriterDiagnosticCode.PERSISTENCE_FAILED
    assert "injected" not in repr(failed)
    _assert_safe(failed.diagnostics, tmp_path)
    # Earlier acknowledged bytes are never rewritten by a failed append.
    assert log.read_bytes().startswith(committed)


def test_conflicting_variants_are_appended_and_diagnosed(tmp_path):
    root, _mansion_dir, log = _mansion(tmp_path)
    store = SeanceLogStore(root, clock_ms=lambda: 60)
    original = _candidate("message", revision=0)
    variant = _candidate("message", revision=1)
    assert calculate_event_id(original) == calculate_event_id(variant)

    first = _run(store.append_candidates(_MANSION, [original]))
    prefix = log.read_bytes()
    second = _run(store.append_candidates(_MANSION, [variant]))

    assert first.diagnostics == ()
    assert second.status == "ok"
    assert second.events[0].sequence == 2
    assert second.events[0].event_id == first.events[0].event_id
    assert second.events[0].record_id != first.events[0].record_id
    assert [diagnostic.code for diagnostic in second.diagnostics] == [
        WriterDiagnosticCode.CONFLICTING_VARIANT
    ]
    assert second.duplicate_record_ids == ()
    assert log.read_bytes().startswith(prefix)
    assert len(_verify_linked_log(log.read_bytes())) == 2


def test_acknowledged_prefixes_stay_immutable_across_many_appends(tmp_path):
    root, _mansion_dir, log = _mansion(tmp_path)
    ticks = iter(range(100, 10_000))
    store = SeanceLogStore(root, clock_ms=lambda: next(ticks))
    prefixes: list[bytes] = []
    acknowledged: list[AppEvent] = []

    for index in range(25):
        result = _run(
            store.append_candidates(
                _MANSION,
                [_candidate(f"message-{index}"), _candidate(f"message-{index // 2}")],
            )
        )
        assert result.status == "ok"
        current = log.read_bytes()
        assert all(current.startswith(prefix) for prefix in prefixes)
        prefixes.append(current)
        acknowledged.extend(
            event for event in result.events if event not in acknowledged
        )

    records = _verify_linked_log(log.read_bytes())
    assert [record["record_id"] for record in records] == [
        event.record_id for event in acknowledged
    ]
    page = _run(store.read_after(_MANSION, 0, 500))
    assert page.events == tuple(acknowledged)
    second_page = _run(store.read_after(_MANSION, 10, 5))
    assert second_page.events == tuple(acknowledged[10:15])
    assert second_page.highest_sequence == len(acknowledged)


# --- confinement ----------------------------------------------------------------


def _outside(tmp_path: Path) -> Path:
    outside = tmp_path / "outside"
    outside.mkdir()
    return outside


def _tree(path: Path) -> list[str]:
    return sorted(str(item.relative_to(path)) for item in path.rglob("*"))


def test_a_symlinked_mansion_directory_is_refused(tmp_path):
    root = tmp_path / "mansions"
    root.mkdir()
    outside = _outside(tmp_path)
    (root / _MANSION).symlink_to(outside, target_is_directory=True)
    store = SeanceLogStore(root)

    appended = _run(store.append_candidates(_MANSION, [_candidate("first")]))
    read = _run(store.read_after(_MANSION, 0, 10))

    assert appended.status == "unsafe_path"
    assert read.status == "unsafe_path"
    assert appended.events == () and read.events == ()
    assert _tree(outside) == []
    _assert_safe((appended.diagnostics, read.diagnostics), tmp_path)


@pytest.mark.parametrize("level", ["house", "seance"])
def test_a_symlinked_private_directory_is_refused(tmp_path, level):
    root, mansion, _log = _mansion(tmp_path)
    outside = _outside(tmp_path)
    if level == "house":
        (mansion / ".haunted-house").symlink_to(outside, target_is_directory=True)
    else:
        (mansion / ".haunted-house").mkdir()
        (mansion / ".haunted-house" / "seance").symlink_to(
            outside, target_is_directory=True
        )
    store = SeanceLogStore(root)

    appended = _run(store.append_candidates(_MANSION, [_candidate("first")]))
    read = _run(store.read_after(_MANSION, 0, 10))

    assert appended.status == "unsafe_path"
    assert read.status == "unsafe_path"
    assert appended.events == () and read.events == ()
    assert _tree(outside) == []
    _assert_safe((appended.diagnostics, read.diagnostics), tmp_path)


def test_a_symlinked_log_file_is_refused_and_its_target_is_untouched(tmp_path):
    root, _mansion_dir, log = _mansion(tmp_path)
    outside = _outside(tmp_path)
    target = outside / "elsewhere.txt"
    target.write_bytes(b"")
    log.parent.mkdir(parents=True)
    log.symlink_to(target)
    store = SeanceLogStore(root)

    appended = _run(store.append_candidates(_MANSION, [_candidate("first")]))
    read = _run(store.read_after(_MANSION, 0, 10))

    assert appended.status == "unsafe_path"
    assert read.status == "unsafe_path"
    assert target.read_bytes() == b""
    assert _tree(outside) == ["elsewhere.txt"]


def test_a_dangling_log_symlink_cannot_create_a_file_outside(tmp_path):
    root, _mansion_dir, log = _mansion(tmp_path)
    outside = _outside(tmp_path)
    log.parent.mkdir(parents=True)
    log.symlink_to(outside / "created-by-escape.txt")

    appended = _run(
        SeanceLogStore(root).append_candidates(_MANSION, [_candidate("first")])
    )

    assert appended.status == "unsafe_path"
    assert _tree(outside) == []


def test_a_symlinked_or_relative_mansion_root_is_refused(tmp_path):
    real_root, _mansion_dir, log = _mansion(tmp_path)
    linked_root = tmp_path / "linked-mansions"
    linked_root.symlink_to(real_root, target_is_directory=True)

    through_link = _run(
        SeanceLogStore(linked_root).append_candidates(_MANSION, [_candidate("first")])
    )
    relative = _run(
        SeanceLogStore(Path("mansions")).append_candidates(
            _MANSION, [_candidate("first")]
        )
    )

    assert through_link.status == "unsafe_path"
    assert relative.status == "unsafe_path"
    assert not log.exists()


def test_a_missing_mansion_is_never_created(tmp_path):
    root = tmp_path / "mansions"
    root.mkdir()
    store = SeanceLogStore(root)

    appended = _run(store.append_candidates(_MANSION, [_candidate("first")]))
    compared = _run(store.compare_and_append(_MANSION, 0, [_candidate("first")]))
    read = _run(store.read_after(_MANSION, 0, 10))

    assert appended.status == compared.status == read.status == "mansion_not_found"
    assert appended.events == compared.events == read.events == ()
    assert _tree(root) == []
    _assert_safe((appended.diagnostics, read.diagnostics), tmp_path)


def test_reading_a_mansion_without_a_log_creates_nothing(tmp_path):
    root, mansion, _log = _mansion(tmp_path)

    read = _run(SeanceLogStore(root).read_after(_MANSION, 0, 10))

    assert read.status == "log_not_found"
    assert read.events == ()
    assert read.highest_sequence == 0
    assert _tree(mansion) == []


@pytest.mark.parametrize(
    "mansion_id",
    ["../demo-mansion", "Demo-Mansion", "a" * 41, "", "demo_mansion", "demo/mansion", 7],
)
def test_invalid_mansion_ids_touch_no_path(tmp_path, mansion_id):
    root, mansion, _log = _mansion(tmp_path)
    store = SeanceLogStore(root)

    appended = _run(store.append_candidates(mansion_id, [_candidate("first")]))
    read = _run(store.read_after(mansion_id, 0, 10))

    assert appended.status == "invalid"
    assert read.status == "invalid"
    assert appended.events == () and read.events == ()
    assert _tree(root) == [_MANSION]
    assert _tree(mansion) == []


@pytest.mark.parametrize(
    ("after_sequence", "limit"),
    [(-1, 10), (0, 0), (0, 501), (True, 10), (0, True), ("0", 10), (0, 1.0)],
)
def test_read_after_rejects_out_of_contract_paging(tmp_path, after_sequence, limit):
    root, _mansion_dir, _log = _mansion(tmp_path)
    store = SeanceLogStore(root)
    _run(store.append_candidates(_MANSION, [_candidate("first")]))

    read = _run(store.read_after(_MANSION, after_sequence, limit))

    assert read.status == "invalid"
    assert read.events == ()


# --- physical log integrity -------------------------------------------------------


def test_a_complete_json_record_without_its_newline_is_not_authoritative(tmp_path):
    root, _mansion_dir, log = _mansion(tmp_path)
    store = SeanceLogStore(root, clock_ms=lambda: 70)
    appended = _run(
        store.append_candidates(_MANSION, [_candidate("first"), _candidate("second")])
    )
    damaged = log.read_bytes()[:-1]
    log.write_bytes(damaged)

    read = _run(store.read_after(_MANSION, 0, 10))

    assert read.status == "invalid_log"
    assert read.events == (appended.events[0],)
    assert read.highest_sequence == read.valid_prefix_sequence == 1
    assert read.valid_prefix_lines == 1
    [diagnostic] = read.diagnostics
    assert diagnostic.code is WriterDiagnosticCode.INVALID_RECORD
    assert diagnostic.line == 2
    assert read.integrity_ok is False
    _assert_safe(read.diagnostics, tmp_path)
    _assert_append_refused(store, log, damaged)


def test_an_unlinked_record_in_a_linked_log_is_a_mixed_integrity_failure(tmp_path):
    root, _mansion_dir, log = _mansion(tmp_path)
    store = SeanceLogStore(root, clock_ms=lambda: 80)
    appended = _run(store.append_candidates(_MANSION, [_candidate("first")]))
    with log.open("ab") as handle:
        handle.write(serialize_app_event(_unlinked_event("second", 2)))
    damaged = log.read_bytes()

    read = _run(store.read_after(_MANSION, 0, 10))

    assert read.status == "invalid_log"
    assert read.events == appended.events
    assert read.highest_sequence == read.valid_prefix_sequence == 1
    assert read.valid_prefix_lines == 1
    [diagnostic] = read.diagnostics
    assert diagnostic.code is WriterDiagnosticCode.MIXED_INTEGRITY_MODE
    assert diagnostic.line == 2
    _assert_safe(read.diagnostics, tmp_path)
    _assert_append_refused(store, log, damaged)


def test_a_linked_record_in_an_unlinked_log_is_a_mixed_integrity_failure(tmp_path):
    root, _mansion_dir, log = _mansion(tmp_path)
    [prepared] = prepare_candidates([_candidate("second")]).candidates
    linked = build_app_event(
        prepared, sequence=2, persisted_at_ms=502, prev_hash=_GENESIS
    )
    damaged = _write_log(
        log,
        [serialize_app_event(_unlinked_event("first", 1)), serialize_app_event(linked)],
    )
    store = SeanceLogStore(root)

    read = _run(store.read_after(_MANSION, 0, 10))

    assert read.status == "invalid_log"
    assert [event.sequence for event in read.events] == [1]
    [diagnostic] = read.diagnostics
    assert diagnostic.code is WriterDiagnosticCode.MIXED_INTEGRITY_MODE
    assert diagnostic.line == 2
    _assert_append_refused(store, log, damaged)


def _linked_lines(tmp_path: Path, count: int) -> tuple[Path, Path, list[dict[str, Any]]]:
    root, _mansion_dir, log = _mansion(tmp_path)
    store = SeanceLogStore(root, clock_ms=lambda: 90)
    result = _run(
        store.append_candidates(
            _MANSION, [_candidate(f"message-{index}") for index in range(count)]
        )
    )
    assert result.status == "ok"
    return root, log, _verify_linked_log(log.read_bytes())


def _rewrite(log: Path, records: list[dict[str, Any]]) -> bytes:
    log.write_bytes(b"".join(_reference_json(record) + b"\n" for record in records))
    return log.read_bytes()


def test_a_tampered_record_fails_its_hash_and_exposes_only_the_prefix(tmp_path):
    root, log, records = _linked_lines(tmp_path, 3)
    records[1]["persisted_at_ms"] += 1  # body changed, stored hash left alone
    damaged = _rewrite(log, records)
    store = SeanceLogStore(root)

    read = _run(store.read_after(_MANSION, 0, 10))

    assert read.status == "invalid_log"
    assert [event.sequence for event in read.events] == [1]
    assert read.highest_sequence == read.valid_prefix_sequence == 1
    assert read.valid_prefix_lines == 1
    [diagnostic] = read.diagnostics
    assert diagnostic.code is WriterDiagnosticCode.HASH_MISMATCH
    assert diagnostic.line == 2
    _assert_safe(read.diagnostics, tmp_path)
    _assert_append_refused(store, log, damaged)


def test_a_replaced_hash_value_is_a_hash_mismatch(tmp_path):
    root, log, records = _linked_lines(tmp_path, 2)
    records[1]["hash"] = "h1:" + "f" * 64
    damaged = _rewrite(log, records)
    store = SeanceLogStore(root)

    read = _run(store.read_after(_MANSION, 0, 10))

    assert [event.sequence for event in read.events] == [1]
    [diagnostic] = read.diagnostics
    assert diagnostic.code is WriterDiagnosticCode.HASH_MISMATCH
    assert diagnostic.line == 2
    _assert_append_refused(store, log, damaged)


def test_a_self_consistent_record_with_a_wrong_predecessor_breaks_the_link(tmp_path):
    root, log, records = _linked_lines(tmp_path, 3)
    records[1]["prev_hash"] = "h1:" + "a" * 64
    records[1]["hash"] = _reference_hash(records[1])
    damaged = _rewrite(log, records)
    store = SeanceLogStore(root)

    read = _run(store.read_after(_MANSION, 0, 10))

    assert read.status == "invalid_log"
    assert [event.sequence for event in read.events] == [1]
    [diagnostic] = read.diagnostics
    assert diagnostic.code is WriterDiagnosticCode.HASH_LINK_BROKEN
    assert diagnostic.line == 2
    _assert_append_refused(store, log, damaged)


def test_a_first_record_that_does_not_link_to_genesis_has_no_valid_prefix(tmp_path):
    root, log, records = _linked_lines(tmp_path, 2)
    damaged = _rewrite(log, records[1:] )
    store = SeanceLogStore(root)

    read = _run(store.read_after(_MANSION, 0, 10))

    assert read.status == "invalid_log"
    assert read.events == ()
    assert read.highest_sequence == 0
    assert read.valid_prefix_lines == 0
    [diagnostic] = read.diagnostics
    assert diagnostic.line == 1
    assert diagnostic.code in {
        WriterDiagnosticCode.MISSING_SEQUENCE,
        WriterDiagnosticCode.HASH_LINK_BROKEN,
    }
    _assert_append_refused(store, log, damaged)


@pytest.mark.parametrize(
    ("sequences", "code", "prefix"),
    [
        ((1, 1), WriterDiagnosticCode.DUPLICATE_SEQUENCE, 1),
        ((1, 2, 2), WriterDiagnosticCode.DUPLICATE_SEQUENCE, 2),
        ((1, 3), WriterDiagnosticCode.MISSING_SEQUENCE, 1),
        ((2,), WriterDiagnosticCode.MISSING_SEQUENCE, 0),
        ((1, 2, 4, 5), WriterDiagnosticCode.MISSING_SEQUENCE, 2),
    ],
)
def test_duplicate_or_missing_sequences_stop_at_the_first_invalid_line(
    tmp_path, sequences, code, prefix
):
    root, _mansion_dir, log = _mansion(tmp_path)
    damaged = _write_log(
        log,
        [
            serialize_app_event(_unlinked_event(f"message-{index}", sequence))
            for index, sequence in enumerate(sequences)
        ],
    )
    store = SeanceLogStore(root)

    read = _run(store.read_after(_MANSION, 0, 10))

    assert read.status == "invalid_log"
    assert [event.sequence for event in read.events] == list(range(1, prefix + 1))
    assert read.highest_sequence == read.valid_prefix_sequence == prefix
    assert read.valid_prefix_lines == prefix
    [diagnostic] = read.diagnostics
    assert diagnostic.code is code
    assert diagnostic.line == prefix + 1
    _assert_safe(read.diagnostics, tmp_path)
    _assert_append_refused(store, log, damaged)


def test_an_empty_existing_log_reads_as_sequence_zero_without_error(tmp_path):
    root, _mansion_dir, log = _mansion(tmp_path)
    _write_log(log, [])

    read = _run(SeanceLogStore(root).read_after(_MANSION, 0, 10))

    assert read.status == "ok"
    assert read.events == ()
    assert read.highest_sequence == 0
    assert read.diagnostics == ()
    assert read.integrity_ok is True


# --- ownership --------------------------------------------------------------------


def _app_python_sources() -> list[Path]:
    sources = sorted(_PACKAGE_ROOT.rglob("*.py"))
    main = _BACKEND_ROOT / "main.py"
    if main.exists():
        sources.append(main)
    mcp = _APP_ROOT / "mcp"
    if mcp.exists():
        sources.extend(sorted(mcp.rglob("*.py")))
    return [path for path in sources if "__pycache__" not in path.parts]


def _docstring_nodes(tree: ast.AST) -> set[int]:
    found: set[int] = set()
    for node in ast.walk(tree):
        if isinstance(
            node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)
        ):
            body = node.body
            if (
                body
                and isinstance(body[0], ast.Expr)
                and isinstance(body[0].value, ast.Constant)
                and isinstance(body[0].value.value, str)
            ):
                found.add(id(body[0].value))
    return found


def _jsonl_findings(path: Path, source: str) -> tuple[list[str], list[str]]:
    """Return (code string constants, docstrings) that mention a JSONL name."""

    tree = ast.parse(source)
    docstrings = _docstring_nodes(tree)
    code: list[str] = []
    docs: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            if ".jsonl" not in node.value:
                continue
            (docs if id(node) in docstrings else code).append(node.value)
    return code, docs


def test_the_app_source_has_one_log_filename_and_one_direct_writer():
    sources = _app_python_sources()
    store_path = _PACKAGE_ROOT / "adapters" / "seance_log_store.py"
    documented = {store_path, _PACKAGE_ROOT / "core" / "seance_persistence.py"}
    assert store_path in sources

    for path in sources:
        source = path.read_text(encoding="utf-8")
        relative = path.relative_to(_APP_ROOT).as_posix()
        code, docs = _jsonl_findings(path, source)
        if path == store_path:
            assert code == [_LOG_NAME], relative
        else:
            assert code == [], f"{relative} names a JSONL file in code"
        if path not in documented:
            assert docs == [], f"{relative} documents a JSONL file"
        for text in docs:
            names = {
                word.strip("`'\".,:;()<>")
                for word in text.replace("/", " ").split()
                if ".jsonl" in word
            }
            assert names <= {_LOG_NAME}, relative
        assert "seance.jsonl" not in source, relative
        assert "seance_store" not in source, relative
        assert path.stem != "seance_store", relative


def test_the_ownership_scan_flags_a_second_log_writer(tmp_path):
    offender = tmp_path / "ledger.py"
    offender.write_text(
        '"""Second ledger."""\nLEDGER = "approvals.v1.jsonl"\n', encoding="utf-8"
    )

    code, docs = _jsonl_findings(offender, offender.read_text(encoding="utf-8"))

    assert code == ["approvals.v1.jsonl"]
    assert docs == []
