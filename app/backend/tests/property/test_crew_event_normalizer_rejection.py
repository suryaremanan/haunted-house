"""Property 4 for rejection by the pure Crew event normalizer.

Generated cases cover every invalid-input family named by the design.  The
expected diagnostics are independent literals from that contract.  Repeating
normalization also proves that rejection does not depend on delivery time or
mutable external state.  An unmatched shared approval may preserve its valid
decision evidence, but it may not invent the affected approval fact.
"""

from __future__ import annotations

import json
import string
from dataclasses import dataclass

import pytest
from hypothesis import event, given, settings
from hypothesis import strategies as st

from haunted_house.core.crew_event_normalizer import (
    CrewEnvelope,
    NormalizationContext,
    NormalizationDiagnosticCode,
    NormalizationDiagnosticReason,
    NormalizeDiagnostic,
    NormalizeResult,
    normalize_crew_envelope,
)
from haunted_house.core.seance_event import EventScope

pytestmark = pytest.mark.core

_SAFE_ID = st.text(
    alphabet=string.ascii_lowercase + string.digits,
    min_size=6,
    max_size=24,
).map(lambda value: f"canary-{value}")
_NON_FINITE = st.sampled_from((float("nan"), float("inf"), float("-inf")))
_NON_JSON = st.one_of(
    st.binary(max_size=24),
    st.tuples(st.integers(), st.text(max_size=12)),
    st.sets(st.text(max_size=12), max_size=4),
    st.integers().map(lambda value: {value: "non-string-key"}),
)


@dataclass(frozen=True)
class RejectionCase:
    family: str
    envelope: CrewEnvelope
    context: NormalizationContext
    code: NormalizationDiagnosticCode
    field: str
    reason: NormalizationDiagnosticReason
    expected_event_types: tuple[str, ...]
    expected_reconcile_slots: tuple[str, ...]
    affected_event_types: frozenset[str]
    canary: str


def _scope(slot: str) -> EventScope:
    return EventScope(
        mansion_id="demo-mansion",
        ghost_id="archivist",
        session_slot=slot,
        run_id="requirements-1",
        run_sequence=2,
    )


def _context(slot: str, **aliases: str) -> NormalizationContext:
    return NormalizationContext(
        scope_by_slot={slot: _scope(slot)},
        approval_mid_by_decision=aliases,
    )


def _missing_identifier_envelope(
    family: str,
    slot: str,
    canary: str,
) -> tuple[CrewEnvelope, str]:
    cases: dict[str, tuple[str, dict[str, object], str, str]] = {
        "message_mid": (
            "chat_message",
            {"slot": slot, "mid": canary, "role": "user", "content": "safe"},
            "mid",
            "data.mid",
        ),
        "message_update_tool_call_id": (
            "chat_message_update",
            {"slot": slot, "tool_call_id": canary, "content": "safe"},
            "tool_call_id",
            "data.tool_call_id",
        ),
        "chunk_generation": (
            "chat_chunk",
            {"slot": slot, "gen": canary, "seq": 1, "content": "safe"},
            "gen",
            "data.gen",
        ),
        "chunk_sequence": (
            "chat_chunk",
            {"slot": slot, "gen": "generation-a", "seq": 1, "content": "safe"},
            "seq",
            "data.seq",
        ),
        "done_generation": (
            "chat_done",
            {"slot": slot, "turn_gen": canary, "turn": 1},
            "turn_gen",
            "data.turn_gen",
        ),
        "done_turn": (
            "chat_done",
            {"slot": slot, "turn_gen": "generation-a", "turn": 1},
            "turn",
            "data.turn",
        ),
        "tool_call_id": (
            "tool_call",
            {"slot": slot, "tool_call_id": canary},
            "tool_call_id",
            "data.tool_call_id",
        ),
        "tool_result_id": (
            "tool_result",
            {"slot": slot, "tool_call_id": canary, "final": True},
            "tool_call_id",
            "data.tool_call_id",
        ),
        "decision_id": (
            "shared_crew.decision",
            {
                "decision": {
                    "session_key": slot,
                    "decision_id": canary,
                    "revision": 0,
                    "kind": "unknown",
                    "state": "unknown",
                }
            },
            "decision_id",
            "data.decision.decision_id",
        ),
    }
    event_type, data, missing_key, field = cases[family]
    if event_type == "shared_crew.decision":
        decision = data["decision"]
        assert isinstance(decision, dict)
        del decision[missing_key]
        data["private_input"] = canary
    else:
        del data[missing_key]
        data["private_input"] = canary
    return CrewEnvelope(type=event_type, data=data), field  # type: ignore[arg-type]


@st.composite
def rejection_cases(draw: st.DrawFn) -> RejectionCase:
    family = draw(
        st.sampled_from(
            (
                "unknown_slot",
                "missing_identifier",
                "unmatched_approval_alias",
                "non_finite_value",
                "non_json_value",
            )
        )
    )
    canary = draw(_SAFE_ID)
    registered_slot = f"registered-{canary}"
    context = _context(registered_slot)

    if family == "unknown_slot":
        unknown_slot = f"unknown-{canary}"
        if draw(st.booleans()):
            envelope = CrewEnvelope(
                type="chat_status",
                data={"slot": unknown_slot, "status": "working"},
            )
        else:
            envelope = CrewEnvelope(
                type="shared_crew.decision",
                data={
                    "decision": {
                        "session_key": unknown_slot,
                        "decision_id": canary,
                        "revision": 0,
                        "kind": "unknown",
                        "state": "unknown",
                    }
                },
            )
        return RejectionCase(
            family=family,
            envelope=envelope,
            context=context,
            code=NormalizationDiagnosticCode.UNKNOWN_SESSION,
            field="data.slot",
            reason=NormalizationDiagnosticReason.UNREGISTERED_SLOT,
            expected_event_types=(),
            expected_reconcile_slots=(),
            affected_event_types=frozenset({"ghost_progressed", "decision_recorded"}),
            canary=unknown_slot,
        )

    if family == "missing_identifier":
        missing_family = draw(
            st.sampled_from(
                (
                    "message_mid",
                    "message_update_tool_call_id",
                    "chunk_generation",
                    "chunk_sequence",
                    "done_generation",
                    "done_turn",
                    "tool_call_id",
                    "tool_result_id",
                    "decision_id",
                )
            )
        )
        envelope, field = _missing_identifier_envelope(
            missing_family, registered_slot, canary
        )
        return RejectionCase(
            family=f"{family}:{missing_family}",
            envelope=envelope,
            context=context,
            code=NormalizationDiagnosticCode.INVALID_ENVELOPE,
            field=field,
            reason=NormalizationDiagnosticReason.MISSING_FIELD,
            expected_event_types=(),
            expected_reconcile_slots=(),
            affected_event_types=frozenset(
                {
                    "message_recorded",
                    "message_updated",
                    "response_chunk_recorded",
                    "crew_turn_ended",
                    "tool_started",
                    "tool_finished",
                    "decision_recorded",
                }
            ),
            canary=canary,
        )

    if family == "unmatched_approval_alias":
        if draw(st.booleans()):
            state = draw(st.sampled_from(("pending", "resolved")))
            envelope = CrewEnvelope(
                type="shared_crew.decision",
                data={
                    "decision": {
                        "session_key": registered_slot,
                        "decision_id": canary,
                        "revision": draw(st.integers(min_value=0, max_value=1000)),
                        "kind": "approval",
                        "state": state,
                        "outcome": "approved",
                    }
                },
            )
            return RejectionCase(
                family=f"{family}:shared_decision:{state}",
                envelope=envelope,
                context=context,
                code=NormalizationDiagnosticCode.APPROVAL_UNMATCHED,
                field="context.approval_mid_by_decision",
                reason=NormalizationDiagnosticReason.APPROVAL_MID_UNMATCHED,
                expected_event_types=("decision_recorded",),
                expected_reconcile_slots=(registered_slot,),
                affected_event_types=frozenset(
                    {"approval_requested", "approval_decided"}
                ),
                canary=canary,
            )

        envelope = CrewEnvelope(
            type="approval_resolved",
            data={
                "slot": registered_slot,
                "approved": draw(st.booleans()),
                "private_input": canary,
            },
        )
        return RejectionCase(
            family=f"{family}:resolved_without_mid",
            envelope=envelope,
            context=context,
            code=NormalizationDiagnosticCode.APPROVAL_UNMATCHED,
            field="data.mid",
            reason=NormalizationDiagnosticReason.APPROVAL_MID_UNMATCHED,
            expected_event_types=(),
            expected_reconcile_slots=(registered_slot,),
            affected_event_types=frozenset({"approval_decided"}),
            canary=canary,
        )

    if family == "non_finite_value":
        envelope = CrewEnvelope(
            type="chat_status",
            data={
                "slot": registered_slot,
                "status": "working",
                "private_input": canary,
                "invalid_number": draw(_NON_FINITE),
            },
        )
        reason = NormalizationDiagnosticReason.NON_FINITE_NUMBER
    else:
        envelope = CrewEnvelope(
            type="chat_status",
            data={
                "slot": registered_slot,
                "status": "working",
                "private_input": canary,
                "invalid_value": draw(_NON_JSON),
            },
        )
        reason = NormalizationDiagnosticReason.INVALID_JSON

    return RejectionCase(
        family=family,
        envelope=envelope,
        context=context,
        code=NormalizationDiagnosticCode.INVALID_ENVELOPE,
        field="data",
        reason=reason,
        expected_event_types=(),
        expected_reconcile_slots=(),
        affected_event_types=frozenset({"ghost_progressed"}),
        canary=canary,
    )


# Feature: seance-log-and-ghost-state, Property 4: Invalid Crew envelopes produce no affected candidate
@settings(max_examples=300, deadline=None)
@given(case=rejection_cases())
def test_invalid_crew_envelopes_produce_no_affected_candidate(case: RejectionCase) -> None:
    """**Validates: Requirements 2.15, 11.1, 11.2**"""

    first = normalize_crew_envelope(case.envelope, case.context)
    second = normalize_crew_envelope(case.envelope, case.context)

    event(f"rejection family={case.family}")
    assert isinstance(first, NormalizeResult)
    assert first == second
    assert first.ok is False
    assert tuple(candidate.event_type for candidate in first.candidates) == (
        case.expected_event_types
    )
    assert case.affected_event_types.isdisjoint(
        candidate.event_type for candidate in first.candidates
    )
    assert first.reconcile_slots == case.expected_reconcile_slots

    expected_diagnostic = NormalizeDiagnostic(
        code=case.code,
        field=case.field,
        reason=case.reason,
    )
    assert first.diagnostic == expected_diagnostic
    assert first.diagnostic is not None
    assert isinstance(first.diagnostic.code, NormalizationDiagnosticCode)
    assert isinstance(first.diagnostic.reason, NormalizationDiagnosticReason)

    safe_diagnostic = first.diagnostic.as_dict()
    assert safe_diagnostic == {
        "code": case.code.value,
        "field": case.field,
        "reason": case.reason.value,
    }
    serialized_diagnostic = json.dumps(safe_diagnostic, sort_keys=True)
    assert case.canary not in serialized_diagnostic
    assert len(serialized_diagnostic.encode("utf-8")) <= 200
