---
description: Resume a session saved with /handoff — reads .session-handoff.md, rebuilds context, and continues with zero loss.
allowed-tools: Read, Bash, TaskList, TaskCreate, TaskUpdate, TaskGet, Skill, Glob, Grep
---

# SESSION RESUME — restore the black box

A previous session ran out of tokens and the user switched accounts. The full state was
saved to `.session-handoff.md`. Your job is to absorb it completely and continue as if no
interruption happened.

## Steps

1. Read `.session-handoff.md` at the repo root **in full**. Also read `CLAUDE.md` and, if it
   exists, `.awwwards_state.md` — they hold standing project context the handoff references.

2. Check it's current: run `git log -1 --format='%h %ci %s' -- .session-handoff.md` so you
   know how fresh the snapshot is, and `git status` for any uncommitted work the handoff
   mentions carrying over.

3. **Rebuild the task list** from section 6 using TaskCreate/TaskUpdate, preserving each
   task's status (pending / in_progress / completed). Match the in-progress task to where
   the handoff says we are.

4. **Re-invoke the active skill** named in section 5 via the Skill tool, if any, passing a
   short summary of where we left off so the skill resumes mid-flow rather than restarting.

5. Give the user a tight re-orientation (5–8 lines max): the session goal, the decisions
   already locked (so they know you won't re-ask), any open question we were waiting on, and
   the NEXT ACTION from section 1. Then either execute that next action or ask the user the
   pending question — do not re-litigate anything in section 3.

Do NOT start over, re-ask settled questions, or regenerate options that section 4/7 already
captured. The handoff is the source of truth; trust it.
