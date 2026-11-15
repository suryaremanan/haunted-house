"""The room tool catalog: exact per-role tools, schemas with no authority
field, and descriptor completion from trusted identity only."""

from __future__ import annotations

import json

import pytest

from haunted_house.core import room_catalog as catalog
from haunted_house.core.action_descriptor import (
    ActionDescriptor,
    action_digest,
    parse_action_descriptor,
)
from haunted_house.core.approvals import EXECUTION_TOOL
from haunted_house.core.path_policy import GHOST_ROLES, SPEC_DOCUMENT_BY_ROLE, room_policy

pytestmark = pytest.mark.core

AUTHORITY_WORDS = (
    "session", "slot", "ghost", "mansion", "room", "capability", "label", "token",
)  # fmt: skip
ACTION = {
    "kind": "delete_path",
    "working_directory": "",
    "arguments": {"path": "src/old.py", "target": "file"},
    "path_intents": [{"access": "delete", "path": "src/old.py"}],
}


def test_roles_match_the_path_policy_roles():
    assert set(catalog.ROLES) == set(GHOST_ROLES) == set(catalog.TOOLS_BY_ROLE)


def test_catalog_is_the_design_table():
    spec = ("list_room_files", "read_room_file", "write_spec_document", "submit_phase_output")
    for role in SPEC_DOCUMENT_BY_ROLE:
        assert catalog.TOOLS_BY_ROLE[role] == spec
    assert catalog.TOOLS_BY_ROLE["tinker"] == (
        "list_room_files",
        "read_room_file",
        "submit_phase_output",
        "write_room_file",
        "propose_risky_action",
        "execute_approved_action",
    )
    assert catalog.EXECUTION_TOOL == EXECUTION_TOOL


def _property_names(node, found):
    if isinstance(node, dict):
        for key, value in node.get("properties", {}).items():
            found.add(key)
            _property_names(value, found)
        _property_names(node.get("items"), found)
    return found


@pytest.mark.parametrize("tool", catalog.TOOLS)
def test_no_schema_carries_an_authority_field(tool):
    schema = catalog.tool_schema(tool)
    assert schema["inputSchema"]["additionalProperties"] is False
    names = _property_names(schema["inputSchema"], set())
    for name in names:
        assert not any(word in name.lower() for word in AUTHORITY_WORDS), name
    json.dumps(schema)  # plain JSON


def test_selectors_are_exact_and_per_room():
    assert catalog.tool_selector("tinker", "write_room_file") == (
        "@haunted-house:room-tinker/write_room_file"
    )
    with pytest.raises(KeyError):
        catalog.tool_selector("archivist", "write_room_file")
    for role in catalog.ROLES:
        selectors = catalog.tool_selectors(role)
        assert len(selectors) == len(set(selectors)) == len(catalog.TOOLS_BY_ROLE[role])
        assert all(s.startswith(f"@haunted-house:room-{role}/") and "*" not in s for s in selectors)


def test_execution_tool_names_cover_bare_and_namespaced_spellings():
    assert catalog.EXECUTION_TOOL_NAMES == {
        "execute_approved_action",
        "@haunted-house:room-tinker/execute_approved_action",
        "haunted-house:room-tinker/execute_approved_action",
    }
    assert catalog.is_room_tool_name("execute_approved_action", "tinker", EXECUTION_TOOL)
    assert not catalog.is_room_tool_name("execute_approved_action", "archivist", EXECUTION_TOOL)
    assert not catalog.is_room_tool_name(
        "@haunted-house:room-archivist/execute_approved_action", "tinker", EXECUTION_TOOL
    )
    assert not catalog.is_room_tool_name(None, "tinker", EXECUTION_TOOL)


@pytest.mark.parametrize(
    ("tool", "arguments", "code"),
    [
        ("list_room_files", {}, None),
        ("list_room_files", {"path": "src"}, None),
        ("list_room_files", {"path": ""}, "invalid_arguments"),
        ("read_room_file", {}, "invalid_arguments"),
        ("read_room_file", {"path": "a.txt", "mansion": "other"}, "invalid_arguments"),
        ("read_room_file", {"path": 3}, "invalid_arguments"),
        ("write_spec_document", {"content": "x", "expected_revision": 0}, None),
        ("write_spec_document", {"content": "x", "expected_revision": True}, "invalid_arguments"),
        ("write_spec_document", {"content": "x", "expected_revision": -1}, "invalid_arguments"),
        ("write_spec_document", {"content": "x", "expected_revision": 1.0}, "invalid_arguments"),
        ("write_spec_document", {"content": "x"}, "invalid_arguments"),
        (
            "write_spec_document",
            {"content": "x" * (catalog.MAX_CONTENT_BYTES + 1), "expected_revision": 0},
            "too_large",
        ),
        ("write_spec_document", {"content": "\ud800", "expected_revision": 0}, "invalid_arguments"),
        ("submit_phase_output", {}, None),
        ("submit_phase_output", {"room": "tinker"}, "invalid_arguments"),
        ("write_room_file", {"path": "a", "content": ""}, None),
        ("propose_risky_action", {"action": ACTION}, None),
        ("propose_risky_action", {"action": {**ACTION, "room": "workshop"}}, "invalid_arguments"),
        ("propose_risky_action", {"action": "rm -rf ."}, "invalid_arguments"),
        ("execute_approved_action", {"proposal_id": "p1", "action": ACTION}, None),
        ("execute_approved_action", {"proposal_id": "", "action": ACTION}, "invalid_arguments"),
        ("execute_approved_action", {"proposal_id": "p1", "descriptor": ACTION}, "invalid_arguments"),
        ("no_such_tool", {}, "tool_not_available"),
        ("read_room_file", ["a"], "invalid_arguments"),
    ],
)
def test_check_arguments(tool, arguments, code):
    assert catalog.check_arguments(tool, arguments) == code


def test_complete_descriptor_takes_identity_only_from_the_caller():
    room = room_policy("tinker", "demo-feature").room
    raw = catalog.complete_descriptor(
        ACTION, mansion_id="demo-mansion", session_slot="slot-1", room=room
    )
    descriptor = parse_action_descriptor(raw)
    assert isinstance(descriptor, ActionDescriptor)
    assert (descriptor.mansion_id, descriptor.session_slot, descriptor.room) == (
        "demo-mansion",
        "slot-1",
        "workshop",
    )
    other = parse_action_descriptor(
        catalog.complete_descriptor(
            ACTION, mansion_id="demo-mansion", session_slot="slot-2", room=room
        )
    )
    assert action_digest(other) != action_digest(descriptor)


@pytest.mark.parametrize(
    "forged",
    [
        {**ACTION, "mansion_id": "other-mansion"},
        {**ACTION, "session_slot": "slot-9"},
        {**ACTION, "room": "study"},
        {**ACTION, "schema_version": 1},
        {k: v for k, v in ACTION.items() if k != "path_intents"},
        None,
        [],
    ],
)
def test_complete_descriptor_refuses_model_supplied_identity(forged):
    assert (
        catalog.complete_descriptor(
            forged, mansion_id="demo-mansion", session_slot="slot-1", room="workshop"
        )
        is None
    )


def test_only_the_tinker_names_the_output_it_submits():
    for role in ("archivist", "draughtsman", "foreman"):
        schema = catalog.tool_schema("submit_phase_output", role)["inputSchema"]
        assert schema["properties"] == {} and schema["required"] == []
        assert catalog.check_arguments("submit_phase_output", {}, role) is None
        assert catalog.check_arguments("submit_phase_output", {"path": "a.txt"}, role) == "invalid_arguments"
    schema = catalog.tool_schema("submit_phase_output", "tinker")["inputSchema"]
    assert set(schema["properties"]) == {"path"} and schema["required"] == ["path"]
    assert schema["additionalProperties"] is False
    assert catalog.check_arguments("submit_phase_output", {"path": "build/result.txt"}, "tinker") is None
    assert catalog.check_arguments("submit_phase_output", {}, "tinker") == "invalid_arguments"
    assert catalog.check_arguments("submit_phase_output", {"path": "a", "phase": "design"}, "tinker") == (
        "invalid_arguments"
    )
