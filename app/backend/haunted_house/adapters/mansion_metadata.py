"""Atomic persistence for app-owned mansion metadata.

Crew starts a standalone app backend with the installed app directory as its
working directory and preserves that directory's real ``data`` child across
updates.  This adapter accepts only that verified shape; it has no home-folder
or source-tree fallback.
"""

from __future__ import annotations

import errno
import os
import stat
import tempfile
from pathlib import Path
from typing import Protocol

from haunted_house.core.mansion_registry import (
    MansionRegistry,
    RegistryCodecError,
    parse_registry,
    print_registry,
)

APP_DATA_DIRECTORY_NAME = "data"
APP_MANIFEST_FILENAME = "app.json"
REGISTRY_FILENAME = "mansions-v1.json"

_UNSUPPORTED_DIRECTORY_FSYNC_ERRORS = frozenset(
    error
    for error in (
        errno.EBADF,
        errno.EINVAL,
        getattr(errno, "ENOTSUP", None),
        getattr(errno, "EOPNOTSUPP", None),
    )
    if error is not None
)


class MetadataUnavailable(RuntimeError):
    """Raised when verified app metadata cannot be loaded or saved safely."""

    def __init__(self) -> None:
        super().__init__("mansion metadata is unavailable")


class MansionMetadataStore(Protocol):
    """Persistence boundary used by the mansion service."""

    def load(self) -> MansionRegistry:
        """Load the current registry or an empty registry when none exists."""

    def save(self, registry: MansionRegistry) -> None:
        """Atomically replace the current registry with ``registry``."""


class FileMansionMetadataStore:
    """Store ``mansions-v1.json`` in Crew's verified app-data directory."""

    def __init__(self, app_root: Path | None = None) -> None:
        self._app_root, self._app_data_directory = _resolve_app_data(app_root)

    @classmethod
    def from_cwd(cls, cwd: Path | None = None) -> FileMansionMetadataStore:
        """Build a store from the app root Crew uses as the backend cwd."""

        return cls(cwd)

    @property
    def app_data_directory(self) -> Path:
        """Return the verified app-owned data directory."""

        return self._app_data_directory

    @property
    def registry_path(self) -> Path:
        """Return the app-owned registry path."""

        return self._app_data_directory / REGISTRY_FILENAME

    def load(self) -> MansionRegistry:
        """Load strict registry JSON without repairing invalid bytes.

        Only an absent registry is treated as empty.  Invalid UTF-8, malformed
        JSON, unsupported schemas, non-regular entries, and I/O failures are
        reported uniformly and leave the registry entry untouched.
        """

        self._verify_location()
        try:
            payload = _read_regular_file(self.registry_path)
        except FileNotFoundError:
            return MansionRegistry()
        except OSError as error:
            raise MetadataUnavailable() from error

        try:
            return parse_registry(payload.decode("utf-8"))
        except (UnicodeError, RegistryCodecError) as error:
            raise MetadataUnavailable() from error

    def save(self, registry: MansionRegistry) -> None:
        """Write canonical JSON with a durable same-directory replacement."""

        self._verify_location()
        try:
            payload = print_registry(registry).encode("utf-8")
        except (UnicodeError, RegistryCodecError) as error:
            raise MetadataUnavailable() from error

        temporary_path: Path | None = None
        descriptor: int | None = None
        try:
            descriptor, temporary_name = tempfile.mkstemp(
                prefix=f".{REGISTRY_FILENAME}.",
                suffix=".tmp",
                dir=self._app_data_directory,
            )
            temporary_path = Path(temporary_name)

            with os.fdopen(descriptor, "wb") as handle:
                descriptor = None
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())

            os.replace(temporary_path, self.registry_path)
            temporary_path = None
            _fsync_directory(self._app_data_directory)
        except BaseException as error:
            if descriptor is not None:
                try:
                    os.close(descriptor)
                except OSError:
                    pass
            if temporary_path is not None:
                try:
                    temporary_path.unlink(missing_ok=True)
                except OSError:
                    pass
            if isinstance(error, (OSError, RegistryCodecError)):
                raise MetadataUnavailable() from error
            raise

    def _verify_location(self) -> None:
        """Fail if the verified direct app-data child changed after startup."""

        app_root, app_data_directory = _resolve_app_data(self._app_root)
        if (
            app_root != self._app_root
            or app_data_directory != self._app_data_directory
        ):
            raise MetadataUnavailable()


def resolve_app_data_directory(app_root: Path | None = None) -> Path:
    """Resolve Crew's real direct ``<app-root>/data`` child or fail closed."""

    _app_root, app_data_directory = _resolve_app_data(app_root)
    return app_data_directory


def _resolve_app_data(app_root: Path | None) -> tuple[Path, Path]:
    candidate = Path.cwd() if app_root is None else Path(app_root)
    try:
        resolved_root = candidate.resolve(strict=True)
        root_mode = resolved_root.lstat().st_mode
    except OSError as error:
        raise MetadataUnavailable() from error
    if not stat.S_ISDIR(root_mode):
        raise MetadataUnavailable()

    manifest = resolved_root / APP_MANIFEST_FILENAME
    try:
        manifest_mode = manifest.lstat().st_mode
    except OSError as error:
        raise MetadataUnavailable() from error
    if manifest.is_symlink() or not stat.S_ISREG(manifest_mode):
        raise MetadataUnavailable()

    app_data_directory = resolved_root / APP_DATA_DIRECTORY_NAME
    try:
        data_mode = app_data_directory.lstat().st_mode
        resolved_data = app_data_directory.resolve(strict=True)
    except OSError as error:
        raise MetadataUnavailable() from error
    if (
        app_data_directory.is_symlink()
        or not stat.S_ISDIR(data_mode)
        or resolved_data.parent != resolved_root
        or resolved_data.name != APP_DATA_DIRECTORY_NAME
    ):
        raise MetadataUnavailable()

    return resolved_root, resolved_data


def _read_regular_file(path: Path) -> bytes:
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0)
    flags |= getattr(os, "O_NONBLOCK", 0)
    descriptor = os.open(path, flags)
    try:
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            raise OSError(errno.EINVAL, "registry entry is not a regular file")
        with os.fdopen(descriptor, "rb") as handle:
            descriptor = -1
            return handle.read()
    finally:
        if descriptor >= 0:
            os.close(descriptor)


def _fsync_directory(directory: Path) -> None:
    if os.name == "nt":
        return

    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0)
    flags |= getattr(os, "O_DIRECTORY", 0)
    descriptor = os.open(directory, flags)
    try:
        try:
            os.fsync(descriptor)
        except OSError as error:
            if error.errno not in _UNSUPPORTED_DIRECTORY_FSYNC_ERRORS:
                raise
    finally:
        os.close(descriptor)


__all__ = [
    "APP_DATA_DIRECTORY_NAME",
    "APP_MANIFEST_FILENAME",
    "REGISTRY_FILENAME",
    "FileMansionMetadataStore",
    "MansionMetadataStore",
    "MetadataUnavailable",
    "resolve_app_data_directory",
]
