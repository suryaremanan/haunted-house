"""Property 7 for haunted_house.core.mansion_descriptors.

Records arrive in a generated order with a generated status for each name.
The checks below rebuild the expected descriptors from the inputs alone.
"""

import pytest
from hypothesis import given
from hypothesis import strategies as st

from haunted_house.core.mansion_descriptors import (
    DescriptorProjectionError,
    project_mansion_descriptors,
)
from haunted_house.core.mansion_planner import ProjectStatus
from haunted_house.core.mansion_registry import MansionRecord, MansionRegistry

pytestmark = pytest.mark.core

# Feature: mansion-lifecycle, Property 7: Descriptor projection is complete and sorted

ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789"
segments = st.text(alphabet=ALNUM, min_size=1, max_size=10)
valid_names = st.one_of(
    st.lists(segments, min_size=1, max_size=4).map("-".join).filter(
        lambda name: len(name) <= 40
    ),
    # Names whose order differs between component-wise and plain text sorting.
    st.sampled_from(["a", "a-b", "a0", "aa", "a-a", "b", "0", "10", "9", "a" * 40]),
)
statuses = st.sampled_from(
    [ProjectStatus.READY, ProjectStatus.MISSING, ProjectStatus.CONFLICT]
)
origins = st.sampled_from(["created", "existing"])


@st.composite
def projections(draw):
    names = draw(st.lists(valid_names, unique=True, max_size=10))
    records = [
        MansionRecord(name=name, project_spec=name, relative_path=name, origin=draw(origins))
        for name in draw(st.permutations(names))
    ]
    status_by_name = {name: draw(statuses) for name in draw(st.permutations(names))}
    return records, status_by_name


@given(case=projections(), from_registry=st.booleans())
def test_projection_is_complete_sorted_and_home_relative(case, from_registry):
    records, status_by_name = case
    source = MansionRegistry(mansions=tuple(records)).mansions if from_registry else records
    statuses_before = dict(status_by_name)

    descriptors = project_mansion_descriptors(source, status_by_name)

    # Exactly one descriptor per record, ordered by Mansion_Name.
    assert isinstance(descriptors, tuple)
    assert len(descriptors) == len(records)
    names = [descriptor.name for descriptor in descriptors]
    assert names == sorted(record.name for record in records)
    assert len(set(names)) == len(names)

    by_name = {record.name: record for record in records}
    for descriptor in descriptors:
        record = by_name[descriptor.name]
        # Name and Project_Spec are preserved; the status is the matching one.
        assert descriptor.project_spec == record.project_spec == descriptor.name
        assert descriptor.status is status_by_name[descriptor.name]
        assert descriptor.status.value in ("ready", "missing", "conflict")
        # Only a home-relative display path is exposed.
        assert descriptor.display_path == (
            "~/workspace/haunted-house/mansions/" + record.relative_path
        )
        assert descriptor.display_path.startswith("~/")
        assert not descriptor.display_path.startswith("/")
        parts = descriptor.display_path.split("/")
        assert parts[-1] == descriptor.name
        assert ".." not in parts and "" not in parts
        assert "/Users/" not in descriptor.display_path
        assert "/home/" not in descriptor.display_path
        # A descriptor carries these four fields and no registry origin.
        assert set(descriptor.__slots__) == {
            "name",
            "project_spec",
            "display_path",
            "status",
        }

    # The result does not depend on the order records were supplied in, and
    # the inputs are left as they were.
    assert project_mansion_descriptors(list(reversed(records)), status_by_name) == descriptors
    assert status_by_name == statuses_before


@given(case=projections(), stray=valid_names, data=st.data())
def test_statuses_must_cover_exactly_the_registered_names(case, stray, data):
    records, status_by_name = case
    registered = {record.name for record in records}

    if stray not in registered:
        with pytest.raises(DescriptorProjectionError):
            project_mansion_descriptors(
                records, {**status_by_name, stray: ProjectStatus.READY}
            )

    if records:
        victim = data.draw(st.sampled_from(sorted(registered)))
        without = {name: status for name, status in status_by_name.items() if name != victim}
        with pytest.raises(DescriptorProjectionError):
            project_mansion_descriptors(records, without)

        for unsupported in ("ready", "archived", None, 1):
            with pytest.raises(DescriptorProjectionError):
                project_mansion_descriptors(records, {**status_by_name, victim: unsupported})

        with pytest.raises(DescriptorProjectionError):
            project_mansion_descriptors([*records, records[0]], status_by_name)
