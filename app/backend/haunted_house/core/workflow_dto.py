"""The wire form of a WorkflowProjection (Spec 4, Requirements 8.1, 10.4).

One pure serializer produces the JSON the dashboard parses strictly
(``app/ui/src/core/workflow-projection.ts``) and the replay fold reproduces
(``app/ui/src/core/workflow-fold.ts``).  The workflow route and the replay
fixture builder both call it, so the live projection and the replayed one have
one shape.

The projection alone does not say which Ghost a session slot or a proposal
belongs to, nor the Sequence of a Door decision.  Those are read from the
scope and Sequence of the same acknowledged canonical records the projection
was folded from; nothing is recomputed, reordered, or re-validated here.

The result holds identifiers, enumerations, digests, clean relative paths,
counts, and structured Action_Descriptors only.  It never holds a document
body, credential, capability, tool input, tool output, or error text.

Pure: no filesystem, network, clock, or logging.
"""

from __future__ import annotations

from collections.abc import Iterable

from haunted_house.core.action_descriptor import descriptor_to_json
from haunted_house.core.approvals import RiskyProposal
from haunted_house.core.guardrail_events import OPERATOR_GHOST_ID, PHASES
from haunted_house.core.seance_event import AppEvent, JSONValue
from haunted_house.core.workflow import DoorProposal, WorkflowProjection

__all__ = ["WORKFLOW_SCHEMA_VERSION", "workflow_projection_to_json"]

WORKFLOW_SCHEMA_VERSION = 1


def workflow_projection_to_json(
    projection: WorkflowProjection,
    *,
    mansion_id: str,
    events: Iterable[AppEvent],
) -> dict[str, JSONValue]:
    """Serialize ``projection`` of ``mansion_id``.

    ``events`` are the acknowledged canonical records the projection was
    folded from.  Raises :class:`ValueError` when a record the projection
    refers to is not among them.
    """

    ordered = sorted(events, key=lambda event: (event.sequence, event.event_id))
    by_event_id: dict[str, AppEvent] = {}
    # The Ghost of a session slot: the scope of the first ghost record in it.
    slot_ghosts: dict[str, str] = {}
    for event in ordered:
        by_event_id.setdefault(event.event_id, event)
        if event.scope.ghost_id != OPERATOR_GHOST_ID:
            slot_ghosts.setdefault(event.scope.session_slot, event.scope.ghost_id)

    def record(event_id: str) -> AppEvent:
        found = by_event_id.get(event_id)
        if found is None:
            raise ValueError("projection refers to a record that was not supplied")
        return found

    def decision(outcome: str, actor: str, event_id: str) -> dict[str, JSONValue]:
        return {
            "outcome": outcome,
            "actor": actor,
            "event_id": event_id,
            "sequence": record(event_id).sequence,
        }

    def door_proposal(proposal: DoorProposal | None) -> JSONValue:
        if proposal is None:
            return None
        decided = proposal.decision_event_id
        return {
            "proposal_id": proposal.proposal_id,
            "phase": proposal.phase.value,
            "document_path": proposal.document_path,
            "artifact_revision": {
                "revision": proposal.artifact_revision.revision,
                "sha256": proposal.artifact_revision.sha256,
                "size_bytes": proposal.artifact_revision.size_bytes,
            },
            "status": proposal.status,
            "created_sequence": proposal.created_sequence,
            "decision": (
                None
                if decided is None or proposal.decision_actor is None
                else decision(proposal.status, proposal.decision_actor, decided)
            ),
        }

    def risky(proposal: RiskyProposal) -> dict[str, JSONValue]:
        descriptor = proposal.descriptor
        made = proposal.decision
        return {
            "proposal_id": proposal.proposal_id,
            "ghost_id": record(proposal.proposal_event_id).scope.ghost_id,
            "session_slot": proposal.session_slot,
            "room": None if descriptor is None else descriptor.room,
            "status": proposal.status.value,
            "action_digest": proposal.action_digest,
            # ``None`` marks a proposal whose descriptor cannot be shown exactly:
            # the dashboard keeps it visible, blocked, and unapprovable.
            "descriptor": None if descriptor is None else descriptor_to_json(descriptor),
            "created_sequence": proposal.created_sequence,
            "decision": (
                None if made is None else decision(made.outcome, made.actor, made.event_id)
            ),
        }

    phases: list[JSONValue] = []
    for phase in PHASES:
        view = projection.phases[phase]
        ghost = slot_ghosts.get(view.session_slot) if view.session_slot else None
        phases.append(
            {
                "phase": phase.value,
                "status": view.status.value,
                "ghost_ids": [] if ghost is None else [ghost],
                "door": {
                    "status": view.door.value,
                    "proposal": door_proposal(view.proposal),
                },
            }
        )

    return {
        "schema_version": WORKFLOW_SCHEMA_VERSION,
        "mansion_id": mansion_id,
        "version": projection.version,
        "integrity": projection.integrity,
        "waiting_count": projection.waiting_count,
        "phases": phases,
        "risky_proposals": [risky(item) for item in projection.risky_proposals.values()],
        "pending_permissions": [
            {
                "slot": slot,
                "mid": mid,
                "requested_sequence": requested,
                # Filled by the Session_Reconciler's correlation when the route
                # has one; the pure fold does not know them.
                "tool_name": None,
                "action_digest": None,
                "proposal_id": None,
            }
            for (slot, mid), requested in projection.pending_permissions.items()
        ],
    }
