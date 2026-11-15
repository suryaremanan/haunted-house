"""Policy for the runtime Ghost profiles in app/agents/ (task 12.3).

`validate_profile` returns one message per broken rule so the real-file tests
show every problem at once and the negative tests prove each rule fires.

- Requirements 6.1, 6.2, 11.1: each profile's `tools` is exactly the room
  catalog's selectors for its own room server; no wildcard, tag, built-in, or
  other-room tool;
- Requirement 11.2: V3 deny rules for built-in writes, shell, web, subagents,
  and every other room's MCP server; inherited MCP configuration is off;
- Requirement 11.3: no `autoApprove` in any spelling and an empty legacy
  `allowedTools`; the baseline carries no `allow` rule at all;
- S9: no `mcpServers` block in an agent file (Crew copies it unresolved) and
  the manifest declares one server per room with that room's `HH_ROOM`;
- Requirement 5.9: explicit, relative `resources` only.
"""

from __future__ import annotations

import copy
import json
import re
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

from haunted_house.core.profile_contracts import STRETCH_ROLES
from haunted_house.core.room_catalog import (
    APP_NAME,
    ROLES,
    ROOM_ENV,
    SERVER_BY_ROLE,
    TOOLS_BY_ROLE,
    tool_selectors,
)

APP_ROOT = Path(__file__).resolve().parents[3]
AGENTS_DIR = APP_ROOT / "agents"

# Room Ghosts adds `includePowers` and `excludedTools`; what they must hold is
# checked by `haunted_house.core.profile_contracts` (test_profile_contracts.py).
ALLOWED_KEYS = frozenset(
    {"name", "description", "model", "prompt", "tools", "allowedTools", "includeMcpJson",
     "resources", "permissions", "includePowers", "excludedTools"}
)  # fmt: skip
# Whole capabilities every Ghost is denied, with the match each rule must have.
REQUIRED_DENIES: dict[str, list[str] | None] = {
    "fs_write": ["**"],
    "shell": None,
    "web_fetch": None,
    "web_search": None,
    "subagent": None,
    "power": None,
}
BROAD_TOOL = re.compile(r"\*|^@builtin|^@mcp$|^(read|write|shell|web|subagent|knowledge|fs_\w+|execute_\w+)$")
SELECTOR = re.compile(r"@([a-z0-9-]+):([a-z0-9-]+)/([a-z_]+)")


def load(path: Path) -> Any:
    def no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        keys = [key for key, _ in pairs]
        assert len(set(keys)) == len(keys), f"duplicate keys in {path.name}"
        return dict(pairs)

    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=no_duplicates)


def _auto_approve_keys(node: Any, where: str = "") -> list[str]:
    found: list[str] = []
    if isinstance(node, dict):
        for key, value in node.items():
            here = f"{where}.{key}" if where else str(key)
            if "autoapprove" in re.sub(r"[^a-z]", "", str(key).lower()):
                found.append(here)
            found.extend(_auto_approve_keys(value, here))
    elif isinstance(node, list):
        for index, item in enumerate(node):
            found.extend(_auto_approve_keys(item, f"{where}[{index}]"))
    return found


def validate_profile(profile: Any, role: str) -> list[str]:
    if not isinstance(profile, dict):
        return ["profile: must be a JSON object"]
    errors: list[str] = []
    for key in sorted(set(profile) - ALLOWED_KEYS):
        errors.append(f"{key}: not part of a baseline Ghost profile")
    if profile.get("name") != f"hh-{role}":
        errors.append(f"name: must be 'hh-{role}'")
    for key in ("description", "prompt"):
        if not isinstance(profile.get(key), str) or not profile[key].strip():
            errors.append(f"{key}: required")

    # Exact room MCP selectors, nothing else.
    tools = profile.get("tools")
    want = list(tool_selectors(role))
    if tools != want:
        errors.append(f"tools: must be exactly the {role} room catalog")
    for tool in tools if isinstance(tools, list) else []:
        if not isinstance(tool, str) or BROAD_TOOL.search(tool):
            errors.append(f"tools: {tool!r} is a wildcard, tag, or built-in tool")
            continue
        match = SELECTOR.fullmatch(tool)
        if match is None or match.group(1) != APP_NAME or match.group(2) != SERVER_BY_ROLE[role]:
            errors.append(f"tools: {tool!r} is not a tool of this Ghost's own room server")

    # No approval shortcut of any kind.
    if profile.get("allowedTools") != []:
        errors.append("allowedTools: must be an empty list")
    for where in _auto_approve_keys(profile):
        errors.append(f"{where}: autoApprove is not allowed")
    if profile.get("includeMcpJson") is not False:
        errors.append("includeMcpJson: must be false so no inherited MCP server is added")
    for key in ("mcpServers", "toolsSettings", "hooks"):
        if key in profile:
            errors.append(f"{key}: must not appear in a Ghost profile")

    # Explicit, relative resources.
    resources = profile.get("resources")
    if not isinstance(resources, list) or not resources:
        errors.append("resources: must list explicit resources")
    for resource in resources if isinstance(resources, list) else []:
        if (
            not isinstance(resource, str)
            or not re.fullmatch(r"(file|skill)://[A-Za-z0-9._*/-]+", resource)
            or resource.split("://", 1)[1].startswith(("/", "~"))
            or ".." in resource
        ):
            errors.append(f"resources: {resource!r} must be a relative file:// or skill:// path")

    # V3 deny rules.
    rules = profile.get("permissions", {}).get("rules") if isinstance(profile.get("permissions"), dict) else None
    if not isinstance(rules, list):
        return errors + ["permissions.rules: required"]
    if set(profile["permissions"]) != {"rules"}:
        errors.append("permissions: only 'rules' is allowed")
    for index, rule in enumerate(rules):
        if not isinstance(rule, dict) or not set(rule) <= {"capability", "match", "effect"}:
            errors.append(f"permissions.rules[{index}]: only capability, match and effect (no exclude)")
            continue
        if rule.get("effect") != "deny":
            errors.append(f"permissions.rules[{index}]: baseline profiles carry only deny rules")
    denies = {
        rule.get("capability"): rule.get("match")
        for rule in rules
        if isinstance(rule, dict) and rule.get("effect") == "deny"
    }
    for capability, match in REQUIRED_DENIES.items():
        if capability not in denies:
            errors.append(f"permissions.rules: missing deny for {capability}")
        elif denies[capability] != match:
            errors.append(f"permissions.rules: deny for {capability} must cover every use")
    other_servers = sorted(f"{APP_NAME}:{SERVER_BY_ROLE[other]}/*" for other in ROLES if other != role)
    if sorted(denies.get("mcp") or []) != other_servers:
        errors.append("permissions.rules: must deny exactly every other room's MCP server")
    return errors


# --- the shipped profiles ------------------------------------------------------


def test_exactly_one_profile_per_role_is_shipped():
    # The stretch Medium ships beside the four room roles; the manifest does
    # not declare it by default (see test_profiles_and_manifest_agree... below).
    assert sorted(path.name for path in AGENTS_DIR.iterdir()) == sorted(
        f"hh-{role}.json" for role in (*ROLES, *STRETCH_ROLES)
    )


@pytest.mark.parametrize("role", ROLES)
def test_the_shipped_profile_passes_every_rule(role: str):
    path = AGENTS_DIR / f"hh-{role}.json"
    assert validate_profile(load(path), role) == []
    assert path.read_text(encoding="utf-8").endswith("\n")


@pytest.mark.parametrize("role", ROLES)
def test_a_profile_grants_the_design_catalog_and_no_other_room(role: str):
    tools = load(AGENTS_DIR / f"hh-{role}.json")["tools"]
    names = [SELECTOR.fullmatch(tool).group(3) for tool in tools]
    assert tuple(names) == TOOLS_BY_ROLE[role]
    spec_writer = role != "tinker"
    assert ("write_spec_document" in names) is spec_writer
    for tinker_only in ("write_room_file", "propose_risky_action", "execute_approved_action"):
        assert (tinker_only in names) is not spec_writer


@pytest.mark.parametrize("role", ROLES)
def test_a_profile_text_holds_no_secret_or_host_path(role: str):
    text = (AGENTS_DIR / f"hh-{role}.json").read_text(encoding="utf-8")
    assert not re.search(r"/Users/|/home/|~/|secret://|\$\{|KIROCREW_|X-HH-|[0-9a-f]{32}", text)


def test_profiles_and_manifest_agree_on_agents_and_room_servers():
    manifest = load(APP_ROOT / "app.json")
    assert manifest["name"] == APP_NAME
    assert manifest["agents"] == [f"agents/hh-{role}.json" for role in ROLES]
    servers = manifest["mcpServers"]
    assert set(servers) == set(SERVER_BY_ROLE.values())
    for role in ROLES:
        granted = {
            SELECTOR.fullmatch(tool).group(2) for tool in load(AGENTS_DIR / f"hh-{role}.json")["tools"]
        }
        # A profile reaches one server, and that server is launched for its room.
        assert granted == {SERVER_BY_ROLE[role]}
        assert servers[SERVER_BY_ROLE[role]]["env"] == {ROOM_ENV: role}


# --- each rule fires -----------------------------------------------------------

Mutation = Callable[[dict[str, Any]], None]


def _drop_deny(capability: str) -> Mutation:
    def mutate(profile: dict[str, Any]) -> None:
        rules = profile["permissions"]["rules"]
        profile["permissions"]["rules"] = [r for r in rules if r["capability"] != capability]

    return mutate


def _rule(capability: str) -> Callable[[dict[str, Any]], dict[str, Any]]:
    return lambda profile: next(
        r for r in profile["permissions"]["rules"] if r["capability"] == capability
    )


MUTATIONS: list[tuple[str, Mutation, str]] = [
    ("wildcard-tools", lambda p: p.update(tools=["*"]), "'*' is a wildcard"),
    ("all-mcp", lambda p: p["tools"].append("@mcp"), "'@mcp' is a wildcard"),
    ("builtin-tools", lambda p: p["tools"].append("@builtin"), "'@builtin' is a wildcard"),
    ("write-tag", lambda p: p["tools"].append("write"), "'write' is a wildcard, tag, or built-in"),
    ("shell-tag", lambda p: p["tools"].append("shell"), "'shell' is a wildcard, tag, or built-in"),
    ("web-tag", lambda p: p["tools"].append("web"), "'web' is a wildcard, tag, or built-in"),
    ("subagent-tag", lambda p: p["tools"].append("subagent"), "'subagent' is a wildcard"),
    ("fs-write", lambda p: p["tools"].append("fs_write"), "'fs_write' is a wildcard, tag, or built-in"),
    (
        "server-wildcard",
        lambda p: p["tools"].append("@haunted-house:room-archivist/*"),
        "is a wildcard",
    ),
    (
        "other-room-tool",
        lambda p: p["tools"].append("@haunted-house:room-tinker/write_room_file"),
        "is not a tool of this Ghost's own room server",
    ),
    (
        "foreign-server-tool",
        lambda p: p["tools"].append("@github:server/create_issue"),
        "is not a tool of this Ghost's own room server",
    ),
    ("missing-tool", lambda p: p["tools"].pop(), "tools: must be exactly the archivist room catalog"),
    ("legacy-allow", lambda p: p.update(allowedTools=["fs_read"]), "allowedTools: must be an empty list"),
    ("missing-allowed-tools", lambda p: p.pop("allowedTools"), "allowedTools: must be an empty list"),
    ("auto-approve", lambda p: p.update(autoApprove=["*"]), "autoApprove: autoApprove is not allowed"),
    (
        "nested-auto-approve",
        lambda p: p["permissions"].update(auto_approve=True),
        "permissions.auto_approve: autoApprove is not allowed",
    ),
    (
        "own-mcp-servers",
        lambda p: p.update(mcpServers={"x": {"command": "python3"}}),
        "mcpServers: must not appear",
    ),
    ("tools-settings", lambda p: p.update(toolsSettings={}), "toolsSettings: must not appear"),
    ("hooks", lambda p: p.update(hooks={}), "hooks: must not appear"),
    ("inherited-mcp", lambda p: p.update(includeMcpJson=True), "includeMcpJson: must be false"),
    ("default-inherited-mcp", lambda p: p.pop("includeMcpJson"), "includeMcpJson: must be false"),
    ("no-resources", lambda p: p.update(resources=[]), "resources: must list explicit resources"),
    (
        "absolute-resource",
        lambda p: p["resources"].append("file:///etc/passwd"),
        "must be a relative file:// or skill:// path",
    ),
    (
        "parent-resource",
        lambda p: p["resources"].append("file://../other/notes.md"),
        "must be a relative file:// or skill:// path",
    ),
    ("no-fs-write-deny", _drop_deny("fs_write"), "missing deny for fs_write"),
    ("no-shell-deny", _drop_deny("shell"), "missing deny for shell"),
    ("no-web-fetch-deny", _drop_deny("web_fetch"), "missing deny for web_fetch"),
    ("no-web-search-deny", _drop_deny("web_search"), "missing deny for web_search"),
    ("no-subagent-deny", _drop_deny("subagent"), "missing deny for subagent"),
    ("no-mcp-deny", _drop_deny("mcp"), "must deny exactly every other room's MCP server"),
    (
        "narrow-fs-write-deny",
        lambda p: _rule("fs_write")(p).update(match=["secrets/**"]),
        "deny for fs_write must cover every use",
    ),
    (
        "narrow-shell-deny",
        lambda p: _rule("shell")(p).update(match=["rm *"]),
        "deny for shell must cover every use",
    ),
    (
        "deny-with-exclude",
        lambda p: _rule("fs_write")(p).update(exclude=["src/**"]),
        "only capability, match and effect (no exclude)",
    ),
    (
        "partial-mcp-deny",
        lambda p: _rule("mcp")(p)["match"].pop(),
        "must deny exactly every other room's MCP server",
    ),
    (
        "allow-rule",
        lambda p: p["permissions"]["rules"].append({"capability": "mcp", "effect": "allow"}),
        "baseline profiles carry only deny rules",
    ),
    (
        "allow-all-rule",
        lambda p: p["permissions"]["rules"].append({"capability": "all", "effect": "allow"}),
        "baseline profiles carry only deny rules",
    ),
    (
        "policy-preset",
        lambda p: p["permissions"].update(policies=["allow-all"]),
        "permissions: only 'rules' is allowed",
    ),
    ("wrong-name", lambda p: p.update(name="hh-tinker"), "name: must be 'hh-archivist'"),
]


@pytest.mark.parametrize(
    ("mutate", "message"),
    [pytest.param(mutate, message, id=name) for name, mutate, message in MUTATIONS],
)
def test_a_broken_profile_rule_is_reported(mutate: Mutation, message: str):
    profile = copy.deepcopy(load(AGENTS_DIR / "hh-archivist.json"))
    assert validate_profile(profile, "archivist") == []
    mutate(profile)
    errors = validate_profile(profile, "archivist")
    assert any(message in error for error in errors), errors


def test_a_profile_cannot_be_reused_for_another_role():
    for role in ROLES:
        profile = load(AGENTS_DIR / f"hh-{role}.json")
        for other in ROLES:
            assert (validate_profile(profile, other) == []) is (other == role)
