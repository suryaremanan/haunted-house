"""The repository's own Submission Document Set and the check-submission CLI (Spec 7 task 9.3).

Requirements 7.2-7.8, 9.1-9.10, 11.6 and 12.1-12.11. These tests run the real
script on the real documents and on damaged copies in a temporary folder. They
follow no URL, run no documented command and write nothing in the repository.
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
SCRIPT = REPO_ROOT / "scripts" / "check-submission.py"
DOCS = REPO_ROOT / "docs"

sys.path.insert(0, str(REPO_ROOT / "scripts" / "lib"))
import submission_contract as contract  # noqa: E402

COPIED = ("README.md", "LICENSE", "docs", "scripts/install-local.sh", "app/app.json")


def run(*args: str | Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run([sys.executable, str(SCRIPT), *map(str, args)], capture_output=True, text=True, timeout=60, check=False, cwd="/")


@pytest.fixture
def copy(tmp_path: Path) -> Path:
    """A copy of what the checker reads, with every other path it tests for linked to the real one."""
    for name in COPIED:
        source, target = REPO_ROOT / name, tmp_path / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if source.is_dir():
            shutil.copytree(source, target)
        else:
            shutil.copy2(source, target)
    for name in (".kiro", ".github", "fixtures", "spikes", "scripts-tests"):
        os.symlink(REPO_ROOT / name, tmp_path / name)
    for folder in ("scripts", "app"):
        for entry in (REPO_ROOT / folder).iterdir():
            if not (tmp_path / folder / entry.name).exists():
                os.symlink(entry, tmp_path / folder / entry.name)
    return tmp_path


def edit(root: Path, name: str, old: str, new: str) -> None:
    path = root / name
    text = path.read_text(encoding="utf-8")
    assert old in text, f"{name} no longer contains {old!r}"
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


# --- The real documents ---------------------------------------------------------------


def test_the_repository_documents_are_accepted_from_any_directory():
    result = run()
    assert result.returncode == 0, result.stdout + result.stderr
    assert "accepted" in result.stdout


def test_the_release_check_fails_while_anything_is_pending_and_names_it():
    result = run("--release")
    assert result.returncode == 1
    # Publication is verified (18 Nov); screenshots and the video are still open.
    assert "docs/publication-metadata.json:1: release-item-pending" not in result.stdout
    assert "release-item-pending: screenshots" in result.stdout
    assert "release-item-pending: video" in result.stdout


def test_publication_metadata_is_verified_and_every_public_address_is_a_verified_one():
    metadata = json.loads((DOCS / "publication-metadata.json").read_text(encoding="utf-8"))
    assert metadata == {
        "schemaVersion": 1,
        "status": "verified",
        "repositoryUrl": "https://github.com/suryaremanan/haunted-house",
        "defaultBranch": "main",
        "cloneFolder": "haunted-house",
        "pagesUrl": "https://suryaremanan.github.io/haunted-house/",
        "public": True,
        "license": "MIT",
    }
    allowed = (metadata["repositoryUrl"], metadata["pagesUrl"])
    for path in [REPO_ROOT / "README.md", *DOCS.glob("*.md")]:
        text = path.read_text(encoding="utf-8")
        for url in re.findall(r"https?://[^\s)>|`]*github\.(?:com|io)/[^\s)>|`]*", text):
            assert url.rstrip(".,").startswith(allowed), (path.name, url)


def test_no_document_claims_a_screenshot_or_video_that_does_not_exist():
    manifest = json.loads((DOCS / "assets-manifest.json").read_text(encoding="utf-8"))
    for asset in manifest["assets"]:
        assert (REPO_ROOT / asset["path"]).is_file(), asset["path"]
    checklist = (DOCS / "assets-checklist.md").read_text(encoding="utf-8")
    for line in checklist.split("\n"):
        cells = [cell.strip().strip("`") for cell in line.split("|")]
        if len(cells) > 7 and cells[7] == "complete":
            assert (REPO_ROOT / cells[2]).is_file(), cells[2]
    assert not (DOCS / "screenshots").exists() or all((DOCS / "screenshots" / asset).is_file() for asset in [])
    for image in re.findall(r"!\[[^\]]*\]\(([^)]+)\)", "\n".join(path.read_text(encoding="utf-8") for path in [REPO_ROOT / "README.md", *DOCS.glob("*.md")])):
        assert (REPO_ROOT / image).is_file() or (DOCS / image).is_file(), image


def test_the_writeup_separates_live_checks_from_test_only_checks():
    text = (DOCS / "writeup.md").read_text(encoding="utf-8")
    status = text[text.index("## Verification status") :]
    assert "Checked against a running Crew gateway" in status
    assert "Not yet checked against a running Crew" in status
    assert "scripts/check-release.sh" in status
    # The known limits of the live app are stated plainly, not left out.
    for limit in ("brief.md", "answered only in Crew's own dashboard", "dashboard closed", "switched off", "Host hook shapes are unverified", "reflow"):
        assert limit in status, limit
    assert "no public link exists yet" in status


def test_the_readme_orders_the_judge_path():
    """Design, "Live judge installation": replay first, then requirements, command, trust."""
    text = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
    order = ["## Static replay", "## Live app requirements", "## Install", "scripts/install-local.sh", "## One-time trust step", "Apps → Library → Haunted House", "**Enable**", "**Trust**"]
    positions = [text.index(marker) for marker in order]
    assert positions == sorted(positions)
    assert "It does not change any Crew trust, approval, permission or security setting." in text


def test_readme_manifest_and_install_script_agree_on_the_crew_version_and_command():
    """Requirement 11.6."""
    readme = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
    manifest = json.loads((REPO_ROOT / "app" / "app.json").read_text(encoding="utf-8"))
    script = (REPO_ROOT / "scripts" / "install-local.sh").read_text(encoding="utf-8")
    minimum = manifest["minKiroCrewVersion"]
    assert f"Kiro Crew {minimum} or later" in readme
    assert f'MIN_CREW_VERSION="{minimum}"' in script
    command, _line = contract.install_command(readme)
    assert command == "scripts/install-local.sh"
    target = REPO_ROOT / command
    assert target.is_file() and os.access(target, os.X_OK)


def test_the_readme_permission_table_matches_the_manifest():
    readme = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
    manifest = json.loads((REPO_ROOT / "app" / "app.json").read_text(encoding="utf-8"))
    section = readme[readme.index("## Permissions") : readme.index("## Demo")]
    for entry in manifest["permissions"]["api"]:
        assert f"`{entry}`" in section
    for event in manifest["permissions"]["events"]:
        assert f"`{event}`" in section or (event.startswith("chat_") and "`chat_*`" in section), event
    for flag in ("sessionApproval", "storage"):
        assert manifest["permissions"][flag] is True and f"`{flag}`" in section
    # The README names no API path the manifest does not declare.
    assert set(re.findall(r"`(/[a-z][^`]*)`", section)) == set(manifest["permissions"]["api"])


def test_the_demo_script_is_under_three_minutes_with_the_design_beats():
    beats, problems = contract.demo_beats((DOCS / "demo-script.md").read_text(encoding="utf-8"))
    assert problems == []
    assert max(end for _line, _begin, end, _body in beats) == 165
    assert len(beats) == 7


def test_the_kiro_coverage_table_names_every_spec_steering_and_hooks():
    text = (DOCS / "kiro-coverage.md").read_text(encoding="utf-8")
    for spec in sorted(path.name for path in (REPO_ROOT / ".kiro" / "specs").iterdir() if path.is_dir()):
        assert f"`{spec}`" in text or f".kiro/specs/{spec}/" in text, spec
    assert ".kiro/steering/" in text and ".kiro/hooks/" in text


def test_the_documents_pass_the_repository_secret_scan():
    result = subprocess.run([sys.executable, str(REPO_ROOT / "scripts" / "secret_scan.py")], capture_output=True, text=True, timeout=120, check=False, cwd=REPO_ROOT)
    assert result.returncode == 0, result.stdout[-2000:]


# --- The CLI on damaged copies ---------------------------------------------------------------


def test_the_copy_is_accepted(copy: Path):
    result = run("--root", copy)
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.mark.parametrize(
    ("name", "old", "new", "finding"),
    [
        ("README.md", "```bash\nscripts/install-local.sh\n```", "```bash\nscripts/install-local.sh && rm -rf build\n```", ": install-command"),
        ("README.md", "Kiro Crew 0.12.1 or later", "Kiro Crew 0.11.0 or later", "crew-version-mismatch"),
        ("README.md", "[docs/credits.md](docs/credits.md)", "docs/credits.md", "missing-document-link: docs/credits.md"),
        ("docs/writeup.md", "## Accessibility", "## Access", "docs/writeup.md:1: missing-heading: Accessibility"),
        ("docs/writeup.md", "[kiro-coverage.md](kiro-coverage.md)", "[kiro-coverage.md](coverage.md)", "broken-link: docs/coverage.md"),
        ("docs/kiro-coverage.md", "| Demo evidence |", "| Demo |", "table-columns: Demo evidence"),
        ("docs/demo-script.md", "### 2:35–2:45", "### 2:35–3:05", "demo-duration: 185 seconds"),
        ("docs/demo-script.md", "### 0:35–1:05", "### 0:40–1:05", "demo-markers-not-contiguous"),
        ("docs/credits.md", "`app/assets/icon.png`", "the app icon", "uncredited-asset: app/assets/icon.png"),
        ("docs/assets-checklist.md", "| `door-approval` |", "| `door` |", "missing-checklist-key: door-approval"),
        ("docs/submission-checklist.md", "| `secret-scan` |", "| `scan` |", "missing-checklist-key: secret-scan"),
        ("docs/submission-checklist.md", "| 2026-11-30 | `feature-freeze` |", "| 2026-12-01 | `feature-freeze` |", "milestone-date: feature-freeze"),
        ("docs/submission-checklist.md", "| 2026-12-03 | `submission` |", "| 2026-12-05 | `submission` |", "milestone-order"),
        ("docs/submission-checklist.md", "| after MVP rehearsal | `stretch-polish` |", "| 2026-11-20 | `stretch-polish` |", "stretch-before-mvp"),
        ("docs/publication-metadata.json", '"cloneFolder": "haunted-house"', '"cloneFolder": "another-folder"', "publication-metadata-invalid"),
    ],
)
def test_a_damaged_document_fails_and_names_the_source_and_the_missing_element(copy: Path, name: str, old: str, new: str, finding: str):
    """Requirement 9.10."""
    edit(copy, name, old, new)
    result = run("--root", copy)
    assert result.returncode == 1
    assert finding in result.stdout, result.stdout
    assert any(line.startswith(name.split("/")[-1] if "/" not in name else name) or name in line for line in result.stdout.split("\n"))
    assert str(copy) not in result.stdout + result.stderr


@pytest.mark.parametrize("name", ["docs/writeup.md", "docs/kiro-coverage.md", "docs/demo-script.md", "docs/credits.md", "docs/assets-checklist.md", "docs/submission-checklist.md", "docs/assets-manifest.json", "docs/permission-freeze.json", "docs/publication-metadata.json", "LICENSE"])
def test_a_missing_document_fails(copy: Path, name: str):
    (copy / name).unlink()
    result = run("--root", copy)
    assert result.returncode == 1
    assert f"{name}:1: missing-file" in result.stdout


def test_an_invented_public_link_fails(copy: Path):
    edit(copy, "README.md", "The source is at https://github.com/suryaremanan/haunted-house.", "The source is at https://invented-owner.github.io/haunted-house/.")
    result = run("--root", copy)
    assert result.returncode == 1
    assert "unverified-public-url" in result.stdout
    assert "invented-owner" not in result.stdout


def test_usage_errors_exit_2(tmp_path: Path):
    assert run("--root", tmp_path / "absent").returncode == 2
    assert run("--publish").returncode == 2


def test_the_checker_never_runs_a_command_or_opens_a_connection():
    """Structural support: no process, shell, evaluation or network module in the checker."""
    text = SCRIPT.read_text(encoding="utf-8") + (REPO_ROOT / "scripts" / "lib" / "submission_contract.py").read_text(encoding="utf-8")
    for forbidden in ("subprocess", "os.system", "eval(", "exec(", "shlex", "urllib.request", "http.client", "socket", "requests"):
        assert forbidden not in text, forbidden
