# EyeBot

AI training platform for **SNEC** (Singapore National Eye Centre) allied-health
students — Ophthalmic Assistants (OA), Technicians (OT), and Patient Service
Associates (PSA).

EyeBot blends a Socratic AI tutor, virtual-patient **OSCE stations**, spaced-
repetition flashcards, daily check-ins, gamification, and staff analytics
dashboards — all grounded in a retrieval-augmented (RAG) ophthalmology knowledge
base. Built for production deployment to higher-education institutions.

> **Architecture:** see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
> **Security model:** see [`docs/SECURITY.md`](docs/SECURITY.md)
> **Agent guide:** see [`CLAUDE.md`](CLAUDE.md)

---

## Stack

| Layer    | Tech |
|----------|------|
| Frontend | Next.js 16 (App Router, standalone), React 19, Tailwind 4, TanStack Query, Motion/GSAP, React-Three-Fiber · Node 24 |
| Backend  | FastAPI + uvicorn, async-first · Python 3.12 |
| AI       | Google Gemini (`google-genai`) with RAG; graceful `MOCK_MODE` without a key |
| Data     | Supabase (Postgres + pgvector); Google Sheets rosters |
| Auth     | Custom JWT in an HttpOnly cookie · bcrypt · OTP password reset |
| Async    | Celery + Redis |
| Deploy   | Render single container + keep-alive cron |

---

## Quickstart (local)

**Prerequisites:** Python 3.12, Node 24, a Supabase project, a Gemini API key
(optional — omit for `MOCK_MODE`).

```bash
# 1. Configure
cp .env.template .env        # then fill in the values (see comments in the file)

# 2. Backend
pip install -r requirements.txt -r requirements-dev.txt
uvicorn tools.api.server:app --reload --port 8000

# 3. Frontend (separate terminal)
cd frontend
npm install
npm run dev                  # http://localhost:3000, proxies /api to :8000
```

Generate a JWT secret with:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

---

## Testing & CI

```bash
python -m pytest -q                          # backend suite
cd frontend && npm run typecheck && npm run build
```

Every push runs [CI](.github/workflows/ci.yml): pytest on Python 3.12 (prod
parity), frontend typecheck + production build, and a supply-chain audit
(`pip-audit` / `npm audit`). Dependabot proposes weekly dependency updates.

---

## Deployment

Deployed on Render via [`render.yaml`](render.yaml) as a single container that
runs both the Next.js standalone server (public) and FastAPI (internal). The
boot guard refuses to start in production unless the required secrets are set —
see [`docs/SECURITY.md`](docs/SECURITY.md) for the full checklist and the
super-admin bootstrap procedure.

For real concurrent cohorts: upgrade the Render plan, raise `WEB_CONCURRENCY`,
and provision a Render Key Value (Redis) store for `REDIS_URL` so rate-limit
state is shared across workers.

---

## Repository layout

```
tools/        Python tools (WAT execution layer) + FastAPI app (tools/api/)
workflows/    Markdown SOPs
frontend/     Next.js app
cases/        Virtual-patient case JSON
tests/        pytest suite
docs/         specs, plans, architecture & security docs
```
