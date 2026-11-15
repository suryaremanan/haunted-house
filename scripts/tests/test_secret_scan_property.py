"""Property test for scripts/secret_scan.py: credentials are found, never printed.

**Validates: Requirements 10.1, 10.2, 11.4**

Every credential is generated at runtime, and the few rule keywords below are
split into fragments, so this file never trips the scan itself
(test_this_file_passes_the_scan).
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
import string
import sys
import tempfile
from pathlib import Path
from typing import List, NamedTuple, Tuple
from unittest import mock

import pytest
from hypothesis import assume, given
from hypothesis import strategies as st

SCRIPT = Path(__file__).resolve().parents[1] / "secret_scan.py"


def _load_scanner():
    if "secret_scan" in sys.modules:
        return sys.modules["secret_scan"]
    spec = importlib.util.spec_from_file_location("secret_scan", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules["secret_scan"] = module  # dataclasses look the module up here
    spec.loader.exec_module(module)
    return module


ss = _load_scanner()

NAME = "notes.txt"  # not a fixture and not an .app_secret file
RULE_NAMES = sorted(name for name, _ in ss.PATTERNS)

# Text the scanner prints whatever it scans. A secret that happens to contain
# a piece of it (say "token" inside a random value) is a coincidence, not a leak.
FIXED_OUTPUT = "\n".join([ss.HOOK_MESSAGE.format(names=""), *RULE_NAMES])

ALNUM = string.ascii_letters + string.digits
UPPER_DIGITS = string.ascii_uppercase + string.digits
B64URL = ALNUM + "-_"
# Characters a captured value may hold. No quotes, whitespace, brackets,
# commas or semicolons (they end a value) and no colon (it could form "://").
VALUE_CHARS = ALNUM + "-_.+=/~!@#%^&|?"
PRINTABLE = "".join(c for c in string.printable if c not in "\n\r\x0b\x0c")

# Values the scanner skips on purpose (see is_placeholder): masks, placeholder
# words, env lookups, env var names and, unquoted, code references.
_MASK = set("x*.-_#0")
_SKIP_WORDS = (
    "redacted", "placeholder", "changeme", "example",
    "environ", "process.env", "getenv", "import.meta.env",
)
_ENV_NAME_CHARS = set(UPPER_DIGITS + "_")
_CODE_REF_CHARS = set(string.ascii_letters + "_$.")


class Credential(NamedTuple):
    rule: str
    text: str  # what goes into the file
    secret: str  # the part that must never be printed


def _is_real_value(value: str, quoted: bool) -> bool:
    lowered = value.lower()
    if len(set(value)) < 2 or set(lowered) <= _MASK:
        return False
    if any(word in lowered for word in _SKIP_WORDS):
        return False
    if "_" in value and set(value) <= _ENV_NAME_CHARS:
        return False
    if not quoted and set(value) <= _CODE_REF_CHARS:
        return False
    return True


def _pieces_in(secret: str, output: str) -> List[str]:
    """Every 5-character substring of `secret` that appears in `output`."""
    return sorted({secret[i : i + 5] for i in range(len(secret) - 4) if secret[i : i + 5] in output})


# --- Credential generators, one per rule ---------------------------------------

OPT_QUOTE = st.sampled_from(["", '"', "'"])
SPACE = st.sampled_from(["", " ", "  ", "\t"])


@st.composite
def _value(draw, min_size: int, quoted: bool) -> str:
    value = draw(st.sampled_from(ALNUM)) + draw(st.text(VALUE_CHARS, min_size=min_size - 1, max_size=48))
    assume(_is_real_value(value, quoted))
    return value


@st.composite
def _any_case(draw, word: str) -> str:
    flips = draw(st.lists(st.booleans(), min_size=len(word), max_size=len(word)))
    return "".join(c.swapcase() if flip else c for c, flip in zip(word, flips))


@st.composite
def _private_key(draw) -> Credential:
    kind = draw(st.text(UPPER_DIGITS, max_size=10))
    block = draw(st.sampled_from(["", " BLOCK"]))
    dashes = "-" * 5
    header = dashes + "BEGIN " + (kind + " " if kind else "") + "PRIV" + "ATE KEY" + block + dashes
    return Credential("private-key", header, header)


@st.composite
def _aws_key_id(draw) -> Credential:
    key = draw(st.sampled_from(["AK", "AS"])) + "IA" + draw(st.text(UPPER_DIGITS, min_size=16, max_size=16))
    return Credential("aws-access-key-id", key, key)


@st.composite
def _github_token(draw) -> Credential:
    if draw(st.booleans()):
        token = "gh" + draw(st.sampled_from("pousr")) + "_" + draw(st.text(ALNUM, min_size=36, max_size=60))
    else:
        token = "git" + "hub_pat_" + draw(st.text(ALNUM + "_", min_size=22, max_size=82))
    return Credential("gh-token", token, token)


@st.composite
def _slack_token(draw) -> Credential:
    token = "xo" + "x" + draw(st.sampled_from("abprs")) + "-" + draw(st.text(ALNUM + "-", min_size=10, max_size=60))
    return Credential("slack-token", token, token)


@st.composite
def _jwt(draw) -> Credential:
    head = draw(st.text(B64URL, min_size=8, max_size=60))
    body = draw(st.text(B64URL, min_size=2, max_size=60))
    signature = draw(st.text(B64URL, min_size=8, max_size=60))
    token = "ey" + "J" + head + "." + body + "." + signature
    return Credential("jwt", token, token)


@st.composite
def _assignment(draw, name: str, ops: List[str], min_size: int) -> Tuple[str, str]:
    """`name <op> value` with optional quotes around the name and the value."""
    name_quote, value_quote = draw(OPT_QUOTE), draw(OPT_QUOTE)
    value = draw(_value(min_size, quoted=bool(value_quote)))
    op = draw(st.sampled_from(ops))
    text = name_quote + name + name_quote + draw(SPACE) + op + draw(SPACE) + value_quote + value + value_quote
    return text, value


@st.composite
def _proxy_env(draw) -> Credential:
    export = draw(st.sampled_from(["", "export "]))
    text, value = draw(_assignment("KIROCREW_PROXY" + "_SECRET", ["=", ":"], 8))
    return Credential("crew-proxy-env", export + text, value)


@st.composite
def _app_header(draw) -> Credential:
    name = draw(_any_case("X-App" + "-Secret"))
    text, value = draw(_assignment(name, [":"], 8))
    return Credential("crew-auth-header", text, value)


@st.composite
def _dashboard_cookie(draw) -> Credential:
    kind = draw(st.sampled_from(["tok" + "en", "refresh"]))
    name = "mc" + "_" + kind + "_" + str(draw(st.integers(0, 65535)))
    text, value = draw(_assignment(name, ["=", ":", "\t"], 16))
    return Credential("crew-dashboard-cookie", text, value)


@st.composite
def _hardcoded(draw) -> Credential:
    word = draw(st.sampled_from(["api" + "_key", "api" + "-key", "api" + "key", "sec" + "ret", "tok" + "en", "pass" + "word"]))
    parts = draw(st.lists(st.tuples(st.sampled_from("_-"), st.text(ALNUM, min_size=1, max_size=6)), max_size=2))
    key = draw(_any_case(word)) + "".join(sep + part for sep, part in parts)
    key_quote = draw(OPT_QUOTE)
    op = draw(st.sampled_from(["=", ":", ":=", "=>"]))
    quote = draw(st.sampled_from(['"', "'"]))
    value = draw(_value(16, quoted=True))
    text = key_quote + key + key_quote + draw(SPACE) + op + draw(SPACE) + quote + value + quote
    return Credential("hardcoded-credential", text, value)


CREDENTIALS = {
    "private-key": _private_key(),
    "aws-access-key-id": _aws_key_id(),
    "gh-token": _github_token(),
    "slack-token": _slack_token(),
    "jwt": _jwt(),
    "crew-proxy-env": _proxy_env(),
    "crew-auth-header": _app_header(),
    "crew-dashboard-cookie": _dashboard_cookie(),
    "hardcoded-credential": _hardcoded(),
}

# --- Surrounding text ------------------------------------------------------------

# Rule keywords and prefixes on their own, so the surroundings sit close to a match.
_NEAR_MISSES = st.sampled_from(
    [
        "tok" + "en", "sec" + "ret", "pass" + "word", "api" + "_key", " = ", ": ", "=", '"', "'",
        "AK" + "IA", "ey" + "J", "gh" + "p_", "xo" + "xb-", "-" * 5, "BEGIN",
        "KIROCREW_PROXY" + "_SECRET", "X-App" + "-Secret", "mc_" + "token_80",
    ]
)
_WORD = st.one_of(
    st.text(PRINTABLE, max_size=12),
    st.text(st.characters(codec="utf-8", exclude_categories=("Cc", "Cs")), max_size=12),
    _NEAR_MISSES,
)
_LINE = st.lists(_WORD, max_size=6).map("".join)
_GAP = st.sampled_from([" ", "\t", "  "])


@st.composite
def _placed(draw, credential: str) -> Tuple[str, str, int]:
    """(surroundings alone, surroundings with the credential, 1-based line)."""
    lines = draw(st.lists(_LINE, min_size=1, max_size=8))
    index = draw(st.integers(0, len(lines) - 1))
    line = lines[index]
    column = draw(st.integers(0, len(line)))
    # Whitespace on each side keeps the credential from gluing to its neighbors.
    left = line[:column] + (draw(_GAP) if column > 0 else "")
    right = (draw(_GAP) if column < len(line) else "") + line[column:]
    with_credential = lines[:index] + [left + credential + right] + lines[index + 1 :]
    return "\n".join(lines), "\n".join(with_credential), index + 1


# --- Running the command line in-process ---------------------------------------------


def _run_main(argv: List[str], stdin: bytes = b"") -> Tuple[int, str, str]:
    out, err = io.StringIO(), io.StringIO()
    fake_stdin = io.TextIOWrapper(io.BytesIO(stdin), encoding="utf-8")
    with mock.patch.object(sys, "stdin", fake_stdin), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        status = ss.main(argv)
    return status, out.getvalue(), err.getvalue()


# --- Tests -------------------------------------------------------------------------


def test_every_rule_has_a_credential_generator():
    assert sorted(CREDENTIALS) == RULE_NAMES


def test_this_file_passes_the_scan():
    assert ss.scan_file(__file__) == []


# Feature: crew-app-foundation, Property 9: The secret scan finds credentials without printing them
@pytest.mark.parametrize("rule", RULE_NAMES)
@given(data=st.data())
def test_secret_scan_finds_credentials_without_printing_them(rule, data):
    credential = data.draw(CREDENTIALS[rule], label="credential")
    assume(not _pieces_in(credential.secret, FIXED_OUTPUT))
    surroundings, text, line = data.draw(_placed(credential.text), label="surroundings, text, line")
    assume(not ss.scan_text(NAME, surroundings))

    # The scan reports the credential's rule on its line, and nothing elsewhere.
    findings = ss.scan_text(NAME, text)
    assert ss.Finding(NAME, line, rule) in findings
    assert {finding.line for finding in findings} == {line}

    # The command line prints `<file>:<line>: <rule>` per finding and nothing else.
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, NAME)
        Path(path).write_bytes(text.encode("utf-8"))
        status, out, err = _run_main([path])
    assert status == 1
    assert out.splitlines() == [f"{path}:{finding.line}: {finding.pattern}" for finding in findings]
    assert err == ""
    # The file path is the test's own choice, so it is left out of the leak check.
    assert _pieces_in(credential.secret, (out + err).replace(path, "")) == []

    # The write hook blocks the same content, naming rules only.
    event = {
        "hook_event_name": "PreToolUse",
        "tool_name": "fs_write",
        "tool_input": {"path": NAME, "content": text},
    }
    status, out, err = _run_main(["--hook"], stdin=json.dumps(event).encode("utf-8"))
    names = ", ".join(sorted({finding.pattern for finding in findings}))
    assert status == 2
    assert out == ""
    assert err == ss.HOOK_MESSAGE.format(names=names) + "\n"
    assert _pieces_in(credential.secret, out + err) == []
