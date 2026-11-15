"""The single serialized Task_Plan checkbox writer.

Several Tinkers may finish at once; their checkboxes land in one
``tasks.md``.  Every completion goes through this writer:

    read canonical -> claim and digest checks -> task_completion_intended
    (compare-and-append) -> guarded replacement with the expected digest ->
    task_completed (evidence)

The intent is appended with Spec 2 compare-and-append against the highest
canonical Sequence, so two completions never plan against the same state:
the loser re-reads the log and the file and builds on the winner's
checkbox.  The file is replaced through the Spec 4 ``GuardedFilesystem``
with the digest that was read, so a change made behind the house keeps its
bytes and the completion is judged again.  Only the validated successful
task is checked; every other byte is preserved.

The claim is not released here: the caller appends the run's terminal
outcome and releases the claim once, after this durable completion.

No state is kept between calls.  An intent a previous process left behind
is settled by digest inspection before anything else is planned.
"""

from __future__ import annotations

import asyncio
import hashlib
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from haunted_house.adapters.guarded_filesystem import (
    FileDigest,
    GuardedFilesystem,
    GuardedFilesystemError,
)
from haunted_house.core.ghost_result import ArtifactRef
from haunted_house.core.guardrail_events import is_safe_code
from haunted_house.core.path_policy import (
    Access,
    PathRule,
    RoomPolicy,
    is_valid_spec_name,
    join_parts,
    spec_document_parts,
)
from haunted_house.core.room_ghost_events import (
    RoomGhostEventKind,
    RoomGhostPayloadError,
    RoomGhostRecord,
    build_room_ghost_candidate,
)
from haunted_house.core.seance_event import AppEvent, EventScope
from haunted_house.core.task_checkbox import (
    CheckboxError,
    check_task,
    completion_id_for,
    fold_completions,
)
from haunted_house.core.task_claims import fold_claims
from haunted_house.services.canonical_port import CanonicalRunPort

__all__ = ["CompletionResult", "TaskPlanWriter", "tasks_document_path"]

K = RoomGhostEventKind
_ATTEMPTS = 8


def tasks_document_path(spec_name: str) -> str:
    return join_parts(spec_document_parts(spec_name, "tasks.md"))


def _house_policy(document_path: str) -> RoomPolicy:
    """The house may read and replace exactly this one document."""

    parts = tuple(document_path.split("/"))
    return RoomPolicy("house", (PathRule(parts, frozenset({Access.READ, Access.WRITE})),), ())


@dataclass(frozen=True, slots=True)
class CompletionResult:
    ok: bool
    code: str
    event: AppEvent | None = None  # the acknowledged task_completed record
    sha256: str | None = None  # tasks.md after the completion
    duplicate: bool = False


class TaskPlanWriter:
    def __init__(
        self,
        port: CanonicalRunPort,
        filesystem: Callable[[str], GuardedFilesystem],
    ) -> None:
        self._port = port
        self._filesystem = filesystem
        self._locks: dict[str, asyncio.Lock] = {}
        self._live: set[str] = set()

    async def complete_task(
        self,
        scope: EventScope,
        *,
        spec_name: str,
        task_id: str,
        claim_id: str,
        evidence: Sequence[ArtifactRef] = (),
    ) -> CompletionResult:
        """Check ``task_id`` for the run ``scope`` that holds ``claim_id``.

        The caller has already validated the run's Ghost_Result and its
        artifacts.  Idempotent: a task that already has a durable completion
        returns that record.
        """

        if not is_valid_spec_name(spec_name):
            return CompletionResult(False, "invalid_request")
        lock = self._locks.setdefault(scope.mansion_id, asyncio.Lock())
        async with lock:
            return await self._complete(scope, spec_name, task_id, claim_id, tuple(evidence))

    async def _complete(
        self,
        scope: EventScope,
        spec_name: str,
        task_id: str,
        claim_id: str,
        evidence: tuple[ArtifactRef, ...],
    ) -> CompletionResult:
        mansion_id = scope.mansion_id
        document_path = tasks_document_path(spec_name)
        policy = _house_policy(document_path)
        filesystem = self._filesystem(mansion_id)
        code = "stale_version"
        for _ in range(_ATTEMPTS):
            read = await self._port.read(mansion_id)
            if not read.writable:
                return CompletionResult(False, "integrity_unavailable")
            completions = fold_completions(read.events)
            done = completions.completed.get(task_id)
            if done is not None:
                event = next((item for item in read.events if item.event_id == done.event_id), None)
                return CompletionResult(True, "ok", event, str(done.data["sha256"]), duplicate=True)

            claim = fold_claims(read.events).active_for_scope(scope)
            if claim is None or claim.claim_id != claim_id or claim.task_id != task_id:
                return CompletionResult(False, "task_claim_required")

            stranded = [
                record
                for record in completions.pending_for_document(document_path)
                if record.entity_id not in self._live
            ]
            if stranded:
                # An earlier process stopped between intent and evidence.
                for record in stranded:
                    await self._settle(filesystem, policy, record)
                continue

            try:
                data, base = await asyncio.to_thread(filesystem.read_file, policy, document_path)
                edit = check_task(data.decode("utf-8"), task_id)
            except GuardedFilesystemError as error:
                return CompletionResult(False, _safe(error.code, "tasks_unreadable"))
            except UnicodeDecodeError:
                return CompletionResult(False, "task_plan_invalid")
            except CheckboxError as error:
                return CompletionResult(False, error.code)
            updated = edit.text.encode("utf-8")
            after = FileDigest(hashlib.sha256(updated).hexdigest(), len(updated))
            completion_id = completion_id_for(
                scope, task_id, base.sha256, completions.intent_count(scope, task_id)
            )
            common = {
                "completion_id": completion_id,
                "task_id": task_id,
                "claim_id": claim_id,
                "document_path": document_path,
            }
            try:
                intent = build_room_ghost_candidate(
                    scope,
                    K.TASK_COMPLETION_INTENDED,
                    {
                        **common,
                        "base_sha256": base.sha256,
                        "sha256": after.sha256,
                        "size_bytes": after.size_bytes,
                    },
                )
                completed = build_room_ghost_candidate(
                    scope,
                    K.TASK_COMPLETED,
                    {
                        **common,
                        "sha256": after.sha256,
                        "size_bytes": after.size_bytes,
                        "evidence": [
                            {"path": item.path, "sha256": item.sha256} for item in evidence
                        ],
                    },
                )
            except RoomGhostPayloadError:
                return CompletionResult(False, "invalid_request")

            self._live.add(completion_id)
            try:
                acknowledged = await self._port.compare_and_append(
                    mansion_id, read.projection.version, [intent]
                )
                if acknowledged.status == "conflict":
                    code = "stale_version"
                    continue  # another record won: plan again from what is there
                if not acknowledged.ok:
                    return CompletionResult(False, "writer_unavailable")
                try:
                    if edit.changed:
                        await asyncio.to_thread(
                            filesystem.write_file, policy, document_path, updated, expected=base
                        )
                except GuardedFilesystemError as error:
                    # Current bytes are preserved; withdraw the intent.
                    code = _safe(error.code, "write_failed")
                    await self._abandon(scope, common, code)
                    if error.code in ("stale_revision", "changed"):
                        continue
                    return CompletionResult(False, code)
                evidence_ack = await self._port.append(mansion_id, [completed])
                if not evidence_ack.ok:
                    # The file is replaced and unacknowledged: the next call
                    # (or a restart) settles the intent by digest.
                    return CompletionResult(False, "completion_unacknowledged")
                return CompletionResult(True, "ok", evidence_ack.events[0], after.sha256)
            finally:
                self._live.discard(completion_id)
        return CompletionResult(False, code)

    async def _abandon(self, scope: EventScope, common: dict[str, str], code: str) -> None:
        try:
            candidate = build_room_ghost_candidate(
                scope, K.TASK_COMPLETION_ABANDONED, {**common, "code": code}
            )
        except RoomGhostPayloadError:
            return
        await self._port.append(scope.mansion_id, [candidate])

    async def _settle(
        self, filesystem: GuardedFilesystem, policy: RoomPolicy, intent: RoomGhostRecord
    ) -> None:
        """Finish or withdraw one intent by looking at the document's digest."""

        data = intent.data
        common = {
            "completion_id": str(data["completion_id"]),
            "task_id": str(data["task_id"]),
            "claim_id": str(data["claim_id"]),
            "document_path": str(data["document_path"]),
        }
        try:
            current = await asyncio.to_thread(filesystem.digest, policy, common["document_path"])
        except GuardedFilesystemError:
            current = None
        if current is not None and current.sha256 == data["sha256"]:
            try:
                candidate = build_room_ghost_candidate(
                    intent.scope,
                    K.TASK_COMPLETED,
                    {
                        **common,
                        "sha256": current.sha256,
                        "size_bytes": current.size_bytes,
                        "evidence": [],
                    },
                )
            except RoomGhostPayloadError:
                return
            await self._port.append(intent.scope.mansion_id, [candidate])
            return
        await self._abandon(intent.scope, common, "interrupted")


def _safe(code: str, fallback: str) -> str:
    return code if is_safe_code(code) else fallback
