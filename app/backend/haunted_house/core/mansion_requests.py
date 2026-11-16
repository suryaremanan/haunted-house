"""Pure parsing for mansion create and open request bodies."""

from __future__ import annotations

import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass

__all__ = [
    "INVALID_REQUEST_CODE",
    "MAX_BRIEF_CHARS",
    "InvalidRequest",
    "MansionRequest",
    "normalize_mansion_brief",
    "parse_create_mansion_request",
    "parse_mansion_request",
]

INVALID_REQUEST_CODE = "invalid_request"

# The feature brief is counted in Unicode code points, after line endings are
# normalised and surrounding whitespace is trimmed. The UI counts the same way.
MAX_BRIEF_CHARS = 2000

# Line feed and tab are the only control characters a brief may hold.
_ALLOWED_CONTROLS = frozenset("\n\t")


@dataclass(frozen=True, slots=True)
class MansionRequest:
    """The immutable command shape shared by create and open operations.

    ``brief`` is only ever set by the create parser: a normalised, non-empty
    feature brief, or None when none was sent (or it was blank).
    """

    name: str
    brief: str | None = None


class InvalidRequest(ValueError):
    """Raised when a mansion request body does not have the exact shape."""

    code = INVALID_REQUEST_CODE

    def __init__(self) -> None:
        super().__init__(self.code)


def parse_mansion_request(value: object) -> MansionRequest:
    """Parse exactly one string field named ``name``.

    This parser validates request shape only. Mansion name-language validation
    is a separate service step so it can map to ``invalid_mansion_name``.
    """
    if not isinstance(value, Mapping) or len(value) != 1 or "name" not in value:
        raise InvalidRequest

    name = value["name"]
    if not isinstance(name, str):
        raise InvalidRequest

    return MansionRequest(name=name)


def parse_create_mansion_request(value: object) -> MansionRequest:
    """Parse ``{"name": <string>}`` or ``{"name": <string>, "brief": <string>}``.

    Any other key, a non-string value, or a brief that fails
    ``normalize_mansion_brief`` is ``invalid_request``. A blank brief is the
    same as no brief.
    """
    if not isinstance(value, Mapping) or "name" not in value:
        raise InvalidRequest
    if len(value) == 1:
        return parse_mansion_request(value)
    if len(value) != 2 or "brief" not in value:
        raise InvalidRequest

    name = value["name"]
    if not isinstance(name, str):
        raise InvalidRequest
    return MansionRequest(name=name, brief=normalize_mansion_brief(value["brief"]))


def normalize_mansion_brief(value: object) -> str | None:
    """Return the trimmed brief, None when blank, or raise ``InvalidRequest``.

    CRLF and lone CR become LF. Control characters other than LF and tab
    (Unicode category Cc, which covers C0, DEL and C1) are refused, as are
    unpaired surrogates. More than ``MAX_BRIEF_CHARS`` code points is refused.
    """
    if not isinstance(value, str):
        raise InvalidRequest
    text = value.replace("\r\n", "\n").replace("\r", "\n")
    # Checked before trimming: str.strip() would silently drop some controls
    # (for example U+001C-U+001F and U+0085) at the ends.
    for char in text:
        category = unicodedata.category(char)
        if (category == "Cc" and char not in _ALLOWED_CONTROLS) or category == "Cs":
            raise InvalidRequest
    text = text.strip()
    if len(text) > MAX_BRIEF_CHARS:
        raise InvalidRequest
    return text or None
