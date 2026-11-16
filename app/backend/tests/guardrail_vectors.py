"""Deterministic cross-language vectors for the Doors-and-Guardrails folds.

``build_vectors()`` produces the content of
``fixtures/guardrails/domain-vectors.json``: canonical Spec 2 records (built
by the real preparation path) and the projection the Python fold derives at
each checkpoint, plus Action_Descriptor canonical text and digests.  The
TypeScript projection parser and replay adapter read the same file.
"""

from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path

from haunted_house.core import guardrail_events as ge
from haunted_house.core.action_descriptor import action_digest, canonical_action
from haunted_house.core.guardrail_events import Phase
from haunted_house.core.seance_event import app_event_to_dict
from haunted_house.core.workflow import fold_workflow, projection_to_json
from tests.guardrail_support import (
    MANSION,
    OPERATOR,
    SESSION_SCOPE,
    SHA_A,
    SHA_B,
    acknowledge,
    command_descriptor,
    delete_descriptor,
    git_descriptor,
    other_event,
    parsed,
    spec_path,
)

FIXTURE = Path(__file__).resolve().parents[3] / "fixtures" / "guardrails" / "domain-vectors.json"


def _candidates() -> list[tuple[str, object]]:
    """(checkpoint label or "", candidate) in canonical order."""

    requirements = spec_path("requirements")
    delete = parsed(delete_descriptor())
    proposed = ge.risky_action_proposed(SESSION_SCOPE, proposal_id="act-delete", descriptor=delete)
    digest = proposed.payload["data"]["action_digest"]
    command = ge.risky_action_proposed(
        SESSION_SCOPE, proposal_id="act-command", descriptor=parsed(command_descriptor()))
    blocked = ge.risky_action_proposed(
        SESSION_SCOPE, proposal_id="act-blocked", descriptor=parsed(command_descriptor(("echo", "value"))))
    blocked_payload = json.loads(json.dumps(blocked.payload))
    blocked_payload["data"]["descriptor"]["arguments"]["argv"][1] = "[redacted]"
    permission = replace(
        other_event("permission-1"),
        event_type="approval_requested",
        payload={"mid": "m-1"},
    )
    permission = replace(permission, source=replace(permission.source, source_type="crew_approval"))

    return [
        ("", ge.phase_start_reserved(OPERATOR, phase=Phase.REQUIREMENTS, reservation_id="res-1", command_id="cmd-start-1")),
        ("requirements_starting", other_event("chat-1")),
        ("", ge.phase_started(OPERATOR, phase=Phase.REQUIREMENTS, reservation_id="res-1", session_slot="study-slot")),
        ("", ge.spec_write_prepared(
            SESSION_SCOPE, write_id="write-1", phase=Phase.REQUIREMENTS, document_path=requirements,
            base_revision=0, base_sha256=None, revision=1, sha256=SHA_A, size_bytes=512)),
        ("requirements_write_pending", ge.phase_start_reserved(
            OPERATOR, phase=Phase.DESIGN, reservation_id="res-skip", command_id="cmd-skip")),
        ("", ge.spec_document_written(
            SESSION_SCOPE, write_id="write-1", phase=Phase.REQUIREMENTS, document_path=requirements,
            revision=1, sha256=SHA_A, size_bytes=512)),
        ("requirements_waiting", ge.phase_output_ready(
            SESSION_SCOPE, phase=Phase.REQUIREMENTS, proposal_id="door-1", document_path=requirements,
            revision=1, sha256=SHA_A, size_bytes=512)),
        ("", ge.door_approved(
            OPERATOR, phase=Phase.REQUIREMENTS, proposal_id="door-1", document_path=requirements,
            revision=2, sha256=SHA_B, size_bytes=512, actor="operator", command_id="cmd-stale")),
        ("requirements_approved", ge.door_approved(
            OPERATOR, phase=Phase.REQUIREMENTS, proposal_id="door-1", document_path=requirements,
            revision=1, sha256=SHA_A, size_bytes=512, actor="operator", command_id="cmd-door-1")),
        ("", ge.phase_start_reserved(OPERATOR, phase=Phase.DESIGN, reservation_id="res-2", command_id="cmd-start-2")),
        ("", ge.phase_start_failed(OPERATOR, phase=Phase.DESIGN, reservation_id="res-2", code="crew_unavailable")),
        ("design_failed", proposed),
        ("", command),
        ("", replace(blocked, payload=blocked_payload)),
        ("risky_pending", permission),
        ("", ge.risky_action_approved(
            OPERATOR, proposal_id="act-delete", action_digest=digest, actor="operator", command_id="cmd-risky-1")),
        ("", ge.risky_action_rejected(
            OPERATOR, proposal_id="act-command", action_digest=command.payload["data"]["action_digest"],
            actor="crew", command_id="ext-1", crew_slot=SESSION_SCOPE.session_slot, crew_mid="m-1")),
        ("", ge.risky_action_consumed(
            SESSION_SCOPE, proposal_id="act-delete", action_digest=digest, claim_id="claim-1",
            session_slot=SESSION_SCOPE.session_slot)),
        ("", ge.risky_action_consumed(
            SESSION_SCOPE, proposal_id="act-delete", action_digest=digest, claim_id="claim-2",
            session_slot=SESSION_SCOPE.session_slot)),
        ("", ge.path_denied(
            SESSION_SCOPE, denial_id="deny-1", session_slot=SESSION_SCOPE.session_slot, room="workshop",
            access=ge.Access.WRITE, code="protected_path", raw_path=".env")),
        # Decision 2026-11-16: the house approved a non-risky room-tool prompt.
        ("", ge.room_tool_answered(
            SESSION_SCOPE, answer_id="house-1", session_slot=SESSION_SCOPE.session_slot,
            mid="m-read-1", tool="read_room_file")),
        ("risky_consumed", ge.risky_action_failed(
            SESSION_SCOPE, proposal_id="act-delete", action_digest=digest, claim_id="claim-1",
            code="not_found", exit_code=None, output_bytes=0)),
    ]


def build_vectors() -> dict:
    pairs = _candidates()
    events = acknowledge([candidate for _label, candidate in pairs])
    checkpoints = [
        {
            "label": label,
            "through_sequence": index + 1,
            "projection": projection_to_json(fold_workflow(events[: index + 1])),
        }
        for index, (label, _candidate) in enumerate(pairs)
        if label
    ]
    actions = []
    for raw in (
        delete_descriptor(),
        command_descriptor(),
        command_descriptor(("python", "-m", "pytest", "tests/café"), working_directory="src"),
        git_descriptor("add", ("src/b.py", "src/a.py")),
        git_descriptor("commit", ()),
    ):
        descriptor = parsed(raw)
        actions.append(
            {
                "descriptor": raw,
                "canonical": canonical_action(descriptor).decode("utf-8"),
                "action_digest": action_digest(descriptor),
            }
        )
    return {
        "description": (
            "Doors-and-guardrails vectors: Spec 2 canonical records, the Spec 4 "
            "workflow projection after each checkpoint, and Action_Descriptor digests."
        ),
        "mansion_id": MANSION,
        "domain": ge.DOMAIN,
        "kinds": [kind.value for kind in ge.GuardrailEventKind],
        "events": [app_event_to_dict(event) for event in events],
        "checkpoints": checkpoints,
        "actions": actions,
    }


def render() -> str:
    return json.dumps(build_vectors(), indent=2, ensure_ascii=False, sort_keys=True) + "\n"


if __name__ == "__main__":
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(render(), encoding="utf-8")
