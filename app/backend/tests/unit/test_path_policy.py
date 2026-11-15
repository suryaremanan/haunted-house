"""Unit tests for pure path parsing and Room_Policy evaluation (task 5.1).

Validates: Requirements 3.9, 5.2, 5.3, 5.7, 5.9, 6.3–6.5, 6.8, 11.5.
"""

from __future__ import annotations

import ast
import inspect

import pytest

from haunted_house.core import path_policy
from haunted_house.core.path_policy import (
    Access,
    PathDecisionCode,
    PathError,
    PathErrorCode,
    PathEvidence,
    RoomPolicy,
    authorize_access,
    evaluate_path,
    is_protected,
    join_parts,
    parse_relative_path,
    policy_allows,
    room_policy,
    rule,
)

pytestmark = pytest.mark.core

_SPEC = "demo-feature"
_CONTROL = "." + "haunted-house"


def _parts(raw: str) -> tuple[str, ...]:
    parsed = parse_relative_path(raw)
    assert not isinstance(parsed, PathError), raw
    return parsed


def _file(raw: str, **overrides) -> PathEvidence:
    values = dict(
        parts=_parts(raw),
        inside_mansion=True,
        symlink_component=False,
        kind="file",
        link_count=1,
    )
    values.update(overrides)
    return PathEvidence(**values)


@pytest.mark.parametrize(
    "raw",
    ["src/app.py", ".kiro/specs/demo-feature/design.md", "a", "docs/été.md", "100%.txt", "a%zz"],
)
def test_clean_relative_paths_round_trip(raw):
    parts = _parts(raw)
    assert join_parts(parts) == raw


@pytest.mark.parametrize(
    ("raw", "code"),
    [
        (None, PathErrorCode.INVALID_TYPE),
        (b"src", PathErrorCode.INVALID_TYPE),
        ("", PathErrorCode.EMPTY),
        ("/etc/passwd", PathErrorCode.ABSOLUTE),
        ("a//b", PathErrorCode.EMPTY_SEGMENT),
        ("a/", PathErrorCode.EMPTY_SEGMENT),
        ("./a", PathErrorCode.DOT_SEGMENT),
        ("a/./b", PathErrorCode.DOT_SEGMENT),
        ("../a", PathErrorCode.PARENT_SEGMENT),
        ("a/../../b", PathErrorCode.PARENT_SEGMENT),
        ("a\\b", PathErrorCode.BACKSLASH),
        ("a\x00b", PathErrorCode.NUL),
        ("a\nb", PathErrorCode.CONTROL),
        ("a\x7fb", PathErrorCode.CONTROL),
        (".g‌it/config", PathErrorCode.CONTROL),
        ("a/‮b", PathErrorCode.CONTROL),
        ("%2e%2e/a", PathErrorCode.ENCODED_TRAVERSAL),
        ("a/%2E%2e/b", PathErrorCode.ENCODED_TRAVERSAL),
        ("a/%252e%252e/b", PathErrorCode.ENCODED_TRAVERSAL),
        ("a%2fb", PathErrorCode.ENCODED_TRAVERSAL),
        ("a%5cb", PathErrorCode.ENCODED_TRAVERSAL),
        ("a%00b", PathErrorCode.ENCODED_TRAVERSAL),
        ("a/%2e", PathErrorCode.ENCODED_TRAVERSAL),
        ("a%ff", PathErrorCode.ENCODED_TRAVERSAL),
        ("a%25252525252e", PathErrorCode.ENCODED_TRAVERSAL),
        ("é.md", PathErrorCode.NOT_NORMALIZED),
        ("a" * 1025, PathErrorCode.TOO_LONG),
        ("a/" * 32 + "a", PathErrorCode.TOO_DEEP),
        ("\ud800", PathErrorCode.INVALID_UTF8),
    ],
)
def test_unsafe_paths_are_rejected_with_a_value_free_code(raw, code):
    parsed = parse_relative_path(raw)
    assert parsed == PathError(code)
    assert isinstance(raw, str) is False or raw == "" or raw not in repr(parsed)


@pytest.mark.parametrize(
    ("role", "writable"),
    [
        ("archivist", "requirements.md"),
        ("draughtsman", "design.md"),
        ("foreman", "tasks.md"),
    ],
)
def test_spec_rooms_write_only_their_active_document(role, writable):
    policy = room_policy(role, _SPEC)
    assert policy is not None
    for document in ("requirements.md", "design.md", "tasks.md"):
        allowed = policy_allows(
            policy, Access.WRITE, _parts(f".kiro/specs/{_SPEC}/{document}")
        )
        assert allowed is (document == writable)
    assert not policy_allows(policy, Access.WRITE, _parts(f".kiro/specs/other/{writable}"))
    assert not policy_allows(policy, Access.WRITE, _parts("src/app.py"))
    assert not policy_allows(policy, Access.WRITE, _parts(f".kiro/specs/{_SPEC}/{writable.upper()}"))
    for access in (Access.DELETE, Access.COMMAND_READ, Access.COMMAND_WRITE, Access.GIT_WRITE):
        assert not policy_allows(policy, access, _parts(f".kiro/specs/{_SPEC}/{writable}"))
    assert policy_allows(policy, Access.READ, _parts("src/app.py"))
    assert policy_allows(policy, Access.LIST, ())


def test_tinker_cannot_change_kiro_control_data():
    policy = room_policy("tinker", _SPEC)
    assert policy is not None and policy.room == "workshop"
    assert policy_allows(policy, Access.WRITE, _parts("src/app.py"))
    assert policy_allows(policy, Access.DELETE, _parts("src/old.py"))
    assert policy_allows(policy, Access.READ, _parts(f".kiro/specs/{_SPEC}/tasks.md"))
    for raw in (
        f".kiro/specs/{_SPEC}/tasks.md",
        ".kiro/specs/other/design.md",
        ".KIRO/specs/x/design.md",
        ".kiro/agents/tinker.json",
        ".kiro",
    ):
        for access in (Access.WRITE, Access.DELETE, Access.COMMAND_WRITE):
            assert not policy_allows(policy, access, _parts(raw)), (raw, access)


@pytest.mark.parametrize(
    "raw",
    [
        _CONTROL,
        _CONTROL + "/seance",
        _CONTROL.upper() + "/x",
        "nested/" + _CONTROL + "/x",
        ".env",
        ".env.local",
        "config/.ENV",
        "keys/server.pem",
        "deploy/id_rsa",
        "deploy/id_ed25519.pub",
        ".ssh/config",
        ".aws/credentials",
        "credentials.json",
        ".npmrc",
        ".git-credentials",
    ],
)
def test_protected_paths_are_closed_to_every_role_and_access(raw):
    parts = _parts(raw)
    for role in ("archivist", "draughtsman", "foreman", "tinker"):
        policy = room_policy(role, _SPEC)
        for access in Access:
            assert is_protected(access, parts)
            assert not policy_allows(policy, access, parts)
    wide_open = RoomPolicy(room="any", allow=(rule("**"),), deny=())
    for access in Access:
        assert not policy_allows(wide_open, access, parts)
        decision = evaluate_path(_file(raw), wide_open, access)
        assert decision.code is PathDecisionCode.PROTECTED_PATH


def test_repository_metadata_is_reachable_only_as_git_write_by_a_tinker():
    for raw in (".git", ".git/config", ".GIT/hooks/pre-commit", "vendor/lib/.git/HEAD"):
        parts = _parts(raw)
        for role in ("archivist", "draughtsman", "foreman", "tinker"):
            policy = room_policy(role, _SPEC)
            for access in Access:
                expected = role == "tinker" and access is Access.GIT_WRITE
                assert policy_allows(policy, access, parts) is expected, (raw, role, access)


def test_deny_overrides_allow_and_unknown_roles_fail_closed():
    policy = RoomPolicy(
        room="x",
        allow=(rule("src/**", Access.READ, Access.WRITE),),
        deny=(rule("src/generated/**", Access.WRITE),),
    )
    assert policy_allows(policy, Access.WRITE, _parts("src/a.py"))
    assert policy_allows(policy, Access.READ, _parts("src/generated/a.py"))
    assert not policy_allows(policy, Access.WRITE, _parts("src/generated/a.py"))
    assert not policy_allows(policy, Access.WRITE, _parts("src/Generated/a.py"))
    assert not policy_allows(policy, Access.DELETE, _parts("src/a.py"))
    assert not policy_allows(policy, Access.READ, ("src", "..", "etc"))
    assert not policy_allows(policy, "read", _parts("src/a.py"))  # type: ignore[arg-type]
    assert room_policy("poltergeist", _SPEC) is None
    assert room_policy("tinker", "../escape") is None
    assert room_policy("tinker", "") is None


def test_evidence_decisions_and_approval_never_widen_policy():
    policy = room_policy("tinker", _SPEC)
    ok = _file("src/a.py")
    assert evaluate_path(ok, policy, Access.WRITE).allowed
    cases = {
        PathDecisionCode.OUTSIDE_MANSION: _file("src/a.py", inside_mansion=False),
        PathDecisionCode.SYMLINK: _file("src/a.py", symlink_component=True),
        PathDecisionCode.NOT_REGULAR: _file("src/a.py", kind="other"),
        PathDecisionCode.HARD_LINK: _file("src/a.py", link_count=2),
        PathDecisionCode.ROOM_POLICY: _file(".kiro/specs/demo-feature/tasks.md"),
        PathDecisionCode.PROTECTED_PATH: _file(".env"),
    }
    for code, evidence in cases.items():
        assert evaluate_path(evidence, policy, Access.WRITE).code is code
        for approved in (True, False):
            denied = authorize_access(evidence, policy, Access.DELETE, exact_approval=approved)
            assert not denied.allowed and denied.code is not PathDecisionCode.APPROVAL_REQUIRED

    assert authorize_access(ok, policy, Access.WRITE, exact_approval=False).allowed
    waiting = authorize_access(ok, policy, Access.DELETE, exact_approval=False)
    assert waiting.code is PathDecisionCode.APPROVAL_REQUIRED
    assert not authorize_access(ok, policy, Access.DELETE, exact_approval=1).allowed  # type: ignore[arg-type]
    assert authorize_access(ok, policy, Access.DELETE, exact_approval=True).allowed
    assert evaluate_path(_file("src/new.py", kind="missing"), policy, Access.WRITE).allowed
    assert evaluate_path(_file("src", kind="directory", link_count=3), policy, Access.LIST).allowed


def test_the_module_is_pure():
    tree = ast.parse(inspect.getsource(path_policy))
    roots = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            roots.update(alias.name.partition(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            roots.add(node.module.partition(".")[0])
    assert roots <= {"__future__", "re", "unicodedata", "dataclasses", "enum", "typing"}
