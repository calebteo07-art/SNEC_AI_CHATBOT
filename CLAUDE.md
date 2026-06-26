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
| Deploy     | Render **native Python runtime** (`render-build.sh` → `scripts/start-prod.sh`; no Dockerfile) + keep-alive cron. Auto-deploys `main`. |

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
# Visual harnesses (need the standalone server running)
node frontend/tests/aurora_assert.mjs
node frontend/tests/station_assert.mjs
# Local dev API
uvicorn tools.api.server:app --reload --port 8000
```

`pytest` auto-enables `MOCK_MODE` when `GEMINI_API_KEY` is unset — no key or
network needed. The dev box is **Windows / PowerShell**; the POSIX snippets above
also run via the Bash tool.

CI (`.github/workflows/ci.yml`) gates pytest + typecheck + build + supply-chain
audit on every push. Dependabot manages dependency bumps.

### Git
After a completed task, stage + commit + push. **Never push straight to `main`
for risky changes** — `main` auto-deploys to Render production. Branch, verify,
then merge.

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
