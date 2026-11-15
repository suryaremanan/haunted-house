"""Property 6 for haunted_house.core.mansion_registry.

Valid registries are generated with records in arbitrary order. The expected
canonical text is assembled here line by line, without ``json.dumps``, so the
printer is checked against the documented layout rather than against itself.
Generated corruptions and fixed edge examples cover duplicate names,
unsupported schema versions, wrong field sets, and paths that are not the
mansion name.
"""

import json

import pytest
from hypothesis import given
from hypothesis import strategies as st

from haunted_house.core.mansion_registry import (
    MansionRecord,
    MansionRegistry,
    RegistryCodecError,
    parse_registry,
    print_registry,
    upsert_record,
)

pytestmark = pytest.mark.core

# Feature: mansion-lifecycle, Property 6: Registry serialization is canonical and round-trippable

ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789"
segments = st.text(alphabet=ALNUM, min_size=1, max_size=10)
valid_names = st.one_of(
    st.lists(segments, min_size=1, max_size=4).map("-".join).filter(
        lambda name: len(name) <= 40
    ),
    st.sampled_from(["a", "0", "a" * 40, "a-b", "a-a", "aa", "a0", "weather-station"]),
)
origins = st.sampled_from(["created", "existing"])


@st.composite
def record_lists(draw) -> list[MansionRecord]:
    """Unique-name records in a generated (usually unsorted) order."""
    names = draw(st.lists(valid_names, unique=True, max_size=8))
    records = [
        MansionRecord(name=name, project_spec=name, relative_path=name, origin=draw(origins))
        for name in names
    ]
    return list(draw(st.permutations(records)))


def expected_text(records: list[MansionRecord]) -> str:
    """The documented canonical layout, written out by hand."""
    lines = ["{", '  "schemaVersion": 1,']
    ordered = sorted(records, key=lambda record: record.name)
    if not ordered:
        lines.append('  "mansions": []')
    else:
        lines.append('  "mansions": [')
        for index, record in enumerate(ordered):
            comma = "," if index < len(ordered) - 1 else ""
            lines += [
                "    {",
                f'      "name": "{record.name}",',
                f'      "projectSpec": "{record.project_spec}",',
                f'      "relativePath": "{record.relative_path}",',
                f'      "origin": "{record.origin}"',
                "    }" + comma,
            ]
        lines.append("  ]")
    lines.append("}")
    return "\n".join(lines) + "\n"


def as_document(records: list[MansionRecord]) -> dict:
    return {
        "schemaVersion": 1,
        "mansions": [
            {
                "name": record.name,
                "projectSpec": record.project_spec,
                "relativePath": record.relative_path,
                "origin": record.origin,
            }
            for record in records
        ],
    }


@given(records=record_lists())
def test_print_then_parse_is_canonical_and_byte_stable(records):
    registry = MansionRegistry(mansions=tuple(records))

    text = print_registry(registry)
    parsed = parse_registry(text)

    # Deterministic documented bytes, independent of the input record order.
    assert text == expected_text(records)
    assert text.encode("utf-8") == expected_text(records).encode("utf-8")
    assert print_registry(MansionRegistry(mansions=tuple(reversed(records)))) == text

    # Round trip to the canonical registry: unique, name-sorted records.
    assert parsed == registry
    assert parsed.schema_version == 1
    names = [record.name for record in parsed.mansions]
    assert names == sorted(names)
    assert len(set(names)) == len(names)
    assert sorted(names) == sorted(record.name for record in records)
    assert {(r.name, r.origin) for r in parsed.mansions} == {
        (r.name, r.origin) for r in records
    }

    # Stored paths are the mansion name itself and never absolute.
    for record in parsed.mansions:
        assert record.relative_path == record.name == record.project_spec
        assert not record.relative_path.startswith(("/", "~", "\\"))
        assert "/" not in record.relative_path and ".." not in record.relative_path
    assert "/" not in text and "\\" not in text and "~" not in text

    # Printing the parsed result reproduces exactly the same bytes.
    assert print_registry(parsed) == text
    assert print_registry(parse_registry(print_registry(parsed))) == text


@given(
    records=record_lists(),
    indent=st.sampled_from([None, 0, 1, 4]),
    sort_keys=st.booleans(),
    ascii_only=st.booleans(),
)
def test_equivalent_non_canonical_text_parses_to_the_same_canonical_bytes(
    records, indent, sort_keys, ascii_only
):
    loose = json.dumps(
        as_document(records), indent=indent, sort_keys=sort_keys, ensure_ascii=ascii_only
    )

    parsed = parse_registry(loose)

    assert parsed == MansionRegistry(mansions=tuple(records))
    assert print_registry(parsed) == expected_text(records)


@given(records=record_lists(), data=st.data())
def test_upsert_keeps_exactly_one_record_per_name(records, data):
    registry = MansionRegistry(mansions=tuple(records))
    name = data.draw(
        st.one_of(valid_names, st.sampled_from([r.name for r in records]))
        if records
        else valid_names
    )
    record = MansionRecord(
        name=name, project_spec=name, relative_path=name, origin=data.draw(origins)
    )

    updated = upsert_record(registry, record)

    assert [r for r in updated.mansions if r.name == name] == [record]
    assert [r for r in updated.mansions if r.name != name] == [
        r for r in registry.mansions if r.name != name
    ]
    assert upsert_record(updated, record) == updated
    assert parse_registry(print_registry(updated)) == updated


unsupported_versions = st.one_of(
    st.integers().filter(lambda value: value != 1),
    st.sampled_from([True, False, None, "1", 1.0, 1.5, [1], {"v": 1}]),
)
bad_field_values = st.one_of(
    st.none(),
    st.booleans(),
    st.integers(),
    st.lists(st.text(max_size=3), max_size=2),
    st.sampled_from(
        [
            "",
            "A",
            "a--b",
            "-a",
            "a-",
            "a" * 41,
            "..",
            "../a",
            "/abs/path",
            "/home/op/workspace/haunted-house/mansions/a",
            "~/a",
            "a/b",
            "a b",
            "café",
            "CREATED",
            "imported",
        ]
    ),
)


@st.composite
def corrupted_documents(draw):
    """A valid document with exactly one schema violation applied."""
    records = draw(record_lists())
    document = as_document(records)
    choices = ["version", "top_extra", "top_missing", "mansions_type"]
    if records:
        choices += ["duplicate", "field_value", "field_missing", "field_extra", "record_type"]
    choice = draw(st.sampled_from(choices))

    if choice == "version":
        document["schemaVersion"] = draw(unsupported_versions)
    elif choice == "top_extra":
        document[draw(st.sampled_from(["selected", "updatedAt", "root", "schema_version"]))] = 1
    elif choice == "top_missing":
        del document[draw(st.sampled_from(["schemaVersion", "mansions"]))]
    elif choice == "mansions_type":
        document["mansions"] = draw(
            st.sampled_from([None, {}, "[]", 0, {"a": as_document(records)["mansions"]}])
        )
    else:
        index = draw(st.integers(min_value=0, max_value=len(records) - 1))
        target = document["mansions"][index]
        if choice == "duplicate":
            clone = dict(target)
            clone["origin"] = draw(origins)
            position = draw(st.integers(min_value=0, max_value=len(records)))
            document["mansions"].insert(position, clone)
        elif choice == "field_value":
            field = draw(st.sampled_from(["name", "projectSpec", "relativePath", "origin"]))
            value = draw(bad_field_values)
            # Changing only one of the three linked fields always breaks the
            # name/spec/path equality, whatever the replacement is.
            if field == "origin" and value in ("created", "existing"):
                value = "imported"
            if value == target[field]:
                value = None
            target[field] = value
        elif choice == "field_missing":
            del target[draw(st.sampled_from(["name", "projectSpec", "relativePath", "origin"]))]
        elif choice == "field_extra":
            target[draw(st.sampled_from(["path", "absolutePath", "createdAt", "Name"]))] = "x"
        else:
            document["mansions"][index] = draw(
                st.sampled_from([None, "a", 1, [], [target["name"]]])
            )
    return document


@given(document=corrupted_documents(), indent=st.sampled_from([None, 2]))
def test_any_single_schema_violation_is_refused(document, indent):
    with pytest.raises(RegistryCodecError):
        parse_registry(json.dumps(document, indent=indent))


MALFORMED_TEXT = [
    "",
    " ",
    "{",
    "[]",
    "null",
    "1",
    '"registry"',
    '{"schemaVersion": 1}',
    '{"mansions": []}',
    '{"schemaVersion": 1, "mansions": [], }',
    '{"schemaVersion": 1, "schemaVersion": 1, "mansions": []}',
    '{"schemaVersion": 2, "schemaVersion": 1, "mansions": []}',
    '{"schemaVersion": 1, "mansions": [], "mansions": []}',
    '{"schemaVersion": NaN, "mansions": []}',
    '{"schemaVersion": Infinity, "mansions": []}',
    '{"schemaVersion": 1.0, "mansions": []}',
    '{"schemaVersion": true, "mansions": []}',
    '{"schemaVersion": "1", "mansions": []}',
    '{"schemaVersion": 0, "mansions": []}',
    '{"schemaVersion": 2, "mansions": []}',
    '{"schemaVersion": -1, "mansions": []}',
    '{"schemaVersion": 1, "mansions": {}}',
    '{"schemaVersion": 1, "mansions": [{"name": "a", "name": "a", "projectSpec": "a", '
    '"relativePath": "a", "origin": "created"}]}',
    '{"schemaVersion": 1, "mansions": [{"name": "a", "projectSpec": "a", '
    '"relativePath": "/abs/a", "origin": "created"}]}',
    '{"schemaVersion": 1, "mansions": [{"name": "a", "projectSpec": "b", '
    '"relativePath": "a", "origin": "created"}]}',
    '{"schemaVersion": 1, "mansions": [{"name": "A", "projectSpec": "A", '
    '"relativePath": "A", "origin": "created"}]}',
    "{'schemaVersion': 1, 'mansions': []}",
    '﻿{"schemaVersion": 1, "mansions": []}',
]


@pytest.mark.parametrize("text", MALFORMED_TEXT)
def test_malformed_and_unsupported_examples_are_refused(text):
    with pytest.raises(RegistryCodecError):
        parse_registry(text)


@pytest.mark.parametrize("value", [None, b"{}", 1, {"schemaVersion": 1, "mansions": []}])
def test_non_text_input_is_refused(value):
    with pytest.raises(RegistryCodecError):
        parse_registry(value)


@given(records=record_lists().filter(lambda records: len(records) >= 1), data=st.data())
def test_invalid_in_memory_registries_cannot_be_constructed(records, data):
    duplicate = data.draw(st.sampled_from(records))
    with pytest.raises(RegistryCodecError):
        MansionRegistry(mansions=(*records, duplicate))
    with pytest.raises(RegistryCodecError):
        MansionRegistry(schema_version=data.draw(st.integers().filter(lambda v: v != 1)))
    with pytest.raises(RegistryCodecError):
        MansionRecord(
            name=duplicate.name,
            project_spec=duplicate.name,
            relative_path="/abs/" + duplicate.name,
            origin="created",
        )
