#!/usr/bin/env python3
"""Permission freeze check for the judge-facing manifest (RS-S2, Requirement 8).

Usage (needs the backend's Python 3.12 with aiohttp; from the repo root):
  .venv/bin/python scripts/check-permission-freeze.py --check
      compare the implementation inventory, app/app.json and
      docs/permission-freeze.json (the default action)
  .venv/bin/python scripts/check-permission-freeze.py --check --readme
      also require the README trust copy: a link to
      docs/permission-freeze.json and every permissions.api path in backticks
  .venv/bin/python scripts/check-permission-freeze.py --write-reviewed
      after a human review of app/app.json: write docs/permission-freeze.json
      and spikes/fixtures/replay-permission-inventory.json. Refused unless
      the inventory and the manifest already agree.

CI runs `python scripts/check-permission-freeze.py --check` in the `python`
job, after the test dependencies are installed.

The inventory is read from the backend's central constants (gateway routes,
chat grants, mapped Crew event names, app data directory, owned-session
approval call) and the install script's Crew floor. Nothing here edits
app/app.json, enables or trusts the app, approves a permission, changes a
Crew setting or contacts a gateway.

A permission change after the freeze needs a new app version, updated README
trust copy and a newly reviewed record (`--write-reviewed`).

Output
  One line per finding, sorted: `<field or file>: <category>`. Manifest
  values are never printed.

Exit codes
  0 accepted (or record written), 1 findings (nothing is written), 2 usage error
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))

from permission_freeze import (  # noqa: E402
    build_freeze_record,
    check_freeze_state,
    check_inventory,
    check_manifest,
    check_readme,
    render_freeze_record,
)
import permission_io as io  # noqa: E402

NAME = "check-permission-freeze"


def _fail(findings) -> int:
    for finding in findings:
        print(finding)
    print(f"{NAME}: {len(findings)} finding(s); the freeze is not accepted.", file=sys.stderr)
    return 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="check only (default)")
    mode.add_argument("--write-reviewed", action="store_true", help="write the reviewed freeze record and RS-S2 inventory")
    parser.add_argument("--readme", action="store_true", help="also require the README trust copy")
    parser.add_argument("--manifest", type=Path, default=io.MANIFEST)
    parser.add_argument("--record", type=Path, default=io.FREEZE_RECORD)
    parser.add_argument("--readme-file", type=Path, default=io.README)
    parser.add_argument("--inventory-fixture", type=Path, default=io.INVENTORY_FIXTURE)
    args = parser.parse_args(argv)

    if not args.manifest.is_file():
        print(f"{NAME}: the manifest is not a file.", file=sys.stderr)
        return 2
    manifest_bytes = args.manifest.read_bytes()
    try:
        manifest = json.loads(manifest_bytes)
    except ValueError:
        print(f"{NAME}: the manifest is not JSON.", file=sys.stderr)
        return 2
    readme = None
    if args.readme:
        readme = io.read_text(args.readme_file)
        if readme is None:
            print(f"{NAME}: the README is not a file.", file=sys.stderr)
            return 2
    inventory = io.load_inventory()

    if args.write_reviewed:
        findings = sorted({*check_inventory(inventory), *check_manifest(manifest, inventory)})
        if readme is not None and not findings:
            findings = check_readme(readme, manifest["permissions"])
        report = io.inventory_report(inventory, manifest)
        if findings or report["result"] != "pass":
            if report["result"] != "pass":
                print("inventory: rs-s2-inventory-failed")
            return _fail(findings)
        args.record.parent.mkdir(parents=True, exist_ok=True)
        args.record.write_text(render_freeze_record(build_freeze_record(manifest, manifest_bytes)), encoding="utf-8")
        args.inventory_fixture.write_text(io.render_report(report), encoding="utf-8")
        print(f"{NAME}: wrote the reviewed freeze record and the RS-S2 inventory.")
        return 0

    findings = list(
        check_freeze_state(
            inventory=inventory,
            manifest=manifest,
            manifest_bytes=manifest_bytes,
            record_text=io.read_text(args.record),
            readme_text=readme,
        )
    )
    stale_inventory = io.read_text(args.inventory_fixture) != io.render_report(io.inventory_report(inventory, manifest))
    if stale_inventory:
        print("spikes/fixtures/replay-permission-inventory.json: rs-s2-inventory-stale")
    if findings or stale_inventory:
        return _fail(findings) if findings else 1
    print(f"{NAME}: accepted; the manifest, the inventory and the freeze record agree.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
