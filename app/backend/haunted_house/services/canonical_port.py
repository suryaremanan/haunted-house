"""CanonicalRunPort: Room Ghosts' only path to the canonical log.

A narrow port over the injected Spec 2 ``CanonicalEventWriter``.  It can
submit two kinds of house-origin candidates: run facts (``run_started``,
``ghost_progressed``, ``run_completed``, ``run_blocked``, ``run_failed``)
and ``room_ghosts`` domain facts.  It refuses everything else, so a raw Crew
envelope, a Crew-origin candidate, or another spec's domain record can never
be written from here.

It holds no log location, file handle, Sequence counter, or hash state and
constructs no canonical record.  Reads reuse the Spec 4 ``GuardrailPort``
read, so Room Ghosts sees exactly the records Spec 2's selection chose and
the workflow projection Spec 4 folds from them.
"""

from __future__ import annotations

from collections.abc import Sequence

from haunted_house.adapters.guardrail_port import GuardrailAck, GuardrailPort, GuardrailRead
from haunted_house.core.ghost_state import GhostSnapshot, reduce_ghost_snapshot
from haunted_house.core.room_ghost_events import is_room_ghost_candidate
from haunted_house.core.seance_event import AppEventCandidate
from haunted_house.core.seance_persistence import CanonicalEventWriter

__all__ = ["RUN_EVENT_TYPES", "RUN_SOURCE_TYPES", "CanonicalRunPort", "is_run_candidate"]

RUN_EVENT_TYPES = frozenset(
    {"run_started", "ghost_progressed", "run_completed", "run_blocked", "run_failed"}
)
# ``run`` registers a run (Spec 4 uses it); the others are Room Ghosts facts.
RUN_SOURCE_TYPES = frozenset({"run", "run_terminal", "run_progress"})


def is_run_candidate(candidate: object, mansion_id: str) -> bool:
    return (
        isinstance(candidate, AppEventCandidate)
        and candidate.event_type in RUN_EVENT_TYPES
        and candidate.scope.mansion_id == mansion_id
        and candidate.source.origin == "house"
        and candidate.source.source_type in RUN_SOURCE_TYPES
        and type(candidate.payload) is dict
    )


class CanonicalRunPort:
    def __init__(self, writer: CanonicalEventWriter) -> None:
        self._writer = writer
        self._reader = GuardrailPort(writer)

    async def read(self, mansion_id: str) -> GuardrailRead:
        """Every authoritative record, selected by Spec 2 and folded by Spec 4."""

        return await self._reader.read(mansion_id)

    async def ghost_snapshot(self, mansion_id: str, ghost_id: str) -> GhostSnapshot:
        read = await self._reader.read(mansion_id)
        return reduce_ghost_snapshot(read.events, mansion_id, ghost_id)

    async def append(
        self, mansion_id: str, candidates: Sequence[AppEventCandidate]
    ) -> GuardrailAck:
        return await self._submit(mansion_id, candidates, None)

    async def compare_and_append(
        self, mansion_id: str, expected_sequence: int, candidates: Sequence[AppEventCandidate]
    ) -> GuardrailAck:
        return await self._submit(mansion_id, candidates, expected_sequence)

    async def _submit(
        self,
        mansion_id: str,
        candidates: Sequence[AppEventCandidate],
        expected_sequence: int | None,
    ) -> GuardrailAck:
        batch = tuple(candidates)
        if not batch:
            return GuardrailAck("refused", code="empty_batch")
        for candidate in batch:
            if not (
                is_room_ghost_candidate(candidate, mansion_id)
                or is_run_candidate(candidate, mansion_id)
            ):
                return GuardrailAck("refused", code="not_a_room_ghost_candidate")
        if expected_sequence is None:
            result = await self._writer.append_candidates(mansion_id, batch)
        else:
            result = await self._writer.compare_and_append(mansion_id, expected_sequence, batch)
        if result.status != "ok":
            return GuardrailAck(
                result.status, highest_sequence=result.highest_sequence, code=result.status
            )
        if len(result.events) != len(batch):
            return GuardrailAck("failed", highest_sequence=result.highest_sequence, code="short_ack")
        return GuardrailAck("ok", tuple(result.events), result.highest_sequence)
