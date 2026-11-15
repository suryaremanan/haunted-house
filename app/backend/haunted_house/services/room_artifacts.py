"""The terminal gate's ports over the completed Spec 4 interfaces.

``GuardedArtifactInspector`` reads a run's artifact through the Spec 4
``GuardedFilesystem`` with that run's own Room_Policy, so the gate can
inspect nothing the Ghost could not read.  ``WorkflowOutputPort`` hands a
validated artifact to ``WorkflowService.submit_phase_output``.  Both resolve
the trusted ``RoomBinding`` the backend wrote for the session and refuse a
run whose identity does not match it.

``RoomGhostOutputValidator`` is the Spec 5 ``OutputValidator`` the
WorkflowService accepts: with it, a Ghost that calls ``submit_phase_output``
itself can open no Door proposal for an artifact that fails validation.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from pathlib import Path

from haunted_house.adapters.guarded_filesystem import (
    GuardedFilesystem,
    GuardedFilesystemError,
)
from haunted_house.adapters.session_bindings import (
    RoomBinding,
    SessionBindingStore,
    session_label,
)
from haunted_house.adapters.workflow_service import PhaseOutput, WorkflowService
from haunted_house.core.artifact_validation import (
    extract_requirement_ids,
    validate_phase_artifact,
)
from haunted_house.core.ghost_run import GhostRunBinding
from haunted_house.core.guardrail_events import Phase
from haunted_house.core.path_policy import (
    Access,
    PathRule,
    RoomPolicy,
    join_parts,
    room_policy,
    spec_document_parts,
)
from haunted_house.core.workflow import DoorProposal
from haunted_house.services.canonical_port import CanonicalRunPort
from haunted_house.services.terminal_gate import (
    ArtifactError,
    ArtifactSnapshot,
    OutputDecision,
)

__all__ = [
    "GuardedArtifactInspector",
    "RoomGhostOutputValidator",
    "WorkflowOutputPort",
    "resolve_room_binding",
    "run_binding_for",
]

BindingProvider = SessionBindingStore | Callable[[], SessionBindingStore | None]


def _store(provider: BindingProvider) -> SessionBindingStore | None:
    return provider() if callable(provider) else provider


def run_binding_for(binding: RoomBinding, **facts: object) -> GhostRunBinding:
    """The GhostRunBinding of a session the backend bound (trusted input only)."""

    return GhostRunBinding(
        run_id=binding.run_id,
        run_sequence=binding.run_sequence,
        mansion_id=binding.mansion,
        spec_name=binding.spec,
        phase=binding.phase,
        ghost_name=binding.ghost,
        slot=binding.slot,
        **facts,  # type: ignore[arg-type]
    )


def resolve_room_binding(provider: BindingProvider, binding: GhostRunBinding) -> RoomBinding | None:
    """The session's trusted RoomBinding when it is this very run, else ``None``."""

    store = _store(provider)
    if store is None:
        return None
    try:
        found = store.load(session_label(binding.slot))
    except Exception:  # noqa: BLE001 - an unreadable record is no identity
        return None
    if (
        found is None
        or found.scope != binding.scope
        or found.spec != binding.spec_name
        or found.phase is not binding.phase
    ):
        return None
    return found


class GuardedArtifactInspector:
    def __init__(
        self,
        bindings: BindingProvider,
        filesystem: Callable[[RoomBinding], GuardedFilesystem] | None = None,
    ) -> None:
        self._bindings = bindings
        self._filesystem = filesystem or (
            lambda room: GuardedFilesystem(Path(room.mansion_root), room.mansion)
        )

    async def inspect(self, binding: GhostRunBinding, path: str) -> ArtifactSnapshot:
        room = resolve_room_binding(self._bindings, binding)
        policy = room_policy(room.role, room.spec) if room is not None else None
        if room is None or policy is None:
            raise ArtifactError("identity_unavailable")
        try:
            data, digest = await asyncio.to_thread(
                self._filesystem(room).read_file, policy, path
            )
        except GuardedFilesystemError as error:
            raise ArtifactError(
                "artifact_missing" if error.code == "not_found" else error.code
            ) from None
        return ArtifactSnapshot(path, digest.sha256, digest.size_bytes, data)


class WorkflowOutputPort:
    """Spec 4 output submission for a phase run the gate has validated."""

    def __init__(
        self, workflow: WorkflowService, port: CanonicalRunPort, bindings: BindingProvider
    ) -> None:
        self._workflow = workflow
        self._port = port
        self._bindings = bindings

    async def submit(self, binding: GhostRunBinding, artifact: ArtifactSnapshot) -> OutputDecision:
        room = resolve_room_binding(self._bindings, binding)
        if room is None:
            return OutputDecision(False, "identity_unavailable")
        pending = await self._pending(binding)
        if pending is not None:
            # The Ghost already submitted through its room tool.
            same = (
                pending.document_path == artifact.path
                and pending.artifact_revision.sha256 == artifact.sha256
            )
            return OutputDecision(same, "ok" if same else "artifact_mismatch", pending.proposal_id)
        result = await self._workflow.submit_phase_output(room)
        if result.ok is not True:
            return OutputDecision(False, result.code)
        proposal_id = result.data.get("proposal_id")
        revision = result.data.get("artifact_revision")
        if type(revision) is not dict or revision.get("sha256") != artifact.sha256:
            # Spec 4 proposed other bytes than the ones that were validated.
            return OutputDecision(False, "artifact_mismatch")
        return OutputDecision(True, "ok", proposal_id if type(proposal_id) is str else None)

    async def _pending(self, binding: GhostRunBinding) -> DoorProposal | None:
        view = (await self._port.read(binding.mansion_id)).projection.phases[binding.phase]
        proposal = view.proposal
        return proposal if proposal is not None and proposal.status == "pending" else None


class RoomGhostOutputValidator:
    """``OutputValidator`` for ``WorkflowService``: Room Ghosts artifact rules.

    A spec phase output must pass its phase validator against the current
    requirement identifiers.  An implementation result is left to the
    baseline (non-empty) rule: a task is validated by the terminal gate.
    """

    def __init__(self, filesystem: Callable[[str], GuardedFilesystem]) -> None:
        self._filesystem = filesystem

    async def __call__(self, output: PhaseOutput) -> str | None:
        if not output.content.strip():
            return "empty_output"
        if output.phase is Phase.IMPLEMENTATION:
            return None
        try:
            text = output.content.decode("utf-8")
        except UnicodeDecodeError:
            return "artifact_not_text"
        requirement_ids: frozenset[str] = frozenset()
        if output.phase is not Phase.REQUIREMENTS:
            parts = spec_document_parts(output.spec_name, "requirements.md")
            reader = RoomPolicy("house", (PathRule(parts, frozenset({Access.READ})),), ())
            try:
                data, _digest = await asyncio.to_thread(
                    self._filesystem(output.mansion_id).read_file, reader, join_parts(parts)
                )
                requirement_ids = extract_requirement_ids(data.decode("utf-8"))
            except (GuardedFilesystemError, UnicodeDecodeError):
                return "upstream_unavailable"
        return "artifact_invalid" if validate_phase_artifact(output.phase, text, requirement_ids) else None
