---
description: Build, serve, warm, and run the visual assert harnesses (aurora/station) with the one known-good standalone recipe.
argument-hint: "[aurora|station|all|serve|stop] (default all; SKIP_BUILD=1 to reuse the build)"
allowed-tools: Bash, Read, Grep
---

# HARNESS — canonical visual-test runner

Everything is encapsulated in one tested script; do not reinvent the sequence
(`next start` is flaky under `output: standalone`, static/public must be copied
into the standalone bundle, and dynamic routes need warming or Playwright times
out on the cold first hit).

## Steps

1. Run it via the Bash tool (POSIX shell — never PowerShell cmdlets):
   ```bash
   bash scripts/start-harness.sh ${ARGUMENTS:-all}
   ```
   - Frontend unchanged since the last build? Prefix with `SKIP_BUILD=1` to save ~3 minutes.
   - A server already on :3000 is reused **only** under `SKIP_BUILD=1` and only when it
     serves this tree's `.next/BUILD_ID`; otherwise it is evicted and rebuilt. Reusing
     another worktree's server silently asserts someone else's bundle.
   - `serve` leaves the server running for iteration; `stop` frees :3000 by killing whatever
     owns the port (the pidfile is only a fallback) and fails loudly if the port survives.

2. Report the result faithfully: the pass counts per harness, or the first failing
   assertion verbatim. If the server never came up, read `.tmp/harness-server.log`
   and diagnose — do not retry blindly.

3. A failing assertion after a UI change usually means either a real regression or a
   stale assertion. Check which before touching the harness: test-only edits need the
   assertion text updated; app regressions need the app fixed. Never delete assertions
   to go green.
