"""Pure canonical event selection and six-state ghost projection.

Spec 2 is the sole owner of these rules.  The module consumes validated
``AppEvent`` values, performs no I/O or clock reads, and never mutates input.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Literal, Sequence, TypeAlias, cast

from haunted_house.core.seance_event import (
    AppEvent,
    JSONValue,
    app_event_to_dict,
    canonical_json,
)

__all__ = [
    "GhostSnapshot",
    "GhostState",
    "GhostTransition",
    "ProjectionResult",
    "SelectionDiagnostic",
    "SelectionResult",
    "derive_ghost_transitions",
    "fold_ghost_events",
    "ghost_transition_id",
    "reduce_ghost_snapshot",
    "reduce_ghost_snapshots",
    "select_events",
    "semantic_completeness",
]

GhostState: TypeAlias = Literal[
    "idle", "working", "waiting", "blocked", "failed", "done"
]
SelectionDiagnosticCode: TypeAlias = Literal[
    "conflicting_variant", "missing_predecessor"
]
CausalDiagnosticKind: TypeAlias = Literal["conflict", "missing", "forward"]


@dataclass(frozen=True, slots=True)
class SelectionDiagnostic:
    code: SelectionDiagnosticCode
    event_id: str
    related_event_id: str | None
    kind: CausalDiagnosticKind
    record_ids: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class SelectionResult:
    events: tuple[AppEvent, ...]
    diagnostics: tuple[SelectionDiagnostic, ...]


@dataclass(frozen=True, slots=True)
class GhostSnapshot:
    mansion_id: str
    ghost_id: str
    run_id: str | None
    run_sequence: int | None
    state: GhostState
    pending_approvals: tuple[str, ...]
    open_tools: tuple[str, ...]
    latest_event_id: str | None
    latest_sequence: int
    reason: str | None


@dataclass(frozen=True, slots=True)
class GhostTransition:
    transition_id: str
    causing_event_id: str
    causing_sequence: int
    mansion_id: str
    ghost_id: str
    from_state: GhostState
    to_state: GhostState


@dataclass(frozen=True, slots=True)
class ProjectionResult:
    selection: SelectionResult
    snapshots: tuple[GhostSnapshot, ...]
    transitions: tuple[GhostTransition, ...]


def semantic_completeness(event: AppEvent) -> int:
    """Rank how much usable candidate information a variant contains.

    Revision is ranked separately and first.  This rank counts observed,
    non-empty candidate facts: causal references, occurrence/source ordering
    evidence, and recursively meaningful payload values.  Writer metadata is
    deliberately excluded.  Equal ranks fall back to Record_ID.
    """

    return (
        len(event.caused_by)
        + (1 if event.occurred_at_ms is not None else 0)
        + (1 if event.source.generation else 0)
        + (1 if event.source.source_sequence > 0 else 0)
        + _json_information_units(event.payload)
    )


def select_events(events: Sequence[AppEvent]) -> SelectionResult:
    """Select deterministic logical variants and return canonical order."""

    by_record_id: dict[str, AppEvent] = {}
    for event in events:
        current = by_record_id.get(event.record_id)
        if current is None or _duplicate_choice_key(event) < _duplicate_choice_key(
            current
        ):
            by_record_id[event.record_id] = event

    variants_by_event_id: dict[str, list[AppEvent]] = {}
    for event in by_record_id.values():
        variants_by_event_id.setdefault(event.event_id, []).append(event)

    selected: list[AppEvent] = []
    diagnostics: set[SelectionDiagnostic] = set()
    for event_id, variants in variants_by_event_id.items():
        winner = max(
            variants,
            key=lambda event: (
                event.source.revision,
                semantic_completeness(event),
                event.record_id,
            ),
        )
        selected.append(winner)
        record_ids = tuple(sorted(event.record_id for event in variants))
        if len(record_ids) > 1:
            diagnostics.add(
                SelectionDiagnostic(
                    code="conflicting_variant",
                    event_id=event_id,
                    related_event_id=None,
                    kind="conflict",
                    record_ids=record_ids,
                )
            )

    selected.sort(key=lambda event: (event.sequence, event.event_id))
    position_by_event_id = {
        event.event_id: position for position, event in enumerate(selected)
    }
    for position, event in enumerate(selected):
        for predecessor in set(event.caused_by):
            predecessor_position = position_by_event_id.get(predecessor)
            if predecessor_position is None:
                diagnostics.add(
                    SelectionDiagnostic(
                        code="missing_predecessor",
                        event_id=event.event_id,
                        related_event_id=predecessor,
                        kind="missing",
                    )
                )
            elif predecessor_position >= position:
                diagnostics.add(
                    SelectionDiagnostic(
                        code="missing_predecessor",
                        event_id=event.event_id,
                        related_event_id=predecessor,
                        kind="forward",
                    )
                )

    return SelectionResult(
        events=tuple(selected),
        diagnostics=tuple(sorted(diagnostics, key=_diagnostic_key)),
    )


def reduce_ghost_snapshot(
    events: Sequence[AppEvent], mansion_id: str, ghost_id: str
) -> GhostSnapshot:
    """Select and reduce one ghost without observing foreign scopes."""

    selection = select_events(events)
    return _reduce_selected_snapshot(selection.events, mansion_id, ghost_id)


def reduce_ghost_snapshots(events: Sequence[AppEvent]) -> tuple[GhostSnapshot, ...]:
    """Select and reduce every mansion/ghost pair present in the events."""

    selection = select_events(events)
    identities = sorted(
        {(event.scope.mansion_id, event.scope.ghost_id) for event in selection.events}
    )
    return tuple(
        _reduce_selected_snapshot(selection.events, mansion_id, ghost_id)
        for mansion_id, ghost_id in identities
    )


def derive_ghost_transitions(
    events: Sequence[AppEvent],
) -> tuple[GhostTransition, ...]:
    """Derive snapshot changes in canonical order without persisting them."""

    selected = select_events(events).events
    prefix: list[AppEvent] = []
    transitions: list[GhostTransition] = []
    for event in selected:
        mansion_id = event.scope.mansion_id
        ghost_id = event.scope.ghost_id
        before = _reduce_selected_snapshot(prefix, mansion_id, ghost_id)
        prefix.append(event)
        after = _reduce_selected_snapshot(prefix, mansion_id, ghost_id)
        if before == after:
            continue
        transitions.append(
            GhostTransition(
                transition_id=ghost_transition_id(
                    event.event_id, mansion_id, ghost_id, after.state
                ),
                causing_event_id=event.event_id,
                causing_sequence=event.sequence,
                mansion_id=mansion_id,
                ghost_id=ghost_id,
                from_state=before.state,
                to_state=after.state,
            )
        )
    return tuple(transitions)


def ghost_transition_id(
    causing_event_id: str,
    mansion_id: str,
    ghost_id: str,
    destination_state: GhostState,
) -> str:
    """Identify a derived transition from its cause, ghost, and destination."""

    identity: JSONValue = [
        causing_event_id,
        mansion_id,
        ghost_id,
        destination_state,
    ]
    return "t1:" + hashlib.sha256(canonical_json(identity)).hexdigest()


def fold_ghost_events(events: Sequence[AppEvent]) -> ProjectionResult:
    """Return selection, final snapshots, and derived transitions together."""

    selection = select_events(events)
    identities = sorted(
        {(event.scope.mansion_id, event.scope.ghost_id) for event in selection.events}
    )
    snapshots = tuple(
        _reduce_selected_snapshot(selection.events, mansion_id, ghost_id)
        for mansion_id, ghost_id in identities
    )
    transitions = _derive_selected_transitions(selection.events)
    return ProjectionResult(
        selection=selection,
        snapshots=snapshots,
        transitions=transitions,
    )


def _derive_selected_transitions(
    selected: Sequence[AppEvent],
) -> tuple[GhostTransition, ...]:
    prefix: list[AppEvent] = []
    transitions: list[GhostTransition] = []
    for event in selected:
        mansion_id = event.scope.mansion_id
        ghost_id = event.scope.ghost_id
        before = _reduce_selected_snapshot(prefix, mansion_id, ghost_id)
        prefix.append(event)
        after = _reduce_selected_snapshot(prefix, mansion_id, ghost_id)
        if before != after:
            transitions.append(
                GhostTransition(
                    transition_id=ghost_transition_id(
                        event.event_id, mansion_id, ghost_id, after.state
                    ),
                    causing_event_id=event.event_id,
                    causing_sequence=event.sequence,
                    mansion_id=mansion_id,
                    ghost_id=ghost_id,
                    from_state=before.state,
                    to_state=after.state,
                )
            )
    return tuple(transitions)


def _reduce_selected_snapshot(
    selected: Sequence[AppEvent], mansion_id: str, ghost_id: str
) -> GhostSnapshot:
    scoped = [
        event
        for event in selected
        if event.scope.mansion_id == mansion_id and event.scope.ghost_id == ghost_id
    ]
    starts = [event for event in scoped if event.event_type == "run_started"]
    if not starts:
        return GhostSnapshot(
            mansion_id=mansion_id,
            ghost_id=ghost_id,
            run_id=None,
            run_sequence=None,
            state="idle",
            pending_approvals=(),
            open_tools=(),
            latest_event_id=None,
            latest_sequence=0,
            reason=None,
        )

    selected_start = max(
        starts,
        key=lambda event: (
            event.scope.run_sequence,
            event.scope.run_id,
            event.sequence,
            event.event_id,
        ),
    )
    run_events = [
        event
        for event in scoped
        if event.scope.run_sequence == selected_start.scope.run_sequence
        and event.scope.run_id == selected_start.scope.run_id
        and event.scope.session_slot == selected_start.scope.session_slot
    ]

    requested = {
        approval_id
        for event in run_events
        if event.event_type == "approval_requested"
        if (approval_id := _payload_string(event, "mid")) is not None
    }
    decided = {
        approval_id
        for event in run_events
        if event.event_type == "approval_decided"
        if (approval_id := _payload_string(event, "mid")) is not None
    }
    pending_approvals = tuple(sorted(requested - decided))

    started_tools = {
        tool_id
        for event in run_events
        if event.event_type == "tool_started"
        if (tool_id := _payload_string(event, "tool_call_id")) is not None
    }
    finished_tools = {
        tool_id
        for event in run_events
        if event.event_type == "tool_finished"
        and _payload_boolean(event, "final") is True
        if (tool_id := _payload_string(event, "tool_call_id")) is not None
    }
    open_tools = tuple(sorted(started_tools - finished_tools))

    failed = [event for event in run_events if event.event_type == "run_failed"]
    blocked = [event for event in run_events if event.event_type == "run_blocked"]
    completed = [event for event in run_events if event.event_type == "run_completed"]

    state: GhostState
    reason_event: AppEvent | None
    if failed:
        state = "failed"
        reason_event = failed[-1]
    elif blocked:
        state = "blocked"
        reason_event = blocked[-1]
    elif completed:
        state = "done"
        reason_event = completed[-1]
    elif pending_approvals:
        state = "waiting"
        reason_event = next(
            (
                event
                for event in reversed(run_events)
                if event.event_type == "approval_requested"
                and _payload_string(event, "mid") in pending_approvals
            ),
            None,
        )
    else:
        state = "working"
        reason_event = next(
            (
                event
                for event in reversed(run_events)
                if event.event_type in ("ghost_progressed", "run_started")
            ),
            selected_start,
        )

    latest = run_events[-1]
    return GhostSnapshot(
        mansion_id=mansion_id,
        ghost_id=ghost_id,
        run_id=selected_start.scope.run_id,
        run_sequence=selected_start.scope.run_sequence,
        state=state,
        pending_approvals=pending_approvals,
        open_tools=open_tools,
        latest_event_id=latest.event_id,
        latest_sequence=latest.sequence,
        reason=_payload_string(reason_event, "reason") if reason_event else None,
    )


def _json_information_units(value: JSONValue) -> int:
    if value is None:
        return 0
    if type(value) is str:
        return 1 if cast(str, value) else 0
    if type(value) in (bool, int, float):
        return 1
    if type(value) is list:
        return sum(_json_information_units(item) for item in value)
    return sum(
        _json_information_units(item)
        for item in cast(dict[str, JSONValue], value).values()
    )


def _payload_string(event: AppEvent | None, field: str) -> str | None:
    if event is None or type(event.payload) is not dict:
        return None
    value = cast(dict[str, JSONValue], event.payload).get(field)
    return value if type(value) is str and value else None


def _payload_boolean(event: AppEvent, field: str) -> bool | None:
    if type(event.payload) is not dict:
        return None
    value = cast(dict[str, JSONValue], event.payload).get(field)
    return value if type(value) is bool else None


def _duplicate_choice_key(event: AppEvent) -> tuple[int, str, bytes]:
    return (event.sequence, event.event_id, canonical_json(app_event_to_dict(event)))


def _diagnostic_key(
    diagnostic: SelectionDiagnostic,
) -> tuple[str, str, str, str, tuple[str, ...]]:
    return (
        diagnostic.code,
        diagnostic.event_id,
        diagnostic.related_event_id or "",
        diagnostic.kind,
        diagnostic.record_ids,
    )
