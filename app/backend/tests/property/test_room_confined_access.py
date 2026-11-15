"""Property 9 for the pure Room_Policy evaluator.

Feature: doors-and-guardrails, Property 9: Ghost access remains inside Effective_Room_Policy

For any Room_Policy, access kind, path evidence, and approval state, final
authorization is true only when the path is canonically inside the Mansion,
an allow rule grants access, no deny or Protected_Path rule matches, and any
required risky approval is exact.  The oracle translates each rule to a
regular expression, independently of the production component matcher.

Validates: Requirements 3.9, 5.3, 5.7, 5.9, 6.3, 6.4, 6.5, 6.8, 11.5, 11.6.
"""

from __future__ import annotations

import re

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from haunted_house.core.path_policy import (
    PROTECTED_RULES,
    RISKY_ACCESS,
    Access,
    PathEvidence,
    PathRule,
    RoomPolicy,
    authorize_access,
    evaluate_path,
    policy_allows,
    room_policy,
)

pytestmark = pytest.mark.core

_CONTROL = "." + "haunted-house"
_SPEC = "demo-feature"
_NAMES = (
    "src", "docs", "app.py", "notes.md", ".kiro", "specs", _SPEC, "other-spec",
    "requirements.md", "design.md", "tasks.md", ".git", ".GIT", "config",
    _CONTROL, _CONTROL.upper(), ".env", ".Env.local", "server.pem", "id_rsa",
    "credentials", "generated", "Generated", "a", "b",
)
_PATTERN_PARTS = _NAMES + ("*", "**", "*.md", "*.py", "s*", "*e*")

_PARTS = st.lists(st.sampled_from(_NAMES), min_size=0, max_size=5).map(tuple)
_ACCESS = st.sampled_from(list(Access))
_RULES = st.builds(
    PathRule,
    pattern=st.lists(st.sampled_from(_PATTERN_PARTS), min_size=1, max_size=4).map(tuple),
    accesses=st.frozensets(_ACCESS, min_size=1),
)
_POLICIES = st.one_of(
    st.builds(
        RoomPolicy,
        room=st.just("generated"),
        allow=st.lists(_RULES, max_size=4).map(tuple),
        deny=st.lists(_RULES, max_size=3).map(tuple),
    ),
    st.sampled_from(["archivist", "draughtsman", "foreman", "tinker"]).map(
        lambda role: room_policy(role, _SPEC)
    ),
)
_EVIDENCE = st.builds(
    PathEvidence,
    parts=_PARTS,
    inside_mansion=st.booleans() | st.just(True),
    symlink_component=st.booleans() | st.just(False),
    kind=st.sampled_from(["missing", "file", "directory", "other", "file", "file"]),
    link_count=st.sampled_from([1, 1, 1, 2, 5]),
)


def _regex(pattern: tuple[str, ...], *, fold: bool) -> re.Pattern[str]:
    pieces = []
    for component in pattern:
        if component == "**":
            pieces.append("(?:[^/]+/)*")
        else:
            pieces.append(
                "[^/]*".join(re.escape(piece) for piece in component.split("*")) + "/"
            )
    return re.compile("".join(pieces), re.IGNORECASE if fold else 0)


def _oracle_match(rules, access: Access, parts: tuple[str, ...], *, fold: bool) -> bool:
    text = "".join(part + "/" for part in parts)
    return any(
        access in item.accesses and _regex(item.pattern, fold=fold).fullmatch(text)
        for item in rules
    )


@settings(max_examples=300)
@given(policy=_POLICIES, access=_ACCESS, evidence=_EVIDENCE, approved=st.booleans())
def test_ghost_access_remains_inside_effective_room_policy(
    policy, access, evidence, approved
):
    protected = _oracle_match(PROTECTED_RULES, access, evidence.parts, fold=True)
    denied = _oracle_match(policy.deny, access, evidence.parts, fold=True)
    granted = _oracle_match(policy.allow, access, evidence.parts, fold=False)
    inside_policy = granted and not denied and not protected

    assert policy_allows(policy, access, evidence.parts) is inside_policy

    path_ok = (
        evidence.inside_mansion
        and not evidence.symlink_component
        and inside_policy
        and evidence.kind != "other"
        and not (evidence.kind == "file" and evidence.link_count != 1)
    )
    assert evaluate_path(evidence, policy, access).allowed is path_ok

    expected = path_ok and (access not in RISKY_ACCESS or approved)
    decision = authorize_access(evidence, policy, access, exact_approval=approved)
    assert decision.allowed is expected
    assert (decision.code == "ok") is expected

    # Approval can never widen the policy.
    if not path_ok:
        assert not authorize_access(
            evidence, policy, access, exact_approval=True
        ).allowed

    # Fixed-room facts that hold whatever was generated.
    if protected:
        assert not decision.allowed
    if policy.room == "workshop" and evidence.parts[:2] == (".kiro", "specs"):
        if access in (Access.WRITE, Access.DELETE, Access.COMMAND_WRITE):
            tinker = room_policy("tinker", _SPEC)
            assert not policy_allows(tinker, access, evidence.parts)
