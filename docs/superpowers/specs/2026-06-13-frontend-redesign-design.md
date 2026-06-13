# EyeBot Frontend Redesign — Design Spec (codename **AURORA**)

> Status: **approved design, ready for implementation planning**
> Date: 2026-06-13 · Author: brainstormed with the user (calebteo07-art)
> Supersedes: the PHOTOPIC v2 art direction described in `.awwwards_state.md`
> Live handoff/black-box: `.session-handoff.md` (cross-account resume anchor)

---

## 1. Overview

EyeBot is an AI tutor for ophthalmology residents/students at the Singapore National Eye
Centre. The current frontend (PHOTOPIC v2 — a light "paper & ink" Next.js app) is being
**stripped and rebuilt from zero**. The user dislikes the current aesthetic, its motion/FX
overload, its layout/information design, and its visual details — **everything except the
login screen**, which is kept.

**Drivers:** personal taste · the **IELA award submission due 22 Jun 2026** (must impress
judges in screenshots and live demo) · stakeholder feedback.

**Driving idea:** Direction "Nocturne Atlas" (an editorial medical-atlas structure) remixed to
**light mode**, themed to **Google Gemini** (gradient + Google Sans), with **realistic
AI-generated eye imagery**. Codename **AURORA**.

## 2. Scope

- **In scope:** a from-scratch redesign of every frontend screen and the navigation/IA, in the
  AURORA design language; a new EyeBot logo replacing all placeholders; a realistic eye-imagery
  pipeline (Nano Banana); removal of the heavy legacy FX layer.
- **Kept / sacred:** the **login screen** (kept as an entry moment — see §5.1 for gentle
  reconciliation), the **FastAPI backend and its API contract**, auth/JWT, the data model,
  routing guards' behaviour, the media manifest pipeline, the service worker's offline strategy.
- **Cut nothing (features):** all current features survive and are redesigned/reorganised —
  Dashboard, Tutor (chat), Cases, Flashcards, Progress, Summary, Daily check-in, gamification,
  Profile, Admin (overview/students/accounts/activity), Supervisor.
- **Out of scope:** backend changes beyond what the new UI strictly requires; new product
  features; native mobile apps.

## 3. Design language — AURORA

### 3.1 Palette (the only chromatic source is the Gemini gradient)
- Paper base `#F6F7F9`; **app canvas (richer)** `#EEF0F8`; raised surface `#FFFFFF`
- Hairline border `rgba(31,31,31,0.10)`
- Ink: `#1F1F1F` primary · `#5F6368` secondary · `#9AA0A6` hint
- **Gemini gradient:** `linear-gradient(100deg, #4285F4, #9B72CB, #D96570)` (blue → purple →
  rose). This is the single accent family. **Tracks** (OA / OT / PSA) are distinguished by
  **gradient position + label**, NOT by separate hues. Per-stop deep text shades for tonal
  fills: blue `#0C447C`/`#1A5FB4`, purple `#4A2C7A`/`#6A4A9A`, rose `#A33B52`/`#C0496A`.
- No legacy hues (no gold/teal/emerald track colours from PHOTOPIC). Greyscale + the gradient.

### 3.2 Typography
- **Google Sans** family (Gemini-accurate): Google Sans / Google Sans Text for display, UI,
  body. A **monospace** for readouts, labels, timestamps, track codes, stat numerals.
- No serif. Editorial gravitas comes from scale, hairline rules, generous whitespace, imagery.
- Weights: 400 + 500 only. Tight display tracking (`-0.01em`/`-0.02em`).
- **Implementation flag:** Google Sans is not on the public Google Fonts CDN. Source it legally
  (self-host via `next/font/local` if licensing permits) or choose the closest analog
  (candidates: Google Sans Code is public for mono; for display/body, evaluate a humanist
  geometric sans). Resolve at build time; do not block design on it.

### 3.3 Gradient law — "immersive colour, calm motion"
The user chose **maximal/immersive** gradient AND dislikes FX overload. These reconcile by
separating colour from motion: **colour goes big as atmosphere; motion stays small and slow.**
- Gradient appears as: a **tinted canvas** with soft drifting **mesh blobs**; **gradient hero
  panels**; **tonally-washed cards** (blue/purple/rose); the wordmark, primary CTAs, active nav,
  progress bars, send buttons, active chips.
- **Reading surfaces stay calm** (white/lavender bubbles, white message areas) so text is never
  fighting colour.

### 3.4 Canonical animated-gradient surface (applies to every screen)
- Gradients **animate within each element's rounded borders** (overflow-clipped) — an "abstract
  motion gradient": mesh blobs drift; hero/cards/wordmark/CTA/progress flow.
- **Speed:** ~4–4.5s linear, a full blue→purple→rose→blue sweep, `background-size` ~200–300%.
  GPU-cheap (animate `background-position` / `transform` only).
- **Reduced motion** (OS query OR profile toggle) **freezes all of it instantly.**
- Implementation: CSS `@keyframes` is fine; in the app prefer driving from **one shared GSAP
  ticker loop** to avoid many independent timers (see §7).

### 3.5 Imagery law — realistic Nano Banana eye graphics
- **All brand/feature imagery is realistic AI-generated eye imagery** (photographic irises,
  fundus/retina plates, anatomical cutaways, OCT-style cross-sections), generated via the
  **Gemini API's Nano Banana Pro** (`gemini-3-pro-image`).
- Realistic imagery **always sits in dark "plate" wells** so it never fights the light UI
  (case cards, the Atlas Map, inline tutor plates, dashboard NBA card).
- **Small functional controls** (close, back, send, chevrons, menu, attach) are a **clean
  custom vector glyph set** tuned to optics motifs — legible at 16px. NOT realistic renders.

### 3.6 Logo — "Spark Eye" (monochrome, static, no background)
- The mark is an **eye whose pupil holds the Gemini four-point spark** — fuses "Eye" + AI.
- **Black & white only (logo only;** the app keeps full Gemini colour). Ink `#15161B` on light,
  `#FFFFFF` on dark — ideally `currentColor`-driven.
- **Static, no motion. No tile/background — transparent.**
- Geometry (48×48 viewBox): almond outline `M4 24 Q24 7 44 24 Q24 41 4 24 Z` (stroke ~3, no
  fill, transparent centre) + a 4-point spark glint as the pupil (filled). At **≤32px** the
  spark collapses to a **solid pupil dot** for crispness.
- **Replaces ALL placeholders:** rail wordmark, login icon, favicon, app icon, chat avatar,
  loading state, PWA/manifest icons. Wordmark lockup = mark + "EyeBot" in the same ink/white.
- Deliverable: a single `currentColor` SVG asset (+ favicon/PWA sizes) built at implementation.

### 3.7 Motion law
GSAP-driven, restrained: slow gradient drift (§3.4), spring page transitions, focus glows,
number count-ups, content reveals on route enter. **One signature moment per major screen**
(login iris is kept; the Atlas Map region-glow; the dashboard hero) — never ambient gimmickry.
Removed entirely: fluid simulation, liquid image tiles, scroll-jacking/scrollytelling.

### 3.8 Accessibility invariants (carried from current app, re-verified)
One `h1` per route; `main/nav/header` landmarks; every decorative canvas/SVG `aria-hidden`;
`:focus-visible` gradient/brand ring; no horizontal overflow at 390×844; reduced-motion path
for all motion; colour contrast checked on every tinted fill (text uses the per-stop deep shade).

## 4. Navigation & information architecture

- **Atlas Rail** — persistent left sidebar, the global navigator. Groups:
  - **STUDY:** Dashboard · Tutor · Cases · Flashcards
  - **INSIGHT:** Progress · Summary
  - **OVERSIGHT** (role-gated): Supervisor · Admin
  - Top strip: **⌘K command palette** (search + jump-by-intent) · day streak · profile at base.
  - Active item carries the animated gradient; each item has a small vector glyph; section
    labels are mono.
- **⌘K command palette** — fast navigation by typing ("case 23", "due cards", "OA mastery").
- **Atlas Map** — the spatial realistic-eye menu lives **inside the Cases screen** (not global
  nav): click anatomical regions to filter cases (§5.4).
- **Mobile (desktop-first, adapts down):** the rail collapses to a **bottom bar** for STUDY +
  a "more" drawer for INSIGHT/OVERSIGHT.
- **Auth/role gating:** retain current behaviour — middleware cookie-presence redirect + client
  guards per page (check-in guard per screen; admin guard in admin layout) + API JWT.

## 5. Screen specifications

Every screen inherits: the Atlas Rail, the AURORA tokens, the animated-gradient surface, the
mono Spark Eye, mono readouts, and realistic imagery in dark wells.

### 5.1 Login (KEPT — gentle reconciliation)
Keep the screen the user likes. Minimal reconciliation only: swap the old green eye icon for
the **mono Spark Eye logo**; keep the kept iris/entry moment. Optionally retune accents toward
the Gemini gradient so the hand-off into the app is seamless — but **no structural change**, and
any change is confirmed with the user before touching it.

### 5.2 Dashboard (home)
The command centre. Layout: Atlas Rail · main area with a **gradient hero panel** greeting
(animated) + mono stat readouts (streak/rank) · a **Next-Best-Action card** with a realistic
iris plate + "Continue" CTA · tonal stat cards (**Recall Queue** blue, **OA Mastery** purple,
with sparkline + gradient progress) · **Due Today** (rose) list · **Recent Activity** timeline.
Soft Gemini mesh blobs drift behind the canvas.

### 5.3 Tutor (chat) — APPROVED
EyeBot conversation. **Lavender tinted wash** background
(`linear-gradient(160deg,#EAEBFB,#EFEAF6 52%,#F6ECF1)`); **calm white message bubbles** for
reading; colour in animated accents only (mono spark-eye avatar, gradient send button, active
follow-up chip, active rail item); **user bubbles** get a soft blue/purple gradient tint;
**realistic Nano Banana plates** (e.g. fundus) drop inline in dark wells; **follow-up suggestion
chips**; composer with attach + gradient send. (Chat route stays excluded from smooth-scroll.)

### 5.4 Cases + Atlas Map — APPROVED (centrepiece)
A large **realistic eye in a dark plate** (the Atlas Map) with anatomical regions pinned
atlas-style (Cornea & anterior, Iris & pupil, Lens, Optic disc, Macula …). The **active region
glows in gradient**; clicking a region filters cases. **Track filter** (All · OA · OT · PSA) up
top as gradient-position chips. **Right panel** lists the selected region's cases with status:
**in-progress** (gradient progress + Resume), **completed** (% + check), **locked** (dashed,
prerequisite noted). A "list view" toggle offers a non-spatial alternative.

### 5.5 Case session (detail)
The simulation/run screen for a single case. Two-pane: the **case stem + realistic plate(s)** in
a dark imagery column, and the **interaction column** (questions, free-text/choice answers,
reasoning, scoring, EyeBot feedback). Progress rail for steps. Inherits calm reading surface +
gradient accents. (Route excluded from smooth-scroll.)

### 5.6 Flashcards
Spaced-repetition review (SM-2). A focused single-card surface: the card on a clean white/tinted
face, **flip** animation (spring), grading buttons (Again/Hard/Good/Easy) as gradient-position
chips, a mono session readout (remaining/streak). Realistic plate on image cards in a dark well.
(Route excluded from smooth-scroll.)

### 5.7 Progress
The analytics home. Mastery by track (gradient-position bars), recall calendar/heatmap (gradient
intensity), trend sparklines, weak-topic list. Mono readouts; tonal cards. A signature "your
growth" hero stat.

### 5.8 Summary
Post-session / periodic summary. Inherits Progress's card system; consider surfacing it as a
prominent slice of Progress/Dashboard rather than a heavy separate destination (kept as a route,
lightened in presentation).

### 5.9 Daily check-in
The pre-session check-in (kept, gated). Redesigned as a **light, quick** card flow on the
AURORA surface (mood/readiness inputs), not a heavy gate — fast to clear, with the gradient hero
treatment. Preserves the existing check-in guard behaviour.

### 5.10 Profile
Account, training track, preferences — including the **motion/reduced-motion toggle** and
sound mute. Mono spark-eye + gradient avatar. Change-password modal retained, restyled.

### 5.11 Admin (overview / students / accounts / activity)
The staff console. Dense, Linear-grade tables and overview cards on the AURORA surface; mono
readouts; tonal status. At-risk table, cohort heatmap (gradient intensity), student drill-down,
account management, activity log. Admin layout uses the admin guard (no check-in guard).

### 5.12 Supervisor
Cohort oversight dashboard for supervisors — heatmaps, at-risk students, drill-down, progress
roll-ups. Shares the admin table/card system, role-gated under OVERSIGHT.

## 6. Imagery pipeline (Nano Banana)

- **Generator / model:** realistic eye imagery is generated through the **Gemini API** using
  **Nano Banana Pro** — the "best Nano Banana model", model id **`gemini-3-pro-image`** (already
  the `NB_MODEL` default in `tools/media/generate_accents.py`). **Verify the exact id with a
  ListModels call before each run — Gemini image model ids drift** (per `workflows/media_generation.md`).
- **API key:** uses the existing **`GEMINI_API_KEY` in `.env`** (already added by the user). No
  new key required. Never hardcode, log, or commit the key.
- **Asset classes needed:** hero/dashboard iris; per-region Atlas Map eye(s); fundus/retina
  plates; anatomical cutaways/cross-sections; case-specific plates; loading-state imagery.
- **Pipeline (reuse existing):** generate via `python -m tools.media.generate_accents`
  (rasters = Nano Banana Pro); assets resolve from the versioned `/media/manifest.json`;
  generation **never blocks a user**; every asset is sanitized; served via the manifest with
  posters/fallbacks. Refresh queues the Celery `media` queue from Admin. (Higgsfield is only for
  the separate video loops, which consume platform credits.)
- **PAID + user-gated:** Gemini Nano Banana Pro generation costs credits — **always confirm with
  the user before running any generation**, and run it at implementation time, not now.
- Recipes/economics live in `workflows/media_generation.md` (do not overwrite without permission).

## 7. Technical approach (CONFIRMED: keep stack, rebuild UI, strip old FX)

- **Keep:** Next.js 16 (App Router, React 19, Turbopack, TS strict) + Tailwind v4 (postcss) +
  TanStack Query; the FastAPI backend + API contract; the Next standalone server as the public
  process proxying `/api/*`; Docker/Render deploy; the service worker offline strategy; the
  media manifest pipeline; the login screen.
- **Rebuild:** every screen fresh in the AURORA system, with a new component library (§8) and a
  new navigation shell (Atlas Rail). New token layer replaces the PHOTOPIC tokens.
- **Strip:** the heavy legacy `src/fx/` layer — fluid simulation (`FluidCanvas`), liquid image
  tiles (`LiquidImage`/pool), scroll choreography/scrollytelling, preloader gimmickry. Replace
  with the lightweight animated-gradient surface + a small GSAP motion set.
- **Motion engine:** GSAP owns timelines/transitions; one shared ticker drives the gradient
  loop (lagSmoothing 0). No new ad-hoc rAF loops. Respect reduced-motion globally.
- **Fonts:** self-host the Google Sans family via `next/font/local` (or the chosen analog) +
  a mono. Resolve licensing (§3.2).
- **Routing/guards:** keep current middleware + client guards + JWT behaviour; just re-skin.
- **Keep `reactStrictMode` parity** unless the rebuilt scenes are strict-safe (they should be,
  with the FX layer gone — revisit).

## 8. Component system (new)

`AtlasRail` (+ rail item, section label, ⌘K trigger) · `CommandPalette` · `GradientHero` ·
`StatCard` (tonal variants blue/purple/rose) · `PlateWell` (dark frame for realistic imagery) ·
`AtlasMap` (interactive eye + region pins) · `CaseCard` (in-progress/completed/locked) ·
`ChatThread` + `MessageBubble` + `Composer` + `FollowupChip` · `TrackChips` · `FlashCard` ·
`ProgressBar`/`Sparkline`/`Heatmap` · `GlyphIcon` (vector control set) · `Logo` (mono Spark
Eye, currentColor) · `MotionSurface` (the shared animated-gradient wrapper). All honour
reduced-motion and the a11y invariants.

## 9. Risks & open implementation flags

- **Google Sans licensing/sourcing** (§3.2) — resolve before locking type.
- **Nano Banana credits + generation time** vs the **22 Jun deadline** — generation is paid +
  gated; budget a generation pass early; ship with placeholders/posters if needed.
- **Deadline (9 days):** prioritise the judge-facing path — login → Dashboard → Cases/Atlas Map
  → Tutor → Progress — first; admin/supervisor polish second.
- **Performance:** keep the animated gradient on one shared loop; cap mesh-blob blur cost;
  verify no scroll jank (the whole point of stripping the old FX).

## 10. Success criteria

- Every screen reads as one coherent AURORA system; nothing carries the old PHOTOPIC look.
- The app feels colourful and alive (immersive gradient) yet calm to use (no FX overload).
- The mono Spark Eye logo appears everywhere placeholders used to be.
- Realistic eye imagery is present in dark wells across the judge-facing screens.
- Reduced-motion and a11y invariants pass programmatically.
- Demonstrable, screenshot-ready, and deployable before 22 Jun 2026.
