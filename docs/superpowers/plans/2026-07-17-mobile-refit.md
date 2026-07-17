# Mobile Refit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make EyeBot genuinely usable on a phone in portrait and landscape — same visual identity, phone-native layout — and fix the OSCE rotate gate at its root.

**Architecture:** One keystone fix (`animation-fill-mode: both → backwards`) removes an app-wide `position: fixed` containing-block trap that is the root cause of the rotate-gate bug. On top of that, a real breakpoint system (phone-portrait / phone-landscape / tablet, `dvh`, safe-area insets) replaces the single `max-width: 860px` tier. Then each surface is refit within its existing design lock — layout only, no restyle. Desktop is untouched throughout and verified so.

**Tech Stack:** Next.js 16 (App Router, `output: standalone`), React 19, hand-written CSS (`aurora.css` 3326 lines, `home.css`, `leaderboard.css`, `motion.css`), Playwright harnesses in `frontend/tests/`.

---

## Working context (read before Task 1)

**Base branch:** all work happens on branch `mobile-remake`, cut from `origin/main`, in the worktree at `C:/Users/caleb/AppData/Local/Temp/claude/mobile-wt`. **Never base this on local `main`** — it is 87 behind / 60 ahead (a showcase-video line) and 31 frontend files differ, including every file this plan touches. Spec §0.

**Design:** `docs/superpowers/specs/2026-07-17-mobile-refit-design.md`. Read it first.

**Serving the harness** (the recipe; `next start` is flaky under `output: standalone`):

```bash
cd C:/Users/caleb/AppData/Local/Temp/claude/mobile-wt/frontend
npx next build --webpack          # --webpack: Turbopack rejects the node_modules junction
rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
PORT=3100 HOSTNAME=127.0.0.1 node .next/standalone/server.js &
```

Port 3100, not 3000 — concurrent Claude sessions use 3000 and wipe `.next/standalone` static.

### The device matrix (use this everywhere; do not shorten it)

| tag | size | why it is in the list |
|---|---|---|
| `portrait-sm` | 360×800 | common Android; narrowest realistic |
| `portrait` | 390×844 | iPhone 14/15 |
| `landscape-narrow` | 844×390 | **below** the 861px tier boundary |
| `landscape-wide` | **932×430** | iPhone 15 Pro Max — **above** 861, currently gets the desktop hover-rail |
| `desktop` | 1440×900 | must be unchanged |

`landscape-wide` is mandatory. The audit's highest-risk finding is that
`@media (min-width: 861px)` (aurora.css:259) sits *inside* the landscape-phone width
range: iPhone 16 Pro (874×402), 15 Pro Max (932×430), 15 Plus (926×430) and Pixel 8
Pro (~892) all exceed it and receive the **hover-only** desktop rail. Touch has no
hover, so their only navigation is a 26px edge handle. A matrix that stops at 844
tests the one landscape width where this bug hides.

---

## File structure

| File | Responsibility | Tasks |
|---|---|---|
| `frontend/src/aurora/motion.css` | keystone fill-mode fix | 1 |
| `frontend/src/aurora/components/RotateGate.tsx` | gate markup + body portal | 2 |
| `frontend/src/aurora/breakpoints.css` **(new)** | the tier tokens, imported once | 3 |
| `frontend/src/aurora/aurora.css` | shell, nav, OSCE, tutor, analytics | 3,4,5,6,8,11 |
| `frontend/src/aurora/components/AtlasRail.tsx` | mobile nav items, brand, sign-out | 5 |
| `frontend/src/aurora/home.css` + `components/home/*` | home refit | 7 |
| `frontend/src/aurora/leaderboard.css` | leaderboard refit | 10 |
| `frontend/src/aurora/screens/Tutor.tsx` | suggestion chips | 8 |
| `frontend/tests/rotate_gate_assert.mjs` | gate persistence (rewritten) | 1,2 |
| `frontend/tests/fixed_overlay_assert.mjs` **(new)** | containing-block invariant | 1 |
| `frontend/tests/mobile_audit.mjs` | full matrix sweep | 12 |
| `frontend/tests/_viewports.mjs` **(new)** | shared device matrix | 1 |

---

## Phase A — Foundation

### Task 1: Kill the containing-block trap (the keystone)

**Files:**
- Create: `frontend/tests/_viewports.mjs`
- Create: `frontend/tests/fixed_overlay_assert.mjs`
- Rewrite: `frontend/tests/rotate_gate_assert.mjs`
- Modify: `frontend/src/aurora/motion.css:23,33,50-53`

**Why:** `animation-fill-mode: both` retains the final keyframe forever. `aurora-rise-over`'s 100% is `transform: none`, but a *filling animated* transform computes to `matrix(1,0,0,1,0,0)` — identity, which is **not `none`** — so `.aurora-page-enter` permanently establishes a containing block for every `position: fixed` descendant. `RouteReveal` wraps every route in it. Measured: `.rotate-gate` is 390×1723 in an 844px viewport and scrolls away with content. Commit `8df25a1` diagnosed this exact mechanism and patched one overlay symptomatically; this fixes the source.

- [ ] **Step 1: Create the shared device matrix**

Create `frontend/tests/_viewports.mjs`:

```js
/* One device matrix, shared by every mobile assert. landscape-wide (932x430) is
   mandatory: @media (min-width:861px) sits inside the landscape-phone width range,
   so phones wider than 861 in landscape get the desktop hover-only rail. A matrix
   that stops at 844 tests the one width where that bug hides. */
export const VIEWPORTS = [
  { tag: "portrait-sm",      width: 360, height: 800, touch: true },
  { tag: "portrait",         width: 390, height: 844, touch: true },
  { tag: "landscape-narrow", width: 844, height: 390, touch: true },
  { tag: "landscape-wide",   width: 932, height: 430, touch: true },
];
export const DESKTOP = { tag: "desktop", width: 1440, height: 900, touch: false };
```

- [ ] **Step 2: Write the failing gate-persistence test**

Rewrite `frontend/tests/rotate_gate_assert.mjs`. The old test asserted `isVisible()`
immediately after the element appeared, then rotated — it never waited, never
scrolled, and never rotated back, and its only size check was `height < 800 → die`,
which a **1723px** gate passes. That is why this bug shipped.

```js
/* OSCE landscape gate — regression harness.
   The four properties that matter, none of which the original test checked:
     1. it is still there after the page settles (not a split-second flash)
     2. it does NOT move when the page scrolls (i.e. it is viewport-fixed)
     3. landscape hides it and the station is usable
     4. rotating BACK to portrait brings it back
   Property 2 is the real invariant: the bug was that .aurora-page-enter's filling
   transform made the gate a scroll-following absolute box. */
import { chromium } from "playwright";
import { student, seededContext } from "./_mocks.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3100";
const ok = (m) => console.log("PASS:", m);
const die = (m) => { console.error("FAIL:", m); process.exit(1); };
const b = await chromium.launch();

const phone = await seededContext(b, base, student, { width: 390, height: 844 }, { hasTouch: true, isMobile: true });
const p = await phone.newPage();
await p.goto(base + "/cases/C001", { waitUntil: "domcontentloaded" });
await p.waitForSelector(".rotate-gate", { timeout: 15000 });

// 1. Still there after everything settles.
await p.waitForTimeout(2000);
if (!(await p.locator(".rotate-gate").isVisible())) die("gate vanished within 2s (the split-second flash)");
ok("gate persists >=2s in portrait");

// 1b. It must cover the viewport EXACTLY — not be a tall page-box overlay.
const vp = await p.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
const box = await p.locator(".rotate-gate").boundingBox();
if (Math.abs(box.height - vp.h) > 2 || Math.abs(box.width - vp.w) > 2) {
  die(`gate must match the viewport exactly, got ${box.width}x${box.height} vs ${vp.w}x${vp.h}`);
}
ok("gate matches the viewport box (not the page box)");

// 1c. The message itself must be fully on screen.
const card = await p.locator(".rotate-gate-card").boundingBox();
if (card.y < 0 || card.y + card.height > vp.h) die(`gate card off-screen: y=${card.y} h=${card.height} vp=${vp.h}`);
ok("gate card fully within the viewport");

// 2. THE invariant: scrolling must not move it.
const before = (await p.locator(".rotate-gate").boundingBox()).y;
await p.evaluate(() => {
  document.querySelector(".aurora-main-scroll")?.scrollTo(0, 900);
  window.scrollTo(0, 900);
});
await p.waitForTimeout(400);
const after = (await p.locator(".rotate-gate").boundingBox()).y;
if (Math.abs(after - before) > 1) die(`gate scrolled with content (${before} -> ${after}) — it is not viewport-fixed`);
ok("gate does not move when the page scrolls");

// 3. Landscape hides it, station usable.
await p.setViewportSize({ width: 844, height: 390 });
await p.waitForTimeout(400);
if (await p.locator(".rotate-gate").isVisible()) die("gate must hide in landscape");
await p.waitForSelector('[data-testid="station"]', { timeout: 15000 });
ok("landscape -> gate hidden, station present");

// 4. Rotate BACK -> it returns, fully visible.
await p.setViewportSize({ width: 390, height: 844 });
await p.waitForTimeout(400);
if (!(await p.locator(".rotate-gate").isVisible())) die("gate must RETURN when rotated back to portrait");
const card2 = await p.locator(".rotate-gate-card").boundingBox();
const vp2 = await p.evaluate(() => ({ h: window.innerHeight }));
if (card2.y < 0 || card2.y + card2.height > vp2.h) die(`gate card off-screen after rotate-back: y=${card2.y}`);
ok("rotate back to portrait -> gate returns, card fully visible");
await phone.close();

// 5. Desktop (fine pointer), narrow window -> never nagged.
const desk = await seededContext(b, base, student, { width: 560, height: 900 });
const d = await desk.newPage();
await d.goto(base + "/cases/C001", { waitUntil: "domcontentloaded" });
await d.waitForSelector('[data-testid="station"]', { timeout: 15000 });
await d.waitForTimeout(300);
if (await d.locator(".rotate-gate").isVisible()) die("no gate on a fine-pointer desktop");
ok("desktop narrow portrait -> no gate");
await desk.close();

console.log("ALL ROTATE-GATE ASSERTIONS PASSED");
await b.close();
```

- [ ] **Step 3: Run it — watch it fail**

```bash
cd C:/Users/caleb/AppData/Local/Temp/claude/mobile-wt/frontend/tests
node rotate_gate_assert.mjs http://127.0.0.1:3100
```

Expected: **FAIL** at "gate must match the viewport exactly, got 390x1723 vs 390x844".
If it fails at a *different* assertion, stop and re-read the design spec §1 — the
mechanism is not what we think.

- [ ] **Step 4: Write the containing-block invariant test**

Create `frontend/tests/fixed_overlay_assert.mjs`. This is the invariant that, once
broken, silently breaks every future overlay:

```js
/* No position:fixed element may resolve its containing block to a route wrapper.
   .aurora-page-enter (RouteReveal) had `animation-fill-mode: both` over keyframes
   containing a transform; a filling transform stays a containing block for fixed
   descendants forever, so every overlay silently pinned to the page box instead of
   the viewport (rotate gate, station report, Studio popup -> commit 8df25a1). */
import { chromium } from "playwright";
import { student, seededContext } from "./_mocks.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3100";
const ok = (m) => console.log("PASS:", m);
const die = (m) => { console.error("FAIL:", m); process.exit(1); };
const b = await chromium.launch();

const ROUTES = ["/dashboard", "/chat", "/cases", "/flashcards", "/leaderboard"];
const ctx = await seededContext(b, base, student, { width: 390, height: 844 }, { hasTouch: true, isMobile: true });

for (const route of ROUTES) {
  const p = await ctx.newPage();
  await p.goto(base + route, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1500); // let the entrance animation FINISH and fill

  const bad = await p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (cs.animationName === "none") continue;
      if (cs.transform !== "none") {
        out.push({ cls: (el.className || "").toString().slice(0, 40), transform: cs.transform, fill: cs.animationFillMode });
      }
    }
    return out;
  });
  if (bad.length) {
    die(`${route}: settled animated element(s) still carry a transform, which traps position:fixed:\n` +
        bad.map((x) => `   .${x.cls} transform=${x.transform} fill-mode=${x.fill}`).join("\n"));
  }
  ok(`${route}: no settled animation leaves a containing-block transform`);
  await p.close();
}

console.log("ALL FIXED-OVERLAY ASSERTIONS PASSED");
await b.close();
```

- [ ] **Step 5: Run it — watch it fail**

```bash
node fixed_overlay_assert.mjs http://127.0.0.1:3100
```

Expected: **FAIL** — `/dashboard: settled animated element(s) still carry a transform … .aurora-page-enter transform=matrix(1, 0, 0, 1, 0, 0) fill-mode=both`.

- [ ] **Step 6: Apply the keystone fix**

In `frontend/src/aurora/motion.css`, change `both` → `backwards` on the entrance
animations whose **final keyframe already equals the element's natural resting
state** (`opacity:1; transform:none`), so the settled visual is byte-identical:

Line 23:
```css
/* Page-enter — RouteReveal wraps each route, keyed by pathname.
   fill-mode is `backwards`, NOT `both`: `both` retains the final keyframe forever,
   and a filling transform (even the identity matrix that `transform: none` computes
   to) keeps this element a containing block for every position:fixed descendant —
   which silently pins overlays to the page box instead of the viewport (rotate gate,
   station report, Studio popup / commit 8df25a1). `backwards` still applies the 0%
   keyframe before the run (preserving the entrance and any animation-delay), and the
   settled state is identical because 100% IS the natural style. Never revert to `both`;
   frontend/tests/fixed_overlay_assert.mjs guards this. */
.aurora-page-enter { animation: aurora-rise-over var(--mo-dur) var(--mo-over) backwards; }
```

Line 33 (same reasoning; `backwards` is required here anyway for the delay):
```css
.aurora-stagger > * { animation: aurora-rise-over var(--mo-dur) var(--mo-over) backwards; animation-delay: calc(var(--i, 0) * 78ms); }
```

Lines 50-53:
```css
.aurora-rise-in { animation: aurora-rise-over var(--mo-dur) var(--mo-over) backwards; }
.aurora-pop-in { animation: aurora-pop .5s var(--mo-over) backwards; }
.aurora-shake-in { animation: aurora-shake .42s ease-in-out backwards; }
.aurora-flip-in { animation: aurora-flip-in .56s var(--mo-over) backwards; }
```

**Do NOT touch `.aurora-bloom-ring`** (line ~63). Its keyframe `aurora-bloom` ends at
`opacity: 0; transform: scale(1.2)` — *not* its natural state — so `both` is doing
real work there. It is decorative and has no fixed descendants. Leave it.

- [ ] **Step 7: Rebuild and re-run both tests**

```bash
cd C:/Users/caleb/AppData/Local/Temp/claude/mobile-wt/frontend
npx next build --webpack && rm -rf .next/standalone/.next/static .next/standalone/public \
  && cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public
# restart the server, then:
cd tests && node fixed_overlay_assert.mjs http://127.0.0.1:3100
```

Expected: **ALL FIXED-OVERLAY ASSERTIONS PASSED**.

```bash
node rotate_gate_assert.mjs http://127.0.0.1:3100
```
Expected: the gate now matches the viewport and survives scrolling. Assertions 1, 1b,
1c, 2, 3, 4, 5 pass.

- [ ] **Step 8: Prove the fix is visually inert (the spec's stated risk)**

This change is global — it touches every route's entrance. The claim "visually
identical" is an argument, not evidence. Get evidence:

```bash
# with the PRE-fix build still checked out (git stash the motion.css change):
node _mobile_shots.mjs http://127.0.0.1:3100    # writes .tmp/shots/*.png
mv ../../.tmp/shots ../../.tmp/shots-before
# restore the fix, rebuild, then:
node _mobile_shots.mjs http://127.0.0.1:3100
```

Compare `.tmp/shots-before/*` against `.tmp/shots/*` for all 6 routes × both
orientations, plus `desktop` at 1440×900. Any visible difference means the
assumption is wrong — stop and re-derive.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/aurora/motion.css frontend/tests/_viewports.mjs \
        frontend/tests/fixed_overlay_assert.mjs frontend/tests/rotate_gate_assert.mjs
git commit -m "fix(motion): stop route entrances from trapping position:fixed

animation-fill-mode:both retains the final keyframe forever, and a filling transform
— even the identity matrix `transform: none` computes to — keeps .aurora-page-enter a
containing block for every position:fixed descendant. RouteReveal wraps every route,
so every overlay in the app was pinned to the page box, not the viewport: the OSCE
rotate gate measured 390x1723 in an 844px viewport and scrolled away with content
(the reported 'flashes then disappears'). Commit 8df25a1 hit this and portaled one
overlay out; this fixes the source.

backwards keeps the entrance (0% still applies before the run, delays still stagger)
and settles identically, because 100% IS the natural resting style.

The old gate test asserted visibility once, immediately, and only that height >= 800
— a 1723px gate passed. Rewritten to assert what matters: persistence, an exact
viewport-sized box, no movement under scroll, and return-on-rotate-back."
```

---

### Task 2: Harden the gate

**Files:**
- Modify: `frontend/src/aurora/components/RotateGate.tsx`
- Modify: `frontend/src/aurora/aurora.css:1150-1157`

**Why:** Task 1 makes the gate correct. This makes it *stay* correct: a portal means
no future wrapper can re-trap it, and scroll-lock stops the station moving behind it.

- [ ] **Step 1: Portal the gate to `<body>`**

Replace the component body in `frontend/src/aurora/components/RotateGate.tsx`:

```tsx
"use client";

/* Landscape gate for the OSCE station on phones. The triptych (checklist ‖ patient
   consult ‖ EyeBot) needs horizontal room, so a portrait phone gets a full-screen
   "rotate to landscape" takeover. Visibility is pure CSS (aurora.css) — a live media
   query, so the gate persists for exactly as long as the phone is portrait and returns
   the instant it is rotated back. No JS orientation listener: screen.orientation.lock
   only works fullscreen and is unsupported on iOS.

   Portalled to <body> deliberately. Any ancestor with a transform becomes the
   containing block for position:fixed, which would pin this to the tall page box
   instead of the viewport — the exact bug that made it scroll away (see
   motion.css:23 and commit 8df25a1). Task 1 removed today's offender; the portal
   makes the gate immune to the next one. */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function RotateGate() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="rotate-gate" role="alertdialog" aria-modal="true" aria-label="Rotate your phone to landscape">
      <div className="rotate-gate-mesh" aria-hidden />
      <div className="rotate-gate-card">
        <span className="rotate-gate-phone" aria-hidden />
        <h2 className="rotate-gate-title">Rotate your phone</h2>
        <p className="rotate-gate-copy">
          The OSCE virtual-patient station needs landscape room for the checklist,
          patient consult, and EyeBot panel. Turn your phone sideways to begin.
        </p>
        <p className="rotate-gate-hint">
          Not turning? Switch off Portrait Orientation Lock in your phone&rsquo;s control centre.
        </p>
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Lock scroll behind the gate, and use dvh**

In `frontend/src/aurora/aurora.css`, replace the block at 1150-1157:

```css
.rotate-gate { display: none; }
/* Shown ONLY on a touch device in portrait. `pointer: coarse` keeps a narrow desktop
   window from ever being nagged. The query is live, so turning the phone reveals the
   station instantly and turning back re-shows the gate — no JS. 100dvh (not vh) so
   mobile browser chrome cannot push the card under the fold. */
@media (orientation: portrait) and (max-width: 600px) and (pointer: coarse) {
  .rotate-gate {
    display: flex; position: fixed; inset: 0; z-index: 9990;
    width: 100vw; height: 100dvh;
    flex-direction: column; align-items: center; justify-content: center;
    text-align: center; padding: 32px 26px; color: var(--ink); overflow: hidden;
    overscroll-behavior: contain; touch-action: none;
  }
  /* The station must not scroll behind the takeover. */
  body:has(.rotate-gate) .aurora-main-scroll { overflow: hidden; }
}
```

- [ ] **Step 3: Rebuild, run the gate test**

```bash
cd C:/Users/caleb/AppData/Local/Temp/claude/mobile-wt/frontend && npx next build --webpack \
  && rm -rf .next/standalone/.next/static .next/standalone/public \
  && cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public
# restart server, then:
cd tests && node rotate_gate_assert.mjs http://127.0.0.1:3100
```
Expected: **ALL ROTATE-GATE ASSERTIONS PASSED**.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/aurora/components/RotateGate.tsx frontend/src/aurora/aurora.css
git commit -m "fix(osce): pin the rotate gate to the viewport and lock scroll behind it

Portal to <body> so no future transformed ancestor can re-trap position:fixed (the
Task 1 bug), size with 100dvh so browser chrome cannot push the card under the fold,
and stop the station scrolling behind the takeover."
```

---

### Task 3: Breakpoint tiers, dvh, safe-area

**Files:**
- Create: `frontend/src/aurora/breakpoints.css`
- Modify: `frontend/src/styles/index.css` (import it)
- Modify: `frontend/src/aurora/aurora.css:8,19,99` (`100vh` → `100dvh`)

**Why:** the shell is `height: 100vh` in 4 places while `overflow: hidden`. On mobile
`100vh` is the *large* viewport, so ~60-90px of the shell sits permanently under the
browser toolbar with no way to scroll to it. `dvh` is already used in 8 places in this
file — the global shell simply never got it. And there is exactly one width tier
(860px) with **zero** orientation or height queries anywhere outside the rotate gate.

- [ ] **Step 1: Create the tier tokens**

Create `frontend/src/aurora/breakpoints.css`:

```css
/* The tier system. Before this file the app had ONE breakpoint (max-width:860px) and
   no height/orientation queries at all, so a 390px-tall landscape phone was treated
   exactly like a tablet — which is why a 76px bottom bar ate 25% of the screen and
   covered the home CTA.

   861px is NOT a phone/desktop boundary: iPhone 16 Pro (874x402), 15 Pro Max
   (932x430), 15 Plus (926x430) and Pixel 8 Pro (~892) are all WIDER than 861 in
   landscape. Width alone cannot identify a phone — every phone tier below is gated on
   `pointer: coarse` as well, so a wide landscape phone is still treated as a phone. */

/* Any touch device: the real "is this a phone/tablet" test. */
@custom-media --touch (pointer: coarse);
/* Phone portrait. */
@custom-media --phone-portrait (max-width: 640px) and (pointer: coarse);
/* Phone landscape — keyed on HEIGHT + coarse pointer, never width. */
@custom-media --phone-landscape (max-height: 480px) and (pointer: coarse);
/* Any phone, either orientation. */
@custom-media --phone (max-width: 640px) and (pointer: coarse), (max-height: 480px) and (pointer: coarse);
/* Tablet / narrow desktop window — the legacy 860px tier, retained. */
@custom-media --tablet (max-width: 860px);
```

> **Note for the implementer:** verify `@custom-media` support in this Tailwind 4 /
> PostCSS pipeline **before** relying on it — run a build and confirm the queries
> survive into `.next/static/css/*.css`. If they do not, do **not** add a plugin for
> it: write the raw queries inline instead and keep this file as the single documented
> reference for what the tiers are. The tiers matter; the syntax sugar does not.

- [ ] **Step 2: Import it**

In `frontend/src/styles/index.css`, add the import **above** the `aurora.css` import so
the tokens are defined before use.

- [ ] **Step 3: dvh the shell**

In `frontend/src/aurora/aurora.css` change `100vh` → `100dvh` at:
- `:8` `.aurora-shell { height: 100dvh; }`
- `:19` `.aurora-main { height: 100dvh; }`
- `:99` `.aurora-rail { height: 100dvh; }`

Leave the `.rotate-gate` (already dvh from Task 2) and the 8 existing dvh uses alone.

- [ ] **Step 4: Verify no regression**

```bash
cd frontend && npm run typecheck && npx next build --webpack
```
Expected: both pass. Then re-run `node tests/fixed_overlay_assert.mjs http://127.0.0.1:3100`
— still passing.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/breakpoints.css frontend/src/styles/index.css frontend/src/aurora/aurora.css
git commit -m "feat(css): real breakpoint tiers + dvh shell

One 860px tier and zero height/orientation queries meant a 390px-tall landscape phone
was styled as a tablet. Tiers are gated on pointer:coarse, not width alone: 861px sits
inside the landscape-phone range (15 Pro Max is 932 wide in landscape), so width can
never identify a phone. Shell moves 100vh -> 100dvh; vh resolves to the large viewport
on mobile, parking ~60-90px of an overflow:hidden shell under the browser toolbar."
```

---

## Phase B — Shell

### Task 4: A bottom bar that fits, and landscape that breathes

**Files:**
- Modify: `frontend/src/aurora/aurora.css:259` (the `min-width:861px` rail tier), `:329-351` (mobile bar), `:335` (scroll reserve)

**Why (measured):** 5 student destinations sum to ≈420-450px against 374px of usable
width at 390px → "Leaderboard" is pushed into an `overflow-x: auto` strip with no
scrollbar on iOS and no affordance. Trainers get a 6th item and a second section.
`padding-bottom: 76px` under-measures the real bar (≈98px incl. `env(safe-area-inset-bottom)`),
so the last ~22px of every page hides behind it. In landscape the bar eats ~25% of a
390px viewport. And `@media (min-width: 861px)` hands landscape phones ≥861px the
hover-only desktop rail.

- [ ] **Step 1: Write the failing nav test**

Create `frontend/tests/mobile_nav_assert.mjs`:

```js
/* The bottom bar must fit every destination at every phone size, in both
   orientations, with real tap targets — and a phone must NEVER get the hover-only
   desktop rail (861px sits inside the landscape-phone width range). */
import { chromium } from "playwright";
import { student, admin, seededContext } from "./_mocks.mjs";
import { VIEWPORTS } from "./_viewports.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3100";
const ok = (m) => console.log("PASS:", m);
const die = (m) => { console.error("FAIL:", m); process.exit(1); };
const b = await chromium.launch();

for (const who of [{ u: student, n: "student" }, { u: admin, n: "admin" }]) {
  for (const v of VIEWPORTS) {
    const ctx = await seededContext(b, base, who.u, { width: v.width, height: v.height }, { hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    await p.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1200);

    const r = await p.evaluate(() => {
      const rail = document.querySelector(".aurora-rail");
      if (!rail) return { railMissing: true };
      const items = [...document.querySelectorAll(".aurora-navitem")];
      return {
        railVisible: getComputedStyle(rail).display !== "none",
        railX: rail.getBoundingClientRect().x,
        items: items.map((el) => {
          const b = el.getBoundingClientRect();
          return { txt: (el.textContent || "").trim(), x: b.x, right: b.right, w: b.width, h: b.height };
        }),
        vw: window.innerWidth,
      };
    });

    if (r.railMissing) die(`${who.n} ${v.tag}: no .aurora-rail at all — phone has zero navigation`);
    // A phone must never be parked off-screen behind a hover-only reveal.
    if (r.railX < -1) die(`${who.n} ${v.tag}: rail is parked off-screen at x=${r.railX} (hover-only desktop rail on a touch device)`);
    for (const it of r.items) {
      if (it.right > r.vw + 1 || it.x < -1) die(`${who.n} ${v.tag}: nav item "${it.txt}" clipped (x=${it.x} right=${it.right} vw=${r.vw})`);
      if (it.h < 44) die(`${who.n} ${v.tag}: nav item "${it.txt}" is ${it.w}x${it.h} — under the 44px touch minimum`);
    }
    ok(`${who.n} ${v.tag}: ${r.items.length} nav items, all on-screen and >=44px tall`);
    await ctx.close();
  }
}
console.log("ALL MOBILE-NAV ASSERTIONS PASSED");
await b.close();
```

- [ ] **Step 2: Run it — watch it fail**

```bash
node mobile_nav_assert.mjs http://127.0.0.1:3100
```
Expected: **FAIL** — at `portrait` with `nav item "Leaderboard" clipped`, and at
`landscape-wide` (932×430) with `rail is parked off-screen` (the 861px tier).

- [ ] **Step 3: Re-gate the desktop rail on pointer, not width**

`frontend/src/aurora/aurora.css:259` — change `@media (min-width: 861px)` to also
require a fine pointer, so a wide landscape phone never receives a hover-only rail:

```css
/* The hover-reveal rail is desktop-only. Width alone cannot express that: a 15 Pro Max
   in landscape is 932px wide. Gate on `pointer: fine` — touch has no hover, so a phone
   that landed here would have a 26px edge handle as its ONLY navigation. */
@media (min-width: 861px) and (pointer: fine) {
```

And `:329` — hide the edge handle on any coarse pointer, not just ≤860px:

```css
@media (max-width: 860px), (pointer: coarse) { .aurora-rail-handle { display: none; } }
```

- [ ] **Step 4: Make the mobile bar tier match, and fit**

`frontend/src/aurora/aurora.css:332` — widen the mobile-bar tier to every touch device
(so 861-932px landscape phones get the bar), and make the items fit by flexing them
evenly instead of letting them overflow into a scroll strip:

```css
@media (max-width: 860px), (pointer: coarse) {
  .aurora-shell { flex-direction: column; --rail-w: 0px; }
  .aurora-main { order: 0; height: 0; flex: 1; }
  /* Reserve the bar's REAL height (was a magic 76px that under-measured by ~22px, so
     the last of every page hid behind the bar). --bar-h is the single source of truth. */
  .aurora-rail { --bar-h: calc(56px + env(safe-area-inset-bottom)); }
  .aurora-main-scroll { padding-bottom: calc(56px + env(safe-area-inset-bottom)); }
  .aurora-rail {
    order: 1;
    position: fixed; bottom: 0; left: 0; right: 0;
    width: 100%; height: auto;
    flex-direction: row; gap: 2px;
    /* viewportFit:"cover" means the notch occupies a full vertical edge in landscape —
       inset left/right or it physically occludes the end items. */
    padding: 4px calc(8px + env(safe-area-inset-left)) calc(4px + env(safe-area-inset-bottom)) calc(8px + env(safe-area-inset-right));
    border-right: none;
    border-top: 1px solid var(--hairline);
    box-shadow: 0 -6px 24px rgba(31, 31, 31, 0.06);
  }
  .aurora-rail-top, .aurora-rail-label { display: none; }
  /* Flex evenly to fit — never an overflow-x strip (no scrollbar on iOS, no affordance,
     and it silently hid Leaderboard). */
  .aurora-rail-scroll { flex-direction: row; gap: 2px; overflow: visible; padding: 0; flex: 1; }
  .aurora-rail-section { flex-direction: row; gap: 2px; flex: 1; }
  .aurora-navitem {
    flex: 1 1 0; min-width: 0;
    flex-direction: column; gap: 2px;
    padding: 6px 2px; min-height: 44px;
    font-size: 10px; font-weight: 600;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .aurora-navitem svg { width: 20px; height: 20px; flex: none; }
}

/* Landscape phone: the bar was eating ~25% of a 390px-tall viewport and covering the
   home CTA. Go icon-only and slim — width is abundant here, height is not. */
@media (max-height: 480px) and (pointer: coarse) {
  .aurora-rail { --bar-h: calc(40px + env(safe-area-inset-bottom)); }
  .aurora-main-scroll { padding-bottom: calc(40px + env(safe-area-inset-bottom)); }
  .aurora-navitem { min-height: 40px; font-size: 0; gap: 0; padding: 4px 2px; }
  .aurora-navitem svg { width: 22px; height: 22px; }
}
```

> `font-size: 0` hides the label while keeping it in the a11y tree; the `aria-label` on
> `.aurora-navitem` (AtlasRail.tsx) carries the name. Verify that the rail items *have*
> an accessible name before shipping this — if they rely on the visible text node, add
> an explicit `aria-label` in Task 5 rather than dropping the name.

- [ ] **Step 5: Rebuild, re-run**

```bash
cd frontend && npx next build --webpack && rm -rf .next/standalone/.next/static .next/standalone/public \
  && cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public
# restart server
cd tests && node mobile_nav_assert.mjs http://127.0.0.1:3100
```
Expected: **ALL MOBILE-NAV ASSERTIONS PASSED** (student and admin, all 4 phone viewports).

- [ ] **Step 6: Confirm desktop is untouched**

```bash
node aurora_assert.mjs http://127.0.0.1:3100
```
Expected: PASS. The rail must still hover-reveal at 1440×900.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/aurora/aurora.css frontend/tests/mobile_nav_assert.mjs
git commit -m "fix(nav): a bottom bar that fits every phone, in both orientations

Five destinations summed to ~420-450px against 374px usable at 390px, so Leaderboard
was pushed into an overflow-x strip with no iOS scrollbar and no affordance; admins got
a 6th item. Items now flex evenly with a 44px minimum.

The rail tier is re-gated on pointer, not width: 861px sits INSIDE the landscape-phone
range (15 Pro Max is 932 wide), so iPhone 16 Pro / 15 Pro Max / 15 Plus / Pixel 8 Pro in
landscape were receiving the hover-only desktop rail — and touch has no hover, leaving a
26px edge handle as the entire navigation.

Scroll reserve now tracks the real bar height incl. safe-area (76px under-measured by
~22px). Landscape goes icon-only: the bar was eating ~25% of a 390px viewport and
covering the home CTA. Notch insets applied left/right — viewportFit:cover means the
notch occupies a full vertical edge in landscape."
```

---

### Task 5: Restore brand + sign-out on mobile

**Files:**
- Modify: `frontend/src/aurora/components/AtlasRail.tsx:57,92-115`
- Modify: `frontend/src/aurora/aurora.css:346`

**Why:** `.aurora-rail-foot { display: none }` at ≤860px hides `.aurora-profile` **and**
`.aurora-signout`. The only other logout is `EyeconMenu` (rendered solely by
`Dashboard.tsx:102`), so on `/flashcards`, `/chat`, `/cases`, `/leaderboard`,
`/analytics` and `/studio` a phone user **has no sign-out at all** — on a shared
institutional device a trainee cannot end their session without first navigating to
`/dashboard`. The same rule hides `.aurora-rail-top` (Wordmark) and the `.aurora-snec`
mark, so several phone routes render **zero brand marks** — an already-shipped
violation of the Branding lock (`docs/design-locks.md:433-447`: "every rail-less
surface renders BOTH an EyeBot mark and a SNEC mark").

- [ ] **Step 1: Decide the placement, then implement**

These two are the same problem — the bottom bar has no room for brand or profile. The
resolution is a **sign-out + brand affordance that lives outside the bar**. Do NOT
invent a new pattern: the app already has one — `EyeconMenu` (the avatar menu with
sign-out) at `Dashboard.tsx:102`. Promote it into the shell so it is available on every
route.

Read `frontend/src/aurora/components/home/EyeconMenu.tsx` before writing code; reuse it
rather than duplicating a sign-out.

- [ ] **Step 2: Write the failing test**

Create `frontend/tests/mobile_signout_assert.mjs`:

```js
/* Sign-out must be reachable on EVERY shell route on a phone. .aurora-rail-foot is
   display:none at <=860px and the only other logout lives on /dashboard, so a shared
   -device trainee on /flashcards had no way to end their session. */
import { chromium } from "playwright";
import { student, seededContext } from "./_mocks.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3100";
const ok = (m) => console.log("PASS:", m);
const die = (m) => { console.error("FAIL:", m); process.exit(1); };
const b = await chromium.launch();
const ROUTES = ["/dashboard", "/chat", "/cases", "/flashcards", "/leaderboard"];

const ctx = await seededContext(b, base, student, { width: 390, height: 844 }, { hasTouch: true, isMobile: true });
for (const route of ROUTES) {
  const p = await ctx.newPage();
  await p.goto(base + route, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1500);
  const reachable = await p.evaluate(() => {
    const hit = [...document.querySelectorAll("button, a")].some((el) => {
      const t = (el.textContent || "") + " " + (el.getAttribute("aria-label") || "");
      if (!/sign out|log out|logout/i.test(t)) return false;
      return el.getBoundingClientRect().width > 0;
    });
    // or an avatar/profile menu that opens one
    const menu = document.querySelector('[data-testid="eyecon-menu"], .hm-eyeconmenu, .aurora-profile');
    return hit || !!(menu && menu.getBoundingClientRect().width > 0);
  });
  if (!reachable) die(`${route}: no sign-out reachable on a phone`);
  ok(`${route}: sign-out reachable`);
  await p.close();
}
console.log("ALL MOBILE-SIGNOUT ASSERTIONS PASSED");
await b.close();
```

- [ ] **Step 3: Run it — watch it fail**

```bash
node mobile_signout_assert.mjs http://127.0.0.1:3100
```
Expected: **FAIL** on `/chat` (or the first non-dashboard route).

- [ ] **Step 4: Implement, re-run until green, then verify the brand lock**

After implementing, confirm every phone route renders both an EyeBot mark and a SNEC
mark per `docs/design-locks.md:433-447`, and run `node logo_mark_assert.mjs http://127.0.0.1:3100`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/components/AtlasRail.tsx frontend/src/aurora/aurora.css frontend/tests/mobile_signout_assert.mjs
git commit -m "fix(shell): restore sign-out and the co-brand on phones

.aurora-rail-foot{display:none} at <=860px hid both the sign-out and the SNEC/EyeBot
lockup. The only other logout is on /dashboard, so a phone user on /flashcards, /chat,
/cases, /leaderboard or /analytics could not end their session — a real problem on a
shared institutional device. Several phone routes also rendered zero brand marks,
violating the Branding lock (design-locks.md:433-447)."
```

---

## Phase C — OSCE

### Task 6: Make landscape actually deliver the triptych

**Files:**
- Modify: `frontend/src/aurora/aurora.css:1336-1348` (the `max-width:880px` block), `:1345`

**Why (a real contradiction):** the gate forces the student into landscape *for* the
three-pane triptych — and then `aurora.css:1345` sets
`.aurora-station-grid[data-eyebot="true"] { grid-template-columns: 1fr }` at
`max-width: 880px`. A landscape phone is 844-932px wide, so it lands in that block and
**gets a single stacked column anyway**. The gate's entire stated purpose is currently
unachievable on any phone: rotate, and receive the layout you rotated to escape.

Additionally `:1344` `.aurora-station-thread { min-height: 300px }` and `:1347`
`.aurora-eyebot-thread { min-height: 220px }` = 520px of stacked minimums in a
390px-tall viewport.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/station_landscape_assert.mjs`:

```js
/* The gate forces landscape FOR the triptych. Landscape must therefore actually
   deliver side-by-side panes — not the stacked single column that max-width:880px
   hands every landscape phone (844-932px wide). */
import { chromium } from "playwright";
import { student, seededContext } from "./_mocks.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3100";
const ok = (m) => console.log("PASS:", m);
const die = (m) => { console.error("FAIL:", m); process.exit(1); };
const b = await chromium.launch();

for (const v of [{ tag: "landscape-narrow", width: 844, height: 390 }, { tag: "landscape-wide", width: 932, height: 430 }]) {
  const ctx = await seededContext(b, base, student, { width: v.width, height: v.height }, { hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.goto(base + "/cases/C001", { waitUntil: "domcontentloaded" });
  await p.waitForSelector('[data-testid="station"]', { timeout: 15000 });
  await p.waitForTimeout(1200);

  if (await p.locator(".rotate-gate").isVisible()) die(`${v.tag}: gate must not show in landscape`);

  const r = await p.evaluate(() => {
    const grid = document.querySelector(".aurora-station-grid");
    const cols = getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length;
    const aside = document.querySelector(".aurora-station-aside")?.getBoundingClientRect();
    const main = document.querySelector(".aurora-station-main")?.getBoundingClientRect();
    return { cols, aside, main, vh: window.innerHeight, docH: document.documentElement.scrollHeight };
  });
  if (r.cols < 2) die(`${v.tag}: station collapsed to ${r.cols} column — the gate forced landscape FOR the triptych`);
  if (r.aside && r.main && r.main.x < r.aside.right - 1) die(`${v.tag}: panes are stacked, not side-by-side`);
  ok(`${v.tag}: station is ${r.cols} columns, panes side-by-side`);
  await ctx.close();
}
console.log("ALL STATION-LANDSCAPE ASSERTIONS PASSED");
await b.close();
```

- [ ] **Step 2: Run it — watch it fail**

```bash
node station_landscape_assert.mjs http://127.0.0.1:3100
```
Expected: **FAIL** — `landscape-narrow: station collapsed to 1 column`.

- [ ] **Step 3: Re-gate the stack on height, not width**

The `max-width: 880px` block exists to stack the triptych when there is not enough
*width*. A landscape phone has plenty of width and no height. Gate the stack so it
applies to narrow **portrait-ish** viewports only, and give landscape phones the real
triptych with independent pane scroll:

In `frontend/src/aurora/aurora.css:1336`, change the block opener to exclude short
landscape viewports:

```css
/* Stack the triptych only when the viewport is genuinely NARROW — not merely under
   880px. A landscape phone is 844-932px wide, so the old width-only query stacked the
   exact layout the rotate gate forces the student into landscape to reach. */
@media (max-width: 880px) and (min-height: 481px) {
```

Then add a landscape-phone block that keeps three panes and lets each scroll:

```css
/* Landscape phone: width is abundant, height is not (390px). Keep the three panes
   side-by-side and give each its own scroll rather than stacked min-heights (the old
   :1344/:1347 minimums summed to 520px in a 390px viewport). */
@media (max-height: 480px) and (pointer: coarse) {
  .aurora-page-enter:has(.aurora-station) { height: 100%; }
  .aurora-station { height: 100%; overflow: hidden; }
  .aurora-station-grid,
  .aurora-station-grid[data-eyebot="true"] { grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.4fr) minmax(0, 1fr); align-items: stretch; min-height: 0; }
  .aurora-station-aside, .aurora-station-main, .aurora-eyebot { height: 100%; min-height: 0; overflow: hidden; }
  .aurora-station-clscroll, .aurora-station-thread, .aurora-eyebot-thread { min-height: 0; overflow-y: auto; flex: 1; }
  .aurora-station-head { padding-block: 4px; }
}
```

- [ ] **Step 4: Rebuild, re-run both station tests**

```bash
cd frontend && npx next build --webpack && rm -rf .next/standalone/.next/static .next/standalone/public \
  && cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public
# restart server, warm the dynamic route first (cold first-hit >15s breaks Playwright waits):
curl -s -o /dev/null http://127.0.0.1:3100/cases/C001
cd tests && node station_landscape_assert.mjs http://127.0.0.1:3100 && node station_assert.mjs http://127.0.0.1:3100
```
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/aurora.css frontend/tests/station_landscape_assert.mjs
git commit -m "fix(osce): landscape actually delivers the triptych

The rotate gate forces a phone into landscape FOR the three-pane station, and then
max-width:880px stacked it to a single column anyway — a landscape phone is 844-932px
wide, so it landed in that block. Rotating gave you the layout you rotated to escape.

Stack is now gated on min-height:481px (genuinely narrow portrait viewports); landscape
phones keep three panes with independent per-pane scroll instead of 520px of stacked
min-heights in a 390px-tall viewport."
```

---

## Phase D — Surfaces

Each task below follows the same shape: **write the assert → watch it fail → refit →
watch it pass → confirm desktop unchanged → commit.** The shared invariants are in
Task 12's `mobile_audit.mjs`; per-surface tasks fix what that sweep reports.

### Task 7: Home

**Files:** `frontend/src/aurora/home.css`, `frontend/src/aurora/components/home/FeatureCarousel.tsx`, `components/home/GreetingHero.tsx`

**Why (measured):** `home.css` has only `max-width:900px` and `max-width:560px` — zero
orientation, `max-height`, or `dvh`. Specifically:
- `:241` `.hm-fcard { width: 466px; height: 300px; margin-left: -233px }` — a **466px**
  card in a 390px viewport.
- `:71` `.hm-greet { padding: 34px 44px 30px }` never re-declared; `:392`
  `.hm-greet h1 { font-size: 37px; max-width: 76% }` → the 6-line headline.
- `:171` `.hm-eyeconloop-v { object-fit: cover }` + `:404` `object-position: 88% 45%` →
  the art crops under the copy (the collision).
- `:31-36` `.hm-top` / `.hm-chip` — **zero** overrides in either block → the level pill
  overlaps the wordmark.
- `FeatureCarousel.tsx:48` `const SX = 346` is a hardcoded step with `[]` deps at `:148`
  → **it never recomputes on resize or orientation change**.
- `FeatureCarousel.tsx:129` `onUp` with `moved` set only at `:118`, and **no
  `touch-action`** anywhere on `.hm-carousel`/`.hm-ring3d` → drag/tap conflict on touch.

**Decision (user-confirmed):** keep the video; give it a contained band in portrait with
the copy in clear space. No new/paid asset.

- [ ] **Step 1:** Write `frontend/tests/home_mobile_assert.mjs` asserting, at every
  `VIEWPORTS` entry: no element extends past the viewport; `.hm-greet h1` occupies
  ≤40% of viewport height; the primary CTA (`.hm-cta`, verify the real selector) is
  fully visible and **not** covered by `.aurora-rail`; `.hm-fcard` width ≤ viewport
  width − 32.
- [ ] **Step 2:** Run it — expect FAIL (CTA covered at 844×390; `.hm-fcard` 466 > 358).
- [ ] **Step 3:** Refit `home.css`: phone type ramp for `.hm-greet h1`; `.hm-fcard`
  sized from the viewport; `.hm-top` wrapping; the greeting art in a contained band in
  portrait.
- [ ] **Step 4:** Fix `FeatureCarousel.tsx`: derive `SX` from the measured card width and
  recompute on `resize`/`orientationchange` (the `[]` deps at `:148` are the bug); add
  `touch-action: pan-y` to the carousel. **Do not regress the stage-resolved pick** —
  `docs/design-locks.md` records this exact component shipping broken when taps were
  resolved per-card.
- [ ] **Step 5:** Re-run until green; run `greeting_assert.mjs` and confirm desktop
  1440×900 is pixel-identical.
- [ ] **Step 6:** Commit.

### Task 8: Tutor

**Files:** `frontend/src/aurora/screens/Tutor.tsx:32-38,276-280`, `frontend/src/aurora/aurora.css:1511-1512,1529,1560,1570-1573,1653-1679`

**Why:** the user's explicit ask (remove the shortcut questions on mobile), plus the
audit's blockers: `.aurora-msg-bubble` and `.aurora-msg-think-text` are **23.5px** on a
phone; `.aurora-chat-foot` has no `env(safe-area-inset-bottom)` and `:1621-1624` sets
`.aurora-shell-immersive .aurora-main-scroll { padding-bottom: 0 }` at ≤860px, so the
composer sits under the home indicator; `.tl-iris` is a fixed 216×216.

- [ ] **Step 1:** Write `frontend/tests/tutor_mobile_assert.mjs`: at phone viewports
  `.aurora-chat-followups` is not visible; at 1440×900 it **is** visible (desktop
  unchanged); `.aurora-msg-bubble` computed `font-size` ≤ 17px on phone;
  `.aurora-chat-back` ≥44×44; the composer's bottom edge sits above
  `env(safe-area-inset-bottom)`.
- [ ] **Step 2:** Run it — expect FAIL.
- [ ] **Step 3:** Hide the chips at phone tiers via CSS (SSR-safe, no hydration branch —
  do **not** add a JS `isMobile` check):

```css
/* The 5 suggestion chips wrap to 3-4 rows above the composer on a 390px screen and
   crowd out the thread. Desktop keeps them. User-directed, 2026-07-17. */
@media (max-width: 640px) and (pointer: coarse), (max-height: 480px) and (pointer: coarse) {
  .aurora-chat-followups { display: none; }
}
```

- [ ] **Step 4:** Add a phone type ramp for the bubbles; safe-area the composer; size
  `.tl-iris` fluidly.
- [ ] **Step 5:** Re-run until green; run `tutor_greeting_assert.mjs`,
  `tutor_sessions_assert.mjs`, and `aurora_assert.mjs` (the `.aurora-chat` background
  must keep a `linear-gradient` — `aurora_assert` checks this).
- [ ] **Step 6:** Commit.

### Task 9: Flashcards

**Files:** `frontend/src/aurora/aurora.css:2368,2401-2404,2500,2506,2523,2530,2560,2570,2581,2748,2805-2806`

**Why:** the only mobile block is `@media (max-width: 639px)` — so a **844-932px
landscape phone gets desktop sizing**, against `.fan-stage { height: clamp(496px, 68dvh, 640px) }`
(a 496px floor in a 390px-tall viewport), `.fan-card { width: 348px; height: 452px }`,
and `.flash-card { min-height: min(74vh, 700px) }`.

**Design lock — read `docs/design-locks.md` flashcards section first.** The coverflow's
**depth (`perspective: 1200px` + front/back Z split)**, **windowing (front ± 3)**, and
**stage-resolved pick** are mandatory and have each shipped broken before. This task
changes **size only** — never the projection maths.

- [ ] **Step 1:** Write `frontend/tests/flashcards_mobile_assert.mjs`: at every
  `VIEWPORTS` entry the `.fan-stage` fits the viewport height; the front card is the
  largest painted card (depth invariant intact); a tap in full motion opens a topic
  (the locked stage-resolved pick); `.flash-card` fits without clipping.
- [ ] **Step 2:** Run it — expect FAIL at `landscape-narrow`/`landscape-wide`.
- [ ] **Step 3:** Add a `(max-height: 480px) and (pointer: coarse)` tier sizing
  `.fan-stage`, `.fan-card` (via `getCardWidth`), `.flash-card`, `.flash-options` and
  `.flash-meter` off the short axis. Retire `max-width: 639px` as the sole gate.
- [ ] **Step 4:** Reclaim the ~200px of dead space under the stage in portrait.
- [ ] **Step 5:** Re-run; run `flashcards_forfeit_assert.mjs` and confirm the picker
  still reads correctly at the **real 26-topic** syllabus (the harness mock is the full
  OA syllabus for exactly this reason — the lock demands it).
- [ ] **Step 6:** Commit.

### Task 10: Leaderboard

**Files:** `frontend/src/aurora/leaderboard.css:59,63-64,109-110,209-222`

**Why:** `.lb-title { font-size: 9.8cqw }` against `.lb-head { container-type: inline-size }`;
`.lb-podium` + `.lb-ped { aspect-ratio: 4/5 }` squeezing 3 plinths into 390px.

- [ ] **Step 1:** Write `frontend/tests/leaderboard_mobile_assert.mjs`: at every
  `VIEWPORTS` entry nothing overflows; all 3 plinths are fully visible; the hero title
  does not clip.
- [ ] **Step 2:** Run it — expect FAIL.
- [ ] **Step 3:** Refit. The podium and the arcade hero identity are locked — size only.
- [ ] **Step 4:** Re-run; run `leaderboard_logic.mjs`.
- [ ] **Step 5:** Commit.

### Task 11: Analytics

**Files:** `frontend/src/aurora/aurora.css:2021,2024,2082-2086,2142`, `components/analytics/*`

**Why:** `.aurora-modal { max-height: 88vh }` (vh, not dvh); `.aurora-field`/`.aurora-select`
tap targets; `:2082-2086` `@media (max-width: 700px)` keys touch targets on **width**, so a
landscape phone misses them; wide tables clip (row label to `right: 959`).

- [ ] **Step 1:** Write `frontend/tests/analytics_mobile_assert.mjs`: charts/tables scroll
  inside their own container rather than clipping; all controls ≥44px at every
  `VIEWPORTS` entry; the modal fits.
- [ ] **Step 2:** Run it — expect FAIL.
- [ ] **Step 3:** Refit: `overflow-x: auto` containers for charts/tables; re-gate the
  touch-target block on `pointer: coarse` rather than `max-width: 700px`; `88vh` → `88dvh`.
- [ ] **Step 4:** Re-run; run `analytics_charts_logic.mjs`.
- [ ] **Step 5:** Commit.

---

## Phase E — Verify

### Task 12: The full sweep + desktop-unchanged proof

**Files:** Modify `frontend/tests/mobile_audit.mjs`

- [ ] **Step 1: Rewrite `mobile_audit.mjs` to sweep the whole matrix**

Every route × every `VIEWPORTS` entry, asserting spec §5.1: no element extends past the
viewport; no interactive target under 44×44 (with an explicit, named allow-list — an
unexplained exception is a bug, not a waiver); no CTA covered by `.aurora-rail`; no
horizontal document overflow.

> **Important:** do **not** assert on `document.scrollWidth > clientWidth` alone.
> `.aurora-main-scroll` sets `overflow-x: hidden`, so that check reads `false` on every
> route today **while content is being clipped**. Measure element rects against the
> viewport instead — that is what caught the real overflow.

- [ ] **Step 2: Run the full gate set**

```bash
cd C:/Users/caleb/AppData/Local/Temp/claude/mobile-wt
python -m pytest -q
cd frontend && npm run typecheck && npx next build --webpack
cd tests
for t in fixed_overlay_assert rotate_gate_assert station_landscape_assert mobile_nav_assert \
         mobile_signout_assert home_mobile_assert tutor_mobile_assert flashcards_mobile_assert \
         leaderboard_mobile_assert analytics_mobile_assert mobile_audit \
         aurora_assert station_assert logo_mark_assert greeting_assert; do
  echo "── $t"; node $t.mjs http://127.0.0.1:3100 || echo "FAILED: $t";
done
```
Expected: every one PASS.

- [ ] **Step 3: Prove desktop is unchanged (spec §5.5)**

Capture all 6 routes at 1440×900 on `origin/main` and on `mobile-remake`; compare. Any
difference is a bug in this plan, not an acceptable cost.

- [ ] **Step 4: Delete the throwaway repro scripts**

```bash
rm frontend/tests/_repro_gate.mjs frontend/tests/_repro_gate2.mjs frontend/tests/_mobile_shots.mjs
```
(`_viewports.mjs` stays — it is shared by the asserts.)

- [ ] **Step 5: Update the design-lock ledger**

Add a "Mobile layout" entry to `docs/design-locks.md` recording that phone layout is now
a specified criterion, with the tier system and the acceptance criteria from spec §5, so
the next session refines it instead of rebuilding it. Note the two **pre-existing lock
violations** this work resolves (mobile co-brand absence) and the one it makes explicit
(the Global-language lock's "72px → 248px hover rail" wording is already stale after
commit 5e6019f and does not apply to touch).

- [ ] **Step 6: Ship**

```bash
git fetch origin
git rev-list --left-right --count origin/main...mobile-remake   # confirm no surprise drift
```
Then per CLAUDE.md merge to `main` and push — **only with every gate green**. `main`
auto-deploys to Render production. No new env vars or migrations are introduced by this
plan, so no out-of-band coordination is required.

---

## Self-review

**Spec coverage:** §0 base hazard → Working context. §1 keystone → Task 1. §2 gate →
Tasks 1-2. §3 tiers → Task 3. §4 shell/nav → Tasks 4-5; home → 7; tutor → 8; OSCE → 6;
flashcards → 9; leaderboard → 10; analytics → 11. §5 acceptance → Task 12 (5.1 sweep,
5.2 gate, 5.3 fixed-overlay, 5.4 tutor chips, 5.5 desktop, 5.6 locks, 5.7 gates). §6
testing → tests-first in every task.

**Beyond the spec** (found by the audit, folded in): the 861px landscape-phone tier
(Task 4), mobile sign-out + co-brand (Task 5), and the OSCE landscape contradiction
(Task 6). These are genuine blockers the spec did not know about; Task 6 in particular
means the gate the user asked us to fix was guarding a layout that never arrived.

**Naming consistency:** `VIEWPORTS`/`DESKTOP` from `_viewports.mjs` used in Tasks 1, 4,
7, 9, 10, 11, 12. `--bar-h` defined and consumed in Task 4 only. `seededContext(browser,
base, user, viewport, opts)` matches `_mocks.mjs`.

**Known soft spots — resolve at implementation time, do not guess:**
- `@custom-media` (Task 3) may not survive this PostCSS pipeline. Flagged inline with a
  fallback: write raw queries, keep the file as documentation.
- Task 4 Step 4 `font-size: 0` depends on rail items having an accessible name from
  something other than the visible text node. Flagged inline: verify, add `aria-label`
  if not.
- Task 5's placement is deliberately not pre-decided — reuse `EyeconMenu` rather than
  inventing a second sign-out.
- Task 7's `.hm-cta` selector is unverified; confirm against `Dashboard.tsx` before
  writing the assert.
