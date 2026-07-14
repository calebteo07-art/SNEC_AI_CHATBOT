# EyeBot First-Run Grand Tour — Design Spec

**Date:** 2026-07-14
**Status:** Approved for planning (brainstorming decisions locked)
**Owner:** EyeBot frontend

## 1. Goal

Give every first-time user a **welcoming, high-energy, unskippable guided tour** that
showcases the whole app the first time they reach the dashboard — right after the
mandatory Eyecon Studio gate. It must feel like a friend (their own Eyecon) walking
them through EyeBot in ~60 seconds, never strand them, and never regress the visual
assert harness.

## 2. Locked decisions (from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Tour shape | **Single grand cross-route walkthrough** | User pick. One continuous sequence that `router.push`es through every screen. |
| Depth / style | **Curated point-and-explain** | One punchy stop per screen; behind-a-click instruments are *narrated in copy*, never auto-driven. Keeps it fast and un-strandable. |
| Persistence | **`localStorage["eyebot_tour_seen"] = "true"`** | User pick. Exact key the assert harness already pre-seeds → zero harness edits. Per-device is acceptable. |
| Trigger point | **After the Eyecon Studio gate**, on first `/dashboard` landing | User pick. |
| Tooltip look | **Style A — "Guided by Eyecon"** (mascot narrator) | User pick in visual companion. Narrator avatar = the user's **live Eyecon** they just built. |
| Build vs library | **Custom-build**, reviving the prior `GuidedTour` technique | No new dependency (CI supply-chain audit stays clean); perfect brand fidelity via existing tokens. |

## 3. Prior art we reuse (verified)

- A `GuidedTour` shipped before (`git show d138dcd:frontend/src/app/components/GuidedTour.tsx`)
  using `createPortal` + `getBoundingClientRect` + `position:fixed` spotlight, `motion/react`
  springs, and localStorage key `eyebot_tour_seen`. Removed later as dead code. We revive the
  **technique**, with **fresh steps** targeting today's anchors (the old `data-tour` attributes
  no longer exist — confirmed 0 matches in `frontend/src`).
- Z-order contract already documented in `frontend/src/fx/fx.css:3`:
  `GuidedTour 100–103 < wipe overlay 220 < preloader 400`. Overlay stays in the **100–103** band.
- Full-screen portal precedent: `frontend/src/aurora/rewards/RewardBanner.tsx:34-57`
  (`createPortal(node, document.body)`, guards `typeof document`, Escape + scrim-click idioms,
  motion spring `{type:'spring',damping:15,stiffness:240}`). Copy this shape.
- Reduced motion: `useReducedMotion()` in `frontend/src/aurora/motion.ts`; CSS pulses already
  frozen via `html[data-motion='reduce']`.
- Harness pre-seeds `eyebot_tour_seen="true"` in `frontend/tests/_mocks.mjs:144`,
  `aurora_assert.mjs:16` (+718/756/784), `station_assert.mjs:14` → reusing the key keeps asserts green.
- CSP (`next.config.ts`) allows `'unsafe-inline'` styles + `data:`/`blob:` images → an inline-styled
  portal overlay is compliant. **No CSP change.**

## 4. Trigger & lifecycle

The tour lives in a global `TourProvider` mounted inside `AuthProvider` in
`frontend/src/app/providers.tsx` (so it can read auth/avatar and survives cross-route
navigation — the provider chain never remounts).

**Fires when ALL are true:**
1. `useAuth().isAuthenticated === true`
2. Daily check-in done (`isCheckInDone === true`) — user has passed gate #2
3. `useAvatar().data?.customized === true` (strict `=== true`, not truthy — `undefined`
   while loading must NOT fire, mirroring `CheckInGuard`'s flash-loop guard)
4. `localStorage.getItem("eyebot_tour_seen") !== "true"`
5. Current pathname is `/dashboard` (the tour always *starts* on the hub)
6. No RewardBanner is currently enqueued (coordinate with `RewardProvider` so a level-up
   banner and the tour don't stack). If a reward is showing, defer start until its queue drains.

**On finish OR the accessibility escape:** set `localStorage["eyebot_tour_seen"]="true"`,
tear down the overlay, restore focus/scroll/`inert`, and (if not already there) `router.push('/dashboard')`.

The tour is **unskippable**: no visible Skip control. The only exits are (a) completing the
last step, or (b) the assistive-tech escape (§8). Resilience fallbacks (§7) guarantee it can
always *reach* the last step even if a screen misbehaves.

## 5. Tour steps (curated, ~10 + finale)

Each step: `{ id, route, target (selector|null), placement, title, body, waitMs }`.
`target: null` ⇒ centered tooltip, full dim, no spotlight. Copy is Eyecon-voiced, warm, high-energy.

| # | id | route | target | Title / body (draft copy) |
|---|----|-------|--------|---------------------------|
| 1 | `welcome` | `/dashboard` | `null` (center) | **"Welcome to EyeBot! 👁️"** — "I'm your Eyecon — give me 60 seconds and I'll show you around." |
| 2 | `modes` | `/dashboard` | `[data-testid="feature-carousel"]` | **"3 ways to train 💪"** — "Tutor, Virtual Patients & Flashcards — tap any card to dive straight in. This is your launchpad." |
| 3 | `streak` | `/dashboard` | `[data-testid="streak-tile"]` | **"Keep the flame alive 🔥"** — "Show up daily to grow your streak and hit your Lumens goal. Miss a day and it cools." |
| 4 | `badges` | `/dashboard` | `[data-testid="milestone-ladder"]` | **"Collect every badge"** — "Each streak milestone drops a shiny Eyecon badge. Watch the locked ones light up." |
| 5 | `account` | `/dashboard` | `.hm-eyeconmenu-btn` | **"That's you, up top"** — "Your Eyecon lives here — account, password, and logout whenever you need." |
| 6 | `tutor` | `/chat` | `.aurora-composer` (fallback `[data-testid="tutor-landing"]`) | **"Meet your tutor 🧠"** — "Ask any clinical question — answers stream in live and earn you Lumens. Never just gives the answer; it coaches." |
| 7 | `cases` | `/cases` | `.aurora-cases-map` (fallback `[data-testid="case-list"]`) | **"Practice on real patients"** — "The eye itself filters cases. Each is a full OSCE station — take a history, examine, and get a scored debrief." |
| 8 | `flashcards` | `/flashcards` | `[data-testid="flash-setup"]` (fallback `[data-testid="flash-fan"]`) | **"Spin up a deck ⚡"** — "Pick any topic for a 10-card round — instant scoring, a growing streak flame, and a model answer on every card." |
| 9 | `leaderboard` | `/leaderboard` | `[data-testid="podium"]` (fallback `[data-testid="leaderboard-root"]`) | **"See where you stand 🏆"** — "Climb the ranks, chase the podium, and compare within your own cohort." |
| 10* | `analytics` | `/analytics` | `[data-testid="analytics-root"]` or screen root | **"Your cohort insights 📊"** — "As a trainer you also get analytics here — track how your students are progressing." |
| ✦ | `finish` | `/dashboard` | `null` (center) | **"You're all set! 🎉"** — "That's the tour. Come back daily to feed your streak. Let's go!" + **confetti finale**. |

\* Step 10 is **conditional**: included only when `useAuth().user?.role !== 'student'`
(`trainer`/`admin`). All other steps are shared across roles. Step count in the progress
dots/announcement is computed from the *active* step list so "X of N" is correct per role.

Steps live in a single declarative module `frontend/src/aurora/tour/tourSteps.ts` so copy
and anchors are editable in one place.

### Behind-a-click features (narrated, not driven)
Study HUD, tap-to-answer/pause/results (Flashcards), the 3-pane OSCE station + auto-checklist
+ patient chat + scored debrief (Cases), and the live streaming thread + suggestion chips
(Tutor) are all **described in the step copy** at their entry point. The tour does **not**
open a case or start a deck — consistent with the "curated point-and-explain" decision and the
un-strandable requirement.

## 6. Architecture & components

```
providers.tsx
  AuthProvider
    TourProvider ............... context; owns run state, current index, start gating
      RewardProvider
        {children}
      <TourOverlay/> .......... portal to document.body; scrim + spotlight + Eyecon tooltip
```

New files (all under `frontend/src/aurora/tour/`):

- **`tourSteps.ts`** — the declarative `TOUR_STEPS` array (§5) + `activeSteps(role)` helper.
- **`TourProvider.tsx`** — React context. Watches trigger conditions (§4); exposes
  `{ isActive, index, step, total, next(), end() }`. Owns `router` (`next/navigation`) for
  route hops. Writes `eyebot_tour_seen` on end.
- **`useTourAnchor.ts`** — `waitForElement(selector, timeoutMs)` (rAF poll + `MutationObserver`,
  resolves `HTMLElement | null`), plus `useAnchorRect(el)` that tracks `getBoundingClientRect`
  on scroll/resize via throttled rAF.
- **`TourOverlay.tsx`** — the portal. Renders:
  - **Scrim + spotlight:** a `position:fixed` layer; spotlight rect = anchor rect + ~10px pad,
    dim via `box-shadow: 0 0 0 9999px rgba(14,16,26,.62)`; gemini-gradient ring
    (`--gemini`) around the cut-out. `scrollIntoView({block:'center'})` the anchor first, then lock body scroll.
  - **Tooltip card (Style A):** the user's **live `<Eyecon>`** (from `useAvatar` config; falls
    back to a neutral iris-ring if avatar not yet loaded) + "Eyecon / your guide" label + title +
    body + progress dots + gradient **Next** button (last step: **"Let's go!"**). Placed adjacent
    to the spotlight with viewport-edge flipping; centered when `target===null`.
  - **Confetti** on the `finish` step via the existing `canvas-confetti` dep (already used by
    Leaderboard/OSCE — same import, CSP-safe with `worker-src 'self' blob:` already set).

Motion: mirror `RewardBanner` — scrim `opacity` fade + card spring
`{type:'spring',damping:15,stiffness:240}`; step-to-step transitions animate tooltip position.
Under `useReducedMotion()`, swap to a 0.15s opacity fade and no positional spring.

Tokens (unprefixed AURORA vars — there is **no** `--eyebot-*` namespace live): card `--surface`
+ `--hairline`, text `--ink`/`--ink-2`, accent `--gemini`, timings `--dur-*`/`--ease-spring`.

## 7. Resilience & error handling ("unskippable" must never mean "brickable")

- **Anchor wait:** on entering a step, `waitForElement(target, waitMs≈4000)`. On resolve →
  spotlight it. On timeout → render the tooltip **centered with full dim** (no spotlight) using
  the same copy, and let the user advance. The tour never blocks on a missing element.
- **Route hop failures:** `router.push(step.route)`; then wait for anchor on the new page. If the
  push or the page fails, fall through to the centered-fallback tooltip and continue.
- **Immersive routes** (`/chat`, `/flashcards` hide the rail): anchors are on-page elements
  (composer, flash-setup), so the overlay still works; no rail dependency.
- **Guard re-entry:** pushing to each `/…` route re-runs that page's `CheckInGuard`. Because all
  three gates are already cleared, it renders normally (no redirect loop). If a guard *did*
  redirect (e.g., session expired mid-tour), the tour ends cleanly via a pathname watcher.
- **Idempotent start:** a module-scope `startedThisLoad` flag + the localStorage check prevent
  double-starts across React re-renders / fast-refresh.
- **Never trap on error:** any thrown error in overlay/positioning is caught and ends the tour
  (writing `eyebot_tour_seen`) rather than leaving a stuck scrim over the app.

## 8. Accessibility

Net-new (~40 lines; nothing to reuse):
- Tooltip is `role="dialog"` `aria-modal="true"` `aria-labelledby` (title) `aria-describedby` (body).
- Move focus into the tooltip's primary control on each step change; **trap Tab** within the
  tooltip controls.
- Keyboard: **Enter / → / Space** = Next; **Escape = assistive-tech escape** (the single allowed
  early exit — ends the tour and persists seen). Document this as the accessibility valve, not a
  general Skip.
- `aria-live="polite"` region announces "Step X of N — {title}".
- Background marked `inert` (or `aria-hidden`) while the tour runs so SR focus can't leak behind
  the scrim.
- Respects `prefers-reduced-motion` per §6.

## 9. Persistence

- Read on mount: `localStorage.getItem("eyebot_tour_seen") === "true"` ⇒ never start.
- Write on finish/escape: `localStorage.setItem("eyebot_tour_seen", "true")`.
- **Not** routed through `PERSIST_SCHEMA_VERSION`/the IDB React-Query persister (that's for query
  shapes). This is a standalone flag, matching siblings `eyebot_checkin_date`, `eyebot_rail_pinned`.
- Dev/QA re-trigger: clearing the key (or a `?tour=1` escape hatch, optional) restarts it.

## 10. Testing plan (TDD)

Repo reality: there is **no JS unit-test runner** (no `test` script in `frontend/package.json`;
frontend tests are Playwright `.mjs` harnesses run via `scripts/start-harness.sh`, backend is
pytest). So we keep all tour *logic* in pure, dependency-free functions and verify them with the
tools that actually exist here — no new test-runner dependency.

Two pure functions carry the testable logic (no React, no DOM):
- `activeSteps(role)` → the ordered step list (student = 9 stops + finale; trainer/admin adds the
  analytics stop); progress "X of N" derives from its length.
- `shouldStartTour({isAuthenticated, checkInDone, customized, seen, pathname, rewardPending})`
  → boolean. This is the **show-once regression anchor** (per `/ship-check`): the repeat case
  (`seen === true` ⇒ false) and the flash-loop case (`customized === undefined` ⇒ false) are
  explicit rows.

1. **Pure-logic test (TDD, failing-first):** a plain Node assert harness at
   `frontend/tests/tour_engine_test.mjs` covering `activeSteps` + `shouldStartTour` truth tables.
   Node 24 can strip types, but to avoid loader friction the two pure functions live in a plain
   `.mjs`/`.ts` module the harness can import directly (the plan finalizes the exact import path).
   Write the failing cases first, watch them fail, then implement.
2. **Dormant-when-seen (harness, zero-edit):** `aurora_assert.mjs` already pre-seeds
   `eyebot_tour_seen="true"`, so **all existing asserts must stay green with no harness edits** —
   this itself proves the overlay is dormant once seen. Treat any aurora regression as a failure.
3. **Active-tour behavioral (harness, new check):** add one focused Playwright flow that clears
   the key, loads `/dashboard` with all gates satisfied (mocked `/api`), and asserts the overlay +
   first Eyecon tooltip render, the "Step 1 of N" announcement, and Next advances — without
   disturbing other asserted screens.
4. **Behavioral verify (`/verify` + `/ship-check`):** drive the real app — clear the key, complete
   the Eyecon gate, land on `/dashboard`, click through all steps across routes, confirm it lands
   back on `/dashboard`, confetti fires, and it does **not** reappear on reload (show-once invariant).

## 11. Role handling

One shared tour. Only difference: the conditional **Analytics** step (10) for `trainer`/`admin`.
The dashboard content-pool toggle (`.hm-pool`, trainer/admin only) is **not** a separate stop
(out of scope — keeps the tour tight); it can be folded into the account/step-5 copy later if
desired. `studentRole` (OA/OT/PSA) is a content axis, not a permission tier — no tour branching on it.

## 12. Non-goals / out of scope

- No re-walking the Eyecon Studio wizard (already taught by its mandatory gate).
- No auto-driving into a case/deck/thread (no sub-flow entry).
- No server-side `tour_completed` flag / migration (localStorage only, per decision).
- No per-screen just-in-time coach marks (grand walkthrough was chosen instead).
- No "re-open Eyecon Studio anytime" promise — `/studio` **permanently redirects to `/dashboard`
  once `customized===true`** (`EyeconStudio.tsx:53-58`); we don't advertise a path that doesn't exist.

## 13. Risks / open notes

- **Cross-route timing** is the main fragility; §7's anchor-wait + centered fallback is the
  mitigation. Verify on a *cold* first-login (real API latency) during `/verify`.
- **Reward/tour overlap** on first dashboard load (a first-login level-up could enqueue a banner).
  Mitigated by the `rewardPending` gate (§4.6); confirm `RewardProvider` exposes queue state or add
  a minimal `isIdle` selector.
- **Leaderboard/Analytics data:** on a brand-new account these may be sparse/empty — anchors
  (`podium`, roots) still render, so the tour is fine; copy stays aspirational.

## 14. File change list (for the plan)

**New:** `frontend/src/aurora/tour/tourSteps.ts`, `TourProvider.tsx`, `TourOverlay.tsx`,
`useTourAnchor.ts`, `tour.css` (or a scoped block), and a test for the step engine + trigger predicate.
**Edited:** `frontend/src/app/providers.tsx` (mount `TourProvider` inside `AuthProvider`);
possibly `frontend/src/fx/fx.css` (confirm/extend the `100–103` z-band comment); add anchor
`data-testid`s only where a stable one is missing (Analytics root; verify `.hm-eyeconmenu-btn`).
**Untouched:** all screen internals (we anchor to existing hooks), the harness (key already seeded),
`next.config.ts` (CSP already compliant).
