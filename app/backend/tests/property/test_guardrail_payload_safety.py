"""Property 16 for Spec 4 domain payload builders.

Feature: doors-and-guardrails, Property 16: Domain payload builders exclude sensitive or content-bearing fields

For any generated document body, token, secret, capability, credential-shaped
value, encoded secret, and tool data, Spec 4 Domain_Event_Payload builders,
DTOs, and error values contain none of those values or document bodies and
preserve only bounded typed summaries for Spec 2 final redaction.

Credential-shaped values are assembled at runtime so no such literal is
committed.

Validates: Requirements 10.3, 10.7, 11.8.
"""

from __future__ import annotations

import base64
from urllib.parse import quote

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from haunted_house.core import guardrail_events
from haunted_house.core.action_descriptor import ActionError, parse_action_descriptor
from haunted_house.core.guardrail_events import MAX_LABEL_LENGTH
from haunted_house.core.deep_redact import deep_redact
from haunted_house.core.guardrail_events import (
    GuardrailEventKind,
    GuardrailPayloadError,
    build_candidate,
    path_denied,
)
from haunted_house.core.path_policy import MAX_PATH_BYTES, Access, PathError, parse_relative_path
from haunted_house.core.seance_event import canonical_json, candidate_to_dict
from tests.guardrail_support import MANSION, SESSION_SCOPE, SHA_A

pytestmark = pytest.mark.core

_ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
_WORDS = st.text(alphabet="abcdefghij klmnopqrstuvwxyz", min_size=8, max_size=40)

_DOCUMENT_BODIES = st.lists(_WORDS, min_size=2, max_size=6).map(
    lambda lines: "# Requirements\n" + "\n".join(lines)
)
_RAW_CREDENTIALS = st.one_of(
    st.text(alphabet=_ALNUM, min_size=36, max_size=40).map(lambda tail: "gh" + "p_" + tail),
    st.text(alphabet="ABCDEFGHIJKLMNOP234567", min_size=16, max_size=16).map(
        lambda tail: "aws_access_key_id=" + "AK" + "IA" + tail
    ),
    st.text(alphabet=_ALNUM, min_size=24, max_size=48).map(lambda body: "Bearer " + body),
    st.text(alphabet=_ALNUM, min_size=20, max_size=40).map(
        lambda body: "-" * 5 + "BEGIN PRIVATE KEY" + "-" * 5 + "\n" + body
    ),
    st.binary(min_size=24, max_size=48).map(
        lambda raw: "api_key=\"" + base64.b64encode(raw).decode() + "\""
    ),
)
# A Session_Capability is an opaque value longer than any label.
_CAPABILITIES = st.text(alphabet="0123456789abcdef", min_size=123, max_size=160).map(
    lambda body: "hhcap_" + body
)
_ENCODED = st.one_of(_RAW_CREDENTIALS, _DOCUMENT_BODIES).map(lambda value: quote(value, safe=""))
_ERROR_TEXT = _WORDS.map(lambda words: f"Traceback (most recent call last): {words}")
_SENSITIVE_TEXT = st.one_of(
    _DOCUMENT_BODIES, _RAW_CREDENTIALS, _CAPABILITIES, _ENCODED, _ERROR_TEXT
)
_TOOL_DATA = st.dictionaries(
    st.sampled_from(["content", "stdout", "env", "command", "text", "result", "headers"]),
    st.one_of(_SENSITIVE_TEXT, st.lists(_SENSITIVE_TEXT, max_size=3)),
    min_size=1,
    max_size=4,
)
_SENSITIVE = st.one_of(_SENSITIVE_TEXT, _TOOL_DATA)

_VALID = {
    "phase": "design",
    "reservation_id": "res-1",
    "command_id": "cmd-1",
    "session_slot": "workshop-slot-1",
    "code": "blocked",
    "proposal_id": "prop-1",
    "document_path": ".kiro/specs/demo-feature/design.md",
    "revision": 2,
    "base_revision": 1,
    "sha256": SHA_A,
    "base_sha256": SHA_A,
    "size_bytes": 10,
    "actor": "operator",
    "action_digest": SHA_A,
    "crew_slot": None,
    "crew_mid": None,
    "claim_id": "claim-1",
    "denial_id": "deny-1",
    "exit_code": 1,
    "output_bytes": 12,
    "resolution_id": "res-1",
    "mid": "mid-1",
    "outcome": "completed",
    "room": "workshop",
    "access": "read",
    "path": "src/app.py",
    "write_id": "write-1",
    "descriptor": {
        "schema_version": 1,
        "mansion_id": MANSION,
        "session_slot": "workshop-slot-1",
        "room": "workshop",
        "kind": "run_command",
        "working_directory": "",
        "arguments": {"argv": ["pytest", "-q"], "timeout_seconds": 60},
        "path_intents": [],
    },
}


def _strings(value: object):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for key, item in value.items():
            yield key
            yield from _strings(item)
    elif isinstance(value, (list, tuple)):
        for item in value:
            yield from _strings(item)


def _leaks(haystack: str, sensitive: object) -> bool:
    return any(len(needle) >= 12 and needle in haystack for needle in _strings(sensitive))


@st.composite
def _poisoned_data(draw):
    kind = draw(st.sampled_from(list(GuardrailEventKind)))
    schema = guardrail_events._SCHEMAS[kind][0]
    data = {name: _VALID[name] for name in schema}
    if kind is GuardrailEventKind.APPROVAL_RESOLUTION_IGNORED:
        data["outcome"] = "approved"
    poisoned = draw(st.lists(st.sampled_from(sorted(schema)), min_size=1, unique=True))
    sensitive = []
    for name in poisoned:
        value = draw(_SENSITIVE)
        data[name] = value
        sensitive.append(value)
    extra = draw(st.none() | _SENSITIVE)
    if extra is not None:
        data[draw(st.sampled_from(["document_body", "stdout", "error", "tool_input"]))] = extra
        sensitive.append(extra)
    return kind, data, poisoned, sensitive


@settings(max_examples=300)
@given(case=_poisoned_data())
def test_domain_payload_builders_exclude_sensitive_or_content_bearing_fields(case):
    kind, data, poisoned, sensitive = case
    try:
        candidate = build_candidate(SESSION_SCOPE, kind, data)
    except GuardrailPayloadError as error:
        rendered = f"{error} {error.diagnostic!r} {error.args!r}"
        assert not _leaks(rendered, sensitive)
        assert error.diagnostic.field.split(".")[0] in {"data", "kind", "scope", "payload"}
        return

    # A builder that accepts its input stored none of the sensitive values.
    text = canonical_json(candidate_to_dict(candidate)).decode("utf-8")
    assert not _leaks(text, sensitive)
    assert len(text) < 64 * 1024


@settings(max_examples=200)
@given(value=_SENSITIVE_TEXT)
def test_tool_data_never_becomes_a_displayable_action_argument(value):
    descriptor = dict(_VALID["descriptor"])
    for arguments in (
        {"argv": ["sh", "-c", value], "timeout_seconds": 60},
        {"argv": ["echo"], "timeout_seconds": 60, "env": {"VALUE": value}},
        {"command": value},
    ):
        parsed = parse_action_descriptor({**descriptor, "arguments": arguments})
        if isinstance(parsed, ActionError):
            assert not _leaks(repr(parsed), value)
            continue
        # Accepted argv is exactly displayable: single line, and unchanged by
        # the Spec 2 redactor, so it holds no recognizable credential.
        assert arguments.keys() == {"argv", "timeout_seconds"}
        assert "\n" not in value
        assert deep_redact(value) == value


@settings(max_examples=200)
@given(value=_SENSITIVE)
def test_a_denial_record_keeps_at_most_a_bounded_clean_path(value):
    candidate = path_denied(
        SESSION_SCOPE,
        denial_id="deny-1",
        session_slot="workshop-slot-1",
        room="workshop",
        access=Access.WRITE,
        code="room_policy",
        raw_path=value,
    )
    stored = candidate.payload["data"]["path"]
    if stored is None:
        text = canonical_json(candidate_to_dict(candidate)).decode("utf-8")
        assert not _leaks(text, value)
        return
    assert stored == value
    assert len(stored.encode("utf-8")) <= MAX_PATH_BYTES
    assert not isinstance(parse_relative_path(stored), PathError)
    assert "\n" not in stored
    assert deep_redact(stored) == stored


@settings(max_examples=100)
@given(value=_CAPABILITIES)
def test_a_capability_is_too_long_for_any_identifier_or_label_field(value):
    assert len(value) > MAX_LABEL_LENGTH
    for name in ("session_slot", "reservation_id"):
        with pytest.raises(GuardrailPayloadError) as raised:
            build_candidate(
                SESSION_SCOPE,
                GuardrailEventKind.PHASE_STARTED,
                {"phase": "design", "reservation_id": "res-1", "session_slot": "slot", name: value},
            )
        assert value not in str(raised.value)
