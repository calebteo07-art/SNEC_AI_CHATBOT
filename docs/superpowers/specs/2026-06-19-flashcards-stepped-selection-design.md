# Flashcards — stepped selection redesign

**Date:** 2026-06-19
**Branch (suggested):** `flashcards-stepped-selection`
**Status:** approved design, pre-plan

## Problem

The flashcard selection screen ([SessionSetup.tsx](../../../frontend/src/aurora/components/flashcards/SessionSetup.tsx))
stacks every choice at once — slit-lamp hero, **Difficulty** pills, **Length**
pills, and the full **topic gallery** — on a single scrolling screen. It reads as
cluttered. The goal is to split selection into focused steps with beautiful
transitions and the existing per-topic color system carried through.

A hard constraint shapes the order: the topic list is filtered by difficulty
(`sets.filter(s => s.difficulty === difficulty)`), so difficulty must be settled
before topics are shown.

Study mechanics, grading, SM-2 passthrough, the per-topic hue system in
[types.ts](../../../frontend/src/aurora/components/flashcards/types.ts), and the
study stage are **out of scope and unchanged**.

## Decisions (from brainstorming)

- **Step structure:** 2 steps — **Session → Topic**. (Respects difficulty→topic
  dependency; ends on the most visual moment.)
- **Navigation:** animated 2-segment progress rail + Back; explicit **Continue**
  on step 1 (two independent pill groups can't cleanly auto-advance); horizontal
  slide + cross-fade between steps.
- **Hero:** large/central on step 1, **recedes to a small badge** on step 2 so the
  topic gallery owns the spotlight. The shrink is a **shared-element morph** — the
  same eye node smoothly scales and travels between the two states, not a swap.

## Design

### Step 1 · "Session" (calm)
- The shared slit-lamp hero (owned by the shell) is large and central, brand-blue
  (`--flash-topic-hue: 212`) glow, existing auto-drift continues throughout.
- **Difficulty** pill group (Easy / Medium) and **Length** pill group
  (Quick / Standard / Deep), reusing existing `.flash-pill` styling.
- Footer: single **Continue →** button. Always enabled (defaults are valid).

### Step 2 · "Topic" (vivid)
- The same hero node has morphed down to a small drifting badge in the header row
  (it never unmounts — see Transition).
- Topic gallery gets the full spotlight; **Mixed** selected by default.
- Selecting a tile floods `--flash-topic-hue` across the screen + progress rail
  (existing `.6s` hue cross-fade).
- Footer: **← Back** and **Start session →** (`flash-start`).

### Progress rail
- Slim 2-segment bar pinned at top of the setup.
- Step 1: segment 1 active, segment 2 idle.
- Step 2: segment 1 "done", segment 2 fills and **adopts the selected topic hue**,
  glowing as the pick changes.

### Transition
- CSS-only (house style — `MotionProvider` is not mounted; no GSAP).
- **Swappable content** (pills group ↔ topic gallery, plus titles/help/footer)
  slides + cross-fades: forward = incoming slides in from the right; Back = from
  the left. Direction tracked in shell state; the active content block is `key`ed
  so React remounts and replays the enter keyframe.
- **The hero does NOT slide or remount.** It is a single persistent node in the
  shell that *morphs* between its two states — scaling down and travelling from
  centered-large to the corner badge — driven by a `data-step` attribute on the
  root. The morph runs on a springy ease (e.g. `cubic-bezier(.22,1,.36,1)`,
  ~520ms) over `transform` (scale + translate) so it reads as one continuous,
  beautiful shrink rather than a resize. The auto-drift `--hx/--hy` animation
  keeps running underneath the morph. `prefers-reduced-motion` collapses the
  morph to an instant state change and neutralises the drift (existing rule).

### Color
- `--flash-topic-hue` brand-blue (212) through step 1; cross-fades to the picked
  topic hue on step 2. Mixed → 212. Existing tile outlines/glows/`is-selected`
  halo reused verbatim.

## Architecture

Split the single `SessionSetup.tsx` into a thin shell + the shared hero + two
focused content views:

- **`SessionSetup.tsx`** (shell) — owns `step` (1 | 2), `direction`
  (`"fwd" | "back"`), `selected` (topic set_key | null), `showAll`. Sets
  `data-step` and `--flash-topic-hue` on the root, and lays out three regions:
  the progress rail (top), the **persistent hero** (rendered here, once, so it
  never unmounts across steps), and the **keyed content block** (the active step's
  swappable content, remounted per step for the slide). Keeps
  `data-testid="flash-setup"` on the root.
- **`StepSession.tsx`** — difficulty/length pills + titles + **Continue** (no hero).
- **`StepTopic.tsx`** — topic gallery + titles + **Back** / **Start** (no hero).

The hero (the existing `HeroPlate`/`PlateWell`) is pulled up into the shell so a
single node serves both steps and can morph; the two step components render only
the content that swaps. Each file stays small and single-purpose, matching the
rest of `components/flashcards/`. New CSS lives in the existing flashcards block of
`aurora.css` (`.flash-steps`, `.flash-rail`, content enter keyframes, and hero
sizing/position keyed off `[data-step]`) — no new stylesheet.

## State & mechanics (unchanged behavior)

- Defaults: `easy` / `10` / Mixed → the flow always completes.
- `pickDifficulty` still resets the topic pick to Mixed (null); reachable by going
  Back to step 1 and changing difficulty, which re-filters the gallery.
- Length is independent.
- `onStart(selected)` fires exactly as today (null = Mixed).
- The orchestrator ([Flashcards.tsx](../../../frontend/src/aurora/screens/Flashcards.tsx))
  is untouched aside from any prop the shell already receives.

## Test impact

`frontend/tests/aurora_assert.mjs` currently clicks `flash-start` immediately after
`flash-setup` appears. Update (test-only) to click **Continue** then **Start**.
Preserved hooks: `flash-setup`, `flash-start`, `flash-exit`, single `main h1`, and
`--flash-topic-hue` on `.flash-root`. Target: harness stays green.

## Out of scope

Study stage, grading, gamification, SM-2, the hue/score systems in `types.ts`,
and the orchestrator's session logic.
