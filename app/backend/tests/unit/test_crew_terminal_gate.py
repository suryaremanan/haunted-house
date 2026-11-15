"""Verified-frame and terminal-gate examples for task 3.5.

The scrubbed S6 observation is replayed through the Python normalizer only.
``chat_done`` and ``chat_error`` are transport evidence: they never produce a
domain terminal event and never move a ghost out of ``working``.  The
structural checks keep the Crew mapping table in one Python module and out of
TypeScript.

Validates: Requirements 2.1–2.16, 6.8, 12.6, 12.7.
"""

from __future__ import annotations

import ast
import itertools
import json
import re
from pathlib import Path
from typing import Any

import pytest

from haunted_house.core.crew_event_normalizer import (
    CrewEnvelope,
    NormalizationContext,
    NormalizationDiagnosticCode,
    NormalizationDiagnosticReason,
    NormalizeResult,
    normalize_crew_envelope,
)
from haunted_house.core.ghost_state import fold_ghost_events
from haunted_house.core.seance_event import (
    AppEvent,
    AppEventCandidate,
    EventScope,
    EventSource,
    calculate_event_id,
)
from haunted_house.core.seance_persistence import build_app_event, prepare_candidates

pytestmark = pytest.mark.core

_REPO_ROOT = Path(__file__).resolve().parents[4]
_S6_PATH = _REPO_ROOT / "spikes" / "fixtures" / "s6-app-session-approval.jsonl"
_BACKEND_PACKAGE = _REPO_ROOT / "app" / "backend" / "haunted_house"
_UI_SOURCE = _REPO_ROOT / "app" / "ui" / "src"

_SLOT = "hh-s6"
_PERMISSION_MID = "m-9ec9535fa5c3459a"
_DECISION_ID = "approval:5:hh-s6:2"
_TOOL_CALL_ID = "toolu_bdrk_0137GNVc4EmAJrrTbffDRJ9y"
_SCOPE = EventScope(
    mansion_id="spike-a",
    ghost_id="scribe",
    session_slot=_SLOT,
    run_id="spec-x-1",
    run_sequence=1,
)
_CONTEXT = NormalizationContext(
    scope_by_slot={_SLOT: _SCOPE},
    approval_mid_by_decision={_DECISION_ID: _PERMISSION_MID},
)
_EXACT_SUPPORTED = {
    "tool_call",
    "tool_result",
    "shared_crew.decision",
    "approval_resolved",
}
_DOMAIN_TERMINALS = {"run_completed", "run_blocked", "run_failed"}
_TERMINAL_STATES = {"done", "blocked", "failed"}


def _s6_frames() -> list[dict[str, Any]]:
    return [
        json.loads(line)["frame"]
        for line in _S6_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def _is_subscribed(frame_type: str) -> bool:
    return frame_type.startswith("chat_") or frame_type in _EXACT_SUPPORTED


def _normalize(frame: dict[str, Any]) -> NormalizeResult:
    return normalize_crew_envelope(
        CrewEnvelope(type=frame["type"], data=frame["data"]), _CONTEXT
    )


def _s6_candidates() -> list[AppEventCandidate]:
    return [
        candidate
        for frame in _s6_frames()
        if _is_subscribed(frame["type"])
        for candidate in _normalize(frame).candidates
    ]


def _house_candidate(event_type: str, identity: str, payload: Any) -> AppEventCandidate:
    return AppEventCandidate(
        schema_version=1,
        event_type=event_type,  # type: ignore[arg-type]
        scope=_SCOPE,
        source=EventSource(
            origin="house",
            source_type=event_type,
            identity_parts=(identity,),
            revision=0,
            generation="",
            source_sequence=0,
        ),
        caused_by=(),
        occurred_at_ms=None,
        payload=payload,
    )


def _persist(candidates: list[AppEventCandidate]) -> list[AppEvent]:
    """Assign contiguous sequences the way the writer would, without I/O."""

    prepared = prepare_candidates(candidates)
    assert prepared.ok, prepared.diagnostics
    events: list[AppEvent] = []
    seen: set[str] = set()
    for item in prepared.candidates:
        if item.record_id in seen:
            continue
        seen.add(item.record_id)
        events.append(
            build_app_event(
                item,
                sequence=len(events) + 1,
                persisted_at_ms=1_000 + len(events),
                prev_hash=None,
            )
        )
    return events


def _state(events: list[AppEvent]) -> str:
    snapshots = fold_ghost_events(events).snapshots
    assert len(snapshots) == 1
    return snapshots[0].state


# --- (a) verified S6 frames through the Python normalizer only -------------


def test_s6_unsubscribed_dashboard_noise_is_refused_without_candidates() -> None:
    noise = [frame for frame in _s6_frames() if not _is_subscribed(frame["type"])]

    assert {frame["type"] for frame in noise} == {
        "activity_event",
        "context_usage",
        "session_projection",
        "shared_crew.presence",
        "shared_crew.send_state",
        "slot_projection",
        "slot_read",
    }
    for frame in noise:
        result = _normalize(frame)
        assert result.candidates == ()
        assert result.reconcile_slots == ()
        assert result.diagnostic is not None
        assert result.diagnostic.code is NormalizationDiagnosticCode.INVALID_ENVELOPE
        assert result.diagnostic.field == "type"
        assert (
            result.diagnostic.reason
            is NormalizationDiagnosticReason.UNSUPPORTED_TYPE
        )


def test_s6_subscribed_frames_map_to_the_expected_candidate_sequence() -> None:
    observed: list[tuple[str, str, tuple[str, ...], int]] = []
    for frame in _s6_frames():
        if not _is_subscribed(frame["type"]):
            continue
        result = _normalize(frame)
        assert result.diagnostic is None
        assert result.reconcile_slots == ()
        for candidate in result.candidates:
            assert candidate.scope == _SCOPE
            assert candidate.source.origin == "crew"
            observed.append(
                (
                    frame["type"],
                    candidate.event_type,
                    candidate.source.identity_parts,
                    candidate.source.revision,
                )
            )

    assert observed == [
        ("chat_message", "message_recorded", ("m-4579857bca2248df", "user"), 0),
        ("chat_status", "ghost_progressed", ("Thinking…",), 0),
        ("tool_call", "tool_started", (_TOOL_CALL_ID,), 0),
        ("tool_call", "tool_updated", (_TOOL_CALL_ID,), 1),
        ("chat_message_update", "message_updated", (_TOOL_CALL_ID,), 0),
        ("shared_crew.decision", "decision_recorded", (_DECISION_ID,), 1),
        ("shared_crew.decision", "approval_requested", (_PERMISSION_MID,), 1),
        ("approval_resolved", "approval_decided", (_PERMISSION_MID,), 0),
        ("shared_crew.decision", "decision_recorded", (_DECISION_ID,), 2),
        ("shared_crew.decision", "approval_decided", (_PERMISSION_MID,), 2),
        ("tool_result", "tool_finished", (_TOOL_CALL_ID,), 1),
        ("tool_call", "tool_updated", (_TOOL_CALL_ID,), 1),
        ("chat_message_update", "message_updated", (_TOOL_CALL_ID,), 0),
        ("chat_segment", "response_segment_started", ("segment",), 0),
        ("chat_chunk", "response_chunk_recorded", ("0c698996", "9"), 0),
        ("chat_chunk", "response_chunk_recorded", ("0c698996", "10"), 0),
        ("chat_done", "crew_turn_ended", ("0c698996", "3"), 0),
    ]


def test_s6_message_chunk_tool_decision_and_approval_payloads_are_bounded() -> None:
    by_type: dict[str, list[AppEventCandidate]] = {}
    for candidate in _s6_candidates():
        by_type.setdefault(candidate.event_type, []).append(candidate)

    assert by_type["message_recorded"][0].payload == {
        "mid": "m-4579857bca2248df",
        "role": "user",
        "content": (
            "Append nothing; instead create spec-x/notes.md containing hi. "
            "Reply DONE."
        ),
    }
    assert [chunk.payload for chunk in by_type["response_chunk_recorded"]] == [
        {"generation": "0c698996", "source_sequence": 9, "content": "DONE "},
        {
            "generation": "0c698996",
            "source_sequence": 10,
            "content": "spec-x/notes.md",
        },
    ]
    assert by_type["tool_started"][0].payload == {
        "tool_call_id": _TOOL_CALL_ID,
        "is_update": False,
        "tool": "Write File",
        "kind": "edit",
        "is_shell": False,
    }
    assert by_type["tool_finished"][0].payload == {
        "tool_call_id": _TOOL_CALL_ID,
        "final": True,
    }
    assert [decision.payload for decision in by_type["decision_recorded"]] == [
        {
            "decision_id": _DECISION_ID,
            "kind": "approval",
            "revision": 1,
            "state": "pending",
        },
        {
            "decision_id": _DECISION_ID,
            "kind": "approval",
            "revision": 2,
            "state": "resolved",
            "outcome": "approved",
        },
    ]
    assert by_type["approval_requested"][0].payload == {"mid": _PERMISSION_MID}
    assert [decided.payload for decided in by_type["approval_decided"]] == [
        {"mid": _PERMISSION_MID, "outcome": "approved"},
        {"mid": _PERMISSION_MID, "outcome": "approved"},
    ]
    assert by_type["crew_turn_ended"][0].payload == {
        "generation": "0c698996",
        "turn": 3,
        "continuing": False,
        "needs_input": False,
    }


def test_s6_tool_arguments_results_and_principals_never_reach_a_payload() -> None:
    allowed_keys = {
        "tool_started": {"tool_call_id", "is_update", "tool", "kind", "is_shell"},
        "tool_updated": {"tool_call_id", "is_update", "tool", "kind", "is_shell"},
        "tool_finished": {"tool_call_id", "final"},
        "message_updated": {"tool_call_id", "content"},
        "decision_recorded": {"decision_id", "kind", "revision", "state", "outcome"},
        "approval_requested": {"mid"},
        "approval_decided": {"mid", "outcome"},
    }
    for candidate in _s6_candidates():
        if candidate.event_type not in allowed_keys:
            continue
        assert isinstance(candidate.payload, dict)
        assert set(candidate.payload) <= allowed_keys[candidate.event_type]
        serialized = json.dumps(candidate.payload, sort_keys=True)
        # Tool input, tool output, diff previews, and principal identities.
        for forbidden in (
            "spec-x/notes.md",
            "Created the",
            "input_preview",
            "file://",
            "p_e2ffd1421d02bbeccc5cf36e1fe19b03",
            "p_dda497926a972e1df0f48319a2c305a8",
            "Local user",
        ):
            assert forbidden not in serialized


def test_s6_both_approval_decided_sources_share_one_event_id() -> None:
    decided = [
        candidate
        for candidate in _s6_candidates()
        if candidate.event_type == "approval_decided"
    ]

    assert len(decided) == 2
    assert {candidate.source.source_type for candidate in decided} == {
        "crew_approval"
    }
    assert calculate_event_id(decided[0]) == calculate_event_id(decided[1])
    prepared = prepare_candidates(decided)
    assert prepared.ok
    assert len({item.event_id for item in prepared.candidates}) == 1
    # Different revisions stay distinct physical variants of one logical fact.
    assert len({item.record_id for item in prepared.candidates}) == 2


# --- (b) terminal gate ------------------------------------------------------


@pytest.mark.parametrize(
    ("continuing", "needs_input"),
    list(itertools.product((None, False, True), repeat=2)),
)
def test_every_chat_done_form_is_only_crew_turn_ended(
    continuing: bool | None, needs_input: bool | None
) -> None:
    data: dict[str, Any] = {"slot": _SLOT, "turn": 3, "turn_gen": "0c698996"}
    if continuing is not None:
        data["continuing"] = continuing
    if needs_input is not None:
        data["needs_input"] = needs_input
    # Fields a browser or Crew could add must not become a claimed outcome.
    data["outcome"] = "success"
    data["result"] = "DONE"

    result = normalize_crew_envelope(CrewEnvelope(type="chat_done", data=data), _CONTEXT)

    assert result.diagnostic is None
    assert [candidate.event_type for candidate in result.candidates] == [
        "crew_turn_ended"
    ]
    candidate = result.candidates[0]
    assert candidate.event_type not in _DOMAIN_TERMINALS
    assert isinstance(candidate.payload, dict)
    assert set(candidate.payload) <= {
        "generation",
        "turn",
        "continuing",
        "needs_input",
    }

    events = _persist(
        [_house_candidate("run_started", "spec-x-1", {"reason": "assigned"}), candidate]
    )
    assert _state(events) == "working"


def test_s6_turn_end_and_crew_error_keep_the_ghost_working_until_house_terminal() -> None:
    started = _house_candidate("run_started", "spec-x-1", {"reason": "assigned"})
    crew = _s6_candidates()
    assert crew[-1].event_type == "crew_turn_ended"
    assert _DOMAIN_TERMINALS.isdisjoint(candidate.event_type for candidate in crew)

    # Every prefix of the verified session stays nonterminal.
    for length in range(len(crew) + 1):
        events = _persist([started, *crew[:length]])
        assert _state(events) not in _TERMINAL_STATES

    after_turn = _persist([started, *crew])
    assert _state(after_turn) == "working"
    snapshot = fold_ghost_events(after_turn).snapshots[0]
    assert snapshot.pending_approvals == ()
    assert snapshot.open_tools == ()

    error = normalize_crew_envelope(
        CrewEnvelope(
            type="chat_error",
            data={"slot": _SLOT, "code": "provider_error", "message": "private"},
        ),
        _CONTEXT,
    )
    assert [candidate.event_type for candidate in error.candidates] == [
        "crew_error_observed"
    ]
    assert error.candidates[0].payload == {"category": "provider_error"}
    after_error = _persist([started, *crew, *error.candidates])
    assert _state(after_error) == "working"

    completed = _house_candidate("run_completed", "spec-x-1", {"reason": "ready"})
    assert _state(_persist([started, *crew, *error.candidates, completed])) == "done"


def test_s6_pending_approval_waits_only_between_request_and_decision() -> None:
    started = _house_candidate("run_started", "spec-x-1", {"reason": "assigned"})
    crew = _s6_candidates()
    requested_at = next(
        index
        for index, candidate in enumerate(crew)
        if candidate.event_type == "approval_requested"
    )
    decided_at = next(
        index
        for index, candidate in enumerate(crew)
        if candidate.event_type == "approval_decided"
    )

    waiting = fold_ghost_events(_persist([started, *crew[: requested_at + 1]]))
    assert waiting.snapshots[0].state == "waiting"
    assert waiting.snapshots[0].pending_approvals == (_PERMISSION_MID,)
    assert waiting.snapshots[0].open_tools == (_TOOL_CALL_ID,)
    assert _state(_persist([started, *crew[: decided_at + 1]])) == "working"


# --- (c) structure: one mapping table, in Python ---------------------------

_CREW_WIRE_LITERAL = re.compile(
    r"""(['"`])(chat_[a-z_]+|tool_call|tool_result|shared_crew\.decision|approval_resolved)\1"""
)
_NORMALIZER_ONLY_LITERAL = re.compile(
    r"""(['"`])(message_recorded|message_updated|ghost_progressed"""
    r"""|response_segment_started|response_chunk_recorded|crew_turn_ended"""
    r"""|crew_error_observed|tool_started|tool_updated|tool_finished"""
    r"""|decision_recorded|source_event_observed)\1"""
)
_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)
_LINE_COMMENT = re.compile(r"(?m)^\s*//.*$")
# The only TypeScript files that may name Crew wire types: the static
# subscription list of the raw bridge and the SDK seam it subscribes through.
_RAW_BRIDGE_FILES = frozenset(
    {
        "adapters/seance-live.ts",
        "adapters/sdk.ts",
        "adapters/app-sdk.d.ts",
    }
)
_RAW_BRIDGE_DIRECTORIES = ("adapters/sdk-shim/",)


def _typescript_sources(root: Path) -> list[Path]:
    sources: list[Path] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix not in {".ts", ".tsx"}:
            continue
        relative = path.relative_to(root)
        if {"node_modules", "dist", "test"} & set(relative.parts):
            continue
        if ".test." in path.name:
            continue
        sources.append(path)
    return sources


def _is_raw_bridge(relative: str) -> bool:
    return relative in _RAW_BRIDGE_FILES or relative.startswith(
        _RAW_BRIDGE_DIRECTORIES
    )


def _crew_mapping_violations(root: Path) -> list[str]:
    """Return ``<file>: <rule>`` for every TypeScript Crew-mapping violation."""

    violations: list[str] = []
    for path in _typescript_sources(root):
        relative = path.relative_to(root).as_posix()
        text = _LINE_COMMENT.sub("", _BLOCK_COMMENT.sub("", path.read_text("utf-8")))
        has_wire = _CREW_WIRE_LITERAL.search(text) is not None
        has_canonical = _NORMALIZER_ONLY_LITERAL.search(text) is not None
        if has_wire and has_canonical:
            violations.append(f"{relative}: crew_mapping_table")
        if has_wire and not _is_raw_bridge(relative):
            violations.append(f"{relative}: crew_type_outside_raw_bridge")
    return violations


def test_typescript_has_no_crew_mapping_table_outside_the_raw_bridge() -> None:
    assert _UI_SOURCE.is_dir()
    assert _typescript_sources(_UI_SOURCE)
    assert _crew_mapping_violations(_UI_SOURCE) == []


def test_the_typescript_mapping_checker_flags_offending_files(tmp_path: Path) -> None:
    root = tmp_path / "src"
    (root / "core").mkdir(parents=True)
    (root / "adapters" / "sdk-shim").mkdir(parents=True)
    (root / "adapters" / "seance-live.ts").write_text(
        "// forwards raw envelopes only\n"
        "export const SUBSCRIBED = ['chat_done', 'tool_result'] as const\n",
        encoding="utf-8",
    )
    (root / "core" / "seance-event.ts").write_text(
        "export const EVENT_TYPES = ['crew_turn_ended', 'tool_finished'] as const\n",
        encoding="utf-8",
    )
    (root / "core" / "notes.ts").write_text(
        "// a comment may say 'chat_done' becomes 'crew_turn_ended'\n"
        "/* and so may 'tool_result' */\n"
        "export const tool_call_id = 'x'\n",
        encoding="utf-8",
    )
    (root / "core" / "mapper.test.ts").write_text(
        "const m = { 'chat_done': 'crew_turn_ended' }\n", encoding="utf-8"
    )
    assert _crew_mapping_violations(root) == []

    (root / "core" / "normalizer.ts").write_text(
        "export const MAP = { chat_done: 'crew_turn_ended' }\n"
        "export const on = (type: string) => type === \"chat_chunk\"\n",
        encoding="utf-8",
    )
    (root / "adapters" / "sdk-shim" / "index.ts").write_text(
        "export const map = (t: string) =>\n"
        "  t === `tool_result` ? 'tool_finished' : null\n",
        encoding="utf-8",
    )
    (root / "App.tsx").write_text(
        "export const watch = 'approval_resolved'\n", encoding="utf-8"
    )

    assert _crew_mapping_violations(root) == [
        "App.tsx: crew_type_outside_raw_bridge",
        "adapters/sdk-shim/index.ts: crew_mapping_table",
        "core/normalizer.ts: crew_mapping_table",
        "core/normalizer.ts: crew_type_outside_raw_bridge",
    ]


def _string_constants(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    return {
        node.value
        for node in ast.walk(tree)
        if isinstance(node, ast.Constant) and isinstance(node.value, str)
    }


def test_python_has_exactly_one_crew_mapping_module() -> None:
    modules = sorted(_BACKEND_PACKAGE.rglob("*.py"))
    entry_point = _BACKEND_PACKAGE.parent / "main.py"
    if entry_point.is_file():
        modules.append(entry_point)

    owners = [
        path.relative_to(_BACKEND_PACKAGE.parent).as_posix()
        for path in modules
        if "chat_done" in _string_constants(path)
    ]

    assert owners == ["haunted_house/core/crew_event_normalizer.py"]
