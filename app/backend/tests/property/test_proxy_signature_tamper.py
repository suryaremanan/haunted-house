"""Property 2 for haunted_house.core.proxy_signature.

Signs a request, makes exactly one change to it, and verifies the changed
request with `now` equal to the original timestamp, so the change is the only
thing that can make it fail. Every change keeps the header well-formed and
fresh, so the verdict must be MISMATCH, not just "anything but ACCEPT".
"""

from dataclasses import dataclass, replace

import pytest
from hypothesis import assume, event, given, note
from hypothesis import strategies as st

from haunted_house.core.proxy_signature import WINDOW_SECONDS, Verdict, sign, verify

pytestmark = pytest.mark.core

MAX_TS = 10**12 - 1  # largest timestamp that fits the header's 12 digits
TS_DIGITS = 12
HEX = "0123456789abcdef"
HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]

# Any code point, lone surrogates included: verify() encodes with
# "surrogatepass", so they must not raise or collide.
any_char = st.characters(exclude_categories=())

# Secrets come from the KIROCREW_PROXY_SECRET environment variable, which
# cannot hold NUL. NUL is also excluded because HMAC pads keys shorter than
# its 64-byte block with zero bytes, so "k" and "k\0" are the same HMAC key.
secret_char = st.characters(exclude_categories=(), exclude_characters="\x00")
# At most 15 code points, plus one appended by changed_value(): <= 64 UTF-8
# bytes, so HMAC never pre-hashes a key (it does that above 64 bytes).
secrets = st.text(secret_char, min_size=1, max_size=15)

methods = st.one_of(st.sampled_from(HTTP_METHODS), st.text(any_char, max_size=10))
targets = st.one_of(
    # Realistic raw path plus query: printable ASCII after "/api/".
    st.text(st.characters(min_codepoint=0x21, max_codepoint=0x7E), max_size=40).map(
        lambda rest: "/api/" + rest
    ),
    st.text(any_char, max_size=40),
)
bodies = st.binary(max_size=256)
timestamps = st.one_of(
    st.integers(min_value=1_600_000_000, max_value=2_100_000_000),  # real unix times
    st.integers(min_value=0, max_value=MAX_TS),
)


@dataclass(frozen=True)
class Request:
    secret: str
    ts: int
    method: str
    target: str
    body: bytes
    header: str


@st.composite
def signed_requests(draw):
    secret, ts = draw(secrets), draw(timestamps)
    method, target, body = draw(methods), draw(targets), draw(bodies)
    header = sign(secret, ts, method, target, body)
    return Request(secret, ts, method, target, body, header)


@st.composite
def changed_timestamp_text(draw, original):
    """A different timestamp text whose value stays inside the window."""
    ts_text = str(original.ts)
    low = max(-WINDOW_SECONDS, -original.ts)
    high = min(WINDOW_SECONDS, MAX_TS - original.ts)
    # Shift 0 with leading zeros gives the "0123" vs "123" case.
    shift = draw(st.one_of(st.just(0), st.integers(min_value=low, max_value=high)))
    value_text = str(original.ts + shift)
    zeros = draw(st.integers(min_value=0, max_value=TS_DIGITS - len(value_text)))
    new_text = "0" * zeros + value_text
    assume(new_text != ts_text)
    return new_text


@st.composite
def changed_digest(draw, digest):
    """The digest with one hex digit replaced by a different hex digit."""
    index = draw(st.integers(min_value=0, max_value=len(digest) - 1))
    step = draw(st.integers(min_value=1, max_value=len(HEX) - 1))
    digit = HEX[(HEX.index(digest[index]) + step) % len(HEX)]
    return digest[:index] + digit + digest[index + 1 :]


@st.composite
def changed_value(draw, original, unrelated, element):
    """A str or bytes value other than `original`.

    Either an unrelated draw, or `original` one element longer or shorter,
    so near misses like "GET" vs "GETx" are covered too.
    """
    value = draw(
        st.one_of(
            unrelated,
            element.map(lambda extra: original + extra),
            st.just(original[:-1]),
        )
    )
    assume(value != original)
    return value


@st.composite
def tampered_requests(draw):
    """Return (kind, original, changed) where exactly one field differs."""
    original = draw(signed_requests())
    ts_text, _, digest = original.header.partition(":")
    kind = draw(
        st.sampled_from(["method", "target", "body", "timestamp", "digest", "secret"])
    )
    if kind == "method":
        change = {"method": draw(changed_value(original.method, methods, any_char))}
    elif kind == "target":
        change = {"target": draw(changed_value(original.target, targets, any_char))}
    elif kind == "body":
        one_byte = st.binary(min_size=1, max_size=1)
        change = {"body": draw(changed_value(original.body, bodies, one_byte))}
    elif kind == "timestamp":
        change = {"header": f"{draw(changed_timestamp_text(original))}:{digest}"}
    elif kind == "digest":
        change = {"header": f"{ts_text}:{draw(changed_digest(digest))}"}
    else:
        # Dropping the last character of a 1-character secret would give the
        # empty secret, which is NO_SECRET rather than a different secret.
        other = draw(changed_value(original.secret, secrets, secret_char))
        assume(other != "")
        change = {"secret": other}
    return kind, original, replace(original, **change)


def check(request, *, now):
    return verify(
        request.header,
        method=request.method,
        target=request.target,
        body=request.body,
        secret=request.secret,
        now=now,
    )


# Feature: crew-app-foundation, Property 2: Any change to a signed request is rejected
@given(tampered_requests())
def test_any_single_change_to_a_signed_request_is_rejected(case):
    """**Validates: Requirements 5.3, 5.5**"""
    kind, original, changed = case
    event(f"changed {kind}")
    note(f"original={original!r}")
    note(f"changed={changed!r}")

    # Control: unchanged, the request is accepted at this `now`.
    assert check(original, now=original.ts) is Verdict.ACCEPT

    verdict = check(changed, now=original.ts)

    assert verdict is not Verdict.ACCEPT
    assert verdict is Verdict.MISMATCH
