# Developing EyeBot

How to run it, change it safely, and ship it. For what the system *is*, start at the
[README](../README.md); for production operations, [`OPERATIONS.md`](OPERATIONS.md).

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
cd frontend && npm ci && npm run dev
```

Open **http://localhost:3000**. The frontend proxies `/api/*` to port 8000, so
you use one address for everything.

> **Use `npm ci`, never `npm install`** — especially on Windows. `npm install`
> rewrites `package-lock.json` against your own platform and drops the
> Linux/wasm optional dependencies CI and the Render Docker build need. Every
> local gate then passes while `npm ci` fails on Linux. This has broken `main`
> before. If you must change a dependency, run `npm install` deliberately, then
> check the lockfile still contains the `linux-x64` entries before committing.

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
| `chat.py` | The tutor — SSE streaming, KB injection and context caching |
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

**Grounding — read this before you go looking for a vector search.** The tutor
does **not** retrieve at query time. `tools/api/routers/chat.py` injects the
*entire* curated knowledge base (~6.1k tokens) into the system prompt on every
conversation and relies on Gemini context caching so that static prefix is not
re-billed each turn. The line in the code is literally `# No RAG:`.

pgvector and the embedding pipeline under `tools/kb/` are real, but they belong
to **ingestion** — building and curating the knowledge base offline. Nothing
queries them while a student is chatting. Earlier versions of the README
described a query-time RAG lookup; that was retired and the docs lagged behind.

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
3. **Run the gates**, all of them:

   ```bash
   python -m pytest -q                                  # backend
   cd frontend && npm run typecheck && npm run build     # frontend
   bash scripts/start-harness.sh all                     # browser harnesses
   ```

   The harnesses are not optional extras — CI discovers and runs *every* one of
   them, and because the deploy does not wait for CI (see below), a harness you
   skipped locally fails after the change is already live.
4. **Commit and push.** Every push runs [CI](../.github/workflows/ci.yml): pytest on
   Python 3.12, frontend typecheck, logic harnesses, the production build, every
   browser harness against real Chromium, plus a supply-chain audit (`pip-audit` /
   `npm audit` / signature verification). Dependabot proposes weekly bumps.
5. **Watch it deploy** and look at the live page.

> **`main` auto-deploys to production.** CI and the deploy run independently, so
> a red CI run does **not** stop the release. Verify green *before* you push.

Database changes are numbered SQL files in `tools/db/migrations/`, applied by
hand and recorded in `APPLIED.md`. Nothing runs them automatically.

Working with an AI coding assistant? [`CLAUDE.md`](../CLAUDE.md) is the standing
briefing — the stack, the invariants, and the traps that have already broken
production once.

---

## Deploying

Render builds the **`Dockerfile`** and runs `scripts/start-prod.sh`, which starts
FastAPI on `127.0.0.1:8000` and the Next.js standalone server on `$PORT`. A cron
job pings `/health` every ten minutes so the instance does not idle out.
[`render.yaml`](../render.yaml) declares the same Docker build, so the file and the
live service agree. **Never delete the `Dockerfile`** — that took production down
once.

Required production secrets, and the super-admin bootstrap, are listed in
[`SECURITY.md`](SECURITY.md). Secrets belong in the Render dashboard
and a local `.env` — nowhere else.

To carry more concurrent students: upgrade the Render plan, provision Redis and
set `REDIS_URL`, **then** raise `WEB_CONCURRENCY`. Raising it without Redis
splits shared state across workers and causes intermittent, hard-to-trace faults.
