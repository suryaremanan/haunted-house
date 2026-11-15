"""Room Ghosts role contracts against the shipped profiles, skills, and manifest.

Task 4.6 (Requirements 1.1-1.8, 2.8, 15.1, 15.5):

- every shipped ``app/agents/hh-<role>.json`` and ``app/skills/<name>/SKILL.md``
  passes its role contract, and each contract rule fires on a broken copy;
- the role table agrees with the Spec 4 room catalog and with the prompt
  builder, so profile, MCP server, and prompt name the same tools;
- every example a skill shows is accepted by the real codec or validator;
- the manifest declares exactly the enabled roles' agents, skills, and room
  servers, every reference resolves to a file, and the stretch Medium is
  declared only when the Séance Room is enabled;
- the profile decisions equal the recorded RG-S2 spike result.
"""

from __future__ import annotations

import copy
import json
import re
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

from haunted_house.adapters.room_skills import RoomSkillError, read_room_skill_block
from haunted_house.core import prompts
from haunted_house.core.artifact_validation import (
    extract_requirement_ids,
    validate_design,
    validate_requirements,
    validate_tasks,
)
from haunted_house.core.ghost_result import parse_ghost_result
from haunted_house.core.profile_contracts import (
    ALL_ROLES,
    CHANGES_REQUESTED,
    CREW_SKILL_SERVER,
    MAX_SKILL_BYTES,
    MVP_ROLES,
    SKILL_SECTIONS,
    STEERING_RESOURCE,
    STRETCH_ROLES,
    auto_approve_paths,
    expected_agent_paths,
    expected_mcp_servers,
    expected_skill_paths,
    role_contract,
    role_for_skill,
    skill_block,
    skill_body,
    validate_agent_profile,
    validate_manifest_resources,
    validate_room_skill,
)
from haunted_house.core.room_catalog import ROLES, TOOLS_BY_ROLE, tool_selectors

APP_ROOT = Path(__file__).resolve().parents[3]
REPO_ROOT = APP_ROOT.parent
AGENTS_DIR = APP_ROOT / "agents"
SKILLS_DIR = APP_ROOT / "skills"
RG_S2_FIXTURE = REPO_ROOT / "spikes" / "fixtures" / "rg-s2-app-resource-loading.json"


def load_json(path: Path) -> Any:
    def no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        keys = [key for key, _ in pairs]
        assert len(set(keys)) == len(keys), f"duplicate keys in {path.name}"
        return dict(pairs)

    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=no_duplicates)


def profile(role: str) -> dict[str, Any]:
    return load_json(APP_ROOT / role_contract(role).agent_path)


def skill_text(role: str) -> str:
    return (APP_ROOT / role_contract(role).skill_path / "SKILL.md").read_text(encoding="utf-8")


def codes(findings) -> set[str]:
    return {finding.code for finding in findings}


# --- the role table ---------------------------------------------------------------


def test_the_role_table_extends_the_spec_4_catalog_without_changing_it():
    assert MVP_ROLES == ROLES
    assert STRETCH_ROLES == ("medium",)
    assert ALL_ROLES == (*ROLES, "medium")
    for role in MVP_ROLES:
        contract = role_contract(role)
        assert contract.tools == TOOLS_BY_ROLE[role]
        assert contract.selectors == tool_selectors(role)
        assert not contract.stretch
    with pytest.raises(KeyError):
        role_contract("poltergeist")


def test_profile_prompt_builder_and_contract_name_the_same_tools():
    assert prompts.ROLES == ALL_ROLES
    assert role_contract("medium").tools == prompts.MEDIUM_TOOLS
    for role in ALL_ROLES:
        assert prompts.allowed_tools(role) == role_contract(role).tools


def test_each_role_has_one_distinct_skill_and_agent():
    contracts = [role_contract(role) for role in ALL_ROLES]
    assert len({c.skill for c in contracts}) == len({c.agent_path for c in contracts}) == 5
    assert [c.skill for c in contracts] == [
        "ears-requirements",
        "correctness-design",
        "executable-tasks",
        "scoped-implementation",
        "bounded-review",
    ]
    for contract in contracts:
        assert role_for_skill(contract.skill) == contract.role
        assert contract.selectors == tuple(
            f"@haunted-house:room-{contract.role}/{tool}" for tool in contract.tools
        )
    assert role_for_skill("unknown-skill") is None


# --- the shipped profiles ---------------------------------------------------------


def test_the_agents_directory_holds_exactly_the_five_role_profiles():
    assert sorted(path.name for path in AGENTS_DIR.iterdir()) == sorted(
        f"hh-{role}.json" for role in ALL_ROLES
    )


@pytest.mark.parametrize("role", ALL_ROLES)
def test_the_shipped_profile_satisfies_its_role_contract(role: str):
    path = APP_ROOT / role_contract(role).agent_path
    assert validate_agent_profile(profile(role), role) == ()
    assert path.read_text(encoding="utf-8").endswith("\n")


@pytest.mark.parametrize("role", ALL_ROLES)
def test_visible_authority_is_exactly_the_room_catalog(role: str):
    """A snapshot of what the profile exposes: room selectors and nothing else."""

    data = profile(role)
    assert data["tools"] == list(role_contract(role).selectors)
    assert data["allowedTools"] == []
    assert data["excludedTools"] == [CREW_SKILL_SERVER]
    assert data["includeMcpJson"] is False and data["includePowers"] is False
    assert data["resources"] == [STEERING_RESOURCE]
    assert auto_approve_paths(data) == []
    assert "mcpServers" not in data
    assert {rule["effect"] for rule in data["permissions"]["rules"]} == {"deny"}
    names = [tool.rsplit("/", 1)[1] for tool in data["tools"]]
    # No Ghost holds a built-in write, shell, web, or subagent selector.
    builtin = {"fs_write", "fs_read", "execute_bash", "execute_cmd", "use_subagent", "web_fetch",
               "web_search", "shell", "write", "read", "web", "subagent", "knowledge", "code"}  # fmt: skip
    assert not builtin & set(names)
    assert all(tool.startswith(f"@haunted-house:room-{role}/") for tool in data["tools"])
    mutating = {"write_spec_document", "write_room_file", "propose_risky_action", "execute_approved_action"}
    if role == "medium":
        assert names == ["list_room_files", "read_room_file"]
    elif role == "tinker":
        assert "write_spec_document" not in names
    else:
        assert mutating & set(names) == {"write_spec_document"}


def test_the_snapshot_differs_per_role_only_where_the_catalog_does():
    shapes = {}
    for role in ALL_ROLES:
        data = profile(role)
        shapes[role] = {key: data[key] for key in data if key not in ("name", "description", "prompt", "tools")}
        mcp = next(r for r in shapes[role]["permissions"]["rules"] if r["capability"] == "mcp")
        assert sorted(mcp["match"]) == sorted(
            f"haunted-house:room-{other}/*" for other in MVP_ROLES if other != role
        )
        mcp["match"] = []
    assert all(shape == shapes["archivist"] for shape in shapes.values())


def test_a_profile_cannot_serve_another_role():
    for role in ALL_ROLES:
        data = profile(role)
        for other in ALL_ROLES:
            assert (validate_agent_profile(data, other) == ()) is (other == role)


@pytest.mark.parametrize("role", ALL_ROLES)
def test_a_role_prompt_states_role_tools_skill_and_output(role: str):
    contract = role_contract(role)
    prompt = profile(role)["prompt"]
    assert f"Room_Skill {contract.skill}" in prompt
    assert "exactly one Ghost_Result JSON object" in prompt
    for key in ("schema_version", "run_id", "status", "summary", "artifacts", "task_id", "reason_code"):
        assert key in prompt
    for tool in contract.tools:
        assert tool in prompt
    # Tools of other rooms are not described to this Ghost.
    for tool in {t for tools in TOOLS_BY_ROLE.values() for t in tools} - set(contract.tools):
        assert tool not in prompt
    if contract.artifact is not None:
        assert contract.artifact in prompt


Mutation = Callable[[dict[str, Any]], None]


def _rule(capability: str) -> Callable[[dict[str, Any]], dict[str, Any]]:
    return lambda p: next(r for r in p["permissions"]["rules"] if r["capability"] == capability)


def _drop_rule(capability: str) -> Mutation:
    def mutate(p: dict[str, Any]) -> None:
        p["permissions"]["rules"] = [r for r in p["permissions"]["rules"] if r["capability"] != capability]

    return mutate


def _prompt(old: str, new: str) -> Mutation:
    def mutate(p: dict[str, Any]) -> None:
        assert old in p["prompt"]
        p["prompt"] = p["prompt"].replace(old, new)

    return mutate


def _append_prompt(text: str) -> Mutation:
    return lambda p: p.update(prompt=p["prompt"] + " " + text)


PROFILE_MUTATIONS: list[tuple[str, Mutation, str]] = [
    ("not-an-object", lambda p: p.clear() or p.update({1: 2}), "profile_not_object"),
    ("unknown-key", lambda p: p.update(welcomeMessage="boo"), "unknown_key"),
    ("wrong-name", lambda p: p.update(name="hh-tinker"), "name_mismatch"),
    ("empty-description", lambda p: p.update(description=" "), "text_required"),
    ("long-description", lambda p: p.update(description="x" * 201), "text_required"),
    ("wildcard-tools", lambda p: p.update(tools=["*"]), "broad_tool"),
    ("all-mcp", lambda p: p["tools"].append("@mcp"), "broad_tool"),
    ("whole-server", lambda p: p["tools"].append("@haunted-house:room-archivist"), "broad_tool"),
    ("server-wildcard", lambda p: p["tools"].append("@haunted-house:room-archivist/*"), "broad_tool"),
    ("crew-core", lambda p: p["tools"].append("@kirocrew-core/skill_search"), "foreign_tool"),
    ("builtin-write", lambda p: p["tools"].append("fs_write"), "broad_tool"),
    ("builtin-shell", lambda p: p["tools"].append("execute_bash"), "broad_tool"),
    ("subagent", lambda p: p["tools"].append("use_subagent"), "broad_tool"),
    ("web", lambda p: p["tools"].append("web"), "broad_tool"),
    ("other-room", lambda p: p["tools"].append("@haunted-house:room-tinker/write_room_file"), "foreign_tool"),
    ("reordered-tools", lambda p: p["tools"].reverse(), "tools_not_exact"),
    ("missing-tool", lambda p: p["tools"].pop(), "tools_not_exact"),
    ("legacy-allow", lambda p: p.update(allowedTools=["fs_read"]), "allowed_tools_not_empty"),
    ("no-allowed-tools", lambda p: p.pop("allowedTools"), "allowed_tools_not_empty"),
    ("auto-approve", lambda p: p.update(autoApprove=["*"]), "auto_approve_present"),
    ("nested-auto-approve", lambda p: _rule("shell")(p).update(auto_approve=True), "auto_approve_present"),
    ("inherited-mcp", lambda p: p.update(includeMcpJson=True), "inherited_mcp_enabled"),
    ("default-mcp", lambda p: p.pop("includeMcpJson"), "inherited_mcp_enabled"),
    ("inherited-powers", lambda p: p.update(includePowers=True), "powers_enabled"),
    ("default-powers", lambda p: p.pop("includePowers"), "powers_enabled"),
    ("skill-search-allowed", lambda p: p.pop("excludedTools"), "skill_search_not_excluded"),
    ("other-exclusion", lambda p: p.update(excludedTools=["knowledge"]), "skill_search_not_excluded"),
    ("own-servers", lambda p: p.update(mcpServers={"x": {"command": "python3"}}), "forbidden_block"),
    ("tools-settings", lambda p: p.update(toolsSettings={}), "forbidden_block"),
    ("hooks", lambda p: p.update(hooks={}), "forbidden_block"),
    ("no-steering", lambda p: p.update(resources=[]), "steering_resource_missing"),
    ("resources-not-list", lambda p: p.update(resources=STEERING_RESOURCE), "resources_not_list"),
    (
        "skill-uri",
        lambda p: p["resources"].append("skill://.kiro/skills/**/SKILL.md"),
        "skill_uri_not_supported",
    ),
    ("absolute-resource", lambda p: p["resources"].append("file:///etc/passwd"), "resource_not_allowed"),
    ("parent-resource", lambda p: p["resources"].append("file://../notes.md"), "resource_not_allowed"),
    ("no-rules", lambda p: p.pop("permissions"), "rules_missing"),
    ("policy-preset", lambda p: p["permissions"].update(policies=["allow-all"]), "policy_preset"),
    ("allow-rule", lambda p: p["permissions"]["rules"].append({"capability": "all", "effect": "allow"}), "non_deny_rule"),
    ("ask-rule", lambda p: _rule("shell")(p).update(effect="ask"), "non_deny_rule"),
    ("rule-with-exclude", lambda p: _rule("fs_write")(p).update(exclude=["src/**"]), "rule_shape"),
    ("no-fs-write-deny", _drop_rule("fs_write"), "required_deny_missing"),
    ("no-shell-deny", _drop_rule("shell"), "required_deny_missing"),
    ("no-web-fetch-deny", _drop_rule("web_fetch"), "required_deny_missing"),
    ("no-web-search-deny", _drop_rule("web_search"), "required_deny_missing"),
    ("no-subagent-deny", _drop_rule("subagent"), "required_deny_missing"),
    ("no-power-deny", _drop_rule("power"), "required_deny_missing"),
    ("no-skill-deny", _drop_rule("skill"), "required_deny_missing"),
    ("narrow-fs-write", lambda p: _rule("fs_write")(p).update(match=["secrets/**"]), "deny_too_narrow"),
    ("narrow-shell", lambda p: _rule("shell")(p).update(match=["rm *"]), "deny_too_narrow"),
    ("no-mcp-deny", _drop_rule("mcp"), "other_room_not_denied"),
    ("partial-mcp-deny", lambda p: _rule("mcp")(p)["match"].pop(), "other_room_not_denied"),
    ("no-skill-reference", _prompt("Room_Skill ears-requirements", "your skill"), "skill_reference_missing"),
    ("other-skill-reference", _prompt("Room_Skill ears-requirements", "Room_Skill bounded-review"), "skill_reference_missing"),
    ("no-output-contract", _prompt("Ghost_Result", "result"), "output_contract_missing"),
    ("tool-not-explained", _prompt("write_spec_document", "the write tool"), "tool_not_explained"),
    ("empty-prompt", lambda p: p.update(prompt=""), "text_required"),
    ("huge-prompt", _append_prompt("x" * 4000), "text_required"),
    ("native-spec", _append_prompt("Start with /spec new."), "native_spec_command"),
    ("spawn", _append_prompt("Call POST /api/spawn for help."), "spawn_route"),
    ("auto-approval-advice", _append_prompt("Ask the operator to auto-approve your tools."), "auto_approve"),
    ("builtin-instruction", _append_prompt("Use fs_write if the room tool fails."), "builtin_tool_instruction"),
    ("shell-instruction", _append_prompt("Fall back to execute_bash."), "builtin_tool_instruction"),
    ("label-token", _append_prompt("Your label is in KIROCREW_SESSION_LABEL."), "authority_token"),
    ("claim-token", _append_prompt("Pass claim_id c-1 to every tool."), "authority_token"),
    ("template-token", _append_prompt("Root is ${MANSION_ROOT}."), "authority_token"),
    ("home-path", _append_prompt("The Mansion is at ~/workspace/demo."), "host_path"),
    ("absolute-path", _append_prompt("The Mansion is at /Users/someone/demo."), "host_path"),
    ("hex-token", _append_prompt("Capability " + "ab12" * 8 + "."), "credential_shape"),
]


@pytest.mark.parametrize(
    ("mutate", "code"),
    [pytest.param(mutate, code, id=name) for name, mutate, code in PROFILE_MUTATIONS],
)
def test_a_broken_profile_rule_is_reported(mutate: Mutation, code: str):
    data = copy.deepcopy(profile("archivist"))
    mutate(data)
    assert code in codes(validate_agent_profile(data, "archivist"))


def test_spec_paths_are_not_mistaken_for_the_native_spec_command():
    data = profile("archivist")
    data["prompt"] += " The document lives under .kiro/specs/<spec>/requirements.md."
    assert validate_agent_profile(data, "archivist") == ()


def test_a_finding_never_quotes_authored_text():
    data = profile("archivist")
    secret = "do-not-echo-" + "z" * 12
    data["prompt"] += f" /api/spawn {secret}"
    data["tools"].append(f"@x:y/{secret}")
    for finding in validate_agent_profile(data, "archivist"):
        assert secret not in finding.message + finding.location + finding.code


# --- the shipped skills -----------------------------------------------------------


def test_the_skills_directory_holds_exactly_the_five_room_skills():
    assert sorted(path.name for path in SKILLS_DIR.iterdir()) == sorted(
        role_contract(role).skill for role in ALL_ROLES
    )
    for directory in SKILLS_DIR.iterdir():
        # A Room_Skill is instructions only: no script or other file to run.
        assert [child.name for child in directory.iterdir()] == ["SKILL.md"]


@pytest.mark.parametrize("role", ALL_ROLES)
def test_the_shipped_skill_satisfies_its_role_contract(role: str):
    contract = role_contract(role)
    text = skill_text(role)
    assert validate_room_skill(text, role, contract.skill) == ()
    assert text.endswith("\n")
    assert len(text.encode("utf-8")) <= MAX_SKILL_BYTES
    lines = text.split("\n")
    assert lines[0] == "---" and lines[1] == f"name: {contract.skill}"
    assert lines[2].startswith("description: ") and lines[3] == "---"
    for title in SKILL_SECTIONS:
        assert f"\n## {title}\n" in text


@pytest.mark.parametrize("role", ALL_ROLES)
def test_a_skill_grants_nothing_and_names_only_its_own_room_tools(role: str):
    contract = role_contract(role)
    text = skill_text(role)
    assert "allowed-tools" not in text and "permissions" not in text
    every_tool = {tool for tools in TOOLS_BY_ROLE.values() for tool in tools}
    for tool in every_tool - set(contract.tools):
        assert tool not in text, tool


def _json_blocks(text: str) -> list[str]:
    return re.findall(r"^```json\n(.*?)\n```$", text, flags=re.S | re.M)


def _markdown_example(text: str) -> str:
    match = re.search(r"^(`{3,})markdown\n(.*?)\n\1$", text, flags=re.S | re.M)
    assert match is not None
    return match.group(2) + "\n"


@pytest.mark.parametrize("role", ALL_ROLES)
def test_every_ghost_result_example_is_accepted_by_the_codec(role: str):
    contract = role_contract(role)
    final = skill_text(role).split("\n## Final response\n", 1)[1]
    results = [parse_ghost_result(block) for block in _json_blocks(final)]
    assert {result.status.value for result in results} == {"ready", "blocked", "failed"}
    for result in results:
        if role == "tinker":
            assert result.task_id == "1.1"
        else:
            assert result.task_id is None
    ready = next(result for result in results if result.status.value == "ready")
    paths = [item.path for item in ready.artifacts]
    if contract.artifact is not None:
        assert paths == [f".kiro/specs/reading-list/{contract.artifact}"]
    elif role == "tinker":
        assert paths == ["src/store.py", "tests/test_store.py"]
    else:
        assert paths == []
        assert CHANGES_REQUESTED in {result.reason_code for result in results}
        assert all(result.artifacts == () for result in results)


def test_the_skill_examples_pass_the_real_artifact_validators():
    requirements = _markdown_example(skill_text("archivist"))
    assert validate_requirements(requirements) == ()
    ids = extract_requirement_ids(requirements)
    assert ids == {"1.1", "1.2", "1.3", "1.4"}
    assert validate_design(_markdown_example(skill_text("draughtsman")), ids) == ()
    assert validate_tasks(_markdown_example(skill_text("foreman")), ids) == ()


def _edit(old: str, new: str) -> Callable[[str], str]:
    def apply(text: str) -> str:
        assert old in text
        return text.replace(old, new, 1)

    return apply


SKILL_MUTATIONS: list[tuple[str, Callable[[str], str], str]] = [
    ("no-frontmatter", lambda t: t.split("---\n", 2)[2], "frontmatter_invalid"),
    ("unclosed-frontmatter", lambda t: t.replace("\n---\n", "\n", 1), "frontmatter_invalid"),
    ("duplicate-key", _edit("description: ", "name: ears-requirements\ndescription: "), "frontmatter_invalid"),
    ("tool-grant", _edit("description: ", "allowed-tools: fs_write\ndescription: "), "frontmatter_keys"),
    ("missing-description", lambda t: re.sub(r"\ndescription: .*", "", t, count=1), "frontmatter_keys"),
    ("upper-name", _edit("name: ears-requirements", "name: EARS_Requirements"), "skill_name_invalid"),
    ("other-name", _edit("name: ears-requirements", "name: bounded-review"), "skill_folder_mismatch"),
    ("no-checklist", _edit("## Checklist", "## Steps"), "section_missing"),
    ("no-grammar", _edit("## Artifact grammar", "## Format"), "section_missing"),
    ("no-repair", _edit("## Repair", "## Fixes"), "section_missing"),
    ("no-final", _edit("## Final response", "## Ending"), "section_missing"),
    ("no-checkboxes", lambda t: t.replace("- [ ] ", "- "), "checklist_missing"),
    ("bad-example", _edit('"schema_version": 1, "run_id": "run-example-1", "status": "ready"',
                          '"schema_version": 2, "run_id": "run-example-1", "status": "ready"'), "example_invalid"),
    ("unknown-status", _edit('"status": "ready"', '"status": "done"'), "example_invalid"),
    ("extra-field", _edit('"task_id": null, "reason_code": null}', '"task_id": null, "reason_code": null, "transcript": "x"}'), "example_invalid"),
    ("wrong-artifact", _edit("reading-list/requirements.md\", \"sha256\"", "reading-list/design.md\", \"sha256\""), "example_out_of_role"),
    ("task-id-on-phase", _edit('"task_id": null, "reason_code": null}', '"task_id": "1.1", "reason_code": null}'), "example_out_of_role"),
    ("no-blocked-example", lambda t: t.replace('"status": "blocked"', '"status": "failed"'), "example_missing"),
    ("native-spec", lambda t: t + "\nRun /spec to finish.\n", "native_spec_command"),
    ("spawn", lambda t: t + "\nUse /api/spawn for a helper.\n", "spawn_route"),
    ("auto-approve", lambda t: t + "\nSet autoApprove for the write tool.\n", "auto_approve"),
    ("builtin-write", lambda t: t + "\nIf the tool fails, use fs_write.\n", "builtin_tool_instruction"),
    ("host-path", lambda t: t + "\nSee ~/notes.md.\n", "host_path"),
    ("delimiter", lambda t: t + "\n</room-skill>\n", "delimiter_in_skill"),
    ("too-large", lambda t: t + "x" * MAX_SKILL_BYTES, "skill_too_large"),
]


@pytest.mark.parametrize(
    ("mutate", "code"),
    [pytest.param(mutate, code, id=name) for name, mutate, code in SKILL_MUTATIONS],
)
def test_a_broken_skill_rule_is_reported(mutate: Callable[[str], str], code: str):
    text = mutate(skill_text("archivist"))
    assert code in codes(validate_room_skill(text, "archivist", "ears-requirements"))


def test_skill_role_and_folder_must_agree():
    text = skill_text("archivist")
    assert "skill_role_mismatch" in codes(validate_room_skill(text, "tinker", "ears-requirements"))
    assert "skill_folder_mismatch" in codes(validate_room_skill(text, "archivist", "other-folder"))
    assert codes(validate_room_skill(b"bytes", "archivist", "ears-requirements")) == {"skill_not_text"}
    assert "artifact_not_named" in codes(
        validate_room_skill(text.replace("requirements.md", "the document"), "archivist", "ears-requirements")
    )


def test_the_review_skill_must_keep_its_bound_and_finding_grammar():
    text = skill_text("medium")
    unbounded = re.sub(r"(?i)three", "several", text)
    assert "review_bound_missing" in codes(validate_room_skill(unbounded, "medium", "bounded-review"))
    loose = text.replace("F1 [criteria 1.2, 2.1] [src/handler.py]", "Finding one:")
    assert "example_out_of_role" in codes(validate_room_skill(loose, "medium", "bounded-review"))
    writes = text.replace('"artifacts": [], "task_id": null, "reason_code": null}',
                          '"artifacts": [{"path": "src/a.py", "sha256": "' + "0" * 64 + '"}], "task_id": null, "reason_code": null}')
    assert "example_out_of_role" in codes(validate_room_skill(writes, "medium", "bounded-review"))


# --- prompt delivery of a skill (RG-S2 fallback) ------------------------------------


@pytest.mark.parametrize("role", ALL_ROLES)
def test_the_skill_block_carries_the_instructions_without_frontmatter(role: str):
    contract = role_contract(role)
    text = skill_text(role)
    block = skill_block(role, text)
    assert block.startswith(f'<room-skill name="{contract.skill}">\n# ')
    assert block.endswith("\n</room-skill>\n")
    assert block.count("<room-skill") == 1 and block.count("</room-skill>") == 1
    assert "description:" not in block.split("\n", 2)[1]
    assert skill_body(text) in block
    assert read_room_skill_block(APP_ROOT, role) == block
    # One skill plus the largest prompt stays far below one turn's budget.
    assert len(block.encode("utf-8")) + prompts.MAX_PROMPT_BYTES <= 48 * 1024


def test_an_invalid_or_foreign_skill_is_never_put_in_a_prompt(tmp_path: Path):
    with pytest.raises(ValueError):
        skill_block("archivist", skill_text("tinker"))
    with pytest.raises(ValueError):
        skill_block("archivist", skill_text("archivist") + "\nUse /api/spawn.\n")
    with pytest.raises(KeyError):
        skill_block("poltergeist", skill_text("archivist"))
    assert skill_body("no frontmatter") is None

    def code(root: Path, role: str = "archivist") -> str:
        with pytest.raises(RoomSkillError) as raised:
            read_room_skill_block(root, role)
        return raised.value.code

    assert code(tmp_path) == "skill_missing"
    assert code(APP_ROOT, "poltergeist") == "skill_role_unknown"
    target = tmp_path / "skills" / "ears-requirements"
    target.mkdir(parents=True)
    (target / "SKILL.md").write_text(skill_text("tinker"), encoding="utf-8")
    assert code(tmp_path) == "skill_invalid"
    (target / "SKILL.md").write_bytes(b"\xff\xfe")
    assert code(tmp_path) == "skill_invalid"
    (target / "SKILL.md").write_text("x" * (MAX_SKILL_BYTES + 1), encoding="utf-8")
    assert code(tmp_path) == "skill_invalid"
    # A link is not followed, even to the genuine skill.
    (target / "SKILL.md").unlink()
    (target / "SKILL.md").symlink_to(APP_ROOT / "skills" / "ears-requirements" / "SKILL.md")
    assert code(tmp_path) == "skill_missing"
    target.joinpath("SKILL.md").unlink()
    target.rmdir()
    target.symlink_to(APP_ROOT / "skills" / "ears-requirements")
    assert code(tmp_path) == "skill_missing"


# --- the manifest catalog ---------------------------------------------------------


def manifest() -> dict[str, Any]:
    return load_json(APP_ROOT / "app.json")


def test_the_manifest_declares_exactly_the_mvp_room_resources():
    data = manifest()
    assert validate_manifest_resources(data) == ()
    assert data["resources"] == data["lifecycle"] == "gateway"
    assert data["agents"] == [f"agents/hh-{role}.json" for role in MVP_ROLES]
    assert data["skills"] == [
        "skills/ears-requirements",
        "skills/correctness-design",
        "skills/executable-tasks",
        "skills/scoped-implementation",
    ]
    assert list(data["mcpServers"]) == [f"room-{role}" for role in MVP_ROLES]
    assert data["permissions"]["sessionApproval"] is True
    assert {"/api/version", "/api/chat", "/api/chat/*", "/apps/haunted-house/api/*"} == set(
        data["permissions"]["api"]
    )
    assert auto_approve_paths(data) == []


def test_every_manifest_reference_resolves_and_every_role_is_whole():
    data = manifest()
    for agent_path, skill_path in zip(data["agents"], data["skills"], strict=True):
        declared = load_json(APP_ROOT / agent_path)
        role = declared["name"].removeprefix("hh-")
        contract = role_contract(role)
        assert (agent_path, skill_path) == (contract.agent_path, contract.skill_path)
        assert (APP_ROOT / skill_path / "SKILL.md").is_file()
        # The profile names the skill the manifest declares for it, and reaches
        # only the server the manifest launches for its room.
        assert f"Room_Skill {Path(skill_path).name}" in declared["prompt"]
        servers = {tool[1:].split("/")[0].split(":")[1] for tool in declared["tools"]}
        assert servers == {contract.server}
        assert data["mcpServers"][contract.server]["env"] == {"HH_ROOM": role}
    assert (APP_ROOT / "mcp" / "server.py").is_file()


def test_the_medium_ships_but_is_declared_only_with_the_seance_room():
    data = manifest()
    medium = role_contract("medium")
    assert (APP_ROOT / medium.agent_path).is_file()
    assert (APP_ROOT / medium.skill_path / "SKILL.md").is_file()
    assert medium.agent_path not in data["agents"]
    assert medium.skill_path not in data["skills"]
    assert medium.server not in data["mcpServers"]

    enabled = copy.deepcopy(data)
    enabled["agents"] = expected_agent_paths(seance_enabled=True)
    enabled["skills"] = expected_skill_paths(seance_enabled=True)
    enabled["mcpServers"] = expected_mcp_servers(seance_enabled=True)
    assert enabled["agents"][-1] == medium.agent_path and len(enabled["agents"]) == 5
    assert enabled["skills"][-1] == medium.skill_path and len(enabled["skills"]) == 5
    assert enabled["mcpServers"][medium.server]["env"] == {"HH_ROOM": "medium"}
    assert validate_manifest_resources(enabled, seance_enabled=True) == ()
    # The flag and the manifest must agree in both directions.
    assert validate_manifest_resources(enabled) != ()
    assert validate_manifest_resources(data, seance_enabled=True) != ()


ManifestMutation = Callable[[dict[str, Any]], None]

MANIFEST_MUTATIONS: list[tuple[str, ManifestMutation, str]] = [
    ("app-managed", lambda d: d.update(resources="app"), "not_gateway_managed"),
    ("no-lifecycle", lambda d: d.pop("lifecycle"), "not_gateway_managed"),
    ("missing-agent", lambda d: d["agents"].pop(), "agents_not_exact"),
    ("medium-agent-only", lambda d: d["agents"].append("agents/hh-medium.json"), "dangling_reference"),
    ("medium-skill-only", lambda d: d["skills"].append("skills/bounded-review"), "dangling_reference"),
    ("unknown-agent", lambda d: d["agents"].append("agents/hh-poltergeist.json"), "unknown_resource"),
    ("unknown-skill", lambda d: d["skills"].append("skills/tricks"), "unknown_resource"),
    ("missing-skills", lambda d: d.pop("skills"), "skills_not_exact"),
    ("missing-skill", lambda d: d["skills"].pop(), "dangling_reference"),
    ("reordered-skills", lambda d: d["skills"].reverse(), "skills_not_exact"),
    ("missing-server", lambda d: d["mcpServers"].pop("room-tinker"), "dangling_reference"),
    ("extra-server", lambda d: d["mcpServers"].update(helper={"command": "python3"}), "unknown_resource"),
    ("wrong-room", lambda d: d["mcpServers"]["room-tinker"]["env"].update(HH_ROOM="archivist"), "mcp_servers_not_exact"),
    ("no-label-marker", lambda d: d["mcpServers"]["room-tinker"].pop("x-kirocrew-session-label"), "mcp_servers_not_exact"),
    (
        "preset-label",
        lambda d: d["mcpServers"]["room-tinker"]["env"].update(KIROCREW_SESSION_LABEL="dashboard:x"),
        "session_label_preset",
    ),
    ("server-auto-approve", lambda d: d["mcpServers"]["room-tinker"].update(autoApprove=["*"]), "auto_approve_present"),
    ("top-auto-approve", lambda d: d.update(auto_approve=True), "auto_approve_present"),
    ("no-chat-turn", lambda d: d["permissions"]["api"].remove("/api/chat"), "chat_grant_missing"),
    ("no-chat-children", lambda d: d["permissions"]["api"].remove("/api/chat/*"), "chat_grant_missing"),
    ("spawn", lambda d: d["permissions"]["api"].append("/api/spawn"), "forbidden_api_grant"),
    ("spawn-children", lambda d: d["permissions"]["api"].append("/api/spawn/*"), "forbidden_api_grant"),
    ("global-approvals", lambda d: d["permissions"]["api"].append("/api/approvals"), "forbidden_api_grant"),
    ("broad-api", lambda d: d["permissions"]["api"].append("/api/*"), "forbidden_api_grant"),
    ("no-session-approval", lambda d: d["permissions"].pop("sessionApproval"), "session_approval_missing"),
    ("truthy-session-approval", lambda d: d["permissions"].update(sessionApproval="yes"), "session_approval_missing"),
]


@pytest.mark.parametrize(
    ("mutate", "code"),
    [pytest.param(mutate, code, id=name) for name, mutate, code in MANIFEST_MUTATIONS],
)
def test_a_broken_manifest_catalog_rule_is_reported(mutate: ManifestMutation, code: str):
    data = manifest()
    mutate(data)
    assert code in codes(validate_manifest_resources(data))


def test_a_manifest_that_is_not_an_object_is_refused():
    assert codes(validate_manifest_resources([])) == {"manifest_not_object"}


# --- agreement with the RG-S2 spike -------------------------------------------------


def test_the_profile_decisions_equal_the_recorded_rg_s2_result():
    """The contract is what the spike verified, not a parallel opinion."""

    report = load_json(RG_S2_FIXTURE)
    assert report["spike"] == "RG-S2" and report["isolatedHome"] is True
    assert report["failedChecks"] == []
    contract = report["contract"]
    assert contract["steeringResource"] == STEERING_RESOURCE
    assert contract["excludedTools"] == [CREW_SKILL_SERVER]
    assert contract["skillResourceInProfile"] is False
    assert contract["skillDelivery"] == "bounded_prompt_block"
    assert contract["declaredAgents"] == manifest()["agents"]
    assert contract["declaredSkills"] == manifest()["skills"]
    for role in MVP_ROLES:
        assert contract["visibleTools"][role] == list(role_contract(role).selectors)
