# EyeBot — Agent Operating Guide

EyeBot is a **production** AI training platform for **SNEC** (Singapore National
Eye Centre) allied-health students — Ophthalmic Assistants (OA), Technicians (OT),
Patient Service Associates (PSA): a Socratic tutor, virtual-patient OSCE stations,
spaced-repetition flashcards, daily check-ins, gamification, and staff dashboards,
grounded in a Supabase RAG knowledge base. It's deployed to real institutions.
**Treat every change as production-bound: secure, reproducible, observable, scale-safe.**

## How to work

Four principles (biased toward caution over speed — use judgment on trivial fixes):

- **Think before coding.** Surface assumptions and tradeoffs. If a request has
  multiple readings or a simpler path exists, say so. Ask only when genuinely
  blocked or when the ambiguity changes *what* you build — otherwise pick the
  sensible default and proceed.
- **Simplicity first.** Minimum code that solves the problem. No speculative
  abstraction, config, or error handling for impossible cases. If 200 lines could
  be 50, rewrite. Would a senior engineer call it overcomplicated?
- **Surgical changes.** Touch only what the task needs; match surrounding style
  (comment density, naming, async idioms). No drive-by refactors. Remove only the
  orphans your change created; flag unrelated dead code, don't delete it. Every
  changed line traces to the request.
- **Goal-driven execution.** Turn tasks into verifiable success criteria and loop.
  TDD for any feature/bugfix (failing test first → watch it fail → minimal pass);
  systematic debugging before proposing a fix.

And:

- **Process skills first** — brainstorm before building, then TDD, then systematic
  debugging. Tests live in `tests/` (pytest) and `frontend/tests/` (Node harnesses).
- **Read before you edit; verify before you assert.** Read only the files/ranges
  you need; don't re-read unchanged files. Confirm behavior against the code, DB, or
  `docs/` before claiming it — never guess APIs, versions, flags, commit SHAs, or
  package names. The stack drifts and memory goes stale.
- **Concise output, thorough reasoning.** Spend tokens like they cost money — tight
  prose, targeted reads, parallel independent tool calls — but never at the expense
  of a test, an edge case, or a real fix. Efficiency is cutting waste, not corners.
- **Live AI calls cost real money and prod quota.** Tests and harnesses run keyless
  in `MOCK_MODE`; never fire a live Gemini text/image call without explicit go-ahead.
- **Self-improvement loop:** broke → fix the tool → verify → update the workflow →
  move on more robust.

## WAT architecture (Workflows · Agents · Tools)

Probabilistic AI reasons; deterministic code executes. Five chained 90%-accurate AI
steps compound to ~59%, so execution is offloaded to tested scripts.

- **Workflows** (`workflows/`) — Markdown SOPs. Don't create/overwrite one without
  explicit permission.
- **Agents** (you) — read the workflow, run tools in order, recover from errors, ask
  when genuinely blocked. Connect intent to execution; don't do everything inline.
- **Tools** (`tools/`) — Python scripts doing the work (AI, DB, transforms).
  **Look for an existing tool before building one.**

## The stack

Single-container (`scripts/start-prod.sh`): browser →HTTPS→ **Next.js standalone**
(public, `$PORT`; `next.config.ts` rewrites `/api/*` + `/health`) →internal→
**FastAPI** (`127.0.0.1:8000`) → Supabase · Gemini · Redis. The same-origin proxy
keeps cookies + SSE intact. **Next owns page security headers (CSP); FastAPI returns
only JSON/SSE.**

| Layer    | Reality (verify before asserting) |
|----------|-----------------------------------|
| Frontend | Next.js 16 (App Router, `output: standalone`), React 19, Tailwind 4, TanStack Query, Motion/GSAP, R3F. Node 24. |
| Backend  | FastAPI + uvicorn, Python **3.12** in prod, async-first. Entry `tools/api/server.py`; routers `tools/api/routers/`; shared singletons + rate-limit keying `tools/api/shared.py`. |
| AI       | Gemini via `google-genai` (`tools/shared/gemini_client.py`); `MOCK_MODE` when no key. |
| Data     | Supabase (Postgres + pgvector RAG); Google Sheets for some rosters. |
| Auth     | Custom JWT in an **HttpOnly** cookie `eyebot_token`; bcrypt(cost 12); OTP reset. |
| Async    | Celery + Redis workers (`tools/workers/`). |
| Deploy   | Render, auto-deploys `main` + keep-alive cron. The live service builds the **`Dockerfile`**; `render.yaml` declares a drifted native-Python path too — keep both working. |

Endpoint map: `docs/ARCHITECTURE.md`. Security model: `docs/SECURITY.md`.

## Production invariants (never violate)

1. **Never block the event loop.** Wrap every blocking call (Gemini, bcrypt, SMTP,
   Supabase sync client) in `asyncio.to_thread` + timeout — one blocking call stalls
   the whole Render worker.
2. **No shared in-process state.** Workers scale horizontally (`WEB_CONCURRENCY`);
   shared counters live in Redis (when `REDIS_URL` is set), OTPs in Supabase. The
   case cache is a per-worker idempotent read cache only.
3. **Fail closed.** `tools/shared/config.py::assert_production_ready()` refuses to
   boot in prod on an insecure `JWT_SECRET`, missing Supabase keys, or wildcard/empty
   `ALLOWED_ORIGINS`. Don't weaken it.
4. **Identity = JWT `current_user["sub"]`, never the request body**
   (`tools/shared/jwt_utils.py`).
5. **Secrets only in env / Render dashboard.** Never commit `.env`,
   `credentials.json`, or `token.json` (all gitignored).
6. **Rate-limit keys identify the real caller** (JWT sub, else `X-Forwarded-For`),
   not the Next proxy peer. Keep new endpoints on the shared `limiter`.

## Commands

```bash
python -m pytest -q                                   # backend tests (Python 3.12; MOCK_MODE auto when GEMINI_API_KEY unset)
cd frontend && npm run typecheck && npm run build     # frontend
bash scripts/start-harness.sh [aurora|station|all|serve|stop]   # visual harness (SKIP_BUILD=1 to reuse). Never `next start`.
uvicorn tools.api.server:app --reload --port 8000     # local dev API
```

CI (`.github/workflows/ci.yml`) gates pytest + typecheck + build + supply-chain audit
on every push; Dependabot handles bumps. Dev box is **Windows / PowerShell**; the
POSIX snippets above also run via the Bash tool.

## Git

**Worktree per session (user policy, 2026-08-05).** Several sessions edit this repo at
once. **Before your first `Edit`/`Write`, call `EnterWorktree`** — it branches from
`origin/main` (`worktree.baseRef: fresh`), so you never inherit another session's
unpushed commits, WIP files, index or `.next`. The `SessionStart` hook
(`session_worktree.py`) tells you which side you're on. Read-only work needs no worktree.
A fresh worktree has no `node_modules`: junction it to the main repo for `typecheck`
(`next build` through a junction needs `--webpack`; Turbopack rejects an out-of-root
symlink), or `npm ci` in the worktree when a concurrent session is churning the shared
dir. Drop the junction with the reparse-point delete, **never `Remove-Item -Recurse`**.

After a completed task, stage + commit + **push directly to `main`** — no feature
branch, no asking first (user policy, 2026-06-29). `main` auto-deploys to Render prod,
so **verify green first** (the relevant pytest / typecheck / build / assert harness
must pass) — never ship red. Stage only the files for this task. Ship from the worktree:

```bash
git add <this task's files> && git commit
git fetch origin main
git rebase origin/main      # if this pulls anything in, RE-RUN the gates
git push origin HEAD:main   # fast-forward; carries only your commits
```

Re-`git fetch` immediately *before* the push — `origin/main` has moved twice inside one
verify cycle. Then `ExitWorktree` (remove). **Never push the shared checkout's local
`main`** — it carries other sessions' unpushed, unverified work.

**Exception:** a change that breaks prod the moment it lands but *before* out-of-band
setup (a new required env var/secret, a DB migration, a fail-closed guard) — still
ship, but say so plainly and coordinate the setup so `main` never boots broken.

## Guardrails (each encodes a real past failure → use the slash command)

- **Shell discipline.** PowerShell cmdlets go in the PowerShell tool; the Bash tool is
  POSIX-only. The `.claude/hooks/bash_guard.py` PreToolUse hook blocks violations —
  switch tools, don't fight it (its `settings.json` path is `${CLAUDE_PROJECT_DIR}`-anchored;
  keep it absolute — a relative path bricked the Bash tool in subdirs, 130 crashes).
  **Use absolute paths, never `cd <relative>`** — the Bash tool resets cwd each call, so
  `cd frontend && …` churned 131 failures in the 07-18 audit.
- **Read before edit.** Never `Edit`/`Write` a file you haven't `Read` this session (53
  bounced edits in the 07-18 audit); after any resume/compaction, **re-Read before
  editing** — the summary is not a Read. A `PreCompact` hook (`session_snapshot.py`) drops
  a mechanical `.session-handoff-auto.md` breadcrumb so a context-death resume isn't a total
  black box — it is not a substitute for `/handoff`.
- **Check in before long autonomous sweeps.** State the plan and surface a checkpoint
  before running many tools deep; unattended multi-step Read/Bash sweeps were the top
  interrupt trigger (236 aborts, most mid Read/Bash).
- **DB migrations → `/db-migrate`.** Never paste a file *path* into the Supabase SQL
  editor; never emit `ADD CONSTRAINT IF NOT EXISTS` / `CREATE POLICY IF NOT EXISTS`
  (Postgres 42601). Applied migrations are ledgered in `tools/db/migrations/APPLIED.md`.
- **Render preflight.** The live service builds the `Dockerfile` — never delete it
  (broke prod 2026-06-26). Render blocks SMTP (25/465/587): email goes via the
  **Gmail API** over HTTPS (`tools/shared/gmail_sender.py`; OAuth refresh token,
  never `smtplib`). New env var → ship only with the dashboard value coordinated.
- **Fixes must stick → `/ship-check`.** Any user-facing *state* invariant
  (show-once-per-day, streaks, idempotent submits) needs a regression test covering the
  repeat case AND a behavioral verify on the running app.
- **Design is locked → `/design-lock`.** Settled UI lives in `docs/design-locks.md`;
  refine within a lock (name the criterion you're changing), never silently rebuild it.
- **Session scoping.** Commit after every completed sub-task; near context limits run
  `/handoff` (~70% budget) — the snapshot is the only thing that survives an account switch.

## File map

```
tools/       Python tools (WAT execution) + the FastAPI app under tools/api/
workflows/   Markdown SOPs
frontend/    Next.js app (src/, public/, tests/)
cases/       Virtual-patient case JSON
tests/       pytest suite
docs/        specs, plans, ARCHITECTURE.md, SECURITY.md, notes/
.tmp/        Disposable scratch (gitignored)
.env         Secrets (gitignored) — see .env.template
```

Stay pragmatic. Stay reliable. Keep improving the system.
