"""Pure cancellation and explicit-retry rules for a Ghost_Run.

Two layers:

- the decisions the services ask (``cancel_refusal``, ``retry_refusal``,
  ``cancel_settlement``, ``releases_claim``, ``next_attempt``); and
- ``apply_recovery``, a small state machine over one task's or phase's
  attempts built from those same decisions, so the bounds can be checked
  over whole histories.

The rules (Requirement 12):

- A stop is requested at most once per run, and only while it is active.
- A confirmed cancellation blocks the run as ``cancelled`` and releases its
  claim exactly once; every earlier event of the run stays.
- An unconfirmed cancellation blocks the run as ``cancel_unconfirmed`` and
  retains the claim; such a run cannot be retried, because its session may
  still be writing.
- A retry is explicit, replaces only the newest attempt, takes a fresh slot
  and a greater Run_Sequence, and raises the attempt by exactly one.
- There is no fourth attempt, and nothing here retries on its own.

Pure: no I/O, no clock.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Literal

__all__ = [
    "CANCEL_CONFIRM_SECONDS",
    "CANCELLED",
    "CANCEL_UNCONFIRMED",
    "MAX_ATTEMPTS",
    "Attempt",
    "CancelTimedOut",
    "Complete",
    "ConfirmCancel",
    "Fail",
    "Observe",
    "RecoveryEvent",
    "RecoveryState",
    "RequestCancel",
    "Retry",
    "RunStatus",
    "RunView",
    "Start",
    "apply_recovery",
    "cancel_refusal",
    "cancel_settlement",
    "next_attempt",
    "releases_claim",
    "retry_refusal",
]

MAX_ATTEMPTS = 3
# Requirement 12.3: how long a stop may stay unconfirmed.
CANCEL_CONFIRM_SECONDS = 30
CANCELLED = "cancelled"
CANCEL_UNCONFIRMED = "cancel_unconfirmed"

RunStatus = Literal[
    "active", "completed", "failed", "blocked", "cancelled", "cancel_unconfirmed"
]
_RETRYABLE: frozenset[str] = frozenset({"failed", "blocked", "cancelled"})


@dataclass(frozen=True, slots=True)
class RunView:
    """What the canonical log says about one run."""

    status: RunStatus
    attempt: int
    cancel_requested: bool = False
    # The newest attempt of its task or phase: only that one is replaced.
    latest: bool = True


def cancel_refusal(view: RunView, *, enabled: bool) -> str | None:
    """Why a stop may not be sent now, or ``None`` when it may."""

    if not enabled:
        # RG-S3 is not verified live: no stop is ever sent.
        return "contract_unavailable"
    if view.status != "active":
        return "run_not_active"
    if view.cancel_requested:
        # A second stop would force-reset the session.
        return "cancel_pending"
    return None


def retry_refusal(view: RunView) -> str | None:
    """Why this run may not get a fresh attempt, or ``None`` when it may."""

    if view.status == "active":
        return "run_active"
    if view.status == "completed":
        return "run_already_done"
    if view.status == CANCEL_UNCONFIRMED:
        return CANCEL_UNCONFIRMED
    if view.status not in _RETRYABLE:
        return "invalid_state"
    if not view.latest:
        return "run_superseded"
    if type(view.attempt) is not int or view.attempt >= MAX_ATTEMPTS:
        return "attempt_limit"
    return None


def next_attempt(view: RunView) -> int:
    """The attempt number of the retry ``retry_refusal`` just allowed."""

    return view.attempt + 1


def cancel_settlement(confirmed: bool) -> str:
    """The blocked-run reason of a settled cancellation."""

    return CANCELLED if confirmed else CANCEL_UNCONFIRMED


def releases_claim(reason: str) -> bool:
    """Whether a blocked run with ``reason`` gives its claim back."""

    return reason != CANCEL_UNCONFIRMED


# --- the attempts of one task or phase ---------------------------------------------


@dataclass(frozen=True, slots=True)
class Attempt:
    attempt: int
    slot: str
    run_sequence: int
    status: RunStatus = "active"
    cancel_requested: bool = False
    claim: Literal["none", "held", "released"] = "none"
    # Times the claim was released: never more than one.
    releases: int = 0
    # Acknowledged events of the run, in order.  Only ever appended to.
    events: tuple[str, ...] = ()
    reason: str | None = None

    @property
    def view(self) -> RunView:
        return RunView(self.status, self.attempt, self.cancel_requested)


@dataclass(frozen=True, slots=True)
class RecoveryState:
    attempts: tuple[Attempt, ...] = ()
    stops_sent: int = 0

    @property
    def current(self) -> Attempt | None:
        return self.attempts[-1] if self.attempts else None


@dataclass(frozen=True, slots=True)
class Start:
    """The first attempt (a task attempt holds a claim)."""

    slot: str
    run_sequence: int
    with_claim: bool = False


@dataclass(frozen=True, slots=True)
class Observe:
    """One acknowledged tool or approval event of the current run."""

    event_id: str


@dataclass(frozen=True, slots=True)
class RequestCancel:
    enabled: bool = True


@dataclass(frozen=True, slots=True)
class ConfirmCancel:
    pass


@dataclass(frozen=True, slots=True)
class CancelTimedOut:
    pass


@dataclass(frozen=True, slots=True)
class Fail:
    code: str = "ghost_failed"


@dataclass(frozen=True, slots=True)
class Complete:
    pass


@dataclass(frozen=True, slots=True)
class Retry:
    """An explicit Operator retry with the fresh slot the house minted."""

    slot: str
    run_sequence: int


RecoveryEvent = (
    Start | Observe | RequestCancel | ConfirmCancel | CancelTimedOut | Fail | Complete | Retry
)


def _settle(attempt: Attempt, status: RunStatus, reason: str, *, release: bool) -> Attempt:
    released = release and attempt.claim == "held"
    return replace(
        attempt,
        status=status,
        reason=reason,
        claim="released" if released else attempt.claim,
        releases=attempt.releases + (1 if released else 0),
    )


def _replace_current(state: RecoveryState, attempt: Attempt, **changes: int) -> RecoveryState:
    return replace(state, attempts=(*state.attempts[:-1], attempt), **changes)


def apply_recovery(state: RecoveryState, event: RecoveryEvent) -> tuple[RecoveryState, str]:
    """Apply one event.  Returns the state and ``ok`` or the refusal code; a
    refused event leaves the state exactly as it was."""

    current = state.current
    if isinstance(event, Start):
        if current is not None:
            return state, "already_started"
        first = Attempt(1, event.slot, event.run_sequence, claim="held" if event.with_claim else "none")
        return replace(state, attempts=(first,)), "ok"
    if current is None:
        return state, "run_missing"

    if isinstance(event, Observe):
        if current.status != "active":
            return state, "run_not_active"
        return _replace_current(state, replace(current, events=(*current.events, event.event_id))), "ok"
    if isinstance(event, RequestCancel):
        refusal = cancel_refusal(current.view, enabled=event.enabled)
        if refusal is not None:
            return state, refusal
        return (
            _replace_current(
                state, replace(current, cancel_requested=True), stops_sent=state.stops_sent + 1
            ),
            "ok",
        )
    if isinstance(event, ConfirmCancel | CancelTimedOut):
        if current.status != "active" or not current.cancel_requested:
            return state, "cancel_not_requested"
        reason = cancel_settlement(isinstance(event, ConfirmCancel))
        status: RunStatus = "cancelled" if reason == CANCELLED else "cancel_unconfirmed"
        return _replace_current(state, _settle(current, status, reason, release=releases_claim(reason))), "ok"
    if isinstance(event, Fail | Complete):
        if current.status != "active":
            return state, "run_not_active"
        if isinstance(event, Complete):
            return _replace_current(state, _settle(current, "completed", "ready", release=True)), "ok"
        return _replace_current(state, _settle(current, "failed", event.code, release=True)), "ok"
    if isinstance(event, Retry):
        refusal = retry_refusal(current.view)
        if refusal is not None:
            return state, refusal
        if event.slot in {item.slot for item in state.attempts}:
            return state, "slot_not_fresh"
        if event.run_sequence <= max(item.run_sequence for item in state.attempts):
            return state, "run_sequence_not_greater"
        fresh = Attempt(
            next_attempt(current.view),
            event.slot,
            event.run_sequence,
            claim="held" if current.claim != "none" else "none",
        )
        return replace(state, attempts=(*state.attempts, fresh)), "ok"
    return state, "unsupported_event"
