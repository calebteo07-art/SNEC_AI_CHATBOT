# Complete silly-grounded flashcards (50/topic, theory·practical·situational) + OT OSCE gaps — Design

> Status: approved 2026-07-02. Supersedes the flashcards portion of
> `2026-07-02-silly-content-coverage-design.md` (which introduced the FOUNDATIONS
> pool with **placeholder** cards). This spec removes placeholders entirely and
> defines the real, hand-authored content build.

## 1. Context & goal

EyeBot's flashcards must cover **every** topic/chapter in *silly* (the ~93-doc
Supabase KB) for every role, with real, KB-grounded questions — not just
procedures. The prior session wired the taxonomy (shared FOUNDATIONS pool + role
procedural pools) but filled the new topics with clearly-marked **placeholder**
cards, gated behind a deferred paid Gemini run.

The user has now redirected:

- **No Gemini.** The agent (Claude) hand-authors every card, grounded in *silly*.
  Free, higher quality than the app's `flash-lite`, and the agent verifies each
  card against source as it writes.
- **"Placeholder" only ever meant the topic-card images** on the selection fan —
  never the questions. Topic images stay as the existing **solid-color hue
  fallback** (no image generation).
- **Depth:** every topic = **5 rotating sets of 10 = 50 cards**, dealt 10 at a
  time with no-repeat rotation (rotation already exists; see §5).
- **Variety:** every deck — new *and* existing — carries a mix of
  **theory / practical / situational** questions. `situational` is a new `kind`.
- **OSCE:** fill the remaining OT procedural gaps (4 stations); knowledge domains
  stay exercised within existing scenarios (user chose "OT gaps only").
- **Cataract:** split lens/cataract into its own Foundations topic.

Governing rule (unchanged): **OA ≡ PSA** (shared CLINICAL pool); **OT** distinct.
Two content tracks, not three.

## 2. Decisions locked

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Hand-author all cards; **no Gemini** | One-time build-time authoring; free; Opus > flash-lite; agent is the accuracy gate anyway |
| D2 | Delete placeholder card data outright; a topic is **absent from the bank until its real 50 cards exist** | Nothing fake ever reaches main — placeholders-first satisfied by construction, not by a runtime filter |
| D3 | 50 cards/topic (5×10); served deck **fixed to 10** | User's rotation-depth requirement; 50 = 5 no-repeat decks |
| D4 | Add `situational` as a third `kind` | Metadata only (not rendered) → low-risk; enables the required mix + a mix-enforcing test |
| D5 | New Foundations topic `disorders_lens_cataract` | Cataract is a major SNEC area (Disorders of the Lens + perioperative cataract) |
| D6 | OSCE: author 4 OT gap stations only | Matches "remaining"; OSCE is practical by nature; knowledge domains covered by flashcards + woven into existing scenarios |
| D7 | Topic-card images: solid-color hue fallback | User directive; no image-gen cost |
| D8 | Phased delivery, shipped per complete topic | Incremental value; every push is green real content |

## 3. Taxonomy (final = 45 topics)

`tools/flashcards/flashcard_sets.py :: FLASHCARD_TOPICS`

- **FOUNDATIONS (12):** anatomy_physiology, microbiology_infection, pharmacology,
  ocular_emergencies, professional_ethics, disorders_eyelid_lacrimal_orbit,
  disorders_cornea_conjunctiva, **disorders_lens_cataract (NEW)**,
  disorders_uvea_retina, glaucoma, neuro_strabismus, systemic_disease.
- **CLINICAL (14, OA/PSA):** unchanged (red_eye, triage, history_taking,
  distance_va, near_vision, pinhole, iop_nct, eye_drops, pupil_dilation,
  colour_vision, amsler_macula, fall_risk, perioperative, abbreviations).
- **OT (19):** the 15 existing + gap-fill aberrometry, lens_meter,
  retinal_imaging, dr_grading.

`disorders_lens_cataract` label: "Lens & Cataract Disorders". Lens/cataract
content moves out of `disorders_cornea_conjunctiva` (which stays cornea / sclera /
conjunctiva = the rest of the anterior segment).

## 4. Card model & storage

Storage shape is **unchanged** (minimal churn):
`FLASHCARDS[pool][topic_key][difficulty] = [card, …]`, difficulty ∈
{easy, medium, hard}.

- **Difficulty tiers are now internal bookkeeping only.** The UI is already
  no-difficulty (one mixed deck per topic); tiers just partition the 50 cards
  (~17 / 17 / 16) and keep the legacy `topic__difficulty` serving path valid.
- **Card fields (unchanged except `kind`):** `stem`, `options` (exactly 4),
  `correct` (indices), `qtype` (`single`|`multi`), `kind`
  (`theory`|`practical`|**`situational`**), `explanation` (one-sentence model
  answer), `reasoning_eligible` (bool). No `placeholder` flag (deleted).
- **Per-topic composition (50 cards):**
  - Kind-mix floor: **≥10 theory, ≥10 practical, ≥10 situational** (remaining
    ~20 free); every topic must contain all three.
  - `reasoning_eligible: True` on **≥10 cards/topic** (judgment-style
    practical/situational cards) so any 10-card deck gets its ~2 typed-reasoning
    cards (`typed_count(10) == 2`).
  - Correct answer(s) authored first in `options` (serving shuffles slots via the
    existing `shuffle_card_options`).
- **Kind semantics (authoring guide):**
  - *theory* — recall/understanding of a fact from silly (definition, value,
    classification, mechanism).
  - *practical* — how to perform / handle equipment / technique / documentation
    steps.
  - *situational* — clinical-judgment scenario ("a patient presents with X, what
    do you do / what does it indicate / when do you escalate"), grounded in
    silly's guidance.

## 5. Serving (rotation already exists — do not rebuild)

`tools/api/routers/student.py`:

- `GET /api/flashcards/generate` topic path calls `get_topic_cards(role, topic)`
  (all tiers mixed) then `pick_next_unseen(student_id, len(pool),
  f"flash_topic_{topic}", served_idx, n)` — deals **unseen-first** in a
  per-student deterministic shuffle, wrapping only after the pool is exhausted.
  With 50 cards this yields **5 no-repeat decks**. Option order re-randomized per
  serve by `shuffle_card_options`.
- **Change:** fix the served deck to **exactly 10**. Set `n` default → 10; the
  frontend length selector (Quick/Standard/Deep = 5/10/20 in `types.ts::LENGTHS`)
  is removed so a topic always serves 10. Keep the 1–20 clamp as a safety bound.
- `GET /api/flashcards/topics`: **hide topics with 0 cards** (a topic in the
  taxonomy but not yet authored must not appear as an empty deck). Visible iff
  `topic_card_counts(role)[topic] > 0`. Since new topics are committed only when
  complete (50), every visible topic is real and full-sized.

## 6. Grounding method (free — no Gemini, no embeddings)

- Source of truth per topic = the mapping in `docs/notes/silly-coverage-matrix.md`
  (silly document → flashcard topic).
- A small **read-only** helper `tools/kb/dump_topic_sources.py` pulls the mapped
  documents' `chunks.text` straight from Supabase (`documents` join `chunks`) for
  a given topic — a plain table read, **no `embed_text`, no Gemini**. Output is
  the raw KB text the agent authors from.
- The agent writes cards grounded strictly in that text (no invented drugs,
  doses, values, or anatomy), matching the tonality in §7, and runs
  `validate_cards` (kept from `generate_cards.py`) as a structural check before
  pasting into `static_cards.py`.

## 7. Tonality (match existing content)

- **Flashcards:** concise SNEC-specific stems; 4 plausible options; explanation is
  one grounded sentence citing the concrete fact (see the existing `triage` deck —
  e.g. "Category 1 … within 10 minutes (e.g. chemical burn, CRAO)"). Singapore /
  SNEC framing where relevant (LogMAR, NCT, SNEC Triage Form, drug names as used
  in silly).
- **OSCE cases:** match the existing JSON exactly — `case_id`, evocative `title`,
  `difficulty`, `topic`, `role`, `estimated_minutes`, full `patient` block
  (Singaporean name/NRIC/address/contact), `history`
  (hpc/pmhx/family_hx/medications/social_hx), `examination_findings`,
  `investigations`, `diagnosis`, `management` (immediate/follow_up/
  patient_education), and a 4-domain `rubric` (history/investigations/diagnosis/
  management, each `points` + `key_points`). Allied-health framing (findings &
  escalation, not prescribing).

## 8. Placeholder deletion & dead-code cleanup

- Remove from `tools/flashcards/static_cards.py`: the entire `"FOUNDATIONS": {…}`
  placeholder block and the 4 placeholder OT topics (aberrometry, lens_meter,
  retinal_imaging, dr_grading) — they are re-added only as real 50-card decks.
- Delete `tools/flashcards/seed_placeholder_cards.py`.
- In `tools/flashcards/generate_cards.py`: drop `placeholder_cards()`,
  `generate_topic()` (live Gemini path), `build_prompt()`, `emit_python_block()`,
  the CLI, and the schema; **keep `validate_cards()`** (+ `CARD_KEYS`) as the
  authoring structural check. (Or reduce the module to just the validator.)
- Remove the `placeholder`-tracking test and any `placeholder: True` references.

## 9. OSCE — OT gap stations

- Author 4 OT case JSONs in `cases/` matching §7 structure, grounded in silly
  (SNEC Procedure Manual Ch5, oittalk, SORC parts 1–3, photography/angiography
  docs):
  - `case_ot_0NN_aberrometry_*.json`
  - `case_ot_0NN_lens_meter_focimetry_*.json`
  - `case_ot_0NN_retinal_imaging_*.json`
  - `case_ot_0NN_dr_grading_sorc_*.json`
  (Pick the next free OT case numbers; ≥1 case each, more if a topic needs it.)
- Ensure each resolves to a real DB checklist or the rubric path per the existing
  provenance guard (`tests/cases/test_checklist_provenance.py` must stay green).
  If no DB checklist exists for a procedure, the case carries its own `rubric`
  (as the existing gap cases do) — do **not** author new Supabase checklists
  unless required.
- Confirm the OT pool resolver (`tools/cases/topic_sets.py`) surfaces the new
  cases to OT; the OA/PSA CLINICAL pool is unaffected.
- Update `docs/notes/silly-coverage-matrix.md` OSCE section: these gaps move from
  "to author" to authored.

## 10. Tests & gates

**Always-green (every commit):**
- `tests/flashcards/test_static_cards_integrity.py`: allowed `kind` set becomes
  `("theory","practical","situational")`; existing MCQ integrity + no-duplicate
  stems (within set, across pool) unchanged.
- `tests/content/test_coverage.py`: taxonomy completeness (all Foundation domains
  incl. `disorders_lens_cataract` are topics); **every topic present in the bank
  has all three kinds** (mix-present guard); OSCE per-pool guard unchanged.
- `tests/flashcards/test_foundations_taxonomy.py`,
  `test_flashcard_sets.py`: updated for 12 Foundations topics; drop expectations
  that reference placeholders.
- `tests/flashcards/test_generate_cards.py`: reduced to `validate_cards` coverage
  (placeholder/live-path tests removed).

**Progress tracker (one xfail until the build completes):**
- `test_every_topic_has_50_cards_full_mix` — for all 45 topics: ≥50 cards **and**
  ≥10 of each kind. `@pytest.mark.xfail` while authoring is in progress; when it
  XPASSes, remove the marker (final ship) to lock the mandate.

**Full gates before each push** (CLAUDE.md parity):
`python -m pytest -q` (timeout >120s; ~2min), `cd frontend && npm run typecheck
&& npm run build`, `node frontend/tests/aurora_assert.mjs`, and for OSCE
`node frontend/tests/station_assert.mjs`.

## 11. Execution phases (each phase = a green push to main → Render prod)

1. **Infra ship (real content + cleanup, no fake data):**
   `situational` kind (integrity test + `types.ts` union) · add
   `disorders_lens_cataract` topic · fix served deck to 10 (+ remove length
   selector) · delete placeholder data + dead scaffolding (§8) · hide-empty-topics
   in `/api/flashcards/topics` · restructure coverage tests (§10, with the xfail
   tracker) · the 4 OSCE OT stations + matrix update · `dump_topic_sources.py`.
   Gates green → push.
2. **Authoring loop (per topic, grounded in silly):** for each of the 45 topics,
   author 50 cards with the §4 mix, `validate_cards`, paste into `static_cards.py`,
   run flashcards + content tests, commit + push. Order: new FOUNDATIONS topics
   first (they're currently invisible/absent), then top up existing CLINICAL/OT
   from ~20 → 50. Small batches (a few topics/commit) are fine; each commit stays
   green.
3. **Lock ship:** when `test_every_topic_has_50_cards_full_mix` XPASSes, remove
   the xfail marker; final full-gate run; push.

## 12. File-by-file change list

- `tools/flashcards/flashcard_sets.py` — add `disorders_lens_cataract` to
  FOUNDATIONS; OT keeps gap-fill labels.
- `tools/flashcards/static_cards.py` — delete placeholder FOUNDATIONS block + 4
  placeholder OT topics; add real 50-card decks per topic over phase 2.
- `tools/flashcards/generate_cards.py` — reduce to `validate_cards` (+ CARD_KEYS).
- `tools/flashcards/seed_placeholder_cards.py` — **delete**.
- `tools/api/routers/student.py` — `flashcards_generate` n→10; topics endpoint
  hides 0-card topics.
- `frontend/src/aurora/components/flashcards/types.ts` — `kind` union +
  `situational`; remove/neutralize `LENGTHS` selector (fixed 10).
- `frontend/src/aurora/components/flashcards/*` — remove the deck-length picker UI
  if present; StepTopic Foundations grouping already handles the new topic.
- `tools/kb/dump_topic_sources.py` — **new**, read-only source dumper.
- `cases/case_ot_*_{aberrometry,lens_meter,retinal_imaging,dr_grading}*.json` —
  **new** OT stations.
- `tools/cases/topic_sets.py`, `tools/api/routers/cases.py` — only if the new OT
  cases need resolver/label wiring (verify).
- `docs/notes/silly-coverage-matrix.md` — Lens/Cataract row; OSCE gaps authored.
- Tests as listed in §10.

## 13. Non-goals / out of scope

- No per-topic Nano-Banana images (solid-color hue fallback only).
- No standalone knowledge-domain OSCE stations (D6).
- No new Supabase checklists unless a new OT case strictly requires one.
- No change to grading, XP, SM-2, or the study-flow UX beyond the fixed-10 deck.
- No DB migration.

## 14. Risks & mitigations

- **Volume (~1,600 new cards).** Mitigation: phased, ship-per-topic; xfail tracker
  keeps intermediate commits green; per-topic completeness means no half-decks
  ever reach students.
- **Ungrounded/hallucinated facts.** Mitigation: author only from
  `dump_topic_sources.py` output; `validate_cards` for structure; self-check each
  fact against the source chunk (reject wrong-but-plausible).
- **Knowledge topics resisting a "practical" angle** (e.g. anatomy). Mitigation:
  frame practical/situational around examination relevance and symptom→structure
  reasoning; floors set at ≥10 (achievable), not a rigid third each.
- **Windows/PowerShell console cp1252** on scripts printing non-ASCII — run with
  `PYTHONIOENCODING=utf-8 PYTHONUTF8=1` (bit the coverage-matrix dumper before).
- **Full pytest ~96s** — set Bash timeout >120000ms.
