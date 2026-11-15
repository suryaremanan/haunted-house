"""Property 5 for equivalent Crew approval source identity.

Crew reports one approval outcome through two envelope types.  The shared
decision names a ``decision_id`` and must be matched to a permission ``mid``
by the caller's alias context; ``approval_resolved`` carries the ``mid``
itself together with a reusable ``approval_id``.  Each generated example reuses
one ``approval_id`` across several distinct permission ``mid`` values, as Crew
does across turns, and checks that identity follows the ``mid`` alone.
"""

from __future__ import annotations

import itertools
import string

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from haunted_house.core.crew_event_normalizer import (
    CrewEnvelope,
    NormalizationContext,
    NormalizationDiagnosticCode,
    normalize_crew_envelope,
)
from haunted_house.core.seance_event import EventScope, calculate_event_id
from haunted_house.core.seance_persistence import prepare_candidates

pytestmark = pytest.mark.core

_APPROVAL_FACTS = {"approval_requested", "approval_decided"}
_IDENTIFIER = st.text(
    alphabet=string.ascii_lowercase + string.digits,
    min_size=4,
    max_size=16,
)
_APPROVAL_IDS = st.integers(min_value=0, max_value=9).map(str)


def _scope(slot: str, run_sequence: int) -> EventScope:
    return EventScope(
        mansion_id="demo-mansion",
        ghost_id="archivist",
        session_slot=slot,
        run_id="requirements-1",
        run_sequence=run_sequence,
    )


def _decision_envelope(
    slot: str,
    decision_id: str,
    *,
    state: str,
    revision: int,
    outcome: str,
) -> CrewEnvelope:
    return CrewEnvelope(
        type="shared_crew.decision",
        data={
            "type": "shared_crew.decision",
            "schema_version": 1,
            "decision": {
                "decision_id": decision_id,
                "kind": "approval",
                "session_key": slot,
                "state": state,
                "revision": revision,
                "outcome": outcome,
            },
        },
    )


def _resolved_envelope(
    slot: str, approval_id: str, mid: str, approved: bool
) -> CrewEnvelope:
    return CrewEnvelope(
        type="approval_resolved",
        data={"slot": slot, "id": approval_id, "approved": approved, "mid": mid},
    )


# Feature: seance-log-and-ghost-state, Property 5: Equivalent Crew approval sources share one identity
@settings(max_examples=200, deadline=None)
@given(
    slot_suffix=_IDENTIFIER,
    run_sequence=st.integers(min_value=0, max_value=1000),
    approval_id=_APPROVAL_IDS,
    mid_suffixes=st.lists(_IDENTIFIER, min_size=2, max_size=5, unique=True),
    outcomes=st.lists(st.booleans(), min_size=5, max_size=5),
    revisions=st.lists(
        st.integers(min_value=0, max_value=1000), min_size=5, max_size=5
    ),
    shared_first=st.booleans(),
)
def test_equivalent_crew_approval_sources_share_one_identity(
    slot_suffix,
    run_sequence,
    approval_id,
    mid_suffixes,
    outcomes,
    revisions,
    shared_first,
):
    """**Validates: Requirements 2.12, 2.13**"""

    slot = f"slot-{slot_suffix}"
    scope = _scope(slot, run_sequence)
    # One reusable approval_id; each turn has its own permission mid and its
    # own decision id.
    mids = [f"m-{suffix}" for suffix in mid_suffixes]
    decision_ids = [
        f"approval:{turn}:{slot}:{approval_id}" for turn in range(len(mids))
    ]
    aliases = dict(zip(decision_ids, mids, strict=True))
    context = NormalizationContext(
        scope_by_slot={slot: scope},
        approval_mid_by_decision=aliases,
    )
    unmatched_context = NormalizationContext(
        scope_by_slot={slot: scope},
        approval_mid_by_decision={},
    )

    decided_event_ids: dict[str, str] = {}
    requested_event_ids: dict[str, str] = {}
    for index, (mid, decision_id) in enumerate(zip(mids, decision_ids, strict=True)):
        approved = outcomes[index]
        outcome = "approved" if approved else "rejected"
        shared_envelope = _decision_envelope(
            slot,
            decision_id,
            state="resolved",
            revision=revisions[index],
            outcome=outcome,
        )
        resolved_envelope = _resolved_envelope(slot, approval_id, mid, approved)

        shared_result = normalize_crew_envelope(shared_envelope, context)
        resolved_result = normalize_crew_envelope(resolved_envelope, context)
        assert shared_result.diagnostic is None
        assert resolved_result.diagnostic is None
        assert [c.event_type for c in shared_result.candidates] == [
            "decision_recorded",
            "approval_decided",
        ]
        assert [c.event_type for c in resolved_result.candidates] == [
            "approval_decided"
        ]

        shared = shared_result.candidates[1]
        resolved = resolved_result.candidates[0]
        assert shared.event_type == resolved.event_type == "approval_decided"
        assert shared.scope == resolved.scope == scope
        assert shared.source.origin == resolved.source.origin == "crew"
        assert (
            shared.source.source_type
            == resolved.source.source_type
            == "crew_approval"
        )
        assert shared.source.identity_parts == resolved.source.identity_parts == (mid,)
        assert shared.payload == resolved.payload == {"mid": mid, "outcome": outcome}
        if approval_id != mid:
            assert approval_id not in shared.source.identity_parts
        assert decision_id not in shared.source.identity_parts

        # Persistence assigns one Event_ID whichever source arrives first.
        delivery = (
            (shared_envelope, resolved_envelope)
            if shared_first
            else (resolved_envelope, shared_envelope)
        )
        event_ids_by_order = []
        for ordered in itertools.permutations(delivery):
            candidates = [
                candidate
                for envelope in ordered
                for candidate in normalize_crew_envelope(envelope, context).candidates
            ]
            prepared = prepare_candidates(candidates)
            assert prepared.ok
            approval_ids = {
                item.event_id
                for item in prepared.candidates
                if item.candidate.event_type == "approval_decided"
            }
            assert len(approval_ids) == 1
            event_ids_by_order.append(approval_ids.pop())
        assert len(set(event_ids_by_order)) == 1
        assert event_ids_by_order[0] == calculate_event_id(shared)
        assert event_ids_by_order[0] == calculate_event_id(resolved)
        decided_event_ids[mid] = event_ids_by_order[0]

        # The request for the same permission is keyed on the same mid.
        pending = normalize_crew_envelope(
            _decision_envelope(
                slot, decision_id, state="pending", revision=0, outcome=""
            ),
            context,
        )
        assert pending.diagnostic is None
        requested = pending.candidates[1]
        assert requested.event_type == "approval_requested"
        assert requested.source.source_type == "crew_approval"
        assert requested.source.identity_parts == (mid,)
        assert requested.payload == {"mid": mid}
        requested_event_ids[mid] = calculate_event_id(requested)

        # Without a matched mid neither decision state invents an approval.
        for state in ("pending", "resolved"):
            unmatched = normalize_crew_envelope(
                _decision_envelope(
                    slot, decision_id, state=state, revision=1, outcome=outcome
                ),
                unmatched_context,
            )
            assert unmatched.diagnostic is not None
            assert (
                unmatched.diagnostic.code
                is NormalizationDiagnosticCode.APPROVAL_UNMATCHED
            )
            assert unmatched.reconcile_slots == (slot,)
            assert _APPROVAL_FACTS.isdisjoint(
                candidate.event_type for candidate in unmatched.candidates
            )

    # A reused approval_id never merges distinct permission requests.
    assert len(set(decided_event_ids.values())) == len(mids)
    assert len(set(requested_event_ids.values())) == len(mids)
    assert set(decided_event_ids.values()).isdisjoint(requested_event_ids.values())
