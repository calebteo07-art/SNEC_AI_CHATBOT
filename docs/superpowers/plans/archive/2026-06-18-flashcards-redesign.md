# Flashcards Frontend Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the flashcards frontend from scratch as a light, on-brand, no-metaphor study tool — immersive, single setup screen, centered focus card with a compare-on-reveal flip, per-topic glyphs, score-driven color, expressive numerals, and rich CSS-only motion — while keeping every mechanic (AI grade, XP, SM-2, weak-card retry) unchanged.

**Architecture:** `Flashcards.tsx` (the orchestrator) keeps all session/grading logic; we replace only the presentation components it renders. Six prism/aperture components are deleted and replaced by `FlashShell`, `SessionSetup`, `StudyStage`, `RecallCard`, `RevealBack`, `TopicGlyph`. The dark `[data-theme="aperture"]` CSS block in `aurora.css` is replaced by a fresh light `flash-*` block driven by the global AURORA tokens plus one score-driven custom property.

**Tech Stack:** Next.js (App Router) + React + TypeScript, TanStack Query (existing hooks, untouched), CSS-only motion (`motion.css` patterns + `useCountUp`; GSAP wrappers are forbidden — `MotionProvider` is not mounted). Verification: `npm run typecheck` (inner loop) and the Playwright integration harness `frontend/tests/aurora_assert.mjs` (acceptance).

**Verification model:** This project has no frontend unit-test runner; the executable test is the Playwright harness. So we follow integration-level TDD: **Task 1 flips the harness to the new contract (RED)**, every component task is gated by `npm run typecheck`, and **Task 12 runs the harness to GREEN (18/18)**. All commands run from `frontend/`.

---

## File Structure

All component paths are under `frontend/src/aurora/components/flashcards/`.

| File | Responsibility | Status |
|---|---|---|
| `types.ts` | Shared primitives + new `scoreTier`/`scoreHue` helpers | Modify (additive) |
| `TopicGlyph.tsx` | Per-topic monochrome SVG glyph, keyed by `topic_key`, category fallback | Create |
| `FlashShell.tsx` | Immersive light root, `sr-only` h1, Exit affordance, `AchievementManager` | Create |
| `SessionSetup.tsx` | Single setup screen: difficulty + length pills, topic gallery, Start | Create |
| `RevealBack.tsx` | Card back face: count-up score, score-driven color, your-vs-model compare, actions | Create |
| `RecallCard.tsx` | Centered card + springy 3D flip; front (question + recall + submit) / back | Create |
| `StudyStage.tsx` | Active-study layout: top bar, coach line, `RecallCard`, readout; keyboard advance | Create |
| `Flashcards.tsx` (`src/aurora/screens/`) | Orchestrator — rewire to new components, no logic change | Modify |
| `aurora.css` (`src/aurora/`) | Replace aperture/focus/prism block (~L1830–2050) with `flash-*` block | Modify |
| `aurora_assert.mjs` (`tests/`) | Migrate flashcards + a11y selectors to `flash-*`, single-setup flow | Modify |
| `PrismStage/ApertureSelect/StudyDeck/FocusCard/FocusCoach/SessionReadout.tsx` | Old presentation | Delete |

---

## Task 1: Flip the test harness to the new contract (RED)

**Files:**
- Modify: `frontend/tests/aurora_assert.mjs` (flashcards block ~L137–165; a11y block ~L202–212)

The current harness walks the 3-step stepper and asserts `aperture-*`/`focus-*` hooks. Rewrite it to the new single-setup + `flash-*` contract. After this task the harness FAILS against the still-old UI — that is the red state we build to green.

- [ ] **Step 1: Replace the flashcards assertion block.** Find the block that begins with the comment `// flashcards: "The Aperture"` (~L137) and ends at the `console.log("PASS: Flashcards …")` line (~L165). Replace the whole block with:

```js
// flashcards: light, no-metaphor "Flashcards" — a single setup screen (difficulty +
// length pills, topic gallery with Mixed selected by default) then a centered focus
// card: typed recall is AI-graded, the card flips to reveal score + model answer.
await navCtx.route("**/api/flashcards/check", (r) => r.fulfill(JSON_OK({ score: 82, feedback: "Close — IOP runs about 10–21 mmHg.", mock_mode: true })));

await np.goto(base + "/flashcards", { waitUntil: "domcontentloaded" });
await np.waitForSelector('[data-testid="flash-setup"]', { timeout: 15000 });
const fcH1 = await np.locator("main h1").count();
if (fcH1 !== 1) { console.error(`FAIL: flashcards main h1 count = ${fcH1}`); process.exit(1); }
// immersive: the rail falls away on /flashcards (like the Tutor); exit affordance present.
if ((await np.locator('[data-testid="flash-exit"]').count()) < 1) { console.error("FAIL: flashcards exit affordance missing"); process.exit(1); }
// Mixed is selected by default — Start commits straight away (topics are unmocked here).
await np.locator('[data-testid="flash-start"]').click();
await np.waitForSelector('[data-testid="study-stage"]', { timeout: 15000 });
await np.locator(".flash-recall").fill("About 10 to 21 mmHg");
await np.locator('[data-testid="flash-submit"]').click();
await np.waitForSelector('[data-testid="flash-score"]', { timeout: 8000 });
await np.waitForFunction(() => {
  const el = document.querySelector('[data-testid="flash-score"]');
  return !!el && el.textContent.includes("82");
}, { timeout: 8000 });
const graded = await np.locator('[data-testid="flash-score"]').first().innerText();
if (!graded.includes("82")) { console.error(`FAIL: flashcards AI grade not shown (score='${graded}')`); process.exit(1); }
if ((await np.locator('.flash-compare-label:has-text("Model answer")').count()) < 1) {
  console.error("FAIL: flashcards model answer not revealed after grading"); process.exit(1);
}
console.log("PASS: Flashcards — single setup, typed recall is AI-graded, flip reveals the model answer");
```

- [ ] **Step 2: Migrate the a11y back-affordance check.** In the A11Y section (~L209–212), the back-affordance line references `[data-testid='aperture-exit']`. Replace that fragment so the selector reads `flash-exit`:

```js
    const back = await np.locator(".aurora-chat-back, [data-testid='flash-exit']").count();
```

(Leave the `A11Y_ROUTES` array and the `/flashcards` membership as-is.)

- [ ] **Step 3: Verify the harness now targets the new contract.** Run typecheck (the harness is JS, but this confirms nothing else broke):

Run: `npm run typecheck`
Expected: PASS (no TS errors — the harness change is test-only).

> The harness itself will only go green in Task 12 once the UI exists. Do not run it yet.

- [ ] **Step 4: Commit.**

```bash
git add frontend/tests/aurora_assert.mjs
git commit -m "test(flashcards): migrate harness to new flash-* single-setup contract"
```

---

## Task 2: `TopicGlyph` — per-topic SVG glyphs

**Files:**
- Create: `frontend/src/aurora/components/flashcards/TopicGlyph.tsx`

A small monochrome line glyph per topic. A curated set of primitives mapped from `topic_key`, with an eye fallback for any unmapped key (and `__mixed` for the Mixed card). All inherit `currentColor`.

- [ ] **Step 1: Create the component.**

```tsx
"use client";
/* TopicGlyph — a small monochrome line glyph per flashcard topic. A curated set of
   primitives is mapped from topic_key (see TOPIC_GLYPH); unknown keys fall back to
   the eye. All glyphs inherit currentColor and share a 24×24 box. */

type GlyphName =
  | "eye" | "retina" | "drop" | "gauge" | "dots" | "grid" | "scan" | "plot"
  | "cornea" | "pupil" | "alert" | "clipboard" | "acuity" | "ruler" | "topo" | "cross" | "mixed";

const box = {
  width: 22, height: 22, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 1.7,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

const GLYPHS: Record<GlyphName, React.ReactNode> = {
  eye: (<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>),
  retina: (<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></>),
  drop: (<path d="M12 3s6 6.5 6 10.5A6 6 0 1 1 6 13.5C6 9.5 12 3 12 3Z" />),
  gauge: (<><path d="M4 18a8 8 0 0 1 16 0" /><path d="M12 18l4-5" /><circle cx="12" cy="18" r="1.2" /></>),
  dots: (<><circle cx="8" cy="9" r="1.4" /><circle cx="13" cy="7.5" r="1.4" /><circle cx="16" cy="11" r="1.4" /><circle cx="9.5" cy="14" r="1.4" /><circle cx="14.5" cy="15" r="1.4" /></>),
  grid: (<><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M12 4v16M4 12h16" /></>),
  scan: (<><path d="M3 14c3 0 3-4 6-4s3 4 6 4 3-4 6-4" /><path d="M3 9h18" opacity="0.5" /></>),
  plot: (<><circle cx="12" cy="12" r="9" /><path d="M12 6v12M6 12h12" opacity="0.5" /><circle cx="9" cy="10" r="1" /><circle cx="15" cy="14" r="1" /></>),
  cornea: (<><path d="M3 12a9 9 0 0 1 18 0" /><path d="M5 12a7 7 0 0 1 14 0" opacity="0.6" /><path d="M7 12a5 5 0 0 1 10 0" opacity="0.35" /></>),
  pupil: (<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.4" /></>),
  alert: (<><path d="M12 4 3 19h18L12 4Z" /><path d="M12 10v4M12 17h.01" /></>),
  clipboard: (<><rect x="6" y="4" width="12" height="16" rx="1.6" /><path d="M9 4h6v2H9zM8.5 10h7M8.5 14h5" /></>),
  acuity: (<><path d="M7 5h10M7 5v14M7 12h6M7 19h10" /></>),
  ruler: (<><rect x="3" y="8" width="18" height="8" rx="1.2" /><path d="M7 8v3M11 8v4M15 8v3M19 8v4" /></>),
  topo: (<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5.5" opacity="0.6" /><circle cx="12" cy="12" r="2" opacity="0.35" /></>),
  cross: (<><path d="M12 4v16M4 12h16" /><circle cx="12" cy="12" r="9" opacity="0.5" /></>),
  mixed: (<><circle cx="9" cy="9" r="4" /><circle cx="15" cy="15" r="4" opacity="0.6" /></>),
};

/** topic_key → glyph. Keys come from tools/flashcards/flashcard_sets.py (CLINICAL + OT). */
const TOPIC_GLYPH: Record<string, GlyphName> = {
  // CLINICAL
  ocular_emergencies: "alert", red_eye: "eye", triage: "alert", history_taking: "clipboard",
  distance_va: "acuity", near_vision: "acuity", pinhole: "pupil", iop_nct: "gauge",
  eye_drops: "drop", pupil_dilation: "pupil", colour_vision: "dots", amsler_macula: "grid",
  fall_risk: "alert", perioperative: "cross", abbreviations: "clipboard",
  // OT
  oct_macula: "scan", oct_rnfl: "retina", hvf: "plot", gvf: "plot", ascan_biometry: "ruler",
  optical_biometry: "ruler", endothelial: "cornea", asoct: "scan", flare: "dots",
  corneal_topography: "topo", pam: "acuity", hrt: "retina", orthoptics: "eye",
  dayward_theatre: "cross", auto_refraction: "ruler",
};

export function TopicGlyph({ topicKey }: { topicKey: string }) {
  const name: GlyphName = topicKey === "__mixed" ? "mixed" : (TOPIC_GLYPH[topicKey] ?? "eye");
  return (<svg {...box} aria-hidden>{GLYPHS[name]}</svg>);
}
```

- [ ] **Step 2: Verify it compiles.**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add frontend/src/aurora/components/flashcards/TopicGlyph.tsx
git commit -m "feat(flashcards): add per-topic glyph set"
```

---

## Task 3: `types.ts` — score tier + hue helpers

**Files:**
- Modify: `frontend/src/aurora/components/flashcards/types.ts` (append; keep all existing exports)

- [ ] **Step 1: Append the helpers** to the end of `types.ts` (do not change anything above):

```ts
/** Score tiers drive both the reveal color and the coach copy. */
export type ScoreTier = "high" | "good" | "fair" | "low";

export function scoreTier(score: number): ScoreTier {
  const s = Math.max(0, Math.min(100, score));
  if (s >= 85) return "high";
  if (s >= 60) return "good";
  if (s >= 40) return "fair";
  return "low";
}

/** Score → HSL hue (unitless degrees) for the reveal's --flash-score-hue:
 *  high = green, good = blue, fair = amber, low = cool indigo. */
export function scoreHue(score: number): number {
  switch (scoreTier(score)) {
    case "high": return 145;
    case "good": return 212;
    case "fair": return 38;
    default: return 255;
  }
}
```

- [ ] **Step 2: Verify it compiles.**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add frontend/src/aurora/components/flashcards/types.ts
git commit -m "feat(flashcards): add scoreTier/scoreHue helpers"
```

---

## Task 4: `FlashShell` — immersive light root

**Files:**
- Create: `frontend/src/aurora/components/flashcards/FlashShell.tsx`

- [ ] **Step 1: Create the component.** (Module-scope export so its subtree — including the recall textarea — keeps a stable identity across orchestrator re-renders.)

```tsx
"use client";
/* FlashShell — the immersive light root shared by the setup, loading, and study
   states. Defined at module scope so the recall textarea never remounts on a parent
   re-render. Carries the sr-only h1 and the single Exit affordance. */
import type { ReactNode } from "react";
import { Icon } from "@/aurora/icons";
import { AchievementManager } from "@/screens/AchievementToast";

export function FlashShell({
  newAchievements, onDismissAchievement, onExit, children,
}: {
  newAchievements: string[];
  onDismissAchievement: (id: string) => void;
  onExit: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flash-root">
      <h1 className="sr-only">Flashcards</h1>
      <button type="button" className="flash-exit flash-press" data-testid="flash-exit" onClick={onExit}>
        <Icon.back size={16} /> Exit
      </button>
      <AchievementManager achievements={newAchievements} onDismiss={onDismissAchievement} />
      <div className="flash-content">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles.**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add frontend/src/aurora/components/flashcards/FlashShell.tsx
git commit -m "feat(flashcards): add light immersive FlashShell"
```

---

## Task 5: `SessionSetup` — single setup screen

**Files:**
- Create: `frontend/src/aurora/components/flashcards/SessionSetup.tsx`

- [ ] **Step 1: Create the component.**

```tsx
"use client";
/* SessionSetup — one calm light screen: difficulty + length pills and a topic
   gallery. Mixed is selected by default (so Start always works, even when topics
   are empty); clicking a topic only selects it. Start commits the set_key (or null
   for Mixed) to the orchestrator. Changing difficulty resets the selection to Mixed. */
import { useState } from "react";
import type { FlashcardSetInfo } from "@/hooks/useFlashcards";
import { type Difficulty, LENGTHS } from "./types";
import { TopicGlyph } from "./TopicGlyph";

interface Props {
  topicSets: FlashcardSetInfo[] | undefined;
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  sessionLength: number;
  setSessionLength: (n: number) => void;
  onStart: (setKey: string | null) => void;
}

export function SessionSetup({
  topicSets, difficulty, setDifficulty, sessionLength, setSessionLength, onStart,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null); // null = Mixed
  const sets = (topicSets ?? []).filter((s) => s.difficulty === difficulty);
  const pickDifficulty = (d: Difficulty) => { setDifficulty(d); setSelected(null); };

  return (
    <div className="flash-setup" data-testid="flash-setup">
      <header className="flash-setup-head">
        <p className="flash-eyebrow">Active recall</p>
        <h2 className="flash-setup-title">Flashcards</h2>
        <p className="flash-setup-help">Answer from memory, graded by AI. Pick a focus and start.</p>
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
                {l.label} · {l.n}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="flash-topics" aria-label="Topics">
        <button type="button" className={`flash-topic flash-press${selected === null ? " is-selected" : ""}`}
          aria-pressed={selected === null} onClick={() => setSelected(null)}>
          <span className="flash-topic-glyph"><TopicGlyph topicKey="__mixed" /></span>
          <span className="flash-topic-label">Mixed</span>
          <span className="flash-topic-sub">All topics · no repeats</span>
        </button>
        {sets.map((s) => (
          <button key={s.set_key} type="button" disabled={s.total === 0}
            className={`flash-topic flash-press${selected === s.set_key ? " is-selected" : ""}`}
            aria-pressed={selected === s.set_key} onClick={() => setSelected(s.set_key)}>
            <span className="flash-topic-glyph"><TopicGlyph topicKey={s.topic_key} /></span>
            <span className="flash-topic-label">{s.label}</span>
            <span className="flash-topic-sub">{s.completed}/{s.total} seen</span>
          </button>
        ))}
      </section>

      <div className="flash-setup-foot">
        <button type="button" className="flash-start flash-press" data-testid="flash-start"
          onClick={() => onStart(selected)}>Start session →</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles.**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add frontend/src/aurora/components/flashcards/SessionSetup.tsx
git commit -m "feat(flashcards): add single-screen SessionSetup with topic gallery"
```

---

## Task 6: `RevealBack` — the reveal (score + compare)

**Files:**
- Create: `frontend/src/aurora/components/flashcards/RevealBack.tsx`

- [ ] **Step 1: Create the component.**

```tsx
"use client";
/* RevealBack — the card's back face after grading. An oversized count-up score with
   score-driven color (via the --flash-score-hue custom property), the AI feedback,
   the student's answer set beside the model answer, and the actions. */
import { useCountUp } from "@/hooks/useCountUp";
import { type AiFeedback, scoreTier, scoreHue } from "./types";

interface Props {
  aiFeedback: AiFeedback | null;
  cardXp: number;
  userAttempt: string;
  modelAnswer: string;
  onExplain: () => void;
  onAdvance: () => void;
  advanceLabel: string;
}

export function RevealBack({
  aiFeedback, cardXp, userAttempt, modelAnswer, onExplain, onAdvance, advanceLabel,
}: Props) {
  const score = aiFeedback?.score ?? 0;
  const tier = scoreTier(score);
  const { ref: scoreRef, display } = useCountUp<HTMLSpanElement>(score, { duration: 1000 });

  return (
    <div className="flash-reveal" data-tier={tier}
      style={{ ["--flash-score-hue" as string]: scoreHue(score) } as React.CSSProperties}>
      <div className="flash-scoreline">
        <span className="flash-score" data-testid="flash-score">
          <span ref={scoreRef}>{display}</span>{aiFeedback ? <i className="flash-score-max">/100</i> : null}
        </span>
        <span className="flash-xp">+{cardXp} XP</span>
      </div>

      <p className="flash-feedback">
        {aiFeedback ? aiFeedback.feedback : "Graded offline — compare with the model answer below."}
      </p>

      <div className="flash-compare">
        <div className="flash-compare-col is-yours">
          <span className="flash-compare-label">Your answer</span>
          <p>{userAttempt.trim() ? userAttempt : <em>(left blank)</em>}</p>
        </div>
        <div className="flash-compare-col is-model">
          <span className="flash-compare-label">Model answer</span>
          <p>{modelAnswer}</p>
        </div>
      </div>

      <div className="flash-reveal-actions">
        <button type="button" className="flash-tutor flash-press" onClick={onExplain}>
          🎓 Explain this in the Tutor
        </button>
        <button type="button" className="flash-advance flash-press" data-testid="flash-advance" onClick={onAdvance}>
          {advanceLabel}
        </button>
      </div>
    </div>
  );
}
```

> Note: the `data-testid="flash-score"` element must contain the numeric grade — the harness waits for its text to include `82`. The `.flash-compare-label` text "Model answer" is what the harness asserts is revealed.

- [ ] **Step 2: Verify it compiles.**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add frontend/src/aurora/components/flashcards/RevealBack.tsx
git commit -m "feat(flashcards): add RevealBack with score-driven color + answer compare"
```

---

## Task 7: `RecallCard` — centered card with 3D flip

**Files:**
- Create: `frontend/src/aurora/components/flashcards/RecallCard.tsx`

- [ ] **Step 1: Create the component.**

```tsx
"use client";
/* RecallCard — the centered focus card. Front = topic tag, question, a compulsory
   typed recall and Submit; on submit the input is replaced by a calm loader (so it
   can't be pressed twice). On grading it does a springy 3D flip to RevealBack.
   Confetti fires (CSS-only) only on a high score. */
import { useEffect, useRef } from "react";
import { type Flashcard, type AiFeedback, MAX_ANSWER_CHARS } from "./types";
import { TopicGlyph } from "./TopicGlyph";
import { RevealBack } from "./RevealBack";

interface Props {
  card: Flashcard;
  flipKey: string;
  isRetry: boolean;
  deckTitle: string;
  submitted: boolean;
  aiChecking: boolean;
  aiFeedback: AiFeedback | null;
  cardXp: number;
  userAttempt: string;
  setUserAttempt: (v: string) => void;
  onSubmit: () => void;
  onAdvance: () => void;
  onExplain: () => void;
  advanceLabel: string;
}

export function RecallCard(p: Props) {
  const flipped = p.submitted && !p.aiChecking;
  const isHigh = (p.aiFeedback?.score ?? 0) >= 85;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (!p.submitted) textareaRef.current?.focus(); }, [p.flipKey, p.submitted]);

  return (
    <div className="flash-cardwrap">
      <div className={`flash-card${flipped ? " is-flipped" : ""}${flipped && isHigh ? " is-high" : ""}`}>
        {/* FRONT */}
        <section className="flash-face is-front">
          <span className="flash-topictag">
            <TopicGlyph topicKey={p.card.tag} />
            <span>{p.card.tag} · {p.deckTitle}{p.isRetry ? " · ↻ refocus" : ""}</span>
          </span>
          <p className="flash-q">{p.card.question}</p>
          {p.submitted ? (
            <div className="flash-loading" role="status" aria-live="polite">
              <span className="flash-loader" aria-hidden><i /><i /><i /></span>
              <span className="flash-loading-label">Grading your answer…</span>
            </div>
          ) : (
            <>
              <textarea
                ref={textareaRef}
                className="flash-recall"
                value={p.userAttempt}
                onChange={(e) => p.setUserAttempt(e.target.value.slice(0, MAX_ANSWER_CHARS))}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && p.userAttempt.trim()) { e.preventDefault(); p.onSubmit(); } }}
                placeholder="Type your answer — recall it before you grade"
                rows={3}
                maxLength={MAX_ANSWER_CHARS}
                aria-label="Your answer"
              />
              <div className="flash-meta">
                {!p.userAttempt.trim()
                  ? <span className="flash-hint">Active recall — answer first. ⌘/Ctrl+Enter to submit.</span>
                  : <span aria-hidden />}
                <span className={`flash-count${p.userAttempt.length >= MAX_ANSWER_CHARS - 20 ? " is-warn" : ""}`} aria-live="polite">
                  {p.userAttempt.length}/{MAX_ANSWER_CHARS}
                </span>
              </div>
              <button type="button" className="flash-submit flash-press" data-testid="flash-submit"
                onClick={p.onSubmit} disabled={!p.userAttempt.trim()}>Submit for grading</button>
            </>
          )}
        </section>

        {/* BACK */}
        <section className="flash-face is-back">
          {flipped && (
            <RevealBack
              aiFeedback={p.aiFeedback}
              cardXp={p.cardXp}
              userAttempt={p.userAttempt}
              modelAnswer={p.card.answer}
              onExplain={p.onExplain}
              onAdvance={p.onAdvance}
              advanceLabel={p.advanceLabel}
            />
          )}
        </section>
      </div>

      {flipped && isHigh && (
        <span className="flash-confetti" aria-hidden>
          {Array.from({ length: 16 }).map((_, i) => (
            <i key={i} style={{ ["--i" as string]: i } as React.CSSProperties} />
          ))}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles.**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add frontend/src/aurora/components/flashcards/RecallCard.tsx
git commit -m "feat(flashcards): add RecallCard with springy 3D flip + confetti"
```

---

## Task 8: `StudyStage` — active-study layout

**Files:**
- Create: `frontend/src/aurora/components/flashcards/StudyStage.tsx`

- [ ] **Step 1: Create the component.**

```tsx
"use client";
/* StudyStage — the active-study layout: a slim top bar (deck title, progress dots,
   live XP), an adaptive coach line, the centered RecallCard, and a slim readout.
   Owns the keyboard-advance (Enter / → once graded). */
import { useEffect } from "react";
import { type Flashcard, type AiFeedback, scoreTier } from "./types";
import { RecallCard } from "./RecallCard";

interface Props {
  card: Flashcard;
  idx: number;
  total: number;
  isRetry: boolean;
  deckTitle: string;
  submitted: boolean;
  aiChecking: boolean;
  aiFeedback: AiFeedback | null;
  cardXp: number;
  sessionXp: number;
  gradedCount: number;
  avgScore: number | null;
  userAttempt: string;
  setUserAttempt: (v: string) => void;
  onSubmit: () => void;
  onAdvance: () => void;
  onExplain: () => void;
  weakPending: boolean;
}

export function StudyStage(p: Props) {
  useEffect(() => {
    if (!p.submitted || p.aiChecking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); p.onAdvance(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.submitted, p.aiChecking, p.onAdvance]);

  const remaining = Math.max(0, p.total - p.idx - 1);
  const coach = (() => {
    if (!p.submitted) return p.isRetry
      ? "↻ Round two — you've got this one now."
      : "Reach for it — even a rough answer wires it in.";
    if (p.aiChecking) return "Grading your answer…";
    const t = scoreTier(p.aiFeedback?.score ?? 60);
    if (t === "high") return `Crystal clear — +${p.cardXp} XP.`;
    if (t === "good") return `Solid — +${p.cardXp} XP. ${remaining} to go.`;
    if (t === "fair") return `Getting there — +${p.cardXp} XP.`;
    return `+${p.cardXp} XP for the reach — we'll bring this one back.`;
  })();

  const advanceLabel = p.idx < p.total - 1
    ? "Next card →"
    : (p.weakPending ? "Refocus weak cards →" : "Finish session →");

  return (
    <div className="flash-stage" data-testid="study-stage">
      <div className="flash-topbar">
        <span className="flash-deck-title">{p.deckTitle}</span>
        <span className="flash-dots" aria-label={`Card ${p.idx + 1} of ${p.total}`}>
          {Array.from({ length: p.total }).map((_, i) => (
            <i key={i} className={i < p.gradedCount ? "is-done" : i === p.idx ? "is-active" : ""} />
          ))}
        </span>
        <span className="flash-xp-live">{p.sessionXp} XP</span>
      </div>

      <p className="flash-coach" key={coach}>{coach}</p>

      <RecallCard
        card={p.card}
        flipKey={`${p.idx}-${p.isRetry ? "r" : "n"}`}
        isRetry={p.isRetry}
        deckTitle={p.deckTitle}
        submitted={p.submitted}
        aiChecking={p.aiChecking}
        aiFeedback={p.aiFeedback}
        cardXp={p.cardXp}
        userAttempt={p.userAttempt}
        setUserAttempt={p.setUserAttempt}
        onSubmit={p.onSubmit}
        onAdvance={p.onAdvance}
        onExplain={p.onExplain}
        advanceLabel={advanceLabel}
      />

      <div className="flash-readout">
        <span>{p.idx + 1}/{p.total}</span>
        <span>{p.gradedCount} graded</span>
        {p.avgScore != null && <span>avg {p.avgScore}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles.**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add frontend/src/aurora/components/flashcards/StudyStage.tsx
git commit -m "feat(flashcards): add StudyStage layout + keyboard advance"
```

---

## Task 9: Rewire the orchestrator

**Files:**
- Modify: `frontend/src/aurora/screens/Flashcards.tsx`

Swap the presentation imports/usages; keep ALL state and grading logic. The only logic-shaped rename is `pickerDone` semantics stay identical (it just gates the API fetch + which screen shows).

- [ ] **Step 1: Replace the three component imports.** Change the import lines (currently `ApertureSelect` and `StudyDeck`, plus the inline `ApertureShell`) so the file imports the new components and drops the old ones. Replace lines 19–20:

```tsx
import { SessionSetup } from "@/aurora/components/flashcards/SessionSetup";
import { StudyStage } from "@/aurora/components/flashcards/StudyStage";
import { FlashShell } from "@/aurora/components/flashcards/FlashShell";
```

- [ ] **Step 2: Delete the inline `ApertureShell`.** Remove the entire `function ApertureShell({ … }) { … }` block (lines ~26–44) and its doc comment — `FlashShell` replaces it.

- [ ] **Step 3: Repoint the three render branches.** Replace each `ApertureShell` usage with `FlashShell`, the `ApertureSelect` usage with `SessionSetup` (prop `onChoose` → `onStart`), and the `StudyDeck` usage with `StudyStage`. The selection branch becomes:

```tsx
  // Selection (skipped from a tutor session or review).
  if (!fromSession && !pickerDone) {
    return (
      <FlashShell newAchievements={newAchievements} onDismissAchievement={dismissAchievement} onExit={exit}>
        <SessionSetup
          topicSets={topicSets}
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          sessionLength={sessionLength}
          setSessionLength={setSessionLength}
          onStart={(key) => { setSetKey(key); setPickerDone(true); }}
        />
      </FlashShell>
    );
  }
```

The loading/empty branch becomes (keep the messages; just swap the shell and class names):

```tsx
  if (generating || cards.length === 0 || !card) {
    return (
      <FlashShell newAchievements={newAchievements} onDismissAchievement={dismissAchievement} onExit={exit}>
        <div className="flash-stage flash-stage-msg">
          {generating
            ? <p className="flash-msg">Bringing your cards into focus…</p>
            : <p className="flash-msg">{reviewMode ? "Nothing due to review — great job staying sharp!" : "No cards in this set yet — more are on the way."}</p>}
        </div>
      </FlashShell>
    );
  }
```

And the study branch becomes:

```tsx
  return (
    <FlashShell newAchievements={newAchievements} onDismissAchievement={dismissAchievement} onExit={exit}>
      <StudyStage
        card={card}
        idx={idx}
        total={total}
        isRetry={isRetry}
        deckTitle={deckTitle}
        submitted={submitted}
        aiChecking={aiChecking}
        aiFeedback={aiFeedback}
        cardXp={cardXp}
        sessionXp={sessionXp}
        gradedCount={gradedCount}
        avgScore={avgScore}
        userAttempt={userAttempt}
        setUserAttempt={setUserAttempt}
        onSubmit={submitAnswer}
        onAdvance={advance}
        onExplain={explainThis}
        weakPending={weakPending}
      />
    </FlashShell>
  );
```

- [ ] **Step 4: Update the file's top doc comment** (lines 2–6) to drop "The Aperture"/Twilight language, e.g.:

```tsx
/* AURORA Flashcards — a thin orchestrator. Owns session state and the grading flow
   (unchanged mechanics — AI grade /100, XP on the 5-35 scale, SM-2 fields passed
   through, weak-card retry, review + tutor-seed entry), and renders SessionSetup
   then StudyStage inside the immersive light FlashShell. All presentation lives in
   components/flashcards/*. */
```

- [ ] **Step 5: Verify it compiles** (this also confirms no remaining reference to the old components in this file).

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add frontend/src/aurora/screens/Flashcards.tsx
git commit -m "refactor(flashcards): rewire orchestrator to new light components"
```

---

## Task 10: Replace the CSS block

**Files:**
- Modify: `frontend/src/aurora/aurora.css` (replace the flashcards block, ~L1830 through end-of-file L2052)

- [ ] **Step 1: Delete the old block.** Remove everything from the comment that introduces the aperture theme (the block starting around `[data-theme="aperture"]`, preceded by its `/* … Scoped to /flashcards via [data-theme="aperture"] … */` comment near L1830) through the end of the file (the aperture responsive + reduced-motion rules ending ~L2050). Do not touch anything above that comment.

- [ ] **Step 2: Append the new `flash-*` block** at the end of `aurora.css`:

```css
/* ─────────────────────────────────────────────────────────────────────────
   Flashcards — light, on-brand, no-metaphor. Lives inside .aurora-shell-immersive
   (.aurora-main-scroll is height:100dvh), so .flash-root fills it. Score-driven
   color flows through --flash-score-hue, set per-reveal on .flash-reveal.
   ───────────────────────────────────────────────────────────────────────── */
.flash-root { position: relative; height: 100%; min-height: 100dvh; width: 100%; overflow: hidden;
  background:
    radial-gradient(120% 80% at 50% -10%, rgba(66,133,244,.06), transparent 60%),
    radial-gradient(90% 70% at 100% 110%, rgba(217,101,112,.05), transparent 55%),
    var(--canvas);
  color: var(--ink); }
.flash-content { position: relative; z-index: 1; height: 100%; min-height: 100dvh; display: flex; flex-direction: column; }
.flash-press { transition: transform .12s ease, box-shadow .2s ease, border-color .2s ease, background .2s ease; }
.flash-press:active { transform: scale(.97); }

.flash-exit { position: absolute; z-index: 4; top: clamp(14px, 2vw, 22px); left: clamp(14px, 2vw, 22px);
  display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px 8px 10px; border-radius: 999px;
  border: 1px solid var(--hairline); background: var(--surface); color: var(--ink-2);
  font: inherit; font-size: 14px; cursor: pointer; box-shadow: 0 2px 8px rgba(31,31,31,.05); }
.flash-exit:hover { color: var(--ink); border-color: rgba(66,133,244,.4); }

/* ── Setup ── */
.flash-setup { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: clamp(18px, 3vh, 30px);
  width: min(880px, 92vw); margin: 0 auto; padding: clamp(64px, 9vh, 100px) 0 28px; overflow-y: auto; }
.flash-setup-head { text-align: center; }
.flash-eyebrow { font-size: 12px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--g-blue); margin: 0; }
.flash-setup-title { font-size: clamp(34px, 5vw, 52px); font-weight: 700; letter-spacing: -.02em; margin: 6px 0 8px; color: var(--ink); }
.flash-setup-help { font-size: 16px; color: var(--ink-2); max-width: 48ch; margin: 0 auto; }
.flash-setup-controls { display: flex; flex-wrap: wrap; gap: 18px 36px; justify-content: center; }
.flash-control { display: flex; flex-direction: column; gap: 8px; align-items: center; }
.flash-control-label { font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); }
.flash-pills { display: inline-flex; gap: 8px; padding: 5px; border-radius: 999px; background: var(--paper); border: 1px solid var(--hairline); }
.flash-pill { padding: 9px 18px; border: none; border-radius: 999px; background: transparent; color: var(--ink-2);
  font: inherit; font-size: 14.5px; font-weight: 600; cursor: pointer; }
.flash-pill[aria-checked="true"] { background: var(--surface); color: var(--ink); box-shadow: 0 2px 10px rgba(31,31,31,.08); }

.flash-topics { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.flash-topic { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; text-align: left;
  padding: 16px; border-radius: var(--radius-lg); border: 1px solid var(--hairline); background: var(--surface);
  color: var(--ink); cursor: pointer; }
.flash-topic:hover:not(:disabled) { transform: translateY(-2px); border-color: rgba(66,133,244,.4); box-shadow: 0 12px 30px -16px rgba(66,133,244,.5); }
.flash-topic.is-selected { border-color: var(--g-blue); box-shadow: 0 0 0 2px rgba(66,133,244,.4), 0 12px 30px -16px rgba(66,133,244,.5); }
.flash-topic:disabled { opacity: .45; cursor: not-allowed; }
.flash-topic-glyph { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 10px;
  background: linear-gradient(140deg, rgba(66,133,244,.12), rgba(155,114,203,.1)); color: var(--on-blue-2); }
.flash-topic-label { font-size: 16px; font-weight: 600; letter-spacing: -.01em; }
.flash-topic-sub { font-size: 12.5px; color: var(--ink-3); }

.flash-setup-foot { position: sticky; bottom: 0; display: flex; justify-content: center; padding-top: 8px; }
.flash-start { padding: 15px 40px; border: none; border-radius: 999px; background: var(--gemini); background-size: 200% 100%;
  color: #fff; font: inherit; font-size: 16px; font-weight: 600; cursor: pointer;
  box-shadow: 0 14px 34px -14px rgba(66,133,244,.7); animation: flash-gradient var(--aurora-anim) linear infinite; }
.flash-start:hover { filter: brightness(1.04); }
@keyframes flash-gradient { to { background-position: 200% 0; } }

/* ── Study stage ── */
.flash-stage { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: clamp(14px, 2.4vh, 24px); width: min(680px, 92vw); margin: 0 auto; padding: 70px 0 40px; }
.flash-stage-msg { justify-content: center; }
.flash-msg { color: var(--ink-2); font-size: 16px; }
.flash-topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%; }
.flash-deck-title { font-size: 14px; font-weight: 600; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.flash-dots { display: inline-flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
.flash-dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--hairline); transition: all .3s ease; }
.flash-dots i.is-active { background: var(--g-blue); transform: scale(1.35); }
.flash-dots i.is-done { background: var(--g-green); }
.flash-xp-live { font-size: 14px; font-weight: 700; color: var(--on-blue-2); white-space: nowrap; }
.flash-coach { margin: 0; font-size: 15.5px; color: var(--ink-2); text-align: center; min-height: 1.4em;
  animation: flash-coach-in .34s ease both; }
@keyframes flash-coach-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }

/* ── Card + flip ── */
.flash-cardwrap { position: relative; width: 100%; perspective: 1600px; }
.flash-card { position: relative; width: 100%; min-height: 380px; transform-style: preserve-3d;
  transition: transform .62s cubic-bezier(.2, .8, .2, 1); }
.flash-card.is-flipped { transform: rotateY(180deg); }
.flash-face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden;
  display: flex; flex-direction: column; padding: clamp(22px, 3vw, 32px); border-radius: var(--radius-xl);
  background: var(--surface); border: 1px solid var(--hairline); box-shadow: 0 24px 60px -30px rgba(31,31,31,.35); }
.flash-face.is-front { }
.flash-face.is-back { transform: rotateY(180deg); }
.flash-card:not(.is-flipped) .is-back { pointer-events: none; }
.flash-topictag { display: inline-flex; align-items: center; gap: 8px; align-self: flex-start; padding: 6px 12px 6px 8px;
  border-radius: 999px; background: var(--paper); border: 1px solid var(--hairline); color: var(--ink-2);
  font-size: 12.5px; font-weight: 600; }
.flash-q { margin: 18px 0 auto; font-size: clamp(22px, 3vw, 28px); line-height: 1.32; font-weight: 600;
  letter-spacing: -.01em; color: var(--ink); }
.flash-recall { width: 100%; margin-top: 16px; padding: 14px 16px; border-radius: var(--radius); resize: none;
  border: 1px solid var(--hairline); background: var(--paper); color: var(--ink); font: inherit; font-size: 16px; line-height: 1.5; }
.flash-recall:focus-visible { outline: none; border-color: var(--g-blue); box-shadow: 0 0 0 3px rgba(66,133,244,.16); }
.flash-meta { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 8px; min-height: 18px; }
.flash-hint { font-size: 12.5px; color: var(--ink-3); }
.flash-count { font-size: 12px; color: var(--ink-3); margin-left: auto; }
.flash-count.is-warn { color: var(--on-rose-2); font-weight: 600; }
.flash-submit, .flash-advance { width: 100%; margin-top: 14px; padding: 15px; border: none; border-radius: var(--radius);
  background: var(--g-blue); color: #fff; font: inherit; font-size: 15.5px; font-weight: 600; cursor: pointer;
  box-shadow: 0 14px 30px -16px rgba(66,133,244,.8); }
.flash-submit:hover:not(:disabled), .flash-advance:hover { filter: brightness(1.05); }
.flash-submit:disabled { opacity: .4; cursor: not-allowed; box-shadow: none; }

.flash-loading { margin-top: auto; display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 26px 0; }
.flash-loader { position: relative; width: 46px; height: 46px; }
.flash-loader i { position: absolute; inset: 0; margin: auto; border-radius: 50%; border: 2px solid transparent;
  border-top-color: var(--g-blue); animation: flash-spin 1s linear infinite; }
.flash-loader i:nth-child(2) { inset: 8px; border-top-color: var(--g-purple); animation-duration: 1.4s; }
.flash-loader i:nth-child(3) { inset: 16px; border-top-color: var(--g-rose); animation-duration: 1.8s; }
@keyframes flash-spin { to { transform: rotate(360deg); } }
.flash-loading-label { font-size: 14px; color: var(--ink-2); }

/* ── Reveal (back face) ── score-driven via --flash-score-hue ── */
.flash-reveal { display: flex; flex-direction: column; height: 100%; --flash-c: hsl(var(--flash-score-hue, 212) 62% 44%); }
.flash-scoreline { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.flash-score { display: inline-flex; align-items: baseline; font-size: clamp(56px, 11vw, 84px); font-weight: 800;
  letter-spacing: -.03em; line-height: 1; color: var(--flash-c); }
.flash-score-max { font-style: normal; font-size: .34em; font-weight: 700; color: var(--ink-3); margin-left: 4px; }
.flash-xp { font-size: 15px; font-weight: 700; color: var(--flash-c); }
.flash-feedback { margin: 14px 0 16px; font-size: 16px; line-height: 1.55; color: var(--ink-2); }
.flash-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: auto; }
.flash-compare-col { padding: 14px 16px; border-radius: var(--radius); border: 1px solid var(--hairline); background: var(--paper); }
.flash-compare-col.is-model { border-color: color-mix(in srgb, var(--flash-c) 40%, var(--hairline)); background: color-mix(in srgb, var(--flash-c) 7%, var(--surface)); }
.flash-compare-label { display: block; font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3); margin-bottom: 6px; }
.flash-compare-col.is-model .flash-compare-label { color: var(--flash-c); }
.flash-compare-col p { margin: 0; font-size: 15px; line-height: 1.5; color: var(--ink); }
.flash-reveal-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 18px; }
.flash-tutor { width: 100%; padding: 12px; border-radius: 999px; border: 1px solid var(--hairline); background: var(--surface);
  color: var(--ink-2); font: inherit; font-size: 14.5px; font-weight: 600; cursor: pointer; }
.flash-tutor:hover { color: var(--ink); border-color: rgba(66,133,244,.4); }
.flash-advance { background: var(--flash-c); box-shadow: 0 14px 30px -16px var(--flash-c); }

.flash-readout { display: flex; gap: 20px; justify-content: center; font-size: 13px; color: var(--ink-3); }

/* ── Confetti (CSS-only, high score) ── */
.flash-confetti { position: absolute; inset: 0; pointer-events: none; overflow: visible; z-index: 3; }
.flash-confetti i { position: absolute; top: 30%; left: 50%; width: 8px; height: 8px; border-radius: 2px;
  background: hsl(calc(var(--i) * 47) 80% 60%);
  animation: flash-confetti-fly .9s ease-out forwards; animation-delay: calc(var(--i) * 18ms); opacity: 0; }
@keyframes flash-confetti-fly {
  0% { opacity: 1; transform: translate(0, 0) rotate(0); }
  100% { opacity: 0; transform: translate(calc((var(--i) - 8) * 26px), calc(60px + var(--i) * 6px)) rotate(320deg); }
}

/* ── Responsive ── */
@media (max-width: 560px) {
  .flash-compare { grid-template-columns: 1fr; }
  .flash-card { min-height: 440px; }
  .flash-topics { grid-template-columns: 1fr 1fr; }
}

/* ── Reduced motion ── */
html[data-motion="reduce"] .flash-card { transition: none; }
html[data-motion="reduce"] .flash-start,
html[data-motion="reduce"] .flash-confetti i,
html[data-motion="reduce"] .flash-loader i,
html[data-motion="reduce"] .flash-coach { animation: none; }
html[data-motion="reduce"] .flash-confetti { display: none; }
@media (prefers-reduced-motion: reduce) {
  .flash-card { transition: none; }
  .flash-start, .flash-confetti i, .flash-loader i, .flash-coach { animation: none; }
  .flash-confetti { display: none; }
}
```

- [ ] **Step 3: Build to confirm the CSS is valid and nothing references the removed block.**

Run: `npm run build`
Expected: build completes (no CSS parse errors; `color-mix` is supported by the Next/Lightning CSS pipeline — if the build flags it, replace the two `color-mix(...)` values with `rgba` fallbacks `rgba(66,133,244,.4)` / `rgba(66,133,244,.07)`).

- [ ] **Step 4: Commit.**

```bash
git add frontend/src/aurora/aurora.css
git commit -m "feat(flashcards): replace dark aperture CSS with light flash-* system"
```

---

## Task 11: Delete the old components

**Files:**
- Delete: `PrismStage.tsx`, `ApertureSelect.tsx`, `StudyDeck.tsx`, `FocusCard.tsx`, `FocusCoach.tsx`, `SessionReadout.tsx` (all under `frontend/src/aurora/components/flashcards/`)

- [ ] **Step 1: Remove the files.**

```bash
cd frontend && git rm \
  src/aurora/components/flashcards/PrismStage.tsx \
  src/aurora/components/flashcards/ApertureSelect.tsx \
  src/aurora/components/flashcards/StudyDeck.tsx \
  src/aurora/components/flashcards/FocusCard.tsx \
  src/aurora/components/flashcards/FocusCoach.tsx \
  src/aurora/components/flashcards/SessionReadout.tsx
```

- [ ] **Step 2: Verify no dangling imports** (typecheck fails loudly if anything still imports a deleted file).

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git commit -m "chore(flashcards): delete prism/aperture components"
```

---

## Task 12: Integration — drive the harness to GREEN

**Files:** none (verification + memory).

- [ ] **Step 1: Build and start the production server** (the harness expects a server at `http://127.0.0.1:3000`). In one terminal:

```bash
cd frontend && npm run build && npm run start
```

- [ ] **Step 2: Run the full harness** against it (second terminal):

```bash
cd frontend && node tests/aurora_assert.mjs http://127.0.0.1:3000
```

Expected: all checks PASS, ending with the summary line (target **18/18**), including `PASS: Flashcards — single setup, typed recall is AI-graded, flip reveals the model answer`.

- [ ] **Step 3: If any flashcards check fails,** debug with `superpowers:systematic-debugging`:
  - `flash-setup` not found → the orchestrator still renders for `fromSession`/`reviewMode`; confirm `pickerDone` starts false for a normal visit.
  - `flash-score` text never includes `82` → the count-up is still animating; the harness `waitForFunction` should cover it, but confirm `useCountUp` target is the raw `score` (82) and that reduced-motion isn't needed.
  - `study-stage` not found after Start → confirm the loading branch resolves (mocked `generate` returns 2 cards).

- [ ] **Step 4: Typecheck once more** for a clean tree.

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Update the auto-memory.** Edit `C:\Users\caleb\.claude\projects\C--Users-caleb-OneDrive-Desktop-SNEC-AI-CHATBOT\memory\project_flashcards_aperture_redesign.md` (and its `MEMORY.md` index line) to record the new design as CURRENT: light, no-metaphor "Flashcards"; single setup screen; centered focus card + compare-on-reveal; per-topic glyphs; score-driven color; expressive numerals; rich CSS-only motion; new `flash-*` component set + CSS; harness migrated to `flash-*` and green. Note PRISM is superseded.

- [ ] **Step 6: Final commit + push.**

```bash
git add docs/superpowers/plans/2026-06-18-flashcards-redesign.md
git commit -m "feat(flashcards): light no-metaphor redesign — green harness 18/18"
git push
```

---

## Self-Review notes (for the implementer)

- **Stable identity:** `FlashShell` is module-scope (Task 4) — the recall textarea must not remount on parent re-render, exactly as the old `ApertureShell` was hoisted (`1ba8034`).
- **Test hooks that MUST exist:** `data-testid="flash-setup"`, `flash-exit`, `flash-start`, `study-stage`, `flash-submit`, `flash-score`; classes `.flash-recall`, `.flash-compare-label` (text "Model answer"). These appear in Tasks 5–8 and are asserted in Task 1.
- **No GSAP:** all motion is CSS (Task 10) + `useCountUp` (Tasks 6). Do not import GSAP effect wrappers.
- **Mechanics untouched:** Task 9 changes only imports/JSX. `submitAnswer`, `advance`, `finishSession`, `explainThis`, weak-card retry, `MIN_FOCUS_MS`, and all XP/SM-2 plumbing stay byte-for-byte.
```
