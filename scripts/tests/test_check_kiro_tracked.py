"""Example tests for scripts/check-kiro-tracked.sh.

Each test builds a throwaway git repo under tmp_path and runs the script by
absolute path from inside it. Git config is isolated: HOME and
XDG_CONFIG_HOME point into tmp_path, the system config is off and the global
config is the null device, so the developer's own ignore rules can't change
the results. GIT_CEILING_DIRECTORIES stops git from finding a repo above
tmp_path.

Exit codes under test: 0 nothing ignored, 1 something under .kiro/ ignored,
2 the check could not run.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "check-kiro-tracked.sh"
PREFIX = "check-kiro-tracked:"
OK_LINE = f"{PREFIX} OK: nothing under .kiro/ is ignored."

pytestmark = pytest.mark.skipif(shutil.which("git") is None, reason="git is not installed")


def _isolated_env(tmp_path: Path) -> dict[str, str]:
    home = tmp_path / "home"
    xdg = tmp_path / "xdg"
    home.mkdir()
    xdg.mkdir()
    # Drop GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE and friends, which are set
    # when pytest itself runs from a git hook.
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    env.update(
        HOME=str(home),
        XDG_CONFIG_HOME=str(xdg),
        GIT_CONFIG_NOSYSTEM="1",
        GIT_CONFIG_GLOBAL=os.devnull,
        GIT_CEILING_DIRECTORIES=str(tmp_path.resolve()),
        GIT_AUTHOR_NAME="Test",
        GIT_AUTHOR_EMAIL="test@example.invalid",
        GIT_COMMITTER_NAME="Test",
        GIT_COMMITTER_EMAIL="test@example.invalid",
        LC_ALL="C",
    )
    return env


def run_check(cwd: Path, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(SCRIPT)], cwd=cwd, env=env, capture_output=True, text=True, timeout=30
    )


def hits(result: subprocess.CompletedProcess[str]) -> set[str]:
    """The `<source>:<line>:<pattern>  <path>` lines, without the summary."""
    return {line for line in result.stdout.splitlines() if not line.startswith(PREFIX)}


@dataclass
class Repo:
    root: Path
    env: dict[str, str]

    def write(self, rel: str, text: str = "x\n") -> Path:
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        return path

    def git(self, *args: str) -> str:
        return subprocess.run(
            ["git", *args],
            cwd=self.root,
            env=self.env,
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        ).stdout

    def check(self, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
        return run_check(cwd or self.root, self.env)


@pytest.fixture
def env(tmp_path: Path) -> dict[str, str]:
    return _isolated_env(tmp_path)


@pytest.fixture
def repo(tmp_path: Path, env: dict[str, str]) -> Repo:
    root = tmp_path / "repo"
    root.mkdir()
    r = Repo(root, env)
    r.git("init", "-q")
    return r


def assert_passes(result: subprocess.CompletedProcess[str]) -> None:
    assert result.returncode == 0, result
    assert result.stdout.splitlines() == [OK_LINE]
    assert result.stderr == ""


def assert_fails(result: subprocess.CompletedProcess[str]) -> None:
    assert result.returncode == 1, result
    summary = [line for line in result.stdout.splitlines() if line.startswith(PREFIX)]
    assert len(summary) == 1 and f"{PREFIX} FAIL: git ignores {len(hits(result))} " in summary[0]


# --- exit 0 ------------------------------------------------------------------


def test_clean_repo_passes(repo: Repo) -> None:
    repo.write(".kiro/steering/a.md")
    repo.write(".gitignore", "node_modules/\ndist/\n")
    assert_passes(repo.check())


def test_repo_without_kiro_folder_passes(repo: Repo) -> None:
    repo.write("README.md")
    assert_passes(repo.check())


def test_negation_that_reincludes_kiro_passes(repo: Repo) -> None:
    # *.md alone would ignore .kiro/specs/x.md; the later !.kiro/** wins and
    # the script skips negation matches.
    repo.write(".kiro/specs/x.md")
    repo.write(".gitignore", "*.md\n!.kiro/**\n")
    assert_passes(repo.check())


# --- exit 1 ------------------------------------------------------------------


def test_kiro_folder_ignored_fails_and_names_every_path(repo: Repo) -> None:
    repo.write(".kiro/steering/a.md")
    repo.write(".kiro/specs/x.md")
    repo.write(".gitignore", ".kiro/\n")
    result = repo.check()
    assert_fails(result)
    rule = ".gitignore:1:.kiro/  "
    assert hits(result) == {
        rule + p for p in (".kiro", ".kiro/", ".kiro/.probe", ".kiro/steering/a.md", ".kiro/specs/x.md")
    }


def test_kiro_rule_caught_even_when_folder_is_missing(repo: Repo) -> None:
    # The probe paths catch a rule that would ignore .kiro/ once it exists.
    repo.write(".gitignore", ".kiro/\n")
    result = repo.check()
    assert_fails(result)
    assert ".gitignore:1:.kiro/  .kiro/.probe" in hits(result)


def test_wildcard_ignoring_one_spec_file_fails(repo: Repo) -> None:
    repo.write(".kiro/specs/x.md")
    repo.write(".kiro/hooks/h.json", "{}\n")
    repo.write(".gitignore", "node_modules/\n*.md\n")
    result = repo.check()
    assert_fails(result)
    assert hits(result) == {".gitignore:2:*.md  .kiro/specs/x.md"}


def test_negation_inside_ignored_folder_still_fails(repo: Repo) -> None:
    # Git can't re-include a file whose parent folder is excluded, so the
    # negation doesn't help and the folder rule is reported for the file.
    repo.write(".kiro/specs/x.md")
    repo.write(".gitignore", ".kiro/\n!.kiro/specs/x.md\n")
    result = repo.check()
    assert_fails(result)
    assert ".gitignore:1:.kiro/  .kiro/specs/x.md" in hits(result)
    assert all(":!" not in line for line in hits(result))


def test_rule_in_info_exclude_fails_with_that_source(repo: Repo) -> None:
    repo.write(".kiro/steering/a.md")
    (repo.root / ".git" / "info").mkdir(exist_ok=True)
    (repo.root / ".git" / "info" / "exclude").write_text(".kiro/\n")
    result = repo.check()
    assert_fails(result)
    assert ".git/info/exclude:1:.kiro/  .kiro/steering/a.md" in hits(result)


def test_rule_in_global_excludes_file_fails_with_that_source(
    repo: Repo, env: dict[str, str]
) -> None:
    repo.write(".kiro/steering/a.md")
    global_ignore = Path(env["XDG_CONFIG_HOME"]) / "git" / "ignore"
    global_ignore.parent.mkdir(parents=True)
    global_ignore.write_text(".kiro/\n")
    result = repo.check()
    assert_fails(result)
    assert f"{global_ignore}:1:.kiro/  .kiro/steering/a.md" in hits(result)


def test_committed_file_that_is_now_ignored_fails(repo: Repo) -> None:
    repo.write(".kiro/steering/a.md")
    repo.git("add", ".kiro")
    repo.git("commit", "-q", "-m", "add steering")
    assert repo.git("ls-files", ".kiro").splitlines() == [".kiro/steering/a.md"]
    repo.write(".gitignore", ".kiro/steering/\n")
    result = repo.check()
    assert_fails(result)
    assert ".gitignore:1:.kiro/steering/  .kiro/steering/a.md" in hits(result)


def test_path_with_spaces_is_reported_unquoted(repo: Repo) -> None:
    repo.write(".kiro/specs/my spec/notes draft.md")
    repo.write(".gitignore", "*.md\n")
    result = repo.check()
    assert_fails(result)
    assert hits(result) == {".gitignore:1:*.md  .kiro/specs/my spec/notes draft.md"}


# --- exit 2 and working directory ---------------------------------------------


def test_outside_a_git_repo_exits_2(tmp_path: Path, env: dict[str, str]) -> None:
    outside = tmp_path / "outside"
    outside.mkdir()
    result = run_check(outside, env)
    assert result.returncode == 2, result
    assert result.stdout == ""
    assert "not inside a git work tree" in result.stderr


@pytest.mark.parametrize("gitignore", ["*.md\n", "*.md\n!.kiro/**\n"], ids=["ignored", "clean"])
def test_subfolder_gives_same_result_as_root(repo: Repo, gitignore: str) -> None:
    repo.write(".kiro/specs/x.md")
    repo.write("app/ui/src/main.ts")
    repo.write(".gitignore", gitignore)
    at_root = repo.check()
    for sub in ("app/ui/src", ".kiro/specs"):
        at_sub = repo.check(repo.root / sub)
        assert (at_sub.returncode, at_sub.stdout) == (at_root.returncode, at_root.stdout), sub
