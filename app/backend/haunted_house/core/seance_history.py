"""Pure recovery plan from one bounded Crew session-history response.

Reconciliation never writes facts itself.  It turns what a history response
*proves* into Crew envelopes, and those envelopes travel through the same
Backend_Normalizer and Canonical_Event_Writer as live delivery.  Anything the
history cannot prove is left out and reported as ``history_partial``.

What one response can prove (spike S2-A4 leaves completeness unproved):

* a message with a role, text content, a message ``mid``, and a timestamp at
  or after the registration of the slot's current Run is a Crew message of
  that Run.  It becomes a ``chat_message`` envelope carrying only the fields
  the normalizer reads, so a redelivered live message is an exact duplicate;
* a ``permission`` message with a ``mid`` proves that this approval was
  requested.  It is paired with a *persisted* pending approval decision of
  the same Run whose identifier has the verified
  ``approval:<n>:<slot>:<approval_id>`` shape.  The decision envelope is
  rebuilt from that acknowledged record, never invented.

History never proves an approval outcome here; decided facts come only from
envelopes that carry the permission ``mid`` themselves.

This module performs no I/O and reads no clock.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from types import MappingProxyType
from typing import cast

from haunted_house.core.crew_event_normalizer import CrewEnvelope
from haunted_house.core.seance_event import AppEvent, JSONValue
from haunted_house.core.seance_scope_registry import RegisteredScope

__all__ = [
    "MAX_RECOVERED_MESSAGES",
    "HistoryPartialReason",
    "HistoryRecoveryPlan",
    "RecoveredEnvelope",
    "plan_history_recovery",
]

MAX_RECOVERED_MESSAGES = 500
_MAX_ID_BYTES = 512
_MAX_APPROVAL_ID_CHARS = 64

# Fixed reason codes; a response never carries history text.
HistoryPartialReason = str
_SHAPE_UNPROVED = "history_shape_unproved"
_SCOPE_UNPROVED = "history_scope_unproved"
_TRUNCATED = "history_truncated"
_COMPLETENESS_UNPROVED = "history_completeness_unproved"
_MESSAGE_UNPROVED = "message_unproved"
_APPROVAL_UNMATCHED = "approval_unmatched"

# Normalizer-read ordering and revision fields that a history message may
# repeat.  Copying them keeps a recovered candidate identical to live delivery.
_PASSTHROUGH_INT_FIELDS = (
    "revision",
    "occurred_at_ms",
    "timestamp_ms",
    "seq",
    "source_sequence",
)
_PASSTHROUGH_STRING_FIELDS = ("gen", "generation", "turn_gen")


@dataclass(frozen=True, slots=True)
class RecoveredEnvelope:
    """One envelope plus the approval aliases proved for exactly that envelope."""

    envelope: CrewEnvelope
    approval_mid_by_decision: Mapping[str, str]


@dataclass(frozen=True, slots=True)
class HistoryRecoveryPlan:
    envelopes: tuple[RecoveredEnvelope, ...] = ()
    partial_reasons: tuple[HistoryPartialReason, ...] = ()

    @property
    def partial(self) -> bool:
        return bool(self.partial_reasons)


def plan_history_recovery(
    history: object,
    registered: RegisteredScope,
    persisted: Sequence[AppEvent],
) -> HistoryRecoveryPlan:
    """Plan the envelopes one history response proves for a registered slot.

    ``registered`` comes from the server scope registry and ``persisted`` are
    acknowledged canonical records of the same Mansion.  The function never
    raises for a malformed response; it returns fewer envelopes and a reason.
    """

    slot = registered.scope.session_slot
    reasons: list[str] = []

    if type(history) is not dict:
        return HistoryRecoveryPlan(partial_reasons=(_SHAPE_UNPROVED,))
    response = cast(dict[str, object], history)
    for key in ("slot", "session_key"):
        declared = response.get(key)
        if declared is not None and declared != slot:
            return HistoryRecoveryPlan(partial_reasons=(_SCOPE_UNPROVED,))

    messages = response.get("messages")
    if type(messages) is not list:
        return HistoryRecoveryPlan(partial_reasons=(_SHAPE_UNPROVED,))
    message_list = cast(list[object], messages)
    if len(message_list) > MAX_RECOVERED_MESSAGES:
        message_list = message_list[-MAX_RECOVERED_MESSAGES:]
        _note(reasons, _TRUNCATED)

    has_more = response.get("has_more")
    if has_more is True:
        _note(reasons, _TRUNCATED)
    elif has_more is not False:
        _note(reasons, _COMPLETENESS_UNPROVED)

    pending_decisions = _pending_approval_decisions(registered, persisted)
    recovered: list[RecoveredEnvelope] = []
    for raw in message_list:
        message = _proved_message(raw, slot)
        if message is None:
            _note(reasons, _MESSAGE_UNPROVED)
            continue
        if message.at_ms < registered.registered_at_ms:
            # An earlier Run of the same session: not a fact of this scope.
            continue
        recovered.append(
            RecoveredEnvelope(
                envelope=CrewEnvelope(type="chat_message", data=message.data),
                approval_mid_by_decision=MappingProxyType({}),
            )
        )
        if message.role != "permission":
            continue
        decision = (
            None
            if message.approval_id is None
            else pending_decisions.get(message.approval_id)
        )
        if decision is None:
            _note(reasons, _APPROVAL_UNMATCHED)
            continue
        recovered.append(
            RecoveredEnvelope(
                envelope=_decision_envelope(decision, slot),
                approval_mid_by_decision=MappingProxyType(
                    {_decision_id(decision): message.mid}
                ),
            )
        )

    return HistoryRecoveryPlan(
        envelopes=tuple(recovered),
        partial_reasons=tuple(reasons),
    )


@dataclass(frozen=True, slots=True)
class _ProvedMessage:
    data: dict[str, JSONValue]
    role: str
    mid: str
    approval_id: str | None
    at_ms: int


def _proved_message(raw: object, slot: str) -> _ProvedMessage | None:
    if type(raw) is not dict:
        return None
    message = cast(dict[str, object], raw)
    declared = message.get("slot")
    if declared is not None and declared != slot:
        return None

    role = message.get("role")
    content = message.get("content")
    meta = message.get("meta")
    meta_map = cast(dict[str, object], meta) if type(meta) is dict else {}
    mid = meta_map.get("mid", message.get("mid"))
    at_ms = _timestamp_ms(message.get("ts"))
    if (
        not _bounded_text(role, 160)
        or type(content) is not str
        or not _bounded_text(mid, _MAX_ID_BYTES)
        or at_ms is None
    ):
        return None

    data: dict[str, JSONValue] = {
        "slot": slot,
        "role": cast(str, role),
        "content": content,
        "meta": {"mid": cast(str, mid)},
    }
    for key in _PASSTHROUGH_INT_FIELDS:
        value = message.get(key)
        if type(value) is int and value >= 0:
            data[key] = value
    for key in _PASSTHROUGH_STRING_FIELDS:
        value = message.get(key)
        if type(value) is str and len(value.encode("utf-8", "replace")) <= 160:
            data[key] = value
    revision = meta_map.get("revision")
    if type(revision) is int and revision >= 0:
        cast(dict[str, JSONValue], data["meta"])["revision"] = revision

    return _ProvedMessage(
        data=data,
        role=cast(str, role),
        mid=cast(str, mid),
        approval_id=_approval_id(meta_map.get("approval_id")),
        at_ms=at_ms,
    )


def _pending_approval_decisions(
    registered: RegisteredScope, persisted: Sequence[AppEvent]
) -> dict[str, AppEvent]:
    """Map approval_id to the newest persisted pending decision of this Run."""

    slot = registered.scope.session_slot
    shape = re.compile(
        r"approval:[0-9]{1,18}:" + re.escape(slot) + r":(?P<approval_id>[^:]{1,64})"
    )
    newest: dict[str, AppEvent] = {}
    for event in persisted:
        if (
            event.event_type != "decision_recorded"
            or event.source.origin != "crew"
            or event.scope != registered.scope
            or type(event.payload) is not dict
        ):
            continue
        payload = cast(dict[str, JSONValue], event.payload)
        if payload.get("kind") != "approval" or payload.get("state") != "pending":
            continue
        decision_id = payload.get("decision_id")
        if type(decision_id) is not str:
            continue
        match = shape.fullmatch(decision_id)
        if match is None:
            continue
        approval_id = match.group("approval_id")
        current = newest.get(approval_id)
        if current is None or (event.source.revision, event.sequence) > (
            current.source.revision,
            current.sequence,
        ):
            newest[approval_id] = event
    return newest


def _decision_id(event: AppEvent) -> str:
    return cast(str, cast(dict[str, JSONValue], event.payload)["decision_id"])


def _decision_envelope(event: AppEvent, slot: str) -> CrewEnvelope:
    """Rebuild the acknowledged pending decision as its Crew envelope."""

    payload = cast(dict[str, JSONValue], event.payload)
    decision: dict[str, JSONValue] = {
        "session_key": slot,
        "decision_id": payload["decision_id"],
        "revision": event.source.revision,
        "kind": "approval",
        "state": "pending",
    }
    if "outcome" in payload:
        decision["outcome"] = payload["outcome"]
    if event.occurred_at_ms is not None:
        decision["occurred_at_ms"] = event.occurred_at_ms
    return CrewEnvelope(type="shared_crew.decision", data={"decision": decision})


def _approval_id(value: object) -> str | None:
    if type(value) is int and value >= 0:
        value = str(value)
    if (
        type(value) is not str
        or not value
        or len(value) > _MAX_APPROVAL_ID_CHARS
        or ":" in value
    ):
        return None
    return value


def _timestamp_ms(value: object) -> int | None:
    """Parse an offset-carrying ISO-8601 instant into Unix milliseconds."""

    if type(value) is not str or len(value) > 64:
        return None
    try:
        instant = datetime.fromisoformat(value)
    except ValueError:
        return None
    if instant.tzinfo is None:
        return None
    try:
        milliseconds = int(instant.timestamp() * 1000)
    except (OverflowError, OSError, ValueError):
        return None
    return milliseconds if milliseconds >= 0 else None


def _bounded_text(value: object, maximum: int) -> bool:
    if type(value) is not str or not value:
        return False
    try:
        return len(value.encode("utf-8")) <= maximum
    except UnicodeEncodeError:
        return False


def _note(reasons: list[str], reason: str) -> None:
    if reason not in reasons:
        reasons.append(reason)
