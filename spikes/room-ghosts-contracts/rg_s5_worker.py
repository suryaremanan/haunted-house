"""RG-S5 worker: Crew's packaged capacity and admission seams in an isolated home.

Runs under Crew's own Python with ``HOME`` pointed at an ephemeral directory.
It never starts a gateway, never opens a session and never talks to kiro-cli:
every answer comes from calling Crew's packaged predicates with synthetic
inputs (a tiny scheduler, a tiny admission service, a stand-in slot).  Stdout
is one scrubbed JSON object of booleans, fixed names and small integers;
failures collapse to stable codes.
"""
from __future__ import annotations

import asyncio
import dataclasses
import json
import logging
import os
import sys
import types
from pathlib import Path
from typing import Any

BUDGET = "app:hh-rg-s5-probe"
PRESSURE_CODES = (
    "principal_active_limit",
    "principal_queue_full",
    "crew_active_limit",
    "crew_queue_full",
    "session_create_rate",
)


class ProbeFailure(RuntimeError):
    """A stable, path-free probe failure."""


def _require(condition: bool, code: str) -> None:
    if not condition:
        raise ProbeFailure(code)


def _shape(response: Any) -> dict[str, Any]:
    """Status, code, Retry-After and capacity hint of one Crew refusal response."""
    body = json.loads(response.text)
    capacity = body.get("capacity") if isinstance(body, dict) else None
    retry = response.headers.get("Retry-After")
    return {
        "status": response.status,
        "code": body.get("code"),
        "hasError": isinstance(body.get("error"), str),
        "retryAfter": int(retry) if retry is not None and retry.isdigit() else None,
        "capacityRetryAfter": capacity.get("retry_after_seconds") if isinstance(capacity, dict) else None,
        "capacityReason": capacity.get("reason") if isinstance(capacity, dict) else None,
    }


def _admission_checks() -> tuple[dict[str, bool], dict[str, Any]]:
    """Fair admission: defaults, queue-before-refuse, and every refusal shape."""
    from kiro_crew.config.sections_shared_crew import SharedCrewConfig, effective_limits
    from kiro_crew.shared_crew.admission import REASON_HTTP_STATUS, ReasonCode, http_status
    from kiro_crew.shared_crew.admission_gate import Admission, AdmissionService
    from kiro_crew.shared_crew.scheduler import Decision, FairScheduler, SchedulerLimits, Ticket

    def scheduler(active: int, queue: int) -> Any:
        return FairScheduler(
            SchedulerLimits(
                principal_active=active,
                principal_children=1,
                principal_queue=queue,
                crew_active=active,
                crew_children=1,
                crew_queue=queue,
            )
        )

    def submit(target: Any, index: int) -> Any:
        return target.submit(Ticket(work_id=f"w{index}", budget_key=BUDGET, session_key=f"s{index}"))

    tight = scheduler(1, 1)
    first, second, third = (submit(tight, index) for index in range(3))

    default_config = SharedCrewConfig()
    # A small host: the start gate's automatic width floor (2) becomes the Crew width.
    narrow = effective_limits(SharedCrewConfig(admission_enabled=True), auto_crew_concurrency=2)
    narrow_scheduler = FairScheduler(
        SchedulerLimits(
            principal_active=narrow.principal_active,
            principal_children=narrow.principal_children,
            principal_queue=narrow.principal_queue,
            crew_active=narrow.crew_active,
            crew_children=narrow.crew_children,
            crew_queue=narrow.crew_queue,
        )
    )
    three_turns = [submit(narrow_scheduler, index).decision for index in range(3)]

    disabled = AdmissionService(None, limits=effective_limits(default_config, auto_crew_concurrency=2))
    enabled = AdmissionService(None, limits=dataclasses.replace(narrow, session_creates_per_minute=1))
    first_create = enabled.check_session_create(BUDGET)
    second_create = enabled.check_session_create(BUDGET)
    _require(second_create is not None, "session_create_rate_not_refused")

    shapes: dict[str, dict[str, Any]] = {"session_create_rate": _shape(second_create.refusal_response())}
    for reason in (
        ReasonCode.PRINCIPAL_ACTIVE_LIMIT,
        ReasonCode.PRINCIPAL_QUEUE_FULL,
        ReasonCode.CREW_ACTIVE_LIMIT,
        ReasonCode.CREW_QUEUE_FULL,
        ReasonCode.CONTAINMENT_UNAVAILABLE,
        ReasonCode.STORAGE_LIMIT,
        ReasonCode.REQUEST_TOO_LARGE,
    ):
        shapes[reason.value] = _shape(enabled._refusal(reason, BUDGET).refusal_response())
    shapes["task_store_unavailable"] = _shape(
        Admission(None, "rejected", store_unavailable=True).refusal_response()
    )

    def pressure(code: str) -> bool:
        shape = shapes[code]
        return (
            shape["status"] == 429
            and shape["code"] == code
            and shape["capacityReason"] == code
            and shape["hasError"]
            and isinstance(shape["retryAfter"], int)
            and shape["retryAfter"] > 0
            and shape["retryAfter"] == shape["capacityRetryAfter"]
        )

    statuses_429 = sorted(reason.value for reason, status in REASON_HTTP_STATUS.items() if status == 429)
    checks = {
        "fairAdmissionOffByDefault": default_config.admission_enabled is False and disabled.enabled is False,
        "disabledGateNeverRefusesSessionCreate": all(
            disabled.check_session_create(BUDGET) is None for _ in range(5)
        ),
        "overActiveLimitIsQueuedNotRefused": first.decision is Decision.ADMITTED
        and second.decision is Decision.QUEUED
        and second.reason is ReasonCode.PRINCIPAL_ACTIVE_LIMIT,
        "fullQueueIsRefused": third.decision is Decision.REJECTED
        and third.reason is ReasonCode.PRINCIPAL_QUEUE_FULL
        and http_status(third.reason) == 429,
        "thirdTurnAtCrewWidthTwoIsQueued": narrow.crew_active == 2
        and three_turns == [Decision.ADMITTED, Decision.ADMITTED, Decision.QUEUED],
        "sessionCreateRateRefusedOnlyWhenEnabled": first_create is None and pressure("session_create_rate"),
        "pressureRefusalsAre429WithRetryAfter": all(pressure(code) for code in PRESSURE_CODES),
        "exactlyFiveReasonsMapTo429": statuses_429 == sorted(PRESSURE_CODES),
        "storeUnavailableIs503WithoutRetryAfter": shapes["task_store_unavailable"]["status"] == 503
        and shapes["task_store_unavailable"]["code"] == "task_store_unavailable"
        and shapes["task_store_unavailable"]["retryAfter"] is None,
        "containmentUnavailableIs503": shapes["containment_unavailable"]["status"] == 503
        and shapes["containment_unavailable"]["code"] == "containment_unavailable",
        "storageLimitIs507": shapes["storage_limit"]["status"] == 507,
        "requestTooLargeIs413": shapes["request_too_large"]["status"] == 413,
    }
    fixed = ("principal_active_limit", "principal_queue_full", "crew_active_limit", "crew_queue_full")
    observed = {
        "retryAfterSeconds": {
            **{code: shapes[code]["retryAfter"] for code in fixed},
            "containment_unavailable": shapes["containment_unavailable"]["retryAfter"],
            "storage_limit": shapes["storage_limit"]["retryAfter"],
        },
        "defaultCrewQueueDepth": narrow.crew_queue,
        "defaultPrincipalQueueDepth": narrow.principal_queue,
        "defaultPrincipalActive": SharedCrewConfig().principal_concurrency,
        "queueExpirySeconds": narrow.queue_expiry_seconds,
    }
    return checks, observed


class _Slot:
    """Stand-in chat slot: only what the background-turn cap reads and writes."""

    def __init__(self, key: str, *, unattended: bool = True) -> None:
        self.key = key
        self.unattended = unattended
        self.rows: list[dict[str, Any]] = []

    def append(self, role: str, content: str, css: str, meta: dict[str, Any] | None = None) -> dict[str, Any]:
        self.rows.append({"role": role, "meta": dict(meta or {})})
        return self.rows[-1]


async def _background_run(state: Any, turn_dispatch: Any) -> tuple[dict[str, bool], dict[str, Any]]:
    cap = state.effective_max_background_turns()
    gate = asyncio.Event()
    started: list[int] = []

    async def turn(index: int) -> int:
        started.append(index)
        await gate.wait()
        return index

    slots = [_Slot(f"hh-rg-s5-{index}") for index in range(cap + 1)]
    tasks = [
        asyncio.ensure_future(state.run_background_turn(slots[index], turn(index)))
        for index in range(cap + 1)
    ]
    await asyncio.sleep(0.05)
    while_full = dict(state.background_turn_stats())
    started_while_full = list(started)
    attended = await state.run_background_turn(_Slot("owner", unattended=False), asyncio.sleep(0, "direct"))
    await asyncio.wait([tasks[-1]], timeout=5)
    _require(tasks[-1].done(), "queued_turn_never_abandoned")
    error = tasks[-1].exception()
    turn_dispatch.finish_turn_task(state, slots[-1], tasks[-1], 3600.0)
    gate.set()
    finished = await asyncio.gather(*tasks[:-1])
    after = dict(state.background_turn_stats())
    rows = slots[-1].rows
    notice = rows[0]["meta"].get("notice") if rows else None
    checks = {
        "turnOverBackgroundCapQueuesSilently": started_while_full == list(range(cap))
        and while_full == {"cap": cap, "running": cap, "waiting": 1},
        "attendedSlotBypassesBackgroundCap": attended == "direct",
        "abandonedTurnNeverRan": type(error).__name__ == "BackgroundTurnAbandoned"
        and isinstance(error, TimeoutError)
        and cap not in started,
        "abandonedTurnLeavesNoticeRow": len(rows) == 1
        and rows[0]["role"] == "error"
        and notice == "background_turn_abandoned",
        "backgroundCapReleasedAfterTurns": finished == list(range(cap))
        and after == {"cap": cap, "running": 0, "waiting": 0},
    }
    return checks, {"abandonedNotice": notice, "effectiveCap": cap}


def _background_checks() -> tuple[dict[str, bool], dict[str, Any]]:
    """The unattended-turn cap an app-owned slot's turn runs under."""
    from kiro_crew.dashboard import turn_dispatch
    from kiro_crew.dashboard.state import DashboardState

    default_cap = DashboardState.MAX_BACKGROUND_TURNS
    ceiling = DashboardState.MAX_BACKGROUND_TURNS_CEIL
    wait_seconds = DashboardState._BACKGROUND_QUEUE_WAIT_SECS
    state = object.__new__(DashboardState)
    state._bg_turn_sema = None
    state._bg_turn_cap = 0
    state._bg_turns_running = 0
    state._bg_turns_waiting = 0
    state._log = logging.getLogger("rg-s5")
    state._background_tasks = set()
    state._BACKGROUND_QUEUE_WAIT_SECS = 0.2  # the packaged wait is 30 minutes
    state.push_slots_update = lambda: None
    checks, observed = asyncio.run(_background_run(state, turn_dispatch))
    checks["defaultBackgroundTurnCapIsFour"] = (
        default_cap == 4 and observed["effectiveCap"] == 4 and ceiling == 16 and wait_seconds == 1800
    )
    observed.update(
        {"defaultCap": default_cap, "capCeiling": ceiling, "queueWaitSeconds": wait_seconds}
    )
    del observed["effectiveCap"]
    return checks, observed


def _sizing_checks() -> dict[str, bool]:
    """The session start gate narrows its width on a small host; it never reaches zero."""
    from kiro_crew.session_start_sizing import AUTO_CEILING, AUTO_FLOOR, size_session_start_concurrency

    return {
        "startWidthNeverBelowFloor": AUTO_FLOOR == 2
        and size_session_start_concurrency(1, 0.5) == AUTO_FLOOR
        and size_session_start_concurrency(None, None) >= AUTO_FLOOR,
        "startWidthCapped": size_session_start_concurrency(512, 4096.0) == AUTO_CEILING,
    }


def _ownership_checks() -> dict[str, bool]:
    """What an app token is told when the slot it names cannot be acquired."""
    from kiro_crew.dashboard import chat_handlers
    from kiro_crew.dashboard.slot_ownership import slot_not_found

    app = "hh-rg-s5-probe"
    own = types.SimpleNamespace(_app=app, key="hh-rg-s5-own", linked_session_key=None)
    state = types.SimpleNamespace(_slots={own.key: own}, _slots_under_construction=set())
    conflict = ValueError("probe conflict")
    mine = chat_handlers._app_acquisition_conflict(state, app, own.key, own, conflict)
    foreign = chat_handlers._app_acquisition_conflict(state, app, own.key, None, conflict)
    mine_body = json.loads(mine.text)
    uniform = json.loads(slot_not_found().text)
    return {
        "foreignSlotConflictIsUniform404": foreign.status == 404
        and json.loads(foreign.text) == uniform
        and uniform.get("code") == "slot_not_found",
        "ownSlotConflictIs409WithoutCode": mine.status == 409
        and "code" not in mine_body
        and isinstance(mine_body.get("error"), str),
    }


def run() -> dict[str, Any]:
    from kiro_crew import __version__ as crew_version
    from kiro_crew.apps.bridges_mcp_config import _mcp_json_path
    from kiro_crew.config.paths import config_dir, data_home

    home = Path(os.path.realpath(Path.home()))
    for location in (_mcp_json_path().parent, data_home(), config_dir()):
        _require(home in Path(os.path.realpath(location)).parents, "crew_home_not_isolated")

    admission, admission_observed = _admission_checks()
    background, background_observed = _background_checks()
    return {
        "crewVersion": crew_version,
        "isolatedHome": True,
        "admission": admission,
        "background": background,
        "sizing": _sizing_checks(),
        "ownership": _ownership_checks(),
        "observed": {"admission": admission_observed, "background": background_observed},
    }


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    logging.disable(logging.CRITICAL)
    if args:
        print(json.dumps({"status": "unverified", "code": "invalid_worker_arguments"}))
        return 2
    try:
        report = run()
    except ProbeFailure as exc:
        print(json.dumps({"status": "unverified", "code": str(exc)}))
        return 2
    except Exception as exc:  # noqa: BLE001 - reduce every failure to a path-free code
        print(json.dumps({"status": "unverified", "code": f"worker_{type(exc).__name__.lower()}"}))
        return 2
    print(json.dumps({"status": "observed", **report}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
