"""Property 3 for haunted_house.core.proxy_signature: malformed input.

`verify` sits on the backend's trust boundary. For any header, secret,
method, target, body and clock it must return a Verdict without raising, and
it must never accept a header that is not "<1-12 digits>:<64 lowercase hex>".

Random digests almost never reach ACCEPT, so the near-miss headers here are
first signed with the verifier's own secret and then bent out of shape. A lax
parser (strip(), int(), lower(), a `$` anchor that allows a trailing newline,
`\\d` matching other scripts' digits) would accept some of them.
"""

import hashlib
import hmac
import re

import pytest
from hypothesis import assume, given, settings
from hypothesis import strategies as st

from haunted_house.core.proxy_signature import WINDOW_SECONDS, Verdict, verify

pytestmark = pytest.mark.core

# The design writes the shape as ^\d{1,12}:[0-9a-f]{64}$. The implementation
# reads \d as ASCII [0-9], which is stricter, and so does this test.
WELL_FORMED = re.compile(r"[0-9]{1,12}:[0-9a-f]{64}")

# Every code point, with lone surrogates mixed in often enough to show up.
ANY_CHAR = st.one_of(st.characters(codec=None), st.characters(categories=["Cs"]))
ANY_TEXT = st.text(alphabet=ANY_CHAR)
SECRETS = st.one_of(st.just(""), st.none(), st.text(), ANY_TEXT)
CLOCKS = st.floats()  # includes nan, inf and -inf

# Zero digits of other scripts (Arabic-Indic, Extended Arabic-Indic,
# Devanagari, Bengali, fullwidth, mathematical bold). int() reads them.
OTHER_ZEROS = (0x0660, 0x06F0, 0x0966, 0x09E6, 0xFF10, 0x1D7CE)
WHITESPACE = (
    " ", "\t", "\n", "\r\n", "\x0b", "\x00",
    "\u00a0", "\u2003", "\u2028", "\u3000", "\ufeff",
)
# Includes fullwidth a, Cyrillic a and Arabic-Indic zero.
NOT_HEX = ("g", "G", "x", "-", "+", " ", ":", "\x00", "\uff41", "\u0430", "\u0660")
# Includes fullwidth colon and ratio sign.
NOT_COLON = ("", "::", ";", " :", ": ", "\uff1a", "\u2236")

FLAWS = (
    # timestamp
    "extra_digits", "signed", "padded_ts", "underscore", "other_digits", "decimal", "no_ts",
    # digest
    "uppercase", "short", "long", "not_hex", "hex_prefix", "no_digest",
    # framing; a trailing "\n" gets its own flaw because `$` allows it
    "separator", "leading", "trailing", "trailing_newline",
)

# Each example picks one or two of 17 flaws, so a single flaw shows up in a
# few percent of examples. 500 examples still run in well under a second.
NEAR_MISS_EXAMPLES = 500


def _utf8(text):
    # Same encoding as the module, so lone surrogates cannot raise here.
    return text.encode("utf-8", "surrogatepass")


def gateway_digest(key, ts_text, method, target, body):
    """The documented gateway HMAC, over `ts_text` exactly as written."""
    message = f"{ts_text}:{method}:{target}:{hashlib.sha256(body).hexdigest()}"
    return hmac.new(_utf8(key), _utf8(message), hashlib.sha256).hexdigest()


def lax_number(text, fallback):
    """The number int() or float() would read from `text`, else `fallback`."""
    for parse in (int, float):
        try:
            return parse(text)
        except ValueError:
            pass
    return fallback


@st.composite
def near_miss_headers(draw, key, method, target, body):
    """Return (header, ts): a header signed with `key`, then given 1 or 2 flaws.

    `ts` is the number a lax parser would read from the timestamp, so the
    caller can put the clock inside the window for that parser.
    """
    # A list, so a repeat just means one flaw. st.sets rejects repeats, which
    # made Hypothesis throw away far more generated cases.
    flaws = set(draw(st.lists(st.sampled_from(FLAWS), min_size=1, max_size=2)))
    digits = str(draw(st.integers(min_value=0, max_value=10**12 - 1)))

    ts_text = digits
    if "extra_digits" in flaws:  # 13+ digits: same value with zeros, or huge
        pad = "0" * (13 - len(ts_text))
        ts_text = draw(st.sampled_from([pad + ts_text, ts_text + pad]))
        ts_text += draw(st.text(alphabet="0123456789", max_size=8))
    if "signed" in flaws:
        ts_text = draw(st.sampled_from("+-")) + ts_text
    if "padded_ts" in flaws:
        space = draw(st.sampled_from(WHITESPACE))
        ts_text = draw(st.sampled_from([space + ts_text, ts_text + space]))
    if "underscore" in flaws:
        at = draw(st.integers(min_value=0, max_value=len(ts_text)))
        ts_text = ts_text[:at] + "_" + ts_text[at:]
    if "other_digits" in flaws:
        zero = draw(st.sampled_from(OTHER_ZEROS))
        places = [i for i, c in enumerate(ts_text) if c in "0123456789"]
        if places:
            if not draw(st.booleans()):
                places = [draw(st.sampled_from(places))]
            chars = list(ts_text)
            for i in places:
                chars[i] = chr(zero + int(chars[i]))
            ts_text = "".join(chars)
    if "decimal" in flaws:
        ts_text += draw(st.sampled_from([".0", ".", "e0"]))
    if "no_ts" in flaws:
        ts_text = ""
    ts = lax_number(ts_text, int(digits))

    # Sign the timestamp as sent, or as a lax parser would re-render it.
    signed_ts = draw(st.sampled_from([ts_text, digits, str(int(ts))]))
    digest = gateway_digest(key, signed_ts, method, target, body)
    if "uppercase" in flaws:
        letters = [i for i, c in enumerate(digest) if c in "abcdef"]
        if letters and not draw(st.booleans()):
            at = draw(st.sampled_from(letters))
            digest = digest[:at] + digest[at].upper() + digest[at + 1 :]
        else:
            digest = digest.upper()
    if "short" in flaws:
        digest = digest[: draw(st.integers(min_value=0, max_value=63))]
    if "long" in flaws:
        digest += draw(st.text(alphabet="0123456789abcdef", min_size=1, max_size=4))
    if "not_hex" in flaws:
        at = draw(st.integers(min_value=0, max_value=max(len(digest) - 1, 0)))
        digest = digest[:at] + draw(st.sampled_from(NOT_HEX)) + digest[at + 1 :]
    if "hex_prefix" in flaws:
        digest = "0x" + digest
    if "no_digest" in flaws:
        digest = ""

    separator = ":"
    if "separator" in flaws:
        separator = draw(st.sampled_from(NOT_COLON))
    leading = ""
    if "leading" in flaws:
        leading = draw(st.sampled_from(WHITESPACE + (":", "+")))
    trailing = ""
    if "trailing" in flaws:
        trailing = draw(st.sampled_from(WHITESPACE + (":", ":" + digest)))
    if "trailing_newline" in flaws:
        trailing += "\n"
    return leading + ts_text + separator + digest + trailing, ts


@st.composite
def near_miss_calls(draw):
    """Return (header, keyword arguments) for a near miss under the real secret."""
    method = draw(ANY_TEXT)
    target = draw(ANY_TEXT)
    body = draw(st.binary())
    secret = draw(st.text(alphabet=ANY_CHAR, min_size=1))
    header, ts = draw(near_miss_headers(secret, method, target, body))
    # Mostly inside the window, or a STALE verdict would hide a lax parser.
    if draw(st.integers(min_value=0, max_value=3)):
        now = ts + draw(st.floats(min_value=-WINDOW_SECONDS, max_value=WINDOW_SECONDS))
    else:
        now = draw(CLOCKS)
    request = {"method": method, "target": target, "body": body, "secret": secret, "now": now}
    return header, request


def check_property_3(header, request):
    verdict = verify(header, **request)  # an exception fails the property

    assert isinstance(verdict, Verdict)
    if not request["secret"]:
        assert verdict is Verdict.NO_SECRET
    if header is None or WELL_FORMED.fullmatch(header) is None:
        assert verdict is not Verdict.ACCEPT


# Feature: crew-app-foundation, Property 3: Malformed input is rejected without errors
@given(
    header=st.one_of(st.none(), st.just(""), st.text(), ANY_TEXT),
    method=ANY_TEXT,
    target=ANY_TEXT,
    body=st.binary(),
    secret=SECRETS,
    now=CLOCKS,
)
def test_verify_never_raises_and_never_accepts_an_arbitrary_header(
    header, method, target, body, secret, now
):
    request = {"method": method, "target": target, "body": body, "secret": secret, "now": now}

    check_property_3(header, request)


# Feature: crew-app-foundation, Property 3: Malformed input is rejected without errors
@settings(max_examples=NEAR_MISS_EXAMPLES)
@given(near_miss_calls())
def test_verify_never_accepts_a_near_miss_signed_with_the_real_secret(call):
    check_property_3(*call)


# Feature: crew-app-foundation, Property 3: Malformed input is rejected without errors
@given(
    ts_text=st.text(alphabet="0123456789", min_size=1, max_size=12),
    digest=st.text(alphabet="0123456789abcdef", min_size=64, max_size=64),
    skew=st.one_of(st.floats(min_value=-WINDOW_SECONDS, max_value=WINDOW_SECONDS), CLOCKS),
    method=ANY_TEXT,
    target=ANY_TEXT,
    body=st.binary(),
    secret=st.text(alphabet=ANY_CHAR, min_size=1),
)
def test_a_well_formed_header_with_a_guessed_digest_is_never_accepted(
    ts_text, digest, skew, method, target, body, secret
):
    assume(digest != gateway_digest(secret, ts_text, method, target, body))

    verdict = verify(
        f"{ts_text}:{digest}",
        method=method,
        target=target,
        body=body,
        secret=secret,
        now=int(ts_text) + skew,
    )

    assert verdict in (Verdict.MISMATCH, Verdict.STALE)
