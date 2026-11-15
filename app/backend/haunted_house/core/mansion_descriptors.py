"""Pure projection from registered mansions to API-safe descriptors.

The registry supplies identity and root-relative path components. Callers
supply the current project status observed for each registered name. This
module joins those facts without filesystem, network, home-directory, or
clock access.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from haunted_house.core.mansion_planner import ProjectStatus
from haunted_house.core.mansion_registry import MansionRecord

DEFAULT_MANSION_DISPLAY_ROOT = "~/workspace/haunted-house/mansions"


class DescriptorProjectionError(ValueError):
    """Raised when records and current project statuses cannot be joined."""


@dataclass(frozen=True, order=True, slots=True)
class MansionDescriptor:
    """One presentation-only view of a registered mansion."""

    name: str
    project_spec: str
    display_path: str
    status: ProjectStatus


def project_mansion_descriptors(
    records: Iterable[MansionRecord],
    project_statuses: Mapping[str, ProjectStatus],
) -> tuple[MansionDescriptor, ...]:
    """Join registry records to statuses and return descriptors by name.

    The fixed MVP display root deliberately uses ``~/`` rather than exposing
    the operator's absolute home directory. Registry records already enforce
    that ``relative_path`` is the validated mansion name.
    """

    ordered_records = tuple(records)
    if any(not isinstance(record, MansionRecord) for record in ordered_records):
        raise DescriptorProjectionError("records must contain mansion records")
    if not isinstance(project_statuses, Mapping):
        raise DescriptorProjectionError("project statuses must be a mapping")

    record_names = tuple(record.name for record in ordered_records)
    if len(set(record_names)) != len(record_names):
        raise DescriptorProjectionError("record names must be unique")
    if set(project_statuses) != set(record_names):
        raise DescriptorProjectionError("project statuses must match record names")
    if any(
        not isinstance(project_statuses[name], ProjectStatus)
        for name in record_names
    ):
        raise DescriptorProjectionError("project status is unsupported")

    return tuple(
        MansionDescriptor(
            name=record.name,
            project_spec=record.project_spec,
            display_path=f"{DEFAULT_MANSION_DISPLAY_ROOT}/{record.relative_path}",
            status=project_statuses[record.name],
        )
        for record in sorted(ordered_records, key=lambda item: item.name)
    )


__all__ = [
    "DEFAULT_MANSION_DISPLAY_ROOT",
    "DescriptorProjectionError",
    "MansionDescriptor",
    "project_mansion_descriptors",
]
