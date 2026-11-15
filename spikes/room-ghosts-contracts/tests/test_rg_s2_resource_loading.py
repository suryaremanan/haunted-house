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
import rg_s2_probe  # noqa: E402
from rg_s2_probe import APP_SOURCE, FIXTURE, MVP_ROLES, SECTIONS, STEERING, evaluate, stage_app  # noqa: E402

SKILL_FORM = "skill://~/.kiro/crew/skills/haunted-house/<skill>/SKILL.md"


def _tools(role: str) -> list[str]:
    profile = json.loads((APP_SOURCE / "agents" / f"hh-{role}.json").read_text(encoding="utf-8"))
    return list(profile["tools"])


def _observed(**overrides: bool) -> dict[str, object]:
    manifest = json.loads((APP_SOURCE / "app.json").read_text(encoding="utf-8"))
    report: dict[str, object] = {
        "status": "observed",
        "crewVersion": "0.12.2",
        "isolatedHome": True,
        "observed": {
            "declaredAgents": manifest["agents"],
            "declaredSkills": manifest["skills"],
            "visibleTools": {role: _tools(role) for role in MVP_ROLES},
            "installedSkillUriForm": SKILL_FORM,
        },
    }
    for section, names in SECTIONS.items():
        report[section] = {name: True for name in names}
    for dotted, value in overrides.items():
        section, name = dotted.split("__")
        report[section][name] = value  # type: ignore[index]
    return report


def test_evaluate_records_the_explicit_resource_contract() -> None:
    report = evaluate(_observed())

    assert report["spike"] == "RG-S2" and report["task"] == "room-ghosts 1.2"
    assert report["failedChecks"] == []
    assert report["isolatedHome"] is True and report["liveGatewayExercised"] is False
    assert report["outcome"] == "isolated_contract_verified_live_loading_unverified"
    contract = report["contract"]
    assert contract["steeringResource"] == STEERING
    assert contract["excludedTools"] == ["@kirocrew-core"]
    assert contract["skillResourceInProfile"] is False
    assert contract["skillDelivery"] == "bounded_prompt_block"
    assert contract["installedSkillUriForm"] == SKILL_FORM
    decision = report["decision"]
    assert decision["skill"] == "skill_uri_rejected_use_bounded_immutable_prompt_injection"
    assert decision["implicitInheritance"] == "disabled_by_excluding_crew_skill_server"
    assert decision["mediumRegisteredByDefault"] is False
    assert decision["liveAcceptanceRequiredBeforeDemo"] is True


@pytest.mark.parametrize(
    ("override", "failed"),
    [
        ({"launchView__viewToolsAreExactlyTheRoomCatalog": False}, "launchView.viewToolsAreExactlyTheRoomCatalog"),
        ({"launchView__viewMountsNoCrewSkillServer": False}, "launchView.viewMountsNoCrewSkillServer"),
        ({"registration__undeclaredMediumProfileNotRegistered": False}, "registration.undeclaredMediumProfileNotRegistered"),
        ({"registration__steeringResourceStaysRelative": False}, "registration.steeringResourceStaysRelative"),
    ],
)
def test_evaluate_fails_closed_on_any_failed_check(override: dict[str, bool], failed: str) -> None:
    report = evaluate(_observed(**override))

    assert report["failedChecks"] == [failed]
    assert report["outcome"] == "contract_unproved"
    assert report["contract"]["skillDelivery"] == "unavailable"
    assert report["decision"]["steering"] == "unproved"
    assert report["decision"]["whenResourceContractUnproved"] == "start_no_room_ghost_report_contract_unavailable"


@pytest.mark.parametrize(
    "mutate",
    [
        lambda r: r.update(status="unverified"),
        lambda r: r.update(isolatedHome=False),
        lambda r: r.update(crewVersion="latest"),
        lambda r: r.pop("label"),
        lambda r: r["launchView"].pop("viewKeepsSteeringResource"),
        lambda r: r["launchView"].update(viewKeepsSteeringResource="yes"),
        lambda r: r["registration"].update(extra=True),
        lambda r: r["observed"].pop("visibleTools"),
        lambda r: r["observed"]["visibleTools"].pop("tinker"),
        lambda r: r["observed"].update(installedSkillUriForm="skill:///abs/SKILL.md"),
        lambda r: r["observed"].update(declaredSkills="skills"),
    ],
)
def test_evaluate_refuses_an_unexpected_worker_report(mutate) -> None:
    observed = copy.deepcopy(_observed())
    mutate(observed)
    with pytest.raises(ValueError):
        evaluate(observed)


def test_staging_copies_what_crew_installs_and_no_build_or_test_tree(tmp_path: Path) -> None:
    arguments = stage_app(tmp_path)

    source = Path(arguments[0])
    assert source == tmp_path / "source" and Path(arguments[1]).is_dir()
    assert (source / "app.json").is_file() and (source / "mcp" / "server.py").is_file()
    assert sorted(p.name for p in (source / "agents").iterdir()) == sorted(
        f"hh-{role}.json" for role in (*MVP_ROLES, "medium")
    )
    assert (source / "skills" / "bounded-review" / "SKILL.md").is_file()
    assert not list(source.rglob("node_modules")) and not list(source.rglob("__pycache__"))
    assert not (source / "backend" / "tests").exists()


def test_committed_fixture_matches_the_schema_and_is_scrubbed() -> None:
    report = json.loads(FIXTURE.read_text(encoding="utf-8"))
    text = json.dumps(report)

    assert report == evaluate(
        {
            "status": "observed",
            "crewVersion": report["crewVersion"],
            "isolatedHome": True,
            "observed": {
                key: report["contract"][key]
                for key in ("declaredAgents", "declaredSkills", "visibleTools", "installedSkillUriForm")
            },
            **report["checks"],
        }
    )
    assert report["failedChecks"] == []
    crew_harness.assert_scrubbed(report)
    for forbidden in (str(Path.home()), tempfile.gettempdir(), "/Applications/", "/Users/", "/home/"):
        assert forbidden not in text
    assert report["evidence"]["verified"] and report["evidence"]["inferred"]
    for item in report["evidence"]["unverified"]:
        assert set(item) == {"claim", "needs", "manual_step"}
        assert all(isinstance(value, str) and value.strip() for value in item.values())
    assert len(report["evidence"]["unverified"]) >= 3
    assert report["decision"]["liveAcceptanceRequiredBeforeDemo"] is True


def test_committed_fixture_describes_the_shipped_profiles_and_manifest() -> None:
    """The recorded result is about the files in the tree, not an older copy."""

    report = json.loads(FIXTURE.read_text(encoding="utf-8"))
    manifest = json.loads((APP_SOURCE / "app.json").read_text(encoding="utf-8"))
    contract = report["contract"]

    assert contract["declaredAgents"] == manifest["agents"]
    assert contract["declaredSkills"] == manifest["skills"]
    for role in MVP_ROLES:
        profile = json.loads((APP_SOURCE / "agents" / f"hh-{role}.json").read_text(encoding="utf-8"))
        assert contract["visibleTools"][role] == profile["tools"]
        assert profile["resources"] == [contract["steeringResource"]]
        assert profile["excludedTools"] == contract["excludedTools"]
        assert not any(item.startswith("skill://") for item in profile["resources"])


@pytest.mark.skipif(crew_harness.find_crew_python() is None, reason="Crew's Python is not installed")
def test_a_real_probe_run_reproduces_the_committed_fixture() -> None:
    report, status = rg_s2_probe.run_probe()

    assert status == 0
    committed = json.loads(FIXTURE.read_text(encoding="utf-8"))
    if report["crewVersion"] == committed["crewVersion"]:
        assert report == committed
    else:  # another Crew version: the contract must still hold
        assert report["failedChecks"] == [] and report["contract"] == committed["contract"]
    assert not list(SPIKE_ROOT.glob(".probe-work-*"))
