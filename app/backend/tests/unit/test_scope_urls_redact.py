"""Example tests for core/scope.py, core/urls.py and core/redact.py.

Property tests live elsewhere: with_token (Property 5) in task 4.2, the
client's scope check (Property 8) in task 6.5, and secret redaction through
the client (Property 6) in task 6.3.
"""

from urllib.parse import parse_qsl, quote, quote_plus

import pytest

from haunted_house.core.redact import MARKER, redact
from haunted_house.core.scope import path_allowed
from haunted_house.core.urls import with_token

pytestmark = pytest.mark.core

MANIFEST_PREFIXES = ["/api/version", "/apps/haunted-house/api/*"]


# --- scope.path_allowed ---------------------------------------------------


@pytest.mark.parametrize(
    "path",
    [
        "/api/version",
        "/api/version?token=abc",
        "/api/version#frag",
        "/api/version/",
        "/api/version/child",
        "/apps/haunted-house/api",
        "/apps/haunted-house/api/whoami",
        "/apps/haunted-house/api/a/b?c=d&e",
        "/api/version?next=/../../etc",  # the query is not part of the path
    ],
)
def test_manifest_prefixes_allow_their_own_paths(path):
    assert path_allowed(MANIFEST_PREFIXES, path)


@pytest.mark.parametrize(
    "path",
    [
        "/api/versionx",
        "/api",
        "/api/chat",
        "/apps/haunted-house/apix",
        "/apps/other-app/api/x",
    ],
)
def test_manifest_prefixes_refuse_other_paths(path):
    assert not path_allowed(MANIFEST_PREFIXES, path)


@pytest.mark.parametrize(
    "path",
    [
        "",
        "api/version",
        "http://evil.example/api/version",
        "javascript:alert(1)",
        "//evil.example/api/version",
        "/\\evil.example/api/version",
        "\\api\\version",
        "/api/version\\x",
        "/api/version?x=\\",
        "/api/version/../chat",
        "/api/version/..",
        "/api/version/./x",
        "/api//version",
        "/apps/haunted-house/api//x",
        "/apps/haunted-house/api/%2e%2e/x",
        "/apps/haunted-house/api/%2E/x",
        "/apps/haunted-house/api/x%2F..%2Fy",
        "/apps/haunted-house/api/x%2F%2Fy",
        "/apps/haunted-house/api/x%5Cy",
        "/api/version\n",
        "/api/version%0A",
    ],
)
def test_unsafe_paths_are_refused_whatever_the_prefixes(path):
    assert not path_allowed(MANIFEST_PREFIXES + ["*", "/*"], path)


def test_slash_star_means_the_base_and_its_children():
    prefixes = ["/api/chat/*"]
    assert path_allowed(prefixes, "/api/chat")
    assert path_allowed(prefixes, "/api/chat/abc/def")
    assert not path_allowed(prefixes, "/api/chatty")


def test_trailing_star_is_a_raw_prefix():
    prefixes = ["/api/chat*"]
    assert path_allowed(prefixes, "/api/chat")
    assert path_allowed(prefixes, "/api/chatty")
    assert path_allowed(prefixes, "/api/chat/x")
    assert not path_allowed(prefixes, "/api/cha")


def test_prefixes_are_trimmed_and_blank_ones_skipped():
    assert path_allowed(["", "   ", " /api/version "], "/api/version")
    assert not path_allowed(["", "   "], "/api/version")
    assert not path_allowed([], "/api/version")


# --- urls.with_token ------------------------------------------------------


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        ("/api/version", "/api/version?token=t0k"),
        ("/api/version?", "/api/version?token=t0k"),
        ("/x?a=1&a=2", "/x?a=1&a=2&token=t0k"),
        ("/x?token=old&a=1&token=old2&b=2", "/x?a=1&b=2&token=t0k"),
        ("/x?flag&token&b", "/x?flag&b&token=t0k"),
        ("/x?tok%65n=evil&a=1", "/x?a=1&token=t0k"),
        ("/x?q=a%20b+c&r=%2F&s=", "/x?q=a%20b+c&r=%2F&s=&token=t0k"),
        ("/x?&&a=1&", "/x?a=1&token=t0k"),
        ("/x?a=1#frag", "/x?a=1&token=t0k"),
        ("/p%20th/a+b;c=d", "/p%20th/a+b;c=d?token=t0k"),
    ],
)
def test_with_token_examples(given, expected):
    assert with_token(given, "t0k") == expected


def test_with_token_encodes_every_reserved_character():
    token = "a/b c&d=e+f?#%"
    result = with_token("/api/version?x=1", token)
    path, _, query = result.partition("?")
    assert path == "/api/version"
    assert query == "x=1&token=" + quote(token, safe="")
    assert parse_qsl(query, keep_blank_values=True) == [("x", "1"), ("token", token)]


# --- redact.redact --------------------------------------------------------


def _forms(secret):
    return {secret, quote(secret, safe=""), quote_plus(secret), quote(secret)}


def _assert_clean(output, secrets):
    for secret in secrets:
        for form in _forms(secret):
            assert form not in output, (secret, form, output)


def test_redact_replaces_the_raw_secret():
    secret = "s3cr3t-value!"
    assert redact(f"secret={secret} end", [secret]) == f"secret={MARKER} end"


def test_redact_replaces_every_encoded_form():
    secret = "a b/c+d&e=f?"
    forms = sorted(_forms(secret))
    assert len(forms) == 4
    output = redact(" | ".join(forms), [secret])
    assert output == " | ".join([MARKER] * 4)
    _assert_clean(output, [secret])


def test_redact_matches_lowercase_hex_and_partly_decoded_urls():
    secret = "a:b c/d"
    text = "GET /api/version?token=a%3ab%20c%2fd and url=http://h/?token=a:b%20c/d"
    output = redact(text, [secret])
    assert output == f"GET /api/version?token={MARKER} and url=http://h/?token={MARKER}"


def test_redact_handles_non_ascii_secrets():
    secret = "pässwörd-ü"
    text = f"raw={secret} enc={quote(secret, safe='')}"
    output = redact(text, [secret])
    assert output == f"raw={MARKER} enc={MARKER}"


def test_redact_covers_overlapping_and_touching_occurrences():
    assert redact("xababab y", ["abab"]) == f"x{MARKER} y"
    assert redact("tokentoken", ["token"]) == MARKER


def test_redact_never_lets_the_marker_spell_a_secret():
    # Replacing the first occurrence leaves "[redacted]abcdef", which ends in
    # the secret "d]abcdef" again; redact must catch that too.
    secret = "d]abcdef"
    output = redact("d]abcdefabcdef", [secret])
    assert output == MARKER
    _assert_clean(output, [secret])


def test_redact_handles_several_secrets_and_ignores_empty_ones():
    secret, token = "app-sec-123", "tok/en+456"
    text = f"secret={secret} url=/api/version?token={quote(token, safe='')}"
    output = redact(text, [secret, None, "", token])
    assert output == f"secret={MARKER} url=/api/version?token={MARKER}"
    _assert_clean(output, [secret, token])


def test_redact_leaves_text_without_secrets_alone():
    assert redact("nothing to see", ["app-sec-123"]) == "nothing to see"
    assert redact("nothing to see", []) == "nothing to see"
    assert redact("nothing to see", [None, ""]) == "nothing to see"


def test_redact_terminates_when_a_secret_is_part_of_the_marker():
    # A one-letter secret also appears inside "[redacted]"; the input's own
    # occurrences are still replaced and redact returns.
    assert redact("hello", ["e"]) == f"h{MARKER}llo"
