"""Room MCP server over real stdio (task 10.5).

Each test starts the shipped ``app/mcp/server.py`` as a subprocess from an
installed-app copy in a temporary directory, with no site-packages, and talks
MCP to it.  The backend room gate runs on a private loopback port with the
Spec 2 writer contract behind it.

Validates: Requirements 5.1, 6.2–6.9, 10.8, 11.5–11.8.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import replace
from pathlib import Path

import pytest

from haunted_house.adapters.seance_log_store import SeanceLogStore
from haunted_house.adapters.session_bindings import binding_filename
from haunted_house.core.guardrail_events import Phase
from haunted_house.core.room_catalog import ROLES, TOOLS_BY_ROLE, tool_schema
from tests.guardrail_support import MANSION, SPEC, spec_path
from tests.room_mcp_support import APP_SOURCE, House, McpClient, RecordingRunner

_CONTROL = "." + "haunted-house"
FAKE_CREDENTIAL = "gh" + "p_" + "Z9y8" * 10  # synthetic, assembled at runtime


@pytest.fixture
def house(tmp_path):
    built = House(tmp_path, runner=RecordingRunner())
    yield built
    built.shutdown()


def delete_action(path="src/old.py"):
    return {
        "kind": "delete_path",
        "working_directory": "",
        "arguments": {"path": path, "target": "file"},
        "path_intents": [{"access": "delete", "path": path}],
    }


def blocked(reason):
    return {"ok": False, "code": "blocked", "reason": reason, "ghost_state": "blocked"}


def assert_exposes_nothing(client, reason):
    client.initialize()
    assert client.tools() == []
    for tool in ("list_room_files", "write_room_file", "write_spec_document", "execute_approved_action"):
        assert client.call(tool, {"path": "x", "content": "y"}) == blocked(reason)


# --- protocol ---------------------------------------------------------------------


def test_initialize_reports_tools_capability_only(house):
    client = house.launch("archivist", None)
    result = client.initialize()
    assert result["capabilities"] == {"tools": {"listChanged": False}}
    assert result["protocolVersion"] == "2024-11-05"
    assert result["serverInfo"]["name"] == "haunted-house-room"
    assert client.request("ping")["result"] == {}
    newer = client.request("initialize", {"protocolVersion": "2025-06-18"})["result"]
    assert newer["protocolVersion"] == "2025-06-18"
    unknown = client.request("initialize", {"protocolVersion": "1999-01-01"})["result"]
    assert unknown["protocolVersion"] == "2024-11-05"


@pytest.mark.parametrize("role", ROLES)
def test_a_bound_ghost_sees_exactly_its_room_catalog(house, role):
    client = house.ghost(role)
    listed = client.request("tools/list")["result"]["tools"]
    assert listed == [tool_schema(name, role) for name in TOOLS_BY_ROLE[role]]
    for schema in listed:
        assert schema["inputSchema"]["additionalProperties"] is False


def test_malformed_input_gets_bounded_errors_and_the_server_survives(house):
    client = house.ghost("archivist")

    def raw(line: bytes):
        client.send_raw(line + b"\n")
        return client.read()

    assert raw(b"{not json")["error"]["code"] == -32700
    assert raw(b"[]")["error"]["code"] == -32600
    assert raw(b'"text"')["error"]["code"] == -32600
    assert raw(b'[{"jsonrpc":"2.0","id":1,"method":"tools/list"}]')["error"]["code"] == -32600
    assert raw(b'{"id":1,"method":"tools/list"}')["error"]["code"] == -32600
    assert raw(b'{"jsonrpc":"1.0","id":1,"method":"tools/list"}')["error"]["code"] == -32600
    assert raw(b'{"jsonrpc":"2.0","id":null,"method":"tools/list"}')["error"]["code"] == -32600
    assert raw(b'{"jsonrpc":"2.0","id":true,"method":"tools/list"}')["error"]["code"] == -32600
    assert raw(b'{"jsonrpc":"2.0","id":{"a":1},"method":"tools/list"}')["error"]["code"] == -32600
    assert raw(b'{"jsonrpc":"2.0","id":7,"method":9}')["error"]["code"] == -32600
    assert raw(b'{"jsonrpc":"2.0","id":7,"method":"tools/destroy"}')["error"] == {
        "code": -32601, "message": "method not found",
    }  # fmt: skip
    assert raw(b'{"jsonrpc":"2.0","id":7,"method":"tools/call","params":[]}')["error"]["code"] == -32602
    assert raw(b'{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{}}')["error"]["code"] == -32602
    assert raw(b'{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":7}}')["error"]["code"] == -32602
    assert (
        raw(b'{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"list_room_files","slot":"x"}}')
        ["error"]["code"] == -32602
    )  # fmt: skip
    # Deeply nested and oversized input.
    assert raw(b"[" * 100_000)["error"]["code"] in (-32700, -32600)
    oversized = b'{"jsonrpc":"2.0","id":8,"method":"ping","params":{"x":"' + b"a" * 600_000 + b'"}}'
    assert raw(oversized) == {"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "invalid request"}}
    # Notifications and blank lines produce no reply; the server still answers.
    client.send_raw(b'{"jsonrpc":"2.0","method":"notifications/cancelled","params":{}}\n\n   \n')
    assert client.tools() == list(TOOLS_BY_ROLE["archivist"])


@pytest.mark.parametrize(
    "arguments",
    [
        {"path": 7},
        {"path": "src/old.py", "extra": 1},
        {},
        ["src/old.py"],
        "src/old.py",
        {"path": "a" * 2000},
    ],
)
def test_malformed_arguments_never_reach_the_backend(house, arguments):
    client = house.ghost("archivist")
    assert client.call("read_room_file", arguments) == {"ok": False, "code": "invalid_arguments"}
    assert house.kinds() == []


def test_stdout_carries_only_protocol_replies_and_stderr_stays_silent(house):
    house.working(Phase.REQUIREMENTS)
    client = house.ghost("archivist")
    client.tools()
    client.call("write_spec_document", {"content": "body " + FAKE_CREDENTIAL, "expected_revision": 0})
    client.call("read_room_file", {"path": "../other-mansion/keep.txt"})
    client.send_raw(b"garbage\n")
    client.read()
    stdout, stderr = client.close()
    assert client.process.returncode == 0
    assert stderr == b""
    lines = stdout.splitlines()
    assert lines and all(json.loads(line)["jsonrpc"] == "2.0" for line in lines)
    text = stdout.decode()
    for capability in house.capabilities:
        assert capability not in text
    assert str(house.tmp) not in text and FAKE_CREDENTIAL not in text


# --- identity ---------------------------------------------------------------------


def test_absent_label_exposes_nothing(house):
    house.open(house.binding("tinker"))
    assert_exposes_nothing(house.launch("tinker", None), "session_label_absent")


@pytest.mark.parametrize("label", ["hh-tinker-1", "dashboard:", "dashboard:../x", "dashboard:a b", "chat:hh-tinker-1"])
def test_malformed_label_exposes_nothing(house, label):
    house.open(house.binding("tinker"))
    assert_exposes_nothing(house.launch("tinker", label), "session_label_malformed")


@pytest.mark.parametrize("room", [None, "", "workshop", "Tinker", "tinker "])
def test_missing_or_unknown_profile_room_exposes_nothing(house, room):
    house.open(house.binding("tinker"))
    assert_exposes_nothing(house.launch(room, "dashboard:hh-tinker-1"), "profile_room_absent")


def test_an_unbound_session_exposes_nothing(house):
    """A chat the owner opens with the same agent has a label and no binding."""

    house.open(house.binding("tinker"))
    assert_exposes_nothing(house.launch("tinker", "dashboard:owner-chat-1"), "session_binding_absent")


def test_a_cross_room_session_exposes_nothing(house):
    """An Archivist session cannot become a Tinker by using the Tinker server."""

    house.open(house.binding("archivist"))
    assert_exposes_nothing(house.launch("tinker", "dashboard:hh-archivist-1"), "profile_room_mismatch")


def _record(house, slot):
    return house.app_root / "data" / "session-bindings" / binding_filename("dashboard:" + slot)


def test_untrusted_binding_records_are_refused(house, tmp_path):
    house.open(house.binding("tinker"))
    record = _record(house, "hh-tinker-1")

    record.chmod(0o644)
    assert_exposes_nothing(house.launch("tinker", "dashboard:hh-tinker-1"), "session_binding_absent")
    record.chmod(0o600)

    os.link(record, record.with_suffix(".again"))
    assert_exposes_nothing(house.launch("tinker", "dashboard:hh-tinker-1"), "session_binding_absent")
    record.with_suffix(".again").unlink()

    moved = tmp_path / "moved.json"
    record.rename(moved)
    record.symlink_to(moved)
    assert_exposes_nothing(house.launch("tinker", "dashboard:hh-tinker-1"), "session_binding_absent")


def test_a_record_the_backend_would_not_have_written_exposes_nothing(house):
    """A record naming another Mansion root, or a capability the record does
    not hold, never yields a tool."""

    house.open(replace(house.binding("tinker"), mansion_root=str(house.elsewhere)))
    assert_exposes_nothing(house.launch("tinker", "dashboard:hh-tinker-1"), "catalog_mismatch")

    record = _record(house, "hh-tinker-1")
    damaged = json.loads(record.read_text())
    damaged["capability"] = "not-a-capability"
    record.write_text(json.dumps(damaged))
    assert_exposes_nothing(house.launch("tinker", "dashboard:hh-tinker-1"), "session_binding_absent")
    assert list(house.elsewhere.iterdir()) == []


def test_without_the_backend_endpoint_record_nothing_is_exposed(house):
    house.open(house.binding("tinker"))
    (house.app_root / "data" / "room-backend.json").unlink()
    assert_exposes_nothing(house.launch("tinker", "dashboard:hh-tinker-1"), "backend_endpoint_absent")


def test_a_closed_session_loses_its_tools(house):
    client = house.ghost("tinker")
    assert client.tools() == list(TOOLS_BY_ROLE["tinker"])
    house.close_session("hh-tinker-1")
    assert not _record(house, "hh-tinker-1").exists()
    # The running process still holds the dead capability: every call is refused.
    assert client.call("list_room_files") == blocked("session_unknown")
    assert client.call("write_room_file", {"path": "src/x.py", "content": "x"}) == blocked("session_unknown")
    assert not (house.mansion / "src" / "x.py").exists()
    assert_exposes_nothing(house.launch("tinker", "dashboard:hh-tinker-1"), "session_binding_absent")


def test_a_stopped_backend_blocks_every_tool(tmp_path):
    house = House(tmp_path)
    try:
        client = house.ghost("archivist")
        assert client.tools() == list(TOOLS_BY_ROLE["archivist"])
        house.backend.run(house.backend.gate.stop())
        assert client.call("list_room_files") == blocked("gate_unavailable")
    finally:
        house.shutdown()


def test_a_binding_written_a_moment_late_is_still_found(house):
    client = house.launch("archivist", "dashboard:hh-archivist-1")
    client.initialize()
    house.open(house.binding("archivist"))
    assert client.tools() == list(TOOLS_BY_ROLE["archivist"])


# --- forged authority -------------------------------------------------------------


def test_cwd_and_inherited_environment_carry_no_authority(house):
    """The server starts in another Mansion with authority-shaped variables set."""

    house.working(Phase.IMPLEMENTATION)
    house.open(house.binding("tinker"))
    client = house.launch(
        "tinker",
        "dashboard:hh-tinker-1",
        cwd=house.other,
        HH_MANSION="other-mansion",
        HH_MANSION_DIR=str(house.other),
        HH_SLOT="other-slot",
        HH_GHOST="other-ghost",
        HH_SPEC="other-spec",
        HH_APP_ROOT=str(house.elsewhere),
        HH_GATE_PORT="1",
        KIROCREW_APP_ROOT=str(house.elsewhere),
        PYTHONPATH=str(house.elsewhere),
        http_proxy="http://127.0.0.1:9",
        HTTP_PROXY="http://127.0.0.1:9",
    )
    client.initialize()
    assert client.tools() == list(TOOLS_BY_ROLE["tinker"])
    assert client.call("write_room_file", {"path": "note.txt", "content": "bound"})["ok"]
    assert (house.mansion / "note.txt").read_text() == "bound"
    assert sorted(p.name for p in house.other.iterdir()) == ["keep.txt"]
    assert list(house.elsewhere.iterdir()) == []


@pytest.mark.parametrize(
    "extra",
    ["mansion", "mansion_id", "mansion_dir", "room", "session", "session_slot", "slot", "ghost",
     "ghost_id", "spec", "capability", "label", "_meta"],
)  # fmt: skip
def test_model_supplied_authority_arguments_are_refused(house, extra):
    house.working(Phase.IMPLEMENTATION)
    client = house.ghost("tinker")
    result = client.call("write_room_file", {"path": "note.txt", "content": "x", extra: "other-mansion"})
    assert result == {"ok": False, "code": "invalid_arguments"}
    assert not (house.mansion / "note.txt").exists()


def test_meta_cannot_select_another_session(house):
    house.working(Phase.IMPLEMENTATION)
    client = house.ghost("tinker")
    result = client.call(
        "write_room_file",
        {"path": "note.txt", "content": "bound"},
        _meta={"mansion": "other-mansion", "slot": "other", "room": "archivist", "progressToken": 1},
    )
    assert result["ok"] and (house.mansion / "note.txt").read_text() == "bound"
    assert sorted(p.name for p in house.other.iterdir()) == ["keep.txt"]


@pytest.mark.parametrize(
    ("role", "tool"),
    [
        ("archivist", "write_room_file"),
        ("archivist", "propose_risky_action"),
        ("archivist", "execute_approved_action"),
        ("foreman", "write_room_file"),
        ("tinker", "write_spec_document"),
        ("tinker", "@haunted-house:room-tinker/write_room_file"),
        ("tinker", "shell"),
    ],
)
def test_a_tool_outside_the_profile_catalog_is_refused(house, role, tool):
    client = house.ghost(role)
    assert client.call(tool, {"path": "x", "content": "y"}) == {"ok": False, "code": "tool_not_available"}
    assert house.kinds() == []


# --- room files and revisions -----------------------------------------------------


def test_spec_write_revisions_and_evidence(house):
    house.working(Phase.REQUIREMENTS)
    client = house.ghost("archivist")
    first = client.call("write_spec_document", {"content": "# One\n", "expected_revision": 0})
    assert (first["ok"], first["revision"]) == (True, 1)
    stale = client.call("write_spec_document", {"content": "# Two\n", "expected_revision": 0})
    assert (stale["code"], stale["reason"], stale["current_revision"]) == ("conflict", "stale_revision", 1)
    document = house.mansion / spec_path(Phase.REQUIREMENTS)
    assert document.read_text() == "# One\n"
    assert client.call("write_spec_document", {"content": "# Two\n", "expected_revision": 1})["revision"] == 2
    assert house.kinds()[-4:] == [
        "spec_write_prepared", "spec_document_written", "spec_write_prepared", "spec_document_written",
    ]  # fmt: skip
    assert sorted(p.name for p in document.parent.iterdir()) == ["requirements.md"]


@pytest.mark.parametrize(
    "path",
    ["../other-mansion/keep.txt", "/etc/hosts", "a/../../other-mansion/keep.txt", "..%2fother-mansion/keep.txt",
     _CONTROL + "/seance/events.v1.jsonl", ".git/config", f".kiro/specs/{SPEC}/tasks.md", ".env", "id_rsa"],
)  # fmt: skip
def test_out_of_room_writes_are_denied_with_evidence_and_no_effect(house, path):
    house.working(Phase.IMPLEMENTATION)
    client = house.ghost("tinker")
    before = len(house.kinds())
    result = client.call("write_room_file", {"path": path, "content": "x"})
    assert result["ok"] is False and set(result) <= {"ok", "code", "reason"}
    assert house.kinds()[before:] == ["path_denied"]
    assert sorted(p.name for p in house.other.iterdir()) == ["keep.txt"]
    assert sorted(p.name for p in house.mansion.iterdir()) == [".kiro", "src"]


def test_symlink_escapes_are_refused(house):
    house.working(Phase.IMPLEMENTATION)
    (house.mansion / "out").symlink_to(house.other)
    client = house.ghost("tinker")
    assert client.call("read_room_file", {"path": "out/keep.txt"})["code"] == "symlink"
    assert client.call("write_room_file", {"path": "out/new.txt", "content": "x"})["code"] == "symlink"
    assert sorted(p.name for p in house.other.iterdir()) == ["keep.txt"]


# --- risky actions ----------------------------------------------------------------


def test_propose_wait_approve_execute_once(house):
    house.working(Phase.IMPLEMENTATION)
    client = house.ghost("tinker")
    target = house.mansion / "src" / "old.py"
    proposed = client.call("propose_risky_action", {"action": delete_action()})
    assert proposed["ok"] and proposed["status"] == "pending"
    proposal_id, digest = proposed["proposal_id"], proposed["action_digest"]
    arguments = {"proposal_id": proposal_id, "action": delete_action()}

    # Secondary-allow bypass: reaching the tool (as when Crew or a hook already
    # allowed the call) is not approval.  The ledger has no decision yet.
    assert client.call("execute_approved_action", arguments) == {
        "ok": False, "code": "proposal_pending", "status": "waiting",
    }  # fmt: skip
    assert target.exists()

    house.decide(proposal_id, digest)
    changed = {"proposal_id": proposal_id, "action": delete_action("src/other.py")}
    assert client.call("execute_approved_action", changed)["code"] == "descriptor_mismatch"
    assert target.exists()

    assert client.call("execute_approved_action", arguments) == {"ok": True, "code": "deleted", "consumed": True}
    assert not target.exists()
    assert client.call("execute_approved_action", arguments)["code"] == "proposal_consumed"
    assert house.kinds()[-6:] == [
        "risky_action_proposed", "risky_action_approved", "risky_action_denied",
        "risky_action_consumed", "risky_action_succeeded", "risky_action_denied",
    ]  # fmt: skip


def test_an_approved_command_runs_once_through_the_backend_runner(house):
    house.working(Phase.IMPLEMENTATION)
    client = house.ghost("tinker")
    action = {
        "kind": "run_command",
        "working_directory": "",
        "arguments": {"argv": ["pytest", "-q"], "timeout_seconds": 60},
        "path_intents": [{"access": "command_read", "path": "src"}],
    }
    proposed = client.call("propose_risky_action", {"action": action})
    arguments = {"proposal_id": proposed["proposal_id"], "action": action}
    assert client.call("execute_approved_action", arguments)["code"] == "proposal_pending"
    assert house.runner.runs == []
    house.decide(proposed["proposal_id"], proposed["action_digest"])
    done = client.call("execute_approved_action", arguments)
    assert done == {"ok": True, "code": "exited", "consumed": True, "exit_code": 0, "output": "ran"}
    assert client.call("execute_approved_action", arguments)["code"] == "proposal_consumed"
    assert house.runner.runs == ["run_command"]


def test_a_ghost_cannot_approve_its_own_proposal(house):
    """No tool, argument, or selector spelling yields an approval record."""

    house.working(Phase.IMPLEMENTATION)
    client = house.ghost("tinker")
    proposed = client.call("propose_risky_action", {"action": delete_action()})
    for tool in ("approve_risky_action", "risky_action_approved", "decide_risky_action"):
        assert client.call(tool, {"proposal_id": proposed["proposal_id"]})["code"] == "tool_not_available"
    forged = {"proposal_id": proposed["proposal_id"], "action": delete_action(), "approved": True}
    assert client.call("execute_approved_action", forged) == {"ok": False, "code": "invalid_arguments"}
    assert "risky_action_approved" not in house.kinds()
    assert (house.mansion / "src" / "old.py").exists()


def test_another_tinker_session_cannot_spend_the_approval(house):
    house.working(Phase.IMPLEMENTATION)
    first = house.ghost("tinker")
    proposed = first.call("propose_risky_action", {"action": delete_action()})
    house.decide(proposed["proposal_id"], proposed["action_digest"])
    house.open(house.binding("tinker", slot="hh-tinker-2", ghost="tinker-2"))
    second = house.launch("tinker", "dashboard:hh-tinker-2")
    second.initialize()
    result = second.call(
        "execute_approved_action", {"proposal_id": proposed["proposal_id"], "action": delete_action()}
    )
    assert result["ok"] is False and (house.mansion / "src" / "old.py").exists()


def test_out_of_room_action_is_refused_even_when_approved_elsewhere(house):
    house.working(Phase.IMPLEMENTATION)
    client = house.ghost("tinker")
    action = delete_action(f".kiro/specs/{SPEC}/requirements.md")
    assert client.call("propose_risky_action", {"action": action})["code"] == "path_denied"
    result = client.call("execute_approved_action", {"proposal_id": "any-proposal", "action": action})
    assert result["code"] == "path_denied" and "risky_action_consumed" not in house.kinds()


# --- canonical writer and structure -----------------------------------------------


def test_evidence_reaches_the_real_spec_2_writer_only_through_the_backend(tmp_path):
    """With the durable Spec 2 store, the MCP process still opens no log."""

    root = tmp_path / "workspace" / "mansions"
    house = House(tmp_path, writer=SeanceLogStore(root, clock_ms=lambda: 1_731_400_000_000))
    try:
        house.working(Phase.REQUIREMENTS)
        client = house.ghost("archivist")
        assert client.call("write_spec_document", {"content": "# Real\n", "expected_revision": 0})["ok"]
        assert client.call("read_room_file", {"path": _CONTROL + "/seance/events.v1.jsonl"})["ok"] is False
        assert house.kinds() == [
            "phase_start_reserved", "phase_started", "spec_write_prepared", "spec_document_written", "path_denied",
        ]  # fmt: skip
        logs = [p for p in tmp_path.rglob("*.jsonl")]
        assert len(logs) == 1 and logs[0].is_relative_to(house.mansion / _CONTROL)
        # Nothing durable but the binding record exists under the app root.
        data = sorted(p.relative_to(house.app_root / "data").as_posix() for p in (house.app_root / "data").rglob("*"))
        assert data == [
            "room-backend.json",
            "session-bindings",
            "session-bindings/" + binding_filename("dashboard:hh-archivist-1"),
        ]
    finally:
        house.shutdown()


def test_the_mcp_package_has_no_log_file_or_project_file_access():
    """Structural: the MCP process relays; it owns no store, writer, or path guard."""

    sources = {path.name: path.read_text(encoding="utf-8") for path in (APP_SOURCE / "mcp").glob("*.py")}
    assert set(sources) == {"server.py", "room_tools.py"}
    forbidden = re.compile(
        r"seance_log_store|SeanceLogStore|events\.v1|\.jsonl|seance_persistence|guarded_filesystem"
        r"|GuardrailPort|append_candidates|compare_and_append|subprocess|os\.system|shutil"
        r"|os\.getcwd|Path\.cwd|aiohttp|import requests|\beval\(|\bexec\("
    )
    for name, text in sources.items():
        assert forbidden.search(text) is None, (name, forbidden.search(text).group(0))
    # File opens: only the launcher's own location check; room_tools opens none.
    assert "open(" not in sources["room_tools.py"]
    assert re.findall(r"os\.environ\b", sources["server.py"]) == ["os.environ"]
    assert re.search(r"os\.environ|getenv", sources["room_tools.py"]) is None


def test_the_installed_server_path_is_what_decides_the_app_root(house, tmp_path):
    """A copy of the launcher outside an app root has no context at all."""

    stray = tmp_path / "stray" / "mcp"
    stray.mkdir(parents=True)
    for name in ("server.py", "room_tools.py"):
        (stray / name).write_bytes((house.app_root / "mcp" / name).read_bytes())
    house.open(house.binding("tinker"))
    client = McpClient(tmp_path / "stray", house.env("tinker", "dashboard:hh-tinker-1"), house.mansion)
    house.clients.append(client)
    client.initialize()
    assert client.tools() == []
    assert client.call("list_room_files") == blocked("backend_package_unavailable")
