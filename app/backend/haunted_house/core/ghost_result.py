"""The Ghost_Result codec: the one envelope a Room Ghost ends a turn with.

A ghost's final response is model output, so nothing in it is trusted.  The
parser accepts exactly one schema-version-1 JSON object and refuses anything
else: text around the object, duplicate or unknown keys, an unknown status, a
traversing or absolute artifact path, a digest that is not 64 lowercase hex
characters, control characters, oversized text, and text that looks like a
credential or a home path.  A failure is a :class:`GhostResultError` with a
stable code and never quotes the rejected text.

The schema has no field for a transcript, environment, token, session
capability, or tool output.  Printing gives canonical UTF-8 JSON with sorted
keys and no whitespace, so equal results have equal bytes.

Pure: no I/O, no clock.
"""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from enum import StrEnum
from typing import Final, Literal, NoReturn, cast

from haunted_house.core.deep_redact import DeepRedactionError, detect_residual
from haunted_house.core.path_policy import PathError, join_parts, parse_relative_path
from haunted_house.core.seance_event import JSONValue, canonical_json_text

__all__ = [
    "FIELDS",
    "MAX_ARTIFACTS",
    "MAX_RESULT_BYTES",
    "MAX_SUMMARY_CHARS",
    "SCHEMA_VERSION",
    "TASK_ID_PATTERN",
    "ArtifactRef",
    "GhostIdentity",
    "GhostResult",
    "GhostResultError",
    "GhostResultErrorCode",
    "GhostStatus",
    "check_identity",
    "ghost_result_to_dict",
    "is_task_id",
    "parse_ghost_result",
    "print_ghost_result",
]

SCHEMA_VERSION: Final = 1
MAX_RESULT_BYTES: Final = 64 * 1024
MAX_SUMMARY_CHARS: Final = 1000
MAX_ARTIFACTS: Final = 64

FIELDS: Final = frozenset(
    {"schema_version", "run_id", "status", "summary", "artifacts", "task_id", "reason_code"}
)
_ARTIFACT_FIELDS: Final = frozenset({"path", "sha256"})

_RUN_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}")
_SHA256 = re.compile(r"[0-9a-f]{64}")
_REASON_CODE = re.compile(r"[a-z][a-z0-9_]{0,63}")
# A decimal leaf task: group number, dot, task number; no leading zeros.
TASK_ID_PATTERN: Final = re.compile(r"[1-9][0-9]{0,3}\.[1-9][0-9]{0,3}")
# Code points an operator cannot be shown exactly (same set as Project_Paths).
_UNDISPLAYABLE = frozenset({"Cc", "Cf", "Cs", "Co", "Cn", "Zl", "Zp"})


class GhostStatus(StrEnum):
    READY = "ready"
    BLOCKED = "blocked"
    FAILED = "failed"


class GhostResultErrorCode(StrEnum):
    NOT_TEXT = "not_text"
    TOO_LARGE = "too_large"
    INVALID_JSON = "invalid_json"
    NOT_OBJECT = "not_object"
    DUPLICATE_KEY = "duplicate_key"
    UNKNOWN_KEY = "unknown_key"
    MISSING_KEY = "missing_key"
    UNSUPPORTED_SCHEMA_VERSION = "unsupported_schema_version"
    INVALID_RUN_ID = "invalid_run_id"
    UNKNOWN_STATUS = "unknown_status"
    INVALID_SUMMARY = "invalid_summary"
    INVALID_ARTIFACTS = "invalid_artifacts"
    INVALID_ARTIFACT_PATH = "invalid_artifact_path"
    INVALID_ARTIFACT_HASH = "invalid_artifact_hash"
    DUPLICATE_ARTIFACT = "duplicate_artifact"
    INVALID_TASK_ID = "invalid_task_id"
    INVALID_REASON_CODE = "invalid_reason_code"
    REASON_MISMATCH = "reason_mismatch"
    UNSAFE_TEXT = "unsafe_text"
    IDENTITY_MISMATCH = "identity_mismatch"


class GhostResultError(ValueError):
    """A safe refusal: a fixed code and nothing from the rejected text."""

    def __init__(self, code: GhostResultErrorCode) -> None:
        self.code = code
        super().__init__(code.value)


def _fail(code: GhostResultErrorCode) -> NoReturn:
    raise GhostResultError(code)


def is_task_id(value: object) -> bool:
    return type(value) is str and TASK_ID_PATTERN.fullmatch(value) is not None


@dataclass(frozen=True, slots=True)
class ArtifactRef:
    """One Mansion-relative file and the SHA-256 of the bytes the ghost left."""

    path: str
    sha256: str

    def __post_init__(self) -> None:
        parts = parse_relative_path(self.path)
        if isinstance(parts, PathError) or join_parts(parts) != self.path:
            _fail(GhostResultErrorCode.INVALID_ARTIFACT_PATH)
        if type(self.sha256) is not str or _SHA256.fullmatch(self.sha256) is None:
            _fail(GhostResultErrorCode.INVALID_ARTIFACT_HASH)


@dataclass(frozen=True, slots=True)
class GhostResult:
    """A validated schema-version-1 Ghost_Result.  Construction validates."""

    schema_version: Literal[1]
    run_id: str
    status: GhostStatus
    summary: str
    artifacts: tuple[ArtifactRef, ...]
    task_id: str | None
    reason_code: str | None

    def __post_init__(self) -> None:
        if type(self.schema_version) is not int or self.schema_version != SCHEMA_VERSION:
            _fail(GhostResultErrorCode.UNSUPPORTED_SCHEMA_VERSION)
        if type(self.run_id) is not str or _RUN_ID.fullmatch(self.run_id) is None:
            _fail(GhostResultErrorCode.INVALID_RUN_ID)
        if not isinstance(self.status, GhostStatus):
            _fail(GhostResultErrorCode.UNKNOWN_STATUS)
        _check_summary(self.summary)
        if type(self.artifacts) is not tuple or len(self.artifacts) > MAX_ARTIFACTS:
            _fail(GhostResultErrorCode.INVALID_ARTIFACTS)
        if any(type(item) is not ArtifactRef for item in self.artifacts):
            _fail(GhostResultErrorCode.INVALID_ARTIFACTS)
        # Case differences can name one file on a case-insensitive volume.
        folded = {item.path.casefold() for item in self.artifacts}
        if len(folded) != len(self.artifacts):
            _fail(GhostResultErrorCode.DUPLICATE_ARTIFACT)
        if self.task_id is not None and not is_task_id(self.task_id):
            _fail(GhostResultErrorCode.INVALID_TASK_ID)
        if self.reason_code is not None and (
            type(self.reason_code) is not str
            or _REASON_CODE.fullmatch(self.reason_code) is None
        ):
            _fail(GhostResultErrorCode.INVALID_REASON_CODE)
        # A ready result has nothing to explain; any other must say why.
        if (self.status is GhostStatus.READY) != (self.reason_code is None):
            _fail(GhostResultErrorCode.REASON_MISMATCH)
        if _is_unsafe(ghost_result_to_dict(self)):
            _fail(GhostResultErrorCode.UNSAFE_TEXT)


@dataclass(frozen=True, slots=True)
class GhostIdentity:
    """The trusted run and task a result must name.  Never model input."""

    run_id: str
    task_id: str | None


def _check_summary(summary: object) -> None:
    if type(summary) is not str:
        _fail(GhostResultErrorCode.INVALID_SUMMARY)
    if not 1 <= len(summary) <= MAX_SUMMARY_CHARS or summary != summary.strip():
        _fail(GhostResultErrorCode.INVALID_SUMMARY)
    if any(unicodedata.category(char) in _UNDISPLAYABLE for char in summary):
        _fail(GhostResultErrorCode.INVALID_SUMMARY)


def _is_unsafe(value: dict[str, JSONValue]) -> bool:
    try:
        return detect_residual(value) is not None
    except DeepRedactionError:
        return True


def ghost_result_to_dict(value: GhostResult) -> dict[str, JSONValue]:
    """The exact JSON object of a result: seven keys, never another."""

    return {
        "schema_version": SCHEMA_VERSION,
        "run_id": value.run_id,
        "status": value.status.value,
        "summary": value.summary,
        "artifacts": [{"path": item.path, "sha256": item.sha256} for item in value.artifacts],
        "task_id": value.task_id,
        "reason_code": value.reason_code,
    }


def print_ghost_result(value: GhostResult) -> str:
    """Canonical JSON text: sorted keys, no whitespace, UTF-8 encodable."""

    if type(value) is not GhostResult:
        raise TypeError("print_ghost_result needs a GhostResult")
    return canonical_json_text(ghost_result_to_dict(value))


class _DuplicateKey(Exception):
    pass


def _object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, item in pairs:
        if key in result:
            raise _DuplicateKey
        result[key] = item
    return result


def _no_constant(_: str) -> NoReturn:
    raise ValueError("non-finite number")


def parse_ghost_result(text: str, expected: GhostIdentity | None = None) -> GhostResult:
    """Parse a ghost's whole final response as one Ghost_Result.

    ``expected`` is the trusted identity of the run that produced the text;
    when given, a result naming another run or task is refused.  Surrounding
    JSON whitespace is allowed and a summary is trimmed; nothing else is
    repaired.
    """

    if type(text) is not str:
        _fail(GhostResultErrorCode.NOT_TEXT)
    try:
        size = len(text.encode("utf-8"))
    except UnicodeEncodeError:
        _fail(GhostResultErrorCode.INVALID_JSON)
    if size > MAX_RESULT_BYTES:
        _fail(GhostResultErrorCode.TOO_LARGE)
    try:
        raw = json.loads(text, object_pairs_hook=_object, parse_constant=_no_constant)
    except _DuplicateKey:
        _fail(GhostResultErrorCode.DUPLICATE_KEY)
    except (ValueError, RecursionError):
        _fail(GhostResultErrorCode.INVALID_JSON)
    if type(raw) is not dict:
        _fail(GhostResultErrorCode.NOT_OBJECT)
    record = cast(dict[str, object], raw)
    if not record.keys() <= FIELDS:
        _fail(GhostResultErrorCode.UNKNOWN_KEY)
    if record.keys() != FIELDS:
        _fail(GhostResultErrorCode.MISSING_KEY)

    status = record["status"]
    if type(status) is not str or status not in GhostStatus._value2member_map_:
        _fail(GhostResultErrorCode.UNKNOWN_STATUS)
    summary = record["summary"]
    if type(summary) is not str:
        _fail(GhostResultErrorCode.INVALID_SUMMARY)
    schema_version = record["schema_version"]
    if type(schema_version) is not int:
        _fail(GhostResultErrorCode.UNSUPPORTED_SCHEMA_VERSION)

    result = GhostResult(
        schema_version=cast(Literal[1], schema_version),
        run_id=cast(str, record["run_id"]),
        status=GhostStatus(status),
        summary=summary.strip(),
        artifacts=_artifacts(record["artifacts"]),
        task_id=cast("str | None", record["task_id"]),
        reason_code=cast("str | None", record["reason_code"]),
    )
    if expected is not None:
        check_identity(result, expected)
    return result


def _artifacts(value: object) -> tuple[ArtifactRef, ...]:
    if type(value) is not list:
        _fail(GhostResultErrorCode.INVALID_ARTIFACTS)
    items = cast(list[object], value)
    if len(items) > MAX_ARTIFACTS:
        _fail(GhostResultErrorCode.INVALID_ARTIFACTS)
    refs: list[ArtifactRef] = []
    for item in items:
        if type(item) is not dict:
            _fail(GhostResultErrorCode.INVALID_ARTIFACTS)
        entry = cast(dict[str, object], item)
        if not entry.keys() <= _ARTIFACT_FIELDS:
            _fail(GhostResultErrorCode.UNKNOWN_KEY)
        if entry.keys() != _ARTIFACT_FIELDS:
            _fail(GhostResultErrorCode.MISSING_KEY)
        refs.append(
            ArtifactRef(path=cast(str, entry["path"]), sha256=cast(str, entry["sha256"]))
        )
    return tuple(refs)


def check_identity(result: GhostResult, expected: GhostIdentity) -> None:
    """Refuse a result that names a run or task other than the trusted one."""

    if result.run_id != expected.run_id or result.task_id != expected.task_id:
        _fail(GhostResultErrorCode.IDENTITY_MISMATCH)
