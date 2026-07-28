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
#   HARNESS_PORT=3999 scripts/start-harness.sh stop # drive a port other than 3000
#
# Notes:
#   - `next start` is flaky under output:standalone — always serve the
#     standalone bundle directly with node (see CLAUDE.md).
#   - Reuses a server already answering on :3000 ONLY under SKIP_BUILD=1, and only when
#     it serves this tree's BUILD_ID. A default run stops it and rebuilds, because
#     reusing a server from an older build — or from another worktree, which answers
#     :3000 just as happily — asserts green against code that was never loaded.
#   - The PORT is the authority for "is a server up" and "stop it". A crashed run (or
#     one that never wrote a pidfile) leaves an orphan owning :3000 that no pidfile
#     describes; `stop` resolves the owner from the port itself and frees it.
#   - Never report a server "up" until the child we started is the one answering. An
#     orphan already on the port makes node die of EADDRINUSE into the log — which
#     nothing reads — while the poll below goes green off the SQUATTER's replies. Same
#     trap as `stop` lying, from the other end, and worse: a stranger's build that is
#     CLOSE to yours asserts as a false GREEN, and the one screen where it differs reads
#     as a code regression. So the poll watches the child, not just the port.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FE="$ROOT/frontend"
PIDFILE="$ROOT/.tmp/harness-server.pid"
LOGFILE="$ROOT/.tmp/harness-server.log"
PORT="${HARNESS_PORT:-3000}"
BASE="http://127.0.0.1:$PORT"
MODE="${1:-all}"

mkdir -p "$ROOT/.tmp"

# Git Bash and Windows disagree about pids: `$!` and `kill` speak msys pids, netstat and
# taskkill speak Windows pids (`ps -W` shows both for the same process). Never resolve a
# pid through the wrong one — that is how you kill a stranger that recycled the number.
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) WINDOWS=1 ;; *) WINDOWS=0 ;; esac

alive() { curl -s -o /dev/null --max-time 2 "$BASE/"; }

# Who owns the port. netstat is the only listener→pid map Git Bash always has; lsof
# elsewhere. No output means "could not resolve the owner", never "nobody is there".
listener_pids() {
  if [ "$WINDOWS" = 1 ]; then
    netstat -ano | awk -v p=":$PORT" '$1=="TCP" && $4=="LISTENING" && $2 ~ p"$" {print $5}' | sort -u
  else
    command -v lsof >/dev/null 2>&1 && lsof -ti "tcp:$PORT" -sTCP:LISTEN || true
  fi
}

kill_pid() {
  if [ "$WINDOWS" = 1 ]; then
    taskkill //F //PID "$1" >/dev/null 2>&1 || true
  else
    kill "$1" 2>/dev/null || kill -9 "$1" 2>/dev/null || true
  fi
}

# Never report success while something is still serving the port. A `stop` that lies is
# worse than one that fails: the next run takes the reuse branch below, asserts against
# a STALE build, and reports a green harness for code that was never loaded.
# The port names its own owner, so this also clears an orphan no pidfile describes.
stop_server() {
  if ! alive; then
    rm -f "$PIDFILE"
    echo "nothing listening on :$PORT"
    return 0
  fi
  local pids; pids="$(listener_pids)"
  # Fall back to the pidfile only where it and `kill` share a pid namespace (see above).
  if [ -z "$pids" ] && [ "$WINDOWS" = 0 ] && [ -s "$PIDFILE" ]; then pids="$(cat "$PIDFILE")"; fi
  for pid in $pids; do kill_pid "$pid"; done
  for i in $(seq 1 10); do
    alive || { rm -f "$PIDFILE"; echo "harness server stopped (:$PORT${pids:+, pid $(echo $pids)})"; return 0; }
    sleep 1
  done
  echo "STILL SERVING :$PORT after kill — an orphan is squatting the port." >&2
  echo "Find and kill it before running the harness, or every assertion below is" >&2
  echo "running against whatever build that process loaded." >&2
  return 1
}

[ "$MODE" = "stop" ] && { stop_server; exit $?; }

# Reuse is opt-in, via the same flag that opts out of the build. A default run must
# never inherit a server someone left up from an older build — that is a false green,
# not a speed-up. SKIP_BUILD=1 already means "I know the running bundle is my code";
# BUILD_ID is what proves it, since a server from another worktree answers just as
# happily and is the one case the flag cannot speak for.
serving_this_build() {
  [ -s "$FE/.next/BUILD_ID" ] || return 1
  curl -sf -o /dev/null --max-time 5 "$BASE/_next/static/$(cat "$FE/.next/BUILD_ID")/_buildManifest.js"
}

if [ "${SKIP_BUILD:-0}" = "1" ] && alive && serving_this_build; then
  echo "reusing server already answering on :$PORT (SKIP_BUILD=1, build $(cat "$FE/.next/BUILD_ID"))"
else
  if alive; then
    echo "── stopping the server on :$PORT so the harness runs against THIS build…"
    stop_server || exit 1
  fi
  if [ "${SKIP_BUILD:-0}" != "1" ]; then
    echo "── building (next build, standalone)…"
    (cd "$FE" && npm run build)
  fi
  # standalone serves nothing without these two copies
  rm -rf "$FE/.next/standalone/.next/static" "$FE/.next/standalone/public"
  cp -r "$FE/.next/static" "$FE/.next/standalone/.next/static"
  cp -r "$FE/public" "$FE/.next/standalone/public"

  echo "── starting node .next/standalone/server.js on :$PORT…"
  # The guard below reads this log as THIS launch's, so don't leave it to the subshell's
  # own redirect to clear a previous run's EADDRINUSE out of it.
  : >"$LOGFILE"
  # `exec` matters: without it `$!` is the pid of the subshell wrapping `cd && node`, not
  # node's, so `stop` killed the wrapper and left a nohup'd node serving the port forever.
  (cd "$FE" && exec env PORT="$PORT" HOSTNAME=127.0.0.1 node .next/standalone/server.js >"$LOGFILE" 2>&1) &
  child=$!
  echo "$child" >"$PIDFILE"

  # `alive` only says SOMETHING answers the port, never that it is the child above — so
  # check the child every pass (see the header note). The sleep leads: node must reach
  # its bind() before the first verdict, or a squatter's reply wins the race.
  for i in $(seq 1 60); do
    sleep 1
    if grep -q EADDRINUSE "$LOGFILE" 2>/dev/null; then
      echo "EADDRINUSE on :$PORT — an orphan owns the port and the server we just started" >&2
      echo "is dead. Find and kill it before running the harness, or every assertion below" >&2
      echo "is running against whatever build that process loaded." >&2
      echo "  try: HARNESS_PORT=$PORT scripts/start-harness.sh stop" >&2
      rm -f "$PIDFILE"; exit 1
    fi
    if ! kill -0 "$child" 2>/dev/null; then
      echo "the server exited before it answered :$PORT — tail of $LOGFILE:" >&2
      tail -n 20 "$LOGFILE" >&2
      rm -f "$PIDFILE"; exit 1
    fi
    alive && break
    [ "$i" = 60 ] && { echo "server never came up — see $LOGFILE" >&2; exit 1; }
  done
  # That `$!` is an msys pid under Git Bash; overwrite it with the pid the port itself
  # reports, so the file agrees with netstat/Task Manager and with kill_pid.
  real_pid="$(listener_pids | head -n1 || true)"
  if [ -n "$real_pid" ]; then echo "$real_pid" >"$PIDFILE"; fi
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
