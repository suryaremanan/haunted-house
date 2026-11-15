"""Filesystem adapter and sole opener for the canonical séance Event_Log.

Every operation derives a validated Mansion name below one configured root.
A Mansion must already exist.  Append operations may create only its private
``.haunted-house/seance`` directories and canonical log.  Directory-relative,
no-follow opens keep symlink swaps outside the authority boundary.

The canonical log file itself carries the inter-process advisory lock, so the
adapter creates no second ledger or lock file.  Appends use ``O_APPEND`` and
are acknowledged only after flush and ``fsync``.  Acknowledged bytes are never
rewritten, truncated, repaired, deleted, or renumbered; the only bytes ever
removed are the unacknowledged tail of an append that failed before its
acknowledgement, dropped under the same lock.
"""

from __future__ import annotations

import asyncio
import errno
import fcntl
import os
import stat
import time
from collections.abc import Callable, Iterable, Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

from haunted_house.core.mansion_names import is_valid_mansion_name
from haunted_house.core.seance_event import (
    AppEvent,
    EventValidationException,
)
from haunted_house.core.seance_log_parser import parse_event_log
from haunted_house.core.seance_persistence import (
    GENESIS_HASH,
    MAX_READ_LIMIT,
    AppendResult,
    CanonicalReadResult,
    PreparedCandidate,
    WriterDiagnostic,
    WriterDiagnosticCode,
    WriterStatus,
    build_app_event,
    prepare_candidates,
    serialize_app_event,
)

__all__ = ["SeanceLogStore"]

_LOG_NAME = "events.v1.jsonl"
_HOUSE_DIRECTORY = ".haunted-house"
_SEANCE_DIRECTORY = "seance"
_DIRECTORY_FLAGS = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0)
_FILE_NOFOLLOW = getattr(os, "O_NOFOLLOW", 0)
_CREATE_ATTEMPTS = 8


@dataclass(frozen=True, slots=True)
class _ScannedLog:
    events: tuple[AppEvent, ...]
    by_record_id: dict[str, AppEvent]
    record_id_by_event_id: dict[str, str]
    integrity_linked: bool | None
    last_hash: str | None
    diagnostics: tuple[WriterDiagnostic, ...]
    valid_prefix_lines: int
    valid_prefix_sequence: int

    @property
    def highest_sequence(self) -> int:
        return self.events[-1].sequence if self.events else 0


class _StoreOpenError(Exception):
    def __init__(self, status: WriterStatus) -> None:
        self.status = status
        super().__init__(status)


class SeanceLogStore:
    """Durable implementation of the ``CanonicalEventWriter`` interface.

    ``mansion_root`` is server configuration, never request data.  The clock
    is injected for deterministic tests and returns non-negative Unix
    milliseconds.  Existing logs retain the linked or unlinked integrity mode
    selected by their first record; ``hash_linking`` applies only to a new log.
    """

    def __init__(
        self,
        mansion_root: Path,
        *,
        known_secrets: Iterable[str | None] = (),
        forbidden_document_bodies: Iterable[str] = (),
        hash_linking: bool = True,
        clock_ms: Callable[[], int] | None = None,
    ) -> None:
        self._mansion_root = Path(mansion_root).expanduser()
        self._known_secrets = tuple(known_secrets)
        self._forbidden_document_bodies = tuple(forbidden_document_bodies)
        self._hash_linking = bool(hash_linking)
        self._clock_ms = clock_ms or (lambda: int(time.time() * 1000))

    async def append_candidates(
        self, mansion_id: str, candidates: Sequence[object]
    ) -> AppendResult:
        """Prepare a complete batch, then append or acknowledge each item."""

        return await self._append(mansion_id, candidates, expected_sequence=None)

    async def compare_and_append(
        self,
        mansion_id: str,
        expected_sequence: int,
        candidates: Sequence[object],
    ) -> AppendResult:
        """Append only if ``expected_sequence`` is current under the lock."""

        if type(expected_sequence) is not int or expected_sequence < 0:
            return AppendResult(
                diagnostics=(_diagnostic("invalid_expected_sequence"),),
                status="invalid",
            )
        return await self._append(
            mansion_id, candidates, expected_sequence=expected_sequence
        )

    async def read_after(
        self, mansion_id: str, after_sequence: int, limit: int
    ) -> CanonicalReadResult:
        """Read one page from the authoritative valid physical prefix."""

        if type(after_sequence) is not int or after_sequence < 0:
            return CanonicalReadResult(
                diagnostics=(_diagnostic("invalid_after_sequence"),),
                status="invalid",
            )
        if type(limit) is not int or not 1 <= limit <= MAX_READ_LIMIT:
            return CanonicalReadResult(
                diagnostics=(_diagnostic("invalid_limit"),),
                status="invalid",
            )
        if not _valid_mansion_id(mansion_id):
            return CanonicalReadResult(
                diagnostics=(_diagnostic("invalid_mansion_id"),),
                status="invalid",
            )
        return await asyncio.to_thread(
            self._read_sync, mansion_id, after_sequence, limit
        )

    async def _append(
        self,
        mansion_id: str,
        candidates: Sequence[object],
        *,
        expected_sequence: int | None,
    ) -> AppendResult:
        if not _valid_mansion_id(mansion_id):
            return AppendResult(
                diagnostics=(_diagnostic("invalid_mansion_id"),),
                status="invalid",
            )

        prepared = prepare_candidates(
            candidates,
            self._known_secrets,
            forbidden_document_bodies=self._forbidden_document_bodies,
        )
        if not prepared.ok:
            return AppendResult(
                diagnostics=prepared.diagnostics,
                status="invalid",
            )

        for index, item in enumerate(prepared.candidates):
            if item.candidate.scope.mansion_id != mansion_id:
                return AppendResult(
                    diagnostics=(
                        WriterDiagnostic(
                            code=WriterDiagnosticCode.INVALID_CANDIDATE,
                            safe_detail="mansion_scope_mismatch",
                            candidate_index=index,
                            path="scope.mansion_id",
                        ),
                    ),
                    status="invalid",
                )

        return await asyncio.to_thread(
            self._append_sync,
            mansion_id,
            prepared.candidates,
            expected_sequence,
        )

    def _append_sync(
        self,
        mansion_id: str,
        prepared: tuple[PreparedCandidate, ...],
        expected_sequence: int | None,
    ) -> AppendResult:
        # Only an append that can succeed against an absent log may create
        # it: a comparison expecting records needs an existing log.
        may_create = expected_sequence is None or expected_sequence == 0
        try:
            with self._locked_log(
                mansion_id, create=may_create, exclusive=True
            ) as handle:
                scanned = _scan_log(handle)
                if scanned.diagnostics:
                    return _append_from_scan(scanned, status="invalid_log")

                if (
                    expected_sequence is not None
                    and expected_sequence != scanned.highest_sequence
                ):
                    return AppendResult(
                        highest_sequence=scanned.highest_sequence,
                        diagnostics=(_diagnostic("stale_sequence"),),
                        status="conflict",
                    )

                return self._append_prepared(handle, scanned, prepared)
        except _StoreOpenError as error:
            if error.status == "log_not_found" and not may_create:
                # The Mansion exists and has no log, so its highest Sequence
                # is zero and the non-zero expectation is stale.
                return AppendResult(
                    highest_sequence=0,
                    diagnostics=(_diagnostic("stale_sequence"),),
                    status="conflict",
                )
            return AppendResult(
                diagnostics=(_diagnostic(error.status),),
                status=error.status,
            )
        except (OSError, ValueError, EventValidationException):
            return AppendResult(
                diagnostics=(_diagnostic("append_failed"),),
                status="failed",
            )

    def _append_prepared(
        self,
        handle: BinaryIO,
        scanned: _ScannedLog,
        prepared: tuple[PreparedCandidate, ...],
    ) -> AppendResult:
        by_record_id = dict(scanned.by_record_id)
        record_id_by_event_id = dict(scanned.record_id_by_event_id)
        acknowledgements: list[AppEvent] = []
        duplicates: list[str] = []
        diagnostics: list[WriterDiagnostic] = []
        lines: list[bytes] = []

        linked = (
            scanned.integrity_linked
            if scanned.integrity_linked is not None
            else self._hash_linking
        )
        previous_hash = scanned.last_hash if scanned.events else GENESIS_HASH
        next_sequence = scanned.highest_sequence + 1

        for item in prepared:
            existing = by_record_id.get(item.record_id)
            if existing is not None:
                acknowledgements.append(existing)
                duplicates.append(item.record_id)
                continue

            prior_variant = record_id_by_event_id.get(item.event_id)
            if prior_variant is not None and prior_variant != item.record_id:
                diagnostics.append(
                    WriterDiagnostic(
                        code=WriterDiagnosticCode.CONFLICTING_VARIANT,
                        safe_detail="event_id_has_multiple_records",
                    )
                )

            persisted_at_ms = self._clock_ms()
            if type(persisted_at_ms) is not int or persisted_at_ms < 0:
                raise ValueError("invalid_clock")
            event = build_app_event(
                item,
                sequence=next_sequence,
                persisted_at_ms=persisted_at_ms,
                prev_hash=previous_hash if linked else None,
            )
            lines.append(serialize_app_event(event))
            acknowledgements.append(event)
            by_record_id[event.record_id] = event
            record_id_by_event_id.setdefault(event.event_id, event.record_id)
            if linked:
                previous_hash = event.hash
            next_sequence += 1

        if lines:
            committed_size = handle.seek(0, os.SEEK_END)
            try:
                # Unbuffered writes: no pending bytes can outlive a failure
                # and reappear after the rollback below.
                _write_all(handle.fileno(), b"".join(lines))
                os.fsync(handle.fileno())
            except BaseException:
                # Nothing in this batch was acknowledged.  Drop the
                # unacknowledged tail under the same lock so a failed append
                # cannot become an authoritative record or a torn line.
                # Acknowledged bytes end at ``committed_size`` and are kept.
                _discard_unacknowledged_tail(handle, committed_size)
                raise

        return AppendResult(
            events=tuple(acknowledgements),
            duplicate_record_ids=tuple(duplicates),
            highest_sequence=next_sequence - 1,
            diagnostics=tuple(diagnostics),
            status="ok",
        )

    def _read_sync(
        self, mansion_id: str, after_sequence: int, limit: int
    ) -> CanonicalReadResult:
        try:
            with self._locked_log(
                mansion_id, create=False, exclusive=False
            ) as handle:
                scanned = _scan_log(handle)
        except _StoreOpenError as error:
            return CanonicalReadResult(
                diagnostics=(_diagnostic(error.status),),
                status=error.status,
            )
        except (OSError, ValueError, EventValidationException):
            return CanonicalReadResult(
                diagnostics=(_diagnostic("read_failed"),),
                status="failed",
            )

        page = tuple(
            event
            for event in scanned.events
            if event.sequence > after_sequence
        )[:limit]
        status: WriterStatus = "invalid_log" if scanned.diagnostics else "ok"
        return CanonicalReadResult(
            events=page,
            highest_sequence=scanned.highest_sequence,
            valid_prefix_sequence=scanned.valid_prefix_sequence,
            valid_prefix_lines=scanned.valid_prefix_lines,
            diagnostics=scanned.diagnostics,
            status=status,
        )

    @contextmanager
    def _locked_log(
        self,
        mansion_id: str,
        *,
        create: bool,
        exclusive: bool,
    ) -> Iterator[BinaryIO]:
        """Open the confined canonical file and hold its process lock."""

        root_fd = mansion_fd = house_fd = seance_fd = log_fd = -1
        handle: BinaryIO | None = None
        try:
            root = self._resolved_root()
            root_fd = _open_directory_path(root)
            mansion_fd = _open_mansion(root_fd, root, mansion_id)
            house_fd = _open_child_directory(
                mansion_fd, _HOUSE_DIRECTORY, create=create
            )
            seance_fd = _open_child_directory(
                house_fd, _SEANCE_DIRECTORY, create=create
            )
            log_fd = _open_log_file(seance_fd, create=create, writable=exclusive)
            fcntl.flock(
                log_fd, fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH
            )
            handle = os.fdopen(log_fd, "r+b" if exclusive else "rb")
            log_fd = -1
            yield handle
        finally:
            if handle is not None:
                try:
                    fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
                finally:
                    handle.close()
            elif log_fd >= 0:
                os.close(log_fd)
            for descriptor in (seance_fd, house_fd, mansion_fd, root_fd):
                if descriptor >= 0:
                    os.close(descriptor)

    def _resolved_root(self) -> Path:
        root = self._mansion_root
        if not root.is_absolute() or ".." in root.parts:
            raise _StoreOpenError("unsafe_path")
        try:
            current = Path(root.anchor)
            for component in root.parts[1:]:
                current /= component
                info = current.lstat()
                if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
                    raise _StoreOpenError("unsafe_path")
            canonical = root.resolve(strict=True)
        except FileNotFoundError:
            raise _StoreOpenError("unsafe_path") from None
        except OSError:
            raise _StoreOpenError("unsafe_path") from None
        return canonical


def _scan_log(handle: BinaryIO) -> _ScannedLog:
    """Read the physical lines and let the pure Canonical_Parser judge them."""

    handle.seek(0)
    parsed = parse_event_log(iter(handle))
    by_record_id: dict[str, AppEvent] = {}
    record_id_by_event_id: dict[str, str] = {}
    for event in parsed.events:
        by_record_id[event.record_id] = event
        record_id_by_event_id.setdefault(event.event_id, event.record_id)
    return _ScannedLog(
        events=parsed.events,
        by_record_id=by_record_id,
        record_id_by_event_id=record_id_by_event_id,
        integrity_linked=parsed.integrity_linked,
        last_hash=parsed.last_hash,
        diagnostics=parsed.diagnostics,
        valid_prefix_lines=parsed.valid_prefix_lines,
        valid_prefix_sequence=parsed.valid_prefix_sequence,
    )


def _write_all(descriptor: int, data: bytes) -> None:
    view = memoryview(data)
    while view:
        written = os.write(descriptor, view)
        if written <= 0:
            raise OSError(errno.EIO, "short_write")
        view = view[written:]


def _discard_unacknowledged_tail(handle: BinaryIO, committed_size: int) -> None:
    try:
        os.ftruncate(handle.fileno(), committed_size)
    except OSError:
        # The later scan reports any residue; it is never acknowledged here.
        pass


def _append_from_scan(scanned: _ScannedLog, *, status: WriterStatus) -> AppendResult:
    return AppendResult(
        highest_sequence=scanned.highest_sequence,
        diagnostics=scanned.diagnostics,
        status=status,
    )


def _valid_mansion_id(value: object) -> bool:
    return type(value) is str and is_valid_mansion_name(value)


def _open_directory_path(path: Path) -> int:
    try:
        descriptor = os.open(path, _DIRECTORY_FLAGS)
    except OSError:
        raise _StoreOpenError("unsafe_path") from None
    if not stat.S_ISDIR(os.fstat(descriptor).st_mode):
        os.close(descriptor)
        raise _StoreOpenError("unsafe_path")
    return descriptor


def _open_mansion(root_fd: int, root: Path, mansion_id: str) -> int:
    try:
        info = os.stat(mansion_id, dir_fd=root_fd, follow_symlinks=False)
    except FileNotFoundError:
        raise _StoreOpenError("mansion_not_found") from None
    except OSError:
        raise _StoreOpenError("unsafe_path") from None
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise _StoreOpenError("unsafe_path")

    try:
        canonical = (root / mansion_id).resolve(strict=True)
        canonical.relative_to(root)
    except (OSError, ValueError):
        raise _StoreOpenError("unsafe_path") from None
    if canonical == root:
        raise _StoreOpenError("unsafe_path")

    try:
        descriptor = os.open(mansion_id, _DIRECTORY_FLAGS, dir_fd=root_fd)
    except FileNotFoundError:
        raise _StoreOpenError("mansion_not_found") from None
    except OSError:
        raise _StoreOpenError("unsafe_path") from None
    if not stat.S_ISDIR(os.fstat(descriptor).st_mode):
        os.close(descriptor)
        raise _StoreOpenError("unsafe_path")
    return descriptor


def _open_child_directory(parent_fd: int, name: str, *, create: bool) -> int:
    try:
        return os.open(name, _DIRECTORY_FLAGS, dir_fd=parent_fd)
    except FileNotFoundError:
        if not create:
            raise _StoreOpenError("log_not_found") from None
        try:
            os.mkdir(name, mode=0o700, dir_fd=parent_fd)
        except FileExistsError:
            pass
        except OSError:
            raise _StoreOpenError("unsafe_path") from None
        try:
            descriptor = os.open(name, _DIRECTORY_FLAGS, dir_fd=parent_fd)
        except OSError:
            raise _StoreOpenError("unsafe_path") from None
        if not stat.S_ISDIR(os.fstat(descriptor).st_mode):
            os.close(descriptor)
            raise _StoreOpenError("unsafe_path")
        return descriptor
    except OSError:
        raise _StoreOpenError("unsafe_path") from None


def _open_log_file(seance_fd: int, *, create: bool, writable: bool) -> int:
    flags = (os.O_RDWR | os.O_APPEND) if writable else os.O_RDONLY
    if create:
        flags |= os.O_CREAT
    flags |= _FILE_NOFOLLOW | getattr(os, "O_NONBLOCK", 0)
    attempts = _CREATE_ATTEMPTS if create else 1
    descriptor = -1
    for attempt in range(attempts):
        try:
            descriptor = os.open(_LOG_NAME, flags, 0o600, dir_fd=seance_fd)
            break
        except FileNotFoundError:
            # A creating open can lose a race with another process creating
            # the same file and report a missing entry; the entry exists on
            # the next attempt.  A non-creating open reports the absence.
            if attempt + 1 < attempts:
                continue
            raise _StoreOpenError(
                "failed" if create else "log_not_found"
            ) from None
        except OSError as error:
            status: WriterStatus = (
                "unsafe_path"
                if error.errno in (errno.ELOOP, errno.EISDIR, errno.ENOTDIR)
                else "failed"
            )
            raise _StoreOpenError(status) from None
    if not stat.S_ISREG(os.fstat(descriptor).st_mode):
        os.close(descriptor)
        raise _StoreOpenError("unsafe_path")
    return descriptor


def _diagnostic(detail: str) -> WriterDiagnostic:
    return WriterDiagnostic(
        code=WriterDiagnosticCode.PERSISTENCE_FAILED,
        safe_detail=detail,
    )
