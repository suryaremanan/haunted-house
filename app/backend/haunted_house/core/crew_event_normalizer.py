"""Pure normalization of app-owned Crew callbacks into canonical candidates.

The browser forwards Crew callback data unchanged.  This module is the sole
place that interprets those values.  It performs no I/O and reads no clock;
registered scope and approval aliases are supplied by the caller.

Normalizer diagnostics contain only fixed codes, field names, and reasons.
Raw callback values never appear in an error.  Candidate payloads copy only
an allowlist of bounded fields.  Tool arguments/results and error messages are
never copied; long message content is represented by byte count instead of a
partial value.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import cast

from haunted_house.core.seance_event import (
    MAX_IDENTITY_PART_BYTES,
    MAX_INGEST_REQUEST_BYTES,
    MAX_PAYLOAD_BYTES,
    SCHEMA_VERSION,
    AppEventCandidate,
    CanonicalJsonError,
    EventScope,
    EventSource,
    EventType,
    EventValidationReason,
    JSONValue,
    canonical_json,
    validate_candidate,
)

__all__ = [
    "MAPPED_CREW_TYPES",
    "MAX_NORMALIZED_CONTENT_BYTES",
    "CrewEnvelope",
    "NormalizationContext",
    "NormalizationDiagnosticCode",
    "NormalizationDiagnosticReason",
    "NormalizeDiagnostic",
    "NormalizeResult",
    "normalize_crew_envelope",
]

MAPPED_CREW_TYPES = frozenset(
    {
        "chat_message",
        "chat_message_update",
        "chat_status",
        "chat_segment",
        "chat_chunk",
        "chat_done",
        "chat_error",
        "tool_call",
        "tool_result",
        "shared_crew.decision",
        "approval_resolved",
    }
)
_EXACT_SUPPORTED_TYPES = frozenset(
    {"tool_call", "tool_result", "shared_crew.decision", "approval_resolved"}
)

# Individual transcript fragments stay well below the canonical payload limit.
# Oversized content is omitted as a whole so truncation cannot retain a secret
# fragment that the writer's later redactor can no longer recognize.
MAX_NORMALIZED_CONTENT_BYTES = 64 * 1024
_MAX_TYPE_BYTES = 160
_MAX_SAFE_LABEL_BYTES = 160
_MAX_SOURCE_ID_BYTES = MAX_IDENTITY_PART_BYTES

_SAFE_MESSAGE_ROLES = frozenset(
    {"assistant", "permission", "system", "tool", "user"}
)
_SAFE_ERROR_CATEGORIES = frozenset(
    {
        "authentication_error",
        "cancelled",
        "context_limit",
        "network_error",
        "permission_error",
        "provider_error",
        "rate_limited",
        "timeout",
        "tool_error",
        "unknown",
    }
)
_SAFE_DECISION_KINDS = frozenset({"approval", "unknown"})
_SAFE_DECISION_STATES = frozenset(
    {"cancelled", "pending", "resolved", "unknown"}
)
_SAFE_APPROVAL_OUTCOMES = frozenset(
    {"approved", "cancelled", "denied", "dismissed", "rejected", "unknown"}
)


@dataclass(frozen=True, slots=True)
class CrewEnvelope:
    type: str
    data: JSONValue


@dataclass(frozen=True, slots=True)
class NormalizationContext:
    scope_by_slot: Mapping[str, EventScope]
    approval_mid_by_decision: Mapping[str, str]


class NormalizationDiagnosticCode(StrEnum):
    INVALID_ENVELOPE = "invalid_envelope"
    UNKNOWN_SESSION = "unknown_session"
    INVALID_CANDIDATE = "invalid_candidate"
    APPROVAL_UNMATCHED = "approval_unmatched"


class NormalizationDiagnosticReason(StrEnum):
    INVALID_TYPE = "invalid_type"
    MISSING_FIELD = "missing_field"
    UNSUPPORTED_TYPE = "unsupported_type"
    INVALID_IDENTIFIER = "invalid_identifier"
    INVALID_JSON = "invalid_json"
    INVALID_UTF8 = "invalid_utf8"
    NON_FINITE_NUMBER = "non_finite_number"
    OUT_OF_RANGE = "out_of_range"
    UNREGISTERED_SLOT = "unregistered_slot"
    APPROVAL_MID_UNMATCHED = "approval_mid_unmatched"
    CANDIDATE_REJECTED = "candidate_rejected"


@dataclass(frozen=True, slots=True)
class NormalizeDiagnostic:
    """A bounded normalization error or reconciliation diagnostic."""

    code: NormalizationDiagnosticCode
    field: str
    reason: NormalizationDiagnosticReason

    def as_dict(self) -> dict[str, str]:
        return {
            "code": self.code.value,
            "field": self.field,
            "reason": self.reason.value,
        }


@dataclass(frozen=True, slots=True)
class NormalizeResult:
    candidates: tuple[AppEventCandidate, ...] = ()
    reconcile_slots: tuple[str, ...] = ()
    diagnostic: NormalizeDiagnostic | None = None

    @property
    def ok(self) -> bool:
        return self.diagnostic is None


class _NormalizeFailure(Exception):
    def __init__(
        self,
        code: NormalizationDiagnosticCode,
        field: str,
        reason: NormalizationDiagnosticReason,
    ) -> None:
        self.diagnostic = NormalizeDiagnostic(code=code, field=field, reason=reason)


@dataclass(frozen=True, slots=True)
class _EnvelopeInput:
    type: str
    data: dict[str, JSONValue]


def normalize_crew_envelope(
    envelope: CrewEnvelope,
    context: NormalizationContext,
) -> NormalizeResult:
    """Normalize one Crew callback without raising for malformed input.

    Session scope always comes from ``context``.  Callback-supplied mansion,
    ghost, and run fields are ignored.  An unmatched shared approval decision
    remains auditable as ``decision_recorded`` and requests bounded history
    reconciliation, but it cannot create an approval fact without a permission
    ``mid``.
    """

    try:
        raw = _validate_envelope(envelope)
        slot = _slot_for(raw)
        scope = _registered_scope(slot, context)
        return _dispatch(raw, scope, context)
    except _NormalizeFailure as failure:
        return NormalizeResult(diagnostic=failure.diagnostic)


def _validate_envelope(envelope: CrewEnvelope) -> _EnvelopeInput:
    if not isinstance(envelope, CrewEnvelope):
        _raise_invalid("$", NormalizationDiagnosticReason.INVALID_TYPE)

    event_type = _bounded_string(
        envelope.type,
        "type",
        maximum=_MAX_TYPE_BYTES,
        allow_empty=False,
    )
    if not (event_type.startswith("chat_") or event_type in _EXACT_SUPPORTED_TYPES):
        _raise_invalid("type", NormalizationDiagnosticReason.UNSUPPORTED_TYPE)
    if type(envelope.data) is not dict:
        _raise_invalid("data", NormalizationDiagnosticReason.INVALID_TYPE)

    try:
        encoded = canonical_json({"type": event_type, "data": envelope.data})
    except CanonicalJsonError as error:
        reason = {
            EventValidationReason.NON_FINITE_NUMBER: (
                NormalizationDiagnosticReason.NON_FINITE_NUMBER
            ),
            EventValidationReason.INVALID_UTF8: (
                NormalizationDiagnosticReason.INVALID_UTF8
            ),
        }.get(error.reason, NormalizationDiagnosticReason.INVALID_JSON)
        _raise_invalid("data", reason)
    if len(encoded) > MAX_INGEST_REQUEST_BYTES:
        _raise_invalid("data", NormalizationDiagnosticReason.OUT_OF_RANGE)

    return _EnvelopeInput(
        type=event_type,
        data=cast(dict[str, JSONValue], envelope.data),
    )


def _slot_for(envelope: _EnvelopeInput) -> str:
    if envelope.type == "shared_crew.decision":
        decision = _required_object(envelope.data, "decision", "data.decision")
        slot = _required_string(
            decision,
            "session_key",
            "data.decision.session_key",
            maximum=_MAX_SAFE_LABEL_BYTES,
        )
        outer_slot = envelope.data.get("slot")
        if outer_slot is not None and outer_slot != slot:
            _raise_invalid("data.slot", NormalizationDiagnosticReason.INVALID_IDENTIFIER)
        return slot
    return _required_string(
        envelope.data,
        "slot",
        "data.slot",
        maximum=_MAX_SAFE_LABEL_BYTES,
    )


def _registered_scope(slot: str, context: NormalizationContext) -> EventScope:
    try:
        scope = context.scope_by_slot.get(slot)
    except (AttributeError, TypeError):
        _raise_invalid("context.scope_by_slot", NormalizationDiagnosticReason.INVALID_TYPE)
    if not isinstance(scope, EventScope) or scope.session_slot != slot:
        raise _NormalizeFailure(
            NormalizationDiagnosticCode.UNKNOWN_SESSION,
            "data.slot",
            NormalizationDiagnosticReason.UNREGISTERED_SLOT,
        )
    return scope


def _dispatch(
    envelope: _EnvelopeInput,
    scope: EventScope,
    context: NormalizationContext,
) -> NormalizeResult:
    handlers = {
        "chat_message": _chat_message,
        "chat_message_update": _chat_message_update,
        "chat_status": _chat_status,
        "chat_segment": _chat_segment,
        "chat_chunk": _chat_chunk,
        "chat_done": _chat_done,
        "chat_error": _chat_error,
        "tool_call": _tool_call,
        "tool_result": _tool_result,
        "shared_crew.decision": _shared_decision,
        "approval_resolved": _approval_resolved,
    }
    handler = handlers.get(envelope.type)
    if handler is None:
        return NormalizeResult(candidates=(_unknown_chat(envelope, scope),))
    if envelope.type == "shared_crew.decision":
        return _shared_decision(envelope, scope, context)
    if envelope.type == "approval_resolved":
        return _approval_resolved(envelope, scope)
    candidate = handler(envelope, scope)
    return NormalizeResult(candidates=(candidate,))


def _chat_message(
    envelope: _EnvelopeInput, scope: EventScope
) -> AppEventCandidate:
    data = envelope.data
    mid = _message_mid(data)
    role = _safe_category(
        _required_string(
            data,
            "role",
            "data.role",
            maximum=_MAX_SAFE_LABEL_BYTES,
        ),
        _SAFE_MESSAGE_ROLES,
    )
    payload: dict[str, JSONValue] = {"mid": mid, "role": role}
    _copy_content(payload, data, required=True)
    return _candidate(
        event_type="message_recorded",
        scope=scope,
        source_type="chat_message",
        identity_parts=(mid, role),
        revision=_revision(data),
        generation=_generation(data),
        source_sequence=_source_sequence(data),
        occurred_at_ms=_occurred_at_ms(data),
        payload=payload,
    )


def _chat_message_update(
    envelope: _EnvelopeInput, scope: EventScope
) -> AppEventCandidate:
    data = envelope.data
    tool_call_id = _required_source_id(data, "tool_call_id")
    payload: dict[str, JSONValue] = {"tool_call_id": tool_call_id}
    _copy_content(payload, data, required=False)
    return _candidate(
        event_type="message_updated",
        scope=scope,
        source_type="chat_message_update",
        identity_parts=(tool_call_id,),
        revision=_revision(data),
        generation=_generation(data),
        source_sequence=_source_sequence(data),
        occurred_at_ms=_occurred_at_ms(data),
        payload=payload,
    )


def _chat_status(envelope: _EnvelopeInput, scope: EventScope) -> AppEventCandidate:
    data = envelope.data
    status = _required_string(
        data,
        "status",
        "data.status",
        maximum=_MAX_SAFE_LABEL_BYTES,
    )
    return _candidate(
        event_type="ghost_progressed",
        scope=scope,
        source_type="chat_status",
        identity_parts=(status,),
        revision=_revision(data),
        generation=_generation(data),
        source_sequence=_source_sequence(data),
        occurred_at_ms=_occurred_at_ms(data),
        payload={"status": status},
    )


def _chat_segment(envelope: _EnvelopeInput, scope: EventScope) -> AppEventCandidate:
    data = envelope.data
    generation = _generation(data)
    source_sequence = _source_sequence(data)
    return _candidate(
        event_type="response_segment_started",
        scope=scope,
        source_type="chat_segment",
        identity_parts=_generic_identity(data, "segment"),
        revision=_revision(data),
        generation=generation,
        source_sequence=source_sequence,
        occurred_at_ms=_occurred_at_ms(data),
        payload={"generation": generation, "source_sequence": source_sequence},
    )


def _chat_chunk(envelope: _EnvelopeInput, scope: EventScope) -> AppEventCandidate:
    data = envelope.data
    generation = _required_string(
        data,
        "gen",
        "data.gen",
        maximum=_MAX_SAFE_LABEL_BYTES,
    )
    source_sequence = _required_non_negative_int(data, "seq", "data.seq")
    payload: dict[str, JSONValue] = {
        "generation": generation,
        "source_sequence": source_sequence,
    }
    _copy_content(payload, data, required=True)
    return _candidate(
        event_type="response_chunk_recorded",
        scope=scope,
        source_type="chat_chunk",
        identity_parts=(generation, str(source_sequence)),
        revision=_revision(data),
        generation=generation,
        source_sequence=source_sequence,
        occurred_at_ms=_occurred_at_ms(data),
        payload=payload,
    )


def _chat_done(envelope: _EnvelopeInput, scope: EventScope) -> AppEventCandidate:
    data = envelope.data
    turn = _required_non_negative_int(data, "turn", "data.turn")
    generation = _required_string(
        data,
        "turn_gen",
        "data.turn_gen",
        maximum=_MAX_SAFE_LABEL_BYTES,
    )
    payload: dict[str, JSONValue] = {
        "generation": generation,
        "turn": turn,
    }
    _copy_optional_bool(payload, data, "continuing")
    _copy_optional_bool(payload, data, "needs_input")
    return _candidate(
        event_type="crew_turn_ended",
        scope=scope,
        source_type="chat_done",
        identity_parts=(generation, str(turn)),
        revision=_revision(data),
        generation=generation,
        source_sequence=turn,
        occurred_at_ms=_occurred_at_ms(data),
        payload=payload,
    )


def _chat_error(envelope: _EnvelopeInput, scope: EventScope) -> AppEventCandidate:
    data = envelope.data
    category_value = data.get("category", data.get("code", "unknown"))
    category = (
        _safe_category(category_value, _SAFE_ERROR_CATEGORIES)
        if type(category_value) is str
        else "unknown"
    )
    return _candidate(
        event_type="crew_error_observed",
        scope=scope,
        source_type="chat_error",
        identity_parts=_generic_identity(data, category),
        revision=_revision(data),
        generation=_generation(data),
        source_sequence=_source_sequence(data),
        occurred_at_ms=_occurred_at_ms(data),
        payload={"category": category},
    )


def _tool_call(envelope: _EnvelopeInput, scope: EventScope) -> AppEventCandidate:
    data = envelope.data
    tool_call_id = _required_source_id(data, "tool_call_id")
    is_update = _optional_bool(data, "is_update", default=False)
    event_type: EventType = "tool_updated" if is_update else "tool_started"
    payload: dict[str, JSONValue] = {
        "tool_call_id": tool_call_id,
        "is_update": is_update,
    }
    _copy_optional_bounded_string(payload, data, "tool", _MAX_SAFE_LABEL_BYTES)
    _copy_optional_bounded_string(payload, data, "kind", _MAX_SAFE_LABEL_BYTES)
    if "is_shell" in data:
        payload["is_shell"] = _optional_bool(data, "is_shell", default=False)
    return _candidate(
        event_type=event_type,
        scope=scope,
        source_type="tool_call",
        identity_parts=(tool_call_id,),
        revision=_revision(data, default=1 if is_update else 0),
        generation=_generation(data),
        source_sequence=_source_sequence(data),
        occurred_at_ms=_occurred_at_ms(data),
        payload=payload,
    )


def _tool_result(envelope: _EnvelopeInput, scope: EventScope) -> AppEventCandidate:
    data = envelope.data
    tool_call_id = _required_source_id(data, "tool_call_id")
    final = _required_bool(data, "final", "data.final")
    return _candidate(
        event_type="tool_finished",
        scope=scope,
        source_type="tool_result",
        identity_parts=(tool_call_id,),
        revision=_revision(data, default=1 if final else 0),
        generation=_generation(data),
        source_sequence=_source_sequence(data),
        occurred_at_ms=_occurred_at_ms(data),
        payload={"tool_call_id": tool_call_id, "final": final},
    )


def _shared_decision(
    envelope: _EnvelopeInput,
    scope: EventScope,
    context: NormalizationContext,
) -> NormalizeResult:
    decision = _required_object(envelope.data, "decision", "data.decision")
    decision_id = _required_string(
        decision,
        "decision_id",
        "data.decision.decision_id",
        maximum=_MAX_SOURCE_ID_BYTES,
    )
    revision = _required_non_negative_int(
        decision, "revision", "data.decision.revision"
    )
    raw_kind = _required_string(
        decision,
        "kind",
        "data.decision.kind",
        maximum=_MAX_SAFE_LABEL_BYTES,
    )
    raw_state = _required_string(
        decision,
        "state",
        "data.decision.state",
        maximum=_MAX_SAFE_LABEL_BYTES,
    )
    kind = _safe_category(raw_kind, _SAFE_DECISION_KINDS)
    state = _safe_category(raw_state, _SAFE_DECISION_STATES)
    outcome = _safe_outcome(decision.get("outcome"))
    occurred_at_ms = _occurred_at_ms(decision)

    decision_payload: dict[str, JSONValue] = {
        "decision_id": decision_id,
        "kind": kind,
        "revision": revision,
        "state": state,
    }
    if state == "resolved" or outcome != "unknown":
        decision_payload["outcome"] = outcome
    decision_candidate = _candidate(
        event_type="decision_recorded",
        scope=scope,
        source_type="shared_crew.decision",
        identity_parts=(decision_id,),
        revision=revision,
        generation="",
        source_sequence=0,
        occurred_at_ms=occurred_at_ms,
        payload=decision_payload,
    )

    if kind != "approval" or state not in {"pending", "resolved"}:
        return NormalizeResult(candidates=(decision_candidate,))

    mid = _matched_approval_mid(decision_id, context)
    if mid is None:
        return NormalizeResult(
            candidates=(decision_candidate,),
            reconcile_slots=(scope.session_slot,),
            diagnostic=NormalizeDiagnostic(
                code=NormalizationDiagnosticCode.APPROVAL_UNMATCHED,
                field="context.approval_mid_by_decision",
                reason=NormalizationDiagnosticReason.APPROVAL_MID_UNMATCHED,
            ),
        )

    approval_type: EventType = (
        "approval_requested" if state == "pending" else "approval_decided"
    )
    approval_payload: dict[str, JSONValue] = {"mid": mid}
    if approval_type == "approval_decided":
        approval_payload["outcome"] = outcome
    approval_candidate = _candidate(
        event_type=approval_type,
        scope=scope,
        source_type="crew_approval",
        identity_parts=(mid,),
        revision=revision,
        generation="",
        source_sequence=0,
        occurred_at_ms=occurred_at_ms,
        payload=approval_payload,
    )
    return NormalizeResult(candidates=(decision_candidate, approval_candidate))


def _approval_resolved(
    envelope: _EnvelopeInput, scope: EventScope
) -> NormalizeResult:
    data = envelope.data
    if "mid" not in data:
        return NormalizeResult(
            reconcile_slots=(scope.session_slot,),
            diagnostic=NormalizeDiagnostic(
                code=NormalizationDiagnosticCode.APPROVAL_UNMATCHED,
                field="data.mid",
                reason=NormalizationDiagnosticReason.APPROVAL_MID_UNMATCHED,
            ),
        )
    mid = _required_string(
        data,
        "mid",
        "data.mid",
        maximum=_MAX_SOURCE_ID_BYTES,
    )
    approved = _required_bool(data, "approved", "data.approved")
    outcome = "approved" if approved else "rejected"
    candidate = _candidate(
        event_type="approval_decided",
        scope=scope,
        source_type="crew_approval",
        identity_parts=(mid,),
        revision=_revision(data),
        generation="",
        source_sequence=0,
        occurred_at_ms=_occurred_at_ms(data),
        payload={"mid": mid, "outcome": outcome},
    )
    return NormalizeResult(candidates=(candidate,))


def _unknown_chat(
    envelope: _EnvelopeInput, scope: EventScope
) -> AppEventCandidate:
    data = envelope.data
    return _candidate(
        event_type="source_event_observed",
        scope=scope,
        source_type=envelope.type,
        identity_parts=_generic_identity(data, "observed"),
        revision=_revision(data),
        generation=_generation(data),
        source_sequence=_source_sequence(data),
        occurred_at_ms=_occurred_at_ms(data),
        payload={"observed_type": envelope.type},
    )


def _candidate(
    *,
    event_type: EventType,
    scope: EventScope,
    source_type: str,
    identity_parts: tuple[str, ...],
    revision: int,
    generation: str,
    source_sequence: int,
    occurred_at_ms: int | None,
    payload: JSONValue,
) -> AppEventCandidate:
    candidate = AppEventCandidate(
        schema_version=SCHEMA_VERSION,
        event_type=event_type,
        scope=scope,
        source=EventSource(
            origin="crew",
            source_type=source_type,
            identity_parts=identity_parts,
            revision=revision,
            generation=generation,
            source_sequence=source_sequence,
        ),
        caused_by=(),
        occurred_at_ms=occurred_at_ms,
        payload=payload,
    )
    result = validate_candidate(candidate)
    if result.error is not None or result.value is None:
        field = "candidate"
        if result.error is not None:
            field = f"candidate.{result.error.field}"
        raise _NormalizeFailure(
            NormalizationDiagnosticCode.INVALID_CANDIDATE,
            field,
            NormalizationDiagnosticReason.CANDIDATE_REJECTED,
        )
    return result.value


def _message_mid(data: Mapping[str, JSONValue]) -> str:
    meta = data.get("meta")
    if type(meta) is dict and "mid" in meta:
        return _required_string(
            cast(dict[str, JSONValue], meta),
            "mid",
            "data.meta.mid",
            maximum=_MAX_SOURCE_ID_BYTES,
        )
    return _required_string(
        data,
        "mid",
        "data.mid",
        maximum=_MAX_SOURCE_ID_BYTES,
    )


def _required_source_id(data: Mapping[str, JSONValue], key: str) -> str:
    return _required_string(
        data,
        key,
        f"data.{key}",
        maximum=_MAX_SOURCE_ID_BYTES,
    )


def _matched_approval_mid(
    decision_id: str, context: NormalizationContext
) -> str | None:
    try:
        mid = context.approval_mid_by_decision.get(decision_id)
    except (AttributeError, TypeError):
        return None
    if type(mid) is not str:
        return None
    try:
        return _bounded_string(
            mid,
            "context.approval_mid_by_decision",
            maximum=_MAX_SOURCE_ID_BYTES,
            allow_empty=False,
        )
    except _NormalizeFailure:
        return None


def _generic_identity(
    data: Mapping[str, JSONValue], fallback: str
) -> tuple[str, ...]:
    meta = data.get("meta")
    if type(meta) is dict:
        mid = cast(dict[str, JSONValue], meta).get("mid")
        if _is_bounded_string(mid, _MAX_SOURCE_ID_BYTES):
            return (cast(str, mid),)

    for key in ("mid", "tool_call_id", "id"):
        value = data.get(key)
        if _is_bounded_string(value, _MAX_SOURCE_ID_BYTES):
            return (cast(str, value),)

    generation = _generation(data)
    sequence = _source_sequence(data)
    if generation or sequence:
        return (generation, str(sequence))

    turn_generation = data.get("turn_gen")
    turn = data.get("turn")
    if _is_bounded_string(turn_generation, _MAX_SAFE_LABEL_BYTES) and _is_non_negative_int(
        turn
    ):
        return (cast(str, turn_generation), str(turn))

    return (fallback,)


def _generation(data: Mapping[str, JSONValue]) -> str:
    for key in ("gen", "generation", "turn_gen"):
        if key in data:
            return _bounded_string(
                data[key],
                f"data.{key}",
                maximum=_MAX_SAFE_LABEL_BYTES,
                allow_empty=True,
            )
    return ""


def _source_sequence(data: Mapping[str, JSONValue]) -> int:
    for key in ("seq", "source_sequence"):
        if key in data:
            return _required_non_negative_int(data, key, f"data.{key}")
    return 0


def _revision(data: Mapping[str, JSONValue], *, default: int = 0) -> int:
    if "revision" in data:
        return _required_non_negative_int(data, "revision", "data.revision")
    meta = data.get("meta")
    if type(meta) is dict and "revision" in meta:
        return _required_non_negative_int(
            cast(dict[str, JSONValue], meta),
            "revision",
            "data.meta.revision",
        )
    return default


def _occurred_at_ms(data: Mapping[str, JSONValue]) -> int | None:
    for key in ("occurred_at_ms", "timestamp_ms"):
        value = data.get(key)
        if _is_non_negative_int(value):
            return cast(int, value)
    resolved_at = data.get("resolved_at")
    if type(resolved_at) in (int, float):
        numeric = cast(int | float, resolved_at)
        if not isinstance(numeric, bool) and math.isfinite(numeric) and numeric >= 0:
            return int(numeric * 1000)
    return None


def _copy_content(
    payload: dict[str, JSONValue],
    data: Mapping[str, JSONValue],
    *,
    required: bool,
) -> None:
    if "content" not in data:
        if required:
            _raise_invalid("data.content", NormalizationDiagnosticReason.MISSING_FIELD)
        return
    content = data["content"]
    if type(content) is not str:
        _raise_invalid("data.content", NormalizationDiagnosticReason.INVALID_TYPE)
    try:
        size = len(content.encode("utf-8"))
    except UnicodeEncodeError:
        _raise_invalid("data.content", NormalizationDiagnosticReason.INVALID_UTF8)
    if size <= MAX_NORMALIZED_CONTENT_BYTES:
        payload["content"] = content
    else:
        payload["content_bytes"] = size
        payload["content_omitted"] = True


def _copy_optional_bounded_string(
    payload: dict[str, JSONValue],
    data: Mapping[str, JSONValue],
    key: str,
    maximum: int,
) -> None:
    if key not in data:
        return
    payload[key] = _bounded_string(
        data[key],
        f"data.{key}",
        maximum=maximum,
        allow_empty=True,
    )


def _copy_optional_bool(
    payload: dict[str, JSONValue],
    data: Mapping[str, JSONValue],
    key: str,
) -> None:
    if key in data:
        payload[key] = _required_bool(data, key, f"data.{key}")


def _optional_bool(
    data: Mapping[str, JSONValue], key: str, *, default: bool
) -> bool:
    if key not in data:
        return default
    return _required_bool(data, key, f"data.{key}")


def _required_bool(
    data: Mapping[str, JSONValue], key: str, field: str
) -> bool:
    if key not in data:
        _raise_invalid(field, NormalizationDiagnosticReason.MISSING_FIELD)
    value = data[key]
    if type(value) is not bool:
        _raise_invalid(field, NormalizationDiagnosticReason.INVALID_TYPE)
    return cast(bool, value)


def _required_non_negative_int(
    data: Mapping[str, JSONValue], key: str, field: str
) -> int:
    if key not in data:
        _raise_invalid(field, NormalizationDiagnosticReason.MISSING_FIELD)
    value = data[key]
    if type(value) is not int:
        _raise_invalid(field, NormalizationDiagnosticReason.INVALID_TYPE)
    if cast(int, value) < 0:
        _raise_invalid(field, NormalizationDiagnosticReason.OUT_OF_RANGE)
    return cast(int, value)


def _required_object(
    data: Mapping[str, JSONValue], key: str, field: str
) -> dict[str, JSONValue]:
    if key not in data:
        _raise_invalid(field, NormalizationDiagnosticReason.MISSING_FIELD)
    value = data[key]
    if type(value) is not dict:
        _raise_invalid(field, NormalizationDiagnosticReason.INVALID_TYPE)
    return cast(dict[str, JSONValue], value)


def _required_string(
    data: Mapping[str, JSONValue],
    key: str,
    field: str,
    *,
    maximum: int,
) -> str:
    if key not in data:
        _raise_invalid(field, NormalizationDiagnosticReason.MISSING_FIELD)
    return _bounded_string(
        data[key],
        field,
        maximum=maximum,
        allow_empty=False,
    )


def _bounded_string(
    value: object,
    field: str,
    *,
    maximum: int,
    allow_empty: bool,
) -> str:
    if type(value) is not str:
        _raise_invalid(field, NormalizationDiagnosticReason.INVALID_TYPE)
    try:
        encoded = cast(str, value).encode("utf-8")
    except UnicodeEncodeError:
        _raise_invalid(field, NormalizationDiagnosticReason.INVALID_UTF8)
    if len(encoded) > maximum or (not allow_empty and not encoded):
        _raise_invalid(field, NormalizationDiagnosticReason.OUT_OF_RANGE)
    return cast(str, value)


def _is_bounded_string(value: object, maximum: int) -> bool:
    if type(value) is not str or not value:
        return False
    try:
        return len(cast(str, value).encode("utf-8")) <= maximum
    except UnicodeEncodeError:
        return False


def _is_non_negative_int(value: object) -> bool:
    return type(value) is int and cast(int, value) >= 0


def _safe_category(value: object, allowed: frozenset[str]) -> str:
    if type(value) is not str:
        return "unknown"
    normalized = cast(str, value).strip().lower().replace("-", "_").replace(" ", "_")
    return normalized if normalized in allowed else "unknown"


def _safe_outcome(value: object) -> str:
    return _safe_category(value, _SAFE_APPROVAL_OUTCOMES)


def _raise_invalid(field: str, reason: NormalizationDiagnosticReason) -> None:
    raise _NormalizeFailure(
        NormalizationDiagnosticCode.INVALID_ENVELOPE,
        field,
        reason,
    )


# Keep this module's own candidate payloads comfortably inside the canonical
# contract even if constants are changed independently in a later schema.
assert MAX_NORMALIZED_CONTENT_BYTES < MAX_PAYLOAD_BYTES
