"""Focused examples for the strict mansion metadata registry codec (task 2.9).

The generated canonical round-trip property belongs to task 2.10 and is not
implemented here.
"""

import ast
import inspect
from dataclasses import FrozenInstanceError

import pytest

from haunted_house.core import mansion_registry
from haunted_house.core.mansion_registry import (
    MansionRecord,
    MansionRegistry,
    RegistryCodecError,
    parse_registry,
    print_registry,
    upsert_record,
)

pytestmark = pytest.mark.core


def record(name: str, origin: str = "created") -> MansionRecord:
    return MansionRecord(
        name=name,
        project_spec=name,
        relative_path=name,
        origin=origin,
    )


def test_parse_accepts_exact_schema_and_normalizes_record_order():
    parsed = parse_registry(
        """{
          "schemaVersion": 1,
          "mansions": [
            {
              "name": "zoo",
              "projectSpec": "zoo",
              "relativePath": "zoo",
              "origin": "existing"
            },
            {
              "name": "alpha",
              "projectSpec": "alpha",
              "relativePath": "alpha",
              "origin": "created"
            }
          ]
        }"""
    )

    assert parsed == MansionRegistry(mansions=(record("alpha"), record("zoo", "existing")))


def test_print_uses_documented_field_order_sorted_records_and_final_newline():
    registry = MansionRegistry(
        mansions=(record("zoo", "existing"), record("alpha"))
    )

    assert print_registry(registry) == """{
  "schemaVersion": 1,
  "mansions": [
    {
      "name": "alpha",
      "projectSpec": "alpha",
      "relativePath": "alpha",
      "origin": "created"
    },
    {
      "name": "zoo",
      "projectSpec": "zoo",
      "relativePath": "zoo",
      "origin": "existing"
    }
  ]
}
"""


@pytest.mark.parametrize(
    "text",
    [
        "",
        "[]",
        '{"schemaVersion":2,"mansions":[]}',
        '{"schemaVersion":true,"mansions":[]}',
        '{"schemaVersion":1}',
        '{"schemaVersion":1,"mansions":[],"selected":null}',
        '{"schemaVersion":1,"mansions":{}}',
        '{"schemaVersion":1,"schemaVersion":1,"mansions":[]}',
        '{"schemaVersion":NaN,"mansions":[]}',
        """{"schemaVersion":1,"mansions":[{
          "name":"demo","projectSpec":"demo","relativePath":"demo"
        }]}""",
        """{"schemaVersion":1,"mansions":[{
          "name":"demo","projectSpec":"demo","relativePath":"demo",
          "origin":"created","extra":true
        }]}""",
        """{"schemaVersion":1,"mansions":[{
          "name":"Demo","projectSpec":"Demo","relativePath":"Demo",
          "origin":"created"
        }]}""",
        """{"schemaVersion":1,"mansions":[{
          "name":"demo","projectSpec":"other","relativePath":"demo",
          "origin":"created"
        }]}""",
        """{"schemaVersion":1,"mansions":[{
          "name":"demo","projectSpec":"demo","relativePath":"/demo",
          "origin":"created"
        }]}""",
        """{"schemaVersion":1,"mansions":[{
          "name":"demo","projectSpec":"demo","relativePath":"demo",
          "origin":"imported"
        }]}""",
        """{"schemaVersion":1,"mansions":[{
          "name":"demo","name":"other","projectSpec":"demo",
          "relativePath":"demo","origin":"created"
        }]}""",
        """{"schemaVersion":1,"mansions":[
          {"name":"demo","projectSpec":"demo","relativePath":"demo","origin":"created"},
          {"name":"demo","projectSpec":"demo","relativePath":"demo","origin":"existing"}
        ]}""",
    ],
)
def test_parse_rejects_malformed_unsupported_or_noncanonical_records(text):
    with pytest.raises(RegistryCodecError):
        parse_registry(text)


def test_models_are_frozen_and_enforce_invariants_when_built_directly():
    registry = MansionRegistry(mansions=(record("demo"),))

    with pytest.raises(FrozenInstanceError):
        registry.schema_version = 2
    with pytest.raises(FrozenInstanceError):
        registry.mansions[0].name = "other"
    with pytest.raises(RegistryCodecError):
        MansionRegistry(schema_version=2)
    with pytest.raises(RegistryCodecError):
        MansionRegistry(mansions=[record("demo")])
    with pytest.raises(RegistryCodecError):
        MansionRegistry(mansions=(record("demo"), record("demo", "existing")))
    with pytest.raises(RegistryCodecError):
        MansionRecord("demo", "other", "demo", "created")
    with pytest.raises(RegistryCodecError):
        MansionRecord("demo", "demo", "../demo", "created")


def test_upsert_replaces_same_name_without_mutating_input_and_sorts_result():
    original = MansionRegistry(mansions=(record("zoo"), record("demo")))
    replacement = record("demo", "existing")

    updated = upsert_record(original, replacement)

    assert original == MansionRegistry(mansions=(record("demo"), record("zoo")))
    assert updated == MansionRegistry(mansions=(replacement, record("zoo")))
    assert tuple(item.name for item in updated.mansions) == ("demo", "zoo")


def test_empty_registry_has_one_canonical_representation():
    assert parse_registry(print_registry(MansionRegistry())) == MansionRegistry()
    assert print_registry(MansionRegistry()) == '{\n  "schemaVersion": 1,\n  "mansions": []\n}\n'


def test_registry_core_imports_no_filesystem_network_or_clock_modules():
    tree = ast.parse(inspect.getsource(mansion_registry))
    imported_roots = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported_roots.update(alias.name.partition(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported_roots.add(node.module.partition(".")[0])

    assert imported_roots.isdisjoint(
        {"aiohttp", "asyncio", "os", "pathlib", "socket", "subprocess", "time"}
    )
