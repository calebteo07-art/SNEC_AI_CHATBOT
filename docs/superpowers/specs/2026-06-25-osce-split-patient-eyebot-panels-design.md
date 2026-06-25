# OSCE Station — Split consult: Patient chat + EyeBot action panel

**Date:** 2026-06-25
**Area:** Virtual Patients / Guided OSCE Station (`CaseSession`, `ActionPalette`, new `EyeBotPanel`, station endpoints, `cases.py`)

## Problem

Today the consult is a single right-hand thread: the student talks to the patient AND
performs manual procedures in the same place. Clicking a manual shortcut flips the *patient*
composer into "procedure mode," so the hands-on tests and the human conversation are tangled
into one channel. We want a clean separation:

- **Patient chat** — the student talks to the patient only (history, vocal screening such as
  special-diet/fall-risk questions, consent). Pure free-typed conversation.
- **EyeBot action panel** — the student performs manual / non-vocal procedures (measure
  visual acuity, measure IOP, slit-lamp, hygiene, equipment) by "talking to EyeBot." The
  existing procedure-mode shortcuts move here.

The two must stay **synced**: both feed the live examiner (`/observe`) and the end-of-station
grader (`/submit`) so scoring is unchanged and "they work together" is automatic.

## Decisions (from brainstorming)

1. **Keep** the procedure-mode shortcut box (type-your-technique → tick). Do **not** delete it
   — just relocate it from the patient composer into the EyeBot panel.
2. **EyeBot replies = result + light AI coaching.** One lean AI call per confirmed procedure
   returns a 1–2 sentence technique note; the deterministic result still shows regardless.
3. **Layout = Triptych:** `[ Checklist rail ] · [ Patient chat ] · [ EyeBot panel ]`.
4. **Patient chat = free-typed only** — no vocal prompt chips. Verbal steps auto-tick via the
   examiner exactly as today.
5. **Colors:** patient pane = warm coral (human); EyeBot pane = cool blue (instrument); both
   sit on the existing light aurora shell so they harmonize.
6. **No manual actions in a case → no EyeBot column.** Layout falls back to
   `[ Checklist rail ] · [ Patient chat ]` (today's two-column).

Non-goals: no change to scoring math, the gate algorithm (`stationGate.ts`), case JSON, the
handover/debrief overlay, or `examination_actions.py` classification. No free-typed EyeBot
messages (chip-driven only). No auto-send vocal chips.

## 1. Data model — one tagged transcript, two views

The single source of truth stays **one ordered `messages` array**; each entry gains a
`channel: "patient" | "eyebot"` field.

```ts
interface ChatMessage { role: "user" | "assistant"; content: string; channel: "patient" | "eyebot" }
```

- Patient pane renders entries where `channel === "patient"`; EyeBot pane renders
  `channel === "eyebot"`.
- Because it is one chronologically-ordered array, `/observe` and `/submit` receive the
  **full combined transcript** with no merge step — this *is* the sync. Ordering bugs are
  impossible because there is only one list.
- The backend reads only `role` + `content`; `channel` is a frontend-only view key. The
  frontend **strips `channel`** (maps to `{ role, content }`) before posting to `/chat`,
  `/observe`, and `/submit`, so request body shapes are byte-identical to today and no
  Pydantic extra-field validation can break. Verify the request models tolerate the trimmed
  payload (they already receive exactly `{ role, content }` today).

*Alternative considered and rejected:* two separate arrays merged at submit time — merge +
chronological-ordering logic is error-prone and would have to be re-derived in `/observe` and
`/submit`. The tagged single array makes "work together" free.

### Channel routing of existing messages
- Patient turns (student question + patient SSE reply) → `channel: "patient"`.
- The procedure reveal (student's typed technique) + EyeBot's coaching reply →
  `channel: "eyebot"`.
- The `[Examination performed: …]` reveal message format is **retained** (the grader already
  parses it), now tagged `eyebot`.

## 2. Layout — Triptych (`aurora.css` + `CaseSession.tsx`)

`.aurora-station-grid` becomes a three-column grid on wide screens:

1. **Checklist rail** (unchanged content): patient card + presenting complaint +
   `StationChecklist` + "Submit handover →" button.
2. **Patient chat** (`channel === "patient"`) — warm coral theme. Free-typed composer →
   `/chat`. **Only patient-channel messages are sent as context** to `/chat`, so EyeBot exam
   chatter no longer pollutes the patient prompt. SSE streaming, typing dots, examiner
   auto-tick via `/observe` — all unchanged.
3. **EyeBot panel** (`channel === "eyebot"`) — cool blue theme. Contains the manual shortcut
   chips (restyled cool) + the procedure-mode box (moved here) + the EyeBot reply thread.

**Collapse rule:** when `examination_actions.filter(a => a.kind === "manual").length === 0`,
the EyeBot column is not rendered and the grid becomes two columns
(`[ Checklist rail ] · [ Patient chat ]`). A small responsive breakpoint stacks the panes on
narrow viewports (mobile), consistent with the app's existing responsive behavior.

## 3. EyeBot coaching flow (the one new AI call)

The procedure-mode box lives in the EyeBot panel. Flow on **Confirm** (min technique length
unchanged, e.g. ≥ 12 chars):

1. Append the student's typed technique as a `eyebot`-channel **user** message, using the
   retained reveal format:
   `[Examination performed: {label} → {typed steps}{ · Result: {reveal_text} when present}]`.
2. Tick `satisfies_steps` through the existing gate (`addAuto`), `scheduleObserve()`.
3. Optimistically append a `eyebot`-channel **assistant** placeholder, then call the new
   endpoint and fill in the coaching:

```
POST /api/cases/{case_id}/action
  body: { action_label: string, technique: string, finding: string }
  resp: { coaching: string }   # 1–2 sentences, technique-focused, encouraging
```

The EyeBot assistant message renders as **result line + coaching line** (result =
`reveal_text`, already client-side from `/station`; coaching = endpoint response).

**Performance / safety (becky + single-worker):**
- Wrap the model call in `asyncio.to_thread(...)` with a timeout (never block the single
  Render event loop).
- MINIMAL thinking with an **adequate** `max_output_tokens` — do NOT pair thinking with a
  ≤256 cap on flash-lite (documented becky gotcha: thinking is drawn from the output budget
  and gets starved). Small but sufficient cap for a 1–2 sentence note.
- **Graceful degradation:** on failure/timeout, drop the placeholder (or show the result line
  only). The step tick NEVER depends on this call.
- Input safety: the technique text is student free-text → run it through the same input
  filter used by `/chat` before sending to the model (reuse existing `filter_input`).

### Backend prompt
A short `ACTION_COACH` system prompt: "You are EyeBot, an OSCE examiner. Given a manual
ophthalmic procedure, the student's described technique, and the measured finding, reply in
1–2 sentences: acknowledge what was done well and at most one concrete technique tip. Be
encouraging and specific; never invent a different result." Keep it formative, not graded.

## 4. Gating preserved

`stationGate.ts` is untouched and pane-agnostic (operates on step numbers). Manual chips stay
locked (🔒) until their step is current (existing `ActionPalette` logic); verbal steps tick
in-order via `/observe`. Both panes feed the same gate. `gateStep`, `currentStep`, `advance`,
`gateIndex` usage is unchanged.

## 5. Visual identity (`aurora.css`)

- **Patient pane** — warm coral: header tint `#FAECE7`, accent `#D85A30`, "me" bubble accent,
  patient bubble on `#FAECE7`. Border `#F0997B`.
- **EyeBot pane** — cool blue: header tint `#E6F1FB`, accent `#185FA5`, chips on `#E6F1FB`
  with `#85B7EB` border, active chip `#378ADD`. Border `#378ADD`.
- Both share the glass-card structure and sit on the existing animated light mesh, so they
  read as one station. CSS-only motion (no GSAP / MotionProvider), respect
  `prefers-reduced-motion`. Reuse existing station bubble/composer structure; theme via a
  pane-scoped class (e.g. `.aurora-pane-patient` / `.aurora-pane-eyebot`).

## 6. Components

- `CaseSession.tsx` — owns the tagged `messages`, gate state, and submit/result overlay (all
  as today). Renders the rail + `PatientChat` + (conditionally) `EyeBotPanel`. Splits the old
  single-thread render into two filtered renders.
- `EyeBotPanel.tsx` (new) — presentational: takes the eyebot-channel messages, the manual
  actions, gate `current`, `activeProcedure`, and callbacks; renders chips (via
  `ActionPalette`) + the procedure-mode composer + the EyeBot reply thread. State stays in
  the parent.
- `PatientChat.tsx` (new or extracted) — presentational: patient-channel messages + free
  composer + send/keydown callbacks.
- `ActionPalette.tsx` — reused as-is for chips; restyled cool. Still manual-only.

## 7. Tests

- `frontend/tests/station_assert.mjs` + `_mocks.mjs`:
  - Two distinct panes render (patient + EyeBot) when a case has manual actions.
  - Patient composer sends to `/chat`; manual chips live in the EyeBot panel.
  - Clicking a chip → procedure mode in the EyeBot panel; Confirm posts the reveal (eyebot
    channel), ticks the step, and shows an EyeBot coaching reply (mock `/action`).
  - A case with **no** manual actions renders **no** EyeBot panel (two-column fallback).
  - `/observe` and `/submit` receive the combined transcript (patient + eyebot messages).
  - Gating still holds: locked chips/rows until their step is current.
- Backend: `tests/cases/test_station_endpoints.py` (or a new test) — `/action` returns
  `{ coaching }`, degrades gracefully on model failure, and never errors the request.

## Files touched

- `tools/api/routers/cases.py` — new `POST /api/cases/{id}/action` endpoint + `ACTION_COACH`
  prompt; `/chat` unchanged (frontend sends patient-channel only).
- `frontend/src/aurora/screens/CaseSession.tsx` — channel tag, two-pane render, EyeBot flow.
- `frontend/src/aurora/components/EyeBotPanel.tsx` — new.
- `frontend/src/aurora/components/PatientChat.tsx` — new (extracted).
- `frontend/src/aurora/components/ActionPalette.tsx` — cool restyle (manual-only retained).
- `frontend/src/aurora/aurora.css` — triptych grid, warm/cool pane themes, collapse rule.
- Tests above.
