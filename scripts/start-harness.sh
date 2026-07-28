#!/usr/bin/env bash
# start-harness.sh — canonical local runner for the visual assert harnesses.
#
# Encapsulates the recipe that every branch used to rediscover by hand:
#   build → copy .next/static + public into .next/standalone → serve on :3000
#   → warm dynamic routes (cold first-hit >15s breaks Playwright waits) → assert.
#
# Usage:
#   scripts/start-harness.sh [aurora|station|all|serve|stop]   (default: all)
#   SKIP_BUILD=1 scripts/start-harness.sh aurora    # reuse existing .next build
#
# Notes:
#   - `next start` is flaky under output:standalone — always serve the
#     standalone bundle directly with node (see CLAUDE.md).
#   - Reuses a server already answering on :3000 ONLY under SKIP_BUILD=1. A default run
#     stops it and rebuilds, because reusing a server from an older build asserts green
#     against code that was never loaded.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FE="$ROOT/frontend"
PIDFILE="$ROOT/.tmp/harness-server.pid"
LOGFILE="$ROOT/.tmp/harness-server.log"
BASE="http://127.0.0.1:3000"
MODE="${1:-all}"

mkdir -p "$ROOT/.tmp"

alive() { curl -s -o /dev/null --max-time 2 "$BASE/"; }

# Never report success while something is still serving :3000. A `stop` that lies is
# worse than one that fails: the next run takes the reuse branch below, asserts against
# a STALE build, and reports a green harness for code that was never loaded.
stop_server() {
  if [ -f "$PIDFILE" ]; then
    kill "$(cat "$PIDFILE")" 2>/dev/null || true
    rm -f "$PIDFILE"
  fi
  for i in $(seq 1 10); do
    alive || { echo "harness server stopped"; return 0; }
    sleep 1
  done
  echo "STILL SERVING :3000 after kill — an orphan is squatting the port." >&2
  echo "Find and kill it before running the harness, or every assertion below is" >&2
  echo "running against whatever build that process loaded." >&2
  return 1
}

[ "$MODE" = "stop" ] && { stop_server; exit $?; }

# Reuse is opt-in, via the same flag that opts out of the build. A default run must
# never inherit a server someone left up from an older build — that is a false green,
# not a speed-up. SKIP_BUILD=1 already means "I know the running bundle is my code".
if [ "${SKIP_BUILD:-0}" = "1" ] && alive; then
  echo "reusing server already answering on :3000 (SKIP_BUILD=1)"
else
  alive && { echo "── stopping the server on :3000 so the harness runs against THIS build…"; stop_server; }
  if [ "${SKIP_BUILD:-0}" != "1" ]; then
    echo "── building (next build, standalone)…"
    (cd "$FE" && npm run build)
  fi
  # standalone serves nothing without these two copies
  rm -rf "$FE/.next/standalone/.next/static" "$FE/.next/standalone/public"
  cp -r "$FE/.next/static" "$FE/.next/standalone/.next/static"
  cp -r "$FE/public" "$FE/.next/standalone/public"

  echo "── starting node .next/standalone/server.js on :3000…"
  # `exec` matters: without it `$!` is the pid of the subshell wrapping `cd && node`, not
  # node's, so `stop` killed the wrapper and left a nohup'd node serving the port forever.
  (cd "$FE" && exec env PORT=3000 HOSTNAME=127.0.0.1 node .next/standalone/server.js >"$LOGFILE" 2>&1) &
  echo $! >"$PIDFILE"

  for i in $(seq 1 60); do
    alive && break
    [ "$i" = 60 ] && { echo "server never came up — see $LOGFILE" >&2; exit 1; }
    sleep 1
  done
  echo "── server up"
fi

# Warm every route the harnesses actually visit — a cold first hit can exceed the 15s
# waitForSelector budget. /profile, /admin and /supervisor were dropped (those routes no
# longer exist, so warming them only warmed the 404); /leaderboard, /analytics and the
# no-manual-actions case /cases/C002 are asserted but were never warmed.
echo "── warming routes (authed curl; cold-compile guard)…"
for route in / /checkin /homepage /chat /flashcards /leaderboard /studio /analytics /cases /cases/C001 /cases/C002; do
  curl -s -o /dev/null --max-time 45 -H "Cookie: eyebot_token=pw-harness" "$BASE$route" || true
done

run() { echo "── $1"; node "$FE/tests/$1" "$BASE"; }
case "$MODE" in
  aurora)  run aurora_assert.mjs ;;
  station) run station_assert.mjs; run rotate_gate_assert.mjs ;;
  # Leave-forfeit behavioural gate: every exit route from an active deck / station charges
  # the flat forfeit exactly once (incl. the Atlas Rail + ⌘K palette, the reported loophole).
  forfeit) run station_forfeit_assert.mjs; run flashcards_forfeit_assert.mjs ;;
  # Hover-pause: both drifting coverflows freeze under the cursor on the FRONT CARD only.
  # A live rAF loop writes the drift straight to the DOM, so only a real browser can tell
  # "held" from "still flowing" — and only this catches the zone quietly growing to the
  # whole stage (which would stop the ring wherever the mouse rested).
  hover)   run hover_pause_assert.mjs ;;
  all)     run aurora_assert.mjs; run station_assert.mjs; run rotate_gate_assert.mjs; run station_forfeit_assert.mjs; run flashcards_forfeit_assert.mjs; run hover_pause_assert.mjs ;;
  serve)   echo "server ready at $BASE — stop with: scripts/start-harness.sh stop" ;;
  *)       echo "usage: start-harness.sh [aurora|station|forfeit|hover|all|serve|stop]" >&2; exit 2 ;;
esac
