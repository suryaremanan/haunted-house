"""Adapters for the permission freeze: the implementation inventory and the repository files.

scripts/lib/permission_freeze.py is pure. This module supplies its inputs:

  load_inventory()   what the code needs, read from the backend's central
                     constants (gateway routes, chat grants, mapped Crew
                     events, app data directory, session approval call) and
                     the install script's Crew floor
  inventory_report() the scrubbed RS-S2 result: each path the code builds and
                     the manifest entry that covers it
  read_state()       app/app.json, docs/permission-freeze.json and README.md

It needs the backend's interpreter (Python 3.12 with aiohttp, e.g. the repo's
.venv), because the route constants live beside the gateway client. It starts
no process and calls nothing over the network.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any, Optional

REPO_ROOT = Path(__file__).resolve().parents[2]
LIB_DIR = Path(__file__).resolve().parent
if str(LIB_DIR) not in sys.path:
    sys.path.insert(0, str(LIB_DIR))

from permission_freeze import PermissionInventory, api_entry_covers  # noqa: E402

MANIFEST = REPO_ROOT / "app" / "app.json"
FREEZE_RECORD = REPO_ROOT / "docs" / "permission-freeze.json"
README = REPO_ROOT / "README.md"
INSTALL_SCRIPT = REPO_ROOT / "scripts" / "install-local.sh"
INVENTORY_FIXTURE = REPO_ROOT / "spikes" / "fixtures" / "replay-permission-inventory.json"
APP_NAME = "haunted-house"
OWN_BACKEND_PREFIX = f"/apps/{APP_NAME}/api/*"

_MIN_CREW = re.compile(r'^MIN_CREW_VERSION="(\d+\.\d+\.\d+)"$', re.MULTILINE)


def _backend() -> None:
    backend = str(REPO_ROOT / "app" / "backend")
    if backend not in sys.path:
        sys.path.insert(0, backend)


def _install_floor() -> str:
    match = _MIN_CREW.search(INSTALL_SCRIPT.read_text(encoding="utf-8"))
    return match.group(1) if match else "0.0.0"


def gateway_templates() -> dict[str, str]:
    """Every gateway path the backend client builds, by purpose. `<slot>` stands for a slot key."""

    _backend()
    from haunted_house.adapters import gateway_client as client

    templates = {f"route:{name}": path for name, (_method, path) in sorted(client.ROUTES.items())}
    templates.update(
        {
            "chat:send-turn": client.CHAT_SEND_PATH,
            "chat:create-slot": client.CHAT_SLOTS_PATH,
            "chat:set-mode": client.CHAT_MODE_PATH,
            "chat:session-history": client.SESSION_HISTORY_PATH_PREFIX + "<slot>",
            "chat:set-project": client.SESSION_HISTORY_PATH_PREFIX + "<slot>/project",
            "chat:answer-owned-approval": client.SESSION_HISTORY_PATH_PREFIX + "<slot>/approve",
        }
    )
    return templates


def load_inventory() -> PermissionInventory:
    """The permissions the implemented code needs."""

    _backend()
    from haunted_house.adapters import gateway_client as client
    from haunted_house.adapters import mansion_metadata
    from haunted_house.core.crew_event_normalizer import MAPPED_CREW_TYPES

    api = (
        {path for (_method, path) in client.ROUTES.values()}
        | {client.SESSION_HISTORY_GRANT, client.CHAT_GRANT, client.CHAT_SEND_PATH}
        | {OWN_BACKEND_PREFIX}
    )
    return PermissionInventory(
        api=frozenset(api),
        events=frozenset(MAPPED_CREW_TYPES),
        # The app answers prompts of sessions it owns through this one client call.
        session_approval=callable(getattr(client.GatewayClient, "resolve_chat_approval", None)),
        # Durable metadata lives in Crew's app-scoped data directory.
        storage=callable(getattr(mansion_metadata, "resolve_app_data_directory", None)),
        min_crew_version=_install_floor(),
    )


def inventory_report(inventory: PermissionInventory, manifest: Any) -> dict[str, Any]:
    """RS-S2 result: names, paths and booleans only. No token, payload, or local path."""

    permissions = manifest.get("permissions", {}) if isinstance(manifest, dict) else {}
    api = [entry for entry in permissions.get("api", []) if isinstance(entry, str)]
    events = [entry for entry in permissions.get("events", []) if isinstance(entry, str)]
    templates = gateway_templates()
    templates["ui:own-backend"] = f"/apps/{APP_NAME}/api/<route>"
    calls = [
        {"use": use, "path": path, "coveredBy": sorted(e for e in api if api_entry_covers(e, path))}
        for use, path in sorted(templates.items())
    ]
    used = {entry for call in calls for entry in call["coveredBy"]}
    redundant = sorted(
        entry
        for entry in api
        if all(any(api_entry_covers(other, call["path"]) for other in api if other != entry) for call in calls if entry in call["coveredBy"])
        and entry in used
    )
    report: dict[str, Any] = {
        "schemaVersion": 1,
        "spike": "RS-S2",
        "question": "Does the completed MVP code call only the proposed API paths and subscribe only to the proposed event set?",
        "sources": [
            "app/backend/haunted_house/adapters/gateway_client.py",
            "app/backend/haunted_house/core/crew_event_normalizer.py",
            "app/backend/haunted_house/adapters/mansion_metadata.py",
            "scripts/install-local.sh",
            "app/app.json",
        ],
        "inventory": {
            **inventory.permissions(),
            "resources": inventory.resources,
            "lifecycle": inventory.lifecycle,
            "minKiroCrewVersion": inventory.min_crew_version,
        },
        "gatewayCalls": calls,
        "tokenExchange": {
            "path": f"/api/apps/{APP_NAME}/token",
            "note": "Authenticated with the app secret header before an app token exists; not a permissions.api grant.",
        },
        "uncoveredCalls": sorted(call["use"] for call in calls if not call["coveredBy"]),
        "unusedApiEntries": sorted(set(api) - used),
        "mutuallyRedundantApiEntries": redundant,
        "missingEvents": sorted(inventory.events - set(events)),
        "extraEvents": sorted(set(events) - inventory.events),
        "prohibitedReachable": sorted(
            path
            for path in ("/api/spawn", "/api/approvals", "/api/ws")
            if any(api_entry_covers(entry, path) for entry in api)
        ),
        "staticReplayConsumes": [],
    }
    clean = not any(
        report[key]
        for key in ("uncoveredCalls", "unusedApiEntries", "missingEvents", "extraEvents", "prohibitedReachable")
    )
    report["result"] = "pass" if clean else "fail"
    return report


def render_report(report: dict[str, Any]) -> str:
    return json.dumps(report, sort_keys=True, indent=2, ensure_ascii=False) + "\n"


def read_text(path: Path) -> Optional[str]:
    return path.read_text(encoding="utf-8") if path.is_file() else None
