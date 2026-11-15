#!/usr/bin/env bash
# Run every test suite: Python (pytest + Hypothesis), then TypeScript
# (Vitest + fast-check, only once app/ui exists). Both suites run even if the
# first fails; the script exits non-zero if either failed.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

status=0

scripts/test-py.sh || status=1

if [[ -f app/ui/package.json ]]; then
  if [[ ! -d app/ui/node_modules ]]; then
    npm --prefix app/ui ci
  fi
  npm --prefix app/ui test || status=1
else
  echo "test-all: app/ui/package.json not found, skipping the TypeScript tests" >&2
fi

exit "$status"
