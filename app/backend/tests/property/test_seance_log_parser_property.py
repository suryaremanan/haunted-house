"""Property 10 for canonical serialization and integrity parsing.

Each example builds a valid physical log through the pure writer transforms,
then checks three things: serialization and parsing round-trip to identical
bytes; independently malformed lines are reported at their exact one-based
lines without losing a later valid record; and a Sequence or hash corruption
exposes exactly the unchanged records before the first integrity failure.
"""

from __future__ import annotations

import json
import string
from dataclasses import dataclass

import pytest
from hypothesis import event, given, settings
from hypothesis import strategies as st

from haunted_house.core.seance_event import (
    AppEvent,
    AppEventCandidate,
    EventScope,
    EventSource,
    app_event_to_dict,
    canonical_json,
    validate_event,
)
from haunted_house.core.seance_log_parser import (
    ParsedEventLog,
    parse_event_line,
    parse_event_log,
)
from haunted_house.core.seance_persistence import (
    GENESIS_HASH,
    WriterDiagnostic,
    WriterDiagnosticCode,
    build_app_event,
    prepare_candidates,
    serialize_app_event,
)

pytestmark = pytest.mark.core

_IDENT = st.text(alphabet=string.ascii_lowercase + string.digits, min_size=1, max_size=8)
_JSON_LEAF = st.one_of(
    st.none(),
    st.booleans(),
    st.integers(min_value=-(10**9), max_value=10**9),
    # Doubles inside the exact-integer range: beyond it the canonical number
    # text names a different integer than the binary value, so a parsed value
    # is byte-stable but no longer compares equal in Python.
    st.floats(min_value=-1e9, max_value=1e9, allow_nan=False, width=32),
    st.text(max_size=12),
)
_PAYLOAD = st.dictionaries(
    st.text(alphabet=string.ascii_lowercase, min_size=1, max_size=6),
    st.one_of(_JSON_LEAF, st.lists(_JSON_LEAF, max_size=3)),
    max_size=3,
)
_EVENT_TYPES = st.sampled_from(
    (
        "run_started",
        "ghost_progressed",
        "message_recorded",
        "crew_turn_ended",
        "tool_started",
        "tool_finished",
        "approval_requested",
        "source_event_observed",
    )
)
_JUNK_LINES = st.sampled_from(
    (
        b"\n",
        b"not json\n",
        b"{}\n",
        b"[1,2,3]\n",
        b'{"schema_version":1}\n',
        b'{"a":1,"a":2}\n',
        b'{"value":NaN}\n',
        b"\xff\xfe\xfd\n",
        b'"just a string"\n',
    )
)


@dataclass(frozen=True)
class _Log:
    events: tuple[AppEvent, ...]
    lines: tuple[bytes, ...]
    linked: bool


@st.composite
def _logs(draw: st.DrawFn, *, min_size: int = 0) -> _Log:
    count = draw(st.integers(min_value=min_size, max_value=6))
    linked = draw(st.booleans())
    candidates = [
        AppEventCandidate(
            schema_version=1,
            event_type=draw(_EVENT_TYPES),
            scope=EventScope(
                mansion_id="demo-mansion",
                ghost_id=draw(_IDENT),
                session_slot=draw(_IDENT),
                run_id=draw(_IDENT),
                run_sequence=draw(st.integers(min_value=0, max_value=5)),
            ),
            source=EventSource(
                origin=draw(st.sampled_from(("crew", "house"))),
                source_type=draw(_IDENT),
                # The index keeps every Record_ID in one log distinct.
                identity_parts=(f"{index}-{draw(_IDENT)}",),
                revision=draw(st.integers(min_value=0, max_value=3)),
                generation=draw(st.sampled_from(("", "g1"))),
                source_sequence=draw(st.integers(min_value=0, max_value=9)),
            ),
            caused_by=(),
            occurred_at_ms=draw(
                st.one_of(st.none(), st.integers(min_value=0, max_value=10**12))
            ),
            payload=draw(_PAYLOAD),
        )
        for index in range(count)
    ]
    prepared = prepare_candidates(candidates)
    assert prepared.ok

    events: list[AppEvent] = []
    previous = GENESIS_HASH
    for sequence, item in enumerate(prepared.candidates, start=1):
        built = build_app_event(
            item,
            sequence=sequence,
            persisted_at_ms=draw(st.integers(min_value=0, max_value=10**12)),
            prev_hash=previous if linked else None,
        )
        if linked:
            assert built.hash is not None
            previous = built.hash
        events.append(built)
    return _Log(
        events=tuple(events),
        lines=tuple(serialize_app_event(item) for item in events),
        linked=linked,
    )


def _rewrite(line: bytes, **changes: object) -> bytes:
    record = json.loads(line)
    record.update(changes)
    return canonical_json(record) + b"\n"


def _lines_of(diagnostics: tuple[WriterDiagnostic, ...]) -> list[int | None]:
    return [diagnostic.line for diagnostic in diagnostics]


def _assert_safe(result: ParsedEventLog) -> None:
    for diagnostic in result.diagnostics:
        assert isinstance(diagnostic.code, WriterDiagnosticCode)
        assert diagnostic.candidate_index is None
        assert len(diagnostic.safe_detail) <= 64
        assert diagnostic.safe_detail.replace("_", "").isalnum()


# Feature: seance-log-and-ghost-state, Property 10: Canonical serialization and integrity parsing are stable
@settings(max_examples=200, deadline=None)
@given(data=st.data())
def test_canonical_serialization_and_integrity_parsing_are_stable(data) -> None:
    """**Validates: Requirements 7.1–7.6**"""

    log = data.draw(_logs(), label="log")
    raw = b"".join(log.lines)

    # 7.1–7.3: one sorted-key UTF-8 object per line; parse and re-serialize
    # reproduce the events and the exact bytes.
    for item, line in zip(log.events, log.lines, strict=True):
        assert line.endswith(b"\n") and line.count(b"\n") == 1
        decoded = json.loads(line)
        assert list(decoded) == sorted(decoded)
        assert canonical_json(decoded) + b"\n" == line
        assert canonical_json(app_event_to_dict(item)) + b"\n" == line
        parsed_line = parse_event_line(line, 1)
        assert parsed_line == item
        assert serialize_app_event(parsed_line) == line
        assert validate_event(decoded).value == item

    clean = parse_event_log(raw)
    assert clean.events == log.events
    assert clean.diagnostics == ()
    assert clean.integrity_failure_line is None
    assert clean.highest_sequence == len(log.events)
    assert clean.valid_prefix_sequence == len(log.events)
    assert clean.valid_prefix_lines == len(log.lines)
    assert clean.integrity_linked == (log.linked if log.events else None)
    assert b"".join(serialize_app_event(item) for item in clean.events) == raw
    assert parse_event_log(iter(log.lines)) == clean
    # 7.6: the empty log is Sequence zero with no error.
    assert parse_event_log(b"") == ParsedEventLog()

    # 7.4: independently malformed lines are reported at exact lines and
    # every later valid record is still read.
    insertions = data.draw(
        st.lists(
            st.tuples(st.integers(min_value=0, max_value=len(log.lines)), _JUNK_LINES),
            max_size=4,
        ),
        label="junk insertions",
    )
    interleaved: list[bytes] = []
    junk_lines: list[int] = []
    by_position: dict[int, list[bytes]] = {}
    for position, junk in insertions:
        by_position.setdefault(position, []).append(junk)
    for position in range(len(log.lines) + 1):
        for junk in by_position.get(position, []):
            interleaved.append(junk)
            junk_lines.append(len(interleaved))
        if position < len(log.lines):
            interleaved.append(log.lines[position])
    recovered = parse_event_log(b"".join(interleaved))
    event(f"junk lines={len(junk_lines)}")
    assert recovered.events == log.events
    assert _lines_of(recovered.diagnostics) == junk_lines
    assert recovered.integrity_failure_line is None
    assert all(
        diagnostic.code
        in {WriterDiagnosticCode.INVALID_RECORD, WriterDiagnosticCode.UNSUPPORTED_SCHEMA}
        for diagnostic in recovered.diagnostics
    )
    leading = (junk_lines[0] - 1) if junk_lines else len(interleaved)
    assert recovered.valid_prefix_lines == leading
    assert recovered.valid_prefix_sequence == leading
    _assert_safe(recovered)

    # A final fragment without its newline is never authoritative.
    if log.lines:
        cut = data.draw(
            st.integers(min_value=1, max_value=len(log.lines[-1]) - 1), label="cut"
        )
        truncated = parse_event_log(b"".join(log.lines[:-1]) + log.lines[-1][:cut])
        assert truncated.events == log.events[:-1]
        assert _lines_of(truncated.diagnostics) == [len(log.lines)]
        assert truncated.valid_prefix_lines == len(log.lines) - 1


# Feature: seance-log-and-ghost-state, Property 10: Canonical serialization and integrity parsing are stable
@settings(max_examples=200, deadline=None)
@given(data=st.data())
def test_first_integrity_corruption_exposes_exactly_the_unchanged_prefix(data) -> None:
    """**Validates: Requirements 5.8, 7.5**"""

    log = data.draw(_logs(min_size=1), label="log")
    count = len(log.lines)
    index = data.draw(st.integers(min_value=0, max_value=count - 1), label="index")
    kinds = ["duplicate_line", "sequence_ahead", "sequence_behind", "single_hash_field"]
    if index < count - 1:
        kinds.append("delete_line")
    if log.linked:
        kinds.extend(["wrong_hash", "wrong_prev_hash", "payload_tamper", "drop_pair"])
    else:
        kinds.append("add_pair")
    kind = data.draw(st.sampled_from(kinds), label="corruption")
    event(f"corruption={kind}")

    lines = list(log.lines)
    failure_line = index + 1
    prefix = index
    wrong = "h1:" + "f" * 64
    expected_codes: set[WriterDiagnosticCode]

    if kind == "duplicate_line":
        lines.insert(index + 1, lines[index])
        failure_line, prefix = index + 2, index + 1
        expected_codes = {WriterDiagnosticCode.DUPLICATE_SEQUENCE}
    elif kind == "delete_line":
        del lines[index]
        expected_codes = {
            WriterDiagnosticCode.MISSING_SEQUENCE,
        }
    elif kind == "sequence_ahead":
        lines[index] = _rewrite(lines[index], sequence=index + 3)
        expected_codes = {WriterDiagnosticCode.MISSING_SEQUENCE}
    elif kind == "sequence_behind":
        if index == 0:
            # Sequence zero is not a valid record at all: a line diagnostic,
            # then the next record no longer continues from Sequence zero.
            lines[index] = _rewrite(lines[index], sequence=0)
            result = parse_event_log(b"".join(lines))
            assert result.events == ()
            assert result.diagnostics[0].line == 1
            assert result.diagnostics[0].code is WriterDiagnosticCode.INVALID_RECORD
            if count > 1:
                assert result.integrity_failure_line == 2
            _assert_safe(result)
            return
        lines[index] = _rewrite(lines[index], sequence=index)
        expected_codes = {WriterDiagnosticCode.DUPLICATE_SEQUENCE}
    elif kind == "wrong_hash":
        lines[index] = _rewrite(lines[index], hash=wrong)
        expected_codes = {WriterDiagnosticCode.HASH_MISMATCH}
    elif kind == "wrong_prev_hash":
        lines[index] = _rewrite(lines[index], prev_hash=wrong)
        expected_codes = {WriterDiagnosticCode.HASH_LINK_BROKEN}
    elif kind == "payload_tamper":
        lines[index] = _rewrite(lines[index], persisted_at_ms=10**13)
        expected_codes = {WriterDiagnosticCode.HASH_MISMATCH}
    elif kind == "drop_pair":
        record = json.loads(lines[index])
        del record["prev_hash"], record["hash"]
        lines[index] = canonical_json(record) + b"\n"
        if index == 0:
            # The first record selects the mode, so the failure is the next
            # linked record; with no next record the log is simply unlinked.
            result = parse_event_log(b"".join(lines))
            assert result.events == (
                (parse_event_line(lines[0], 1),)
            )
            if count > 1:
                assert result.integrity_failure_line == 2
                assert result.diagnostics[-1].code is (
                    WriterDiagnosticCode.MIXED_INTEGRITY_MODE
                )
            else:
                assert result.diagnostics == ()
            return
        expected_codes = {WriterDiagnosticCode.MIXED_INTEGRITY_MODE}
    elif kind == "add_pair":
        lines[index] = _rewrite(lines[index], prev_hash=GENESIS_HASH, hash=wrong)
        if index == 0:
            expected_codes = {WriterDiagnosticCode.HASH_MISMATCH}
        else:
            expected_codes = {WriterDiagnosticCode.MIXED_INTEGRITY_MODE}
    else:
        assert kind == "single_hash_field"
        # One tamper-evidence field alone is not a valid record; the record
        # is unreadable and its successor exposes the gap.
        record = json.loads(lines[index])
        if log.linked:
            del record["hash"]
        else:
            record["prev_hash"] = GENESIS_HASH
        lines[index] = canonical_json(record) + b"\n"
        result = parse_event_log(b"".join(lines))
        assert result.events == log.events[:index]
        assert result.diagnostics[0].line == index + 1
        assert result.diagnostics[0].code is WriterDiagnosticCode.INVALID_RECORD
        assert result.diagnostics[0].path == "prev_hash/hash"
        if index < count - 1:
            assert result.integrity_failure_line == index + 2
            assert len(result.diagnostics) == 2
        else:
            assert result.integrity_failure_line is None
        _assert_safe(result)
        return

    result = parse_event_log(b"".join(lines))

    assert result.events == log.events[:prefix]
    assert result.highest_sequence == prefix
    assert result.valid_prefix_sequence == prefix
    assert result.valid_prefix_lines == prefix
    assert result.integrity_failure_line == failure_line
    assert _lines_of(result.diagnostics) == [failure_line]
    assert result.diagnostics[0].code in expected_codes
    # The prefix is returned unchanged, byte for byte, and nothing is repaired.
    assert b"".join(serialize_app_event(item) for item in result.events) == b"".join(
        log.lines[:prefix]
    )
    assert parse_event_log(b"".join(lines)) == result
    _assert_safe(result)
