"""Tests for the Kiro hook files in .kiro/hooks/ (Requirement 11).

Matcher semantics, read from the Kiro 1.4.154 agent bundle (see
.kiro/steering/tech.md):
  - File triggers (PostFileSave, ...): `new RegExp(matcher).test(path)`, with
    the path exactly as the agent passed it, absolute or relative.
  - PreToolUse/PostToolUse: `new RegExp(matcher).test(tool_name)`. A matcher
    with none of the characters \\ ^ $ ( ) [ ] { } | + is also a tool pattern:
    it matches a tool whose id or tag equals it. fs_write, fs_append and
    str_replace all carry the tag `write`, so the bare matcher `write` covers
    all three even though the regex alone only matches fs_write.

The tests use Python `re.search`, which, like JS `RegExp.test` without
flags, is unanchored. For the syntax these matchers use (groups, `|`, `^`,
`$`, `\\.`, `.+`, `?`) the two engines agree. One difference: Python's `$`
also matches before a trailing newline and JS's doesn't; paths have no
newlines, so it never matters here. Constructs that do differ between the
engines (lookbehind, named groups, inline flags, all spelled `(?`) are
rejected below so the Python check stays a faithful stand-in.

The fake credential is assembled at runtime from fragments, so this file
passes the repo's own secret scan.
"""
from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
HOOKS_DIR = REPO / ".kiro" / "hooks"

TRIGGERS = {
    "PreToolUse",
    "PostToolUse",
    "SessionStart",
    "Stop",
    "UserPromptSubmit",
    "PreTaskExec",
    "PostTaskExec",
    "PreCompact",
    "PostCompact",
    "PostFileCreate",
    "PostFileSave",
    "PostFileDelete",
}
FILE_TRIGGERS = {"PostFileCreate", "PostFileSave", "PostFileDelete"}
TOOL_TRIGGERS = {"PreToolUse", "PostToolUse"}

UI_CORE = r"(^|/)app/ui/src/core/.+\.tsx?$"
PY_CORE = r"(^|/)app/backend/haunted_house/core/.+\.py$"
GITIGNORE = r"(^|/)\.gitignore$"

# file -> [(trigger, matcher, command)], in file order (design.md, Kiro hooks).
EXPECTED = {
    "kiro-tracked.json": [("PostFileSave", GITIGNORE, "scripts/check-kiro-tracked.sh")],
    "test-core-on-save.json": [
        ("PostFileSave", UI_CORE, "bun run --cwd app/ui test:core"),
        ("PostFileSave", PY_CORE, "scripts/test-py.sh -q -m core app/backend/tests"),
    ],
    "tests-after-task.json": [("PostTaskExec", None, "scripts/test-all.sh")],
    "secret-guard.json": [("PreToolUse", "write", "python3 scripts/secret_scan.py --hook")],
}

# matcher -> (relative paths it must match, relative paths it must not match).
# Each path is also checked in absolute form under the repo root.
FILE_SAMPLES = {
    GITIGNORE: (
        [".gitignore", "app/ui/.gitignore"],
        ["x.gitignore", ".gitignore.bak", "app/ui/gitignore"],
    ),
    UI_CORE: (
        ["app/ui/src/core/status.ts", "app/ui/src/core/nested/view.tsx"],
        [
            "myapp/ui/src/core/a.ts",
            "app/ui/src/App.tsx",
            "app/ui/src/adapters/sdk.ts",
            "app/ui/src/core/status.js",
        ],
    ),
    PY_CORE: (
        ["app/backend/haunted_house/core/scope.py", "app/backend/haunted_house/core/sub/x.py"],
        [
            "app/backend/haunted_house/server.py",
            "myapp/backend/haunted_house/core/scope.py",
            "app/backend/haunted_house/core/scope.pyc",
            "app/backend/tests/unit/test_origin.py",
        ],
    ),
}

# Tool tags from the Kiro 1.4.154 bundle, for the tools the samples use.
TOOL_TAGS = {
    "fs_write": {"write"},
    "fs_append": {"write"},
    "str_replace": {"write"},
    "execute_bash": {"shell"},
    "read_file": {"read"},
    "grep_search": {"read"},
}
TOOL_SAMPLES = {
    "write": (["fs_write", "fs_append", "str_replace"], ["execute_bash", "read_file", "grep_search"]),
}
_REGEX_SYNTAX = re.compile(r"[\\^$()\[\]{}|+]")


def _load(name: str) -> dict:
    return json.loads((HOOKS_DIR / name).read_text(encoding="utf-8"))


def _hooks():
    for path in sorted(HOOKS_DIR.glob("*.json")):
        for index, hook in enumerate(_load(path.name)["hooks"]):
            yield path.name, index, hook


def _tool_matches(matcher: str, tool_name: str) -> bool:
    if re.search(matcher, tool_name):
        return True
    if _REGEX_SYNTAX.search(matcher):
        return False
    return matcher == tool_name or matcher in TOOL_TAGS.get(tool_name, set())


# --- Shape --------------------------------------------------------------------


@pytest.mark.parametrize("path", sorted(HOOKS_DIR.glob("*.json")), ids=lambda p: p.name)
def test_hook_file_parses_with_version_and_hooks(path):
    doc = json.loads(path.read_text(encoding="utf-8"))
    assert doc["version"] == "v1"
    assert isinstance(doc["hooks"], list) and doc["hooks"]


def test_every_hook_has_a_known_trigger_and_a_runnable_command():
    for name, index, hook in _hooks():
        where = f"{name}[{index}]"
        assert isinstance(hook.get("name"), str) and hook["name"], where
        assert hook["trigger"] in TRIGGERS, where
        assert hook["action"]["type"] == "command", where
        argv = shlex.split(hook["action"]["command"])
        assert argv, where
        if argv[0] == "python3":
            assert (REPO / argv[1]).is_file(), where
        elif argv[0] == "bun":
            assert argv[1:4] == ["run", "--cwd", "app/ui"], where
            scripts = json.loads((REPO / argv[3] / "package.json").read_text())["scripts"]
            assert argv[4] in scripts, where
        else:
            script = REPO / argv[0]
            assert script.is_file() and os.access(script, os.X_OK), where


def test_the_expected_hooks_are_present():
    assert sorted(p.name for p in HOOKS_DIR.glob("*.json")) == sorted(EXPECTED)
    for name, expected in EXPECTED.items():
        actual = [
            (hook["trigger"], hook.get("matcher"), hook["action"]["command"])
            for hook in _load(name)["hooks"]
        ]
        assert actual == expected, name


def test_post_task_hook_has_room_for_both_suites():
    (hook,) = _load("tests-after-task.json")["hooks"]
    assert hook["timeout"] == 300


# --- Matchers -----------------------------------------------------------------


def test_every_matcher_compiles_and_has_samples():
    for name, index, hook in _hooks():
        matcher = hook.get("matcher")
        if matcher is None:
            continue
        re.compile(matcher)
        assert "(?" not in matcher, f"{name}[{index}] uses syntax JS and Python read differently"
        if hook["trigger"] in FILE_TRIGGERS:
            assert matcher in FILE_SAMPLES, f"{name}[{index}] has no sample paths"
        else:
            assert hook["trigger"] in TOOL_TRIGGERS and matcher in TOOL_SAMPLES, f"{name}[{index}]"


@pytest.mark.parametrize("matcher", sorted(FILE_SAMPLES))
def test_file_matcher_matches_relative_and_absolute_paths(matcher):
    positives, negatives = FILE_SAMPLES[matcher]
    for rel in positives:
        for path in (rel, str(REPO / rel)):
            assert re.search(matcher, path), path
    for rel in negatives:
        for path in (rel, str(REPO / rel)):
            assert not re.search(matcher, path), path


def test_secret_guard_matcher_covers_every_write_tool_only():
    positives, negatives = TOOL_SAMPLES["write"]
    assert [tool for tool in positives if not _tool_matches("write", tool)] == []
    assert [tool for tool in negatives if _tool_matches("write", tool)] == []


# --- Secret guard command -------------------------------------------------------

FAKE_KEY = "".join(["gh", "p_", "Zq8W", "m3Lx" * 8])  # GitHub-style, 36 characters after the prefix
FAKE_BODY = FAKE_KEY[4:]
GUARD = _load("secret-guard.json")["hooks"][0]["action"]["command"]
REL = "scripts/tests/tmp_guard_check.txt"


def _guard(tool_name: str, tool_input: dict) -> subprocess.CompletedProcess:
    event = {
        "session_id": "test-session",
        "hook_event_name": "PreToolUse",
        "cwd": str(REPO),
        "tool_name": tool_name,
        "tool_input": tool_input,
    }
    return subprocess.run(
        GUARD,
        shell=True,
        cwd=REPO,
        input=json.dumps(event),
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


CLEAN = [
    ("fs_write", {"path": REL, "text": "hello\n"}),
    ("fs_append", {"path": str(REPO / REL), "text": "more text\n"}),
    ("str_replace", {"path": REL, "oldStr": "hello", "newStr": "goodbye"}),
]
BLOCKED = [
    ("fs_write", {"path": REL, "text": f"remote = {FAKE_KEY}\n"}),
    ("fs_append", {"path": str(REPO / REL), "text": f"\nremote = {FAKE_KEY}\n"}),
    ("str_replace", {"path": REL, "oldStr": "remote = None", "newStr": f"remote = '{FAKE_KEY}'"}),
]


@pytest.mark.parametrize(("tool_name", "tool_input"), CLEAN, ids=[c[0] for c in CLEAN])
def test_secret_guard_allows_clean_writes(tool_name, tool_input):
    result = _guard(tool_name, tool_input)
    assert (result.returncode, result.stdout, result.stderr) == (0, "", "")


@pytest.mark.parametrize(("tool_name", "tool_input"), BLOCKED, ids=[c[0] for c in BLOCKED])
def test_secret_guard_blocks_a_credential_without_echoing_it(tool_name, tool_input):
    result = _guard(tool_name, tool_input)
    assert result.returncode == 2
    assert result.stderr.strip() == (
        "Blocked: content looks like a credential (gh-token). "
        "Remove it or use an environment variable."
    )
    assert FAKE_BODY not in result.stdout + result.stderr


def test_secret_guard_allows_removing_a_credential():
    result = _guard(
        "str_replace",
        {"path": REL, "oldStr": f"remote = '{FAKE_KEY}'", "newStr": "remote = os.environ['REMOTE']"},
    )
    assert result.returncode == 0
    assert FAKE_BODY not in result.stdout + result.stderr
