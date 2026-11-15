"""Property 7 for the sole canonical séance log writer.

Each example drives the real ``SeanceLogStore`` in a private temporary
Mansion root with a generated sequence of appends, exact retries, variant
appends, and current or stale compare-and-append calls.  A small reference
model predicts Sequence assignment, and an independent verifier written
against the design (not the production serializer) checks the persisted
bytes and the optional hash chain.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import tempfile
from pathlib import Path

from hypothesis import given, settings
from hypothesis import strategies as st

from haunted_house.adapters.seance_log_store import SeanceLogStore
from haunted_house.core.seance_event import (
    AppEventCandidate,
    EventScope,
    EventSource,
    calculate_event_id,
    calculate_record_id,
)
from haunted_house.core.seance_persistence import WriterDiagnosticCode

_MANSION = "demo-mansion"
_GENESIS = "h1:" + "0" * 64
_IDENTITIES = ("alpha", "bravo", "charlie", "delta")
_REVISIONS = (0, 1, 2)

_KEYS = st.tuples(st.sampled_from(_IDENTITIES), st.sampled_from(_REVISIONS))
_BATCHES = st.lists(_KEYS, min_size=0, max_size=4)
_OPERATIONS = st.lists(
    st.one_of(
        st.tuples(st.just("append"), _BATCHES, st.just(0)),
        st.tuples(st.just("compare_current"), _BATCHES, st.just(0)),
        st.tuples(
            st.just("compare_stale"),
            _BATCHES,
            st.integers(min_value=-3, max_value=3).filter(lambda value: value != 0),
        ),
    ),
    min_size=1,
    max_size=8,
)


def _candidate(key: tuple[str, int]) -> AppEventCandidate:
    """Same identity gives one Event_ID; each revision is a distinct record."""

    identity, revision = key
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
            revision=revision,
            generation="generation-1",
            source_sequence=0,
        ),
        caused_by=(),
        occurred_at_ms=None,
        payload={"text": identity},
    )


def _reference_json(value: object) -> bytes:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")


def _verify_bytes(raw: bytes, *, linked: bool) -> list[dict[str, object]]:
    """Independent reference verifier for the persisted physical log."""

    if not raw:
        return []
    assert raw.endswith(b"\n")
    lines = raw.split(b"\n")[:-1]
    records: list[dict[str, object]] = []
    previous_hash = _GENESIS
    for index, line in enumerate(lines, start=1):
        record = json.loads(line)
        assert isinstance(record, dict)
        assert _reference_json(record) == line  # canonical bytes, one line
        assert record["sequence"] == index
        if linked:
            assert record["prev_hash"] == previous_hash
            unhashed = {key: item for key, item in record.items() if key != "hash"}
            expected_hash = "h1:" + hashlib.sha256(_reference_json(unhashed)).hexdigest()
            assert record["hash"] == expected_hash
            previous_hash = expected_hash
        else:
            assert "prev_hash" not in record
            assert "hash" not in record
        records.append(record)
    assert len({record["record_id"] for record in records}) == len(records)
    return records


def _log_bytes(root: Path) -> bytes:
    path = root / _MANSION / ".haunted-house" / "seance" / "events.v1.jsonl"
    return path.read_bytes() if path.exists() else b""


# Feature: seance-log-and-ghost-state, Property 7: The writer is monotonic, idempotent, and tamper-evident
@settings(max_examples=200, deadline=None)
@given(operations=_OPERATIONS, hash_linking=st.booleans())
def test_writer_is_monotonic_idempotent_and_tamper_evident(operations, hash_linking):
    """**Validates: Requirements 3.1, 3.6–3.8, 5.3, 5.5–5.8**"""

    async def scenario(root: Path) -> None:
        ticks = iter(range(1_000, 100_000))
        store = SeanceLogStore(
            root, hash_linking=hash_linking, clock_ms=lambda: next(ticks)
        )
        sequence_by_record: dict[str, int] = {}
        seen_event_ids: set[str] = set()
        highest = 0

        for kind, batch, offset in operations:
            candidates = [_candidate(key) for key in batch]
            before = _log_bytes(root)

            if kind == "compare_stale":
                expected_sequence = highest + offset
                result = await store.compare_and_append(
                    _MANSION, expected_sequence, candidates
                )
                if expected_sequence < 0:
                    assert result.status == "invalid"
                else:
                    assert result.status == "conflict"
                    assert result.highest_sequence == highest
                assert result.events == ()
                assert result.duplicate_record_ids == ()
                assert _log_bytes(root) == before
                continue

            if kind == "compare_current":
                result = await store.compare_and_append(_MANSION, highest, candidates)
            else:
                result = await store.append_candidates(_MANSION, candidates)

            expected_sequences: list[int] = []
            expected_duplicates: list[str] = []
            expected_conflicts = 0
            for candidate in candidates:
                record_id = calculate_record_id(candidate)
                event_id = calculate_event_id(candidate)
                if record_id in sequence_by_record:
                    expected_duplicates.append(record_id)
                else:
                    highest += 1
                    sequence_by_record[record_id] = highest
                    if event_id in seen_event_ids:
                        expected_conflicts += 1
                    seen_event_ids.add(event_id)
                expected_sequences.append(sequence_by_record[record_id])

            assert result.status == "ok"
            assert result.highest_sequence == highest
            assert [event.sequence for event in result.events] == expected_sequences
            assert [event.record_id for event in result.events] == [
                calculate_record_id(candidate) for candidate in candidates
            ]
            assert list(result.duplicate_record_ids) == expected_duplicates
            assert [diagnostic.code for diagnostic in result.diagnostics] == [
                WriterDiagnosticCode.CONFLICTING_VARIANT
            ] * expected_conflicts

            after = _log_bytes(root)
            assert after.startswith(before)
            new_records = len(candidates) - len(expected_duplicates)
            assert after.count(b"\n") == before.count(b"\n") + new_records
            if new_records == 0:
                assert after == before

            records = _verify_bytes(after, linked=hash_linking)
            assert [record["sequence"] for record in records] == list(
                range(1, highest + 1)
            )
            assert {
                record["record_id"]: record["sequence"] for record in records
            } == sequence_by_record
            for event in result.events:
                stored = records[event.sequence - 1]
                assert stored["record_id"] == event.record_id
                assert stored["event_id"] == event.event_id
                assert stored["persisted_at_ms"] == event.persisted_at_ms
                assert stored.get("hash") == event.hash
                assert stored.get("prev_hash") == event.prev_hash

        if highest:
            page = await store.read_after(_MANSION, 0, 500)
            assert page.status == "ok"
            assert page.diagnostics == ()
            assert page.highest_sequence == highest
            assert page.valid_prefix_sequence == highest
            assert [event.sequence for event in page.events] == list(
                range(1, highest + 1)
            )
            assert {
                event.record_id: event.sequence for event in page.events
            } == sequence_by_record
            tail = await store.read_after(_MANSION, highest, 500)
            assert tail.events == ()
            assert tail.highest_sequence == highest

    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory).resolve() / "mansions"
        (root / _MANSION).mkdir(parents=True)
        asyncio.run(scenario(root))
