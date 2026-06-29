# Flashcard Charge → Flip → Payoff — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the slide-up explanation panel with a two-faced study card — instant verdict on the front, a charging-ring suspense beat, then a 3D flip to a full-bleed explanation back face carrying a combo streak, real-XP points tick-up, particles, and synth sound with a subtle mute toggle.

**Architecture:** Frontend only. `McqCard` becomes a `answering → charging → revealed` state machine rendering a grid-stacked flip scene (`.flash-flip` with `preserve-3d`, two `.flash-face` children). Three new focused units — `ChargeRing` (suspense), `Payoff` (back-face gamification), `useFlashFx` (audio/haptics/mute) — keep `McqCard` readable. Combo state lives in the `Flashcards` orchestrator where the XP tally already is; the combo bonus folds into the existing `xpRef → xp_delta → /api/flashcards/complete` path, so XP is real with no backend or DB change. The Node `aurora_assert` harness is the integration test (this codebase has no TS unit runner); it runs under emulated reduced motion so the charge/flip collapse to a fast, deterministic path.

**Tech Stack:** Next.js 16 / React 19, plain CSS in `aurora.css` (no GSAP — `MotionProvider` is not mounted in the student app), `requestAnimationFrame` for ring/particles/count-up, WebAudio (no asset files), Playwright `aurora_assert.mjs`.

**Spec:** `docs/superpowers/specs/2026-06-29-flashcard-charge-flip-reveal-design.md`

---

## Conventions for this plan

- **Branch / ship:** Work directly on `main` per user policy (all dev auto-ships to `main`). `main` auto-deploys to Render, so **commit locally per task but do NOT push until the full feature is green** (`aurora_assert` + `typecheck` + `build` + `pytest`). Never push a half-built flip.
- **Per-task gate:** after each task run `cd frontend && npm run typecheck` — the tree must always compile. The end-to-end harness only goes green once the whole flow exists (Task 10); that is expected.
- **Reduced-motion contract:** every animated piece checks `html[data-motion="reduce"]` **or** `window.matchMedia("(prefers-reduced-motion: reduce)").matches` and takes an instant/short path. The harness emulates `reducedMotion: 'reduce'` so it hits that path.

---

### Task 1: Write the failing integration test (new harness flow)

This is the failing test for the whole feature. It encodes the new contract; it will FAIL against the current slide-up UI and stay red until Task 10.

**Files:**
- Modify: `frontend/tests/aurora_assert.mjs:160-244` (the flashcards block)

- [ ] **Step 1: Replace the flashcards study assertions with the charge→flip→payoff flow**

In `frontend/tests/aurora_assert.mjs`, find the block that currently starts at the comment `// flashcards: "Console" no-submit study loop` (around line 160) and runs through the `--flash-topic-hue` assertion (around line 244). Replace the **study + reveal portion** (from the `study-stage` wait at ~line 192 down to just before the `--flash-topic-hue` block at ~line 236) with:

```js
// study: a single-answer tap locks an INSTANT ✓/✗ verdict on the FRONT face, a
// charging-ring suspense beat plays, then the card FLIPS to a full-bleed back face
// carrying the model answer ("Findings") + a gamification payoff. Emulate reduced
// motion so the charge/flip collapse to a fast, deterministic path.
await np.emulateMedia({ reducedMotion: "reduce" });
await np.waitForSelector('[data-testid="study-stage"]', { timeout: 15000 });

// Card 1 (plain): tap an option → flip → back face shows "Findings" + payoff. There
// is NO Check/submit button. Next is held for a short settle, then enables.
await np.locator('[data-testid="flash-option"]').first().click();
await np.waitForSelector('[data-testid="flash-reveal-back"]', { timeout: 8000 });
if ((await np.locator('[data-testid="flash-check"]').count()) > 0) {
  console.error("FAIL: flashcards must not have a Check/submit button"); process.exit(1);
}
if ((await np.locator('.flash-compare-label:has-text("Findings")').count()) < 1) {
  console.error("FAIL: flashcards model answer not revealed on the back face"); process.exit(1);
}
if ((await np.locator('[data-testid="flash-payoff"]').count()) < 1) {
  console.error("FAIL: flashcards reveal is missing the gamification payoff"); process.exit(1);
}
if (await np.locator('[data-testid="flash-advance"]').isEnabled()) {
  console.error("FAIL: Next should be settle-gated immediately after the flip"); process.exit(1);
}
console.log("PASS: flashcards — plain tap flips to a full-bleed payoff; Next is settle-gated");
await np.locator('[data-testid="flash-advance"]').click(); // auto-waits out the settle

// Card 2 (requires_explanation): tapping shows the verdict + a reasoning box on the
// FRONT face (NO model yet, NO Next). Charging the reveal flips to the back face.
await np.waitForSelector('[data-testid="flash-option"]', { timeout: 8000 });
await np.locator('[data-testid="flash-option"]').first().click();
await np.waitForSelector('[data-testid="flash-reason"]', { timeout: 8000 });
if ((await np.locator('.flash-compare-label:has-text("Findings")').count()) > 0) {
  console.error("FAIL: model answer shown before the learner's reasoning on a reason card"); process.exit(1);
}
if ((await np.locator('[data-testid="flash-advance"]').count()) > 0) {
  console.error("FAIL: Next should not exist until the reveal is charged"); process.exit(1);
}
await np.locator('[data-testid="flash-reason"]').fill("Immediate irrigation limits ongoing damage.");
await np.locator('[data-testid="flash-reveal-model"]').click();
await np.waitForSelector('.flash-compare-label:has-text("Findings")', { timeout: 8000 });
console.log("PASS: flashcards — reason card flips to the model AFTER the learner's explanation");
await np.locator('[data-testid="flash-advance"]').click(); // auto-waits out the settle

await np.emulateMedia({ reducedMotion: "no-preference" });
```

Leave the existing `flash-setup` / `flash-fan` / pagination assertions above (lines ~174-191) and the `flash-results-score` + `--flash-topic-hue` assertions below (lines ~231-244) unchanged. The `complete` route mock already returns `{ ok: true }`; the `check` route mock at line 163 stays.

- [ ] **Step 2: Run the harness to verify it FAILS**

First build + serve the standalone frontend (the harness hits `127.0.0.1:3000`; `next start` is flaky under `output: standalone` — build, copy static, run the standalone server):

```bash
cd frontend && npm run build \
  && cp -r .next/static .next/standalone/.next/static \
  && cp -r public .next/standalone/public \
  && (node .next/standalone/server.js &) \
  && sleep 4 && node tests/aurora_assert.mjs
```

Expected: FAIL at `flash-payoff` (or earlier) — the current UI renders the slide-up `flash-modelwrap`, not a flip with a payoff. Record the failing line.

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/aurora_assert.mjs
git commit -m "test(flashcards): assert charge→flip→payoff reveal flow"
```

---

### Task 2: `comboMultiplier` tier function

The single source of truth for combo tiers, shared by the orchestrator (award math) and the card (display).

**Files:**
- Modify: `frontend/src/aurora/components/flashcards/types.ts` (append near `XP_CORRECT`/`XP_ATTEMPT`, ~line 19)

- [ ] **Step 1: Add the function**

After the `XP_ATTEMPT` constant in `types.ts`, add:

```ts
/** Consecutive-correct streak → points multiplier. The multiplier applies to the
 *  card that ACHIEVES the streak (your 2nd-in-a-row correct earns x2 on itself).
 *  Tiers: x1 (0–1), x2 (2–3), x3 (4–5), x4 (6+, capped). One source for the
 *  orchestrator's XP award and the card's points display so they never disagree. */
export function comboMultiplier(combo: number): number {
  if (combo >= 6) return 4;
  if (combo >= 4) return 3;
  if (combo >= 2) return 2;
  return 1;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS (no consumers yet).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/flashcards/types.ts
git commit -m "feat(flashcards): comboMultiplier tier function"
```

---

### Task 3: `useFlashFx` — sound, haptics, persistent mute

A self-contained hook owning a tiny WebAudio synth, `navigator.vibrate`, and the persisted mute flag. `McqCard` calls `fx.charge()`, `fx.win()`, `fx.miss()`; `FlashShell` reads/sets the mute flag.

**Files:**
- Create: `frontend/src/aurora/components/flashcards/useFlashFx.ts`

- [ ] **Step 1: Create the hook**

```ts
"use client";
/* useFlashFx — the flashcard study sound + haptics layer. A lazily-created WebAudio
   synth (no asset files) plus navigator.vibrate, gated by a persisted mute flag.
   The AudioContext is created on first cue (always downstream of a tap = a user
   gesture, so autoplay policy is satisfied). Reduced motion suppresses the charge
   tone; an explicit mute suppresses everything (sound AND haptics). */
import { useCallback, useEffect, useRef, useState } from "react";

const MUTE_KEY = "eyebot_flash_sound";   // stored value "off" = muted
const MUTE_EVENT = "eyebot-flash-mute";  // cross-component sync (FlashShell ↔ cards)

export function readFlashMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === "off"; } catch { return false; }
}
export function setFlashMuted(muted: boolean): void {
  try { localStorage.setItem(MUTE_KEY, muted ? "off" : "on"); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(MUTE_EVENT, { detail: muted }));
}

/** Subscribe a component to the shared mute flag. Returns [muted, toggle]. */
export function useFlashMute(): [boolean, () => void] {
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    setMuted(readFlashMuted());
    const onEvt = (e: Event) => setMuted((e as CustomEvent<boolean>).detail);
    const onStore = (e: StorageEvent) => { if (e.key === MUTE_KEY) setMuted(readFlashMuted()); };
    window.addEventListener(MUTE_EVENT, onEvt);
    window.addEventListener("storage", onStore);
    return () => { window.removeEventListener(MUTE_EVENT, onEvt); window.removeEventListener("storage", onStore); };
  }, []);
  const toggle = useCallback(() => setFlashMuted(!readFlashMuted()), []);
  return [muted, toggle];
}

type Ctx = AudioContext & { __eyebot?: boolean };

export function useFlashFx() {
  const ctxRef = useRef<Ctx | null>(null);
  const reduced = () =>
    document.documentElement.dataset.motion === "reduce" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const ctx = (): Ctx | null => {
    if (readFlashMuted()) return null;
    if (!ctxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC() as Ctx;
    }
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  };

  const blip = (c: Ctx, freq: number, t0: number, dur: number, type: OscillatorType, peak = 0.16) => {
    const osc = c.createOscillator(); const g = c.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(c.destination); osc.start(t0); osc.stop(t0 + dur + 0.02);
  };
  const buzz = (ms: number | number[]) => { try { navigator.vibrate?.(ms); } catch { /* ignore */ } };

  /** Rising tone tracking the charge (skipped under reduced motion). */
  const charge = useCallback(() => {
    if (reduced()) return; const c = ctx(); if (!c) return;
    const t0 = c.currentTime;
    const osc = c.createOscillator(); const g = c.createGain();
    osc.type = "sawtooth"; osc.frequency.setValueAtTime(180, t0);
    osc.frequency.exponentialRampToValueAtTime(560, t0 + 1.4);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.45);
    osc.connect(g).connect(c.destination); osc.start(t0); osc.stop(t0 + 1.5);
  }, []);

  /** Bright arpeggio + short haptic on a correct flip. */
  const win = useCallback(() => {
    buzz(18); const c = ctx(); if (!c) return; const t = c.currentTime;
    [523.25, 659.25, 783.99].forEach((f, i) => blip(c, f, t + i * 0.07, 0.22, "triangle"));
  }, []);

  /** Soft low thunk + double-blip haptic on a miss. */
  const miss = useCallback(() => {
    buzz([12, 40, 12]); const c = ctx(); if (!c) return; const t = c.currentTime;
    blip(c, 174.61, t, 0.3, "sine", 0.14);
  }, []);

  return { charge, win, miss };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/flashcards/useFlashFx.ts
git commit -m "feat(flashcards): useFlashFx sound/haptics/mute hook"
```

---

### Task 4: `ChargeRing` — the suspense beat

A conic ring that fills 0→1 over `CHARGE_MS`, with hold-to-fast-charge, then calls `onComplete`. Reduced motion → a short timeout, no ring.

**Files:**
- Create: `frontend/src/aurora/components/flashcards/ChargeRing.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";
/* ChargeRing — the suspense beat between locking an answer and the flip. A conic
   stroke fills over CHARGE_MS; press-and-hold anywhere on the ring overlay charges
   it ~3× faster (agency, and a release valve for impatient learners). Calls
   onComplete once at full. Reduced motion: a short timeout, no spinning ring. */
import { useEffect, useRef, useState } from "react";

export const CHARGE_MS = 1500;
const REDUCED_MS = 250;
const BOOST = 3;

export function ChargeRing({ onComplete }: { onComplete: () => void }) {
  const [pct, setPct] = useState(0);
  const boosting = useRef(false);
  const done = useRef(false);

  useEffect(() => {
    const reduced =
      document.documentElement.dataset.motion === "reduce" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finish = () => { if (done.current) return; done.current = true; onComplete(); };

    if (reduced) { const t = setTimeout(finish, REDUCED_MS); return () => clearTimeout(t); }

    let raf = 0; let prev = performance.now(); let p = 0;
    const tick = (now: number) => {
      const dt = now - prev; prev = now;
      p += (dt / CHARGE_MS) * (boosting.current ? BOOST : 1);
      if (p >= 1) { setPct(1); finish(); return; }
      setPct(p); raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onComplete]);

  const R = 52; const C = 2 * Math.PI * R;
  const down = () => { boosting.current = true; };
  const up = () => { boosting.current = false; };

  return (
    <div className="flash-charge" data-testid="flash-charge"
      onPointerDown={down} onPointerUp={up} onPointerLeave={up} aria-hidden>
      <svg className="flash-charge-ring" viewBox="0 0 120 120">
        <circle className="flash-charge-track" cx="60" cy="60" r={R} />
        <circle className="flash-charge-fill" cx="60" cy="60" r={R}
          style={{ strokeDasharray: C, strokeDashoffset: C * (1 - pct) }} />
      </svg>
      <span className="flash-charge-spark" />
      <span className="flash-charge-hint">hold to charge</span>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/flashcards/ChargeRing.tsx
git commit -m "feat(flashcards): ChargeRing suspense beat with hold-to-fast-charge"
```

---

### Task 5: `Payoff` — back-face gamification band

Verdict headline + combo flare + points count-up + a self-terminating particle canvas.

**Files:**
- Create: `frontend/src/aurora/components/flashcards/Payoff.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";
/* Payoff — the back-face landing. Big verdict headline, a points tick-up
   (base × combo multiplier), a combo flare when the multiplier > 1, and a
   self-terminating particle burst on a canvas (confetti on a hit scaled by the
   multiplier; a calm shimmer on a miss — never punishing). No library, one rAF. */
import { useEffect, useRef } from "react";
import { useCountUp } from "@/hooks/useCountUp";
import { comboMultiplier } from "./types";

export function Payoff({ correct, combo, basePoints }: { correct: boolean; combo: number; basePoints: number }) {
  const mult = correct ? comboMultiplier(combo) : 1;
  const points = correct ? basePoints * mult : basePoints;
  const { ref, display } = useCountUp<HTMLSpanElement>(points, { duration: 900, format: (n) => `+${Math.round(n)}` });
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const reduced =
      document.documentElement.dataset.motion === "reduce" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cv = canvas.current; if (!cv || reduced) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr; ctx.scale(dpr, dpr);
    const hue = correct ? 150 : 255;
    const n = correct ? 36 + mult * 22 : 16;
    type P = { x: number; y: number; vx: number; vy: number; life: number; size: number; hue: number };
    const ps: P[] = Array.from({ length: n }, () => ({
      x: w / 2, y: h * 0.42,
      vx: (Math.random() - 0.5) * (correct ? 7 : 2),
      vy: (Math.random() - (correct ? 0.9 : 0.4)) * (correct ? 7 : 3),
      life: 1, size: 2 + Math.random() * (correct ? 4 : 2),
      hue: hue + (Math.random() - 0.5) * 50,
    }));
    let raf = 0; const t0 = performance.now();
    const draw = (t: number) => {
      const el = t - t0; ctx.clearRect(0, 0, w, h);
      for (const p of ps) {
        p.x += p.vx; p.y += p.vy; p.vy += correct ? 0.12 : 0.03; p.vx *= 0.99;
        p.life = Math.max(0, 1 - el / 1200);
        ctx.globalAlpha = p.life; ctx.fillStyle = `hsl(${p.hue} 85% 62%)`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.28); ctx.fill();
      }
      if (el < 1200) raf = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [correct, mult]);

  return (
    <div className={`flash-payoff ${correct ? "is-right" : "is-wrong"}`} data-testid="flash-payoff">
      <canvas ref={canvas} className="flash-payoff-fx" aria-hidden />
      <div className="flash-payoff-row">
        <p className="flash-payoff-verdict">{correct ? "Correct" : "Review this"}</p>
        {mult > 1 && <span className="flash-combo" data-testid="flash-combo">combo ×{mult} · {combo} streak</span>}
        <span ref={ref} className="flash-payoff-points">{display}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/flashcards/Payoff.tsx
git commit -m "feat(flashcards): Payoff back-face combo/points/particles band"
```

---

### Task 6: Rework `McqCard` into the flip scene + state machine

Restructure the card into a front face (question/options/reason gate/charge overlay) and a back face (Findings + Payoff + Next), driven by `answering → charging → revealed`. Preserve all existing testids.

**Files:**
- Rewrite: `frontend/src/aurora/components/flashcards/McqCard.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
"use client";
/* McqCard — the two-faced study instrument. Tap = instant ✓/✗ lock on the FRONT
   face. A ChargeRing suspense beat plays, then the card FLIPS (CSS, .is-flipped) to
   a full-bleed BACK face: the Payoff (verdict + combo + points + particles) over the
   model answer ("Findings"). Plain cards charge straight after the lock; reflection
   cards (~1 in 5) take a one-line reason on the front first, then charge. Free-text
   tutor cards "Show answer" → charge → flip → self-mark. After the flip the Next /
   self-mark is held for a short SETTLE so the payoff plays before advancing. The
   drifting colour lights live behind the whole canvas (FlashShell), not in the card. */
import { useEffect, useState } from "react";
import { type Flashcard, MAX_REASON_CHARS, gradeSelection, XP_CORRECT, XP_ATTEMPT } from "./types";
import { Icon } from "@/aurora/icons";
import { ChargeRing } from "./ChargeRing";
import { Payoff } from "./Payoff";
import { useFlashFx } from "./useFlashFx";

const SETTLE_MS = 700; // payoff dwell after the flip before Next/self-mark unlocks

interface Props {
  card: Flashcard; topicLabel: string; idx: number; total: number; combo: number;
  onCheck: (correct: boolean, selected: number[], reasoning: string) => void;
  onReason: (cardId: number, stem: string, text: string, model: string) => void;
  onAdvance: () => void; advanceLabel: string; reasonNote: string | null;
}

export function McqCard(p: Props) {
  const { card } = p;
  const fx = useFlashFx();
  const [selected, setSelected] = useState<number[]>([]);
  const [reasoning, setReasoning] = useState("");
  const [sentReason, setSentReason] = useState(false);
  const [checked, setChecked] = useState(false);   // verdict computed, options locked
  const [verdict, setVerdict] = useState(false);
  const [charging, setCharging] = useState(false);  // ChargeRing on the front
  const [revealed, setRevealed] = useState(false);  // flipped to the back face
  const [ready, setReady] = useState(false);        // settle elapsed → advance allowed
  const [marked, setMarked] = useState(false);      // free-text self-mark guard

  useEffect(() => {
    setSelected([]); setReasoning(""); setSentReason(false); setChecked(false);
    setVerdict(false); setCharging(false); setRevealed(false); setReady(false); setMarked(false);
  }, [card.id]);

  // After the flip lands, hold the Next/self-mark for the settle beat, then unlock.
  useEffect(() => {
    if (!revealed) return;
    setReady(false);
    const t = setTimeout(() => setReady(true), SETTLE_MS);
    return () => clearTimeout(t);
  }, [revealed]);

  // Keyboard advance (Enter / →) — only once revealed AND settled, never on free-text
  // cards where a Got it / Missed it choice is required first.
  useEffect(() => {
    if (!revealed || !ready || card.freeText) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); p.onAdvance(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, ready, card.freeText, p.onAdvance]);

  const needsReason = card.requiresExplanation && !card.freeText;
  const letters = ["a", "b", "c", "d", "e", "f"];

  const ignite = (li: Element | null) => {
    const lamp = li?.querySelector(".flash-lamp"); if (!lamp) return;
    const r = document.createElement("span"); r.className = "flash-ignite";
    lamp.appendChild(r); setTimeout(() => r.remove(), 650);
  };

  // The suspense beat → on complete, fire the verdict cue and flip.
  const startCharge = (correct: boolean) => {
    setCharging(true); fx.charge();
    void correct; // cue fires on completion, below
  };
  const onCharged = () => {
    setCharging(false); setRevealed(true);
    if (verdict) fx.win(); else fx.miss();
  };

  const doReveal = (sel: number[]) => {
    if (checked) return;
    const correct = gradeSelection(card, sel);
    setSelected(sel); setVerdict(correct); setChecked(true);
    p.onCheck(correct, sel, "");
    if (!needsReason) startCharge(correct); // plain cards charge straight away
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
  // Reflection card: learner commits a reason, THEN the reveal charges + flips.
  const revealModel = () => {
    if (charging || revealed) return;
    if (reasoning.trim() && !sentReason) {
      p.onReason(card.id, card.stem, reasoning.trim(), card.explanation); setSentReason(true);
    }
    startCharge(verdict);
  };
  const advance = () => { if (ready) p.onAdvance(); };
  const showAnswerFree = () => { if (checked) return; setChecked(true); setVerdict(true); startCharge(true); };
  const selfMark = (got: boolean) => {
    if (marked || !ready) return;
    setMarked(true); p.onCheck(got, [], ""); p.onAdvance();
  };

  const topBar = (
    <div className="flash-top">
      <span className="flash-tag"><span aria-hidden>&#9673;</span>{p.topicLabel}</span>
      <span className="flash-track" aria-label={`Card ${p.idx + 1} of ${p.total}`}>
        <span className="flash-segs">{Array.from({ length: p.total }).map((_, i) =>
          <i key={i} className={i < p.idx ? "is-done" : i === p.idx ? "is-now" : ""} />)}</span>
        <span className="flash-count">{String(p.idx + 1).padStart(2, "0")} / {String(p.total).padStart(2, "0")}</span>
      </span>
    </div>
  );

  const nextBtn = (
    <button type="button" className="flash-advance" data-testid="flash-advance"
      disabled={!ready} onClick={advance}>
      <span>{ready ? p.advanceLabel : "hold…"}</span>
    </button>
  );

  // Back face: the model answer, owned by the whole card, under the Payoff.
  const basePoints = verdict ? XP_CORRECT : XP_ATTEMPT;
  const backFace = (
    <div className="flash-face is-back">
      <div className="flash-cardin" data-testid="flash-reveal-back">
        {topBar}<div className="flash-rule" />
        <Payoff correct={verdict} combo={p.combo} basePoints={basePoints} />
        <p className="flash-compare-label">Findings</p>
        <p className="flash-model flash-model-big">{card.explanation}</p>
        {needsReason && p.reasonNote && (
          <p className="flash-reason-note" data-testid="flash-reason-note">{p.reasonNote}</p>
        )}
        {card.freeText ? (
          <div className="flash-selfmark">
            <button type="button" className="flash-mark-miss" disabled={!ready} onClick={() => selfMark(false)}>Missed it</button>
            <button type="button" className="flash-mark-got" disabled={!ready} onClick={() => selfMark(true)}>Got it</button>
          </div>
        ) : nextBtn}
      </div>
    </div>
  );

  if (card.freeText) {
    return (
      <div className={`flash-card${revealed && verdict ? " is-right" : ""}${revealed ? " is-flipped" : ""}`}>
        <div className="flash-flip">
          <div className="flash-face is-front">
            <div className="flash-cardin">
              {topBar}<div className="flash-rule" /><p className="flash-kicker">recall</p>
              <p className="flash-q">{card.stem}</p>
              {!checked && (
                <button type="button" className="flash-advance flash-reveal-btn"
                  data-testid="flash-reveal" onClick={showAnswerFree}>Show answer</button>
              )}
            </div>
          </div>
          {backFace}
        </div>
        {charging && <ChargeRing onComplete={onCharged} />}
      </div>
    );
  }

  return (
    <div className={`flash-card${revealed && verdict ? " is-right" : ""}${revealed ? " is-flipped" : ""}`}>
      <div className="flash-flip">
        <div className="flash-face is-front">
          <div className="flash-cardin">
            {topBar}<div className="flash-rule" />
            <p className="flash-kicker">
              question {String(p.idx + 1).padStart(2, "0")}
              {card.qtype === "multi" && (
                <span className="flash-multi" data-testid="flash-multi">
                  <span aria-hidden>&#10003;&#10003;</span> Select all that apply
                </span>
              )}
            </p>
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
                    onClick={(e) => fireLock(e.currentTarget.closest(".flash-card") as HTMLElement)}>
                    <Icon.lock size={18} />
                  </button>
                )}
              </div>
            )}

            {/* Reflection card — reason first; the reveal is gated behind it. */}
            {checked && needsReason && !charging && !revealed && (
              <div className="flash-reason">
                <p className={`flash-verdict ${verdict ? "is-right" : "is-wrong"}`}>{verdict ? "signal locked" : "review this one"}</p>
                <p className="flash-compare-label">Your reasoning first</p>
                <textarea className="flash-reason-box" data-testid="flash-reason" rows={2}
                  maxLength={MAX_REASON_CHARS} value={reasoning} autoFocus
                  placeholder="In a sentence, why? (we'll review it — optional)"
                  onChange={(e) => setReasoning(e.target.value.slice(0, MAX_REASON_CHARS))} />
                <button type="button" className="flash-advance flash-reveal-btn"
                  data-testid="flash-reveal-model" onClick={revealModel}>
                  Charge reveal &rarr;
                </button>
              </div>
            )}
          </div>
        </div>
        {backFace}
      </div>
      {charging && <ChargeRing onComplete={onCharged} />}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: FAIL — `StudyStage` does not yet pass the new required `combo` prop. That gap is closed in Task 8. (If you prefer a green checkpoint here, do Task 8 immediately after this step before typechecking.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/flashcards/McqCard.tsx
git commit -m "feat(flashcards): rework McqCard into the charge→flip two-face scene"
```

---

### Task 7: Flip-scene + payoff + charge CSS; retire the dwell-on-Next

Add the perspective/flip/face rules, charge ring, payoff band, combo flare, and reduced-motion fallbacks. Move the rim + slab from `.flash-card` onto `.flash-face`. Remove the now-dead dwell-ring rules.

**Files:**
- Modify: `frontend/src/aurora/aurora.css` (`.flash-card` block ~2273-2296; dwell rules ~2409-2418; reduced-motion blocks ~2598-2612; scoped dark overrides ~2515-2551)

- [ ] **Step 1: Convert `.flash-card` into the perspective container and move rim/slab to the faces**

Replace the current `.flash-card` / `::before` / `::after` / `.is-right` / `.flash-cardin` rules (lines ~2273-2296) with:

```css
/* Instrument card — now a 3D flip scene. .flash-card is the perspective container;
   .flash-flip grid-stacks the two faces (so the box grows to the taller face) and
   rotates on reveal; each .flash-face is a complete dark card (its own rotating
   aurora rim + frosted slab). The colour lights live behind the canvas (FlashShell). */
.flash-card { position: relative; width: 100%; min-height: min(74vh, 700px);
  perspective: 1800px; background: transparent; border: none;
  box-shadow: 0 44px 96px -36px rgba(98,84,230,.55), 0 18px 46px -22px rgba(60,40,120,.42);
  transition: box-shadow .35s ease; isolation: isolate;
  --f-ink: #f3f4fc; --f-ink2: #dde2fb; --f-mono: #9aa3cc;
  --f-line: rgba(170,185,255,.16); --f-paper: rgba(150,170,255,.05); }
.flash-card.is-right { box-shadow: 0 44px 96px -36px rgba(13,130,118,.5), 0 18px 46px -22px rgba(8,80,70,.5); }

.flash-flip { position: relative; display: grid; width: 100%; min-height: inherit;
  transform-style: preserve-3d; transition: transform .7s cubic-bezier(.2,.8,.2,1); }
.flash-card.is-flipped .flash-flip { transform: rotateY(180deg); }

.flash-face { grid-area: 1 / 1; display: flex; flex-direction: column;
  min-height: min(74vh, 700px); border-radius: 26px; padding: 38px 42px 32px;
  overflow: hidden; isolation: isolate; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.flash-face.is-front { transform: rotateY(0deg); }
.flash-face.is-back { transform: rotateY(180deg); }
/* Rotating spectrum rim — the full aurora orbits behind each face's slab. */
.flash-face::before { content: ""; position: absolute; inset: -55%; z-index: 0; pointer-events: none;
  background: conic-gradient(from 0deg,
    rgba(124,92,246,0) 0deg, #7C5CF6 55deg, #22B8D4 130deg, rgba(34,184,212,0) 188deg,
    #FBA838 256deg, #F0397E 312deg, rgba(124,92,246,0) 360deg);
  animation: flash-rim 9s linear infinite; }
.flash-face::after { content: ""; position: absolute; inset: 2px; z-index: 1; border-radius: 24px;
  pointer-events: none; background: linear-gradient(135deg, rgba(24,26,56,.93), rgba(12,14,33,.96));
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
/* Correct answer biases the back face's rim teal/green so it reads as success. */
.flash-card.is-right .flash-face.is-back::before { background: conic-gradient(from 0deg,
  rgba(13,130,118,0) 0deg, #0d8276 52deg, #5ce0cf 116deg, rgba(92,224,207,0) 178deg,
  #22B8D4 250deg, #1fc780 312deg, rgba(13,130,118,0) 360deg); }
.flash-cardin { position: relative; z-index: 3; display: flex; flex-direction: column; flex: 1; }
```

- [ ] **Step 2: Add the charge ring, payoff, combo, and big-model styles**

Replace the dwell-ring block (the `.flash-advance.is-dwelling` / `.flash-dwell-*` / `@keyframes flash-dwell` rules, ~lines 2409-2418) with:

```css
/* Charge ring — the suspense overlay over the front face before the flip. */
.flash-charge { position: absolute; inset: 0; z-index: 6; display: flex;
  flex-direction: column; align-items: center; justify-content: center; gap: 14px;
  background: radial-gradient(circle at 50% 44%, rgba(8,10,28,.55), rgba(8,10,28,.78));
  border-radius: 26px; cursor: pointer; touch-action: none; animation: flash-charge-in .25s ease both; }
@keyframes flash-charge-in { from { opacity: 0; } to { opacity: 1; } }
.flash-charge-ring { width: 132px; height: 132px; transform: rotate(-90deg); filter: drop-shadow(0 0 14px hsl(var(--flash-topic-hue) 80% 60% / .5)); }
.flash-charge-track { fill: none; stroke: rgba(180,195,255,.16); stroke-width: 7; }
.flash-charge-fill { fill: none; stroke: hsl(var(--flash-topic-hue) 80% 62%); stroke-width: 7;
  stroke-linecap: round; transition: stroke-dashoffset .06s linear; }
.flash-charge-spark { position: absolute; width: 12px; height: 12px; border-radius: 50%;
  background: hsl(var(--flash-topic-hue) 90% 72%); box-shadow: 0 0 18px 6px hsl(var(--flash-topic-hue) 90% 66% / .8);
  animation: flash-charge-orbit 1.1s linear infinite; }
@keyframes flash-charge-orbit { from { transform: rotate(0) translateY(-58px); } to { transform: rotate(360deg) translateY(-58px); } }
.flash-charge-hint { font: 500 10.5px var(--font-mono); letter-spacing: .18em; text-transform: uppercase;
  color: rgba(210,218,255,.6); }

/* Payoff — back-face gamification band. */
.flash-payoff { position: relative; margin: 0 0 14px; }
.flash-payoff-fx { position: absolute; inset: -38px -42px auto; width: calc(100% + 84px); height: 180px;
  pointer-events: none; z-index: 0; }
.flash-payoff-row { position: relative; z-index: 1; display: flex; align-items: baseline; flex-wrap: wrap; gap: 12px; }
.flash-payoff-verdict { font-family: var(--font-serif); font-weight: 600; font-size: clamp(30px, 4.6vw, 40px);
  letter-spacing: -0.01em; margin: 0; }
.flash-payoff.is-right .flash-payoff-verdict { color: #6ff0d2; text-shadow: 0 2px 26px rgba(31,199,128,.45); }
.flash-payoff.is-wrong .flash-payoff-verdict { color: #ff9c82; text-shadow: 0 2px 22px rgba(217,72,47,.4); }
.flash-payoff-points { margin-left: auto; font: 600 22px var(--font-mono); color: #fbfbff;
  letter-spacing: .02em; }
.flash-combo { display: inline-flex; align-items: center; padding: 4px 12px; border-radius: 999px;
  font: 600 11px var(--font-mono); letter-spacing: .12em; text-transform: uppercase;
  color: #ffe9b8; background: rgba(251,168,56,.18); border: 1px solid rgba(251,168,56,.55);
  animation: flash-combo-pop .5s cubic-bezier(.2,1.4,.4,1) both; }
@keyframes flash-combo-pop { from { opacity: 0; transform: scale(.7) translateY(6px); } to { opacity: 1; transform: none; } }

/* The model answer owns the back face — big and in-your-face. */
.flash-model-big { font: 400 clamp(17px, 2.1vw, 21px)/1.55 var(--font-sans); max-width: 46ch; }
```

- [ ] **Step 3: Add the dark-scoped colour + reduced-motion rules**

In the scoped dark-override section (around line 2515-2551, the `.flash-card .flash-*` rules), the existing `.flash-card .flash-model { color: rgba(236,236,247,.80); }` still applies to `.flash-model-big`. Add right after it:

```css
.flash-card .flash-model-big { color: rgba(244,244,253,.92); }
```

Then in BOTH reduced-motion blocks — the `@media (prefers-reduced-motion: reduce)` block (~line 2598) and the `html[data-motion="reduce"]` block (~line 2606) — add these rules so the flip is an instant face swap and the ring/orbit/combo don't animate. For the media block, append inside it:

```css
@media (prefers-reduced-motion: reduce) {
  .flash-flip { transition: none; }
  .flash-card.is-flipped .flash-flip { transform: none; }
  .flash-face.is-back { transform: none; }
  .flash-card:not(.is-flipped) .flash-face.is-back { display: none; }
  .flash-card.is-flipped .flash-face.is-front { display: none; }
  .flash-charge-spark, .flash-charge, .flash-combo { animation: none; }
}
```

And the equivalent under `html[data-motion="reduce"]`:

```css
html[data-motion="reduce"] .flash-flip { transition: none; }
html[data-motion="reduce"] .flash-card.is-flipped .flash-flip { transform: none; }
html[data-motion="reduce"] .flash-face.is-back { transform: none; }
html[data-motion="reduce"] .flash-card:not(.is-flipped) .flash-face.is-back { display: none; }
html[data-motion="reduce"] .flash-card.is-flipped .flash-face.is-front { display: none; }
html[data-motion="reduce"] .flash-charge-spark, html[data-motion="reduce"] .flash-charge,
html[data-motion="reduce"] .flash-combo { animation: none; }
```

(The existing reduced-motion rules that reference `.flash-modelwrap` / `.flash-dwell-*` can stay or be removed; those classes no longer render, so they are harmless no-ops. Remove the `.flash-dwell-ring { display:none }` lines only if tidying.)

- [ ] **Step 4: Typecheck (CSS has no typecheck; build later). Commit**

```bash
git add frontend/src/aurora/aurora.css
git commit -m "style(flashcards): flip scene, charge ring, payoff; retire dwell ring"
```

---

### Task 8: Combo state + real-XP wiring in the orchestrator; pass `combo` through

Add deck-level combo, fold the combo bonus into `xpRef`, and thread `combo` to `McqCard` via `StudyStage`.

**Files:**
- Modify: `frontend/src/aurora/screens/Flashcards.tsx` (imports ~16, accumulators ~74, `onCheck` ~91-109, `startDrill` reset ~148-149, `<StudyStage>` ~202-207)
- Modify: `frontend/src/aurora/components/flashcards/StudyStage.tsx`

- [ ] **Step 1: Import `comboMultiplier`**

In `Flashcards.tsx`, add `comboMultiplier` to the existing `types` import (line 16-18):

```ts
import {
  type Flashcard, type Difficulty, XP_CORRECT, XP_ATTEMPT, loadSessionCards, topicHue,
  isRenderableCard, comboMultiplier,
} from "@/aurora/components/flashcards/types";
```

- [ ] **Step 2: Add combo state next to the accumulators**

After `const xpRef = useRef(0);` (line 74) add:

```ts
  const comboRef = useRef(0);          // consecutive-correct streak (deck-level)
  const [combo, setCombo] = useState(0); // mirror for prop propagation to the card
```

- [ ] **Step 3: Award the combo bonus inside `onCheck`**

Replace the XP tally lines in `onCheck` (currently lines 105-106):

```ts
    const xp = correct ? XP_CORRECT : XP_ATTEMPT;
    xpRef.current += xp; addXP(xp); incrementTotalCards();
```

with:

```ts
    // Combo: a correct card extends the streak and earns base × multiplier; the
    // bonus folds into xpRef so it flows to /complete as real XP. A miss resets it.
    const newCombo = correct ? comboRef.current + 1 : 0;
    comboRef.current = newCombo; setCombo(newCombo);
    const xp = correct ? XP_CORRECT * comboMultiplier(newCombo) : XP_ATTEMPT;
    xpRef.current += xp; addXP(xp); incrementTotalCards();
```

- [ ] **Step 4: Reset combo on a drill round**

In `startDrill`, the accumulator-reset line (line 149) currently ends `...reasonNotesRef.current = {}; xpRef.current = 0;`. Append the combo reset:

```ts
    reasonNotesRef.current = {}; xpRef.current = 0; comboRef.current = 0; setCombo(0);
```

- [ ] **Step 5: Pass `combo` to `StudyStage`**

In the `<StudyStage ... />` JSX (lines 202-207), add the `combo` prop:

```tsx
      <StudyStage
        key={deckEpoch}
        card={card} idx={idx} total={total} topicLabel={labelForTag(card.tag)}
        reasonNote={reasonNotesRef.current[card.id] ?? null} combo={combo}
        onCheck={onCheck} onReason={onReason} onAdvance={advance} advanceLabel={advanceLabel}
      />
```

- [ ] **Step 6: Thread `combo` through `StudyStage`**

Replace `frontend/src/aurora/components/flashcards/StudyStage.tsx` contents with:

```tsx
"use client";
/* StudyStage — thin frame around the McqCard instrument. The flip/charge/settle
   state lives inside McqCard; the deck-level combo streak is threaded through. */
import { type Flashcard } from "./types";
import { McqCard } from "./McqCard";

interface Props {
  card: Flashcard; idx: number; total: number; topicLabel: string; combo: number;
  reasonNote: string | null;
  onCheck: (correct: boolean, selected: number[], reasoning: string) => void;
  onReason: (cardId: number, stem: string, text: string, model: string) => void;
  onAdvance: () => void; advanceLabel: string;
}

export function StudyStage(p: Props) {
  return (
    <div className="flash-stage" data-testid="study-stage">
      <McqCard card={p.card} topicLabel={p.topicLabel} idx={p.idx} total={p.total}
        combo={p.combo} onCheck={p.onCheck} onReason={p.onReason} onAdvance={p.onAdvance}
        advanceLabel={p.advanceLabel} reasonNote={p.reasonNote} />
    </div>
  );
}
```

- [ ] **Step 7: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS (McqCard's `combo` prop is now supplied end-to-end).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/aurora/screens/Flashcards.tsx frontend/src/aurora/components/flashcards/StudyStage.tsx
git commit -m "feat(flashcards): deck combo streak feeding real XP via xp_delta"
```

---

### Task 9: Subtle mute toggle in `FlashShell`

A small, low-contrast speaker glyph by the Exit affordance, wired to the persisted mute flag.

**Files:**
- Modify: `frontend/src/aurora/icons.tsx` (add `sound` / `mute` glyphs)
- Modify: `frontend/src/aurora/components/flashcards/FlashShell.tsx`
- Modify: `frontend/src/aurora/aurora.css` (add `.flash-mute` near `.flash-exit`)

- [ ] **Step 1: Add speaker glyphs to the Icon set**

In `frontend/src/aurora/icons.tsx`, add two entries before the closing `};` of the `Icon` object (after the `lock` entry):

```tsx
  // speaker — flashcards sound toggle (sound on / muted)
  sound: (p: IconProps) => (<svg {...S(p.size)} aria-hidden><path d="M5 9v6h4l5 4V5L9 9H5z" /><path d="M16 9a3 3 0 0 1 0 6" /></svg>),
  mute: (p: IconProps) => (<svg {...S(p.size)} aria-hidden><path d="M5 9v6h4l5 4V5L9 9H5z" /><path d="M22 9l-6 6M16 9l6 6" /></svg>),
```

- [ ] **Step 2: Render the subtle mute button in `FlashShell`**

Replace `frontend/src/aurora/components/flashcards/FlashShell.tsx` with:

```tsx
"use client";
/* FlashShell — the immersive light root shared by the setup, loading, and study
   states. Defined at module scope so the recall textarea never remounts on a parent
   re-render. Carries the sr-only h1, the Exit affordance, and a subtle mute toggle. */
import type { ReactNode, CSSProperties } from "react";
import { Icon } from "@/aurora/icons";
import { AchievementManager } from "@/screens/AchievementToast";
import { EngravingField } from "./EngravingField";
import { BrownianField } from "./BrownianField";
import { useFlashMute } from "./useFlashFx";

export function FlashShell({
  newAchievements = [], onDismissAchievement = () => {}, onExit, topicHue, engraved = false, children,
}: {
  newAchievements?: string[];
  onDismissAchievement?: (id: string) => void;
  onExit: () => void;
  topicHue?: number;
  /** Activity flow (loading / study / results) — drifts the colour-bloom lights
   *  behind everything and etches the engraving rim around the card. Off for the
   *  setup/fan screen, which keeps its own design. */
  engraved?: boolean;
  children: ReactNode;
}) {
  const [muted, toggleMute] = useFlashMute();
  return (
    <div className="flash-root" style={topicHue != null ? ({ "--flash-topic-hue": topicHue } as CSSProperties) : undefined}>
      <h1 className="sr-only">Flashcards</h1>
      <button type="button" className="flash-exit flash-press" data-testid="flash-exit" onClick={onExit}>
        <Icon.back size={16} /> Exit
      </button>
      {engraved && (
        <button type="button" className="flash-mute" data-testid="flash-mute"
          aria-pressed={muted} aria-label={muted ? "Unmute sound" : "Mute sound"} onClick={toggleMute}>
          {muted ? <Icon.mute size={15} /> : <Icon.sound size={15} />}
        </button>
      )}
      {engraved && <BrownianField />}
      {engraved && <EngravingField />}
      <AchievementManager achievements={newAchievements} onDismiss={onDismissAchievement} />
      <div className="flash-content">{children}</div>
    </div>
  );
}
```

- [ ] **Step 3: Style it subtle**

In `aurora.css`, find the `.flash-exit` rule and add after it:

```css
/* Subtle sound toggle — low-contrast, tucked beside Exit; never competes for attention. */
.flash-mute { position: absolute; top: 22px; right: 24px; z-index: 40; display: flex;
  align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%;
  background: transparent; border: 1px solid rgba(120,130,170,.22); color: rgba(150,160,200,.55);
  cursor: pointer; transition: color .2s ease, border-color .2s ease, opacity .2s ease; opacity: .55; }
.flash-mute:hover { color: rgba(190,200,235,.9); border-color: rgba(150,160,200,.5); opacity: 1; }
```

(If `.flash-exit` is positioned top-left, this top-right placement keeps them from colliding. If your `.flash-exit` is elsewhere, place `.flash-mute` adjacent to it instead — confirm by reading the `.flash-exit` rule.)

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/icons.tsx frontend/src/aurora/components/flashcards/FlashShell.tsx frontend/src/aurora/aurora.css
git commit -m "feat(flashcards): subtle persistent mute toggle"
```

---

### Task 10: Full green gate + ship

Build, run the harness (now it should pass), typecheck, build, and pytest; then push.

**Files:** none (verification + push)

- [ ] **Step 1: Build the standalone server and run the harness**

```bash
cd frontend && npm run build \
  && cp -r .next/static .next/standalone/.next/static \
  && cp -r public .next/standalone/public \
  && (node .next/standalone/server.js &) \
  && sleep 4 && node tests/aurora_assert.mjs
```

Expected: all PASS lines, including `flashcards — plain tap flips to a full-bleed payoff` and `flashcards — reason card flips to the model AFTER the learner's explanation`, and the final summary line (e.g. `25/25`). If a flashcards assertion fails, debug against the running server before proceeding (do NOT push red).

- [ ] **Step 2: Typecheck + build (CI parity)**

```bash
cd frontend && npm run typecheck && npm run build
```

Expected: both PASS.

- [ ] **Step 3: Backend untouched — prove pytest still green**

```bash
python -m pytest -q
```

Expected: PASS (no backend change; this just proves it).

- [ ] **Step 4: Stage only the feature files and commit any pending squash, then push**

```bash
git add frontend/src/aurora/components/flashcards/McqCard.tsx \
        frontend/src/aurora/components/flashcards/ChargeRing.tsx \
        frontend/src/aurora/components/flashcards/Payoff.tsx \
        frontend/src/aurora/components/flashcards/useFlashFx.ts \
        frontend/src/aurora/components/flashcards/StudyStage.tsx \
        frontend/src/aurora/components/flashcards/FlashShell.tsx \
        frontend/src/aurora/components/flashcards/types.ts \
        frontend/src/aurora/screens/Flashcards.tsx \
        frontend/src/aurora/icons.tsx \
        frontend/src/aurora/aurora.css \
        frontend/tests/aurora_assert.mjs
git status   # confirm no unrelated dirty files are staged
git push origin main
```

Expected: push succeeds; Render auto-deploys `main`. The feature is live.

- [ ] **Step 5: Update memory**

Update `project_flashcards_aperture_redesign.md` and its `MEMORY.md` line with the new reveal (charge→flip→payoff, combo→real-XP via xp_delta, subtle mute, new files `ChargeRing`/`Payoff`/`useFlashFx`, `comboMultiplier` in types, harness updated, final pytest/aurora_assert counts).

---

## Self-Review

**Spec coverage:**
- Charge → flip → payoff flow → Tasks 4, 6, 7. ✓
- Instant ✓/✗ kept on the front → Task 6 (`doReveal` sets lamps before charge). ✓
- Hold-to-fast-charge → Task 4. ✓
- Reasoning-card gate on the front face → Task 6 (`needsReason && !charging && !revealed` block, `flash-reveal-model` = "Charge reveal"). ✓
- Free-text self-mark on the back face → Task 6 (`backFace` freeText branch). ✓
- Combo streak + tiers → Task 2 (`comboMultiplier`) + Task 8 (state/reset). ✓
- Points tick-up = base × multiplier → Task 5 (`Payoff` + `useCountUp`). ✓
- Real XP via existing `xp_delta` → Task 8 (`onCheck` folds bonus into `xpRef`; `finish()` already sends `xpRef.current + sessionComplete`). ✓
- Particles (confetti on hit scaled by combo; shimmer on miss) → Task 5. ✓
- Sound + haptics + subtle persistent mute → Tasks 3 (synth/haptics/flag), 9 (toggle UI). ✓
- Reduced motion (instant face swap, no ring/particles/charge tone) → Tasks 3, 4, 5, 7. ✓
- Flip DOM structure (perspective → preserve-3d → two faces with rim/slab) → Task 7. ✓
- No backend/DB/bank change → confirmed (only frontend files + harness touched). ✓
- Updated test contract w/ preserved testids → Task 1. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type consistency:** `comboMultiplier(combo: number): number` defined in Task 2 and called identically in `Flashcards.tsx` (Task 8) and `Payoff.tsx` (Task 5). `McqCard` Props gains `combo: number` (Task 6); supplied by `StudyStage` (Task 8 Step 6) which is supplied by `Flashcards` (Task 8 Step 5). `ChargeRing` exports `CHARGE_MS` + `{ onComplete }`; consumed in Task 6. `Payoff` props `{ correct, combo, basePoints }` match the call site in Task 6's `backFace`. `useFlashFx()` returns `{ charge, win, miss }` (Task 3) — exactly what Task 6 calls; `useFlashMute()`/`readFlashMuted`/`setFlashMuted` consumed in Task 9. `Icon.sound`/`Icon.mute` added in Task 9 before use. ✓

**Known intermediate red:** Task 6 typecheck fails until Task 8 supplies the `combo` prop — flagged in-task. The end-to-end harness stays red from Task 1 until Task 10 — expected for a UI integration test.
