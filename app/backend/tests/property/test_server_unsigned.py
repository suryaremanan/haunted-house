"""Property 4 for haunted_house.server: unsigned API requests never reach a
handler, and the health check is always public.

Each example builds a fresh app with a fixed clock, adds a catch-all spy
route for `/api/{tail:.*}` (so every `/api/` path has a handler that could be
reached, not only `/api/whoami`), passes a spy gateway probe (called only by
the whoami handler), puts a pass-through spy middleware in front of ours (it
counts the requests the app sees), and sends one request through a real
aiohttp test server. Requests go out byte-exact: the client is given an
absolute, already-encoded URL, so it neither re-encodes nor removes dot
segments.

The answer is 401, except when aiohttp's HTTP layer rejects the request line
with 400 before routing. Its C parser (llhttp) does this for methods it does
not route. Which methods it routes is probed once on a bare aiohttp app with
no middleware, so the expected status never depends on the code under test.
"""

import asyncio
import functools
import json
import string
from dataclasses import dataclass

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from hypothesis import assume, event, example, given, settings
from hypothesis import strategies as st
from yarl import URL

from haunted_house.adapters.settings import Settings
from haunted_house.core.proxy_signature import WINDOW_SECONDS, sign
from haunted_house.server import PROXY_HEADER, build_app

pytestmark = pytest.mark.core

KEY = "k3y-for-tests"  # short on purpose: not a real credential
NOW = 1_731_400_000
MAX_TS = 10**12 - 1  # largest timestamp that fits the header's 12 digits

# --- Strategies -------------------------------------------------------------

# RFC 9110 token characters, used for method and header names.
TCHAR = "!#$%&'*+-.^_`|~" + string.digits + string.ascii_letters
# RFC 3986 pchar without percent-encoding (added separately as %HH).
PCHAR = string.ascii_letters + string.digits + "-._~!$&'()*+,;=:@"
HEX = "0123456789abcdef"

COMMON_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
# HEAD responses carry no body to check. CONNECT carries an authority, not a
# path, so "CONNECT /api/x" is not a request for a path under /api/.
EXCLUDED_METHODS = {"HEAD", "CONNECT"}

# Every method name in llhttp's HTTP_ALL_METHOD_MAP (include/llhttp.h, the
# llhttp vendored by aiohttp 3.14). aiohttp/_http_parser.pyx builds its
# method table from that macro, and the names match the strings in the
# compiled extension. llhttp matches methods against this table only, so the
# C parser rejects any other method with 400 ("Invalid method encountered").
# Some listed names are refused on an HTTP/1.1 request line too (the RTSP
# methods, and PRI, which must open an HTTP/2 preface).
LLHTTP_METHODS = (
    "DELETE", "GET", "HEAD", "POST", "PUT", "CONNECT", "OPTIONS", "TRACE",
    "COPY", "LOCK", "MKCOL", "MOVE", "PROPFIND", "PROPPATCH", "SEARCH", "UNLOCK",
    "BIND", "REBIND", "UNBIND", "ACL", "REPORT", "MKACTIVITY", "CHECKOUT", "MERGE",
    "M-SEARCH", "NOTIFY", "SUBSCRIBE", "UNSUBSCRIBE", "PATCH", "PURGE",
    "MKCALENDAR", "LINK", "UNLINK", "SOURCE", "PRI", "DESCRIBE", "ANNOUNCE",
    "SETUP", "PLAY", "PAUSE", "TEARDOWN", "GET_PARAMETER", "SET_PARAMETER",
    "REDIRECT", "RECORD", "FLUSH", "QUERY",
)  # fmt: skip
# A valid token that is not in the table. Every unlisted method gets the
# verdict this one gets (with the pure-Python parser, that verdict is "routed").
UNLISTED_METHOD = "0"
LISTED_METHODS = tuple(m for m in LLHTTP_METHODS if m not in EXCLUDED_METHODS)
PROBED_METHODS = (*LISTED_METHODS, UNLISTED_METHOD)

# Headers that change how the request is framed or decoded, so a random value
# would break the request before the backend sees it. The proxy header is
# left out of the random set; proxy_headers() decides it.
FRAMING_HEADERS = {
    "host",
    "content-length",
    "transfer-encoding",
    "content-encoding",
    "connection",
    "keep-alive",
    "proxy-connection",
    "te",
    "trailer",
    "upgrade",
    "expect",
    PROXY_HEADER.lower(),
}

secrets = st.sampled_from([KEY, None, ""])  # None and "" are the NO_SECRET case

methods = st.one_of(
    st.sampled_from(COMMON_METHODS),
    # Less common names, some routed (PROPFIND, QUERY) and some refused
    # (DESCRIBE, PRI) by the HTTP layer.
    st.sampled_from(LISTED_METHODS),
    # aiohttp's client upper-cases the method, so generate what goes on the wire.
    st.text(st.sampled_from(TCHAR), min_size=1, max_size=10)
    .map(str.upper)
    .filter(lambda m: m not in EXCLUDED_METHODS),
)

percent_encoded = st.builds(
    lambda byte, upper: f"%{byte:02X}" if upper else f"%{byte:02x}",
    st.integers(min_value=0, max_value=255),
    st.booleans(),
)
segment = st.lists(st.one_of(st.sampled_from(PCHAR), percent_encoded), max_size=8).map(
    "".join
)
# "/api/", "/%61pi/", "/a%70i/", ... : each letter of "api" literal or %-encoded.
api_prefix = st.tuples(
    *(st.sampled_from([letter, f"%{ord(letter):02x}"]) for letter in "api")
).map(lambda letters: "/" + "".join(letters) + "/")
rest = st.one_of(st.lists(segment, max_size=4).map("/".join), st.just("whoami"))
raw_query = st.lists(
    st.one_of(st.sampled_from(PCHAR + "/?"), percent_encoded), max_size=20
).map("".join)
targets = st.builds(
    lambda prefix, tail, query: prefix + tail + ("" if query is None else "?" + query),
    api_prefix,
    rest,
    st.none() | raw_query,
)

bodies = st.binary(max_size=512)

header_names = st.text(st.sampled_from(TCHAR), min_size=1, max_size=20).filter(
    lambda name: name.lower() not in FRAMING_HEADERS
)
# Visible ASCII, space and tab: what a header value may hold on the wire.
header_values = st.text(
    st.characters(min_codepoint=0x20, max_codepoint=0x7E) | st.just("\t"), max_size=40
)
other_headers = st.lists(st.tuples(header_names, header_values), max_size=6)

stale_timestamps = st.one_of(
    st.integers(min_value=WINDOW_SECONDS + 1, max_value=10**6).map(lambda gap: NOW - gap),
    st.integers(min_value=WINDOW_SECONDS + 1, max_value=10**6).map(lambda gap: NOW + gap),
    st.integers(min_value=0, max_value=MAX_TS).filter(
        lambda ts: abs(ts - NOW) > WINDOW_SECONDS
    ),
)


@st.composite
def changed(draw, original, unrelated, extra):
    """`original` with one element added or removed, or an unrelated draw."""
    value = draw(
        st.one_of(unrelated, extra.map(lambda e: original + e), st.just(original[:-1]))
    )
    assume(value != original)
    return value


@st.composite
def proxy_headers(draw, secret, method, target, body):
    """Return (kind, value or None): a proxy header that is not a valid signature."""
    # With no backend secret, sign with the key the gateway would hold.
    key = secret or KEY
    kinds = [
        "absent",
        "random text",
        "random shape",
        "other secret",
        "other method",
        "other target",
        "other body",
        "stale",
    ]
    if not secret:
        kinds.append("signed, backend has no secret")
    kind = draw(st.sampled_from(kinds))
    if kind == "absent":
        return kind, None
    if kind == "random text":
        return kind, draw(header_values)
    if kind == "random shape":
        ts_text = draw(st.text(st.sampled_from(string.digits), min_size=1, max_size=12))
        digest = draw(st.text(st.sampled_from(HEX), min_size=64, max_size=64))
        return kind, f"{ts_text}:{digest}"
    if kind == "other secret":
        other = draw(st.text(st.sampled_from(PCHAR), min_size=1, max_size=15))
        assume(other != key)
        return kind, sign(other, NOW, method, target, body)
    if kind == "other method":
        other = draw(changed(method, methods, st.sampled_from(TCHAR)))
        return kind, sign(key, NOW, other, target, body)
    if kind == "other target":
        other = draw(changed(target, targets, st.sampled_from(PCHAR)))
        return kind, sign(key, NOW, method, other, body)
    if kind == "other body":
        one_byte = st.binary(min_size=1, max_size=1)
        return kind, sign(key, NOW, method, target, draw(changed(body, bodies, one_byte)))
    if kind == "stale":
        return kind, sign(key, draw(stale_timestamps), method, target, body)
    return kind, sign(key, NOW, method, target, body)


@dataclass(frozen=True)
class Unsigned:
    secret: str | None
    method: str
    target: str
    body: bytes
    headers: list[tuple[str, str]]
    proxy_kind: str


@st.composite
def unsigned_requests(draw):
    secret, method, target, body = draw(secrets), draw(methods), draw(targets), draw(bodies)
    headers = draw(other_headers)
    kind, proxy = draw(proxy_headers(secret, method, target, body))
    if proxy is not None:
        # aiohttp strips spaces and tabs around header values.
        true_signature = sign(secret, NOW, method, target, body) if secret else None
        assume(proxy.strip(" \t") != true_signature)
        headers = [*headers, (PROXY_HEADER, proxy)]
    return Unsigned(secret, method, target, body, headers, kind)


# --- Harness ----------------------------------------------------------------


class SpyProbe:
    """Gateway probe that counts calls. Only the whoami handler calls it."""

    def __init__(self) -> None:
        self.calls = 0

    async def __call__(self) -> dict[str, str]:
        self.calls += 1
        return {"version": "0.12.1"}


def make_settings(secret: str | None) -> Settings:
    return Settings(port=1, secret=secret, gateway_origin=None, app_name="haunted-house")


def send(app, method, target, headers, body=b""):
    """Send one request to `app`; return (status, body as JSON or raw bytes)."""

    async def go():
        async with TestClient(TestServer(app)) as client:
            url = URL(f"http://{client.host}:{client.port}{target}", encoded=True)
            async with client.session.request(method, url, headers=headers, data=body) as resp:
                raw = await resp.read()
                try:
                    return resp.status, json.loads(raw)
                except ValueError:
                    return resp.status, raw

    return asyncio.run(go())


@functools.cache
def methods_a_bare_app_routes() -> frozenset[str]:
    """Return the PROBED_METHODS for which a bare aiohttp app runs its handler.

    Runs once per session: a plain `web.Application()` with no middleware and
    a catch-all `/api/` route gets one request per method. So the answer
    comes from aiohttp alone, never from build_app.
    """
    routed = []

    async def handler(request: web.Request) -> web.Response:
        routed.append(request.method)
        return web.Response()

    async def go():
        app = web.Application()
        app.router.add_route("*", "/api/{tail:.*}", handler)
        async with TestClient(TestServer(app)) as client:
            url = URL(f"http://{client.host}:{client.port}/api/probe", encoded=True)
            for method in PROBED_METHODS:
                async with client.session.request(method, url) as resp:
                    await resp.read()

    asyncio.run(go())
    missing = set(COMMON_METHODS).difference(routed)
    assert not missing, f"a bare aiohttp app refuses common methods {sorted(missing)}"
    return frozenset(routed)


def http_layer_routes(method: str) -> bool:
    """True if aiohttp's HTTP layer lets a request with `method` reach the app."""
    routed = methods_a_bare_app_routes()
    return (method if method in PROBED_METHODS else UNLISTED_METHOD) in routed


# --- Properties -------------------------------------------------------------


# Feature: crew-app-foundation, Property 4: Unsigned API requests never reach a handler
# For any unsigned request to a path under /api/, no handler runs, and the
# answer is 401, or 400 when aiohttp's HTTP layer rejects the request line
# before routing (its C parser does this for methods it does not route).
@settings(max_examples=50, deadline=None)
@given(unsigned_requests())
# Regression: the C parser answers method "0" with 400 before routing.
@example(
    Unsigned(
        secret=KEY, method="0", target="/api/whoami", body=b"", headers=[], proxy_kind="absent"
    )
)
def test_unsigned_api_requests_never_reach_a_handler(case):
    """**Validates: Requirements 5.1, 5.3, 5.4**"""
    reaches_app = http_layer_routes(case.method)
    event(f"proxy header: {case.proxy_kind}")
    event("secret: set" if case.secret else "secret: none")
    event("HTTP layer: routes method" if reaches_app else "HTTP layer: rejects method")
    app_requests = []
    route_calls = []

    @web.middleware
    async def count_app_requests(request, handler):
        app_requests.append(request.method)
        return await handler(request)

    async def spy_route(request: web.Request) -> web.Response:
        route_calls.append((request.method, request.raw_path))
        return web.json_response({"spy": "reached"})

    probe = SpyProbe()
    app = build_app(make_settings(case.secret), clock=lambda: NOW, gateway_probe=probe)
    app.middlewares.insert(0, count_app_requests)  # outermost: sees what the app sees
    app.router.add_route("*", "/api/{tail:.*}", spy_route)

    status, payload = send(app, case.method, case.target, case.headers, case.body)

    # One comparison, so a failure shows status, body and every spy together.
    outcome = {
        "status": status,
        "body": payload,
        "app requests": len(app_requests),
        "route calls": route_calls,
        "probe calls": probe.calls,
    }
    if reaches_app:
        expected = {
            "status": 401,
            "body": {"error": "bad_proxy_signature"},
            "app requests": 1,
        }
    else:
        # The 400 is aiohttp's: the app, and so our middleware, never saw the
        # request. The body is aiohttp's parser message, not ours to check.
        expected = {"status": 400, "body": payload, "app requests": 0}
    assert outcome == {**expected, "route calls": [], "probe calls": 0}


# Feature: crew-app-foundation, Property 4: Unsigned API requests never reach a handler
@settings(max_examples=50, deadline=None)
@given(secret=secrets, headers=other_headers, proxy=st.none() | header_values)
def test_health_returns_200_for_any_headers(secret, headers, proxy):
    """**Validates: Requirements 5.1**"""
    if proxy is not None:
        headers = [*headers, (PROXY_HEADER, proxy)]
    app = build_app(make_settings(secret), clock=lambda: NOW, gateway_probe=SpyProbe())

    status, payload = send(app, "GET", "/health", headers)

    assert (status, payload) == (200, {"status": "ok"})
