"""Check the gateway's v1 proxy signature (the `X-KiroCrew-Proxy` header).

The gateway signs every request it proxies to the backend:

    message = f"{ts}:{METHOD}:{target}:{sha256(body).hexdigest()}"
    header  = f"{ts}:{HMAC-SHA256(secret, message).hexdigest()}"

`ts` is unix seconds and `target` is the raw path plus raw query exactly as
received. The secret is the per-app value Crew passes in
`KIROCREW_PROXY_SECRET`.

Pure: no clock reads (the caller passes `now`), no I/O, no logging. Only the
v1 header is checked; the replay-proof v2 signature is not.
"""

from __future__ import annotations

import hashlib
import hmac
import re
from enum import Enum

__all__ = ["WINDOW_SECONDS", "Verdict", "sign", "verify"]

# A signature is fresh while abs(now - ts) <= WINDOW_SECONDS.
WINDOW_SECONDS = 60

# ASCII digits only: `\d` would also match other Unicode digits.
_HEADER = re.compile(r"([0-9]{1,12}):([0-9a-f]{64})")


class Verdict(Enum):
    """Outcome of `verify`. Only ACCEPT may reach a request handler."""

    ACCEPT = "accept"
    MISSING = "missing"
    MALFORMED = "malformed"
    STALE = "stale"
    MISMATCH = "mismatch"
    NO_SECRET = "no_secret"


def _utf8(text: str) -> bytes:
    # "surrogatepass" encodes every str, so lone surrogates cannot raise.
    # For any str without surrogates the bytes equal a strict UTF-8 encode,
    # which is what the gateway uses.
    return text.encode("utf-8", "surrogatepass")


def _digest(secret: str, ts_text: str, method: str, target: str, body: bytes) -> str:
    body_hash = hashlib.sha256(body).hexdigest()
    message = f"{ts_text}:{method}:{target}:{body_hash}"
    return hmac.new(_utf8(secret), _utf8(message), hashlib.sha256).hexdigest()


def sign(secret: str, ts: int, method: str, target: str, body: bytes) -> str:
    """Return the header value the gateway would send: "<ts>:<64 hex>".

    Used by tests and fakes. Raises ValueError for an empty secret or a
    negative timestamp, and TypeError if `ts` is not an int.
    """
    if not secret:
        raise ValueError("secret must be non-empty")
    if isinstance(ts, bool) or not isinstance(ts, int):
        raise TypeError("ts must be an int")
    if ts < 0:
        raise ValueError("ts must be non-negative")
    ts_text = str(ts)
    return f"{ts_text}:{_digest(secret, ts_text, method, target, body)}"


def verify(
    header: str | None,
    *,
    method: str,
    target: str,
    body: bytes,
    secret: str | None,
    now: float,
) -> Verdict:
    """Check a proxy signature header against the request it came with.

    Checks run in this order: NO_SECRET (empty or missing secret), MISSING
    (no header), MALFORMED (header is not "<1-12 digits>:<64 lowercase hex>"),
    STALE (abs(now - ts) > WINDOW_SECONDS), MISMATCH (digest differs, compared
    in constant time), otherwise ACCEPT. Never raises for str inputs.
    """
    if not secret or not isinstance(secret, str):
        return Verdict.NO_SECRET
    if header is None or header == "":
        return Verdict.MISSING
    if not isinstance(header, str):
        return Verdict.MALFORMED
    match = _HEADER.fullmatch(header)
    if match is None:
        return Verdict.MALFORMED
    ts_text, given = match.group(1), match.group(2)
    ts = int(ts_text)
    # Compare instead of subtracting: Python compares int with float exactly,
    # while `now - ts` can round a gap just over the window down to 60.0.
    # Written as "not (...)" so a NaN `now` counts as stale.
    if not (ts - WINDOW_SECONDS <= now <= ts + WINDOW_SECONDS):
        return Verdict.STALE
    # Sign the timestamp text exactly as sent: "0123" and "123" differ.
    expected = _digest(secret, ts_text, method, target, body)
    if not hmac.compare_digest(_utf8(expected), _utf8(given)):
        return Verdict.MISMATCH
    return Verdict.ACCEPT
