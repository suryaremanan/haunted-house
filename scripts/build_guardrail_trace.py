#!/usr/bin/env python3
"""Build fixtures/guardrails/safety-trace.events.jsonl.

Usage (needs Python 3.12 with aiohttp, e.g. the repo's .venv):
  .venv/bin/python scripts/build_guardrail_trace.py           write the fixture
  .venv/bin/python scripts/build_guardrail_trace.py --check   exit 1 if it is stale

The trace is synthetic and deterministic; see app/backend/tests/guardrail_trace.py.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import tempfile
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1] / "app" / "backend"
sys.path.insert(0, str(BACKEND))

from tests.guardrail_trace import FIXTURE, build_trace  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail if the fixture is stale")
    arguments = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="hh-trace-") as tmp:
        built = asyncio.run(build_trace(Path(tmp)))
    if arguments.check:
        current = FIXTURE.read_bytes() if FIXTURE.exists() else b""
        if current != built:
            print(f"{FIXTURE.name} is stale; run scripts/build_guardrail_trace.py")
            return 1
        return 0
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_bytes(built)
    print(f"wrote {FIXTURE.name}: {built.count(10)} records")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
