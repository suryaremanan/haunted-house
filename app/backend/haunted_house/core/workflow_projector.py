"""Incremental and replay Spec 4 projections over canonical records.

Live and replay use one fold.  ``replay_projection`` folds a complete
canonical read; ``advance_projector`` folds further acknowledged records onto
a projection already held.  Both consume Spec 2's selected records, so they
see the same logical variants in the same Sequence order, and both yield the
same workflow, Door, waiting, proposal, approval, consumption, and outcome
state for the same history.

Integrity is Spec 2's verdict and is only carried: when a read reports a
malformed or broken log, the records supplied are its authoritative valid
prefix, and the projection is marked so that no decision is accepted on it.
Nothing here verifies a hash, repairs a log, or orders records by anything
but canonical Sequence.

Pure: no filesystem, network, clock, or logging.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, replace

from haunted_house.core.approvals import ProposalStatus
from haunted_house.core.ghost_state import select_events
from haunted_house.core.guardrail_events import PHASES
from haunted_house.core.seance_event import AppEvent, JSONValue
from haunted_house.core.workflow import (
    Integrity,
    WorkflowProjection,
    advance_workflow,
    fold_workflow,
    initial_workflow,
    observe_sequence,
)

__all__ = [
    "ProjectorState",
    "advance_projector",
    "empty_projector",
    "projection_summary",
    "replay_projection",
]


@dataclass(frozen=True, slots=True)
class ProjectorState:
    """A projection and the selected records it was folded from."""

    events: tuple[AppEvent, ...]
    projection: WorkflowProjection

    @property
    def version(self) -> int:
        return self.projection.version


def empty_projector(integrity: Integrity = "valid") -> ProjectorState:
    return ProjectorState((), initial_workflow(integrity))


def replay_projection(
    events: Iterable[AppEvent], *, integrity: Integrity = "valid"
) -> WorkflowProjection:
    """A fresh fold of one canonical read (the replay path)."""

    supplied = tuple(events)
    return observe_sequence(
        fold_workflow(select_events(supplied).events, integrity=integrity),
        max((event.sequence for event in supplied), default=0),
    )


def advance_projector(
    state: ProjectorState,
    events: Iterable[AppEvent],
    *,
    integrity: Integrity | None = None,
) -> ProjectorState:
    """Fold newly acknowledged records onto ``state`` (the live path).

    Records are appended in canonical order, so new records normally extend
    the fold.  When a new record is another variant of one already folded, or
    arrives below the version already held, Spec 2's selection may choose
    differently; the projection is then folded again from every record, so
    the result always equals ``replay_projection`` of the same history.
    """

    batch = tuple(events)
    wanted = state.projection.integrity if integrity is None else integrity
    if not batch:
        if wanted == state.projection.integrity:
            return state
        return ProjectorState(state.events, replace(state.projection, integrity=wanted))

    known_events = {event.event_id for event in state.events}
    known_records = {event.record_id for event in state.events}
    fresh = tuple(event for event in batch if event.record_id not in known_records)
    extends = (
        all(event.sequence > state.version for event in fresh)
        and len({event.event_id for event in fresh}) == len(fresh)
        and not any(event.event_id in known_events for event in fresh)
    )
    highest = max(state.version, *(event.sequence for event in batch))
    if not extends:
        selected = tuple(select_events((*state.events, *batch)).events)
        return ProjectorState(
            selected, observe_sequence(fold_workflow(selected, integrity=wanted), highest)
        )

    ordered = tuple(sorted(fresh, key=lambda event: (event.sequence, event.event_id)))
    base = (
        state.projection
        if wanted == state.projection.integrity
        else replace(state.projection, integrity=wanted)
    )
    return ProjectorState(
        (*state.events, *ordered), observe_sequence(advance_workflow(base, ordered), highest)
    )


def projection_summary(projection: WorkflowProjection) -> dict[str, JSONValue]:
    """Every Spec 4 state a replay must reproduce, as plain comparable data."""

    phases: list[JSONValue] = []
    for phase in PHASES:
        view = projection.phases[phase]
        proposal = view.proposal
        phases.append(
            {
                "phase": phase.value,
                "status": view.status.value,
                "door": view.door.value,
                "session_slot": view.session_slot,
                "proposal": None
                if proposal is None
                else {
                    "proposal_id": proposal.proposal_id,
                    "status": proposal.status,
                    "document_path": proposal.document_path,
                    "revision": proposal.artifact_revision.revision,
                    "sha256": proposal.artifact_revision.sha256,
                    "decision_event_id": proposal.decision_event_id,
                    "decision_actor": proposal.decision_actor,
                },
            }
        )
    proposals: list[JSONValue] = []
    for proposal_id in sorted(projection.risky_proposals):
        item = projection.risky_proposals[proposal_id]
        decision = item.decision
        proposals.append(
            {
                "proposal_id": item.proposal_id,
                "action_digest": item.action_digest,
                "status": item.status.value,
                "displayable": item.displayable,
                "approval": None
                if decision is None
                else {
                    "outcome": decision.outcome,
                    "actor": decision.actor,
                    "event_id": decision.event_id,
                    "sequence": decision.sequence,
                },
                "consumed": item.status
                in (ProposalStatus.CONSUMED, ProposalStatus.SUCCEEDED, ProposalStatus.FAILED),
                "claim_id": item.claim_id,
                "consumed_sequence": item.consumed_sequence,
                "outcome": item.outcome_code,
            }
        )
    return {
        "version": projection.version,
        "integrity": projection.integrity,
        "waiting_count": projection.waiting_count,
        "phases": phases,
        "risky_proposals": proposals,
        "pending_permissions": [
            {"slot": slot, "mid": mid, "sequence": projection.pending_permissions[(slot, mid)]}
            for slot, mid in sorted(projection.pending_permissions)
        ],
    }
