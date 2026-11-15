from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

import pytest

SPIKE_ROOT = Path(__file__).resolve().parents[1]
if str(SPIKE_ROOT) not in sys.path:
    sys.path.insert(0, str(SPIKE_ROOT))

import crew_harness  # noqa: E402
import rg_s5_probe  # noqa: E402
from rg_s5_probe import (  # noqa: E402
    CLASSES,
    EVIDENCE_LABELS,
    EXPECTED_OBSERVED,
    FIXTURE,
    RETRYABLE_HTTP,
    SECTIONS,
    classify,
    evaluate,
)

REPORT_KEYS = {
    "spike",
    "schema_version",
    "task",
    "crewVersion",
    "isolatedHome",
    "liveGatewayExercised",
    "checks",
    "failedChecks",
    "observed",
    "outcome",
    "classification",
    "acceptedSignals",
    "evidence",
    "decision",
    "guidance",
}


def _observed(**overrides: bool) -> dict[str, object]:
    report: dict[str, object] = {
        "status": "observed",
        "crewVersion": "0.12.2",
        "isolatedHome": True,
        "observed": copy.deepcopy(EXPECTED_OBSERVED),
    }
    for section, names in SECTIONS.items():
        report[section] = {name: True for name in names}
    for dotted, value in overrides.items():
        section, name = dotted.split("__")
        report[section][name] = value  # type: ignore[index]
    return report


def _fixture() -> dict[str, object]:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_evaluate_names_the_exact_retryable_set_when_every_check_holds() -> None:
    report = evaluate(_observed())

    assert set(report) == REPORT_KEYS
    assert report["spike"] == "RG-S5" and report["task"] == "room-ghosts 1.5"
    assert report["schema_version"] == 1 and report["crewVersion"] == "0.12.2"
    assert report["isolatedHome"] is True and report["liveGatewayExercised"] is False
    assert report["failedChecks"] == []
    assert report["outcome"] == "isolated_contract_verified_live_pressure_unverified"
    decision = report["decision"]
    assert decision["rule"] == "retry only known signals; classify any unknown refusal as blocked"
    assert decision["knownRetryable"]["http"] == [
        {"status": 429, "code": code}
        for code in (
            "principal_active_limit",
            "principal_queue_full",
            "crew_active_limit",
            "crew_queue_full",
            "session_create_rate",
        )
    ]
    assert decision["knownRetryable"]["notice"] == ["background_turn_abandoned"]
    assert decision["unknownRefusal"] == "blocked"
    assert decision["retryConsumesAttempt"] is False
    assert decision["refusedSlotCreateLeavesSlot"] is False
    assert decision["liveAcceptanceRequiredBeforeDemo"] is True
    assert "at most three turns" in decision["manualStep"].lower()
    assert "DELETE /api/chat/slots/{slot}" in decision["manualStep"]


@pytest.mark.parametrize(
    "failing",
    [
        "admission__pressureRefusalsAre429WithRetryAfter",
        "admission__exactlyFiveReasonsMapTo429",
        "background__abandonedTurnNeverRan",
        "ownership__foreignSlotConflictIsUniform404",
        "sizing__startWidthNeverBelowFloor",
    ],
)
def test_a_failed_check_empties_the_retryable_set(failing: str) -> None:
    report = evaluate(_observed(**{failing: False}))

    assert report["failedChecks"] == [failing.replace("__", ".")]
    assert report["outcome"] == "contract_unproved"
    assert report["decision"]["knownRetryable"] == {"http": [], "notice": []}
    assert report["observed"] == {}
    assert classify("http", 429, "crew_queue_full", report) == "blocked"


def test_changed_crew_constants_fail_the_contract() -> None:
    observed = _observed()
    observed["observed"]["background"]["defaultCap"] = 2  # type: ignore[index]

    report = evaluate(observed)

    assert report["failedChecks"] == ["observed.values"]
    assert report["decision"]["knownRetryable"] == {"http": [], "notice": []}


@pytest.mark.parametrize(
    "mutate",
    [
        lambda r: r.update(status="unverified"),
        lambda r: r.update(isolatedHome=False),
        lambda r: r.update(crewVersion="/somewhere/else"),
        lambda r: r.update(extra=True),
        lambda r: r.pop("sizing"),
        lambda r: r["admission"].update(fullQueueIsRefused="yes"),
        lambda r: r["background"].pop("abandonedTurnNeverRan"),
        lambda r: r["ownership"].update(unexpected=True),
    ],
)
def test_evaluate_rejects_an_unexpected_worker_report(mutate) -> None:  # type: ignore[no-untyped-def]
    observed = _observed()
    mutate(observed)

    with pytest.raises(ValueError):
        evaluate(observed)


def test_classify_is_fail_closed_for_every_unknown_signal() -> None:
    report = evaluate(_observed())

    for status, code in RETRYABLE_HTTP:
        assert classify("http", status, code, report) == "retryable_pressure"
    assert classify("ws", None, "background_turn_abandoned", report) == "retryable_pressure"
    for where, status, code in (
        ("http", 429, None),
        ("http", 429, "something_new"),
        ("http", 503, "crew_queue_full"),
        ("http", 503, "task_store_unavailable"),
        ("http", 503, "containment_unavailable"),
        ("http", 507, "storage_limit"),
        ("http", 404, "slot_not_found"),
        ("http", 409, None),
        ("http", 500, None),
        ("ws", None, "capacity_retries_spent"),
        ("ws", None, "session_busy_give_up"),
        ("ws", 429, "crew_queue_full"),
    ):
        assert classify(where, status, code, report) == "blocked"


def test_fixture_matches_the_report_schema() -> None:
    fixture = _fixture()

    assert set(fixture) == REPORT_KEYS
    assert fixture["spike"] == "RG-S5" and fixture["schema_version"] == 1
    assert fixture["task"] == "room-ghosts 1.5"
    assert crew_harness.VERSION_PATTERN.fullmatch(fixture["crewVersion"])
    assert fixture["isolatedHome"] is True and fixture["liveGatewayExercised"] is False
    assert fixture["failedChecks"] == []
    assert {section: set(checks) for section, checks in fixture["checks"].items()} == SECTIONS
    assert all(value is True for checks in fixture["checks"].values() for value in checks.values())
    assert fixture["observed"] == EXPECTED_OBSERVED
    rebuilt = evaluate(
        {
            "status": "observed",
            "crewVersion": fixture["crewVersion"],
            "isolatedHome": True,
            "observed": fixture["observed"],
            **fixture["checks"],
        }
    )
    assert rebuilt == fixture


def test_fixture_is_scrubbed() -> None:
    fixture = _fixture()
    text = FIXTURE.read_text(encoding="utf-8")

    crew_harness.assert_scrubbed(fixture)
    for forbidden in ("/Users/", "/home/", "/Applications/", "/private/", "token=", "site-packages"):
        assert forbidden not in text


def test_every_classification_row_is_well_formed() -> None:
    rows = _fixture()["classification"]

    assert len(rows) >= 15
    seen = set()
    for row in rows:
        assert set(row) == {"signal", "class", "evidence", "source", "note"}
        signal = row["signal"]
        assert set(signal) == {"where", "status", "code_or_field"}
        assert signal["where"] in ("http", "ws")
        assert (signal["status"] is None) == (signal["where"] == "ws")
        assert signal["where"] == "ws" or 200 <= signal["status"] <= 599
        assert isinstance(signal["code_or_field"], str) and signal["code_or_field"]
        assert row["class"] in CLASSES
        assert row["evidence"] in EVIDENCE_LABELS
        assert row["source"] and not row["source"].startswith("/") and row["note"]
        key = (signal["where"], signal["status"], signal["code_or_field"])
        assert key not in seen
        seen.add(key)
    assert {row["class"] for row in rows} == set(CLASSES)


def test_retryable_rows_and_decision_agree() -> None:
    fixture = _fixture()
    known = fixture["decision"]["knownRetryable"]
    retryable = [row for row in fixture["classification"] if row["class"] == "retryable_pressure"]

    assert all(row["evidence"] == "verified" for row in retryable)
    http_rows = [
        {"status": row["signal"]["status"], "code": row["signal"]["code_or_field"].removeprefix("code=")}
        for row in retryable
        if row["signal"]["where"] == "http"
    ]
    notice_rows = [
        row["signal"]["code_or_field"].removeprefix("meta.notice=")
        for row in retryable
        if row["signal"]["where"] == "ws"
    ]
    assert http_rows == known["http"]
    assert notice_rows == known["notice"]
    assert all(entry["status"] == 429 for entry in known["http"])
    # Nothing that is merely accepted may be mistaken for a refusal to retry.
    for accepted in fixture["acceptedSignals"]:
        signal = accepted["signal"]
        code = signal["code_or_field"].removeprefix("meta.notice=")
        assert classify(signal["where"], signal["status"], code, fixture) == "blocked"
        assert accepted["evidence"] in EVIDENCE_LABELS


def test_evidence_lists_a_manual_step_for_every_unverified_item() -> None:
    fixture = _fixture()
    evidence = fixture["evidence"]

    assert set(evidence) == {"verified", "inferred", "unverified"}
    assert evidence["verified"] and evidence["inferred"] and evidence["unverified"]
    assert all(isinstance(item, str) and item for item in evidence["verified"] + evidence["inferred"])
    for item in evidence["unverified"]:
        assert set(item) == {"claim", "needs", "manual_step"}
        assert all(isinstance(item[key], str) and item[key] for key in item)
        assert "owner action" in item["needs"]
    assert fixture["decision"]["manualStep"]
    assert fixture["decision"]["retryableRefusalExpectedOnDefaultHost"] is False
    assert set(fixture["guidance"]) == {"predicate", "delay", "cleanup", "defaultHost", "clientGap"}


def test_failed_harness_reports_are_not_written(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    target = tmp_path / "fixture.json"

    status = crew_harness.emit(crew_harness.failure("RG-S5", "crew_test_harness_unavailable"), 2, target, ["--write"])

    assert status == 2 and not target.exists()
    assert json.loads(capsys.readouterr().out)["status"] == "unverified"


def test_probe_reports_unverified_without_crew(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(crew_harness, "find_crew_python", lambda: None)

    report, status = rg_s5_probe.run_probe()

    assert status == 2
    assert report == {"spike": "RG-S5", "status": "unverified", "code": "crew_test_harness_unavailable"}


def test_real_probe_reproduces_the_fixture_checks() -> None:
    if crew_harness.find_crew_python() is None:
        pytest.skip("Crew's Python is not available")

    report, status = rg_s5_probe.run_probe()

    fixture = _fixture()
    assert status == 0
    assert report["checks"] == fixture["checks"]
    assert report["failedChecks"] == []
    assert report["observed"] == fixture["observed"]
    assert report["decision"] == fixture["decision"]
    if report["crewVersion"] == fixture["crewVersion"]:
        assert report == fixture
    assert not list(rg_s5_probe.ROOT.glob(crew_harness.WORK_PREFIX + "*"))
