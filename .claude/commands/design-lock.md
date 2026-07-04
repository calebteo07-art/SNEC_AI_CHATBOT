---
description: Gate UI design work behind a written brief + acceptance criteria, and stop accidental re-redesigns of locked features.
argument-hint: "[feature, e.g. flashcards | home | chat | station]"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Skill, AskUserQuestion
---

# DESIGN LOCK — refine, don't re-litigate

Audit finding: the same features were redesigned from scratch repeatedly (flashcards 4+
times in 18 days) because no session had a written spec to refine against. The ledger of
settled design decisions lives in `docs/design-locks.md`. Feature: $ARGUMENTS

## Steps

1. Read `docs/design-locks.md`. If the feature is **locked** and the request is a
   from-scratch redesign, surface the lock to the user first: quote the locked direction
   and ask whether they want to (a) refine within the lock — state which acceptance
   criterion changes — or (b) consciously break the lock and write a new brief. Never
   silently rebuild a locked feature.

2. For new/unlocked design work, run superpowers:brainstorming, then write a brief into
   `docs/design-locks.md` BEFORE any code:
   - **Direction** (one paragraph: mood, palette, motion language, metaphor or "none")
   - **Acceptance criteria** (3–6 checkable bullets — "topic cards auto-rotate", not "beautiful")
   - **Reference imagery/assets** if any (paths under `frontend/public/`)
   - **Out of scope** (what this deliberately does NOT change)

3. Confirm the brief with the user (AskUserQuestion if ambiguous), mark the feature
   locked with today's date, commit the ledger, and only then start building.

4. Generated imagery inside design work follows the existing standard: medically and
   anatomically correct AND beautiful, prompt pinned in the brief, user confirms before
   any paid Gemini call.
