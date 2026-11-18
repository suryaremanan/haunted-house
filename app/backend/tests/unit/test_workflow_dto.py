"""The WorkflowProjection wire form and its replay fixtures (tasks 13.1, 15.2).

The dashboard parses this JSON strictly and the TypeScript replay fold must
reproduce it, so its shape is pinned here and the committed fixtures are
checked against a fresh backend fold.

Validates: Requirements 8.1, 10.4, 10.5, 10.6, 10.7.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

from haunted_house.core.guardrail_events import DOMAIN, PHASES
from haunted_house.core.workflow import fold_workflow, initial_workflow
from haunted_house.core.workflow_dto import (
    WORKFLOW_SCHEMA_VERSION,
    workflow_projection_to_json,
)

pytestmark = pytest.mark.core

_REPO = Path(__file__).resolve().parents[4]
_TOP_LEVEL = {
    "schema_version",
    "mansion_id",
    "version",
    "integrity",
    "waiting_count",
    "phases",
    "risky_proposals",
    "pending_permissions",
}


def _builder():
    """Load scripts/build_replay_fixture.py as a module without running it."""

    path = _REPO / "scripts" / "build_replay_fixture.py"
    spec = importlib.util.spec_from_file_location("build_replay_fixture", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def builder():
    return _builder()


def test_the_initial_projection_has_requirements_ready_and_every_door_sealed():
    shown = workflow_projection_to_json(initial_workflow(), mansion_id="demo-mansion", events=[])
    assert set(shown) == _TOP_LEVEL
    assert shown["schema_version"] == WORKFLOW_SCHEMA_VERSION == 1
    assert (shown["mansion_id"], shown["version"], shown["integrity"]) == ("demo-mansion", 0, "valid")
    assert shown["phases"] == [
        {
            "phase": phase.value,
            "status": "ready" if index == 0 else "not_started",
            "ghost_ids": [],
            "door": {"status": "sealed", "proposal": None},
        }
        for index, phase in enumerate(PHASES)
    ]
    assert shown["risky_proposals"] == [] and shown["pending_permissions"] == []
    assert shown["waiting_count"] == 0


def test_the_demo_story_serializes_doors_proposals_and_permissions_exactly(builder):
    # The held moment: two Doors open, the tasks phase working, one proposal waiting.
    events = builder.persist(builder.build_story())[: builder.HELD_MOMENT_RECORDS]
    projection = fold_workflow(events)
    assert projection.diagnostics == () and projection.ledger.diagnostics == ()
    shown = workflow_projection_to_json(projection, mansion_id=builder.MANSION, events=events)

    requirements, design, tasks, implementation = shown["phases"]
    assert (requirements["status"], requirements["door"]["status"]) == ("approved", "open")
    assert requirements["ghost_ids"] == ["archivist"]
    proposal = requirements["door"]["proposal"]
    assert set(proposal) == {
        "proposal_id",
        "phase",
        "document_path",
        "artifact_revision",
        "status",
        "created_sequence",
        "decision",
    }
    assert set(proposal["artifact_revision"]) == {"revision", "sha256", "size_bytes"}
    decided = next(event for event in events if event.event_id == proposal["decision"]["event_id"])
    assert proposal["decision"] == {
        "outcome": "approved",
        "actor": "operator",
        "event_id": decided.event_id,
        "sequence": decided.sequence,
    }
    assert decided.payload["kind"] == "door_approved" and decided.payload["domain"] == DOMAIN
    assert (design["status"], design["door"]["status"]) == ("approved", "open")
    # An open Door made tasks ready; only its own start record made it work.
    assert (tasks["status"], tasks["door"]) == ("working", {"status": "sealed", "proposal": None})
    assert tasks["ghost_ids"] == ["foreman"]
    assert (implementation["status"], implementation["ghost_ids"]) == ("not_started", [])

    (risky,) = shown["risky_proposals"]
    assert set(risky) == {
        "proposal_id",
        "ghost_id",
        "session_slot",
        "room",
        "status",
        "action_digest",
        "descriptor",
        "created_sequence",
        "decision",
    }
    assert (risky["ghost_id"], risky["room"], risky["status"], risky["decision"]) == (
        "tinker-2",
        "workshop",
        "pending",
        None,
    )
    assert risky["descriptor"]["arguments"] == {"argv": ["bun", "test"], "timeout_seconds": 120}
    assert shown["pending_permissions"] == [
        {
            "slot": risky["session_slot"],
            "mid": "mid-tinker-2",
            "requested_sequence": risky["created_sequence"] + 1,
            "tool_name": None,
            "action_digest": None,
            "proposal_id": None,
        }
    ]
    assert shown["version"] == events[-1].sequence


def test_a_projection_cannot_be_serialized_without_the_records_it_refers_to(builder):
    events = builder.persist(builder.build_story())
    projection = fold_workflow(events)
    with pytest.raises(ValueError):
        workflow_projection_to_json(projection, mansion_id=builder.MANSION, events=events[:10])


def test_the_committed_replay_and_vector_fixtures_match_a_fresh_backend_fold(builder):
    for path, build in builder.OUTPUTS:
        assert path.read_bytes() == build(), f"{path.name} is stale: run scripts/build_replay_fixture.py"


def test_the_vectors_walk_invalid_transitions_and_every_step_is_json_safe(builder):
    events = builder.persist(builder.build_vector_story())
    projection = fold_workflow(events)
    refused = {(item.kind, item.code) for item in projection.diagnostics}
    assert ("phase_start_reserved", "predecessor_door_sealed") in refused
    assert ("door_approved", "artifact_changed") in refused
    assert ("door_approved", "stale_revision") in refused
    assert {(item.kind, item.code) for item in projection.ledger.diagnostics} >= {
        ("risky_action_consumed", "not_approved"),
        ("risky_action_approved", "digest_mismatch"),
        ("risky_action_rejected", "already_decided"),
    }
    document = json.loads((_REPO / "fixtures" / "seance" / "workflow-vectors.json").read_text("utf-8"))
    assert len(document["events"]) == len(events)
    assert [step["sequence"] for step in document["steps"]][0] == 0
    text = json.dumps(document)
    # Synthetic, content-free, and free of host details.
    for needle in ("/Users/", "/home/", "[redacted]", "Bearer ", "BEGIN "):
        assert needle not in text
