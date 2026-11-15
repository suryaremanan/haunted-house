"""Property 9 for the Task_Claim_Gate (task 6.7).

Feature: room-ghosts, Property 9: A task claim can only narrow Tinker authority

The gate's answer is compared with a reference built from the claim's own
rule matcher, and the final result is the gate joined with the Spec 4
Room_Policy: nothing the room refuses is ever allowed by a claim.

Validates: Requirements 8.2, 8.4, 8.8, 9.2, 9.3, 9.5.
"""

from __future__ import annotations

from dataclasses import replace

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from haunted_house.core.path_policy import (
    Access,
    PathError,
    RoomPolicy,
    parse_relative_path,
    policy_allows,
    room_policy,
    rule,
)
from haunted_house.core.task_claims import (
    MUTATING_ACCESS,
    acquire_candidate,
    authorize_claim_access,
    decide_release,
    fold_claims,
)
from haunted_house.core.task_plan import claim_covers
from tests.room_ghost_runtime_support import acknowledge, tinker_scope

pytestmark = pytest.mark.core

SPEC = "demo-feature"
SEGMENTS = st.sampled_from(["src", "lib", "docs", "a", "b", "pkg", "main.py", "x.md", "t.txt"])
CLAIM_ENTRIES = st.one_of(
    st.lists(SEGMENTS, min_size=1, max_size=3).map("/".join),
    st.lists(SEGMENTS, min_size=1, max_size=2).map(lambda parts: "/".join(parts) + "/**"),
    st.sampled_from(["**", "src/*.py", ".kiro/specs/demo-feature/**", ".kiro/**", "weird/[ab].py"]),
)
CLAIMS = st.lists(CLAIM_ENTRIES, min_size=1, max_size=3, unique=True).map(tuple)
PATHS = st.one_of(
    st.lists(SEGMENTS, min_size=1, max_size=4).map("/".join),
    st.sampled_from(
        [
            ".kiro/specs/demo-feature/tasks.md",
            ".kiro/specs/demo-feature/design.md",
            ".kiro/steering/tech.md",
            ".haunted-house/seance/log.jsonl",
            ".git/config",
            ".env",
            "../outside.py",
            "src/../../outside.py",
            "/etc/hosts",
            "src//x.py",
            "",
            "weird/a.py",
        ]
    ),
)
# The fixed Tinker policy and narrower rooms a later spec could configure.
POLICIES = st.one_of(
    st.just(room_policy("tinker", SPEC)),
    st.lists(SEGMENTS, min_size=1, max_size=2).map(
        lambda parts: RoomPolicy(
            "workshop",
            (rule("**", Access.READ, Access.LIST), rule("/".join(parts) + "/**", *Access)),
            (rule(".kiro/**", *MUTATING_ACCESS),),
        )
    ),
    st.just(RoomPolicy("workshop", (), ())),
)
IDENTITIES = st.sampled_from(["trusted", "other_slot", "other_run", "other_ghost", "other_mansion"])


def _requesting_scope(kind: str):
    scope = tinker_scope(1)
    if kind == "other_slot":
        return replace(scope, session_slot="slot-forged")
    if kind == "other_run":
        return replace(scope, run_id="implementation-2", run_sequence=2)
    if kind == "other_ghost":
        return replace(scope, ghost_id="tinker-2")
    if kind == "other_mansion":
        return replace(scope, mansion_id="other-mansion")
    return scope


@settings(max_examples=300)
@given(
    policy=POLICIES,
    claim_paths=CLAIMS,
    path=PATHS,
    access=st.sampled_from(list(Access)),
    identity=IDENTITIES,
    released=st.booleans(),
    named_claim=st.sampled_from(["none", "own", "forged"]),
)
def test_a_task_claim_only_narrows_tinker_authority(
    policy, claim_paths, path, access, identity, released, named_claim
) -> None:
    # Feature: room-ghosts, Property 9: A task claim can only narrow Tinker authority
    owner = tinker_scope(1)
    events = list(acknowledge([acquire_candidate(owner, "2.1", claim_paths, 1)]))
    ledger = fold_claims(events)
    claim = ledger.active[0]
    if released:
        release = decide_release(ledger, claim.claim_id, "r1:" + "cd" * 32, "failed")
        events += acknowledge([release.candidate], after=1)
        ledger = fold_claims(events)

    claim_id = {"none": None, "own": claim.claim_id, "forged": "claim-" + "f" * 40}[named_claim]
    decision = authorize_claim_access(
        ledger, _requesting_scope(identity), access, path, claim_id=claim_id
    )

    parts = parse_relative_path(path)
    clean = not isinstance(parts, PathError)
    identity_ok = identity == "trusted" and not released and named_claim != "forged"
    inside = clean and claim_covers(claim_paths, path)
    expected_forward = identity_ok and (access not in MUTATING_ACCESS or inside)
    assert decision.forward is expected_forward
    if not identity_ok:
        assert decision.code in ("task_claim_required", "task_claim_mismatch")

    # Spec 4 decides afterwards and is never overridden by the claim.
    room_allows = clean and policy_allows(policy, access, parts)
    final = decision.forward and room_allows
    if final:
        assert room_allows and identity_ok
        assert access not in MUTATING_ACCESS or inside
    if not room_allows:
        assert not final  # a claim on ``**`` or ``.kiro/**`` grants nothing
    # With the claim the Tinker can do no more than without it.
    assert final <= room_allows

    # The fixed Tinker room still refuses every Spec_Document mutation.
    if clean and parts[:2] == (".kiro", "specs") and access in MUTATING_ACCESS:
        assert not (decision.forward and policy_allows(room_policy("tinker", SPEC), access, parts))
