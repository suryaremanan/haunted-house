#!/usr/bin/env bash
# Build the Haunted House UI and install or update the app in the local
# Kiro Crew gateway.
#
# Usage: scripts/install-local.sh [--dry-run] [--help]   (from anywhere)
#
# What it does:
#   1. Checks the prerequisites: app/app.json exists; kirocrew is on PATH
#      and is 0.12.1 or later; node, bun, git and curl are on PATH; the
#      gateway answers GET http://127.0.0.1:${KIROCREW_PORT:-5476}/api/health
#      with 200 within 5 seconds. Every failed check is printed with a fix,
#      and the script exits 1 before it changes anything.
#   2. Asks `kirocrew app info haunted-house` whether the app is installed
#      (exit 0: installed, exit 1: not installed).
#   3. Builds the UI in app/ui with `bun install --frozen-lockfile` (from
#      app/ui/bun.lock) and `bun run build` (vite runs on node).
#   4. Installs the app from app/, or updates the installed app from app/.
#   5. Prints the steps the owner does by hand in the Crew dashboard.
#
# The script changes no Crew settings. It does not switch the app on, trust
# it, or approve its permissions; the owner does that in the dashboard.
#
# --dry-run runs the checks in steps 1 and 2 and prints the commands of
# steps 3 and 4 without running them.
#
# Exit status:
#   0      done (with --dry-run: every check passed)
#   1      a prerequisite check failed; nothing was changed
#   2      unknown command-line argument
#   other  the exit status of the bun or kirocrew command that failed
set -euo pipefail

prog="install-local"
APP_NAME="haunted-house"
MIN_CREW_VERSION="0.12.1"
HEALTH_TIMEOUT_SECONDS=5

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
APP_DIR="$ROOT/app"

usage() {
  cat <<EOF
Usage: scripts/install-local.sh [--dry-run] [--help]

Builds the Haunted House UI and installs it into the local Kiro Crew
gateway, or updates it if it is already installed.

Options:
  --dry-run  Run the prerequisite checks and print the build and
             install/update commands without running them.
  --help     Show this help and exit.

Needs Kiro Crew $MIN_CREW_VERSION or later with its gateway running, plus
node, bun, git and curl. Set KIROCREW_PORT if the gateway does not listen
on port 5476.

The script changes no Crew settings. Afterwards you turn the app on and
trust it yourself in the Crew dashboard; the script prints the steps.
EOF
}

dry_run=0
while (($# > 0)); do
  case $1 in
    --dry-run) dry_run=1 ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      printf '%s: unknown argument: %s\n\n' "$prog" "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

failures=0
ok() {
  printf '%s: ok    %s\n' "$prog" "$*"
}
fail() {
  printf '%s: FAIL  %s\n' "$prog" "$*" >&2
  failures=$((failures + 1))
}
have() {
  command -v "$1" >/dev/null 2>&1
}
first_line() {
  "$@" 2>/dev/null | head -n 1 || true
}

# version_ge A B: true if version A (x.y.z) is the same as or newer than B.
version_ge() {
  local a1 a2 a3 b1 b2 b3
  IFS=. read -r a1 a2 a3 <<<"$1"
  IFS=. read -r b1 b2 b3 <<<"$2"
  if ((10#$a1 != 10#$b1)); then
    ((10#$a1 > 10#$b1))
    return
  fi
  if ((10#$a2 != 10#$b2)); then
    ((10#$a2 > 10#$b2))
    return
  fi
  ((10#$a3 >= 10#$b3))
}

# Prints the version from the last stdout line of `kirocrew --version` that
# looks like "kirocrew X.Y.Z". Log lines on stderr are dropped.
crew_cli_version() {
  local line version="" re='^kirocrew ([0-9]+)\.([0-9]+)\.([0-9]+)'
  while IFS= read -r line; do
    if [[ $line =~ $re ]]; then
      version="${BASH_REMATCH[1]}.${BASH_REMATCH[2]}.${BASH_REMATCH[3]}"
    fi
  done < <(kirocrew --version 2>/dev/null || true)
  printf '%s' "$version"
}

# Prints a command, shell-quoted, after a label.
show_command() {
  local label=$1
  shift
  printf '%s: %s' "$prog" "$label"
  printf ' %q' "$@"
  printf '\n'
}

# step DESCRIPTION COMMAND...: runs the command (or only prints it with
# --dry-run). If the command fails, reports it and exits with its status.
step() {
  local what=$1 status=0
  shift
  if ((dry_run)); then
    show_command "would run:" "$@"
    return 0
  fi
  printf '%s: %s\n' "$prog" "$what"
  show_command "running:" "$@"
  "$@" || status=$?
  if ((status != 0)); then
    printf '%s: FAIL  %s failed with exit status %d.\n' "$prog" "$what" "$status" >&2
    exit "$status"
  fi
}

print_dashboard_steps() {
  cat <<EOF

Next, in the Crew dashboard (this script does not do these for you):
  1. Go to Apps → Library → Haunted House and choose Enable.
  2. Accept the trust prompt. Crew blocks the app's code until you trust
     this one app.
  3. After a later update that adds permissions, approve the new
     permissions on the Haunted House app page. They stay off until you do.
  4. Open the Haunted House page. It should show:
       Backend reachable · Gateway $1
EOF
}

# ---- 1. Prerequisite checks (read-only) -----------------------------------

if [[ -f "$APP_DIR/app.json" ]]; then
  ok "app manifest: app/app.json"
else
  fail "app/app.json not found under $ROOT. The app manifest is missing; check out the complete repository (or restore app/app.json) and run this again."
fi

crew_version=""
if ! have kirocrew; then
  fail "kirocrew not found on PATH. Install Kiro Crew $MIN_CREW_VERSION or later and make sure the kirocrew command is on your PATH."
else
  crew_version="$(crew_cli_version)"
  if [[ -z $crew_version ]]; then
    fail "could not read a version from 'kirocrew --version'. Reinstall Kiro Crew $MIN_CREW_VERSION or later."
  elif version_ge "$crew_version" "$MIN_CREW_VERSION"; then
    ok "kirocrew $crew_version"
  else
    fail "Kiro Crew $crew_version is too old; Haunted House needs $MIN_CREW_VERSION or later. Update Kiro Crew and run this again."
  fi
fi

if have node; then
  ok "node $(first_line node --version)"
else
  fail "node not found on PATH. Install Node.js (a version allowed by \"engines\" in app/ui/package.json) from https://nodejs.org/."
fi

if have bun; then
  ok "bun $(first_line bun --version)"
else
  fail "bun not found on PATH. Install bun with: curl -fsSL https://bun.sh/install | bash (see https://bun.sh/)."
fi

if have git; then
  ok "$(first_line git --version)"
else
  fail "git not found on PATH. Install git from https://git-scm.com/downloads (on macOS: xcode-select --install)."
fi

port="${KIROCREW_PORT:-5476}"
if ! [[ $port =~ ^[0-9]{1,5}$ ]] || ((10#$port < 1 || 10#$port > 65535)); then
  fail "KIROCREW_PORT must be a port number from 1 to 65535. Set it to the gateway's port, or unset it to use 5476."
elif ! have curl; then
  fail "curl not found on PATH; it is needed to check the gateway. Install curl with your system's package manager."
else
  health_url="http://127.0.0.1:$port/api/health"
  http_code="$(curl --silent --noproxy '*' --max-time "$HEALTH_TIMEOUT_SECONDS" \
    --output /dev/null --write-out '%{http_code}' "$health_url" 2>/dev/null)" || true
  if [[ $http_code == 200 ]]; then
    ok "gateway answers at $health_url"
  else
    if [[ -z $http_code || $http_code == 000 ]]; then
      problem="did not answer (connection failed, or no reply within $HEALTH_TIMEOUT_SECONDS s)"
    else
      problem="answered HTTP $http_code instead of 200"
    fi
    fail "Kiro Crew gateway at $health_url $problem. Start the Crew desktop app or run 'kirocrew gateway', then run this again. If the gateway uses another port, set KIROCREW_PORT."
  fi
fi

if ((failures > 0)); then
  printf '%s: stopped before changing anything. Fix the problems above and run this again.\n' "$prog" >&2
  exit 1
fi

# ---- 2. Installed already? (read-only) -------------------------------------

info_status=0
kirocrew app info "$APP_NAME" >/dev/null 2>&1 || info_status=$?
case $info_status in
  0)
    action="update"
    ok "$APP_NAME is installed; it will be updated from app/"
    ;;
  1)
    action="install"
    ok "$APP_NAME is not installed yet; it will be installed from app/"
    ;;
  *)
    printf "%s: FAIL  could not tell whether %s is installed: 'kirocrew app info %s' exited with status %d. Run that command to see the error.\n" \
      "$prog" "$APP_NAME" "$APP_NAME" "$info_status" >&2
    exit "$info_status"
    ;;
esac

# ---- 3. Build the UI -------------------------------------------------------

step "installing UI dependencies" bun install --cwd "$APP_DIR/ui" --frozen-lockfile
step "building the UI" bun run --cwd "$APP_DIR/ui" build

# ---- 4. Install or update ---------------------------------------------------

if [[ $action == install ]]; then
  step "installing $APP_NAME" kirocrew app install "$APP_DIR"
else
  step "updating $APP_NAME" kirocrew app update --source "$APP_DIR" "$APP_NAME"
fi

# ---- 5. Manual steps --------------------------------------------------------

if ((dry_run)); then
  printf '%s: dry run: checks passed; nothing was built, installed or updated.\n' "$prog"
else
  printf '%s: done: %s %s from %s.\n' "$prog" "$APP_NAME" "${action%e}ed" "$APP_DIR"
fi
print_dashboard_steps "$crew_version"
