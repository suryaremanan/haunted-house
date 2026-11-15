"""Strict, canonical codec for app-owned mansion metadata.

The registry stores names and root-relative path components only. This module is
pure: it performs no filesystem, network, or clock access.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Literal, TypeAlias, cast

from haunted_house.core.mansion_names import is_valid_mansion_name

REGISTRY_SCHEMA_VERSION = 1

MansionOrigin: TypeAlias = Literal["created", "existing"]

_RECORD_FIELDS = frozenset({"name", "projectSpec", "relativePath", "origin"})
_REGISTRY_FIELDS = frozenset({"schemaVersion", "mansions"})
_VALID_ORIGINS = frozenset({"created", "existing"})


class RegistryCodecError(ValueError):
    """Raised when registry data does not satisfy the versioned schema."""


@dataclass(frozen=True, order=True, slots=True)
class MansionRecord:
    """One immutable app-owned mansion registration."""

    name: str
    project_spec: str
    relative_path: str
    origin: MansionOrigin

    def __post_init__(self) -> None:
        if not is_valid_mansion_name(self.name):
            raise RegistryCodecError("record name is not a valid mansion name")
        if not isinstance(self.project_spec, str) or self.project_spec != self.name:
            raise RegistryCodecError("record projectSpec must equal name")
        if not isinstance(self.relative_path, str) or self.relative_path != self.name:
            raise RegistryCodecError("record relativePath must equal name")
        if not isinstance(self.origin, str) or self.origin not in _VALID_ORIGINS:
            raise RegistryCodecError("record origin is unsupported")


@dataclass(frozen=True, slots=True)
class MansionRegistry:
    """An immutable, schema-versioned collection of unique mansion records."""

    schema_version: Literal[1] = REGISTRY_SCHEMA_VERSION
    mansions: tuple[MansionRecord, ...] = ()

    def __post_init__(self) -> None:
        if type(self.schema_version) is not int or self.schema_version != 1:
            raise RegistryCodecError("registry schema version is unsupported")
        if type(self.mansions) is not tuple:
            raise RegistryCodecError("registry mansions must be an immutable tuple")
        if any(not isinstance(record, MansionRecord) for record in self.mansions):
            raise RegistryCodecError("registry contains an invalid mansion record")

        names = tuple(record.name for record in self.mansions)
        if len(set(names)) != len(names):
            raise RegistryCodecError("registry mansion names must be unique")

        ordered = tuple(sorted(self.mansions, key=lambda record: record.name))
        object.__setattr__(self, "mansions", ordered)


def parse_registry(text: str) -> MansionRegistry:
    """Parse JSON text using the exact supported registry schema.

    Duplicate JSON keys, non-standard numeric constants, unknown or missing
    fields, unsupported versions, and invalid records are all refused.
    """

    if not isinstance(text, str):
        raise RegistryCodecError("registry must be JSON text")

    try:
        value = json.loads(
            text,
            object_pairs_hook=_object_from_pairs,
            parse_constant=_reject_json_constant,
        )
    except RegistryCodecError:
        raise
    except (TypeError, ValueError) as error:
        raise RegistryCodecError("registry is not valid JSON") from error

    registry_object = _expect_object(value, "registry")
    _expect_exact_fields(registry_object, _REGISTRY_FIELDS, "registry")

    schema_version = registry_object["schemaVersion"]
    if type(schema_version) is not int or schema_version != REGISTRY_SCHEMA_VERSION:
        raise RegistryCodecError("registry schema version is unsupported")

    raw_mansions = registry_object["mansions"]
    if type(raw_mansions) is not list:
        raise RegistryCodecError("registry mansions must be an array")

    records = tuple(_parse_record(value) for value in raw_mansions)
    return MansionRegistry(schema_version=REGISTRY_SCHEMA_VERSION, mansions=records)


def print_registry(registry: MansionRegistry) -> str:
    """Return the deterministic, human-readable representation of a registry."""

    if not isinstance(registry, MansionRegistry):
        raise RegistryCodecError("value is not a mansion registry")

    document = {
        "schemaVersion": REGISTRY_SCHEMA_VERSION,
        "mansions": [
            {
                "name": record.name,
                "projectSpec": record.project_spec,
                "relativePath": record.relative_path,
                "origin": record.origin,
            }
            for record in sorted(registry.mansions, key=lambda record: record.name)
        ],
    }
    return json.dumps(document, ensure_ascii=False, indent=2, allow_nan=False) + "\n"


def upsert_record(
    registry: MansionRegistry, record: MansionRecord
) -> MansionRegistry:
    """Return a registry containing exactly one record with ``record.name``."""

    if not isinstance(registry, MansionRegistry):
        raise RegistryCodecError("value is not a mansion registry")
    if not isinstance(record, MansionRecord):
        raise RegistryCodecError("value is not a mansion record")

    remaining = tuple(
        current for current in registry.mansions if current.name != record.name
    )
    return MansionRegistry(
        schema_version=REGISTRY_SCHEMA_VERSION,
        mansions=remaining + (record,),
    )


def _parse_record(value: object) -> MansionRecord:
    record_object = _expect_object(value, "mansion record")
    _expect_exact_fields(record_object, _RECORD_FIELDS, "mansion record")

    name = _expect_string(record_object["name"], "record name")
    project_spec = _expect_string(
        record_object["projectSpec"], "record projectSpec"
    )
    relative_path = _expect_string(
        record_object["relativePath"], "record relativePath"
    )
    origin = _expect_string(record_object["origin"], "record origin")

    return MansionRecord(
        name=name,
        project_spec=project_spec,
        relative_path=relative_path,
        origin=cast(MansionOrigin, origin),
    )


def _expect_object(value: object, subject: str) -> dict[str, object]:
    if type(value) is not dict:
        raise RegistryCodecError(f"{subject} must be an object")
    return value


def _expect_exact_fields(
    value: dict[str, object], expected: frozenset[str], subject: str
) -> None:
    if frozenset(value) != expected:
        raise RegistryCodecError(f"{subject} fields do not match the schema")


def _expect_string(value: object, subject: str) -> str:
    if not isinstance(value, str):
        raise RegistryCodecError(f"{subject} must be a string")
    return value


def _object_from_pairs(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise RegistryCodecError("registry JSON contains a duplicate field")
        result[key] = value
    return result


def _reject_json_constant(value: str) -> object:
    raise RegistryCodecError("registry JSON contains a non-standard number")


__all__ = [
    "REGISTRY_SCHEMA_VERSION",
    "MansionOrigin",
    "MansionRecord",
    "MansionRegistry",
    "RegistryCodecError",
    "parse_registry",
    "print_registry",
    "upsert_record",
]
