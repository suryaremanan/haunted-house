"""Pure validation for operator-provided mansion names.

Validation deliberately preserves the caller's value. It performs no coercion,
trimming, case conversion, Unicode normalization, or character substitution.
"""

from __future__ import annotations

import re

__all__ = [
    "MANSION_NAME_PATTERN",
    "MAX_MANSION_NAME_LENGTH",
    "is_valid_mansion_name",
]

MANSION_NAME_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
MAX_MANSION_NAME_LENGTH = 40


def is_valid_mansion_name(value: object) -> bool:
    """Return whether ``value`` is an exact, bounded kebab-case name."""
    return (
        isinstance(value, str)
        and len(value) <= MAX_MANSION_NAME_LENGTH
        and MANSION_NAME_PATTERN.fullmatch(value) is not None
    )
