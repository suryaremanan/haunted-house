#!/usr/bin/env python3
"""Automated, scrubbed Crew app-data persistence probe.

The probe creates two synthetic app versions under an ephemeral directory,
runs Crew's real gateway-managed install/update functions in an isolated
``KIROCREW_HOME``, and starts a fresh standalone backend process for each
registry read.  It never installs an app into the operator's real Crew home.
"""
from __future__ import annotations

import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
WORK_PREFIX = ".probe-work-"
APP_NAME = "mansion-data-persistence-probe"
APP_DATA_LABEL = "<app-root>/data"
EXPECTED_REPORT_KEYS = {
    "status",
    "crewVersion",
    "verifiedPersistentLocation",
    "registrySchemaVersion",
    "registryEquivalent",
    "backendRestartPreserved",
    "updateLifecycle",
    "updatePreserved",
    "isolatedDataHome",
    "decision",
}
VERSION_PATTERN = re.compile(r"[0-9]+(?:\.[0-9]+)+(?:\.[0-9]+)?")


def _candidate_crew_pythons() -> list[Path]:
    candidates: list[Path] = []
    override = os.environ.get("KIROCREW_TEST_PYTHON")
    if override:
        candidates.append(Path(override).expanduser())

    executable = shutil.which("kirocrew")
    if executable:
        wrapper = Path(executable).resolve()
        candidates.extend(
            [
                wrapper.with_name("python3.12"),
                wrapper.with_name("python3"),
                wrapper.with_name("python.exe"),
            ]
        )

    if importlib.util.find_spec("kiro_crew") is not None:
        candidates.append(Path(sys.executable))

    unique: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        marker = os.fspath(candidate)
        if marker not in seen:
            seen.add(marker)
            unique.append(candidate)
    return unique


def _find_crew_python() -> Path | None:
    for candidate in _candidate_crew_pythons():
        if not candidate.is_file():
            continue
        check = subprocess.run(
            [
                str(candidate),
                "-I",
                "-c",
                "import kiro_crew,kiro_crew.apps.manager;print(kiro_crew.__version__)",
            ],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        if check.returncode == 0 and VERSION_PATTERN.fullmatch(check.stdout.strip()):
            return candidate
    return None


def _write_source(source: Path, version: str, generation: str) -> None:
    backend = source / "backend"
    backend.mkdir(parents=True)
    manifest = {
        "name": APP_NAME,
        "version": version,
        "displayName": "Mansion Data Persistence Probe",
        "description": "Ephemeral fixture for verifying Crew app-data update preservation.",
        "author": "Haunted House contributors",
        "license": "MIT",
        "resources": "gateway",
        "lifecycle": "gateway",
        "backend": {
            "entryPoint": "backend/backend_service.py",
            "type": "python",
            "port": "auto",
            "healthCheck": "/health",
        },
        "permissions": {"storage": True},
    }
    (source / "app.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    (source / "generation.txt").write_text(f"{generation}\n", encoding="utf-8")
    shutil.copy2(ROOT / "backend_service.py", backend / "backend_service.py")


def _validate_success_report(value: object) -> dict[str, Any]:
    """Validate the worker report before allowing it onto stdout."""
    if not isinstance(value, dict) or set(value) != EXPECTED_REPORT_KEYS:
        raise ValueError("unexpected report shape")
    if (
        value.get("status") != "verified"
        or not isinstance(value.get("crewVersion"), str)
        or VERSION_PATTERN.fullmatch(value["crewVersion"]) is None
        or value.get("verifiedPersistentLocation") != APP_DATA_LABEL
        or value.get("registrySchemaVersion") != 1
        or value.get("registryEquivalent") is not True
        or value.get("backendRestartPreserved") is not True
        or value.get("updateLifecycle") != "exercised"
        or value.get("updatePreserved") is not True
        or value.get("isolatedDataHome") is not True
        or value.get("decision") != "implementation_may_proceed"
    ):
        raise ValueError("unverified report")
    for item in value.values():
        if isinstance(item, str) and (item.startswith("/") or str(Path.home()) in item):
            raise ValueError("absolute path in report")
    return value


def _failure(code: str) -> dict[str, str]:
    return {"status": "unverified", "code": code, "decision": "return_to_design"}


def run_probe() -> tuple[dict[str, object], int]:
    crew_python = _find_crew_python()
    if crew_python is None:
        return _failure("crew_test_harness_unavailable"), 2

    try:
        with tempfile.TemporaryDirectory(prefix=WORK_PREFIX, dir=ROOT) as raw_work:
            work = Path(raw_work)
            source_v1 = work / "source-v1"
            source_v2 = work / "source-v2"
            _write_source(source_v1, "0.0.1", "v1")
            _write_source(source_v2, "0.0.2", "v2")

            env = os.environ.copy()
            env["KIROCREW_HOME"] = str(work / "crew-home")
            env["KIROCREW_CREW_LOG"] = "0"
            env["PYTHONDONTWRITEBYTECODE"] = "1"
            env.pop("PYTHONHOME", None)
            env.pop("PYTHONPATH", None)
            completed = subprocess.run(
                [
                    str(crew_python),
                    "-I",
                    str(ROOT / "lifecycle_worker.py"),
                    str(source_v1),
                    str(source_v2),
                ],
                cwd=ROOT,
                env=env,
                capture_output=True,
                text=True,
                timeout=90,
                check=False,
            )
    except (OSError, subprocess.SubprocessError):
        return _failure("crew_test_harness_failed"), 2

    try:
        worker_report = json.loads(completed.stdout)
    except json.JSONDecodeError:
        return _failure("crew_test_harness_invalid_report"), 2
    if completed.returncode != 0:
        code = worker_report.get("code") if isinstance(worker_report, dict) else None
        safe_code = code if isinstance(code, str) and re.fullmatch(r"[a-z0-9_]+", code) else "persistence_unverified"
        return _failure(safe_code), 2
    try:
        report = _validate_success_report(worker_report)
    except ValueError:
        return _failure("crew_test_harness_unsafe_report"), 2
    return report, 0


def main() -> int:
    report, status = run_probe()
    print(json.dumps(report, indent=2, sort_keys=True))
    return status


if __name__ == "__main__":
    raise SystemExit(main())
