"""SessionStart hook: put every session in its own git worktree.

Why: this repo is worked by SEVERAL concurrent Claude sessions. When they all
edit the shared main checkout they share one index, one `.next`, one working
tree and one local `main` — so commits swallow each other's WIP, builds wipe
each other's chunks, and a plain `git push` ships another session's unpushed,
unverified commits to prod. (Full incident log: the
`project_concurrent_sessions_isolated_ship` memory.)

CLAUDE.md carries the same rule, but a session-start directive is much harder
to skim past than one line in a long file — and EnterWorktree is explicitly
gated on "the user or project instructions told me to", so this is the trigger.

Contract: reads hook JSON on stdin (cwd, source); prints one JSON object with
hookSpecificOutput.additionalContext. ALWAYS exits 0 — a nudge hook must never
wedge a session (same fail-open rule as bash_guard.py / session_snapshot.py).
"""
import json
import os
import sys

WORKTREE_MARKER = os.path.join(".claude", "worktrees")

ENTER = """\
WORKTREE-PER-SESSION — standing user policy (2026-08-05).

You are in the SHARED main checkout, which other Claude sessions are editing
right now. Its local `main` carries their unpushed commits and its working tree
carries their WIP files — committing or pushing from here ships their work.

**Before your first Edit/Write, call EnterWorktree.** It branches from
origin/main (worktree.baseRef=fresh), so you start clean and stay clean.
Read-only questions, reviews and searches need no worktree.

Frontend gates need node_modules, which a fresh worktree lacks — see the
"Worktree per session" block in CLAUDE.md for the junction/npm ci recipe.\
"""

SHIP = """\
WORKTREE-PER-SESSION — this session is already isolated in its own worktree.

Ship a completed task straight to `main` (gates green first — `main` auto-deploys):
  git add <only this task's files>   &&  git commit
  git fetch origin main
  git rebase origin/main    # if this pulls anything in, RE-RUN the gates
  git push origin HEAD:main # fast-forward; carries only your commits
Re-fetch immediately before the push: origin/main has moved twice inside one
verify cycle before. Stay in the worktree afterwards — it is good for the whole
session, and exiting drops the node_modules you set up. Cleanup is the keep/remove
prompt at session exit; only call ExitWorktree if the user asks.\
"""


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        payload = {}
    cwd = payload.get("cwd") or os.getcwd()
    in_worktree = WORKTREE_MARKER in os.path.normpath(cwd)
    print(json.dumps({
        "suppressOutput": True,
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": SHIP if in_worktree else ENTER,
        },
    }))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
