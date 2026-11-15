"""Property 7 for haunted_house.adapters.gateway_client: at most one token
refresh and one retry per call.

The client runs against ScriptedSession, a stand-in for aiohttp.ClientSession
with the surface the client uses: ``session.request(...)`` as an async context
manager, ``response.status`` and ``await response.read()``. Each request takes
the next outcome from one of two generated queues, one for token exchanges and
one for the target path, and is recorded with the outcome it got. An outcome
is either a status with a JSON body, or a fault raised when the request
connects or while its body is read:

- ``timeout``: asyncio.TimeoutError, as aiohttp raises for its own timeouts;
- ``server-timeout``: aiohttp.ServerTimeoutError, which is both a
  TimeoutError and an aiohttp.ClientConnectionError;
- ``connection``: aiohttp.ClientConnectionError;
- ``hang``: never answers, so the call's own deadline has to end it. Scripts
  with a hang give the call a short deadline (HANG_DEADLINE).

Each queue holds three outcomes, one more than a correct client may use, so a
third request of either kind gets an answer and is caught by the bounds
check instead of by the fake running dry.

Half the examples start with a cached token, obtained by a successful call
made before the scripted one.

``predict`` is a small model of the design (design.md, Gateway client): it
reads the script and returns the requests the client should send, and how
the call should end.
"""

import asyncio
import json
from dataclasses import dataclass
from typing import Any

import aiohttp
import pytest
from hypothesis import event, example, given, note, settings
from hypothesis import strategies as st
from yarl import URL

from haunted_house.adapters.gateway_client import (
    DEFAULT_TIMEOUT,
    ERROR_KINDS,
    GatewayClient,
    GatewayError,
    token_exchange_path,
)
from haunted_house.adapters.settings import Settings

pytestmark = pytest.mark.core

APP = "haunted-house"
APP_KEY = "app-k3y-x1"  # short on purpose: not a real credential
ORIGIN = "http://127.0.0.1:5476"
EXCHANGE_PATH = token_exchange_path(APP)
TARGET_PATH = "/api/version"
ALLOWED = [TARGET_PATH]
REFUSED = (401, 403)
STATUSES = [200, 201, 204, 301, 400, 401, 403, 404, 429, 500, 502, 503]
QUEUE_LENGTH = 3
# Short enough to keep the run fast; a call with no hang to wait for takes
# well under a millisecond against the in-memory fake.
HANG_DEADLINE = 0.05
# More than the profile's 100: an example costs under a millisecond (a hang
# costs HANG_DEADLINE), and at 100 a client that refreshed after one extra
# status, say 429, went unnoticed in about a third of runs.
MAX_EXAMPLES = 300
WARM_TOKEN = "tk-warm"
WARM_BODY = {"version": "0.0.0"}


@dataclass(frozen=True)
class Reply:
    """The gateway answers ``status`` with ``body`` as JSON."""

    status: int
    body: Any


@dataclass(frozen=True)
class Fault:
    """The request fails with ``kind`` when it connects or while its body is
    read (``at``)."""

    kind: str  # "timeout" | "server-timeout" | "connection" | "hang"
    at: str  # "connect" | "read"


TIMEOUT_FAULTS = frozenset({"timeout", "server-timeout", "hang"})
FAULT_KIND = {"timeout": "timeout", "server-timeout": "timeout", "hang": "timeout",
              "connection": "unreachable"}


def is_refused(outcome) -> bool:
    return isinstance(outcome, Reply) and outcome.status in REFUSED


def is_timeout(outcome) -> bool:
    return isinstance(outcome, Fault) and outcome.kind in TIMEOUT_FAULTS


# --- The scripted session --------------------------------------------------


@dataclass(frozen=True)
class Sent:
    """One request the client sent, and the outcome it was given."""

    path: str
    exchange: bool
    token: str | None  # the ``token`` query parameter, if any
    outcome: Any


async def fire(fault: Fault):
    if fault.kind == "hang":
        await asyncio.sleep(3600)  # cancelled by the call's deadline
    if fault.kind == "timeout":
        raise asyncio.TimeoutError()
    if fault.kind == "server-timeout":
        raise aiohttp.ServerTimeoutError("scripted read timeout")
    raise aiohttp.ClientConnectionError("scripted connection failure")


class ScriptedResponse:
    def __init__(self, outcome) -> None:
        self._outcome = outcome
        # A fault while reading still comes after a status line.
        self.status = outcome.status if isinstance(outcome, Reply) else 200

    async def read(self) -> bytes:
        if isinstance(self._outcome, Fault):
            await fire(self._outcome)
        return json.dumps(self._outcome.body).encode()


class ScriptedRequest:
    def __init__(self, outcome) -> None:
        self._outcome = outcome

    async def __aenter__(self) -> ScriptedResponse:
        if isinstance(self._outcome, Fault) and self._outcome.at == "connect":
            await fire(self._outcome)
        return ScriptedResponse(self._outcome)

    async def __aexit__(self, *exc_info) -> bool:
        return False


class ScriptedSession:
    """Answers each request with the next outcome from its queue: exchange
    requests from ``exchanges``, all others from ``targets``. Records every
    request in ``sent``."""

    def __init__(self, exchanges, targets) -> None:
        self.load(exchanges, targets)

    def load(self, exchanges, targets) -> None:
        self._queues = {True: list(exchanges), False: list(targets)}
        self.sent: list[Sent] = []

    def request(self, method, url, **kwargs) -> ScriptedRequest:
        url = URL(url)
        exchange = url.path == EXCHANGE_PATH
        queue = self._queues[exchange]
        if not queue:
            raise LookupError(
                f"unscripted request: {method} {url.path} after {len(self.sent)} requests"
            )
        outcome = queue.pop(0)
        self.sent.append(Sent(url.path, exchange, url.query.get("token"), outcome))
        return ScriptedRequest(outcome)


# --- The model -------------------------------------------------------------


class _End(Exception):
    def __init__(self, kind: str, status: int | None = None) -> None:
        self.kind = kind
        self.status = status


def predict(cached_token: str | None, exchanges, targets):
    """What the design says one call does with this script.

    Returns (requests, end). ``requests`` lists ("exchange", None) and
    ("target", token) in the order they are sent. ``end`` is ("ok", body), or
    (kind, status) for a GatewayError.
    """
    exchanges, targets = iter(exchanges), iter(targets)
    requests = []
    token = cached_token

    def answer(outcome):
        if isinstance(outcome, Fault):
            raise _End(FAULT_KIND[outcome.kind])
        return outcome.status, outcome.body

    def send_target():
        nonlocal token
        if token is None:  # get a token on first need
            requests.append(("exchange", None))
            status, body = answer(next(exchanges))
            if status in REFUSED:
                raise _End("denied", status)
            if not 200 <= status < 300:
                raise _End("http", status)
            issued = body.get("token") if isinstance(body, dict) else None
            if not isinstance(issued, str) or not issued:
                raise _End("http", status)
            token = issued
        requests.append(("target", token))
        status, body = answer(next(targets))
        if status in REFUSED:
            token = None  # drop it; the retry gets a new one
        return status, body

    try:
        status, body = send_target()
        if status in REFUSED:
            status, body = send_target()  # the one retry
            if status in REFUSED:
                raise _End("denied", status)
        if not 200 <= status < 300 or not isinstance(body, dict):
            raise _End("http", status)
        return requests, ("ok", body)
    except _End as end:
        return requests, (end.kind, end.status)


# --- Strategies ------------------------------------------------------------

# Tokens and body strings use disjoint alphabets, so redaction of tokens in
# the returned object never changes a body the test compares against.
tokens = st.text("abcdefghijklmnopqrstuvwxyz0123456789", min_size=1, max_size=8).map(
    lambda s: "tk-" + s
)
not_tokens = st.one_of(
    st.just(""),
    st.none(),
    st.integers(),
    st.booleans(),
    st.lists(st.integers(), max_size=2),
    st.just({"token": "nested"}),
)
error_bodies = st.sampled_from([{}, {"error": "token_expired"}, {"code": "internal"}])
exchange_bodies = st.one_of(
    tokens.map(lambda t: {"token": t}),
    not_tokens.map(lambda t: {"token": t}),  # present but not a usable string
    error_bodies,  # no token at all
)
versions = st.text("0123456789.", max_size=8)
target_bodies = st.one_of(
    versions.map(lambda v: {"version": v}),
    error_bodies,
    st.lists(st.integers(0, 9), max_size=2),  # JSON, but not an object
)
statuses = st.sampled_from(STATUSES)
faults = st.builds(
    Fault,
    st.sampled_from(["timeout", "server-timeout", "connection", "hang"]),
    st.sampled_from(["connect", "read"]),
)

# Successful exchanges and refused targets are drawn more often than chance
# alone would give, so a good share of calls reach the retry. Every status
# still turns up on the first target request a few times per run, which is
# what catches a client that refreshes after some other status.
exchange_outcomes = st.one_of(
    st.builds(Reply, st.just(200), tokens.map(lambda t: {"token": t})),
    st.builds(Reply, st.just(200), tokens.map(lambda t: {"token": t})),
    st.builds(Reply, statuses, exchange_bodies),
    faults,
)
target_outcomes = st.one_of(
    st.builds(Reply, statuses, target_bodies),
    st.builds(Reply, statuses, target_bodies),
    st.builds(Reply, st.sampled_from(REFUSED), error_bodies),
    st.builds(Reply, st.sampled_from(REFUSED), error_bodies),
    faults,
)
queues = {
    "exchanges": st.lists(exchange_outcomes, min_size=QUEUE_LENGTH, max_size=QUEUE_LENGTH),
    "targets": st.lists(target_outcomes, min_size=QUEUE_LENGTH, max_size=QUEUE_LENGTH),
}


# --- Running one call ------------------------------------------------------


def make_client(session: ScriptedSession) -> GatewayClient:
    config = Settings(port=1, secret=APP_KEY, gateway_origin=ORIGIN, app_name=APP)
    return GatewayClient(config, session, ALLOWED)


def run_call(cached: bool, exchanges, targets):
    """Return (result or GatewayError, requests sent by the scripted call)."""
    scripted = list(exchanges) + list(targets)
    timeout = HANG_DEADLINE if any(
        isinstance(o, Fault) and o.kind == "hang" for o in scripted
    ) else DEFAULT_TIMEOUT

    async def go():
        session = ScriptedSession([Reply(200, {"token": WARM_TOKEN})], [Reply(200, WARM_BODY)])
        client = make_client(session)
        if cached:
            assert await client.call("version") == WARM_BODY
            assert [(s.exchange, s.token) for s in session.sent] == [
                (True, None),
                (False, WARM_TOKEN),
            ]
        session.load(exchanges, targets)
        try:
            result = await client.call("version", timeout=timeout)
        except GatewayError as error:
            result = error
        return result, session.sent

    return asyncio.run(go())


# Feature: crew-app-foundation, Property 7: At most one token refresh and one retry per call
@settings(max_examples=MAX_EXAMPLES)
@given(cached=st.booleans(), **queues)
# A server error is not a token problem: no refresh, no retry.
@example(
    cached=True,
    exchanges=[Reply(200, {"token": "tk-a"}), Reply(200, {"token": "tk-b"}), Reply(200, {"token": "tk-c"})],
    targets=[Reply(503, {"code": "busy"}), Reply(200, {}), Reply(200, {})],
)
# Refused once, refreshed, retried with the new token, then answered.
@example(
    cached=False,
    exchanges=[Reply(200, {"token": "tk-a"}), Reply(200, {"token": "tk-b"}), Reply(200, {"token": "tk-c"})],
    targets=[Reply(401, {"error": "token_expired"}), Reply(200, {"version": "0.12.1"}), Reply(200, {})],
)
# A cached token refused twice: one refresh, then denied.
@example(
    cached=True,
    exchanges=[Reply(200, {"token": "tk-a"}), Reply(200, {"token": "tk-b"}), Reply(200, {"token": "tk-c"})],
    targets=[Reply(403, {}), Reply(403, {"error": "forbidden"}), Reply(200, {})],
)
# The retry times out while its body is read.
@example(
    cached=False,
    exchanges=[Reply(200, {"token": "tk-a"}), Reply(200, {"token": "tk-b"}), Reply(200, {"token": "tk-c"})],
    targets=[Reply(401, {}), Fault("timeout", "read"), Reply(200, {})],
)
# The refresh exchange never answers: the call's deadline ends it.
@example(
    cached=True,
    exchanges=[Fault("hang", "connect"), Reply(200, {"token": "tk-b"}), Reply(200, {"token": "tk-c"})],
    targets=[Reply(401, {}), Reply(200, {}), Reply(200, {})],
)
# aiohttp's read timeout is also a connection error; it must count as a timeout.
@example(
    cached=True,
    exchanges=[Reply(200, {"token": "tk-a"}), Reply(200, {"token": "tk-b"}), Reply(200, {"token": "tk-c"})],
    targets=[Fault("server-timeout", "connect"), Reply(200, {}), Reply(200, {})],
)
# An exchange answer whose token is not a string.
@example(
    cached=False,
    exchanges=[Reply(200, {"token": 7}), Reply(200, {"token": "tk-b"}), Reply(200, {"token": "tk-c"})],
    targets=[Reply(200, {}), Reply(200, {}), Reply(200, {})],
)
def test_one_call_refreshes_at_most_once_and_retries_at_most_once(cached, exchanges, targets):
    """**Validates: Requirements 6.1, 6.3, 6.5**"""
    result, sent = run_call(cached, exchanges, targets)
    note(f"sent={sent!r}")
    note(f"result={result!r} kind={getattr(result, 'kind', None)!r}")

    target_requests = [s for s in sent if not s.exchange]
    exchange_requests = [s for s in sent if s.exchange]
    event(f"cached token: {cached}")
    event(f"targets={len(target_requests)} exchanges={len(exchange_requests)}")
    event(f"result: {'dict' if isinstance(result, dict) else result.kind}")
    if sent and isinstance(sent[-1].outcome, Fault):
        event(f"last request: {sent[-1].outcome.kind} at {sent[-1].outcome.at}")

    # 1. At most two target requests and two exchanges, all to the right paths.
    assert len(target_requests) <= 2
    assert len(exchange_requests) <= 2
    assert all(s.path == TARGET_PATH for s in target_requests)

    # 2. A second target request only after a 401 or 403 on the first.
    if len(target_requests) == 2:
        assert is_refused(target_requests[0].outcome)

    # 3. Refresh only after a 401 or 403: an exchange is either the call's
    # first request when it starts without a token, or comes right after a
    # refused target request.
    for index, request in enumerate(sent):
        if not request.exchange:
            continue
        if index == 0 and not cached:
            continue
        previous = sent[index - 1] if index > 0 else None
        assert previous is not None and not previous.exchange and is_refused(previous.outcome), (
            f"exchange #{index} does not follow a refused target request"
        )

    # 4. A request that timed out (or hung) ends the call with a timeout error,
    # and nothing is sent after it.
    timed_out = [index for index, s in enumerate(sent) if is_timeout(s.outcome)]
    if timed_out:
        assert isinstance(result, GatewayError) and result.kind == "timeout"
        assert timed_out == [len(sent) - 1]

    # 5. The call returns a dict or raises a GatewayError of a known kind
    # (anything else would have propagated out of run_call).
    assert isinstance(result, dict) or (
        isinstance(result, GatewayError) and result.kind in ERROR_KINDS
    )

    # The model: the same requests, with the same tokens, ending the same way.
    expected_requests, expected_end = predict(
        WARM_TOKEN if cached else None, exchanges, targets
    )
    actual_requests = [("exchange" if s.exchange else "target", s.token) for s in sent]
    assert actual_requests == expected_requests
    if isinstance(result, dict):
        assert ("ok", result) == expected_end
    else:
        assert (result.kind, result.status) == expected_end
