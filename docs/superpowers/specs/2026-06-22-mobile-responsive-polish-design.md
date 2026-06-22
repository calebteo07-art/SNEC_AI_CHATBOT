# EyeBot mobile-responsive polish — "one app, two layouts"

Date: 2026-06-22
Branch: `flashcards-stepped-selection` (current) → new branch `mobile-responsive`
Status: approved (design), ready for implementation plan

## Problem

The user wants to use EyeBot (https://snec-ai-chatbot.onrender.com) on both a
**phone** and a **laptop**, and have the right layout shown automatically. They
framed it as "two versions."

The honest technical reality: the correct way to deliver this is **one
responsive app** (CSS chooses the layout by screen width), not two separate
codebases. Two true codebases would mean ~2× ongoing maintenance and rely on
unreliable user-agent sniffing. The user agreed to the one-responsive-app
approach.

Crucially, the app is **already ~80% responsive**. The mobile foundation exists:

- Viewport is declared (`width: device-width, initial-scale: 1, viewport-fit:
  cover`) in `frontend/src/app/layout.tsx`.
- PWA manifest + `appleWebApp.capable` + `mobile-web-app-capable` → add-to-home
  works.
- Notch-safe insets via `env(safe-area-inset-bottom)`.
- Responsive breakpoints already exist across 5 CSS files (the side nav rail
  already collapses to a mobile bottom bar at ≤860px — `aurora.css:317`).

So this is **not** "build a mobile version from scratch." It is a **systematic
responsive-polish pass**: audit every surface at phone width, find what actually
breaks, and fix each so the phone experience feels purpose-built rather than a
squished laptop.

## Direction (locked with the user)

- **One responsive codebase. No device detection, no separate routes, no
  duplicated components.** Layout is selected purely by CSS media queries on
  screen width — the reliable approach across phones, tablets, desktop-mode
  browsers, etc.
- **Two layout tiers** (matches the user's "phone + laptop"):
  - **Phone** (≤ ~700px): single column, bottom nav, stacked panels, ≥44px tap
    targets, full-width controls.
  - **Laptop/desktop** (> ~700px): the current layout, unchanged.
  - **Tablet** gets the laptop layout gracefully narrowed — *not* a distinct
    third design.
- **Scope = everything.** Every route should be polished on mobile (student
  daily-use, the heavy interactive screens, and the staff dashboards).
- **Audit-first.** Because the app is already substantially responsive, we
  screenshot every route at phone width first and catalog real breakages before
  changing anything — so we don't redesign pages that already work.

## Goals

1. Every route is usable and well-laid-out on a 390×844 phone viewport: no
   horizontal overflow, readable type, reachable nav, tap targets ≥44px.
2. The phone layout feels purpose-built (stacked panels, bottom nav, full-width
   primary actions) — not a shrunk desktop.
3. Breakpoints are consolidated into **one documented scale** (today they are
   scattered at 820/860/880/920px) so behavior is predictable and maintainable.
4. Desktop is not regressed: `aurora_assert` (and `station_assert`) stay green.

## Non-goals (must NOT change)

- No new features. Layout/responsiveness only.
- No backend changes.
- No deeper PWA/offline mode (current add-to-home behavior is kept, not
  extended).
- No redesign of pages that already render correctly on phone — only fix what
  the audit flags.
- No distinct tablet design.

## Breakpoint system

Introduce a single documented scale, replacing the ad-hoc values:

| Token        | Width        | Meaning                                  |
|--------------|--------------|------------------------------------------|
| `--bp-phone` | `≤ 700px`    | Phone tier (single column, bottom nav)   |
| (default)    | `> 700px`    | Laptop/desktop tier (current layout)     |

- The existing `860px` blocks are migrated to the chosen phone breakpoint
  (`~700px`) where appropriate, or kept if a given component genuinely needs to
  collapse earlier — but each value becomes intentional and documented, not
  incidental.
- Implementation detail: because CSS custom properties can't be used directly
  inside `@media` queries, the breakpoint is documented as a constant comment at
  the top of the responsive section and applied consistently as a literal.

## Surfaces and known hard spots

Routes (all behind the shared shell, so they share nav/responsive plumbing):

**Student daily-use** — Login `(auth)/page`, Check-in `(auth)/checkin`,
Dashboard, Tutor Chat, Flashcards.
- Mostly column-friendly already. Expect fixes to: stat-card grids → single
  column, chat composer/footer width + keyboard safe-area, flashcards hero +
  setup grid sizing on narrow widths, oversized display type clamping.

**Heavy interactive** — Virtual Patients (Eye Atlas) + OSCE Station.
- **OSCE Station two-pane exam room** (`aurora-station`, the fixed-height
  two-pane scroll): on phone collapse the two panes into a **stacked or tabbed**
  layout (conversation / checklist+tray) so neither pane is unusable. This is
  the single most involved change.
- **Eye Atlas** clickable plate: ensure the image scales to viewport width, pin
  tap targets stay ≥44px, and the topic popover/readout reflows; verify pin
  hit-areas aren't lost when the plate shrinks.

**Staff dashboards** — Admin overview/students/accounts/activity, Supervisor.
- Wide **data tables** → horizontal scroll container or card-per-row reflow on
  phone. **Engagement heatmaps** → horizontal scroll or compressed cell size.
  Charts/grids → single column.

## Approach (phased)

- **Phase 0 — Audit.** Add a mobile screenshot sweep to the existing Playwright
  harness (`frontend/tests/`, reusing `_mocks.mjs` + the 127.0.0.1:3000 local
  server pattern) at a phone viewport (390×844). Capture every route, produce a
  written catalog of concrete breakages per page. No code changes yet. This
  defines the real work.
- **Phase 1 — Student daily-use.** Fix login, check-in, dashboard, chat,
  flashcards. Re-screenshot each at phone width to confirm.
- **Phase 2 — Heavy interactive.** OSCE Station stacked/tabbed panes, Eye Atlas
  scaling + pin tap targets.
- **Phase 3 — Staff dashboards.** Tables + heatmaps reflow.
- Each phase ends with desktop regression check (`aurora_assert`,
  `station_assert` green) + a mobile-viewport screenshot pass.

## Verification

- **Mobile:** Playwright screenshots at 390×844 (iPhone-class) for every touched
  route; manual check for horizontal overflow and tap-target size.
- **Desktop (no regression):** `node frontend/tests/aurora_assert.mjs` and
  `node frontend/tests/station_assert.mjs` must stay green.
- Known harness gotchas (from prior work): the local `next start` under
  `output: standalone` is flaky — build, copy `.next/static` + `public` into
  `.next/standalone`, run `node .next/standalone/server.js`; stop the server
  before rebuilding (it locks `.next/standalone`); manual `/flashcards`
  screenshots need check-in/rail/auth setup + a `/dashboard` warmup or the app
  redirects to `/checkin`.

## Risks / open considerations

- **Phone breakpoint value:** spec assumes **~700px** as the phone/laptop divide.
  If real devices argue for a different line during the audit, adjust once,
  centrally.
- **OSCE Station** is the highest-risk change (fixed-height two-pane + the known
  `.aurora-page-enter` height-chain gotcha — see memory). Treat its mobile
  layout as its own carefully-verified step.
- **Effort:** "everything" spans ~13 routes; this is delivered iteratively by
  phase, not in one shot. The audit (Phase 0) will right-size the remaining
  work.
