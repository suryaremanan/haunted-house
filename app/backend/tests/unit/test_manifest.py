"""Rules for app/app.json (Requirement 3).

`validate_manifest` returns one message per broken rule, so the real-file test
shows every problem at once and the negative tests can check that each rule
fires. It checks:

- Requirement 3.1: name `haunted-house`, semver version, license `MIT`,
  minKiroCrewVersion `0.12.1`;
- Crew's install-time validation rules (manifest reference, "Validation
  rules"): kebab-case name, `X.Y.Z` version, required fields are non-empty
  strings, paths are relative and stay inside the app root after a canonical
  resolve, every UI page has `route` and `label`;
- Requirement 3.2: a Python backend and at least one UI page, and every path
  names an existing file inside app/. Crew 0.12.1 resolves `ui.entry` and
  `ui.pages[].entryPoint` under app/ui/, not the app root;
- Requirement 3.3: `permissions.api` is exactly the gateway client's ROUTES
  paths plus the app's own backend prefix, which the dashboard's
  `useAppApi()` needs;
- Mansion Lifecycle Requirement 6.1: `permissions.storage` is exactly `true`
  because the backend stores durable metadata in Crew's app-scoped data
  directory;
- Requirement 3.4: no `autoApprove` key at any depth or in any spelling, in
  the manifest or in agent files under app/agents/;
- Séance Requirements 11.5 and 12.2: `permissions.api` also holds `/api/chat/*`
  for bounded session-history reads, `permissions.events` is exactly the Crew
  event names the backend normalizer maps, and there is no spawn, global
  approval or WebSocket grant;
- Doors and Guardrails Requirements 6.1, 7.2–7.4 and 11.3–11.4 (task 12.1):
  gateway-managed resources, exactly the four ghost agent files, exactly the
  four per-room stdio MCP entries in the S9 launch shape, `/api/chat` for the
  app-owned session turn, and `permissions.sessionApproval: true` so the app
  may answer prompts of sessions it owns. Every gateway path the client
  builds is covered by a declared prefix and every declared prefix is used;
- Room Ghosts Requirements 1.1–1.8 (task 4.5): `skills` is exactly the four MVP
  Room_Skill directories, each holding a `SKILL.md`. The stretch Medium's
  profile and skill ship in the tree but are declared only when the Séance
  Room is enabled, so the default manifest names neither;
- the manifest asks only for the grants currently used (`permissions.api`,
  `permissions.events`, `permissions.sessionApproval` and
  `permissions.storage`) and has no unknown top-level keys. Crew keeps unknown
  keys without complaint, so a typo would otherwise go unnoticed.

A later spec that adds a grant updates the allowed permission keys and the
expected `permissions.api` set here.
"""
from __future__ import annotations

import json
import os
import re
import shutil
from collections.abc import Callable, Iterator
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Any

import pytest

from haunted_house.adapters.gateway_client import (
    CHAT_GRANT,
    CHAT_MODE_PATH,
    CHAT_SEND_PATH,
    CHAT_SLOTS_PATH,
    ROUTES,
    SESSION_HISTORY_GRANT,
    SESSION_HISTORY_PATH_PREFIX,
)
from haunted_house.core.crew_event_normalizer import MAPPED_CREW_TYPES
from haunted_house.core.profile_contracts import expected_skill_paths
from haunted_house.core.room_catalog import ROLES, ROOM_ENV, SERVER_BY_ROLE, SESSION_LABEL_ENV

# tests/unit/ -> tests/ -> backend/ -> app/
APP_ROOT = Path(__file__).resolve().parents[3]
MANIFEST = APP_ROOT / "app.json"

APP_NAME = "haunted-house"
OWN_BACKEND_PREFIX = f"/apps/{APP_NAME}/api/*"

NAME_RE = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
SEMVER_RE = re.compile(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)")
REQUIRED_STRINGS = ("name", "version", "displayName", "description")

# Every top-level field in the Crew 0.12.1 manifest reference.
DOCUMENTED_TOP_LEVEL_KEYS = frozenset(
    {
        # required and recommended
        "name", "version", "displayName", "description",
        "author", "license", "minKiroCrewVersion", "tags", "jobFamilies",
        # resources
        "agents", "skills", "sops", "mcpServers",
        # store listing
        "repo", "iconPath", "screenshots", "highlights",
        "heroImage", "heroImageDark", "heroImageDetail", "heroImageDetailDark",
        # behaviour
        "crons", "ui", "backend", "permissions", "contributes", "setup",
        "dependencies", "lifecycle", "resources", "platform", "openCommand",
    }
)  # fmt: skip

# Top-level fields that ask Crew to register, run or expose something the app
# does not use. `sessionApproval` is not in the manifest reference and belongs
# under `permissions`; it is listed so it gets this message rather than
# "unknown key". `agents` and `mcpServers` are used since Doors and Guardrails
# and are checked exactly below; `skills` is used since Room Ghosts and is
# checked exactly too.
UNUSED_GRANT_KEYS = frozenset(
    {
        "contributes", "crons", "dependencies",
        "openCommand", "sessionApproval", "setup", "sops",
    }
)  # fmt: skip

# Doors and Guardrails task 12.1 (S9): one stdio server per room, launched
# app-relative, with the room as its only static env and the session-label
# marker. Crew rewrites `python3 mcp/server.py` to its own interpreter and the
# installed launcher path.
MCP_LAUNCHER = "mcp/server.py"
EXPECTED_AGENTS = [f"agents/hh-{role}.json" for role in ROLES]
# Room Ghosts task 4.5: one Room_Skill directory per declared agent. The
# Medium's `skills/bounded-review` is not declared while the Séance Room is off.
EXPECTED_SKILLS = expected_skill_paths(seance_enabled=False)


def expected_mcp_servers() -> dict[str, Any]:
    return {
        SERVER_BY_ROLE[role]: {
            "command": "python3",
            "args": [MCP_LAUNCHER],
            "env": {ROOM_ENV: role},
            "x-kirocrew-session-label": True,
        }
        for role in ROLES
    }


# Every gateway path the client builds for an app-owned session. Each must be
# covered by a declared `permissions.api` entry (the route-template check).
CHAT_ROUTE_TEMPLATES = (
    CHAT_SEND_PATH,
    CHAT_SLOTS_PATH,
    CHAT_MODE_PATH,
    SESSION_HISTORY_PATH_PREFIX + "<slot>",
    SESSION_HISTORY_PATH_PREFIX + "<slot>/project",
    SESSION_HISTORY_PATH_PREFIX + "<slot>/approve",
)


def api_entry_covers(entry: str, path: str) -> bool:
    """Crew's `permissions.api` match: exact, `p/` children, `p/*`, trailing `*`."""
    if entry.endswith("/*"):
        base = entry[:-2]
        return path == base or path.startswith(base + "/")
    if entry.endswith("*"):
        return path.startswith(entry[:-1])
    return path == entry or path.startswith(entry + "/")


def expected_api_prefixes() -> set[str]:
    """The gateway paths the backend calls, plus the app's own backend prefix.

    Séance Requirement 11.5 adds one prefix: bounded session-history reads
    for server-registered slots (`GatewayClient.session_history`). Doors and
    Guardrails Requirement 7.3 names `/api/chat` (the session turn) beside
    `/api/chat/*` (slot, project, mode and exact approve routes).
    """
    return (
        {path for (_method, path) in ROUTES.values()}
        | {SESSION_HISTORY_GRANT, CHAT_GRANT, CHAT_SEND_PATH}
        | {OWN_BACKEND_PREFIX}
    )


def expected_events() -> list[str]:
    """The exact Crew event names the raw bridge may subscribe to: the names
    the backend normalizer maps, and nothing broader."""
    return sorted(MAPPED_CREW_TYPES)


# Permission keys that would widen what the app needs: it answers prompts only
# for sessions it owns (`sessionApproval`), never the global approval queue,
# never spawns, and the backend opens no Crew WebSocket.
FORBIDDEN_PERMISSION_KEYS = frozenset(
    {"approvals", "spawn", "websocket", "ws", "mcpTools", "cron", "network"}
)
ALLOWED_PERMISSION_KEYS = frozenset({"api", "events", "sessionApproval", "storage"})


class ManifestError(AssertionError):
    """Raised by check_manifest with every broken rule, one per line."""


def check_manifest(data: Any, app_root: Path) -> None:
    errors = validate_manifest(data, app_root)
    if errors:
        raise ManifestError("\n".join(errors))


def load_manifest(path: Path) -> Any:
    """Parse JSON, refusing duplicate keys (json.loads would keep the last)."""

    def no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        keys = [key for key, _ in pairs]
        duplicates = sorted({key for key in keys if keys.count(key) > 1})
        if duplicates:
            raise ValueError(f"duplicate keys {duplicates}")
        return dict(pairs)

    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=no_duplicates)


def validate_manifest(data: Any, app_root: Path) -> list[str]:
    """Return one message per broken rule. An empty list means the manifest passes."""
    if not isinstance(data, dict):
        return ["manifest: must be a JSON object"]
    errors: list[str] = []

    # Identity: Crew's required non-empty strings and patterns, then the
    # exact values from Requirement 3.1.
    for key in REQUIRED_STRINGS:
        if not _non_empty_str(data.get(key)):
            errors.append(f"{key}: required, must be a non-empty string")
    name, version = data.get("name"), data.get("version")
    if isinstance(name, str) and not NAME_RE.fullmatch(name):
        errors.append(f"name: {name!r} is not kebab-case")
    if name != APP_NAME:
        errors.append(f"name: must be {APP_NAME!r}, got {name!r}")
    if isinstance(version, str) and not SEMVER_RE.fullmatch(version):
        errors.append(f"version: {version!r} is not semver X.Y.Z")
    for key, want in (("license", "MIT"), ("minKiroCrewVersion", "0.12.1")):
        if data.get(key) != want:
            errors.append(f"{key}: must be {want!r}, got {data.get(key)!r}")

    # Gateway-managed resources: Crew registers the agents and MCP servers.
    for key in ("resources", "lifecycle"):
        if data.get(key) != "gateway":
            errors.append(f"{key}: must be 'gateway', got {data.get(key)!r}")
    agents = data.get("agents")
    if agents != EXPECTED_AGENTS:
        errors.append(f"agents: must be exactly {EXPECTED_AGENTS}, got {agents!r}")
    for index, agent_path in enumerate(agents if isinstance(agents, list) else []):
        _check_path(errors, f"agents[{index}]", agent_path, app_root, app_root)
    skills = data.get("skills")
    if skills != EXPECTED_SKILLS:
        errors.append(f"skills: must be exactly {EXPECTED_SKILLS}, got {skills!r}")
    for index, skill_path in enumerate(skills if isinstance(skills, list) else []):
        # A skill is a directory; Crew links it whole. Its SKILL.md must exist.
        joined = f"{skill_path}/SKILL.md" if isinstance(skill_path, str) else skill_path
        _check_path(errors, f"skills[{index}]", joined, app_root, app_root)
    _check_mcp_servers(errors, data.get("mcpServers"), app_root)

    # Top-level keys: nothing spec 1 does not use, nothing undocumented.
    for key in sorted(data):
        if key in UNUSED_GRANT_KEYS:
            errors.append(f"{key}: spec 1 does not use this; declare it in the spec that needs it")
        elif key not in DOCUMENTED_TOP_LEVEL_KEYS:
            errors.append(f"{key}: unknown top-level key (typo?)")

    # Backend and icon: paths relative to the app root.
    _check_path(errors, "iconPath", data.get("iconPath"), app_root, app_root)
    backend = _section(errors, data, "backend")
    _check_path(errors, "backend.entryPoint", backend.get("entryPoint"), app_root, app_root)
    if backend.get("type") != "python":
        errors.append(f"backend.type: must be 'python', got {backend.get('type')!r}")
    if "hooks" in backend:
        errors.append("backend.hooks: spec 1 runs no code inside the gateway")

    # UI: bundle paths relative to app/ui/; at least one page with route and label.
    ui = _section(errors, data, "ui")
    ui_root = app_root / "ui"
    _check_path(errors, "ui.entry", ui.get("entry"), ui_root, app_root)
    pages = ui.get("pages")
    if not isinstance(pages, list) or not pages:
        errors.append("ui.pages: must list at least one page")
        pages = []
    for index, page in enumerate(pages):
        where = f"ui.pages[{index}]"
        if not isinstance(page, dict):
            errors.append(f"{where}: must be an object")
            continue
        for key in ("route", "label"):
            if not _non_empty_str(page.get(key)):
                errors.append(f"{where}.{key}: required, must be a non-empty string")
        if "entryPoint" in page:
            _check_path(errors, f"{where}.entryPoint", page["entryPoint"], ui_root, app_root)

    # Permissions: exactly `api`, `events` and `storage`, with only called API
    # paths, only the mapped advisory event names, and app-scoped storage
    # enabled for durable mansion metadata.
    permissions = _section(errors, data, "permissions")
    unused = sorted(set(permissions) - ALLOWED_PERMISSION_KEYS)
    if unused:
        errors.append(
            "permissions: app uses only 'api', 'events', 'sessionApproval' and 'storage', "
            f"also found {unused}"
        )
    for key in sorted(set(permissions) & FORBIDDEN_PERMISSION_KEYS):
        errors.append(f"permissions.{key}: not granted to this app (Séance Requirement 12.2)")
    if permissions.get("sessionApproval") is not True:
        errors.append(
            "permissions.sessionApproval: must be true to answer prompts of app-owned sessions"
        )
    _check_api(errors, permissions.get("api"))
    _check_events(errors, permissions.get("events"))
    if permissions.get("storage") is not True:
        errors.append("permissions.storage: must be true for app-scoped mansion metadata")

    # No autoApprove anywhere, in the manifest or in agent files.
    errors.extend(_auto_approve_errors(data, "app.json"))
    agents_dir = app_root / "agents"
    if agents_dir.is_dir():
        for agent_file in sorted(agents_dir.rglob("*.json")):
            where = agent_file.relative_to(app_root).as_posix()
            try:
                agent = load_manifest(agent_file)
            except (OSError, ValueError) as exc:
                errors.append(f"{where}: not readable JSON ({type(exc).__name__})")
                continue
            errors.extend(_auto_approve_errors(agent, where))

    return errors


def _non_empty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _section(errors: list[str], data: dict[str, Any], key: str) -> dict[str, Any]:
    value = data.get(key)
    if isinstance(value, dict):
        return value
    errors.append(f"{key}: required, must be an object")
    return {}


def _check_path(errors: list[str], label: str, value: Any, root: Path, app_root: Path) -> None:
    """Crew's path rule: relative, no '..', inside the root after realpath. Plus: the file exists."""
    if not _non_empty_str(value):
        errors.append(f"{label}: required, must be a non-empty relative path")
        return
    slashed = value.replace("\\", "/")
    if slashed.startswith("/") or PureWindowsPath(value).drive:
        errors.append(f"{label}: {value!r} is absolute; Crew rejects absolute paths")
        return
    if ".." in PurePosixPath(slashed).parts:
        errors.append(f"{label}: {value!r} uses '..'; Crew rejects traversal")
        return
    resolved = Path(os.path.realpath(root / value))
    for boundary in (root, app_root):
        if not resolved.is_relative_to(os.path.realpath(boundary)):
            errors.append(f"{label}: {value!r} resolves outside {boundary}")
            return
    if not resolved.is_file():
        errors.append(f"{label}: {value!r} is not a file under {root}")


def _check_mcp_servers(errors: list[str], servers: Any, app_root: Path) -> None:
    """Exactly the four room entries in the S9 launch shape."""
    want = expected_mcp_servers()
    if not isinstance(servers, dict):
        errors.append("mcpServers: must declare the four room servers")
        return
    missing, extra = sorted(set(want) - set(servers)), sorted(set(servers) - set(want))
    if missing:
        errors.append(f"mcpServers: missing {missing}")
    if extra:
        errors.append(f"mcpServers: {extra} is not a room server")
    for name in sorted(set(want) & set(servers)):
        entry = servers[name]
        if entry != want[name]:
            errors.append(f"mcpServers.{name}: must be exactly {want[name]}")
        env = entry.get("env") if isinstance(entry, dict) else None
        for key, value in (env.items() if isinstance(env, dict) else ()):
            # Either form makes Crew withhold the session label (S9).
            if isinstance(value, str) and ("${" in value or "secret://" in value):
                errors.append(f"mcpServers.{name}.env.{key}: no ${{...}} or secret:// values")
            if key == SESSION_LABEL_ENV:
                errors.append(f"mcpServers.{name}.env.{key}: only Crew sets the session label")
    _check_path(errors, "mcpServers launcher", MCP_LAUNCHER, app_root, app_root)


def _check_api(errors: list[str], api: Any) -> None:
    if not isinstance(api, list) or not all(isinstance(entry, str) for entry in api):
        errors.append("permissions.api: must be a list of strings")
        return
    duplicates = sorted({entry for entry in api if api.count(entry) > 1})
    if duplicates:
        errors.append(f"permissions.api: duplicate entries {duplicates}")
    for entry in api:
        if not entry.startswith("/"):
            errors.append(f"permissions.api: {entry!r} must start with '/'")
    want = expected_api_prefixes()
    missing, extra = sorted(want - set(api)), sorted(set(api) - want)
    if missing:
        errors.append(f"permissions.api: missing {missing}, which the app calls")
    if extra:
        errors.append(f"permissions.api: {extra} not called by the app (not in ROUTES or the own-backend prefix)")
    # Route templates: every path the client builds is covered by an entry.
    for template in CHAT_ROUTE_TEMPLATES + tuple(path for (_m, path) in ROUTES.values()):
        if not any(api_entry_covers(entry, template) for entry in api):
            errors.append(f"permissions.api: no entry covers {template!r}, which the app calls")


def _check_events(errors: list[str], events: Any) -> None:
    if not isinstance(events, list) or not all(isinstance(entry, str) for entry in events):
        errors.append("permissions.events: must be a list of strings")
        return
    duplicates = sorted({entry for entry in events if events.count(entry) > 1})
    if duplicates:
        errors.append(f"permissions.events: duplicate entries {duplicates}")
    for entry in events:
        if "*" in entry or entry in ("chat", "chat_"):
            errors.append(f"permissions.events: {entry!r} must be an exact event name")
    want = set(expected_events())
    missing, extra = sorted(want - set(events)), sorted(set(events) - want)
    if missing:
        errors.append(f"permissions.events: missing {missing}, which the bridge forwards")
    if extra:
        errors.append(f"permissions.events: {extra} not mapped by the backend normalizer")


def _auto_approve_errors(node: Any, where: str) -> Iterator[str]:
    """Yield a message for every key spelled like autoApprove (any case, '-' or '_')."""
    if isinstance(node, dict):
        for key, value in node.items():
            here = f"{where}.{key}"
            if "autoapprove" in re.sub(r"[^a-z]", "", str(key).lower()):
                yield f"{here}: autoApprove is not allowed (Requirement 3.4)"
            yield from _auto_approve_errors(value, here)
    elif isinstance(node, list):
        for index, item in enumerate(node):
            yield from _auto_approve_errors(item, f"{where}[{index}]")


# --- the real manifest -------------------------------------------------------


def test_the_app_manifest_passes_every_rule():
    assert validate_manifest(load_manifest(MANIFEST), APP_ROOT) == []


def test_the_app_manifest_is_json_with_a_trailing_newline():
    load_manifest(MANIFEST)  # raises on bad JSON or a duplicate key
    assert MANIFEST.read_text(encoding="utf-8").endswith("\n")


# --- each rule fires ---------------------------------------------------------

# Empty stand-ins for the files the manifest names, so a copy in tmp_path
# passes before it is mutated.
STAND_IN_FILES = (
    "backend/main.py", "assets/icon.png", "ui/dist/index.mjs", MCP_LAUNCHER, *EXPECTED_AGENTS,
    *(f"{skill}/SKILL.md" for skill in EXPECTED_SKILLS),
)  # fmt: skip


@pytest.fixture
def app_copy(tmp_path: Path) -> Path:
    root = tmp_path / "app"
    root.mkdir()
    shutil.copy2(MANIFEST, root / "app.json")
    for rel in STAND_IN_FILES:
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        if rel.startswith("agents/"):
            (root / rel).write_text("{}\n", encoding="utf-8")
        else:
            (root / rel).touch()
    return root


def test_the_unmutated_copy_passes(app_copy: Path):
    check_manifest(load_manifest(app_copy / "app.json"), app_copy)


def _write_agent_with_auto_approve(data: dict[str, Any], root: Path) -> None:
    (root / "agents").mkdir(exist_ok=True)
    agent = {"name": "ghost", "mcpServers": {"x": {"command": "x", "autoApprove": ["*"]}}}
    (root / "agents" / "ghost.json").write_text(json.dumps(agent), encoding="utf-8")


def _remove_skill_document(data: dict[str, Any], root: Path) -> None:
    (root / EXPECTED_SKILLS[0] / "SKILL.md").unlink()


def _symlink_icon_outside(data: dict[str, Any], root: Path) -> None:
    outside = root.parent / "outside.png"
    outside.touch()
    (root / "assets" / "icon.png").unlink()
    (root / "assets" / "icon.png").symlink_to(outside)


Mutation = Callable[[dict[str, Any], Path], None]

MUTATIONS: list[tuple[str, Mutation, str]] = [
    ("bad-name", lambda d, r: d.update(name="Haunted_House"), "is not kebab-case"),
    (
        "dotdot-path",
        lambda d, r: d["backend"].update(entryPoint="../outside/main.py"),
        "backend.entryPoint: '../outside/main.py' uses '..'",
    ),
    (
        "absolute-path",
        lambda d, r: d["ui"].update(entry=str(r / "ui" / "dist" / "index.mjs")),
        "is absolute",
    ),
    ("extra-api-path", lambda d, r: d["permissions"]["api"].append("/api/agents"), "['/api/agents'] not called"),
    (
        "missing-storage",
        lambda d, r: d["permissions"].pop("storage"),
        "permissions.storage: must be true for app-scoped mansion metadata",
    ),
    (
        "disabled-storage",
        lambda d, r: d["permissions"].update(storage=False),
        "permissions.storage: must be true for app-scoped mansion metadata",
    ),
    (
        "extra-permission",
        lambda d, r: d["permissions"].update(filesystem=True),
        "permissions: app uses only 'api', 'events', 'sessionApproval' and 'storage', "
        "also found ['filesystem']",
    ),
    (
        "missing-history-grant",
        lambda d, r: d["permissions"]["api"].remove("/api/chat/*"),
        "permissions.api: missing ['/api/chat/*'], which the app calls",
    ),
    (
        "missing-chat-turn-grant",
        lambda d, r: d["permissions"]["api"].remove("/api/chat"),
        "permissions.api: missing ['/api/chat'], which the app calls",
    ),
    (
        "broad-api-grant",
        lambda d, r: d["permissions"]["api"].append("/api/*"),
        "['/api/*'] not called",
    ),
    (
        "slots-api-grant",
        lambda d, r: d["permissions"]["api"].append("/api/slots"),
        "['/api/slots'] not called",
    ),
    (
        "approval-api-grant",
        lambda d, r: d["permissions"]["api"].append("/api/approvals"),
        "['/api/approvals'] not called",
    ),
    (
        "spawn-api-grant",
        lambda d, r: d["permissions"]["api"].append("/api/spawn"),
        "['/api/spawn'] not called",
    ),
    (
        "websocket-api-grant",
        lambda d, r: d["permissions"]["api"].append("/api/ws"),
        "['/api/ws'] not called",
    ),
    (
        "missing-events",
        lambda d, r: d["permissions"].pop("events"),
        "permissions.events: must be a list of strings",
    ),
    (
        "missing-event-name",
        lambda d, r: d["permissions"]["events"].remove("chat_done"),
        "permissions.events: missing ['chat_done'], which the bridge forwards",
    ),
    (
        "unmapped-event-name",
        lambda d, r: d["permissions"]["events"].append("subagent_done"),
        "permissions.events: ['subagent_done'] not mapped by the backend normalizer",
    ),
    (
        "wildcard-event-name",
        lambda d, r: d["permissions"]["events"].append("chat_*"),
        "permissions.events: 'chat_*' must be an exact event name",
    ),
    (
        "duplicate-event-name",
        lambda d, r: d["permissions"]["events"].append("chat_done"),
        "permissions.events: duplicate entries ['chat_done']",
    ),
    (
        "missing-session-approval",
        lambda d, r: d["permissions"].pop("sessionApproval"),
        "permissions.sessionApproval: must be true",
    ),
    (
        "truthy-session-approval",
        lambda d, r: d["permissions"].update(sessionApproval="yes"),
        "permissions.sessionApproval: must be true",
    ),
    (
        "top-level-session-approval",
        lambda d, r: d.update(sessionApproval=True),
        "sessionApproval: spec 1 does not use this",
    ),
    (
        "global-approvals-permission",
        lambda d, r: d["permissions"].update(approvals=True),
        "permissions.approvals: not granted to this app",
    ),
    (
        "spawn-permission",
        lambda d, r: d["permissions"].update(spawn=True),
        "permissions.spawn: not granted to this app",
    ),
    (
        "mcp-tools-permission",
        lambda d, r: d["permissions"].update(mcpTools=["*"]),
        "permissions.mcpTools: not granted to this app",
    ),
    ("app-managed-resources", lambda d, r: d.update(resources="app"), "resources: must be 'gateway'"),
    ("missing-lifecycle", lambda d, r: d.pop("lifecycle"), "lifecycle: must be 'gateway'"),
    ("missing-agent", lambda d, r: d["agents"].pop(), "agents: must be exactly"),
    (
        "extra-agent",
        lambda d, r: d["agents"].append("agents/hh-poltergeist.json"),
        "agents: must be exactly",
    ),
    ("missing-agents", lambda d, r: d.pop("agents"), "agents: must be exactly"),
    (
        "undeclared-medium-agent",
        lambda d, r: d["agents"].append("agents/hh-medium.json"),
        "agents: must be exactly",
    ),
    ("missing-skills", lambda d, r: d.pop("skills"), "skills: must be exactly"),
    ("missing-skill", lambda d, r: d["skills"].pop(), "skills: must be exactly"),
    (
        "extra-skill",
        lambda d, r: d["skills"].append("skills/poltergeist-tricks"),
        "skills: must be exactly",
    ),
    (
        "undeclared-medium-skill",
        lambda d, r: d["skills"].append("skills/bounded-review"),
        "skills: must be exactly",
    ),
    (
        "skill-outside-app",
        lambda d, r: d["skills"].__setitem__(0, "../skills/ears-requirements"),
        "skills[0]: '../skills/ears-requirements/SKILL.md' uses '..'",
    ),
    ("skill-without-document", _remove_skill_document, "skills[0]: 'skills/ears-requirements/SKILL.md' is not a file"),
    ("missing-mcp-servers", lambda d, r: d.pop("mcpServers"), "mcpServers: must declare"),
    (
        "missing-room-server",
        lambda d, r: d["mcpServers"].pop("room-tinker"),
        "mcpServers: missing ['room-tinker']",
    ),
    (
        "extra-mcp-server",
        lambda d, r: d["mcpServers"].update(helper={"command": "python3", "args": ["x.py"]}),
        "mcpServers: ['helper'] is not a room server",
    ),
    (
        "mcp-autoApprove",
        lambda d, r: d["mcpServers"]["room-tinker"].update(autoApprove=["write_room_file"]),
        "app.json.mcpServers.room-tinker.autoApprove:",
    ),
    (
        "mcp-wrong-room",
        lambda d, r: d["mcpServers"]["room-archivist"]["env"].update(HH_ROOM="tinker"),
        "mcpServers.room-archivist: must be exactly",
    ),
    (
        "mcp-no-session-label-marker",
        lambda d, r: d["mcpServers"]["room-tinker"].pop("x-kirocrew-session-label"),
        "mcpServers.room-tinker: must be exactly",
    ),
    (
        "mcp-absolute-launcher",
        lambda d, r: d["mcpServers"]["room-tinker"].update(args=["/opt/hh/mcp/server.py"]),
        "mcpServers.room-tinker: must be exactly",
    ),
    (
        "mcp-shell-command",
        lambda d, r: d["mcpServers"]["room-tinker"].update(command="sh"),
        "mcpServers.room-tinker: must be exactly",
    ),
    (
        "mcp-template-env",
        lambda d, r: d["mcpServers"]["room-tinker"]["env"].update(HH_TOKEN="${HH_TOKEN}"),
        "mcpServers.room-tinker.env.HH_TOKEN: no ${...} or secret:// values",
    ),
    (
        "mcp-secret-env",
        lambda d, r: d["mcpServers"]["room-tinker"]["env"].update(HH_KEY="secret://hh/key"),
        "mcpServers.room-tinker.env.HH_KEY: no ${...} or secret:// values",
    ),
    (
        "mcp-preset-session-label",
        lambda d, r: d["mcpServers"]["room-tinker"]["env"].update(
            KIROCREW_SESSION_LABEL="dashboard:forged"
        ),
        "mcpServers.room-tinker.env.KIROCREW_SESSION_LABEL: only Crew sets the session label",
    ),
    (
        "websocket-permission",
        lambda d, r: d["permissions"].update(websocket=True),
        "permissions.websocket: not granted to this app",
    ),
    ("nested-autoApprove", lambda d, r: d["backend"].update(autoApprove=[]), "app.json.backend.autoApprove:"),
    (
        "auto_approve-variant",
        lambda d, r: d["ui"]["pages"][0].update(auto_approve=["*"]),
        "app.json.ui.pages[0].auto_approve:",
    ),
    ("agent-autoApprove", _write_agent_with_auto_approve, "agents/ghost.json.mcpServers.x.autoApprove:"),
    ("symlink-escape", _symlink_icon_outside, "iconPath: 'assets/icon.png' resolves outside"),
    ("unused-grant", lambda d, r: d.update(crons=[{"name": "t", "every": 60, "message": "m"}]), "crons: spec 1"),
    ("typo-key", lambda d, r: d.update(minKiroCrewVerison="0.12.1"), "minKiroCrewVerison: unknown top-level key"),
]


@pytest.mark.parametrize(
    ("mutate", "message"),
    [pytest.param(mutate, message, id=name) for name, mutate, message in MUTATIONS],
)
def test_a_broken_rule_is_reported(app_copy: Path, mutate: Mutation, message: str):
    path = app_copy / "app.json"
    data = load_manifest(path)
    mutate(data, app_copy)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    with pytest.raises(ManifestError, match=re.escape(message)):
        check_manifest(load_manifest(path), app_copy)


# --- route templates ---------------------------------------------------------


@pytest.mark.parametrize(
    ("entry", "path", "covered"),
    [
        ("/api/chat", "/api/chat", True),
        ("/api/chat/*", "/api/chat/slots", True),
        ("/api/chat/*", "/api/chat/slots/abc/approve", True),
        ("/api/chat/*", "/api/chatter", False),
        ("/api/version", "/api/versions", False),
        ("/api/version", "/api/spawn", False),
        ("/apps/haunted-house/api/*", "/apps/other/api/x", False),
    ],
)
def test_api_entry_matching_follows_crew(entry: str, path: str, covered: bool):
    assert api_entry_covers(entry, path) is covered


def test_no_declared_api_entry_reaches_spawn_global_approvals_or_the_websocket():
    """Requirements 7.2 and 7.4: the declared prefixes cover none of them."""
    api = load_manifest(MANIFEST)["permissions"]["api"]
    for forbidden in ("/api/spawn", "/api/spawn/x", "/api/approvals", "/api/approvals/1/approved", "/api/ws"):
        assert not any(api_entry_covers(entry, forbidden) for entry in api), forbidden


def test_every_client_route_template_is_covered_and_every_grant_is_used():
    api = load_manifest(MANIFEST)["permissions"]["api"]
    templates = CHAT_ROUTE_TEMPLATES + tuple(path for (_m, path) in ROUTES.values())
    for template in templates:
        assert any(api_entry_covers(entry, template) for entry in api), template
    gateway_entries = [entry for entry in api if entry != OWN_BACKEND_PREFIX]
    for entry in gateway_entries:
        assert any(api_entry_covers(entry, template) for template in templates), entry
