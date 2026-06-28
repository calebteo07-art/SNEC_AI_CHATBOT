# Flashcards Topic Fan-Carousel — Design

**Date:** 2026-06-28
**Status:** Draft for review
**Surface:** Flashcards selection, step 2 (topic pick)

## Problem

Step 2 of the flashcards intake currently lists topics as a text-tile grid
(`StepTopic`). We want a more engaging, premium picker: a **fan carousel** of
portrait cards, one per topic, each carrying a realistic, medically accurate,
beautiful image of that topic. The fan **auto-rotates** and the student simply
**clicks the topic they want**, which starts that deck immediately.

A donated GSAP fan-carousel component (`card-fan-carousel.tsx`, "SocialCards")
provides the motion; we adapt it to our data, theme, and interaction.

## Goals

- Replace the step-2 topic grid with an auto-rotating fan of photographic topic
  cards, on the existing medical-blue "selection room" surface.
- One click on any card starts that topic. Mixed (all topics) is the first card.
- Per-topic imagery is realistic and medically/anatomically accurate; clinical
  scenes use SNEC staff dress (SingHealth blue scrubs, orange trim).
- Role access is automatic: OA/PSA see the 15 CLINICAL topics, OT sees the 15 OT
  topics (already enforced server-side).
- Ships and works with **zero generated images present** (graceful placeholder);
  the paid image batch is a separate, deliberate, go-ahead-gated step.

## Non-goals

- No change to the study loop, scoring, SM-2, XP, or any `/api/flashcards/*`
  contract.
- No change to step 1 (difficulty + session length).
- No change to role pooling or the topic taxonomy (`flashcard_sets.py`).

## Context (verified in code)

- Topics: `tools/flashcards/flashcard_sets.py` — 2 pools, 15 topics each.
  `CLINICAL` (OA + PSA share it) and `OT`. `pool_for_role()` already routes by
  role; `/api/flashcards/topics` returns only the caller's pool. **Access control
  is done — the carousel renders whatever the endpoint returns.**
- Frontend data: `useFlashcardTopics()` → `FlashcardSetInfo[]`
  (`set_key="topic__difficulty"`, `topic_key`, `label`, `difficulty`, `total`,
  `completed`). `SessionSetup` owns the 2-step flow and calls
  `onStart(setKey | null)`; `null` = Mixed.
- `StepTopic` currently: a grid of `<button class="flash-topic">` tiles; Mixed
  default-selected; `galleryHue(i)` gives each tile a distinct hue.
- Theme tokens live in `aurora.css` under `.flash-root`
  (`--f-azure #2f7fe0`, `--f-cyan #1ec4dd`, `--f-blue #1f5fa6`, `--f-ink`,
  `--f-mono`, `--f-line`). The selection surface is `.flash-root:has(.flash-setup)`
  (light clinical-azure room); study is the deep cobalt field.
- Motion is CSS-gated globally by `html[data-motion="reduce"]`.
- `gsap` `^3.15.0` is already a dependency. `lucide-react` is installed.
- The donated component references `.fan-card` / `.fan-layout` CSS that is **not**
  in the snippet — we author it. `getHeightMultiplier()` expects per-breakpoint
  layout heights of 22 / 26 / 28 / 34 / 38 rem.
- This repo is **not** a shadcn project (no `components.json`, no
  `components/ui`; `@/` → `src/`). Design-system home is
  `src/aurora/components/<feature>/`, PascalCase files.

## Approach

**Chosen: adapt the donated component into a themed `CardFanCarousel`, driven by
a thin topic wrapper.**

Rejected alternatives:
- *Use the component verbatim with `linkUrl`.* Each card would `<a href>` to
  `/flashcards?set_key=...`. Fights our SPA state (loses the step-1
  difficulty/length unless re-encoded in the URL), renders no labels, has no
  click-to-start-in-place semantics, and ships dark-default styling. Rejected.
- *Build a bespoke fan from scratch.* Throws away the tuned GSAP fan math
  (elastic spread, hover physics, responsive multipliers, pagination). Wasteful.
  Rejected.

## Component design

### File placement

- `frontend/src/aurora/components/flashcards/CardFanCarousel.tsx` — the generic,
  reusable fan (adapted donee). **Not** `/components/ui`: this is not a shadcn
  repo, and the project's component home is `src/aurora/components/<feature>/`.
  Placing it beside its only consumer keeps the boundary clean and matches every
  sibling (`McqCard`, `StudyStage`, `StepTopic`).
- `StepTopic.tsx` — rewritten to map role-filtered topic sets → carousel cards
  and wire `onStart`. Thin glue; no fan math.
- `aurora.css` — new `.fan-layout` / `.fan-card` / caption / control styles,
  added inside the existing `.flash-root:has(.flash-setup)` selection block.

### `CardFanCarousel` public API

```ts
export interface FanCard {
  id: string;            // stable key (set_key, or "__mixed")
  imgUrl: string;        // topic image path
  label: string;         // e.g. "Macular OCT"
  sub?: string;          // e.g. "12 cards"
  hue: number;           // galleryHue(i) — placeholder tint + accent
  startable?: boolean;   // false for an empty topic (default true)
}

interface CardFanCarouselProps {
  cards: FanCard[];
  onPick: (card: FanCard) => void;  // fired on click of any startable card
  autoAdvanceMs?: number;           // default 2800; 0 disables
}
```

The internal fan math (FAN_POSITIONS, slot config, responsive multipliers,
entry/cycle/hover GSAP) is preserved from the donee. Adaptations:

1. **Cards carry labels.** Each `.fan-card` renders the image full-bleed plus a
   bottom caption (label + sub) over a translucent gradient, so any card is
   readable and clickable — not just the center one.
2. **Click = pick.** Each card is a `<button>` (was `<a>`/`<div>`); click calls
   `onPick(card)` for startable cards. No "center first" step.
3. **Auto-advance.** A timer calls the existing `cycle("right")` every
   `autoAdvanceMs`. It pauses on `pointerenter` / `focusin` / touch and while the
   entry or a cycle animation is mid-flight (`isAnimating`), and resumes ~1.2 s
   after the pointer leaves. Disabled entirely when `autoAdvanceMs===0` or
   `html[data-motion="reduce"]`.
4. **Image fallback.** `<img onError>` flips the card to a hue-tinted placeholder
   (CSS gradient from `hue` + a lucide glyph + the label), so the UI works with
   no images on disk.
5. **Controls re-themed.** Chevrons → `lucide-react` `ChevronLeft/Right`; arrow +
   dot colors use `--f-blue`/`--f-azure`. Arrows still allow manual browse and
   reset the auto-advance timer.
6. **Reduced motion.** When `data-motion="reduce"`, skip all GSAP tweens — set
   final slot transforms instantly via `gsap.set`, no auto-advance.

### `StepTopic` (rewritten)

```
sets (step-1 difficulty, role-filtered)  ->  one card per topic
cards = [ mixedCard, ...topicCards ]
mixedCard  = { id:"__mixed", label:"Mixed", sub:"full spectrum",
               imgUrl: topicImage("__mixed"), hue: 212 }
topicCard  = { id: set.set_key, label: set.label, sub: `${set.total} cards`,
               imgUrl: topicImage(set.topic_key), hue: galleryHue(i),
               startable: set.total > 0 }
onPick(card) -> onStart(card.id === "__mixed" ? null : card.id)
```

Header keeps "Topics" + a Back affordance to step 1. The Start button is removed
(click-to-start replaces it).

### Image mapping

`topicImage(topicKey: string): string` →
`/media/flashcards/topics/${topicKey}.png` (`"__mixed"` → `mixed.png`). Pure,
deterministic, no network. Missing file is handled by the card's `onError`
fallback, not here.

## Imagery pipeline

New tool: `tools/media/generate_flashcards_topics.py`.

- `TOPIC_PROMPTS: dict[str, str]` — a prompt for **every** `topic_key` in both
  pools (30) plus `__mixed` (31 total). Each prompt: photoreal, medically /
  anatomically accurate, beautiful, portrait. Clinical-scene topics (e.g.
  `triage`, `history_taking`, `fall_risk`, `abbreviations`, `perioperative`,
  `dayward_theatre`, `orthoptics`) depict authentic SNEC scenes in SingHealth
  **blue scrubs with orange trim**. Investigation topics (OCT, HVF, biometry,
  topography, etc.) depict the instrument / its scan output. No text/labels/UI in
  the image.
- Output: `frontend/public/media/flashcards/topics/<topic_key>.png` (+
  `mixed.png`), aspect `3:4`, model `gemini-3-pro-image` (`NB_MODEL` override),
  mirroring `generate_flashcards_hero.py`.
- Flags: `--only <topic_key>` (re-roll one), `--pool CLINICAL|OT|all`,
  `--count N` (candidates). No `GEMINI_API_KEY` → exits cleanly (no spend).
- **Paid.** ~31 generations at 1 candidate each; re-roll weak ones. Run only on
  explicit user go-ahead. ASCII-only console output (Windows).

## Error handling & edge cases

- **No images on disk** (dev / CI / MOCK_MODE / pre-generation): every card shows
  the hue placeholder; the feature is fully usable.
- **Empty topic** (`total === 0`, rare — bank is full): card renders dimmed,
  `startable:false`; click is a no-op. (Carousel still scrolls past it.)
- **< 7 topics**: donee's `getSlotConfig` already handles small decks; our pools
  are 15 so the fan always paginates, but the small-deck path stays intact.
- **SSR**: component is `"use client"`; gsap import is client-only. Unchanged.
- **Pointer-over-during-rotate mis-tap**: auto-advance pauses on hover/touch, so
  a card never slides out from under a click.

## Testing

- **Frontend harness** (`aurora_assert` / flashcards harness, mocks `/api`):
  step 2 renders `.fan-card` count = topics + 1; cards show labels; clicking a
  card invokes the start path (asserts the study stage / generate request);
  arrows change the center; Back returns to step 1; a card with a missing image
  shows the placeholder. Keep the suite green.
- **pytest** (pure, no API): `TOPIC_PROMPTS` covers exactly the union of
  `FLASHCARD_TOPICS["CLINICAL"]` + `["OT"]` keys plus `__mixed` — no missing, no
  extra; all prompts are ASCII and non-empty. Guards drift when topics change.

## Rollout

1. Land the component, `StepTopic` rewrite, CSS, `topicImage`, fallback, and the
   generator tool — all behind the graceful placeholder (no images yet). Green
   harness + pytest + typecheck + build.
2. With explicit go-ahead, run the generator (paid), review candidates, commit
   the 31 images, re-roll any weak ones.
3. Ship per the project's branch → verify → merge cadence (main auto-deploys).

## Open questions

None blocking. Defaults taken: gradient caption overlay; difficulty stays in
step 1 (one image per topic, reused across tiers); auto-advance 2.8 s.
