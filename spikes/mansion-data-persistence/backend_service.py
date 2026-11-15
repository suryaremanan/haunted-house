"""Standalone backend seam used by the app-data persistence probe.

The real Haunted House backend will run with the installed app directory as its
working directory.  Crew does not inject an app-data path into a standalone
backend, so this seam resolves only the gateway-owned ``data`` child and fails
closed for every other shape.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import stat
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

APP_DATA_LABEL = "<app-root>/data"
REGISTRY_FILENAME = "probe-mansions-v1.json"
REGISTRY_SCHEMA_VERSION = 1
SYNTHETIC_REGISTRY: dict[str, object] = {
    "schemaVersion": REGISTRY_SCHEMA_VERSION,
    "mansions": [
        {
            "name": "persistence-probe",
            "projectSpec": "persistence-probe",
            "relativePath": "persistence-probe",
            "origin": "created",
        }
    ],
}


class AppDataUnverified(RuntimeError):
    """Raised when the standalone backend cannot prove its app-data location."""


def _is_real_directory(path: Path) -> bool:
    """Return whether *path* is a directory entry and not a symbolic link."""
    try:
        return stat.S_ISDIR(path.lstat().st_mode) and not path.is_symlink()
    except OSError:
        return False


def resolve_standalone_app_data(cwd: Path | None = None) -> tuple[Path, Path]:
    """Resolve ``<app-root>/data`` from a standalone backend working directory.

    The resolver deliberately has no home-directory fallback.  It requires a
    real app manifest and a real direct ``data`` child created by Crew.  It never
    returns or logs a display form containing the absolute app path.
    """
    try:
        app_root = (cwd if cwd is not None else Path.cwd()).resolve(strict=True)
    except OSError as exc:
        raise AppDataUnverified("backend working directory is unavailable") from exc

    manifest = app_root / "app.json"
    try:
        manifest_mode = manifest.lstat().st_mode
    except OSError as exc:
        raise AppDataUnverified("backend working directory is not an app root") from exc
    if manifest.is_symlink() or not stat.S_ISREG(manifest_mode):
        raise AppDataUnverified("backend working directory is not an app root")

    data_dir = app_root / "data"
    if not _is_real_directory(data_dir):
        raise AppDataUnverified("Crew app-data directory is unavailable")
    try:
        resolved_data = data_dir.resolve(strict=True)
    except OSError as exc:
        raise AppDataUnverified("Crew app-data directory is unavailable") from exc
    if resolved_data.parent != app_root or resolved_data.name != "data":
        raise AppDataUnverified("Crew app-data directory is not app-owned")
    return app_root, resolved_data


def canonical_registry_bytes(registry: Mapping[str, Any]) -> bytes:
    """Return deterministic UTF-8 bytes for a synthetic registry."""
    return (json.dumps(registry, indent=2, sort_keys=True) + "\n").encode("utf-8")


def _validate_synthetic_registry(value: object) -> dict[str, object]:
    """Accept only the versioned, relative-path fixture written by this probe."""
    if value != SYNTHETIC_REGISTRY:
        raise AppDataUnverified("synthetic registry is not equivalent")
    registry = value
    assert isinstance(registry, dict)
    mansion = registry["mansions"][0]  # type: ignore[index]
    assert isinstance(mansion, dict)
    relative_path = mansion.get("relativePath")
    if not isinstance(relative_path, str):
        raise AppDataUnverified("synthetic registry path is invalid")
    relative = Path(relative_path)
    if relative.is_absolute() or ".." in relative.parts:
        raise AppDataUnverified("synthetic registry path is not relative")
    return registry


@dataclass(frozen=True)
class StandaloneRegistryService:
    """Small restartable service that stores one synthetic registry in app data."""

    app_root: Path
    data_dir: Path

    @classmethod
    def from_cwd(cls, cwd: Path | None = None) -> "StandaloneRegistryService":
        app_root, data_dir = resolve_standalone_app_data(cwd)
        return cls(app_root=app_root, data_dir=data_dir)

    @property
    def registry_path(self) -> Path:
        return self.data_dir / REGISTRY_FILENAME

    def write_synthetic_registry(self) -> str:
        registry = _validate_synthetic_registry(SYNTHETIC_REGISTRY)
        payload = canonical_registry_bytes(registry)
        fd = os.open(
            self.registry_path,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0),
            0o600,
        )
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
        except BaseException:
            try:
                self.registry_path.unlink(missing_ok=True)
            except OSError:
                pass
            raise
        return hashlib.sha256(payload).hexdigest()

    def load_synthetic_registry(self) -> tuple[dict[str, object], str]:
        try:
            payload = self.registry_path.read_bytes()
            value = json.loads(payload.decode("utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise AppDataUnverified("synthetic registry cannot be loaded") from exc
        registry = _validate_synthetic_registry(value)
        canonical = canonical_registry_bytes(registry)
        if payload != canonical:
            raise AppDataUnverified("synthetic registry bytes changed")
        return registry, hashlib.sha256(canonical).hexdigest()


def _safe_result(operation: str, digest: str) -> dict[str, object]:
    return {
        "status": "ok",
        "operation": operation,
        "dataDirectory": APP_DATA_LABEL,
        "schemaVersion": REGISTRY_SCHEMA_VERSION,
        "registryDigest": digest,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Exercise standalone app-data registry access")
    parser.add_argument("operation", choices=("write", "load"))
    args = parser.parse_args(argv)

    try:
        service = StandaloneRegistryService.from_cwd()
        if args.operation == "write":
            digest = service.write_synthetic_registry()
        else:
            _registry, digest = service.load_synthetic_registry()
    except (AppDataUnverified, OSError):
        print(json.dumps({"status": "unverified", "code": "app_data_unverified"}))
        return 2

    print(json.dumps(_safe_result(args.operation, digest), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
