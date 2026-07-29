# Virtual Patients — Clarity, Recall & Transparency

**Date:** 2026-07-29
**Status:** approved, ready to plan
**Scope:** Virtual Patients only (`/cases`, `/cases/[caseId]`, and the backend that serves them)

## Why

Two independent signals landed on the same feature in the same week.

**Students** (via the user): the Virtual Patients page is confusing — they don't know how the
system works, and they were manually ticking the checklist rather than doing the work.

**Branda** (`eyebot_Branda feedback.docx`, Virtual Patients section): seven items, each of
which was verified against the code before this spec was written.

| # | Branda's point | Verified cause |
|---|---|---|
| 1 | "the diagnosis is already visible in the sidebar" | `case_oa_009` has `topic: subconjunctival_haemorrhage`; `CaseSession.tsx` prints `caseInfo.topic` in the left aside **and** the HUD. Titles are safely oblique — the **topic** is the leak. |
| 2 | "tick boxes → learners follow the list instead of recalling" | Every step of every phase renders in full at load, and any current row is tap-tickable. |
| 3 | "handover items not applicable to every scenario" | Both fields hard-required; the `recommendation` placeholder demands "Triage/urgency, who you'd escalate" — wrong for a booked follow-up. |
| 4 | "no time limit for each case" | `estimated_minutes` exists on every case and is never used in the station. |
| 5 | "patient responses not realistic — full history at once" | `PATIENT_SYSTEM` forbids volunteering but never constrains **length or register**; `max_tokens=1536`. |
| 6 | "chat stops after multiple queries" | `/chat` is `30/minute` per student, `/observe` `40/minute` (fires on every turn). The frontend collapses **every** non-OK response into one dead string, so a 429 or a daily-quota stop is indistinguishable from a crash. |
| 7 | "unclear why each domain scored what it did" | `evaluate_case` already returns `history_feedback` / `investigations_feedback` / `diagnosis_feedback` / `management_feedback` (2–3 sentences each) plus the raw /10 sub-scores, and the API already sends them. **The debrief UI discards all of it.** |

## The organising idea

The student's confusion and Branda's spoon-feeding complaint look opposed. They are not,
once you separate two things today's UI conflates:

- **Mechanics** — *which pane do I act in right now?* → make this **loud**.
- **Clinical content** — *what should I ask this patient?* → make this **earned**.

Every decision below follows that line. The spotlight says "Your turn — talk to the patient";
it never says "ask about pain and discharge". Confusion about *driving the app* goes to zero.
Recall of *what to say* stays with the student.

One state value carries it: `data-turn` on `.aurora-station-grid`, one of
`patient | eyebot | handover`.

## Architecture

New pure modules (no React, no I/O — unit-tested directly, mirroring `stationGate.ts`):

| Module | Responsibility |
|---|---|
| `frontend/src/aurora/lib/stationTurn.ts` | `(gateStep, manualStepNumbers, hasResult) → { turn, paneLabel, hint }`. Absorbs today's ad-hoc `patientLocked` computed inline in `CaseSession`. |
| `frontend/src/aurora/lib/stationMask.ts` | `(steps, ticked, current) → per-step display state`: `done \| current \| masked \| self`. The single rule for what text is visible. |
| `frontend/src/aurora/lib/stationTimer.ts` | `(startedAtMs, nowMs, estimatedMinutes) → { remainingMs, tone, label }`, `tone ∈ calm \| warn \| over`. |
| `frontend/src/aurora/lib/stationHelp.ts` | Help + coach-mark **content model** for both surfaces. One vocabulary, so the `?` modal and the first-run beats can never drift apart. |

Changed components: `StationChecklist`, `PatientChat`, `EyeBotPanel`, `CaseSession`,
`Cases`. New components: `HelpButton`, `HelpModal`, `StationCoach`, `StationTimerChip`.

Backend: `tools/api/shared.py` (patient prompt), `tools/cases/station_score.py`
(score breakdown), `tools/cases/observe_steps.py` (`focus_step`),
`tools/api/routers/cases.py` (models, rate limit).

---

# Phase 1 — Anti-spoiler + orientation

## P1.1 The checklist becomes a read-only progress instrument

`onToggle` is removed from `StationChecklist` entirely. Rows render as `<li>`, not
`<button>` — the affordance disappears, not just the handler, so there is nothing to
discover, hover, or tab to.

Steps advance by **doing the thing**: verbal steps via `/observe`, manual steps via the
action panel. That was always the intent; the tap was an escape hatch that became the
default path.

Progressive reveal, per `stationMask.ts`:

- **done** — full text, `✓`, `✦` if auto-detected (unchanged)
- **current** — full text, highlighted (unchanged)
- **masked** — `▨▨▨▨▨▨` at the row's natural width, no action text, `🔒`
- **self** — full text, `—` glyph, tooltip "self-marked — not examiner-verified"

The phase rail, per-phase counters (`2/3`) and `Checklist · 2 of 6 done` all stay exactly
as they are. A student always knows **how far** they are; they no longer know **what's next**.

The legend copy `tap the highlighted step to tick it yourself` is deleted. The help caption
becomes "Steps tick themselves as you work — talk to the patient, or use the EyeBot panel."

## P1.2 Topic no longer leaks the diagnosis

In the **station**, `caseInfo.topic` is replaced by `station.checklist.procedure_name`
("Non-Contact Tonometry" — a skill, not an answer) in both the aside and the HUD. The topic
is revealed in the debrief, where knowing it is the point.

`/cases` keeps topic. Choosing what to practise is legitimate; being told the answer
mid-station is not. This is also why the fix is a UI change and not a data change — the
topic taxonomy drives the locked topic-filter feature.

> **Content risk, flagged not papered over:** this works because case *titles* are oblique
> today ("The Bright Red Eye That Looked Worse Than It Was"). If any case title names its
> own diagnosis, that is a **case-content fix**, tracked separately — not something the UI
> should mask.

## P1.3 Turn-spotlight

`CaseSession` sets `data-turn` on `.aurora-station-grid` from `stationTurn.ts`. Pure CSS
from there — no JS animation, no measurement, so it works unchanged in the 880px stacked
tier and the landscape-phone tier.

- **Active pane** — coloured glow ring (warm for patient, cool for EyeBot, reusing the
  existing pane accents) + a badge: `Your turn — talk to the patient` /
  `Your turn — perform in EyeBot`. The badge names **the channel, never the step**.
- **Inactive pane** — `opacity: .72`, `saturate(.6)`. Dimmed, never hidden: its text stays
  WCAG-legible and its scrollback stays readable.
- **`turn: "handover"`** (all steps done) — both panes settle to neutral and the
  `Submit handover →` button takes the glow.

`prefers-reduced-motion` / `data-motion="reduce"` drops the glow animation, keeps the ring
and the badge.

## P1.4 Stuck-valve

Removing the tap makes `/observe` load-bearing for the whole station. Without a valve, one
missed detection freezes the gate and every later manual chip stays locked forever.

After **3 student messages on the same gate step with no tick**, a quiet link appears under
the patient composer: *"Examiner didn't catch that?"*. One press, two stages:

1. Fire `/observe` with a new `focus_step` hint — re-examine the transcript for **this
   step specifically**, leniently.
2. If that still returns nothing: self-mark the step, add it to `selfAdvanced`, advance
   the gate.

Truth handling — self-marked steps:

- **count** for the gate and for `performed_steps` (student's favour: after 3 genuine
  attempts the likeliest truth is that they said it and the examiner missed it — and the
  safety cap is already documented as "softened for a learning tool")
- ship as a **new `self_advanced: list[int]`** on `CaseSubmitRequest`
- are named to the debrief coach: *"self-declared, not examiner-verified — if the transcript
  doesn't support them, say so"*
- render distinctly in the checklist (`—`, not `✓`) and in the downloaded session record

Rare by construction. Its trigger rate should be **visible, not silent** — an `audit_event`
so a systematically weak checklist shows up in the data rather than in a support ticket.

## P1.5 `?` help

One `HelpModal`, content from `stationHelp.ts`, `HelpButton` on both surfaces.

- **`/cases`** — what a virtual patient is; picking one; the three difficulty tiers; the eye
  plate and topic chips as one lens; what a station will cost/earn.
- **Station** — the three panes and what each is for; why the checklist ticks itself and
  can't be tapped; how manual procedures work; the timer; the handover; how scoring works.

Focus-trapped, `Esc` closes, returns focus to the button. Reuses the existing
`.aurora-station-overlay` scrim/card so it lands inside the locked visual language.

## P1.6 First-run coach-mark

First time a student ever opens a station (`eyebot_station_coach_seen` in `localStorage`),
3 spotlighted beats reusing the tour's `waitForElement` + `useAnchorRect`:

1. **Checklist** — "This tracks itself. You can't tick it — do the work and it ticks."
2. **Patient pane** — "Talk to your patient here. History, consent, explanations."
3. **EyeBot pane** — "Hands-on procedures happen here." *(skipped on cases with no manual
   actions — the pane doesn't exist)*

Skippable, and re-openable forever from `?`. Distinct key from `eyebot_tour_seen`: the grand
tour is account-first-run, this is feature-first-run, and they must not gate each other.

---

# Phase 2 — Realism, fairness, transparency

## P2.1 Patient brevity

`PATIENT_SYSTEM` gains hard rules, in the prompt's existing voice:

- Answer **one thing per turn**. 1–2 short sentences, the way a real anxious patient speaks.
- **Never** deliver a structured history. If asked something broad ("tell me about it"), give
  the headline only and let the student ask follow-ups.
- Lay words, hesitation and vagueness are correct — "a few days ago, maybe Tuesday?" beats
  "3 days of progressive blurring".
- Volunteer nothing that wasn't asked, including from `examination_findings`.

`max_tokens` 1536 → **320** as a structural backstop: prompt drift alone shouldn't be able to
bring the essay back.

## P2.2 Soft timer

Counts down from the case's own `estimated_minutes`. Started at mount, kept in a ref so a
re-render can't reset it.

- **calm** → **warn** (amber) at 2:00 remaining → **over** (red) at 0:00
- At 0:00 a persistent, non-modal line: *"Time's up — submit your handover."*
- **Never force-submits.** A learning tool that deletes a student's work on a timer is worse
  than no timer, and the leave-forfeit rules already own the "don't abandon" incentive.
- Elapsed time appears in the debrief and in the downloaded session record.

## P2.3 Handover fits the scenario

Copy only — both fields stay required (a handover with a blank half isn't a handover).

- Hint gains: *"If nothing is urgent, say so — 'routine, patient follows appointment time'
  is a complete answer. Not every case needs escalation."*
- The `recommendation` placeholder stops leading with triage; it offers triage **or**
  routine continuation as equally valid shapes.

## P2.4 Chat continuity

`sendMessage` stops collapsing every failure into one dead string. It reads `res.status`
and the SSE `quota_exceeded` flag:

| Cause | What the student sees |
|---|---|
| `429` | "You're sending faster than the patient can answer — try again in a moment." |
| quota | The real quota message (already streamed by the backend). |
| other | Today's generic message. |

In every case the thread stays alive and the composer stays enabled — the conversation is
never dead, which is precisely what "the AI is unable to continue" described.

Station chat ceiling **30 → 60/minute**. `/observe` piggybacks on every turn, so the
effective per-message cost is two calls; 30 was tighter than it looked.

## P2.5 Scoring rationale

`compute_station_score` already owns the formula, so it emits the explanation — no
duplicated arithmetic in the frontend, no drift. New `breakdown` on its return dict and on
`DomainScore`:

```json
{"consult":   {"parts": [{"label": "History-taking", "pts": 8, "max": 10},
                         {"label": "Examination technique", "pts": 7, "max": 10}],
               "total": 38, "max": 50, "capped": false, "cap_reason": ""},
 "judgement": {"parts": [{"label": "Recognition", "pts": 9, "max": 10},
                         {"label": "Handover & escalation", "pts": 6, "max": 10}],
               "total": 23, "max": 50, "capped": true,
               "cap_reason": "×0.6 safety cap — critical step missed: Identify patient"}}
```

`parts` reflects `has_manual`: on a conversation-only case, Consultation & Technique is
history alone and says so, rather than showing a phantom technique score.

The debrief renders under each scheme card: the parts, the arithmetic, the cap line when it
fires, and the **per-domain feedback the UI currently throws away**.

```
Clinical Judgement & Safety            23/50
  Recognition 9/10 · Handover 6/10  →  38/50
  ⚠ ×0.6 safety cap — critical step missed: Identify patient
  "You reached the right impression quickly, but the handover didn't
   name who you'd escalate to…"
```

Zero extra AI calls. Every number on the screen is now traceable to an input.

---

## Testing

**Unit — node harnesses** (`frontend/tests/`, pattern of `station_gate_logic.mjs`):
`stationTurn`, `stationMask`, `stationTimer` (incl. tone boundaries at exactly 2:00 and
0:00), `stationHelp` (every surface has content; no empty beats).

**Unit — pytest** (`tests/`): `compute_station_score` breakdown — uncapped, capped,
`has_manual=False`; parts sum to the scheme total; `cap_reason` names a real missed step.
Patient-prompt contract: brevity rules present, `max_tokens` ≤ 320.

**Harness — `station_assert.mjs`.** Needs real work, not a patch: it currently advances the
gate by **clicking checklist rows**, which is the exact affordance being deleted. It moves
to progressive `/observe` mocks (return `[1]`, then `[2]`, …) and gains assertions for:
checklist rows are not buttons; future rows masked and no future action text anywhere in the
DOM; `data-turn` flips patient → eyebot at the right step; the inactive pane is dimmed;
`?` opens and traps focus; topic absent from the station, present in the debrief; timer
renders and reaches `warn`; rationale shows parts + arithmetic + feedback.

**Regression (`/ship-check`):** the read-only checklist is a user-facing *state* invariant —
a test must assert that clicking a step row changes nothing, so the tap can't reappear.

## Rollout

Two commits, each independently green and shippable. No new env vars, no migration, no
schema change — `self_advanced` and `breakdown` are additive with defaults, so an old
frontend against a new backend (and the reverse) both keep working during the Render deploy
window.

## Out of scope

- **Talking avatar** (STT + streaming TTS + viseme lip-sync). A real product idea and a real
  subsystem, with its own latency budget on a single Render worker. Deserves its own brief.
- Every non-Virtual-Patients section of Branda's document — mobile navigation, avatar
  glasses, all Flashcards items, Tutor scaffolding — per the stated scope.
- Checklist gating/order, the triptych structure, the warm/cool identity, the debrief flow,
  the case content itself.

## Design-lock note

Amends **Virtual Patients / OSCE Station — LOCKED 2026-06-25**.
Criteria changed: *(1) checklist interactivity — tap-to-tick removed, the checklist is now a
read-only instrument; (2) information disclosure — future steps and the case topic are
progressively revealed rather than shown at load; (3) attentional state — panes carry an
explicit active/inactive treatment driven by whose turn it is.*
Structure, gating order, the two-scheme grade, the handover framing and every existing
animation are **unchanged**. `docs/design-locks.md` is updated as part of Phase 1.
