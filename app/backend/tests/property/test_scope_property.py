"""Property 8 for haunted_house.core.scope and the gateway client.

Two tests:

1. ``path_allowed`` is compared with a reference model written here from the
   rules in the design and scope.py's docstring, not from scope.py's code: a
   "safe path" predicate (with its own percent-decoder) followed by the
   Crew 0.12.1 dashboard's prefix rules.
2. ``GatewayClient.call`` is given a route whose path is generated, a
   generated ``allowed`` list, a loopback origin and a secret, and a session
   stand-in that records every request. A refused path must raise
   ``GatewayError("config")`` with nothing recorded, not even a token
   exchange. An allowed path must reach the gateway as exactly one exchange
   (the only path the client may call outside ``allowed``) and the target.

Prefixes and paths are built from one small set of segments so that
matches, near misses and refusals all come up often.

Control characters are C0 (U+0000 to U+001F) and DEL, as scope.py documents.
These are the characters URL parsers strip or split on. C1 controls such as
U+0085 are percent-encoded by URL parsers instead, so both sides allow them.
"""

import asyncio
import json
import string
from dataclasses import dataclass
from unittest.mock import patch
from urllib.parse import parse_qsl

import pytest
from hypothesis import event, example, given, note, settings
from hypothesis import strategies as st

from haunted_house.adapters import gateway_client
from haunted_house.adapters.gateway_client import (
    SECRET_HEADER,
    GatewayClient,
    GatewayError,
    token_exchange_path,
)
from haunted_house.adapters.settings import Settings
from haunted_house.core.scope import path_allowed

pytestmark = pytest.mark.core

# --- Reference model --------------------------------------------------------

CONTROL_CHARS = frozenset(chr(code) for code in range(0x20)) | {"\x7f"}
HEX_DIGITS = frozenset(string.hexdigits)
SCHEME_FIRST = frozenset(string.ascii_letters)
SCHEME_REST = frozenset(string.ascii_letters + string.digits + "+-.")


def has_control(text: str) -> bool:
    return any(char in CONTROL_CHARS for char in text)


def starts_with_scheme(text: str) -> bool:
    """RFC 3986: scheme = ALPHA *( ALPHA / DIGIT / "+" / "-" / "." ) ":"."""
    if not text or text[0] not in SCHEME_FIRST:
        return False
    for char in text[1:]:
        if char == ":":
            return True
        if char not in SCHEME_REST:
            return False
    return False


def path_part(target: str) -> str:
    """Everything before the first "?" or "#"."""
    end = len(target)
    for mark in "?#":
        index = target.find(mark)
        if index != -1:
            end = min(end, index)
    return target[:end]


def percent_decode(text: str) -> str:
    """Decode each %XX escape once and read the bytes as UTF-8, with bad
    bytes becoming U+FFFD. Broken escapes such as "%2" or "%zz" stay as they
    are. ASCII bytes always come out as themselves."""
    out = bytearray()
    i = 0
    while i < len(text):
        escape = text[i + 1 : i + 3]
        if text[i] == "%" and len(escape) == 2 and all(c in HEX_DIGITS for c in escape):
            out.append(int(escape, 16))
            i += 3
        else:
            out += text[i].encode("utf-8", "surrogatepass")
            i += 1
    return out.decode("utf-8", "replace")


def segments_safe(path: str) -> bool:
    """For a path starting with "/": no backslash or control character, no
    "." or ".." segment, and no empty segment except a last one left by a
    trailing "/"."""
    if "\\" in path or has_control(path):
        return False
    *inner, last = path.split("/")[1:]
    return all(seg not in ("", ".", "..") for seg in inner) and last not in (".", "..")


def is_safe(target: str) -> bool:
    if not target.startswith("/") or target.startswith("//"):
        return False
    if starts_with_scheme(target) or "\\" in target or has_control(target):
        return False
    path = path_part(target)
    return segments_safe(path) and segments_safe(percent_decode(path))


def dashboard_matches(prefix: str, path: str) -> bool:
    """Crew 0.12.1 dashboard rule for one trimmed, non-empty prefix."""
    if prefix.endswith("/*"):
        base = prefix[:-2]
        exact, under = base, base + "/"
    elif prefix.endswith("*"):
        exact, under = None, prefix[:-1]
    else:
        exact, under = prefix, prefix + "/"
    return path == exact or path.startswith(under)


def model_allowed(prefixes, target) -> bool:
    if not isinstance(target, str) or not is_safe(target):
        return False
    path = path_part(target)
    trimmed = [entry.strip() for entry in prefixes if isinstance(entry, str)]
    return any(dashboard_matches(prefix, path) for prefix in trimmed if prefix)


# --- Generators -------------------------------------------------------------

PREFIXES = [
    "/api",
    "/api/",
    "/api/*",
    "/api/chat*",
    "/api/chat",
    "/api/chat/*",
    "/api/version",
    "/apps/haunted-house/api/*",
    "/apps/haunted-house/api",
    "/api/apps/haunted-house/token",
    "/",
    "/*",
    "*",
    "/api/**",
    "api/*",
]
BLANK_PREFIXES = ["", " ", "\t", " \n "]
NON_STRING_PREFIXES = [None, 7, 1.5, b"/api/*", ["/api/*"], ("/*",), {"/api": 1}]
PADDING = st.text(" \t\r\n", max_size=2)

prefix_entries = st.one_of(
    st.sampled_from(PREFIXES),
    st.tuples(PADDING, st.sampled_from(PREFIXES), PADDING).map("".join),
    st.sampled_from(BLANK_PREFIXES + NON_STRING_PREFIXES),
)
prefix_lists = st.lists(prefix_entries, max_size=4)

# Starting points at, inside, or next to a listed prefix.
STEMS = [
    "",
    "api",
    "api/version",
    "api/chat",
    "api/chatty",
    "apps/haunted-house/api",
    "apps/haunted-house/apix",
    "apps/other-app/api",
    "api/apps/haunted-house/token",
    "api/apps/other-app/token",
]
NAMES = ["api", "apps", "haunted-house", "chat", "chatty", "cha", "version", "token", "x"]
TRICKY_SEGMENTS = [
    # Empty and dot segments, raw and percent-encoded.
    "", ".", "..", "%2e", "%2E", "%2e%2e", ".%2E", "%2e.",
    # Encoded separators and controls.
    "%2F", "x%2Fy", "%2F%2F", "x%2F..%2Fy", "%5C", "%5c", "%0A", "%00", "%7F", "%09",
    # Raw backslashes and control characters.
    "\\", "a\\b", "\n", "x\ty", "\x00", "\x7f",
    # Allowed by both sides: dots inside a name, non-ASCII, a C1 control,
    # broken escapes, and double encoding (decoded once, "%2e%2e" is a name).
    "...", ".x", "x.", "\u00e9", "\x85", "%", "%2", "%zz", "%41", "%252e%252e",
]
# What comes before the first segment, when it isn't the usual "/".
BAD_LEADS = [
    "",
    "//",
    "/\\",
    "\\",
    " /",
    "\x00/",
    "%2F",
    "/%2F",
    "http://evil.example/",
    "HTTP://127.0.0.1:5476/",
    "javascript:",
    "a+b.c-d:/",
]
TAILS = [
    "/",
    "?",
    "?q=1",
    "?next=/../x",
    "?a=//b",
    "?x=\\",
    "?\n",
    "#frag",
    "#/../x",
    "#%2e%2e",
    "?a#b",
    "/?q",
    "#?x",
]


@st.composite
def segment_paths(draw, clean=False):
    """A path built from the segment lists. ``clean`` paths start with "/"
    and have no tricky segment, so most of them are safe."""
    stem = draw(st.sampled_from(STEMS))
    segments = (stem.split("/") if stem else []) + draw(
        st.lists(st.sampled_from(NAMES), max_size=3)
    )
    if not clean:
        tricky = draw(
            st.one_of(
                st.just([]), st.lists(st.sampled_from(TRICKY_SEGMENTS), min_size=1, max_size=2)
            )
        )
        for segment in tricky:
            segments.insert(draw(st.integers(0, len(segments))), segment)
    lead = "/" if clean else draw(st.one_of(st.just("/"), st.sampled_from(BAD_LEADS)))
    tail = draw(st.one_of(st.just(""), st.sampled_from(TAILS)))
    return lead + "/".join(segments) + tail


# Character soup for combinations the segment lists don't think of.
SOUP = "/.%2eEfF5cC0aA?#\\: x\x00\n\x7f\x85\u00e9"
soup_paths = st.tuples(st.sampled_from(["/", ""]), st.text(SOUP, max_size=15)).map("".join)

paths = st.one_of(segment_paths(clean=True), segment_paths(), soup_paths)

# Endings for a path built from one of the drawn prefixes: at the boundary,
# just past it, below it, or below it with a tricky part.
NEAR_PREFIX_ENDINGS = [
    "", "/", "x", "ty", "/x", "/x/y", "/x?q=/..", "#f",
    "/..", "/%2e%2e", "//x", "%2F..", "/x\\",
]


@st.composite
def scope_cases(draw):
    """(prefixes, path). Half the time, when there is a usable prefix, the
    path is built from one of the prefixes so that matches and near misses
    are common."""
    prefixes = draw(prefix_lists)
    bases = [entry.strip().rstrip("*") for entry in prefixes if isinstance(entry, str)]
    bases = [base for base in bases if base]
    if bases and draw(st.booleans()):
        path = draw(st.sampled_from(bases)) + draw(st.sampled_from(NEAR_PREFIX_ENDINGS))
    else:
        path = draw(paths)
    return prefixes, path


# --- Test 1: path_allowed agrees with the model ------------------------------


# Feature: crew-app-foundation, Property 8: The client never calls outside the manifest scope
@settings(max_examples=500)
@given(case=scope_cases())
@example(case=(["/api/*"], "/api"))
@example(case=(["/api/*"], "/apix"))
@example(case=(["/api/chat*"], "/api/chatty"))
@example(case=(["/api/"], "/api/x"))
@example(case=(["/*"], "/"))
@example(case=([" /api/version\n"], "/api/version?token=abc"))
@example(case=([None, 7, b"/api/*", "  ", "/api/*"], "/api/version"))
@example(case=(["*"], "/apps/haunted-house/api/%2e%2e/x"))
@example(case=(["*"], "/api/x%2Fy"))
@example(case=(["*"], "/api/version?x=\\"))
@example(case=(["*"], "/api/version?next=/../x"))
@example(case=(["*"], "http://evil.example/api"))
@example(case=(["*"], None))
@example(case=(["*"], b"/api/version"))
def test_path_allowed_matches_the_reference_model(case):
    """**Validates: Requirements 3.3**"""
    prefixes, path = case
    expected = model_allowed(prefixes, path)
    event(f"allowed: {expected}")
    note(f"prefixes={prefixes!r} path={path!r} model={expected}")

    assert path_allowed(prefixes, path) == expected


# --- Test 2: the client sends nothing outside the scope ----------------------

ROUTE = "property-8-probe"
ISSUED = "tk-p8-0001"  # the token the fake gateway hands out
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]
LOOPBACK_ORIGINS = ["http://127.0.0.1:5476", "http://localhost:5476/", "http://[::1]:5476"]
APP_NAMES = ["haunted-house", "other-app"]
app_secrets = st.text(string.ascii_letters + string.digits + "-_", min_size=8, max_size=24)


@dataclass
class Sent:
    method: str
    path: str
    query: str
    headers: dict


class _Response:
    def __init__(self, body: dict) -> None:
        self.status = 200
        self._raw = json.dumps(body).encode()

    async def read(self) -> bytes:
        return self._raw

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc_info):
        return False


class RecordingSession:
    """Stands in for aiohttp.ClientSession: records every request and answers
    200 with JSON. A query-less POST to the exchange path gets a token;
    everything else gets {"ok": true}."""

    def __init__(self, exchange_path: str) -> None:
        self.exchange_path = exchange_path
        self.sent: list[Sent] = []

    def request(self, method, url, **kwargs):
        self.sent.append(
            Sent(method, url.raw_path, url.raw_query_string, dict(kwargs.get("headers") or {}))
        )
        if method == "POST" and url.raw_path == self.exchange_path and not url.raw_query_string:
            return _Response({"token": ISSUED})
        return _Response({"ok": True})


async def call_probe(client: GatewayClient):
    try:
        return await client.call(ROUTE, timeout=5)
    except GatewayError as error:
        return error


# Feature: crew-app-foundation, Property 8: The client never calls outside the manifest scope
# 300 examples: about one in six paths is in scope, so this gives roughly 50
# calls that reach the fake gateway.
@settings(max_examples=300)
@given(
    case=scope_cases(),
    method=st.sampled_from(METHODS),
    origin=st.sampled_from(LOOPBACK_ORIGINS),
    secret=app_secrets,
    app_name=st.sampled_from(APP_NAMES),
)
# The target may be the exchange path itself when `allowed` covers it...
@example(
    case=(["/api/*"], "/api/apps/haunted-house/token"),
    method="POST",
    origin=LOOPBACK_ORIGINS[0],
    secret="k3y-for-p8",
    app_name="haunted-house",
)
# ...but the exchange path's exemption doesn't make it a callable route.
@example(
    case=(["/api/version"], "/api/apps/haunted-house/token"),
    method="POST",
    origin=LOOPBACK_ORIGINS[0],
    secret="k3y-for-p8",
    app_name="haunted-house",
)
def test_the_client_never_calls_outside_the_manifest_scope(case, method, origin, secret, app_name):
    """**Validates: Requirements 3.3**"""
    allowed, path = case
    exchange = token_exchange_path(app_name)
    session = RecordingSession(exchange)
    config = Settings(port=1, secret=secret, gateway_origin=origin, app_name=app_name)
    client = GatewayClient(config, session, allowed)
    in_scope = path_allowed(allowed, path)
    event(f"in scope: {in_scope}")
    note(f"allowed={allowed!r} route=({method!r}, {path!r})")

    with patch.dict(gateway_client.ROUTES, {ROUTE: (method, path)}):
        outcome = asyncio.run(call_probe(client))
    note(f"sent={session.sent!r} outcome={outcome!r}")

    if not in_scope:
        assert isinstance(outcome, GatewayError)
        assert outcome.kind == "config"
        assert session.sent == []  # not even a token exchange
        return

    assert outcome == {"ok": True}
    exchange_request, target_request = session.sent
    # The exchange is the only request outside `allowed`, and only at the
    # exact exchange path for this app.
    assert (exchange_request.method, exchange_request.path) == ("POST", exchange)
    assert exchange_request.query == ""
    assert exchange_request.headers == {SECRET_HEADER: secret}
    # The target is the route's own path, carrying the token, without the secret.
    assert (target_request.method, target_request.path) == (method, path_part(path))
    assert ("token", ISSUED) in parse_qsl(target_request.query, keep_blank_values=True)
    assert SECRET_HEADER not in target_request.headers
