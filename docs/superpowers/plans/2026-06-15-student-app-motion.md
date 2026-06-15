# Student App Motion — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans (inline) to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bold, reduced-motion-safe animation across the entire student AURORA app —
a global reveal/stagger/count-up engine plus bespoke signature set-pieces on every
screen.

**Architecture:** A CSS-driven motion vocabulary (`aurora/motion.css`) + three React
primitives (`Reveal`, `RouteReveal`, `useCountUp`) provide app-wide entrance/stagger/
counters; the marquee screens layer bespoke GSAP/SplitText/confetti choreography on top.
Everything collapses to an instant, motionless state under reduced-motion.

**Tech Stack:** Next 16 / React 19, CSS keyframes + Web Animations, existing GSAP
SplitText (`fx/text/SplitText.tsx`), `fx/cursor/Magnetic.tsx`, `fx/confetti.ts`,
`aurora/motion.ts` (`useReducedMotion`).

**Verification model (frontend):** there are no unit tests for animation; each phase is
verified by `npm run typecheck` + `npm run build` clean, the visual sweep harness
(`frontend/tests/visual_sweep.mjs`) reporting CLEAN consoles, and a reduced-motion spot
check. Commit after each phase.

---

## File Structure
- **New** `frontend/src/aurora/motion.css` — keyframes, utility classes, reduced-motion reset.
- **New** `frontend/src/fx/Reveal.tsx` — `Reveal` (on-scroll) + `RouteReveal` (page-enter).
- **New** `frontend/src/hooks/useCountUp.ts` — rAF-eased number ticking, reduced-motion safe.
- **Modify** `frontend/src/styles/index.css` — import `motion.css` after `aurora.css`.
- **Modify** `frontend/src/aurora/AppShell.tsx` — wrap student `{children}` in `RouteReveal`.
- **Modify** signature screens + components (Tasks 5–12).
- **Untouched** all admin/supervisor/`.console-dark` files, every API/backend file, login.

---

## Phase 0 — Foundation engine

### Task 1: Motion CSS vocabulary
**Files:** Create `frontend/src/aurora/motion.css`; Modify `frontend/src/styles/index.css`.

- [ ] **Step 1: Write `frontend/src/aurora/motion.css`**

```css
/* AURORA motion system — student app. Bold, GPU-only (transform/opacity), and
   fully reduced-motion-safe (one reset scope at the bottom). Scoped away from the
   staff console: these utilities are only applied on student screens. */
:root {
  --mo-over: cubic-bezier(.34, 1.56, .64, 1);
  --mo-ease: cubic-bezier(.22, .61, .36, 1);
  --mo-dur: 560ms;
}

@keyframes aurora-rise-over { 0% { opacity: 0; transform: translateY(26px) scale(.965); } 60% { opacity: 1; } 100% { opacity: 1; transform: none; } }
@keyframes aurora-rise { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: none; } }
@keyframes aurora-pop { 0% { opacity: 0; transform: scale(.8); } 100% { opacity: 1; transform: none; } }
@keyframes aurora-bloom { 0% { opacity: .85; transform: scale(.95); } 100% { opacity: 0; transform: scale(1.2); } }
@keyframes aurora-shake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-7px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(2px); } }
@keyframes aurora-shimmer-x { from { background-position: 180% 0; } to { background-position: -60% 0; } }

/* Page-enter — RouteReveal wraps each route, keyed by pathname. */
.aurora-page-enter { animation: aurora-rise-over var(--mo-dur) var(--mo-over) both; }

/* Reveal-on-scroll. */
.aurora-reveal { opacity: 0; transform: translateY(22px); transition: opacity .62s var(--mo-ease), transform .62s var(--mo-over); transition-delay: var(--reveal-delay, 0ms); }
.aurora-reveal[data-revealed="true"] { opacity: 1; transform: none; }

/* Stagger container — each direct child delayed by its --i index. */
.aurora-stagger > * { animation: aurora-rise-over var(--mo-dur) var(--mo-over) both; animation-delay: calc(var(--i, 0) * 78ms); }

/* Micro-interactions. */
.aurora-press { transition: transform .12s var(--mo-ease); }
.aurora-press:active { transform: scale(.97); }
.aurora-lift { transition: transform .26s var(--mo-over), box-shadow .26s var(--mo-ease); }
.aurora-lift:hover { transform: translateY(-3px); }

/* Bloom ring (check-in correct answer). */
.aurora-bloom-ring { position: absolute; inset: -2px; border-radius: inherit; border: 2px solid var(--g-green, #16a34a); opacity: 0; pointer-events: none; }
.aurora-bloom-ring[data-on="true"] { animation: aurora-bloom .62s cubic-bezier(.2,.7,.3,1) both; }

/* Reduced motion — kill every student animation, render the final state. */
@media (prefers-reduced-motion: reduce) {
  .aurora-page-enter, .aurora-stagger > *, .aurora-reveal, .aurora-bloom-ring,
  .aurora-press, .aurora-lift { animation: none !important; transition: none !important; opacity: 1 !important; transform: none !important; }
}
html[data-motion="reduce"] .aurora-page-enter,
html[data-motion="reduce"] .aurora-stagger > *,
html[data-motion="reduce"] .aurora-reveal,
html[data-motion="reduce"] .aurora-bloom-ring,
html[data-motion="reduce"] .aurora-press,
html[data-motion="reduce"] .aurora-lift { animation: none !important; transition: none !important; opacity: 1 !important; transform: none !important; }
```

- [ ] **Step 2: Import it** in `frontend/src/styles/index.css` immediately after the `aurora.css` import so it can reference AURORA tokens.

- [ ] **Step 3: Verify** `cd frontend; npx tsc --noEmit` (unaffected) and `npm run build` clean.

### Task 2: `Reveal` + `RouteReveal`
**Files:** Create `frontend/src/fx/Reveal.tsx`.

- [ ] **Step 1: Write the component**

```tsx
"use client";
/* Reveal — rises content in as it enters the viewport (IntersectionObserver, one-shot).
   RouteReveal — replays a page-enter on every navigation (keyed by pathname).
   Both are inert under reduced motion (the CSS resets them to their final state). */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";

export function Reveal({ children, className = "", delay = 0, style }: {
  children?: ReactNode; className?: string; delay?: number; style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || revealed) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { setRevealed(true); io.disconnect(); break; }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    io.observe(el);
    return () => io.disconnect();
  }, [revealed]);
  return (
    <div ref={ref} className={`aurora-reveal ${className}`} data-revealed={revealed ? "true" : undefined}
         style={{ ["--reveal-delay" as string]: `${delay}ms`, ...style }}>
      {children}
    </div>
  );
}

export function RouteReveal({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <div key={pathname} className="aurora-page-enter">{children}</div>;
}
```

- [ ] **Step 2: Verify** `npx tsc --noEmit` clean.

### Task 3: `useCountUp`
**Files:** Create `frontend/src/hooks/useCountUp.ts`.

- [ ] **Step 1: Write the hook**

```tsx
"use client";
/* useCountUp — eases a number up to target with rAF when its element scrolls into
   view. Reduced motion sets the final value immediately. Attach `ref` to the element
   that should trigger it; read `display` for the formatted value. */
import { useEffect, useRef, useState } from "react";

export function useCountUp(target: number, opts?: { duration?: number; format?: (n: number) => string }) {
  const duration = opts?.duration ?? 1100;
  const format = opts?.format ?? ((n) => Math.round(n).toLocaleString());
  const [display, setDisplay] = useState(() => format(0));
  const ref = useRef<HTMLElement | null>(null);
  const started = useRef(false);
  useEffect(() => {
    started.current = false;
    const el = ref.current;
    const reduce = document.documentElement.dataset.motion === "reduce" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const run = () => {
      if (started.current) return; started.current = true;
      if (reduce) { setDisplay(format(target)); return; }
      const t0 = performance.now();
      const step = (t: number) => {
        let p = Math.min(1, (t - t0) / duration); p = 1 - Math.pow(1 - p, 3);
        setDisplay(format(target * p));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if (!el) { run(); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { run(); io.disconnect(); break; }
    }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);
  return { ref, display };
}
```

- [ ] **Step 2: Verify** `npx tsc --noEmit` clean.

### Task 4: Wire `RouteReveal` into the student shell
**Files:** Modify `frontend/src/aurora/AppShell.tsx`.

- [ ] **Step 1:** Import `RouteReveal` from `./components/...` path (`@/fx/Reveal`). In the
  **student** return branch only (NOT the `isStaff` console branch), wrap the scroll
  children: `<div className="aurora-main-scroll"><RouteReveal>{children}</RouteReveal></div>`.
- [ ] **Step 2: Verify** `npx tsc --noEmit` + `npm run build` clean.
- [ ] **Step 3: Commit** Phase 0: `feat(motion): student-app motion engine — Reveal/RouteReveal/useCountUp + CSS vocabulary`.

---

## Phase 1 — Global rollout (every student screen gets motion for free)
For each student screen below, apply the shared engine: wrap the primary content list/
grid container with `className="aurora-stagger"` and give children an `--i` index where
needed; add `aurora-press` to primary buttons/CTAs and `aurora-lift` to cards; use
`Reveal` for below-the-fold sections on long pages. `RouteReveal` already animates the
page-enter from Task 4.

### Task 5: Apply engine to Dashboard, Cases, Flashcards, Summary, Progress, Profile, Tutor, CheckIn shells
**Files (read then modify):** `frontend/src/aurora/screens/{Dashboard,Cases,Flashcards,Summary,Progress,Profile,Tutor,CheckIn}.tsx`.

- [ ] **Step 1:** Read each screen; identify the top-level content container and the
  repeating groups (stat grids, card lists, sections).
- [ ] **Step 2:** Add `aurora-stagger` to grids/lists; `aurora-press` to buttons;
  `aurora-lift` to interactive cards. Long pages (Progress, Cases, Summary): wrap lower
  sections in `<Reveal>`.
- [ ] **Step 3: Verify** `npx tsc --noEmit` + `npm run build` clean; quick visual sweep.
- [ ] **Step 4: Commit** `feat(motion): global reveal/stagger/press rollout across student screens`.

---

## Phase 2 — Signature set-pieces

### Task 6: Check-in choreography (headline) — `screens/CheckIn.tsx` (+ CSS in motion.css)
- [ ] Replace static phase rendering with choreography: question card springs in
  (`aurora-rise-over` on `.aurora-checkin-card`); topic + question via `SplitText`
  word-rise; options use `aurora-stagger` with `--i`. On answer: correct option gets a
  `.aurora-bloom-ring` (`data-on`) + `fx/confetti.ts` burst + verdict `aurora-rise`;
  wrong option `aurora-shake`. Preserve the `/api/checkin/*` flow, phases, and grading.
- [ ] Verify build + reduced-motion (set the profile toggle / OS pref → no movement,
  final state shown). Commit `feat(motion): bold check-in choreography`.

### Task 7: Dashboard hero — `screens/Dashboard.tsx`, `components/GradientHero.tsx`
- [ ] Greeting via `SplitText` rise; stat tiles `useCountUp`; iris/eye porthole parallax
  on pointer-move (transform translate by a few px, reduced-motion → static). Verify + commit.

### Task 8: Cases — `screens/Cases.tsx`, `components/CaseCard.tsx`
- [ ] Cards `aurora-stagger` in; hover depth tilt + image parallax (`aurora-lift` + small
  rotate on pointer); click "open" cue. Verify + commit.

### Task 9: Flashcards — `screens/Flashcards.tsx`
- [ ] 3D flip on reveal-answer (rotateY + `backface-visibility`); deck advance slide
  between cards; progress arc draw. Verify + commit.

### Task 10: Summary — `screens/Summary.tsx`
- [ ] Big XP `useCountUp`; level ring stroke draw; `fx/confetti.ts` on milestone
  (reduced-motion off). Verify + commit.

### Task 11: Chat — `screens/Tutor.tsx`, `components/{MessageBubble,ChatThread,Composer}.tsx`
- [ ] Spring on `aurora-bubble-in`; streaming shimmer on the in-flight bubble
  (`aurora-shimmer-x`); composer focus glow. Verify + commit.

### Task 12: Progress / Profile draws — `screens/{Progress,Profile}.tsx`, `components/{ProgressBar,GoalRing,Sparkline,Heatmap}.tsx`
- [ ] Bars/rings/sparkline/heatmap draw or fill on reveal (width/stroke-dashoffset
  transitions), `useCountUp` on numeric stats. Verify + commit.

---

## Phase 3 — Final verification & ship
### Task 13: Full verification
- [ ] `npx tsc --noEmit` + `npm run build` clean (16/16 routes).
- [ ] Visual sweep across student routes → CLEAN consoles; review screenshots.
- [ ] Reduced-motion pass: set `localStorage["eyebot_motion"]="reduce"` (and/or OS pref);
  confirm every student screen is motionless with final content shown.
- [ ] Confirm staff console (`.console-dark`) and admin/supervisor are visually unchanged.
- [ ] Commit + push to `main`.

---

## Self-review notes
- Spec coverage: engine (Tasks 1–4), global rollout (Task 5), every signature moment in
  the spec (Tasks 6–12), reduced-motion + a11y + perf verified (Task 13). ✓
- Reduced-motion handled in ONE place (motion.css reset) + JS guard in `useCountUp`. ✓
- Engine boundary: CSS + existing GSAP/SplitText/confetti/Magnetic; no new `motion/react`
  in `fx/`. ✓
- Scope: student app only; staff console/admin/APIs/auth untouched (explicit in Task 4
  branch note + Task 13 regression check). ✓
```
