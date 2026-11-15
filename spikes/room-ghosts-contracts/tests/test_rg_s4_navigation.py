from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

SPIKE_ROOT = Path(__file__).resolve().parents[1]
if str(SPIKE_ROOT) not in sys.path:
    sys.path.insert(0, str(SPIKE_ROOT))

import crew_harness  # noqa: E402
import rg_s4_worker  # noqa: E402
from rg_s4_probe import CONTRACT, FALLBACK, FIXTURE, SECTIONS, evaluate, run_probe  # noqa: E402

# Synthetic stand-ins shaped like the shipped assets; never copied from Crew.
STUB = """const m = window.__kirocrew_modules?.['@kirocrew/app-sdk']
export const {
  useAppApi, useNavigate,
  // a comment, with a comma
  useChatLauncher, APP_SDK_LEVEL,
} = m
"""
INDEX = '<script type="importmap">{"imports":{"@kirocrew/app-sdk":"/vendor/kirocrew-app-sdk.mjs"}}</script>'
HOST = (
    "x({useChatLauncher:()=>B,useNavigate:()=>L});"
    "function B(){let{navigate:e}=U();return{openChat:c((t={})=>{"
    "window.__mc_chat_launch={agent:t.agent,slotKey:t.slotKey,ts:Date.now()},"
    "e(t.slotKey?`/chat?sid=${encodeURIComponent(t.slotKey)}`:R(t)?`/chat?new=1`:`/chat`)})}}"
    "h({navigateFn:m});"
    "t.slotKey&&t.slotKey===T.get(`sid`)&&go();say(`appChatLaunch.targetUnavailable`);"
    "if(T.get(`new`)!==`1`)return;let C=T.get(`sid`)||T.get(`slot`);"
    "r=[{path:`/chat`}];d=G(`/apps/${e.name}/ui/${s}`)"
)
SLICE = "a=p(`chat/switchSlot`,f);b=p(`chat/createSlot`,g)"


def _observed(**overrides: bool) -> dict[str, object]:
    report: dict[str, object] = {
        "status": "observed",
        "crewVersion": "0.12.2",
        "isolatedHome": True,
        "sdkLevel": 1,
        "sdkExports": ["APP_SDK_LEVEL", "useChatLauncher", "useNavigate"],
    }
    for section, names in SECTIONS.items():
        report[section] = {name: True for name in names}
    for dotted, value in overrides.items():
        section, name = dotted.split("__")
        report[section][name] = value  # type: ignore[index]
    return report


def test_worker_parses_the_stub_export_list() -> None:
    assert rg_s4_worker.stub_exports(STUB) == ["APP_SDK_LEVEL", "useAppApi", "useChatLauncher", "useNavigate"]
    assert rg_s4_worker.stub_exports("export default 1") == []


def test_worker_checks_hold_on_a_matching_bundle_shape() -> None:
    exports = rg_s4_worker.stub_exports(STUB)

    sdk = rg_s4_worker.sdk_checks(STUB, INDEX, exports, 1)
    host = rg_s4_worker.host_checks(HOST, SLICE)

    assert set(sdk) == SECTIONS["sdk"] and all(sdk.values())
    assert set(host) == SECTIONS["host"] and all(host.values())


def test_worker_checks_fail_when_the_slot_route_is_missing() -> None:
    without_slot = HOST.replace("t.slotKey?`/chat?sid=${encodeURIComponent(t.slotKey)}`:", "")

    host = rg_s4_worker.host_checks(without_slot, "`chat/createSlot`")
    sdk = rg_s4_worker.sdk_checks(STUB.replace("useChatLauncher, ", ""), "", ["useNavigate"], 2)

    assert host["openChatWithSlotKeyNavigatesToSidRoute"] is False
    assert host["openChatWithoutSlotKeyCanRequestNewChat"] is False
    assert host["switchAndCreateAreSeparateOperations"] is False
    assert sdk["stubExportsUseChatLauncher"] is False
    assert sdk["importMapServesSdkFromHostStub"] is False
    assert sdk["packagedSdkLevelIsOne"] is False


def test_evaluate_names_one_candidate_and_keeps_the_link_disabled() -> None:
    report = evaluate(_observed())

    assert report["failedChecks"] == []
    assert report["outcome"] == "candidate_contract_found_live_behaviour_unverified"
    assert report["contract"]["call"] == "useChatLauncher().openChat({ slotKey })"
    assert report["contract"]["resolvesToRoute"].startswith("/chat?sid=")
    assert report["decision"]["result"] == FALLBACK
    assert report["decision"]["sessionLink"] == "disabled"
    assert report["decision"]["disabledCode"] == "contract_unavailable"
    assert report["decision"]["substituteNewChat"] == "never"
    assert report["decision"]["candidateToImplementBehindDisabledDefault"] == CONTRACT["call"]
    assert report["liveGatewayExercised"] is False


def test_evaluate_withdraws_the_candidate_when_a_check_fails() -> None:
    report = evaluate(_observed(host__openChatWithSlotKeyNavigatesToSidRoute=False))

    assert report["failedChecks"] == ["host.openChatWithSlotKeyNavigatesToSidRoute"]
    assert report["outcome"] == "contract_unproved"
    assert report["contract"] is None
    assert report["decision"]["candidateToImplementBehindDisabledDefault"] is None
    assert report["decision"]["sessionLink"] == "disabled"
    assert report["decision"]["substituteNewChat"] == "never"


@pytest.mark.parametrize(
    "mutate",
    [
        lambda r: r.update(path="/somewhere"),
        lambda r: r.pop("sdkExports"),
        lambda r: r.update(isolatedHome=False),
        lambda r: r.update(crewVersion="latest"),
        lambda r: r.update(sdkLevel=True),
        lambda r: r.update(sdkExports=["useNavigate", "useChatLauncher"]),
        lambda r: r.update(sdkExports=["use Chat"]),
        lambda r: r["host"].update(extra=True),
        lambda r: r["sdk"].update(stubExportsUseNavigate="yes"),
    ],
)
def test_evaluate_rejects_unexpected_report_shapes(mutate) -> None:  # type: ignore[no-untyped-def]
    report = _observed()
    mutate(report)

    with pytest.raises(ValueError):
        evaluate(report)
    with pytest.raises(ValueError):
        evaluate({"status": "observed"})


def test_committed_fixture_matches_the_schema_and_is_scrubbed() -> None:
    text = FIXTURE.read_text(encoding="utf-8")
    fixture = json.loads(text)

    crew_harness.assert_scrubbed(fixture)
    assert str(Path.home()) not in text and "/Applications/" not in text
    assert fixture["spike"] == "RG-S4" and fixture["schema_version"] == 1
    assert fixture["task"] == "room-ghosts 1.4"
    assert fixture["isolatedHome"] is True and fixture["liveGatewayExercised"] is False
    assert crew_harness.VERSION_PATTERN.fullmatch(fixture["crewVersion"])
    assert {section: set(checks) for section, checks in fixture["checks"].items()} == SECTIONS
    assert fixture["failedChecks"] == []
    assert {"useChatLauncher", "useNavigate", "useAppApi"} <= set(fixture["sdkExports"])
    # Rebuilding from the recorded observations reproduces the whole fixture.
    observed = {
        "status": "observed",
        "crewVersion": fixture["crewVersion"],
        "isolatedHome": True,
        "sdkLevel": fixture["sdkLevel"],
        "sdkExports": fixture["sdkExports"],
        **fixture["checks"],
    }
    assert evaluate(observed) == fixture


def test_committed_fixture_fails_closed_with_a_manual_step_per_open_item() -> None:
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    decision, contract, evidence = fixture["decision"], fixture["contract"], fixture["evidence"]

    assert decision["result"].startswith("cannot be proven without a live dashboard")
    assert "contract_unavailable" in decision["result"]
    assert decision["sessionLink"] == "disabled" and decision["substituteNewChat"] == "never"
    assert decision["candidateToImplementBehindDisabledDefault"] == contract["call"]
    assert contract["sdkExport"] in fixture["sdkExports"]
    assert len(contract["neverCall"]) >= 3 and any("new=1" in item for item in contract["neverCall"])
    assert evidence["verified"] and evidence["inferred"]
    assert len(evidence["unverified"]) >= 1
    for item in evidence["unverified"]:
        assert set(item) == {"claim", "needs", "manual_step"}
        assert all(isinstance(value, str) and value.strip() for value in item.values())


def test_real_probe_run_reproduces_the_committed_checks() -> None:
    if crew_harness.find_crew_python() is None:
        pytest.skip("Crew's Python is not available on this host")
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))

    report, status = run_probe()

    assert status == 0
    assert report["checks"] == fixture["checks"]
    assert report["sdkExports"] == fixture["sdkExports"]
    assert report["decision"] == fixture["decision"]
    assert not list(SPIKE_ROOT.glob(crew_harness.WORK_PREFIX + "*"))
