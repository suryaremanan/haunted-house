"""Remove secrets from text before it leaves the process.

Every log line, exception message and returned error that might hold the app
secret or the app token goes through ``redact`` first.

Pure: no network, filesystem or clock.
"""

from __future__ import annotations

import re
from collections.abc import Iterable

__all__ = ["MARKER", "redact"]

MARKER = "[redacted]"


def redact(text: str, secrets: Iterable[str | None]) -> str:
    """Replace every occurrence of each secret in ``text`` with ``[redacted]``.

    A secret is matched in its raw form and in any percent-encoded form: each
    character may appear as itself or as its UTF-8 ``%XX`` bytes (either hex
    case), and a space may also appear as ``+``. That covers
    ``quote(s, safe="")``, ``quote_plus(s)`` and ``quote(s)``, plus partly
    decoded URLs such as the ones HTTP libraries print in error messages.

    Overlapping occurrences are all covered, and touching ones collapse into
    one marker. Replacement repeats until no secret can be found, so the
    marker plus nearby text can never spell a secret either. The one case
    that can't be cleaned is a secret that is itself part of the text
    ``[redacted]``; its occurrences in ``text`` are still replaced.

    ``None`` and empty secrets are ignored, so callers can pass a token they
    may not hold yet.
    """
    patterns = [_finder(s) for s in dict.fromkeys(secrets) if s]
    if not any(p.search(text) for p in patterns):
        return text

    # One item per literal character; None stands for one MARKER.
    items: list[str | None] = list(text)
    while True:
        rendered, owner = _render(items)
        hit: set[int] = set()
        for pattern in patterns:
            for match in pattern.finditer(rendered):
                hit.update(owner[match.start(1) : match.end(1)])
        if all(items[i] is None for i in hit):
            # Nothing left but matches inside a marker (or no matches).
            return rendered
        items = _mask(items, hit)


def _finder(secret: str) -> re.Pattern[str]:
    # Zero-width lookahead so finditer reports a match at every start
    # position, including overlapping ones.
    return re.compile("(?=(" + "".join(_char_pattern(c) for c in secret) + "))")


def _char_pattern(char: str) -> str:
    encoded = "".join(f"%{b:02X}" for b in char.encode("utf-8", "surrogatepass"))
    options = [re.escape(char), f"(?i:{encoded})"]
    if char == " ":
        options.append(r"\+")
    return "(?:" + "|".join(options) + ")"


def _render(items: list[str | None]) -> tuple[str, list[int]]:
    parts: list[str] = []
    owner: list[int] = []
    for index, item in enumerate(items):
        piece = MARKER if item is None else item
        parts.append(piece)
        owner.extend([index] * len(piece))
    return "".join(parts), owner


def _mask(items: list[str | None], hit: set[int]) -> list[str | None]:
    # Each run of hit items and markers becomes a single marker, so markers
    # stay separated by at least one literal character. Every call turns at
    # least one literal into part of a marker, so the loop in redact ends.
    masked: list[str | None] = []
    for index, item in enumerate(items):
        if index in hit or item is None:
            if not masked or masked[-1] is not None:
                masked.append(None)
        else:
            masked.append(item)
    return masked
