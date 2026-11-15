"""RG-S4 worker: what the installed Crew package says about opening an existing chat slot.

Runs under Crew's own Python with ``HOME`` pointed at an ephemeral directory.
It only reads files inside the installed ``kiro_crew`` package (the dashboard's
shipped static assets and three Python modules) and calls two pure slot-key
helpers.  It starts no gateway, opens no session, and sends no request.

Stdout is one JSON object of booleans, fixed names and SDK export identifiers.
A shipped asset is never echoed: each check is a pattern match reduced to a
boolean.  A match in a minified bundle proves the text is present, not that a
running dashboard behaves that way.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any

SLOT_NAME = "hh-rg-s4-archivist-0123abcd"
SDK_MODULE = "@kirocrew/app-sdk"
STUB = "static/dist/vendor/kirocrew-app-sdk.mjs"
IDENT = r"[A-Za-z_$][\w$]*"


class ProbeFailure(RuntimeError):
    """A stable, path-free probe failure."""


def _require(condition: bool, code: str) -> None:
    if not condition:
        raise ProbeFailure(code)


def _read(path: Path, code: str) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError as error:
        raise ProbeFailure(code) from error


def _has(pattern: str, text: str) -> bool:
    return re.search(pattern, text) is not None


def stub_exports(stub: str) -> list[str]:
    """The names the host's SDK stub re-exports to an app page."""
    block = re.search(r"export const \{(.*?)\}\s*=", stub, re.DOTALL)
    if block is None:
        return []
    body = re.sub(r"//[^\n]*", "", block.group(1))
    return sorted(name.strip() for name in body.split(",") if name.strip())


def sdk_checks(stub: str, index_html: str, exports: list[str], level: object) -> dict[str, bool]:
    return {
        "importMapServesSdkFromHostStub": f'"{SDK_MODULE}":"/vendor/kirocrew-app-sdk.mjs"' in index_html,
        "stubReadsHostModuleRegistry": "__kirocrew_modules" in stub and SDK_MODULE in stub,
        "stubExportsUseChatLauncher": "useChatLauncher" in exports,
        "stubExportsUseNavigate": "useNavigate" in exports,
        "stubExportsSdkLevel": "APP_SDK_LEVEL" in exports,
        "packagedSdkLevelIsOne": level == 1,
    }


def host_checks(host: str, chat_slice: str) -> dict[str, bool]:
    """Pattern presence in the dashboard bundle that implements the SDK hooks."""
    sid_route = r"`/chat\?sid=\$\{encodeURIComponent\(" + IDENT + r"\.slotKey\)\}`"
    return {
        "hostBindsUseChatLauncher": _has(r"useChatLauncher:\(\)=>" + IDENT, host),
        "launcherReturnsOpenChat": _has(r"return\{openChat:", host),
        "openChatWithSlotKeyNavigatesToSidRoute": _has(IDENT + r"\.slotKey\?" + sid_route, host),
        "openChatHandsSlotKeyToChatPage": _has(
            r"__mc_chat_launch=\{[^}]*slotKey:" + IDENT + r"\.slotKey", host
        ),
        "openChatWithoutSlotKeyCanRequestNewChat": _has(sid_route + r":[^;]{0,200}`/chat\?new=1`", host),
        "chatPageSwitchesToHandedSlot": _has(
            IDENT + r"\.slotKey&&" + IDENT + r"\.slotKey===" + IDENT + r"\.get\(`sid`\)", host
        ),
        "missingTargetHasUnavailableMessage": "appChatLaunch.targetUnavailable" in host,
        "chatPageCreatesOnlyOnNewFlag": _has(IDENT + r"\.get\(`new`\)!==`1`", host),
        "chatPageReadsSidOrSlotQuery": _has(
            IDENT + r"\.get\(`sid`\)\|\|" + IDENT + r"\.get\(`slot`\)", host
        ),
        "chatRouteRegistered": "path:`/chat`" in host,
        "useNavigateIsHostRouterNavigate": _has(r"navigateFn:" + IDENT, host)
        and _has(r"useNavigate:\(\)=>" + IDENT, host),
        "appPageLoadedAsModuleInDashboardDocument": _has(
            r"`/apps/\$\{" + IDENT + r"\.name\}/ui/\$\{" + IDENT + r"\}`", host
        ),
        "switchAndCreateAreSeparateOperations": "`chat/switchSlot`" in chat_slice
        and "`chat/createSlot`" in chat_slice,
    }


def python_checks(package: Path) -> dict[str, bool]:
    """Slot identity, exercised; listing and route facts, read from source."""
    from kiro_crew.dashboard.chat_utils_slots import session_key_for
    from kiro_crew.dashboard.state_parts.slot_directory import _normalize_slot_key

    key = _normalize_slot_key(SLOT_NAME)
    session = session_key_for(key)
    projection = _read(package / "dashboard" / "slot_projection.py", "slot_projection_unreadable")
    routes = _read(package / "dashboard" / "routes" / "chat.py", "chat_routes_unreadable")
    return {
        "safeSlotNameIsItsOwnSlotKey": key == SLOT_NAME,
        "sessionKeyIsDashboardPrefixedSlotKey": session == f"dashboard:{SLOT_NAME}",
        "sessionKeyFoldsBackToSlotKey": _normalize_slot_key(session) == SLOT_NAME,
        "slotRowCarriesOwnerApp": '"app": slot._app' in projection,
        "slotCreateAndDetailRoutesRegistered": 'add_post("/api/chat/slots"' in routes
        and 'add_get("/api/chat/slots/{slot}"' in routes,
    }


def _single(assets: Path, marker: str, code: str) -> str:
    """The one shipped chunk that contains ``marker`` (chunk names carry a build hash)."""
    found = [
        text
        for text in (_read(path, code) for path in sorted(assets.glob("*.js")))
        if marker in text
    ]
    _require(len(found) == 1, code)
    return found[0]


def observe() -> dict[str, Any]:
    import kiro_crew
    from kiro_crew.apps import app_sdk_level

    home = Path(os.environ.get("HOME", "")).resolve()
    _require(home == (Path.cwd() / "home").resolve(), "home_not_isolated")
    package = Path(kiro_crew.__file__).resolve().parent
    dist = package / "static" / "dist"
    stub = _read(package / STUB, "sdk_stub_unreadable")
    index_html = _read(dist / "index.html", "dashboard_index_unreadable")
    host = _single(dist / "assets", "useChatLauncher:()=>", "sdk_host_chunk_not_found")
    chat_slice = _single(dist / "assets", "`chat/switchSlot`", "chat_slice_chunk_not_found")
    exports = stub_exports(stub)
    _require(bool(exports), "sdk_stub_exports_unparsed")
    level = getattr(app_sdk_level, "APP_SDK_LEVEL", None)
    return {
        "status": "observed",
        "crewVersion": kiro_crew.__version__,
        "isolatedHome": True,
        "sdkLevel": level,
        "sdkExports": exports,
        "sdk": sdk_checks(stub, index_html, exports, level),
        "host": host_checks(host, chat_slice),
        "python": python_checks(package),
    }


def main() -> int:
    try:
        report = observe()
    except ProbeFailure as failure:
        sys.stdout.write(json.dumps({"status": "failed", "code": str(failure)}) + "\n")
        return 1
    except Exception:
        sys.stdout.write(json.dumps({"status": "failed", "code": "worker_failed"}) + "\n")
        return 1
    sys.stdout.write(json.dumps(report, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
