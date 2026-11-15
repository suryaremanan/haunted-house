"""Property 3 for deterministic, nonterminal Crew normalization.

Each generated example exercises every supported mapping family, all presence and
boolean combinations of the ``chat_done`` transport flags, and each generic
source-identity form accepted by the backend normalizer.
"""

from __future__ import annotations

import itertools
import string
from dataclasses import dataclass

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from haunted_house.core.crew_event_normalizer import (
    CrewEnvelope,
    NormalizationContext,
    normalize_crew_envelope,
)
from haunted_house.core.seance_event import EventScope

pytestmark = pytest.mark.core

_DOMAIN_TERMINALS = {"run_completed", "run_blocked", "run_failed"}
_SAFE_IDENTIFIER_ALPHABET = string.ascii_letters + string.digits + "-_"
_SAFE_IDENTIFIERS = st.text(
    alphabet=_SAFE_IDENTIFIER_ALPHABET,
    min_size=1,
    max_size=24,
)
_MANSION_IDS = st.text(
    alphabet=string.ascii_lowercase + string.digits,
    min_size=1,
    max_size=24,
)
_ERROR_CATEGORIES = st.sampled_from(
    (
        ("provider_error", "provider_error"),
        ("rate-limited", "rate_limited"),
        ("not-a-crew-category", "unknown"),
    )
)


@dataclass(frozen=True)
class _NormalizationCase:
    envelope: CrewEnvelope
    event_types: tuple[str, ...]
    source_identities: tuple[tuple[str, tuple[str, ...]], ...]


def _generic_identity_variations(
    identity: str,
    generation: str,
    source_sequence: int,
) -> tuple[tuple[dict[str, object], tuple[str, ...]], ...]:
    """Return the valid intrinsic identity forms used by generic Crew events."""

    return (
        ({"meta": {"mid": identity}}, (identity,)),
        ({"mid": identity}, (identity,)),
        ({"tool_call_id": identity}, (identity,)),
        ({"id": identity}, (identity,)),
        (
            {"gen": generation, "seq": source_sequence},
            (generation, str(source_sequence)),
        ),
    )


def _single_candidate_case(
    event_type: str,
    data: dict[str, object],
    mapped_type: str,
    identity_parts: tuple[str, ...],
    *,
    source_type: str | None = None,
) -> _NormalizationCase:
    return _NormalizationCase(
        envelope=CrewEnvelope(type=event_type, data=data),
        event_types=(mapped_type,),
        source_identities=((source_type or event_type, identity_parts),),
    )


def _mapping_cases(
    *,
    scope: EventScope,
    message_mid: str,
    alternate_mid: str,
    tool_call_id: str,
    decision_id: str,
    generation: str,
    source_sequence: int,
    revision: int,
    occurred_at_ms: int,
    role: str,
    status: str,
    content: str,
    error_category: str,
    normalized_error_category: str,
) -> tuple[_NormalizationCase, ...]:
    slot = scope.session_slot
    common = {"revision": revision, "occurred_at_ms": occurred_at_ms}
    cases: list[_NormalizationCase] = [
        _single_candidate_case(
            "chat_message",
            {
                "slot": slot,
                "mid": message_mid,
                "role": role,
                "content": content,
                **common,
            },
            "message_recorded",
            (message_mid, role),
        ),
        _single_candidate_case(
            "chat_message",
            {
                "slot": slot,
                "meta": {"mid": alternate_mid},
                "role": role,
                "content": content,
                **common,
            },
            "message_recorded",
            (alternate_mid, role),
        ),
        _single_candidate_case(
            "chat_message_update",
            {
                "slot": slot,
                "tool_call_id": tool_call_id,
                "content": content,
                **common,
            },
            "message_updated",
            (tool_call_id,),
        ),
        _single_candidate_case(
            "chat_status",
            {"slot": slot, "status": status, **common},
            "ghost_progressed",
            (status,),
        ),
        _single_candidate_case(
            "chat_chunk",
            {
                "slot": slot,
                "gen": generation,
                "seq": source_sequence,
                "content": content,
                **common,
            },
            "response_chunk_recorded",
            (generation, str(source_sequence)),
        ),
    ]

    for identity_fields, expected_identity in _generic_identity_variations(
        alternate_mid,
        generation,
        source_sequence,
    ):
        cases.extend(
            (
                _single_candidate_case(
                    "chat_segment",
                    {"slot": slot, **common, **identity_fields},
                    "response_segment_started",
                    expected_identity,
                ),
                _single_candidate_case(
                    "chat_error",
                    {
                        "slot": slot,
                        "category": error_category,
                        **common,
                        **identity_fields,
                    },
                    "crew_error_observed",
                    expected_identity,
                ),
                _single_candidate_case(
                    "chat_future_transport_fact",
                    {"slot": slot, **common, **identity_fields},
                    "source_event_observed",
                    expected_identity,
                ),
            )
        )

    cases.extend(
        (
            _single_candidate_case(
                "chat_segment",
                {"slot": slot, **common},
                "response_segment_started",
                ("segment",),
            ),
            _single_candidate_case(
                "chat_error",
                {"slot": slot, "category": error_category, **common},
                "crew_error_observed",
                (normalized_error_category,),
            ),
            _single_candidate_case(
                "chat_future_transport_fact",
                {"slot": slot, **common},
                "source_event_observed",
                ("observed",),
            ),
        )
    )

    for continuing, needs_input in itertools.product((None, False, True), repeat=2):
        done_data: dict[str, object] = {
            "slot": slot,
            "turn": source_sequence,
            "turn_gen": generation,
            **common,
        }
        if continuing is not None:
            done_data["continuing"] = continuing
        if needs_input is not None:
            done_data["needs_input"] = needs_input
        cases.append(
            _single_candidate_case(
                "chat_done",
                done_data,
                "crew_turn_ended",
                (generation, str(source_sequence)),
            )
        )

    for is_update, mapped_type in ((False, "tool_started"), (True, "tool_updated")):
        cases.append(
            _single_candidate_case(
                "tool_call",
                {
                    "slot": slot,
                    "tool_call_id": tool_call_id,
                    "is_update": is_update,
                    **common,
                },
                mapped_type,
                (tool_call_id,),
            )
        )

    for final in (False, True):
        cases.append(
            _single_candidate_case(
                "tool_result",
                {
                    "slot": slot,
                    "tool_call_id": tool_call_id,
                    "final": final,
                    **common,
                },
                "tool_finished",
                (tool_call_id,),
            )
        )

    for state, approval_type in (
        ("pending", "approval_requested"),
        ("resolved", "approval_decided"),
    ):
        cases.append(
            _NormalizationCase(
                envelope=CrewEnvelope(
                    type="shared_crew.decision",
                    data={
                        "decision": {
                            "session_key": slot,
                            "decision_id": decision_id,
                            "revision": revision,
                            "kind": "approval",
                            "state": state,
                            "outcome": "approved",
                            "occurred_at_ms": occurred_at_ms,
                        }
                    },
                ),
                event_types=("decision_recorded", approval_type),
                source_identities=(
                    ("shared_crew.decision", (decision_id,)),
                    ("crew_approval", (message_mid,)),
                ),
            )
        )

    for approved in (False, True):
        cases.append(
            _single_candidate_case(
                "approval_resolved",
                {
                    "slot": slot,
                    "mid": message_mid,
                    "approved": approved,
                    **common,
                },
                "approval_decided",
                (message_mid,),
                source_type="crew_approval",
            )
        )

    return tuple(cases)


# Feature: seance-log-and-ghost-state, Property 3: Crew normalization is deterministic and transport-terminal facts remain nonterminal
@settings(max_examples=200, deadline=None)
@given(
    mansion_id=_MANSION_IDS,
    ghost_id=_SAFE_IDENTIFIERS,
    session_slot=_SAFE_IDENTIFIERS,
    run_id=_SAFE_IDENTIFIERS,
    run_sequence=st.integers(min_value=0, max_value=10**6),
    message_mid=_SAFE_IDENTIFIERS,
    alternate_mid=_SAFE_IDENTIFIERS,
    tool_call_id=_SAFE_IDENTIFIERS,
    decision_id=_SAFE_IDENTIFIERS,
    generation=_SAFE_IDENTIFIERS,
    source_sequence=st.integers(min_value=0, max_value=10**6),
    revision=st.integers(min_value=0, max_value=10**6),
    occurred_at_ms=st.integers(min_value=0, max_value=10**12),
    role=st.sampled_from(("assistant", "permission", "system", "tool", "user")),
    status=_SAFE_IDENTIFIERS,
    content=st.text(
        alphabet=string.ascii_letters + string.digits + " .,!?-_",
        max_size=80,
    ),
    error_category=_ERROR_CATEGORIES,
)
def test_crew_normalization_is_deterministic_and_transport_terminals_are_nonterminal(
    mansion_id,
    ghost_id,
    session_slot,
    run_id,
    run_sequence,
    message_mid,
    alternate_mid,
    tool_call_id,
    decision_id,
    generation,
    source_sequence,
    revision,
    occurred_at_ms,
    role,
    status,
    content,
    error_category,
):
    """**Validates: Requirements 2.2–2.14**"""

    raw_error_category, normalized_error_category = error_category
    scope = EventScope(
        mansion_id=mansion_id,
        ghost_id=ghost_id,
        session_slot=session_slot,
        run_id=run_id,
        run_sequence=run_sequence,
    )
    context = NormalizationContext(
        scope_by_slot={session_slot: scope},
        approval_mid_by_decision={decision_id: message_mid},
    )

    for case in _mapping_cases(
        scope=scope,
        message_mid=message_mid,
        alternate_mid=alternate_mid,
        tool_call_id=tool_call_id,
        decision_id=decision_id,
        generation=generation,
        source_sequence=source_sequence,
        revision=revision,
        occurred_at_ms=occurred_at_ms,
        role=role,
        status=status,
        content=content,
        error_category=raw_error_category,
        normalized_error_category=normalized_error_category,
    ):
        first = normalize_crew_envelope(case.envelope, context)
        repeated = normalize_crew_envelope(case.envelope, context)

        assert repeated == first
        assert first.diagnostic is None
        assert first.reconcile_slots == ()
        assert tuple(candidate.event_type for candidate in first.candidates) == (
            case.event_types
        )
        assert tuple(
            (candidate.source.source_type, candidate.source.identity_parts)
            for candidate in first.candidates
        ) == case.source_identities
        assert all(candidate.scope == scope for candidate in first.candidates)
        assert all(candidate.source.origin == "crew" for candidate in first.candidates)

        if case.envelope.type == "chat_done":
            assert case.event_types == ("crew_turn_ended",)
            assert _DOMAIN_TERMINALS.isdisjoint(case.event_types)
        elif case.envelope.type == "chat_error":
            assert case.event_types == ("crew_error_observed",)
            assert _DOMAIN_TERMINALS.isdisjoint(case.event_types)
