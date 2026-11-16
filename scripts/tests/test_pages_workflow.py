"""Policy tests for .github/workflows/pages.yml (Spec 7 task 7.3).

Requirements 6.1-6.5 and 6.8. The workflow file is parsed and checked as data:
triggers, per-job permission scopes, the build -> deploy -> smoke chain, the
`github-pages` environment, deployment concurrency, the audited artifact path,
the deployment URL flow and the absence of secrets. Nothing is pushed, deployed
or requested; the commands each job would run are tested by their own suites.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = REPO_ROOT / ".github" / "workflows"
PAGES = WORKFLOWS / "pages.yml"
ARTIFACT_PATH = "app/ui/dist-replay"

sys.path.insert(0, str(REPO_ROOT / "scripts" / "lib"))
from workflow_yaml import WorkflowYamlError, parse_workflow  # noqa: E402

# First-party actions, each pinned to an explicit major version or a full commit
# SHA, plus one third-party action: bun's official installer, pinned to the
# commit of its v2.2.0 tag (never a moving tag), the same pin as Normal CI.
PINNED_ACTION = re.compile(r"actions/[a-z-]+@(?:v[1-9][0-9]*|[0-9a-f]{40})")
SETUP_BUN = "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6"
PAGES_ACTIONS = {"actions/configure-pages", "actions/upload-pages-artifact", "actions/deploy-pages"}


def load(path: Path = PAGES) -> dict[str, Any]:
    return parse_workflow(path.read_text(encoding="utf-8"))


def steps(job: dict[str, Any]) -> list[dict[str, Any]]:
    return job["steps"]


def runs(job: dict[str, Any]) -> list[str]:
    return [step["run"].strip() for step in steps(job) if "run" in step]


def uses(job: dict[str, Any]) -> list[str]:
    return [step["uses"] for step in steps(job) if "uses" in step]


def index_of(job: dict[str, Any], marker: str) -> int:
    for position, step in enumerate(steps(job)):
        if marker in str(step.get("run", "")) or str(step.get("uses", "")).startswith(marker):
            return position
    raise AssertionError(f"no step holds {marker!r}")


# --- The file ------------------------------------------------------------------


def test_the_workflow_is_separate_from_normal_ci():
    assert sorted(path.name for path in WORKFLOWS.glob("*.y*ml")) == ["ci.yml", "pages.yml"]
    assert load()["name"] == "Pages"


def test_it_runs_on_default_branch_pushes_and_manual_dispatch_only():
    """Requirement 6.1."""
    workflow = load()
    assert set(workflow["on"]) == {"push", "workflow_dispatch"}
    assert workflow["on"]["push"] == {"branches": ["main"]}
    assert workflow["on"]["workflow_dispatch"] is None
    # The branch is also verified against the repository's real default branch at run time.
    condition = workflow["jobs"]["build"]["if"]
    assert "github.event.repository.default_branch" in condition
    assert "github.ref ==" in condition


def test_it_has_exactly_build_deploy_and_smoke_in_a_chain():
    """Requirements 6.2, 6.4 and 6.5: a failed job stops every later one."""
    jobs = load()["jobs"]
    assert list(jobs) == ["build", "deploy", "smoke"]
    assert "needs" not in jobs["build"]
    assert jobs["deploy"]["needs"] == "build"
    assert jobs["smoke"]["needs"] == "deploy"
    for name, job in jobs.items():
        assert job["runs-on"] == "ubuntu-latest", name
        assert isinstance(job["timeout-minutes"], int) and 1 <= job["timeout-minutes"] <= 15, name
        assert "continue-on-error" not in job, name
        for step in steps(job):
            assert "continue-on-error" not in step, name
            assert "if" not in step, name
    # Only the build job carries a condition; a skipped build skips deploy and smoke through `needs`.
    assert "if" not in jobs["deploy"] and "if" not in jobs["smoke"]


def test_permissions_are_least_privilege_per_job():
    """Requirement 6.3."""
    workflow = load()
    assert workflow["permissions"] == {"contents": "read"}
    jobs = workflow["jobs"]
    assert jobs["build"]["permissions"] == {"contents": "read"}
    assert jobs["smoke"]["permissions"] == {"contents": "read"}
    assert jobs["deploy"]["permissions"] == {"pages": "write", "id-token": "write"}
    for name in ("build", "smoke"):
        assert "write" not in jobs[name]["permissions"].values(), name


def test_deployments_never_overlap_or_cancel():
    """Requirement 6.8."""
    workflow = load()
    assert workflow["concurrency"] == {"group": "pages", "cancel-in-progress": False}
    assert "${{" not in workflow["concurrency"]["group"]


def test_the_deploy_job_uses_the_github_pages_environment_and_exposes_the_url():
    """Requirements 6.4 and 6.8."""
    deploy = load()["jobs"]["deploy"]
    assert deploy["environment"] == {"name": "github-pages", "url": "${{ steps.deployment.outputs.page_url }}"}
    assert deploy["outputs"] == {"page_url": "${{ steps.deployment.outputs.page_url }}"}
    assert len(steps(deploy)) == 1
    step = steps(deploy)[0]
    assert step["id"] == "deployment"
    assert step["uses"].startswith("actions/deploy-pages@")
    assert "run" not in step and "with" not in step


def test_the_build_job_installs_locked_dependencies_and_audits_before_upload():
    """Requirement 6.2: locked install, tests, typecheck, build, gate, smoke, then upload."""
    build = load()["jobs"]["build"]
    order = [
        "actions/checkout@",
        "oven-sh/setup-bun@",
        "actions/setup-node@",
        "bun install --cwd app/ui --frozen-lockfile",
        "bun run --cwd app/ui typecheck",
        "bun run --cwd app/ui test",
        "bun test ./scripts-tests/smoke-replay-site.test.mjs",
        "python3 scripts/build_replay_fixture.py --check",
        "bun run --cwd app/ui build:replay",
        f"bun scripts/check-replay-artifact.mjs {ARTIFACT_PATH}",
        f"bun scripts/smoke-replay-site.mjs --local {ARTIFACT_PATH}",
        "actions/configure-pages@",
        "actions/upload-pages-artifact@",
    ]
    positions = [index_of(build, marker) for marker in order]
    assert positions == sorted(positions), dict(zip(order, positions))
    # The upload is the last step, after every check.
    assert positions[-1] == len(steps(build)) - 1
    assert "npm install" not in "\n".join(runs(build))
    for command in runs(build):
        assert not re.search(r"(?:^|\s)(?:npm|npx|yarn|pnpm)\s", command), command
        assert not command.startswith(("bun add", "bun install")) or command == "bun install --cwd app/ui --frozen-lockfile", command
    assert "package-lock.json" not in PAGES.read_text(encoding="utf-8")


def test_only_the_audited_replay_folder_is_uploaded():
    """Requirement 6.2."""
    build = load()["jobs"]["build"]
    uploads = [step for step in steps(build) if step.get("uses", "").startswith("actions/upload-pages-artifact@")]
    assert len(uploads) == 1
    assert uploads[0]["with"] == {"path": ARTIFACT_PATH}
    gate = f"bun scripts/check-replay-artifact.mjs {ARTIFACT_PATH}"
    assert gate in runs(build)
    # The gate runs with its Python Publication Gate: the flag that skips it is absent.
    assert "--no-publication-gate" not in PAGES.read_text(encoding="utf-8")
    for name in ("deploy", "smoke"):
        assert not any("upload" in action for action in uses(load()["jobs"][name])), name


def test_the_smoke_job_requests_only_the_deployment_output_url_within_a_bound():
    """Requirement 6.4."""
    smoke = load()["jobs"]["smoke"]
    request = [step for step in steps(smoke) if "smoke-replay-site.mjs" in str(step.get("run", ""))]
    assert len(request) == 1
    assert request[0]["env"] == {"PAGE_URL": "${{ needs.deploy.outputs.page_url }}"}
    command = request[0]["run"].strip()
    assert command == 'bun scripts/smoke-replay-site.mjs --url "$PAGE_URL" --timeout-ms 180000'
    # The expression is passed through the environment, never pasted into the shell line.
    assert "${{" not in command
    assert not re.search(r"https?://", command)


def test_checkouts_keep_no_credentials_and_bun_and_node_match_normal_ci():
    workflow = load()
    ci = parse_workflow((WORKFLOWS / "ci.yml").read_text(encoding="utf-8"))
    ci_node = next(step for step in ci["jobs"]["ui"]["steps"] if step.get("uses", "").startswith("actions/setup-node@"))
    ci_bun = next(step for step in ci["jobs"]["ui"]["steps"] if step.get("uses", "").startswith("oven-sh/setup-bun@"))
    assert ci_bun["uses"] == SETUP_BUN
    for name in ("build", "smoke"):
        job = workflow["jobs"][name]
        checkout = [step for step in steps(job) if step.get("uses", "").startswith("actions/checkout@")]
        assert len(checkout) == 1, name
        assert checkout[0]["with"] == {"persist-credentials": False}, name
        bun = next(step for step in steps(job) if step.get("uses", "").startswith("oven-sh/setup-bun@"))
        assert bun["uses"] == ci_bun["uses"], name
        assert bun["with"] == ci_bun["with"], name
    # The build job runs vitest, vite and tsc, which start on Node: the same Node as Normal CI.
    build_node = next(step for step in steps(workflow["jobs"]["build"]) if step.get("uses", "").startswith("actions/setup-node@"))
    assert build_node["uses"] == ci_node["uses"]
    assert build_node["with"] == ci_node["with"]
    # The deployed smoke only runs one .mjs script, which bun runs on its own.
    assert not any(action.startswith("actions/setup-node@") for action in uses(workflow["jobs"]["smoke"]))
    assert not any(action.startswith("actions/checkout@") for action in uses(workflow["jobs"]["deploy"]))


def test_every_action_is_first_party_and_pinned():
    """Requirement 6.2 and the repository's action policy (explicit major tags, or full SHAs)."""
    workflow = load()
    seen = set()
    for name, job in workflow["jobs"].items():
        for action in uses(job):
            assert PINNED_ACTION.fullmatch(action) or action == SETUP_BUN, f"{name}: {action}"
            seen.add(action.split("@")[0])
    assert PAGES_ACTIONS <= seen
    assert seen <= PAGES_ACTIONS | {"actions/checkout", "actions/setup-node", "actions/setup-python", "oven-sh/setup-bun"}


def test_the_workflow_uses_no_secret_token_or_write_command():
    text = PAGES.read_text(encoding="utf-8")
    for forbidden in ("secrets.", "GITHUB_TOKEN", "github.token", "pull_request_target", "workflow_run", "git push", "gh ", "curl ", "kirocrew"):
        assert forbidden not in text, forbidden
    workflow = load()
    assert workflow["defaults"] == {"run": {"shell": "bash"}}
    # Expressions appear only where the deployment URL flows and in the default-branch guard.
    expressions = re.findall(r"\$\{\{\s*(.*?)\s*\}\}", text)
    assert set(expressions) == {"steps.deployment.outputs.page_url", "needs.deploy.outputs.page_url"}


def test_every_script_a_job_runs_exists():
    for job in load()["jobs"].values():
        for command in runs(job):
            for script in re.findall(r"(?:bun(?: test)?|node(?: --test)?|python3?) (?:\./)?((?:scripts|scripts-tests)/[\w./-]+)", command):
                assert (REPO_ROOT / script).is_file(), script


# --- The reader ------------------------------------------------------------------


@pytest.mark.skipif(shutil.which("ruby") is None, reason="needs ruby for an independent YAML parse")
@pytest.mark.parametrize("name", ["ci.yml", "pages.yml"])
def test_the_subset_reader_agrees_with_a_full_yaml_parser(name: str):
    program = 'require "yaml"; require "json"; d = YAML.load_file(ARGV[0]); d["on"] = d.delete(true) if d.key?(true); puts JSON.generate(d)'
    result = subprocess.run(["ruby", "-e", program, str(WORKFLOWS / name)], capture_output=True, text=True, timeout=30, check=True)
    assert load(WORKFLOWS / name) == json.loads(result.stdout)


@pytest.mark.parametrize(
    "text",
    [
        "a: &anchor 1\n",
        "a: *alias\n",
        "a: !!str 1\n",
        "a: {b: 1}\n",
        "a: >\n  folded\n",
        "a: 1\na: 2\n",
        "a:\n\tb: 1\n",
        "---\na: 1\n",
        "- a\n",
        "a: [1, [2]]\n",
        'a: "x\\n"\n',
        "a: 'open\n",
        "a:\n  b: 1\n c: 2\n",
    ],
)
def test_the_subset_reader_refuses_what_it_cannot_read(text: str):
    with pytest.raises(WorkflowYamlError):
        parse_workflow(text)


def test_the_subset_reader_reads_scalars_blocks_and_comments():
    text = (
        "# heading\n"
        "on: [push, pull_request]\n"
        "name: 'it''s'  # trailing\n"
        "count: 10\n"
        "flag: false\n"
        "empty:\n"
        "jobs:\n"
        "  a:\n"
        "    steps:\n"
        "      - uses: actions/checkout@v4\n"
        "        with:\n"
        "          persist-credentials: false\n"
        "      - name: run it\n"
        "        run: |\n"
        "          echo one # kept\n"
        "\n"
        "          echo two\n"
        "      - run: echo \"a: b\"\n"
    )
    assert parse_workflow(text) == {
        "on": ["push", "pull_request"],
        "name": "it's",
        "count": 10,
        "flag": False,
        "empty": None,
        "jobs": {
            "a": {
                "steps": [
                    {"uses": "actions/checkout@v4", "with": {"persist-credentials": False}},
                    {"name": "run it", "run": "echo one # kept\n\necho two\n"},
                    {"run": 'echo "a: b"'},
                ]
            }
        },
    }
