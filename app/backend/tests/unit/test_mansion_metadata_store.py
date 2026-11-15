"""Focused implementation tests for the atomic metadata store (task 4.1).

Task 4.2 owns the exhaustive adapter matrix for interrupted writes, permission
failures, replacement identity, and restart behavior.
"""

from pathlib import Path

import pytest

from haunted_house.adapters.mansion_metadata import (
    REGISTRY_FILENAME,
    FileMansionMetadataStore,
    MetadataUnavailable,
    resolve_app_data_directory,
)
from haunted_house.core.mansion_registry import (
    MansionRecord,
    MansionRegistry,
    print_registry,
)


def _app_root(tmp_path: Path) -> Path:
    root = tmp_path / "installed-app"
    root.mkdir()
    (root / "app.json").write_text("{}\n", encoding="utf-8")
    (root / "data").mkdir()
    return root


def _registry() -> MansionRegistry:
    return MansionRegistry(
        mansions=(
            MansionRecord(
                name="weather-station",
                project_spec="weather-station",
                relative_path="weather-station",
                origin="created",
            ),
        )
    )


def test_store_uses_verified_direct_app_data_and_missing_file_is_empty(
    tmp_path: Path,
):
    root = _app_root(tmp_path)

    store = FileMansionMetadataStore(root)

    assert resolve_app_data_directory(root) == (root / "data").resolve()
    assert store.registry_path == (root / "data" / REGISTRY_FILENAME).resolve()
    assert store.load() == MansionRegistry()
    assert not store.registry_path.exists()


def test_save_writes_canonical_registry_and_removes_temporary_file(tmp_path: Path):
    root = _app_root(tmp_path)
    store = FileMansionMetadataStore(root)
    registry = _registry()

    store.save(registry)

    assert store.registry_path.read_bytes() == print_registry(registry).encode("utf-8")
    assert store.load() == registry
    assert tuple((root / "data").iterdir()) == (store.registry_path,)


@pytest.mark.parametrize(
    "original",
    [
        b"not json\n",
        b'{"schemaVersion":2,"mansions":[]}\n',
    ],
)
def test_load_preserves_malformed_and_unsupported_registry_bytes(
    tmp_path: Path, original: bytes
):
    root = _app_root(tmp_path)
    registry_path = root / "data" / REGISTRY_FILENAME
    registry_path.write_bytes(original)
    store = FileMansionMetadataStore(root)

    with pytest.raises(MetadataUnavailable, match="^mansion metadata is unavailable$"):
        store.load()

    assert registry_path.read_bytes() == original


@pytest.mark.parametrize("missing_entry", ["app.json", "data"])
def test_store_fails_closed_when_required_app_data_shape_is_missing(
    tmp_path: Path, missing_entry: str
):
    root = _app_root(tmp_path)
    entry = root / missing_entry
    if entry.is_dir():
        entry.rmdir()
    else:
        entry.unlink()

    with pytest.raises(MetadataUnavailable):
        FileMansionMetadataStore(root)


def test_store_rejects_linked_app_data(tmp_path: Path):
    root = _app_root(tmp_path)
    outside = tmp_path / "outside-data"
    outside.mkdir()
    (root / "data").rmdir()
    (root / "data").symlink_to(outside, target_is_directory=True)

    with pytest.raises(MetadataUnavailable):
        FileMansionMetadataStore(root)
