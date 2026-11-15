#!/usr/bin/env python3
"""RG-S2: gateway-managed resource loading probe (room-ghosts 1.2).

Stages a copy of the real ``app/`` tree, runs Crew's packaged ``install_app``,
``register_app``, launch projection and session-label seams inside an
ephemeral ``HOME``, and reports which explicit resources and tools a Room
Ghost profile carries into a Kiro launch.  The operator's Crew home, gateway
and kiro-cli are never touched.

    python3 spikes/room-ghosts-contracts/rg_s2_probe.py            # print report
    python3 spikes/room-ghosts-contracts/rg_s2_probe.py --write    # refresh fixture
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import crew_harness  # noqa: E402

SPIKE = "RG-S2"
FIXTURE = crew_harness.FIXTURES / "rg-s2-app-resource-loading.json"
APP_SOURCE = ROOT.parents[1] / "app"
MVP_ROLES = ("archivist", "draughtsman", "foreman", "tinker")
STEERING = "file://.kiro/steering/**/*.md"
SECTIONS = {
    "registration": {
        "untrustedAppRegistersNoAgentOrSkill",
        "exactlyDeclaredAgentsRegistered",
        "undeclaredMediumProfileNotRegistered",
        "authoredProfileFieldsCarriedVerbatim",
        "steeringResourceStaysRelative",
        "noSkillUriInRegisteredProfile",
        "noAutoApproveWritten",
        "exactlyDeclaredSkillsLinked",
        "skillLinksResolveInsideInstalledApp",
        "undeclaredMediumSkillNotLinked",
        "declaredSkillsAlsoLinkedFlat",
    },
    "launchView": {
        "viewToolsAreExactlyTheRoomCatalog",
        "viewMountsNoCrewSkillServer",
        "viewKeepsSteeringResource",
        "viewIsNotASkillSearchAgent",
        "exclusionStopsInheritedSkills",
        "withoutExclusionCrewAddsSkillSearchTool",
        "skillUriIsDroppedAndReplacedBySearchTool",
        "skillUriWithExclusionRefusesTheView",
    },
    "resourceForms": {
        "relativeSkillUriResolvesInSessionProject",
        "homeSkillUriNamesTheInstalledSkill",
        "noAppRelativeSkillUriForm",
    },
    "label": {"onlyOwnRoomServerIsLabelledPerSession"},
}
EVIDENCE = {
    "verified": [
        "Crew's packaged register_app registers no agent and links no skill for an untrusted app.",
        "For the trusted app it registers exactly the manifest's four agent files and links exactly "
        "the manifest's four skill directories, namespaced under the app name and also flat; the "
        "undeclared Medium profile and bounded-review skill that ship in the tree are left alone.",
        "A registered profile keeps its authored tools, allowedTools, excludedTools, includeMcpJson, "
        "includePowers, resources, permissions and prompt unchanged; the steering resource stays the "
        "relative file://.kiro/steering/**/*.md and no autoApprove is written.",
        "Crew's packaged launch projection (native_skill_view) of each registered profile lists "
        "exactly that room's @haunted-house:room-<role>/<tool> selectors, mounts no kirocrew-core "
        "server, keeps the steering resource, and is not a skill-search agent.",
        "The same projection of a profile without excludedTools [@kirocrew-core] adds the tool "
        "@kirocrew-core/skill_search and the kirocrew-core server (inherited skill trees).",
        "The same projection drops a skill:// resource and substitutes that skill_search tool; a "
        "profile that both maps a skill:// resource and excludes @kirocrew-core gets no launch view.",
        "Crew expands a relative skill:// URI in the session project and a skill://~/ URI in the "
        "home folder; there is no form relative to the installed app.",
        "Crew's session-label builder re-declares only the profile's own room server per session.",
    ],
    "inferred": [
        "kiro-cli resolves the relative file:// steering resource in the session's working folder, "
        "the Mansion the app set as the slot project (Crew 0.12.2 apps/agent_launch.py and the Kiro "
        "custom-agent reference; not exercised).",
        "An app-owned chat slot is launched through the same projection as every Kiro launch "
        "(acp/skill_projection_parts/preparation.py project_agent_view; read, not exercised live).",
        "kiro-cli applies excludedTools and the skill, power, shell, fs_write, web and subagent deny "
        "rules of the registered profile (Kiro permissions reference; S4 observed one deny rule live).",
    ],
    "unverified": [
        {
            "claim": "In a live app-owned session each Room Ghost receives the Mansion steering files "
            "as context.",
            "needs": "owner action on a real gateway",
            "manual_step": "Install and trust this Haunted House build, create a disposable Mansion "
            "whose .kiro/steering/probe.md holds one unusual marker word, start an Archivist run from "
            "the app with the brief 'Put the steering marker word in the Introduction', and confirm "
            "the written requirements.md contains that word.",
        },
        {
            "claim": "In that live session the Ghost's tool list is exactly its room catalog: no "
            "kirocrew-core tool, no built-in tool, no other room's tool.",
            "needs": "owner action on a real gateway",
            "manual_step": "After that run ends, open the Ghost's session from the Crew sidebar and "
            "send 'List the exact name of every tool you can call, one per line, and call none'; "
            "confirm only the four room-archivist tools are named and no skill_search, file, shell or "
            "web tool. Record the list, scrubbed, as spikes/fixtures/rg-s2-live-tools.json.",
        },
        {
            "claim": "A denied built-in or out-of-room attempt is refused live by the profile rules.",
            "needs": "owner action on a real gateway",
            "manual_step": "In that opened session send 'Create a file named bypass.txt with your "
            "own file tool, not a room tool'; confirm the reply reports a permission rule or a "
            "missing tool and that bypass.txt does not exist in the Mansion.",
        },
        {
            "claim": "The Room_Skill block delivered at the front of the assignment prompt is "
            "followed by the model (document shape and final Ghost_Result).",
            "needs": "owner action on a real gateway",
            "manual_step": "The Archivist run above ends with one Ghost_Result JSON object and the "
            "house's validator accepts requirements.md without a repair round.",
        },
    ],
}
GUIDANCE = {
    "profiles": "resources is exactly [file://.kiro/steering/**/*.md]; excludedTools is exactly "
    "[@kirocrew-core]; includeMcpJson and includePowers are false; no skill:// entry, because Crew "
    "replaces it with a tool outside the room catalog and refuses the view when that tool is excluded.",
    "skills": "Declare each enabled role's skill directory in the manifest so it is installed and "
    "reviewable. The backend reads <app root>/skills/<skill>/SKILL.md "
    "(adapters/room_skills.read_room_skill_block) and puts the delimited block at the front of the "
    "assignment prompt; nothing is inherited from the owner's or the Mansion's skill folders.",
    "medium": "The Medium profile and bounded-review skill ship in the tree but stay out of the "
    "manifest while the Séance Room is disabled, so Crew registers neither.",
    "owner_visibility": "A declared skill also appears in the owner's own Crew skill catalog under "
    "its plain name; that is Crew's flat link and gives no Ghost any tool.",
}


def stage_app(work: Path) -> list[str]:
    """Copy the shippable parts of ``app/`` and make the worker's scratch folder."""
    source = work / "source"
    shutil.copytree(
        APP_SOURCE,
        source,
        ignore=shutil.ignore_patterns(
            "node_modules", "__pycache__", ".venv", "tests", "src", "dist-replay", ".pytest_cache", "data"
        ),
    )
    scratch = work / "work"
    scratch.mkdir()
    return [str(source), str(scratch)]


def evaluate(observed: object) -> dict[str, Any]:
    """Validate the worker report and attach the decision."""
    if (
        not isinstance(observed, dict)
        or set(observed) != {"status", "crewVersion", "isolatedHome", "observed", *SECTIONS}
        or observed["status"] != "observed"
        or observed["isolatedHome"] is not True
        or not isinstance(observed["crewVersion"], str)
        or crew_harness.VERSION_PATTERN.fullmatch(observed["crewVersion"]) is None
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
            if not checks[name]:
                failed.append(f"{section}.{name}")
    seen = observed["observed"]
    if (
        not isinstance(seen, dict)
        or set(seen) != {"declaredAgents", "declaredSkills", "visibleTools", "installedSkillUriForm"}
        or not isinstance(seen["visibleTools"], dict)
        or set(seen["visibleTools"]) != set(MVP_ROLES)
        or not all(
            isinstance(tools, list) and all(isinstance(tool, str) for tool in tools)
            for tools in seen["visibleTools"].values()
        )
        or not isinstance(seen["installedSkillUriForm"], str)
        or not seen["installedSkillUriForm"].startswith("skill://~/")
        or not all(
            isinstance(seen[key], list) and all(isinstance(item, str) for item in seen[key])
            for key in ("declaredAgents", "declaredSkills")
        )
    ):
        raise ValueError("unexpected report shape")
    proven = not failed
    return {
        "spike": SPIKE,
        "schema_version": 1,
        "task": "room-ghosts 1.2",
        "crewVersion": observed["crewVersion"],
        "isolatedHome": True,
        "liveGatewayExercised": False,
        "checks": {section: dict(sorted(observed[section].items())) for section in SECTIONS},
        "failedChecks": failed,
        "outcome": "isolated_contract_verified_live_loading_unverified" if proven else "contract_unproved",
        "contract": {
            "steeringResource": STEERING,
            "excludedTools": ["@kirocrew-core"],
            "skillResourceInProfile": False,
            "skillDelivery": "bounded_prompt_block" if proven else "unavailable",
            "installedSkillUriForm": seen["installedSkillUriForm"],
            "declaredAgents": seen["declaredAgents"],
            "declaredSkills": seen["declaredSkills"],
            "visibleTools": {role: seen["visibleTools"][role] for role in MVP_ROLES},
        },
        "decision": {
            "steering": "explicit_relative_file_resource" if proven else "unproved",
            "skill": "skill_uri_rejected_use_bounded_immutable_prompt_injection",
            "implicitInheritance": "disabled_by_excluding_crew_skill_server",
            "whenResourceContractUnproved": "start_no_room_ghost_report_contract_unavailable",
            "mediumRegisteredByDefault": False,
            "liveAcceptanceRequiredBeforeDemo": True,
        },
        "evidence": EVIDENCE,
        "guidance": GUIDANCE,
    }


def run_probe() -> tuple[dict[str, Any], int]:
    observed, status = crew_harness.run_worker(SPIKE, ROOT / "rg_s2_worker.py", prepare=stage_app)
    if status != 0:
        return observed, status
    try:
        report = evaluate(observed)
        crew_harness.assert_scrubbed(report)
    except ValueError:
        return crew_harness.failure(SPIKE, "crew_test_harness_unsafe_report"), 2
    return report, 0 if not report["failedChecks"] else 1


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    report, status = run_probe()
    return crew_harness.emit(report, status, FIXTURE, args)


if __name__ == "__main__":
    raise SystemExit(main())
