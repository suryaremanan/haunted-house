"""Unit tests for the pure scope registry and history recovery plan.

Tasks 6.3 and 6.4.  Both modules are folds over acknowledged records and one
parsed history response; neither touches a file, the network, or a clock.

Validates: Requirements 2.12, 2.15, 11.1, 11.2, 11.5, 11.7.
"""

from __future__ import annotations

from typing import Any

import pytest

from haunted_house.core.crew_event_normalizer import (
    NormalizationContext,
    normalize_crew_envelope,
)
from haunted_house.core.seance_event import (
    AppEvent,
    AppEventCandidate,
    EventScope,
    EventSource,
    JSONValue,
)
from haunted_house.core.seance_history import plan_history_recovery
from haunted_house.core.seance_persistence import build_app_event, prepare_candidates
from haunted_house.core.seance_scope_registry import (
    RegisteredScope,
    build_scope_registry,
)

pytestmark = pytest.mark.core

MANSION = "demo-mansion"
SLOT = "study-slot"
REGISTERED_AT_MS = 1_731_400_000_000
IN_RUN = "2024-11-12T08:30:00+00:00"
BEFORE_RUN = "2024-11-12T08:00:00+00:00"


def _scope(slot: str = SLOT, *, ghost: str = "archivist", run: int = 1, mansion: str = MANSION):
    return EventScope(
        mansion_id=mansion,
        ghost_id=ghost,
        session_slot=slot,
        run_id=f"run-{run}",
        run_sequence=run,
    )


def _event(
    sequence: int,
    event_type: str,
    scope: EventScope,
    *,
    origin: str = "house",
    identity: str = "x",
    revision: int = 0,
    payload: JSONValue = None,
    persisted_at_ms: int = REGISTERED_AT_MS,
    occurred_at_ms: int | None = None,
    source_type: str | None = None,
) -> AppEvent:
    candidate = AppEventCandidate(
        schema_version=1,
        event_type=event_type,  # type: ignore[arg-type]
        scope=scope,
        source=EventSource(
            origin=origin,  # type: ignore[arg-type]
            source_type=source_type or event_type,
            identity_parts=(identity,),
            revision=revision,
            generation="",
            source_sequence=0,
        ),
        caused_by=(),
        occurred_at_ms=occurred_at_ms,
        payload={} if payload is None else payload,
    )
    (prepared,) = prepare_candidates([candidate]).candidates
    return build_app_event(
        prepared, sequence=sequence, persisted_at_ms=persisted_at_ms, prev_hash=None
    )


# --- scope registry ----------------------------------------------------------


def test_an_empty_log_registers_nothing():
    registry = build_scope_registry(MANSION, [])
    assert dict(registry.by_slot) == {}
    assert registry.get(SLOT) is None
    assert registry.get(None) is None


def test_house_run_started_registers_its_slot_with_the_acknowledged_time():
    scope = _scope()
    registry = build_scope_registry(
        MANSION, [_event(1, "run_started", scope, persisted_at_ms=42)]
    )

    assert registry.get(SLOT) == RegisteredScope(
        scope=scope, registered_sequence=1, registered_at_ms=42
    )
    assert dict(registry.scope_by_slot) == {SLOT: scope}


def test_only_house_run_started_of_this_mansion_registers():
    scope = _scope()
    events = [
        _event(1, "run_started", scope, origin="crew"),
        _event(2, "ghost_progressed", scope),
        _event(3, "domain_event_recorded", scope, payload={
            "domain": "d", "kind": "run_started", "entity_id": "e", "data": None
        }),
        _event(4, "run_started", _scope("other-slot", mansion="other-mansion")),
    ]

    assert dict(build_scope_registry(MANSION, events).by_slot) == {}


def test_the_latest_registration_of_a_slot_wins_in_any_input_order():
    first = _event(1, "run_started", _scope(run=5, ghost="archivist"), identity="a")
    other = _event(2, "run_started", _scope("hall-slot", ghost="usher"), identity="b")
    # A later registration supersedes even with a lower Run_Sequence.
    second = _event(3, "run_started", _scope(run=2, ghost="scribe"), identity="c")
    terminal = _event(4, "run_completed", _scope(run=2, ghost="scribe"), identity="d")

    for events in ([first, other, second, terminal], [terminal, second, other, first]):
        registry = build_scope_registry(MANSION, events)
        assert registry.get(SLOT).scope == second.scope
        assert registry.get(SLOT).registered_sequence == 3
        assert registry.get("hall-slot").scope == other.scope
        assert set(registry.by_slot) == {SLOT, "hall-slot"}
    # Each slot maps to exactly one scope whose own slot equals the key.
    assert all(
        entry.scope.session_slot == slot
        for slot, entry in build_scope_registry(MANSION, [first, other, second]).by_slot.items()
    )


def test_the_registry_view_cannot_be_mutated():
    registry = build_scope_registry(MANSION, [_event(1, "run_started", _scope())])
    with pytest.raises(TypeError):
        registry.by_slot["new-slot"] = registry.get(SLOT)  # type: ignore[index]
    with pytest.raises(TypeError):
        registry.scope_by_slot["new-slot"] = _scope("new-slot")  # type: ignore[index]


# --- history recovery plan ---------------------------------------------------


def _registered() -> RegisteredScope:
    return RegisteredScope(
        scope=_scope(), registered_sequence=1, registered_at_ms=REGISTERED_AT_MS
    )


def _message(mid: str | None = "m-1", *, role: str = "user", ts: str | None = IN_RUN, **extra: Any):
    message: dict[str, Any] = {"role": role, "content": "hello", **extra}
    if mid is not None:
        message.setdefault("meta", {})["mid"] = mid
    if ts is not None:
        message["ts"] = ts
    return message


def _pending(approval_id: str, *, sequence: int = 2, revision: int = 1, **overrides: Any) -> AppEvent:
    payload = {
        "decision_id": f"approval:5:{SLOT}:{approval_id}",
        "kind": "approval",
        "revision": revision,
        "state": "pending",
    }
    payload.update(overrides.pop("payload", {}))
    return _event(
        sequence,
        "decision_recorded",
        overrides.pop("scope", _scope()),
        origin=overrides.pop("origin", "crew"),
        identity=payload["decision_id"],
        revision=revision,
        payload=payload,
        source_type="shared_crew.decision",
        **overrides,
    )


def test_a_proved_message_becomes_the_same_envelope_live_delivery_sends():
    history = {"slot": SLOT, "has_more": False, "messages": [
        _message("m-1", cls="msg msg-u", tool_input={"path": "notes.md"}, revision=3)
    ]}

    plan = plan_history_recovery(history, _registered(), [])

    assert plan.partial is False
    (recovered,) = plan.envelopes
    assert recovered.envelope.type == "chat_message"
    assert recovered.envelope.data == {
        "slot": SLOT,
        "role": "user",
        "content": "hello",
        "meta": {"mid": "m-1"},
        "revision": 3,
    }
    assert dict(recovered.approval_mid_by_decision) == {}
    context = NormalizationContext({SLOT: _scope()}, {})
    live = normalize_crew_envelope(
        type(recovered.envelope)(
            "chat_message",
            {"slot": SLOT, "role": "user", "content": "hello", "meta": {"mid": "m-1"}, "revision": 3, "ts": IN_RUN},
        ),
        context,
    )
    assert normalize_crew_envelope(recovered.envelope, context).candidates == live.candidates


def test_messages_before_the_registered_run_are_not_facts_of_this_scope():
    history = {"has_more": False, "messages": [
        _message("m-old", ts=BEFORE_RUN),
        _message("m-new"),
        _message("m-edge", ts="2024-11-12T08:26:40+00:00"),  # exactly the registration
    ]}

    plan = plan_history_recovery(history, _registered(), [])

    assert plan.partial is False
    assert [item.envelope.data["meta"]["mid"] for item in plan.envelopes] == ["m-new", "m-edge"]


@pytest.mark.parametrize(
    "message",
    [
        "text",
        None,
        {},
        _message(None),
        _message("m-1", ts=None),
        _message("m-1", ts="yesterday"),
        _message("m-1", ts="2024-11-12T08:30:00"),  # no offset: instant unknown
        _message("m-1", ts=1731400200),
        _message("m-1", role=""),
        {**_message("m-1"), "content": ["not", "text"]},
        {**_message("m-1"), "slot": "someone-elses-chat"},
        _message("x" * 600),
    ],
    ids=[
        "string", "null", "empty", "no-mid", "no-ts", "bad-ts", "naive-ts", "numeric-ts",
        "empty-role", "non-text-content", "foreign-slot", "oversized-mid",
    ],
)
def test_an_unproved_message_is_skipped_and_reported(message):
    history = {"has_more": False, "messages": [message, _message("m-ok")]}

    plan = plan_history_recovery(history, _registered(), [])

    assert plan.partial_reasons == ("message_unproved",)
    assert [item.envelope.data["meta"]["mid"] for item in plan.envelopes] == ["m-ok"]


@pytest.mark.parametrize(
    ("history", "reasons"),
    [
        (None, ("history_shape_unproved",)),
        ([], ("history_shape_unproved",)),
        ({}, ("history_shape_unproved",)),
        ({"messages": "none"}, ("history_shape_unproved",)),
        ({"slot": "someone-elses-chat", "messages": [], "has_more": False}, ("history_scope_unproved",)),
        ({"session_key": "someone-elses-chat", "messages": [], "has_more": False}, ("history_scope_unproved",)),
        ({"messages": [], "has_more": True}, ("history_truncated",)),
        ({"messages": []}, ("history_completeness_unproved",)),
        ({"messages": [], "has_more": "no"}, ("history_completeness_unproved",)),
    ],
)
def test_an_unproved_response_shape_recovers_nothing_and_says_why(history, reasons):
    plan = plan_history_recovery(history, _registered(), [])

    assert plan.envelopes == ()
    assert plan.partial_reasons == reasons
    assert plan.partial


def test_a_permission_message_is_paired_with_the_persisted_pending_decision():
    decision = _pending("2", occurred_at_ms=77)
    history = {"has_more": False, "messages": [
        _message("m-permission", role="permission", meta={"approval_id": "2"})
    ]}

    plan = plan_history_recovery(history, _registered(), [decision])

    assert plan.partial is False
    message, approval = plan.envelopes
    assert message.envelope.type == "chat_message"
    assert approval.envelope.type == "shared_crew.decision"
    assert approval.envelope.data == {
        "decision": {
            "session_key": SLOT,
            "decision_id": f"approval:5:{SLOT}:2",
            "revision": 1,
            "kind": "approval",
            "state": "pending",
            "occurred_at_ms": 77,
        }
    }
    assert dict(approval.approval_mid_by_decision) == {f"approval:5:{SLOT}:2": "m-permission"}

    result = normalize_crew_envelope(
        approval.envelope,
        NormalizationContext({SLOT: _scope()}, approval.approval_mid_by_decision),
    )
    assert result.diagnostic is None
    rebuilt, requested = result.candidates
    # The rebuilt decision is the acknowledged record, not a new variant.
    assert prepare_candidates([rebuilt]).candidates[0].record_id == decision.record_id
    assert requested.event_type == "approval_requested"
    assert requested.payload == {"mid": "m-permission"}
    assert requested.source.identity_parts == ("m-permission",)


def test_an_integer_approval_id_matches_and_the_newest_pending_revision_is_used():
    older = _pending("2", sequence=2, revision=1)
    newer = _pending("2", sequence=5, revision=3)
    history = {"has_more": False, "messages": [
        _message("m-a", role="permission", meta={"approval_id": 2}),
        _message("m-b", role="permission", meta={"approval_id": "2"}),
    ]}

    plan = plan_history_recovery(history, _registered(), [older, newer])

    approvals = [item for item in plan.envelopes if item.envelope.type == "shared_crew.decision"]
    assert [dict(item.approval_mid_by_decision) for item in approvals] == [
        {f"approval:5:{SLOT}:2": "m-a"},
        {f"approval:5:{SLOT}:2": "m-b"},
    ]
    assert {item.envelope.data["decision"]["revision"] for item in approvals} == {3}
    assert plan.partial is False


@pytest.mark.parametrize(
    "decision",
    [
        _pending("2", payload={"state": "resolved"}),
        _pending("2", payload={"kind": "unknown"}),
        _pending("2", payload={"decision_id": f"approval:5:other-slot:2"}),
        _pending("2", payload={"decision_id": f"decision:5:{SLOT}:2"}),
        _pending("2", payload={"decision_id": f"approval:x:{SLOT}:2"}),
        _pending("2", payload={"decision_id": f"approval:5:{SLOT}:2:extra"}),
        _pending("2", scope=_scope(run=9)),
        _pending("2", origin="house"),
        _pending("3"),
    ],
    ids=[
        "resolved", "not-approval", "other-slot", "other-prefix", "non-numeric",
        "extra-part", "other-run", "house-origin", "other-approval-id",
    ],
)
def test_no_approval_is_recovered_without_a_matching_pending_decision(decision):
    history = {"has_more": False, "messages": [
        _message("m-permission", role="permission", meta={"approval_id": "2"})
    ]}

    plan = plan_history_recovery(history, _registered(), [decision])

    assert [item.envelope.type for item in plan.envelopes] == ["chat_message"]
    assert plan.partial_reasons == ("approval_unmatched",)


@pytest.mark.parametrize("approval_id", [None, "", "a:b", "x" * 65, 2.5, True, -1, ["2"]])
def test_an_unusable_approval_id_never_matches(approval_id):
    meta = {} if approval_id is None else {"approval_id": approval_id}
    history = {"has_more": False, "messages": [
        _message("m-permission", role="permission", meta=meta)
    ]}

    plan = plan_history_recovery(history, _registered(), [_pending("2"), _pending("True", sequence=3)])

    assert [item.envelope.type for item in plan.envelopes] == ["chat_message"]
    assert plan.partial_reasons == ("approval_unmatched",)


def test_history_never_yields_an_approval_outcome():
    history = {"has_more": False, "messages": [
        _message(
            "m-permission",
            role="permission",
            meta={"approval_id": "2", "approved": True, "resolved": True, "outcome": "approved"},
            approved=True,
        )
    ]}
    resolved = _pending("2", sequence=3, revision=2, payload={"state": "resolved", "outcome": "approved"})

    plan = plan_history_recovery(history, _registered(), [_pending("2"), resolved])

    context_scope = {SLOT: _scope()}
    produced = [
        candidate.event_type
        for item in plan.envelopes
        for candidate in normalize_crew_envelope(
            item.envelope, NormalizationContext(context_scope, item.approval_mid_by_decision)
        ).candidates
    ]
    assert produced == ["message_recorded", "decision_recorded", "approval_requested"]


def test_an_oversized_history_keeps_only_the_newest_messages():
    history = {"has_more": False, "messages": [_message(f"m-{index}") for index in range(505)]}

    plan = plan_history_recovery(history, _registered(), [])

    assert len(plan.envelopes) == 500
    assert plan.envelopes[0].envelope.data["meta"]["mid"] == "m-5"
    assert plan.partial_reasons == ("history_truncated",)


def test_the_plan_does_not_mutate_its_inputs():
    message = _message("m-1", role="permission", meta={"approval_id": "2"})
    history = {"has_more": False, "messages": [message]}
    snapshot = repr(history)

    plan_history_recovery(history, _registered(), [_pending("2")])

    assert repr(history) == snapshot


# --- turn end proved by a not-running response (decision 2026-11-16) ------------


def _ended(**overrides: Any) -> dict[str, Any]:
    history: dict[str, Any] = {
        "slot": SLOT, "running": False, "turn": 4, "turn_gen": "0c698996", "has_more": False,
        "messages": [_message("m-1"), _message("m-2", role="assistant")],
    }
    history.update(overrides)
    return history


def test_a_not_running_response_proves_the_same_turn_end_live_delivery_sends():
    plan = plan_history_recovery(_ended(), _registered(), [])

    assert plan.partial is False
    *messages, ended = plan.envelopes
    assert [item.envelope.type for item in messages] == ["chat_message", "chat_message"]
    assert ended.envelope.type == "chat_done"
    assert ended.envelope.data == {
        "slot": SLOT, "turn": 4, "turn_gen": "0c698996", "continuing": False, "needs_input": False,
    }
    context = NormalizationContext({SLOT: _scope()}, {})
    live = normalize_crew_envelope(
        type(ended.envelope)(
            "chat_done",
            {"slot": SLOT, "turn": 4, "turn_gen": "0c698996", "continuing": False, "needs_input": False},
        ),
        context,
    )
    (recovered,) = normalize_crew_envelope(ended.envelope, context).candidates
    assert recovered.event_type == "crew_turn_ended"
    # The same candidate, so the same Record_ID: a forwarded chat_done collapses.
    assert (recovered,) == live.candidates


@pytest.mark.parametrize(
    "overrides",
    [
        {"running": True},
        {"running": None},
        {"running": "false"},
        {"turn": None},
        {"turn": -1},
        {"turn": "4"},
        {"turn": True},
        {"turn_gen": ""},
        {"turn_gen": 7},
        {"turn_gen": "g" * 200},
        # Admission-only running omits the identity.
        {"turn": None, "turn_gen": None},
        # Only turns of an earlier Run, or no message at all: nothing proves this Run's turn.
        {"messages": [_message("m-old", ts=BEFORE_RUN)]},
        {"messages": []},
    ],
    ids=[
        "running", "running-missing", "running-text", "no-turn", "negative-turn", "text-turn",
        "bool-turn", "empty-gen", "numeric-gen", "oversized-gen", "admission", "earlier-run",
        "no-messages",
    ],
)
def test_no_turn_end_without_a_proved_not_running_turn_of_this_run(overrides):
    history = _ended(**overrides)
    for key in [key for key, value in overrides.items() if value is None]:
        history.pop(key)
    plan = plan_history_recovery(history, _registered(), [])
    assert "chat_done" not in [item.envelope.type for item in plan.envelopes]
