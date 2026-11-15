"""Spec 4's only path to the canonical log: the Spec 2 writer port.

``GuardrailPort`` wraps an injected ``CanonicalEventWriter``.  It exposes
candidate append, compare-and-append, and a canonical read that is folded
into the workflow projection.  It holds no log location, file handle,
Sequence counter, or hash state, and it constructs no canonical record:
everything it returns was acknowledged by the writer.

Reads take Spec 2's selected records (``select_events``) so the Spec 4 fold
sees the same logical variants and order as every other consumer, then
filter and validate the ``doors_and_guardrails`` payloads before folding.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from haunted_house.core.ghost_state import select_events
from haunted_house.core.guardrail_events import (
    DOMAIN,
    EVENT_TYPE,
    SOURCE_TYPE,
    DomainSelection,
    PayloadDiagnostic,
    select_domain_records,
    validate_payload,
)
from haunted_house.core.seance_event import AppEvent, AppEventCandidate
from haunted_house.core.seance_persistence import (
    MAX_READ_LIMIT,
    CanonicalEventWriter,
    WriterStatus,
)
from haunted_house.core.workflow import (
    Integrity,
    WorkflowProjection,
    fold_workflow,
    observe_sequence,
)

__all__ = ["GuardrailAck", "GuardrailPort", "GuardrailRead"]

_MAX_PAGES = 10_000


@dataclass(frozen=True, slots=True)
class GuardrailRead:
    """The canonical records Spec 2 vouches for, and Spec 4's view of them."""

    status: WriterStatus
    integrity: Integrity
    events: tuple[AppEvent, ...]
    domain: DomainSelection
    highest_sequence: int
    projection: WorkflowProjection

    @property
    def writable(self) -> bool:
        return self.integrity == "valid"


@dataclass(frozen=True, slots=True)
class GuardrailAck:
    """A writer acknowledgement, or a refusal that persisted nothing."""

    status: str
    events: tuple[AppEvent, ...] = ()
    highest_sequence: int = 0
    code: str | None = None

    @property
    def ok(self) -> bool:
        return self.status == "ok"


class GuardrailPort:
    def __init__(self, writer: CanonicalEventWriter, *, page_limit: int = MAX_READ_LIMIT) -> None:
        self._writer = writer
        self._page_limit = max(1, min(int(page_limit), MAX_READ_LIMIT))

    async def read(self, mansion_id: str) -> GuardrailRead:
        """Read every page and fold the authoritative records."""

        events: list[AppEvent] = []
        status: WriterStatus = "ok"
        clean = True
        highest = 0
        after = 0
        for _ in range(_MAX_PAGES):
            page = await self._writer.read_after(mansion_id, after, self._page_limit)
            status = page.status
            if page.status == "log_not_found":
                # The Mansion exists and nothing has been recorded yet.
                status = "ok"
                break
            if page.status not in ("ok", "invalid_log"):
                clean = False
                break
            clean = clean and page.integrity_ok
            highest = page.highest_sequence
            events.extend(page.events)
            if not page.events or page.events[-1].sequence >= page.highest_sequence:
                break
            after = page.events[-1].sequence
        else:
            clean = False

        if status == "ok" and clean:
            integrity: Integrity = "valid"
        elif status == "invalid_log":
            integrity = "corrupt"
        else:
            integrity = "uncertain"

        selected = select_events(events).events
        domain = select_domain_records(selected)
        # The version is the highest Sequence read, including a record whose
        # logical variant Spec 2's selection did not choose.
        projection = observe_sequence(
            fold_workflow(selected, integrity=integrity),
            max([highest, *(event.sequence for event in events)], default=0),
        )
        return GuardrailRead(
            status=status,
            integrity=integrity,
            events=tuple(selected),
            domain=domain,
            highest_sequence=max(highest, domain.highest_sequence),
            projection=projection,
        )

    async def projection(self, mansion_id: str) -> WorkflowProjection:
        return (await self.read(mansion_id)).projection

    async def append(
        self, mansion_id: str, candidates: Sequence[AppEventCandidate]
    ) -> GuardrailAck:
        return await self._submit(mansion_id, candidates, None)

    async def compare_and_append(
        self,
        mansion_id: str,
        expected_sequence: int,
        candidates: Sequence[AppEventCandidate],
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
            if not _is_guardrail_candidate(candidate, mansion_id):
                return GuardrailAck("refused", code="not_a_guardrail_candidate")
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


def _is_guardrail_candidate(candidate: object, mansion_id: str) -> bool:
    if not isinstance(candidate, AppEventCandidate):
        return False
    payload = candidate.payload
    return (
        candidate.event_type == EVENT_TYPE
        and candidate.scope.mansion_id == mansion_id
        and candidate.source.origin == "house"
        and candidate.source.source_type == SOURCE_TYPE
        and type(payload) is dict
        and payload.get("domain") == DOMAIN
        and not isinstance(validate_payload(payload), PayloadDiagnostic)
    )
