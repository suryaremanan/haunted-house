"""Path_Guard: descriptor-relative project file access inside one Mansion.

Every operation takes a Room_Policy and an untrusted relative path.  The
path is parsed and judged by the pure policy *before* any filesystem call, so
a denied request never reads, stats, or changes its target.  An allowed
request walks from the Mansion directory descriptor one component at a time
with no-follow opens: a symbolic link anywhere is refused, and because every
later call is relative to the descriptor already held, exchanging a parent
directory cannot redirect the operation.

Regular files with more than one hard link, devices, FIFOs, and sockets are
refused.  Writes replace atomically from a temporary file in the same
directory.  Deletion removes exactly one file or one empty directory; there
is no recursive operation.

``GuardedRoomAccess`` adds canonical evidence.  It never writes audit data
itself: denials and Spec_Document write preparation, completion, and recovery
are content-free domain candidates submitted through the Spec 2 writer port.
"""

from __future__ import annotations

import asyncio
import errno
import hashlib
import os
import secrets
import stat
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from haunted_house.adapters.guardrail_port import GuardrailPort, GuardrailRead
from haunted_house.core import guardrail_events as events_module
from haunted_house.core.guardrail_events import GuardrailPayloadError, Phase
from haunted_house.core.mansion_names import is_valid_mansion_name
from haunted_house.core.path_policy import (
    SPEC_DOCUMENT_BY_ROLE,
    Access,
    PathDecision,
    PathDecisionCode,
    PathError,
    PathEvidence,
    PathRule,
    RoomPolicy,
    authorize_access,
    join_parts,
    parse_relative_path,
    policy_allows,
    is_protected,
    room_policy,
    spec_document_parts,
)
from haunted_house.core.seance_event import AppEvent, AppEventCandidate, EventScope
from haunted_house.core.workflow import ArtifactRevision, PendingWrite, PhaseStatus

__all__ = [
    "ANY_CONTENT",
    "DEFAULT_MAX_FILE_BYTES",
    "DirectoryEntry",
    "FileDigest",
    "GuardedFilesystem",
    "GuardedFilesystemError",
    "GuardedRoomAccess",
    "RecoveryResult",
    "SpecWriteResult",
]

DEFAULT_MAX_FILE_BYTES = 4 * 1024 * 1024
_MAX_DIRECTORY_ENTRIES = 2000
_CLOEXEC = getattr(os, "O_CLOEXEC", 0)
_NOFOLLOW = getattr(os, "O_NOFOLLOW", 0)
_DIRECTORY_FLAGS = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | _NOFOLLOW | _CLOEXEC
_READ_FLAGS = os.O_RDONLY | _NOFOLLOW | getattr(os, "O_NONBLOCK", 0) | _CLOEXEC
_CREATE_FLAGS = os.O_WRONLY | os.O_CREAT | os.O_EXCL | _NOFOLLOW | _CLOEXEC
_TEMP_PREFIX = ".hh-write-"


class _AnyContent:
    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return "ANY_CONTENT"


ANY_CONTENT = _AnyContent()


@dataclass(frozen=True, slots=True)
class FileDigest:
    sha256: str
    size_bytes: int


@dataclass(frozen=True, slots=True)
class DirectoryEntry:
    name: str
    kind: Literal["file", "directory", "other"]


class GuardedFilesystemError(RuntimeError):
    """A safe failure code.  It never carries a host path or file content.

    ``denied`` is true when Path_Guard refused the request (a parse error or
    a policy or evidence decision) and false for an ordinary outcome such as
    ``not_found`` or ``stale_revision``.
    """

    def __init__(self, code: str, *, denied: bool = False) -> None:
        self.code = code
        self.denied = denied
        super().__init__(code)


def _denied(code: object) -> GuardedFilesystemError:
    return GuardedFilesystemError(str(getattr(code, "value", code)), denied=True)


@dataclass(frozen=True, slots=True)
class _Identity:
    kind: Literal["missing", "file", "directory", "other", "symlink"]
    device: int = 0
    inode: int = 0
    links: int = 0
    mode: int = 0
    size: int = 0
    # A recycled inode number (ext4 reuses one at once after an unlink)
    # still gets fresh change/modify times, so a swapped file never
    # matches on (device, inode) alone.
    ctime_ns: int = 0
    mtime_ns: int = 0


def _same_file(info: os.stat_result, identity: _Identity) -> bool:
    return (
        info.st_dev,
        info.st_ino,
        info.st_size,
        info.st_ctime_ns,
        info.st_mtime_ns,
    ) == (identity.device, identity.inode, identity.size, identity.ctime_ns, identity.mtime_ns)


def _identity(info: os.stat_result | None) -> _Identity:
    if info is None:
        return _Identity("missing")
    if stat.S_ISLNK(info.st_mode):
        kind: Literal["missing", "file", "directory", "other", "symlink"] = "symlink"
    elif stat.S_ISREG(info.st_mode):
        kind = "file"
    elif stat.S_ISDIR(info.st_mode):
        kind = "directory"
    else:
        kind = "other"
    return _Identity(
        kind,
        info.st_dev,
        info.st_ino,
        info.st_nlink,
        info.st_mode,
        info.st_size,
        info.st_ctime_ns,
        info.st_mtime_ns,
    )


def _lstat(name: str, parent: int) -> _Identity:
    try:
        return _identity(os.stat(name, dir_fd=parent, follow_symlinks=False))
    except FileNotFoundError:
        return _Identity("missing")


@dataclass(slots=True)
class _Target:
    parent: int
    name: str
    parts: tuple[str, ...]
    identity: _Identity


class GuardedFilesystem:
    """Synchronous guarded operations for one Mansion directory."""

    def __init__(
        self,
        mansion_root: Path,
        mansion_id: str,
        *,
        max_file_bytes: int = DEFAULT_MAX_FILE_BYTES,
    ) -> None:
        self._root = Path(mansion_root)
        self._mansion_id = mansion_id
        self._max_file_bytes = int(max_file_bytes)

    @property
    def mansion_id(self) -> str:
        return self._mansion_id

    # --- public operations -------------------------------------------------------

    def precheck(self, policy: RoomPolicy, raw_path: object, access: Access) -> tuple[str, ...]:
        """Parse and apply the pure policy.  Touches no file."""

        parts = parse_relative_path(raw_path)
        if isinstance(parts, PathError):
            raise _denied(parts.code)
        if is_protected(access, parts):
            raise _denied(PathDecisionCode.PROTECTED_PATH)
        if not policy_allows(policy, access, parts):
            raise _denied(PathDecisionCode.ROOM_POLICY)
        return parts

    def decide(
        self,
        policy: RoomPolicy,
        raw_path: object,
        access: Access,
        *,
        exact_approval: bool = False,
    ) -> tuple[PathDecision, str]:
        """Judge one access with collected evidence and perform no effect.

        Returns the Path_Guard decision and its safe code.  A parse failure
        has no ``PathDecisionCode``; it is reported as a ``room_policy``
        denial whose second element keeps the parse code.
        """

        try:
            with self._target(policy, raw_path, access, exact_approval=exact_approval):
                pass
        except GuardedFilesystemError as error:
            if not error.denied:
                if error.code == "not_found":
                    # A missing parent: the access itself was allowed.
                    return PathDecision(True, PathDecisionCode.OK), "ok"
                return PathDecision(False, PathDecisionCode.NOT_REGULAR), error.code
            try:
                code = PathDecisionCode(error.code)
            except ValueError:
                code = PathDecisionCode.ROOM_POLICY
            return PathDecision(False, code), error.code
        return PathDecision(True, PathDecisionCode.OK), "ok"

    def digest(self, policy: RoomPolicy, raw_path: object) -> FileDigest | None:
        """Digest of a readable regular file, or ``None`` when it is absent."""

        try:
            _data, digest = self.read_file(policy, raw_path)
        except GuardedFilesystemError as error:
            if error.code == "not_found":
                return None
            raise
        return digest

    def read_file(self, policy: RoomPolicy, raw_path: object) -> tuple[bytes, FileDigest]:
        with self._target(policy, raw_path, Access.READ) as target:
            if target.identity.kind == "missing":
                raise GuardedFilesystemError("not_found")
            if target.identity.kind != "file":
                raise GuardedFilesystemError("not_a_file")
            self._checkpoint("before_open")
            data = self._read_anchored(target)
        return data, FileDigest(hashlib.sha256(data).hexdigest(), len(data))

    def list_directory(
        self, policy: RoomPolicy, raw_path: object = None
    ) -> tuple[DirectoryEntry, ...]:
        """List one directory; ``None`` lists the Mansion root.

        Entries the room may not list (Protected_Paths included) are omitted.
        """

        if raw_path is None:
            parts: tuple[str, ...] = ()
            if not policy_allows(policy, Access.LIST, parts):
                raise _denied(PathDecisionCode.ROOM_POLICY)
        else:
            parts = self.precheck(policy, raw_path, Access.LIST)
        with self._mansion() as mansion:
            descriptor = os.dup(mansion)
            try:
                for part in parts:
                    identity = _lstat(part, descriptor)
                    if identity.kind == "symlink":
                        raise _denied(PathDecisionCode.SYMLINK)
                    if identity.kind == "missing":
                        raise GuardedFilesystemError("not_found")
                    if identity.kind != "directory":
                        raise GuardedFilesystemError("not_a_directory")
                    descriptor = self._descend(descriptor, part)
                entries: list[DirectoryEntry] = []
                with os.scandir(descriptor) as scan:
                    for entry in scan:
                        child = parse_relative_path(join_parts((*parts, entry.name)))
                        if isinstance(child, PathError) or not policy_allows(
                            policy, Access.LIST, child
                        ):
                            continue
                        if entry.is_symlink():
                            kind: Literal["file", "directory", "other"] = "other"
                        elif entry.is_dir(follow_symlinks=False):
                            kind = "directory"
                        elif entry.is_file(follow_symlinks=False):
                            kind = "file"
                        else:
                            kind = "other"
                        entries.append(DirectoryEntry(entry.name, kind))
                        if len(entries) > _MAX_DIRECTORY_ENTRIES:
                            raise GuardedFilesystemError("too_large")
            finally:
                os.close(descriptor)
        return tuple(sorted(entries, key=lambda item: item.name))

    def write_file(
        self,
        policy: RoomPolicy,
        raw_path: object,
        data: bytes,
        *,
        expected: FileDigest | None | _AnyContent = ANY_CONTENT,
        create_parents: bool = False,
    ) -> FileDigest:
        """Atomically create or replace one regular file.

        ``expected`` is the digest the current file must have (``None`` means
        it must not exist); a mismatch raises ``stale_revision`` and leaves
        the file untouched.
        """

        if type(data) is not bytes:
            raise GuardedFilesystemError("invalid_content")
        if len(data) > self._max_file_bytes:
            raise GuardedFilesystemError("too_large")
        with self._target(policy, raw_path, Access.WRITE, create_parents=create_parents) as target:
            if target.identity.kind == "directory":
                raise GuardedFilesystemError("not_a_file")
            if not isinstance(expected, _AnyContent):
                current: FileDigest | None = None
                if target.identity.kind == "file":
                    existing = self._read_anchored(target)
                    current = FileDigest(hashlib.sha256(existing).hexdigest(), len(existing))
                if current != expected:
                    raise GuardedFilesystemError("stale_revision")
            mode = stat.S_IMODE(target.identity.mode) if target.identity.kind == "file" else 0o644
            temporary = _TEMP_PREFIX + secrets.token_hex(8)
            try:
                self._write_temporary(target.parent, temporary, data, mode)
                self._checkpoint("before_replace")
                if _lstat(target.name, target.parent) != target.identity:
                    raise GuardedFilesystemError("changed")
                self._replace(target.parent, temporary, target.name)
            except BaseException:
                try:
                    os.unlink(temporary, dir_fd=target.parent)
                except OSError:
                    pass
                raise
            _fsync_directory(target.parent)
        return FileDigest(hashlib.sha256(data).hexdigest(), len(data))

    def delete_file(
        self, policy: RoomPolicy, raw_path: object, *, exact_approval: bool
    ) -> None:
        """Unlink exactly one regular file."""

        with self._target(
            policy, raw_path, Access.DELETE, exact_approval=exact_approval
        ) as target:
            if target.identity.kind == "missing":
                raise GuardedFilesystemError("not_found")
            if target.identity.kind != "file":
                raise GuardedFilesystemError("not_a_file")
            self._checkpoint("before_unlink")
            if _lstat(target.name, target.parent) != target.identity:
                raise GuardedFilesystemError("changed")
            os.unlink(target.name, dir_fd=target.parent)
            _fsync_directory(target.parent)

    def remove_empty_directory(
        self, policy: RoomPolicy, raw_path: object, *, exact_approval: bool
    ) -> None:
        """Remove exactly one empty directory; never recursive."""

        with self._target(
            policy, raw_path, Access.DELETE, exact_approval=exact_approval
        ) as target:
            if target.identity.kind == "missing":
                raise GuardedFilesystemError("not_found")
            if target.identity.kind != "directory":
                raise GuardedFilesystemError("not_a_directory")
            self._checkpoint("before_unlink")
            try:
                os.rmdir(target.name, dir_fd=target.parent)
            except OSError as error:
                if error.errno in (errno.ENOTEMPTY, errno.EEXIST):
                    raise GuardedFilesystemError("directory_not_empty") from None
                if error.errno == errno.ENOTDIR:
                    raise GuardedFilesystemError("changed") from None
                raise GuardedFilesystemError("filesystem_error") from None
            _fsync_directory(target.parent)

    # --- seams ---------------------------------------------------------------------

    def _checkpoint(self, stage: str) -> None:
        """Test seam: called between evidence collection and each effect."""

    def _write_temporary(self, parent: int, name: str, data: bytes, mode: int) -> None:
        descriptor = os.open(name, _CREATE_FLAGS, mode, dir_fd=parent)
        try:
            view = memoryview(data)
            while view:
                written = os.write(descriptor, view)
                if written <= 0:
                    raise OSError(errno.EIO, "short_write")
                view = view[written:]
            os.fsync(descriptor)
        finally:
            os.close(descriptor)

    def _replace(self, parent: int, temporary: str, name: str) -> None:
        os.rename(temporary, name, src_dir_fd=parent, dst_dir_fd=parent)

    # --- traversal -----------------------------------------------------------------

    @contextmanager
    def _mansion(self) -> Iterator[int]:
        root = self._root
        if (
            not is_valid_mansion_name(self._mansion_id)
            or not root.is_absolute()
            or ".." in root.parts
        ):
            raise GuardedFilesystemError("unsafe_mansion_root")
        root_fd = mansion_fd = -1
        try:
            try:
                current = Path(root.anchor)
                for component in root.parts[1:]:
                    current /= component
                    info = current.lstat()
                    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
                        raise GuardedFilesystemError("unsafe_mansion_root")
                root_fd = os.open(root, _DIRECTORY_FLAGS)
            except OSError:
                raise GuardedFilesystemError("unsafe_mansion_root") from None
            try:
                mansion_fd = os.open(self._mansion_id, _DIRECTORY_FLAGS, dir_fd=root_fd)
            except FileNotFoundError:
                raise GuardedFilesystemError("mansion_not_found") from None
            except OSError:
                raise GuardedFilesystemError("unsafe_mansion_root") from None
            yield mansion_fd
        finally:
            for descriptor in (mansion_fd, root_fd):
                if descriptor >= 0:
                    os.close(descriptor)

    def _descend(self, descriptor: int, name: str) -> int:
        """Open the no-follow child directory and release ``descriptor``.

        On failure ``descriptor`` stays open and owned by the caller, so it
        is closed exactly once.
        """

        try:
            child = os.open(name, _DIRECTORY_FLAGS, dir_fd=descriptor)
        except OSError as error:
            if error.errno in (errno.ELOOP, errno.ENOTDIR):
                raise _denied(PathDecisionCode.SYMLINK) from None
            if error.errno == errno.ENOENT:
                raise GuardedFilesystemError("not_found") from None
            raise GuardedFilesystemError("filesystem_error") from None
        os.close(descriptor)
        return child

    def _canonically_inside(self, parts: tuple[str, ...]) -> bool:
        try:
            mansion = os.path.realpath(self._root / self._mansion_id)
            target = os.path.realpath(os.path.join(mansion, *parts))
        except (OSError, ValueError):
            return False
        return target == mansion or target.startswith(mansion + os.sep)

    @contextmanager
    def _target(
        self,
        policy: RoomPolicy,
        raw_path: object,
        access: Access,
        *,
        exact_approval: bool = False,
        create_parents: bool = False,
    ) -> Iterator[_Target]:
        parts = self.precheck(policy, raw_path, access)
        with self._mansion() as mansion:
            descriptor = os.dup(mansion)
            try:
                symlink = False
                missing_parent = False
                for part in parts[:-1]:
                    identity = _lstat(part, descriptor)
                    if identity.kind == "symlink":
                        symlink = True
                        break
                    if identity.kind == "missing":
                        if not create_parents:
                            missing_parent = True
                            break
                        try:
                            os.mkdir(part, mode=0o755, dir_fd=descriptor)
                        except FileExistsError:
                            pass
                    elif identity.kind != "directory":
                        raise GuardedFilesystemError("not_a_directory")
                    descriptor = self._descend(descriptor, part)

                if symlink:
                    final = _Identity("symlink")
                elif missing_parent:
                    final = _Identity("missing")
                else:
                    final = _lstat(parts[-1], descriptor)
                evidence = PathEvidence(
                    parts=parts,
                    inside_mansion=final.kind == "symlink" or self._canonically_inside(parts),
                    symlink_component=final.kind == "symlink",
                    kind="missing" if final.kind == "symlink" else final.kind,  # type: ignore[arg-type]
                    link_count=final.links if final.kind == "file" else 1,
                )
                decision = authorize_access(
                    evidence, policy, access, exact_approval=exact_approval
                )
                if not decision.allowed:
                    raise _denied(decision.code)
                if missing_parent:
                    raise GuardedFilesystemError("not_found")
                yield _Target(descriptor, parts[-1], parts, final)
            except GuardedFilesystemError:
                raise
            except OSError:
                raise GuardedFilesystemError("filesystem_error") from None
            finally:
                os.close(descriptor)

    def _read_anchored(self, target: _Target) -> bytes:
        """Read the exact file the evidence described, or refuse."""

        try:
            descriptor = os.open(target.name, _READ_FLAGS, dir_fd=target.parent)
        except OSError as error:
            if error.errno == errno.ELOOP:
                raise _denied(PathDecisionCode.SYMLINK) from None
            if error.errno == errno.ENOENT:
                raise GuardedFilesystemError("changed") from None
            raise GuardedFilesystemError("filesystem_error") from None
        try:
            info = os.fstat(descriptor)
            if not stat.S_ISREG(info.st_mode):
                raise _denied(PathDecisionCode.NOT_REGULAR)
            if info.st_nlink != 1:
                raise _denied(PathDecisionCode.HARD_LINK)
            if not _same_file(info, target.identity):
                raise GuardedFilesystemError("changed")
            if info.st_size > self._max_file_bytes:
                raise GuardedFilesystemError("too_large")
            chunks: list[bytes] = []
            remaining = self._max_file_bytes + 1
            while remaining > 0:
                chunk = os.read(descriptor, min(remaining, 1 << 20))
                if not chunk:
                    break
                chunks.append(chunk)
                remaining -= len(chunk)
            data = b"".join(chunks)
            if len(data) > self._max_file_bytes:
                raise GuardedFilesystemError("too_large")
            return data
        finally:
            os.close(descriptor)


def _fsync_directory(descriptor: int) -> None:
    try:
        os.fsync(descriptor)
    except OSError:
        # Durability of the directory entry is best effort on filesystems
        # that do not support directory fsync; the content was synced.
        pass


# --- canonical evidence ---------------------------------------------------------


@dataclass(frozen=True, slots=True)
class SpecWriteResult:
    """Outcome of one Spec_Document write attempt.

    ``written``: replaced and acknowledged.  ``conflict``: nothing replaced.
    ``denied``: Path_Guard refused; evidence recorded.  ``blocked``: writer or
    integrity unavailable, nothing attempted.  ``uncertain``: recovery must
    inspect the file before another Door proposal.
    """

    status: Literal["written", "conflict", "denied", "blocked", "uncertain"]
    code: str
    artifact_revision: ArtifactRevision | None = None
    events: tuple[AppEvent, ...] = ()


@dataclass(frozen=True, slots=True)
class RecoveryResult:
    write_id: str
    outcome: Literal["completed", "not_applied", "uncertain", "unrecorded"]


_PHASE_BY_DOCUMENT = {
    "requirements.md": Phase.REQUIREMENTS,
    "design.md": Phase.DESIGN,
    "tasks.md": Phase.TASKS,
}


class GuardedRoomAccess:
    """Guarded file access that records its evidence through the writer port."""

    def __init__(
        self,
        filesystem: GuardedFilesystem,
        port: GuardrailPort,
        *,
        id_factory: Callable[[], str] | None = None,
    ) -> None:
        self._filesystem = filesystem
        self._port = port
        self._new_id = id_factory or (lambda: secrets.token_hex(16))

    # --- plain room files ----------------------------------------------------------

    async def read_file(
        self, scope: EventScope, policy: RoomPolicy, raw_path: object
    ) -> tuple[bytes, FileDigest]:
        return await self._guarded(
            scope, policy, raw_path, Access.READ, self._filesystem.read_file, policy, raw_path
        )

    async def list_directory(
        self, scope: EventScope, policy: RoomPolicy, raw_path: object = None
    ) -> tuple[DirectoryEntry, ...]:
        return await self._guarded(
            scope, policy, raw_path, Access.LIST, self._filesystem.list_directory, policy, raw_path
        )

    async def write_file(
        self,
        scope: EventScope,
        policy: RoomPolicy,
        raw_path: object,
        data: bytes,
        *,
        expected: FileDigest | None | _AnyContent = ANY_CONTENT,
    ) -> FileDigest:
        await self._require_writable(scope)
        return await self._guarded(
            scope,
            policy,
            raw_path,
            Access.WRITE,
            lambda: self._filesystem.write_file(
                policy, raw_path, data, expected=expected, create_parents=True
            ),
        )

    async def delete_file(
        self, scope: EventScope, policy: RoomPolicy, raw_path: object, *, exact_approval: bool
    ) -> None:
        await self._require_writable(scope)
        await self._guarded(
            scope,
            policy,
            raw_path,
            Access.DELETE,
            lambda: self._filesystem.delete_file(policy, raw_path, exact_approval=exact_approval),
        )

    async def remove_empty_directory(
        self, scope: EventScope, policy: RoomPolicy, raw_path: object, *, exact_approval: bool
    ) -> None:
        await self._require_writable(scope)
        await self._guarded(
            scope,
            policy,
            raw_path,
            Access.DELETE,
            lambda: self._filesystem.remove_empty_directory(
                policy, raw_path, exact_approval=exact_approval
            ),
        )

    async def _require_writable(self, scope: EventScope) -> GuardrailRead:
        read = await self._port.read(scope.mansion_id)
        if not read.writable:
            # No writer or no canonical integrity: refuse before any effect.
            raise GuardedFilesystemError("integrity_unavailable")
        return read

    async def _guarded(self, scope, policy, raw_path, access, operation, *arguments):
        try:
            return await asyncio.to_thread(operation, *arguments)
        except GuardedFilesystemError as error:
            if error.denied:
                await self._record_denial(scope, policy, access, error.code, raw_path)
            raise

    async def _record_denial(
        self, scope: EventScope, policy: RoomPolicy, access: Access, code: str, raw_path: object
    ) -> AppEvent | None:
        try:
            candidate = events_module.path_denied(
                scope,
                denial_id=self._new_id(),
                session_slot=scope.session_slot,
                room=policy.room,
                access=access,
                code=code,
                raw_path=raw_path,
            )
        except GuardrailPayloadError:
            return None
        acknowledgement = await self._port.append(scope.mansion_id, [candidate])
        return acknowledgement.events[0] if acknowledgement.ok else None

    # --- Spec_Document writes --------------------------------------------------------

    async def write_spec_document(
        self,
        scope: EventScope,
        *,
        role: str,
        spec_name: str,
        phase: Phase,
        data: bytes,
        expected_revision: int,
        write_id: str | None = None,
    ) -> SpecWriteResult:
        """Replace one Spec_Document with prepare, replace, complete evidence."""

        policy = room_policy(role, spec_name)
        document = f"{getattr(phase, 'value', phase)}.md"
        if policy is None or document not in _PHASE_BY_DOCUMENT or type(data) is not bytes:
            return SpecWriteResult("blocked", "invalid_request")
        phase = _PHASE_BY_DOCUMENT[document]
        path = join_parts(spec_document_parts(spec_name, document))
        write_id = write_id or self._new_id()

        read = await self._port.read(scope.mansion_id)
        if not read.writable:
            return SpecWriteResult("blocked", "integrity_unavailable")
        projection = read.projection

        # Policy first: a denial is recorded and the target is never touched.
        try:
            self._filesystem.precheck(policy, path, Access.WRITE)
        except GuardedFilesystemError as error:
            event = await self._record_denial(scope, policy, Access.WRITE, error.code, path)
            return SpecWriteResult("denied", error.code, events=(event,) if event else ())

        view = projection.phases[phase]
        if view.status not in (PhaseStatus.WORKING, PhaseStatus.WAITING):
            return SpecWriteResult("conflict", "invalid_state")
        if any(write.document_path == path for write in projection.pending_writes.values()):
            return SpecWriteResult("conflict", "write_pending")
        known = projection.documents.get(path)
        base_revision = known.revision if known is not None else 0
        if type(expected_revision) is not int or expected_revision != base_revision:
            return SpecWriteResult("conflict", "stale_revision", artifact_revision=known)

        try:
            current = await asyncio.to_thread(self._filesystem.digest, policy, path)
        except GuardedFilesystemError as error:
            if not error.denied:
                return SpecWriteResult("conflict", error.code)
            event = await self._record_denial(scope, policy, Access.WRITE, error.code, path)
            return SpecWriteResult("denied", error.code, events=(event,) if event else ())
        if known is not None and (current is None or current.sha256 != known.sha256):
            return SpecWriteResult("conflict", "artifact_mismatch", artifact_revision=known)

        artifact = ArtifactRevision(
            base_revision + 1, hashlib.sha256(data).hexdigest(), len(data)
        )
        try:
            prepared = events_module.spec_write_prepared(
                scope,
                write_id=write_id,
                phase=phase,
                document_path=path,
                base_revision=base_revision,
                base_sha256=current.sha256 if current is not None else None,
                revision=artifact.revision,
                sha256=artifact.sha256,
                size_bytes=artifact.size_bytes,
            )
        except GuardrailPayloadError:
            return SpecWriteResult("blocked", "invalid_request")
        acknowledged = await self._port.compare_and_append(
            scope.mansion_id, projection.version, [prepared]
        )
        if not acknowledged.ok:
            status = "conflict" if acknowledged.status == "conflict" else "blocked"
            return SpecWriteResult(status, "stale_version" if status == "conflict" else "writer_unavailable")
        events = list(acknowledged.events)

        try:
            await asyncio.to_thread(
                self._filesystem.write_file, policy, path, data, expected=current
            )
        except BaseException as failure:  # noqa: BLE001 - settle the prepared record
            code = failure.code if isinstance(failure, GuardedFilesystemError) else "filesystem_error"
            settled = await self._settle(
                scope, _pending(write_id, phase, path, base_revision, current, artifact), policy
            )
            if not isinstance(failure, Exception):
                raise
            if settled.outcome == "not_applied":
                return SpecWriteResult("conflict", code, events=tuple(events))
            if settled.outcome == "completed":
                return SpecWriteResult("written", "ok", artifact, tuple(events))
            return SpecWriteResult("uncertain", code, events=tuple(events))

        completion = self._completion(scope, projection, write_id, phase, path, artifact)
        completed = await self._port.append(scope.mansion_id, completion)
        if not completed.ok:
            # The file is replaced but not acknowledged: recovery will settle it.
            return SpecWriteResult("uncertain", "completion_unacknowledged", artifact, tuple(events))
        return SpecWriteResult("written", "ok", artifact, tuple(events) + completed.events)

    def _completion(self, scope, projection, write_id, phase, path, artifact) -> list[AppEventCandidate]:
        batch = [
            events_module.spec_document_written(
                scope,
                write_id=write_id,
                phase=phase,
                document_path=path,
                revision=artifact.revision,
                sha256=artifact.sha256,
                size_bytes=artifact.size_bytes,
            )
        ]
        proposal = projection.phases[phase].proposal
        if (
            proposal is not None
            and proposal.status == "pending"
            and proposal.document_path == path
        ):
            # The document changed after the proposal: it can no longer be
            # approved, and a proposal for the new revision is required.
            batch.append(
                events_module.door_superseded(
                    scope,
                    phase=phase,
                    proposal_id=proposal.proposal_id,
                    revision=proposal.artifact_revision.revision,
                    sha256=proposal.artifact_revision.sha256,
                    code="document_changed",
                )
            )
        return batch

    async def recover_spec_writes(self, scope: EventScope) -> tuple[RecoveryResult, ...]:
        """Settle every prepared write by guarded digest inspection."""

        read = await self._port.read(scope.mansion_id)
        if not read.writable:
            raise GuardedFilesystemError("integrity_unavailable")
        results = []
        for write_id in sorted(read.projection.pending_writes):
            results.append(await self._settle(scope, read.projection.pending_writes[write_id], None))
        return tuple(results)

    async def _settle(
        self, scope: EventScope, pending: PendingWrite, policy: RoomPolicy | None
    ) -> RecoveryResult:
        parts = parse_relative_path(pending.document_path)
        if isinstance(parts, PathError):
            return RecoveryResult(pending.write_id, "unrecorded")
        # Recovery reads exactly the one document and nothing else.
        reader = RoomPolicy(
            room="house",
            allow=(PathRule(parts, frozenset({Access.READ})),),
            deny=(),
        )
        outcome: Literal["completed", "not_applied", "uncertain"]
        code = "digest_mismatch"
        try:
            found = await asyncio.to_thread(self._filesystem.digest, reader, pending.document_path)
        except GuardedFilesystemError as error:
            outcome, code = "uncertain", error.code
        else:
            sha = found.sha256 if found is not None else None
            if sha == pending.artifact_revision.sha256:
                outcome = "completed"
            elif sha == pending.base_sha256:
                outcome = "not_applied"
            else:
                outcome = "uncertain"

        if outcome == "uncertain":
            candidates = [
                events_module.spec_write_uncertain(
                    scope,
                    write_id=pending.write_id,
                    phase=pending.phase,
                    document_path=pending.document_path,
                    code=code,
                )
            ]
        else:
            candidates = [
                events_module.spec_write_recovered(
                    scope,
                    write_id=pending.write_id,
                    phase=pending.phase,
                    document_path=pending.document_path,
                    outcome=outcome,
                )
            ]
            if outcome == "completed":
                projection = (await self._port.read(scope.mansion_id)).projection
                candidates.extend(
                    self._completion(
                        scope, projection, pending.write_id, pending.phase,
                        pending.document_path, pending.artifact_revision,
                    )[1:]
                )
        acknowledged = await self._port.append(scope.mansion_id, candidates)
        return RecoveryResult(pending.write_id, outcome if acknowledged.ok else "unrecorded")


def _pending(write_id, phase, path, base_revision, current, artifact) -> PendingWrite:
    return PendingWrite(
        write_id=write_id,
        phase=phase,
        document_path=path,
        base_revision=base_revision,
        base_sha256=current.sha256 if current is not None else None,
        artifact_revision=artifact,
    )


# ``SPEC_DOCUMENT_BY_ROLE`` documents which role owns which document; the
# room policy built from it is what actually confines a write.
assert set(SPEC_DOCUMENT_BY_ROLE.values()) == set(_PHASE_BY_DOCUMENT)
