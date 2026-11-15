"""The committed cross-language vectors match the Python folds (task 2.4).

Validates: Requirements 10.2, 10.4, 10.7.
"""

from __future__ import annotations

import json

import pytest

from haunted_house.core.action_descriptor import action_digest, canonical_action, parse_action_descriptor
from haunted_house.core.deep_redact import deep_redact
from haunted_house.core.seance_event import validate_event
from haunted_house.core.workflow import fold_workflow, projection_to_json
from tests.guardrail_vectors import FIXTURE, render

pytestmark = pytest.mark.core


def test_the_committed_fixture_is_current():
    assert FIXTURE.read_text(encoding="utf-8") == render()


def test_fixture_records_are_canonical_and_fold_to_each_checkpoint():
    vectors = json.loads(FIXTURE.read_text(encoding="utf-8"))
    events = []
    for raw in vectors["events"]:
        result = validate_event(raw)
        assert result.ok, result.error
        events.append(result.value)
    assert [event.sequence for event in events] == list(range(1, len(events) + 1))
    assert len(vectors["checkpoints"]) >= 6
    for checkpoint in vectors["checkpoints"]:
        prefix = events[: checkpoint["through_sequence"]]
        assert projection_to_json(fold_workflow(prefix)) == checkpoint["projection"], checkpoint["label"]
    final = vectors["checkpoints"][-1]["projection"]
    assert final["version"] == len(events)
    assert {item["status"] for item in final["risky_proposals"]} == {"failed", "rejected", "pending"}
    assert [item["displayable"] for item in final["risky_proposals"]] == [False, True, True]
    assert [item["code"] for item in final["diagnostics"]] == [
        "predecessor_door_sealed", "stale_revision", "not_approved"]


def test_fixture_actions_and_content_are_safe():
    vectors = json.loads(FIXTURE.read_text(encoding="utf-8"))
    for action in vectors["actions"]:
        descriptor = parse_action_descriptor(action["descriptor"])
        assert canonical_action(descriptor).decode("utf-8") == action["canonical"]
        assert action_digest(descriptor) == action["action_digest"]
    # Nothing in the fixture is credential or home-path shaped.
    assert deep_redact(vectors) == vectors
