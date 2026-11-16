#!/usr/bin/env python3
"""Build fixtures/replay/demo.jsonl, the canonical Event_Log the replay page plays.

Usage (needs Python 3.12, e.g. the repo's .venv):
  .venv/bin/python scripts/build_replay_fixture.py           write the fixture
  .venv/bin/python scripts/build_replay_fixture.py --check   exit 1 if it is stale

The story below is synthetic: an invented `demo-mansion` with no recorded Crew
data, credentials, or home paths. Every record goes through the same pure
pipeline as a live append (prepare_candidates: validate, deep-redact, residual
check, identify; then build_app_event: Sequence, persistence time, hash link;
then serialize_app_event), so the file is byte-for-byte what the
Canonical_Event_Writer would persist. Times are fixed, so the output is
deterministic.

The log ends with one ghost in each of the six Ghost_States:
  medium idle, foreman working (run 1, after run 0 failed), tinker-2 waiting,
  tinker-1 blocked, tinker-3 failed, archivist and draughtsman done.

The same story carries the Spec 4 `doors_and_guardrails` facts of that run,
built with the backend's own typed builders: explicit phase starts, content-free
Spec_Document write evidence, Door proposals and decisions, a denied start, and
one pending risky action. It ends with the requirements and design Doors open,
the tasks phase working behind a sealed Door, and Tinker 2 waiting on an exact
approval.

Two more files are written beside it, both produced by the backend fold
(`fold_workflow`) and serializer (`workflow_projection_to_json`), so the
TypeScript replay fold can be compared with the backend record for record:
  fixtures/replay/demo.workflow.json     the workflow projection after each
                                         record of demo.jsonl that changed it
  fixtures/seance/workflow-vectors.json  a second synthetic log that walks the
                                         transition rules, valid and invalid,
                                         with its projections

A fourth file is test-only evidence for the replay engine (Spec 7, Requirement
5.4). The replay page never loads it: replay state always comes from folding
demo.jsonl.
  fixtures/replay/demo.expected.json     the selected Record_IDs in
                                         Canonical_Order, the narrative the
                                         story covers, and the backend's final
                                         ghost and workflow projection
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from dataclasses import asdict, replace
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "app" / "backend"))

from haunted_house.core import guardrail_events as guardrails  # noqa: E402
from haunted_house.core.action_descriptor import (  # noqa: E402
    ActionDescriptor,
    ActionError,
    action_digest,
    parse_action_descriptor,
)
from haunted_house.core.ghost_state import fold_ghost_events  # noqa: E402
from haunted_house.core.guardrail_events import Phase  # noqa: E402
from haunted_house.core.path_policy import Access  # noqa: E402
from haunted_house.core.seance_event import (  # noqa: E402
    AppEvent,
    AppEventCandidate,
    EventScope,
    EventSource,
    JSONValue,
)
from haunted_house.core.seance_persistence import (  # noqa: E402
    GENESIS_HASH,
    build_app_event,
    prepare_candidates,
    serialize_app_event,
)
from haunted_house.core.workflow import advance_workflow, initial_workflow  # noqa: E402
from haunted_house.core.workflow_dto import workflow_projection_to_json  # noqa: E402

FIXTURE = REPO_ROOT / "fixtures" / "replay" / "demo.jsonl"
WORKFLOW_FIXTURE = REPO_ROOT / "fixtures" / "replay" / "demo.workflow.json"
EXPECTED_FIXTURE = REPO_ROOT / "fixtures" / "replay" / "demo.expected.json"
VECTORS_FIXTURE = REPO_ROOT / "fixtures" / "seance" / "workflow-vectors.json"
MANSION = "demo-mansion"
VECTOR_MANSION = "vector-mansion"
# 2026-11-14T12:00:00Z. Fixed so the fixture never changes between builds.
BASE_MS = 1_794_657_600_000
# The writer persists a few milliseconds after a fact occurs.
PERSIST_LAG_MS = 4


class Story:
    """Collects candidates with their occurrence offsets, in append order."""

    def __init__(self) -> None:
        self.entries: list[tuple[AppEventCandidate, int]] = []
        self._counter = 0

    def add(
        self,
        at_ms: int,
        scope: EventScope,
        event_type: str,
        payload: JSONValue,
        *,
        origin: str = "house",
        source_type: str | None = None,
        identity: tuple[str, ...] | None = None,
        revision: int = 0,
        generation: str = "",
        source_sequence: int = 0,
        timed: bool = True,
    ) -> None:
        self._counter += 1
        self.entries.append(
            (
                AppEventCandidate(
                    schema_version=1,
                    event_type=event_type,  # type: ignore[arg-type]
                    scope=scope,
                    source=EventSource(
                        origin=origin,  # type: ignore[arg-type]
                        source_type=source_type or event_type,
                        identity_parts=identity or (f"{event_type}-{self._counter}",),
                        revision=revision,
                        generation=generation,
                        source_sequence=source_sequence,
                    ),
                    caused_by=(),
                    # Most Crew frames carry no timestamp.
                    occurred_at_ms=BASE_MS + at_ms if timed else None,
                    payload=payload,
                ),
                at_ms,
            )
        )


    def fact(self, at_ms: int, candidate: AppEventCandidate) -> None:
        """Adds a Spec 4 domain candidate a backend builder produced."""

        self.entries.append((replace(candidate, occurred_at_ms=BASE_MS + at_ms), at_ms))


def digest_of(label: str) -> str:
    """A synthetic artifact digest: the story has no real document to hash."""

    return hashlib.sha256(label.encode("utf-8")).hexdigest()


def descriptor(raw: dict[str, JSONValue]) -> ActionDescriptor:
    parsed = parse_action_descriptor(raw)
    if isinstance(parsed, ActionError):
        raise SystemExit(f"build_replay_fixture: descriptor rejected: {parsed}")
    return parsed


def scope(ghost: str, run_id: str, run_sequence: int = 0, mansion: str = MANSION) -> EventScope:
    return EventScope(
        mansion_id=mansion,
        ghost_id=ghost,
        session_slot=f"hh-{ghost}-{run_id}",
        run_id=run_id,
        run_sequence=run_sequence,
    )


def crew_turn(
    story: Story,
    at_ms: int,
    where: EventScope,
    *,
    generation: str,
    tool_call_id: str,
    tool: str,
    approval_mid: str | None = None,
    approved: bool = True,
) -> int:
    """One Crew turn: status, a streamed reply, one tool call, the turn end."""

    def crew(offset: int, event_type: str, source_type: str, payload: JSONValue, **kw: object) -> None:
        kw.setdefault("generation", generation)
        story.add(
            at_ms + offset,
            where,
            event_type,
            payload,
            origin="crew",
            source_type=source_type,
            timed=False,
            **kw,  # type: ignore[arg-type]
        )

    crew(0, "ghost_progressed", "chat_status", {"status": "working"}, identity=(generation, "working"))
    crew(300, "response_segment_started", "chat_segment", {"generation": generation, "source_sequence": 0},
         identity=(generation, "segment-0"))
    crew(600, "response_chunk_recorded", "chat_chunk",
         {"generation": generation, "source_sequence": 1, "content": "Reading the room's notes. "},
         identity=(generation, "1"), source_sequence=1)
    crew(1_200, "tool_started", "tool_call",
         {"tool_call_id": tool_call_id, "tool": tool, "kind": "edit", "is_shell": False},
         identity=(tool_call_id, "start"))
    end = 1_800
    if approval_mid is not None:
        crew(1_500, "approval_requested", "crew_approval", {"mid": approval_mid},
             identity=(approval_mid,), revision=1, generation="")
        crew(4_500, "approval_decided", "crew_approval",
             {"mid": approval_mid, "outcome": "approved" if approved else "rejected"},
             identity=(approval_mid,), revision=2, generation="")
        end = 5_000
    crew(end, "tool_finished", "tool_result", {"tool_call_id": tool_call_id, "final": True},
         identity=(tool_call_id, "final"))
    crew(end + 400, "response_chunk_recorded", "chat_chunk",
         {"generation": generation, "source_sequence": 2, "content": "The draft is written."},
         identity=(generation, "2"), source_sequence=2)
    crew(end + 800, "crew_turn_ended", "chat_done",
         {"generation": generation, "continuing": False, "needs_input": False},
         identity=(generation, "done"))
    return at_ms + end + 800


def door(story: Story, at_ms: int, where: EventScope, entity: str, kind: str, data: JSONValue) -> None:
    story.add(
        at_ms,
        where,
        "domain_event_recorded",
        {"domain": "doors", "kind": kind, "entity_id": entity, "data": data},
        identity=(entity, kind),
    )


def spec_write(
    story: Story, at_ms: int, where: EventScope, phase: Phase, write_id: str, *, size_bytes: int,
    spec: str = "demo", revision: int = 1, base_sha256: str | None = None,
) -> dict[str, object]:
    """Content-free evidence of one atomic Spec_Document write. Returns the artifact fields."""

    artifact: dict[str, object] = {
        "document_path": f".kiro/specs/{spec}/{phase.value}.md",
        "revision": revision,
        "sha256": digest_of(f"{where.mansion_id} {phase.value}.md revision {revision}"),
        "size_bytes": size_bytes,
    }
    story.fact(at_ms, guardrails.spec_write_prepared(
        where, write_id=write_id, phase=phase, base_revision=revision - 1, base_sha256=base_sha256, **artifact))
    story.fact(at_ms + 100, guardrails.spec_document_written(where, write_id=write_id, phase=phase, **artifact))
    return artifact


def build_story() -> Story:
    story = Story()

    # The Séance Room is prepared, but its ghost has no assignment: idle.
    medium = scope("medium", "unassigned")
    door(story, 0, medium, "seance-room", "room_prepared", {"phase": "review"})

    # Study: the Archivist writes requirements behind one tool approval.
    study = scope("archivist", "requirements-1")
    story.add(500, study, "run_started", {"reason": "Writing requirements", "room": "study"})
    # The operator started the phase explicitly: the house reserves the start, binds the
    # Crew session, and only then sends the turn. Every phase below follows the same order.
    story.fact(600, guardrails.phase_start_reserved(
        study, phase=Phase.REQUIREMENTS, reservation_id="res-requirements-1", command_id="cmd-start-requirements"))
    story.fact(750, guardrails.phase_started(
        study, phase=Phase.REQUIREMENTS, reservation_id="res-requirements-1", session_slot=study.session_slot))
    t = crew_turn(story, 900, study, generation="gen-study-1", tool_call_id="tool-study-1",
                  tool="write_spec_document", approval_mid="mid-study-1")
    requirements = spec_write(story, t + 100, study, Phase.REQUIREMENTS, "write-requirements-1", size_bytes=2_314)
    door(story, t + 300, study, "requirements", "artifact_validated",
         {"artifact": ".kiro/specs/demo/requirements.md", "valid": True})
    story.fact(t + 350, guardrails.phase_output_ready(
        study, phase=Phase.REQUIREMENTS, proposal_id="door-requirements-1", **requirements))
    story.add(t + 400, study, "run_completed", {"reason": "requirements.md is ready for review"})
    door(story, t + 2_400, study, "requirements-door", "door_approved", {"actor": "owner", "approved": True})
    # The exact decision: this proposal, this revision, this digest.
    story.fact(t + 2_450, guardrails.door_approved(
        study, phase=Phase.REQUIREMENTS, proposal_id="door-requirements-1", actor="operator",
        command_id="cmd-approve-requirements", **requirements))

    # Drafting Room: the Draughtsman writes the design without needing approval.
    drafting = scope("draughtsman", "design-1")
    # An open Door only makes the next phase ready: it starts when the operator starts it.
    story.add(t + 2_900, drafting, "run_started", {"reason": "Drawing the design", "room": "drafting-room"})
    story.fact(t + 3_000, guardrails.phase_start_reserved(
        drafting, phase=Phase.DESIGN, reservation_id="res-design-1", command_id="cmd-start-design"))
    story.fact(t + 3_150, guardrails.phase_started(
        drafting, phase=Phase.DESIGN, reservation_id="res-design-1", session_slot=drafting.session_slot))
    t = crew_turn(story, t + 3_300, drafting, generation="gen-drafting-1", tool_call_id="tool-drafting-1",
                  tool="write_spec_document")
    design = spec_write(story, t + 100, drafting, Phase.DESIGN, "write-design-1", size_bytes=4_871)
    door(story, t + 300, drafting, "design", "artifact_validated",
         {"artifact": ".kiro/specs/demo/design.md", "valid": True})
    story.fact(t + 350, guardrails.phase_output_ready(
        drafting, phase=Phase.DESIGN, proposal_id="door-design-1", **design))
    story.add(t + 400, drafting, "run_completed", {"reason": "design.md is ready for review"})
    door(story, t + 2_400, drafting, "design-door", "door_approved", {"actor": "owner", "approved": True})
    story.fact(t + 2_450, guardrails.door_approved(
        drafting, phase=Phase.DESIGN, proposal_id="door-design-1", actor="operator",
        command_id="cmd-approve-design", **design))

    # Workshop: the Foreman's first run ends without a valid task plan and fails.
    foreman_0 = scope("foreman", "tasks-1", 0)
    story.add(t + 2_900, foreman_0, "run_started", {"reason": "Planning the tasks", "room": "workshop"})
    story.fact(t + 3_000, guardrails.phase_start_reserved(
        foreman_0, phase=Phase.TASKS, reservation_id="res-tasks-1", command_id="cmd-start-tasks"))
    story.fact(t + 3_150, guardrails.phase_started(
        foreman_0, phase=Phase.TASKS, reservation_id="res-tasks-1", session_slot=foreman_0.session_slot))
    t = crew_turn(story, t + 3_300, foreman_0, generation="gen-workshop-1", tool_call_id="tool-workshop-1",
                  tool="write_spec_document")
    # The file was written, but it is not a valid task plan: no Door proposal follows.
    spec_write(story, t + 100, foreman_0, Phase.TASKS, "write-tasks-1", size_bytes=912)
    door(story, t + 300, foreman_0, "tasks", "artifact_validated",
         {"artifact": ".kiro/specs/demo/tasks.md", "valid": False})
    story.add(t + 400, foreman_0, "run_failed", {"reason": "artifact_invalid"})

    # A second, higher run supersedes the failure. It is still working at the end.
    foreman_1 = scope("foreman", "tasks-2", 1)
    story.add(t + 2_400, foreman_1, "run_started", {"reason": "Planning the tasks again", "room": "workshop"})
    story.add(t + 2_800, foreman_1, "ghost_progressed", {"status": "working"}, origin="crew",
              source_type="chat_status", identity=("gen-workshop-2", "working"), generation="gen-workshop-2",
              timed=False)
    story.add(t + 3_400, foreman_1, "tool_started",
              {"tool_call_id": "tool-workshop-2", "tool": "write_spec_document", "kind": "edit", "is_shell": False},
              origin="crew", source_type="tool_call", identity=("tool-workshop-2", "start"),
              generation="gen-workshop-2", timed=False)

    # Tinker 1 may not start: the tasks door upstream is still sealed.
    tinker_1 = scope("tinker-1", "task-1")
    # Implementation cannot start: the refusal is recorded, and nothing else changes.
    story.fact(t + 3_900, guardrails.phase_start_denied(
        tinker_1, phase=Phase.IMPLEMENTATION, command_id="cmd-start-implementation",
        code="predecessor_door_sealed"))
    story.add(t + 4_000, tinker_1, "run_started", {"reason": "Building task 1", "room": "workshop"})
    story.add(t + 4_300, tinker_1, "run_blocked", {"reason": "locked_door"})

    # Tinker 2 asks to run a shell command and waits for the owner.
    tinker_2 = scope("tinker-2", "task-2")
    story.add(t + 5_000, tinker_2, "run_started", {"reason": "Building task 2", "room": "workshop"})
    story.add(t + 5_400, tinker_2, "tool_started",
              {"tool_call_id": "tool-tinker-2", "tool": "run_tests", "kind": "execute", "is_shell": True},
              origin="crew", source_type="tool_call", identity=("tool-tinker-2", "start"),
              generation="gen-tinker-2", timed=False)
    # The exact action it wants to run once: one argv, one folder, one read intent.
    story.fact(t + 5_550, guardrails.risky_action_proposed(
        tinker_2, proposal_id="risky-run-tests-1", descriptor=descriptor({
            "schema_version": 1,
            "mansion_id": MANSION,
            "session_slot": tinker_2.session_slot,
            "room": "workshop",
            "kind": "run_command",
            "working_directory": "",
            "arguments": {"argv": ["bun", "test"], "timeout_seconds": 120},
            "path_intents": [{"access": "command_read", "path": "src"}],
        })))
    story.add(t + 5_700, tinker_2, "approval_requested", {"mid": "mid-tinker-2"}, origin="crew",
              source_type="crew_approval", identity=("mid-tinker-2",), revision=1, timed=False)

    # Tinker 3's Crew turn errors; the house then settles the run as failed.
    tinker_3 = scope("tinker-3", "task-3")
    story.add(t + 6_400, tinker_3, "run_started", {"reason": "Building task 3", "room": "workshop"})
    story.add(t + 7_000, tinker_3, "crew_error_observed", {"category": "provider_error"}, origin="crew",
              source_type="chat_error", identity=("gen-tinker-3", "error"), generation="gen-tinker-3", timed=False)
    story.add(t + 7_400, tinker_3, "run_failed", {"reason": "crew_error"})
    return story


def persist(story: Story) -> list[AppEvent]:
    """Runs a story through the writer's pure pipeline: validate, redact, identify, sequence, link."""

    prepared = prepare_candidates([candidate for candidate, _ in story.entries])
    if not prepared.ok:
        raise SystemExit(f"build_replay_fixture: story rejected: {prepared.diagnostics}")

    events: list[AppEvent] = []
    previous_hash = GENESIS_HASH
    seen: set[str] = set()
    for sequence, (item, (_, at_ms)) in enumerate(zip(prepared.candidates, story.entries), start=1):
        if item.record_id in seen:
            raise SystemExit(f"build_replay_fixture: duplicate record at story entry {sequence}")
        seen.add(item.record_id)
        event = build_app_event(
            item,
            sequence=sequence,
            persisted_at_ms=BASE_MS + at_ms + PERSIST_LAG_MS,
            prev_hash=previous_hash,
        )
        assert event.hash is not None
        previous_hash = event.hash
        events.append(event)
    return events


def render() -> bytes:
    return b"".join(serialize_app_event(event) for event in persist(build_story()))


def workflow_steps(events: list[AppEvent], mansion: str) -> list[dict[str, JSONValue]]:
    """The backend projection before any record and after each record that changed it."""

    projection = initial_workflow()
    steps: list[dict[str, JSONValue]] = [
        {"sequence": 0, "workflow": workflow_projection_to_json(projection, mansion_id=mansion, events=[])}
    ]
    previous: JSONValue = None
    for index, event in enumerate(events):
        projection = advance_workflow(projection, [event])
        shown = workflow_projection_to_json(projection, mansion_id=mansion, events=events[: index + 1])
        state = {key: value for key, value in shown.items() if key != "version"}
        if state != previous or index == len(events) - 1:
            steps.append({"sequence": event.sequence, "workflow": shown})
        previous = state
    return steps


def json_lines(head: dict[str, JSONValue], name: str, items: list[JSONValue]) -> bytes:
    """A JSON document with one array item per line, so a change reads well in a diff."""

    encode = lambda value: json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)  # noqa: E731
    opening = encode(head)[:-1]
    body = ",\n".join(encode(item) for item in items)
    return f'{opening},"{name}":[\n{body}\n]}}\n'.encode("utf-8")


def render_workflow() -> bytes:
    events = persist(build_story())
    return json_lines(
        {"mansion_id": MANSION, "source": "fixtures/replay/demo.jsonl"}, "steps", workflow_steps(events, MANSION)
    )


def build_vector_story() -> Story:
    """A second synthetic log that walks the Spec 4 transition rules, valid and invalid.

    Builders check a payload's shape, not whether it is a valid transition, so
    an out-of-order record can be appended here exactly as a faulty writer
    client could append one. The fold must keep the preceding valid state.
    """

    story = Story()
    at = iter(range(0, 1_000_000, 100))

    def fact(candidate: AppEventCandidate) -> None:
        story.fact(next(at), candidate)

    def where(ghost: str, run_id: str) -> EventScope:
        return scope(ghost, run_id, mansion=VECTOR_MANSION)

    operator = guardrails.operator_scope(VECTOR_MANSION)
    archivist = where("archivist", "requirements-1")
    draughtsman = where("draughtsman", "design-1")
    tinker = where("tinker-1", "task-1")
    other_tinker = where("tinker-2", "task-2")
    reserve, started, failed = guardrails.phase_start_reserved, guardrails.phase_started, guardrails.phase_start_failed

    # A phase behind a sealed Door cannot be reserved; a duplicate command id is refused.
    fact(reserve(operator, phase=Phase.DESIGN, reservation_id="res-early", command_id="cmd-early"))
    fact(reserve(operator, phase=Phase.REQUIREMENTS, reservation_id="res-1", command_id="cmd-1"))
    fact(reserve(operator, phase=Phase.REQUIREMENTS, reservation_id="res-1b", command_id="cmd-1"))
    # Crew setup fails; the phase is retried only by a new explicit command.
    fact(started(operator, phase=Phase.REQUIREMENTS, reservation_id="res-wrong", session_slot=archivist.session_slot))
    fact(failed(operator, phase=Phase.REQUIREMENTS, reservation_id="res-1", code="crew_unavailable"))
    fact(reserve(operator, phase=Phase.REQUIREMENTS, reservation_id="res-2", command_id="cmd-2"))
    fact(started(operator, phase=Phase.REQUIREMENTS, reservation_id="res-2", session_slot=archivist.session_slot))
    # A record of another domain changes nothing and still advances the version.
    story.add(next(at), archivist, "domain_event_recorded",
              {"domain": "rooms", "kind": "task_claimed", "entity_id": "task-1", "data": {"phase": "requirements"}})
    story.add(next(at), archivist, "run_started", {"reason": "Writing requirements", "room": "study"})

    # Revision 1 is proposed, then the document changes: the proposal is superseded.
    first = spec_write(story, next(at), archivist, Phase.REQUIREMENTS, "write-1", size_bytes=100, spec="vector")
    next(at)
    fact(guardrails.phase_output_ready(archivist, phase=Phase.REQUIREMENTS, proposal_id="door-1", **first))
    second = spec_write(story, next(at), archivist, Phase.REQUIREMENTS, "write-2", size_bytes=140, spec="vector",
                        revision=2, base_sha256=str(first["sha256"]))
    next(at)
    # Deciding the old bytes is refused: the artifact changed.
    fact(guardrails.door_approved(operator, phase=Phase.REQUIREMENTS, proposal_id="door-1", actor="operator",
                                  command_id="cmd-3", **first))
    fact(guardrails.door_superseded(archivist, phase=Phase.REQUIREMENTS, proposal_id="door-1",
                                    revision=1, sha256=str(first["sha256"]), code="document_changed"))
    fact(guardrails.phase_output_ready(archivist, phase=Phase.REQUIREMENTS, proposal_id="door-2", **second))
    # Stale proposal id, stale digest, then the exact rejection.
    fact(guardrails.door_approved(operator, phase=Phase.REQUIREMENTS, proposal_id="door-1", actor="operator",
                                  command_id="cmd-4", **second))
    fact(guardrails.door_approved(operator, phase=Phase.REQUIREMENTS, proposal_id="door-2", actor="operator",
                                  command_id="cmd-5", **{**second, "sha256": digest_of("some other bytes")}))
    fact(guardrails.door_rejected(operator, phase=Phase.REQUIREMENTS, proposal_id="door-2", actor="operator",
                                  command_id="cmd-6", **second))
    # A second decision on the same proposal loses: the first one won.
    fact(guardrails.door_approved(operator, phase=Phase.REQUIREMENTS, proposal_id="door-2", actor="crew",
                                  command_id="cmd-7", **second))
    # The successor stays unstartable while the Door is rejected.
    fact(reserve(operator, phase=Phase.DESIGN, reservation_id="res-3", command_id="cmd-8"))

    # Revision: explicit start, a third revision, and an approval made in Crew.
    fact(guardrails.revision_started(operator, phase=Phase.REQUIREMENTS, command_id="cmd-9",
                                     session_slot=archivist.session_slot))
    third = spec_write(story, next(at), archivist, Phase.REQUIREMENTS, "write-3", size_bytes=180, spec="vector",
                       revision=3, base_sha256=str(second["sha256"]))
    next(at)
    fact(guardrails.phase_output_ready(archivist, phase=Phase.REQUIREMENTS, proposal_id="door-3", **third))
    fact(guardrails.door_approved(operator, phase=Phase.REQUIREMENTS, proposal_id="door-3", actor="crew",
                                  command_id="cmd-10", **third))

    # Design: ready, not working, until its own start. A write whose outcome is uncertain blocks its path.
    fact(guardrails.phase_output_ready(draughtsman, phase=Phase.DESIGN, proposal_id="door-early",
                                       **{**third, "document_path": ".kiro/specs/vector/design.md"}))
    fact(reserve(operator, phase=Phase.DESIGN, reservation_id="res-4", command_id="cmd-11"))
    fact(started(operator, phase=Phase.DESIGN, reservation_id="res-4", session_slot=draughtsman.session_slot))
    story.add(next(at), draughtsman, "run_started", {"reason": "Drawing the design", "room": "drafting-room"})
    design_artifact: dict[str, object] = {
        "document_path": ".kiro/specs/vector/design.md",
        "revision": 1,
        "sha256": digest_of("vector design.md revision 1"),
        "size_bytes": 300,
    }
    fact(guardrails.spec_write_prepared(draughtsman, write_id="write-4", phase=Phase.DESIGN, base_revision=0,
                                        base_sha256=None, **design_artifact))
    fact(guardrails.spec_write_uncertain(draughtsman, write_id="write-4", phase=Phase.DESIGN,
                                         document_path=".kiro/specs/vector/design.md", code="crash_during_replace"))
    fact(guardrails.phase_output_ready(draughtsman, phase=Phase.DESIGN, proposal_id="door-4", **design_artifact))
    fact(guardrails.spec_write_recovered(draughtsman, write_id="write-4", phase=Phase.DESIGN,
                                         document_path=".kiro/specs/vector/design.md", outcome="completed"))
    # A requirements document is not this phase's output.
    fact(guardrails.phase_output_ready(draughtsman, phase=Phase.DESIGN, proposal_id="door-5", **third))
    fact(guardrails.phase_output_ready(draughtsman, phase=Phase.DESIGN, proposal_id="door-4", **design_artifact))

    # Risky actions: one runs once and fails, one is rejected in Crew, one is superseded, one stays pending.
    def command(slot: str, argv: list[str]) -> ActionDescriptor:
        return descriptor({
            "schema_version": 1,
            "mansion_id": VECTOR_MANSION,
            "session_slot": slot,
            "room": "workshop",
            "kind": "run_command",
            "working_directory": "app",
            "arguments": {"argv": argv, "timeout_seconds": 60},
            "path_intents": [
                {"access": "command_write", "path": "app/build"},
                {"access": "command_read", "path": "app/src"},
            ],
        })

    build = command(tinker.session_slot, ["bun", "run", "build"])
    build_digest = action_digest(build)
    fact(guardrails.risky_action_proposed(tinker, proposal_id="act-1", descriptor=build))
    fact(guardrails.risky_action_proposed(tinker, proposal_id="act-1", descriptor=build))
    # Execution before approval, then an approval naming another digest: both refused.
    fact(guardrails.risky_action_consumed(tinker, proposal_id="act-1", action_digest=build_digest,
                                          claim_id="claim-0", session_slot=tinker.session_slot))
    fact(guardrails.risky_action_approved(operator, proposal_id="act-1", action_digest=digest_of("another action"),
                                          actor="operator", command_id="cmd-12"))
    fact(guardrails.risky_action_approved(operator, proposal_id="act-1", action_digest=build_digest,
                                          actor="operator", command_id="cmd-13"))
    fact(guardrails.risky_action_rejected(operator, proposal_id="act-1", action_digest=build_digest,
                                          actor="crew", command_id="cmd-14"))
    # Another session cannot claim it; the proposing session can, exactly once.
    fact(guardrails.risky_action_consumed(other_tinker, proposal_id="act-1", action_digest=build_digest,
                                          claim_id="claim-1", session_slot=tinker.session_slot))
    fact(guardrails.risky_action_denied(other_tinker, proposal_id="act-1", action_digest=build_digest,
                                        denial_id="denial-1", session_slot=other_tinker.session_slot,
                                        code="identity_mismatch"))
    fact(guardrails.risky_action_consumed(tinker, proposal_id="act-1", action_digest=build_digest,
                                          claim_id="claim-2", session_slot=tinker.session_slot))
    fact(guardrails.risky_action_consumed(tinker, proposal_id="act-1", action_digest=build_digest,
                                          claim_id="claim-3", session_slot=tinker.session_slot))
    fact(guardrails.risky_action_succeeded(tinker, proposal_id="act-1", action_digest=build_digest,
                                           claim_id="claim-3", code="ok", exit_code=0, output_bytes=10))
    fact(guardrails.risky_action_failed(tinker, proposal_id="act-1", action_digest=build_digest,
                                        claim_id="claim-2", code="exit_nonzero", exit_code=1, output_bytes=412))
    # A failed attempt stays consumed: it cannot be claimed again.
    fact(guardrails.risky_action_consumed(tinker, proposal_id="act-1", action_digest=build_digest,
                                          claim_id="claim-4", session_slot=tinker.session_slot))

    lint = command(other_tinker.session_slot, ["bun", "run", "lint"])
    fact(guardrails.risky_action_proposed(other_tinker, proposal_id="act-2", descriptor=lint))
    # Crew asks for the tool call; the prompt is keyed by (slot, mid).
    story.add(next(at), other_tinker, "approval_requested", {"mid": "mid-act-2"}, origin="crew",
              source_type="crew_approval", identity=("mid-act-2",), revision=1, timed=False)
    fact(guardrails.risky_action_rejected(other_tinker, proposal_id="act-2", action_digest=action_digest(lint),
                                          actor="crew", command_id="cmd-15", crew_slot=other_tinker.session_slot,
                                          crew_mid="mid-act-2"))
    story.add(next(at), other_tinker, "approval_decided", {"mid": "mid-act-2", "outcome": "rejected"}, origin="crew",
              source_type="crew_approval", identity=("mid-act-2",), revision=2, timed=False)
    fact(guardrails.approval_resolution_ignored(other_tinker, resolution_id="resolution-1",
                                                session_slot=other_tinker.session_slot, mid="mid-unknown",
                                                outcome="approved", code="approval_unmatched"))

    delete = descriptor({
        "schema_version": 1,
        "mansion_id": VECTOR_MANSION,
        "session_slot": tinker.session_slot,
        "room": "workshop",
        "kind": "delete_path",
        "working_directory": "",
        "arguments": {"path": "app/old.ts", "target": "file"},
        "path_intents": [{"access": "delete", "path": "app/old.ts"}],
    })
    fact(guardrails.risky_action_proposed(tinker, proposal_id="act-3", descriptor=delete))
    fact(guardrails.risky_action_approved(operator, proposal_id="act-3", action_digest=action_digest(delete),
                                          actor="operator", command_id="cmd-16"))
    fact(guardrails.risky_action_superseded(tinker, proposal_id="act-3", action_digest=action_digest(delete),
                                            code="session_ended"))
    fact(guardrails.path_denied(tinker, denial_id="denial-2", session_slot=tinker.session_slot, room="workshop",
                                access=Access.WRITE, code="protected_path", raw_path=".kiro/specs/vector/tasks.md"))
    # Decision 2026-11-16: the house approved a non-risky room-tool prompt itself.
    fact(guardrails.room_tool_answered(tinker, answer_id="house-answer-1", session_slot=tinker.session_slot,
                                       mid="mid-read-1", tool="read_room_file"))

    commit = descriptor({
        "schema_version": 1,
        "mansion_id": VECTOR_MANSION,
        "session_slot": tinker.session_slot,
        "room": "workshop",
        "kind": "git_write",
        "working_directory": "",
        "arguments": {"operation": "commit", "pathspecs": ["app/src"], "message": "Add the lantern"},
        "path_intents": [{"access": "git_write", "path": "app/src"}],
    })
    fact(guardrails.risky_action_proposed(tinker, proposal_id="act-4", descriptor=commit))
    story.add(next(at), tinker, "approval_requested", {"mid": "mid-act-4"}, origin="crew",
              source_type="crew_approval", identity=("mid-act-4",), revision=1, timed=False)
    return story


def render_vectors() -> bytes:
    events = persist(build_vector_story())
    records: list[JSONValue] = [json.loads(serialize_app_event(event)) for event in events]
    steps = workflow_steps(events, VECTOR_MANSION)
    head: dict[str, JSONValue] = {
        "mansion_id": VECTOR_MANSION,
        "description": "Canonical records and the backend workflow projection after each record that changed it.",
    }
    encode = lambda value: json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)  # noqa: E731
    opening = encode(head)[:-1]
    lines = lambda items: ",\n".join(encode(item) for item in items)  # noqa: E731
    return f'{opening},"events":[\n{lines(records)}\n],"steps":[\n{lines(steps)}\n]}}\n'.encode("utf-8")


def narrative(events: list[AppEvent]) -> dict[str, JSONValue]:
    """What the story shows a judge, counted from its records (Spec 7, Requirement 5.2)."""

    def count(event_type: str) -> int:
        return sum(1 for event in events if event.event_type == event_type)

    def facts(*kinds: str) -> int:
        return sum(
            1
            for event in events
            if event.event_type == "domain_event_recorded"
            and isinstance(event.payload, dict)
            and event.payload.get("domain") == guardrails.DOMAIN
            and event.payload.get("kind") in kinds
        )

    return {
        "ghost_ids": sorted({event.scope.ghost_id for event in events}),
        "tool_started": count("tool_started"),
        "tool_finished": count("tool_finished"),
        "approval_requested": count("approval_requested"),
        "approval_decided": count("approval_decided"),
        "door_decisions": facts("door_approved", "door_rejected"),
        "run_completed": count("run_completed"),
        "run_blocked": count("run_blocked"),
        "run_failed": count("run_failed"),
    }


def render_expected() -> bytes:
    """Test-only evidence: what the backend selects and projects from demo.jsonl."""

    events = persist(build_story())
    folded = fold_ghost_events(events)
    expected: dict[str, JSONValue] = {
        "source": "fixtures/replay/demo.jsonl",
        "mansion_id": MANSION,
        "record_count": len(events),
        "selected_record_ids": [event.record_id for event in folded.selection.events],
        "selection_diagnostics": len(folded.selection.diagnostics),
        "narrative": narrative(events),
        "projection": {
            "ghosts": [asdict(snapshot) for snapshot in folded.snapshots],
            "transitions": [asdict(transition) for transition in folded.transitions],
            "workflow": workflow_steps(events, MANSION)[-1]["workflow"],
        },
    }
    return (json.dumps(expected, sort_keys=True, indent=1, ensure_ascii=False) + "\n").encode("utf-8")


OUTPUTS = (
    (FIXTURE, render),
    (WORKFLOW_FIXTURE, render_workflow),
    (EXPECTED_FIXTURE, render_expected),
    (VECTORS_FIXTURE, render_vectors),
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail if the fixture differs from a fresh build")
    args = parser.parse_args()

    stale = 0
    for path, build in OUTPUTS:
        content = build()
        name = path.relative_to(REPO_ROOT).as_posix()
        if args.check:
            if not path.is_file() or path.read_bytes() != content:
                print(f"build_replay_fixture: {name} is stale; rebuild it.", file=sys.stderr)
                stale = 1
            continue
        path.write_bytes(content)
        print(f"build_replay_fixture: wrote {name} ({content.count(b'\n')} lines)")
    return stale


if __name__ == "__main__":
    raise SystemExit(main())
