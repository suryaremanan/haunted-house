"""Run Crew's real install/update seams inside an isolated data home.

This worker must run with Crew's own Python interpreter.  Its stdout contract is
scrubbed JSON; implementation errors are reduced to stable codes so paths and
app secrets never cross the probe boundary.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

APP_NAME = "mansion-data-persistence-probe"
APP_DATA_LABEL = "<app-root>/data"


class ProbeFailure(RuntimeError):
    """A stable, path-free probe failure."""


def _run_backend(app_root: Path, operation: str) -> dict[str, Any]:
    entry = app_root / "backend" / "backend_service.py"
    completed = subprocess.run(
        [sys.executable, "-I", str(entry), operation],
        cwd=app_root,
        env=os.environ.copy(),
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    if completed.returncode != 0:
        raise ProbeFailure(f"backend_{operation}_failed")
    try:
        report = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise ProbeFailure(f"backend_{operation}_invalid_report") from exc
    expected_keys = {
        "status",
        "operation",
        "dataDirectory",
        "schemaVersion",
        "registryDigest",
    }
    if (
        not isinstance(report, dict)
        or set(report) != expected_keys
        or report.get("status") != "ok"
        or report.get("operation") != operation
        or report.get("dataDirectory") != APP_DATA_LABEL
        or report.get("schemaVersion") != 1
        or not isinstance(report.get("registryDigest"), str)
        or len(report["registryDigest"]) != 64
    ):
        raise ProbeFailure(f"backend_{operation}_unsafe_report")
    return report


def _success_report(crew_version: str) -> dict[str, object]:
    return {
        "status": "verified",
        "crewVersion": crew_version,
        "verifiedPersistentLocation": APP_DATA_LABEL,
        "registrySchemaVersion": 1,
        "registryEquivalent": True,
        "backendRestartPreserved": True,
        "updateLifecycle": "exercised",
        "updatePreserved": True,
        "isolatedDataHome": True,
        "decision": "implementation_may_proceed",
    }


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if len(args) != 2:
        print(json.dumps({"status": "unverified", "code": "invalid_worker_arguments"}))
        return 2

    source_v1 = Path(args[0])
    source_v2 = Path(args[1])
    try:
        from kiro_crew import __version__ as crew_version
        from kiro_crew.apps.manager import app_data_dir, app_dir, install_app, update_app

        if not callable(update_app):
            raise ProbeFailure("update_lifecycle_unavailable")

        install_result = install_app(source_v1, expected_name=APP_NAME)
        if not install_result.ok:
            raise ProbeFailure("install_failed")

        installed_root = app_dir(APP_NAME)
        resolved_root = installed_root.resolve(strict=True)
        resolved_data = app_data_dir(APP_NAME).resolve(strict=True)
        if resolved_data != resolved_root / "data" or resolved_data.parent != resolved_root:
            raise ProbeFailure("installed_data_location_mismatch")
        if resolved_data.is_symlink() or not resolved_data.is_dir():
            raise ProbeFailure("installed_data_not_owned_directory")

        write_report = _run_backend(resolved_root, "write")
        restart_report = _run_backend(resolved_root, "load")
        if restart_report["registryDigest"] != write_report["registryDigest"]:
            raise ProbeFailure("restart_registry_mismatch")

        data_identity_before = resolved_data.stat().st_dev, resolved_data.stat().st_ino
        registry_identity_before = (resolved_data / "probe-mansions-v1.json").stat().st_ino

        update_result = update_app(source_v2, expected_name=APP_NAME)
        if not update_result.ok:
            raise ProbeFailure("update_failed")

        updated_root = app_dir(APP_NAME).resolve(strict=True)
        updated_data = app_data_dir(APP_NAME).resolve(strict=True)
        if updated_data != updated_root / "data" or updated_data.parent != updated_root:
            raise ProbeFailure("updated_data_location_mismatch")
        if (updated_data.stat().st_dev, updated_data.stat().st_ino) != data_identity_before:
            raise ProbeFailure("update_replaced_data_directory")
        if (updated_data / "probe-mansions-v1.json").stat().st_ino != registry_identity_before:
            raise ProbeFailure("update_replaced_registry_file")
        if (updated_root / "generation.txt").read_text(encoding="utf-8") != "v2\n":
            raise ProbeFailure("update_did_not_replace_app_code")

        update_report = _run_backend(updated_root, "load")
        if update_report["registryDigest"] != write_report["registryDigest"]:
            raise ProbeFailure("update_registry_mismatch")
        report = _success_report(str(crew_version))
    except ProbeFailure as exc:
        report = {
            "status": "unverified",
            "code": str(exc),
            "decision": "return_to_design",
        }
    except Exception:  # noqa: BLE001 - never expose external path/secret-bearing errors
        report = {
            "status": "unverified",
            "code": "unexpected_probe_failure",
            "decision": "return_to_design",
        }

    print(json.dumps(report, sort_keys=True))
    return 0 if report["status"] == "verified" else 2


if __name__ == "__main__":
    raise SystemExit(main())
