"""Release-contract integration tests (Spec 7 tasks 10.1 and 10.2).

Requirements 5.1-5.6, 6.5-6.7, 7.1-7.9, 8.1-8.9, 9.1-9.10 and 11.5-11.8.

Two parts. The first treats the repository as one release fixture and checks
that its independent gates agree with each other: fixture redaction, the
manifest freeze, the README command, version and trust copy, the workflow
contracts and the document and asset links. The second runs
scripts/check-release.sh in a sandbox whose gates are stand-ins, to prove how
the command composes them: every step runs, a failure is reported and never
masked, a missing tool is a failure, and pending-by-design items are listed
apart from failures. No test here contacts a network, Crew or GitHub.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "check-release.sh"
LIB = REPO_ROOT / "scripts" / "lib"
sys.path.insert(0, str(LIB))

import permission_freeze as freeze  # noqa: E402
import submission_contract as submission  # noqa: E402
from workflow_yaml import parse_workflow  # noqa: E402

pytestmark = pytest.mark.skipif(sys.platform == "win32" or shutil.which("bash") is None, reason="needs a POSIX system with bash")

STEPS = [
    "python-tests", "ui-typecheck", "ui-tests", "smoke-script-tests", "live-build", "bundle-imports",
    "live-bundle-fresh", "replay-build", "replay-artifact", "replay-smoke", "replay-fixture",
    "guardrail-fixture", "fixture-publication", "kiro-tracked", "secret-scan", "shellcheck",
    "permission-freeze", "assets", "submission",
]  # fmt: skip


def read(path: str) -> str:
    return (REPO_ROOT / path).read_text(encoding="utf-8")


# --- The repository as one release fixture ------------------------------------------------


def test_manifest_freeze_record_and_readme_name_one_permission_set():
    manifest_bytes = (REPO_ROOT / "app/app.json").read_bytes()
    manifest = json.loads(manifest_bytes)
    record = json.loads(read("docs/permission-freeze.json"))
    readme = read("README.md")
    assert freeze.check_record(read("docs/permission-freeze.json"), manifest, manifest_bytes) == []
    assert freeze.check_readme(readme, manifest["permissions"]) == []
    assert set(record["permissions"]["api"]) == set(manifest["permissions"]["api"]) == set(freeze.REVIEWED_API)
    assert set(record["permissions"]["events"]) == set(manifest["permissions"]["events"]) == set(freeze.REVIEWED_EVENTS)
    section = readme[readme.index("## Permissions") : readme.index("## Demo")]
    assert set(re.findall(r"`(/[a-z][^`]*)`", section)) == set(record["permissions"]["api"])
    assert record["appVersion"] == manifest["version"]
    for forbidden in ("/api/spawn", "/api/approvals", "autoApprove"):
        assert forbidden not in json.dumps(manifest)


def test_readme_command_version_and_trust_copy_agree_with_manifest_and_script():
    readme = read("README.md")
    manifest = json.loads(read("app/app.json"))
    command, _line = submission.install_command(readme)
    assert command == "scripts/install-local.sh"
    minimum = manifest["minKiroCrewVersion"]
    assert f"Kiro Crew {minimum} or later" in readme
    assert f'MIN_CREW_VERSION="{minimum}"' in read("scripts/install-local.sh")
    trust = readme[readme.index("## One-time trust step") : readme.index("## Permissions")]
    positions = [trust.index(word) for word in ("Apps", "Library", "Haunted House", "Enable", "Trust")]
    assert positions == sorted(positions)
    # The install script prints the same manual steps and performs none of them.
    script = read("scripts/install-local.sh")
    for word in ("Apps", "Library", "Enable"):
        assert word in script
    assert not re.search(r"kirocrew app (?:enable|trust)|apps_trusted", script)


def test_the_document_set_and_asset_records_are_consistent():
    files = {path: read(path) for path in (*submission.HEADINGS, submission.ASSETS_MANIFEST, submission.PUBLICATION_METADATA, submission.INSTALL_SCRIPT, "app/app.json")}
    findings = submission.check_document_set(files, lambda path: ".." not in Path(path).parts and (REPO_ROOT / path).exists())
    assert [str(finding) for finding in findings] == []
    manifest = json.loads(files[submission.ASSETS_MANIFEST])
    for asset in manifest["assets"]:
        assert (REPO_ROOT / asset["path"]).is_file()
        assert f"`{asset['path']}`" in files[submission.CREDITS]
    assert (REPO_ROOT / "app" / json.loads(files["app/app.json"])["iconPath"]).as_posix().endswith(manifest["assets"][0]["path"])


def test_the_fixture_is_canonical_redacted_and_the_one_the_replay_build_copies():
    result = subprocess.run([sys.executable, str(REPO_ROOT / "scripts/check-replay-publication.py")], capture_output=True, text=True, timeout=120, check=False, cwd=REPO_ROOT)
    assert result.returncode == 0, result.stdout
    config = read("app/ui/vite.replay.config.ts")
    assert "../../fixtures/replay/demo.jsonl" in config
    expected = json.loads(read("fixtures/replay/demo.expected.json"))
    lines = [line for line in read("fixtures/replay/demo.jsonl").split("\n") if line]
    assert len(lines) == expected["record_count"] == len(expected["selected_record_ids"])
    assert [json.loads(line)["record_id"] for line in lines] == expected["selected_record_ids"]
    narrative = expected["narrative"]
    # Requirement 5.2: two ghosts, a tool call, an approval and decision, a Door decision, a completion, a failure.
    assert len(narrative["ghost_ids"]) >= 2
    for key in ("tool_started", "approval_requested", "approval_decided", "door_decisions", "run_completed"):
        assert narrative[key] >= 1, key
    assert narrative["run_failed"] + narrative["run_blocked"] >= 1


def test_workflows_run_the_same_gates_as_the_release_command():
    """Every offline gate of Normal CI and of the Pages build is a step of check-release.sh."""
    script = SCRIPT.read_text(encoding="utf-8")
    markers = {
        "scripts/test-py.sh": "pytest",
        "typecheck": "bun run --cwd app/ui typecheck",
        "ui_script test": "bun run --cwd app/ui test",
        "ui_script build\n": "bun run --cwd app/ui build",
        "ui_script build:replay": "bun run --cwd app/ui build:replay",
        "js_script scripts/check-bundle-imports.mjs": "bun scripts/check-bundle-imports.mjs",
        "js_script scripts/check-replay-artifact.mjs app/ui/dist-replay": "bun scripts/check-replay-artifact.mjs app/ui/dist-replay",
        "js_script scripts/smoke-replay-site.mjs --local app/ui/dist-replay": "bun scripts/smoke-replay-site.mjs --local app/ui/dist-replay",
        "js_tests scripts-tests/smoke-replay-site.test.mjs": "bun test ./scripts-tests/smoke-replay-site.test.mjs",
        "scripts/build_replay_fixture.py --check": "scripts/build_replay_fixture.py --check",
        "scripts/check-replay-publication.py": "scripts/check-replay-publication.py",
        "scripts/check-permission-freeze.py --check --readme": "scripts/check-permission-freeze.py --check --readme",
        "scripts/check-kiro-tracked.sh": "scripts/check-kiro-tracked.sh",
        "python3 scripts/secret_scan.py": "python3 scripts/secret_scan.py",
        "shellcheck scripts/*.sh": "shellcheck scripts/*.sh",
        "python3 scripts/check-assets.py": "python3 scripts/check-assets.py",
        "python3 scripts/check-submission.py": "python3 scripts/check-submission.py",
    }
    workflows = "\n".join(
        str(step.get("run", ""))
        for name in ("ci.yml", "pages.yml")
        for job in parse_workflow(read(f".github/workflows/{name}"))["jobs"].values()
        for step in job["steps"]
    )
    for in_script, in_workflow in markers.items():
        assert in_script in script, in_script
        assert in_workflow in workflows, in_workflow


def test_the_pages_artifact_path_is_the_folder_every_replay_gate_checks():
    pages = parse_workflow(read(".github/workflows/pages.yml"))
    upload = next(step for step in pages["jobs"]["build"]["steps"] if str(step.get("uses", "")).startswith("actions/upload-pages-artifact@"))
    folder = upload["with"]["path"]
    assert folder == "app/ui/dist-replay"
    assert f"{folder}/" in read(".gitignore")
    assert "outDir: here('./dist-replay')" in read("app/ui/vite.replay.config.ts")
    assert "../app/ui/dist-replay" in read("scripts/smoke-replay-site.mjs")
    assert "app/ui/dist-replay" in read("scripts/check-replay-artifact.mjs")


# --- The release command itself -----------------------------------------------------------------


def test_the_script_is_executable_and_lists_its_steps():
    assert os.access(SCRIPT, os.X_OK)
    result = subprocess.run([str(SCRIPT), "--list"], capture_output=True, text=True, timeout=30, check=False)
    assert result.returncode == 0
    assert [line.split()[0] for line in result.stdout.splitlines()] == STEPS


def test_the_script_makes_no_live_or_publishing_action():
    """Task 10.1: no live Crew, GitHub, Pages, trust, approval, push or submission action."""
    code = "\n".join(line for line in SCRIPT.read_text(encoding="utf-8").split("\n") if not line.lstrip().startswith("#"))
    for forbidden in (
        "kirocrew", "curl", "wget", "git push", "git commit", "git add", "gh ", "--url", "--write-reviewed",
        "install-local.sh", "npm ci", "npm install", "bun install", "bun add", "pip install", "ssh ", "http://", "https://",
        "--no-publication-gate", "|| true\n  ui_script",
    ):  # fmt: skip
        assert forbidden not in code, forbidden


@pytest.mark.parametrize("args", [["--bogus"], ["--only"], ["--only", "no-such-step"], ["extra"]])
def test_usage_errors_exit_2(args: list[str]):
    result = subprocess.run([str(SCRIPT), *args], capture_output=True, text=True, timeout=30, check=False)
    assert result.returncode == 2
    assert "==>" not in result.stdout


def test_bad_settings_exit_2():
    for env in ({"RELEASE_UI_RUNNER": "yarn"}, {"RELEASE_STEP_TIMEOUT_SECONDS": "soon"}, {"RELEASE_STEP_TIMEOUT_SECONDS": "0"}):
        result = subprocess.run([str(SCRIPT), "--only", "assets"], capture_output=True, text=True, timeout=30, check=False, env={**os.environ, **env})
        assert result.returncode == 2, env


def test_a_real_partial_run_passes_and_says_it_was_partial():
    result = subprocess.run([str(SCRIPT), "--only", "assets", "--only", "submission"], capture_output=True, text=True, timeout=120, check=False)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "PASS  assets" in result.stdout and "PASS  submission" in result.stdout
    assert "partial run" in result.stdout
    assert "nothing is pending" not in result.stdout


# A sandbox repository whose gates are stand-ins controlled by environment variables.

STUB = """#!/bin/sh
name="$(basename "$0")"
key="$(printf '%s' "$name" | tr -c 'A-Za-z0-9' '_')"
printf '%s %s\\n' "$name" "$*" >>"$STUB_LOG"
if [ "$name" = "check-submission.py" ]; then
  case " $* " in
    *" --release "*)
      if [ -n "${STUB_PENDING:-}" ]; then printf '%s\\n' "$STUB_PENDING"; exit 1; fi
      exit 0 ;;
  esac
fi
printf 'output of %s\\n' "$name"
if [ "$name" = "npm" ] || [ "$name" = "bun" ]; then
  for arg in "$@"; do key="${name}_$(printf '%s' "$arg" | tr -c 'A-Za-z0-9' '_')"; done
  if [ -n "${STUB_REBUILD:-}" ]; then case " $* " in *" build "*) printf 'changed' >>app/ui/dist/index.mjs ;; esac; fi
fi
eval "status=\\${STUB_EXIT_$key:-0}"
exit "$status"
"""

REPO_STUBS = (
    "scripts/test-py.sh", "scripts/check-kiro-tracked.sh", "scripts/secret_scan.py", "scripts/check-assets.py",
    "scripts/check-submission.py", "scripts/check-permission-freeze.py", "scripts/build_replay_fixture.py",
    "scripts/build_guardrail_trace.py", "scripts/check-replay-publication.py", ".venv/bin/python",
)  # fmt: skip
TOOL_STUBS = ("npm", "bun", "node", "uv", "shellcheck", "git")
SYSTEM_TOOLS = ("bash", "sh", "dirname", "basename", "sed", "tr", "sleep", "cat", "env", "pkill", "kill", "printf")


class Sandbox:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.repo = root / "repo"
        self.bin = root / "bin"
        self.log = root / "calls.log"
        self.bin.mkdir()
        for name in REPO_STUBS:
            self._stub(self.repo / name)
        # `.venv/bin/python <script>` and `python3 <script>` run the stub named by their first argument.
        runner = '#!/bin/sh\nif [ "$1" = "-" ]; then exec "$REAL_PYTHON" "$@"; fi\nscript="$1"; shift\nexec "$script" "$@"\n'
        for path in (self.repo / ".venv/bin/python", self.bin / "python3"):
            path.write_text(runner, encoding="utf-8")
            path.chmod(0o755)
        for name in TOOL_STUBS:
            self._stub(self.bin / name)
        for name in SYSTEM_TOOLS:
            found = shutil.which(name)
            if found:
                (self.bin / name).symlink_to(found)
        shutil.copy2(SCRIPT, self.repo / "scripts" / "check-release.sh")
        (self.repo / "app/ui/node_modules").mkdir(parents=True)
        (self.repo / "app/ui/dist").mkdir()
        (self.repo / "app/ui/dist/index.mjs").write_text("export default 1\n", encoding="utf-8")
        self.env = {"PATH": str(self.bin), "STUB_LOG": str(self.log), "REAL_PYTHON": sys.executable, "HOME": str(root), "LC_ALL": "C"}

    def _stub(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(STUB, encoding="utf-8")
        path.chmod(0o755)

    def run(self, *args: str, **env: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [str(self.repo / "scripts/check-release.sh"), *args],
            capture_output=True, text=True, timeout=120, check=False, cwd=self.root, env={**self.env, **env},
        )  # fmt: skip

    def calls(self) -> list[str]:
        return self.log.read_text(encoding="utf-8").splitlines() if self.log.exists() else []


@pytest.fixture
def sandbox(tmp_path: Path) -> Sandbox:
    return Sandbox(tmp_path.resolve())


def summary(result: subprocess.CompletedProcess[str]) -> list[str]:
    lines = result.stdout.split("\n")
    return [line for line in lines[lines.index("==> summary") + 1 :] if line]


def test_every_gate_runs_in_order_and_a_clean_run_exits_0(sandbox: Sandbox):
    result = sandbox.run()
    assert result.returncode == 0, result.stdout + result.stderr
    lines = summary(result)
    assert [line.split()[1] for line in lines[: len(STEPS)]] == STEPS
    assert all(line.startswith("PASS  ") for line in lines[: len(STEPS)])
    assert lines[-1] == "check-release: every gate passed and nothing is pending."
    # Each stand-in's own output is shown, not swallowed.
    for name in ("test-py.sh", "secret_scan.py", "check-assets.py", "shellcheck"):
        assert f"output of {name}" in result.stdout
    calls = sandbox.calls()
    # bun is the default runner, as in CI.
    assert "bun run --cwd app/ui typecheck" in calls
    assert "bun run --cwd app/ui test" in calls
    assert "bun run --cwd app/ui build" in calls
    assert "bun run --cwd app/ui build:replay" in calls
    assert "bun scripts/check-bundle-imports.mjs" in calls
    assert "bun scripts/check-replay-artifact.mjs app/ui/dist-replay" in calls
    assert "bun scripts/smoke-replay-site.mjs --local app/ui/dist-replay" in calls
    assert "bun test ./scripts-tests/smoke-replay-site.test.mjs" in calls
    assert "check-permission-freeze.py --check --readme" in calls
    assert not any("install" in call or " ci" in call for call in calls)
    assert not any(call.startswith(("npm ", "node ")) for call in calls)


def test_the_bun_runner_runs_the_same_package_scripts(sandbox: Sandbox):
    result = sandbox.run(RELEASE_UI_RUNNER="bun")
    assert result.returncode == 0, result.stdout + result.stderr
    calls = sandbox.calls()
    for script in ("typecheck", "test", "build", "build:replay"):
        assert f"bun run --cwd app/ui {script}" in calls
    assert not any(call.startswith("npm ") for call in calls)


def test_the_npm_runner_override_runs_the_same_package_scripts_with_npm_and_node(sandbox: Sandbox):
    result = sandbox.run(RELEASE_UI_RUNNER="npm")
    assert result.returncode == 0, result.stdout + result.stderr
    calls = sandbox.calls()
    for script in ("typecheck", "test", "build", "build:replay"):
        assert f"npm --prefix app/ui run {script}" in calls
    assert "node scripts/check-bundle-imports.mjs" in calls
    assert "node scripts/check-replay-artifact.mjs app/ui/dist-replay" in calls
    assert "node scripts/smoke-replay-site.mjs --local app/ui/dist-replay" in calls
    assert "node --test scripts-tests/smoke-replay-site.test.mjs" in calls
    assert not any(call.startswith("bun ") for call in calls)


def test_the_bun_runner_still_needs_node_for_the_ui_package_scripts(sandbox: Sandbox):
    """vitest, vite and tsc start on Node under `bun run`; without node the UI steps are SKIP."""
    (sandbox.bin / "node").unlink()
    result = sandbox.run()
    assert result.returncode == 1
    skipped = [line.split()[1] for line in summary(result) if line.startswith("SKIP")]
    assert skipped == ["ui-typecheck", "ui-tests", "live-build", "bundle-imports", "replay-build", "replay-artifact"]


@pytest.mark.parametrize(
    ("step", "env"),
    [
        ("python-tests", "STUB_EXIT_test_py_sh"),
        ("ui-tests", "STUB_EXIT_bun_test"),
        ("ui-typecheck", "STUB_EXIT_bun_typecheck"),
        ("replay-build", "STUB_EXIT_bun_build_replay"),
        ("secret-scan", "STUB_EXIT_secret_scan_py"),
        ("kiro-tracked", "STUB_EXIT_check_kiro_tracked_sh"),
        ("shellcheck", "STUB_EXIT_shellcheck"),
        ("permission-freeze", "STUB_EXIT_check_permission_freeze_py"),
        ("replay-fixture", "STUB_EXIT_build_replay_fixture_py"),
        ("assets", "STUB_EXIT_check_assets_py"),
        ("submission", "STUB_EXIT_check_submission_py"),
    ],
)
def test_one_failing_gate_fails_the_run_and_every_other_gate_still_runs(sandbox: Sandbox, step: str, env: str):
    result = sandbox.run(**{env: "3"})
    assert result.returncode == 1
    lines = summary(result)
    by_step = {line.split()[1]: line for line in lines[: len(STEPS)]}
    assert by_step[step].startswith(f"FAIL  {step} (exit 3"), by_step[step]
    assert [name for name, line in by_step.items() if not line.startswith("PASS")] == [step]
    assert len(by_step) == len(STEPS)
    assert "check-release: FAILED." in lines[-1]
    assert "every gate passed" not in result.stdout


def test_a_failed_live_build_also_fails_the_freshness_gate(sandbox: Sandbox):
    result = sandbox.run(STUB_EXIT_bun_build="1")
    assert result.returncode == 1
    failed = [line.split()[1] for line in summary(result) if line.startswith("FAIL")]
    assert failed == ["live-build", "live-bundle-fresh"]


def test_a_stale_live_bundle_is_a_failure(sandbox: Sandbox):
    result = sandbox.run(STUB_REBUILD="1")
    assert result.returncode == 1
    assert [line.split()[1] for line in summary(result) if line.startswith("FAIL")] == ["live-bundle-fresh"]
    assert "was stale" in result.stderr


def test_a_missing_tool_is_reported_as_skip_and_fails_the_run(sandbox: Sandbox):
    (sandbox.bin / "shellcheck").unlink()
    result = sandbox.run()
    assert result.returncode == 1
    lines = summary(result)
    assert "SKIP  shellcheck (a needed tool is missing; counted as a failure)" in lines
    assert sum(line.startswith("PASS") for line in lines) == len(STEPS) - 1


def test_missing_ui_dependencies_are_not_installed_by_the_script(sandbox: Sandbox):
    (sandbox.repo / "app/ui/node_modules").rmdir()
    result = sandbox.run()
    assert result.returncode == 1
    assert "this script installs nothing" in result.stderr
    # bun still runs the two smoke scripts, which need no app/ui dependency;
    # no package script runs and nothing is installed.
    runner_calls = [call for call in sandbox.calls() if call.startswith(("npm", "bun"))]
    assert runner_calls == ["bun test ./scripts-tests/smoke-replay-site.test.mjs", "bun scripts/smoke-replay-site.mjs --local app/ui/dist-replay"]
    assert not any("install" in call or call.startswith(("npm", "bun run", "bun add")) for call in sandbox.calls())


PENDING = "docs/publication-metadata.json:1: release-item-pending: RS-S1 publication metadata\ndocs/submission-checklist.md:36: release-item-pending: screenshots"


def test_pending_items_are_listed_apart_from_failures_and_do_not_fail_the_run(sandbox: Sandbox):
    result = sandbox.run(STUB_PENDING=PENDING)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "PENDING  docs/publication-metadata.json:1: release-item-pending: RS-S1 publication metadata" in result.stdout
    lines = summary(result)
    assert all(line.startswith("PASS") for line in lines[: len(STEPS)])
    assert lines[len(STEPS)].startswith("PENDING  2 item(s) by design")
    assert "not yet a readiness claim" in lines[-1]
    assert "FAIL" not in "\n".join(lines)


def test_strict_turns_pending_items_into_a_failure(sandbox: Sandbox):
    result = sandbox.run("--strict", STUB_PENDING=PENDING)
    assert result.returncode == 1
    assert "FAILED (--strict)" in summary(result)[-1]
    assert sandbox.run("--strict").returncode == 0


def test_a_real_finding_in_the_release_listing_is_a_failure_not_a_pending_item(sandbox: Sandbox):
    result = sandbox.run(STUB_PENDING=PENDING + "\nREADME.md:41: install-command")
    assert result.returncode == 1
    assert "PENDING  README.md" not in result.stdout
    assert "check-release: FAILED." in summary(result)[-1]


def test_a_step_that_runs_too_long_is_stopped_and_fails(sandbox: Sandbox):
    slow = sandbox.repo / "scripts/secret_scan.py"
    slow.write_text("#!/bin/sh\nsleep 30\n", encoding="utf-8")
    result = sandbox.run("--only", "secret-scan", "--only", "assets", RELEASE_STEP_TIMEOUT_SECONDS="1")
    assert result.returncode == 1
    lines = summary(result)
    assert lines[0].startswith("FAIL  secret-scan")
    assert lines[1].startswith("PASS  assets")
    assert "exceeded 1 seconds" in result.stderr
