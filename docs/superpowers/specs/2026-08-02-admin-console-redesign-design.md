# EyeBot Console — /admin front-end rebuild

**Date:** 2026-08-02
**Status:** approved design, pending implementation plan
**Supersedes the front-end half of:** `docs/design-locks.md` → *"Trainer/Admin Analytics +
homepage pool toggle — LOCKED 2026-07-13"*
**Backend:** unchanged. Zero endpoint, schema, or migration work.

---

## 1. Goal

Rebuild `/admin` as a world-class staff console: a full-bleed, light, colour-forward
product that a trainer reads between teaching sessions and that survives being projected
in front of SNEC leadership.

Two constraints from the requester, in priority order:

1. **Demo/stakeholder impact is the primary optimisation.** Daily trainer usability is a
   close second, not a distant one.
2. **Only what a trainer and an admin truly need.** No feature sprawl. If a panel does not
   change a decision, it does not ship.

## 2. Why the current screen fails

`/admin` today is a dark PowerBI-style board nested inside the light student shell. Its
Cohort tab is **ten stacked panels of equal visual weight** with no hierarchy — and three
of them (`Cohort mastery by topic` heatmap, `Topic benchmarks (lowest first)` bars, and the
per-topic table inside `Topic performance`) render **the same fact three different ways**.
There is no answer to "what do I look at first". The data underneath is excellent; the
presentation buries it.

## 3. Scope edit — what is deliberately cut

Applying constraint 2 before designing anything:

| Removed | Reason |
| --- | --- |
| Activity trend chart (21-day event counts) | Measures volume, not quality. Never changes what a trainer teaches. Survives as a figure on a stat card. |
| Cohort mastery heatmap | An unlabelled square grid showing what the topic bars show, less legibly. |
| "Topic benchmarks (lowest first)" panel | Duplicate of the heatmap *and* the topic table. Merged into one **Weakest topics** panel. |
| OSCE safety-failure donut panel | One number does not need a panel. Becomes a stat card. |
| Most-missed OSCE steps panel | Genuinely useful, wrongly placed. Moves **inside** the per-topic drill-down. |
| A standalone Topics screen | Reached by clicking a topic on Overview. Progressive disclosure beats a nav item. |
| A standalone Usage screen | Token totals are one stat card; the per-student split is already a roster column. |

Net: **Overview = 1 hero + 4 stat cards + 2 panels.** Down from ten panels.

`/api/admin/activity` (the 80-item capped feed) remains unrendered, as it has been since
P2. Retiring the endpoint + `useActivity` together stays a separate call.

## 4. Information architecture

`/admin` leaves the student shell and becomes its own console with real sub-routes
(replacing today's `useState<Tab>`): deep-linkable, back-button correct, code-split.

```
app/(console)/admin/
  layout.tsx        AdminGuard + ConsoleShell (top bar + nav)
  page.tsx          Overview
  students/page.tsx Roster + drill-down + staff
  accounts/page.tsx Provisioning        (admin only)
  audit/page.tsx    Security trail      (admin only)
```

The URL stays `/admin` — Next route groups do not affect the path.

**Navigation** — grouped, 2 items for a trainer, 4 for an admin:

```
TEACHING     Overview · Students
GOVERNANCE   Accounts · Audit          (admin only)
```

**Top bar** (persistent): EyeBot mark → "Console" → discipline segment
(`All · OA & PSA · OT`) → live indicator → **← Student app**.

The discipline segment is **console-global**, which softens decision **D11** (a
panel-local switcher) without pretending the underlying problem went away. Exactly two
hooks accept `discipline`: `useCohortAnalytics` and `usePerformanceTrend`. Everything else
— `useCohort`, `useAtRisk`, `useTokenSummary`, `useRoster`, `useAudit` — is cohort-wide and
cannot be re-scoped without backend work this spec excludes.

D11 rejected a global control because it would silently leave those figures unmoved. The
resolution here is **marking, not hiding**: any surface the segment cannot scope carries a
persistent `All disciplines` marker on its face, so a trainer flipping to *OT* can see at a
glance which numbers followed and which did not. Concretely — the hero, the OSCE pass-rate
and safety-fail stats, and the Weakest-topics panel **follow** the segment; the Students
stat, the Needs-attention stat and panel, and AI tokens are **marked cohort-wide**. A
figure may not be left ambiguous: it either follows the segment or wears the marker.

### 4.1 Overview

| Element | Source |
| --- | --- |
| **Hero** — cohort mastery %, 90-day trend line, delta vs previous window | `useCohortAnalytics`, `usePerformanceTrend` |
| Stat: **Students** (total / active this week) | `useCohort` |
| Stat: **Needs attention** (count + change) | `useCohort`, `useAtRisk` |
| Stat: **OSCE pass rate** | `useCohortAnalytics` |
| Stat: **Safety fails** | `useCohortAnalytics` (via `safetyPanel`) |
| Band: **AI cohort insight** — one quiet line, not a panel | `useCohortInsight` |
| Panel: **Needs attention** — flagged students, band, score, reasons | `useAtRisk` → `riskRows` |
| Panel: **Weakest topics** — ranked bars, click → topic drill-down | `useCohortAnalytics` |

An admin additionally sees an **AI tokens** stat card (`useTokenSummary`), carrying the
`complete === false` floor prefix (`≥`). Trainers do not.

### 4.2 Topic drill-down (from Overview)

Clicking a topic bar opens a detail surface for that topic group: attempts, students,
average score, pass rate, safety-fail rate, per-difficulty split, **most-missed steps**,
and flashcard accuracy. All fields already exist on the `TopicGroupRow` the Overview query
returns — **this drill-down fires no additional request.**

### 4.3 Students

Search + role/at-risk filter + paginated roster → student drill-down (mastery scales vs
leave-one-out cohort, sessions, cases, weak topics, insights, report export). Staff table
below, visually subordinate. Behaviour preserved from today; presentation rebuilt.

### 4.4 Accounts / Audit

Admin-only, client-guarded and backend-enforced (`require_admin`). Function preserved,
presentation rebuilt on the new primitives.

## 5. Visual system — "Aurora Command, light"

Light, colour-forward, built on the existing Gemini family
(`#4285f4 · #9b72cb · #d96570 · #1aa89c`) already tokenised in
`frontend/src/styles/gemini-gradients.css`.

- **Canvas** — near-white with a soft multi-radial aurora wash (blue top-left, purple
  top-right, coral bottom). Never flat white.
- **Hero** — a *saturated* deep-gradient block
  (`#1A4FBE → #6B4499 → #A83C47`) with **white** text. Computed white-on-stop contrast is
  **7.2:1 / 7.2:1 / 6.2:1** — AA at any size, on every stop. This is the single loudest element and the only full
  gradient fill on the screen. It exists because grey-on-tint camouflaged the hero in
  review.
- **Hue = domain, never decoration.** Blue = population · Coral = risk/attention ·
  Teal = pass/safe · Purple = topics/mastery · Amber = warning. A hue may not be chosen
  for variety.
- **Panels and stat cards** carry a filled colour header band in their domain hue over a
  white body. Dense reading surfaces (roster, audit) stay near-monochrome — colour there
  is reserved for badges and risk.
- **Type** — existing `--font-sans` (Inter) with `--font-mono` (JetBrains Mono) and
  `font-variant-numeric: tabular-nums` on every figure. Hero numeral ~64px/250 weight;
  the scale jump between hero and body is the primary hierarchy signal.
- **Motion** — entrance only, CSS-driven, fully frozen under `prefers-reduced-motion` and
  `data-motion=reduce`. No infinite loops except the live-poll dot.
- **Charts stay dependency-free SVG.** No chart library. This constraint carries over
  from the 2026-07-13 lock and is not up for renegotiation.

CSS lives in a new `frontend/src/aurora/console/console.css`, scoped under `.cs`, all
classes prefixed `.cs-*`. The 62 `.aurora-admin` rules in `aurora.css` are **removed**, not
orphaned.

## 6. Component inventory

New, under `frontend/src/aurora/console/`:

`ConsoleShell` · `ConsoleNav` · `ConsoleTopBar` · `HeroMetric` · `StatCard` · `Panel` ·
`DataTable` · `RiskList` · `BarList` · `TopicDetail` · `Sparkline` · `TrendChart` ·
`DonutGauge` · `Skeleton` / `ErrorState` / `EmptyState`

`DataTable` is one component driving the roster, the staff list, the approved list and the
audit log — four hand-rolled CSS-grid tables today, each with its own column string and its
own pager.

## 7. Data layer — unchanged

`frontend/src/hooks/useAdmin.ts` and the four pure view-models
(`cohortAnalyticsView.ts`, `riskRowView.ts`, `masteryView.ts`, `performanceTrendView.ts`)
are **not modified**. They are unit-tested and encode rules learned from production
defects. The rebuild changes rendering only.

### 7.1 Invariants carried over verbatim

These are scars, not preferences. Each one traces to a shipped defect:

1. **A figure never renders `0` while loading or failed.** `…` when loading, `—` on error.
   A zero is indistinguishable from a real measurement of an empty cohort.
2. **`null ≠ 0` at a zero denominator (D13).** A null bucket renders as a **gap** in a
   trend, never a point on the floor — a plotted zero draws a cliff and reads as a cohort
   collapse.
3. **A failed read renders an error, never an empty or zero state.** `getJSON` throws for
   exactly this reason. Most critical on the safety-failure rate: a confident "0% unsafe"
   from a broken read is the most dangerous number this product can display.
4. **An empty ranking renders its summary alone.** An empty track under a heading reads as
   a measured zero.
5. **`useTokenSummary` stays off the 30s poll** — it scans every `chat_sessions` row on the
   single prod worker.
6. **`useCohortInsight` is never polled** — it is a paid, rate-limited Gemini call, and it
   is the only hook that resolves to `""` rather than throwing.
7. **A 1-point SVG subpath draws nothing** — trend rendering must handle single-point and
   all-null series explicitly.

## 8. Mobile — full phone support

- Tiers gate on **`pointer: coarse`, never width**. A 15 Pro Max is 932px in landscape.
- Nav collapses to a bottom tab bar on coarse pointer; the top bar keeps the discipline
  segment and the back-to-app control.
- `DataTable` renders **stacked cards** on coarse pointer — not a horizontally scrolling
  grid. Card content is chosen per table, not mechanically transposed.
- Hero scales; the sparkline holds aspect and drops gridlines below the tablet tier.
- Tap targets ≥ 44px. Measure **settled**, after animation — a correct 44px control
  measures 43.7 mid-transition.
- `mobile_audit.mjs` gains admin coverage launched with `{ hasTouch: true }`. Harnesses run
  fine-pointer by default, so `(pointer: coarse)` tiers otherwise never render and the
  audit passes without testing anything.

## 9. Testing and gates

- **Pure-logic harnesses unchanged** — `risk_rows_logic`, `cohort_panels_logic`,
  `mastery_view_logic`, `performance_trend_logic`, `charts_logic` all test view-models,
  which this work does not touch. They must stay green untouched; a change there means the
  rebuild leaked into the data layer.
- **New `frontend/tests/console_assert.mjs`.** `gated_harnesses()` **discovers**
  `*_assert.mjs`, so it joins the CI gate with no registration step (`NOT_GATED` is
  `visual_sweep.mjs` alone and does not grow).
- Assertions: white-on-gradient hero contrast ≥ 4.5:1; no figure renders `0` in the
  loading or error state; a failed read renders an error and not an empty list; flipping
  the discipline segment leaves **no** unmarked figure unchanged (every Overview figure
  either moves or carries `All disciplines`); nav deep-links resolve; 44px targets under
  `{ hasTouch: true }` measured settled; motion frozen under `data-motion=reduce`.
- `bash scripts/start-harness.sh all` **cannot fail via exit code** — grep its output for
  `FAIL`. Never trust its status.
- Full gates before push: `python -m pytest -q`, `npm run typecheck`, `npm run build`,
  harness sweep, then `gh run list --branch main` after the push. A cancelled run is not a
  pass — read the jobs.

## 10. Migration and known breakages

| Touch point | Action |
| --- | --- |
| `frontend/src/app/(shell)/admin/` | Moves to `app/(console)/admin/`. URL unchanged. |
| `app/(console)/layout.tsx` | New. Providers come from the **root** layout, so only `AppShell` is dropped. |
| `tourSteps.ts:51` | **Breaks.** The tour step targets the CSS selector `.aurora-admin`, which this work deletes. Must be re-pointed at the new anchor. |
| `AtlasRail.tsx:34` | Rail link to `/admin` still resolves; the rail no longer wraps the page. |
| `AppShell.tsx:30` | Command-palette destination — verify it still navigates out of the shell. |
| `aurora.css` | Remove the `.aurora-admin` block (62 rules) and its dark token scope. |
| `aurora.css:418` | Phone rule naming `/admin` — re-verify under the new shell. |
| `proxy.ts:20` | Route list; unaffected by a route-group move, confirm anyway. |
| `<main>` landmark | `AppShell` no longer provides one. The console layout must render exactly **one** `<main id="main">`. |
| `data-testid`s | `admin-at-risk`, `admin-roster`, `admin-staff`, `admin-audit`, `risk-band`, `risk-score`, `risk-reason`, `cohort-discipline`, `cohort-discipline-caption`, `cohort-topics-summary` — **preserved** so existing assertions survive. |
| `PERSIST_SCHEMA_VERSION` | No bump. Query shapes are untouched. |

## 11. Acceptance criteria

Naming these makes them the new lock. Refinement inside the lock must name the criterion
it changes.

1. `/admin` renders **outside** the student shell — no Atlas Rail — with its own top bar
   and grouped nav, and offers an explicit route back to the student app.
2. Trainers see **Overview + Students**. Admins additionally see **Accounts + Audit**, plus
   the AI-tokens stat. Students reaching `/admin` are redirected.
3. Overview is **one hero + four stat cards + two panels** and nothing else. Adding a
   panel requires naming the decision it changes.
4. The hero is a saturated Gemini-gradient block with white text passing WCAG AA on every
   gradient stop.
5. Hue encodes domain (blue population · coral risk · teal safe · purple topics · amber
   warning) and is never chosen for variety.
5a. Every figure on Overview either **follows** the discipline segment or wears a
   persistent `All disciplines` marker. None is ambiguous.
6. Every chart is hand-written SVG. No chart-library dependency enters `package.json`.
7. All seven §7.1 invariants hold, each covered by an assertion.
8. `useAdmin.ts` and the four view-model modules are byte-identical to their pre-rebuild
   state.
9. Zero backend change: no endpoint, schema, migration or router edit.
10. Fully usable at 390px on a coarse pointer, tiers gated on `pointer: coarse`; motion
    frozen under `prefers-reduced-motion` / `data-motion=reduce`.
11. `console_assert.mjs` is green in the discovered CI harness gate.

## 12. Out of scope

- Any backend work, including retiring `/api/admin/activity` + `useActivity`.
- New metrics, new aggregations, or alerting/notification features.
- The homepage pool toggle (`PoolToggleSwitch`), which the 2026-07-13 lock also covers and
  which is **unaffected** by this rebuild.
- The student-facing app in every respect.
