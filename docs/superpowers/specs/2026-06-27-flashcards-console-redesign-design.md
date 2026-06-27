# Flashcards "Console" Redesign — Design Spec

- **Date:** 2026-06-27
- **Status:** Approved (brainstorm converged via live mockups); ready for implementation plan
- **Branch:** `flashcards-console-redesign`
- **Scope:** Full rebuild of the flashcards **visual + study-interaction layer**. The
  data flow, API, grading, scheduling, XP/streak/achievement side-effects, and the
  setup→study→results→drill flow are preserved.

---

## 1. Objective

Replace the warm-cream "living eye" flashcards skin with a distinctive, from-scratch
design that (a) does not read as a generic AI-built flashcard app, (b) removes the
explicit "Check" submit step so a tap *is* the answer, and (c) feels alive without
becoming a rainbow. The aesthetic is **"Console"**: a calm academic study instrument.

This is production code for SNEC allied-health students. No regressions to the proven
mechanics; the change is presentation + interaction only.

---

## 2. Decisions locked during brainstorming

1. **No submit button — Hybrid confirm model.**
   - Single-answer card: one tap = instant lock + reveal.
   - Multi-answer card ("select all"): tap to toggle, then a small luminous **lock
     reticle** (a gesture, never a wide Submit bar) fires the reveal.
   - Typed-reasoning cards: reveal is instant on tap/lock; the one-line reflection box
     appears **in the readout, after** the reveal and is graded in the background. It
     **never gates** the answer. (This intentionally relaxes the old "compulsory"
     gate — required to honour instant-confirm.)
2. **Surface = light.** Same instrument system, graphite ink on a warm academic field
   (not the dark variant that was also mocked).
3. **Colour = meaning, three roles:**
   - **Topic hue** (`--flash-topic-hue`, per deck) — identity/atmosphere: header, rule,
     kicker, progress, hover, multi-select pick state, "next" gradient start.
   - **Teal `#0d8276`** — the live "correct / signal locked" colour (constant).
   - **Coral `#d9482f`** — error only (constant).
   - **Academic blue `#1f5fa6`** — structural anchor (the "next" gradient end).
4. **Living background = Brownian colour field, constrained.** A small, cohesive
   **cool palette** (blue · teal · indigo — *not* a wide rainbow), ~6 soft jewel
   spots drifting with **rapid** Brownian physics, `mix-blend-mode: multiply`. The
   field is confined to the **lower band only** — behind/among the option boxes and
   below — with a soft top mask so it **never enters the question region**. Honours
   `prefers-reduced-motion` (spots freeze into a static arrangement).

---

## 3. Non-goals / preserved

- No API changes. `/api/flashcards/{topics,generate,check,complete,due-count}` and the
  `useFlashcards*` hooks are untouched.
- `types.ts` primitives stay: `gradeSelection`, `scoreTier`, `scoreHue`, `topicHue`,
  `galleryHue`, `isRenderableCard`, `loadSessionCards`, XP/length constants.
- Deterministic instant MCQ grading, background reasoning grade, drill-missed,
  XP/level/achievement/streak side-effects, batched `/complete`, offline-cache hygiene
  (the ephemeral deck is never persisted).
- Two-step setup flow (Session → Topic) is kept (re-skinned), including the persistent
  hero element that survives the step change.
- Free-text tutor-seeded cards (`freeText`, no options) keep a reveal → self-mark path.

---

## 4. Visual system

**Field:** warm academic gradient `#f7f5ef → #eef0f5`. **Ink:** `#141d28` (questions,
serif). **Ink-2:** `#3c4956` (option text). **Mono/steel:** `#5d6b7a` (telemetry).
**Frosted paper:** `rgba(255,255,255,.78)` (option rows, lamps).

**Typography:** editorial **serif** (`--font-serif`) for the question; **mono**
(`--font-mono`) for telemetry — topic tag, kicker ("question N"), progress count,
verdict, findings label; app **sans** for option text and body. Sentence case.

**Motion (all reduced-motion aware):**
- Brownian colour field (JS, transform-only, rapid).
- Options stagger in (fade + rise, 60ms cascade).
- Ignition ring blooms from the tapped lamp (teal) on lock.
- Active progress segment pulses; lock reticle pulses when armed.
- Readout "prints up" (opacity + translateY) on reveal.

---

## 5. Interaction model

| Card type | Confirm | Reveal |
|-----------|---------|--------|
| Single-answer | tap an option | instant lock + readout |
| Multi-answer | toggle lamps → tap armed lock reticle | readout |
| Single + typed reason | tap an option (instant) | readout shows reflection box (optional, background-graded) |
| Free-text tutor card | tap "show answer" | model answer + self-mark (Got it / Missed it) |

- Keyboard: once revealed, `Enter` / `→` advances (preserved).
- The lock reticle is disabled until ≥1 option is selected; single-answer cards never
  show it.

---

## 6. Screens

**Setup (`flash-setup`, `data-step` 1|2):**
- Slim 2-segment rail (`flash-rail`).
- Persistent instrument hero (`flash-hero`, rendered once, morphs centerpiece→badge
  across steps — pure-CSS reticle/iris themed by topic hue; no image dependency).
- Step 1 (`flash-continue`): difficulty + length as tactile choice keys + a live
  one-line session summary.
- Step 2 (`flash-back`, `flash-start`): topic gallery; Mixed selected by default;
  picking a topic floods `--flash-topic-hue`.

**Study (`study-stage`):** the `flash-card` instrument frame containing the lower-band
Brownian field, the top bar (topic tag + scan-track segments + `n/total`), a topic-hue
gradient rule, the mono kicker, the serif question, the option keys, the foot
(hint + lock reticle), and the readout reveal.

**Readout (`flash-reveal` / testid `flash-reveal-back`):** verdict (teal "signal
locked" / coral "review this one"), "findings" label, model answer (`flash-model`),
optional reflection box (`flash-reason`) on reason cards, and `flash-advance`.

**Results (`flash-results`):** kicker, oversized `flash-results-score` (X / N),
tier-coloured coaching, weakest-topic line, optional written-reasoning line
(`flash-results-reason`), actions (drill missed / new deck / done).

**States:** generating + empty reuse `flash-stage-msg` / `flash-msg`. Exit affordance
`flash-exit`. `.flash-root` continues to expose `--flash-topic-hue`.

---

## 7. Component architecture

Rewritten in place (keeps imports/orchestrator stable):

| File | Change |
|------|--------|
| `components/flashcards/types.ts` | **Keep** (data primitives). |
| `components/flashcards/FlashShell.tsx` | Reskin: `flash-root` field bg, exit, achievements. |
| `components/flashcards/SessionSetup.tsx` | Rewrite: console intake + persistent CSS hero. |
| `components/flashcards/StepSession.tsx` | Rewrite: difficulty/length keys + summary. |
| `components/flashcards/StepTopic.tsx` | Rewrite: topic channel gallery. |
| `components/flashcards/StudyStage.tsx` | Rewrite: thin wrapper — keyboard + renders McqCard. |
| `components/flashcards/McqCard.tsx` | Rewrite: instrument frame, instant-tap, lock reticle, ignition, readout, optional reflection, free-text path. Owns top bar (idx/total). |
| `components/flashcards/BrownianField.tsx` | **New**: reusable lower-band Brownian colour field (DOM spots + RAF, reduced-motion aware; hue/count/speed props). |
| `components/flashcards/ResultsScreen.tsx` | Reskin: diagnostic summary readout. |
| `screens/Flashcards.tsx` | Minimal: add `onReason(cardId, stem, text, model)` (background grade moved off `onCheck`, which is now reasoning-free on the instant path). All other state/flow unchanged. |
| `aurora/aurora.css` (≈ lines 2174–2762) | Replace the whole `flash-*` block with the Console stylesheet; **keep** `@property --flash-topic-hue`; drop the dead `--hx/--hy/--hact` eye-gaze props. |

---

## 8. Orchestrator change (the only logic change)

The instant path calls `onCheck(correct, selected, "")` at reveal (reasoning always
empty there). The compulsory-reason branch moves to a new `onReason` handler the card
fires when a reflection is submitted (on advance, fire-and-forget):

```
onReason(cardId, stem, text, model):
  reasonCheck.mutate({question: stem, student_answer: text, correct_answer: model}, {
    onSuccess: d => push clamp(d.score) → reasonScoresRef; reasonNotesRef[cardId]=d.feedback; force()
    onError:   () => reasonNotesRef[cardId]="Couldn't grade that one — keep going."; force()
  })
```

`reasonScoresRef` still feeds the results "Written reasoning: …" line; a late grade
re-renders results via `force()`.

---

## 9. Accessibility & reduced motion

- Option keys are `role="radio"`/`"checkbox"` with `aria-checked`; lock reticle has an
  `aria-label`; verdict text is real text (not colour-only).
- `prefers-reduced-motion` / `data-motion="reduce"`: Brownian field renders static,
  ignition/stagger/pulse/sweep disabled, transitions removed.
- Colour never the sole signal — correct/wrong carry a check/cross glyph + label.

---

## 10. Testing & verification

- **`aurora_assert.mjs` (frontend harness) — must be updated** because the interaction
  changed:
  - Remove the `flash-check` button click; single-answer tap on `flash-option` now
    reveals `flash-reveal-back` instantly.
  - Reason card: after reveal, `flash-reason` appears in the readout; fill it; `flash-advance`
    works **without** gating (old "Check gated until filled" assertion is replaced).
  - **Preserve** assertions/testids: `flash-setup[data-step]`, `flash-exit`,
    `flash-rail`, `flash-hero` (+ persistence across step change), `flash-continue`,
    `flash-back`, `flash-start`, `study-stage`, `flash-option`, `flash-reveal-back`,
    `flash-advance`, `flash-results-score`, `flash-results-reason`, `.flash-root`
    `--flash-topic-hue`, `.flash-msg` stale-card graceful degrade.
- **`npm run typecheck && npm run build`** clean.
- **`python -m pytest -q`** unaffected (no backend change) — run to confirm green.
- Warm the dynamic `/flashcards` route with an authed request before running the
  harness (cold compile > 15 s), per prior station/flashcards harness notes.

---

## 11. Risks

- **Hero persistence test** depends on the hero being one node rendered once in
  `SessionSetup`; mirror the existing single-node pattern.
- **Legibility over the colour field** — keep the field in the lower band + frosted
  option rows + masked top so the question and option text stay AA-legible.
- **Performance** — DOM spots animated transform-only; ~6 nodes; client-side only (no
  Render backend impact). Freeze on reduced-motion.
- **Topic-hue contrast** — reuse the existing contrast-safe `topicHue` arc for any
  text/!white-on-hue surfaces; decorative tints may use the raw hue.

---

## 12. Rollout

Build on `flashcards-console-redesign`; verify (typecheck + build + updated
aurora_assert + pytest); **do not push straight to `main`** (auto-deploys to Render
prod) — branch, verify, then fast-forward/merge once green.
