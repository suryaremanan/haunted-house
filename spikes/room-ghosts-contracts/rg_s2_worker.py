"""RG-S2 worker: what Crew does with the Room Ghost profiles' resources.

Runs under Crew's own Python with ``HOME`` pointed at an ephemeral folder.  It
installs a staged copy of the real ``app/`` tree with Crew's packaged
``install_app``, registers it untrusted and trusted with ``register_app``, and
asks Crew's packaged launch projection (``native_skill_view``) and
session-label builder what a Kiro launch of each registered profile would
carry.  No gateway, no session, no kiro-cli; the operator's Crew home is never
read or written.  Stdout is one scrubbed JSON object of booleans and fixed
names; a failure collapses to a stable code.
"""
from __future__ import annotations

import copy
import json
import os
import sys
from pathlib import Path
from typing import Any

APP = "haunted-house"
MVP_ROLES = ("archivist", "draughtsman", "foreman", "tinker")
STRETCH_ROLE = "medium"
SKILLS = {
    "archivist": "ears-requirements",
    "draughtsman": "correctness-design",
    "foreman": "executable-tasks",
    "tinker": "scoped-implementation",
}
STRETCH_SKILL = "bounded-review"
STEERING = "file://.kiro/steering/**/*.md"
CREW_SERVER = "kirocrew-core"
SEARCH_TOOL = "@kirocrew-core/skill_search"
CARRIED_KEYS = (
    "tools",
    "allowedTools",
    "excludedTools",
    "includeMcpJson",
    "includePowers",
    "resources",
    "permissions",
    "prompt",
)


class ProbeFailure(RuntimeError):
    """A stable, path-free probe failure."""


def _require(condition: bool, code: str) -> None:
    if not condition:
        raise ProbeFailure(code)


def _read(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    _require(isinstance(value, dict), "unexpected_json_shape")
    return value


def _auto_approve(node: object) -> bool:
    if isinstance(node, dict):
        return any(
            "autoapprove" in "".join(ch for ch in str(key).lower() if ch.isalpha()) or _auto_approve(value)
            for key, value in node.items()
        )
    return isinstance(node, list) and any(_auto_approve(item) for item in node)


def _registration(source: Path, agents_dir: Path, skills_dir: Path, app_root: Path, trusted: Any) -> dict[str, bool]:
    """What Crew wrote for the manifest's agents and skills."""
    registered = {role: _read(agents_dir / f"{APP}--hh-{role}.json") for role in MVP_ROLES}
    authored = {role: _read(source / "agents" / f"hh-{role}.json") for role in MVP_ROLES}
    namespaced = skills_dir / APP
    links = sorted(p.name for p in namespaced.iterdir()) if namespaced.is_dir() else []
    installed_skills = Path(os.path.realpath(app_root / "skills"))
    return {
        "exactlyDeclaredAgentsRegistered": trusted.agents == [f"{APP}/hh-{role}" for role in MVP_ROLES],
        "undeclaredMediumProfileNotRegistered": (source / "agents" / f"hh-{STRETCH_ROLE}.json").is_file()
        and not any(STRETCH_ROLE in entry.name for entry in agents_dir.iterdir()),
        "authoredProfileFieldsCarriedVerbatim": all(
            registered[role].get(key) == authored[role].get(key)
            for role in MVP_ROLES
            for key in CARRIED_KEYS
        ),
        "steeringResourceStaysRelative": all(
            registered[role].get("resources") == [STEERING] for role in MVP_ROLES
        ),
        "noSkillUriInRegisteredProfile": not any(
            isinstance(item, str) and item.startswith("skill://")
            for role in MVP_ROLES
            for item in registered[role].get("resources", [])
        ),
        "noAutoApproveWritten": not any(_auto_approve(spec) for spec in registered.values()),
        "exactlyDeclaredSkillsLinked": links == sorted(SKILLS.values()),
        "skillLinksResolveInsideInstalledApp": all(
            Path(os.path.realpath(namespaced / name)) == installed_skills / name
            and (namespaced / name / "SKILL.md").is_file()
            for name in SKILLS.values()
        ),
        "undeclaredMediumSkillNotLinked": (source / "skills" / STRETCH_SKILL / "SKILL.md").is_file()
        and not (namespaced / STRETCH_SKILL).exists()
        and not (skills_dir / STRETCH_SKILL).exists(),
        # A declared skill also gets a flat link, so it joins the owner's own
        # skill catalog.  Recorded because it is visible to the owner.
        "declaredSkillsAlsoLinkedFlat": all((skills_dir / name / "SKILL.md").is_file() for name in SKILLS.values()),
    }


def _view(spec: dict[str, Any], source: Path, agent: str) -> tuple[dict[str, Any] | None, bool, bool]:
    from kiro_crew.agent_sdk.drivers.acp import native_skill_view
    from kiro_crew.config.paths import data_home

    view, search, refusal = native_skill_view(
        spec, source, agent, crew_home_id=data_home().absolute().as_posix()
    )
    return view, bool(search), refusal is not None


def _launch_view(agents_dir: Path) -> tuple[dict[str, bool], dict[str, list[str]]]:
    """Crew's launch projection of each registered profile, and three counterfactuals."""
    from kiro_crew.agent_discovery import can_inherit_skills

    exact = no_core = keeps_steering = not_search = True
    visible: dict[str, list[str]] = {}
    for role in MVP_ROLES:
        path = agents_dir / f"{APP}--hh-{role}.json"
        spec = _read(path)
        view, search, refused = _view(spec, path, f"hh-{role}")
        _require(view is not None and not refused, "launch_view_refused")
        assert view is not None
        visible[role] = [tool for tool in view.get("tools", []) if isinstance(tool, str)]
        exact &= view.get("tools") == spec["tools"] and all(
            tool.startswith(f"@{APP}:room-{role}/") for tool in visible[role]
        )
        no_core &= CREW_SERVER not in view.get("mcpServers", {})
        keeps_steering &= view.get("resources") == [STEERING]
        not_search &= not search

    path = agents_dir / f"{APP}--hh-archivist.json"
    spec = _read(path)
    agent = "hh-archivist"

    unexcluded = copy.deepcopy(spec)
    del unexcluded["excludedTools"]
    inherited_view, inherited_search, _ = _view(unexcluded, path, agent)
    _require(inherited_view is not None, "counterfactual_view_missing")
    assert inherited_view is not None

    mapped = copy.deepcopy(unexcluded)
    mapped["resources"].append("skill://.kiro/skills/*/SKILL.md")
    mapped_view, mapped_search, _ = _view(mapped, path, agent)
    _require(mapped_view is not None, "counterfactual_view_missing")
    assert mapped_view is not None

    both = copy.deepcopy(spec)
    both["resources"].append("skill://.kiro/skills/*/SKILL.md")
    both_view, _, both_refused = _view(both, path, agent)

    checks = {
        "viewToolsAreExactlyTheRoomCatalog": exact,
        "viewMountsNoCrewSkillServer": no_core,
        "viewKeepsSteeringResource": keeps_steering,
        "viewIsNotASkillSearchAgent": not_search,
        "exclusionStopsInheritedSkills": can_inherit_skills(spec) is False,
        # Why the profile carries the exclusion and no skill:// entry:
        "withoutExclusionCrewAddsSkillSearchTool": SEARCH_TOOL in inherited_view.get("tools", [])
        and CREW_SERVER in inherited_view.get("mcpServers", {})
        and not inherited_search,
        "skillUriIsDroppedAndReplacedBySearchTool": mapped_search
        and SEARCH_TOOL in mapped_view.get("tools", [])
        and not any(
            isinstance(item, str) and item.startswith("skill://") for item in mapped_view.get("resources", [])
        ),
        "skillUriWithExclusionRefusesTheView": both_view is None and both_refused,
    }
    return checks, visible


def _resource_forms(agents_dir: Path, skills_dir: Path, work: Path) -> tuple[dict[str, bool], str]:
    """How Crew expands the two skill:// forms an app profile could have used."""
    from kiro_crew.agent_discovery import expand_skill_uri

    home = Path(os.path.realpath(Path.home()))
    spec_path = agents_dir / f"{APP}--hh-archivist.json"
    mansion = work / "mansion"
    mansion.mkdir()
    relative = expand_skill_uri("skill://.kiro/skills/x/SKILL.md", spec_path, project_dir=str(mansion))
    namespaced = Path(os.path.realpath(skills_dir)) / APP
    rel_home = namespaced.relative_to(home).as_posix()
    form = f"skill://~/{rel_home}/<skill>/SKILL.md"
    name = SKILLS["archivist"]
    expanded = expand_skill_uri(form.replace("<skill>", name), spec_path, project_dir=str(mansion))
    checks = {
        "relativeSkillUriResolvesInSessionProject": relative is not None
        and Path(relative) == mansion / ".kiro" / "skills" / "x" / "SKILL.md",
        "homeSkillUriNamesTheInstalledSkill": expanded is not None
        and Path(os.path.realpath(expanded)) == Path(os.path.realpath(namespaced / name / "SKILL.md")),
        "noAppRelativeSkillUriForm": expand_skill_uri(
            f"skill://skills/{name}/SKILL.md", spec_path, project_dir=str(mansion)
        )
        == str(mansion / "skills" / name / "SKILL.md"),
    }
    return checks, form


def _label(work: Path) -> dict[str, bool]:
    """Only the profile's own room server is re-declared per session (S9 seam)."""
    from kiro_crew.acp.session_label import kiro_session_label_elements

    only_own = True
    for role in MVP_ROLES:
        built = kiro_session_label_elements(
            f"hh-{role}", work_dir=str(work), session_key=f"dashboard:hh-rg-s2-{role}"
        )
        only_own &= [item["name"] for item in built] == [f"{APP}:room-{role}"]
    return {"onlyOwnRoomServerIsLabelledPerSession": only_own}


def run(source: Path, work: Path) -> dict[str, Any]:
    from kiro_crew import __version__ as crew_version
    from kiro_crew.apps import bridges
    from kiro_crew.apps.bridges_mcp_config import _mcp_json_path
    from kiro_crew.apps.bridges_sources import _skills_dir
    from kiro_crew.apps.manager import app_dir, install_app
    from kiro_crew.config.paths import config_dir, data_home

    home = Path(os.path.realpath(Path.home()))
    agents_dir = _mcp_json_path().parent
    skills_dir = _skills_dir()
    for location in (agents_dir, skills_dir, data_home(), config_dir()):
        _require(home in Path(os.path.realpath(location)).parents, "crew_home_not_isolated")

    manifest = _read(source / "app.json")
    _require(install_app(str(source)).ok, "install_failed")
    untrusted = bridges.register_app(APP)
    written = [entry.name for entry in agents_dir.iterdir()] if agents_dir.is_dir() else []
    trust_gate = (
        untrusted.agents == []
        and not any(name.startswith(APP) for name in written)
        and not (skills_dir / APP).exists()
    )
    config_dir().mkdir(parents=True, exist_ok=True)
    (config_dir() / "config.json").write_text(
        json.dumps({"agent": {"apps_trusted": [APP], "apps_trusted_local": [APP]}}), encoding="utf-8"
    )
    trusted = bridges.register_app(APP)
    _require(trusted.errors == [], "trusted_registration_failed")

    registration = _registration(source, agents_dir, skills_dir, app_dir(APP), trusted)
    registration["untrustedAppRegistersNoAgentOrSkill"] = trust_gate
    view, visible = _launch_view(agents_dir)
    forms, skill_form = _resource_forms(agents_dir, skills_dir, work)
    return {
        "crewVersion": crew_version,
        "isolatedHome": True,
        "registration": registration,
        "launchView": view,
        "resourceForms": forms,
        "label": _label(work),
        "observed": {
            "declaredAgents": manifest.get("agents"),
            "declaredSkills": manifest.get("skills"),
            "visibleTools": visible,
            "installedSkillUriForm": skill_form,
        },
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
