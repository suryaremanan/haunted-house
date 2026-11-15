"""RG-S3 worker: Crew's real chat-stop route, guards and stop card in an isolated home.

Runs under Crew's own Python with ``HOME`` pointed at an ephemeral directory.
It builds Crew's packaged chat route table, resolves requests through the real
router, and calls the real slot-ownership checkpoint and the real stop handler
on real chat-slot objects.  Two things are doubles and are named as such in the
report: the session manager (so no agent process, kiro-cli or provider is ever
started) and the ``app`` claim the token middleware would publish.

No socket is opened, no gateway is started, nothing outside the ephemeral home
is read or written.  Stdout is one scrubbed JSON object of booleans and fixed
names; failures collapse to stable codes.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any

APP = "hh-rg-s3-probe"
OTHER_APP = "hh-rg-s3-other"
BARE_APP = "hh-rg-s3-bare"
STOP_TEMPLATE = "/api/chat/slots/{slot}/stop"
INTERRUPT_TEMPLATE = "/api/chat/slots/{slot}/interrupt"
GRANTS = ["/api/chat", "/api/chat/*"]
NOT_FOUND = {"error": "not found", "code": "slot_not_found"}
SIDE_STOP_TEMPLATE = "/api/chat/slots/{slot}/side/stop"


class ProbeFailure(RuntimeError):
    """A stable, path-free probe failure."""


def _require(condition: bool, code: str) -> None:
    if not condition:
        raise ProbeFailure(code)


class FakeSessions:
    """Stand-in for Crew's session manager: records the cancel, starts nothing.

    ``script`` is what the provider would answer a cooperative cancel with:
    ``acked`` (the agent confirmed), ``no_turn`` (nothing was running) or
    ``unacked`` (no confirmation inside the budget, so Crew resets the session).
    The branch order mirrors ``SessionLifecycleService.stop_turn``.
    """

    def __init__(self, script: str = "acked") -> None:
        self.script = script
        self.calls: list[dict[str, Any]] = []
        self.gate: asyncio.Event | None = None

    async def stop_turn(
        self,
        key: str,
        *,
        force: bool = False,
        preserve_queue: bool = False,
        owned_by: Any = None,
        on_soft: Any = None,
        on_hard: Any = None,
    ) -> str:
        self.calls.append({"key": key, "force": force, "preserve_queue": preserve_queue})
        if not force:
            if self.gate is not None:
                await self.gate.wait()
            if self.script == "acked":
                if on_soft:
                    await on_soft()
                return "soft"
            if self.script == "no_turn":
                return "idle"
        if on_hard:
            await on_hard()
        return "hard"


class Bench:
    """One route table, one fake dashboard state, real slots."""

    def __init__(self) -> None:
        from aiohttp import web
        from kiro_crew.dashboard.routes import chat as chat_routes

        self.frames: list[dict[str, Any]] = []
        self.pushes = 0
        self.sessions = FakeSessions()
        self.state = SimpleNamespace(
            _slots={},
            sessions=self.sessions,
            subagents=None,
            crons=None,
            _background_tasks=set(),
            push_slots_update=self._push,
            cancel_questions_for_slot=lambda _key: 0,
        )
        self.app = web.Application()
        self.app["state"] = self.state
        chat_routes.register(self.app)
        self._keepalive: list[asyncio.Future[Any]] = []

    def _push(self, *_args: Any, **_kwargs: Any) -> None:
        self.pushes += 1

    def _on_message(self, slot_key: str, msg: dict[str, Any]) -> None:
        from kiro_crew.dashboard.state_parts.transcript_rows import (
            chat_message_frame,
            chat_message_note,
        )

        note = chat_message_note(slot_key, msg, workspace=None)
        self.frames.append(chat_message_frame(note, include_metadata=True))

    def slot(self, key: str, *, app: str = APP, running: bool = True, linked: str = "") -> Any:
        from kiro_crew.dashboard.chat_handlers import _ChatSlot

        slot = _ChatSlot(key, agent="hh-rg-s3-ghost")
        slot._app = app
        if linked:
            slot.linked_session_key = linked
        # Completed work of the turn about to be stopped.
        slot.append("user", "wait for the signal", broadcast=False)
        slot.append("tool_call", "list_room_files", json.dumps({"kind": "tool_call", "id": "t1"}), broadcast=False)
        slot.append("tool_result", "ok", json.dumps({"kind": "tool_result", "id": "t1"}), broadcast=False)
        slot._on_message = self._on_message
        if running:
            future: asyncio.Future[Any] = asyncio.get_running_loop().create_future()
            self._keepalive.append(future)
            slot.task = future
        self.state._slots[key] = slot
        return slot

    async def post(self, path: str, *, app: str, query: str = "") -> tuple[int, Any]:
        """Resolve through the real router, then checkpoint, then handler."""
        from aiohttp.test_utils import make_mocked_request
        from kiro_crew.dashboard.slot_ownership import slot_ownership_middleware

        request = make_mocked_request("POST", path + query, app=self.app)
        match = await self.app.router.resolve(request)
        match.add_app(self.app)
        match.freeze()
        request._match_info = match
        # Stand-in for token_auth_middleware, which publishes the verified app claim.
        request["app"] = app
        response = await slot_ownership_middleware(request, match.handler)
        return response.status, json.loads(response.body.decode("utf-8"))

    def close(self) -> None:
        for future in self._keepalive:
            if not future.done():
                future.cancel()


def _stop_cards(frames: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [f["meta"] for f in frames if isinstance(f.get("meta"), dict) and f["meta"].get("kind") == "stop_event"]


def _roles(slot: Any) -> list[str]:
    return [m.get("role", "") for m in slot.messages]


def _route_checks() -> dict[str, bool]:
    from aiohttp import web
    from kiro_crew.dashboard.chat_api import turn_stop
    from kiro_crew.dashboard.routes import chat as chat_routes
    from kiro_crew.dashboard.slot_ownership import SLOT_ROUTE_POLICIES, SlotRoutePolicy, slot_route_policy

    app = web.Application()
    chat_routes.register(app)
    table: dict[tuple[str, str], Any] = {}
    for route in app.router.routes():
        resource = route.resource
        if resource is not None:
            table[(route.method, resource.canonical)] = route.handler
    stop_like = sorted(
        template
        for (method, template) in table
        if method == "POST" and template.rsplit("/", 1)[-1] in {"stop", "cancel", "interrupt", "abort"}
    )
    return {
        "stopRouteRegisteredAsPost": table.get(("POST", STOP_TEMPLATE)) is turn_stop.api_chat_slot_stop,
        "stopRouteHasNoOtherMethod": [m for (m, t) in table if t == STOP_TEMPLATE and m != "HEAD"] == ["POST"],
        "interruptRouteIsSeparate": table.get(("POST", INTERRUPT_TEMPLATE)) is turn_stop.api_chat_slot_interrupt,
        # The side-chat stop addresses a side conversation, not the slot's turn.
        "noOtherTurnCancelRoute": stop_like == [INTERRUPT_TEMPLATE, SIDE_STOP_TEMPLATE, STOP_TEMPLATE],
        "stopRoutePolicyIsOwnerApp": slot_route_policy("POST", STOP_TEMPLATE) is SlotRoutePolicy.OWNER
        and ("POST", STOP_TEMPLATE) not in SLOT_ROUTE_POLICIES,
    }


def _scope_checks(source: Path) -> dict[str, bool]:
    """Would the app token reach the route with the grants the manifest already has?"""
    from kiro_crew.apps.manager import install_app
    from kiro_crew.dashboard.token_auth_app_scope import _api_pattern_matches, app_token_path_allowed

    path = "/api/chat/slots/hh-any-slot/stop"
    for name, grants in ((APP, GRANTS), (BARE_APP, ["/api/version"])):
        folder = source / name
        folder.mkdir(parents=True)
        manifest = {
            "name": name,
            "version": "0.0.1",
            "displayName": "RG-S3 probe",
            "description": "Ephemeral fixture for the stop-route scope check.",
            "author": "Haunted House contributors",
            "license": "MIT",
            "permissions": {"api": grants, "sessionApproval": name == APP},
        }
        (folder / "app.json").write_text(json.dumps(manifest) + "\n", encoding="utf-8")
        _require(install_app(str(folder)).ok, "install_failed")
    return {
        "chatWildcardGrantMatchesStopPath": _api_pattern_matches("/api/chat/*", path),
        "chatPrefixGrantMatchesStopPath": _api_pattern_matches("/api/chat", path),
        "unrelatedGrantDoesNotMatch": not _api_pattern_matches("/api/spawn/*", path)
        and not _api_pattern_matches("/api/chatx", path),
        "installedAppWithChatGrantsAllowed": app_token_path_allowed(APP, path),
        "installedAppWithoutChatGrantRefused": not app_token_path_allowed(BARE_APP, path),
        "unknownAppRefused": not app_token_path_allowed("hh-rg-s3-absent", path),
    }


async def _ownership_checks() -> dict[str, bool]:
    bench = Bench()
    try:
        owned = bench.slot("hh-owned")
        foreign = bench.slot("hh-foreign", app=OTHER_APP)
        unscoped = bench.slot("hh-owner-chat", app="")
        relinked = bench.slot("hh-relinked", linked="slack:1700000000.000100")
        before = {s.key: list(_roles(s)) for s in (foreign, unscoped, relinked)}

        results = {
            name: await bench.post(f"/api/chat/slots/{name}/stop", app=APP)
            for name in ("hh-foreign", "hh-owner-chat", "hh-relinked", "hh-missing")
        }
        refused_untouched = (
            bench.sessions.calls == []
            and bench.frames == []
            and all(_roles(s) == before[s.key] and s._stop_state == "idle" for s in (foreign, unscoped, relinked))
        )
        dashboard_status, _ = await bench.post("/api/chat/slots/hh-owner-chat/stop", app="")
        owned_status, owned_body = await bench.post("/api/chat/slots/hh-owned/stop", app=APP)
        return {
            "otherAppsSlotIsNotFound": results["hh-foreign"] == (404, NOT_FOUND),
            "ownersOwnChatIsNotFound": results["hh-owner-chat"] == (404, NOT_FOUND),
            "ownedSlotOnForeignSessionIsNotFound": results["hh-relinked"] == (404, NOT_FOUND),
            "missingSlotIsSameNotFound": results["hh-missing"] == (404, NOT_FOUND),
            "refusedStopChangesNothing": refused_untouched,
            "callerWithoutAppClaimIsNotGatedHere": dashboard_status == 200,
            "ownerAppReachesItsOwnSlot": (owned_status, owned_body) == (200, {"ok": True})
            and owned._stop_state == "idle",
        }
    finally:
        bench.close()


async def _confirmed_stop() -> tuple[dict[str, bool], dict[str, Any]]:
    """The cooperative stop the agent acknowledges."""
    bench = Bench()
    try:
        slot = bench.slot("hh-waiting")
        slot._queue.append({"id": "q1", "content": "queued follow-up"})
        roles_before = _roles(slot)
        rows_before = [dict(m) for m in slot.messages]
        status, body = await bench.post("/api/chat/slots/hh-waiting/stop", app=APP)
        cards = _stop_cards(bench.frames)
        _require(len(cards) == 2, "stop_card_frames_unexpected")
        opened, settled = cards
        row_meta = json.loads(slot.messages[-1]["cls"])
        checks = {
            "bodylessPostRespondsOkOnly": (status, body) == (200, {"ok": True}),
            "cancelAddressesSlotsOwnSession": bench.sessions.calls
            == [{"key": "dashboard:hh-waiting", "force": False, "preserve_queue": True}],
            "stopCardOpensAsStopping": opened["state"] == "stopping"
            and opened["outcome"] is None
            and opened["id"].startswith("stop-"),
            "stopCardSettlesAsStopped": settled["state"] == "stopped"
            and settled["outcome"] == "soft"
            and bool(settled.get("ts_end")),
            "stopCardKeepsOneIdentity": opened["id"] == settled["id"],
            "stopCardFramesAreSystemChatMessages": all(
                f["slot"] == "hh-waiting" and f["role"] == "system"
                for f in bench.frames
                if isinstance(f.get("meta"), dict) and f["meta"].get("kind") == "stop_event"
            ),
            "stopCardIsOneHistoryRow": _roles(slot) == [*roles_before, "system"]
            and row_meta["id"] == settled["id"]
            and row_meta["state"] == "stopped",
            "completedToolRowsUnchanged": slot.messages[: len(rows_before)] == rows_before
            and roles_before == ["user", "tool_call", "tool_result"],
            "queuedMessagesKept": [item["id"] for item in slot._queue] == ["q1"],
            "stopPostureReleased": slot._stop_state == "idle" and slot._stop_event_id is None,
        }
        shapes = {
            "responseKeys": sorted(body),
            "frameKeys": sorted(bench.frames[-1]),
            "stopCardMetaKeys": sorted(settled),
        }
        return checks, shapes
    finally:
        bench.close()


async def _other_outcomes() -> tuple[dict[str, bool], dict[str, Any]]:
    """Everything a caller can see instead of a confirmed cooperative stop."""
    checks: dict[str, bool] = {}
    shapes: dict[str, Any] = {}

    bench = Bench()
    try:
        idle = bench.slot("hh-idle", running=False)
        result = await bench.post("/api/chat/slots/hh-idle/stop", app=APP)
        checks["idleSlotAnswersNotRunningWithoutCard"] = (
            result == (200, {"ok": True, "info": "not running", "already_stopping": False})
            and bench.frames == []
            and bench.sessions.calls == []
            and _roles(idle) == ["user", "tool_call", "tool_result"]
        )
        shapes["notRunningResponseKeys"] = sorted(result[1])
    finally:
        bench.close()

    bench = Bench()
    try:
        bench.sessions.script = "no_turn"
        bench.slot("hh-ended")
        result = await bench.post("/api/chat/slots/hh-ended/stop", app=APP)
        cards = _stop_cards(bench.frames)
        # The card still reads "stopped": only the HTTP body says nothing was cancelled.
        checks["turnAlreadyEndedAnswersNoActiveTurn"] = result == (200, {"ok": True, "info": "no active turn"})
        checks["turnAlreadyEndedCardStillReadsStopped"] = [c["state"] for c in cards] == ["stopping", "stopped"]
    finally:
        bench.close()

    bench = Bench()
    try:
        bench.sessions.script = "unacked"
        slot = bench.slot("hh-silent")
        result = await bench.post("/api/chat/slots/hh-silent/stop", app=APP)
        cards = _stop_cards(bench.frames)
        checks["unackedCancelSettlesAsStopFailedReset"] = (
            result == (200, {"ok": True})
            and [c["state"] for c in cards] == ["stopping", "stop_failed_reset"]
            and cards[-1]["outcome"] == "hard"
            and _roles(slot)[:3] == ["user", "tool_call", "tool_result"]
        )
    finally:
        bench.close()

    bench = Bench()
    try:
        bench.slot("hh-force")
        result = await bench.post("/api/chat/slots/hh-force/stop", app=APP, query="?force=true")
        checks["forceQueryOnFirstPostStaysCooperative"] = result == (200, {"ok": True}) and [
            c["force"] for c in bench.sessions.calls
        ] == [False]
    finally:
        bench.close()

    bench = Bench()
    try:
        bench.sessions.is_compacting = lambda _key: True  # type: ignore[attr-defined]
        slot = bench.slot("hh-compacting")
        result = await bench.post("/api/chat/slots/hh-compacting/stop", app=APP)
        cards = _stop_cards(bench.frames)
        checks["compactionDeclinesStopAndSaysSo"] = (
            result == (200, {"ok": True, "info": "compacting", "compacting": True})
            and bench.sessions.calls == []
            and [c["state"] for c in cards] == ["stopping", "stop_declined_compacting"]
            and slot._stop_state == "idle"
        )
        shapes["declinedResponseKeys"] = sorted(result[1])
    finally:
        bench.close()

    # A second POST while the first is still waiting for the agent is a hard kill.
    bench = Bench()
    try:
        bench.sessions.gate = asyncio.Event()
        slot = bench.slot("hh-twice")
        slot._queue.append({"id": "q1", "content": "queued follow-up"})
        first = asyncio.ensure_future(bench.post("/api/chat/slots/hh-twice/stop", app=APP))
        for _ in range(20):
            await asyncio.sleep(0)
            if bench.sessions.calls:
                break
        _require(slot._stop_state == "soft_pending" and not first.done(), "first_stop_not_pending")
        second = await bench.post("/api/chat/slots/hh-twice/stop", app=APP)
        cards_after_second = [c["state"] for c in _stop_cards(bench.frames)]
        bench.sessions.gate.set()
        first_result = await asyncio.wait_for(first, timeout=5)
        cards = _stop_cards(bench.frames)
        checks["secondPostWhilePendingForcesHardKill"] = (
            second == (200, {"ok": True})
            and [c["force"] for c in bench.sessions.calls] == [False, True]
            and cards_after_second == ["stopping", "force_stopped"]
        )
        checks["secondPostDiscardsQueuedMessages"] = slot._queue == []
        checks["lateAckCannotRelabelForcedStop"] = (
            first_result == (200, {"ok": True})
            and [c["state"] for c in cards] == ["stopping", "force_stopped"]
            and len({c["id"] for c in cards}) == 1
        )
        checks["forcedStopKeepsCompletedToolRows"] = _roles(slot)[:3] == ["user", "tool_call", "tool_result"]
    finally:
        bench.close()

    return checks, shapes


async def _turn_end_frame() -> dict[str, bool]:
    """The ordinary turn-end frame, to show it does not say why the turn ended."""
    from kiro_crew.dashboard.chat_utils_completion import chat_done_payload

    from dataclasses import fields

    from kiro_crew.config.sections_agent import AgentConfig

    budget = {f.name: f.default for f in fields(AgentConfig)}.get("soft_stop_budget_secs")
    bench = Bench()
    try:
        slot = bench.slot("hh-done", running=False)
        payload = await chat_done_payload(bench.state, slot)
        return {
            "defaultSoftStopBudgetIsTenSeconds": budget == 10.0,
            "chatDoneCarriesNoStopMarker": set(payload) == {"slot", "turn", "turn_gen", "continuing", "needs_input"}
            and payload["slot"] == "hh-done",
        }
    finally:
        bench.close()


def run(source: Path) -> dict[str, Any]:
    from kiro_crew import __version__ as crew_version
    from kiro_crew.apps.bridges_mcp_config import _mcp_json_path
    from kiro_crew.config.paths import config_dir, data_home

    home = Path(os.path.realpath(Path.home()))
    for location in (_mcp_json_path().parent, data_home(), config_dir()):
        _require(home in Path(os.path.realpath(location)).parents, "crew_home_not_isolated")

    route = _route_checks()
    scope = _scope_checks(source)

    async def drive() -> tuple[Any, ...]:
        return (
            await _ownership_checks(),
            await _confirmed_stop(),
            await _other_outcomes(),
            await _turn_end_frame(),
        )

    ownership, (confirmed, confirmed_shapes), (outcomes, outcome_shapes), turn_end = asyncio.run(drive())
    return {
        "crewVersion": crew_version,
        "isolatedHome": True,
        "route": route,
        "scope": scope,
        "ownership": ownership,
        "confirmedStop": confirmed,
        "otherOutcomes": {**outcomes, **turn_end},
        "shapes": {**confirmed_shapes, **outcome_shapes},
    }


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if len(args) != 1:
        print(json.dumps({"status": "unverified", "code": "invalid_worker_arguments"}))
        return 2
    try:
        report = run(Path(args[0]))
    except ProbeFailure as exc:
        print(json.dumps({"status": "unverified", "code": str(exc)}))
        return 2
    except Exception as exc:  # noqa: BLE001 - reduce every failure to a path-free code
        if os.environ.get("RG_S3_DEBUG") == "1":
            raise
        print(json.dumps({"status": "unverified", "code": f"worker_{type(exc).__name__.lower()}"}))
        return 2
    print(json.dumps({"status": "observed", **report}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
