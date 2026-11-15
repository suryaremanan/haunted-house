"""The pure half of the Task_Plan checkbox writer.

``check_task`` marks exactly one leaf of a ``tasks.md`` document complete
and changes nothing else: one ``[ ]`` becomes ``[x]`` and every other byte,
including line endings, optional markers, metadata lines, and the dependency
graph, is kept.  The edit is accepted only when re-parsing the result gives
the same Task_Plan with that one leaf complete, so a look-alike line inside a
code fence or a note can never be the one that is changed.

``fold_completions`` is the deterministic view of the canonical
``room_ghosts`` completion records: which tasks have a durable completion,
and which completion intents are still unsettled.

Pure: no filesystem, network, clock, or logging.
"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, replace
from types import MappingProxyType
from typing import cast

from haunted_house.core.ghost_result import is_task_id
from haunted_house.core.room_ghost_events import (
    RoomGhostEventKind,
    RoomGhostRecord,
    select_room_ghost_records,
)
from haunted_house.core.seance_event import AppEvent, EventScope, canonical_json
from haunted_house.core.task_plan import TaskPlan, TaskPlanError, parse_task_plan

__all__ = [
    "CheckboxEdit",
    "CheckboxError",
    "CompletionLedger",
    "check_task",
    "completion_id_for",
    "fold_completions",
]

K = RoomGhostEventKind
_UNCHECKED = re.compile(r"(\s*[-*] \[) (\]\*? +)([0-9]+(?:\.[0-9]+)+)(\.?)(?=\s|$)")


class CheckboxError(ValueError):
    """A safe refusal code; never text from the document."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


@dataclass(frozen=True, slots=True)
class CheckboxEdit:
    text: str
    changed: bool  # False when the task was already checked
    plan: TaskPlan


def _with_complete(plan: TaskPlan, task_id: str) -> TaskPlan:
    return TaskPlan(
        leaves=tuple(
            replace(leaf, complete=True) if leaf.task_id == task_id else leaf
            for leaf in plan.leaves
        ),
        waves=plan.waves,
    )


def check_task(markdown: str, task_id: str) -> CheckboxEdit:
    """Check the one checkbox of leaf ``task_id`` and preserve everything else."""

    if type(markdown) is not str or not is_task_id(task_id):
        raise CheckboxError("invalid_request")
    try:
        plan = parse_task_plan(markdown)
    except TaskPlanError:
        raise CheckboxError("task_plan_invalid") from None
    leaf = next((item for item in plan.leaves if item.task_id == task_id), None)
    if leaf is None:
        raise CheckboxError("task_not_found")
    if leaf.complete:
        return CheckboxEdit(markdown, False, plan)
    wanted = _with_complete(plan, task_id)
    lines = markdown.splitlines(keepends=True)
    for index, line in enumerate(lines):
        match = _UNCHECKED.match(line)
        if match is None or match.group(3) != task_id:
            continue
        edited = line[: match.end(1)] + "x" + line[match.start(2) :]
        text = "".join([*lines[:index], edited, *lines[index + 1 :]])
        try:
            if parse_task_plan(text) == wanted:
                return CheckboxEdit(text, True, wanted)
        except TaskPlanError:
            continue
    raise CheckboxError("task_not_found")


def completion_id_for(scope: EventScope, task_id: str, base_sha256: str, ordinal: int = 0) -> str:
    """One identifier per run, task, base revision of the plan, and try.

    ``ordinal`` counts the intents this run already recorded for the task, so
    a try after a withdrawn intent is a new fact, not a replay of the old one.
    """

    identity = [
        scope.mansion_id,
        scope.ghost_id,
        scope.session_slot,
        scope.run_id,
        scope.run_sequence,
        task_id,
        base_sha256,
        ordinal,
    ]
    return "done-" + hashlib.sha256(canonical_json(identity)).hexdigest()[:40]


@dataclass(frozen=True, slots=True)
class CompletionLedger:
    """Durable task completions and the intents not yet settled."""

    completed: Mapping[str, RoomGhostRecord]  # task_id -> task_completed
    pending: Mapping[str, RoomGhostRecord]  # completion_id -> task_completion_intended
    intents: tuple[RoomGhostRecord, ...] = ()  # every intent, settled or not

    def intent_count(self, scope: EventScope, task_id: str) -> int:
        return sum(
            1 for record in self.intents if record.scope == scope and record.data["task_id"] == task_id
        )

    def pending_for_document(self, document_path: str) -> tuple[RoomGhostRecord, ...]:
        return tuple(
            record
            for record in self.pending.values()
            if record.data["document_path"] == document_path
        )


def fold_completions(events: Iterable[AppEvent]) -> CompletionLedger:
    """Fold acknowledged canonical records into the completion view.

    A completion counts only when it follows its own intent; an intent is
    pending until its ``task_completed`` or ``task_completion_abandoned``.
    """

    completed: dict[str, RoomGhostRecord] = {}
    pending: dict[str, RoomGhostRecord] = {}
    seen: set[str] = set()
    intents: list[RoomGhostRecord] = []
    for record in select_room_ghost_records(events).records:
        completion_id = cast(str, record.data.get("completion_id", ""))
        if record.kind is K.TASK_COMPLETION_INTENDED:
            if completion_id not in seen:
                seen.add(completion_id)
                intents.append(record)
                pending[completion_id] = record
        elif record.kind in (K.TASK_COMPLETED, K.TASK_COMPLETION_ABANDONED):
            intent = pending.get(completion_id)
            if intent is None or any(
                intent.data[key] != record.data[key]
                for key in ("task_id", "claim_id", "document_path")
            ):
                continue
            if record.kind is K.TASK_COMPLETED:
                if intent.data["sha256"] != record.data["sha256"]:
                    continue
                completed.setdefault(cast(str, record.data["task_id"]), record)
            del pending[completion_id]
    return CompletionLedger(
        MappingProxyType(completed), MappingProxyType(pending), tuple(intents)
    )
