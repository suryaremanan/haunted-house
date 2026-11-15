"""Safety examples for mansion root resolution and snapshot collection.

Exclusive project creation, race injection, and guarded rollback are deferred
to mansion-lifecycle tasks 3.2 and 3.3.
"""

from pathlib import Path

import pytest

from haunted_house.adapters.mansion_filesystem import (
    MansionFilesystem,
    MansionFilesystemError,
    ResolvedMansion,
)
from haunted_house.core.mansion_planner import (
    EntryKind,
    ProjectStatus,
    classify_project,
)


def configured_filesystem(tmp_path: Path) -> tuple[MansionFilesystem, Path, Path]:
    approved = tmp_path / "home" / "workspace"
    approved.mkdir(parents=True)
    root = approved / "haunted-house" / "mansions"
    return MansionFilesystem(root, (approved,)), approved, root


def required_tree(target: Path, name: str = "weather-station") -> None:
    (target / ".kiro" / "specs" / name).mkdir(parents=True)


def test_safe_root_creates_only_missing_containers_below_existing_approved_root(
    tmp_path,
):
    filesystem, approved, root = configured_filesystem(tmp_path)
    untouched = approved / "existing-project.txt"
    untouched.write_bytes(b"keep these bytes")

    fact = filesystem.ensure_safe_root()

    assert fact.lexical == root
    assert fact.canonical == root.resolve()
    assert fact.kind == "directory"
    assert untouched.read_bytes() == b"keep these bytes"
    assert sorted(path.relative_to(approved).as_posix() for path in approved.rglob("*")) == [
        "existing-project.txt",
        "haunted-house",
        "haunted-house/mansions",
    ]


@pytest.mark.parametrize("kind", ["file", "symlink"])
def test_root_rejects_non_directory_and_symlink_components_without_target_writes(
    tmp_path, kind
):
    approved = tmp_path / "home" / "workspace"
    approved.mkdir(parents=True)
    component = approved / "haunted-house"
    if kind == "file":
        component.write_bytes(b"existing data")
    else:
        outside = tmp_path / "outside"
        outside.mkdir()
        component.symlink_to(outside, target_is_directory=True)
    root = component / "mansions"
    filesystem = MansionFilesystem(root, (approved,))

    with pytest.raises(MansionFilesystemError) as caught:
        filesystem.ensure_safe_root()

    assert caught.value.code == "unsafe_mansion_root"
    assert str(caught.value) == "unsafe_mansion_root"
    assert not (component / "mansions").exists()


@pytest.mark.parametrize(
    "configured",
    [
        Path("relative/mansions"),
        Path("/tmp") / "approved" / ".." / "mansions",
    ],
)
def test_relative_and_parent_referencing_roots_are_rejected_before_mutation(
    tmp_path, configured
):
    approved = tmp_path / "workspace"
    approved.mkdir()
    filesystem = MansionFilesystem(configured, (approved,))

    with pytest.raises(MansionFilesystemError) as caught:
        filesystem.ensure_safe_root()

    assert caught.value.code == "unsafe_mansion_root"
    assert list(approved.iterdir()) == []


def test_resolve_derives_the_target_from_a_validated_name_only(tmp_path):
    filesystem, _, root = configured_filesystem(tmp_path)

    mansion = filesystem.resolve("weather-station")

    assert mansion == ResolvedMansion(
        name="weather-station",
        project_spec="weather-station",
        root=root.resolve(),
        target=root.resolve() / "weather-station",
        display_path="~/workspace/haunted-house/mansions/weather-station",
    )
    assert not mansion.target.exists()

    with pytest.raises(ValueError, match="^invalid_mansion_name$"):
        filesystem.resolve("../outside")
    assert not (root.parent / "outside").exists()


def test_snapshot_collects_an_absent_tree_as_canonical_missing_facts(tmp_path):
    filesystem, _, root = configured_filesystem(tmp_path)
    mansion = filesystem.resolve("weather-station")

    snapshot = filesystem.snapshot(mansion)

    assert classify_project(snapshot) is ProjectStatus.MISSING
    assert snapshot.target.canonical == (root / "weather-station").resolve()
    assert {snapshot.target.kind, *(item.kind for item in snapshot.required_descendants)} == {
        EntryKind.MISSING
    }
    assert snapshot.extra_entries == ()


def test_snapshot_classifies_required_directories_and_observes_extra_entries(
    tmp_path,
):
    filesystem, _, _ = configured_filesystem(tmp_path)
    mansion = filesystem.resolve("weather-station")
    required_tree(mansion.target)
    readme = mansion.target / "README.md"
    readme.write_bytes(b"opaque project bytes\x00\xff")
    nested_extra = mansion.target / ".kiro" / "specs" / "weather-station" / "notes"
    nested_extra.mkdir()

    snapshot = filesystem.snapshot(mansion)

    assert classify_project(snapshot) is ProjectStatus.READY
    assert all(
        entry.kind is EntryKind.DIRECTORY
        for entry in (snapshot.target, *snapshot.required_descendants)
    )
    assert {Path(entry.lexical).relative_to(mansion.target).as_posix() for entry in snapshot.extra_entries} == {
        "README.md",
        ".kiro/specs/weather-station/notes",
    }
    assert readme.read_bytes() == b"opaque project bytes\x00\xff"


@pytest.mark.parametrize("required_name", [".kiro", ".kiro/specs"])
def test_snapshot_marks_required_files_as_project_conflicts(tmp_path, required_name):
    filesystem, _, _ = configured_filesystem(tmp_path)
    mansion = filesystem.resolve("weather-station")
    mansion.target.mkdir()
    required = mansion.target / required_name
    required.parent.mkdir(parents=True, exist_ok=True)
    required.write_bytes(b"do not replace")

    snapshot = filesystem.snapshot(mansion)

    assert classify_project(snapshot) is ProjectStatus.CONFLICT
    assert required.read_bytes() == b"do not replace"


def test_in_root_required_symlink_is_a_conflict_without_following_it(tmp_path):
    filesystem, _, root = configured_filesystem(tmp_path)
    mansion = filesystem.resolve("weather-station")
    mansion.target.mkdir()
    shared = root / "shared-kiro"
    shared.mkdir()
    (mansion.target / ".kiro").symlink_to(shared, target_is_directory=True)

    snapshot = filesystem.snapshot(mansion)

    assert snapshot.kiro.kind is EntryKind.SYMLINK
    assert classify_project(snapshot) is ProjectStatus.CONFLICT
    assert list(shared.iterdir()) == []


def test_escaping_required_symlink_returns_only_the_stable_error_code(tmp_path):
    filesystem, _, _ = configured_filesystem(tmp_path)
    mansion = filesystem.resolve("weather-station")
    mansion.target.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    (mansion.target / ".kiro").symlink_to(outside, target_is_directory=True)

    with pytest.raises(MansionFilesystemError) as caught:
        filesystem.snapshot(mansion)

    assert caught.value.code == "symlink_escape"
    assert str(caught.value) == "symlink_escape"
    assert str(tmp_path) not in str(caught.value)
    assert list(outside.iterdir()) == []
