# OSCE Station — "Station 100" scoring, Highlights/Watch-outs debrief, and complete Action Palette

Date: 2026-06-23
Status: Approved (design) → ready for implementation plan
Area: Virtual-patient Guided OSCE Station (`/cases/:caseId`)

## Problem

Two independent improvements to the OSCE station, requested together:

1. **The post-station debrief is too long and the scoring doesn't make sense.** Today the
   debrief stacks six blocks (count-up `/40`, per-phase chips, four `/10` domain bars, a
   four-paragraph LLM essay, a missed-step list, actions). The score is two disconnected
   worlds: a checklist the student watches tick live, and an opaque `/40` from four LLM
   domains that never reconcile (you can tick everything and still get 6/10 with no visible
   reason). A hidden `±1 "management boost"` silently nudges a domain. The pass line (24/40)
   and grade bands live only in backend text the debrief is told not to repeat.

2. **The examination tray is incomplete.** It only generates clickable shortcuts from a
   case's `examination_findings` (VA, IOP, fundus, …). Every *process/procedure* step —
   hand hygiene, identify patient, explain procedure, check doctor's order, disinfect,
   check allergy, and dozens more — has **no shortcut**. The student cannot click to perform
   them. (Verified against the live DB: 22 checklists, ~508 steps across 10 categories; only
   a handful are reachable as chips today.)

## Goals

- A single, legible **score out of 100** built from components the student can trace back to
  what they actually did.
- A **short, polished, scannable debrief**: what went well / what to sharpen, plus the one
  thing for next time.
- A **complete action palette above the composer** — one clickable chip for *every* step in
  the case's checklist, nothing missing — that performs procedures realistically.
- No regression to difficulty progression, staff dashboards, or speed (becky: speed is #1).

## Non-goals

- No change to case JSON content, the patient chat prompt, the `observe` examiner logic, or
  difficulty-unlock thresholds (still 2 passes per tier; pass stays at 60% == 24/40).
- No change to the left `StationChecklist` granularity (it stays one row per DB step — it is
  the scoring-accurate progress tracker).

## Constraints (discovered)

- `total_score` (currently a `/40` domain sum) is **load-bearing**: `passed = total >= 24`
  drives difficulty unlocks, `retention_score = total/40` feeds `update_profile` and the staff
  engagement dashboards, and `log_case_completion(total, passed)` records progression. The new
  model must keep a compatible `/40` projection so nothing downstream breaks.
- Prod is a **single uvicorn worker** (Render free): never block the event loop — all Gemini
  SDK calls go through `asyncio.to_thread`.
- Frontend harness `station_assert.mjs` hits a local server with **all `/api` mocked**
  (`_mocks.mjs`); the new shapes must be reflected there and the harness kept green.

---

## Part A — "Station 100" scoring

### Inputs available at submit
- Four domain scores 0–10 from the grader: `history`, `investigations`, `diagnosis`
  (= clinical recognition), `management` (= escalation & care).
- The resolved checklist (`steps` with `critical` flags) + `performed_steps` (ticked numbers).

### The three components (sum to 100)

| Component | Max | Formula | Meaning shown to student |
|---|---|---|---|
| **Thoroughness** | 40 | critical-weighted checklist coverage | "9 of 12 steps · all 3 critical done" |
| **Technique** | 30 | from history + investigations | "History & examination quality" |
| **Judgment & safety** | 30 | from recognition + escalation, gated | "Recognition & escalation" |

```
weight(step)  = 2 if step.critical else 1
earned        = Σ weight over performed steps
possible      = Σ weight over all steps
thoroughness  = round(40 * earned / possible)          # 0 if possible == 0

technique     = round(30 * (history + investigations) / 20)

base          = 30 * (diagnosis + management) / 20
SAFETY_CAP    = 0.6
gate          = SAFETY_CAP if any critical step missed else 1.0
judgment      = round(base * gate)

score_100     = thoroughness + technique + judgment     # clamped 0..100
```

### Safety gate (the inventive bit)
Real OSCEs have "critical-fail" items. If **any critical step is missed**, the Judgment &
safety component is capped at `SAFETY_CAP` (60%) of its earned base, and a loud **safety flag**
replaces the green "safety check passed" badge — named and tied to the exact missed step(s).
Meaningful but recoverable (learning tool, not a guillotine). `SAFETY_CAP` is a single tunable
constant. This **replaces the removed hidden `±1` management boost**.

### Verdict bands
- `>= 85` → **Exam-ready**
- `70–84` → **Solid**
- `60–69` → **Developing** (pass)
- `< 60`  → **Keep practising**

### Projection to the internal /40 (keeps progression intact)
```
total_score (the existing /40 field) = round(score_100 * 0.4)
passed       = score_100 >= 60        # == total_score >= 24, unchanged semantics
retention    = score_100 / 100        # == round-compatible with total_score/40
```
`score_100` becomes the single source of truth; the `/40` is a derived projection. The four raw
domain scores are retained (they feed Technique/Judgment) but are **no longer surfaced as bars**.

### Backend changes
- `tools/cases/evaluate_response.py` → `evaluate_case` additionally returns:
  `score_100:int`, `thoroughness:int`, `technique:int`, `judgment:int`, `verdict:str`,
  `safe:bool`, `missed_critical:list[str]`, and sets `total_score = round(score_100 * 0.4)`.
  Remove the `±1` management-compliance nudge. Keep `critical_hit/critical_total`.
- `tools/api/routers/cases.py` `DomainScore` model gains the new fields; `case_submit` reads
  `passed`/`retention` from the new `score_100` (math unchanged at the 60% line).

---

## Part B — "Highlights & Watch-outs" debrief

### Coaching call (replaces the prose debrief call)
A single structured-JSON Gemini call returns:
```json
{ "highlights": ["...", "..."], "watch_outs": ["...", "..."], "focus": "one sentence" }
```
- 2–3 highlights (concrete, drawn from the transcript) and 2–3 watch-outs (each tied to a
  missed/weak step, and may state the clinical consequence — folding in the old "why it
  matters" notes). One `focus` sentence: the single most important thing next time.
- `response_json_schema` enforced; phrases short (≈5–12 words), not prose.
- Prompt includes the student-context block (known weak areas), case title, transcript, and the
  list of missed steps (esp. critical).

### Speed win: 3 calls → 2, run in parallel
The coaching call does **not** need the numeric score (it needs the transcript + missed steps,
both known up front). So `grade_task` and `coaching_task` launch **concurrently** via
`asyncio.to_thread` and are `gather`ed. The separate "missed-step notes" call is **deleted**
(folded into watch-outs). Net: fewer calls, no longer sequential → faster than today.

### Submit response shape (additions)
```
result: DomainScore            # extended: + score_100, verdict, thoroughness, technique,
                               #   judgment, safe, missed_critical, total_score(=/40 projection)
coaching: { highlights[], watch_outs[], focus }
checklist_comparison: [...]    # unchanged (still used to compute Thoroughness detail + missed)
per_phase: [...]               # unchanged
```

### Frontend debrief (`StationResult` in `CaseSession.tsx`) — neat & polished
Top → bottom, matching the approved mockup:
1. **Score + verdict** — large count-up `score_100` `/100`, verdict pill colored by band.
2. **Pass-line meter** — thin track, fill to `score_100%`, a tick at 60, caption "Pass line 60".
3. **Safety badge** — green "Safety check passed — recognised the red flag and escalated"
   OR amber/red "Critical step missed: <action>".
4. **Three component cards** — compact surface cards with a mini-bar and `points/max`, the
   Thoroughness card showing "N of M steps · all K critical done" (ties to the live checklist).
5. **Highlights / Watch-outs** — two columns: ✅ "What you did well" / ⚠ "To sharpen next time",
   short bullet phrases (Tabler-style check / alert glyphs, semantic green/amber).
6. **One focus callout** — "One thing for next time: …".
7. **Actions** — More patients / Back to dashboard.

Removed: the four `/10` domain bars, the per-phase chips, and the four-paragraph essay. Motion
is CSS-only (count-up on 100; gentle staggered reveal of the two lists). Must reuse aurora
station tokens, stay mobile-clean, and keep `station_assert` green.

---

## Part C — Complete Action Palette (above the composer)

### `build_actions` v2 — one chip per step, nothing missing
`tools/cases/examination_actions.py` `build_actions(examination_findings, steps)` returns an
action for **every** step (skipping only blank-action rows), each:
```
{ key, step_number, label, mode, reveal_text, prompt_text, satisfies_steps:[int], phase, critical }
```
- **mode**: `"say"` if the action is conversational — text starts with `ask`/`asks`/`enquire(s)`
  or contains `?` — else `"do"`.
- **reveal_text**: the matched `examination_findings` value if the step maps to one (reuse the
  existing finding keyword table, inverted to step→finding); else `""`.
- **prompt_text** (say only): the patient-directed question derived from the action (substring
  after the last `:` if present, else the cleaned action).
- **label**: short chip label via `_chip_label(action, category)` — a keyword→canonical map
  (e.g. hand hygiene → "Hand hygiene", identify patient → "Identify patient", explain procedure
  → "Explain procedure", check doctor's order → "Check doctor's order", allergy → "Check
  allergy", validate measurement → "Validate reading", print → "Print results", introduce →
  "Introduce self", disinfect/wipe machine → "Disinfect equipment", VA/IOP/fundus from the
  existing finding labels, …) with a smart trimmed fallback.
- **phase**: from the existing `assign_phases`/`group_by_phase` (no new phase logic).

**Chip merge (de-clutter, deterministic):** after per-step build, merge *consecutive* actions
that share the same `(label, mode)` into one chip whose `satisfies_steps` is the union. This
collapses split runs like the 6 "5 moments of hand hygiene" sub-rows into a single "Hand
hygiene" chip that ticks all of them — while keeping distinct actions separate. Every DB step
belongs to exactly one chip (nothing missing); the left checklist stays granular for scoring.

`ExaminationAction` (pydantic) + `ExamAction` (TS) gain: `mode`, `prompt_text`, `phase`,
`critical`, `step_number`.

### Frontend `ActionPalette` (extends/replaces `ExamTray`)
- Renders all chips **grouped by phase** under tiny headers, compact wrapping pills, scrollable
  with a max-height so a 24-step procedure fits above the composer.
- A chip is **done** when any of its `satisfies_steps` is in `ticked` (so typing/observe also
  marks it done) — keeps the palette and checklist in sync; the student sees what's left.
- "say" chips carry a small speech glyph; exam-reveal chips a small result dot; "do" a check.
- **Click behavior** (in `CaseSession`):
  - `do` → existing path: post a concise `✓ performed` note (reveal_text or label) to the
    thread, `addAuto(satisfies_steps)`, `scheduleObserve`, mark performed.
  - `say` → send `prompt_text` to the patient via the chat flow (refactor `sendMessage` to take
    an optional explicit text) → patient replies and streams → `addAuto(satisfies_steps)` so the
    asked step ticks immediately (observe remains backup). Disabled while sending/streaming.
- The left `StationChecklist` is unchanged.

---

## Testing

- **pytest**
  - `build_actions` v2: one chip per non-blank step; say/do classification; label mapping;
    consecutive `(label,mode)` merge unions step numbers; findings still reveal.
  - Scoring: Thoroughness critical-weighting; Technique/Judgment scaling; safety gate caps
    Judgment and sets `safe=False`/`missed_critical`; band→verdict mapping; `total_score ==
    round(score_100*0.4)` and the 60/100 == 24/40 pass equivalence.
  - `evaluate_case` returns all new fields; `±1` boost removed.
  - Existing `tests/cases/test_checklist_provenance.py` stays green.
- **Frontend** `station_assert.mjs` + `_mocks.mjs`: update the mocked `/station` payload (full
  palette with modes) and `/submit` payload (score_100 + coaching) and assert the new debrief +
  palette render; keep the harness green. Mobile sweep stays clean.

## Rollout
Feature branch → harness + pytest green → ship to `main` (Render auto-deploys). Single
self-contained PR; no migration (DB unchanged, all derivations are runtime/CPU).
