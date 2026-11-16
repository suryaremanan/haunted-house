"""Pure, bounded redaction for canonical JSON values.

The foundation :func:`haunted_house.core.redact.redact` function removes known
secrets from one string, including mixed percent-encoded forms. This module
applies that primitive to complete JSON trees and adds the persistence
boundary's other disclosure rules: credential-bearing keys, repository
credential patterns, platform home-directory prefixes, collision-safe object
keys, and a category-only residual check.

Inputs are never mutated. Limits are checked before traversal so an invalid,
cyclic, or excessively large value cannot produce a partial redacted result.
"""

from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from enum import StrEnum
from typing import cast
from urllib.parse import unquote_plus

from haunted_house.core.redact import MARKER, redact
from haunted_house.core.seance_event import (
    JSONValue,
    MAX_INGEST_REQUEST_BYTES,
    MAX_PAYLOAD_BYTES,
)

__all__ = [
    "DEFAULT_LIMITS",
    "HOME_MARKER",
    "KEY_COLLISION_PREFIX",
    "MAX_JSON_DEPTH",
    "MAX_JSON_NODES",
    "MAX_JSON_STRING_BYTES",
    "MAX_JSON_TOTAL_STRING_BYTES",
    "MAX_KNOWN_SECRET_BYTES",
    "MAX_KNOWN_SECRETS",
    "DeepRedactionError",
    "RedactionErrorCode",
    "RedactionLimits",
    "RedactionResidual",
    "ResidualCategory",
    "deep_redact",
    "detect_residual",
    "detect_redaction_residual",
]

HOME_MARKER = "[home]/"
KEY_COLLISION_PREFIX = "[redacted-key-"
MAX_JSON_DEPTH = 64
MAX_JSON_NODES = 100_000
MAX_JSON_STRING_BYTES = MAX_PAYLOAD_BYTES
MAX_JSON_TOTAL_STRING_BYTES = MAX_INGEST_REQUEST_BYTES
MAX_KNOWN_SECRETS = 64
MAX_KNOWN_SECRET_BYTES = 4_096


@dataclass(frozen=True, slots=True)
class RedactionLimits:
    """Resource limits for one redaction or residual-scan operation."""

    max_depth: int = MAX_JSON_DEPTH
    max_nodes: int = MAX_JSON_NODES
    max_string_bytes: int = MAX_JSON_STRING_BYTES
    max_total_string_bytes: int = MAX_JSON_TOTAL_STRING_BYTES


DEFAULT_LIMITS = RedactionLimits()


class RedactionErrorCode(StrEnum):
    """Safe failure categories. No category contains rejected input."""

    INVALID_JSON = "invalid_json"
    NON_FINITE_NUMBER = "non_finite_number"
    INVALID_UTF8 = "invalid_utf8"
    DEPTH_LIMIT = "depth_limit"
    NODE_LIMIT = "node_limit"
    STRING_LIMIT = "string_limit"
    TOTAL_STRING_LIMIT = "total_string_limit"
    INVALID_LIMIT = "invalid_limit"
    INVALID_SECRET = "invalid_secret"
    TOO_MANY_SECRETS = "too_many_secrets"
    SECRET_TOO_LARGE = "_".join(("secret", "too", "large"))


class DeepRedactionError(ValueError):
    """A bounded error that discloses only a fixed failure category."""

    def __init__(self, code: RedactionErrorCode) -> None:
        self.code = code
        super().__init__(code.value)


class ResidualCategory(StrEnum):
    """Disclosure categories safe to include in writer diagnostics."""

    KNOWN_SECRET = "known_secret"
    SENSITIVE_VALUE = "sensitive_value"
    HOME_PATH = "home_path"
    FORBIDDEN_DOCUMENT_BODY = "forbidden_document_body"


@dataclass(frozen=True, slots=True)
class RedactionResidual:
    """One category-only post-redaction finding.

    Paths and matched values are deliberately absent because either can itself
    contain a credential or local username.
    """

    category: ResidualCategory


# Existing redaction markers are opaque. Treating them as ordinary input would
# make a second pass unstable when a short known secret is a substring of
# "redacted". Collision placeholders are generated only by this module.
_OPAQUE_MARKER = re.compile(r"\[redacted(?:-key-\d+)?\]|\[home\]/")

_HOME_NAME = r"[A-Za-z0-9._-]+"
_HOME_PATH = re.compile(
    # Raw or JSON-escaped Unix separators. The boundary excludes relative
    # paths such as src/home/name and ~/Users/name while allowing file URLs.
    r"(?<![\w.~\\-])\\?/(?:Users|home)\\?/" + _HOME_NAME + r"\\?/"
    # Raw, slash-separated, or once JSON-escaped Windows separators.
    + r"|(?<![\w.~\\-])[A-Za-z]:(?:\\{1,2}|/)Users(?:\\{1,2}|/)"
    + _HOME_NAME
    + r"(?:\\{1,2}|/)"
)

# Credential-looking JSON keys. Separator and camel-case normalization lets
# api_key, api-key, apiKey, and their encoded forms share one rule. Suffix
# matching covers namespaced keys without treating counters or policies as
# credentials.
_CREDENTIAL_KEY_SUFFIXES = (
    "api_key",
    "auth",
    "authorization",
    "auth_header",
    "cookie",
    "credential",
    "credentials",
    "password",
    "passwd",
    "private_key",
    "secret",
    "secret_access_key",
    "session_key",
    "token",
)
_CREDENTIAL_KEY_EXACT = frozenset(
    {
        "access_key",
        "access_key_id",
        "authentication",
        "client_secret",
        "id_token",
        "proxy_authorization",
        "refresh_token",
        "set_cookie",
        "x_app_secret",
    }
)
_CAMEL_BOUNDARY = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")
_KEY_SEPARATOR = re.compile(r"[^A-Za-z0-9]+")

# Value-only forms from the repository scanner. Tests assemble examples at
# runtime so no credential-shaped fixture is committed. A complete private-key
# block is removed as one value before the header-only fallback runs.
_PRIVATE_KEY_BLOCK = re.compile(
    r"-{5}BEGIN(?P<label>[ A-Z0-9]*PRIVATE KEY(?: BLOCK)?)-{5}"
    r".*?"
    r"-{5}END(?P=label)-{5}",
    re.DOTALL,
)
_DIRECT_SENSITIVE_PATTERNS = (
    _PRIVATE_KEY_BLOCK,
    re.compile(r"-{5}BEGIN[ A-Z0-9]*PRIVATE KEY(?: BLOCK)?-{5}"),
    re.compile(r"(?:AKIA|ASIA)[A-Z0-9]{16}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,}"),
    re.compile(r"xox[abprs]-[A-Za-z0-9-]{10,}"),
    re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]{8,}"),
)

_VALUE_CHAR = r"[^\s\"'`;,()\[\]{}<>]"
_VALUE_SENSITIVE_PATTERNS = (
    re.compile(
        r"(?P<head>KIROCREW_PROXY_SECRET[\"']?\s*[=:]\s*[\"']?)"
        r"(?P<value>" + _VALUE_CHAR + r"{8,})"
    ),
    re.compile(
        r"(?P<head>X-App-Secret[\"']?\s*:\s*[\"']?)"
        r"(?P<value>" + _VALUE_CHAR + r"{8,})",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?P<head>mc_(?:token|refresh)_\d+[\"']?\s*[=:\t]\s*[\"']?)"
        r"(?P<value>" + _VALUE_CHAR + r"{16,})"
    ),
    # An HTTP authorization credential: the scheme stays, the token goes
    # (2026-11-16; the payload-safety property found one surviving as a path).
    re.compile(
        r"(?P<head>\b(?:Bearer|Basic)[ \t]+)"
        r"(?P<value>[A-Za-z0-9._~+/-]{16,}=*)",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?P<head>(?:api[_-]?key|secret|token|password)"
        r"(?:[_-][A-Za-z0-9]+)*[\"']?\s*(?::=|=>|[:=])\s*[\"'])"
        r"(?P<value>[^\"'\s]{16,})(?P<tail>[\"'])",
        re.IGNORECASE,
    ),
)


def deep_redact(
    value: JSONValue,
    known_secrets: Iterable[str | None] = (),
    *,
    limits: RedactionLimits = DEFAULT_LIMITS,
) -> JSONValue:
    """Return a recursively redacted copy of a bounded canonical JSON value.

    Known secrets are removed through the foundation string redactor, so raw,
    percent-encoded, and partly encoded occurrences share the same behavior.
    Every string below a credential-like object key is replaced wholesale.
    Other strings have recognized credential patterns and Home_Path prefixes
    replaced in place.

    Object keys are redacted too. If distinct keys would collapse to the same
    output key, every member of that collision group receives a deterministic
    ``[redacted-key-N]`` placeholder. This preserves object cardinality and
    remains stable on repeated calls.
    """

    secrets = _normalize_secrets(known_secrets)
    _validate_json_tree(value, limits)
    return _redact_node(value, secrets, sensitive_context=False)


def detect_residual(
    value: JSONValue,
    known_secrets: Iterable[str | None] = (),
    *,
    forbidden_document_bodies: Iterable[str] = (),
    limits: RedactionLimits = DEFAULT_LIMITS,
) -> RedactionResidual | None:
    """Return the first category-only disclosure finding, or ``None``.

    This is the writer's fail-closed post-redaction check. It scans object keys
    as well as values and recognizes sensitive strings below credential keys.
    Forbidden document bodies are caller-supplied exact strings; their content
    is never copied into the result or an exception.
    """

    secrets = _normalize_secrets(known_secrets)
    bodies = _normalize_document_bodies(forbidden_document_bodies, limits)
    _validate_json_tree(value, limits)
    return _find_residual(value, secrets, bodies, sensitive_context=False)


# Longer name for call sites that benefit from making the boundary explicit.
detect_redaction_residual = detect_residual


def _redact_node(
    value: JSONValue,
    secrets: tuple[str, ...],
    *,
    sensitive_context: bool,
) -> JSONValue:
    if type(value) is str:
        text = cast(str, value)
        if sensitive_context:
            return MARKER if text != MARKER else text
        return _redact_text(text, secrets)
    if type(value) is list:
        return [
            _redact_node(item, secrets, sensitive_context=sensitive_context)
            for item in cast(list[JSONValue], value)
        ]
    if type(value) is dict:
        source = cast(dict[str, JSONValue], value)
        redacted_keys = {key: _redact_text(key, secrets) for key in source}
        safe_keys = _collision_safe_keys(redacted_keys)
        return {
            safe_keys[key]: _redact_node(
                item,
                secrets,
                sensitive_context=(sensitive_context or _is_credential_key(key)),
            )
            for key, item in source.items()
        }
    return value


def _redact_text(text: str, secrets: tuple[str, ...]) -> str:
    result = _rewrite_unprotected(text, _replace_home_paths)
    if secrets:
        result = _rewrite_unprotected(result, lambda part: redact(part, secrets))
    result = _redact_sensitive_patterns(result)
    # A pattern replacement can expose two previously separated pieces. One
    # final known-secret pass catches ordinary leftovers while treating the
    # fixed marker as opaque for idempotence.
    if secrets:
        result = _rewrite_unprotected(result, lambda part: redact(part, secrets))
    return result


def _replace_home_paths(text: str) -> str:
    return _HOME_PATH.sub(HOME_MARKER, text)


def _redact_sensitive_patterns(text: str) -> str:
    result = text
    for pattern in _DIRECT_SENSITIVE_PATTERNS:
        result = _rewrite_unprotected(
            result, lambda part, p=pattern: p.sub(MARKER, part)
        )
    for pattern in _VALUE_SENSITIVE_PATTERNS:
        result = _rewrite_unprotected(
            result,
            lambda part, p=pattern: p.sub(_replace_sensitive_value, part),
        )
    return result


def _replace_sensitive_value(match: re.Match[str]) -> str:
    whole = match.group(0)
    start = match.start("value") - match.start()
    end = match.end("value") - match.start()
    return whole[:start] + MARKER + whole[end:]


def _rewrite_unprotected(text: str, transform: Callable[[str], str]) -> str:
    """Apply ``transform`` outside stable redaction placeholders."""

    parts: list[str] = []
    position = 0
    for match in _OPAQUE_MARKER.finditer(text):
        parts.append(transform(text[position : match.start()]))
        parts.append(match.group(0))
        position = match.end()
    parts.append(transform(text[position:]))
    return "".join(parts)


def _collision_safe_keys(redacted_keys: dict[str, str]) -> dict[str, str]:
    counts = Counter(redacted_keys.values())
    groups: dict[str, list[str]] = defaultdict(list)
    for original, candidate in redacted_keys.items():
        if counts[candidate] > 1:
            groups[candidate].append(original)

    result = {
        original: candidate
        for original, candidate in redacted_keys.items()
        if counts[candidate] == 1
    }
    unavailable = set(redacted_keys.values())
    unavailable.update(result.values())
    ordinal = 1
    for candidate in sorted(groups):
        for original in sorted(groups[candidate]):
            while True:
                placeholder = f"{KEY_COLLISION_PREFIX}{ordinal}]"
                ordinal += 1
                if placeholder not in unavailable:
                    break
            result[original] = placeholder
            unavailable.add(placeholder)
    return result


def _is_credential_key(key: str) -> bool:
    decoded = key
    for _ in range(3):
        updated = unquote_plus(decoded)
        if updated == decoded:
            break
        decoded = updated
    separated = _CAMEL_BOUNDARY.sub("_", decoded)
    normalized = _KEY_SEPARATOR.sub("_", separated).strip("_").lower()
    if normalized in _CREDENTIAL_KEY_EXACT:
        return True
    return any(
        normalized == suffix or normalized.endswith("_" + suffix)
        for suffix in _CREDENTIAL_KEY_SUFFIXES
    )


def _find_residual(
    value: JSONValue,
    secrets: tuple[str, ...],
    bodies: tuple[str, ...],
    *,
    sensitive_context: bool,
) -> RedactionResidual | None:
    if type(value) is str:
        return _string_residual(
            cast(str, value),
            secrets,
            bodies,
            sensitive_context=sensitive_context,
        )
    if type(value) is list:
        for item in cast(list[JSONValue], value):
            found = _find_residual(
                item,
                secrets,
                bodies,
                sensitive_context=sensitive_context,
            )
            if found is not None:
                return found
        return None
    if type(value) is dict:
        for key, item in cast(dict[str, JSONValue], value).items():
            found = _string_residual(
                key, secrets, bodies, sensitive_context=False
            )
            if found is not None:
                return found
            found = _find_residual(
                item,
                secrets,
                bodies,
                sensitive_context=(sensitive_context or _is_credential_key(key)),
            )
            if found is not None:
                return found
    return None


def _string_residual(
    text: str,
    secrets: tuple[str, ...],
    bodies: tuple[str, ...],
    *,
    sensitive_context: bool,
) -> RedactionResidual | None:
    if secrets and _rewrite_unprotected(
        text, lambda part: redact(part, secrets)
    ) != text:
        return RedactionResidual(ResidualCategory.KNOWN_SECRET)
    if sensitive_context and text != MARKER:
        return RedactionResidual(ResidualCategory.SENSITIVE_VALUE)
    if _redact_sensitive_patterns(text) != text:
        return RedactionResidual(ResidualCategory.SENSITIVE_VALUE)
    if _rewrite_unprotected(text, _replace_home_paths) != text:
        return RedactionResidual(ResidualCategory.HOME_PATH)
    if bodies and _contains_unprotected_literal(text, bodies):
        return RedactionResidual(ResidualCategory.FORBIDDEN_DOCUMENT_BODY)
    return None


def _contains_unprotected_literal(text: str, needles: tuple[str, ...]) -> bool:
    position = 0
    for marker in _OPAQUE_MARKER.finditer(text):
        part = text[position : marker.start()]
        if any(needle in part for needle in needles):
            return True
        position = marker.end()
    return any(needle in text[position:] for needle in needles)


def _normalize_secrets(secrets: Iterable[str | None]) -> tuple[str, ...]:
    normalized: list[str] = []
    seen: set[str] = set()
    for secret in secrets:
        if secret is None or secret == "":
            continue
        if type(secret) is not str:
            raise DeepRedactionError(RedactionErrorCode.INVALID_SECRET)
        try:
            size = len(secret.encode("utf-8"))
        except UnicodeEncodeError:
            raise DeepRedactionError(RedactionErrorCode.INVALID_SECRET) from None
        if size > MAX_KNOWN_SECRET_BYTES:
            raise DeepRedactionError(RedactionErrorCode.SECRET_TOO_LARGE)
        if secret not in seen:
            seen.add(secret)
            normalized.append(secret)
            if len(normalized) > MAX_KNOWN_SECRETS:
                raise DeepRedactionError(RedactionErrorCode.TOO_MANY_SECRETS)
    return tuple(normalized)


def _normalize_document_bodies(
    bodies: Iterable[str], limits: RedactionLimits
) -> tuple[str, ...]:
    normalized: list[str] = []
    seen: set[str] = set()
    for body in bodies:
        if type(body) is not str:
            raise DeepRedactionError(RedactionErrorCode.INVALID_JSON)
        if body == "":
            continue
        _encoded_size(body, limits.max_string_bytes)
        if body not in seen:
            seen.add(body)
            normalized.append(body)
    return tuple(normalized)


def _validate_json_tree(value: object, limits: RedactionLimits) -> None:
    if (
        type(limits.max_depth) is not int
        or type(limits.max_nodes) is not int
        or type(limits.max_string_bytes) is not int
        or type(limits.max_total_string_bytes) is not int
        or min(
            limits.max_depth,
            limits.max_nodes,
            limits.max_string_bytes,
            limits.max_total_string_bytes,
        )
        < 1
    ):
        raise DeepRedactionError(RedactionErrorCode.INVALID_LIMIT)

    stack: list[tuple[object, int, bool]] = [(value, 0, False)]
    active_containers: set[int] = set()
    nodes = 0
    total_string_bytes = 0

    while stack:
        current, depth, leaving = stack.pop()
        if leaving:
            active_containers.remove(id(current))
            continue

        nodes += 1
        if nodes > limits.max_nodes:
            raise DeepRedactionError(RedactionErrorCode.NODE_LIMIT)
        if depth > limits.max_depth:
            raise DeepRedactionError(RedactionErrorCode.DEPTH_LIMIT)

        if current is None or type(current) is bool or type(current) is int:
            continue
        if type(current) is float:
            if not math.isfinite(cast(float, current)):
                raise DeepRedactionError(RedactionErrorCode.NON_FINITE_NUMBER)
            continue
        if type(current) is str:
            total_string_bytes += _encoded_size(
                cast(str, current), limits.max_string_bytes
            )
        elif type(current) is list:
            container_id = id(current)
            if container_id in active_containers:
                raise DeepRedactionError(RedactionErrorCode.INVALID_JSON)
            active_containers.add(container_id)
            stack.append((current, depth, True))
            for item in reversed(cast(list[object], current)):
                stack.append((item, depth + 1, False))
        elif type(current) is dict:
            container_id = id(current)
            if container_id in active_containers:
                raise DeepRedactionError(RedactionErrorCode.INVALID_JSON)
            active_containers.add(container_id)
            stack.append((current, depth, True))
            for key, item in reversed(list(cast(dict[object, object], current).items())):
                if type(key) is not str:
                    raise DeepRedactionError(RedactionErrorCode.INVALID_JSON)
                nodes += 1
                if nodes > limits.max_nodes:
                    raise DeepRedactionError(RedactionErrorCode.NODE_LIMIT)
                total_string_bytes += _encoded_size(
                    cast(str, key), limits.max_string_bytes
                )
                stack.append((item, depth + 1, False))
        else:
            raise DeepRedactionError(RedactionErrorCode.INVALID_JSON)

        if total_string_bytes > limits.max_total_string_bytes:
            raise DeepRedactionError(RedactionErrorCode.TOTAL_STRING_LIMIT)


def _encoded_size(text: str, maximum: int) -> int:
    try:
        size = len(text.encode("utf-8"))
    except UnicodeEncodeError:
        raise DeepRedactionError(RedactionErrorCode.INVALID_UTF8) from None
    if size > maximum:
        raise DeepRedactionError(RedactionErrorCode.STRING_LIMIT)
    return size
