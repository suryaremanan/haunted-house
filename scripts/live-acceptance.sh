#!/usr/bin/env bash
# Live acceptance of Haunted House on a real Crew gateway.
#
#   scripts/live-acceptance.sh
#
# 1. Preflight, no sign-in needed: the gateway answers, the app is installed
#    from this checkout, enabled and trusted.
# 2. The walk, in headless Comet on the installed page: knock at the Gate, say
#    what to build, Build this, have the Archivist write the requirements (a
#    real ghost run), and wait at the requirements door.
# 3. The decision is the owner's: open the door in your own Crew window. The
#    walk sees it happen live and records it.
#
# It needs a dashboard sign-in URL, which only the owner should mint:
#   HH_DASHBOARD_URL="$(kirocrew token --ttl 30m)" scripts/live-acceptance.sh
# The URL is read from the environment, passed to the browser only, and never
# printed or written. Without it the script records the preflight and stops.
#
# Evidence: spikes/fixtures/live-acceptance.json (no token, no home path).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/spikes/fixtures/live-acceptance.json"
PORT="${HH_CDP_PORT:-9334}"
COMET="/Applications/Comet.app/Contents/MacOS/Comet"
PROFILE="${HH_CDP_PROFILE:-$HOME/.comet-cdp-profile-hh-live}"

say() { printf 'live-acceptance: %s\n' "$*"; }

command -v kirocrew >/dev/null || { say "kirocrew is not on PATH"; exit 1; }
command -v bun >/dev/null || { say "bun is not on PATH"; exit 1; }

say "preflight"
status_ok=false
if kirocrew status >/dev/null 2>&1; then status_ok=true; fi
info="$(kirocrew app info haunted-house 2>/dev/null | sed -n '/^{/,$p' || true)"

export HH_LIVE_STATUS_OK="$status_ok"
export HH_LIVE_APP_INFO="$info"
export HH_LIVE_ROOT="$ROOT"
export HH_LIVE_OUT="$OUT"
export HH_LIVE_PORT="$PORT"

if [[ -z "${HH_DASHBOARD_URL:-}" ]]; then
  HH_LIVE_PHASE=preflight bun "$ROOT/scripts/live-acceptance.mjs"
  say "stopped before the walk: it needs your dashboard sign-in."
  say "run:  HH_DASHBOARD_URL=\"\$(kirocrew token --ttl 30m)\" scripts/live-acceptance.sh"
  exit 2
fi

[[ -x "$COMET" ]] || { say "Comet is not installed at $COMET"; exit 1; }
"$COMET" --headless=new --remote-debugging-port="$PORT" --user-data-dir="$PROFILE" \
  --no-first-run --no-default-browser-check about:blank >/dev/null 2>&1 &
comet=$!
trap 'kill "$comet" 2>/dev/null || true' EXIT

HH_LIVE_PHASE=walk bun "$ROOT/scripts/live-acceptance.mjs"
