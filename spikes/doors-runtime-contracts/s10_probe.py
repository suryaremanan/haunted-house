#!/usr/bin/env python3
"""S10: approved-process confinement probe (doors-and-guardrails 1.2).

Exercises the reference runner in ``confined_runner.py`` against an ephemeral
tree with harmless commands: allowed and denied project access, credential
shaped paths, loopback network, process escape, symbolic links, hard links,
environment, timeout, and git ``add``/``commit``.  Every denial is paired with
an unconfined control run, so a pass means the sandbox caused the denial.

Nothing outside the ephemeral tree is written.  The only read outside it is a
directory listing of the real home (expected to be refused; output discarded).

    python3 spikes/doors-runtime-contracts/s10_probe.py            # print report
    python3 spikes/doors-runtime-contracts/s10_probe.py --write    # refresh fixture
"""
from __future__ import annotations

import json
import os
import platform
import socket
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from confined_runner import Result, resolve_git, run_confined, sandbox_available  # noqa: E402

ROOT = Path(__file__).resolve().parent
FIXTURE = ROOT.parent / "fixtures" / "s10-approved-process-confinement.json"
WORK_PREFIX = ".probe-work-"
PARENT_SENTINEL = "HH_S10_PARENT_SENTINEL"

# Harmless helper run by the interpreter inside (or, for controls, outside)
# the sandbox.  It prints one token: ``ok`` or ``E:<errno name>``.
CHILD = r"""
import errno, os, socket, subprocess, sys, time
def attempt(action):
    try:
        action()
    except OSError as exc:
        return "E:" + errno.errorcode.get(exc.errno, "UNKNOWN")
    return "ok"
def write(path):
    with open(path, "a") as handle:
        handle.write("x")
def read(path):
    with open(path) as handle:
        handle.read()
def connect(port):
    with socket.create_connection(("127.0.0.1", int(port)), timeout=3):
        pass
def bind():
    with socket.socket() as server:
        server.bind(("127.0.0.1", 0))
def spawn(*argv):
    if subprocess.run(list(argv), capture_output=True).returncode != 0:
        raise OSError(errno.EPERM, "child failed")
def detach(inside, outside, delay):
    if os.fork():
        return
    os.setsid()
    if os.fork():
        os._exit(0)
    for fd in (0, 1, 2):
        os.close(fd)
    time.sleep(float(delay))
    attempt(lambda: write(outside))
    attempt(lambda: write(inside))
    os._exit(0)
def linger(marker, delay):
    if os.fork() == 0:
        time.sleep(float(delay))
        attempt(lambda: write(marker))
        os._exit(0)
    time.sleep(60)
ACTIONS = {
    "read": read, "write": write, "listdir": os.listdir, "connect": connect,
    "bind": bind, "link": os.link, "spawn": spawn, "detach": detach, "linger": linger,
    "fork": lambda: os._exit(0) if os.fork() == 0 else None,
}
if sys.argv[1] == "env":
    print(",".join(sorted(os.environ)))
else:
    print(attempt(lambda: ACTIONS[sys.argv[1]](*sys.argv[2:])))
"""

EVIDENCE = {
    "verified": [
        "A deny-default Seatbelt profile lets one exact argv read and write below the Mansion "
        "and refuses reads and writes of a sibling Mansion, a credential-shaped file, the "
        "real home listing, and Protected_Paths inside the Mansion.",
        "Loopback connect and bind are refused inside the sandbox and succeed in the control.",
        "Without process-fork the command cannot create any child, so nothing can outlive it.",
        "A nested sandbox-exec cannot loosen the policy; it fails to apply.",
        "Reads and writes through a symbolic link that leaves the Mansion are refused.",
        "A hard link that already sits inside the Mansion defeats the path-based sandbox; the "
        "runner's pre-start scan refuses to start, and the sandbox refuses to create such a link.",
        "The child sees only the runner's fixed environment; the working directory is validated "
        "before start; a timeout kills the command's process group.",
        "With process-fork allowed, a child that calls setsid outlives the runner, although it "
        "stays inside the same sandbox.",
    ],
    "inferred": [
        "Outbound connections to real hosts are refused by the same deny-default network rule "
        "that refused loopback; no real host was contacted.",
        "Keychain and other system services are unreachable because the profile allows no "
        "mach-lookup; no keychain call was made.",
        "sandbox-exec is deprecated by Apple but present; Crew 0.12.2 ships its own Seatbelt "
        "launcher, so the mechanism is in use on this platform.",
        "Crew's default agent.sandbox setting wraps kiro-cli in sandbox-exec on macOS, so an MCP "
        "server it starts is already sandboxed and cannot apply this profile itself (Crew's own "
        "setting text: nested seatbelt causes EPERM).",
    ],
    "unverified": [
        {
            "claim": "The installed Haunted House backend can apply a sandbox, i.e. Crew does not "
            "already run it inside one (a nested sandbox-exec fails).",
            "needs": "owner action on a real gateway",
            "manual_step": "With the app installed and trusted, call the backend's startup "
            "confinement canary (run_confined on /usr/bin/touch outside the Mansion must be "
            "refused, inside must succeed) and read the result from the signed status route.",
        },
        {
            "claim": "Any confinement on Linux or Windows hosts.",
            "needs": "a non-macOS host",
            "manual_step": "Run this probe there; without sandbox-exec it reports "
            "confinement_unavailable and both actions stay disabled.",
        },
    ],
}
GUIDANCE = {
    "runner_location": "Run confined actions from the app backend process, behind a startup "
    "canary. A process that is already sandboxed cannot apply a second sandbox, so an MCP "
    "server started by a sandboxed kiro-cli must ask the backend through the capability-bound "
    "operation instead of spawning the command itself.",
    "delete_path": "Independent of S10: an in-process Path_Guard operation, no child process.",
    "run_command": "Only through the no-fork profile: absolute allowlisted executable, exact "
    "argv, fixed environment, guarded cwd, timeout, bounded output. A command that must "
    "spawn children returns confinement_unavailable; do not offer a fork-allowed mode.",
    "git_write": "Only add and commit through the no-fork profile with the real git binary, "
    "-c core.hooksPath=/dev/null, -c core.fsmonitor=false, -c gc.auto=0, "
    "-c commit.gpgsign=false, identity from trusted configuration, and .git writable only "
    "for this action kind. Enabled only when the git checks below are true on the host.",
    "hard_links": "Refuse to start while any regular file below the Mansion has more than one "
    "link, in addition to Path_Guard's per-file check.",
    "fallback": "On a host without sandbox-exec, or when the startup canary fails, command and "
    "git return confinement_unavailable without starting a process.",
}


class Bench:
    """An ephemeral Mansion, a sibling, and a fake credential file."""

    def __init__(self, work: Path) -> None:
        self.work = Path(os.path.realpath(work))
        self.mansion = self.work / "mansions" / "alpha"
        self.sibling = self.work / "mansions" / "beta"
        self.fake_home = self.work / "fake-home"
        for directory in (
            self.mansion / "src",
            self.mansion / ".haunted-house",
            self.sibling,
            self.fake_home / ".aws",
        ):
            directory.mkdir(parents=True)
        (self.mansion / "src" / "inside.txt").write_text("inside\n", encoding="utf-8")
        (self.sibling / "outside.txt").write_text("outside\n", encoding="utf-8")
        self.credential = self.fake_home / ".aws" / "credentials"
        self.credential.write_text("synthetic placeholder, not a credential\n", encoding="utf-8")
        self.interpreter = os.path.realpath(sys.executable)
        self.tool_roots = sorted({os.path.realpath(sys.base_prefix), os.path.dirname(self.interpreter)})

    def child(self, *args: str, confine: bool = True, **options: Any) -> str:
        """Run one helper action; return its token or the runner's refusal code."""
        result = run_confined(
            [self.interpreter, "-I", "-S", "-c", CHILD, *map(str, args)],
            mansion=self.mansion,
            cwd=options.pop("cwd", self.mansion),
            tool_roots=self.tool_roots,
            confine=confine,
            **options,
        )
        if result.status != "completed":
            return result.code
        return result.output.strip().splitlines()[-1] if result.output.strip() else "no_output"

    def denied(self, *args: str, **options: Any) -> bool:
        """Refused inside the sandbox AND allowed in the unconfined control."""
        return self.child(*args, **options) == "E:EPERM" and self.child(*args, confine=False) == "ok"


def file_checks(bench: Bench) -> dict[str, bool]:
    inside = bench.mansion / "src" / "inside.txt"
    return {
        "readInsideMansionAllowed": bench.child("read", inside) == "ok",
        "writeInsideMansionAllowed": bench.child("write", bench.mansion / "src" / "new.txt") == "ok",
        "readSiblingMansionDenied": bench.denied("read", bench.sibling / "outside.txt"),
        "writeSiblingMansionDenied": bench.denied("write", bench.sibling / "new.txt"),
        "readCredentialShapedPathDenied": bench.denied("read", bench.credential),
        "listRealHomeDenied": bench.denied("listdir", Path.home()),
        "writeTempDirDenied": bench.denied("write", bench.work / "stray.txt"),
        "writePrivateStateInsideMansionDenied": bench.denied(
            "write", bench.mansion / ".haunted-house" / "state"
        ),
        "readPrivateStateInsideMansionDenied": bench.child(
            "listdir", bench.mansion / ".haunted-house"
        )
        == "E:EPERM",
        "cwdOutsideMansionRefusedBeforeStart": bench.child("read", inside, cwd=bench.sibling)
        == "cwd_denied",
    }


def network_checks(bench: Bench) -> dict[str, bool]:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen(4)
        port = listener.getsockname()[1]
        return {
            "loopbackConnectDenied": bench.denied("connect", port),
            "loopbackBindDenied": bench.denied("bind"),
        }


def process_checks(bench: Bench) -> dict[str, bool]:
    outside = bench.sibling / "spawned.txt"
    checks = {
        "forkDeniedByDefault": bench.denied("fork"),
        "spawnDeniedByDefault": bench.child("spawn", "/usr/bin/true") == "E:EPERM",
        "childInheritsSandboxWhenForkAllowed": bench.child(
            "spawn", "/usr/bin/touch", outside, allow_fork=True
        )
        == "E:EPERM"
        and not outside.exists(),
        "nestedSandboxCannotLoosen": bench.child(
            "spawn",
            "/usr/bin/sandbox-exec",
            "-p",
            "(version 1)(allow default)",
            "/usr/bin/touch",
            outside,
            allow_fork=True,
        )
        == "E:EPERM"
        and not outside.exists(),
    }
    # Timeout: a same-group child that would write later must die with the group.
    late = bench.mansion / "src" / "late.txt"
    checks["timeoutKillsProcessGroup"] = (
        bench.child("linger", late, "1.5", allow_fork=True, timeout=0.5) == "timed_out"
    )
    # Lifetime escape: a setsid grandchild is outside the group the runner kills.
    survivor_in = bench.mansion / "src" / "survivor.txt"
    survivor_out = bench.sibling / "survivor.txt"
    started = bench.child("detach", survivor_in, survivor_out, "1.0", allow_fork=True) == "ok"
    time.sleep(2.5)
    checks["timeoutKillsProcessGroup"] &= not late.exists()
    checks["detachedChildOutlivesRunnerWhenForkAllowed"] = started and survivor_in.exists()
    checks["detachedChildStaysConfined"] = started and not survivor_out.exists()
    checks["detachImpossibleWithoutFork"] = (
        bench.child("detach", bench.mansion / "src" / "never.txt", survivor_out, "0") == "E:EPERM"
    )
    return checks


def link_checks(bench: Bench) -> dict[str, bool]:
    target = bench.sibling / "outside.txt"
    symlink = bench.mansion / "src" / "sym.txt"
    os.symlink(target, symlink)
    checks = {
        "readThroughEscapingSymlinkDenied": bench.denied("read", symlink),
        "writeThroughEscapingSymlinkDenied": bench.child("write", symlink) == "E:EPERM"
        and target.read_text(encoding="utf-8") == "outside\n",
        "createHardLinkToOutsideDenied": bench.denied(
            "link", target, bench.mansion / "src" / "made-inside.txt"
        ),
    }
    (bench.mansion / "src" / "made-inside.txt").unlink(missing_ok=True)  # made by the control run
    planted = bench.mansion / "src" / "hard.txt"
    os.link(target, planted)
    checks["startRefusedWhileHardLinkPresent"] = bench.child("write", planted) == "hard_link_present"
    checks["hardLinkTargetUnchangedAfterRefusal"] = target.read_text(encoding="utf-8") == "outside\n"
    # The weakness the scan closes: with the scan off, the sandbox alone lets
    # the write reach the outside inode through its inside name.
    checks["preexistingHardLinkDefeatsSandboxAlone"] = (
        bench.child("write", planted, scan_links=False) == "ok"
        and target.read_text(encoding="utf-8") == "outside\nx"
    )
    planted.unlink()
    target.write_text("outside\n", encoding="utf-8")
    return checks


def environment_checks(bench: Bench) -> dict[str, bool]:
    os.environ[PARENT_SENTINEL] = "present"
    try:
        names = set(bench.child("env").split(","))
    finally:
        del os.environ[PARENT_SENTINEL]
    expected = {
        "PATH",
        "HOME",
        "LANG",
        "LC_ALL",
        "GIT_CONFIG_NOSYSTEM",
        "GIT_CONFIG_GLOBAL",
        "GIT_TERMINAL_PROMPT",
        "GIT_OPTIONAL_LOCKS",
    }
    return {
        "parentEnvironmentNotInherited": PARENT_SENTINEL not in names,
        # macOS adds __CF_USER_TEXT_ENCODING to every process; nothing else may appear.
        "onlyFixedEnvironmentVisible": names - {"__CF_USER_TEXT_ENCODING"} == expected,
    }


def git_checks(bench: Bench) -> dict[str, bool]:
    """git add/commit under the no-fork profile, with planted execution vectors."""
    resolved = resolve_git()
    if resolved is None:
        return {"gitBinaryResolved": False}
    git, git_root = resolved
    safe = [
        git,
        "-c", "core.hooksPath=/dev/null",
        "-c", "core.fsmonitor=false",
        "-c", "gc.auto=0",
        "-c", "commit.gpgsign=false",
        "-c", "user.name=Haunted House",
        "-c", "user.email=ghost@haunted-house.invalid",
    ]  # fmt: skip

    def run(*args: str, **options: Any) -> Result:
        return run_confined(
            [*safe, *args], mansion=bench.mansion, cwd=bench.mansion, tool_roots=[git_root], **options
        )

    init = run("init", "-q", git_write=True)
    hook_marker = bench.mansion / "src" / "hook-ran.txt"
    monitor_marker = bench.mansion / "src" / "fsmonitor-ran.txt"
    hooks = bench.mansion / ".git" / "hooks"
    hooks.mkdir(exist_ok=True)
    hook = hooks / "pre-commit"
    hook.write_text(f"#!/bin/sh\n/usr/bin/touch '{hook_marker}'\n", encoding="utf-8")
    hook.chmod(0o755)
    monitor = bench.mansion / "src" / "monitor.sh"
    monitor.write_text(f"#!/bin/sh\n/usr/bin/touch '{monitor_marker}'\n", encoding="utf-8")
    monitor.chmod(0o755)
    with open(bench.mansion / ".git" / "config", "a", encoding="utf-8") as handle:
        handle.write(f"[core]\n\tfsmonitor = {monitor}\n")
    read_only = run("add", "src/inside.txt")
    add = run("add", "src/inside.txt", git_write=True)
    commit = run("commit", "-q", "-m", "probe commit", git_write=True)
    log = run("log", "--oneline")

    # The planted fsmonitor is a real execution vector: an unconfined git that
    # does not override it runs the script.  The no-fork profile alone stops it.
    def status(confine: bool) -> Result:
        return run_confined(
            [git, "status", "--porcelain"],
            mansion=bench.mansion,
            cwd=bench.mansion,
            tool_roots=[git_root],
            git_write=True,
            confine=confine,
        )

    status(True)
    blocked_by_no_fork = not monitor_marker.exists()
    status(False)
    vector_is_real = monitor_marker.exists()
    monitor_marker.unlink(missing_ok=True)

    # A push to a sibling repository on this host must change nothing there.
    remote = bench.sibling / "remote.git"
    remote.mkdir()
    run_confined([git, "init", "-q", "--bare", "."], mansion=remote, cwd=remote, confine=False)
    run("remote", "add", "origin", os.fspath(remote), git_write=True)
    push = run("push", "origin", "HEAD", git_write=True)
    return {
        "gitBinaryResolved": True,
        "gitInitWorksWithoutFork": init.returncode == 0,
        "gitAddRefusedWithoutGitWrite": read_only.returncode not in (0, None),
        "gitAddWorksWithoutFork": add.returncode == 0,
        "gitCommitWorksWithoutFork": commit.returncode == 0
        and log.returncode == 0
        and "probe commit" in log.output,
        "plantedHookDidNotRun": not hook_marker.exists(),
        "plantedFsmonitorBlockedByNoForkAlone": blocked_by_no_fork,
        "plantedFsmonitorRunsInUnconfinedControl": vector_is_real,
        "gitPushToSiblingRepositoryFails": push.returncode not in (0, None)
        and not any((remote / "refs" / "heads").iterdir()),
    }


SECTIONS = {
    "files": file_checks,
    "network": network_checks,
    "process": process_checks,
    "links": link_checks,
    "environment": environment_checks,
    "git": git_checks,
}
# Verified findings that are true but are weaknesses, not passes.
FINDINGS = {
    ("process", "detachedChildOutlivesRunnerWhenForkAllowed"),
    ("links", "preexistingHardLinkDefeatsSandboxAlone"),
    ("git", "plantedFsmonitorRunsInUnconfinedControl"),
}


def decide(checks: dict[str, dict[str, bool]]) -> dict[str, Any]:
    def all_true(section: str) -> bool:
        return all(
            value for name, value in checks[section].items() if (section, name) not in FINDINGS
        )

    base = all(all_true(section) for section in ("files", "network", "process", "links", "environment"))
    fork_escape = checks["process"]["detachedChildOutlivesRunnerWhenForkAllowed"]
    git = base and all_true("git")
    return {
        "delete_path": "enabled_independent_of_confinement",
        "run_command": "enabled_no_fork_profile_only" if base else "disabled_confinement_unavailable",
        "git_write": "enabled_add_commit_no_fork_profile_only" if git else "disabled_confinement_unavailable",
        "forkAllowedMode": "never_offered" if fork_escape or not base else "not_needed",
        "requiresStartupCanary": True,
        "otherPlatforms": "disabled_confinement_unavailable",
    }


def unavailable_report() -> dict[str, Any]:
    return {
        "spike": "S10",
        "schema_version": 1,
        "task": "doors-and-guardrails 1.2",
        "platform": platform.system().lower(),
        "mechanism": "none",
        "outcome": "confinement_unavailable",
        "checks": {},
        "failedChecks": [],
        "decision": {
            "delete_path": "enabled_independent_of_confinement",
            "run_command": "disabled_confinement_unavailable",
            "git_write": "disabled_confinement_unavailable",
            "forkAllowedMode": "never_offered",
            "requiresStartupCanary": True,
            "otherPlatforms": "disabled_confinement_unavailable",
        },
        "evidence": EVIDENCE,
        "guidance": GUIDANCE,
    }


def run_probe() -> tuple[dict[str, Any], int]:
    if not sandbox_available():
        return unavailable_report(), 0
    with tempfile.TemporaryDirectory(prefix=WORK_PREFIX, dir=ROOT) as raw_work:
        bench = Bench(Path(raw_work))
        checks = {name: dict(sorted(section(bench).items())) for name, section in SECTIONS.items()}
    failed = sorted(
        f"{section}.{name}"
        for section, values in checks.items()
        for name, value in values.items()
        if not value and (section, name) not in FINDINGS
    )
    decision = decide(checks)
    proven = decision["run_command"].startswith("enabled")
    report = {
        "spike": "S10",
        "schema_version": 1,
        "task": "doors-and-guardrails 1.2",
        "platform": "darwin",
        "mechanism": "sandbox-exec deny-default profile, no process-fork",
        "outcome": "single_process_confinement_verified" if proven else "confinement_unproved",
        "checks": checks,
        "failedChecks": failed,
        "decision": decision,
        "evidence": EVIDENCE,
        "guidance": GUIDANCE,
    }
    text = json.dumps(report)
    if str(Path.home()) in text or tempfile.gettempdir() in text:
        raise ValueError("absolute path in report")
    return report, 0 if not failed else 1


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
