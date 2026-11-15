"""S9 worker: Crew's real app-MCP registration and label seams in an isolated home.

Runs under Crew's own Python with ``HOME`` pointed at an ephemeral directory,
so the default data home, agents directory and config all live there.  It
never touches the operator's Crew home, never starts a gateway, and never
talks to kiro-cli.  Stdout is one scrubbed JSON object of booleans and fixed
names; failures collapse to stable codes.
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

APP = "hh-s9-probe"
SPEC = "demo-spec"
ROOMS = ("archivist", "tinker")
LABEL_ENV = "KIROCREW_SESSION_LABEL"
MARKER = "x-kirocrew-session-label"
SLOTS = {
    "archivist": ("dashboard:hh-s9-slot-archivist", "alpha"),
    "tinker": ("dashboard:hh-s9-slot-tinker", "beta"),
}
ARCHIVIST_TOOLS = ["list_room_files", "read_room_file", "write_spec_document", "submit_phase_output"]
TINKER_TOOLS = [
    "list_room_files",
    "read_room_file",
    "submit_phase_output",
    "write_room_file",
    "propose_risky_action",
    "execute_approved_action",
]


class ProbeFailure(RuntimeError):
    """A stable, path-free probe failure."""


def _require(condition: bool, code: str) -> None:
    if not condition:
        raise ProbeFailure(code)


def _exchange(
    element: dict[str, Any],
    calls: list[dict[str, Any]],
    *,
    cwd: Path,
    env: dict[str, str] | None = None,
) -> tuple[list[str], list[dict[str, Any]]]:
    """Launch one server as the element describes and speak MCP over stdio.

    The child receives exactly the element's ``env`` and nothing else, which is
    the least a spawner can provide.  Returns (listed tool names, call results).
    """
    child_env = {pair["name"]: pair["value"] for pair in element["env"]} if env is None else env
    requests: list[dict[str, Any]] = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
    ]
    for offset, params in enumerate(calls):
        requests.append({"jsonrpc": "2.0", "id": 10 + offset, "method": "tools/call", "params": params})
    completed = subprocess.run(
        [element["command"], *element["args"]],
        input="".join(json.dumps(item) + "\n" for item in requests),
        cwd=cwd,
        env=child_env,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    _require(completed.returncode == 0, "mcp_server_failed")
    replies = {reply["id"]: reply for reply in map(json.loads, completed.stdout.splitlines())}
    _require(replies[1]["result"]["serverInfo"]["name"] == "haunted-house-room", "mcp_initialize_failed")
    tools = [tool["name"] for tool in replies[2]["result"]["tools"]]
    results = [
        json.loads(replies[10 + offset]["result"]["content"][0]["text"]) for offset in range(len(calls))
    ]
    return tools, results


def _call(name: str, arguments: dict[str, Any], **extra: Any) -> dict[str, Any]:
    return {"name": name, "arguments": arguments, **extra}


def _relabel(element: dict[str, Any], label: str | None) -> dict[str, str]:
    env = {pair["name"]: pair["value"] for pair in element["env"]}
    if label is None:
        env.pop(LABEL_ENV, None)
    else:
        env[LABEL_ENV] = label
    return env


def _launch_checks(app_root: Path, agents_dir: Path) -> tuple[dict[str, bool], dict[str, Any]]:
    """What Crew wrote for the manifest's app-relative stdio launchers."""
    registered = json.loads((agents_dir / "kirocrew.json").read_text(encoding="utf-8"))["mcpServers"]
    launcher = os.path.realpath(app_root / "mcp" / "server.py")
    specs = {
        room: json.loads((agents_dir / f"{APP}--hh-s9-{room}.json").read_text(encoding="utf-8"))
        for room in ROOMS
    }
    room_entries = [registered[f"{APP}:room-{room}"] for room in ROOMS]
    override = specs["archivist"]["mcpServers"][f"{APP}:override"]
    checks = {
        "commandIsGatewayInterpreter": all(e["command"] == sys.executable for e in room_entries),
        "launcherAnchoredToInstalledAppRoot": all(e["args"][-1] == launcher for e in room_entries),
        "userSiteIsolationFlagAdded": all(e["args"][:-1] == ["-s"] for e in room_entries),
        "sessionLabelMarkerPreserved": all(e.get(MARKER) is True for e in room_entries),
        "perRoomStaticEnvPreserved": all(
            registered[f"{APP}:room-{room}"]["env"]["HH_ROOM"] == room for room in ROOMS
        ),
        "everyAgentFileCarriesEveryAppServer": all(
            {f"{APP}:room-{room}" for room in ROOMS} <= set(spec["mcpServers"]) for spec in specs.values()
        ),
        "exactToolSelectorsPreserved": all(
            [t for t in specs[room]["tools"] if t.startswith("@")]
            == [f"@{APP}:room-{room}/{tool}" for tool in (ARCHIVIST_TOOLS if room == "archivist" else TINKER_TOOLS)]
            for room in ROOMS
        ),
        "legacyAllowedToolsEmpty": all(spec.get("allowedTools") == [] for spec in specs.values()),
        "noAutoApproveWritten": all(
            "autoApprove" not in entry for spec in specs.values() for entry in spec["mcpServers"].values()
        ),
        # An agent file's own mcpServers entry replaces the manifest entry whole
        # and is NOT resolved: the bare interpreter and relative launcher stay.
        "agentLevelOverrideLauncherAnchored": override["command"] == sys.executable
        and os.path.isabs(override["args"][-1]),
    }
    return checks, specs


def _label_checks(specs: dict[str, Any], work: Path) -> tuple[dict[str, bool], dict[str, Any]]:
    """Which servers Crew would re-declare per session, and with what label."""
    from kiro_crew.acp.session_label import kiro_session_label_elements

    elements: dict[str, Any] = {}
    only_granted = True
    label_is_key = True
    for room in ROOMS:
        key = SLOTS[room][0]
        built = kiro_session_label_elements(f"hh-s9-{room}", work_dir=str(work), session_key=key)
        only_granted &= [item["name"] for item in built] == [f"{APP}:room-{room}"]
        _require(only_granted, "label_element_unexpected")
        env = {pair["name"]: pair["value"] for pair in built[0]["env"]}
        label_is_key &= env.get(LABEL_ENV) == key and built[0]["type"] == "stdio"
        elements[room] = built[0]
    tinker_env = [pair for pair in elements["tinker"]["env"] if pair["name"] == LABEL_ENV]
    checks = {
        "onlyToolGrantedServerIsLabelled": only_granted,
        "labelEqualsSessionKey": label_is_key,
        # The tinker manifest entry declares its own KIROCREW_SESSION_LABEL.
        "manifestDeclaredLabelCannotShadow": tinker_env
        == [{"name": LABEL_ENV, "value": SLOTS["tinker"][0]}],
        "noSessionKeyMeansNoLabel": kiro_session_label_elements(
            "hh-s9-archivist", work_dir=str(work), session_key=""
        )
        == [],
        "elementCarriesAnchoredLauncher": all(
            os.path.isabs(elements[room]["args"][-1]) for room in ROOMS
        ),
    }
    return checks, elements


def _write_binding(data_dir: Path, label: str, room: str, mansion_dir: Path) -> Path:
    """Stand-in for the backend: record the binding before the session starts."""
    directory = data_dir / "session-bindings"
    directory.mkdir(mode=0o700, exist_ok=True)
    record = {
        "schema": 1,
        "label": label,
        "ghost": f"{room}-1",
        "mansion": mansion_dir.name,
        "room": room,
        "spec": SPEC,
        "mansionDir": os.fspath(mansion_dir),
    }
    path = directory / (hashlib.sha256(label.encode("utf-8")).hexdigest() + ".json")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(record, handle)
    return path


def _identity_checks(elements: dict[str, Any], data_dir: Path, work: Path) -> dict[str, bool]:
    """Real stdio exchanges: bound, unbound, forged and cross-bound sessions."""
    mansions = {name: Path(os.path.realpath(work / "mansions" / name)) for name in ("alpha", "beta")}
    for directory in mansions.values():
        directory.mkdir(parents=True)
    neutral = work / "launch-cwd"
    neutral.mkdir()
    bindings = {
        room: _write_binding(data_dir, SLOTS[room][0], room, mansions[SLOTS[room][1]]) for room in ROOMS
    }
    archivist, tinker = elements["archivist"], elements["tinker"]
    spec_doc = Path(".kiro") / "specs" / SPEC / "requirements.md"
    forged = {"mansion": "beta", "room": "tinker", "session": SLOTS["tinker"][0], "slot": "x"}

    tools_a, results_a = _exchange(
        archivist,
        [
            _call("write_spec_document", {"content": "bound"}),
            _call("write_spec_document", {"content": "forged", **forged}),
            _call("write_room_file", {"path": "escape.txt", "content": "x"}),
            _call(
                "write_spec_document",
                {"content": "meta"},
                _meta={"kirocrew.caller": {"schemaVersion": 1, "sessionKey": SLOTS["tinker"][0]}},
            ),
        ],
        cwd=neutral,
    )
    checks = {
        "boundArchivistSeesExactCatalog": tools_a == ARCHIVIST_TOOLS,
        "boundWriteLandsInBoundMansion": results_a[0]
        == {
            "ok": True,
            "code": "written",
            "path": spec_doc.as_posix(),
            "ghost": "archivist-1",
            "mansion": "alpha",
            "room": "archivist",
        },
        "modelSuppliedAuthorityArgumentsRejected": results_a[1] == {"ok": False, "code": "invalid_arguments"},
        "toolOutsideProfileCatalogRefused": results_a[2] == {"ok": False, "code": "tool_not_available"},
        "forgedCallerMetaIgnored": results_a[3]["ok"] and results_a[3]["mansion"] == "alpha",
        "otherMansionUntouched": not any(mansions["beta"].iterdir())
        and (mansions["alpha"] / spec_doc).read_text(encoding="utf-8") == "meta",
    }

    # Working directory carries no authority: start inside the OTHER mansion.
    _, results = _exchange(archivist, [_call("write_spec_document", {"content": "cwd"})], cwd=mansions["beta"])
    checks["processCwdCarriesNoAuthority"] = (
        results[0]["mansion"] == "alpha"
        and not any(mansions["beta"].iterdir())
        and (mansions["alpha"] / spec_doc).read_text(encoding="utf-8") == "cwd"
    )

    tools_t, results_t = _exchange(
        tinker,
        [
            _call("write_room_file", {"path": "src/ok.txt", "content": "x"}),
            _call("write_room_file", {"path": "../alpha/leak.txt", "content": "x"}),
            _call("write_room_file", {"path": os.fspath(mansions["alpha"] / "abs.txt"), "content": "x"}),
            _call("write_spec_document", {"content": "x"}),
        ],
        cwd=neutral,
    )
    checks["boundTinkerSeesExactCatalog"] = tools_t == TINKER_TOOLS
    checks["tinkerWritesOnlyInsideBoundMansion"] = (
        results_t[0]["ok"]
        and results_t[0]["mansion"] == "beta"
        and [r["code"] for r in results_t[1:]] == ["path_denied", "path_denied", "tool_not_available"]
        and (mansions["beta"] / "src" / "ok.txt").is_file()
        and sorted(p.name for p in mansions["alpha"].iterdir()) == [".kiro"]
    )

    def blocked(element: dict[str, Any], env: dict[str, str], reason: str) -> bool:
        tools, results = _exchange(
            element, [_call("write_spec_document", {"content": "no"})], cwd=neutral, env=env
        )
        return tools == [] and results == [{"ok": False, "code": "blocked", "reason": reason}]

    # A native (unlabelled) launch, e.g. warm-pool session or label withheld.
    checks["absentLabelExposesNoTools"] = blocked(archivist, _relabel(archivist, None), "session_label_absent")
    checks["unboundSessionExposesNoTools"] = blocked(
        archivist, _relabel(archivist, "dashboard:owner-opened-chat"), "session_binding_absent"
    )
    checks["malformedLabelExposesNoTools"] = blocked(
        archivist, _relabel(archivist, "../../etc"), "session_label_malformed"
    )
    # The archivist server started inside the tinker's session.
    checks["crossRoomSessionExposesNoTools"] = blocked(
        archivist, _relabel(archivist, SLOTS["tinker"][0]), "profile_room_mismatch"
    )
    no_room = _relabel(archivist, SLOTS["archivist"][0])
    del no_room["HH_ROOM"]
    checks["missingProfileRoomExposesNoTools"] = blocked(archivist, no_room, "profile_room_absent")

    binding = bindings["archivist"]
    os.chmod(binding, 0o666)
    checks["looseBindingPermissionsRejected"] = blocked(
        archivist, _relabel(archivist, SLOTS["archivist"][0]), "session_binding_absent"
    )
    moved = binding.with_name("moved.json")
    os.chmod(binding, 0o600)
    os.rename(binding, moved)
    os.symlink(moved, binding)
    checks["linkedBindingRejected"] = blocked(
        archivist, _relabel(archivist, SLOTS["archivist"][0]), "session_binding_absent"
    )
    os.unlink(binding)
    os.link(moved, binding)
    checks["hardLinkedBindingRejected"] = blocked(
        archivist, _relabel(archivist, SLOTS["archivist"][0]), "session_binding_absent"
    )
    checks["mutationsAfterFailuresAbsent"] = (mansions["alpha"] / spec_doc).read_text(
        encoding="utf-8"
    ) == "cwd" and sorted(p.name for p in mansions["beta"].iterdir()) == ["src"]
    return checks


def run(source: Path, work: Path) -> dict[str, Any]:
    from kiro_crew import __version__ as crew_version
    from kiro_crew.apps import bridges
    from kiro_crew.apps.bridges_mcp_config import _mcp_json_path
    from kiro_crew.apps.manager import app_data_dir, app_dir, install_app
    from kiro_crew.config.paths import config_dir, data_home

    home = Path(os.path.realpath(Path.home()))
    agents_dir = _mcp_json_path().parent
    for location in (agents_dir, data_home(), config_dir()):
        _require(home in Path(os.path.realpath(location)).parents, "crew_home_not_isolated")

    _require(install_app(str(source)).ok, "install_failed")
    untrusted = bridges.register_app(APP)
    trust_gate = (
        untrusted.mcp_servers == []
        and untrusted.agents == []
        and not (agents_dir / "kirocrew.json").exists()
    )
    config_dir().mkdir(parents=True, exist_ok=True)
    (config_dir() / "config.json").write_text(
        json.dumps({"agent": {"apps_trusted": [APP], "apps_trusted_local": [APP]}}), encoding="utf-8"
    )
    trusted = bridges.register_app(APP)
    _require(trusted.errors == [], "trusted_registration_failed")
    _require(len(trusted.agents) == len(ROOMS), "agents_not_registered")

    launch, specs = _launch_checks(app_dir(APP), agents_dir)
    launch["untrustedAppRegistersNoServerOrAgent"] = trust_gate
    label, elements = _label_checks(specs, work)
    identity = _identity_checks(elements, app_data_dir(APP), work)
    return {
        "crewVersion": crew_version,
        "isolatedHome": True,
        "launch": launch,
        "label": label,
        "identity": identity,
    }


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if len(args) != 2:
        print(json.dumps({"status": "unverified", "code": "invalid_worker_arguments"}))
        return 2
    try:
        report = run(Path(args[0]), Path(args[1]))
    except ProbeFailure as exc:
        print(json.dumps({"status": "unverified", "code": str(exc)}))
        return 2
    except Exception as exc:  # noqa: BLE001 - reduce every failure to a path-free code
        print(json.dumps({"status": "unverified", "code": f"worker_{type(exc).__name__.lower()}"}))
        return 2
    print(json.dumps({"status": "observed", **report}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
