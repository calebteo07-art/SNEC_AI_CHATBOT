# EyeBot Console (/admin rebuild) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/admin` as a full-bleed, light, colour-forward staff console ("Aurora
Command") outside the student shell, with no backend change.

**Architecture:** `/admin` moves from the `(shell)` route group to a new `(console)` group,
losing the Atlas Rail and gaining its own top bar + grouped nav with real sub-routes.
A new token scope `.cs` in `console.css` re-themes the surface light; new `.cs-*` primitives
under `frontend/src/aurora/console/` replace the `.aurora-*` admin markup. The data layer
(`useAdmin.ts` + four pure view-models) is **not touched**.

**Tech Stack:** Next.js 16 App Router (`output: standalone`), React 19, TanStack Query,
plain CSS (no Tailwind classes in console markup), hand-written SVG charts, Playwright
harness (`frontend/tests/console_assert.mjs`), Node 24.

**Spec:** `docs/superpowers/specs/2026-08-02-admin-console-redesign-design.md`

---

## Working rules for every task

- **Shell discipline.** PowerShell cmdlets go in the PowerShell tool; the Bash tool is
  POSIX-only. Use **absolute paths** — the Bash tool resets cwd every call, so
  `cd frontend && …` fails. Prefix with `cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT" &&`.
- **Read before edit.** Never `Edit`/`Write` a file you have not `Read` this session.
- **Never trust `start-harness.sh` exit codes.** `all` cannot fail via status — grep the
  output for `FAIL`.
- **Kill the harness server before `next build`** or EBUSY empties `BUILD_ID` and invents
  failures: `bash scripts/start-harness.sh stop` first.
- **Commit after every task.** Stage only that task's files — the tree carries unrelated
  dirty files.
- These files are **frozen**. If a diff touches them, the task is wrong:
  `frontend/src/hooks/useAdmin.ts`,
  `frontend/src/aurora/components/admin/cohortAnalyticsView.ts`,
  `frontend/src/aurora/components/admin/riskRowView.ts`,
  `frontend/src/aurora/components/admin/masteryView.ts`,
  `frontend/src/aurora/components/admin/performanceTrendView.ts`.

## File structure

**Created**

| Path | Responsibility |
| --- | --- |
| `frontend/src/app/(console)/layout.tsx` | Route-group layout: guard + console chrome, owns the single `<main>` |
| `frontend/src/app/(console)/admin/page.tsx` | Overview route |
| `frontend/src/app/(console)/admin/students/page.tsx` | Roster route |
| `frontend/src/app/(console)/admin/accounts/page.tsx` | Provisioning route (admin) |
| `frontend/src/app/(console)/admin/audit/page.tsx` | Audit route (admin) |
| `frontend/src/aurora/console/console.css` | `.cs` token scope + every `.cs-*` rule |
| `frontend/src/aurora/console/ConsoleShell.tsx` | Top bar + nav + main, and the discipline context |
| `frontend/src/aurora/console/disciplineContext.tsx` | Console-global discipline state |
| `frontend/src/aurora/console/Panel.tsx` | `Panel`, `StatCard`, `HeroMetric` |
| `frontend/src/aurora/console/DataTable.tsx` | One table driving roster / staff / approved / audit |
| `frontend/src/aurora/console/Sparkline.tsx` | Hero trend line, null-gap aware |
| `frontend/src/aurora/console/BarList.tsx` | Ranked horizontal bars |
| `frontend/src/aurora/console/TopicDetail.tsx` | Per-topic drill-down surface |
| `frontend/src/aurora/console/states.tsx` | `CsSkeleton` / `CsError` / `CsEmpty` |
| `frontend/src/aurora/console/Overview.tsx` | The Overview screen |
| `frontend/tests/console_assert.mjs` | Playwright harness (auto-gated) |

**Modified**

| Path | Change |
| --- | --- |
| `frontend/src/styles/index.css` | `@import "../aurora/console/console.css";` |
| `frontend/tests/_mocks.mjs` | Add `/api/admin/staff` + `/api/admin/audit` routes |
| `frontend/src/aurora/tour/tourSteps.ts:51` | Re-point the `.aurora-admin` selector |
| `frontend/src/aurora/aurora.css` | Delete the `.aurora-admin` block (62 rules) |
| `frontend/src/aurora/screens/AdminProvisioning.tsx` | Re-skin onto `.cs-*` |
| `frontend/src/aurora/screens/AdminAudit.tsx` | Re-skin onto `.cs-*` |
| `frontend/src/aurora/screens/AdminRoster.tsx` | Re-skin onto `DataTable` |
| `frontend/src/aurora/screens/AdminStudentDetail.tsx` | Re-skin onto `.cs-*` |
| `docs/design-locks.md` | Replace the 2026-07-13 admin criteria |

**Deleted** (only after the replacement is green)

`frontend/src/aurora/screens/Admin.tsx`, `AdminCohort.tsx`, `AdminTopicAnalytics.tsx`,
`AdminPerformanceTrend.tsx`, `frontend/src/app/(shell)/admin/page.tsx`.

---

# Phase 1 — Harness foundation

### Task 1: Mock the two missing admin endpoints

`console_assert.mjs` cannot boot the console without these; `mockApis` covers every other
admin route already.

**Files:**
- Modify: `frontend/tests/_mocks.mjs` (inside `mockApis`, beside the `/api/admin/approved` route at line 193)

- [ ] **Step 1: Read the file and locate the `/api/admin/approved` route**

Run: read `frontend/tests/_mocks.mjs`, find line 193.

- [ ] **Step 2: Add both routes immediately after it**

```js
  await ctx.route("**/api/admin/staff", (r) => r.fulfill(J({ staff: [
    { student_id: "T001", full_name: "Coach Lim", email: "trainer@snec.com.sg", role: "trainer",
      status: "active", session_count: 4, streak: 2, last_active: new Date().toISOString() },
    { student_id: "", full_name: "", email: "pending.admin@snec.com.sg", role: "admin",
      status: "pending", session_count: 0, streak: 0, last_active: "" },
  ] })));
  await ctx.route("**/api/admin/audit*", (r) => r.fulfill(J({ events: [
    { audit_id: "a1", ts: new Date().toISOString(), actor: "admin@snec.com.sg", action: "login_success",
      target: "admin@snec.com.sg", feature: "auth", detail: "ok", ip: "127.0.0.1" },
    { audit_id: "a2", ts: new Date().toISOString(), actor: "admin@snec.com.sg", action: "promote",
      target: "trainer@snec.com.sg", feature: "privilege", detail: "→ trainer", ip: "127.0.0.1" },
  ] })));
```

- [ ] **Step 3: Verify no existing harness breaks**

Run: `cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT/frontend" && npm run test:logic`
Expected: all logic harnesses pass (adding routes cannot affect them, this is the cheap guard).

- [ ] **Step 4: Commit**

```bash
git add frontend/tests/_mocks.mjs
git commit -m "test(mocks): mock /api/admin/staff and /api/admin/audit"
```

---

### Task 2: The failing harness — /admin must render outside the shell

This is the red test the whole rebuild turns green. Written first, deliberately failing.

**Files:**
- Create: `frontend/tests/console_assert.mjs`

- [ ] **Step 1: Write the harness**

```js
/* EyeBot Console harness — /admin as a full-bleed light console.
 * Auto-gated: gated_harnesses() discovers any frontend/tests/*.mjs that is not
 * `_`-prefixed and imports playwright. Run:
 *   bash scripts/start-harness.sh serve
 *   node frontend/tests/console_assert.mjs
 */
import { chromium } from "playwright";
import { admin, seededContext } from "./_mocks.mjs";

const BASE = process.env.HARNESS_BASE ?? "http://127.0.0.1:3000";
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

const browser = await chromium.launch();

/* ---------- desktop ---------- */
{
  const ctx = await seededContext(browser, BASE, admin, { width: 1440, height: 900 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".cs-shell", { timeout: 15000 });

  // 1. Full-bleed: the student rail must NOT be present.
  check(await page.locator(".rail, .atlas-rail").count() === 0,
    "the Atlas Rail is still rendered inside the console");

  // 2. Exactly one <main> landmark — AppShell no longer supplies one.
  check(await page.locator("main").count() === 1,
    `expected exactly 1 <main>, found ${await page.locator("main").count()}`);

  // 3. The hero renders a figure, never a bare 0 — and never an out-of-range one.
  // TrendPoint.avg_score already arrives 0-100; multiplying it by 100 renders "6800%",
  // which a mere "has digits" check waves straight through. Bound it.
  const hero = (await page.locator("[data-testid=cs-hero-value]").innerText()).trim();
  check(/\d/.test(hero) && hero !== "0", `hero rendered "${hero}"`);
  if (hero.endsWith("%")) {
    const n = Number(hero.slice(0, -1));
    check(Number.isFinite(n) && n >= 0 && n <= 100,
      `hero percentage "${hero}" is outside 0-100 — check the 0-1 vs 0-100 scale`);
  }

  // 3b. Same bound on every stat card that reads as a percentage.
  const stats = await page.locator("[data-testid=cs-stat-value]").allInnerTexts();
  for (const s of stats.map((x) => x.trim()).filter((x) => x.endsWith("%"))) {
    const n = Number(s.slice(0, -1));
    check(Number.isFinite(n) && n >= 0 && n <= 100, `stat "${s}" is outside 0-100`);
  }

  // 4. White-on-gradient hero contrast >= 4.5:1.
  const ratio = await page.evaluate(() => {
    const el = document.querySelector("[data-testid=cs-hero-value]");
    const lum = (c) => {
      const [r, g, b] = c.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const parse = (s) => s.match(/\d+/g).slice(0, 3).map(Number);
    const fg = lum(parse(getComputedStyle(el).color));
    // The hero block paints the gradient; sample its darkest declared stop.
    const bg = lum([26, 79, 190]);
    const [hi, lo] = fg > bg ? [fg, bg] : [bg, fg];
    return (hi + 0.05) / (lo + 0.05);
  });
  check(ratio >= 4.5, `hero contrast ${ratio.toFixed(2)}:1 is below 4.5:1`);

  // 5. Nav deep-links resolve.
  for (const [href, sel] of [
    ["/admin/students", "[data-testid=admin-roster]"],
    ["/admin/accounts", "[data-testid=cs-accounts]"],
    ["/admin/audit", "[data-testid=admin-audit]"],
  ]) {
    await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded" });
    check(await page.locator(sel).count() > 0, `${href} did not render ${sel}`);
  }

  await ctx.close();
}

/* ---------- phone, coarse pointer ---------- */
{
  const ctx = await seededContext(browser, BASE, admin,
    { width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".cs-shell", { timeout: 15000 });

  // 6. No horizontal overflow at 390px.
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `page overflows horizontally by ${overflow}px at 390`);

  // 7. Tap targets >= 44px, measured SETTLED (a correct 44 reads 43.7 mid-transition).
  await page.waitForTimeout(600);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll(".cs-shell a, .cs-shell button")]
      .filter((el) => el.offsetParent !== null)
      .map((el) => { const r = el.getBoundingClientRect(); return { t: el.textContent.trim().slice(0, 24), h: Math.round(r.height) }; })
      .filter((x) => x.h > 0 && x.h < 44));
  check(small.length === 0, `tap targets under 44px: ${JSON.stringify(small)}`);

  await ctx.close();
}

await browser.close();

if (fails.length) {
  console.log(`console_assert: FAIL (${fails.length})`);
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("console_assert: all assertions passed");
```

- [ ] **Step 2: Confirm it is discovered by the gate**

Run: `cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT" && bash scripts/start-harness.sh list`
Expected: the output includes `console_assert.mjs`.

- [ ] **Step 3: Run it and watch it fail**

```bash
cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT" && bash scripts/start-harness.sh serve && node frontend/tests/console_assert.mjs
```
Expected: **FAIL** — `.cs-shell` never appears (15s timeout). That is the correct red state.

- [ ] **Step 4: Commit the red test**

```bash
git add frontend/tests/console_assert.mjs
git commit -m "test(console): failing harness for the /admin console rebuild"
```

---

# Phase 2 — Token scope and shell

### Task 3: `console.css` — the `.cs` token scope

**Files:**
- Create: `frontend/src/aurora/console/console.css`
- Modify: `frontend/src/styles/index.css:17` (after the `fx.css` import)

- [ ] **Step 1: Write the token scope**

```css
/* EyeBot Console — "Aurora Command, light". Scoped under .cs so it re-themes the
   surface without touching the student app (the .aurora-chat pattern, inverted:
   this one goes LIGHT). Hue encodes DOMAIN, never decoration:
     blue = population · coral = risk · teal = pass/safe · purple = topics · amber = warning
   Fonts are pinned explicitly — an undefined --font-* var falls back to Times. */
.cs {
  --cs-blue:   #2F6FE4;
  --cs-purple: #8154BE;
  --cs-coral:  #CE4655;
  --cs-teal:   #0C8F84;
  --cs-amber:  #BE710A;

  --cs-ink:   #131628;
  --cs-ink-2: #4C5468;
  --cs-ink-3: #767E94;
  --cs-hair:  rgba(19, 22, 40, 0.09);
  --cs-hair-2: rgba(19, 22, 40, 0.15);
  --cs-surface: #FFFFFF;

  /* The one full-gradient fill on the console. Stops are DARKENED Gemini hues so
     white text clears AA on every one: 7.2:1 / 7.2:1 / 6.2:1. Do not lighten them. */
  --cs-hero: linear-gradient(118deg, #1A4FBE 0%, #6B4499 50%, #A83C47 100%);
  --cs-accent: linear-gradient(112deg, #2F6FE4, #8154BE);

  --font-sans: var(--font-sans-src), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-mono-src), ui-monospace, "SF Mono", Menlo, monospace;

  color: var(--cs-ink);
  font-family: var(--font-sans);
  min-height: 100dvh;
  background:
    radial-gradient(720px 330px at 4% -14%, rgba(66, 133, 244, 0.30), transparent 60%),
    radial-gradient(680px 320px at 99% -8%, rgba(155, 114, 203, 0.28), transparent 58%),
    radial-gradient(700px 400px at 55% 112%, rgba(217, 101, 112, 0.20), transparent 62%),
    #EDF1FA;
}

.cs-num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

/* ── shell ── */
.cs-shell { display: flex; flex-direction: column; min-height: 100dvh; }
.cs-top {
  display: flex; align-items: center; gap: 13px; padding: 0 16px; height: 56px;
  background: rgba(255, 255, 255, 0.80); backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--cs-hair); position: sticky; top: 0; z-index: 20;
}
.cs-title { font-size: 14px; font-weight: 700; letter-spacing: -0.014em; }
.cs-title span { color: var(--cs-ink-3); font-weight: 500; }
.cs-body { display: grid; grid-template-columns: 184px 1fr; flex: 1; min-height: 0; }
.cs-nav {
  padding: 14px 9px; display: flex; flex-direction: column; gap: 2px;
  border-right: 1px solid var(--cs-hair); background: rgba(255, 255, 255, 0.50);
}
.cs-navlab {
  font-size: 9px; letter-spacing: 0.15em; text-transform: uppercase;
  color: var(--cs-ink-3); font-weight: 700; padding: 8px 10px 5px;
}
.cs-navi {
  display: flex; align-items: center; gap: 9px; font-size: 13px; font-weight: 570;
  color: var(--cs-ink-2); padding: 11px 10px; border-radius: 9px;
  text-decoration: none; min-height: 44px; box-sizing: border-box;
}
.cs-navi[data-active="true"] {
  color: #fff; font-weight: 670; background: var(--cs-accent);
  box-shadow: 0 3px 12px rgba(47, 111, 228, 0.34);
}
.cs-navdot { width: 7px; height: 7px; border-radius: 2.5px; flex: none; }
.cs-navn {
  margin-left: auto; font-size: 10px; font-weight: 760; color: #fff;
  background: var(--cs-coral); border-radius: 999px; padding: 2px 7px;
}
.cs-main { padding: 18px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }

/* ── controls ── */
.cs-seg { display: flex; background: rgba(19, 22, 40, 0.06); border-radius: 9px; padding: 3px; gap: 2px; }
.cs-seg button {
  font-size: 11.5px; font-weight: 640; padding: 8px 12px; border-radius: 6.5px;
  color: var(--cs-ink-2); background: none; border: 0; min-height: 44px;
}
.cs-seg button[data-active="true"] { background: var(--cs-accent); color: #fff; }
.cs-live {
  margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 11px;
  color: var(--cs-teal); font-weight: 680; background: rgba(12, 143, 132, 0.11);
  border-radius: 999px; padding: 5px 11px;
}
.cs-livedot {
  width: 6px; height: 6px; border-radius: 50%; background: var(--cs-teal);
  box-shadow: 0 0 0 3.5px rgba(12, 143, 132, 0.20);
}
.cs-back {
  font-size: 11px; font-weight: 660; color: #fff; background: var(--cs-accent);
  border-radius: 8px; padding: 0 12px; text-decoration: none;
  display: inline-flex; align-items: center; min-height: 44px;
}

/* ── hero ── */
.cs-hero {
  display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(0, 1fr); gap: 18px;
  align-items: end; border-radius: 15px; padding: 20px; position: relative;
  overflow: hidden; background: var(--cs-hero);
  box-shadow: 0 10px 30px -8px rgba(74, 54, 140, 0.50);
}
.cs-hero::after {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(560px 200px at 88% -30%, rgba(255, 255, 255, 0.26), transparent 66%);
}
.cs-hero > * { position: relative; z-index: 1; }
.cs-eyebrow {
  font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; font-weight: 700;
  color: var(--cs-ink-3);
}
.cs-hero .cs-eyebrow { color: rgba(255, 255, 255, 0.84); }
.cs-hero-val {
  font-size: clamp(44px, 7vw, 64px); font-weight: 250; letter-spacing: -0.05em;
  line-height: 0.86; margin: 8px 0; color: #fff; text-shadow: 0 2px 18px rgba(0, 0, 0, 0.22);
}
.cs-hpills { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.cs-hpill {
  font-size: 10.5px; font-weight: 640; color: #fff; background: rgba(255, 255, 255, 0.19);
  border: 1px solid rgba(255, 255, 255, 0.26); border-radius: 999px; padding: 3px 9px;
}
.cs-hup { font-size: 10.5px; font-weight: 760; color: #0A3F1E; background: #7BE8A8; border-radius: 999px; padding: 3px 9px; }

/* ── stat cards + panels (hue via --cs-h / --cs-h2) ── */
.cs-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.cs-stat, .cs-panel {
  border-radius: 12px; overflow: hidden; border: 1px solid var(--cs-h-edge, var(--cs-hair-2));
  background: var(--cs-surface);
}
.cs-band {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px; color: #fff;
  background: linear-gradient(100deg, var(--cs-h), var(--cs-h2, var(--cs-h)));
  font-size: 10px; font-weight: 740; letter-spacing: 0.11em; text-transform: uppercase;
}
.cs-panel .cs-band { font-size: 12px; letter-spacing: -0.008em; text-transform: none; }
.cs-tag {
  margin-left: auto; font-size: 9px; font-weight: 760; letter-spacing: 0.06em;
  text-transform: uppercase; padding: 3px 8px; border-radius: 999px;
  background: rgba(255, 255, 255, 0.22); border: 1px solid rgba(255, 255, 255, 0.3);
}
.cs-cbody { padding: 11px 13px 12px; }
.cs-statv { font-size: 26px; font-weight: 400; letter-spacing: -0.032em; line-height: 1; color: var(--cs-h); }
.cs-statd { font-size: 10px; font-weight: 660; margin-top: 6px; color: var(--cs-ink-3); }
.cs-note { font-size: 11px; color: var(--cs-ink-3); line-height: 1.45; margin: 0 0 8px; }
.cs-two { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: 11px; }

/* Marker for any figure the discipline segment cannot re-scope. */
.cs-allmark {
  font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--cs-ink-3); border: 1px solid var(--cs-hair-2); border-radius: 999px; padding: 2px 7px;
}

/* ── motion: entrance only, frozen on request ── */
@keyframes cs-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.cs-rise { animation: cs-rise 0.42s cubic-bezier(0.22, 1, 0.36, 1) both; }
html[data-motion="reduce"] .cs-rise { animation: none; }
@media (prefers-reduced-motion: reduce) { .cs-rise { animation: none; } }

/* ── coarse pointer: bottom nav, stacked cards. Gated on POINTER, never width. ── */
@media (pointer: coarse) {
  .cs-body { grid-template-columns: 1fr; }
  .cs-nav {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;
    flex-direction: row; justify-content: space-around; border-right: 0;
    border-top: 1px solid var(--cs-hair-2); background: rgba(255, 255, 255, 0.94);
    backdrop-filter: blur(16px); padding: 6px 6px calc(6px + env(safe-area-inset-bottom));
  }
  .cs-navlab { display: none; }
  .cs-navi { flex-direction: column; gap: 3px; font-size: 10px; padding: 6px 8px; flex: 1; justify-content: center; }
  .cs-navn { margin-left: 0; position: absolute; top: 2px; right: 12px; }
  .cs-main { padding: 12px 12px 84px; }
  .cs-hero { grid-template-columns: 1fr; }
  .cs-strip { grid-template-columns: repeat(2, 1fr); }
  .cs-two { grid-template-columns: 1fr; }
}
```

- [ ] **Step 2: Import it**

In `frontend/src/styles/index.css`, after line 17 (`@import '../fx/fx.css';`):

```css
@import "../aurora/console/console.css";
```

- [ ] **Step 3: Verify the stylesheet compiles**

Run: `cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT/frontend" && npm run build`
Expected: build succeeds. (If the box is memory-starved, use `npm run build:safe`.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/aurora/console/console.css frontend/src/styles/index.css
git commit -m "feat(console): the .cs light token scope"
```

---

### Task 4: Discipline context

Console-global state, with an explicit list of what it cannot scope.

**Files:**
- Create: `frontend/src/aurora/console/disciplineContext.tsx`

- [ ] **Step 1: Write it**

```tsx
"use client";
/* Console-global discipline state. ONLY useCohortAnalytics and usePerformanceTrend
   accept the parameter — useCohort / useAtRisk / useTokenSummary / useRoster / useAudit
   are cohort-wide and cannot be re-scoped without backend work. D11 rejected a global
   control for exactly that reason; the resolution here is MARKING, not hiding. Any
   surface this cannot scope renders <AllDisciplines /> on its face. */
import { createContext, useContext, useState, type ReactNode } from "react";
import type { Discipline } from "@/hooks/useAdmin";

const Ctx = createContext<{ discipline: Discipline; setDiscipline: (d: Discipline) => void }>({
  discipline: "all",
  setDiscipline: () => {},
});

export const DISCIPLINES: { key: Discipline; label: string }[] = [
  { key: "all", label: "All" },
  { key: "oa_psa", label: "OA & PSA" },
  { key: "ot", label: "OT" },
];

export function DisciplineProvider({ children }: { children: ReactNode }) {
  const [discipline, setDiscipline] = useState<Discipline>("all");
  return <Ctx.Provider value={{ discipline, setDiscipline }}>{children}</Ctx.Provider>;
}

export function useDiscipline() {
  return useContext(Ctx);
}

/** Renders on every figure the segment cannot re-scope. Never omit it — an unmarked
    figure that ignores the control is the defect D11 was written to prevent. */
export function AllDisciplines() {
  return (
    <span className="cs-allmark" data-testid="cs-allmark" title="This figure covers every discipline — the switcher does not re-scope it.">
      All disciplines
    </span>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT/frontend" && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/console/disciplineContext.tsx
git commit -m "feat(console): console-global discipline context with the All-disciplines marker"
```

---

### Task 5: `ConsoleShell` — top bar, nav, single `<main>`

**Files:**
- Create: `frontend/src/aurora/console/ConsoleShell.tsx`

- [ ] **Step 1: Write it**

```tsx
"use client";
/* Console chrome. Renders THE single <main id="main"> for /admin — AppShell used to
   supply one and no longer does, so this owns the only landmark on the page. Governance
   links appear for role === "admin" only; the backend re-enforces require_admin. */
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/screens/AuthContext";
import { useAtRisk } from "@/hooks/useAdmin";
import { DisciplineProvider, useDiscipline, DISCIPLINES } from "@/aurora/console/disciplineContext";

const TEACHING = [
  { href: "/admin", label: "Overview", hue: "var(--cs-blue)" },
  { href: "/admin/students", label: "Students", hue: "var(--cs-coral)" },
];
const GOVERNANCE = [
  { href: "/admin/accounts", label: "Accounts", hue: "var(--cs-teal)" },
  { href: "/admin/audit", label: "Audit", hue: "var(--cs-amber)" },
];

function TopBar() {
  const { discipline, setDiscipline } = useDiscipline();
  return (
    <header className="cs-top">
      <span className="cs-title">EyeBot <span>Console</span></span>
      <div className="cs-seg" role="group" aria-label="Discipline filter" data-testid="cs-discipline">
        {DISCIPLINES.map((d) => (
          <button key={d.key} type="button" data-discipline={d.key}
                  data-active={discipline === d.key} aria-pressed={discipline === d.key}
                  onClick={() => setDiscipline(d.key)}>{d.label}</button>
        ))}
      </div>
      <span className="cs-live"><span className="cs-livedot" />Live · 30s</span>
      <Link href="/homepage" className="cs-back">← Student app</Link>
    </header>
  );
}

function Nav() {
  const path = usePathname();
  const { user } = useAuth();
  const atRisk = useAtRisk();
  const flagged = atRisk.data?.length ?? 0;
  const item = (i: { href: string; label: string; hue: string }) => (
    <Link key={i.href} href={i.href} className="cs-navi"
          data-active={path === i.href} aria-current={path === i.href ? "page" : undefined}>
      <span className="cs-navdot" style={{ background: path === i.href ? "#fff" : i.hue }} />
      {i.label}
      {i.href === "/admin/students" && flagged > 0 && <span className="cs-navn">{flagged}</span>}
    </Link>
  );
  return (
    <nav className="cs-nav" aria-label="Console">
      <span className="cs-navlab">Teaching</span>
      {TEACHING.map(item)}
      {user?.role === "admin" && (
        <>
          <span className="cs-navlab" style={{ marginTop: 8 }}>Governance</span>
          {GOVERNANCE.map(item)}
        </>
      )}
    </nav>
  );
}

export function ConsoleShell({ children }: { children: ReactNode }) {
  return (
    <DisciplineProvider>
      <div className="cs">
        <div className="cs-shell">
          <TopBar />
          <div className="cs-body">
            <Nav />
            <main id="main" className="cs-main">{children}</main>
          </div>
        </div>
      </div>
    </DisciplineProvider>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT/frontend" && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/console/ConsoleShell.tsx
git commit -m "feat(console): ConsoleShell — top bar, grouped nav, single main landmark"
```

---

### Task 6: The `(console)` route group

**Files:**
- Create: `frontend/src/app/(console)/layout.tsx`
- Create: `frontend/src/app/(console)/admin/page.tsx`
- Create: `frontend/src/app/(console)/admin/students/page.tsx`
- Create: `frontend/src/app/(console)/admin/accounts/page.tsx`
- Create: `frontend/src/app/(console)/admin/audit/page.tsx`
- Delete: `frontend/src/app/(shell)/admin/page.tsx`

- [ ] **Step 1: Write the layout**

`frontend/src/app/(console)/layout.tsx`:

```tsx
"use client";
/* The console route group. Providers (QueryClient + Auth) come from the ROOT layout,
   so this group simply omits AppShell — that is the whole point: no Atlas Rail. */
import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const AdminGuard = dynamic(
  () => import("@/screens/AdminGuard").then((m) => m.AdminGuard),
  { ssr: false },
);
const ConsoleShell = dynamic(
  () => import("@/aurora/console/ConsoleShell").then((m) => m.ConsoleShell),
  { ssr: false },
);

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <AdminGuard>
      <ConsoleShell>{children}</ConsoleShell>
    </AdminGuard>
  );
}
```

- [ ] **Step 2: Write the four pages**

`frontend/src/app/(console)/admin/page.tsx`:

```tsx
"use client";
import dynamic from "next/dynamic";
const Overview = dynamic(() => import("@/aurora/console/Overview").then((m) => m.Overview), { ssr: false });
export default function Page() { return <Overview />; }
```

`frontend/src/app/(console)/admin/students/page.tsx`:

```tsx
"use client";
import dynamic from "next/dynamic";
const AdminRoster = dynamic(() => import("@/aurora/screens/AdminRoster").then((m) => m.AdminRoster), { ssr: false });
export default function Page() { return <AdminRoster />; }
```

`frontend/src/app/(console)/admin/accounts/page.tsx`:

```tsx
"use client";
/* Admin-only. The nav hides the link for a trainer and the backend enforces
   require_admin on every write; this re-guards the direct URL. */
import dynamic from "next/dynamic";
import { Navigate } from "@/lib/nav";
import { useAuth } from "@/screens/AuthContext";
const AdminProvisioning = dynamic(() => import("@/aurora/screens/AdminProvisioning").then((m) => m.AdminProvisioning), { ssr: false });
export default function Page() {
  const { user } = useAuth();
  if (user && user.role !== "admin") return <Navigate to="/admin" replace />;
  return <AdminProvisioning />;
}
```

`frontend/src/app/(console)/admin/audit/page.tsx`:

```tsx
"use client";
import dynamic from "next/dynamic";
import { Navigate } from "@/lib/nav";
import { useAuth } from "@/screens/AuthContext";
const AdminAudit = dynamic(() => import("@/aurora/screens/AdminAudit").then((m) => m.AdminAudit), { ssr: false });
export default function Page() {
  const { user } = useAuth();
  if (user && user.role !== "admin") return <Navigate to="/admin" replace />;
  return <AdminAudit />;
}
```

- [ ] **Step 3: Delete the old route**

```bash
git rm frontend/src/app/\(shell\)/admin/page.tsx
```

- [ ] **Step 4: Add a placeholder Overview so the route resolves**

Create `frontend/src/aurora/console/Overview.tsx` with the real hero only — Task 8 fills
the rest. This keeps the tree building between tasks:

```tsx
"use client";
export function Overview() {
  return <p className="cs-note">Overview</p>;
}
```

- [ ] **Step 5: Verify build + the shell half of the harness**

```bash
cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT" && bash scripts/start-harness.sh stop && cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT/frontend" && npm run typecheck && npm run build
```
Expected: both pass.

```bash
cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT" && bash scripts/start-harness.sh serve && node frontend/tests/console_assert.mjs
```
Expected: **FAIL, but further along** — assertions 1 (no rail), 2 (one `<main>`) and 5
(deep links) now pass; 3/4 still fail because `cs-hero-value` does not exist yet.

- [ ] **Step 6: Commit**

```bash
git add "frontend/src/app/(console)" frontend/src/aurora/console/Overview.tsx
git commit -m "feat(console): move /admin into its own (console) route group"
```

---

# Phase 3 — Primitives

### Task 7: `states.tsx`, `Panel.tsx`, `Sparkline.tsx`, `BarList.tsx`

**Files:**
- Create: `frontend/src/aurora/console/states.tsx`
- Create: `frontend/src/aurora/console/Panel.tsx`
- Create: `frontend/src/aurora/console/Sparkline.tsx`
- Create: `frontend/src/aurora/console/BarList.tsx`

- [ ] **Step 1: `states.tsx`**

```tsx
"use client";
/* A failed admin read must LOOK like a failure. Rendering it as 0 made a broken
   backend indistinguishable from an empty cohort — the worst failure mode a clinical
   dashboard has. Ported intact from PanelState.tsx onto the .cs surface. */
export function CsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} style={{ height: 12, borderRadius: 6, background: "rgba(19,22,40,.07)" }} />
      ))}
    </div>
  );
}

export function CsError({ onRetry, label = "Couldn’t load this panel." }: {
  onRetry: () => void; label?: string;
}) {
  return (
    <div role="alert" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <p className="cs-note" style={{ margin: 0, color: "var(--cs-coral)", fontWeight: 600 }}>{label}</p>
      <button type="button" onClick={onRetry} style={{
        minHeight: 44, padding: "0 14px", borderRadius: 8, fontSize: 12, fontWeight: 640,
        border: "1px solid var(--cs-hair-2)", background: "none", color: "var(--cs-ink-2)",
      }}>Retry</button>
    </div>
  );
}

export function CsEmpty({ children }: { children: React.ReactNode }) {
  return <p className="cs-note" style={{ margin: 0 }}>{children}</p>;
}

/** A figure must never render 0 while loading or failed — a 0 there is
    indistinguishable from a real measurement of an empty cohort. */
export function figure(q: { isLoading: boolean; isError: boolean }, v: string | number): string {
  if (q.isLoading) return "…";
  if (q.isError) return "—";
  return String(v);
}
```

- [ ] **Step 2: `Panel.tsx`**

```tsx
"use client";
/* Hue-coded surfaces. `hue` names a DOMAIN, never a mood:
   blue = population · coral = risk · teal = pass/safe · purple = topics · amber = warning */
import type { CSSProperties, ReactNode } from "react";

export type Hue = "blue" | "coral" | "teal" | "purple" | "amber";

const RAMP: Record<Hue, [string, string]> = {
  blue:   ["#2F6FE4", "#4E85EC"],
  coral:  ["#CE4655", "#DE6B5C"],
  teal:   ["#0C8F84", "#1FAE96"],
  purple: ["#8154BE", "#9E6BD2"],
  amber:  ["#BE710A", "#D69233"],
};

function hueVars(hue: Hue): CSSProperties {
  const [a, b] = RAMP[hue];
  return { "--cs-h": a, "--cs-h2": b, "--cs-h-edge": `${a}55` } as CSSProperties;
}

export function StatCard({ hue, label, value, detail, detailHue, mark }: {
  hue: Hue; label: string; value: string; detail?: string; detailHue?: Hue; mark?: ReactNode;
}) {
  return (
    <div className="cs-stat cs-rise" style={hueVars(hue)}>
      <div className="cs-band">{label}{mark}</div>
      <div className="cs-cbody">
        <div className="cs-statv cs-num" data-testid="cs-stat-value">{value}</div>
        {detail && (
          <div className="cs-statd" style={detailHue ? { color: RAMP[detailHue][0] } : undefined}>{detail}</div>
        )}
      </div>
    </div>
  );
}

export function Panel({ hue, title, tag, mark, children, testId }: {
  hue: Hue; title: string; tag?: string; mark?: ReactNode; children: ReactNode; testId?: string;
}) {
  return (
    <section className="cs-panel cs-rise" style={hueVars(hue)} data-testid={testId}>
      <div className="cs-band">{title}{mark}{tag && <span className="cs-tag">{tag}</span>}</div>
      <div className="cs-cbody">{children}</div>
    </section>
  );
}

export function HeroMetric({ eyebrow, value, delta, pills, children }: {
  eyebrow: string; value: string; delta?: string; pills?: string[]; children?: ReactNode;
}) {
  return (
    <section className="cs-hero cs-rise" data-testid="cs-hero">
      <div>
        <p className="cs-eyebrow" style={{ margin: 0 }}>{eyebrow}</p>
        <p className="cs-hero-val cs-num" data-testid="cs-hero-value" style={{ margin: "8px 0" }}>{value}</p>
        <div className="cs-hpills">
          {delta && <span className="cs-hup">{delta}</span>}
          {(pills ?? []).map((p) => <span key={p} className="cs-hpill">{p}</span>)}
        </div>
      </div>
      {children}
    </section>
  );
}
```

- [ ] **Step 3: `Sparkline.tsx`**

```tsx
"use client";
/* Null-gap aware trend line for the hero. Two rules, both learned the hard way:
   - a null bucket is a GAP, never a point on the floor (D13). Plotting nulls as 0
     draws a cliff and reads as a cohort collapse.
   - a 1-point subpath draws NOTHING, so a lone reading renders as a dot. */
export function Sparkline({ values, height = 82 }: { values: (number | null)[]; height?: number }) {
  const W = 240;
  const n = values.length;
  if (n === 0) return null;
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  const lo = Math.min(...nums), hi = Math.max(...nums);
  const span = hi - lo || 1;
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => height - 8 - ((v - lo) / span) * (height - 22);

  // Split into contiguous runs so nulls become gaps, not zeros.
  const runs: { i: number; v: number }[][] = [];
  let cur: { i: number; v: number }[] = [];
  values.forEach((v, i) => {
    if (v === null) { if (cur.length) runs.push(cur); cur = []; }
    else cur.push({ i, v });
  });
  if (cur.length) runs.push(cur);
  const last = runs[runs.length - 1]?.at(-1);

  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none"
         role="img" aria-label="Cohort mastery trend">
      <line x1="0" y1={height * 0.27} x2={W} y2={height * 0.27} stroke="rgba(255,255,255,.17)" />
      <line x1="0" y1={height * 0.63} x2={W} y2={height * 0.63} stroke="rgba(255,255,255,.17)" />
      {runs.map((run, r) =>
        run.length === 1
          // A single reading has no line to draw — mark it, don't drop it.
          ? <circle key={r} cx={x(run[0].i)} cy={y(run[0].v)} r="3" fill="#fff" />
          : <polyline key={r} fill="none" stroke="#fff" strokeWidth="2.4"
                      strokeLinejoin="round" strokeLinecap="round"
                      points={run.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")} />
      )}
      {last && <circle cx={x(last.i)} cy={y(last.v)} r="4.2" fill="#fff" />}
    </svg>
  );
}
```

- [ ] **Step 4: `BarList.tsx`**

```tsx
"use client";
/* Ranked horizontal bars. Renders NOTHING when there are no rows — an empty track
   under a heading reads as a measured zero, so the owner shows its summary alone. */
import type { Hue } from "@/aurora/console/Panel";

/* Named CsBarRow, NOT BarRow — cohortAnalyticsView already exports a different
   `BarRow` (label/segments/readout/weak) and two same-named shapes in one screen is
   how a segment value ends up rendered as a percentage. */
export interface CsBarRow { label: string; value: number; readout: string; hue: Hue }

const HEX: Record<Hue, string> = {
  blue: "#2F6FE4", coral: "#CE4655", teal: "#0C8F84", purple: "#8154BE", amber: "#BE710A",
};

/** `max` is the divisor the source panel was measured against — BarPanel.max is 1 for
    already-normalised 0–1 values and the largest count for raw-count bars. Pass it
    through; never re-derive a scale from the rows. */
export function BarList({ rows, max }: { rows: CsBarRow[]; max?: number }) {
  if (rows.length === 0) return null;
  const top = max ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <div>
      {rows.map((r) => (
        <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 0", fontSize: 11 }}>
          <span style={{ width: 92, flex: "none", color: "var(--cs-ink-2)", overflow: "hidden",
                         textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
          <span style={{ flex: 1, height: 9, borderRadius: 5, background: "rgba(19,22,40,.07)", overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", borderRadius: 5,
                           width: `${Math.max(0, Math.min(100, (r.value / top) * 100))}%`,
                           background: HEX[r.hue] }} />
          </span>
          <span className="cs-num" style={{ width: 40, textAlign: "right", fontWeight: 700, color: HEX[r.hue] }}>{r.readout}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT/frontend" && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/aurora/console/states.tsx frontend/src/aurora/console/Panel.tsx frontend/src/aurora/console/Sparkline.tsx frontend/src/aurora/console/BarList.tsx
git commit -m "feat(console): state, panel, sparkline and bar primitives"
```

---

# Phase 4 — Overview

### Task 8: The Overview screen

Turns harness assertions 3 and 4 green.

**Files:**
- Modify: `frontend/src/aurora/console/Overview.tsx` (replace the placeholder from Task 6)

- [ ] **Step 1: Write it**

```tsx
"use client";
/* Console Overview — one hero, four stat cards, two panels. Nothing else.
   Adding a panel here requires naming the decision it changes (spec §11.3).

   Discipline scoping, stated on the face of every figure (spec §4): the hero, the
   OSCE stats and Weakest topics FOLLOW the segment; Students, Needs attention and
   AI tokens are cohort-wide and wear <AllDisciplines />. */
import { useState } from "react";
import { useAuth } from "@/screens/AuthContext";
import { useCohort, useAtRisk, useCohortAnalytics, usePerformanceTrend, useTokenSummary, useCohortInsight } from "@/hooks/useAdmin";
import { safetyPanel, weakestPanel } from "@/aurora/components/admin/cohortAnalyticsView";
import { riskRows } from "@/aurora/components/admin/riskRowView";
import { latestReading, deltaNote } from "@/aurora/components/admin/performanceTrendView";
import { fmtTokens } from "@/screens/adminShared";
import { useDiscipline, AllDisciplines } from "@/aurora/console/disciplineContext";
import { HeroMetric, StatCard, Panel } from "@/aurora/console/Panel";
import { Sparkline } from "@/aurora/console/Sparkline";
import { BarList, type CsBarRow } from "@/aurora/console/BarList";
import { CsSkeleton, CsError, CsEmpty, figure } from "@/aurora/console/states";
import { TopicDetail } from "@/aurora/console/TopicDetail";

const DAYS = 90;

export function Overview() {
  const { user } = useAuth();
  const { discipline } = useDiscipline();
  const cohort = useCohort();
  const atRisk = useAtRisk();
  const analytics = useCohortAnalytics(discipline, DAYS);
  const trend = usePerformanceTrend(DAYS, discipline);
  const tokens = useTokenSummary();
  const insight = useCohortInsight();
  const [openTopic, setOpenTopic] = useState<string | null>(null);

  const topics = analytics.data?.topics ?? [];
  const totals = analytics.data?.totals;
  const risks = riskRows(atRisk.data);
  const safety = safetyPanel(topics);
  const weakest = weakestPanel(topics, 6);
  const points = trend.data?.points ?? [];

  // null at a zero denominator, NEVER 0 (D13).
  //
  // SCALES DIFFER BY ENDPOINT — do not "tidy" these into one convention:
  //   TrendPoint.avg_score / pass_rate / safety_fail_rate  → already 0-100
  //     (performanceTrendView: "All three metrics share one 0-100 frame"; pct() emits
  //      `${v}%` with NO multiply). Multiplying here renders 6800%.
  //   TopicGroupRow.osce.pass_rate / safety_fail_rate / weakness_score → 0-1,
  //     so safetyPanel().rate below IS multiplied.
  const mastery = latestReading(points, "avg_score");
  const passRate = latestReading(points, "pass_rate");
  // Already a full sentence ("up 4.2 points across the window"), not a bare number,
  // and null on fewer than two real readings — one dot is not a trend.
  const masteryDelta = deltaNote(points, "avg_score");

  const heroValue = analytics.isLoading || trend.isLoading ? "…"
    : analytics.isError || trend.isError ? "—"
    : mastery === null ? "—" : `${Math.round(mastery)}%`;

  // weakestPanel returns BarPanel rows (label/segments/readout/weak) measured against
  // its own `max`. Sum the segments and pass `max` straight through — never rescale.
  const bars: CsBarRow[] = weakest.rows.map((r) => ({
    label: r.label,
    value: r.segments.reduce((s, g) => s + g.value, 0),
    readout: r.readout,
    hue: r.weak ? "coral" : "blue",
  }));

  return (
    <>
      <HeroMetric
        eyebrow={`Cohort mastery · ${DAYS} days`}
        value={heroValue}
        delta={masteryDelta ?? undefined}
        pills={[
          `${figure(analytics, totals?.students_in_pool ?? 0)} students in scope`,
          `${figure(analytics, totals?.osce_attempts ?? 0)} station attempts`,
        ]}
      >
        <Sparkline values={points.map((p) => p.avg_score)} />
      </HeroMetric>

      {insight.data && <p className="cs-note" data-testid="cs-insight">“{insight.data}”</p>}

      <div className="cs-strip">
        <StatCard hue="blue" label="Students" mark={<AllDisciplines />}
                  value={figure(cohort, cohort.data?.total ?? 0)}
                  detail={`${figure(cohort, cohort.data?.active_this_week ?? 0)} active this week`} />
        <StatCard hue="coral" label="Needs attention" mark={<AllDisciplines />}
                  value={figure(atRisk, risks.length)} detailHue="coral"
                  detail={risks.length === 1 ? "1 student flagged" : `${risks.length} students flagged`} />
        {/* passRate is 0-100 (trend endpoint) — NOT multiplied. */}
        <StatCard hue="teal" label="OSCE pass rate"
                  value={trend.isLoading ? "…" : trend.isError ? "—" : passRate === null ? "—" : `${Math.round(passRate)}%`}
                  detail={`Last ${DAYS} days`} />
        {/* safety.rate is 0-1 (cohort-analytics domain) — IS multiplied. */}
        <StatCard hue="purple" label="Safety fails"
                  value={analytics.isLoading ? "…" : analytics.isError ? "—" : safety.rate === null ? "—" : `${Math.round(safety.rate * 100)}%`}
                  detail={safety.summary} />
        {user?.role === "admin" && (
          <StatCard hue="amber" label="AI tokens" mark={<AllDisciplines />}
                    value={figure(tokens, `${tokens.data?.complete === false ? "≥ " : ""}${fmtTokens(tokens.data?.total_tokens ?? 0)}`)}
                    detail={tokens.data?.complete === false ? "A floor — the read hit its page cap" : "Across every session"} />
        )}
      </div>

      <div className="cs-two">
        <Panel hue="coral" title="Needs attention" mark={<AllDisciplines />}
               tag={risks.length ? `${risks.length} flagged` : undefined} testId="admin-at-risk">
          <p className="cs-note">
            Scored 0–100 from inactivity, OSCE results, safety fails, flashcard accuracy,
            streak and weak-topic breadth. Signals a student has no data for are excluded,
            not counted as zero.
          </p>
          {atRisk.isLoading ? <CsSkeleton /> :
           atRisk.isError ? <CsError onRetry={() => atRisk.refetch()} /> :
           risks.length === 0 ? <CsEmpty>No students are flagged right now.</CsEmpty> : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {risks.map((r) => (
                <li key={r.studentId} data-testid="risk-row"
                    style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap",
                             padding: "7px 0", borderTop: "1px solid var(--cs-hair)", fontSize: 11 }}>
                  <span data-testid="risk-band" data-band={r.band}
                        style={{ fontSize: 9, fontWeight: 760, letterSpacing: ".06em", textTransform: "uppercase",
                                 padding: "3px 8px", borderRadius: 999, color: "#fff",
                                 background: r.band === "high" ? "var(--cs-coral)" : "var(--cs-amber)" }}>{r.band}</span>
                  <code className="cs-num">{r.idLabel}</code>
                  {r.reasons.map((x) => (
                    <span key={x.factor} data-testid="risk-reason"
                          style={{ fontSize: 9.5, color: "var(--cs-ink-2)", background: "rgba(19,22,40,.055)",
                                   borderRadius: 999, padding: "2px 7px" }}>{x.detail}</span>
                  ))}
                  <span className="cs-num" data-testid="risk-score"
                        style={{ marginLeft: "auto", fontWeight: 720 }}>{r.scoreLabel}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel hue="purple" title="Weakest topics" tag={`${DAYS} days`} testId="cs-weakest">
          <p className="cs-note">Lowest cohort mastery first. Select a topic for its full breakdown.</p>
          {analytics.isLoading ? <CsSkeleton /> :
           analytics.isError ? <CsError onRetry={() => analytics.refetch()} label="Couldn’t load cohort topic performance." /> : (
            <>
              {/* An empty ranking renders its summary ALONE — an empty track under a
                  heading reads as a measured zero (D3). BarList returns null at 0 rows. */}
              <BarList rows={bars} max={weakest.max} />
              <p className="cs-note" style={{ marginTop: bars.length ? 8 : 0, marginBottom: 0 }}
                 data-testid="cs-weakest-summary">{weakest.summary}</p>
              {topics.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                  {weakest.rows.map((r) => (
                    <button key={r.label} type="button" onClick={() => setOpenTopic(r.label)}
                            style={{ minHeight: 44, padding: "0 11px", borderRadius: 8, fontSize: 11,
                                     fontWeight: 620, border: "1px solid var(--cs-hair-2)",
                                     background: "none", color: "var(--cs-ink-2)" }}>{r.label} ↗</button>
                  ))}
                </div>
              )}
            </>
          )}
        </Panel>
      </div>

      {openTopic && (
        <TopicDetail
          topic={topics.find((t) => t.label === openTopic) ?? null}
          onClose={() => setOpenTopic(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Write `TopicDetail.tsx`**

`frontend/src/aurora/console/TopicDetail.tsx`:

```tsx
"use client";
/* Per-topic drill-down. Reads the TopicGroupRow the Overview query ALREADY returned —
   this fires no additional request. Every rate is number|null: null renders "—", never 0%. */
import { useEffect } from "react";
import type { TopicGroupRow } from "@/hooks/useAdmin";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

export function TopicDetail({ topic, onClose }: { topic: TopicGroupRow | null; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!topic) return null;
  const o = topic.osce;
  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
         style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(19,22,40,.42)",
                  display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label={`${topic.label} detail`} data-testid="cs-topic-detail"
           style={{ background: "#fff", borderRadius: 14, maxWidth: 560, width: "100%",
                    maxHeight: "86dvh", overflowY: "auto", padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <p className="cs-eyebrow" style={{ margin: 0 }}>Topic detail</p>
          <button type="button" onClick={onClose} aria-label="Close"
                  style={{ marginLeft: "auto", minHeight: 44, minWidth: 44, border: 0, background: "none",
                           fontSize: 18, color: "var(--cs-ink-3)" }}>×</button>
        </div>
        <h2 style={{ fontSize: 19, fontWeight: 700, margin: "4px 0 12px" }}>{topic.label}</h2>

        <div className="cs-strip" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
          {[
            ["Attempts", String(o.attempts)],
            ["Students", String(o.students)],
            ["Avg score", o.avg_score === null ? "—" : `${Math.round(o.avg_score)}`],
            ["Pass rate", pct(o.pass_rate)],
            ["Safety fails", pct(o.safety_fail_rate)],
            ["Flashcards", topic.flashcard === null || topic.flashcard.n === 0 ? "—" : `${Math.round(topic.flashcard.accuracy ?? 0)}%`],
          ].map(([k, v]) => (
            <div key={k} style={{ border: "1px solid var(--cs-hair)", borderRadius: 10, padding: "9px 11px" }}>
              <div className="cs-eyebrow">{k}</div>
              <div className="cs-num" style={{ fontSize: 20, marginTop: 3 }}>{v}</div>
            </div>
          ))}
        </div>

        {o.missed_top.length > 0 && (
          <>
            <p className="cs-eyebrow" style={{ marginTop: 16 }}>Most-missed steps</p>
            <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0 }}>
              {o.missed_top.map((m) => (
                <li key={m.step} style={{ display: "flex", gap: 8, padding: "6px 0",
                                          borderTop: "1px solid var(--cs-hair)", fontSize: 12 }}>
                  <span>{m.step}</span>
                  <span className="cs-num" style={{ marginLeft: "auto", color: "var(--cs-coral)", fontWeight: 700 }}>
                    {m.count} miss{m.count === 1 ? "" : "es"} · {m.students} student{m.students === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {topic.low_confidence && (
          <p className="cs-note" style={{ marginTop: 12 }}>
            Thin data — treat this topic’s figures as indicative, not settled.
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run the harness**

```bash
cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT" && bash scripts/start-harness.sh stop && cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT/frontend" && npm run build
```
Then:
```bash
cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT" && bash scripts/start-harness.sh serve && node frontend/tests/console_assert.mjs
```
Expected: desktop assertions 1–5 **PASS**. Phone assertions 6–7 may still fail — Phase 6
addresses them. Grep for `FAIL`, do not trust exit status alone.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/aurora/console/Overview.tsx frontend/src/aurora/console/TopicDetail.tsx
git commit -m "feat(console): Overview — one hero, four stats, two panels"
```

---

# Phase 5 — Re-skin the surviving screens

**These are re-skins, not rewrites.** `AdminProvisioning`, `AdminAudit`, `AdminRoster` and
`AdminStudentDetail` carry intricate, security-relevant behaviour (one-time password
display, remove-confirm, the note-seeding guard against poll clobber, on-demand paid
narrative, report export). Keep every handler, every `useState`, every `useEffect` and
every `data-testid` **byte-identical**. Change class names and wrappers only.

### Task 9: Re-skin `AdminRoster` onto `DataTable`

**Files:**
- Create: `frontend/src/aurora/console/DataTable.tsx`
- Modify: `frontend/src/aurora/screens/AdminRoster.tsx`

- [ ] **Step 1: Write `DataTable.tsx`**

```tsx
"use client";
/* One table for roster / staff / approved / audit — four hand-rolled CSS grids before,
   each with its own column string and pager. On a coarse pointer it renders STACKED
   CARDS, not a horizontally scrolling grid: a 6-column grid at 390px is unreadable. */
import type { ReactNode } from "react";

export interface Column<T> { key: string; head: string; width: string; cell: (row: T) => ReactNode; primary?: boolean }

export function DataTable<T>({ columns, rows, rowKey, onRowClick, empty, testId }: {
  columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string;
  onRowClick?: (row: T) => void; empty: string; testId?: string;
}) {
  const grid = columns.map((c) => c.width).join(" ");
  return (
    <div className="cs-table" data-testid={testId}>
      <div className="cs-trow cs-thead" style={{ gridTemplateColumns: grid }}>
        {columns.map((c) => <span key={c.key}>{c.head}</span>)}
      </div>
      {rows.map((r) => (
        <div key={rowKey(r)} className="cs-trow" style={{ gridTemplateColumns: grid }}
             data-clickable={!!onRowClick}
             onClick={onRowClick ? () => onRowClick(r) : undefined}
             role={onRowClick ? "button" : undefined}
             tabIndex={onRowClick ? 0 : undefined}
             onKeyDown={onRowClick ? (e) => { if (e.key === "Enter") onRowClick(r); } : undefined}>
          {columns.map((c) => (
            <span key={c.key} data-label={c.head} data-primary={c.primary}>{c.cell(r)}</span>
          ))}
        </div>
      ))}
      {rows.length === 0 && <p className="cs-note" style={{ padding: "14px 12px", margin: 0 }}>{empty}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Add its CSS to `console.css`** (append)

```css
/* ── table ── */
.cs-table { border: 1px solid var(--cs-hair-2); border-radius: 12px; overflow: hidden; background: var(--cs-surface); }
.cs-trow { display: grid; gap: 10px; align-items: center; padding: 11px 13px; font-size: 12px; border-top: 1px solid var(--cs-hair); }
.cs-trow:first-child { border-top: 0; }
.cs-thead { font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase; font-weight: 700; color: var(--cs-ink-3); background: rgba(19,22,40,.028); }
.cs-trow[data-clickable="true"] { cursor: pointer; }
.cs-trow[data-clickable="true"]:hover { background: rgba(47,111,228,.05); }
.cs-badge { display: inline-flex; align-items: center; font-size: 9.5px; font-weight: 720; letter-spacing: .05em; text-transform: uppercase; padding: 3px 8px; border-radius: 999px; }
.cs-toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.cs-field { min-height: 44px; padding: 0 12px; border-radius: 9px; border: 1px solid var(--cs-hair-2); background: var(--cs-surface); font-size: 13px; color: var(--cs-ink); flex: 1; min-width: 180px; }
.cs-chip { min-height: 44px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--cs-hair-2); background: var(--cs-surface); font-size: 12px; font-weight: 620; color: var(--cs-ink-2); }
.cs-chip[data-active="true"] { background: var(--cs-accent); border-color: transparent; color: #fff; }
.cs-pager { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 11.5px; color: var(--cs-ink-3); flex-wrap: wrap; }
.cs-pager button { min-height: 44px; padding: 0 13px; border-radius: 8px; border: 1px solid var(--cs-hair-2); background: var(--cs-surface); font-size: 12px; font-weight: 620; color: var(--cs-ink-2); }
.cs-pager button:disabled { opacity: .45; }

@media (pointer: coarse) {
  /* Stacked cards. The grid columns are replaced outright, not squeezed. */
  .cs-thead { display: none; }
  .cs-trow { grid-template-columns: 1fr !important; gap: 4px; padding: 13px; }
  .cs-trow > span { display: flex; gap: 8px; font-size: 12px; }
  .cs-trow > span::before { content: attr(data-label); color: var(--cs-ink-3); font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; font-weight: 700; min-width: 82px; flex: none; }
  .cs-trow > span[data-primary="true"] { font-size: 15px; font-weight: 660; margin-bottom: 2px; }
  .cs-trow > span[data-primary="true"]::before { display: none; }
}
```

- [ ] **Step 3: Re-skin `AdminRoster.tsx`**

Keep `useRoster`, `useAtRisk`, `useTokenSummary`, `useStaff`, all `useState`, the
`filtered`/`totalPages`/`safePage`/`paged` logic and `AdminStudentDetail` exactly as they
are. Replace only the markup:

- `.aurora-toolbar` → `.cs-toolbar`; `.aurora-field` → `.cs-field`; `.aurora-chip` → `.cs-chip` (drop `aurora-flow`).
- Replace the hand-rolled `.aurora-table-wrap` grid with `<DataTable>`, keeping
  `data-testid="admin-roster"` and `data-testid="admin-staff"`:

```tsx
<DataTable
  testId="admin-roster"
  rows={paged}
  rowKey={(s) => s.student_id}
  onRowClick={(s) => setOpenId(s.student_id)}
  empty="No students found."
  columns={[
    { key: "name", head: "Name", width: "2.2fr", primary: true, cell: (s) => (
      <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
        {atRisk.includes(s.student_id) && (
          <span title="At risk" aria-label="At risk" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--cs-coral)", flex: "none" }} />
        )}
        {s.full_name}
      </span>
    ) },
    { key: "email", head: "Email", width: "2.4fr", cell: (s) => <span style={{ color: "var(--cs-ink-3)" }}>{s.email}</span> },
    { key: "role", head: "Role", width: "84px", cell: (s) => (
      <span className="cs-badge" style={{ background: "rgba(47,111,228,.11)", color: "var(--cs-blue)" }}>{s.role}</span>
    ) },
    { key: "sessions", head: "Sessions", width: "92px", cell: (s) => <span className="cs-num">{s.session_count}</span> },
    { key: "streak", head: "Streak", width: "78px", cell: (s) => <span className="cs-num">{s.streak}</span> },
    { key: "tokens", head: "Tokens", width: "92px", cell: (s) => <span className="cs-num">{fmtTokens(tokensByStudent[s.student_id] ?? 0)}</span> },
    { key: "last", head: "Last active", width: "112px", cell: (s) => <span className="cs-num">{s.last_active?.slice(0, 10) || "—"}</span> },
  ]}
/>
```

Apply the same treatment to the staff table (keep `data-testid="admin-staff"`, keep the
`activated` guard so a pending row is not clickable). Replace `.aurora-pager` with
`.cs-pager`, keeping the identical page arithmetic.

- [ ] **Step 4: Verify**

```bash
cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT/frontend" && npm run typecheck && npm run build
```
Expected: both pass. Then re-run `console_assert.mjs`; `admin-roster` must still resolve.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/console/DataTable.tsx frontend/src/aurora/console/console.css frontend/src/aurora/screens/AdminRoster.tsx
git commit -m "feat(console): one DataTable behind the roster and staff lists"
```

---

### Task 10: Re-skin `AdminAudit`

**Files:**
- Modify: `frontend/src/aurora/screens/AdminAudit.tsx`

- [ ] **Step 1: Swap markup only**

Keep `ACTION_META`, `CAT_ACTIONS`, `CAT_LABEL`, `whenLabel`, the filter and the pager
arithmetic untouched. Replace:

| Old | New |
| --- | --- |
| `.aurora-unavail` | `.cs-note` |
| `.aurora-toolbar` | `.cs-toolbar` |
| `.aurora-field` | `.cs-field` |
| `.aurora-chip` (+ `aurora-flow`) | `.cs-chip` |
| `.aurora-table-wrap` + `.aurora-trow` grid | `<DataTable testId="admin-audit" …>` |
| `.aurora-badge` `data-tone` | `.cs-badge` with the tone mapped to a `--cs-*` hue |
| `.aurora-pager` | `.cs-pager` |

Tone mapping (keeps the existing severity semantics): `green → var(--cs-teal)`,
`rose → var(--cs-coral)`, `amber → var(--cs-amber)`, `blue → var(--cs-blue)`,
`purple → var(--cs-purple)`, `undefined → var(--cs-ink-2)`.

Columns: `When 150px` (primary) · `Action 148px` · `Actor 1.5fr` · `Target 1.4fr` ·
`Detail 1.7fr` · `IP 118px`. Keep the two distinct empty strings — "No audit events
recorded yet…" when `events.length === 0`, "No events match this filter." otherwise.

- [ ] **Step 2: Verify**

Run: `cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT/frontend" && npm run typecheck && npm run build`
Expected: both pass. `console_assert.mjs` assertion 5 (`admin-audit`) must stay green.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/screens/AdminAudit.tsx
git commit -m "feat(console): re-skin the audit trail onto .cs"
```

---

### Task 11: Re-skin `AdminProvisioning`

**Files:**
- Modify: `frontend/src/aurora/screens/AdminProvisioning.tsx`

- [ ] **Step 1: Swap markup only — do not touch a handler**

`handleAdd`, `handleRemove`, `handlePromote`, `handleCsvFile`, `handleCsvImport`, every
`useState`, the `qc.setQueryData` optimistic removal and the `qc.invalidateQueries` calls
stay **exactly** as written. This code mints passwords and revokes access; a behavioural
edit here is out of scope for a re-skin.

Wrap the whole return in `<div data-testid="cs-accounts">` (the harness asserts it).
Then map: `.aurora-panel` → `<Panel hue="teal" title="Provision accounts">`,
`.console-segment` → `.cs-seg`, `.aurora-field`/`.aurora-select` → `.cs-field`,
`.aurora-btn` → `.cs-btn`, `.aurora-btn-ghost` → `.cs-btn-ghost`,
`.aurora-badge` → `.cs-badge`, `.aurora-table-wrap` → `<DataTable>`,
`.aurora-note is-err` → `.cs-note` with `color: var(--cs-coral)`,
`.aurora-note is-ok` → `.cs-note` with `color: var(--cs-teal)`.

Approved-accounts list → `<Panel hue="blue" title={`Approved accounts (${approved.length})`}>`
wrapping a `<DataTable>`; keep the remove button as a real 44px control.
Keep the `<details className="console-disclosure">` promote block and the confirm modal
structurally identical, restyled with `.cs-*`.

- [ ] **Step 2: Add the button styles to `console.css`** (append)

```css
.cs-btn {
  min-height: 44px; padding: 0 16px; border-radius: 9px; border: 0; font-size: 13px;
  font-weight: 660; color: #fff; background: var(--cs-accent);
  box-shadow: 0 3px 12px rgba(47, 111, 228, 0.30);
}
.cs-btn:disabled { opacity: .55; box-shadow: none; }
.cs-btn-ghost {
  min-height: 44px; padding: 0 15px; border-radius: 9px; font-size: 13px; font-weight: 640;
  border: 1px solid var(--cs-hair-2); background: var(--cs-surface); color: var(--cs-ink-2);
}
.cs-label { display: block; font-size: 10.5px; font-weight: 680; letter-spacing: .05em; text-transform: uppercase; color: var(--cs-ink-3); margin-bottom: 5px; }
.cs-drop { border: 1.5px dashed var(--cs-hair-2); border-radius: 12px; padding: 26px 16px; text-align: center; background: rgba(47,111,228,.03); }
```

- [ ] **Step 3: Behavioural verify — the password path must still work**

Run the app and add one account against the mocked backend; confirm the one-time password
still renders and the confirm-remove dialog still gates removal. A green build is not
evidence for this task.

Run: `cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT/frontend" && npm run typecheck && npm run build`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/aurora/screens/AdminProvisioning.tsx frontend/src/aurora/console/console.css
git commit -m "feat(console): re-skin provisioning onto .cs, handlers untouched"
```

---

### Task 12: Re-skin `AdminStudentDetail`

**Files:**
- Modify: `frontend/src/aurora/screens/AdminStudentDetail.tsx`

- [ ] **Step 1: Swap markup only**

Preserve exactly: the `seededFor` ref guard (a poll refetch must never clobber a
mid-edit note), `loadNarrative` staying behind an explicit button (it is a paid call),
`handleDownloadReport` in full, the Escape listener, and the
`mastery.length > 0` omission guard with its comment.

Preserve these test ids: `mastery-panel`, `mastery-row`, `mastery-value`,
`mastery-delta`, `mastery-cohort`.

Map `.aurora-modal-backdrop`/`.aurora-modal` → `.cs-modal-back`/`.cs-modal`,
`.aurora-mini-stats` → `.cs-strip`, each mini-stat → `<StatCard hue="blue" …>`,
`.aurora-tabs`/`.aurora-tab` → `.cs-seg` buttons, the three sub-tab tables → `<DataTable>`,
`.aurora-bars` rows → `<BarList>`, `.aurora-badge` → `.cs-badge`,
`.aurora-checkin-textarea` → `.cs-textarea`.

- [ ] **Step 2: Add modal + textarea styles to `console.css`** (append)

```css
.cs-modal-back { position: fixed; inset: 0; z-index: 60; background: rgba(19,22,40,.42); display: flex; align-items: center; justify-content: center; padding: 16px; }
.cs-modal { background: var(--cs-surface); border-radius: 14px; width: 100%; max-width: 720px; max-height: 88dvh; overflow-y: auto; padding: 18px; display: flex; flex-direction: column; gap: 14px; }
.cs-textarea { width: 100%; border-radius: 10px; border: 1px solid var(--cs-hair-2); background: var(--cs-surface); padding: 11px 12px; font: inherit; font-size: 13px; color: var(--cs-ink); resize: vertical; }
@media (pointer: coarse) { .cs-modal { max-width: 100%; max-height: 94dvh; } }
```

- [ ] **Step 3: Verify**

Run: `cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT/frontend" && npm run typecheck && npm run build`
Then `cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT/frontend" && npm run test:logic`
Expected: all pass — `mastery_view_logic` and `session_export_logic` prove the untouched
logic still holds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/aurora/screens/AdminStudentDetail.tsx frontend/src/aurora/console/console.css
git commit -m "feat(console): re-skin the student drill-down onto .cs"
```

---

# Phase 6 — Mobile

### Task 13: Turn the phone assertions green

**Files:**
- Modify: `frontend/src/aurora/console/console.css` (the existing `@media (pointer: coarse)` blocks)
- Modify: `frontend/tests/mobile_audit.mjs` (add the console routes)

- [ ] **Step 1: Run the harness at 390 and list the real violations**

```bash
cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT" && bash scripts/start-harness.sh serve && node frontend/tests/console_assert.mjs
```
Expected: assertions 6 and/or 7 fail with concrete overflow px and a JSON list of
sub-44px controls. **Fix what it names — do not pre-emptively restyle.**

- [ ] **Step 2: Fix each named violation in `console.css`**

Every control already carries `min-height: 44px` in the rules written above; the likely
residue is the topic chips, the `×` close control and the nav badge. Give each a
`min-height: 44px; min-width: 44px` inside the coarse-pointer block. For overflow, the
usual culprit is a grid child without `min-width: 0`:

```css
@media (pointer: coarse) {
  .cs-main > *, .cs-strip > *, .cs-two > * { min-width: 0; }
  .cs-hero-val { font-size: clamp(38px, 12vw, 52px); }
}
```

- [ ] **Step 3: Add the console to `mobile_audit.mjs`**

Find its route list and add `/admin`, `/admin/students`, `/admin/accounts`, `/admin/audit`.
Confirm the audit's context is created with `hasTouch: true` — harnesses run **fine**
pointer by default, so a `(pointer: coarse)` tier otherwise never renders and the audit
passes without testing anything.

- [ ] **Step 4: Verify both**

```bash
cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT" && node frontend/tests/console_assert.mjs && node frontend/tests/mobile_audit.mjs
```
Expected: `console_assert: all assertions passed`, and mobile_audit reporting **0 violations**.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/console/console.css frontend/tests/mobile_audit.mjs
git commit -m "fix(console): phone tiers — bottom nav, stacked cards, 44px targets"
```

---

# Phase 7 — Removal and closeout

### Task 14: Re-point the tour anchor

`tourSteps.ts:51` targets the CSS selector `.aurora-admin`. Deleting that class breaks the
first-run tour **silently** — no build error, no type error.

**Files:**
- Modify: `frontend/src/aurora/tour/tourSteps.ts:51`

- [ ] **Step 1: Read the step and change the target**

Change `target: ".aurora-admin"` to `target: ".cs-shell"`. Leave `route: "/admin"` and the
step copy as they are.

- [ ] **Step 2: Prove the tour still resolves the anchor**

```bash
cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT" && node frontend/tests/tour_engine_test.mjs && bash scripts/start-harness.sh serve && node frontend/tests/tour_assert.mjs
```
Expected: both pass. `tour_assert` is the one that would have caught a dangling selector.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/tour/tourSteps.ts
git commit -m "fix(tour): re-point the admin step at .cs-shell"
```

---

### Task 15: Delete the old console

Only now, with the replacement green.

**Files:**
- Delete: `frontend/src/aurora/screens/Admin.tsx`, `AdminCohort.tsx`, `AdminTopicAnalytics.tsx`, `AdminPerformanceTrend.tsx`
- Modify: `frontend/src/aurora/aurora.css` (remove the `.aurora-admin` block)

- [ ] **Step 1: Confirm nothing imports them**

```bash
cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT" && grep -rn "AdminCohort\|AdminTopicAnalytics\|AdminPerformanceTrend\|screens/Admin\"" frontend/src frontend/tests
```
Expected: **no matches.** If anything appears, fix the importer first.

- [ ] **Step 2: Delete the screens**

```bash
git rm frontend/src/aurora/screens/Admin.tsx frontend/src/aurora/screens/AdminCohort.tsx frontend/src/aurora/screens/AdminTopicAnalytics.tsx frontend/src/aurora/screens/AdminPerformanceTrend.tsx
```

Keep `CohortAnalyticsPanels.tsx`, `PanelState.tsx` and `DivergingBar.tsx` **only** if
something still imports them; check with grep and remove the genuine orphans your change
created. Do not delete the four frozen view-model `.ts` files — `cohortAnalyticsView` and
`riskRowView` and `performanceTrendView` are all imported by `Overview.tsx`, and
`masteryView` by the student drill-down.

- [ ] **Step 3: Remove the `.aurora-admin` CSS**

Read `frontend/src/aurora/aurora.css` around lines 2400–2430 and 3780–3810, then delete
the `.aurora-admin` scope block and its dark token overrides (62 occurrences total).
Verify with:

```bash
cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT" && grep -c "aurora-admin" frontend/src/aurora/aurora.css
```
Expected: `0`.

- [ ] **Step 4: Full gates**

```bash
cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT" && bash scripts/start-harness.sh stop && cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT/frontend" && npm run typecheck && npm run build && npm run test:logic
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src/aurora/screens frontend/src/aurora/aurora.css
git commit -m "refactor(console): delete the old dark admin board and its CSS scope"
```

---

### Task 16: Rewrite the design lock and ship

**Files:**
- Modify: `docs/design-locks.md:1038-1078`

- [ ] **Step 1: Replace the admin half of the 2026-07-13 entry**

Keep the pool-toggle half verbatim — it is unaffected. Replace the Analytics-page bullets
and the acceptance criteria with a new entry:

```markdown
## EyeBot Console (/admin) — LOCKED 2026-08-02
**Supersedes** the Analytics-page half of the 2026-07-13 trainer/admin lock. The pool
toggle is unchanged and still locked by that entry. Criteria **replaced**: the dark
`.aurora-analytics` surface, "keeps the light rail", and the four-tab structure.
- Spec: `docs/superpowers/specs/2026-08-02-admin-console-redesign-design.md` §11.
- Acceptance criteria when refining (name the criterion you change): the eleven in
  spec §11, in full.
```

- [ ] **Step 2: Full green gates before push**

```bash
cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT" && python -m pytest -q
```
Expected: all pass (backend untouched — a failure here means the change leaked).

```bash
cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT" && bash scripts/start-harness.sh stop && cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT/frontend" && npm run typecheck && npm run build && npm run test:logic
```

```bash
cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT" && bash scripts/start-harness.sh all 2>&1 | grep -E "FAIL|PASS|passed"
```
Expected: **zero `FAIL` lines.** The exit code is meaningless here — read the output.

- [ ] **Step 3: Prove the frozen files never moved**

```bash
cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT" && git diff --stat main -- frontend/src/hooks/useAdmin.ts frontend/src/aurora/components/admin/cohortAnalyticsView.ts frontend/src/aurora/components/admin/riskRowView.ts frontend/src/aurora/components/admin/masteryView.ts frontend/src/aurora/components/admin/performanceTrendView.ts
```
Expected: **empty output.** Any diff violates spec §11 criterion 8.

- [ ] **Step 4: Behavioural verify on the running app**

Sign in as an admin and as a trainer. Confirm: the trainer sees two nav items and no
Accounts/Audit; a trainer hitting `/admin/accounts` directly is redirected; the discipline
segment moves the hero and leaves the marked cards visibly unchanged; a topic chip opens
the drill-down with no new network request (check the network panel).

- [ ] **Step 5: Push and confirm CI**

```bash
cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT" && git fetch origin main && git rev-list --left-right --count HEAD...origin/main
```
Expected: `N	0` — if the right number is non-zero, rebase; main gets force-pushed by
other sessions.

```bash
cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT" && git add docs/design-locks.md && git commit -m "docs(console): lock the EyeBot Console, superseding the 2026-07-13 admin criteria" && git push origin main
```

```bash
cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT" && gh run list --branch main --limit 3
```
Expected: green. `cancelled` is **not** a pass — read the jobs, not the run conclusion.

---

## Self-review against the spec

| Spec section | Covered by |
| --- | --- |
| §4 route & IA | Tasks 5, 6 |
| §4 discipline marking | Tasks 4, 8 |
| §4.1 Overview | Task 8 |
| §4.2 topic drill-down | Task 8 |
| §4.3 Students | Tasks 9, 12 |
| §4.4 Accounts / Audit | Tasks 10, 11 |
| §5 visual system | Tasks 3, 7 |
| §6 component inventory | Tasks 5, 7, 9 |
| §7 data layer frozen | Working rules + Task 16 step 3 |
| §7.1 invariants 1–4, 7 | Task 7 (`figure`, `CsError`, `BarList` null, `Sparkline` runs) |
| §7.1 invariants 5–6 | Inherited unchanged from `useAdmin.ts` |
| §8 mobile | Task 13 |
| §9 testing | Tasks 2, 13, 16 |
| §10 migration | Tasks 6, 14, 15 |
| §11 acceptance | Task 16 |
