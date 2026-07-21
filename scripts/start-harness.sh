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
#   - Reuses a server already answering on :3000 instead of double-starting.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FE="$ROOT/frontend"
PIDFILE="$ROOT/.tmp/harness-server.pid"
LOGFILE="$ROOT/.tmp/harness-server.log"
BASE="http://127.0.0.1:3000"
MODE="${1:-all}"

mkdir -p "$ROOT/.tmp"

stop_server() {
  if [ -f "$PIDFILE" ]; then
    kill "$(cat "$PIDFILE")" 2>/dev/null || true
    rm -f "$PIDFILE"
    echo "harness server stopped"
  else
    echo "no pidfile — nothing to stop"
  fi
}

[ "$MODE" = "stop" ] && { stop_server; exit 0; }

alive() { curl -s -o /dev/null --max-time 2 "$BASE/"; }

if alive; then
  echo "reusing server already answering on :3000"
else
  if [ "${SKIP_BUILD:-0}" != "1" ]; then
    echo "── building (next build, standalone)…"
    (cd "$FE" && npm run build)
  fi
  # standalone serves nothing without these two copies
  rm -rf "$FE/.next/standalone/.next/static" "$FE/.next/standalone/public"
  cp -r "$FE/.next/static" "$FE/.next/standalone/.next/static"
  cp -r "$FE/public" "$FE/.next/standalone/public"

  echo "── starting node .next/standalone/server.js on :3000…"
  (cd "$FE" && PORT=3000 HOSTNAME=127.0.0.1 nohup node .next/standalone/server.js >"$LOGFILE" 2>&1 &
   echo $! >"$PIDFILE")

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
  all)     run aurora_assert.mjs; run station_assert.mjs; run rotate_gate_assert.mjs; run station_forfeit_assert.mjs; run flashcards_forfeit_assert.mjs ;;
  serve)   echo "server ready at $BASE — stop with: scripts/start-harness.sh stop" ;;
  *)       echo "usage: start-harness.sh [aurora|station|forfeit|all|serve|stop]" >&2; exit 2 ;;
esac
