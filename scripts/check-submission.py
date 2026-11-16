#!/usr/bin/env python3
"""Check the Submission Document Set (Publication Gate for documents).

Usage (plain python3, standard library only; from any directory):
  python3 scripts/check-submission.py
      check README.md, docs/writeup.md, docs/kiro-coverage.md,
      docs/demo-script.md, docs/credits.md, docs/assets-checklist.md,
      docs/submission-checklist.md and the JSON evidence records
  python3 scripts/check-submission.py --release
      also refuse anything still pending: unverified publication metadata,
      an open checklist row, a pending screenshot, an MVP coverage row that
      is not complete. Use this on submission day.

It checks required files and headings, relative links, the one Install
Command, the minimum Crew version against app/app.json and the install script,
the trust steps, the Kiro Coverage Table columns, the demo time markers and
total duration, the asset and submission checklists, the dated milestones, the
publication metadata and that no unverified repository or Pages URL appears.

It never runs or expands a documented command, follows no URL and writes
nothing. Evidence marked pending is accepted without --release, so the
documents can be gated before the public repository and media exist.

Output
  One line per finding, sorted: `<file>:<line>: <category>[: <element>]`.

Exit codes
  0 accepted, 1 findings, 2 usage error
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))

from submission_contract import (  # noqa: E402
    ASSETS_MANIFEST,
    HEADINGS,
    INSTALL_SCRIPT,
    PUBLICATION_METADATA,
    check_document_set,
    check_release_ready,
)

NAME = "check-submission"
REPO_ROOT = Path(__file__).resolve().parents[1]
READ = tuple(HEADINGS) + (ASSETS_MANIFEST, PUBLICATION_METADATA, INSTALL_SCRIPT, "app/app.json")
MAX_BYTES = 2 * 1024 * 1024


def read_repository(root: Path) -> tuple[dict[str, str | None], "callable"]:
    """The texts the contract reads, and an existence test confined to `root`."""

    resolved_root = root.resolve()

    def inside(relative: str) -> Path | None:
        if relative.startswith(("/", "\\")) or "\\" in relative or ".." in Path(relative).parts:
            return None
        return resolved_root / relative

    def exists(relative: str) -> bool:
        path = inside(relative)
        return path is not None and path.exists()

    files: dict[str, str | None] = {}
    for relative in READ:
        path = inside(relative)
        if path is None or not path.is_file() or path.stat().st_size > MAX_BYTES:
            files[relative] = None
            continue
        try:
            files[relative] = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            files[relative] = None
    return files, exists


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--release", action="store_true", help="also refuse anything still pending")
    parser.add_argument("--root", type=Path, default=REPO_ROOT, help="repository root (default: this repository)")
    args = parser.parse_args(argv)
    if not args.root.is_dir():
        print(f"{NAME}: the repository root is not a folder.", file=sys.stderr)
        return 2

    files, exists = read_repository(args.root)
    findings = list(check_document_set(files, exists))
    pending = list(check_release_ready(files))
    if args.release:
        findings = sorted({*findings, *pending})
    for finding in findings:
        print(finding)
    if findings:
        print(f"{NAME}: {len(findings)} finding(s); the documents are not accepted.", file=sys.stderr)
        return 1
    if pending:
        print(f"{NAME}: accepted; {len(pending)} item(s) are still pending and block a readiness claim (run with --release to list them).")
    else:
        print(f"{NAME}: accepted; nothing is pending.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
