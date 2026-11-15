"""Property 1 for the Room Ghosts role profiles.

Feature: room-ghosts, Property 1: Unsafe role-profile mutations are rejected

For any valid specialized role profile, adding a broad tool/MCP wildcard,
removing the role skill or steering resource, enabling inherited MCP or
Powers, adding a non-empty compatibility grant, removing a required deny
rule, or adding autoApprove causes Room Ghosts profile validation to fail;
the unchanged profile passes.

Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8.

The valid profiles are the five shipped ``app/agents/hh-<role>.json`` files.
Each example draws one role and one mutation from a small reference table
that pairs the mutation with the finding code the validator must report.
"""

from __future__ import annotations

import copy
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from hypothesis import given, settings
from hypothesis import strategies as st

from haunted_house.core.profile_contracts import (
    ALL_ROLES,
    REQUIRED_DENIES,
    STEERING_RESOURCE,
    role_contract,
    validate_agent_profile,
)

APP_ROOT = Path(__file__).resolve().parents[3]
PROFILES: dict[str, dict[str, Any]] = {
    role: json.loads((APP_ROOT / role_contract(role).agent_path).read_text(encoding="utf-8"))
    for role in ALL_ROLES
}

Mutation = Callable[[dict[str, Any]], None]

_BROAD_TOOLS = st.sampled_from(
    [
        "*",
        "@mcp",
        "@builtin",
        "read",
        "write",
        "shell",
        "web",
        "subagent",
        "knowledge",
        "fs_write",
        "fs_read",
        "execute_bash",
        "use_subagent",
        "@kirocrew-core",
        "@haunted-house:room-tinker",
        "@haunted-house:room-tinker/*",
        "@haunted-house:room-*/write_room_file",
    ]
)
_NAMES = st.text(alphabet="abcdefghijklmnopqrstuvwxyz_", min_size=1, max_size=12)
_AUTO_APPROVE_KEYS = st.sampled_from(
    ["autoApprove", "auto_approve", "AutoApprove", "auto-approve", "AUTOAPPROVE", "autoApproveTools"]
)
_SKILL_URIS = st.builds(
    lambda head, name: f"skill://{head}{name}/SKILL.md",
    st.sampled_from(["", ".kiro/skills/", "skills/", "**/"]),
    _NAMES,
)
_FILE_URIS = st.builds(lambda name: f"file://{name}.md", _NAMES)
_REQUIRED = st.sampled_from(sorted(REQUIRED_DENIES))


def _rules(profile: dict[str, Any]) -> list[dict[str, Any]]:
    return profile["permissions"]["rules"]


def _add_tool(tool: str) -> Mutation:
    return lambda p: p["tools"].append(tool)


def _replace_tools(tool: str) -> Mutation:
    return lambda p: p.update(tools=[tool])


def _other_room_tool(data: st.DataObject, role: str) -> str:
    other = data.draw(st.sampled_from([r for r in ALL_ROLES if r != role]), label="other room")
    return data.draw(st.sampled_from(role_contract(other).selectors), label="other room tool")


def _drop_resource(resource: str) -> Mutation:
    return lambda p: p["resources"].remove(resource)


def _drop_skill_reference(role: str) -> Mutation:
    skill = role_contract(role).skill

    def mutate(profile: dict[str, Any]) -> None:
        profile["prompt"] = profile["prompt"].replace(f"Room_Skill {skill}", "your skill")

    return mutate


def _drop_deny(capability: str) -> Mutation:
    def mutate(profile: dict[str, Any]) -> None:
        profile["permissions"]["rules"] = [r for r in _rules(profile) if r["capability"] != capability]

    return mutate


def _flip_deny(capability: str, effect: str) -> Mutation:
    def mutate(profile: dict[str, Any]) -> None:
        next(r for r in _rules(profile) if r["capability"] == capability)["effect"] = effect

    return mutate


def _narrow_deny(capability: str, pattern: str) -> Mutation:
    def mutate(profile: dict[str, Any]) -> None:
        next(r for r in _rules(profile) if r["capability"] == capability)["match"] = [pattern]

    return mutate


def _nest_auto_approve(key: str, where: str, value: Any) -> Mutation:
    def mutate(profile: dict[str, Any]) -> None:
        if where == "top":
            profile[key] = value
        elif where == "permissions":
            profile["permissions"][key] = value
        else:
            _rules(profile)[0][key] = value

    return mutate


def draw_mutation(data: st.DataObject, role: str) -> tuple[str, Mutation, str]:
    """One unsafe change and the finding code the reference model expects."""

    kind = data.draw(
        st.sampled_from(
            [
                "add_broad_tool",
                "only_broad_tool",
                "add_other_room_tool",
                "add_foreign_tool",
                "drop_room_tool",
                "drop_steering",
                "drop_skill_reference",
                "add_skill_uri",
                "add_other_resource",
                "inherit_mcp",
                "inherit_powers",
                "allow_skill_search",
                "compatibility_grant",
                "drop_compatibility_field",
                "drop_required_deny",
                "narrow_required_deny",
                "flip_required_deny",
                "drop_other_room_deny",
                "add_allow_rule",
                "add_policy_preset",
                "add_auto_approve",
                "add_server_block",
            ]
        ),
        label="mutation",
    )
    if kind == "add_broad_tool":
        return kind, _add_tool(data.draw(_BROAD_TOOLS)), "broad_tool"
    if kind == "only_broad_tool":
        return kind, _replace_tools(data.draw(_BROAD_TOOLS)), "broad_tool"
    if kind == "add_other_room_tool":
        return kind, _add_tool(_other_room_tool(data, role)), "foreign_tool"
    if kind == "add_foreign_tool":
        name = data.draw(_NAMES)
        return kind, _add_tool(f"@github:server/{name}"), "foreign_tool"
    if kind == "drop_room_tool":
        index = data.draw(st.integers(0, len(role_contract(role).tools) - 1))
        return kind, lambda p: p["tools"].pop(index), "tools_not_exact"
    if kind == "drop_steering":
        return kind, _drop_resource(STEERING_RESOURCE), "steering_resource_missing"
    if kind == "drop_skill_reference":
        return kind, _drop_skill_reference(role), "skill_reference_missing"
    if kind == "add_skill_uri":
        uri = data.draw(_SKILL_URIS)
        return kind, lambda p: p["resources"].append(uri), "skill_uri_not_supported"
    if kind == "add_other_resource":
        uri = data.draw(_FILE_URIS)
        return kind, lambda p: p["resources"].append(uri), "resource_not_allowed"
    if kind == "inherit_mcp":
        value = data.draw(st.sampled_from([True, None, "false", 0]))
        if value is None:
            return kind, lambda p: p.pop("includeMcpJson"), "inherited_mcp_enabled"
        return kind, lambda p: p.update(includeMcpJson=value), "inherited_mcp_enabled"
    if kind == "inherit_powers":
        value = data.draw(st.sampled_from([True, None, "false", 0]))
        if value is None:
            return kind, lambda p: p.pop("includePowers"), "powers_enabled"
        return kind, lambda p: p.update(includePowers=value), "powers_enabled"
    if kind == "allow_skill_search":
        value = data.draw(st.sampled_from([None, [], ["@kirocrew-core/other"], ["knowledge"]]))
        if value is None:
            return kind, lambda p: p.pop("excludedTools"), "skill_search_not_excluded"
        return kind, lambda p: p.update(excludedTools=value), "skill_search_not_excluded"
    if kind == "compatibility_grant":
        grant = data.draw(st.lists(st.one_of(_BROAD_TOOLS, _NAMES), min_size=1, max_size=3))
        return kind, lambda p: p.update(allowedTools=grant), "allowed_tools_not_empty"
    if kind == "drop_compatibility_field":
        return kind, lambda p: p.pop("allowedTools"), "allowed_tools_not_empty"
    if kind == "drop_required_deny":
        return kind, _drop_deny(data.draw(_REQUIRED)), "required_deny_missing"
    if kind == "narrow_required_deny":
        capability = data.draw(_REQUIRED)
        pattern = data.draw(st.sampled_from(["secrets/**", "rm *", "src/*.py", "*.env"]))
        return kind, _narrow_deny(capability, pattern), "deny_too_narrow"
    if kind == "flip_required_deny":
        capability = data.draw(_REQUIRED)
        effect = data.draw(st.sampled_from(["allow", "ask", "evaluate"]))
        return kind, _flip_deny(capability, effect), "non_deny_rule"
    if kind == "drop_other_room_deny":
        return kind, _drop_deny("mcp"), "other_room_not_denied"
    if kind == "add_allow_rule":
        capability = data.draw(st.sampled_from(["all", "mcp", "fs_write", "shell", "builtin", "filesystem"]))
        rule = {"capability": capability, "effect": "allow"}
        return kind, lambda p: _rules(p).append(rule), "non_deny_rule"
    if kind == "add_policy_preset":
        preset = data.draw(st.sampled_from(["allow-all", "edit-workspace", "approve-for-me"]))
        return kind, lambda p: p["permissions"].update(policies=[preset]), "policy_preset"
    if kind == "add_auto_approve":
        key = data.draw(_AUTO_APPROVE_KEYS)
        where = data.draw(st.sampled_from(["top", "permissions", "rule"]))
        value = data.draw(st.sampled_from([True, ["*"], [], ["write_room_file"]]))
        return kind, _nest_auto_approve(key, where, value), "auto_approve_present"
    assert kind == "add_server_block"
    block = data.draw(st.sampled_from(["mcpServers", "toolsSettings", "hooks"]))
    return kind, lambda p: p.update({block: {"x": {"command": "python3"}}}), "forbidden_block"


@settings(max_examples=300)
@given(role=st.sampled_from(ALL_ROLES), data=st.data())
def test_unsafe_role_profile_mutations_are_rejected(role: str, data: st.DataObject) -> None:
    # Feature: room-ghosts, Property 1: Unsafe role-profile mutations are rejected
    profile = copy.deepcopy(PROFILES[role])

    # The unchanged profile passes.
    assert validate_agent_profile(profile, role) == ()

    kind, mutate, expected = draw_mutation(data, role)
    mutate(profile)
    codes = {finding.code for finding in validate_agent_profile(profile, role)}

    # The mutated profile fails, and for the reason the reference model names.
    assert codes, kind
    assert expected in codes, (kind, sorted(codes))
    # The mutation changed only the copy: the shipped profile still passes.
    assert validate_agent_profile(PROFILES[role], role) == ()


def test_every_role_is_reached_by_the_property() -> None:
    assert set(PROFILES) == set(ALL_ROLES)
    for role in ALL_ROLES:
        assert validate_agent_profile(PROFILES[role], role) == ()
