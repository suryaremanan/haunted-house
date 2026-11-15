"""Examples for the Ghost_Result codec, driven by the shared vector fixture.

``fixtures/room-ghosts/ghost-result-vectors.json`` is normative: any other
runtime that reads a Ghost_Result must agree with it byte for byte.

Validates: Requirements 9.6, 9.7, 13.1, 13.2, 13.3, 13.4.
"""

from __future__ import annotations

import json
from typing import Any

import pytest

from haunted_house.core.ghost_result import (
    MAX_ARTIFACTS,
    MAX_RESULT_BYTES,
    MAX_SUMMARY_CHARS,
    ArtifactRef,
    GhostIdentity,
    GhostResult,
    GhostResultError,
    GhostResultErrorCode,
    GhostStatus,
    check_identity,
    ghost_result_to_dict,
    parse_ghost_result,
    print_ghost_result,
)
from tests.room_ghost_support import load_fixture

pytestmark = pytest.mark.core

_VECTORS = load_fixture("ghost-result-vectors.json")
_SHA = "a" * 64


def _ids(items: list[dict[str, Any]]) -> list[str]:
    return [item["name"] for item in items]


def _ready(**changes: Any) -> GhostResult:
    fields: dict[str, Any] = {
        "schema_version": 1,
        "run_id": "requirements-1",
        "status": GhostStatus.READY,
        "summary": "Wrote the requirements.",
        "artifacts": (ArtifactRef(".kiro/specs/demo-feature/requirements.md", _SHA),),
        "task_id": None,
        "reason_code": None,
    }
    fields.update(changes)
    return GhostResult(**fields)


def _code(text: Any, expected: GhostIdentity | None = None) -> str:
    with pytest.raises(GhostResultError) as caught:
        parse_ghost_result(text, expected)
    return caught.value.code.value


@pytest.mark.parametrize("vector", _VECTORS["valid"], ids=_ids(_VECTORS["valid"]))
def test_valid_vectors_parse_and_print_canonically(vector: dict[str, Any]) -> None:
    result = parse_ghost_result(vector["canonical"])
    assert ghost_result_to_dict(result) == vector["value"]
    assert print_ghost_result(result) == vector["canonical"]
    # A pretty-printed copy is the same result.
    assert parse_ghost_result(json.dumps(vector["value"], indent=2)) == result


@pytest.mark.parametrize("vector", _VECTORS["invalid"], ids=_ids(_VECTORS["invalid"]))
def test_invalid_vectors_are_refused_with_a_stable_code(vector: dict[str, Any]) -> None:
    assert _code(vector["text"]) == vector["code"]


def test_error_never_quotes_the_rejected_text() -> None:
    marker = "MARKER-ONLY-IN-INPUT"
    text = print_ghost_result(_ready()).replace("requirements-1", f"bad id {marker}")
    with pytest.raises(GhostResultError) as caught:
        parse_ghost_result(text)
    assert marker not in str(caught.value)
    assert marker not in repr(caught.value)
    assert str(caught.value) == GhostResultErrorCode.INVALID_RUN_ID.value


def test_non_text_and_oversized_input() -> None:
    assert _code(b"{}") == "not_text"
    assert _code(None) == "not_text"
    assert _code(" " * (MAX_RESULT_BYTES + 1)) == "too_large"
    assert _code("[" * 5000) == "invalid_json"
    assert _code("NaN") == "invalid_json"
    assert _code('"\ud800"') == "invalid_json"


def test_summary_is_trimmed_and_bounded() -> None:
    value = ghost_result_to_dict(_ready())
    value["summary"] = "  padded  "
    assert parse_ghost_result(json.dumps(value)).summary == "padded"
    value["summary"] = "x" * MAX_SUMMARY_CHARS
    assert len(parse_ghost_result(json.dumps(value)).summary) == MAX_SUMMARY_CHARS
    with pytest.raises(GhostResultError):
        _ready(summary=" padded")
    for hidden in ("​", "‮", "\x7f", " "):
        value["summary"] = f"a{hidden}b"
        assert _code(json.dumps(value)) == "invalid_summary"


def test_secret_shaped_or_home_path_text_is_refused() -> None:
    home = "/" + "Users/" + "someone/project/file.py"
    credential = "pass" + "word=" + '"' + "abcdefghijklmnopqrstuvwx" + '"'
    for summary in (f"Edited {home}", f"Set {credential}"):
        value = ghost_result_to_dict(_ready())
        value["summary"] = summary
        assert _code(json.dumps(value)) == "unsafe_text"


def test_artifact_limits() -> None:
    many = tuple(ArtifactRef(f"src/f{index}.py", _SHA) for index in range(MAX_ARTIFACTS))
    assert len(_ready(artifacts=many).artifacts) == MAX_ARTIFACTS
    with pytest.raises(GhostResultError) as caught:
        _ready(artifacts=(*many, ArtifactRef("src/extra.py", _SHA)))
    assert caught.value.code is GhostResultErrorCode.INVALID_ARTIFACTS
    for path in ("", ".", "a//b", "a/./b", "%2e%2e/a", "a\x00b", "é.py"):
        with pytest.raises(GhostResultError) as caught:
            ArtifactRef(path, _SHA)
        assert caught.value.code is GhostResultErrorCode.INVALID_ARTIFACT_PATH


def test_identity_must_match_the_trusted_run_and_task() -> None:
    phase = print_ghost_result(_ready())
    assert parse_ghost_result(phase, GhostIdentity("requirements-1", None)).run_id == "requirements-1"
    assert _code(phase, GhostIdentity("requirements-2", None)) == "identity_mismatch"
    assert _code(phase, GhostIdentity("requirements-1", "1.1")) == "identity_mismatch"

    task = _ready(run_id="implementation-3", task_id="2.1")
    check_identity(task, GhostIdentity("implementation-3", "2.1"))
    for other in (GhostIdentity("implementation-3", "2.2"), GhostIdentity("implementation-3", None)):
        with pytest.raises(GhostResultError):
            check_identity(task, other)


def test_blocked_and_failed_need_a_reason_and_ready_has_none() -> None:
    assert _ready(status=GhostStatus.BLOCKED, reason_code="approval_rejected").reason_code
    assert _ready(status=GhostStatus.FAILED, reason_code="tests_failed", artifacts=()).artifacts == ()
    for status in (GhostStatus.BLOCKED, GhostStatus.FAILED):
        with pytest.raises(GhostResultError):
            _ready(status=status)
    with pytest.raises(GhostResultError):
        _ready(reason_code="anything")


def test_print_requires_a_model() -> None:
    with pytest.raises(TypeError):
        print_ghost_result(ghost_result_to_dict(_ready()))  # type: ignore[arg-type]
