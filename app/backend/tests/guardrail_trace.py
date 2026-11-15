"""The safety regression trace of Doors and Guardrails (task 16.3).

``build_trace`` drives the real WorkflowService, room tool service, guarded
filesystem, and action executor over the real Spec 2 file writer in a
temporary directory, with fixed identifiers and a fixed clock, and returns
the bytes of the canonical log it produced.  The committed fixture is exactly
those bytes: a synthetic ``demo-mansion`` with no recorded Crew data, no
credential, and no host path.

The story covers what the safety properties are about:

* phase order: every phase starts by an explicit command after the Door
  before it was approved; a rejected Door needs a new explicit start;
* exact approval before risky execution: proposals, an approval, a
  rejection, one consumption per approval, a success and a failure, and
  refused attempts (mismatched action, spent approval, rejected proposal);
* room confinement: every out-of-room request is denied before any access
  and leaves only ``path_denied`` evidence.

Regenerate with ``.venv/bin/python scripts/build_guardrail_trace.py``.
"""

from __future__ import annotations

import os
from pathlib import Path

from haunted_house.adapters.room_tool_service import RoomToolService
from haunted_house.adapters.seance_log_store import SeanceLogStore
from haunted_house.core.guardrail_events import PHASES, Phase
from tests.workflow_support import MANSION, SPEC, memory_house, tinker_delete

FIXTURE = (
    Path(__file__).resolve().parents[3] / "fixtures" / "guardrails" / "safety-trace.events.jsonl"
)
CLOCK_MS = 1_731_400_000_000


async def build_trace(tmp_path: Path) -> bytes:
    base = Path(os.path.realpath(tmp_path))
    store = SeanceLogStore(base / "mansions", clock_ms=lambda: CLOCK_MS)
    service, _crew, bindings, root = memory_house(base, store)
    counter = iter(range(1, 100_000))
    rooms = RoomToolService(
        service.port, root, operations=service, id_factory=lambda: f"room-{next(counter):05d}"
    )
    mansion = root / MANSION
    commands = iter(range(1, 100_000))

    def command_id() -> str:
        return f"cmd-trace-{next(commands):05d}"

    async def version() -> int:
        return (await service.projection(MANSION, reconcile=False)).version

    async def binding(phase: Phase):
        view = await service.projection(MANSION, reconcile=False)
        found = bindings.load(f"dashboard:{view.read.projection.phases[phase].session_slot}")
        assert found is not None
        return found

    async def start(phase: Phase):
        await service.start_phase(
            MANSION, phase, command_id=command_id(), expected_version=await version()
        )
        return await binding(phase)

    async def decide_door(phase: Phase, approve: bool) -> None:
        view = await service.projection(MANSION, reconcile=False)
        proposal = view.read.projection.phases[phase].proposal
        await service.decide_door(
            MANSION, proposal.proposal_id, approve=approve, phase=phase,
            document_path=proposal.document_path, artifact_revision=proposal.artifact_revision,
            command_id=command_id(), expected_version=view.version,
        )

    async def decide_risky(proposal_id: str, digest: str, approve: bool) -> None:
        await service.decide_risky_action(
            MANSION, proposal_id, approve=approve, action_digest=digest,
            command_id=command_id(), expected_version=await version(),
        )

    async def write(ghost, text: str, revision: int) -> None:
        written = await rooms.call(
            ghost, "write_spec_document", {"content": text, "expected_revision": revision}
        )
        assert written["ok"], written

    (mansion / "src").mkdir()
    for name in ("old.py", "gone.py", "keep.py"):
        (mansion / "src" / name).write_text("x = 1\n", encoding="utf-8")
    (mansion / ".env").write_text("EXAMPLE=1\n", encoding="utf-8")

    # --- requirements: out-of-room attempts, then an approved Door ------------------
    archivist = await start(Phase.REQUIREMENTS)
    for path in ("../elsewhere/notes.md", ".env", ".git/config"):
        refused = await rooms.call(archivist, "read_room_file", {"path": path})
        assert not refused["ok"], refused
    await write(archivist, "# Requirements\n\nSynthetic requirements.\n", 0)
    assert (await rooms.call(archivist, "submit_phase_output", {}))["ok"]
    await decide_door(Phase.REQUIREMENTS, True)

    # --- design: rejected once, revised by a new explicit start ------------------------
    draughtsman = await start(Phase.DESIGN)
    await write(draughtsman, "# Design\n\nFirst draft.\n", 0)
    assert (await rooms.call(draughtsman, "submit_phase_output", {}))["ok"]
    await decide_door(Phase.DESIGN, False)
    draughtsman = await start(Phase.DESIGN)
    await write(draughtsman, "# Design\n\nSecond draft.\n", 1)
    assert (await rooms.call(draughtsman, "submit_phase_output", {}))["ok"]
    await decide_door(Phase.DESIGN, True)

    # --- tasks ------------------------------------------------------------------------
    foreman = await start(Phase.TASKS)
    await write(foreman, "# Tasks\n\n- [ ] 1. Synthetic task.\n", 0)
    assert (await rooms.call(foreman, "submit_phase_output", {}))["ok"]
    await decide_door(Phase.TASKS, True)

    # --- implementation: guarded writes and exact one-time approvals ------------------
    tinker = await start(Phase.IMPLEMENTATION)
    assert (await rooms.call(tinker, "write_room_file", {"path": "src/app.py", "content": "y = 2\n"}))["ok"]
    for path in (f".kiro/specs/{SPEC}/tasks.md", ".env", "../elsewhere/x.py"):
        refused = await rooms.call(tinker, "write_room_file", {"path": path, "content": "x"})
        assert not refused["ok"], refused
    assert not (await rooms.call(tinker, "propose_risky_action", {"action": tinker_delete(".env")}))["ok"]

    async def propose(path: str) -> tuple[str, str, dict]:
        action = tinker_delete(path)
        proposed = await rooms.call(tinker, "propose_risky_action", {"action": action})
        assert proposed["ok"], proposed
        return proposed["proposal_id"], proposed["action_digest"], action

    async def execute(proposal_id: str, action: dict) -> dict:
        return await rooms.call(
            tinker, "execute_approved_action", {"proposal_id": proposal_id, "action": action}
        )

    allowed, allowed_digest, allowed_action = await propose("src/old.py")
    failing, failing_digest, failing_action = await propose("src/gone.py")
    rejected, rejected_digest, rejected_action = await propose("src/keep.py")
    assert (await execute(allowed, allowed_action))["code"] == "proposal_pending"
    await decide_risky(allowed, allowed_digest, True)
    await decide_risky(failing, failing_digest, True)
    await decide_risky(rejected, rejected_digest, False)
    assert (await execute(allowed, failing_action))["code"] == "descriptor_mismatch"
    assert (await execute(allowed, allowed_action))["ok"]
    assert (await execute(allowed, allowed_action))["code"] == "proposal_consumed"
    (mansion / "src" / "gone.py").unlink()
    assert (await execute(failing, failing_action))["code"] == "not_found"
    assert (await execute(rejected, rejected_action))["code"] == "proposal_rejected"

    assert (await rooms.call(tinker, "submit_phase_output", {"path": "src/app.py"}))["ok"]
    await decide_door(Phase.IMPLEMENTATION, True)

    final = await service.projection(MANSION, reconcile=False)
    assert [final.read.projection.phases[phase].door.value for phase in PHASES] == ["open"] * 4
    return next(mansion.rglob("events.v1.*")).read_bytes()
