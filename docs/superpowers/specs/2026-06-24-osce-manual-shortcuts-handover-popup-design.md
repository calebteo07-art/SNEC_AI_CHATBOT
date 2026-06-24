# OSCE Station — Manual-only shortcuts, procedure-mode composer, motion handover popup

**Date:** 2026-06-24
**Area:** Virtual Patients / Guided OSCE Station (`CaseSession`, `ActionPalette`, `examination_actions.py`, station endpoints)

## Problem

The action palette currently makes **every** checklist step a one-click chip — including
history questions (`say` chips auto-send the question to the patient). A student can click
their way through the entire station, history included, which defeats the point of a
virtual-patient *consult*. The palette also reads as a separate boxed slab ("sticks out
like a sore thumb"), and the handover form + debrief render inline in the chat thread.

## Goals

1. **Real chat stays manual.** History-taking and all patient-directed/verbal steps are
   typed by the student in the live consult (the examiner auto-ticks them) — no shortcut.
2. **Shortcuts only for manual procedures** — hands-on tests and hygiene/equipment tasks.
3. **Clicking a shortcut requires demonstrating technique** — the student types the
   procedure's steps/rules in a box before the step ticks; that text is recorded and the
   end-of-station grader sees it (decided: *record + tick, grader sees it*).
4. **The shortcut UI blends in** — no separate-card feel; it reads as one cluster with the
   composer.
5. **Handover pops up with motion** — the submit form leaves the chat thread and opens as a
   surprise spring-in overlay; the debrief/result reveals inside that same overlay, so the
   whole wrap-up lives out of the message chain.
6. **Relabel** the two handover fields to **Findings** and **Next steps**.

Non-goals: no live AI correctness-check of typed technique (no extra paid call per click);
no changes to scoring math, `/observe`, `/submit`, or case data.

## 1. Classification — `kind: "manual" | "verbal"` (backend)

`tools/cases/examination_actions.py` tags every action with `kind`. The palette renders
only `manual`. Verbal steps stay completable two ways (unchanged): typed in chat → examiner
auto-ticks, or tap the checklist row directly. So nothing becomes un-tickable.

Rules:
- `say` steps (history questions) → **verbal**.
- `do` steps classified by their matched `_LABEL_RULES` label:
  - **verbal:** Introduce self · Identify patient · Confirm name · Confirm NRIC / DOB ·
    Check allergy · Check doctor's order · Explain procedure · Take consent ·
    Patient comfortable · Listen actively · Instruct patient · Doctor to examine
  - **manual:** Hand hygiene · Wipe occluder · Disinfect equipment · Discard waste ·
    Remove glasses / CL · Prepare eye drops · Instill drops · Pinhole test · Test near VA ·
    Test distance VA · Measure IOP · Anterior segment · Fundus exam · Colour vision ·
    Amsler grid · Position patient · Align & focus · Validate reading · Print results ·
    Document results · Monitor patient · Safety check
- Unknown `do` steps (the generic head-truncation fallback) → **manual** (so an
  unrecognised procedure still has a completion path; verbal ones are explicitly listed).

Implementation: add a `kind` to each `_LABEL_RULES` entry (or a `VERBAL_LABELS` set checked
against the resolved label). Merge logic unchanged; the merged chip carries the kind of its
members (all merged members share a label, hence a kind).

## 2. Procedure-mode composer (frontend)

`ActionPalette` renders only `kind === "manual"` chips. Clicking a manual chip no longer
ticks immediately; it sets `activeProcedure` (the clicked `ExamAction`) in `CaseSession`.

The bottom composer becomes "procedure mode":
- Caption above the box: **"{label} — type the steps & safety rules you'd follow"** with a
  Cancel/back affordance that returns to chat mode.
- Textarea placeholder seeds an example (per-procedure or generic). Send button label → **Confirm**.
- Confirm is disabled until the input is substantive (min length, e.g. ≥ ~12 chars).
- On **Confirm**:
  - Post one transcript user-message reveal:
    `[Examination performed: {label} → {typed steps}{ · Result: {reveal_text} when present}]`
  - Tick `satisfies_steps` (`addAuto`), `scheduleObserve()`.
  - Clear `activeProcedure` + the procedure input → composer returns to normal chat.
- Hygiene-type manual steps (no `reveal_text`) just record the technique + tick.
- Clicking another manual chip while in procedure mode switches `activeProcedure` (resets
  the typed text). Already-ticked chips are no-ops (unchanged guard).

The reveal renderer (`EXAM_PREFIX` block) is extended to show the label, the student's typed
technique, and the result line distinctly (it currently splits on `→`).

The grader already receives the full `messages` transcript on `/submit`, so the typed
technique is graded with no API/contract change.

## 3. Visual blend (the "sore thumb" fix)

Why it sticks out today: the loud uppercase "Actions · click to perform every step" label,
the Prepare/Assess/Wrap-up gutter rows, the purple `say`-chip tint, and the 168px scroll slab.

Changes (`ActionPalette.tsx` + `aurora.css` `.aurora-palette*`):
- Drop the loud label (quiet caption or none) and **remove phase grouping** — far fewer
  chips now that history/verbal chips are gone, so they just wrap.
- One uniform quiet pill style sharing the composer's surface/border family, so palette +
  composer + procedure-box read as **one cluster**, not a separate card. Remove the
  `data-mode="say"` purple background (no `say` chips remain in the palette).
- Procedure mode reuses that same cluster — nothing new "appears" on click.

## 4. Handover as a motion popup + relabel (frontend)

Today: `showSubmit` renders the form inline in `.aurora-station-thread`; `StationResult`
also renders inline. New:
- The aside's "Submit handover →" button opens an **overlay** (`.aurora-station-overlay`):
  a backdrop + a centered card that **springs in** with CSS-only motion (scale + fade,
  spring easing; backdrop fades/blurs). Matches the station's light/mesh aesthetic.
- The overlay has two states in place:
  1. **Handover form** — fields relabelled **Findings** and **Next steps**
     (`findings` / `recommendation` state + request fields unchanged; only the visible
     `<label>` text + placeholders change). Critical-steps warning + submit button as today.
  2. **Debrief** — on submit success, the overlay content transitions (motion) to
     `StationResult` (its count-up/meter/coach animations unchanged). The result's
     "More patients" / "Back to dashboard" actions navigate as today.
- Closing/cancel returns to the station (form state preserved until submit). The inline
  form + inline result blocks are removed from the thread.

CSS-only motion (per the project's motion system — `MotionProvider` is not mounted, so no
GSAP). Respect `prefers-reduced-motion` (instant, no transform) consistent with existing
station styles.

## 5. Tests

- `tests/cases/test_examination_actions.py`: replace "every step → chip" assertions with
  `kind` assertions — history `say` → `verbal`; Introduce/Identify → `verbal`; Hand hygiene
  / VA / IOP → `manual`; finding still attaches to the manual VA action; unknown `do`
  defaults to `manual`.
- `tests/cases/test_station_endpoints.py`: update any palette-coverage / mode-count
  assertions to the manual-only contract (+ `kind` present on each action).
- `frontend/tests/station_assert.mjs` + `frontend/tests/_mocks.mjs`: palette shows only
  manual chips; clicking a chip enters procedure mode (caption + Confirm), Confirm posts the
  reveal + ticks; verbal steps are NOT chips; the handover opens as an overlay (not in the
  thread), relabelled Findings / Next steps; debrief renders inside the overlay.

## Files touched

- `tools/cases/examination_actions.py` — add `kind`.
- `frontend/src/aurora/components/ActionPalette.tsx` — render manual only, quiet styling,
  no phase groups.
- `frontend/src/aurora/screens/CaseSession.tsx` — `activeProcedure` + procedure-mode
  composer; reveal renderer; handover/debrief overlay; relabel fields.
- `frontend/src/aurora/aurora.css` — quiet palette, procedure-mode caption, overlay +
  spring motion.
- Tests above.
