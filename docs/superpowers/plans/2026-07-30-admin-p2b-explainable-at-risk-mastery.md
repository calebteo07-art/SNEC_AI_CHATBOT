# Admin Console P2b — Explainable At-Risk & Mastery vs Cohort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin console's one-line binary at-risk rule with a deterministic scored model that shows a trainer *why* each student is flagged, and show one student's mastery against a real leave-one-out cohort average on three separately-named scales.

**Architecture:** Two new pure modules under `tools/supervisor/` — `risk_model.py` (weights, renormalisation, banding) and `mastery.py` (three scales, leave-one-out cohort) — fed by two new per-student aggregators appended to the existing `cohort_analytics.py`. `at_risk.py` becomes thin wiring: assemble a staff-free population, read the two bulk event tables P2a added, score each student, return only the flagged bands. No migration, no new env var, no AI in any scoring path.

**Tech Stack:** FastAPI (Python 3.12, async), pytest + `unittest.mock.patch`/`AsyncMock` + `fastapi.testclient`, Supabase (PostgREST), Next.js 16 App Router, React 19, TanStack Query, Tailwind 4.

**Design spec:** `docs/superpowers/specs/2026-07-26-admin-p2-analytics-depth-design.md` §6 (and §3 D7, D9, D10, D12, D13)

**Scope:** Plan B of three. Plan A (foundation + cohort aggregation) shipped 2026-07-29 at `c87a071`. Plan C (performance time-series, spec §7) follows and depends only on Plan A's case index and discipline map, so it may be reordered ahead of this one.

---

## Critical context for the implementer

**Verify the tree before you start and again before every push.** Multiple concurrent sessions edit this repo and `main` is sometimes force-pushed:

```bash
git fetch origin && git rev-parse --short HEAD && git rev-parse --short origin/main
```

### Spec corrections — verified against HEAD `814fca3` on 2026-07-30

The spec was written at `c5ea4da`, ~25 commits ago. Six of its §6 claims were re-checked in code. **Four held, three drifted.** These corrections are authoritative; do not implement the stale spec text.

| Spec §6 claim | Verified state at `814fca3` | What to do |
|---|---|---|
| Binary rule, `except → []` swallow, `date.today()`, `date` kept as a module symbol | ✅ **Confirmed verbatim** — `at_risk.py:45`, `:26-28`, `:30`, `:6` | Implement as specced |
| `cohort_summary.at_risk_count` is an independent hardcoded copy of the binary rule | ✅ **Confirmed** — `cohort_summary.py:62` | Implement as specced |
| Four `get_at_risk()` consumers must survive unchanged | ✅ **Confirmed** — `supervisor.py:82`, `supervisor.py:226`, `weekly_digest.py:126`, `tests/supervisor/test_at_risk.py` | Field superset (D12) |
| `admin_student_detail` has no rate limit | ✅ **Confirmed** — no decorator, no `request: Request` (`admin.py:716-717`) | Add `shared_limit` (Task 7) |
| **`at_risk_count` = `count(band != "low")`** | ⚠️ **CONTRADICTS D12.** D12 returns only `{high, medium}` rows, so `!= "low"` also counts `no_data` and the KPI would exceed the list beneath it. `AdminCohort.tsx:41` reads `c?.at_risk_count ?? atRisk.data?.length`, i.e. it *prefers* the count — and `supervisor_insights` feeds **both** numbers into one AI prompt (`supervisor.py:233,235`), so they would contradict each other inside a single sentence | **Use `count(band in {"high","medium"})`.** Task 4 pins KPI == list length |
| **`mastery` supersedes `cohort_retention`; re-point the consumers, then delete the old field** | ⚠️ **There is no backend field to delete.** `admin_student_detail` returns a plain dict (`admin.py:777-795`) that has never contained `cohort_retention`. The frontend declares it optional (`useAdmin.ts:99`) and reads it at `AdminStudentDetail.tsx:88` and `studentReportExport.ts:57` — both permanently `undefined`, so the downloadable report's "vs cohort" column has always rendered `"—"` | **Simpler than specced:** no competing-numbers migration and no deletion. Replace a dead optional read with a live one. Removing the `cohort_retention` *type* member is a one-line cleanup in Task 8 |
| **`BenchmarkTopic(**t)` sits outside its try/except → 500 wire hazard in this endpoint** | ⚠️ **Wrong file.** `BenchmarkTopic` is in `supervisor.py:53` and constructed at `:185`, inside `GET /api/supervisor/benchmarks` — a *different* endpoint this plan does not touch. `admin_student_detail` builds no pydantic model at all, and `AtRiskResponse.students` is `list[dict]` (`supervisor.py:34-35`), so new row fields pass through untouched | **Out of scope.** No pydantic widening is needed anywhere in this plan. (The hazard is real; it belongs to P4/P5 or a standalone fix) |
| **Bump `PERSIST_SCHEMA_VERSION` `"6"` → `"7"`** | ⚠️ **Already `"7"`** — the flashcard 5-deck ladder bumped it (`frontend/src/lib/queryClient.ts:27`) | Bump **`"7"` → `"8"`** (Task 8) |

### Two P2a process lessons that govern this plan

Both fired repeatedly during Plan A and are the reason its tasks shipped correct:

1. **A review that changes shared code must be propagated into downstream task bodies, not just the reviewed task.** If a review changes `RISK_RUBRIC`'s shape in Task 1, Tasks 3, 4 and 5 are written against the old shape and will ship a second, divergent copy. Re-read the delivered file before starting any later task.
2. **A fixture encoding a state the wire cannot produce pins nothing and reads as coverage. Check fixtures against the PRODUCER.** Before writing any fixture, confirm the endpoint can actually emit that shape. Plan A shipped a UI branch on `sources.osce === "unavailable"` that is unreachable because a failed OSCE read 500s instead of degrading.

**Mutation testing is the standing bar.** Every task in Plan A shipped a green suite that could not fail for its own core invariant until deliberately mutated. For each task: after the suite passes, break the implementation in the specific way the invariant forbids, confirm a named test fails, then revert. A step in every task below does this explicitly.

### Rules that govern the numbers

1. **Retakes (D9).** Attainment — `pass_rate`, `avg_score`, mastery — uses the **best attempt per `(student_id, case_id)`**. Volume counts use all raw attempts. `safety_fail_rate` is over **raw attempts**: a safety fail is an event, not an attainment level. **Do not reimplement the high-water rule** — reuse `cohort_analytics._score_rank`, which encodes a load-bearing `passed` tie-break for the majority of production rows that are unscored.
2. **Population (D10, as corrected in Plan A).** Read **`db.get_active_student_profiles()`**, which returns `(students, staff_excluded)` and subtracts staff by `supervisors` membership. **`get_active_profiles()` is NOT staff-free** — it filters on `approved_students` alone, and a promoted trainer keeps that row while carrying a real `"OA"`/`"OT"` role. `at_risk.py` currently uses the unsafe one, so **today a promoted trainer can be flagged "at risk" and emailed in the weekly digest.** Switching closes that.
3. **Nulls, not zeros (D13).** Every rate and mean is `float | None`, null when its own denominator is 0. A `0.0` renders as catastrophic failure.
4. **Missing data is excluded and the remaining weights renormalise to 100** — never zero-filled. Zero-filling inverts the feature: a student with no data would score lowest risk, or every new account would flag high.

### Project traps that have each cost a real session

- **`weekly_digest._risk_section` indexes `s["days_inactive"]` and `s["weak_topics"]` directly** (`weekly_digest.py:71-76`) — a `KeyError` if either is dropped, and `str(None) + "d inactive"` renders `"Noned inactive"`. Today `days_inactive` is always an int because rows with no `last_active` are skipped entirely (`at_risk.py:35-36`). The new model can flag a student on OSCE failure alone, so it **can** be `None`. Task 4 fixes the renderer in the same commit.
- **Frontend test fixtures are not type-checked.** The CI-gated aurora harness mocks all `/api/*` from **two** files — `frontend/tests/aurora_assert.mjs` and `frontend/tests/_mocks.mjs`. `tsc` and `build` do not read them, so a stale mock passes both gates and only fails at render. Any task reshaping a payload updates **both**. Routes with a query string need a trailing `*`.
- **Never leave a `db.*` call unstubbed in an endpoint test** — it reads and *writes* live production Supabase. The guard is the `_stub_admin_db` `_get_client` fixture in `tests/api/test_admin_endpoints.py:77-165`; adding a read means adding one line to its `defaults` dict. The `AsyncPostgrestClient` warning is **not** a reliable detector.
- **New `require_staff` endpoints go in `STAFF_READ_ENDPOINTS`** (`tests/api/test_admin_endpoints.py:22-30`) to inherit four guard-tier tests free. `/api/admin/student/stu_x/detail` is already listed.
- **There is no pytest config file** → pytest-asyncio runs strict: **every async test needs `@pytest.mark.asyncio`**.
- **pytest 9.0.3 aborts the session on a collection error.** Every Step 2 expecting a `ModuleNotFoundError` from a not-yet-created module needs `--continue-on-collection-errors`, or you see only `Interrupted: 1 error during collection`. A `from tools.supervisor import x` on an existing module raises `ImportError: cannot import name 'x'` instead — same cause, different text.
- **Never `importlib.reload(tools.api.shared)`** — routers bind `limiter` and `_case_cache` by reference; reloading silently 404s the affected tests.
- **Build with `npm --prefix frontend run build:safe`** (webpack). Turbopack rejects the junctioned `node_modules`. Invoke the harness as `SKIP_BUILD=1 bash scripts/start-harness.sh aurora` — without the flag the script runs Turbopack itself and dies. **Stop the harness server before any build** (it holds a `.next` lock → `EBUSY`). Run only one harness at a time.
- **`main` auto-deploys to Render production on push**, and CI's harness gate runs *after* the deploy starts. Verify green locally first.

## File structure

| File | Responsibility | Change | Tasks |
|---|---|---|---|
| `tools/supervisor/risk_model.py` | Risk weights, renormalisation, banding | **Create** (pure, no I/O) | 1 |
| `tools/supervisor/cohort_analytics.py` | Pure aggregation over raw events | Modify: append `osce_by_student`, `flashcard_by_student` (reuse `_score_rank`) | 2 |
| `tools/supervisor/at_risk.py` | Assemble population + score it | **Rewrite** (thin wiring; swallow removed) | 3 |
| `tools/supervisor/cohort_summary.py` | Cohort KPI roll-up | Modify: `at_risk_count` from the rubric; swallow removed | 4 |
| `tools/supervisor/weekly_digest.py` | Weekly digest email | Modify: `_risk_section` null-safe + shows band/reason | 4 |
| `tools/supervisor/mastery.py` | Three mastery scales, leave-one-out cohort | **Create** (pure, no I/O) | 6 |
| `tools/api/routers/admin.py` | Admin endpoints | Modify: `mastery` on `/student/{id}/detail` + rate limit | 7 |
| `frontend/src/hooks/useAdmin.ts` | Admin data layer | Modify: `AtRiskStudent` reasons, `StudentDetail.mastery`, drop dead `cohort_retention` | 5, 8 |
| `frontend/src/aurora/screens/AdminCohort.tsx` | Cohort band + at-risk list | Modify: render band, score, reasons | 5 |
| `frontend/src/aurora/components/admin/riskRowView.ts` | Pure view-model for an at-risk row | **Create** (no React → Node-testable) | 5 |
| `frontend/src/aurora/components/admin/DivergingBar.tsx` | Signed delta vs cohort (the one genuinely new chart in P2, spec §5.4) | **Create** | 8 |
| `frontend/src/aurora/components/admin/masteryView.ts` | Pure view-model for the three scales | **Create** | 8 |
| `frontend/src/aurora/screens/AdminStudentDetail.tsx` | Student drill-down | Modify: mastery block replaces the dead cohort read | 8 |
| `frontend/src/aurora/lib/studentReportExport.ts` | Downloadable report | Modify: `cohortPct` from `mastery`, not the dead field | 8 |
| `frontend/src/lib/queryClient.ts` | Persisted-query cache | Modify: `PERSIST_SCHEMA_VERSION` `"7"` → `"8"` | 8 |
| `tests/supervisor/test_risk_model.py` | Rubric maths, renormalisation, bands | **Create** | 1 |
| `tests/supervisor/test_cohort_analytics_by_student.py` | Per-student aggregation + D9 | **Create** | 2 |
| `tests/supervisor/test_at_risk.py` | At-risk wiring | **Rewrite** (same commit as Task 3) | 3 |
| `tests/supervisor/test_cohort_summary.py` | KPI agrees with the list | **Create** | 4 |
| `tests/supervisor/test_mastery.py` | Scales + leave-one-out | **Create** | 6 |
| `tests/api/test_admin_student_detail.py` | Endpoint payload + limiter | **Create** | 7 |
| `tests/api/test_admin_endpoints.py` | Guard tiers + prod-DB guard | Modify: two `_stub_admin_db` lines | 3, 7 |
| `frontend/tests/risk_rows_logic.mjs` | Pure view-model harness | **Create** | 5 |
| `frontend/tests/mastery_view_logic.mjs` | Pure view-model harness | **Create** | 8 |
| `frontend/tests/aurora_assert.mjs` | CI-gated browser harness | Modify: fixtures + assertions | 5, 8 |
| `frontend/tests/_mocks.mjs` | Shared harness fixtures | Modify: same routes | 5, 8 |
| `.github/workflows/ci.yml` | CI | Modify: register both logic harnesses (nothing auto-discovers) | 5, 8 |

---

## Task 1: The risk rubric and scoring model (pure)

The current model is one line: `days_inactive >= 5 AND len(weak) >= 2` (`at_risk.py:45`). It has no score, no reason, and no performance signal — a student who failed every OSCE station yesterday is not flagged, while one who took a week off with two self-reported weak topics is.

This task builds **only** the pure scoring function. It takes already-computed per-student signals and returns `{risk_score, band, reasons}`. No I/O, no DB, no aggregation — that keeps the weight policy unit-testable at every boundary and lets Task 3 stay thin wiring.

**Reuse, do not fork, the P2a normalisation seam.** `cohort_analytics.WEIGHT_RUBRIC` was written with this task in mind — its docstring (`cohort_analytics.py:208-211`) reserves `scales` and `confidence` for "Plan B's at-risk model … so the three sub-dicts are kept independent: neither model has to fork the normalisation policy to change its own weights." Import those two sub-dicts; declare only the weights, thresholds and bands here.

**Two rules make this model honest, and both are inversions if you get them wrong:**

- **Missing signals are excluded and the rest renormalise to 100** — never zero-filled. Zero-filling a missing signal scores a student with no data as *lowest* risk.
- **A profile-fact signal counts only once the student has started.** A brand-new account has `streak == 0` and `weak_topics == []`. Scoring `streak_broken` at full weight there flags every new account high — the exact failure the spec's missing-data rule exists to prevent. So `inactivity`, `streak_broken` and `weak_breadth` are present only when `days_inactive is not None` (i.e. the profile has a `last_active`), and a student with **no** profile activity and **no** performance rows is `band: "no_data"` with `reasons: [{"factor": "never_started"}]` and `risk_score: None` — not a fabricated 0.

**Shrinkage applies to sampled performance signals only.** `graded_n`, `safety_gradable_n` and flashcard `n` are samples: with ~24 OSCE attempts across 10 students, a single failed attempt is the common case, and undamped it would carry a full-weight deficit of 1.0. Reuse `SHRINKAGE_K` from `confidence` so a lone attempt keeps ~17% of its deficit. `inactivity`, `streak_broken` and `weak_breadth` are facts about the profile, not samples, so they are not shrunk.

**Files:**
- Create: `tools/supervisor/risk_model.py`
- Test: `tests/supervisor/test_risk_model.py`
- Read first (do not modify): `tools/supervisor/cohort_analytics.py:196-251` (`MIN_STUDENTS`, `MIN_ATTEMPTS`, `SHRINKAGE_K`, `WEIGHT_RUBRIC`, `_unit`)

- [ ] **Step 1: Write the failing test**

Create `tests/supervisor/test_risk_model.py`:

```python
"""Risk model: weights, renormalisation, banding (spec §6.1, D7)."""
import pytest

from tools.supervisor.risk_model import RISK_RUBRIC, band_for, score_student


def _signals(**over):
    """A started student with no performance data. Override one axis per test."""
    base = dict(days_inactive=0, streak=5, weak_count=0, osce=None, flashcard=None)
    base.update(over)
    return base


# ── The rubric itself ────────────────────────────────────────────────────────

def test_weights_sum_to_one():
    # Renormalisation divides by the weight of the signals PRESENT. If the full set
    # does not sum to 1.0, a student with every signal scores something other than
    # their true weighted deficit and the 0-100 scale silently stops being 0-100.
    assert sum(RISK_RUBRIC["weights"].values()) == pytest.approx(1.0)


def test_rubric_reuses_the_cohort_normalisation_seam():
    # cohort_analytics.WEIGHT_RUBRIC reserves `scales`/`confidence` for this model
    # (cohort_analytics.py:208-211). A forked copy drifts the moment either is tuned.
    from tools.supervisor.cohort_analytics import WEIGHT_RUBRIC
    assert RISK_RUBRIC["scales"] is WEIGHT_RUBRIC["scales"]
    assert RISK_RUBRIC["confidence"] is WEIGHT_RUBRIC["confidence"]


# ── Missing data: excluded, never zero-filled ────────────────────────────────

def test_never_started_is_no_data_not_a_zero_score():
    # No last_active and no performance rows. A 0 here reads as "lowest risk in the
    # cohort", inverting the feature for exactly the students who never engaged.
    out = score_student(days_inactive=None, streak=0, weak_count=0, osce=None, flashcard=None)
    assert out["band"] == "no_data"
    assert out["risk_score"] is None
    assert [r["factor"] for r in out["reasons"]] == ["never_started"]


def test_new_account_with_zero_streak_does_not_flag_high():
    # A brand-new account has streak 0 and no weak topics. Scoring streak_broken at
    # full weight would flag every new student high on their first day.
    out = score_student(**_signals(days_inactive=None, streak=0, osce={
        "pass_rate": 1.0, "graded_n": 1, "safety_fail_rate": None, "safety_gradable_n": 0,
    }))
    assert out["band"] in ("low", "medium")
    assert "streak_broken" not in [r["factor"] for r in out["reasons"]]


def test_absent_signal_is_dropped_from_the_denominator():
    # Two students, identical inactivity, one with no performance data. Excluding a
    # missing signal must not make the data-less student look SAFER than the other.
    only_inactive = score_student(**_signals(days_inactive=14, streak=0, weak_count=5))
    # Every present signal is at full deficit, so renormalisation must yield 100.
    assert only_inactive["risk_score"] == 100


def test_zero_filling_a_missing_signal_would_be_visible_here():
    # Same student, now WITH a perfect OSCE record. The score must fall, proving the
    # renormalised denominator actually grew rather than the deficit being summed raw.
    perfect_osce = score_student(**_signals(
        days_inactive=14, streak=0, weak_count=5,
        osce={"pass_rate": 1.0, "graded_n": 20, "safety_fail_rate": 0.0, "safety_gradable_n": 20},
    ))
    assert perfect_osce["risk_score"] < 100


# ── Shrinkage on sampled signals ─────────────────────────────────────────────

def test_one_failed_attempt_is_damped_by_shrinkage():
    # deficit 1.0 shrunk by n/(n+5) = 1/6, over a denominator of just this one signal.
    out = score_student(**_signals(days_inactive=None, streak=None, weak_count=0, osce={
        "pass_rate": 0.0, "graded_n": 1, "safety_fail_rate": None, "safety_gradable_n": 0,
    }))
    assert out["risk_score"] == 17
    assert out["band"] == "low"


def test_sustained_failure_outranks_a_single_attempt():
    # Same 0% pass rate over 20 attempts: 20/25 = 0.8 of the deficit survives.
    out = score_student(**_signals(days_inactive=None, streak=None, weak_count=0, osce={
        "pass_rate": 0.0, "graded_n": 20, "safety_fail_rate": None, "safety_gradable_n": 0,
    }))
    assert out["risk_score"] == 80
    assert out["band"] == "high"


def test_profile_facts_are_not_shrunk():
    # inactivity and weak_breadth are facts about the profile, not samples of size 1.
    # Both are at full deficit here (14/14 days, 5/5 topics) and nothing else is
    # present, so the renormalised score must be exactly 100. Shrinking a profile fact
    # uses n=0, giving a shrink factor of 0/(0+5) = 0, which would drop this to 29.
    out = score_student(**_signals(days_inactive=14, streak=None, weak_count=5))
    assert out["risk_score"] == 100


# ── Scale normalisation ──────────────────────────────────────────────────────

def test_flashcard_accuracy_is_scaled_off_100_not_summed_raw():
    # accuracy arrives 0-100 (db.get_topic_accuracy's `pct` convention). Without the
    # /100 divisor a 40% accuracy contributes a deficit of -39 instead of 0.6.
    out = score_student(**_signals(days_inactive=None, streak=None, flashcard={
        "accuracy": 40.0, "n": 100,
    }))
    assert 0 <= out["risk_score"] <= 100
    assert out["risk_score"] == 57  # 0.60 deficit * 100/105 shrink


def test_malformed_input_cannot_exceed_the_scale():
    # A corrupt 140% accuracy would otherwise contribute a NEGATIVE deficit and spend
    # more than its share of the renormalised budget.
    out = score_student(**_signals(days_inactive=None, streak=None, flashcard={
        "accuracy": 140.0, "n": 100,
    }))
    assert out["risk_score"] == 0


# ── Reasons ──────────────────────────────────────────────────────────────────

def test_reasons_are_sorted_by_contribution_descending():
    out = score_student(**_signals(days_inactive=14, streak=0, weak_count=1, osce={
        "pass_rate": 0.0, "graded_n": 20, "safety_fail_rate": 0.5, "safety_gradable_n": 20,
    }))
    weights = [r["weight"] for r in out["reasons"]]
    assert weights == sorted(weights, reverse=True)
    assert all(r["detail"] for r in out["reasons"]), "every reason needs trainer-readable text"


def test_reason_weights_are_the_renormalised_contribution():
    # A trainer reads these as "this is how much of the 100 came from here", so they
    # must sum to the score itself, not to the raw rubric weights.
    out = score_student(**_signals(days_inactive=14, streak=0, weak_count=5))
    # Tolerance covers the per-reason 1dp rounding plus the final int() — the point is
    # that they sum to the SCORE (100), not to the raw rubric weights (which would
    # total 0.30 -> 30 and be nowhere near it.)
    assert sum(r["weight"] for r in out["reasons"]) == pytest.approx(out["risk_score"], abs=1.0)


# ── Bands ────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("score,expected", [
    (100, "high"), (50, "high"), (49, "medium"), (28, "medium"), (27, "low"), (0, "low"),
])
def test_band_boundaries(score, expected):
    assert band_for(score) == expected


def test_band_for_none_is_no_data():
    assert band_for(None) == "no_data"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/supervisor/test_risk_model.py -q --continue-on-collection-errors`
Expected: FAIL — `ModuleNotFoundError: No module named 'tools.supervisor.risk_model'` (collection error; the flag is what lets you see it rather than `Interrupted: 1 error during collection`).

- [ ] **Step 3: Write minimal implementation**

Create `tools/supervisor/risk_model.py`:

```python
"""Deterministic, explainable at-risk scoring (spec §6.1, D7).

Pure: no I/O, no DB, no clock. Takes already-computed per-student signals and
returns `{risk_score, band, reasons}`. `at_risk.py` owns the reads; this module owns
the weight policy, so the policy is testable without a database and a weight change
cannot accidentally become a query change.

Replaces a single binary rule — `days_inactive >= 5 AND len(weak_topics) >= 2` — that
carried no score, no reason and no performance signal at all. That rule survives as
ONE input (`inactivity` plus `weak_breadth`), which is D7's "the old binary rule
becomes one input".

Three rules, each an inversion of the feature if broken:

* **Missing signals are excluded and the remaining weights renormalise to 100.**
  Zero-filling an absent signal scores a student with no data as the SAFEST in the
  cohort. Renormalising means every student is judged only on the evidence they have.
* **A profile-fact signal counts only once the student has started.** A new account
  has `streak == 0` and `weak_topics == []`; crediting `streak_broken` there flags
  every new account on day one. `inactivity`, `streak_broken` and `weak_breadth`
  therefore require `days_inactive is not None`, and a student with neither profile
  activity nor performance rows is `no_data` with `risk_score: None` — not a
  fabricated 0.
* **Shrinkage applies to sampled signals only.** `graded_n`, `safety_gradable_n` and
  flashcard `n` are samples; at ~24 OSCE attempts across 10 students a single attempt
  is the common case and undamped it carries a full deficit of 1.0. Inactivity and
  streak are facts about the profile, not samples of size 1, so shrinking them would
  report "inactive 14 days" as 17/100.
"""
from __future__ import annotations

from tools.supervisor.cohort_analytics import SHRINKAGE_K, WEIGHT_RUBRIC, _unit

# Days of inactivity that count as a full-deficit signal. The old rule fired a binary
# flag at 5; a ramp to 14 means "5 days off" and "a month gone" are no longer equal.
INACTIVITY_FULL_DAYS: int = 14
# Weak topics that count as full breadth. The old rule fired at 2; 5 is the point at
# which "a couple of gaps" becomes "not coping with the syllabus".
WEAK_BREADTH_FULL: int = 5

RISK_RUBRIC: dict = {
    "version": 1,
    # Sum to 1.0, then renormalised over the signals actually present.
    #
    # PERFORMANCE OUTWEIGHS ENGAGEMENT, 0.70 to 0.30, and the split is load-bearing.
    # An engagement-heavy rubric scores the headline case wrong: a student active daily
    # with a 9-day streak who failed 12 of 12 graded attempts with a safety fail on
    # every one comes out ~33/100 — "low", i.e. not flagged — because three zero-deficit
    # engagement signals hold nearly half the renormalised budget and dilute the
    # catastrophe. Surfacing exactly that student is why P2b exists.
    "weights": {
        "osce_failure": 0.30,    # graded attainment — the richest evidence by far
        "safety": 0.22,          # a safety fail matters out of proportion to frequency
        "flashcard": 0.18,       # recall, not performance, but still real evidence
        "inactivity": 0.18,      # the strongest ENGAGEMENT predictor of dropping out
        "streak_broken": 0.06,   # habit, and already partly inside `inactivity`
        "weak_breadth": 0.06,    # self-reported/derived gaps — the weakest evidence
    },
    "inactivity_full_days": INACTIVITY_FULL_DAYS,
    "weak_breadth_full": WEAK_BREADTH_FULL,
    # risk_score >= high -> "high"; >= medium -> "medium"; else "low".
    #
    # Calibrated to the range the shrinkage term can actually reach, not to round
    # numbers. A student whose ONLY signal is OSCE failure caps at
    # n/(n+5) * 100, so 20 failed attempts reach 80 but 12 reach 71 and 5 reach 50.
    # Thresholds of 60/35 would have left a fully-diluted engaged student failing 12
    # of 12 unsafely sitting below the flag line.
    "bands": {"high": 50, "medium": 28},
    # Reused BY REFERENCE from cohort_analytics, which reserved both sub-dicts for this
    # model (cohort_analytics.py:208-211). A copy would drift the moment either is tuned.
    "scales": WEIGHT_RUBRIC["scales"],
    "confidence": WEIGHT_RUBRIC["confidence"],
}

# Signals drawn from a sample, so their deficit is shrunk toward the no-evidence prior
# by n / (n + SHRINKAGE_K). The rest are profile facts and are used at face value.
_SAMPLED = frozenset({"osce_failure", "safety", "flashcard"})


def band_for(risk_score: int | None) -> str:
    """Band for a score. None (no signal at all) is `no_data`, never `low` — "we know
    nothing about this student" and "this student is fine" are different answers."""
    if risk_score is None:
        return "no_data"
    bands = RISK_RUBRIC["bands"]
    if risk_score >= bands["high"]:
        return "high"
    if risk_score >= bands["medium"]:
        return "medium"
    return "low"


def _components(
    days_inactive: int | None,
    streak: int | None,
    weak_count: int,
    osce: dict | None,
    flashcard: dict | None,
) -> dict[str, dict]:
    """Present signals only, as {name: {"deficit": 0-1, "n": int, "detail": str}}.

    An absent signal is simply missing from this dict. `n` is the sample size for the
    shrinkage term and is 0 for profile facts (which are not shrunk).
    """
    scales = RISK_RUBRIC["scales"]
    comps: dict[str, dict] = {}
    started = days_inactive is not None

    if started:
        comps["inactivity"] = {
            "deficit": _unit(days_inactive / INACTIVITY_FULL_DAYS),
            "n": 0,
            "detail": (
                "Active today" if days_inactive == 0
                else f"No activity for {days_inactive} day{'s' if days_inactive != 1 else ''}"
            ),
        }
        # `streak is None` means the profile carries no streak column at all, which is
        # absence of evidence, not a broken streak.
        if streak is not None:
            comps["streak_broken"] = {
                "deficit": 1.0 if int(streak) == 0 else 0.0,
                "n": 0,
                "detail": "Check-in streak is broken" if int(streak) == 0
                          else f"Check-in streak of {int(streak)} days",
            }
        comps["weak_breadth"] = {
            "deficit": _unit(weak_count / WEAK_BREADTH_FULL),
            "n": 0,
            "detail": f"{weak_count} weak topic{'s' if weak_count != 1 else ''} recorded",
        }

    o = osce or {}
    graded_n = int(o.get("graded_n") or 0)
    if o.get("pass_rate") is not None and graded_n > 0:
        pass_rate = float(o["pass_rate"])
        fails = round((1.0 - pass_rate) * graded_n)
        comps["osce_failure"] = {
            "deficit": _unit(1.0 - pass_rate / scales["osce_pass"]),
            "n": graded_n,
            "detail": f"Failed {fails} of {graded_n} graded OSCE attempt"
                      f"{'s' if graded_n != 1 else ''}",
        }
    safety_n = int(o.get("safety_gradable_n") or 0)
    if o.get("safety_fail_rate") is not None and safety_n > 0:
        rate = float(o["safety_fail_rate"])
        comps["safety"] = {
            # The one signal where higher is already worse, so it is not inverted.
            "deficit": _unit(rate / scales["safety"]),
            "n": safety_n,
            "detail": f"Safety fail on {round(rate * safety_n)} of {safety_n} "
                      f"gradable attempt{'s' if safety_n != 1 else ''}",
        }

    f = flashcard or {}
    fc_n = int(f.get("n") or 0)
    if f.get("accuracy") is not None and fc_n > 0:
        accuracy = float(f["accuracy"])
        comps["flashcard"] = {
            "deficit": _unit(1.0 - accuracy / scales["flashcard"]),
            "n": fc_n,
            "detail": f"Flashcard accuracy {round(accuracy)}% over {fc_n} answers",
        }
    return comps


def score_student(
    *,
    days_inactive: int | None,
    streak: int | None,
    weak_count: int,
    osce: dict | None,
    flashcard: dict | None,
) -> dict:
    """Score one student 0-100 (higher = more at risk) with the reasons behind it.

    Args:
        days_inactive: whole days since `last_active`, SGT. None when the profile has
            no `last_active` — the "has not started" signal, not a zero.
        streak: current check-in streak, or None when unknown.
        weak_count: `len(profile["weak_topics"])`.
        osce: per-student OSCE block from `cohort_analytics.osce_by_student`, or None.
            Reads `pass_rate`/`graded_n` and `safety_fail_rate`/`safety_gradable_n`,
            each with its own denominator — over half of production case_progress rows
            are unscored, so one shared denominator would mis-state both.
        flashcard: per-student block from `cohort_analytics.flashcard_by_student`
            ({accuracy 0-100, n}), or None.

    Returns `{"risk_score": int | None, "band": str, "reasons": [...]}`. `reasons` is
    sorted by contribution descending, and each `weight` is that signal's share of the
    final score (they sum to `risk_score`), because a trainer reads them as "this is
    where the number came from" — raw rubric weights would not add up to what is on
    screen.
    """
    comps = _components(days_inactive, streak, weak_count, osce, flashcard)
    if not comps:
        return {
            "risk_score": None,
            "band": "no_data",
            "reasons": [{"factor": "never_started", "weight": 0.0,
                         "detail": "No activity and no attempts recorded yet"}],
        }

    weights = RISK_RUBRIC["weights"]
    total_w = sum(weights[name] for name in comps)
    reasons: list[dict] = []
    score = 0.0
    for name, c in comps.items():
        shrink = c["n"] / (c["n"] + SHRINKAGE_K) if name in _SAMPLED else 1.0
        contribution = (weights[name] / total_w) * c["deficit"] * shrink
        score += contribution
        reasons.append({
            "factor": name,
            "weight": round(contribution * 100, 1),
            "detail": c["detail"],
        })

    # Fully ordered: biggest contributor first, then factor name. Dict insertion order
    # must not leak into a list a trainer acts on.
    reasons.sort(key=lambda r: (-r["weight"], r["factor"]))
    risk_score = int(round(score * 100))
    return {"risk_score": risk_score, "band": band_for(risk_score), "reasons": reasons}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/supervisor/test_risk_model.py -q`
Expected: PASS — 15 passed.

If `test_flashcard_accuracy_is_scaled_off_100_not_summed_raw` or either shrinkage test is off by 1, print the intermediate: `round(0.60 * (100/105) * 100)` is 57 and `round(1.0 * (1/6) * 100)` is 17. A mismatch means the shrinkage term or the renormalised denominator is wrong, not the assertion — fix the implementation.

- [ ] **Step 5: Mutation-test the two rules that matter**

Confirm the suite can actually fail for its own invariants:

1. Zero-fill instead of exclude — in `_components`, make the `osce_failure` branch emit `{"deficit": 0.0, "n": 1, "detail": "-"}` when `pass_rate` is None.
   Run: `python -m pytest tests/supervisor/test_risk_model.py -q`
   Expected: `test_absent_signal_is_dropped_from_the_denominator` FAILS (score drops below 100). Revert.
2. Shrink the profile facts — change `_SAMPLED` to include `"inactivity"`.
   Run: `python -m pytest tests/supervisor/test_risk_model.py -q`
   Expected: `test_profile_facts_are_not_shrunk` FAILS (100 → 29: inactivity carries `n=0`, so a shrink factor of `0/(0+5)` zeroes its whole contribution). Revert.

Both must fail. If either passes, the test is not pinning what it claims and must be strengthened before moving on.

- [ ] **Step 6: Commit**

```bash
git add tools/supervisor/risk_model.py tests/supervisor/test_risk_model.py
git commit -m "feat(admin): explainable risk rubric with renormalised missing signals"
```

---

## Task 2: Per-student OSCE and flashcard aggregation

Task 1's `score_student` needs `{pass_rate, graded_n, safety_fail_rate, safety_gradable_n}` and `{accuracy, n}` **per student**. `cohort_analytics` has these per *topic group* only (`osce_by_group`, `flashcard_by_group`).

**Append the per-student aggregators to `cohort_analytics.py` rather than writing them in `at_risk.py`.** Two reasons, both concrete:

- `_score_rank` encodes the D9 high-water rule including a `passed` tie-break whose docstring explains it is load-bearing for the *majority* of production rows (over half are unscored, so score and null-ness tie and `passed` is the only separator; `get_all_case_scores` orders oldest-first, so without it a student who failed pre-Tier-2 and passed on retake reads as failed). A second implementation in another module is the P2a lesson-1 failure mode.
- Task 6's mastery needs the same per-student OSCE numbers. One producer, two consumers.

These do **not** take a `case_index` or a `pool` — risk and mastery are per-student, not per-topic, so no case→topic mapping is involved and a student is never filtered out of their own row.

**Files:**
- Modify: `tools/supervisor/cohort_analytics.py` (append; `osce_by_group`, `flashcard_by_group`, `weakness_scores`, `_score_rank`, `WEIGHT_RUBRIC` all stay byte-for-byte)
- Test: `tests/supervisor/test_cohort_analytics_by_student.py` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/supervisor/test_cohort_analytics_by_student.py`:

```python
"""Per-student aggregation for the at-risk and mastery models (spec §6.1, §6.2, D9)."""
import pytest

from tools.supervisor.cohort_analytics import flashcard_by_student, osce_by_student


def _row(sid, case_id, **over):
    row = {"student_id": sid, "case_id": case_id, "score_100": None,
           "passed": False, "safe": None, "missed_critical": []}
    row.update(over)
    return row


def test_retakes_use_the_best_attempt_per_case():
    # D9: five attempts at one case is ONE attainment datapoint at the high-water mark,
    # but five raw attempts for volume. Averaging all five would let a student lower
    # their own mastery by practising.
    rows = [_row("s1", "c1", score_100=20 + i * 10, passed=i >= 3) for i in range(5)]
    out = osce_by_student(rows)
    assert out["s1"]["attempts"] == 5
    assert out["s1"]["avg_score"] == 60.0     # best of 20/30/40/50/60
    assert out["s1"]["scored_n"] == 1         # one (student, case) pair
    assert out["s1"]["pass_rate"] == 1.0      # best attempt passed
    assert out["s1"]["graded_n"] == 1


def test_unscored_retake_still_high_waters_on_passed():
    # Over half of production case_progress rows have NULL score_100. For those pairs
    # score and null-ness tie, so `passed` is the only separator — and rows arrive
    # oldest-first. Without the tie-break a fail-then-pass reads as a fail.
    rows = [_row("s1", "c1", passed=False), _row("s1", "c1", passed=True)]
    out = osce_by_student(rows)
    assert out["s1"]["pass_rate"] == 1.0
    assert out["s1"]["avg_score"] is None      # nothing was scored
    assert out["s1"]["scored_n"] == 0


def test_safety_is_over_raw_attempts_not_best_per_case():
    # A safety fail is an EVENT. Deduping it to the best attempt would let a student
    # erase an unsafe encounter by retaking the case safely.
    rows = [_row("s1", "c1", safe=False), _row("s1", "c1", safe=True)]
    out = osce_by_student(rows)
    assert out["s1"]["safety_gradable_n"] == 2
    assert out["s1"]["safety_fail_rate"] == 0.5


def test_null_safe_is_excluded_from_the_safety_denominator():
    rows = [_row("s1", "c1", safe=None), _row("s1", "c2", safe=False)]
    out = osce_by_student(rows)
    assert out["s1"]["safety_gradable_n"] == 1
    assert out["s1"]["safety_fail_rate"] == 1.0


def test_no_gradable_rows_yields_none_not_zero():
    # D13. A 0.0 pass_rate renders as "failed everything"; the truth is "nothing graded".
    rows = [_row("s1", "c1", passed=None, safe=None)]
    out = osce_by_student(rows)
    assert out["s1"]["pass_rate"] is None
    assert out["s1"]["safety_fail_rate"] is None
    assert out["s1"]["avg_score"] is None
    assert out["s1"]["attempts"] == 1


def test_students_are_kept_separate():
    rows = [_row("s1", "c1", score_100=90, passed=True),
            _row("s2", "c1", score_100=10, passed=False)]
    out = osce_by_student(rows)
    assert out["s1"]["avg_score"] == 90.0
    assert out["s2"]["avg_score"] == 10.0


def test_rows_without_a_student_id_are_dropped():
    out = osce_by_student([_row("", "c1", score_100=50, passed=True)])
    assert out == {}


def test_flashcard_accuracy_is_per_student_on_the_0_100_scale():
    # Same `pct` convention as db.get_topic_accuracy (db.py:240-243), so a student's
    # mastery figure and their own topic breakdown are directly comparable.
    rows = [{"student_id": "s1", "topic_tag": "glaucoma", "correct": True},
            {"student_id": "s1", "topic_tag": "glaucoma", "correct": False},
            {"student_id": "s1", "topic_tag": "retina", "correct": True},
            {"student_id": "s2", "topic_tag": "glaucoma", "correct": False}]
    out = flashcard_by_student(rows)
    assert out["s1"] == {"accuracy": 66.7, "n": 3}
    assert out["s2"] == {"accuracy": 0.0, "n": 1}


def test_flashcard_student_with_no_rows_is_absent_not_zero():
    # Absence is the no-data signal; the caller passes None to score_student, which
    # drops the signal. A 0.0 accuracy row would score as total recall failure.
    out = flashcard_by_student([])
    assert out == {}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/supervisor/test_cohort_analytics_by_student.py -q --continue-on-collection-errors`
Expected: FAIL — `ImportError: cannot import name 'osce_by_student' from 'tools.supervisor.cohort_analytics'`. (An `ImportError`, not `ModuleNotFoundError` — the module exists; the names do not.)

- [ ] **Step 3: Write minimal implementation**

Append to the end of `tools/supervisor/cohort_analytics.py`:

```python
# ── Per-student aggregation (Plan B: at-risk + mastery) ───────────────────────
#
# The by_group functions above answer "which TOPIC needs teaching". These answer
# "which STUDENT needs help" over the same rows, and deliberately live here rather
# than in at_risk.py so `_score_rank` — and the D9 high-water rule it encodes — has
# exactly one implementation. There is no `case_index` or `pool` parameter: a
# per-student figure needs no case->topic mapping, and a student must never be
# filtered out of their own row.


def osce_by_student(rows: list[dict]) -> dict[str, dict]:
    """Per-student OSCE metrics from raw `case_progress` rows.

    Same denominator and retake discipline as `osce_by_group`: attainment
    (`avg_score`, `pass_rate`) is the BEST attempt per (student, case) via
    `_score_rank`, `attempts` counts every raw row, and `safety_fail_rate` is over
    raw attempts because an unsafe encounter is an event, not an attainment level —
    a student must not be able to erase one by retaking the case safely.

    Returns dict[student_id, metrics]; a student with no rows is ABSENT, never a
    zero-filled entry, so the caller can pass None and have the signal dropped.
    """
    acc: dict[str, dict] = {}
    for r in rows:
        sid = str(r.get("student_id") or "")
        case_id = str(r.get("case_id") or "")
        if not sid:
            continue
        g = acc.setdefault(sid, {
            "attempts": 0, "best": {}, "safety_fails": 0, "safety_gradable_n": 0,
        })
        g["attempts"] += 1

        safe = r.get("safe")
        if safe is not None:
            g["safety_gradable_n"] += 1
            if not safe:
                g["safety_fails"] += 1

        key = (sid, case_id)
        current = g["best"].get(key)
        if current is None or _score_rank(r) > _score_rank(current):
            g["best"][key] = r

    out: dict[str, dict] = {}
    for sid, g in acc.items():
        best = list(g["best"].values())
        scores = [int(b["score_100"]) for b in best if b.get("score_100") is not None]
        graded = [bool(b["passed"]) for b in best if b.get("passed") is not None]
        gradable = g["safety_gradable_n"]
        out[sid] = {
            "attempts": g["attempts"],
            "avg_score": round(sum(scores) / len(scores), 1) if scores else None,
            "scored_n": len(scores),
            "pass_rate": round(sum(graded) / len(graded), 3) if graded else None,
            "graded_n": len(graded),
            "safety_fail_rate": round(g["safety_fails"] / gradable, 3) if gradable else None,
            "safety_gradable_n": gradable,
        }
    return out


def flashcard_by_student(rows: list[dict]) -> dict[str, dict]:
    """Per-student flashcard accuracy (0-100, 1dp) from raw `flashcard_attempts` rows.

    No topic bucketing and no pool filter — this is the student's whole-bank recall
    rate. 0-100 at 1dp is `db.get_topic_accuracy`'s `pct` convention (db.py:240-243),
    so this figure and the student's own per-topic breakdown are directly comparable.

    A student with no attempts is ABSENT, not `{"accuracy": 0.0}` — the table only
    started accruing rows when Plan A's Task 1 shipped, so a thin table is the norm
    and a 0.0 would read as total recall failure.
    """
    agg: dict[str, dict] = {}
    for r in rows:
        sid = str(r.get("student_id") or "")
        if not sid:
            continue
        bucket = agg.setdefault(sid, {"correct": 0, "n": 0})
        bucket["n"] += 1
        if r.get("correct"):
            bucket["correct"] += 1
    return {
        sid: {"accuracy": round(100 * b["correct"] / b["n"], 1), "n": b["n"]}
        for sid, b in agg.items()
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/supervisor/test_cohort_analytics_by_student.py tests/supervisor/ -q`
Expected: PASS — 9 new tests pass and every pre-existing `tests/supervisor/` test still passes (the append must not disturb `osce_by_group`).

- [ ] **Step 5: Mutation-test the retake and safety rules**

1. Dedupe safety to the best attempt — inside the `for r in rows` loop, move the `safe` block under the `if current is None or ...` branch.
   Expected: `test_safety_is_over_raw_attempts_not_best_per_case` FAILS. Revert.
2. Drop the `passed` tie-break — in `_score_rank`, return `(0, 0, 0)` instead of `(0, 0, passed)` for the unscored branch.
   Expected: `test_unscored_retake_still_high_waters_on_passed` FAILS **and** the pre-existing `tests/supervisor/test_cohort_analytics_osce.py` fails too. Revert.

- [ ] **Step 6: Commit**

```bash
git add tools/supervisor/cohort_analytics.py tests/supervisor/test_cohort_analytics_by_student.py
git commit -m "feat(admin): per-student OSCE and flashcard aggregation on the D9 rule"
```

---

## Task 3: Rewrite at_risk.py as thin wiring

`at_risk.py` becomes: assemble a staff-free population, read the two event tables, score each student, return the flagged bands. Four changes beyond swapping in the model, each fixing a live defect:

- **`except Exception → return []` goes** (`at_risk.py:26-28`). It makes the router's own 500 guard (`supervisor.py:83-84`) unreachable, so a Supabase outage renders as **"0 students at risk"** — "everyone is fine" is the worst possible way to fail this feature. Let it propagate.
- **`get_active_profiles()` → `get_active_student_profiles()`.** The former is not staff-free (see rule 2 in the critical context), so **today a promoted trainer can be flagged at risk and emailed in the weekly digest.**
- **`date.today()` → `app_today()`** (`tools/shared/clock.py:17`). The product defines a day in SGT and `last_active` is written that way; a UTC comparison can return `days_inactive == -1`. **Keep `date` imported as a module-level symbol** or the existing `patch("tools.supervisor.at_risk.date")` hook breaks — the rewritten tests use `app_today` instead, but `date.fromisoformat` is still needed for parsing.
- **Return only `band in {high, medium}`** (D12). The row shape is a **field superset** of today's, so all four consumers keep working: `last_active`, `days_inactive`, `weak_topics` and `weak_count` stay, and `risk_score`, `band` and `reasons` are added.

**A per-worker read cache is required, not optional.** `get_at_risk` now performs two whole-table paginated reads, and `/api/supervisor/at-risk` is on the admin console's 30-second `LIVE` poll — that is two table scans every 30s per open console, on Render's **single** uvicorn worker. Mirror the `_cohort_cache` pattern in `admin.py` (45s TTL, evict-on-write): it is the same idempotent-read-cache carve-out from production invariant #2, holding derived output only, with no counters and no cross-request semantics. Tests set the TTL to 0.

**Files:**
- Rewrite: `tools/supervisor/at_risk.py`
- Rewrite: `tests/supervisor/test_at_risk.py` (same commit — the two existing tests encode the binary rule and cannot survive)
- Modify: `tests/api/test_admin_endpoints.py` (one line in `_stub_admin_db`)
- Read first: `tools/api/routers/admin.py` `_cohort_cache` (the TTL/evict pattern to mirror), `tools/shared/db.py:599` (`get_active_student_profiles`), `tools/shared/db.py` `get_all_case_scores` / `get_all_flashcard_attempts` (both return `(rows, complete)`)

- [ ] **Step 1: Write the failing test**

Replace the whole of `tests/supervisor/test_at_risk.py`:

```python
"""At-risk wiring: population, clock, failure propagation, banding (spec §6.1, D10, D12)."""
from unittest.mock import AsyncMock, patch

import pytest

from tools.supervisor import at_risk as mod


def _profile(sid, weak_topics, last_active, streak=5, role="OA"):
    return {"student_id": sid, "weak_topics": weak_topics, "last_active": last_active,
            "streak": streak, "role": role}


def _case(sid, case_id, **over):
    row = {"student_id": sid, "case_id": case_id, "score_100": None, "passed": False,
           "safe": None, "missed_critical": []}
    row.update(over)
    return row


def _patches(profiles, cases=(), cards=()):
    """Patch the three reads get_at_risk makes. TTL 0 so the cache never hides a call."""
    return (
        patch("tools.shared.db.get_active_student_profiles",
              new=AsyncMock(return_value=(profiles, 0))),
        patch("tools.shared.db.get_all_case_scores",
              new=AsyncMock(return_value=(list(cases), True))),
        patch("tools.shared.db.get_all_flashcard_attempts",
              new=AsyncMock(return_value=(list(cards), True))),
        patch.object(mod, "_CACHE_TTL_S", 0),
    )


async def _run(profiles, cases=(), cards=(), today="2026-05-10"):
    from datetime import date as _date
    p1, p2, p3, p4 = _patches(profiles, cases, cards)
    with p1, p2, p3, p4, patch.object(mod, "app_today",
                                      return_value=_date.fromisoformat(today)):
        return await mod.get_at_risk()


# ── Row set and shape ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_returns_only_flagged_bands():
    # D12: low and no_data are computed but omitted, so all four existing consumers
    # keep reading "the list of students to act on".
    profiles = [
        _profile("s1", ["a", "b", "c", "d", "e"], "2026-04-20", streak=0),  # 20d, 5 weak
        _profile("s2", [], "2026-05-10", streak=9),                         # active today
        _profile("s3", [], None, streak=0),                                 # never started
    ]
    result = await _run(profiles)
    assert [r["student_id"] for r in result] == ["s1"]
    assert result[0]["band"] == "high"


@pytest.mark.asyncio
async def test_row_is_a_superset_of_the_old_contract():
    # weekly_digest._risk_section indexes days_inactive and weak_topics DIRECTLY
    # (weekly_digest.py:71-76) — a dropped key is a KeyError in a production email.
    profiles = [_profile("s1", ["a", "b", "c", "d", "e"], "2026-04-20", streak=0)]
    row = (await _run(profiles))[0]
    for key in ("student_id", "last_active", "days_inactive", "weak_topics", "weak_count",
                "risk_score", "band", "reasons"):
        assert key in row, f"missing {key}"
    assert row["weak_count"] == 5
    assert isinstance(row["reasons"], list) and row["reasons"]


@pytest.mark.asyncio
async def test_rows_are_sorted_worst_first():
    profiles = [
        _profile("mild", ["a", "b"], "2026-05-03", streak=3),
        _profile("severe", ["a", "b", "c", "d", "e"], "2026-04-01", streak=0),
    ]
    result = await _run(profiles)
    assert [r["student_id"] for r in result] == ["severe", "mild"]
    assert result[0]["risk_score"] >= result[1]["risk_score"]


# ── Performance signals reach the score ──────────────────────────────────────

@pytest.mark.asyncio
async def test_osce_failure_alone_can_flag_an_active_student():
    # The whole point of P2b. Under the old binary rule this student — active today,
    # no weak topics, 12 failed OSCE attempts — was invisible.
    profiles = [_profile("s1", [], "2026-05-10", streak=9)]
    cases = [_case("s1", f"c{i}", score_100=20, passed=False, safe=False) for i in range(12)]
    result = await _run(profiles, cases=cases)
    assert [r["student_id"] for r in result] == ["s1"]
    factors = [r["factor"] for r in result[0]["reasons"]]
    assert "osce_failure" in factors and "safety" in factors


@pytest.mark.asyncio
async def test_low_flashcard_accuracy_reaches_the_score():
    profiles = [_profile("s1", ["a", "b"], "2026-05-04", streak=0)]
    cards = [{"student_id": "s1", "topic_tag": "glaucoma", "correct": False}
             for _ in range(40)]
    result = await _run(profiles, cards=cards)
    assert "flashcard" in [r["factor"] for r in result[0]["reasons"]]


# ── Population, clock, failure ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_population_excludes_staff():
    # get_active_profiles() is NOT staff-free: a promoted trainer keeps their
    # approved_students row and a real "OA" role, so the old code could flag a
    # colleague at risk and email it in the weekly digest.
    profiles = [_profile("s1", ["a", "b", "c", "d", "e"], "2026-04-20", streak=0)]
    p1, p2, p3, p4 = _patches(profiles)
    from datetime import date as _date
    with p1, p2, p3, p4, patch.object(mod, "app_today",
                                      return_value=_date(2026, 5, 10)), \
         patch("tools.shared.db.get_active_profiles",
               new=AsyncMock(side_effect=AssertionError("must not read the staff-inclusive population"))):
        result = await mod.get_at_risk()
    assert len(result) == 1


@pytest.mark.asyncio
async def test_uses_the_sgt_clock():
    # last_active is written in SGT. Comparing against a UTC today can yield -1 days.
    profiles = [_profile("s1", [], "2026-05-10", streak=9)]
    p1, p2, p3, p4 = _patches(profiles)
    from datetime import date as _date
    with p1, p2, p3, p4, patch.object(mod, "app_today",
                                      return_value=_date(2026, 5, 10)) as sgt:
        await mod.get_at_risk()
    assert sgt.called, "get_at_risk must read the SGT clock, not date.today()"


@pytest.mark.asyncio
async def test_db_failure_propagates_instead_of_returning_empty():
    # The old `except Exception: return []` made supervisor.py's 500 guard unreachable,
    # so an outage rendered as "0 students at risk" — i.e. "everyone is fine".
    with patch("tools.shared.db.get_active_student_profiles",
               new=AsyncMock(side_effect=RuntimeError("supabase down"))), \
         patch.object(mod, "_CACHE_TTL_S", 0):
        with pytest.raises(RuntimeError):
            await mod.get_at_risk()


@pytest.mark.asyncio
async def test_unparseable_last_active_is_treated_as_unknown_not_as_today():
    # A garbage date must not read as "active today" (which would hide a real risk).
    profiles = [_profile("s1", [], "not-a-date", streak=0)]
    cases = [_case("s1", f"c{i}", score_100=10, passed=False) for i in range(20)]
    result = await _run(profiles, cases=cases)
    assert result and result[0]["days_inactive"] is None
    assert "inactivity" not in [r["factor"] for r in result[0]["reasons"]]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/supervisor/test_at_risk.py -q`
Expected: FAIL — `AttributeError: <module 'tools.supervisor.at_risk'> does not have the attribute '_CACHE_TTL_S'` on most tests, plus `KeyError: 'band'`. Both names arrive in Step 3.

- [ ] **Step 3: Write minimal implementation**

Replace the whole of `tools/supervisor/at_risk.py`:

```python
#!/usr/bin/env python3
"""Score every active student for academic risk and return the flagged ones.

Thin wiring: `risk_model` owns the weight policy and `cohort_analytics` owns the
aggregation, so this module only assembles the population, reads the events and
projects the rows. Replaces a single binary rule
(`days_inactive >= 5 AND len(weak_topics) >= 2`) that carried no score, no reason and
no performance signal — a student who failed every station yesterday was invisible.

Three deliberate departures from the old implementation:

* **Failures propagate.** The old `except Exception: return []` made the router's 500
  guard (`supervisor.py:83-84`) unreachable, so a Supabase outage rendered as "0
  students at risk" — the most dangerous possible way for this feature to fail.
* **Population is staff-free.** `db.get_active_profiles()` filters on
  approved_students membership alone, and `admin_promote` leaves that row in place, so
  a promoted trainer carrying a real "OA" role stayed in the cohort — flagged at risk
  and emailed in the weekly digest. `get_active_student_profiles()` subtracts
  `supervisors` membership.
* **SGT clock.** `last_active` is written in SGT and the product defines a day that
  way; `date.today()` on a UTC host can return `days_inactive == -1`.

Only `band in {high, medium}` is returned (D12). `low` and `no_data` are computed and
dropped, so all four consumers keep reading "the students to act on" — and the row is
a strict SUPERSET of the old shape, because `weekly_digest._risk_section` indexes
`days_inactive` and `weak_topics` directly.
"""
import sys
import time
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared import db
from tools.shared.clock import app_today
from tools.supervisor.cohort_analytics import flashcard_by_student, osce_by_student
from tools.supervisor.risk_model import score_student

# Bands worth a trainer's attention. `low`/`no_data` are computed, then dropped (D12).
FLAGGED_BANDS = ("high", "medium")

# Per-worker read cache. get_at_risk does two whole-table paginated reads and
# /api/supervisor/at-risk sits on the console's 30s poll, so an open console would
# otherwise scan both tables twice a minute on Render's SINGLE uvicorn worker. This is
# the idempotent-read-cache carve-out of production invariant #2: derived output only,
# no counters, no cross-request semantics. Tests patch _CACHE_TTL_S to 0.
_CACHE_TTL_S: float = 45.0
_cache: dict[str, tuple[float, list[dict]]] = {}


def _days_inactive(last_active_raw) -> int | None:
    """Whole days since `last_active` in SGT, or None when it is absent or unparseable.

    None means "unknown", which `risk_model` drops as a missing signal. Returning 0
    would read as "active today" and hide a genuinely stale account behind bad data.
    """
    if not last_active_raw:
        return None
    try:
        return (app_today() - date.fromisoformat(str(last_active_raw))).days
    except (ValueError, TypeError):
        return None


async def get_at_risk() -> list[dict]:
    """Flagged students, worst first.

    Returns list of dicts:
        {student_id, risk_score, band, reasons, last_active, days_inactive,
         weak_topics, weak_count}

    Raises on a read failure — the caller's 500 guard is the correct response, not an
    empty list.
    """
    now = time.monotonic()
    if _CACHE_TTL_S > 0:
        # Evict on write rather than only skipping stale entries, so a long-running
        # worker cannot accumulate them.
        for key in [k for k, (ts, _) in _cache.items() if now - ts >= _CACHE_TTL_S]:
            _cache.pop(key, None)
        hit = _cache.get("all")
        if hit is not None:
            return hit[1]

    profiles, _staff_excluded = await db.get_active_student_profiles()
    case_rows, _cases_complete = await db.get_all_case_scores()
    card_rows, _cards_complete = await db.get_all_flashcard_attempts()

    osce = osce_by_student(case_rows)
    flashcard = flashcard_by_student(card_rows)

    flagged: list[dict] = []
    for p in profiles:
        sid = str(p.get("student_id") or "")
        if not sid:
            continue
        weak = p.get("weak_topics") or []
        last_active_raw = p.get("last_active")
        days = _days_inactive(last_active_raw)
        streak = p.get("streak")

        scored = score_student(
            days_inactive=days,
            streak=int(streak) if streak is not None else None,
            weak_count=len(weak),
            osce=osce.get(sid),
            flashcard=flashcard.get(sid),
        )
        if scored["band"] not in FLAGGED_BANDS:
            continue
        flagged.append({
            "student_id": sid,
            "risk_score": scored["risk_score"],
            "band": scored["band"],
            "reasons": scored["reasons"],
            # Back-compat superset — weekly_digest indexes these directly.
            "last_active": str(last_active_raw) if last_active_raw else "",
            "days_inactive": days,
            "weak_topics": weak,
            "weak_count": len(weak),
        })

    # Fully ordered: worst first, then id, so a tie does not reorder between polls.
    flagged.sort(key=lambda r: (-(r["risk_score"] or 0), r["student_id"]))
    if _CACHE_TTL_S > 0:
        _cache["all"] = (now, flagged)
    return flagged
```

- [ ] **Step 4: Add the two new reads to the endpoint-test DB guard**

In `tests/api/test_admin_endpoints.py`, inside `_stub_admin_db`'s `defaults` dict, add:

```python
        # GET /api/supervisor/at-risk via at_risk.get_at_risk (P2b)
        "tools.shared.db.get_active_student_profiles": ([], 0),
        "tools.shared.db.get_all_case_scores": ([], True),
```

`get_all_flashcard_attempts` is already stubbed there by Plan A's Task 9. Without these lines an at-risk test scans and writes **live production Supabase**.

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/supervisor/test_at_risk.py tests/api/test_admin_endpoints.py -q`
Expected: PASS — 10 at-risk tests plus the whole guard suite.

Then the full backend suite, because three consumers import this module:
Run: `python -m pytest -q`
Expected: PASS, no failures. If `tests/supervisor/test_cohort_summary*` or a digest test fails, that is Task 4's work — note it and continue; do **not** patch it here.

- [ ] **Step 6: Mutation-test the swallow and the population**

1. Restore the swallow — wrap the three reads in `try: ... except Exception: return []`.
   Expected: `test_db_failure_propagates_instead_of_returning_empty` FAILS. Revert.
2. Restore the unsafe population — swap in `await db.get_active_profiles()` (dropping the tuple unpack).
   Expected: `test_population_excludes_staff` FAILS on the `AssertionError` side-effect. Revert.

- [ ] **Step 7: Commit**

```bash
git add tools/supervisor/at_risk.py tests/supervisor/test_at_risk.py tests/api/test_admin_endpoints.py
git commit -m "feat(admin): at-risk becomes a scored, explainable, staff-free model"
```

---

## Task 4: Reconcile the KPI, the swallow and the digest renderer

`cohort_summary.at_risk_count` is an **independent hardcoded copy** of the binary rule (`cohort_summary.py:62`). Left alone it now contradicts the list beneath it in three places at once:

- `AdminCohort.tsx:41` reads `c?.at_risk_count ?? atRisk.data?.length` — it **prefers** the count, so the KPI and the list disagree on one screen.
- `supervisor_insights` feeds **both** numbers into a single AI prompt (`supervisor.py:233,235`), so the narrative is generated from self-contradictory input.
- `weekly_digest` renders the count as a KPI (`weekly_digest.py:174`) directly above the list (`:134`).

**The spec's formula is wrong here — use `count(band in {"high","medium"})`.** Spec §6.1 says `count(band != "low")`, which also counts `no_data` and would make the KPI exceed the list. See the corrections table.

**The harness pins that KPI to a fixture, so CI will not catch a divergence** — hence the explicit agreement test below.

Two more fixes in the same commit:

- **`cohort_summary`'s all-zeros swallow goes** (`cohort_summary.py:26-33`). Same defect class as at-risk: an outage renders as a healthy cohort of 0 students.
- **`weekly_digest._risk_section` becomes null-safe.** It does `str(s["days_inactive"]) + 'd inactive'` (`weekly_digest.py:73`). Today `days_inactive` is always an int because rows without `last_active` are skipped; the new model can flag a student on OSCE failure alone, so `None` reaches it and the email would read **"Noned inactive"**. Show the top reason instead — the digest is the one surface where a trainer cannot click through for detail.

**Files:**
- Modify: `tools/supervisor/cohort_summary.py`
- Modify: `tools/supervisor/weekly_digest.py` (`_risk_section`, lines 64-79)
- Test: `tests/supervisor/test_cohort_summary.py` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/supervisor/test_cohort_summary.py`:

```python
"""The at-risk KPI must equal the list beneath it (spec §6.1)."""
import contextlib
from datetime import date
from unittest.mock import AsyncMock, patch

import pytest

from tools.supervisor import at_risk as at_risk_mod
from tools.supervisor import cohort_summary as cohort_summary_mod
from tools.supervisor.cohort_summary import cohort_summary


def _profile(sid, weak_topics, last_active, streak=5, role="OA"):
    return {"student_id": sid, "weak_topics": weak_topics, "last_active": last_active,
            "streak": streak, "role": role}


# Chosen so the OLD binary rule and the NEW model DISAGREE — otherwise this suite
# passes before the fix and pins nothing. Against today=2026-05-10:
#   high1  39d inactive, 5 weak, streak 0 -> old: flagged  · new: high (100)
#   mid1    7d inactive, 2 weak, streak 0 -> old: flagged  · new: high (58)
#   osce1  active today, 20 failed unsafe -> old: MISSED   · new: high (51)
#   fine   active today, no weak topics   -> old: clear    · new: low
#   nodata never started                  -> old: skipped  · new: no_data
# Old count: 2. New count and list length: 3.
_POPULATION = [
    _profile("high1", ["a", "b", "c", "d", "e"], "2026-04-01", streak=0),
    _profile("mid1", ["a", "b"], "2026-05-03", streak=0),
    _profile("osce1", [], "2026-05-10", streak=9),
    _profile("fine", [], "2026-05-10", streak=9),
    _profile("nodata", [], None, streak=0),
]
_CASES = [{"student_id": "osce1", "case_id": f"c{i}", "score_100": 10,
           "passed": False, "safe": False, "missed_critical": []} for i in range(20)]


@contextlib.contextmanager
def _patched():
    """Every read BOTH functions make. cohort_summary reads get_active_profiles for its
    own total/active_this_week KPIs while get_at_risk reads the staff-free population —
    leaving either unstubbed scans and WRITES live production Supabase."""
    with patch("tools.shared.db.get_active_profiles",
               new=AsyncMock(return_value=_POPULATION)), \
         patch("tools.shared.db.get_active_student_profiles",
               new=AsyncMock(return_value=(_POPULATION, 0))), \
         patch("tools.shared.db.get_all_case_scores",
               new=AsyncMock(return_value=(_CASES, True))), \
         patch("tools.shared.db.get_all_flashcard_attempts",
               new=AsyncMock(return_value=([], True))), \
         patch.object(at_risk_mod, "_CACHE_TTL_S", 0), \
         patch.object(at_risk_mod, "app_today", return_value=date(2026, 5, 10)), \
         patch.object(cohort_summary_mod, "app_today", return_value=date(2026, 5, 10)):
        yield


@pytest.mark.asyncio
async def test_kpi_equals_the_length_of_the_list():
    # AdminCohort.tsx:41 PREFERS at_risk_count over the list length, and
    # supervisor_insights feeds both into one AI prompt (supervisor.py:233,235).
    # A count that includes no_data would exceed the list it sits above.
    with _patched():
        summary = await cohort_summary()
        rows = await at_risk_mod.get_at_risk()
    assert summary["at_risk_count"] == len(rows) == 3


@pytest.mark.asyncio
async def test_no_data_students_are_not_counted_as_at_risk():
    # "We know nothing about this student" is not "this student is at risk".
    with _patched():
        summary = await cohort_summary()
    assert summary["at_risk_count"] == 3, "the never-started student must not be counted"


@pytest.mark.asyncio
async def test_the_old_binary_rule_would_have_missed_the_failing_student():
    # osce1 is active daily with a 9-day streak and failed 20 of 20 attempts unsafely.
    # The rule this task deletes (days_inactive >= 5 AND len(weak) >= 2) never saw them.
    with _patched():
        rows = await at_risk_mod.get_at_risk()
    assert "osce1" in [r["student_id"] for r in rows]


@pytest.mark.asyncio
async def test_db_failure_propagates_instead_of_an_all_zero_cohort():
    # The old `except Exception` returned total=0/at_risk_count=0, i.e. a perfectly
    # healthy empty cohort, and made supervisor.py:74-75's 500 guard unreachable.
    with patch("tools.shared.db.get_active_profiles",
               new=AsyncMock(side_effect=RuntimeError("supabase down"))), \
         patch("tools.shared.db.get_active_student_profiles",
               new=AsyncMock(side_effect=RuntimeError("supabase down"))):
        with pytest.raises(RuntimeError):
            await cohort_summary()


def test_digest_risk_row_survives_a_null_days_inactive():
    # The new model can flag a student on OSCE failure alone, so days_inactive is
    # None and the old renderer produced "Noned inactive" in a production email.
    from tools.supervisor.weekly_digest import _risk_section
    html = _risk_section([{
        "student_id": "stu_abcdef123456", "risk_score": 72, "band": "high",
        "reasons": [{"factor": "osce_failure", "weight": 40.0,
                     "detail": "Failed 9 of 12 graded OSCE attempts"}],
        "last_active": "", "days_inactive": None, "weak_topics": [], "weak_count": 0,
    }])
    assert "None" not in html
    assert "Failed 9 of 12 graded OSCE attempts" in html


def test_digest_risk_row_shows_the_band_and_score():
    from tools.supervisor.weekly_digest import _risk_section
    html = _risk_section([{
        "student_id": "stu_abcdef123456", "risk_score": 72, "band": "high",
        "reasons": [{"factor": "inactivity", "weight": 25.0, "detail": "No activity for 20 days"}],
        "last_active": "2026-04-20", "days_inactive": 20, "weak_topics": ["a"], "weak_count": 1,
    }])
    assert "72" in html and "high" in html.lower()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/supervisor/test_cohort_summary.py -q`
Expected: FAIL on four counts —
- `test_kpi_equals_the_length_of_the_list` with `assert 2 == 3`: the old hardcoded binary rule flags `high1` and `mid1` but never sees `osce1`, while the new list returns all three.
- `test_the_old_binary_rule_would_have_missed_the_failing_student` — passes already (it exercises the *new* `get_at_risk` from Task 3), so treat a pass here as expected, not as a problem.
- `test_db_failure_propagates_instead_of_an_all_zero_cohort` with `Failed: DID NOT RAISE`.
- `test_digest_risk_row_survives_a_null_days_inactive` with `assert "None" not in html`.

- [ ] **Step 3: Write minimal implementation**

**3a.** In `tools/supervisor/cohort_summary.py`, delete the `try`/`except` around the read (lines 26-33) so it reads:

```python
    # Failures propagate: supervisor.py:74-75 turns them into a 500. The old
    # all-zeros return made that guard unreachable and rendered an outage as a
    # perfectly healthy cohort of 0 students.
    profiles = await db.get_active_profiles()
```

**3b.** Replace the `today = date.today()` line with the SGT clock and add the import:

```python
from tools.shared.clock import app_today
```

```python
    today = app_today()
```

**3c.** Delete the hardcoded rule. Remove `at_risk_count = 0` (line 39) and the `if days_inactive is not None and days_inactive >= 5 and len(weak) >= 2: at_risk_count += 1` block (lines 62-63), then replace the `"at_risk_count"` entry in the return dict with:

```python
        # ONE definition of "at risk", shared with the list this KPI sits above.
        # A second copy of the rule here is what made the count contradict the list —
        # and AdminCohort.tsx:41 prefers this number over the list's own length, while
        # supervisor_insights feeds both into a single AI prompt.
        "at_risk_count": len(await get_at_risk()),
```

Add the import at the top of the file:

```python
from tools.supervisor.at_risk import get_at_risk
```

> `get_at_risk` has its own 45s read cache, so the console's paired `/cohort` + `/at-risk` polls do not double the table scans.

**3d.** In `tools/supervisor/weekly_digest.py`, replace `_risk_section`'s `rows = "".join(...)` generator (lines 67-79) with:

```python
    rows = "".join(
        '<tr>'
        '<td style="padding:10px 12px;border-bottom:1px solid ' + C_BORDER + ';'
        'font-family:monospace;font-size:12px;color:' + C_DARK + '">'
        + s["student_id"][:12] + '…</td>'
        '<td style="padding:10px 12px;border-bottom:1px solid ' + C_BORDER + ';'
        'color:' + (C_RED if s.get("band") == "high" else C_MUTED) + ';font-weight:600">'
        + str(s.get("risk_score") or 0) + ' · ' + str(s.get("band") or "") + '</td>'
        '<td style="padding:10px 12px;border-bottom:1px solid ' + C_BORDER + ';'
        'color:' + C_MUTED + ';font-size:12px">'
        # The top reason, not the raw day count: days_inactive is None for a student
        # flagged on OSCE failure alone, and str(None) rendered "Noned inactive".
        + _top_reason(s) + '</td>'
        '</tr>'
        for s in at_risk[:10]
    )
```

And add this helper immediately above `_risk_section`:

```python
def _top_reason(row: dict) -> str:
    """The highest-weighted reason as plain text, for the one surface with no drill-down."""
    reasons = row.get("reasons") or []
    if reasons:
        return str(reasons[0].get("detail") or "")
    weak = row.get("weak_topics") or []
    return ", ".join(weak[:3]).replace("_", " ")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/supervisor/ -q`
Expected: PASS — 6 new tests plus every pre-existing supervisor test.

Run: `python -m pytest -q`
Expected: PASS across the whole suite. A digest or supervisor-router test asserting the old all-zeros behaviour must be **updated, not deleted** — the new behaviour is the fix.

- [ ] **Step 5: Mutation-test the KPI agreement**

Change `"at_risk_count": len(await get_at_risk())` to count `band != "low"` by inlining the spec's original formula. The cleanest mutation: make `FLAGGED_BANDS` in `at_risk.py` `("high", "medium", "no_data")` and confirm `test_no_data_students_are_not_counted_as_at_risk` FAILS. Revert.

- [ ] **Step 6: Commit**

```bash
git add tools/supervisor/cohort_summary.py tools/supervisor/weekly_digest.py tests/supervisor/test_cohort_summary.py
git commit -m "fix(admin): one definition of at-risk for the KPI, the list and the digest"
```

---

## Task 5: Render the band, score and reasons

The at-risk list currently shows a student id and a day count. Now it must answer *why* — that is the whole point of D7, and the standing "explain to users" rule applies.

Put the row projection in a **pure `.ts` module** with a Node harness, matching Plan A's `cohortAnalyticsView.ts`: band ordering, score clamping and reason truncation are logic, and logic inside a `.tsx` can only be tested through a browser.

**Files:**
- Create: `frontend/src/aurora/components/admin/riskRowView.ts`
- Create: `frontend/tests/risk_rows_logic.mjs`
- Modify: `frontend/src/hooks/useAdmin.ts` (the at-risk row type)
- Modify: `frontend/src/aurora/screens/AdminCohort.tsx` (render band + score + reasons)
- Modify: `frontend/tests/_mocks.mjs` and `frontend/tests/aurora_assert.mjs` (fixtures + assertions)
- Modify: `.github/workflows/ci.yml` (register the harness — nothing auto-discovers)

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/risk_rows_logic.mjs`:

```js
// Pure view-model for the at-risk list. Run: node frontend/tests/risk_rows_logic.mjs
import { riskRows, BAND_ORDER } from "../src/aurora/components/admin/riskRowView.ts";

let failures = 0;
const check = (name, cond) => {
  if (cond) { console.log(`  PASS  ${name}`); }
  else { console.log(`  FAIL  ${name}`); failures++; }
};

const row = (over = {}) => ({
  student_id: "stu_abcdef123456", risk_score: 72, band: "high",
  reasons: [
    { factor: "inactivity", weight: 25.0, detail: "No activity for 20 days" },
    { factor: "osce_failure", weight: 18.5, detail: "Failed 9 of 12 graded OSCE attempts" },
    { factor: "safety", weight: 12.0, detail: "Safety fail on 3 of 12 gradable attempts" },
    { factor: "flashcard", weight: 9.0, detail: "Flashcard accuracy 41% over 88 answers" },
  ],
  last_active: "2026-04-20", days_inactive: 20, weak_topics: ["a"], weak_count: 1,
  ...over,
});

// --- ordering -------------------------------------------------------------
const mixed = riskRows([row({ student_id: "m", band: "medium", risk_score: 40 }), row()]);
check("high sorts above medium", mixed[0].band === "high");
check("band order is high then medium", BAND_ORDER.indexOf("high") < BAND_ORDER.indexOf("medium"));

// --- reasons --------------------------------------------------------------
const [r] = riskRows([row()]);
check("caps reasons at three", r.reasons.length === 3);
check("keeps the heaviest reason first", r.reasons[0].detail.startsWith("No activity"));
check("drops a zero-weight reason", riskRows([row({
  reasons: [{ factor: "streak_broken", weight: 0, detail: "Check-in streak of 9 days" }],
})])[0].reasons.length === 0);

// --- defensive ------------------------------------------------------------
check("survives a missing reasons array", riskRows([row({ reasons: undefined })])[0].reasons.length === 0);
check("survives a null risk_score", riskRows([row({ risk_score: null })])[0].scoreLabel === "—");
check("clamps an out-of-range score", riskRows([row({ risk_score: 140 })])[0].scorePct === 100);
check("ignores an unknown band instead of throwing", riskRows([row({ band: "weird" })]).length === 1);
check("empty input is an empty list", riskRows([]).length === 0);
check("survives a null payload", riskRows(null).length === 0);

// --- labels ---------------------------------------------------------------
check("shortens the student id", r.idLabel.length <= 13);
check("score label is the number", r.scoreLabel === "72");

console.log(failures === 0 ? "\nrisk_rows_logic: all passed" : `\nrisk_rows_logic: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types frontend/tests/risk_rows_logic.mjs`
Expected: FAIL — `Cannot find module '.../riskRowView.ts'`.

> If the repo's other logic harnesses are invoked plainly as `node frontend/tests/<name>.mjs`, match that exactly — check how `cohort_panels_logic.mjs` is invoked in `.github/workflows/ci.yml` and use the same form for both the run command and the CI entry.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/aurora/components/admin/riskRowView.ts`:

```ts
/** Pure view-model for the at-risk list — no React, so it is Node-testable.
 *
 * The endpoint returns only `high`/`medium` bands (D12) already sorted worst-first,
 * but this re-sorts defensively: the list is polled every 30s and a tie that reorders
 * between polls makes rows jump under the cursor.
 */
import type { AtRiskStudent, RiskReason } from "@/hooks/useAdmin";

export const BAND_ORDER = ["high", "medium", "low", "no_data"] as const;

/** How many reasons a row shows. Three is what fits one line at the narrowest
 *  supported width; the rest are one click away in the drill-down. */
const MAX_REASONS = 3;

export interface RiskRowView {
  studentId: string;
  idLabel: string;
  band: string;
  /** null risk_score renders "—", never "0" — a 0 reads as "lowest risk in the cohort". */
  scoreLabel: string;
  scorePct: number;
  reasons: RiskReason[];
}

export function riskRows(rows: AtRiskStudent[] | null | undefined): RiskRowView[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => {
      const score = typeof r.risk_score === "number" ? r.risk_score : null;
      return {
        studentId: String(r.student_id ?? ""),
        idLabel: `${String(r.student_id ?? "").slice(0, 12)}…`,
        band: String(r.band ?? ""),
        scoreLabel: score === null ? "—" : String(score),
        scorePct: Math.max(0, Math.min(100, score ?? 0)),
        reasons: (Array.isArray(r.reasons) ? r.reasons : [])
          // A zero-weight signal contributed nothing to the score, so showing it as a
          // "reason" would be a lie — a healthy 9-day streak is not why anyone is flagged.
          .filter((x) => (x?.weight ?? 0) > 0)
          .slice(0, MAX_REASONS),
      };
    })
    .sort((a, b) => {
      const band = bandRank(a.band) - bandRank(b.band);
      return band !== 0 ? band : b.scorePct - a.scorePct;
    });
}

function bandRank(band: string): number {
  const i = (BAND_ORDER as readonly string[]).indexOf(band);
  // An unrecognised band sorts last rather than throwing — a payload we do not
  // understand must not blank the whole panel.
  return i === -1 ? BAND_ORDER.length : i;
}
```

In `frontend/src/hooks/useAdmin.ts`, add the two types next to the existing at-risk types and widen the row the at-risk query returns:

```ts
export interface RiskReason { factor: string; detail: string; weight: number; }
export interface AtRiskStudent {
  student_id: string;
  // P2b: scored model. risk_score is null only for bands the endpoint does not return.
  risk_score: number | null;
  band: "high" | "medium" | "low" | "no_data";
  reasons: RiskReason[];
  // Back-compat superset kept by D12. days_inactive is null when last_active is
  // absent or unparseable — a student can now be flagged on OSCE failure alone.
  last_active: string;
  days_inactive: number | null;
  weak_topics: string[];
  weak_count: number;
}
```

> Read `useAdmin.ts` first and reuse whatever the at-risk query is already typed with — if an `AtRiskStudent` (or similarly named) interface exists, widen it in place rather than declaring a second one. No `PERSIST_SCHEMA_VERSION` bump is needed for this task: `["admin","at-risk"]` is an existing key whose shape gains optional-to-read fields, and the render path is defensive. Task 8 bumps it for the `mastery` shape change.

**3b.** In `frontend/src/aurora/screens/AdminCohort.tsx`, render through the view-model. Replace the at-risk row markup with a band pill, the score, and the reason list:

```tsx
{riskRows(atRisk.data).map((r) => (
  <li key={r.studentId} className="aurora-risk-row">
    <span className="aurora-risk-band" data-testid="risk-band" data-band={r.band}>{r.band}</span>
    <code className="aurora-risk-id">{r.idLabel}</code>
    <span className="aurora-risk-score" data-testid="risk-score">{r.scoreLabel}<small>/100</small></span>
    <ul className="aurora-risk-reasons">
      {r.reasons.map((x) => <li key={x.factor} data-testid="risk-reason">{x.detail}</li>)}
    </ul>
  </li>
))}
```

Add the import (`import { riskRows } from "@/aurora/components/admin/riskRowView";`) and a short help line above the list, per the standing explain-to-users rule:

```tsx
<p className="aurora-panel-help">
  Risk is scored 0–100 from inactivity, OSCE results, safety fails, flashcard accuracy,
  streak and weak-topic breadth. Signals a student has no data for are excluded, not
  counted as zero, so the remaining ones carry the full weight.
</p>
```

Reuse existing `.aurora-*` classes for the pill/score where equivalents exist; add new rules only if none fit, and keep them in the same stylesheet the surrounding panel uses.

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --experimental-strip-types frontend/tests/risk_rows_logic.mjs
npm --prefix frontend run typecheck
```
Expected: `risk_rows_logic: all passed`, and typecheck clean.

- [ ] **Step 5: Update BOTH harness fixture files, then run the harness**

`tsc` and `build` do not read the harness mocks, so a stale fixture passes both gates and fails only at render. Update **both** files.

In `frontend/tests/_mocks.mjs` and `frontend/tests/aurora_assert.mjs` (in `staffMocks`, `aurora_assert.mjs:975`), replace the `**/api/supervisor/at-risk` payload with rows the **producer can actually emit** — check against `at_risk.py`'s projection, not against the old fixture (P2a lesson 2):

```js
  await c.route("**/api/supervisor/at-risk", (r) => r.fulfill(JSON_OK({ students: [
    { student_id: "S009ABCDEF", risk_score: 72, band: "high",
      reasons: [
        { factor: "inactivity", weight: 22.0, detail: "No activity for 20 days" },
        { factor: "osce_failure", weight: 18.5, detail: "Failed 9 of 12 graded OSCE attempts" },
        { factor: "safety", weight: 10.7, detail: "Safety fail on 3 of 12 gradable attempts" },
      ],
      last_active: new Date(Date.now() - 20 * 864e5).toISOString(), days_inactive: 20,
      weak_topics: ["Glaucoma staging", "OCT interpretation"], weak_count: 2 },
    { student_id: "S014BCDEFA", risk_score: 41, band: "medium",
      reasons: [{ factor: "flashcard", weight: 41.0, detail: "Flashcard accuracy 41% over 88 answers" }],
      last_active: "", days_inactive: null, weak_topics: [], weak_count: 0 },
  ] })));
```

The second row deliberately carries `days_inactive: null` — the state that produced `"Noned inactive"` in the digest, and the one a fixture must cover.

**Also fix a pre-existing fixture contradiction.** The `**/api/supervisor/cohort` route sets `at_risk_count: 3` (`aurora_assert.mjs:974`, `_mocks.mjs:147`) beside an at-risk list of **one** student. Task 4 made those one number, so change it to `at_risk_count: 2` to match the two rows above — otherwise the fixture encodes a state the wire can no longer produce and the KPI assertion pins nothing.

Add assertions after the existing admin checks (around `aurora_assert.mjs:1023`). **This file has no assertion helper** — use the same raw pattern as its neighbours, against the trainer page `tp`:

```js
const riskReason = await tp.locator('[data-testid="risk-reason"]').first().textContent();
if (!riskReason?.includes("No activity for 20 days")) {
  console.error(`FAIL: at-risk row does not explain WHY the student is flagged (got ${riskReason})`); process.exit(1);
}
if ((await tp.locator('[data-testid="risk-band"][data-band="high"]').count()) !== 1) {
  console.error("FAIL: at-risk high-band pill missing"); process.exit(1);
}
const riskKpi = await tp.locator('[data-testid="stat-card"]').filter({ hasText: "At risk" }).first().textContent();
if (!riskKpi?.includes("2")) {
  console.error(`FAIL: at-risk KPI disagrees with the 2-row list beneath it (got ${riskKpi})`); process.exit(1);
}
```

Confirm the `stat-card` filter matches how the KPI is actually labelled in `AdminCohort.tsx` before relying on it; if the label differs, select on whatever testid that card already carries rather than adding a new one.

Then:

```bash
bash scripts/start-harness.sh stop
npm --prefix frontend run build:safe
SKIP_BUILD=1 bash scripts/start-harness.sh aurora
```
Expected: `HARNESS_EXIT=0`, 0 FAIL. Stop the server before the build or `next build` dies with `EBUSY`. Run only one harness at a time.

- [ ] **Step 6: Register the logic harness in CI**

Nothing auto-discovers `.mjs` harnesses. In `.github/workflows/ci.yml`, the logic harnesses are **lines inside one multi-line `run:` block** (`ci.yml:57-70`), run from the `frontend` working directory — so the paths are `tests/…`, not `frontend/tests/…`. Append after line 70's `cohort_panels_logic.mjs`:

```yaml
          node --experimental-strip-types tests/risk_rows_logic.mjs
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/aurora/components/admin/riskRowView.ts frontend/tests/risk_rows_logic.mjs frontend/src/hooks/useAdmin.ts frontend/src/aurora/screens/AdminCohort.tsx frontend/tests/_mocks.mjs frontend/tests/aurora_assert.mjs .github/workflows/ci.yml
git commit -m "feat(admin): at-risk rows show the band, score and reasons"
```

---

## Task 6: Mastery scales and the leave-one-out cohort (pure)

Three **separately named** scales, never one blended number — the sources measure different things, and `retention_scores` is itself a mixture of two key namespaces (flashcard tags and raw case topics). Each is 0–100, nullable, with its own `cohort_avg`, `delta` and `cohort_n`.

**The cohort mean is leave-one-out: `(total − student) / (n − 1)`.** Including the student makes a solo student's delta exactly `0.0`, which renders as "exactly at the cohort average" when the truth is "there is no cohort" — the common case at ~10 students. `cohort_avg` and `delta` are null when `cohort_n < 2`.

**Bucket retention keys before averaging.** `retention_scores` mixes case-topic keys and flashcard tags, so the same underlying topic can appear twice under two namespaces and double-count. Resolve case keys with `resolve_set_strict(role, topic)` (`tools/cases/topic_sets.py:185` — returns None on no match, unlike `resolve_set`, which silently falls back to `_DEFAULT` and would file an unrelated topic into `history_taking`) and flashcard keys with `flashcard_group(tag, pool)` (`tools/supervisor/topic_crosswalk.py:168`). Average the **group** means so one heavily-subdivided namespace cannot outvote the other.

**Files:**
- Create: `tools/supervisor/mastery.py`
- Test: `tests/supervisor/test_mastery.py`
- Read first (do not modify): `tools/cases/topic_sets.py:185-203`, `tools/supervisor/topic_crosswalk.py:168-190`

- [ ] **Step 1: Write the failing test**

Create `tests/supervisor/test_mastery.py`:

```python
"""Three mastery scales against a leave-one-out cohort (spec §6.2, D13)."""
import pytest

from tools.supervisor.mastery import leave_one_out, mastery_block, retention_mastery


# ── leave-one-out ────────────────────────────────────────────────────────────

def test_leave_one_out_excludes_the_student():
    # Three students at 90/60/30. For the 90, the cohort is (60+30)/2 = 45.
    assert leave_one_out(total=180.0, n=3, value=90.0) == 45.0


def test_solo_student_has_no_cohort():
    # Including the student makes delta exactly 0.0, which renders as "exactly at the
    # cohort average" when the truth is "there is no cohort" — the common case at
    # SNEC's volume, and the reason this must be null.
    assert leave_one_out(total=90.0, n=1, value=90.0) is None


def test_zero_cohort_is_none_not_zero():
    assert leave_one_out(total=0.0, n=0, value=None) is None


# ── the three scales ─────────────────────────────────────────────────────────

def _per_student():
    return {
        "s1": {"osce": 90.0, "flashcard": 40.0, "retention": None},
        "s2": {"osce": 60.0, "flashcard": 80.0, "retention": 50.0},
        "s3": {"osce": 30.0, "flashcard": None, "retention": 70.0},
    }


def test_three_named_scales_are_never_blended():
    out = mastery_block("s1", _per_student())
    assert set(out) == {"osce_mastery", "flashcard_mastery", "retention_mastery"}
    assert out["osce_mastery"]["value"] == 90.0
    assert out["flashcard_mastery"]["value"] == 40.0


def test_delta_is_against_the_leave_one_out_mean():
    out = mastery_block("s1", _per_student())
    assert out["osce_mastery"]["cohort_avg"] == 45.0     # (60+30)/2
    assert out["osce_mastery"]["delta"] == 45.0          # 90 - 45
    assert out["osce_mastery"]["cohort_n"] == 3


def test_a_scale_the_student_lacks_is_null_but_still_reports_the_cohort():
    # s1 has no retention data. Their own value is null — but a trainer still needs
    # to see what the cohort managed, so cohort_avg is populated and delta is null.
    out = mastery_block("s1", _per_student())
    assert out["retention_mastery"]["value"] is None
    assert out["retention_mastery"]["delta"] is None
    assert out["retention_mastery"]["cohort_avg"] == 60.0   # (50+70)/2
    assert out["retention_mastery"]["cohort_n"] == 2


def test_students_without_the_scale_are_out_of_its_denominator():
    # s3 has no flashcard data, so the flashcard cohort is 2, not 3. Counting them as
    # a 0 would drag the cohort average down and flatter everyone against it.
    out = mastery_block("s1", _per_student())
    assert out["flashcard_mastery"]["cohort_n"] == 2
    assert out["flashcard_mastery"]["cohort_avg"] == 80.0   # s2 only


def test_unknown_student_gets_nulls_not_a_crash():
    out = mastery_block("nobody", _per_student())
    assert out["osce_mastery"]["value"] is None
    assert out["osce_mastery"]["delta"] is None


def test_empty_cohort_is_all_nulls():
    out = mastery_block("s1", {})
    for scale in out.values():
        assert scale["value"] is None and scale["cohort_avg"] is None
        assert scale["cohort_n"] == 0


# ── retention bucketing ──────────────────────────────────────────────────────

def test_retention_buckets_both_namespaces_before_averaging():
    # retention_scores mixes raw case topics and flashcard tags. Averaging the raw
    # keys lets whichever namespace is more finely subdivided outvote the other.
    scores = {"oct_macula": 0.4, "oct_rnfl": 0.6, "acute_angle_closure": 0.9}
    out = retention_mastery(scores, role="OT")
    assert out is not None and 0.0 <= out <= 100.0


def test_retention_is_scaled_to_0_100():
    # retention_scores are stored 0-1; the other two scales are 0-100. Mixing them
    # would show a strong student as a 0.8 next to a weak one's 40.
    assert retention_mastery({"oct_macula": 1.0}, role="OT") == 100.0


def test_unparseable_retention_value_is_skipped_not_zeroed():
    out = retention_mastery({"oct_macula": "n/a", "oct_rnfl": 1.0}, role="OT")
    assert out == 100.0


def test_empty_retention_is_none():
    assert retention_mastery({}, role="OT") is None
    assert retention_mastery(None, role="OT") is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/supervisor/test_mastery.py -q --continue-on-collection-errors`
Expected: FAIL — `ModuleNotFoundError: No module named 'tools.supervisor.mastery'`.

- [ ] **Step 3: Write minimal implementation**

Create `tools/supervisor/mastery.py`:

```python
"""One student's mastery against the cohort, on three separately-named scales (§6.2).

Pure: no I/O. The endpoint assembles the per-student inputs; this module owns the
comparison policy.

**Three scales, never one blended number.** OSCE attainment, flashcard recall and
retention measure different things, and `retention_scores` is itself a mixture of two
key namespaces (flashcard tags and raw case topics). A single "mastery" figure would
average incomparable quantities and hide which one a trainer should act on.

**The cohort mean is leave-one-out.** Including the student makes a solo student's
delta exactly 0.0, which renders as "exactly at the cohort average" when the truth is
"there is no cohort" — the common case at ~10 students, and the most misleading
possible answer. `cohort_avg` and `delta` are null when fewer than 2 OTHER students
have the scale.
"""
from __future__ import annotations

from tools.cases.topic_sets import case_pool, resolve_set_strict
from tools.supervisor.topic_crosswalk import flashcard_group

SCALES = ("osce", "flashcard", "retention")


def leave_one_out(total: float, n: int, value: float | None) -> float | None:
    """Mean of the cohort EXCLUDING this student, or None when no one else has data.

    `total`/`n` cover every student with the scale, `value` is this student's own
    contribution (None when they are not in the total).
    """
    others_n = n - (1 if value is not None else 0)
    if others_n < 1:
        return None
    others_total = total - (value or 0.0)
    return round(others_total / others_n, 1)


def retention_mastery(scores: dict | None, *, role: str) -> float | None:
    """Mean retention as 0-100, bucketed across both key namespaces first.

    `retention_scores` is written with BOTH raw case-topic keys and flashcard tags, so
    the same underlying topic can appear twice and double-count. Keys are resolved to
    topic groups — case keys via `resolve_set_strict` (None on no match, unlike
    `resolve_set`, which silently files an unrelated topic into `_DEFAULT`) and the
    rest via the flashcard crosswalk — and the GROUP means are averaged, so a finely
    subdivided namespace cannot outvote the other.

    Values are stored 0-1 and returned 0-100 to match the other two scales.
    """
    if not scores:
        return None
    pool = case_pool(role)
    groups: dict[str, list[float]] = {}
    for key, raw in scores.items():
        try:
            value = float(raw)
        except (TypeError, ValueError):
            # A malformed value is skipped, never coerced to 0.0 — a 0 reads as total
            # failure on that topic.
            continue
        group = resolve_set_strict(role, str(key)) or flashcard_group(str(key), pool)
        groups.setdefault(group, []).append(value)
    if not groups:
        return None
    means = [sum(v) / len(v) for v in groups.values()]
    return round(100.0 * sum(means) / len(means), 1)


def mastery_block(student_id: str, per_student: dict[str, dict]) -> dict:
    """The three scales for one student, each against its own leave-one-out cohort.

    Args:
        student_id: the student to report on.
        per_student: student_id -> {"osce": float|None, "flashcard": float|None,
            "retention": float|None}, all on 0-100. A student missing a scale must
            carry None for it, NOT 0.0 — a zero would join that scale's denominator
            and drag the cohort average down, flattering everyone against it.

    Returns `{"<scale>_mastery": {"value", "cohort_avg", "delta", "cohort_n"}}`. Every
    figure is `float | None`; `cohort_n` is the count of students WITH that scale.
    """
    mine = per_student.get(student_id) or {}
    out: dict[str, dict] = {}
    for scale in SCALES:
        present = [
            float(row[scale])
            for row in per_student.values()
            if row.get(scale) is not None
        ]
        value = mine.get(scale)
        value = float(value) if value is not None else None
        cohort_avg = leave_one_out(sum(present), len(present), value)
        out[f"{scale}_mastery"] = {
            "value": value,
            "cohort_avg": cohort_avg,
            # Null unless BOTH sides exist. A delta against nothing is not a zero.
            "delta": round(value - cohort_avg, 1)
            if value is not None and cohort_avg is not None else None,
            "cohort_n": len(present),
        }
    return out
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/supervisor/test_mastery.py -q`
Expected: PASS — 13 passed.

- [ ] **Step 5: Mutation-test leave-one-out and the null discipline**

1. Include the student — in `leave_one_out`, return `round(total / n, 1)` when `n >= 1`.
   Expected: `test_solo_student_has_no_cohort` and `test_delta_is_against_the_leave_one_out_mean` FAIL. Revert.
2. Zero-fill a missing scale — in `mastery_block`, build `present` with `float(row.get(scale) or 0.0)` for every row.
   Expected: `test_students_without_the_scale_are_out_of_its_denominator` FAILS. Revert.
3. Use the lenient resolver — in `retention_mastery`, swap `resolve_set_strict` for `resolve_set`.
   Expected: `test_retention_buckets_both_namespaces_before_averaging` FAILS (every flashcard tag collapses into one `_DEFAULT` group). If it still passes, the test is too weak — assert the specific group count instead. Revert.

- [ ] **Step 6: Commit**

```bash
git add tools/supervisor/mastery.py tests/supervisor/test_mastery.py
git commit -m "feat(admin): three mastery scales against a leave-one-out cohort"
```

---

## Task 7: Serve mastery from the student detail endpoint

`GET /api/admin/student/{student_id}/detail` gains a `mastery` block and, finally, a rate limit — it has **none** today (`admin.py:716-717`), so a staff token can loop it freely over `{student_id}` while it performs four reads per call.

**Use `shared_limit`, not `limit`.** slowapi defaults to `key_style="url"` and keys on the ASGI path, so a plain `@limiter.limit` on a `{path_param}` route puts the id in the bucket key and a caller dodges the cap by iterating ids. The fixed-scope form is required here — same rationale as `admin_student_insights` (`admin.py:693`) and `admin_unapprove_student` (`admin.py:149`). Every rate-limited endpoint also needs a `request: Request` parameter.

**Degrade, do not 500, on the mastery reads.** The four existing reads keep their current behaviour: the identity/session/case block 500s (a student detail with no cases is not a student detail) and `get_topic_accuracy` degrades to `{}`. Mastery is an *addition* to a page that already works, so a failure there must leave the rest of the page intact: emit `mastery: null` and let the UI omit the block. **This is the opposite of Plan A's cohort-analytics decision** (where an OSCE read failure 500s) and it is deliberate — there, the aggregation *was* the payload.

**Files:**
- Modify: `tools/api/routers/admin.py` (`admin_student_detail`, lines 716-795)
- Modify: `tests/api/test_admin_endpoints.py` (one `_stub_admin_db` line)
- Test: `tests/api/test_admin_student_detail.py` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_admin_student_detail.py`:

```python
"""GET /api/admin/student/{id}/detail — mastery block and rate limit (spec §6.2)."""
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)

_PROFILES = [
    {"student_id": "s1", "role": "OA", "retention_scores": {"red_eye": 0.8}},
    {"student_id": "s2", "role": "OA", "retention_scores": {"red_eye": 0.4}},
    {"student_id": "s3", "role": "OA", "retention_scores": {"red_eye": 0.6}},
]
_CASES = [
    {"student_id": "s1", "case_id": "c1", "score_100": 90, "passed": True, "safe": True},
    {"student_id": "s2", "case_id": "c1", "score_100": 60, "passed": True, "safe": True},
    {"student_id": "s3", "case_id": "c1", "score_100": 30, "passed": False, "safe": False},
]
_CARDS = [{"student_id": "s2", "topic_tag": "red_eye", "correct": True}]


def _staff_cookies():
    return {"eyebot_token": create_access_token("user_001", "admin", "OA")}


def _detail_patches():
    """Every db call the endpoint makes. An unstubbed one reads and WRITES prod Supabase."""
    return [
        patch("tools.profile.get_profile.get_profile",
              new=AsyncMock(return_value={"student_id": "s1", "role": "OA",
                                          "retention_scores": {"red_eye": 0.8}})),
        patch("tools.shared.db.get_consent_by_student_id",
              new=AsyncMock(return_value={"student_name": "A B", "email": "a@b.c"})),
        patch("tools.shared.db.get_sessions", new=AsyncMock(return_value=[])),
        patch("tools.shared.db.get_case_results", new=AsyncMock(return_value=[])),
        patch("tools.shared.db.get_topic_accuracy", new=AsyncMock(return_value={})),
        patch("tools.shared.db.get_active_student_profiles",
              new=AsyncMock(return_value=(_PROFILES, 0))),
        patch("tools.shared.db.get_all_case_scores",
              new=AsyncMock(return_value=(_CASES, True))),
        patch("tools.shared.db.get_all_flashcard_attempts",
              new=AsyncMock(return_value=(_CARDS, True))),
    ]


def _get(path="/api/admin/student/s1/detail", extra=()):
    stack = _detail_patches() + list(extra)
    import contextlib
    with contextlib.ExitStack() as es:
        for p in stack:
            es.enter_context(p)
        return client.get(path, cookies=_staff_cookies())


def test_detail_returns_three_named_mastery_scales():
    r = _get()
    assert r.status_code == 200
    mastery = r.json()["mastery"]
    assert set(mastery) == {"osce_mastery", "flashcard_mastery", "retention_mastery"}
    assert mastery["osce_mastery"]["value"] == 90.0
    # Leave-one-out over s2/s3: (60+30)/2 = 45.
    assert mastery["osce_mastery"]["cohort_avg"] == 45.0
    assert mastery["osce_mastery"]["delta"] == 45.0
    assert mastery["osce_mastery"]["cohort_n"] == 3


def test_scale_the_student_lacks_is_null_with_the_cohort_still_shown():
    # s1 has no flashcard attempts; s2 does. value null, cohort_avg populated.
    fc = _get().json()["mastery"]["flashcard_mastery"]
    assert fc["value"] is None
    assert fc["delta"] is None
    assert fc["cohort_avg"] == 100.0
    assert fc["cohort_n"] == 1


def test_mastery_degrades_to_null_without_taking_out_the_page():
    # Mastery is an ADDITION to a page that already works. A 500 here would blank the
    # sessions, cases and findings a trainer came for.
    extra = [patch("tools.shared.db.get_all_case_scores",
                   new=AsyncMock(side_effect=RuntimeError("supabase down")))]
    r = _get(extra=extra)
    assert r.status_code == 200
    assert r.json()["mastery"] is None
    assert "sessions" in r.json() and "cases" in r.json()


def test_core_reads_still_500():
    # Unchanged behaviour: a detail page with no identity is not a detail page.
    extra = [patch("tools.shared.db.get_consent_by_student_id",
                   new=AsyncMock(side_effect=RuntimeError("supabase down")))]
    assert _get(extra=extra).status_code == 500


def test_the_endpoint_is_rate_limited_on_a_fixed_scope():
    # slowapi defaults to key_style="url", so a plain @limiter.limit would put
    # {student_id} in the bucket key and let a caller dodge the cap by looping ids.
    # Walking DIFFERENT ids must still exhaust one shared bucket.
    codes = []
    for i in range(35):
        codes.append(_get(path=f"/api/admin/student/s{i}/detail").status_code)
    assert 429 in codes, "different ids must share one rate-limit bucket"


def test_mastery_is_absent_for_an_unknown_student_rather_than_fabricated():
    extra = [patch("tools.shared.db.get_active_student_profiles",
                   new=AsyncMock(return_value=([], 0)))]
    mastery = _get(extra=extra).json()["mastery"]
    assert mastery["osce_mastery"]["value"] is None
    assert mastery["osce_mastery"]["cohort_n"] == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/api/test_admin_student_detail.py -q`
Expected: FAIL — `KeyError: 'mastery'` on the first four tests and `assert 429 in codes` on the limiter test.

> `tests/conftest.py` resets `limiter._storage` around every test, so the limiter test is behavioural and safe. If it interferes with a neighbouring test, that reset is missing — check `conftest.py` rather than weakening the assertion.

- [ ] **Step 3: Write minimal implementation**

In `tools/api/routers/admin.py`, change the decorator and signature of `admin_student_detail`:

```python
@router.get("/api/admin/student/{student_id}/detail")
# shared_limit (fixed scope), NOT limit: slowapi's default key_style="url" keys on the
# ASGI path, so {student_id} would land in the bucket key and a caller could dodge the
# cap by walking ids. Same rationale as admin_student_insights above.
@limiter.shared_limit("30/minute", scope="admin_student_detail")
async def admin_student_detail(student_id: str, request: Request,
                               current_user: CurrentUser = Depends(require_staff)):
```

Then, immediately after the `flashcard_acc` block (currently lines 730-733), add the mastery computation:

```python
    # Mastery vs cohort (P2b, §6.2). Best-effort: this is an ADDITION to a page that
    # already works, so a failure here emits `mastery: null` and leaves the sessions,
    # cases and findings intact. Deliberately the opposite of /cohort-analytics, where
    # the aggregation IS the payload and a read failure must 500.
    try:
        cohort_profiles, _staff_excluded = await db.get_active_student_profiles()
        cohort_cases, _cases_complete = await db.get_all_case_scores()
        cohort_cards, _cards_complete = await db.get_all_flashcard_attempts()
        osce_per_student = osce_by_student(cohort_cases)
        cards_per_student = flashcard_by_student(cohort_cards)
        per_student = {
            str(p.get("student_id") or ""): {
                "osce": (osce_per_student.get(str(p.get("student_id") or "")) or {}).get("avg_score"),
                "flashcard": (cards_per_student.get(str(p.get("student_id") or "")) or {}).get("accuracy"),
                "retention": retention_mastery(p.get("retention_scores"),
                                               role=str(p.get("role") or "")),
            }
            for p in cohort_profiles
            if p.get("student_id")
        }
        mastery = mastery_block(student_id, per_student)
    except Exception:
        mastery = None
```

Add `"mastery": mastery,` to the returned dict, and these imports at the top of the file:

```python
from tools.supervisor.cohort_analytics import flashcard_by_student, osce_by_student
from tools.supervisor.mastery import mastery_block, retention_mastery
```

- [ ] **Step 4: Add the new read to the endpoint-test DB guard**

`get_active_student_profiles` and `get_all_case_scores` were added to `_stub_admin_db` in Task 3. Confirm all three bulk reads are present in that `defaults` dict — `/api/admin/student/stu_x/detail` is already in `STAFF_READ_ENDPOINTS`, so the four guard-tier tests now run this new code path against whatever that dict provides. A missing entry means a **live production read on every pytest run**.

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/api/test_admin_student_detail.py tests/api/test_admin_endpoints.py -q`
Expected: PASS — 7 new tests plus the guard suite.

Run: `python -m pytest -q`
Expected: PASS across the suite, and **zero** `AsyncPostgrestClient` mentions in the output.

- [ ] **Step 6: Mutation-test the degrade and the limiter scope**

1. Make mastery fatal — replace `except Exception: mastery = None` with a re-raise.
   Expected: `test_mastery_degrades_to_null_without_taking_out_the_page` FAILS. Revert.
2. Use the wrong limiter form — swap `shared_limit(..., scope=...)` for `limiter.limit("30/minute")`.
   Expected: `test_the_endpoint_is_rate_limited_on_a_fixed_scope` FAILS (each id gets its own bucket, so no 429). Revert.

- [ ] **Step 7: Commit**

```bash
git add tools/api/routers/admin.py tests/api/test_admin_student_detail.py tests/api/test_admin_endpoints.py
git commit -m "feat(admin): student detail serves mastery vs cohort, and is rate limited"
```

---

## Task 8: Render mastery, and retire the dead cohort read

The frontend has read `data.cohort_retention` at `AdminStudentDetail.tsx:88` and `studentReportExport.ts:57` since P1 — a field **the backend has never sent**. The downloadable report's "vs cohort" column has therefore always rendered `"—"`. This task points both at the real `mastery` block and deletes the dead type member.

`DivergingBar` is the one genuinely new chart component in P2 (spec §5.4): `BarSeries` stacks a single flex track and clamps negatives, so it cannot express a signed delta. Keep it inside the P5-deferred quality bar — legible, themed to the dark `.aurora-admin` shell, `aria-hidden` with a text summary beside it.

**`PERSIST_SCHEMA_VERSION` must be bumped `"7"` → `"8"`** (`frontend/src/lib/queryClient.ts:27`). Admin queries persist to IndexedDB for 24h, and `["admin","student",id]` changes **shape** here. Note the current value is `"7"`, not the `"6"` the spec assumed — the flashcard 5-deck ladder already bumped it.

**Files:**
- Create: `frontend/src/aurora/components/admin/masteryView.ts`
- Create: `frontend/src/aurora/components/admin/DivergingBar.tsx`
- Create: `frontend/tests/mastery_view_logic.mjs`
- Modify: `frontend/src/hooks/useAdmin.ts` (`StudentDetail.mastery`; drop `cohort_retention`)
- Modify: `frontend/src/aurora/screens/AdminStudentDetail.tsx`
- Modify: `frontend/src/aurora/lib/studentReportExport.ts`
- Modify: `frontend/src/lib/queryClient.ts`
- Modify: `frontend/tests/_mocks.mjs`, `frontend/tests/aurora_assert.mjs`, `.github/workflows/ci.yml`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/mastery_view_logic.mjs`:

```js
// Pure view-model for the mastery block. Run: node frontend/tests/mastery_view_logic.mjs
import { masteryRows } from "../src/aurora/components/admin/masteryView.ts";

let failures = 0;
const check = (name, cond) => {
  if (cond) { console.log(`  PASS  ${name}`); }
  else { console.log(`  FAIL  ${name}`); failures++; }
};

const block = (over = {}) => ({
  osce_mastery: { value: 90, cohort_avg: 45, delta: 45, cohort_n: 3 },
  flashcard_mastery: { value: null, cohort_avg: 100, delta: null, cohort_n: 1 },
  retention_mastery: { value: 60, cohort_avg: null, delta: null, cohort_n: 1 },
  ...over,
});

const rows = masteryRows(block());
check("renders all three scales", rows.length === 3);
check("names each scale", rows.every((r) => r.label && r.label !== r.key));

const osce = rows.find((r) => r.key === "osce_mastery");
check("shows the value", osce.valueLabel === "90");
check("shows a signed delta", osce.deltaLabel === "+45");
check("marks an above-cohort delta", osce.tone === "above");

const fc = rows.find((r) => r.key === "flashcard_mastery");
check("null value renders a dash, not a zero", fc.valueLabel === "—");
check("null delta renders a dash", fc.deltaLabel === "—");
check("null delta is toned neutral", fc.tone === "none");
check("still reports the cohort", fc.cohortLabel.includes("100"));

const ret = rows.find((r) => r.key === "retention_mastery");
check("solo cohort says there is no cohort", ret.cohortLabel.toLowerCase().includes("no cohort"));

// --- defensive ------------------------------------------------------------
check("null block is an empty list", masteryRows(null).length === 0);
check("missing scale is skipped, not crashed", masteryRows({ osce_mastery: null }).length === 0);
check("negative delta is signed and toned", (() => {
  const r = masteryRows(block({ osce_mastery: { value: 20, cohort_avg: 60, delta: -40, cohort_n: 3 } }))
    .find((x) => x.key === "osce_mastery");
  return r.deltaLabel === "−40" && r.tone === "below";
})());
check("zero delta is neither above nor below", (() => {
  const r = masteryRows(block({ osce_mastery: { value: 45, cohort_avg: 45, delta: 0, cohort_n: 3 } }))
    .find((x) => x.key === "osce_mastery");
  return r.tone === "level";
})());

console.log(failures === 0 ? "\nmastery_view_logic: all passed" : `\nmastery_view_logic: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types frontend/tests/mastery_view_logic.mjs`
Expected: FAIL — `Cannot find module '.../masteryView.ts'`. (Use whatever invocation form `.github/workflows/ci.yml` already uses for `cohort_panels_logic.mjs`.)

- [ ] **Step 3: Write minimal implementation**

**3a.** In `frontend/src/hooks/useAdmin.ts`, add the types and **delete** the dead field:

```ts
export interface MasteryScale {
  /** 0–100, or null when this student has no data for the scale. Never 0 for "no data". */
  value: number | null;
  /** Leave-one-out cohort mean; null when fewer than 2 other students have the scale. */
  cohort_avg: number | null;
  delta: number | null;
  cohort_n: number;
}
export interface Mastery {
  osce_mastery: MasteryScale;
  flashcard_mastery: MasteryScale;
  retention_mastery: MasteryScale;
}
```

In `StudentDetail`, replace the `cohort_retention?: Record<string, number>;` line (`useAdmin.ts:99`) with:

```ts
  // P2b: three named scales vs a leave-one-out cohort. Null when the mastery reads
  // failed — the rest of the page still renders. Optional so a persisted pre-P2b
  // payload does not break the type.
  mastery?: Mastery | null;
```

> `cohort_retention` was never emitted by any backend version, so removing it cannot break a live payload — it only removes a read that was always `undefined`.

**3b.** Create `frontend/src/aurora/components/admin/masteryView.ts`:

```ts
/** Pure view-model for the mastery block — no React, so it is Node-testable. */
import type { Mastery, MasteryScale } from "@/hooks/useAdmin";

const LABELS: Record<string, string> = {
  osce_mastery: "OSCE attainment",
  flashcard_mastery: "Flashcard recall",
  retention_mastery: "Topic retention",
};

export type MasteryTone = "above" | "below" | "level" | "none";

export interface MasteryRow {
  key: string;
  label: string;
  /** "—" when null. A "0" would read as the worst score in the cohort. */
  valueLabel: string;
  valuePct: number;
  deltaLabel: string;
  deltaPct: number;
  tone: MasteryTone;
  cohortLabel: string;
}

export function masteryRows(mastery: Mastery | null | undefined): MasteryRow[] {
  if (!mastery) return [];
  return Object.keys(LABELS)
    .map((key) => [key, (mastery as unknown as Record<string, MasteryScale | null>)[key]] as const)
    .filter(([, scale]) => !!scale)
    .map(([key, scale]) => {
      const s = scale as MasteryScale;
      const delta = typeof s.delta === "number" ? s.delta : null;
      return {
        key,
        label: LABELS[key],
        valueLabel: typeof s.value === "number" ? String(Math.round(s.value)) : "—",
        valuePct: clamp(s.value ?? 0),
        // U+2212 minus, not a hyphen — it aligns with digits in tabular figures.
        deltaLabel: delta === null
          ? "—"
          : `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(Math.round(delta))}`,
        deltaPct: clamp(Math.abs(delta ?? 0)),
        tone: delta === null ? "none" : delta > 0 ? "above" : delta < 0 ? "below" : "level",
        cohortLabel: cohortLabel(s),
      };
    });
}

function cohortLabel(s: MasteryScale): string {
  // "There is no cohort" and "the cohort scored 0" are different facts. A solo
  // student compared against themselves would otherwise read as exactly average.
  if (s.cohort_avg === null) {
    return s.cohort_n <= 1 ? "No cohort to compare yet" : "Cohort average unavailable";
  }
  return `Cohort ${Math.round(s.cohort_avg)} (n=${s.cohort_n})`;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}
```

**3c.** Create `frontend/src/aurora/components/admin/DivergingBar.tsx` — a signed bar around a centre line. `BarSeries` clamps negatives onto one stacked track, so it cannot show "below cohort". Keep it `aria-hidden` with the text summary beside it (spec D3; a11y is P5):

```tsx
/** Signed delta vs cohort. The one new chart in P2 (spec §5.4) — BarSeries stacks a
 *  single flex track and clamps negatives, so it cannot express a below-cohort delta.
 *  aria-hidden with a text summary alongside; the a11y pass is P5. */
export function DivergingBar({ pct, tone }: { pct: number; tone: string }) {
  const width = `${Math.max(0, Math.min(100, pct)) / 2}%`;
  return (
    <div className="aurora-diverge" aria-hidden="true">
      <span className="aurora-diverge-axis" />
      <span className={`aurora-diverge-fill aurora-diverge-${tone}`} style={{ width }} />
    </div>
  );
}
```

Add the matching `.aurora-diverge*` rules to the stylesheet the surrounding admin panels already use — the fill anchors at the 50% centre line and extends right for `above`, left for `below`. No new stylesheet.

**3d.** In `frontend/src/aurora/screens/AdminStudentDetail.tsx`, render the block where the dead cohort read was, with the required help text:

```tsx
{masteryRows(data.mastery).length > 0 && (
  <section className="aurora-panel">
    <h3>Mastery vs cohort</h3>
    <p className="aurora-panel-help">
      Three separate scales — they measure different things and are never blended. The
      cohort average excludes this student, so a delta of 0 means "level with peers",
      not "no peers to compare".
    </p>
    <ul className="aurora-mastery-list">
      {masteryRows(data.mastery).map((r) => (
        <li key={r.key} data-testid="mastery-row" data-scale={r.key}>
          <span className="aurora-mastery-label">{r.label}</span>
          <span className="aurora-mastery-value" data-testid="mastery-value">{r.valueLabel}</span>
          <DivergingBar pct={r.deltaPct} tone={r.tone} />
          <span className="aurora-mastery-delta" data-testid="mastery-delta"
                data-tone={r.tone}>{r.deltaLabel}</span>
          <small className="aurora-mastery-cohort" data-testid="mastery-cohort">{r.cohortLabel}</small>
        </li>
      ))}
    </ul>
  </section>
)}
```

**3e.** In `frontend/src/aurora/lib/studentReportExport.ts`, the per-topic `cohortPct` column has always rendered `"—"` because its source never existed. The `mastery` block is per-*scale*, not per-topic, so there is no honest per-topic cohort number to put there. **Delete the dead per-topic column and add a mastery section instead** — the report must not imply a comparison it cannot make.

In `AdminStudentDetail.tsx`'s `handleDownloadReport`, replace `const co = data.cohort_retention?.[topic];` and `cohortPct: co != null ? ... : null` with `cohortPct: null`, then extend `StudentReportData` with:

```ts
  mastery: { label: string; valueLabel: string; deltaLabel: string; cohortLabel: string }[];
```

populate it from `masteryRows(data.mastery)`, and render it as a small table under a "Mastery vs cohort" heading in `buildStudentReportHtml`. Keep the existing per-topic table; only its always-empty cohort column goes.

> If dropping the `cohortPct` column turns out to churn the report layout more than expected, the acceptable fallback is to keep the column and render `"—"` **with a footnote** stating per-topic cohort comparison is not available. Do not fabricate a per-topic number from a per-scale average.

**3f.** In `frontend/src/lib/queryClient.ts`, bump line 27:

```ts
const PERSIST_SCHEMA_VERSION = "8";  // bumped: ["admin","student",id] gained `mastery` and dropped the never-emitted `cohort_retention`
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --experimental-strip-types frontend/tests/mastery_view_logic.mjs
npm --prefix frontend run typecheck
```
Expected: `mastery_view_logic: all passed`, typecheck clean. Typecheck will flag any remaining `cohort_retention` reader — fix each rather than re-adding the field.

- [ ] **Step 5: Update BOTH harness fixture files and run the harness**

In `frontend/tests/_mocks.mjs` and `frontend/tests/aurora_assert.mjs`, add `mastery` to the `**/api/admin/student/*/detail` fixture — checked against the producer (Task 7's projection), including one null-value scale, which is the common state at SNEC's volume:

```js
mastery: {
  osce_mastery: { value: 78, cohort_avg: 61, delta: 17, cohort_n: 8 },
  flashcard_mastery: { value: null, cohort_avg: 72, delta: null, cohort_n: 3 },
  retention_mastery: { value: 64, cohort_avg: null, delta: null, cohort_n: 1 },
}
```

Add assertions in `aurora_assert.mjs` using the file's raw pattern (no helper exists), after opening the student drill-down on the trainer page `tp`:

```js
if ((await tp.locator('[data-testid="mastery-row"]').count()) !== 3) {
  console.error("FAIL: expected 3 named mastery scales"); process.exit(1);
}
const osceDelta = await tp.locator('[data-testid="mastery-row"][data-scale="osce_mastery"] [data-testid="mastery-delta"]').textContent();
if (osceDelta?.trim() !== "+17") {
  console.error(`FAIL: mastery delta vs cohort = ${osceDelta}, expected +17`); process.exit(1);
}
const fcValue = await tp.locator('[data-testid="mastery-row"][data-scale="flashcard_mastery"] [data-testid="mastery-value"]').textContent();
if (fcValue?.trim() !== "—") {
  console.error(`FAIL: a scale with no student data must render an em dash, not ${fcValue}`); process.exit(1);
}
const retCohort = await tp.locator('[data-testid="mastery-row"][data-scale="retention_mastery"] [data-testid="mastery-cohort"]').textContent();
if (!retCohort?.includes("No cohort")) {
  console.error(`FAIL: a solo cohort must say so, not render a zero delta (got ${retCohort})`); process.exit(1);
}
```

The drill-down must actually be open for these to resolve. Reuse whatever click the existing admin assertions already use to open a student row; if none does, add the click immediately before this block rather than asserting against a closed panel.

Then:

```bash
bash scripts/start-harness.sh stop
npm --prefix frontend run build:safe
SKIP_BUILD=1 bash scripts/start-harness.sh aurora
```
Expected: `HARNESS_EXIT=0`, 0 FAIL.

- [ ] **Step 6: Register the second logic harness in CI**

Append to the same multi-line `run:` block in `.github/workflows/ci.yml` (frontend-relative, beside the other two):

```yaml
          node --experimental-strip-types tests/mastery_view_logic.mjs
```

- [ ] **Step 7: Behavioral verify on the running app (per `/ship-check`)**

With the harness app running, load `/admin` and confirm — by looking, not by inference:

1. The at-risk list shows a band pill, an `x/100` score and at least one reason sentence per row.
2. The "At risk" KPI equals the number of rows in the list beneath it.
3. Opening a student shows three named mastery scales; a scale the student lacks reads `—`, not `0`.
4. A solo/thin cohort reads "No cohort to compare yet" rather than a `0` delta.
5. Forcing a mastery read to fail (temporarily point the fixture at a 500) leaves the rest of the detail page rendered.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/aurora/components/admin/masteryView.ts frontend/src/aurora/components/admin/DivergingBar.tsx frontend/tests/mastery_view_logic.mjs frontend/src/hooks/useAdmin.ts frontend/src/aurora/screens/AdminStudentDetail.tsx frontend/src/aurora/lib/studentReportExport.ts frontend/src/lib/queryClient.ts frontend/tests/_mocks.mjs frontend/tests/aurora_assert.mjs .github/workflows/ci.yml
git commit -m "feat(admin): mastery vs cohort replaces a cohort field the API never sent"
```

---

## Final verification before the last push

Run all four gates and record the actual numbers — never assert green from inference:

```bash
python -m pytest -q
npm --prefix frontend run typecheck
npm --prefix frontend run build:safe
node --experimental-strip-types frontend/tests/risk_rows_logic.mjs
node --experimental-strip-types frontend/tests/mastery_view_logic.mjs
bash scripts/start-harness.sh stop && SKIP_BUILD=1 bash scripts/start-harness.sh aurora
```

Expected: pytest all passed with **zero** `AsyncPostgrestClient` mentions; typecheck clean; build green; both logic harnesses "all passed"; aurora `HARNESS_EXIT=0` with 0 FAIL.

Then `git fetch origin`, confirm a fast-forward, and push. `main` auto-deploys to Render production.

**No migration, no new env var, no coordinated setup.** Every change here is pure code over tables applied on 2026-07-14, so nothing in this plan can boot `main` broken.

## What this plan deliberately leaves open

- **`cohort_benchmarks.py:20-23` has the same `except Exception → []` swallow** as at-risk and cohort_summary, and still reads the staff-inclusive `get_active_profiles()`. It is the producer behind `BenchmarkTopic`, whose construction sits **outside** its try/except (`supervisor.py:185`) — so fixing the swallow there without also moving that construction inside the try turns an outage into an unhandled `ValidationError`. Out of scope: it is a different endpoint with its own wire hazard, and bundling it would put two unrelated failure-mode changes in one plan. **Flag it to the user as the natural follow-up.**
- **`at_risk.py`'s population fix closes only one of the three staff-counting surfaces.** `cohort_summary.py:27` and `cohort_benchmarks.py:21` still use `get_active_profiles()`. `cohort_summary` is left alone deliberately: its `total`/`active_this_week` KPIs have always counted the roster, and changing that number is a product decision, not a bug fix.
- **The "declining" half of spec §6.1's "OSCE failing/declining" signal is not built.** This plan scores *failing* (`pass_rate` over the best attempt per case); *declining* is a per-student trend, which needs the time-ordered read Plan C introduces as `get_case_scores_since` (spec §7.1). Adding a trend here would either duplicate that read or widen `get_all_case_scores` — both worse than one extra `RISK_RUBRIC` entry once Plan C lands. **When Plan C ships, add `osce_declining` to the rubric**; the renormalisation means a new signal needs no other change, and `weights` is the only place to touch.
- **`useActivity` / `FeedItem`** in `useAdmin.ts:121-137` remain orphaned and annotated, deferred to P3 per Plan A's audit table.
- **Chart polish, keyboard navigation and the a11y pass** are P5. `DivergingBar` ships legible and `aria-hidden` with a text summary.
