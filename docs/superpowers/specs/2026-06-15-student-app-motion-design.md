# Student App Motion — Design Spec

> Approved 2026-06-15. Add bold, awwwards-grade animation + transitions across the
> whole **student** AURORA app (admin/supervisor console is out of scope here).
> Decisions locked with the user: **tone = bold & expressive**; **rollout = global
> motion engine + bespoke signature set-pieces on every screen**.

## Goal
The AURORA student screens currently render with almost no entrance choreography —
content just appears. Give the entire student app expressive, premium motion:
page-enter reveals, staggered content, micro-interactions, animated counters, and
bespoke signature moments (the check-in is the headline). It must feel bold but
never compromise accessibility or performance.

## Non-negotiable constraints (PHOTOPIC / .awwwards_state.md)
- **Reduced motion zeroes everything.** OS `prefers-reduced-motion` OR the profile
  toggle (`localStorage["eyebot_motion"]`, mirrored to `html[data-motion="reduce"]`).
  One CSS reset scope + JS guards. Posters/instant states, no movement, confetti off.
- **Engine boundary (D4).** GSAP owns timelines/SplitText/scroll; `motion@12` only for
  pre-existing micro-interactions; **no new `motion/react` imports inside `fx/`**. New
  app-wide motion is **CSS-driven** + existing GSAP/SplitText/confetti/Magnetic.
- **Performance.** Transform/opacity only (GPU), no layout thrash, IntersectionObserver
  (no scroll handlers), single rAF for counters, reuse the shared `fx/ticker.ts`
  (gsap.ticker). No new WebGL/canvas. Respect canvas budgets already in place.
- **a11y invariants.** Exactly one `h1` per route, `main/nav/header` landmarks,
  `:focus-visible` rings intact, every canvas `aria-hidden`, SplitText = `aria-label`
  parent + `aria-hidden` fragments. No horizontal overflow at 390×844.
- **Scope = student app only.** Do NOT touch the `.console-dark` staff console, admin
  screens, Supervisor, or any API/backend. The login screen choreography stays as-is.

## Architecture

### Layer 1 — Global motion engine (covers every student route)
New, small, reusable primitives:

1. **`fx/Reveal.tsx`** — exports:
   - `Reveal` — IntersectionObserver wrapper; when the element enters the viewport it
     gets `data-revealed="true"`, and CSS plays a rise + scale-overshoot. Props: `as`,
     `delay`, `className`. Used for on-scroll section reveals on long pages.
   - `RouteReveal` — wraps `{children}` in `AppShell`, keyed by `usePathname()`, so each
     navigation replays a page-enter reveal. Student shell only (not the staff branch).
   - A `.aurora-stagger` container convention: direct children read `--i` (index) for an
     incremental delay so lists/grids cascade.
2. **`hooks/useCountUp.ts`** — rAF-eased number ticking (ease-out cubic). Reduced motion
   → sets the final value immediately. Returns the formatted display value. Drives XP,
   streak, level, KPIs, percentages.
3. **Shared micro-interactions** (CSS + existing `fx/cursor/Magnetic.tsx`):
   - Button/CTA press: `active { scale: .97 }`; hover lift; `Magnetic` on primary CTAs.
   - Card hover: subtle depth tilt + lift (transform), focus glow on inputs.
4. **CSS: new `aurora-motion` block** (in `aurora.css` or a new `aurora/motion.css`
   imported after tokens): keyframes `rise`, `rise-overshoot`, `bloom-ring`,
   `glow-sweep`, `flip-in`, `shimmer`, `pop`, plus utility classes
   (`.aurora-reveal`, `.aurora-stagger > *`, `.aurora-press`, `.aurora-lift`,
   `.aurora-tilt`) and the **single** `html[data-motion="reduce"]` reset that disables
   all of them (`animation: none; transition: none; transform: none`).

Easing vocabulary: overshoot `cubic-bezier(.34,1.56,.64,1)` for entrances/pops; smooth
`cubic-bezier(.22,.61,.36,1)` for fills/fades. Durations ~420–680ms; stagger 70–90ms.

### Layer 2 — Signature set-pieces (bespoke, bold)
- **Check-in** (`screens/CheckIn.tsx`, the headline): replace the static
  loading→question→result with a choreographed sequence — card springs in with depth
  (rotateX), topic + question word-rise via SplitText, options **cascade in with
  overshoot**; on answer the correct option **blooms a ring + confetti burst +
  gem glow-sweep**, a wrong choice shakes, the verdict slides up. Phases preserved; the
  `/api/checkin/*` flow and grading untouched.
- **Dashboard** (`screens/Dashboard.tsx`): hero masthead + greeting rise (SplitText),
  stat tiles stagger with `useCountUp`, iris/eye porthole parallax on pointer-move.
- **Cases** (`screens/Cases.tsx` + `components/CaseCard.tsx`): cards stagger in; hover
  depth tilt + image parallax; click → "open" cue before navigation.
- **Flashcards** (`screens/Flashcards.tsx`): 3D card flip on reveal-answer (rotateY,
  backface), deck advance/shuffle between cards, progress arc draw.
- **Summary** (`screens/Summary.tsx`): big XP count-up, level ring draws, confetti on a
  milestone (reuse `fx/confetti.ts`).
- **Chat** (`screens/Tutor.tsx` + chat components): enhance existing `aurora-bubble-in`
  with a spring, streaming shimmer on the in-flight bubble, composer focus glow.
- **Progress / Profile**: scroll-reveal sections, animated bars/heatmap/sparkline draw,
  ring fills — mostly the global engine + a few bespoke draws.

### Layer 3 — Apply the global engine to the remaining surfaces
Every student route wrapped by `RouteReveal`; lists/grids use `.aurora-stagger`; primary
buttons get press/magnetic; numeric stats use `useCountUp`; progress/rings animate on
reveal. So even non-marquee screens (Progress, Profile, Cases list, Summary detail)
gain motion for free.

## File inventory (anticipated)
- **New**: `frontend/src/fx/Reveal.tsx`, `frontend/src/hooks/useCountUp.ts`, motion CSS
  (append to `frontend/src/aurora/aurora.css` or new `frontend/src/aurora/motion.css`
  + import in `frontend/src/styles/index.css`).
- **Edit (engine wiring)**: `frontend/src/aurora/AppShell.tsx` (RouteReveal on the
  student branch only).
- **Edit (signature)**: `screens/CheckIn.tsx`, `Dashboard.tsx`, `Cases.tsx`,
  `Flashcards.tsx`, `Summary.tsx`, `Tutor.tsx`, `Progress.tsx`, `Profile.tsx`, and
  components `CaseCard.tsx`, `StatCard.tsx`, `ProgressBar.tsx`, `GoalRing.tsx`,
  `Sparkline.tsx`, `Heatmap.tsx`, `MessageBubble.tsx`, `Composer.tsx`, `ChatThread.tsx`,
  `GradientHero.tsx` as needed.
- **Reuse**: `fx/text/SplitText.tsx`, `fx/cursor/Magnetic.tsx`, `fx/confetti.ts`,
  `fx/ticker.ts`, `aurora/motion.ts` (`useReducedMotion`).
- **Untouched**: all admin/supervisor/`.console-dark` files, every API/backend file,
  the login/auth choreography.

## Verification
- `npm run typecheck` (tsc --noEmit) + `npm run build` clean (16/16 routes).
- Visual sweep (`frontend/tests/visual_sweep.mjs`) across student routes — CLEAN console.
- **Reduced-motion check**: with `prefers-reduced-motion: reduce` (or the profile
  toggle), confirm every screen renders its final state instantly with no movement.
- a11y spot-check: one h1/route, focus-visible rings, no horizontal overflow at 390.
- Manual: navigate the student app and confirm entrances/stagger/counters/signature
  moments feel bold and smooth; staff console unaffected; student app still light.
- Commit + push to `main` (Render auto-deploys) per the auto-commit rule.

## Out of scope
No backend/API changes; no staff-console/admin changes; no auth/role-model changes; no
new dependencies; no new WebGL canvases. Purely presentation motion on the student app.
