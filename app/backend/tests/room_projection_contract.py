"""A test oracle for the Room Ghosts read route's wire contract.

``refusal_path`` mirrors the dashboard's strict parser
(``app/ui/src/core/room-projection.ts``) check for check and returns the
JSON path it would refuse a body at, or ``None`` when it would accept it.
``tests/unit/test_room_projection_contract.py`` proves the mirror against
the normative vectors (every valid body accepted, every invalid body refused
at its recorded path), so backend tests can use it to show that a body the
serializer emitted is one the dashboard accepts.
"""

from __future__ import annotations

import re
from typing import Any

PHASES = ("requirements", "design", "tasks", "implementation")
DOCUMENT_PHASES = PHASES[:3]
TASK_OUTCOME_STATUSES = ("queued", "active", "complete", "failed", "cancelled", "blocked", "skipped")
BACKPRESSURE_REASONS = ("crew_capacity", "local_capacity", "claim_busy")
REVIEW_STATUSES = ("reviewing", "pass", "changes_requested", "blocked")
REPAIR_STATUSES = ("proposed", "approved", "rejected")
INTEGRITY_STATES = ("valid", "corrupt", "uncertain")
MAX_SAFE_INTEGER = 2**53 - 1

_CONTROL = re.compile(r"[\u0000-\u001f\u007f-\u009f  ]")
_CONTROL_IN_PROSE = re.compile(r"[\u0000-\u0008\u000b-\u001f\u007f-\u009f  ]")
_IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,159}")
_CODE = re.compile(r"[a-z][a-z0-9_]{0,63}")
_DECIMAL_ID = re.compile(r"[1-9][0-9]{0,3}\.[1-9][0-9]{0,3}")
_SLOT_KEY = re.compile(r"[A-Za-z0-9-]{1,160}")
_SHA256 = re.compile(r"[0-9a-f]{64}")
_NAME = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")


class Refused(Exception):
    def __init__(self, path: str) -> None:
        self.path = path
        super().__init__(path)


def _utf16(value: str) -> int:
    """JavaScript's ``String.length``."""

    return len(value.encode("utf-16-le")) // 2


def _exact(value: Any, path: str, keys: tuple[str, ...], optional: tuple[str, ...] = ()) -> dict:
    if type(value) is not dict:
        raise Refused(path)
    for key in value:
        if key not in keys and key not in optional:
            raise Refused(path)
    for key in keys:
        if key not in value:
            raise Refused(f"{path}.{key}")
    return value


def _one_of(value: Any, choices: tuple[str, ...], path: str) -> str:
    if type(value) is not str or value not in choices:
        raise Refused(path)
    return value


def _count(value: Any, path: str, minimum: int = 0, maximum: int = MAX_SAFE_INTEGER) -> int:
    if type(value) is float and value.is_integer():
        value = int(value)
    if type(value) is not int or not minimum <= value <= maximum:
        raise Refused(path)
    return value


def _flag(value: Any, path: str) -> bool:
    if type(value) is not bool:
        raise Refused(path)
    return value


def _list(value: Any, path: str, limit: int) -> list:
    if type(value) is not list or len(value) > limit:
        raise Refused(path)
    return value


def _text(value: Any, path: str, limit: int = 160) -> str:
    if type(value) is not str or not value or _utf16(value) > limit or _CONTROL.search(value):
        raise Refused(path)
    return value


def _match(pattern: re.Pattern[str], value: Any, path: str) -> str:
    if type(value) is not str or pattern.fullmatch(value) is None:
        raise Refused(path)
    return value


def _project_path(value: Any, path: str) -> str:
    raw = _text(value, path, 1024)
    if raw.startswith(("/", "~")) or "\\" in raw:
        raise Refused(path)
    if any(part in ("", ".", "..") for part in raw.split("/")):
        raise Refused(path)
    return raw


def _unique(values: list[str], path: str) -> None:
    if len(set(values)) != len(values):
        raise Refused(path)


def _path_list(value: Any, path: str) -> list[str]:
    paths = [_project_path(item, f"{path}[{index}]") for index, item in enumerate(_list(value, path, 32))]
    _unique(paths, path)
    return paths


def _prose(value: Any, path: str, limit: int) -> str:
    if type(value) is not str or not value.strip() or _utf16(value) > limit or _CONTROL_IN_PROSE.search(value):
        raise Refused(path)
    return value


def _revision(value: Any, path: str) -> None:
    record = _exact(value, path, ("revision", "sha256", "size_bytes"))
    _match(_SHA256, record["sha256"], f"{path}.sha256")
    _count(record["revision"], f"{path}.revision", 1)
    _count(record["size_bytes"], f"{path}.size_bytes")


def _findings(value: Any, path: str) -> None:
    for index, item in enumerate(_list(value, path, 50)):
        at = f"{path}[{index}]"
        record = _exact(item, at, ("code", "location", "message"))
        _match(_CODE, record["code"], f"{at}.code")
        _text(record["location"], f"{at}.location", 96)
        _text(record["message"], f"{at}.message", 200)


def _artifact(value: Any, path: str) -> None:
    record = _exact(value, path, ("artifact_revision", "validated", "content", "findings"))
    content = record["content"]
    if content is not None and (type(content) is not str or _utf16(content) > 512 * 1024):
        raise Refused(f"{path}.content")
    _revision(record["artifact_revision"], f"{path}.artifact_revision")
    _flag(record["validated"], f"{path}.validated")
    _findings(record["findings"], f"{path}.findings")


def _document(value: Any, path: str, phase: str, spec_name: str) -> None:
    record = _exact(value, path, ("phase", "document_path", "write_scope", "artifact"))
    if record["phase"] != phase:
        raise Refused(f"{path}.phase")
    document_path = _project_path(record["document_path"], f"{path}.document_path")
    if document_path != f".kiro/specs/{spec_name}/{phase}.md":
        raise Refused(f"{path}.document_path")
    _path_list(record["write_scope"], f"{path}.write_scope")
    if record["artifact"] is not None:
        _artifact(record["artifact"], f"{path}.artifact")


def _outcome(value: Any, path: str) -> dict:
    record = _exact(value, path, ("status", "attempt", "run_id", "reason_code"))
    _one_of(record["status"], TASK_OUTCOME_STATUSES, f"{path}.status")
    _count(record["attempt"], f"{path}.attempt", 0, 3)
    if record["run_id"] is not None:
        _match(_IDENTIFIER, record["run_id"], f"{path}.run_id")
    if record["reason_code"] is not None:
        _match(_CODE, record["reason_code"], f"{path}.reason_code")
    return record


def _task(value: Any, path: str) -> dict:
    record = _exact(
        value, path,
        ("task_id", "title", "optional", "complete", "requirements", "writes", "wave",
         "selected", "outcome", "backpressure"),
    )
    requirements = [
        _match(_DECIMAL_ID, item, f"{path}.requirements[{index}]")
        for index, item in enumerate(_list(record["requirements"], f"{path}.requirements", 64))
    ]
    _unique(requirements, f"{path}.requirements")
    complete = _flag(record["complete"], f"{path}.complete")
    outcome = None if record["outcome"] is None else _outcome(record["outcome"], f"{path}.outcome")
    if outcome is not None and outcome["status"] == "complete" and not complete:
        raise Refused(f"{path}.outcome")
    if complete and outcome is not None and outcome["status"] != "complete":
        raise Refused(f"{path}.outcome")
    _match(_DECIMAL_ID, record["task_id"], f"{path}.task_id")
    _text(record["title"], f"{path}.title", 200)
    _flag(record["optional"], f"{path}.optional")
    _path_list(record["writes"], f"{path}.writes")
    if record["wave"] is not None:
        _count(record["wave"], f"{path}.wave", 0, 200)
    _flag(record["selected"], f"{path}.selected")
    if record["backpressure"] is not None:
        at = f"{path}.backpressure"
        pressure = _exact(record["backpressure"], at, ("dispatch_failures", "next_delay_seconds", "last_reason"))
        _count(pressure["dispatch_failures"], f"{at}.dispatch_failures", 0, 1_000_000)
        _count(pressure["next_delay_seconds"], f"{at}.next_delay_seconds", 0, 15)
        _one_of(pressure["last_reason"], BACKPRESSURE_REASONS, f"{at}.last_reason")
    return record


def _task_plan(value: Any, path: str) -> None:
    record = _exact(value, path, ("tasks", "waves", "findings"))
    tasks = [
        _task(item, f"{path}.tasks[{index}]")
        for index, item in enumerate(_list(record["tasks"], f"{path}.tasks", 200))
    ]
    _unique([task["task_id"] for task in tasks], f"{path}.tasks")
    known = {task["task_id"]: task for task in tasks}
    waves: list[list[str]] = []
    for wave_index, wave in enumerate(_list(record["waves"], f"{path}.waves", 200)):
        names = []
        for index, item in enumerate(_list(wave, f"{path}.waves[{wave_index}]", 200)):
            at = f"{path}.waves[{wave_index}][{index}]"
            task_id = _match(_DECIMAL_ID, item, at)
            if task_id not in known or known[task_id]["wave"] != wave_index:
                raise Refused(at)
            names.append(task_id)
        waves.append(names)
    flat = [task_id for wave in waves for task_id in wave]
    _unique(flat, f"{path}.waves")
    for index, task in enumerate(tasks):
        if task["wave"] is not None and task["task_id"] not in flat:
            raise Refused(f"{path}.tasks[{index}].wave")
    active = [task for task in tasks if task["outcome"] is not None and task["outcome"]["status"] == "active"]
    if len(active) > 3:
        raise Refused(f"{path}.tasks")
    _findings(record["findings"], f"{path}.findings")


def _session_link(value: Any, path: str) -> None:
    if value is not None and (type(value) is not str or _SLOT_KEY.fullmatch(value) is None):
        raise Refused(path)


def _run(value: Any, path: str) -> dict:
    record = _exact(
        value, path,
        ("run_id", "run_sequence", "ghost_id", "session_slot", "phase", "task_id", "attempt",
         "can_cancel", "cancel_requested", "can_retry", "session_link", "summary",
         "reason_code", "claim_paths"),
    )
    phase = _one_of(record["phase"], PHASES, f"{path}.phase")
    task_id = record["task_id"]
    if task_id is not None:
        _match(_DECIMAL_ID, task_id, f"{path}.task_id")
    if (task_id is not None) != (phase == "implementation"):
        raise Refused(f"{path}.task_id")
    attempt = _count(record["attempt"], f"{path}.attempt", 1, 3)
    can_cancel = _flag(record["can_cancel"], f"{path}.can_cancel")
    can_retry = _flag(record["can_retry"], f"{path}.can_retry")
    if can_cancel and can_retry:
        raise Refused(f"{path}.can_retry")
    if can_retry and attempt >= 3:
        raise Refused(f"{path}.can_retry")
    _text(record["session_slot"], f"{path}.session_slot")
    _session_link(record["session_link"], f"{path}.session_link")
    claim_paths = _path_list(record["claim_paths"], f"{path}.claim_paths")
    if claim_paths and task_id is None:
        raise Refused(f"{path}.claim_paths")
    _match(_IDENTIFIER, record["run_id"], f"{path}.run_id")
    _count(record["run_sequence"], f"{path}.run_sequence", 0, 1_000_000)
    _text(record["ghost_id"], f"{path}.ghost_id")
    _flag(record["cancel_requested"], f"{path}.cancel_requested")
    if record["summary"] is not None:
        _prose(record["summary"], f"{path}.summary", 1000)
    if record["reason_code"] is not None:
        _match(_CODE, record["reason_code"], f"{path}.reason_code")
    return record


def _review(value: Any, path: str) -> None:
    record = _exact(value, path, ("cycle", "status", "ghost_id", "session_link", "findings", "repairs"))
    _session_link(record["session_link"], f"{path}.session_link")
    finding_ids: list[str] = []
    for index, item in enumerate(_list(record["findings"], f"{path}.findings", 50)):
        at = f"{path}.findings[{index}]"
        finding = _exact(item, at, ("finding_id", "requirement_ids", "paths", "summary"))
        refs = [
            _match(_DECIMAL_ID, ref, f"{at}.requirement_ids[{ref_index}]")
            for ref_index, ref in enumerate(_list(finding["requirement_ids"], f"{at}.requirement_ids", 64))
        ]
        _unique(refs, f"{at}.requirement_ids")
        finding_ids.append(_match(_IDENTIFIER, finding["finding_id"], f"{at}.finding_id"))
        _path_list(finding["paths"], f"{at}.paths")
        _prose(finding["summary"], f"{at}.summary", 1000)
    _unique(finding_ids, f"{path}.findings")
    repairs: list[dict] = []
    for index, item in enumerate(_list(record["repairs"], f"{path}.repairs", 50)):
        at = f"{path}.repairs[{index}]"
        repair = _exact(item, at, ("task_id", "finding_id", "title", "writes", "status"))
        finding_id = _match(_IDENTIFIER, repair["finding_id"], f"{at}.finding_id")
        if finding_id not in finding_ids:
            raise Refused(f"{at}.finding_id")
        _match(_DECIMAL_ID, repair["task_id"], f"{at}.task_id")
        _text(repair["title"], f"{at}.title", 200)
        _path_list(repair["writes"], f"{at}.writes")
        _one_of(repair["status"], REPAIR_STATUSES, f"{at}.status")
        repairs.append(repair)
    _unique([repair["finding_id"] for repair in repairs], f"{path}.repairs")
    _unique([repair["task_id"] for repair in repairs], f"{path}.repairs")
    status = _one_of(record["status"], REVIEW_STATUSES, f"{path}.status")
    if status == "pass" and (finding_ids or repairs):
        raise Refused(f"{path}.findings")
    _count(record["cycle"], f"{path}.cycle", 1, 3)
    _text(record["ghost_id"], f"{path}.ghost_id")


def refusal_path(
    value: Any, expected_mansion_id: str | None = None, expected_spec_name: str | None = None
) -> str | None:
    """Where the dashboard parser refuses ``value``, or ``None`` if it accepts."""

    try:
        record = _exact(
            value, "$",
            ("schema_version", "mansion_id", "spec_name", "version", "integrity",
             "seance_enabled", "documents", "task_plan", "runs", "review"),
            ("read_only",),
        )
        if record["schema_version"] != 1 or type(record["schema_version"]) is bool:
            raise Refused("$.schema_version")
        if "read_only" in record and type(record["read_only"]) is not bool:
            raise Refused("$.read_only")
        mansion = record["mansion_id"]
        if type(mansion) is not str or len(mansion) > 40 or _NAME.fullmatch(mansion) is None:
            raise Refused("$.mansion_id")
        if expected_mansion_id is not None and mansion != expected_mansion_id:
            raise Refused("$.mansion_id")
        spec_name = record["spec_name"]
        if type(spec_name) is not str or len(spec_name) > 40 or _NAME.fullmatch(spec_name) is None:
            raise Refused("$.spec_name")
        if expected_spec_name is not None and spec_name != expected_spec_name:
            raise Refused("$.spec_name")
        documents = record["documents"]
        if type(documents) is not list or len(documents) != len(DOCUMENT_PHASES):
            raise Refused("$.documents")
        for index, phase in enumerate(DOCUMENT_PHASES):
            _document(documents[index], f"$.documents[{index}]", phase, spec_name)
        runs = [_run(item, f"$.runs[{index}]") for index, item in enumerate(_list(record["runs"], "$.runs", 64))]
        _unique([run["run_id"] for run in runs], "$.runs")
        seance_enabled = _flag(record["seance_enabled"], "$.seance_enabled")
        if record["review"] is not None:
            _review(record["review"], "$.review")
            if not seance_enabled:
                raise Refused("$.review")
        _count(record["version"], "$.version")
        _one_of(record["integrity"], INTEGRITY_STATES, "$.integrity")
        if record["task_plan"] is not None:
            _task_plan(record["task_plan"], "$.task_plan")
    except Refused as refused:
        return refused.path
    return None
