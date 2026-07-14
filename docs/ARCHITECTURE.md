# Architecture

## Topology — single container, two processes

```
                         ┌──────────────────────────────────────────┐
   browser ──HTTPS──────▶│  Next.js standalone  (public, $PORT)      │
                         │   • serves the React app + static assets  │
                         │   • next.config.ts rewrites:              │
                         │       /api/*   ─▶ 127.0.0.1:8000           │
                         │       /health  ─▶ 127.0.0.1:8000           │
                         │   • owns page security headers (CSP)       │
                         └───────────────┬──────────────────────────┘
                                         │ same-origin proxy
                                         ▼
                         ┌──────────────────────────────────────────┐
                         │  FastAPI  (internal, 127.0.0.1:8000)      │
                         │   • JSON + SSE only                        │
                         │   • lifespan: fail-closed config guard,    │
                         │     thread-pool bound, Sentry (opt-in)     │
                         │   • middleware: request-id/log, size guard,│
                         │     security headers, CORS                 │
                         └───────┬───────────────┬──────────────┬────┘
                                 ▼               ▼              ▼
                            Supabase         Gemini          Redis
                        (Postgres+pgvector) (google-genai)  (Celery + rate limit)
```

Same-origin proxying is deliberate: it keeps the auth cookie and Server-Sent
Events streaming intact end-to-end. The browser never talks to FastAPI directly.

`scripts/start-prod.sh` launches both processes; either dying takes the
container down so Render restarts it.

## Request lifecycle

1. **Next** serves the page (with CSP) and proxies API calls server-side.
2. **`request_context`** (outermost middleware) assigns/propagates `X-Request-ID`
   and emits one structured JSON access-log line (method, path, status, latency).
3. **`limit_request_size`** rejects oversized bodies (413) before routing.
4. **CORS** + **security headers** are applied.
5. The **router** dependency `get_current_user` decodes the `eyebot_token`
   cookie → `current_user` (`sub`, `role`, `student_role`).
6. **`limiter`** enforces per-user / per-IP rate limits (Redis-backed in prod).
7. Blocking work (Gemini, bcrypt, Supabase sync client, SMTP) runs via
   `asyncio.to_thread` so the event loop stays free.

## Backend modules

```
tools/api/
  server.py            app factory, lifespan, middleware, /health, /health/ready
  shared.py            limiter + rate_limit_key, prompts, role context
  health.py            readiness probes (Supabase, Redis)
  routers/
    auth.py            login, onboard, change/reset password, /me, logout
    cases.py           case list/detail, OSCE station, chat, observe, submit
    chat.py            Socratic tutor (SSE), end-session
    checkin.py         daily check-in question/answer
    student.py         progress, flashcards, gamification sync, leaderboard
    admin.py           approved roster, promote, CSV upload, token summary
    supervisor.py      cohort analytics, at-risk, benchmarks, reports, digest
    media.py           media manifest + async job status
tools/shared/
  config.py            assert_production_ready() — fail-closed boot guard
  jwt_utils.py         token create/decode, cookie set/clear, role guards
  auth.py              bcrypt hash/verify, password generation
  logging_config.py    structured JSON logging + dormant Sentry hook
  gemini_client.py     Gemini wrapper + MOCK_MODE
  db.py / identity.py  Supabase access, student identity, consent
  otp_store.py         Supabase-backed OTP (hashed, 15-min TTL)
tools/workers/         Celery tasks (media generation, digests)
tools/kb/              RAG ingestion, chunking, embeddings, search
```

## API surface (selected)

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/auth/login` · `/api/auth/logout` · `/api/onboard` | public / cookie |
| POST | `/api/auth/request-reset` · `/api/auth/reset-password` | public (rate-limited) |
| POST | `/api/auth/change-password` · GET `/api/auth/me` | cookie |
| POST | `/api/chat` (SSE) · `/api/end-session` | student |
| GET  | `/api/cases` · `/api/cases/{id}` · `/api/cases/{id}/station` | student |
| POST | `/api/cases/{id}/chat` · `/observe` · `/action` · `/submit` | student |
| GET/POST | `/api/checkin/*` · `/api/flashcards/*` · `/api/gamification/sync` | student |
| GET  | `/api/progress` · `/api/leaderboard` · `/api/study-suggestion` | student |
| GET | `/api/admin/*` reads (roster, students, activity, student detail, token-summary) | **staff** |
| POST/DELETE | `/api/admin/approved` · `/upload-csv` · `/promote` (add/remove/provision) | **admin** |
| GET/POST | `/api/supervisor/*` (cohort, at-risk, reports, digest) | **staff** |
| PATCH | `/api/profile/role` (content-pool toggle) | **staff** |
| GET | `/health` (liveness) · `/health/ready` (readiness, 503 on dep down) | public |

Top-level roles are **`student` · `trainer` · `admin`** — the old `supervisor`
role is removed (a lingering `supervisors.role == "supervisor"` is normalised to
`trainer` at login). Enforcement uses two dependencies in `jwt_utils.py`:
`require_staff` (`{admin, trainer}`) gates the read-only analytics routes
(`/api/supervisor/*` and the `/api/admin/*` reads); `require_admin` (`{admin}`)
keeps add/remove/CSV/promote admin-only. Trainers and admins run the **same light
student app** plus a content-pool toggle and the dark `/analytics` page (a Next
route backed by the `require_staff` endpoints); the old dark admin/supervisor
console is retired. The effective content pool is `current_user["student_role"]`
(OA·PSA vs OT), derived server-side from `student_profiles.role`.

## Data & async

- **Supabase** holds students, consent, auth hashes, approved roster, sessions,
  case results, gamification/streak/XP, OTPs, and the pgvector knowledge base.
- **Redis** backs Celery (async media/report jobs) and, in production, the
  rate-limiter store so counters are shared across workers.
- **Google Sheets** is used for some roster/audit flows.

## Scaling notes

The app is horizontal-scale-safe: identity is stateless (JWT), shared counters
move to Redis, and OTPs are in Supabase. The only in-memory structure is an
idempotent per-worker case-JSON read cache. Raise `WEB_CONCURRENCY` and provision
Redis to scale out; see `docs/SECURITY.md` and `render.yaml`.
