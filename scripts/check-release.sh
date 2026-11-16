#!/usr/bin/env bash
# One offline release check for Haunted House (replay-and-submission task
# 10.1; Requirements 6.5, 6.7, 7.5, 8.7, 9.9, 9.10, 10.6, 11.8).
#
# Usage: scripts/check-release.sh [--strict] [--list] [--only <step>]... [--help]
#
# Runs every release gate in order, shows each command's own output, and ends
# with one line per step: PASS, FAIL, or SKIP (a needed tool is missing; this
# counts as a failure). Every step runs even when an earlier one failed, so one
# run shows everything that is wrong.
#
# After the gates it lists what is still pending by design: publication
# metadata, screenshots, the video and open checklist rows. Pending items are
# not failures. They block a readiness claim, and --strict turns them into a
# failure for submission day.
#
# The UI steps use bun, like CI and scripts/test-all.sh: bun runs the app/ui
# package scripts (vitest, vite and tsc still start on Node, so node is needed
# too) and the repository's .mjs scripts. Set RELEASE_UI_RUNNER=npm to run the
# same package scripts with npm and the .mjs scripts with node.
#
# This script is offline. It contacts no Crew gateway, GitHub, Pages site or
# registry, and it never installs, enables or trusts the app, approves a
# permission, pushes, deploys or submits anything. It builds app/ui/dist and
# app/ui/dist-replay in place; a deterministic build leaves app/ui/dist
# byte-for-byte unchanged, and the live-bundle step fails if it does not.
#
# Exit status:
#   0  every gate passed (pending items may remain unless --strict)
#   1  at least one gate failed or was skipped, or --strict found pending items
#   2  unknown command-line argument or step name
# Each step_<id> function is called by name from the run loop.
# shellcheck disable=SC2329
set -uo pipefail

prog="check-release"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT" || exit 2

STEP_TIMEOUT_SECONDS="${RELEASE_STEP_TIMEOUT_SECONDS:-900}"
UI_RUNNER="${RELEASE_UI_RUNNER:-bun}"
VENV_PYTHON=".venv/bin/python"

# Step ids in run order. Each id has a function step_<id with _ for ->.
STEPS=(
  python-tests
  ui-typecheck
  ui-tests
  smoke-script-tests
  live-build
  bundle-imports
  live-bundle-fresh
  replay-build
  replay-artifact
  replay-smoke
  replay-fixture
  guardrail-fixture
  fixture-publication
  kiro-tracked
  secret-scan
  shellcheck
  permission-freeze
  assets
  submission
)

describe() {
  case $1 in
    python-tests) echo "Python tests: backend, manifest, profiles, skills, scripts (pytest, Hypothesis)" ;;
    ui-typecheck) echo "UI type check (tsc)" ;;
    ui-tests) echo "UI tests: replay properties, DOM parity, transport traps (Vitest, fast-check)" ;;
    smoke-script-tests) echo "Smoke script tests (node:test suite)" ;;
    live-build) echo "Live UI build (app/ui/dist)" ;;
    bundle-imports) echo "Live bundle imports only host modules" ;;
    live-bundle-fresh) echo "Live bundle is unchanged by a fresh build" ;;
    replay-build) echo "Static replay build (app/ui/dist-replay)" ;;
    replay-artifact) echo "Replay Publication Gate: structure, references, credentials, transports" ;;
    replay-smoke) echo "Local static replay smoke (loopback, one shot)" ;;
    replay-fixture) echo "Replay fixture equals a fresh canonical generation" ;;
    guardrail-fixture) echo "Guardrail trace fixture equals a fresh generation" ;;
    fixture-publication) echo "Replay fixture Publication Gate" ;;
    kiro-tracked) echo ".kiro is tracked, not ignored" ;;
    secret-scan) echo "Secret and home-path scan" ;;
    shellcheck) echo "shellcheck on scripts/*.sh" ;;
    permission-freeze) echo "Permission freeze: code, manifest, record, README" ;;
    assets) echo "Asset provenance and media sources" ;;
    submission) echo "Submission documents" ;;
    *) return 1 ;;
  esac
}

usage() {
  sed -n '2,31p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

strict=0
only=()
while (($#)); do
  case $1 in
    --strict) strict=1 ;;
    --list)
      for id in "${STEPS[@]}"; do printf '%-20s %s\n' "$id" "$(describe "$id")"; done
      exit 0
      ;;
    --only)
      shift
      if ((!$#)) || ! describe "$1" >/dev/null; then
        printf '%s: --only needs a step name; see --list.\n' "$prog" >&2
        exit 2
      fi
      only+=("$1")
      ;;
    --help | -h)
      usage
      exit 0
      ;;
    *)
      printf '%s: unknown argument. Usage: scripts/check-release.sh [--strict] [--list] [--only <step>]... [--help]\n' "$prog" >&2
      exit 2
      ;;
  esac
  shift
done

case $UI_RUNNER in
  bun | npm) ;;
  *)
    printf '%s: RELEASE_UI_RUNNER must be bun or npm.\n' "$prog" >&2
    exit 2
    ;;
esac
case $STEP_TIMEOUT_SECONDS in
  '' | *[!0-9]* | 0)
    printf '%s: RELEASE_STEP_TIMEOUT_SECONDS must be a positive whole number.\n' "$prog" >&2
    exit 2
    ;;
esac

# ---- helpers ------------------------------------------------------------------

# 97: a tool this step needs is missing. The step is reported as SKIP.
MISSING_TOOL=97

need() {
  local tool
  for tool in "$@"; do
    if ! command -v "$tool" >/dev/null 2>&1 && [[ ! -x $tool ]]; then
      printf '%s: %s is not installed or not found.\n' "$prog" "$tool" >&2
      return "$MISSING_TOOL"
    fi
  done
}

# Run one package script of app/ui with the chosen runner.
ui_script() {
  if [[ $UI_RUNNER == bun ]]; then
    need bun || return
    bun run --cwd app/ui "$1"
  else
    need npm || return
    npm --prefix app/ui run "$1"
  fi
}

# Run one repository .mjs script with the chosen runner's JavaScript runtime.
js_script() {
  if [[ $UI_RUNNER == bun ]]; then
    need bun || return
    bun "$@"
  else
    need node || return
    node "$@"
  fi
}

# Run one node:test file with the chosen runner (bun test runs node:test suites).
js_tests() {
  if [[ $UI_RUNNER == bun ]]; then
    need bun || return
    bun test "./$1"
  else
    need node || return
    node --test "$1"
  fi
}

ui_ready() {
  # vitest, vite and tsc start on Node with either runner.
  need node || return
  if [[ ! -d app/ui/node_modules ]]; then
    printf '%s: app/ui/node_modules is missing. Install the UI dependencies first; this script installs nothing.\n' "$prog" >&2
    return "$MISSING_TOOL"
  fi
}

digest_tree() {
  # One digest of every file under a folder: content hashes with relative paths.
  python3 - "$1" <<'PY'
import hashlib, os, sys
root = sys.argv[1]
digest = hashlib.sha256()
for folder, folders, names in os.walk(root):
    folders.sort()
    for name in sorted(names):
        path = os.path.join(folder, name)
        digest.update(os.path.relpath(path, root).encode() + b"\0")
        with open(path, "rb") as handle:
            digest.update(hashlib.sha256(handle.read()).digest())
print(digest.hexdigest())
PY
}

# ---- steps ----------------------------------------------------------------------

step_python_tests() {
  need uv || return
  CI="${CI:-}" scripts/test-py.sh -q
}

step_ui_typecheck() {
  ui_ready || return
  ui_script typecheck
}

step_ui_tests() {
  ui_ready || return
  ui_script test
}

step_smoke_script_tests() {
  js_tests scripts-tests/smoke-replay-site.test.mjs
}

LIVE_DIGEST_BEFORE=""
LIVE_BUILD_STATUS=1

step_live_build() {
  ui_ready || return
  need python3 || return
  LIVE_DIGEST_BEFORE="$(digest_tree app/ui/dist 2>/dev/null || true)"
  ui_script build
  LIVE_BUILD_STATUS=$?
  return "$LIVE_BUILD_STATUS"
}

step_bundle_imports() {
  ui_ready || return
  js_script scripts/check-bundle-imports.mjs
}

step_live_bundle_fresh() {
  need python3 || return
  if ((LIVE_BUILD_STATUS != 0)) || [[ -z $LIVE_DIGEST_BEFORE ]]; then
    printf '%s: the live build did not run in this check, so freshness cannot be shown. Run the full check.\n' "$prog" >&2
    return 1
  fi
  local after
  after="$(digest_tree app/ui/dist)" || return 1
  if [[ $after != "$LIVE_DIGEST_BEFORE" ]]; then
    printf '%s: app/ui/dist changed when it was rebuilt. The bundle was stale; review and commit the rebuilt app/ui/dist.\n' "$prog" >&2
    return 1
  fi
  printf '%s: app/ui/dist is byte-for-byte unchanged by a fresh build.\n' "$prog"
  if command -v git >/dev/null 2>&1 && [[ -n "$(git status --porcelain --untracked-files=all -- app/ui/dist 2>/dev/null)" ]]; then
    printf '%s: note: app/ui/dist differs from the last commit. Commit it before pushing, or Normal CI will report a stale bundle.\n' "$prog"
  fi
}

step_replay_build() {
  ui_ready || return
  ui_script build:replay
}

step_replay_artifact() {
  ui_ready || return
  need python3 || return
  js_script scripts/check-replay-artifact.mjs app/ui/dist-replay
}

step_replay_smoke() {
  js_script scripts/smoke-replay-site.mjs --local app/ui/dist-replay
}

step_replay_fixture() {
  need "$VENV_PYTHON" || return
  "$VENV_PYTHON" scripts/build_replay_fixture.py --check
}

step_guardrail_fixture() {
  need "$VENV_PYTHON" || return
  "$VENV_PYTHON" scripts/build_guardrail_trace.py --check
}

step_fixture_publication() {
  need "$VENV_PYTHON" || return
  "$VENV_PYTHON" scripts/check-replay-publication.py
}

step_kiro_tracked() {
  need git || return
  scripts/check-kiro-tracked.sh
}

step_secret_scan() {
  need python3 || return
  python3 scripts/secret_scan.py
}

step_shellcheck() {
  need shellcheck || return
  shellcheck scripts/*.sh
}

step_permission_freeze() {
  need "$VENV_PYTHON" || return
  "$VENV_PYTHON" scripts/check-permission-freeze.py --check --readme
}

step_assets() {
  need python3 || return
  python3 scripts/check-assets.py
}

step_submission() {
  need python3 || return
  python3 scripts/check-submission.py
}

# ---- run --------------------------------------------------------------------------

selected() {
  ((${#only[@]} == 0)) && return 0
  local id
  for id in "${only[@]}"; do [[ $id == "$1" ]] && return 0; done
  return 1
}

results=()
failed=0

for id in "${STEPS[@]}"; do
  selected "$id" || continue
  printf '\n==> %s: %s\n' "$id" "$(describe "$id")"
  started=$SECONDS
  # Steps that hand a value to a later step run in this shell; the rest run in
  # a subshell with a time bound.
  if [[ $id == live-build ]]; then
    step_live_build
    status=$?
  else
    # Job control gives the step its own process group, so a step that runs
    # past the bound is stopped together with its child processes.
    set -m
    ("step_${id//-/_}") &
    step_pid=$!
    set +m
    deadline=$((SECONDS + STEP_TIMEOUT_SECONDS))
    while kill -0 "$step_pid" 2>/dev/null; do
      if ((SECONDS >= deadline)); then
        printf '%s: step exceeded %s seconds and was stopped.\n' "$prog" "$STEP_TIMEOUT_SECONDS" >&2
        kill -TERM -- "-$step_pid" 2>/dev/null || kill -TERM "$step_pid" 2>/dev/null
        break
      fi
      sleep 0.05
    done
    wait "$step_pid" 2>/dev/null
    status=$?
  fi
  elapsed=$((SECONDS - started))
  if ((status == 0)); then
    results+=("PASS  $id (${elapsed}s)")
  elif ((status == MISSING_TOOL)); then
    results+=("SKIP  $id (a needed tool is missing; counted as a failure)")
    failed=1
  else
    results+=("FAIL  $id (exit $status, ${elapsed}s)")
    failed=1
  fi
done

# ---- pending by design ---------------------------------------------------------------

pending_count=0
pending_broken=0
if ((${#only[@]} == 0)); then
  printf '\n==> pending: items that block a readiness claim but are not failures\n'
  if command -v python3 >/dev/null 2>&1; then
    release_output="$(python3 scripts/check-submission.py --release 2>/dev/null)"
    while IFS= read -r line; do
      [[ -z $line ]] && continue
      case $line in
        *": release-item-pending"*)
          printf 'PENDING  %s\n' "$line"
          pending_count=$((pending_count + 1))
          ;;
        check-submission:*) ;;
        *) pending_broken=1 ;; # a real finding; the submission step above already failed on it
      esac
    done <<<"$release_output"
    ((pending_count == 0)) && printf 'nothing is pending.\n'
  else
    printf '%s: python3 is missing, so pending items cannot be listed.\n' "$prog" >&2
    failed=1
  fi
fi

# ---- summary ---------------------------------------------------------------------------

printf '\n==> summary\n'
for line in "${results[@]}"; do printf '%s\n' "$line"; done
if ((${#only[@]} == 0)); then
  printf 'PENDING  %d item(s) by design (publication metadata, media, open checklist rows)\n' "$pending_count"
fi

if ((failed)) || ((pending_broken)); then
  printf '%s: FAILED. At least one gate did not pass; no readiness claim.\n' "$prog"
  exit 1
fi
if ((${#only[@]} > 0)); then
  printf '%s: the selected step(s) passed. This was a partial run: other gates and pending items were not checked.\n' "$prog"
  exit 0
fi
if ((pending_count > 0)); then
  if ((strict)); then
    printf '%s: FAILED (--strict). Every gate passed, but %d item(s) are still pending.\n' "$prog" "$pending_count"
    exit 1
  fi
  printf '%s: every gate passed. %d item(s) are still pending, so this is not yet a readiness claim.\n' "$prog" "$pending_count"
  exit 0
fi
printf '%s: every gate passed and nothing is pending.\n' "$prog"
exit 0
