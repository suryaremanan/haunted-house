"""Property 12 for cancellation and explicit retry (task 7.5).

Feature: room-ghosts, Property 12: Cancellation and retry stay bounded

Validates: Requirements 12.1, 12.2, 12.3, 12.5, 12.6, 12.8.
"""

from __future__ import annotations

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from haunted_house.core.run_recovery import (
    MAX_ATTEMPTS,
    CancelTimedOut,
    Complete,
    ConfirmCancel,
    Fail,
    Observe,
    RecoveryState,
    RequestCancel,
    Retry,
    RunView,
    Start,
    apply_recovery,
    cancel_refusal,
    retry_refusal,
)

pytestmark = pytest.mark.core

# One step of a history.  A retry always offers a fresh slot and a greater
# Run_Sequence unless the step says otherwise ("stale" reuses the old ones).
STEP = st.sampled_from(
    [
        "observe", "cancel", "cancel_disabled", "confirm", "timeout", "fail", "complete",
        "retry", "retry", "retry_stale",
    ]
)


@settings(max_examples=300)
@given(steps=st.lists(STEP, max_size=40), with_claim=st.booleans())
def test_cancellation_and_retry_stay_bounded(steps: list[str], with_claim: bool) -> None:
    # Feature: room-ghosts, Property 12: Cancellation and retry stay bounded
    state, code = apply_recovery(RecoveryState(), Start("slot-1", 1, with_claim=with_claim))
    assert code == "ok"
    minted = 1
    observed = 0

    for step in steps:
        before = state
        current = before.current
        assert current is not None
        if step == "observe":
            observed += 1
            state, code = apply_recovery(state, Observe(f"e1:{observed:04d}"))
            assert (code == "ok") == (current.status == "active")
        elif step in ("cancel", "cancel_disabled"):
            enabled = step == "cancel"
            state, code = apply_recovery(state, RequestCancel(enabled=enabled))
            allowed = enabled and current.status == "active" and not current.cancel_requested
            assert (code == "ok") == allowed
            assert code == (cancel_refusal(current.view, enabled=enabled) or "ok")
            # Exactly one stop per accepted request, none for a refused one.
            assert state.stops_sent == before.stops_sent + (1 if allowed else 0)
            if not enabled:
                assert code == "contract_unavailable"
        elif step in ("confirm", "timeout"):
            event = ConfirmCancel() if step == "confirm" else CancelTimedOut()
            state, code = apply_recovery(state, event)
            pending = current.status == "active" and current.cancel_requested
            assert (code == "ok") == pending
            if pending:
                settled = state.current
                assert settled is not None
                # Every earlier event of the run is still there.
                assert settled.events == current.events
                if step == "confirm":
                    assert (settled.status, settled.reason) == ("cancelled", "cancelled")
                    assert settled.claim == ("released" if with_claim else "none")
                    assert settled.releases == (1 if with_claim else 0)
                else:
                    assert (settled.status, settled.reason) == ("cancel_unconfirmed", "cancel_unconfirmed")
                    # The session may still be writing: the claim stays held.
                    assert settled.claim == current.claim and settled.releases == 0
        elif step in ("fail", "complete"):
            state, code = apply_recovery(state, Fail() if step == "fail" else Complete())
            assert (code == "ok") == (current.status == "active")
        else:
            stale = step == "retry_stale"
            slot = current.slot if stale else f"slot-{minted + 1}"
            sequence = current.run_sequence if stale else minted + 1
            state, code = apply_recovery(state, Retry(slot, sequence))
            permitted = (
                current.status in ("failed", "blocked", "cancelled")
                and current.attempt < MAX_ATTEMPTS
            )
            assert (code == "ok") == (permitted and not stale)
            if permitted:
                assert retry_refusal(current.view) is None
            if code == "ok":
                minted += 1
                fresh = state.current
                assert fresh is not None
                # One fresh slot, one greater Run_Sequence, attempt + 1, nothing else.
                assert len(state.attempts) == len(before.attempts) + 1
                assert fresh.attempt == current.attempt + 1
                assert fresh.slot not in {item.slot for item in before.attempts}
                assert fresh.run_sequence > max(item.run_sequence for item in before.attempts)
                assert fresh.status == "active" and fresh.events == ()
                # Every prior attempt is preserved exactly.
                assert state.attempts[:-1] == before.attempts
            else:
                assert state == before
        if code != "ok":
            # A refusal changes nothing.
            assert state == before

        # Invariants of every reachable history.
        assert 1 <= len(state.attempts) <= MAX_ATTEMPTS
        assert [item.attempt for item in state.attempts] == list(range(1, len(state.attempts) + 1))
        assert len({item.slot for item in state.attempts}) == len(state.attempts)
        sequences = [item.run_sequence for item in state.attempts]
        assert sequences == sorted(set(sequences))
        for item in state.attempts:
            assert item.releases <= 1
            assert (item.claim == "released") == (item.releases == 1)
            if item.status == "cancel_unconfirmed":
                assert item.releases == 0
        # Only the newest attempt may still be running.
        assert all(item.status != "active" for item in state.attempts[:-1])
        # A stop is sent at most once per attempt.
        assert state.stops_sent <= len(state.attempts)


def test_no_fourth_attempt_and_no_retry_of_an_unsettled_cancellation() -> None:
    assert retry_refusal(RunView("failed", MAX_ATTEMPTS)) == "attempt_limit"
    assert retry_refusal(RunView("cancel_unconfirmed", 1)) == "cancel_unconfirmed"
    assert retry_refusal(RunView("active", 1)) == "run_active"
    assert retry_refusal(RunView("completed", 1)) == "run_already_done"
    assert retry_refusal(RunView("failed", 1, latest=False)) == "run_superseded"
    assert retry_refusal(RunView("cancelled", 2)) is None
    assert cancel_refusal(RunView("active", 1), enabled=False) == "contract_unavailable"
    assert cancel_refusal(RunView("active", 1, cancel_requested=True), enabled=True) == "cancel_pending"
    assert cancel_refusal(RunView("failed", 1), enabled=True) == "run_not_active"
