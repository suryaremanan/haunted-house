"""MCP_Gate backend service: room files, phase output, and risky actions
(tasks 10.3, 10.4).

A real GuardedFilesystem over a temporary Mansion, the real
ApprovedActionExecutor, and the Spec 2 writer contract (MemoryWriter) stand
behind the service; only the confined process runner and the output boundary
are fakes.

Validates: Requirements 3.1–3.9, 5.1, 5.8, 6.2–6.8, 9.4, 10.1, 11.5–11.7.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import replace

import pytest

from haunted_house.adapters.command_runner import ActionOutcome
from haunted_house.adapters.guardrail_port import GuardrailPort
from haunted_house.core import guardrail_events as ge
from haunted_house.core.guardrail_events import Phase
from haunted_house.core.room_catalog import TOOLS_BY_ROLE
from tests.guardrail_support import MANSION, OPERATOR, SPEC, MemoryWriter, spec_path
from tests.room_mcp_support import ROLE_BY_PHASE, RecordingRunner, build_service, room_binding

_CONTROL = "." + "haunted-house"
FAKE_CREDENTIAL = "gh" + "p_" + "A1b2" * 10  # synthetic, assembled at runtime


TINKER = "tinker"
ARCHIVIST = "archivist"
TINKER_SLOT = "hh-tinker-1"
FakeRunner = RecordingRunner


class World:
    def __init__(self, tmp_path, *, runner=None, operations=True):
        self.root = tmp_path / "mansions"
        self.mansion = self.root / MANSION
        (self.mansion / "src").mkdir(parents=True)
        (self.mansion / "src" / "old.py").write_text("old\n")
        (self.mansion / ".kiro" / "specs" / SPEC).mkdir(parents=True)
        (self.root / "other-mansion").mkdir()
        (self.root / "other-mansion" / "keep.txt").write_text("keep")
        self.writer = MemoryWriter()
        self.port = GuardrailPort(self.writer)
        self.runner = runner
        self._ids = 0
        self.service = build_service(
            self.writer, self.root, runner=runner, operations=operations, id_factory=self._id
        )
        self._bindings: dict = {}

    def _id(self):
        self._ids += 1
        return f"id-{self._ids}"

    def who(self, role, **changes):
        """The trusted binding of one session; stable per role in this World."""

        key = (role, tuple(sorted(changes.items())))
        if key not in self._bindings:
            self._bindings[key] = room_binding(role, self.root, **changes)
        return self._bindings[key]

    def call(self, who, tool, arguments=None):
        who = self.who(who) if isinstance(who, str) else who
        result = asyncio.run(self.service.call(who, tool, {} if arguments is None else arguments))
        json.dumps(result)  # always plain JSON
        return result

    def append(self, *candidates):
        ack = asyncio.run(self.port.append(MANSION, list(candidates)))
        assert ack.ok
        return ack

    def working(self, phase):
        """Open every earlier Door through acknowledged records, then start."""

        order = [Phase.REQUIREMENTS, Phase.DESIGN, Phase.TASKS, Phase.IMPLEMENTATION]
        for earlier in order[: order.index(phase)]:
            if self.projection().phases[earlier].status.value == "approved":
                continue
            self.start(earlier)
            fields = dict(
                phase=earlier, proposal_id=f"door-{earlier.value}",
                document_path=spec_path(earlier), revision=1, sha256="a" * 64, size_bytes=1,
            )
            self.append(ge.phase_output_ready(OPERATOR, **fields))
            self.append(
                ge.door_approved(
                    OPERATOR, actor="operator", command_id=f"approve-{earlier.value}", **fields
                )
            )
        self.start(phase)
        assert self.projection().phases[phase].status.value == "working"

    def projection(self):
        return asyncio.run(self.port.projection(MANSION))

    def start(self, phase):
        self.append(
            ge.phase_start_reserved(
                OPERATOR, phase=phase, reservation_id=f"res-{phase.value}", command_id=f"cmd-{phase.value}"
            ),
            ge.phase_started(
                OPERATOR, phase=phase, reservation_id=f"res-{phase.value}",
                session_slot=f"hh-{ROLE_BY_PHASE[phase]}-1",
            ),
        )

    def kinds(self):
        return [event.payload["kind"] for event in self.writer.events]

    def decide(self, proposal_id, digest, *, approve=True):
        builder = ge.risky_action_approved if approve else ge.risky_action_rejected
        self.append(
            builder(
                OPERATOR,
                proposal_id=proposal_id,
                action_digest=digest,
                actor="operator",
                command_id=f"cmd-{proposal_id}-{approve}",
            )
        )


@pytest.fixture
def world(tmp_path):
    return World(tmp_path, runner=FakeRunner())


def delete_action(path="src/old.py"):
    return {
        "kind": "delete_path",
        "working_directory": "",
        "arguments": {"path": path, "target": "file"},
        "path_intents": [{"access": "delete", "path": path}],
    }


def command_action(**overrides):
    action = {
        "kind": "run_command",
        "working_directory": "",
        "arguments": {"argv": ["pytest", "-q"], "timeout_seconds": 60},
        "path_intents": [{"access": "command_read", "path": "src"}],
    }
    action.update(overrides)
    return action


# --- catalog and identity ---------------------------------------------------------


@pytest.mark.parametrize("role", sorted(TOOLS_BY_ROLE))
def test_catalog_is_exact_per_role(world, role):
    assert world.service.catalog(world.who(role)) == TOOLS_BY_ROLE[role]


@pytest.mark.parametrize(
    "changes",
    [
        {"role": "warden"},
        {"spec": "Not A Spec"},
        {"room": "study"},  # a Tinker record claiming another Room
        {"mansion_root": "/somewhere/else"},
        None,
    ],
)
def test_unusable_identity_exposes_nothing_and_blocks(world, changes):
    broken = None if changes is None else replace(world.who("tinker"), **changes)
    assert world.service.catalog(broken) == ()
    result = world.call(broken, "list_room_files")
    assert result == {
        "ok": False,
        "code": "blocked",
        "reason": "session_identity_unavailable",
        "ghost_state": "blocked",
    }


@pytest.mark.parametrize(
    ("who", "tool"),
    [
        (ARCHIVIST, "write_room_file"),
        (ARCHIVIST, "propose_risky_action"),
        (ARCHIVIST, "execute_approved_action"),
        (TINKER, "write_spec_document"),
        (TINKER, "no_such_tool"),
        (TINKER, 7),
    ],
)
def test_a_tool_outside_the_role_catalog_is_refused(world, who, tool):
    world.working(Phase.REQUIREMENTS)
    before = list(world.writer.events)
    assert world.call(who, tool, {"path": "x", "content": "y"})["code"] == "tool_not_available"
    assert world.writer.events == before


def test_model_supplied_authority_arguments_are_refused(world):
    for extra in ("mansion", "mansion_id", "room", "session", "slot", "ghost", "spec", "_meta"):
        result = world.call(TINKER, "read_room_file", {"path": "src/old.py", extra: "other-mansion"})
        assert result == {"ok": False, "code": "invalid_arguments"}


def test_a_missing_mansion_blocks(world):
    result = world.call(world.who("tinker", mansion="ghost-town"), "list_room_files")
    assert (result["code"], result["reason"]) == ("blocked", "mansion_not_found")


# --- list and read ----------------------------------------------------------------


def test_list_and_read_inside_the_bound_mansion(world):
    (world.mansion / _CONTROL).mkdir()
    listed = world.call(ARCHIVIST, "list_room_files")
    assert listed["ok"] and listed["entries"] == [
        {"name": ".kiro", "kind": "directory"},
        {"name": "src", "kind": "directory"},
    ]
    assert world.call(ARCHIVIST, "list_room_files", {"path": "src"})["entries"] == [
        {"name": "old.py", "kind": "file"}
    ]
    read = world.call(ARCHIVIST, "read_room_file", {"path": "src/old.py"})
    assert read["ok"] and read["content"] == "old\n" and read["size_bytes"] == 4
    assert world.writer.events == []


@pytest.mark.parametrize(
    "path",
    ["../other-mansion/keep.txt", "/etc/hosts", "src/../../other-mansion/keep.txt",
     _CONTROL + "/state.json", ".git/config", "src\\old.py", "%2e%2e/other-mansion/keep.txt"],
)  # fmt: skip
def test_out_of_room_reads_are_denied_and_recorded(world, path):
    result = world.call(TINKER, "read_room_file", {"path": path})
    assert result["ok"] is False and "content" not in result
    assert world.kinds() == ["path_denied"]
    assert "keep" not in json.dumps(result)


def test_read_refuses_symlinks_binary_and_missing(world, tmp_path):
    outside = tmp_path / "outside.txt"
    outside.write_text("outside-content")
    (world.mansion / "link.txt").symlink_to(outside)
    (world.mansion / "blob.bin").write_bytes(b"\xff\xfe\x00")
    assert world.call(TINKER, "read_room_file", {"path": "link.txt"})["code"] == "symlink"
    assert world.call(TINKER, "read_room_file", {"path": "blob.bin"})["code"] == "not_text"
    assert world.call(TINKER, "read_room_file", {"path": "nope.txt"})["code"] == "not_found"


# --- spec documents ---------------------------------------------------------------


def test_archivist_writes_only_its_document_with_revisions(world):
    world.working(Phase.REQUIREMENTS)
    first = world.call(ARCHIVIST, "write_spec_document", {"content": "# R1\n", "expected_revision": 0})
    assert first["ok"] and first["code"] == "written" and first["revision"] == 1
    document = world.mansion / spec_path(Phase.REQUIREMENTS)
    assert document.read_text() == "# R1\n"

    stale = world.call(ARCHIVIST, "write_spec_document", {"content": "# R2\n", "expected_revision": 0})
    assert (stale["ok"], stale["code"], stale["reason"], stale["current_revision"]) == (
        False, "conflict", "stale_revision", 1,
    )  # fmt: skip
    assert document.read_text() == "# R1\n"

    second = world.call(ARCHIVIST, "write_spec_document", {"content": "# R2\n", "expected_revision": 1})
    assert second["revision"] == 2 and document.read_text() == "# R2\n"
    assert world.kinds()[2:] == [
        "spec_write_prepared", "spec_document_written", "spec_write_prepared", "spec_document_written",
    ]  # fmt: skip
    # Evidence is content-free.
    assert "# R" not in json.dumps([event.payload for event in world.writer.events])
    # Nothing but the one document was created.
    assert sorted(p.name for p in document.parent.iterdir()) == ["requirements.md"]


@pytest.mark.parametrize(
    ("role", "phase", "document"),
    [
        ("archivist", Phase.REQUIREMENTS, "requirements.md"),
        ("draughtsman", Phase.DESIGN, "design.md"),
        ("foreman", Phase.TASKS, "tasks.md"),
    ],
)
def test_each_spec_room_writes_exactly_its_own_document(tmp_path, role, phase, document):
    world = World(tmp_path)
    world.working(phase)
    result = world.call(role, "write_spec_document", {"content": "x", "expected_revision": 0})
    assert result["ok"], result
    folder = world.mansion / ".kiro" / "specs" / SPEC
    assert [p.name for p in folder.iterdir()] == [document]


def test_spec_write_before_the_phase_started_is_a_conflict(world):
    result = world.call(ARCHIVIST, "write_spec_document", {"content": "x", "expected_revision": 0})
    assert (result["ok"], result["code"], result["reason"]) == (False, "conflict", "invalid_state")
    assert not (world.mansion / spec_path(Phase.REQUIREMENTS)).exists()
    assert world.writer.events == []


def test_mutations_block_when_the_writer_or_integrity_is_unavailable(world):
    world.working(Phase.REQUIREMENTS)
    world.writer.fail_reads = True
    for who, tool, arguments in [
        (ARCHIVIST, "write_spec_document", {"content": "x", "expected_revision": 0}),
        (ARCHIVIST, "submit_phase_output", {}),
        (TINKER, "write_room_file", {"path": "src/new.py", "content": "x"}),
        (TINKER, "propose_risky_action", {"action": delete_action()}),
        (TINKER, "execute_approved_action", {"proposal_id": "p", "action": delete_action()}),
    ]:
        result = world.call(who, tool, arguments)
        assert (result["code"], result["ghost_state"]) == ("blocked", "blocked"), tool
    assert not (world.mansion / "src" / "new.py").exists()
    assert world.runner.runs == [] and (world.mansion / "src" / "old.py").exists()


# --- tinker files -----------------------------------------------------------------


def test_tinker_writes_room_files_only_while_implementation_is_working(world):
    refused = world.call(TINKER, "write_room_file", {"path": "src/new.py", "content": "x = 1\n"})
    assert (refused["code"], refused["reason"]) == ("conflict", "invalid_state")
    assert not (world.mansion / "src" / "new.py").exists()

    world.working(Phase.IMPLEMENTATION)
    written = world.call(TINKER, "write_room_file", {"path": "src/pkg/new.py", "content": "x = 1\n"})
    assert written["ok"] and (world.mansion / "src" / "pkg" / "new.py").read_text() == "x = 1\n"


@pytest.mark.parametrize(
    "path",
    [f".kiro/specs/{SPEC}/requirements.md", ".kiro/steering/tech.md", _CONTROL + "/x",
     ".git/hooks/pre-commit", "../other-mansion/keep.txt", ".env"],
)  # fmt: skip
def test_tinker_cannot_write_protected_or_outside_paths(world, path):
    world.working(Phase.IMPLEMENTATION)
    before = len(world.writer.events)
    result = world.call(TINKER, "write_room_file", {"path": path, "content": "x"})
    assert result["ok"] is False
    assert world.kinds()[before:] == ["path_denied"]
    assert (world.root / "other-mansion" / "keep.txt").read_text() == "keep"
    assert not (world.mansion / ".env").exists()


# --- phase output -----------------------------------------------------------------


def test_submit_without_the_workflow_service_is_blocked(tmp_path):
    world = World(tmp_path, operations=False)
    world.working(Phase.REQUIREMENTS)
    result = world.call(ARCHIVIST, "submit_phase_output")
    assert (result["code"], result["reason"]) == ("blocked", "output_validation_unavailable")
    assert world.kinds() == ["phase_start_reserved", "phase_started"]


def test_a_spec_ghost_submits_exactly_the_revision_it_wrote(world):
    world.working(Phase.REQUIREMENTS)
    assert world.call(ARCHIVIST, "submit_phase_output")["code"] == "document_missing"
    written = world.call(ARCHIVIST, "write_spec_document", {"content": "# R1\n", "expected_revision": 0})
    result = world.call(ARCHIVIST, "submit_phase_output")
    assert result["ok"] and result["code"] == "waiting_for_door"
    assert result["document_path"] == spec_path(Phase.REQUIREMENTS)
    assert result["artifact_revision"] == {
        "revision": 1, "sha256": written["sha256"], "size_bytes": written["size_bytes"],
    }  # fmt: skip
    assert set(result) == {"ok", "code", "proposal_id", "document_path", "artifact_revision"}
    assert world.kinds()[-1] == "phase_output_ready"
    projection = world.projection()
    assert projection.phases[Phase.REQUIREMENTS].status.value == "waiting"
    # Submitting opens no Door and starts no successor.
    assert projection.phases[Phase.REQUIREMENTS].door.value == "waiting"
    assert projection.phases[Phase.DESIGN].status.value == "not_started"


def test_a_spec_ghost_cannot_name_another_output_and_a_tinker_must(world):
    world.working(Phase.REQUIREMENTS)
    extra = world.call(ARCHIVIST, "submit_phase_output", {"path": "src/old.py"})
    assert extra == {"ok": False, "code": "invalid_arguments"}
    world.working(Phase.IMPLEMENTATION)
    assert world.call(TINKER, "submit_phase_output") == {"ok": False, "code": "invalid_arguments"}
    refused = world.call(TINKER, "submit_phase_output", {"path": f".kiro/specs/{SPEC}/tasks.md"})
    assert refused["ok"] is False
    accepted = world.call(TINKER, "submit_phase_output", {"path": "src/old.py"})
    assert accepted["ok"] and accepted["document_path"] == "src/old.py"


# --- risky actions ----------------------------------------------------------------


def propose(world, action=None):
    world.working(Phase.IMPLEMENTATION)
    result = world.call(TINKER, "propose_risky_action", {"action": action or delete_action()})
    assert result["ok"] and (result["code"], result["status"]) == ("proposal_pending", "pending"), result
    assert set(result) == {"ok", "code", "status", "proposal_id", "action_digest"}
    return result["proposal_id"], result["action_digest"]


def execute(world, proposal_id, action=None, who=TINKER):
    arguments = {"proposal_id": proposal_id, "action": action or delete_action()}
    return world.call(who, "execute_approved_action", arguments)


def test_proposal_appends_one_pending_record_and_runs_nothing(world):
    proposal_id, digest = propose(world)
    record = world.writer.events[-1].payload
    assert record["kind"] == "risky_action_proposed"
    assert record["data"]["action_digest"] == digest
    assert record["data"]["descriptor"]["mansion_id"] == MANSION
    assert record["data"]["descriptor"]["session_slot"] == TINKER_SLOT
    assert record["data"]["descriptor"]["room"] == "workshop"
    assert (world.mansion / "src" / "old.py").exists()
    assert execute(world, proposal_id) == {"ok": False, "code": "proposal_pending", "status": "waiting"}
    assert (world.mansion / "src" / "old.py").exists() and world.kinds()[-1] == "risky_action_proposed"


@pytest.mark.parametrize(
    "action",
    [
        {"kind": "run_command", "working_directory": "", "arguments": {"argv": "rm -rf ."}, "path_intents": []},
        command_action(arguments={"argv": ["sh"], "timeout_seconds": 60, "env": {"A": "b"}}),
        command_action(arguments={"argv": ["x"], "timeout_seconds": 1.5}),
        {**delete_action(), "kind": "format_disk"},
        {"kind": "git_write", "working_directory": "", "arguments": {"operation": "push", "pathspecs": ["a"]},
         "path_intents": [{"access": "git_write", "path": "a"}]},
        command_action(arguments={"argv": ["echo", "a\u202eb"], "timeout_seconds": 5}),
    ],
)  # fmt: skip
def test_undisplayable_or_unsupported_actions_are_refused_before_any_record(world, action):
    world.working(Phase.IMPLEMENTATION)
    before = len(world.writer.events)
    result = world.call(TINKER, "propose_risky_action", {"action": action})
    assert (result["ok"], result["code"]) == (False, "invalid_descriptor")
    assert len(world.writer.events) == before


@pytest.mark.parametrize(
    "action",
    [
        delete_action("../other-mansion/keep.txt"),
        delete_action(f".kiro/specs/{SPEC}/requirements.md"),
        delete_action(_CONTROL + "/state.json"),
        command_action(working_directory=".git"),
        command_action(path_intents=[{"access": "command_write", "path": ".kiro/hooks"}]),
    ],
)
def test_a_proposal_outside_room_policy_is_denied(world, action):
    world.working(Phase.IMPLEMENTATION)
    before = len(world.writer.events)
    result = world.call(TINKER, "propose_risky_action", {"action": action})
    assert result["ok"] is False and result["code"] in ("path_denied", "invalid_descriptor")
    assert "risky_action_proposed" not in world.kinds()[before:]


def test_exact_approved_delete_is_consumed_before_the_file_goes_once(world):
    proposal_id, digest = propose(world)
    world.decide(proposal_id, digest)
    assert execute(world, proposal_id) == {"ok": True, "code": "deleted", "consumed": True}
    assert not (world.mansion / "src" / "old.py").exists()
    assert world.kinds()[-3:] == ["risky_action_approved", "risky_action_consumed", "risky_action_succeeded"]
    consumed = world.writer.events[-2]
    assert ("cas", consumed.sequence - 1, 1) in world.writer.calls

    again = execute(world, proposal_id)
    assert (again["ok"], again["code"]) == (False, "proposal_consumed")
    assert world.kinds()[-1] == "risky_action_denied"


def test_an_approved_command_reaches_the_runner_only_after_consumption(world):
    proposal_id, digest = propose(world, command_action())
    world.decide(proposal_id, digest)
    seen = []
    world.runner.on_run = lambda: seen.append(world.kinds()[-1])
    result = execute(world, proposal_id, command_action())
    assert result == {"ok": True, "code": "exited", "consumed": True, "exit_code": 0, "output": "ran"}
    assert seen == ["risky_action_consumed"] and world.runner.runs == ["run_command"]
    assert execute(world, proposal_id, command_action())["code"] == "proposal_consumed"
    assert world.runner.runs == ["run_command"]


def test_a_failed_action_stays_consumed_and_leaks_nothing(tmp_path):
    world = World(tmp_path, runner=FakeRunner(fail=True))
    proposal_id, digest = propose(world, command_action())
    world.decide(proposal_id, digest)
    result = execute(world, proposal_id, command_action())
    assert result == {"ok": False, "code": "runner_failed", "consumed": True}
    assert world.kinds()[-2:] == ["risky_action_consumed", "risky_action_failed"]
    retry = execute(world, proposal_id, command_action())
    assert retry["code"] == "proposal_consumed" and len(world.runner.runs) == 1
    assert "exploded" not in json.dumps([result, retry, [e.payload for e in world.writer.events]])


def test_action_output_is_redacted_and_bounded(tmp_path):
    noisy = "token=" + FAKE_CREDENTIAL + "\n" + "x" * 40_000
    runner = FakeRunner(ActionOutcome(True, "exited", 0, 40_000, noisy, False, True))
    world = World(tmp_path, runner=runner)
    proposal_id, digest = propose(world, command_action())
    world.decide(proposal_id, digest)
    result = execute(world, proposal_id, command_action())
    assert result["ok"] and FAKE_CREDENTIAL not in result["output"]
    assert len(result["output"]) <= 16 * 1024 + 64 and result["truncated"] is True


@pytest.mark.parametrize(
    ("mutate", "code"),
    [
        (lambda a: a["arguments"].update(path="src/other.py") or a["path_intents"][0].update(path="src/other.py"), "descriptor_mismatch"),
        (lambda a: a["arguments"].update(target="empty_directory"), "descriptor_mismatch"),
        (lambda a: a.update(kind="run_command", arguments={"argv": ["rm", "src/old.py"], "timeout_seconds": 5}), "invalid_descriptor"),
    ],
)  # fmt: skip
def test_any_changed_field_is_refused_and_recorded(world, mutate, code):
    proposal_id, digest = propose(world)
    world.decide(proposal_id, digest)
    action = delete_action()
    mutate(action)
    result = execute(world, proposal_id, action)
    assert (result["ok"], result["code"]) == (False, code)
    assert (world.mansion / "src" / "old.py").exists() and world.kinds()[-1] == "risky_action_denied"
    # The exact action is still available: a refused attempt consumed nothing.
    assert execute(world, proposal_id)["ok"]


def test_rejected_missing_and_foreign_proposals_never_run(world):
    proposal_id, digest = propose(world)
    world.decide(proposal_id, digest, approve=False)
    assert execute(world, proposal_id)["code"] == "proposal_rejected"
    assert execute(world, "nope")["code"] == "proposal_missing"
    assert (world.mansion / "src" / "old.py").exists()


def test_another_session_cannot_use_an_approval(world):
    proposal_id, digest = propose(world)
    world.decide(proposal_id, digest)
    intruder = world.who("tinker", slot="hh-tinker-2", ghost="tinker-2")
    result = execute(world, proposal_id, who=intruder)
    assert result["ok"] is False and result["code"] in ("descriptor_mismatch", "identity_mismatch")
    assert (world.mansion / "src" / "old.py").exists()


def test_an_approval_never_widens_room_policy(world):
    """An approval record for an out-of-room action still cannot run."""

    from haunted_house.core.action_descriptor import action_digest, parse_action_descriptor
    from haunted_house.core.room_catalog import complete_descriptor

    world.working(Phase.IMPLEMENTATION)
    document = world.mansion / ".kiro" / "specs" / SPEC / "requirements.md"
    document.write_text("# kept\n")
    action = delete_action(f".kiro/specs/{SPEC}/requirements.md")
    descriptor = parse_action_descriptor(
        complete_descriptor(action, mansion_id=MANSION, session_slot=TINKER_SLOT, room="workshop")
    )
    scope = world.who(TINKER).scope
    world.append(ge.risky_action_proposed(scope, proposal_id="forged-1", descriptor=descriptor))
    world.decide("forged-1", action_digest(descriptor))
    result = execute(world, "forged-1", action)
    assert (result["ok"], result["code"]) == (False, "path_denied")
    assert document.read_text() == "# kept\n" and world.kinds()[-1] == "path_denied"
    assert "risky_action_consumed" not in world.kinds()


def test_command_without_confinement_is_not_consumed(tmp_path):
    world = World(tmp_path, runner=FakeRunner(available=False))
    proposal_id, digest = propose(world, command_action())
    world.decide(proposal_id, digest)
    result = execute(world, proposal_id, command_action())
    assert (result["ok"], result["code"]) == (False, "confinement_unavailable")
    assert world.runner.runs == [] and "risky_action_consumed" not in world.kinds()


def test_without_the_workflow_service_nothing_is_proposed_or_consumed(tmp_path):
    world = World(tmp_path, operations=False)
    world.working(Phase.IMPLEMENTATION)
    proposed = world.call(TINKER, "propose_risky_action", {"action": delete_action()})
    assert (proposed["code"], proposed["reason"]) == ("blocked", "workflow_unavailable")
    result = execute(world, "p-1")
    assert (result["code"], result["reason"]) == ("blocked", "action_runner_unavailable")
    assert not {"risky_action_proposed", "risky_action_consumed"} & set(world.kinds())
    assert (world.mansion / "src" / "old.py").exists()


def test_a_repeated_proposal_is_one_pending_record(world):
    first = propose(world)
    again = world.call(TINKER, "propose_risky_action", {"action": delete_action()})
    assert (again["proposal_id"], again["action_digest"]) == first
    assert world.kinds().count("risky_action_proposed") == 1


def test_concurrent_claims_consume_exactly_once(world):
    proposal_id, digest = propose(world, command_action())
    world.decide(proposal_id, digest)
    arguments = {"proposal_id": proposal_id, "action": command_action()}
    tinker = world.who(TINKER)

    async def race():
        return await asyncio.gather(
            *(world.service.call(tinker, "execute_approved_action", arguments) for _ in range(5))
        )

    results = asyncio.run(race())
    assert sum(1 for result in results if result["ok"]) == 1
    assert world.kinds().count("risky_action_consumed") == 1
    assert world.runner.runs == ["run_command"]


def test_a_writer_failure_at_consumption_runs_nothing(world):
    proposal_id, digest = propose(world, command_action())
    world.decide(proposal_id, digest)
    world.writer.fail_next = ["failed"]
    result = execute(world, proposal_id, command_action())
    assert (result["code"], result["reason"]) == ("blocked", "writer_unavailable")
    assert world.runner.runs == []
