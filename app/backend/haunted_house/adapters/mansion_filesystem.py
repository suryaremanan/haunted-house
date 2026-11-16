"""Confined filesystem inspection for mansion roots and project trees.

The browser never supplies a path to this adapter. A validated mansion name is
appended to server-owned root configuration, and pure core policy evaluates the
filesystem facts collected here.

Project creation uses exclusive ``mkdir`` calls relative to no-follow
directory descriptors. A failed attempt may remove only the empty directories
that same attempt created, after checking their device and inode identity. The
adapter exposes no deletion operation.
"""

from __future__ import annotations

import os
import stat
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, TypeAlias

from haunted_house.core.mansion_names import is_valid_mansion_name
from haunted_house.core.mansion_paths import (
    PathFact,
    evaluate_mansion_path,
    evaluate_root,
    is_component_within,
)
from haunted_house.core.mansion_planner import (
    EntryFact,
    EntryKind,
    ProjectSnapshot,
    ProjectStatus,
    classify_project,
)

__all__ = [
    "FilesystemErrorCode",
    "MansionFilesystem",
    "MansionFilesystemError",
    "ResolvedMansion",
]

FilesystemErrorCode: TypeAlias = Literal[
    "unsafe_mansion_root",
    "symlink_escape",
    "mansion_conflict",
    "filesystem_error",
]


class MansionFilesystemError(RuntimeError):
    """A safe, stable filesystem failure without host path details."""

    def __init__(self, code: FilesystemErrorCode) -> None:
        self.code = code
        super().__init__(code)


@dataclass(frozen=True, slots=True)
class ResolvedMansion:
    """A server-derived mansion target.

    ``root`` and ``target`` are internal filesystem authority and must not be
    returned directly by an HTTP handler. ``display_path`` is presentation-only
    and contains no absolute home path.
    """

    name: str
    project_spec: str
    root: Path
    target: Path
    display_path: str


class MansionFilesystem:
    """Resolve and inspect mansions beneath one configured safe root."""

    def __init__(
        self,
        mansion_root: Path | str,
        approved_roots: Iterable[Path | str],
    ) -> None:
        self._configured_root = Path(mansion_root)
        self._configured_approved_roots = tuple(
            Path(root) for root in approved_roots
        )

    def ensure_safe_root(self) -> PathFact:
        """Validate the configured root and create only missing containers.

        At least one configured Approved_Root must already be a real directory.
        Every existing component of Mansion_Root is inspected with ``lstat``;
        symbolic links and non-directories are rejected before setup starts.
        Missing components at or below the selected Approved_Root are then
        created one at a time and the complete chain is revalidated.
        """

        root = _expand_absolute_clean(self._configured_root)
        approved_paths = tuple(
            _expand_approved(root) for root in self._configured_approved_roots
        )
        approved_facts = tuple(_collect_path_fact(path) for path in approved_paths)
        root_chain = _collect_root_chain(root)

        decision = evaluate_root(approved_facts, root_chain)
        if not decision.accepted:
            _fail("unsafe_mansion_root")

        approved = _select_approved_root(approved_facts, root_chain[-1])
        if approved is None:
            _fail("unsafe_mansion_root")

        for component in root_chain:
            if component.kind != "missing":
                continue
            if not is_component_within(approved.lexical, component.lexical):
                _fail("unsafe_mansion_root")
            _create_root_container(Path(component.lexical))

        final_approved = tuple(
            _collect_path_fact(Path(fact.lexical)) for fact in approved_facts
        )
        final_chain = _collect_root_chain(root)
        final_decision = evaluate_root(final_approved, final_chain)
        final_root = final_chain[-1]
        if not final_decision.accepted or final_root.kind != "directory":
            _fail("unsafe_mansion_root")
        return final_root

    def resolve(self, name: str) -> ResolvedMansion:
        """Derive one target from a validated name and server configuration."""

        if not is_valid_mansion_name(name):
            raise ValueError("invalid_mansion_name")

        root = self.ensure_safe_root()
        root_path = Path(root.canonical)
        target = root_path / name
        if not is_component_within(root.canonical, target):
            _fail("mansion_conflict")

        return ResolvedMansion(
            name=name,
            project_spec=name,
            root=root_path,
            target=target,
            display_path=self._display_path(target),
        )

    def snapshot(self, mansion: ResolvedMansion) -> ProjectSnapshot:
        """Collect canonical facts for a mansion's required project tree.

        Symlink and non-directory entries remain facts for the pure planner to
        classify as conflicts. A canonical escape is rejected here with the
        distinct ``symlink_escape`` code. Additional entries are observed with
        ``lstat`` and never opened or followed.
        """

        if not is_valid_mansion_name(mansion.name):
            raise ValueError("invalid_mansion_name")
        if mansion.project_spec != mansion.name:
            _fail("mansion_conflict")

        root = self.ensure_safe_root()
        root_path = Path(root.canonical)
        expected_target = root_path / mansion.name
        if mansion.root != root_path or mansion.target != expected_target:
            _fail("mansion_conflict")

        target = _collect_entry_fact(expected_target)
        kiro = _collect_entry_fact(expected_target / ".kiro")
        specs = _collect_entry_fact(expected_target / ".kiro" / "specs")
        project_spec = _collect_entry_fact(
            expected_target / ".kiro" / "specs" / mansion.project_spec
        )
        required = (target, kiro, specs, project_spec)

        path_decision = evaluate_mansion_path(
            root,
            tuple(_as_path_fact(entry) for entry in required),
        )
        if path_decision.code in ("unsafe_mansion_root", "symlink_escape"):
            _fail(path_decision.code)

        return ProjectSnapshot(
            target=target,
            kiro=kiro,
            specs=specs,
            project_spec=project_spec,
            extra_entries=_collect_extra_entries(
                expected_target,
                frozenset(Path(entry.lexical) for entry in required[1:]),
            ),
        )

    def create_minimal_tree(self, mansion: ResolvedMansion) -> None:
        """Create exactly the Minimal_Project_Tree for an absent mansion.

        The caller holds the service mutation lock. Every check is repeated
        here, immediately before the first write. Each directory is made with
        an exclusive ``mkdir`` relative to a descriptor opened without
        following links, so a colliding entry is never replaced or written
        through. On failure only the empty directories made by this attempt
        are removed, and only while their device and inode still match. A
        collision that rolls back cleanly is ``mansion_conflict``; any other
        failure, including an incomplete rollback, is ``filesystem_error``.
        """

        snapshot = self.snapshot(mansion)
        if classify_project(snapshot) is not ProjectStatus.MISSING:
            _fail("mansion_conflict")
        if not _DIR_FD_SUPPORTED:
            # Without descriptor-relative no-follow operations the creation
            # could be redirected through a swapped link, so refuse.
            _fail("filesystem_error")

        components = (mansion.name, ".kiro", "specs", mansion.project_spec)
        created: list[_CreatedDirectory] = []
        open_descriptors: list[int] = []
        failure: FilesystemErrorCode | None = None
        try:
            try:
                parent = _open_directory(mansion.root, None)
                open_descriptors.append(parent)
                for component in components:
                    _mkdir_at(component, parent)
                    child = _open_directory(component, parent)
                    open_descriptors.append(child)
                    status = os.fstat(child)
                    created.append(
                        _CreatedDirectory(
                            parent_descriptor=parent,
                            name=component,
                            device=status.st_dev,
                            inode=status.st_ino,
                        )
                    )
                    parent = child
            except FileExistsError:
                failure = "mansion_conflict"
            except OSError:
                failure = "filesystem_error"

            if failure is not None and not _roll_back(created):
                failure = "filesystem_error"
        finally:
            for descriptor in reversed(open_descriptors):
                try:
                    os.close(descriptor)
                except OSError:
                    pass

        if failure is not None:
            _fail(failure)

        if classify_project(self.snapshot(mansion)) is not ProjectStatus.READY:
            # Something else changed the new tree. Its contents are unknown,
            # so nothing is removed.
            _fail("mansion_conflict")

    def write_brief(self, mansion: ResolvedMansion, text: str) -> bool:
        """Write ``text`` once to ``.kiro/specs/<projectSpec>/brief.md``.

        The project tree must be ready. Every directory on the way is opened
        relative to its parent without following links, and the file is made
        with an exclusive no-follow create, so an existing entry (a brief from
        an earlier create, a link, anything) is never replaced or written
        through. Returns True when this call wrote the brief and False when an
        entry already existed. A partial write leaves the file in place: it is
        never removed, and a later create keeps it.
        """

        if not text:
            raise ValueError("empty_brief")
        if classify_project(self.snapshot(mansion)) is not ProjectStatus.READY:
            _fail("mansion_conflict")
        if not _DIR_FD_SUPPORTED:
            _fail("filesystem_error")

        data = (text + "\n").encode("utf-8")
        components = (mansion.name, ".kiro", "specs", mansion.project_spec)
        open_descriptors: list[int] = []
        try:
            parent = _open_directory(mansion.root, None)
            open_descriptors.append(parent)
            for component in components:
                parent = _open_directory(component, parent)
                open_descriptors.append(parent)
            try:
                descriptor = os.open(BRIEF_FILE_NAME, _BRIEF_FLAGS, 0o644, dir_fd=parent)
            except FileExistsError:
                return False
            try:
                view = memoryview(data)
                while view:
                    view = view[os.write(descriptor, view) :]
            finally:
                os.close(descriptor)
            return True
        except OSError:
            _fail("filesystem_error")
        finally:
            for descriptor in reversed(open_descriptors):
                try:
                    os.close(descriptor)
                except OSError:
                    pass
        return False  # unreachable: _fail raises

    def _display_path(self, target: Path) -> str:
        """Return a home-relative label without exposing an absolute path."""

        candidates = [Path.home(), *self._configured_approved_roots]
        for candidate in candidates:
            try:
                base = candidate.expanduser()
                if candidate != Path.home():
                    base = base.parent
                relative = target.relative_to(base)
            except (OSError, RuntimeError, ValueError):
                continue
            return f"~/{relative.as_posix()}"

        # Injected test roots may not be beneath the process home. The adapter
        # still returns a safe label rather than leaking the temporary path.
        return f"~/{target.name}"


def _expand_absolute_clean(path: Path) -> Path:
    if ".." in path.parts:
        _fail("unsafe_mansion_root")
    try:
        expanded = path.expanduser()
    except (OSError, RuntimeError):
        _fail("unsafe_mansion_root")
    if not expanded.is_absolute() or ".." in expanded.parts:
        _fail("unsafe_mansion_root")
    return expanded


def _expand_approved(path: Path) -> Path:
    """Expand an approved root without ever resolving a relative path."""

    if ".." in path.parts:
        return path
    try:
        expanded = path.expanduser()
    except (OSError, RuntimeError):
        return path
    return expanded if expanded.is_absolute() else path


def _collect_root_chain(path: Path) -> tuple[PathFact, ...]:
    if not path.is_absolute() or ".." in path.parts:
        _fail("unsafe_mansion_root")
    return tuple(_collect_path_fact(component) for component in _components(path))


def _components(path: Path) -> tuple[Path, ...]:
    anchor = Path(path.anchor)
    components = [anchor]
    current = anchor
    for part in path.parts[1:]:
        current /= part
        components.append(current)
    return tuple(components)


def _collect_path_fact(path: Path) -> PathFact:
    kind = _entry_kind(path)
    return PathFact(
        lexical=path,
        canonical=_canonical(path),
        kind=kind.value,
    )


def _collect_entry_fact(path: Path) -> EntryFact:
    return EntryFact(
        lexical=path,
        canonical=_canonical(path),
        kind=_entry_kind(path),
    )


def _entry_kind(path: Path) -> EntryKind:
    try:
        mode = path.lstat().st_mode
    except (FileNotFoundError, NotADirectoryError):
        return EntryKind.MISSING
    except OSError:
        _fail("filesystem_error")

    if stat.S_ISLNK(mode):
        return EntryKind.SYMLINK
    if stat.S_ISDIR(mode):
        return EntryKind.DIRECTORY
    if stat.S_ISREG(mode):
        return EntryKind.FILE
    return EntryKind.OTHER


def _canonical(path: Path) -> Path:
    try:
        return path.resolve(strict=False)
    except RuntimeError:
        # A symlink loop is already a conflicting symlink fact. Keeping its
        # lexical location lets policy reject it without exposing host details.
        return path
    except OSError:
        _fail("filesystem_error")


def _select_approved_root(
    approved_roots: tuple[PathFact, ...], root: PathFact
) -> PathFact | None:
    for approved in approved_roots:
        if approved.kind != "directory":
            continue
        lexical_match = approved.lexical == root.lexical or is_component_within(
            approved.lexical, root.lexical
        )
        canonical_match = (
            approved.canonical == root.canonical
            or is_component_within(approved.canonical, root.canonical)
        )
        if lexical_match and canonical_match:
            return approved
    return None


def _create_root_container(path: Path) -> None:
    try:
        path.mkdir()
    except FileExistsError:
        # Another local actor may have created the component after our lstat.
        # The immediate lstat below accepts only a real directory.
        pass
    except OSError:
        _fail("filesystem_error")

    if _entry_kind(path) is not EntryKind.DIRECTORY:
        _fail("unsafe_mansion_root")


def _as_path_fact(entry: EntryFact) -> PathFact:
    canonical = entry.canonical
    if canonical is None:
        canonical = entry.lexical
    return PathFact(
        lexical=entry.lexical,
        canonical=canonical,
        kind=entry.kind.value,
    )


def _collect_extra_entries(
    target: Path, required_descendants: frozenset[Path]
) -> tuple[EntryFact, ...]:
    if _entry_kind(target) is not EntryKind.DIRECTORY:
        return ()

    extras: list[EntryFact] = []
    pending = [target]
    while pending:
        directory = pending.pop()
        try:
            with os.scandir(directory) as entries:
                child_paths = sorted(
                    (directory / entry.name for entry in entries),
                    key=lambda path: path.name,
                    reverse=True,
                )
        except OSError:
            _fail("filesystem_error")

        for child in child_paths:
            fact = _collect_entry_fact(child)
            if child not in required_descendants:
                extras.append(fact)
            if fact.kind is EntryKind.DIRECTORY:
                pending.append(child)

    return tuple(sorted(extras, key=lambda fact: str(fact.lexical)))


@dataclass(frozen=True, slots=True)
class _CreatedDirectory:
    """Identity of one directory made by the current creation attempt."""

    parent_descriptor: int
    name: str
    device: int
    inode: int


_DIRECTORY_FLAGS = (
    os.O_RDONLY
    | getattr(os, "O_DIRECTORY", 0)
    | getattr(os, "O_NOFOLLOW", 0)
    | getattr(os, "O_CLOEXEC", 0)
)
_DIR_FD_SUPPORTED = (
    hasattr(os, "O_NOFOLLOW")
    and hasattr(os, "O_DIRECTORY")
    and {os.mkdir, os.open, os.rmdir, os.stat} <= os.supports_dir_fd
    and os.stat in os.supports_follow_symlinks
)


BRIEF_FILE_NAME = "brief.md"
_BRIEF_FLAGS = (
    os.O_WRONLY
    | os.O_CREAT
    | os.O_EXCL
    | getattr(os, "O_NOFOLLOW", 0)
    | getattr(os, "O_CLOEXEC", 0)
)


def _mkdir_at(name: str, parent_descriptor: int) -> None:
    """Exclusively create ``name`` inside an already opened directory."""

    os.mkdir(name, dir_fd=parent_descriptor)


def _open_directory(path: Path | str, parent_descriptor: int | None) -> int:
    """Open a real directory without following a link at its final name."""

    descriptor = os.open(path, _DIRECTORY_FLAGS, dir_fd=parent_descriptor)
    try:
        if not stat.S_ISDIR(os.fstat(descriptor).st_mode):
            raise NotADirectoryError
    except BaseException:
        os.close(descriptor)
        raise
    return descriptor


def _rmdir_at(name: str, parent_descriptor: int) -> None:
    """Remove one empty directory; the kernel refuses a non-empty one."""

    os.rmdir(name, dir_fd=parent_descriptor)


def _roll_back(created: list[_CreatedDirectory]) -> bool:
    """Remove this attempt's directories, deepest first.

    Returns whether the tree is back to its prior state. Removal stops at the
    first entry that is no longer the same empty directory, so a pre-existing
    entry, a replaced entry, or anything with contents is left in place.
    """

    for directory in reversed(created):
        try:
            current = os.stat(
                directory.name,
                dir_fd=directory.parent_descriptor,
                follow_symlinks=False,
            )
        except OSError:
            return False
        if (
            not stat.S_ISDIR(current.st_mode)
            or current.st_dev != directory.device
            or current.st_ino != directory.inode
        ):
            return False
        try:
            _rmdir_at(directory.name, directory.parent_descriptor)
        except OSError:
            return False
    return True


def _fail(code: FilesystemErrorCode) -> None:
    raise MansionFilesystemError(code) from None
