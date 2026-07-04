---
description: Pre-"done" gate for user-facing changes — regression test for the invariant, full test gates, and a real behavioral verify before any push to main.
argument-hint: "[optional: what changed, e.g. 'checkin once-per-day fix']"
allowed-tools: Read, Bash, Grep, Glob, Edit, Write, Skill
---

# SHIP CHECK — fixes must stick

This project's worst audit finding: bugs "fixed" and re-reported verbatim weeks later
(the check-in "show once per day" ask recurred across 5 sessions, Jun 5 → Jun 15 2026),
because fixes shipped with green-but-irrelevant tests and no behavioral verification.
This gate runs BEFORE claiming done / committing. Change under review: $ARGUMENTS

## Steps

1. **Name the user-visible invariant(s)** the change is supposed to establish, in one
   sentence each (e.g. "the check-in question appears at most once per calendar day per
   user, across sessions and logins"). If you cannot name one, this gate doesn't apply —
   say so and stop.

2. **Point to the regression test** that encodes each invariant (`Grep` in `tests/` /
   `frontend/tests/`). No test? Write one now via superpowers:test-driven-development —
   it must fail against the pre-fix behavior (or a reverted stub) and pass with the fix.
   Idempotency and calendar-day/boundary invariants especially: test the *second* call,
   the *next* session, the *same* day.

3. **Run the gates that CI runs**, relevant to what changed:
   - `python -m pytest -q` (always)
   - `cd frontend && npm run typecheck && npm run build` (any frontend change)
   - `bash scripts/start-harness.sh` aurora and/or station (any UI change)

4. **Verify the behavior, not just the tests**: exercise the real flow once (via the
   `verify` skill or the running app) and observe the invariant holding — including the
   repeat case (second login, second submit, next deck).

5. Only after 1–4 are green: commit with the evidence in the message (test name + gate
   results), push to main per house rules. If anything is red, report it plainly —
   never ship red.
