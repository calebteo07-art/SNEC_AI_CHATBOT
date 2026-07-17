# Mobile refit — design

**Date**: 2026-07-17
**Branch**: `mobile-remake` (cut from `origin/main`; local `main` is a diverged
showcase-video line and must not be used as the base — see §0)
**Status**: approved (design), pending implementation plan

## Problem

The app is unusable-feeling on a phone. User report, verbatim:

> the phone version of the app is not good, the layout and look is a bit off … the
> app looks too big and messy to be used on phone (homepage tutor osce flashcards
> leaderboard analytics), like the content, buttons, cards, everything etc … (osce
> make sure they use landscape, right now the warning message to use landscape for
> osce only flashes for a split second then disappears, i want it there until user
> change, or when user moves back to portrait). i want to remove the shortcut
> questions in tutor for mobile. the homepage especially does not look good on
> mobile portrait and landscape mode.

## Decisions (user-confirmed 2026-07-17)

1. **Refit, don't restyle.** Keep the visual identity exactly as-is — colours, type,
   components, the Dark-Arcade flashcards, the podium, Eyecon. Rebuild the *layout*
   for phone. Desktop is untouched. This is a **refinement within** the existing
   design locks: the criterion being changed is *layout at phone viewports*, which
   the locks (written for desktop) never specified. No lock is broken.
2. **Portrait-first, landscape clean.** OSCE stays landscape-required. Every other
   route: portrait is the primary design; landscape must be *clean and usable* —
   nothing clipped, nothing covered, every CTA reachable — but does not get a
   bespoke second layout.
3. **Keep the greeting art, restructure around it.** No new/paid asset generation.

## Scope

In: `/dashboard` (home), `/chat` (tutor), `/cases` + `/cases/[caseId]` (OSCE),
`/flashcards`, `/leaderboard`, `/analytics`, and the global shell (`AppShell`,
Atlas Rail, `aurora.css`, `motion.css`).

Out: desktop layouts, `/checkin`, `/studio`, login, any backend change, any visual
restyle, any new imagery.

## §0 — Base-branch hazard (read first)

`origin/main` is production. Local `main` is **87 behind / 60 ahead**; its 60 commits
are the showcase-video line. **31 frontend files differ**, including every file this
work touches (`aurora.css`, `home.css`, `leaderboard.css`, `AppShell.tsx`,
`GreetingHero`, `Leaderboard`). All work happens in the worktree at
`origin/main`; nothing is based on local `main`.

## Evidence

Gathered against a real build of `origin/main` served from the standalone bundle,
driven with Playwright at 390×844 and 844×390 (`.tmp/shots/`).

| Surface | Portrait | Landscape |
|---|---|---|
| home | headline eats ~6 lines / half the viewport; body copy collides with the eye art; level pill overlaps the wordmark | **bottom bar covers the primary CTA** — "See where you stand" unreachable; `hm-fcard-body` at `left:-75` (off the left edge); greeting video 812px wide in an 844px viewport |
| nav (all routes) | `.aurora-rail-section` is **399px wide in a 390px viewport** → "Leaderboa…" clipped, active pill runs off-screen | 76px bar eats 20% of a 390px-tall viewport |
| tutor | 5 wrapping suggestion chips above the composer | `.aurora-chat-back` tap target 32×32 |
| flashcards | locked coverflow survives; gold title orphans "tap."; ~200px dead space under the stage | ok |
| leaderboard | podium survives; nav clipped | ok |
| OSCE list | — | `.aurora-pin` tap target **19×19** |
| analytics | `Cohort` 75×34, `Refresh` 92×36 tap targets | row label overflows to `right:959` |

Document-level `overflowX` reads `false` on every route only because
`.aurora-main-scroll` sets `overflow-x: hidden` — content is **clipped, not
contained**. Overflow is real; the scrollbar is just suppressed.

## §1 — Root cause: the containing-block trap (the keystone fix)

### The bug

`motion.css:23`:

```css
.aurora-page-enter { animation: aurora-rise-over var(--mo-dur) var(--mo-over) both; }
```

`animation-fill-mode: both` retains the final keyframe forever. `aurora-rise-over`'s
100% is `transform: none` — but a *filling animated* transform computes to
`matrix(1, 0, 0, 1, 0, 0)`, the identity matrix. Identity is **not `none`**, and per
spec any element whose used `transform` is not `none` becomes the **containing block
for `position: fixed` descendants**. `RouteReveal` wraps *every* route in this
element, so every `position: fixed` overlay in the app is silently pinned to the
page box instead of the viewport.

### Verified consequence (measured, not theorised)

`.rotate-gate` on `/cases/C001` at 390×844:

| state | gate `y` | card visible? | user sees |
|---|---|---|---|
| at rest | 0 | ✗ — card 718→1006, fold at 844 | message clipped by the fold |
| scrolled 500px | **−500** | ✓ | **gate scrolls with content** |
| scrolled to end | **−955** | ✗ | warning gone, station exposed |
| rotate back to portrait | −955 | ✗ | scrollTop preserved → **still gone** |

The gate measures **390×1723** inside an 844px viewport. It is not viewport-fixed;
it is absolutely positioned in a 1723px scroll box. Any scroll — momentum, a tap,
the browser settling — scrolls the warning off-screen. That is precisely "flashes
for a split second then disappears", and it is why rotating back does not restore it.

### Prior art — this is a known, mis-fixed bug

Commit `8df25a1` (2026-07-15) diagnosed this exact mechanism correctly:

> "A filling transform animation establishes a containing block for fixed descendants
> even after it settles to transform:none (verified: offsetParent = the wrapper, fixed
> child scrolls with content)."

…and fixed it **symptomatically**, by portaling that one overlay to `<body>`. The
root cause was left in place, so the next `position: fixed` overlay inherited it.
`.rotate-gate` is that next victim; `.aurora-station-overlay` (`position:fixed;
z-index:120`, the OSCE report) is the next one queued.

### The fix

Swap `both` → `backwards` on the entrance animations whose final keyframe already
equals the element's natural resting state:

```css
.aurora-page-enter { animation: aurora-rise-over var(--mo-dur) var(--mo-over) backwards; }
```

`backwards` applies the 0% keyframe before the animation starts (preserving the
entrance, and the `animation-delay` staggering) and reverts to the element's own
style when it ends. Because 100% (`opacity:1; transform:none`) **is** the natural
style, the settled visual is byte-identical — but the lingering identity transform
is gone, and with it the containing block.

Applies to: `.aurora-page-enter`, `.aurora-stagger > *`, `.aurora-rise-in`,
`.aurora-pop-in`, `.aurora-flip-in`, `.aurora-shake-in`.

**Excluded**: `.aurora-bloom-ring` — `aurora-bloom` ends at `opacity: 0;
scale(1.2)`, i.e. *not* its natural state. Its base style is already `opacity: 0`,
so `backwards` would be visually equivalent, but it is decorative, has no fixed
descendants, and is out of scope. Leave it.

**Risk**: this is global — it touches every route's entrance. It is believed
visually inert, but that belief is **verified by before/after screenshot comparison
on every route**, not asserted.

### Why CI missed it

`rotate_gate_assert.mjs` checks `isVisible()` immediately after the element appears,
then rotates. It never waits, never scrolls, and never rotates back. Its one size
assertion is `box.height < 800 → die` — a **1723px** gate passes that. The test
encoded the wrong invariant.

## §2 — The gate itself

- The trap fix alone makes it genuinely viewport-fixed, so it persists while portrait
  and returns on rotate-back **automatically** — the media query is live, no JS
  orientation listener needed. Pure CSS remains the right call (`screen.orientation.lock`
  is fullscreen-only and unsupported on iOS).
- ~~Portal to `<body>` as belt-and-braces so no future wrapper can re-trap it.~~
  **Dropped — amended 2026-07-17 after Task 1.** Two reasons, both learned by building
  Task 1 rather than known when this was written:
  1. Task 1 shipped `frontend/tests/fixed_overlay_assert.mjs`, which asserts the
     containing-block invariant **at the root, app-wide, across five overlays**. That
     is a strictly better guard than portalling one component: it fails on the *cause*
     and covers overlays the portal cannot.
  2. A portal would make the gate permanently immune, so the assert could never again
     catch a re-introduced trap *through the gate* — it would mask its own best
     detector on the one surface the user actually complained about. It is also
     precisely the one-element symptomatic patch commit `8df25a1` applied, which is
     why the root cause survived to break this gate.

  Verified inert to drop: with Task 1 in, `rotate_gate_assert.mjs` is **7/7 green**
  including the scroll-immunity and rotate-back assertions the portal was meant to
  protect.
- **Static-import the gate** (replaces the portal). `RotateGate` is loaded via
  `dynamic(..., { ssr: false })` in a chunk separate from `CaseSession`
  (`app/(shell)/cases/[caseId]/page.tsx:13-16`). It is pure markup — no browser APIs,
  no heavy deps — so the dynamic import buys nothing and only opens a window where the
  station can paint before the gate mounts. A second, independent "flashes then
  disappears" contributor.
- Lock scroll behind it while shown.
- Keep the `pointer: coarse` guard so a narrow desktop window is never nagged.

## §3 — Breakpoint system

Today: a single `@media (max-width: 860px)` and `height: 100vh`. That one tier treats
an 844px landscape phone as a tablet — the direct cause of the 76px bar eating 20% of
a 390px-tall viewport and covering the home CTA.

Replace with explicit tiers:

- **phone portrait** — `max-width: 640px`
- **phone landscape** — short viewport, `max-height: 480px` + coarse pointer
- **tablet** — the existing 860px tier, retained for real tablets

Plus: `100vh` → `100dvh` on the shell chain (`.aurora-shell`, `.aurora-main`), and
`env(safe-area-inset-*)` honoured (the viewport already sets `viewportFit: "cover"`,
so the insets are available and currently only used by the bottom bar).

## §4 — Per-surface refit

- **Shell / nav** — the bar must fit 5 student items (6 for trainer/admin) at 390px
  with no clipping and no horizontal scroll. In phone landscape it goes compact so it
  stops eating vertical space and stops covering content.
- **Home** — greeting art moves from a full-bleed base layer behind text to a
  contained band, with copy in clear space; type scale drops to a phone ramp; the CTA
  is reachable in both orientations.
- **Tutor** — remove the 5 `SUGGESTIONS` chips (`Tutor.tsx:32-38`, rendered
  `Tutor.tsx:276-280`) on mobile, via CSS on `.aurora-chat-followups` (SSR-safe, no
  hydration branch). Fix the 32×32 back target.
- **OSCE** — landscape-required (§2); case list one column; fix the 19×19 pin target.
- **Flashcards** — reclaim the dead space under the stage; the locked coverflow
  (depth, windowing, stage-resolved pick) is **not** touched.
- **Leaderboard** — nav fits; podium scales to 390px.
- **Analytics** — charts and wide tables scroll inside their own
  `overflow-x: auto` containers rather than clipping; fix sub-40px targets.

## §5 — Acceptance criteria

1. Every route at **390×844** and **844×390**: no clipped content, no element
   extending past the viewport, no CTA covered by the nav, every interactive target
   ≥44×44 (documented exceptions listed explicitly).
2. **Gate persistence** — portrait: visible after ≥2s; does **not** move when the
   scroll container scrolls; rotate to landscape → hidden and station usable; rotate
   **back** to portrait → visible again. All four asserted.
3. No `position: fixed` element in the app resolves its containing block to
   `.aurora-page-enter` (assert `offsetParent`/rect against the viewport).
4. Tutor suggestion chips absent at phone widths, present on desktop.
5. Desktop unchanged — before/after screenshots identical at 1440×900 on every route.
6. Locked surfaces unchanged in identity: flashcards coverflow depth+windowing, mono
   logo, podium, Eyecon.
7. Green: `python -m pytest -q`, `npm run typecheck`, `npm run build`, `aurora`
   + `station` harnesses, and the new mobile asserts.

## §6 — Testing

- Extend/replace `rotate_gate_assert.mjs` with the four-part persistence test (§5.2).
  **Write it first, watch it fail against current `origin/main`, then fix.**
- Extend `mobile_audit.mjs` to sweep all six routes × both orientations for the §5.1
  invariants.
- A containing-block regression assert for §5.3 — this is the invariant that, once
  broken, silently breaks every future overlay.
- Before/after screenshot comparison for §5.5 and the §1 inertness claim.

## Risks

- **§1 is global.** Mitigated by per-route before/after comparison, not by argument.
- **Design locks.** Every change is a layout refinement at phone widths; identity is
  preserved. If any change would alter a locked surface's *identity*, stop and re-brief
  per `/design-lock`.
- **Concurrent sessions.** Other Claude sessions edit this repo and force-push `main`.
  Always `git fetch` + compare before any push (see `/handoff` memory).
- **Base drift.** §0.
