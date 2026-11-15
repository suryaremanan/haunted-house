"""Focused shared-vector examples for Spec 2 selection and ghost reduction.

These are example/parity tests for task 5.1. The numbered permutation and
state-model properties remain owned by tasks 5.2 and 5.3.

Validates: Requirements 5.2, 5.4, 5.9, 5.10, 6.1–6.13, 8.1–8.3.
"""

from __future__ import annotations

import ast
import copy
import inspect
import json
from collections import Counter
from dataclasses import asdict
from pathlib import Path
from typing import Any, cast

import pytest

from haunted_house.core import ghost_state
from haunted_house.core.ghost_state import (
    GhostSnapshot,
    derive_ghost_transitions,
    fold_ghost_events,
    ghost_transition_id,
    reduce_ghost_snapshot,
    select_events,
    semantic_completeness,
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
)

pytestmark = pytest.mark.core

_REPO_ROOT = Path(__file__).resolve().parents[4]
_VECTOR_PATH = _REPO_ROOT / "fixtures" / "seance" / "projection-vectors.json"
_VECTOR = json.loads(_VECTOR_PATH.read_text(encoding="utf-8"))["vectors"][0]


def _candidate(seed: dict[str, Any], caused_by: tuple[str, ...]) -> AppEventCandidate:
    sequence = seed["sequence"]
    return AppEventCandidate(
        schema_version=1,
        event_type=cast(EventType, seed["event_type"]),
        scope=EventScope(
            mansion_id=_VECTOR["mansion_id"],
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


def _materialize() -> tuple[list[AppEvent], dict[str, AppEvent]]:
    seeds = _VECTOR["events"]
    provisional = {seed["name"]: _candidate(seed, ()) for seed in seeds}
    event_ids = {
        name: calculate_event_id(candidate) for name, candidate in provisional.items()
    }

    named: dict[str, AppEvent] = {}
    physical: list[AppEvent] = []
    for seed in seeds:
        references = tuple(
            reference
            if reference.startswith("e1:")
            else event_ids[reference]
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
        named[seed["name"]] = event
        physical.extend([event] * seed.get("repeat", 1))
    return physical, named


def _selected_name_by_event_id(
    selected: tuple[AppEvent, ...], named: dict[str, AppEvent]
) -> dict[str, str]:
    name_by_record_id = {event.record_id: name for name, event in named.items()}
    return {
        event.event_id: name_by_record_id[event.record_id] for event in selected
    }


def test_shared_vector_selects_variants_orders_sequences_and_diagnoses_causality():
    events, named = _materialize()
    before = copy.deepcopy(events)
    expected = _VECTOR["expected"]

    result = select_events(list(reversed(events)))

    assert events == before
    assert len({event.record_id for event in events}) == expected["unique_record_count"]
    assert len(result.events) == expected["selected_event_count"]
    assert list(result.events) == sorted(
        result.events, key=lambda event: (event.sequence, event.event_id)
    )

    selected_records = {event.record_id for event in result.events}
    assert named[expected["revision_winner"]].record_id in selected_records
    assert named["working-progress-old"].record_id not in selected_records
    assert named[expected["completeness_winner"]].record_id in selected_records
    assert named["working-detail-sparse"].record_id not in selected_records

    lex_names = expected["lexicographic_candidates"]
    lex_winner = max((named[name] for name in lex_names), key=lambda event: event.record_id)
    assert lex_winner.record_id in selected_records
    assert semantic_completeness(named[lex_names[0]]) == semantic_completeness(
        named[lex_names[1]]
    )

    counts = Counter(diagnostic.code for diagnostic in result.diagnostics)
    assert counts == expected["diagnostic_counts"]
    assert any(
        diagnostic.kind == "forward"
        and diagnostic.event_id == named["working-start"].event_id
        and diagnostic.related_event_id == named["working-turn"].event_id
        for diagnostic in result.diagnostics
    )
    assert any(
        diagnostic.kind == "missing"
        and diagnostic.event_id == named["working-turn"].event_id
        for diagnostic in result.diagnostics
    )


def test_shared_vector_reduces_all_six_states_with_set_subtraction_and_precedence():
    events, named = _materialize()
    folded = fold_ghost_events(events)
    expected_snapshots = _VECTOR["expected"]["snapshots"]
    actual = {snapshot.ghost_id: snapshot for snapshot in folded.snapshots}

    assert {snapshot.state for snapshot in actual.values()} == {
        "idle",
        "working",
        "waiting",
        "blocked",
        "failed",
        "done",
    }
    for expected in expected_snapshots:
        snapshot = actual[expected["ghost_id"]]
        latest_name = expected["latest_event"]
        assert asdict(snapshot) == {
            "mansion_id": _VECTOR["mansion_id"],
            "ghost_id": expected["ghost_id"],
            "run_id": expected["run_id"],
            "run_sequence": expected["run_sequence"],
            "state": expected["state"],
            "pending_approvals": tuple(expected["pending_approvals"]),
            "open_tools": tuple(expected["open_tools"]),
            "latest_event_id": (
                None if latest_name is None else named[latest_name].event_id
            ),
            "latest_sequence": expected["latest_sequence"],
            "reason": expected["reason"],
        }

    waiting = actual["waiting-ghost"]
    assert waiting.pending_approvals == ("zeta",)
    assert waiting.open_tools == ("tool-a",)
    assert actual["working-ghost"].state == "working"
    assert actual["higher-ghost"].run_sequence == 1
    assert actual["higher-ghost"].latest_sequence == 30

    isolated = reduce_ghost_snapshot(events, "demo-mansion", "waiting-ghost")
    foreign_only = [
        event for event in events if event.scope.ghost_id != "waiting-ghost"
    ]
    assert reduce_ghost_snapshot(
        foreign_only, "demo-mansion", "waiting-ghost"
    ) == GhostSnapshot(
        mansion_id="demo-mansion",
        ghost_id="waiting-ghost",
        run_id=None,
        run_sequence=None,
        state="idle",
        pending_approvals=(),
        open_tools=(),
        latest_event_id=None,
        latest_sequence=0,
        reason=None,
    )
    assert isolated == actual["waiting-ghost"]


def test_shared_vector_derives_stable_nonpersisted_transition_identities():
    events, named = _materialize()
    transitions = derive_ghost_transitions(events)
    selection = select_events(events)
    selected_names = _selected_name_by_event_id(selection.events, named)

    for transition in transitions:
        assert transition.transition_id == ghost_transition_id(
            transition.causing_event_id,
            transition.mansion_id,
            transition.ghost_id,
            transition.to_state,
        )
        assert transition.transition_id.startswith("t1:")
        assert len(transition.transition_id) == 67

    state_changes = [
        [
            selected_names[transition.causing_event_id],
            transition.from_state,
            transition.to_state,
        ]
        for transition in transitions
        if transition.from_state != transition.to_state
    ]
    assert state_changes == _VECTOR["expected"]["state_changes"]


def test_ghost_state_core_imports_no_io_network_or_clock_modules():
    tree = ast.parse(inspect.getsource(ghost_state))
    imported_roots: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported_roots.update(alias.name.partition(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported_roots.add(node.module.partition(".")[0])

    assert imported_roots.isdisjoint(
        {"aiohttp", "asyncio", "os", "pathlib", "socket", "subprocess", "time"}
    )
