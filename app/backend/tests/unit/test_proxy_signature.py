"""Example tests for haunted_house.core.proxy_signature.

The Hypothesis property tests for Properties 1 to 3 live in tests/property/.
"""

import hashlib
import hmac

import pytest

from haunted_house.core.proxy_signature import WINDOW_SECONDS, Verdict, sign, verify

pytestmark = pytest.mark.core

KEY = "k3y-for-tests"  # short on purpose: not a real credential
TS = 1_731_400_000
METHOD = "POST"
TARGET = "/api/whoami?b=2&a=1"
BODY = b'{"hello":"world"}'


def check(header, *, method=METHOD, target=TARGET, body=BODY, secret=KEY, now=TS):
    return verify(header, method=method, target=target, body=body, secret=secret, now=now)


def test_sign_matches_a_digest_computed_directly_with_hmac():
    message = f"{TS}:{METHOD}:{TARGET}:{hashlib.sha256(BODY).hexdigest()}"
    digest = hmac.new(KEY.encode(), message.encode(), hashlib.sha256).hexdigest()

    assert sign(KEY, TS, METHOD, TARGET, BODY) == f"{TS}:{digest}"


def test_known_answer_header_is_accepted():
    message = f"{TS}:GET:/api/version:{hashlib.sha256(b'').hexdigest()}"
    digest = hmac.new(KEY.encode(), message.encode(), hashlib.sha256).hexdigest()

    verdict = check(f"{TS}:{digest}", method="GET", target="/api/version", body=b"")

    assert verdict is Verdict.ACCEPT


@pytest.mark.parametrize("skew", [0, 1, -1, WINDOW_SECONDS, -WINDOW_SECONDS, 59.999])
def test_accepts_inside_the_window(skew):
    assert check(sign(KEY, TS, METHOD, TARGET, BODY), now=TS + skew) is Verdict.ACCEPT


@pytest.mark.parametrize("skew", [61, -61, 60.001, -60.001, 10**9, float("inf"), float("nan")])
def test_rejects_outside_the_window_as_stale(skew):
    assert check(sign(KEY, TS, METHOD, TARGET, BODY), now=TS + skew) is Verdict.STALE


@pytest.mark.parametrize(
    "change",
    [
        {"method": "GET"},
        {"target": "/api/whoami?a=1&b=2"},
        {"target": "/api/whoami"},
        {"body": b'{"hello":"World"}'},
        {"body": b""},
        {"secret": "other-key"},
    ],
)
def test_rejects_a_changed_request_as_mismatch(change):
    assert check(sign(KEY, TS, METHOD, TARGET, BODY), **change) is Verdict.MISMATCH


def test_rejects_a_changed_digest_as_mismatch():
    header = sign(KEY, TS, METHOD, TARGET, BODY)
    flipped = header[:-1] + ("0" if header[-1] != "0" else "1")

    assert check(flipped) is Verdict.MISMATCH


def test_leading_zero_timestamp_is_a_different_signature():
    header = sign(KEY, TS, METHOD, TARGET, BODY)

    assert check("0" + header) is Verdict.MISMATCH


@pytest.mark.parametrize(
    "header",
    [
        "garbage",
        ":" + "a" * 64,
        f"{TS}",
        f"{TS}:",
        f"{TS}:" + "a" * 63,
        f"{TS}:" + "a" * 65,
        f"{TS}:" + "A" * 64,
        f"{TS}:" + "g" * 64,
        "1" * 13 + ":" + "a" * 64,
        f"-{TS}:" + "a" * 64,
        f" {TS}:" + "a" * 64,
        f"{TS}:" + "a" * 64 + "\n",
        "١٢٣:" + "a" * 64,  # Arabic-Indic digits match \d but not [0-9]
        f"{TS}:" + "a" * 63 + "\ud800",  # lone surrogate
    ],
)
def test_rejects_badly_shaped_headers_as_malformed(header):
    assert check(header) is Verdict.MALFORMED


@pytest.mark.parametrize("header", [None, ""])
def test_rejects_an_absent_header_as_missing(header):
    assert check(header) is Verdict.MISSING


@pytest.mark.parametrize("secret", [None, ""])
def test_rejects_everything_when_the_secret_is_absent(secret):
    signed = sign(KEY, TS, METHOD, TARGET, BODY)

    assert check(signed, secret=secret) is Verdict.NO_SECRET
    assert check(None, secret=secret) is Verdict.NO_SECRET
    assert check("garbage", secret=secret) is Verdict.NO_SECRET


def test_unicode_and_surrogates_in_the_request_do_not_raise():
    target = "/api/caf\u00e9?q=\ud800"
    header = sign("cl\u00e9-\udfff", TS, METHOD, target, BODY)

    assert check(header, target=target, secret="cl\u00e9-\udfff") is Verdict.ACCEPT
    assert check(header, target="/api/caf\u00e9", secret="cl\u00e9-\udfff") is Verdict.MISMATCH


@pytest.mark.parametrize(
    "secret, ts, error",
    [("", TS, ValueError), (KEY, -1, ValueError), (KEY, 1.5, TypeError)],
)
def test_sign_refuses_bad_arguments(secret, ts, error):
    with pytest.raises(error):
        sign(secret, ts, METHOD, TARGET, BODY)
