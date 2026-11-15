"""Approved risky-action adapters (Doors and Guardrails tasks 7.1–7.3).

Every side effect must come strictly after an acknowledged exact consumption
record, a refused attempt must leave its target untouched and leave
content-free evidence, a failure must keep the approval consumed, and command
and git actions must fail closed when confinement cannot be proven.

The ``sandbox-exec`` tests run harmless commands in a temporary Mansion and
skip where confinement is not available.

Validates: Requirements 3.4–3.9, 5.1, 6.8, 10.1, 11.7, 11.8.
"""

from __future__ import annotations

import asyncio
import os
import subprocess
from pathlib import Path

import pytest

from haunted_house.adapters.command_runner import (
    ActionOutcome,
    AllowedCommand,
    ApprovedActionExecutor,
    ConfinedRunner,
    UnavailableRunner,
    default_commands,
)
from haunted_house.adapters.guarded_filesystem import GuardedFilesystem
from haunted_house.adapters.guardrail_port import GuardrailPort
from haunted_house.core import guardrail_events as ge
from haunted_house.core.action_descriptor import parse_action_descriptor
from haunted_house.core.approvals import ProposalStatus
from haunted_house.core.seance_event import EventScope
from tests.guardrail_support import (
    MANSION,
    OPERATOR,
    SESSION_SCOPE,
    SPEC,
    MemoryWriter,
    command_descriptor,
    delete_descriptor,
    git_descriptor,
    parsed,
)

_CONFINED = ConfinedRunner()
needs_sandbox = pytest.mark.skipif(
    not _CONFINED.available, reason="sandbox-exec confinement is not available on this host"
)


def _run(awaitable):
    return asyncio.run(awaitable)


class SpyRunner:
    """A runner double that records when it was asked to start a process."""

    def __init__(self, writer: MemoryWriter, outcome: ActionOutcome | None = None, available=True):
        self.available = available
        self.writer = writer
        self.outcome = outcome or ActionOutcome(True, "exited", 0, 12, "ok", False, True)
        self.calls: list[tuple[str, list[str]]] = []

    async def run(self, descriptor, mansion_directory):
        kinds = [event.payload["kind"] for event in self.writer.events]
        self.calls.append((descriptor.kind, kinds))
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self.outcome


class Bench:
    def __init__(self, tmp_path: Path, runner=None):
        self.root = Path(os.path.realpath(tmp_path)) / "mansions"
        self.mansion = self.root / MANSION
        (self.mansion / "src").mkdir(parents=True)
        (self.mansion / "src" / "old.py").write_text("print('old')\n", encoding="utf-8")
        self.writer = MemoryWriter()
        self.port = GuardrailPort(self.writer)
        self.runner = runner if runner is not None else SpyRunner(self.writer)
        self.unlinked_after: list[list[str]] = []
        bench = self

        class Filesystem(GuardedFilesystem):
            def _checkpoint(self, stage: str) -> None:
                if stage == "before_unlink":
                    bench.unlinked_after.append(bench.kinds())

        self.filesystem = Filesystem(self.root, MANSION)
        self._n = 0
        self.executor = ApprovedActionExecutor(
            self.port,
            lambda _mansion: self.filesystem,
            self.runner,
            mansion_directory=lambda mansion: self.root / mansion,
            id_factory=self.new_id,
        )

    def new_id(self) -> str:
        self._n += 1
        return f"id-{self._n}"

    def kinds(self) -> list[str]:
        return [event.payload["kind"] for event in self.writer.events]

    def propose(self, raw: dict, proposal_id: str = "act-1", decision: str | None = "approved"):
        candidates = [
            ge.risky_action_proposed(SESSION_SCOPE, proposal_id=proposal_id, descriptor=parsed(raw))
        ]
        digest = candidates[0].payload["data"]["action_digest"]
        if decision is not None:
            builder = ge.risky_action_approved if decision == "approved" else ge.risky_action_rejected
            candidates.append(
                builder(
                    OPERATOR, proposal_id=proposal_id, action_digest=digest,
                    actor="operator", command_id=f"cmd-{proposal_id}",
                )
            )
        assert _run(self.port.append(MANSION, candidates)).ok
        return digest

    def execute(self, raw, proposal_id="act-1", scope: EventScope = SESSION_SCOPE, role="tinker"):
        return _run(
            self.executor.execute(
                scope, role=role, spec_name=SPEC, proposal_id=proposal_id, descriptor=raw
            )
        )

    def proposal(self, proposal_id="act-1"):
        return _run(self.port.projection(MANSION)).risky_proposals[proposal_id]


# --- guarded delete -----------------------------------------------------------------


def test_delete_runs_only_after_the_acknowledged_consumption(tmp_path):
    bench = Bench(tmp_path)
    bench.propose(delete_descriptor())
    result = bench.execute(delete_descriptor())

    assert (result.status, result.code) == ("succeeded", "deleted")
    assert not (bench.mansion / "src" / "old.py").exists()
    # The consumption record was already acknowledged when the unlink ran.
    assert bench.unlinked_after == [
        ["risky_action_proposed", "risky_action_approved", "risky_action_consumed"]
    ]
    assert bench.kinds()[-2:] == ["risky_action_consumed", "risky_action_succeeded"]
    assert bench.writer.calls[-2][0] == "cas" and bench.writer.calls[-2][1] == 2
    assert [event.sequence for event in result.events] == [3, 4]
    assert bench.proposal().status is ProposalStatus.SUCCEEDED

    # The approval was one attempt: an exact retry is refused and recorded.
    (bench.mansion / "src" / "old.py").write_text("again\n", encoding="utf-8")
    retry = bench.execute(delete_descriptor())
    assert (retry.status, retry.code) == ("denied", "proposal_consumed")
    assert (bench.mansion / "src" / "old.py").exists()
    denied = bench.writer.events[-1].payload
    assert denied["kind"] == "risky_action_denied" and denied["data"]["code"] == "proposal_consumed"
    assert bench.kinds().count("risky_action_consumed") == 1


def test_empty_directory_delete_and_a_failure_that_stays_consumed(tmp_path):
    bench = Bench(tmp_path)
    (bench.mansion / "empty").mkdir()
    raw = delete_descriptor("empty", arguments={"path": "empty", "target": "empty_directory"})
    bench.propose(raw)
    assert bench.execute(raw).status == "succeeded"
    assert not (bench.mansion / "empty").exists()

    full = delete_descriptor("src", arguments={"path": "src", "target": "empty_directory"})
    bench.propose(full, "act-2")
    failed = bench.execute(full, "act-2")
    assert (failed.status, failed.code) == ("failed", "directory_not_empty")
    assert (bench.mansion / "src" / "old.py").exists()
    assert bench.proposal("act-2").status is ProposalStatus.FAILED
    assert bench.kinds()[-2:] == ["risky_action_consumed", "risky_action_failed"]
    # A failed attempt does not restore the approval.
    assert bench.execute(full, "act-2").code == "proposal_consumed"


@pytest.mark.parametrize(
    ("decision", "status", "code"),
    [(None, "waiting", "proposal_pending"), ("rejected", "denied", "proposal_rejected")],
)
def test_undecided_and_rejected_proposals_never_run(tmp_path, decision, status, code):
    bench = Bench(tmp_path)
    bench.propose(delete_descriptor(), decision=decision)
    before = len(bench.writer.events)
    result = bench.execute(delete_descriptor())
    assert (result.status, result.code) == (status, code)
    assert (bench.mansion / "src" / "old.py").exists() and bench.unlinked_after == []
    assert "risky_action_consumed" not in bench.kinds()
    # Waiting is not a refused attempt; a rejection is.
    assert len(bench.writer.events) - before == (0 if decision is None else 1)


def test_any_changed_field_or_identity_is_refused_without_touching_the_target(tmp_path):
    bench = Bench(tmp_path)
    (bench.mansion / "src" / "other.py").write_text("x\n", encoding="utf-8")
    bench.propose(delete_descriptor())
    attempts = [
        (delete_descriptor("src/other.py"), SESSION_SCOPE, "act-1", "descriptor_mismatch"),
        (delete_descriptor(room="study"), SESSION_SCOPE, "act-1", "descriptor_mismatch"),
        ({"kind": "delete_path"}, SESSION_SCOPE, "act-1", "invalid_descriptor"),
        (delete_descriptor(), SESSION_SCOPE, "act-9", "proposal_missing"),
        (
            delete_descriptor(),
            EventScope(MANSION, "tinker-2", "workshop-slot-2", "implementation-2", 1),
            "act-1",
            "identity_mismatch",
        ),
    ]
    for raw, scope, proposal_id, code in attempts:
        result = bench.execute(raw, proposal_id, scope)
        assert (result.status, result.code) == ("denied", code)
        assert bench.writer.events[-1].payload["kind"] == "risky_action_denied"
        assert bench.writer.events[-1].payload["data"]["code"] == code
    assert (bench.mansion / "src" / "old.py").exists()
    assert (bench.mansion / "src" / "other.py").exists()
    assert bench.unlinked_after == [] and "risky_action_consumed" not in bench.kinds()
    # A study Ghost holding the right slot still has no delete in its room.
    wrong_room = bench.execute(delete_descriptor(), role="archivist")
    assert (wrong_room.status, wrong_room.code) == ("denied", "identity_mismatch")
    assert bench.execute(delete_descriptor(), role="nobody").code == "identity_unavailable"
    # The exact action is still available to its own session.
    assert bench.execute(delete_descriptor()).status == "succeeded"


@pytest.mark.parametrize("path", [".kiro/specs/demo-feature/tasks.md", ".env", "src/link.py"])
def test_an_approval_never_widens_room_policy(tmp_path, path):
    bench = Bench(tmp_path)
    target = bench.mansion / path
    target.parent.mkdir(parents=True, exist_ok=True)
    if path == "src/link.py":
        outside = bench.root / "outside.txt"
        outside.write_text("outside\n", encoding="utf-8")
        target.symlink_to(outside)
    else:
        target.write_text("keep\n", encoding="utf-8")
    raw = delete_descriptor(path)
    bench.propose(raw)

    result = bench.execute(raw)
    assert (result.status, result.code) == ("denied", "path_denied")
    assert target.exists() or target.is_symlink()
    assert bench.unlinked_after == []
    kinds = bench.kinds()
    assert kinds[-2:] == ["path_denied", "risky_action_denied"]
    assert "risky_action_consumed" not in kinds
    assert bench.writer.events[-2].payload["data"]["access"] == "delete"
    # The approval was not spent on a refused path.
    assert bench.proposal().status is ProposalStatus.APPROVED


def test_writer_and_integrity_failures_block_before_any_effect(tmp_path):
    bench = Bench(tmp_path)
    bench.propose(delete_descriptor())
    bench.writer.fail_next.append("failed")
    blocked = bench.execute(delete_descriptor())
    assert (blocked.status, blocked.code) == ("blocked", "writer_unavailable")
    assert (bench.mansion / "src" / "old.py").exists() and bench.unlinked_after == []

    bench.writer.fail_reads = True
    assert bench.execute(delete_descriptor()).code == "integrity_unavailable"
    bench.writer.fail_reads = False

    # A conflict (another record landed first) is retried against a fresh fold.
    bench.writer.fail_next.append("conflict")
    assert bench.execute(delete_descriptor()).status == "succeeded"
    assert bench.kinds().count("risky_action_consumed") == 1


def test_concurrent_claims_consume_once(tmp_path):
    bench = Bench(tmp_path)
    bench.propose(delete_descriptor())

    async def race():
        return await asyncio.gather(
            *(
                bench.executor.execute(
                    SESSION_SCOPE, role="tinker", spec_name=SPEC,
                    proposal_id="act-1", descriptor=delete_descriptor(),
                )
                for _ in range(5)
            )
        )

    results = _run(race())
    assert sorted(result.status for result in results) == ["denied"] * 4 + ["succeeded"]
    assert bench.kinds().count("risky_action_consumed") == 1
    assert len(bench.unlinked_after) == 1


def test_a_consumed_claim_without_an_outcome_is_settled_as_failed(tmp_path):
    bench = Bench(tmp_path)
    digest = bench.propose(delete_descriptor())
    crashed = ge.risky_action_consumed(
        SESSION_SCOPE, proposal_id="act-1", action_digest=digest,
        claim_id="claim-crashed", session_slot=SESSION_SCOPE.session_slot,
    )
    assert _run(bench.port.append(MANSION, [crashed])).ok

    settled = _run(bench.executor.settle_interrupted(MANSION))
    assert [event.payload["kind"] for event in settled] == ["risky_action_failed"]
    assert settled[0].payload["data"]["code"] == "interrupted"
    assert bench.proposal().status is ProposalStatus.FAILED
    assert _run(bench.executor.settle_interrupted(MANSION)) == ()
    assert (bench.mansion / "src" / "old.py").exists()


# --- command and git through the runner interface ----------------------------------------


def test_a_command_starts_only_after_consumption_and_records_a_content_free_outcome(tmp_path):
    bench = Bench(tmp_path)
    secret_output = "token=" + "s3cr3t-value-0123456789abcdef"
    bench.runner.outcome = ActionOutcome(False, "nonzero_exit", 2, 4096, secret_output, True, True)
    (bench.mansion / "tests").mkdir()
    (bench.mansion / "build").mkdir()
    bench.propose(command_descriptor())

    result = bench.execute(command_descriptor())
    assert (result.status, result.code, result.exit_code, result.output_bytes) == (
        "failed", "nonzero_exit", 2, 4096)
    assert bench.runner.calls == [
        ("run_command", ["risky_action_proposed", "risky_action_approved", "risky_action_consumed"])
    ]
    outcome = bench.writer.events[-1].payload
    assert outcome["kind"] == "risky_action_failed"
    assert outcome["data"] == {
        "proposal_id": "act-1",
        "action_digest": outcome["data"]["action_digest"],
        "claim_id": outcome["data"]["claim_id"],
        "code": "nonzero_exit",
        "exit_code": 2,
        "output_bytes": 4096,
    }
    # Output goes to the caller only; no canonical record holds any of it.
    assert all("s3cr3t" not in repr(event.payload) for event in bench.writer.events)
    assert bench.execute(command_descriptor()).code == "proposal_consumed"
    assert len(bench.runner.calls) == 1


def test_a_runner_crash_keeps_the_approval_consumed(tmp_path):
    bench = Bench(tmp_path)
    bench.runner.outcome = RuntimeError("boom with /Users/someone/secret")
    (bench.mansion / "tests").mkdir()
    (bench.mansion / "build").mkdir()
    bench.propose(command_descriptor())
    result = bench.execute(command_descriptor())
    assert (result.status, result.code, result.output) == ("failed", "runner_failed", "")
    assert bench.proposal().status is ProposalStatus.FAILED


@pytest.mark.parametrize("raw", [command_descriptor(), git_descriptor(), git_descriptor("commit")])
def test_command_and_git_fail_closed_without_confinement(tmp_path, raw):
    writer_runner = UnavailableRunner()
    bench = Bench(tmp_path, runner=writer_runner)
    for name in ("tests", "build"):
        (bench.mansion / name).mkdir()
    (bench.mansion / "src" / "app.py").write_text("x = 1\n", encoding="utf-8")
    bench.propose(raw)
    result = bench.execute(raw)
    assert (result.status, result.code) == ("denied", "confinement_unavailable")
    assert bench.kinds()[-1] == "risky_action_denied"
    assert "risky_action_consumed" not in bench.kinds()
    assert bench.proposal().status is ProposalStatus.APPROVED

    # Guarded delete does not depend on confinement.
    bench.propose(delete_descriptor(), "act-2")
    assert bench.execute(delete_descriptor(), "act-2").status == "succeeded"


def test_a_host_without_sandbox_exec_starts_no_process(tmp_path):
    for runner in (
        ConfinedRunner(platform="linux"),
        ConfinedRunner(sandbox_exec=str(tmp_path / "absent-sandbox-exec")),
    ):
        assert runner.available is False
        marker = tmp_path / "ran.txt"
        descriptor = parsed(
            command_descriptor(("python3", "-c", f"open({str(marker)!r}, 'w')"), path_intents=[])
        )
        outcome = runner.run_sync(descriptor, tmp_path)
        assert (outcome.succeeded, outcome.code, outcome.started) == (
            False, "confinement_unavailable", False)
        assert not marker.exists()


@pytest.mark.parametrize(
    "arguments",
    [
        {"operation": "push", "pathspecs": ["src/app.py"]},
        {"operation": "reset", "pathspecs": ["src/app.py"]},
        {"operation": "commit", "pathspecs": [], "message": "x", "no_verify": True},
        {"operation": "add", "pathspecs": ["src/app.py"], "force": True},
    ],
)
def test_unsupported_git_operations_cannot_be_described_or_run(tmp_path, arguments):
    raw = git_descriptor(arguments={**arguments})
    assert hasattr(parse_action_descriptor(raw), "code")
    bench = Bench(tmp_path)
    bench.propose(git_descriptor())
    result = bench.execute(raw)
    assert (result.status, result.code) == ("denied", "invalid_descriptor")
    assert bench.runner.calls == []


def test_shell_strings_and_caller_environments_have_no_field(tmp_path):
    for extra in ({"shell": "rm -rf ."}, {"env": {"PATH": "/tmp"}}):
        assert hasattr(parse_action_descriptor({**command_descriptor(), **extra}), "code")
        arguments = {**command_descriptor()["arguments"], **extra}
        assert hasattr(parse_action_descriptor(command_descriptor(arguments=arguments)), "code")


# --- the real no-fork sandbox --------------------------------------------------------------


def _mansion(tmp_path: Path) -> Path:
    mansion = Path(os.path.realpath(tmp_path)) / "mansions" / MANSION
    (mansion / "src").mkdir(parents=True)
    (mansion / "build").mkdir()
    (mansion / "src" / "a.txt").write_text("inside\n", encoding="utf-8")
    (mansion / ".env").write_text("VALUE=1\n", encoding="utf-8")
    (mansion.parent / "outside.txt").write_text("outside\n", encoding="utf-8")
    return mansion


def _command(argv, intents=(), timeout=10, working_directory=""):
    return parsed(
        command_descriptor(
            argv,
            working_directory=working_directory,
            arguments={"argv": list(argv), "timeout_seconds": timeout},
            path_intents=[{"access": access, "path": path} for access, path in intents],
        )
    )


@needs_sandbox
def test_a_confined_command_reads_the_mansion_and_writes_only_its_intents(tmp_path):
    mansion = _mansion(tmp_path)
    commands = {**default_commands(), "touch": AllowedCommand("/usr/bin/touch")}
    runner = ConfinedRunner(commands=commands)

    read = runner.run_sync(_command(("cat", "src/a.txt")), mansion)
    assert (read.succeeded, read.code, read.exit_code, read.output) == (True, "exited", 0, "inside\n")

    for argv in (("cat", str(mansion.parent / "outside.txt")), ("cat", ".env")):
        refused = runner.run_sync(_command(argv), mansion)
        assert (refused.succeeded, refused.code) == (False, "nonzero_exit")
        assert "outside\n" not in refused.output and "VALUE" not in refused.output

    assert not runner.run_sync(_command(("touch", "build/x")), mansion).succeeded
    assert not (mansion / "build" / "x").exists()
    allowed = _command(("touch", "build/x"), [("command_write", "build")])
    assert runner.run_sync(allowed, mansion).succeeded and (mansion / "build" / "x").exists()
    elsewhere = _command(("touch", "src/y"), [("command_write", "build")])
    assert not runner.run_sync(elsewhere, mansion).succeeded
    assert not (mansion / "src" / "y").exists()

    not_listed = runner.run_sync(_command(("rm", "-rf", "src")), mansion)
    assert (not_listed.code, not_listed.started) == ("command_not_allowed", False)
    assert (mansion / "src" / "a.txt").exists()


@needs_sandbox
def test_a_confined_command_has_no_child_no_network_a_fixed_environment_and_a_timeout(tmp_path):
    mansion = _mansion(tmp_path)
    runner = ConfinedRunner(known_secrets=["known-secret-value-123456"])
    if "python3" not in default_commands():
        pytest.skip("no real python3 interpreter to run harmless probes with")

    def python(code, timeout=10):
        return runner.run_sync(_command(("python3", "-I", "-S", "-c", code), timeout=timeout), mansion)

    assert python("print(6 * 7)").output == "42\n"
    child = python("import os; os.fork(); print('forked')")
    assert not child.succeeded and "forked" not in child.output
    network = python("import socket; socket.socket().connect(('127.0.0.1', 9))")
    assert not network.succeeded
    environment = python("import os; print(sorted(os.environ))")
    assert "KIROCREW" not in environment.output and "HOME" in environment.output
    assert os.environ.get("HOME", "") not in environment.output or os.environ.get("HOME") == "/var/empty"

    slow = python("import time; time.sleep(30)", timeout=1)
    assert (slow.succeeded, slow.code, slow.exit_code) == (False, "timed_out", None)

    loud = python("print('x' * 100000)")
    assert loud.truncated and loud.output_bytes > len(loud.output) > 0
    leaked = python("print('token is known-secret-value-123456')")
    assert "known-secret-value-123456" not in leaked.output and leaked.succeeded


@needs_sandbox
def test_a_hard_link_or_an_escaping_working_directory_prevents_the_start(tmp_path):
    mansion = _mansion(tmp_path)
    runner = ConfinedRunner()
    (mansion / "away").symlink_to(mansion.parent)
    escaped = runner.run_sync(_command(("cat", "outside.txt"), working_directory="away"), mansion)
    assert (escaped.code, escaped.started) == ("cwd_denied", False)

    os.link(mansion / "src" / "a.txt", mansion / "src" / "b.txt")
    linked = runner.run_sync(_command(("cat", "src/a.txt")), mansion)
    assert (linked.code, linked.started) == ("hard_link_present", False)


@needs_sandbox
def test_git_add_and_commit_run_confined_and_hooks_do_not(tmp_path):
    mansion = _mansion(tmp_path)
    runner = ConfinedRunner()
    if runner._git is None:  # noqa: SLF001 - availability of the real binary
        pytest.skip("no real git binary")
    subprocess.run(["git", "init", "-q", str(mansion)], check=True)
    hook = mansion / ".git" / "hooks" / "pre-commit"
    hook.write_text("#!/bin/sh\ntouch hook-ran.txt\n", encoding="utf-8")
    hook.chmod(0o755)

    add = runner.run_sync(parsed(git_descriptor("add", ("src/a.txt",))), mansion)
    assert (add.succeeded, add.code) == (True, "exited")
    commit = runner.run_sync(parsed(git_descriptor("commit", ("src/a.txt",))), mansion)
    assert (commit.succeeded, commit.code) == (True, "exited")
    assert not (mansion / "hook-ran.txt").exists()
    log = subprocess.run(
        ["git", "-C", str(mansion), "log", "--format=%s"], capture_output=True, text=True, check=True
    )
    assert log.stdout.strip() == "Add app module"


@needs_sandbox
def test_an_approved_command_runs_end_to_end_through_the_executor(tmp_path):
    bench = Bench(tmp_path, runner=ConfinedRunner())
    (bench.mansion / "build").mkdir()
    raw = command_descriptor(
        ("cat", "src/old.py"),
        arguments={"argv": ["cat", "src/old.py"], "timeout_seconds": 10},
        path_intents=[{"access": "command_read", "path": "src"}],
    )
    bench.propose(raw)
    result = bench.execute(raw)
    assert (result.status, result.code, result.exit_code) == ("succeeded", "exited", 0)
    assert result.output == "print('old')\n"
    assert bench.kinds()[-2:] == ["risky_action_consumed", "risky_action_succeeded"]
    assert bench.writer.events[-1].payload["data"]["output_bytes"] == len(result.output)
    assert all("print('old')" not in repr(event.payload) for event in bench.writer.events)
