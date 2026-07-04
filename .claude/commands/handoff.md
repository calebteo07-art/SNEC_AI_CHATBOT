---
description: Snapshot the full live session into a durable, git-tracked handoff file so you can switch accounts and resume with zero loss.
argument-hint: "[optional note about why you're handing off]"
allowed-tools: Read, Write, Edit, Bash, TaskList, TaskGet, Glob, Grep
---

# SESSION HANDOFF — write the black box

You are about to hit a usage/token limit and the user will switch to a **different
account** and resume this exact work in a **fresh Claude Code session that starts with
ZERO memory of this conversation**. The only thing that survives is the file you write
now. If it isn't on the page, it's lost. Be exhaustive and concrete — write for an agent
who knows nothing.

Optional handoff note from the user: $ARGUMENTS

## Steps

1. Call `TaskList` (and `TaskGet` on any in-progress task) so you can transcribe the live
   task state accurately.

2. **Overwrite** `.session-handoff.md` at the repo root with the sections below. Fill every
   section with real, specific content from THIS conversation — never leave a placeholder.
   If a section is genuinely empty, write "none" rather than deleting it.

```markdown
# SESSION HANDOFF
> Black-box snapshot for a cross-account resume. Written <!-- ISO date+time -->.
> To resume in the new session: run `/handoff-resume` (or paste this whole file and say
> "resume from this handoff").

## 1. NEXT ACTION (read this first)
The single most important line. Exactly what the next agent should do the moment it loads,
including any pending decision it is waiting on the user for.

## 2. SESSION GOAL
The overarching task in 2–4 sentences. What are we ultimately trying to deliver, and why.

## 3. DECISIONS LOCKED
Every decision the user has made so far, as a bullet list. Include the user's exact choices
from any questions asked. These are settled — the next agent must NOT re-litigate them.

## 4. OPEN QUESTIONS
What is still undecided and awaiting the user. For each, list the options already on the
table so the next agent doesn't regenerate them from scratch.

## 5. ACTIVE SKILL / WORKFLOW
Which skill or workflow is mid-flight (e.g. superpowers:brainstorming), exactly which step
we're on, and what the skill's remaining steps are. If none, write "none".

## 6. TASK LIST SNAPSHOT
Transcribe the current task list verbatim — id, subject, and status for every task — so the
next agent can rebuild it with TaskCreate/TaskUpdate.

## 7. WORK PRODUCT SO FAR
Anything already produced this session that isn't yet committed to a file: drafted designs,
generated options, analysis, partial code. Summarize richly enough to not be redone.

## 8. KEY FILES & REPO FACTS
Files read or touched (with one-line relevance), plus repo constraints the next agent must
respect. Cross-reference `.awwwards_state.md` and `CLAUDE.md` if relevant.

## 9. GOTCHAS & CONSTRAINTS
Anything the next agent could easily get wrong: things that must NOT change, paid actions
that need user confirmation, environment quirks, user preferences (e.g. auto-commit+push,
don't overwrite workflows without permission).

## 10. RESUME CHECKLIST
Explicit ordered steps for the next agent: read this file → rebuild task list → re-invoke
active skill → confirm understanding with the user → execute NEXT ACTION.
```

3. Stage and commit so the snapshot is durable (the user's standing rule is auto
   commit + push after meaningful work):
   - `git add .session-handoff.md`
   - `git commit -F` with a message like `chore(session): handoff snapshot — <one-line state>`
   - `git push`
   - If the working tree has other uncommitted changes the user expects to carry over,
     tell them — don't silently leave work behind.

4. Tell the user, in 2–3 lines: the snapshot is saved + pushed, the commit hash, and the
   exact resume instruction ("On the new account, open this repo and run `/handoff-resume`").
