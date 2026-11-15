"""Example tests for scripts/secret_scan.py.

Every fake credential is assembled at runtime from fragments, so this file
never trips the scan itself (test_scanner_and_tests_pass_their_own_scan).
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "secret_scan.py"


def _load_scanner():
    if "secret_scan" in sys.modules:
        return sys.modules["secret_scan"]
    spec = importlib.util.spec_from_file_location("secret_scan", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules["secret_scan"] = module  # dataclasses look the module up here
    spec.loader.exec_module(module)
    return module


ss = _load_scanner()


def fake(*parts: str) -> str:
    return "".join(parts)


VALUE = fake("q9Zx", "7Lm2" * 4)  # 20 random-looking characters
PEM = fake("-" * 5, "BEGIN RSA PRIV", "ATE KEY", "-" * 5)
AWS = fake("AK", "IA", "Q7" * 8)
GH = fake("gh", "p_", "a1B2" * 9)
GH_PAT = fake("git", "hub_pat_", "B2_c" * 6)
SLACK = fake("xo", "xb-", "1234-5678-", "abcdEF")
JWT = fake("ey", "JhbGciOiJIUzI1NiJ9", ".", "eyJzdWIiOiIxIn0", ".", "c2lnbmF0dXJlLXZhbHVl")
PROXY_ENV = fake("KIROCREW_PROXY", "_SECRET")
APP_HEADER = fake("X-App", "-Secret")

POSITIVE = [
    ("private-key", PEM),
    ("aws-access-key-id", fake("aws_access_key_id=", AWS)),
    ("gh-token", fake('GH = "', GH, '"')),
    ("gh-token", fake("remote: https://", GH_PAT, "@example.invalid/repo.git")),
    ("slack-token", fake("hook: ", SLACK)),
    ("jwt", fake("Authorization: Bearer ", JWT)),
    ("crew-proxy-env", fake("export ", PROXY_ENV, "=", VALUE)),
    ("crew-proxy-env", fake('{"', PROXY_ENV, '": "', VALUE, '"}')),
    ("crew-auth-header", fake(APP_HEADER, ": ", VALUE)),
    ("crew-auth-header", fake("x-app", "-secret: ", VALUE)),
    ("crew-dashboard-cookie", fake("Cookie: mc_", "token_8080=", VALUE)),
    ("crew-dashboard-cookie", fake("localhost\tFALSE\t/\tFALSE\t0\tmc_", "refresh_8080\t", VALUE)),
    ("hardcoded-credential", fake("api", '_key = "', VALUE, '"')),
    ("hardcoded-credential", fake('{"pass', 'word": "', VALUE, '"}')),
    ("hardcoded-credential", fake("SECRET", "_KEY = '", VALUE, "'")),
    ("hardcoded-credential", fake("auth", "Token: '", VALUE, "'")),
]

NEGATIVE = [
    ("private-key", fake("-" * 5, "BEGIN PUBLIC KEY", "-" * 5)),
    ("aws-access-key-id", fake("AK", "IA", "Q7" * 7)),
    ("aws-access-key-id", fake("ak", "ia", "q7" * 8)),
    ("gh-token", fake("gh", "p_", "a1B2" * 5)),
    ("gh-token", fake("gh", "x_", "a1B2" * 9)),
    ("slack-token", fake("xo", "xq-", "1234-5678-abcdEF")),
    ("jwt", fake("ey", "JhbGciOiJIUzI1NiJ9", ".", "eyJzdWIiOiIxIn0")),
    ("crew-proxy-env", fake(PROXY_ENV, "=<secret>")),
    ("crew-proxy-env", fake(PROXY_ENV, '="${', PROXY_ENV, '}"')),
    ("crew-proxy-env", fake(PROXY_ENV, "=", "settings.proxy_value")),
    ("crew-proxy-env", fake('value = os.environ["', PROXY_ENV, '"]')),
    ("crew-proxy-env", fake("Crew passes `", PROXY_ENV, "` to the backend.")),
    ("crew-auth-header", fake('headers = {"', APP_HEADER, '": self._app_value}')),
    ("crew-auth-header", fake('curl -H "', APP_HEADER, ': $(cat .app_secret)"')),
    ("crew-auth-header", fake('curl -H "', APP_HEADER, ': [redacted]"')),
    ("crew-dashboard-cookie", fake("mc_", "token_8080=short")),
    ("hardcoded-credential", fake("tok", 'en = "', "<redacted>", '"')),
    ("hardcoded-credential", fake("api", '_key = "', "${API_KEY_FROM_ENV}", '"')),
    ("hardcoded-credential", fake("pass", 'word = "', "[redacted]", '"')),
    ("hardcoded-credential", fake("tok", 'en = os.environ["API_TOKEN"]')),
    ("hardcoded-credential", fake('{"tok', 'en": "', "/api/apps/haunted-house/token", '"}')),
    ("hardcoded-credential", fake("sec", 'ret = "', "short", '"')),
    ("hardcoded-credential", fake("SEC", 'RET_ENV = "', PROXY_ENV, '"')),
    ("hardcoded-credential", fake("pass", 'word = "', "this has spaces in it", '"')),
]


def _names(findings) -> set:
    return {finding.pattern for finding in findings}


def test_every_rule_has_a_positive_and_a_negative_example():
    rules = {name for name, _ in ss.PATTERNS}
    assert {rule for rule, _ in POSITIVE} == rules
    assert {rule for rule, _ in NEGATIVE} == rules


@pytest.mark.parametrize("rule,line", POSITIVE, ids=[rule for rule, _ in POSITIVE])
def test_rule_flags_its_example(rule, line):
    text = fake("first line\n", line, "\nlast line\n")
    findings = ss.scan_text("notes.txt", text)
    assert ss.Finding("notes.txt", 2, rule) in findings


@pytest.mark.parametrize("rule,line", NEGATIVE, ids=[rule for rule, _ in NEGATIVE])
def test_rule_ignores_non_credential(rule, line):
    assert rule not in _names(ss.scan_text("notes.txt", line))


def test_finding_has_no_field_for_the_matched_text():
    assert [field for field in ss.Finding.__dataclass_fields__] == ["path", "line", "pattern"]


# --- Fixture home paths ------------------------------------------------------

HOME_PATHS = [
    "/Users/alice/work/app",
    "/home/carol/app",
    "C:\\Users\\dana\\app",
    "C:\\\\Users\\\\dana\\\\app",  # JSON-escaped
    "C:/Users/dana/app",
    "\\/Users\\/alice\\/app",  # JSON-escaped slashes
]


@pytest.mark.parametrize("home", HOME_PATHS)
@pytest.mark.parametrize("path", ["fixtures/replay/demo.jsonl", "spikes/fixtures/s9.jsonl"])
def test_fixture_with_home_path_is_flagged(path, home):
    text = fake('{"t": 1}\n{"cwd": "', home, '"}\n')
    assert ss.scan_text(path, text) == [ss.Finding(path, 2, "home-path")]


def test_fixture_with_only_tilde_paths_is_clean():
    text = '{"cwd": "~/work/app", "log": "~/.kirocrew/logs/app.log"}\n'
    assert ss.scan_text("fixtures/replay/demo.jsonl", text) == []


def test_fixture_rule_ignores_urls_and_relative_paths():
    text = '{"url": "http://127.0.0.1:3000/home/page", "file": "src/home/x.ts"}'
    assert ss.scan_text("fixtures/replay/demo.jsonl", text) == []


def test_home_path_outside_fixtures_is_not_flagged():
    assert ss.scan_text("docs/notes.md", "see /Users/alice/work/app\n") == []


def test_replay_copy_named_fixture_gets_the_home_path_rule():
    findings = ss.scan_text("app/ui/replay/public/fixture.jsonl", '{"cwd": "/home/carol/x"}')
    assert _names(findings) == {"home-path"}


# --- .app_secret files -------------------------------------------------------


@pytest.mark.parametrize("path", [".app_secret", "app/.app_secret", "keys/haunted.app_secret"])
def test_app_secret_file_fails_by_name(path):
    assert ss.scan_text(path, "") == [ss.Finding(path, 1, "app-secret-file")]


def test_similar_names_are_not_app_secret_files():
    assert ss.scan_text("app/app_secret.py", "") == []
    assert ss.scan_text("docs/app_secret_notes.md", "") == []


# --- Command line ------------------------------------------------------------


def _run(args, cwd=None, stdin: str = ""):
    env = dict(os.environ, GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM="1")
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        cwd=cwd,
        input=stdin,
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )


LINE_FORMAT = re.compile(r"^[^\s:]+:\d+: [a-z-]+$")
CREDENTIALS = [VALUE, PEM, AWS, GH, GH_PAT, SLACK, JWT]


def test_output_names_file_and_line_but_never_the_credential(tmp_path):
    lines = ["clean line"] + [line for _, line in POSITIVE]
    target = tmp_path / "leaky.txt"
    target.write_text("\n".join(lines) + "\n")

    result = _run([str(target)])

    assert result.returncode == 1
    out = result.stdout.splitlines()
    assert all(LINE_FORMAT.match(line) for line in out), out
    assert {int(line.split(":")[1]) for line in out} == set(range(2, len(lines) + 1))
    for credential in CREDENTIALS:
        assert credential not in result.stdout + result.stderr


def test_app_secret_file_content_is_never_printed(tmp_path):
    target = tmp_path / ".app_secret"
    target.write_text(VALUE)

    result = _run([str(target)])

    assert result.returncode == 1
    assert result.stdout == f"{target}:1: app-secret-file\n"
    assert VALUE not in result.stdout + result.stderr


def test_clean_file_exits_zero(tmp_path):
    target = tmp_path / "clean.txt"
    target.write_text("nothing to see\n")
    result = _run([str(target)])
    assert (result.returncode, result.stdout) == (0, "")


def test_missing_path_is_a_usage_error(tmp_path):
    assert _run([str(tmp_path / "nope.txt")]).returncode == 2


def test_default_mode_scans_tracked_and_untracked_files_only(tmp_path):
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    (tmp_path / ".gitignore").write_text("ignored.txt\n")
    (tmp_path / "tracked.txt").write_text(fake("one\ntwo\nkey=", AWS, "\n"))
    (tmp_path / "untracked.txt").write_text(fake(GH, "\n"))
    (tmp_path / "ignored.txt").write_text(fake(GH, "\n"))
    (tmp_path / "blob.bin").write_bytes(b"\0binary " + GH.encode())
    subprocess.run(["git", "-C", str(tmp_path), "add", "tracked.txt"], check=True)

    result = _run([], cwd=tmp_path)

    assert result.returncode == 1
    assert result.stdout.splitlines() == [
        "tracked.txt:3: aws-access-key-id",
        "untracked.txt:1: gh-token",
    ]
    assert AWS not in result.stdout + result.stderr


def test_default_mode_clean_repo_exits_zero(tmp_path):
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    (tmp_path / "README.md").write_text("hello\n")
    result = _run([], cwd=tmp_path)
    assert (result.returncode, result.stdout) == (0, "")


def test_default_mode_outside_a_repo_is_an_error(tmp_path):
    env_root = tmp_path / "not-a-repo"
    env_root.mkdir()
    result = subprocess.run(
        [sys.executable, str(SCRIPT)],
        cwd=env_root,
        capture_output=True,
        text=True,
        env=dict(os.environ, GIT_CEILING_DIRECTORIES=str(tmp_path)),
        check=False,
    )
    assert result.returncode == 2


def test_scanner_and_tests_pass_their_own_scan():
    result = _run([str(SCRIPT), __file__])
    assert (result.returncode, result.stdout) == (0, "")


# --- Hook mode ---------------------------------------------------------------


def _hook(tool_input, tool_name="fs_write"):
    event = {"hook_event_name": "PreToolUse", "tool_name": tool_name, "tool_input": tool_input}
    return _run(["--hook"], stdin=json.dumps(event))


def test_hook_blocks_a_write_containing_a_credential():
    result = _hook({"path": "src/config.py", "text": fake("api", '_key = "', VALUE, '"\n')})
    assert result.returncode == 2
    assert result.stderr.strip() == (
        "Blocked: content looks like a credential (hardcoded-credential). "
        "Remove it or use an environment variable."
    )
    assert VALUE not in result.stdout + result.stderr


def test_hook_lists_every_rule_that_matched():
    result = _hook({"path": "a.txt", "text": fake(AWS, "\n", JWT)})
    assert result.returncode == 2
    assert "(aws-access-key-id, jwt)" in result.stderr
    assert AWS not in result.stderr and JWT not in result.stderr


def test_hook_scans_nested_strings():
    result = _hook({"edits": [{"path": "a.py", "newStr": fake("k = '", AWS, "'")}]})
    assert result.returncode == 2


def test_hook_allows_clean_content():
    result = _hook({"path": "src/app.py", "text": "print('hello')\n"})
    assert (result.returncode, result.stderr) == (0, "")


def test_hook_allows_removing_a_credential():
    result = _hook({"path": "a.py", "oldStr": fake("k = '", AWS, "'"), "newStr": "k = None"}, "str_replace")
    assert result.returncode == 0


def test_hook_applies_the_fixture_rule_from_the_target_path():
    path = "/Users/alice/repo/fixtures/demo.jsonl"
    blocked = _hook({"path": path, "text": '{"cwd": "/home/carol/app"}\n'})
    allowed = _hook({"path": path, "text": '{"cwd": "~/app"}\n'})
    assert blocked.returncode == 2 and "(home-path)" in blocked.stderr
    assert allowed.returncode == 0


def test_hook_blocks_writing_an_app_secret_file():
    result = _hook({"file_path": "app/.app_secret", "text": "anything"})
    assert result.returncode == 2
    assert "(app-secret-file)" in result.stderr


@pytest.mark.parametrize("stdin", ["", "not json", "[1, 2]", '"just a string"'])
def test_hook_allows_with_a_warning_on_a_bad_event(stdin):
    result = _run(["--hook"], stdin=stdin)
    assert result.returncode == 0
    assert "no valid event JSON" in result.stderr
