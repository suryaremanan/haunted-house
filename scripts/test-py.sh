#!/usr/bin/env bash
# Run the Python tests (pytest + Hypothesis) in the repo's .venv.
# Creates .venv with Python 3.12 on first run and keeps it in sync with
# requirements-dev.txt. Extra arguments go to pytest, for example:
#   scripts/test-py.sh -m core
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

venv_dir=".venv"
venv_python="$venv_dir/bin/python"

if ! command -v uv >/dev/null 2>&1; then
  echo "test-py: uv is not installed. Install it (https://docs.astral.sh/uv/) and run this again." >&2
  exit 1
fi

if [[ ! -x "$venv_python" ]]; then
  echo "test-py: creating $venv_dir with Python 3.12" >&2
  uv venv --python 3.12 "$venv_dir"
fi

uv pip install --quiet --python "$venv_python" -r requirements-dev.txt

exec "$venv_dir/bin/pytest" "$@"
