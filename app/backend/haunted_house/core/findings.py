"""The one deterministic Finding shape of Room Ghosts artifact validation.

A Finding is what a validator hands back to a ghost, the API, or a room
panel.  It carries a stable ``code``, a short ``location`` built only from
identifiers this module could prove safe, and a fixed ``message`` chosen by
code.  Model-authored text never reaches a Finding: a location part that is
not a short identifier is replaced by ``?``.

Pure: no I/O, no clock, standard library only.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Final

__all__ = [
    "MAX_FINDINGS",
    "MAX_LOCATION_CHARS",
    "MAX_MESSAGE_CHARS",
    "TRUNCATED_CODE",
    "Finding",
    "bound_findings",
    "finding",
    "safe_location",
]

MAX_FINDINGS: Final = 50
MAX_LOCATION_CHARS: Final = 96
MAX_MESSAGE_CHARS: Final = 200
TRUNCATED_CODE: Final = "findings_truncated"

_CODE = re.compile(r"[a-z][a-z0-9_]{0,63}")
_KIND = re.compile(r"[a-z][a-z_]{0,23}")
# What a location may quote: identifiers, decimal ids, and plain headings.
_SAFE_PART = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9 ._-]{0,62}[A-Za-z0-9._-])?")


@dataclass(frozen=True, slots=True)
class Finding:
    """One validation result: stable code, safe location, bounded message."""

    code: str
    location: str
    message: str

    def __post_init__(self) -> None:
        if type(self.code) is not str or _CODE.fullmatch(self.code) is None:
            raise ValueError("finding code")
        if type(self.location) is not str or not 1 <= len(self.location) <= MAX_LOCATION_CHARS:
            raise ValueError("finding location")
        if type(self.message) is not str or not 1 <= len(self.message) <= MAX_MESSAGE_CHARS:
            raise ValueError("finding message")


def safe_location(kind: str, part: object = None) -> str:
    """Spell ``kind`` or ``kind:part``; an unprovable part becomes ``?``."""

    if _KIND.fullmatch(kind) is None:
        raise ValueError("location kind")
    if part is None:
        return kind
    if type(part) is int:
        text = str(part) if -(10**9) < part < 10**9 else "?"
    elif type(part) is str and _SAFE_PART.fullmatch(part) is not None:
        text = part
    else:
        text = "?"
    return f"{kind}:{text}"


def finding(code: str, message: str, kind: str, part: object = None) -> Finding:
    return Finding(code=code, location=safe_location(kind, part), message=message)


def bound_findings(findings: Iterable[Finding]) -> tuple[Finding, ...]:
    """Drop exact repeats, keep first-seen order, and cap the count.

    When the cap cuts findings, the last kept slot says so instead of
    silently looking complete.
    """

    kept: list[Finding] = []
    seen: set[Finding] = set()
    truncated = False
    for item in findings:
        if item in seen:
            continue
        if len(kept) == MAX_FINDINGS:
            truncated = True
            break
        seen.add(item)
        kept.append(item)
    if truncated:
        kept[-1] = Finding(
            code=TRUNCATED_CODE,
            location="document",
            message=f"More than {MAX_FINDINGS - 1} findings; fix the listed ones first.",
        )
    return tuple(kept)
