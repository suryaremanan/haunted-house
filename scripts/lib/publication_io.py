"""Adapters for the Publication_Gate: the scanner, the Spec 2 parser and the build folder.

scripts/lib/publication_contract.py is pure. This module supplies its three
ports from the repository:

  load_scanner()    scripts/secret_scan.py, the one credential rule table
  fixture_codec()   the backend's Canonical_Parser and canonical serializer
  read_artifact()   one build folder as plain file facts (lstat, never followed)

It writes nothing and starts no process.
"""

from __future__ import annotations

import importlib.util
import os
import stat
import sys
from pathlib import Path
from types import ModuleType

REPO_ROOT = Path(__file__).resolve().parents[2]
LIB_DIR = Path(__file__).resolve().parent
if str(LIB_DIR) not in sys.path:
    sys.path.insert(0, str(LIB_DIR))

from publication_contract import ArtifactFile, CanonicalLine, FixtureCodec  # noqa: E402

FIXTURE = REPO_ROOT / "fixtures" / "replay" / "demo.jsonl"
ARTIFACT = REPO_ROOT / "app" / "ui" / "dist-replay"
# Larger than any file of a replay build; a bigger file is reported, not read.
MAX_FILE_BYTES = 16 * 1024 * 1024


def load_scanner() -> ModuleType:
    """scripts/secret_scan.py as a module, loaded once."""

    if "secret_scan" in sys.modules:
        return sys.modules["secret_scan"]
    spec = importlib.util.spec_from_file_location("secret_scan", REPO_ROOT / "scripts" / "secret_scan.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["secret_scan"] = module  # dataclasses look the module up here
    spec.loader.exec_module(module)
    return module


def fixture_codec(data: bytes) -> FixtureCodec:
    """What the Spec 2 Canonical_Parser and serializer say about fixture bytes."""

    backend = str(REPO_ROOT / "app" / "backend")
    if backend not in sys.path:
        sys.path.insert(0, backend)
    from haunted_house.core.seance_log_parser import parse_event_line, parse_event_log, split_log_lines
    from haunted_house.core.seance_persistence import WriterDiagnostic, serialize_app_event

    lines = []
    for number, raw in enumerate(split_log_lines(data), start=1):
        parsed = parse_event_line(raw, number)
        if isinstance(parsed, WriterDiagnostic):
            lines.append(CanonicalLine(number, None))
        else:
            lines.append(CanonicalLine(number, serialize_app_event(parsed), parsed.scope.mansion_id))
    log = parse_event_log(data)
    return FixtureCodec(lines=tuple(lines), integrity_line=log.integrity_failure_line, record_count=len(log.events))


def read_artifact(root: Path) -> list[ArtifactFile]:
    """Every entry under `root` as facts. Links are reported, never followed."""

    files: list[ArtifactFile] = []
    for folder, folders, names in os.walk(root, followlinks=False):
        folders.sort()
        # A linked folder is an entry of its own: os.walk lists it and does not descend.
        entries = sorted(names) + [name for name in folders if os.path.islink(os.path.join(folder, name))]
        for name in entries:
            full = os.path.join(folder, name)
            relative = Path(full).relative_to(root).as_posix()
            info = os.lstat(full)
            if stat.S_ISLNK(info.st_mode):
                files.append(ArtifactFile(relative, kind="symlink"))
            elif not stat.S_ISREG(info.st_mode) or info.st_size > MAX_FILE_BYTES:
                files.append(ArtifactFile(relative, kind="other"))
            else:
                with open(full, "rb") as handle:
                    files.append(ArtifactFile(relative, link_count=info.st_nlink, data=handle.read()))
    return sorted(files, key=lambda file: file.path)
