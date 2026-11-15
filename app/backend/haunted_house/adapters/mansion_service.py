"""Mansion_Service: list, create, and open registered mansions.

The service is the only place that combines name validation, the confined
filesystem adapter, the pure creation plan, and the app-owned registry. It
accepts a name and nothing else: paths come from server configuration.

One ``asyncio.Lock`` serializes the whole check/create/register sequence, so
concurrent same-name creates produce one project and one record. Blocking
adapter calls run in a worker thread to keep the event loop free.

Results never carry a ``Path``. Errors carry a stable code only: adapter
exceptions are dropped (``from None``) so no host path or OS text can travel
with them.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal, Protocol, TypeAlias, TypeVar

from haunted_house.adapters.mansion_filesystem import (
    MansionFilesystemError,
    ResolvedMansion,
)
from haunted_house.adapters.mansion_metadata import (
    MansionMetadataStore,
    MetadataUnavailable,
)
from haunted_house.core.mansion_descriptors import (
    MansionDescriptor,
    project_mansion_descriptors,
)
from haunted_house.core.mansion_names import is_valid_mansion_name
from haunted_house.core.mansion_paths import PathFact
from haunted_house.core.mansion_planner import (
    CreateOutcome,
    ProjectSnapshot,
    ProjectStatus,
    classify_project,
    plan_create,
)
from haunted_house.core.mansion_registry import (
    MansionRecord,
    MansionRegistry,
    upsert_record,
)

__all__ = [
    "CreateResult",
    "MansionDescriptor",
    "MansionFilesystemPort",
    "MansionService",
    "MansionServiceError",
    "ServiceErrorCode",
]

ServiceErrorCode: TypeAlias = Literal[
    "invalid_mansion_name",
    "unsafe_mansion_root",
    "symlink_escape",
    "mansion_conflict",
    "mansion_missing",
    "mansion_not_registered",
    "metadata_unavailable",
    "filesystem_error",
]

_T = TypeVar("_T")


class MansionServiceError(RuntimeError):
    """A refused or failed mansion operation, described by a stable code."""

    def __init__(self, code: ServiceErrorCode) -> None:
        self.code: ServiceErrorCode = code
        super().__init__(code)


@dataclass(frozen=True, slots=True)
class CreateResult:
    outcome: CreateOutcome
    mansion: MansionDescriptor


class MansionFilesystemPort(Protocol):
    """The filesystem operations the service needs. There is no delete."""

    def ensure_safe_root(self) -> PathFact: ...

    def resolve(self, name: str) -> ResolvedMansion: ...

    def snapshot(self, mansion: ResolvedMansion) -> ProjectSnapshot: ...

    def create_minimal_tree(self, mansion: ResolvedMansion) -> None: ...


class MansionService:
    """Orchestrates mansion operations over injected adapters."""

    def __init__(
        self,
        filesystem: MansionFilesystemPort,
        metadata: MansionMetadataStore,
        *,
        lock: asyncio.Lock | None = None,
    ) -> None:
        self._filesystem = filesystem
        self._metadata = metadata
        self._lock = lock if lock is not None else asyncio.Lock()

    async def list_mansions(self) -> tuple[MansionDescriptor, ...]:
        """Return every registered mansion with its current status, by name.

        Only registered names are inspected; nothing under the root is
        discovered. An empty registry touches no project path.
        """

        registry = await self._load()
        statuses = {
            record.name: await self._current_status(record.name)
            for record in registry.mansions
        }
        return project_mansion_descriptors(registry.mansions, statuses)

    async def create_mansion(self, name: object) -> CreateResult:
        """Create a new mansion, or register or return a compatible one."""

        valid_name = _require_valid_name(name)
        async with self._lock:
            # Recheck under the lock: nothing observed earlier is trusted.
            valid_name = _require_valid_name(valid_name)
            registry = await self._load()
            record = _record_for(registry, valid_name)
            mansion = await self._fs(self._filesystem.resolve, valid_name)
            snapshot = await self._fs(self._filesystem.snapshot, mansion)
            plan = plan_create(snapshot, registered=record is not None)

            if plan.action == "reject":
                raise MansionServiceError("mansion_conflict")

            outcome = CreateOutcome.EXISTING_COMPATIBLE
            origin: Literal["created", "existing"] = "existing"
            if plan.action == "create_tree":
                await self._fs(self._filesystem.create_minimal_tree, mansion)
                outcome = CreateOutcome.CREATED
                origin = "created"

            final = await self._fs(self._filesystem.snapshot, mansion)
            if classify_project(final) is not ProjectStatus.READY:
                raise MansionServiceError("mansion_conflict")

            if record is None:
                record = MansionRecord(
                    name=valid_name,
                    project_spec=valid_name,
                    relative_path=valid_name,
                    origin=origin,
                )
                await self._save(upsert_record(registry, record))

            return CreateResult(
                outcome=outcome,
                mansion=_descriptor(record, ProjectStatus.READY),
            )

    async def open_mansion(self, name: object) -> MansionDescriptor:
        """Revalidate a registered mansion and return its ready descriptor."""

        valid_name = _require_valid_name(name)
        registry = await self._load()
        record = _record_for(registry, valid_name)
        if record is None:
            raise MansionServiceError("mansion_not_registered")

        mansion = await self._fs(self._filesystem.resolve, valid_name)
        snapshot = await self._fs(self._filesystem.snapshot, mansion)
        status = classify_project(snapshot)
        if status is ProjectStatus.MISSING:
            raise MansionServiceError("mansion_missing")
        if status is not ProjectStatus.READY:
            raise MansionServiceError("mansion_conflict")
        return _descriptor(record, ProjectStatus.READY)

    async def _current_status(self, name: str) -> ProjectStatus:
        try:
            mansion = await self._fs(self._filesystem.resolve, name)
            snapshot = await self._fs(self._filesystem.snapshot, mansion)
        except MansionServiceError as error:
            if error.code in ("symlink_escape", "mansion_conflict"):
                # One unsafe project is shown as a conflict; it must not hide
                # the rest of the list.
                return ProjectStatus.CONFLICT
            raise
        return classify_project(snapshot)

    async def _fs(self, call: Callable[..., _T], *args: object) -> _T:
        try:
            return await asyncio.to_thread(call, *args)
        except MansionFilesystemError as error:
            raise MansionServiceError(error.code) from None
        except Exception:
            raise MansionServiceError("filesystem_error") from None

    async def _load(self) -> MansionRegistry:
        try:
            registry = await asyncio.to_thread(self._metadata.load)
        except Exception:
            raise MansionServiceError("metadata_unavailable") from None
        if not isinstance(registry, MansionRegistry):
            raise MansionServiceError("metadata_unavailable")
        return registry

    async def _save(self, registry: MansionRegistry) -> None:
        try:
            await asyncio.to_thread(self._metadata.save, registry)
        except Exception:
            raise MansionServiceError("metadata_unavailable") from None


def _require_valid_name(name: object) -> str:
    if not is_valid_mansion_name(name):
        raise MansionServiceError("invalid_mansion_name")
    assert isinstance(name, str)
    return name


def _record_for(registry: MansionRegistry, name: str) -> MansionRecord | None:
    return next(
        (record for record in registry.mansions if record.name == name), None
    )


def _descriptor(record: MansionRecord, status: ProjectStatus) -> MansionDescriptor:
    return project_mansion_descriptors((record,), {record.name: status})[0]
