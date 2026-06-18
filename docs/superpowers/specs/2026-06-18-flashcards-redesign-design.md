# Flashcards — Frontend Redesign (clean slate)

**Date:** 2026-06-18
**Status:** Approved design, pending implementation plan
**Scope:** Frontend only. Full rebuild of the flashcards presentation layer.
**Supersedes:** "PRISM" (`fe0f448`) and all prior named concepts (Aperture, FUNDUS).

---

## 1. Motivation

The user asked to redesign the entire flashcard frontend from scratch. All four
prompts for "why" were selected: the concept feels wrong, it's too dark/abstract,
the studying UX is weak, and they want something fresh and better. The previous
versions wrapped the feature in a poetic dark metaphor (a glass prism dispersing
light). We are dropping that entirely.

## 2. Decisions (locked with the user)

| Dimension | Decision |
|---|---|
| Concept | **No metaphor.** The feature is honestly named "Flashcards". The design carries it. |
| Visual identity | **Light & on-brand AURORA** — airy light surface, soft Gemini-gradient accents, Google Sans, generous whitespace, calm premium. |
| Frame | **Immersive full-screen** focus mode — nav rail falls away, single Exit affordance (current behaviour kept). |
| Study loop | **Keep the active-recall loop, redress it.** Type answer → AI grade /100 → reveal. All mechanics unchanged. |
| Study-screen layout | **Centered Focus Card** with a springy 3D flip; the reveal (back face) shows the student's answer **next to** the model answer. |
| Setup | **Single setup screen** (difficulty + length + topic gallery + one Start button). Replaces the 3-step stepper. |
| Imagery | **Per-topic anatomical glyphs** — a small SVG glyph per topic on its setup card and on the study card's topic label. Study card otherwise clean. |
| Color | **Score-driven.** Near-neutral while studying; meaningful color (green → blue → amber → cool) arrives at the reveal, driven by the AI score. Color as reward. |
| Typography | **Google Sans throughout + expressive oversized numerals** for the score, so the reveal reads as an event. |
| Motion | **Rich & physical, CSS-only** — springy 3D flip, count-up score, gradient sweep, confetti on high scores (≥85), soft transitions. Respects reduced motion. |

## 3. Principles

1. **Calm while you work, reward when you're done.** Neutral surface during recall;
   color and celebratory motion are consequences of the score.
2. **One thing at a time.** Immersive, single centered card, nothing competing.
3. **Active recall is sacred.** The student types before seeing anything. The loop
   and every mechanic behind it are preserved exactly.

## 4. Architecture

`Flashcards.tsx` (the orchestrator) keeps **all** session-state and grading logic
unchanged — it already cleanly separates logic from presentation. We rebuild only
the presentation components it renders.

New component tree under `frontend/src/aurora/components/flashcards/`:

| Component | Purpose | Depends on |
|---|---|---|
| `FlashShell` | Immersive light root; `sr-only` h1; Exit affordance; `AchievementManager`. Module-scope (stable identity, so the recall textarea never remounts). | `Icon`, `AchievementManager` |
| `SessionSetup` | Single setup screen: difficulty pills, length pills, topic gallery, Start. Commits a `set_key` (or `null` for Mixed). | `FlashcardSetInfo`, `TopicGlyph`, `LENGTHS`, `Difficulty` |
| `StudyStage` | Active-study layout: top bar (Exit/topic/progress dots/XP), coach line, `RecallCard`, readout. Owns keyboard advance (Enter/→ once graded). | `RecallCard`, `Flashcard`, `AiFeedback` |
| `RecallCard` | The centered card with the 3D flip. Front = question + recall + Submit. Back = `RevealBack`. | `RevealBack`, `TopicGlyph`, `useCountUp`, `MAX_ANSWER_CHARS` |
| `RevealBack` | Back face: count-up score, score-driven color, your-answer-vs-model compare, AI feedback, Explain-in-Tutor + advance actions. | `useCountUp`, `AiFeedback` |
| `TopicGlyph` | Per-topic SVG glyph keyed by `topic_key`, with category fallback. Monochrome, inherits accent. | — |
| `types.ts` | **Unchanged** shared primitives. | — |

**Deleted:** `PrismStage.tsx`, `ApertureSelect.tsx`, `StudyDeck.tsx`, `FocusCard.tsx`,
`FocusCoach.tsx`, `SessionReadout.tsx`.

**CSS:** remove all `aperture-*`, `focus-*`, `prism-*` rules from
`frontend/src/aurora/aurora.css`; add a fresh, self-contained `flash-*` block. New
score-driven custom property `--flash-score-hue` (set at reveal) as the single
source of truth for reveal color, gradient sweep, and confetti.

`Flashcards.tsx` changes are limited to: importing the new components, rendering
`FlashShell` + `SessionSetup` / `StudyStage`, and renaming the shell/exit markup.
No logic changes — `submitAnswer`, `finishSession`, `advance`, `explainThis`,
weak-card retry, the `MIN_FOCUS_MS` focus-hold, and all XP/SM-2 plumbing stay.

## 5. Setup screen (`SessionSetup`)

One light screen, no wizard:

- Header: "Flashcards" + a one-line helper.
- **Difficulty** — two pill toggles (Easy / Medium); Easy default.
- **Length** — three pills (Quick 5 / Standard 10 / Deep 20); Standard default.
- **Topic** — responsive grid of topic cards. Each card: `TopicGlyph`, label,
  `completed/total seen`. A **Mixed** card leads the grid (`set_key = null`).
  Cards with `total === 0` are disabled. The difficulty toggle filters which sets
  show (`s.difficulty === difficulty`), mirroring the current data flow.
- **Selection model:** clicking a topic card *selects* it (highlighted, `aria-checked`),
  it does not commit. **Mixed is selected by default**, so Start is always enabled.
  Changing difficulty resets the selection to Mixed (avoids a stale selection from a
  filtered-out set).
- A single primary **Start** button (`data-testid="flash-start"`) commits the
  selected topic's `set_key` (or `null` for Mixed) to the orchestrator.

There are up to 15 topics per role pool (CLINICAL for OA/PSA, OT for the OT role),
so the grid scrolls within the immersive frame as needed.

## 6. Study screen (`StudyStage` + `RecallCard` + `RevealBack`)

**Top bar:** Exit · topic + difficulty · progress dots (filled per graded card) ·
live session XP.

**Coach line:** one short adaptive line above the card (pre-submit nudge; "bringing
your answer into focus…" while grading; score-tiered praise after).

**Front face:** topic glyph + label (+ "↻ refocus" on a retry), the question in
comfortable large type, a recall `textarea` (cap `MAX_ANSWER_CHARS=300`, live
counter, ⌘/Ctrl+Enter submits), and **Submit for grading** (disabled until non-empty).
On submit the input is replaced by a calm focusing loader (prevents double-submit).

**Back face (reveal), after the springy 3D flip:**
- Oversized **count-up score** /100 with score-driven color via `--flash-score-hue`:
  ≥85 vivid green/gradient · 60–84 confident blue · 40–59 amber · <40 cool & encouraging.
- **Your answer beside the model answer** (two columns on wide screens; stacked on
  narrow) so the gap is visible.
- AI **feedback** line (or graceful offline copy when grading errored).
- Actions: **🎓 Explain this in the Tutor** (seeds `eyebot_tutor_seed`, routes to
  `/chat`) and the advance button — **Next card → / Refocus weak cards → / Finish
  session →**.
- Keyboard: once graded, Enter/→ advances.

## 7. Visual system

- **Surface:** light off-white field with a barely-there Gemini-gradient ambient;
  generous whitespace. Reads as native to the rest of the light AURORA app.
- **Color:** neutral tokens during study; `--flash-score-hue` set at reveal is the
  single source driving score color, the gradient sweep, and confetti.
- **Type:** Google Sans throughout; score + key numerals oversized/expressive.
- **Per-topic glyphs:** curated monochrome line-glyph SVG set keyed by `topic_key`,
  e.g. macula / RNFL → retina; IOP/NCT → pressure gauge; colour vision → Ishihara
  dots; eye drops → drop; OCT/fields → scan/plot; with a generic eye glyph fallback
  for any unmapped key. Glyphs inherit the current accent color.

## 8. Motion (CSS-only)

Springy 3D flip on grade; count-up score; gradient sweep across the card on reveal;
**confetti only on a high score (≥85)**; soft fade/slide as cards advance and as
setup mounts. The orchestrator's ~850ms minimum focus-hold before reveal is kept so
fast grades still feel earned. Everything degrades under
`prefers-reduced-motion: reduce` and the app's `data-motion="reduce"` hook (instant
reveal, no confetti). Must stay CSS-only: the student app's `MotionProvider` is not
mounted, so GSAP effect-wrappers (SplitText/Magnetic) crash — use `motion.css`
patterns and `useCountUp`, never GSAP fx wrappers.

## 9. States

- **Loading:** "Bringing your cards into focus…"
- **Empty:** review mode → "Nothing due to review — great job staying sharp!";
  set mode → "No cards in this set yet — more are on the way."
- **Retry/refocus:** weak cards (<`RETRY_THRESHOLD`=40) re-queued once, with refocus
  styling on the card and the "Refocus weak cards →" advance label.
- **Finish:** existing path — write `eyebot_session` + `eyebot_session_complete`,
  sync gamification, route to `/dashboard` (dashboard shows the debrief toast/confetti).

## 10. Test contract (`frontend/tests/aurora_assert.mjs`)

Test-only edits; the harness stays green (target 18/18). Selector migration:

| Old | New |
|---|---|
| `[data-testid="aperture-exit"]` | `[data-testid="flash-exit"]` (update both the flashcards exit check and the a11y back-affordance check) |
| `.aperture-step` | `[data-testid="flash-setup"]` |
| `.aperture-next` ×2 + `[data-testid="aperture-open"]` | click `[data-testid="flash-start"]` directly (Mixed is selected by default, so no topic click is required) |
| `[data-testid="study-deck"]` | `[data-testid="study-stage"]` |
| `.focus-recall` | `.flash-recall` (textarea) |
| `[data-testid="focus-submit"]` | `[data-testid="flash-submit"]` |
| `[data-testid="focus-feedback-head"]` | `[data-testid="flash-score"]` (must contain the numeric grade) |
| `.focus-model-label` ("Model answer") | kept (label text unchanged) |

The mocked routes (`/api/flashcards/generate`, `/api/flashcards/check`) are unchanged.

## 11. Out of scope

No backend, API, or hook changes. No changes to grading, XP, SM-2, or weak-card
logic. No changes to other screens. Pure frontend re-skin + restructure of the
flashcards feature. Acceptance: `npm run typecheck` clean and `aurora_assert.mjs`
green (18/18) with the migrated selectors.
