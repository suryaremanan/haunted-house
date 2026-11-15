#!/usr/bin/env python3
"""RG-S5: app-owned capacity probe (room-ghosts 1.5).

Classifies what the Gateway tells an app that creates app-owned chat slots and
sends turns while Crew is under pressure: which answers mean "back off and
dispatch again" and which mean the run is over.  Calls Crew's packaged
scheduler, admission gate, background-turn cap and slot-ownership helpers with
synthetic inputs inside an ephemeral ``HOME``.  No gateway is started or
contacted, no session is opened and kiro-cli is never run.

    python3 spikes/room-ghosts-contracts/rg_s5_probe.py            # print report
    python3 spikes/room-ghosts-contracts/rg_s5_probe.py --write    # refresh fixture
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import crew_harness  # noqa: E402

SPIKE = "RG-S5"
WORKER = ROOT / "rg_s5_worker.py"
FIXTURE = crew_harness.FIXTURES / "rg-s5-app-owned-capacity.json"
CLASSES = ("retryable_pressure", "caller_error", "terminal")
EVIDENCE_LABELS = ("verified", "inferred")
SECTIONS = {
    "admission": {
        "fairAdmissionOffByDefault",
        "disabledGateNeverRefusesSessionCreate",
        "overActiveLimitIsQueuedNotRefused",
        "fullQueueIsRefused",
        "thirdTurnAtCrewWidthTwoIsQueued",
        "sessionCreateRateRefusedOnlyWhenEnabled",
        "pressureRefusalsAre429WithRetryAfter",
        "exactlyFiveReasonsMapTo429",
        "storeUnavailableIs503WithoutRetryAfter",
        "containmentUnavailableIs503",
        "storageLimitIs507",
        "requestTooLargeIs413",
    },
    "background": {
        "defaultBackgroundTurnCapIsFour",
        "turnOverBackgroundCapQueuesSilently",
        "attendedSlotBypassesBackgroundCap",
        "abandonedTurnNeverRan",
        "abandonedTurnLeavesNoticeRow",
        "backgroundCapReleasedAfterTurns",
    },
    "sizing": {"startWidthNeverBelowFloor", "startWidthCapped"},
    "ownership": {"foreignSlotConflictIsUniform404", "ownSlotConflictIs409WithoutCode"},
}
EXPECTED_OBSERVED = {
    "admission": {
        "defaultCrewQueueDepth": 64,
        "defaultPrincipalActive": 4,
        "defaultPrincipalQueueDepth": 16,
        "queueExpirySeconds": 300,
        "retryAfterSeconds": {
            "containment_unavailable": 30,
            "crew_active_limit": 10,
            "crew_queue_full": 10,
            "principal_active_limit": 10,
            "principal_queue_full": 10,
            "storage_limit": 300,
        },
    },
    "background": {
        "abandonedNotice": "background_turn_abandoned",
        "capCeiling": 16,
        "defaultCap": 4,
        "queueWaitSeconds": 1800,
    },
}
# The only answers the Workshop may back off on.  Everything else blocks the task.
RETRYABLE_HTTP = (
    (429, "principal_active_limit"),
    (429, "principal_queue_full"),
    (429, "crew_active_limit"),
    (429, "crew_queue_full"),
    (429, "session_create_rate"),
)
RETRYABLE_NOTICES = ("background_turn_abandoned",)


def _row(
    where: str,
    status: int | None,
    code: str,
    kind: str,
    evidence: str,
    source: str,
    note: str,
) -> dict[str, Any]:
    return {
        "signal": {"where": where, "status": status, "code_or_field": code},
        "class": kind,
        "evidence": evidence,
        "source": source,
        "note": note,
    }


_GATE = "shared_crew/admission.py REASON_HTTP_STATUS; shared_crew/admission_gate.py Admission.refusal_response"
CLASSIFICATION = [
    *(
        _row(
            "http",
            status,
            f"code={code}",
            "retryable_pressure",
            "verified",
            _GATE,
            "Fair-admission refusal with a Retry-After header and a capacity body; nothing was accepted."
            + (
                " On POST /api/chat/slots it is answered before the slot is minted, so no slot is left."
                if code == "session_create_rate"
                else " A turn over the active limit is queued and accepted instead; only a full queue "
                "(or work that cannot wait) is refused."
            ),
        )
        for status, code in RETRYABLE_HTTP
    ),
    _row(
        "ws",
        None,
        "meta.notice=background_turn_abandoned",
        "retryable_pressure",
        "verified",
        "dashboard/state_parts/dashboard_services.py run_background_turn; dashboard/turn_dispatch.py finish_turn_task",
        "An error row on the slot after the turn waited 30 minutes behind the unattended-turn cap. "
        "The send was already answered 200; the turn never ran. Also readable from the slot's history.",
    ),
    _row(
        "http",
        503,
        "code=task_store_unavailable",
        "terminal",
        "verified",
        "shared_crew/admission_gate.py Admission.refusal_body",
        "Crew's durable work queue is down. No Retry-After. A Crew fault, not capacity.",
    ),
    _row(
        "http",
        503,
        "code=containment_unavailable",
        "terminal",
        "verified",
        _GATE,
        "The host cannot enforce the limits its owner required. Carries Retry-After 30 but clears only "
        "when the owner changes the host or the setting.",
    ),
    _row(
        "http",
        507,
        "code=storage_limit",
        "terminal",
        "verified",
        _GATE,
        "The caller's storage budget is spent. Retry-After 300; waiting a few seconds cannot help.",
    ),
    _row(
        "http",
        413,
        "code=request_too_large",
        "caller_error",
        "verified",
        _GATE,
        "The message is larger than Crew accepts.",
    ),
    _row(
        "http",
        404,
        "code=slot_not_found",
        "caller_error",
        "verified",
        "dashboard/slot_ownership.py slot_not_found; dashboard/chat_api/app_admission.py _app_acquisition_conflict",
        "The one answer an app gets for a slot it does not own, a reserved or colliding name, a closed "
        "slot, or a conflict on someone else's slot. It never means capacity.",
    ),
    _row(
        "http",
        409,
        "error text, no code",
        "caller_error",
        "verified",
        "dashboard/chat_api/app_admission.py _app_acquisition_conflict",
        "A conflict on the app's own live slot (still being built, memory-mode mismatch). "
        "Use a fresh slot name per run.",
    ),
    _row(
        "http",
        200,
        "body.queued=true",
        "caller_error",
        "inferred",
        "dashboard/chat_api/chat_send.py api_chat (busy-slot branch)",
        "The slot already has a turn; Crew parked this message behind it. Accepted, not refused: "
        "treat as a second dispatch to a busy slot, never as a started run.",
    ),
    _row(
        "http",
        400,
        "any 400 (message_required, message_too_long, invalid_mode, folder_not_found, slot_required, ...)",
        "caller_error",
        "inferred",
        "dashboard/chat_api/chat_send.py; slot_create.py; session_relaunch.py; slot_approval.py",
        "A malformed request to slot create, project, mode or send.",
    ),
    _row(
        "http",
        403,
        "code=app_session_settings_forbidden | app_yolo_forbidden | Access denied",
        "caller_error",
        "inferred",
        "dashboard/chat_api/app_admission.py; dashboard/chat_api/session_relaunch.py",
        "The app asked for something an app token may not do, or a project folder outside the allowed roots.",
    ),
    _row(
        "http",
        401,
        "any 401, or 403 again after one token refresh",
        "terminal",
        "inferred",
        "app token auth middleware",
        "The app token or its permission grant is gone; the owner must re-enable or approve the app.",
    ),
    _row(
        "http",
        409,
        "code=slot_closed | session_rebound",
        "terminal",
        "inferred",
        "dashboard/chat_api/chat_send.py; slot_create.py; session_relaunch.py",
        "The slot was closed or rebound while the request ran. That slot is finished for this run.",
    ),
    _row(
        "http",
        409,
        "code=agent_choice_unavailable",
        "terminal",
        "inferred",
        "dashboard/chat_api/slot_create.py api_chat_slot_create",
        "The requested agent cannot be used for the slot.",
    ),
    _row(
        "http",
        503,
        "code=store_unavailable | app_agent_owner_unpersisted | worker_unpersisted | history_unavailable",
        "terminal",
        "inferred",
        "dashboard/chat_api/slot_create.py; dashboard/chat_api/chat_send.py",
        "Crew could not save the slot or conversation. A slot create that fails after the mint "
        "retracts the new slot itself.",
    ),
    _row(
        "ws",
        None,
        "meta.kind=app_agent_refused",
        "terminal",
        "inferred",
        "dashboard/chat_turn/turn_admission.py _turn_admit",
        "The app's agent file is missing, untrusted or not the one registered: the turn is refused.",
    ),
    _row(
        "ws",
        None,
        "meta.notice=capacity_retries_spent",
        "terminal",
        "inferred",
        "dashboard/chat_turn/turn_ending.py",
        "The turn started and Crew spent its own model-capacity retries. The attempt was used.",
    ),
    _row(
        "ws",
        None,
        "meta.notice=session_busy_give_up",
        "terminal",
        "inferred",
        "dashboard/chat_turn/acp_recovery.py; dashboard/chat_turn/recovery.py",
        "The agent session stayed busy through Crew's own retries. The attempt was used.",
    ),
    _row(
        "ws",
        None,
        "meta.kind=turn_timeout",
        "terminal",
        "inferred",
        "dashboard/turn_dispatch.py finish_turn_task",
        "The turn hit Crew's wall-clock ceiling and was stopped.",
    ),
]
# Accepted work that looks like pressure but is not a refusal: do not re-dispatch.
ACCEPTED_SIGNALS = [
    {
        "signal": {"where": "http", "status": 200, "code_or_field": "body.ok=true, body.slot"},
        "meaning": "Turn accepted. With default settings this is the answer even when the turn then "
        "waits behind the unattended-turn cap.",
        "evidence": "inferred",
    },
    {
        "signal": {"where": "http", "status": 202, "code_or_field": "body.admission.state=queued"},
        "meaning": "Fair admission accepted the turn into its queue (up to 300 s). Crew starts it; a "
        "second send would be a duplicate.",
        "evidence": "inferred",
    },
    {
        "signal": {
            "where": "ws",
            "status": None,
            "code_or_field": "meta.notice=capacity_retrying | session_busy_retrying",
        },
        "meaning": "Crew is retrying inside a running turn. Informational.",
        "evidence": "inferred",
    },
]
EVIDENCE = {
    "verified": [
        "Fair admission (dashboard.shared_crew.admission_enabled) is off by default; a disabled "
        "gate never refuses a session create.",
        "Crew's packaged scheduler admits work up to the active limit, queues the next and refuses "
        "only when the queue is full; at an automatic Crew width of 2 a third concurrent turn is queued.",
        "Exactly five refusal reasons map to HTTP 429, each with body {error, code, capacity} and a "
        "Retry-After header equal to capacity.retry_after_seconds (10 s for the four limit reasons; "
        "the seconds until the per-minute window frees for session_create_rate).",
        "task_store_unavailable is 503 with no Retry-After; containment_unavailable is 503 with "
        "Retry-After 30; storage_limit is 507 with Retry-After 300; request_too_large is 413.",
        "An unattended (app-owned) turn runs under a cap of 4 by default (configurable 1 to 16). A "
        "turn over the cap queues with no signal to its sender; an attended slot bypasses the cap.",
        "A turn that waits out the cap (30 minutes as packaged) never runs and leaves one error row "
        "whose meta.notice is background_turn_abandoned; the cap's permits are returned afterwards.",
        "The session start gate's automatic width is clamped to 2..16: a small host narrows it, "
        "never to zero, and that module raises no refusal.",
        "For an app, a conflict on a slot it was not judged to own is the uniform 404 slot_not_found; "
        "a conflict on its own live slot is 409 with an error text and no code.",
    ],
    "inferred": [
        "POST /api/chat/slots charges the session-create rate before minting the slot, and POST "
        "/api/chat asks the admission gate before recording the user row, so a 429 leaves no slot "
        "and no message behind (read: dashboard/chat_api/slot_create.py, chat_send.py).",
        "An app token is charged to its own budget key by the gate (read: shared_crew/admission_gate.py "
        "actor_budget).",
        "A slot is unattended when an app created it and its owner has not opened it "
        "(read: dashboard/state_parts/chat_slot.py unattended).",
        "POST /api/chat/slots/{slot}/project and POST /api/chat/mode have no capacity refusal "
        "(read: dashboard/chat_api/session_relaunch.py, slot_approval.py).",
        "POST /api/chat/slots does not test the 500-slot ceiling or the per-creator ceiling of 50; "
        "those bind session import, fork and the agent-facing session tool.",
        "Error rows reach an app's WebSocket and GET /api/chat/slots/{slot} with their meta intact.",
        "The classification rows marked inferred, each read from the file named in its source.",
    ],
    "unverified": [
        {
            "claim": "On a real host with default settings, three concurrent Haunted House turns in "
            "three app-owned slots are all accepted with 200 and start without any refusal.",
            "needs": "owner action on a real gateway",
            "manual_step": "With Haunted House installed, trusted and enabled, have the backend create "
            "three disposable app-owned slots (create, project, mode normal), send each the turn "
            "'Reply with the single word ok. Use no tools.' at the same moment, record each call's "
            "HTTP status, code and Retry-After, poll each slot until its turn ends, record any error "
            "row's meta.notice or meta.kind, then DELETE /api/chat/slots/{slot} for all three.",
        },
        {
            "claim": "Through the real HTTP handlers an app token receives the 429 bodies above, and "
            "the refused request leaves no slot, user row or queued message.",
            "needs": "owner action on a real gateway with fair admission turned on (a Feature Preview "
            "the Workshop does not depend on)",
            "manual_step": "Optional and only on a disposable Crew home: turn on Shared Crew fair "
            "admission with Active Work Crew-Wide 1, run the same three harmless turns, and confirm "
            "the second and third sends answer 202 with admission.state queued rather than 429, "
            "then close all three slots and turn the setting off.",
        },
        {
            "claim": "The background_turn_abandoned row and the other error rows arrive on the app's "
            "WebSocket and in slot history with the meta fields listed here.",
            "needs": "owner action on a real gateway",
            "manual_step": "During the three-turn run above, keep one /api/ws connection open with the "
            "app token and compare each error row's meta with GET /api/chat/slots/{slot}. No "
            "abandonment is expected within the run; record 'not observed' if none appears.",
        },
    ],
}
MANUAL_STEP = (
    "Owner, on the real gateway, once: from the enabled Haunted House backend create three "
    "disposable app-owned slots with fresh names, set project and mode normal on each, send "
    "'Reply with the single word ok. Use no tools.' to all three together, record per call the "
    "HTTP status, body code and Retry-After, poll each slot until its turn ends and record any "
    "error row's meta.notice or meta.kind, then DELETE /api/chat/slots/{slot} for every slot "
    "that was accepted. At most three turns; no other route."
)
GUIDANCE = {
    "predicate": "retryable = (HTTP status 429 and body code in the five known codes) or (an error "
    "row on the run's slot whose meta.notice is background_turn_abandoned). Read the code from "
    "the body's code field only, never from its error text.",
    "delay": "Use the design's 1, 2, 4, 8, 15 s. Crew's Retry-After is 10 s for the limit reasons "
    "and up to 60 s for session_create_rate, so honour max(own delay, Retry-After) when the "
    "header is available.",
    "cleanup": "A refused slot create leaves nothing to close. A refused send leaves the slot the "
    "app already created: close it, or reuse it for the re-dispatch only if no user row was added.",
    "defaultHost": "With fair admission off there is no retryable HTTP refusal at all. Pressure "
    "shows as an accepted turn that has not started, so the Workshop needs its own start "
    "deadline; capacity_unavailable from five refusals is reachable only with fair admission on.",
    "clientGap": "GatewayError keeps status and code but drops Retry-After and the capacity body, "
    "and falls back to the error text when code is absent. CrewChatError then collapses every "
    "failure to crew_timeout or crew_failed, which loses the status and code the predicate needs. "
    "The send's success body must also be checked for queued=true and a 202 admission receipt.",
}


def evaluate(observed: object) -> dict[str, Any]:
    """Validate the worker report and attach the classification and decision."""
    if (
        not isinstance(observed, dict)
        or set(observed) != {"status", "crewVersion", "isolatedHome", "observed", *SECTIONS}
        or observed["status"] != "observed"
        or observed["isolatedHome"] is not True
        or not isinstance(observed["crewVersion"], str)
        or crew_harness.VERSION_PATTERN.fullmatch(observed["crewVersion"]) is None
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
    if observed["observed"] != EXPECTED_OBSERVED:
        failed.append("observed.values")
    proven = not failed
    return {
        "spike": SPIKE,
        "schema_version": 1,
        "task": "room-ghosts 1.5",
        "crewVersion": observed["crewVersion"],
        "isolatedHome": True,
        "liveGatewayExercised": False,
        "checks": {section: dict(sorted(observed[section].items())) for section in SECTIONS},
        "failedChecks": failed,
        "observed": EXPECTED_OBSERVED if proven else {},
        "outcome": "isolated_contract_verified_live_pressure_unverified" if proven else "contract_unproved",
        "classification": CLASSIFICATION,
        "acceptedSignals": ACCEPTED_SIGNALS,
        "evidence": EVIDENCE,
        "decision": {
            "rule": "retry only known signals; classify any unknown refusal as blocked",
            "knownRetryable": {
                "http": [{"status": status, "code": code} for status, code in RETRYABLE_HTTP] if proven else [],
                "notice": list(RETRYABLE_NOTICES) if proven else [],
            },
            "unknownRefusal": "blocked",
            "retryConsumesAttempt": False,
            "refusedSlotCreateLeavesSlot": False,
            "retryableRefusalExpectedOnDefaultHost": False,
            "liveAcceptanceRequiredBeforeDemo": True,
            "manualStep": MANUAL_STEP,
        },
        "guidance": GUIDANCE,
    }


def classify(where: str, status: int | None, code: str | None, report: dict[str, Any]) -> str:
    """The fail-closed class of one signal under a probe report's decision."""
    known = report["decision"]["knownRetryable"]
    if where == "http" and {"status": status, "code": code} in known["http"]:
        return "retryable_pressure"
    if where == "ws" and code in known["notice"]:
        return "retryable_pressure"
    return "blocked"


def run_probe() -> tuple[dict[str, Any], int]:
    observed, status = crew_harness.run_worker(SPIKE, WORKER)
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
