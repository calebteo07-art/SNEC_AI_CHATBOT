# EyeBot Mobile-Responsive Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every EyeBot route well-laid-out on a phone (390×844) using one responsive codebase — no device sniffing, no separate routes — without regressing the desktop layout.

**Architecture:** The app is already ~80% responsive (viewport declared, PWA manifest, rail→bottom-bar at ≤860px, station→single-column at ≤880px). So this is a *measure-then-fix* pass, not a rewrite. Task 1 builds a deterministic mobile audit harness that flags horizontal overflow and undersized tap targets per route. Task 2 runs it to produce a breakage catalog that defines the real work. Remaining tasks fix surfaces in priority order, each gated by the audit reporting **zero violations** for its routes, with `aurora_assert`/`station_assert` kept green to prove no desktop regression.

**Tech Stack:** Next.js 16 (App Router) + React 19, plain CSS (`frontend/src/aurora/aurora.css` + sibling CSS files), Playwright harness in `frontend/tests/` (reuses `_mocks.mjs`).

---

## Conventions used by every fix task

**The phone breakpoint is `700px`.** Phone tier = `@media (max-width: 700px)`. Above that = current/laptop layout. Existing component-specific breakpoints (rail 860px, station 880px, others at 820/920px) are *reviewed and aligned* during the relevant page's task — not blindly find-replaced — because some components legitimately need to collapse earlier (e.g. the nav rail).

**Running a server for the harness.** The audit/screenshot harness mocks all `/api/**` at the browser level (`_mocks.mjs`), so no backend is needed — only the Next frontend must be served on `http://127.0.0.1:3000`. For the iterative fix loop use the dev server (hot reload):

```bash
cd frontend && npx next dev -p 3000
```

For a production-fidelity check (run once at the end), use the standalone recipe (memory: `next start` under `output: standalone` is flaky):

```bash
cd frontend && npx next build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
node .next/standalone/server.js   # serves on 3000; stop it before rebuilding (locks .next/standalone)
```

**Pass/fail gate semantics.** A route *fails* the audit only on horizontal overflow (`docOverflow > 1px` or any overflow offender). Sub-44px tap-target findings are **advisory** — reported so you fix the egregious ones (cramped buttons/chips), but they do not block the gate (inline body links are legitimately short). So "audit passes for route X" means **zero overflow**; review and fix obvious small targets opportunistically in the same task.

**The responsive pattern toolkit** (apply these to the specific elements the audit flags):
- Multi-column grid → single column: `@media (max-width:700px){ .X{ grid-template-columns:1fr; } }`
- Side-by-side flex → stacked: add `flex-direction:column` + `align-items:stretch` in the phone block.
- Fixed/wide element overflowing: replace fixed `width`/`min-width` with `width:100%; max-width:100%` or `min-width:0` in the phone block.
- Oversized display type: wrap font sizes in `clamp()` or reduce in the phone block.
- Tap targets <44px: raise `min-height`/`min-width` to `44px` and/or padding in the phone block.
- Wide data table: wrap in a `overflow-x:auto` scroll container OR reflow to card-per-row at ≤700px.
- Horizontal padding: reduce large `clamp()`/fixed page padding so content isn't pinched.

---

## Task 1: Mobile audit harness

Builds the deterministic tool that drives every subsequent task. It loads each route at 390×844, screenshots it, and programmatically detects (a) horizontal overflow and (b) interactive elements smaller than 44px, printing a per-route report and writing a JSON results file. It exits non-zero if any route has violations, so it doubles as the pass/fail gate for fix tasks.

**Files:**
- Create: `frontend/tests/mobile_audit.mjs`

- [ ] **Step 1: Write the audit harness**

Create `frontend/tests/mobile_audit.mjs`:

```javascript
#!/usr/bin/env node
/* Mobile responsiveness audit.
 * Loads every route at a phone viewport (390x844), screenshots it, and detects
 * horizontal overflow + sub-44px tap targets. Writes a JSON catalog and exits
 * non-zero if any route has violations — so it is also the gate for fix tasks.
 *
 * Usage:  node tests/mobile_audit.mjs [prefix] [baseUrl] [route ...]
 *   e.g.  node tests/mobile_audit.mjs m
 *         node tests/mobile_audit.mjs m http://127.0.0.1:3000 /dashboard /chat
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { J, student, admin, seededContext } from "./_mocks.mjs";

const prefix = process.argv[2] ?? "m";
const base = process.argv[3] ?? "http://127.0.0.1:3000";
const only = process.argv.slice(4);
const PHONE = { width: 390, height: 844 };

// Runs in the browser: returns overflow + small-tap-target findings for the page.
function probe() {
  const vw = window.innerWidth;
  const offenders = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none") continue;
    if (r.right > vw + 1 || r.left < -1) {
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && el.className.toString().slice(0, 60)) || "",
        right: Math.round(r.right), width: Math.round(r.width),
      });
    }
  }
  // de-dupe by class, keep widest few
  const seen = new Set();
  const overflow = offenders
    .sort((a, b) => b.right - a.right)
    .filter((o) => (seen.has(o.cls) ? false : seen.add(o.cls)))
    .slice(0, 8);

  const smallTargets = [];
  for (const el of document.querySelectorAll('a,button,[role="button"],input,select,textarea')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none") continue;
    if (r.height < 44 || r.width < 24) {
      smallTargets.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && el.className.toString().slice(0, 50)) || "",
        w: Math.round(r.width), h: Math.round(r.height),
        label: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30),
      });
    }
  }
  const docOverflow = Math.max(0, document.scrollingElement.scrollWidth - vw);
  return { docOverflow, overflow, smallTargets: smallTargets.slice(0, 12) };
}

async function audit(ctx, routes, label, results) {
  const page = await ctx.newPage();
  for (const r of routes) {
    await page.goto(base + r, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(2000);
    const name = `${prefix}${r === "/" ? "-login" : r.replace(/\//g, "-")}.png`;
    await page.screenshot({ path: name, fullPage: false });
    const res = await page.evaluate(probe);
    const bad = res.docOverflow > 1 || res.overflow.length > 0;
    results.push({ route: r, label: label.trim(), ...res, bad });
    const tag = bad ? `OVERFLOW +${res.docOverflow}px (${res.overflow.length} el)` : "ok";
    const tt = res.smallTargets.length ? ` · ${res.smallTargets.length} small targets` : "";
    console.log(`${label} ${r.padEnd(16)} ${tag}${tt}`);
  }
  await page.close();
}

const STUDENT = ["/checkin", "/dashboard", "/cases", "/cases/C001", "/flashcards", "/profile", "/chat"];
const ADMIN = ["/admin", "/admin/students", "/admin/accounts", "/admin/activity"];
const SUPERVISOR = ["/supervisor"];

const browser = await chromium.launch();
const results = [];
if (only.length > 0) {
  const ctx = await seededContext(browser, base, student, PHONE);
  await audit(ctx, only, "custom ", results);
  await ctx.close();
} else {
  const clean = await seededContext(browser, base, null, PHONE);
  await clean.route("**/api/auth/me", (r) => r.fulfill(J({ error: "unauthenticated" }, 401)));
  await audit(clean, ["/"], "public ", results);
  await clean.close();

  const sctx = await seededContext(browser, base, student, PHONE);
  await audit(sctx, STUDENT, "student", results);
  await sctx.close();

  const supctx = await seededContext(browser, base, { ...student, role: "supervisor" }, PHONE);
  await audit(supctx, SUPERVISOR, "superv ", results);
  await supctx.close();

  const actx = await seededContext(browser, base, admin, PHONE);
  await audit(actx, ADMIN, "admin  ", results);
  await actx.close();
}
await browser.close();

writeFileSync(`mobile-audit-${prefix}.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => r.bad);
console.log(`\naudit complete — ${results.length} routes, ${failed.length} with overflow`);
if (failed.length) process.exit(1);
```

- [ ] **Step 2: Start the dev server**

Run (in a separate shell, leave running):
```bash
cd frontend && npx next dev -p 3000
```
Wait for "Ready" / "compiled" output.

- [ ] **Step 3: Run the audit to verify the harness works**

Run:
```bash
cd frontend && node tests/mobile_audit.mjs m
```
Expected: it prints one line per route (e.g. `student /dashboard   OVERFLOW +37px (3 el)` or `ok`), writes `frontend/mobile-audit-m.json`, writes `m-*.png` screenshots, and finishes with a summary line. A non-zero exit here is EXPECTED at this stage (there are real overflows to fix). The harness "working" = it produces per-route findings without crashing.

- [ ] **Step 4: Commit**

```bash
git add frontend/tests/mobile_audit.mjs
git commit -m "test(mobile): deterministic phone-viewport audit harness"
```

---

## Task 2: Phase 0 — run the audit, write the breakage catalog

Turns the harness output into a human-readable catalog committed to the repo. This catalog is the source of truth for every fix task: each later task is "make the audit pass for route X," and this document records what "passing" requires.

**Files:**
- Create: `docs/superpowers/mobile-audit-2026-06-22.md`

- [ ] **Step 1: Run the full audit against the dev server**

Run:
```bash
cd frontend && node tests/mobile_audit.mjs m
```
Collect: the console table, `frontend/mobile-audit-m.json`, and the `m-*.png` screenshots.

- [ ] **Step 2: Write the catalog**

Create `docs/superpowers/mobile-audit-2026-06-22.md` with, for EACH route: its overflow amount, the offending elements (tag + class from the JSON), the count of sub-44px tap targets, and a one-line "fix" note mapping to a toolkit pattern. Group routes by phase (student / heavy-interactive / staff). Example row format:

```markdown
### /dashboard  (student)
- Overflow: +37px. Offenders: `.aurora-stat-grid` (w 430), `.aurora-nba` (w 412).
- Small targets: 2 (streak chip 30px, topic link 18px high).
- Fix: stat grid → 1 col @700px; nba card min-width:0; raise chip/link min-height.
```

Routes that report `ok` with zero small targets are recorded as "PASS — no change needed."

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/mobile-audit-2026-06-22.md
git commit -m "docs(mobile): phase-0 audit catalog of phone-width breakages"
```

---

## Task 3: Breakpoint convention + responsive utilities

Establishes the documented `700px` phone breakpoint and a small shared utility block so fix tasks apply consistent rules instead of ad-hoc values.

**Files:**
- Modify: `frontend/src/aurora/aurora.css` (add a documented responsive header comment + utilities near the existing media-query section)

- [ ] **Step 1: Add the convention comment + utilities**

Add this block to `frontend/src/aurora/aurora.css` (immediately above the existing `/* Mobile bottom bar */` section near line 316):

```css
/* ════════════════════ RESPONSIVE CONVENTION ════════════════════
   Phone tier  = @media (max-width: 700px)   → single column, bottom nav,
                 stacked panels, full-width controls, ≥44px tap targets.
   Above 700px = laptop/desktop (current layout).
   Tablets get the laptop layout gracefully narrowed (no 3rd design).
   Component breakpoints that pre-date this (rail 860, station 880) are
   intentional and reviewed per-component; do not blanket-replace them. */

/* Shared phone utilities — opt in by adding the class on a wrapper. */
@media (max-width: 700px) {
  .m-stack { flex-direction: column !important; align-items: stretch !important; }
  .m-col-1 { grid-template-columns: 1fr !important; }
  .m-full { width: 100% !important; max-width: 100% !important; }
  .m-tap { min-height: 44px; }
  .m-xscroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
}
```

- [ ] **Step 2: Verify desktop is unaffected**

Run:
```bash
cd frontend && node tests/aurora_assert.mjs
```
Expected: all assertions PASS (utilities are phone-only + opt-in, so desktop is untouched).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/aurora.css
git commit -m "feat(mobile): documented 700px phone breakpoint + shared utilities"
```

---

## Task 4: Phase 1 — Login + Check-in (student entry)

**Files:**
- Modify: `frontend/src/aurora/aurora.css` (+ the relevant component CSS file if the login/checkin styles live elsewhere — confirm via the audit offenders' class prefixes)

- [ ] **Step 1: Confirm the failing routes**

Run:
```bash
cd frontend && node tests/mobile_audit.mjs m http://127.0.0.1:3000 / /checkin
```
Expected: note the overflow/tap-target findings for `/` and `/checkin` from the console + `mobile-audit-m.json`. If both already report `ok` with no small targets, mark this task PASS and skip to commit (record "no change needed").

- [ ] **Step 2: Apply fixes for each flagged element**

For every offender the audit listed on `/` and `/checkin`, add a `@media (max-width:700px)` rule using the toolkit pattern that matches its cause (grid→1col, fixed-width→`width:100%`, oversized type→`clamp()`, tap target→`min-height:44px`). Put the rules next to the component's existing styles. (Exact selectors come from the audit offenders — e.g. a login card with a fixed `width: 420px` becomes `width:100%; max-width:420px` in the phone block.)

- [ ] **Step 3: Re-run the audit gate for these routes**

Run:
```bash
cd frontend && node tests/mobile_audit.mjs m http://127.0.0.1:3000 / /checkin
```
Expected: both routes report `ok` and zero small targets (exit 0).

- [ ] **Step 4: Verify desktop not regressed**

Run:
```bash
cd frontend && node tests/aurora_assert.mjs
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora
git commit -m "fix(mobile): login + check-in fit phone width"
```

---

## Task 5: Phase 1 — Dashboard

**Files:**
- Modify: `frontend/src/aurora/aurora.css` (`.aurora-dash*`, `.aurora-stat*`, `.aurora-nba*`, `.aurora-activity*`)

- [ ] **Step 1: Confirm failing route**

Run: `cd frontend && node tests/mobile_audit.mjs m http://127.0.0.1:3000 /dashboard`
Expected: record overflow offenders + small targets for `/dashboard`.

- [ ] **Step 2: Apply fixes**

For each offender, add a `@media (max-width:700px)` rule: stat/metric grids → `grid-template-columns:1fr`, any `min-width:0` needed on flex children that ellipsize, reduce page padding if pinched, raise sub-44px chips/links. Place rules beside the existing `.aurora-dash` styles (~`aurora.css:598`).

- [ ] **Step 3: Re-run gate**

Run: `cd frontend && node tests/mobile_audit.mjs m http://127.0.0.1:3000 /dashboard`
Expected: `ok`, zero small targets.

- [ ] **Step 4: Verify desktop**

Run: `cd frontend && node tests/aurora_assert.mjs`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora
git commit -m "fix(mobile): dashboard grids stack on phone"
```

---

## Task 6: Phase 1 — Tutor Chat

**Files:**
- Modify: `frontend/src/aurora/aurora.css` (`.aurora-chat*`, `.aurora-msg*`, `.aurora-composer*`)

- [ ] **Step 1: Confirm failing route**

Run: `cd frontend && node tests/mobile_audit.mjs m http://127.0.0.1:3000 /chat`
Expected: record offenders (watch the composer footer width + message max-width + header).

- [ ] **Step 2: Apply fixes**

Add `@media (max-width:700px)` rules: composer footer `width:100%` with safe padding (mind `env(safe-area-inset-bottom)` like the rail does), message bubbles `max-width:92%`, header title `min-width:0`. Beside existing `.aurora-chat` styles (~`aurora.css:1199`).

- [ ] **Step 3: Re-run gate**

Run: `cd frontend && node tests/mobile_audit.mjs m http://127.0.0.1:3000 /chat`
Expected: `ok`, zero small targets.

- [ ] **Step 4: Verify desktop**

Run: `cd frontend && node tests/aurora_assert.mjs`
Expected: all PASS (chat assertions included).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora
git commit -m "fix(mobile): tutor chat composer + bubbles fit phone"
```

---

## Task 7: Phase 1 — Flashcards

**Files:**
- Modify: `frontend/src/aurora` flashcards CSS (`flash-*` rules)

- [ ] **Step 1: Confirm failing route**

Run: `cd frontend && node tests/mobile_audit.mjs m http://127.0.0.1:3000 /flashcards`
Expected: record offenders (watch the topic grid, the slit-lamp hero sizing, oversized score numerals, the 2-step setup rail).

- [ ] **Step 2: Apply fixes**

Add `@media (max-width:700px)` rules: topic grid → 1–2 cols that fit 390px, hero `max-width:100%`, clamp the oversized display/score type, ensure the fill-viewport flex doesn't force horizontal scroll. Keep the stepped Session→Topic flow and mechanics unchanged (visual/layout only).

- [ ] **Step 3: Re-run gate**

Run: `cd frontend && node tests/mobile_audit.mjs m http://127.0.0.1:3000 /flashcards`
Expected: `ok`, zero small targets.

- [ ] **Step 4: Verify desktop**

Run: `cd frontend && node tests/aurora_assert.mjs`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora
git commit -m "fix(mobile): flashcards setup + study fit phone"
```

---

## Task 8: Phase 2 — Virtual Patients (Eye Atlas)

**Files:**
- Modify: `frontend/src/aurora/aurora.css` (`.aurora-cases*`, `.aurora-atlas*`)

- [ ] **Step 1: Confirm failing route**

Run: `cd frontend && node tests/mobile_audit.mjs m http://127.0.0.1:3000 /cases`
Expected: record offenders. Manually open `m-cases.png` and confirm: the clickable eye plate scales to width and the topic popover/readout doesn't overflow.

- [ ] **Step 2: Apply fixes**

Add `@media (max-width:700px)` rules: the atlas plate container `max-width:100%` and the readout/list grid → single column. Verify pin hit-areas remain ≥44px after the plate shrinks — if pins scale below that, give the pin buttons a `min-width/min-height:44px` tap area (visual dot can stay small via inner element).

- [ ] **Step 3: Re-run gate**

Run: `cd frontend && node tests/mobile_audit.mjs m http://127.0.0.1:3000 /cases`
Expected: `ok`, zero small targets.

- [ ] **Step 4: Verify desktop**

Run: `cd frontend && node tests/aurora_assert.mjs`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora
git commit -m "fix(mobile): eye atlas scales + keeps tappable pins on phone"
```

---

## Task 9: Phase 2 — OSCE Station

The station already collapses to one column at ≤880px (`aurora.css:1114`). This task verifies that path at 390px and refines it: on a phone the checklist pane is long, so the consult thread can be far below the fold. Add a lightweight in-page anchor toggle (Checklist ↔ Consult) OR confirm natural scroll is acceptable from the screenshot — decide from the audit image, do not add complexity if scroll reads fine.

**Files:**
- Modify: `frontend/src/aurora/aurora.css` (`.aurora-station*` phone block at ~1114)

- [ ] **Step 1: Confirm route + inspect**

Run: `cd frontend && node tests/mobile_audit.mjs m http://127.0.0.1:3000 /cases/C001`
Expected: record overflow findings; open `m-cases-C001.png` and judge whether the stacked panes are usable or need a toggle.

- [ ] **Step 2: Apply fixes**

Migrate the station's phone block to honor the `700px` convention (or keep `880px` if intentional — document which). Fix any overflow offenders (e.g. `.aurora-station-rail` segments, `.aurora-station-domains` 2-col grid → 1col, phasechips wrap). Only add a pane toggle if Step 1 showed the stacked scroll is genuinely hard to use.

- [ ] **Step 3: Re-run gate + station harness**

Run:
```bash
cd frontend && node tests/mobile_audit.mjs m http://127.0.0.1:3000 /cases/C001
cd frontend && node tests/station_assert.mjs
```
Expected: audit `ok`; `station_assert` all PASS (this is the station-specific desktop regression check).

- [ ] **Step 4: Verify aurora desktop**

Run: `cd frontend && node tests/aurora_assert.mjs`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora
git commit -m "fix(mobile): OSCE station panes usable + overflow-free on phone"
```

---

## Task 10: Phase 3 — Staff dashboards (Admin + Supervisor)

The widest risk is data tables and engagement heatmaps. Wrap tables in an `overflow-x:auto` container (toolkit `.m-xscroll`) or reflow to card-per-row; collapse multi-column stat grids.

**Files:**
- Modify: `frontend/src/aurora` admin/supervisor CSS (`.console-*` / `.aurora-*` table + heatmap rules — confirm class prefixes from the audit offenders)

- [ ] **Step 1: Confirm failing routes**

Run:
```bash
cd frontend && node tests/mobile_audit.mjs m http://127.0.0.1:3000 /admin /admin/students /admin/accounts /admin/activity /supervisor
```
Expected: record offenders per route (expect wide tables + heatmaps to overflow).

- [ ] **Step 2: Apply fixes**

For each overflowing table, wrap its scroll container with `overflow-x:auto` at ≤700px (or reflow to cards); collapse stat grids to 1 col; let heatmaps scroll horizontally inside a bounded container. Stat/summary grids → single column.

- [ ] **Step 3: Re-run gate**

Run the same command as Step 1.
Expected: all five routes `ok`, zero small targets.

- [ ] **Step 4: Verify desktop**

Run: `cd frontend && node tests/aurora_assert.mjs`
Expected: all PASS (admin/supervisor assertions included).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora
git commit -m "fix(mobile): admin + supervisor tables/heatmaps scroll on phone"
```

---

## Task 11: Final full-suite verification (production build)

Proves the whole app passes at phone width on a production-fidelity build and that nothing regressed on desktop.

- [ ] **Step 1: Production build + serve**

```bash
cd frontend && npx next build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
node .next/standalone/server.js   # leave running
```
Expected: build succeeds; server logs "Listening on 3000".

- [ ] **Step 2: Full mobile audit must be green**

Run (new shell): `cd frontend && node tests/mobile_audit.mjs final`
Expected: every route `ok`, summary "0 with overflow", exit 0.

- [ ] **Step 3: Desktop regression suites green**

Run:
```bash
cd frontend && node tests/aurora_assert.mjs
cd frontend && node tests/station_assert.mjs
```
Expected: both all PASS.

- [ ] **Step 4: Stop server, commit any final screenshots/notes**

Stop the standalone server first (it locks `.next/standalone`). Then:
```bash
git add docs/superpowers/mobile-audit-2026-06-22.md
git commit -m "docs(mobile): mark all routes phone-clean (final audit green)" --allow-empty
```

---

## Self-review notes

- **Spec coverage:** breakpoint consolidation (Task 3), audit-first (Tasks 1–2), student daily-use (4–7), heavy interactive (8–9), staff dashboards (10), no-regression via aurora/station_assert (every task), final production check (11). All spec sections map to a task.
- **Gate consistency:** every fix task uses the identical gate — `mobile_audit.mjs` reports `ok` for its routes (exit 0) + the desktop suite stays green. The audit's pass condition (`docOverflow<=1` and zero overflow offenders) is defined once in Task 1 and referenced everywhere.
- **No device sniffing anywhere** — all rules are `@media (max-width:700px)`, honoring the approved one-responsive-app approach.
