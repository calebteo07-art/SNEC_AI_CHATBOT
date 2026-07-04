# EyeBot — Agent Operating Guide

EyeBot is a production AI training platform for **SNEC** (Singapore National Eye
Centre) allied-health students — Ophthalmic Assistants (OA), Technicians (OT),
and Patient Service Associates (PSA). It runs a Socratic tutor, virtual-patient
OSCE stations, spaced-repetition flashcards, daily check-ins, gamification, and
staff dashboards, grounded in a Supabase RAG knowledge base.

This is a **real system deployed to higher-education institutions**. Treat every
change as production-bound: secure, reproducible, observable, and scale-safe.

---

## The WAT Architecture (Workflows · Agents · Tools)

Probabilistic AI handles reasoning; deterministic code handles execution. That
separation is what makes the system reliable — five chained 90%-accurate AI steps
compound to ~59% success, so we offload execution to tested scripts.

- **Workflows** (`workflows/`) — Markdown SOPs: objective, inputs, which tools,
  expected outputs, edge cases.
- **Agents** (you) — read the workflow, run tools in order, recover from errors,
  ask when genuinely blocked. Connect intent to execution; don't do everything
  inline.
- **Tools** (`tools/`) — Python scripts doing the actual work (AI calls, DB,
  transforms). Consistent, testable, fast. **Look for an existing tool before
  building one.** Don't create/overwrite workflows without explicit permission.

---

## System architecture (the real stack)

**Single-container topology** (`scripts/start-prod.sh`):
```
browser ──HTTPS──▶ Next.js standalone (public, $PORT)
                      │  next.config.ts rewrites /api/* and /health
                      ▼
                   FastAPI (internal, 127.0.0.1:8000)  ──▶ Supabase · Gemini · Redis
```
Same-origin proxy keeps cookies + SSE intact. **Next owns page security headers
(CSP); FastAPI returns only JSON/SSE.**

| Layer      | Reality (verify before asserting) |
|------------|-----------------------------------|
| Frontend   | Next.js 16 (App Router, `output: standalone`), React 19, Tailwind 4, TanStack Query, Motion/GSAP, R3F. Node 24. |
| Backend    | FastAPI + uvicorn (Python **3.12** in prod), async-first. |
| AI         | Google Gemini via `google-genai` (`tools/shared/gemini_client.py`). `MOCK_MODE` when no key. |
| Data       | Supabase (Postgres + pgvector RAG); Google Sheets for some rosters. |
| Auth       | Custom JWT in an **HttpOnly** cookie (`eyebot_token`); bcrypt(cost 12); OTP reset. |
| Async      | Celery + Redis workers (`tools/workers/`). |
| Deploy     | Render, auto-deploys `main` + keep-alive cron. **The live service builds the `Dockerfile`** (multi-stage → Next standalone + Python 3.12, runs `scripts/start-prod.sh`). `render.yaml` *also* declares an equivalent native-Python build (`render-build.sh`) — they've drifted, so **do not delete the `Dockerfile`**: removing it broke prod (2026-06-26). Keep both paths working. |

Backend entrypoint: `tools/api/server.py`. Routers: `tools/api/routers/`
(auth, cases, admin, supervisor, chat, checkin, student, media). Shared singletons
+ rate-limit keying: `tools/api/shared.py`. See `docs/ARCHITECTURE.md` for the
endpoint map and `docs/SECURITY.md` for the security model.

---

## Production invariants (do not violate)

1. **Never block the event loop.** Prod is a few uvicorn workers on a small Render
   instance. Wrap every blocking call (Gemini, bcrypt, SMTP, Supabase sync
   client) in `asyncio.to_thread` with a timeout. One blocking call stalls the
   whole worker.
2. **No per-process in-memory state that must be shared.** Workers scale
   horizontally (`WEB_CONCURRENCY`). Shared state (rate-limit counters) lives in
   Redis when `REDIS_URL` is set; OTPs live in Supabase. The case cache is an
   idempotent per-worker read cache only.
3. **Fail closed.** `tools/shared/config.py::assert_production_ready()` runs in the
   app lifespan and refuses to boot in production on an insecure `JWT_SECRET`,
   missing Supabase keys, or wildcard/empty `ALLOWED_ORIGINS`. Don't weaken it.
4. **Identity comes from the JWT, never the request body.** `current_user["sub"]`
   is the source of truth (`tools/shared/jwt_utils.py`).
5. **Secrets only in env / Render dashboard.** Never commit `.env`,
   `credentials.json`, or `token.json` (all gitignored).
6. **Rate-limit keys identify the real caller** (JWT sub, else `X-Forwarded-For`),
   not the Next proxy peer. Keep new endpoints on the shared `limiter`.

---

## Working in this codebase

- **Process skills first.** Brainstorm before building; TDD for any feature or
  bugfix (write the failing test, watch it fail, minimal pass); systematic
  debugging before proposing fixes. Tests live in `tests/` (pytest) and
  `frontend/tests/` (Node harnesses).
- **Match the surrounding code.** Comment density, naming, async idioms. Keep
  files focused; a growing file usually signals too many responsibilities.
- **Verify before asserting.** Confirm against the code, DB, or `docs/` before
  claiming how the system behaves — the stack drifts and memory goes stale.
- **Live AI calls cost real money and burn prod quota.** Tests and the visual
  harnesses run keyless in `MOCK_MODE`; never fire a live Gemini text/image
  generation without explicit user go-ahead.
- **Self-improvement loop:** identify what broke → fix the tool → verify → update
  the workflow → move on more robust.

### Commands
```bash
# Backend tests (mirror CI — Python 3.12)
python -m pytest -q
# Frontend
cd frontend && npm run typecheck && npm run build
# Visual harnesses — ONE canonical runner (build → copy static/public into
# .next/standalone → serve → warm dynamic routes → assert). Never `next start`.
bash scripts/start-harness.sh [aurora|station|all|serve|stop]   # SKIP_BUILD=1 to reuse the build
# Local dev API
uvicorn tools.api.server:app --reload --port 8000
```

`pytest` auto-enables `MOCK_MODE` when `GEMINI_API_KEY` is unset — no key or
network needed. The dev box is **Windows / PowerShell**; the POSIX snippets above
also run via the Bash tool.

CI (`.github/workflows/ci.yml`) gates pytest + typecheck + build + supply-chain
audit on every push. Dependabot manages dependency bumps.

### Git
After a completed task, stage + commit + push **directly to `main`** — no
feature branch, no asking first (user policy, 2026-06-29: "all dev auto-ships to
`main`"). `main` auto-deploys to Render production, so **always verify first** —
the relevant `pytest` / `typecheck` / `build` / assert harness must be green
before you push. Never ship red. Stage only the files relevant to the task (the
tree often carries unrelated dirty files).

The one exception: a change that would break prod the moment its code lands but
*before* out-of-band setup is done (a new required env var/secret, a DB
migration, a fail-closed config guard). For those, still ship — but say so
plainly and coordinate the setup so `main` never boots broken.

## Recurring-friction guardrails (session audit, 2026-07-04)

Each rule below encodes a failure that recurred across multiple sessions. The
project slash commands (`.claude/commands/`) are the executable versions.

- **Shell discipline.** PowerShell cmdlets go in the PowerShell tool; the Bash
  tool is POSIX-only (32 sessions hit exit-127 mixing them). A PreToolUse hook
  (`.claude/hooks/bash_guard.py`) blocks violations — don't fight it, switch tools.
- **DB migrations → `/db-migrate`.** Never paste a file *path* into the Supabase
  SQL editor, and never emit `ADD CONSTRAINT IF NOT EXISTS` / `CREATE POLICY IF
  NOT EXISTS` (Postgres rejects both, error 42601). `tools/db/lint_migration.py`
  gates this; applied migrations are ledgered in `tools/db/migrations/APPLIED.md`.
- **Render preflight.** The live service builds the `Dockerfile` — never delete it
  (broke prod 2026-06-26). Render blocks outbound SMTP (25/465/587): email goes via
  HTTPS providers (Brevo), never `smtplib`. Code needing a new env var ships only
  with the dashboard value coordinated (see Git exception above).
- **Fixes must stick → `/ship-check`.** Any user-facing *state* invariant
  (show-once-per-day, streaks, idempotent submits) requires a regression test that
  covers the repeat case (second login, same calendar day) AND a behavioral verify
  on the running app — green unit tests alone repeatedly failed to keep the
  check-in bug fixed (re-reported 5× over 10 days, June 2026).
- **Design is locked → `/design-lock`.** Settled UI directions live in
  `docs/design-locks.md`. Refine within a lock (name the acceptance criterion you're
  changing); never silently rebuild a locked feature from scratch.
- **Session scoping.** Commit after every completed sub-task, not just at the end.
  Nearing context limits, run `/handoff` proactively (~70% budget) — the snapshot
  is the only thing that survives an account switch.

## File structure
```
tools/          Python tools (WAT execution layer) + the FastAPI app under tools/api/
workflows/      Markdown SOPs
frontend/       Next.js app (src/, public/, tests/)
cases/          Virtual-patient case JSON
tests/          pytest suite
docs/           specs, plans, ARCHITECTURE.md, SECURITY.md, notes/
.tmp/           Disposable scratch (regenerated; gitignored)
.env            Secrets (gitignored) — see .env.template
```

Stay pragmatic. Stay reliable. Keep improving the system.
