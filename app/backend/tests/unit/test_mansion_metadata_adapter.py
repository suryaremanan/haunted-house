"""Adapter matrix for the atomic mansion metadata store (task 4.2).

Covers restart through a new store instance, deterministic bytes, interrupted
writes, atomic replacement, malformed and unsupported registries, non-regular
registry entries, permission failures, original-byte preservation, and the
separation of app-owned metadata from every mansion root.

Every test works under ``tmp_path``. No test touches the real app-data
directory or the real default mansion root.
"""

import os
import stat
from pathlib import Path

import pytest

from haunted_house.adapters import mansion_metadata
from haunted_house.adapters.mansion_metadata import (
    REGISTRY_FILENAME,
    FileMansionMetadataStore,
    MetadataUnavailable,
)
from haunted_house.core.mansion_registry import (
    MansionRecord,
    MansionRegistry,
    print_registry,
)

SAFE_MESSAGE = "mansion metadata is unavailable"
RUNNING_AS_ROOT = hasattr(os, "geteuid") and os.geteuid() == 0
needs_permission_enforcement = pytest.mark.skipif(
    RUNNING_AS_ROOT or os.name == "nt",
    reason="permission bits are not enforced for this user or platform",
)


def _app_root(tmp_path: Path) -> Path:
    root = tmp_path / "installed-app"
    root.mkdir()
    (root / "app.json").write_text("{}\n", encoding="utf-8")
    (root / "data").mkdir()
    return root


def _record(name: str, origin: str = "created") -> MansionRecord:
    return MansionRecord(
        name=name, project_spec=name, relative_path=name, origin=origin
    )


def _registry(*names: str) -> MansionRegistry:
    return MansionRegistry(mansions=tuple(_record(name) for name in names))


def _data_entries(root: Path) -> list[str]:
    return sorted(entry.name for entry in (root / "data").iterdir())


def _assert_safe_error(caught: pytest.ExceptionInfo, tmp_path: Path) -> None:
    message = str(caught.value)
    assert message == SAFE_MESSAGE
    assert str(tmp_path) not in message
    assert str(Path.home()) not in message
    assert REGISTRY_FILENAME not in message


# --- Missing file ------------------------------------------------------------


def test_missing_registry_loads_empty_repeatedly_without_creating_anything(
    tmp_path: Path,
):
    root = _app_root(tmp_path)
    store = FileMansionMetadataStore(root)

    assert store.load() == MansionRegistry()
    assert store.load() == MansionRegistry()

    assert _data_entries(root) == []
    assert sorted(entry.name for entry in root.iterdir()) == ["app.json", "data"]


# --- Restart -----------------------------------------------------------------


def test_new_store_instance_loads_equivalent_records_after_restart(tmp_path: Path):
    root = _app_root(tmp_path)
    registry = MansionRegistry(
        mansions=(
            _record("weather-station", "created"),
            _record("attic-2", "existing"),
            _record("a", "created"),
        )
    )
    FileMansionMetadataStore(root).save(registry)
    saved_bytes = (root / "data" / REGISTRY_FILENAME).read_bytes()

    restarted = FileMansionMetadataStore(root)
    loaded = restarted.load()

    assert loaded == registry
    assert [record.name for record in loaded.mansions] == [
        "a",
        "attic-2",
        "weather-station",
    ]
    assert {record.name: record.origin for record in loaded.mansions} == {
        "a": "created",
        "attic-2": "existing",
        "weather-station": "created",
    }
    # Loading after restart does not rewrite the file.
    assert (root / "data" / REGISTRY_FILENAME).read_bytes() == saved_bytes
    assert _data_entries(root) == [REGISTRY_FILENAME]


def test_restart_from_cwd_factory_reads_the_same_registry(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    root = _app_root(tmp_path)
    registry = _registry("weather-station")
    FileMansionMetadataStore(root).save(registry)

    monkeypatch.chdir(root)
    restarted = FileMansionMetadataStore.from_cwd()

    assert restarted.load() == registry
    assert restarted.registry_path == (root / "data" / REGISTRY_FILENAME).resolve()


# --- Deterministic bytes -----------------------------------------------------


def test_saved_bytes_are_deterministic_across_record_orders_and_repeats(
    tmp_path: Path,
):
    names = ("delta", "alpha", "charlie-9", "bravo")
    forward = MansionRegistry(mansions=tuple(_record(n) for n in names))
    backward = MansionRegistry(mansions=tuple(_record(n) for n in reversed(names)))

    (tmp_path / "one").mkdir()
    (tmp_path / "two").mkdir()
    first_root = _app_root(tmp_path / "one")
    second_root = _app_root(tmp_path / "two")
    first = FileMansionMetadataStore(first_root)
    second = FileMansionMetadataStore(second_root)

    first.save(forward)
    second.save(backward)
    first_bytes = first.registry_path.read_bytes()

    assert first_bytes == second.registry_path.read_bytes()
    assert first_bytes == print_registry(forward).encode("utf-8")
    assert first_bytes.endswith(b"}\n") and not first_bytes.endswith(b"\n\n")
    assert b"\r" not in first_bytes
    assert first_bytes.index(b'"alpha"') < first_bytes.index(b'"bravo"')
    assert first_bytes.index(b'"bravo"') < first_bytes.index(b'"charlie-9"')
    assert first_bytes.index(b'"charlie-9"') < first_bytes.index(b'"delta"')

    # Saving the loaded value, or saving again, is a byte-level fixed point.
    first.save(first.load())
    assert first.registry_path.read_bytes() == first_bytes
    first.save(backward)
    assert first.registry_path.read_bytes() == first_bytes
    assert _data_entries(first_root) == [REGISTRY_FILENAME]


def test_saving_an_empty_registry_writes_the_canonical_empty_document(
    tmp_path: Path,
):
    root = _app_root(tmp_path)
    store = FileMansionMetadataStore(root)

    store.save(MansionRegistry())

    assert store.registry_path.read_bytes() == (
        b'{\n  "schemaVersion": 1,\n  "mansions": []\n}\n'
    )
    assert store.load() == MansionRegistry()


# --- Interrupted writes ------------------------------------------------------


class _Interrupted(OSError):
    """Injected I/O failure carrying text that must never surface."""

    def __init__(self) -> None:
        super().__init__(5, "disk fell over at /Users/secret-operator/private")


def _fail_fsync(monkeypatch: pytest.MonkeyPatch) -> None:
    def failing_fsync(_descriptor: int) -> None:
        raise _Interrupted()

    monkeypatch.setattr(mansion_metadata.os, "fsync", failing_fsync)


def _fail_replace(monkeypatch: pytest.MonkeyPatch) -> None:
    def failing_replace(_source: object, _destination: object) -> None:
        raise _Interrupted()

    monkeypatch.setattr(mansion_metadata.os, "replace", failing_replace)


def _fail_write(monkeypatch: pytest.MonkeyPatch) -> None:
    real_fdopen = os.fdopen

    class FailingHandle:
        def __init__(self, handle) -> None:
            self._handle = handle

        def __enter__(self):
            self._handle.__enter__()
            return self

        def __exit__(self, *exc_info):
            return self._handle.__exit__(*exc_info)

        def write(self, payload: bytes) -> int:
            # A partial write reaches only the temporary file.
            self._handle.write(payload[: len(payload) // 2])
            self._handle.flush()
            raise _Interrupted()

        def __getattr__(self, name: str):
            return getattr(self._handle, name)

    def failing_fdopen(descriptor, mode="r", *args, **kwargs):
        handle = real_fdopen(descriptor, mode, *args, **kwargs)
        return FailingHandle(handle) if "w" in mode else handle

    monkeypatch.setattr(mansion_metadata.os, "fdopen", failing_fdopen)


def _fail_mkstemp(monkeypatch: pytest.MonkeyPatch) -> None:
    def failing_mkstemp(*_args: object, **_kwargs: object):
        raise _Interrupted()

    monkeypatch.setattr(mansion_metadata.tempfile, "mkstemp", failing_mkstemp)


INTERRUPTIONS = {
    "temporary file creation": _fail_mkstemp,
    "write": _fail_write,
    "fsync": _fail_fsync,
    "replace": _fail_replace,
}


@pytest.mark.parametrize("stage", sorted(INTERRUPTIONS))
def test_interrupted_save_preserves_previous_registry_and_leaves_no_temp_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, stage: str
):
    root = _app_root(tmp_path)
    store = FileMansionMetadataStore(root)
    previous = _registry("weather-station")
    store.save(previous)
    original = store.registry_path.read_bytes()
    original_identity = store.registry_path.stat().st_ino

    with monkeypatch.context() as patch:
        INTERRUPTIONS[stage](patch)
        with pytest.raises(MetadataUnavailable) as caught:
            store.save(_registry("weather-station", "new-wing"))

    _assert_safe_error(caught, tmp_path)
    assert "secret-operator" not in str(caught.value)
    assert store.registry_path.read_bytes() == original
    assert store.registry_path.stat().st_ino == original_identity
    assert _data_entries(root) == [REGISTRY_FILENAME]
    # The old registry stays authoritative, including for a restarted store.
    assert store.load() == previous
    assert FileMansionMetadataStore(root).load() == previous

    # A retry after the failure clears succeeds.
    store.save(_registry("weather-station", "new-wing"))
    assert store.load() == _registry("new-wing", "weather-station")
    assert _data_entries(root) == [REGISTRY_FILENAME]


@pytest.mark.parametrize("stage", sorted(INTERRUPTIONS))
def test_interrupted_first_save_leaves_the_registry_absent(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, stage: str
):
    root = _app_root(tmp_path)
    store = FileMansionMetadataStore(root)

    with monkeypatch.context() as patch:
        INTERRUPTIONS[stage](patch)
        with pytest.raises(MetadataUnavailable):
            store.save(_registry("weather-station"))

    assert _data_entries(root) == []
    assert store.load() == MansionRegistry()


def test_non_io_interruption_propagates_and_still_cleans_up(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    root = _app_root(tmp_path)
    store = FileMansionMetadataStore(root)
    store.save(_registry("weather-station"))
    original = store.registry_path.read_bytes()

    def cancelled(_source: object, _destination: object) -> None:
        raise KeyboardInterrupt

    with monkeypatch.context() as patch:
        patch.setattr(mansion_metadata.os, "replace", cancelled)
        with pytest.raises(KeyboardInterrupt):
            store.save(_registry("new-wing"))

    assert store.registry_path.read_bytes() == original
    assert _data_entries(root) == [REGISTRY_FILENAME]


# --- Atomic replacement ------------------------------------------------------


def test_save_replaces_atomically_from_a_complete_same_directory_temp_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    root = _app_root(tmp_path)
    store = FileMansionMetadataStore(root)
    store.save(_registry("weather-station"))
    original = store.registry_path.read_bytes()
    original_identity = store.registry_path.stat().st_ino
    replacement = _registry("weather-station", "new-wing")
    expected = print_registry(replacement).encode("utf-8")

    real_replace = os.replace
    real_fsync = os.fsync
    observed: list[dict[str, object]] = []
    fsynced: list[int] = []

    def recording_fsync(descriptor: int) -> None:
        fsynced.append(os.fstat(descriptor).st_ino)
        real_fsync(descriptor)

    def recording_replace(source, destination) -> None:
        source_path = Path(source)
        destination_path = Path(destination)
        observed.append(
            {
                "source": source_path,
                "destination": destination_path,
                # The temp file is complete and durable before the swap...
                "source_bytes": source_path.read_bytes(),
                "source_inode": source_path.stat().st_ino,
                "source_mode": stat.S_IMODE(source_path.stat().st_mode),
                # ...and the live registry is still whole, never truncated.
                "destination_bytes": destination_path.read_bytes(),
                "destination_inode": destination_path.stat().st_ino,
            }
        )
        real_replace(source, destination)

    monkeypatch.setattr(mansion_metadata.os, "fsync", recording_fsync)
    monkeypatch.setattr(mansion_metadata.os, "replace", recording_replace)

    store.save(replacement)

    assert len(observed) == 1
    call = observed[0]
    source = call["source"]
    assert isinstance(source, Path)
    assert call["destination"] == store.registry_path
    assert source.parent == store.app_data_directory
    assert source.name != REGISTRY_FILENAME
    assert source.name.startswith(f".{REGISTRY_FILENAME}.")
    assert source.name.endswith(".tmp")
    assert call["source_bytes"] == expected
    assert call["source_mode"] & 0o077 == 0  # exclusive temp file, owner only
    assert call["destination_bytes"] == original
    assert call["destination_inode"] == original_identity
    # The temp file was fsynced before the replace, then the directory after.
    assert fsynced[0] == call["source_inode"]
    assert fsynced[-1] == store.app_data_directory.stat().st_ino

    assert store.registry_path.read_bytes() == expected
    assert store.registry_path.stat().st_ino == call["source_inode"]
    assert store.registry_path.stat().st_ino != original_identity
    assert not source.exists()
    assert _data_entries(root) == [REGISTRY_FILENAME]


def test_an_open_reader_keeps_the_complete_previous_registry_during_save(
    tmp_path: Path,
):
    root = _app_root(tmp_path)
    store = FileMansionMetadataStore(root)
    store.save(_registry("weather-station"))
    original = store.registry_path.read_bytes()

    with store.registry_path.open("rb") as reader:
        store.save(_registry("weather-station", "new-wing"))
        assert reader.read() == original  # the old inode was never rewritten

    assert store.registry_path.read_bytes() != original


def test_unsupported_directory_fsync_does_not_fail_a_completed_save(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    root = _app_root(tmp_path)
    store = FileMansionMetadataStore(root)
    real_fsync = os.fsync

    def fsync_without_directory_support(descriptor: int) -> None:
        if stat.S_ISDIR(os.fstat(descriptor).st_mode):
            raise OSError(mansion_metadata.errno.EINVAL, "unsupported")
        real_fsync(descriptor)

    monkeypatch.setattr(mansion_metadata.os, "fsync", fsync_without_directory_support)

    store.save(_registry("weather-station"))

    assert store.load() == _registry("weather-station")
    assert _data_entries(root) == [REGISTRY_FILENAME]


# --- Malformed, unsupported, and non-regular registries ------------------------

VALID_RECORD = (
    b'{"name":"a","projectSpec":"a","relativePath":"a","origin":"created"}'
)
INVALID_REGISTRIES = {
    "empty file": b"",
    "whitespace": b"  \n",
    "malformed json": b'{"schemaVersion":1,"mansions":[',
    "not json": b"mansions: []\n",
    "invalid utf-8": b'{"schemaVersion":1,"mansions":[]}\xff\xfe\n',
    "utf-8 bom": b'\xef\xbb\xbf{"schemaVersion":1,"mansions":[]}\n',
    "top-level array": b"[]\n",
    "top-level null": b"null\n",
    "future version": b'{"schemaVersion":2,"mansions":[]}\n',
    "version zero": b'{"schemaVersion":0,"mansions":[]}\n',
    "string version": b'{"schemaVersion":"1","mansions":[]}\n',
    "boolean version": b'{"schemaVersion":true,"mansions":[]}\n',
    "float version": b'{"schemaVersion":1.0,"mansions":[]}\n',
    "missing version": b'{"mansions":[]}\n',
    "missing mansions": b'{"schemaVersion":1}\n',
    "extra top-level field": b'{"schemaVersion":1,"mansions":[],"selected":"a"}\n',
    "duplicate top-level field": b'{"schemaVersion":1,"schemaVersion":1,"mansions":[]}\n',
    "mansions object": b'{"schemaVersion":1,"mansions":{}}\n',
    "duplicate names": b'{"schemaVersion":1,"mansions":['
    + VALID_RECORD
    + b","
    + VALID_RECORD
    + b"]}\n",
    "invalid name": b'{"schemaVersion":1,"mansions":[{"name":"Bad_Name",'
    b'"projectSpec":"Bad_Name","relativePath":"Bad_Name","origin":"created"}]}\n',
    "absolute relative path": b'{"schemaVersion":1,"mansions":[{"name":"a",'
    b'"projectSpec":"a","relativePath":"/tmp/a","origin":"created"}]}\n',
    "traversal relative path": b'{"schemaVersion":1,"mansions":[{"name":"a",'
    b'"projectSpec":"a","relativePath":"../a","origin":"created"}]}\n',
    "mismatched project spec": b'{"schemaVersion":1,"mansions":[{"name":"a",'
    b'"projectSpec":"b","relativePath":"a","origin":"created"}]}\n',
    "unknown origin": b'{"schemaVersion":1,"mansions":[{"name":"a",'
    b'"projectSpec":"a","relativePath":"a","origin":"imported"}]}\n',
    "extra record field": b'{"schemaVersion":1,"mansions":[{"name":"a",'
    b'"projectSpec":"a","relativePath":"a","origin":"created","createdAt":1}]}\n',
    "missing record field": b'{"schemaVersion":1,"mansions":[{"name":"a",'
    b'"projectSpec":"a","relativePath":"a"}]}\n',
    "nan constant": b'{"schemaVersion":NaN,"mansions":[]}\n',
}


@pytest.mark.parametrize("label", sorted(INVALID_REGISTRIES))
def test_invalid_registry_is_unavailable_and_never_repaired_by_load(
    tmp_path: Path, label: str
):
    original = INVALID_REGISTRIES[label]
    root = _app_root(tmp_path)
    registry_path = root / "data" / REGISTRY_FILENAME
    registry_path.write_bytes(original)
    before = registry_path.stat()
    store = FileMansionMetadataStore(root)

    for _attempt in range(2):
        with pytest.raises(MetadataUnavailable) as caught:
            store.load()
        _assert_safe_error(caught, tmp_path)

    # A restarted store sees the same failure rather than an empty registry.
    with pytest.raises(MetadataUnavailable):
        FileMansionMetadataStore(root).load()

    after = registry_path.stat()
    assert registry_path.read_bytes() == original
    assert (after.st_ino, after.st_size, after.st_mtime_ns) == (
        before.st_ino,
        before.st_size,
        before.st_mtime_ns,
    )
    # No rename-aside, backup, or temporary file appears.
    assert _data_entries(root) == [REGISTRY_FILENAME]


def test_registry_entry_that_is_a_directory_is_unavailable_and_preserved(
    tmp_path: Path,
):
    root = _app_root(tmp_path)
    registry_path = root / "data" / REGISTRY_FILENAME
    registry_path.mkdir()
    (registry_path / "keep.txt").write_bytes(b"operator data")
    store = FileMansionMetadataStore(root)

    with pytest.raises(MetadataUnavailable) as load_error:
        store.load()
    _assert_safe_error(load_error, tmp_path)

    # Saving cannot replace a directory and must not remove or empty it.
    with pytest.raises(MetadataUnavailable) as save_error:
        store.save(_registry("weather-station"))
    _assert_safe_error(save_error, tmp_path)

    assert registry_path.is_dir()
    assert (registry_path / "keep.txt").read_bytes() == b"operator data"
    assert _data_entries(root) == [REGISTRY_FILENAME]


@pytest.mark.skipif(not hasattr(os, "O_NOFOLLOW"), reason="needs O_NOFOLLOW")
def test_registry_entry_that_is_a_symlink_is_not_followed_on_load(tmp_path: Path):
    root = _app_root(tmp_path)
    outside = tmp_path / "outside" / "registry.json"
    outside.parent.mkdir()
    valid_bytes = print_registry(_registry("weather-station")).encode("utf-8")
    outside.write_bytes(valid_bytes)
    registry_path = root / "data" / REGISTRY_FILENAME
    registry_path.symlink_to(outside)
    store = FileMansionMetadataStore(root)

    with pytest.raises(MetadataUnavailable) as caught:
        store.load()

    _assert_safe_error(caught, tmp_path)
    assert registry_path.is_symlink()
    assert outside.read_bytes() == valid_bytes


def test_save_never_writes_through_a_symlinked_registry_entry(tmp_path: Path):
    root = _app_root(tmp_path)
    outside = tmp_path / "outside" / "registry.json"
    outside.parent.mkdir()
    outside.write_bytes(b"outside bytes that must survive\n")
    registry_path = root / "data" / REGISTRY_FILENAME
    registry_path.symlink_to(outside)
    store = FileMansionMetadataStore(root)
    registry = _registry("weather-station")

    store.save(registry)

    # The link itself was replaced by a regular app-owned file.
    assert outside.read_bytes() == b"outside bytes that must survive\n"
    assert not registry_path.is_symlink()
    assert registry_path.read_bytes() == print_registry(registry).encode("utf-8")
    assert sorted(entry.name for entry in outside.parent.iterdir()) == [
        "registry.json"
    ]


@pytest.mark.skipif(not hasattr(os, "mkfifo"), reason="needs named pipes")
def test_registry_entry_that_is_a_fifo_fails_without_blocking(tmp_path: Path):
    root = _app_root(tmp_path)
    registry_path = root / "data" / REGISTRY_FILENAME
    os.mkfifo(registry_path)
    store = FileMansionMetadataStore(root)

    with pytest.raises(MetadataUnavailable) as caught:
        store.load()

    _assert_safe_error(caught, tmp_path)
    assert stat.S_ISFIFO(registry_path.lstat().st_mode)


# --- Location changes after startup ------------------------------------------


def test_app_data_swapped_for_a_link_after_startup_blocks_load_and_save(
    tmp_path: Path,
):
    root = _app_root(tmp_path)
    store = FileMansionMetadataStore(root)
    store.save(_registry("weather-station"))
    moved = tmp_path / "moved-data"
    (root / "data").rename(moved)
    (root / "data").symlink_to(moved, target_is_directory=True)
    original = (moved / REGISTRY_FILENAME).read_bytes()

    with pytest.raises(MetadataUnavailable) as load_error:
        store.load()
    with pytest.raises(MetadataUnavailable) as save_error:
        store.save(_registry("new-wing"))

    _assert_safe_error(load_error, tmp_path)
    _assert_safe_error(save_error, tmp_path)
    assert (moved / REGISTRY_FILENAME).read_bytes() == original
    assert sorted(entry.name for entry in moved.iterdir()) == [REGISTRY_FILENAME]


def test_app_data_removed_after_startup_is_not_recreated(tmp_path: Path):
    root = _app_root(tmp_path)
    store = FileMansionMetadataStore(root)
    (root / "data").rmdir()

    with pytest.raises(MetadataUnavailable):
        store.load()
    with pytest.raises(MetadataUnavailable):
        store.save(_registry("weather-station"))

    assert not (root / "data").exists()


# --- Permission failures -----------------------------------------------------


@needs_permission_enforcement
def test_read_only_app_data_refuses_save_and_preserves_the_registry(
    tmp_path: Path,
):
    root = _app_root(tmp_path)
    store = FileMansionMetadataStore(root)
    previous = _registry("weather-station")
    store.save(previous)
    original = store.registry_path.read_bytes()
    data = root / "data"
    data.chmod(0o500)
    try:
        with pytest.raises(MetadataUnavailable) as caught:
            store.save(_registry("weather-station", "new-wing"))

        _assert_safe_error(caught, tmp_path)
        # Reading still works; the old registry stays authoritative.
        assert store.load() == previous
        assert store.registry_path.read_bytes() == original
        assert _data_entries(root) == [REGISTRY_FILENAME]
    finally:
        data.chmod(0o700)

    store.save(_registry("weather-station", "new-wing"))
    assert store.load() == _registry("new-wing", "weather-station")


@needs_permission_enforcement
def test_unreadable_registry_is_unavailable_not_empty_and_stays_unchanged(
    tmp_path: Path,
):
    root = _app_root(tmp_path)
    store = FileMansionMetadataStore(root)
    store.save(_registry("weather-station"))
    original = store.registry_path.read_bytes()
    store.registry_path.chmod(0o000)
    try:
        with pytest.raises(MetadataUnavailable) as caught:
            store.load()
        _assert_safe_error(caught, tmp_path)
        assert stat.S_IMODE(store.registry_path.stat().st_mode) == 0o000
    finally:
        store.registry_path.chmod(0o600)

    assert store.registry_path.read_bytes() == original
    assert _data_entries(root) == [REGISTRY_FILENAME]


@needs_permission_enforcement
def test_unsearchable_app_data_is_unavailable_for_load_and_save(tmp_path: Path):
    root = _app_root(tmp_path)
    store = FileMansionMetadataStore(root)
    store.save(_registry("weather-station"))
    original = store.registry_path.read_bytes()
    data = root / "data"
    data.chmod(0o000)
    try:
        with pytest.raises(MetadataUnavailable) as load_error:
            store.load()
        with pytest.raises(MetadataUnavailable) as save_error:
            store.save(_registry("new-wing"))
        _assert_safe_error(load_error, tmp_path)
        _assert_safe_error(save_error, tmp_path)
    finally:
        data.chmod(0o700)

    assert store.registry_path.read_bytes() == original
    assert _data_entries(root) == [REGISTRY_FILENAME]


# --- Separation from mansion roots -------------------------------------------


def test_registry_lives_in_app_data_and_outside_every_mansion_root(
    tmp_path: Path,
):
    root = _app_root(tmp_path)
    mansion_root = tmp_path / "home" / "workspace" / "haunted-house" / "mansions"
    project = mansion_root / "weather-station"
    (project / ".kiro" / "specs" / "weather-station").mkdir(parents=True)
    (project / "notes.txt").write_bytes(b"operator notes")

    def project_tree() -> dict[str, bytes | None]:
        return {
            path.relative_to(mansion_root).as_posix(): (
                path.read_bytes() if path.is_file() else None
            )
            for path in sorted(mansion_root.rglob("*"))
        }

    before = project_tree()
    store = FileMansionMetadataStore(root)
    registry = _registry("weather-station", "new-wing")

    store.save(registry)
    assert store.load() == registry

    registry_path = store.registry_path
    assert registry_path.parent == (root / "data").resolve()
    assert registry_path.name == REGISTRY_FILENAME
    assert store.app_data_directory == (root / "data").resolve()
    resolved_mansions = mansion_root.resolve()
    assert not registry_path.is_relative_to(resolved_mansions)
    assert not resolved_mansions.is_relative_to(store.app_data_directory)
    assert not registry_path.is_relative_to(project.resolve())

    # Saving and loading metadata never touches a mansion project.
    assert project_tree() == before
    assert not (mansion_root / "new-wing").exists()
    assert list(mansion_root.rglob(REGISTRY_FILENAME)) == []
    # Only the registry appears beneath the installed app.
    assert sorted(
        path.relative_to(root).as_posix() for path in root.rglob("*")
    ) == ["app.json", "data", f"data/{REGISTRY_FILENAME}"]


def test_stored_registry_text_contains_only_relative_names(tmp_path: Path):
    root = _app_root(tmp_path)
    store = FileMansionMetadataStore(root)
    store.save(_registry("weather-station", "new-wing"))

    text = store.registry_path.read_text(encoding="utf-8")

    assert str(tmp_path) not in text
    assert str(Path.home()) not in text
    assert str(root) not in text
    assert "/" not in text
    assert "\\" not in text
    assert "~" not in text
    assert ".." not in text
    assert '"relativePath": "weather-station"' in text
    assert '"relativePath": "new-wing"' in text


def test_store_never_falls_back_to_a_location_outside_app_data(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    # A source tree or home folder without the verified shape is refused
    # rather than silently used.
    bare = tmp_path / "not-an-app"
    bare.mkdir()
    monkeypatch.chdir(bare)

    with pytest.raises(MetadataUnavailable) as caught:
        FileMansionMetadataStore.from_cwd()

    _assert_safe_error(caught, tmp_path)
    assert list(bare.iterdir()) == []
