"""Signed workflow and decision endpoints (Doors and Guardrails tasks 11.1,
11.3, 11.4).

The real application (`build_app` with its proxy-signature middleware) runs
on aiohttp's TestServer over the real WorkflowService, Spec 2 file writer,
and a fake Crew gateway.

Validates: Requirements 8.1–8.8, 10.8.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import pytest
from aiohttp.test_utils import TestClient, TestServer
from yarl import URL

from haunted_house.adapters.gateway_client import GatewayError
from haunted_house.adapters.settings import Settings
from haunted_house.core.guardrail_events import Phase
from haunted_house.core.proxy_signature import sign
from haunted_house.core.workflow_requests import (
    MAX_REQUEST_BYTES,
    RequestError,
    parse_door_decision,
    parse_risky_decision,
    parse_start,
)
from haunted_house.server import PROXY_HEADER, build_app
from haunted_house.workflow_routes import ERROR_MESSAGES, ERROR_STATUSES
from tests.workflow_support import APP, APP_KEY, MANSION, SPEC, house, tinker_delete

NOW = 1_731_400_000
BASE = f"/api/mansions/{MANSION}"
SHA = "a" * 64


class Api:
    def __init__(self, h, client: TestClient, provided: list[int]) -> None:
        self.h = h
        self.client = client
        self.provided = provided
        self._n = 0

    def command_id(self) -> str:
        self._n += 1
        return f"cmd-http-{self._n:04d}"

    async def send(
        self, method: str, target: str, body: Any = None, *,
        signed: bool = True, key: str = APP_KEY, ts: int = NOW,
        content_type: str | None = "application/json", raw: bytes | None = None,
    ) -> tuple[int, Any]:
        data = raw if raw is not None else (b"" if body is None else json.dumps(body).encode())
        headers: dict[str, str] = {}
        if signed:
            headers[PROXY_HEADER] = sign(key, ts, method, target, data)
        if content_type is not None and method != "GET":
            headers["Content-Type"] = content_type
        async with self.client.request(
            method, URL(target, encoded=True), headers=headers, data=data
        ) as response:
            text = await response.text()
            try:
                return response.status, json.loads(text) if text else None
            except ValueError:
                return response.status, text  # aiohttp's own plain 404 or 405

    async def workflow(self) -> dict:
        status, body = await self.send("GET", f"{BASE}/workflow")
        assert status == 200, body
        return body

    async def start(self, phase: str, **change) -> tuple[int, Any]:
        version = (await self.workflow())["version"]
        body = {"command_id": self.command_id(), "expected_version": version, **change}
        return await self.send("POST", f"{BASE}/phases/{phase}/start", body)

    def door_body(self, workflow: dict, phase: str = "requirements", **change) -> tuple[str, dict]:
        proposal = next(item for item in workflow["phases"] if item["phase"] == phase)["door"]["proposal"]
        body = {
            "command_id": self.command_id(),
            "expected_version": workflow["version"],
            "phase": proposal["phase"],
            "document_path": proposal["document_path"],
            "artifact_revision": dict(proposal["artifact_revision"]),
            **change,
        }
        return proposal["proposal_id"], body


def _serve(tmp_path, scenario, *, provider_none: bool = False):
    async def go():
        async with house(tmp_path) as h:
            provided: list[int] = []

            def provider():
                provided.append(1)
                return None if provider_none else h.service

            settings = Settings(port=1, secret=APP_KEY, gateway_origin=None, app_name=APP)
            app = build_app(settings, clock=lambda: NOW, workflow_service=provider, seance_service=h.seance)
            async with TestClient(TestServer(app)) as client:
                return await scenario(Api(h, client, provided))

    return asyncio.run(go())


async def _to_waiting(api: Api, phase: Phase = Phase.REQUIREMENTS) -> dict:
    status, body = await api.start(phase.value)
    assert status == 200, body
    slot = next(
        view.session_slot for view in (await api.h.view(reconcile=False)).read.projection.phases.values()
        if view.phase is phase
    )
    binding = api.h.binding(slot)
    assert (await api.h.write_spec(binding, f"# {phase.value}\n\nBody.\n")).status == "written"
    assert (await api.h.service.submit_phase_output(binding)).ok
    return await api.workflow()


# --- signatures ---------------------------------------------------------------------------


def test_every_workflow_route_requires_a_valid_proxy_signature(tmp_path):
    async def scenario(api: Api):
        body = {"command_id": "cmd-http-0001", "expected_version": 0}
        door = {**body, "phase": "requirements", "document_path": "a.md",
                "artifact_revision": {"revision": 1, "sha256": SHA, "size_bytes": 1}}
        requests = [
            ("GET", f"{BASE}/workflow", None),
            ("POST", f"{BASE}/phases/requirements/start", body),
            ("POST", f"{BASE}/doors/door-1/approve", door),
            ("POST", f"{BASE}/doors/door-1/reject", door),
            ("POST", f"{BASE}/approvals/act-1/approve", {**body, "action_digest": SHA}),
            ("POST", f"{BASE}/approvals/act-1/reject", {**body, "action_digest": SHA}),
        ]
        replies = []
        for method, target, payload in requests:
            for options in (dict(signed=False), dict(key="forged-key"), dict(ts=NOW - 3600)):
                replies.append(await api.send(method, target, payload, **options))
        tampered = await api.send(
            "POST", f"{BASE}/phases/requirements/start", None,
            raw=json.dumps({**body, "expected_version": 1}).encode(), signed=False,
        )
        return replies, tampered, list(api.provided), api.h.crew.calls, await api.h.events()

    replies, tampered, provided, crew_calls, events = _serve(tmp_path, scenario)
    assert len(replies) == 18
    assert all(reply == (401, {"error": "bad_proxy_signature"}) for reply in replies)
    assert tampered[0] == 401
    # No handler ran: the service was never even looked up.
    assert provided == [] and crew_calls == [] and events == ()


# --- reads --------------------------------------------------------------------------------


def test_the_workflow_read_returns_the_projection_folded_from_the_canonical_log(tmp_path):
    async def scenario(api: Api):
        empty = await api.workflow()
        waiting = await _to_waiting(api)
        missing = await api.send("GET", "/api/mansions/another-mansion/workflow")
        invalid = await api.send("GET", "/api/mansions/Not%20A%20Mansion/workflow")
        head = await api.send("HEAD", f"{BASE}/workflow")
        return empty, waiting, missing, invalid, head, (await api.h.view(reconcile=False)).to_json()

    empty, waiting, missing, invalid, head, direct = _serve(tmp_path, scenario)
    assert set(empty) == {
        "schema_version", "mansion_id", "version", "integrity", "waiting_count",
        "phases", "risky_proposals", "pending_permissions"}
    assert (empty["schema_version"], empty["mansion_id"], empty["version"], empty["integrity"]) == (
        1, MANSION, 0, "valid")
    assert [phase["status"] for phase in empty["phases"]] == ["ready", "not_started", "not_started", "not_started"]
    assert waiting == direct and waiting["waiting_count"] == 1
    door = waiting["phases"][0]["door"]
    assert (waiting["phases"][0]["status"], door["status"], door["proposal"]["status"]) == (
        "waiting", "waiting", "pending")
    assert door["proposal"]["document_path"] == f".kiro/specs/{SPEC}/requirements.md"
    assert waiting["phases"][0]["ghost_ids"] == ["archivist"]
    assert missing == (404, {"error": {"code": "mansion_not_found", "message": ERROR_MESSAGES["mansion_not_found"]}})
    assert invalid[0] == 400 and invalid[1]["error"]["code"] == "invalid_mansion_id"
    assert head[0] == 405


# --- phase start --------------------------------------------------------------------------


def test_phase_start_success_idempotence_and_refusals(tmp_path):
    async def scenario(api: Api):
        sealed = await api.start("design")
        body = {"command_id": "cmd-http-start", "expected_version": 0}
        target = f"{BASE}/phases/requirements/start"
        started = await api.send("POST", target, body)
        calls = len(api.h.crew.calls)
        retried = await api.send("POST", target, body)
        other_phase = await api.send("POST", f"{BASE}/phases/design/start", {**body, "expected_version": 3})
        stale = await api.send("POST", target, {"command_id": "cmd-http-stale", "expected_version": 0})
        unknown = await api.send(
            "POST", "/api/mansions/another-mansion/phases/requirements/start", body)
        return sealed, started, retried, other_phase, stale, unknown, calls, api.h.crew, await api.h.kinds()

    sealed, started, retried, other_phase, stale, unknown, calls, crew, kinds = _serve(tmp_path, scenario)
    assert sealed[0] == 409 and sealed[1]["error"]["code"] == "predecessor_door_sealed"
    assert sealed[1]["workflow"]["version"] == 0

    status, body = started
    assert status == 200 and set(body) == {"event_id", "sequence", "version", "workflow"}
    assert body["event_id"].startswith("e1:") and body["sequence"] == 1
    assert body["version"] == body["workflow"]["version"] == 3
    assert body["workflow"]["phases"][0]["status"] == "working"
    assert crew.steps() == ["create_slot", "set_project", "set_mode", "send_turn"]

    # The same command again: the same record, the current projection, no new session.
    assert retried == started and len(crew.calls) == calls
    assert other_phase[0] == 409 and other_phase[1]["error"]["code"] == "command_conflict"
    assert stale[0] == 409 and stale[1]["error"]["code"] == "stale_version"
    assert stale[1]["workflow"]["version"] == 3
    assert unknown[0] == 404 and "workflow" not in unknown[1]
    assert kinds == ["phase_start_reserved", "phase_started"]


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"command_id": "cmd-http-0001"},
        {"expected_version": 0},
        {"command_id": "cmd-http-0001", "expected_version": 0, "force": True},
        {"command_id": "cmd-http-0001", "expected_version": 0, "actor": "operator"},
        {"command_id": "cmd-http-0001", "expected_version": "0"},
        {"command_id": "cmd-http-0001", "expected_version": True},
        {"command_id": "cmd-http-0001", "expected_version": -1},
        {"command_id": "cmd-http-0001", "expected_version": 2**60},
        {"command_id": "short", "expected_version": 0},
        {"command_id": "cmd http 0001", "expected_version": 0},
        {"command_id": "c" * 65, "expected_version": 0},
        {"command_id": 12345678, "expected_version": 0},
        {"command_id": "cmd-http-0001", "expected_version": 0, "assignments": []},
        {"command_id": "cmd-http-0001", "expected_version": 0, "assignments": ["a", "a"]},
        {"command_id": "cmd-http-0001", "expected_version": 0, "assignments": ["../x"]},
        {"command_id": "cmd-http-0001", "expected_version": 0, "assignments": [f"t{n}" for n in range(17)]},
        [],
        "start",
        None,
    ],
)
def test_invalid_start_bodies_are_400_before_anything_happens(tmp_path, body):
    async def scenario(api: Api):
        reply = await api.send("POST", f"{BASE}/phases/requirements/start", body)
        return reply, api.h.crew.calls, await api.h.events()

    (status, reply), crew_calls, events = _serve(tmp_path, scenario)
    assert status == 400 and reply == {
        "error": {"code": "invalid_request", "message": ERROR_MESSAGES["invalid_request"]}}
    assert crew_calls == [] and events == ()


def test_malformed_requests_are_refused_without_echoing_them(tmp_path):
    async def scenario(api: Api):
        target = f"{BASE}/phases/requirements/start"
        good = json.dumps({"command_id": "cmd-http-0001", "expected_version": 0}).encode()
        secretive = b'{"command_id": "cmd-http-0001", "expected_version": 0, "token": "tok-SECRET-123"}'
        replies = {
            "not_json": await api.send("POST", target, raw=b"{not json"),
            "duplicate_key": await api.send(
                "POST", target, raw=b'{"command_id": "cmd-http-0001", "command_id": "cmd-http-0002", "expected_version": 0}'),
            "float": await api.send("POST", target, raw=b'{"command_id": "cmd-http-0001", "expected_version": 0.0}'),
            "nan": await api.send("POST", target, raw=b'{"command_id": "cmd-http-0001", "expected_version": NaN}'),
            "bad_utf8": await api.send("POST", target, raw=b'{"command_id": "\xff"}'),
            "form": await api.send("POST", target, raw=good, content_type="text/plain"),
            "no_type": await api.send("POST", target, raw=good, content_type=None),
            "unknown_field": await api.send("POST", target, raw=secretive),
            "too_large": await api.send("POST", target, raw=b'{"x": "' + b"a" * MAX_REQUEST_BYTES + b'"}'),
            "bad_phase": await api.send("POST", f"{BASE}/phases/review/start", raw=good),
            "bad_decision": await api.send("POST", f"{BASE}/doors/door-1/bless", raw=good),
            "bad_proposal": await api.send("POST", f"{BASE}/approvals/bad%20id/approve", raw=good),
            "bad_mansion": await api.send("POST", "/api/mansions/UPPER/phases/requirements/start", raw=good),
        }
        return replies, api.h.crew.calls, await api.h.events()

    replies, crew_calls, events = _serve(tmp_path, scenario)
    statuses = {name: status for name, (status, _body) in replies.items()}
    assert statuses.pop("too_large") == 413
    assert set(statuses.values()) == {400}
    assert replies["bad_mansion"][1]["error"]["code"] == "invalid_mansion_id"
    text = json.dumps([body for _status, body in replies.values()])
    assert "SECRET" not in text and "tok-" not in text and "cmd-http" not in text
    assert crew_calls == [] and events == ()


# --- Door decisions ------------------------------------------------------------------------


def test_door_decisions_over_http(tmp_path):
    async def scenario(api: Api):
        waiting = await _to_waiting(api)
        proposal_id, body = api.door_body(waiting)
        target = f"{BASE}/doors/{proposal_id}/approve"
        refused = {
            "stale_version": await api.send("POST", target, {**body, "expected_version": body["expected_version"] - 1}),
            "stale_revision": await api.send(
                "POST", target, {**body, "artifact_revision": {**body["artifact_revision"], "sha256": "f" * 64}}),
            "proposal_not_found": await api.send("POST", f"{BASE}/doors/door-unknown/approve", body),
            "invalid_request": await api.send(
                "POST", target, {**body, "artifact_revision": {"revision": 1, "sha256": "nope", "size_bytes": 1}}),
            "invalid_request ": await api.send("POST", target, {**body, "document_path": "../requirements.md"}),
            "invalid_request  ": await api.send("POST", target, {key: body[key] for key in body if key != "phase"}),
        }
        before = await api.h.kinds()
        approved = await api.send("POST", target, body)
        retried = await api.send("POST", target, body)
        rejected_late = await api.send(
            "POST", f"{BASE}/doors/{proposal_id}/reject",
            {**body, "command_id": api.command_id(), "expected_version": approved[1]["version"]})

        design = await _to_waiting(api, Phase.DESIGN)
        design_id, design_body = api.door_body(design, "design")
        rejected = await api.send("POST", f"{BASE}/doors/{design_id}/reject", design_body)
        return refused, before, approved, retried, rejected_late, rejected, await api.h.kinds()

    refused, before, approved, retried, rejected_late, rejected, kinds = _serve(tmp_path, scenario)
    for code, (status, body) in refused.items():
        code = code.strip()
        assert status == ERROR_STATUSES[code] and body["error"]["code"] == code
        # A refusal judged against the log carries the current projection.
        assert ("workflow" in body) == (status in (404, 409))
        if status == 409:
            assert body["workflow"]["phases"][0]["door"]["proposal"]["status"] == "pending"
    assert before.count("door_approved") == 0

    status, body = approved
    assert status == 200 and body["sequence"] == body["version"]
    opened = body["workflow"]["phases"][0]["door"]
    assert opened["status"] == "open" and opened["proposal"]["decision"] == {
        "outcome": "approved", "actor": "operator", "event_id": body["event_id"], "sequence": body["sequence"]}
    assert body["workflow"]["phases"][1]["status"] == "ready"
    assert retried == approved
    assert rejected_late[0] == 409 and rejected_late[1]["error"]["code"] == "no_pending_proposal"

    assert rejected[0] == 200
    design = rejected[1]["workflow"]["phases"][1]
    assert (design["status"], design["door"]["status"]) == ("revision_required", "rejected")
    assert rejected[1]["workflow"]["phases"][2]["status"] == "not_started"
    assert (kinds.count("door_approved"), kinds.count("door_rejected")) == (1, 1)


# --- risky decisions -------------------------------------------------------------------------


def test_risky_decisions_over_http(tmp_path):
    async def scenario(api: Api):
        (api.h.mansion / "src").mkdir()
        for name in ("old.py", "keep.py"):
            (api.h.mansion / "src" / name).write_text("x\n", encoding="utf-8")
        binding = await api.h.reach_workshop()
        first, first_digest, first_descriptor = await api.h.propose(binding, tinker_delete("src/old.py"))
        second, second_digest, _ = await api.h.propose(binding, tinker_delete("src/keep.py"))
        workflow = await api.workflow()
        body = {"command_id": api.command_id(), "expected_version": workflow["version"], "action_digest": first_digest}
        target = f"{BASE}/approvals/{first}/approve"
        refused = {
            "stale_digest": await api.send("POST", target, {**body, "action_digest": second_digest}),
            "stale_version": await api.send("POST", target, {**body, "expected_version": 0}),
            "proposal_not_found": await api.send("POST", f"{BASE}/approvals/act-unknown/approve", body),
            "invalid_request": await api.send("POST", target, {**body, "action_digest": "F" * 64}),
            "invalid_request ": await api.send("POST", target, {**body, "descriptor": first_descriptor}),
        }
        approved = await api.send("POST", target, body)
        retried = await api.send("POST", target, body)
        again = await api.send(
            "POST", f"{BASE}/approvals/{first}/reject",
            {**body, "command_id": api.command_id(), "expected_version": approved[1]["version"]})
        rejected = await api.send(
            "POST", f"{BASE}/approvals/{second}/reject",
            {"command_id": api.command_id(), "expected_version": approved[1]["version"],
             "action_digest": second_digest})
        return workflow, refused, approved, retried, again, rejected, first, second

    workflow, refused, approved, retried, again, rejected, first, second = _serve(tmp_path, scenario)
    shown = {item["proposal_id"]: item for item in workflow["risky_proposals"]}
    assert shown[first]["status"] == "pending" and shown[first]["ghost_id"] == "tinker-1"
    assert shown[first]["descriptor"]["arguments"] == {"path": "src/old.py", "target": "file"}
    assert shown[first]["room"] == "workshop" and workflow["waiting_count"] == 2
    for code, (status, body) in refused.items():
        code = code.strip()
        assert status == ERROR_STATUSES[code] and body["error"]["code"] == code
    status, body = approved
    assert status == 200 and retried == approved
    decided = {item["proposal_id"]: item for item in body["workflow"]["risky_proposals"]}
    assert decided[first]["status"] == "approved"
    assert decided[first]["decision"] == {
        "outcome": "approved", "actor": "operator", "event_id": body["event_id"], "sequence": body["sequence"]}
    assert again[0] == 409 and again[1]["error"]["code"] == "already_decided"
    final = {item["proposal_id"]: item["status"] for item in rejected[1]["workflow"]["risky_proposals"]}
    assert rejected[0] == 200 and final == {first: "approved", second: "rejected"}
    assert rejected[1]["workflow"]["waiting_count"] == 0


# --- integrity, Crew, availability ---------------------------------------------------------------


def test_unavailable_integrity_is_423_and_the_projection_says_so(tmp_path):
    async def scenario(api: Api):
        waiting = await _to_waiting(api)
        log = next(api.h.mansion.rglob("events.v1.*"))
        with log.open("ab") as handle:
            handle.write(b"{not a canonical record}\n")
        proposal_id, body = api.door_body(waiting)
        decide = await api.send("POST", f"{BASE}/doors/{proposal_id}/approve", body)
        start = await api.send(
            "POST", f"{BASE}/phases/design/start", {"command_id": "cmd-http-9001", "expected_version": 5})
        read = await api.send("GET", f"{BASE}/workflow")
        seance = await api.send("GET", f"{BASE}/seance/events")
        return decide, start, read, seance

    decide, start, read, seance = _serve(tmp_path, scenario)
    for status, body in (decide, start):
        assert status == 423 and body["error"]["code"] == "integrity_unavailable"
        assert body["workflow"]["integrity"] == "corrupt"
    assert read[0] == 200 and read[1]["integrity"] == "corrupt"
    assert read[1]["phases"][0]["door"]["proposal"]["status"] == "pending"
    # Integrity diagnostics stay on the Spec 2 route; Spec 4 adds no audit route.
    assert seance[0] == 200 and seance[1]["integrity"] == "failed" and seance[1]["diagnostics"]


def test_crew_failures_are_safe_502_and_504_and_leave_a_retryable_phase(tmp_path):
    async def scenario(api: Api):
        api.h.crew.fail["create_slot"] = (500, {"error": f"exploded {APP_KEY} at /Users/someone/crew"})
        failed = await api.start("requirements")
        api.h.crew.fail = {}

        async def timeout(*_args, **_kwargs):
            raise GatewayError("timeout", "POST /api/chat/slots got no answer within 30 s")

        original = api.h.client.create_chat_slot
        api.h.client.create_chat_slot = timeout
        timed_out = await api.start("requirements")
        api.h.client.create_chat_slot = original
        retried = await api.start("requirements")
        return failed, timed_out, retried

    failed, timed_out, retried = _serve(tmp_path, scenario)
    assert failed[0] == 502 and failed[1]["error"] == {
        "code": "crew_failed", "message": ERROR_MESSAGES["crew_failed"]}
    assert timed_out[0] == 504 and timed_out[1]["error"]["code"] == "crew_timeout"
    for _status, body in (failed, timed_out):
        assert body["workflow"]["phases"][0]["status"] == "failed"
        text = json.dumps(body)
        assert APP_KEY not in text and "someone" not in text and "exploded" not in text
    assert retried[0] == 200 and retried[1]["workflow"]["phases"][0]["status"] == "working"


def test_an_unbuilt_service_is_503(tmp_path):
    async def scenario(api: Api):
        return (
            await api.send("GET", f"{BASE}/workflow"),
            await api.send("POST", f"{BASE}/phases/requirements/start",
                           {"command_id": "cmd-http-0001", "expected_version": 0}),
        )

    read, start = _serve(tmp_path, scenario, provider_none=True)
    expected = {"error": {"code": "workflow_unavailable", "message": ERROR_MESSAGES["workflow_unavailable"]}}
    assert read == (503, expected) and start == (503, expected)


# --- the route table and the parsers ----------------------------------------------------------------


def test_spec_4_adds_exactly_its_six_routes_and_no_audit_or_append_route(tmp_path):
    async def scenario(api: Api):
        routes = sorted(
            (route.method, route.resource.canonical)
            for route in api.client.app.router.routes()
            if "/workflow" in route.resource.canonical
            or "/phases/" in route.resource.canonical
            or "/doors/" in route.resource.canonical
            or "/approvals/" in route.resource.canonical
        )
        every = [route.resource.canonical for route in api.client.app.router.routes()]
        missing = [
            await api.send("POST", f"{BASE}/workflow", {}),
            await api.send("GET", f"{BASE}/audit/verify"),
            await api.send("POST", f"{BASE}/events", {}),
            await api.send("DELETE", f"{BASE}/doors/door-1/approve"),
        ]
        return routes, every, missing

    routes, every, missing = _serve(tmp_path, scenario)
    assert routes == [
        ("GET", "/api/mansions/{mansion_id}/workflow"),
        ("POST", "/api/mansions/{mansion_id}/approvals/{proposal_id}/{decision}"),
        ("POST", "/api/mansions/{mansion_id}/doors/{proposal_id}/{decision}"),
        ("POST", "/api/mansions/{mansion_id}/phases/{phase}/start"),
    ]
    assert not any("audit" in path or "verify" in path or "candidate" in path for path in every)
    assert all(path.startswith("/api/") or path == "/health" for path in every)
    assert [status for status, _body in missing] == [405, 404, 404, 405]


def test_the_parsers_return_typed_values_and_name_only_schema_fields():
    start = parse_start({"command_id": "cmd-00000001", "expected_version": 4, "assignments": ["task-1", "task-2"]})
    assert (start.command_id, start.expected_version, start.assignments) == ("cmd-00000001", 4, ("task-1", "task-2"))
    door = parse_door_decision({
        "command_id": "8f14e45f-ceea-467f-a9f1-6a5d2f0f1c11", "expected_version": 9, "phase": "design",
        "document_path": ".kiro/specs/demo/design.md",
        "artifact_revision": {"revision": 2, "sha256": SHA, "size_bytes": 10},
    })
    assert door.phase is Phase.DESIGN and door.artifact_revision.revision == 2
    risky = parse_risky_decision({"command_id": "cmd-00000001", "expected_version": 0, "action_digest": SHA})
    assert risky.action_digest == SHA

    secret = "private" + "-value-0123456789"  # a marker, not a credential
    for parser, body in (
        (parse_start, {"command_id": secret + " !", "expected_version": 0}),
        (parse_start, {"command_id": "cmd-00000001", "expected_version": 0, secret: 1}),
        (parse_risky_decision, {"command_id": "cmd-00000001", "expected_version": 0, "action_digest": secret}),
        (parse_door_decision, {"command_id": "cmd-00000001", "expected_version": 0, "phase": secret,
                               "document_path": "a.md", "artifact_revision": {}}),
    ):
        with pytest.raises(RequestError) as error:
            parser(body)
        assert secret not in str(error.value) and secret not in error.value.field
        assert error.value.code == "invalid_request"
