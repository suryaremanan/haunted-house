#!/usr/bin/env python3
"""Scan the repo, or one Kiro tool call, for likely credentials.

Usage:
  python3 scripts/secret_scan.py             scan every file git would commit
  python3 scripts/secret_scan.py PATH...     scan only the given files
  python3 scripts/secret_scan.py --hook      scan a Kiro PreToolUse event on stdin

One rule table serves CI, the secret-guard Kiro hook and the tests.

Rules
  PATTERNS          apply to every file.
  FIXTURE_PATTERNS  apply only to recorded fixtures: files with a folder named
                    `fixtures` in their path (fixtures/, spikes/fixtures/), or
                    a file name starting with `fixture` (a replay copy such as
                    replay/public/fixture.jsonl). They flag absolute home
                    paths: /Users/<name>, /home/<name>, C:\\Users\\<name>, also
                    in JSON-escaped form. Paths written as ~/ are fine.
  app-secret-file   a file named .app_secret, or ending in .app_secret, fails
                    by name. Its content is never read.

Rules that capture a value (the three Crew rules and hardcoded-credential)
skip values that are clearly not secrets: placeholders such as <redacted>,
[redacted], ${VAR}, $VAR, {{var}} or %(var)s; masks such as xxxx or ****;
values containing "redacted", "placeholder", "changeme" or "example"; env
lookups (os.environ, process.env, getenv); env var names in CAPS_WITH_UNDERSCORES;
paths and URLs; and, for unquoted values only, code references such as
self._secret (dotted names with no digits). See is_placeholder().

Output
  One line per finding, sorted: `<file>:<line>: <rule name>`. Lines are
  1-based and split on "\\n" only. The matched text is never printed. In the
  default mode file names are relative to the repo root.

Exit codes
  default or PATH...   0 no findings, 1 findings, 2 usage or git error
  --hook               0 allow, 2 block (one message line on stderr)

Hook mode reads the event JSON ({"tool_name": ..., "tool_input": {...}}) and
scans every string value inside tool_input, with two exceptions:
  - path, file_path, filePath: the file being written. It selects the
    fixture and .app_secret rules and is not scanned as content, because an
    absolute path to a fixture always starts with a home folder.
  - oldStr, old_str, old_string, oldString: text being replaced, not written.
    Skipping it means an edit that removes a credential is never blocked.
An empty or malformed event is allowed with a warning on stderr, so a parse
error in this script can't block every write. The full scan in CI is the gate.

Stdlib only. Runs on the macOS system python3 (3.9) and on 3.12 in CI.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import stat
import subprocess
import sys
from dataclasses import dataclass
from typing import Iterable, List, Optional, Tuple

MAX_BYTES = 2 * 1024 * 1024
SNIFF_BYTES = 8 * 1024

APP_SECRET_RULE = "app-secret-file"
HOME_PATH_RULE = "home-path"

HOOK_MESSAGE = (
    "Blocked: content looks like a credential ({names}). "
    "Remove it or use an environment variable."
)


@dataclass(frozen=True, order=True)
class Finding:
    """One hit. Deliberately has no field for the matched text."""

    path: str
    line: int
    pattern: str

    def __str__(self) -> str:
        return f"{self.path}:{self.line}: {self.pattern}"


# --- Rule table -------------------------------------------------------------
#
# Some regexes are assembled from fragments so this file never matches itself.
# A rule whose regex has a `value` group is checked with is_placeholder(); an
# optional `q` group records whether the value was quoted.

# Characters an unquoted value may contain. Brackets, quotes, backticks,
# commas and semicolons end a value, which keeps code and prose out.
_VALUE_CHAR = r"[^\s\"'`;,()\[\]{}<>]"


def _crew_value(min_len: int) -> str:
    return r"(?P<q>[\"']?)(?P<value>" + _VALUE_CHAR + "{%d,})" % min_len


_DASHES = "-" * 5

PATTERNS: List[Tuple[str, re.Pattern[str]]] = [
    (
        "private-key",
        re.compile(_DASHES + r"BEGIN[ A-Z0-9]*PRIVATE KEY(?: BLOCK)?" + _DASHES),
    ),
    ("aws-access-key-id", re.compile(r"(?:AKIA|ASIA)[A-Z0-9]{16}")),
    (
        "gh-token",
        re.compile(r"gh[pousr]_[A-Za-z0-9]{36,}|" + "github" + r"_pat_[A-Za-z0-9_]{22,}"),
    ),
    ("slack-token", re.compile(r"xox[abprs]-[A-Za-z0-9-]{10,}")),
    (
        "jwt",
        re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]{8,}"),
    ),
    (
        "crew-proxy-env",
        re.compile("KIROCREW_PROXY" + r"_SECRET[\"']?\s*[=:]\s*" + _crew_value(8)),
    ),
    (
        "crew-auth-header",
        re.compile("X-App" + r"-Secret[\"']?\s*:\s*" + _crew_value(8), re.IGNORECASE),
    ),
    (
        "crew-dashboard-cookie",
        re.compile("mc_" + r"(?:token|refresh)_\d+[\"']?\s*[=:\t]\s*" + _crew_value(16)),
    ),
    (
        "hardcoded-credential",
        re.compile(
            r"(?:api[_-]?key|secret|token|password)(?:[_-][A-Za-z0-9]+)*"
            r"[\"']?\s*(?::=|=>|[:=])\s*"
            r"(?P<q>[\"'])(?P<value>[^\"'\s]{16,})[\"']",
            re.IGNORECASE,
        ),
    ),
]

_HOME_NAME = r"[A-Za-z0-9._-]+"

FIXTURE_PATTERNS: List[Tuple[str, re.Pattern[str]]] = [
    (
        HOME_PATH_RULE,
        re.compile(
            # /Users/<name> and /home/<name>, also JSON-escaped as \/Users\/<name>.
            # The character before the first slash, or before its escaping
            # backslash, must not make the path relative (~/Users/x, src\/home\/x).
            # A JSON escape \n, \t or \r there is whitespace, so it is allowed.
            r"(?:(?<![\w.~\\-])|(?<=\\[nrt]))\\?/(?:Users|home)\\?/" + _HOME_NAME
            # C:\Users\<name>, C:\\Users\\<name> (escaped) and C:/Users/<name>.
            + r"|[A-Za-z]:(?:\\{1,2}|/)Users(?:\\{1,2}|/)" + _HOME_NAME
        ),
    ),
]

_PLACEHOLDER_WORDS = ("redacted", "placeholder", "changeme", "example")
_ENV_LOOKUPS = ("os.environ", "process.env", "getenv", "import.meta.env")
_MASK_CHARS = frozenset("x*.-_#0")
_ENV_NAME = re.compile(r"[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+")
_CODE_REF = re.compile(r"[A-Za-z_$][A-Za-z_$]*(?:\.[A-Za-z_$][A-Za-z_$]*)*")


def is_placeholder(value: str, quoted: bool = True) -> bool:
    """True if a captured value is clearly not a real credential."""
    if not value:
        return True
    if value[0] in "<[{$*" or value.startswith("%("):
        return True
    lowered = value.lower()
    if set(lowered) <= _MASK_CHARS or len(set(value)) == 1:
        return True
    if any(word in lowered for word in _PLACEHOLDER_WORDS):
        return True
    if any(lookup in value for lookup in _ENV_LOOKUPS):
        return True
    if value.startswith(("/", "./", "../", "~/")) or "://" in value:
        return True
    if _ENV_NAME.fullmatch(value):
        return True
    if not quoted and _CODE_REF.fullmatch(value):
        return True
    return False


def _split_path(path: str) -> List[str]:
    return [part for part in re.split(r"[\\/]+", path) if part]


def is_fixture_path(path: str) -> bool:
    """True for recorded fixtures, which also get the home-path rule."""
    parts = [part.lower() for part in _split_path(path)]
    if not parts:
        return False
    return "fixtures" in parts[:-1] or parts[-1].startswith("fixture")


def is_app_secret_path(path: str) -> bool:
    parts = _split_path(path)
    return bool(parts) and parts[-1].endswith(".app_secret")


def _line_matches(regex: re.Pattern[str], line: str) -> bool:
    has_value = "value" in regex.groupindex
    pos = 0
    while True:
        match = regex.search(line, pos)
        if match is None:
            return False
        if not has_value:
            return True
        quoted = bool(match.groupdict().get("q"))
        if not is_placeholder(match.group("value"), quoted):
            return True
        # Retry one character on, not after the match: a skipped placeholder
        # such as `NAME= NAME=value` read as NAME must not hide the real one.
        pos = match.start() + 1


def scan_text(path: str, text: str) -> List[Finding]:
    """Scan `text` as if it were the content of `path`. Sorted, no duplicates."""
    found = set()
    if is_app_secret_path(path):
        found.add(Finding(path, 1, APP_SECRET_RULE))
    rules = list(PATTERNS)
    if is_fixture_path(path):
        rules.extend(FIXTURE_PATTERNS)
    for number, line in enumerate(text.split("\n"), start=1):
        for name, regex in rules:
            if _line_matches(regex, line):
                found.add(Finding(path, number, name))
    return sorted(found)


# --- Files ------------------------------------------------------------------


def _warn(message: str) -> None:
    print(f"secret_scan: {message}", file=sys.stderr)


def scan_file(real_path: str, display: Optional[str] = None) -> List[Finding]:
    """Scan one file. Skips non-regular files, binaries and files over 2 MiB."""
    shown = display if display is not None else real_path
    if is_app_secret_path(shown):
        return [Finding(shown, 1, APP_SECRET_RULE)]
    try:
        info = os.lstat(real_path)
    except FileNotFoundError:
        return []  # listed by git but deleted from the working tree
    if not stat.S_ISREG(info.st_mode):
        return []  # symlink, submodule or directory
    if info.st_size > MAX_BYTES:
        _warn(f"skipped {shown}: larger than 2 MiB")
        return []
    try:
        with open(real_path, "rb") as handle:
            data = handle.read()
    except OSError as error:
        _warn(f"skipped {shown}: {error.strerror or 'unreadable'}")
        return []
    if b"\0" in data[:SNIFF_BYTES]:
        return []
    return scan_text(shown, data.decode("utf-8", errors="replace"))


def _git(args: List[str], cwd: Optional[str] = None) -> bytes:
    result = subprocess.run(
        ["git", *args], cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True
    )
    return result.stdout


def repo_files() -> Tuple[str, List[str]]:
    """Repo root and every file git would commit, tracked or untracked-not-ignored."""
    top = os.fsdecode(_git(["rev-parse", "--show-toplevel"])).strip()
    listing = _git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"], cwd=top)
    names = sorted({os.fsdecode(raw) for raw in listing.split(b"\0") if raw})
    return top, names


# --- Hook mode --------------------------------------------------------------

_PATH_KEYS = ("path", "file_path", "filePath")
_OLD_TEXT_KEYS = frozenset({"oldStr", "old_str", "old_string", "oldString"})


def scan_tool_input(tool_input: object) -> List[Finding]:
    """Scan every string value in a tool_input (see the module docstring)."""
    found: List[Finding] = []
    stack: List[Tuple[object, str]] = [(tool_input, "")]
    while stack:
        node, path = stack.pop()
        if isinstance(node, str):
            found.extend(scan_text(path, node))
        elif isinstance(node, list):
            stack.extend((item, path) for item in node)
        elif isinstance(node, dict):
            for key in _PATH_KEYS:
                if isinstance(node.get(key), str):
                    path = node[key]
                    found.extend(scan_text(path, ""))
                    break
            for key, value in node.items():
                if key in _PATH_KEYS or key in _OLD_TEXT_KEYS:
                    continue
                stack.append((value, path))
    return sorted(set(found))


def run_hook(raw: bytes) -> int:
    try:
        event = json.loads(raw.decode("utf-8")) if raw.strip() else None
    except (ValueError, RecursionError):
        event = None
    if not isinstance(event, dict):
        _warn("--hook got no valid event JSON on stdin; allowing the tool call")
        return 0
    findings = scan_tool_input(event.get("tool_input"))
    if not findings:
        return 0
    names = ", ".join(sorted({finding.pattern for finding in findings}))
    print(HOOK_MESSAGE.format(names=names), file=sys.stderr)
    return 2


# --- Entry point ------------------------------------------------------------


def _report(findings: Iterable[Finding]) -> int:
    ordered = sorted(set(findings))
    for finding in ordered:
        print(finding)
    return 1 if ordered else 0


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="secret_scan.py",
        description="Find likely credentials without printing them.",
    )
    parser.add_argument(
        "--hook",
        action="store_true",
        help="read a Kiro PreToolUse event on stdin; exit 2 to block it",
    )
    parser.add_argument(
        "paths", nargs="*", help="files to scan (default: every file git would commit)"
    )
    args = parser.parse_args(argv)

    if args.hook:
        if args.paths:
            parser.error("--hook takes no paths")
        return run_hook(sys.stdin.buffer.read())

    if args.paths:
        missing = [path for path in args.paths if not os.path.isfile(path)]
        if missing:
            parser.error("not a file: " + ", ".join(missing))
        findings: List[Finding] = []
        for path in args.paths:
            findings.extend(scan_file(path))
        return _report(findings)

    try:
        top, names = repo_files()
    except FileNotFoundError:
        _warn("git is not installed")
        return 2
    except subprocess.CalledProcessError as error:
        detail = os.fsdecode(error.stderr or b"").strip() or "git failed"
        _warn(detail)
        return 2
    findings = []
    for name in names:
        findings.extend(scan_file(os.path.join(top, name), display=name))
    status = _report(findings)
    if status:
        _warn(f"{len(set(findings))} finding(s); fix them before committing")
    return status


if __name__ == "__main__":
    sys.exit(main())
