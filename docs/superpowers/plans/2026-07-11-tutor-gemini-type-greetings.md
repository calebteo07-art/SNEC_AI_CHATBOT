# Tutor Gemini-Type + Learning-Humour Greetings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the `/chat` Tutor surface a sleek Google-Sans/Gemini-style face (Figtree) and make the greeting change every visit with learning-flavoured humour.

**Architecture:** (A) Load Figtree via `next/font/google` and flip the reading sans **only on the `.aurora-chat` scope** with a local `--font-sans` override — the "Mono + Electric" monospace accent labels and electric identity stay untouched. (B) A new pure, Node-testable `tutorGreeting.ts` engine supplies a rotating hello opener + cheeky sub from a learning-humour bank; `Tutor.tsx` picks fresh, non-repeating indices after mount (last shown persisted in `localStorage`).

**Tech Stack:** Next.js 16 / React 19, `next/font/google`, plain CSS custom properties, Node `--experimental-strip-types` unit harness, Playwright-based `aurora_assert.mjs` visual harness.

**Design-lock note:** the Tutor Chat surface is LOCKED ("Mono + Electric / Live Wire", `docs/design-locks.md`). This is a *within-lock refinement* — we change exactly two criteria (reading typeface; greeting-text rotation) and record both in the lock. Preserve: the `tutor-landing` testid, the CoBrand + SNEC marks, the waving `tl-iris` (`tl-iris-wave`), the single `main h1`, the constellation canvas, the electric-indigo `#5B5BFF`, and every `var(--font-mono)` label.

**Known pre-existing state:** the full `aurora_assert.mjs` harness currently exits non-zero at a *pre-existing, unrelated* flashcards D2 back-face assertion (see memory `project_aurora_harness_flashcards_drift`). The **Tutor-landing assertions run before that point** (≈ lines 195–214, flashcards checks come later), so our new Figtree assertion is reached and enforced; the only expected FAIL in a full run is the known flashcards one.

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `frontend/src/app/layout.tsx` | modify | Load Figtree, expose `--font-figtree-src`. |
| `frontend/src/aurora/aurora.css` | modify | Scoped `--font-sans` → Figtree + `font-family` on `.aurora-chat`. |
| `frontend/tests/aurora_assert.mjs` | modify | Regression: `.tl-hello` computed font is Figtree. |
| `frontend/src/aurora/lib/tutorGreeting.ts` | **create** | Pure hello-opener + sub engine (`OPENERS`, `SUBS`, `nextIndex`, `pickTutorGreeting`). |
| `frontend/tests/tutor_greeting_assert.mjs` | **create** | Unit test for the engine. |
| `frontend/src/aurora/components/TutorLanding.tsx` | modify | Consume the engine; render rotating opener + sub. |
| `frontend/src/aurora/screens/Tutor.tsx` | modify | Compute + pass `openerSeed` + `subSeed` (no immediate repeats). |
| `.github/workflows/ci.yml` | modify | Run the new node test. |
| `docs/design-locks.md` | modify | Record the Figtree + rotating-greeting criteria. |

---

## Task 1: Figtree reading type, scoped to the Tutor/Chat surface (Part A)

**Files:**
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/aurora/aurora.css:1408-1424`
- Modify: `frontend/tests/aurora_assert.mjs` (after the waving-Selena block, ≈ line 213)

- [ ] **Step 1: Load Figtree in `layout.tsx`**

Change the font import to add `Figtree`:

```tsx
import { Inter, JetBrains_Mono, Outfit, Playfair_Display, Bricolage_Grotesque, Figtree } from "next/font/google";
```

Add the font declaration after the `homeDisplay` (`Bricolage_Grotesque`) block:

```tsx
/* Figtree — the Google-Sans / Gemini analog for the Tutor/Chat reading surface. Scoped
   to `.aurora-chat` via --font-sans (see aurora.css); a within-lock "Mono + Electric"
   type refinement. Loaded here so the CSS var is available app-wide. */
const figtree = Figtree({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-figtree-src",
  display: "swap",
});
```

Append its variable to the `<html>` className:

```tsx
      className={`${sans.variable} ${mono.variable} ${display.variable} ${flourish.variable} ${homeDisplay.variable} ${figtree.variable}`}
```

- [ ] **Step 2: Scope Figtree onto `.aurora-chat` in `aurora.css`**

In the `.aurora-chat { ... }` rule (starts at line 1408), replace this contiguous slice:

```css
  --chat-line: var(--mono-line);
  position: relative;
  display: flex; flex-direction: column; height: 100%; min-height: 0;
  color: var(--mono-ink);
```

with:

```css
  --chat-line: var(--mono-line);
  /* Reading sans on the Tutor/Chat surface = Figtree (Google-Sans / Gemini analog),
     scoped here so the "Mono + Electric" accent labels (var(--font-mono)) are untouched.
     .tl-hello inherits, .tl-sub / .aurora-chat-name set no family, .aurora-composer-field
     uses var(--font-sans) — all resolve to Figtree under this override. */
  --font-sans: var(--font-figtree-src), system-ui, sans-serif;
  position: relative;
  display: flex; flex-direction: column; height: 100%; min-height: 0;
  color: var(--mono-ink);
  font-family: var(--font-sans);
```

- [ ] **Step 3: Add the Figtree regression assertion to `aurora_assert.mjs`**

Immediately after the waving-Selena assertion (the line
`if (waveAnim !== "tl-iris-wave") { ... process.exit(1); }`), insert:

```js
// Tutor reading sans = Figtree (Google-Sans / Gemini analog), scoped to .aurora-chat.
const tlFont = await np.locator('[data-testid="tutor-landing"] .tl-hello')
  .evaluate((el) => getComputedStyle(el).fontFamily).catch(() => "");
if (!/figtree/i.test(tlFont)) { console.error(`FAIL: Tutor hello not Figtree (fontFamily=${tlFont})`); process.exit(1); }
```

- [ ] **Step 4: Typecheck + build (font must resolve)**

Run (PowerShell tool, from repo root):

```
cd frontend; npm run typecheck; if ($?) { npm run build }
```

Expected: typecheck clean; build succeeds (Figtree fetched + inlined by `next/font`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/layout.tsx frontend/src/aurora/aurora.css frontend/tests/aurora_assert.mjs
git commit -m "feat(tutor): Figtree reading type scoped to the chat surface"
```

---

## Task 2: Pure learning-humour greeting engine (Part B, TDD)

**Files:**
- Create: `frontend/tests/tutor_greeting_assert.mjs`
- Create: `frontend/src/aurora/lib/tutorGreeting.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/tutor_greeting_assert.mjs`:

```js
/* Unit test for the pure tutor-greeting engine. Run with Node's type stripping:
 *   node --experimental-strip-types frontend/tests/tutor_greeting_assert.mjs
 * (tutorGreeting.ts is dependency-free so it imports in isolation.) */
import assert from "node:assert";
import { OPENERS, SUBS, nextIndex, pickTutorGreeting } from "../src/aurora/lib/tutorGreeting.ts";

// 1) banks are non-empty; every opener keeps a name slot; subs stay short
assert.ok(OPENERS.length > 1, "OPENERS must have several entries");
assert.ok(SUBS.length > 1, "SUBS must have several entries");
for (const o of OPENERS) assert.ok(o.before && o.before.length > 0, `opener missing name slot: ${JSON.stringify(o)}`);
for (const s of SUBS) assert.ok(s.length > 0 && s.length <= 120, `sub bad length (${s.length}): ${s}`);

// 2) pickTutorGreeting is stable for fixed seeds and changes when a seed increments
assert.deepStrictEqual(pickTutorGreeting(3, 5), pickTutorGreeting(3, 5));
assert.notStrictEqual(pickTutorGreeting(3, 5).sub, pickTutorGreeting(3, 6).sub);
assert.notStrictEqual(pickTutorGreeting(3, 5).before, pickTutorGreeting(4, 5).before);

// 3) nextIndex stays in range and never repeats a valid `last` when there is a choice
for (let i = 0; i < 1000; i++) {
  const r = i / 1000;
  for (const len of [1, 2, 5, OPENERS.length, SUBS.length]) {
    for (const last of [0, 1, len - 1]) {
      const idx = nextIndex(len, last, r);
      assert.ok(idx >= 0 && idx < len, `nextIndex out of range: ${idx} (len=${len})`);
      if (len > 1) assert.notStrictEqual(idx, last, `nextIndex repeated last=${last} (len=${len}, r=${r})`);
    }
  }
}

// 4) with no valid `last` (-1) the full range is reachable
const seen = new Set();
for (let i = 0; i < 1000; i++) seen.add(nextIndex(5, -1, i / 1000));
assert.ok(seen.has(0) && seen.has(4), "nextIndex(len,-1) must reach the full range");

console.log("PASS: tutor greeting engine");
```

- [ ] **Step 2: Run the test to verify it fails**

Run (PowerShell tool):

```
cd frontend; node --experimental-strip-types tests/tutor_greeting_assert.mjs
```

Expected: FAIL — cannot resolve module `../src/aurora/lib/tutorGreeting.ts`.

- [ ] **Step 3: Implement the engine**

Create `frontend/src/aurora/lib/tutorGreeting.ts`:

```ts
/* Pure, dependency-free tutor-greeting engine — the ever-changing, learning-flavoured
   hello + tease on the /chat landing. No React/imports so it stays unit-testable via
   Node type-stripping (see frontend/tests/tutor_greeting_assert.mjs).

   The student's name renders as a Gemini-gradient <em> between an opener's `before` and
   `after` (ricoe A2). `pickTutorGreeting(openerSeed, subSeed)` is deterministic per seed;
   the landing picks fresh, non-repeating seeds after mount so the greeting differs every
   visit. Humour is about *learning* (studying, memory, exams) with a light eye-care wink. */

export interface Opener {
  before: string; // text before the emphasised name (always non-empty)
  after: string;  // text after the name (usually punctuation)
}

export const OPENERS: Opener[] = [
  { before: "Back for more, ", after: "?" },
  { before: "Round two, ", after: "." },
  { before: "Look who's revising, ", after: "." },
  { before: "Brain warmed up, ", after: "?" },
  { before: "Let's get a little smarter, ", after: "." },
  { before: "Ready to learn something sneaky, ", after: "?" },
  { before: "The textbooks missed you, ", after: "." },
  { before: "Curiosity calling, ", after: "?" },
  { before: "Study mode: engaged, ", after: "." },
  { before: "Here to outsmart yesterday's you, ", after: "?" },
  { before: "Fancy a little revision, ", after: "?" },
  { before: "New day, new neurons, ", after: "." },
  { before: "Let's make it stick, ", after: "." },
  { before: "Good to think with you, ", after: "." },
];

export const SUBS: string[] = [
  "Learning sticks better when you laugh — so let's have some fun with it.",
  "Your brain grows every time you get something wrong. Let's grow it a lot today.",
  "Cramming is a myth; curiosity is the cheat code. Ask away.",
  "The best students ask the 'silly' questions first. Go on, I'm ready.",
  "Spaced repetition, but make it fun. What are we drilling today?",
  "Every expert was once a beginner squinting at a slit lamp. Your turn.",
  "Forgot something from last time? Perfect — that's exactly what we'll lock in.",
  "Ask me the thing you're secretly unsure about. That's where the growth is.",
  "Mistakes are just data. Bring me a good one.",
  "Ten minutes of real thinking beats an hour of highlighting. Let's think.",
  "I don't do lectures — I do 'oh, THAT'S why'. What shall we unlock?",
  "Your future self, mid-exam, will thank you for this. Let's begin.",
  "No such thing as a silly question — only a cornea we haven't cracked yet.",
  "Confused is the feeling of about-to-understand. Lean into it.",
  "Teach it back to me and it's yours forever. Want to try?",
  "Small questions, big gains. What's on your mind?",
];

/* An index in [0, len) that never equals a valid `last` when there is a real choice.
   `r` is a random float in [0, 1). A `last` outside [0, len) means "no constraint" —
   the full range is used. With len <= 1 the sole index (0) is returned. */
export function nextIndex(len: number, last: number, r: number): number {
  if (len <= 1) return 0;
  const clampR = r < 0 ? 0 : r >= 1 ? 0.999999 : r;
  const hasLast = Number.isInteger(last) && last >= 0 && last < len;
  if (!hasLast) return Math.floor(clampR * len);
  const pick = Math.floor(clampR * (len - 1)); // [0, len-2] over the non-`last` slots
  return pick < last ? pick : pick + 1;
}

export function pickTutorGreeting(openerSeed: number, subSeed: number): {
  before: string; after: string; sub: string;
} {
  const oi = ((Math.trunc(openerSeed) % OPENERS.length) + OPENERS.length) % OPENERS.length;
  const si = ((Math.trunc(subSeed) % SUBS.length) + SUBS.length) % SUBS.length;
  return { before: OPENERS[oi].before, after: OPENERS[oi].after, sub: SUBS[si] };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (PowerShell tool):

```
cd frontend; node --experimental-strip-types tests/tutor_greeting_assert.mjs
```

Expected: `PASS: tutor greeting engine`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/lib/tutorGreeting.ts frontend/tests/tutor_greeting_assert.mjs
git commit -m "feat(tutor): pure learning-humour greeting engine + unit test"
```

---

## Task 3: Wire the engine into the UI + CI + lock (Part B integration)

**Files:**
- Modify: `frontend/src/aurora/components/TutorLanding.tsx`
- Modify: `frontend/src/aurora/screens/Tutor.tsx`
- Modify: `.github/workflows/ci.yml:53-55`
- Modify: `docs/design-locks.md` (Tutor Chat lock, after the Greeting-landing bullet)

- [ ] **Step 1: `TutorLanding.tsx` — import the engine, drop the old bits**

Replace the React import line:

```tsx
import { useEffect, useState } from "react";
```

with (the component no longer uses hooks after this change):

```tsx
import { pickTutorGreeting } from "@/aurora/lib/tutorGreeting";
```

Delete the inline `SUBS` bank and its comment (keep `STARTERS`). Remove:

```tsx
/* Ever-changing, light-hearted opener. Rotated by a per-visit seed. */
const SUBS = [
  "Bring me your trickiest question — I dare you.",
  "What shall we untangle today?",
  "Ask me anything. Yes, even the embarrassing ones.",
  "Let's make the optic nerve proud.",
  "Your questions, my circuits. Shall we?",
  "Stuck on something? That's my favourite place to start.",
  "No question too small, no cornea too curly.",
  "Ready to outsmart an eyeball?",
  "Think out loud with me — that's how it sticks.",
  "What's puzzling you? Let's crack it together.",
];
```

Delete the now-unused `timeHello` helper:

```tsx
function timeHello(hour: number): string {
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}
```

- [ ] **Step 2: `TutorLanding.tsx` — add the `openerSeed` prop**

In the destructured params + type, add `openerSeed` next to `subSeed`. Replace:

```tsx
export function TutorLanding({
  firstName, input, onChange, onSend, disabled, sessions, onResume, onStarter, subSeed, leaving = false,
}: {
  firstName: string;
  input: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  sessions: RecentSession[];
  onResume: (s: RecentSession) => void;
  onStarter: (text: string) => void;
  subSeed: number;
  leaving?: boolean;
}) {
```

with:

```tsx
export function TutorLanding({
  firstName, input, onChange, onSend, disabled, sessions, onResume, onStarter, openerSeed, subSeed, leaving = false,
}: {
  firstName: string;
  input: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  sessions: RecentSession[];
  onResume: (s: RecentSession) => void;
  onStarter: (text: string) => void;
  openerSeed: number;
  subSeed: number;
  leaving?: boolean;
}) {
```

- [ ] **Step 3: `TutorLanding.tsx` — compute the greeting, drop the `hour` state**

Replace:

```tsx
  // Default to "evening" for SSR + first client render (matches, no hydration flash),
  // then settle to the real local hour after mount.
  const [hour, setHour] = useState(18);
  useEffect(() => { setHour(new Date().getHours()); }, []);
  const sub = SUBS[((subSeed % SUBS.length) + SUBS.length) % SUBS.length];
  const recent = sessions.slice(0, 5);
```

with:

```tsx
  // Hello opener + cheeky sub both come from the pure engine, chosen by seeds the parent
  // (Tutor) rotates per visit with no immediate repeats. 0/0 on first render is stable.
  const greeting = pickTutorGreeting(openerSeed, subSeed);
  const recent = sessions.slice(0, 5);
```

- [ ] **Step 4: `TutorLanding.tsx` — render the rotating hello + sub**

Replace:

```tsx
        <h1 className="tl-hello">{timeHello(hour)}, <em>{firstName}</em></h1>
        <p className="tl-sub">{sub}</p>
```

with:

```tsx
        <h1 className="tl-hello">{greeting.before}<em>{firstName}</em>{greeting.after}</h1>
        <p className="tl-sub">{greeting.sub}</p>
```

- [ ] **Step 5: `Tutor.tsx` — import the engine**

After the existing `TutorLanding` import line, add:

```tsx
import { OPENERS, SUBS, nextIndex } from "@/aurora/lib/tutorGreeting";
```

- [ ] **Step 6: `Tutor.tsx` — rotate both seeds with no immediate repeats**

Replace:

```tsx
  const [subSeed, setSubSeed] = useState(0); // 0 on SSR/first render; randomised after mount
  useEffect(() => { setSubSeed(Math.floor(Math.random() * 997)); }, []);
```

with:

```tsx
  // Opener + sub seeds: 0/0 on first render (stable), then fresh non-repeating indices
  // after mount so the greeting differs every visit (last shown persisted in localStorage).
  const [openerSeed, setOpenerSeed] = useState(0);
  const [subSeed, setSubSeed] = useState(0);
  useEffect(() => {
    let last: { o: number; s: number } = { o: -1, s: -1 };
    try {
      const raw = localStorage.getItem("eyebot_tutor_greet");
      if (raw) last = JSON.parse(raw);
    } catch { /* ignore */ }
    const o = nextIndex(OPENERS.length, last?.o ?? -1, Math.random());
    const s = nextIndex(SUBS.length, last?.s ?? -1, Math.random());
    setOpenerSeed(o);
    setSubSeed(s);
    try { localStorage.setItem("eyebot_tutor_greet", JSON.stringify({ o, s })); } catch { /* ignore */ }
  }, []);
```

- [ ] **Step 7: `Tutor.tsx` — pass `openerSeed` to the landing**

In the `<TutorLanding ... />` JSX, replace:

```tsx
          subSeed={subSeed}
```

with:

```tsx
          openerSeed={openerSeed}
          subSeed={subSeed}
```

- [ ] **Step 8: Wire the new test into CI**

In `.github/workflows/ci.yml`, in the "Logic harnesses" step, add the middle line:

```yaml
        run: |
          node --experimental-strip-types tests/greeting_assert.mjs
          node --experimental-strip-types tests/tutor_greeting_assert.mjs
          node --experimental-strip-types tests/leaderboard_logic.mjs
```

- [ ] **Step 9: Record both criteria in the design lock**

In `docs/design-locks.md`, immediately after the "Greeting landing (ricoe A2)" bullet in
the "Tutor Chat" section (the bullet that ends `…frozen under reduced motion).`), insert:

```markdown
- **Reading type = Figtree (2026-07-11)**: the Tutor/Chat *reading sans* is **Figtree**
  (a Google-Sans / Gemini analog), scoped to `.aurora-chat` via a local `--font-sans`
  override — hello, sub, "eyebot" name, bubbles, composer. The monospace accent labels
  (`--font-mono`, JetBrains Mono) and the electric-indigo `#5B5BFF` identity are unchanged
  (this refines the *type* criterion only, not the "Mono + Electric" system).
- **Ever-fresh greeting (2026-07-11)**: the hello **opener** and the cheeky **sub** both
  rotate from a **learning-humour** bank (`aurora/lib/tutorGreeting.ts`) with **no immediate
  repeats** (last indices in `localStorage.eyebot_tutor_greet`; 0/0 on first render). The
  name still renders as the Gemini-gradient `<em>`. Pure + unit-tested
  (`frontend/tests/tutor_greeting_assert.mjs`, wired into CI).
```

- [ ] **Step 10: Typecheck + build + node tests**

Run (PowerShell tool):

```
cd frontend; npm run typecheck; if ($?) { node --experimental-strip-types tests/tutor_greeting_assert.mjs; node --experimental-strip-types tests/greeting_assert.mjs; npm run build }
```

Expected: typecheck clean; both node tests print `PASS`; build succeeds. (No unused-import
errors — `useEffect`/`useState` were removed from `TutorLanding`, and both remain used in
`Tutor.tsx`.)

- [ ] **Step 11: Commit**

```bash
git add frontend/src/aurora/components/TutorLanding.tsx frontend/src/aurora/screens/Tutor.tsx .github/workflows/ci.yml docs/design-locks.md
git commit -m "feat(tutor): rotate hello + sub every visit with learning humour; wire CI + lock"
```

---

## Task 4: Full verification + behavioural verify + ship

**Files:** none (verification + push only)

- [ ] **Step 1: Backend sanity (unaffected, but confirm green)**

Run (PowerShell tool, repo root): `python -m pytest -q`
Expected: green (no backend files touched).

- [ ] **Step 2: Frontend gates**

Run (PowerShell tool):

```
cd frontend; npm run typecheck; if ($?) { node --experimental-strip-types tests/tutor_greeting_assert.mjs; node --experimental-strip-types tests/greeting_assert.mjs; node --experimental-strip-types tests/leaderboard_logic.mjs; npm run build }
```

Expected: typecheck clean; all three node harnesses `PASS`; build succeeds.

- [ ] **Step 3: Behavioural verify on the running app (aurora harness, warm-server recipe)**

Use the `/harness` recipe: build the standalone, copy `.next/static` + `public` into
`.next/standalone`, run `node .next/standalone/server.js`, then run the assert against the
already-warm server:

```
node frontend/tests/aurora_assert.mjs http://127.0.0.1:3000
```

Expected: the Tutor-landing section passes — including the new
`FAIL: Tutor hello not Figtree` guard NOT firing (i.e. `.tl-hello` computes a Figtree
family). The run may still exit non-zero **only** at the known pre-existing flashcards D2
back-face assertion (`project_aurora_harness_flashcards_drift`); confirm that is the sole
failure and it is unrelated to this change. If any Tutor/CoBrand/iris/h1 assertion fails,
stop and fix.

- [ ] **Step 4: Manual freshness check**

With the warm server still up, load `/chat` in a browser (or via the harness page context),
note the hello + sub, reload 3–4×, and confirm the opener and sub visibly change and do not
immediately repeat the previous line. (The engine guarantees no immediate repeat via
`nextIndex` + `localStorage.eyebot_tutor_greet`.)

- [ ] **Step 5: Push to main**

Only after Steps 1–4 are green (harness caveat noted), push the three feature commits:

```bash
git push origin main
```

Expected: `main` auto-deploys to Render prod. No new env var / migration is required, so
this is a plain ship.

---

## Self-Review

- **Spec coverage:** Font swap → Task 1. Scoped `--font-sans` so mono accents survive →
  Task 1 Step 2. Pure engine (`OPENERS`/`SUBS`/`nextIndex`/`pickTutorGreeting`) → Task 2.
  No-immediate-repeats + `localStorage` + 0/0 SSR default → Task 3 Steps 3, 6. Gradient-em
  name preserved → Task 3 Step 4. TDD unit test + CI wiring → Tasks 2 & 3 Step 8. Design-lock
  update (both criteria) → Task 3 Step 9. Verification incl. harness + freshness → Task 4.
  Non-goals respected: `greeting.ts`, `INITIAL_MESSAGES`, mono labels untouched.
- **Placeholder scan:** none — every code step shows full content; every command shows the
  expected result.
- **Type consistency:** `pickTutorGreeting(openerSeed, subSeed)` returns `{before, after,
  sub}` — consumed exactly in Task 3 Step 4. `nextIndex(len, last, r)` signature matches all
  call sites (Task 3 Step 6) and the test (Task 2 Step 1). `openerSeed` prop added to both
  the `TutorLanding` type and the `Tutor` call site. `localStorage` key `eyebot_tutor_greet`
  with shape `{o, s}` is written and read consistently.
