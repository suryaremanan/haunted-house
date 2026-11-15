"""Pure relative-path parsing and Room_Policy evaluation.

This module decides; it never touches the filesystem.  An adapter collects
:class:`PathEvidence` with no-follow, descriptor-relative operations and asks
this module whether the access is inside Effective_Room_Policy.

Rules are component based.  A deny rule or a Protected_Path always overrides
an allow rule, and an approval can only *add* a requirement: it never widens
what a room may reach.  Protected and deny matching is case-insensitive
because a case-insensitive volume would otherwise let ``.GIT`` reach ``.git``.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from enum import StrEnum
from typing import Literal, TypeAlias

__all__ = [
    "ALL_ACCESS",
    "GHOST_ROLES",
    "MAX_PATH_BYTES",
    "MAX_PATH_COMPONENTS",
    "MAX_SEGMENT_BYTES",
    "PROTECTED_RULES",
    "RISKY_ACCESS",
    "SPEC_DOCUMENT_BY_ROLE",
    "Access",
    "EntryKind",
    "PathDecision",
    "PathDecisionCode",
    "PathError",
    "PathErrorCode",
    "PathEvidence",
    "PathRule",
    "RoomPolicy",
    "authorize_access",
    "evaluate_path",
    "is_protected",
    "is_valid_spec_name",
    "join_parts",
    "parse_relative_path",
    "policy_allows",
    "room_policy",
    "rule",
    "spec_document_parts",
]

MAX_PATH_BYTES = 1024
MAX_PATH_COMPONENTS = 32
MAX_SEGMENT_BYTES = 255
_MAX_DECODE_ROUNDS = 4

_PERCENT_ESCAPE = re.compile(r"%[0-9A-Fa-f]{2}")
_SPEC_NAME = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
_MAX_SPEC_NAME_LENGTH = 64
# Separator, control, format, surrogate, private-use, unassigned, and line or
# paragraph separator code points cannot be shown to an operator exactly.
_UNDISPLAYABLE_CATEGORIES = frozenset({"Cc", "Cf", "Cs", "Co", "Cn", "Zl", "Zp"})


class Access(StrEnum):
    LIST = "list"
    READ = "read"
    WRITE = "write"
    DELETE = "delete"
    COMMAND_READ = "command_read"
    COMMAND_WRITE = "command_write"
    GIT_WRITE = "git_write"


ALL_ACCESS = frozenset(Access)
# Accesses that only an exactly approved Risky_Action may perform.
RISKY_ACCESS = frozenset(
    {Access.DELETE, Access.COMMAND_READ, Access.COMMAND_WRITE, Access.GIT_WRITE}
)


class PathErrorCode(StrEnum):
    INVALID_TYPE = "invalid_type"
    EMPTY = "empty"
    TOO_LONG = "too_long"
    TOO_DEEP = "too_deep"
    ABSOLUTE = "absolute"
    EMPTY_SEGMENT = "empty_segment"
    DOT_SEGMENT = "dot_segment"
    PARENT_SEGMENT = "parent_segment"
    BACKSLASH = "backslash"
    NUL = "nul"
    CONTROL = "control"
    ENCODED_TRAVERSAL = "encoded_traversal"
    INVALID_UTF8 = "invalid_utf8"
    NOT_NORMALIZED = "not_normalized"


@dataclass(frozen=True, slots=True)
class PathError:
    """A safe parse failure.  It never carries the rejected path."""

    code: PathErrorCode


def parse_relative_path(raw: object) -> tuple[str, ...] | PathError:
    """Return the components of a clean relative Project_Path, or an error.

    No normalization is performed: a path is either already clean or it is
    rejected, so the returned components spell exactly what the caller sent.
    """

    if type(raw) is not str:
        return PathError(PathErrorCode.INVALID_TYPE)
    if raw == "":
        return PathError(PathErrorCode.EMPTY)
    try:
        encoded = raw.encode("utf-8")
    except UnicodeEncodeError:
        return PathError(PathErrorCode.INVALID_UTF8)
    if len(encoded) > MAX_PATH_BYTES:
        return PathError(PathErrorCode.TOO_LONG)
    if "\x00" in raw:
        return PathError(PathErrorCode.NUL)
    if "\\" in raw:
        return PathError(PathErrorCode.BACKSLASH)
    if any(unicodedata.category(char) in _UNDISPLAYABLE_CATEGORIES for char in raw):
        return PathError(PathErrorCode.CONTROL)
    if raw.startswith("/"):
        return PathError(PathErrorCode.ABSOLUTE)
    if unicodedata.normalize("NFC", raw) != raw:
        return PathError(PathErrorCode.NOT_NORMALIZED)

    parts = tuple(raw.split("/"))
    if len(parts) > MAX_PATH_COMPONENTS:
        return PathError(PathErrorCode.TOO_DEEP)
    for part in parts:
        if part == "":
            return PathError(PathErrorCode.EMPTY_SEGMENT)
        if part == ".":
            return PathError(PathErrorCode.DOT_SEGMENT)
        if part == "..":
            return PathError(PathErrorCode.PARENT_SEGMENT)
        if len(part.encode("utf-8")) > MAX_SEGMENT_BYTES:
            return PathError(PathErrorCode.TOO_LONG)
        if _is_encoded_traversal(part):
            return PathError(PathErrorCode.ENCODED_TRAVERSAL)
    return parts


def join_parts(parts: tuple[str, ...]) -> str:
    """Spell parsed components as the one canonical relative path."""

    return "/".join(parts)


def _is_encoded_traversal(segment: str) -> bool:
    """Whether any percent-decoding of ``segment`` is traversal shaped."""

    current = segment
    for _ in range(_MAX_DECODE_ROUNDS):
        if _PERCENT_ESCAPE.search(current) is None:
            return False
        decoded = _percent_decode(current)
        if decoded is None:
            return True
        if (
            decoded in ("", ".", "..")
            or "/" in decoded
            or "\\" in decoded
            or any(
                unicodedata.category(char) in _UNDISPLAYABLE_CATEGORIES
                for char in decoded
            )
        ):
            return True
        current = decoded
    # Still encoded after every round: too deep to reason about, so refuse.
    return _PERCENT_ESCAPE.search(current) is not None


def _percent_decode(text: str) -> str | None:
    raw = bytearray()
    index = 0
    while index < len(text):
        if _PERCENT_ESCAPE.match(text, index):
            raw.append(int(text[index + 1 : index + 3], 16))
            index += 3
        else:
            raw.extend(text[index].encode("utf-8"))
            index += 1
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return None


# --- rules -------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class PathRule:
    """One component pattern and the accesses it covers.

    A pattern component is a literal, a component glob using ``*`` (which
    never crosses a ``/``), or ``**`` for zero or more whole components.
    """

    pattern: tuple[str, ...]
    accesses: frozenset[Access]


@dataclass(frozen=True, slots=True)
class RoomPolicy:
    room: str
    allow: tuple[PathRule, ...]
    deny: tuple[PathRule, ...]


def rule(pattern: str, *accesses: Access) -> PathRule:
    """Build a rule from a ``/`` separated pattern; no access means all."""

    return PathRule(
        pattern=tuple(pattern.split("/")),
        accesses=frozenset(accesses) if accesses else ALL_ACCESS,
    )


def _component_matches(pattern: str, part: str, *, fold: bool) -> bool:
    if fold:
        pattern = pattern.casefold()
        part = part.casefold()
    if "*" not in pattern:
        return pattern == part
    pieces = pattern.split("*")
    if not part.startswith(pieces[0]):
        return False
    position = len(pieces[0])
    for piece in pieces[1:-1]:
        found = part.find(piece, position)
        if found < 0:
            return False
        position = found + len(piece)
    tail = pieces[-1]
    return len(part) - position >= len(tail) and part.endswith(tail)


def _matches(pattern: tuple[str, ...], parts: tuple[str, ...], *, fold: bool) -> bool:
    if not pattern:
        return not parts
    head = pattern[0]
    if head == "**":
        return any(
            _matches(pattern[1:], parts[skip:], fold=fold)
            for skip in range(len(parts) + 1)
        )
    if not parts:
        return False
    return _component_matches(head, parts[0], fold=fold) and _matches(
        pattern[1:], parts[1:], fold=fold
    )


def _any_rule(
    rules: tuple[PathRule, ...],
    access: Access,
    parts: tuple[str, ...],
    *,
    fold: bool,
) -> bool:
    return any(
        access in item.accesses and _matches(item.pattern, parts, fold=fold)
        for item in rules
    )


_CONTROL_DIRECTORY = "." + "haunted-house"
_NOT_GIT_WRITE = frozenset(ALL_ACCESS - {Access.GIT_WRITE})

# Protected_Paths apply to every room and cannot be granted by any allow rule.
# Repository metadata is closed to every direct tool; only the structured git
# action may ask for GIT_WRITE there, and only where a room allows it.
PROTECTED_RULES: tuple[PathRule, ...] = (
    rule(f"**/{_CONTROL_DIRECTORY}"),
    rule(f"**/{_CONTROL_DIRECTORY}/**"),
    PathRule(("**", ".git"), _NOT_GIT_WRITE),
    PathRule(("**", ".git", "**"), _NOT_GIT_WRITE),
) + tuple(
    rule(pattern)
    for pattern in (
        "**/.env",
        "**/.env.*",
        "**/.envrc",
        "**/.netrc",
        "**/.npmrc",
        "**/.pypirc",
        "**/.git-credentials",
        "**/.ssh",
        "**/.ssh/**",
        "**/.aws",
        "**/.aws/**",
        "**/.gnupg",
        "**/.gnupg/**",
        "**/.kube",
        "**/.kube/**",
        "**/.docker",
        "**/.docker/**",
        "**/id_rsa*",
        "**/id_dsa*",
        "**/id_ecdsa*",
        "**/id_ed25519*",
        "**/*.pem",
        "**/*.key",
        "**/*.p12",
        "**/*.pfx",
        "**/*.keystore",
        "**/*.jks",
        "**/credentials",
        "**/credentials.*",
        "**/secrets",
        "**/secrets.*",
        "**/*.secret",
    )
)


def is_protected(access: Access, parts: tuple[str, ...]) -> bool:
    return _any_rule(PROTECTED_RULES, access, parts, fold=True)


def policy_allows(policy: RoomPolicy, access: Access, parts: tuple[str, ...]) -> bool:
    """Whether Effective_Room_Policy grants ``access`` to clean components.

    Deny overrides allow.  ``parts`` must come from
    :func:`parse_relative_path`; anything traversal shaped is refused here
    too so a caller that skipped parsing still fails closed.
    """

    if not isinstance(access, Access):
        return False
    if any(
        type(part) is not str or part in ("", ".", "..") or "/" in part or "\\" in part
        for part in parts
    ):
        return False
    if is_protected(access, parts):
        return False
    if _any_rule(policy.deny, access, parts, fold=True):
        return False
    return _any_rule(policy.allow, access, parts, fold=False)


# --- evidence ----------------------------------------------------------------

EntryKind: TypeAlias = Literal["missing", "file", "directory", "other"]


@dataclass(frozen=True, slots=True)
class PathEvidence:
    """Filesystem facts an adapter collected without following links."""

    parts: tuple[str, ...]
    inside_mansion: bool
    symlink_component: bool
    kind: EntryKind
    link_count: int = 1


class PathDecisionCode(StrEnum):
    OK = "ok"
    OUTSIDE_MANSION = "outside_mansion"
    SYMLINK = "symlink"
    PROTECTED_PATH = "protected_path"
    ROOM_POLICY = "room_policy"
    NOT_REGULAR = "not_regular"
    HARD_LINK = "hard_link"
    APPROVAL_REQUIRED = "approval_required"


@dataclass(frozen=True, slots=True)
class PathDecision:
    allowed: bool
    code: PathDecisionCode


def _deny(code: PathDecisionCode) -> PathDecision:
    return PathDecision(allowed=False, code=code)


def evaluate_path(
    evidence: PathEvidence, policy: RoomPolicy, access: Access
) -> PathDecision:
    """Combine collected evidence with Effective_Room_Policy."""

    if not evidence.inside_mansion:
        return _deny(PathDecisionCode.OUTSIDE_MANSION)
    if evidence.symlink_component:
        return _deny(PathDecisionCode.SYMLINK)
    if not isinstance(access, Access):
        return _deny(PathDecisionCode.ROOM_POLICY)
    if is_protected(access, evidence.parts):
        return _deny(PathDecisionCode.PROTECTED_PATH)
    if not policy_allows(policy, access, evidence.parts):
        return _deny(PathDecisionCode.ROOM_POLICY)
    if evidence.kind == "other":
        return _deny(PathDecisionCode.NOT_REGULAR)
    if evidence.kind == "file" and evidence.link_count != 1:
        return _deny(PathDecisionCode.HARD_LINK)
    return PathDecision(allowed=True, code=PathDecisionCode.OK)


def authorize_access(
    evidence: PathEvidence,
    policy: RoomPolicy,
    access: Access,
    *,
    exact_approval: bool,
) -> PathDecision:
    """Final authorization: the path decision plus any required approval.

    The path is judged first, so an approval never widens the policy.
    """

    decision = evaluate_path(evidence, policy, access)
    if not decision.allowed:
        return decision
    if access in RISKY_ACCESS and exact_approval is not True:
        return _deny(PathDecisionCode.APPROVAL_REQUIRED)
    return decision


# --- fixed room allowlists ----------------------------------------------------

SPEC_DOCUMENT_BY_ROLE = {
    "archivist": "requirements.md",
    "draughtsman": "design.md",
    "foreman": "tasks.md",
}
_ROOM_BY_ROLE = {
    "archivist": "study",
    "draughtsman": "drafting_room",
    "foreman": "workshop",
    "tinker": "workshop",
}
GHOST_ROLES = frozenset(_ROOM_BY_ROLE)

_READ_ONLY = (Access.LIST, Access.READ)
_MUTATING = (Access.WRITE, Access.DELETE, Access.COMMAND_WRITE)


def is_valid_spec_name(value: object) -> bool:
    return (
        type(value) is str
        and len(value) <= _MAX_SPEC_NAME_LENGTH
        and _SPEC_NAME.fullmatch(value) is not None
    )


def spec_document_parts(spec_name: str, document: str) -> tuple[str, ...]:
    return (".kiro", "specs", spec_name, document)


def room_policy(role: str, spec_name: str) -> RoomPolicy | None:
    """The fixed Room_Policy of one Ghost role for the active spec.

    The backend supplies ``spec_name``; it is never model input.  An unknown
    role or malformed spec name yields ``None`` so callers fail closed.
    """

    if role not in _ROOM_BY_ROLE or not is_valid_spec_name(spec_name):
        return None
    room = _ROOM_BY_ROLE[role]
    read_all = (rule("**", *_READ_ONLY),)
    if role == "tinker":
        return RoomPolicy(
            room=room,
            allow=read_all
            + (
                rule(
                    "**",
                    Access.WRITE,
                    Access.DELETE,
                    Access.COMMAND_READ,
                    Access.COMMAND_WRITE,
                    Access.GIT_WRITE,
                ),
            ),
            # Tinkers never change Kiro control data or any Spec_Document.
            deny=(rule(".kiro", *_MUTATING), rule(".kiro/**", *_MUTATING)),
        )
    document = SPEC_DOCUMENT_BY_ROLE[role]
    return RoomPolicy(
        room=room,
        allow=read_all
        + (PathRule(spec_document_parts(spec_name, document), frozenset({Access.WRITE})),),
        deny=(),
    )
