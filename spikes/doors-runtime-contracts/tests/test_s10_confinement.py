from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

SPIKE_ROOT = Path(__file__).resolve().parents[1]
if str(SPIKE_ROOT) not in sys.path:
    sys.path.insert(0, str(SPIKE_ROOT))

import confined_runner  # noqa: E402
from confined_runner import (  # noqa: E402
    TRUSTED_ENV,
    build_profile,
    find_multiply_linked,
    run_confined,
    sandbox_available,
)
from s10_probe import decide, unavailable_report  # noqa: E402

FIXTURE = SPIKE_ROOT.parent / "fixtures" / "s10-approved-process-confinement.json"
needs_sandbox = pytest.mark.skipif(not sandbox_available(), reason="sandbox-exec unavailable")


@pytest.fixture()
def mansion(tmp_path: Path) -> Path:
    root = tmp_path.resolve() / "mansions" / "alpha"
    (root / "src").mkdir(parents=True)
    (root / ".haunted-house").mkdir()
    (root / "src" / "inside.txt").write_text("inside\n", encoding="utf-8")
    (root.parent / "beta").mkdir()
    (root.parent / "beta" / "outside.txt").write_text("outside\n", encoding="utf-8")
    return root


def test_profile_is_deny_default_without_fork_or_network() -> None:
    profile = build_profile(allow_fork=False, git_write=False, tool_roots=["/opt/tool"])

    assert "(deny default)" in profile
    assert "process-fork" not in profile and "network" not in profile and "mach-lookup" not in profile
    assert '(deny file-write* (subpath (param "GITDIR")))' in profile
    assert profile.index('(allow file-write* (subpath (param "MANSION")))') < profile.index("PRIVATE")
    assert "GITDIR" not in build_profile(allow_fork=False, git_write=True, tool_roots=[])


@pytest.mark.parametrize("root", ['/opt/"quote', "relative/root", "/opt/back\\slash"])
def test_profile_refuses_unsafe_tool_roots(root: str) -> None:
    with pytest.raises(ValueError):
        build_profile(allow_fork=False, git_write=False, tool_roots=[root])


@pytest.mark.parametrize("argv", [[], ["cat", "x"], ["/bin/cat", "a\x00b"]])
def test_runner_refuses_non_exact_commands(mansion: Path, argv: list[str]) -> None:
    assert run_confined(argv, mansion=mansion, cwd=mansion).code == "invalid_command"


def test_runner_refuses_cwd_outside_or_linked(mansion: Path) -> None:
    link = mansion / "src" / "up"
    link.symlink_to(mansion.parent / "beta")

    assert run_confined(["/usr/bin/true"], mansion=mansion, cwd=mansion.parent / "beta").code == "cwd_denied"
    assert run_confined(["/usr/bin/true"], mansion=mansion, cwd=link).code == "cwd_denied"
    assert run_confined(["/usr/bin/true"], mansion=mansion / "missing", cwd=mansion).code == "mansion_unavailable"


def test_missing_sandbox_starts_no_process(mansion: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(confined_runner, "sandbox_available", lambda: False)
    marker = mansion / "src" / "ran.txt"

    result = run_confined(["/usr/bin/touch", str(marker)], mansion=mansion, cwd=mansion)

    assert (result.status, result.code) == ("refused", "confinement_unavailable")
    assert not marker.exists()


def test_hard_link_scan_finds_second_names(mansion: Path) -> None:
    assert find_multiply_linked(mansion) is False
    os.link(mansion.parent / "beta" / "outside.txt", mansion / "src" / "alias.txt")
    assert find_multiply_linked(mansion) is True


@needs_sandbox
def test_confined_command_reads_inside_and_is_refused_outside(mansion: Path) -> None:
    outside = mansion.parent / "beta" / "outside.txt"

    inside = run_confined(["/bin/cat", "src/inside.txt"], mansion=mansion, cwd=mansion)
    denied = run_confined(["/bin/cat", str(outside)], mansion=mansion, cwd=mansion)
    control = run_confined(["/bin/cat", str(outside)], mansion=mansion, cwd=mansion, confine=False)

    assert (inside.returncode, inside.output) == (0, "inside\n")
    assert denied.returncode != 0 and "outside" not in denied.output.splitlines()
    assert (control.returncode, control.output) == (0, "outside\n")


@needs_sandbox
def test_confined_writes_stop_at_mansion_and_protected_paths(mansion: Path) -> None:
    def touch(path: Path, **options: bool) -> int | None:
        return run_confined(["/usr/bin/touch", str(path)], mansion=mansion, cwd=mansion, **options).returncode

    (mansion / ".git").mkdir()
    assert touch(mansion / "src" / "new.txt") == 0
    assert touch(mansion.parent / "beta" / "new.txt") != 0
    assert touch(mansion / ".haunted-house" / "state") != 0
    assert touch(mansion / ".git" / "x") != 0
    assert touch(mansion / ".git" / "x", git_write=True) == 0
    assert not (mansion.parent / "beta" / "new.txt").exists()


@needs_sandbox
def test_confined_command_cannot_fork_and_gets_fixed_environment(mansion: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HH_S10_PARENT_SENTINEL", "present")

    # A lone command would be exec'ed in place; a pipeline forces sh to fork.
    forked = run_confined(["/bin/sh", "-c", "/bin/ls | /usr/bin/wc -l"], mansion=mansion, cwd=mansion)
    env = run_confined(["/usr/bin/env"], mansion=mansion, cwd=mansion)
    names = {line.split("=", 1)[0] for line in env.output.splitlines()}

    assert forked.returncode != 0
    assert names - {"__CF_USER_TEXT_ENCODING"} == set(TRUSTED_ENV)


@needs_sandbox
def test_hard_link_refuses_start_and_timeout_is_reported(mansion: Path) -> None:
    slow = run_confined(["/bin/sleep", "5"], mansion=mansion, cwd=mansion, timeout=0.5)
    os.link(mansion.parent / "beta" / "outside.txt", mansion / "src" / "alias.txt")
    refused = run_confined(["/usr/bin/touch", "src/alias.txt"], mansion=mansion, cwd=mansion)

    assert (slow.status, slow.code) == ("timeout", "timed_out")
    assert (refused.status, refused.code) == ("refused", "hard_link_present")


def _checks(**overrides: bool) -> dict[str, dict[str, bool]]:
    checks = {
        "files": {"a": True},
        "network": {"a": True},
        "process": {"detachedChildOutlivesRunnerWhenForkAllowed": True, "forkDeniedByDefault": True},
        "links": {"preexistingHardLinkDefeatsSandboxAlone": True, "startRefusedWhileHardLinkPresent": True},
        "environment": {"a": True},
        "git": {"gitCommitWorksWithoutFork": True, "plantedFsmonitorRunsInUnconfinedControl": True},
    }
    for dotted, value in overrides.items():
        section, name = dotted.split("__")
        checks[section][name] = value
    return checks


def test_decision_disables_command_and_git_when_confinement_is_unproved() -> None:
    proven = decide(_checks())
    no_network = decide(_checks(network__a=False))
    no_git = decide(_checks(git__gitCommitWorksWithoutFork=False))

    assert proven["run_command"] == "enabled_no_fork_profile_only"
    assert proven["git_write"] == "enabled_add_commit_no_fork_profile_only"
    assert proven["forkAllowedMode"] == "never_offered"
    assert no_network["run_command"] == no_network["git_write"] == "disabled_confinement_unavailable"
    assert no_git["run_command"].startswith("enabled")
    assert no_git["git_write"] == "disabled_confinement_unavailable"
    for decision in (proven, no_network, no_git, unavailable_report()["decision"]):
        assert decision["delete_path"] == "enabled_independent_of_confinement"
    assert unavailable_report()["decision"]["run_command"] == "disabled_confinement_unavailable"


def test_committed_fixture_is_scrubbed_and_records_the_decision() -> None:
    text = FIXTURE.read_text(encoding="utf-8")
    fixture = json.loads(text)

    assert str(Path.home()) not in text and "/private/" not in text.replace("/private/etc", "")
    assert fixture["spike"] == "S10" and fixture["failedChecks"] == []
    assert fixture["decision"]["delete_path"] == "enabled_independent_of_confinement"
    assert fixture["decision"]["otherPlatforms"] == "disabled_confinement_unavailable"
    assert fixture["decision"]["requiresStartupCanary"] is True
    assert fixture["checks"]["process"]["detachedChildOutlivesRunnerWhenForkAllowed"] is True
    assert fixture["decision"]["forkAllowedMode"] == "never_offered"
