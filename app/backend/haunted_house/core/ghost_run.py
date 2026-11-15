"""GhostRunBinding: the trusted identity of one Ghost_Run.

It joins the Spec 4 session binding (Mansion, spec, phase, Ghost, slot) with
the Spec 2 Event_Scope (run identifier and Run_Sequence) and the Room Ghosts
facts a run carries: its attempt, its Selected_Task and Task_Claim when it
is a Tinker run, and the digests of the approved upstream artifacts it was
started from.  Every field is set by the house; none is model input.

Pure: no I/O.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from types import MappingProxyType

from haunted_house.core.ghost_result import GhostIdentity
from haunted_house.core.guardrail_events import Phase
from haunted_house.core.seance_event import EventScope

__all__ = ["GhostRunBinding"]


@dataclass(frozen=True, slots=True)
class GhostRunBinding:
    run_id: str
    run_sequence: int
    mansion_id: str
    spec_name: str
    phase: Phase
    ghost_name: str
    slot: str
    attempt: int = 1
    task_id: str | None = None
    claim_id: str | None = None
    # Mansion-relative path -> SHA-256 of the approved upstream artifact.
    upstream_hashes: Mapping[str, str] = field(default_factory=lambda: MappingProxyType({}))

    @property
    def scope(self) -> EventScope:
        return EventScope(
            mansion_id=self.mansion_id,
            ghost_id=self.ghost_name,
            session_slot=self.slot,
            run_id=self.run_id,
            run_sequence=self.run_sequence,
        )

    @property
    def identity(self) -> GhostIdentity:
        """What the run's Ghost_Result must name."""

        return GhostIdentity(run_id=self.run_id, task_id=self.task_id)

    @property
    def is_task_run(self) -> bool:
        return self.phase is Phase.IMPLEMENTATION and self.task_id is not None
