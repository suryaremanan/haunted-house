#!/usr/bin/env python3
"""RG-S3: owned-session cancellation probe (room-ghosts 1.3).

Runs Crew's packaged chat route table, slot-ownership checkpoint, app-token
scope matcher and stop handler inside an ephemeral ``HOME`` and records the
request and the confirmation an app would rely on.  No gateway is started or
contacted, no session is created, kiro-cli never runs, and the operator's Crew
home is never read or written.  What only a live session can show is listed
under ``evidence.unverified`` with the owner's manual step.

    python3 spikes/room-ghosts-contracts/rg_s3_probe.py            # print report
    python3 spikes/room-ghosts-contracts/rg_s3_probe.py --write    # refresh fixture
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import crew_harness  # noqa: E402

SPIKE = "RG-S3"
FIXTURE = crew_harness.FIXTURES / "rg-s3-owned-session-cancellation.json"
WORKER = ROOT / "rg_s3_worker.py"
SECTIONS = {
    "route": {
        "stopRouteRegisteredAsPost",
        "stopRouteHasNoOtherMethod",
        "interruptRouteIsSeparate",
        "noOtherTurnCancelRoute",
        "stopRoutePolicyIsOwnerApp",
    },
    "scope": {
        "chatWildcardGrantMatchesStopPath",
        "chatPrefixGrantMatchesStopPath",
        "unrelatedGrantDoesNotMatch",
        "installedAppWithChatGrantsAllowed",
        "installedAppWithoutChatGrantRefused",
        "unknownAppRefused",
    },
    "ownership": {
        "otherAppsSlotIsNotFound",
        "ownersOwnChatIsNotFound",
        "ownedSlotOnForeignSessionIsNotFound",
        "missingSlotIsSameNotFound",
        "refusedStopChangesNothing",
        "callerWithoutAppClaimIsNotGatedHere",
        "ownerAppReachesItsOwnSlot",
    },
    "confirmedStop": {
        "bodylessPostRespondsOkOnly",
        "cancelAddressesSlotsOwnSession",
        "stopCardOpensAsStopping",
        "stopCardSettlesAsStopped",
        "stopCardKeepsOneIdentity",
        "stopCardFramesAreSystemChatMessages",
        "stopCardIsOneHistoryRow",
        "completedToolRowsUnchanged",
        "queuedMessagesKept",
        "stopPostureReleased",
    },
    "otherOutcomes": {
        "idleSlotAnswersNotRunningWithoutCard",
        "turnAlreadyEndedAnswersNoActiveTurn",
        "turnAlreadyEndedCardStillReadsStopped",
        "unackedCancelSettlesAsStopFailedReset",
        "forceQueryOnFirstPostStaysCooperative",
        "compactionDeclinesStopAndSaysSo",
        "secondPostWhilePendingForcesHardKill",
        "secondPostDiscardsQueuedMessages",
        "lateAckCannotRelabelForcedStop",
        "forcedStopKeepsCompletedToolRows",
        "chatDoneCarriesNoStopMarker",
        "defaultSoftStopBudgetIsTenSeconds",
    },
}
SHAPES = {
    "responseKeys": ["ok"],
    "notRunningResponseKeys": ["already_stopping", "info", "ok"],
    "declinedResponseKeys": ["compacting", "info", "ok"],
    "frameKeys": ["cls", "content", "meta", "role", "slot", "ts"],
    "stopCardMetaKeys": ["id", "kind", "mid", "outcome", "state", "ts_end", "ts_start"],
}
CONTRACT = {
    "method": "POST",
    "routeTemplate": "/api/chat/slots/{slot}/stop",
    "requestBodyKeys": [],
    "requestQueryKeys": [],
    "neverSend": ["force=true", "a second POST while the first is unanswered"],
    "requiredApiGrants": ["/api/chat", "/api/chat/*"],
    "extraApiGrantNeeded": False,
    "authorization": "The app that owns the slot, while the slot still runs on its own "
    "dashboard:<slot> session. Every other case, a missing slot included, is the same 404.",
    "refusal": {"status": 404, "bodyKeys": ["code", "error"], "code": "slot_not_found"},
    "successResponse": {
        "status": 200,
        "keys": SHAPES["responseKeys"],
        "turnWasStopped": "ok is true and there is no info key. The reply is sent only after "
        "the cancel settled, by acknowledgement or by Crew resetting the session.",
        "nothingWasStopped": {
            "keys": ["ok", "info", "already_stopping", "compacting"],
            "info": ["not running", "no active turn", "stop already in progress", "compacting"],
        },
        "clientTimeoutMustExceedSeconds": 10,
    },
    "confirmationEvent": {
        "frame": "chat_message",
        "frameKeys": SHAPES["frameKeys"],
        "match": {"slot": "<owned slot>", "role": "system", "meta.kind": "stop_event"},
        "metaKeys": SHAPES["stopCardMetaKeys"],
        "identity": "meta.id (stop-<hex>): the same id on the opening and the settling frame, "
        "and on the one history row. The HTTP reply does not return it.",
        "pending": {"meta.state": "stopping", "meta.outcome": None},
        "confirmed": [
            {"meta.state": "stopped", "meta.outcome": "soft", "meaning": "agent acknowledged the cancel"},
            {"meta.state": "force_stopped", "meta.outcome": "hard", "meaning": "second stop; session reset"},
            {"meta.state": "stop_failed_reset", "meta.outcome": "hard", "meaning": "no ack in budget; session reset"},
        ],
        "notConfirmed": [
            {"meta.state": "stop_declined_compacting", "meta.outcome": "compacting"},
        ],
        "notAConfirmation": "chat_done has slot, turn, turn_gen, continuing and needs_input only: "
        "it ends every turn alike and never says a turn was stopped.",
        "ambiguity": "When the turn had already ended the card still settles as stopped; only the "
        "HTTP reply (info: no active turn) tells the two apart. Require both the reply without "
        "info and the settled card.",
    },
    "completedToolEvents": "The stop appends one system row and edits only that row. Rows already "
    "in the slot window, completed tool_call and tool_result rows included, are left byte-identical "
    "and queued messages stay queued on a cooperative stop.",
    "source": {
        "route": "dashboard/routes/chat.py register",
        "handler": "dashboard/chat_api/turn_stop.py api_chat_slot_stop, stop_slot_turn",
        "stopCard": "dashboard/chat_api/turn_stop.py _open_stop_event_card, _resolve_stop_event, _make_stop_resolver",
        "ownership": "dashboard/slot_ownership.py slot_ownership_middleware, slot_route_denial, "
        "deny_app_slot_session_access; dashboard/chat_api/app_admission.py _app_cancel_denied",
        "scope": "dashboard/token_auth_app_scope.py _api_pattern_matches, app_token_path_allowed",
        "sessionCancel": "session_lifecycle_parts/turn_stop.py stop_turn; acp/session_provider.py cancel",
        "frames": "dashboard/state_parts/transcript_rows.py chat_message_note, chat_message_frame; "
        "dashboard/chat_utils_completion.py chat_done_payload",
    },
}
_LIVE_STEP = (
    "Owner opt-in, on a throwaway Mansion with the installed and trusted Haunted House app: "
    "(1) from the app backend create one disposable session the usual way (POST /api/chat/slots "
    "with a fresh name and a read-only Ghost profile, then .../project, then /api/chat/mode normal) "
    "and open /api/ws with the app token; (2) POST /api/chat with a harmless waiting task: 'List "
    "the files in this folder, then wait for my next message before doing anything else. Do not "
    "write or run anything.'; (3) once a tool_result frame for the listing has arrived and the "
    "turn is still running, send exactly one bodyless POST /api/chat/slots/<slot>/stop with a "
    "30 second client timeout; (4) record the reply, every chat_message frame whose meta.kind is "
    "stop_event, the chat_done frame, and GET /api/chat/slots/<slot>; (5) DELETE the slot. Scrub "
    "tokens and paths and store the capture as spikes/fixtures/rg-s3-live-stop.jsonl."
)
EVIDENCE = {
    "verified": [
        "Crew's packaged chat route table registers POST /api/chat/slots/{slot}/stop on "
        "api_chat_slot_stop, with POST only, next to a separate /interrupt route.",
        "Crew's packaged scope matcher admits the stop path for an installed app whose manifest "
        "grants /api/chat and /api/chat/*, and refuses an installed app without them.",
        "Through the packaged router and slot-ownership checkpoint, an app caller stops only a slot "
        "it owns that still runs on its own session; another app's slot, the owner's own chat, an "
        "owned slot linked to a foreign session and a missing slot all answer the same 404 "
        "slot_not_found, and a refused stop changes nothing.",
        "The packaged stop handler takes no body, asks the session manager for a cooperative "
        "cancel of dashboard:<slot> with the queue preserved, and answers {ok: true} after that "
        "call returns.",
        "The stop appends one system row whose meta is {kind: stop_event, id, state, outcome, "
        "ts_start}; it is broadcast as a chat_message frame in state stopping and again, same id, "
        "in state stopped with outcome soft once the cancel is acknowledged.",
        "Rows already in the slot window (user, tool_call, tool_result) are byte-identical after "
        "the stop, cooperative or forced.",
        "A stop on an idle slot answers info: not running with no card; a turn that already ended "
        "answers info: no active turn; a compacting session answers info: compacting and is not stopped.",
        "A second POST while the first is still pending makes the handler ask for a forced stop "
        "and empties the slot's queue; ?force=true on a first POST stays cooperative.",
        "The packaged chat_done payload has no stop or cancel marker.",
        "The default soft-stop budget in Crew's packaged config is 10 seconds.",
    ],
    "inferred": [
        "The token middleware publishes the app claim the checkpoint reads (the probe sets it "
        "directly). S6 verified live that the same app token and grants reach "
        "/api/chat/slots/{slot}/project, a sibling route under the same owner-app policy.",
        "An app-token socket on /api/ws receives the stop card frame with its meta: chat_message is "
        "a slot-scoped event (dashboard/ws_event_scope.py), and S6 received chat_* frames live.",
        "After an acknowledged cancel the turn runner appends a done row, pushes a slots frame with "
        "running false and sends chat_done (dashboard/chat_turn/queue_cycle.py); partial reply text "
        "and completed tool rows stay, as the product documentation for Stop states.",
        "An unacknowledged cancel makes Crew reset the session and start a fresh agent process "
        "(session_lifecycle_parts/turn_stop.py); the transcript rows stay, the agent's context does not.",
        "A pending tool approval on the stopped turn is rejected by the stop "
        "(turn_stop.py _reject_pending_approvals), so an approval card never outlives it.",
    ],
    "unverified": [
        {
            "claim": "A live gateway admits the app token on POST /api/chat/slots/{slot}/stop for a "
            "session the app created and answers {ok: true}.",
            "needs": "owner action on a real gateway",
            "manual_step": _LIVE_STEP,
        },
        {
            "claim": "kiro-cli acknowledges the cancel of a harmless waiting turn inside the "
            "10 second budget, so the card settles as stopped (soft) and not as stop_failed_reset.",
            "needs": "owner action on a real gateway",
            "manual_step": _LIVE_STEP + " Expect the last stop_event frame to read state stopped, "
            "outcome soft, within 30 seconds of the POST.",
        },
        {
            "claim": "The app-token WebSocket delivers both stop_event chat_message frames with "
            "meta.id, meta.state and meta.outcome, followed by chat_done for the slot.",
            "needs": "owner action on a real gateway",
            "manual_step": _LIVE_STEP + " Expect two chat_message frames with one shared meta.id "
            "(stopping, then stopped) and one chat_done for the slot.",
        },
        {
            "claim": "After a live stop the slot history still holds the tool_call and tool_result "
            "rows completed before it, plus exactly one stop_event row.",
            "needs": "owner action on a real gateway",
            "manual_step": _LIVE_STEP + " Expect the listing's tool rows captured in step 3 to be "
            "present and unchanged in the step 4 history, with one stop_event row after them.",
        },
    ],
}
GUIDANCE = {
    "request": "Send one bodyless POST per cancellation with a client timeout of at least "
    "30 seconds (the owner can raise Crew's soft-stop budget from 10 up to 60 seconds; a reply "
    "later than 30 seconds is cancel_unconfirmed by design). Never retry it and never send force=true: a repeat while the first is pending is "
    "a forced stop that resets the session and discards its queue.",
    "confirm": "Treat cancellation as confirmed only when the reply is {ok: true} with no info key "
    "and a stop_event frame for the bound slot reached stopped, force_stopped or stop_failed_reset. "
    "Then submit run_blocked with reason cancelled.",
    "unconfirmed": "A reply carrying info, a 404, a transport error, a declined (compacting) card "
    "or no settled card within 30 seconds is cancel_unconfirmed: keep the claim.",
    "ownerStop": "The owner's own Stop on the same slot produces the same card. A settled "
    "stop_event on a bound slot with an active run is a cancellation whoever asked.",
    "afterwards": "Never reuse a stopped slot for the retry; the design already requires a fresh "
    "slot and a higher Run_Sequence.",
    "manifest": "No change. The existing /api/chat and /api/chat/* grants cover the route.",
}


def evaluate(observed: object) -> dict[str, Any]:
    """Validate the worker report and attach the fail-closed decision."""
    if (
        not isinstance(observed, dict)
        or set(observed) != {"status", "crewVersion", "isolatedHome", "shapes", *SECTIONS}
        or observed["status"] != "observed"
        or observed["isolatedHome"] is not True
        or not isinstance(observed["crewVersion"], str)
        or crew_harness.VERSION_PATTERN.fullmatch(observed["crewVersion"]) is None
        or not isinstance(observed["shapes"], dict)
        or set(observed["shapes"]) != set(SHAPES)
    ):
        raise ValueError("unexpected report shape")
    failed: list[str] = []
    for section, names in SECTIONS.items():
        checks = observed[section]
        if not isinstance(checks, dict) or set(checks) != names:
            raise ValueError("unexpected report shape")
        for name in sorted(names):
            if not isinstance(checks[name], bool):
                raise ValueError("unexpected report shape")
            if not checks[name]:
                failed.append(f"{section}.{name}")
    failed.extend(f"shapes.{name}" for name in sorted(SHAPES) if observed["shapes"][name] != SHAPES[name])
    proven = not failed
    return {
        "spike": SPIKE,
        "schema_version": 1,
        "task": "room-ghosts 1.3",
        "crewVersion": observed["crewVersion"],
        "isolatedHome": True,
        "liveGatewayExercised": False,
        "checks": {section: dict(sorted(observed[section].items())) for section in SECTIONS},
        "failedChecks": failed,
        "outcome": "request_contract_verified_in_isolation_live_confirmation_unverified"
        if proven
        else "contract_unproved",
        "contract": CONTRACT if proven else None,
        "decision": {
            "cancelControl": "disabled_contract_unavailable",
            "cancellationService": "implement_behind_default_off_flag" if proven else "do_not_implement",
            "flagFlipsOnlyAfter": "the owner's live step reproduces the request, the settled "
            "stop_event frame and the preserved tool rows",
            "whenUnconfirmedAfter30Seconds": "cancel_unconfirmed_and_retain_claim",
            "liveConfirmationClaimed": False,
            "summary": "The stop request, its owner-app scope, its replies and the stop_event "
            "confirmation frame are proven against Crew's packaged handlers, but not against a "
            "live session. The design's fail-closed fallback applies: Cancel stays disabled with "
            "contract_unavailable until the owner runs the live step."
            if proven
            else "The contract could not be established. Cancel stays disabled with "
            "contract_unavailable and no cancellation service is implemented.",
        },
        "evidence": EVIDENCE,
        "guidance": GUIDANCE,
    }


def run_probe() -> tuple[dict[str, Any], int]:
    def prepare(work: Path) -> list[str]:
        source = work / "source"
        source.mkdir()
        return [str(source)]

    observed, status = crew_harness.run_worker(SPIKE, WORKER, prepare=prepare)
    if status != 0:
        return observed, status
    try:
        report = evaluate(observed)
        crew_harness.assert_scrubbed(report)
    except ValueError:
        return crew_harness.failure(SPIKE, "crew_test_harness_unsafe_report"), 2
    return report, 0 if not report["failedChecks"] else 1


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    report, status = run_probe()
    return crew_harness.emit(report, status, FIXTURE, args)


if __name__ == "__main__":
    raise SystemExit(main())
