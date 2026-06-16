# Virtual Patient → Guided OSCE Station — Design

**Date:** 2026-06-16
**Status:** Approved design, pre-implementation
**Area:** `tools/cases/`, `tools/api/routers/cases.py`, `frontend/src/aurora/screens/CaseSession.tsx`, `frontend/src/aurora/aurora.css`

## 1. Summary

Transform the virtual-patient simulation (`CaseSession`) from a flat chat + manually-clicked
checklist into a **Guided OSCE Station**:

1. A **3-phase clinical flow** — *Preparation & Identification → Clinical Assessment →
   Documentation & Follow-up* (the student's "QnA → process → follow-up", named in the
   database's own clinical vocabulary).
2. A **live, auto-tracked OSCE checklist** showing the *full, real* steps from the database,
   that marks steps complete as the student conducts the consult — no manual clicking required.
3. An **interactive examination tray**: clicking a clinical action (e.g. "Measure IOP · NCT")
   *performs* it, reveals the real finding from the case, and marks the matching step(s).
4. An **encouraging, in-depth AI grade** at the end, anchored to the OSCE checklist and the
   four existing scoring domains, with a two-part "what you did well / where to grow" debrief.
5. A **colourful, animated light redesign** of the activity page matching the AURORA
   patient-selection page (the current page is dark and off-theme).

This builds on existing machinery: `evaluate_case` (4-domain scoring + debrief +
checklist comparison), the Supabase `checklists` table, and the `performed_steps` plumbing
already in `case_submit`. The main new pieces are the **case→checklist resolver**, the
**deterministic phase split**, the **live "examiner" auto-tick**, and the **examination-reveal
mechanic** — plus the visual redesign.

## 2. Goals / Non-goals

**Goals**
- Every case shows a *complete* OSCE checklist (nothing missing) drawn from the database.
- The checklist updates live as the student works, with a graceful manual fallback.
- The examination ("process") phase becomes something the student *does*, not just types.
- End grade is encouraging, specific, and tied to the real checklist + OSCE criteria.
- Activity page matches the light, colourful, animated AURORA identity.

**Non-goals (YAGNI)**
- Not editing the ~150 case JSON files to add checklist links (handled by the resolver).
  Demographics *are* backfilled into the case files, but by a one-time script (Section 9),
  not by hand.
- Not authoring new Ishihara/Amsler checklists (those 12 cases use their embedded rubric).
- Not changing difficulty-unlock, case rotation, or flashcard logic.
- Not adding voice/animation libraries — motion stays **CSS-only** (the app's motion engine;
  `MotionProvider` is not mounted, so no GSAP fx wrappers).
- Workflow doc (`workflows/case_simulation.md`) update is deferred — requires explicit user
  permission before editing per project rules.

## 3. Data model (verified against the live database)

- **20 checklists / 472 steps** in Supabase `checklists`. Each step has:
  `step_number, category, action, critical, notes`.
- Step **categories** (the phase vocabulary): `patient_identification, consent, equipment,
  medication, documentation, patient_education, safety_check, post_procedure,
  clinical_assessment, infection_control`.
- **151 case files** in `cases/`. Each has `topic` (snake_case slug), optional
  `checklist_procedure`, `examination_findings` (e.g. `va, iop, near_va, anterior_segment,
  fundus, vital_signs`), and an embedded OSCE `rubric` with per-domain `key_points`.

## 4. Case → Checklist Resolver

**Problem:** the current matcher (`get_checklist_by_name` exact + substring) resolves only
**55/151** cases; the other 96 use slugs (`nct_glaucoma_suspect`, `ascan_biometry`,
`Pupil Dilation`…) that don't match any of the 20 procedure names — so most cases currently
show *no* checklist.

**New module:** `tools/cases/resolve_checklist.py`

Resolution order:
1. **Explicit** — `case.checklist_procedure` exactly matches a `procedure_name`.
2. **Keyword map** — match `topic`/`checklist_procedure`/`title` against an ordered keyword
   table (first match wins). Examples:
   - `dilation|mydriasis` → *Eye Drop Instillation and Dilation*
   - `nct|tonometry|iop` → *Non-Contact Tonometry*
   - `ascan|biometry` → *Basic Biometry*; `oct|cirrus|rnfl|macular_oct` → *Cirrus OCT*
   - `logmar|snellen|e_chart|pinhole|distance_vision|visual_acuity` → *Distance Vision Testing LogMAR*
   - `near_vision|presbyopia` → *Near Vision Testing (SOP)*
   - `hvf|humphrey|visual_field|gvf|confrontation` → *Humphrey Visual Field*
   - `pfaer|fall_risk` → *PFAER and Fall Risk Assessment*
   - `orthoptic|hirschberg|cover_uncover|strabismus|npc` → *Orthoptics Skills Observation*
   - `endothelial|specular|flare_test` → *Ophthalmic Investigations Skills Observation*
   - `dayward|preop|postop` → *Dayward and OT Skills Observation*
   - `history|triage|red_eye|uveitis|keratitis|floaters|chemical_injury|penetrating|hyphaema|crao` → *History Taking*
3. **Rubric fallback** — if nothing matches, synthesise a checklist from the case's
   `rubric.key_points` (each key-point becomes a step, tagged `clinical_assessment`,
   grouped under its domain). Guarantees a complete checklist for every case.

**Verified coverage:** 139/151 → a real OSCE checklist (54 explicit + 85 keyword);
12 → rubric fallback (all Ishihara/Amsler, which have no procedure checklist). **100% of
cases render a complete checklist.**

The keyword table lives in this module as data so it is easy to extend and unit-test.

## 5. Deterministic 3-phase split

**New module:** `tools/cases/phase_split.py` — `assign_phases(steps) -> list[int]` (1/2/3 per
step), pure/deterministic, computed at request time (no AI, no per-request cost).

Algorithm:
- Let `P` = indices of steps whose category ∈ {`clinical_assessment`, `medication`}.
- If `P` non-empty: `lo,hi = min(P),max(P)`. Steps before `lo` → **Phase 1**, `lo..hi` →
  **Phase 2**, after `hi` → **Phase 3**. (Mid-procedure education like "tell patient to gaze
  at the light" correctly lands in Phase 2 — it *is* part of doing the procedure.)
- If `P` empty (rare; e.g. *Humphrey Visual Field* is equipment/education-categorised):
  leading prep-run → Phase 1, trailing `post_procedure`/documentation run → Phase 3,
  remainder → Phase 2.

Phase display names:
1. **Preparation & Identification**
2. **Clinical Assessment**
3. **Documentation & Follow-up**

**Empty phases are not fabricated.** Verified: 13/20 split into 3 phases; 7 legitimately have
1–2 (e.g. *Instillation of Eye Drops* has no prep steps; *Skills Observation* logbooks are one
continuous assessment). The UI renders only the phases that contain steps, and the top phase
rail adapts to 1–3 segments.

## 6. Examination tray + reveal mechanic ("something new")

The examination tray is derived from the case's `examination_findings`:

- Each finding key → an **action button** with a friendly label and unit-aware reveal text:
  `va`→"Measure distance VA", `iop`→"Measure IOP · NCT", `near_va`→"Near VA",
  `anterior_segment`→"Anterior segment", `fundus`→"Fundus", `vital_signs`→"Vital signs".
- Clicking an action:
  1. Appends a **reveal card** to the consult thread showing the real value
     (e.g. "IOP (NCT) · avg of 3 → R 18 mmHg · L 20 mmHg").
  2. Appends a synthetic transcript line `[Examination performed: IOP (NCT) → R 18, L 20 mmHg]`
     so grading and the examiner see what was done.
  3. Immediately marks the checklist step(s) that action satisfies.
- **Action → step mapping** is computed server-side (keyword match of the finding label/keys
  against step `action` text) and returned with the station payload, so the frontend ticks
  deterministically with zero AI cost.
- The action gives the *measurement* credit; **technique sub-points** (explain to patient,
  3 readings, record average) remain conversational checklist steps detected by the examiner —
  so clicking alone does not max the score; narrating proper technique still earns marks.

## 7. Live auto-tick

Two complementary tick sources:

**(a) Deterministic** — performed examination actions tick their mapped steps instantly
(Section 6). Works with no API and in mock mode.

**(b) AI "examiner"** — for conversational steps (identity, history, explanation, education,
aftercare advice), a lightweight classifier reads the transcript and returns which checklist
steps are now satisfied.

- **New module:** `tools/cases/observe_steps.py` → `observe(case, checklist_steps, messages,
  already_ticked) -> list[int]`.
- **New endpoint:** `POST /api/cases/{case_id}/observe` → body `{messages, already_ticked}`,
  returns `{newly_satisfied: [step_number]}`.
- One Gemini call, `thinking_level="LOW"`, ~256 max_tokens, JSON-schema = array of ints.
  Token-economical: send only **un-ticked** steps + the recent transcript window.
- **When:** the frontend calls `/observe` after each *student* turn (after the patient reply
  completes, to avoid doubling concurrent load on the single Render worker). Debounced.
- **Resilient:** on quota error / mock mode / failure it returns `[]` and the UI silently keeps
  the manual fallback. Auto-tick degrading never blocks the consult.
- Runs via `asyncio.to_thread` with a timeout (never blocks the event loop — single-worker prod).

**Manual fallback retained:** a step can still be clicked to toggle (accessibility + resilience
+ mock mode). Auto and manual ticks merge into one `performed_steps` set.

## 8. End-of-case grading (encouraging + OSCE-anchored)

Extend the existing pipeline (`evaluate_case` + the debrief in `case_submit`):

- Keep the 4 domains (history / investigations / diagnosis / management, 0–10 each, /40 total)
  and the existing critical-step compliance boost.
- `performed_steps` now reflects the accurate auto-tracked set, so checklist compliance and the
  `checklist_comparison` (✓ done / ✗ missed + why-it-matters notes) are meaningful.
- **Debrief tone & shape** (encouraging, specific, in-depth) in this exact structure:
  - **What you did really well** — name concrete strengths (safety habits, technique, reasoning).
  - **Where to grow next time** — specific, kind, actionable; reference missed checklist steps
    and the phase they fall in; end on an encouraging note.
  - **Why it matters clinically** and **Focus for next time** retained.
- Add a **per-phase summary** to the result (steps done / total per phase) for the grading UI.
- Tailored to the student's role + known weak areas (already wired via `_student_context_block`).

## 9. Patient demographics (QnA / identity step)

The identity step needs name + NRIC/DOB/address. **Option 1 (chosen):** backfill a
`demographics` block into every case file so each patient has fixed, internally-consistent
details — same every run, fully under our control.

**One-time data tool:** `tools/cases/seed_demographics.py` iterates `cases/*.json` and, for any
patient missing demographics, adds under `patient`:
- `nric` — format-valid Singapore NRIC: century prefix by birth year (`S` <2000, `T` ≥2000),
  7 digits, correct check letter.
- `date_of_birth` — ISO date that yields the case's stated `age` (relative to a fixed reference
  date so it never drifts).
- `address` — plausible Singapore address (HDB block + street + 6-digit postal).
- `contact_number` — 8-digit mobile (`8`/`9` prefix).

All values are **deterministically seeded by `case_id`**, so re-running the tool is idempotent
and values are stable. Existing `patient.name`/`age`/`gender` are preserved. The full case JSON
already flows into `PATIENT_SYSTEM`, so the only prompt change is one line instructing the
patient to give these details (and only these) when asked to verify identity, and to refuse
politely if asked for anything not in the record.

This is a real (script-driven) edit to all case files; it is reviewed by the demographics test
below before commit.

## 10. API surface

- **`GET /api/cases/{case_id}/station`** (new; supersedes the bare `/checklist` for the station):
  returns `{ case, checklist: { procedure_name, phases: [{phase, name, steps:[...] }],
  total_steps, critical_count, source: "checklist"|"rubric" }, examination_actions:
  [{ key, label, reveal_text, satisfies_steps:[int] }] }`.
  `/checklist` stays for backward compatibility / the smoke test.
- **`POST /api/cases/{case_id}/observe`** (new): live examiner (Section 7).
- **`POST /api/cases/{case_id}/submit`** (extended): same contract + `per_phase` summary;
  `performed_steps` now the merged auto+manual set.

## 11. Frontend

`frontend/src/aurora/screens/CaseSession.tsx` — rebuilt as the Guided OSCE Station:
- Fetch `/station`; render the **phase rail**, **auto-tracked checklist grouped by phase**,
  the **consult thread**, the **examination tray**, and the **reveal cards**.
- Keep the SSE streaming patient chat + the submit/score flow; add the `/observe` call after
  each student turn and the action-performed handling.
- Manual step toggle retained.
- **Visual:** colourful light AURORA per the approved mockup (`light-station-v3`):
  living gradient-mesh canvas, gradient-ring glass cards, per-phase colour panels
  (blue / purple / rose), spinning aurora rim on the patient (Nano Banana eye plate),
  vivid gradient chat bubbles + chips, gradient-green reveal card with shimmer.
- Checklist label: **"OSCE checklist · auto-tracked · N steps"**; auto-detected steps carry a
  subtle **"✦ auto"** marker.
- **Motion (CSS-only):** mesh drift, flowing spine, tick pop-in, live-node pulse, reveal
  slide+shimmer, count-up on reveal values and final score. All collapse under
  `prefers-reduced-motion` / `html[data-motion="reduce"]`.

New styles under `.aurora-station-*` in `aurora.css` (the dark `.aurora-session-*` block is
replaced).

## 12. Constraints

- **Render single worker:** every Gemini call (`observe`, grading, debrief) goes through
  `asyncio.to_thread` with a timeout; never block the event loop.
- **Quota:** the examiner is small and resilient — on `quota_exceeded` it no-ops and the UI
  falls back to manual ticking; the consult and grade still work.
- **Mock mode / no API key:** examiner returns `[]`; deterministic action ticks + manual
  toggle keep the station fully usable; grading uses existing mock placeholders.

## 13. Testing

- `tools/cases/resolve_checklist.py`: unit test asserting **all 151 cases** resolve to a
  checklist-or-rubric, and a sample of keyword mappings are correct.
- `tools/cases/phase_split.py`: test that all 20 checklists assign every step to exactly one
  phase, no step dropped, and known clean-split cases produce 3 non-empty phases.
- `observe_steps.py`: mock-mode returns `[]`; deterministic action mapping covers exam findings.
- `seed_demographics.py`: every case has `nric`/`date_of_birth`/`address`/`contact_number`;
  NRIC check letter valid; DOB yields the stated age; re-running the tool is idempotent.
- `/station` endpoint: shape + that critical/total counts match the source checklist.
- Existing `aurora_assert` smoke test stays green (preserve `/checklist`, case-list hooks).

## 14. Decisions captured

- Interaction model: **Guided OSCE Station** (Option A).
- Phase names: **Preparation & Identification / Clinical Assessment / Documentation &
  Follow-up**.
- Auto-tick: **live, per student turn**, examiner + deterministic action ticks, manual fallback.
- Technique sub-points stay conversational (clicking ≠ full marks).
- Demographics backfilled into all case files via a one-time seeding tool (**Option 1** —
  fixed, consistent values), not invented by the prompt.
- Wording: **"auto-tracked"** + "✦ auto".
- Visual: colourful animated light AURORA (`light-station-v3`), CSS-only motion.
