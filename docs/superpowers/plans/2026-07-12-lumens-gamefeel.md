# Lumens & Game-Feel Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify all in-app currency into one game coin ("Lumens"), give flashcards a neon-red pause/quit flow with a real coin penalty, replace weak achievement toasts with big image reward banners across tutor/flashcards/OSCE, add a homepage Lumens-badge card, and remove the daily earning cap.

**Architecture:** Reskin the existing single `xp` balance as "Lumens" in the UI (no DB column rename) and add a monotonic `coins_earned` lifetime column so forfeits can lower rank without stealing earned badges. A single client-derived reward queue (provider mounted app-wide) watches `/api/progress` deltas for level/streak/Lumens-badge unlocks and takes explicit enqueues for moment-based achievements; one `<RewardBanner>` shows at a time. OSCE joins the economy by awarding Lumens scaled to its final grade.

**Tech Stack:** FastAPI + Python 3.12 (pytest, MOCK_MODE), Supabase; Next.js 16 App Router + React 19 + TanStack Query + motion/react; Nano-Banana flash (`gemini-3.1-flash-image`) generators with placeholder-first scaffolds.

**Spec:** `docs/superpowers/specs/2026-07-12-lumens-gamefeel-design.md`

**Convention note:** This project uses pytest for backend TDD and, for the frontend, `npm run typecheck` + `npm run build` + the aurora visual harness + a behavioral verify (there is no frontend unit-test runner). Backend tasks below follow strict red→green TDD; frontend tasks verify via typecheck/build/harness/behavioral checks, and pure TS logic is kept small and obvious.

**Scope note:** Considered splitting into 5 sub-plans (foundation / pause / rewards / home / art). Kept as one plan because every module depends on the M0 currency foundation and the reward queue; phases below are ordered so each ends at a green, committable state.

---

## File Structure

**Backend (create):**
- `tools/db/migrations/009_lumens.sql` — add `coins_earned` column.
- `tests/api/test_lumens.py` — forfeit endpoint + OSCE award formula tests.
- `tests/profile/test_coins_earned.py` — `update_profile` lifetime-counter tests.
- `tools/rewards/__init__.py`, `tools/rewards/lumen_badge_art.py`, `tools/rewards/generate_lumen_badges.py`, `tools/rewards/banner_art.py`, `tools/rewards/generate_reward_banners.py`, `tools/rewards/make_reward_placeholders.py` — art pipeline.

**Backend (modify):**
- `tools/profile/update_profile.py` — increment `coins_earned` on positive delta.
- `tools/profile/get_profile.py` — default `coins_earned`.
- `tools/progress/get_progress.py` — expose `coins_earned` (fallback to `xp`).
- `tools/api/routers/student.py` — `/api/flashcards/forfeit`; relax complete clamp 500→5000.
- `tools/api/routers/cases.py` — `osce_lumens()` + award + response field.
- `tests/api/test_flashcards_complete.py` — update clamp expectation.

**Frontend (create):**
- `frontend/src/aurora/components/Lumen.tsx` — `<Lumen>` SVG coin + `<LumenCount>`.
- `frontend/src/aurora/components/flashcards/PauseMenu.tsx` — pause/quit modal.
- `frontend/src/aurora/components/home/lumenBadges.ts`, `LumenBadge.tsx`, `LumenLadder.tsx` — Lumens vault card.
- `frontend/src/aurora/rewards/types.ts`, `catalog.ts`, `store.ts`, `achieve.ts`, `useRewards.ts`, `RewardBanner.tsx`, `RewardProvider.tsx` — reward banner system.

**Frontend (modify):**
- `frontend/src/hooks/useProgress.ts` — `coins_earned` field.
- `frontend/src/hooks/useFlashcards.ts` — `useFlashcardForfeit`.
- `frontend/src/aurora/components/flashcards/FlashShell.tsx` — Pause/Home control, drop AchievementManager.
- `frontend/src/aurora/screens/Flashcards.tsx` — pause state, quit/forfeit, achievements, Lumens labels.
- `frontend/src/aurora/screens/Tutor.tsx` — remove chat cap, wire achievements.
- `frontend/src/aurora/screens/CaseSession.tsx` — OSCE achievements + Lumens banner.
- `frontend/src/aurora/screens/Dashboard.tsx` — swap WeekStats → LumenLadder.
- `frontend/src/app/providers.tsx` — mount `<RewardProvider>`.
- `frontend/src/lib/legacy/gamification.ts` — remove `CHAT_XP_DAILY_CAP`.
- `frontend/src/aurora/aurora.css` — `.flash-pause`, `.flash-pausewrap`/`-card`/`-btn`, `.rw-*` styles.
- `frontend/tests/aurora_assert.mjs` — assert Lumens vault card.
- `docs/design-locks.md` — flashcards + home lock amendments.

**Frontend (delete):**
- `frontend/src/aurora/components/home/WeekStats.tsx`.
- `frontend/src/screens/AchievementToast.tsx` (after all references removed).

---

# Phase 1 — Backend Lumens foundation

### Task 1: Migration — add `coins_earned` column

**Files:**
- Create: `tools/db/migrations/009_lumens.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 009_lumens.sql — lifetime Lumens counter (monotonic). The `xp` column stays the
-- spendable balance (relabelled "Lumens" in the UI); coins_earned only ever increases,
-- so a quit-penalty that lowers the balance never removes an earned home badge.
-- Two statements; no IF NOT EXISTS on the constraint (Postgres 42601).
ALTER TABLE student_profiles ADD COLUMN coins_earned bigint NOT NULL DEFAULT 0;
ALTER TABLE student_profiles ADD CONSTRAINT student_profiles_coins_earned_nonneg CHECK (coins_earned >= 0);
```

- [ ] **Step 2: Lint + get paste-ready SQL** via the `/db-migrate` skill (never paste a file path into the Supabase SQL editor). Apply in the Supabase SQL editor when coordinating the deploy.

- [ ] **Step 3: Ledger it** — append a row to `tools/db/migrations/APPLIED.md` noting 009 and the date applied.

- [ ] **Step 4: Commit**

```bash
git add tools/db/migrations/009_lumens.sql tools/db/migrations/APPLIED.md
git commit -m "$(cat <<'EOF'
feat(db): migration 009 — coins_earned lifetime Lumens counter

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `update_profile` increments `coins_earned`

**Files:**
- Modify: `tools/profile/update_profile.py:167-173` (inside the xp block)
- Modify: `tools/profile/get_profile.py:34-43` (defaults)
- Test: `tests/profile/test_coins_earned.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/profile/test_coins_earned.py
import pytest


@pytest.mark.asyncio
async def test_coins_earned_increments_on_positive_delta(monkeypatch):
    from tools.profile import update_profile as mod
    writes = []

    async def _get(_sid):
        return {"xp": 100, "coins_earned": 100, "hearts": 5}
    async def _upd(_sid, **k):
        writes.append(k)

    monkeypatch.setattr(mod, "get_profile", _get)
    monkeypatch.setattr(mod.db, "update_profile", _upd)

    await mod.update_profile("s1", xp_delta=30)
    assert any(w.get("coins_earned") == 130 for w in writes)


@pytest.mark.asyncio
async def test_coins_earned_untouched_on_penalty(monkeypatch):
    from tools.profile import update_profile as mod
    writes = []

    async def _get(_sid):
        return {"xp": 100, "coins_earned": 100, "hearts": 5}
    async def _upd(_sid, **k):
        writes.append(k)

    monkeypatch.setattr(mod, "get_profile", _get)
    monkeypatch.setattr(mod.db, "update_profile", _upd)

    await mod.update_profile("s1", xp_delta=-20)
    assert all("coins_earned" not in w for w in writes)
    assert any(w.get("xp") == 80 for w in writes)  # balance decremented + floored
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/profile/test_coins_earned.py -q`
Expected: FAIL — `coins_earned` never written on the positive-delta test.

- [ ] **Step 3: Add the increment** in `tools/profile/update_profile.py`, inside the `if xp_delta != 0 or hearts_used != 0:` block, immediately after the `xp_today` try/except (currently ending at line 173, before the outer `except` at line 174):

```python
            # coins_earned (lifetime Lumens, monotonic) — drives the home Lumens
            # badge tiers. Only ever increases (never on a forfeit/penalty), and a
            # separate guarded call so a missing column (pre-migration 009) never
            # breaks the xp write above.
            earned_gain = max(0, xp_delta + streak_bonus)
            if earned_gain > 0:
                try:
                    current_earned = int(profile.get("coins_earned") or 0)
                    await db.update_profile(student_id, coins_earned=current_earned + earned_gain)
                except Exception as exc:
                    log("coins_earned_write_error", student_id=student_id, feature="gamification", detail=str(exc))
```

Then add the default in `tools/profile/get_profile.py` `_DEFAULTS` (after the `"xp": 0,` line at line 34):

```python
    "coins_earned": 0,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/profile/test_coins_earned.py -q`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add tools/profile/update_profile.py tools/profile/get_profile.py tests/profile/test_coins_earned.py
git commit -m "$(cat <<'EOF'
feat(profile): track lifetime coins_earned (Lumens), up-only

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `/api/progress` exposes `coins_earned`

**Files:**
- Modify: `tools/progress/get_progress.py:102-126`
- Test: `tests/profile/test_coins_earned.py` (add one)

- [ ] **Step 1: Write the failing test** (append to `tests/profile/test_coins_earned.py`)

```python
@pytest.mark.asyncio
async def test_progress_returns_coins_earned_with_xp_fallback(monkeypatch):
    from tools.progress import get_progress as mod

    async def _get(_sid):
        return {"xp": 340, "hearts": 5, "streak": 0}  # no coins_earned column yet
    async def _sessions(_sid, limit=30):
        return []

    monkeypatch.setattr(mod, "get_profile", _get)
    monkeypatch.setattr(mod.db, "get_sessions", _sessions)

    data = await mod.get_progress("s1")
    assert data["coins_earned"] == 340  # falls back to xp pre-migration
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/profile/test_coins_earned.py::test_progress_returns_coins_earned_with_xp_fallback -q`
Expected: FAIL — `KeyError: 'coins_earned'`.

- [ ] **Step 3: Add the field** in `tools/progress/get_progress.py`. After line 103 (`hearts = ...`) add:

```python
    # Lifetime Lumens for the home vault badges. Falls back to the current balance
    # (xp) when the column is absent (pre-migration 009) — before any forfeit,
    # lifetime ≈ balance, so the badge card looks correct during the transition.
    coins_earned = int(profile.get("coins_earned") or 0) or xp
```

Then add `"coins_earned": coins_earned,` to the returned dict (after `"xp": xp,` at line 116).

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/profile/test_coins_earned.py -q`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add tools/progress/get_progress.py tests/profile/test_coins_earned.py
git commit -m "$(cat <<'EOF'
feat(progress): expose coins_earned (fallback to xp pre-migration)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `/api/flashcards/forfeit` endpoint

**Files:**
- Modify: `tools/api/routers/student.py` (after `flashcards_complete`, ~line 458)
- Test: `tests/api/test_lumens.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_lumens.py
import pytest
from httpx import AsyncClient, ASGITransport
from tools.api.server import app
from tests.api.conftest import auth_headers


@pytest.mark.asyncio
async def test_forfeit_deducts_flat_penalty(monkeypatch):
    from tools.api.routers import student as mod
    applied = []

    async def _update_profile(_sid, **k):
        applied.append(k.get("xp_delta"))
    async def _profile(_sid):
        return {"xp": 80}

    monkeypatch.setattr(mod, "update_profile", _update_profile)
    monkeypatch.setattr(mod, "get_profile", _profile)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        r = await ac.post("/api/flashcards/forfeit", headers=auth_headers(role="OA"))
    assert r.status_code == 200
    assert applied == [-20]           # server owns the penalty amount
    assert r.json()["xp"] == 80       # new balance echoed back
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/api/test_lumens.py::test_forfeit_deducts_flat_penalty -q`
Expected: FAIL — 404 (route not defined).

- [ ] **Step 3: Add the endpoint** in `tools/api/routers/student.py`, immediately after the `flashcards_complete` function (after line 457):

```python
FORFEIT_PENALTY = 20  # Lumens deducted when a student quits a flashcard game mid-deck.


@router.post("/api/flashcards/forfeit", response_model=FlashcardCompleteResponse)
@limiter.limit("30/minute")
async def flashcards_forfeit(request: Request, current_user: CurrentUser = Depends(get_current_user)):
    """Quit-mid-deck penalty. The server owns the flat Lumens deduction (the client is
    never trusted for the amount). update_profile floors the balance at 0 and leaves the
    lifetime coins_earned counter untouched, so an earned badge is never lost."""
    student_id = current_user["sub"]
    try:
        await update_profile(student_id, xp_delta=-FORFEIT_PENALTY)
    except Exception:
        pass
    try:
        profile = await get_profile(student_id)
        xp = int(profile.get("xp") or 0)
    except Exception:
        xp = 0
    return FlashcardCompleteResponse(xp=xp, level=(xp // 500) + 1)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/api/test_lumens.py -q`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit**

```bash
git add tools/api/routers/student.py tests/api/test_lumens.py
git commit -m "$(cat <<'EOF'
feat(api): POST /api/flashcards/forfeit — quit penalty (-20 Lumens)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Relax the per-request flashcards clamp 500 → 5000

**Files:**
- Modify: `tools/api/routers/student.py:432`
- Modify: `tests/api/test_flashcards_complete.py:50`

- [ ] **Step 1: Update the existing test** — change the expectation in `test_complete_clamps_oversized_xp` (line 50) from `500` to `5000`:

```python
    assert xp_applied == [5000]  # tampered payload clamped to the per-request ceiling
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/api/test_flashcards_complete.py::test_complete_clamps_oversized_xp -q`
Expected: FAIL — still clamps to 500.

- [ ] **Step 3: Raise the clamp** in `tools/api/routers/student.py:432`:

```python
    # Clamp client-supplied XP per request — a single deck can't legitimately earn
    # this much, so a bound stops a tampered payload inflating the balance. This is a
    # per-REQUEST anti-abuse ceiling, never a daily cap (there is no daily cap).
    xp_delta = max(0, min(body.xp_delta, 5000))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/api/test_flashcards_complete.py -q`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add tools/api/routers/student.py tests/api/test_flashcards_complete.py
git commit -m "$(cat <<'EOF'
feat(api): raise per-request flashcards Lumens clamp 500->5000 (no daily cap)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: OSCE awards Lumens scaled to the final grade

**Files:**
- Modify: `tools/api/routers/cases.py` — add `osce_lumens()`, award, response field
- Test: `tests/api/test_lumens.py` (add one)

- [ ] **Step 1: Write the failing test** (append to `tests/api/test_lumens.py`)

```python
def test_osce_lumens_scales_with_grade():
    from tools.api.routers.cases import osce_lumens
    assert osce_lumens(100) == 200
    assert osce_lumens(60) == 120
    assert osce_lumens(0) == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/api/test_lumens.py::test_osce_lumens_scales_with_grade -q`
Expected: FAIL — `ImportError: cannot import name 'osce_lumens'`.

- [ ] **Step 3: Add the pure formula + wire it** in `tools/api/routers/cases.py`.

Add the module-level formula (near the other module constants, above `case_submit`):

```python
OSCE_LUMEN_FACTOR = 2  # Lumens per point of the final station grade (0-100 -> 0-200).


def osce_lumens(score_100: int) -> int:
    """Lumens awarded for a completed OSCE station, scaled to the final grade."""
    return round(max(0, min(100, int(score_100))) * OSCE_LUMEN_FACTOR)
```

Add `lumens_awarded: int = 0` to the `CaseSubmitResponse` model (find `class CaseSubmitResponse(BaseModel):` near the top of the file and add the field).

In `case_submit`, replace the profile-update block at lines 842-844 so it also awards Lumens:

```python
        award = osce_lumens(score["score_100"])
        await update_profile(
            student_id, topic=case["topic"], score=score["score_100"] / 100,
            new_missed_findings=missed, xp_delta=award,
        )
```

Add `lumens_awarded=award` to the `CaseSubmitResponse(...)` return (line 896). Because `award` is defined inside the `try` block, initialise it just before that `try` (before line 835):

```python
    award = 0
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/api/test_lumens.py -q`
Expected: PASS (2 passed)

- [ ] **Step 5: Full backend gate**

Run: `python -m pytest -q`
Expected: PASS (no regressions).

- [ ] **Step 6: Commit**

```bash
git add tools/api/routers/cases.py tests/api/test_lumens.py
git commit -m "$(cat <<'EOF'
feat(osce): award Lumens scaled to final station grade (round(score*2))

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

# Phase 2 — Remove the daily earning cap

### Task 7: Delete `CHAT_XP_DAILY_CAP`

**Files:**
- Modify: `frontend/src/lib/legacy/gamification.ts:40-68`
- Modify: `frontend/src/aurora/screens/Tutor.tsx` (chat XP grant + cap toast) — completed in Task 17; this task only removes the cap primitive and makes `addChatXp` uncapped.

- [ ] **Step 1: Make `addChatXp` uncapped** — replace lines 40-68 of `frontend/src/lib/legacy/gamification.ts` with:

```ts
/** Award chat XP (Lumens). No daily cap — friendly competition is unlimited. Kept as a
 *  thin wrapper so existing callers stay unchanged; returns the amount granted. */
export function addChatXp(amount: number): number {
  const grant = Math.max(0, amount);
  if (grant > 0) addXP(grant);
  return grant;
}
```

(This removes `CHAT_XP_DAILY_CAP`, `chatXpKey`, and `getChatXpToday`. If typecheck later flags a remaining import of any of these, remove that import — the only consumer is `Tutor.tsx`, handled in Task 17.)

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS (or a single error in `Tutor.tsx` referencing removed symbols — fixed in Task 17; if it blocks, do Task 17's Tutor edit now).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/legacy/gamification.ts
git commit -m "$(cat <<'EOF'
feat(gamification): remove daily chat XP cap (unlimited Lumens earning)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

# Phase 3 — Lumens visual identity

### Task 8: `<Lumen>` SVG coin + `<LumenCount>`

**Files:**
- Create: `frontend/src/aurora/components/Lumen.tsx`

- [ ] **Step 1: Write the component**

```tsx
/* Lumen — the single app-wide game coin: a gold disc with an engraved iris + pupil.
   Inline SVG so it stays crisp and tintable at every size. Used in the flashcards HUD,
   home, leaderboard, tutor, and reward banners. */

export function Lumen({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} role="img" aria-label="Lumens" fill="none">
      <defs>
        <radialGradient id="lm-face" cx="38%" cy="34%" r="75%">
          <stop offset="0%" stopColor="#ffe98a" />
          <stop offset="55%" stopColor="#ffd21e" />
          <stop offset="100%" stopColor="#e6a900" />
        </radialGradient>
        <radialGradient id="lm-iris" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#7fd8ff" />
          <stop offset="70%" stopColor="#1f8fd0" />
          <stop offset="100%" stopColor="#0b5c8a" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill="url(#lm-face)" stroke="#b9820a" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="11.5" fill="none" stroke="#b9820a" strokeOpacity="0.55" strokeWidth="1" />
      <ellipse cx="16" cy="16" rx="9.5" ry="6.4" fill="#fff8dd" />
      <circle cx="16" cy="16" r="5.4" fill="url(#lm-iris)" />
      <circle cx="16" cy="16" r="2.4" fill="#0a2233" />
      <circle cx="13.9" cy="13.9" r="1.1" fill="#fff" fillOpacity="0.9" />
    </svg>
  );
}

export function LumenCount({ value, size = 16, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontVariantNumeric: "tabular-nums" }}>
      <Lumen size={size} /> {value.toLocaleString()}
    </span>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/Lumen.tsx
git commit -m "$(cat <<'EOF'
feat(ui): Lumen coin SVG (engraved iris) + LumenCount

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Relabel currency surfaces to "Lumens"

**Files:**
- Modify: flashcards components (`McqCard.tsx`, `Payoff.tsx`, `ResultsScreen.tsx`, `StudyStage.tsx`), `frontend/src/aurora/screens/Dashboard.tsx`, `frontend/src/aurora/components/home/GreetingHero.tsx`, leaderboard (`TierBand.tsx`, `LeaderboardRow.tsx`), `frontend/src/aurora/screens/Tutor.tsx`.

- [ ] **Step 1: Find every user-visible currency word**

Run (via Grep, not shell): search pattern `points|\bXP\b|Charge up|Banking` across `frontend/src/aurora/`.
Expected: hits in the flashcards HUD (`McqCard.tsx` "XP"/"Charge up"/"Banking…"), `Payoff.tsx` ("points"), `ResultsScreen.tsx`, home/leaderboard.

- [ ] **Step 2: Replace visible currency words with "Lumens" + the coin icon.** For each hit, change the user-facing word to `Lumens` and, where a number is shown, render the coin with it. Examples of the exact substitutions:

- `McqCard.tsx` meter labels: `XP` → `Lumens`; keep `Charge up` / `Banking…` (they are meter states, not the currency name) but change any literal `XP` in them.
- `Payoff.tsx` payoff line: `+{n} points` → render `+{n}` next to `<Lumen size={18} />` (import `import { Lumen } from "@/aurora/components/Lumen";`), e.g.:

```tsx
<span className="flash-payoff-pts"><Lumen size={18} /> +{pts}</span>
```

- `Dashboard.tsx`: the XP-in-level chip/bar copy — leave the number, relabel any `XP` word to `Lumens`; where the balance is shown, use `<Lumen size={14} />`. Keep `xpInLevel`/`xpToNext` variable names (internal).
- Leaderboard `TierBand.tsx`: `{tier.min.toLocaleString()}+ XP` → `{tier.min.toLocaleString()}+ Lumens`.
- `LeaderboardRow.tsx`: the XP column value — prefix with `<Lumen size={14} />`.

Do NOT rename internal variables/props (`xp`, `xpToNext`, `xp_delta`) — only the visible strings.

- [ ] **Step 3: Typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/aurora
git commit -m "$(cat <<'EOF'
feat(ui): relabel XP/points/score currency to Lumens with coin icon

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

# Phase 4 — Flashcards pause / quit

### Task 10: Neon-red Pause button CSS + FlashShell control

**Files:**
- Modify: `frontend/src/aurora/aurora.css` (near the `.flash-exit` rules ~line 2345)
- Modify: `frontend/src/aurora/components/flashcards/FlashShell.tsx`

- [ ] **Step 1: Add the button CSS** to `frontend/src/aurora/aurora.css` (after the existing `.flash-exit` block):

```css
/* Neon-red arcade PAUSE — chunky "toy button" tactility (mirrors .flash-advance):
   hard drop shadow that collapses on press, plus a red glow. */
.flash-pause {
  position: absolute; top: 16px; left: 16px; z-index: 6;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 9px 16px; border: none; border-radius: 999px;
  font: 800 0.8rem/1 var(--font-display, inherit); letter-spacing: .06em; text-transform: uppercase;
  color: #fff; cursor: pointer;
  background: linear-gradient(180deg, #ff6b62, var(--fc-red));
  box-shadow: 0 5px 0 var(--fc-red-d), 0 12px 26px -8px rgba(255,59,48,.55);
}
.flash-pause:active { transform: translateY(3px); box-shadow: 0 2px 0 var(--fc-red-d), 0 6px 14px -8px rgba(255,59,48,.5); }
.flash-pause-bars { display: inline-flex; gap: 3px; }
.flash-pause-bars i { width: 3px; height: 12px; border-radius: 1px; background: #fff; display: block; }
```

- [ ] **Step 2: Swap Exit → Pause/Home in FlashShell** — replace the whole `FlashShell.tsx` file with:

```tsx
"use client";
/* FlashShell — the immersive dark-arcade root shared by the setup, loading, and study
   states. Defined at module scope so the recall textarea never remounts on a parent
   re-render. Carries the sr-only h1, the top-left control (neon Pause during a game,
   quiet Home pill otherwise), and a subtle mute toggle. */
import type { ReactNode, CSSProperties } from "react";
import { Icon } from "@/aurora/icons";
import { EngravingField } from "./EngravingField";
import { BrownianField } from "./BrownianField";
import { useFlashMute } from "./useFlashFx";
import { CoBrand } from "@/aurora/components/CoBrand";

export function FlashShell({
  onExit, onPause, topicHue, engraved = false, children,
}: {
  onExit: () => void;
  /** When set, the top-left control is a neon PAUSE button (active game). When
   *  omitted, it's a quiet "Home" pill (selection / results — nothing to pause). */
  onPause?: () => void;
  topicHue?: number;
  engraved?: boolean;
  children: ReactNode;
}) {
  const [muted, toggleMute] = useFlashMute();
  return (
    <div className="flash-root" style={topicHue != null ? ({ "--flash-topic-hue": topicHue } as CSSProperties) : undefined}>
      <h1 className="sr-only">Flashcards</h1>
      {onPause ? (
        <button type="button" className="flash-pause flash-press" data-testid="flash-pause" aria-label="Pause game" onClick={onPause}>
          <span className="flash-pause-bars" aria-hidden><i /><i /></span> Pause
        </button>
      ) : (
        <button type="button" className="flash-exit flash-press" data-testid="flash-exit" onClick={onExit}>
          <Icon.back size={16} /> Home
        </button>
      )}
      <CoBrand dark className="flash-cobrand" />

      {engraved && (
        <button type="button" className="flash-mute" data-testid="flash-mute"
          aria-pressed={muted} aria-label={muted ? "Unmute sound" : "Mute sound"} onClick={toggleMute}>
          {muted ? <Icon.mute size={15} /> : <Icon.sound size={15} />}
        </button>
      )}
      {engraved && <BrownianField />}
      {engraved && <EngravingField />}
      <div className="flash-content">{children}</div>
    </div>
  );
}
```

(This drops the `AchievementManager` mount + its `newAchievements`/`onDismissAchievement` props — the global `RewardProvider` replaces it. `Flashcards.tsx` never passed them, so no caller breaks.)

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: an error in `Flashcards.tsx` (the `onExit`-only call sites are fine; `onPause` is optional). If typecheck is clean, good; the pause wiring lands in Task 12.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/aurora/aurora.css frontend/src/aurora/components/flashcards/FlashShell.tsx
git commit -m "$(cat <<'EOF'
feat(flashcards): neon-red Pause control in FlashShell (Home pill fallback)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: PauseMenu modal component + CSS

**Files:**
- Create: `frontend/src/aurora/components/flashcards/PauseMenu.tsx`
- Modify: `frontend/src/aurora/aurora.css`

- [ ] **Step 1: Write the component**

```tsx
"use client";
/* PauseMenu — the dark-arcade pause overlay. Two beats: the menu (Resume / Switch deck /
   Quit) and a quit-confirm with the Lumens-loss warning. The full-cover scrim blocks taps
   to the study card, freezing the (tap-driven) loop while open. */
import { useEffect, useState } from "react";

export function PauseMenu({ open, onResume, onSwitch, onQuit }: {
  open: boolean;
  onResume: () => void;
  onSwitch: () => void;
  onQuit: () => void;
}) {
  const [confirmQuit, setConfirmQuit] = useState(false);

  useEffect(() => { if (!open) setConfirmQuit(false); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onResume(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onResume]);

  if (!open) return null;

  return (
    <div className="flash-pausewrap" role="dialog" aria-modal="true" aria-label="Game paused"
      data-testid="flash-pausemenu"
      onClick={(e) => { if (e.target === e.currentTarget) onResume(); }}>
      <div className="flash-pausecard">
        {!confirmQuit ? (
          <>
            <p className="flash-pause-h">PAUSED</p>
            <p className="flash-pause-sub">Catch your breath — the deck will wait.</p>
            <button type="button" className="flash-pausebtn is-go flash-press" onClick={onResume}>Resume</button>
            <button type="button" className="flash-pausebtn flash-press" onClick={onSwitch}>Switch deck</button>
            <button type="button" className="flash-pausebtn is-quit flash-press"
              data-testid="flash-quit" onClick={() => setConfirmQuit(true)}>Quit game</button>
          </>
        ) : (
          <>
            <p className="flash-pause-h">Quit for real?</p>
            <p className="flash-pause-sub">
              You&rsquo;ll forfeit this round&rsquo;s Lumens and lose 20 from your stash — and your rank feels it. No take-backs.
            </p>
            <button type="button" className="flash-pausebtn is-quit flash-press"
              data-testid="flash-quit-confirm" onClick={onQuit}>Quit &amp; take the hit</button>
            <button type="button" className="flash-pausebtn is-go flash-press" onClick={() => setConfirmQuit(false)}>Keep playing</button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the CSS** to `frontend/src/aurora/aurora.css` (in the flashcards section):

```css
/* PauseMenu — dark-arcade overlay (matches the CommandPalette dialog pattern, --fc- tokens). */
.flash-pausewrap {
  position: fixed; inset: 0; z-index: 240;
  display: flex; align-items: center; justify-content: center;
  background: rgba(6, 9, 14, .72); backdrop-filter: blur(6px);
  animation: rw-fade .18s ease-out;
}
.flash-pausecard {
  width: min(360px, 88vw); padding: 26px 22px;
  display: flex; flex-direction: column; gap: 12px; text-align: center;
  background: linear-gradient(180deg, #1b2636, #0e131c);
  border: 1px solid rgba(255,255,255,.10); border-radius: 22px;
  box-shadow: 0 30px 80px -20px rgba(0,0,0,.7);
  color: var(--fc-ink, #eff4fa);
}
.flash-pause-h { font: 900 1.5rem/1 var(--font-display, inherit); letter-spacing: .04em; }
.flash-pause-sub { font-size: .86rem; line-height: 1.5; color: rgba(239,244,250,.72); margin-bottom: 4px; }
.flash-pausebtn {
  padding: 13px 16px; border: 1px solid rgba(255,255,255,.14); border-radius: 14px;
  font: 800 .92rem/1 var(--font-display, inherit); letter-spacing: .02em; cursor: pointer;
  color: var(--fc-ink, #eff4fa); background: rgba(255,255,255,.06);
}
.flash-pausebtn.is-go {
  color: #06210f; border: none;
  background: linear-gradient(180deg, #5cf07a, var(--fc-green)); box-shadow: 0 4px 0 var(--fc-green-d);
}
.flash-pausebtn.is-quit {
  color: #fff; border: none;
  background: linear-gradient(180deg, #ff6b62, var(--fc-red)); box-shadow: 0 4px 0 var(--fc-red-d);
}
.flash-pausebtn.is-go:active, .flash-pausebtn.is-quit:active { transform: translateY(2px); box-shadow: none; }
@keyframes rw-fade { from { opacity: 0 } to { opacity: 1 } }
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS (component is standalone until wired in Task 12).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/aurora/components/flashcards/PauseMenu.tsx frontend/src/aurora/aurora.css
git commit -m "$(cat <<'EOF'
feat(flashcards): PauseMenu modal (resume / switch deck / quit-with-warning)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Wire pause + quit-forfeit into Flashcards + forfeit hook

**Files:**
- Modify: `frontend/src/hooks/useFlashcards.ts` (add `useFlashcardForfeit`)
- Modify: `frontend/src/aurora/screens/Flashcards.tsx`

- [ ] **Step 1: Add the forfeit mutation** to `frontend/src/hooks/useFlashcards.ts` (after `useFlashcardComplete`):

```ts
/** Quit-mid-deck penalty: server deducts a flat 20 Lumens; refresh progress after. */
export function useFlashcardForfeit() {
  const qc = useQueryClient();
  return useMutation<CompleteResponse, Error, void>({
    mutationFn: async () => {
      const res = await fetch("/api/flashcards/forfeit", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Forfeit failed");
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["progress"] }); },
  });
}
```

- [ ] **Step 2: Wire pause state in `Flashcards.tsx`.** Add the import + hook and pause state:

Add to imports:
```tsx
import { PauseMenu } from "@/aurora/components/flashcards/PauseMenu";
```
Change the complete hook line to also pull forfeit:
```tsx
import {
  useFlashcards, useFlashcardTopics, useReasonCheck, useFlashcardComplete, useFlashcardForfeit,
  type FlashcardItem, type CompleteCardResult,
} from "@/hooks/useFlashcards";
```
After `const { mutate: complete } = useFlashcardComplete();` (line 52) add:
```tsx
  const { mutate: forfeit } = useFlashcardForfeit();
  const [paused, setPaused] = useState(false);
```
After `const exit = () => router.push("/dashboard");` (line 201) add:
```tsx
  const quitForfeit = () => { forfeit(); router.push("/dashboard"); };
  const switchDeck = () => { setPaused(false); newDeck(); };
```

- [ ] **Step 3: Show Pause on the active-game shells + render the menu.** In the **study loop** return (line 257-268) change the shell to pass `onPause` and render the menu:

```tsx
  return (
    <FlashShell onExit={exit} onPause={() => setPaused(true)} topicHue={stageHue} engraved>
      <StudyStage
        key={deckEpoch}
        card={card} idx={idx} total={total} topicLabel={labelForTag(card.tag)}
        reasonNote={reasonNotesRef.current[card.id] ?? null} combo={combo}
        score={scoreShown}
        onCheck={onCheck} onReason={onReason} onAdvance={advance} advanceLabel={advanceLabel}
      />
      {burst && <ComboBurst key={burst.key} combo={burst.combo} onDone={() => setBurst(null)} />}
      <PauseMenu open={paused} onResume={() => setPaused(false)} onSwitch={switchDeck} onQuit={quitForfeit} />
    </FlashShell>
  );
```

Leave the **intro** (line 221), **selection** (line 206), **loading** (line 230), and **results** (line 249) shells with `onExit` only (they render the quiet Home pill — the study loop is the only phase with a running game to pause).

- [ ] **Step 4: Typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useFlashcards.ts frontend/src/aurora/screens/Flashcards.tsx
git commit -m "$(cat <<'EOF'
feat(flashcards): pause menu + quit-forfeit (-20 Lumens) wired into study loop

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

# Phase 5 — Reward banner system

### Task 13: Reward types + catalog

**Files:**
- Create: `frontend/src/aurora/rewards/types.ts`
- Create: `frontend/src/aurora/rewards/catalog.ts`

- [ ] **Step 1: Write `types.ts`**

```ts
export type RewardKind = "achievement" | "streak-badge" | "lumen-badge" | "level-up";

export interface Reward {
  id: string;        // stable unique unlock id — dedupes the queue
  kind: RewardKind;
  title: string;
  subtitle: string;
  art: string;       // banner backdrop art path
  medal?: string;    // optional medallion overlay (badge unlocks)
  lumens?: number;   // optional Lumen amount to show
}
```

- [ ] **Step 2: Write `catalog.ts`** (moment-based achievements — one-time unlocks, deduped by the achievements set; the cumulative-count achievements from the spec are deferred as YAGNI)

```ts
export type Feature = "flashcards" | "tutor" | "osce";

export interface AchievementDef { id: string; title: string; subtitle: string; feature: Feature; }

export const ACHIEVEMENTS: Record<string, AchievementDef> = {
  first_deck:       { id: "first_deck",       title: "First Deck Down",    subtitle: "You cleared your very first deck.",       feature: "flashcards" },
  perfect_deck:     { id: "perfect_deck",     title: "Flawless!",          subtitle: "A perfect deck — every card correct.",    feature: "flashcards" },
  combo_godlike:    { id: "combo_godlike",    title: "GODLIKE Combo",      subtitle: "You hit a ×4 combo. Unstoppable.",         feature: "flashcards" },
  first_chat:       { id: "first_chat",       title: "First Question",     subtitle: "You started your first tutor session.",   feature: "tutor" },
  first_station:    { id: "first_station",    title: "First Patient",      subtitle: "You finished your first OSCE station.",    feature: "osce" },
  station_pass:     { id: "station_pass",     title: "Station Passed",     subtitle: "You passed an OSCE station. Clean work.",  feature: "osce" },
  flawless_station: { id: "flawless_station", title: "Perfect Station",    subtitle: "100/100, safe, nothing missed.",           feature: "osce" },
};

const FEATURE_ART: Record<Feature, string> = {
  flashcards: "/brand/reward-banners/achievement-flashcards.webp",
  tutor:      "/brand/reward-banners/achievement-tutor.webp",
  osce:       "/brand/reward-banners/achievement-osce.webp",
};

export const LEVELUP_ART = "/brand/reward-banners/level-up.webp";
export const BADGE_ART = "/brand/reward-banners/badge-unlock.webp";

export function achievementArt(feature: Feature): string { return FEATURE_ART[feature]; }
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/aurora/rewards/types.ts frontend/src/aurora/rewards/catalog.ts
git commit -m "$(cat <<'EOF'
feat(rewards): reward types + achievement catalog

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Reward store (per-student high-water marks)

**Files:**
- Create: `frontend/src/aurora/rewards/store.ts`

- [ ] **Step 1: Write `store.ts`** (tier marks and the achievements set are separate keys so moment-based grants can never corrupt the tier-diff baseline)

```ts
/* Per-student reward memory (localStorage), split into two keys:
   - tier high-water mark (level / streak tier / lumen tier) — the watcher's baseline
   - achievements set — moment-based one-time unlocks
   Keyed by studentId so accounts never bleed on a shared device. */

export interface TierMark { level: number; streakTier: number; lumenTier: number; }

const tierKey = (sid: string) => `eyebot_rw_tiers_${sid || "anon"}`;
const achKey = (sid: string) => `eyebot_rw_ach_${sid || "anon"}`;

/** Returns null when unseeded on this device (so the watcher baselines silently). */
export function loadTierMark(sid: string): TierMark | null {
  try {
    const v = localStorage.getItem(tierKey(sid));
    return v ? JSON.parse(v) as TierMark : null;
  } catch { return null; }
}

export function saveTierMark(sid: string, m: TierMark): void {
  try { localStorage.setItem(tierKey(sid), JSON.stringify(m)); } catch { /* ignore */ }
}

export function loadAch(sid: string): string[] {
  try {
    const v = localStorage.getItem(achKey(sid));
    return v ? JSON.parse(v) as string[] : [];
  } catch { return []; }
}

export function saveAch(sid: string, ids: string[]): void {
  try { localStorage.setItem(achKey(sid), JSON.stringify(ids)); } catch { /* ignore */ }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/rewards/store.ts
git commit -m "$(cat <<'EOF'
feat(rewards): per-student localStorage tier marks + achievements set

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: `grantAchievements` helper

**Files:**
- Create: `frontend/src/aurora/rewards/achieve.ts`

- [ ] **Step 1: Write `achieve.ts`**

```ts
import { loadAch, saveAch } from "./store";
import { ACHIEVEMENTS, achievementArt } from "./catalog";
import type { Reward } from "./types";

/** Grant named achievements once each (deduped via the per-student set) and return the
 *  Rewards to enqueue. `lumens` (optional) is attached to the first new reward, so an
 *  OSCE station can show its Lumen award on the banner. */
export function grantAchievements(studentId: string, ids: string[], lumens?: number): Reward[] {
  const have = loadAch(studentId);
  const out: Reward[] = [];
  for (const id of ids) {
    const def = ACHIEVEMENTS[id];
    if (!def || have.includes(id)) continue;
    have.push(id);
    out.push({
      id: `achievement:${id}`, kind: "achievement",
      title: def.title, subtitle: def.subtitle, art: achievementArt(def.feature),
      lumens: out.length === 0 ? lumens : undefined,
    });
  }
  saveAch(studentId, have);
  return out;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/rewards/achieve.ts
git commit -m "$(cat <<'EOF'
feat(rewards): grantAchievements — one-time deduped unlocks

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: RewardBanner + RewardProvider + derived watcher

**Files:**
- Create: `frontend/src/aurora/rewards/useRewards.ts`
- Create: `frontend/src/aurora/rewards/RewardBanner.tsx`
- Create: `frontend/src/aurora/rewards/RewardProvider.tsx`
- Modify: `frontend/src/aurora/aurora.css` (`.rw-*`)
- Modify: `frontend/src/app/providers.tsx` (mount)

> **Note on `lumenBadges`:** `useRewards.ts` imports `LUMEN_BADGES` from `@/aurora/components/home/lumenBadges`. Do Task 20 Step 1 (create `lumenBadges.ts`) before this task, or create that file first.

- [ ] **Step 1: Write the derived watcher `useRewards.ts`**

```ts
"use client";
import { useEffect, useRef } from "react";
import { useProgress } from "@/hooks/useProgress";
import { useAuth } from "@/screens/AuthContext";
import { rankForLevel } from "@/lib/rank";
import { STREAK_BADGES } from "@/aurora/components/home/streakBadges";
import { LUMEN_BADGES } from "@/aurora/components/home/lumenBadges";
import { loadTierMark, saveTierMark, type TierMark } from "./store";
import { LEVELUP_ART, BADGE_ART } from "./catalog";
import type { Reward } from "./types";

/** Watches /api/progress and enqueues level-ups + streak/Lumens badge unlocks when a
 *  threshold is newly crossed. First observation on a device baselines silently (never
 *  spams already-earned unlocks). */
export function useRewardWatcher(enqueue: (r: Reward) => void) {
  const { user } = useAuth();
  const { data: progress } = useProgress();
  const sid = user?.studentId ?? "";
  const enqRef = useRef(enqueue);
  enqRef.current = enqueue;

  useEffect(() => {
    if (!sid || !progress) return;
    const level = progress.level ?? 1;
    const streak = progress.streak_detail?.current ?? 0;
    const earned = progress.coins_earned ?? 0;
    const streakTier = STREAK_BADGES.filter((b) => streak >= b.at).length;
    const lumenTier = LUMEN_BADGES.filter((b) => earned >= b.at).length;

    const stored = loadTierMark(sid);
    if (!stored) {
      saveTierMark(sid, { level, streakTier, lumenTier });  // baseline silently
      return;
    }
    const next: TierMark = { ...stored };

    if (level > stored.level) {
      enqRef.current({ id: `level-up:${level}`, kind: "level-up", title: `Level ${level}`, subtitle: rankForLevel(level).title, art: LEVELUP_ART });
      next.level = level;
    }
    for (let i = stored.streakTier; i < streakTier; i++) {
      const b = STREAK_BADGES[i];
      enqRef.current({ id: `streak-badge:${b.name}`, kind: "streak-badge", title: b.name, subtitle: b.tagline, art: BADGE_ART, medal: b.image });
    }
    if (streakTier > stored.streakTier) next.streakTier = streakTier;

    for (let i = stored.lumenTier; i < lumenTier; i++) {
      const b = LUMEN_BADGES[i];
      enqRef.current({ id: `lumen-badge:${b.name}`, kind: "lumen-badge", title: b.name, subtitle: b.tagline, art: BADGE_ART, medal: b.image });
    }
    if (lumenTier > stored.lumenTier) next.lumenTier = lumenTier;

    saveTierMark(sid, next);
  }, [sid, progress]);
}
```

- [ ] **Step 2: Write `RewardBanner.tsx`**

```tsx
"use client";
/* RewardBanner — the full-screen, in-your-face celebratory takeover. Portal to body at a
   high z-index, spring-in, confetti, image backdrop + optional medallion overlay. Auto-
   dismisses; tap anywhere or press Escape to continue. */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { confetti } from "@/fx/confetti";
import { Lumen } from "@/aurora/components/Lumen";
import type { Reward } from "./types";

const LABEL: Record<Reward["kind"], string> = {
  "achievement": "Achievement Unlocked",
  "streak-badge": "New Streak Badge",
  "lumen-badge": "New Lumens Badge",
  "level-up": "Level Up",
};

export function RewardBanner({ reward, onDone }: { reward: Reward; onDone: () => void }) {
  useEffect(() => {
    confetti({ particleCount: 170, spread: 105, startVelocity: 48, origin: { y: 0.35 },
      colors: ["#ffd21e", "#22bcff", "#2ee85a", "#ff7ab8", "#9b6bff"] });
    const t = setTimeout(onDone, 4200);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDone(); };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [reward.id, onDone]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <motion.div className="rw-scrim" data-testid="reward-banner" onClick={onDone}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="rw-card" data-kind={reward.kind} onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.7, y: 40, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 15, stiffness: 240 }}>
        <div className="rw-art" style={{ backgroundImage: `url(${reward.art})` }}>
          {reward.medal && (
            /* eslint-disable-next-line @next/next/no-img-element -- static asset, standalone build */
            <img className="rw-medal" src={reward.medal} alt="" width={140} height={140} />
          )}
        </div>
        <p className="rw-eyebrow">{LABEL[reward.kind]}</p>
        <h2 className="rw-title">{reward.title}</h2>
        <p className="rw-sub">{reward.subtitle}</p>
        {reward.lumens ? (
          <p className="rw-lumens"><Lumen size={22} /> +{reward.lumens.toLocaleString()} Lumens</p>
        ) : null}
        <button type="button" className="rw-cta" onClick={onDone}>Tap to continue</button>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
```

- [ ] **Step 3: Write `RewardProvider.tsx`**

```tsx
"use client";
/* RewardProvider — app-wide reward queue. Runs the derived watcher (level/streak/Lumens)
   and exposes enqueue() for moment-based achievements. Shows one banner at a time. The
   watcher lives in an inner component mounted ONLY when authenticated, so /api/progress
   is never fetched on the login route. */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useAuth } from "@/screens/AuthContext";
import type { Reward } from "./types";
import { RewardBanner } from "./RewardBanner";
import { useRewardWatcher } from "./useRewards";

interface Ctx { enqueue: (r: Reward) => void; }
const RewardCtx = createContext<Ctx>({ enqueue: () => {} });
export function useReward() { return useContext(RewardCtx); }

/** Mounted only when authed — isolates the useProgress-driven watcher hook. */
function RewardWatcher({ enqueue }: { enqueue: (r: Reward) => void }) {
  useRewardWatcher(enqueue);
  return null;
}

export function RewardProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [queue, setQueue] = useState<Reward[]>([]);
  const [current, setCurrent] = useState<Reward | null>(null);

  const enqueue = useCallback((r: Reward) => {
    setQueue((q) => (q.some((x) => x.id === r.id) ? q : [...q, r]));
  }, []);

  useEffect(() => {
    if (current || queue.length === 0) return;
    setCurrent(queue[0]);
    setQueue((q) => q.slice(1));
  }, [current, queue]);

  return (
    <RewardCtx.Provider value={{ enqueue }}>
      {user && <RewardWatcher enqueue={enqueue} />}
      {children}
      {current && <RewardBanner key={current.id} reward={current} onDone={() => setCurrent(null)} />}
    </RewardCtx.Provider>
  );
}
```

- [ ] **Step 4: Add `.rw-*` CSS** to `frontend/src/aurora/aurora.css`:

```css
/* RewardBanner — full-screen celebratory takeover. */
.rw-scrim {
  position: fixed; inset: 0; z-index: 300;
  display: flex; align-items: center; justify-content: center; padding: 20px;
  background: radial-gradient(120% 120% at 50% 30%, rgba(20,26,38,.6), rgba(4,6,10,.86));
  backdrop-filter: blur(8px); cursor: pointer;
}
.rw-card {
  width: min(440px, 92vw); padding: 0 26px 26px; text-align: center; cursor: default;
  background: linear-gradient(180deg, #1b2636, #0d121b);
  border: 1px solid rgba(255,255,255,.12); border-radius: 26px; overflow: hidden;
  box-shadow: 0 40px 120px -30px rgba(0,0,0,.8), 0 0 0 1px rgba(255,210,30,.12);
  color: #eff4fa;
}
.rw-art {
  height: 190px; margin: 0 -26px 12px; background-size: cover; background-position: center;
  display: flex; align-items: center; justify-content: center;
}
.rw-medal { filter: drop-shadow(0 12px 26px rgba(0,0,0,.5)); }
.rw-eyebrow { font-size: .68rem; letter-spacing: .24em; text-transform: uppercase; font-weight: 800; color: #ffd21e; }
.rw-title { font: 900 1.9rem/1.05 var(--font-display, inherit); letter-spacing: -.01em; margin: 6px 0 4px; }
.rw-sub { font-size: .92rem; line-height: 1.5; color: rgba(239,244,250,.78); }
.rw-lumens { display: inline-flex; align-items: center; gap: 6px; margin-top: 12px; font-weight: 900; color: #ffd21e; font-size: 1.15rem; }
.rw-cta {
  margin-top: 18px; padding: 12px 22px; border: none; border-radius: 14px; cursor: pointer;
  font: 800 .9rem/1 var(--font-display, inherit); color: #06210f;
  background: linear-gradient(180deg, #5cf07a, #2ee85a); box-shadow: 0 4px 0 #16b83f;
}
.rw-cta:active { transform: translateY(2px); box-shadow: none; }
@media (prefers-reduced-motion: reduce) { .rw-scrim, .rw-card { animation: none !important; } }
```

- [ ] **Step 5: Mount in `providers.tsx`** — wrap children with `<RewardProvider>` inside `AuthProvider`:

```tsx
import { RewardProvider } from "@/aurora/rewards/RewardProvider";
```
```tsx
        <AuthProvider>
          <RewardProvider>
            <div style={{ position: "relative", minHeight: "100%" }}>{children}</div>
          </RewardProvider>
          <Toaster position="bottom-right" />
        </AuthProvider>
```

- [ ] **Step 6: Typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS (requires `lumenBadges.ts` from Task 20 Step 1 — create it first if not present).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/aurora/rewards frontend/src/aurora/aurora.css frontend/src/app/providers.tsx
git commit -m "$(cat <<'EOF'
feat(rewards): full-screen reward banner queue + derived unlock watcher

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: Wire achievements into flashcards, tutor, OSCE + retire old toasts

**Files:**
- Modify: `frontend/src/aurora/screens/Flashcards.tsx`
- Modify: `frontend/src/aurora/screens/Tutor.tsx`
- Modify: `frontend/src/aurora/screens/CaseSession.tsx`
- Modify: `frontend/src/hooks/useProgress.ts` (used by CaseSession response type — see Task 18 for `coins_earned`; here add the OSCE response field type inline)

- [ ] **Step 1: Flashcards** — replace the achievement/level-up toasts with reward enqueues.

Add imports:
```tsx
import { useReward } from "@/aurora/rewards/RewardProvider";
import { grantAchievements } from "@/aurora/rewards/achieve";
import { useAuth } from "@/screens/AuthContext";
```
Remove `checkAndUnlockAchievements` from the gamification import (keep `addXP`, `incrementTotalCards`, `XP_REWARDS`).
Add hooks near the top of the component:
```tsx
  const { enqueue } = useReward();
  const { user } = useAuth();
```
In `onCheck`, replace the achievement lines (131-132):
```tsx
    xpRef.current += xp; addXP(xp); incrementTotalCards();
    if (correct && comboMultiplier(newCombo) >= 4) {
      grantAchievements(user?.studentId ?? "", ["combo_godlike"]).forEach(enqueue);
    }
```
In `finish()`, replace the level-up toast (161-165) with first-deck / perfect-deck achievements (the level-up banner now comes from the watcher after `/complete` refreshes progress):
```tsx
  const finish = () => {
    setDone(true);
    const earned = xpRef.current + XP_REWARDS.sessionComplete;
    addXP(XP_REWARDS.sessionComplete);
    const allCorrect = resultsRef.current.length > 0 && resultsRef.current.every((r) => r.correct);
    const ids = ["first_deck", ...(allCorrect ? ["perfect_deck"] : [])];
    grantAchievements(user?.studentId ?? "", ids).forEach(enqueue);
    complete({ results: resultsRef.current, xp_delta: earned });
  };
```
Remove the now-unused `import { toast } from "sonner";` and `import { rankForLevel } from "@/lib/rank";` if nothing else uses them (typecheck will confirm).

- [ ] **Step 2: Tutor** — remove the chat-cap toast and wire `first_chat`.

Open `frontend/src/aurora/screens/Tutor.tsx`. At the XP grant (line ~144): keep `const granted = addChatXp(XP_REWARDS.chatMessage);` and `if (granted > 0) syncGamification({ xp_delta: granted, hearts_used: 0 });`. Delete the cap-reached `toast(...)` (lines ~147-150). Replace the `checkAndUnlockAchievements()` / `setNewAchievements(...)` block (lines ~151-152) with:
```tsx
    grantAchievements(user?.studentId ?? "", ["first_chat"]).forEach(enqueue);
```
Add imports (`useReward`, `grantAchievements`; `useAuth` if not already imported) and the `const { enqueue } = useReward();` / `const { user } = useAuth();` hooks. Remove the `<AchievementManager .../>` render (lines ~220-223) and its import, plus the `newAchievements` state.

- [ ] **Step 3: OSCE** — award-driven banners in `CaseSession.tsx`.

First add `lumens_awarded` to the submit response type: open `CaseSession.tsx`, find the `DomainResult`/submit-response interface (around lines 32-39) and add `lumens_awarded?: number;`.
In the submit success path (where `result` is set, around lines 318-336), after the result is available add:
```tsx
    const sc = result.score_100 ?? 0;
    const ids = ["first_station",
      ...(sc >= 60 ? ["station_pass"] : []),
      ...(sc >= 100 && result.safe && !result.missed_critical ? ["flawless_station"] : [])];
    grantAchievements(user?.studentId ?? "", ids, result.lumens_awarded ?? 0).forEach(enqueue);
```
Add imports (`useReward`, `grantAchievements`, `useAuth`) and hooks (`const { enqueue } = useReward();`, `const { user } = useAuth();`).

- [ ] **Step 4: Typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS. Fix any leftover unused imports flagged.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/screens/Flashcards.tsx frontend/src/aurora/screens/Tutor.tsx frontend/src/aurora/screens/CaseSession.tsx
git commit -m "$(cat <<'EOF'
feat(rewards): fire image banners for flashcards/tutor/OSCE achievements

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 18: Delete the old AchievementToast

**Files:**
- Delete: `frontend/src/screens/AchievementToast.tsx`

- [ ] **Step 1: Confirm no remaining references**

Run (Grep): search `AchievementToast|AchievementManager` across `frontend/src`.
Expected: no hits (FlashShell dropped it in Task 10; Tutor in Task 17).

- [ ] **Step 2: Delete the file**

```bash
git rm frontend/src/screens/AchievementToast.tsx
```

- [ ] **Step 3: Typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor(rewards): remove legacy AchievementToast (replaced by reward banners)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

# Phase 6 — Homepage Lumens vault card

### Task 19: `coins_earned` in the progress type

**Files:**
- Modify: `frontend/src/hooks/useProgress.ts:22-35`

- [ ] **Step 1: Add the field** to `ProgressData` (after `xp: number;`):

```ts
  coins_earned: number;
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useProgress.ts
git commit -m "$(cat <<'EOF'
feat(home): add coins_earned to ProgressData

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 20: Lumens badge tiers + medallion + ladder

**Files:**
- Create: `frontend/src/aurora/components/home/lumenBadges.ts`
- Create: `frontend/src/aurora/components/home/LumenBadge.tsx`
- Create: `frontend/src/aurora/components/home/LumenLadder.tsx`

- [ ] **Step 1: Write `lumenBadges.ts`**

```ts
/* Lumens vault — the six light/wealth tiers a student unlocks as their LIFETIME Lumens
   (coins_earned) climb. Sibling vibe to the streak badges (which are vision-acuity themed);
   these are Selena/Iris getting progressively more radiant + rich in golden light.
   Static generated medallions in /public/brand/lumen-badges (same six for everyone). */
import type { BadgeRarity } from "./streakBadges";

export interface LumenBadge {
  at: number;            // lifetime-Lumens threshold to unlock
  name: string;
  rarity: BadgeRarity;
  tagline: string;
  image: string;
}

export const LUMEN_BADGES: LumenBadge[] = [
  { at: 250,   name: "Spark",          rarity: "common",    tagline: "A tiny gleam. Selena approves.",   image: "/brand/lumen-badges/spark.jpg" },
  { at: 1000,  name: "Glimmer",        rarity: "uncommon",  tagline: "Ooh, shiny. Keep 'em coming.",     image: "/brand/lumen-badges/glimmer.jpg" },
  { at: 2500,  name: "Glow-Up",        rarity: "rare",      tagline: "You're literally glowing now.",    image: "/brand/lumen-badges/glow-up.jpg" },
  { at: 6000,  name: "Floodlight",     rarity: "epic",      tagline: "Blindingly bright. Shades on.",    image: "/brand/lumen-badges/floodlight.jpg" },
  { at: 12000, name: "Blaze of Glory", rarity: "mythic",    tagline: "Certified radiant. A whole vibe.", image: "/brand/lumen-badges/blaze.jpg" },
  { at: 25000, name: "Supernova",      rarity: "legendary", tagline: "You have become light itself.",    image: "/brand/lumen-badges/supernova.jpg" },
];
```

- [ ] **Step 2: Write `LumenBadge.tsx`** (mirrors `SelenaBadge`, reuses `hm-badge` CSS + `BadgeState`)

```tsx
/* LumenBadge — one collectible medallion in the Lumens vault shelf. Reuses the streak
   badge shelf CSS (hm-badge). Collected shines; next glows; locked is greyscale. */
import type { LumenBadge as LumenBadgeT } from "./lumenBadges";
import type { BadgeState } from "./SelenaBadge";

export function LumenBadge({ badge, state, toNext = 0 }: {
  badge: LumenBadgeT;
  state: BadgeState;
  toNext?: number;
}) {
  const meta =
    state === "collected" ? "Collected"
    : state === "next" ? `${toNext.toLocaleString()} to go`
    : `Reach ${badge.at.toLocaleString()}`;

  return (
    <li className="hm-badge" data-state={state} data-rarity={badge.rarity}
      title={state === "collected" ? badge.tagline : `${badge.name} · ${badge.at.toLocaleString()} Lumens`}>
      <span className="hm-badge-medal">
        {/* eslint-disable-next-line @next/next/no-img-element -- static asset, standalone build */}
        <img className="hm-badge-art" src={badge.image}
          alt={state === "locked" ? `Locked badge — reach ${badge.at.toLocaleString()} Lumens` : `${badge.name} badge`}
          width={76} height={76} loading="lazy" />
        {state === "collected" && <span className="hm-badge-seal" aria-hidden>★</span>}
        {state === "locked" && <span className="hm-badge-lock" aria-hidden>🔒</span>}
      </span>
      <span className="hm-badge-name">{badge.name}</span>
      <span className="hm-badge-meta">{meta}</span>
    </li>
  );
}
```

- [ ] **Step 3: Write `LumenLadder.tsx`** (mirrors `MilestoneLadder`)

```tsx
/* LumenLadder — the Lumens VAULT badge collection. Each light/wealth tier unlocks as
   lifetime Lumens (coins_earned) climb: collected → next (glowing) → locked. */
import { LUMEN_BADGES } from "./lumenBadges";
import { LumenBadge } from "./LumenBadge";
import type { BadgeState } from "./SelenaBadge";

export function LumenLadder({ current = 0 }: { current?: number }) {
  const nextAt = LUMEN_BADGES.find((b) => current < b.at)?.at ?? null;
  const collected = LUMEN_BADGES.filter((b) => current >= b.at).length;

  return (
    <section className="hm-panel" data-testid="lumen-ladder" aria-label="Lumens vault">
      <p className="hm-ph disp">
        Lumens vault
        <span className="hm-c">{collected} of {LUMEN_BADGES.length} collected</span>
      </p>
      <ol className="hm-badges">
        {LUMEN_BADGES.map((b) => {
          const state: BadgeState = current >= b.at ? "collected" : nextAt === b.at ? "next" : "locked";
          return <LumenBadge key={b.at} badge={b} state={state} toNext={b.at - current} />;
        })}
      </ol>
    </section>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/components/home/lumenBadges.ts frontend/src/aurora/components/home/LumenBadge.tsx frontend/src/aurora/components/home/LumenLadder.tsx
git commit -m "$(cat <<'EOF'
feat(home): Lumens vault badge tiers + medallion + ladder

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 21: Swap WeekStats → LumenLadder on the home

**Files:**
- Modify: `frontend/src/aurora/screens/Dashboard.tsx:22,118-121`
- Delete: `frontend/src/aurora/components/home/WeekStats.tsx`

- [ ] **Step 1: Replace the card** in `Dashboard.tsx`. Change the import (line 22):

```tsx
import { LumenLadder } from "@/aurora/components/home/LumenLadder";
```
Add the derived value near the other progress derivations (after line 69):
```tsx
  const coinsEarned = progress?.coins_earned ?? 0;
```
Replace the `.hm-lower` block (lines 118-121):
```tsx
      <div className="hm-lower">
        <MilestoneLadder detail={detail} />
        <LumenLadder current={coinsEarned} />
      </div>
```

- [ ] **Step 2: Delete WeekStats**

```bash
git rm frontend/src/aurora/components/home/WeekStats.tsx
```

- [ ] **Step 3: Remove orphaned `.hm-stats` CSS** — Grep `hm-stats|hm-stat\b|hm-sv|hm-sl` in `frontend/src/aurora/home.css`; if WeekStats was the only consumer, delete those rules (the orphans this change creates). If anything else uses them, leave them.

- [ ] **Step 4: Typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/screens/Dashboard.tsx frontend/src/aurora/home.css
git commit -m "$(cat <<'EOF'
feat(home): replace WeekStats with the Lumens vault card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

# Phase 7 — Nano-banana art (placeholders first)

### Task 22: Reward art prompt registries + generators

**Files:**
- Create: `tools/rewards/__init__.py` (empty)
- Create: `tools/rewards/lumen_badge_art.py`
- Create: `tools/rewards/generate_lumen_badges.py`
- Create: `tools/rewards/banner_art.py`
- Create: `tools/rewards/generate_reward_banners.py`

- [ ] **Step 1: `tools/rewards/__init__.py`** — empty file.

- [ ] **Step 2: `lumen_badge_art.py`** (Selena/Iris mascot, opaque medallions)

```python
"""Lumens vault badge medallions — six light/wealth tiers with Iris (Selena) as the mascot.
Nano-Banana flash, anchored to iris.png (reference=True). PAID + go-ahead-gated. Opaque
medallions (like the streak badges), saved as jpg. Iris = one-eyed, hairless round blob."""

BADGES: dict[str, dict] = {
    "spark":      {"name": "Spark",          "desc": "cupping a single tiny spark of golden light in her hands, humble and delighted, a couple of loose gold coins nearby"},
    "glimmer":    {"name": "Glimmer",        "desc": "haloed in a soft glimmering ring of gold light with a small pile of glowing coins"},
    "glow-up":    {"name": "Glow-Up",        "desc": "literally glowing and radiating warm golden light, standing in a shallow pool of gold coins, confident"},
    "floodlight": {"name": "Floodlight",     "desc": "beaming a brilliant shaft of light while wearing tiny cool sunglasses, knee-deep in gold coins"},
    "blaze":      {"name": "Blaze of Glory", "desc": "wreathed in radiant friendly golden flames of light on a throne of gold coins, triumphant"},
    "supernova":  {"name": "Supernova",      "desc": "a cosmic being of pure radiant light, bursting starlight and golden coins across a galaxy backdrop, legendary"},
}


def prompt(b: dict) -> str:
    return (
        "A premium, adorable collectible achievement medallion of Iris — a one-eyed, hairless, "
        "round mascot blob with a single large friendly eye and no other facial features — "
        f"{b['desc']}. Circular medallion composition, soft rounded 3D enamel-and-gold game-UI "
        "style, gentle studio lighting, warm and cute and beautiful (never scary), centered, "
        "filling the frame on a rich deep-navy-to-gold radial background. No text, no watermark."
    )
```

- [ ] **Step 3: `generate_lumen_badges.py`** (opaque jpg, reference=True — mirrors `tools/leaderboard/generate_crests.py` minus keying)

```python
#!/usr/bin/env python3
"""Generate the Lumens vault badge medallions via Nano-Banana flash — PAID, go-ahead-gated.
reference=True (anchored to iris.png), opaque. Output lands in .tmp/lumen-badges/ for review;
--install copies approved medallions into frontend/public/brand/lumen-badges/*.jpg.

Usage:
    python tools/rewards/generate_lumen_badges.py --estimate
    python tools/rewards/generate_lumen_badges.py --generate [--only spark,supernova]
    python tools/rewards/generate_lumen_badges.py --install
"""
import argparse
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from PIL import Image

from tools.avatar import generate_sprites
from tools.rewards.lumen_badge_art import BADGES, prompt
from tools.shared.gemini_client import MOCK_MODE

MODEL = generate_sprites.MODELS["flash"]
ROOT = Path(__file__).resolve().parents[2]
TMP_DIR = ROOT / ".tmp" / "lumen-badges"
PUBLIC_DIR = ROOT / "frontend" / "public" / "brand" / "lumen-badges"


def _square(img: Image.Image, size: int = 512) -> Image.Image:
    img = img.convert("RGB")
    s = min(img.size)
    left = (img.width - s) // 2
    top = (img.height - s) // 2
    return img.crop((left, top, left + s, top + s)).resize((size, size), Image.LANCZOS)


def run_estimate() -> None:
    print(f"ESTIMATE — {len(BADGES)} Lumens badge(s) via {MODEL} (reference=True, opaque jpg)")
    for bid, b in BADGES.items():
        print(f"— {bid}:\n    {prompt(b)}\n")


def generate_one(bid: str) -> Path | None:
    if MOCK_MODE:
        raise RuntimeError("needs a live GEMINI_API_KEY; refusing to fabricate art in MOCK_MODE")
    data = generate_sprites.generate_image_bytes(prompt(BADGES[bid]), model=MODEL, reference=True)
    if not data:
        print(f"  [{bid}] no image generated")
        return None
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    out = TMP_DIR / f"{bid}.png"
    _square(Image.open(io.BytesIO(data))).save(out)
    print(f"  [{bid}] saved {out} ({out.stat().st_size:,} bytes)")
    return out


def run_generate(only: list[str] | None) -> None:
    for bid in (only or list(BADGES)):
        if bid not in BADGES:
            print(f"  [{bid}] unknown badge, skipping")
            continue
        generate_one(bid)


def run_install() -> int:
    srcs = sorted(TMP_DIR.glob("*.png"))
    if not srcs:
        print(f"nothing to install — {TMP_DIR} is empty (run --generate first)", file=sys.stderr)
        return 1
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    for src in srcs:
        if src.stem not in BADGES:
            continue
        Image.open(src).convert("RGB").save(PUBLIC_DIR / f"{src.stem}.jpg", "JPEG", quality=88)
        print(f"  installed {src.stem}.jpg")
    return 0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--estimate", action="store_true")
    ap.add_argument("--generate", action="store_true")
    ap.add_argument("--install", action="store_true")
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    only = [x for x in args.only.split(",") if x] or None
    if args.estimate:
        run_estimate()
    elif args.generate:
        run_generate(only)
    elif args.install:
        sys.exit(run_install())
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: `banner_art.py`** (five celebratory backdrops)

```python
"""Reward banner backdrops — celebratory scenes that the reward title/medallion overlay onto.
Nano-Banana flash. PAID + go-ahead-gated. Landscape-ish, saved as webp."""

BANNERS: dict[str, dict] = {
    "achievement-flashcards": {"desc": "an explosive celebratory burst of blue and gold light with floating flashcards and confetti, Iris the one-eyed mascot cheering"},
    "achievement-tutor":      {"desc": "a warm celebratory scene of glowing question marks and indigo light rays with Iris the one-eyed mascot delighted"},
    "achievement-osce":       {"desc": "a triumphant clinical-themed celebration in teal and gold with a subtle eye-exam motif and Iris the one-eyed mascot proud"},
    "level-up":               {"desc": "a dramatic golden LEVEL UP style upward light burst with rising sparks and confetti, Iris the one-eyed mascot ascending"},
    "badge-unlock":           {"desc": "a radiant empty spotlight pedestal of golden light and confetti, centered, leaving the middle clear for a medallion to sit on"},
}


def prompt(b: dict) -> str:
    return (
        f"A vibrant celebratory game-reward banner backdrop: {b['desc']}. Soft rounded modern "
        "game-UI style, rich saturated color, dramatic but friendly and beautiful, wide landscape "
        "composition, strong central focus. No text, no words, no watermark, no UI chrome."
    )
```

- [ ] **Step 5: `generate_reward_banners.py`** — copy `generate_lumen_badges.py` verbatim but: import from `tools.rewards.banner_art` (`BANNERS`, `prompt`); `TMP_DIR = ROOT/".tmp"/"reward-banners"`; `PUBLIC_DIR = ROOT/"frontend"/"public"/"brand"/"reward-banners"`; use `reference=False`; drop `_square` and in `run_install` save as webp: `Image.open(src).save(PUBLIC_DIR / f"{src.stem}.webp", "WEBP")`; iterate `BANNERS` instead of `BADGES`.

- [ ] **Step 6: Estimate-only smoke (no API calls)**

Run: `python tools/rewards/generate_lumen_badges.py --estimate`
Run: `python tools/rewards/generate_reward_banners.py --estimate`
Expected: prints prompts, no errors, no network calls.

- [ ] **Step 7: Commit**

```bash
git add tools/rewards/__init__.py tools/rewards/lumen_badge_art.py tools/rewards/generate_lumen_badges.py tools/rewards/banner_art.py tools/rewards/generate_reward_banners.py
git commit -m "$(cat <<'EOF'
feat(art): Lumens-badge + reward-banner generators (nano-banana flash, gated)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 23: Keyless placeholder art (ships green)

**Files:**
- Create: `tools/rewards/make_reward_placeholders.py`

- [ ] **Step 1: Write the placeholder generator** (no API; draws clearly-marked gradient placeholders so the UI renders before any paid run)

```python
#!/usr/bin/env python3
"""Keyless placeholder art for the Lumens vault badges + reward banners so the app ships
GREEN before any paid nano-banana run. Clearly stamped PLACEHOLDER; overwritten by the
real generators' --install. No API calls.

Usage: python tools/rewards/make_reward_placeholders.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from PIL import Image, ImageDraw

from tools.rewards.lumen_badge_art import BADGES
from tools.rewards.banner_art import BANNERS

ROOT = Path(__file__).resolve().parents[2]
BADGE_DIR = ROOT / "frontend" / "public" / "brand" / "lumen-badges"
BANNER_DIR = ROOT / "frontend" / "public" / "brand" / "reward-banners"


def _grad(w: int, h: int, top: tuple, bot: tuple) -> Image.Image:
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        px_row = tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(3))
        for x in range(w):
            px[x, y] = px_row
    return img


def _stamp(img: Image.Image, label: str) -> None:
    d = ImageDraw.Draw(img)
    d.text((14, 12), "PLACEHOLDER", fill=(255, 255, 255))
    d.text((14, img.height - 24), label, fill=(255, 236, 170))


def main() -> None:
    BADGE_DIR.mkdir(parents=True, exist_ok=True)
    BANNER_DIR.mkdir(parents=True, exist_ok=True)
    for bid, b in BADGES.items():
        img = _grad(512, 512, (18, 26, 48), (230, 169, 0))
        d = ImageDraw.Draw(img)
        d.ellipse((156, 156, 356, 356), outline=(255, 236, 170), width=6)
        _stamp(img, f"lumen badge: {b['name']}")
        img.save(BADGE_DIR / f"{bid}.jpg", "JPEG", quality=82)
        print(f"  placeholder {BADGE_DIR.name}/{bid}.jpg")
    for cid in BANNERS:
        img = _grad(1200, 520, (14, 20, 38), (34, 188, 255))
        _stamp(img, f"reward banner: {cid}")
        img.save(BANNER_DIR / f"{cid}.webp", "WEBP")
        print(f"  placeholder {BANNER_DIR.name}/{cid}.webp")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it to create the assets**

Run: `python tools/rewards/make_reward_placeholders.py`
Expected: writes 6 `lumen-badges/*.jpg` + 5 `reward-banners/*.webp`; filenames match the paths in `lumenBadges.ts` (spark/glimmer/glow-up/floodlight/blaze/supernova) and `catalog.ts` (achievement-flashcards/-tutor/-osce, level-up, badge-unlock).

- [ ] **Step 3: Commit** (the generator + the placeholder assets so the app ships green)

```bash
git add tools/rewards/make_reward_placeholders.py "frontend/public/brand/lumen-badges" "frontend/public/brand/reward-banners"
git commit -m "$(cat <<'EOF'
feat(art): keyless placeholder Lumens badges + reward banners (green build)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

# Phase 8 — Locks, harness, green gate, verify

### Task 24: Design-lock amendments

**Files:**
- Modify: `docs/design-locks.md`

- [ ] **Step 1: Amend the flashcards + home locks** via the `/design-lock` skill. Add to the flashcards lock: "Neon-red PAUSE control replaces Exit during a game (red is now permitted for control-chrome, not only wrong-answer verdicts); a dark-arcade PauseMenu offers Resume / Switch deck / Quit — Quit deducts 20 Lumens (`/api/flashcards/forfeit`) and routes home." Add to the home lock: "The `.hm-lower` right slot is the Lumens vault badge card (`LumenLadder`), replacing WeekStats; sibling vibe to the streak-badge card, distinct art."

- [ ] **Step 2: Commit**

```bash
git add docs/design-locks.md
git commit -m "$(cat <<'EOF'
docs(design-locks): flashcards pause control + home Lumens vault card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 25: Harness assertion — Lumens vault card on home

**Files:**
- Modify: `frontend/tests/aurora_assert.mjs`

- [ ] **Step 1: Update the home assertion** — open `frontend/tests/aurora_assert.mjs`, find the home-page assertion block (it already checks `[data-testid="home-root"]` / `milestone-ladder`). Add an assertion that `[data-testid="lumen-ladder"]` exists on the home, and remove any assertion tied to the deleted WeekStats "Your progress" panel if present.

- [ ] **Step 2: Run the harness** per the `/harness` skill (build → serve standalone → warm → assert against the already-warm server):

Run: `bash scripts/start-harness.sh aurora` (or the known-good warm-server recipe: `node frontend/tests/aurora_assert.mjs http://127.0.0.1:3000`).
Expected: home assertions pass (the flashcards D2 back-face assertion is a known pre-existing RED, unrelated to this work — note it, don't fix it here).

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/aurora_assert.mjs
git commit -m "$(cat <<'EOF'
test(harness): assert Lumens vault card on the home

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 26: Full green gate + behavioral verify

**Files:** none (verification only)

- [ ] **Step 1: Backend**

Run: `python -m pytest -q`
Expected: PASS (all green).

- [ ] **Step 2: Frontend**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Behavioral verify** (per `/ship-check` — evidence before asserting done). With a local dev API + the app running, sign in as a test student and confirm:
  - Flashcards study loop shows the **neon-red Pause**; pressing it opens the PauseMenu; **Switch deck** returns to the topic fan; **Quit game** shows the Lumens-loss warning; confirming quit routes to `/dashboard` and the balance drops by 20 (check `/api/progress`).
  - Completing a deck fires a **full-screen reward banner** (first_deck / perfect_deck) instead of a corner toast.
  - The home shows the **Lumens vault** card (placeholder medallions) to the right of the streak badges; WeekStats is gone.
  - Currency reads **"Lumens"** with the coin icon in the flashcards HUD, home, and leaderboard.
  - Tutor no longer caps chat XP (send >5 messages, Lumens keep accruing).

- [ ] **Step 4: Record the evidence** — note the pytest summary line, the build result, and one line per behavioral check in the completion message. Do not claim done without this.

---

### Task 27: Ship

**Files:** none

- [ ] **Step 1: Confirm green** (Task 26 all passed) and that migration 009 is coordinated (applied in Supabase, or scheduled with the deploy — code degrades gracefully via the `coins_earned → xp` fallback, so `main` never boots broken).

- [ ] **Step 2: Push to main** (project policy: after a completed task, push directly to `main`, which auto-deploys to Render).

```bash
git push origin main
```

- [ ] **Step 3: Post-deploy sanity** — after Render deploys, load the home + play a deck on prod; confirm no console errors and the reward banner + Lumens vault render (placeholders until paid art is generated).

---

## Deferred (explicit non-goals for this plan)

- **Paid nano-banana art run** — generate real Lumens medallions + reward banners via `tools/rewards/generate_lumen_badges.py --generate/--install` and `generate_reward_banners.py` **only on the user's explicit go-ahead**; placeholders ship green until then.
- **Cumulative-count achievements** (cards_50/100/500, curious_50, stations_10) — deferred; would need per-student counters. Moment-based unlocks cover the "every feature" ask for now.
- **`xp` DB column rename** — kept as the internal name.
- **Flashcards localStorage/backend XP double-write** — pre-existing; display source of truth stays `/api/progress`.
- **Server-authoritative achievements** — client-derived with localStorage high-water marks is the chosen approach.
