# EyeBot

**An AI training platform for eye-care students.** Built for **SNEC** (Singapore
National Eye Centre) and running in production with real cohorts.

[![CI](https://github.com/calebteo07-art/SNEC_AI_CHATBOT/actions/workflows/ci.yml/badge.svg)](https://github.com/calebteo07-art/SNEC_AI_CHATBOT/actions/workflows/ci.yml)

Live app: **https://snec-ai-chatbot.onrender.com**

> **New to this project and taking it over?** Start with
> [**`HANDOVER.md`**](HANDOVER.md) — the inherited risks, the open decisions, and
> a first-week plan. Then come back here.

| Read this if you want to… | Go to |
|---|---|
| Understand what the app does | [What it is](#what-it-is) |
| Understand how it is built | [How it works](#how-it-works) · [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Run it on your own machine | [Run it locally](#run-it-locally) |
| Change something safely | [Making a change](#making-a-change) |
| **Deploy, configure or fix production** | [`docs/OPERATIONS.md`](docs/OPERATIONS.md) |
| Know how logins and roles are protected | [`docs/SECURITY.md`](docs/SECURITY.md) |
| Find my way around 130+ design documents | [`docs/INDEX.md`](docs/INDEX.md) |

---

## What it is

Students train for three allied-health roles: **Ophthalmic Assistant (OA)**,
**Ophthalmic Technician (OT)** and **Patient Service Associate (PSA)**. They open
EyeBot in a browser — nothing to install — and get six things:

| Feature | What it does |
|---|---|
| **Socratic tutor** | Answers a question with a better question instead of the answer. Grounded in an approved ophthalmology knowledge base (RAG), so it quotes real material rather than inventing it. Supports image attachments. |
| **Virtual patients** | 155 OSCE stations. The AI plays the patient; the student takes a history, performs procedures and writes a handover, under a 15-minute timer. Marked **40%** checklist coverage, **30%** consultation technique, **30%** judgement and safety. |
| **Flashcards** | Multiple-choice decks graded **instantly by fixed rules** — deliberately no AI in the study loop, so scoring is fast and always the same. |
| **Daily check-in** | One question a day, drawn from the flashcard bank. Feeds a streak. |
| **Gamification** | Lumens (points), levels, avatars, and a weekly league with five divisions. Resets every Monday. |
| **Staff console** | Cohort analytics, per-student reports and OSCE dossiers, account management, audit log. |

Staff sign in to the same app and get `/admin` on top. Three roles exist:
`student`, `trainer` and `admin` — only admins can create or remove accounts.

---

## How it works

One container runs **two processes**. The browser only ever talks to Next.js;
Next.js forwards API traffic to FastAPI over localhost.

```
    Browser
       |  HTTPS
       v
  ┌─────────────────────────────────────────────┐
  │  Next.js (public, $PORT)                     │   pages, assets, security headers
  │      | rewrites /api/* and /health           │
  │      v                                       │
  │  FastAPI (internal, 127.0.0.1:8000)          │   all JSON + SSE streaming
  └───────────────┬─────────────────────────────┘
                  |
     ┌────────────┼─────────────┬───────────────┐
     v            v             v               v
  Supabase     Gemini         Redis         Gmail API
  Postgres     AI models      counters      password emails
  + pgvector                  + Celery
```

**Why the proxy?** Everything is same-origin. The login cookie is `HttpOnly`, so
JavaScript can never read it, and server-sent event (SSE) streams from the tutor
survive without any CORS setup.

**Who owns what:** Next.js owns page security headers (CSP). FastAPI returns only
JSON and SSE — never HTML.

Full endpoint map: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### The stack

| Layer | What is used |
|---|---|
| Frontend | Next.js 16 (App Router, `output: standalone`), React 19, Tailwind 4, TanStack Query, Motion · Node 24 |
| Backend | FastAPI + uvicorn, async-first · Python 3.12 |
| AI | Google Gemini via `google-genai`, with RAG. Falls back to `MOCK_MODE` with no key |
| Data | Supabase (Postgres + pgvector for embeddings); Google Sheets for some rosters |
| Auth | Custom JWT in an HttpOnly cookie (`eyebot_token`) · bcrypt (cost 12) · OTP password reset |
| Async | Celery + Redis workers |
| Deploy | Render, single container, built from the `Dockerfile` |

---

## Run it locally

A step-by-step tutorial. About ten minutes.

### 0. What you need first

- **Python 3.12** (the version production runs — other versions may differ)
- **Node 24**
- **Git**
- A **Supabase** project — needed for any real data
- A **Gemini API key** — *optional*, see step 5

### 1. Get the code

```bash
git clone https://github.com/calebteo07-art/SNEC_AI_CHATBOT.git
cd SNEC_AI_CHATBOT
```

### 2. Install the backend

```bash
pip install -r requirements.txt -r requirements-dev.txt
```

### 3. Write your config

Copy the template and fill it in. Every key is commented in the file.

```bash
cp .env.template .env
```

The four that matter for a local run:

| Key | What to put |
|---|---|
| `SUPABASE_URL` | Your project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Your project service key |
| `JWT_SECRET` | Any long random string — generate one below |
| `GEMINI_API_KEY` | Your key, **or leave it blank** (see step 5) |

Generate a secret:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

**Never commit `.env`.** It is gitignored, and so are `credentials.json` and
`token.json`.

### 4. Start the two processes

Terminal one — the API:

```bash
uvicorn tools.api.server:app --reload --port 8000
```

Terminal two — the site:

```bash
cd frontend && npm install && npm run dev
```

Open **http://localhost:3000**. The frontend proxies `/api/*` to port 8000, so
you use one address for everything.

### 5. Running without a Gemini key

Leave `GEMINI_API_KEY` blank and the app boots into **`MOCK_MODE`**: every AI
call returns a canned response instead of hitting Google. Nothing crashes,
nothing is billed, and the whole test suite runs. It is the default for tests
and CI.

What that means in practice:

| | Works in `MOCK_MODE`? |
|---|---|
| Pages, login, navigation, flashcards, points | Yes — flashcard grading has no AI in it at all |
| Tutor replies, patient dialogue, OSCE marking | Placeholder text only |
| Anything touching student data | Needs a real Supabase project |

The boot guard (`tools/shared/config.py`) only refuses to start on missing
secrets when `ENVIRONMENT=production`, so local development stays easy.

### 6. Run the tests

```bash
python -m pytest -q                                  # backend
cd frontend && npm run typecheck && npm run build     # frontend
```

There is also a browser harness that boots the app and asserts against the real
rendered page:

```bash
bash scripts/start-harness.sh all        # SKIP_BUILD=1 to reuse the last build
```

Use the harness script rather than `next start` — the standalone output is flaky
when started directly.

---

## Where everything lives

```
frontend/     Next.js app — everything a user sees (src/, public/, tests/)
tools/        Python: the FastAPI app (tools/api/) plus every supporting tool
cases/        155 virtual-patient case files (JSON)
tests/        pytest suite
workflows/    Markdown SOPs — step-by-step procedures for repeatable jobs
docs/         Architecture, security, specs and design locks
scripts/      Production start, harness, dependency locking
.tmp/         Scratch. Gitignored — private notes go here, never in the repo
```

The backend is split by feature. Each router in `tools/api/routers/` owns one
part of the app:

| Router | Owns |
|---|---|
| `auth.py` | Login, logout, password reset, first-login change |
| `chat.py` | The tutor, including SSE streaming and RAG lookups |
| `cases.py` | OSCE stations — dialogue, checklist, marking |
| `student.py` · `home.py` | Profile, progress, points, home screen |
| `checkin.py` | The daily question and streak |
| `avatar.py` | Avatar picker |
| `supervisor.py` | Trainer analytics and reports |
| `admin.py` | Account management and audit — admins only |

Shared singletons, the rate limiter and its keying live in
`tools/api/shared.py`.

---

## Ideas you will meet in the code

**WAT — Workflows, Agents, Tools.** AI reasons; tested code executes. Five
chained 90%-accurate AI steps compound to about 59%, so anything deterministic is
pushed out of the prompt and into a script under `tools/`. Markdown SOPs live in
`workflows/`.

**`MOCK_MODE`.** No key means no live AI call. This is what keeps tests free and
deterministic.

**RAG.** The tutor searches an approved knowledge base (chunked and embedded in
pgvector) and answers from what it finds, instead of from the model's own memory.

**Identity comes from the token, never the request body.** The signed JWT's
`sub` claim is the user. A request that says "I am student X" is ignored.

**Four production invariants** — these are not style preferences, each one is a
real outage that already happened:

1. **Never block the event loop.** Gemini, bcrypt, SMTP and the sync Supabase
   client all get `asyncio.to_thread` plus a timeout. One blocking call stalls the
   entire worker.
2. **No shared in-process state.** Workers scale horizontally, so counters live
   in Redis and OTPs live in Supabase.
3. **Fail closed.** In production the app refuses to boot on a weak `JWT_SECRET`,
   missing Supabase keys or a wildcard `ALLOWED_ORIGINS`. A loud refusal beats
   quietly serving students from a broken config.
4. **Rate-limit keys identify the real caller** — the JWT subject, else
   `X-Forwarded-For`. Never the proxy's own address, or one user would throttle
   everybody.

---

## Making a change

The loop, in order:

1. **Write the failing test first**, and watch it fail. `tests/` for Python,
   `frontend/tests/` for Node harnesses.
2. **Write the smallest code that passes it.**
3. **Run the gates** — pytest, typecheck, build, and the harness if you touched
   the UI.
4. **Commit and push.** Every push runs [CI](.github/workflows/ci.yml): pytest on
   Python 3.12, frontend typecheck and production build, plus a supply-chain
   audit (`pip-audit` / `npm audit`). Dependabot proposes weekly bumps.
5. **Watch it deploy** and look at the live page.

> **`main` auto-deploys to production.** CI and the deploy run independently, so
> a red CI run does **not** stop the release. Verify green *before* you push.

Database changes are numbered SQL files in `tools/db/migrations/`, applied by
hand and recorded in `APPLIED.md`. Nothing runs them automatically.

Working with an AI coding assistant? [`CLAUDE.md`](CLAUDE.md) is the standing
briefing — the stack, the invariants, and the traps that have already broken
production once.

---

## Deploying

Render builds the **`Dockerfile`** and runs `scripts/start-prod.sh`, which starts
FastAPI on `127.0.0.1:8000` and the Next.js standalone server on `$PORT`. A cron
job pings `/health` every ten minutes so the instance does not idle out.
[`render.yaml`](render.yaml) declares the same Docker build, so the file and the
live service agree. **Never delete the `Dockerfile`** — that took production down
once.

Required production secrets, and the super-admin bootstrap, are listed in
[`docs/SECURITY.md`](docs/SECURITY.md). Secrets belong in the Render dashboard
and a local `.env` — nowhere else.

To carry more concurrent students: upgrade the Render plan, provision Redis and
set `REDIS_URL`, **then** raise `WEB_CONCURRENCY`. Raising it without Redis
splits shared state across workers and causes intermittent, hard-to-trace faults.

---

## Status

Production. Deployed to a real institution, with real student records — treat
every change as production-bound: secure, reproducible, observable, scale-safe.
