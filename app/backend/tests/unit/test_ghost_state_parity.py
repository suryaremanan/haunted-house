"""Cross-language fold parity and state examples for task 5.4 (Python side).

Python and TypeScript materialize the shared projection vector identically
(house origin, ``source_type`` equal to the event type, generation ``g1``,
slot ``<ghost_id>-slot``, ``occurred_at_ms`` equal to the seed sequence, and
``persisted_at_ms`` equal to ``1000 + sequence``).  Each language then folds
the events and builds this language-neutral projection document::

    {
      "selected":    [[event_id, record_id, sequence], ...]   canonical order
      "snapshots":   [GhostSnapshot as an object, ...]        sorted by
                                                               (mansion_id, ghost_id)
      "transitions": [GhostTransition as an object, ...]      derived order
      "diagnostics": [[code, kind, event_id, related_event_id | null,
                       [record_id, ...]], ...]                sorted by the
                                                               canonical JSON
                                                               of each entry
    }

The parity digest is the lowercase SHA-256 of the document's canonical JSON
(recursively sorted keys, no insignificant whitespace, UTF-8).  The expected
digest lives in ``fixtures/seance/projection-vectors.json`` under
``vectors[0].expected.parity`` so both languages assert one value.

Validates: Requirements 6.1–6.13, 8.1–8.3.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any, cast

import pytest

from haunted_house.core.ghost_state import (
    GhostSnapshot,
    ProjectionResult,
    fold_ghost_events,
    reduce_ghost_snapshot,
)
from haunted_house.core.seance_event import (
    AppEvent,
    AppEventCandidate,
    EventScope,
    EventSource,
    EventType,
    JSONValue,
    calculate_event_id,
    calculate_record_id,
    canonical_json,
)

pytestmark = pytest.mark.core

_REPO_ROOT = Path(__file__).resolve().parents[4]
_VECTOR_PATH = _REPO_ROOT / "fixtures" / "seance" / "projection-vectors.json"
_VECTOR = json.loads(_VECTOR_PATH.read_text(encoding="utf-8"))["vectors"][0]
_DOCUMENT_KEYS = ["diagnostics", "selected", "snapshots", "transitions"]


def _candidate(seed: dict[str, Any], caused_by: tuple[str, ...]) -> AppEventCandidate:
    sequence = seed["sequence"]
    return AppEventCandidate(
        schema_version=1,
        event_type=cast(EventType, seed["event_type"]),
        scope=EventScope(
            mansion_id=seed.get("mansion_id", _VECTOR["mansion_id"]),
            ghost_id=seed["ghost_id"],
            session_slot=f"{seed['ghost_id']}-slot",
            run_id=seed["run_id"],
            run_sequence=seed["run_sequence"],
        ),
        source=EventSource(
            origin="house",
            source_type=seed["event_type"],
            identity_parts=(seed["identity"],),
            revision=seed.get("revision", 0),
            generation="g1",
            source_sequence=seed.get("source_sequence", sequence),
        ),
        caused_by=caused_by,
        occurred_at_ms=sequence,
        payload=cast(JSONValue, seed["payload"]),
    )


def _materialize(seeds: list[dict[str, Any]]) -> list[AppEvent]:
    provisional = {seed["name"]: _candidate(seed, ()) for seed in seeds}
    event_ids = {
        name: calculate_event_id(candidate) for name, candidate in provisional.items()
    }
    physical: list[AppEvent] = []
    for seed in seeds:
        references = tuple(
            reference if reference.startswith("e1:") else event_ids[reference]
            for reference in seed.get("caused_by", [])
        )
        candidate = _candidate(seed, references)
        event = AppEvent(
            schema_version=1,
            event_id=calculate_event_id(candidate),
            record_id=calculate_record_id(candidate),
            sequence=seed["sequence"],
            event_type=candidate.event_type,
            scope=candidate.scope,
            source=candidate.source,
            caused_by=candidate.caused_by,
            occurred_at_ms=candidate.occurred_at_ms,
            persisted_at_ms=1_000 + seed["sequence"],
            payload=candidate.payload,
        )
        physical.extend([event] * seed.get("repeat", 1))
    return physical


def _projection_document(folded: ProjectionResult) -> dict[str, JSONValue]:
    diagnostics: list[JSONValue] = [
        [
            diagnostic.code,
            diagnostic.kind,
            diagnostic.event_id,
            diagnostic.related_event_id,
            list(diagnostic.record_ids),
        ]
        for diagnostic in folded.selection.diagnostics
    ]
    diagnostics.sort(key=canonical_json)
    snapshots = sorted(
        folded.snapshots, key=lambda snapshot: (snapshot.mansion_id, snapshot.ghost_id)
    )
    return {
        "selected": [
            [event.event_id, event.record_id, event.sequence]
            for event in folded.selection.events
        ],
        "snapshots": [
            {
                **asdict(snapshot),
                "pending_approvals": list(snapshot.pending_approvals),
                "open_tools": list(snapshot.open_tools),
            }
            for snapshot in snapshots
        ],
        "transitions": [asdict(transition) for transition in folded.transitions],
        "diagnostics": diagnostics,
    }


def _digest(document: dict[str, JSONValue]) -> str:
    return hashlib.sha256(canonical_json(document)).hexdigest()


def _seed(
    name: str,
    event_type: str,
    sequence: int,
    *,
    ghost_id: str = "ghost",
    run_id: str = "run-1",
    run_sequence: int = 1,
    payload: Any = None,
    mansion_id: str | None = None,
) -> dict[str, Any]:
    seed: dict[str, Any] = {
        "name": name,
        "ghost_id": ghost_id,
        "run_id": run_id,
        "run_sequence": run_sequence,
        "event_type": event_type,
        "sequence": sequence,
        "identity": name,
        "payload": {} if payload is None else payload,
    }
    if mansion_id is not None:
        seed["mansion_id"] = mansion_id
    return seed


def _snapshot(seeds: list[dict[str, Any]], ghost_id: str = "ghost") -> GhostSnapshot:
    return reduce_ghost_snapshot(
        _materialize(seeds), _VECTOR["mansion_id"], ghost_id
    )


# --- shared-vector parity ----------------------------------------------------


def test_shared_vector_projection_digest_matches_the_cross_language_fixture():
    parity = _VECTOR["expected"]["parity"]
    document = _projection_document(fold_ghost_events(_materialize(_VECTOR["events"])))

    assert sorted(document) == parity["document_keys"] == _DOCUMENT_KEYS
    assert len(cast(list, document["selected"])) == parity["selected_count"]
    assert parity["selected_count"] == _VECTOR["expected"]["selected_event_count"]
    assert len(cast(list, document["transitions"])) == parity["transition_count"]
    assert _digest(document) == parity["projection_sha256"]


def test_shared_vector_projection_document_agrees_with_named_expectations():
    events = _materialize(_VECTOR["events"])
    document = _projection_document(fold_ghost_events(events))
    expected = _VECTOR["expected"]

    snapshots = cast(list[dict[str, Any]], document["snapshots"])
    assert [snapshot["ghost_id"] for snapshot in snapshots] == sorted(
        item["ghost_id"] for item in expected["snapshots"]
    )
    by_ghost = {snapshot["ghost_id"]: snapshot for snapshot in snapshots}
    for item in expected["snapshots"]:
        actual = by_ghost[item["ghost_id"]]
        for field in (
            "run_id",
            "run_sequence",
            "state",
            "pending_approvals",
            "open_tools",
            "latest_sequence",
            "reason",
        ):
            assert actual[field] == item[field]

    transitions = cast(list[dict[str, Any]], document["transitions"])
    assert [
        transition["causing_sequence"] for transition in transitions
    ] == sorted(transition["causing_sequence"] for transition in transitions)
    assert (
        sum(1 for t in transitions if t["from_state"] != t["to_state"])
        == len(expected["state_changes"])
    )
    diagnostics = cast(list[list[Any]], document["diagnostics"])
    counts: dict[str, int] = {}
    for entry in diagnostics:
        counts[entry[0]] = counts.get(entry[0], 0) + 1
    assert counts == expected["diagnostic_counts"]


def test_projection_digest_is_invariant_under_reversal_and_duplication():
    events = _materialize(_VECTOR["events"])
    expected = _VECTOR["expected"]["parity"]["projection_sha256"]

    reordered = list(reversed(events))
    duplicated = events + reordered + events[::3]

    assert _digest(_projection_document(fold_ghost_events(reordered))) == expected
    assert _digest(_projection_document(fold_ghost_events(duplicated))) == expected


def test_projection_digest_changes_when_a_state_fact_changes():
    seeds = [dict(seed) for seed in _VECTOR["events"]]
    seeds.append(
        _seed(
            "extra-failure",
            "run_failed",
            max(seed["sequence"] for seed in seeds) + 1,
            ghost_id="working-ghost",
            run_id="working-run",
            payload={"reason": "validation_failed"},
        )
    )

    changed = _digest(_projection_document(fold_ghost_events(_materialize(seeds))))

    assert changed != _VECTOR["expected"]["parity"]["projection_sha256"]


# --- state examples ----------------------------------------------------------


def test_examples_cover_all_six_states():
    start = _seed("start", "run_started", 1, payload={"reason": "assigned"})

    idle = _snapshot([_seed("note", "message_recorded", 1, payload={"text": "hi"})])
    working = _snapshot([start])
    waiting = _snapshot(
        [start, _seed("ask", "approval_requested", 2, payload={"mid": "m-1"})]
    )
    blocked = _snapshot(
        [start, _seed("block", "run_blocked", 2, payload={"reason": "locked_door"})]
    )
    failed = _snapshot(
        [start, _seed("fail", "run_failed", 2, payload={"reason": "validation_failed"})]
    )
    done = _snapshot(
        [start, _seed("complete", "run_completed", 2, payload={"reason": "ready"})]
    )

    assert [s.state for s in (idle, working, waiting, blocked, failed, done)] == [
        "idle",
        "working",
        "waiting",
        "blocked",
        "failed",
        "done",
    ]
    assert (idle.run_id, idle.run_sequence, idle.latest_event_id) == (None, None, None)
    assert idle.latest_sequence == 0
    assert working.reason == "assigned"
    assert waiting.pending_approvals == ("m-1",)
    assert blocked.reason == "locked_door"
    assert failed.reason == "validation_failed"
    assert done.reason == "ready"


def test_terminal_precedence_is_failed_then_blocked_then_done_in_any_order():
    start = _seed("start", "run_started", 1)
    completed = ("complete", "run_completed", {"reason": "ready"})
    blocked = ("block", "run_blocked", {"reason": "stalled"})
    failed = ("fail", "run_failed", {"reason": "validation_failed"})

    def state(*facts: tuple[str, str, dict[str, str]]) -> str:
        seeds = [start] + [
            _seed(name, event_type, index + 2, payload=payload)
            for index, (name, event_type, payload) in enumerate(facts)
        ]
        # A pending approval never outranks a terminal fact.
        seeds.append(
            _seed("ask", "approval_requested", len(seeds) + 1, payload={"mid": "m-1"})
        )
        return _snapshot(seeds).state

    assert state(completed) == "done"
    assert state(completed, blocked) == state(blocked, completed) == "blocked"
    assert state(blocked, failed) == state(failed, blocked) == "failed"
    assert state(completed, failed) == state(failed, completed) == "failed"
    assert (
        state(completed, blocked, failed)
        == state(failed, blocked, completed)
        == "failed"
    )


def test_higher_run_is_selected_independently_of_lower_run_terminal_state():
    seeds = [
        _seed("old-start", "run_started", 1, run_id="run-0", run_sequence=0),
        _seed(
            "old-fail",
            "run_failed",
            2,
            run_id="run-0",
            run_sequence=0,
            payload={"reason": "validation_failed"},
        ),
        _seed("new-start", "run_started", 3, payload={"reason": "retry"}),
    ]
    assert _snapshot(seeds[:2]).state == "failed"

    selected = _snapshot(seeds)
    assert (selected.run_id, selected.run_sequence) == ("run-1", 1)
    assert selected.state == "working"
    assert selected.reason == "retry"

    # A delayed lower-run fact cannot disturb the selected run.
    delayed = seeds + [
        _seed(
            "old-ask",
            "approval_requested",
            4,
            run_id="run-0",
            run_sequence=0,
            payload={"mid": "m-old"},
        ),
        _seed(
            "old-block",
            "run_blocked",
            5,
            run_id="run-0",
            run_sequence=0,
            payload={"reason": "stalled"},
        ),
    ]
    after = _snapshot(delayed)
    assert after == selected


def test_pending_and_resolved_approvals_use_set_subtraction():
    start = _seed("start", "run_started", 1)
    ask_a = _seed("ask-a", "approval_requested", 2, payload={"mid": "m-a"})
    ask_b = _seed("ask-b", "approval_requested", 3, payload={"mid": "m-b"})
    decide_a = _seed(
        "decide-a", "approval_decided", 4, payload={"mid": "m-a", "outcome": "approved"}
    )
    decide_b = _seed(
        "decide-b", "approval_decided", 5, payload={"mid": "m-b", "outcome": "rejected"}
    )

    both = _snapshot([start, ask_b, ask_a])
    assert both.state == "waiting"
    assert both.pending_approvals == ("m-a", "m-b")

    one = _snapshot([start, ask_a, ask_b, decide_a])
    assert one.state == "waiting"
    assert one.pending_approvals == ("m-b",)

    resolved = _snapshot([start, ask_a, ask_b, decide_a, decide_b])
    assert resolved.state == "working"
    assert resolved.pending_approvals == ()

    # A decision without a request and a decision recorded before its request
    # both leave nothing pending.
    early = _snapshot(
        [
            start,
            _seed("decide-c", "approval_decided", 2, payload={"mid": "m-c"}),
            _seed("ask-c", "approval_requested", 3, payload={"mid": "m-c"}),
        ]
    )
    assert early.state == "working"
    assert early.pending_approvals == ()


def test_only_final_tool_results_close_open_tools():
    start = _seed("start", "run_started", 1)
    tool_a = _seed("tool-a", "tool_started", 2, payload={"tool_call_id": "tool-a"})
    tool_b = _seed("tool-b", "tool_started", 3, payload={"tool_call_id": "tool-b"})
    partial_a = _seed(
        "partial-a",
        "tool_finished",
        4,
        payload={"tool_call_id": "tool-a", "final": False},
    )
    update_b = _seed(
        "update-b", "tool_updated", 5, payload={"tool_call_id": "tool-b"}
    )
    final_a = _seed(
        "final-a",
        "tool_finished",
        6,
        payload={"tool_call_id": "tool-a", "final": True},
    )

    open_both = _snapshot([start, tool_b, tool_a, partial_a, update_b])
    assert open_both.open_tools == ("tool-a", "tool-b")
    assert open_both.state == "working"

    closed_one = _snapshot([start, tool_a, tool_b, partial_a, update_b, final_a])
    assert closed_one.open_tools == ("tool-b",)
    assert closed_one.state == "working"


def test_foreign_ghost_and_mansion_events_preserve_the_target_snapshot():
    own = [
        _seed("start", "run_started", 1, payload={"reason": "assigned"}),
        _seed("ask", "approval_requested", 2, payload={"mid": "m-1"}),
    ]
    foreign = [
        _seed("other-start", "run_started", 3, ghost_id="other", run_sequence=9),
        _seed(
            "other-fail",
            "run_failed",
            4,
            ghost_id="other",
            run_sequence=9,
            payload={"reason": "validation_failed"},
        ),
        _seed(
            "other-decide",
            "approval_decided",
            5,
            ghost_id="other",
            run_sequence=9,
            payload={"mid": "m-1"},
        ),
        _seed(
            "elsewhere-start",
            "run_started",
            6,
            run_sequence=9,
            mansion_id="other-mansion",
        ),
        _seed(
            "elsewhere-complete",
            "run_completed",
            7,
            run_sequence=9,
            mansion_id="other-mansion",
            payload={"reason": "ready"},
        ),
    ]

    alone = _snapshot(own)
    together = _snapshot(own + foreign)

    assert together == alone
    assert together.state == "waiting"
    assert together.pending_approvals == ("m-1",)

    folded = fold_ghost_events(_materialize(own + foreign))
    states = {
        (snapshot.mansion_id, snapshot.ghost_id): snapshot.state
        for snapshot in folded.snapshots
    }
    assert states == {
        (_VECTOR["mansion_id"], "ghost"): "waiting",
        (_VECTOR["mansion_id"], "other"): "failed",
        ("other-mansion", "ghost"): "done",
    }


def test_crew_turn_end_and_error_observations_are_nonterminal():
    start = _seed("start", "run_started", 1, payload={"reason": "assigned"})
    turn = _seed(
        "turn",
        "crew_turn_ended",
        2,
        payload={
            "generation": "g1",
            "turn": 1,
            "continuing": False,
            "needs_input": True,
        },
    )
    error = _seed(
        "error", "crew_error_observed", 3, payload={"category": "provider_error"}
    )
    domain = _seed(
        "domain",
        "domain_event_recorded",
        4,
        payload={
            "domain": "doors",
            "kind": "door_opened",
            "entity_id": "door-1",
            "data": {"reason": "approved"},
        },
    )

    before = _snapshot([start])
    after = _snapshot([start, turn, error, domain])

    assert before.state == after.state == "working"
    assert after.reason == "assigned"
    assert after.pending_approvals == ()
    assert after.latest_sequence == 4

    transitions = fold_ghost_events(_materialize([start, turn, error, domain])).transitions
    assert [(t.from_state, t.to_state) for t in transitions][0] == ("idle", "working")
    assert all(t.to_state == "working" for t in transitions)

    # Without run_started the same transport facts leave the ghost idle.
    assert _snapshot([turn, error]).state == "idle"

    completed = _seed("complete", "run_completed", 5, payload={"reason": "ready"})
    assert _snapshot([start, turn, error, domain, completed]).state == "done"
