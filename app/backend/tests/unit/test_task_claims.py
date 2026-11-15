"""Task_Claim models, canonical candidates, and the claim ledger (task 6.1).

Validates: Requirements 7.6, 8.2, 8.4, 8.5, 8.8, 9.3.
"""

from __future__ import annotations

import pytest

from haunted_house.core.guardrail_events import select_domain_records
from haunted_house.core.path_policy import Access
from haunted_house.core.room_ghost_events import (
    DOMAIN,
    RoomGhostEventKind,
    RoomGhostPayloadError,
    build_room_ghost_candidate,
    is_room_ghost_candidate,
    select_room_ghost_records,
)
from haunted_house.core.seance_event import AppEventCandidate, EventSource
from haunted_house.core.task_claims import (
    MAX_ACTIVE_CLAIMS,
    ClaimState,
    acquire_candidate,
    authorize_claim_access,
    claim_id_for,
    claims_may_overlap,
    decide_acquire,
    decide_release,
    empty_ledger,
    fold_claims,
)
from haunted_house.core.workflow import fold_workflow, initial_workflow
from tests.room_ghost_runtime_support import MANSION, acknowledge, tinker_scope

pytestmark = pytest.mark.core

S1, S2, S3, S4 = (tinker_scope(seat) for seat in (1, 2, 3, 4))
TERMINAL = "r1:" + "ab" * 32


def _acquired(scope, task_id, paths, *, after=0, attempt=1):
    return acknowledge([acquire_candidate(scope, task_id, paths, attempt)], after=after)[0]


def test_acquisition_is_a_house_origin_room_ghosts_record() -> None:
    candidate = acquire_candidate(S1, "2.1", ("src/a/**", "src/b.py"), 1)
    assert candidate.event_type == "domain_event_recorded"
    assert candidate.scope == S1 and candidate.source.origin == "house"
    assert candidate.payload["domain"] == DOMAIN
    assert candidate.payload["entity_id"] == claim_id_for(S1, "2.1", 1)
    assert is_room_ghost_candidate(candidate, MANSION)
    assert not is_room_ghost_candidate(candidate, "other-mansion")
    # An exact retry is the same record; another attempt is another claim.
    assert acquire_candidate(S1, "2.1", ("src/a/**", "src/b.py"), 1) == candidate
    assert claim_id_for(S1, "2.1", 2) != claim_id_for(S1, "2.1", 1)
    assert claim_id_for(S2, "2.1", 1) != claim_id_for(S1, "2.1", 1)


@pytest.mark.parametrize(
    "task_id, paths, attempt",
    [
        ("2", ("src/a.py",), 1),
        ("2.1", (), 1),
        ("2.1", ("../outside.py",), 1),
        ("2.1", ("/etc/passwd",), 1),
        ("2.1", ("src/a.py", "src/a.py"), 1),
        ("2.1", ("src/a.py",), 0),
        ("2.1", ("src/a.py",), 4),
        ("2.1", "src/a.py", 1),
        ("2.1", tuple(f"src/f{n}.py" for n in range(33)), 1),
    ],
)
def test_malformed_claims_are_refused(task_id, paths, attempt) -> None:
    with pytest.raises(RoomGhostPayloadError):
        acquire_candidate(S1, task_id, paths, attempt)
    assert decide_acquire(empty_ledger(), S1, task_id, paths, attempt).code == "invalid_claim"


def test_unknown_or_extra_fields_are_refused() -> None:
    good = {"claim_id": "c", "task_id": "2.1", "paths": ["a.py"], "attempt": 1}
    for data in (
        {**good, "approval": True},
        {key: value for key, value in good.items() if key != "attempt"},
    ):
        with pytest.raises(RoomGhostPayloadError):
            build_room_ghost_candidate(S1, RoomGhostEventKind.TASK_CLAIM_ACQUIRED, data)


def test_ledger_folds_acquire_then_release() -> None:
    first = _acquired(S1, "2.1", ("src/a/**",))
    ledger = fold_claims([first])
    claim = ledger.active_for_scope(S1)
    assert claim is not None and claim.state is ClaimState.ACTIVE
    assert (claim.run_id, claim.task_id, claim.paths) == ("implementation-1", "2.1", ("src/a/**",))
    assert claim.acquired_record_id == first.record_id and claim.scope == S1
    assert ledger.active_for_task("2.1") == claim

    decision = decide_release(ledger, claim.claim_id, TERMINAL, "complete")
    assert decision.ok
    released = acknowledge([decision.candidate], after=1)[0]
    after = fold_claims([released, first])  # input order does not matter
    assert after.active == () and after.active_for_scope(S1) is None
    assert after.get(claim.claim_id).state is ClaimState.RELEASED
    assert after.get(claim.claim_id).released_record_id == released.record_id
    # Released exactly once: a second release is refused and folds to nothing.
    assert decide_release(after, claim.claim_id, TERMINAL, "complete").code == "already_released"
    again = acknowledge([decision.candidate], after=2)[0]
    assert fold_claims([first, released, again]).get(claim.claim_id) == after.get(claim.claim_id)


def test_conflicting_acquisitions_are_refused_and_fold_to_nothing() -> None:
    first = _acquired(S1, "2.1", ("src/a/**",))
    ledger = fold_claims([first])
    assert decide_acquire(ledger, S2, "2.2", ("src/a/x.py",), 1).code == "claim_overlap"
    assert decide_acquire(ledger, S2, "2.2", ("weird/[ab].py",), 1).code == "claim_overlap"
    assert decide_acquire(ledger, S2, "2.1", ("lib/x.py",), 1).code == "task_claimed"
    assert decide_acquire(ledger, S1, "2.3", ("lib/x.py",), 1).code == "run_has_claim"
    assert decide_acquire(ledger, S2, "2.2", ("lib/x.py",), 1).ok

    # Two racing acquisitions both reach the log: only the first holds.
    racing = _acquired(S2, "2.2", ("src/a/x.py",), after=1)
    folded = fold_claims([first, racing])
    assert [claim.task_id for claim in folded.active] == ["2.1"]
    assert [item.code for item in folded.diagnostics] == ["claim_overlap"]


def test_at_most_three_active_claims() -> None:
    events = [
        _acquired(scope, f"3.{index}", (f"src/t{index}/**",), after=index)
        for index, scope in enumerate((S1, S2, S3), start=1)
    ]
    ledger = fold_claims(events)
    assert len(ledger.active) == MAX_ACTIVE_CLAIMS
    assert decide_acquire(ledger, S4, "3.9", ("src/t9/**",), 1).code == "workshop_full"


def test_release_must_name_the_claim_task_and_terminal() -> None:
    first = _acquired(S1, "2.1", ("src/a/**",))
    ledger = fold_claims([first])
    claim = ledger.active[0]
    assert decide_release(ledger, "claim-unknown", TERMINAL, "complete").code == "claim_missing"
    assert decide_release(ledger, claim.claim_id, "not-a-record", "complete").code == "invalid_release"
    assert decide_release(ledger, claim.claim_id, TERMINAL, "approved").code == "invalid_release"
    # A provisional claim (Crew never took the session) names its acquisition.
    assert decide_release(ledger, claim.claim_id, TERMINAL, "not_started").code == "terminal_mismatch"
    assert decide_release(ledger, claim.claim_id, first.record_id, "complete").code == "terminal_mismatch"
    assert decide_release(ledger, claim.claim_id, first.record_id, "not_started").ok


def test_forged_records_never_enter_the_ledger() -> None:
    candidate = acquire_candidate(S1, "2.1", ("src/a/**",), 1)
    crew_made = AppEventCandidate(
        schema_version=1,
        event_type=candidate.event_type,
        scope=candidate.scope,
        source=EventSource("crew", "room_ghost", candidate.source.identity_parts, 0, "", 0),
        caused_by=(),
        occurred_at_ms=None,
        payload=candidate.payload,
    )
    other_claim = dict(candidate.payload, data=dict(candidate.payload["data"], claim_id="claim-x"),
                       entity_id="claim-x")
    wrong_identity = AppEventCandidate(
        1, candidate.event_type, candidate.scope, candidate.source, (), None, other_claim
    )
    events = acknowledge([crew_made, wrong_identity])
    ledger = fold_claims(events)
    assert ledger.active == ()
    assert sorted(item.code for item in ledger.diagnostics) == [
        "claim_identity_mismatch", "invalid_payload"
    ]
    assert select_room_ghost_records(events).invalid_sequences == (1,)


def test_claim_records_do_not_touch_the_spec_4_fold() -> None:
    first = _acquired(S1, "2.1", ("src/a/**",))
    assert select_domain_records([first]).records == ()
    projection = fold_workflow([first])
    assert projection.phases == initial_workflow().phases
    assert projection.diagnostics == () and projection.version == 1


def test_claim_access_only_narrows() -> None:
    ledger = fold_claims([_acquired(S1, "2.1", ("src/a/**", "src/b.py"))])
    claim = ledger.active[0]
    allowed = authorize_claim_access(ledger, S1, Access.WRITE, "src/a/deep/x.py")
    assert allowed.forward and allowed.claim == claim
    assert authorize_claim_access(ledger, S1, Access.WRITE, "src/b.py").forward
    for access in (Access.WRITE, Access.DELETE, Access.COMMAND_WRITE, Access.GIT_WRITE):
        assert authorize_claim_access(ledger, S1, access, "lib/x.py").code == "outside_task_claim"
        assert authorize_claim_access(ledger, S1, access, "../src/a/x.py").code == "outside_task_claim"
        assert authorize_claim_access(ledger, S1, access, None).code == "outside_task_claim"
    # A read needs the claim's identity, not a path inside it.
    for access in (Access.READ, Access.LIST, Access.COMMAND_READ):
        assert authorize_claim_access(ledger, S1, access, "lib/x.py").forward
        assert authorize_claim_access(ledger, S2, access, "src/a/x.py").code == "task_claim_required"
    # Another run, a forged identifier, and a released claim hold nothing.
    assert authorize_claim_access(ledger, S2, Access.WRITE, "src/a/x.py").code == "task_claim_required"
    assert (
        authorize_claim_access(ledger, S1, Access.WRITE, "src/a/x.py", claim_id="claim-x").code
        == "task_claim_mismatch"
    )
    assert authorize_claim_access(
        ledger, S1, Access.WRITE, "src/a/x.py", claim_id=claim.claim_id
    ).forward
    released = acknowledge([decide_release(ledger, claim.claim_id, TERMINAL, "failed").candidate], after=1)
    stale = fold_claims([*acknowledge([acquire_candidate(S1, "2.1", ("src/a/**", "src/b.py"), 1)]), *released])
    assert authorize_claim_access(stale, S1, Access.WRITE, "src/a/x.py").code == "task_claim_required"


def test_overlap_is_conservative() -> None:
    assert claims_may_overlap(("src/a/**",), ("src/a/b.py",))
    assert claims_may_overlap(("src/*.py",), ("src/main.py",))
    assert claims_may_overlap(("src/a.py",), ("SRC/A.py",))  # one file on a folding volume
    assert claims_may_overlap(("weird/[ab].py",), ("docs/x.md",))  # unknown relationship
    assert claims_may_overlap((), ("docs/x.md",))
    assert not claims_may_overlap(("src/a/**",), ("src/b/**",))
    assert not claims_may_overlap(("src/a.py",), ("src/b.py", "docs/*.md"))
