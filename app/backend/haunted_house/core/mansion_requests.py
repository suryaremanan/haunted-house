"""Pure parsing for mansion create and open request bodies."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

__all__ = [
    "INVALID_REQUEST_CODE",
    "InvalidRequest",
    "MansionRequest",
    "parse_mansion_request",
]

INVALID_REQUEST_CODE = "invalid_request"


@dataclass(frozen=True, slots=True)
class MansionRequest:
    """The immutable command shape shared by create and open operations."""

    name: str


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
