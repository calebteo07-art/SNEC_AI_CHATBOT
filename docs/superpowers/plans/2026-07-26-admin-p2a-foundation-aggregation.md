# Admin Console P2a — Foundation & Real Cohort Aggregation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ground the admin console's cohort figures in real performance events — actual OSCE grades and flashcard attempts, sliced by discipline — replacing the profile-snapshot proxies, and repair the writer that has been silently discarding every flashcard answer.

**Architecture:** A shared data foundation (case index, flashcard↔case crosswalk, discipline map, bounded bulk reads) feeding pure aggregation modules under `tools/supervisor/`, exposed through one new rate-limited endpoint and consumed by a panel-local discipline switcher. Aggregation stays in Python over bounded reads so it ships with no migration and no coordinated setup; every aggregator returns a `dict[topic_group, …]` so P4 can push the same contract into SQL later. No AI in any scoring path.

**Tech Stack:** FastAPI (Python 3.12, async), pytest + `unittest.mock.patch`/`AsyncMock` + `fastapi.testclient`, Supabase (PostgREST), Next.js 16 App Router, React 19, TanStack Query, Tailwind 4.

**Design spec:** `docs/superpowers/specs/2026-07-26-admin-p2-analytics-depth-design.md`

**Scope:** This is Plan A of three. Plan B (explainable at-risk + mastery vs cohort) and Plan C (performance time-series) follow and are specced in §6–§7 of the design doc. Plan C depends only on Tasks 4 and 5 here, so B and C may be reordered.

---

## Critical context for the implementer

**Work in the `origin/main` worktree.** The user's local `main` checkout is behind and the repo is edited by concurrent sessions; `main` is sometimes force-pushed. Verify before starting, and again before pushing:

```bash
git fetch origin && git rev-parse --short HEAD && git rev-parse --short origin/main
```

**Preconditions already verified — do not re-litigate.** A 10-agent verification pass and a read-only production probe settled these on 2026-07-26:

- `db.get_all_case_progress()` is `select("*")` with no client limit (`tools/shared/db.py:402-411`) — the migration-011 grade columns already flow through. Migrations 010 and 011 were applied 2026-07-14; **no migration is needed anywhere in this plan.**
- Production row counts: `case_progress` 24, `chat_sessions` 25, `student_profiles` 10, **`flashcard_attempts` 0**. No PostgREST truncation is observable at this volume, but no `.range()` call exists anywhere in `tools/` and `get_all_case_progress()` is `ORDER BY completed_at DESC`, so a cap would silently drop the *oldest* rows. The paginator in Task 2 is defensive, not urgent.
- **Only 11 of 24 `case_progress` rows carry non-NULL `score_100`/`safe`.** Over half of production OSCE attempts are pre-Tier-2. This is why every metric carries its own denominator and why a shared one would be wrong.
- `tests/conftest.py` resets `limiter._storage` and `_case_cache` around every test, so rate-limit tests are behavioral and safe to write.
- **slowapi keys on the ASGI path only** (`request["path"]`, slowapi 0.1.9) — query strings are excluded. A plain `@limiter.limit` is therefore correct for the new query-param endpoints; the `@limiter.shared_limit(scope=...)` form is only required for `{path_param}` routes. Every rate-limited endpoint still needs a `request: Request` parameter.

**Three rules that govern every aggregation in this plan.** Breaking any one of them produces numbers that look right and are wrong:

1. **Retakes (D9).** Attainment metrics — `avg_score`, `pass_rate`, mastery, `weakness_score` — use the **best `score_100` per `(student_id, case_id)`**. Volume counts use **all raw attempts**. `safety_fail_rate` is over **raw attempts**: a safety fail is an event, not an attainment level.
2. **Population (D10).** Aggregation reads **`db.get_active_profiles()`** (student-only). **Never `get_active_leaderboard_profiles()`** — it deliberately adds trainers and admins, and its own docstring says it is kept separate *so that* cohort roll-ups exclude staff. Compounding the hazard, `case_pool()` maps `trainer`/`admin`/`""` to `CLINICAL`, so a mistake here files staff into the OA/PSA cohort silently.
3. **Nulls, not zeros (D13).** Every rate and mean is `float | None`, null when its denominator is zero. P1 legitimately zero-fills *counts* on the activity trend; copying that to a *mean* is wrong — a day with no attempts has no average, and a `0.0` renders as catastrophic failure.

**The flashcard table is empty, and that is a bug this plan fixes first.** `flashcard_attempts` has received zero rows since it shipped: the backend writer filters `for r in body.results if r.topic_tag` (`tools/api/routers/student.py:468`) and the frontend never sends `topic_tag`. The same filter also kills the per-topic `retention_scores` write (`student.py:479`). Task 1 repairs it. **Data accrues only from that ship date**, so every flashcard surface in this plan must degrade on a *thin or empty* table — `flashcard: null` and "no flashcard data yet", never `{accuracy: 0.0}` or a 0% bar.

**At today's volume most panels are legitimately empty.** ~24 OSCE attempts spread across 21 topic groups is roughly one attempt per group, and 6 of the 21 groups have ≤5 cases in the library. Honest empty states and the low-confidence guard are the *primary* UX here, not an edge case — without the confidence floor a single 20/100 attempt would top the "weakest topic" ranking and drive a real teaching decision.

**Project traps that have each cost a real session:**

- **Frontend test fixtures are not type-checked.** The CI-gated aurora harness mocks all `/api/*` calls from **two** files — `frontend/tests/aurora_assert.mjs` and `frontend/tests/_mocks.mjs`. `tsc` and `build` do not check them, so a stale mock passes both gates and only fails at render. Any task adding or reshaping an endpoint must update **both**, and routes carrying a query string need a **trailing `*`** in the pattern.
- **Stop the harness server before any build.** `scripts/start-harness.sh` leaves `node .next/standalone/server.js` on :3000 holding a `.next` lock; the next `next build` dies with `EBUSY`. `start-harness.sh stop` is unreliable under Git-Bash — kill the node PID directly.
- **Build with `npm --prefix frontend run build:safe`** (webpack). Turbopack rejects the junctioned `node_modules`. Never plain `npm run build`, `npm ci` or `npm install` in the worktree. For the same reason, always invoke the harness as **`SKIP_BUILD=1 bash scripts/start-harness.sh aurora`** — without that flag the script runs `npm run build` itself (`scripts/start-harness.sh:44-46`), i.e. Turbopack, and dies.
- **There is no pytest config file**, so pytest-asyncio runs in strict mode: **every async test needs `@pytest.mark.asyncio`**.
- **Never `importlib.reload(tools.api.shared)`** — routers bind `limiter` and `_case_cache` by reference, and reloading silently 404s the affected tests. To probe env-dependent behaviour, load a throwaway module copy via `spec_from_file_location` (pattern at `tests/api/test_auth_endpoints.py:209-224`).
- **`main` auto-deploys to Render production on push**, and CI's harness gate runs *after* the deploy starts. Verify green locally before pushing.

## File structure

| File | Responsibility | Change | Tasks |
|---|---|---|---|
| `tools/shared/db.py` | Supabase access | Modify: `_fetch_all` paginator + three narrow bulk reads. **Never** widen `get_all_sessions`, `get_all_case_progress` or `get_case_progress_since` — siblings only | 2, 6 |
| `tools/supervisor/topic_crosswalk.py` | Flashcard-tag → case-set-key map | **Create** (pure) | 3 |
| `tools/supervisor/case_index.py` | `case_id` → pool/set_key/label/difficulty | **Create** (sync build + single-flight async accessor) | 4 |
| `tools/supervisor/discipline.py` | Student role → discipline pool | **Create** (pure, fails closed) | 5 |
| `tools/supervisor/cohort_analytics.py` | OSCE + flashcard aggregation, weakness score | **Create** (pure; 7 writes the OSCE half, 8 appends the rest) | 7, 8 |
| `tools/api/routers/admin.py` | Admin endpoints | Modify: token-summary correctness, new `/cohort-analytics` | 2, 9 |
| `tools/api/server.py` | App entry | Modify: warm the case index in `_warmup()` | 4 |
| `frontend/src/hooks/useFlashcards.ts` | Flashcard data layer | Modify: `CompleteCardResult` carries `topic_tag` + `score` | 1 |
| `frontend/src/aurora/screens/Flashcards.tsx` | Study loop | Modify: send the topic and per-card score | 1 |
| `frontend/src/hooks/useAdmin.ts` | Admin data layer | Modify: `useCohortAnalytics`, token poll, new types | 2, 10, 12 |
| `frontend/src/aurora/screens/AdminTopicAnalytics.tsx` | Switcher + query owner | **Create** | 10 |
| `frontend/src/aurora/components/admin/cohortAnalyticsView.ts` | Pure view-model for the panels | **Create** (no React → Node-testable) | 11 |
| `frontend/src/aurora/components/admin/CohortAnalyticsPanels.tsx` | Renders the panels | **Create** | 11 |
| `frontend/src/aurora/screens/AdminCohort.tsx` | Cohort band | Modify: mount the new section, retire the feed-derived KPIs | 2, 10, 12 |
| `tests/api/test_flashcards_complete.py` | Flashcard write contract | Modify: extend | 1 |
| `tests/shared/test_db_bulk_reads.py` | Paginator | **Create** | 2 |
| `tests/api/test_admin_token_summary.py` | Token totals | **Create** | 2 |
| `tests/api/test_admin_endpoints.py` | Guard tiers | Modify: repoint one test, append the new endpoint | 2, 9 |
| `tests/content/test_topic_crosswalk.py` | Crosswalk coverage (fails CI on a new topic) | **Create** | 3 |
| `tests/supervisor/test_case_index.py` | Index correctness + off-loop build | **Create** | 4 |
| `tests/api/test_startup_warmup.py` | Warmup | Modify: append one test | 4 |
| `tests/supervisor/test_discipline.py` | Pool mapping | **Create** | 5 |
| `tests/shared/test_db_analytics_reads.py` | Projections | **Create** | 6 |
| `tests/supervisor/test_cohort_analytics_osce.py` | OSCE aggregation | **Create** | 7 |
| `tests/supervisor/test_cohort_analytics_weakness.py` | Weakness score | **Create** | 8 |
| `tests/api/test_admin_cohort_analytics.py` | Endpoint | **Create** | 9 |
| `frontend/tests/aurora_assert.mjs` | CI-gated browser harness | Modify: fixtures + assertions (9 registers the route, 10 replaces it, 12 adds none) | 2, 9, 10, 12 |
| `frontend/tests/_mocks.mjs` | Shared harness fixtures | Modify: same route discipline; reconcile the pre-existing `total` drift | 2, 9, 10, 12 |
| `frontend/tests/cohort_panels_logic.mjs` | Pure view-model harness | **Create** | 11 |
| `.github/workflows/ci.yml` | CI | Modify: register the new logic harness (nothing auto-discovers) | 11 |

---

## Task 1: Repair the flashcard writer so attempts are recorded at all

`flashcard_attempts` has **0 rows in production**. The endpoint is fine — `POST /api/flashcards/complete` filters `for r in body.results if r.topic_tag` (`tools/api/routers/student.py:468`) and the frontend never sends `topic_tag` or `score`: `CompleteCardResult` declares only `card_id, correct, repetitions, easiness, interval_days` (`frontend/src/hooks/useFlashcards.ts:26-29`) and the push site sends exactly those (`frontend/src/aurora/screens/Flashcards.tsx:156-159`) — one line *after* it reads the card's topic as `card.tag`. Because `topic_tag: str | None = None` (`student.py:420`) there is no 422: the request returns 200 and every attempt is discarded, and the same filter at `student.py:479` also kills the per-topic `retention_scores` write, falling through to the XP-only branch. Every flashcard aggregation in P2 reads this table, so nothing downstream can be built until it fills. **Consequence: flashcard data accrues only from this ship date** — every flashcard surface in Plan A must degrade on a thin or empty table (`flashcard: null`, never `{accuracy: 0.0}`).

The defect lives in the frontend, so the failing test is a **source-contract test**: no backend test can fail here (the server already handles `topic_tag` correctly — `tests/api/test_flashcards_complete.py:54-84` proves it). The contract test pins the two `.tsx`/`.ts` sites that actually broke, and two backend tests pin the wire contract in the real frontend key set and pin the silent-drop trap that caused this.

**Files:**
- Modify: `frontend/src/hooks/useFlashcards.ts` (the `CompleteCardResult` interface, lines 26-29)
- Modify: `frontend/src/aurora/screens/Flashcards.tsx` (`onCheck`, lines 151-186 — the push at 156-159 and the per-card `xp` at 179-182)
- Test: `tests/api/test_flashcards_complete.py` (extend; the three existing tests stay byte-for-byte)
- Deliberately unchanged: `tools/api/routers/student.py:455-495` (the `if r.topic_tag` filter is kept — a result with no topic is analytically useless; Test 3 pins it)

- [ ] **Step 1: Write the failing test**

Replace lines 1-4 of `tests/api/test_flashcards_complete.py` (the import block) with:

```python
import re
from pathlib import Path

import pytest
from httpx import AsyncClient, ASGITransport
from tools.api.server import app
from tests.api.conftest import auth_headers

# tests/api/ -> tests/ -> repo root
_REPO = Path(__file__).resolve().parents[2]


def _complete_card_result_fields() -> tuple[str, ...]:
    """Field names declared on the frontend's CompleteCardResult interface."""
    src = (_REPO / "frontend/src/hooks/useFlashcards.ts").read_text(encoding="utf-8")
    m = re.search(r"export interface CompleteCardResult\s*\{(.*?)\n\}", src, re.S)
    assert m, "CompleteCardResult interface not found in frontend/src/hooks/useFlashcards.ts"
    return tuple(sorted(set(re.findall(r"([A-Za-z_][A-Za-z0-9_]*)\??\s*:", m.group(1)))))


def _push_object_literal() -> str:
    """The object literal pushed into resultsRef by Flashcards.tsx's onCheck.

    Brace-balanced rather than line-based so reformatting the .tsx cannot false-fail this.
    """
    src = (_REPO / "frontend/src/aurora/screens/Flashcards.tsx").read_text(encoding="utf-8")
    i = src.find("resultsRef.current.push(")
    assert i != -1, "resultsRef.current.push( not found in Flashcards.tsx"
    start = src.index("{", i)
    depth = 0
    for j in range(start, len(src)):
        if src[j] == "{":
            depth += 1
        elif src[j] == "}":
            depth -= 1
            if depth == 0:
                return src[start + 1:j]
    raise AssertionError("unbalanced braces in the resultsRef.current.push( literal")
```

Then append these three tests to the end of the file:

```python
def test_frontend_complete_payload_carries_topic_tag_and_score():
    """The deck writer must SEND the topic, or none of this is recorded anywhere.

    /api/flashcards/complete keeps only results with a truthy topic_tag -- both the
    flashcard_attempts insert (student.py:468) and the per-topic retention write
    (student.py:479). The frontend omitted it, so production accumulated 0 attempt rows
    while every request returned 200. This is a cross-language contract, so it is pinned
    at the source: the interface (which makes omission a typecheck error) and the one
    push site that builds the payload.
    """
    fields = _complete_card_result_fields()
    assert "topic_tag" in fields, (
        "CompleteCardResult must declare topic_tag: POST /api/flashcards/complete "
        "drops every result without one (tools/api/routers/student.py:468)")
    assert "score" in fields, (
        "CompleteCardResult must declare score: it is the per-card points column on "
        "flashcard_attempts (tools/shared/db.py:196)")

    obj = _push_object_literal()
    assert re.search(r"\btopic_tag\b", obj), (
        "Flashcards.tsx onCheck must push topic_tag -- the card carries it as card.tag")
    assert re.search(r"\bscore\b", obj), (
        "Flashcards.tsx onCheck must push score -- the per-card points banked for this card")


@pytest.mark.asyncio
async def test_complete_persists_attempts_from_frontend_shaped_payload(monkeypatch):
    """The wire contract in the EXACT key set Flashcards.tsx pushes into resultsRef.

    Distinct from test_complete_persists_attempts_and_feeds_retention above, which sends a
    hand-crafted minimal body: this one carries the SM-2 fields too, so it fails if the
    real payload shape ever stops round-tripping.
    """
    from tools.api.routers import student as mod
    attempts = []

    async def _sm2(cid, interval, ease, reps, due): pass
    async def _profile(_sid): return {"xp": 90}
    async def _update_profile(_sid, **k): pass
    async def _attempt(**k): attempts.append(k)

    monkeypatch.setattr(mod, "update_card_sm2", _sm2)
    monkeypatch.setattr(mod, "get_profile", _profile)
    monkeypatch.setattr(mod, "update_profile", _update_profile)
    monkeypatch.setattr(mod.db, "insert_flashcard_attempt", _attempt)

    body = {"xp_delta": 58, "results": [
        {"card_id": "f1", "correct": True, "repetitions": 0, "easiness": 2.5,
         "interval_days": 1, "topic_tag": "iop_nct", "score": 12},
        {"card_id": "f2", "correct": False, "repetitions": 2, "easiness": 2.4,
         "interval_days": 6, "topic_tag": "iop_nct", "score": 2},
    ]}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        r = await ac.post("/api/flashcards/complete", json=body, headers=auth_headers(role="OA"))
    assert r.status_code == 200
    assert len(attempts) >= 1
    assert attempts[0] == {"student_id": "stud-test", "card_id": "f1",
                           "topic_tag": "iop_nct", "correct": True, "score": 12}


@pytest.mark.asyncio
async def test_complete_without_topic_tag_writes_no_attempts(monkeypatch):
    """The failure mode this task fixes, pinned so nobody re-introduces it by accident.

    A payload with no topic_tag succeeds (200, never 422) and persists nothing but XP --
    no attempt row, no per-topic retention write. That silence is exactly how
    flashcard_attempts reached 0 rows in production. The server-side filter is KEPT: an
    attempt with no topic cannot be bucketed by any P2 aggregation, so writing it would
    only add junk. The frontend is the side that must send it, and CompleteCardResult now
    makes omitting it a typecheck error rather than a silent data loss.
    """
    from tools.api.routers import student as mod
    attempts, profile_updates = [], []

    async def _sm2(cid, interval, ease, reps, due): pass
    async def _profile(_sid): return {"xp": 10}
    async def _update_profile(_sid, **k): profile_updates.append(k)
    async def _attempt(**k): attempts.append(k)

    monkeypatch.setattr(mod, "update_card_sm2", _sm2)
    monkeypatch.setattr(mod, "get_profile", _profile)
    monkeypatch.setattr(mod, "update_profile", _update_profile)
    monkeypatch.setattr(mod.db, "insert_flashcard_attempt", _attempt)

    body = {"xp_delta": 30, "results": [
        {"card_id": "f1", "correct": True, "repetitions": 0, "easiness": 2.5, "interval_days": 1},
    ]}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        r = await ac.post("/api/flashcards/complete", json=body, headers=auth_headers(role="OA"))
    assert r.status_code == 200
    assert attempts == []
    assert profile_updates == [{"xp_delta": 30}]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/api/test_flashcards_complete.py -v`
Expected: FAIL — `test_frontend_complete_payload_carries_topic_tag_and_score` fails with:

```
AssertionError: CompleteCardResult must declare topic_tag: POST /api/flashcards/complete drops every result without one (tools/api/routers/student.py:468)
assert 'topic_tag' in ('card_id', 'correct', 'easiness', 'interval_days', 'repetitions')
```

The other five tests in the file pass — they exercise the already-correct server.

- [ ] **Step 3: Write minimal implementation**

In `frontend/src/hooks/useFlashcards.ts`, replace the `CompleteCardResult` interface (lines 26-29) with:

```ts
export interface CompleteCardResult {
  card_id?: string; correct: boolean;
  repetitions?: number; easiness?: number; interval_days?: number;
  /** REQUIRED, not optional. POST /api/flashcards/complete keeps only results with a
   *  truthy topic_tag (tools/api/routers/student.py:468) -- for BOTH the
   *  flashcard_attempts insert and the per-topic retention write. Omitting it returned
   *  200 and silently discarded every attempt, which is why the table held 0 rows in
   *  production. Required so a regression is a `npm run typecheck` failure, not a
   *  runtime one nobody sees. */
  topic_tag: string;
  /** Points banked for this card (analytics only) -- the `score` column on
   *  flashcard_attempts, migration 010. */
  score: number;
}
```

In `frontend/src/aurora/screens/Flashcards.tsx`, replace `onCheck` (lines 151-186) with:

```tsx
  const onCheck = (correct: boolean, _selected: number[], _reasoning: string) => {
    if (checked || !card) return;
    setChecked(true);

    // Tally (skip double-counting on the free-text self-mark which calls onCheck once).
    const t = byTopicRef.current[card.tag] ?? { seen: 0, missed: 0 };
    t.seen += 1; if (!correct) t.missed += 1;
    byTopicRef.current[card.tag] = t;
    if (!correct) missedRef.current.push(card);

    // Combo: a correct card extends the streak and earns base × multiplier; the
    // bonus folds into xpRef so it flows to /complete as real XP. A miss resets it.
    const oldCombo = comboRef.current;
    const newCombo = correct ? oldCombo + 1 : 0;
    comboRef.current = newCombo; setCombo(newCombo);
    // ricoe B3: fire the loud popup when the streak crosses into a new multiplier tier
    // (×2 at 2, ×3 at 5), then keep rewarding every 2-in-a-row past the cap.
    if (correct) {
      const tierUp = comboMultiplier(newCombo) > comboMultiplier(oldCombo);
      const pastCap = newCombo >= 6 && newCombo % 2 === 0;
      if (tierUp || pastCap) setBurst({ key: Date.now(), combo: newCombo });
    }
    // Difficulty-scaled base × combo, banked as real XP (the same cardPoints the HUD shows).
    // Free-text tutor cards are self-graded → base only, no combo inflation.
    const xp = card.freeText
      ? (correct ? cardBase(card.difficulty) : XP_ATTEMPT)
      : cardPoints(card.difficulty, correct, newCombo);
    xpRef.current += xp; addXP(xp); incrementTotalCards();
    // Recorded here, AFTER xp exists, so the attempt carries its real points. topic_tag is
    // what makes the row survive at all: /api/flashcards/complete drops every result
    // without one, so before this the flashcard_attempts table stayed empty and per-topic
    // retention never updated. Moving the push down is behaviour-neutral — nothing above
    // reads resultsRef. `|| "general"` matches the column default (migration 010) and the
    // generator's own fallback, so a tutor-seeded card with no topic still records an
    // attempt instead of vanishing.
    resultsRef.current.push({
      card_id: card.card_id, correct,
      repetitions: card.repetitions, easiness: card.easiness, interval_days: card.interval_days,
      topic_tag: card.tag || "general", score: xp,
    });
    if (correct && comboMultiplier(newCombo) >= 3) {
      grantAchievements(user?.studentId ?? "", ["combo_godlike"]).forEach(enqueue);
    }
  };
```

No harness-fixture work: the `/api/flashcards/complete` **response** shape is unchanged (`frontend/tests/aurora_assert.mjs:84`, `frontend/tests/_mocks.mjs:114` mock only the response), and both `/api/flashcards/generate` mocks already serve `topic_tag` on every card (`aurora_assert.mjs:75,81`, `_mocks.mjs:100`).

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
python -m pytest tests/api/test_flashcards_complete.py -v
bash scripts/start-harness.sh stop
npm --prefix frontend run typecheck
npm --prefix frontend run build:safe
```

Expected: PASS — all six tests in `test_flashcards_complete.py` (the three pre-existing ones unchanged), clean `tsc`, clean webpack build. The harness stop is mandatory before the build: `node .next/standalone/server.js` on :3000 holds a lock on `.next` and `next build` dies with `EBUSY`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useFlashcards.ts frontend/src/aurora/screens/Flashcards.tsx tests/api/test_flashcards_complete.py
git commit -m "fix(flashcards): send topic_tag and score so attempts are recorded"
```

---

## Task 2: Token summary counts every session, and admits when it cannot

`/api/admin/token-summary` (`tools/api/routers/admin.py:521-542`) reads `db.get_all_sessions()`, which defaults `limit=500` (`tools/shared/db.py:389-399`), so the "AI tokens" KPI silently under-reports once the cohort passes 500 sessions — and there is no `.range()` call anywhere in `tools/`, so nothing else is paginated either. This task adds the generic paginator the rest of P2 builds on, points token-summary at a two-column sibling read, and surfaces `complete` so the board can render "≥" instead of a confidently wrong total. Ships standalone: zero coupling to the depth layer.

**Files:**
- Modify: `tools/shared/db.py` (add `import asyncio`; insert `_fetch_all` + `get_all_session_tokens` immediately above `get_all_sessions` at `:389`. **Do not touch `get_all_sessions`** — `/api/admin/activity` shares it and it selects `*`, including the free-text `summary` column)
- Modify: `tools/api/routers/admin.py:521-542` (`admin_token_summary`)
- Modify: `tests/api/test_admin_endpoints.py:436-451` (`test_admin_token_summary_excludes_removed_student` patches the old read — repoint it in the same commit). **No `STAFF_READ_ENDPOINTS` change** — `("GET", "/api/admin/token-summary")` is already listed at `:25`
- Modify: `frontend/src/hooks/useAdmin.ts:148-155` (`TokenSummary` + `useTokenSummary`)
- Modify: `frontend/src/aurora/screens/AdminCohort.tsx:92` (the "AI tokens" `StatCard`)
- Modify: `frontend/tests/_mocks.mjs:141` and `frontend/tests/aurora_assert.mjs:812` (fixture shape — `.mjs` is not type-checked, so a stale mock only fails at render time)
- Test: `tests/shared/test_db_bulk_reads.py` (**Create**)
- Test: `tests/api/test_admin_token_summary.py` (**Create**)

- [ ] **Step 1: Write the failing test**

```python
# tests/shared/test_db_bulk_reads.py
"""Bounded bulk reads — the paginator behind every P2 cohort aggregation.

PostgREST caps rows server-side and `.select()` gives the caller no way to tell a
complete result from a truncated one; `get_all_sessions()` compounds that with its own
`limit=500` default. `_fetch_all` pages with `.range()` and returns `(rows, complete)`
so a cap hit becomes a fact the endpoint can report rather than a silently short answer.

The fake below implements the builder for real — `.range(start, end)` slices inclusively
at BOTH ends, exactly like PostgREST — so an off-by-one in the page arithmetic fails here
instead of dropping or double-counting one row per page in production.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import tools.shared.db as db


class _FakeQuery:
    """Minimal PostgREST query builder: sync chaining, async execute()."""

    def __init__(self, rows: list[dict], log: list):
        self._rows = list(rows)
        self._log = log
        self._window: tuple[int, int] | None = None
        self._limit: int | None = None

    def select(self, columns: str):
        self._log.append(("select", columns))
        return self

    def eq(self, column: str, value):
        self._log.append(("eq", column, value))
        self._rows = [r for r in self._rows if r.get(column) == value]
        return self

    def order(self, column: str, desc: bool = False):
        self._log.append(("order", column, desc))
        self._rows.sort(key=lambda r: r.get(column) or "", reverse=desc)
        return self

    def limit(self, n: int):
        self._log.append(("limit", n))
        self._limit = n
        return self

    def range(self, start: int, end: int):
        self._log.append(("range", start, end))
        self._window = (start, end)
        return self

    async def execute(self):
        rows = self._rows
        if self._window is not None:
            start, end = self._window
            rows = rows[start:end + 1]  # PostgREST .range() is inclusive at both ends
        if self._limit is not None:
            rows = rows[:self._limit]
        response = MagicMock()
        response.data = rows
        return response


class _FakeClient:
    """Supabase client stub. Each .table() hands back a FRESH builder, matching the real
    client — a shared builder would let one page's filters leak into the next."""

    def __init__(self, rows_by_table: dict[str, list[dict]]):
        self._rows_by_table = rows_by_table
        self.log: list = []

    def table(self, name: str):
        self.log.append(("table", name))
        return _FakeQuery(self._rows_by_table.get(name, []), self.log)


def _sessions(n: int, tokens: int = 100) -> list[dict]:
    return [{"student_id": "act1", "token_count": tokens} for _ in range(n)]


@pytest.mark.asyncio
async def test_bulk_read_paginates_past_max_rows():
    """2500 rows over a 1000-row page size: three requests, every row returned, complete."""
    fake = _FakeClient({"chat_sessions": _sessions(2500)})
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=fake)):
        rows, complete = await db._fetch_all("chat_sessions", "student_id, token_count")
    assert len(rows) == 2500
    assert complete is True
    assert [c for c in fake.log if c[0] == "range"] == [
        ("range", 0, 999), ("range", 1000, 1999), ("range", 2000, 2999)
    ]


@pytest.mark.asyncio
async def test_bulk_read_flags_incomplete_at_page_cap():
    """max_pages is a hard stop, not a guess. Exhausting it without a short page means
    rows may remain, so complete is False — the caller must not present a total."""
    fake = _FakeClient({"chat_sessions": _sessions(250)})
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=fake)):
        rows, complete = await db._fetch_all(
            "chat_sessions", "student_id, token_count", page=100, max_pages=2
        )
    assert len(rows) == 200
    assert complete is False


@pytest.mark.asyncio
async def test_bulk_read_applies_equality_filters():
    fake = _FakeClient({"chat_sessions": [
        {"student_id": "act1", "token_count": 10},
        {"student_id": "rem1", "token_count": 99},
    ]})
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=fake)):
        rows, complete = await db._fetch_all(
            "chat_sessions", "student_id, token_count", student_id="act1"
        )
    assert rows == [{"student_id": "act1", "token_count": 10}]
    assert complete is True
    assert ("eq", "student_id", "act1") in fake.log


@pytest.mark.asyncio
async def test_get_all_session_tokens_projects_only_two_columns():
    """chat_sessions.summary is free-text conversation content and every row also carries
    a topic and a model string. A token total needs two columns; pulling `*` across the
    whole table would drag all of that onto the single prod worker for nothing."""
    fake = _FakeClient({"chat_sessions": _sessions(3)})
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=fake)):
        rows, complete = await db.get_all_session_tokens()
    assert len(rows) == 3
    assert complete is True
    assert ("table", "chat_sessions") in fake.log
    assert ("select", "student_id, token_count") in fake.log


@pytest.mark.asyncio
async def test_get_all_sessions_stays_capped_at_500():
    """Regression guard on the DELIBERATE cap: /api/admin/activity shares this read and it
    selects `*`. The token fix must arrive as a sibling read, never as a widening of this
    one — uncapping it would pull every session's full row on every dashboard load."""
    fake = _FakeClient({"chat_sessions": _sessions(600)})
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=fake)):
        rows = await db.get_all_sessions()
    assert len(rows) == 500
    assert ("limit", 500) in fake.log
    assert not [c for c in fake.log if c[0] == "range"]
```

```python
# tests/api/test_admin_token_summary.py
"""/api/admin/token-summary must count every session, or say that it could not.

The endpoint read db.get_all_sessions(), which defaults limit=500 — past 500 sessions the
"AI tokens" KPI rendered a confident number that was simply too small, with nothing on the
wire to say so. It now reads the paginated two-column sibling and emits `complete`.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


def _admin_cookie():
    # Unique sub per test file so this file's requests never share a limiter bucket.
    return {"eyebot_token": create_access_token("stu_token_summary", "admin", "OA")}


class _FakeQuery:
    """Minimal PostgREST query builder: sync chaining, async execute()."""

    def __init__(self, rows: list[dict], log: list):
        self._rows = list(rows)
        self._log = log
        self._window: tuple[int, int] | None = None
        self._limit: int | None = None

    def select(self, columns: str):
        self._log.append(("select", columns))
        return self

    def eq(self, column: str, value):
        self._log.append(("eq", column, value))
        self._rows = [r for r in self._rows if r.get(column) == value]
        return self

    def order(self, column: str, desc: bool = False):
        self._log.append(("order", column, desc))
        self._rows.sort(key=lambda r: r.get(column) or "", reverse=desc)
        return self

    def limit(self, n: int):
        self._log.append(("limit", n))
        self._limit = n
        return self

    def range(self, start: int, end: int):
        self._log.append(("range", start, end))
        self._window = (start, end)
        return self

    async def execute(self):
        rows = self._rows
        if self._window is not None:
            start, end = self._window
            rows = rows[start:end + 1]  # PostgREST .range() is inclusive at both ends
        if self._limit is not None:
            rows = rows[:self._limit]
        response = MagicMock()
        response.data = rows
        return response


class _FakeClient:
    def __init__(self, rows_by_table: dict[str, list[dict]]):
        self._rows_by_table = rows_by_table
        self.log: list = []

    def table(self, name: str):
        self.log.append(("table", name))
        return _FakeQuery(self._rows_by_table.get(name, []), self.log)


def test_token_summary_counts_past_500_sessions():
    """1200 sessions x 100 tokens = 120_000. A limit=500 read reports 50_000 — a wrong
    number with no way for the UI to know. Patched at the client seam so the pagination
    itself is exercised end to end, not just the aggregation."""
    fake = _FakeClient({"chat_sessions": [
        {"student_id": "act1", "token_count": 100} for _ in range(1200)
    ]})
    active = [{"student_id": "act1", "role": "OA"}]
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=fake)), \
         patch("tools.shared.db.get_active_leaderboard_profiles", new=AsyncMock(return_value=active)):
        r = client.get("/api/admin/token-summary", cookies=_admin_cookie())
    assert r.status_code == 200
    body = r.json()
    assert body["total_tokens"] == 120_000
    assert body["complete"] is True
    by_student = {row["student_id"]: row["tokens"] for row in body["by_student"]}
    assert by_student == {"act1": 120_000}


def test_token_summary_flags_incomplete_at_cap():
    """A cap hit must reach the wire. `complete: false` means total_tokens is a FLOOR, and
    the KPI renders "≥ 30.0k" — a truthful lower bound beats a confident wrong total."""
    rows = [{"student_id": "act1", "token_count": 30_000}]
    active = [{"student_id": "act1", "role": "OA"}]
    with patch("tools.shared.db.get_all_session_tokens", new=AsyncMock(return_value=(rows, False))), \
         patch("tools.shared.db.get_active_leaderboard_profiles", new=AsyncMock(return_value=active)):
        r = client.get("/api/admin/token-summary", cookies=_admin_cookie())
    assert r.status_code == 200
    body = r.json()
    assert body["complete"] is False
    assert body["total_tokens"] == 30_000


def test_token_summary_reports_complete_on_a_full_read():
    rows = [{"student_id": "act1", "token_count": 42}]
    active = [{"student_id": "act1", "role": "OA"}]
    with patch("tools.shared.db.get_all_session_tokens", new=AsyncMock(return_value=(rows, True))), \
         patch("tools.shared.db.get_active_leaderboard_profiles", new=AsyncMock(return_value=active)):
        r = client.get("/api/admin/token-summary", cookies=_admin_cookie())
    assert r.json()["complete"] is True
    assert r.json()["total_tokens"] == 42


def test_token_summary_db_failure_is_a_500_not_a_zero():
    """P1's invariant: a failed read must never render as a real measurement of zero."""
    with patch("tools.shared.db.get_all_session_tokens",
               new=AsyncMock(side_effect=Exception("chat_sessions unavailable"))), \
         patch("tools.shared.db.get_active_leaderboard_profiles", new=AsyncMock(return_value=[])):
        r = client.get("/api/admin/token-summary", cookies=_admin_cookie())
    assert r.status_code == 500
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/shared/test_db_bulk_reads.py tests/api/test_admin_token_summary.py -v`
Expected: FAIL — in `tests/shared/test_db_bulk_reads.py`, `test_bulk_read_paginates_past_max_rows` raises `AttributeError: module 'tools.shared.db' has no attribute '_fetch_all'` (and `test_get_all_session_tokens_projects_only_two_columns` raises `AttributeError: module 'tools.shared.db' has no attribute 'get_all_session_tokens'`); in `tests/api/test_admin_token_summary.py`, `test_token_summary_counts_past_500_sessions` fails on `assert 50000 == 120000` and the other three fail at patch time with `AttributeError: <module 'tools.shared.db' from '...\tools\shared\db.py'> does not have the attribute 'get_all_session_tokens'`. Only `test_get_all_sessions_stays_capped_at_500` passes.

- [ ] **Step 3: Write minimal implementation**

**3a.** In `tools/shared/db.py`, add `asyncio` to the stdlib imports at the top of the file:

```python
import asyncio
import os
from pathlib import Path
```

**3b.** In `tools/shared/db.py`, insert immediately ABOVE `async def get_all_sessions(...)` (currently line 389). `get_all_sessions` itself stays byte-for-byte unchanged:

```python
async def _fetch_all(table: str, columns: str, *, page: int = 1000,
                     max_pages: int = 50, **filters) -> tuple[list[dict], bool]:
    """Read a whole table in `page`-sized `.range()` pages → (rows, complete).

    PostgREST caps rows server-side and a bare `.select()` cannot tell a complete result
    from a truncated one, so every unpaginated bulk read is a silent under-report waiting
    for the cohort to grow. `complete=False` means the page cap was reached and rows may
    remain: the caller must present the figure as a floor, never as a total.

    `**filters` are equality filters (`column=value` → `.eq`). Windowed reads keep their
    own `.gte()` helpers — they are already bounded by the window.

    No global ORDER BY: these are append-only event tables, and the only chat_sessions
    index is (student_id, created_at) — a global sort would re-sort the whole table on
    every page, on the single prod worker. Each page is wrapped in wait_for so a hung
    PostgREST read can't pin an event-loop task indefinitely (invariant #1).
    """
    client = await _get_client()
    rows: list[dict] = []
    complete = False
    for i in range(max_pages):
        start = i * page
        q = client.table(table).select(columns)
        for column, value in filters.items():
            q = q.eq(column, value)
        result = await asyncio.wait_for(q.range(start, start + page - 1).execute(), timeout=20.0)
        batch = result.data or []
        rows.extend(batch)
        # A short page is the only proof there is nothing left. A page that exactly fills
        # is ambiguous, so a table sized at an exact multiple of `page` reports
        # complete=False — deliberately under-claiming rather than over-claiming.
        if len(batch) < page:
            complete = True
            break
    return rows, complete


async def get_all_session_tokens() -> tuple[list[dict], bool]:
    """Every session's token count, paginated. Used by /api/admin/token-summary.

    A sibling of get_all_sessions, NOT a widening of it: that read is shared with
    /api/admin/activity and selects `*`, so uncapping it would pull every session's
    free-text summary too. Two columns only.
    """
    return await _fetch_all("chat_sessions", "student_id, token_count")
```

**3c.** In `tools/api/routers/admin.py`, replace `admin_token_summary` (`:521-542`) with:

```python
@router.get("/api/admin/token-summary")
async def admin_token_summary(current_user: CurrentUser = Depends(require_staff)):
    try:
        # Paginated two-column read. The old get_all_sessions() defaulted to limit=500,
        # so this KPI silently under-reported past 500 sessions.
        all_sessions, complete = await db.get_all_session_tokens()
        # Active members only — a removed student's tokens must drop out of the
        # grand total and the per-student breakdown.
        active_ids = {str(p.get("student_id")) for p in await db.get_active_leaderboard_profiles()}
    except Exception:
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")
    total = 0
    by_student: dict[str, int] = {}
    for s in all_sessions:
        sid = s.get("student_id", "")
        if str(sid) not in active_ids:
            continue
        tc = int(s.get("token_count", 0) or 0)
        total += tc
        by_student[sid] = by_student.get(sid, 0) + tc
    return {
        "total_tokens": total,
        # False when the paginator hit its page cap: total_tokens is then a FLOOR, and the
        # UI must render "≥". A number the backend knows is short has to say so on the wire.
        "complete": complete,
        "by_student": [{"student_id": k, "tokens": v} for k, v in by_student.items()],
    }
```

**3d.** In `tests/api/test_admin_endpoints.py`, repoint the existing token-summary test (`:436-451`) at the new read — it patches `get_all_sessions`, which the endpoint no longer calls, so it would pass against the real (unpatched) client:

```python
def test_admin_token_summary_excludes_removed_student():
    """Token totals must exclude a removed student — their tokens drop out of the
    grand total and the per-student breakdown."""
    sessions = [
        {"student_id": "act1", "token_count": 100},
        {"student_id": "rem1", "token_count": 50},
    ]
    active = [{"student_id": "act1", "role": "OA"}]  # rem1 is not an active member
    with patch("tools.shared.db.get_all_session_tokens", new=AsyncMock(return_value=(sessions, True))), \
         patch("tools.shared.db.get_active_leaderboard_profiles", new=AsyncMock(return_value=active)):
        r = client.get("/api/admin/token-summary", cookies=_admin_headers())
    assert r.status_code == 200
    body = r.json()
    assert body["total_tokens"] == 100
    by_student = {row["student_id"]: row["tokens"] for row in body["by_student"]}
    assert by_student == {"act1": 100}
```

**3e.** In `frontend/src/hooks/useAdmin.ts`, replace the `TokenSummary` interface and `useTokenSummary` (`:148-155`) with:

```ts
export interface TokenSummary {
  total_tokens: number;
  by_student: { student_id: string; tokens: number }[];
  // False when the server's paginated read hit its page cap — total_tokens is then a
  // FLOOR, not a total. Optional so a response persisted under the previous shape
  // (admin queries live in IndexedDB for 24h) reads as "unknown", never as "incomplete";
  // that is also why this needs no PERSIST_SCHEMA_VERSION bump.
  complete?: boolean;
}
/** Token totals scan every chat_sessions row (paginated server-side), making this the
    most expensive read on the board — so it is deliberately OFF the 30s poll that LIVE
    applies to everything else. Usage totals move slowly, and a 30s poll from every open
    staff tab multiplied that full scan on the single prod worker. Fresh on focus plus a
    5-min stale window; the manual Refresh still invalidates ["admin"] and refetches it. */
export function useTokenSummary() {
  return useQuery<TokenSummary>({
    queryKey: ["admin", "token-summary"],
    queryFn: () => getJSON<TokenSummary>("/api/admin/token-summary"),
    refetchOnWindowFocus: true,
    staleTime: 5 * 60_000,
  });
}
```

**3f.** In `frontend/src/aurora/screens/AdminCohort.tsx`, replace the "AI tokens" `StatCard` (`:92`):

```tsx
        <StatCard tone="purple" label="AI tokens" value={kpi(tokens, `${tokens.data?.complete === false ? "≥ " : ""}${fmtTokens(tokens.data?.total_tokens ?? 0)}`)} />
```

**3g.** In `frontend/tests/_mocks.mjs`, replace line 141:

```js
  await ctx.route("**/api/admin/token-summary", (r) => r.fulfill(J({ total_tokens: 48213, complete: true, by_student: [{ student_id: "S001", tokens: 48213 }] })));
```

**3h.** In `frontend/tests/aurora_assert.mjs`, replace line 812:

```js
  await c.route("**/api/admin/token-summary", (r) => r.fulfill(JSON_OK({ total_tokens: 48213, complete: true, by_student: [{ student_id: "S001", tokens: 48213 }] })));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/shared/test_db_bulk_reads.py tests/api/test_admin_token_summary.py tests/shared/test_db.py tests/api/test_admin_endpoints.py -v`
Expected: PASS — the nine new tests, plus the repointed `test_admin_token_summary_excludes_removed_student`, plus every pre-existing `test_db.py` and `test_admin_endpoints.py` test (including the four guard-tier tests that already cover `/api/admin/token-summary` via `STAFF_READ_ENDPOINTS`).

Then the frontend gates — kill the harness server first, it holds a lock on `.next/standalone` and `next build` dies with `EBUSY`:

Run: `bash scripts/start-harness.sh stop && npm --prefix frontend run typecheck && npm --prefix frontend run build:safe && SKIP_BUILD=1 bash scripts/start-harness.sh aurora`
Expected: PASS — typecheck clean, webpack build succeeds, aurora harness green (the admin KPI row still renders `48.2k`, with no `≥` prefix, because both fixtures now send `complete: true`).

- [ ] **Step 5: Commit**

```bash
git add tools/shared/db.py tools/api/routers/admin.py tests/shared/test_db_bulk_reads.py tests/api/test_admin_token_summary.py tests/api/test_admin_endpoints.py frontend/src/hooks/useAdmin.ts frontend/src/aurora/screens/AdminCohort.tsx frontend/tests/_mocks.mjs frontend/tests/aurora_assert.mjs
git commit -m "fix(admin): paginate the token-summary read and surface when it is capped"
```

---

## Task 3: Flashcard-to-case topic crosswalk

`flashcard_attempts.topic_tag` holds *flashcard* topic keys (45, `tools/flashcards/flashcard_sets.py:26-79`) while OSCE aggregation groups by *case* set keys (21, `tools/cases/topic_sets.py:17-69`) — two disjoint namespaces. `resolve_set` never reports "no match": it falls through `_RULES` to `_DEFAULT` (`tools/cases/topic_sets.py:168,192`), so `resolve_set("OA", "anatomy_physiology")` silently returns `"history_taking"` and `resolve_set("OT", "hrt")` returns `"screening"`. Without an explicit crosswalk, Plan A's flashcard panel would rank whole knowledge families as weak procedural sets.

**Files:**
- Create: `tools/supervisor/topic_crosswalk.py`
- Test: `tests/content/test_topic_crosswalk.py`
- Read-only inputs (do not edit): `tools/flashcards/flashcard_sets.py:26-79` (FLASHCARD_TOPICS, `DIFFICULTIES` at :19, `make_set_key` at :93), `tools/cases/topic_sets.py:17-69` (SET_LABELS), `tools/cases/topic_sets.py:185-192` (`resolve_set`)

- [ ] **Step 1: Write the failing test**

```python
# tests/content/test_topic_crosswalk.py
"""Guards the flashcard-topic -> case-set-group crosswalk against content drift.

Flashcard topic keys and case set keys are DISJOINT namespaces. `resolve_set`
cannot express "no match" — it falls through to `_DEFAULT`, dumping unmatched
topics into `history_taking` (CLINICAL) or `screening` (OT). So the mapping is
authored by hand, and this file is what stops it rotting: every real key in both
taxonomies is iterated, so adding a flashcard topic or renaming a case set FAILS
CI instead of silently vanishing into a bucket.
"""
from tools.cases.topic_sets import resolve_set, sets_for
from tools.flashcards.flashcard_sets import DIFFICULTIES, FLASHCARD_TOPICS, make_set_key
from tools.supervisor.topic_crosswalk import (
    FLASHCARD_TO_SET,
    KNOWLEDGE_GROUP,
    flashcard_group,
)

# `sets_for` routes through case_pool(), so "OA" -> CLINICAL and "OT" -> OT —
# the same two live pools tests/content/test_coverage.py iterates.
CLINICAL_SET_KEYS = {k for k, _ in sets_for("OA")}
OT_SET_KEYS = {k for k, _ in sets_for("OT")}
ALL_SET_KEYS = CLINICAL_SET_KEYS | OT_SET_KEYS

# Tags that are NOT taxonomy topics but do reach the column: migration 010 declares
# `topic_tag TEXT NOT NULL DEFAULT 'general'` (010_flashcard_attempts.sql:14) and the
# card serialiser falls back to "general" (tools/api/routers/student.py:331,341).
LEGACY_TAGS = {"general"}


def _all_flashcard_topics() -> list[str]:
    """Every topic key across FOUNDATIONS + CLINICAL + OT, in declaration order."""
    return [tk for topics in FLASHCARD_TOPICS.values() for tk, _label in topics]


def test_every_flashcard_topic_has_an_explicit_group():
    """No real topic may rely on flashcard_group's fallback — the fallback exists
    for garbage tags, not for content the taxonomy actually ships."""
    missing = [tk for tk in _all_flashcard_topics() if tk not in FLASHCARD_TO_SET]
    assert not missing, f"flashcard topics missing from FLASHCARD_TO_SET: {missing}"


def test_every_mapped_value_is_a_real_group():
    """A typo'd or renamed target would create a phantom group that no OSCE
    attempt can ever join, so the topic's accuracy would render against nothing."""
    bad = {tk: grp for tk, grp in FLASHCARD_TO_SET.items()
           if grp != KNOWLEDGE_GROUP and grp not in ALL_SET_KEYS}
    assert not bad, f"crosswalk targets that are not real case set keys: {bad}"


def test_no_stale_crosswalk_entries():
    """Catches the other direction: a topic renamed in flashcard_sets.py leaves a
    dead entry here, and the renamed topic silently takes the fallback."""
    known = set(_all_flashcard_topics()) | LEGACY_TAGS
    stale = sorted(set(FLASHCARD_TO_SET) - known)
    assert not stale, f"crosswalk keys that are no longer flashcard topics: {stale}"


def test_foundations_and_knowledge_tags_route_to_the_knowledge_group():
    """FOUNDATIONS is studied by EVERY role (flashcard_sets.py:88-90), so it has no
    single-pool OSCE counterpart. Same for the two knowledge-shaped CLINICAL tags."""
    knowledge = [tk for tk, _ in FLASHCARD_TOPICS["FOUNDATIONS"]] + ["abbreviations", "general"]
    for tk in knowledge:
        assert flashcard_group(tk) == KNOWLEDGE_GROUP, f"{tk} escaped the knowledge group"


def test_foundations_name_collisions_stay_in_the_knowledge_group():
    """`ocular_emergencies` and `perioperative` exist in BOTH namespaces. The
    FOUNDATIONS deck of that name is knowledge recall, and OT students study it
    too — pointing it at the CLINICAL OSCE set would inject OT flashcard accuracy
    into a station those students never sit. Pinned so nobody 'fixes' the collision."""
    assert "ocular_emergencies" in CLINICAL_SET_KEYS
    assert flashcard_group("ocular_emergencies") == KNOWLEDGE_GROUP
    # The CLINICAL *flashcard* topic of the same name as a CLINICAL set does map across.
    assert flashcard_group("perioperative") == "perioperative"


def test_procedural_topics_stay_inside_their_own_pool():
    """A cross-pool mis-bucket is invisible in the totals but silently blends an OT
    cohort's accuracy into a CLINICAL group (or vice versa)."""
    for pool, allowed in (("CLINICAL", CLINICAL_SET_KEYS), ("OT", OT_SET_KEYS)):
        for tk, _label in FLASHCARD_TOPICS[pool]:
            grp = flashcard_group(tk)
            assert grp in allowed or grp == KNOWLEDGE_GROUP, \
                f"{pool} topic {tk!r} -> {grp!r}, which is not a {pool} set key"


def test_clinical_and_ot_set_keys_are_disjoint():
    """Downstream (`TopicGroupRow.pool`) derives a group's discipline from its set
    key alone. That is only sound while the two pools share no key."""
    overlap = CLINICAL_SET_KEYS & OT_SET_KEYS
    assert not overlap, f"set key collides across pools: {overlap}"


def test_flashcard_group_strips_the_difficulty_suffix():
    """Flashcards build "<topic>__<difficulty>" set keys (flashcard_sets.py:93) — a
    third, unrelated meaning of "set key". An unstripped tag misses every entry."""
    for tk in _all_flashcard_topics():
        for difficulty in DIFFICULTIES:
            assert flashcard_group(make_set_key(tk, difficulty)) == flashcard_group(tk)
    assert flashcard_group("iop_nct__easy") == "tonometry_iop"
    assert flashcard_group("iop_nct") == "tonometry_iop"


def test_flashcard_group_tolerates_empty_and_unknown_tags():
    """Unknown tags must land in the knowledge bucket, NEVER in an OSCE-backed
    group — a bad tag cannot be allowed to move a procedural set's accuracy."""
    for tag in ("", "not_a_topic", "totally__bogus"):
        assert flashcard_group(tag) == KNOWLEDGE_GROUP


def test_crosswalk_beats_resolve_set_on_the_real_failure_cases():
    """The defect this module exists for. resolve_set has no rule for these topics
    and its _DEFAULT swallows them into a real OSCE set."""
    assert resolve_set("OA", "anatomy_physiology") == "history_taking"
    assert flashcard_group("anatomy_physiology") == KNOWLEDGE_GROUP
    assert resolve_set("OA", "abbreviations") == "history_taking"
    assert flashcard_group("abbreviations") == KNOWLEDGE_GROUP
    assert resolve_set("OT", "hrt") == "screening"
    assert flashcard_group("hrt") == "oct_imaging"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/content/test_topic_crosswalk.py -v`
Expected: FAIL — collection error, `E   ModuleNotFoundError: No module named 'tools.supervisor.topic_crosswalk'` (pytest reports `ERROR tests/content/test_topic_crosswalk.py` / `1 error`, no tests collected).

- [ ] **Step 3: Write minimal implementation**

```python
# tools/supervisor/topic_crosswalk.py
"""Flashcard `topic_tag` -> case set-key group. Pure data + one function, no I/O.

`flashcard_attempts.topic_tag` carries FLASHCARD topic keys (45, defined in
tools/flashcards/flashcard_sets.py:26-79). OSCE aggregation groups by CASE set
keys (21, defined in tools/cases/topic_sets.py:17-69). The namespaces are
DISJOINT, and `topic_sets.resolve_set` cannot say "no match" — it falls through
its ordered substring rules to `_DEFAULT` (topic_sets.py:168), so a flashcard tag
handed to it is silently absorbed:

    resolve_set("OA", "anatomy_physiology") -> "history_taking"
    resolve_set("OT", "hrt")                -> "screening"

Whole knowledge families would then be ranked as weak *procedural* sets. Hence an
EXPLICIT map, never a derived one. tests/content/test_topic_crosswalk.py iterates
every key in both taxonomies, so new content fails CI rather than vanishing.
"""
from __future__ import annotations

from tools.flashcards.flashcard_sets import DIFFICULTIES

# Pseudo-group for flashcard topics with no OSCE counterpart. Not a case set key,
# so a group carrying it renders flashcard-only (osce attempts = 0).
KNOWLEDGE_GROUP: str = "knowledge_foundations"

# flashcard topic_key -> case set_key | KNOWLEDGE_GROUP.
FLASHCARD_TO_SET: dict[str, str] = {
    # --- FOUNDATIONS (12) ------------------------------------------------------
    # Shared knowledge layer studied by EVERY role (flashcard_sets.py:88-90). No
    # case set is a counterpart: the case library is split into two disjoint
    # procedural pools, so pointing a shared knowledge deck at a CLINICAL set key
    # would fold OT students' accuracy into a station they never sit — and the
    # reverse for OT. `ocular_emergencies` and `glaucoma` collide by NAME with
    # clinical concepts; that is not a counterpart, it is a collision.
    "anatomy_physiology": KNOWLEDGE_GROUP,
    "microbiology_infection": KNOWLEDGE_GROUP,
    "pharmacology": KNOWLEDGE_GROUP,
    "ocular_emergencies": KNOWLEDGE_GROUP,
    "professional_ethics": KNOWLEDGE_GROUP,
    "disorders_eyelid_lacrimal_orbit": KNOWLEDGE_GROUP,
    "disorders_cornea_conjunctiva": KNOWLEDGE_GROUP,
    "disorders_lens_cataract": KNOWLEDGE_GROUP,
    "disorders_uvea_retina": KNOWLEDGE_GROUP,
    "glaucoma": KNOWLEDGE_GROUP,
    "neuro_strabismus": KNOWLEDGE_GROUP,
    "systemic_disease": KNOWLEDGE_GROUP,

    # --- CLINICAL (14) -> CLINICAL set keys ------------------------------------
    "red_eye": "red_eye",
    "triage": "triage_referral",
    "history_taking": "history_taking",
    "distance_va": "visual_acuity",       # the OSCE set is "Visual Acuity & Refraction"
    "near_vision": "visual_acuity",
    "pinhole": "visual_acuity",
    "iop_nct": "tonometry_iop",
    "eye_drops": "eye_drops",
    "pupil_dilation": "pupil_dilation",
    "colour_vision": "colour_macular",    # the OSCE set is "Colour Vision & Amsler"
    "amsler_macula": "colour_macular",
    "fall_risk": "fall_risk",
    "perioperative": "perioperative",
    # Cross-cutting notation drilled for every role; no station examines it.
    "abbreviations": KNOWLEDGE_GROUP,

    # --- OT (19) -> OT set keys ------------------------------------------------
    "oct_macula": "oct_imaging",
    "oct_rnfl": "oct_imaging",
    "hvf": "visual_fields",
    "gvf": "visual_fields",
    "ascan_biometry": "biometry",
    "optical_biometry": "biometry",
    "endothelial": "anterior_segment",
    "asoct": "anterior_segment",
    "flare": "anterior_segment",
    "corneal_topography": "corneal_topography",
    "pam": "precataract_pam",
    # HRT is confocal scanning-laser tomography of the optic nerve head, i.e.
    # structural posterior-segment imaging — it belongs with the OCT stations.
    # resolve_set has no `hrt` rule and would dump it in `screening` via _DEFAULT.
    "hrt": "oct_imaging",
    "orthoptics": "orthoptics",
    "dayward_theatre": "dayward_theatre",
    "auto_refraction": "refraction_acuity",
    "aberrometry": "refraction_acuity",
    "lens_meter": "refraction_acuity",
    "retinal_imaging": "oct_imaging",
    "dr_grading": "screening",            # SORC grading is the screening station

    # --- Legacy / default column value ----------------------------------------
    # migration 010 declares `topic_tag TEXT NOT NULL DEFAULT 'general'`
    # (010_flashcard_attempts.sql:14) and the card serialiser falls back to it
    # (tools/api/routers/student.py:331,341). Real rows carry it; map it explicitly.
    "general": KNOWLEDGE_GROUP,
}

_DIFFICULTIES: frozenset[str] = frozenset(DIFFICULTIES)


def flashcard_group(topic_tag: str) -> str:
    """Bucket one `flashcard_attempts.topic_tag` into a topic group.

    Strips a trailing "__<difficulty>" first: flashcards build set keys as
    "<topic>__<difficulty>" (flashcard_sets.py:93) and either form can reach the
    column. Only a KNOWN difficulty is stripped, and `split_set_key` is
    deliberately not reused — its bare `rpartition("__")` returns ("", "", tag)
    for a plain topic key, which would blank every unsuffixed tag.

    Unknown tags fall back to KNOWLEDGE_GROUP, never to an OSCE-backed set: a
    stray tag must not be able to move a procedural group's accuracy. Every real
    topic is an explicit key above, enforced by tests/content/test_topic_crosswalk.py.
    """
    tag = (topic_tag or "").strip().lower()
    head, sep, tail = tag.rpartition("__")
    if sep and head and tail in _DIFFICULTIES:
        tag = head
    return FLASHCARD_TO_SET.get(tag, KNOWLEDGE_GROUP)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/content/test_topic_crosswalk.py tests/content/test_coverage.py -v`
Expected: PASS — all ten crosswalk tests green, and the pre-existing content-coverage suite (which reads the same two taxonomies) still green.

- [ ] **Step 5: Commit**

```bash
git add tools/supervisor/topic_crosswalk.py tests/content/test_topic_crosswalk.py
git commit -m "feat(admin): add explicit flashcard-to-case topic crosswalk"
```

---

## Task 4: Case index built off the event loop

`case_progress` rows carry a `case_id` and nothing else — no topic, no discipline — so every cohort aggregate needs a `case_id → {pool, set_key, label, difficulty}` map built from the 155 case JSONs. The only source of that truth is `load_case`/`list_available_cases` (`tools/cases/load_case.py:20,44`), both **synchronous and uncached** (the latter re-globs `cases/` on every call), so building it inside a request would block the single prod uvicorn worker (invariant #1). Grouping must use production's precedence `c.get("topic_set") or resolve_set(role, c.get("topic", ""))` (`tools/api/routers/cases.py:334,397`) or trainers see different groups than students — with `resolve_set`'s silent `_DEFAULT` fallback (`tools/cases/topic_sets.py:168,192`) replaced by an explicit `None`, so an unclassifiable case is excluded rather than inflating `history_taking`/`screening`.

**Files:**
- Create: `tools/supervisor/case_index.py`
- Modify: `tools/api/server.py` (`_warmup()`, lines 60-83 — append a fail-open index warm and update the docstring)
- Test: `tests/supervisor/test_case_index.py` (**create**)
- Test: `tests/api/test_startup_warmup.py` (**modify** — append one test)

- [ ] **Step 1: Write the failing test**

```python
# tests/supervisor/test_case_index.py
"""The analytics case index: correct groups, built off the event loop, built once.

`case_progress` carries only `case_id`, so every P2 aggregate buckets attempts through
this map. Three failure modes it has to be immune to:

1. Building it inside a request. `list_available_cases()` re-globs cases/ and `load_case()`
   reads a file with no cache (tools/cases/load_case.py:20,44) — 155 blocking reads on the
   single prod uvicorn worker would stall every concurrent request (invariant #1).
2. Building it N times. Without single-flight, N concurrent cold requests each re-read the
   whole library.
3. Grouping differently from the student-facing case list. Trainers and students must see
   the same topic groups, so this asserts the index against the REAL 155 files using
   production's precedence (tools/api/routers/cases.py:334,397).
"""
import asyncio
import threading
import time
from unittest.mock import patch

import pytest

from tools.cases.load_case import list_available_cases, load_case
from tools.cases.topic_sets import case_pool, case_visible, label_for, resolve_set
from tools.supervisor import case_index


@pytest.fixture(autouse=True)
def _fresh_index():
    """Reset the per-worker cache AND its lock around every test.

    pytest-asyncio gives each test its own event loop, and `asyncio.Lock` binds to the
    loop of its first *contended* acquire (`_LoopBoundMixin`), so the single-flight test
    below would otherwise poison the lock for any later contended test in the suite.
    """
    case_index._INDEX = None
    case_index._INDEX_LOCK = asyncio.Lock()
    yield
    case_index._INDEX = None
    case_index._INDEX_LOCK = asyncio.Lock()


@pytest.mark.asyncio
async def test_case_index_built_off_event_loop():
    loop_thread = threading.get_ident()
    read_on: list[int] = []

    def _fake_load(case_id: str) -> dict:
        read_on.append(threading.get_ident())
        return {
            "case_id": case_id, "role": "OA",
            "topic": "history_taking_basics", "difficulty": "beginner",
        }

    with patch("tools.supervisor.case_index.list_available_cases", return_value=["case_oa_001"]), \
         patch("tools.supervisor.case_index.load_case", side_effect=_fake_load):
        index = await case_index.get_case_index()

    assert index["case_oa_001"]["set_key"] == "history_taking"
    assert read_on, "load_case was never called — the index did not actually build"
    assert all(t != loop_thread for t in read_on), (
        "case files were read on the event-loop thread; on the single prod uvicorn worker "
        "that stalls every concurrent request (invariant #1)"
    )


@pytest.mark.asyncio
async def test_case_index_single_flight():
    builds: list[int] = []

    def _slow_build() -> dict:
        builds.append(1)
        time.sleep(0.05)  # widen the window so all five callers overlap the build
        return {"case_oa_001": {
            "pool": "CLINICAL", "set_key": "history_taking",
            "label": "History Taking", "difficulty": "beginner",
        }}

    with patch("tools.supervisor.case_index._build_case_index", side_effect=_slow_build):
        results = await asyncio.gather(*[case_index.get_case_index() for _ in range(5)])

    assert len(builds) == 1, f"index rebuilt {len(builds)}x under concurrency; single-flight is broken"
    # Same object, not merely equal: the map is published by one whole-dict rebind, so no
    # caller can ever observe a half-filled index and mis-bucket attempts as unclassified.
    assert all(r is results[0] for r in results)


@pytest.mark.asyncio
async def test_case_index_matches_student_case_list_grouping():
    index = await case_index.get_case_index()

    case_ids = list_available_cases()
    cases = [load_case(cid) for cid in case_ids]

    assert len(index) == len(case_ids), (
        "a case in cases/ could not be classified and was dropped from analytics; give it "
        "an explicit `topic_set` (a new content topic must fail CI, never vanish silently)"
    )

    # The student list groups by the STUDENT's role; the index groups by the CASE's role.
    # Those agree only because no case is role-neutral — `resolve_set` buckets within a
    # pool, so an "any" case would group differently for a CLINICAL vs an OT student.
    # Pinned here so that assumption fails loudly the day someone authors one.
    assert not any((c.get("role") or "any") == "any" for c in cases)

    for c in cases:
        expected = c.get("topic_set") or resolve_set(c["role"], c.get("topic", ""))
        entry = index[c["case_id"]]
        assert entry["set_key"] == expected, f"{c['case_id']}: {entry['set_key']} != {expected}"
        assert entry["pool"] == case_pool(c["role"])
        assert entry["label"] == label_for(c["role"], expected)
        assert entry["difficulty"] == c.get("difficulty", "beginner")

    # Replay the student-facing case list verbatim (tools/api/routers/cases.py:334) for one
    # student role per pool: same visibility filter, same precedence, same answer.
    for student_role in ("OA", "OT"):
        for c in cases:
            if not case_visible(student_role, c.get("role", "any") or "any"):
                continue
            student_sk = c.get("topic_set") or resolve_set(student_role, c.get("topic", ""))
            assert index[c["case_id"]]["set_key"] == student_sk

    # The one real case whose topic matches no rule: `resolve_set` would file it under OT
    # `screening` via _DEFAULT; its declared `topic_set` is why precedence order matters.
    hazard = "case_ot_045_hirschberg_krimsky_child_esotropia"
    assert hazard in index
    assert case_index.resolve_set_strict("OT", "hirschberg_krimsky_strabismus_child") is None
    assert resolve_set("OT", "hirschberg_krimsky_strabismus_child") == "screening"
    assert index[hazard]["set_key"] == "orthoptics"


@pytest.mark.asyncio
async def test_unclassifiable_case_excluded():
    files = {
        "case_oa_ok": {
            "case_id": "case_oa_ok", "role": "OA",
            "topic": "tonometry_goldmann", "difficulty": "intermediate",
        },
        "case_oa_mystery": {
            "case_id": "case_oa_mystery", "role": "OA",
            "topic": "underwater_basket_weaving", "difficulty": "beginner",
        },
    }

    with patch("tools.supervisor.case_index.list_available_cases", return_value=list(files)), \
         patch("tools.supervisor.case_index.load_case", side_effect=lambda cid: files[cid]):
        index = await case_index.get_case_index()

    assert index["case_oa_ok"] == {
        "pool": "CLINICAL", "set_key": "tonometry_iop",
        "label": "Intraocular Pressure", "difficulty": "intermediate",
    }
    # Fail closed. `resolve_set` never says "no match" — it would file this unrelated case
    # into History Taking and move that group's cohort score.
    assert "case_oa_mystery" not in index
    assert resolve_set("OA", "underwater_basket_weaving") == "history_taking"
    assert case_index.resolve_set_strict("OA", "underwater_basket_weaving") is None
```

Append to `tests/api/test_startup_warmup.py` (after `test_warmup_skips_gemini_in_mock_mode_and_is_fail_open`, keeping the existing imports — `asyncio`, `patch`, `AsyncMock` are all already imported at lines 10-11):

```python
def test_warmup_warms_the_case_index():
    """The index is 155 blocking file reads; the first cohort-analytics request must not
    pay them. Fail-open like the rest of _warmup — a bad case file cannot wedge startup."""
    from tools.api import server
    from tools.supervisor import case_index

    warm = AsyncMock(return_value={})
    with patch("tools.shared.db._get_client", AsyncMock()), \
         patch.object(server, "MOCK_MODE", True), \
         patch.object(case_index, "get_case_index", warm):
        asyncio.run(server._warmup())

    warm.assert_awaited_once()


def test_warmup_survives_a_failing_case_index():
    from tools.api import server
    from tools.supervisor import case_index

    with patch("tools.shared.db._get_client", AsyncMock()), \
         patch.object(server, "MOCK_MODE", True), \
         patch.object(case_index, "get_case_index", AsyncMock(side_effect=RuntimeError("bad case file"))):
        asyncio.run(server._warmup())  # must NOT raise
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/supervisor/test_case_index.py tests/api/test_startup_warmup.py -v`
Expected: FAIL — `tests/supervisor/test_case_index.py` errors during collection with `ModuleNotFoundError: No module named 'tools.supervisor.case_index'`, and both new warmup tests raise the same `ModuleNotFoundError` from their `from tools.supervisor import case_index` line. pytest summary: `2 failed, 2 passed, 1 error`.

- [ ] **Step 3: Write minimal implementation**

Create `tools/supervisor/case_index.py`:

```python
"""Case index for analytics — `case_id -> {pool, set_key, label, difficulty}`.

`case_progress` rows carry a `case_id` and nothing else about the case: no topic, no
discipline. Every cohort aggregation therefore needs this map to bucket an attempt into
a topic group, and the 155 JSONs in `cases/` are the only source of that truth.

Invariant #2 carve-out (no shared in-process state): `_INDEX` is a per-worker, idempotent
READ cache over immutable on-disk case files. It holds no counters, no cross-request
semantics and no user data, so two workers with different cache states still compute
identical answers. It is deliberately NOT `tools.api.shared._case_cache`: that one is
lazily *partial* by construction (one case at a time, on demand) and is wiped at runtime
by `PATCH /api/profile/role` (tools/api/routers/student.py:154) — aliasing it would drop
attempts out of the aggregate at random.

Grouping precedence is production's, verbatim:
`case.get("topic_set") or resolve_set(role, case.get("topic", ""))`
(tools/api/routers/cases.py:334,397). Trainers must see the same groups students do.
"""
from __future__ import annotations

import asyncio

from tools.cases.load_case import list_available_cases, load_case
# `_RULES` is private, and imported deliberately: a copied rule table would drift from
# production's grouping the first time a keyword is added, and matching production
# exactly is this module's entire job.
from tools.cases.topic_sets import _RULES, case_pool, label_for

# The roles a case may be authored for. Anything else — including a role-neutral "any" —
# is unclassifiable here, because CLINICAL and OT resolve the same topic to different
# sets, so a role-neutral case has no single correct group. Zero of the 155 cases declare
# "any" today; the real-file coverage test fails CI if one appears, forcing the decision.
_CASE_ROLES = ("OA", "OT", "PSA")

# Whole-build bound. A wedged filesystem must surface as one failed request, never as a
# hung worker.
_BUILD_TIMEOUT_S = 10.0

_INDEX: dict[str, dict] | None = None
_INDEX_LOCK = asyncio.Lock()


def resolve_set_strict(role: str, topic: str) -> str | None:
    """`topic_sets.resolve_set` without the `_DEFAULT` fallback.

    `resolve_set` (topic_sets.py:185) never reports "no match": anything unmatched comes
    back as `history_taking` (CLINICAL) or `screening` (OT) via `_DEFAULT` (:168). For a
    student-facing list that is harmless — every case stays reachable. For analytics it is
    a lie: an unrelated case would move a real group's cohort score. Return None instead.
    """
    pool = case_pool(role)
    topic = (topic or "").lower()
    for kw, key in _RULES.get(pool, []):
        if kw in topic:
            return key
    return None


def classify_case(case: dict) -> dict | None:
    """Group one case dict; None when it cannot be grouped (fail closed, never bucketed)."""
    case_id = str(case.get("case_id") or "").strip()
    role = str(case.get("role") or "").strip().upper()
    if not case_id or role not in _CASE_ROLES:
        return None
    # An explicit `topic_set` always wins over the keyword rules — 68 of 155 cases carry
    # one, and at least one of them (case_ot_045, hirschberg/krimsky) has a topic the rules
    # do NOT match, so the declared set is the only correct answer for it.
    set_key = case.get("topic_set") or resolve_set_strict(role, str(case.get("topic") or ""))
    if not set_key:
        return None
    set_key = str(set_key)
    return {
        "pool": case_pool(role),
        "set_key": set_key,
        "label": label_for(role, set_key),
        "difficulty": str(case.get("difficulty") or "beginner"),
    }


def _build_case_index() -> dict[str, dict]:
    """SYNC and blocking: re-globs cases/ and reads 155 JSON files off the disk.

    `list_available_cases()` globs on every call and `load_case()` has no cache
    (tools/cases/load_case.py:20,44). Never call this from a coroutine — go through
    `get_case_index()`, which runs it in a worker thread (invariant #1).
    """
    index: dict[str, dict] = {}
    for case_id in list_available_cases():
        try:
            case = load_case(case_id)
        except Exception:
            continue  # one malformed/renamed file must not cost us the other 154
        entry = classify_case(case)
        if entry is None:
            continue
        index[str(case.get("case_id") or case_id)] = entry
    return index


async def get_case_index() -> dict[str, dict]:
    """The case index, built once per worker, off the event loop."""
    global _INDEX
    if _INDEX is not None:
        return _INDEX
    async with _INDEX_LOCK:
        # Re-check under the lock: a concurrent caller may have published while we waited.
        # Without this, N concurrent cold requests each re-read the whole library.
        if _INDEX is not None:
            return _INDEX
        built = await asyncio.wait_for(
            asyncio.to_thread(_build_case_index), timeout=_BUILD_TIMEOUT_S
        )
        # ONE whole-dict rebind. Never fill a module-level dict in place while other
        # coroutines can read it: a partially populated map silently mis-buckets attempts
        # as unclassified instead of failing loudly.
        _INDEX = built
        return built
```

In `tools/api/server.py`, replace `_warmup()` (lines 60-83) with:

```python
async def _warmup() -> None:
    """Pre-touch the lazy Supabase + Gemini clients and the analytics case index so the
    FIRST request after a cold boot doesn't pay their init on its critical path.

    Render free spins the container down when idle; otherwise the first request
    afterwards constructs the Supabase async client (+ httpx pool), imports
    google-genai inline, and (for the admin console) reads 155 case files. This builds
    them ahead of time. It makes NO live model call (zero quota/cost — client
    construction only) and is fully best-effort: any failure is logged and swallowed so
    a slow/missing dependency can never wedge startup.
    """
    try:
        from tools.shared import db
        await db._get_client()
    except Exception as exc:  # dependency not ready — warm lazily on first use
        _startup_log.info("warmup: supabase client not ready (%s)", exc)

    if not MOCK_MODE:
        try:
            from tools.shared.gemini_client import _ensure_sdk_clients
            await asyncio.to_thread(_ensure_sdk_clients)  # import + build, no generate
        except Exception as exc:
            _startup_log.info("warmup: gemini client not ready (%s)", exc)

    # 155 blocking file reads, so the first /api/admin/cohort-analytics would otherwise
    # pay them. get_case_index does the reading in a worker thread; import inside the
    # function to match the rest of _warmup and keep startup import-light.
    try:
        from tools.supervisor.case_index import get_case_index
        await get_case_index()
    except Exception as exc:  # a bad case file must never wedge startup
        _startup_log.info("warmup: case index not ready (%s)", exc)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/supervisor/test_case_index.py tests/api/test_startup_warmup.py tests/cases/test_case_tiers.py tests/cases/test_pool_visibility.py tests/api/test_event_loop_offload.py -v`
Expected: PASS — the four new index tests, the two new warmup tests, the two pre-existing warmup tests (`_warmup` stays fail-open and still makes no live model call), and the case-list/tier tests unchanged (`topic_sets.py` was not touched).

- [ ] **Step 5: Commit**

```bash
git add tools/supervisor/case_index.py tools/api/server.py tests/supervisor/test_case_index.py tests/api/test_startup_warmup.py
git commit -m "feat(admin): build the analytics case index off the event loop"
```

---

## Task 5: Discipline mapping that fails closed on unknown roles

Spec §4.4. The obvious mapper is the trap: `case_pool(role)` is `"OT" if (role or "").upper() == "OT" else "CLINICAL"` (`tools/cases/topic_sets.py:171-174`), so `None`, `""`, `"trainer"`, `"admin"` and every typo return `"CLINICAL"`. Applied to a **student** role it would file staff and unclassifiable students into the `oa_psa` cohort, inflating the exact denominators P2 exists to make honest. This task adds an explicit map that excludes anything it does not recognise, so the endpoint can report those rows as `totals.unclassified_students` — and resolves a pool from the **student**, never the case, because `case_visible()` treats a case with `role: "any"` as visible to every pool (`topic_sets.py:177-182`; zero shipped cases use it today, so this is latent, not theoretical).

The population it runs over is `db.get_active_profiles()`, whose docstring is explicit that staff are absent by construction — *"staff (trainers/admins, who live in supervisors not approved_students) are intentionally NOT here — the leaderboard uses get_active_leaderboard_profiles to add them back in"* (`tools/shared/db.py:260-262`). That is why D10 picks the student-only reader: `get_active_leaderboard_profiles()` deliberately re-adds staff (`db.py:280-286`), and a trainer's profile row has no discipline to belong to. The exclusion rule here is the second line of defence for the day a stale or staff-shaped row reaches the aggregator anyway.

**Files:**
- Create: `tools/supervisor/discipline.py`
- Test: `tests/supervisor/test_discipline.py`
- Read-only reference (not modified): `tools/cases/topic_sets.py:171-182`, `tools/shared/db.py:254-262`

- [ ] **Step 1: Write the failing test**

```python
# tests/supervisor/test_discipline.py
"""Discipline mapping must fail closed on any role that isn't a known student role.

`topic_sets.case_pool()` is the tempting mapper and it is the defect: it returns
"CLINICAL" for None, "", "trainer", "admin" and every typo (topic_sets.py:171-174).
Pointed at a STUDENT role it silently files staff and unclassifiable students into
the oa_psa cohort — inflating exactly the denominators P2 exists to make honest.

These tests pin three things: the query literal -> pool map (with a raise, not a
default, on an unknown literal so the endpoint can answer 400), the
excluded-not-defaulted rule for unresolvable roles, and the guarantee that a staff
role can never land in a student pool.
"""
import pytest

from tools.cases.topic_sets import case_pool
from tools.supervisor.discipline import (
    DISCIPLINES,
    discipline_to_pool,
    pool_for_student_role,
    student_pools,
)


def test_discipline_param_maps_to_pool():
    assert DISCIPLINES == ("oa_psa", "ot", "all")
    assert discipline_to_pool("oa_psa") == "CLINICAL"
    assert discipline_to_pool("ot") == "OT"
    # "all" means "do not filter", NOT a third pool. If this ever returned a string
    # the aggregators would filter every attempt out and the all-disciplines view
    # would render empty rather than complete.
    assert discipline_to_pool("all") is None
    # Query strings arrive however the client typed them; normalise case/whitespace
    # rather than 400 on a cosmetic difference.
    assert discipline_to_pool("  OA_PSA  ") == "CLINICAL"
    # Everything else raises, so the endpoint answers 400 instead of quietly
    # serving one slice under an unrecognised name. Note the CODE literals
    # ("CLINICAL"/"OT") are not accepted as QUERY literals — the two namespaces
    # stay separate.
    for bad in ("", "clinical", "CLINICAL", "oa", "psa", "everyone", "oa_psa_ot"):
        with pytest.raises(ValueError):
            discipline_to_pool(bad)


def test_unknown_role_excluded_from_discipline_pools():
    profiles = [
        {"student_id": "s_oa", "role": "OA"},
        {"student_id": "s_psa", "role": "psa"},       # stored lowercase
        {"student_id": "s_ot", "role": " OT "},       # stray whitespace
        {"student_id": "s_blank", "role": ""},
        {"student_id": "s_none", "role": None},
        {"student_id": "s_missing"},                  # column absent entirely
        {"student_id": "s_typo", "role": "O A"},
        {"role": "OA"},                               # no student_id at all
    ]
    pools = student_pools(profiles)
    assert pools == {"s_oa": "CLINICAL", "s_psa": "CLINICAL", "s_ot": "OT"}
    # The five dropped rows become the endpoint's `totals.unclassified_students`.
    # They must be COUNTABLE by their absence, not absorbed into CLINICAL the way
    # case_pool() would absorb every one of them.
    assert len(profiles) - len(pools) == 5


def test_staff_role_never_lands_in_a_student_pool():
    # The precise defect this module exists to prevent: case_pool() answers
    # "CLINICAL" for all of these, so mapping a student's discipline through it
    # would file trainers, admins and unset roles into oa_psa.
    for staff_role in ("trainer", "admin", "supervisor", "student", ""):
        assert case_pool(staff_role) == "CLINICAL"
        assert pool_for_student_role(staff_role) is None

    # Staff carry student_role "" (auth.py:96) and are already absent from
    # db.get_active_profiles() by construction (db.py:260-262). This is the second
    # line of defence for a stale or staff-shaped row that reaches us anyway.
    staff = [
        {"student_id": "sup1", "role": "trainer"},
        {"student_id": "sup2", "role": "admin"},
    ]
    assert student_pools(staff) == {}

    # ...and the real student roles still resolve, so the guard isn't over-broad.
    assert pool_for_student_role("OA") == "CLINICAL"
    assert pool_for_student_role("PSA") == "CLINICAL"
    assert pool_for_student_role("OT") == "OT"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/supervisor/test_discipline.py -v`
Expected: FAIL — collection error `ModuleNotFoundError: No module named 'tools.supervisor.discipline'` on the `from tools.supervisor.discipline import (...)` line.

- [ ] **Step 3: Write minimal implementation**

```python
# tools/supervisor/discipline.py
"""Discipline (student role) -> case pool mapping for admin analytics.

The admin console slices cohort analytics by DISCIPLINE: `oa_psa` | `ot` | `all`.
`topic_sets.case_pool()` looks like the mapper for that job and is exactly wrong
here: it is `"OT" if (role or "").upper() == "OT" else "CLINICAL"`
(topic_sets.py:171-174), so None, "", "trainer", "admin" and every typo answer
"CLINICAL". Run over STUDENT roles it would file staff and unclassifiable
students into the oa_psa cohort and inflate its denominators.

So this module maps EXPLICITLY and fails closed: a role outside the known student
sets is EXCLUDED, and the caller reports the dropped rows as
`totals.unclassified_students` rather than defaulting them into a discipline.

Pool is resolved from the STUDENT, never from the case: `case_visible()` treats a
case authored `role: "any"` as visible to every pool (topic_sets.py:177-182), so
keying an attempt on the case's role would force such a case into one pool. No
shipped case uses "any" today — this keeps that latent hazard from becoming a
silent miscount later.

Pure: no I/O, no state, no event-loop concerns.
"""
from __future__ import annotations

# Query literal -> pool filter. `all` maps to None, meaning "do not filter".
# Insertion order is the console's switcher order and defines DISCIPLINES below,
# so the accepted literals and the lookup table can never drift apart.
_POOL_BY_DISCIPLINE: dict[str, str | None] = {
    "oa_psa": "CLINICAL",
    "ot": "OT",
    "all": None,
}

DISCIPLINES: tuple[str, ...] = tuple(_POOL_BY_DISCIPLINE)

# Student role -> pool, as explicit membership sets. Deliberately NOT an
# `else CLINICAL` branch: an unrecognised role must fall out of the mapping, not
# inherit a default. This is the whole point of the module.
_OA_PSA_ROLES = frozenset({"OA", "PSA"})
_OT_ROLES = frozenset({"OT"})


def pool_for_student_role(role: str | None) -> str | None:
    """The case pool a STUDENT's role studies, or None when the role is unknown.

    None covers staff ("trainer"/"admin"), a blank role (staff carry student_role
    "" — auth.py:96), a missing column, and typos. Callers count those students as
    unclassified instead of defaulting them into a discipline.
    """
    key = (role or "").strip().upper()
    if key in _OA_PSA_ROLES:
        return "CLINICAL"
    if key in _OT_ROLES:
        return "OT"
    return None


def discipline_to_pool(discipline: str) -> str | None:
    """Query literal -> pool filter; `all` -> None (no filter).

    Raises ValueError on an unknown literal so the endpoint can answer 400 rather
    than silently serving one discipline's slice under an unrecognised name.
    """
    key = (discipline or "").strip().lower()
    if key not in _POOL_BY_DISCIPLINE:
        raise ValueError(f"unknown discipline: {discipline!r}")
    return _POOL_BY_DISCIPLINE[key]


def student_pools(profiles: list[dict]) -> dict[str, str]:
    """student_id -> pool over `db.get_active_profiles()` rows (D10: student-only,
    never get_active_leaderboard_profiles, which deliberately re-adds staff).

    Rows whose role does not resolve are OMITTED — their count is the caller's
    `totals.unclassified_students`. A row with no student_id is skipped too: it
    can be neither aggregated nor reported against.
    """
    pools: dict[str, str] = {}
    for p in profiles:
        sid = str(p.get("student_id") or "")
        if not sid:
            continue
        pool = pool_for_student_role(p.get("role"))
        if pool is None:
            continue
        pools[sid] = pool
    return pools
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/supervisor/test_discipline.py tests/cases/test_pool_visibility.py -v`
Expected: PASS — the three new discipline tests, plus the four pre-existing `test_pool_visibility` cases proving `tools/cases/topic_sets.py` was read-only in this task (`case_pool` still returns `"CLINICAL"` for OA/PSA and `"OT"` for OT; the new module wraps it, it does not change it).

- [ ] **Step 5: Commit**

```bash
git add tools/supervisor/discipline.py tests/supervisor/test_discipline.py
git commit -m "feat(admin): map discipline to case pool, failing closed on unknown roles"
```

---

## Task 6: Bulk analytics reads with narrow projections

Cohort aggregation has to scan two whole tables, and neither has a reader fit for it: there is no all-student flashcard read at all, and `get_all_case_progress` (`tools/shared/db.py:402-411`) is `select("*")` with no `.range()` — it drags the multi-KB `coaching` JSONB on every row onto the single prod worker, and past PostgREST's row cap it silently drops the **oldest** rows (it orders `completed_at DESC`). This task adds two **siblings** through Task 2's `_fetch_all`, projecting only the columns the aggregators read and returning `(rows, complete)` so a capped read can be labelled "≥ N" rather than reported as a confident wrong number (spec §4.3).

The existing readers stay byte-for-byte untouched: `get_all_case_progress` is shared with `/api/admin/activity` (`tools/api/routers/admin.py:184`), whose P1 feed reads `score_100`/`safe`/`missed_critical` out of that `select("*")`; and `get_case_progress_since` (`tools/shared/db.py:429-438`, used at `admin.py:249`) documents its two-column projection as the reason the activity trend never pulls the full table.

**Files:**
- Modify: `tools/shared/db.py` (insert two functions after `get_case_progress_since`, which ends at line 438, i.e. above the `# ── approved_students ──` banner at line 441; `_fetch_all` from Task 2 already exists)
- Test: `tests/shared/test_db_analytics_reads.py` (**Create**)

- [ ] **Step 1: Write the failing test**

```python
# tests/shared/test_db_analytics_reads.py
"""Bulk analytics reads must project narrowly and report their own completeness.

P2 cohort aggregation scans two whole tables on the single prod worker. `select("*")`
on case_progress drags the `coaching` JSONB — a per-row feedback blob — for every
attempt, and an unpaginated read silently truncates at PostgREST's row cap. These
siblings project only the columns the aggregators read and return `(rows, complete)`
so a capped read renders as "≥ N" instead of a confident wrong total.

They are SIBLINGS, not replacements. `get_all_case_progress` selects `*` and is shared
with /api/admin/activity (whose feed reads score_100/safe/missed_critical out of it);
`get_case_progress_since`'s two-column projection is its documented reason for existing.
Narrowing or widening either one to "help" would change a shipped endpoint, so the last
test pins both.
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

import tools.shared.db as db


class _Query:
    """Stand-in for the supabase-py query builder.

    Records the table name and projection, serves `.range()` slices out of a seeded row
    list, and passes every other builder call (`.order`, `.gte`, `.eq`, ...) straight
    through via __getattr__ — so these tests pin the projection without coupling to how
    `_fetch_all` encodes its keyword filters or orders its pages.
    """

    def __init__(self, table: str, rows: list, calls: dict, error: Exception | None):
        self._rows = rows
        self._calls = calls
        self._error = error
        self._slice: tuple[int, int] | None = None
        calls.setdefault("tables", []).append(table)

    def select(self, columns):
        self._calls.setdefault("columns", []).append(columns)
        return self

    def range(self, start, end):
        self._calls.setdefault("ranges", []).append((start, end))
        self._slice = (start, end)
        return self

    def __getattr__(self, name):
        def _passthrough(*args, **kwargs):
            return self
        return _passthrough

    async def execute(self):
        if self._error is not None:
            raise self._error
        if self._slice is None:
            return SimpleNamespace(data=list(self._rows))
        start, end = self._slice
        # PostgREST .range() bounds are INCLUSIVE on both ends.
        return SimpleNamespace(data=list(self._rows[start:end + 1]))


class _Client:
    """Mock Supabase client: sync builder chain, async execute() (supabase-py 2.x)."""

    def __init__(self, rows: list, calls: dict, error: Exception | None = None):
        self._rows = rows
        self._calls = calls
        self._error = error

    def table(self, name: str) -> _Query:
        return _Query(name, self._rows, self._calls, self._error)


def _patch_client(rows: list, calls: dict, error: Exception | None = None):
    return patch(
        "tools.shared.db._get_client",
        new=AsyncMock(return_value=_Client(rows, calls, error)),
    )


@pytest.mark.asyncio
async def test_get_all_flashcard_attempts_projection_and_completeness():
    rows = [
        {"student_id": "s1", "topic_tag": "glaucoma", "correct": True,
         "ts": "2026-07-20T10:00:00Z"},
        {"student_id": "s2", "topic_tag": "optics__advanced", "correct": False,
         "ts": "2026-07-21T10:00:00Z"},
    ]
    calls: dict = {}
    with _patch_client(rows, calls):
        result, complete = await db.get_all_flashcard_attempts()

    assert set(calls["tables"]) == {"flashcard_attempts"}
    projection = calls["columns"][0]
    assert projection == "student_id, topic_tag, correct, ts"
    # flashcard_attempts is the highest-volume table in the product; `*` would also
    # pull card_id + score, which no cohort aggregator reads.
    assert "*" not in projection
    assert "card_id" not in projection
    assert result == rows
    # Two rows is a short first page → the table was read to the end.
    assert complete is True

    # The cap flag is the caller's honesty signal ("≥ 48.2k", not a wrong total), so it
    # must be forwarded verbatim from the paginator — never dropped or re-derived.
    with patch.object(db, "_fetch_all", new=AsyncMock(return_value=(rows, False))):
        capped_rows, capped_complete = await db.get_all_flashcard_attempts()
    assert capped_rows == rows
    assert capped_complete is False


@pytest.mark.asyncio
async def test_get_all_flashcard_attempts_propagates_a_read_failure():
    """A missing table (pre-migration 010) or any read failure must RAISE, exactly like
    the per-student get_flashcard_attempts (db.py:212-223). No PostgREST exception type
    is importable in this tree, so the CALLER catches bare Exception and flags
    sources.flashcard = "unavailable"; swallowing it into ([], True) here would render
    an outage as a confident 0% cohort accuracy — the P1 defect class."""
    calls: dict = {}
    boom = RuntimeError('relation "public.flashcard_attempts" does not exist')
    with _patch_client([], calls, error=boom):
        with pytest.raises(RuntimeError, match="does not exist"):
            await db.get_all_flashcard_attempts()


@pytest.mark.asyncio
async def test_get_all_case_scores_excludes_coaching_blob():
    rows = [
        {"student_id": "s1", "case_id": "case_ot_001", "completed_at": "2026-07-20T10:00:00Z",
         "score_100": 82, "safe": True, "passed": True, "total_score": 32},
        {"student_id": "s2", "case_id": "case_oa_002", "completed_at": "2026-07-21T10:00:00Z",
         "score_100": None, "safe": None, "passed": True, "total_score": 28},
    ]
    calls: dict = {}
    with _patch_client(rows, calls):
        result, complete = await db.get_all_case_scores()

    assert set(calls["tables"]) == {"case_progress"}
    projection = calls["columns"][0]
    assert projection == ("student_id, case_id, completed_at, score_100, safe, passed, "
                          "total_score, missed_critical")
    # The one column with no fallback: osce_by_group's missed_top is built from it and
    # nothing else, so dropping it silently empties the most-missed panel forever.
    assert "missed_critical" in projection
    # The whole point of the sibling: never `*`, and never the per-row coaching JSONB,
    # which no cohort aggregator reads and which dominates the payload size.
    assert "*" not in projection
    assert "coaching" not in projection
    assert "consult_technique" not in projection
    assert result == rows
    assert complete is True
    # Ungraded pre-Tier-2 rows come back as NULLs, not zeros — per-metric denominators
    # (D13) depend on the aggregator being able to tell them apart.
    assert result[1]["score_100"] is None


@pytest.mark.asyncio
async def test_existing_case_progress_reads_are_untouched():
    """The two live readers this task must NOT touch. get_all_case_progress feeds
    /api/admin/activity (admin.py:184), whose P1 feed emits score_100/safe/
    missed_critical straight out of `select("*")` — narrowing it would blank three
    fields on a shipped endpoint. get_case_progress_since (admin.py:249) is windowed
    at the DB on purpose. Both must stay exactly as they are."""
    calls: dict = {}
    with _patch_client([], calls):
        await db.get_all_case_progress()
    assert calls["columns"] == ["*"]
    assert calls["tables"] == ["case_progress"]

    calls2: dict = {}
    with _patch_client([], calls2):
        await db.get_case_progress_since("2026-07-01")
    assert calls2["columns"] == ["student_id, completed_at"]
    assert calls2["tables"] == ["case_progress"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/shared/test_db_analytics_reads.py -v`
Expected: FAIL — 3 failed, 1 passed. The three new-reader tests raise `AttributeError: module 'tools.shared.db' has no attribute 'get_all_flashcard_attempts'` (and, in the third, `AttributeError: module 'tools.shared.db' has no attribute 'get_all_case_scores'`). `test_existing_case_progress_reads_are_untouched` passes already — it is the guard on code this task must not change.

- [ ] **Step 3: Write minimal implementation**

In `tools/shared/db.py`, insert both functions immediately after `get_case_progress_since` (which ends at line 438) and before the `# ── approved_students ──` banner at line 441. `_fetch_all` (Task 2) already wraps the paged read in `asyncio.wait_for`, so these add no timeout of their own:

```python
async def get_all_flashcard_attempts() -> tuple[list[dict], bool]:
    """Every flashcard attempt across all students, paged: (rows, complete).

    Projects only the four columns cohort analytics reads. `select("*")` here would pull
    card_id + score for every row on the product's highest-volume table onto the single
    prod worker, and no aggregator reads either.

    RAISES on a missing table (pre-migration 010), exactly like get_flashcard_attempts.
    No PostgREST exception type is importable in this tree, so the CALLER must catch bare
    Exception and flag sources.flashcard = "unavailable" — never swallow the failure into
    ([], True) here, which would render an outage as a confident 0% cohort accuracy."""
    return await _fetch_all("flashcard_attempts", "student_id, topic_tag, correct, ts")


async def get_all_case_scores() -> tuple[list[dict], bool]:
    """Graded case attempts across all students, paged: (rows, complete).

    A SIBLING of get_all_case_progress, not a replacement: that one selects "*" and is
    shared with /api/admin/activity, whose feed emits score_100/safe/missed_critical from
    it — narrowing it there would blank fields on a shipped endpoint. This projection
    omits the `coaching` JSONB (a per-row feedback blob) and the two sub-domain scores,
    none of which cohort aggregation reads; per-row JSONB is what makes a full-table
    analytics scan expensive.

    Grade columns stay NULL on pre-Tier-2 rows (over half of production today) — pass
    them through untouched so the aggregator can hold each metric to its own denominator
    instead of averaging invented zeros.

    `missed_critical` is in the projection because it is the ONLY source for
    osce_by_group's `missed_top` (spec §5.3) — without it that panel is permanently
    empty. It is a short text array, not the `coaching` blob."""
    return await _fetch_all(
        "case_progress",
        "student_id, case_id, completed_at, score_100, safe, passed, total_score, "
        "missed_critical",
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/shared/test_db_analytics_reads.py tests/shared/test_db.py tests/api/test_admin_activity_fields.py tests/api/test_admin_activity_trend.py -v`
Expected: PASS — all four new tests green, and the pre-existing `tests/shared/test_db.py` plus both activity-endpoint suites (the live consumers of `get_all_case_progress` and `get_case_progress_since`) still green, proving the additive sibling changed nothing shipped.

- [ ] **Step 5: Commit**

```bash
git add tools/shared/db.py tests/shared/test_db_analytics_reads.py
git commit -m "feat(admin): add narrow paged bulk reads for cohort analytics"
```

---

## Task 7: OSCE aggregation from real grades

Every cohort figure today is a snapshot proxy: `cohort_summary()` ranks "weakest topics" with a bare `Counter` over each profile's `weak_topics` list (`tools/supervisor/cohort_summary.py:38,59,70`), and `AdminCohort` derives avg-OSCE and the safety rate from the 80-item activity feed. Neither reads a grade. This task lands the pure aggregator (spec §5.1, §5.3) that turns raw `case_progress` rows into per-topic-group OSCE metrics — the module the P2a endpoint is a thin projection over, and the seam P4 can swap for SQL behind the same dict contract (D4).

**Files:**
- Create: `tools/supervisor/cohort_analytics.py` (new module — this task writes the header and `osce_by_group`; the later flashcard/weakness task appends `flashcard_by_group`, `weakness_scores` and the shared `WEIGHT_RUBRIC`/`MIN_STUDENTS`/`MIN_ATTEMPTS`/`SHRINKAGE_K` constants to the same file)
- Test: `tests/supervisor/test_cohort_analytics_osce.py` (new; `tests/supervisor/__init__.py` already exists)

- [ ] **Step 1: Write the failing test**

```python
# tests/supervisor/test_cohort_analytics_osce.py
"""osce_by_group must aggregate REAL case grades, honestly.

Four things this pins, each a way the panel could confidently lie:

1. **Retakes (D9).** Attainment is the BEST `score_100` per (student, case) — the
   same high-water rule the points economy already applies to OSCE rewards. Volume
   (`attempts`) counts every raw row, and `safety_fail_rate` is over raw attempts,
   because an unsafe encounter is an event, not an attainment level.
2. **Per-metric denominators (§5.3).** In production only 11 of 24 `case_progress`
   rows carry non-NULL `score_100`/`safe`, while `passed` is on every row since the
   base insert (`tools/shared/db.py:152-157`). `scored_n`, `graded_n` and
   `safety_gradable_n` are therefore three different numbers; one shared denominator
   would silently mis-state two metrics out of three.
3. **Nulls, not zeros (D13).** A rate with a zero denominator is `None`. 0.0 would
   rank an untouched topic as the cohort's worst.
4. **Fail closed.** An attempt whose case is not in the index, or whose student has
   no discipline, is EXCLUDED — never bucketed into a default group. `resolve_set`'s
   `_DEFAULT` fallback (`tools/cases/topic_sets.py:192`) is exactly the silent
   mis-grouping §4.1 exists to prevent.
"""
from tools.supervisor.cohort_analytics import osce_by_group

# case_id -> {"pool", "set_key", "label", "difficulty"} — the shape get_case_index()
# returns. Two CLINICAL cases in ONE set_key at different tiers, one OT case.
INDEX = {
    "case_oa_001": {"pool": "CLINICAL", "set_key": "tonometry_iop",
                    "label": "Intraocular Pressure", "difficulty": "beginner"},
    "case_oa_002": {"pool": "CLINICAL", "set_key": "tonometry_iop",
                    "label": "Intraocular Pressure", "difficulty": "advanced"},
    "case_ot_001": {"pool": "OT", "set_key": "oct_imaging",
                    "label": "OCT Imaging", "difficulty": "intermediate"},
}

# student_id -> pool, from discipline.student_pools(). Staff and unknown roles are
# ABSENT by construction, never defaulted to CLINICAL.
POOLS = {"s1": "CLINICAL", "s2": "CLINICAL", "s3": "OT"}

# A checklist `action` string longer than the 80-char wire cap.
LONG_STEP = ("Confirm the patient's identity against the appointment record and "
             "check both the name and the NRIC before starting the measurement")


def _row(student_id: str, case_id: str, **kw) -> dict:
    """A case_progress row. Grade columns are supplied per-test: a pre-Tier-2 row
    genuinely has no score_100/safe key at all."""
    row = {"student_id": student_id, "case_id": case_id,
           "completed_at": "2026-07-20T10:00:00Z"}
    row.update(kw)
    return row


def test_cohort_analytics_dedupes_retakes():
    """Five attempts at one case by one student: one attainment point at the BEST
    score, five attempts of volume, five raw attempts of safety signal. The naive
    mean of all five is 56.0 — which would report a student who reached 80 as
    borderline failing."""
    rows = [_row("s1", "case_oa_001", score_100=s, passed=s >= 60, safe=True)
            for s in (30, 45, 55, 70, 80)]
    g = osce_by_group(rows, INDEX, POOLS)["tonometry_iop"]
    assert g["students"] == 1
    assert g["attempts"] == 5
    assert g["avg_score"] == 80.0
    assert g["scored_n"] == 1
    assert g["pass_rate"] == 1.0
    assert g["graded_n"] == 1
    assert g["safety_gradable_n"] == 5


def test_best_is_per_case_not_per_student():
    """Dedupe keys on (student, case), not student — a student's two DIFFERENT cases
    in one group are two attainment points, so one aced case cannot mask a weak one."""
    rows = [_row("s1", "case_oa_001", score_100=90, passed=True),
            _row("s1", "case_oa_002", score_100=50, passed=False)]
    g = osce_by_group(rows, INDEX, POOLS)["tonometry_iop"]
    assert g["scored_n"] == 2
    assert g["avg_score"] == 70.0
    assert g["pass_rate"] == 0.5
    assert g["students"] == 1


def test_osce_denominators_are_independent():
    """Three rows, three different denominators: one scored, three with `passed`, two
    with a safety verdict."""
    rows = [
        _row("s1", "case_oa_001", score_100=80, passed=True, safe=True),
        _row("s2", "case_oa_001", passed=False),               # pre-Tier-2: no score, no safe
        _row("s2", "case_oa_002", passed=True, safe=False),    # safety graded, still no score
    ]
    g = osce_by_group(rows, INDEX, POOLS)["tonometry_iop"]
    assert g["attempts"] == 3
    assert g["scored_n"] == 1
    assert g["graded_n"] == 3
    assert g["safety_gradable_n"] == 2
    assert g["avg_score"] == 80.0
    assert g["pass_rate"] == round(2 / 3, 3)
    assert g["safety_fail_rate"] == 0.5


def test_empty_group_returns_nulls_not_zeros():
    """An attempted-but-never-graded group reports its volume and nulls everything
    else. 0.0 here would sort this topic to the top of the weakness ranking and send
    a trainer to the emptiest topic, not the worst."""
    g = osce_by_group([_row("s1", "case_oa_001")], INDEX, POOLS)["tonometry_iop"]
    assert g["attempts"] == 1
    assert g["students"] == 1
    assert g["avg_score"] is None
    assert g["pass_rate"] is None
    assert g["safety_fail_rate"] is None
    assert g["scored_n"] == 0
    assert g["graded_n"] == 0
    assert g["safety_gradable_n"] == 0
    assert g["missed_top"] == []


def test_no_rows_returns_empty_dict_not_zero_filled_groups():
    """Untouched groups are ABSENT, never fabricated all-zero rows — the endpoint
    fills the full 21-group frame from the index and labels the gaps as empty."""
    assert osce_by_group([], INDEX, POOLS) == {}


def test_null_score_100_is_not_back_derived_from_total_score():
    """`tools/api/routers/cases.py:86` back-derives round(total_score / 0.4) for a
    student's own history. Cohort attainment must NOT: those rows are the pre-Tier-2
    attempts, whose /40 came from the older checklist-inclusive rubric that the /100
    two-scheme grade deliberately dropped (tools/cases/station_score.py:1-12), the
    inverse quantises to 2.5-point steps, and it cannot conjure `safe` — so avg_score
    would cover a wider population than safety_fail_rate over the same rows."""
    g = osce_by_group([_row("s1", "case_oa_001", total_score=32, passed=True)],
                      INDEX, POOLS)["tonometry_iop"]
    assert g["avg_score"] is None
    assert g["scored_n"] == 0
    assert g["graded_n"] == 1


def test_by_difficulty_counts_raw_attempts_from_the_index():
    """Difficulty mix is a real confound and is REPORTED, not normalised away: a group
    where students pushed on to Advanced reads weaker than one they only sampled at
    Foundational. Trainers need the mix in order to read the score."""
    rows = [
        _row("s1", "case_oa_001", score_100=70, passed=True),    # beginner
        _row("s1", "case_oa_001", score_100=75, passed=True),    # beginner retake — still volume
        _row("s2", "case_oa_002", score_100=40, passed=False),   # advanced
    ]
    g = osce_by_group(rows, INDEX, POOLS)["tonometry_iop"]
    assert g["by_difficulty"] == {"beginner": 2, "intermediate": 0, "advanced": 1}
    assert g["attempts"] == 3


def test_unknown_difficulty_is_dropped_not_counted_as_beginner():
    """Only the three stored tier names count. A mis-tiered case must show up as
    by_difficulty summing BELOW attempts, not as a fake Foundational attempt."""
    index = {"case_x": {"pool": "CLINICAL", "set_key": "red_eye",
                        "label": "Red Eye Differential", "difficulty": "expert"}}
    g = osce_by_group([_row("s1", "case_x", score_100=50, passed=False)],
                      index, POOLS)["red_eye"]
    assert g["by_difficulty"] == {"beginner": 0, "intermediate": 0, "advanced": 0}
    assert g["attempts"] == 1


def test_missed_top_requires_two_students_and_truncates():
    """A step missed by ONE student is dropped: at a ~10-student cohort it identifies
    the individual, and one miss is not a curriculum problem. Step text is capped at
    80 chars so a long checklist action cannot blow out the panel."""
    rows = [
        _row("s1", "case_oa_001", safe=False, missed_critical=[LONG_STEP, "Wash hands"]),
        _row("s2", "case_oa_001", safe=False, missed_critical=[LONG_STEP]),
        _row("s1", "case_oa_002", safe=False, missed_critical=["Wash hands"]),
    ]
    top = osce_by_group(rows, INDEX, POOLS)["tonometry_iop"]["missed_top"]
    assert [m["step"] for m in top] == [LONG_STEP[:80]]
    assert len(top[0]["step"]) == 80
    assert top[0]["count"] == 2
    assert top[0]["students"] == 2


def test_missed_top_caps_at_three_ranked_by_count():
    """Cap 3: the panel is a 'fix these next' list, not a checklist dump. Order is
    deterministic — dict insertion order must never leak into a ranked list a trainer
    acts on."""
    pools = {f"s{i}": "CLINICAL" for i in range(5)}
    rows = [
        _row(f"s{i}", "case_oa_001", safe=False, missed_critical=[step])
        for step, n in (("A step", 4), ("B step", 3), ("C step", 2), ("D step", 5))
        for i in range(n)
    ]
    top = osce_by_group(rows, INDEX, pools)["tonometry_iop"]["missed_top"]
    assert [m["step"] for m in top] == ["D step", "A step", "B step"]
    assert [m["count"] for m in top] == [5, 4, 3]


def test_unknown_case_excluded():
    """A case_id absent from the index (renamed or deleted case file) is dropped, not
    bucketed. The endpoint reports the drop as totals.unclassified_attempts."""
    rows = [
        _row("s1", "case_oa_001", score_100=80, passed=True),
        _row("s1", "case_deleted_999", score_100=10, passed=False),
    ]
    out = osce_by_group(rows, INDEX, POOLS)
    assert list(out) == ["tonometry_iop"]
    assert out["tonometry_iop"]["attempts"] == 1
    assert out["tonometry_iop"]["avg_score"] == 80.0


def test_student_without_a_pool_is_excluded():
    """Staff and unknown-role accounts have no student_pools entry (§4.4) — never call
    case_pool() on them, it returns CLINICAL for trainer/admin/None/typos alike, which
    would drop staff practice runs straight into the OA & PSA cohort."""
    rows = [
        _row("s1", "case_oa_001", score_100=80, passed=True),
        _row("trainer_x", "case_oa_001", score_100=100, passed=True),
    ]
    g = osce_by_group(rows, INDEX, POOLS)["tonometry_iop"]
    assert g["attempts"] == 1
    assert g["students"] == 1
    assert g["avg_score"] == 80.0


def test_pool_filter_keeps_only_that_disciplines_students():
    """The pool filter resolves from the STUDENT, not the case, so a future
    role:"any" case counts correctly in both disciplines (§4.4)."""
    rows = [
        _row("s1", "case_oa_001", score_100=80, passed=True),
        _row("s3", "case_ot_001", score_100=40, passed=False),
    ]
    assert list(osce_by_group(rows, INDEX, POOLS, pool="OT")) == ["oct_imaging"]
    assert list(osce_by_group(rows, INDEX, POOLS, pool="CLINICAL")) == ["tonometry_iop"]
    assert sorted(osce_by_group(rows, INDEX, POOLS)) == ["oct_imaging", "tonometry_iop"]


def test_safety_fail_rate_is_over_raw_attempts_not_best_attempts():
    """A student who fails safety and then passes the retake still HAD an unsafe
    encounter. The high-water rule is for attainment only (D9); collapsing safety to
    the best attempt would erase every critical miss a student later recovered from."""
    rows = [
        _row("s1", "case_oa_001", score_100=30, passed=False, safe=False),
        _row("s1", "case_oa_001", score_100=90, passed=True, safe=True),
    ]
    g = osce_by_group(rows, INDEX, POOLS)["tonometry_iop"]
    assert g["safety_gradable_n"] == 2
    assert g["safety_fail_rate"] == 0.5
    assert g["avg_score"] == 90.0
    assert g["scored_n"] == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/supervisor/test_cohort_analytics_osce.py -v`
Expected: FAIL — collection error, `ModuleNotFoundError: No module named 'tools.supervisor.cohort_analytics'`.

- [ ] **Step 3: Write minimal implementation**

Create `tools/supervisor/cohort_analytics.py`:

```python
# tools/supervisor/cohort_analytics.py
"""Pure cohort aggregation over raw performance events (P2a, spec §5.1).

No I/O: every function takes already-fetched rows plus the case index and the
student->pool map, so the endpoint stays a thin ranking/projection and P4 can swap
a body for a SQL/RPC pushdown behind the same `dict[topic_group, {...}]` contract (D4).

Two rules run through everything here:

* **Per-metric denominators (§5.3).** In production only 11 of 24 `case_progress`
  rows carry non-NULL `score_100`/`safe`, while `passed` is written by the base
  insert on every row (`tools/shared/db.py:152-157`). `scored_n`, `graded_n` and
  `safety_gradable_n` are genuinely different numbers; one shared denominator would
  silently mis-state two metrics out of three.
* **Nulls, not zeros (D13).** Every rate/mean is `float | None`, null when its own
  denominator is 0. P1 zero-fills *counts* on the activity trend; copying that to a
  *mean* is wrong — a topic with no graded attempt has no average, and a 0.0 would
  rank it as the cohort's worst.
"""
from __future__ import annotations

# The three stored tier names (project-locked; never renamed). An unrecognised
# difficulty is DROPPED rather than folded into "beginner" — a mis-tiered case must
# surface as by_difficulty summing below `attempts`, not as a fabricated tier count.
_DIFFICULTIES = ("beginner", "intermediate", "advanced")

_MISSED_TOP_N = 3
_MISSED_STEP_MAXLEN = 80
_MISSED_MIN_STUDENTS = 2


def _score_rank(row: dict) -> tuple[int, int]:
    """Sort key for "best attempt at this case". An unscored (pre-Tier-2) row ranks
    below every scored one — it carries no attainment signal — but still holds the
    pair's slot, so a pair with only unscored rows can still feed `pass_rate` via the
    always-present `passed` column."""
    val = row.get("score_100")
    if val is None:
        return (0, 0)
    try:
        return (1, int(val))
    except (TypeError, ValueError):
        return (0, 0)


def _missed_top(missed: dict) -> list[dict]:
    """Rank the group's missed critical steps: >=2 distinct students, top 3, capped text.

    The two-student floor is signal and privacy at once — across a ~10-student cohort
    a step missed once identifies the individual, and a single miss is not a curriculum
    problem. Aggregation keys on the FULL step text and truncates only on the way out,
    so two distinct steps sharing an 80-char prefix stay two rows instead of merging
    into one inflated count. The "3 of 40" denominator is the group's own `students`,
    so no extra field is needed on the wire.
    """
    ranked = [
        {"step": step[:_MISSED_STEP_MAXLEN],
         "count": agg["count"],
         "students": len(agg["students"])}
        for step, agg in missed.items()
        if len(agg["students"]) >= _MISSED_MIN_STUDENTS
    ]
    # Fully ordered: worst first, then step text. Dict insertion order must not leak
    # into a ranked list a trainer acts on.
    ranked.sort(key=lambda m: (-m["count"], -m["students"], m["step"]))
    return ranked[:_MISSED_TOP_N]


def osce_by_group(
    rows: list[dict],
    case_index: dict,
    student_pools: dict,
    *,
    pool: str | None = None,
) -> dict[str, dict]:
    """Aggregate raw `case_progress` rows into per-set_key OSCE metrics.

    Args:
        rows: case_progress rows. `student_id` and `case_id` are required; the grade
            columns (`score_100`, `passed`, `safe`, `missed_critical`) are optional
            per row, because pre-Tier-2 rows genuinely lack them. The caller's
            projection MUST include `missed_critical` or `missed_top` is always empty
            — it is the one field here with no fallback.
        case_index: case_id -> {"pool", "set_key", "label", "difficulty"}.
        student_pools: student_id -> "CLINICAL" | "OT". Students with an unknown role
            are absent by construction (§4.4) and their attempts are excluded.
        pool: when set, keep only attempts by students in that pool. Resolved from the
            STUDENT, never the case, so a future role:"any" case counts in both
            disciplines.

    Returns dict[set_key, metrics]; a group with no surviving attempt is ABSENT, never
    a zero-filled row — the endpoint fills the full group frame from the index.

    Retakes (D9): attainment (`avg_score`, `pass_rate`) uses the BEST `score_100` per
    (student_id, case_id) — the same high-water rule the OSCE reward already applies.
    `attempts` counts every raw row and `safety_fail_rate` is over raw attempts,
    because an unsafe encounter is an event, not an attainment level.

    NULL `score_100` is NOT back-derived. `tools/api/routers/cases.py:86` derives
    `round(total_score / 0.4)` for a student's own history, but for cohort attainment
    that would (a) quantise to 2.5-point steps, (b) mix rubrics — those rows are the
    pre-Tier-2 attempts, whose /40 predates the two-scheme /100 grade that dropped
    checklist coverage (`tools/cases/station_score.py:1-12`) — and (c) still leave
    `safe` NULL, so `avg_score` would span a wider population than `safety_fail_rate`
    over the very same rows. An honest `scored_n` beats a larger fabricated one.

    Safety denominator caveat (§5.3): `safe = not missed_critical`, and
    `missed_critical` only fills for steps flagged critical, so an attempt on a
    checklist with NO critical step scores `safe=True` while carrying no safety
    signal. The index has no `has_critical` flag, so this falls back to
    `safe IS NOT NULL` — `safety_fail_rate` is therefore diluted downward on groups
    whose checklists lack critical steps. The rubric block must state this.
    """
    acc: dict[str, dict] = {}
    for r in rows:
        sid = str(r.get("student_id") or "")
        case_id = str(r.get("case_id") or "")
        meta = case_index.get(case_id)
        spool = student_pools.get(sid)
        # Fail closed on both axes. An attempt we cannot place in a topic group, or
        # whose student has no discipline, is EXCLUDED and counted by the endpoint as
        # totals.unclassified_*. Bucketing it anyway is exactly what resolve_set's
        # _DEFAULT fallback does, and it lands other people's cases in history_taking.
        if not sid or meta is None or spool is None:
            continue
        if pool is not None and spool != pool:
            continue

        g = acc.setdefault(meta["set_key"], {
            "attempts": 0,
            "students": set(),
            "best": {},            # (student_id, case_id) -> best attainment row
            "safety_fails": 0,
            "safety_gradable_n": 0,
            "missed": {},          # full step text -> {"count", "students"}
            "by_difficulty": {d: 0 for d in _DIFFICULTIES},
        })
        g["attempts"] += 1
        g["students"].add(sid)

        difficulty = str(meta.get("difficulty") or "")
        if difficulty in g["by_difficulty"]:
            g["by_difficulty"][difficulty] += 1

        safe = r.get("safe")
        if safe is not None:
            g["safety_gradable_n"] += 1
            if not safe:
                g["safety_fails"] += 1

        for step in (r.get("missed_critical") or []):
            entry = g["missed"].setdefault(str(step), {"count": 0, "students": set()})
            entry["count"] += 1
            entry["students"].add(sid)

        key = (sid, case_id)
        current = g["best"].get(key)
        if current is None or _score_rank(r) > _score_rank(current):
            g["best"][key] = r

    out: dict[str, dict] = {}
    for set_key, g in acc.items():
        best = list(g["best"].values())
        scores = [int(b["score_100"]) for b in best if b.get("score_100") is not None]
        graded = [bool(b["passed"]) for b in best if b.get("passed") is not None]
        gradable = g["safety_gradable_n"]
        out[set_key] = {
            "attempts": g["attempts"],
            "students": len(g["students"]),
            # Rounded on the way out so the wire carries 66.7, not 66.66666666666667.
            "avg_score": round(sum(scores) / len(scores), 1) if scores else None,
            "scored_n": len(scores),
            "pass_rate": round(sum(graded) / len(graded), 3) if graded else None,
            "graded_n": len(graded),
            "safety_fail_rate": round(g["safety_fails"] / gradable, 3) if gradable else None,
            "safety_gradable_n": gradable,
            "missed_top": _missed_top(g["missed"]),
            "by_difficulty": g["by_difficulty"],
        }
    return out
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/supervisor/ -v`
Expected: PASS — the 14 new `test_cohort_analytics_osce.py` tests, plus the pre-existing `test_at_risk.py`, `test_cohort_summary.py`, `test_cohort_summary_counts.py` and `test_weekly_digest_topics.py` still green (this task is additive — a new module, no existing file touched).

- [ ] **Step 5: Commit**

```bash
git add tools/supervisor/cohort_analytics.py tests/supervisor/test_cohort_analytics_osce.py
git commit -m "feat(admin): aggregate OSCE cohort metrics from real case grades"
```

---

## Task 8: Flashcard aggregation and a weakness score that cannot be gamed by noise

`cohort_summary()` ranks "weakest topics" with a bare `Counter` over each profile's `weak_topics` list — a proxy with no performance signal behind it. This task adds the real replacement: `flashcard_by_group` (bucketed through Task 3's crosswalk) and `weakness_scores`, which blends OSCE and flashcard evidence on a single normalised scale. Both are pure functions in `tools/supervisor/cohort_analytics.py` (created in Task 7 with `osce_by_group`), so the endpoint stays a thin projection and D4's SQL-swap seam holds. At production volume — ~24 OSCE attempts across 21 topic groups, and 6 of 21 groups with ≤5 cases in the library — an undamped score lets one 20/100 attempt top the "weakest topic" list and drive a real teaching decision, so the confidence floor and shrinkage are load-bearing, not polish.

**Files:**
- Modify: `tools/supervisor/cohort_analytics.py` (created in Task 7 — add one import, then append the rubric constants and three functions)
- Test: `tests/supervisor/test_cohort_analytics_weakness.py` (**Create**)

- [ ] **Step 1: Write the failing test**

```python
# tests/supervisor/test_cohort_analytics_weakness.py
"""Flashcard aggregation + the weakness score that replaces the weak_topics Counter.

Four defects are pinned here, each of which would put a wrong topic at the top of the
trainer's "teach this next" list:

1. Scale mixing. Inputs arrive on three scales — score_100 (0-100), pass/fail rates
   (0-1) and flashcard accuracy (0-100, the db.get_topic_accuracy `pct` convention,
   db.py:239-241). A naive weighted sum lets the OSCE score dominate the rates 100x.
2. Zero-filling an absent signal. Treating a missing avg_score as 0 makes the group with
   the LEAST data look maximally weak, so the ranking sends trainers to the emptiest
   topics rather than the worst (D13: nulls, not zeros).
3. Small-n noise. One 20/100 attempt is not a weaker topic than a 62-average over 30.
4. Zeroing the safety term when nothing was safety-gradable, which reads as "this topic
   has a perfect safety record" when the truth is "no attempt here carried a safety
   signal at all".
"""
import pytest

from tools.supervisor.cohort_analytics import (
    MIN_ATTEMPTS,
    MIN_STUDENTS,
    SHRINKAGE_K,
    WEIGHT_RUBRIC,
    _weakness_components,
    flashcard_by_group,
    weakness_scores,
)
from tools.supervisor.topic_crosswalk import KNOWLEDGE_GROUP, flashcard_group

# Resolve group keys THROUGH the crosswalk rather than hardcoding them, so this file
# tests the bucketing path and not a private copy of Task 3's map.
RED = flashcard_group("red_eye")
OCT = flashcard_group("oct_macula")

POOLS = {"cl1": "CLINICAL", "cl2": "CLINICAL", "ot1": "OT"}


def _row(sid: str, tag: str, correct: bool) -> dict:
    return {"student_id": sid, "topic_tag": tag, "correct": correct, "ts": "2026-07-20T02:00:00Z"}


def _osce(**over) -> dict:
    """An osce_by_group row with every denominator at zero — override only what a test
    actually supplies evidence for."""
    row = {
        "attempts": 0, "students": 0,
        "avg_score": None, "scored_n": 0,
        "pass_rate": None, "graded_n": 0,
        "safety_fail_rate": None, "safety_gradable_n": 0,
        "missed_top": [],
        "by_difficulty": {"beginner": 0, "intermediate": 0, "advanced": 0},
    }
    row.update(over)
    return row


# ── flashcard_by_group ────────────────────────────────────────────────────────

def test_flashcard_by_group_buckets_through_the_crosswalk():
    """Raw topic_tags collapse into case set_key groups, difficulty suffix stripped —
    "red_eye__hard" is the same teaching topic as "red_eye"."""
    rows = [
        _row("cl1", "red_eye", True),
        _row("cl1", "red_eye__hard", False),
        _row("cl2", "red_eye", True),
        _row("cl1", "anatomy_physiology", False),
    ]
    out = flashcard_by_group(rows, POOLS)
    assert out[RED] == {"accuracy": 66.7, "n": 3, "students": 2}
    # 0.0 here is a MEASURED zero (one attempt, wrong), not a stand-in for missing data.
    assert out[KNOWLEDGE_GROUP] == {"accuracy": 0.0, "n": 1, "students": 1}


def test_flashcard_by_group_filters_to_the_requested_pool():
    """An attempt's discipline comes from the STUDENT, never the topic (spec 4.4), so a
    shared FOUNDATIONS topic still lands in the right pool's view."""
    rows = [_row("cl1", "red_eye", True), _row("ot1", "oct_macula", True)]
    assert set(flashcard_by_group(rows, POOLS, pool="OT")) == {OCT}
    assert set(flashcard_by_group(rows, POOLS, pool="CLINICAL")) == {RED}
    assert set(flashcard_by_group(rows, POOLS)) == {RED, OCT}


def test_flashcard_by_group_excludes_students_with_no_discipline():
    """Fail closed: a student whose role didn't resolve is dropped from every view,
    `all` included. The endpoint reports them as totals.unclassified_students instead of
    silently folding staff and typo'd roles into oa_psa."""
    rows = [_row("cl1", "red_eye", True), _row("ghost", "red_eye", False)]
    out = flashcard_by_group(rows, POOLS)
    assert out[RED] == {"accuracy": 100.0, "n": 1, "students": 1}


def test_flashcard_by_group_empty_rows_returns_no_groups():
    """flashcard_attempts is empty in production until Plan A task 0.1 ships, so this is
    the common case, not an edge case: a group with no attempts is ABSENT and the
    endpoint renders `flashcard: null`. It must never materialise as accuracy 0.0."""
    assert flashcard_by_group([], POOLS) == {}


# ── WEIGHT_RUBRIC ─────────────────────────────────────────────────────────────

def test_weight_rubric_is_the_single_source_of_the_constants():
    """No inline magic numbers: the confidence policy Plan B's at-risk model reuses lives
    in the rubric and nowhere else."""
    assert sum(WEIGHT_RUBRIC["weights"].values()) == pytest.approx(1.0)
    assert set(WEIGHT_RUBRIC["scales"]) == set(WEIGHT_RUBRIC["weights"])
    assert WEIGHT_RUBRIC["confidence"] == {
        "min_students": MIN_STUDENTS,
        "min_attempts": MIN_ATTEMPTS,
        "shrinkage_k": SHRINKAGE_K,
    }


# ── weakness_scores ───────────────────────────────────────────────────────────

def test_weakness_components_normalised_to_unit_range():
    """Every component is a 0-1 deficit before weighting. Three signals that all mean
    "25% good" must produce the SAME 0.75 deficit — on raw inputs the 0-100 OSCE score
    would outweigh the 0-1 pass rate 100x."""
    comps = _weakness_components(
        _osce(students=4, avg_score=25.0, scored_n=9, pass_rate=0.25, graded_n=9,
              safety_fail_rate=0.25, safety_gradable_n=9),
        {"accuracy": 25.0, "n": 9, "students": 4},
    )
    assert set(comps) == {"osce_score", "osce_pass", "safety", "flashcard"}
    for name, c in comps.items():
        assert 0.0 <= c["deficit"] <= 1.0, name
    assert comps["osce_score"]["deficit"] == pytest.approx(0.75)
    assert comps["osce_pass"]["deficit"] == pytest.approx(0.75)
    assert comps["flashcard"]["deficit"] == pytest.approx(0.75)
    # Safety is the one signal where HIGHER is worse, so it is not inverted.
    assert comps["safety"]["deficit"] == pytest.approx(0.25)


def test_weakness_components_clamp_out_of_range_inputs():
    """Bad rows must not push a component outside 0-1 and blow past the renormalised
    weight budget — a 140/100 score would otherwise contribute a NEGATIVE deficit."""
    dirty = _weakness_components(
        _osce(students=4, avg_score=140.0, scored_n=9, pass_rate=1.6, graded_n=9,
              safety_fail_rate=2.5, safety_gradable_n=9),
        {"accuracy": -20.0, "n": 9, "students": 4},
    )
    for name, c in dirty.items():
        assert 0.0 <= c["deficit"] <= 1.0, name
    assert dirty["osce_score"]["deficit"] == 0.0
    assert dirty["safety"]["deficit"] == 1.0
    assert dirty["flashcard"]["deficit"] == 1.0


def test_weakness_score_ignores_absent_signals():
    """Weights renormalise over the signals actually present. Identical evidence on
    different signals must score identically — an absent signal is dropped from the
    denominator, never zero-filled (which would score the emptiest group 1.0)."""
    osce = {"osce_only": _osce(attempts=40, students=10, avg_score=90.0, scored_n=40)}
    flashcard = {"flash_only": {"accuracy": 90.0, "n": 40, "students": 10}}
    out = weakness_scores(osce, flashcard)
    assert out["osce_only"]["signals_present"] == ["osce_score"]
    assert out["flash_only"]["signals_present"] == ["flashcard"]
    assert out["osce_only"]["weakness_score"] == 0.0889
    assert out["flash_only"]["weakness_score"] == out["osce_only"]["weakness_score"]
    assert out["osce_only"]["low_confidence"] is False


def test_weakness_score_excludes_safety_term_when_ungradable():
    """safe = not missed_critical, so an attempt on a checklist with no critical step
    yields safe=True carrying no safety signal. With safety_gradable_n == 0 the term is
    EXCLUDED; zero-filling it would renormalise the OSCE weight down and score 0.2222 —
    reading as "safer than the evidence supports"."""
    ungradable = weakness_scores(
        {"g": _osce(attempts=10, students=5, avg_score=50.0, scored_n=10)}, {}
    )["g"]
    assert "safety" not in ungradable["signals_present"]
    assert ungradable["weakness_score"] == 0.3333

    gradable = weakness_scores(
        {"g": _osce(attempts=10, students=5, avg_score=50.0, scored_n=10,
                    safety_fail_rate=0.0, safety_gradable_n=8)}, {}
    )["g"]
    # A MEASURED zero safety-fail rate legitimately pulls the weakness down. That is the
    # whole difference between "no signal" and "a clean signal".
    assert "safety" in gradable["signals_present"]
    assert gradable["weakness_score"] == 0.2222


def test_weakness_score_small_n_does_not_top_ranking():
    """One catastrophic attempt must not outrank a well-sampled mediocre topic.
    Undamped, `thin` scores 0.8769 vs `deep` 0.4261 and tops the list off n=1."""
    osce = {
        "thin": _osce(attempts=1, students=1, avg_score=20.0, scored_n=1,
                      pass_rate=0.0, graded_n=1),
        "deep": _osce(attempts=30, students=8, avg_score=62.0, scored_n=30,
                      pass_rate=0.5, graded_n=30),
    }
    out = weakness_scores(osce, {})
    assert out["thin"]["weakness_score"] == 0.1462
    assert out["deep"]["weakness_score"] == 0.3653
    assert out["thin"]["low_confidence"] is True
    assert out["deep"]["low_confidence"] is False
    # The endpoint's ranking key — low-confidence groups sort below confident ones.
    ranked = sorted(
        out.items(), key=lambda kv: (kv[1]["low_confidence"], -kv[1]["weakness_score"])
    )
    assert [k for k, _ in ranked] == ["deep", "thin"]


def test_weakness_score_low_confidence_needs_both_floors():
    """Both floors, not either: 20 attempts from 2 students is one pair of students'
    habits, and 3 students with 4 attempts between them is noise."""
    osce = {
        "few_students": _osce(attempts=20, students=2, avg_score=50.0, scored_n=20),
        "few_attempts": _osce(attempts=4, students=3, avg_score=50.0, scored_n=4),
        "confident": _osce(attempts=MIN_ATTEMPTS, students=MIN_STUDENTS,
                           avg_score=50.0, scored_n=MIN_ATTEMPTS),
    }
    out = weakness_scores(osce, {})
    assert out["few_students"]["low_confidence"] is True
    assert out["few_attempts"]["low_confidence"] is True
    assert out["confident"]["low_confidence"] is False


def test_weakness_score_null_when_no_signals():
    """A group with attempts but no gradable column, and a group with nothing at all,
    both score None — never 0.0, which renders as "this topic is perfect" (D13)."""
    out = weakness_scores({"ungraded": _osce(attempts=3, students=2), "bare": _osce()}, {})
    for key in ("ungraded", "bare"):
        assert out[key]["weakness_score"] is None
        assert out[key]["signals_present"] == []
        assert out[key]["low_confidence"] is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/supervisor/test_cohort_analytics_weakness.py -v`
Expected: FAIL — collection error `ImportError: cannot import name 'MIN_ATTEMPTS' from 'tools.supervisor.cohort_analytics'` (Task 7 created the module with `osce_by_group` only; none of the rubric constants, `_weakness_components`, `flashcard_by_group` or `weakness_scores` exist yet).

- [ ] **Step 3: Write minimal implementation**

In `tools/supervisor/cohort_analytics.py`, add this import beneath Task 7's existing imports:

```python
from tools.supervisor.topic_crosswalk import flashcard_group
```

Then append to the end of the file:

```python
# ── Weakness scoring ──────────────────────────────────────────────────────────

# Confidence floor. A component below EITHER floor still contributes (shrunk), but flags
# the group low_confidence so the endpoint ranks it below confident groups. Dropping
# below-floor components outright would null all 21 groups at today's ~24 attempts and
# leave the panel permanently blank — the flag is the mechanism, not exclusion.
MIN_STUDENTS: int = 3
MIN_ATTEMPTS: int = 5
# Shrinkage toward the no-evidence prior (deficit 0): w = n / (n + K). K=5 means a single
# attempt keeps ~17% of its deficit and 30 attempts keep ~86%.
SHRINKAGE_K: int = 5

# The ONE place any weighting number lives — Plan B's at-risk model reuses `scales` and
# `confidence` verbatim and declares its own weight block beside them, so the three
# sub-dicts are kept independent: neither model has to fork the normalisation policy to
# change its own weights. Never inline these numbers at a call site.
WEIGHT_RUBRIC: dict = {
    "version": 1,
    # Sum to 1.0, then renormalised over the signals actually present.
    "weights": {
        "osce_score": 0.40,   # graded attainment — the richest signal
        "osce_pass": 0.25,    # pass/fail is coarser than the score, so it weighs less
        "safety": 0.20,       # a safety fail matters out of proportion to its frequency
        "flashcard": 0.15,    # recall, not performance — the weakest evidence of the four
    },
    # Divisor that maps each raw input onto 0-1. score_100 and flashcard accuracy arrive
    # on 0-100; pass_rate and safety_fail_rate are already rates. Without this the OSCE
    # score outweighs the rates 100x in the sum.
    "scales": {
        "osce_score": 100.0,
        "osce_pass": 1.0,
        "safety": 1.0,
        "flashcard": 100.0,
    },
    "confidence": {
        "min_students": MIN_STUDENTS,
        "min_attempts": MIN_ATTEMPTS,
        "shrinkage_k": SHRINKAGE_K,
    },
}


def _unit(value: float) -> float:
    """Clamp to 0-1. A malformed row (score_100 of 140) would otherwise contribute a
    negative deficit and spend more than its share of the renormalised weight budget."""
    return min(1.0, max(0.0, value))


def _weakness_components(osce_row: dict | None, flashcard_row: dict | None) -> dict[str, dict]:
    """Present signals only, as {name: {"deficit": 0-1, "n": int, "students": int}}.

    A signal is present only when its own metric is non-null AND its own denominator is
    positive — each metric carries its own n, and 54% of production case_progress rows
    have NULL grades, so a group can easily have attempts but no score. An absent signal
    is simply missing from this dict; it is never zero-filled, which would score the
    emptiest group as the weakest.
    """
    scales = WEIGHT_RUBRIC["scales"]
    comps: dict[str, dict] = {}
    o = osce_row or {}
    # osce["students"] is the group's distinct-student count, an upper bound on the
    # per-metric one (which the pinned osce_by_group shape does not carry). The attempt
    # floor is the tight one; this keeps the student floor honest without a shape change.
    o_students = int(o.get("students") or 0)

    if o.get("avg_score") is not None and int(o.get("scored_n") or 0) > 0:
        comps["osce_score"] = {
            "deficit": _unit(1.0 - float(o["avg_score"]) / scales["osce_score"]),
            "n": int(o["scored_n"]),
            "students": o_students,
        }
    if o.get("pass_rate") is not None and int(o.get("graded_n") or 0) > 0:
        comps["osce_pass"] = {
            "deficit": _unit(1.0 - float(o["pass_rate"]) / scales["osce_pass"]),
            "n": int(o["graded_n"]),
            "students": o_students,
        }
    # Excluded, never zeroed, when nothing was gradable: safe = not missed_critical, so an
    # attempt on a checklist with no critical step yields safe=True carrying no safety
    # signal at all. A zero here would read as a clean safety record.
    if o.get("safety_fail_rate") is not None and int(o.get("safety_gradable_n") or 0) > 0:
        comps["safety"] = {
            # The only signal where higher is worse, so it is not inverted.
            "deficit": _unit(float(o["safety_fail_rate"]) / scales["safety"]),
            "n": int(o["safety_gradable_n"]),
            "students": o_students,
        }

    f = flashcard_row or {}
    if f.get("accuracy") is not None and int(f.get("n") or 0) > 0:
        comps["flashcard"] = {
            "deficit": _unit(1.0 - float(f["accuracy"]) / scales["flashcard"]),
            "n": int(f["n"]),
            "students": int(f.get("students") or 0),
        }
    return comps


def flashcard_by_group(rows: list[dict], student_pools: dict,
                       *, pool: str | None = None) -> dict[str, dict]:
    """Flashcard accuracy per topic group, from raw flashcard_attempts rows
    ({student_id, topic_tag, correct, ts}).

    `student_pools` maps student_id -> "CLINICAL" | "OT"; `pool` filters to one of those
    code literals (None = every discipline). A group only materialises when a row lands in
    it, so `accuracy` is always a float here — absence is the no-data signal, and the
    endpoint projects a missing key to `flashcard: null`. That is the `| None` in the
    contract; it must never appear as an accuracy of 0.0.
    """
    agg: dict[str, dict] = {}
    for r in rows:
        sid = str(r.get("student_id") or "")
        student_pool = student_pools.get(sid)
        # Fail closed. A student whose role didn't resolve has no discipline and is
        # dropped from every view, `all` included — the endpoint surfaces them under
        # totals.unclassified_students rather than folding staff and typo'd roles into
        # oa_psa. Pool comes from the STUDENT, not the topic, so a future role-neutral
        # item still counts in the right place.
        if student_pool is None:
            continue
        if pool is not None and student_pool != pool:
            continue
        # Same `or "general"` fallback as db.get_topic_accuracy (db.py:233), and the
        # crosswalk routes "general" to the knowledge group — so an untagged attempt lands
        # in the same bucket here as on the student's own topic breakdown.
        group = flashcard_group(str(r.get("topic_tag") or "general"))
        bucket = agg.setdefault(group, {"correct": 0, "n": 0, "students": set()})
        bucket["n"] += 1
        bucket["students"].add(sid)
        if r.get("correct"):
            bucket["correct"] += 1
    return {
        g: {
            # 0-100 at 1dp — exactly db.get_topic_accuracy's `pct` convention
            # (db.py:239-241), so a cohort figure and a student's own breakdown are
            # directly comparable. weakness_scores divides by WEIGHT_RUBRIC["scales"].
            "accuracy": round(100 * b["correct"] / b["n"], 1),
            "n": b["n"],
            "students": len(b["students"]),
        }
        for g, b in agg.items()
    }


def weakness_scores(osce: dict, flashcard: dict) -> dict[str, dict]:
    """Rank-ready weakness per topic group: 0-1, higher = needs teaching attention.

    Replaces cohort_summary's Counter over self-reported weak_topics with real
    performance. Three rules make the ranking trustworthy at SNEC's volume:

    - Weights renormalise over the signals PRESENT, so a group is judged only on the
      evidence it has and a missing metric can't push it up or down the list.
    - Each component is shrunk toward the no-evidence prior by n / (n + SHRINKAGE_K), so
      one catastrophic attempt cannot outrank a well-sampled mediocre topic.
    - `low_confidence` is set unless at least one contributing signal clears BOTH floors;
      the endpoint sorts on (low_confidence, -weakness_score).

    Per-component denominators are not repeated here — the osce/flashcard blocks on the
    same row already carry scored_n / graded_n / safety_gradable_n / n.
    """
    weights = WEIGHT_RUBRIC["weights"]
    out: dict[str, dict] = {}
    for group in sorted(set(osce) | set(flashcard)):
        comps = _weakness_components(osce.get(group), flashcard.get(group))
        if not comps:
            # No signal at all. None, never 0.0 — a zero renders as a perfect topic (D13).
            out[group] = {"weakness_score": None, "low_confidence": True, "signals_present": []}
            continue
        total_w = sum(weights[name] for name in comps)
        score = 0.0
        for name, c in comps.items():
            shrink = c["n"] / (c["n"] + SHRINKAGE_K)
            score += (weights[name] / total_w) * c["deficit"] * shrink
        confident = any(
            c["students"] >= MIN_STUDENTS and c["n"] >= MIN_ATTEMPTS for c in comps.values()
        )
        out[group] = {
            "weakness_score": round(score, 4),
            "low_confidence": not confident,
            # Rubric order, so the UI's explanation of a score reads the same every time.
            "signals_present": [name for name in weights if name in comps],
        }
    return out
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/supervisor/test_cohort_analytics_weakness.py -v && python -m pytest tests/supervisor/ -q`
Expected: PASS — all twelve new tests, and Task 7's `osce_by_group` tests plus the existing `test_at_risk.py` / `test_cohort_summary.py` / `test_cohort_summary_counts.py` / `test_weekly_digest_topics.py` stay green (this task is additive to `cohort_analytics.py` and touches no existing module).

- [ ] **Step 5: Commit**

```bash
git add tools/supervisor/cohort_analytics.py tests/supervisor/test_cohort_analytics_weakness.py
git commit -m "feat(admin): score topic weakness from real performance, damped for small n"
```

---

## Task 9: The cohort-analytics endpoint

Every cohort figure on the console still aggregates denormalized profile snapshots — `cohort_summary()` ranks "weakest topics" with a bare `Counter` over each profile's `weak_topics` list, with no performance signal behind it. This task wires the pure aggregators from Tasks 5–8 behind `GET /api/admin/cohort-analytics`, so the ranking finally reads `case_progress` and `flashcard_attempts` rows. It is the first surface where a *flashcard* outage must degrade to "no data" while an *OSCE* outage must 500 — P1's defect class was exactly the inverse (`getJSON` swallowing a failure into `0`).

**Files:**
- Modify: `tools/api/routers/admin.py` (imports at 1–17; new constants + endpoint inserted after `admin_activity_trend`, which ends at line 275)
- Modify: `tests/api/test_admin_endpoints.py` (`STAFF_READ_ENDPOINTS`, lines 19–26)
- Modify: `frontend/tests/aurora_assert.mjs` (`staffMocks`, insert after the `activity-trend*` route at 818–822)
- Modify: `frontend/tests/_mocks.mjs` (insert after the `activity-trend*` route at 136–140)
- Test: `tests/api/test_admin_cohort_analytics.py` (**Create**)

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_admin_cohort_analytics.py
"""GET /api/admin/cohort-analytics — cohort performance from real OSCE + flashcard events.

Guards, in order of how badly each one burned us before:

1. STAFF ARE NOT STUDENTS. The population is db.get_active_profiles() (D10), which is
   student-only; get_active_leaderboard_profiles() deliberately adds trainers/admins and
   would fold a lecturer's demo run into the cohort mean.
2. A FLASHCARD OUTAGE IS NOT 0%. flashcard_attempts only started receiving rows in P2, so
   an empty/failing read is the NORMAL case and must render as "no data" — never a 0% bar.
3. AN OSCE OUTAGE IS NOT AN EMPTY COHORT. The opposite call: a failed case/profile read is
   a real 500. "The database is down" and "nobody has attempted anything" must not look
   identical on screen — that is precisely the P1 defect this phase exists to finish killing.
4. THE AGGREGATOR SEAM SURVIVES. Every aggregator returns dict[topic_group, {...}] and the
   endpoint is a thin projection over it, so Plan B's /student/{id}/detail cohort_avg can
   read the same dict. Enforced here, before Plan B exists (D4).
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from tools.api.routers import admin as admin_router
from tools.api.server import app
from tools.shared.jwt_utils import create_access_token
from tools.supervisor.cohort_analytics import osce_by_group
from tools.supervisor.discipline import student_pools

client = TestClient(app)

_NOW = datetime.now(timezone.utc)


def _ts(days_ago: int) -> str:
    return (_NOW - timedelta(days=days_ago)).isoformat()


def _staff_cookie():
    # Unique sub per test FILE: slowapi keys the 30/minute bucket on the JWT sub, so a
    # shared sub would let another file's requests rate-limit these.
    return {"eyebot_token": create_access_token("stu_cohort_analytics", "admin", "OA")}


# Two OA/PSA students and one OT student. Roles map through discipline.student_pools:
# {OA, PSA} -> CLINICAL, {OT} -> OT.
_PROFILES = [
    {"student_id": "s_oa", "role": "OA"},
    {"student_id": "s_psa", "role": "PSA"},
    {"student_id": "s_ot", "role": "OT"},
]

# A stand-in case index (the real one globs 155 case files). Same shape classify_case
# emits: {"pool", "set_key", "label", "difficulty"}.
_CASE_INDEX = {
    "case_oa_iop_01": {"pool": "CLINICAL", "set_key": "tonometry_iop",
                       "label": "Intraocular Pressure", "difficulty": "beginner"},
    "case_oa_iop_02": {"pool": "CLINICAL", "set_key": "tonometry_iop",
                       "label": "Intraocular Pressure", "difficulty": "intermediate"},
    "case_ot_oct_01": {"pool": "OT", "set_key": "oct_imaging",
                       "label": "OCT Imaging", "difficulty": "beginner"},
}

_CASE_ROWS = [
    {"student_id": "s_oa", "case_id": "case_oa_iop_01", "completed_at": _ts(2),
     "score_100": 78, "safe": True, "passed": True, "total_score": 31},
    {"student_id": "s_oa", "case_id": "case_oa_iop_02", "completed_at": _ts(3),
     "score_100": 64, "safe": False, "passed": False, "total_score": 25},
    {"student_id": "s_psa", "case_id": "case_oa_iop_01", "completed_at": _ts(4),
     "score_100": 55, "safe": True, "passed": False, "total_score": 22},
    {"student_id": "s_ot", "case_id": "case_ot_oct_01", "completed_at": _ts(5),
     "score_100": 90, "safe": True, "passed": True, "total_score": 36},
]

# anatomy_physiology is a FOUNDATIONS topic, which §4.2 routes to the knowledge_foundations
# pseudo-group for every role; iop_nct is a CLINICAL procedural topic.
_FC_ROWS = [
    {"student_id": "s_oa", "topic_tag": "anatomy_physiology", "correct": True, "ts": _ts(2)},
    {"student_id": "s_oa", "topic_tag": "anatomy_physiology", "correct": False, "ts": _ts(2)},
    {"student_id": "s_psa", "topic_tag": "anatomy_physiology", "correct": True, "ts": _ts(3)},
    {"student_id": "s_oa", "topic_tag": "iop_nct", "correct": False, "ts": _ts(3)},
    {"student_id": "s_ot", "topic_tag": "anatomy_physiology", "correct": True, "ts": _ts(4)},
]


@pytest.fixture(autouse=True)
def _no_cohort_cache():
    """The endpoint keeps a per-worker TTL cache keyed on (discipline, days). Without this
    every test after the first would assert against the FIRST test's payload — patched
    DB mocks and all. TTL=0 disables both the read and the write."""
    admin_router._cohort_cache.clear()
    with patch("tools.api.routers.admin._COHORT_TTL_SECONDS", 0.0):
        yield
    admin_router._cohort_cache.clear()


def _patches(case_rows=None, fc_rows=None, profiles=None):
    return (
        patch("tools.shared.db.get_active_profiles",
              new=AsyncMock(return_value=_PROFILES if profiles is None else profiles)),
        patch("tools.shared.db.get_all_case_scores",
              new=AsyncMock(return_value=(_CASE_ROWS if case_rows is None else case_rows, True))),
        patch("tools.shared.db.get_all_flashcard_attempts",
              new=AsyncMock(return_value=(_FC_ROWS if fc_rows is None else fc_rows, True))),
        patch("tools.api.routers.admin.get_case_index",
              new=AsyncMock(return_value=_CASE_INDEX)),
    )


def _get(query="", **kw):
    p1, p2, p3, p4 = _patches(**kw)
    with p1, p2, p3, p4:
        return client.get("/api/admin/cohort-analytics" + query, cookies=_staff_cookie())


def test_cohort_analytics_returns_topic_rows_per_pool():
    r = _get("?discipline=oa_psa&days=90")
    assert r.status_code == 200
    body = r.json()
    assert body["discipline"] == "oa_psa"
    assert body["days"] == 90
    assert body["sources"] == {"osce": "ok", "flashcard": "ok"}
    row = next(t for t in body["topics"] if t["topic_group"] == "tonometry_iop")
    assert row["label"] == "Intraocular Pressure"
    assert row["pool"] == "CLINICAL"
    assert row["osce"]["attempts"] == 3
    assert set(row["osce"]) == {
        "attempts", "students", "avg_score", "scored_n", "pass_rate", "graded_n",
        "safety_fail_rate", "safety_gradable_n", "missed_top", "by_difficulty",
    }
    assert set(row) == {
        "topic_group", "label", "pool", "osce", "flashcard",
        "weakness_score", "low_confidence", "signals_present",
    }


def test_cohort_analytics_flashcard_only_group_has_empty_osce_not_zeros():
    """knowledge_foundations has no OSCE cases at all. Its counts are 0 (true: no attempts)
    but every rate stays None — D13. A 0.0 pass rate would read as "this cohort fails
    foundations", which is the exact lie P1 was about."""
    r = _get("?discipline=oa_psa&days=90")
    row = next(t for t in r.json()["topics"] if t["topic_group"] == "knowledge_foundations")
    assert row["label"] == "Knowledge Foundations"
    assert row["osce"]["attempts"] == 0
    assert row["osce"]["avg_score"] is None
    assert row["osce"]["pass_rate"] is None
    assert row["osce"]["safety_fail_rate"] is None
    assert row["osce"]["by_difficulty"] == {"beginner": 0, "intermediate": 0, "advanced": 0}
    assert row["flashcard"]["n"] == 3          # s_oa x2 + s_psa x1; s_ot is out of pool
    assert row["flashcard"]["students"] == 2


def test_cohort_analytics_discipline_filter():
    """The two curricula are disjoint (D2), so a discipline view must not leak the other
    pool's groups — and `all` must return BOTH, each tagged with its own pool so the UI
    can render two labelled sections rather than one meaningless blended ranking."""
    oa = _get("?discipline=oa_psa&days=90").json()
    ot = _get("?discipline=ot&days=90").json()
    every = _get("?discipline=all&days=90").json()

    assert {t["topic_group"] for t in oa["topics"]} == {"tonometry_iop", "knowledge_foundations"}
    assert {t["pool"] for t in oa["topics"]} == {"CLINICAL"}
    assert oa["totals"]["students_in_pool"] == 2
    assert oa["totals"]["osce_attempts"] == 3

    assert {t["topic_group"] for t in ot["topics"]} == {"oct_imaging", "knowledge_foundations"}
    assert {t["pool"] for t in ot["topics"]} == {"OT"}
    assert ot["totals"]["students_in_pool"] == 1
    assert ot["totals"]["osce_attempts"] == 1

    assert {t["pool"] for t in every["topics"]} == {"CLINICAL", "OT"}
    assert {(t["pool"], t["topic_group"]) for t in every["topics"]} == {
        ("CLINICAL", "tonometry_iop"), ("CLINICAL", "knowledge_foundations"),
        ("OT", "oct_imaging"), ("OT", "knowledge_foundations"),
    }
    assert every["totals"]["students_in_pool"] == 3
    assert every["totals"]["osce_attempts"] == 4
    # Each pool's rows stay contiguous so the UI can slice two sections without re-sorting.
    pools_in_order = [t["pool"] for t in every["topics"]]
    assert pools_in_order == sorted(pools_in_order, key=["CLINICAL", "OT"].index)


def test_cohort_analytics_excludes_staff():
    """A trainer runs a demo station. get_active_profiles() is student-only, so that row
    must move NOT ONE NUMBER in any of the three views — including the unclassified
    diagnostics, which count *students* the role map rejected, not non-students."""
    with_trainer = _CASE_ROWS + [
        {"student_id": "t_trainer", "case_id": "case_oa_iop_01", "completed_at": _ts(1),
         "score_100": 100, "safe": True, "passed": True, "total_score": 40},
        {"student_id": "t_trainer", "case_id": "case_ot_oct_01", "completed_at": _ts(1),
         "score_100": 100, "safe": True, "passed": True, "total_score": 40},
    ]
    for discipline in ("oa_psa", "ot", "all"):
        clean = _get(f"?discipline={discipline}&days=90").json()
        dirty = _get(f"?discipline={discipline}&days=90", case_rows=with_trainer).json()
        assert clean == dirty, f"a trainer's attempts changed the {discipline} cohort"


def test_cohort_analytics_unknown_discipline_400():
    r = _get("?discipline=nurses")
    assert r.status_code == 400
    assert "discipline" in r.json()["detail"]


def test_cohort_analytics_clamps_and_echoes_the_window():
    """The resolved window is echoed so the UI can label the panel honestly."""
    assert _get("?discipline=all&days=9999").json()["days"] == 365
    assert _get("?discipline=all&days=0").json()["days"] == 1
    assert _get("?discipline=all&days=all").json()["days"] == "all"
    assert _get("?discipline=all").json()["days"] == 90          # default
    r = _get("?discipline=all&days=lots")
    assert r.status_code == 400


def test_cohort_analytics_window_excludes_older_attempts():
    old = _CASE_ROWS + [
        {"student_id": "s_oa", "case_id": "case_oa_iop_01", "completed_at": "2020-01-01T00:00:00Z",
         "score_100": 10, "safe": True, "passed": False, "total_score": 4},
    ]
    windowed = _get("?discipline=oa_psa&days=90", case_rows=old).json()
    assert windowed["totals"]["osce_attempts"] == 3
    everything = _get("?discipline=oa_psa&days=all", case_rows=old).json()
    assert everything["totals"]["osce_attempts"] == 4


def test_flashcard_unavailable_is_flagged_not_zero():
    """A flashcard read failure yields flashcard: null per group and sources.flashcard =
    'unavailable' — NEVER {accuracy: 0.0}, which renders as a 0% bar and sends trainers to
    remediate a topic nobody has studied."""
    p1, _p2, _p3, p4 = _patches()
    with p1, \
         patch("tools.shared.db.get_all_case_scores", new=AsyncMock(return_value=(_CASE_ROWS, True))), \
         patch("tools.shared.db.get_all_flashcard_attempts", new=AsyncMock(side_effect=RuntimeError("PostgREST down"))), \
         p4:
        r = client.get("/api/admin/cohort-analytics?discipline=oa_psa&days=90",
                       cookies=_staff_cookie())
    assert r.status_code == 200
    body = r.json()
    assert body["sources"] == {"osce": "ok", "flashcard": "unavailable"}
    assert body["topics"], "an OSCE-only cohort still has topic rows"
    assert all(t["flashcard"] is None for t in body["topics"])
    assert body["totals"]["students_with_flashcard_data"] == 0
    # The OSCE half is untouched by the flashcard outage.
    assert body["totals"]["osce_attempts"] == 3


def test_cohort_analytics_500s_on_db_failure():
    """The mirror image of the test above: an OSCE or profile read failure is a REAL 500.
    Returning a plausible empty cohort would render "0 attempts, no weak topics" — an
    outage that reads as good news."""
    _p1, _p2, p3, p4 = _patches()
    with patch("tools.shared.db.get_active_profiles", new=AsyncMock(return_value=_PROFILES)), \
         patch("tools.shared.db.get_all_case_scores", new=AsyncMock(side_effect=RuntimeError("boom"))), \
         p3, p4:
        r = client.get("/api/admin/cohort-analytics?discipline=all", cookies=_staff_cookie())
    assert r.status_code == 500

    with patch("tools.shared.db.get_active_profiles", new=AsyncMock(side_effect=RuntimeError("boom"))), \
         patch("tools.shared.db.get_all_case_scores", new=AsyncMock(return_value=(_CASE_ROWS, True))), \
         p3, p4:
        r = client.get("/api/admin/cohort-analytics?discipline=all", cookies=_staff_cookie())
    assert r.status_code == 500


def test_cohort_analytics_counts_unclassified_without_hiding_them():
    """Fail closed, then say so. A student whose role maps to no pool is EXCLUDED from
    every view (§4.4 — case_pool() would silently default them into CLINICAL), and an
    attempt on a case missing from the library index is excluded from its group. Both are
    counted so a lecturer can see the console dropped something."""
    profiles = _PROFILES + [{"student_id": "s_ghost", "role": ""}]
    rows = _CASE_ROWS + [
        {"student_id": "s_oa", "case_id": "case_deleted_99", "completed_at": _ts(2),
         "score_100": 40, "safe": True, "passed": False, "total_score": 16},
    ]
    body = _get("?discipline=all&days=90", case_rows=rows, profiles=profiles).json()
    assert body["totals"]["unclassified_students"] == 1
    assert body["totals"]["unclassified_attempts"] == 1
    assert body["totals"]["students_in_pool"] == 3           # s_ghost excluded
    assert body["totals"]["osce_attempts"] == 4              # the orphan case is not grouped
    assert body["totals"]["students_with_osce_data"] == 3    # s_oa had SOME attempt
    assert body["totals"]["osce_students"] == 3


def test_cohort_analytics_ttl_cache_serves_repeat_call():
    """Per-worker TTL cache over the DERIVED aggregate only — one call reads three whole
    tables and buckets them in Python, and the console polls."""
    reader = AsyncMock(return_value=(_CASE_ROWS, True))
    with patch("tools.api.routers.admin._COHORT_TTL_SECONDS", 60.0), \
         patch("tools.shared.db.get_active_profiles", new=AsyncMock(return_value=_PROFILES)), \
         patch("tools.shared.db.get_all_case_scores", new=reader), \
         patch("tools.shared.db.get_all_flashcard_attempts", new=AsyncMock(return_value=(_FC_ROWS, True))), \
         patch("tools.api.routers.admin.get_case_index", new=AsyncMock(return_value=_CASE_INDEX)):
        first = client.get("/api/admin/cohort-analytics?discipline=oa_psa&days=90",
                           cookies=_staff_cookie())
        second = client.get("/api/admin/cohort-analytics?discipline=oa_psa&days=90",
                            cookies=_staff_cookie())
    assert first.status_code == 200
    assert first.json() == second.json()
    assert reader.await_count == 1, "the second call must be served from the TTL cache"


def test_cohort_aggregator_returns_keyed_dict_reusable_by_student_detail():
    """D4 seam, enforced BEFORE Plan B exists — it is only cheap to preserve while there is
    one consumer. osce_by_group returns dict[topic_group, {...}] and the endpoint is a THIN
    projection over it, so Plan B's mastery cohort_avg can read the same dict filtered to
    one student's pool instead of growing a second, divergent aggregation path."""
    pools = student_pools(_PROFILES)
    grouped = osce_by_group(_CASE_ROWS, _CASE_INDEX, pools, pool="CLINICAL")
    assert isinstance(grouped, dict)
    assert set(grouped) == {"tonometry_iop"}
    assert grouped["tonometry_iop"]["avg_score"] is not None

    body = _get("?discipline=oa_psa&days=90").json()
    row = next(t for t in body["topics"] if t["topic_group"] == "tonometry_iop")
    # Verbatim, key for key: the endpoint must not recompute, round or re-derive anything.
    assert row["osce"] == grouped["tonometry_iop"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/api/test_admin_cohort_analytics.py -v`
Expected: FAIL — 12 ERRORs, one per test, all raised during `_no_cohort_cache` fixture setup:
`AttributeError: module 'tools.api.routers.admin' has no attribute '_cohort_cache'`.
(After the two module-level constants exist but before the route does, the same run reports `assert 404 == 200` on every test — FastAPI has no `/api/admin/cohort-analytics` route yet.)

- [ ] **Step 3: Write minimal implementation**

In `tools/api/routers/admin.py`, extend the import block (lines 1–17) — add `time` to the stdlib imports and the five new module imports. `timedelta` is already imported on line 6:

```python
"""Admin endpoints."""
import asyncio
import csv
import io
import re
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel

from tools.api.shared import limiter, _client_ip
from tools.cases.topic_sets import SET_LABELS
from tools.profile.get_profile import get_profile
from tools.shared import db
from tools.shared.auth import generate_password, hash_password
from tools.shared.clock import app_today
from tools.shared.gemini_client import MOCK_MODE, MODEL, ask
from tools.shared.identity import seed_student_name
from tools.shared.jwt_utils import CurrentUser, require_admin, require_staff
from tools.supervisor.case_index import get_case_index
from tools.supervisor.cohort_analytics import flashcard_by_group, osce_by_group, weakness_scores
from tools.supervisor.discipline import DISCIPLINES, discipline_to_pool, student_pools
from tools.supervisor.topic_crosswalk import KNOWLEDGE_GROUP
```

Then insert the following immediately after `admin_activity_trend` (which ends at line 275) and before `@router.post("/api/admin/promote")`:

```python
# ── Cohort analytics (P2) ──────────────────────────────────────────────────

# Display labels per (pool, set_key). The case index carries a label per CASE, but the
# endpoint also has to label a group with zero attempts in the window and the
# flashcard-only knowledge_foundations pseudo-group, neither of which appears there.
_SET_LABEL: dict[str, dict[str, str]] = {p: dict(rows) for p, rows in SET_LABELS.items()}

# Per-worker TTL cache over the DERIVED aggregate only. This is the read-cache carve-out
# of invariant #2, not a violation of it: no counters, no cross-request semantics, every
# entry is a pure function of (discipline, window) over immutable past events, and a cold
# worker just recomputes. It earns its keep because one call reads three whole tables and
# buckets them in Python while the console polls. Bounded by construction — `discipline`
# is validated to one of three values and `days` is clamped to [1, 365] or "all" before
# the key is built. Tests patch _COHORT_TTL_SECONDS to 0, which disables read AND write.
_COHORT_TTL_SECONDS = 45.0
_cohort_cache: dict[tuple[str, str], tuple[float, dict]] = {}

# Used when weakness_scores has no entry for a group. Honest rather than defensive: "no
# confident score" is a real state, and it must never surface as a number.
_NO_WEAKNESS = {"weakness_score": None, "low_confidence": True, "signals_present": []}


def _group_label(pool: str, group: str) -> str:
    if group == KNOWLEDGE_GROUP:
        return "Knowledge Foundations"
    return _SET_LABEL.get(pool, {}).get(group, group.replace("_", " ").title())


def _empty_osce() -> dict:
    """The OSCE block for a group with flashcard data but zero OSCE attempts in the window.

    Counts are 0 — that is the literal truth. Every rate/mean stays None (D13): a
    denominator of 0 has no average, and 0.0 would render as "this cohort scores zero
    here". Rebuilt per call so no two rows can alias one mutable dict."""
    return {"attempts": 0, "students": 0, "avg_score": None, "scored_n": 0,
            "pass_rate": None, "graded_n": 0, "safety_fail_rate": None,
            "safety_gradable_n": 0, "missed_top": [],
            "by_difficulty": {"beginner": 0, "intermediate": 0, "advanced": 0}}


@router.get("/api/admin/cohort-analytics")
# Plain limit(), NOT shared_limit: slowapi's default key_style="url" buckets on the ASGI
# *path*, and query strings are not part of it — ?discipline= / ?days= cannot split this
# endpoint's bucket, so there is nothing to pin. shared_limit(scope=...) is only needed
# where a {path_param} would mint a fresh bucket per value (see admin_unapprove_student).
@limiter.limit("30/minute")
async def admin_cohort_analytics(request: Request, discipline: str = "all", days: str = "90",
                                 current_user: CurrentUser = Depends(require_staff)):
    """Cohort performance per topic group, aggregated from real OSCE + flashcard events.

    Replaces the profile-snapshot proxies: every figure traces to a case_progress or
    flashcard_attempts row. `discipline` filters on the STUDENT's role pool, never the
    case's, so a role-neutral case counts in whichever pool its student belongs to.
    `discipline=all` returns BOTH pools' groups, each tagged with its own `pool` — the two
    curricula are disjoint, so one blended ranking would be meaningless (D2)."""
    try:
        pool = discipline_to_pool(discipline)
    except ValueError:
        raise HTTPException(status_code=400,
                            detail="discipline must be one of " + ", ".join(DISCIPLINES))

    # `days` is a str, not an int, so the explicit "all" sentinel is a 400-able value
    # rather than FastAPI's 422 on a failed int coercion.
    raw_days = days.strip().lower()
    if raw_days == "all":
        window_days: int | None = None
        days_echo: int | str = "all"
    else:
        try:
            window_days = max(1, min(int(raw_days), 365))
        except ValueError:
            raise HTTPException(status_code=400, detail="days must be an integer or 'all'")
        days_echo = window_days

    cache_key = (discipline, str(days_echo))
    cached = _cohort_cache.get(cache_key)
    if _COHORT_TTL_SECONDS > 0 and cached and (time.monotonic() - cached[0]) < _COHORT_TTL_SECONDS:
        return cached[1]

    try:
        # D10: student-only. get_active_leaderboard_profiles() deliberately adds
        # trainers/admins — a lecturer's demo run inside a cohort mean is a lie.
        profiles = await db.get_active_profiles()
        # `complete` is unpacked and deliberately not surfaced: the response shape has no
        # completeness field, and _fetch_all caps at 50 x 1000 rows — ~2000x the current
        # table. The read that truncates TODAY is token-summary's (capped at 500), which
        # §5.6 fixes separately.
        case_rows, _case_complete = await db.get_all_case_scores()
    except Exception:
        # A failed OSCE/profile read is a REAL failure. Never fall through to a plausible
        # empty cohort: "the DB is down" and "nobody has attempted anything" must not
        # render identically. This is the defect class P1 exists to kill.
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")

    # Flashcards degrade instead of failing. flashcard_attempts only started receiving rows
    # in P2, so a thin or unavailable table is the NORMAL case — it renders as "no data",
    # never as {accuracy: 0.0}, which would send trainers to remediate an unstudied topic.
    flashcard_source = "ok"
    try:
        fc_rows, _fc_complete = await db.get_all_flashcard_attempts()
    except Exception:
        fc_rows, flashcard_source = [], "unavailable"

    # After the DB reads on purpose: the index build globs 155 case files, and an outage
    # should 500 without paying for it.
    case_index = await get_case_index()

    since = ""
    if window_days is not None:
        # SGT day boundary (tools.shared.clock) — the product defines a day in SGT and
        # completed_at is written that way; a UTC edge shifts the window by 8 hours.
        since = (app_today() - timedelta(days=window_days - 1)).isoformat()

    def _in_window(row: dict, ts_key: str) -> bool:
        # ISO-8601 dates order correctly as plain strings; [:10] is the date part.
        return not since or str(row.get(ts_key) or "")[:10] >= since

    case_rows = [r for r in case_rows if _in_window(r, "completed_at")]
    fc_rows = [r for r in fc_rows if _in_window(r, "ts")]

    pools_by_student = student_pools(profiles)

    # Data-health diagnostics, deliberately NOT scoped to the current filter — they answer
    # "what could this console not place at all?", which is the same question in every
    # view. A student whose role maps to no pool is excluded rather than defaulted into
    # CLINICAL (§4.4 — case_pool() returns CLINICAL for "", None and typos), and an attempt
    # on a case missing from the library index is excluded from its group. Staff appear in
    # neither count: they are not in the population, so they are not "unclassified".
    unclassified_students = sum(
        1 for p in profiles if str(p.get("student_id", "")) not in pools_by_student
    )
    unclassified_attempts = sum(
        1 for r in case_rows
        if str(r.get("student_id", "")) in pools_by_student
        and str(r.get("case_id", "")) not in case_index
    )

    view_pools = [pool] if pool else ["CLINICAL", "OT"]
    in_view = {sid for sid, p in pools_by_student.items() if p in view_pools}

    topics: list[dict] = []
    osce_attempts = 0
    for p in view_pools:
        osce = osce_by_group(case_rows, case_index, pools_by_student, pool=p)
        flashcard = (flashcard_by_group(fc_rows, pools_by_student, pool=p)
                     if flashcard_source == "ok" else {})
        weak = weakness_scores(osce, flashcard)
        section: list[dict] = []
        for group in set(osce) | set(flashcard):
            w = weak.get(group) or _NO_WEAKNESS
            section.append({
                "topic_group": group,
                "label": _group_label(p, group),
                # Code-literal pool ("CLINICAL"/"OT"), the same namespace student_pools()
                # and the case index use. The UI maps it to a section heading; a third
                # set of literals here would be one translation too many.
                "pool": p,
                "osce": osce.get(group) or _empty_osce(),
                "flashcard": flashcard.get(group) if flashcard_source == "ok" else None,
                "weakness_score": w["weakness_score"],
                "low_confidence": w["low_confidence"],
                "signals_present": list(w["signals_present"]),
            })
        # Confident groups first, then weakest first, unscored last. Small-n groups must
        # never top the ranking (§5.3) — a single bad attempt is not a cohort weakness.
        section.sort(key=lambda r: (r["low_confidence"], r["weakness_score"] is None,
                                    -(r["weakness_score"] or 0.0), r["label"]))
        topics.extend(section)
        # Summed from the aggregator (groups are disjoint) so the header total can never
        # disagree with the rows beneath it.
        osce_attempts += sum(g["attempts"] for g in osce.values())

    payload = {
        "discipline": discipline,
        "days": days_echo,
        "topics": topics,
        "totals": {
            "students_in_pool": len(in_view),
            # ..._with_osce_data counts students with ANY attempt in the window;
            # osce_students counts those actually represented in the rows above. They
            # differ exactly when a case_id is missing from the library index.
            "students_with_osce_data": len({
                str(r.get("student_id", "")) for r in case_rows
                if str(r.get("student_id", "")) in in_view}),
            "students_with_flashcard_data": len({
                str(r.get("student_id", "")) for r in fc_rows
                if str(r.get("student_id", "")) in in_view}),
            "osce_attempts": osce_attempts,
            "osce_students": len({
                str(r.get("student_id", "")) for r in case_rows
                if str(r.get("student_id", "")) in in_view
                and str(r.get("case_id", "")) in case_index}),
            "unclassified_students": unclassified_students,
            "unclassified_attempts": unclassified_attempts,
        },
        # osce is always "ok" here — a failed OSCE read raised a 500 above rather than
        # degrading, which is the whole point of the split.
        "sources": {"osce": "ok", "flashcard": flashcard_source},
    }
    if _COHORT_TTL_SECONDS > 0:
        _cohort_cache[cache_key] = (time.monotonic(), payload)
    return payload
```

In `tests/api/test_admin_endpoints.py`, append the route to `STAFF_READ_ENDPOINTS` (lines 19–26) so it inherits the four guard-tier tests:

```python
# Read-only analytics endpoints — require_staff (admin + trainer)
STAFF_READ_ENDPOINTS = [
    ("GET", "/api/admin/approved"),
    ("GET", "/api/admin/students"),
    ("GET", "/api/admin/staff"),
    ("GET", "/api/admin/activity"),
    ("GET", "/api/admin/student/stu_x/detail"),
    ("GET", "/api/admin/token-summary"),
    ("GET", "/api/admin/cohort-analytics"),
]
```

In `frontend/tests/_mocks.mjs`, insert after the `activity-trend*` route (ends line 140), before the `token-summary` route on line 141. The trailing `*` is mandatory — the route takes `?discipline=&days=`, and a pattern without it never matches:

> There must be exactly **one** `**/api/admin/cohort-analytics*` route per file. Tasks 10 and 12 **replace** this one; they must not add a second.

```javascript
  await ctx.route("**/api/admin/cohort-analytics*", (r) => r.fulfill(J({
    discipline: "all", days: 90,
    topics: [
      { topic_group: "tonometry_iop", label: "Intraocular Pressure", pool: "CLINICAL",
        osce: { attempts: 9, students: 6, avg_score: 61.4, scored_n: 9, pass_rate: 0.44, graded_n: 9,
                safety_fail_rate: 0.22, safety_gradable_n: 9,
                missed_top: [{ step: "Disinfect the tonometer prism between patients", count: 4, students: 3 }],
                by_difficulty: { beginner: 5, intermediate: 3, advanced: 1 } },
        flashcard: { accuracy: 58.0, n: 42, students: 6 },
        weakness_score: 0.71, low_confidence: false, signals_present: ["osce_score", "osce_pass", "safety", "flashcard"] },
      // low_confidence pair: no safety-gradable attempt -> safety_fail_rate null (never 0),
      // no flashcard rows -> flashcard null (never {accuracy: 0}), so no weakness score.
      { topic_group: "oct_imaging", label: "OCT Imaging", pool: "OT",
        osce: { attempts: 4, students: 2, avg_score: 78.0, scored_n: 4, pass_rate: 0.75, graded_n: 4,
                safety_fail_rate: null, safety_gradable_n: 0, missed_top: [],
                by_difficulty: { beginner: 3, intermediate: 1, advanced: 0 } },
        flashcard: null,
        weakness_score: null, low_confidence: true, signals_present: ["osce_score"] },
    ],
    totals: { students_in_pool: 10, students_with_osce_data: 7, students_with_flashcard_data: 6,
              osce_attempts: 13, osce_students: 7, unclassified_students: 0, unclassified_attempts: 0 },
    sources: { osce: "ok", flashcard: "ok" },
  })));
```

In `frontend/tests/aurora_assert.mjs`, insert the same fixture into `staffMocks` after the `activity-trend*` route (ends line 822), before the closing `};` on line 823 — same payload, `c.route` and `JSON_OK` instead of `ctx.route` and `J`:

> There must be exactly **one** `**/api/admin/cohort-analytics*` route per file. Tasks 10 and 12 **replace** this one; they must not add a second.

```javascript
  await c.route("**/api/admin/cohort-analytics*", (r) => r.fulfill(JSON_OK({
    discipline: "all", days: 90,
    topics: [
      { topic_group: "tonometry_iop", label: "Intraocular Pressure", pool: "CLINICAL",
        osce: { attempts: 9, students: 6, avg_score: 61.4, scored_n: 9, pass_rate: 0.44, graded_n: 9,
                safety_fail_rate: 0.22, safety_gradable_n: 9,
                missed_top: [{ step: "Disinfect the tonometer prism between patients", count: 4, students: 3 }],
                by_difficulty: { beginner: 5, intermediate: 3, advanced: 1 } },
        flashcard: { accuracy: 58.0, n: 42, students: 6 },
        weakness_score: 0.71, low_confidence: false, signals_present: ["osce_score", "osce_pass", "safety", "flashcard"] },
      { topic_group: "oct_imaging", label: "OCT Imaging", pool: "OT",
        osce: { attempts: 4, students: 2, avg_score: 78.0, scored_n: 4, pass_rate: 0.75, graded_n: 4,
                safety_fail_rate: null, safety_gradable_n: 0, missed_top: [],
                by_difficulty: { beginner: 3, intermediate: 1, advanced: 0 } },
        flashcard: null,
        weakness_score: null, low_confidence: true, signals_present: ["osce_score"] },
    ],
    totals: { students_in_pool: 10, students_with_osce_data: 7, students_with_flashcard_data: 6,
              osce_attempts: 13, osce_students: 7, unclassified_students: 0, unclassified_attempts: 0 },
    sources: { osce: "ok", flashcard: "ok" },
  })));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/api/test_admin_cohort_analytics.py tests/api/test_admin_endpoints.py tests/api/test_admin_activity_trend.py tests/supervisor -q`
Expected: PASS — all 12 new tests, plus `test_admin_endpoints.py`'s four guard-tier parametrisations now covering `/api/admin/cohort-analytics` (unauthenticated → 401/403, student → 403, trainer → not 401/403), and the Task 5–8 aggregator suites still green.

- [ ] **Step 5: Commit**

```bash
git add tools/api/routers/admin.py tests/api/test_admin_cohort_analytics.py tests/api/test_admin_endpoints.py frontend/tests/aurora_assert.mjs frontend/tests/_mocks.mjs
git commit -m "feat(admin): add cohort-analytics endpoint over real OSCE and flashcard events"
```

---

## Task 10: Cohort-analytics hook and the panel-local discipline switcher

The `/api/admin/cohort-analytics` endpoint has no consumer: `useAdmin.ts` ends at `useCohortInsight` (`frontend/src/hooks/useAdmin.ts:171-189`) with no cohort-analytics hook, and `AdminCohort.tsx` still derives every topic figure from the 80-item-capped activity feed. This task adds the typed data layer plus the panel shell that owns the discipline dimension — **panel-local** per D11, because `cohort-analytics` is the only endpoint in the console that accepts `discipline`; a console-top control would re-scope one panel of eleven and leave the KPI tiles and token usage frozen, resurrecting the exact false promise P1 deleted from `Admin.tsx`.

**Files:**
- Modify: `frontend/src/hooks/useAdmin.ts` (append after `useTokenSummary`, ~line 155)
- Create: `frontend/src/aurora/screens/AdminTopicAnalytics.tsx`
- Modify: `frontend/src/aurora/screens/AdminCohort.tsx` (import block :7-14, render tree :95-97)
- Test: `frontend/tests/aurora_assert.mjs` (fixture in `staffMocks` :806-823; assertions after :851)
- Test: `frontend/tests/_mocks.mjs` (fixture in `mockApis` :125, :141)

- [ ] **Step 1: Write the failing test**

Three edits, all in the harness fixtures/assertions. `tsc` does **not** type-check `.mjs`, so a fixture that drifts from the endpoint shape passes typecheck+build and only fails at render time — both mock files must be updated together.

**(a)** In `frontend/tests/_mocks.mjs`, fix the pre-existing cohort drift. Replace line 125:

```js
  await ctx.route("**/api/supervisor/cohort", (r) => r.fulfill(J({ total_students: 24, active_this_week: 17, at_risk_count: 3, weakest_topics: [{ topic: "Glaucoma staging", count: 14 }, { topic: "OCT interpretation", count: 9 }] })));
```

with (adds `total`, which `useAdmin.ts:19` declares and `AdminCohort.tsx:26` reads — the fixture only carried `total_students`, so the "Total students" tile rendered 0 against this mock while `aurora_assert.mjs` sent both):

```js
  await ctx.route("**/api/supervisor/cohort", (r) => r.fulfill(J({ total_students: 24, total: 24, active_this_week: 17, at_risk_count: 3, weakest_topics: [{ topic: "Glaucoma staging", count: 14 }, { topic: "OCT interpretation", count: 9 }] })));
```

Then, in the same file, **replace** the `**/api/admin/cohort-analytics*` route Task 9 registered (do not add a second — the later registration silently wins and the numbers stop meaning anything):

```js
  // P2 cohort aggregation. Trailing `*` — the hook always sends ?discipline=&days=, and a
  // route without it never matches a query string. This is the static `all` slice of the
  // SAME fixture aurora_assert.mjs builds from CA_CLINICAL/CA_OT/CA_TOTALS below: same
  // rows, same totals, so the two harnesses cannot disagree about the cohort. `accuracy`
  // is 0-100 (db.get_topic_accuracy's `pct` convention), never a 0-1 rate.
  await ctx.route("**/api/admin/cohort-analytics*", (r) => r.fulfill(J({
    discipline: "all", days: 90,
    topics: [
      { topic_group: "tonometry_iop", label: "Intraocular Pressure", pool: "CLINICAL",
        osce: { attempts: 14, students: 9, avg_score: 62.4, scored_n: 12, pass_rate: 0.58, graded_n: 12,
                safety_fail_rate: 0.25, safety_gradable_n: 12,
                missed_top: [{ step: "Checked intraocular pressure before dilation", count: 5, students: 4 }],
                by_difficulty: { beginner: 6, intermediate: 5, advanced: 3 } },
        flashcard: { accuracy: 71.0, n: 180, students: 9 },
        weakness_score: 0.68, low_confidence: false, signals_present: ["osce_score", "osce_pass", "safety", "flashcard"] },
      { topic_group: "triage_referral", label: "Triage & Referral", pool: "CLINICAL",
        osce: { attempts: 4, students: 3, avg_score: 58.0, scored_n: 4, pass_rate: 0.5, graded_n: 4,
                safety_fail_rate: null, safety_gradable_n: 0, missed_top: [],
                by_difficulty: { beginner: 2, intermediate: 2, advanced: 0 } },
        flashcard: { accuracy: 55.0, n: 18, students: 3 },
        weakness_score: 0.62, low_confidence: true, signals_present: ["osce_score", "flashcard"] },
      { topic_group: "oct_imaging", label: "OCT Imaging", pool: "OT",
        osce: { attempts: 9, students: 6, avg_score: 74.1, scored_n: 8, pass_rate: 0.75, graded_n: 8,
                safety_fail_rate: 0.0, safety_gradable_n: 8,
                missed_top: [{ step: "Confirmed patient identity and operative eye", count: 2, students: 2 }],
                by_difficulty: { beginner: 4, intermediate: 3, advanced: 2 } },
        flashcard: { accuracy: 72.0, n: 25, students: 3 },
        weakness_score: 0.34, low_confidence: false, signals_present: ["osce_score", "osce_pass", "safety", "flashcard"] },
      { topic_group: "visual_fields", label: "Visual Field Testing", pool: "OT",
        osce: { attempts: 3, students: 2, avg_score: 49.0, scored_n: 3, pass_rate: 0.33, graded_n: 3,
                safety_fail_rate: null, safety_gradable_n: 0, missed_top: [],
                by_difficulty: { beginner: 1, intermediate: 2, advanced: 0 } },
        flashcard: null,
        weakness_score: 0.71, low_confidence: true, signals_present: ["osce_score"] },
    ],
    totals: { students_in_pool: 22, students_with_osce_data: 15, students_with_flashcard_data: 9,
              osce_attempts: 30, osce_students: 15, unclassified_students: 2, unclassified_attempts: 1 },
    sources: { osce: "ok", flashcard: "ok" },
  })));
```

**(b)** In `frontend/tests/aurora_assert.mjs`, insert these two fixture constants immediately above `const staffMocks = async (c) => {` (line 806):

```js
// P2 cohort-analytics fixture. The two pools are disjoint curricula (D2), so slicing by
// discipline must change the ROW SET, not just a label — that is what proves the switcher
// re-queries rather than filtering a cached payload client-side. set_keys/labels are the
// real ones from tools/cases/topic_sets.py.
const CA_CLINICAL = [
  { topic_group: "tonometry_iop", label: "Intraocular Pressure", pool: "CLINICAL",
    osce: { attempts: 14, students: 9, avg_score: 62.4, scored_n: 12, pass_rate: 0.58, graded_n: 12,
            safety_fail_rate: 0.25, safety_gradable_n: 12,
            missed_top: [{ step: "Checked intraocular pressure before dilation", count: 5, students: 4 }],
            by_difficulty: { beginner: 6, intermediate: 5, advanced: 3 } },
    flashcard: { accuracy: 71.0, n: 180, students: 9 },
    weakness_score: 0.68, low_confidence: false, signals_present: ["osce_score", "osce_pass", "safety", "flashcard"] },
  { topic_group: "triage_referral", label: "Triage & Referral", pool: "CLINICAL",
    osce: { attempts: 4, students: 3, avg_score: 58.0, scored_n: 4, pass_rate: 0.5, graded_n: 4,
            safety_fail_rate: null, safety_gradable_n: 0, missed_top: [],
            by_difficulty: { beginner: 2, intermediate: 2, advanced: 0 } },
    flashcard: { accuracy: 55.0, n: 18, students: 3 },
    weakness_score: 0.62, low_confidence: true, signals_present: ["osce_score", "flashcard"] },
];
const CA_OT = [
  { topic_group: "oct_imaging", label: "OCT Imaging", pool: "OT",
    osce: { attempts: 9, students: 6, avg_score: 74.1, scored_n: 8, pass_rate: 0.75, graded_n: 8,
            safety_fail_rate: 0.0, safety_gradable_n: 8,
            missed_top: [{ step: "Confirmed patient identity and operative eye", count: 2, students: 2 }],
            by_difficulty: { beginner: 4, intermediate: 3, advanced: 2 } },
    flashcard: { accuracy: 72.0, n: 25, students: 3 },
    weakness_score: 0.34, low_confidence: false, signals_present: ["osce_score", "osce_pass", "safety", "flashcard"] },
  { topic_group: "visual_fields", label: "Visual Field Testing", pool: "OT",
    osce: { attempts: 3, students: 2, avg_score: 49.0, scored_n: 3, pass_rate: 0.33, graded_n: 3,
            safety_fail_rate: null, safety_gradable_n: 0, missed_top: [],
            by_difficulty: { beginner: 1, intermediate: 2, advanced: 0 } },
    flashcard: null,
    weakness_score: 0.71, low_confidence: true, signals_present: ["osce_score"] },
];
const CA_TOTALS = {
  all:    { students_in_pool: 22, students_with_osce_data: 15, students_with_flashcard_data: 9, osce_students: 15, unclassified_students: 2, unclassified_attempts: 1 },
  oa_psa: { students_in_pool: 14, students_with_osce_data: 9,  students_with_flashcard_data: 9, osce_students: 9,  unclassified_students: 2, unclassified_attempts: 1 },
  ot:     { students_in_pool: 8,  students_with_osce_data: 6,  students_with_flashcard_data: 3, osce_students: 6,  unclassified_students: 2, unclassified_attempts: 1 },
};
```

Then, inside `staffMocks`, **replace** the `**/api/admin/cohort-analytics*` route Task 9 registered (do not add a second — the later registration silently wins and the numbers stop meaning anything):

```js
  await c.route("**/api/admin/cohort-analytics*", (r) => {
    const url = new URL(r.request().url());
    const discipline = url.searchParams.get("discipline") ?? "all";
    const topics = discipline === "ot" ? CA_OT : discipline === "oa_psa" ? CA_CLINICAL : [...CA_CLINICAL, ...CA_OT];
    const totals = CA_TOTALS[discipline] ?? CA_TOTALS.all;
    return r.fulfill(JSON_OK({
      discipline, days: Number(url.searchParams.get("days") ?? 90), topics,
      totals: { ...totals, osce_attempts: topics.reduce((s, t) => s + t.osce.attempts, 0) },
      sources: { osce: "ok", flashcard: "ok" },
    }));
  });
```

**(c)** In `frontend/tests/aurora_assert.mjs`, insert this assertion block immediately after line 851 (`console.log("PASS: Admin — guard admits a trainer, …")`), while the trainer page `tp` is still on the default Cohort tab:

```js
// P2 §5.4 / D11: the discipline switcher is PANEL-LOCAL, and the caption is the only thing
// telling a trainer that the KPI tiles and token usage ABOVE it are not filtered. Without
// it the control silently re-promises console-wide scoping — the false promise P1 deleted
// from the Admin shell. Pinned verbatim so a well-meaning copy edit can't quietly drop the
// scope clause.
const discCaption = tp.locator('[data-testid="cohort-discipline-caption"]');
if ((await discCaption.count()) !== 1) { console.error("FAIL: cohort-analytics panel is missing the discipline-scope caption (D11)"); process.exit(1); }
const discText = (await discCaption.innerText()).trim();
const DISC_CAPTION = "Discipline: All · OA & PSA · OT — filters the topic panels below; cohort totals and token usage cover all disciplines.";
if (discText !== DISC_CAPTION) { console.error(`FAIL: discipline caption drifted from the spec\n  got:  '${discText}'\n  want: '${DISC_CAPTION}'`); process.exit(1); }
// The panel must be reading the endpoint, not the activity feed: 2 CLINICAL + 2 OT groups.
await tp.waitForSelector('[data-testid="cohort-topics-summary"]', { timeout: 15000 });
const caAll = (await tp.locator('[data-testid="cohort-topics-summary"]').innerText()).trim();
if (!caAll.startsWith("4 topic groups")) { console.error(`FAIL: cohort-analytics summary did not render the payload's 4 topic groups (got '${caAll}')`); process.exit(1); }
// Switching discipline must issue a NEW server request carrying the new param. A purely
// client-side filter would leave OT trainers looking at OA/PSA numbers, and the curricula
// are disjoint — there is no correct client-side subset. Arm the wait BEFORE the click.
const caOtReq = tp.waitForRequest(
  (r) => r.url().includes("/api/admin/cohort-analytics") && new URL(r.url()).searchParams.get("discipline") === "ot",
  { timeout: 8000 },
).catch(() => null);
await tp.locator('[data-testid="cohort-discipline"] button[data-discipline="ot"]').click();
if (!(await caOtReq)) { console.error("FAIL: switching the discipline switcher issued no /api/admin/cohort-analytics request with discipline=ot"); process.exit(1); }
await tp.waitForFunction(() => {
  const el = document.querySelector('[data-testid="cohort-topics-summary"]');
  return !!el && el.textContent.trim().startsWith("2 topic groups");
}, null, { timeout: 8000 });
console.log("PASS: Admin — panel-local discipline switcher states its scope and re-queries the server with the new discipline");
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
bash scripts/start-harness.sh stop
npm --prefix frontend run build:safe
SKIP_BUILD=1 bash scripts/start-harness.sh aurora
```
Expected: FAIL — `FAIL: cohort-analytics panel is missing the discipline-scope caption (D11)` and the harness exits 1. (`AdminCohort` renders no such panel yet, so `[data-testid="cohort-discipline-caption"]` has count 0.)

- [ ] **Step 3: Write minimal implementation**

**(a)** In `frontend/src/hooks/useAdmin.ts`, append after `useTokenSummary` (line 155) and before the `AuditEvent` block:

```ts
export type Discipline = "oa_psa" | "ot" | "all";
export interface TopicGroupRow {
  topic_group: string; label: string; pool: string;
  osce: { attempts: number; students: number; avg_score: number | null; scored_n: number;
          pass_rate: number | null; graded_n: number; safety_fail_rate: number | null;
          safety_gradable_n: number; missed_top: { step: string; count: number; students: number }[];
          by_difficulty: { beginner: number; intermediate: number; advanced: number } };
  // null — not 0.0 — when the flashcard table has nothing for this group. flashcard_attempts
  // only started filling on the P2 task-0.1 ship, so "thin or empty" is the normal case for
  // months; a 0% bar would read as "the cohort answers everything wrong".
  flashcard: { accuracy: number | null; n: number; students: number } | null;
  weakness_score: number | null; low_confidence: boolean; signals_present: string[];
}
export interface CohortAnalytics {
  discipline: Discipline; days: number | "all"; topics: TopicGroupRow[];
  totals: { students_in_pool: number; students_with_osce_data: number;
            students_with_flashcard_data: number; osce_attempts: number;
            osce_students: number; unclassified_students: number; unclassified_attempts: number };
  sources: { osce: "ok" | "unavailable"; flashcard: "ok" | "unavailable" };
}
/** Real per-topic-group cohort aggregation over case_progress + flashcard_attempts,
    sliced by discipline. Every rate/mean is `number | null` — null at a zero denominator,
    never 0 (D13). `discipline`/`days` are TRAILING key elements so the query stays under
    the ["admin"] prefix that the board's Refresh invalidates. */
export function useCohortAnalytics(discipline: Discipline, days: number) {
  return useQuery<CohortAnalytics>({
    queryKey: ["admin", "cohort-analytics", discipline, days],
    queryFn: () =>
      getJSON<CohortAnalytics>(`/api/admin/cohort-analytics?discipline=${discipline}&days=${days}`),
    ...LIVE,
  });
}
```

**(b)** Create `frontend/src/aurora/screens/AdminTopicAnalytics.tsx`:

```tsx
"use client";
/* Admin — cohort topic performance (P2 §5.4). Per-topic-group figures aggregated from real
   OSCE + flashcard events, sliced by discipline.

   The switcher is PANEL-LOCAL by decision D11: /api/admin/cohort-analytics is the only
   endpoint in the console that accepts `discipline`, so a console-top control would re-scope
   this one panel and leave the KPI tiles, benchmarks and token usage untouched — the exact
   false promise P1 deleted from the Admin shell. The caption states that scope out loud
   instead of leaving a trainer to infer it from numbers that don't move. */
import { useState } from "react";
import { useCohortAnalytics, type Discipline } from "@/hooks/useAdmin";
import { PanelSkeleton, PanelError } from "@/aurora/components/admin/PanelState";

const DISCIPLINES: { key: Discipline; label: string }[] = [
  { key: "all", label: "All" },
  { key: "oa_psa", label: "OA & PSA" },
  { key: "ot", label: "OT" },
];

/* Rolling SNEC intakes make an all-time mean a slow-moving constant that barely responds to
   this term's teaching, so the panel asks for a term-sized window (the backend default). */
const DAYS = 90;

export function AdminTopicAnalytics() {
  const [discipline, setDiscipline] = useState<Discipline>("all");
  const q = useCohortAnalytics(discipline, DAYS);

  const topics = q.data?.topics ?? [];
  const totals = q.data?.totals;
  const flashcardGroups = topics.filter((t) => t.flashcard !== null && t.flashcard.n > 0).length;

  // Same guard as the cohort KPI tiles: a figure must never render 0 while loading or
  // failed — a 0 there is indistinguishable from a real measurement of an empty cohort.
  const kpi = (v: string | number) => (q.isLoading ? "…" : q.isError ? "—" : v);

  return (
    <section className="aurora-panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <p className="aurora-panel-head" style={{ margin: 0 }}>Topic performance</p>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="aurora-unavail">{kpi(totals?.students_in_pool ?? 0)} students in scope</span>
          <div className="console-segment" role="group" aria-label="Discipline filter" data-testid="cohort-discipline">
            {DISCIPLINES.map((d) => (
              <button
                key={d.key}
                type="button"
                data-discipline={d.key}
                data-active={discipline === d.key}
                aria-pressed={discipline === d.key}
                onClick={() => setDiscipline(d.key)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="aurora-unavail" data-testid="cohort-discipline-caption" style={{ marginTop: 8 }}>Discipline: All · OA &amp; PSA · OT — filters the topic panels below; cohort totals and token usage cover all disciplines.</p>

      {q.isLoading ? (
        <PanelSkeleton />
      ) : q.isError ? (
        <PanelError onRetry={() => q.refetch()} label="Couldn’t load cohort topic performance." />
      ) : topics.length === 0 ? (
        <p className="aurora-unavail">No station attempts recorded for this discipline in the last {DAYS} days.</p>
      ) : (
        <>
          {/* Kept on ONE source line: JSX strips the newline+indent between an expression and
              the text that follows it, so a wrapped line would render "4topic groups". */}
          <p className="aurora-unavail" data-testid="cohort-topics-summary">{topics.length} topic groups · {totals?.osce_attempts ?? 0} station attempts from {totals?.osce_students ?? 0} students in the last {DAYS} days.</p>
          {flashcardGroups === 0 && (
            <p className="aurora-unavail">No flashcard data yet — per-topic accuracy appears once students start answering cards.</p>
          )}
          {!!totals?.unclassified_students && (
            <p className="aurora-unavail">{totals.unclassified_students} student{totals.unclassified_students === 1 ? "" : "s"} sit outside OA/PSA/OT and are excluded from every discipline view.</p>
          )}
        </>
      )}
    </section>
  );
}
```

**(c)** In `frontend/src/aurora/screens/AdminCohort.tsx`, add ONE import immediately after line 14. `PanelState` is already imported on line 14 — do not re-add it, `tsc` rejects the duplicate:

```tsx
import { AdminTopicAnalytics } from "@/aurora/screens/AdminTopicAnalytics";
```

and mount the panel between the insight block and the grid (lines 95-97):

```tsx
      {insight.data && <div className="aurora-insight"><p>“{insight.data}”</p></div>}

      <AdminTopicAnalytics />

      <div className="aurora-admin-grid">
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npm --prefix frontend run typecheck
bash scripts/start-harness.sh stop
npm --prefix frontend run build:safe
SKIP_BUILD=1 bash scripts/start-harness.sh aurora
```
Expected: PASS — typecheck clean; the aurora harness prints `PASS: Admin — panel-local discipline switcher states its scope and re-queries the server with the new discipline`, and every pre-existing admin assertion (`guard admits a trainer`, `admin also gets the Accounts tab`, `student-note draft survives a background poll refetch`, `a student is bounced off the staff surface`) stays green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useAdmin.ts frontend/src/aurora/screens/AdminTopicAnalytics.tsx frontend/src/aurora/screens/AdminCohort.tsx frontend/tests/aurora_assert.mjs frontend/tests/_mocks.mjs
git commit -m "feat(admin): cohort-analytics hook and panel-local discipline switcher"
```

---

## Task 11: Cohort-analytics panels within the chart budget

Spec §5.4 chart budget + D3 (function now, polish in P5). The `/api/admin/cohort-analytics` payload has no renderer yet, and the panels it must replace are the ones that made P1's board dishonest: `AdminCohort.tsx:57-62` ranks weakest topics off a profile-snapshot `Counter`, and `:137,:162` drive a `BarSeries` and a `DonutGauge` from the 80-item-capped activity feed. This task adds the renderer for the real payload, entirely by **reusing** `BarSeries` — no new chart component, no new CSS class; the cohort-wide safety donut and most-missed bars are re-pointed by Task 12, which owns them, so this component deliberately renders neither — and makes the honest states (low-confidence, null, no-flashcard) the primary UX rather than an afterthought, because at ~24 attempts across 21 groups most panels are legitimately empty.

Two structural decisions, both forced by the components as they are actually written:

- `BarSeries` stacks **all** segments into one flex track (`BarSeries.tsx:27`) and clamps each to `[0,1]` (`:34`), so it cannot express grouped or diverging bars. The OSCE-vs-flashcard comparison is therefore **two `BarSeries` rows per topic group**, distinguished by a `· OSCE` / `· flashcards` label suffix. **If the behavioral pass finds the paired rows illegible, a `GroupedBars` component enters the P2 budget — that is the one and only trigger for it, and it must be called out and agreed before it is written.** Nothing in this task assumes it.
- `DonutGauge` coerces a non-finite value to `0` and renders a confident `"0%"` (`DonutGauge.tsx:12,16`). A null safety rate must therefore never reach it — the panel renders prose instead. Same rule everywhere: a null metric drops its segment and reads `—`, it is never drawn as a zero-length bar.

The scoring maths and the fetch both live elsewhere: this component is presentational and takes an already-fetched `CohortAnalytics` through props, so the panel-local discipline switcher (D11) owns `useCohortAnalytics`, the caption and the window, and mounts `<CohortAnalyticsPanels/>` beneath itself. One query, one load/error affordance, no second copy of the switcher state.

**Files:**
- Create: `frontend/src/aurora/components/admin/cohortAnalyticsView.ts` (pure view-model; no React, so Node can type-strip and unit-test it)
- Create: `frontend/src/aurora/components/admin/CohortAnalyticsPanels.tsx`
- Modify: frontend/src/aurora/screens/AdminTopicAnalytics.tsx (created in Task 10 — mount the panels)
- Modify: `.github/workflows/ci.yml` (append the new logic harness to the "Logic harnesses" step — nothing auto-discovers them)
- Test: `frontend/tests/cohort_panels_logic.mjs`
- Read-only reference (not modified): `frontend/src/aurora/components/charts/BarSeries.tsx`, `frontend/src/aurora/components/charts/DonutGauge.tsx`, `frontend/src/aurora/components/admin/PanelState.tsx`, `frontend/src/hooks/useAdmin.ts`, `frontend/src/aurora/aurora.css:2199-2205,3573-3584`

- [ ] **Step 1: Write the failing test**

```javascript
/* Pure unit test for the cohort-analytics panel view-model. No React, no DOM —
   the module is deliberately free of both so this runs under Node's type stripping,
   mirroring charts_logic.mjs:
     node --experimental-strip-types frontend/tests/cohort_panels_logic.mjs

   What these assertions defend, in the order a trainer would be misled:
     1. a 3-attempt group cannot top the weakness ranking just because its one bad
        attempt scored worst — low-confidence groups sort BELOW confident ones;
     2. discipline=all never blends OA/PSA and OT into one ranking (D2) — the
        curricula are disjoint, so a blended row compares topics an OA student
        cannot even see;
     3. no null metric is ever drawn as a zero — a missing average renders "—" and
        drops its bar segment, because a 0% bar reads as catastrophic performance;
     4. the cohort safety rate is POOLED (sum of fails / sum of gradable attempts),
        not the mean of per-group rates, which would weight a 2-attempt group the
        same as a 20-attempt one;
     5. every readout carries its own denominator (§5.3). */
import assert from "node:assert";
import {
  NO_DATA,
  rankTopics,
  sectionsFor,
  flashcardOk,
  weakestPanel,
  comparisonPanel,
  safetyPanel,
  missedPanel,
} from "../src/aurora/components/admin/cohortAnalyticsView.ts";

/* A TopicGroupRow at its emptiest — every metric null, every denominator 0. That
   is the REALISTIC shape at today's volume, so it is the default here and each
   test opts into the data it needs. */
const g = (label, over = {}, osce = {}) => ({
  topic_group: label.toLowerCase().replace(/ /g, "_"),
  label,
  pool: "CLINICAL",
  osce: {
    attempts: 0, students: 0, avg_score: null, scored_n: 0, pass_rate: null, graded_n: 0,
    safety_fail_rate: null, safety_gradable_n: 0, missed_top: [],
    by_difficulty: { beginner: 0, intermediate: 0, advanced: 0 },
    ...osce,
  },
  flashcard: null,
  weakness_score: null,
  low_confidence: false,
  signals_present: [],
  ...over,
});

const payload = (over = {}) => ({
  discipline: "all",
  days: 90,
  topics: [],
  totals: {
    students_in_pool: 0, students_with_osce_data: 0, students_with_flashcard_data: 0,
    osce_attempts: 0, osce_students: 0, unclassified_students: 0, unclassified_attempts: 0,
  },
  sources: { osce: "ok", flashcard: "ok" },
  ...over,
});

// ── 1) Ranking: confident first, limited-data next, no-signal last ──────────────
const ranked = rankTopics([
  g("No signal"),
  g("Thin", { weakness_score: 0.91, low_confidence: true }),
  g("Solid", { weakness_score: 0.4 }),
  g("Worst", { weakness_score: 0.72 }),
]);
assert.deepStrictEqual(
  ranked.map((t) => t.label),
  ["Worst", "Solid", "Thin", "No signal"],
  "a 0.91 low-confidence group must NOT outrank a 0.72 confident one",
);
assert.deepStrictEqual(
  rankTopics([g("Beta", { weakness_score: 0.5 }), g("Alpha", { weakness_score: 0.5 })]).map((t) => t.label),
  ["Alpha", "Beta"],
  "ties break on label so the order is stable between polls",
);

// ── 2) discipline=all renders two labelled sections, in a fixed order ───────────
const both = payload({ topics: [g("Uvea & retina"), g("Orthoptics", { pool: "OT" })] });
const secs = sectionsFor(both);
assert.deepStrictEqual(secs.map((s) => s.title), ["OA & PSA", "OT"]);
assert.deepStrictEqual(secs.map((s) => s.topics.map((t) => t.label)), [["Uvea & retina"], ["Orthoptics"]]);

const otOnly = sectionsFor(payload({ discipline: "ot", topics: [g("Orthoptics", { pool: "OT" })] }));
assert.strictEqual(otOnly.length, 1);
assert.strictEqual(otOnly[0].title, "OT");

// An empty pool still gets its section, so a discipline never silently disappears
// from the board on a thin week.
const lopsided = sectionsFor(payload({ topics: [g("Uvea & retina")] }));
assert.strictEqual(lopsided.length, 2);
assert.deepStrictEqual(lopsided[1].topics, []);

// ── 3) Weakest topics: markers, denominators, and no fabricated zeros ──────────
const wp = weakestPanel([
  g("Worst", { weakness_score: 0.72, signals_present: ["osce_score", "osce_pass"] }, { attempts: 9, students: 4 }),
  g("Thin", { weakness_score: 0.91, low_confidence: true, signals_present: ["osce_score"] }, { attempts: 2, students: 1 }),
  g("Silent"),
]);
assert.deepStrictEqual(wp.rows.map((r) => r.label), ["Worst", "Thin · limited data"]);
assert.strictEqual(wp.rows[0].readout, "72 (9)", "weakness index plus the attempts it was measured over");
assert.strictEqual(wp.rows[0].weak, true);
assert.strictEqual(wp.rows[1].weak, false, "a limited-data group must not wear the alarm gradient");
assert.strictEqual(wp.rows[1].segments[0].tone, "purple");
assert.strictEqual(wp.max, 1, "weakness_score is already normalised 0-1");
assert.ok(wp.summary.includes("Worst"));
assert.ok(wp.summary.includes("9 OSCE attempt"));
assert.ok(wp.summary.includes("1 group(s) marked"));
assert.ok(wp.summary.includes("1 group(s) have no performance signal"));
assert.ok(!wp.rows.some((r) => r.label.startsWith("Silent")), "a null score is unranked, not ranked at zero");

const wpEmpty = weakestPanel([g("Silent"), g("Also silent")]);
assert.deepStrictEqual(wpEmpty.rows, []);
assert.ok(wpEmpty.summary.startsWith("No topic group has enough performance data"));

// ── 4) OSCE vs flashcards: two rows per group, both normalised to 0-1 ──────────
const mixed = [
  g("Uvea", { weakness_score: 0.6, flashcard: { accuracy: 84, n: 120, students: 7 } }, { avg_score: 78.4, scored_n: 15 }),
  g("Glaucoma", { weakness_score: 0.3 }, { avg_score: 91, scored_n: 4 }),
];
const cp = comparisonPanel(mixed, true);
assert.deepStrictEqual(cp.rows.map((r) => r.label), [
  "Uvea · OSCE", "Uvea · flashcards", "Glaucoma · OSCE", "Glaucoma · flashcards",
]);
// avg_score AND accuracy both arrive on 0-100; the shared BarSeries track is 0-1.
// Plotting either un-normalised is the 100x scale bug §5.3 warns about.
assert.ok(Math.abs(cp.rows[0].segments[0].value - 0.784) < 1e-9);
assert.strictEqual(cp.rows[0].readout, "78% (15)");
assert.ok(Math.abs(cp.rows[1].segments[0].value - 0.84) < 1e-9);
assert.strictEqual(cp.rows[1].readout, "84% (120)");
// Glaucoma has no flashcard row at all -> empty track + em-dash, never a 0% bar.
assert.deepStrictEqual(cp.rows[3].segments, []);
assert.strictEqual(cp.rows[3].readout, NO_DATA);
assert.strictEqual(NO_DATA, "—");

const cpNoFlash = comparisonPanel(mixed, false);
assert.deepStrictEqual(cpNoFlash.rows.map((r) => r.label), ["Uvea · OSCE", "Glaucoma · OSCE"]);
assert.ok(cpNoFlash.summary.includes("No flashcard data yet"));
assert.ok(!cpNoFlash.summary.includes("0%"));

const cpEmpty = comparisonPanel([g("Silent")], true);
assert.deepStrictEqual(cpEmpty.rows, []);
assert.ok(cpEmpty.summary.startsWith("No topic group has a graded OSCE attempt"));

// flashcardOk gates the whole flashcard half: an unavailable source and a merely
// empty table both mean "not yet", never 0%.
assert.strictEqual(flashcardOk(payload({ topics: mixed })), true);
assert.strictEqual(
  flashcardOk(payload({ topics: mixed, sources: { osce: "ok", flashcard: "unavailable" } })),
  false,
);
assert.strictEqual(
  flashcardOk(payload({ topics: [g("Empty", { flashcard: { accuracy: null, n: 0, students: 0 } })] })),
  false,
);

// ── 5) Safety callout: pooled, not the mean of rates ───────────────────────────
const sp = safetyPanel([
  g("A", {}, { safety_fail_rate: 0.5, safety_gradable_n: 2 }),
  g("B", {}, { safety_fail_rate: 0.1, safety_gradable_n: 20 }),
  g("C", {}, { safety_fail_rate: null, safety_gradable_n: 0 }),
]);
assert.strictEqual(sp.rate, 3 / 22);
assert.strictEqual(sp.summary, "3 of 22 graded attempt(s) missed a critical safety step.");
assert.ok(Math.abs(sp.rate - 0.3) > 0.1, "the mean of per-group rates would read 30% — 2x the pooled truth");

const spNone = safetyPanel([g("A"), g("B")]);
assert.strictEqual(spNone.rate, null, "null must reach the panel, not DonutGauge, which would render 0%");
assert.ok(spNone.summary.includes("no safety rate to report"));

// ── 6) Most-missed steps: ranked by miss count, read as "3 of 40" ──────────────
const mp = missedPanel([
  g("Uvea", {}, {
    students: 40,
    missed_top: [
      { step: "Did not check IOP", count: 7, students: 3 },
      { step: "No red flag screen", count: 2, students: 2 },
    ],
  }),
  g("Glaucoma", {}, {
    students: 12,
    missed_top: [{ step: "Missed disc assessment", count: 9, students: 5 }],
  }),
]);
assert.deepStrictEqual(mp.rows.map((r) => r.label), [
  "Missed disc assessment", "Did not check IOP", "No red flag screen",
]);
assert.strictEqual(mp.max, 9, "bars scale to the largest miss count, not to 1");
assert.strictEqual(mp.rows[1].readout, "3/40");
assert.ok(mp.summary.includes("5 of 12 students"));

const mpEmpty = missedPanel([g("Uvea")]);
assert.deepStrictEqual(mpEmpty.rows, []);
assert.strictEqual(mpEmpty.max, 1);
assert.ok(mpEmpty.summary.includes("No critical step"));

// ── 7) Cross-cutting: none of these fixtures may produce a drawn zero ──────────
// Every metric in them is either a real number or null, and a null metric drops
// its segment rather than drawing a 0-length bar that reads as a measured zero.
for (const panel of [wp, cp, cpNoFlash, mp]) {
  for (const row of panel.rows) {
    assert.ok(!row.segments.some((s) => s.value === 0), `${row.label}: absent metric drew a zero segment`);
    assert.notStrictEqual(row.readout, "0%", `${row.label}: absent metric read as 0%`);
  }
}

console.log("cohort_panels_logic: all assertions passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types frontend/tests/cohort_panels_logic.mjs`
Expected: FAIL — `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '<repo>/frontend/src/aurora/components/admin/cohortAnalyticsView.ts' imported from <repo>/frontend/tests/cohort_panels_logic.mjs`

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/aurora/components/admin/cohortAnalyticsView.ts`:

```typescript
/* Pure view-model for the cohort-analytics panels: CohortAnalytics -> BarSeries rows
   + the text summary each chart is paired with. No React and no DOM imports, so the
   Node harness can type-strip and unit-test it (mirrors chartGeometry.ts).

   It exists because every honesty rule in this slice is a DATA rule, not a rendering
   one — nulls stay null, low-confidence groups sort last, denominators travel with
   their metric — and those are the rules worth pinning in a test. The .tsx below is
   then a dumb projection of what this returns.

   Both type imports are erased before Node ever resolves them. */
import type { BarRow } from "@/aurora/components/charts/BarSeries";
import type { CohortAnalytics, TopicGroupRow } from "@/hooks/useAdmin";

/** Em-dash for "this metric has no denominator", never "0". A 0% bar or a 0% donut
    reads as measured, catastrophic performance; at ~1 attempt per topic group that
    would be the most common single reading on the board. */
export const NO_DATA = "—";

export interface CohortSection {
  pool: string;
  title: string;
  topics: TopicGroupRow[];
}

export interface BarPanel {
  rows: BarRow[];
  /** BarSeries divides by this. 1 for already-normalised 0-1 values; the largest
      count for raw-count bars. */
  max: number;
  /** The prose the aria-hidden bars are paired with (D3) — and the only place the
      numbers appear spelled out with their denominators. */
  summary: string;
}

export interface SafetyPanel {
  rate: number | null;
  summary: string;
}

/* The frontend twin of tools/supervisor/discipline.py's literal map. `all` is two
   sections, never one blended ranking (D2): the OA/PSA and OT curricula are
   disjoint, so a merged ranking would rank a topic against one no OA student can
   even see. Keyed on the raw string because the payload is unvalidated JSON. */
const POOLS_BY_DISCIPLINE: Record<string, string[]> = {
  oa_psa: ["CLINICAL"],
  ot: ["OT"],
  all: ["CLINICAL", "OT"],
};

const POOL_TITLE: Record<string, string> = { CLINICAL: "OA & PSA", OT: "OT" };

/** 0-1 weakness score as the 0-100 index the panel labels it with. */
function weaknessIndex(score: number): number {
  return Math.round(score * 100);
}

/** A 0-100 metric as "84% (120)" — the percentage plus the n it was measured over
    (§5.3: every metric carries its own denominator). BOTH osce.avg_score (a mean of
    score_100) and flashcard.accuracy (cohort_analytics.flashcard_by_group emits
    db.get_topic_accuracy's `pct`, 0-100 at 1dp) arrive on 0-100; only pass_rate,
    safety_fail_rate and weakness_score are 0-1, and none of those is read out here.
    The spelled-out "84 of 120" lives in the summary instead: .aurora-bar-label is a
    fixed 11rem and .aurora-bar-pct is flex-shrink:0, so a long readout eats the very
    track it annotates. */
function scoreReadout(score: number | null, n: number): string {
  return score === null || n <= 0 ? NO_DATA : `${Math.round(score)}% (${n})`;
}

/* Sort tier: confident (0) -> limited data (1) -> no signal at all (2). Spec §5.3
   requires low-confidence groups below confident ones; without it a single 20/100
   attempt tops the ranking and sends a trainer to the emptiest topic in the
   library rather than the weakest. */
function tier(t: TopicGroupRow): number {
  if (t.weakness_score === null) return 2;
  return t.low_confidence ? 1 : 0;
}

export function rankTopics(topics: TopicGroupRow[]): TopicGroupRow[] {
  return [...topics].sort(
    (a, b) =>
      tier(a) - tier(b) ||
      (b.weakness_score ?? -1) - (a.weakness_score ?? -1) ||
      a.label.localeCompare(b.label),
  );
}

/** One section per pool the requested discipline covers, each ranked. A pool with
    no rows still gets its (empty) section so a discipline never silently vanishes
    from the board on a thin week. */
export function sectionsFor(data: CohortAnalytics): CohortSection[] {
  const pools = POOLS_BY_DISCIPLINE[data.discipline] ?? POOLS_BY_DISCIPLINE.all;
  return pools.map((pool) => ({
    pool,
    title: POOL_TITLE[pool] ?? pool,
    topics: rankTopics(data.topics.filter((t) => t.pool === pool)),
  }));
}

/** Whether the flashcard half of the board may render at all. The table only began
    receiving rows at the writer fix (Task 1), so "unavailable" and "empty" both
    mean "not yet" — and both must read as that, never as 0% accuracy. */
export function flashcardOk(data: CohortAnalytics): boolean {
  return data.sources.flashcard === "ok" && data.topics.some((t) => (t.flashcard?.n ?? 0) > 0);
}

export function weakestPanel(topics: TopicGroupRow[], limit = 6): BarPanel {
  const ranked = rankTopics(topics);
  const scored = ranked.filter(
    (t): t is TopicGroupRow & { weakness_score: number } => t.weakness_score !== null,
  );
  const rows: BarRow[] = scored.slice(0, limit).map((t): BarRow => ({
    label: t.low_confidence ? `${t.label} · limited data` : t.label,
    segments: [{
      value: t.weakness_score,
      // Flat purple for limited data, the rose alarm gradient (via `weak`) only for
      // groups that cleared the confidence floor — the marker has to be visible in
      // the bar too, not just in the label, because the label truncates at 11rem.
      tone: t.low_confidence ? "purple" : "rose",
      title: `${t.label}: weakness index ${weaknessIndex(t.weakness_score)} from `
        + `${t.osce.attempts} OSCE attempt(s) by ${t.osce.students} student(s) · signals: `
        + `${t.signals_present.join(", ") || "none"}`,
    }],
    readout: `${weaknessIndex(t.weakness_score)} (${t.osce.attempts})`,
    weak: !t.low_confidence,
  }));

  if (rows.length === 0) {
    return {
      rows,
      max: 1,
      summary: `No topic group has enough performance data to rank yet — `
        + `${ranked.length} group(s) tracked, none with a scored attempt.`,
    };
  }

  const lead = scored[0];
  const low = scored.filter((t) => t.low_confidence).length;
  const none = ranked.length - scored.length;
  const summary = `Weakness index 0-100 (higher = weaker), limited-data groups last. `
    + `Highest: ${lead.label} at ${weaknessIndex(lead.weakness_score)}, from `
    + `${lead.osce.attempts} OSCE attempt(s) by ${lead.osce.students} student(s).`
    + (low ? ` ${low} group(s) marked "limited data" — under the 3-student / 5-attempt confidence floor.` : "")
    + (none ? ` ${none} group(s) have no performance signal yet and are not ranked.` : "");
  return { rows, max: 1, summary };
}

/** Two BarSeries rows per group — BarSeries stacks every segment into ONE flex
    track (BarSeries.tsx:27), so a grouped bar is not expressible without a new
    component, which §5.4 keeps out of the P2 budget. */
export function comparisonPanel(topics: TopicGroupRow[], hasFlashcards: boolean, limit = 5): BarPanel {
  const ranked = rankTopics(topics)
    .filter((t) => t.osce.scored_n > 0 || (t.flashcard?.n ?? 0) > 0)
    .slice(0, limit);

  const rows: BarRow[] = [];
  for (const t of ranked) {
    const avg = t.osce.avg_score;
    rows.push({
      label: `${t.label} · OSCE`,
      // avg_score is a MEAN OF score_100 (0-100); the flashcard row below is a rate
      // (0-1). Sharing one 0-1 track without dividing here is the 100x bug §5.3
      // calls out — every OSCE bar would clamp to full width.
      segments: avg === null ? [] : [{
        value: avg / 100,
        tone: "blue",
        title: `${t.label}: mean station score ${Math.round(avg)} of 100 over ${t.osce.scored_n} scored attempt(s)`,
      }],
      readout: scoreReadout(avg, t.osce.scored_n),
    });
    if (!hasFlashcards) continue;
    const f = t.flashcard;
    rows.push({
      label: `${t.label} · flashcards`,
      // accuracy arrives on 0-100, exactly like avg_score — divide by 100 for the
      // shared 0-1 track or every flashcard bar clamps to full width.
      segments: f && f.accuracy !== null ? [{
        value: f.accuracy / 100,
        tone: "green",
        title: `${t.label}: ${Math.round(f.accuracy)}% correct over ${f.n} answer(s) by ${f.students} student(s)`,
      }] : [],
      readout: f ? scoreReadout(f.accuracy, f.n) : NO_DATA,
    });
  }

  if (rows.length === 0) {
    return {
      rows,
      max: 1,
      summary: "No topic group has a graded OSCE attempt or a flashcard answer in this window yet.",
    };
  }
  const summary = `Two rows per group: mean station score (0-100) above flashcard accuracy, `
    + `each with the number of attempts it was measured over.`
    + (hasFlashcards
      ? ""
      : ` No flashcard data yet — answers are only recorded from the writer fix onward, `
        + `so this shows OSCE alone rather than an empty topic at zero.`);
  return { rows, max: 1, summary };
}

/** Cohort safety rate, POOLED: sum of fails over sum of gradable attempts. The mean
    of the per-group rates would weight a 2-attempt group the same as a 20-attempt
    one. The endpoint sends a rate + its denominator rather than a raw count, so the
    count is reconstructed — rate x n is an integer by construction. */
export function safetyPanel(topics: TopicGroupRow[]): SafetyPanel {
  let gradable = 0;
  let fails = 0;
  for (const t of topics) {
    const n = t.osce.safety_gradable_n;
    // A null rate with n > 0 cannot happen under D13; skip both rather than
    // counting attempts whose fails we cannot know.
    if (n <= 0 || t.osce.safety_fail_rate === null) continue;
    gradable += n;
    fails += Math.round(t.osce.safety_fail_rate * n);
  }
  if (gradable === 0) {
    return {
      rate: null,
      summary: "No attempt in this window was graded against a checklist carrying a "
        + "critical step, so there is no safety rate to report.",
    };
  }
  return {
    rate: fails / gradable,
    summary: `${fails} of ${gradable} graded attempt(s) missed a critical safety step.`,
  };
}

interface MissedEntry {
  step: string;
  count: number;
  students: number;
  group: string;
  cohort: number;
}

/** Most-missed critical steps across the section. Entries stay per-group: the same
    step text under two groups is two rows, because each carries its own cohort
    denominator and merging them would invent a third. */
export function missedPanel(topics: TopicGroupRow[], limit = 6): BarPanel {
  const entries: MissedEntry[] = topics.flatMap((t) =>
    t.osce.missed_top.map((m) => ({ ...m, group: t.label, cohort: t.osce.students })),
  );
  entries.sort((a, b) => b.count - a.count || b.students - a.students || a.step.localeCompare(b.step));
  const top = entries.slice(0, limit);

  const rows: BarRow[] = top.map((e): BarRow => ({
    label: e.step,
    segments: [{
      value: e.count,
      tone: "rose",
      title: `${e.group}: missed on ${e.count} attempt(s) by ${e.students} of ${e.cohort} student(s) who attempted this group`,
    }],
    // "3/40" — students affected over students who attempted the group. The bar
    // length is the raw miss count, which is a different denominator, so the two
    // are never conflated in one number.
    readout: `${e.students}/${e.cohort}`,
    weak: true,
  }));

  if (top.length === 0) {
    return { rows, max: 1, summary: "No critical step has been missed by 2 or more students in this window." };
  }
  return {
    rows,
    max: top[0].count,
    summary: `Most-missed critical step: “${top[0].step}” — ${top[0].students} of ${top[0].cohort} `
      + `students who attempted ${top[0].group}. Bar length is the raw miss count; the readout is students affected.`,
  };
}
```

Create `frontend/src/aurora/components/admin/CohortAnalyticsPanels.tsx`:

```tsx
"use client";
/* Admin — cohort-analytics panels. Renders ONE /api/admin/cohort-analytics payload
   as per-discipline sections: weakest topics, and OSCE vs flashcards.

   NOT the safety callout or most-missed steps: those are cohort-wide and belong to
   AdminCohort (§5.5 re-points them there). A second per-section copy would put two
   different safety rates on one screen — the exact defect §5.5 exists to remove.
   safetyPanel/missedPanel stay exported from cohortAnalyticsView for that owner.

   Presentational on purpose. The panel-local discipline switcher (D11) owns the
   query, the window and the caption and passes the result down, so there is exactly
   one fetch behind these panels and one place the discipline lives.

   Chart budget (§5.4, D3): no new chart component and no new CSS class — BarSeries
   and DonutGauge reuse only, over .aurora-panel / .aurora-bar-* / .aurora-unavail.
   Bars are aria-hidden and every panel pairs them with the text summary that
   carries the real numbers and their denominators; full a11y is P5. */
import { BarSeries } from "@/aurora/components/charts/BarSeries";
import { PanelSkeleton, PanelError } from "@/aurora/components/admin/PanelState";
import type { CohortAnalytics } from "@/hooks/useAdmin";
import {
  sectionsFor, flashcardOk, weakestPanel, comparisonPanel,
  type BarPanel,
} from "@/aurora/components/admin/cohortAnalyticsView";
/* safetyPanel / missedPanel stay EXPORTED and harness-covered but are deliberately not
   rendered here: §5.5 re-points the cohort-wide safety donut and most-missed bars in
   AdminCohort, and a second per-section copy would put two different safety rates on one
   screen — the exact defect §5.5 removes. (noUnusedLocals means they must not be
   imported into this file at all.) */

/* The D3 pairing written once instead of three times. Not a chart component —
   BarSeries still does every bit of the drawing, so the "no new chart component"
   budget holds. An empty panel renders its summary ALONE: an empty track next to a
   heading reads as a measured zero. */
function BarPanelBody({ panel }: { panel: BarPanel }) {
  return (
    <>
      {panel.rows.length > 0 && (
        <div aria-hidden>
          <BarSeries rows={panel.rows} max={panel.max} />
        </div>
      )}
      <p className="aurora-unavail" style={{ marginTop: panel.rows.length ? 8 : 0 }}>{panel.summary}</p>
    </>
  );
}

export function CohortAnalyticsPanels({ data, isLoading, isError, onRetry }: {
  data: CohortAnalytics | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  // One query feeds every panel, so the load/error affordance is decided once.
  // `!data` counts as failure, not as an empty cohort: rendering a board of zeros
  // for a fetch that never resolved is the exact defect P1 removed from here.
  if (isLoading) {
    return (
      <section className="aurora-panel">
        <p className="aurora-panel-head">Cohort performance</p>
        <PanelSkeleton rows={4} />
      </section>
    );
  }
  if (isError || !data) {
    return (
      <section className="aurora-panel">
        <p className="aurora-panel-head">Cohort performance</p>
        <PanelError onRetry={onRetry} label="Couldn’t load cohort performance." />
      </section>
    );
  }

  const secs = sectionsFor(data);
  const flash = flashcardOk(data);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {secs.map((sec) => {
        const weakest = weakestPanel(sec.topics);
        const comparison = comparisonPanel(sec.topics, flash);
        return (
          <div key={sec.pool}>
            {/* discipline=all is TWO labelled sections (D2), each its own grid — one
                blended ranking would compare OA/PSA topics against OT topics that no
                OA student can even see. */}
            {secs.length > 1 && (
              <p className="aurora-panel-head" style={{ marginBottom: 10 }}>{sec.title}</p>
            )}
            <div className="aurora-admin-grid">
              <section className="aurora-panel">
                <p className="aurora-panel-head">Weakest topics · performance</p>
                <BarPanelBody panel={weakest} />
              </section>

              <section className="aurora-panel">
                <p className="aurora-panel-head">OSCE vs flashcards</p>
                <BarPanelBody panel={comparison} />
              </section>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

Then mount it. In `AdminTopicAnalytics.tsx`, replace:
```tsx
import { PanelSkeleton, PanelError } from "@/aurora/components/admin/PanelState";
```
with:
```tsx
import { PanelSkeleton, PanelError } from "@/aurora/components/admin/PanelState";
import { CohortAnalyticsPanels } from "@/aurora/components/admin/CohortAnalyticsPanels";
```
and replace:
```tsx
          {!!totals?.unclassified_students && (
            <p className="aurora-unavail">{totals.unclassified_students} student{totals.unclassified_students === 1 ? "" : "s"} sit outside OA/PSA/OT and are excluded from every discipline view.</p>
          )}
        </>
```
with:
```tsx
          {!!totals?.unclassified_students && (
            <p className="aurora-unavail">{totals.unclassified_students} student{totals.unclassified_students === 1 ? "" : "s"} sit outside OA/PSA/OT and are excluded from every discipline view.</p>
          )}
          {/* The charts live one level down and are purely presentational: this panel
              owns the query, the window and the switcher (D11), so there is exactly ONE
              fetch behind them. isLoading/isError are false by construction here — this
              branch only runs on resolved data — but they stay on the props so the
              component never grows a second load/error affordance. */}
          <CohortAnalyticsPanels data={q.data} isLoading={false} isError={false} onRetry={() => q.refetch()} />
        </>
```

Then register the new harness in CI — nothing auto-discovers `.mjs` harnesses, so an unregistered one rots silently. In `.github/workflows/ci.yml`, in the `Logic harnesses (type-stripped unit tests)` step, append one line after the last existing entry:

```yaml
          node --experimental-strip-types tests/hoverPause_logic.mjs
          node --experimental-strip-types tests/cohort_panels_logic.mjs
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types frontend/tests/cohort_panels_logic.mjs && node --experimental-strip-types frontend/tests/charts_logic.mjs && npm --prefix frontend run typecheck`
Expected: PASS — `cohort_panels_logic: all assertions passed`, then `charts_logic: all assertions passed` (proving `BarSeries`/`DonutGauge`'s shared geometry was reuse-only, not modified), then a clean `tsc --noEmit`. The `build:safe` gate runs once in this plan's final verification; kill any node process on :3000 first or it dies `EBUSY`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/components/admin/cohortAnalyticsView.ts frontend/src/aurora/components/admin/CohortAnalyticsPanels.tsx frontend/src/aurora/screens/AdminTopicAnalytics.tsx frontend/tests/cohort_panels_logic.mjs .github/workflows/ci.yml
git commit -m "feat(admin): render cohort analytics as BarSeries and DonutGauge reuse"
```

---

## Task 12: Retire the panels fed by the 80-item activity feed

Spec §5.5. `AdminCohort.tsx` derives `avgOsce` (line 46), `graded`/`unsafe`/`safetyRate` (lines 72-74) and `missCounts`/`mostMissed` (lines 75-78) from `useActivity`, whose feed is hard-capped at 80 items (`tools/api/routers/admin.py:234` — `return {"feed": feed[:80]}`), the exact defect P1 fixed for the activity trend. Leaving them beside the new cohort-analytics panel puts two disagreeing OSCE numbers on one screen, and the "Weakest topics (cohort)" panel (lines 130-139) ranks by `cohort_summary.weakest_topics` — a bare `Counter` over profile snapshots — while the new panel ranks by `weakness_score` computed from real attempts. `cohort_summary.weakest_topics` **stays on the backend**; only the panel retires.

**Files:**
- Modify: `frontend/src/aurora/screens/AdminCohort.tsx` (header comment 1-6; import 13; `useActivity()` 20; feed KPI block 35-48; `weakRows` block 52-62; Avg OSCE tile 91; weakest-topics section 130-139; the two OSCE panels 152-179)
- Modify: `frontend/src/hooks/useAdmin.ts` (insert an orphan note above `useActivity`, line 128)
- Test: `frontend/tests/aurora_assert.mjs` (new assertions after Task 10's `PASS: Admin — panel-local discipline switcher…` line; no new route — Task 10 registered the only cohort-analytics route)
- Test: `frontend/tests/_mocks.mjs` (no new route — Task 10 registered the only cohort-analytics route)

### Consumer enumeration — run this FIRST (P1 Task 3, Step 1 pattern)

Run, from the worktree root:

```bash
grep -rn "useActivity\|FeedItem\|missed_critical\|safetyRate\|mostMissed\|avgOsce" frontend/src/ frontend/tests/
grep -rn "weakest_topics" tools/ frontend/src/ frontend/tests/ tests/
```

Verified consumer list at `origin/main` (`cb8908c`). **If the grep surfaces a consumer not on this list, handle it in this task.**

`useActivity` / the 80-item feed:

| # | Consumer | Disposition |
|---|---|---|
| 1 | `frontend/src/aurora/screens/AdminCohort.tsx:13,20` — import + `const activity = useActivity()` | **Removed here.** This is the *only* `useActivity` call site in the app. |
| 2 | `AdminCohort.tsx:35-48` — `feed` → `caseItems` → `caseScores` → `avgOsce` | **Deleted** (feed-derived KPI). |
| 3 | `AdminCohort.tsx:71-78` — `graded`/`unsafe`/`safetyRate`, `missCounts`/`mostMissed`/`missMax` | **Re-pointed** at `useCohortAnalytics`. |
| 4 | `AdminCohort.tsx:91` — `<StatCard label="Avg OSCE">` | **Deleted.** The cohort-analytics contract has no cohort-wide mean, and synthesising one would blend two disjoint curricula into a single attainment number — D2 refuses exactly that. The honest per-group `avg_score` + `scored_n` lives in the new panel. |
| 5 | `AdminCohort.tsx:152-179` — the two OSCE panels gate loading/error on `activity` | **Re-pointed** at `analytics`. |
| 6 | `frontend/src/hooks/useAdmin.ts:121-134` — `FeedItem` + `useActivity` | **Kept, annotated.** Nothing else in `frontend/src` imports either symbol, so this change orphans the hook; but `/api/admin/activity` is still live, `require_staff`-guarded and covered by `tests/api/test_admin_activity_fields.py` + `STAFF_READ_ENDPOINTS`. Retiring endpoint + hook together is a P3 call, not a drive-by deletion here. |
| 7 | `tools/api/routers/admin.py:180-234` — the producer | **Unchanged.** No backend edit in this task. |
| 8 | `frontend/tests/aurora_assert.mjs:814-817`, `frontend/tests/_mocks.mjs:132-135` — activity fixtures | **Kept.** The endpoint and hook still exist; deleting the mocks would only hide a future regression. |

`cohort_summary.weakest_topics`:

| # | Consumer | Disposition |
|---|---|---|
| 1 | `tools/supervisor/cohort_summary.py:69` — producer | **Stays.** |
| 2 | `tools/api/routers/supervisor.py:31` (`WeakTopic` model) and `:234` (insights prompt context) | **Stays** — feeds the AI insight narrative. |
| 3 | `tools/supervisor/weekly_digest.py:133` — `_weak_topics_section(summary["weakest_topics"])` | **Stays** — feeds the weekly digest email. |
| 4 | `frontend/src/hooks/useAdmin.ts:17,20` — `WeakTopic` / `Cohort.weakest_topics` | **Stays.** `/api/supervisor/cohort` still returns the field and `Cohort` still backs three KPI tiles; the type must keep describing the wire truthfully. |
| 5 | `AdminCohort.tsx:52-62,130-139` — `weakRows` + the panel | **Retired here.** The only UI consumer. |
| 6 | `tests/supervisor/test_cohort_summary.py:50`, `tests/supervisor/test_cohort_summary_counts.py`, `tests/supervisor/test_weekly_digest_topics.py` | **Untouched** — must stay green, proving the backend field survived. |
| 7 | `frontend/tests/aurora_assert.mjs:808`, `frontend/tests/_mocks.mjs:125` | **Kept** — the endpoint shape is unchanged. |

- [ ] **Step 1: Write the failing test**

Two edits to the CI-gated aurora harness. This is the only executable gate that can see rendered panels; `tsc` and `next build` are both green *before* the change, so a typecheck-only task would have no failing test at all.

**1a.** Task 10 registered the only `**/api/admin/cohort-analytics*` route in this file and Task 10's fixture constants above already carry the numbers these assertions need — verify `CA_CLINICAL`/`CA_OT`/`CA_TOTALS` match the block in the audit fix and add no route.

**1b.** In `frontend/tests/aurora_assert.mjs`, append this block immediately after Task 10's `console.log("PASS: Admin — panel-local discipline switcher states its scope and re-queries the server with the new discipline");` line. It reuses the already-loaded trainer page `tp`.

```js
// P2 §5.5: the panels derived from /api/admin/activity are retired. That feed is capped
// at 80 items server-side, so every cohort aggregate built on it described only the most
// recent slice — and sat next to the uncapped cohort-analytics panel showing different
// numbers. The activity fixture above carries ONE case attempt with safe:true, so the old
// code renders "0 of 1"; the cohort-analytics fixture is 3 of 20. That divergence is what
// makes this a real assertion and not a tautology.
if ((await tp.locator('[data-testid="stat-card"]:has(.aurora-statcard-label:text-is("Avg OSCE"))').count()) !== 0) {
  console.error("FAIL: the retired 'Avg OSCE' KPI (derived from the 80-item activity feed) is still rendered"); process.exit(1);
}
if ((await tp.locator('.aurora-panel-head:text-is("Weakest topics (cohort)")').count()) !== 0) {
  console.error("FAIL: the retired 'Weakest topics (cohort)' panel is still rendered — it ranks cohort_summary counts against the new weakness_score ranking"); process.exit(1);
}
const safetyText = (await tp.locator('.aurora-panel:has(.aurora-panel-head:text-is("OSCE safety-failure rate"))').innerText()).replace(/\s+/g, " ");
if (!safetyText.includes("3 of 20 graded attempts")) {
  console.error(`FAIL: the safety donut still reads the activity feed, not cohort-analytics (panel text: '${safetyText}')`); process.exit(1);
}
const missedText = (await tp.locator('.aurora-panel:has(.aurora-panel-head:text-is("Most-missed OSCE steps"))').innerText()).replace(/\s+/g, " ");
if (!missedText.includes("Checked intraocular pressure before dilation")) {
  console.error(`FAIL: most-missed bars are not reading cohort-analytics missed_top (panel text: '${missedText}')`); process.exit(1);
}
if (!missedText.includes("15 students have station data")) {
  console.error(`FAIL: most-missed panel is missing its student denominator caption (panel text: '${missedText}')`); process.exit(1);
}
console.log("PASS: Admin — feed-derived cohort panels retired; safety + most-missed read /api/admin/cohort-analytics");
```

**1c.** In `frontend/tests/_mocks.mjs`: Task 10 registered the only `**/api/admin/cohort-analytics*` route in this file — the static `all` payload, which already carries these numbers (3 of 20 safety-gradable, the IOP step, `osce_students: 15`). Verify it still matches Task 10's block and add no route. (`CA_CLINICAL`/`CA_OT`/`CA_TOTALS` live in `aurora_assert.mjs` only; `_mocks.mjs` inlines their `all` merge.)

- [ ] **Step 2: Run test to verify it fails**

Run (Bash tool, absolute paths; the harness server holds a lock on `.next/standalone`, so stop it before building, and build with `build:safe` — Turbopack rejects the junctioned `node_modules` in this worktree):

```bash
bash scripts/start-harness.sh stop
npm --prefix frontend run build:safe
SKIP_BUILD=1 bash scripts/start-harness.sh aurora
```

Expected: FAIL — the harness prints
`FAIL: the retired 'Avg OSCE' KPI (derived from the 80-item activity feed) is still rendered`
and exits 1 (`start-harness.sh` runs under `set -e`, so the script exits non-zero too).

- [ ] **Step 3: Write minimal implementation**

Ten literal edits. Targeted replacements rather than a whole-file rewrite, so Task 11's new topic panel in this same file is not clobbered.

**3a.** `frontend/src/aurora/screens/AdminCohort.tsx` — replace the file header comment (lines 2-6):

```tsx
/* Admin — cohort band. The top-of-page situational picture: KPI tiles, the
   AI cohort insight, an activity trend, weak-topic + cohort-benchmark bars, a
   topic-mastery heatmap, and the Tier-2 OSCE panels (safety-failure rate +
   most-missed steps), populated from the feed's Tier-2 case-grade fields once
   a station attempt has been graded. */
```

with:

```tsx
/* Admin — cohort band. The top-of-page situational picture: KPI tiles, the AI cohort
   insight, an activity trend, cohort-benchmark bars, a topic-mastery heatmap, and the
   two cohort-wide OSCE panels (safety-failure rate + most-missed steps).

   Those two panels read /api/admin/cohort-analytics, NOT the /api/admin/activity feed:
   that feed is capped at 80 items server-side (tools/api/routers/admin.py:234), so
   anything derived from it describes only the most recent slice of the cohort and
   contradicts the uncapped topic panel beside it. Pinned to discipline "all" — the KPI
   row and these safety panels are cohort-wide; the panel-local switcher scopes the
   topic panels only. */
```

**3b.** Replace the hooks import (line 13):

```tsx
import { useCohort, useAtRisk, useBenchmarks, useActivity, useActivityTrend, useTokenSummary, useCohortInsight } from "@/hooks/useAdmin";
```

with:

```tsx
import { useCohort, useAtRisk, useBenchmarks, useActivityTrend, useTokenSummary, useCohortInsight, useCohortAnalytics } from "@/hooks/useAdmin";
```

**3c.** Replace the hook block (lines 17-23):

```tsx
  const cohort = useCohort();
  const atRisk = useAtRisk();
  const benchmarks = useBenchmarks();
  const activity = useActivity();
  const trendQ = useActivityTrend(21);
  const tokens = useTokenSummary();
  const insight = useCohortInsight();
```

with:

```tsx
  const cohort = useCohort();
  const atRisk = useAtRisk();
  const benchmarks = useBenchmarks();
  const trendQ = useActivityTrend(21);
  const tokens = useTokenSummary();
  const insight = useCohortInsight();
  // Dropping useActivity() also drops a 30s poll of /api/admin/activity, which does four
  // unwindowed table reads per call on the single prod worker. "all" + the topic panel's
  // 90-day default share the query key ["admin","cohort-analytics","all",90], so while the
  // switcher sits on All this costs no extra request.
  const analytics = useCohortAnalytics("all", 90);
```

**3d.** Delete the feed-derived KPI block (lines 35-48) in full:

```tsx
  const feed = activity.data ?? [];
  const caseItems = feed.filter((f) => f.type === "case");
  // Prefer the Tier-2 Station-100 score; fall back to the base /40 total. Both are real
  // numeric fields from the feed — never parsed out of the display string.
  const caseScores = caseItems
    .map((f) =>
      typeof f.score_100 === "number" ? f.score_100
      : typeof f.total_score === "number" ? (f.total_score / 40) * 100
      : null,
    )
    .filter((x): x is number => x !== null);
  const avgOsce = caseScores.length
    ? Math.round(caseScores.reduce((a, b) => a + b, 0) / caseScores.length)
    : null;
```

leaving `const trend = (trendQ.data ?? []).map((d) => d.total);` as the next statement after the `heat`/`avgMastery` group.

**3e.** Delete the weakest-topics derivation (lines 52-62) in full:

```tsx
  // Bar length is the real student count, normalised to the largest. The previous
  // `0.9 - i * 0.12` derived length from list position — a fabricated magnitude.
  const weakTopics = c?.weakest_topics ?? [];
  const visible = weakTopics.slice(0, 6);
  const weakMax = visible.length ? Math.max(...visible.map((w) => w.count)) : 1;
  const weakRows: BarRow[] = visible.map((w) => ({
    label: w.topic.replace(/_/g, " "),
    segments: [{ value: w.count / weakMax, tone: "rose" }],
    readout: String(w.count),
    weak: true,
  }));
```

`const c` stays — it still backs the Total / Active / At risk tiles.

**3f.** Replace the Tier-2 OSCE derivations (lines 71-78):

```tsx
  // Tier-2 OSCE — only compute from the extended grade fields if present.
  const graded = caseItems.filter((f) => typeof f.safe === "boolean");
  const unsafe = graded.filter((f) => f.safe === false).length;
  const safetyRate = graded.length ? unsafe / graded.length : null;
  const missCounts = new Map<string, number>();
  for (const f of caseItems) for (const m of f.missed_critical ?? []) missCounts.set(m, (missCounts.get(m) ?? 0) + 1);
  const mostMissed = [...missCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const missMax = mostMissed.length ? mostMissed[0][1] : 1;
```

with:

```tsx
  // Cohort-wide OSCE safety, from the uncapped aggregate. Every attempt lands in exactly
  // one topic group, so summing per-group numerators and denominators reproduces the
  // cohort rate exactly. safety_fail_rate * safety_gradable_n IS the integer fail count —
  // round it back rather than accumulating float drift. A null rate means n == 0 (D13),
  // which contributes nothing to either side of the fraction.
  const groups = analytics.data?.topics ?? [];
  const osceUnavailable = analytics.data?.sources.osce === "unavailable";
  const safetyGradable = groups.reduce((s, g) => s + g.osce.safety_gradable_n, 0);
  const unsafe = groups.reduce(
    (s, g) => s + (g.osce.safety_fail_rate === null ? 0 : Math.round(g.osce.safety_fail_rate * g.osce.safety_gradable_n)),
    0,
  );
  const safetyRate = safetyGradable ? unsafe / safetyGradable : null;

  // missed_top is capped at 3 per group and one step can surface in several groups, so
  // merge on the step text and sum ATTEMPT counts — those partition cleanly across groups.
  // Distinct-STUDENT counts do not: the same student can appear in two groups, so summing
  // `students` would over-count. The student figure stays in the caption as a denominator.
  const missCounts = new Map<string, number>();
  for (const g of groups) for (const m of g.osce.missed_top) missCounts.set(m.step, (missCounts.get(m.step) ?? 0) + m.count);
  const mostMissed = [...missCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const missMax = mostMissed.length ? mostMissed[0][1] : 1;
  const osceStudents = analytics.data?.totals.osce_students ?? 0;
```

**3g.** Delete the Avg OSCE tile (line 91):

```tsx
        <StatCard tone="blue" label="Avg OSCE" value={kpi(activity, avgOsce === null ? "—" : `${avgOsce}%`)} />
```

**3h.** Delete the weakest-topics panel (lines 130-139) in full:

```tsx
        <section className="aurora-panel">
          <p className="aurora-panel-head">Weakest topics (cohort)</p>
          {cohort.isLoading ? (
            <PanelSkeleton />
          ) : cohort.isError ? (
            <PanelError onRetry={() => cohort.refetch()} />
          ) : (
            <BarSeries rows={weakRows} />
          )}
        </section>
```

**3i.** Replace the safety panel (lines 152-166):

```tsx
        <section className="aurora-panel">
          <p className="aurora-panel-head">OSCE safety-failure rate</p>
          {activity.isLoading ? (
            <PanelSkeleton />
          ) : activity.isError ? (
            <PanelError onRetry={() => activity.refetch()} />
          ) : safetyRate === null ? (
            <p className="aurora-unavail">No graded station attempts in the recent activity window yet.</p>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <DonutGauge value={safetyRate} label="unsafe" tone="rose" size={120} />
              <p className="aurora-unavail">{unsafe} of {graded.length} recent attempts missed a critical safety step.</p>
            </div>
          )}
        </section>
```

with:

```tsx
        <section className="aurora-panel">
          <p className="aurora-panel-head">OSCE safety-failure rate</p>
          {analytics.isLoading ? (
            <PanelSkeleton />
          ) : analytics.isError ? (
            <PanelError onRetry={() => analytics.refetch()} />
          ) : osceUnavailable ? (
            // A read failure must never render as a 0% safety-failure rate — on a clinical
            // dashboard that is the single most dangerous wrong number this screen can show.
            <p className="aurora-unavail">Station results couldn’t be read just now — this is not a 0% safety-failure rate.</p>
          ) : safetyRate === null ? (
            <p className="aurora-unavail">No station attempt has been graded for safety yet, across all disciplines.</p>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <DonutGauge value={safetyRate} label="unsafe" tone="rose" size={120} />
              <p className="aurora-unavail">{unsafe} of {safetyGradable} graded attempts missed a critical safety step, across all disciplines. Only attempts on a checklist that has a critical step count here.</p>
            </div>
          )}
        </section>
```

**3j.** Replace the most-missed panel (lines 168-179):

```tsx
        <section className="aurora-panel">
          <p className="aurora-panel-head">Most-missed OSCE steps</p>
          {activity.isLoading ? (
            <PanelSkeleton />
          ) : activity.isError ? (
            <PanelError onRetry={() => activity.refetch()} />
          ) : mostMissed.length ? (
            <BarSeries max={missMax} rows={mostMissed.map(([step, n]) => ({ label: step, segments: [{ value: n, tone: "rose" }], readout: String(n), weak: true }))} />
          ) : (
            <p className="aurora-unavail">No missed critical steps recorded in the recent activity window.</p>
          )}
        </section>
```

with:

```tsx
        <section className="aurora-panel">
          <p className="aurora-panel-head">Most-missed OSCE steps</p>
          {analytics.isLoading ? (
            <PanelSkeleton />
          ) : analytics.isError ? (
            <PanelError onRetry={() => analytics.refetch()} />
          ) : osceUnavailable ? (
            <p className="aurora-unavail">Station results couldn’t be read just now — no missed-step ranking can be shown.</p>
          ) : mostMissed.length ? (
            <>
              <BarSeries max={missMax} rows={mostMissed.map(([step, n]) => ({ label: step, segments: [{ value: n, tone: "rose" }], readout: String(n), weak: true }))} />
              <p className="aurora-unavail" style={{ marginTop: 8 }}>
                Attempts that missed each step, across all disciplines · {osceStudents} students have station data.
              </p>
            </>
          ) : (
            // The aggregator only reports a step once at least 2 distinct students missed it,
            // so "empty" here means "nothing missed widely enough to rank", not "no data".
            <p className="aurora-unavail">No critical step has been missed by 2 or more students yet.</p>
          )}
        </section>
```

**3k.** `frontend/src/hooks/useAdmin.ts` — insert this doc comment between the closing `}` of `FeedItem` (line 127) and `export function useActivity() {` (line 128):

```ts
/** Raw admin activity feed. NOTE: nothing renders it as of P2 — AdminCohort was the last
    consumer and its feed-derived cohort figures retired, because the endpoint caps the
    feed at 80 items so every aggregate built on it under-reported. Kept because
    /api/admin/activity is still live, require_staff-guarded and covered by
    tests/api/test_admin_activity_fields.py; retiring endpoint + hook together is a P3
    call. Do NOT wire a cohort aggregate back onto this hook — use useCohortAnalytics. */
```

- [ ] **Step 4: Run tests to verify they pass**

Run (Bash tool, from the worktree root):

```bash
bash scripts/start-harness.sh stop
npm --prefix frontend run typecheck
npm --prefix frontend run build:safe
SKIP_BUILD=1 bash scripts/start-harness.sh aurora
python -m pytest tests/api/test_admin_activity_fields.py tests/api/test_admin_endpoints.py tests/supervisor/test_cohort_summary.py tests/supervisor/test_cohort_summary_counts.py tests/supervisor/test_weekly_digest_topics.py -q
```

Expected:
- `typecheck` PASS — no unused-symbol or missing-export errors; in particular `BarRow` is still imported and still used by `benchRows`, and `useCohortAnalytics` resolves from `@/hooks/useAdmin`.
- `build:safe` PASS.
- Aurora harness PASS — every pre-existing admin line still prints, including `PASS: Admin — guard admits a trainer, cohort KPIs read the payload, no admin-only Accounts tab` (the `At risk` KPI is untouched at `3`), plus the new `PASS: Admin — feed-derived cohort panels retired; safety + most-missed read /api/admin/cohort-analytics`.
- pytest PASS — the backend halves of both retirements survive untouched: `/api/admin/activity` still emits its structured grade fields and stays inside `STAFF_READ_ENDPOINTS`, and `cohort_summary.weakest_topics` still carries `{topic, count}` for the insights prompt and the weekly digest.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/screens/AdminCohort.tsx frontend/src/hooks/useAdmin.ts frontend/tests/aurora_assert.mjs frontend/tests/_mocks.mjs
git commit -m "fix(admin): retire the cohort panels derived from the 80-item activity feed"
```

---

---

## Final verification

Run these after the last task, before pushing. Each task also commits on its own, so a partial
run is safe to leave — but do not push a partial slice without its verifying task.

- [ ] **Full backend suite**

Run: `python -m pytest -q`
Expected: all pass. Pay particular attention to `tests/supervisor/` and `tests/api/test_admin_*` — this plan adds four new pure modules and one endpoint that several existing tests read through.

- [ ] **Frontend gates**

Run: `npm --prefix frontend run typecheck && npm --prefix frontend run build:safe`
Expected: both pass. (`build:safe` is webpack — Turbopack rejects the junctioned `node_modules`. Kill any node process on :3000 first or the build dies `EBUSY`.)

- [ ] **Visual harness**

Run: `SKIP_BUILD=1 bash scripts/start-harness.sh aurora`
Expected: all aurora assertions pass, including the new cohort-analytics routes registered in **both** `frontend/tests/aurora_assert.mjs` and `frontend/tests/_mocks.mjs`.

`SKIP_BUILD=1` is required, not an optimisation: without it the script runs `npm run build` (`scripts/start-harness.sh:44-46`), which is Turbopack `next build` — and Turbopack rejects the junctioned `node_modules`. The `build:safe` gate immediately above already produced `.next`.

If a panel renders blank rather than an empty state, the fixture shape has drifted from the endpoint — reconcile both mock files before assuming a component bug.

- [ ] **Behavioral pass on the running app**

With the app running, load `/admin` and confirm:

1. The discipline switcher changes the numbers in the panels **below it**, and its caption correctly says the cohort totals above are unfiltered
2. Weakest topics reflect real OSCE/flashcard performance — bar lengths match their printed counts, and each readout shows its denominator ("3 of 40"), not a bare rate
3. Low-confidence groups sort **below** confident ones and are visibly marked
4. `discipline=all` renders **two labelled sections** (OA & PSA, then OT), never one blended ranking
5. Metrics with no data render as "—"/"no data", never `0`; the flashcard panel says "no flashcard data yet" until Task 1's fix has been live long enough to accrue rows
6. A forced backend failure renders an error panel with a working retry — never a zero
7. Token usage shows the full total, and reads "≥" only if the paginator actually hit its ceiling
8. The retired feed-derived KPIs are gone, with no duplicate or contradictory OSCE figure anywhere on the page

- [ ] **Confirm the flashcard writer is actually recording**

Task 1's fix is invisible in the UI. After it ships, complete one flashcard deck in the running app, then confirm rows landed:

```bash
python -c "import asyncio,sys; sys.path.insert(0,'.'); from tools.shared import db; print(asyncio.run(db.get_flashcard_attempts('<your_student_id>'))[:3])"
```

Expected: at least one attempt row carrying a real `topic_tag`. An empty list means the payload still isn't carrying the field — re-check `frontend/src/hooks/useFlashcards.ts` and the push site before moving on. This is the one defect in this plan that fails silently in production.

- [ ] **Push**

```bash
git fetch origin && git merge-base --is-ancestor origin/main HEAD && git push origin HEAD:main
```

If the ancestor check fails, `origin/main` moved — rebase onto it and re-run the gates before pushing. Never force-push: concurrent sessions share this remote.
