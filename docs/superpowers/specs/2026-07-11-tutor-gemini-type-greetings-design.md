# Tutor / Chat — Gemini-style type + ever-fresh learning-humour greetings

**Date:** 2026-07-11
**Surface:** `/chat` — the Tutor greeting landing (`TutorLanding`) + the live chat
conversation (`Tutor`). Design-locked as "Mono + Electric / Live Wire"
(`docs/design-locks.md` §"Tutor Chat"). This is a *within-lock refinement*, not a rebuild.

## Goal

1. Make the tutor greeting + chat surface read in a sleek, seamless **Gemini /
   Google-Sans-style** typeface.
2. Make the greeting feel **different every time**, with humour about **learning**
   (studying, memory, exams) rather than only eye-anatomy jokes.

## Decisions (settled in brainstorming)

- **Font:** **Figtree** (via `next/font/google`). Real "Google Sans / Gemini Sans"
  is not on the public Google Fonts CDN (see the note in `layout.tsx`); Figtree is a
  clean, geometric, Google-adjacent free analog. It replaces the *reading sans* only.
- **Variation scope:** rotate **both** the hello opener **and** the cheeky sub-line,
  from a learning-humour bank, with **no immediate repeats**.

## Non-goals (YAGNI)

- No change to the Home dashboard greeting engine (`greeting.ts`).
- No randomising the in-conversation opening AI message (`INITIAL_MESSAGES`).
- No change to the monospace accent labels (`--font-mono`), the electric-indigo
  `#5B5BFF` identity, the constellation canvas, the waving Selena, or the CoBrand lockup.
- No new dependency beyond the Figtree webfont (already reachable via `next/font/google`).

## Part A — Figtree typography (scoped to the Tutor/Chat surface)

**Why scoped:** the "Mono + Electric" lock keeps monospace accent labels and the
electric identity. We change exactly one criterion — the *reading sans face* — from
Inter (the app-wide Google-Sans stand-in) to Figtree, and only on this surface.

1. `frontend/src/app/layout.tsx`
   - Load Figtree: `Figtree({ weight: ["400","500","600","700"], subsets: ["latin"],
     variable: "--font-figtree-src", display: "swap" })`.
   - Append `${figtree.variable}` to the `<html>` `className`.

2. `frontend/src/aurora/aurora.css` — on the `.aurora-chat` scope (which wraps both the
   landing and the conversation):
   - Override the token: `--font-sans: var(--font-figtree-src), system-ui, sans-serif;`
   - Set `.aurora-chat { font-family: var(--font-sans); }` so the whole subtree inherits
     Figtree.
   - **Mechanics that make this a one-line flip:** `.tl-hello` uses `font-family: inherit`,
     `.tl-sub` and `.aurora-chat-name` set no family (inherit), and `.aurora-composer-field`
     uses `var(--font-sans)`. All therefore resolve to Figtree under the scoped override.
     Elements that explicitly use `var(--font-mono)` (accent labels, "who" tags, OCT
     readouts) are unaffected → **"Mono + Electric" preserved.**
   - Nothing outside `.aurora-chat` is touched (scope-local; no global cascade change).

3. `docs/design-locks.md` — under the Tutor Chat lock, record: *reading sans on the
   Tutor/Chat surface = Figtree (Google-Sans / Gemini analog); mono accent labels and the
   electric-indigo identity unchanged.*

## Part B — Ever-changing learning-humour greeting (hello + sub)

### New pure module: `frontend/src/aurora/lib/tutorGreeting.ts`

Dependency-free (no React/imports) so it unit-tests via Node type-stripping, mirroring
`greeting.ts`.

```ts
export interface Opener { before: string; after: string } // name renders as gradient <em> between them
export const OPENERS: Opener[]   // ~14 playful, learning-flavoured; every entry has a non-empty `before`
export const SUBS: string[]      // ~16 learning-humour one-liners

/** Pure index that stays in [0,len) and never equals `last` when len>1. r ∈ [0,1). */
export function nextIndex(len: number, last: number, r: number): number

/** Deterministic per seed; stable and testable. */
export function pickTutorGreeting(openerSeed: number, subSeed: number):
  { before: string; after: string; sub: string }
```

- `pickTutorGreeting` indexes each bank with `((seed % len) + len) % len` (same idiom as
  `pickGreeting`) — stable for a fixed seed, changes on `seed + 1`.
- Openers keep the name slot so the existing gradient `<em>{firstName}</em>` still applies.
- Tone: warm, professional-playful — SNEC allied-health students. Learning humour
  (spaced repetition, cramming, memory, exams, "your brain") with a light eye-care wink.

### Wiring: `TutorLanding.tsx` + `Tutor.tsx`

- Remove the inline `SUBS` array and the static `timeHello` hello from `TutorLanding`;
  consume `pickTutorGreeting` instead.
- `Tutor.tsx` currently computes one `subSeed` after mount (0 on SSR to avoid a hydration
  flash). Extend to compute **both** `openerSeed` and `subSeed` after mount, each chosen
  via `nextIndex(len, last, Math.random())` where `last` comes from `localStorage`
  (`eyebot_tutor_greet` → `{ o, s }`); persist the new indices back. Default both to `0`
  on SSR / first render (stable, no hydration mismatch, matches the current pattern).
- `TutorLanding` renders:
  `<h1 className="tl-hello">{before}<em>{firstName}</em>{after}</h1>`
  `<p className="tl-sub">{sub}</p>`
  — preserving the single `main h1`, the gradient em, the testids, the waving iris, and
  the CoBrand lockup the aurora harness asserts.
- `localStorage` access is wrapped in try/catch (private-mode safe), degrading to a plain
  random pick.

### TDD: `frontend/tests/tutor_greeting_assert.mjs`

Mirrors `greeting_assert.mjs` (run via `node --experimental-strip-types`). Written first,
watched fail, then implemented. Assertions:

1. `OPENERS` and `SUBS` are non-empty; every opener has a non-empty `before` (name slot).
2. `pickTutorGreeting(o,s)` is stable for fixed seeds and changes when a seed increments.
3. `nextIndex(len,last,r)` returns an index in `[0,len)` for many `r∈[0,1)`, and never
   equals `last` when `len>1` (returns the sole index when `len===1`).
4. All sub-lines and openers are reasonably short (e.g. `sub.length <= 120`).

Wire it into CI next to the existing greeting node test (same invocation the CI/`package.json`
uses for `greeting_assert.mjs` — confirm the exact hook during planning).

## Acceptance criteria

- The Tutor landing + chat conversation render in Figtree; monospace accent labels remain
  JetBrains Mono; the electric-indigo identity and constellation canvas are visually
  unchanged.
- The hello opener **and** sub-line both change on reload and do not immediately repeat the
  previous visit's line.
- The gradient name, `tutor-landing` testid, waving `tl-iris` (`tl-iris-wave`), CoBrand +
  SNEC marks, and single `main h1` all remain — aurora harness stays green.
- New node test passes; `npm run typecheck && npm run build` clean; `pytest -q` green.
- Behavioural verify on the running app: font is Figtree, greeting varies across reloads.

## Files touched

- `frontend/src/app/layout.tsx` — load Figtree, add the var.
- `frontend/src/aurora/aurora.css` — scoped `--font-sans` override + `.aurora-chat` family.
- `frontend/src/aurora/lib/tutorGreeting.ts` — **new** pure greeting engine.
- `frontend/src/aurora/components/TutorLanding.tsx` — consume the engine; render opener+sub.
- `frontend/src/aurora/screens/Tutor.tsx` — compute + pass `openerSeed` + `subSeed`.
- `frontend/tests/tutor_greeting_assert.mjs` — **new** unit test.
- CI hook (`package.json` / `.github/workflows/ci.yml`) — run the new node test.
- `docs/design-locks.md` — record the Figtree reading-sans criterion.
