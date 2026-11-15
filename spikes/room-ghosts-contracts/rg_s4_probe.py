#!/usr/bin/env python3
"""RG-S4: existing-session navigation probe (room-ghosts 1.4).

Asks the installed Crew package which ``@kirocrew/app-sdk`` operation or
dashboard route opens an EXISTING app-owned chat slot from an app page without
creating another chat.  The worker reads Crew's shipped dashboard assets and
calls two slot-key helpers inside an ephemeral ``HOME``.  No gateway, browser,
kiro-cli session or network request is involved, so what a running dashboard
does stays unverified and the Session_Link stays disabled.

    python3 spikes/room-ghosts-contracts/rg_s4_probe.py            # print report
    python3 spikes/room-ghosts-contracts/rg_s4_probe.py --write    # refresh fixture
"""
from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import crew_harness  # noqa: E402

SPIKE = "RG-S4"
WORKER = ROOT / "rg_s4_worker.py"
FIXTURE = crew_harness.FIXTURES / "rg-s4-existing-session-navigation.json"
EXPORT_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
SECTIONS = {
    "sdk": {
        "importMapServesSdkFromHostStub",
        "stubReadsHostModuleRegistry",
        "stubExportsUseChatLauncher",
        "stubExportsUseNavigate",
        "stubExportsSdkLevel",
        "packagedSdkLevelIsOne",
    },
    "host": {
        "hostBindsUseChatLauncher",
        "launcherReturnsOpenChat",
        "openChatWithSlotKeyNavigatesToSidRoute",
        "openChatHandsSlotKeyToChatPage",
        "openChatWithoutSlotKeyCanRequestNewChat",
        "chatPageSwitchesToHandedSlot",
        "missingTargetHasUnavailableMessage",
        "chatPageCreatesOnlyOnNewFlag",
        "chatPageReadsSidOrSlotQuery",
        "chatRouteRegistered",
        "useNavigateIsHostRouterNavigate",
        "appPageLoadedAsModuleInDashboardDocument",
        "switchAndCreateAreSeparateOperations",
    },
    "python": {
        "safeSlotNameIsItsOwnSlotKey",
        "sessionKeyIsDashboardPrefixedSlotKey",
        "sessionKeyFoldsBackToSlotKey",
        "slotRowCarriesOwnerApp",
        "slotCreateAndDetailRoutesRegistered",
    },
}
FALLBACK = (
    "cannot be proven without a live dashboard -> the design's documented fail-closed fallback "
    "applies: Session_Link stays disabled with `contract_unavailable`; never substitute a new chat"
)
LIVE = "owner action in a real Crew dashboard"
CONTRACT = {
    "status": "candidate_from_shipped_assets_not_observed_live",
    "sdkModule": "@kirocrew/app-sdk",
    "sdkExport": "useChatLauncher",
    "call": "useChatLauncher().openChat({ slotKey })",
    "argument": {
        "slotKey": "the slot key: the `key` of the slot the backend created with POST /api/chat/slots",
        "notTheSessionKey": "do not pass dashboard:<slot key>; the chat page compares the value with slot keys",
        "notTheTitle": "the slot title and the Ghost name are display text, never an address",
    },
    "resolvesToRoute": "/chat?sid=<encodeURIComponent(slot key)>",
    "routeAlias": "/chat?slot=<slot key> is read as the same query",
    "routeOnlyEquivalent": "useNavigate()('/chat?sid=' + encodeURIComponent(slotKey))",
    "pageModel": "the app page is a module imported into the dashboard document, so the hook drives "
    "the host router directly; there is no frame or postMessage bridge to cross",
    "sdkLevelGate": "none found: useChatLauncher is a plain export at APP_SDK_LEVEL 1",
    "neverCall": [
        "openChat() with no slotKey: it opens /chat or /chat?new=1, and ?new=1 creates a chat",
        "openChat({ slotKey, message }): the message is sent into the Ghost's session as a turn",
        "openChat with agent, autoSend, memoryMode or sessionFolder: those are new-chat options",
        "useNavigate()('/chat?new=1') or a bare '/chat' as a stand-in for the session",
        "POST /api/chat/slots from the UI to make a session to link to",
    ],
    "whenSlotKeyUnknownToTheUi": "render the link disabled; never fall back to any call above",
}
EVIDENCE = {
    "verified": [
        "Crew's shipped dashboard index maps @kirocrew/app-sdk to static/dist/vendor/kirocrew-app-sdk.mjs, "
        "which re-exports the host's module registry entry.",
        "That stub exports useChatLauncher and useNavigate next to the hooks the app already uses; "
        "the full export list is recorded under sdkExports.",
        "Crew's packaged apps/app_sdk_level.py reports APP_SDK_LEVEL 1.",
        "Crew's packaged slot-key helpers, called in the isolated home: a name already in the safe "
        "charset is its own slot key, the session key is dashboard:<slot key>, and that session key "
        "folds back to the same slot key.",
        "Text presence in the shipped dashboard chunk that implements the SDK (static/dist/assets, "
        "App chunk): openChat with a slotKey builds /chat?sid=<slot key> and hands the slotKey to the "
        "chat page; the same expression yields /chat?new=1 only when no slotKey is given.",
        "Text presence in the same chunk: the chat page switches to the handed slotKey when it equals "
        "the sid query, has a target-unavailable message, and guards creation behind new=1.",
    ],
    "inferred": [
        "A match in a minified bundle shows the code is shipped, not how a running dashboard behaves: "
        "the call shape { slotKey } and the route it resolves to are read from that text.",
        "Opening by sid dispatches the dashboard's switch operation, which loads the slot's history and "
        "rejects on a missing slot; the create operation is a separate one reached through new=1 "
        "(static/dist/assets, App and chatSlice chunks).",
        "The app page is loaded by module import of /apps/<name>/ui/<ui.entry> into the dashboard "
        "document; Crew's sandboxed frames (apps/app_frame.py) serve contribution points, not the page.",
        "useNavigate is the host router's navigate, so the route-only form reaches the same chat page.",
        "The owner's dashboard is not refused an app-owned slot: the ownership checkpoint "
        "(dashboard/slot_ownership.py) leaves callers with no app claim untouched, and the slot row "
        "sent to the dashboard carries the owner app (dashboard/slot_projection.py).",
        "Chunk names carry a build hash and the hook's internals are not a documented interface, so "
        "any other Crew version needs this probe run again.",
    ],
    "unverified": [
        {
            "claim": "In a running dashboard, useChatLauncher().openChat({ slotKey }) called from the "
            "Haunted House page opens that same app-owned slot.",
            "needs": LIVE,
            "manual_step": "With a Haunted House build installed and trusted and one Room Ghost run "
            "started, note the run's slot key in the room panel, activate its Session_Link (built "
            "with the link enabled), and confirm the address shows /chat?sid=<that slot key> and the "
            "transcript shown is that Ghost's own first turn.",
        },
        {
            "claim": "Opening the link creates no chat.",
            "needs": LIVE,
            "manual_step": "Count the sessions in the dashboard sidebar before and after activating "
            "the Session_Link in the step above; the count is unchanged and no empty session appears.",
        },
        {
            "claim": "An app-owned slot is listed for, and can be opened by, the dashboard owner.",
            "needs": LIVE,
            "manual_step": "After the Ghost run starts, find the session named with the run's slot "
            "key in the dashboard sidebar and open it by hand; it shows the Ghost's transcript and "
            "no not-found notice.",
        },
        {
            "claim": "A slotKey whose slot is gone reports the target as unavailable and creates nothing.",
            "needs": LIVE,
            "manual_step": "Close the Ghost's session in the dashboard, go back to the Haunted House "
            "page, activate the stale Session_Link, and confirm an unavailable notice with the "
            "session count unchanged.",
        },
    ],
}
GUIDANCE = {
    "sdkAdapter": "Add useChatLauncher to app/ui/src/adapters/sdk.ts and its typing "
    "(useChatLauncher(): { openChat(opts?: { slotKey?: string }): void }). Read it defensively: the "
    "stub destructures the host registry, so on a host without the hook the binding is undefined.",
    "sessionLink": "SessionLink receives the slot key from Session_Link metadata in the room-ghosts "
    "read route, never from user input, and calls openChat({ slotKey }) with that one property.",
    "disabledDefault": "Ship the link disabled with contract_unavailable until the four live steps "
    "pass; also disabled when the hook is absent, the slot key is empty, or the page is the replay.",
    "replayShim": "The replay stand-in exports useChatLauncher returning an openChat that does "
    "nothing and records the call, so a test can assert it is never reached in replay.",
    "backend": "Create slots with a name already in the charset [A-Za-z0-9-] so the name is the slot "
    "key, and return the `key` from the create response as the link target.",
}


def evaluate(observed: object) -> dict[str, Any]:
    """Validate the worker report and attach the contract and the fail-closed decision."""
    expected = {"status", "crewVersion", "isolatedHome", "sdkLevel", "sdkExports", *SECTIONS}
    if (
        not isinstance(observed, dict)
        or set(observed) != expected
        or observed["status"] != "observed"
        or observed["isolatedHome"] is not True
        or not isinstance(observed["crewVersion"], str)
        or crew_harness.VERSION_PATTERN.fullmatch(observed["crewVersion"]) is None
        or type(observed["sdkLevel"]) is not int
    ):
        raise ValueError("unexpected report shape")
    exports = observed["sdkExports"]
    if (
        not isinstance(exports, list)
        or not exports
        or exports != sorted(set(exports))
        or not all(isinstance(name, str) and EXPORT_NAME.fullmatch(name) for name in exports)
    ):
        raise ValueError("unexpected report shape")
    failed: list[str] = []
    for section, names in SECTIONS.items():
        checks = observed[section]
        if not isinstance(checks, dict) or set(checks) != names:
            raise ValueError("unexpected report shape")
        for name in sorted(names):
            if not isinstance(checks[name], bool):
                raise ValueError("unexpected report shape")
            if not checks[name]:
                failed.append(f"{section}.{name}")
    candidate = not failed
    return {
        "spike": SPIKE,
        "schema_version": 1,
        "task": "room-ghosts 1.4",
        "crewVersion": observed["crewVersion"],
        "isolatedHome": True,
        "liveGatewayExercised": False,
        "sdkLevel": observed["sdkLevel"],
        "sdkExports": list(exports),
        "checks": {section: dict(sorted(observed[section].items())) for section in SECTIONS},
        "failedChecks": failed,
        "outcome": "candidate_contract_found_live_behaviour_unverified"
        if candidate
        else "contract_unproved",
        "contract": CONTRACT if candidate else None,
        "decision": {
            "result": FALLBACK,
            "sessionLink": "disabled",
            "disabledCode": "contract_unavailable",
            "substituteNewChat": "never",
            "candidateToImplementBehindDisabledDefault": CONTRACT["call"] if candidate else None,
            "enableOnlyAfter": "every manual step under evidence.unverified passes on the Crew "
            "version the demo runs on",
        },
        "evidence": EVIDENCE,
        "guidance": GUIDANCE,
    }


def run_probe() -> tuple[dict[str, Any], int]:
    observed, status = crew_harness.run_worker(SPIKE, WORKER)
    if status != 0:
        return observed, status
    try:
        report = evaluate(observed)
        crew_harness.assert_scrubbed(report)
    except ValueError:
        return crew_harness.failure(SPIKE, "crew_test_harness_unsafe_report"), 2
    return report, 0 if not report["failedChecks"] else 1


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    report, status = run_probe()
    return crew_harness.emit(report, status, FIXTURE, args)


if __name__ == "__main__":
    raise SystemExit(main())
