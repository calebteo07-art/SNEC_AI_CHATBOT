# OSCE Station — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the virtual-patient screen `frontend/src/aurora/screens/CaseSession.tsx` into the approved colourful, animated, light-mode **Guided OSCE Station** UI (mockup `light-station-v3`), consuming the already-shipped `GET /api/cases/{id}/station` and `POST /api/cases/{id}/observe` endpoints.

**Architecture:** One orchestrator screen (`CaseSession.tsx`) owns all state/fetch/SSE/observe logic; two new presentational components (`StationChecklist`, `ExamTray`) render the phase rail + auto-tracked checklist and the examination tray. New `.aurora-station-*` styles in `aurora.css` replace the dark `.aurora-session-*` block (shared helpers preserved). A Playwright behavioural harness (`tests/station_assert.mjs`) is written first and drives the build to "done".

**Tech Stack:** Next 16 (App Router, React 19, TS strict, `"use client"`), CSS-only motion (`motion.css` + `useCountUp` + `Reveal`), Playwright (devDep) with mocked APIs. Backend is already on `main`; this plan is frontend-only.

---

## Context the executor needs (read before starting)

- **Spec:** `docs/superpowers/specs/2026-06-16-virtual-patient-osce-station-design.md` — §6 (exam reveal), §7 (auto-tick), §8 (grading), §11 (frontend).
- **Approved visual:** `light-station-v3` (mockup on disk at `.superpowers/brainstorm/573-1781571859/content/light-station-v3.html`, gitignored). Living gradient-mesh canvas, gradient-ring glass cards, per-phase colour panels (Prep = blue `#4285F4`, Clinical = purple `#9B72CB`, Docs = rose `#D96570`), spinning conic aurora rim on the patient, vivid gradient chat bubbles, gradient-green reveal card with shimmer, full-colour phase-rail pills.
- **Tokens:** `frontend/src/aurora/tokens.css` — `--paper #F6F7F9`, `--canvas #EEF0F8`, `--surface #fff`, `--ink #1F1F1F`, `--ink-2 #5F6368`, `--ink-3 #6E7378`, `--g-blue`, `--g-purple`, `--g-rose`, `--g-green #34A853`, `--on-blue-2`, `--on-purple-2`, `--on-rose`, `--on-green-2`, `--radius*`, `--aurora-anim` (set to `0s` under `html[data-motion="reduce"]`).
- **Motion (CSS-only):** `frontend/src/aurora/motion.css`. `MotionProvider` is NOT mounted — **do not** import GSAP fx wrappers (SplitText/Magnetic crash). Use CSS animations + `Reveal`/`RouteReveal` (`@/fx/Reveal`) + `useCountUp` (`@/hooks/useCountUp`) only. Honor `prefers-reduced-motion` AND `html[data-motion="reduce"]`.
- **Imagery:** `@/aurora/media` exports `PLATE.caseSession` (Nano Banana eye plate) — use for the patient avatar.
- **Render prod = ONE uvicorn worker.** `/observe` is one cheap Gemini call per student turn, resilient (returns `[]` on quota/error). The frontend MUST debounce it and never block on it.

### Live backend payload shapes (verified in `tools/api/routers/cases.py`)

```ts
// GET /api/cases/{id}/station  → StationResponse
{
  case: { case_id, title, difficulty, topic, estimated_minutes,
          patient: { name, age, presenting_complaint } },
  checklist: {
    procedure_name: string,
    phases: [{ phase: number, name: string,
               steps: [{ step_number, action, critical, category, notes }] }],
    total_steps: number, critical_count: number,
    source: "checklist" | "rubric"
  },
  examination_actions: [{ key, label, reveal_text, satisfies_steps: number[] }]
}

// POST /api/cases/{id}/observe  body { messages, already_ticked: number[] }
//   → { newly_satisfied: number[] }

// POST /api/cases/{id}/submit  body { messages, diagnosis, management_plan, performed_steps: number[] }
//   → { result: {...4 domains, total_score (0–40)...}, cards, mock_mode,
//        debrief: string, checklist_comparison: [{step_number,action,critical,performed,clinical_note}],
//        per_phase: [{phase,name,done,total}] }
```

> **Scoring note:** `total_score` is **out of 40** (4 domains × 0–10; see `tools/cases/evaluate_response.py:170`). The legacy screen renders `/10` — that is a bug. Render `/40` in the rebuild.

### Decisions already locked (do NOT re-litigate)
- Interaction model = **Guided OSCE Station**; phases ① Preparation & Identification ② Clinical Assessment ③ Documentation & Follow-up.
- Render only phases that contain steps (backend already omits empty ones — just map `checklist.phases`).
- Live per-turn auto-tick via `/observe` + deterministic exam-action ticks; **manual click-to-toggle retained** as fallback.
- Checklist label = **"OSCE checklist · auto-tracked · N steps"**; auto-detected steps carry a subtle **"✦ auto"** marker.
- Visual = colourful animated **light** (`light-station-v3`); **CSS-only** motion.

### Hooks / invariants to preserve
- `sessionStorage` handoff key **`eyebot_case_handoff`** (instant patient paint).
- SSE chat reader path against `/api/cases/{id}/chat` (keep verbatim).
- Submit flow against `/api/cases/{id}/submit`.
- Exactly **one `<h1>` per route**; every decorative canvas/element `aria-hidden`; no horizontal overflow at 390px.
- The smoke test `tests/aurora_assert.mjs` must stay green (it does NOT visit `/cases/:id`, but shares chrome — don't break global classes).

### Shared CSS that must NOT be deleted
`.aurora-input`, `.aurora-bubble*`, `.aurora-bubble-who`, `.aurora-bubble-body`, `.aurora-caret`, `@keyframes aurora-blink`, `.aurora-typing` (lines ~888–902 of `aurora.css`) are also used by `Tutor.tsx` and `MessageBubble.tsx`. Preserve them verbatim. Only `.aurora-session-*`-prefixed rules (and the session-only `.aurora-composer-input` / `.aurora-send`) are replaced.

---

## File Structure

- **Create:** `frontend/src/aurora/components/ExamTray.tsx` — examination action chips (presentational).
- **Create:** `frontend/src/aurora/components/StationChecklist.tsx` — phase rail + phase-grouped auto-tracked checklist (presentational).
- **Modify (full rebuild):** `frontend/src/aurora/screens/CaseSession.tsx` — orchestrator: `/station` fetch, checklist tick state, SSE chat, exam-action reveal, debounced `/observe`, submit + scored debrief.
- **Modify:** `frontend/src/aurora/aurora.css` — replace `.aurora-session-*` block with `.aurora-station-*` + station keyframes; keep shared helpers.
- **Create:** `frontend/tests/station_assert.mjs` — Playwright behavioural assertion for the station (the executable spec).
- **Modify:** `frontend/tests/visual_sweep.mjs` — add `/station`, `/observe`, `/cases/C001/chat`, `/cases/C001/submit` mocks so the station route renders in the sweep.

---

## Task 1: Behavioural test harness (the executable spec — write it first)

**Files:**
- Create: `frontend/tests/station_assert.mjs`

This harness mocks the station APIs and asserts the new screen's behaviour. It will FAIL against the legacy screen, then pass once the rebuild lands. It needs a dev server on `127.0.0.1:3000` (`npm run dev`).

- [ ] **Step 1: Write the failing test harness**

Create `frontend/tests/station_assert.mjs`:

```js
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://127.0.0.1:3000";
const b = await chromium.launch();
const ok = (m) => console.log("PASS:", m);
const die = (m) => { console.error("FAIL:", m); process.exit(1); };

const user = { full_name: "Test Student", email: "student@snec.com.sg", student_id: "S001", role: "student", student_role: "OA", must_change: false };
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript((u) => {
  if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({ scope: "/" });
  try { indexedDB.deleteDatabase("eyebot"); } catch {}
  localStorage.setItem("eyebot_user_v1", JSON.stringify(u));
  localStorage.setItem("eyebot_checkin_date", new Date().toDateString());
  localStorage.setItem("eyebot_tour_seen", "true");
}, user);
await ctx.addCookies([{ name: "eyebot_token", value: "pw-harness", domain: new URL(base).hostname, path: "/" }]);
const J = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

await ctx.route("**/api/**", (r) => r.fulfill(J({})));
await ctx.route("**/api/auth/me", (r) => r.fulfill(J(user)));
await ctx.route("**/api/cases/C001/station", (r) => r.fulfill(J({
  case: { case_id: "C001", title: "Routine glaucoma follow-up", difficulty: "intermediate", topic: "Glaucoma", estimated_minutes: 12,
          patient: { name: "Mr Rajasekaran", age: 55, presenting_complaint: "Here for my 6-month glaucoma review." } },
  checklist: {
    procedure_name: "Non-Contact Tonometry", source: "checklist", total_steps: 6, critical_count: 2,
    phases: [
      { phase: 1, name: "Preparation & Identification", steps: [
        { step_number: 1, action: "Identify patient — name + NRIC", critical: true, category: "patient_identification", notes: null },
        { step_number: 2, action: "Explain purpose & procedure", critical: false, category: "consent", notes: null } ] },
      { phase: 2, name: "Clinical Assessment", steps: [
        { step_number: 3, action: "Measure IOP — take ~3 readings, average", critical: true, category: "clinical_assessment", notes: "Repeat if >=24" },
        { step_number: 4, action: "Measure distance visual acuity", critical: false, category: "clinical_assessment", notes: null } ] },
      { phase: 3, name: "Documentation & Follow-up", steps: [
        { step_number: 5, action: "Record readings in EMR", critical: false, category: "documentation", notes: null },
        { step_number: 6, action: "Advise on follow-up", critical: false, category: "patient_education", notes: null } ] },
    ],
  },
  examination_actions: [
    { key: "iop", label: "Measure IOP · NCT", reveal_text: "IOP (NCT) · avg of 3 → R 18 mmHg · L 20 mmHg", satisfies_steps: [3] },
    { key: "va", label: "Measure distance VA", reveal_text: "Distance VA → R 6/9 · L 6/12", satisfies_steps: [4] },
  ],
})));
await ctx.route("**/api/cases/C001/observe", (r) => r.fulfill(J({ newly_satisfied: [1] })));
await ctx.route("**/api/cases/C001/chat", (r) => r.fulfill({
  status: 200, contentType: "text/event-stream",
  body: 'data: {"text":"Good morning, "}\n\ndata: {"text":"doctor."}\n\ndata: [DONE]\n\n',
}));
await ctx.route("**/api/cases/C001/submit", (r) => r.fulfill(J({
  result: { history_score: 8, investigations_score: 7, diagnosis_score: 9, management_score: 6,
            history_feedback: "Thorough history.", investigations_feedback: "Good IOP technique.",
            diagnosis_feedback: "Correct.", management_feedback: "Reasonable plan.",
            total_score: 30, overall_feedback: "Strong consult.", critical_hit: 2, critical_total: 2 },
  cards: [], mock_mode: false,
  debrief: "What you did really well: clear identification and clean NCT technique. Where to grow next time: document the follow-up interval in Phase 3.",
  checklist_comparison: [
    { step_number: 1, action: "Identify patient — name + NRIC", critical: true, performed: true, clinical_note: "Confirms right patient, right eye." },
    { step_number: 6, action: "Advise on follow-up", critical: false, performed: false, clinical_note: "Patients lapse without a clear return date." },
  ],
  per_phase: [ { phase: 1, name: "Preparation & Identification", done: 2, total: 2 },
               { phase: 2, name: "Clinical Assessment", done: 1, total: 2 },
               { phase: 3, name: "Documentation & Follow-up", done: 0, total: 2 } ],
})));

const errs = [];
const p = await ctx.newPage();
p.on("pageerror", (e) => errs.push(String(e?.message ?? e).slice(0, 160)));
p.on("console", (m) => { if (m.type() === "error" && !/webpack-hmr|WebSocket/.test(m.text())) errs.push("console: " + m.text().slice(0, 160)); });

await p.goto(base + "/cases/C001", { waitUntil: "domcontentloaded" });
await p.waitForSelector('[data-testid="station"]', { timeout: 15000 });

// 1. exactly one h1
if ((await p.locator("main h1, h1").count()) !== 1) die("station must render exactly one h1");
ok("one h1");

// 2. phase rail shows all three phases
const railCount = await p.locator(".aurora-station-rl").count();
if (railCount !== 3) die(`phase rail should show 3 phases, got ${railCount}`);
ok("phase rail renders three phases");

// 3. auto-tracked checklist label + step count
const label = (await p.locator(".aurora-station-cl-label").first().innerText()).toLowerCase();
if (!label.includes("auto-tracked") || !label.includes("6")) die(`checklist label wrong: "${label}"`);
ok("checklist shows auto-tracked label with step count");

// 4. all 6 steps render
const steps = await p.locator(".aurora-station-step").count();
if (steps !== 6) die(`expected 6 checklist steps, got ${steps}`);
ok("six checklist steps render");

// 5. clicking an exam chip reveals the finding, marks its step, marks chip used
await p.locator('.aurora-station-act:has-text("Measure IOP")').click();
await p.waitForSelector(".aurora-station-reveal", { timeout: 5000 });
if (!(await p.locator('.aurora-station-reveal:has-text("18 mmHg")').count())) die("reveal card missing IOP value");
if (!(await p.locator('.aurora-station-act.is-used:has-text("Measure IOP")').count())) die("exam chip did not become used");
const tickedAfter = await p.locator('.aurora-station-step[data-ticked="true"]').count();
if (tickedAfter < 1) die("performing IOP did not tick its step");
ok("exam action reveals finding + ticks step + marks chip used");

// 6. sending a message streams a patient reply
await p.locator(".aurora-station-composer-input").fill("Good morning, can I confirm your name and NRIC?");
await p.locator(".aurora-station-composer-send").click();
await p.waitForFunction(() => document.querySelector(".aurora-station-thread")?.textContent?.includes("Good morning, doctor."), null, { timeout: 8000 });
ok("patient consult streams a reply");

// 7. submit → scored debrief with /40 + per-phase summary
await p.locator('.aurora-station-submit-toggle').click();
await p.locator('textarea[data-field="diagnosis"]').fill("Stable primary open-angle glaucoma.");
await p.locator('textarea[data-field="management"]').fill("Continue drops; review in 6 months.");
await p.locator('.aurora-station-submit-go').click();
await p.waitForSelector(".aurora-station-result", { timeout: 10000 });
if (!(await p.locator('.aurora-station-result:has-text("/40")').count())) die("result must show score out of 40");
if ((await p.locator(".aurora-station-phasechip").count()) !== 3) die("result must show a per-phase summary (3 chips)");
ok("submit shows scored debrief out of 40 with per-phase summary");

// 8. mobile: no horizontal overflow at 390px
await p.setViewportSize({ width: 390, height: 844 });
await p.waitForTimeout(400);
const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
if (overflow > 2) die(`horizontal overflow at 390px = ${overflow}px`);
ok("no horizontal overflow at 390px");

if (errs.length) die("page/console errors: " + JSON.stringify(errs.slice(0, 3)));
ok("station screen clean (no page/console errors)");
console.log("ALL STATION ASSERTIONS PASSED");
await b.close();
```

- [ ] **Step 2: Run it against the legacy screen to confirm it fails**

Start the dev server in one shell, then run the harness:

```bash
cd frontend && npm run dev   # leave running (separate shell / background)
node frontend/tests/station_assert.mjs
```

Expected: **FAIL** at `waitForSelector('[data-testid="station"]')` (legacy screen has no such hook).

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/station_assert.mjs
git commit -m "test(station): add behavioural Playwright harness for the OSCE station (fails against legacy screen)"
```

---

## Task 2: Station styles — replace `.aurora-session-*` with `.aurora-station-*`

**Files:**
- Modify: `frontend/src/aurora/aurora.css` (the `.aurora-session-*` block, ~lines 856–926)

- [ ] **Step 1: Remove the session-only rules, keep the shared helpers**

In `aurora.css`, delete every rule whose selector starts with `.aurora-session` **and** the two session-only rules `.aurora-composer-input` and `.aurora-send` (lines ~921–924). **Keep verbatim** these shared rules (used by `Tutor.tsx` / `MessageBubble.tsx`): `.aurora-bubble`, `.aurora-bubble.is-user`, `.aurora-bubble.is-patient`, `.aurora-bubble-who`, `.aurora-bubble-body`, `.is-patient .aurora-bubble-body`, `.is-user .aurora-bubble-body`, `.aurora-caret`, `@keyframes aurora-blink`, `html[data-motion="reduce"] .aurora-caret`, `.aurora-typing`, `.aurora-input`, `.aurora-input:focus-visible`.

Verify nothing else references the old selectors:

```bash
grep -rn "aurora-session\|aurora-composer-input\|\.aurora-send" frontend/src
```
Expected: no matches in `.tsx` files (CaseSession is rebuilt in Task 5; if it still references them, that's fine until then — just ensure no OTHER screen does).

- [ ] **Step 2: Append the station style block**

Append this block where the old `.aurora-session-*` block was:

```css
/* ── Guided OSCE Station ─────────────────────────────────────────────────── */
@keyframes station-mesh { 0% { background-position: 0% 0%, 100% 0%, 50% 100%, 0% 50%; } 50% { background-position: 30% 40%, 70% 20%, 40% 70%, 60% 30%; } 100% { background-position: 0% 0%, 100% 0%, 50% 100%, 0% 50%; } }
@keyframes station-spin { to { transform: rotate(360deg); } }
@keyframes station-rail { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
@keyframes station-tickpop { 0% { transform: scale(.4); opacity: 0; } 60% { transform: scale(1.2); } 100% { transform: scale(1); opacity: 1; } }
@keyframes station-node { 0%, 100% { box-shadow: 0 0 0 0 rgba(155,114,203,.5); } 50% { box-shadow: 0 0 0 7px rgba(155,114,203,0); } }
@keyframes station-revealin { 0% { transform: translateY(10px) scale(.97); opacity: 0; } 100% { transform: translateY(0) scale(1); opacity: 1; } }
@keyframes station-shimmer { 0% { transform: translateX(-120%); } 100% { transform: translateX(240%); } }
@keyframes station-bargrow { from { width: 0; } }

.aurora-station { position: relative; max-width: 1180px; margin: 0 auto; padding: clamp(14px, 2.2vw, 24px); display: flex; flex-direction: column; gap: 16px; min-height: 100%; }
.aurora-station-mesh { position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background:
    radial-gradient(40% 50% at 12% 18%, rgba(66,133,244,.34), transparent 60%),
    radial-gradient(45% 55% at 88% 12%, rgba(217,101,112,.30), transparent 60%),
    radial-gradient(50% 60% at 70% 95%, rgba(155,114,203,.34), transparent 62%),
    radial-gradient(45% 55% at 8% 92%, rgba(52,168,83,.22), transparent 60%),
    linear-gradient(120deg, #EAF0FF, #F3ECFB 50%, #FDEEF1);
  background-size: 140% 140%, 140% 140%, 140% 140%, 140% 140%, 100% 100%;
  animation: station-mesh 18s ease-in-out infinite; }

.aurora-station-head { display: flex; align-items: flex-start; gap: 14px; flex-wrap: wrap; }
.aurora-station-back { border: 1px solid var(--hairline); background: rgba(255,255,255,.7); backdrop-filter: blur(6px); border-radius: 999px; padding: 6px 14px; font-size: 13px; font-weight: 600; color: var(--ink-2); cursor: pointer; }
.aurora-station-back:hover { color: var(--ink); }
.aurora-station-title { font-size: clamp(18px, 2.4vw, 24px); font-weight: 700; letter-spacing: -0.02em; margin: 6px 0 0; color: var(--ink); }
.aurora-station-title em { font-style: normal; background: linear-gradient(100deg, #2C6BE0, #9B72CB, #D96570, #9B72CB, #2C6BE0); background-size: 200% auto; -webkit-background-clip: text; background-clip: text; color: transparent; animation: station-rail 5s linear infinite; }
.aurora-station-hud { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--ink-2); flex-wrap: wrap; margin-top: 4px; }
.aurora-station-hud-sep { color: var(--ink-3); }
.aurora-station-tier { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-3); }

.aurora-station-grid { display: grid; grid-template-columns: 360px 1fr; gap: 16px; align-items: start; }

.aurora-station-card { position: relative; border-radius: 16px; padding: 16px; background: rgba(255,255,255,.62); backdrop-filter: blur(10px) saturate(1.3); box-shadow: 0 18px 50px -28px rgba(40,30,80,.45); }
.aurora-station-card::before { content: ""; position: absolute; inset: 0; border-radius: 16px; padding: 1.4px;
  background: linear-gradient(135deg, rgba(66,133,244,.7), rgba(155,114,203,.6), rgba(217,101,112,.7));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; }
.aurora-station-aside { position: sticky; top: 8px; }

.aurora-station-pt { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
.aurora-station-ring { position: relative; width: 56px; height: 56px; flex: none; border-radius: 50%; padding: 2.5px; background: conic-gradient(#4285F4, #9B72CB, #D96570, #34A853, #4285F4); animation: station-spin 7s linear infinite; }
.aurora-station-av { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; background: linear-gradient(135deg, #4285F4, #9B72CB); display: block; }
.aurora-station-nm { font-size: 16px; font-weight: 700; color: var(--ink); }
.aurora-station-mt { font-size: 11px; color: var(--ink-2); margin-top: 2px; }
.aurora-station-cc { background: linear-gradient(135deg, rgba(155,114,203,.16), rgba(217,101,112,.12)); border: 1px solid rgba(155,114,203,.28); border-radius: 11px; padding: 9px 12px; font-size: 12px; color: var(--on-purple); margin-bottom: 14px; line-height: 1.5; font-style: italic; }
.aurora-station-cl-label { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--on-purple-2); font-weight: 700; margin: 0 0 10px; }

.aurora-station-rail { display: flex; gap: 8px; margin-bottom: 14px; }
.aurora-station-rl { flex: 1; text-align: center; font-size: 10px; padding: 9px 4px; border-radius: 12px; color: #fff; }
.aurora-station-rl b { display: block; font-size: 11px; margin-bottom: 2px; }
.aurora-station-rl.is-done { background: linear-gradient(135deg, #34A853, #2A8C43); }
.aurora-station-rl.is-now { background: linear-gradient(100deg, #4285F4, #9B72CB, #D96570, #9B72CB, #4285F4); background-size: 200% auto; animation: station-rail 4s linear infinite; box-shadow: 0 6px 18px rgba(123,86,180,.4); }
.aurora-station-rl.is-todo { background: rgba(255,255,255,.55); color: #6E6385; border: 1px solid rgba(120,90,170,.25); }
.aurora-station-rl.is-todo b { color: var(--on-purple); }

.aurora-station-phase { border-radius: 13px; padding: 10px 12px; margin-bottom: 11px; }
.aurora-station-phase.p1 { background: linear-gradient(135deg, rgba(66,133,244,.16), rgba(66,133,244,.05)); border: 1px solid rgba(66,133,244,.28); }
.aurora-station-phase.p2 { background: linear-gradient(135deg, rgba(155,114,203,.18), rgba(155,114,203,.05)); border: 1px solid rgba(155,114,203,.3); }
.aurora-station-phase.p3 { background: linear-gradient(135deg, rgba(217,101,112,.15), rgba(217,101,112,.05)); border: 1px solid rgba(217,101,112,.28); }
.aurora-station-phase-h { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
.aurora-station-node { width: 13px; height: 13px; border-radius: 50%; flex: none; background: #fff; }
.aurora-station-phase.p1 .aurora-station-node { border: 2.5px solid #4285F4; }
.aurora-station-phase.p2 .aurora-station-node { border: 2.5px solid #9B72CB; }
.aurora-station-phase.p3 .aurora-station-node { border: 2.5px solid #D96570; }
.aurora-station-phase.is-now .aurora-station-node { animation: station-node 1.8s ease-in-out infinite; }
.aurora-station-phase.is-done .aurora-station-node { background: #34A853; border-color: #34A853; }
.aurora-station-phase-t { font-size: 12px; font-weight: 700; }
.aurora-station-phase.p1 .aurora-station-phase-t { color: var(--on-blue-2); }
.aurora-station-phase.p2 .aurora-station-phase-t { color: var(--on-purple-2); }
.aurora-station-phase.p3 .aurora-station-phase-t { color: var(--on-rose); }
.aurora-station-pbar { flex: 1; height: 5px; border-radius: 5px; background: rgba(255,255,255,.6); overflow: hidden; margin-left: auto; max-width: 70px; }
.aurora-station-pbar i { display: block; height: 100%; border-radius: 5px; animation: station-bargrow 1s ease both; }
.aurora-station-phase.p1 .aurora-station-pbar i { background: #4285F4; }
.aurora-station-phase.p2 .aurora-station-pbar i { background: #9B72CB; }
.aurora-station-phase.p3 .aurora-station-pbar i { background: #D96570; }

.aurora-station-step { display: flex; gap: 7px; align-items: flex-start; text-align: left; width: 100%; background: none; border: none; cursor: pointer; font-size: 12px; padding: 3px 0; color: #3a3450; line-height: 1.4; }
.aurora-station-step .bx { width: 16px; height: 16px; border-radius: 5px; border: 1.5px solid rgba(90,75,122,.4); flex: none; margin-top: 1px; font-size: 11px; text-align: center; line-height: 14px; color: transparent; background: rgba(255,255,255,.55); }
.aurora-station-step[data-ticked="true"] { color: var(--on-green-2); font-weight: 500; }
.aurora-station-step[data-ticked="true"] .bx { background: linear-gradient(135deg, #34A853, #2A8C43); border-color: #2A8C43; color: #fff; animation: station-tickpop .45s ease both; }
.aurora-station-step .crit { font-size: 8px; color: #fff; background: var(--on-rose-2); border-radius: 4px; padding: 1px 5px; margin-left: auto; flex: none; align-self: center; }
.aurora-station-step .au { font-size: 8px; color: var(--on-green-2); margin-left: 6px; flex: none; align-self: center; white-space: nowrap; }

.aurora-station-main { display: flex; flex-direction: column; min-width: 0; }
.aurora-station-thread { display: flex; flex-direction: column; gap: 8px; min-height: 300px; }
.aurora-station-hint { text-align: center; padding: 36px 0; color: var(--ink-2); font-size: 13px; }
.aurora-station-bubble { border-radius: 13px; padding: 9px 13px; font-size: 13px; max-width: 86%; line-height: 1.5; animation: station-revealin .4s ease both; }
.aurora-station-bubble .who { font-size: 8.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); display: block; margin-bottom: 2px; }
.aurora-station-bubble.me { background: linear-gradient(135deg, #4285F4, #6A8EF0); color: #fff; align-self: flex-end; }
.aurora-station-bubble.me .who { color: rgba(255,255,255,.82); }
.aurora-station-bubble.pt { background: rgba(255,255,255,.78); border: 1px solid rgba(120,90,170,.18); color: var(--ink); align-self: flex-start; }
.aurora-station-reveal { position: relative; overflow: hidden; border-radius: 13px; padding: 11px 14px; color: #fff; align-self: stretch;
  background: linear-gradient(120deg, #34A853, #2C8E76, #4285F4); background-size: 180% auto; animation: station-revealin .5s ease both; box-shadow: 0 8px 22px rgba(45,140,90,.32); }
.aurora-station-reveal::after { content: ""; position: absolute; top: 0; left: 0; width: 40%; height: 100%; background: linear-gradient(100deg, transparent, rgba(255,255,255,.5), transparent); animation: station-shimmer 2.8s ease-in-out infinite; }
.aurora-station-reveal .rl2 { font-size: 9px; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,.85); }
.aurora-station-reveal .v { font-size: 16px; font-weight: 700; margin-top: 2px; }

.aurora-station-tray { border-top: 1px dashed rgba(120,90,170,.3); margin-top: 12px; padding-top: 10px; }
.aurora-station-tray-label { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--on-purple-2); font-weight: 700; margin: 0 0 7px; }
.aurora-station-act { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; padding: 6px 13px; border-radius: 18px; margin: 0 6px 6px 0; color: #fff; font-weight: 600; border: none; cursor: pointer; background: linear-gradient(135deg, #4285F4, #9B72CB); box-shadow: 0 4px 12px rgba(123,86,180,.3); }
.aurora-station-act:nth-child(even) { background: linear-gradient(135deg, #9B72CB, #B98AE0); }
.aurora-station-act.is-used { background: rgba(52,168,83,.16); color: var(--on-green-2); border: 1px solid rgba(52,168,83,.45); box-shadow: none; cursor: default; }

.aurora-station-composer { display: flex; gap: 10px; align-items: flex-end; margin-top: 12px; }
.aurora-station-composer-input { flex: 1; border: 1px solid rgba(120,90,170,.25); border-radius: 14px; padding: 11px 15px; color: var(--ink); font-size: 14px; font-family: var(--font-sans); background: rgba(255,255,255,.7); resize: none; outline: none; line-height: 1.5; }
.aurora-station-composer-input:focus-visible { border-color: var(--g-blue); box-shadow: 0 0 0 3px rgba(66,133,244,.16); }
.aurora-station-composer-send { width: 42px; height: 42px; flex: none; border: none; border-radius: 14px; display: grid; place-items: center; cursor: pointer; color: #fff; background: linear-gradient(135deg, #4285F4, #9B72CB, #D96570); }
.aurora-station-composer-send:disabled { opacity: .45; cursor: not-allowed; }

.aurora-station-form { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; padding: 14px; border-radius: 13px; background: rgba(255,255,255,.6); border: 1px solid rgba(120,90,170,.2); }
.aurora-station-warn { font-size: 12px; color: var(--on-rose); }
.aurora-station-submit-toggle { margin-top: 12px; width: 100%; padding: 11px; border: none; border-radius: var(--radius); background: linear-gradient(135deg, #4285F4, #9B72CB, #D96570); color: #fff; font-size: 12px; font-weight: 700; letter-spacing: .04em; cursor: pointer; }
.aurora-station-submit-go { margin-top: 4px; padding: 11px; border: none; border-radius: var(--radius); background: linear-gradient(135deg, #4285F4, #9B72CB, #D96570); color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; }
.aurora-station-submit-go:disabled { opacity: .5; cursor: not-allowed; }

.aurora-station-result { margin-top: 14px; }
.aurora-station-result-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 14px; }
.aurora-station-result-head h2 { font-size: 1.3rem; font-weight: 700; color: var(--ink); margin: 0; }
.aurora-station-total { font-size: 34px; font-weight: 700; letter-spacing: -0.03em; background: linear-gradient(100deg, #2C6BE0, #9B72CB, #D96570); -webkit-background-clip: text; background-clip: text; color: transparent; }
.aurora-station-total small { font-size: 15px; font-weight: 500; color: var(--ink-3); -webkit-text-fill-color: var(--ink-3); }
.aurora-station-phasechips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.aurora-station-phasechip { flex: 1; min-width: 90px; border-radius: 11px; padding: 8px 10px; font-size: 11px; color: #fff; }
.aurora-station-phasechip.p1 { background: linear-gradient(135deg, #4285F4, #5B8DEF); }
.aurora-station-phasechip.p2 { background: linear-gradient(135deg, #9B72CB, #B98AE0); }
.aurora-station-phasechip.p3 { background: linear-gradient(135deg, #D96570, #E78A92); }
.aurora-station-phasechip b { display: block; font-size: 15px; font-weight: 700; }
.aurora-station-domain { margin-bottom: 12px; }
.aurora-station-domain-top { display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; color: var(--ink); margin-bottom: 5px; }
.aurora-station-domain-val { font-family: var(--font-mono); color: var(--ink-2); }
.aurora-station-domain-fb { font-size: 12px; color: var(--ink-2); line-height: 1.55; margin: 6px 0 0; }
.aurora-station-debrief { margin-top: 14px; padding: 13px 15px; border-radius: var(--radius); background: linear-gradient(135deg, rgba(52,168,83,.12), rgba(66,133,244,.08)); border-left: 3px solid var(--g-green); }
.aurora-station-debrief p { font-size: 13px; color: var(--ink); line-height: 1.6; margin: 5px 0 0; white-space: pre-wrap; }
.aurora-station-review { margin-top: 14px; }
.aurora-station-review-row { display: flex; gap: 8px; align-items: flex-start; font-size: 12px; margin-bottom: 7px; color: var(--ink); }
.aurora-station-review-row[data-done="false"] { color: var(--ink-2); }
.aurora-station-review-row .mk { flex: none; }
.aurora-station-review-row[data-done="true"] .mk { color: var(--on-green-2); }
.aurora-station-review-row[data-done="false"] .mk { color: var(--on-rose); }
.aurora-station-review-note { display: block; font-size: 11px; color: var(--ink-3); margin-top: 2px; }
.aurora-station-result-actions { display: flex; gap: 10px; margin-top: 18px; }

.aurora-station-error { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; min-height: 50vh; color: var(--ink-2); }
.aurora-station-error button { color: var(--on-blue-2); font-weight: 600; background: none; border: none; cursor: pointer; }

@media (max-width: 880px) {
  .aurora-station-grid { grid-template-columns: 1fr; }
  .aurora-station-aside { position: static; }
}
@media (prefers-reduced-motion: reduce) {
  .aurora-station-mesh, .aurora-station-ring, .aurora-station-title em, .aurora-station-rl.is-now,
  .aurora-station-phase .aurora-station-node, .aurora-station-bubble, .aurora-station-reveal,
  .aurora-station-reveal::after, .aurora-station-step[data-ticked="true"] .bx, .aurora-station-pbar i { animation: none !important; }
}
html[data-motion="reduce"] .aurora-station-mesh,
html[data-motion="reduce"] .aurora-station-ring,
html[data-motion="reduce"] .aurora-station-title em,
html[data-motion="reduce"] .aurora-station-rl.is-now,
html[data-motion="reduce"] .aurora-station-phase .aurora-station-node,
html[data-motion="reduce"] .aurora-station-bubble,
html[data-motion="reduce"] .aurora-station-reveal,
html[data-motion="reduce"] .aurora-station-reveal::after,
html[data-motion="reduce"] .aurora-station-step[data-ticked="true"] .bx,
html[data-motion="reduce"] .aurora-station-pbar i { animation: none !important; }
```

- [ ] **Step 2b: Verify shared helpers survived**

```bash
grep -n "\.aurora-input\b\|\.aurora-bubble\b\|\.aurora-caret\b\|aurora-blink\|\.aurora-typing\b" frontend/src/aurora/aurora.css
```
Expected: each shared selector still present.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/aurora.css
git commit -m "style(station): add light .aurora-station-* styles, retire dark .aurora-session-* block"
```

---

## Task 3: `ExamTray` component

**Files:**
- Create: `frontend/src/aurora/components/ExamTray.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";
/* ExamTray — the examination "do something" tray for the OSCE station. Each
   action, when clicked, performs the examination (parent reveals the finding,
   ticks the satisfied steps, marks the chip used). Pure presentational. */

export interface ExamAction {
  key: string;
  label: string;
  reveal_text: string;
  satisfies_steps: number[];
}

export function ExamTray({
  actions,
  performed,
  onPerform,
}: {
  actions: ExamAction[];
  performed: Set<string>;
  onPerform: (action: ExamAction) => void;
}) {
  if (actions.length === 0) return null;
  return (
    <div className="aurora-station-tray">
      <p className="aurora-station-tray-label">Examination tray · click to perform &amp; reveal</p>
      {actions.map((a) => {
        const used = performed.has(a.key);
        return (
          <button
            key={a.key}
            type="button"
            className={`aurora-station-act${used ? " is-used" : ""}`}
            disabled={used}
            onClick={() => onPerform(a)}
            aria-label={used ? `${a.label} — performed` : `Perform ${a.label}`}
          >
            {used && <span aria-hidden>✓</span>}
            {a.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npm run typecheck
```
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/ExamTray.tsx
git commit -m "feat(station): add ExamTray component (clickable examination actions)"
```

---

## Task 4: `StationChecklist` component

**Files:**
- Create: `frontend/src/aurora/components/StationChecklist.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";
/* StationChecklist — the auto-tracked OSCE checklist for the Guided OSCE Station.
   Renders a 3-segment phase rail (done / now / todo) and one tinted panel per
   phase with its steps. Steps tick live (auto) or by manual click (fallback);
   auto-detected steps carry a "✦ auto" marker. Presentational — all tick state
   is owned by the parent. */

export interface StationStep {
  step_number: number;
  action: string;
  critical: boolean;
  category: string;
  notes: string | null;
}
export interface StationPhase {
  phase: number;
  name: string;
  steps: StationStep[];
}

const PHASE_CLASS: Record<number, string> = { 1: "p1", 2: "p2", 3: "p3" };

export function StationChecklist({
  procedureName,
  phases,
  totalSteps,
  ticked,
  autoSteps,
  onToggle,
}: {
  procedureName: string;
  phases: StationPhase[];
  totalSteps: number;
  ticked: Set<number>;
  autoSteps: Set<number>;
  onToggle: (stepNumber: number) => void;
}) {
  const doneCounts = phases.map((p) => p.steps.filter((s) => ticked.has(s.step_number)).length);
  // "current" phase = first phase that is not fully complete; -1 once all done.
  const currentIdx = doneCounts.findIndex((done, i) => done < phases[i].steps.length);

  return (
    <div>
      <div className="aurora-station-rail" role="list" aria-label="OSCE phases">
        {phases.map((p, i) => {
          const done = doneCounts[i] === p.steps.length;
          const now = i === currentIdx;
          const cls = done ? "is-done" : now ? "is-now" : "is-todo";
          return (
            <div key={p.phase} className={`aurora-station-rl ${cls}`} role="listitem">
              <b>{`①②③`[i] ?? p.phase} {shortPhase(p.name)}</b>
              {doneCounts[i]}/{p.steps.length}
            </div>
          );
        })}
      </div>

      <p className="aurora-station-cl-label">
        OSCE checklist · auto-tracked · {totalSteps} steps
        <span style={{ display: "block", fontWeight: 400, marginTop: 2, textTransform: "none", letterSpacing: 0, color: "var(--ink-3)" }}>
          {procedureName}
        </span>
      </p>

      {phases.map((p, i) => {
        const done = doneCounts[i] === p.steps.length;
        const now = i === currentIdx;
        const pct = p.steps.length ? Math.round((doneCounts[i] / p.steps.length) * 100) : 0;
        return (
          <div key={p.phase} className={`aurora-station-phase ${PHASE_CLASS[p.phase] ?? "p2"}${done ? " is-done" : ""}${now ? " is-now" : ""}`}>
            <div className="aurora-station-phase-h">
              <span className="aurora-station-node" aria-hidden />
              <span className="aurora-station-phase-t">{p.name}</span>
              <span className="aurora-station-pbar" aria-hidden><i style={{ width: `${pct}%` }} /></span>
            </div>
            {p.steps.map((s) => {
              const isTicked = ticked.has(s.step_number);
              const isAuto = isTicked && autoSteps.has(s.step_number);
              return (
                <button
                  key={s.step_number}
                  type="button"
                  className="aurora-station-step"
                  data-ticked={isTicked}
                  onClick={() => onToggle(s.step_number)}
                  aria-pressed={isTicked}
                >
                  <span className="bx" aria-hidden>{isTicked ? "✓" : ""}</span>
                  <span>{s.action}</span>
                  {s.critical && <span className="crit">CRIT</span>}
                  {isAuto && <span className="au" title="Detected automatically from your consult">✦ auto</span>}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* Short rail caption: first 1–2 meaningful words of the phase name. */
function shortPhase(name: string): string {
  const map: Record<string, string> = {
    "Preparation & Identification": "Prep & ID",
    "Clinical Assessment": "Assessment",
    "Documentation & Follow-up": "Documentation",
  };
  return map[name] ?? name;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npm run typecheck
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/StationChecklist.tsx
git commit -m "feat(station): add StationChecklist (phase rail + auto-tracked phased checklist)"
```

---

## Task 5: Rebuild `CaseSession.tsx` (orchestrator)

**Files:**
- Modify (full replace): `frontend/src/aurora/screens/CaseSession.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
"use client";
/* AURORA Guided OSCE Station — the virtual-patient simulation rebuilt as a
   colourful, animated, light-mode OSCE station. A living gradient-mesh canvas
   frames two gradient-ring glass cards: (left) the patient + the auto-tracked,
   phase-grouped OSCE checklist; (right) the patient consult thread, examination
   tray, and scored debrief. SSE streaming chat + submit/scoring are preserved
   from the legacy screen. The checklist now comes from /station, ticks live via
   /observe + deterministic exam-action ticks (manual toggle retained), and
   grading shows a per-phase summary + encouraging debrief. Motion is CSS-only. */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { PLATE } from "@/aurora/media";
import { ProgressBar } from "@/aurora/components/ProgressBar";
import { useCountUp } from "@/hooks/useCountUp";
import { StationChecklist, type StationPhase, type StationStep } from "@/aurora/components/StationChecklist";
import { ExamTray, type ExamAction } from "@/aurora/components/ExamTray";

interface CaseInfo {
  case_id: string; title: string; difficulty: string; topic: string; estimated_minutes: number;
  patient: { name: string; age: number; presenting_complaint: string };
}
interface StationData {
  case: CaseInfo;
  checklist: { procedure_name: string; phases: StationPhase[]; total_steps: number; critical_count: number; source: string };
  examination_actions: ExamAction[];
}
interface ChatMessage { role: "user" | "assistant"; content: string }
interface DomainResult {
  history_score: number; investigations_score: number; diagnosis_score: number; management_score: number;
  history_feedback: string; investigations_feedback: string; diagnosis_feedback: string; management_feedback: string;
  total_score: number; overall_feedback: string; critical_hit: number; critical_total: number;
}
interface ChecklistStepResult { step_number: number; action: string; critical: boolean; performed: boolean; clinical_note: string | null }
interface PhaseSummary { phase: number; name: string; done: number; total: number }

const DOMAINS: { label: string; scoreKey: keyof DomainResult; feedbackKey: keyof DomainResult }[] = [
  { label: "History", scoreKey: "history_score", feedbackKey: "history_feedback" },
  { label: "Investigations", scoreKey: "investigations_score", feedbackKey: "investigations_feedback" },
  { label: "Diagnosis", scoreKey: "diagnosis_score", feedbackKey: "diagnosis_feedback" },
  { label: "Management", scoreKey: "management_score", feedbackKey: "management_feedback" },
];

const EXAM_PREFIX = "[Examination performed: ";
const PHASE_CLASS: Record<number, string> = { 1: "p1", 2: "p2", 3: "p3" };

export function CaseSession() {
  const caseId = useParams().caseId as string;
  const router = useRouter();

  // Instant paint from the patient-selection handoff, confirmed by /station.
  const [caseInfo, setCaseInfo] = useState<CaseInfo | null>(() => {
    try {
      const handoff = sessionStorage.getItem("eyebot_case_handoff");
      if (!handoff) return null;
      const parsed = JSON.parse(handoff) as CaseInfo;
      return parsed.case_id === caseId ? parsed : null;
    } catch { return null; }
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [station, setStation] = useState<StationData | null>(null);

  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [autoSteps, setAutoSteps] = useState<Set<number>>(new Set());
  const [performedActions, setPerformedActions] = useState<Set<string>>(new Set());

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const [showSubmit, setShowSubmit] = useState(false);
  const [diagnosis, setDiagnosis] = useState("");
  const [managementPlan, setManagementPlan] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DomainResult | null>(null);
  const [debrief, setDebrief] = useState<string | null>(null);
  const [checklistComparison, setChecklistComparison] = useState<ChecklistStepResult[]>([]);
  const [perPhase, setPerPhase] = useState<PhaseSummary[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const tickedRef = useRef<Set<number>>(new Set());
  const observeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observeAbort = useRef<AbortController | null>(null);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { tickedRef.current = ticked; }, [ticked]);

  // Fetch the full station payload (case + phased checklist + exam actions).
  useEffect(() => {
    if (!caseId) return;
    fetch(`/api/cases/${caseId}/station`, { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(); return r.json() as Promise<StationData>; })
      .then((d) => { setStation(d); setCaseInfo(d.case); })
      .catch(() => setLoadError(`Patient "${caseId}" not found.`));
  }, [caseId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);

  // Cleanup pending observe work on unmount.
  useEffect(() => () => { if (observeTimer.current) clearTimeout(observeTimer.current); observeAbort.current?.abort(); }, []);

  const addAuto = useCallback((stepNumbers: number[]) => {
    if (!stepNumbers.length) return;
    setTicked((prev) => { const n = new Set(prev); stepNumbers.forEach((s) => n.add(s)); return n; });
    setAutoSteps((prev) => { const n = new Set(prev); stepNumbers.forEach((s) => n.add(s)); return n; });
  }, []);

  // Debounced live examiner. Resilient: any failure silently keeps manual ticking.
  const scheduleObserve = useCallback(() => {
    if (!caseId) return;
    if (observeTimer.current) clearTimeout(observeTimer.current);
    observeTimer.current = setTimeout(async () => {
      observeAbort.current?.abort();
      const ctrl = new AbortController();
      observeAbort.current = ctrl;
      try {
        const res = await fetch(`/api/cases/${caseId}/observe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          signal: ctrl.signal,
          body: JSON.stringify({ messages: messagesRef.current, already_ticked: Array.from(tickedRef.current) }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { newly_satisfied?: number[] };
        addAuto(data.newly_satisfied ?? []);
      } catch { /* resilient: ignore quota / abort / network */ }
    }, 650);
  }, [caseId, addAuto]);

  const toggleStep = (n: number) => setTicked((prev) => {
    const next = new Set(prev);
    if (next.has(n)) {
      next.delete(n);
      setAutoSteps((a) => { const b = new Set(a); b.delete(n); return b; }); // manual untick clears the auto marker too
    } else {
      next.add(n);
    }
    return next;
  });

  const performAction = useCallback((a: ExamAction) => {
    if (performedActions.has(a.key)) return;
    setPerformedActions((prev) => new Set(prev).add(a.key));
    setMessages((prev) => [...prev, { role: "user", content: `${EXAM_PREFIX}${a.label} → ${a.reveal_text}]` }]);
    addAuto(a.satisfies_steps);
    scheduleObserve();
  }, [performedActions, addAuto, scheduleObserve]);

  const sendMessage = async () => {
    if (!input.trim() || sending || isStreaming || !caseId) return;
    const content = input.trim();
    const updated = [...messages, { role: "user", content } as ChatMessage];
    setMessages(updated);
    setInput("");
    setSending(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: updated }),
      });
      if (!res.ok || !res.body) throw new Error("Stream unavailable");
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      setSending(false);
      setIsStreaming(true);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data) as { text: string };
            if (parsed.text) {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last.role === "assistant")
                  return [...prev.slice(0, -1), { role: "assistant", content: last.content + parsed.text }];
                return prev;
              });
              endRef.current?.scrollIntoView({ behavior: "smooth" });
            }
          } catch { /* skip */ }
        }
      }
    } catch {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        const fb = "(I'm having trouble reaching the service right now.)";
        if (last && last.role === "assistant") return [...prev.slice(0, -1), { role: "assistant", content: fb }];
        return [...prev, { role: "assistant", content: fb }];
      });
    } finally {
      setSending(false);
      setIsStreaming(false);
      scheduleObserve(); // run the examiner after the patient reply completes
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); }
  };

  const handleSubmit = async () => {
    if (!diagnosis.trim() || !managementPlan.trim() || !caseId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages, diagnosis: diagnosis.trim(), management_plan: managementPlan.trim(), performed_steps: Array.from(ticked) }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResult(data.result);
      setDebrief(data.debrief ?? null);
      setChecklistComparison(data.checklist_comparison ?? []);
      setPerPhase(data.per_phase ?? []);
      setShowSubmit(false);
    } catch { setSubmitError("Could not evaluate. Please try again."); }
    finally { setSubmitting(false); }
  };

  const phases = station?.checklist.phases ?? [];
  const allSteps: StationStep[] = phases.flatMap((p) => p.steps);
  const criticalSteps = allSteps.filter((s) => s.critical);
  const uncheckedCritical = criticalSteps.filter((s) => !ticked.has(s.step_number));

  if (loadError) {
    return (
      <div className="aurora-station-error">
        <p>{loadError}</p>
        <button type="button" onClick={() => router.push("/cases")}>← Back to patients</button>
      </div>
    );
  }

  return (
    <div className="aurora-station" data-testid="station">
      <div className="aurora-station-mesh" aria-hidden />

      <header className="aurora-station-head">
        <button type="button" className="aurora-station-back" onClick={() => router.push("/cases")}>← Patients</button>
        <div>
          <p className="aurora-eyebrow">Virtual patient · OSCE station</p>
          <h1 className="aurora-station-title">
            {caseInfo?.title ?? "Guided OSCE Station"}
            {caseInfo && <> — <em>{caseInfo.patient.name}</em></>}
          </h1>
          {caseInfo && (
            <div className="aurora-station-hud">
              <span>{caseInfo.patient.age} yr</span>
              <span className="aurora-station-hud-sep">·</span>
              <span>{caseInfo.topic}</span>
              <span className="aurora-station-hud-sep">·</span>
              <span className="aurora-station-tier">{caseInfo.difficulty}</span>
            </div>
          )}
        </div>
      </header>

      <div className="aurora-station-grid">
        {/* Left — patient + auto-tracked checklist */}
        <aside className="aurora-station-card aurora-station-aside">
          {caseInfo && (
            <>
              <div className="aurora-station-pt">
                <div className="aurora-station-ring"><img className="aurora-station-av" src={PLATE.caseSession} alt="" aria-hidden onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} /></div>
                <div>
                  <div className="aurora-station-nm">{caseInfo.patient.name}</div>
                  <div className="aurora-station-mt">{caseInfo.patient.age} years · {caseInfo.topic}</div>
                </div>
              </div>
              <div className="aurora-station-cc">“{caseInfo.patient.presenting_complaint}”</div>
            </>
          )}
          {station && (
            <StationChecklist
              procedureName={station.checklist.procedure_name}
              phases={phases}
              totalSteps={station.checklist.total_steps}
              ticked={ticked}
              autoSteps={autoSteps}
              onToggle={toggleStep}
            />
          )}
          {station && !result && (
            <button type="button" className="aurora-station-submit-toggle" onClick={() => setShowSubmit((v) => !v)}>
              {showSubmit ? "Cancel" : "Submit answer →"}
            </button>
          )}
        </aside>

        {/* Right — consult thread + exam tray + composer / result */}
        <div className="aurora-station-main aurora-station-card">
          <p className="aurora-station-tray-label">Patient consult</p>
          <div className="aurora-station-thread">
            {messages.length === 0 && !result && (
              <p className="aurora-station-hint">Greet your patient and begin taking a history. Use the examination tray below to perform clinical tests.</p>
            )}
            {messages.map((m, i) => {
              if (m.role === "user" && m.content.startsWith(EXAM_PREFIX)) {
                const inner = m.content.slice(EXAM_PREFIX.length, -1); // strip prefix + trailing "]"
                const [label, ...rest] = inner.split(" → ");
                return (
                  <div key={i} className="aurora-station-reveal">
                    <span className="rl2">Examination performed · {label}</span>
                    <div className="v">{rest.join(" → ") || label}</div>
                  </div>
                );
              }
              return (
                <div key={i} className={`aurora-station-bubble ${m.role === "user" ? "me" : "pt"}`}>
                  <span className="who">{m.role === "user" ? "You" : caseInfo?.patient.name ?? "Patient"}</span>
                  <div>
                    {m.content}
                    {isStreaming && i === messages.length - 1 && m.role === "assistant" && <span className="aurora-caret" />}
                  </div>
                </div>
              );
            })}
            {sending && <div className="aurora-station-bubble pt"><div className="aurora-typing">•••</div></div>}

            {showSubmit && !result && (
              <div className="aurora-station-form">
                {uncheckedCritical.length > 0 && (
                  <p className="aurora-station-warn">⚠ {uncheckedCritical.length} critical step{uncheckedCritical.length !== 1 ? "s" : ""} not yet done</p>
                )}
                <label className="aurora-eyebrow">Diagnosis</label>
                <textarea className="aurora-input" data-field="diagnosis" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Your primary diagnosis…" rows={2} />
                <label className="aurora-eyebrow">Management plan</label>
                <textarea className="aurora-input" data-field="management" value={managementPlan} onChange={(e) => setManagementPlan(e.target.value)} placeholder="Proposed management and follow-up…" rows={2} />
                {submitError && <p className="aurora-station-warn">{submitError}</p>}
                <button type="button" className="aurora-station-submit-go" disabled={submitting || !diagnosis.trim() || !managementPlan.trim()} onClick={handleSubmit}>
                  {submitting ? "Evaluating…" : "Submit for evaluation →"}
                </button>
              </div>
            )}

            {result && <StationResult result={result} debrief={debrief} perPhase={perPhase} comparison={checklistComparison} onMore={() => router.push("/cases")} onDash={() => router.push("/dashboard")} />}
            <div ref={endRef} />
          </div>

          {station && !result && (
            <>
              <ExamTray actions={station.examination_actions} performed={performedActions} onPerform={performAction} />
              <div className="aurora-station-composer">
                <textarea className="aurora-station-composer-input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} placeholder="Talk to your patient…" rows={1} />
                <button type="button" className="aurora-station-composer-send" onClick={sendMessage} disabled={!input.trim() || sending || isStreaming} aria-label="Send">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* Scored debrief — count-up score out of 40, per-phase summary, domain bars,
   encouraging two-part debrief, and the OSCE checklist review with clinical notes. */
function StationResult({ result, debrief, perPhase, comparison, onMore, onDash }: {
  result: DomainResult; debrief: string | null; perPhase: PhaseSummary[];
  comparison: ChecklistStepResult[]; onMore: () => void; onDash: () => void;
}) {
  const { ref, display } = useCountUp<HTMLSpanElement>(result.total_score, { format: (n) => String(Math.round(n)) });
  return (
    <div className="aurora-station-result">
      <div className="aurora-station-result-head">
        <h2>Consultation complete</h2>
        <span className="aurora-station-total"><span ref={ref}>{display}</span><small>/40</small></span>
      </div>

      {perPhase.length > 0 && (
        <div className="aurora-station-phasechips">
          {perPhase.map((p) => (
            <div key={p.phase} className={`aurora-station-phasechip ${PHASE_CLASS[p.phase] ?? "p2"}`}>
              <b>{p.done}/{p.total}</b>{p.name}
            </div>
          ))}
        </div>
      )}

      {DOMAINS.map((d) => (
        <div key={d.label} className="aurora-station-domain">
          <div className="aurora-station-domain-top">
            <span>{d.label}</span><span className="aurora-station-domain-val">{result[d.scoreKey] as number}/10</span>
          </div>
          <ProgressBar percent={(result[d.scoreKey] as number) * 10} label={d.label} />
          <p className="aurora-station-domain-fb">{result[d.feedbackKey] as string}</p>
        </div>
      ))}

      {debrief && (
        <div className="aurora-station-debrief">
          <p className="aurora-eyebrow">Your debrief</p>
          <p>{debrief}</p>
        </div>
      )}

      {comparison.length > 0 && (
        <div className="aurora-station-review">
          <p className="aurora-eyebrow">OSCE checklist review</p>
          {comparison.map((s) => (
            <div key={s.step_number} className="aurora-station-review-row" data-done={s.performed}>
              <span className="mk" aria-hidden>{s.performed ? "✓" : "✗"}</span>
              <span>
                {s.action}
                {!s.performed && s.clinical_note && <span className="aurora-station-review-note">{s.clinical_note}</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="aurora-station-result-actions">
        <button type="button" className="aurora-toggle" onClick={onMore}>More patients</button>
        <button type="button" className="aurora-station-submit-go" onClick={onDash}>Back to dashboard</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npm run typecheck
```
Expected: PASS. (If `useCountUp` generic `<HTMLSpanElement>` complains, confirm the hook signature accepts a type param — it does: `useCountUp<T extends HTMLElement>`.)

- [ ] **Step 3: Verify no dangling references to retired classes**

```bash
grep -n "aurora-session" frontend/src/aurora/screens/CaseSession.tsx
```
Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/aurora/screens/CaseSession.tsx
git commit -m "feat(station): rebuild CaseSession as the light Guided OSCE Station (station fetch, live tick, exam reveal, /40 debrief)"
```

---

## Task 6: Wire the test mocks, run the harness green, keep the smoke test green

**Files:**
- Modify: `frontend/tests/visual_sweep.mjs`
- (Run) `frontend/tests/station_assert.mjs`, `frontend/tests/aurora_assert.mjs`

- [ ] **Step 1: Add station mocks to the visual sweep**

In `frontend/tests/visual_sweep.mjs`, inside `mockApis()` (right after the existing `await ctx.route("**/api/cases/C001/checklist", ...)` line ~66), add:

```js
  await ctx.route("**/api/cases/C001/station", (r) => r.fulfill(J({
    case: { case_id: "C001", title: "Sudden painful red eye", difficulty: "intermediate", topic: "Glaucoma", estimated_minutes: 12,
            patient: { name: "Mdm Tan", age: 64, presenting_complaint: "Acute pain with halos" } },
    checklist: { procedure_name: "Non-Contact Tonometry", source: "checklist", total_steps: 4, critical_count: 1,
      phases: [
        { phase: 1, name: "Preparation & Identification", steps: [ { step_number: 1, action: "Identify patient — name + NRIC", critical: true, category: "patient_identification", notes: null } ] },
        { phase: 2, name: "Clinical Assessment", steps: [ { step_number: 2, action: "Measure IOP — average of 3", critical: false, category: "clinical_assessment", notes: null }, { step_number: 3, action: "Measure distance visual acuity", critical: false, category: "clinical_assessment", notes: null } ] },
        { phase: 3, name: "Documentation & Follow-up", steps: [ { step_number: 4, action: "Record readings in EMR", critical: false, category: "documentation", notes: null } ] },
      ] },
    examination_actions: [ { key: "iop", label: "Measure IOP · NCT", reveal_text: "IOP (NCT) → R 18 mmHg · L 20 mmHg", satisfies_steps: [2] } ],
  })));
  await ctx.route("**/api/cases/C001/observe", (r) => r.fulfill(J({ newly_satisfied: [] })));
  await ctx.route("**/api/cases/C001/chat", (r) => r.fulfill({ status: 200, contentType: "text/event-stream", body: 'data: {"text":"Good morning, doctor."}\n\ndata: [DONE]\n\n' }));
  await ctx.route("**/api/cases/C001/submit", (r) => r.fulfill(J({ result: { history_score: 7, investigations_score: 7, diagnosis_score: 8, management_score: 6, history_feedback: "Good.", investigations_feedback: "Good.", diagnosis_feedback: "Good.", management_feedback: "Good.", total_score: 28, overall_feedback: "Solid.", critical_hit: 1, critical_total: 1 }, cards: [], mock_mode: false, debrief: "What you did really well: clear identification. Where to grow next time: document the follow-up plan.", checklist_comparison: [], per_phase: [ { phase: 1, name: "Preparation & Identification", done: 1, total: 1 }, { phase: 2, name: "Clinical Assessment", done: 1, total: 2 }, { phase: 3, name: "Documentation & Follow-up", done: 0, total: 1 } ] })));
```

Also add `/cases/C001` to the student sweep so the station is screenshotted. Change the `STUDENT_ROUTES` array (~line 125) to include it:

```js
const STUDENT_ROUTES = ["/", "/checkin", "/dashboard", "/cases", "/cases/C001", "/flashcards", "/summary", "/progress", "/profile", "/chat"];
```

- [ ] **Step 2: Run the station harness — it must now pass**

With `npm run dev` running on :3000:

```bash
node frontend/tests/station_assert.mjs
```
Expected: every line `PASS:` and final `ALL STATION ASSERTIONS PASSED`. If a selector assertion fails, fix the screen/CSS (not the test) until green.

- [ ] **Step 3: Run the existing smoke test — it must stay green**

```bash
node frontend/tests/aurora_assert.mjs
```
Expected: all PASS (17/17), no FAIL. (It does not visit `/cases/:id`; this confirms the shared chrome + global classes were not broken.)

- [ ] **Step 4: Run the visual sweep — confirm the station route is CLEAN**

```bash
node frontend/tests/visual_sweep.mjs
```
Expected: the `student /cases/C001` row prints `CLEAN` (no page/console errors). Eyeball the generated `*-cases-C001.png` against the `light-station-v3` direction.

- [ ] **Step 5: Final typecheck + commit**

```bash
cd frontend && npm run typecheck
git add frontend/tests/visual_sweep.mjs
git commit -m "test(station): add /station+/observe+/chat+/submit sweep mocks; sweep the station route"
```

---

## Self-Review (run before declaring done)

**Spec coverage:**
- §11 phase rail + phased auto-tracked checklist → Task 4 (`StationChecklist`) + Task 5 wiring.
- §6 examination tray + reveal mechanic → Task 3 (`ExamTray`) + Task 5 `performAction`/reveal render.
- §7 live auto-tick (debounced `/observe` after each student turn + deterministic action ticks + manual fallback) → Task 5 `scheduleObserve`/`addAuto`/`toggleStep`.
- §8 grading (per-phase summary, encouraging two-part debrief, checklist comparison w/ clinical notes, count-up score **/40**) → Task 5 `StationResult`.
- §11 visual (mesh canvas, gradient-ring cards, per-phase colour, spinning rim, gradient bubbles, gradient-green reveal w/ shimmer, full-colour rail) → Task 2 CSS.
- §11 wording "OSCE checklist · auto-tracked · N steps" + "✦ auto" → Task 4.
- Motion CSS-only + reduced-motion → Task 2 (`@media`/`html[data-motion]` resets), no GSAP imports.
- Preserved: `eyebot_case_handoff`, SSE reader, submit flow, one h1, shared CSS helpers → Tasks 2 & 5.

**Placeholder scan:** every code step contains full, runnable code; no TODO/"add error handling"/"similar to Task N".

**Type consistency:** `StationStep`/`StationPhase` defined in `StationChecklist.tsx` and re-imported by `CaseSession.tsx`; `ExamAction` defined in `ExamTray.tsx` and re-imported; `scheduleObserve`/`addAuto`/`toggleStep`/`performAction` names consistent across Task 5; CSS class names (`.aurora-station-rl`, `.aurora-station-step`, `.aurora-station-act`/`.is-used`, `.aurora-station-reveal`, `.aurora-station-composer-input/-send`, `.aurora-station-submit-toggle/-go`, `.aurora-station-phasechip`, `.aurora-station-result`, `data-testid="station"`, `data-field="diagnosis|management"`) match between Task 2 CSS, Task 5 markup, and Task 1 test selectors.

---

## Constraints recap (don't violate)
- CSS-only motion; honor `prefers-reduced-motion` AND `html[data-motion="reduce"]`. No GSAP fx wrappers.
- `/observe` stays debounced + abortable + resilient (never blocks the consult; failures are silent).
- Keep `/checklist`-era hooks untouched on OTHER screens; only `CaseSession` migrates to `/station`.
- Auto-commit + push after the task series per project rules.
```
