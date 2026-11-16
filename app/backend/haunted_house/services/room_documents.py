"""Reads the three room documents the way the house currently holds them.

One read serves the room panels and the Workshop: each Spec_Document with the
revision Spec 4 recorded, its text, and the deterministic validator's
findings, plus the parsed Task_Plan and the acceptance-criterion ids every
later check is made against.

Files are read through the Spec 4 ``GuardedFilesystem`` with a policy that
allows exactly the one document.  A document whose bytes are not the ones the
house recorded is shown without text and never as validated: the Operator is
not shown as accepted what nobody validated.  ``tasks.md`` is the one
exception the house itself makes: the serialized checkbox writer replaces it,
so the digests its completion records carry are current too.

Nothing is kept between calls.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass

from haunted_house.adapters.guarded_filesystem import GuardedFilesystem, GuardedFilesystemError
from haunted_house.adapters.guardrail_port import GuardrailRead
from haunted_house.core.artifact_validation import extract_requirement_ids, validate_phase_artifact
from haunted_house.core.findings import Finding, bound_findings
from haunted_house.core.guardrail_events import Phase
from haunted_house.core.path_policy import Access, PathRule, RoomPolicy
from haunted_house.core.room_projection import DOCUMENT_PHASES, DocumentView
from haunted_house.core.task_checkbox import fold_completions
from haunted_house.core.task_plan import TaskPlan, TaskPlanError, parse_task_plan, validate_task_plan
from haunted_house.services.room_prompts import spec_document

__all__ = ["RoomDocuments", "RoomDocumentsState"]


@dataclass(frozen=True, slots=True)
class RoomDocumentsState:
    documents: tuple[DocumentView, ...]
    requirement_ids: frozenset[str]
    # The current ``tasks.md`` as a plan, or ``None`` when it does not parse.
    plan: TaskPlan | None
    plan_findings: tuple[Finding, ...]

    def document(self, phase: Phase) -> DocumentView:
        return next(view for view in self.documents if view.phase is phase)

    @property
    def plan_valid(self) -> bool:
        return self.plan is not None and not self.plan_findings


def _reader(path: str) -> RoomPolicy:
    return RoomPolicy("house", (PathRule(tuple(path.split("/")), frozenset({Access.READ})),), ())


class RoomDocuments:
    def __init__(self, filesystem: Callable[[str], GuardedFilesystem]) -> None:
        self._filesystem = filesystem

    async def _text(self, mansion_id: str, path: str) -> tuple[str, str] | None:
        """``(text, sha256)`` of a readable UTF-8 document, else ``None``."""

        try:
            data, digest = await asyncio.to_thread(
                self._filesystem(mansion_id).read_file, _reader(path), path
            )
            return data.decode("utf-8"), digest.sha256
        except (GuardedFilesystemError, UnicodeDecodeError):
            return None

    async def read(self, read: GuardrailRead, mansion_id: str, spec_name: str) -> RoomDocumentsState:
        completions = fold_completions(read.events)
        checkbox_digests = {
            record.data["sha256"] for record in completions.completed.values()
        }
        texts: dict[Phase, str] = {}
        current: dict[Phase, bool] = {}
        for phase in DOCUMENT_PHASES:
            path = spec_document(spec_name, phase)
            recorded = read.projection.documents.get(path)
            found = await self._text(mansion_id, path) if recorded is not None else None
            if found is None or recorded is None:
                continue
            text, digest = found
            texts[phase] = text
            current[phase] = digest == recorded.sha256 or (
                phase is Phase.TASKS and digest in checkbox_digests
            )

        requirement_ids: frozenset[str] = frozenset()
        if current.get(Phase.REQUIREMENTS):
            requirement_ids = extract_requirement_ids(texts[Phase.REQUIREMENTS])

        views: list[DocumentView] = []
        for phase in DOCUMENT_PHASES:
            path = spec_document(spec_name, phase)
            recorded = read.projection.documents.get(path)
            if recorded is None or not current.get(phase):
                views.append(DocumentView(phase, path, recorded))
                continue
            try:
                findings = bound_findings(
                    validate_phase_artifact(phase, texts[phase], requirement_ids)
                )
            except Exception:  # noqa: BLE001 - a validator fault is never a pass
                views.append(DocumentView(phase, path, recorded, content=texts[phase]))
                continue
            views.append(
                DocumentView(phase, path, recorded, not findings, texts[phase], findings)
            )

        plan: TaskPlan | None = None
        plan_findings: tuple[Finding, ...] = ()
        if current.get(Phase.TASKS):
            try:
                plan = parse_task_plan(texts[Phase.TASKS])
                plan_findings = bound_findings(validate_task_plan(plan, requirement_ids))
            except TaskPlanError as error:
                plan, plan_findings = None, bound_findings(error.findings)
            except Exception:  # noqa: BLE001
                plan = None
        return RoomDocumentsState(tuple(views), requirement_ids, plan, plan_findings)
