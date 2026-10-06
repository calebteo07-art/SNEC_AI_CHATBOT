# Handover — EyeBot

**For the engineering team at SP 5G AIoT Centre.** From Caleb Teo, who built
EyeBot and still runs it in production.

EyeBot is an AI training platform used by allied-health students at **SNEC**
(Singapore National Eye Centre), who remain the client. It is not a prototype:
it holds real student records, it auto-deploys, and if it breaks on a weekday
morning a class is waiting.

This document orients you. It is deliberately short and links to the detail.

| I need to… | Go to |
|---|---|
| Understand what the app does | [`README.md`](README.md) |
| Run it locally, change it safely, deploy it | [`docs/DEVELOPING.md`](docs/DEVELOPING.md) |
| Understand how it is built | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| **Operate it in production** | [`docs/OPERATIONS.md`](docs/OPERATIONS.md) |
| Understand the auth and role model | [`docs/SECURITY.md`](docs/SECURITY.md) |
| Find my way around 130+ design documents | [`docs/INDEX.md`](docs/INDEX.md) |
| **Work out what a codename means** (Aurora, Eyecon, Lumens, RICOE…) | [`docs/GLOSSARY.md`](docs/GLOSSARY.md) |

---

## 1. Two copies, kept apart

You are not taking over the live system. SP cloned it, both the repository and
the Supabase project, and you work only on that copy. Students stay on the
original.

| | The original | Your copy |
|---|---|---|
| Code | `calebteo07-art/SNEC_EYEBOT` (public) | SP's clone of it |
| Database | The original Supabase project | SP's clone of it |
| Used by | Students, today | Your team |
| Changed by | Me | You |

You never touch the original. It stays live for students, it remains SNEC's
reference copy, and I keep maintaining it. That separation is the point: nothing
you try can break a class. It also means four things need getting right.

### 1.1 Give your copy its own secrets and URLs

Every value in your deployment's environment should be yours.
[`docs/OPERATIONS.md` §2](docs/OPERATIONS.md#2-environment-variables--complete-inventory)
lists them all. These are the ones that hurt if they are shared:

| Setting | If your copy uses the original's value |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Your code reads and writes the students' live database |
| `JWT_SECRET` | Anyone with access to your environment can sign a login the live app accepts, for any account |
| `GEMINI_API_KEY` (and `_2`, `_3`) | Your usage spends the original's prepaid credit, and when it runs out the live tutor fails silently (risk 2) |
| `GMAIL_*`, `EMAIL_FROM` | Your password-reset mail goes out from the live app's account. Mint your own with `scripts/gmail_oauth_setup.py` |
| `SUPER_ADMIN_EMAIL` | Your copy's super-admin is the original's, not someone on your team |

**`render.yaml` also hard-codes the original's URL twice**: in `ALLOWED_ORIGINS`
and in the keep-alive cron. Deployed as it is, your cron keeps the original awake
and lets your own service fall asleep. Change both to your URL.

### 1.2 Your database is a snapshot

Students keep writing to the original, so everything recorded after you cloned
(new accounts, scores, streaks, OSCE attempts) exists only there. Treat your copy
as a point-in-time sample, never as the current record.

If the clone included data and not just the schema, your copy also holds **real
personal data**: student names, emails, password hashes and OSCE transcripts, now
in a second project under a second organisation. That is a PDPA question for
SNEC's data protection officer, not an engineering one, so get their answer on
record. Most development needs no real records at all: the app runs in
`MOCK_MODE` without an AI key, and test accounts are quick to create.

### 1.3 Pulling my changes into your copy

I keep shipping fixes to the original. To bring them over, add it as a remote:

```bash
git remote add upstream https://github.com/calebteo07-art/SNEC_EYEBOT.git
git fetch upstream
```

**On 5 October 2026 I reworded the commit messages across the original's whole
history.** The code did not change, but every commit ID did. If you cloned after
that date, a normal merge works. If you cloned before it, your history and mine
share no commit IDs, and `git merge upstream/main` refuses with "unrelated
histories". Match on the code instead: take the last commit you cloned (not one
of your own) and find the original commit with the same tree.

```bash
git log upstream/main --format='%H %T' | grep "$(git rev-parse <last-cloned-commit>^{tree})"
```

Then take everything after it with `git cherry-pick <that-commit>..upstream/main`.

Schema changes travel the same way. A new file in `tools/db/migrations/`, ticked
off in `APPLIED.md`, has been applied to the original only. Apply it to your
database yourself.

### 1.4 If students ever move to your copy

Nothing is planned. If it happens, make it one event, so students are never
split across two systems with half their records in each:

1. Agree a date with SNEC and me, outside teaching hours.
2. Copy the data from the original at that moment. By then your snapshot is stale (§1.2).
3. Turn on backups for your database (risk 1) and re-point the contact addresses (§4, step 9).
4. Move students to the new URL, and agree with SNEC whether the original is kept
   as a read-only reference or shut down.

Password hashes move with the data, so nobody needs a new password. Because your
`JWT_SECRET` is different, everyone is logged out once.

---

## 2. Open items that need a decision, not code

These cannot be resolved inside the repository. They need a person with
authority, and they should be settled early rather than inherited quietly.

### 2.1 Ownership and licence — resolve this first

**Both copies carry the same all-rights-reserved [`LICENSE`](LICENSE)** in my
name. It lets anyone read the code and grants nobody the right to reuse it, SP
included. That keeps the default position explicit, but it does not settle who
owns the work.

**What must be decided, in writing:**

1. **Who owns the copyright.** I built this while working with SNEC as the client,
   and SP is now developing it further. The answer depends on the internship /
   employment / engagement terms, and it is a legal question, not an engineering
   one. If it lands anywhere other than with me, the `LICENSE` must be updated to
   match.
2. **What licence applies**, once (1) is answered — proprietary/all-rights-reserved,
   an institutional internal licence, or an open-source licence.

### 2.2 Public or private

The original stays where it is: public, on my personal GitHub account, with
SNEC's agreement.

**Your copy's visibility is SP's decision**, and it has a real engineering
consequence. Because the original is public, operational material that would
normally live beside the code has been kept out of it. If your copy is private,
that material can move in and your copy gets materially better documented than
the original. If it is public, §3.1 and §3.2 apply to it in full. If it is
private, read §3.5.

---

## 3. Risk register

Ranked by what hurts most. Full detail in
[`docs/OPERATIONS.md`](docs/OPERATIONS.md). Most of these live in the code, so
your copy has them too. The ones marked *Original* are about how the live service
is set up; they stay with me and SNEC, and they are listed so you do not set your
copy up the same way.

| # | Risk | Applies to | Status | Detail |
|---|---|---|---|---|
| 1 | **No database backups.** An accidental destructive query is unrecoverable — every student's entire record, permanently | Original | Open. It is a **billing** decision needing Supabase *organisation* Owner access. Your copy needs backups before students ever use it (§1.4) | [§5](docs/OPERATIONS.md#5-backups-and-disaster-recovery) |
| 1b | **The schema is in the repo only as a reconstruction.** 12 of the 20 tables the code uses had no `CREATE TABLE` anywhere, nor did the `semantic_search` function, the `vector` extension or the storage buckets — all made by hand in the dashboard. `tools/db/migrations/000_base_schema.sql` now supplies them, so `000` + `001`…`019` stands up a database. First rebuilt from a read-only snapshot, it was diffed against a real schema-only `pg_dump` on 2026-10-02 and corrected until the diff was empty. **It has never been executed anywhere** — parse- and diff-verified only | Both | Reduced, not closed. Your database was cloned, not built from the chain, so the chain is still unexecuted. **Run it once against a scratch Supabase project and boot the app on it.** Re-diff against a fresh dump after any hand edit in the dashboard | [`tools/db/REBUILD.md`](tools/db/REBUILD.md), [§4](docs/OPERATIONS.md#4-database-and-migrations) |
| 2 | **AI credit runs out silently.** Prepaid Gemini balance; when it drains the tutor degrades to placeholder text with nothing turning red | Original | Open. Needs an owner who checks it monthly, or auto-reload on. Your copy fails the same way if its key is prepaid | [§6](docs/OPERATIONS.md#6-cost-quota-and-continuity) |
| 3 | **No in-app PDPA consent.** A consent record is written on first login without ever asking the student | Both | Deliberate deferral, not a bug. Needs an institutional decision before the next cohort | [§7](docs/OPERATIONS.md#7-data-protection-posture) |
| 4 | **No retention policy, no erasure feature.** No built-in way to action a deletion request | Both | Open | [§7](docs/OPERATIONS.md#7-data-protection-posture) |
| 5 | **Single-account dependency.** Most of the original's external services hang off one Google account | Original | Must move to institutional control. Set your copy up under SP accounts from the start | [§11](docs/OPERATIONS.md#11-access-and-accounts) |
| 6 | **No staging environment.** `main` auto-deploys straight to production, and CI does not gate the deploy | Both | By design on the original; I verify green *before* pushing. Decide whether your copy works the same way | [§3](docs/OPERATIONS.md#3-deploying) |
| 7 | **Error tracking installed but off.** Sentry ships in `requirements.txt`; setting `SENTRY_DSN` turns it on in minutes | Both | Quick win | [§8](docs/OPERATIONS.md#8-observability) |
| 8 | **No medical/AI disclaimer reaches students**, on a platform that teaches clinical procedures and generates clinical content with AI | Both | Needs SNEC's wording, then it is a small change | §3.3 below |

### 3.1 SNEC institutional content is published in a public repository

This one needs SNEC's answer, not an engineering fix.

The knowledge-base tooling contains SNEC internal clinical material transcribed
verbatim, with document-level and page-level citations:

- `tools/kb/seed_authored_checklists.py` transcribes controlled documents —
  e.g. **CC-D0008** (*Visual Acuity – Distance Vision Testing … LogMAR*) — step
  by step, carrying ~109 SNEC source citations including page references
  (`"SNEC Procedure Manual p112, 1.1"`).
- `tools/kb/run_ingestion.py` lists **83 internal SNEC source document
  filenames**, several naming individual educators.

This is functional content — the OSCE checklists the platform actually runs on —
so it cannot simply be deleted without breaking the product. But it is SNEC's
intellectual property, published openly, with no permission recorded anywhere in
the repository.

**Status (October 2026):** SNEC agreed to the original staying public. Keep that
agreement on file in writing, and make sure it covers this material
specifically. **If you make your copy public, you publish the same material again
under SP's name**, so confirm the agreement covers that too. If it does not, keep
your copy private (§2.2) or move the clinical content behind the database and out
of source control.

> **Already fixed during this review:**
>
> - Every case file carried a checksum-**valid** Singapore NRIC alongside a DOB,
>   address and mobile — 152 of 155 validated against the real algorithm, making
>   synthetic patients indistinguishable from real records in a public repo. The
>   seeder now produces deliberately invalid check letters, a regression test
>   enforces it, and a sweep of all 1,314 tracked files finds none remaining.
> - Two rows of `docs/notes/silly-coverage-matrix.md` named a real student and
>   assessor, and a test fixture used a real person's name on SNEC's corporate
>   domain. Redacted.
> - `pytest` fired **41 live, billable Gemini calls per run** on any machine with
>   a key in `.env`. A global guard now blocks the SDK seam and the four leaking
>   tests stub their AI calls.
> - The Supabase test guard covered only one of two client factories; the
>   unguarded one is used by the password-reset path, which **writes**. Both are
>   now blocked, mutation-proved.
>
> Note that **git history still contains the pre-redaction values** — see §3.2.

### 3.2 Git history keeps what the working tree no longer shows

Redacting a file fixes what someone sees when they clone; it does not remove the
old content from the commit history, which is equally public. That applies to
the NRICs and names corrected above, and to anything else ever committed.

If SNEC decides the historical exposure matters, the options are a history
rewrite (`git filter-repo`) — which breaks every existing clone and fork — or
making the repository private. For the original, that decision stays with me and
SNEC. My 5 October 2026 rewrite (§1.3) changed commit messages only; it removed
nothing.

Your copy carries the same history. If you would rather it did not, the cleanest
route is to start your repository from one fresh commit of the current tree,
before your own history builds on top of it. §1.3 still works afterwards, because
it matches on trees, not commit IDs.

**A fresh start would also shrink your copy considerably.** The pack is
**177 MiB**, while the largest file in the working tree is 1.5 MB. The difference
is deleted content that every clone still pays for, including material that has
nothing to do with this codebase:

| Blob in history | Size |
|---|---|
| `chinita/out/videos/smoke_final.mp4` (an unrelated project) | 29.3 MB |
| `proposal/SNEC_EyeBot_Proposal.pptx` (three revisions) | 26.7 MB |
| `marketing/eyebot_iela_2026.mp4` | 9.8 MB |
| `chinita/out/images/*` | ~7 MB |

Note the proposal deck is institutional material, so it belongs to the §3.1
conversation as well as this one — deleting a file from the working tree never
un-published it.

### 3.3 No medical or AI disclaimer reaches students

The platform teaches clinical procedures and generates clinical content with an
AI model, for students at a healthcare institution. Nothing in the UI tells a
student that AI-generated guidance is training material rather than clinical
advice, or that it needs a supervisor's validation before being relied on.

The tutor carries a conditional caveat in its prompt; the virtual patient, the
OSCE marking, the coaching feedback and the flashcard explanations carry none.
Adding UI copy that speaks for SNEC clinically is not an engineering decision —
agree the wording with SNEC, then it is a small change.

### 3.4 `/handoff` publishes AI session dumps to the public repo

`.session-handoff.md` is deliberately git-tracked, and the `/handoff` workflow
commits and pushes it automatically. It captures whatever the session was working
on. It has already had to be emptied once, with the real content moved to
gitignored `.tmp/`, precisely because a session touched institutional paperwork.

If you use this workflow on a public copy, treat every handoff snapshot as
published. The safer default is to stop tracking the file, or to keep your copy
private.

### 3.5 A licence note that becomes live if your copy is private

`pymupdf` (**AGPL-3.0**) is installed into the production image via
`requirements.txt:30`, but it is imported only by the offline ingestion tooling
in `tools/kb/` — `extract_pdf.py`, `ingest_document.py`, `ocr.py`. Nothing the
running API imports pulls it in (`tools/kb/__init__.py` is a comment, and neither
`search.py` nor `supabase_client.py` touches `fitz`).

While a repository is public the AGPL's source-availability requirement is
already satisfied. If your copy is private (§2.2), this needs attention — and the
clean fix is a one-line move of `pymupdf` from `requirements.txt` to
`requirements-dev.txt`, which is safe for exactly the reason above and also slims
the production image.

---

## 4. Your first week

**Day 1 — get in and prove it.**

1. Read [`README.md`](README.md), [`docs/DEVELOPING.md`](docs/DEVELOPING.md), then [`docs/OPERATIONS.md`](docs/OPERATIONS.md).
2. Get the code running locally. It runs with **no AI key and no production
   credentials** — leave `GEMINI_API_KEY` blank and it boots into `MOCK_MODE`.
3. **Check that your copy shares nothing with the original** (§1.1): every
   environment value, and both URLs in `render.yaml`.

**Week 1 — remove the sharpest edges.**

4. **Find out what your copy of the database holds** (§1.2). If it includes real
   student records, raise it with SNEC's data protection officer before you build
   on it, and keep any export of it out of every public repository.
5. **Run the migration chain once against a scratch Supabase project** and boot
   the app on it (risk 1b). [`tools/db/REBUILD.md`](tools/db/REBUILD.md) has the
   exact commands and the two `pg_dump` traps (session-mode pooler on 5432; never
   `--schema=public` alone).
6. Set `SENTRY_DSN` on your deployment — you get real error visibility for one
   setting.
7. Make one trivial change end to end — branch, test, push, watch CI, watch the
   deploy, check the live page — then roll it back from your Render dashboard.
   Do both calmly now so you can do them under pressure later.
8. Add the original as `upstream` and find your starting commit (§1.3), so pulling
   my fixes later is routine.

**Before any students use your copy.**

9. **Re-point every contact address** at whoever will actually read it. Two are
   baked in today, both aimed at the original's shared Google account:
   - [`docs/SECURITY.md`](docs/SECURITY.md) — where strangers send security
     reports. If your copy is public, this is a live inbox.
   - `frontend/src/screens/OnboardingScreen.tsx:286` — the address shown to a
     **locked-out student**. It is compiled into the frontend bundle, so
     changing it needs a code change and a deploy, not a dashboard edit.
10. Plan the move as one event (§1.4).
11. Settle §2 in writing.
12. Escalate risks 1–4 to whoever owns budget and data protection at SP and SNEC.
    They are institutional open items, not engineering tasks, and they follow the
    students to whichever copy serves them.

---

## 5. What is *not* in this repository

Kept out deliberately because the repository is public. What you still need from
me, separately:

- [ ] **Knowledge-base source documents** — the source material the tutor's
      knowledge base was built from. Without them the KB cannot be rebuilt or
      extended.
- [ ] **The non-technical operator handbook** — plain-language day-to-day
      operation of the original, written for SNEC-side staff. Useful context, but
      it is *not* an engineering handover and does not replace this repository's
      docs.
- [ ] **Any training material, slides or student instructions.**

What you should **not** need is anything that unlocks the original: its account
credentials, its `credentials.json` / `token.json`, or its Render environment
values. Your copy needs its own (§1.1), and
[`docs/OPERATIONS.md` §2](docs/OPERATIONS.md#2-environment-variables--complete-inventory)
lists every variable. If any of the original's secrets reached you before we
settled on separate copies, tell me which and I will rotate them.

---

## 6. How this codebase expects to be worked on

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
working on this repo. Parts of it describe my personal workflow; treat the **production invariants** and **guardrails** sections as the
durable content and adapt the rest to how your team works.

---

## 7. The honest summary

The application itself is in good shape: it is tested, CI is green, the
architecture is documented, the security model fails closed, and the migration
ledger explains its own history unusually well.

What is weak is everything *around* the code — backups, ownership, consent, and
the fact that critical access to the original has sat with one individual. None
of it is hard to fix, but none of it fixes itself, and risks 1 and 2 are the ones
that can cost the client something they cannot get back.

Working on a copy removes the biggest risk of any handover: breaking a live class
while you learn the system. It adds two risks of its own, secrets shared between
the copies and real student data in a second place. Both are cheap to rule out on
day 1.

Start by checking that your copy shares no secrets with the original.
