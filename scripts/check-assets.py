#!/usr/bin/env python3
"""Asset provenance and media-source check for the submission package.

Usage (plain python3, standard library only):
  python3 scripts/check-assets.py
      check docs/assets-manifest.json against the distributed media files and
      scan the UI source and the committed bundle

It reports
  - schema and provenance errors in docs/assets-manifest.json;
  - an image, audio or video file under app/ or docs/ with no manifest entry,
    and a manifest entry whose file is missing;
  - any audio file (the MVP ships no sound);
  - in app/ui/src, app/ui/replay (tests excluded), app/ui/dist and every
    distributed .svg: external SVG images or uses, remote media/font/style
    URLs, raster data URIs, SVG script or animation elements, audio APIs or
    imports, and prohibited product names.

Output
  One line per finding, sorted: `<file>:<line>: <category>`. For the manifest,
  `<line>` is the entry number. The matched text is never printed. Nothing is
  written. A human originality review is still required
  (docs/assets-checklist.md); a static scan cannot prove authorship.

Exit codes
  0 clean, 1 findings, 2 usage error (missing or unreadable manifest)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))

from asset_contract import (  # noqa: E402
    AssetFinding,
    check_coverage,
    is_media_path,
    scan_source,
    validate_manifest,
)

REPO_ROOT = Path(__file__).resolve().parents[1]
MANIFEST = "docs/assets-manifest.json"
# Where distributed media may live.
MEDIA_ROOTS = ("app", "docs")
# Source and bundle text that ships to a judge.
SOURCE_ROOTS = ("app/ui/src", "app/ui/replay", "app/ui/dist")
SOURCE_EXTENSIONS = frozenset({".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".html", ".svg"})
SKIPPED_FOLDERS = frozenset({"node_modules", "dist-replay", "__pycache__", ".venv", ".git", ".pytest_cache", ".hypothesis"})
# Test-only source is not distributed in a bundle.
TEST_FOLDERS = frozenset({"test", "tests", "scripts-tests", "__tests__"})
MAX_TEXT_BYTES = 8 * 1024 * 1024


def _walk(root: Path, start: str) -> list[str]:
    """Repository-relative POSIX paths of every file under `start`. Links are not followed."""

    base = root / start
    if not base.is_dir():
        return []
    paths: list[str] = []
    for folder, folders, names in os.walk(base, followlinks=False):
        folders[:] = sorted(name for name in folders if name not in SKIPPED_FOLDERS)
        for name in sorted(names):
            paths.append((Path(folder) / name).relative_to(root).as_posix())
    return paths


def _is_test_source(path: str) -> bool:
    parts = path.split("/")
    name = parts[-1]
    return ".test." in name or name.startswith("test-setup.") or any(part in TEST_FOLDERS for part in parts[:-1])


def media_files(root: Path) -> list[str]:
    return sorted({path for start in MEDIA_ROOTS for path in _walk(root, start) if is_media_path(path)})


def source_files(root: Path) -> list[str]:
    found = {
        path
        for start in SOURCE_ROOTS
        for path in _walk(root, start)
        if Path(path).suffix.lower() in SOURCE_EXTENSIONS and not _is_test_source(path)
    }
    # An SVG anywhere in the distributed tree is markup that can load or run things.
    found.update(path for path in media_files(root) if path.lower().endswith(".svg"))
    return sorted(found)


def check(root: Path, manifest: str = MANIFEST) -> tuple[list[AssetFinding], int, int]:
    """Every finding, plus how many media and source files were examined."""

    data = json.loads((root / manifest).read_text(encoding="utf-8"))
    media = media_files(root)
    sources = source_files(root)
    found: set[AssetFinding] = set(validate_manifest(data, manifest))
    found.update(check_coverage(data, media, where=manifest))
    for path in sources:
        raw = (root / path).read_bytes()
        if len(raw) > MAX_TEXT_BYTES:
            continue
        found.update(scan_source(path, raw.decode("utf-8", errors="replace")))
    return sorted(found), len(media), len(sources)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", type=Path, default=REPO_ROOT, help="repository root (default: this repository)")
    args = parser.parse_args(argv)

    root = args.root.resolve()
    if not (root / MANIFEST).is_file():
        print(f"check-assets: {MANIFEST} is missing.", file=sys.stderr)
        return 2
    try:
        findings, media_count, source_count = check(root)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        print(f"check-assets: {MANIFEST} is not readable JSON.", file=sys.stderr)
        return 2

    for finding in findings:
        print(finding)
    if findings:
        print(f"check-assets: {len(findings)} finding(s).", file=sys.stderr)
        return 1
    print(f"check-assets: {media_count} media file(s) have provenance; {source_count} source file(s) are clean.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
