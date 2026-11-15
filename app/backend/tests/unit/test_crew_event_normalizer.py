"""Focused examples for the pure Crew event normalizer (task 3.1).

The numbered normalization properties belong to tasks 3.2 through 3.4.  These
examples consume the scrubbed S2 spike fixtures and pin the concrete mapping,
safe payload, scope, approval, and terminal-event boundaries needed by the
implementation task.
"""

from __future__ import annotations

import ast
import copy
import inspect
import json
from pathlib import Path
from typing import Any

import pytest

from haunted_house.core import crew_event_normalizer
from haunted_house.core.crew_event_normalizer import (
    MAX_NORMALIZED_CONTENT_BYTES,
    CrewEnvelope,
    NormalizationContext,
    NormalizationDiagnosticCode,
    NormalizationDiagnosticReason,
    normalize_crew_envelope,
)
from haunted_house.core.seance_event import (
    EventScope,
    calculate_event_id,
    canonical_json,
    validate_candidate,
)

pytestmark = pytest.mark.core

_REPO_ROOT = Path(__file__).resolve().parents[4]
_S2_A1_PATH = _REPO_ROOT / "spikes" / "fixtures" / "s2-a1-callback-envelope.json"
_S2_A2_PATH = (
    _REPO_ROOT / "spikes" / "fixtures" / "s2-a2-failure-result-fields.json"
)
_S2_A1 = json.loads(_S2_A1_PATH.read_text(encoding="utf-8"))
_S2_A2 = json.loads(_S2_A2_PATH.read_text(encoding="utf-8"))

_SCOPE = EventScope(
    mansion_id="demo-mansion",
    ghost_id="archivist",
    session_slot="study-slot",
    run_id="requirements-1",
    run_sequence=2,
)
_CONTEXT = NormalizationContext(
    scope_by_slot={_SCOPE.session_slot: _SCOPE},
    approval_mid_by_decision={"decision-a": "message-a"},
)

_EXPECTED_EVENT_TYPES = {
    "chat_append": ("source_event_observed",),
    "chat_chunk": ("response_chunk_recorded",),
    "chat_done": ("crew_turn_ended",),
    "chat_error": ("crew_error_observed",),
    "chat_message": ("message_recorded",),
    "chat_message_update": ("message_updated",),
    "chat_segment": ("response_segment_started",),
    "chat_status": ("ghost_progressed",),
    "chat_thinking": ("source_event_observed",),
    "chat_variant_switch": ("source_event_observed",),
    "tool_call": ("tool_started",),
    "tool_result": ("tool_finished",),
    "shared_crew.decision": ("decision_recorded", "approval_decided"),
    "approval_resolved": ("approval_decided",),
}
_DOMAIN_TERMINALS = {"run_completed", "run_blocked", "run_failed"}


def _replace_target_slot(value: Any) -> Any:
    if value == "[target-slot]":
        return _SCOPE.session_slot
    if isinstance(value, list):
        return [_replace_target_slot(item) for item in value]
    if isinstance(value, dict):
        return {key: _replace_target_slot(item) for key, item in value.items()}
    return value


def _fixture_case(event_type: str) -> dict[str, Any]:
    return next(
        case for case in _S2_A1["callback_cases"] if case["type"] == event_type
    )


def _envelope(event_type: str) -> CrewEnvelope:
    case = _fixture_case(event_type)
    return CrewEnvelope(
        type=case["type"],
        data=_replace_target_slot(copy.deepcopy(case["data"])),
    )


@pytest.mark.parametrize(
    "event_type",
    list(_EXPECTED_EVENT_TYPES),
    ids=list(_EXPECTED_EVENT_TYPES),
)
def test_s2_callback_fixture_has_one_complete_backend_mapping(event_type: str) -> None:
    result = normalize_crew_envelope(_envelope(event_type), _CONTEXT)

    assert result.diagnostic is None
    assert result.reconcile_slots == ()
    assert tuple(candidate.event_type for candidate in result.candidates) == (
        _EXPECTED_EVENT_TYPES[event_type]
    )
    assert result.candidates
    for candidate in result.candidates:
        assert candidate.scope == _SCOPE
        assert candidate.source.origin == "crew"
        assert validate_candidate(candidate).value == candidate
        assert len(canonical_json(candidate.payload)) <= 256 * 1024


def test_intrinsic_source_identities_do_not_use_delivery_time_or_payload_bodies() -> None:
    message = normalize_crew_envelope(_envelope("chat_message"), _CONTEXT).candidates[0]
    chunk = normalize_crew_envelope(_envelope("chat_chunk"), _CONTEXT).candidates[0]
    tool = normalize_crew_envelope(_envelope("tool_call"), _CONTEXT).candidates[0]

    assert message.source.identity_parts == ("message-a", "user")
    assert chunk.source.identity_parts == ("generation-a", "2")
    assert chunk.source.generation == "generation-a"
    assert chunk.source.source_sequence == 2
    assert tool.source.identity_parts == ("tool-a",)

    redelivered = normalize_crew_envelope(_envelope("chat_chunk"), _CONTEXT)
    assert redelivered.candidates == (chunk,)
    assert calculate_event_id(redelivered.candidates[0]) == calculate_event_id(chunk)


def test_equivalent_s2_approval_outcomes_share_mid_based_event_identity() -> None:
    shared = normalize_crew_envelope(
        _envelope("shared_crew.decision"), _CONTEXT
    ).candidates[1]
    resolved = normalize_crew_envelope(
        _envelope("approval_resolved"), _CONTEXT
    ).candidates[0]

    assert shared.event_type == resolved.event_type == "approval_decided"
    assert shared.source.source_type == resolved.source.source_type == "crew_approval"
    assert shared.source.identity_parts == resolved.source.identity_parts == ("message-a",)
    assert shared.payload == resolved.payload == {
        "mid": "message-a",
        "outcome": "approved",
    }
    assert calculate_event_id(shared) == calculate_event_id(resolved)


def test_unmatched_shared_approval_is_auditable_but_cannot_invent_a_mid() -> None:
    context = NormalizationContext(
        scope_by_slot={_SCOPE.session_slot: _SCOPE},
        approval_mid_by_decision={},
    )

    result = normalize_crew_envelope(_envelope("shared_crew.decision"), context)

    assert tuple(candidate.event_type for candidate in result.candidates) == (
        "decision_recorded",
    )
    assert result.reconcile_slots == (_SCOPE.session_slot,)
    assert result.diagnostic is not None
    assert result.diagnostic.code is NormalizationDiagnosticCode.APPROVAL_UNMATCHED
    assert (
        result.diagnostic.reason
        is NormalizationDiagnosticReason.APPROVAL_MID_UNMATCHED
    )
    assert "mid" not in result.candidates[0].payload


def test_approval_without_mid_requests_reconciliation_and_emits_no_fact() -> None:
    raw = copy.deepcopy(_envelope("approval_resolved").data)
    assert isinstance(raw, dict)
    del raw["mid"]

    result = normalize_crew_envelope(
        CrewEnvelope(type="approval_resolved", data=raw), _CONTEXT
    )

    assert result.candidates == ()
    assert result.reconcile_slots == (_SCOPE.session_slot,)
    assert result.diagnostic is not None
    assert result.diagnostic.code is NormalizationDiagnosticCode.APPROVAL_UNMATCHED
    assert result.diagnostic.field == "data.mid"


@pytest.mark.parametrize(
    ("continuing", "needs_input"),
    [(False, False), (False, True), (True, False), (True, True)],
)
def test_every_s2_chat_done_flag_form_is_only_transport_evidence(
    continuing: bool, needs_input: bool
) -> None:
    raw = copy.deepcopy(_envelope("chat_done").data)
    assert isinstance(raw, dict)
    raw["continuing"] = continuing
    raw["needs_input"] = needs_input

    result = normalize_crew_envelope(CrewEnvelope(type="chat_done", data=raw), _CONTEXT)

    assert tuple(candidate.event_type for candidate in result.candidates) == (
        "crew_turn_ended",
    )
    assert not (_DOMAIN_TERMINALS & {item.event_type for item in result.candidates})
    assert result.candidates[0].payload == {
        "generation": "generation-a",
        "turn": 1,
        "continuing": continuing,
        "needs_input": needs_input,
    }


def test_s2_chat_error_is_only_safe_nonterminal_error_evidence() -> None:
    result = normalize_crew_envelope(_envelope("chat_error"), _CONTEXT)

    assert tuple(candidate.event_type for candidate in result.candidates) == (
        "crew_error_observed",
    )
    assert result.candidates[0].payload == {"category": "provider_error"}
    assert "message" not in result.candidates[0].payload
    assert not (_DOMAIN_TERMINALS & {item.event_type for item in result.candidates})


def test_s2_a2_fail_closed_fallbacks_keep_error_and_tool_payloads_safe() -> None:
    assert _S2_A2["outcome"] == "partially_observed"
    fallbacks = _S2_A2["fallback_by_field"]
    assert (
        fallbacks["chat_error.category_and_detail"]["safe_category"] == "unknown"
    )
    assert fallbacks["tool_result.non_final_shape"][
        "accept_only_reported_finality"
    ]

    unknown_error = normalize_crew_envelope(
        CrewEnvelope(type="chat_error", data={"slot": _SCOPE.session_slot}),
        _CONTEXT,
    )
    assert unknown_error.candidates[0].payload == {"category": "unknown"}

    tool_data = copy.deepcopy(_envelope("tool_result").data)
    assert isinstance(tool_data, dict)
    del tool_data["final"]
    unproved_finality = normalize_crew_envelope(
        CrewEnvelope(type="tool_result", data=tool_data), _CONTEXT
    )
    assert unproved_finality.candidates == ()
    assert unproved_finality.diagnostic is not None
    assert unproved_finality.diagnostic.as_dict() == {
        "code": "invalid_envelope",
        "field": "data.final",
        "reason": "missing_field",
    }


def test_payload_allowlists_omit_tool_io_error_detail_and_oversized_content() -> None:
    tool_call = normalize_crew_envelope(_envelope("tool_call"), _CONTEXT).candidates[0]
    tool_result = normalize_crew_envelope(_envelope("tool_result"), _CONTEXT).candidates[0]
    error = normalize_crew_envelope(_envelope("chat_error"), _CONTEXT).candidates[0]

    assert "input_preview" not in tool_call.payload
    assert "purpose" not in tool_call.payload
    assert "output" not in tool_result.payload
    assert "message" not in error.payload

    raw = copy.deepcopy(_envelope("chat_chunk").data)
    assert isinstance(raw, dict)
    raw["content"] = "x" * (MAX_NORMALIZED_CONTENT_BYTES + 1)
    oversized = normalize_crew_envelope(
        CrewEnvelope(type="chat_chunk", data=raw), _CONTEXT
    ).candidates[0]
    assert oversized.payload["content_omitted"] is True
    assert oversized.payload["content_bytes"] == MAX_NORMALIZED_CONTENT_BYTES + 1
    assert "content" not in oversized.payload


def test_scope_is_selected_only_from_the_registered_slot() -> None:
    raw = copy.deepcopy(_envelope("chat_status").data)
    assert isinstance(raw, dict)
    raw["slot"] = "other-slot"
    raw["mansion_id"] = _SCOPE.mansion_id
    raw["ghost_id"] = _SCOPE.ghost_id
    raw["run_id"] = _SCOPE.run_id

    result = normalize_crew_envelope(CrewEnvelope(type="chat_status", data=raw), _CONTEXT)

    assert result.candidates == ()
    assert result.reconcile_slots == ()
    assert result.diagnostic is not None
    assert result.diagnostic.as_dict() == {
        "code": "unknown_session",
        "field": "data.slot",
        "reason": "unregistered_slot",
    }


@pytest.mark.parametrize(
    ("envelope", "field", "reason"),
    [
        (
            CrewEnvelope(
                type="chat_chunk",
                data={"slot": _SCOPE.session_slot, "content": "safe", "seq": 1},
            ),
            "data.gen",
            "missing_field",
        ),
        (
            CrewEnvelope(
                type="chat_chunk",
                data={
                    "slot": _SCOPE.session_slot,
                    "content": "safe",
                    "seq": float("nan"),
                    "gen": "generation-a",
                },
            ),
            "data",
            "non_finite_number",
        ),
        (
            CrewEnvelope(
                type="activity_event",
                data={"slot": _SCOPE.session_slot},
            ),
            "type",
            "unsupported_type",
        ),
    ],
)
def test_malformed_or_unsupported_envelopes_return_typed_safe_errors(
    envelope: CrewEnvelope, field: str, reason: str
) -> None:
    result = normalize_crew_envelope(envelope, _CONTEXT)

    assert result.candidates == ()
    assert result.diagnostic is not None
    assert result.diagnostic.as_dict() == {
        "code": "invalid_envelope",
        "field": field,
        "reason": reason,
    }
    assert set(result.diagnostic.as_dict()) == {"code", "field", "reason"}


def test_normalizer_module_imports_no_io_network_environment_or_clock_modules() -> None:
    tree = ast.parse(inspect.getsource(crew_event_normalizer))
    imported_roots = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported_roots.update(alias.name.partition(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported_roots.add(node.module.partition(".")[0])

    assert imported_roots.isdisjoint(
        {
            "aiohttp",
            "asyncio",
            "datetime",
            "os",
            "pathlib",
            "socket",
            "subprocess",
            "time",
        }
    )
