"""hh-spike backend (throwaway). Stdlib only.

S1: verify the gateway's X-KiroCrew-Proxy HMAC on every /api request.
S2: exchange the app secret for an app token and start a ghost via POST /api/spawn.
"""
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("PORT", "9100"))
APP = os.environ.get("KIROCREW_APP_NAME", "hh-spike")
SECRET = os.environ.get("KIROCREW_PROXY_SECRET", "")
GATEWAY = os.environ.get("KIROCREW_GATEWAY_ORIGIN", "http://127.0.0.1:5476").rstrip("/")


def verify(method: str, target: str, body: bytes, header: str) -> tuple[bool, str]:
    if not SECRET:
        return False, "no secret in env"
    try:
        ts, sig = header.split(":", 1)
        if abs(time.time() - int(ts)) > 60:
            return False, "stale timestamp"
    except ValueError:
        return False, "malformed header"
    msg = f"{ts}:{method}:{target}:{hashlib.sha256(body).hexdigest()}"
    want = hmac.new(SECRET.encode(), msg.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(want, sig), "checked"


def gateway(method: str, path: str, token: str = "", body: dict | None = None, extra: dict | None = None, timeout: int = 30):
    data = json.dumps(body).encode() if body is not None else None
    if token:  # The gateway reads tokens from ?token= or a cookie, never Authorization.
        path += ("&" if "?" in path else "?") + "token=" + urllib.parse.quote(token, safe="")
    req = urllib.request.Request(GATEWAY + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    for k, v in (extra or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read() or b"{}"
            try:
                return r.status, json.loads(raw)
            except ValueError:
                return r.status, {"raw": raw[:2000].decode("utf-8", "replace")}
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def app_token() -> tuple[int, str]:
    status, data = gateway("POST", f"/api/apps/{APP}/token", extra={"X-App-Secret": SECRET})
    return status, data.get("token", "")


def ws_probe(secs: int = 20) -> dict:
    """Open the gateway WebSocket with the APP token and report which frame types arrive."""
    import asyncio
    import aiohttp  # available in the gateway's own interpreter

    async def run() -> dict:
        _, tok = app_token()
        url = GATEWAY + "/api/ws?token=" + urllib.parse.quote(tok, safe="")
        types: dict[str, int] = {}
        slots_seen: set[str] = set()
        try:
            async with aiohttp.ClientSession() as s:
                async with s.ws_connect(url, heartbeat=20) as ws:
                    await ws.send_json({"type": "subscribe_subagents"})
                    end = time.time() + secs
                    while time.time() < end:
                        try:
                            msg = await asyncio.wait_for(ws.receive(), timeout=max(0.1, end - time.time()))
                        except asyncio.TimeoutError:
                            break
                        if msg.type != aiohttp.WSMsgType.TEXT:
                            return {"connected": True, "closed": str(msg.type), "types": types}
                        f = json.loads(msg.data)
                        types[f.get("type", "?")] = types.get(f.get("type", "?"), 0) + 1
                        d = f.get("data")
                        if isinstance(d, dict) and d.get("slot"):
                            slots_seen.add(str(d["slot"]))
            return {"connected": True, "types": types, "slots_seen": sorted(slots_seen)}
        except Exception as e:  # report, don't crash
            return {"connected": False, "error": f"{type(e).__name__}: {e}"[:300]}

    return asyncio.run(run())


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, data: dict) -> None:
        raw = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _handle(self, method: str) -> None:
        if self.path == "/health":
            return self._send(200, {"status": "ok"})
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        ok, why = verify(method, self.path, body, self.headers.get("X-KiroCrew-Proxy", ""))
        if not ok:
            return self._send(401, {"error": "bad proxy signature", "why": why})
        if self.path == "/api/whoami":
            return self._send(200, {"verified": True, "gateway": GATEWAY, "python": sys.version.split()[0]})
        if self.path == "/api/spawn-ghost" and method == "POST":
            req = json.loads(body or b"{}")
            ts, tok = app_token()
            if not tok:
                return self._send(502, {"error": "token exchange failed", "status": ts})
            status, data = gateway("POST", "/api/spawn", tok, {
                "task": req.get("task", ""), "agent": req.get("agent", "hh-scribe"),
                "cwd": req.get("cwd", ""), "label": req.get("label", "hh-spike"),
                "max_turns": 20,
            })
            return self._send(status, data)
        if self.path.startswith("/api/ws-probe"):
            return self._send(200, ws_probe())
        if self.path.startswith("/api/gw/"):
            # Spike-only passthrough: call a gateway path with the APP token (scope-checked by Crew).
            target = "/api/" + self.path[len("/api/gw/"):]
            ts, tok = app_token()
            status, data = gateway(method, target, tok, json.loads(body) if body else None, timeout=600 if target == "/api/chat" else 30)
            return self._send(status, data if isinstance(data, dict) else {"data": data})
        return self._send(404, {"error": "not found"})

    def do_GET(self):
        self._handle("GET")

    def do_POST(self):
        self._handle("POST")

    def log_message(self, *args):
        pass


class Server(ThreadingHTTPServer):
    allow_reuse_address = not sys.platform.startswith("win")


if __name__ == "__main__":
    Server(("127.0.0.1", PORT), Handler).serve_forever()
