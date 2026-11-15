"""Focused examples for recursive canonical JSON redaction (task 4.1).

Property 6 belongs to task 4.2. These examples cover the concrete redaction,
bounds, collision, and residual-diagnostic contracts without adding that
later task's Hypothesis test.
"""

from __future__ import annotations

import ast
import inspect
from urllib.parse import quote

import pytest

from haunted_house.core import deep_redact as deep_redact_module
from haunted_house.core.deep_redact import (
    HOME_MARKER,
    KEY_COLLISION_PREFIX,
    DeepRedactionError,
    RedactionErrorCode,
    RedactionLimits,
    ResidualCategory,
    deep_redact,
    detect_redaction_residual,
    detect_residual,
)
from haunted_house.core.redact import MARKER
from haunted_house.core.seance_event import (
    AppEventCandidate,
    EventScope,
    EventSource,
    candidate_to_dict,
    validate_candidate,
)

pytestmark = pytest.mark.core


def _fake(*parts: str) -> str:
    return "".join(parts)


KNOWN = _fake("known-", "value-123")


def test_nested_raw_and_mixed_encoded_secrets_are_removed_without_mutation():
    mixed = "known%2Dvalue%2d123"
    encoded = quote(KNOWN, safe="")
    source = {
        f"key-{KNOWN}": [
            f"raw={KNOWN}",
            {"mixed": mixed, "encoded": encoded},
            7,
            1.5,
            True,
            None,
        ]
    }

    result = deep_redact(source, [KNOWN])

    assert source[f"key-{KNOWN}"][0] == f"raw={KNOWN}"
    assert result == {
        f"key-{MARKER}": [
            f"raw={MARKER}",
            {"mixed": MARKER, "encoded": MARKER},
            7,
            1.5,
            True,
            None,
        ]
    }
    assert deep_redact(result, [KNOWN]) == result
    assert detect_residual(result, [KNOWN]) is None


def test_short_secret_inside_marker_does_not_break_idempotence():
    first = deep_redact("here is red", ["red"])

    assert first == f"here is {MARKER}"
    assert deep_redact(first, ["red"]) == first
    assert detect_residual(first, ["red"]) is None


def test_credential_keys_redact_descendant_strings_but_preserve_json_types():
    source = {
        "apiKey": "short-value",
        "nested_credentials": {
            "name": "operator",
            "enabled": True,
            "items": ["first", 7, None],
        },
        "api%255Fkey": "encoded-key-value",
        "token_count": "kept",
        "password_policy": "minimum-length",
    }

    result = deep_redact(source)

    assert result == {
        "apiKey": MARKER,
        "nested_credentials": {
            "name": MARKER,
            "enabled": True,
            "items": [MARKER, 7, None],
        },
        "api%255Fkey": MARKER,
        "token_count": "kept",
        "password_policy": "minimum-length",
    }
    assert detect_residual(result) is None


def test_repository_credential_patterns_are_replaced_inside_ordinary_strings():
    private_label = _fake(" RSA PRIV", "ATE KEY")
    private_block = "\n".join(
        [
            _fake("-" * 5, "BEGIN", private_label, "-" * 5),
            "c2Vuc2l0aXZlLWJvZHk=",
            _fake("-" * 5, "END", private_label, "-" * 5),
        ]
    )
    aws_key = _fake("AK", "IA", "Q7" * 8)
    github_token = _fake("gh", "p_", "a1B2" * 9)
    slack_token = _fake("xo", "xb-", "1234-5678-", "abcdEF")
    jwt = _fake(
        "ey",
        "JhbGciOiJIUzI1NiJ9",
        ".",
        "eyJzdWIiOiIxIn0",
        ".",
        "c2lnbmF0dXJlLXZhbHVl",
    )
    assigned = _fake("tok", "en = '", "q9Zx", "7Lm2" * 4, "'")
    source = {
        "text": " | ".join(
            [private_block, aws_key, github_token, slack_token, jwt, assigned]
        )
    }

    result = deep_redact(source)

    text = result["text"]
    assert isinstance(text, str)
    assert private_block not in text
    assert aws_key not in text
    assert github_token not in text
    assert slack_token not in text
    assert jwt not in text
    assert "q9Zx" not in text
    assert text.count(MARKER) == 6
    assert detect_residual(result) is None
    assert deep_redact(result) == result


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("cwd=/Users/alice/work/app", f"cwd={HOME_MARKER}work/app"),
        ("/home/bob/project", f"{HOME_MARKER}project"),
        (r"C:\Users\carol\work", f"{HOME_MARKER}work"),
        ("D:/Users/dana/work", f"{HOME_MARKER}work"),
        (r"\/Users\/eve\/work", f"{HOME_MARKER}work"),
        ("file:///Users/frank/work", f"file://{HOME_MARKER}work"),
    ],
)
def test_platform_home_prefixes_are_replaced(value, expected):
    assert deep_redact(value) == expected
    assert detect_residual(expected) is None


@pytest.mark.parametrize(
    "value",
    [
        "~/Users/alice/work",
        "src/home/alice/file.py",
        "./Users/alice/work",
        "https://example.invalid/Users/alice/work",
    ],
)
def test_relative_and_remote_path_text_is_not_a_home_path(value):
    assert deep_redact(value) == value


def test_redacted_key_collisions_use_deterministic_stable_placeholders():
    first_secret = _fake("first-", "secret-value")
    second_secret = _fake("second-", "secret-value")
    source = {
        f"same-{first_secret}": 1,
        f"same-{second_secret}": 2,
        f"same-{MARKER}": 3,
    }

    forward = deep_redact(source, [first_secret, second_secret])
    reverse = deep_redact(
        dict(reversed(source.items())), [second_secret, first_secret]
    )

    assert forward == reverse
    assert len(forward) == len(source)
    assert set(forward.values()) == {1, 2, 3}
    assert all(key.startswith(KEY_COLLISION_PREFIX) for key in forward)
    assert deep_redact(forward, [first_secret, second_secret]) == forward
    assert detect_residual(forward, [first_secret, second_secret]) is None


def test_redacted_candidate_remains_valid_canonical_event_json():
    candidate = AppEventCandidate(
        schema_version=1,
        event_type="message_recorded",
        scope=EventScope(
            mansion_id="demo-mansion",
            ghost_id="archivist",
            session_slot="slot-1",
            run_id="requirements-1",
            run_sequence=0,
        ),
        source=EventSource(
            origin="crew",
            source_type="chat_message",
            identity_parts=("message-1",),
            revision=0,
            generation="generation-1",
            source_sequence=1,
        ),
        caused_by=(),
        occurred_at_ms=1,
        payload={
            "api_token": "short-value",
            "cwd": "/home/operator/project",
            "attempt": 1,
        },
    )

    redacted = deep_redact(candidate_to_dict(candidate))
    result = validate_candidate(redacted)

    assert result.ok
    assert result.value is not None
    assert result.value.payload == {
        "api_token": MARKER,
        "cwd": f"{HOME_MARKER}project",
        "attempt": 1,
    }


@pytest.mark.parametrize(
    ("value", "known_secrets", "bodies", "category"),
    [
        (
            {"message": f"prefix {KNOWN}"},
            [KNOWN],
            [],
            ResidualCategory.KNOWN_SECRET,
        ),
        (
            {"message": quote(KNOWN, safe="")},
            [KNOWN],
            [],
            ResidualCategory.KNOWN_SECRET,
        ),
        (
            {"message": _fake("AK", "IA", "Q7" * 8)},
            [],
            [],
            ResidualCategory.SENSITIVE_VALUE,
        ),
        (
            {"password": "still-visible"},
            [],
            [],
            ResidualCategory.SENSITIVE_VALUE,
        ),
        (
            {"cwd": "/Users/operator/project"},
            [],
            [],
            ResidualCategory.HOME_PATH,
        ),
        (
            {"text": "complete requirements document"},
            [],
            ["requirements document"],
            ResidualCategory.FORBIDDEN_DOCUMENT_BODY,
        ),
    ],
)
def test_residual_detection_returns_only_a_safe_category(
    value, known_secrets, bodies, category
):
    residual = detect_redaction_residual(
        value,
        known_secrets,
        forbidden_document_bodies=bodies,
    )

    assert residual is not None
    assert residual.category is category
    assert list(residual.__dataclass_fields__) == ["category"]
    assert KNOWN not in repr(residual)


def test_tree_limits_and_invalid_json_fail_with_safe_typed_errors():
    cycle = []
    cycle.append(cycle)
    cases = [
        (("not", "json"), RedactionLimits(), RedactionErrorCode.INVALID_JSON),
        (float("inf"), RedactionLimits(), RedactionErrorCode.NON_FINITE_NUMBER),
        ("\ud800", RedactionLimits(), RedactionErrorCode.INVALID_UTF8),
        (
            [[["too-deep"]]],
            RedactionLimits(max_depth=1),
            RedactionErrorCode.DEPTH_LIMIT,
        ),
        (
            [1, 2, 3],
            RedactionLimits(max_nodes=3),
            RedactionErrorCode.NODE_LIMIT,
        ),
        (
            "four",
            RedactionLimits(max_string_bytes=3),
            RedactionErrorCode.STRING_LIMIT,
        ),
        (
            ["abc", "def"],
            RedactionLimits(max_total_string_bytes=5),
            RedactionErrorCode.TOTAL_STRING_LIMIT,
        ),
        (cycle, RedactionLimits(), RedactionErrorCode.INVALID_JSON),
    ]

    for value, limits, code in cases:
        with pytest.raises(DeepRedactionError) as raised:
            deep_redact(value, limits=limits)
        assert raised.value.code is code
        assert str(raised.value) == code.value


def test_known_secret_input_is_bounded_and_validated():
    with pytest.raises(DeepRedactionError) as invalid:
        deep_redact("safe", [object()])
    assert invalid.value.code is RedactionErrorCode.INVALID_SECRET

    too_many = [f"value-{index}" for index in range(65)]
    with pytest.raises(DeepRedactionError) as excessive:
        deep_redact("safe", too_many)
    assert excessive.value.code is RedactionErrorCode.TOO_MANY_SECRETS


def test_module_is_pure_and_imports_no_io_network_environment_or_clock():
    tree = ast.parse(inspect.getsource(deep_redact_module))
    imported_roots = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported_roots.update(alias.name.partition(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported_roots.add(node.module.partition(".")[0])

    assert imported_roots.isdisjoint(
        {
            "aiohttp",
            "asyncio",
            "os",
            "pathlib",
            "socket",
            "subprocess",
            "time",
        }
    )
