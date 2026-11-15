"""Property 12 for the signed workflow commands.

Feature: doors-and-guardrails, Property 12: Invalid or stale workflow commands append no domain record

For any workflow mutation, invalid shape, unknown Mansion/Phase, malformed
identity/digest, excessive length, illegal transition, or stale
Projection_Version produces no App_Event_Candidate accepted by the writer; a
valid command produces at most one acknowledged domain record per command ID.

The commands go through the same parser and dispatcher the HTTP routes use
(``run_workflow_command``), against the real WorkflowService and guarded
filesystem over a modeled writer that counts every call.

Validates: Requirements 8.2, 8.3, 8.4, 8.5, 8.6.
"""

from __future__ import annotations

import asyncio
import copy
import tempfile
from pathlib import Path

from hypothesis import event as note_coverage
from hypothesis import given, settings
from hypothesis import strategies as st

from haunted_house.adapters.guarded_filesystem import GuardedFilesystem, GuardedRoomAccess
from haunted_house.core.guardrail_events import PHASES, Phase
from haunted_house.core.workflow import PhaseStatus
from haunted_house.workflow_routes import run_workflow_command
from tests.guardrail_support import MemoryWriter
from tests.workflow_support import MANSION, memory_house, tinker_delete

_ACTIONS = ("start", "ghost", "ghost", "door_approve", "door_approve", "door_reject", "risky_approve", "risky_reject")
_MUTATIONS = (
    *("none",) * 30,
    "duplicate", "reuse_command_id",
    "stale_low", "stale_high", "unknown_field", "missing_field", "bool_version",
    "float_version", "text_version", "negative_version", "short_command_id",
    "odd_command_id", "long_command_id", "not_an_object", "unknown_mansion",
    "invalid_mansion", "bad_target", "wrong_target", "malformed_digest",
    "other_digest", "wrong_revision", "wrong_path", "traversal_path", "huge_field",
    "wrong_decision",
)
_STEP = st.tuples(
    st.sampled_from(_ACTIONS),
    st.sampled_from(_MUTATIONS),
    st.sampled_from(PHASES),
    st.integers(min_value=0, max_value=9),
)


class World:
    def __init__(self, tmp: Path) -> None:
        self.writer = MemoryWriter()
        self.service, self.crew, self.bindings, self.root = memory_house(tmp, self.writer)
        self.accepted: list[tuple[str, dict]] = []  # (kind, request) that returned 200
        self._n = 0

    def command_id(self) -> str:
        self._n += 1
        return f"cmd-{self._n:06d}"

    async def projection(self):
        return (await self.service.projection(MANSION, reconcile=False)).read.projection

    async def frontier(self) -> Phase:
        projection = await self.projection()
        return next(
            (view.phase for view in projection.phases.values() if view.status is not PhaseStatus.APPROVED),
            Phase.IMPLEMENTATION,
        )

    async def natural(self, hint: str, variant: int) -> tuple[str, Phase]:
        projection = await self.projection()
        phase = await self.frontier()
        status = projection.phases[phase].status
        risky = any(item.status.value == "pending" for item in projection.risky_proposals.values())
        if risky and hint.startswith("risky"):
            return hint, phase
        if status is PhaseStatus.WORKING:
            return "ghost", phase
        if status is PhaseStatus.WAITING:
            return ("door_reject" if variant == 9 else "door_approve"), phase
        return "start", phase

    async def ghost(self, phase: Phase, variant: int) -> None:
        """What a bound Ghost does through its room tools."""

        projection = await self.projection()
        view = projection.phases[phase]
        if view.status is not PhaseStatus.WORKING or view.session_slot is None:
            return
        binding = self.bindings.load(f"dashboard:{view.session_slot}")
        assert binding is not None
        if phase is Phase.IMPLEMENTATION:
            source = self.root / MANSION / "src"
            source.mkdir(exist_ok=True)
            (source / f"file-{variant}.py").write_text("x\n", encoding="utf-8")
            if variant % 2:
                await self.service.propose_risky_action(binding, tinker_delete(f"src/file-{variant}.py"))
            else:
                (source / "result.txt").write_text(f"done {variant}\n", encoding="utf-8")
                await self.service.submit_phase_output(binding, "src/result.txt")
            return
        access = GuardedRoomAccess(GuardedFilesystem(self.root, MANSION), self.service.port)
        known = projection.documents.get(f".kiro/specs/{binding.spec}/{phase.value}.md")
        await access.write_spec_document(
            binding.scope, role=binding.role, spec_name=binding.spec, phase=phase,
            data=f"# {phase.value} {variant}\n".encode(),
            expected_revision=known.revision if known else 0,
        )
        await self.service.submit_phase_output(binding)

    async def request(self, action: str, phase: Phase, variant: int) -> dict | None:
        """The exact request an Operator would send now, or None."""

        projection = await self.projection()
        common = {"command_id": self.command_id(), "expected_version": projection.version}
        if action == "start":
            return {"kind": "start", "mansion_id": MANSION, "target": phase.value,
                    "decision": None, "body": common}
        if action.startswith("door"):
            pending = [
                view.proposal for view in projection.phases.values()
                if view.proposal is not None and view.proposal.status == "pending"
            ]
            if not pending:
                return None
            proposal = pending[variant % len(pending)]
            return {
                "kind": "door", "mansion_id": MANSION, "target": proposal.proposal_id,
                "decision": "approve" if action == "door_approve" else "reject",
                "body": {
                    **common,
                    "phase": proposal.phase.value,
                    "document_path": proposal.document_path,
                    "artifact_revision": {
                        "revision": proposal.artifact_revision.revision,
                        "sha256": proposal.artifact_revision.sha256,
                        "size_bytes": proposal.artifact_revision.size_bytes,
                    },
                },
            }
        pending = [item for item in projection.risky_proposals.values() if item.status.value == "pending"]
        if not pending:
            return None
        proposal = pending[variant % len(pending)]
        return {
            "kind": "approval", "mansion_id": MANSION, "target": proposal.proposal_id,
            "decision": "approve" if action == "risky_approve" else "reject",
            "body": {**common, "action_digest": proposal.action_digest},
        }


def _mutate(request: dict, mutation: str, variant: int, world: World) -> dict | None:
    """Return the mutated request, or None when the mutation does not apply."""

    request = copy.deepcopy(request)
    body, kind = request["body"], request["kind"]
    if mutation == "none":
        return request
    if mutation == "duplicate":
        return copy.deepcopy(world.accepted[variant % len(world.accepted)][1]) if world.accepted else None
    if mutation == "reuse_command_id":
        others = [req for other, req in world.accepted if other != kind or req["target"] != request["target"]]
        if not others:
            return None
        body["command_id"] = others[variant % len(others)]["body"]["command_id"]
    elif mutation == "stale_low":
        if body["expected_version"] == 0:
            return None
        body["expected_version"] -= 1 + variant % body["expected_version"]
    elif mutation == "stale_high":
        body["expected_version"] += 1 + variant
    elif mutation == "unknown_field":
        body[("force", "actor", "approve", "scope", "sequence")[variant % 5]] = True
    elif mutation == "missing_field":
        del body[sorted(body)[variant % len(body)]]
    elif mutation == "bool_version":
        body["expected_version"] = bool(body["expected_version"])
    elif mutation == "float_version":
        body["expected_version"] = float(body["expected_version"])
    elif mutation == "text_version":
        body["expected_version"] = str(body["expected_version"])
    elif mutation == "negative_version":
        body["expected_version"] = -1 - variant
    elif mutation == "short_command_id":
        body["command_id"] = "c" * (variant % 8)
    elif mutation == "odd_command_id":
        body["command_id"] = ("cmd 000 001", "cmd/000/001", "cmd_0000001", "../../cmd-1", 12345678)[variant % 5]
    elif mutation == "long_command_id":
        body["command_id"] = "c" * (65 + variant * 1000)
    elif mutation == "not_an_object":
        request["body"] = (None, [], "start", 7, [body])[variant % 5]
    elif mutation == "unknown_mansion":
        request["mansion_id"] = "another-mansion"
    elif mutation == "invalid_mansion":
        request["mansion_id"] = ("", "Demo-Mansion", "../demo-mansion", "demo mansion", "x" * 41, None)[variant % 6]
    elif mutation == "bad_target":
        request["target"] = ("", "review", "IMPLEMENTATION", "a/b", "x" * 200, None)[variant % 6]
    elif mutation == "wrong_target":
        if kind == "start":
            return None
        request["target"] = f"door-unknown-{variant}"
    elif mutation == "wrong_decision":
        if kind == "start":
            return None
        request["decision"] = ("bless", "", "APPROVE", None)[variant % 4]
    elif mutation in ("malformed_digest", "other_digest"):
        value = ("f" * 63, "F" * 64, "g" * 64, "", 64)[variant % 5] if mutation == "malformed_digest" else "e" * 64
        if kind == "door":
            body["artifact_revision"]["sha256"] = value
        elif kind == "approval":
            body["action_digest"] = value
        else:
            return None
    elif mutation == "wrong_revision":
        if kind != "door":
            return None
        body["artifact_revision"]["revision"] += 1 + variant
    elif mutation in ("wrong_path", "traversal_path"):
        if kind != "door":
            return None
        body["document_path"] = (
            "docs/other.md" if mutation == "wrong_path"
            else ("../x.md", "/etc/passwd", ".kiro//specs/x.md", "a/./b.md", "a%2f..%2fb")[variant % 5]
        )
    elif mutation == "huge_field":
        body["command_id"] = "c" * 100_000
    return request


async def _scenario(tmp: Path, steps) -> None:
    world = World(tmp)
    writer = world.writer
    for action, mutation, phase, variant in steps:
        if variant % 4:
            # Mostly the next sensible step on the frontier phase, so every
            # phase and both decision kinds are reached; otherwise an
            # arbitrary (usually illegal) action on an arbitrary phase.
            action, phase = await world.natural(action, variant)
        if action == "ghost":
            await world.ghost(phase, variant)
            continue
        valid = await world.request(action, phase, variant)
        if valid is None:
            continue
        request = _mutate(valid, mutation, variant, world)
        if request is None:
            continue
        before = len(writer.events)
        crew_before = len(world.crew.calls)
        reply = await run_workflow_command(
            world.service, request["kind"], mansion_id=request["mansion_id"],
            target=request["target"], decision=request["decision"], body=request["body"],
        )
        new = writer.events[before:]
        domain = [
            event for event in new
            if event.event_type == "domain_event_recorded"
            and event.payload["data"].get("command_id") is not None
        ]
        assert set(reply.body) <= {"error", "workflow", "event_id", "sequence", "version"}
        if reply.status != 200:
            # A refused command reached neither the writer nor Crew.
            assert new == [], (mutation, reply.body["error"]["code"], [e.payload for e in new])
            assert len(world.crew.calls) == crew_before
            assert reply.status in (400, 404, 409, 413, 423)
            if reply.status == 409:
                assert reply.body["workflow"]["version"] == before
            continue
        assert mutation in ("none", "duplicate"), (mutation, request)
        assert reply.body["version"] == reply.body["workflow"]["version"] == len(writer.events)
        if mutation == "duplicate" or any(req == request for _kind, req in world.accepted):
            # An exact retry is acknowledged with the same record and adds nothing.
            assert new == [] and len(world.crew.calls) == crew_before
        else:
            assert len(domain) == 1
            assert domain[0].payload["data"]["command_id"] == request["body"]["command_id"]
            assert reply.body["event_id"] == domain[0].event_id
            assert reply.body["sequence"] == domain[0].sequence
            world.accepted.append((request["kind"], request))

    # At most one acknowledged domain record per command id, ever.
    seen: dict[str, int] = {}
    for event in writer.events:
        if event.event_type == "domain_event_recorded":
            command_id = event.payload["data"].get("command_id")
            if command_id is not None and event.payload["data"].get("actor", "operator") == "operator":
                seen[command_id] = seen.get(command_id, 0) + 1
    assert all(count == 1 for count in seen.values()), seen
    assert set(seen) == {request["body"]["command_id"] for _kind, request in world.accepted}
    note_coverage(f"accepted commands: {min(len(world.accepted), 6)}")
    note_coverage(f"kinds accepted: {sorted({kind for kind, _request in world.accepted})}")


@settings(max_examples=120)
@given(steps=st.lists(_STEP, min_size=8, max_size=70))
def test_invalid_or_stale_workflow_commands_append_no_domain_record(steps):
    with tempfile.TemporaryDirectory(prefix="hh-prop12-") as tmp:
        asyncio.run(_scenario(Path(tmp), steps))


def test_a_walk_through_every_phase_accepts_each_valid_command_once():
    steps = []
    for phase in PHASES:
        steps += [("start", "none", phase, 0), ("ghost", "none", phase, 0),
                  ("door_approve", "stale_high", phase, 0), ("door_approve", "wrong_revision", phase, 0),
                  ("door_approve", "none", phase, 0), ("door_approve", "duplicate", phase, 3)]
    with tempfile.TemporaryDirectory(prefix="hh-prop12-") as tmp:
        world = World(Path(tmp))

        async def run():
            await _scenario_with(world, steps)
            return await world.projection()

        projection = asyncio.run(run())
    assert [view.door.value for view in projection.phases.values()] == ["open"] * 4
    assert len(world.accepted) == 8


async def _scenario_with(world: World, steps) -> None:
    for action, mutation, phase, variant in steps:
        if action == "ghost":
            await world.ghost(phase, variant)
            continue
        valid = await world.request(action, phase, variant)
        request = _mutate(valid, mutation, variant, world) if valid else None
        if request is None:
            continue
        reply = await run_workflow_command(
            world.service, request["kind"], mansion_id=request["mansion_id"],
            target=request["target"], decision=request["decision"], body=request["body"],
        )
        if reply.status == 200 and all(req != request for _kind, req in world.accepted):
            world.accepted.append((request["kind"], request))
