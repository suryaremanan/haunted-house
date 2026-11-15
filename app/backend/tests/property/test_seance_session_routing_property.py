"""Property 12 for session routing and redelivery in the backend ingest model.

Each example registers a generated scope map through the writer, then drives
the real ingest pipeline (scope registry, normalizer, writer) with a generated
sequence of raw Crew envelope batches that mixes registered slots, unknown
slots, and exact redeliveries.  A small reference model keeps the expected
Record_ID and Sequence of every accepted source fact.
"""

from __future__ import annotations

import asyncio
import string
import tempfile
from pathlib import Path

from hypothesis import event, given, settings
from hypothesis import strategies as st

from haunted_house.adapters.seance_log_store import SeanceLogStore
from haunted_house.adapters.seance_service import SeanceService
from haunted_house.core.crew_event_normalizer import CrewEnvelope
from haunted_house.core.seance_event import (
    AppEventCandidate,
    EventScope,
    EventSource,
)

_MANSION = "demo-mansion"
_LOG_NAME = "events.v1." + "jsonl"
_NAMES = st.text(alphabet=string.ascii_lowercase + string.digits, min_size=1, max_size=6)
_REGISTERED_SLOTS = ("slot-a", "slot-b", "slot-c")
_UNKNOWN_SLOTS = ("slot-z", "slot-a ", "SLOT-A", "slot", "")


def _run_started(scope: EventScope) -> AppEventCandidate:
    return AppEventCandidate(
        schema_version=1,
        event_type="run_started",
        scope=scope,
        source=EventSource(
            origin="house",
            source_type="run",
            identity_parts=(scope.ghost_id, scope.run_id, str(scope.run_sequence)),
            revision=0,
            generation="",
            source_sequence=0,
        ),
        caused_by=(),
        occurred_at_ms=None,
        payload={},
    )


@st.composite
def _registrations(draw: st.DrawFn) -> list[EventScope]:
    """A scope map with repeated slots, so a later registration supersedes."""

    count = draw(st.integers(min_value=1, max_value=5))
    scopes: list[EventScope] = []
    for index in range(count):
        scopes.append(
            EventScope(
                mansion_id=_MANSION,
                ghost_id=draw(_NAMES),
                session_slot=draw(st.sampled_from(_REGISTERED_SLOTS)),
                run_id=f"run-{index}-{draw(_NAMES)}",
                run_sequence=draw(st.integers(min_value=0, max_value=3)),
            )
        )
    return scopes


@st.composite
def _envelopes(draw: st.DrawFn) -> tuple[str, CrewEnvelope]:
    """One raw envelope from a small pool, so exact redelivery is common."""

    slot = draw(
        st.one_of(
            st.sampled_from(_REGISTERED_SLOTS),
            st.sampled_from(_REGISTERED_SLOTS),
            st.sampled_from(_UNKNOWN_SLOTS),
        )
    )
    number = draw(st.integers(min_value=0, max_value=2))
    kind = draw(st.sampled_from(("chunk", "status", "tool", "done", "decision")))
    # Browser-supplied scope fields are noise the backend must ignore.
    forged = {"mansion_id": "forged", "ghost_id": "forged", "run_id": "forged"}
    if kind == "chunk":
        data = {"slot": slot, "gen": "g", "seq": number, "content": "text", **forged}
        return slot, CrewEnvelope("chat_chunk", data)
    if kind == "status":
        return slot, CrewEnvelope("chat_status", {"slot": slot, "status": f"s{number}"})
    if kind == "tool":
        data = {"slot": slot, "tool_call_id": f"tool-{number}", **forged}
        return slot, CrewEnvelope("tool_call", data)
    if kind == "done":
        return slot, CrewEnvelope(
            "chat_done", {"slot": slot, "turn": number, "turn_gen": "g"}
        )
    return slot, CrewEnvelope(
        "shared_crew.decision",
        {
            "decision": {
                "session_key": slot,
                "decision_id": f"decision-{number}",
                "revision": 0,
                "kind": "unknown",
                "state": "unknown",
            }
        },
    )


# Feature: seance-log-and-ghost-state, Property 12: Session routing and redelivery preserve scope and Sequence
@settings(max_examples=200, deadline=None)
@given(
    registrations=_registrations(),
    batches=st.lists(st.lists(_envelopes(), min_size=1, max_size=3), min_size=1, max_size=8),
    hash_linking=st.booleans(),
)
def test_session_routing_and_redelivery_preserve_scope_and_sequence(
    registrations, batches, hash_linking
) -> None:
    """**Validates: Requirements 11.1–11.3**"""

    async def scenario(root: Path) -> None:
        log = root / _MANSION / ".haunted-house" / "seance" / _LOG_NAME
        store = SeanceLogStore(root, hash_linking=hash_linking, clock_ms=lambda: 1)
        service = SeanceService(store)

        registered = await store.append_candidates(
            _MANSION, [_run_started(scope) for scope in registrations]
        )
        assert registered.status == "ok"
        # Reference registry: the latest registration of a slot is its scope.
        expected_scope: dict[str, EventScope] = {}
        for scope in registrations:
            expected_scope[scope.session_slot] = scope
        highest = registered.highest_sequence
        model: dict[str, int] = {}  # Record_ID -> Sequence

        for batch in batches:
            before = log.read_bytes()
            outcome = await service.ingest(_MANSION, [envelope for _slot, envelope in batch])
            after = log.read_bytes()
            unknown = [
                index
                for index, (slot, _envelope) in enumerate(batch)
                if slot not in expected_scope
            ]

            if unknown:
                # 11.2: an unregistered slot appends nothing at all.
                event("batch with unknown slot")
                assert outcome.status == "invalid_envelope"
                assert outcome.events == ()
                assert after == before
                assert [d.index for d in outcome.envelope_diagnostics] == unknown
                # An empty slot is not even a slot name; every other unknown
                # slot is a typed unknown session.
                assert [d.code for d in outcome.envelope_diagnostics] == [
                    "unknown_session" if batch[index][0] else "invalid_envelope"
                    for index in unknown
                ]
                assert outcome.highest_sequence == highest
                continue

            assert outcome.status == "ok"
            assert len(outcome.events) == len(batch)
            assert after.startswith(before)
            new_in_batch = 0
            for (slot, _envelope), acknowledged in zip(batch, outcome.events, strict=True):
                # 11.1: exactly the one registered scope equal to the slot.
                assert acknowledged.scope == expected_scope[slot]
                assert acknowledged.scope.session_slot == slot
                assert acknowledged.scope.mansion_id == _MANSION
                assert acknowledged.source.origin == "crew"
                prior = model.get(acknowledged.record_id)
                if prior is None:
                    new_in_batch += 1
                    highest += 1
                    assert acknowledged.sequence == highest
                    model[acknowledged.record_id] = acknowledged.sequence
                else:
                    # 11.3: redelivery returns the prior Record_ID and Sequence.
                    assert acknowledged.sequence == prior
                    assert acknowledged.record_id in outcome.duplicate_record_ids
            assert outcome.highest_sequence == highest
            assert after.count(b"\n") - before.count(b"\n") == new_in_batch
            if new_in_batch == 0:
                event("batch of exact redeliveries")
                assert after == before

        page = await store.read_after(_MANSION, 0, 500)
        assert page.status == "ok"
        assert page.highest_sequence == highest
        crew_records = [item for item in page.events if item.source.origin == "crew"]
        assert {item.record_id: item.sequence for item in crew_records} == model
        assert all(item.scope == expected_scope[item.scope.session_slot] for item in crew_records)

    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory).resolve() / "mansions"
        (root / _MANSION).mkdir(parents=True)
        asyncio.run(scenario(root))
