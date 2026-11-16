"""CLI tests for scripts/check-permission-freeze.py (Spec 7 task 8.4).

Requirements 8.1-8.9 and 11.8. Each case runs the real script in a subprocess
against the repository's own inventory and against copies of app/app.json in a
temporary folder. Nothing in the repository is written; the app is never
installed, enabled or trusted.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "check-permission-freeze.py"
MANIFEST = REPO_ROOT / "app" / "app.json"
RECORD = REPO_ROOT / "docs" / "permission-freeze.json"
INVENTORY = REPO_ROOT / "spikes" / "fixtures" / "replay-permission-inventory.json"

sys.path.insert(0, str(REPO_ROOT / "scripts" / "lib"))
import permission_freeze as freeze  # noqa: E402


def run(*args: str | Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *map(str, args)],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


def write_manifest(folder: Path, change: Callable[[dict[str, Any]], None] | None = None) -> Path:
    data = json.loads(MANIFEST.read_bytes())
    if change is not None:
        change(data)
    path = folder / "app.json"
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return path


def test_the_committed_manifest_inventory_and_record_agree():
    result = run("--check")
    assert result.returncode == 0, result.stdout + result.stderr
    assert "accepted" in result.stdout


def test_check_is_the_default_action():
    assert run().returncode == 0


def test_the_committed_record_is_the_canonical_record_of_the_manifest():
    manifest_bytes = MANIFEST.read_bytes()
    manifest = json.loads(manifest_bytes)
    expected = freeze.render_freeze_record(freeze.build_freeze_record(manifest, manifest_bytes))
    assert RECORD.read_text(encoding="utf-8") == expected
    record = json.loads(expected)
    assert record["schemaVersion"] == 1
    assert record["frozenOn"] == "2026-11-29"
    assert record["appVersion"] == manifest["version"]
    assert record["permissions"]["api"] == sorted(manifest["permissions"]["api"])
    assert record["permissions"]["events"] == sorted(manifest["permissions"]["events"])
    assert record["permissions"]["sessionApproval"] is True
    assert record["permissions"]["storage"] is True


def test_the_rs_s2_inventory_passes_and_finds_nothing_unused_or_uncovered():
    report = json.loads(INVENTORY.read_text(encoding="utf-8"))
    assert report["spike"] == "RS-S2"
    assert report["result"] == "pass"
    for key in ("uncoveredCalls", "unusedApiEntries", "missingEvents", "extraEvents", "prohibitedReachable", "staticReplayConsumes"):
        assert report[key] == [], key
    assert all(call["coveredBy"] for call in report["gatewayCalls"])


def test_write_reviewed_reproduces_the_committed_files(tmp_path: Path):
    record = tmp_path / "freeze.json"
    inventory = tmp_path / "inventory.json"
    result = run("--write-reviewed", "--record", record, "--inventory-fixture", inventory)
    assert result.returncode == 0, result.stdout + result.stderr
    assert record.read_bytes() == RECORD.read_bytes()
    assert inventory.read_bytes() == INVENTORY.read_bytes()


def _add_api(entry: str) -> Callable[[dict[str, Any]], None]:
    return lambda data: data["permissions"]["api"].append(entry)


CASES: list[tuple[str, Callable[[dict[str, Any]], None], str]] = [
    ("spawn", _add_api("/api/spawn"), freeze.API_PROHIBITED),
    ("spawn children", _add_api("/api/spawn/*"), freeze.API_PROHIBITED),
    ("global approvals", _add_api("/api/approvals/*"), freeze.API_PROHIBITED),
    ("broad wildcard", _add_api("/api/*"), freeze.API_BROAD),
    ("extra path", _add_api("/api/config"), freeze.API_EXTRA),
    ("missing path", lambda data: data["permissions"]["api"].remove("/api/version"), freeze.API_MISSING),
    ("extra event", lambda data: data["permissions"]["events"].append("subagent_done"), freeze.EVENTS_EXTRA),
    ("missing event", lambda data: data["permissions"]["events"].remove("tool_call"), freeze.EVENTS_MISSING),
    ("no session approval", lambda data: data["permissions"].update(sessionApproval=False), freeze.SESSION_APPROVAL),
    ("no storage", lambda data: data["permissions"].pop("storage"), freeze.STORAGE),
    ("auto approve", lambda data: data["permissions"].update(autoApprove=["fs_write"]), freeze.AUTO_APPROVE),
    ("undeclared field", lambda data: data["permissions"].update(network=True), freeze.UNDECLARED_FIELD),
    ("standalone resources", lambda data: data.update(resources="standalone"), freeze.RESOURCE),
    ("standalone lifecycle", lambda data: data.update(lifecycle="standalone"), freeze.LIFECYCLE),
    ("old crew", lambda data: data.update(minKiroCrewVersion="0.12.0"), freeze.CREW_VERSION),
]


@pytest.mark.parametrize(("change", "category"), [case[1:] for case in CASES], ids=[case[0] for case in CASES])
def test_a_changed_manifest_is_refused(tmp_path: Path, change: Callable[[dict[str, Any]], None], category: str):
    manifest = write_manifest(tmp_path, change)
    result = run("--check", "--manifest", manifest)
    assert result.returncode == 1, result.stdout + result.stderr
    assert category in result.stdout
    # Refused generation writes nothing.
    record = tmp_path / "freeze.json"
    written = run("--write-reviewed", "--manifest", manifest, "--record", record, "--inventory-fixture", tmp_path / "i.json")
    assert written.returncode == 1
    assert not record.exists()
    assert not (tmp_path / "i.json").exists()


def test_a_permission_change_without_a_version_change_names_the_post_freeze_rule(tmp_path: Path):
    manifest = write_manifest(tmp_path, _add_api("/api/config"))
    result = run("--check", "--manifest", manifest)
    assert result.returncode == 1
    assert freeze.CHANGE_WITHOUT_VERSION in result.stdout


def test_any_manifest_edit_after_the_freeze_needs_a_new_record(tmp_path: Path):
    manifest = write_manifest(tmp_path, lambda data: data.update(version="0.1.1"))
    result = run("--check", "--manifest", manifest)
    assert result.returncode == 1
    assert freeze.RECORD_VERSION in result.stdout
    assert freeze.RECORD_MANIFEST_HASH in result.stdout

    # A newly reviewed record for the new version is accepted again.
    record = tmp_path / "freeze.json"
    inventory = tmp_path / "inventory.json"
    assert run("--write-reviewed", "--manifest", manifest, "--record", record, "--inventory-fixture", inventory).returncode == 0
    assert run("--check", "--manifest", manifest, "--record", record, "--inventory-fixture", inventory).returncode == 0
    assert json.loads(record.read_text(encoding="utf-8"))["appVersion"] == "0.1.1"


def test_a_missing_record_is_refused(tmp_path: Path):
    result = run("--check", "--record", tmp_path / "absent.json")
    assert result.returncode == 1
    assert freeze.RECORD_MISSING in result.stdout


def test_findings_never_print_manifest_values(tmp_path: Path):
    marker = "zqplantedmarkervalue"
    manifest = write_manifest(tmp_path, lambda data: (_add_api(f"/api/{marker}")(data), data.update(description=marker)))
    result = run("--check", "--manifest", manifest)
    assert result.returncode == 1
    assert marker not in result.stdout + result.stderr
    assert str(Path.home()) not in result.stdout + result.stderr


def test_usage_errors_exit_2(tmp_path: Path):
    assert run("--check", "--manifest", tmp_path / "absent.json").returncode == 2
    broken = tmp_path / "app.json"
    broken.write_text("{", encoding="utf-8")
    assert run("--check", "--manifest", broken).returncode == 2
    assert run("--check", "--write-reviewed").returncode == 2


def test_the_script_never_touches_crew_or_the_manifest():
    """Structural support: the CLI and its adapter name no install, enable or trust action."""

    text = SCRIPT.read_text(encoding="utf-8") + (REPO_ROOT / "scripts" / "lib" / "permission_io.py").read_text(encoding="utf-8")
    for forbidden in ("subprocess", "kirocrew app", "apps_trusted", "urllib", "http.client", "socket"):
        assert forbidden not in text, forbidden
    before = MANIFEST.read_bytes()
    run("--check")
    assert MANIFEST.read_bytes() == before
