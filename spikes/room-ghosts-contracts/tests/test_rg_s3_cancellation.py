from __future__ import annotations

import copy
import json
import sys
import tempfile
from pathlib import Path

import pytest

SPIKE_ROOT = Path(__file__).resolve().parents[1]
if str(SPIKE_ROOT) not in sys.path:
    sys.path.insert(0, str(SPIKE_ROOT))

import crew_harness  # noqa: E402
import rg_s3_probe  # noqa: E402
from rg_s3_probe import CONTRACT, FIXTURE, SECTIONS, SHAPES, evaluate  # noqa: E402

CONFIRMED_STATES = {"stopped", "force_stopped", "stop_failed_reset"}


def _observed(**overrides: bool) -> dict[str, object]:
    report: dict[str, object] = {
        "status": "observed",
        "crewVersion": "0.12.2",
        "isolatedHome": True,
        "shapes": copy.deepcopy(SHAPES),
    }
    for section, names in SECTIONS.items():
        report[section] = {name: True for name in names}
    for dotted, value in overrides.items():
        section, name = dotted.split("__")
        report[section][name] = value  # type: ignore[index]
    return report


def test_evaluate_keeps_cancel_disabled_even_when_every_check_holds() -> None:
    report = evaluate(_observed())

    assert report["spike"] == "RG-S3" and report["task"] == "room-ghosts 1.3"
    assert report["failedChecks"] == []
    assert report["liveGatewayExercised"] is False and report["isolatedHome"] is True
    assert report["outcome"] == "request_contract_verified_in_isolation_live_confirmation_unverified"
    assert report["decision"]["cancelControl"] == "disabled_contract_unavailable"
    assert report["decision"]["cancellationService"] == "implement_behind_default_off_flag"
    assert report["decision"]["liveConfirmationClaimed"] is False
    assert report["contract"] == CONTRACT


@pytest.mark.parametrize(
    ("override", "failed"),
    [
        ({"ownership__otherAppsSlotIsNotFound": False}, "ownership.otherAppsSlotIsNotFound"),
        ({"confirmedStop__completedToolRowsUnchanged": False}, "confirmedStop.completedToolRowsUnchanged"),
        ({"scope__installedAppWithChatGrantsAllowed": False}, "scope.installedAppWithChatGrantsAllowed"),
    ],
)
def test_evaluate_withdraws_contract_and_service_on_any_failed_check(
    override: dict[str, bool], failed: str
) -> None:
    report = evaluate(_observed(**override))

    assert report["failedChecks"] == [failed]
    assert report["outcome"] == "contract_unproved"
    assert report["contract"] is None
    assert report["decision"]["cancelControl"] == "disabled_contract_unavailable"
    assert report["decision"]["cancellationService"] == "do_not_implement"


def test_evaluate_fails_a_drifted_wire_shape() -> None:
    drifted = _observed()
    drifted["shapes"]["responseKeys"] = ["ok", "stop_id"]  # type: ignore[index]

    report = evaluate(drifted)

    assert report["failedChecks"] == ["shapes.responseKeys"]
    assert report["contract"] is None


def test_evaluate_rejects_unexpected_report_shapes() -> None:
    extra = _observed()
    extra["path"] = "/somewhere"
    missing_check = _observed()
    del missing_check["route"]["stopRouteRegisteredAsPost"]  # type: ignore[attr-defined]
    not_bool = _observed()
    not_bool["scope"]["unknownAppRefused"] = "yes"  # type: ignore[index]
    not_isolated = _observed()
    not_isolated["isolatedHome"] = False

    for bad in (extra, missing_check, not_bool, not_isolated, {"status": "observed"}, None):
        with pytest.raises(ValueError):
            evaluate(bad)


def test_contract_names_one_request_and_an_unambiguous_confirmation() -> None:
    event = CONTRACT["confirmationEvent"]

    assert (CONTRACT["method"], CONTRACT["routeTemplate"]) == ("POST", "/api/chat/slots/{slot}/stop")
    assert CONTRACT["requestBodyKeys"] == [] and CONTRACT["requestQueryKeys"] == []
    assert CONTRACT["extraApiGrantNeeded"] is False
    assert CONTRACT["requiredApiGrants"] == ["/api/chat", "/api/chat/*"]
    assert CONTRACT["successResponse"]["keys"] == ["ok"]
    assert event["frame"] == "chat_message" and event["match"]["meta.kind"] == "stop_event"
    assert {entry["meta.state"] for entry in event["confirmed"]} == CONFIRMED_STATES
    assert event["pending"]["meta.state"] not in CONFIRMED_STATES
    assert all(entry["meta.state"] not in CONFIRMED_STATES for entry in event["notConfirmed"])
    assert {"id", "kind", "state", "outcome"} <= set(event["metaKeys"])
    assert CONTRACT["completedToolEvents"]


def test_committed_fixture_matches_schema_and_is_scrubbed_and_fail_closed() -> None:
    text = FIXTURE.read_text(encoding="utf-8")
    fixture = json.loads(text)

    for forbidden in (str(Path.home()), tempfile.gettempdir(), "/Applications/", "/Users/", "/home/", "/private/"):
        assert forbidden not in text
    crew_harness.assert_scrubbed(fixture)
    assert text == json.dumps(fixture, indent=2, sort_keys=True) + "\n"
    assert fixture["spike"] == "RG-S3" and fixture["schema_version"] == 1
    assert fixture["isolatedHome"] is True and fixture["liveGatewayExercised"] is False
    assert {section: set(checks) for section, checks in fixture["checks"].items()} == SECTIONS
    assert all(value is True for checks in fixture["checks"].values() for value in checks.values())
    assert fixture["failedChecks"] == []
    # The committed fixture is exactly what evaluate builds from its own checks.
    rebuilt = evaluate(
        {
            "status": "observed",
            "crewVersion": fixture["crewVersion"],
            "isolatedHome": True,
            "shapes": copy.deepcopy(SHAPES),
            **fixture["checks"],
        }
    )
    assert fixture == json.loads(json.dumps(rebuilt))


def test_committed_fixture_carries_a_decision_and_a_manual_step_per_unverified_item() -> None:
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    decision = fixture["decision"]
    unverified = fixture["evidence"]["unverified"]

    assert decision["cancelControl"] == "disabled_contract_unavailable"
    assert decision["liveConfirmationClaimed"] is False
    assert "contract_unavailable" in decision["summary"]
    assert decision["whenUnconfirmedAfter30Seconds"] == "cancel_unconfirmed_and_retain_claim"
    assert len(unverified) >= 1
    for item in unverified:
        assert set(item) == {"claim", "needs", "manual_step"}
        assert all(isinstance(item[key], str) and item[key].strip() for key in item)
        assert "/api/chat/slots/<slot>/stop" in item["manual_step"]
        assert "disposable" in item["manual_step"]
    assert fixture["evidence"]["verified"] and fixture["evidence"]["inferred"]


def test_probe_reports_harness_failure_without_writing(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    monkeypatch.setattr(crew_harness, "find_crew_python", lambda: None)
    before = FIXTURE.read_text(encoding="utf-8")

    status = rg_s3_probe.main(["--write"])

    printed = json.loads(capsys.readouterr().out)
    assert status == 2
    assert printed == {"spike": "RG-S3", "status": "unverified", "code": "crew_test_harness_unavailable"}
    assert FIXTURE.read_text(encoding="utf-8") == before


def test_probe_downgrades_a_worker_report_it_cannot_validate(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(crew_harness, "run_worker", lambda *args, **kwargs: ({"status": "observed"}, 0))

    report, status = rg_s3_probe.run_probe()

    assert status == 2
    assert report == {"spike": "RG-S3", "status": "unverified", "code": "crew_test_harness_unsafe_report"}


@pytest.mark.skipif(crew_harness.find_crew_python() is None, reason="Crew's bundled Python is not installed")
def test_real_probe_run_reproduces_the_committed_fixture() -> None:
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))

    report, status = rg_s3_probe.run_probe()

    if report.get("crewVersion") != fixture["crewVersion"]:
        pytest.skip("installed Crew differs from the version the fixture records")
    assert status == 0
    assert report["checks"] == fixture["checks"]
    assert report["failedChecks"] == []
    assert report == fixture
    assert not list(SPIKE_ROOT.glob(crew_harness.WORK_PREFIX + "*"))
