#!/usr/bin/env python3
"""S9 opt-in: how kiro-cli itself starts a per-session MCP element.

Closes one UNVERIFIED item of the S9 probe without a gateway: it opens a
``kiro-cli acp`` connection, sends ``initialize`` and ``session/new`` with one
labelled stdio element (a harmless recorder from an ephemeral folder), sends
NO prompt, and reports what the recorder process saw.

    python3 spikes/doors-runtime-contracts/s9_kiro_cli_live.py
        Isolated HOME.  kiro-cli is not logged in there, so the expected
        result is "authentication_required".  Safe to run anywhere.

    python3 spikes/doors-runtime-contracts/s9_kiro_cli_live.py --real-login
        Uses the operator's kiro-cli login.  No prompt is sent, so no model
        call is made, but kiro-cli records a session and may briefly start
        the MCP servers in the operator's own kiro-cli settings.  Run it only
        when that is acceptable.

Output is scrubbed JSON: booleans and fixed names, never paths or values.
"""
from __future__ import annotations

import json
import os
import select
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

LABEL = "dashboard:hh-s9-live-probe"
PARENT_MARKER = "HH_S9_PARENT_MARKER"
RECORDER = r"""
import json, os, sys
record = {
    "cwd": os.path.realpath(os.getcwd()),
    "label": os.environ.get("KIROCREW_SESSION_LABEL"),
    "room": os.environ.get("HH_ROOM"),
    "parentMarker": os.environ.get("HH_S9_PARENT_MARKER"),
    "names": sorted(os.environ),
}
with open(os.path.join(sys.argv[1], "seen-%d.json" % os.getpid()), "w") as handle:
    json.dump(record, handle)
for line in sys.stdin:
    try:
        message = json.loads(line)
    except ValueError:
        continue
    if message.get("id") is None:
        continue
    result = {}
    if message.get("method") == "initialize":
        result = {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}},
                  "serverInfo": {"name": "hh-s9-recorder", "version": "0"}}
    elif message.get("method") == "tools/list":
        result = {"tools": []}
    sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": message["id"], "result": result}) + "\n")
    sys.stdout.flush()
"""


def _reply(process: subprocess.Popen[str], request_id: int, timeout: float) -> dict[str, Any] | None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        ready, _, _ = select.select([process.stdout], [], [], 0.5)
        if not ready:
            continue
        line = process.stdout.readline()
        if not line:
            return None
        try:
            message = json.loads(line)
        except ValueError:
            continue
        if message.get("id") == request_id and ("result" in message or "error" in message):
            return message
    return None


def run(real_login: bool) -> dict[str, Any]:
    kiro_cli = shutil.which("kiro-cli")
    if kiro_cli is None:
        return {"status": "unverified", "code": "kiro_cli_unavailable"}
    with tempfile.TemporaryDirectory(prefix="hh-s9-live-") as raw:
        work = Path(os.path.realpath(raw))
        seen, process_cwd, session_cwd, home = (work / n for n in ("seen", "process", "session", "home"))
        for directory in (seen, process_cwd, session_cwd, home):
            directory.mkdir()
        recorder = work / "recorder.py"
        recorder.write_text(RECORDER, encoding="utf-8")
        env = {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "HOME": os.environ["HOME"] if real_login else str(home),
            PARENT_MARKER: "from-parent",
        }
        process = subprocess.Popen(  # noqa: S603 - fixed argv
            [kiro_cli, "acp"],
            cwd=process_cwd,
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        try:
            def send(request_id: int, method: str, params: dict[str, Any]) -> None:
                message = {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params}
                process.stdin.write(json.dumps(message) + "\n")
                process.stdin.flush()

            send(1, "initialize", {"protocolVersion": 1, "clientCapabilities": {}})
            if _reply(process, 1, 30) is None:
                return {"status": "unverified", "code": "acp_initialize_failed"}
            element = {
                "name": "hh-s9-probe:room-archivist",
                "command": os.path.realpath(sys.executable),
                "args": ["-I", str(recorder), str(seen)],
                "env": [
                    {"name": "HH_ROOM", "value": "archivist"},
                    {"name": "KIROCREW_SESSION_LABEL", "value": LABEL},
                ],
            }
            send(2, "session/new", {"cwd": str(session_cwd), "mcpServers": [element]})
            created = _reply(process, 2, 60)
            if created is None:
                return {"status": "unverified", "code": "acp_session_new_no_reply"}
            if "error" in created:
                refused = "uthentication" in json.dumps(created["error"])
                return {
                    "status": "unverified",
                    "code": "authentication_required" if refused else "acp_session_new_refused",
                }
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline and not any(seen.iterdir()):
                time.sleep(0.25)
        finally:
            process.terminate()
            try:
                process.wait(5)
            except subprocess.TimeoutExpired:
                process.kill()
        records = [json.loads(path.read_text(encoding="utf-8")) for path in seen.iterdir()]
        if not records:
            return {"status": "unverified", "code": "element_not_started"}
        record = records[0]
        where = {str(session_cwd): "session_cwd", str(process_cwd): "kiro_cli_process_cwd"}
        return {
            "status": "observed",
            "promptSent": False,
            "elementStartedAtSessionNew": True,
            "sessionLabelDelivered": record["label"] == LABEL,
            "elementEnvDelivered": record["room"] == "archivist",
            "kiroCliEnvironmentInherited": record["parentMarker"] == "from-parent",
            "serverProcessCwd": where.get(record["cwd"], "other"),
            "environmentNameCount": len(record["names"]),
        }


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if args not in ([], ["--real-login"]):
        print(json.dumps({"status": "unverified", "code": "invalid_arguments"}))
        return 2
    report = run(real_login=bool(args))
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["status"] == "observed" else 3


if __name__ == "__main__":
    raise SystemExit(main())
