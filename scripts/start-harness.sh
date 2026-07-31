#!/usr/bin/env bash
# start-harness.sh — canonical local runner for the visual assert harnesses.
#
# Encapsulates the recipe that every branch used to rediscover by hand:
#   build → copy .next/static + public into .next/standalone → serve on :3000
#   → warm dynamic routes (cold first-hit >15s breaks Playwright waits) → assert.
#
# Usage:
#   scripts/start-harness.sh [aurora|station|forfeit|hover|all|list|serve|stop]  (default: all)
#   SKIP_BUILD=1 scripts/start-harness.sh aurora    # reuse existing .next build
#   HARNESS_PORT=3999 scripts/start-harness.sh stop # drive a port other than 3000
#   scripts/start-harness.sh list                   # what `all` would run (no build/server)
#
#   One run at a time per tree+port, via .tmp/harness-<port>.lock. A lock whose holder is
#   dead is reclaimed automatically, so you should never need to clear it by hand; if you
#   do, `rm -rf .tmp/harness-<port>.lock` — but check nothing is mid-run first.
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
#
# OWNERSHIP — who is responsible for the server process, and for how long.
#   An assert run OWNS the server it starts and reaps it on EXIT (normal, failed, or
#   Ctrl-C). It never reaps a server it merely reused. `serve` is the one mode that hands
#   ownership to you: it deliberately outlives the script, and `stop` is how you end it.
#   This exists because the script used to start node, exit, and leave an ORPHAN nobody
#   owned — which the next SKIP_BUILD=1 run happily reused. When something later reaped
#   that orphan (a parent shell exiting, a terminal closing, another run's `stop`) it died
#   MID-SUITE, and the harness in flight failed on whatever it happened to be waiting for:
#   a different scenario each run, against an unchanged bundle. Worse, a server that dies
#   after the HTML but before the /_next chunks leaves the app stranded on BrandSplash, so
#   the failure surfaces as a UI wait timing out rather than as "the server is gone".
#   The single-run lock below is the other half: two concurrent runs in this tree would
#   `rm -rf .next/standalone/.next/static` out from under each other's live server, which
#   produces that same phantom-UI-regression failure.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FE="$ROOT/frontend"
PIDFILE="$ROOT/.tmp/harness-server.pid"
LOGFILE="$ROOT/.tmp/harness-server.log"
PORT="${HARNESS_PORT:-3000}"
BASE="http://127.0.0.1:$PORT"
MODE="${1:-all}"
LOCKDIR="$ROOT/.tmp/harness-$PORT.lock"

# Ownership bookkeeping (see the header). OWN_SERVER flips to 1 only when THIS run starts
# node — reusing someone else's server must never make us its executioner.
OWN_SERVER=0
KEEP_SERVER=0
LOCK_HELD=0
CHILD_PID=""
if [ "$MODE" = "serve" ]; then KEEP_SERVER=1; fi

# Which harnesses `all` runs, DISCOVERED rather than listed. The old `all` named six of
# twenty; the other fourteen existed and eleven of them passed — they simply gated nothing.
# Same drift that had ci.yml running 16 of 29 logic harnesses, and a hand list has no way
# to notice what it left out. A browser harness is exactly a tests/*.mjs that imports
# playwright, so the set cannot go stale.
#
# The exclusions are opt-OUT on purpose: a new harness is gated the moment it lands, and
# forgetting to exclude a non-gate fails loudly here instead of being skipped in silence.
#   visual_sweep       — a screenshot sweep with no exit code; it can never fail, so
#                        gating it would only add minutes and a false sense of cover.
#   mobile_audit       — RED on three REAL defects it is the only thing that catches: a
#                        32x32 "?" button on /cases at every touch tier (44x44 minimum),
#                        and two elements hanging off the right edge of /admin at 360.
#                        Gate it the moment those are fixed; it is not a false positive.
# home_mobile_assert came off this list once both harnesses learned what a scroll container
# is (_layout.mjs) — every one of its failures was the home badge shelf.
NOT_GATED="visual_sweep.mjs mobile_audit.mjs"

# A filter that selects nothing would run nothing and exit 0 — the same false green the
# logic runner guards. Not a target: lower it only when harnesses are genuinely removed.
MIN_HARNESSES=15

gated_harnesses() {
  local f base found=0
  for f in "$FE"/tests/*.mjs; do
    base="$(basename "$f")"
    # `_` prefix means fixture or runner, never a harness — the same convention
    # tests/_run_logic.mjs applies. It is not optional here: _run_logic.mjs contains the
    # string 'from "playwright"' inside its OWN filter, so a grep alone adopts it.
    case "$base" in _*) continue ;; esac
    grep -q 'from "playwright"' "$f" || continue
    case " $NOT_GATED " in *" $base "*) continue ;; esac
    echo "$base"
    found=$((found + 1))
  done
  if [ "$found" -lt "$MIN_HARNESSES" ]; then
    echo "discovered $found browser harnesses, expected at least $MIN_HARNESSES —" >&2
    echo "running none of them exits 0 and reads as a green suite." >&2
    return 1
  fi
}

# Before the lock, the build and the server: `list` is a question about the tree, not a run.
if [ "$MODE" = "list" ]; then gated_harnesses; exit 0; fi

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

# The pid of the run holding the lock, if it is still alive. Both this and $$ are msys
# pids from the same Bash, so `kill -0` is the right liveness test here — unlike the
# netstat/taskkill pids above, which live in the other namespace.
lock_holder() {
  [ -s "$LOCKDIR/pid" ] || return 1
  local h; h="$(cat "$LOCKDIR/pid" 2>/dev/null || true)"
  [ -n "$h" ] && kill -0 "$h" 2>/dev/null && { echo "$h"; return 0; }
  return 1
}

# `stop` stays unconditional — it is the escape hatch for a wedged server, so it must work
# even while another run holds the lock. But say so, because stopping the port out from
# under a live run is exactly the mid-suite death described in the header.
if [ "$MODE" = "stop" ]; then
  if holder="$(lock_holder)"; then
    echo "warning: harness run (pid $holder) is live on :$PORT — stopping its server will" >&2
    echo "make its remaining assertions fail against a dead port." >&2
  fi
  stop_server; exit $?
fi

# One harness run per tree+port. Two concurrent runs would race the static wipe below and
# fight over the port. mkdir is the atomic primitive available everywhere; a lock whose
# holder is gone is stale and gets reclaimed, so a hard-killed run can never brick the next.
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  if holder="$(lock_holder)"; then
    echo "another harness run (pid $holder) already owns :$PORT in this tree." >&2
    echo "Wait for it, or stop it — running both wipes .next/standalone/static out from" >&2
    echo "under the live server and every assertion after that is meaningless." >&2
    exit 1
  fi
  echo "── clearing a stale lock from a run that died without releasing it"
fi
echo "$$" >"$LOCKDIR/pid"
LOCK_HELD=1

# The whole ownership contract, in one place: release the lock always, and end the server
# iff we started it and are not handing it to the user. Runs on failure and Ctrl-C too —
# the leaked-server-on-interrupt case is what seeded the orphans in the first place.
#
# Two levels, and the distinction matters: stop_server resolves its target FROM THE PORT,
# so it is only safe once the poll has proved our child is the one answering (OWN_SERVER).
# Before that — an interrupt mid-poll, or our child dead of EADDRINUSE — the port may
# belong to a squatter, and a squatter is not ours to kill, only to refuse. There we kill
# CHILD_PID and nothing else.
cleanup() {
  local rc=$?
  if [ "$KEEP_SERVER" = 0 ]; then
    if [ "$OWN_SERVER" = 1 ]; then
      echo "── stopping the server this run started (:$PORT)"
      stop_server >/dev/null 2>&1 || true
    elif [ -n "$CHILD_PID" ] && kill -0 "$CHILD_PID" 2>/dev/null; then
      kill "$CHILD_PID" 2>/dev/null || true
      rm -f "$PIDFILE"
    fi
  fi
  if [ "$LOCK_HELD" = 1 ]; then rm -rf "$LOCKDIR"; fi
  exit $rc
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

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
  # Ours from this instant, so an interrupt mid-poll kills OUR process rather than leaking
  # it. Port-level ownership is only claimed once the poll below proves the port is ours.
  CHILD_PID="$child"
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
  # Only NOW is it safe to drop it from the job table, and only for `serve` — the poll
  # above needs `kill -0 "$child"` to mean "still running", and a disowned child the shell
  # no longer reaps lingers as a zombie that `kill -0` reports as alive, which would turn
  # "the server exited before it answered" into a silent 60s timeout. `serve` hands the
  # process to the user, so it must not take a SIGHUP when this shell exits.
  if [ "$KEEP_SERVER" = 1 ]; then disown "$child" 2>/dev/null || true; fi
  # The poll has proved OUR child is the one answering :$PORT, so from here the port itself
  # is ours to free on the way out — which is what makes an assert run leave nothing behind.
  OWN_SERVER=1
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

# A harness only means something if the server was there for all of it. Check before each
# one so a mid-suite death is named at the point it happened, instead of cascading into the
# next harness as a phantom UI failure (the app strands on BrandSplash when its chunks 404).
require_alive() {
  if alive; then return 0; fi
  echo "" >&2
  echo "the harness server on :$PORT is GONE (before $1) — it died mid-suite, so every" >&2
  echo "assertion from here on would be meaningless. Tail of $LOGFILE:" >&2
  tail -n 20 "$LOGFILE" >&2
  exit 1
}
run() { require_alive "$1"; echo "── $1"; node "$FE/tests/$1" "$BASE"; }
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
  # Everything that gates, discovered — see gated_harnesses() near the top for why this is
  # not a list. The named modes above stay as fast targeted subsets.
  all)     for h in $(gated_harnesses); do run "$h"; done ;;
  # The one mode that hands the server over: it outlives this script on purpose, so YOU
  # own it now and `stop` is how it ends. Every other mode reaps what it started.
  serve)   echo "server ready at $BASE — it is yours until: scripts/start-harness.sh stop" ;;
  *)       echo "usage: start-harness.sh [aurora|station|forfeit|hover|all|list|serve|stop]" >&2; exit 2 ;;
esac
