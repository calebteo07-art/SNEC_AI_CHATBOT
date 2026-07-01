# Warm-Premium Homepage Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dark, cluttered student dashboard with a warm-premium bento homepage — rotating teasing greeting + Iris mascot, streak/level/XP gamification, one-click feature cards, milestone ladder, and real-data stat tiles.

**Architecture:** Rewrite `aurora/screens/Dashboard.tsx` as a bento composed of small focused components under `aurora/components/home/`. A pure, dependency-free `aurora/lib/greeting.ts` powers the ever-changing greeting. All numbers come from the existing `useProgress` → `/api/progress` contract; no backend change in v1. Warm theme is scoped to a new `.aurora-home` root so other screens are untouched.

**Tech Stack:** Next 16 (App Router, `output: standalone`), React 19, TypeScript, plain CSS (`aurora/home.css`), `next/font/google` (add Bricolage Grotesque), Playwright + Node type-stripping harnesses. Mascot via `google-genai` (`gemini-3-pro-image`).

**Design source of truth:** the approved mock (scratch) `mock7.html` and spec `docs/superpowers/specs/2026-07-01-homepage-redesign-design.md`. Design tokens below are copied from that mock.

**Design tokens (port verbatim into `home.css`, scoped to `.aurora-home`):**
```
--cream:#F1E3CF; --card:#FFFCF6; --ink:#2B2431; --ink2:#6D6474; --ink3:#A99FAB; --line:#EBDFCB;
--violet:#7C5CF6; --violet-d:#6D28D9; --teal:#12B5A0; --teal-d:#0C8F7E;
--amber:#FB923C; --coral:#F4557A; --flame1:#FB8C28; --flame2:#F0431F;
--sh:0 1px 2px rgba(80,50,20,.05), 0 12px 28px -14px rgba(90,58,24,.20);
--sh-lg:0 2px 6px rgba(80,50,20,.07), 0 28px 54px -24px rgba(90,58,24,.30);
--r:24px;
warm canvas: radial peach/rose/lilac bleeds over --cream (see mock body background)
Gemini logo gradient: #4285F4 -> #A25AF6 -> #EC4899
Feature gradients: tutor #A78BFA->#7C3AED · vp #2DD4BF->#0D9488 · flash #FDBA74->#F43F5E
```

**Component/file map:**
| File | Responsibility |
|------|----------------|
| `frontend/src/app/layout.tsx` (modify) | Add Bricolage Grotesque via next/font, expose `--font-bricolage-src` |
| `frontend/src/aurora/home.css` (create) | All home styles, scoped under `.aurora-home`; imported by `home.css` include chain |
| `frontend/src/styles/index.css` (modify) | `@import` the new home.css (or import in Dashboard) |
| `frontend/src/aurora/aurora.css` (modify) | Remove the dark `.aurora-dash` canvas rules; add `.aurora-main:has(.aurora-home)` warm canvas |
| `frontend/src/aurora/lib/greeting.ts` (create) | Pure greeting engine (no imports) |
| `frontend/src/aurora/components/home/HomeIcons.tsx` (create) | Inline SVG `<symbol>` sprite + `<Icon>` |
| `frontend/src/aurora/components/home/GreetingHero.tsx` (create) | Greeting + level-up bar + CTAs + Iris |
| `frontend/src/aurora/components/home/StreakTile.tsx` (create) | Flame + count + week + daily-goal ring + next tier |
| `frontend/src/aurora/components/home/FeatureCard.tsx` (create) | One gradient feature card |
| `frontend/src/aurora/components/home/MilestoneLadder.tsx` (create) | Tier ladder done/next/locked |
| `frontend/src/aurora/components/home/WeekStats.tsx` (create) | Four backed stat tiles |
| `frontend/src/aurora/screens/Dashboard.tsx` (rewrite) | Compose bento; keep post-session toast/confetti |
| `frontend/public/brand/iris.png` (create) | Chosen mascot, true alpha, optimized |
| `tools/media/strip_checkerboard.py` (create) | Reproducible checkerboard→alpha strip |
| `frontend/tests/greeting_assert.mjs` (create) | Unit-test the greeting engine (node --experimental-strip-types) |
| `frontend/tests/aurora_assert.mjs` (modify) | Swap old dashboard testids for the new structure |

**Retire after cutover:** `GradientHero`, `StreakBand`, `StreakBoard`, `GoalRing` usages on the dashboard (delete the components only once nothing else imports them — grep first).

---

### Task 1: Font + warm theme scaffold

**Files:**
- Modify: `frontend/src/app/layout.tsx`
- Create: `frontend/src/aurora/home.css`
- Modify: `frontend/src/styles/index.css` (add `@import "../aurora/home.css";` near the other aurora imports)
- Modify: `frontend/src/aurora/aurora.css` (dark→warm canvas)

- [ ] **Step 1:** In `layout.tsx`, add the font next to the existing ones:
```tsx
import { Inter, JetBrains_Mono, Outfit, Playfair_Display, Bricolage_Grotesque } from "next/font/google";
const bricolage = Bricolage_Grotesque({
  weight: ["500", "600", "700", "800"],
  subsets: ["latin"],
  variable: "--font-bricolage-src",
  display: "swap",
});
```
Add `${bricolage.variable}` to the `<html className=...>` list.

- [ ] **Step 2:** Create `home.css` with the `:root`-level home tokens mapped under `.aurora-home` and a display-font var:
```css
.aurora-home{ --font-home:var(--font-bricolage-src),'Bricolage Grotesque',var(--font-sans),sans-serif;
  --cream:#F1E3CF; --card:#FFFCF6; --ink:#2B2431; --ink2:#6D6474; --ink3:#A99FAB; --line:#EBDFCB;
  --violet:#7C5CF6; --violet-d:#6D28D9; --teal:#12B5A0; --teal-d:#0C8F7E; --amber:#FB923C; --coral:#F4557A;
  --flame1:#FB8C28; --flame2:#F0431F;
  --sh:0 1px 2px rgba(80,50,20,.05),0 12px 28px -14px rgba(90,58,24,.20);
  --sh-lg:0 2px 6px rgba(80,50,20,.07),0 28px 54px -24px rgba(90,58,24,.30); --hr:24px; }
.aurora-home{ max-width:1160px; margin:0 auto; padding:20px 26px 30px; color:var(--ink);
  display:flex; flex-direction:column; gap:14px; }
.aurora-home .disp{ font-family:var(--font-home); }
```

- [ ] **Step 3:** In `aurora.css`, replace the dark dashboard canvas block (`.aurora-main:has(.aurora-dash){…}` and its `.aurora-mesh` overrides at ~lines 66-84) with a warm one keyed on the new root:
```css
.aurora-main:has(.aurora-home){
  background:
    radial-gradient(72% 58% at 6% -8%, #FBDDBE 0%, transparent 54%),
    radial-gradient(64% 54% at 102% -4%, #F7D3C4 0%, transparent 52%),
    radial-gradient(80% 60% at 50% 116%, #EFD7C9 0%, transparent 60%),
    #F1E3CF;
}
.aurora-main:has(.aurora-home) .aurora-mesh{ display:none; }
```

- [ ] **Step 4:** Verify build compiles with an empty home root: temporarily render `<div className="aurora-home"/>` — run `cd frontend && npm run typecheck`. Expected: PASS.

- [ ] **Step 5:** Commit.
```bash
git add frontend/src/app/layout.tsx frontend/src/aurora/home.css frontend/src/styles/index.css frontend/src/aurora/aurora.css
git commit -m "feat(home): warm theme scaffold + Bricolage Grotesque display font"
```

---

### Task 2: Greeting engine (TDD, pure module)

**Files:**
- Create: `frontend/src/aurora/lib/greeting.ts` (NO imports — must be type-strippable in isolation)
- Test: `frontend/tests/greeting_assert.mjs`

- [ ] **Step 1: Write the failing test** `frontend/tests/greeting_assert.mjs`:
```js
import assert from "node:assert";
import { pickGreeting, GREETING_BANK } from "../src/aurora/lib/greeting.ts";

const base = { firstName: "Caleb", track: "OA", hour: 20, streak: 12, doneToday: false,
  missedYesterday: false, xpToNext: 60, goalMet: false, bestStreak: 12 };

// 1) emphasis substring is always inside the title
for (let s = 0; s < 40; s++) {
  const g = pickGreeting(base, s);
  assert.ok(g.title.includes(g.emphasis), `emphasis '${g.emphasis}' not in title '${g.title}'`);
  assert.ok(g.title.length <= 90, `title too long: ${g.title.length}`);
}
// 2) stable for a fixed seed
assert.deepStrictEqual(pickGreeting(base, 7), pickGreeting(base, 7));
// 3) surprise (seed+1) changes the line
assert.notStrictEqual(pickGreeting(base, 7).title, pickGreeting(base, 8).title);
// 4) every bucket reachable
assert.strictEqual(pickGreeting({ ...base, goalMet: true }, 0).bucket, "goalMet");
assert.strictEqual(pickGreeting({ ...base, missedYesterday: true, streak: 0 }, 0).bucket, "comeback");
assert.strictEqual(pickGreeting({ ...base, streak: 10 }, 0).bucket, "streakMilestone");
assert.strictEqual(pickGreeting({ ...base, streak: 2, xpToNext: 40 }, 0).bucket, "nearLevelUp");
assert.strictEqual(pickGreeting({ ...base, streak: 2, xpToNext: 400, hour: 9 }, 0).bucket, "timeOfDay");
console.log("PASS: greeting engine");
```

- [ ] **Step 2: Run to verify it fails**
Run: `cd frontend && node --experimental-strip-types tests/greeting_assert.mjs`
Expected: FAIL (module not found / pickGreeting undefined).

- [ ] **Step 3: Implement** `frontend/src/aurora/lib/greeting.ts`:
```ts
/* Pure, dependency-free greeting engine — an ever-changing, eye-care-flavoured
   teasing hello. No React/imports so it stays unit-testable via node type-strip. */
export type Track = "OA" | "OT" | "PSA";
export interface GreetingCtx {
  firstName: string; track: Track; hour: number; streak: number; doneToday: boolean;
  missedYesterday: boolean; xpToNext: number; goalMet: boolean; bestStreak: number;
}
export type Bucket = "goalMet" | "comeback" | "streakMilestone" | "nearLevelUp" | "timeOfDay" | "generic";
export interface Greeting { bucket: Bucket; eyebrow: string; title: string; emphasis: string; sub: string; }

type Line = { title: string; emphasis: string; sub: string };
const MILESTONES = [3, 5, 7, 10, 14, 20, 30, 50, 75, 100];

export const GREETING_BANK: Record<Bucket, (c: GreetingCtx) => Line[]> = {
  goalMet: (c) => [
    { title: `Goal smashed, ${c.firstName}.`, emphasis: "smashed", sub: "Iris is doing a little victory dance. Come back tomorrow and do it again." },
    { title: `Daily goal: done.`, emphasis: "done", sub: "That is what mastery looks like. The retina salutes you." },
  ],
  comeback: (c) => [
    { title: `The streak forgives, ${c.firstName}.`, emphasis: "forgives", sub: "Iris remembers, though. Two minutes today rebuilds it — let's go." },
    { title: `Welcome back.`, emphasis: "back", sub: "Missed a day, no drama. The cornea kept your seat warm." },
  ],
  streakMilestone: (c) => [
    { title: `${c.streak} days straight, ${c.firstName}.`, emphasis: `${c.streak} days`, sub: "Even the optic nerve is impressed. Don't cool it now." },
    { title: `${c.streak}-day streak. Hot.`, emphasis: "Hot", sub: "That's hotter than a slit-lamp bulb. Keep the fire going." },
  ],
  nearLevelUp: (c) => [
    { title: `${c.xpToNext} XP from levelling up.`, emphasis: `${c.xpToNext} XP`, sub: "That's three flashcards and a coffee. You've got this." },
    { title: `So close, ${c.firstName}.`, emphasis: "close", sub: `Just ${c.xpToNext} XP stands between you and the next level.` },
  ],
  timeOfDay: (c) => {
    const t = c.hour < 12 ? "Morning" : c.hour < 18 ? "Afternoon" : "Evening";
    return [
      { title: `Back already, ${c.firstName}?`, emphasis: "retina", sub: "The retina missed you. Pick up where you left off." },
      { title: `${t}, ${c.firstName}.`, emphasis: c.firstName, sub: "The cornea is watching. Best not to keep it waiting." },
      { title: `Skipping today? Bold.`, emphasis: "Bold", sub: "The optic nerve sees everything. One quick deck, maybe?" },
    ];
  },
  generic: (c) => [
    { title: `Ready when you are, ${c.firstName}.`, emphasis: "Ready", sub: "Those flashcards won't grade themselves." },
  ],
};
// note: timeOfDay[0] deliberately emphasises "retina" (present in its sub-less title? no) —
// keep emphasis a substring of title; "retina" appears via a title variant below.

function bucketFor(c: GreetingCtx): Bucket {
  if (c.goalMet) return "goalMet";
  if (c.missedYesterday && c.streak === 0) return "comeback";
  if (MILESTONES.includes(c.streak)) return "streakMilestone";
  if (c.xpToNext > 0 && c.xpToNext <= 80) return "nearLevelUp";
  if (c.hour >= 0) return "timeOfDay";
  return "generic";
}

export function pickGreeting(c: GreetingCtx, seed: number): Greeting {
  const bucket = bucketFor(c);
  const lines = GREETING_BANK[bucket](c);
  const line = lines[((seed % lines.length) + lines.length) % lines.length];
  const eyebrow = `${{ OA: "Ophthalmic Assistant", OT: "Ophthalmic Technician", PSA: "Patient Service Associate" }[c.track]} · ${c.hour < 12 ? "Good morning" : c.hour < 18 ? "Good afternoon" : "Good evening"}`;
  return { bucket, eyebrow, title: line.title, emphasis: line.emphasis, sub: line.sub };
}
```
NOTE during implementation: ensure every `emphasis` is a literal substring of its `title` (the test enforces this — fix any line that fails rather than weakening the test). Adjust the "retina" line so title contains the emphasis (e.g. title `Back already, ${name}? The retina missed you.` with emphasis `retina`).

- [ ] **Step 4: Run to verify it passes**
Run: `cd frontend && node --experimental-strip-types tests/greeting_assert.mjs`
Expected: `PASS: greeting engine`. (If your Node needs it, the harness also runs under `node --experimental-strip-types`; Node 24 supports type stripping.)

- [ ] **Step 5: Commit.**
```bash
git add frontend/src/aurora/lib/greeting.ts frontend/tests/greeting_assert.mjs
git commit -m "feat(home): tested rotating teasing greeting engine"
```

---

### Task 3: Icon sprite + Icon component

**Files:**
- Create: `frontend/src/aurora/components/home/HomeIcons.tsx`

- [ ] **Step 1:** Port the `<symbol>` sprite from `mock7.html` (ids: `i-eye,i-tutor,i-vp,i-flash,i-flame,i-medal,i-arrow,i-refresh,i-check,i-sun,i-lens,i-eagle,i-spark,i-moon` + the `gem` linearGradient) into a `HomeIconSprite` component that renders one hidden `<svg>` with `<defs>`. Add an `Icon` component:
```tsx
export function Icon({ name, className, gem }: { name: string; className?: string; gem?: boolean }) {
  return (
    <svg className={className ?? "ico"} viewBox="0 0 24 24" aria-hidden
         style={gem ? { stroke: "url(#gem)" } : undefined}>
      <use href={`#i-${name}`} />
    </svg>
  );
}
```
Base `.ico` CSS (add to `home.css`): `.aurora-home .ico{width:24px;height:24px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}` and `.aurora-home .fill{fill:currentColor;stroke:none}`.

- [ ] **Step 2:** `cd frontend && npm run typecheck` → PASS.

- [ ] **Step 3: Commit.**
```bash
git add frontend/src/aurora/components/home/HomeIcons.tsx frontend/src/aurora/home.css
git commit -m "feat(home): bespoke SVG icon sprite + Icon component"
```

---

### Task 4: GreetingHero

**Files:**
- Create: `frontend/src/aurora/components/home/GreetingHero.tsx`

- [ ] **Step 1:** Implement the greeting tile. Props: `{ greeting: Greeting; level: number; rank: string; xpInLevel: number; xpToNext: number; onSurprise: () => void; resumeHref: string }`. Render eyebrow (with `Icon eye`), `<h1 class="disp">` with the emphasis wrapped in `<em>`, sub, a level-up bar (`width: (xpInLevel/500*100)%`), primary CTA (`resumeHref`, `Icon arrow`) + ghost "Surprise me" button (`onClick=onSurprise`, `Icon refresh`), the "a new hello every visit" caption, and `<img class="iris" src="/brand/iris.png" alt="Iris, the EyeBot mascot">`.
Title with emphasis:
```tsx
const [pre, post] = greeting.title.split(greeting.emphasis);
// <h1 class="aurora-home-greet-h1 disp">{pre}<em>{greeting.emphasis}</em>{post}</h1>
```
Add `data-testid="greeting"` to the `<h1>`.

- [ ] **Step 2:** Port the `.greet / .eyebrow / h1 / .sub / .lvl / .lvbar / .cta-row / .btn / .reshuffle / .iris` CSS from `mock7.html` into `home.css`, all prefixed `.aurora-home ` and class-renamed to a `home-` namespace to avoid collisions (e.g. `.home-greet`, `.home-cta`). Include the `@keyframes iris-bob` and its reduced-motion guard:
```css
@media (prefers-reduced-motion: reduce){ .aurora-home .iris{animation:none} }
html[data-motion="reduce"] .aurora-home .iris{animation:none}
```

- [ ] **Step 3:** `npm run typecheck` → PASS.

- [ ] **Step 4: Commit.** `git add … && git commit -m "feat(home): GreetingHero tile with Iris + level-up bar"`

---

### Task 5: StreakTile

**Files:**
- Create: `frontend/src/aurora/components/home/StreakTile.tsx`

- [ ] **Step 1:** Props: `{ detail?: StreakDetail; xpToday: number; dailyGoal: number }` (import the `StreakDetail` type from `@/hooks/useProgress`). Render nothing if `!detail`. Header: "Daily streak" (`Icon flame`) + a small daily-goal ring (`xpToday/dailyGoal`, reuse the SVG ring markup from the mock, `aria-label`). Big flame `Icon flame` + `detail.current` (`.disp .snum`) + "day streak". Week row from `detail.week` mapping each `state` to a dot (`done/rest-done`→check, `today`→ring, `rest`→moon, else empty). Next-tier row: `detail.next_tier` + `detail.to_next`. Add `data-testid="streak-tile"` to the section.

- [ ] **Step 2:** Port `.streak / .sh / .ring / .big / .flame / .snum / .week / .wd / .wdot / .nexttier` CSS from the mock into `home.css` (namespaced). Reduced-motion guard on any flame flicker.

- [ ] **Step 3:** `npm run typecheck` → PASS. **Commit.**

---

### Task 6: FeatureCard + row

**Files:**
- Create: `frontend/src/aurora/components/home/FeatureCard.tsx`

- [ ] **Step 1:** Props: `{ tone: "tutor"|"vp"|"flash"; href: string; icon: string; title: string; sub: string; cta: string }`. Render a `next/link` `.fcard` with `data-tone`, a decorative corner `Icon` (`.deco`), a frosted `.tile` with `Icon`, `<h3 class="disp">`, `<p>`, and an `.open` button with `Icon arrow`. Add `data-testid="feature-card"`. Export a `FEATURES` array (tutor→/chat, vp→/cases, flash→/flashcards) with the mock copy.

- [ ] **Step 2:** Port `.fcard` tone gradients + `.tile/.deco/.open` CSS from the mock into `home.css`.

- [ ] **Step 3:** `npm run typecheck` → PASS. **Commit.**

---

### Task 7: MilestoneLadder

**Files:**
- Create: `frontend/src/aurora/components/home/MilestoneLadder.tsx`

- [ ] **Step 1:** Reuse the tier list concept from the current `StreakBoard.tsx` (`TIERS` names + `at` thresholds) but map each tier to a home icon: `[{at:3,name:"First Light",icon:"sun"},{at:5,name:"Clear View",icon:"lens"},{at:10,name:"20/20 Vision",icon:"eye"},{at:20,name:"Eagle Eye",icon:"eagle"},{at:30,name:"Hawkeye",icon:"spark"},{at:50,name:"Visionary",icon:"spark"}]`. Props: `{ detail?: StreakDetail }`. State per tier from `detail.current`: `done` (current≥at), `next` (first unmet), else `locked`. Header shows "N of 6 unlocked". Add `data-testid="milestone-ladder"`.

- [ ] **Step 2:** Port `.miles/.mile/.mi/.mn/.mm` CSS (+ done/next states) from the mock into `home.css`.

- [ ] **Step 3:** `npm run typecheck` → PASS. **Commit.**

---

### Task 8: WeekStats (real data only)

**Files:**
- Create: `frontend/src/aurora/components/home/WeekStats.tsx`

- [ ] **Step 1:** Props: `{ progress?: ProgressData }`. Compute four backed stats:
```ts
const sessions = progress?.session_count ?? 0;
const best = progress?.streak_detail?.best ?? progress?.streak ?? 0;
const perf = progress?.topic_performance ?? [];
const acc = perf.length ? Math.round((perf.reduce((s,p)=>s+p.score,0)/perf.length)*100) : 0;
const mastered = perf.filter(p=>p.score>=0.65).length;
```
Render a `.panel` titled "Your progress" with four `.stat` tiles: Sessions (`sessions`, tone a), Best streak (`best`, tone b), Accuracy (`${acc}%`, tone c), Topics mastered (`mastered`, tone d). Header uses `.disp`.

- [ ] **Step 2:** Port `.panel/.ph/.stats/.stat/.sv/.sl` CSS from the mock into `home.css`.

- [ ] **Step 3:** `npm run typecheck` → PASS. **Commit.**

---

### Task 9: Assemble Dashboard

**Files:**
- Rewrite: `frontend/src/aurora/screens/Dashboard.tsx`

- [ ] **Step 1:** Rewrite `Dashboard` to:
  - keep the existing `useAuth` + `useProgress` + the post-session toast/confetti `useEffect` verbatim (lines ~61-79 of the current file) and the forced `ChangePasswordModal`;
  - compute: `firstName`, `track`, `level`, `rank=rankForLevel(level).title`, `xp`, `xpInLevel=xp%500`, `xpToNext=500-(xp%500)`, `doneToday=streak_detail.done_today`, `streak=streak_detail.current`, `goalMet=xp_today>=daily_goal`;
  - greeting seed state: `const [bump,setBump]=useState(0)` seeded from `localStorage("eyebot_greet_seed")`, `seed = dayOfYear()+bump`; `onSurprise=()=>{ const n=bump+1; setBump(n); localStorage.setItem("eyebot_greet_seed",String(n)); }`;
  - build `ctx: GreetingCtx` and `greeting=pickGreeting(ctx,seed)`;
  - render root `<div className="aurora-home" data-testid="home-root">` containing: top bar (Gemini logo via `<Icon name="eye" gem/>` + gradient wordmark, level chip with `Icon medal`, avatar), `<HomeIconSprite/>`, hero grid (`GreetingHero` + `StreakTile`), feature cards row (`FEATURES.map(FeatureCard)`), lower grid (`MilestoneLadder` + `WeekStats`).
  - top bar + `.hero` + `.cards` + `.lower` grid CSS ported from mock into `home.css`.

- [ ] **Step 2:** Grep for stale imports and remove the now-unused ones (`GradientHero`, `StreakBand`, `StreakBoard`, `GoalRing`, `OA_TOPICS…` if unused). Run `grep -rn "GradientHero\|StreakBand\|StreakBoard\|GoalRing" frontend/src`; if the dashboard was their only consumer, delete those component files in a follow-up step; otherwise leave them.

- [ ] **Step 3:** `cd frontend && npm run typecheck` → PASS.

- [ ] **Step 4: Commit.** `git commit -m "feat(home): assemble warm bento dashboard"`

---

### Task 10: Iris asset (strip → optimize → place)

**Files:**
- Create: `tools/media/strip_checkerboard.py`
- Create: `frontend/public/brand/iris.png`

- [ ] **Step 1:** Create `tools/media/strip_checkerboard.py` — generalise the saturation-flood-fill (SAT_T arg, MinFilter erode, GaussianBlur) that turns a Nano-Banana checkerboard "transparent" render into true alpha; then resize to 512×512 and `save(optimize=True)`. CLI: `python tools/media/strip_checkerboard.py <src> <dst> [--sat 46]`.

- [ ] **Step 2:** Produce the asset from the chosen render (the approved `iris-00`, SAT_T=46): output `frontend/public/brand/iris.png`, ≤512px, optimized (target < ~150 KB). Verify: `python -c "from PIL import Image; im=Image.open('frontend/public/brand/iris.png'); print(im.mode, im.size, im.getchannel('A').getextrema())"` → `RGBA (512,512) (0, 255)`.

- [ ] **Step 3: Commit.**
```bash
git add tools/media/strip_checkerboard.py tools/media/generate_mascot.py frontend/public/brand/iris.png
git commit -m "feat(home): Iris mascot asset + reproducible generator/strip"
```

---

### Task 11: Update aurora_assert harness

**Files:**
- Modify: `frontend/tests/aurora_assert.mjs`

- [ ] **Step 1:** Replace the dashboard-structure block (lines ~92-99) with:
```js
await np.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
await np.waitForSelector('[data-testid="home-root"]', { timeout: 15000 });
const h1count = await np.locator("main h1").count();
if (h1count !== 1) { console.error(`FAIL: dashboard main h1 count = ${h1count}`); process.exit(1); }
for (const [tid,label] of [["streak-tile","streak tile"],["milestone-ladder","milestone ladder"]]) {
  if ((await np.locator(`[data-testid="${tid}"]`).count()) !== 1) { console.error(`FAIL: ${label} missing`); process.exit(1); }
}
if ((await np.locator('[data-testid="feature-card"]').count()) !== 3) { console.error("FAIL: expected 3 feature cards"); process.exit(1); }
const g1 = await np.locator('[data-testid="greeting"]').innerText();
await np.locator('button:has-text("Surprise me")').click();
await np.waitForTimeout(120);
const g2 = await np.locator('[data-testid="greeting"]').innerText();
if (g1 === g2) { console.error("FAIL: 'Surprise me' did not change the greeting"); process.exit(1); }
console.log("PASS: warm home renders (greeting h1, streak tile, milestone ladder, 3 feature cards, reshuffle)");
```

- [ ] **Step 2:** Update the reduced-motion wait (line ~355) from `[data-testid="streak-board"]` to `[data-testid="streak-tile"]`.

- [ ] **Step 3:** Keep the 390px no-overflow check (~101-106) as-is; ensure `home.css` collapses `.hero/.cards/.lower` to one column under ~820px and hides/scales `.iris` so nothing overflows at 390px (add the media query to `home.css`).

- [ ] **Step 4: Commit.** `git commit -m "test(home): update aurora_assert to new dashboard structure"`

---

### Task 12: Full verification + ship

- [ ] **Step 1:** `cd frontend && npm run typecheck` → PASS.
- [ ] **Step 2:** `cd frontend && npm run build` → PASS (standalone output).
- [ ] **Step 3:** Greeting unit test: `node --experimental-strip-types frontend/tests/greeting_assert.mjs` → `PASS`.
- [ ] **Step 4:** Build the standalone server per `project_harness_local_server` (build, copy `.next/static` + `public` into `.next/standalone`, `node .next/standalone/server.js`), then `node frontend/tests/aurora_assert.mjs` → all PASS. Screenshot the dashboard to eyeball parity with the mock.
- [ ] **Step 5:** `python -m pytest -q` (repo root) → green (backend untouched).
- [ ] **Step 6:** Delete now-orphaned components if grep confirms no other consumers (`GradientHero`, `StreakBand`, `StreakBoard`, `GoalRing`) and re-run typecheck/build. Commit.
- [ ] **Step 7:** Final commit + push to `main` (auto-deploys). Only push once every check above is green.
```bash
git push origin main
```

---

## Self-review

- **Spec coverage:** streak counter + milestones (Tasks 5,7) · gamification level/XP/funny greeting (Tasks 2,4,9) · ever-changing teasing greeting + Surprise me (Tasks 2,4,9,11) · one-click feature cards (Task 6) · stat list, real data (Task 8) · beautiful warm premium + custom icons + Gemini logo (Tasks 1,3,4,9) · Iris mascot (Tasks 4,10) · theme scoped to home (Task 1) · harness/tests green (Tasks 2,11,12). All covered.
- **Placeholders:** greeting engine + test + harness edits are full code; CSS is ported from the committed-approved mock with tokens embedded above (not a placeholder — the values are specified). No TBDs.
- **Type consistency:** `GreetingCtx`/`Greeting`/`Bucket`/`pickGreeting` names match across Tasks 2/4/9/11; `StreakDetail`/`ProgressData` come from `@/hooks/useProgress`; testids (`home-root`,`greeting`,`streak-tile`,`milestone-ladder`,`feature-card`) match between Tasks 4-9 and Task 11.
- **Known adjustment:** the greeting bank's `emphasis` must be a literal substring of each `title`; Step 3 of Task 2 flags fixing any line that violates the enforced test (notably the "retina" line).
