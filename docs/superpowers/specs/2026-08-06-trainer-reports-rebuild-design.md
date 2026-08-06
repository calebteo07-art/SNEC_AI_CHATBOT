# Trainer reports rebuild — insight, not inventory

**Date:** 2026-08-06 · **Status:** design approved, spec under review
**Supersedes the report content of:** `2026-07-13-trainer-role-analytics-design.md` §student report,
`2026-07-26-admin-p2-analytics-depth-design.md` §student detail.
**Refines within a lock:** `docs/design-locks.md` — "The session record: truthful, and loud about
what didn't happen (2026-08-04)". The four criteria in that lock are carried forward verbatim
(§2); nothing here rebuilds `sessionExport.ts`'s document model.

---

## 1. The problem

The user's report: *"osce report and student report for trainers/admin … both so messy and not
aesthetic … they are just listing the obvious … I don't want reports to tell me what I already
know."*

Reading the code, the complaint is not only presentational. Five defects, each verified:

| # | Defect | Evidence |
|---|--------|----------|
| D1 | **No AI-tutor session is logged at all.** `/api/end-session` (`chat.py:244`) is the only path that calls `log_session` for tutor chats — and nothing in `frontend/` calls it. `/api/chat` uses `ChatRequest`, which has no `topic` field and never logs. The `"Ophthalmology"` rows in the table are historical, from before the call was dropped when tutor history moved to localStorage. Corrected 2026-08-06: this entry previously read "every session is logged with the constant `Ophthalmology`", which was the visible symptom, not the cause. **Also in that dead handler:** `update_profile(source="tutor")`, so tutor use has not been feeding streaks or XP either. |
| D2 | Nothing records what the student **asked** | `tools/chatbot/log_session.py:29` stores only `summary` = the last *assistant* message, cut at 200 chars. |
| D3 | The report's topic table silently drops flashcard topics | `AdminStudentDetail.tsx:103` iterates `retention_scores` and looks up flashcards **by that key**. The two are different namespaces, so the Flashcards column prints "—" on a mismatch and flashcard-only topics never appear at all. |
| D4 | A trainer cannot reconstruct an OSCE attempt | `cases.py:1005` persists score, sub-scores, `safe`, `missed_critical` and the coaching block — but **not** `checklist_comparison`. Only the aggregate `checklist_coverage` (0–40) survives, so the most teachable artefact (which steps happened) is destroyed at the end of every station. |
| D5 | "Insights" are counts | `admin.py:658` `_build_student_findings` emits "N sessions; recent focus: …", "N% accuracy", "N stations, N passed". A trainer reads that off the tables above it. |

D5 is the heart of it. The current documents answer *"what did we record?"*. They should answer
the questions a trainer actually has:

1. Is this student safe in front of a patient?
2. What do I teach them on Tuesday?
3. Are they improving, or coasting?
4. Where exactly do the marks go?
5. **Do they not know it, or do they know it and can't do it?**
6. Is this weakness theirs, or is it the cohort's — i.e. do I fix the student or fix my teaching?

(5) and (6) are answerable from data already in the database and are answered nowhere in the
product today. They are the centre of this rebuild.

## 2. Principles

Carried from the 2026-08-04 lock and extended to both documents:

- **P1 — The ledger outranks the prose.** Every figure is computed from records and printed
  above any sentence a model wrote. No claim goes unchecked.
- **P2 — Nothing goes quiet.** An empty section that renders "— none —" asserts *"there is
  nothing here"*, which is a claim. Absent data says which data is absent and why (§8).
- **P3 — Print-first.** Self-contained HTML, A4 `@page`, no external asset. Every state is
  carried by a glyph **and** by words as well as by colour, so a mono print with background
  graphics off loses nothing.
- **P4 — One source of analysis.** The console panel, the student report and the OSCE dossier
  render one object from one module. They cannot describe the same student differently.
- **P5 — Deterministic first.** Every insight is computed and traceable to its inputs. The AI
  narrative stays behind the existing explicit button — it is a paid call and it refines, never
  originates, a finding.

## 3. Architecture

```
                    ┌──────────────────────────────────────────┐
 Supabase reads ───▶│ tools/supervisor/  topic_map.py          │
 (already fetched   │                    osce_analysis.py      │
  by the endpoint)  │                    student_insight.py    │
                    │  PURE. No I/O, no AI, no DB, no clock.   │
                    │  rows in → one JSON object out           │
                    └──────────────────┬───────────────────────┘
                                       │
                    ┌──────────────────┼───────────────────────┐
                    ▼                  ▼                       ▼
          AdminStudentDetail   studentReportExport      osceDossierExport
            (console panel)     (download, HTML)         (download, HTML)
```

The core lives in `tools/supervisor/` beside the pure analytics modules already there
(`mastery.py`, `risk_model.py`, `trend.py`, `cohort_analytics.py`) and is split by
responsibility: `topic_map.py` owns everything on the topic axis (§4.1, §4.5, §5),
`osce_analysis.py` owns everything across attempts (§4.2–4.4), `student_insight.py` owns the
consultation labels (§4.6) and assembles the payload.

All three are pure — they take the rows the endpoint has already read and return a typed
structure. Purity is what makes them TDD-able and what makes P4 enforceable: there is one
implementation of "where do this student's marks go", and three renderers.

Inputs (all already fetched by `/api/admin/student/{id}/detail`, no new round trips):

| Input | Source | Note |
|-------|--------|------|
| `profile` | `get_profile` | `retention_scores`, `weak_topics`, `missed_findings` |
| `sessions` | `db.get_sessions(limit=30)` | tutor + station log rows |
| `case_rows` | `db.get_case_results` | one row per attempt, incl. the new `checklist_detail` |
| `card_rows` | `db.get_flashcard_attempts` | **replaces** the `get_topic_accuracy` call — that helper already calls this and discards the timestamps, which trajectory needs. Same one read; per-topic accuracy is derived here instead. |
| `case_topics` | `get_case_index()` | cached case→metadata map, extended with `topic` (§6.3) |
| `cohort` | `get_cohort_reads()` | already cached, already on this endpoint |

## 4. The six insights

Each returns its own `evidence` (the counts behind the claim) and an explicit insufficient-data
state. None ever emits a bare adjective.

### 4.1 Knowledge × performance map — the centrepiece

Rows are topics; columns are the three things we measure. The **diagonal read** is the insight.

|  | Flashcards | Station | Retention |
|--|-----------|---------|-----------|
| *measures* | knowledge — can they recall it | performance — can they do it | durability — does it stick |
| *source* | `card_rows` grouped by `topic_tag` | `case_rows` grouped by the case's topic | `profile.retention_scores` |

**Topic-key normalisation (fixes D3).** All three namespaces pass through
`norm(t) = collapse_ws(t.strip().lower().replace("_", " "))`, and the row set is the **union** of
the three. A topic present in only one source is a row with two absent cells — never a dropped
row. `weak_topics` mixes flashcard tags and raw OSCE case topics (a known hazard), and
normalisation is exactly what makes that mixture safe to join on.

**Cell** = `{value: float|None, n: int, band}` where band is:

| Band | Rule |
|------|------|
| `strong` | value ≥ 75 |
| `developing` | knowledge 65–74 · performance 60–74 |
| `weak` | knowledge < 65 · performance < 60 |
| `thin` | n below the minimum (flashcards n < 5, station n < 1) — a value exists but is not banded |
| `absent` | no data for this topic on this axis |

The two weak lines differ on purpose and the document says so: **65** is the flashcard weak line
used everywhere else in the app; **60** is the OSCE pass mark (`sessionExport.PASS_MARK`).
Borrowing one for the other would silently restate a pass as a failure.

**Flags** (both cells must be banded — never fires off a `thin` or `absent` cell):

| Flag | Rule | What the trainer does |
|------|------|----------------------|
| **Knows it, can't do it** | flashcards ≥ 75 **and** station < 60 | Practical drilling, not more reading. The knowledge is there; the hands aren't. |
| **Doing it by rote** | station ≥ 75 **and** flashcards < 65 | Probe the underlying theory — the procedure is memorised, the reasoning may not be. |
| **Consistent gap** | both banded weak | Genuine topic gap; teach it from the front. |

### 4.2 Where the marks go

Across attempts, decompose the marks *lost*:

```
lost_checklist  = Σ (40 − checklist_coverage)
lost_consult    = Σ (30 − consult_technique)
lost_judgement  = Σ (30 − judgement_safety)
```

Reported as a share of total lost: *"Of 168 marks lost over 6 stations, 61% were Clinical
Judgement & Safety."* A trainer cannot get that by reading a column of totals.

**Scale safety.** Only attempts with `grade_scale = 2` (the 40/30/30 era) enter the sum. Rows
with `grade_scale` NULL are the ×50 era; they are **counted and named as excluded**, never
blended. Blending them is the exact failure migration 017 exists to prevent. If no attempt
carries the current scale, the section states that instead of computing on one row.
Total lost = 0 → *"no marks lost across N stations"*, not a blank.

### 4.3 Repeat offenders

A step missed once is noise; missed twice is a habit.

- **Steps** — from `checklist_detail` (§6.1): count attempts where a step was `performed: false`,
  keyed on `norm(action)`. Keep count ≥ 2. Always printed with its denominator: *"missed in 3 of
  the 4 stations that included it"*. The denominator is what stops "3 misses" reading as a
  disaster when the step appeared 3 times and "3 of 12" reading as a crisis.
- **Critical steps** — same from `missed_critical`, which is already persisted, so this half
  works retroactively on every existing attempt.
- **Findings** — `profile.missed_findings`, unchanged in source, now printed with its count.

### 4.4 Trajectory

Ordered by `completed_at`; split first half vs second half (odd n drops the middle element);
`delta = mean(second) − mean(first)` on `score_100`.

| Band | Rule |
|------|------|
| improving | delta ≥ +5 |
| steady | −5 < delta < +5 |
| declining | delta ≤ −5 |

**Minimum n = 4.** Below it the section prints *"not enough attempts to call a trend (2 so far,
4 needed)"* — it does not draw a line through two points. The same computation runs on
`card_rows` (minimum 20 cards) using their timestamps.

This replaces `profile.learning_velocity`, a single word with no provenance and no minimum,
which the current report prints as a vitals tile. The word stays in the API for compatibility;
the documents stop treating it as a finding.

### 4.5 Cohort contrast — the curriculum signal

For each topic where the student is banded weak, compare against the cohort mean on the same
axis, computed leave-one-out from `get_cohort_reads()`.

| Label | Rule | What it means |
|-------|------|---------------|
| **Individual gap** | student ≥ 15 points below the cohort mean | Coach the student. |
| **Cohort gap** | cohort mean itself < the weak line for that axis | Fix the teaching — most of the cohort is weak here. |
| **Individual gap within a cohort gap** | both | Hardest case: the topic is taught poorly *and* this student is behind even that. |

Requires ≥ 3 peers with data on that topic; below that the row reads *"no cohort baseline for
this topic (1 peer with data)"*. The leave-one-out rule is already established on this endpoint
and is preserved: a student is never an input to the average they are measured against.

### 4.6 Consultation labels

Tutor sessions grouped by derived label with a count and a last-seen date — *"asked about
tonometry technique (4×, last 2026-08-02)"*. **No transcript**, by request.

Label resolution, in order:

1. `topic`, when it is non-empty and not the sentinel `"Ophthalmology"` → the student's own
   first question (§6.2), captured going forward.
2. Otherwise keyword-match the stored 200-char `summary` against the topic vocabulary (the union
   of flashcard `topic_tag`s and case topics — a vocabulary we already have).
3. Otherwise **"topic not recorded"**.

Step 3 is the point. The current document prints the constant "Ophthalmology" as though it were
a subject; the rebuilt one never prints a label it did not derive from evidence.

## 5. Flashcard statistics — average grade per topic

Requested explicitly. The per-topic figure is `correct / total` as a percentage, from
`card_rows` grouped on the **normalised** `topic_tag`.

**`flashcard_attempts.score` is deliberately not used as the grade.** It is an XP value — base
points times a combo multiplier, clamped to 100 at `student.py:528`, typically 0–24. Averaging it
would print a "grade" that rises with a student's answer streak rather than with their
correctness. Accuracy is the honest grade; the spec records the rejection so it is not
re-litigated.

Per topic the report prints: **grade %**, **n cards**, band, and the cohort mean where §4.5 has a
baseline. Sorted worst-first — the table is read top-down for what to do next.

## 6. Data changes

### 6.1 Migration 019 — persist the OSCE ledger

```sql
ALTER TABLE case_progress
  ADD COLUMN IF NOT EXISTS checklist_detail JSONB;
```

Additive and nullable, matching 011 and 017. `db.insert_case_result` gains a `checklist_detail`
parameter and its existing rich→base fallback covers a pre-migration database unchanged.

Written at submit in `_persist_submit`, from data already computed there:

```jsonc
[{ "step_number": 3, "action": "Check allergy status", "phase": "Preparation",
   "critical": true, "performed": false, "skipped": true }]
```

`phase` comes from `group_by_phase(steps)` — the same pure helper `/station` already uses, so the
persisted ledger groups identically to the one the student saw. `skipped` distinguishes *gave up*
from *never reached*; both are `performed: false`, exactly as the station scores them.

**NULL means "attempt predates this migration", never "performed nothing".** Documents print
*"per-step ledger not recorded for this attempt"* on a NULL and omit the ledger section — they do
not render an empty checklist, which would read as total failure (P2).

Applied via `/db-migrate` and ledgered in `tools/db/migrations/APPLIED.md`. Because the write is
additive with a fallback, the code is safe to ship before the column exists — but the ledger stays
empty until it does, so the migration is coordinated with the deploy.

### 6.2 Tutor consultation label capture (fixes D1/D2)

Two halves, because the label is worthless if nothing writes a row to put it on.

**(a) Restore the session write.** `/api/end-session` already does the right thing —
`log_session` plus `update_profile(source="tutor")` — and has no caller. The tutor screen
calls it when a conversation ends: leaving `/chat`, or starting a new conversation, with at
least one completed exchange. One row per conversation, which is the granularity the
consultation labels assume.

Accepted limitation, stated rather than engineered around: an unmount-time call can be missed
on an abrupt tab close, so an occasional conversation goes unlogged. The alternative — writing
the row on a conversation's first turn — never misses, but stores a summary and token count
that describe only turn one. A missing row is a smaller lie than a wrong one.

**(b) Send a real label.** The client sends the student's **first user message**, trimmed to
100 characters, as `topic`, reusing `tutorSessions.deriveTopic` — the same rule that already
titles the recent-conversations list, so the label a student sees on their own history is the
label staff see. No AI, no new table, no transcript retention. Going forward, "what the
student consulted" is literally what they typed.

Two guards at the write path:

- A leading `Case:` prefix is stripped from the client-supplied label. `_build_student_findings`
  separates tutor from station sessions on `topic.startswith("Case:")`, and that discriminator
  must not be forgeable by something a student types into a chat box.
- The label is truncated server-side, not trusted from the client (`topic[:100]` already exists
  in `log_session`).

**Privacy note.** This stores a student's own words where staff can read them. It is a new
capture on a consented production system, flagged to the user and accepted. Legacy rows are
unaffected and fall through to §4.6 step 2.

### 6.3 Case topic on the case index

`classify_case` in `tools/supervisor/case_index.py` gains `"topic": case.get("topic", "")` on its
entry. That index is already built once per worker off the event loop and already cached; the
station axis of §4.1 needs case→topic and there is no reason for a second map.

## 7. The documents

One shared print-first stylesheet module so both read as one product: A4 `@page`, tabular
numerals, `break-inside: avoid` on every card and row, glyph+word redundancy (P3).

### 7.1 Student report — `studentReportExport.ts`, rebuilt

1. **Masthead** — identity, generated-at, what this document is.
2. **Findings** — the ranked insights from §4, each as *claim → evidence → what to do*. Not counts.
3. **Knowledge × performance map** — §4.1, with flagged cells called out beneath the table.
4. **Where the marks go** — §4.2.
5. **Trajectory** — §4.4.
6. **Cohort contrast** — §4.5.
7. **Flashcards by topic** — §5, worst-first.
8. **Stations** — one neat row per attempt, each with its own download (§7.3).
9. **Consultations** — §4.6 labels and counts. No transcript.
10. **Lecturer note.**

### 7.2 OSCE dossier — `osceDossierExport.ts`, new

One document, every attempt for one student: masthead → the arc (§4.4) → where the marks go
(§4.2) → repeat offenders (§4.3) → safety record → then one section per attempt carrying its
score, buckets, coaching block and its per-step ledger.

### 7.3 Per-attempt record

Reuses `buildSessionHtml` unchanged — the trainer gets the same document the student got. Its
`SessionExportData` is populated from the persisted row plus `checklist_detail`.

**Transcripts are absent and the document says so.** `chat_sessions` stores no messages
(`log_session.py:29` keeps only a 200-char assistant summary), so Appendix A/B carry
*"transcript not retained for this attempt"* rather than an empty list. Retaining OSCE
transcripts would be a new and much larger data capture; it is out of scope here (§11).

This is the one change `sessionExport.ts` takes: its `transcript()` helper renders
`— no messages —` on an empty array, which under P2 asserts that nothing was said. An optional
`transcriptNote` on `SessionExportData` lets the caller say *why* the appendix is empty; the
student's own save passes nothing and is byte-identical to today. That is a refinement **within**
the 2026-08-04 lock — its criterion (2) "nothing goes quiet" is what requires it — not a rebuild
of the document model.

### 7.4 Console — `AdminStudentDetail.tsx`

Rebuilt onto the same `StudentInsight` object: ranked findings at the top, the map as a real
table, per-attempt download buttons on the stations rows. Built from the existing `DataTable`,
`Panel`, `MiniStat` and `BarList` console primitives — this pass adds no new chart vocabulary.
The behaviours the current file documents are preserved exactly: the `seededFor` ref that stops
the 30 s poll clobbering a mid-edit note, the AI narrative behind its explicit button, and the
mastery omission guard.

## 8. Honest states

P2, made concrete. Every section, in every document, when the data is not there:

| Situation | What renders |
|-----------|--------------|
| No attempts at all | "No stations attempted." — the section, not a zero |
| Attempts, all pre-017 scale | "6 attempts, all on the retired ×50 scale — not comparable to current marks." |
| `checklist_detail` NULL | "Per-step ledger not recorded for this attempt." |
| Flashcards n < 5 on a topic | The value, marked `thin`, unbanded, with its n |
| Fewer than 4 attempts | "Not enough attempts to call a trend (2 so far, 4 needed)." |
| Fewer than 3 peers on a topic | "No cohort baseline for this topic (1 peer with data)." |
| Student outside the cohort | The whole cohort section omitted — the existing `mastery: null` treatment, unchanged |
| Tutor label underivable | "Topic not recorded." |
| No marks lost | "No marks lost across N stations." |

A zero is never printed where the truth is "not measured".

## 9. Testing

- **`tests/supervisor/test_topic_map.py`, `test_osce_analysis.py`, `test_student_insight.py`** —
  TDD, one failing test per insight before its
  implementation. Edge cases that must each have a test: n=0 and n=1 on every axis; mixed
  `grade_scale` (a NULL row must not enter the decomposition); topic-namespace collisions
  (`Visual_Fields` / `visual fields` / `VISUAL FIELDS` collapse to one row); a flag refusing to
  fire off a `thin` cell; leave-one-out with exactly 3 peers and with 2.
- **`frontend/tests/student-report.test.mjs`** — extended; **`frontend/tests/osce-dossier.test.mjs`**
  — new. Both assert the honest states of §8 render as *words*, not blanks, and that no section
  prints a bare 0 for missing data.
- **Regression for the fix that must stick** — a report built from data where the flashcard and
  retention namespaces differ in case and separator must show every topic from both (D3).
- Existing `session_export_logic.mjs` and `test_coaching_truth.py` must stay green: this pass
  does not change `sessionExport.ts`'s document model.
- Gates: `python -m pytest -q`, `cd frontend && npm run typecheck && npm run build`.

## 10. Phases

| Phase | Contents | Ships when |
|-------|----------|-----------|
| **P1** | Migration 019, ledger persistence at submit, tutor label capture, `student_insight.py` + pytest, endpoint wiring | pytest green; **migration coordinated** — the code is safe before the column exists, the ledger is empty until it does |
| **P2** | `studentReportExport.ts` rebuild, `osceDossierExport.ts`, per-attempt download | Node harnesses + typecheck + build green |
| **P3** | `AdminStudentDetail.tsx` rebuild | typecheck + build green, behavioural verify on the running console |

Each phase commits and pushes independently. P2 and P3 read `StudentInsight`, so P1 lands first.

## 11. Out of scope

- **OSCE transcript retention.** Would require a new table and a data-retention decision. The
  documents state its absence (§7.3) rather than quietly omitting the appendix.
- **Rebuilding `sessionExport.ts`'s document model.** It is under a design lock and it is good;
  this pass only feeds it trainer-side data.
- **Backfilling `checklist_detail` or `grade_scale`.** Neither is recoverable from what was
  stored. Inventing them would assert a record we cannot verify — the same reasoning migration
  017 records for not backfilling the scale marker.
- **AI-authored analysis.** Rejected in design: unreproducible run-to-run, unchecked, and a paid
  call per download. The narrative button stays as it is.
- **Changing `learning_velocity`'s API shape.** The field stays; §4.4 replaces its role in the
  documents.
