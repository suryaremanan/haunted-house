"""Regression tests for .github/workflows/ci.yml, Normal CI (Spec 7 task 7.3).

Requirements 6.6, 6.7 and 11.8. Normal CI keeps its push and pull-request
triggers, its `python`, `ui` and `repo` jobs and every check it had before the
replay release work, and gains the offline replay and submission gates. It
never depends on GitHub Pages, a deployment, a secret or a live Crew gateway.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
CI = REPO_ROOT / ".github" / "workflows" / "ci.yml"

sys.path.insert(0, str(REPO_ROOT / "scripts" / "lib"))
from workflow_yaml import parse_workflow  # noqa: E402


# The one third-party action: bun's official installer, pinned to the commit of
# its v2.2.0 tag, never to a moving tag.
SETUP_BUN = "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6"
BUN_VERSION = "1.3.14"


def load() -> dict[str, Any]:
    return parse_workflow(CI.read_text(encoding="utf-8"))


def steps(job: str) -> list[dict[str, Any]]:
    return load()["jobs"][job]["steps"]


def text_of(job: str) -> str:
    """Every `uses` and `run` of a job, one step per paragraph, in order."""
    return "\n\n".join(str(step.get("uses") or step.get("run")).strip() for step in steps(job))


def position(job: str, marker: str) -> int:
    for index, step in enumerate(steps(job)):
        if marker in str(step.get("run", "")) or str(step.get("uses", "")).startswith(marker):
            return index
    raise AssertionError(f"{job}: no step holds {marker!r}")


# Every command Normal CI ran before this feature (the foundation's three jobs).
PRESERVED: dict[str, list[str]] = {
    "python": [
        "actions/checkout@v4",
        "actions/setup-python@v5",
        "for tool in git bash shellcheck; do",
        "python -m pip install -r requirements-dev.txt",
        "pytest",
    ],
    "ui": [
        "actions/checkout@v4",
        "oven-sh/setup-bun@",
        "actions/setup-node@v4",
        "bun install --cwd app/ui --frozen-lockfile",
        "bun run --cwd app/ui typecheck",
        "bun run --cwd app/ui test",
        "bun run --cwd app/ui build",
        "bun scripts/check-bundle-imports.mjs",
        "git status --porcelain --untracked-files=all -- app/ui/dist",
        "git diff --exit-code --stat -- app/ui/dist",
        "bun run --cwd app/ui build:replay",
    ],
    "repo": [
        "actions/checkout@v4",
        "scripts/check-kiro-tracked.sh",
        "python3 scripts/secret_scan.py",
        "shellcheck scripts/*.sh",
    ],
}

# The offline gates this feature adds (Requirement 6.7).
ADDED: dict[str, list[str]] = {
    "python": [
        "python scripts/build_replay_fixture.py --check",
        "python scripts/check-replay-publication.py",
        "python scripts/check-permission-freeze.py --check --readme",
    ],
    "ui": [
        "bun scripts/check-replay-artifact.mjs app/ui/dist-replay",
        "bun test ./scripts-tests/smoke-replay-site.test.mjs",
        "bun scripts/smoke-replay-site.mjs --local app/ui/dist-replay",
    ],
    "repo": [
        "python3 scripts/check-assets.py",
        "python3 scripts/check-submission.py",
    ],
}


def test_triggers_permissions_and_concurrency_are_unchanged():
    """Requirement 6.6."""
    workflow = load()
    assert workflow["name"] == "CI"
    assert workflow["on"] == ["push", "pull_request"]
    assert workflow["permissions"] == {"contents": "read"}
    assert workflow["concurrency"] == {"group": "${{ github.workflow }}-${{ github.ref }}", "cancel-in-progress": True}
    assert workflow["defaults"] == {"run": {"shell": "bash"}}


def test_the_three_jobs_are_kept_and_independent():
    """Requirement 6.6."""
    jobs = load()["jobs"]
    assert list(jobs) == ["python", "ui", "repo"]
    assert {name: job["name"] for name, job in jobs.items()} == {
        "python": "Python tests",
        "ui": "UI tests and bundle",
        "repo": "Repo checks",
    }
    for name, job in jobs.items():
        assert job["runs-on"] == "ubuntu-latest", name
        assert job["timeout-minutes"] == 10, name
        assert "needs" not in job and "if" not in job and "permissions" not in job, name
        assert "continue-on-error" not in job, name
        for step in job["steps"]:
            assert "continue-on-error" not in step and "if" not in step, name


@pytest.mark.parametrize(("job", "marker"), [(job, marker) for job, markers in PRESERVED.items() for marker in markers])
def test_every_earlier_command_is_still_run(job: str, marker: str):
    """Requirement 6.6: test, typecheck, manifest (pytest), Kiro tracking,
    bundle import, stale live bundle, secret scan and shellcheck steps."""
    assert marker in text_of(job)


@pytest.mark.parametrize("job", sorted(PRESERVED))
def test_earlier_commands_keep_their_order(job: str):
    positions = [position(job, marker) for marker in PRESERVED[job]]
    assert positions == sorted(positions)


@pytest.mark.parametrize(("job", "marker"), [(job, marker) for job, markers in ADDED.items() for marker in markers])
def test_every_replay_and_submission_gate_is_run(job: str, marker: str):
    """Requirement 6.7."""
    assert marker in [str(step.get("run", "")).strip() for step in steps(job)]


def test_the_manifest_test_and_property_tests_run_inside_pytest():
    """`pytest` with no arguments runs both test paths, the manifest test included."""
    assert "pytest" in [str(step.get("run", "")).strip() for step in steps("python")]
    config = (REPO_ROOT / "pyproject.toml").read_text(encoding="utf-8")
    assert 'testpaths = ["app/backend/tests", "scripts/tests"]' in config
    assert (REPO_ROOT / "app/backend/tests/unit/test_manifest.py").is_file()


def test_replay_gates_run_after_the_replay_build_and_freeze_after_install():
    build = position("ui", "bun run --cwd app/ui build:replay")
    for marker in ("bun scripts/check-replay-artifact.mjs", "bun scripts/smoke-replay-site.mjs --local"):
        assert position("ui", marker) > build, marker
    # The stale-bundle check still runs before the replay build writes dist-replay.
    assert position("ui", "git diff --exit-code --stat -- app/ui/dist") < build
    install = position("python", "python -m pip install -r requirements-dev.txt")
    assert position("python", "python scripts/check-permission-freeze.py") > install


def test_checkouts_keep_no_credentials():
    for job in ("python", "ui", "repo"):
        checkout = [step for step in steps(job) if step.get("uses", "").startswith("actions/checkout@")]
        assert len(checkout) == 1 and checkout[0]["with"] == {"persist-credentials": False}, job


def test_normal_ci_is_offline_and_never_deploys():
    """Requirements 6.6 and 11.8: no Pages, no deployment, no secret, no live Crew."""
    text = CI.read_text(encoding="utf-8")
    for forbidden in (
        "configure-pages", "upload-pages-artifact", "deploy-pages", "github-pages", "id-token", "pages: write",
        "secrets.", "GITHUB_TOKEN", "--url", "page_url", "kirocrew ", "install-local.sh", "curl ", "git push",
        "--write-reviewed", "--no-publication-gate",
    ):  # fmt: skip
        assert forbidden not in text, forbidden
    assert not re.search(r"https?://", "\n".join(str(step.get("run", "")) for job in load()["jobs"].values() for step in job["steps"]))
    for job in load()["jobs"].values():
        for step in job["steps"]:
            action = step.get("uses", "actions/checkout@v4")
            assert re.fullmatch(r"actions/(?:checkout|setup-node|setup-python)@v[1-9][0-9]*", action) or action == SETUP_BUN, action


def test_every_script_ci_runs_exists():
    for job in load()["jobs"].values():
        for step in job["steps"]:
            for script in re.findall(r"(?:^|\s)(?:\./)?((?:scripts|scripts-tests)/[\w.-]+\.(?:py|mjs|sh))", str(step.get("run", ""))):
                assert (REPO_ROOT / script).is_file(), script


def test_the_ui_job_installs_with_bun_from_the_frozen_bun_lock():
    """The UI toolchain is bun: one pinned bun, a frozen bun.lock, no npm or npx.
    Node stays only as the runtime vitest, vite and tsc start on (jsdom needs it)."""
    ui = steps("ui")
    setup = [step for step in ui if step.get("uses", "").startswith("oven-sh/setup-bun@")]
    assert len(setup) == 1 and setup[0]["uses"] == SETUP_BUN
    assert setup[0]["with"] == {"bun-version": BUN_VERSION}
    node = next(step for step in ui if step.get("uses", "").startswith("actions/setup-node@"))
    assert "cache" not in node["with"] and "cache-dependency-path" not in node["with"]
    assert position("ui", "oven-sh/setup-bun@") < position("ui", "bun install --cwd app/ui --frozen-lockfile")
    for job in load()["jobs"].values():
        for step in job["steps"]:
            command = str(step.get("run", ""))
            assert not re.search(r"(?:^|\s)(?:npm|npx|yarn|pnpm)\s", command), command
            assert "node scripts/" not in command and "node --test" not in command, command
    text = CI.read_text(encoding="utf-8")
    assert "package-lock.json" not in text and "npm install -g bun" not in text
    assert (REPO_ROOT / "app/ui/bun.lock").is_file()
    assert not (REPO_ROOT / "app/ui/package-lock.json").exists()
    assert not (REPO_ROOT / "app/ui/bun.lockb").exists()
