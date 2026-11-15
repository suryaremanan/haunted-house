"""App-owned Crew sessions and canonical approval reconciliation
(Doors and Guardrails tasks 8.1, 8.2, 8.5).

A fake Crew gateway records every REST call.  Raw S6-shaped frames enter
through the one Spec 2 ingest path; the Session_Reconciler sees only the
acknowledged canonical records and typed session snapshots.

Validates: Requirements 4.1–4.8, 7.1–7.10, 11.4, 11.8.
"""

from __future__ import annotations

import ast
import asyncio
import inspect
from pathlib import Path

import pytest

from haunted_house.adapters import crew_chat, gateway_client, session_reconciler, workflow_service
from haunted_house.adapters.crew_chat import CrewChat, CrewChatError, SessionRequest
from haunted_house.adapters.gateway_client import GatewayError
from haunted_house.adapters.workflow_service import WorkflowError
from haunted_house.core.approvals import PendingPermission, ProposalStatus
from tests.workflow_support import (
    APP_KEY,
    MANSION,
    SERVER,
    TOOL,
    execution_input,
    house,
    pending_decision_frame,
    resolved_frame,
    tinker_delete,
)


def _run(scenario, tmp_path, **options):
    async def go():
        async with house(tmp_path, **options) as built:
            return await scenario(built)

    return asyncio.run(go())


# --- REST order, bodies, and refusals -----------------------------------------------------


def test_a_session_is_created_bound_kept_interactive_then_sent_its_turn(tmp_path):
    async def scenario(h):
        h.crew.refuse_tokens = 1  # the first call is refused once: one refresh, one retry
        chat = CrewChat(h.client)
        binding = await chat.create_bound_session(
            SessionRequest("demo-mansion-archivist", "hh-archivist", str(h.mansion))
        )
        turn = await chat.send_turn(binding, "Write the requirements.")
        return binding, turn, h.crew

    binding, turn, crew = _run(scenario, tmp_path)
    assert (binding.slot, binding.session_label, turn.queued) == ("slot-1", "dashboard:slot-1", False)
    assert crew.calls == [
        ("create_slot", "/api/chat/slots",
         {"name": "demo-mansion-archivist", "agent": "hh-archivist", "memory_mode": "temporary"}),
        ("set_project", "/api/chat/slots/slot-1/project", {"project": crew.slots["slot-1"]["project"]}),
        ("set_mode", "/api/chat/mode", {"mode": "normal", "slot": "slot-1"}),
        ("send_turn", "/api/chat", {"slot": "slot-1", "message": "Write the requirements."}),
    ]
    assert crew.slots["slot-1"]["project"].endswith("/mansions/demo-mansion")
    assert len(crew.issued) == 2  # one token, refreshed once after the refusal
    assert crew.unknown == [] and crew.websocket_attempts == 0


def test_an_exact_permission_answer_names_the_approval_and_its_message(tmp_path):
    async def scenario(h):
        chat = CrewChat(h.client)
        binding = await chat.create_bound_session(SessionRequest("s", "hh-tinker", str(h.mansion)))
        h.crew.prompt(binding.slot, "m-1", {"proposal_id": "p"}, approval_id="2")
        h.crew.prompt(binding.slot, "m-2", {"proposal_id": "q"}, approval_id="2")  # the id repeats
        snapshot = await chat.get_session(binding.slot)
        second = snapshot.permission("m-2").message
        first = await chat.resolve_permission(second, "approved")
        again = await chat.resolve_permission(second, "rejected")
        after = await chat.get_session(binding.slot)
        return snapshot, first, again, after, h.crew

    snapshot, first, again, after, crew = _run(scenario, tmp_path)
    assert [(item.message.mid, item.message.approval_id, item.message.tool_name, item.resolved)
            for item in snapshot.permissions] == [("m-1", "2", TOOL, None), ("m-2", "2", TOOL, None)]
    assert snapshot.permission("m-2").message.tool_input == {"proposal_id": "q"}
    approve_calls = [call for call in crew.calls if call[0] == "approve"]
    assert approve_calls[0] == (
        "approve", "/api/chat/slots/slot-1/approve",
        {"action": "approved", "request_id": "2", "request_mid": "m-2", "origin": "native"},
    )
    # The first answer won; the second finds nothing pending and changes nothing.
    assert (first.status, again.status) == ("resolved", "not_pending")
    assert [item.resolved for item in after.permissions] == [None, "approved"]


def test_dynamic_values_are_validated_and_errors_are_bounded(tmp_path):
    async def scenario(h):
        client = h.client
        refused = []
        for call in (
            lambda: client.create_chat_slot("bad name", "hh-archivist"),
            lambda: client.create_chat_slot("ok", "../agent"),
            lambda: client.set_chat_slot_project("slot/../x", "/tmp/a"),
            lambda: client.set_chat_slot_project("slot-1", "relative/path"),
            lambda: client.set_chat_slot_project("slot-1", "/a/../b"),
            lambda: client.set_chat_slot_interactive("slot 1"),
            lambda: client.send_chat_turn("slot-1", ""),
            lambda: client.send_chat_turn("slot-1", "x" * 20000),
            lambda: client.send_chat_turn("..", "hello"),
            lambda: client.resolve_chat_approval("slot-1", "2", "m-1", "trust"),
            lambda: client.resolve_chat_approval("slot-1", "2", "m-1", "yolo"),
            lambda: client.resolve_chat_approval("slot-1", "", "m-1", "approved"),
            lambda: client.resolve_chat_approval("slot-1", "2", "bad mid", "approved"),
        ):
            with pytest.raises(GatewayError) as error:
                await call()
            refused.append(error.value.kind)
        sent_nothing = list(h.crew.calls)

        chat = CrewChat(h.client)
        h.crew.fail["create_slot"] = (500, {"error": f"boom {APP_KEY} /Users/someone/secret"})
        with pytest.raises(CrewChatError) as failed:
            await chat.create_bound_session(SessionRequest("s", "hh-tinker", str(h.mansion)))
        h.crew.fail = {"set_mode": (403, {"error": "mode_not_allowed"})}
        with pytest.raises(CrewChatError) as denied:
            await chat.create_bound_session(SessionRequest("s", "hh-tinker", str(h.mansion)))
        return refused, sent_nothing, failed.value, denied.value, h.crew

    refused, sent_nothing, failed, denied, crew = _run(scenario, tmp_path)
    assert set(refused) == {"config"} and sent_nothing == []
    assert (failed.code, failed.step) == ("crew_failed", "create_slot")
    assert APP_KEY not in str(failed) and "someone" not in str(failed)
    assert failed.__cause__ is None and failed.__context__ is None
    assert (denied.code, denied.step) == ("crew_failed", "set_mode")
    # A refused mode stops the setup: no turn was sent to a non-interactive slot.
    assert "send_turn" not in crew.steps()


def test_a_gateway_timeout_is_reported_as_a_timeout(tmp_path):
    class Slow:
        async def create_chat_slot(self, name, agent):
            raise GatewayError("timeout", "POST /api/chat/slots got no answer within 30 s")

    async def scenario(_h):
        with pytest.raises(CrewChatError) as error:
            await CrewChat(Slow()).create_bound_session(SessionRequest("s", "hh-tinker", "/tmp/x"))
        with pytest.raises(CrewChatError) as absent:
            await CrewChat(lambda: None).get_session("slot-1")
        return error.value.code, absent.value.code

    assert _run(scenario, tmp_path) == ("crew_timeout", "crew_failed")


def test_only_chat_routes_exist_and_no_websocket_or_spawn_is_reachable():
    client_methods = {
        name for name, member in inspect.getmembers(gateway_client.GatewayClient, inspect.isfunction)
        if not name.startswith("_")
    }
    assert client_methods == {
        "call", "session_history", "create_chat_slot", "set_chat_slot_project",
        "set_chat_slot_interactive", "send_chat_turn", "resolve_chat_approval",
    }
    assert gateway_client.ROUTES == {"version": ("GET", "/api/version")}
    forbidden_text = ("/api/spawn", "/api/approvals", "/api/ws", "ws_connect", "autoApprove", "yolo")
    forbidden_names = {"ws_connect", "ClientWebSocketResponse", "WebSocketResponse", "WSMsgType"}
    for module in (gateway_client, crew_chat, session_reconciler, workflow_service):
        source = Path(inspect.getsourcefile(module)).read_text(encoding="utf-8")
        tree = ast.parse(source)
        strings = {
            node.value for node in ast.walk(tree)
            if isinstance(node, ast.Constant) and isinstance(node.value, str) and "\n" not in node.value
        }
        names = {node.attr for node in ast.walk(tree) if isinstance(node, ast.Attribute)} | {
            node.id for node in ast.walk(tree) if isinstance(node, ast.Name)
        }
        assert not any(text in value for value in strings for text in forbidden_text), module.__name__
        assert not names & forbidden_names, module.__name__
    # The reconciler reads canonical records and typed snapshots, never a raw frame.
    reconciler_names = {
        node.attr if isinstance(node, ast.Attribute) else getattr(node, "id", "")
        for node in ast.walk(ast.parse(inspect.getsource(session_reconciler)))
    }
    assert not reconciler_names & {"normalize_crew_envelope", "CrewEnvelope", "build_app_event", "AppEventCandidate"}


# --- canonical reconciliation --------------------------------------------------------------


async def _workshop_with_proposal(h, path="src/old.py"):
    (h.mansion / "src").mkdir(exist_ok=True)
    (h.mansion / path).write_text("old\n", encoding="utf-8")
    binding = await h.reach_workshop()
    proposal_id, digest, descriptor = await h.propose(binding, tinker_delete(path))
    return binding, proposal_id, digest, descriptor


def test_an_app_decision_is_acknowledged_before_crew_is_answered_exactly(tmp_path):
    async def scenario(h):
        binding, proposal_id, digest, descriptor = await _workshop_with_proposal(h)
        slot = binding.slot
        tool_input = execution_input(proposal_id, tinker_delete())
        # Crew asks; the raw frame is persisted once by Spec 2 and cannot be
        # matched to a message yet.
        live = await h.ingest([pending_decision_frame(slot)])
        h.crew.prompt(slot, "m-ask-1", tool_input, approval_id="2")
        waiting = await h.view()
        body = waiting.to_json()

        order = []

        async def spy():
            order.append(("crew_answered", await h.kinds()))

        h.crew.hooks["approve"] = spy
        decided = await h.decide_risky(proposal_id, digest, True)
        # Crew reports the resolution; Spec 2 persists it; nothing else is recorded.
        await h.ingest([resolved_frame(slot, "m-ask-1", True)])
        settled = await h.view()
        executed = await h.service.consume_and_execute(binding, proposal_id, descriptor)
        return live, body, decided, order, settled, executed, await h.kinds(), h

    live, body, decided, order, settled, executed, kinds, h = _run(scenario, tmp_path)
    assert live.reconcile_slots == ("slot-4",)
    assert body["pending_permissions"] == [{
        "slot": "slot-4", "mid": "m-ask-1", "requested_sequence": body["pending_permissions"][0]["requested_sequence"],
        "tool_name": TOOL,
        "action_digest": decided.event.payload["data"]["action_digest"],
        "proposal_id": decided.event.payload["data"]["proposal_id"],
    }]
    assert body["waiting_count"] == 2  # the proposal and the Crew prompt
    record = decided.event.payload
    assert record["kind"] == "risky_action_approved"
    assert (record["data"]["actor"], record["data"]["crew_slot"], record["data"]["crew_mid"]) == (
        "operator", "slot-4", "m-ask-1")
    # The approval record was already acknowledged when Crew was answered.
    assert order and order[0][1][-1] == "risky_action_approved"
    assert [call for call in h.crew.calls if call[0] == "approve"] == [(
        "approve", "/api/chat/slots/slot-4/approve",
        {"action": "approved", "request_id": "2", "request_mid": "m-ask-1", "origin": "native"},
    )]
    assert settled.to_json()["pending_permissions"] == []
    assert "approval_resolution_ignored" not in kinds
    assert kinds.count("risky_action_approved") == 1
    assert executed.status == "succeeded" and not (h.mansion / "src" / "old.py").exists()


def test_an_external_crew_resolution_becomes_the_one_authoritative_decision(tmp_path):
    async def scenario(h):
        binding, proposal_id, digest, descriptor = await _workshop_with_proposal(h)
        slot = binding.slot
        h.crew.prompt(slot, "m-ask-1", execution_input(proposal_id, tinker_delete()))
        await h.ingest([pending_decision_frame(slot)])
        await h.view()
        # The owner answers in Crew's own dashboard.
        h.crew.resolve_externally(slot, "m-ask-1", "approved")
        await h.ingest([resolved_frame(slot, "m-ask-1", True)])
        first = await h.view()
        second = await h.view()  # a later pass records nothing more
        with pytest.raises(WorkflowError) as late:
            await h.decide_risky(proposal_id, digest, False)
        executed = await h.service.consume_and_execute(binding, proposal_id, descriptor)
        return first, second, late.value, executed, await h.kinds(), h.crew

    first, second, late, executed, kinds, crew = _run(scenario, tmp_path)
    proposal = first.read.projection.risky_proposals
    (only,) = proposal.values()
    assert only.decision.actor == "crew" and only.decision.outcome == "approved"
    assert (only.decision.crew_slot, only.decision.crew_mid) == ("slot-4", "m-ask-1")
    assert first.version == second.version
    assert kinds.count("risky_action_approved") == 1 and "approval_resolution_ignored" not in kinds
    # The remaining app control is refused: the first acknowledged decision stands.
    assert late.code == "already_decided"
    assert [call for call in crew.calls if call[0] == "approve"] == []
    assert executed.status == "succeeded"


def test_unmatched_resolutions_grant_nothing_and_repeated_approval_ids_do_not_cross(tmp_path):
    async def scenario(h):
        binding, proposal_id, digest, descriptor = await _workshop_with_proposal(h)
        slot = binding.slot
        exact = execution_input(proposal_id, tinker_delete())
        cases = {
            # Same approval_id everywhere: it is never what identifies a prompt.
            "m-other-tool": dict(tool_input=exact, tool_name="fs_write", server=None),
            "m-other-server": dict(tool_input=exact, server="someone-elses-server"),
            "m-other-action": dict(tool_input=execution_input(proposal_id, tinker_delete("src/other.py"))),
            "m-no-proposal": dict(tool_input={"action": tinker_delete()}),
            "m-unknown-proposal": dict(tool_input=execution_input("id-9999", tinker_delete())),
            # A model-supplied full descriptor is not how identity is established.
            "m-own-identity": dict(tool_input={"proposal_id": proposal_id, "descriptor": descriptor}),
            "m-extra-field": dict(tool_input={**execution_input(proposal_id, tinker_delete()), "room": "study"}),
            "m-not-json": dict(tool_input="rm -rf .", as_text=False),
        }
        for mid, options in cases.items():
            h.crew.prompt(slot, mid, approval_id="2", **options)
            h.crew.resolve_externally(slot, mid, "approved")
        await h.ingest([resolved_frame(slot, mid, True) for mid in cases])
        await h.ingest([resolved_frame(slot, "m-never-seen", True)])
        view = await h.view()
        again = await h.view()
        ignored = [
            (record.data["mid"], record.data["outcome"], record.data["code"])
            for record in view.read.domain.records
            if record.kind.value == "approval_resolution_ignored"
        ]
        refused = await h.service.consume_and_execute(binding, proposal_id, descriptor)
        return view, again, ignored, refused, h

    view, again, ignored, refused, h = _run(scenario, tmp_path)
    assert sorted(ignored) == sorted([
        ("m-other-tool", "approved", "tool_mismatch"),
        ("m-other-server", "approved", "tool_mismatch"),
        ("m-other-action", "approved", "digest_mismatch"),
        ("m-no-proposal", "approved", "proposal_missing"),
        ("m-unknown-proposal", "approved", "proposal_missing"),
        ("m-not-json", "approved", "proposal_missing"),
        ("m-own-identity", "approved", "digest_mismatch"),
        ("m-extra-field", "approved", "digest_mismatch"),
        ("m-never-seen", "approved", "tool_mismatch"),
    ])
    assert again.version == view.version  # each is recorded exactly once
    (proposal,) = view.read.projection.risky_proposals.values()
    assert proposal.status is ProposalStatus.PENDING and proposal.decision is None
    assert (refused.status, refused.code) == ("waiting", "proposal_pending")
    assert (h.mansion / "src" / "old.py").exists()
    # No tool input, path, or approval id reached a canonical record.
    for event in view.read.events:
        text = repr(event.payload)
        assert "rm -rf" not in text and "other.py" not in text


def test_the_first_acknowledged_decision_wins_over_a_later_crew_answer(tmp_path):
    async def scenario(h):
        binding, proposal_id, digest, descriptor = await _workshop_with_proposal(h)
        slot = binding.slot
        # The Operator rejects in the house before Crew ever asked.
        decided = await h.decide_risky(proposal_id, digest, False)
        h.crew.prompt(slot, "m-ask-1", execution_input(proposal_id, tinker_delete()))
        await h.ingest([pending_decision_frame(slot)])
        answered = await h.view()
        approve_calls = [call[2] for call in h.crew.calls if call[0] == "approve"]
        # Crew echoes the rejection the house sent: nothing more to record.
        await h.ingest([resolved_frame(slot, "m-ask-1", False)])
        echoed = await h.view()

        # A second prompt for the same action is approved in Crew's dashboard:
        # the canonical rejection still stands.
        h.crew.prompt(slot, "m-ask-2", execution_input(proposal_id, tinker_delete()), approval_id="3")
        h.crew.resolve_externally(slot, "m-ask-2", "approved")
        await h.ingest([resolved_frame(slot, "m-ask-2", True, approval_id="3")])
        late = await h.view()
        executed = await h.service.consume_and_execute(binding, proposal_id, descriptor)
        return decided, answered, approve_calls, echoed, late, executed, await h.kinds(), h

    decided, answered, approve_calls, echoed, late, executed, kinds, h = _run(scenario, tmp_path)
    assert decided.event.payload["data"]["crew_mid"] is None
    assert approve_calls == [
        {"action": "rejected", "request_id": "2", "request_mid": "m-ask-1", "origin": "native"}
    ]
    assert kinds.count("risky_action_rejected") == 1 and "risky_action_approved" not in kinds
    assert echoed.read.domain.records[-1].kind.value != "approval_resolution_ignored"
    ignored = [r.data for r in late.read.domain.records if r.kind.value == "approval_resolution_ignored"]
    assert [(item["mid"], item["outcome"], item["code"]) for item in ignored] == [
        ("m-ask-2", "approved", "not_pending")]
    (proposal,) = late.read.projection.risky_proposals.values()
    assert proposal.status is ProposalStatus.REJECTED and proposal.decision.actor == "operator"
    assert (executed.status, executed.code) == ("denied", "proposal_rejected")
    assert (h.mansion / "src" / "old.py").exists()


def test_history_catch_up_runs_through_spec_2_and_uncertainty_is_shown(tmp_path):
    async def scenario(h):
        binding, proposal_id, digest, descriptor = await _workshop_with_proposal(h)
        slot = binding.slot
        h.crew.prompt(slot, "m-ask-1", execution_input(proposal_id, tinker_delete()))
        await h.ingest([pending_decision_frame(slot)])
        before = [event.event_type for event in await h.events()]
        h.crew.fail["get_session"] = (503, {"error": "restarting"})
        unreachable = await h.view()
        h.crew.fail = {}
        caught_up = await h.view()
        after = [event.event_type for event in await h.events()]
        raw_records = [event for event in await h.events() if event.source.origin == "crew"]
        return before, unreachable.to_json(), caught_up.to_json(), after, raw_records, proposal_id

    before, unreachable, caught_up, after, raw_records, proposal_id = _run(scenario, tmp_path)
    assert "approval_requested" not in before
    # Crew could not be read: the house does not claim its waiting state is current.
    assert unreachable["integrity"] == "uncertain" and unreachable["pending_permissions"] == []
    assert caught_up["integrity"] == "valid"
    assert [item["proposal_id"] for item in caught_up["pending_permissions"]] == [proposal_id]
    assert after.count("approval_requested") == 1 and after.count("decision_recorded") == 1
    # Recovered facts were normalized and written by Spec 2, never by Spec 4.
    assert {event.source.source_type for event in raw_records} >= {"crew_approval"}


def test_a_crew_failure_after_the_decision_keeps_the_decision_and_is_retried(tmp_path):
    async def scenario(h):
        binding, proposal_id, digest, descriptor = await _workshop_with_proposal(h)
        slot = binding.slot
        h.crew.prompt(slot, "m-ask-1", execution_input(proposal_id, tinker_delete()))
        await h.ingest([pending_decision_frame(slot)])
        await h.view()
        h.crew.fail["approve"] = (502, {"error": "bad gateway"})
        with pytest.raises(WorkflowError) as error:
            await h.decide_risky(proposal_id, digest, True)
        h.crew.fail = {}
        retried = await h.view()
        return error.value, retried, h.crew, await h.kinds()

    error, retried, crew, kinds = _run(scenario, tmp_path)
    assert error.code == "crew_failed"
    (proposal,) = error.view.read.projection.risky_proposals.values()
    assert proposal.status is ProposalStatus.APPROVED
    assert kinds.count("risky_action_approved") == 1
    # The next pass answers the same prompt with the acknowledged decision.
    answers = [call[2] for call in crew.calls if call[0] == "approve"]
    assert answers[-1] == {
        "action": "approved", "request_id": "2", "request_mid": "m-ask-1", "origin": "native"}
    assert len(answers) == 2


def test_correlation_never_uses_approval_id_alone(tmp_path):
    async def scenario(h):
        binding, proposal_id, digest, descriptor = await _workshop_with_proposal(h)
        ledger = (await h.port.read(MANSION)).projection.ledger
        no_mid = PendingPermission(binding.slot, "", "2", TOOL, execution_input(proposal_id, tinker_delete()))
        found = await h.reconciler.permission_for(ledger, proposal_id)
        h.crew.prompt(binding.slot, "m-1", execution_input(proposal_id, tinker_delete()))
        h.crew.prompt(binding.slot, "m-2", execution_input(proposal_id, tinker_delete()))
        ambiguous = await h.reconciler.permission_for(ledger, proposal_id)
        return no_mid, found, ambiguous, ledger

    from haunted_house.core.approvals import correlate_permission

    no_mid, found, ambiguous, ledger = _run(scenario, tmp_path)
    assert correlate_permission(no_mid, ledger, tool_names=frozenset({TOOL})).code == "ambiguous"
    assert found is None
    # Two open prompts for one action: neither is named in the decision record.
    assert ambiguous is None
    assert SERVER in TOOL
