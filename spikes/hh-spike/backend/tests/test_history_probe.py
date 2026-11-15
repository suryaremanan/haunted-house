from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import history_probe  # noqa: E402


def test_shape_summary_contains_no_scalar_values() -> None:
    private_path = "/".join(("", "Users", "example", "private.txt"))
    value = {
        "key": "hh-s2-probe",
        "messages": [
            {
                "role": "user",
                "content": f"private {private_path}",
                "meta": {"mid": "private-mid", "authorization": "<credential>"},
            }
        ],
    }

    encoded = json.dumps(history_probe.summarize_value(value))

    assert "private-mid" not in encoded
    assert "private.txt" not in encoded
    assert "<credential>" not in encoded
    assert "authorization" not in encoded
    assert '"content": "string"' in encoded


def test_capture_history_requires_one_matching_slot() -> None:
    history = {
        "key": "hh-s2-probe",
        "messages": [{"role": "assistant", "content": "private response"}],
        "total": 1,
        "has_more": False,
        "running": False,
    }

    capture = history_probe.capture_history(history, "hh-s2-probe")

    assert capture is not None
    assert capture["target_slot"] == "[target-slot]"
    assert capture["message_count"] == 1
    assert capture["reported_total"] == 1
    assert capture["has_more"] is False
    assert "private response" not in json.dumps(capture)
    assert history_probe.capture_history(history, "another-slot") is None


def test_capture_history_rejects_a_nested_unrelated_slot() -> None:
    history = {
        "key": "hh-s2-probe",
        "messages": [{"slot": "another-slot", "content": "not ours"}],
    }

    assert history_probe.capture_history(history, "hh-s2-probe") is None


def test_parse_dashboard_url_returns_only_origin_and_credential() -> None:
    query_name = "".join(("to", "ken"))
    output = f"Dashboard: http://127.0.0.1:5476/?{query_name}=%3Cdashboard-token%3E\n"

    origin, credential = history_probe.parse_dashboard_url(output)

    assert origin == "http://127.0.0.1:5476"
    assert credential == "<dashboard-token>"


def test_baseline_observation_is_scoped_and_bounded(tmp_path: Path) -> None:
    baseline = tmp_path / "baseline.jsonl"
    rows = [
        {"t": 10.0, "frame": {"type": "chat_status", "data": {"slot": "hh-s2-probe"}}},
        {
            "t": 11.0,
            "frame": {
                "type": "shared_crew.decision",
                "data": {"decision": {"session_key": "hh-s2-probe"}},
            },
        },
    ]
    baseline.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")

    latest, count = history_probe.baseline_observation(baseline, "hh-s2-probe")

    assert latest == 11.0
    assert count == 2


def test_baseline_observation_rejects_unrelated_sessions(tmp_path: Path) -> None:
    baseline = tmp_path / "baseline.jsonl"
    baseline.write_text(
        json.dumps(
            {"t": 10.0, "frame": {"type": "chat_status", "data": {"slot": "another-slot"}}}
        )
        + "\n",
        encoding="utf-8",
    )

    with pytest.raises(RuntimeError, match="baseline_contains_unrelated_slot"):
        history_probe.baseline_observation(baseline, "hh-s2-probe")


def test_run_probe_reports_restart_without_exposing_slot(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    baseline = tmp_path / "baseline.jsonl"
    baseline.write_text(
        json.dumps(
            {"t": 10.0, "frame": {"type": "chat_status", "data": {"slot": "hh-s2-probe"}}}
        )
        + "\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(history_probe, "gateway_start_epoch", lambda: 20.0)
    monkeypatch.setattr(
        history_probe,
        "dashboard_credentials",
        lambda: ("http://127.0.0.1:5476", "<dashboard-token>"),
    )
    monkeypatch.setattr(
        history_probe,
        "fetch_history",
        lambda _origin, _credential, _slot: {
            "key": "hh-s2-probe",
            "messages": [{"role": "user", "content": "private"}],
            "total": 1,
            "has_more": False,
            "running": False,
        },
    )

    result = history_probe.run_probe("hh-s2-probe", baseline)

    assert result["status"] == "observed"
    assert result["gateway_restart_after_baseline"] is True
    encoded = json.dumps(result)
    assert "hh-s2-probe" not in encoded
    assert "private" not in encoded
    assert "dashboard-token" not in encoded
