# Handover — EyeBot

**For the incoming engineering team at SP 5G AIoT Centre.**

You are taking over a **live production system with real users**. EyeBot is an
AI training platform used by allied-health students at **SNEC** (Singapore
National Eye Centre), who remain the client. It is not a prototype: it holds
real student records, it auto-deploys, and if it breaks on a weekday morning a
class is waiting.

This document orients you. It is deliberately short and links to the detail.

| I need to… | Go to |
|---|---|
| Understand what the app does and run it locally | [`README.md`](README.md) |
| Understand how it is built | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| **Operate it in production** | [`docs/OPERATIONS.md`](docs/OPERATIONS.md) |
| Understand the auth and role model | [`docs/SECURITY.md`](docs/SECURITY.md) |
| Find my way around 130+ design documents | [`docs/INDEX.md`](docs/INDEX.md) |

---

## 1. Open items that need a decision, not code

These cannot be resolved inside the repository. They need a person with
authority, and they should be settled early rather than inherited quietly.

### 1.1 Ownership and licence — resolve this first

**This repository has no `LICENSE` file, and it is public.**

Under default copyright that means: publishing the source grants **no rights to
anyone** — not to SP, not to SNEC, not to the public. Anybody can read it;
nobody has an explicit right to use, modify or redistribute it. In practice
SP taking over development is unlikely to be challenged, but it is an
unresolved position that should not be left dangling once the work moves between
institutions.

**What must be decided, in writing:**

1. **Who owns the copyright.** The author was working with SNEC as the client;
   the work now moves to SP. The answer depends on the internship / employment /
   engagement terms, and it is a legal question, not an engineering one.
2. **What licence applies**, once (1) is answered — proprietary/all-rights-reserved,
   an institutional internal licence, or an open-source licence.
3. **Whether the repository stays public.** It is public today. See §1.2.

Until (1) and (2) are settled, do not add a `LICENSE` file — an incorrect one is
worse than none, because it purports to grant rights the committer may not hold.

### 1.2 Public or private, and where the repository lives

The repository is currently **public** and owned by a **personal GitHub
account** (`calebteo07-art/SNEC_AI_CHATBOT`). Only the owner of a
personal-account repository can change its settings, so this must move.

**Decide:** transfer the repository to an SP-owned organisation (Settings →
Danger Zone → Transfer), and decide public vs private at the same time.

This choice has a real engineering consequence. Because the repo is public,
operational material that would normally live beside the code has been kept out
of it. If it becomes private under SP ownership, that material can move in and
the handover gets materially better. While it stays public, it must live in the
institution's private storage instead.

---

## 2. Risk register — what you are inheriting

Ranked by what hurts most. Full detail in
[`docs/OPERATIONS.md`](docs/OPERATIONS.md).

| # | Risk | Status | Detail |
|---|---|---|---|
| 1 | **No database backups.** An accidental destructive query is unrecoverable — every student's entire record, permanently | Open. It is a **billing** decision needing Supabase *organisation* Owner access | [§5](docs/OPERATIONS.md#5-backups-and-disaster-recovery) |
| 2 | **AI credit runs out silently.** Prepaid Gemini balance; when it drains the tutor degrades to placeholder text with nothing turning red | Open. Needs an owner who checks it monthly, or auto-reload on | [§6](docs/OPERATIONS.md#6-cost-quota-and-continuity) |
| 3 | **No in-app PDPA consent.** A consent record is written on first login without ever asking the student | Deliberate deferral, not a bug. Needs an institutional decision before the next cohort | [§7](docs/OPERATIONS.md#7-data-protection-posture) |
| 4 | **No retention policy, no erasure feature.** No built-in way to action a deletion request | Open | [§7](docs/OPERATIONS.md#7-data-protection-posture) |
| 5 | **Single-account dependency.** Most external services hang off one Google account | Must transfer to institutional control | [§11](docs/OPERATIONS.md#11-access-and-accounts) |
| 6 | **No staging environment.** `main` auto-deploys straight to production, and CI does not gate the deploy | By design; verify green *before* pushing | [§3](docs/OPERATIONS.md#3-deploying) |
| 7 | **Error tracking installed but off.** Sentry ships in `requirements.txt`; setting `SENTRY_DSN` turns it on in minutes | Quick win | [§8](docs/OPERATIONS.md#8-observability) |

---

## 3. Your first week

**Day 1 — get in and prove it.**

1. Read [`README.md`](README.md), then [`docs/OPERATIONS.md`](docs/OPERATIONS.md).
2. Get the code running locally. It runs with **no AI key and no production
   credentials** — leave `GEMINI_API_KEY` blank and it boots into `MOCK_MODE`.
3. Sign in to every external account yourself and confirm access
   ([§11](docs/OPERATIONS.md#11-access-and-accounts)). *An invitation you never
   accepted is not access*, and it is far easier to fix a broken login now than
   at 9am with a class waiting.

**Week 1 — remove the sharpest edges.**

4. **Take a manual database export.** This single action removes the
   "one mistake from zero" condition. Do it before anything else technical.
5. Set `SENTRY_DSN` in Render — you get real error visibility for one setting.
6. Rehearse a rollback: Render → `eyebot` → Events → Rollback. Do it once
   calmly now so you can do it under pressure later.
7. Make one trivial change end to end — branch, test, push, watch CI, watch the
   deploy, check the live page. Prove the loop works for *you*.
8. Rotate the credentials you inherited (`GEMINI_API_KEY` especially) and remove
   the outgoing author's access once you have been running it for a week or two.
   That is the last proof the handover actually worked.

**Before the next cohort.**

9. Point the **vulnerability-reporting address** at whoever will actually read
   it. [`docs/SECURITY.md`](docs/SECURITY.md) currently directs security reports
   to the outgoing shared Google account. The repo is public, so this is a real
   inbox that strangers may use.
10. Settle §1.1 and §1.2 in writing.
11. Escalate risks 1–4 to whoever owns budget and data protection at SP and SNEC.
    They are institutional open items, not engineering tasks, and they should be
    on the record rather than quietly inherited.

---

## 4. What is *not* in this repository

Kept out deliberately because the repo is public — and therefore easy to lose
in a handover. Confirm you have received each of these separately:

- [ ] **Knowledge-base source documents** — the source material the tutor's RAG
      knowledge base was built from. Without them the KB cannot be rebuilt or
      extended.
- [ ] **`credentials.json` / `token.json`** — the Google OAuth files behind
      password-reset email. Regenerable with `scripts/gmail_oauth_setup.py`, but
      only by someone with access to the Google account.
- [ ] **A record of the Render environment values** — especially
      `GMAIL_REFRESH_TOKEN`, which is painful to regenerate from nothing.
- [ ] **Account credentials** — in the institution's password manager, never by
      email or chat.
- [ ] **The non-technical operator handbook** — an existing handover document
      written for a non-technical successor. It covers day-to-day operation in
      plain language and is useful for SNEC-side staff, but it is *not* an
      engineering handover and does not replace this repository's docs.
- [ ] **Any training material, slides or student instructions.**

---

## 5. How this codebase expects to be worked on

Two conventions that are load-bearing rather than stylistic:

- **Test first.** `tests/` (pytest) and `frontend/tests/` (Node harnesses). The
  gates are `python -m pytest -q` and, in `frontend/`, `npm run typecheck &&
  npm run build`.
- **Migrations are manual and ordered.** Apply the SQL *before* shipping code
  that reads the new column, and tick it off in
  [`tools/db/migrations/APPLIED.md`](tools/db/migrations/APPLIED.md). That file
  is also the best written record of why the schema looks the way it does — it
  documents the incidents behind several columns.

[`CLAUDE.md`](CLAUDE.md) is the standing briefing for AI coding assistants
working on this repo. Parts of it describe the previous author's personal
workflow; treat the **production invariants** and **guardrails** sections as the
durable content and adapt the rest to how your team works.

---

## 6. The honest summary

The application itself is in good shape: it is tested, CI is green, the
architecture is documented, the security model fails closed, and the migration
ledger explains its own history unusually well.

What is weak is everything *around* the code — backups, ownership, consent, and
the fact that critical access has been sitting with one individual. None of it
is hard to fix, but none of it fixes itself, and items 1 and 2 in the risk
register are the ones that can cost the client something they cannot get back.

Start with the database export.
