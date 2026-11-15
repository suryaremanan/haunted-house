"""Shipped Room Ghost profiles against the real room MCP server (task 4.6).

Each test starts the shipped ``app/mcp/server.py`` from an installed-app copy
and speaks MCP over stdio, using the Spec 4 harness unchanged.  It ties the
profile files to what a bound Ghost can actually reach:

- the tools a bound session lists are exactly the tools its shipped profile
  selects (Requirements 2.1, 15.1);
- a built-in tool name or another room's tool is refused and nothing is
  recorded (Requirements 2.7, 15.5);
- the stretch Medium's room is not served, so an enabled-by-mistake Medium
  would see no tool (Requirement 14.7).
"""

from __future__ import annotations

import json

import pytest

from haunted_house.core.profile_contracts import MVP_ROLES, role_contract
from tests.room_mcp_support import APP_SOURCE, House, RecordingRunner

BUILT_IN = ("fs_write", "fs_read", "execute_bash", "use_subagent", "web_fetch", "write", "shell")


@pytest.fixture
def house(tmp_path):
    built = House(tmp_path, runner=RecordingRunner())
    yield built
    built.shutdown()


def shipped_tools(role: str) -> list[str]:
    profile = json.loads((APP_SOURCE / role_contract(role).agent_path).read_text(encoding="utf-8"))
    prefix = f"@haunted-house:{role_contract(role).server}/"
    assert all(tool.startswith(prefix) for tool in profile["tools"])
    return [tool.removeprefix(prefix) for tool in profile["tools"]]


@pytest.mark.parametrize("role", MVP_ROLES)
def test_a_bound_ghost_lists_exactly_the_tools_its_shipped_profile_selects(house, role):
    client = house.ghost(role)
    assert client.tools() == shipped_tools(role)


@pytest.mark.parametrize("role", MVP_ROLES)
def test_built_in_and_out_of_room_attempts_are_refused_without_effect(house, role):
    client = house.ghost(role)
    own = set(shipped_tools(role))
    other_rooms = {
        tool for other in MVP_ROLES if other != role for tool in role_contract(other).tools
    } - own
    for tool in (*BUILT_IN, *sorted(other_rooms)):
        assert client.call(tool, {"path": "bypass.txt", "content": "x"}) == {
            "ok": False,
            "code": "tool_not_available",
        }, tool
    assert house.kinds() == []
    assert not (house.mansion / "bypass.txt").exists()


def test_the_medium_room_is_not_served_while_the_seance_room_is_disabled(house):
    """Its profile ships, but no room server answers for it: no tool, no effect."""

    house.open(house.binding("tinker"))
    client = house.launch("medium", "dashboard:hh-tinker-1")
    client.initialize()
    assert client.tools() == []
    for tool in role_contract("medium").tools:
        answer = client.call(tool, {"path": "README.md"})
        assert answer["ok"] is False and answer["code"] == "blocked"
    assert house.kinds() == []
