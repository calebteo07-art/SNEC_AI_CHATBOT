# Flashcards Vivid-yet-Calm Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Flashcards feature feel alive through a vivid per-topic accent color while cutting words/clutter, keeping the AURORA light look, the study mechanics, and the harness contract unchanged.

**Architecture:** A pure `topicHue(topic_key)` maps each topic to a curated, on-brand hue, exposed as the CSS custom property `--flash-topic-hue` (mirroring the existing `--flash-score-hue`). The orchestrator threads the active card's hue into `FlashShell`, which sets it on `.flash-root`; all visual treatment is pure CSS reading that variable (`@property`-registered so it interpolates between Mixed cards). Score hue still owns the reveal. Setup is decluttered and its topic tiles become color-led.

**Tech Stack:** Next.js 16 (App Router) + React 19, hand-written CSS in `frontend/src/aurora/aurora.css` using brand tokens from `frontend/src/aurora/tokens.css`, Playwright harness at `frontend/tests/aurora_assert.mjs`.

---

## Testing reality (read first)

This repo has **no unit-test runner** (no jest/vitest; `package.json` has only `dev`/`build`/`start`/`typecheck`). The real verification surface is:

1. **Type safety:** `npm run typecheck` (from `frontend/`).
2. **Build:** `npm run build` (from `frontend/`).
3. **Behavior/contract:** the Playwright harness `frontend/tests/aurora_assert.mjs`.
4. **Visual:** a manual look via `npm run dev` (a screenshot of `/flashcards`).

Do **not** introduce a unit-test framework — it is not the codebase pattern. Pure-logic (`topicHue`) is verified by `typecheck` plus a harness assertion that the study stage exposes a non-default `--flash-topic-hue`.

### Harness run recipe (referenced by verification steps as "run the harness")

`next.config` uses `output: "standalone"`, and `next start` is flaky under standalone, so build + serve the standalone bundle:

```bash
cd frontend
npm run build
# standalone bundle does not include static assets — copy them in:
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
# serve on :3000 in the background, then run the harness against it:
PORT=3000 node .next/standalone/server.js &
SERVER_PID=$!
sleep 3
node tests/aurora_assert.mjs http://127.0.0.1:3000
HARNESS_EXIT=$?
kill $SERVER_PID
exit $HARNESS_EXIT
```

The harness mocks all `/api/**`, so no backend is needed. If chromium is missing: `npx playwright install chromium`. **Expected on success:** the script prints its PASS lines and exits 0 (no `FAIL:` line).

### Harness contract — DO NOT BREAK

These hooks are asserted in `aurora_assert.mjs` and must remain present and behave the same:

- `/flashcards` renders exactly **one** `h1` (the sr-only "Flashcards").
- `[data-testid="flash-setup"]` exists on the setup screen.
- `[data-testid="flash-exit"]` exists (immersive back affordance).
- `[data-testid="flash-start"]` exists and is **clickable without selecting a topic** (Mixed default).
- `.flash-recall` is a fillable textarea after Start.
- `[data-testid="flash-submit"]` grades the answer.
- `[data-testid="flash-score"]` appears after grading and contains the score (`82` in the mock).
- `.flash-compare-label` with text **"Model answer"** appears on the reveal.

Every task below preserves these. The setup "Show all topics" expander must never hide `flash-start` or the Mixed default.

---

## File Structure

- **Modify** `frontend/src/aurora/components/flashcards/types.ts` — add `topicHue()` + curated arc (pure logic; lives with the other score/hue helpers).
- **Modify** `frontend/src/aurora/components/flashcards/FlashShell.tsx` — accept `topicHue` and set `--flash-topic-hue` on `.flash-root`.
- **Modify** `frontend/src/aurora/screens/Flashcards.tsx` — compute the active hue and pass it to every `FlashShell`.
- **Modify** `frontend/src/aurora/components/flashcards/StudyStage.tsx` — quiet topbar/coach/readout treatment (class hooks only) + topbar XP count-up.
- **Modify** `frontend/src/aurora/components/flashcards/RecallCard.tsx` — richer confetti pieces (markup only).
- **Modify** `frontend/src/aurora/components/flashcards/SessionSetup.tsx` — remove header eyebrow/help, color-led tiles (drop sub-line), "Show all topics" expander, per-tile hue.
- **Modify** `frontend/src/aurora/aurora.css` (the `flash-*` block, ~lines 1830–1988) — `@property`, derived tokens, topic-tinted background drift, topic color on chip/card/dot/submit/tiles, quieted topbar/coach/readout, reduced-motion coverage.
- **Modify** `frontend/tests/aurora_assert.mjs` — add one assertion that the study stage exposes a non-default topic hue (test-only edit).

No backend / mechanics files are touched.

---

### Task 0: Confirm a green baseline

**Files:** none (verification only)

- [ ] **Step 1: Typecheck + build + harness from a clean tree**

Run (from repo root):
```bash
cd frontend && npm run typecheck && npm run build
```
Expected: typecheck clean, build succeeds.

- [ ] **Step 2: Run the harness (see "Harness run recipe")**

Expected: exits 0, no `FAIL:` line. If this is not green *before* changes, stop and report — do not start the redesign on a red baseline.

---

### Task 1: `topicHue` pure function + curated arc

**Files:**
- Modify: `frontend/src/aurora/components/flashcards/types.ts` (append after `scoreHue`, ~line 63)

- [ ] **Step 1: Add the curated arc, hash, and `topicHue`**

Append to `types.ts`:

```ts
/** Curated, on-brand hue arc for per-topic color. Brand blues → violet → magenta →
 *  coral → amber → teal → green, deliberately skipping the muddy yellow-green band
 *  (~50–110°). Each reads well at the fixed lightness used for --flash-topic-c. */
const TOPIC_HUES = [212, 232, 258, 286, 322, 350, 14, 32, 174, 190, 152, 128];

/** Stable, non-negative string hash (djb2). */
function hashKey(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** topic_key → HSL hue (unitless degrees) for --flash-topic-hue. Deterministic
 *  (a topic is always the same color) and visually distinct: the hash selects a
 *  base hue from the curated arc, and a small deterministic jitter separates keys
 *  that land on the same base. `__mixed`/empty → brand blue (used pre-card only). */
export function topicHue(topicKey: string): number {
  if (!topicKey || topicKey === "__mixed") return 212;
  const h = hashKey(topicKey);
  const base = TOPIC_HUES[h % TOPIC_HUES.length];
  const jitter = ((h >> 4) % 9) - 4; // -4..+4°, stays clear of the muddy band
  return base + jitter;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: clean (no errors). `topicHue` is exported and unused-so-far is fine (it is wired in Task 3/5).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/flashcards/types.ts
git commit -m "feat(flashcards): add deterministic topicHue() on a curated on-brand arc"
```

---

### Task 2: CSS foundation — `@property`, derived tokens, topic-tinted background drift

**Files:**
- Modify: `frontend/src/aurora/aurora.css` (flash block, ~lines 1830–1840 and 1977–1988)

- [ ] **Step 1: Register the animatable hue property + derived tokens, and replace the flat `.flash-root` background with a topic-tinted drift**

Replace the current `.flash-root { ... }` rule (lines ~1835–1840) with:

```css
/* Per-topic color: hue is animatable so Mixed sessions cross-fade between topics. */
@property --flash-topic-hue { syntax: "<number>"; inherits: true; initial-value: 212; }

.flash-root { position: relative; height: 100%; min-height: 100dvh; width: 100%; overflow: hidden;
  --flash-topic-hue: 212;
  /* contrast-safe solid (white text sits on this) + soft tint for fills/accents */
  --flash-topic-c: hsl(var(--flash-topic-hue) 68% 46%);
  --flash-topic-soft: color-mix(in srgb, hsl(var(--flash-topic-hue) 80% 55%) 14%, var(--surface));
  background: var(--canvas);
  color: var(--ink);
  transition: --flash-topic-hue .6s ease; }

/* Living backdrop: two slow topic-tinted washes + a fixed brand wash. */
.flash-root::before, .flash-root::after { content: ""; position: absolute; inset: -20%; z-index: 0;
  pointer-events: none; }
.flash-root::before {
  background:
    radial-gradient(46% 40% at 22% 18%, hsl(var(--flash-topic-hue) 80% 60% / .16), transparent 60%),
    radial-gradient(50% 44% at 82% 88%, hsl(var(--flash-topic-hue) 70% 55% / .12), transparent 60%);
  animation: flash-drift 26s ease-in-out infinite alternate; }
.flash-root::after {
  background: radial-gradient(40% 34% at 88% 12%, rgba(155,114,203,.10), transparent 60%);
  animation: flash-drift 34s ease-in-out infinite alternate-reverse; }
@keyframes flash-drift {
  from { transform: translate3d(-2%, -1%, 0) scale(1); }
  to   { transform: translate3d(3%, 2%, 0) scale(1.08); } }
```

Note: `.flash-content` already sits at `z-index: 1` (line ~1841), so it stays above the washes — no change needed there.

- [ ] **Step 2: Extend reduced-motion coverage**

In the `html[data-motion="reduce"]` block (~line 1978) add `.flash-root` (for the hue transition) and the drift pseudo-elements; do the same in the `@media (prefers-reduced-motion)` block (~line 1984). Replace both blocks with:

```css
html[data-motion="reduce"] .flash-card,
html[data-motion="reduce"] .flash-root { transition: none; }
html[data-motion="reduce"] .flash-root::before,
html[data-motion="reduce"] .flash-root::after,
html[data-motion="reduce"] .flash-start,
html[data-motion="reduce"] .flash-confetti i,
html[data-motion="reduce"] .flash-loader i,
html[data-motion="reduce"] .flash-coach { animation: none; }
html[data-motion="reduce"] .flash-confetti { display: none; }
@media (prefers-reduced-motion: reduce) {
  .flash-card, .flash-root { transition: none; }
  .flash-root::before, .flash-root::after,
  .flash-start, .flash-confetti i, .flash-loader i, .flash-coach { animation: none; }
  .flash-confetti { display: none; }
}
```

- [ ] **Step 3: Typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: clean. (CSS-only change; the hue still defaults to 212 everywhere because nothing sets it yet.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/aurora/aurora.css
git commit -m "feat(flashcards): topic-hue CSS foundation — @property, derived tokens, living backdrop"
```

---

### Task 3: Thread the active hue + apply topic color across the study card

**Files:**
- Modify: `frontend/src/aurora/components/flashcards/FlashShell.tsx`
- Modify: `frontend/src/aurora/screens/Flashcards.tsx`
- Modify: `frontend/src/aurora/components/flashcards/StudyStage.tsx`
- Modify: `frontend/src/aurora/aurora.css`

- [ ] **Step 1: `FlashShell` accepts and applies the hue**

In `FlashShell.tsx`, add `topicHue` to the props and set it on `.flash-root`:

```tsx
export function FlashShell({
  newAchievements, onDismissAchievement, onExit, topicHue, children,
}: {
  newAchievements: string[];
  onDismissAchievement: (id: string) => void;
  onExit: () => void;
  topicHue?: number;
  children: ReactNode;
}) {
  return (
    <div className="flash-root" style={topicHue != null ? ({ "--flash-topic-hue": topicHue } as React.CSSProperties) : undefined}>
```

Add `import type { CSSProperties } from "react";` is not needed — use `React.CSSProperties` (import React types already available via `ReactNode` import; change it to `import type { ReactNode } from "react";` plus inline `as React.CSSProperties`). If `React` is not in scope, cast as `{ ["--flash-topic-hue"]: topicHue } as Record<string, number>` instead:

```tsx
    <div className="flash-root" style={topicHue != null ? ({ "--flash-topic-hue": topicHue } as Record<string, number>) : undefined}>
```

Use the `Record<string, number>` cast to avoid a React import dependency.

- [ ] **Step 2: Orchestrator computes the hue and passes it to every `FlashShell`**

In `Flashcards.tsx`, import `topicHue` and compute the active hue, then pass it to all three `FlashShell` usages.

Add to the import from types (line ~16):
```tsx
import { type Flashcard, type AiFeedback, type Difficulty, RETRY_THRESHOLD, xpForScore, loadSessionCards, topicHue } from "@/aurora/components/flashcards/types";
```

After `const card = deck[idx];` (~line 74) add:
```tsx
  const stageHue = topicHue(card?.tag ?? "__mixed");
```

Note `card` is only defined later in the study branch, but `deck`/`idx` exist before the early returns. Move the `stageHue` line to just after `const isRetry = ...` (line ~75) so it is in scope for all `FlashShell` usages. For the setup/loading branches `card` is undefined → `stageHue` is the brand default (212).

Pass `topicHue={stageHue}` on each `<FlashShell ...>` (the setup return ~line 176, the loading return ~line 191, and the study return ~line 205):
```tsx
<FlashShell newAchievements={newAchievements} onDismissAchievement={dismissAchievement} onExit={exit} topicHue={stageHue}>
```

- [ ] **Step 3: Apply topic color in CSS — glyph chip, card accent/glow, active dot, Submit; quiet topbar/coach/readout**

In `aurora.css`, update these existing rules (keep selectors/structure; change only the color treatment):

Glyph chip → filled tint (replace `.flash-topictag`, ~line 1911):
```css
.flash-topictag { display: inline-flex; align-items: center; gap: 8px; align-self: flex-start; padding: 6px 12px 6px 8px;
  border-radius: 999px; background: var(--flash-topic-soft); border: 1px solid color-mix(in srgb, var(--flash-topic-c) 30%, transparent);
  color: var(--flash-topic-c); font-size: 12.5px; font-weight: 600; }
```

Card face → topic accent edge + topic-tinted glow (replace `.flash-face`, ~line 1906):
```css
.flash-face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden;
  display: flex; flex-direction: column; padding: clamp(22px, 3vw, 32px); border-radius: var(--radius-xl);
  background: var(--surface); border: 1px solid var(--hairline);
  border-top: 3px solid var(--flash-topic-c);
  box-shadow: 0 24px 60px -30px rgba(31,31,31,.35), 0 18px 50px -34px hsl(var(--flash-topic-hue) 80% 50% / .55); }
```

Active progress dot → topic color (replace `.flash-dots i.is-active`, ~line 1894):
```css
.flash-dots i.is-active { background: var(--flash-topic-c); transform: scale(1.35); }
```

Submit button → topic-hued (replace the shared `.flash-submit, .flash-advance` background rule, ~line 1923 — note `.flash-advance` is re-colored by score later at line ~1956, so only change Submit's resting color here):
```css
.flash-submit, .flash-advance { width: 100%; margin-top: 14px; padding: 15px; border: none; border-radius: var(--radius);
  background: var(--flash-topic-c); color: #fff; font: inherit; font-size: 15.5px; font-weight: 600; cursor: pointer;
  box-shadow: 0 14px 30px -16px var(--flash-topic-c); }
```
(`.flash-advance` is overridden to the score color by the existing `.flash-advance { background: var(--flash-c); ... }` rule at ~line 1956 — leave that rule intact so the reveal stays score-driven.)

Quiet the framing elements (replace `.flash-coach` color/size ~line 1897, `.flash-deck-title` ~1891, `.flash-readout` ~1958):
```css
.flash-deck-title { font-size: 13px; font-weight: 600; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.flash-coach { margin: 0; font-size: 14px; color: var(--ink-3); text-align: center; min-height: 1.4em; opacity: .9;
  animation: flash-coach-in .34s ease both; }
.flash-readout { display: flex; gap: 18px; justify-content: center; font-size: 12px; color: var(--ink-3); opacity: .8; }
```

- [ ] **Step 4: Topbar XP count-up (calm: animates from previous total → new total)**

In `StudyStage.tsx`, replace the static XP span with a small local count-up (do NOT reuse `useCountUp` — it animates from 0 and would replay each card). Add at the top of the component body:

```tsx
import { useEffect, useRef, useState } from "react";
```
(extend the existing `useEffect` import).

Inside `StudyStage`, before the return, add:
```tsx
  const [xpShown, setXpShown] = useState(p.sessionXp);
  const xpFromRef = useRef(p.sessionXp);
  useEffect(() => {
    const reduce = document.documentElement.dataset.motion === "reduce" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = xpFromRef.current;
    const to = p.sessionXp;
    xpFromRef.current = to;
    if (reduce || from === to) { setXpShown(to); return; }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 600);
      setXpShown(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [p.sessionXp]);
```

Change the XP span (line ~66) to render `xpShown`:
```tsx
        <span className="flash-xp-live">{xpShown} XP</span>
```

- [ ] **Step 5: Typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: clean.

- [ ] **Step 6: Run the harness (see recipe)**

Expected: exits 0, no `FAIL:` line (mechanics + all hooks intact; card now shows topic color).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/aurora/components/flashcards/FlashShell.tsx frontend/src/aurora/screens/Flashcards.tsx frontend/src/aurora/components/flashcards/StudyStage.tsx frontend/src/aurora/aurora.css
git commit -m "feat(flashcards): per-topic color across the study card + quieted framing + calm XP count-up"
```

---

### Task 4: Declutter setup + color-led topic tiles with a "Show all topics" expander

**Files:**
- Modify: `frontend/src/aurora/components/flashcards/SessionSetup.tsx`
- Modify: `frontend/src/aurora/aurora.css`

- [ ] **Step 1: Rework `SessionSetup.tsx` — drop header eyebrow/help, color-led tiles (no sub-line), expander**

Replace the body of `SessionSetup` (the returned JSX, lines ~27–83) with:

```tsx
  const [selected, setSelected] = useState<string | null>(null); // null = Mixed
  const [showAll, setShowAll] = useState(false);
  const sets = (topicSets ?? []).filter((s) => s.difficulty === difficulty);
  const pickDifficulty = (d: Difficulty) => { setDifficulty(d); setSelected(null); };

  const PREVIEW = 5;
  const visible = showAll ? sets : sets.slice(0, PREVIEW);
  const hiddenCount = sets.length - visible.length;

  return (
    <div className="flash-setup" data-testid="flash-setup">
      <header className="flash-setup-head">
        <PlateWell
          src={PLATE.flashcards}
          alt="Slit-lamp optical section through the cornea, anterior chamber and crystalline lens"
          ratio={16 / 9}
          caption="Slit-Lamp Optical Section"
          className="flash-hero"
        />
        <h2 className="flash-setup-title">Flashcards</h2>
      </header>

      <section className="flash-setup-controls">
        <div className="flash-control">
          <span className="flash-control-label">Difficulty</span>
          <div className="flash-pills" role="radiogroup" aria-label="Difficulty">
            {(["easy", "medium"] as Difficulty[]).map((d) => (
              <button key={d} type="button" role="radio" aria-checked={difficulty === d}
                className="flash-pill flash-press" onClick={() => pickDifficulty(d)}>
                {d === "easy" ? "Easy" : "Medium"}
              </button>
            ))}
          </div>
        </div>
        <div className="flash-control">
          <span className="flash-control-label">Length</span>
          <div className="flash-pills" role="radiogroup" aria-label="Session length">
            {LENGTHS.map((l) => (
              <button key={l.n} type="button" role="radio" aria-checked={sessionLength === l.n}
                className="flash-pill flash-press" onClick={() => setSessionLength(l.n)}>
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="flash-topics" aria-label="Topics">
        <button type="button"
          className={`flash-topic is-mixed flash-press${selected === null ? " is-selected" : ""}`}
          aria-pressed={selected === null} onClick={() => setSelected(null)}>
          <span className="flash-topic-glyph"><TopicGlyph topicKey="__mixed" /></span>
          <span className="flash-topic-label">Mixed</span>
        </button>
        {visible.map((s) => (
          <button key={s.set_key} type="button" disabled={s.total === 0}
            className={`flash-topic flash-press${selected === s.set_key ? " is-selected" : ""}`}
            style={{ "--flash-topic-hue": topicHue(s.topic_key) } as Record<string, number>}
            aria-pressed={selected === s.set_key} onClick={() => setSelected(s.set_key)}>
            <span className="flash-topic-glyph"><TopicGlyph topicKey={s.topic_key} /></span>
            <span className="flash-topic-label">{s.label}</span>
          </button>
        ))}
        {hiddenCount > 0 && (
          <button type="button" className="flash-topic is-more flash-press" onClick={() => setShowAll(true)}>
            <span className="flash-topic-label">Show all topics</span>
            <span className="flash-topic-sub">+{hiddenCount} more</span>
          </button>
        )}
      </section>

      <div className="flash-setup-foot">
        <button type="button" className="flash-start flash-press" data-testid="flash-start"
          onClick={() => onStart(selected)}>Start session →</button>
      </div>
    </div>
  );
```

Update the imports at the top of the file to include `topicHue` (the `PlateWell`/`PLATE` imports were already added when the slit-lamp hero was wired in — see note below):
```tsx
import { PlateWell } from "@/aurora/components/PlateWell";
import { PLATE } from "@/aurora/media";
import { type Difficulty, LENGTHS, topicHue } from "./types";
```

> **Already done (2026-06-19 image-addition sub-task):** the slit-lamp "laser slice" hero is wired into this header via `PlateWell`/`PLATE.flashcards`, the `.flash-hero` CSS rule exists, `RASTER_PROMPTS["flashcards"]` in `tools/media/prompts.py` was rewritten to the optical-section brief, and `flashcards-photo-00.png` was regenerated (manifest v12). This Task-4 rewrite must **keep** the `<PlateWell .../>` block in the header — do not regress to a title-only header.

(Note: the `s.completed`/`s.total` sub-line is removed from real topic tiles; `s.total === 0` still disables empty sets. The `flash-setup`, `flash-start` hooks and the Mixed default are preserved, so the harness still passes.)

- [ ] **Step 2: CSS — color-led tiles; keep "Mixed"/"more" neutral**

In `aurora.css`, update the topic-tile rules (~lines 1867–1876). Replace `.flash-topic` hover/selected/glyph rules with:

```css
.flash-topic { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; text-align: left;
  padding: 16px; border-radius: var(--radius-lg); border: 1px solid var(--hairline); background: var(--surface);
  color: var(--ink); cursor: pointer;
  --flash-topic-hue: 212; }
.flash-topic:hover:not(:disabled) { transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--flash-topic-c) 45%, transparent);
  box-shadow: 0 12px 30px -16px hsl(var(--flash-topic-hue) 80% 50% / .55); }
.flash-topic.is-selected { border-color: var(--flash-topic-c);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--flash-topic-c) 45%, transparent), 0 12px 30px -16px hsl(var(--flash-topic-hue) 80% 50% / .5); }
.flash-topic:disabled { opacity: .45; cursor: not-allowed; }
.flash-topic-glyph { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 10px;
  background: var(--flash-topic-soft); color: var(--flash-topic-c); }
.flash-topic-label { font-size: 16px; font-weight: 600; letter-spacing: -.01em; }
.flash-topic-sub { font-size: 12.5px; color: var(--ink-3); }
.flash-topic.is-more { align-items: center; justify-content: center; border-style: dashed; color: var(--ink-2); }
.flash-topic.is-more .flash-topic-label { font-size: 14.5px; }
```

(The `is-mixed` tile inherits the brand-blue default hue 212 — calm and neutral as intended. Tiles with an inline `--flash-topic-hue` recompute `--flash-topic-c`/`--flash-topic-soft` because those are defined on `.flash-root` and inherit the per-tile hue.)

Wait — `--flash-topic-c`/`--flash-topic-soft` are declared on `.flash-root`; per-tile `--flash-topic-hue` overrides the hue but the derived `*-c`/`*-soft` are computed once at `.flash-root` scope. To make them recompute per tile, **also declare the derived tokens on `.flash-topic`** (so they read the tile's local hue):

```css
.flash-topic { /* ...as above... */
  --flash-topic-hue: 212;
  --flash-topic-c: hsl(var(--flash-topic-hue) 68% 46%);
  --flash-topic-soft: color-mix(in srgb, hsl(var(--flash-topic-hue) 80% 55%) 14%, var(--surface)); }
```

Include those two derived-token lines in the `.flash-topic` rule above.

- [ ] **Step 3: Typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: clean.

- [ ] **Step 4: Run the harness (see recipe)**

Expected: exits 0. Confirm specifically: `flash-setup` present, `flash-start` clicks through to a card without picking a topic, grading still shows `82` and "Model answer".

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/components/flashcards/SessionSetup.tsx frontend/src/aurora/aurora.css
git commit -m "feat(flashcards): declutter setup — title-only header, color-led tiles, show-all expander"
```

---

### Task 5: Richer-but-restrained confetti + harness assertion for topic color

**Files:**
- Modify: `frontend/src/aurora/components/flashcards/RecallCard.tsx`
- Modify: `frontend/src/aurora/aurora.css`
- Modify: `frontend/tests/aurora_assert.mjs`

- [ ] **Step 1: More pieces + varied shapes, hue seeded from score+topic**

In `RecallCard.tsx`, bump the confetti count from 16 to 22 (line ~94):
```tsx
          {Array.from({ length: 22 }).map((_, i) => (
            <i key={i} style={{ ["--i" as string]: i } as React.CSSProperties} />
          ))}
```

In `aurora.css`, replace the `.flash-confetti i` rule (~line 1962) to vary shape + tie color partly to the topic hue:
```css
.flash-confetti i { position: absolute; top: 30%; left: 50%; width: 9px; height: 9px;
  border-radius: 2px;
  background: hsl(calc(var(--flash-topic-hue) + var(--i) * 28) 80% 60%);
  animation: flash-confetti-fly 1s ease-out forwards; animation-delay: calc(var(--i) * 16ms); opacity: 0; }
.flash-confetti i:nth-child(3n) { border-radius: 50%; }
.flash-confetti i:nth-child(4n) { width: 6px; height: 12px; }
@keyframes flash-confetti-fly {
  0% { opacity: 1; transform: translate(0, 0) rotate(0); }
  100% { opacity: 0; transform: translate(calc((var(--i) - 11) * 24px), calc(70px + var(--i) * 5px)) rotate(340deg); }
}
```
(Trigger stays `flipped && isHigh` i.e. score ≥ 85 — unchanged. The existing `@keyframes flash-confetti-fly` block replaces the old one; delete the old keyframes at ~lines 1965–1968 to avoid duplication.)

- [ ] **Step 2: Harness assertion — study stage exposes a non-default topic hue**

In `aurora_assert.mjs`, after the existing flashcards block confirms the model answer (~after line 161), add:

```js
// per-topic color: the study stage carries a topic-derived --flash-topic-hue
// (set on .flash-root by FlashShell). It should be present and a real number.
const topicHueVal = await np.evaluate(() => {
  const root = document.querySelector(".flash-root");
  if (!root) return null;
  const v = getComputedStyle(root).getPropertyValue("--flash-topic-hue").trim();
  return v === "" ? null : Number(v);
});
if (topicHueVal == null || Number.isNaN(topicHueVal)) {
  console.error(`FAIL: flashcards --flash-topic-hue missing/NaN (got '${topicHueVal}')`); process.exit(1);
}
console.log("PASS: flashcards exposes per-topic --flash-topic-hue =", topicHueVal);
```

- [ ] **Step 3: Typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: clean.

- [ ] **Step 4: Run the harness (see recipe)**

Expected: exits 0; prints `PASS: flashcards exposes per-topic --flash-topic-hue = <number>`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/components/flashcards/RecallCard.tsx frontend/src/aurora/aurora.css frontend/tests/aurora_assert.mjs
git commit -m "feat(flashcards): richer restrained confetti + harness assertion for per-topic hue"
```

---

### Task 6: Visual confirmation + finish

**Files:** none (verification only)

- [ ] **Step 1: Visual look via dev server**

Run: `cd frontend && npm run dev`, open `http://localhost:3000/flashcards`. Confirm by eye:
- Setup: title-only header, calm grid (Mixed + ~5 tiles + "Show all topics"), each real tile a distinct color.
- Study: card shows the topic color (chip, top edge, glow, Submit); background drifts subtly; framing text is quiet.
- Grade a high answer (the mock returns 82 — to see confetti you can temporarily raise the mock score, then revert): reveal uses the score (blue→green) hue, not the topic hue.
- Toggle reduced motion (Profile toggle or OS): drift/confetti/transition stop.

- [ ] **Step 2: Full green pass**

Run typecheck + build + the harness once more. Expected: all clean, harness exits 0.

- [ ] **Step 3: Final commit (if any visual tweaks were made) + done**

```bash
git add -A
git commit -m "polish(flashcards): visual pass on vivid-yet-calm redesign"
```

Then use **superpowers:finishing-a-development-branch** to decide merge/PR for branch `flashcards-vivid-calm`, and update the `project_flashcards_aperture_redesign.md` memory with the new vivid-yet-calm state.

---

## Self-Review

**Spec coverage:**
- Two color signals (topic identity / score feedback) → Tasks 1–3 (topic) + reveal left untouched (score). ✓
- Auto hue per topic → Task 1 `topicHue`. ✓
- Mixed shifts per card + smooth interpolation → Task 2 `@property` + Task 3 threading. ✓
- Topic-tinted background drift → Task 2. ✓
- Color on chip/card/dot/submit/tiles → Tasks 3–4. ✓
- Setup header cut + grid trimmed (expander) + color-led tiles + sub-line dropped → Task 4. ✓
- Kept-but-quieted coach/progress/in-card copy → Task 3 Step 3 (quieted; copy untouched). ✓
- Dropped watermark → not implemented (correct). ✓
- Tasteful delight: flip glow + XP count-up + restrained confetti → Task 3 Step 4 (XP) + Task 5 (confetti). Flip lift/glow handled via the topic glow on `.flash-face`. ✓
- Reduced motion → Task 2 Step 2. ✓
- Contrast-safe tokens → Task 2 Step 1 (`--flash-topic-c` fixed lightness). ✓
- Mechanics + harness hooks unchanged → all tasks preserve hooks; Task 0/3/4/5 verify. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `topicHue(topicKey: string): number` defined in Task 1, called identically in Tasks 3 (`topicHue(card?.tag ?? "__mixed")`) and 4 (`topicHue(s.topic_key)`). `FlashShell` prop `topicHue?: number` matches the passed `stageHue: number`. CSS custom prop `--flash-topic-hue` / derived `--flash-topic-c` / `--flash-topic-soft` named consistently across Tasks 2–5. ✓
