"""Safety tests for exact mansion creation and guarded rollback.

Every test works inside pytest's temporary directory. A complete snapshot of
the tree (entry kinds, file bytes, link targets) is taken before and after each
operation to prove existing project data is left byte-for-byte unchanged.
"""

import errno
import os
import stat
from pathlib import Path

import pytest

from haunted_house.adapters import mansion_filesystem
from haunted_house.adapters.mansion_filesystem import (
    MansionFilesystem,
    MansionFilesystemError,
)
from haunted_house.core.mansion_planner import ProjectStatus, classify_project

NAME = "weather-station"
REQUIRED = (".kiro", ".kiro/specs", f".kiro/specs/{NAME}")


def configured(tmp_path: Path) -> tuple[MansionFilesystem, Path, Path]:
    approved = tmp_path / "home" / "workspace"
    approved.mkdir(parents=True)
    root = approved / "haunted-house" / "mansions"
    return MansionFilesystem(root, (approved,)), approved, root


def tree(base: Path) -> dict[str, tuple[str, bytes]]:
    """Every entry below `base`: kind plus file bytes or link target."""
    seen: dict[str, tuple[str, bytes]] = {}
    for current, directories, files in os.walk(base, followlinks=False):
        for entry in (*directories, *files):
            path = Path(current) / entry
            relative = path.relative_to(base).as_posix()
            mode = path.lstat().st_mode
            if stat.S_ISLNK(mode):
                seen[relative] = ("symlink", os.readlink(path).encode())
            elif stat.S_ISDIR(mode):
                seen[relative] = ("directory", b"")
            else:
                seen[relative] = ("file", path.read_bytes())
    return seen


def code_of(caught: pytest.ExceptionInfo[MansionFilesystemError]) -> str:
    assert str(caught.value) == caught.value.code  # no path or OS text
    return caught.value.code


# --- Exact creation ---------------------------------------------------------


def test_create_makes_exactly_four_directories_and_no_file(tmp_path):
    filesystem, approved, root = configured(tmp_path)
    mansion = filesystem.resolve(NAME)

    assert filesystem.create_minimal_tree(mansion) is None

    assert tree(approved) == {
        "haunted-house": ("directory", b""),
        "haunted-house/mansions": ("directory", b""),
        f"haunted-house/mansions/{NAME}": ("directory", b""),
        **{
            f"haunted-house/mansions/{NAME}/{entry}": ("directory", b"")
            for entry in REQUIRED
        },
    }
    assert classify_project(filesystem.snapshot(mansion)) is ProjectStatus.READY
    assert filesystem.snapshot(mansion).extra_entries == ()


def test_default_container_setup_leaves_approved_root_siblings_alone(tmp_path):
    filesystem, approved, root = configured(tmp_path)
    (approved / "other-project").mkdir()
    (approved / "other-project" / "notes.txt").write_bytes(b"\x00keep\xff")
    before = tree(approved)

    filesystem.create_minimal_tree(filesystem.resolve(NAME))

    after = tree(approved)
    assert {key: after[key] for key in before} == before
    assert after["other-project/notes.txt"] == ("file", b"\x00keep\xff")


def test_second_create_is_refused_and_changes_nothing(tmp_path):
    filesystem, _approved, root = configured(tmp_path)
    mansion = filesystem.resolve(NAME)
    filesystem.create_minimal_tree(mansion)
    before = tree(root)

    with pytest.raises(MansionFilesystemError) as caught:
        filesystem.create_minimal_tree(mansion)

    assert code_of(caught) == "mansion_conflict"
    assert tree(root) == before


def test_sibling_prefix_names_are_separate_projects(tmp_path):
    filesystem, approved, root = configured(tmp_path)
    filesystem.ensure_safe_root()
    sibling_root = root.parent / "mansions-old"
    (sibling_root / "weather").mkdir(parents=True)
    (sibling_root / "weather" / "data.bin").write_bytes(b"old root data")
    longer = root / f"{NAME}-two"
    longer.mkdir()
    (longer / "main.py").write_bytes(b"print('mine')\n")
    before = tree(approved)

    filesystem.create_minimal_tree(filesystem.resolve(NAME))

    after = tree(approved)
    assert {key: after[key] for key in before} == before
    created = sorted(set(after) - set(before))
    assert created == sorted(
        [f"haunted-house/mansions/{NAME}"]
        + [f"haunted-house/mansions/{NAME}/{entry}" for entry in REQUIRED]
    )


# --- Existing trees are never changed ---------------------------------------


def test_compatible_tree_with_opaque_extras_is_ready_and_unchanged(tmp_path):
    filesystem, _approved, root = configured(tmp_path)
    filesystem.ensure_safe_root()
    target = root / NAME
    (target / ".kiro" / "specs" / NAME).mkdir(parents=True)
    (target / ".kiro" / "specs" / NAME / "requirements.md").write_bytes(b"# mine\n")
    (target / "src").mkdir()
    (target / "src" / "blob.bin").write_bytes(bytes(range(256)))
    (target / "link").symlink_to("src/blob.bin")
    before = tree(root)
    mansion = filesystem.resolve(NAME)

    snapshot = filesystem.snapshot(mansion)
    assert classify_project(snapshot) is ProjectStatus.READY
    assert len(snapshot.extra_entries) == 4
    with pytest.raises(MansionFilesystemError) as caught:
        filesystem.create_minimal_tree(mansion)

    assert code_of(caught) == "mansion_conflict"
    assert tree(root) == before


@pytest.mark.parametrize("position", ["", *REQUIRED])
def test_file_at_target_or_required_descendant_is_a_conflict(tmp_path, position):
    filesystem, _approved, root = configured(tmp_path)
    filesystem.ensure_safe_root()
    blocked = root / NAME / position if position else root / NAME
    blocked.parent.mkdir(parents=True, exist_ok=True)
    blocked.write_bytes(b"user data \x00\x01")
    before = tree(root)
    mansion = filesystem.resolve(NAME)

    assert classify_project(filesystem.snapshot(mansion)) is ProjectStatus.CONFLICT
    with pytest.raises(MansionFilesystemError) as caught:
        filesystem.create_minimal_tree(mansion)

    assert code_of(caught) == "mansion_conflict"
    assert tree(root) == before


@pytest.mark.parametrize("position", ["", *REQUIRED])
def test_in_root_symlink_is_a_conflict_and_is_not_followed(tmp_path, position):
    filesystem, _approved, root = configured(tmp_path)
    filesystem.ensure_safe_root()
    inside = root / "elsewhere"
    inside.mkdir()
    (inside / "keep.txt").write_bytes(b"inside data")
    link = root / NAME / position if position else root / NAME
    link.parent.mkdir(parents=True, exist_ok=True)
    link.symlink_to(inside, target_is_directory=True)
    before = tree(root)
    mansion = filesystem.resolve(NAME)

    with pytest.raises(MansionFilesystemError) as caught:
        filesystem.create_minimal_tree(mansion)

    # A link at the target resolves to a sibling of the target, which is still
    # inside the root, so it is a conflict rather than an escape.
    assert code_of(caught) == "mansion_conflict"
    assert tree(root) == before


@pytest.mark.parametrize("position", ["", *REQUIRED])
def test_escaping_symlink_is_reported_and_nothing_is_written_through(
    tmp_path, position
):
    filesystem, _approved, root = configured(tmp_path)
    filesystem.ensure_safe_root()
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "private.txt").write_bytes(b"outside data")
    link = root / NAME / position if position else root / NAME
    link.parent.mkdir(parents=True, exist_ok=True)
    link.symlink_to(outside, target_is_directory=True)
    before_root, before_outside = tree(root), tree(outside)
    mansion = filesystem.resolve(NAME)

    with pytest.raises(MansionFilesystemError) as snapshot_error:
        filesystem.snapshot(mansion)
    with pytest.raises(MansionFilesystemError) as create_error:
        filesystem.create_minimal_tree(mansion)

    assert code_of(snapshot_error) == "symlink_escape"
    assert code_of(create_error) == "symlink_escape"
    assert tree(root) == before_root
    assert tree(outside) == before_outside


# --- Races injected between the final check and each mkdir ------------------


def race_before(monkeypatch, component: str, action) -> list[str]:
    """Run `action()` just before the adapter makes `component`."""
    real = mansion_filesystem._mkdir_at
    calls: list[str] = []

    def racing(name: str, parent_descriptor: int) -> None:
        calls.append(name)
        if name == component and calls.count(name) == 1:
            action()
        real(name, parent_descriptor)

    monkeypatch.setattr(mansion_filesystem, "_mkdir_at", racing)
    return calls


@pytest.mark.parametrize("collider", ["file", "directory", "symlink"])
def test_collision_at_the_target_stops_before_any_write(
    tmp_path, monkeypatch, collider
):
    filesystem, _approved, root = configured(tmp_path)
    mansion = filesystem.resolve(NAME)
    outside = tmp_path / "outside"
    outside.mkdir()
    target = root / NAME

    def collide() -> None:
        if collider == "file":
            target.write_bytes(b"raced file")
        elif collider == "directory":
            target.mkdir()
            (target / "theirs.txt").write_bytes(b"raced project")
        else:
            target.symlink_to(outside, target_is_directory=True)

    calls = race_before(monkeypatch, NAME, collide)

    with pytest.raises(MansionFilesystemError) as caught:
        filesystem.create_minimal_tree(mansion)

    assert code_of(caught) == "mansion_conflict"
    assert calls == [NAME]  # stopped at the collision
    assert tree(outside) == {}
    expected = {
        "file": {NAME: ("file", b"raced file")},
        "directory": {
            NAME: ("directory", b""),
            f"{NAME}/theirs.txt": ("file", b"raced project"),
        },
        "symlink": {NAME: ("symlink", str(outside).encode())},
    }[collider]
    assert tree(root) == expected


@pytest.mark.parametrize("collider", ["file", "symlink"])
def test_collision_at_a_descendant_keeps_the_colliding_entry(
    tmp_path, monkeypatch, collider
):
    filesystem, _approved, root = configured(tmp_path)
    mansion = filesystem.resolve(NAME)
    outside = tmp_path / "outside"
    outside.mkdir()
    blocked = root / NAME / ".kiro" / "specs"

    def collide() -> None:
        if collider == "file":
            blocked.write_bytes(b"raced file")
        else:
            blocked.symlink_to(outside, target_is_directory=True)

    calls = race_before(monkeypatch, "specs", collide)

    with pytest.raises(MansionFilesystemError) as caught:
        filesystem.create_minimal_tree(mansion)

    # The directories this attempt made now hold someone else's entry, so they
    # are not empty and rollback must leave them: an unclassified failure.
    assert code_of(caught) == "filesystem_error"
    assert calls == [NAME, ".kiro", "specs"]
    assert tree(outside) == {}
    content = (
        ("file", b"raced file")
        if collider == "file"
        else ("symlink", str(outside).encode())
    )
    assert tree(root) == {
        NAME: ("directory", b""),
        f"{NAME}/.kiro": ("directory", b""),
        f"{NAME}/.kiro/specs": content,
    }


def test_io_failure_rolls_back_only_this_attempts_empty_directories(
    tmp_path, monkeypatch
):
    filesystem, _approved, root = configured(tmp_path)
    filesystem.ensure_safe_root()
    (root / "neighbour").mkdir()
    (root / "neighbour" / "keep.txt").write_bytes(b"neighbour data")
    before = tree(root)
    mansion = filesystem.resolve(NAME)
    real = mansion_filesystem._mkdir_at

    def failing(name: str, parent_descriptor: int) -> None:
        if name == NAME and (root / NAME / ".kiro" / "specs").is_dir():
            raise OSError(errno.EIO, "/Users/someone/secret path")
        real(name, parent_descriptor)

    monkeypatch.setattr(mansion_filesystem, "_mkdir_at", failing)

    with pytest.raises(MansionFilesystemError) as caught:
        filesystem.create_minimal_tree(mansion)

    assert code_of(caught) == "filesystem_error"
    assert "secret" not in repr(caught.value)
    assert caught.value.__cause__ is None
    assert tree(root) == before  # all three created directories removed


def test_rollback_stops_when_a_created_directory_was_replaced(
    tmp_path, monkeypatch
):
    filesystem, _approved, root = configured(tmp_path)
    mansion = filesystem.resolve(NAME)
    target = root / NAME
    real = mansion_filesystem._mkdir_at

    def tampering(name: str, parent_descriptor: int) -> None:
        if name == "specs":
            # Another actor swaps the directory this attempt made for its own.
            (target / ".kiro").rename(target / ".kiro-moved")
            (target / ".kiro").mkdir()
            raise OSError(errno.EIO, "injected")
        real(name, parent_descriptor)

    monkeypatch.setattr(mansion_filesystem, "_mkdir_at", tampering)

    with pytest.raises(MansionFilesystemError) as caught:
        filesystem.create_minimal_tree(mansion)

    assert code_of(caught) == "filesystem_error"
    # The replacement has a different inode, so nothing at all was removed.
    assert tree(root) == {
        NAME: ("directory", b""),
        f"{NAME}/.kiro": ("directory", b""),
        f"{NAME}/.kiro-moved": ("directory", b""),
    }


def test_rollback_never_removes_a_directory_that_gained_contents(
    tmp_path, monkeypatch
):
    filesystem, _approved, root = configured(tmp_path)
    mansion = filesystem.resolve(NAME)
    target = root / NAME
    real = mansion_filesystem._mkdir_at

    def writing(name: str, parent_descriptor: int) -> None:
        if name == "specs":
            (target / "user-file.txt").write_bytes(b"written during create")
            raise OSError(errno.ENOSPC, "injected")
        real(name, parent_descriptor)

    monkeypatch.setattr(mansion_filesystem, "_mkdir_at", writing)

    with pytest.raises(MansionFilesystemError) as caught:
        filesystem.create_minimal_tree(mansion)

    assert code_of(caught) == "filesystem_error"
    assert tree(root) == {
        NAME: ("directory", b""),
        f"{NAME}/user-file.txt": ("file", b"written during create"),
    }


def test_target_swapped_for_an_escaping_link_is_never_written_through(
    tmp_path, monkeypatch
):
    filesystem, _approved, root = configured(tmp_path)
    mansion = filesystem.resolve(NAME)
    outside = tmp_path / "outside"
    outside.mkdir()
    target = root / NAME

    def swap() -> None:
        target.rename(root / "moved-away")
        target.symlink_to(outside, target_is_directory=True)

    race_before(monkeypatch, ".kiro", swap)

    with pytest.raises(MansionFilesystemError) as caught:
        filesystem.create_minimal_tree(mansion)

    # Descendants were made relative to the opened directory, not the path, so
    # they followed the renamed directory and the link target stayed empty.
    assert code_of(caught) == "symlink_escape"
    assert tree(outside) == {}
    assert tree(root)[NAME] == ("symlink", str(outside).encode())


def test_adapter_exposes_no_deletion_operation():
    public = [name for name in dir(MansionFilesystem) if not name.startswith("_")]
    assert sorted(public) == [
        "create_minimal_tree",
        "ensure_safe_root",
        "resolve",
        "snapshot",
        # Decision 2026-11-16 (feature brief): one exclusive, never-overwriting
        # file create. Still no delete, rename, or replace.
        "write_brief",
    ]
    assert sorted(mansion_filesystem.__all__) == [
        "FilesystemErrorCode",
        "MansionFilesystem",
        "MansionFilesystemError",
        "ResolvedMansion",
    ]
