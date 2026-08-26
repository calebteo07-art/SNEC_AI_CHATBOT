# EyeBot — Production Operations Runbook

The operator's manual: how to deploy, configure, watch and recover the live
service. [`ARCHITECTURE.md`](ARCHITECTURE.md) explains how the app is built;
this file explains how to keep it running.

> **This repository is public.** No secret value appears here. Every entry below
> names *what* a setting is and *where to obtain it*, never the value itself.
> Actual values live in the Render dashboard and the institution's password
> manager. See [Access and accounts](#11-access-and-accounts).

---

## 1. Topology

One Render service, one container, two processes.

```
  Browser ──HTTPS──▶  Next.js (public, $PORT)
                        │ rewrites /api/* and /health
                        ▼
                      FastAPI (internal, 127.0.0.1:8000)
                        │
       ┌────────────────┼──────────────┬─────────────┐
       ▼                ▼              ▼             ▼
   Supabase          Gemini          Redis       Gmail API
   Postgres          AI models       counters    password email
   + pgvector                        (optional)
```

| Thing | Where | Notes |
|---|---|---|
| Web service `eyebot` | Render, region **singapore**, plan **free** | Builds `Dockerfile`; starts `scripts/start-prod.sh` |
| Cron `eyebot-keep-alive` | Render, every 10 min | `GET /health` so the free instance does not idle out |
| Database | Supabase Postgres + pgvector | **Region differs from the app** — see [§7](#7-data-protection-posture) |
| Redis | Render Key Value (optional) | Only required when `WEB_CONCURRENCY > 1` |

Both processes live or die together. If FastAPI fails to boot, Next.js still
serves pages but every `/api/*` call fails — the app looks up but is not.

---

## 2. Environment variables — complete inventory

Derived by grepping every `os.environ` / `os.getenv` / `process.env` read in the
codebase, not from memory. **29 variables are read by code.**

### 2.1 Required in production — the app refuses to boot without these

`tools/shared/config.py::assert_production_ready` fails the boot and names the
offending setting in the log. A loud refusal is deliberate: the alternative is
serving students from a broken configuration.

| Variable | What it is | Where to get it | If missing / wrong |
|---|---|---|---|
| `JWT_SECRET` | 64-hex signing secret for login tokens | Generate: `python -c "import secrets; print(secrets.token_hex(32))"` | **Boot refused.** If *changed*, every user is logged out at once (they simply log back in) |
| `SUPABASE_URL` | Project API URL | Supabase → Settings → API | **Boot refused** |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (**not** the anon key — bulk RAG inserts need it) | Supabase → Settings → API | **Boot refused** |
| `ALLOWED_ORIGINS` | Comma-separated public origins. Must not be `*` or empty | Your own service URL | **Boot refused.** Also doubles as the app's public base URL for links in outbound email |
| `GEMINI_API_KEY` | The AI key | Google AI Studio | **Boot refused** — see the warning below |
| `ENVIRONMENT` | `production` \| `development` | — | Set to `production` on Render. Drives the guard, the cookie `Secure` flag and Redis-backed rate limiting |

> **Why `GEMINI_API_KEY` is a boot blocker.** It was added to the guard after a
> prod boot without it started *green* and served `MOCK_MODE` to real students:
> the virtual patient answered by reciting the grading rubric, no checklist step
> could ever tick, and every submission returned an identical score. `/health`
> published `mock_mode: true`, but the keep-alive cron only checks for HTTP 200,
> so nothing noticed. Do not weaken this check.

### 2.2 Operationally important

| Variable | What it is | Default | Notes |
|---|---|---|---|
| `SUPER_ADMIN_EMAIL` | Bootstrap admin address | *(blank)* | Blank fails closed. Must point at an address the **institution** controls, not an individual |
| `WEB_CONCURRENCY` | uvicorn worker count | `1` | **Never raise without setting `REDIS_URL`** — see [§9](#9-scaling) |
| `REDIS_URL` | Shared counters, rate limits, Celery | *(unset)* | Falls back to per-worker in-memory. Fine at `WEB_CONCURRENCY=1`, unsafe above it |
| `EMAIL_FROM` | The authorised Gmail account | — | Password-reset email breaks silently without the `GMAIL_*` set |
| `GMAIL_CLIENT_ID` | OAuth client (Desktop app) | — | Google Cloud → Credentials |
| `GMAIL_CLIENT_SECRET` | OAuth client secret | — | Google Cloud → Credentials |
| `GMAIL_REFRESH_TOKEN` | Long-lived send permission | — | Mint with `scripts/gmail_oauth_setup.py`. **Painful to regenerate from nothing** — keep a copy |

### 2.3 Tuning and optional

| Variable | Default | What it does |
|---|---|---|
| `JWT_EXPIRE_HOURS` | `720` | Absolute cap on token lifetime; the cookie itself is session-scoped |
| `MAX_REQUEST_BYTES` | `2000000` | Largest accepted request body |
| `THREAD_POOL_TOKENS` | `64` | Bound on concurrent blocking calls pushed off the event loop |
| `LOG_LEVEL` | `INFO` | `DEBUG` \| `INFO` \| `WARNING` \| `ERROR` |
| `MOCK_MODE` | `false` | Force canned AI even with a key present |
| `RATELIMIT_STORAGE_URI` | follows `REDIS_URL` | Override the rate-limit store explicitly |
| `SENTRY_DSN` | *(unset)* | **Error tracking, currently dormant** — see [§8](#8-observability) |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.0` | Performance sampling |
| `GOOGLE_SPREADSHEET_ID` | *(unset)* | Roster import from Google Sheets |

### 2.4 Read by code but **not** in `.env.template`

These work, but a new operator would never discover them. The first two are the
most consequential in this whole table — they are the lever you pull when the
Gemini balance runs down.

| Variable | Where read | Why it matters |
|---|---|---|
| `GEMINI_API_KEY_2` | `tools/shared/gemini_client.py:47` | **Fallback key rotation.** Add a second key and the client rotates to it |
| `GEMINI_API_KEY_3` | `tools/shared/gemini_client.py:48` | Third key in the pool |
| `GEMINI_TIMEOUT_MS` | `tools/api/routers/cases.py` | Transport timeout for AI calls |
| `GEMINI_CONTEXT_CACHE` | gemini client | Toggle Gemini context caching |
| `GEMINI_CONTEXT_CACHE_TTL_S` | gemini client | Cache lifetime |
| `OSCE_GRADE_TIMEOUT_S` | `tools/api/routers/cases.py:51` (default `90`) | OSCE marking timeout |
| `OSCE_COACH_TIMEOUT_S` | `tools/api/routers/cases.py:43` (default `30`) | Coaching-feedback timeout |
| `NB_MODEL` | `tools/media/*` | Offline image-generation tools only — **not** used by the running app |

### 2.5 Settings you may see referenced but that no longer exist

`render.yaml` used to instruct operators to set four variables that **no code
reads** — `GEMINI_MODEL`, `GOOGLE_FOLDER_CASES`, `GOOGLE_FOLDER_IMAGES` and
`GOOGLE_FOLDER_AUDIT`. They have been removed from that file. If any of them is
still set in the Render dashboard it is inert and can be deleted; in particular
`GEMINI_MODEL` does **not** choose the model.

---

## 3. Deploying

`main` **auto-deploys to production.** There is no staging environment.

```
push to main ──▶ Render builds the Dockerfile ──▶ live in ~5-10 min
```

CI and the deploy run **independently**, so a red CI run does *not* stop the
release. Verify green *before* you push:

```bash
python -m pytest -q
cd frontend && npm run typecheck && npm run build
```

**Rolling back.** Render → the `eyebot` service → **Events** → find the previous
successful deploy → **Rollback**. This is the fastest route out of a bad release
and is worth rehearsing once before you need it.

> **Never delete the `Dockerfile`.** The live service builds it. Deleting it
> took production down on 2026-06-26. `render.yaml` declares the same Docker
> build so the file and the live service agree.

---

## 4. Database and migrations

Migrations are numbered SQL files in `tools/db/migrations/`, **applied by hand**
through the Supabase SQL editor and recorded in
[`APPLIED.md`](../tools/db/migrations/APPLIED.md). Nothing runs them
automatically.

Working rules, each earned the hard way and documented in `APPLIED.md`:

- **Apply the migration *before* shipping code that reads the new column.**
  Ordering is load-bearing. `db.insert_case_result` used to fail all-or-nothing,
  so one unknown column cost nine columns of student results, silently.
- Never paste a file *path* into the Supabase SQL editor — paste the SQL.
- Postgres rejects `ADD CONSTRAINT IF NOT EXISTS` and
  `CREATE POLICY IF NOT EXISTS` (error 42601). Do not emit them.
- Tick the checkbox in `APPLIED.md` with the date and what it changed.

**Reproducing the schema from scratch** (e.g. on a fresh Supabase project):
run `001` through `019` in numerical order. There is no consolidated schema
dump — the migration chain *is* the schema definition. Creating one is a
worthwhile early task for the incoming team.

---

## 5. Backups and disaster recovery

> **Current posture: there is no automated backup of the production database.**

This is the platform's single largest operational risk and it is a **billing
decision, not a technical one** — enabling Supabase point-in-time recovery
requires Owner access on the Supabase *organisation*, which a project-level
Developer cannot grant themselves.

Consequences as things stand:

- An accidental destructive SQL statement in the Supabase editor is
  **unrecoverable**. Every student's progress, scores, streaks and OSCE history
  would be gone permanently.
- There is no restore procedure to test, because there is nothing to restore from.

**Recommended first-week actions for the incoming team:**

1. Take a **manual export today** (Supabase → Database → Backups → download, or
   `pg_dump` against the connection string) and store it in institutional
   storage. This alone removes the "one mistake from zero" condition.
2. Put the manual export on a recurring calendar reminder until (3) lands.
3. Escalate the paid backup plan as a budget item. Name the risk in writing.

---

## 6. Cost, quota and continuity

**Confirm the current plan and balance of each in its own dashboard** — they
change, and this file cannot track them.

| Service | Billing model | Failure mode when it runs out |
|---|---|---|
| Gemini (Google AI Studio) | **Prepaid credit** | ⚠️ **Silent.** The app keeps serving; the tutor degrades to placeholder text. Nothing turns red |
| Render | `plan: free` in `render.yaml:14` | Instance idles out between requests; the keep-alive cron masks this |
| Supabase | Check the dashboard | On the free tier a project **pauses** after prolonged idleness and must be un-paused by hand. Paid tiers do not |

**The Gemini balance is the continuity risk that will bite first.** It is
prepaid, and if auto-reload is off it drains to zero on a predictable date and
then fails *quietly* — students get a tutor that has stopped tutoring, with no
error anywhere.

Mitigations, in order of preference:

1. Decide **auto-reload on or off**, and name a person who checks the balance
   monthly. This is a management decision, not an engineering one.
2. Add `GEMINI_API_KEY_2` / `GEMINI_API_KEY_3` (see [§2.4](#24-read-by-code-but-not-in-envtemplate))
   so a second key takes over automatically.
3. Watch for the symptom: if the tutor gives the same bland answer every time,
   check the credit balance *first*, then check `GEMINI_API_KEY` still exists.

---

## 7. Data-protection posture

Facts an incoming operator needs, so the institution's DPO conversation starts
from reality rather than assumption:

- **Application region:** Render `singapore` (`render.yaml:13`).
- **Database region:** set on the Supabase project — **confirm this in the
  dashboard.** If it differs from Singapore, personal data is crossing a border
  and PDPA transfer obligations apply.
- **What is stored:** student names, email addresses, role, and their full
  learning record (scores, OSCE transcripts, streaks, audit events).
- **Student text goes to Google.** Tutor questions, OSCE dialogue and written
  handovers are sent to the Gemini API for processing.
- **No in-app PDPA consent step.** `frontend/src/screens/OnboardingScreen.tsx:167`
  records a consent row on first login *without asking the student*
  (`"silently record consent"`, `"No PDPA screen"`). The consent record therefore
  documents consent that was never obtained. **This needs an institutional
  decision before the next cohort**, not a code change made in isolation.
- **No documented retention policy and no data-erasure feature.** There is no
  built-in way to action a student's deletion request.

None of these are bugs. They are open institutional questions that were
deliberately deferred, and they transfer with the system.

---

## 8. Observability

**Logs.** Render → `eyebot` → **Logs**. Structured lines; newest at the bottom.
Look for the newest line containing `ERROR`, `Traceback`, `Exception` or
`CRITICAL`. Read a traceback from the **bottom up** — the last line is the
actual problem.

| You see | It means |
|---|---|
| `level` is `INFO` | Routine. `ERROR` is not |
| `status` `200` | Fine. `4xx` refused, `5xx` the app broke |
| `GET /health 200 OK` repeating | The keep-alive cron. Supposed to be there |

**Health endpoints.** `GET /health` (liveness, and publishes `mock_mode`) and a
readiness check, both in `tools/api/server.py`.

> The keep-alive cron only asserts HTTP 200. It will **not** notice
> `mock_mode: true`, a drained AI balance, or failing email. Wiring an alert on
> `/health`'s `mock_mode` field is a small, high-value first task.

**Error tracking is installed but switched off.** `sentry-sdk>=2.0.0` ships in
`requirements.txt` and `tools/shared/logging_config.py:60` initialises Sentry
*only* when `SENTRY_DSN` is set. Setting that one variable in the Render
dashboard turns on full error tracking in minutes. Until then the only error
visibility is scrolling Render's log tail.

---

## 9. Scaling

To carry more concurrent students, **in this order**:

1. Upgrade the Render plan (2 workers need ~1 GB RAM; the free/starter 512 MB
   tier must stay at 1).
2. Provision Redis and set `REDIS_URL`.
3. *Only then* raise `WEB_CONCURRENCY`.

Raising `WEB_CONCURRENCY` without Redis splits shared state across workers and
causes intermittent, very hard to trace faults — rate limits stop working
correctly and counters disagree between workers.

---

## 10. Incident playbook

| Symptom | First move |
|---|---|
| **Whole site down** | `GET /health`. If `ok`, the app is alive. Otherwise Render → Logs → newest `ERROR`; then Events → was something just deployed? Roll it back |
| **Boot refused, log names a setting** | Someone changed a value in Render → Environment. Check for typos. This is the guard working |
| **Everyone logged out at once** | `JWT_SECRET` changed. Users just log back in |
| **Tutor gives bland/identical answers** | ⚠️ Silent failure. Check the Gemini credit balance, then that `GEMINI_API_KEY` still exists. Check `/health` for `mock_mode: true` |
| **OSCE stations refuse to mark** | Correct behaviour when the marking AI is unreachable — it saves nothing rather than recording an invented score. Fix the AI problem above |
| **Password-reset emails never arrive** | Check spam; test with your own address; confirm the four `GMAIL_*`/`EMAIL_FROM` values are still set. See the OAuth note below |
| **Supabase unreachable** | The project may have auto-paused after idleness. Un-pause from the dashboard |

> **The silent email trap.** The Gmail send permission is a long-lived OAuth
> refresh token. If the issuing Google Cloud project sits in *testing* mode
> rather than **published**, Google revokes that token every seven days.
> Everything works for a week, then no student can reset a password — with no
> error anywhere. If the OAuth app is ever rebuilt, publish the consent screen.

---

## 11. Access and accounts

The system depends on external accounts. **Ownership of every one of them must
sit with the institution, not with an individual** — otherwise the platform is
one departure away from being unrecoverable.

| Service | What it holds | Access level the team needs |
|---|---|---|
| **GitHub** | The code | Admin on the repository (to change settings, not just push) |
| **Render** | The web service *and* the keep-alive cron | Admin — confirm **both** are visible |
| **Supabase** | The database | **Owner/Admin on the organisation**, not just Developer on the project — backups are an org-level billing setting |
| **Google AI Studio / Cloud billing** | The Gemini key **and** the prepaid credit | Full control of the account |
| **The Google account itself** | Also owns the OAuth app that sends every student password email | Password, recovery phone/email, and 2FA backup codes |
| **EyeBot `/admin`** | The app's own admin console | An admin account, plus `SUPER_ADMIN_EMAIL` pointing at an institutional address |

Secrets belong in the institution's password manager. Never email, chat or
screenshot them, and never paste them into an AI chat window.

**Not in this repository** (deliberately — it is public) and therefore easy to
lose in a handover:

- The knowledge-base source documents the tutor was built from. Without them the
  KB cannot be rebuilt or extended.
- `credentials.json` / `token.json` — the Google files behind email sending
  (regenerate with `scripts/gmail_oauth_setup.py`).
- A record of the Render environment values, especially `GMAIL_REFRESH_TOKEN`.

---

## See also

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — how the system is built, full endpoint map
- [`SECURITY.md`](SECURITY.md) — auth model, roles, the super-admin bootstrap
- [`../HANDOVER.md`](../HANDOVER.md) — incoming-team orientation and open items
- [`../tools/db/migrations/APPLIED.md`](../tools/db/migrations/APPLIED.md) — the migration ledger
