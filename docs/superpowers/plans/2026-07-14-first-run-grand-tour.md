# First-Run Grand Tour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an unskippable, high-energy, Eyecon-narrated first-run tour that walks a brand-new user across every screen (Dashboard → Tutor → Cases → Flashcards → Leaderboard → back home), firing once right after the mandatory Eyecon Studio gate.

**Architecture:** A global `TourProvider` mounted inside `AuthProvider` in `providers.tsx` watches the onboarding gates; once they clear on `/dashboard` it runs a declarative cross-route step list. A `TourOverlay` portals a scrim + `getBoundingClientRect` spotlight + Eyecon-narrated tooltip to `document.body`, resolving each step's anchor by waiting for it (falling back to a centered card so a missing anchor never traps the user). All tour logic that can be tested lives in pure functions (`tourSteps.ts`), unit-tested with plain Node asserts. No new dependency — reuses `motion`, `createPortal`, `@/fx/confetti`, existing tokens, and the localStorage key the assert harness already pre-seeds.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, `motion/react`, Tailwind 4 CSS tokens, `canvas-confetti` (via `@/fx/confetti`), Node 24 (native `.ts` type-stripping for the unit test).

**Spec:** `docs/superpowers/specs/2026-07-14-first-run-grand-tour-design.md`

**Key facts (verified against live source):**
- Anchors that exist today: `[data-testid="greeting"]` (`GreetingHero.tsx:53`), `[data-testid="feature-carousel"]` (`FeatureCarousel.tsx:151`), `[data-testid="streak-tile"]` (`StreakTile.tsx:38`), `[data-testid="milestone-ladder"]` (`MilestoneLadder.tsx:15`), `.hm-eyeconmenu-btn` (`home.css:55`), `.aurora-composer` (`Composer.tsx:34`), `.aurora-cases-map` (`Cases.tsx:81`), `.flash-setup` (`aurora.css:2469`), `[data-testid="podium"]` (`Podium.tsx:16`), `[data-testid="leaderboard-root"]` (`Leaderboard.tsx:46`), `.aurora-analytics` (`Analytics.tsx:31`).
- Hooks: `useAuth()` → `{ user:{role}, isAuthenticated, isCheckInDone }` (`AuthContext.tsx`); `useAvatar(enabled)` → `{ data:{ config, customized } }` (`hooks/useAvatar.ts`); `useReducedMotion()` (`aurora/motion.ts`); `confetti(opts)` (`@/fx/confetti`, see `RewardBanner.tsx:24`); `<Eyecon config size />` (`aurora/avatar/Eyecon.tsx`).
- Navigation: use `useRouter`/`usePathname` from `next/navigation` directly (per the `@/lib/nav` header comment).
- Mount site: `frontend/src/app/providers.tsx` (`AuthProvider > RewardProvider > children`, never remounts across routes).
- CSS barrel: `frontend/src/styles/index.css` (imported once in `layout.tsx`).
- Persistence key `eyebot_tour_seen` is pre-seeded `"true"` by the harness (`frontend/tests/_mocks.mjs:144`, `aurora_assert.mjs:16`, `station_assert.mjs:14`) → reusing it keeps every assert green.
- z-order: keep the overlay in the documented `GuidedTour 100–103` band (`frontend/src/fx/fx.css:3`).

**Design deviation from spec (noted):** the trigger predicate drops the `rewardPending` condition the spec listed as a mitigation. A first dashboard load establishes the reward baseline rather than firing a reward, so overlap risk is negligible; dropping it avoids cross-provider coupling (Simplicity-first). If overlap is ever observed, gate on `document.querySelector('[data-testid="reward-banner"]')` in a follow-up.

---

## File Structure

| File | Responsibility |
|---|---|
| `frontend/src/aurora/tour/tourSteps.ts` *(new)* | Pure model: step list, `activeSteps(role)`, `shouldStartTour(...)`, `TOUR_KEY`. No React/DOM. |
| `frontend/tests/tour_engine_test.mjs` *(new)* | Plain-Node unit tests for the pure model (the show-once regression anchor). |
| `frontend/src/aurora/tour/useTourAnchor.ts` *(new)* | DOM helpers: `waitForElement(selectors)`, `useAnchorRect(el)`. |
| `frontend/src/aurora/tour/tour.css` *(new)* | Overlay styles (scrim, spotlight, Eyecon card), z 101–103. |
| `frontend/src/aurora/tour/TourOverlay.tsx` *(new)* | Presentational overlay: portal, spotlight, tooltip, keyboard/focus/a11y, confetti. |
| `frontend/src/aurora/tour/TourProvider.tsx` *(new)* | Controller: watches gates, owns index, drives cross-route navigation, persistence. |
| `frontend/src/app/providers.tsx` *(modify)* | Mount `<TourProvider/>` inside `AuthProvider`. |
| `frontend/src/styles/index.css` *(modify)* | `@import` the tour stylesheet. |

---

## Task 1: Pure tour model + unit tests (TDD)

**Files:**
- Test: `frontend/tests/tour_engine_test.mjs`
- Create: `frontend/src/aurora/tour/tourSteps.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/tour_engine_test.mjs`:

```js
/* Pure-logic tests for the first-run tour model. No test runner / deps — plain Node asserts.
   Run: node frontend/tests/tour_engine_test.mjs
   (Node 24 runs the imported .ts via native type-stripping; on Node < 23.6 add
    --experimental-strip-types.) */
import assert from "node:assert/strict";
import { activeSteps, shouldStartTour, TOUR_STEPS, TOUR_KEY } from "../src/aurora/tour/tourSteps.ts";

let passed = 0;
const it = (name, fn) => { fn(); passed++; console.log("  ✓", name); };

// --- activeSteps(role) ---
it("students get every stop except analytics, ending on the finale", () => {
  const ids = activeSteps("student").map((s) => s.id);
  assert.ok(!ids.includes("analytics"), "no analytics for students");
  assert.equal(ids[0], "welcome");
  assert.equal(ids.at(-1), "finish");
  assert.equal(ids.length, TOUR_STEPS.length - 1);
});
it("trainers and admins get the analytics stop", () => {
  assert.ok(activeSteps("trainer").some((s) => s.id === "analytics"));
  assert.ok(activeSteps("admin").some((s) => s.id === "analytics"));
  assert.equal(activeSteps("trainer").length, TOUR_STEPS.length);
});
it("undefined role is treated as non-staff", () => {
  assert.ok(!activeSteps(undefined).some((s) => s.id === "analytics"));
});
it("every step has a route and non-empty copy", () => {
  for (const s of TOUR_STEPS) {
    assert.ok(s.route.startsWith("/"), `${s.id} route`);
    assert.ok(s.title.length > 0 && s.body.length > 0, `${s.id} copy`);
  }
});

// --- shouldStartTour(...) — the show-once gate ---
const base = { isAuthenticated: true, isCheckInDone: true, customized: true, seen: false, pathname: "/dashboard" };
it("fires when all gates clear on the dashboard", () => assert.equal(shouldStartTour(base), true));
it("never re-fires once seen (show-once invariant)", () => assert.equal(shouldStartTour({ ...base, seen: true }), false));
it("waits while the avatar is still loading (customized undefined)", () => assert.equal(shouldStartTour({ ...base, customized: undefined }), false));
it("does not fire before the Eyecon gate is passed (customized false)", () => assert.equal(shouldStartTour({ ...base, customized: false }), false));
it("does not fire off the dashboard hub", () => assert.equal(shouldStartTour({ ...base, pathname: "/chat" }), false));
it("does not fire before daily check-in", () => assert.equal(shouldStartTour({ ...base, isCheckInDone: false }), false));
it("does not fire when unauthenticated", () => assert.equal(shouldStartTour({ ...base, isAuthenticated: false }), false));

it("persistence key is the harness-seeded one", () => assert.equal(TOUR_KEY, "eyebot_tour_seen"));

console.log(`\n${passed} tour-engine checks passed.`);
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `node frontend/tests/tour_engine_test.mjs`
Expected: FAIL — `Cannot find module '.../frontend/src/aurora/tour/tourSteps.ts'` (module not created yet).

- [ ] **Step 3: Create the pure model**

Create `frontend/src/aurora/tour/tourSteps.ts`:

```ts
/* First-run grand tour — pure model. No React, no DOM: unit-tested directly
   (frontend/tests/tour_engine_test.mjs) and imported by the provider + overlay.
   All tour copy and anchors live here so they're editable in one place. */

export const TOUR_KEY = "eyebot_tour_seen";

export interface TourStep {
  id: string;
  /** pathname the user must be on for this step; the provider navigates here. */
  route: string;
  /** primary CSS selector to spotlight, or null for a centered card (no spotlight). */
  target: string | null;
  /** secondary selector tried if `target` never appears. */
  fallback?: string;
  title: string;
  body: string;
  /** anchor-wait timeout in ms (default 4000). */
  waitMs?: number;
  /** fire the celebratory confetti on this step (the finale). */
  confetti?: boolean;
}

export const TOUR_STEPS: TourStep[] = [
  { id: "welcome", route: "/dashboard", target: null,
    title: "Welcome to EyeBot! \u{1F441}️",
    body: "I'm your Eyecon — give me 60 seconds and I'll show you around." },
  { id: "modes", route: "/dashboard", target: '[data-testid="feature-carousel"]',
    title: "Your 3 ways to train \u{1F4AA}",
    body: "Tutor, Virtual Patients & Flashcards all live here — tap any card to dive straight in." },
  { id: "streak", route: "/dashboard", target: '[data-testid="streak-tile"]',
    title: "Keep the flame alive \u{1F525}",
    body: "Show up daily to grow your streak and hit your Lumens goal. Miss a day and it cools." },
  { id: "badges", route: "/dashboard", target: '[data-testid="milestone-ladder"]',
    title: "Collect every badge",
    body: "Each streak milestone drops a shiny Eyecon badge — watch the locked ones light up as you climb." },
  { id: "account", route: "/dashboard", target: ".hm-eyeconmenu-btn",
    title: "That's you, up top",
    body: "Your Eyecon lives here — account, password, and logout whenever you need them." },
  { id: "tutor", route: "/chat", target: ".aurora-composer", fallback: '[data-testid="tutor-landing"]',
    title: "Meet your tutor \u{1F9E0}",
    body: "Ask any clinical question — answers stream in live and earn you Lumens. It coaches Socratically, never just hands over the answer." },
  { id: "cases", route: "/cases", target: ".aurora-cases-map", fallback: '[data-testid="case-list"]',
    title: "Practice on real patients",
    body: "The eye itself filters cases. Each one is a full OSCE station — take a history, examine, and get a scored debrief." },
  { id: "flashcards", route: "/flashcards", target: ".flash-setup", fallback: '[data-testid="flash-fan"]',
    title: "Spin up a deck ⚡",
    body: "Pick any topic for a 10-card round — instant scoring, a growing streak flame, and a model answer on every card." },
  { id: "leaderboard", route: "/leaderboard", target: '[data-testid="podium"]', fallback: '[data-testid="leaderboard-root"]',
    title: "See where you stand \u{1F3C6}",
    body: "Climb the ranks, chase the podium, and compare within your own cohort." },
  { id: "analytics", route: "/analytics", target: ".aurora-analytics",
    title: "Your cohort insights \u{1F4CA}",
    body: "As a trainer you also get analytics here — track how your students are progressing." },
  { id: "finish", route: "/dashboard", target: null, confetti: true,
    title: "You're all set! \u{1F389}",
    body: "That's the tour. Come back daily to feed your streak — let's go!" },
];

/** The steps shown for a given role. Students don't see the trainer/admin-only analytics
    stop; everyone else does. Order is preserved. */
export function activeSteps(role: string | undefined): TourStep[] {
  const staff = role === "trainer" || role === "admin";
  return TOUR_STEPS.filter((s) => s.id !== "analytics" || staff);
}

export interface TourGateInput {
  isAuthenticated: boolean;
  isCheckInDone: boolean;
  customized: boolean | undefined;
  seen: boolean;
  pathname: string;
}

/** Whether the first-run tour should start right now. Fires only after all three onboarding
    gates clear (auth → daily check-in → Eyecon customized) and only on the dashboard
    hub. `customized` must be strictly true (undefined = still loading ⇒ don't fire,
    mirroring CheckInGuard's flash-loop guard). */
export function shouldStartTour(i: TourGateInput): boolean {
  return (
    i.isAuthenticated === true &&
    i.isCheckInDone === true &&
    i.customized === true &&
    i.seen === false &&
    i.pathname === "/dashboard"
  );
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `node frontend/tests/tour_engine_test.mjs`
Expected: PASS — each check prints `✓ …` and the final line `12 tour-engine checks passed.`
(If your Node warns about stripping types, re-run: `node --experimental-strip-types frontend/tests/tour_engine_test.mjs`.)

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/tour_engine_test.mjs frontend/src/aurora/tour/tourSteps.ts
git commit -m "feat(tour): pure first-run tour model + unit tests"
```

---

## Task 2: Anchor DOM helpers

**Files:**
- Create: `frontend/src/aurora/tour/useTourAnchor.ts`

- [ ] **Step 1: Create the helpers**

Create `frontend/src/aurora/tour/useTourAnchor.ts`:

```ts
"use client";
/* DOM helpers for the tour overlay: resolve a step's anchor element (waiting for it to
   appear across route/animation transitions) and track its live viewport rect. */
import { useEffect, useState } from "react";

/** Resolve the first selector that appears within `timeoutMs`; resolves null on timeout
    (the overlay then falls back to a centered card — a missing anchor never traps the user). */
export function waitForElement(selectors: string[], timeoutMs = 4000): Promise<HTMLElement | null> {
  const pick = (): HTMLElement | null => {
    for (const s of selectors) {
      const el = document.querySelector<HTMLElement>(s);
      if (el) return el;
    }
    return null;
  };
  return new Promise((resolve) => {
    const first = pick();
    if (first) return resolve(first);
    let done = false;
    const finish = (el: HTMLElement | null) => {
      if (done) return;
      done = true;
      obs.disconnect();
      clearTimeout(timer);
      resolve(el);
    };
    const obs = new MutationObserver(() => {
      const el = pick();
      if (el) finish(el);
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true });
    const timer = setTimeout(() => finish(null), timeoutMs);
  });
}

/** Track an element's getBoundingClientRect, updating on scroll/resize via rAF. */
export function useAnchorRect(el: HTMLElement | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!el) { setRect(null); return; }
    let raf = 0;
    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    const onChange = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    window.addEventListener("scroll", onChange, true);
    window.addEventListener("resize", onChange);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onChange, true);
      window.removeEventListener("resize", onChange);
    };
  }, [el]);
  return rect;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS (no errors). This file has no external deps beyond React types.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/tour/useTourAnchor.ts
git commit -m "feat(tour): anchor wait + live-rect DOM helpers"
```

---

## Task 3: Overlay styles

**Files:**
- Create: `frontend/src/aurora/tour/tour.css`
- Modify: `frontend/src/styles/index.css` (add one `@import`)

- [ ] **Step 1: Create the stylesheet**

Create `frontend/src/aurora/tour/tour.css`:

```css
/* First-run grand tour overlay. Portal to <body>; z stays in the documented
   GuidedTour 100–103 band (see fx.css). Light PHOTOPIC surface + gem-gradient accent. */
:root { --tour-accent: linear-gradient(105deg, #3C90FF 0%, #AD72FF 48%, #F96BD6 100%); }

/* Full-viewport layer that eats page clicks so the app is inert behind the tour. For
   anchored steps the dim comes from the spotlight's box-shadow, so this stays transparent;
   for centered steps it carries the dim itself. */
.tour-scrim { position: fixed; inset: 0; z-index: 101; }
.tour-scrim--center { background: rgba(14, 16, 26, 0.62); }

/* The spotlight: a hole punched in a huge box-shadow dim; purely visual (no pointer capture). */
.tour-spot {
  position: fixed; z-index: 101; border-radius: 18px; pointer-events: none;
  box-shadow: 0 0 0 9999px rgba(14, 16, 26, 0.62);
  transition: top .28s cubic-bezier(.22,1,.36,1), left .28s cubic-bezier(.22,1,.36,1),
              width .28s cubic-bezier(.22,1,.36,1), height .28s cubic-bezier(.22,1,.36,1);
}
.tour-spot::after {
  content: ""; position: absolute; inset: -3px; border-radius: 21px; padding: 2px;
  background: var(--tour-accent);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  filter: drop-shadow(0 0 10px rgba(120, 110, 255, .5));
}

.tour-card {
  position: fixed; z-index: 103; width: 300px; max-width: calc(100vw - 32px);
  background: var(--surface); color: var(--ink);
  border: 1px solid var(--border); border-radius: 18px;
  box-shadow: 0 24px 60px rgba(20, 20, 50, .28);
  padding: 15px 16px 14px; outline: none;
}
.tour-card:focus-visible { box-shadow: 0 24px 60px rgba(20,20,50,.28), 0 0 0 3px var(--ring); }
.tour-head { display: flex; align-items: center; gap: 9px; margin-bottom: 8px; }
.tour-head .eyecon-wrap { border-radius: 50%; flex: none; box-shadow: 0 3px 10px rgba(60,60,120,.28); }
.tour-name { font-size: 11px; font-weight: 800; color: var(--ink); line-height: 1.1; }
.tour-role { font-size: 9.5px; color: var(--ink-muted); }
.tour-title { margin: 0; font-size: 15px; font-weight: 800; letter-spacing: -.01em; }
.tour-body { margin: 5px 0 0; font-size: 12.5px; line-height: 1.5; color: var(--ink-muted); }
.tour-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; }
.tour-dots { display: flex; gap: 5px; }
.tour-dots i { width: 6px; height: 6px; border-radius: 50%; background: var(--border); display: block;
  transition: width .25s, background .25s; }
.tour-dots i.on { width: 18px; border-radius: 3px; background: var(--tour-accent); }
.tour-next {
  border: 0; cursor: pointer; font-weight: 700; font-size: 12.5px; color: #fff;
  padding: 8px 18px; border-radius: 999px; background: var(--tour-accent);
  box-shadow: 0 6px 16px rgba(120, 90, 255, .35); font-family: var(--font-sans);
}
html[data-motion="reduce"] .tour-spot { transition: none; }
@media (prefers-reduced-motion: reduce) { .tour-spot { transition: none; } }
```

- [ ] **Step 2: Wire the import into the CSS barrel**

In `frontend/src/styles/index.css`, add the tour import immediately after the leaderboard import (line 6, `@import "../aurora/leaderboard.css";`):

```css
@import "../aurora/leaderboard.css";
@import "../aurora/tour/tour.css";
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/tour/tour.css frontend/src/styles/index.css
git commit -m "feat(tour): overlay stylesheet + barrel import"
```

(CSS compiles as part of the full build in Task 6; there is no per-file CSS check.)

---

## Task 4: Tour overlay component

**Files:**
- Create: `frontend/src/aurora/tour/TourOverlay.tsx`

- [ ] **Step 1: Create the overlay**

Create `frontend/src/aurora/tour/TourOverlay.tsx`:

```tsx
"use client";
/* Presentational tour overlay: scrim + spotlight + Eyecon-narrated tooltip card, with
   keyboard/focus/a11y. Anchors resolve via useTourAnchor; a missing anchor degrades to a
   centered card. Portal to <body>, z in the fx.css GuidedTour band. */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { confetti } from "@/fx/confetti";
import { useAvatar } from "@/hooks/useAvatar";
import { useReducedMotion } from "@/aurora/motion";
import { Eyecon } from "@/aurora/avatar/Eyecon";
import { waitForElement, useAnchorRect } from "./useTourAnchor";
import type { TourStep } from "./tourSteps";

const CARD_W = 300;
const CARD_H = 168;
const PAD = 10;   // spotlight padding around the anchor
const GAP = 16;   // gap between spotlight and card / viewport edges

export function TourOverlay({
  steps, index, onNext, onEnd,
}: {
  steps: TourStep[];
  index: number;
  onNext: () => void;
  onEnd: () => void;
}) {
  const step = steps[index];
  const total = steps.length;
  const last = index === total - 1;
  const reduce = useReducedMotion();
  const { data: avatar } = useAvatar();
  const cardRef = useRef<HTMLDivElement>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  /* Resolve this step's anchor, waiting for route/animation transitions. Null target or a
     timeout ⇒ centered card. Keyed on step.id so it re-runs each step. */
  useEffect(() => {
    let cancelled = false;
    setAnchorEl(null);
    if (!step.target) return;
    const selectors = step.fallback ? [step.target, step.fallback] : [step.target];
    waitForElement(selectors, step.waitMs ?? 4000).then((el) => {
      if (cancelled || !el) return;
      el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      setAnchorEl(el);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);

  const rect = useAnchorRect(anchorEl);

  /* Move focus into the card each step (a11y). */
  useEffect(() => { cardRef.current?.focus(); }, [step.id]);

  /* Keyboard: Enter/→/Space advance; Escape is the assistive-tech escape; Tab trapped to card. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); onNext(); }
      else if (e.key === "Escape") { e.preventDefault(); onEnd(); }
      else if (e.key === "Tab") { e.preventDefault(); cardRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext, onEnd]);

  /* Confetti finale. */
  useEffect(() => {
    if (!step.confetti) return;
    confetti({ particleCount: 170, spread: 105, startVelocity: 48, origin: { y: 0.4 },
      colors: ["#3C90FF", "#AD72FF", "#F96BD6", "#FFCF03", "#60D673"] });
  }, [step.id, step.confetti]);

  if (typeof document === "undefined") return null;

  const spot = rect
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : null;
  const centered = !spot;

  /* Card placement: below the spotlight if it fits, else above; clamp to viewport. Centered
     when there's no anchor. */
  let cardStyle: CSSProperties;
  if (centered) {
    cardStyle = { top: `calc(50% - ${CARD_H / 2}px)`, left: `calc(50% - ${CARD_W / 2}px)` };
  } else {
    const below = spot!.top + spot!.height + GAP;
    const above = spot!.top - GAP - CARD_H;
    const top = below + CARD_H < window.innerHeight ? below : Math.max(GAP, above);
    let left = spot!.left + spot!.width / 2 - CARD_W / 2;
    left = Math.max(GAP, Math.min(left, window.innerWidth - CARD_W - GAP));
    cardStyle = { top, left };
  }

  return createPortal(
    <div className={`tour-scrim${centered ? " tour-scrim--center" : ""}`} data-testid="tour" data-step={step.id}>
      {spot && <div className="tour-spot" style={spot} aria-hidden />}
      <motion.div
        ref={cardRef}
        className="tour-card"
        style={cardStyle}
        role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body"
        tabIndex={-1}
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 8 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
        transition={reduce ? { duration: 0.15 } : { type: "spring", damping: 18, stiffness: 260 }}
      >
        <div className="tour-head">
          <Eyecon config={avatar?.config} size={34} />
          <div>
            <div className="tour-name">Eyecon</div>
            <div className="tour-role">your guide</div>
          </div>
        </div>
        <h2 id="tour-title" className="tour-title">{step.title}</h2>
        <p id="tour-body" className="tour-body">{step.body}</p>
        <div className="tour-foot">
          <div className="tour-dots" aria-hidden>
            {steps.map((s, i) => <i key={s.id} className={i === index ? "on" : ""} />)}
          </div>
          <span className="sr-only" aria-live="polite">Step {index + 1} of {total}</span>
          <button type="button" className="tour-next" onClick={onNext} data-testid="tour-next">
            {last ? "Let's go!" : "Next →"}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS. (Confirms every import resolves: `@/fx/confetti`, `@/hooks/useAvatar`, `@/aurora/motion`, `@/aurora/avatar/Eyecon`, `motion/react`, and the local `./useTourAnchor` / `./tourSteps`.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/tour/TourOverlay.tsx
git commit -m "feat(tour): Eyecon-narrated spotlight overlay (a11y + confetti finale)"
```

---

## Task 5: Tour controller + mount

**Files:**
- Create: `frontend/src/aurora/tour/TourProvider.tsx`
- Modify: `frontend/src/app/providers.tsx`

- [ ] **Step 1: Create the controller**

Create `frontend/src/aurora/tour/TourProvider.tsx`:

```tsx
"use client";
/* First-run grand tour controller. Watches the onboarding gates and, once they've all
   cleared on the dashboard, runs the cross-route walkthrough exactly once (localStorage
   eyebot_tour_seen). Mounted globally inside AuthProvider so it survives route changes.
   Renders nothing but the overlay. */
import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/screens/AuthContext";
import { useAvatar } from "@/hooks/useAvatar";
import { TourOverlay } from "./TourOverlay";
import { activeSteps, shouldStartTour, TOUR_KEY, type TourStep } from "./tourSteps";

/* Module scope: guards against a double-start across re-renders within one page load. */
let startedThisLoad = false;

export function TourProvider() {
  const { isAuthenticated, isCheckInDone, user } = useAuth();
  const { data: avatar } = useAvatar(isAuthenticated);
  const pathname = usePathname();
  const router = useRouter();

  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);

  /* Start gate — fire once when all onboarding gates clear on the dashboard hub. */
  useEffect(() => {
    if (steps || startedThisLoad) return;
    const seen = typeof window !== "undefined" && localStorage.getItem(TOUR_KEY) === "true";
    if (shouldStartTour({ isAuthenticated, isCheckInDone, customized: avatar?.customized, seen, pathname })) {
      startedThisLoad = true;
      setSteps(activeSteps(user?.role));
      setIndex(0);
    }
  }, [steps, isAuthenticated, isCheckInDone, avatar?.customized, pathname, user?.role]);

  const end = useCallback(() => {
    try { localStorage.setItem(TOUR_KEY, "true"); } catch { /* storage disabled — session-only */ }
    setSteps(null);
    setIndex(0);
  }, []);

  const next = useCallback(() => {
    if (!steps) return;
    const ni = index + 1;
    if (ni >= steps.length) { end(); return; }
    const target = steps[ni];
    if (target.route !== pathname) router.push(target.route);
    setIndex(ni);
  }, [steps, index, pathname, router, end]);

  if (!steps) return null;
  return <TourOverlay steps={steps} index={index} onNext={next} onEnd={end} />;
}
```

- [ ] **Step 2: Mount it in the provider chain**

In `frontend/src/app/providers.tsx`, add the import and render `<TourProvider/>` inside `AuthProvider`, just after the `RewardProvider` block.

Add to the imports (after the `RewardProvider` import, line 17):

```tsx
import { RewardProvider } from "@/aurora/rewards/RewardProvider";
import { TourProvider } from "@/aurora/tour/TourProvider";
```

Change the JSX from:

```tsx
        <AuthProvider>
          <RewardProvider>
            <div style={{ position: "relative", minHeight: "100%" }}>{children}</div>
          </RewardProvider>
          <Toaster position="bottom-right" />
        </AuthProvider>
```

to:

```tsx
        <AuthProvider>
          <RewardProvider>
            <div style={{ position: "relative", minHeight: "100%" }}>{children}</div>
          </RewardProvider>
          <TourProvider />
          <Toaster position="bottom-right" />
        </AuthProvider>
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/aurora/tour/TourProvider.tsx frontend/src/app/providers.tsx
git commit -m "feat(tour): mount cross-route tour controller in the provider chain"
```

---

## Task 6: Full gate — build + unit + harness-dormant

- [ ] **Step 1: Re-run the unit test**

Run: `node frontend/tests/tour_engine_test.mjs`
Expected: PASS — `12 tour-engine checks passed.`

- [ ] **Step 2: Typecheck + production build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: typecheck clean; `next build` completes with no errors (this compiles `tour.css` via the barrel and bundles the new client components).

- [ ] **Step 3: Aurora harness stays green (dormant-when-seen proof)**

The harness pre-seeds `eyebot_tour_seen="true"`, so the overlay must NOT render on any asserted screen.

Run: `bash scripts/start-harness.sh aurora`
Expected: all aurora assertions PASS, identical to before this change (no new overlay in any screenshot/DOM assertion). If anything regresses, the overlay is leaking past the seeded key — stop and debug the `shouldStartTour` gate before continuing.

- [ ] **Step 4: Commit any fixups**

```bash
git add -A
git commit -m "test(tour): green build + unit + dormant aurora harness"
```
(Skip if steps 1–3 needed no changes.)

---

## Task 7: Behavioral verification (running app)

Use the `/verify` and `/ship-check` skills to drive the real app end-to-end. This is the behavioral half of the show-once invariant (the unit test is the deterministic half).

- [ ] **Step 1: Serve the built app** (harness recipe — do not use `next start`)

Run: `bash scripts/start-harness.sh serve` (or the standalone recipe from the `/harness` skill). Note the URL (e.g. `http://127.0.0.1:3000`).

- [ ] **Step 2: Put a browser into first-run state**

In the browser devtools console for the app origin, seed a first-run session and clear the tour flag:

```js
localStorage.removeItem("eyebot_tour_seen");
```

Then satisfy the gates the way the harness mocks do (authenticated user, `checkin_done_today`, `avatar.customized === true`) and load `/dashboard`. (Reuse the mock setup in `frontend/tests/_mocks.mjs`; the only change from a normal warm load is the removed `eyebot_tour_seen`.)

- [ ] **Step 3: Drive the whole tour** (Playwright MCP or by hand)

Verify, in order:
1. On `/dashboard`, the overlay appears (`[data-testid="tour"]`) with the centered welcome card, Eyecon avatar shown, "Step 1 of N".
2. Clicking **Next** (`[data-testid="tour-next"]`) spotlights the feature carousel, then streak tile, then badge vault, then the account button.
3. Next from step 5 navigates to `/chat` and spotlights the composer; then `/cases` (atlas map), `/flashcards` (topic fan), `/leaderboard` (podium).
4. For a **student** the tour skips analytics; for a **trainer/admin** it includes `/analytics`.
5. The final step returns to `/dashboard`, shows the "You're all set!" card with **Let's go!**, and fires confetti.
6. After finishing, `localStorage.eyebot_tour_seen === "true"`.
7. **Reload `/dashboard` — the tour does NOT reappear** (show-once invariant).
8. Resilience: temporarily point one step at a bogus selector (or throttle a route) and confirm it degrades to a centered card and still advances — never traps.
9. Keyboard: Enter/→ advance; Tab keeps focus on the card; Escape ends the tour (assistive-tech escape) and sets the seen flag.

Expected: all nine hold. Capture a screenshot of at least the welcome step and one spotlighted step.

- [ ] **Step 4: Reduced-motion check**

Set `localStorage.eyebot_motion = "reduce"` (or OS reduced-motion), clear `eyebot_tour_seen`, reload `/dashboard`. Expected: the tour still runs; the card fades (no spring), the spotlight doesn't animate its transition.

---

## Task 8: Ship

Per project policy (`CLAUDE.md` → Git), push directly to `main` once green. **No new env var, secret, or migration** is introduced (localStorage-only), so there is no out-of-band coordination — `main` boots clean.

- [ ] **Step 1: Confirm the branch is current with origin** (concurrent-session safety)

Run:
```bash
git fetch origin
git rev-list --left-right --count origin/main...HEAD
```
Expected: left count (behind) is `0`. If not, rebase onto `origin/main` before pushing (see the isolated-ship recipe in the concurrent-sessions memory).

- [ ] **Step 2: Final green gate before push**

Run: `node frontend/tests/tour_engine_test.mjs && cd frontend && npm run typecheck && npm run build`
Expected: all pass.

- [ ] **Step 3: Push**

```bash
git push origin HEAD:main
```

- [ ] **Step 4: Confirm deploy** — Render auto-deploys `main`. Note the deploy and, once live, re-run the Task 7 first-run drive against production once to confirm the tour fires for a genuinely new account.

---

## Self-review notes (author)

- **Spec coverage:** every spec section maps to a task — model/steps → T1; anchor resolution/resilience → T2+T4; visual/motion/tokens → T3+T4; a11y → T4; trigger/persistence → T5; harness safety → T6; behavioral show-once + reduced-motion → T7; ship → T8. The one intentional divergence (dropping `rewardPending`) is documented at the top.
- **Type consistency:** `TourStep`, `activeSteps(role)`, `shouldStartTour(TourGateInput)`, and `TOUR_KEY` are defined once in `tourSteps.ts` and consumed unchanged by the test, provider, and overlay. `waitForElement(selectors: string[])` is called with an array in `TourOverlay`. `next()/end()` signatures match `onNext/onEnd` props.
- **No placeholders:** all code blocks are complete and compile-ready; anchors are verified against live source; no "TBD"/"add error handling"-style gaps.
