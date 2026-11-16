"""Builds the one bounded prompt of a Room Ghost turn.

A prompt is the role's installed Room_Skill block (RG-S2: delivered by the
house, never by an inherited resource) followed by the assignment
``core.prompts`` renders from typed, trusted input.  Every identity in it
comes from the session's trusted ``RoomBinding`` and the canonical read:
approved upstream digests from the open Doors, the current document revision
from the recorded Spec_Document writes, the claim from the Task_Claim.

Only the feature brief is Operator text.  It is read from the Mansion's own
``.kiro/specs/<spec>/brief.md`` when that file exists, bounded and stripped
of control characters, and is passed to the renderer as delimited data.

A prompt that cannot be built exactly is refused with a stable code; no
Ghost is started with a partial or foreign skill, or with a guessed digest.
"""

from __future__ import annotations

import asyncio
import unicodedata
from collections.abc import Callable, Sequence
from pathlib import Path

from haunted_house.adapters.crew_chat import MAX_TURN_BYTES
from haunted_house.adapters.guarded_filesystem import GuardedFilesystem, GuardedFilesystemError
from haunted_house.adapters.guardrail_port import GuardrailRead
from haunted_house.adapters.room_skills import RoomSkillError, read_room_skill_block
from haunted_house.adapters.session_bindings import RoomBinding
from haunted_house.core.findings import Finding
from haunted_house.core.guardrail_events import Phase
from haunted_house.core.path_policy import (
    Access,
    PathRule,
    RoomPolicy,
    join_parts,
    spec_document_parts,
)
from haunted_house.core.prompts import (
    MAX_BRIEF_BYTES,
    MAX_EXPECTED_REVISIONS,
    MAX_PROMPT_FINDINGS,
    ExpectedRevision,
    PhaseAssignment,
    PromptError,
    RevisionAssignment,
    TinkerAssignment,
    UpstreamArtifact,
    render_phase_prompt,
    render_revision_prompt,
    render_tinker_prompt,
)
from haunted_house.core.task_claims import TaskClaim
from haunted_house.core.task_plan import TaskPlan
from haunted_house.core.workflow import DoorStatus

__all__ = ["BRIEF_DOCUMENT", "DEFAULT_BRIEF", "PromptRefused", "RoomPromptBuilder", "spec_document"]

BRIEF_DOCUMENT = "brief.md"
DEFAULT_BRIEF = (
    "No feature brief was recorded for the spec named {spec}. Read the Mansion's "
    "steering files and its README, and write the document for the feature they describe."
)
_UPSTREAM: dict[str, tuple[Phase, ...]] = {
    "archivist": (),
    "draughtsman": (Phase.REQUIREMENTS,),
    "foreman": (Phase.REQUIREMENTS, Phase.DESIGN),
    "tinker": (Phase.REQUIREMENTS, Phase.DESIGN, Phase.TASKS),
}
_UNSAFE = frozenset({"Cc", "Cs", "Co", "Cn", "Zl", "Zp"})


class PromptRefused(Exception):
    """The prompt cannot be built.  ``code`` is stable and content-free."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


def spec_document(spec_name: str, phase: Phase) -> str:
    return join_parts(spec_document_parts(spec_name, f"{phase.value}.md"))


def _reader(path: str) -> RoomPolicy:
    return RoomPolicy("house", (PathRule(tuple(path.split("/")), frozenset({Access.READ})),), ())


class RoomPromptBuilder:
    def __init__(self, app_root: Path, filesystem: Callable[[str], GuardedFilesystem]) -> None:
        self._app_root = Path(app_root)
        self._filesystem = filesystem

    # --- shared pieces ---------------------------------------------------------------

    async def _skill(self, role: str) -> str:
        try:
            return await asyncio.to_thread(read_room_skill_block, self._app_root, role)
        except RoomSkillError as error:
            raise PromptRefused(error.code) from None

    @staticmethod
    def _join(skill: str, prompt: str) -> str:
        text = skill + "\n" + prompt
        if len(text.encode("utf-8")) > MAX_TURN_BYTES:
            raise PromptRefused("prompt_too_large")
        return text

    @staticmethod
    def upstream(read: GuardrailRead, role: str, spec_name: str) -> tuple[UpstreamArtifact, ...]:
        """The approved upstream documents of ``role``, pinned by digest."""

        found: list[UpstreamArtifact] = []
        for phase in _UPSTREAM.get(role, ()):
            view = read.projection.phases[phase]
            proposal = view.proposal
            if view.door is not DoorStatus.OPEN or proposal is None:
                raise PromptRefused("upstream_not_approved")
            found.append(UpstreamArtifact(proposal.document_path, proposal.artifact_revision.sha256))
        return tuple(found)

    async def brief(self, mansion_id: str, spec_name: str) -> str:
        """The Mansion's recorded feature brief, bounded, or the default one."""

        path = join_parts(spec_document_parts(spec_name, BRIEF_DOCUMENT))
        try:
            data, _digest = await asyncio.to_thread(
                self._filesystem(mansion_id).read_file, _reader(path), path
            )
            text = data[: MAX_BRIEF_BYTES * 2].decode("utf-8", "ignore")
        except GuardedFilesystemError:
            text = ""
        cleaned = "".join(
            char for char in text if char in "\n\t" or unicodedata.category(char) not in _UNSAFE
        ).strip()
        while len(cleaned.encode("utf-8")) > MAX_BRIEF_BYTES:
            cleaned = cleaned[: max(1, len(cleaned) * 9 // 10)].rstrip()
        return cleaned or DEFAULT_BRIEF.format(spec=spec_name)

    # --- one prompt per kind of run -----------------------------------------------------

    async def phase(self, read: GuardrailRead, binding: RoomBinding) -> str:
        """The first prompt of a requirements, design, or task-planning run."""

        known = read.projection.documents.get(spec_document(binding.spec, binding.phase))
        try:
            prompt = render_phase_prompt(
                PhaseAssignment(
                    run_id=binding.run_id,
                    role=binding.role,
                    spec_name=binding.spec,
                    feature_brief=await self.brief(binding.mansion, binding.spec),
                    upstream=self.upstream(read, binding.role, binding.spec),
                    current_revision=known.revision if known is not None else 0,
                    current_sha256=known.sha256 if known is not None else None,
                )
            )
        except PromptError:
            raise PromptRefused("prompt_invalid") from None
        return self._join(await self._skill(binding.role), prompt)

    async def revision(
        self,
        read: GuardrailRead,
        binding: RoomBinding,
        *,
        feedback: str | None,
        findings: Sequence[Finding] = (),
    ) -> str:
        """A follow-up prompt in the same session: Operator feedback or findings."""

        known = read.projection.documents.get(spec_document(binding.spec, binding.phase))
        if known is None:
            raise PromptRefused("document_missing")
        try:
            prompt = render_revision_prompt(
                RevisionAssignment(
                    run_id=binding.run_id,
                    role=binding.role,
                    spec_name=binding.spec,
                    current_revision=known.revision,
                    current_sha256=known.sha256,
                    feedback=feedback,
                    findings=tuple(findings)[:MAX_PROMPT_FINDINGS],
                    upstream=self.upstream(read, binding.role, binding.spec),
                )
            )
        except PromptError as error:
            raise PromptRefused(
                "feedback_invalid" if error.field == "feedback" else "prompt_invalid"
            ) from None
        return self._join(await self._skill(binding.role), prompt)

    async def tinker(
        self,
        read: GuardrailRead,
        binding: RoomBinding,
        *,
        plan: TaskPlan,
        claim: TaskClaim,
        requirement_ids: frozenset[str],
    ) -> str:
        """The prompt of one Tinker run for exactly its one claimed task."""

        filesystem = self._filesystem(binding.mansion)
        expected: list[ExpectedRevision] = []
        for path in claim.paths[:MAX_EXPECTED_REVISIONS]:
            if any(char in path for char in "*?[]{}!"):
                continue  # a pattern names no single file to pin
            try:
                digest = await asyncio.to_thread(filesystem.digest, _reader(path), path)
            except GuardedFilesystemError:
                continue
            expected.append(ExpectedRevision(path, digest.sha256 if digest is not None else None))
        try:
            prompt = render_tinker_prompt(
                TinkerAssignment(
                    run_id=binding.run_id,
                    spec_name=binding.spec,
                    plan=plan,
                    selected_task_ids=(claim.task_id,),
                    claim_id=claim.claim_id,
                    attempt=claim.attempt,
                    requirement_ids=requirement_ids,
                    upstream=self.upstream(read, "tinker", binding.spec),
                    expected_revisions=tuple(expected),
                )
            )
        except PromptError:
            raise PromptRefused("prompt_invalid") from None
        return self._join(await self._skill("tinker"), prompt)
