"""Property 1 for haunted_house.core.proxy_signature: the time window.

A header produced by `sign` gets exactly one of two verdicts from `verify`:
ACCEPT while the verifier's clock is within WINDOW_SECONDS of the signed
timestamp, STALE otherwise.
"""

import math
from fractions import Fraction

import pytest
from hypothesis import event, example, given, strategies as st

from haunted_house.core.proxy_signature import WINDOW_SECONDS, Verdict, sign, verify

pytestmark = pytest.mark.core

# The header carries at most 12 timestamp digits.
MAX_TS = 10**12 - 1

HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]

secret_texts = st.text(min_size=1)
methods = st.one_of(st.sampled_from(HTTP_METHODS), st.text())
targets = st.text().map(lambda rest: "/" + rest)
bodies = st.binary()
timestamps = st.integers(min_value=0, max_value=MAX_TS)

# Magnitudes on, just inside and just outside the window's edge.
_EDGE_MAGNITUDES = [
    60.0,
    60.000001,
    59.999999,
    math.nextafter(60.0, math.inf),
    math.nextafter(60.0, 0.0),
]

# Offsets from ts, concentrated around +-WINDOW_SECONDS.
offsets = st.one_of(
    st.integers(min_value=-2 * WINDOW_SECONDS, max_value=2 * WINDOW_SECONDS),
    st.sampled_from([d * m for m in _EDGE_MAGNITUDES for d in (1, -1)]),
    st.floats(min_value=59.0, max_value=61.0).flatmap(
        lambda m: st.sampled_from([m, -m])
    ),
    st.floats(min_value=-1e13, max_value=1e13),
)


@st.composite
def clock_readings(draw):
    """Draw (ts, now), with most `now` values near the edges of the window."""
    ts = draw(timestamps)
    low = float(ts - WINDOW_SECONDS)  # exact: ts is far below 2**53
    high = float(ts + WINDOW_SECONDS)
    # Each edge, plus the neighbouring float on either side of it.
    edge_floats = [
        x
        for edge in (low, high)
        for x in (math.nextafter(edge, -math.inf), edge, math.nextafter(edge, math.inf))
    ]
    now = draw(
        st.one_of(
            offsets.map(lambda offset: ts + offset),
            st.sampled_from(edge_floats),
            st.floats(),  # anything, including inf, -inf and nan
        )
    )
    return ts, now


def inside_window(ts: int, now: float) -> bool:
    """abs(now - ts) <= WINDOW_SECONDS in exact arithmetic."""
    if math.isnan(now) or math.isinf(now):
        return False
    return abs(Fraction(now) - ts) <= WINDOW_SECONDS


# Feature: crew-app-foundation, Property 1: Signatures are accepted only inside the time window
@given(
    secret=secret_texts,
    method=methods,
    target=targets,
    body=bodies,
    clock=clock_readings(),
)
# 60 s plus about 1.1e-16 s before ts: stale, though a float subtraction
# rounds the gap to exactly 60.0.
@example(
    secret="k",
    method="GET",
    target="/",
    body=b"",
    clock=(61, math.nextafter(1.0, -math.inf)),
)
# The largest timestamp the header allows, at the far edge of the window.
@example(
    secret="k",
    method="POST",
    target="/api/whoami",
    body=b"{}",
    clock=(MAX_TS, float(MAX_TS + WINDOW_SECONDS)),
)
def test_a_genuine_signature_is_accepted_only_inside_the_window(
    secret, method, target, body, clock
):
    """**Validates: Requirements 5.2, 5.3**"""
    ts, now = clock
    header = sign(secret, ts, method, target, body)

    verdict = verify(
        header, method=method, target=target, body=body, secret=secret, now=now
    )

    expected = Verdict.ACCEPT if inside_window(ts, now) else Verdict.STALE
    event(expected.name)
    assert verdict is expected
