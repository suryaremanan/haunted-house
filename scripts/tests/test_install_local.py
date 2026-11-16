"""Example tests for scripts/install-local.sh.

Each test copies the script into tmp_path/repo/scripts/ next to a minimal
app/ (app.json and an empty ui/ folder) and runs the copy from another
folder. The real repo is only read (for the text and shellcheck tests).

PATH holds two folders and nothing else:
  bin/  fake kirocrew, node, bun, git and curl, written as small sh scripts
  sys/  links to the few system tools the script itself runs (bash,
        dirname, head, cat and similar)
Linking single tools instead of putting /usr/bin on PATH keeps the real
git, curl and kirocrew out of reach, so a test can make a tool "missing" by
deleting its fake, and nothing real is ever built or installed. The env is
built from scratch, so no KIROCREW_PORT, BASH_ENV or bun settings leak in.

Every fake appends its argv to one shared log (tool name, then each
argument, tab-separated), so tests can check which commands ran and in what
order. The fakes read their behaviour from FAKE_* environment variables.

Exit codes under test: 0 done, 1 a prerequisite check failed, 2 unknown
argument, otherwise the status of the failing bun or kirocrew step.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "install-local.sh"
APP_NAME = "haunted-house"
PREFIX = "install-local:"
WOULD_RUN = f"{PREFIX} would run: "

SYSTEM_DIRS = "/usr/bin:/bin"
REQUIRED_SYSTEM_TOOLS = ("bash", "dirname", "head", "cat")
OPTIONAL_SYSTEM_TOOLS = ("env", "sort", "sed", "tr", "grep", "basename", "uname")
FAKE_TOOLS = ("kirocrew", "node", "bun", "git", "curl")

# Strings that would mean the script touches Crew settings, enabling or trust
# (Requirement 8.4). Matched case-insensitively against the script text.
FORBIDDEN = (
    "kirocrew config",
    "app enable",
    "/enable",
    "/api/chat/mode",
    "apps_trusted",
    "sessionApproval",
)


def _system_tool(name: str) -> str | None:
    return shutil.which(name, path=SYSTEM_DIRS) or shutil.which(name)


pytestmark = pytest.mark.skipif(
    sys.platform == "win32" or _system_tool("bash") is None,
    reason="needs a POSIX system with bash",
)

_LOG_ARGV = r"""{ printf '%s' @NAME@; for arg in "$@"; do printf '\t%s' "$arg"; done; printf '\n'; } >>"$FAKE_LOG"
"""

FAKES = {
    "kirocrew": r"""
if [ "$1" = --version ]; then
  if [ -n "${FAKE_CREW_STDOUT_BEFORE:-}" ]; then printf '%s\n' "$FAKE_CREW_STDOUT_BEFORE"; fi
  printf 'kirocrew %s\n' "${FAKE_CREW_VERSION:-0.12.1}"
  printf '%s\n' "${FAKE_CREW_STDERR:-WARNING: could not check for updates}" >&2
  exit 0
fi
if [ "$1" = app ]; then
  case $2 in
    info) exit "${FAKE_APP_INFO_STATUS:-1}" ;;
    install | update) exit "${FAKE_APP_INSTALL_STATUS:-0}" ;;
  esac
fi
exit 0
""",
    "node": r"""
if [ "$1" = --version ]; then echo v22.11.0; fi
exit 0
""",
    "bun": r"""
if [ "$1" = --version ]; then echo 1.3.14; exit 0; fi
for arg in "$@"; do
  case $arg in
    install) exit "${FAKE_BUN_INSTALL_STATUS:-0}" ;;
    build) exit "${FAKE_BUN_BUILD_STATUS:-0}" ;;
  esac
done
exit 0
""",
    "git": r"""
if [ "$1" = --version ]; then echo 'git version 2.47.0'; fi
exit 0
""",
    "curl": r"""
for arg in "$@"; do
  case $arg in
    -w | --write-out) printf '%s' "${FAKE_CURL_HTTP_CODE-200}" ;;
  esac
done
exit "${FAKE_CURL_EXIT:-0}"
""",
}


@dataclass
class Sandbox:
    repo: Path
    bin: Path
    log: Path
    cwd: Path
    env: dict[str, str]

    @property
    def script(self) -> Path:
        return self.repo / "scripts" / "install-local.sh"

    @property
    def app_dir(self) -> str:
        return str(self.repo / "app")

    def run(self, *args: str, **env: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [str(self.script), *args],
            cwd=self.cwd,
            env={**self.env, **env},
            capture_output=True,
            encoding="utf-8",
            timeout=30,
        )

    def remove(self, *tools: str) -> None:
        for tool in tools:
            (self.bin / tool).unlink()

    def calls(self) -> list[list[str]]:
        """Every fake call in order, as [tool, *argv]."""
        if not self.log.exists():
            return []
        return [line.split("\t") for line in self.log.read_text(encoding="utf-8").splitlines()]

    def argv(self, tool: str) -> list[list[str]]:
        return [row[1:] for row in self.calls() if row[0] == tool]

    def changes(self) -> list[list[str]]:
        """Calls that build, install or update: bun other than --version,
        and kirocrew app install / app update."""
        return [
            row
            for row in self.calls()
            if (row[0] == "bun" and row[1:] != ["--version"])
            or (row[0] == "kirocrew" and row[1:3] in (["app", "install"], ["app", "update"]))
        ]


@pytest.fixture
def sandbox(tmp_path: Path) -> Sandbox:
    root = tmp_path.resolve()  # the script resolves its own folder with pwd -P

    repo = root / "repo"
    (repo / "scripts").mkdir(parents=True)
    (repo / "app" / "ui").mkdir(parents=True)
    (repo / "app" / "app.json").write_text('{"name": "haunted-house"}\n', encoding="utf-8")
    script = repo / "scripts" / "install-local.sh"
    shutil.copy2(SCRIPT, script)
    script.chmod(0o755)

    bin_dir = root / "bin"
    bin_dir.mkdir()
    for name, body in FAKES.items():
        fake = bin_dir / name
        fake.write_text("#!/bin/sh\n" + _LOG_ARGV.replace("@NAME@", name) + body, encoding="utf-8")
        fake.chmod(0o755)

    sys_dir = root / "sys"
    sys_dir.mkdir()
    for name in REQUIRED_SYSTEM_TOOLS + OPTIONAL_SYSTEM_TOOLS:
        path = _system_tool(name)
        if path is None and name in REQUIRED_SYSTEM_TOOLS:
            pytest.skip(f"{name} is not installed")
        if path is not None:
            (sys_dir / name).symlink_to(path)

    home = root / "home"
    home.mkdir()
    cwd = root / "elsewhere"
    cwd.mkdir()
    log = root / "calls.log"
    env = {
        "PATH": f"{bin_dir}{os.pathsep}{sys_dir}",
        "HOME": str(home),
        "LC_ALL": "C",
        "FAKE_LOG": str(log),
    }
    return Sandbox(repo=repo, bin=bin_dir, log=log, cwd=cwd, env=env)


def fail_lines(result: subprocess.CompletedProcess[str]) -> list[str]:
    return [line for line in result.stderr.splitlines() if line.startswith(f"{PREFIX} FAIL")]


def assert_stopped_before_changes(sandbox: Sandbox, result: subprocess.CompletedProcess[str]) -> None:
    assert result.returncode == 1, result
    assert "stopped before changing anything" in result.stderr
    assert sandbox.changes() == []
    assert ["app", "info", APP_NAME] not in sandbox.argv("kirocrew")


# --- install and update (8.2, 8.3, 8.4, 8.5) -----------------------------------


def test_fresh_install_builds_then_installs_from_absolute_app_path(sandbox: Sandbox) -> None:
    result = sandbox.run(FAKE_APP_INFO_STATUS="1")
    assert result.returncode == 0, result
    app = sandbox.app_dir
    assert Path(app).is_absolute()
    assert sandbox.changes() == [
        ["bun", "install", "--cwd", f"{app}/ui", "--frozen-lockfile"],
        ["bun", "run", "--cwd", f"{app}/ui", "build"],
        ["kirocrew", "app", "install", app],
    ]
    # Only read-only kirocrew calls besides the install itself.
    assert sandbox.argv("kirocrew") == [["--version"], ["app", "info", APP_NAME], ["app", "install", app]]
    # The ok lines come from the fakes, not from tools elsewhere on the system.
    assert sandbox.argv("node") == [["--version"]]
    assert sandbox.argv("git") == [["--version"]]
    assert f"{PREFIX} ok    node v22.11.0" in result.stdout
    assert f"{PREFIX} ok    git version 2.47.0" in result.stdout
    assert f"{PREFIX} ok    bun 1.3.14" in result.stdout
    assert f"{PREFIX} done: {APP_NAME} installed from {app}." in result.stdout
    assert "Enable" in result.stdout
    assert "trust" in result.stdout


def test_installed_app_is_updated_instead(sandbox: Sandbox) -> None:
    result = sandbox.run(FAKE_APP_INFO_STATUS="0")
    assert result.returncode == 0, result
    app = sandbox.app_dir
    assert sandbox.changes() == [
        ["bun", "install", "--cwd", f"{app}/ui", "--frozen-lockfile"],
        ["bun", "run", "--cwd", f"{app}/ui", "build"],
        ["kirocrew", "app", "update", "--source", app, APP_NAME],
    ]
    assert sandbox.argv("kirocrew") == [
        ["--version"],
        ["app", "info", APP_NAME],
        ["app", "update", "--source", app, APP_NAME],
    ]
    assert f"{PREFIX} done: {APP_NAME} updated from {app}." in result.stdout
    assert "Enable" in result.stdout
    assert "trust" in result.stdout


def test_unexpected_app_info_status_is_returned_without_building(sandbox: Sandbox) -> None:
    result = sandbox.run(FAKE_APP_INFO_STATUS="3")
    assert result.returncode == 3, result
    assert f"'kirocrew app info {APP_NAME}' exited with status 3" in result.stderr
    assert sandbox.changes() == []


# --- Crew version (8.1) ---------------------------------------------------------


def test_too_old_crew_stops_before_any_change(sandbox: Sandbox) -> None:
    result = sandbox.run(FAKE_CREW_VERSION="0.11.9")
    assert_stopped_before_changes(sandbox, result)
    assert "Kiro Crew 0.11.9 is too old; Haunted House needs 0.12.1 or later" in result.stderr


@pytest.mark.parametrize(
    ("version", "passes"),
    [("0.12.1", True), ("0.13.0", True), ("0.9.10", False)],
)
def test_version_is_compared_numerically(sandbox: Sandbox, version: str, passes: bool) -> None:
    result = sandbox.run("--dry-run", FAKE_CREW_VERSION=version)
    if passes:
        assert result.returncode == 0, result
        assert f"{PREFIX} ok    kirocrew {version}" in result.stdout
    else:
        assert result.returncode == 1, result
        assert f"Kiro Crew {version} is too old" in result.stderr


def test_version_after_warning_lines_on_stdout_is_read(sandbox: Sandbox) -> None:
    result = sandbox.run(
        "--dry-run",
        FAKE_CREW_STDOUT_BEFORE="WARNING: config file is old\nWARNING: kirocrew 0.1.0 plugins skipped",
    )
    assert result.returncode == 0, result
    assert f"{PREFIX} ok    kirocrew 0.12.1" in result.stdout


def test_version_like_line_on_stderr_is_ignored(sandbox: Sandbox) -> None:
    # If stderr were read, this later line would win and fail the check.
    result = sandbox.run("--dry-run", FAKE_CREW_STDERR="kirocrew 0.1.0")
    assert result.returncode == 0, result
    assert f"{PREFIX} ok    kirocrew 0.12.1" in result.stdout


# --- missing tools (8.1) --------------------------------------------------------


@pytest.mark.parametrize("tool", FAKE_TOOLS)
def test_missing_tool_is_named_and_stops(sandbox: Sandbox, tool: str) -> None:
    sandbox.remove(tool)
    result = sandbox.run()
    assert_stopped_before_changes(sandbox, result)
    assert f"{PREFIX} FAIL  {tool} not found on PATH" in result.stderr
    assert tool not in {row[0] for row in sandbox.calls()}


def test_every_failed_check_is_reported_in_one_run(sandbox: Sandbox) -> None:
    sandbox.remove("node", "git")
    result = sandbox.run(FAKE_CREW_VERSION="0.11.9", FAKE_CURL_EXIT="7", FAKE_CURL_HTTP_CODE="000")
    assert_stopped_before_changes(sandbox, result)
    fails = fail_lines(result)
    assert len(fails) == 4, result.stderr
    for needle in (
        "Kiro Crew 0.11.9 is too old",
        "node not found on PATH",
        "git not found on PATH",
        "gateway at http://127.0.0.1:5476/api/health did not answer",
    ):
        assert any(needle in line for line in fails), needle


# --- gateway and inputs ----------------------------------------------------------


@pytest.mark.parametrize(
    ("fake", "problem"),
    [
        ({"FAKE_CURL_EXIT": "7", "FAKE_CURL_HTTP_CODE": "000"}, "did not answer"),
        ({"FAKE_CURL_EXIT": "7", "FAKE_CURL_HTTP_CODE": ""}, "did not answer"),
        ({"FAKE_CURL_HTTP_CODE": "503"}, "answered HTTP 503 instead of 200"),
    ],
    ids=["down", "down-no-output", "503"],
)
def test_unhealthy_gateway_stops_with_hint_to_start_crew(
    sandbox: Sandbox, fake: dict[str, str], problem: str
) -> None:
    result = sandbox.run(**fake)
    assert_stopped_before_changes(sandbox, result)
    assert problem in result.stderr
    assert "Start the Crew desktop app or run 'kirocrew gateway'" in result.stderr


@pytest.mark.parametrize(
    ("env", "url"),
    [
        ({}, "http://127.0.0.1:5476/api/health"),
        ({"KIROCREW_PORT": "6123"}, "http://127.0.0.1:6123/api/health"),
    ],
    ids=["default-port", "custom-port"],
)
def test_health_check_skips_proxies_and_times_out(sandbox: Sandbox, env: dict[str, str], url: str) -> None:
    result = sandbox.run("--dry-run", **env)
    assert result.returncode == 0, result
    [curl] = sandbox.argv("curl")
    assert curl[-1] == url
    assert curl[curl.index("--noproxy") + 1] == "*"
    assert curl[curl.index("--max-time") + 1] == "5"


@pytest.mark.parametrize("port", ["abc", "0", "65536", "80 80"])
def test_bad_port_is_rejected_without_calling_curl(sandbox: Sandbox, port: str) -> None:
    result = sandbox.run(KIROCREW_PORT=port)
    assert_stopped_before_changes(sandbox, result)
    assert "KIROCREW_PORT must be a port number from 1 to 65535" in result.stderr
    assert sandbox.argv("curl") == []


def test_missing_manifest_stops(sandbox: Sandbox) -> None:
    (sandbox.repo / "app" / "app.json").unlink()
    result = sandbox.run()
    assert_stopped_before_changes(sandbox, result)
    assert f"{PREFIX} FAIL  app/app.json not found" in result.stderr


# --- failing steps ----------------------------------------------------------------


def test_failing_bun_install_returns_its_status_and_skips_the_rest(sandbox: Sandbox) -> None:
    result = sandbox.run(FAKE_BUN_INSTALL_STATUS="5")
    assert result.returncode == 5, result
    assert "installing UI dependencies failed with exit status 5" in result.stderr
    assert sandbox.changes() == [["bun", "install", "--cwd", f"{sandbox.app_dir}/ui", "--frozen-lockfile"]]


def test_failing_ui_build_returns_its_status_and_skips_the_install(sandbox: Sandbox) -> None:
    result = sandbox.run(FAKE_BUN_BUILD_STATUS="6")
    assert result.returncode == 6, result
    assert "building the UI failed with exit status 6" in result.stderr
    assert [row[0] for row in sandbox.changes()] == ["bun", "bun"]


def test_the_script_never_uses_npm(sandbox: Sandbox) -> None:
    code = "\n".join(line for line in SCRIPT.read_text(encoding="utf-8").split("\n") if not line.lstrip().startswith("#"))
    assert not re.search(r"\b(?:npm|npx)\b", code)
    assert "bun install --cwd" in code and "--frozen-lockfile" in code


@pytest.mark.parametrize(
    ("info_status", "what"),
    [("1", f"installing {APP_NAME}"), ("0", f"updating {APP_NAME}")],
    ids=["install", "update"],
)
def test_failing_install_or_update_returns_its_status(sandbox: Sandbox, info_status: str, what: str) -> None:
    result = sandbox.run(FAKE_APP_INFO_STATUS=info_status, FAKE_APP_INSTALL_STATUS="4")
    assert result.returncode == 4, result
    assert f"{what} failed with exit status 4" in result.stderr
    assert f"{PREFIX} done:" not in result.stdout
    assert "Crew dashboard" not in result.stdout


# --- flags --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("info_status", "install_prefix", "install_suffix"),
    [("1", "kirocrew app install ", "/app"), ("0", "kirocrew app update --source ", f" {APP_NAME}")],
    ids=["install", "update"],
)
def test_dry_run_runs_checks_but_changes_nothing(
    sandbox: Sandbox, info_status: str, install_prefix: str, install_suffix: str
) -> None:
    result = sandbox.run("--dry-run", FAKE_APP_INFO_STATUS=info_status)
    assert result.returncode == 0, result
    assert sandbox.changes() == []
    assert ["app", "info", APP_NAME] in sandbox.argv("kirocrew")
    would = [line.removeprefix(WOULD_RUN) for line in result.stdout.splitlines() if line.startswith(WOULD_RUN)]
    assert len(would) == 3, result.stdout
    assert would[0].startswith("bun install --cwd ") and would[0].endswith("/app/ui --frozen-lockfile")
    assert would[1].startswith("bun run --cwd ") and would[1].endswith("/app/ui build")
    assert would[2].startswith(install_prefix) and would[2].endswith(install_suffix)
    assert f"{PREFIX} dry run: checks passed; nothing was built, installed or updated." in result.stdout


@pytest.mark.parametrize("flag", ["--help", "-h"])
def test_help_exits_0_without_running_anything(sandbox: Sandbox, flag: str) -> None:
    result = sandbox.run(flag)
    assert result.returncode == 0, result
    assert result.stdout.startswith("Usage: scripts/install-local.sh")
    assert sandbox.calls() == []


def test_unknown_argument_exits_2_without_running_anything(sandbox: Sandbox) -> None:
    result = sandbox.run("--force")
    assert result.returncode == 2, result
    assert f"{PREFIX} unknown argument: --force" in result.stderr
    assert "Usage:" in result.stderr
    assert sandbox.calls() == []


# --- the script text (8.4) ----------------------------------------------------------


@pytest.mark.parametrize("needle", FORBIDDEN)
def test_script_never_touches_settings_enable_or_trust(needle: str) -> None:
    assert needle.casefold() not in SCRIPT.read_text(encoding="utf-8").casefold()


def test_shellcheck_passes() -> None:
    shellcheck = shutil.which("shellcheck")
    if shellcheck is None:
        pytest.skip("shellcheck is not installed")
    result = subprocess.run(
        [shellcheck, str(SCRIPT)], capture_output=True, encoding="utf-8", timeout=60
    )
    assert result.returncode == 0, result.stdout + result.stderr


# --- the README Install Command (replay-and-submission task 9.3, Requirement 11.6) ---


def _readme_install_command() -> str:
    """The one command of the README's Install section, extracted without a shell."""
    sys.path.insert(0, str(SCRIPT.parent / "lib"))
    from submission_contract import install_command

    command, _line = install_command((SCRIPT.parents[1] / "README.md").read_text(encoding="utf-8"))
    assert command is not None, "README.md has no single Install Command"
    return command


@pytest.mark.parametrize("info_status", ["1", "0"], ids=["install", "update"])
def test_the_readme_install_command_form_passes_the_dry_run_harness(sandbox: Sandbox, info_status: str) -> None:
    """The documented form, run from the clone root as written, is accepted by the same fake-CLI harness."""
    command = _readme_install_command()
    assert command.split() == [command], "the Install Command must be one word with no argument"
    assert (sandbox.repo / command).is_file()
    result = subprocess.run(
        [command, "--dry-run"],
        cwd=sandbox.repo,
        env={**sandbox.env, "FAKE_APP_INFO_STATUS": info_status},
        capture_output=True,
        encoding="utf-8",
        timeout=30,
    )
    assert result.returncode == 0, result
    assert sandbox.changes() == []
    assert f"{PREFIX} dry run: checks passed; nothing was built, installed or updated." in result.stdout


def test_the_readme_install_command_is_the_tested_script() -> None:
    command = _readme_install_command()
    assert (SCRIPT.parents[1] / command).resolve() == SCRIPT.resolve()
    assert os.access(SCRIPT, os.X_OK)
