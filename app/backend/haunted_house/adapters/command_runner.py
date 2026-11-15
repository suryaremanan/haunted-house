"""Approved Risky_Action execution: guarded delete, confined command, git.

Two pieces live here.

``ConfinedRunner`` starts one exact argv inside the S10 no-fork
``sandbox-exec`` profile: deny by default, reads limited to the Mansion and
fixed system roots, writes limited to the approved write intents (or the
repository metadata for a git action), no network, no child process, a fixed
environment, a timeout that kills the process group, and bounded output.  It
runs in the backend, never in the MCP process, and only after a startup
canary proved on this host that the profile both runs and refuses.  When the
canary fails, or ``sandbox-exec`` is absent, every command and git action is
``confinement_unavailable`` and no process is started.

``ApprovedActionExecutor`` is the one path from an execution request to a
side effect.  It folds the canonical ledger, collects a Path_Guard decision
for every path intent, compare-and-appends the exact consumption record, and
dispatches only after the writer acknowledged it.  A delete is an in-process
Path_Guard operation and does not depend on confinement.  The outcome is a
content-free domain record; a failure never restores the approval.

There is no shell, no caller environment, no push, reset, clean, or branch
operation, and no recursive delete.
"""

from __future__ import annotations

import asyncio
import os
import secrets
import selectors
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Protocol, cast

from haunted_house.adapters.guarded_filesystem import (
    GuardedFilesystem,
    GuardedFilesystemError,
)
from haunted_house.adapters.guardrail_port import GuardrailPort, GuardrailRead
from haunted_house.core import guardrail_events as events_module
from haunted_house.core.action_descriptor import ActionDescriptor
from haunted_house.core.approvals import (
    ApprovalLedger,
    ExecutionRequest,
    ProposalStatus,
    authorize_execution,
    build_outcome_candidate,
    decide_consumption,
)
from haunted_house.core.deep_redact import DeepRedactionError, deep_redact
from haunted_house.core.guardrail_events import GuardrailPayloadError
from haunted_house.core.path_policy import (
    Access,
    PathDecision,
    PathDecisionCode,
    RoomPolicy,
    room_policy,
)
from haunted_house.core.seance_event import AppEvent, AppEventCandidate, EventScope

__all__ = [
    "DEFAULT_COMMANDS",
    "GIT_TIMEOUT_SECONDS",
    "MAX_OUTPUT_BYTES",
    "SANDBOX_EXEC",
    "ActionOutcome",
    "ActionRunner",
    "AllowedCommand",
    "ApprovedActionExecutor",
    "ConfinedRunner",
    "ExecutionResult",
    "UnavailableRunner",
    "default_commands",
    "resolve_git",
]

SANDBOX_EXEC = "/usr/bin/sandbox-exec"
MAX_OUTPUT_BYTES = 16 * 1024
GIT_TIMEOUT_SECONDS = 60
_CANARY_TIMEOUT_SECONDS = 10.0
_CAS_ATTEMPTS = 4
_CONTROL_DIRECTORY = "." + "haunted-house"

# The child sees exactly this environment; nothing is inherited.
TRUSTED_ENV: Mapping[str, str] = {
    "PATH": "/usr/bin:/bin",
    "HOME": "/var/empty",
    "LANG": "C",
    "LC_ALL": "C",
    "GIT_CONFIG_NOSYSTEM": "1",
    "GIT_CONFIG_GLOBAL": "/dev/null",
    "GIT_TERMINAL_PROMPT": "0",
    "GIT_OPTIONAL_LOCKS": "0",
    "PYTHONDONTWRITEBYTECODE": "1",
}
_SYSTEM_READ_ROOTS = (
    "/usr",
    "/bin",
    "/sbin",
    "/System",
    "/Library",
    "/private/etc",
    "/private/var/db",
    "/dev",
)
# Later rules win in SBPL, so every denial sits after the allows.
_PROFILE = """(version 1)
(deny default)
(allow process-exec)
(allow signal (target self))
(allow sysctl-read)
(allow file-read-metadata)
(allow file-read* (literal "/") {read_roots})
(allow file-write* (literal "/dev/null"))
(allow file-read* (subpath (param "MANSION")))
{writes}
(deny file-read* file-write* (subpath (param "PRIVATE")))
(deny file-read* file-write* (regex #"/\\.env($|\\.|rc$)") (regex #"/\\.(ssh|aws|gnupg|kube|docker)(/|$)") (regex #"/\\.(netrc|npmrc|pypirc|git-credentials)$") (regex #"\\.(pem|key|p12|pfx|keystore|jks|secret)$") (regex #"/id_(rsa|dsa|ecdsa|ed25519)[^/]*$") (regex #"/(credentials|secrets)(\\.[^/]*)?$"))
{git}
"""
_GIT_SAFE_CONFIG = (
    "-c", "core.hooksPath=/dev/null",
    "-c", "core.fsmonitor=false",
    "-c", "gc.auto=0",
    "-c", "maintenance.auto=false",
    "-c", "commit.gpgsign=false",
    "-c", "user.name=Haunted House",
    "-c", "user.email=ghost@haunted-house.invalid",
)


@dataclass(frozen=True, slots=True)
class AllowedCommand:
    """One allowlisted executable: its real absolute path and read roots."""

    executable: str
    read_roots: tuple[str, ...] = ()


def _resolve_python() -> AllowedCommand | None:
    """A real interpreter, bypassing the Xcode shim (which needs to fork)."""

    candidates: list[tuple[str, tuple[str, ...]]] = [
        ("/Library/Developer/CommandLineTools/usr/bin/python3", ()),
    ]
    own = getattr(sys, "_base_executable", None) or sys.executable
    if own:
        candidates.append((own, (os.path.realpath(sys.base_prefix),)))
    for candidate, roots in candidates:
        real = os.path.realpath(candidate)
        if os.path.isfile(real) and os.access(real, os.X_OK):
            return AllowedCommand(real, roots)
    return None


def default_commands() -> dict[str, AllowedCommand]:
    """The fixed allowlist: a name an operator reads, and the real binary."""

    found: dict[str, AllowedCommand] = {}
    python = _resolve_python()
    if python is not None:
        found["python3"] = python
    for name, candidate in (("ls", "/bin/ls"), ("cat", "/bin/cat")):
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            found[name] = AllowedCommand(candidate)
    return found


DEFAULT_COMMANDS = default_commands


def resolve_git() -> AllowedCommand | None:
    """The real git binary and its install root, bypassing the Xcode shim."""

    candidates = [
        "/Library/Developer/CommandLineTools/usr/bin/git",
        "/Applications/Xcode.app/Contents/Developer/usr/bin/git",
        "/opt/homebrew/bin/git",
        "/usr/local/bin/git",
    ]
    found = shutil.which("git", path="/opt/homebrew/bin:/usr/local/bin")
    if found:
        candidates.append(found)
    for candidate in candidates:
        real = os.path.realpath(candidate)
        if os.path.isfile(real) and os.access(real, os.X_OK):
            return AllowedCommand(real, (os.path.dirname(os.path.dirname(real)),))
    return None


@dataclass(frozen=True, slots=True)
class ActionOutcome:
    """What one dispatch did.  ``output`` is bounded, redacted, and for the
    calling Ghost only; it is never part of a canonical record."""

    succeeded: bool
    code: str
    exit_code: int | None = None
    output_bytes: int = 0
    output: str = ""
    truncated: bool = False
    started: bool = False


class ActionRunner(Protocol):
    """Runs one already-consumed command or git action."""

    @property
    def available(self) -> bool: ...

    async def run(self, descriptor: ActionDescriptor, mansion_directory: Path) -> ActionOutcome: ...


class UnavailableRunner:
    """The runner of a host where confinement cannot be proven."""

    available = False

    async def run(self, descriptor: ActionDescriptor, mansion_directory: Path) -> ActionOutcome:
        return ActionOutcome(False, "confinement_unavailable")


@dataclass(frozen=True, slots=True)
class _Raw:
    status: Literal["completed", "timeout"]
    returncode: int | None
    data: bytes
    total: int


def _find_multiply_linked(root: str) -> bool:
    """Whether any regular file below ``root`` has a second hard link.

    Seatbelt rules are path based, so a second name for an outside inode
    already inside the Mansion would be writable through the sandbox.
    """

    for directory, _names, files in os.walk(root, followlinks=False):
        for name in files:
            try:
                info = os.lstat(os.path.join(directory, name))
            except OSError:
                return True
            if stat.S_ISREG(info.st_mode) and info.st_nlink > 1:
                return True
    return False


def _run_process(
    command: Sequence[str], *, cwd: str, timeout: float, max_output: int
) -> _Raw:
    process = subprocess.Popen(  # noqa: S603 - exact argv, never a shell
        list(command),
        cwd=cwd,
        env=dict(TRUSTED_ENV),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    deadline = time.monotonic() + timeout
    kept = bytearray()
    total = 0
    status: Literal["completed", "timeout"] = "completed"
    assert process.stdout is not None
    stream = process.stdout
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(stream, selectors.EVENT_READ)
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    status = "timeout"
                    break
                if not selector.select(remaining):
                    continue
                chunk = os.read(stream.fileno(), 65536)
                if not chunk:
                    break
                total += len(chunk)
                if len(kept) < max_output:
                    kept.extend(chunk[: max_output - len(kept)])
        if status == "completed":
            try:
                process.wait(max(0.0, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                status = "timeout"
    finally:
        # Reap everything still in the command's process group.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass
        if process.poll() is None:
            process.wait()
        stream.close()
    return _Raw(status, process.returncode if status == "completed" else None, bytes(kept), total)


def _safe_root(root: str) -> bool:
    return os.path.isabs(root) and '"' not in root and "\\" not in root and "\n" not in root


class ConfinedRunner:
    """Runs exact argv inside the no-fork Seatbelt profile, or not at all."""

    def __init__(
        self,
        *,
        commands: Mapping[str, AllowedCommand] | None = None,
        git: AllowedCommand | None = None,
        known_secrets: Iterable[str | None] = (),
        max_output_bytes: int = MAX_OUTPUT_BYTES,
        sandbox_exec: str = SANDBOX_EXEC,
        platform: str = sys.platform,
    ) -> None:
        self._commands = dict(default_commands() if commands is None else commands)
        self._git = resolve_git() if git is None else git
        self._secrets = tuple(known_secrets)
        self._max_output = int(max_output_bytes)
        self._sandbox_exec = sandbox_exec
        self._platform = platform
        self._proven: bool | None = None

    # --- availability ----------------------------------------------------------------

    @property
    def available(self) -> bool:
        """True only after the startup canary proved confinement here."""

        if self._proven is None:
            self._proven = self._canary()
        return self._proven

    def probe(self) -> bool:
        """Run the canary again (startup calls this once)."""

        self._proven = self._canary()
        return self._proven

    def _sandbox_present(self) -> bool:
        return self._platform == "darwin" and os.access(self._sandbox_exec, os.X_OK)

    def _canary(self) -> bool:
        """Prove on this host that the profile runs and that it refuses.

        A sandboxed backend cannot apply a second sandbox; then the allowed
        read fails too and confinement is reported unavailable.
        """

        if not self._sandbox_present():
            return False
        reader = "/bin/cat"
        if not os.access(reader, os.X_OK):
            return False
        try:
            bench = os.path.realpath(tempfile.mkdtemp(prefix="hh-canary-"))
        except OSError:
            return False
        try:
            inside = os.path.join(bench, "mansion")
            os.mkdir(inside)
            marker = secrets.token_hex(8)
            for path in (os.path.join(inside, "inside.txt"), os.path.join(bench, "outside.txt")):
                with open(path, "w", encoding="utf-8") as handle:
                    handle.write(marker)
            allowed = self._confined(
                [reader, os.path.join(inside, "inside.txt")],
                mansion=inside, cwd=inside, writes=(), git_write=False, read_roots=(),
                timeout=_CANARY_TIMEOUT_SECONDS,
            )
            refused = self._confined(
                [reader, os.path.join(bench, "outside.txt")],
                mansion=inside, cwd=inside, writes=(), git_write=False, read_roots=(),
                timeout=_CANARY_TIMEOUT_SECONDS,
            )
            return (
                allowed.status == "completed"
                and allowed.returncode == 0
                and allowed.data.decode("utf-8", "replace") == marker
                and refused.status == "completed"
                and refused.returncode not in (0, None)
                and marker.encode() not in refused.data
            )
        except (OSError, ValueError):
            return False
        finally:
            shutil.rmtree(bench, ignore_errors=True)

    # --- execution ---------------------------------------------------------------------

    def _confined(
        self,
        argv: Sequence[str],
        *,
        mansion: str,
        cwd: str,
        writes: Sequence[str],
        git_write: bool,
        read_roots: Sequence[str],
        timeout: float,
    ) -> _Raw:
        roots = (*_SYSTEM_READ_ROOTS, *read_roots)
        if not all(_safe_root(root) for root in roots):
            raise ValueError("unsafe_read_root")
        parameters = {
            "MANSION": mansion,
            "PRIVATE": os.path.join(mansion, _CONTROL_DIRECTORY),
            "GITDIR": os.path.join(mansion, ".git"),
        }
        write_rules: list[str] = []
        if git_write:
            write_rules.append('(allow file-write* (subpath (param "GITDIR")))')
        for index, path in enumerate(writes):
            parameters[f"W{index}"] = path
            write_rules.append(f'(allow file-write* (subpath (param "W{index}")))')
        profile = _PROFILE.format(
            read_roots=" ".join(f'(subpath "{root}")' for root in roots),
            writes="\n".join(write_rules),
            git="" if git_write else '(deny file-write* (subpath (param "GITDIR")))',
        )
        command = [self._sandbox_exec]
        for key, value in parameters.items():
            if "\x00" in value:
                raise ValueError("unsafe_parameter")
            command += ["-D", f"{key}={value}"]
        command += ["-p", profile, *argv]
        return _run_process(command, cwd=cwd, timeout=timeout, max_output=self._max_output)

    async def run(self, descriptor: ActionDescriptor, mansion_directory: Path) -> ActionOutcome:
        return await asyncio.to_thread(self.run_sync, descriptor, mansion_directory)

    def run_sync(self, descriptor: ActionDescriptor, mansion_directory: Path) -> ActionOutcome:
        """Run one command or git descriptor.  Path intents were already
        judged by Path_Guard; this adds the host-level confinement."""

        if descriptor.kind not in ("run_command", "git_write"):
            return ActionOutcome(False, "unsupported_action")
        if not self.available:
            return ActionOutcome(False, "confinement_unavailable")
        mansion = os.path.realpath(mansion_directory)
        if not os.path.isdir(mansion):
            return ActionOutcome(False, "mansion_unavailable")
        cwd = os.path.join(mansion, *descriptor.working_directory.split("/")) if (
            descriptor.working_directory
        ) else mansion
        if os.path.realpath(cwd) != cwd or not os.path.isdir(cwd):
            # A link or a missing directory: never start somewhere else.
            return ActionOutcome(False, "cwd_denied")

        git_write = descriptor.kind == "git_write"
        arguments = descriptor.arguments
        writes: list[str] = []
        if git_write:
            if self._git is None:
                return ActionOutcome(False, "git_unavailable")
            operation = arguments.get("operation")
            pathspecs = [str(item) for item in cast(Sequence[object], arguments.get("pathspecs", ()))]
            argv = [self._git.executable, "--literal-pathspecs", *_GIT_SAFE_CONFIG]
            if operation == "add":
                argv += ["add", "--", *pathspecs]
            elif operation == "commit":
                argv += ["commit", "--no-gpg-sign", "-m", str(arguments.get("message", ""))]
                if pathspecs:
                    argv += ["--", *pathspecs]
            else:
                return ActionOutcome(False, "unsupported_action")
            read_roots = self._git.read_roots
            timeout = float(GIT_TIMEOUT_SECONDS)
        else:
            requested = [str(item) for item in cast(Sequence[object], arguments.get("argv", ()))]
            allowed = self._commands.get(requested[0]) if requested else None
            if allowed is None or not os.path.isabs(allowed.executable):
                return ActionOutcome(False, "command_not_allowed")
            if any("\x00" in item for item in requested):
                return ActionOutcome(False, "command_not_allowed")
            argv = [allowed.executable, *requested[1:]]
            read_roots = allowed.read_roots
            timeout = float(cast(int, arguments.get("timeout_seconds", 1)))
            for intent in descriptor.path_intents:
                if intent.access is Access.COMMAND_WRITE:
                    target = os.path.join(mansion, *intent.path.split("/"))
                    if os.path.realpath(target) != target:
                        return ActionOutcome(False, "path_denied")
                    writes.append(target)

        if _find_multiply_linked(mansion):
            return ActionOutcome(False, "hard_link_present")
        try:
            raw = self._confined(
                argv, mansion=mansion, cwd=cwd, writes=writes, git_write=git_write,
                read_roots=read_roots, timeout=timeout,
            )
        except (OSError, ValueError):
            return ActionOutcome(False, "start_failed")
        output, truncated = self._present(raw)
        if raw.status == "timeout":
            return ActionOutcome(False, "timed_out", None, raw.total, output, truncated, True)
        succeeded = raw.returncode == 0
        exit_code = raw.returncode if raw.returncode is not None and -255 <= raw.returncode <= 255 else None
        return ActionOutcome(
            succeeded, "exited" if succeeded else "nonzero_exit", exit_code, raw.total,
            output, truncated, True,
        )

    def _present(self, raw: _Raw) -> tuple[str, bool]:
        text = raw.data.decode("utf-8", "replace")
        try:
            redacted = deep_redact(text, self._secrets)
        except DeepRedactionError:
            return "", True
        return cast(str, redacted), raw.total > len(raw.data)


# --- consume, dispatch, record ------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ExecutionResult:
    """The redacted answer to one execution request.

    ``status``: ``succeeded`` or ``failed`` after an acknowledged consumption;
    ``denied`` when authority, policy, or confinement refused (nothing ran);
    ``waiting`` while the proposal is undecided; ``blocked`` when the writer
    or canonical integrity is unavailable.
    """

    status: Literal["succeeded", "failed", "denied", "waiting", "blocked"]
    code: str
    exit_code: int | None = None
    output_bytes: int = 0
    output: str = ""
    truncated: bool = False
    events: tuple[AppEvent, ...] = field(default=())

    @property
    def ok(self) -> bool:
        return self.status == "succeeded"


class ApprovedActionExecutor:
    """Consume one exact approval, then run the action it approved."""

    def __init__(
        self,
        port: GuardrailPort,
        filesystem: Callable[[str], GuardedFilesystem],
        runner: ActionRunner,
        *,
        mansion_directory: Callable[[str], Path],
        id_factory: Callable[[], str] | None = None,
    ) -> None:
        self._port = port
        self._filesystem = filesystem
        self._runner = runner
        self._mansion_directory = mansion_directory
        self._new_id = id_factory or (lambda: secrets.token_hex(16))
        self._live_claims: set[str] = set()

    async def execute(
        self,
        scope: EventScope,
        *,
        role: str,
        spec_name: str,
        proposal_id: object,
        descriptor: object,
    ) -> ExecutionResult:
        """Run ``descriptor`` only if it is the approved, unconsumed action.

        ``scope``, ``role``, and ``spec_name`` come from the trusted session
        binding; ``proposal_id`` and ``descriptor`` are model input.
        """

        mansion_id = scope.mansion_id
        policy = room_policy(role, spec_name)
        if policy is None:
            return ExecutionResult("denied", "identity_unavailable")
        claim_id = self._new_id()
        filesystem = self._filesystem(mansion_id)

        for _attempt in range(_CAS_ATTEMPTS):
            read = await self._port.read(mansion_id)
            if not read.writable:
                return ExecutionResult("blocked", "integrity_unavailable")
            ledger = read.projection.ledger
            proposal = ledger.proposals.get(proposal_id) if type(proposal_id) is str else None
            approved = proposal.descriptor if proposal is not None else None
            intents = approved.path_intents if approved is not None else ()

            def request(decisions: tuple[PathDecision, ...]) -> ExecutionRequest:
                return ExecutionRequest(
                    proposal_id=cast(str, proposal_id),
                    descriptor=descriptor,
                    scope=scope,
                    room=policy.room,
                    claim_id=claim_id,
                    path_decisions=decisions,
                    confinement_available=self._runner.available,
                )

            # Authority first, with the path question left open: an approval
            # is needed before a risky access may even be evidenced.
            assumed = tuple(PathDecision(True, PathDecisionCode.OK) for _ in intents)
            preliminary = authorize_execution(
                ledger,
                ExecutionRequest(
                    cast(str, proposal_id), descriptor, scope, policy.room, claim_id, assumed, True
                ),
            )
            if preliminary == "proposal_pending":
                return ExecutionResult("waiting", preliminary)
            if preliminary != "ok":
                return await self._deny(scope, request(assumed), ledger, preliminary, ())

            assert approved is not None
            decisions: list[PathDecision] = []
            evidence: list[AppEventCandidate] = []
            for intent in intents:
                decision, code = await asyncio.to_thread(
                    filesystem.decide, policy, intent.path, intent.access, exact_approval=True
                )
                decisions.append(decision)
                if not decision.allowed:
                    evidence.extend(
                        self._path_denial(scope, policy, intent.access, code, intent.path)
                    )
            if approved.kind != "delete_path" and approved.working_directory:
                decision, code = await asyncio.to_thread(
                    filesystem.decide, policy, approved.working_directory, Access.LIST
                )
                if not decision.allowed:
                    decisions.append(decision)
                    evidence.extend(
                        self._path_denial(
                            scope, policy, Access.LIST, code, approved.working_directory
                        )
                    )

            consume = decide_consumption(ledger, request(tuple(decisions)))
            if not consume.allowed:
                return await self._deny(
                    scope, request(tuple(decisions)), ledger, consume.code, evidence
                )
            assert consume.candidate is not None and consume.expected_sequence is not None
            acknowledged = await self._port.compare_and_append(
                mansion_id, consume.expected_sequence, [consume.candidate]
            )
            if acknowledged.status == "conflict":
                continue  # another write won: fold again and decide again
            if not acknowledged.ok:
                return ExecutionResult("blocked", "writer_unavailable")
            return await self._dispatch(
                scope, policy, filesystem, approved, cast(str, proposal_id), claim_id,
                acknowledged.events,
            )
        return ExecutionResult("blocked", "stale_version")

    async def _dispatch(
        self,
        scope: EventScope,
        policy: RoomPolicy,
        filesystem: GuardedFilesystem,
        approved: ActionDescriptor,
        proposal_id: str,
        claim_id: str,
        consumed: tuple[AppEvent, ...],
    ) -> ExecutionResult:
        """Runs strictly after the consumption record was acknowledged."""

        self._live_claims.add(claim_id)
        try:
            try:
                if approved.kind == "delete_path":
                    outcome = await asyncio.to_thread(self._delete, filesystem, policy, approved)
                else:
                    outcome = await self._runner.run(
                        approved, self._mansion_directory(scope.mansion_id)
                    )
            except Exception:  # noqa: BLE001 - the approval stays consumed
                outcome = ActionOutcome(False, "runner_failed")
            events = list(consumed)
            read = await self._port.read(scope.mansion_id)
            candidate = build_outcome_candidate(
                read.projection.ledger,
                scope=scope,
                proposal_id=proposal_id,
                claim_id=claim_id,
                succeeded=outcome.succeeded,
                code=outcome.code,
                exit_code=outcome.exit_code,
                output_bytes=outcome.output_bytes,
            )
            if candidate is not None:
                recorded = await self._port.append(scope.mansion_id, [candidate])
                events.extend(recorded.events)
        finally:
            self._live_claims.discard(claim_id)
        return ExecutionResult(
            "succeeded" if outcome.succeeded else "failed",
            outcome.code,
            outcome.exit_code,
            outcome.output_bytes,
            outcome.output,
            outcome.truncated,
            tuple(events),
        )

    @staticmethod
    def _delete(
        filesystem: GuardedFilesystem, policy: RoomPolicy, approved: ActionDescriptor
    ) -> ActionOutcome:
        path = approved.arguments["path"]
        try:
            if approved.arguments["target"] == "file":
                filesystem.delete_file(policy, path, exact_approval=True)
            else:
                filesystem.remove_empty_directory(policy, path, exact_approval=True)
        except GuardedFilesystemError as error:
            return ActionOutcome(False, error.code if _is_code(error.code) else "delete_failed")
        return ActionOutcome(True, "deleted", started=True)

    def _path_denial(
        self, scope: EventScope, policy: RoomPolicy, access: Access, code: str, path: str
    ) -> list[AppEventCandidate]:
        try:
            return [
                events_module.path_denied(
                    scope,
                    denial_id=self._new_id(),
                    session_slot=scope.session_slot,
                    room=policy.room,
                    access=access,
                    code=code if _is_code(code) else "path_denied",
                    raw_path=path,
                )
            ]
        except GuardrailPayloadError:
            return []

    async def _deny(
        self,
        scope: EventScope,
        request: ExecutionRequest,
        ledger: ApprovalLedger,
        code: str,
        evidence: Sequence[AppEventCandidate],
    ) -> ExecutionResult:
        """Record content-free evidence of a refused attempt.  Nothing ran."""

        batch = list(evidence)
        known = (
            ledger.proposals.get(request.proposal_id)
            if events_module.is_identifier(request.proposal_id)
            else None
        )
        try:
            batch.append(
                events_module.risky_action_denied(
                    scope,
                    proposal_id=request.proposal_id,
                    action_digest=known.action_digest if known is not None else None,
                    denial_id=request.claim_id,
                    session_slot=scope.session_slot,
                    code=code,
                )
            )
        except GuardrailPayloadError:
            pass  # a malformed proposal identifier is never stored
        events: tuple[AppEvent, ...] = ()
        if batch:
            acknowledged = await self._port.append(scope.mansion_id, batch)
            events = acknowledged.events
        return ExecutionResult("denied", code, events=events)

    async def settle_interrupted(self, mansion_id: str) -> tuple[AppEvent, ...]:
        """Record ``failed`` for every consumed claim that has no outcome and
        is not running in this process (a crash between consume and outcome).

        The approval stays consumed; a retry needs a new proposal.
        """

        read: GuardrailRead = await self._port.read(mansion_id)
        if not read.writable:
            return ()
        by_sequence = {event.sequence: event for event in read.events}
        settled: list[AppEvent] = []
        for proposal in read.projection.ledger.proposals.values():
            if proposal.status is not ProposalStatus.CONSUMED or proposal.claim_id is None:
                continue
            if proposal.claim_id in self._live_claims:
                continue
            consumed = by_sequence.get(proposal.consumed_sequence or -1)
            if consumed is None:
                continue
            candidate = build_outcome_candidate(
                read.projection.ledger,
                scope=consumed.scope,
                proposal_id=proposal.proposal_id,
                claim_id=proposal.claim_id,
                succeeded=False,
                code="interrupted",
            )
            if candidate is None:
                continue
            acknowledged = await self._port.append(mansion_id, [candidate])
            settled.extend(acknowledged.events)
        return tuple(settled)


def _is_code(value: object) -> bool:
    return events_module.is_safe_code(value)
