"""Unit and concurrency tests for haunted_house.adapters.mansion_service.

Spy adapters record every call in one shared journal so ordering can be
asserted. The spies wrap the real filesystem adapter and metadata store over
pytest temporary directories; nothing touches the real mansion root.
"""

import asyncio
import os
import threading
from pathlib import Path

import pytest

from haunted_house.adapters.mansion_filesystem import (
    MansionFilesystem,
    MansionFilesystemError,
)
from haunted_house.adapters.mansion_metadata import (
    FileMansionMetadataStore,
    MetadataUnavailable,
)
from haunted_house.adapters.mansion_service import (
    CreateResult,
    MansionDescriptor,
    MansionService,
    MansionServiceError,
)
from haunted_house.core.mansion_planner import CreateOutcome, ProjectStatus
from haunted_house.core.mansion_registry import MansionRecord, MansionRegistry

NAME = "weather-station"
DISPLAY = f"~/workspace/haunted-house/mansions/{NAME}"
SENSITIVE = "/Users/someone/private-token-abc123"

INVALID_NAMES = [
    "",
    "Weather",
    "weather_station",
    "-weather",
    "weather-",
    "weather--station",
    " weather",
    "weather ",
    "weather\n",
    "../escape",
    "a/b",
    ".",
    "..",
    "wéather",
    "a" * 41,
    None,
    7,
    True,
    ["weather"],
    {"name": "weather"},
    b"weather",
]


class Journal:
    """A thread-safe, ordered record of adapter calls."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.calls: list[tuple[str, ...]] = []

    def add(self, *call: str) -> None:
        with self._lock:
            self.calls.append(call)

    def names(self) -> list[str]:
        return [call[0] for call in self.calls]


class SpyFilesystem:
    def __init__(self, real: MansionFilesystem, journal: Journal) -> None:
        self.real = real
        self.journal = journal
        self.fail: dict[str, Exception] = {}
        self.before: dict[str, object] = {}

    def _enter(self, operation: str, name: str) -> None:
        self.journal.add(operation, name)
        hook = self.before.get(operation)
        if hook is not None:
            hook()
        if operation in self.fail:
            raise self.fail[operation]

    def ensure_safe_root(self):
        self._enter("ensure_safe_root", "")
        return self.real.ensure_safe_root()

    def resolve(self, name):
        self._enter("resolve", name)
        return self.real.resolve(name)

    def snapshot(self, mansion):
        self._enter("snapshot", mansion.name)
        return self.real.snapshot(mansion)

    def create_minimal_tree(self, mansion):
        self._enter("create_minimal_tree", mansion.name)
        return self.real.create_minimal_tree(mansion)


class SpyMetadata:
    def __init__(self, real: FileMansionMetadataStore, journal: Journal) -> None:
        self.real = real
        self.journal = journal
        self.fail_load: Exception | None = None
        self.fail_save: Exception | None = None

    def load(self) -> MansionRegistry:
        self.journal.add("load")
        if self.fail_load is not None:
            raise self.fail_load
        return self.real.load()

    def save(self, registry: MansionRegistry) -> None:
        self.journal.add("save", *(record.name for record in registry.mansions))
        if self.fail_save is not None:
            raise self.fail_save
        self.real.save(registry)


class Harness:
    def __init__(self, tmp_path: Path) -> None:
        self.approved = tmp_path / "home" / "workspace"
        self.approved.mkdir(parents=True)
        self.root = self.approved / "haunted-house" / "mansions"
        self.app_root = tmp_path / "app"
        (self.app_root / "data").mkdir(parents=True)
        (self.app_root / "app.json").write_text("{}", encoding="utf-8")
        self.journal = Journal()
        self.filesystem = SpyFilesystem(
            MansionFilesystem(self.root, (self.approved,)), self.journal
        )
        self.store = FileMansionMetadataStore(self.app_root)
        self.metadata = SpyMetadata(self.store, self.journal)
        self.service = MansionService(self.filesystem, self.metadata)

    @property
    def registry_path(self) -> Path:
        return self.store.registry_path

    def compatible_project(self, name: str = NAME) -> Path:
        target = self.root / name
        (target / ".kiro" / "specs" / name).mkdir(parents=True)
        return target


def tree(base: Path) -> dict[str, bytes | None]:
    if not base.exists():
        return {}
    seen: dict[str, bytes | None] = {}
    for current, directories, files in os.walk(base):
        for entry in directories:
            seen[(Path(current) / entry).relative_to(base).as_posix()] = None
        for entry in files:
            path = Path(current) / entry
            seen[path.relative_to(base).as_posix()] = path.read_bytes()
    return seen


def error_code(awaitable) -> str:
    with pytest.raises(MansionServiceError) as caught:
        asyncio.run(awaitable)
    error = caught.value
    assert str(error) == error.code
    assert error.__cause__ is None  # adapter exception is not carried along
    return error.code


def ready(name: str = NAME) -> MansionDescriptor:
    return MansionDescriptor(
        name=name,
        project_spec=name,
        display_path=f"~/workspace/haunted-house/mansions/{name}",
        status=ProjectStatus.READY,
    )


# --- Validation before any path or registry access --------------------------


@pytest.mark.parametrize("name", INVALID_NAMES, ids=repr)
@pytest.mark.parametrize("operation", ["create", "open"])
def test_invalid_name_is_rejected_before_any_adapter_call(tmp_path, operation, name):
    harness = Harness(tmp_path)
    before = tree(tmp_path)
    call = (
        harness.service.create_mansion
        if operation == "create"
        else harness.service.open_mansion
    )

    assert error_code(call(name)) == "invalid_mansion_name"

    assert harness.journal.calls == []
    assert tree(tmp_path) == before
    assert not harness.root.exists()
    assert not harness.registry_path.exists()


# --- Create -----------------------------------------------------------------


def test_create_checks_creates_rechecks_then_saves_in_that_order(tmp_path):
    harness = Harness(tmp_path)

    result = asyncio.run(harness.service.create_mansion(NAME))

    assert result == CreateResult(outcome=CreateOutcome.CREATED, mansion=ready())
    assert harness.journal.calls == [
        ("load",),
        ("resolve", NAME),
        ("snapshot", NAME),
        ("create_minimal_tree", NAME),
        ("snapshot", NAME),  # final compatibility check precedes metadata
        ("save", NAME),
    ]
    assert tree(harness.root) == {
        NAME: None,
        f"{NAME}/.kiro": None,
        f"{NAME}/.kiro/specs": None,
        f"{NAME}/.kiro/specs/{NAME}": None,
    }
    assert harness.store.load().mansions == (
        MansionRecord(NAME, NAME, NAME, "created"),
    )


def test_repeat_create_returns_the_same_record_without_any_write(tmp_path):
    harness = Harness(tmp_path)
    asyncio.run(harness.service.create_mansion(NAME))
    (harness.root / NAME / "notes.md").write_bytes(b"operator notes")
    project = tree(harness.root)
    registry_bytes = harness.registry_path.read_bytes()
    harness.journal.calls.clear()

    result = asyncio.run(harness.service.create_mansion(NAME))

    assert result == CreateResult(
        outcome=CreateOutcome.EXISTING_COMPATIBLE, mansion=ready()
    )
    assert "create_minimal_tree" not in harness.journal.names()
    assert "save" not in harness.journal.names()
    assert tree(harness.root) == project
    assert harness.registry_path.read_bytes() == registry_bytes
    assert harness.store.load().mansions[0].origin == "created"


def test_compatible_unregistered_project_is_adopted_unchanged(tmp_path):
    harness = Harness(tmp_path)
    harness.filesystem.real.ensure_safe_root()
    target = harness.compatible_project()
    (target / "src").mkdir()
    (target / "src" / "blob.bin").write_bytes(bytes(range(256)))
    project = tree(harness.root)

    result = asyncio.run(harness.service.create_mansion(NAME))

    assert result.outcome is CreateOutcome.EXISTING_COMPATIBLE
    assert result.mansion == ready()
    assert "create_minimal_tree" not in harness.journal.names()
    assert harness.journal.names()[-1] == "save"
    assert tree(harness.root) == project
    assert harness.store.load().mansions == (
        MansionRecord(NAME, NAME, NAME, "existing"),
    )


@pytest.mark.parametrize("blocker", ["target-file", "descendant-file", "partial"])
def test_conflicting_project_is_refused_and_nothing_changes(tmp_path, blocker):
    harness = Harness(tmp_path)
    harness.filesystem.real.ensure_safe_root()
    target = harness.root / NAME
    if blocker == "target-file":
        target.write_bytes(b"a file with this name")
    elif blocker == "descendant-file":
        (target / ".kiro").mkdir(parents=True)
        (target / ".kiro" / "specs").write_bytes(b"not a directory")
    else:
        (target / ".kiro").mkdir(parents=True)
        (target / "README.md").write_bytes(b"someone else's project")
    project = tree(harness.root)

    assert error_code(harness.service.create_mansion(NAME)) == "mansion_conflict"

    assert "create_minimal_tree" not in harness.journal.names()
    assert "save" not in harness.journal.names()
    assert tree(harness.root) == project
    assert not harness.registry_path.exists()


def test_escaping_symlink_is_refused_with_its_own_code(tmp_path):
    harness = Harness(tmp_path)
    harness.filesystem.real.ensure_safe_root()
    outside = tmp_path / "outside"
    outside.mkdir()
    (harness.root / NAME).symlink_to(outside, target_is_directory=True)

    assert error_code(harness.service.create_mansion(NAME)) == "symlink_escape"

    assert tree(outside) == {}
    assert "save" not in harness.journal.names()
    assert not harness.registry_path.exists()


def test_unsafe_root_is_refused_without_writes(tmp_path):
    approved = tmp_path / "home" / "workspace"
    approved.mkdir(parents=True)
    elsewhere = tmp_path / "elsewhere" / "mansions"
    harness = Harness(tmp_path / "h")
    service = MansionService(
        MansionFilesystem(elsewhere, (approved,)), harness.metadata
    )

    assert error_code(service.create_mansion(NAME)) == "unsafe_mansion_root"

    assert not elsewhere.exists()
    assert "save" not in harness.journal.names()


def test_project_error_leaves_metadata_untouched(tmp_path):
    harness = Harness(tmp_path)
    asyncio.run(harness.service.create_mansion("first"))
    registry_bytes = harness.registry_path.read_bytes()
    harness.journal.calls.clear()
    harness.filesystem.fail["create_minimal_tree"] = MansionFilesystemError(
        "filesystem_error"
    )

    assert error_code(harness.service.create_mansion(NAME)) == "filesystem_error"

    assert "save" not in harness.journal.names()
    assert harness.registry_path.read_bytes() == registry_bytes


def test_final_snapshot_must_be_compatible_before_metadata_is_written(tmp_path):
    harness = Harness(tmp_path)
    snapshots = 0

    def spoil_after_create() -> None:
        nonlocal snapshots
        snapshots += 1
        if snapshots == 2:  # the final check: swap a required directory
            spec = harness.root / NAME / ".kiro" / "specs" / NAME
            spec.rmdir()
            spec.write_bytes(b"raced")

    harness.filesystem.before["snapshot"] = spoil_after_create

    assert error_code(harness.service.create_mansion(NAME)) == "mansion_conflict"

    assert "save" not in harness.journal.names()
    assert not harness.registry_path.exists()


def test_recheck_happens_under_the_mutation_lock(tmp_path):
    harness = Harness(tmp_path)
    lock = asyncio.Lock()
    service = MansionService(harness.filesystem, harness.metadata, lock=lock)
    locked_during: dict[str, bool] = {}
    for operation in ("resolve", "snapshot", "create_minimal_tree"):
        harness.filesystem.before[operation] = (
            lambda operation=operation: locked_during.setdefault(
                operation, lock.locked()
            )
        )

    async def go() -> None:
        async with lock:  # held by another create
            pending = asyncio.ensure_future(service.create_mansion(NAME))
            await asyncio.sleep(0.05)
            assert harness.journal.calls == []  # nothing checked while waiting
        await pending

    asyncio.run(go())

    assert locked_during == {
        "resolve": True,
        "snapshot": True,
        "create_minimal_tree": True,
    }
    assert not lock.locked()


def test_metadata_save_failure_keeps_old_registry_and_retry_adopts(tmp_path):
    harness = Harness(tmp_path)
    harness.metadata.fail_save = MetadataUnavailable()

    assert error_code(harness.service.create_mansion(NAME)) == "metadata_unavailable"

    project = tree(harness.root)
    assert f"{NAME}/.kiro/specs/{NAME}" in project  # the project was completed
    assert not harness.registry_path.exists()
    assert asyncio.run(harness.service.list_mansions()) == ()

    harness.metadata.fail_save = None
    harness.journal.calls.clear()
    retry = asyncio.run(harness.service.create_mansion(NAME))

    assert retry == CreateResult(
        outcome=CreateOutcome.EXISTING_COMPATIBLE, mansion=ready()
    )
    assert "create_minimal_tree" not in harness.journal.names()
    assert tree(harness.root) == project
    assert [record.name for record in harness.store.load().mansions] == [NAME]


@pytest.mark.parametrize(
    "payload",
    [b"{not json", b'{"schemaVersion": 2, "mansions": []}'],
    ids=["malformed", "unsupported version"],
)
def test_unreadable_registry_blocks_every_operation_and_is_preserved(
    tmp_path, payload
):
    harness = Harness(tmp_path)
    harness.registry_path.write_bytes(payload)

    for call in (
        harness.service.list_mansions(),
        harness.service.create_mansion(NAME),
        harness.service.open_mansion(NAME),
    ):
        assert error_code(call) == "metadata_unavailable"

    assert harness.registry_path.read_bytes() == payload
    assert set(harness.journal.names()) == {"load"}  # no path was inspected
    assert not harness.root.exists()


def test_concurrent_same_name_creates_yield_one_created_and_one_record(tmp_path):
    harness = Harness(tmp_path)

    async def go():
        return await asyncio.gather(
            *(harness.service.create_mansion(NAME) for _ in range(12))
        )

    results = asyncio.run(go())

    outcomes = [result.outcome for result in results]
    assert outcomes.count(CreateOutcome.CREATED) == 1
    assert outcomes.count(CreateOutcome.EXISTING_COMPATIBLE) == 11
    assert {result.mansion for result in results} == {ready()}
    assert harness.journal.names().count("create_minimal_tree") == 1
    assert harness.journal.names().count("save") == 1
    assert harness.store.load().mansions == (
        MansionRecord(NAME, NAME, NAME, "created"),
    )
    assert len(tree(harness.root)) == 4


def test_concurrent_different_names_each_keep_their_record(tmp_path):
    harness = Harness(tmp_path)
    names = [f"mansion-{index}" for index in range(8)]

    async def go():
        return await asyncio.gather(
            *(harness.service.create_mansion(name) for name in reversed(names))
        )

    results = asyncio.run(go())

    assert all(result.outcome is CreateOutcome.CREATED for result in results)
    assert [record.name for record in harness.store.load().mansions] == names


# --- List -------------------------------------------------------------------


def test_empty_registry_lists_nothing_and_touches_no_path(tmp_path):
    harness = Harness(tmp_path)

    assert asyncio.run(harness.service.list_mansions()) == ()

    assert harness.journal.calls == [("load",)]
    assert not harness.root.exists()
    assert not harness.registry_path.exists()


def test_list_is_sorted_and_revalidates_every_registered_project(tmp_path):
    harness = Harness(tmp_path)
    for name in ("zebra", "alpha", "missing-one", "conflicted", "escaped"):
        asyncio.run(harness.service.create_mansion(name))
    unregistered = harness.compatible_project("not-registered")
    assert unregistered.is_dir()

    # Change the projects after registration.
    for path in sorted((harness.root / "missing-one").rglob("*"), reverse=True):
        path.rmdir()
    (harness.root / "missing-one").rmdir()
    (harness.root / "conflicted" / ".kiro" / "specs" / "conflicted").rmdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    escaped_spec = harness.root / "escaped" / ".kiro" / "specs" / "escaped"
    escaped_spec.rmdir()
    escaped_spec.symlink_to(outside, target_is_directory=True)
    harness.journal.calls.clear()

    listed = asyncio.run(harness.service.list_mansions())

    assert [(item.name, item.status) for item in listed] == [
        ("alpha", ProjectStatus.READY),
        ("conflicted", ProjectStatus.CONFLICT),
        ("escaped", ProjectStatus.CONFLICT),
        ("missing-one", ProjectStatus.MISSING),
        ("zebra", ProjectStatus.READY),
    ]
    assert all(item.project_spec == item.name for item in listed)
    assert all(
        item.display_path == f"~/workspace/haunted-house/mansions/{item.name}"
        for item in listed
    )
    snapshots = [call[1] for call in harness.journal.calls if call[0] == "snapshot"]
    assert sorted(snapshots) == sorted(item.name for item in listed)
    assert "save" not in harness.journal.names()
    assert "create_minimal_tree" not in harness.journal.names()
    # Listing a missing project does not recreate it or drop its record.
    assert not (harness.root / "missing-one").exists()
    assert len(harness.store.load().mansions) == 5


# --- Open -------------------------------------------------------------------


def test_open_requires_a_registered_name_even_for_a_compatible_project(tmp_path):
    harness = Harness(tmp_path)
    harness.filesystem.real.ensure_safe_root()
    harness.compatible_project()
    project = tree(harness.root)

    assert error_code(harness.service.open_mansion(NAME)) == "mansion_not_registered"

    assert harness.journal.calls == [("load",)]  # no path inspected
    assert tree(harness.root) == project
    assert not harness.registry_path.exists()


def test_open_revalidates_immediately_before_returning(tmp_path):
    harness = Harness(tmp_path)
    asyncio.run(harness.service.create_mansion(NAME))
    harness.journal.calls.clear()

    opened = asyncio.run(harness.service.open_mansion(NAME))

    assert opened == ready()
    assert harness.journal.calls == [
        ("load",),
        ("resolve", NAME),
        ("snapshot", NAME),
    ]


def test_open_refuses_a_project_that_changed_after_it_was_listed(tmp_path):
    harness = Harness(tmp_path)
    asyncio.run(harness.service.create_mansion(NAME))
    listed = asyncio.run(harness.service.list_mansions())
    assert [item.status for item in listed] == [ProjectStatus.READY]
    spec = harness.root / NAME / ".kiro" / "specs" / NAME

    spec.rmdir()
    assert error_code(harness.service.open_mansion(NAME)) == "mansion_conflict"

    spec.symlink_to(tmp_path, target_is_directory=True)
    assert error_code(harness.service.open_mansion(NAME)) == "symlink_escape"

    spec.unlink()
    for path in sorted((harness.root / NAME).rglob("*"), reverse=True):
        path.rmdir()
    (harness.root / NAME).rmdir()
    registry_bytes = harness.registry_path.read_bytes()
    assert error_code(harness.service.open_mansion(NAME)) == "mansion_missing"

    # A refused open neither recreates the project nor drops the record.
    assert not (harness.root / NAME).exists()
    assert harness.registry_path.read_bytes() == registry_bytes


# --- No host details in results or errors -----------------------------------


def test_results_contain_no_path_objects_or_absolute_paths(tmp_path):
    harness = Harness(tmp_path)

    created = asyncio.run(harness.service.create_mansion(NAME))
    opened = asyncio.run(harness.service.open_mansion(NAME))
    listed = asyncio.run(harness.service.list_mansions())

    for descriptor in (created.mansion, opened, *listed):
        values = [
            descriptor.name,
            descriptor.project_spec,
            descriptor.display_path,
            descriptor.status,
        ]
        assert all(type(value) in (str, ProjectStatus) for value in values)
        assert descriptor.display_path == DISPLAY
    rendered = repr((created, opened, listed))
    assert str(tmp_path) not in rendered
    assert str(Path.home()) not in rendered


@pytest.mark.parametrize(
    ("operation", "exception", "expected"),
    [
        ("resolve", OSError(13, "Permission denied", SENSITIVE), "filesystem_error"),
        ("snapshot", RuntimeError(SENSITIVE), "filesystem_error"),
        ("create_minimal_tree", PermissionError(SENSITIVE), "filesystem_error"),
        ("load", OSError(5, SENSITIVE), "metadata_unavailable"),
        ("save", ValueError(SENSITIVE), "metadata_unavailable"),
    ],
)
def test_unexpected_adapter_failures_become_stable_codes_without_text(
    tmp_path, operation, exception, expected
):
    harness = Harness(tmp_path)
    if operation == "load":
        harness.metadata.fail_load = exception
    elif operation == "save":
        harness.metadata.fail_save = exception
    else:
        harness.filesystem.fail[operation] = exception

    with pytest.raises(MansionServiceError) as caught:
        asyncio.run(harness.service.create_mansion(NAME))

    error = caught.value
    assert error.code == expected
    assert error.args == (expected,)
    assert error.__cause__ is None
    assert error.__suppress_context__ is True
    assert SENSITIVE not in repr(error) and SENSITIVE not in str(error)
    assert str(tmp_path) not in str(error)
