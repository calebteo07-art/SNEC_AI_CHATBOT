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
   - `serve` leaves the server running for iteration; `stop` kills it (pidfile in `.tmp/`).

2. Report the result faithfully: the pass counts per harness, or the first failing
   assertion verbatim. If the server never came up, read `.tmp/harness-server.log`
   and diagnose — do not retry blindly.

3. A failing assertion after a UI change usually means either a real regression or a
   stale assertion. Check which before touching the harness: test-only edits need the
   assertion text updated; app regressions need the app fixed. Never delete assertions
   to go green.
