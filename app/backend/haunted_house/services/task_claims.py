"""TaskClaimService: durable acquisition and release of Task_Claims.

Every claim fact is one ``room_ghosts`` candidate appended through the
``CanonicalRunPort`` with compare-and-append against the highest canonical
Sequence, so two racing acquisitions can never both be acknowledged as
valid: the loser re-reads, sees the winner's claim, and is refused.

A claim is released only after an acknowledged terminal outcome of its own
run (``run_completed``, ``run_failed``, or ``run_blocked``), and never after
``cancel_unconfirmed``: that claim is retained until the run is settled.  A
provisional claim whose session Crew never accepted is released against its
own acquisition record.  Release is idempotent: a released claim stays
released and no second record is written.

This service holds no state.  The ledger is always a fold of the canonical
read it just made.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from haunted_house.core.seance_event import AppEvent, EventScope
from haunted_house.core.task_claims import (
    ClaimLedger,
    TaskClaim,
    claim_id_for,
    decide_acquire,
    decide_release,
    fold_claims,
)
from haunted_house.services.canonical_port import CanonicalRunPort

__all__ = ["RETAINING_REASONS", "ClaimResult", "TaskClaimService", "release_outcome"]

_CAS_ATTEMPTS = 6
_TERMINALS = frozenset({"run_completed", "run_failed", "run_blocked"})
# A blocked run with one of these reasons keeps its claim.
RETAINING_REASONS = frozenset({"cancel_unconfirmed"})


@dataclass(frozen=True, slots=True)
class ClaimResult:
    ok: bool
    code: str
    claim: TaskClaim | None = None
    event: AppEvent | None = None
    duplicate: bool = False


def release_outcome(terminal: AppEvent) -> str | None:
    """The release outcome a terminal record allows, or ``None`` to retain."""

    reason = terminal.payload.get("reason") if type(terminal.payload) is dict else None
    code = terminal.payload.get("code") if type(terminal.payload) is dict else None
    if terminal.event_type == "run_completed":
        return "complete"
    if terminal.event_type == "run_failed":
        return "failed"
    if reason in RETAINING_REASONS or code in RETAINING_REASONS:
        return None
    return "cancelled" if "cancelled" in (reason, code) else "blocked"


class TaskClaimService:
    def __init__(self, port: CanonicalRunPort) -> None:
        self._port = port

    async def ledger(self, mansion_id: str) -> ClaimLedger:
        return fold_claims((await self._port.read(mansion_id)).events)

    async def acquire(
        self, scope: EventScope, task_id: str, paths: Iterable[str], attempt: int
    ) -> ClaimResult:
        """Acquire the claim of ``scope`` on ``task_id`` before its session starts."""

        wanted = tuple(paths) if not isinstance(paths, str) else (paths,)
        for _ in range(_CAS_ATTEMPTS):
            read = await self._port.read(scope.mansion_id)
            if not read.writable:
                return ClaimResult(False, "integrity_unavailable")
            ledger = fold_claims(read.events)
            if type(task_id) is str and type(attempt) is int:
                held = ledger.get(claim_id_for(scope, task_id, attempt))
                if held is not None:
                    same = held.active and held.paths == wanted
                    return ClaimResult(same, "ok" if same else "duplicate_claim", held, duplicate=same)
            decision = decide_acquire(ledger, scope, task_id, wanted, attempt)
            if not decision.ok or decision.candidate is None:
                return ClaimResult(False, decision.code)
            acknowledged = await self._port.compare_and_append(
                scope.mansion_id, read.projection.version, [decision.candidate]
            )
            if acknowledged.status == "conflict":
                continue  # another record won the Sequence: judge again
            if not acknowledged.ok:
                return ClaimResult(False, "writer_unavailable")
            # The acknowledgement alone is not the claim: fold what was read.
            after = fold_claims((await self._port.read(scope.mansion_id)).events)
            claim = after.get(decision.claim_id)
            if claim is None or not claim.active:
                return ClaimResult(False, "claim_busy")
            return ClaimResult(True, "ok", claim, acknowledged.events[0])
        return ClaimResult(False, "claim_busy")

    async def release(
        self, mansion_id: str, claim_id: str, terminal_record_id: str
    ) -> ClaimResult:
        """Release ``claim_id`` after the acknowledged terminal record of its run."""

        return await self._release(mansion_id, claim_id, terminal_record_id)

    async def release_provisional(self, mansion_id: str, claim_id: str) -> ClaimResult:
        """Release a claim whose session never started (a dispatch refusal).

        Refused once Crew produced any record for the run or the run has a
        terminal outcome: a started run is released only by that outcome.
        """

        return await self._release(mansion_id, claim_id, None)

    async def _release(
        self, mansion_id: str, claim_id: str, terminal_record_id: str | None
    ) -> ClaimResult:
        for _ in range(_CAS_ATTEMPTS):
            read = await self._port.read(mansion_id)
            if not read.writable:
                return ClaimResult(False, "integrity_unavailable")
            ledger = fold_claims(read.events)
            claim = ledger.get(claim_id)
            if claim is None:
                return ClaimResult(False, "claim_missing")
            if not claim.active:
                # Exactly once: the first release stands.
                return ClaimResult(True, "already_released", claim, duplicate=True)
            if terminal_record_id is None:
                scoped = [event for event in read.events if event.scope == claim.scope]
                if any(event.source.origin == "crew" for event in scoped):
                    # Crew ran the session: only its terminal outcome releases.
                    return ClaimResult(False, "run_started", claim)
                if any(event.event_type in _TERMINALS for event in scoped):
                    return ClaimResult(False, "terminal_recorded", claim)
                record_id, outcome = claim.acquired_record_id, "not_started"
            else:
                terminal = next(
                    (
                        event
                        for event in read.events
                        if event.record_id == terminal_record_id
                        and event.event_type in _TERMINALS
                        and event.source.origin == "house"
                        and event.scope == claim.scope
                    ),
                    None,
                )
                if terminal is None:
                    return ClaimResult(False, "terminal_not_acknowledged", claim)
                allowed = release_outcome(terminal)
                if allowed is None:
                    return ClaimResult(False, "claim_retained", claim)
                record_id, outcome = terminal.record_id, allowed
            decision = decide_release(ledger, claim_id, record_id, outcome)
            if not decision.ok or decision.candidate is None:
                return ClaimResult(False, decision.code, claim)
            acknowledged = await self._port.compare_and_append(
                mansion_id, read.projection.version, [decision.candidate]
            )
            if acknowledged.status == "conflict":
                continue
            if not acknowledged.ok:
                return ClaimResult(False, "writer_unavailable", claim)
            after = fold_claims((await self._port.read(mansion_id)).events)
            return ClaimResult(True, "ok", after.get(claim_id), acknowledged.events[0])
        return ClaimResult(False, "stale_version")
