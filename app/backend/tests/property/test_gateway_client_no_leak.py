"""Property 6 for haunted_house.adapters.gateway_client: the client never
reveals the app secret or the app token.

Each example builds a GatewayClient around FakeSession, a stand-in for
aiohttp.ClientSession with the surface the client uses: session.request(...)
as an async context manager, response.status and await response.read(). No
server runs. The fake plays two scripts, one for the token exchange
(POST /api/apps/haunted-house/token) and one for every other request. Each
step either answers with a status and a body that echoes the request (URL,
query, headers including the secret header, JSON body, percent-encoded URL,
as text or inside JSON), raises an error whose text holds the full URL and
headers, or stalls until the call's deadline. When the exchange grants a
token, it is the generated token. A script that runs out starts over.

One or two calls run on the same client, so a later call can start with a
cached token. Every haunted_house.* logger is captured at DEBUG. Then the
test looks for the secret and the token in everything the client produced:
each log record (message, args and formatted text), each exception (str,
repr, args, code, traceback, and the whole __cause__/__context__ chain) and
each returned value (its repr and every string in it, keys included).

Secrets and tokens leave out lone surrogates (Hypothesis does this by
default): they have no UTF-8 encoding, so no HTTP request or environment
variable value sent over HTTP can carry one. Property 5 makes the same choice.
"""

import asyncio
import errno
import json
import logging
import re
import string
import traceback
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote, quote_plus

import aiohttp
import pytest
from hypothesis import assume, event, example, given, note
from hypothesis import strategies as st
from multidict import CIMultiDict, CIMultiDictProxy
from yarl import URL

from haunted_house.adapters.gateway_client import (
    DEFAULT_TIMEOUT,
    GatewayClient,
    GatewayError,
    token_exchange_path,
)
from haunted_house.adapters.settings import Settings
from haunted_house.core.redact import MARKER

APP = "haunted-house"
ORIGIN = "http://127.0.0.1:5476"  # loopback, so the client agrees to send
ALLOWED = ["/api/version"]
EXCHANGE = token_exchange_path(APP)
PACKAGE_LOGGER = "haunted_house"
# Deadline for examples with a stalling step. Without one, calls use the
# client's default, which the fake never comes near.
STALL_TIMEOUT = 0.05

# --- Strategies -------------------------------------------------------------

# Characters that mean something in a URL, a query, a header or a regex,
# plus space, tab, quotes, backslash and non-ASCII text.
AWKWARD = "%+&=/?# \t[]()*.\\'\"\u00e9\u20ac\u4e2d\U0001f600"
credentials = st.text(
    st.one_of(
        st.sampled_from(AWKWARD),
        st.sampled_from(string.ascii_letters + string.digits + "-_"),
        st.characters(codec="utf-8"),  # any code point except surrogates
    ),
    min_size=8,
    max_size=40,
)

BODY_KINDS = (
    "url",  # str(url): the encoded request target, query included
    "human url",  # url.human_repr(): the decoded form libraries print
    "query",  # raw and decoded query strings
    "headers",  # "Name: value" lines
    "encoded url",  # the URL percent-encoded once more
    "json echo",  # a JSON object with every echo as a key and as a value
    "invalid json",
    "non-object json",  # a JSON list or string of the echoes
    "empty",
)
ERRORS = (
    "timeout",  # asyncio.TimeoutError raised by the session
    "connection",  # aiohttp.ClientConnectionError with the full URL
    "os",  # OSError with the full URL
    "response",  # aiohttp.ClientResponseError whose request_info holds the URL
    "stall",  # never answers; the call's own deadline fires
)


@dataclass(frozen=True)
class Reply:
    """Answer with `status` and a body of kind `body`. In a JSON echo,
    echo number `pick` also goes under `code_key`, which the client reads as
    the gateway's error code."""

    status: int
    body: str
    pick: int = 0
    code_key: str = "code"
    ascii_json: bool = True


@dataclass(frozen=True)
class Grant:
    """A token exchange that succeeds: {"token": <the generated token>},
    plus the JSON echo when `echo` is set."""

    status: int = 200
    echo: bool = False


@dataclass(frozen=True)
class Raise:
    """Fail with `error` when the request starts or, if `on_read`, when the
    body is read."""

    error: str
    on_read: bool = False



def mostly(common, rare):
    """`common` about three times in four, else `rare`."""
    return st.integers(min_value=0, max_value=3).flatmap(lambda n: rare if n == 3 else common)


# Mostly 200, often 401/403 (which trigger the refresh), else any 200-599.
statuses = st.one_of(
    st.just(200), st.sampled_from([401, 403]), st.integers(min_value=200, max_value=599)
)
replies = st.builds(
    Reply,
    status=statuses,
    # The JSON echo about half the time: it is the body that reaches the
    # returned value and the error code.
    body=st.one_of(st.just("json echo"), st.sampled_from(BODY_KINDS)),
    pick=st.integers(min_value=0, max_value=40),
    code_key=st.sampled_from(["code", "error"]),
    ascii_json=st.booleans(),
)
raises = st.builds(Raise, error=st.sampled_from(ERRORS), on_read=st.booleans())
grants = st.builds(
    Grant,
    status=st.one_of(st.just(200), st.integers(min_value=200, max_value=299)),
    echo=st.booleans(),
)
target_steps = mostly(replies, raises)
# Most exchange steps grant the token, so most examples reach the target
# route; the rest are any other step.
exchange_steps = mostly(grants, target_steps)
call_bodies = st.dictionaries(
    st.text(max_size=6), st.one_of(st.text(max_size=12), st.integers()), max_size=3
)
calls = st.lists(st.one_of(st.none(), call_bodies), min_size=1, max_size=2)

# --- Fake gateway -----------------------------------------------------------


@dataclass
class Sent:
    """One request as the client handed it to the session."""

    method: str
    url: URL
    headers: dict[str, str]
    json_body: Any


def echoes(sent: Sent) -> list[str]:
    """Every way the fake repeats the request back. The bare header and
    query values come first, so small `pick` values (which Hypothesis draws
    often) put the secret or the token itself in the error code."""
    url = sent.url
    return [
        *sent.headers.values(),
        *url.query.values(),
        str(url),
        url.human_repr(),
        repr(url),
        url.raw_query_string,
        url.query_string,
        quote(str(url), safe=""),
        quote_plus(url.human_repr()),
        header_lines(sent.headers),
        json.dumps(sent.headers),
        json.dumps(sent.json_body),
    ]


def header_lines(headers: dict[str, str]) -> str:
    return "\n".join(f"{name}: {value}" for name, value in headers.items())


def echo_object(sent: Sent, pick: int, code_key: str) -> dict[str, Any]:
    texts = echoes(sent)
    obj: dict[str, Any] = {text: text for text in texts}
    obj.update(
        {
            "url": str(sent.url),
            "query": dict(sent.url.query),
            "headers": sent.headers,
            "json": sent.json_body,
            "all": texts,
            "nested": {"deeper": [{"echo": texts}]},
        }
    )
    obj[code_key] = texts[pick % len(texts)]
    return obj


def dumps(value: Any, ascii_json: bool) -> bytes:
    return json.dumps(value, ensure_ascii=ascii_json).encode("utf-8")


def reply_body(step: Reply, sent: Sent) -> bytes:
    url = sent.url
    kind = step.body
    if kind == "json echo":
        return dumps(echo_object(sent, step.pick, step.code_key), step.ascii_json)
    if kind == "non-object json":
        texts = echoes(sent)
        value = texts if step.pick % 2 == 0 else texts[step.pick % len(texts)]
        return dumps(value, step.ascii_json)
    text = {
        "url": str(url),
        "human url": url.human_repr(),
        "query": url.raw_query_string + "\n" + url.query_string,
        "headers": header_lines(sent.headers),
        "encoded url": quote(str(url), safe="") + "\n" + quote_plus(url.human_repr()),
        "invalid json": '{"url": ' + str(url) + ", " + header_lines(sent.headers),
        "empty": "",
    }[kind]
    return text.encode("utf-8")


async def fail(step: Raise, sent: Sent) -> None:
    url = sent.url
    if step.error == "stall":
        await asyncio.sleep(3600)  # cancelled by the call's deadline
        raise AssertionError("the call's deadline did not fire")
    if step.error == "timeout":
        raise asyncio.TimeoutError(f"timed out waiting for {url} {sent.headers}")
    if step.error == "connection":
        raise aiohttp.ClientConnectionError(
            f"Cannot connect to host {url.human_repr()} [{url}] {sent.headers}"
        )
    if step.error == "os":
        raise OSError(errno.ECONNREFUSED, f"Connect call failed {url} {sent.headers}")
    headers = CIMultiDictProxy(CIMultiDict(sent.headers))
    info = aiohttp.RequestInfo(url, sent.method, headers, url)
    raise aiohttp.ClientResponseError(
        info, (), status=502, message=f"Bad gateway for {url}", headers=headers
    )


class FakeResponse:
    def __init__(self, status: int, body: bytes, failure: Raise | None, sent: Sent) -> None:
        self.status = status
        self._body = body
        self._failure = failure
        self._sent = sent

    async def read(self) -> bytes:
        if self._failure is not None:
            await fail(self._failure, self._sent)
        return self._body


class FakeRequest:
    """What FakeSession.request returns: an async context manager."""

    def __init__(self, session: "FakeSession", sent: Sent) -> None:
        self._session = session
        self._sent = sent

    async def __aenter__(self) -> FakeResponse:
        step = self._session.next_step(self._sent)
        if isinstance(step, Raise):
            if not step.on_read:
                await fail(step, self._sent)
            return FakeResponse(200, b"", step, self._sent)
        if isinstance(step, Grant):
            body: dict[str, Any] = {}
            if step.echo:
                body = echo_object(self._sent, 0, "code")
            body["token"] = self._session.token
            return FakeResponse(step.status, dumps(body, True), None, self._sent)
        return FakeResponse(step.status, reply_body(step, self._sent), None, self._sent)

    async def __aexit__(self, *exc_info: object) -> bool:
        return False


class FakeSession:
    """Plays the exchange script for POST <EXCHANGE> and the target script
    for every other request."""

    def __init__(self, token: str, exchange_script: list, target_script: list) -> None:
        self.token = token
        self._scripts = {"exchange": exchange_script, "target": target_script}
        self.sent = {"exchange": 0, "target": 0}

    def request(self, method: str, url: URL, **kwargs: Any) -> FakeRequest:
        sent = Sent(method, url, dict(kwargs.get("headers") or {}), kwargs.get("json"))
        return FakeRequest(self, sent)

    def next_step(self, sent: Sent) -> Reply | Grant | Raise:
        which = "exchange" if (sent.method, sent.url.raw_path) == ("POST", EXCHANGE) else "target"
        script = self._scripts[which]
        step = script[self.sent[which] % len(script)]
        self.sent[which] += 1
        return step


# --- Harness ----------------------------------------------------------------


def make_settings(secret: str) -> Settings:
    return Settings(port=1, secret=secret, gateway_origin=ORIGIN, app_name=APP)


class Collect(logging.Handler):
    def __init__(self) -> None:
        super().__init__(level=logging.DEBUG)
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        # The same record reaches every logger on its way up; keep it once.
        if not any(record is seen for seen in self.records):
            self.records.append(record)


@contextmanager
def captured_logs() -> Iterator[list[logging.LogRecord]]:
    """Capture every record of haunted_house and its child loggers at DEBUG.

    The handler goes on each of them, so a child that stops propagation is
    still captured. Levels and handlers are restored afterwards.
    """
    manager = logging.root.manager
    loggers = [logging.getLogger(PACKAGE_LOGGER)] + [
        logger
        for name, logger in list(manager.loggerDict.items())
        if name.startswith(PACKAGE_LOGGER + ".") and isinstance(logger, logging.Logger)
    ]
    saved = [(logger, logger.level) for logger in loggers]
    handler = Collect()
    for logger in loggers:
        logger.setLevel(logging.DEBUG)
        logger.addHandler(handler)
    try:
        yield handler.records
    finally:
        for logger, level in saved:
            logger.removeHandler(handler)
            logger.setLevel(level)


FORMATTER = logging.Formatter("%(levelname)s %(name)s %(message)s")


def log_texts(records: list[logging.LogRecord]) -> list[tuple[str, str]]:
    out = []
    for number, record in enumerate(records, 1):
        label = f"log record {number} ({record.levelname})"
        args = record.args if isinstance(record.args, tuple) else (record.args,)
        out += [
            (f"{label} message", record.getMessage()),
            (f"{label} msg", str(record.msg)),
            (f"{label} args", repr(record.args)),
            *((f"{label} arg", str(arg)) for arg in args if arg is not None),
            (f"{label} formatted", FORMATTER.format(record)),
        ]
    return out


def exception_texts(label: str, exc: BaseException) -> list[tuple[str, str]]:
    out = [(f"{label} traceback", "".join(traceback.format_exception(exc)))]
    chain: list[BaseException] = []
    pending: list[BaseException | None] = [exc]
    while pending:
        current = pending.pop()
        if current is None or any(current is seen for seen in chain):
            continue
        chain.append(current)
        pending += [current.__cause__, current.__context__]
    for depth, current in enumerate(chain):
        where = label if depth == 0 else f"{label} chained {type(current).__name__}"
        out += [(f"{where} str", str(current)), (f"{where} repr", repr(current))]
        out += [(f"{where} arg", str(arg)) for arg in current.args]
        code = getattr(current, "code", None)
        if code is not None:
            out.append((f"{where} code", str(code)))
        out += [(f"{where} note", str(n)) for n in getattr(current, "__notes__", ())]
    return out


def value_texts(label: str, value: Any) -> list[tuple[str, str]]:
    """repr(value), plus every string in it (repr escapes some characters,
    so it alone could hide a raw secret)."""
    out = [(f"{label} repr", repr(value))]
    pending = [value]
    while pending:
        current = pending.pop()
        if isinstance(current, str):
            out.append((f"{label} string", current))
        elif isinstance(current, dict):
            for key, item in current.items():
                pending += [key, item]
        elif isinstance(current, list):
            pending += current
    return out


_UPPER_HEX_ESCAPE = re.compile(r"%[0-9A-F]{2}")


def spellings(value: str) -> list[str]:
    """`value` raw, percent-encoded as quote(safe=''), quote_plus and quote
    produce it, and each encoded form with lowercase hex digits."""
    encoded = {quote(value, safe=""), quote_plus(value), quote(value)}
    lowered = {_UPPER_HEX_ESCAPE.sub(lambda m: m.group().lower(), form) for form in encoded}
    return sorted({value} | encoded | lowered)


def outcome(exc: BaseException) -> str:
    if isinstance(exc, GatewayError):
        return f"GatewayError({exc.kind})"
    return f"escaped {type(exc).__name__}"


# Short pieces joined at runtime, so no literal looks like a credential. The
# key has no "?" or whitespace: the query strip leaves it whole, so only
# redaction can hide it. The token has both.
SAMPLE_KEY = "k3y" + "%+&=/#[]" + "\u00e9"
SAMPLE_TOK = "tk" + AWKWARD[::-1][:10]


# Feature: crew-app-foundation, Property 6: The client never reveals the secret or token
@pytest.mark.core
@given(
    secret=credentials,
    token=credentials,
    exchange_script=st.lists(exchange_steps, min_size=1, max_size=4),
    target_script=st.lists(target_steps, min_size=1, max_size=4),
    calls=calls,
)
# Refresh and retry, both answers echoing everything; the second call
# starts with the cached token.
@example(
    secret=SAMPLE_KEY,
    token=SAMPLE_TOK,
    exchange_script=[Grant(echo=True)],
    target_script=[Reply(401, "json echo", pick=4), Reply(200, "json echo", pick=10)],
    calls=[None, {"q": "x"}],
)
# Errors that carry the URL, then a 500 whose code is the decoded URL.
@example(
    secret=SAMPLE_KEY,
    token=SAMPLE_TOK,
    exchange_script=[Grant()],
    target_script=[
        Raise("connection", on_read=True),
        Raise("response"),
        Reply(500, "json echo", pick=2),
    ],
    calls=[None, None],
)
# The exchange is refused with the secret header echoed as the error code.
@example(
    secret=SAMPLE_KEY,
    token=SAMPLE_TOK,
    exchange_script=[Reply(403, "json echo", pick=0, code_key="error")],
    target_script=[Reply(200, "url")],
    calls=[None],
)
# The gateway stalls until the call's deadline.
@example(
    secret=SAMPLE_KEY,
    token=SAMPLE_TOK,
    exchange_script=[Grant()],
    target_script=[Raise("stall", on_read=True)],
    calls=[None],
)
def test_the_client_never_reveals_the_secret_or_token(
    secret, token, exchange_script, target_script, calls
):
    """**Validates: Requirements 6.4, 6.5**"""
    # The client must be able to print its own marker "[redacted]". A secret
    # or token that is part of that text (such as "redacted") is "found" in
    # every redacted string, which redact() documents it can't avoid, so
    # those examples are skipped.
    assume(secret not in MARKER and token not in MARKER)
    stalls = any(isinstance(s, Raise) and s.error == "stall" for s in exchange_script + target_script)
    timeout = STALL_TIMEOUT if stalls else DEFAULT_TIMEOUT
    session = FakeSession(token, exchange_script, target_script)
    client = GatewayClient(make_settings(secret), session, ALLOWED)
    produced: list[tuple[str, str]] = []

    async def run_calls() -> None:
        for number, body in enumerate(calls, 1):
            label = f"call {number}"
            kwargs = {} if body is None else {"body": body}
            try:
                result = await client.call("version", timeout=timeout, **kwargs)
            except Exception as exc:  # GatewayError, or anything that escapes
                event(f"{label}: {outcome(exc)}")
                produced.extend(exception_texts(f"{label} exception", exc))
            else:
                event(f"{label}: returned")
                produced.extend(value_texts(f"{label} result", result))

    with captured_logs() as records:
        asyncio.run(run_calls())
    produced.extend(log_texts(records))
    event(f"token sent to the target: {'yes' if session.sent['target'] else 'no'}")
    note(f"requests sent: {session.sent}")

    # Every call logs at least once (a request line or the failure), so an
    # empty capture means the harness is broken, not that the client is clean.
    assert len(records) >= len(calls)
    for label, text in produced:
        for what, value in (("secret", secret), ("token", token)):
            for form in spellings(value):
                assert form not in text, f"the {what} as {form!r} appears in {label}: {text!r}"
