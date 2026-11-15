"""Shared isolation harness for the Room Ghosts contract probes (RG-S2..RG-S5).

Every probe runs a worker under Crew's own bundled Python with ``HOME`` pointed
at an ephemeral folder below this directory, so Crew's data home, agents
directory and config all live there.  Nothing here starts a gateway, opens a
session, talks to kiro-cli, or reads or writes the operator's Crew home.

A worker prints exactly one JSON object on stdout.  Reports hold booleans,
fixed names and Crew-relative identifiers only: never an absolute path, a
token, or file content.  Standard library only.
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
FIXTURES = ROOT.parent / "fixtures"
WORK_PREFIX = ".probe-work-"
VERSION_PATTERN = re.compile(r"[0-9]+(?:\.[0-9]+)+")
_CODE = re.compile(r"[a-z0-9_]+")
_IMPORT_CHECK = "import kiro_crew.apps.bridges,kiro_crew;print(kiro_crew.__version__)"


def _candidate_crew_pythons() -> list[Path]:
    candidates: list[Path] = []
    override = os.environ.get("KIROCREW_TEST_PYTHON")
    if override:
        candidates.append(Path(override).expanduser())
    executable = shutil.which("kirocrew")
    if executable:
        wrapper = Path(executable).resolve()
        candidates.extend([wrapper.with_name("python3.12"), wrapper.with_name("python3")])
    if importlib.util.find_spec("kiro_crew") is not None:
        candidates.append(Path(sys.executable))
    return list(dict.fromkeys(candidates))


def find_crew_python() -> Path | None:
    """The interpreter that can import the installed Crew package, if any."""
    for candidate in _candidate_crew_pythons():
        if not candidate.is_file():
            continue
        check = subprocess.run(
            [str(candidate), "-I", "-c", _IMPORT_CHECK],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        if check.returncode == 0 and VERSION_PATTERN.fullmatch(check.stdout.strip()):
            return candidate
    return None


def failure(spike: str, code: str) -> dict[str, Any]:
    """The report of a probe that could not observe anything."""
    return {"spike": spike, "status": "unverified", "code": code}


def assert_scrubbed(report: object) -> None:
    """Refuse a report that carries a host path."""
    text = json.dumps(report)
    forbidden = (str(Path.home()), tempfile.gettempdir(), "/Applications/", "/Users/", "/home/")
    if any(part in text for part in forbidden):
        raise ValueError("absolute path in report")


def run_worker(
    spike: str,
    worker: Path,
    arguments: list[str] | None = None,
    *,
    prepare: Any = None,
    timeout: int = 180,
) -> tuple[dict[str, Any], int]:
    """Run ``worker`` under Crew's Python in an ephemeral ``HOME``.

    ``prepare(work)`` may build inputs below the work folder and returns extra
    argv entries.  Returns ``(observed, 0)`` or ``(failure report, 2)``.  The
    work folder is removed afterwards.
    """
    crew_python = find_crew_python()
    if crew_python is None:
        return failure(spike, "crew_test_harness_unavailable"), 2
    try:
        with tempfile.TemporaryDirectory(prefix=WORK_PREFIX, dir=ROOT) as raw_work:
            work = Path(raw_work)
            home = work / "home"
            home.mkdir()
            extra = list(prepare(work)) if prepare is not None else []
            env = {
                "HOME": str(home),
                "PATH": "/usr/bin:/bin",
                "KIROCREW_CREW_LOG": "0",
                "PYTHONDONTWRITEBYTECODE": "1",
            }
            completed = subprocess.run(
                [str(crew_python), "-I", str(worker), *(arguments or []), *extra],
                cwd=work,
                env=env,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
            )
    except (OSError, subprocess.SubprocessError):
        return failure(spike, "crew_test_harness_failed"), 2
    try:
        observed = json.loads(completed.stdout)
    except json.JSONDecodeError:
        return failure(spike, "crew_test_harness_invalid_report"), 2
    if completed.returncode != 0 or not isinstance(observed, dict):
        code = observed.get("code") if isinstance(observed, dict) else None
        safe = code if isinstance(code, str) and _CODE.fullmatch(code) else "worker_failed"
        return failure(spike, safe), 2
    try:
        assert_scrubbed(observed)
    except ValueError:
        return failure(spike, "crew_test_harness_unsafe_report"), 2
    return observed, 0


def emit(report: dict[str, Any], status: int, fixture: Path, argv: list[str]) -> int:
    """Print the report; ``--write`` refreshes the fixture when the probe ran."""
    text = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if argv == ["--write"] and status in (0, 1) and report.get("status") != "unverified":
        fixture.write_text(text, encoding="utf-8")
    sys.stdout.write(text)
    return status
