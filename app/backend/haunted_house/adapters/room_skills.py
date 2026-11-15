"""Read a role's installed Room_Skill for bounded prompt delivery.

RG-S2 showed that Crew replaces a profile's ``skill://`` resource with a
tool outside the room catalog, so a Ghost's skill is not loaded by the agent
runtime.  The backend instead reads the role's own ``SKILL.md`` from the
installed app and puts it, delimited, at the front of the assignment prompt.

Only the file the role contract names is read: a real regular file directly
under ``<app root>/skills/<skill>/``, small enough for one prompt, valid
UTF-8, and passing the same validation the shipped skill passes in tests.
Anything else is refused with a stable code and the Ghost is not started
with a partial or foreign skill.
"""

from __future__ import annotations

import os
import stat
from pathlib import Path
from typing import Final

from haunted_house.core.profile_contracts import MAX_SKILL_BYTES, role_contract, skill_block

__all__ = ["SKILL_FILE", "RoomSkillError", "read_room_skill_block"]

SKILL_FILE: Final = "SKILL.md"


class RoomSkillError(RuntimeError):
    """The skill cannot be delivered.  ``code`` is stable and path-free."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


def read_room_skill_block(app_root: Path, role: str) -> str:
    """The ``<room-skill>`` block of ``role``, read from the installed app."""

    try:
        contract = role_contract(role)
    except KeyError:
        raise RoomSkillError("skill_role_unknown") from None
    root = Path(os.path.realpath(app_root))
    path = root / "skills" / contract.skill / SKILL_FILE
    # No link anywhere below the app root may redirect the read.
    if Path(os.path.realpath(path)) != path:
        raise RoomSkillError("skill_missing")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_CLOEXEC", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError:
        raise RoomSkillError("skill_missing") from None
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode):
            raise RoomSkillError("skill_missing")
        if info.st_size > MAX_SKILL_BYTES:
            raise RoomSkillError("skill_invalid")
        data = os.read(descriptor, MAX_SKILL_BYTES + 1)
    except OSError:
        raise RoomSkillError("skill_unreadable") from None
    finally:
        os.close(descriptor)
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        raise RoomSkillError("skill_invalid") from None
    try:
        return skill_block(role, text)
    except ValueError:
        raise RoomSkillError("skill_invalid") from None
