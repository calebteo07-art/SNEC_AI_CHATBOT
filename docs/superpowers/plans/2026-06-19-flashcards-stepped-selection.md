# Flashcards Stepped Selection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single cluttered flashcard selection screen with a two-step flow — a calm "Session" step (difficulty + length) then a vivid "Topic" gallery finale — joined by a 2-segment progress rail, a shared slit-lamp hero that morphs from centerpiece to badge, and a fill-the-viewport layout that never overflows.

**Architecture:** Split the one `SessionSetup.tsx` into a thin shell + two focused content views. The shell owns `step`/`direction`/`selected`/`showAll`, sets `data-step` + `--flash-topic-hue` on its root, and renders three regions: the progress rail, the **persistent** hero (rendered once so it never unmounts and can morph), and a **keyed** content block (`StepSession` → `StepTopic`) that slides/cross-fades. All motion is CSS-only (house style — `MotionProvider` is not mounted; no GSAP). Mechanics, grading, SM-2, and the per-topic hue system are untouched.

**Tech Stack:** Next.js 16 / React 19, plain CSS in `aurora.css` (CSS custom props, `@property`, `@keyframes`), Playwright integration harness (`frontend/tests/aurora_assert.mjs`).

**Spec:** [docs/superpowers/specs/2026-06-19-flashcards-stepped-selection-design.md](../specs/2026-06-19-flashcards-stepped-selection-design.md)

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `frontend/src/aurora/components/flashcards/SessionSetup.tsx` | Two-step shell: step/direction/selection state, progress rail, persistent hero, keyed step content | Rewrite |
| `frontend/src/aurora/components/flashcards/StepSession.tsx` | Step 1 content: titles + difficulty/length pills + Continue (no hero) | Create |
| `frontend/src/aurora/components/flashcards/StepTopic.tsx` | Step 2 content: titles + topic gallery + Back/Start (no hero) | Create |
| `frontend/src/aurora/aurora.css` | Setup layout (fill-the-page flex), progress rail, step slide keyframes, hero size-morph, enlarged pills/tiles, reduced-motion | Modify (lines ~1880–1978 and ~2080–2102) |
| `frontend/tests/aurora_assert.mjs` | Drive the new two-step flow; assert rail + persistent hero | Modify (lines ~137–175) |

No change to `Flashcards.tsx` (orchestrator) — it passes the same props to `SessionSetup`. No change to `types.ts`, `StudyStage.tsx`, `RecallCard.tsx`, `RevealBack.tsx`, `FlashShell.tsx`.

**Test strategy.** This is a CSS/structure redesign; the project's real test is the Playwright harness. We write the updated harness expectations FIRST (Task 1), confirm it fails against the current single-screen UI, then implement until it passes (Task 6). Per-task fast feedback is `npm run typecheck`; the full harness (needs a running server) runs at the end.

**Running the harness (used in Task 1 and Task 6):**
```bash
# terminal A — from frontend/
npm run dev
# terminal B — from frontend/ (default base is http://127.0.0.1:3000)
node tests/aurora_assert.mjs
```
A pass prints the flashcards PASS lines and exits 0; a fail prints `FAIL: …` and exits 1.

---

## Task 1: Update the harness for the two-step flow (failing test first)

**Files:**
- Modify: `frontend/tests/aurora_assert.mjs` (the flashcards block, ~lines 137–175)

- [ ] **Step 1: Rewrite the flashcards block to walk the two steps**

Find this block (it currently clicks `flash-start` straight after `flash-setup`):

```js
await np.goto(base + "/flashcards", { waitUntil: "domcontentloaded" });
await np.waitForSelector('[data-testid="flash-setup"]', { timeout: 15000 });
const fcH1 = await np.locator("main h1").count();
if (fcH1 !== 1) { console.error(`FAIL: flashcards main h1 count = ${fcH1}`); process.exit(1); }
// immersive: the rail falls away on /flashcards (like the Tutor); exit affordance present.
if ((await np.locator('[data-testid="flash-exit"]').count()) < 1) { console.error("FAIL: flashcards exit affordance missing"); process.exit(1); }
// Mixed is selected by default — Start commits straight away (topics are unmocked here).
await np.locator('[data-testid="flash-start"]').click();
await np.waitForSelector('[data-testid="study-stage"]', { timeout: 15000 });
```

Replace it (down to but NOT including the `await np.locator(".flash-recall").fill(...)` line) with:

```js
await np.goto(base + "/flashcards", { waitUntil: "domcontentloaded" });
await np.waitForSelector('[data-testid="flash-setup"]', { timeout: 15000 });
const fcH1 = await np.locator("main h1").count();
if (fcH1 !== 1) { console.error(`FAIL: flashcards main h1 count = ${fcH1}`); process.exit(1); }
// immersive: the rail falls away on /flashcards (like the Tutor); exit affordance present.
if ((await np.locator('[data-testid="flash-exit"]').count()) < 1) { console.error("FAIL: flashcards exit affordance missing"); process.exit(1); }

// stepped selection: step 1 (Session) shows the 2-segment progress rail and the hero,
// then Continue advances to step 2 (Topic) where Mixed is selected by default and Start
// commits. Tag the hero node on step 1 so we can prove it PERSISTS (morphs, not remounts)
// across the step change.
if ((await np.locator('[data-testid="flash-rail"]').count()) < 1) { console.error("FAIL: flashcards progress rail missing on step 1"); process.exit(1); }
if ((await np.locator('[data-testid="flash-setup"][data-step="1"]').count()) < 1) { console.error("FAIL: flashcards did not start on step 1"); process.exit(1); }
await np.evaluate(() => { const h = document.querySelector('[data-testid="flash-hero"]'); if (h) h.dataset.persistMark = "1"; });
await np.locator('[data-testid="flash-continue"]').click();
await np.waitForSelector('[data-testid="flash-setup"][data-step="2"]', { timeout: 15000 });
const heroPersisted = await np.evaluate(() => {
  const h = document.querySelector('[data-testid="flash-hero"]');
  return !!(h && h.dataset.persistMark === "1");
});
if (!heroPersisted) { console.error("FAIL: flashcards hero did not persist across the step change (it remounted)"); process.exit(1); }
console.log("PASS: Flashcards — stepped Session→Topic flow, hero persists across the morph");
// Mixed is selected by default on step 2 — Start commits straight away (topics are unmocked here).
await np.locator('[data-testid="flash-start"]').click();
await np.waitForSelector('[data-testid="study-stage"]', { timeout: 15000 });
```

Leave the rest of the flashcards block (the `.flash-recall` fill, grading wait, `flash-score`, `flash-compare-label`, and `--flash-topic-hue` checks) UNCHANGED.

- [ ] **Step 2: Run the harness to verify it FAILS against the current UI**

```bash
# terminal A (frontend/): npm run dev
# terminal B (frontend/):
node tests/aurora_assert.mjs
```
Expected: FAIL — `FAIL: flashcards progress rail missing on step 1` (the current single screen has no rail and no `flash-continue`). This confirms the test targets the new flow. (If `npm run dev` is not already running, start it first.)

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/aurora_assert.mjs
git commit -m "test(flashcards): expect two-step Session→Topic selection + persistent hero"
```

---

## Task 2: Create StepSession (step 1 content)

**Files:**
- Create: `frontend/src/aurora/components/flashcards/StepSession.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";
/* StepSession — step 1 of the flashcards setup: the calm "how" screen. Difficulty
   and length pill groups + Continue. No hero (the shared hero lives in the shell and
   morphs across steps). */
import { type Difficulty, LENGTHS } from "./types";

interface Props {
  difficulty: Difficulty;
  pickDifficulty: (d: Difficulty) => void;
  sessionLength: number;
  setSessionLength: (n: number) => void;
  onContinue: () => void;
}

export function StepSession({
  difficulty, pickDifficulty, sessionLength, setSessionLength, onContinue,
}: Props) {
  return (
    <div className="flash-step-body flash-step-session">
      <div className="flash-step-lede">
        <h2 className="flash-setup-title">Flashcards</h2>
        <p className="flash-setup-help">Active recall, one card at a time. First, set the pace.</p>
      </div>

      <div className="flash-setup-controls">
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
      </div>

      <div className="flash-step-foot">
        <button type="button" className="flash-start flash-press" data-testid="flash-continue"
          onClick={onContinue}>Continue →</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npm run typecheck
```
Expected: PASS (no errors). `StepSession` is not yet imported anywhere, which is fine.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/flashcards/StepSession.tsx
git commit -m "feat(flashcards): StepSession — step 1 (difficulty + length + Continue)"
```

---

## Task 3: Create StepTopic (step 2 content)

**Files:**
- Create: `frontend/src/aurora/components/flashcards/StepTopic.tsx`

- [ ] **Step 1: Write the component**

`PREVIEW` is bumped from the old 5 to 6 (enlarged tiles still fit one viewport; only the "Show all" state scrolls). The `as React.CSSProperties` cast with no `React` import mirrors the existing `SessionSetup.tsx`/codebase pattern and compiles under the project's TS config.

```tsx
"use client";
/* StepTopic — step 2 of the flashcards setup: the vivid "what" screen. The topic
   gallery (Mixed selected by default) fills the page; picking a tile floods the
   setup's --flash-topic-hue. Back returns to step 1; Start commits the set. No hero
   (the shared hero lives in the shell, shrunk to a badge above this content). */
import type { FlashcardSetInfo } from "@/hooks/useFlashcards";
import { topicHue } from "./types";

const PREVIEW = 6;

interface Props {
  sets: FlashcardSetInfo[];
  selected: string | null;
  setSelected: (key: string | null) => void;
  showAll: boolean;
  setShowAll: (v: boolean) => void;
  onBack: () => void;
  onStart: () => void;
}

export function StepTopic({
  sets, selected, setSelected, showAll, setShowAll, onBack, onStart,
}: Props) {
  const visible = showAll ? sets : sets.slice(0, PREVIEW);
  const hiddenCount = sets.length - visible.length;

  return (
    <div className="flash-step-body flash-step-topic">
      <div className="flash-step-lede">
        <h2 className="flash-setup-title">Choose a topic</h2>
        <p className="flash-setup-help">Pick a colour to focus a topic, or go Mixed for a spread.</p>
      </div>

      <section className="flash-topics" aria-label="Topics">
        <button type="button"
          className={`flash-topic is-mixed flash-press${selected === null ? " is-selected" : ""}`}
          aria-pressed={selected === null} onClick={() => setSelected(null)}>
          <span className="flash-topic-label">Mixed</span>
        </button>
        {visible.map((s) => (
          <button key={s.set_key} type="button" disabled={s.total === 0}
            className={`flash-topic flash-press${selected === s.set_key ? " is-selected" : ""}`}
            style={{ "--flash-topic-hue": topicHue(s.topic_key) } as React.CSSProperties}
            aria-pressed={selected === s.set_key} onClick={() => setSelected(s.set_key)}>
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

      <div className="flash-step-foot flash-step-foot-split">
        <button type="button" className="flash-back flash-press" data-testid="flash-back"
          onClick={onBack}>← Back</button>
        <button type="button" className="flash-start flash-press" data-testid="flash-start"
          onClick={onStart}>Start session →</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npm run typecheck
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/flashcards/StepTopic.tsx
git commit -m "feat(flashcards): StepTopic — step 2 (topic gallery + Back/Start)"
```

---

## Task 4: Rewrite SessionSetup as the two-step shell

**Files:**
- Modify (full rewrite): `frontend/src/aurora/components/flashcards/SessionSetup.tsx`

- [ ] **Step 1: Replace the whole file**

Key points: `HeroPlate` is rendered ONCE in the shell, OUTSIDE the `key={step}` content `div`, so its DOM node persists across the step change (it morphs via CSS keyed on `data-step`; it does not remount). It carries `data-testid="flash-hero"` for the harness persistence check. The rail's segment classes: seg 1 is `is-active` on step 1 and `is-done` on step 2; seg 2 is `is-active` on step 2.

```tsx
"use client";
/* SessionSetup — the two-step flashcards selection shell. Owns the step (1|2),
   slide direction, topic pick, and "show all" state; renders a 2-segment progress
   rail, the PERSISTENT slit-lamp hero (one node that morphs from centerpiece to
   badge across steps — it lives here so it never unmounts), and the keyed step
   content (StepSession → StepTopic) that slides/cross-fades. Mixed is selected by
   default so Start always works. Picking a topic cross-fades the whole setup to that
   topic's hue. */
import { useState } from "react";
import type { FlashcardSetInfo } from "@/hooks/useFlashcards";
import { PlateWell } from "@/aurora/components/PlateWell";
import { PLATE } from "@/aurora/media";
import { type Difficulty, topicHue } from "./types";
import { StepSession } from "./StepSession";
import { StepTopic } from "./StepTopic";

interface Props {
  topicSets: FlashcardSetInfo[] | undefined;
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  sessionLength: number;
  setSessionLength: (n: number) => void;
  onStart: (setKey: string | null) => void;
}

/** Persistent slit-lamp porthole. Rendered once by the shell; its size morphs across
 *  steps via [data-step] on the setup root (see aurora.css), the auto-drift running
 *  underneath. data-testid lets the harness prove it persists across the step change. */
function HeroPlate() {
  return (
    <div className="flash-hero-stage" data-testid="flash-hero">
      <div className="flash-hero-wrap">
        <PlateWell
          src={PLATE.flashcards}
          alt="Slit-lamp optical section through the cornea, anterior chamber and crystalline lens"
          ratio={1}
          className="flash-hero"
        />
      </div>
      <p className="flash-hero-cap">Slit-lamp optical section</p>
    </div>
  );
}

export function SessionSetup({
  topicSets, difficulty, setDifficulty, sessionLength, setSessionLength, onStart,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [direction, setDirection] = useState<"fwd" | "back">("fwd");
  const [selected, setSelected] = useState<string | null>(null); // null = Mixed
  const [showAll, setShowAll] = useState(false);

  const sets = (topicSets ?? []).filter((s) => s.difficulty === difficulty);
  const pickDifficulty = (d: Difficulty) => { setDifficulty(d); setSelected(null); };
  const goTopic = () => { setDirection("fwd"); setStep(2); };
  const goBack = () => { setDirection("back"); setStep(1); };

  // The whole setup adopts the selected topic's hue (Mixed → brand blue 212).
  const selectedSet = sets.find((s) => s.set_key === selected);
  const setupHue = selectedSet ? topicHue(selectedSet.topic_key) : 212;

  return (
    <div className="flash-setup" data-testid="flash-setup" data-step={step}
      style={{ "--flash-topic-hue": setupHue } as React.CSSProperties}>
      <div className="flash-rail" data-testid="flash-rail" role="progressbar"
        aria-valuemin={1} aria-valuemax={2} aria-valuenow={step} aria-label="Setup progress">
        <span className={`flash-rail-seg${step === 1 ? " is-active" : ""}${step > 1 ? " is-done" : ""}`} />
        <span className={`flash-rail-seg${step === 2 ? " is-active" : ""}`} />
      </div>

      <div className="flash-stage">
        <HeroPlate />
        <div className={`flash-step flash-step-${direction}`} key={step}>
          {step === 1 ? (
            <StepSession
              difficulty={difficulty}
              pickDifficulty={pickDifficulty}
              sessionLength={sessionLength}
              setSessionLength={setSessionLength}
              onContinue={goTopic}
            />
          ) : (
            <StepTopic
              sets={sets}
              selected={selected}
              setSelected={setSelected}
              showAll={showAll}
              setShowAll={setShowAll}
              onBack={goBack}
              onStart={() => onStart(selected)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npm run typecheck
```
Expected: PASS. (Imports of `StepSession`/`StepTopic` now resolve; `LENGTHS`/`PreviewWell` no longer referenced here is fine.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/flashcards/SessionSetup.tsx
git commit -m "feat(flashcards): SessionSetup shell — rail + persistent hero + keyed steps"
```

---

## Task 5: CSS — fill-the-page layout, progress rail, step slide, hero morph

**Files:**
- Modify: `frontend/src/aurora/aurora.css`

The current setup CSS spans roughly lines **1880–1978** (`/* ── Setup ── */` through the `@keyframes flash-gradient` rule). We replace the layout-bearing parts and ADD the rail/stage/step/hero-morph rules. The hero *visual* rules (`.flash-hero`, `.flash-hero .aurora-plate-img`, `.flash-hero-wrap::before`, glow ring) and the topic-tile visual rules (`.flash-topic`, `::before`, `is-selected`, `is-mixed`, `is-more`, labels) are REUSED — only sizes/density and the wrapper layout change.

- [ ] **Step 1: Replace the `.flash-setup` + head + hero-wrap layout rules**

Replace the block from `.flash-setup { … }` (≈ line 1881) through `.flash-hero-cap { … }` (≈ line 1915) with the following. (The decorative `.flash-hero`, `.flash-hero .aurora-plate-img`, and `.flash-hero-wrap::before` rules that sit between `.flash-hero-wrap` and `.flash-hero-cap` are kept verbatim — paste them back unchanged in their original spot; only `.flash-setup`, `.flash-setup-head/title/help`, `.flash-hero-stage`, `.flash-hero-wrap`, and `.flash-hero-cap` change as shown.)

```css
/* ── Setup (two-step: Session → Topic) ──
   Fills the immersive viewport as a flex column: rail (top) · stage (flex:1, the
   persistent hero + the keyed step content) · the step's own footer. No page scroll
   in the default state; only an overflowing region scrolls internally. */
.flash-setup { flex: 1; min-height: 0; display: flex; flex-direction: column;
  width: min(1040px, 94vw); margin: 0 auto; padding: clamp(18px, 3vh, 30px) 0 clamp(20px, 3vh, 32px);
  --flash-topic-c: hsl(var(--flash-topic-hue) 64% 40%);
  --flash-topic-soft: color-mix(in srgb, hsl(var(--flash-topic-hue) 80% 55%) 14%, var(--surface));
  transition: --flash-topic-hue .5s ease; }

/* Stage: centers the hero + step content as one group and fills the height. */
.flash-stage { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: clamp(14px, 2.6vh, 30px); width: 100%; }
.flash-setup[data-step="2"] .flash-stage { justify-content: flex-start; }

.flash-setup-head { text-align: center; }
.flash-eyebrow { font-size: 12px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--g-blue); margin: 0; }
.flash-setup-title { font-size: clamp(34px, 5vw, 52px); font-weight: 700; letter-spacing: -.02em; margin: 6px 0 8px; color: var(--ink); }
.flash-setup-help { font-size: clamp(15px, 1.5vw, 17px); color: var(--ink-2); max-width: 52ch; margin: 0 auto; }

/* Slit-lamp hero — one PERSISTENT node that MORPHS between steps. Step 1: large,
   vertically centered. Step 2: shrinks to a top-center badge so the gallery fills the
   page. The size (width, ratio-locked square) animates on a springy ease; the
   auto-drift --hx/--hy keyframes keep running underneath. */
.flash-hero-stage { text-align: center; }
.flash-hero-wrap { position: relative; width: clamp(220px, 34vh, 320px); margin: 0 auto;
  perspective: 900px;
  animation: flash-hero-drift-x 14s ease-in-out infinite, flash-hero-drift-y 19s ease-in-out infinite;
  transition: width .52s cubic-bezier(.22, 1, .36, 1); }
.flash-setup[data-step="2"] .flash-hero-wrap { width: clamp(64px, 9vh, 92px); }
```

Then KEEP the existing decorative hero rules unchanged (do not delete them):
`.flash-hero-wrap::before { … }`, `.flash-hero { … }`, `.flash-hero .aurora-plate-img { … }`, `.flash-hero .aurora-plate-caption { display: none; }`.

Finally replace `.flash-hero-cap` with a version that fades out on step 2:

```css
.flash-hero-cap { margin: 12px 0 0; font-family: var(--font-mono); font-size: 11px; letter-spacing: .14em;
  text-transform: uppercase; color: var(--ink-3); transition: opacity .3s ease, max-height .4s ease, margin .4s ease;
  max-height: 2em; overflow: hidden; }
.flash-setup[data-step="2"] .flash-hero-cap { opacity: 0; max-height: 0; margin: 0; }
```

- [ ] **Step 2: Add the progress rail rules (insert right after the `.flash-setup-help` rule)**

```css
/* Progress rail — two segments that fill/glow as you advance; segment 2 adopts the
   selected topic hue on step 2. */
.flash-rail { display: flex; gap: 10px; width: min(420px, 70%); margin: 0 auto clamp(8px, 1.4vh, 16px); }
.flash-rail-seg { flex: 1; height: 5px; border-radius: 999px; background: var(--hairline);
  position: relative; overflow: hidden; transition: background .4s ease; }
.flash-rail-seg.is-active { background: color-mix(in srgb, var(--flash-topic-c) 70%, var(--hairline)); }
.flash-rail-seg.is-active::after { content: ""; position: absolute; inset: 0; border-radius: inherit;
  background: linear-gradient(90deg, transparent, hsl(var(--flash-topic-hue) 90% 70% / .9), transparent);
  animation: flash-rail-sheen 1.8s ease-in-out infinite; }
.flash-rail-seg.is-done { background: var(--flash-topic-c); }
@keyframes flash-rail-sheen { 0% { transform: translateX(-100%); } 60%, 100% { transform: translateX(100%); } }
```

- [ ] **Step 3: Add the step container + slide keyframes + per-step body/footer rules (insert after the rail rules)**

```css
/* Keyed step content — remounts per step to replay the slide. Forward slides in from
   the right; Back from the left. The body is a flex column so step 2's gallery can
   fill (and scroll internally if needed) while its footer stays pinned. */
.flash-step { width: 100%; flex: 1; min-height: 0; display: flex; flex-direction: column; }
.flash-step-fwd { animation: flash-step-in-fwd .42s cubic-bezier(.2, .8, .2, 1) both; }
.flash-step-back { animation: flash-step-in-back .42s cubic-bezier(.2, .8, .2, 1) both; }
@keyframes flash-step-in-fwd { from { opacity: 0; transform: translateX(34px); } to { opacity: 1; transform: none; } }
@keyframes flash-step-in-back { from { opacity: 0; transform: translateX(-34px); } to { opacity: 1; transform: none; } }

.flash-step-body { width: 100%; flex: 1; min-height: 0; display: flex; flex-direction: column;
  gap: clamp(16px, 2.6vh, 30px); }
.flash-step-session { justify-content: center; align-items: center; }
.flash-step-topic { justify-content: flex-start; }
.flash-step-lede { text-align: center; }

.flash-step-foot { display: flex; justify-content: center; gap: 14px; padding-top: clamp(6px, 1.2vh, 14px); }
.flash-step-foot-split { justify-content: space-between; align-items: center; }
.flash-back { padding: 14px 24px; border: 1px solid var(--hairline); border-radius: 999px; background: var(--surface);
  color: var(--ink-2); font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; }
.flash-back:hover { color: var(--ink); border-color: color-mix(in srgb, var(--flash-topic-c) 40%, var(--hairline)); }
```

- [ ] **Step 4: Enlarge pills (replace `.flash-pill` and add a controls width nudge)**

Replace the existing `.flash-pill` rule (≈ line 1920–1921) with the enlarged version, and bump the controls gap:

```css
.flash-setup-controls { display: flex; flex-wrap: wrap; gap: clamp(16px, 3vh, 26px) 40px; justify-content: center; }
.flash-pill { padding: 12px 26px; border: none; border-radius: 999px; background: transparent; color: var(--ink-2);
  font: inherit; font-size: 16px; font-weight: 600; cursor: pointer; }
```
(Keep `.flash-control`, `.flash-control-label`, `.flash-pills`, and `.flash-pill[aria-checked="true"]` as they are.)

- [ ] **Step 5: Enlarge tiles + make the gallery fill and scroll internally**

Replace the `.flash-topics` rule (≈ line 1924) and the `.flash-topic` `min-height`/padding (within the rule at ≈ line 1929–1930) as follows. The grid grows to fill the step body and scrolls internally only when content exceeds the space.

```css
.flash-topics { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px;
  flex: 1; min-height: 0; overflow-y: auto; align-content: start; padding: 2px; }
```
And in the `.flash-topic { … }` rule, change `min-height: 86px; padding: 18px 20px;` to:
```css
  min-height: clamp(96px, 15vh, 132px); padding: 20px 22px;
```
(Everything else in `.flash-topic`, its `::before` ring, `is-selected`, `is-mixed`, `is-more`, and label rules stays unchanged. `.flash-topic-label` may optionally be nudged up; not required.)

- [ ] **Step 6: Remove the now-unused old footer rules (`.flash-setup-foot`)**

Delete the `.flash-setup-foot { … }` rule (≈ line 1973) — footers now live per-step (`.flash-step-foot`). KEEP `.flash-start` and `@keyframes flash-gradient` (Continue and Start reuse `.flash-start`).

- [ ] **Step 7: Extend reduced-motion to neutralise the new motion**

In BOTH reduced-motion blocks (`html[data-motion="reduce"]` at ≈ line 2081 and `@media (prefers-reduced-motion: reduce)` at ≈ line 2095): add `.flash-step` to the `animation: none` group, and add `.flash-hero-wrap` to the `transition: none` group. Concretely, in the `html[data-motion="reduce"]` block change:

```css
html[data-motion="reduce"] .flash-confetti i,
html[data-motion="reduce"] .flash-loader i,
html[data-motion="reduce"] .flash-step,
html[data-motion="reduce"] .flash-coach { animation: none; }
```
and
```css
html[data-motion="reduce"] .flash-hero,
html[data-motion="reduce"] .flash-hero .aurora-plate-img,
html[data-motion="reduce"] .flash-hero-wrap,
html[data-motion="reduce"] .flash-hero-wrap::before { transform: none; transition: none; }
```
Make the mirrored additions inside the `@media (prefers-reduced-motion: reduce)` block (add `.flash-step` to its `animation: none` list and `.flash-hero-wrap` to its `transform/transition: none` list).

- [ ] **Step 8: Typecheck (CSS has no typecheck; verify the app compiles)**

```bash
cd frontend && npm run typecheck
```
Expected: PASS (CSS changes don't affect TS, but this catches any stray edit).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/aurora/aurora.css
git commit -m "feat(flashcards): fill-page two-step layout — rail, step slide, hero morph"
```

---

## Task 6: Verify end-to-end (build + harness green) and finalize

**Files:** none (verification only)

- [ ] **Step 1: Typecheck + production build**

```bash
cd frontend && npm run typecheck && npm run build
```
Expected: typecheck PASS; build completes with no errors.

- [ ] **Step 2: Run the harness against a running server**

```bash
# terminal A (frontend/): npm run dev
# terminal B (frontend/):
node tests/aurora_assert.mjs
```
Expected: PASS — including the new lines:
- `PASS: Flashcards — stepped Session→Topic flow, hero persists across the morph`
- `PASS: Flashcards — single setup, typed recall is AI-graded, flip reveals the model answer`
- `PASS: flashcards exposes per-topic --flash-topic-hue = …`

And no `FAIL:` lines anywhere (full suite stays green). If a flashcards step times out, confirm `data-step` flips to `"2"` after Continue and that `flash-continue`/`flash-start`/`flash-rail`/`flash-hero` testids are present.

- [ ] **Step 3: Manual visual check at two sizes (fill, no overflow)**

With `npm run dev` running, open `/flashcards` and verify:
- **1440×900:** step 1 hero is large and the hero + pills sit centered with little dead space; Continue advances; the hero **shrinks smoothly** (no jump/flash) to the top badge; step 2 gallery fills the width; nothing clips the footer; the page itself does not scroll in the default (preview) state.
- **390px wide:** content fits; only the topic grid scrolls internally if needed; rail + footer stay put.
- Pick a topic → the whole setup + rail segment 2 cross-fade to its hue. Back → returns to step 1, slides from the left, hero grows back.

- [ ] **Step 4: Final commit (if Step 3 prompted any tweaks; otherwise skip)**

```bash
git add -A frontend/src/aurora/aurora.css
git commit -m "fix(flashcards): density/fit tweaks from visual check"
```

- [ ] **Step 5: Update the flashcards memory**

Append a dated update to `C:\Users\caleb\.claude\projects\C--Users-caleb-OneDrive-Desktop-SNEC-AI-CHATBOT\memory\project_flashcards_aperture_redesign.md` (and refresh its one-line in `MEMORY.md`) noting: selection split into a two-step Session→Topic flow; `SessionSetup` is now a shell + `StepSession`/`StepTopic`; persistent slit-lamp hero morphs centerpiece→badge via `[data-step]`; 2-segment `flash-rail`; fill-the-viewport flex layout (no page scroll, gallery scrolls internally); harness walks Continue→Start and asserts hero persistence; PREVIEW 5→6.

---

## Self-Review Notes (filled during planning)

- **Spec coverage:** 2-step Session→Topic (Tasks 2–4) ✓ · progress rail + Back + Continue (Tasks 4–5) ✓ · slide/cross-fade transition (Task 5 step 3) ✓ · persistent hero morph (Task 4 structure + Task 5 step 1; tested Task 1) ✓ · color flow `--flash-topic-hue` (Task 4 `setupHue`, reused CSS) ✓ · fill-page/no-overflow density (Task 5 steps 1,3,5) ✓ · mechanics unchanged (orchestrator untouched) ✓ · test impact (Task 1) ✓.
- **Placeholders:** none — every step has concrete code/commands.
- **Type/name consistency:** prop names match across shell↔steps (`pickDifficulty`, `onContinue`, `onBack`, `onStart`, `sets`, `selected`, `setSelected`, `showAll`, `setShowAll`); testids match the harness (`flash-setup`, `flash-rail`, `flash-hero`, `flash-continue`, `flash-back`, `flash-start`); `data-step` values (`"1"`/`"2"`) match between the shell, CSS selectors, and the harness.
