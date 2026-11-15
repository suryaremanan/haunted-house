"""Room Ghosts role contracts: what each Agent_Profile and Room_Skill must be.

One table binds a role to its agent file, room MCP server, exact tool
selectors, Room_Skill, artifact, and final-response contract.  Three pure
validators judge the shipped resources against it:

* :func:`validate_agent_profile` - one ``app/agents/hh-<role>.json`` object;
* :func:`validate_room_skill` - one ``app/skills/<name>/SKILL.md`` text;
* :func:`validate_manifest_resources` - the manifest's agent, skill, and MCP
  catalog, and that every reference resolves to a role in this table.

Decisions fixed here come from verified spikes, not preference:

* S9: exact ``@haunted-house:room-<role>/<tool>`` selectors of the profile's
  own room server, an empty ``allowedTools``, and no ``mcpServers`` block in
  an agent file (Crew copies one unresolved).
* RG-S2: Crew's launch projection drops every ``skill://`` resource and
  mounts its own skill-search tool instead, and it mounts that tool for a
  profile with no ``skill://`` entry too (inherited skill trees).  Either way
  the Ghost would see a tool outside its room catalog, and a profile that
  both maps a skill and excludes the tool is refused its turn.  So a profile
  lists the Mansion steering ``file://`` resource only, excludes Crew's
  skill-search server, and names its Room_Skill in the role prompt; the
  backend delivers the skill text inside the bounded assignment prompt
  (``skill_block``).  Nothing is inherited implicitly.

The Medium is stretch scope: its profile and skill ship and are validated,
but the manifest declares them only when the Séance Room is enabled, so by
default Crew registers neither.

A validator returns ``ProfileFinding`` values with a stable code and a
location made of known names.  Authored text never appears in a finding.

Pure: no I/O, no clock, standard library only.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Final

from haunted_house.core.ghost_result import GhostResultError, GhostStatus, parse_ghost_result
from haunted_house.core.room_catalog import (
    APP_NAME,
    ROLES,
    ROOM_ENV,
    SERVER_BY_ROLE,
    SESSION_LABEL_ENV,
    TOOLS_BY_ROLE,
)

__all__ = [
    "ALL_ROLES",
    "CHANGES_REQUESTED",
    "CREW_SKILL_SERVER",
    "MAX_PROMPT_CHARS",
    "MAX_SKILL_BYTES",
    "MCP_LAUNCHER",
    "MVP_ROLES",
    "PROFILE_KEYS",
    "REQUIRED_DENIES",
    "SKILL_SECTIONS",
    "STEERING_RESOURCE",
    "STRETCH_ROLES",
    "ProfileFinding",
    "RoleContract",
    "auto_approve_paths",
    "expected_agent_paths",
    "expected_mcp_servers",
    "expected_skill_paths",
    "role_contract",
    "role_for_skill",
    "skill_block",
    "skill_body",
    "validate_agent_profile",
    "validate_manifest_resources",
    "validate_room_skill",
]

MVP_ROLES: Final = ROLES
STRETCH_ROLES: Final = ("medium",)
ALL_ROLES: Final = (*MVP_ROLES, *STRETCH_ROLES)

# The one resource every profile lists.  It is relative, so kiro-cli resolves
# it in the session's working folder: the Mansion the app set as the project.
STEERING_RESOURCE: Final = "file://.kiro/steering/**/*.md"
# Crew's managed server that would otherwise add a skill-search tool (RG-S2).
CREW_SKILL_SERVER: Final = "@kirocrew-core"
MCP_LAUNCHER: Final = "mcp/server.py"

MAX_PROMPT_CHARS: Final = 4000
MAX_DESCRIPTION_CHARS: Final = 200
# A skill travels inside one bounded assignment prompt.
MAX_SKILL_BYTES: Final = 12 * 1024
MAX_SKILL_NAME_CHARS: Final = 64
MAX_SKILL_DESCRIPTION_CHARS: Final = 1024

PROFILE_KEYS: Final = frozenset(
    {
        "name",
        "description",
        "model",
        "prompt",
        "tools",
        "allowedTools",
        "excludedTools",
        "includeMcpJson",
        "includePowers",
        "resources",
        "permissions",
    }
)
# Whole capabilities every Ghost is denied, with the match the rule must have
# (``None``: no match, so the rule covers every use).
REQUIRED_DENIES: Final[Mapping[str, tuple[str, ...] | None]] = {
    "fs_write": ("**",),
    "shell": None,
    "web_fetch": None,
    "web_search": None,
    "subagent": None,
    "power": None,
    "skill": None,
}
_FORBIDDEN_BLOCKS: Final = ("mcpServers", "toolsSettings", "hooks", "toolAliases", "knowledgeBase")

SKILL_SECTIONS: Final = (
    "When to use",
    "Checklist",
    "Artifact grammar",
    "Repair",
    "Final response",
)
_SKILL_FRONTMATTER_KEYS: Final = frozenset({"name", "description"})
# The Medium's verdict rides in a Ghost_Result: ready is a pass, failed with
# this reason asks for changes, and its summary lists the findings.
CHANGES_REQUESTED: Final = "changes_requested"
_REVIEW_FINDINGS = re.compile(
    r"F[1-5] \[criteria [1-9][0-9]{0,2}\.[1-9][0-9]{0,2}(?:, [1-9][0-9]{0,2}\.[1-9][0-9]{0,2})*\] \[[^\]\s]+\] \S"
)

_SELECTOR = re.compile(r"@([a-z0-9-]+):([a-z0-9-]+)/([a-z_]+)")
_BROAD_TOOL = re.compile(
    r"\*|^@builtin$|^@mcp$|^@[a-z0-9:-]+$"
    r"|^(?:read|write|shell|web|subagent|knowledge|code|fs_\w+|execute_\w+|use_\w+)$"
)
_SKILL_NAME = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
_FRONTMATTER_LINE = re.compile(r"([A-Za-z][A-Za-z0-9_-]*):[ \t]+(\S.*)")
_HEADING = re.compile(r"(#{1,6}) +(.*?)\s*")
_FENCE = "```"

# Text a model reads must not tell it to leave the room tools, and must not
# carry anything that looks like authority, a host path, or a credential.
_FORBIDDEN_TEXT: Final[tuple[tuple[str, re.Pattern[str]], ...]] = (
    # The Kiro chat command, not a path such as .kiro/specs/.
    ("native_spec_command", re.compile(r"(?<![A-Za-z0-9_./-])/spec(?![A-Za-z0-9_/-])")),
    ("spawn_route", re.compile(r"/api/spawn")),
    ("auto_approve", re.compile(r"auto[\s_-]*approv", re.IGNORECASE)),
    (
        "builtin_tool_instruction",
        re.compile(r"\b(?:fs_write|fs_read|execute_bash|execute_cmd|use_subagent|web_fetch|web_search)\b"),
    ),
    (
        "authority_token",
        re.compile(r"KIROCREW_|HH_ROOM|X-HH-|X-KiroCrew|\$\{|secret://|claim_id|approval_id"),
    ),
    ("host_path", re.compile(r"/Users/|/home/|~/|\b[A-Za-z]:\\|file:///")),
    ("credential_shape", re.compile(r"[0-9a-f]{32}", re.IGNORECASE)),
)
# A digest in an example is 64 zeros or a repeated marker, never a real value.
_EXAMPLE_DIGEST = re.compile(r'"sha256"\s*:\s*"[0-9a-f]{64}"')


@dataclass(frozen=True, slots=True)
class ProfileFinding:
    """One broken contract rule: stable code, known-name location, fixed message."""

    code: str
    location: str
    message: str


@dataclass(frozen=True, slots=True)
class RoleContract:
    """Everything fixed about one Room Ghost role."""

    role: str
    agent_name: str
    agent_path: str
    server: str
    tools: tuple[str, ...]
    selectors: tuple[str, ...]
    skill: str
    skill_path: str
    # The Spec_Document a ready result names, or ``None``.
    artifact: str | None
    stretch: bool


_SKILL_BY_ROLE: Final[Mapping[str, str]] = {
    "archivist": "ears-requirements",
    "draughtsman": "correctness-design",
    "foreman": "executable-tasks",
    "tinker": "scoped-implementation",
    "medium": "bounded-review",
}
_ARTIFACT_BY_ROLE: Final[Mapping[str, str | None]] = {
    "archivist": "requirements.md",
    "draughtsman": "design.md",
    "foreman": "tasks.md",
    "tinker": None,
    "medium": None,
}
# The Medium reviews and never mutates: it has the two read tools only.  A
# guarded test run arrives with the stretch review loop, through Spec 4.
_STRETCH_TOOLS: Final[Mapping[str, tuple[str, ...]]] = {
    "medium": ("list_room_files", "read_room_file"),
}


def _server(role: str) -> str:
    return SERVER_BY_ROLE.get(role, f"room-{role}")


def role_contract(role: str) -> RoleContract:
    if role not in ALL_ROLES:
        raise KeyError(role)
    tools = TOOLS_BY_ROLE[role] if role in TOOLS_BY_ROLE else _STRETCH_TOOLS[role]
    server = _server(role)
    skill = _SKILL_BY_ROLE[role]
    return RoleContract(
        role=role,
        agent_name=f"hh-{role}",
        agent_path=f"agents/hh-{role}.json",
        server=server,
        tools=tools,
        selectors=tuple(f"@{APP_NAME}:{server}/{tool}" for tool in tools),
        skill=skill,
        skill_path=f"skills/{skill}",
        artifact=_ARTIFACT_BY_ROLE[role],
        stretch=role in STRETCH_ROLES,
    )


def role_for_skill(skill: str) -> str | None:
    for role, name in _SKILL_BY_ROLE.items():
        if name == skill:
            return role
    return None


def _enabled_roles(seance_enabled: bool) -> tuple[str, ...]:
    return ALL_ROLES if seance_enabled else MVP_ROLES


def expected_agent_paths(*, seance_enabled: bool = False) -> list[str]:
    return [role_contract(role).agent_path for role in _enabled_roles(seance_enabled)]


def expected_skill_paths(*, seance_enabled: bool = False) -> list[str]:
    return [role_contract(role).skill_path for role in _enabled_roles(seance_enabled)]


def expected_mcp_servers(*, seance_enabled: bool = False) -> dict[str, Any]:
    """One stdio server per enabled room, in the S9 launch shape."""

    return {
        _server(role): {
            "command": "python3",
            "args": [MCP_LAUNCHER],
            "env": {ROOM_ENV: role},
            "x-kirocrew-session-label": True,
        }
        for role in _enabled_roles(seance_enabled)
    }


def auto_approve_paths(node: object, where: str = "") -> list[str]:
    """Every key, at any depth, spelled like ``autoApprove``."""

    found: list[str] = []
    if isinstance(node, dict):
        for key, value in node.items():
            here = f"{where}.{key}" if where else str(key)
            if "autoapprove" in re.sub(r"[^a-z]", "", str(key).lower()):
                found.append(here)
            found.extend(auto_approve_paths(value, here))
    elif isinstance(node, list):
        for index, item in enumerate(node):
            found.extend(auto_approve_paths(item, f"{where}[{index}]"))
    return found


def _forbidden_text(text: str, where: str) -> list[ProfileFinding]:
    scrubbed = _EXAMPLE_DIGEST.sub('"sha256":"example"', text)
    return [
        ProfileFinding(code, where, "model-visible text must not contain this kind of instruction or token")
        for code, pattern in _FORBIDDEN_TEXT
        if pattern.search(scrubbed)
    ]


def _is_text(value: object, limit: int) -> bool:
    return type(value) is str and bool(value.strip()) and len(value) <= limit


# --- Agent_Profile ----------------------------------------------------------------


def validate_agent_profile(profile: object, role: str) -> tuple[ProfileFinding, ...]:
    """Judge one profile object against ``role``'s contract.  Empty means valid."""

    contract = role_contract(role)
    if type(profile) is not dict or not all(type(key) is str for key in profile):
        return (ProfileFinding("profile_not_object", "profile", "a profile is one JSON object"),)
    out: list[ProfileFinding] = []

    def add(code: str, where: str, message: str) -> None:
        out.append(ProfileFinding(code, where, message))

    if set(profile) - PROFILE_KEYS:
        add("unknown_key", "profile", "only the contract's profile fields are allowed")
    for key in _FORBIDDEN_BLOCKS:
        if key in profile:
            add("forbidden_block", key, "a Ghost profile declares no server, hook, or tool setting")
    if profile.get("name") != contract.agent_name:
        add("name_mismatch", "name", "the profile name must be the role's agent name")
    if not _is_text(profile.get("description"), MAX_DESCRIPTION_CHARS):
        add("text_required", "description", "a short description is required")
    if "model" in profile and not _is_text(profile["model"], 64):
        add("text_required", "model", "model must be a short name when present")

    # Exact own-room selectors, nothing else (S9).
    tools = profile.get("tools")
    if tools != list(contract.selectors):
        add("tools_not_exact", "tools", "tools must be exactly the role's room catalog, in order")
    for tool in tools if isinstance(tools, list) else []:
        if type(tool) is not str or _BROAD_TOOL.search(tool):
            add("broad_tool", "tools", "wildcards, tags, whole servers, and built-in tools are not allowed")
            continue
        match = _SELECTOR.fullmatch(tool)
        if match is None or match.group(1) != APP_NAME or match.group(2) != contract.server:
            add("foreign_tool", "tools", "a tool must belong to this Ghost's own room server")

    # No approval shortcut and nothing inherited.
    if profile.get("allowedTools") != []:
        add("allowed_tools_not_empty", "allowedTools", "the compatibility grant must be an empty list")
    for _where in auto_approve_paths(profile):
        add("auto_approve_present", "profile", "no automatic approval field is allowed at any depth")
    if profile.get("includeMcpJson") is not False:
        add("inherited_mcp_enabled", "includeMcpJson", "inherited MCP configuration must be off")
    if profile.get("includePowers") is not False:
        add("powers_enabled", "includePowers", "inherited Powers must be off")
    if profile.get("excludedTools") != [CREW_SKILL_SERVER]:
        add(
            "skill_search_not_excluded",
            "excludedTools",
            "Crew's skill-search server must be excluded so the room catalog is the whole tool set",
        )

    # Explicit resources: the Mansion steering glob and nothing else (RG-S2).
    resources = profile.get("resources")
    listed = resources if isinstance(resources, list) else []
    if STEERING_RESOURCE not in listed:
        add("steering_resource_missing", "resources", "the Mansion steering resource must be listed")
    for resource in listed:
        if type(resource) is str and resource.startswith("skill://"):
            add(
                "skill_uri_not_supported",
                "resources",
                "Crew replaces a skill resource with a tool outside the room catalog",
            )
        elif resource != STEERING_RESOURCE:
            add("resource_not_allowed", "resources", "only the Mansion steering resource is allowed")
    if not isinstance(resources, list):
        add("resources_not_list", "resources", "resources must be a list")

    out.extend(_prompt_findings(profile.get("prompt"), contract))
    out.extend(_rule_findings(profile.get("permissions"), contract))
    return tuple(dict.fromkeys(out))


def _prompt_findings(prompt: object, contract: RoleContract) -> list[ProfileFinding]:
    if not _is_text(prompt, MAX_PROMPT_CHARS):
        return [ProfileFinding("text_required", "prompt", "a bounded role prompt is required")]
    assert isinstance(prompt, str)
    out = _forbidden_text(prompt, "prompt")
    # The profile names its Room_Skill; the backend delivers that skill's text.
    if f"Room_Skill {contract.skill}" not in prompt:
        out.append(
            ProfileFinding("skill_reference_missing", "prompt", "the role prompt must name its Room_Skill")
        )
    if "Ghost_Result" not in prompt or "schema_version" not in prompt:
        out.append(
            ProfileFinding(
                "output_contract_missing", "prompt", "the role prompt must state its final-response contract"
            )
        )
    for tool in contract.tools:
        if tool not in prompt:
            out.append(
                ProfileFinding("tool_not_explained", "prompt", "the role prompt must name every room tool")
            )
            break
    return out


def _rule_findings(permissions: object, contract: RoleContract) -> list[ProfileFinding]:
    where = "permissions.rules"
    rules = permissions.get("rules") if type(permissions) is dict else None
    if type(rules) is not list:
        return [ProfileFinding("rules_missing", where, "V3 permission rules are required")]
    assert isinstance(permissions, dict)
    out: list[ProfileFinding] = []
    if set(permissions) != {"rules"}:
        out.append(ProfileFinding("policy_preset", "permissions", "only explicit rules are allowed"))
    denies: dict[str, list[object]] = {}
    for rule in rules:
        if type(rule) is not dict or not set(rule) <= {"capability", "match", "effect"}:
            out.append(ProfileFinding("rule_shape", where, "a rule has capability, match, and effect only"))
            continue
        if rule.get("effect") != "deny":
            out.append(ProfileFinding("non_deny_rule", where, "a Ghost profile carries deny rules only"))
            continue
        capability = rule.get("capability")
        if type(capability) is str:
            denies.setdefault(capability, []).append(rule.get("match"))
    for capability, match in REQUIRED_DENIES.items():
        want = None if match is None else list(match)
        if capability not in denies:
            out.append(ProfileFinding("required_deny_missing", where, "a required whole-capability deny is missing"))
        elif want not in denies[capability]:
            out.append(ProfileFinding("deny_too_narrow", where, "a required deny must cover every use"))
    others = sorted(
        f"{APP_NAME}:{SERVER_BY_ROLE[other]}/*" for other in MVP_ROLES if other != contract.role
    )
    mcp = [sorted(match) for match in denies.get("mcp", []) if isinstance(match, list)]
    if others not in mcp:
        out.append(
            ProfileFinding("other_room_not_denied", where, "every other room's MCP server must be denied")
        )
    return out


# --- Room_Skill -------------------------------------------------------------------


def _split_skill(text: str) -> tuple[dict[str, str], str] | None:
    """Frontmatter and body of a ``SKILL.md``, or ``None`` when malformed."""

    lines = text.split("\n")
    if not lines or lines[0] != "---":
        return None
    try:
        end = lines.index("---", 1)
    except ValueError:
        return None
    front: dict[str, str] = {}
    for line in lines[1:end]:
        match = _FRONTMATTER_LINE.fullmatch(line)
        if match is None or match.group(1) in front:
            return None
        front[match.group(1)] = match.group(2).strip()
    return front, "\n".join(lines[end + 1 :])


def skill_body(text: str) -> str | None:
    """The instructions of a ``SKILL.md`` without its frontmatter."""

    parts = _split_skill(text) if type(text) is str else None
    return None if parts is None else parts[1].strip("\n") + "\n"


def skill_block(role: str, text: str) -> str:
    """The delimited block that carries a role's Room_Skill in a prompt.

    Raises ``ValueError`` for a skill that does not pass
    :func:`validate_room_skill`, so an edited or foreign file is never sent.
    """

    contract = role_contract(role)
    if validate_room_skill(text, role, contract.skill):
        raise ValueError("room skill")
    body = skill_body(text)
    assert body is not None
    return f'<room-skill name="{contract.skill}">\n{body}</room-skill>\n'


def _sections(body: str) -> dict[str, str]:
    """Level-two sections of a skill body, outside fenced code."""

    found: dict[str, list[str]] = {}
    current: list[str] | None = None
    fenced = False
    for line in body.split("\n"):
        if line.startswith(_FENCE):
            fenced = not fenced
        match = None if fenced else _HEADING.fullmatch(line)
        if match is not None and len(match.group(1)) == 2:
            current = found.setdefault(match.group(2), [])
            continue
        if current is not None:
            current.append(line)
    return {title: "\n".join(lines) for title, lines in found.items()}


def _json_examples(section: str) -> list[str]:
    examples: list[str] = []
    block: list[str] | None = None
    for line in section.split("\n"):
        if block is None:
            if line.strip() == _FENCE + "json":
                block = []
        elif line.strip() == _FENCE:
            examples.append("\n".join(block))
            block = None
        else:
            block.append(line)
    return examples


def _example_findings(examples: list[str], contract: RoleContract) -> list[ProfileFinding]:
    where = "section:Final response"
    statuses: set[str] = set()
    reasons: set[str | None] = set()
    out: list[ProfileFinding] = []
    out_of_role = ProfileFinding(
        "example_out_of_role", where, "an example must name only what the role may produce"
    )
    for text in examples:
        try:
            result = parse_ghost_result(text)
        except GhostResultError:
            out.append(
                ProfileFinding("example_invalid", where, "every final-response example must satisfy the codec")
            )
            continue
        statuses.add(result.status.value)
        reasons.add(result.reason_code)
        paths = [item.path for item in result.artifacts]
        if contract.role == "medium":
            # A review changes nothing; requested changes are listed in the summary.
            fits = result.task_id is None and not paths
            if result.reason_code == CHANGES_REQUESTED:
                fits = fits and _REVIEW_FINDINGS.match(result.summary) is not None
        elif result.status is not GhostStatus.READY:
            fits = True
        elif contract.artifact is not None:
            fits = (
                result.task_id is None
                and len(paths) == 1
                and paths[0].startswith(".kiro/specs/")
                and paths[0].endswith("/" + contract.artifact)
            )
        else:
            fits = (
                result.task_id is not None
                and bool(paths)
                and not any(path.startswith(".kiro/") for path in paths)
            )
        if not fits:
            out.append(out_of_role)
    missing = not {status.value for status in GhostStatus} <= statuses
    if contract.role == "medium" and CHANGES_REQUESTED not in reasons:
        missing = True
    if missing:
        out.append(
            ProfileFinding("example_missing", where, "show one example of every outcome the role may report")
        )
    return out


def validate_room_skill(text: object, role: str, folder: str) -> tuple[ProfileFinding, ...]:
    """Judge one ``SKILL.md`` for ``role`` stored in directory ``folder``."""

    contract = role_contract(role)
    if type(text) is not str:
        return (ProfileFinding("skill_not_text", "skill", "a skill is UTF-8 text"),)
    try:
        size = len(text.encode("utf-8"))
    except UnicodeEncodeError:
        return (ProfileFinding("skill_not_text", "skill", "a skill is UTF-8 text"),)
    if size > MAX_SKILL_BYTES:
        return (ProfileFinding("skill_too_large", "skill", "a skill must fit one bounded prompt"),)
    parts = _split_skill(text)
    if parts is None:
        return (
            ProfileFinding(
                "frontmatter_invalid", "frontmatter", "a skill starts with name and description frontmatter"
            ),
        )
    front, body = parts
    out: list[ProfileFinding] = []

    def add(code: str, where: str, message: str) -> None:
        out.append(ProfileFinding(code, where, message))

    if set(front) != _SKILL_FRONTMATTER_KEYS:
        add("frontmatter_keys", "frontmatter", "frontmatter holds exactly name and description")
    name = front.get("name", "")
    if _SKILL_NAME.fullmatch(name) is None or len(name) > MAX_SKILL_NAME_CHARS:
        add("skill_name_invalid", "frontmatter", "a skill name is lowercase kebab-case")
    if name != folder:
        add("skill_folder_mismatch", "frontmatter", "the skill name must equal its directory name")
    if name != contract.skill or folder != contract.skill:
        add("skill_role_mismatch", "frontmatter", "this is not the role's Room_Skill")
    if not _is_text(front.get("description"), MAX_SKILL_DESCRIPTION_CHARS):
        add("skill_description_invalid", "frontmatter", "a bounded description is required")

    out.extend(_forbidden_text(text, "skill"))
    if "<room-skill" in text or "</room-skill" in text:
        add("delimiter_in_skill", "skill", "a skill must not contain the prompt delimiter")
    sections = _sections(body)
    for title in SKILL_SECTIONS:
        if not sections.get(title, "").strip():
            add("section_missing", f"section:{title}", "a required skill section is missing or empty")
    checklist = sections.get("Checklist", "")
    if not re.search(r"(?m)^- \[ \] \S", checklist):
        add("checklist_missing", "section:Checklist", "the checklist needs at least one checkbox item")
    final = sections.get("Final response", "")
    if "Ghost_Result" not in final:
        add("output_contract_missing", "section:Final response", "name the final-response contract")
    if final.strip():
        out.extend(_example_findings(_json_examples(final), contract))
    if contract.artifact is not None and contract.artifact not in body:
        add("artifact_not_named", "skill", "the skill must name the role's Spec_Document")
    if contract.role == "medium" and "three" not in sections.get("Repair", "").lower():
        add("review_bound_missing", "section:Repair", "the review skill must state the three-cycle bound")
    return tuple(dict.fromkeys(out))


# --- manifest ---------------------------------------------------------------------


def validate_manifest_resources(
    manifest: object, *, seance_enabled: bool = False
) -> tuple[ProfileFinding, ...]:
    """Judge the manifest's agent, skill, and MCP catalog.

    The catalog must be exactly the enabled roles' resources: every declared
    agent has its skill and its room server declared, nothing else is
    declared, and no spawn grant or automatic approval exists anywhere.
    """

    if type(manifest) is not dict:
        return (ProfileFinding("manifest_not_object", "manifest", "a manifest is one JSON object"),)
    out: list[ProfileFinding] = []

    def add(code: str, where: str, message: str) -> None:
        out.append(ProfileFinding(code, where, message))

    for key in ("resources", "lifecycle"):
        if manifest.get(key) != "gateway":
            add("not_gateway_managed", key, "resources and lifecycle are gateway-managed")
    if manifest.get("agents") != expected_agent_paths(seance_enabled=seance_enabled):
        add("agents_not_exact", "agents", "agents must be exactly the enabled role profiles, in order")
    if manifest.get("skills") != expected_skill_paths(seance_enabled=seance_enabled):
        add("skills_not_exact", "skills", "skills must be exactly the enabled roles' Room_Skills, in order")
    if manifest.get("mcpServers") != expected_mcp_servers(seance_enabled=seance_enabled):
        add("mcp_servers_not_exact", "mcpServers", "one S9-shaped server per enabled room, nothing else")
    servers = manifest.get("mcpServers")
    for entry in servers.values() if isinstance(servers, dict) else ():
        env = entry.get("env") if isinstance(entry, dict) else None
        if isinstance(env, dict) and SESSION_LABEL_ENV in env:
            add("session_label_preset", "mcpServers", "only Crew sets the session label")

    # Referential integrity: an agent without its skill or server, or a skill
    # or server without its agent, is a broken catalog whatever the flag says.
    agents = manifest.get("agents") if isinstance(manifest.get("agents"), list) else []
    skills = manifest.get("skills") if isinstance(manifest.get("skills"), list) else []
    declared = servers if isinstance(servers, dict) else {}
    by_agent = {role_contract(role).agent_path: role for role in ALL_ROLES}
    by_skill = {role_contract(role).skill_path: role for role in ALL_ROLES}
    by_server = {role_contract(role).server: role for role in ALL_ROLES}
    agent_roles = {by_agent.get(path) if type(path) is str else None for path in agents}
    skill_roles = {by_skill.get(path) if type(path) is str else None for path in skills}
    server_roles = {by_server.get(name) for name in declared}
    if None in agent_roles or None in skill_roles or None in server_roles:
        add("unknown_resource", "manifest", "every agent, skill, and server must belong to a known role")
    if not (agent_roles == skill_roles == server_roles):
        add("dangling_reference", "manifest", "each role's agent, skill, and server are declared together")

    permissions = manifest.get("permissions")
    api = permissions.get("api") if isinstance(permissions, dict) else None
    listed = [entry for entry in api if type(entry) is str] if isinstance(api, list) else []
    for required in ("/api/chat", "/api/chat/*"):
        if required not in listed:
            add("chat_grant_missing", "permissions.api", "app-owned sessions need both chat grants")
    if any("spawn" in entry or "approvals" in entry or entry in ("/api", "/api/*", "*") for entry in listed):
        add("forbidden_api_grant", "permissions.api", "no spawn, global-approval, or broad grant")
    if not isinstance(permissions, dict) or permissions.get("sessionApproval") is not True:
        add("session_approval_missing", "permissions", "sessionApproval must be true")
    if auto_approve_paths(manifest):
        add("auto_approve_present", "manifest", "no automatic approval field is allowed at any depth")
    return tuple(dict.fromkeys(out))
