#!/usr/bin/env python3
"""Read one explicit Crew slot and print only bounded field/type metadata.

The dashboard token stays in process memory. The probe never prints response
values, request headers, local paths, or another slot's history.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any

SLOT_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$")
URL_RE = re.compile(r"https?://[^\s]+")
MAX_RESPONSE_BYTES = 1_048_576
MAX_DEPTH = 5
MAX_FIELDS = 32
MAX_ITEMS = 8
MAX_DECLARED_SLOTS = 8

SAFE_FIELDS = frozenset(
    {
        "accepted_at",
        "admission_queued",
        "approved",
        "approval_id",
        "author",
        "before",
        "category",
        "cls",
        "code",
        "content",
        "continuing",
        "cursor",
        "data",
        "decision",
        "decision_id",
        "delta",
        "detail",
        "display",
        "entries",
        "error",
        "final",
        "from",
        "gen",
        "has_more",
        "history",
        "id",
        "input",
        "input_preview",
        "is_shell",
        "is_update",
        "key",
        "kind",
        "last",
        "login",
        "message",
        "messages",
        "meta",
        "mid",
        "name",
        "needs_input",
        "next_before",
        "outcome",
        "output",
        "principal",
        "purpose",
        "queue",
        "revision",
        "role",
        "running",
        "schema_version",
        "seq",
        "session_key",
        "since",
        "slot",
        "state",
        "status",
        "stop_declined",
        "stop_state",
        "stopping",
        "text",
        "title",
        "tool",
        "tool_call_id",
        "tool_input",
        "tool_name",
        "total",
        "ts",
        "turn",
        "turn_gen",
        "type",
        "value",
    }
)


def summarize_value(value: Any, depth: int = 0, ancestors: frozenset[int] = frozenset()) -> Any:
    """Return a bounded shape that contains no original scalar values."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return "number"
    if isinstance(value, str):
        return "string"
    if not isinstance(value, (list, dict)):
        return "non_json"
    if depth >= MAX_DEPTH or id(value) in ancestors:
        return "depth_limit"

    next_ancestors = ancestors | {id(value)}
    if isinstance(value, list):
        visible = value[:MAX_ITEMS]
        return {
            "kind": "array",
            "length": min(len(value), 101),
            "items": [summarize_value(item, depth + 1, next_ancestors) for item in visible],
            "omitted_items": max(0, len(value) - len(visible)),
        }

    entries = list(value.items())
    safe = sorted(
        ((key, child) for key, child in entries if isinstance(key, str) and key in SAFE_FIELDS),
        key=lambda item: item[0],
    )[:MAX_FIELDS]
    return {
        "kind": "object",
        "fields": {
            key: summarize_value(child, depth + 1, next_ancestors) for key, child in safe
        },
        "omitted_fields": len(entries) - len(safe),
    }


def collect_declared_slots(value: Any, slots: set[str], depth: int = 0) -> None:
    if depth >= MAX_DEPTH or len(slots) >= MAX_DECLARED_SLOTS:
        return
    if isinstance(value, list):
        for item in value[:100]:
            collect_declared_slots(item, slots, depth + 1)
        return
    if not isinstance(value, dict):
        return
    for key, child in list(value.items())[:MAX_FIELDS]:
        identifies_slot = key in {"slot", "session_key"} or (depth == 0 and key == "key")
        if identifies_slot and isinstance(child, str):
            slots.add(child)
        else:
            collect_declared_slots(child, slots, depth + 1)


def capture_history(history: Any, target_slot: str) -> dict[str, Any] | None:
    """Accept only an unambiguously scoped response and remove all values."""
    slots: set[str] = set()
    collect_declared_slots(history, slots)
    if not slots or slots != {target_slot} or not isinstance(history, dict):
        return None
    messages = history.get("messages")
    return {
        "target_slot": "[target-slot]",
        "declared_slot_count": len(slots),
        "message_count": min(len(messages), 501) if isinstance(messages, list) else None,
        "reported_total": min(history.get("total"), 501)
        if isinstance(history.get("total"), int)
        else None,
        "has_more": history.get("has_more") if isinstance(history.get("has_more"), bool) else None,
        "running": history.get("running") if isinstance(history.get("running"), bool) else None,
        "history_shape": summarize_value(history),
    }


def parse_dashboard_url(output: str) -> tuple[str, str]:
    """Extract the local origin and token without returning the full URL."""
    for candidate in reversed(URL_RE.findall(output)):
        parsed = urllib.parse.urlparse(candidate.rstrip(".,)"))
        token = urllib.parse.parse_qs(parsed.query).get("token", [""])[0]
        if parsed.scheme in {"http", "https"} and parsed.hostname in {"127.0.0.1", "localhost"} and token:
            origin = urllib.parse.urlunparse((parsed.scheme, parsed.netloc, "", "", "", ""))
            return origin.rstrip("/"), token
    raise RuntimeError("dashboard_token_unavailable")


def command_stdout(command: list[str]) -> str:
    result = subprocess.run(command, check=False, capture_output=True, text=True, timeout=20)
    if result.returncode != 0:
        raise RuntimeError("crew_command_failed")
    return result.stdout


def dashboard_credentials() -> tuple[str, str]:
    return parse_dashboard_url(command_stdout(["kirocrew", "token"]))


def gateway_start_epoch() -> float | None:
    try:
        output = command_stdout(["kirocrew", "gateway-pid"])
        payload = next(
            json.loads(line)
            for line in reversed(output.splitlines())
            if line.strip().startswith("{")
        )
        pid = payload.get("pid")
        if not isinstance(pid, int) or not payload.get("alive"):
            return None
        started = command_stdout(["ps", "-o", "lstart=", "-p", str(pid)]).strip()
        return datetime.strptime(started, "%a %b %d %H:%M:%S %Y").astimezone().timestamp()
    except (OSError, RuntimeError, StopIteration, ValueError, json.JSONDecodeError):
        return None


def frame_slot(frame: Any) -> str | None:
    if not isinstance(frame, dict):
        return None
    data = frame.get("data")
    if not isinstance(data, dict):
        return None
    if isinstance(data.get("slot"), str):
        return data["slot"]
    if isinstance(data.get("session_key"), str):
        return data["session_key"]
    decision = data.get("decision")
    if isinstance(decision, dict) and isinstance(decision.get("session_key"), str):
        return decision["session_key"]
    return None


def baseline_observation(path: Path, target_slot: str) -> tuple[float, int]:
    latest = 0.0
    matching = 0
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            row = json.loads(line)
            slot = frame_slot(row.get("frame"))
            if slot is not None and slot != target_slot:
                raise RuntimeError("baseline_contains_unrelated_slot")
            if slot == target_slot:
                observed = row.get("t")
                if isinstance(observed, (int, float)):
                    latest = max(latest, float(observed))
                matching += 1
    if not matching or latest <= 0:
        raise RuntimeError("baseline_target_missing")
    return latest, matching


def fetch_history(origin: str, token: str, target_slot: str) -> Any:
    quoted_slot = urllib.parse.quote(target_slot, safe="")
    query = urllib.parse.urlencode({"limit": 500, "token": token})
    request = urllib.request.Request(
        f"{origin}/api/chat/slots/{quoted_slot}?{query}",
        method="GET",
        headers={"Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read(MAX_RESPONSE_BYTES + 1)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"history_http_{error.code}") from None
    except (OSError, TimeoutError):
        raise RuntimeError("history_request_failed") from None
    if len(raw) > MAX_RESPONSE_BYTES:
        raise RuntimeError("history_response_too_large")
    try:
        return json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise RuntimeError("history_invalid_json") from None


def run_probe(target_slot: str, baseline_path: Path) -> dict[str, Any]:
    if not SLOT_RE.fullmatch(target_slot):
        raise RuntimeError("invalid_target_slot")
    baseline_latest, baseline_events = baseline_observation(baseline_path, target_slot)
    started = gateway_start_epoch()
    origin, token = dashboard_credentials()
    history = fetch_history(origin, token, target_slot)
    capture = capture_history(history, target_slot)
    if capture is None:
        raise RuntimeError("history_scope_unproved")
    restarted = started is not None and started > baseline_latest
    return {
        "probe": "S2-A4-post-restart-history",
        "schema_version": 1,
        "status": "observed" if restarted else "history_observed_restart_unproved",
        "scope": "one_explicit_slot",
        "baseline_matching_events": min(baseline_events, 501),
        "gateway_restart_after_baseline": restarted,
        "history": capture,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--slot", required=True, help="one known app-owned slot")
    parser.add_argument("--baseline", required=True, type=Path, help="scrubbed JSONL baseline")
    args = parser.parse_args(argv)
    try:
        result = run_probe(args.slot, args.baseline)
    except RuntimeError as error:
        print(
            json.dumps(
                {
                    "probe": "S2-A4-post-restart-history",
                    "schema_version": 1,
                    "status": str(error),
                },
                sort_keys=True,
            )
        )
        return 1
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
