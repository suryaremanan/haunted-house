"""Property 5 for haunted_house.core.urls.with_token.

Builds a request target from a path and a list of raw query pieces, calls
with_token, and checks the result with urllib.parse rather than with code
from the module under test.

A piece counts as a token parameter when urllib.parse.parse_qsl decodes its
name to "token", which is how a server's query parser reads it. For the name
"token" it makes no difference whether "+" decodes to a space (unquote_plus,
parse_qsl) or stays "+" (unquote): neither character is in "token", so both
rules pick out the same pieces.
"""

import string
from urllib.parse import parse_qsl, quote, quote_plus, unquote

import pytest
from hypothesis import event, example, given, note
from hypothesis import strategies as st

from haunted_house.core.urls import with_token

pytestmark = pytest.mark.core

TOKEN = "token"
ALNUM = string.ascii_letters + string.digits

# Characters a path may hold raw: RFC 3986 pchar, plus "%" so that valid and
# broken percent escapes both appear. Never "?" or "#".
PATH_RAW = ALNUM + "-._~!$&'()*+,;=:@%"
# Characters quote() keeps raw when it encodes arbitrary text for a path.
PATH_SAFE = "/:@!$&'()*+,;="

# Characters a query name may hold raw. No "&" (separates pieces), "#"
# (starts a fragment) or "=" (separates the name from the value).
QUERY_RAW = ALNUM + "-._~!$'()*+,;:@/?%"
QUERY_SAFE = "/?:@!$'()*,;"

# Names that look like "token" but do not decode to it. with_token must keep
# them. "tok%2565n" decodes once, to the text "tok%65n".
NEAR_MISS_NAMES = [
    "Token",
    "TOKEN",
    "tokens",
    "xtoken",
    "tok",
    "token+",
    "tok+en",
    "token%20",
    "%20token",
    "token%3D",
    "tok%2565n",
]

# Lone surrogates are left out (Hypothesis does this by default): they have
# no UTF-8 encoding, so no HTTP request could carry such a token.
AWKWARD_CHARS = "&=%+ #?/;:@~-._ab09\u00e9\u20ac\U0001f600"
tokens = st.one_of(
    st.text(),
    st.text(st.sampled_from(AWKWARD_CHARS)),
    st.text(ALNUM + "-_.", min_size=1, max_size=40),
)


def encoded_text(raw_alphabet, safe):
    """Raw text in a URL alphabet, or arbitrary text percent-encoded."""
    return st.one_of(
        st.text(raw_alphabet, max_size=12),
        st.text(max_size=8).map(lambda s: quote(s, safe=safe)),
        st.text(max_size=8).map(lambda s: quote_plus(s, safe=safe)),
    )


paths = st.lists(encoded_text(PATH_RAW, PATH_SAFE), max_size=5).map(
    lambda segments: "/" + "/".join(segments)
)


@st.composite
def token_spellings(draw):
    """'token' with each letter kept or percent-encoded, in either hex case."""
    letters = []
    for letter in TOKEN:
        form = draw(st.sampled_from(["raw", "lower", "upper"]))
        code = f"{ord(letter):02x}"
        if form == "raw":
            letters.append(letter)
        elif form == "lower":
            letters.append("%" + code)
        else:
            letters.append("%" + code.upper())
    return "".join(letters)


# Values may hold a raw "=": only the first "=" in a piece ends the name.
values = encoded_text(QUERY_RAW + "=", QUERY_SAFE + "=")


def pieces_named(names):
    """'name', 'name=' or 'name=value'."""
    return st.tuples(names, st.one_of(st.none(), st.just(""), values)).map(
        lambda nv: nv[0] if nv[1] is None else f"{nv[0]}={nv[1]}"
    )


query_pieces = st.one_of(
    pieces_named(encoded_text(QUERY_RAW, QUERY_SAFE)),
    pieces_named(st.one_of(st.sampled_from([TOKEN, "tok%65n"]), token_spellings())),
    pieces_named(st.sampled_from(NEAR_MISS_NAMES)),
    st.just(""),  # gives "&&", a leading or trailing "&", or a bare "?"
)

@st.composite
def targets(draw):
    """(path, pieces). pieces is None for a target with no "?" at all, in
    about one case in five; [] and [""] give a bare "?"."""
    path = draw(paths)
    if draw(st.integers(min_value=0, max_value=4)) == 0:
        return path, None
    return path, draw(st.lists(query_pieces, max_size=8))


def join_target(path, pieces):
    return path if pieces is None else f"{path}?{'&'.join(pieces)}"


def decoded_name(piece):
    """The name parse_qsl reads from one non-empty piece."""
    [(name, _value)] = parse_qsl(piece, keep_blank_values=True)
    return name


# Feature: crew-app-foundation, Property 5: The token is placed in the query exactly once
@given(case=targets(), token=tokens)
@example(case=("/api/version", None), token="t0k")
@example(case=("/api/version", []), token="")
@example(case=("/x", ["a=1", "tok%65n=old", "", "b", "token", "a=2", ""]), token="n&w=+ #?%")
@example(case=("/p%20th/a+b;c=d&e", ["q=a%20b+c", "tok%2565n=x", "%74oken=y"]), token="\xe9\u20ac")
def test_token_is_placed_in_the_query_exactly_once(case, token):
    """**Validates: Requirements 6.2**"""
    path, pieces = case
    target = join_target(path, pieces)
    present = [piece for piece in pieces or [] if piece]
    others = [piece for piece in present if decoded_name(piece) != TOKEN]
    replaced = len(present) - len(others)
    if pieces is None:
        event("no '?'")
    else:
        event(f"existing token params: {replaced if replaced < 2 else '2+'}")
        event(f"other params: {'yes' if others else 'no'}")
    note(f"target={target!r}")

    result = with_token(target, token)
    note(f"result={result!r}")

    result_path, separator, query = result.partition("?")
    assert separator == "?"
    assert result_path == path

    result_pieces = query.split("&")
    # Every other parameter kept, raw text unchanged, in the original order;
    # nothing else added (empty pieces from "&&" or a bare "?" are gone).
    assert result_pieces[:-1] == others
    # The token parameter comes last, spelled plainly, value percent-encoded.
    name, equals, value = result_pieces[-1].partition("=")
    assert (name, equals) == (TOKEN, "=")
    assert unquote(value, errors="strict") == token
    # A query parser reading the whole query sees exactly one token.
    parsed = parse_qsl(query, keep_blank_values=True)
    assert [v for n, v in parsed if n == TOKEN] == [token]
