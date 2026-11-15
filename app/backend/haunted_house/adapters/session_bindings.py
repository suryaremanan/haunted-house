"""Trusted session bindings for the room MCP server (S9 decision).

Before an app-owned Crew session receives its first turn, the backend writes
one owner-only record under Crew's verified ``<app-root>/data`` directory:

    <data>/session-bindings/<sha256(label) hex>.json

``label`` is the value Crew sets as ``KIROCREW_SESSION_LABEL`` for the
session's MCP servers: ``dashboard:<slot key>``.  The record binds that label
to one Ghost, role, Room, Mansion, spec, and run, and holds the
Session_Capability the MCP process must present to the backend.  The model
can reach neither the label nor the record, so nothing in a tool call can
choose authority.

A second record, ``<data>/room-backend.json``, tells the MCP process which
loopback port the backend listens on; it is rewritten at each backend start.

Records are created exclusively with mode 0600 in 0700 directories, are
never followed through a link, and are refused when anyone else owns or can
write them.  A capability is compared in constant time and never logged.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import stat
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from haunted_house.core.action_descriptor import ROOMS
from haunted_house.core.guardrail_events import PHASES, Phase
from haunted_house.core.mansion_names import is_valid_mansion_name
from haunted_house.core.path_policy import GHOST_ROLES, is_valid_spec_name, room_policy
from haunted_house.core.seance_event import EventScope

__all__ = [
    "BINDING_DIRECTORY",
    "BINDING_SCHEMA",
    "ENDPOINT_FILENAME",
    "LABEL_PREFIX",
    "MAX_RECORD_BYTES",
    "BindingError",
    "RoomBinding",
    "SessionBindingStore",
    "binding_filename",
    "new_capability",
    "read_owner_only_json",
    "session_label",
]

BINDING_DIRECTORY = "session-bindings"
ENDPOINT_FILENAME = "room-backend.json"
BINDING_SCHEMA = 1
LABEL_PREFIX = "dashboard:"
MAX_RECORD_BYTES = 4096

_SLOT = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}")
_GHOST = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
_RUN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,63}")
_CAPABILITY = re.compile(r"[0-9a-f]{64}")
_FIELDS = frozenset(
    {
        "schema", "label", "slot", "ghost", "role", "room", "mansion", "mansionRoot",
        "spec", "phase", "runId", "runSequence", "capability",
    }
)
_NOFOLLOW = getattr(os, "O_NOFOLLOW", 0)
_CLOEXEC = getattr(os, "O_CLOEXEC", 0)


class BindingError(RuntimeError):
    """A safe failure code; never a path, label, or capability."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


def session_label(slot: str) -> str:
    return LABEL_PREFIX + slot


def binding_filename(label: str) -> str:
    return hashlib.sha256(label.encode("utf-8")).hexdigest() + ".json"


def new_capability() -> str:
    return secrets.token_hex(32)


@dataclass(frozen=True, slots=True)
class RoomBinding:
    """One session's trusted identity.  ``capability`` is never returned to
    the model, logged, or written to a canonical record."""

    slot: str
    ghost: str
    role: str
    room: str
    mansion: str
    mansion_root: str
    spec: str
    phase: Phase
    run_id: str
    run_sequence: int
    capability: str

    @property
    def label(self) -> str:
        return session_label(self.slot)

    @property
    def scope(self) -> EventScope:
        return EventScope(
            mansion_id=self.mansion,
            ghost_id=self.ghost,
            session_slot=self.slot,
            run_id=self.run_id,
            run_sequence=self.run_sequence,
        )

    def __repr__(self) -> str:  # the capability never reaches a log line
        return f"RoomBinding(slot={self.slot!r}, ghost={self.ghost!r}, mansion={self.mansion!r})"

    def to_json(self) -> dict[str, Any]:
        return {
            "schema": BINDING_SCHEMA,
            "label": self.label,
            "slot": self.slot,
            "ghost": self.ghost,
            "role": self.role,
            "room": self.room,
            "mansion": self.mansion,
            "mansionRoot": self.mansion_root,
            "spec": self.spec,
            "phase": self.phase.value,
            "runId": self.run_id,
            "runSequence": self.run_sequence,
            "capability": self.capability,
        }

    @classmethod
    def from_json(cls, value: object) -> RoomBinding | None:
        """Parse a record strictly; anything unexpected yields ``None``."""

        if type(value) is not dict or set(value) != _FIELDS:
            return None
        record: dict[str, Any] = value
        text = ("label", "slot", "ghost", "role", "room", "mansion", "mansionRoot",
                "spec", "phase", "runId", "capability")
        if record["schema"] != BINDING_SCHEMA or any(type(record[key]) is not str for key in text):
            return None
        policy = room_policy(record["role"], record["spec"])
        if (
            _SLOT.fullmatch(record["slot"]) is None
            or record["label"] != session_label(record["slot"])
            or _GHOST.fullmatch(record["ghost"]) is None
            or len(record["ghost"]) > 64
            or record["role"] not in GHOST_ROLES
            or record["room"] not in ROOMS
            or policy is None
            or policy.room != record["room"]
            or not is_valid_mansion_name(record["mansion"])
            or not is_valid_spec_name(record["spec"])
            or record["phase"] not in Phase._value2member_map_
            or _RUN.fullmatch(record["runId"]) is None
            or type(record["runSequence"]) is not int
            or not 0 <= record["runSequence"] <= 2**31 - 1
            or _CAPABILITY.fullmatch(record["capability"]) is None
            or not os.path.isabs(record["mansionRoot"])
            or "\x00" in record["mansionRoot"]
        ):
            return None
        return cls(
            slot=record["slot"],
            ghost=record["ghost"],
            role=record["role"],
            room=record["room"],
            mansion=record["mansion"],
            mansion_root=record["mansionRoot"],
            spec=record["spec"],
            phase=Phase(record["phase"]),
            run_id=record["runId"],
            run_sequence=record["runSequence"],
            capability=record["capability"],
        )


assert len(PHASES) == 4


def read_owner_only_json(directory: Path, name: str) -> object | None:
    """Read one small JSON record, refusing links and loose permissions.

    ``directory`` must be a real directory owned by this user.  Returns
    ``None`` for anything missing, linked, shared, oversized, or malformed.
    """

    try:
        info = os.lstat(directory)
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid():
            return None
        descriptor = os.open(directory / name, os.O_RDONLY | _NOFOLLOW | _CLOEXEC)
    except OSError:
        return None
    try:
        info = os.fstat(descriptor)
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_nlink != 1
            or info.st_uid != os.getuid()
            or info.st_mode & (stat.S_IWGRP | stat.S_IWOTH | stat.S_IRGRP | stat.S_IROTH)
            or info.st_size > MAX_RECORD_BYTES
        ):
            return None
        raw = os.read(descriptor, MAX_RECORD_BYTES + 1)
    except OSError:
        return None
    finally:
        os.close(descriptor)
    try:
        return json.loads(raw.decode("utf-8"))
    except (ValueError, RecursionError):
        return None


class SessionBindingStore:
    """Writes and verifies binding records below one app-data directory."""

    def __init__(self, data_directory: Path) -> None:
        self._data = Path(data_directory)

    @property
    def directory(self) -> Path:
        return self._data / BINDING_DIRECTORY

    def _ensure_directory(self) -> Path:
        directory = self.directory
        try:
            data = os.lstat(self._data)
            if not stat.S_ISDIR(data.st_mode) or data.st_uid != os.getuid():
                raise BindingError("binding_store_unavailable")
            try:
                os.mkdir(directory, 0o700)
            except FileExistsError:
                pass
            info = os.lstat(directory)
            if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid():
                raise BindingError("binding_store_unavailable")
            if stat.S_IMODE(info.st_mode) != 0o700:
                os.chmod(directory, 0o700)
        except OSError:
            raise BindingError("binding_store_unavailable") from None
        return directory

    def _write(self, directory: Path, name: str, value: dict[str, Any]) -> None:
        payload = json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")
        if len(payload) > MAX_RECORD_BYTES:
            raise BindingError("binding_too_large")
        temporary = directory / f".{name}.{secrets.token_hex(8)}.tmp"
        try:
            descriptor = os.open(
                temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | _NOFOLLOW | _CLOEXEC, 0o600
            )
            try:
                os.write(descriptor, payload)
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
            os.replace(temporary, directory / name)
        except OSError:
            try:
                os.unlink(temporary)
            except OSError:
                pass
            raise BindingError("binding_store_unavailable") from None

    def write(self, binding: RoomBinding) -> None:
        """Persist one binding.  The record must parse back to itself."""

        if RoomBinding.from_json(binding.to_json()) != binding:
            raise BindingError("binding_invalid")
        self._write(self._ensure_directory(), binding_filename(binding.label), binding.to_json())

    def load(self, label: object) -> RoomBinding | None:
        if type(label) is not str or not label.startswith(LABEL_PREFIX) or len(label) > 160:
            return None
        binding = RoomBinding.from_json(
            read_owner_only_json(self.directory, binding_filename(label))
        )
        if binding is None or binding.label != label:
            return None
        return binding

    def authenticate(self, label: object, capability: object) -> RoomBinding | None:
        """The binding of ``label`` when ``capability`` is its capability."""

        binding = self.load(label)
        if binding is None or type(capability) is not str:
            return None
        if not hmac.compare_digest(binding.capability.encode(), capability.encode("utf-8", "replace")):
            return None
        return binding

    def remove(self, label: str) -> None:
        try:
            os.unlink(self.directory / binding_filename(label))
        except OSError:
            pass

    def write_endpoint(self, port: int) -> None:
        """Record the backend's loopback port for the MCP process."""

        if type(port) is not int or not 1 <= port <= 65535:
            raise BindingError("binding_invalid")
        self._ensure_directory()
        self._write(self._data, ENDPOINT_FILENAME, {"schema": BINDING_SCHEMA, "port": port})

    def read_endpoint(self) -> int | None:
        record = read_owner_only_json(self._data, ENDPOINT_FILENAME)
        if type(record) is not dict or set(record) != {"schema", "port"}:
            return None
        port = record["port"]
        if record["schema"] != BINDING_SCHEMA or type(port) is not int or not 1 <= port <= 65535:
            return None
        return port
