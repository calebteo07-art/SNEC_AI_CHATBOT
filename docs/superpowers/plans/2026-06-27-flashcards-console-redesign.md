# Flashcards "Console" Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the flashcards visual + study-interaction layer as the light "Console" instrument — no-submit instant-tap, per-topic hue + teal signal + academic blue, a constrained rapid Brownian colour field — preserving all data flow, grading, and the setup→study→results flow.

**Architecture:** Re-skin/rewrite the 9 `components/flashcards/*` + `screens/Flashcards.tsx` against a brand-new `flash-*` stylesheet spliced into `aurora/aurora.css`. The only logic change is moving background reasoning-grading off the (now reasoning-free) instant `onCheck` onto a new `onReason` handler. A new `BrownianField` component renders the lower-band colour physics. The frontend Playwright harness (`aurora_assert.mjs`) is updated to the new interaction and is the integration test.

**Tech Stack:** Next.js 16 / React 19, Tailwind 4 + hand-written `aurora.css`, TanStack Query, Playwright harness (Node). No backend change.

**Reference:** `docs/superpowers/specs/2026-06-27-flashcards-console-redesign-design.md` (locked design, palette, class contract). Live mockup converged in the brainstorm session.

**Pre-req:** already on branch `flashcards-console-redesign`.

---

## File map

| File | Responsibility |
|------|----------------|
| `frontend/src/aurora/aurora.css` (≈ 2174–2762) | Replace the whole `flash-*` block with the Console stylesheet. Keep `@property --flash-topic-hue`. |
| `frontend/src/aurora/components/flashcards/BrownianField.tsx` | **New.** Lower-band Brownian colour field (DOM spots + RAF, reduced-motion aware). |
| `frontend/src/aurora/components/flashcards/McqCard.tsx` | Rewrite. Instrument frame: top bar, kicker, question, option keys, lock reticle, ignition, readout, optional reflection, free-text path. |
| `frontend/src/aurora/components/flashcards/StudyStage.tsx` | Rewrite. Thin wrapper: keyboard advance + renders McqCard. |
| `frontend/src/aurora/components/flashcards/SessionSetup.tsx` | Rewrite. Console intake shell + persistent CSS hero. |
| `frontend/src/aurora/components/flashcards/StepSession.tsx` | Rewrite. Difficulty/length keys + live summary. |
| `frontend/src/aurora/components/flashcards/StepTopic.tsx` | Rewrite. Topic channel gallery. |
| `frontend/src/aurora/components/flashcards/ResultsScreen.tsx` | Reskin. Diagnostic summary readout. |
| `frontend/src/aurora/components/flashcards/FlashShell.tsx` | Reskin: `flash-root` field bg, exit, achievements. |
| `frontend/src/aurora/screens/Flashcards.tsx` | Add `onReason`; pass to StudyStage/McqCard. |
| `frontend/tests/aurora_assert.mjs` | Update the flashcards section to the new instant-tap + post-reveal reflection flow. |
| `frontend/src/aurora/components/flashcards/types.ts` | **Unchanged.** |

**Class/testid contract (must exist for the harness):** `flash-root` (exposes `--flash-topic-hue`), `flash-exit`, `flash-setup[data-step]`, `flash-rail`, `flash-hero` (single node, persists across step change), `flash-continue`, `flash-back`, `flash-start`, `study-stage`, `flash-option`, `flash-reveal-back`, `flash-reason`, `flash-advance`, `flash-results`, `flash-results-score`, `flash-results-reason`, `flash-msg`.

---

### Task 1: Splice the Console stylesheet into aurora.css

**Files:**
- Modify: `frontend/src/aurora/aurora.css` (replace lines 2174–2762)
- Scratch: `.tmp/flash_console.css`

- [ ] **Step 1: Confirm the block boundaries**

Run: `grep -n "Flashcards — light" frontend/src/aurora/aurora.css` → expect line 2174.
Run: `sed -n '2760,2764p' frontend/src/aurora/aurora.css` → 2762 is the closing `}` of the `@media (prefers-reduced-motion)` block; 2763 blank; 2764 begins `Station-100 debrief`.

- [ ] **Step 2: Write the new stylesheet to scratch**

Author `.tmp/flash_console.css` with these sections (full authoring against the spec palette). Load-bearing rules that MUST be present exactly:

```css
@property --flash-topic-hue { syntax: "<number>"; inherits: true; initial-value: 212; }

.flash-root {
  position: relative; height: 100%; min-height: 100dvh; width: 100%; overflow: hidden;
  --flash-topic-hue: 212;
  --f-ink: #141d28; --f-ink2: #3c4956; --f-mono: #5d6b7a; --f-line: rgba(24,34,46,.10);
  --f-paper: rgba(255,255,255,.78); --f-teal: #0d8276; --f-coral: #d9482f; --f-blue: #1f5fa6;
  color: var(--f-ink);
  background: linear-gradient(180deg,#f7f5ef 0%,#eef0f5 100%);
}
.flash-content { position: relative; z-index: 1; height: 100%; display: flex;
  align-items: center; justify-content: center; padding: 32px 20px; }
.flash-exit { position: absolute; top: 18px; left: 18px; z-index: 5; display: inline-flex;
  align-items: center; gap: 6px; font: 500 13px var(--font-sans); color: var(--f-mono);
  background: rgba(255,255,255,.6); border: 1px solid var(--f-line); border-radius: 999px;
  padding: 8px 14px; cursor: pointer; }

/* Brownian colour field — lower band, masked under the question */
.flash-bg { position: absolute; left: 0; right: 0; bottom: 0; top: 200px; pointer-events: none;
  overflow: hidden; -webkit-mask-image: linear-gradient(180deg,transparent 0,#000 42px);
  mask-image: linear-gradient(180deg,transparent 0,#000 42px); }
.flash-spot { position: absolute; left: 0; top: 0; border-radius: 50%;
  mix-blend-mode: multiply; will-change: transform; }

/* Instrument card */
.flash-card { position: relative; width: 100%; max-width: 760px; border-radius: 22px;
  padding: 28px 28px 24px; overflow: hidden; background: linear-gradient(180deg,#f8f6f0,#eef0f4);
  border: 1px solid var(--f-line); box-shadow: 0 26px 66px -36px rgba(24,34,46,.5); }
.flash-cardin { position: relative; z-index: 1; }

/* Top bar / telemetry */
.flash-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.flash-tag { display: flex; align-items: center; gap: 8px; font: 500 12px var(--font-mono);
  letter-spacing: .14em; text-transform: uppercase; color: hsl(var(--flash-topic-hue) 55% 36%); }
.flash-segs { display: flex; gap: 4px; }
.flash-segs i { width: 14px; height: 3px; border-radius: 2px; background: #cfcabd; }
.flash-segs i.is-done { background: hsl(var(--flash-topic-hue) 55% 62%); }
.flash-segs i.is-now { background: hsl(var(--flash-topic-hue) 72% 46%); animation: flash-seg 1.8s ease-in-out infinite; }
.flash-count { font: 500 12px var(--font-mono); color: #7f8893; letter-spacing: .1em; }
.flash-rule { height: 2px; border-radius: 2px; margin: 0 0 16px;
  background: linear-gradient(90deg, hsl(var(--flash-topic-hue) 72% 50%), rgba(31,95,166,.55) 60%, transparent); }
.flash-kicker { font: 500 11px var(--font-mono); letter-spacing: .2em; text-transform: uppercase;
  color: hsl(var(--flash-topic-hue) 60% 40%); margin: 0 0 8px; }
.flash-q { font: 400 25px/1.34 var(--font-serif); color: var(--f-ink); margin: 0 0 22px; max-width: 52ch; }

/* Option instrument keys */
.flash-options { display: flex; flex-direction: column; gap: 10px; list-style: none; padding: 0; margin: 0; }
.flash-option { display: flex; align-items: center; gap: 15px; width: 100%; text-align: left;
  padding: 14px 16px; border-radius: 13px; cursor: pointer; background: var(--f-paper);
  border: 1px solid var(--f-line); opacity: 0; transform: translateY(10px);
  animation: flash-rise .5s ease forwards;
  transition: transform .12s ease, border-color .18s ease, box-shadow .18s ease, background .18s ease; }
.flash-option:hover:not(:disabled) { border-color: hsl(var(--flash-topic-hue) 60% 46% / .65);
  transform: translateX(2px); box-shadow: 0 10px 22px -12px hsl(var(--flash-topic-hue) 50% 40% / .55);
  background: rgba(255,255,255,.94); }
.flash-lamp { position: relative; flex: 0 0 auto; width: 26px; height: 26px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; border: 1px solid rgba(24,34,46,.18);
  font: 500 12px var(--font-mono); color: var(--f-mono); background: rgba(255,255,255,.6);
  transition: all .2s ease; }
.flash-otext { font: 400 15.5px/1.4 var(--f-ink2); color: var(--f-ink2); }
.flash-option.is-picked { border-color: hsl(var(--flash-topic-hue) 62% 46%);
  background: hsl(var(--flash-topic-hue) 70% 55% / .14); }
.flash-option.is-picked .flash-lamp { background: hsl(var(--flash-topic-hue) 62% 44%);
  border-color: hsl(var(--flash-topic-hue) 62% 44%); color: #fff; }
.flash-option.is-correct { border-color: var(--f-teal); background: rgba(19,165,148,.16);
  box-shadow: 0 10px 24px -12px rgba(13,130,118,.6); }
.flash-option.is-correct .flash-lamp { background: var(--f-teal); border-color: var(--f-teal); color: #fff; }
.flash-option.is-wrong { border-color: var(--f-coral); background: rgba(217,72,47,.12); }
.flash-option.is-wrong .flash-lamp { background: var(--f-coral); border-color: var(--f-coral); color: #fff; }
.flash-ignite { position: absolute; inset: -1px; border-radius: 50%; border: 2px solid var(--f-teal);
  animation: flash-ignite .6s ease-out forwards; pointer-events: none; }

/* Foot: hint + lock reticle */
.flash-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 18px; min-height: 44px; }
.flash-hint { font: 500 11.5px var(--font-mono); letter-spacing: .12em; text-transform: uppercase; color: #7c858f; }
.flash-lock { width: 44px; height: 44px; border-radius: 50%; border: 1px solid rgba(24,34,46,.16);
  background: rgba(255,255,255,.85); color: #aab0ba; display: flex; align-items: center;
  justify-content: center; cursor: not-allowed; font-size: 20px; transition: all .2s ease; }
.flash-lock.is-armed { color: var(--f-teal); border-color: var(--f-teal); cursor: pointer;
  animation: flash-pulse 1.6s ease-in-out infinite; }

/* Readout */
.flash-reveal { margin-top: 18px; border-top: 1px solid rgba(24,34,46,.12); padding-top: 16px; }
.flash-verdict { display: flex; align-items: center; gap: 8px; font: 500 12px var(--font-mono);
  letter-spacing: .16em; text-transform: uppercase; margin-bottom: 8px; }
.flash-verdict.is-right { color: var(--f-teal); }
.flash-verdict.is-wrong { color: #c0412b; }
.flash-compare-label { font: 500 11px var(--font-mono); letter-spacing: .2em; text-transform: uppercase;
  color: hsl(var(--flash-topic-hue) 60% 40%); margin: 0 0 4px; }
.flash-model { font: 400 14.5px/1.6 var(--f-ink2); color: #434d59; margin: 0; max-width: 60ch; }
.flash-reason { margin-top: 14px; }
.flash-reason-box { width: 100%; resize: none; border-radius: 10px; border: 1px solid var(--f-line);
  padding: 10px 12px; font: 400 14px var(--font-sans); background: rgba(255,255,255,.8); }
.flash-reason-note { font: 400 13px var(--font-sans); color: var(--f-mono); margin: 8px 0 0; }
.flash-advance { margin-top: 16px; margin-left: auto; display: flex; align-items: center; gap: 6px;
  font: 500 12px var(--font-mono); letter-spacing: .1em; text-transform: uppercase; color: #fff;
  background: linear-gradient(90deg, hsl(var(--flash-topic-hue) 62% 44%), var(--f-blue));
  border: none; border-radius: 10px; padding: 11px 17px; cursor: pointer; }

/* Free-text tutor card */
.flash-reveal-btn { /* same visual as .flash-advance */ }
.flash-selfmark { display: flex; gap: 10px; margin-top: 14px; }
.flash-mark-got, .flash-mark-miss { flex: 1; padding: 11px; border-radius: 10px; cursor: pointer;
  font: 500 13px var(--font-sans); border: 1px solid var(--f-line); background: rgba(255,255,255,.85); }
.flash-mark-got { color: var(--f-teal); border-color: var(--f-teal); }
.flash-mark-miss { color: #c0412b; border-color: var(--f-coral); }

/* Setup intake */
.flash-setup { position: relative; width: 100%; max-width: 720px; display: flex; flex-direction: column;
  align-items: center; gap: 22px; }
.flash-rail { display: flex; gap: 8px; }
.flash-rail-seg { width: 46px; height: 4px; border-radius: 999px; background: #d8d3c6; }
.flash-rail-seg.is-active { background: hsl(var(--flash-topic-hue) 70% 50%); }
.flash-rail-seg.is-done { background: hsl(var(--flash-topic-hue) 50% 64%); }
.flash-setup-stage { position: relative; width: 100%; display: flex; flex-direction: column;
  align-items: center; gap: 20px; }
.flash-hero { position: relative; border-radius: 50%; flex: 0 0 auto;
  width: 168px; height: 168px; transition: width .5s ease, height .5s ease; }
.flash-setup[data-step="2"] .flash-hero { width: 64px; height: 64px; }
.flash-hero-iris { position: absolute; inset: 14%; border-radius: 50%;
  background: radial-gradient(circle at 50% 42%, hsl(var(--flash-topic-hue) 70% 60%),
  hsl(var(--flash-topic-hue) 60% 34%) 70%, #1b2430 100%); }
.flash-hero-ring { position: absolute; inset: 0; border-radius: 50%;
  border: 1px solid hsl(var(--flash-topic-hue) 50% 50% / .5); animation: flash-spin 24s linear infinite; }
.flash-step { width: 100%; }
.flash-axis { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }
.flash-axis-label { font: 500 11px var(--font-mono); letter-spacing: .18em; text-transform: uppercase; color: var(--f-mono); }
.flash-opts { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; }
.flash-opt { padding: 14px; border-radius: 14px; cursor: pointer; background: var(--f-paper);
  border: 1px solid var(--f-line); text-align: left; }
.flash-opt[aria-checked="true"] { border-color: hsl(var(--flash-topic-hue) 62% 46%);
  background: hsl(var(--flash-topic-hue) 70% 55% / .12); }
.flash-summary { font: 400 14px var(--font-sans); color: var(--f-ink2); text-align: center; }
.flash-topics { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px,1fr)); gap: 10px; width: 100%; }
.flash-topic { padding: 16px; border-radius: 16px; cursor: pointer; background: var(--f-paper);
  border: 1px solid var(--f-line); text-align: left; }
.flash-topic.is-selected { border-color: hsl(var(--flash-topic-hue) 62% 46%);
  box-shadow: 0 10px 26px -14px hsl(var(--flash-topic-hue) 55% 45% / .6); }

/* Results */
.flash-results { width: 100%; max-width: 620px; text-align: center; }
.flash-results-kicker { font: 500 11px var(--font-mono); letter-spacing: .2em; text-transform: uppercase; color: var(--f-mono); }
.flash-results-score { font: 400 64px var(--font-serif); margin: 10px 0;
  background: linear-gradient(90deg, hsl(var(--flash-topic-hue) 62% 44%), var(--f-blue));
  -webkit-background-clip: text; background-clip: text; color: transparent; }
.flash-results-score strong { font-weight: 500; }
.flash-results-actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 22px; }

/* States */
.flash-stage { width: 100%; display: flex; flex-direction: column; align-items: center; }
.flash-stage-msg { text-align: center; }
.flash-msg { font: 400 18px var(--font-serif); color: var(--f-ink2); }

@keyframes flash-rise { to { opacity: 1; transform: none; } }
@keyframes flash-ignite { from { transform: scale(1); opacity: .85; } to { transform: scale(3.6); opacity: 0; } }
@keyframes flash-seg { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
@keyframes flash-pulse { 0%,100% { box-shadow: 0 0 0 4px rgba(13,130,118,.14); } 50% { box-shadow: 0 0 0 8px rgba(13,130,118,.04); } }
@keyframes flash-spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .flash-option, .flash-segs i.is-now, .flash-lock.is-armed, .flash-hero-ring { animation: none; }
  .flash-option { opacity: 1; transform: none; }
}
html[data-motion="reduce"] .flash-option { opacity: 1; transform: none; animation: none; }
html[data-motion="reduce"] .flash-segs i.is-now,
html[data-motion="reduce"] .flash-lock.is-armed,
html[data-motion="reduce"] .flash-hero-ring { animation: none; }
```

- [ ] **Step 3: Splice it in (keep lines 1–2173 and 2763–end)**

Run:
```bash
python - <<'PY'
p = "frontend/src/aurora/aurora.css"
lines = open(p, encoding="utf-8").read().split("\n")
new = open(".tmp/flash_console.css", encoding="utf-8").read().rstrip("\n")
out = lines[:2173] + [new] + lines[2762:]
open(p, "w", encoding="utf-8", newline="\n").write("\n".join(out))
print("spliced; new line count:", len("\n".join(out).split("\n")))
PY
```

- [ ] **Step 4: Verify nothing else references the removed props**

Run: `grep -rn "\-\-hx\|\-\-hact\|flash-scene\|flash-dial-ring\|flash-cream" frontend/src` → expect **no matches** outside files we rewrite later (those references die in their own tasks). If a non-flashcards file matches, stop and reassess.

- [ ] **Step 5: Typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS (CSS-only change; unused new classes are harmless).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/aurora/aurora.css
git commit -m "feat(flashcards): Console stylesheet (replace flash-* CSS block)"
```

---

### Task 2: BrownianField component

**Files:**
- Create: `frontend/src/aurora/components/flashcards/BrownianField.tsx`

- [ ] **Step 1: Write the component (full)**

```tsx
"use client";
/* BrownianField — a cohesive cool-palette colour field that drifts with rapid Brownian
   motion inside its parent's lower band (the parent owns the mask + position). DOM spots,
   one RAF loop, transform-only. Static + frozen under reduced motion. Decorative. */
import { useEffect, useRef } from "react";

const HUES = [214, 180, 250, 222, 172, 256]; // blue · teal · indigo, cohesive

export function BrownianField({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const reduced =
      document.documentElement.dataset.motion === "reduce" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const W = () => host.clientWidth || 680;
    const H = () => host.clientHeight || 240;
    type Spot = { el: HTMLSpanElement; r: number; x: number; y: number; vx: number; vy: number };
    const spots: Spot[] = HUES.map((h) => {
      const r = 100 + Math.random() * 55;
      const el = document.createElement("span");
      el.className = "flash-spot";
      el.style.width = el.style.height = `${r * 2}px`;
      el.style.background =
        `radial-gradient(circle, hsl(${h} 80% 60% / .44), hsl(${h} 78% 62% / .08) 56%, transparent 72%)`;
      host.appendChild(el);
      const a = Math.random() * 6.28, sp = 0.8 + Math.random() * 1.2;
      return { el, r, x: Math.random() * W() - r, y: Math.random() * H() - r, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp };
    });
    const draw = (s: Spot) => { s.el.style.transform = `translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px)`; };
    spots.forEach(draw);
    if (reduced) return () => spots.forEach((s) => s.el.remove());

    let raf = 0;
    const tick = () => {
      const w = W(), h = H(), m = 70;
      for (const s of spots) {
        s.vx += (Math.random() - 0.5) * 1.1; s.vy += (Math.random() - 0.5) * 1.1; // rapid jitter
        s.vx *= 0.96; s.vy *= 0.96;
        const sp = Math.hypot(s.vx, s.vy), mx = 3.6;       // rapid cap
        if (sp > mx) { s.vx *= mx / sp; s.vy *= mx / sp; }
        s.x += s.vx; s.y += s.vy;
        const cx = s.x + s.r, cy = s.y + s.r;
        if (cx < -m) s.vx = Math.abs(s.vx); else if (cx > w + m) s.vx = -Math.abs(s.vx);
        if (cy < 0) s.vy = Math.abs(s.vy); else if (cy > h + m) s.vy = -Math.abs(s.vy);
        draw(s);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); spots.forEach((s) => s.el.remove()); };
  }, []);

  return <div ref={ref} className={`flash-bg ${className}`} aria-hidden="true" />;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS (component not yet imported; standalone valid).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/flashcards/BrownianField.tsx
git commit -m "feat(flashcards): BrownianField lower-band colour physics"
```

---

### Task 3: McqCard — instrument frame with instant-tap

**Files:**
- Rewrite: `frontend/src/aurora/components/flashcards/McqCard.tsx`

- [ ] **Step 1: Rewrite the component**

Props gain `idx`, `total`, `onReason`. Behaviour:
- single: tap option → `ignite` + `doReveal()` (calls `onCheck(correct, sel, "")`).
- multi: toggle picks → arm lock; tap lock → `ignite(all picks)` + `doReveal()`.
- reveal: lamps become check/cross, verdict + model answer, and on reason cards a
  `flash-reason` textarea (optional). `flash-advance` always enabled.
- on advance: if reason text present + unsent, call `onReason(card.id, card.stem, text, card.explanation)` then `onAdvance()`.
- free-text card: `flash-reveal-btn` → model answer + self-mark (`selfMark` calls `onCheck` then `onAdvance`).

```tsx
"use client";
/* McqCard — the Console instrument card. Tap = instant lock + reveal (no submit). Multi
   cards toggle then fire a small lock reticle. A few cards show an OPTIONAL typed reflection
   in the readout (background-graded, never gates). Free-text tutor cards flip to a self-mark. */
import { useEffect, useState } from "react";
import { type Flashcard, MAX_REASON_CHARS, gradeSelection } from "./types";
import { BrownianField } from "./BrownianField";

interface Props {
  card: Flashcard; deckTitle: string; idx: number; total: number;
  onCheck: (correct: boolean, selected: number[], reasoning: string) => void;
  onReason: (cardId: number, stem: string, text: string, model: string) => void;
  onAdvance: () => void; advanceLabel: string; reasonNote: string | null;
}

export function McqCard(p: Props) {
  const { card } = p;
  const [selected, setSelected] = useState<number[]>([]);
  const [reasoning, setReasoning] = useState("");
  const [sentReason, setSentReason] = useState(false);
  const [checked, setChecked] = useState(false);
  const [verdict, setVerdict] = useState(false);

  useEffect(() => {
    setSelected([]); setReasoning(""); setSentReason(false); setChecked(false); setVerdict(false);
  }, [card.id]);

  const needsReason = card.requiresExplanation && !card.freeText;
  const letters = ["a", "b", "c", "d", "e", "f"];

  const ignite = (li: HTMLElement | null) => {
    const lamp = li?.querySelector(".flash-lamp"); if (!lamp) return;
    const r = document.createElement("span"); r.className = "flash-ignite";
    lamp.appendChild(r); setTimeout(() => r.remove(), 650);
  };

  const doReveal = (sel: number[]) => {
    if (checked) return;
    const correct = gradeSelection(card, sel);
    setSelected(sel); setVerdict(correct); setChecked(true);
    p.onCheck(correct, sel, "");
  };

  const tap = (i: number, el: HTMLElement) => {
    if (checked) return;
    if (card.qtype === "single") { ignite(el); doReveal([i]); return; }
    setSelected((prev) => prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]);
  };
  const fireLock = (root: HTMLElement) => {
    if (checked || selected.length === 0) return;
    selected.forEach((i) => ignite(root.querySelector(`[data-opt="${i}"]`)));
    doReveal(selected);
  };
  const advance = () => {
    if (needsReason && reasoning.trim() && !sentReason) {
      p.onReason(card.id, card.stem, reasoning.trim(), card.explanation); setSentReason(true);
    }
    p.onAdvance();
  };
  const selfMark = (got: boolean) => { if (checked) return; setChecked(true); p.onCheck(got, [], ""); p.onAdvance(); };

  const topBar = (
    <div className="flash-top">
      <span className="flash-tag"><span aria-hidden>◉</span>{card.tag} · {p.deckTitle}{card.qtype === "multi" ? " · select all" : ""}</span>
      <span className="flash-track" aria-label={`Card ${p.idx + 1} of ${p.total}`}>
        <span className="flash-segs">{Array.from({ length: p.total }).map((_, i) =>
          <i key={i} className={i < p.idx ? "is-done" : i === p.idx ? "is-now" : ""} />)}</span>
        <span className="flash-count">{String(p.idx + 1).padStart(2, "0")} / {String(p.total).padStart(2, "0")}</span>
      </span>
    </div>
  );

  if (card.freeText) {
    return (
      <div className="flash-card"><BrownianField />
        <div className="flash-cardin">
          {topBar}<div className="flash-rule" /><p className="flash-kicker">recall</p>
          <p className="flash-q">{card.stem}</p>
          {!checked
            ? <button type="button" className="flash-advance" data-testid="flash-reveal" onClick={() => setChecked(true)}>Show answer</button>
            : <div className="flash-reveal" data-testid="flash-reveal-back">
                <p className="flash-compare-label">Model answer</p>
                <p className="flash-model">{card.explanation}</p>
                <div className="flash-selfmark">
                  <button type="button" className="flash-mark-miss" onClick={() => selfMark(false)}>Missed it</button>
                  <button type="button" className="flash-mark-got" onClick={() => selfMark(true)}>Got it</button>
                </div>
              </div>}
        </div>
      </div>
    );
  }

  return (
    <div className={`flash-card${checked && verdict ? " is-right" : ""}`}
      ref={(el) => { if (el) (el as HTMLElement & { _r?: HTMLElement })._r = el; }}>
      <BrownianField />
      <div className="flash-cardin" id="flash-cardin">
        {topBar}<div className="flash-rule" />
        <p className="flash-kicker">question {String(p.idx + 1).padStart(2, "0")}</p>
        <p className="flash-q">{card.stem}</p>
        <ul className="flash-options" role={card.qtype === "single" ? "radiogroup" : "group"}>
          {card.options.map((opt, i) => {
            const picked = selected.includes(i);
            const cls = checked
              ? card.correct.includes(i) ? "is-correct" : picked ? "is-wrong" : ""
              : picked ? "is-picked" : "";
            return (
              <li key={i}>
                <button type="button" data-testid="flash-option" data-opt={i}
                  role={card.qtype === "single" ? "radio" : "checkbox"} aria-checked={picked}
                  className={`flash-option ${cls}`} disabled={checked}
                  onClick={(e) => tap(i, e.currentTarget.parentElement as HTMLElement)}>
                  <span className="flash-lamp" aria-hidden>{checked
                    ? (card.correct.includes(i) ? "✓" : picked ? "✗" : letters[i])
                    : letters[i]}</span>
                  <span className="flash-otext">{opt}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {!checked && (
          <div className="flash-foot">
            <span className="flash-hint">{card.qtype === "multi" ? "tap all that apply, then lock" : "tap to lock — no submit"}</span>
            {card.qtype === "multi" && (
              <button type="button" aria-label="Lock in your answer"
                className={`flash-lock${selected.length ? " is-armed" : ""}`}
                onClick={(e) => fireLock((e.currentTarget.closest(".flash-card") as HTMLElement))}>🔒</button>
            )}
          </div>
        )}

        {checked && (
          <div className="flash-reveal" data-testid="flash-reveal-back">
            <p className={`flash-verdict ${verdict ? "is-right" : "is-wrong"}`}>{verdict ? "signal locked" : "review this one"}</p>
            <p className="flash-compare-label">Findings</p>
            <p className="flash-model">{card.explanation}</p>
            {needsReason && (
              <div className="flash-reason">
                <textarea className="flash-reason-box" data-testid="flash-reason" rows={2}
                  maxLength={MAX_REASON_CHARS} value={reasoning}
                  placeholder="Optional: in a sentence, why? (we'll review it)"
                  onChange={(e) => setReasoning(e.target.value.slice(0, MAX_REASON_CHARS))} />
                {p.reasonNote && <p className="flash-reason-note" data-testid="flash-reason-note">{p.reasonNote}</p>}
              </div>
            )}
            <button type="button" className="flash-advance" data-testid="flash-advance" onClick={advance}>{p.advanceLabel}</button>
          </div>
        )}
      </div>
    </div>
  );
}
```

NOTE: the `🔒` glyph is a placeholder — replace with the project `Icon` set if McqCard already imports it; otherwise a CSS reticle is acceptable. Keep `aria-label` on the lock.

- [ ] **Step 2: Typecheck** — `cd frontend && npm run typecheck` → expect errors only where StudyStage/orchestrator still pass the old props (fixed in Tasks 4–5). If isolated, proceed.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/flashcards/McqCard.tsx
git commit -m "feat(flashcards): McqCard instant-tap instrument card"
```

---

### Task 4: StudyStage — thin keyboard wrapper

**Files:**
- Rewrite: `frontend/src/aurora/components/flashcards/StudyStage.tsx`

- [ ] **Step 1: Rewrite (full)**

```tsx
"use client";
/* StudyStage — owns keyboard-advance (Enter / → once checked) and renders the McqCard
   instrument. Progress + question + readout all live inside the card now. */
import { useEffect } from "react";
import { type Flashcard } from "./types";
import { McqCard } from "./McqCard";

interface Props {
  card: Flashcard; idx: number; total: number; deckTitle: string; checked: boolean;
  reasonNote: string | null;
  onCheck: (correct: boolean, selected: number[], reasoning: string) => void;
  onReason: (cardId: number, stem: string, text: string, model: string) => void;
  onAdvance: () => void; advanceLabel: string;
}

export function StudyStage(p: Props) {
  useEffect(() => {
    if (!p.checked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); p.onAdvance(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.checked, p.onAdvance]);

  return (
    <div className="flash-stage" data-testid="study-stage">
      <McqCard card={p.card} deckTitle={p.deckTitle} idx={p.idx} total={p.total}
        onCheck={p.onCheck} onReason={p.onReason} onAdvance={p.onAdvance}
        advanceLabel={p.advanceLabel} reasonNote={p.reasonNote} />
    </div>
  );
}
```

- [ ] **Step 2: Commit** (after Task 5 typechecks together)

---

### Task 5: Orchestrator — add onReason, wire new props

**Files:**
- Modify: `frontend/src/aurora/screens/Flashcards.tsx`

- [ ] **Step 1: Replace the reasoning branch inside `onCheck` with a standalone `onReason`**

In `onCheck`, delete the `if (card.requiresExplanation && reasoning) { ... }` block (reasoning is now always `""` on the instant path). Add, after `advance`:

```tsx
const onReason = (cardId: number, stem: string, text: string, model: string) => {
  reasonCheck.mutate(
    { question: stem, student_answer: text, correct_answer: model },
    {
      onSuccess: (d) => {
        reasonScoresRef.current.push(Math.max(0, Math.min(100, d.score)));
        reasonNotesRef.current[cardId] = d.feedback; force((x) => x + 1);
      },
      onError: () => { reasonNotesRef.current[cardId] = "Couldn't grade that one — keep going."; force((x) => x + 1); },
    },
  );
};
```

- [ ] **Step 2: Pass `onReason` to StudyStage** (the `<StudyStage ... />` near line 202)

```tsx
<StudyStage
  key={deckEpoch}
  card={card} idx={idx} total={total} deckTitle={deckTitle}
  checked={checked} reasonNote={reasonNotesRef.current[card.id] ?? null}
  onCheck={onCheck} onReason={onReason} onAdvance={advance} advanceLabel={advanceLabel}
/>
```

- [ ] **Step 3: Typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS (McqCard + StudyStage + orchestrator now consistent; SessionSetup/Results still old but API-compatible).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/aurora/components/flashcards/StudyStage.tsx frontend/src/aurora/screens/Flashcards.tsx
git commit -m "feat(flashcards): StudyStage wrapper + onReason background grading"
```

---

### Task 6: SessionSetup + StepSession + StepTopic — console intake

**Files:**
- Rewrite: `frontend/src/aurora/components/flashcards/SessionSetup.tsx`
- Rewrite: `frontend/src/aurora/components/flashcards/StepSession.tsx`
- Rewrite: `frontend/src/aurora/components/flashcards/StepTopic.tsx`

- [ ] **Step 1: SessionSetup — persistent single-node hero + step swap**

Keep the exact testids/contract: root `flash-setup` with `data-step`, `flash-rail`, a single
persistent `flash-hero` node rendered once (so it survives the step change), and the keyed
`flash-step`. Drop the old image/gaze hero entirely. Publish `--flash-topic-hue` to
`.flash-root` on topic pick (reuse existing `galleryHue` + the closest-`.flash-root` effect).

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import type { FlashcardSetInfo } from "@/hooks/useFlashcards";
import { type Difficulty, galleryHue } from "./types";
import { StepSession } from "./StepSession";
import { StepTopic } from "./StepTopic";

interface Props {
  topicSets: FlashcardSetInfo[] | undefined;
  difficulty: Difficulty; setDifficulty: (d: Difficulty) => void;
  sessionLength: number; setSessionLength: (n: number) => void;
  onStart: (setKey: string | null) => void;
}

function Hero() { // single node; CSS sizes it by [data-step]
  return (
    <div className="flash-hero" data-testid="flash-hero" aria-hidden="true">
      <span className="flash-hero-ring" /><span className="flash-hero-iris" />
    </div>
  );
}

export function SessionSetup({ topicSets, difficulty, setDifficulty, sessionLength, setSessionLength, onStart }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const setupRef = useRef<HTMLDivElement>(null);

  const sets = (topicSets ?? []).filter((s) => s.difficulty === difficulty);
  const pickDifficulty = (d: Difficulty) => { setDifficulty(d); setSelected(null); setShowAll(false); };
  const selectedIndex = sets.findIndex((s) => s.set_key === selected);
  const setupHue = selectedIndex >= 0 ? galleryHue(selectedIndex) : 212;

  useEffect(() => {
    setupRef.current?.closest<HTMLElement>(".flash-root")?.style.setProperty("--flash-topic-hue", String(setupHue));
  }, [setupHue]);

  return (
    <div className="flash-setup" data-testid="flash-setup" data-step={step} ref={setupRef}
      style={{ "--flash-topic-hue": setupHue } as React.CSSProperties}>
      <div className="flash-rail" data-testid="flash-rail" role="progressbar"
        aria-valuemin={1} aria-valuemax={2} aria-valuenow={step}>
        <span className={`flash-rail-seg${step === 1 ? " is-active" : ""}${step > 1 ? " is-done" : ""}`} />
        <span className={`flash-rail-seg${step === 2 ? " is-active" : ""}`} />
      </div>
      <div className="flash-setup-stage">
        <Hero />
        <div className="flash-step" key={step}>
          {step === 1 ? (
            <StepSession difficulty={difficulty} pickDifficulty={pickDifficulty}
              sessionLength={sessionLength} setSessionLength={setSessionLength}
              onContinue={() => setStep(2)} />
          ) : (
            <StepTopic sets={sets} selected={selected} setSelected={setSelected}
              showAll={showAll} setShowAll={setShowAll}
              onBack={() => setStep(1)} onStart={() => onStart(selected)} />
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: StepSession** — keep the existing `DIFFS`/`LENGTHS`/`estMinutes` logic and the `flash-continue` testid; render the difficulty + length rows as `flash-opt` keys (role=radio, `aria-checked`) inside `flash-axis`, plus a `flash-summary` line. Button: `className="flash-continue flash-start"` `data-testid="flash-continue"`.

- [ ] **Step 3: StepTopic** — keep Mixed-default + `PREVIEW=6` + show-all, the `flash-back`/`flash-start` testids; render tiles as `flash-topic` with `is-selected`, `--flash-topic-hue: galleryHue(i)`.

- [ ] **Step 4: Typecheck + build** — `cd frontend && npm run typecheck && npm run build` → PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/components/flashcards/SessionSetup.tsx \
        frontend/src/aurora/components/flashcards/StepSession.tsx \
        frontend/src/aurora/components/flashcards/StepTopic.tsx
git commit -m "feat(flashcards): console intake setup (persistent CSS hero)"
```

---

### Task 7: FlashShell + ResultsScreen reskin

**Files:**
- Modify: `frontend/src/aurora/components/flashcards/FlashShell.tsx`
- Modify: `frontend/src/aurora/components/flashcards/ResultsScreen.tsx`

- [ ] **Step 1: FlashShell** — keep its API (`onExit`, `topicHue`, achievements, `flash-exit`,
  `flash-root` exposing `--flash-topic-hue`, `flash-content`). Drop any cream tokens. The
  field bg now lives in `.flash-root` (Task 1), so FlashShell only needs the structural shell.

- [ ] **Step 2: ResultsScreen** — keep `DeckResult`, `weakest`, `scoreTier`/`scoreHue`, and the
  testids `flash-results`, `flash-results-score`, `flash-results-reason`. Re-skin to the
  diagnostic-summary readout (kicker, big gradient `flash-results-score`, coach, weak line,
  reason line, `flash-results-actions` with drill/new/done). Keep `--flash-score-hue` set on root.

- [ ] **Step 3: Typecheck + build** — PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/aurora/components/flashcards/FlashShell.tsx \
        frontend/src/aurora/components/flashcards/ResultsScreen.tsx
git commit -m "feat(flashcards): reskin shell + results readout"
```

---

### Task 8: Update the aurora_assert flashcards section

**Files:**
- Modify: `frontend/tests/aurora_assert.mjs` (flashcards block ≈ lines 160–230)

- [ ] **Step 1: Replace the study-loop assertions (instant-tap; no Check)**

The new flow — keep setup/step/hero-persistence asserts as-is; change the study + reason steps:

```js
// study: single-answer tap = INSTANT reveal (no submit button)
await np.locator('[data-testid="flash-start"]').click();
await np.waitForSelector('[data-testid="study-stage"]', { timeout: 15000 });
await np.locator('[data-testid="flash-option"]').first().click();
await np.waitForSelector('[data-testid="flash-reveal-back"]', { timeout: 8000 });
if ((await np.locator('[data-testid="flash-check"]').count()) > 0) {
  console.error("FAIL: a Check/submit button still exists — should be instant-tap"); process.exit(1);
}
console.log("PASS: flashcards — single-answer tap reveals instantly (no submit)");
await np.locator('[data-testid="flash-advance"]').click();

// reason card: reveal is instant; reflection box appears AFTER and never gates advance
await np.waitForSelector('[data-testid="flash-option"]', { timeout: 8000 });
await np.locator('[data-testid="flash-option"]').first().click();
await np.waitForSelector('[data-testid="flash-reveal-back"]', { timeout: 8000 });
if ((await np.locator('[data-testid="flash-reason"]').count()) < 1) {
  console.error("FAIL: optional reflection box missing on reason card after reveal"); process.exit(1);
}
if (!(await np.locator('[data-testid="flash-advance"]').isEnabled())) {
  console.error("FAIL: advance should never be gated by the reflection"); process.exit(1);
}
await np.locator('[data-testid="flash-reason"]').fill("Immediate irrigation limits ongoing damage.");
console.log("PASS: flashcards — typed reasoning is optional/after-reveal, ungated");
await np.locator('[data-testid="flash-advance"]').click();
```

Keep the existing mock `/api/flashcards/generate` deck (it already includes a
`requires_explanation` card) and `/api/flashcards/check` route. Keep the subsequent
results (`flash-results-score`), `--flash-topic-hue`, and persistence-hygiene asserts.

- [ ] **Step 2: Confirm the mock deck has both a plain and a `requires_explanation` card**

Run: `sed -n '55,75p' frontend/tests/aurora_assert.mjs` — verify ≥2 cards, one with
`requires_explanation: true`, options present, `qtype` set. Adjust the mock if the first
card is multi (the test taps `.first()` expecting single → make card 1 single).

- [ ] **Step 3: Build the standalone server, warm the route, run the harness**

```bash
cd frontend && npm run build
# copy static + public into standalone, then:
node .next/standalone/server.js &   # serves :3000
# warm the dynamic route (cold compile > 15s) with an authed curl per harness setup, then:
node frontend/tests/aurora_assert.mjs
```
Expected: all PASS lines, including the new flashcards ones; exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/tests/aurora_assert.mjs
git commit -m "test(flashcards): harness for instant-tap + ungated reflection"
```

---

### Task 9: Full verification + branch finish

- [ ] **Step 1: Backend safety** — `python -m pytest -q` → expect green (no backend change).
- [ ] **Step 2: Frontend gates** — `cd frontend && npm run typecheck && npm run build` → PASS.
- [ ] **Step 3: Harness** — `node frontend/tests/aurora_assert.mjs` → all PASS, exit 0.
- [ ] **Step 4: Manual smoke (optional)** — screenshot `/flashcards` setup + a revealed card + results to confirm the Brownian band stays below the question and text is legible.
- [ ] **Step 5: Reduced-motion check** — set `html[data-motion="reduce"]`; confirm spots are static and no stagger/ignite.
- [ ] **Step 6: Finish** — use superpowers:finishing-a-development-branch. Do **not** push straight to `main` (auto-deploys to Render prod); fast-forward/merge once all gates are green.

---

## Self-review

**Spec coverage:** §2 Hybrid → Task 3 (single tap / multi lock) + Task 5 (onReason). §4 visual system → Task 1 CSS. §4/§2.4 Brownian field → Task 2 + Task 1 `.flash-bg`. §5 interaction table → Task 3. §6 setup → Task 6; study → Tasks 3–4; results → Task 7; states → Task 1 + existing orchestrator. §7 file map → all tasks. §8 orchestrator → Task 5. §9 a11y/reduced-motion → Task 1 media query + Task 2 guard. §10 testing → Task 8 + Task 9. All sections covered.

**Placeholder scan:** The `🔒` glyph and the `flash-reveal-btn` empty rule are explicitly flagged as swap-points, not silent TODOs. StepSession/StepTopic/FlashShell/ResultsScreen are described by exact testid + class contract rather than full source because they keep their existing logic and only change markup/classes — acceptable given the inline class spec in Task 1.

**Type consistency:** `onReason(cardId, stem, text, model)` signature identical in McqCard (Task 3), StudyStage (Task 4), orchestrator (Task 5). `idx`/`total` added to McqCard props (Task 3) and passed by StudyStage (Task 4). Testids match the harness contract (Task 8) and the preserved-list in §10.
