"""Filesystem race, confinement, and recovery tests for Path_Guard
(tasks 5.4, 5.5).

Every test uses a private temporary Mansion root.

Validates: Requirements 5.1, 5.3–5.8, 6.6, 6.7.
"""

from __future__ import annotations

import asyncio
import hashlib
import os
import stat
from pathlib import Path

import pytest

from haunted_house.adapters import guarded_filesystem as module
from haunted_house.adapters.guarded_filesystem import (
    FileDigest,
    GuardedFilesystem,
    GuardedFilesystemError,
    GuardedRoomAccess,
)
from haunted_house.adapters.guardrail_port import GuardrailPort
from haunted_house.adapters.seance_log_store import SeanceLogStore
from haunted_house.core import guardrail_events as ge
from haunted_house.core.guardrail_events import Phase
from haunted_house.core.path_policy import Access, room_policy
from haunted_house.core.workflow import (
    ArtifactRevision,
    DoorStatus,
    PhaseStatus,
    SubmitOutput,
    decide_transition,
)
from tests.guardrail_support import (
    MANSION,
    OPERATOR,
    SESSION_SCOPE,
    SPEC,
    MemoryWriter,
    spec_path,
)

TINKER = room_policy("tinker", SPEC)
ARCHIVIST = room_policy("archivist", SPEC)
_CONTROL = "." + "haunted-house"


def _run(awaitable):
    return asyncio.run(awaitable)


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


@pytest.fixture
def world(tmp_path):
    root = tmp_path / "mansions"
    mansion = root / MANSION
    (mansion / "src").mkdir(parents=True)
    (mansion / "src" / "app.py").write_bytes(b"print('hi')\n")
    (mansion / ".kiro" / "specs" / SPEC).mkdir(parents=True)
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "secret.txt").write_bytes(b"outside-content")
    return root, mansion, outside


def _fs(world, **kwargs) -> GuardedFilesystem:
    return GuardedFilesystem(world[0], MANSION, **kwargs)


def _code(call) -> tuple[str, bool]:
    with pytest.raises(GuardedFilesystemError) as raised:
        call()
    assert str(raised.value) == raised.value.code
    return raised.value.code, raised.value.denied


def _tree(mansion: Path) -> dict[str, bytes | None]:
    snapshot = {}
    for path in sorted(mansion.rglob("*")):
        relative = path.relative_to(mansion).as_posix()
        if path.is_symlink():
            snapshot[relative] = b"->" + os.readlink(path).encode()
        elif path.is_file():
            snapshot[relative] = path.read_bytes()
        else:
            snapshot[relative] = None
    return snapshot


# --- basic guarded operations -------------------------------------------------


def test_read_write_list_and_delete_inside_the_room(world):
    _root, mansion, _outside = world
    fs = _fs(world)
    data, digest = fs.read_file(TINKER, "src/app.py")
    assert data == b"print('hi')\n" and digest == FileDigest(_sha(data), len(data))
    assert fs.digest(TINKER, "src/missing.py") is None

    written = fs.write_file(TINKER, "src/app.py", b"v2", expected=digest)
    assert written == FileDigest(_sha(b"v2"), 2)
    assert (mansion / "src" / "app.py").read_bytes() == b"v2"
    assert stat.S_IMODE((mansion / "src" / "app.py").stat().st_mode) == 0o644
    assert _code(lambda: fs.write_file(TINKER, "src/app.py", b"v3", expected=digest)) == (
        "stale_revision", False)
    assert _code(lambda: fs.write_file(TINKER, "src/app.py", b"v3", expected=None)) == (
        "stale_revision", False)
    assert (mansion / "src" / "app.py").read_bytes() == b"v2"

    fs.write_file(TINKER, "pkg/deep/new.py", b"new", expected=None, create_parents=True)
    assert _code(lambda: fs.write_file(TINKER, "other/new.py", b"x")) == ("not_found", False)
    assert [(e.name, e.kind) for e in fs.list_directory(TINKER)] == [
        (".kiro", "directory"), ("pkg", "directory"), ("src", "directory")]
    assert [e.name for e in fs.list_directory(TINKER, "src")] == ["app.py"]
    # No temporary file is left behind.
    assert not [p for p in mansion.rglob(".hh-write-*")]

    assert _code(lambda: fs.delete_file(TINKER, "src/app.py", exact_approval=False)) == (
        "approval_required", True)
    assert _code(lambda: fs.remove_empty_directory(TINKER, "pkg", exact_approval=True)) == (
        "directory_not_empty", False)
    assert _code(lambda: fs.delete_file(TINKER, "pkg", exact_approval=True)) == ("not_a_file", False)
    assert _code(lambda: fs.remove_empty_directory(TINKER, "src/app.py", exact_approval=True)) == (
        "not_a_directory", False)
    fs.delete_file(TINKER, "pkg/deep/new.py", exact_approval=True)
    fs.remove_empty_directory(TINKER, "pkg/deep", exact_approval=True)
    fs.remove_empty_directory(TINKER, "pkg", exact_approval=True)
    assert not (mansion / "pkg").exists()
    assert _code(lambda: fs.delete_file(TINKER, "src/gone.py", exact_approval=True)) == (
        "not_found", False)
    small = _fs(world, max_file_bytes=1)
    assert _code(lambda: small.write_file(TINKER, "src/big", b"12345")) == ("too_large", False)
    assert _code(lambda: small.read_file(TINKER, "src/app.py")) == ("too_large", False)


def test_room_policy_confines_each_role(world):
    _root, mansion, _outside = world
    fs = _fs(world)
    before = _tree(mansion)
    assert _code(lambda: fs.write_file(ARCHIVIST, "src/app.py", b"x")) == ("room_policy", True)
    assert _code(lambda: fs.write_file(ARCHIVIST, spec_path("design"), b"x")) == ("room_policy", True)
    assert _code(lambda: fs.write_file(TINKER, spec_path("tasks"), b"x")) == ("room_policy", True)
    assert _code(lambda: fs.delete_file(ARCHIVIST, "src/app.py", exact_approval=True)) == (
        "room_policy", True)
    assert _tree(mansion) == before
    fs.write_file(ARCHIVIST, spec_path("requirements"), b"# Requirements\n", expected=None)
    assert fs.read_file(room_policy("draughtsman", SPEC), spec_path("requirements"))[0].startswith(b"#")


@pytest.mark.parametrize(
    "raw",
    ["../outside/secret.txt", "/etc/hosts", "src/../../outside/secret.txt", "src//app.py",
     "src/./app.py", "src\\app.py", "src/app.py\x00", "%2e%2e/outside/secret.txt", "", None, 7],
)
def test_traversal_shaped_paths_never_reach_the_filesystem(world, raw, monkeypatch):
    fs = _fs(world)
    touched = []
    for name in ("open", "stat", "unlink", "rename", "mkdir", "rmdir", "scandir"):
        original = getattr(os, name)
        monkeypatch.setattr(
            module.os, name,
            lambda *a, _o=original, _n=name, **k: (touched.append(_n), _o(*a, **k))[1])
    for call in (
        lambda: fs.read_file(TINKER, raw),
        lambda: fs.write_file(TINKER, raw, b"x"),
        lambda: fs.delete_file(TINKER, raw, exact_approval=True),
        lambda: fs.remove_empty_directory(TINKER, raw, exact_approval=True),
        lambda: fs.list_directory(TINKER, raw) if raw is not None else fs.read_file(TINKER, raw),
    ):
        code, denied = _code(call)
        assert denied
    assert touched == []


def test_a_policy_denial_never_touches_the_target(world, monkeypatch):
    _root, mansion, _outside = world
    (mansion / ".env").write_bytes(b"not-a-real-value")
    os.mkfifo(mansion / "src" / "id_rsa")
    (mansion / _CONTROL).mkdir()
    fs = _fs(world)
    before = _tree(mansion)
    seen: list[object] = []
    for name in ("open", "stat", "unlink", "rename", "rmdir", "scandir"):
        original = getattr(os, name)
        monkeypatch.setattr(
            module.os, name,
            lambda *a, _o=original, **k: (seen.append(a[0] if a else None), _o(*a, **k))[1])
    for raw, access_call in [
        (".env", lambda p: fs.read_file(TINKER, p)),
        (".env", lambda p: fs.write_file(TINKER, p, b"x")),
        (".env", lambda p: fs.delete_file(TINKER, p, exact_approval=True)),
        ("src/id_rsa", lambda p: fs.read_file(TINKER, p)),
        (_CONTROL + "/seance", lambda p: fs.list_directory(TINKER, p)),
        (_CONTROL, lambda p: fs.remove_empty_directory(TINKER, p, exact_approval=True)),
        (".git/config", lambda p: fs.write_file(TINKER, p, b"x")),
        (spec_path("tasks"), lambda p: fs.write_file(TINKER, p, b"x")),
    ]:
        code, denied = _code(lambda: access_call(raw))
        assert denied and code in ("protected_path", "room_policy")
    # Not one filesystem call was made for any denied request.
    assert seen == []
    monkeypatch.undo()
    assert _tree(mansion) == before
    # Protected entries are not even listed.
    assert [e.name for e in fs.list_directory(TINKER)] == [".kiro", "src"]
    assert [e.name for e in fs.list_directory(TINKER, "src")] == ["app.py"]


# --- links, special files ---------------------------------------------------------


def test_symbolic_links_are_refused_inward_and_outward(world):
    _root, mansion, outside = world
    (mansion / "out-file").symlink_to(outside / "secret.txt")
    (mansion / "out-dir").symlink_to(outside, target_is_directory=True)
    (mansion / "in-file").symlink_to(mansion / "src" / "app.py")
    (mansion / "in-dir").symlink_to(mansion / "src", target_is_directory=True)
    (mansion / "dangling").symlink_to(mansion / "nowhere")
    fs = _fs(world)
    before = _tree(mansion)
    for raw in ("out-file", "out-dir/secret.txt", "in-file", "in-dir/app.py", "dangling",
                "out-dir/new.txt", "in-dir/sub/new.txt"):
        assert _code(lambda: fs.read_file(TINKER, raw)) == ("symlink", True), raw
        assert _code(lambda: fs.write_file(TINKER, raw, b"x", create_parents=True)) == ("symlink", True), raw
        assert _code(lambda: fs.delete_file(TINKER, raw, exact_approval=True)) == ("symlink", True), raw
    for raw in ("out-dir", "in-dir", "dangling"):
        assert _code(lambda: fs.list_directory(TINKER, raw)) == ("symlink", True)
        assert _code(lambda: fs.remove_empty_directory(TINKER, raw, exact_approval=True)) == (
            "symlink", True)
    assert _tree(mansion) == before
    assert (outside / "secret.txt").read_bytes() == b"outside-content"
    assert sorted(p.name for p in outside.iterdir()) == ["secret.txt"]
    kinds = {e.name: e.kind for e in fs.list_directory(TINKER)}
    assert kinds["out-file"] == kinds["in-dir"] == "other"


def test_hard_links_devices_and_fifos_are_refused(world):
    _root, mansion, outside = world
    os.link(outside / "secret.txt", mansion / "src" / "linked.txt")
    os.link(mansion / "src" / "app.py", mansion / "src" / "twin.py")
    os.mkfifo(mansion / "src" / "pipe")
    fs = _fs(world)
    for raw in ("src/linked.txt", "src/app.py", "src/twin.py"):
        assert _code(lambda: fs.read_file(TINKER, raw)) == ("hard_link", True)
        assert _code(lambda: fs.write_file(TINKER, raw, b"x")) == ("hard_link", True)
        assert _code(lambda: fs.delete_file(TINKER, raw, exact_approval=True)) == ("hard_link", True)
    assert _code(lambda: fs.read_file(TINKER, "src/pipe")) == ("not_regular", True)
    assert _code(lambda: fs.write_file(TINKER, "src/pipe", b"x")) == ("not_regular", True)
    assert _code(lambda: fs.delete_file(TINKER, "src/pipe", exact_approval=True)) == ("not_regular", True)
    assert (outside / "secret.txt").read_bytes() == b"outside-content"
    assert (mansion / "src" / "app.py").read_bytes() == b"print('hi')\n"
    assert stat.S_ISFIFO((mansion / "src" / "pipe").lstat().st_mode)


def test_an_unsafe_or_missing_mansion_root_fails_closed(world, tmp_path):
    root, _mansion, outside = world
    assert _code(lambda: GuardedFilesystem(root, "absent").read_file(TINKER, "a")) == (
        "mansion_not_found", False)
    assert _code(lambda: GuardedFilesystem(root, "../outside").read_file(TINKER, "secret.txt")) == (
        "unsafe_mansion_root", False)
    assert _code(lambda: GuardedFilesystem(Path("relative"), MANSION).read_file(TINKER, "a")) == (
        "unsafe_mansion_root", False)
    (tmp_path / "link-root").symlink_to(root, target_is_directory=True)
    assert _code(lambda: GuardedFilesystem(tmp_path / "link-root", MANSION).read_file(TINKER, "src/app.py")) == (
        "unsafe_mansion_root", False)
    (root / "linked-mansion").symlink_to(outside, target_is_directory=True)
    assert _code(lambda: GuardedFilesystem(root, "linked-mansion").read_file(TINKER, "secret.txt")) == (
        "unsafe_mansion_root", False)


# --- races ---------------------------------------------------------------------------


class _Racing(GuardedFilesystem):
    """Runs an attacker action at the seam between evidence and effect."""

    def __init__(self, *args, stage: str, attack, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self._stage, self._attack, self.fired = stage, attack, 0

    def _checkpoint(self, stage: str) -> None:
        if stage == self._stage:
            self.fired += 1
            self._attack()


def test_replacing_the_target_with_a_link_between_check_and_use_is_refused(world):
    root, mansion, outside = world
    target = mansion / "src" / "app.py"

    def swap_for_outward_link():
        target.unlink()
        target.symlink_to(outside / "secret.txt")

    reader = _Racing(root, MANSION, stage="before_open", attack=swap_for_outward_link)
    assert _code(lambda: reader.read_file(TINKER, "src/app.py")) == ("symlink", True)
    assert reader.fired == 1

    target.unlink()
    target.write_bytes(b"original")
    writer = _Racing(root, MANSION, stage="before_replace", attack=swap_for_outward_link)
    assert _code(lambda: writer.write_file(TINKER, "src/app.py", b"new")) == ("changed", False)
    assert (outside / "secret.txt").read_bytes() == b"outside-content"
    assert target.is_symlink() and not list(mansion.rglob(".hh-write-*"))

    target.unlink()
    target.write_bytes(b"original")
    deleter = _Racing(root, MANSION, stage="before_unlink", attack=swap_for_outward_link)
    assert _code(lambda: deleter.delete_file(TINKER, "src/app.py", exact_approval=True)) == (
        "changed", False)
    assert target.is_symlink() and (outside / "secret.txt").exists()


def test_replacing_the_file_with_another_inode_is_detected(world):
    root, mansion, _outside = world
    target = mansion / "src" / "app.py"

    def swap_inode():
        target.unlink()
        target.write_bytes(b"someone-else")

    reader = _Racing(root, MANSION, stage="before_open", attack=swap_inode)
    assert _code(lambda: reader.read_file(TINKER, "src/app.py")) == ("changed", False)
    writer = _Racing(root, MANSION, stage="before_replace", attack=swap_inode)
    assert _code(lambda: writer.write_file(TINKER, "src/app.py", b"new")) == ("changed", False)
    assert target.read_bytes() == b"someone-else"

    def add_hard_link():
        os.link(target, mansion / "src" / "twin.py")

    linker = _Racing(root, MANSION, stage="before_open", attack=add_hard_link)
    assert _code(lambda: linker.read_file(TINKER, "src/app.py")) == ("hard_link", True)


class _ReusedInode:
    """A real fstat result that reports a recycled inode number."""

    def __init__(self, info: os.stat_result, inode: int) -> None:
        self._info = info
        self.st_ino = inode

    def __getattr__(self, name: str):
        return getattr(self._info, name)


def test_a_swapped_file_on_a_recycled_inode_number_is_detected(world, monkeypatch):
    # ext4 hands the freed inode number straight to the next file, so the
    # replacement can share (device, inode) and even the size of the original.
    root, mansion, _outside = world
    target = mansion / "src" / "app.py"
    original = target.stat()
    real_fstat = os.fstat

    def swap_same_size():
        target.unlink()
        target.write_bytes(b"x" * original.st_size)
        monkeypatch.setattr(
            module.os, "fstat", lambda fd: _ReusedInode(real_fstat(fd), original.st_ino)
        )

    reader = _Racing(root, MANSION, stage="before_open", attack=swap_same_size)
    assert _code(lambda: reader.read_file(TINKER, "src/app.py")) == ("changed", False)


def test_exchanging_the_parent_directory_cannot_redirect_a_write(world):
    root, mansion, outside = world

    def exchange_parent():
        (mansion / "src").rename(mansion / "src-moved")
        (mansion / "src").symlink_to(outside, target_is_directory=True)

    writer = _Racing(root, MANSION, stage="before_replace", attack=exchange_parent)
    writer.write_file(TINKER, "src/app.py", b"new-content")
    # The write followed the descriptor it already held, never the new link.
    assert (mansion / "src-moved" / "app.py").read_bytes() == b"new-content"
    assert sorted(p.name for p in outside.iterdir()) == ["secret.txt"]
    assert _code(lambda: _fs(world).read_file(TINKER, "src/app.py")) == ("symlink", True)

    (mansion / "src").unlink()
    (mansion / "src-moved").rename(mansion / "src")
    deleter = _Racing(root, MANSION, stage="before_unlink", attack=exchange_parent)
    (outside / "app.py").write_bytes(b"outside-app")
    deleter.delete_file(TINKER, "src/app.py", exact_approval=True)
    assert (outside / "app.py").read_bytes() == b"outside-app"
    assert not (mansion / "src-moved" / "app.py").exists()


def test_a_failed_replace_leaves_the_original_and_no_temporary_file(world, monkeypatch):
    _root, mansion, _outside = world
    fs = _fs(world)
    monkeypatch.setattr(fs, "_replace", lambda *a: (_ for _ in ()).throw(OSError(5, "io")))
    assert _code(lambda: fs.write_file(TINKER, "src/app.py", b"new")) == ("filesystem_error", False)
    assert (mansion / "src" / "app.py").read_bytes() == b"print('hi')\n"
    assert sorted(p.name for p in (mansion / "src").iterdir()) == ["app.py"]


# --- canonical evidence ------------------------------------------------------------


def _access(world, writer=None, **kwargs):
    writer = writer or MemoryWriter()
    counter = iter(range(1, 1000))
    fs = kwargs.pop("filesystem", None) or _fs(world)
    return (
        GuardedRoomAccess(fs, GuardrailPort(writer), id_factory=lambda: f"id-{next(counter)}"),
        writer,
        fs,
    )


def _kinds(writer) -> list[str]:
    return [event.payload["kind"] for event in writer.events]


def test_every_denial_appends_one_content_free_record_and_touches_nothing(world):
    _root, mansion, _outside = world
    (mansion / ".env").write_bytes(b"not-a-real-value")
    access, writer, _fs_ = _access(world)
    before = _tree(mansion)

    async def attempts():
        codes = []
        for call in (
            access.read_file(SESSION_SCOPE, TINKER, ".env"),
            access.read_file(SESSION_SCOPE, TINKER, "../../etc/passwd"),
            access.write_file(SESSION_SCOPE, ARCHIVIST, "src/app.py", b"x"),
            access.delete_file(SESSION_SCOPE, TINKER, "src/app.py", exact_approval=False),
            access.list_directory(SESSION_SCOPE, TINKER, _CONTROL),
            access.remove_empty_directory(SESSION_SCOPE, ARCHIVIST, "src", exact_approval=True),
        ):
            try:
                await call
            except GuardedFilesystemError as error:
                codes.append(error.code)
        return codes

    assert _run(attempts()) == [
        "protected_path", "parent_segment", "room_policy", "approval_required",
        "protected_path", "room_policy"]
    assert _tree(mansion) == before
    assert _kinds(writer) == ["path_denied"] * 6
    records = [event.payload["data"] for event in writer.events]
    assert [r["path"] for r in records] == [".env", None, "src/app.py", "src/app.py", _CONTROL, "src"]
    assert [r["access"] for r in records] == ["read", "read", "write", "delete", "list", "delete"]
    assert {r["room"] for r in records} == {"workshop", "study"}
    assert all(event.scope == SESSION_SCOPE and event.source.origin == "house" for event in writer.events)
    assert b"not-a-real-value" not in repr(writer.events).encode()

    # Ordinary outcomes (missing file) are not denials and record nothing.
    with pytest.raises(GuardedFilesystemError):
        _run(access.read_file(SESSION_SCOPE, TINKER, "src/missing.py"))
    assert len(writer.events) == 6
    assert _run(access.read_file(SESSION_SCOPE, TINKER, "src/app.py"))[0] == b"print('hi')\n"


def test_mutations_are_refused_when_the_writer_or_integrity_is_unavailable(world):
    _root, mansion, _outside = world
    writer = MemoryWriter()
    writer.fail_reads = True
    access, _w, _f = _access(world, writer)
    before = _tree(mansion)
    for call in (
        lambda: access.write_file(SESSION_SCOPE, TINKER, "src/app.py", b"x"),
        lambda: access.delete_file(SESSION_SCOPE, TINKER, "src/app.py", exact_approval=True),
        lambda: access.remove_empty_directory(SESSION_SCOPE, TINKER, "src", exact_approval=True),
        lambda: access.recover_spec_writes(SESSION_SCOPE),
    ):
        with pytest.raises(GuardedFilesystemError) as raised:
            _run(call())
        assert raised.value.code == "integrity_unavailable"
    blocked = _run(access.write_spec_document(
        SESSION_SCOPE, role="archivist", spec_name=SPEC, phase=Phase.REQUIREMENTS,
        data=b"# R\n", expected_revision=0))
    assert (blocked.status, blocked.code) == ("blocked", "integrity_unavailable")
    assert _tree(mansion) == before and writer.events == []


def _working(writer, phase=Phase.REQUIREMENTS):
    """Put ``phase`` into ``working`` through acknowledged records."""

    async def go():
        port = GuardrailPort(writer)
        assert (await port.append(MANSION, [
            ge.phase_start_reserved(OPERATOR, phase=phase, reservation_id="res-1", command_id="cmd-1"),
            ge.phase_started(OPERATOR, phase=phase, reservation_id="res-1", session_slot="study-slot"),
        ])).ok

    _run(go())


def _write(access, data, revision, **overrides):
    fields = dict(role="archivist", spec_name=SPEC, phase=Phase.REQUIREMENTS, data=data,
                  expected_revision=revision)
    fields.update(overrides)
    return _run(access.write_spec_document(SESSION_SCOPE, **fields))


def _projection(writer):
    return _run(GuardrailPort(writer).projection(MANSION))


def test_spec_writes_are_atomic_revisioned_and_leave_canonical_evidence(world):
    _root, mansion, _outside = world
    access, writer, _f = _access(world)
    document = mansion / spec_path("requirements")
    assert _write(access, b"# R1\n", 0).code == "invalid_state"
    _working(writer)

    first = _write(access, b"# R1\n", 0)
    assert (first.status, first.code) == ("written", "ok")
    assert first.artifact_revision == ArtifactRevision(1, _sha(b"# R1\n"), 5)
    assert document.read_bytes() == b"# R1\n"
    assert _kinds(writer)[-2:] == ["spec_write_prepared", "spec_document_written"]
    assert [event.sequence for event in first.events] == [3, 4]
    # Prepared is acknowledged by compare-and-append before the replacement.
    assert writer.calls[-2:] == [("cas", 2, 1), ("append", None, 1)]
    assert b"# R1" not in repr(writer.events).encode()
    assert _projection(writer).documents[spec_path("requirements")] == first.artifact_revision

    # A stale revision conflicts without replacing the file.
    stale = _write(access, b"# stale\n", 0)
    assert (stale.status, stale.code, stale.artifact_revision) == (
        "conflict", "stale_revision", first.artifact_revision)
    assert document.read_bytes() == b"# R1\n" and len(writer.events) == 4

    # Wrong role or wrong document is denied with evidence and no change.
    for overrides in ({"role": "tinker"}, {"role": "draughtsman"}, {"phase": Phase.DESIGN}):
        denied = _write(access, b"# nope\n", 1, **overrides)
        assert (denied.status, denied.code) == ("denied", "room_policy")
        assert denied.events[0].payload["kind"] == "path_denied"
    assert document.read_bytes() == b"# R1\n"
    assert not (mansion / spec_path("design")).exists()
    assert _write(access, b"x", 1, role="poltergeist").status == "blocked"
    assert _write(access, b"x", 1, phase=Phase.IMPLEMENTATION).status == "blocked"

    # An edit outside the house makes the next write conflict.
    document.write_bytes(b"# edited elsewhere\n")
    assert _write(access, b"# R2\n", 1).code == "artifact_mismatch"
    document.write_bytes(b"# R1\n")
    second = _write(access, b"# R2\n", 1)
    assert second.status == "written" and second.artifact_revision.revision == 2
    assert _projection(writer).diagnostics == ()


def test_editing_a_proposed_document_supersedes_the_door_proposal(world):
    access, writer, _f = _access(world)
    _working(writer)
    first = _write(access, b"# R1\n", 0)
    projection = _projection(writer)
    submit = decide_transition(projection, SubmitOutput(
        SESSION_SCOPE, Phase.REQUIREMENTS, "door-1", spec_path("requirements"), first.artifact_revision))
    assert _run(GuardrailPort(writer).compare_and_append(MANSION, submit.expected_sequence, submit.candidates)).ok
    assert _projection(writer).phases[Phase.REQUIREMENTS].door is DoorStatus.WAITING

    second = _write(access, b"# R2\n", 1)
    assert second.status == "written"
    assert [event.payload["kind"] for event in second.events] == [
        "spec_write_prepared", "spec_document_written", "door_superseded"]
    view = _projection(writer).phases[Phase.REQUIREMENTS]
    assert (view.status, view.door, view.proposal.status) == (
        PhaseStatus.WORKING, DoorStatus.SEALED, "superseded")
    assert _projection(writer).diagnostics == ()


def test_fault_before_the_prepared_record_changes_nothing(world):
    _root, mansion, _outside = world
    access, writer, _f = _access(world)
    _working(writer)
    document = mansion / spec_path("requirements")

    writer.fail_next.append("failed")
    blocked = _write(access, b"# R1\n", 0)
    assert (blocked.status, blocked.code) == ("blocked", "writer_unavailable")
    writer.fail_next.append("conflict")
    conflict = _write(access, b"# R1\n", 0)
    assert (conflict.status, conflict.code) == ("conflict", "stale_version")
    assert not document.exists() and _kinds(writer) == ["phase_start_reserved", "phase_started"]


@pytest.mark.parametrize("seam", ["_write_temporary", "_replace"])
def test_fault_during_replacement_is_settled_as_not_applied(world, seam, monkeypatch):
    _root, mansion, _outside = world
    access, writer, fs = _access(world)
    _working(writer)
    _write(access, b"# R1\n", 0)
    document = mansion / spec_path("requirements")

    monkeypatch.setattr(fs, seam, lambda *a: (_ for _ in ()).throw(OSError(5, "io")))
    failed = _write(access, b"# R2\n", 1)
    assert (failed.status, failed.code) == ("conflict", "filesystem_error")
    assert document.read_bytes() == b"# R1\n"
    assert sorted(p.name for p in document.parent.iterdir()) == ["requirements.md"]
    assert _kinds(writer)[-2:] == ["spec_write_prepared", "spec_write_recovered"]
    assert writer.events[-1].payload["data"]["outcome"] == "not_applied"
    projection = _projection(writer)
    assert not projection.pending_writes and projection.diagnostics == ()
    assert projection.documents[spec_path("requirements")].revision == 1

    monkeypatch.undo()
    assert _write(access, b"# R2\n", 1).status == "written"


def test_crash_between_prepare_and_replace_recovers_as_not_applied(world):
    _root, mansion, _outside = world
    access, writer, _f = _access(world)
    _working(writer)
    _write(access, b"# R1\n", 0)
    # The process died right after the prepared record was acknowledged.
    crashed = ge.spec_write_prepared(
        SESSION_SCOPE, write_id="write-crash", phase=Phase.REQUIREMENTS,
        document_path=spec_path("requirements"), base_revision=1, base_sha256=_sha(b"# R1\n"),
        revision=2, sha256=_sha(b"# R2\n"), size_bytes=5)
    assert _run(GuardrailPort(writer).append(MANSION, [crashed])).ok
    assert "write-crash" in _projection(writer).pending_writes
    assert _write(access, b"# R3\n", 1).code == "write_pending"

    fresh, _w, _f2 = _access(world, writer)
    results = _run(fresh.recover_spec_writes(SESSION_SCOPE))
    assert [(r.write_id, r.outcome) for r in results] == [("write-crash", "not_applied")]
    projection = _projection(writer)
    assert not projection.pending_writes
    assert projection.documents[spec_path("requirements")].revision == 1
    assert (mansion / spec_path("requirements")).read_bytes() == b"# R1\n"
    assert _run(fresh.recover_spec_writes(SESSION_SCOPE)) == ()


def test_crash_between_replace_and_completion_blocks_the_door_until_recovered(world):
    _root, mansion, _outside = world
    access, writer, _f = _access(world)
    _working(writer)
    # Prepared is acknowledged; the completion append is lost.
    writer.fail_next.extend(["", "failed"])
    lost = _write(access, b"# R1\n", 0)
    assert (lost.status, lost.code) == ("uncertain", "completion_unacknowledged")
    assert (mansion / spec_path("requirements")).read_bytes() == b"# R1\n"
    projection = _projection(writer)
    assert len(projection.pending_writes) == 1
    assert spec_path("requirements") not in projection.documents

    # No Door proposal can be made for a document whose write is unsettled.
    submit = decide_transition(projection, SubmitOutput(
        SESSION_SCOPE, Phase.REQUIREMENTS, "door-1", spec_path("requirements"),
        ArtifactRevision(1, _sha(b"# R1\n"), 5)))
    assert (submit.ok, submit.code) == (False, "write_pending")

    fresh, _w, _f2 = _access(world, writer)
    (result,) = _run(fresh.recover_spec_writes(SESSION_SCOPE))
    assert result.outcome == "completed"
    assert _kinds(writer)[-1] == "spec_write_recovered"
    projection = _projection(writer)
    assert projection.documents[spec_path("requirements")] == ArtifactRevision(1, _sha(b"# R1\n"), 5)
    assert not projection.pending_writes and projection.diagnostics == ()
    assert decide_transition(projection, SubmitOutput(
        SESSION_SCOPE, Phase.REQUIREMENTS, "door-1", spec_path("requirements"),
        ArtifactRevision(1, _sha(b"# R1\n"), 5))).ok


def test_an_unrecognized_artifact_is_recorded_as_uncertain_until_it_can_be_settled(world):
    _root, mansion, _outside = world
    access, writer, _f = _access(world)
    _working(writer)
    writer.fail_next.extend(["", "failed"])
    _write(access, b"# R1\n", 0)
    document = mansion / spec_path("requirements")
    document.write_bytes(b"# neither base nor new\n")

    (result,) = _run(access.recover_spec_writes(SESSION_SCOPE))
    assert result.outcome == "uncertain"
    assert _kinds(writer)[-1] == "spec_write_uncertain"
    assert writer.events[-1].payload["data"]["code"] == "digest_mismatch"
    (pending,) = _projection(writer).pending_writes.values()
    assert pending.uncertain

    # A link in place of the document is uncertain too, and is never followed.
    document.unlink()
    document.symlink_to(mansion / "src" / "app.py")
    (result,) = _run(access.recover_spec_writes(SESSION_SCOPE))
    assert result.outcome == "uncertain"

    # Evidence that cannot be acknowledged is reported, not assumed.
    writer.fail_next.append("failed")
    document.unlink()
    document.write_bytes(b"# R1\n")
    (result,) = _run(access.recover_spec_writes(SESSION_SCOPE))
    assert result.outcome == "unrecorded"
    (result,) = _run(access.recover_spec_writes(SESSION_SCOPE))
    assert result.outcome == "completed"
    assert not _projection(writer).pending_writes


def test_guarded_access_works_against_the_real_canonical_writer(world):
    root, mansion, _outside = world
    store = SeanceLogStore(root, clock_ms=lambda: 1_731_400_000_000)
    access = GuardedRoomAccess(_fs(world), GuardrailPort(store))
    _working(store)
    result = _write(access, b"# Requirements\n", 0)
    assert result.status == "written"
    with pytest.raises(GuardedFilesystemError):
        _run(access.read_file(SESSION_SCOPE, TINKER, _CONTROL + "/seance/anything"))
    read = _run(GuardrailPort(store).read(MANSION))
    assert read.integrity == "valid"
    assert [r.kind.value for r in read.domain.records] == [
        "phase_start_reserved", "phase_started", "spec_write_prepared",
        "spec_document_written", "path_denied"]
    # The only file the evidence path created is Spec 2's own log.
    control = sorted(p.relative_to(mansion).as_posix() for p in (mansion / _CONTROL).rglob("*") if p.is_file())
    assert len(control) == 1 and control[0].endswith(".jsonl")


def test_the_adapter_never_opens_the_log_or_follows_a_link():
    source = Path(module.__file__).read_text(encoding="utf-8")
    assert "follow_symlinks=True" not in source
    assert "shutil" not in source and "rmtree" not in source
    assert "open(" not in source.replace("os.open(", "")
    assert source.count("os.open(") == 5
    for line in source.splitlines():
        if "os.open(" in line and "_DIRECTORY_FLAGS" not in line:
            assert "_READ_FLAGS" in line or "_CREATE_FLAGS" in line, line
