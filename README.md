# EyeBot

**An AI training platform for eye-care students, in production at the Singapore
National Eye Centre (SNEC).**

[![CI](https://github.com/calebteo07-art/SNEC_AI_CHATBOT/actions/workflows/ci.yml/badge.svg)](https://github.com/calebteo07-art/SNEC_AI_CHATBOT/actions/workflows/ci.yml)
![Python 3.12](https://img.shields.io/badge/python-3.12-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-async-009688?logo=fastapi&logoColor=white)
![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Gemini](https://img.shields.io/badge/Google-Gemini-4285F4?logo=google&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3FCF8E?logo=supabase&logoColor=white)

EyeBot trains Ophthalmic Assistants, Ophthalmic Technicians and Patient Service
Associates. Students practise against an AI patient in timed OSCE exam stations,
learn from a tutor that answers with questions instead of answers, and drill
flashcards that are scored instantly. Staff watch cohort progress from a console
in the same app.

I designed, built, deployed and operate it end to end: product, backend, frontend,
data, security, CI and production.

**Live:** https://snec-ai-chatbot.onrender.com &nbsp;·&nbsp; accounts are issued
by SNEC, so the app itself sits behind a login.

<p align="center">
  <img src="docs/media/readme/osce-station.webp" alt="OSCE station: the student talks to an AI patient on the left, the checklist ticks itself as steps are completed, and an examiner panel grades a hands-on procedure against a model answer" width="100%">
</p>

<table>
  <tr>
    <td width="50%"><img src="docs/media/readme/virtual-patients.webp" alt="Virtual patients: an interactive anatomical eye map beside a list of patients grouped into foundational, developing and advanced tiers"><br><sub><b>Virtual patients.</b> Pick a structure of the eye, meet its patients.</sub></td>
    <td width="50%"><img src="docs/media/readme/osce-debrief.webp" alt="OSCE debrief: a score of 78 out of 100 split into checklist coverage 30/40, consultation 22/30 and judgement 26/30, with a safety check and coaching points"><br><sub><b>Debrief.</b> A 40/30/30 grade, a safety check, and one thing to fix next time.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/media/readme/home.webp" alt="Student home: level and points bar, daily quests, a daily chest, league position and a streak calendar"><br><sub><b>Home.</b> Quests, streaks and a weekly league keep students coming back.</sub></td>
    <td width="50%"><img src="docs/media/readme/flashcards.webp" alt="Flashcards: a carousel of topic decks with deck-progress badges"><br><sub><b>Flashcards.</b> Ten questions, instant rule-based scoring.</sub></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/media/readme/staff-console.webp" alt="Staff console: cohort mastery trend, student counts, OSCE pass rate, safety fails, a needs-attention list and weakest topics"><br><sub><b>Staff console.</b> Cohort mastery, who needs attention and why, and the weakest topics, filterable by discipline.</sub></td>
  </tr>
</table>

<sub>Screenshots are from the local test harness on mocked data. No real student appears.</sub>

---

## At a glance

| | |
|---|---|
| **In production** | Deployed at SNEC with real student cohorts and staff |
| **Scope** | 68 API endpoints across 9 routers · 20 SQL migrations · 155 OSCE cases |
| **Codebase** | ~27k lines of Python · ~21k lines of TypeScript/React · ~11k lines of CSS |
| **Tests** | 2,581 backend tests · 70+ Node harnesses, 24 of them in a real browser |
| **CI** | Every push: pytest, typecheck, production build, every browser harness, supply-chain audit |
| **History** | 1,850+ commits, May–October 2026 |

## What it does

| Feature | What it does |
|---|---|
| **Virtual patients** | 155 OSCE stations across three roles. The AI plays the patient; the student takes a history, performs procedures and writes a handover, under a 15-minute timer. Marked **40%** checklist coverage, **30%** consultation technique, **30%** judgement and safety. |
| **Socratic tutor** | Answers a question with a better question. Grounded in a curated ophthalmology knowledge base, so it quotes approved material rather than inventing it. Streams over SSE and accepts image attachments. |
| **Flashcards** | Multiple-choice decks on a five-level ladder, graded **instantly by fixed rules**. There is no AI in the study loop, so scoring is fast, free and always the same. |
| **Daily check-in** | One question a day from the flashcard bank, feeding a streak with weekend rest days. |
| **Gamification** | Points, levels, a customisable avatar and a weekly league with five divisions that resets every Monday. |
| **Staff console** | Cohort analytics, quality-over-time trends, per-student reports and OSCE dossiers, account management and an audit log. Three roles: `student`, `trainer`, `admin`. |

---

## Engineering highlights

The decisions I'd point a reviewer at, and why each one was made.

**One origin, one container.** The browser only ever talks to Next.js, which
proxies `/api/*` to FastAPI over localhost. Because everything is same-origin, the
login cookie can be `HttpOnly` (no JavaScript can read it), tutor SSE streams pass
through untouched, and there is no CORS surface. Next.js owns page security headers
(CSP); FastAPI only ever returns JSON or SSE.

**Grounding without RAG, on purpose.** The curated knowledge base is about 6k
tokens, so the tutor injects the *whole* thing into the system prompt and relies on
Gemini context caching so it isn't re-billed each turn
([`chat.py`](tools/api/routers/chat.py)). Vector search would add a retrieval
step that can miss, for a corpus that fits in context anyway. pgvector is still
used, but only offline, to curate and audit the knowledge base.

**AI where it reasons, code where it executes.** Five chained AI steps that are
each 90% accurate are 59% accurate together. So anything deterministic is pulled
out of the prompt into tested Python: flashcard scoring has no model in it, and
OSCE marking combines a deterministic checklist score with AI-judged technique.

**Fail closed.** In production the server refuses to boot on a weak
`JWT_SECRET`, missing Supabase keys or a wildcard CORS origin
([`config.py`](tools/shared/config.py)). Identity always comes from the signed
token's `sub`, never the request body. bcrypt (cost 12) runs off the event loop,
and rate limits key on the real caller (JWT subject, else `X-Forwarded-For`) rather
than on the proxy's address, which would make one student throttle everyone
([`shared.py`](tools/api/shared.py)).

**Built for one small worker.** Production runs a single async worker, so one
blocking call stalls every student. Every blocking dependency (Gemini, bcrypt,
the sync Supabase client) goes through `asyncio.to_thread` with a timeout. Shared
counters live in Redis and one-time codes in Postgres, so it scales horizontally
the moment the plan allows.

**Tests that check what users see, not just what functions return.** The browser
harnesses drive the real production build in Chromium and make measurements a
unit test can't: overflow at phone widths, landscape gates and WCAG contrast. One
of them composites the actual video frame under the actual CSS scrim to find the
worst-case contrast behind the headline
([`_home_shot.mjs`](frontend/tests/_home_shot.mjs)). The harness list is
*discovered*, and a pytest guard fails if a new harness isn't gated, because a
hand-kept list once silently left 14 of 20 harnesses out of CI
([`test_browser_harness_registration.py`](tests/test_browser_harness_registration.py)).

**Tests can't touch production.** A global pytest fixture fails any test that
tries to reach the real database, after one did. With no Gemini key the app
boots into `MOCK_MODE`, so the full suite and CI run free and deterministic.

**Supply chain.** CI runs `pip-audit`, `npm audit` and npm registry signature
verification. Dependabot proposes weekly bumps. Installs are strictly
`npm ci`, after a lockfile regenerated on Windows once dropped the Linux binaries
the Docker build needs.

**Every incident becomes a guardrail.** Production rules are written down with the
outage that caused each one ([`CLAUDE.md`](CLAUDE.md),
[`docs/DEVELOPING.md`](docs/DEVELOPING.md)). Settled UI decisions are recorded in
[design locks](docs/design-locks.md), and about 130 dated design specs record *why*
each subsystem looks the way it does ([`docs/INDEX.md`](docs/INDEX.md)).

---

## How I build: AI-assisted, with guardrails

I build EyeBot with [Claude Code](https://claude.com/claude-code) as a pair
programmer, which is why most commits carry a `Co-Authored-By: Claude` line. I own
the product, the architecture and the review, and I answer for production. The
part I've invested most in is making AI-assisted work **safe to ship** to a live
clinical training system:

- **A standing brief.** [`CLAUDE.md`](CLAUDE.md) holds the stack, the production
  invariants and the traps that have already broken production once.
- **Hooks that enforce it.** [`.claude/hooks/`](.claude/hooks) block
  wrong-shell commands, give every session its own git worktree from a clean
  `origin/main` so parallel sessions can't ship each other's half-done work, and
  snapshot state before context runs out.
- **Test-first, then gates.** A failing test comes first. Nothing reaches
  `main` until pytest, typecheck, the production build and the browser harnesses
  are green, because `main` deploys straight to production.
- **Deterministic tools over long prompts**, per the "AI reasons, code executes"
  rule above.

---

## Architecture

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

| Layer | What is used |
|---|---|
| Frontend | Next.js 16 (App Router, `output: standalone`), React 19, Tailwind 4, TanStack Query, Motion · Node 24 |
| Backend | FastAPI + uvicorn, async-first · Python 3.12 |
| AI | Google Gemini via `google-genai`, with context caching; `MOCK_MODE` when no key is set |
| Data | Supabase Postgres (pgvector for offline knowledge-base curation); Google Sheets for some rosters |
| Auth | Custom JWT in an `HttpOnly` cookie · bcrypt (cost 12) · OTP password reset over the Gmail API |
| Async | Celery + Redis workers |
| Deploy | Render, a single Docker container, auto-deployed from `main` |

Full endpoint map: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · security model:
[`docs/SECURITY.md`](docs/SECURITY.md).

---

## Run it

No Gemini key is needed: without one the app runs in `MOCK_MODE`.

```bash
pip install -r requirements.txt -r requirements-dev.txt
cp .env.template .env                                # fill in Supabase + JWT_SECRET
uvicorn tools.api.server:app --reload --port 8000    # terminal 1
cd frontend && npm ci && npm run dev                 # terminal 2 → http://localhost:3000
```

```bash
python -m pytest -q                                  # backend tests
bash scripts/start-harness.sh all                    # browser harnesses
```

The full walkthrough, the repository map and the change-and-deploy loop are in
[**`docs/DEVELOPING.md`**](docs/DEVELOPING.md).

## Documentation

| If you want to… | Read |
|---|---|
| Take over the project | [`HANDOVER.md`](HANDOVER.md): risks, open decisions, a first-week plan |
| Run, change or deploy it | [`docs/DEVELOPING.md`](docs/DEVELOPING.md) |
| Operate production | [`docs/OPERATIONS.md`](docs/OPERATIONS.md) |
| Understand the system | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/SECURITY.md`](docs/SECURITY.md) |
| Find a design decision | [`docs/INDEX.md`](docs/INDEX.md) · [`docs/GLOSSARY.md`](docs/GLOSSARY.md) (Aurora, Eyecon, Lumens…) |

---

## License

Copyright © 2026 calebteo07-art. All rights reserved. The source is published so it
can be read and evaluated; it is not licensed for reuse. Clinical content (cases,
knowledge base, flashcards) was prepared for SNEC training and is not licensed for
reuse either. See [`LICENSE`](LICENSE).
