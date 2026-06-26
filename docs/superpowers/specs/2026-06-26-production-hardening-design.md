# Production-Hardening Design — EyeBot (SNEC AI Chatbot)

**Date:** 2026-06-26
**Goal:** Make EyeBot ready for production-scale deployment to higher-education
institutions. Close the gaps between "works in a pilot" and "world-class, secure,
reproducible, observable, and horizontally scalable." Pre-launch (no live cohort),
budget available for real concurrency on Render.

This is a hardening pass, **not** a rewrite. The codebase is already well above
typical "vibe-coded" quality (bounded thread-pool, httpOnly+secure cookies,
per-endpoint rate limits, non-root Docker, CSP, leak-free OTP reset). We close a
specific, evidence-backed set of gaps.

---

## Audit findings (evidence)

### 🔴 Exploitable / correctness
1. **Rate limiting is effectively global.** `Limiter(key_func=get_remote_address)`
   (`tools/api/shared.py:7`), but Next proxies *all* traffic to FastAPI from
   `127.0.0.1`. Every request shares one bucket → one student's 5 logins lock out
   the whole school, and it provides ~zero abuse protection. Also in-memory →
   breaks under multiple workers.
2. **Legacy login accepts any password.** Accounts with no stored hash authenticate
   on an arbitrary string and are issued a token (`tools/api/routers/auth.py:94`).
3. **JWT default secret only warns.** A misconfigured prod deploy silently runs on
   `dev-only-secret` → every token forgeable (`tools/shared/jwt_utils.py:8`).

### 🟠 Reliability / scale / observability
4. **No CI.** 24 pytest files + 4 frontend harnesses exist but nothing enforces them.
5. **Non-reproducible Python builds.** 23 loose `>=` pins, no lockfile; every Render
   deploy `pip install`s fresh → a silent transitive/major bump can break prod.
6. **Shallow `/health`** — never checks Supabase, so keep-alive stays green while the
   DB is down.
7. **No structured logging / error tracking.** `print()` only; deprecated
   `@app.on_event("startup")`.
8. **Single worker, in-memory limiter** — not horizontal-scale safe.

### 🟡 Hygiene / docs
9. `chinita/` is a separate 255-file project (~31% of tracked files); 9 loose root
   images (incl. 1.9 MB jpeg); stray `.log`/narrative `.md` files — all tracked.
10. `CLAUDE.md` describes a generic "WAT / web-scraping" framework, not this app.

**Correction during grounding:** the OTP store is *already* Supabase-backed and
multi-worker safe — no change needed there. The in-memory `_case_cache` is a
harmless idempotent read-through cache — documented, left per-worker.

---

## Design — four waves

Each wave is its own commit/PR; tests green before moving on; backend changes
are test-first.

### Wave 1 — Security & correctness 🔴

**1.1 Central config (`tools/shared/config.py`)** — a `pydantic-settings` `Settings`
object that is the single source of truth for env. A `validate_for_production()`
call in the app lifespan **hard-fails boot** when `ENVIRONMENT=production` and:
`JWT_SECRET` unset/default, `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` missing, or
`ALLOWED_ORIGINS == "*"`. Dev keeps permissive defaults + warnings.

**1.2 Rate limiting — Redis-backed + correctly keyed.**
- `key_func` resolution order: (a) authenticated → JWT `sub` from the
  `eyebot_token` cookie; (b) pre-auth login/reset → `email-in-body` is not available
  in `key_func`, so key on the **real client IP** parsed from the leftmost
  `X-Forwarded-For` entry (Render → Next forwards it), falling back to
  `get_remote_address`.
- `storage_uri=REDIS_URL` so buckets are shared across workers. Falls back to
  in-memory with a warning if Redis is unreachable (dev).

**1.3 Harden legacy login.** Remove the "no hash → accept any password" path. An
account with an approved record but no `password_hash` cannot log in with an
arbitrary string; the response directs them to the existing OTP/reset flow to set
their first password. (Safe because pre-launch — no hashless users to migrate.)

**1.4 Lock CORS in prod.** When `ENVIRONMENT=production`, `ALLOWED_ORIGINS` must be
an explicit origin list (validated in 1.1); `allow_credentials=True`. The `*`
default is dev-only.

**1.5 Request-body size guard** — middleware rejecting bodies over a configurable
cap (default 1 MB; uploads excepted) so a single request can't exhaust the instance.

**Tests:** rate-limit keys differ per user / per forwarded IP and share across
limiter instances; hashless login returns the set-password path, not a token;
`validate_for_production()` raises on bad config and passes on good.

### Wave 2 — Reliability, scale & observability 🟠

**2.1 CI** (`.github/workflows/ci.yml`): matrix of `pytest`, `tsc --noEmit`,
`next build`, the aurora/station harnesses, `pip-audit`, `npm audit --omit=dev`.
Gates PRs to `main`. Add `.github/dependabot.yml` (pip + npm, weekly).

**2.2 Reproducible builds.** `pip-compile` `requirements.in` → hash-pinned
`requirements.lock`; `render-build.sh` + `Dockerfile` install from the lock.
Keep `requirements.in` as the human-edited source.

**2.3 Observability.** `tools/shared/logging_config.py`: JSON-ish structured stdlib
logging, a request-ID + latency middleware, `print()` → `logger`. Dormant Sentry
hook initialised only when `SENTRY_DSN` is set (dependency added but optional).

**2.4 Health split.** `/health` stays cheap (liveness, keep-alive). New
`/health/ready` pings Supabase + Redis with short timeouts and returns 503 if a
dependency is down — for real load-balancer readiness probes.

**2.5 Multi-worker.** Replace `on_event` with `lifespan`; `start-prod.sh` runs
`--workers ${WEB_CONCURRENCY:-2}`; document the no-in-memory-state rule.

### Wave 3 — Repo spring-clean 🟡

`git rm` `chinita/`, the 9 loose root images, `.tmpuvicorn.log`, and stray narrative
`.md`s (preserve `becky.md`/`dev-journal.md` content under `docs/notes/` if worth
keeping). Tighten `.gitignore`. Files remain on disk; recoverable from history.

### Wave 4 — Docs & DX 🟡

Rewrite `CLAUDE.md` for the real architecture, security model, deploy topology, and
conventions. Add `README.md`, `ARCHITECTURE.md`, `SECURITY.md`, and a fully
documented `.env.template`.

---

## Non-goals
- No frontend visual redesign (it's already strong; covered by aurora/station harnesses).
- No migration of the AI prompt/cost work (becky.md is already shipped).
- No change to the OTP store (already durable).

## Verification
- `pytest` green (currently ~380); new Wave-1 tests added and passing.
- `tsc --noEmit` + `next build` clean; aurora_assert + station_assert green.
- `validate_for_production()` proven to fail-closed.
- CI green on a PR.
