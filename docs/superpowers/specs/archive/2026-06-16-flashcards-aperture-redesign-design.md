# Flashcards — "The Aperture" Redesign

**Date:** 2026-06-16
**Status:** Approved (design) — pending spec review
**Area:** Student app · AURORA · Flashcards feature
**Touches:** `frontend/src/aurora/screens/Flashcards.tsx` (split), `aurora.css`, `motion.css`, `frontend/public/media/`, `tools/media/`, `frontend/tests/aurora_assert.mjs`, `frontend/tests/visual_sweep.mjs`

---

## 1. Problem

The flashcard feature works pedagogically but the experience is flat:

- **Selection is boring.** All three criteria (Difficulty, Session length, Topic) are dumped on a single screen as a wall of buttons. The chip classes it uses (`.aurora-topic-picker`, `.aurora-topic-chip`, `.aurora-topic-count`) **are not defined anywhere in CSS**, so they render as unstyled default buttons. It turns students off before they even start.
- **The activity is static.** A typed-recall flow with minimal motion (`aurora-flip-in`, `aurora-rise-in`). Functional, not delightful.
- **One 510-line component** (`Flashcards.tsx`) handles both selection and activity — too much for one file.

## 2. Goal

Redesign the **entire** flashcard feature — selection and activity — so it is beautiful, motion-rich, and fun, while matching the rest of the AURORA app yet carrying its own distinct character. Selection presents **one criterion at a time**. Motion runs throughout both phases.

**Scope decision (locked):** reskin + reflow, **keep all mechanics**. XP, SM-2 spaced repetition, AI grading, achievements, weak-card retry, review mode, tutor-seeded sessions all stay behaviourally identical. We change presentation, flow, and motion only.

## 3. The concept — "The Aperture"

The eye is an optical instrument; studying is *bringing knowledge into focus*. Every screen is the student looking *through* the eye — first setting the aperture, then pulling answers sharp. This eye/optics motif is the "difference and character" layered on top of the app's Gemini palette (blue `#4285F4` → purple `#9B72CB` → rose `#D96570`, Google Sans + mono). It also ties directly to SNEC's identity.

### Visual system — hybrid "Twilight Aurora glass" (scoped to flashcards only)

The flashcard feature does **not** use the app's flat light theme, nor a flat dark one. It is a **hybrid, mid-luminance world** that makes entering flashcards feel like *dimming the room to study*. The rest of AURORA stays light and untouched.

- **Scoping:** the theme lives behind a wrapper on the flashcard root only — `data-theme="aperture"` setting **local CSS variables** that override the light tokens *within the feature*. Nothing leaks to the shell, rail, or other routes. `data-motion="reduce"` and `prefers-reduced-motion` are still honoured.
- **Immersive route:** like the Tutor (`/chat`), `/flashcards` goes full-screen — the Atlas Rail and light mesh fall away (one-line change in `AppShell.tsx`) so the deep field fills the viewport with no light seam. Navigation is preserved via a labelled **Exit** affordance (→ `/dashboard`) and ⌘K. The a11y harness treats `/flashcards` like `/chat` (exit link instead of a `<nav>` landmark).
- **The field (the "deep" half):** a slowly drifting gradient ground — deep indigo `~#1b1840` → aubergine/plum → teal — built as layered, blurred radial blobs (the existing `aurora-mesh` concept, deepened and richer). Mid-luminance, **never pure black**; it breathes slowly.
- **The surfaces (the "light" half):** **frosted-glass panels** — semi-translucent light-tinted (`~rgba(255,255,255,0.72)` + `backdrop-filter: blur`) with soft inner light and a hairline. Text sits on these readable light panels *floating over* the deep colour field — that contrast **is** the hybrid.
- **Two ink sets (AA enforced):** dark ink (`--ink`) on the frosted panels; a defined light ink (`~rgba(255,255,255,0.92)` / `0.66` for secondary) for labels/eyebrows/readouts that sit directly on the deep field. Every text/background pair holds WCAG AA.
- **Accents & glow:** the Gemini gradient becomes **luminous** here — glowing ring borders, the aperture limbus, the score-reactive ring, and soft outer glows on the glass. Tasteful, not neon-loud.
- **Enter/exit transition:** entering the feature "dims the room" — the light app cross-dissolves into the deep field as the aperture dilation plays; leaving restores light. The iris asset's dark pupil reads naturally against the deep ground.

## 4. Selection — "Set the Aperture" (3-step stepper)

A full-bleed stepper set in the deep Twilight Aurora field, with frosted-glass controls. **One criterion per step**, with a generated photoreal **iris** as a living centerpiece that reacts to each choice. Criteria are unchanged in data, reframed in language:

| Step | Criterion (existing) | Reframe | Iris reaction |
|------|----------------------|---------|---------------|
| 1 · Clarity | Difficulty: Easy / Medium | light level | iris glow tunes |
| 2 · Depth | Length: Quick 5 / Standard 10 / Deep 20 | focal depth | aperture ring widens |
| 3 · Lens | Topic: Mixed or a specific set | the lens you look through | iris settles on the choice |

- Topic cards each show their `completed/total` as a small **progress ring** instead of a bare count.
- Transitions: horizontal slide + fade between steps. Progress indicator is an **aperture-blade ring** filling 1→3 (with an accessible fallback). Back/Next buttons. Full keyboard support (arrows / Enter advance, Esc → dashboard).
- Final action **"Open"** → the iris **dilates open** (pupil expands to fill the viewport, striations counter-rotate, Gemini bloom at the limbus) and dissolves straight into the study deck. This dilation is the headline motion moment and the primary use of the generated asset.
- **Skipped** (as today) when entering from a tutor-seeded session or `?mode=review` — those go straight to the deck. The launch dilation still plays as the deck mounts so review/tutor entries keep the signature transition.

## 5. Activity — "In Focus" (study deck)

Keeps the typed active-recall + AI grading flow exactly; redesigns presentation and adds a real 3D flip.

- **No image on the question.** The deck card carries **no raster/eye plate** — the `PlateWell` / `PLATE.flashcards` image used today is removed from the activity. The iris imagery lives only in the selection stepper and the launch dilation, never on the study card. The question is the focal point.
- **Centered focus stage.** The card is a **frosted-glass panel centered in the middle of the screen**, floating over the deep Twilight Aurora field — a single, calm, text-first column (no two-column plate+content split, no side panel competing for attention). Generous space; the question dominates. Any aperture motif on the card is pure-CSS and kept to a thin, subtle, score-reactive **glow ring** at most — it must never pull focus from the text.
- **Front:** small topic label + the **question, large and centered** + the recall textarea below it (existing logic, restyled field; `MAX_ANSWER_CHARS = 300`, ⌘/Ctrl+Enter to submit). Answering stays **compulsory** (always typed) — matches the "keep mechanics" decision.
- **Submit for grading** → AI grades `/100` against the model answer (`useFlashcardCheck`), XP awarded on the same `xpForScore` 5–35 scale, exactly as now.
- **Reveal:** the card performs a **true 3D Y-flip** (`rotateY`, `transform-style: preserve-3d`) to its back = model answer + AI feedback + score, landing with a **focus-pull** (starts blurred, snaps sharp). The **score counts up** to its value (reuse `useCountUp`); the XP chip pops; the optional thin ring reacts to the score band (tight green for high, soft neutral for low).
- Existing back-of-card actions preserved: "Explain this in the Tutor" (seeds `eyebot_tutor_seed` → `/chat`), and Next / Revisit weak / Finish.
- **Chrome is minimal.** **No queue/up-next list** — it is removed entirely. The only ambient UI is a slim progress indicator (a filling **focus ring** / aperture-blade progress, with an accessible `progressbar`) and a compact session readout (cards graded, avg score, session XP). The coach becomes a calm, unobtrusive "focus assistant" bubble that does not crowd the centered question.
- **Card-to-card:** quick "refocus" (blur out → next card sharpens in). Weak-card retry (`< RETRY_THRESHOLD = 40`, re-queued once) reframed "out of focus — let's refocus," logic unchanged.
- **Finish:** aperture closes; existing `finishSession` flow (stash result + one-shot flag, `syncGamification`, route to `/dashboard` which fires the completion toast) is untouched.

## 6. Motion inventory (CSS-only)

All motion is CSS keyframes/transitions on `transform`/`opacity`/`filter` only (GPU-friendly), consistent with `motion.css`. **No GSAP** — `MotionProvider` is not mounted in this app, so GSAP fx wrappers (SplitText/Magnetic) crash; CSS only.

- Stepper slide + fade per step
- Aperture **dilation** launch (scale + expanding radial mask + striation counter-rotation + gradient bloom)
- 3D card flip with blur→sharp focus-pull
- Score count-up; XP chip pop; gradient sheen
- Iris-ring "breathing" idle pulse
- Slow drift of the deep Twilight Aurora field + frosted-glass glow shifts
- Staggered topic cards on the Lens step

**Reduced motion:** every animation gated under both `@media (prefers-reduced-motion: reduce)` and `html[data-motion="reduce"]`, rendering the final state instantly (the dilation becomes an immediate cut; the flip becomes an instant swap). Mirrors the existing reset scope in `motion.css`.

## 7. Imagery — Nano Banana / Gemini

**Standing constraint (user rule): generated assets must be medically correct AND beautiful.** This is an ophthalmology education tool — anatomical accuracy is non-negotiable, beauty is required on top.

- **Asset:** one photoreal iris/aperture plate — centered, clean dark circular pupil, accurate **limbus**, **iris stroma** striations, **collarette**, natural radial fibre pattern; square; dark or transparent background; Gemini-gradient tint permitted only at the limbus glow (decorative ring), never distorting anatomy. Optionally a second "fully-dilated pupil" state to cross-blend during the launch; **default to one plate + CSS mask** for the opening. **Used only in the selection stepper and the launch dilation — never on the study/question card.**
- **Prompting rule:** every prompt explicitly requires clinically accurate iris anatomy and forbids fantastical/incorrect structures, extra pupils, sci-fi irises, or text. Reject any candidate that is not both anatomically correct and beautiful; regenerate.
- **Pipeline:** new/extended generator under `tools/media/` following the existing `tools/media/generate_eye_atlas.py` pattern — `.env` `GEMINI_API_KEY` + `google.genai`, model `gemini-3-pro-image`. Output raster(s) to `frontend/public/media/` and register in `frontend/public/media/manifest.json`; expose via `frontend/src/aurora/media.ts` (e.g. a `PLATE.aperture` entry).
- **Paid-call rule:** image generation is a paid call — **confirm with the user before running the generator** (per CLAUDE.md). Until the asset exists, the UI falls back gracefully to a pure-CSS iris (radial gradients + conic striations) so the feature is never blocked on the asset.

## 8. Architecture

Split the single 510-line `Flashcards.tsx` into focused units. The thin orchestrator stays at `frontend/src/aurora/screens/Flashcards.tsx`; the shared pieces live in a new `frontend/src/aurora/components/flashcards/` folder:

- `Flashcards.tsx` (screens/) — thin orchestrator: decides picker vs deck (review/tutor skip), owns session config, renders the pieces below. Keeps the public export `Flashcards` so `app/(shell)/flashcards/page.tsx` is unchanged.
- `components/flashcards/ApertureSelect.tsx` — the 3-step selection stepper.
- `components/flashcards/StudyDeck.tsx` — the activity (typed recall → grade → flip → advance/finish).
- `components/flashcards/ApertureStage.tsx` — the iris hero + dilation launch (used by the stepper and the deck-mount transition; **not** on the study card).
- `components/flashcards/FocusCard.tsx` — the centered, image-free 3D flip card (front/back faces).
- `components/flashcards/FocusCoach.tsx` — the unobtrusive focus-assistant bubble.
- `components/flashcards/SessionReadout.tsx` — slim progress ring + compact session stats. **No queue/up-next list.**

**Unchanged:** all hooks in `useFlashcards.ts` (`useFlashcards`, `useFlashcardCheck`, `useFlashcardTopics`, `useDueCount`), `lib/legacy/gamification`, `useGamificationSync`, SM-2 fields passed through to `/check`, `loadSessionCards`, `xpForScore`, `RETRY_THRESHOLD`, `LENGTHS`, review-mode + tutor-seed detection.

**Styles:** new `flashcards` section appended to `aurora.css` — the `data-theme="aperture"` token overrides (deep field, frosted glass, two ink sets, glow accents), the centered focus stage, stepper, topic-progress ring, score readout, and slim progress ring — plus new keyframes in `motion.css` (dilation, flip, focus-pull, refocus, field drift). The theme variables are confined to the `[data-theme="aperture"]` scope so the light shell is unaffected. Remove reliance on the undefined `.aurora-topic-chip` chips by replacing them with the new stepper components; retire those dead class usages and the deck's `PlateWell`/queue markup.

## 9. Edge cases

- **No cards / empty set / nothing due in review:** keep the existing empty states (graceful copy + Back to Dashboard), restyled into the aperture frame.
- **Grading failure (`onError`):** unchanged — still reward the attempt (`xpForScore(60)`), show the "graded offline" panel; the flip still reveals the model answer.
- **Reduced motion:** dilation, flip, and field drift degrade to instant/static states; no functionality depends on animation.
- **Theme isolation:** the `data-theme="aperture"` tokens must stay scoped to the feature; verify the shell, rail, and other routes remain the light theme. Both ink sets (on-glass dark, on-field light) must pass WCAG AA against their backgrounds.
- **Asset missing / slow:** CSS-iris fallback renders; no layout shift, no broken image.
- **Keyboard-only users:** stepper and deck both fully operable; focus moves to the recall field on each new card (existing behaviour preserved).
- **Single-worker prod:** no new blocking work on the event loop; grading remains the only network call per card, as today.

## 10. Testing

- Keep `frontend/tests/aurora_assert.mjs` green (currently 18/18). Update the flashcard assertions for the new component structure; add coverage for: stepper advances one criterion at a time, "Open" launches the deck, the card flips to reveal the model answer, score/XP render, weak-card retry still re-queues, reduced-motion renders final state.
- Refresh `frontend/tests/visual_sweep.mjs` for the new selection + deck screens.
- Manual: walk Quick/Standard/Deep, Mixed + a topic set, a weak answer (retry), a grading failure, and a `?mode=review` entry.

## 11. Out of scope

- No backend/API changes (routes, scoring, SM-2 math, topic data untouched).
- No change to XP economy, achievements, or the dashboard completion toast.
- No new dependencies; no GSAP.
- Staff/console screens untouched.
