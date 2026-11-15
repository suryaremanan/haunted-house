#!/usr/bin/env python3
"""S9: app-MCP launch and trusted identity probe (doors-and-guardrails 1.1).

Builds a synthetic gateway-managed app, runs Crew's packaged ``install_app``,
``register_app`` and session-label seams inside an ephemeral ``HOME``, then
speaks real MCP over stdio to the reference room server.  The operator's Crew
home, gateway and kiro-cli are never touched.

    python3 spikes/doors-runtime-contracts/s9_probe.py            # print report
    python3 spikes/doors-runtime-contracts/s9_probe.py --write    # refresh fixture
"""
from __future__ import annotations

import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
FIXTURE = ROOT.parent / "fixtures" / "s9-app-mcp-launch-identity.json"
WORK_PREFIX = ".probe-work-"
APP = "hh-s9-probe"
VERSION_PATTERN = re.compile(r"[0-9]+(?:\.[0-9]+)+")
ARCHIVIST_TOOLS = ("list_room_files", "read_room_file", "write_spec_document", "submit_phase_output")
TINKER_TOOLS = (
    "list_room_files",
    "read_room_file",
    "submit_phase_output",
    "write_room_file",
    "propose_risky_action",
    "execute_approved_action",
)
# The one check whose verified answer is "no": see README, "Findings".
EXPECTED_FALSE = {("launch", "agentLevelOverrideLauncherAnchored")}
SECTIONS = {
    "launch": {
        "untrustedAppRegistersNoServerOrAgent",
        "commandIsGatewayInterpreter",
        "launcherAnchoredToInstalledAppRoot",
        "userSiteIsolationFlagAdded",
        "sessionLabelMarkerPreserved",
        "perRoomStaticEnvPreserved",
        "everyAgentFileCarriesEveryAppServer",
        "exactToolSelectorsPreserved",
        "legacyAllowedToolsEmpty",
        "noAutoApproveWritten",
        "agentLevelOverrideLauncherAnchored",
    },
    "label": {
        "onlyToolGrantedServerIsLabelled",
        "labelEqualsSessionKey",
        "manifestDeclaredLabelCannotShadow",
        "noSessionKeyMeansNoLabel",
        "elementCarriesAnchoredLauncher",
    },
    "identity": {
        "boundArchivistSeesExactCatalog",
        "boundWriteLandsInBoundMansion",
        "modelSuppliedAuthorityArgumentsRejected",
        "toolOutsideProfileCatalogRefused",
        "forgedCallerMetaIgnored",
        "otherMansionUntouched",
        "processCwdCarriesNoAuthority",
        "boundTinkerSeesExactCatalog",
        "tinkerWritesOnlyInsideBoundMansion",
        "absentLabelExposesNoTools",
        "unboundSessionExposesNoTools",
        "malformedLabelExposesNoTools",
        "crossRoomSessionExposesNoTools",
        "missingProfileRoomExposesNoTools",
        "looseBindingPermissionsRejected",
        "linkedBindingRejected",
        "hardLinkedBindingRejected",
        "mutationsAfterFailuresAbsent",
    },
}
EVIDENCE = {
    "verified": [
        "Crew's packaged register_app registers nothing for an untrusted third-party app.",
        "A manifest stdio entry {command: python3, args: [mcp/server.py]} is rewritten to the "
        "gateway interpreter, -s, and the launcher's real path under the installed app root.",
        "The x-kirocrew-session-label marker and per-server static env survive registration.",
        "Crew's packaged session-label builder emits one per-session element only for the "
        "server the agent's tools grant, with KIROCREW_SESSION_LABEL set last to the session key.",
        "An mcpServers entry declared inside an agent file is copied unresolved (bare "
        "interpreter, relative launcher), so it is not a portable way to vary env per agent.",
        "Over real MCP stdio the reference server exposes the exact room catalog only when "
        "label, profile room and backend binding agree, and nothing otherwise.",
        "Tool arguments, _meta and process cwd cannot select session, Ghost, Mansion or Room.",
        "kiro-cli 3.3.0, driven directly over ACP with no prompt (one run by the team lead, "
        "recorded under kiroCliDirectObservation): a session/new stdio element is started at "
        "session/new, receives its declared env including KIROCREW_SESSION_LABEL, also inherits "
        "kiro-cli's own environment, and starts in the session cwd.",
    ],
    "inferred": [
        "Crew's gateway hands kiro-cli the labelled element for an app-owned chat slot "
        "(read from Crew 0.12.2 acp/session_label.py and acp/runtime_session_setup.py).",
        "The session key of an app-created slot is dashboard:<slot key> (dashboard/chat_utils_slots.py).",
        "A server kiro-cli starts natively from the agent file (unlabelled) may start in "
        "kiro-cli's process directory instead (apps/agent_launch.py); only the session/new "
        "element path was observed.",
        "kiro-cli mounts only the tools named by exact @server/tool selectors.",
    ],
    "unverified": [
        {
            "claim": "A live Crew session (gateway and agent sandbox) delivers KIROCREW_SESSION_LABEL to the app server and "
            "kiro-cli enforces the exact selectors.",
            "needs": "owner action on a real gateway",
            "manual_step": "Install and trust a Haunted House build whose manifest declares the "
            "per-room servers with x-kirocrew-session-label, start one Archivist session from "
            "the app, and confirm the Ghost lists exactly the archivist catalog while a chat "
            "the owner opens with the same agent lists no room tools.",
        },
        {
            "claim": "Inside Crew's default agent sandbox (agent.sandbox auto) the server process "
            "can read its binding under <app-root>/data and write the bound Mansion.",
            "needs": "owner action on a real gateway",
            "manual_step": "Same live session as above: the Archivist writes requirements.md "
            "through write_spec_document and the file appears in the Mansion. An unreadable "
            "binding shows as a blocked Ghost with no room tools.",
        },
    ],
}
# Recorded, not re-executed by this probe: one run of
# ``s9_kiro_cli_live.py --real-login`` by the team lead with the owner's approval.
KIRO_CLI_DIRECT_OBSERVATION = {
    "command": "python3 spikes/doors-runtime-contracts/s9_kiro_cli_live.py --real-login",
    "recorded": "2026-11-16",
    "kiroCliVersion": "3.3.0",
    "throughCrewGateway": False,
    "promptSent": False,
    "elementStartedAtSessionNew": True,
    "sessionLabelDelivered": True,
    "elementEnvDelivered": True,
    "kiroCliEnvironmentInherited": True,
    "serverProcessCwd": "session_cwd",
    "environmentNameCount": 16,
}
GUIDANCE = {
    "manifest": "Declare one stdio server per room (room-archivist, room-draughtsman, "
    "room-foreman, room-tinker), each {command: python3, args: [mcp/server.py], "
    "env: {HH_ROOM: <room>}, x-kirocrew-session-label: true}. No autoApprove, no ${...} or "
    "secret:// env values: either one silently withholds the label.",
    "profiles": "Each Ghost profile lists exact @haunted-house:room-<room>/<tool> selectors for "
    "its own room server only, allowedTools [], and no mcpServers block of its own.",
    "binding": "The backend picks an unguessable slot name, writes the owner-only binding "
    "record for dashboard:<slot> under <app-root>/data before sending the first turn, and "
    "removes it when the session ends.",
    "server": "Derive app root from the launcher's real path, session from "
    "KIROCREW_SESSION_LABEL, room from HH_ROOM, and Ghost/Mansion/spec from the binding. "
    "Never read cwd, tool arguments or _meta for authority, and trust no environment variable "
    "other than the Crew-set label and HH_ROOM: the process also inherits kiro-cli's own "
    "environment. List no tools when any input is missing or disagrees, and report the Ghost "
    "blocked.",
}


def _candidate_crew_pythons() -> list[Path]:
    candidates: list[Path] = []
    override = os.environ.get("KIROCREW_TEST_PYTHON")
    if override:
        candidates.append(Path(override).expanduser())
    executable = shutil.which("kirocrew")
    if executable:
        wrapper = Path(executable).resolve()
        candidates.extend([wrapper.with_name("python3.12"), wrapper.with_name("python3")])
    if importlib.util.find_spec("kiro_crew") is not None:
        candidates.append(Path(sys.executable))
    return list(dict.fromkeys(candidates))


def find_crew_python() -> Path | None:
    for candidate in _candidate_crew_pythons():
        if not candidate.is_file():
            continue
        check = subprocess.run(
            [str(candidate), "-I", "-c", "import kiro_crew.apps.bridges,kiro_crew;print(kiro_crew.__version__)"],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        if check.returncode == 0 and VERSION_PATTERN.fullmatch(check.stdout.strip()):
            return candidate
    return None


def _server_entry(room: str, extra_env: dict[str, str] | None = None) -> dict[str, Any]:
    return {
        "command": "python3",
        "args": ["mcp/server.py"],
        "env": {"HH_ROOM": room, **(extra_env or {})},
        "x-kirocrew-session-label": True,
    }


def write_source(source: Path) -> None:
    """A synthetic app shaped like the planned Haunted House MCP resources."""
    (source / "mcp").mkdir(parents=True)
    (source / "agents").mkdir()
    shutil.copy2(ROOT / "room_mcp_server.py", source / "mcp" / "server.py")
    manifest = {
        "name": APP,
        "version": "0.0.1",
        "displayName": "S9 MCP Identity Probe",
        "description": "Ephemeral fixture for verifying app-MCP launch and identity.",
        "author": "Haunted House contributors",
        "license": "MIT",
        "resources": "gateway",
        "lifecycle": "gateway",
        "agents": ["agents/hh-s9-archivist.json", "agents/hh-s9-tinker.json"],
        "mcpServers": {
            "room-archivist": _server_entry("archivist"),
            # A manifest that tries to pre-set the label must not win.
            "room-tinker": _server_entry("tinker", {"KIROCREW_SESSION_LABEL": "dashboard:forged"}),
        },
        "permissions": {"api": ["/api/version"]},
    }
    (source / "app.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    for room, tools in (("archivist", ARCHIVIST_TOOLS), ("tinker", TINKER_TOOLS)):
        agent: dict[str, Any] = {
            "name": f"hh-s9-{room}",
            "description": "S9 probe ghost.",
            "prompt": "Probe agent. Never run.",
            "model": "auto",
            "tools": ["fs_read", *(f"@{APP}:room-{room}/{tool}" for tool in tools)],
            "allowedTools": [],
            "permissions": {"rules": [{"capability": "fs_write", "match": ["**"], "effect": "deny"}]},
        }
        if room == "archivist":
            # Probes whether an agent-level entry is resolved like a manifest entry.
            agent["mcpServers"] = {f"{APP}:override": _server_entry("archivist")}
        (source / "agents" / f"hh-s9-{room}.json").write_text(
            json.dumps(agent, indent=2) + "\n", encoding="utf-8"
        )


def evaluate(observed: object) -> dict[str, Any]:
    """Validate the worker report and attach the fail-closed decision."""
    if (
        not isinstance(observed, dict)
        or set(observed) != {"status", "crewVersion", "isolatedHome", *SECTIONS}
        or observed["status"] != "observed"
        or observed["isolatedHome"] is not True
        or not isinstance(observed["crewVersion"], str)
        or VERSION_PATTERN.fullmatch(observed["crewVersion"]) is None
    ):
        raise ValueError("unexpected report shape")
    failed: list[str] = []
    for section, names in SECTIONS.items():
        checks = observed[section]
        if not isinstance(checks, dict) or set(checks) != names:
            raise ValueError("unexpected report shape")
        for name in sorted(names):
            if not isinstance(checks[name], bool):
                raise ValueError("unexpected report shape")
            if checks[name] is ((section, name) in EXPECTED_FALSE):
                failed.append(f"{section}.{name}")
    proven = not failed
    return {
        "spike": "S9",
        "schema_version": 1,
        "task": "doors-and-guardrails 1.1",
        "crewVersion": observed["crewVersion"],
        "isolatedHome": True,
        "liveGatewayExercised": False,
        "checks": {section: dict(sorted(observed[section].items())) for section in SECTIONS},
        "failedChecks": failed,
        "outcome": "isolated_contract_verified_live_delivery_unverified"
        if proven
        else "contract_unproved",
        "decision": {
            "mutationTools": "enabled_only_with_label_and_binding" if proven else "absent",
            "whenLabelOrBindingMissing": "expose_no_tool_and_report_ghost_blocked",
            "modelSuppliedAuthority": "never_accepted",
            "perAgentServerOverride": "do_not_use",
            "liveAcceptanceRequiredBeforeDemo": True,
        },
        "kiroCliDirectObservation": KIRO_CLI_DIRECT_OBSERVATION,
        "evidence": EVIDENCE,
        "guidance": GUIDANCE,
    }


def _failure(code: str) -> dict[str, Any]:
    return {
        "spike": "S9",
        "status": "unverified",
        "code": code,
        "decision": {"mutationTools": "absent"},
    }


def assert_scrubbed(report: dict[str, Any]) -> None:
    text = json.dumps(report)
    if str(Path.home()) in text or tempfile.gettempdir() in text or "/Applications/" in text:
        raise ValueError("absolute path in report")


def run_probe() -> tuple[dict[str, Any], int]:
    crew_python = find_crew_python()
    if crew_python is None:
        return _failure("crew_test_harness_unavailable"), 2
    try:
        with tempfile.TemporaryDirectory(prefix=WORK_PREFIX, dir=ROOT) as raw_work:
            work = Path(raw_work)
            source, home, scratch = work / "source", work / "home", work / "work"
            home.mkdir()
            scratch.mkdir()
            write_source(source)
            env = {
                "HOME": str(home),
                "PATH": "/usr/bin:/bin",
                "KIROCREW_CREW_LOG": "0",
                "PYTHONDONTWRITEBYTECODE": "1",
            }
            completed = subprocess.run(
                [str(crew_python), "-I", str(ROOT / "s9_worker.py"), str(source), str(scratch)],
                cwd=work,
                env=env,
                capture_output=True,
                text=True,
                timeout=180,
                check=False,
            )
    except (OSError, subprocess.SubprocessError):
        return _failure("crew_test_harness_failed"), 2
    try:
        observed = json.loads(completed.stdout)
    except json.JSONDecodeError:
        return _failure("crew_test_harness_invalid_report"), 2
    if completed.returncode != 0:
        code = observed.get("code") if isinstance(observed, dict) else None
        safe = code if isinstance(code, str) and re.fullmatch(r"[a-z0-9_]+", code) else "worker_failed"
        return _failure(safe), 2
    try:
        report = evaluate(observed)
        assert_scrubbed(report)
    except ValueError:
        return _failure("crew_test_harness_unsafe_report"), 2
    return report, 0 if not report["failedChecks"] else 1


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    report, status = run_probe()
    text = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if args == ["--write"] and status == 0:
        FIXTURE.write_text(text, encoding="utf-8")
    sys.stdout.write(text)
    return status


if __name__ == "__main__":
    raise SystemExit(main())
