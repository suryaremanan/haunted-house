from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

import pytest

SPIKE_ROOT = Path(__file__).resolve().parents[1]
if str(SPIKE_ROOT) not in sys.path:
    sys.path.insert(0, str(SPIKE_ROOT))

from room_mcp_server import (  # noqa: E402
    Blocked,
    RoomContext,
    TOOLS_BY_ROOM,
    app_root_from_file,
    call_tool,
    derive_context,
    handle,
    visible_tools,
)
from s9_probe import SECTIONS, evaluate, write_source  # noqa: E402

LABEL = "dashboard:slot-one"
FIXTURE = SPIKE_ROOT.parent / "fixtures" / "s9-app-mcp-launch-identity.json"


def _installed(tmp_path: Path, room: str = "archivist", label: str = LABEL) -> tuple[Path, Path, Path]:
    root = tmp_path.resolve() / "app"
    bindings = root / "data" / "session-bindings"
    bindings.mkdir(parents=True)
    (root / "app.json").write_text("{}\n", encoding="utf-8")
    mansion = tmp_path.resolve() / "mansions" / "alpha"
    mansion.mkdir(parents=True)
    record = {
        "schema": 1,
        "label": label,
        "ghost": f"{room}-1",
        "mansion": "alpha",
        "room": room,
        "spec": "demo",
        "mansionDir": str(mansion),
    }
    binding = bindings / (hashlib.sha256(label.encode()).hexdigest() + ".json")
    binding.write_text(json.dumps(record), encoding="utf-8")
    binding.chmod(0o600)
    return root, mansion, binding


def _env(room: str = "archivist", label: str = LABEL) -> dict[str, str]:
    return {"KIROCREW_SESSION_LABEL": label, "HH_ROOM": room}


def test_bound_session_gets_exact_room_context_and_catalog(tmp_path: Path) -> None:
    root, mansion, _ = _installed(tmp_path)

    context = derive_context(_env(), root)

    assert context == RoomContext(LABEL, "archivist-1", "alpha", "archivist", "demo", mansion)
    assert visible_tools(context) == TOOLS_BY_ROOM["archivist"]
    assert "write_room_file" not in visible_tools(context)


@pytest.mark.parametrize(
    ("env", "code"),
    [
        ({"HH_ROOM": "archivist"}, "session_label_absent"),
        (_env(label="dashboard:someone-else"), "session_binding_absent"),
        (_env(label="not a label"), "session_label_malformed"),
        (_env(room="tinker"), "profile_room_mismatch"),
        ({"KIROCREW_SESSION_LABEL": LABEL}, "profile_room_absent"),
    ],
)
def test_missing_or_disagreeing_identity_exposes_no_tool(tmp_path: Path, env: dict[str, str], code: str) -> None:
    root, mansion, _ = _installed(tmp_path)

    context = derive_context(env, root)

    assert context == Blocked(code)
    assert visible_tools(context) == ()
    assert call_tool(context, "write_spec_document", {"content": "x"}) == {
        "ok": False,
        "code": "blocked",
        "reason": code,
    }
    assert list(mansion.iterdir()) == []


def test_unverified_app_root_blocks(tmp_path: Path) -> None:
    stray = tmp_path / "elsewhere" / "server.py"
    stray.parent.mkdir()
    stray.write_text("", encoding="utf-8")

    assert app_root_from_file(str(stray)) is None
    assert derive_context(_env(), None) == Blocked("app_root_unverified")


@pytest.mark.parametrize("tamper", ["loose_mode", "symlink", "hard_link", "extra_key", "relative_dir"])
def test_untrusted_binding_records_are_rejected(tmp_path: Path, tamper: str) -> None:
    root, _, binding = _installed(tmp_path)
    if tamper == "loose_mode":
        binding.chmod(0o666)
    elif tamper == "symlink":
        moved = binding.with_name("moved.json")
        binding.rename(moved)
        binding.symlink_to(moved)
    elif tamper == "hard_link":
        os.link(binding, binding.with_name("second-name.json"))
    else:
        record = json.loads(binding.read_text(encoding="utf-8"))
        if tamper == "extra_key":
            record["capability"] = "model-chosen"
        else:
            record["mansionDir"] = "mansions/alpha"
        binding.write_text(json.dumps(record), encoding="utf-8")

    assert isinstance(derive_context(_env(), root), Blocked)


def test_model_supplied_authority_is_never_accepted(tmp_path: Path) -> None:
    root, mansion, _ = _installed(tmp_path)
    other = mansion.parent / "beta"
    other.mkdir()
    context = derive_context(_env(), root)

    forged = call_tool(context, "write_spec_document", {"content": "x", "mansion": "beta", "room": "tinker"})
    hidden = call_tool(context, "write_room_file", {"path": "a.txt", "content": "x"})
    written = call_tool(context, "write_spec_document", {"content": "body"})

    assert forged == {"ok": False, "code": "invalid_arguments"}
    assert hidden == {"ok": False, "code": "tool_not_available"}
    assert written["ok"] and written["mansion"] == "alpha"
    assert (mansion / ".kiro" / "specs" / "demo" / "requirements.md").read_text(encoding="utf-8") == "body"
    assert list(other.iterdir()) == []


@pytest.mark.parametrize("path", ["../beta/x", "/tmp/x", ".git/config", ".kiro/specs/demo/design.md", "a//b", "a\\b"])
def test_tinker_paths_stay_inside_the_room(tmp_path: Path, path: str) -> None:
    root, mansion, _ = _installed(tmp_path, room="tinker")
    context = derive_context(_env(room="tinker"), root)

    assert call_tool(context, "write_room_file", {"path": path, "content": "x"})["code"] == "path_denied"
    assert list(mansion.iterdir()) == []


def test_protocol_adapter_lists_and_calls_from_context_only(tmp_path: Path) -> None:
    root, _, _ = _installed(tmp_path)
    context = derive_context(_env(), root)

    listed = handle(context, {"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    schemas = {tool["name"]: tool["inputSchema"] for tool in listed["result"]["tools"]}
    blocked = handle(Blocked("session_label_absent"), {"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
    call = handle(
        context,
        {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "write_spec_document",
                "arguments": {"content": "x"},
                "_meta": {"kirocrew.caller": {"sessionKey": "dashboard:forged"}},
            },
        },
    )

    assert tuple(schemas) == TOOLS_BY_ROOM["archivist"]
    assert all(schema["additionalProperties"] is False for schema in schemas.values())
    assert not any(
        key in schema["properties"] for schema in schemas.values() for key in ("session", "slot", "mansion", "room", "ghost")
    )
    assert blocked["result"]["tools"] == []
    assert json.loads(call["result"]["content"][0]["text"])["mansion"] == "alpha"
    assert handle(context, {"jsonrpc": "2.0", "method": "notifications/initialized"}) is None


def test_probe_source_uses_app_relative_launchers_and_exact_selectors(tmp_path: Path) -> None:
    source = tmp_path / "source"
    write_source(source)
    manifest = json.loads((source / "app.json").read_text(encoding="utf-8"))
    tinker = json.loads((source / "agents" / "hh-s9-tinker.json").read_text(encoding="utf-8"))

    for entry in manifest["mcpServers"].values():
        assert entry["command"] == "python3" and entry["args"] == ["mcp/server.py"]
        assert entry["x-kirocrew-session-label"] is True and "autoApprove" not in entry
    assert tinker["allowedTools"] == [] and "mcpServers" not in tinker
    assert all("*" not in tool for tool in tinker["tools"])


def _observed(**overrides: bool) -> dict[str, object]:
    report: dict[str, object] = {"status": "observed", "crewVersion": "0.12.2", "isolatedHome": True}
    for section, names in SECTIONS.items():
        report[section] = {name: name != "agentLevelOverrideLauncherAnchored" for name in names}
    for dotted, value in overrides.items():
        section, name = dotted.split("__")
        report[section][name] = value  # type: ignore[index]
    return report


def test_evaluate_enables_mutations_only_when_every_check_holds() -> None:
    proven = evaluate(_observed())
    failed = evaluate(_observed(identity__absentLabelExposesNoTools=False))

    assert proven["failedChecks"] == []
    assert proven["decision"]["mutationTools"] == "enabled_only_with_label_and_binding"
    assert failed["failedChecks"] == ["identity.absentLabelExposesNoTools"]
    assert failed["decision"]["mutationTools"] == "absent"
    assert failed["outcome"] == "contract_unproved"


def test_evaluate_rejects_unexpected_report_shapes() -> None:
    extra = _observed()
    extra["path"] = "/somewhere"
    with pytest.raises(ValueError):
        evaluate(extra)
    with pytest.raises(ValueError):
        evaluate({"status": "observed"})


def test_committed_fixture_is_scrubbed_and_fail_closed() -> None:
    text = FIXTURE.read_text(encoding="utf-8")
    fixture = json.loads(text)

    assert str(Path.home()) not in text and "/Applications/" not in text
    assert fixture["spike"] == "S9" and fixture["liveGatewayExercised"] is False
    assert fixture["failedChecks"] == []
    assert fixture["decision"]["whenLabelOrBindingMissing"] == "expose_no_tool_and_report_ghost_blocked"
    assert fixture["decision"]["liveAcceptanceRequiredBeforeDemo"] is True
    assert {section: set(checks) for section, checks in fixture["checks"].items()} == SECTIONS
    assert len(fixture["evidence"]["unverified"]) >= 1
