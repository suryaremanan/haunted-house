"""Unit tests for haunted_house.server and app/backend/main.py.

Covers what test_server_basic.py does not: a missing or empty secret refuses
every `/api/` path with one startup warning, `/health` leaks no version or
secret, 401 responses echo nothing from the request, `main()` binds to
loopback with access logs off and exits 1 on a bad PORT, and `main.py` exits 1
with a fallback hint when aiohttp is missing.
"""

import asyncio
import hashlib
import hmac
import logging
import os
import socket
import subprocess
from pathlib import Path

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from yarl import URL

from haunted_house import server
from haunted_house.adapters.settings import Settings
from haunted_house.core.proxy_signature import WINDOW_SECONDS, sign
from haunted_house.server import PROXY_HEADER, build_app

KEY = "k3y-for-tests"  # short on purpose: not a real credential
OTHER_KEY = "0ther-k3y"  # a key the backend does not hold
NOW = 1_731_400_000
LOGGER = "haunted_house.server"

APP_DIR = Path(__file__).resolve().parents[3]  # app/
SYSTEM_PYTHON = Path("/usr/bin/python3")


class SpyProbe:
    """Gateway probe that counts calls and reports a gateway version."""

    def __init__(self) -> None:
        self.calls = 0

    async def __call__(self) -> dict[str, str]:
        self.calls += 1
        return {"version": "0.12.1"}


def make_settings(secret: str | None = KEY) -> Settings:
    return Settings(port=1, secret=secret, gateway_origin=None, app_name="haunted-house")


def send_all(app, requests):
    """Send each (method, target, headers, body) to `app` on one test server.

    Returns a list of (status, body text, response headers). `target` goes on
    the wire exactly as written (no re-encoding).
    """

    async def go():
        results = []
        async with TestClient(TestServer(app)) as client:
            for method, target, headers, body in requests:
                url = URL(target, encoded=True)
                async with client.request(method, url, headers=headers, data=body) as resp:
                    results.append((resp.status, await resp.text(), dict(resp.headers)))
        return results

    return asyncio.run(go())


def empty_key_header(ts: int, method: str, target: str, body: bytes = b"") -> str:
    """A well-formed v1 header HMAC'd with an empty key.

    `sign()` refuses an empty secret, so build it by hand: a backend with an
    empty secret must not accept a signature made with that empty key.
    """
    message = f"{ts}:{method}:{target}:{hashlib.sha256(body).hexdigest()}"
    return f"{ts}:{hmac.new(b'', message.encode(), hashlib.sha256).hexdigest()}"


def warnings_from_server(caplog):
    return [r for r in caplog.records if r.name == LOGGER and r.levelno == logging.WARNING]


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


# 1. Missing or empty secret: every /api/ path is refused, one startup warning.

API_TARGETS = ["/api/whoami", "/api/x", "/api", "/api/whoami?a=1"]


@pytest.mark.parametrize("secret", [None, ""], ids=["secret None", "secret empty"])
def test_missing_secret_refuses_every_api_path_and_warns_once(secret, caplog):
    caplog.set_level(logging.DEBUG, logger=LOGGER)
    probe = SpyProbe()

    app = build_app(make_settings(secret), clock=lambda: NOW, gateway_probe=probe)

    warnings = warnings_from_server(caplog)
    assert len(warnings) == 1
    message = warnings[0].getMessage()
    assert "KIROCREW_PROXY_SECRET" in message  # names the variable, not a value
    assert OTHER_KEY not in message

    requests = []
    sent_headers = []
    for target in API_TARGETS:
        for header in (
            sign(OTHER_KEY, NOW, "GET", target, b""),
            empty_key_header(NOW, "GET", target),
        ):
            requests.append(("GET", target, {PROXY_HEADER: header}, None))
            sent_headers.append(header)
    post_body = b'{"a":1}'
    post_header = sign(OTHER_KEY, NOW, "POST", "/api/x", post_body)
    requests.append(("POST", "/api/x", {PROXY_HEADER: post_header}, post_body))
    sent_headers.append(post_header)

    results = send_all(app, requests)

    for (method, target, _headers, _body), (status, text, _resp_headers) in zip(
        requests, results
    ):
        assert status == 401, f"{method} {target}"
        assert text == '{"error": "bad_proxy_signature"}', f"{method} {target}"
    assert probe.calls == 0
    # Still one warning: it is a startup message, not a per-request one.
    assert len(warnings_from_server(caplog)) == 1
    for record in caplog.records:
        for header in sent_headers:
            assert header not in record.getMessage()


def test_each_build_app_call_with_a_missing_secret_warns_exactly_once(caplog):
    caplog.set_level(logging.WARNING, logger=LOGGER)

    build_app(make_settings(None), clock=lambda: NOW)
    assert len(warnings_from_server(caplog)) == 1
    build_app(make_settings(""), clock=lambda: NOW)
    assert len(warnings_from_server(caplog)) == 2


def test_a_set_secret_gives_no_warning_and_is_never_logged(caplog):
    caplog.set_level(logging.DEBUG, logger=LOGGER)

    app = build_app(make_settings(KEY), clock=lambda: NOW)
    send_all(app, [("GET", "/api/whoami", {PROXY_HEADER: "garbage"}, None)])

    assert warnings_from_server(caplog) == []
    for record in caplog.records:
        assert KEY not in record.getMessage()


# 2. /health: exactly {"status":"ok"}, no version, no secret.


def test_health_payload_has_no_version_or_secret():
    probe = SpyProbe()  # would report a gateway version if health called it
    app = build_app(make_settings(KEY), clock=lambda: NOW, gateway_probe=probe)

    [(status, text, headers)] = send_all(app, [("GET", "/health", {}, None)])

    assert status == 200
    assert text == '{"status": "ok"}'
    assert "version" not in text.lower()
    assert "0.12.1" not in text
    assert KEY not in text
    for name, value in headers.items():
        assert KEY not in name and KEY not in value
    assert probe.calls == 0


# 3. main() binds to loopback with access logs off.


def test_main_binds_loopback_with_access_logging_off(monkeypatch, caplog):
    caplog.set_level(logging.INFO, logger=LOGGER)
    port = free_port()
    monkeypatch.setenv("PORT", str(port))
    monkeypatch.setenv("KIROCREW_PROXY_SECRET", KEY)
    monkeypatch.delenv("KIROCREW_GATEWAY_ORIGIN", raising=False)
    monkeypatch.delenv("KIROCREW_APP_NAME", raising=False)
    calls = []

    def fake_run_app(app, **kwargs):
        calls.append((app, kwargs))

    monkeypatch.setattr(web, "run_app", fake_run_app)

    assert server.main() == 0

    [(app, kwargs)] = calls
    assert isinstance(app, web.Application)
    assert kwargs["host"] == "127.0.0.1"
    assert kwargs["port"] == port
    assert "access_log" in kwargs and kwargs["access_log"] is None

    # run_app calls `print` once bound; the announced address is loopback.
    kwargs["print"]("ignored")
    listening = [r.getMessage() for r in caplog.records if r.name == LOGGER]
    assert f"listening on http://127.0.0.1:{port}" in listening
    for message in listening:
        assert KEY not in message


# 4. A bad PORT stops main() with exit code 1 and an error naming PORT.


@pytest.mark.parametrize("port", [None, "", "abc", "0", "65536", "-1", "80 "])
def test_main_returns_1_and_names_port_when_port_is_bad(port, monkeypatch, caplog):
    caplog.set_level(logging.INFO, logger=LOGGER)
    if port is None:
        monkeypatch.delenv("PORT", raising=False)
    else:
        monkeypatch.setenv("PORT", port)
    monkeypatch.setenv("KIROCREW_PROXY_SECRET", KEY)

    def fail_run_app(*_args, **_kwargs):
        raise AssertionError("run_app must not be called with bad settings")

    monkeypatch.setattr(web, "run_app", fail_run_app)

    assert server.main() == 1

    errors = [r for r in caplog.records if r.name == LOGGER and r.levelno == logging.ERROR]
    assert len(errors) == 1
    assert "PORT" in errors[0].getMessage()
    for record in caplog.records:
        assert KEY not in record.getMessage()


# 5. main.py with a Python that cannot import aiohttp.


def test_main_py_exits_1_and_names_the_requirements_fallback_without_aiohttp():
    if not SYSTEM_PYTHON.exists():
        pytest.skip(f"{SYSTEM_PYTHON} not found")
    probe = subprocess.run(
        [
            str(SYSTEM_PYTHON),
            "-s",
            "-I",
            "-c",
            "import importlib.util, sys; "
            "sys.exit(3 if importlib.util.find_spec('aiohttp') is None else 0)",
        ],
        capture_output=True,
        timeout=60,
    )
    if probe.returncode != 3:
        pytest.skip(f"{SYSTEM_PYTHON} has aiohttp or did not run")

    env = {"PATH": os.environ.get("PATH", ""), "PORT": "1", "KIROCREW_PROXY_SECRET": KEY}
    result = subprocess.run(
        [str(SYSTEM_PYTHON), "-s", "-I", "backend/main.py"],
        cwd=APP_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )

    assert result.returncode == 1
    assert "app/requirements.txt" in result.stderr
    assert "aiohttp" in result.stderr
    assert KEY not in result.stdout + result.stderr


# 6. 401 responses echo nothing from the request.

QUERY_MARK = "qmark-4417"
HEADER_MARK = "hmark-9023"


@pytest.mark.parametrize(
    "header",
    [
        pytest.param(HEADER_MARK, id="malformed"),
        pytest.param(f"{NOW}:{HEADER_MARK}", id="malformed with timestamp"),
        pytest.param(
            sign(OTHER_KEY, NOW, "GET", f"/api/whoami?q={QUERY_MARK}", b""), id="other key"
        ),
        pytest.param(
            sign(KEY, NOW - WINDOW_SECONDS - 1, "GET", f"/api/whoami?q={QUERY_MARK}", b""),
            id="stale",
        ),
    ],
)
def test_401_does_not_echo_the_header_or_query(header, caplog):
    caplog.set_level(logging.DEBUG, logger=LOGGER)
    app = build_app(make_settings(KEY), clock=lambda: NOW)
    target = f"/api/whoami?q={QUERY_MARK}"

    [(status, text, headers)] = send_all(app, [("GET", target, {PROXY_HEADER: header}, None)])

    assert status == 401
    assert text == '{"error": "bad_proxy_signature"}'
    for needle in (header, QUERY_MARK, HEADER_MARK):
        assert needle not in text
        for name, value in headers.items():
            assert needle not in name and needle not in value
    # The refusal is logged by path only.
    for record in caplog.records:
        if record.name.startswith("haunted_house"):
            message = record.getMessage()
            assert header not in message
            assert QUERY_MARK not in message
