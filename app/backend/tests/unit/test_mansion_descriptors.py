"""Focused examples for pure mansion descriptor projection (task 2.11).

The generated completeness and sorting property belongs to task 2.12 and is
not implemented here.
"""

import ast
import inspect
from dataclasses import FrozenInstanceError

import pytest

from haunted_house.core import mansion_descriptors
from haunted_house.core.mansion_descriptors import (
    DEFAULT_MANSION_DISPLAY_ROOT,
    DescriptorProjectionError,
    MansionDescriptor,
    project_mansion_descriptors,
)
from haunted_house.core.mansion_planner import ProjectStatus
from haunted_house.core.mansion_registry import MansionRecord

pytestmark = pytest.mark.core


def record(name: str, origin: str = "created") -> MansionRecord:
    return MansionRecord(
        name=name,
        project_spec=name,
        relative_path=name,
        origin=origin,
    )


def test_projection_combines_records_with_matching_statuses_and_sorts_by_name():
    records = (
        record("zoo", "existing"),
        record("alpha"),
        record("middle"),
    )
    statuses = {
        "zoo": ProjectStatus.CONFLICT,
        "alpha": ProjectStatus.READY,
        "middle": ProjectStatus.MISSING,
    }

    projected = project_mansion_descriptors(records, statuses)

    assert projected == (
        MansionDescriptor(
            name="alpha",
            project_spec="alpha",
            display_path="~/workspace/haunted-house/mansions/alpha",
            status=ProjectStatus.READY,
        ),
        MansionDescriptor(
            name="middle",
            project_spec="middle",
            display_path="~/workspace/haunted-house/mansions/middle",
            status=ProjectStatus.MISSING,
        ),
        MansionDescriptor(
            name="zoo",
            project_spec="zoo",
            display_path="~/workspace/haunted-house/mansions/zoo",
            status=ProjectStatus.CONFLICT,
        ),
    )
    assert records[0].origin == "existing"
    assert all(
        descriptor.display_path.startswith("~/") for descriptor in projected
    )


def test_empty_projection_is_empty_and_exposes_no_home_path():
    assert DEFAULT_MANSION_DISPLAY_ROOT == "~/workspace/haunted-house/mansions"
    assert project_mansion_descriptors((), {}) == ()


def test_descriptor_is_immutable():
    descriptor = project_mansion_descriptors(
        (record("demo"),), {"demo": ProjectStatus.READY}
    )[0]

    with pytest.raises(FrozenInstanceError):
        descriptor.display_path = "/private/home/demo"


@pytest.mark.parametrize(
    "statuses",
    [
        {},
        {"demo": ProjectStatus.READY, "stale": ProjectStatus.MISSING},
        {"demo": "ready"},
    ],
)
def test_projection_rejects_incomplete_stale_or_untyped_status_maps(statuses):
    with pytest.raises(DescriptorProjectionError):
        project_mansion_descriptors((record("demo"),), statuses)


def test_projection_rejects_duplicate_or_nonrecord_inputs():
    with pytest.raises(DescriptorProjectionError):
        project_mansion_descriptors(
            (record("demo"), record("demo", "existing")),
            {"demo": ProjectStatus.READY},
        )
    with pytest.raises(DescriptorProjectionError):
        project_mansion_descriptors(
            ("demo",),
            {"demo": ProjectStatus.READY},
        )


def test_descriptor_projection_imports_no_filesystem_network_or_clock_modules():
    tree = ast.parse(inspect.getsource(mansion_descriptors))
    imported_roots = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported_roots.update(
                alias.name.partition(".")[0] for alias in node.names
            )
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported_roots.add(node.module.partition(".")[0])

    assert imported_roots.isdisjoint(
        {"aiohttp", "asyncio", "os", "pathlib", "socket", "subprocess", "time"}
    )
