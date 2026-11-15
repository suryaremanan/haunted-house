"""Property 16 at the MCP_Gate boundary: tool responses and error values.

Feature: doors-and-guardrails, Property 16: Domain payload builders exclude sensitive or content-bearing fields

The primary Property 16 test covers the payload builders.  This one covers
the room tools built on them: for any generated document body, credential-
shaped value, and Session_Capability, no mutation-tool response, refusal, or
canonical record produced by a room tool call contains the body, the
credential, the capability, or a host path.

Credential-shaped values are assembled at runtime so no such literal is
committed.

Validates: Requirements 10.3, 10.7, 11.8.
"""

from __future__ import annotations

import asyncio
import json
import tempfile
from pathlib import Path

from hypothesis import given, settings
from hypothesis import strategies as st

from haunted_house.adapters.guardrail_port import GuardrailPort
from haunted_house.core import guardrail_events as ge
from haunted_house.core.guardrail_events import Phase
from tests.guardrail_support import MANSION, OPERATOR, SPEC, MemoryWriter
from tests.room_mcp_support import RecordingRunner, build_service, room_binding

_ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
_BODIES = st.lists(
    st.text(alphabet="abcdefghij klmnopqrstuvwxyz", min_size=12, max_size=40), min_size=2, max_size=5
).map(lambda lines: "# Requirements\n" + "\n".join(lines))
_CREDENTIALS = st.one_of(
    st.text(alphabet=_ALNUM, min_size=36, max_size=40).map(lambda tail: "gh" + "p_" + tail),
    st.text(alphabet="ABCDEFGHIJKLMNOP234567", min_size=16, max_size=16).map(
        lambda tail: "AK" + "IA" + tail
    ),
    st.text(alphabet=_ALNUM, min_size=24, max_size=40).map(lambda body: "xox" + "b-" + body),
)
_CALLS = st.sampled_from(
    ["write", "write_stale", "write_outside", "write_protected", "bad_arguments",
     "propose_bad", "propose_outside", "execute_unknown", "wrong_room", "submit"]
)  # fmt: skip


def _phase_started(phase: Phase):
    return [
        ge.phase_start_reserved(OPERATOR, phase=phase, reservation_id="res-1", command_id="cmd-1"),
        ge.phase_started(OPERATOR, phase=phase, reservation_id="res-1", session_slot="slot-x"),
    ]


@settings(max_examples=100, deadline=None)
@given(body=_BODIES, credential=_CREDENTIALS, call=_CALLS)
def test_room_tool_responses_and_evidence_carry_no_body_secret_or_capability(body, credential, call):
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory).resolve() / "mansions"
        (root / MANSION / ".kiro" / "specs" / SPEC).mkdir(parents=True)
        writer = MemoryWriter()
        port = GuardrailPort(writer)
        service = build_service(writer, root, runner=RecordingRunner())
        archivist = room_binding("archivist", root)
        tinker = room_binding("tinker", root)
        content = body + "\n" + credential + "\n"

        async def run():
            assert (await port.append(MANSION, _phase_started(Phase.REQUIREMENTS))).ok
            spec = {"content": content, "expected_revision": 0}
            action = {
                "kind": "delete_path",
                "working_directory": "",
                "arguments": {"path": "src/" + credential, "target": "file"},
                "path_intents": [{"access": "delete", "path": "src/" + credential}],
            }
            if call == "write":
                return await service.call(archivist, "write_spec_document", spec)
            if call == "write_stale":
                return await service.call(archivist, "write_spec_document", {**spec, "expected_revision": 7})
            if call == "write_outside":
                return await service.call(
                    tinker, "write_room_file", {"path": "../" + credential, "content": content}
                )
            if call == "write_protected":
                return await service.call(
                    tinker, "write_room_file", {"path": ".env." + credential, "content": content}
                )
            if call == "bad_arguments":
                return await service.call(archivist, "write_spec_document", {"content": content, credential: body})
            if call == "propose_bad":
                broken = {**action, "arguments": {"path": credential, "secret": content}}
                return await service.call(tinker, "propose_risky_action", {"action": broken})
            if call == "propose_outside":
                outside = {**action, "arguments": {"path": "../" + credential, "target": "file"}}
                return await service.call(tinker, "propose_risky_action", {"action": outside})
            if call == "execute_unknown":
                return await service.call(
                    tinker, "execute_approved_action", {"proposal_id": "p-1", "action": action}
                )
            if call == "wrong_room":
                return await service.call(archivist, "write_room_file", {"path": credential, "content": content})
            return await service.call(archivist, "submit_phase_output", {})

        result = asyncio.run(run())
        emitted = json.dumps(result, ensure_ascii=False) + json.dumps(
            [event.payload for event in writer.events], ensure_ascii=False
        )
        for forbidden in (body, credential, archivist.capability, tinker.capability, str(root)):
            assert forbidden not in emitted
        # Only small typed fields come back from a mutation tool.
        assert set(result) <= {
            "ok", "code", "reason", "ghost_state", "status", "revision", "sha256", "size_bytes",
            "current_revision", "field", "proposal_id", "action_digest", "document_path",
            "artifact_revision",
        }  # fmt: skip
