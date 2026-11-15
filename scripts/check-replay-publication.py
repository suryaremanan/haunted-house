#!/usr/bin/env python3
"""Publication_Gate for the replay fixture and the static replay build.

Usage (needs Python 3.12, e.g. the repo's .venv):
  .venv/bin/python scripts/check-replay-publication.py
      check fixtures/replay/demo.jsonl
  .venv/bin/python scripts/check-replay-publication.py --artifact app/ui/dist-replay
      also check a built replay folder against that fixture

The fixture must be the canonical bytes of supported Spec 2 records with an
intact Sequence and hash chain. Fixture and build must hold no credential,
encoded credential, absolute home path or localhost origin. The build must
also consist of regular, singly linked files, reference only files inside
itself by relative URL, load nothing remote, contain no live transport,
service worker or Crew SDK import, and carry the fixture byte for byte.

Output
  One line per finding, sorted: `<file>:<line>: <category>`. The matched text
  is never printed. Nothing is written and nothing is published by this script.

Exit codes
  0 accepted, 1 findings (no artifact is accepted), 2 usage error
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))

from publication_contract import classify_publication  # noqa: E402
from publication_io import ARTIFACT, FIXTURE, REPO_ROOT, fixture_codec, load_scanner, read_artifact  # noqa: E402


def _shown(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return path.name


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--fixture", type=Path, default=FIXTURE, help="the committed replay Event_Log")
    parser.add_argument(
        "--artifact",
        type=Path,
        nargs="?",
        const=ARTIFACT,
        default=None,
        help="a built replay folder to check too (default path: app/ui/dist-replay)",
    )
    args = parser.parse_args(argv)

    if not args.fixture.is_file():
        print(f"check-replay-publication: {_shown(args.fixture)} is not a file.", file=sys.stderr)
        return 2
    if args.artifact is not None and not args.artifact.is_dir():
        print(f"check-replay-publication: {_shown(args.artifact)} is not a folder; build the replay first.", file=sys.stderr)
        return 2

    fixture = args.fixture.read_bytes()
    report = classify_publication(
        fixture_path=_shown(args.fixture),
        fixture=fixture,
        codec=fixture_codec(fixture),
        scan=load_scanner().scan_text,
        artifact=None if args.artifact is None else read_artifact(args.artifact),
    )
    for finding in report.findings:
        print(finding)
    if not report.accepted:
        print(f"check-replay-publication: {len(report.findings)} finding(s); nothing is accepted.", file=sys.stderr)
        return 1
    print(f"check-replay-publication: accepted {len(report.accepted_paths)} file(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
