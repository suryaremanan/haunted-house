"""MCP_Gate: the backend half of every room tool.

The stdio MCP process only relays.  This service decides and acts, from the
trusted :class:`RoomBinding` the backend wrote when it started the Ghost.
A tool call contributes a tool name and arguments, both untrusted; it never
contributes session, Ghost, Mansion, Room, or spec.

Every check is repeated here whatever a hook, a profile rule, or Crew's own
approval already allowed: the exact per-role catalog, argument shape,
Effective_Room_Policy through Path_Guard, and canonical integrity.  Phase
output, risky proposals, and approved execution are the workflow service's
room operations (one Approval_Ledger, one consume-before-execute path); this
service shapes their input from trusted identity and their answer for the
Ghost.  Evidence goes only through the Spec 2 writer port.  Results are
small, typed, and content-free apart from the file a Ghost asked to read and
the redacted output of an action its operator approved.

With ``require_task_claims`` (Room Ghosts) a Tinker call first passes the
Task_Claim_Gate: the session's trusted Event_Scope must hold an active
Task_Claim in the canonical log, every mutating path must lie inside that
claim, and a direct write must name the digest it replaces.  The gate only
forwards to the checks above; it can refuse, never allow.
"""

from __future__ import annotations

import asyncio
import secrets
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any, Final, Protocol

from haunted_house.adapters.guarded_filesystem import (
    ANY_CONTENT,
    GuardedFilesystem,
    GuardedFilesystemError,
    GuardedRoomAccess,
)
from haunted_house.adapters.guardrail_port import GuardrailPort
from haunted_house.adapters.session_bindings import RoomBinding
from haunted_house.core import guardrail_events as events_module
from haunted_house.core.action_descriptor import (
    ActionDescriptor,
    ActionError,
    action_digest,
    parse_action_descriptor,
)
from haunted_house.core.deep_redact import DeepRedactionError, deep_redact
from haunted_house.core.guardrail_events import GuardrailPayloadError, Phase, is_safe_code
from haunted_house.core.path_policy import Access, RoomPolicy, room_policy
from haunted_house.core.room_catalog import (
    EXECUTION_TOOL,
    MAX_CONTENT_BYTES,
    MUTATION_TOOLS,
    PROPOSAL_TOOL,
    TOOLS_BY_ROLE,
    check_arguments,
    complete_descriptor,
)
from haunted_house.core.seance_event import EventScope
from haunted_house.core.task_claims import authorize_claim_access, fold_claims
from haunted_house.core.workflow import PhaseStatus

__all__ = ["ExecutionOutcome", "OperationOutcome", "RoomOperations", "RoomToolService"]

PHASE_BY_ROLE: Final[Mapping[str, Phase]] = {
    "archivist": Phase.REQUIREMENTS,
    "draughtsman": Phase.DESIGN,
    "foreman": Phase.TASKS,
    "tinker": Phase.IMPLEMENTATION,
}
MAX_OUTPUT_CHARS: Final = 16 * 1024


class OperationOutcome(Protocol):
    """The redacted answer of one room operation (``RoomResult``)."""

    ok: bool
    code: str
    data: Mapping[str, Any]


class ExecutionOutcome(Protocol):
    """The redacted answer of one execution request (``ExecutionResult``)."""

    status: str  # succeeded | failed | denied | waiting | blocked
    code: str
    exit_code: int | None
    output: str
    truncated: bool


class RoomOperations(Protocol):
    """The workflow service's room operations (``WorkflowService``).

    They own the Door proposal for a validated Phase_Output, the pending
    proposal record, and the one path from an approval to its execution:
    ledger check, compare-and-append consumption, confined dispatch, outcome.
    """

    async def submit_phase_output(
        self, binding: RoomBinding, path: object = None
    ) -> OperationOutcome: ...

    async def propose_risky_action(
        self, binding: RoomBinding, fields: Mapping[str, object]
    ) -> OperationOutcome: ...

    async def consume_and_execute(
        self, binding: RoomBinding, proposal_id: object, descriptor: object
    ) -> ExecutionOutcome: ...


# Codes that mean "nothing can be mutated right now": the Ghost is blocked.
_BLOCKED_CODES: Final = frozenset(
    {
        "integrity_unavailable",
        "writer_unavailable",
        "workflow_unavailable",
        "identity_unavailable",
        "unsafe_mansion_root",
        "mansion_not_found",
    }
)
# The only fields of an operation's answer a Ghost is shown.
_SUBMIT_FIELDS: Final = ("proposal_id", "document_path", "artifact_revision")
_PROPOSAL_FIELDS: Final = ("proposal_id", "action_digest", "status")


def _result(ok: bool, code: object, **fields: Any) -> dict[str, Any]:
    text = str(getattr(code, "value", code))
    return {"ok": ok, "code": text if is_safe_code(text) else "error", **fields}


def _blocked(reason: str) -> dict[str, Any]:
    # Requirement 11.7: the Ghost is reported blocked and nothing is mutated.
    return _result(False, "blocked", reason=reason, ghost_state="blocked")


class RoomToolService:
    """Authorize and perform one room tool call for one trusted session."""

    def __init__(
        self,
        port: GuardrailPort,
        mansion_root: Path,
        *,
        operations: RoomOperations | None = None,
        id_factory: Callable[[], str] | None = None,
        require_task_claims: bool = False,
    ) -> None:
        self._port = port
        self._mansion_root = Path(mansion_root)
        self._operations = operations
        self._require_task_claims = require_task_claims
        self._new_id = id_factory or (lambda: secrets.token_hex(16))

    def catalog(self, session: RoomBinding) -> tuple[str, ...]:
        """The tools this session may see; empty when identity is unusable."""

        return TOOLS_BY_ROLE[session.role] if self._usable(session) else ()

    def _usable(self, session: object) -> bool:
        if not isinstance(session, RoomBinding) or session.role not in TOOLS_BY_ROLE:
            return False
        policy = room_policy(session.role, session.spec)
        return (
            policy is not None
            and policy.room == session.room
            # The Mansion root is server configuration; a record that names
            # another root does not describe a session this backend started.
            and Path(session.mansion_root) == self._mansion_root
        )

    async def call(self, session: RoomBinding, tool: object, arguments: object) -> dict[str, Any]:
        if not self._usable(session):
            return _blocked("session_identity_unavailable")
        if type(tool) is not str or tool not in TOOLS_BY_ROLE[session.role]:
            return _result(False, "tool_not_available")
        problem = check_arguments(tool, arguments, session.role)
        if problem is not None:
            return _result(False, problem)
        assert isinstance(arguments, dict)

        policy = room_policy(session.role, session.spec)
        assert policy is not None
        filesystem = GuardedFilesystem(self._mansion_root, session.mansion)
        access = GuardedRoomAccess(filesystem, self._port, id_factory=self._new_id)
        scope = session.scope

        if tool in MUTATION_TOOLS:
            try:
                read = await self._port.read(session.mansion)
            except Exception:  # noqa: BLE001 - no writer means no mutation
                return _blocked("writer_unavailable")
            if not read.writable:
                return _blocked("integrity_unavailable")

        if self._require_task_claims and session.role == "tinker":
            refusal = await self._task_claim_gate(session, scope, policy, tool, arguments)
            if refusal is not None:
                return refusal

        try:
            if tool == "list_room_files":
                return await self._list(access, scope, policy, arguments)
            if tool == "read_room_file":
                return await self._read(access, scope, policy, arguments)
            if tool == "write_spec_document":
                return await self._write_spec(access, session, scope, arguments)
            if tool == "write_room_file":
                return await self._write_file(access, session, scope, policy, arguments)
            if tool == "submit_phase_output":
                return await self._submit(session, arguments)
            if tool == PROPOSAL_TOOL:
                return await self._propose(filesystem, session, scope, policy, arguments)
            if tool == EXECUTION_TOOL:
                return await self._execute(filesystem, session, scope, policy, arguments)
        except GuardedFilesystemError as error:
            if error.code in _BLOCKED_CODES:
                return _blocked(error.code)
            return _result(False, error.code)
        return _result(False, "tool_not_available")

    # --- Task_Claim_Gate (Room Ghosts) ------------------------------------------------

    def _claim_checks(
        self, session: RoomBinding, policy: RoomPolicy, tool: str, arguments: dict[str, Any]
    ) -> list[tuple[Access, object]]:
        """Every path and access kind one Tinker call asks for."""

        if tool == "list_room_files":
            return [(Access.LIST, arguments.get("path", ""))]
        if tool == "read_room_file":
            return [(Access.READ, arguments["path"])]
        if tool == "write_room_file":
            return [(Access.WRITE, arguments["path"])]
        if tool in (PROPOSAL_TOOL, EXECUTION_TOOL):
            _raw, descriptor = self._descriptor(session, policy, arguments["action"])
            if not isinstance(descriptor, ActionDescriptor):
                # Malformed: the Spec 4 path refuses it.  Identity still applies.
                return [(Access.READ, "")]
            checks: list[tuple[Access, object]] = [
                (intent.access, intent.path) for intent in descriptor.path_intents
            ]
            if descriptor.working_directory != "":
                checks.append((Access.COMMAND_READ, descriptor.working_directory))
            return checks or [(Access.READ, "")]
        return [(Access.READ, "")]  # submit: the claim's identity only

    async def _task_claim_gate(
        self,
        session: RoomBinding,
        scope: EventScope,
        policy: RoomPolicy,
        tool: str,
        arguments: dict[str, Any],
    ) -> dict[str, Any] | None:
        """Refuse a Tinker call its Task_Claim does not cover; else ``None``.

        The run identity is the session's trusted scope and the claim is the
        one the canonical log holds for it: no argument selects either.  A
        pass only forwards the call to the Spec 4 checks that follow.
        """

        try:
            read = await self._port.read(session.mansion)
        except Exception:  # noqa: BLE001 - no canonical read means no claim
            return _blocked("writer_unavailable")
        if read.integrity != "valid":
            return _blocked("integrity_unavailable")
        ledger = fold_claims(read.events)
        for access, path in self._claim_checks(session, policy, tool, arguments):
            decision = authorize_claim_access(ledger, scope, access, path)
            if not decision.forward:
                if type(path) is str and path:
                    await self._record_path_denial(scope, policy, (access, path, "task_claim"))
                return _result(False, "task_claim_denied", reason=decision.code)
        if tool == "write_room_file" and "expected_sha256" not in arguments:
            return _result(False, "expected_digest_required")
        return None

    # --- room files -------------------------------------------------------------------

    async def _list(self, access, scope, policy, arguments) -> dict[str, Any]:
        entries = await access.list_directory(scope, policy, arguments.get("path"))
        return _result(
            True,
            "listed",
            entries=[{"name": entry.name, "kind": entry.kind} for entry in entries],
        )

    async def _read(self, access, scope, policy, arguments) -> dict[str, Any]:
        data, digest = await access.read_file(scope, policy, arguments["path"])
        if len(data) > MAX_CONTENT_BYTES:
            return _result(False, "too_large", size_bytes=digest.size_bytes)
        try:
            content = data.decode("utf-8")
        except UnicodeDecodeError:
            return _result(False, "not_text", size_bytes=digest.size_bytes)
        return _result(
            True, "read", content=content, sha256=digest.sha256, size_bytes=digest.size_bytes
        )

    async def _write_spec(self, access, session, scope, arguments) -> dict[str, Any]:
        outcome = await access.write_spec_document(
            scope,
            role=session.role,
            spec_name=session.spec,
            phase=PHASE_BY_ROLE[session.role],
            data=arguments["content"].encode("utf-8"),
            expected_revision=arguments["expected_revision"],
        )
        fields: dict[str, Any] = {}
        revision = outcome.artifact_revision
        if outcome.status == "written" and revision is not None:
            fields = {
                "revision": revision.revision,
                "sha256": revision.sha256,
                "size_bytes": revision.size_bytes,
            }
        elif outcome.status == "conflict":
            fields = {"current_revision": revision.revision if revision is not None else 0}
        if outcome.status == "blocked":
            return _blocked(outcome.code)
        return _result(outcome.status == "written", outcome.status, reason=outcome.code, **fields)

    async def _implementation_working(self, session: RoomBinding) -> bool:
        projection = (await self._port.read(session.mansion)).projection
        return projection.phases[Phase.IMPLEMENTATION].status is PhaseStatus.WORKING

    async def _write_file(self, access, session, scope, policy, arguments) -> dict[str, Any]:
        if not await self._implementation_working(session):
            return _result(False, "conflict", reason="invalid_state")
        expected: Any = ANY_CONTENT
        if "expected_sha256" in arguments:
            wanted = arguments["expected_sha256"]
            try:
                current = await asyncio.to_thread(
                    GuardedFilesystem(self._mansion_root, session.mansion).digest,
                    policy,
                    arguments["path"],
                )
            except GuardedFilesystemError as error:
                if not error.denied:
                    return _result(False, error.code)
                # The guarded write below refuses and records the same path.
                current, wanted = None, None
            if (current.sha256 if current is not None else None) != wanted:
                # The file moved since the Ghost read it: its bytes are kept.
                return _result(False, "stale_revision")
            # The same digest is compared again inside the atomic replace.
            expected = current
        digest = await access.write_file(
            scope, policy, arguments["path"], arguments["content"].encode("utf-8"),
            expected=expected,
        )
        return _result(True, "written", sha256=digest.sha256, size_bytes=digest.size_bytes)

    def _answer(self, outcome: OperationOutcome, fields: tuple[str, ...]) -> dict[str, Any]:
        if outcome.ok is not True and outcome.code in _BLOCKED_CODES:
            return _blocked(outcome.code)
        data = outcome.data if isinstance(outcome.data, Mapping) else {}
        shown = {key: data[key] for key in fields if key in data}
        return _result(outcome.ok is True, outcome.code, **shown)

    async def _submit(self, session: RoomBinding, arguments) -> dict[str, Any]:
        if self._operations is None:
            return _blocked("output_validation_unavailable")
        try:
            outcome = await self._operations.submit_phase_output(session, arguments.get("path"))
        except Exception:  # noqa: BLE001 - the boundary failed; nothing is ready
            return _result(False, "submit_failed")
        return self._answer(outcome, _SUBMIT_FIELDS)

    # --- risky actions ----------------------------------------------------------------

    def _descriptor(
        self, session: RoomBinding, policy: RoomPolicy, action: object
    ) -> tuple[dict[str, Any] | None, ActionDescriptor | ActionError | None]:
        raw = complete_descriptor(
            action,
            mansion_id=session.mansion,
            session_slot=session.slot,
            room=session.room,
        )
        return raw, (parse_action_descriptor(raw) if raw is not None else None)

    def _first_denial(
        self, filesystem: GuardedFilesystem, policy: RoomPolicy, descriptor: ActionDescriptor
    ) -> tuple[Access, str, str] | None:
        """The first intent or working directory outside Effective_Room_Policy.

        Pure policy only: nothing is read, listed, or changed.
        """

        checks = [(intent.access, intent.path) for intent in descriptor.path_intents]
        if descriptor.working_directory != "":
            checks.append((Access.COMMAND_READ, descriptor.working_directory))
        for access, path in checks:
            try:
                filesystem.precheck(policy, path, access)
            except GuardedFilesystemError as error:
                return access, path, error.code
        return None

    async def _record_path_denial(
        self, scope: EventScope, policy: RoomPolicy, denial: tuple[Access, str, str]
    ) -> None:
        access, path, code = denial
        try:
            candidate = events_module.path_denied(
                scope,
                denial_id=self._new_id(),
                session_slot=scope.session_slot,
                room=policy.room,
                access=access,
                code=code,
                raw_path=path,
            )
        except GuardrailPayloadError:
            return
        await self._port.append(scope.mansion_id, [candidate])

    async def _propose(self, filesystem, session, scope, policy, arguments) -> dict[str, Any]:
        if not await self._implementation_working(session):
            return _result(False, "conflict", reason="invalid_state")
        _raw, descriptor = self._descriptor(session, policy, arguments["action"])
        if not isinstance(descriptor, ActionDescriptor):
            fields = (
                {"reason": descriptor.code.value, "field": descriptor.field}
                if isinstance(descriptor, ActionError)
                else {}
            )
            return _result(False, "invalid_descriptor", **fields)
        denial = self._first_denial(filesystem, policy, descriptor)
        if denial is not None:
            # An approval could never widen the room: refuse it now.
            await self._record_path_denial(scope, policy, denial)
            return _result(False, "path_denied", reason=denial[2])
        if self._operations is None:
            return _blocked("workflow_unavailable")
        try:
            outcome = await self._operations.propose_risky_action(session, arguments["action"])
        except Exception:  # noqa: BLE001 - no detail may reach the Ghost
            return _result(False, "proposal_failed")
        answer = self._answer(outcome, _PROPOSAL_FIELDS)
        if answer["ok"] and answer.get("action_digest") != action_digest(descriptor):
            # The operator must be shown exactly what this Ghost presented.
            return _result(False, "proposal_failed")
        return answer

    async def _execute(self, filesystem, session, scope, policy, arguments) -> dict[str, Any]:
        raw, descriptor = self._descriptor(session, policy, arguments["action"])
        if isinstance(descriptor, ActionDescriptor):
            denial = self._first_denial(filesystem, policy, descriptor)
            if denial is not None:
                # Requirement 3.9: outside Effective_Room_Policy, whatever the
                # ledger says.  Nothing is consumed and nothing runs.
                await self._record_path_denial(scope, policy, denial)
                return _result(False, "path_denied", reason=denial[2])
        if self._operations is None:
            return _blocked("action_runner_unavailable")
        try:
            outcome = await self._operations.consume_and_execute(
                session, arguments["proposal_id"], raw
            )
        except Exception:  # noqa: BLE001 - no detail may reach the Ghost
            return _result(False, "execution_failed")
        if outcome.status == "blocked" or outcome.code in _BLOCKED_CODES:
            return _blocked(outcome.code)
        if outcome.status == "waiting":
            # Waiting for the operator; a Ghost can never approve itself.
            return _result(False, "proposal_pending", status="waiting")
        if outcome.status not in ("succeeded", "failed"):
            return _result(False, outcome.code)
        # Consumption was acknowledged: the approval is spent, whatever happened.
        fields: dict[str, Any] = {"consumed": True}
        if outcome.exit_code is not None:
            fields["exit_code"] = outcome.exit_code
        output = _safe_output(outcome.output)
        if output:
            fields["output"] = output
            if outcome.truncated or len(outcome.output) > MAX_OUTPUT_CHARS:
                fields["truncated"] = True
        return _result(outcome.status == "succeeded", outcome.code, **fields)


def _safe_output(text: object) -> str:
    """Bounded, redacted action output for the Ghost that ran it."""

    if type(text) is not str or text == "":
        return ""
    try:
        redacted = deep_redact(text[:MAX_OUTPUT_CHARS])
    except (DeepRedactionError, ValueError):
        return ""
    return redacted if type(redacted) is str else ""
