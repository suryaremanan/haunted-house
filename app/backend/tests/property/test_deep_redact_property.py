"""Property 6 for recursive canonical JSON redaction.

The generator wraps an arbitrary bounded JSON value with planted raw and
encoded known secrets, every supported Home_Path form, credential-key values,
and every repository credential-pattern family.  Assertions use the public
redaction and residual-detection seams.
"""

from __future__ import annotations

import copy
import string
from collections.abc import Iterator
from urllib.parse import quote, quote_plus

import pytest
from hypothesis import event, given, settings
from hypothesis import strategies as st

from haunted_house.core.deep_redact import HOME_MARKER, deep_redact, detect_residual
from haunted_house.core.redact import MARKER

pytestmark = pytest.mark.core

_SAFE_TEXT = st.text(
    st.characters(blacklist_categories=("Cs",)),
    max_size=32,
)
_JSON_SCALARS = st.one_of(
    st.none(),
    st.booleans(),
    st.integers(min_value=-(10**9), max_value=10**9),
    st.floats(allow_nan=False, allow_infinity=False, width=32),
    _SAFE_TEXT,
)
_JSON_VALUES = st.recursive(
    _JSON_SCALARS,
    lambda children: st.one_of(
        st.lists(children, max_size=4),
        st.dictionaries(_SAFE_TEXT, children, max_size=4),
    ),
    max_leaves=24,
)

_IDENTIFIER = st.text(
    alphabet=string.ascii_letters + string.digits,
    min_size=3,
    max_size=14,
)
_USERNAME = st.text(
    alphabet=string.ascii_letters + string.digits + "._-",
    min_size=1,
    max_size=14,
)
_PATH_PART = st.text(
    alphabet=string.ascii_letters + string.digits + "._-",
    min_size=1,
    max_size=14,
)


def _known_secret(left: str, right: str) -> str:
    # The slash and space force URL encoding while keeping values scanner-safe.
    return f"{left}/{right} value"


_KNOWN_SECRETS = st.lists(
    st.builds(_known_secret, _IDENTIFIER, _IDENTIFIER),
    min_size=1,
    max_size=4,
    unique=True,
)


def _mixed_percent_encode(value: str) -> str:
    """Encode alternating characters, with mixed hex case and plus-space."""

    parts: list[str] = []
    for index, character in enumerate(value):
        if character == " " and index % 3 == 0:
            parts.append("+")
        elif index % 2:
            encoded = "".join(f"%{byte:02X}" for byte in character.encode("utf-8"))
            parts.append(encoded.lower() if index % 4 == 1 else encoded)
        else:
            parts.append(character)
    return "".join(parts)


def _secret_variants(secret: str) -> tuple[str, ...]:
    return (
        secret,
        quote(secret, safe=""),
        quote_plus(secret, safe=""),
        _mixed_percent_encode(secret),
    )


@st.composite
def _sensitive_pattern_values(draw: st.DrawFn) -> tuple[str, ...]:
    upper = string.ascii_uppercase + string.digits
    alpha_numeric = string.ascii_letters + string.digits
    token_body = draw(st.text(alpha_numeric, min_size=40, max_size=48))
    assignment_body = draw(st.text(alpha_numeric, min_size=18, max_size=30))
    private_body = draw(st.text(alpha_numeric + "+/=", min_size=24, max_size=48))

    dashes = "-" * 5
    private_label = " RSA " + "PRIVATE" + " KEY"
    private_block = "\n".join(
        (
            dashes + "BEGIN" + private_label + dashes,
            private_body,
            dashes + "END" + private_label + dashes,
        )
    )
    aws_value = "AK" + "IA" + draw(st.text(upper, min_size=16, max_size=16))
    github_value = "gh" + "p_" + token_body
    slack_value = "xo" + "xb-" + draw(
        st.text(alpha_numeric + "-", min_size=12, max_size=24)
    )
    jwt_value = (
        "ey"
        + "J"
        + draw(st.text(alpha_numeric + "_-", min_size=8, max_size=16))
        + "."
        + draw(st.text(alpha_numeric + "_-", min_size=2, max_size=10))
        + "."
        + draw(st.text(alpha_numeric + "_-", min_size=8, max_size=16))
    )
    proxy_assignment = (
        "KIROCREW_PROXY" + "_SECRET=" + draw(st.text(alpha_numeric, min_size=8, max_size=20))
    )
    app_header = "X-App" + "-Secret: " + draw(
        st.text(alpha_numeric, min_size=8, max_size=20)
    )
    dashboard_cookie = "mc_" + "token_1=" + draw(
        st.text(alpha_numeric, min_size=16, max_size=28)
    )
    generic_assignment = "api_" + "key = '" + assignment_body + "'"

    return (
        private_block,
        aws_value,
        github_value,
        slack_value,
        jwt_value,
        proxy_assignment,
        app_header,
        dashboard_cookie,
        generic_assignment,
    )


def _platform_paths(
    username: str,
    first_part: str,
    second_part: str,
    drive: str,
) -> tuple[tuple[str, ...], tuple[str, ...]]:
    suffix = f"{first_part}/{second_part}"
    windows_suffix = f"{first_part}\\{second_part}"
    escaped_windows_suffix = f"{first_part}\\\\{second_part}"
    original = (
        f"/Users/{username}/{suffix}",
        f"/home/{username}/{suffix}",
        f"\\/Users\\/{username}\\/{suffix}",
        f"\\/home\\/{username}\\/{suffix}",
        f"{drive}:\\Users\\{username}\\{windows_suffix}",
        f"{drive}:\\\\Users\\\\{username}\\\\{escaped_windows_suffix}",
        f"{drive}:/Users/{username}/{suffix}",
        f"file:///Users/{username}/{suffix}",
    )
    expected = (
        f"{HOME_MARKER}{suffix}",
        f"{HOME_MARKER}{suffix}",
        f"{HOME_MARKER}{suffix}",
        f"{HOME_MARKER}{suffix}",
        f"{HOME_MARKER}{windows_suffix}",
        f"{HOME_MARKER}{escaped_windows_suffix}",
        f"{HOME_MARKER}{suffix}",
        f"file://{HOME_MARKER}{suffix}",
    )
    return original, expected


def _strings_in(value: object) -> Iterator[str]:
    if type(value) is str:
        yield value
    elif type(value) is list:
        for item in value:
            yield from _strings_in(item)
    elif type(value) is dict:
        for key, item in value.items():
            yield key
            yield from _strings_in(item)


def _json_shape(value: object) -> tuple[object, ...]:
    """Describe value types and every collection's cardinality, ignoring keys."""

    if type(value) is dict:
        child_shapes = sorted(
            (_json_shape(item) for item in value.values()),
            key=repr,
        )
        return ("object", len(value), tuple(child_shapes))
    if type(value) is list:
        return ("array", len(value), tuple(_json_shape(item) for item in value))
    if value is None:
        return ("null",)
    if type(value) is bool:
        return ("boolean",)
    if type(value) is int:
        return ("integer",)
    if type(value) is float:
        return ("number",)
    if type(value) is str:
        return ("string",)
    raise AssertionError(f"non-JSON test value: {type(value)!r}")


# Feature: seance-log-and-ghost-state, Property 6: Deep redaction is safe, structure-preserving, and idempotent
@settings(max_examples=250, deadline=None)
@given(
    generated_value=_JSON_VALUES,
    known_secrets=_KNOWN_SECRETS,
    sensitive_values=_sensitive_pattern_values(),
    username=_USERNAME,
    first_part=_PATH_PART,
    second_part=_PATH_PART,
    drive=st.sampled_from(tuple(string.ascii_letters)),
    credential_value=st.text(
        alphabet=string.ascii_letters + string.digits + "-_",
        min_size=1,
        max_size=24,
    ),
)
def test_deep_redaction_is_safe_structure_preserving_and_idempotent(
    generated_value,
    known_secrets,
    sensitive_values,
    username,
    first_part,
    second_part,
    drive,
    credential_value,
):
    """**Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6**"""

    secret_variants = tuple(
        variant for secret in known_secrets for variant in _secret_variants(secret)
    )
    platform_paths, expected_paths = _platform_paths(
        username,
        first_part,
        second_part,
        drive,
    )
    source = {
        "generated_value": generated_value,
        "known_secret_values": list(secret_variants),
        f"known-secret-key:{known_secrets[0]}": "ordinary-value",
        "sensitive_pattern_values": list(sensitive_values),
        "credential_context": {
            "apiKey": {
                "direct": credential_value,
                "nested": [credential_value, 7, True, None],
            }
        },
        "platform_paths": list(platform_paths),
    }
    original = copy.deepcopy(source)

    redacted = deep_redact(source, known_secrets)

    event(f"known secret count: {len(known_secrets)}")
    event(f"generated root type: {type(generated_value).__name__}")
    assert source == original
    assert _json_shape(redacted) == _json_shape(source)
    assert deep_redact(redacted, known_secrets) == redacted
    assert detect_residual(redacted, known_secrets) is None

    assert isinstance(redacted, dict)
    assert redacted["platform_paths"] == list(expected_paths)
    assert redacted["credential_context"] == {
        "apiKey": {
            "direct": MARKER,
            "nested": [MARKER, 7, True, None],
        }
    }

    remaining_strings = tuple(_strings_in(redacted))
    planted_values = (
        *secret_variants,
        *sensitive_values,
        *platform_paths,
    )
    for planted in planted_values:
        assert all(planted not in text for text in remaining_strings)
