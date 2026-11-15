"""Tests for scripts/build_replay_fixture.py (Spec 7 task 5.4).

**Validates: Requirements 5.1, 5.2, 5.4, 5.6**

The builder is deterministic: fixed synthetic identities and times go through
the backend's own validate, redact, identify, sequence and hash-link pipeline.
These tests rebuild every output in memory and compare it with the committed
bytes, so a hand edit of a fixture cannot go unnoticed.
"""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "build_replay_fixture.py"


def _load_builder():
    if "build_replay_fixture" in sys.modules:
        return sys.modules["build_replay_fixture"]
    spec = importlib.util.spec_from_file_location("build_replay_fixture", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["build_replay_fixture"] = module
    spec.loader.exec_module(module)
    return module


builder = _load_builder()


def test_every_committed_output_equals_a_fresh_build() -> None:
    for path, build in builder.OUTPUTS:
        assert path.is_file(), path.name
        assert path.read_bytes() == build(), f"{path.name} is stale; run scripts/build_replay_fixture.py"


def test_a_second_generation_is_byte_identical() -> None:
    for _, build in builder.OUTPUTS:
        assert build() == build()


def test_check_mode_accepts_the_committed_fixture() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--check"], cwd=REPO_ROOT, capture_output=True, text=True, timeout=60
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout == ""


@pytest.mark.parametrize("edit", ["append", "truncate", "missing"])
def test_check_mode_refuses_a_hand_edited_fixture(tmp_path, monkeypatch, capsys, edit: str) -> None:
    content = builder.render()
    copy = tmp_path / "demo.jsonl"
    if edit == "append":
        copy.write_bytes(content + b'{"hand":"edit"}\n')
    elif edit == "truncate":
        copy.write_bytes(content[: content.rindex(b"\n", 0, len(content) - 1) + 1])
    monkeypatch.setattr(builder, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(builder, "OUTPUTS", ((copy, builder.render),))
    monkeypatch.setattr(sys, "argv", [str(SCRIPT), "--check"])

    assert builder.main() == 1
    captured = capsys.readouterr()
    assert captured.err == "build_replay_fixture: demo.jsonl is stale; rebuild it.\n"
    assert captured.out == ""
    # Check mode never repairs the file.
    assert (copy.read_bytes() if copy.exists() else None) != content


def test_write_mode_restores_the_canonical_bytes(tmp_path, monkeypatch, capsys) -> None:
    copy = tmp_path / "demo.jsonl"
    copy.write_bytes(b"hand edit\n")
    monkeypatch.setattr(builder, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(builder, "OUTPUTS", ((copy, builder.render),))
    monkeypatch.setattr(sys, "argv", [str(SCRIPT)])

    assert builder.main() == 0
    assert copy.read_bytes() == builder.render()
    assert "wrote demo.jsonl" in capsys.readouterr().out


def test_the_story_uses_fixed_synthetic_identities_and_times() -> None:
    events = builder.persist(builder.build_story())
    assert {event.scope.mansion_id for event in events} == {builder.MANSION}
    assert [event.sequence for event in events] == list(range(1, len(events) + 1))
    for event in events:
        # Every session slot is the story's own: no record of an unrelated Crew session.
        assert event.scope.session_slot == f"hh-{event.scope.ghost_id}-{event.scope.run_id}"
        assert event.persisted_at_ms >= builder.BASE_MS
        assert event.persisted_at_ms < builder.BASE_MS + 3_600_000
        if event.occurred_at_ms is not None:
            assert event.occurred_at_ms == event.persisted_at_ms - builder.PERSIST_LAG_MS
    # Persistence times never run backward, so the log reads in story order.
    stamps = [event.persisted_at_ms for event in events]
    assert stamps == sorted(stamps)


def test_the_expected_evidence_matches_the_story() -> None:
    events = builder.persist(builder.build_story())
    expected = json.loads(builder.render_expected())
    assert expected["source"] == "fixtures/replay/demo.jsonl"
    assert expected["mansion_id"] == builder.MANSION
    assert expected["record_count"] == len(events)
    # A writer log has one record per event, so selection keeps them all in Sequence order.
    assert expected["selected_record_ids"] == [event.record_id for event in events]
    assert expected["selection_diagnostics"] == 0
    assert expected["projection"]["workflow"] == json.loads(builder.render_workflow())["steps"][-1]["workflow"]


def test_the_story_covers_the_judge_narrative() -> None:
    told = builder.narrative(builder.persist(builder.build_story()))
    assert len(told["ghost_ids"]) >= 2
    assert told["tool_started"] >= 1 and told["tool_finished"] >= 1
    assert told["approval_requested"] >= 1 and told["approval_decided"] >= 1
    assert told["door_decisions"] >= 1
    assert told["run_completed"] >= 1
    assert told["run_blocked"] + told["run_failed"] >= 1


def test_the_expected_evidence_is_not_a_runtime_input() -> None:
    """Replay state comes from folding the Event_Log; no page or build config loads the expectation."""

    name = builder.EXPECTED_FIXTURE.name
    ui = REPO_ROOT / "app" / "ui"
    sources = [ui / "vite.replay.config.ts", ui / "vite.config.ts", *(ui / "replay").glob("*")]
    sources += [path for path in (ui / "src").rglob("*.ts*") if ".test." not in path.name and "/test/" not in path.as_posix()]
    assert sources
    for path in sources:
        if path.is_file():
            assert name not in path.read_text(encoding="utf-8"), path.relative_to(REPO_ROOT).as_posix()
