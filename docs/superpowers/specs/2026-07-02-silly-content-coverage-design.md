# Design — Complete "silly" content coverage for flashcards & OSCE (all roles)

**Date:** 2026-07-02
**Status:** Design — awaiting user review
**Owner rule:** OA ≡ PSA (one "CLINICAL" track), OT distinct. See
`project_role_content_model`. "silly" = the ~93-doc Supabase KB
(`reference_silly_kb`).

## 1. Problem

Flashcards and OSCE content is incomplete and mis-assigned relative to *silly*:

- **Flashcard topics are procedure-only.** Whole knowledge domains in silly have
  **zero** flashcard coverage: anatomy & physiology (A&P I/II/III), microbiology,
  **pharmacology** (2 docs incl. the "OT OA Course 2026" — the user's trigger
  example: OT account had no pharmacology), diseases & disorders (25 docs),
  ethics/professional, infection control, DR grading (SORC). The current topic
  set never surfaces them for any role.
- **OSCE OA/PSA are a duplicated fork.** `case_oa_*` (51) and `case_psa_*` (50)
  are near-identical in scope but authored/maintained separately, served by an
  exact-role filter — two sources of truth that drift.
- **Role assignment is not derived from silly.** Nothing guarantees each silly
  topic/chapter reaches the correct role(s).

## 2. Acceptance bar (the mandate)

**Not a single topic/chapter in silly may be missed — for BOTH flashcards AND
OSCE, for ALL roles.** Coverage is enumerated at **chapter/sub-topic**
granularity (multi-chapter docs: A&P I/II/III, SNEC Procedure Manual 146pp,
Harold Stein Pharmacology, Ophthalmic Pharmacology course, Microbiology, SORC
Part 1–3). A regression test encodes the full matrix so coverage cannot silently
regress.

## 3. Taxonomy — add a shared "Foundations" layer

`FLASHCARD_TOPICS` (in `tools/flashcards/flashcard_sets.py`) gains a third pool,
`FOUNDATIONS`. `topics_for(role)` changes from "return the role's pool" to
**"return FOUNDATIONS + the role's procedural pool."** This is the single seam
that feeds the fan carousel, the `/api/flashcards/*` endpoints, labels, and
per-user rotation — so every downstream surface inherits the change with no
other edits.

### FOUNDATIONS (shared by OA, PSA, OT) — 11 topics

| topic_key | Label | silly sources (chapter-level) |
|---|---|---|
| `anatomy_physiology` | Ocular Anatomy & Physiology | A&P I (orbit bones, cranial nerves, visual pathway), A&P II (cornea, lens, angle, 3 chambers, vitreous), A&P III (EOM, lacrimal/tear system, visual pathway) |
| `microbiology_infection` | Microbiology & Infection Control | Microbiology 2025 (viruses, bacteria, fungi, ocular infections, flora), OTOA Infection Control, Procedure Manual Ch3 |
| `pharmacology` | Ocular Pharmacology | Harold Stein Ch4 (anaesthetics, stains, autonomic drugs), Ophthalmic Pharmacology course (glaucoma drug classes, artificial tears, patient counselling) |
| `ocular_emergencies` | Ocular Emergencies | RFoo Ocular Emergencies (chemical/penetrating injury, CRAO, AACG) — **moved out of CLINICAL** |
| `professional_ethics` | Professional Practice & Ethics | Medical Ethics & Legal, MSW role, Professional Etiquette, Communication Skills, Procedure Manual Ch1/2/4 |
| `disorders_eyelid_lacrimal_orbit` | Eyelid, Lacrimal & Orbit Disorders | ptosis, ectropion, entropion, chalazion/stye/trichiasis, lacrimal system, orbit |
| `disorders_cornea_conjunctiva` | Cornea, Sclera & Conjunctiva Disorders | Chitra cornea/sclera/conj, DrFoo conjunctiva & sclera |
| `disorders_uvea_retina` | Uvea & Retina Disorders | uveitis (×2 notes), uvea disorders, retina disorders, ocular inflammation & immunology |
| `glaucoma` | Glaucoma | Glaucoma |
| `neuro_strabismus` | Neuro-ophthalmology & Strabismus | 3rd/6th nerve palsy, optic neuritis/GCA, extra-ocular muscles, strabismus, amblyopia |
| `systemic_disease` | Systemic Disease & the Eye | Diabetes Mellitus, Hypertension, Asthma, systemic disorders (Dr Lee) |

### CLINICAL (OA/PSA procedures) — 14 topics
Unchanged except `ocular_emergencies` moves to Foundations: red_eye, triage,
history_taking, distance_va, near_vision, pinhole, iop_nct, eye_drops,
pupil_dilation, colour_vision, amsler_macula, fall_risk, perioperative,
abbreviations.

### OT (investigations/imaging) — 15 + gap-fill
Existing 15, **plus** any Procedure Manual Ch5 procedures not yet covered —
confirmed gaps to add: `aberrometry`, `lens_meter` (focimetry/lensmeter). Also
fold in the diagnostic docs: `retinal_imaging` (external photography, slit-lamp
photography, retinal angiography) and `dr_grading` (SORC Part 1–3 diabetic
retinopathy grading). Final list validated against the manual TOC during
implementation.

> **Research papers (8 OAOT studies):** not standalone "chapters" to teach; each
> is mapped as supplementary RAG grounding to its clinical topic (chemical
> burns→emergencies, contact-lens infection→cornea, amblyopia→neuro_strabismus,
> uveitis→uvea_retina, thyroid→orbit, IOP/BMI→glaucoma, retinal
> detachment→uvea_retina, ocular surface→cornea). Documented in the matrix so
> they are covered, not skipped.

## 4. Flashcard card generation

- **New reusable tool `tools/flashcards/generate_cards.py`** (WAT execution
  layer). For a given topic it: (1) pulls the topic's silly source chunks via
  the existing RAG pipeline (`tools/kb/search.py`); (2) calls Gemini with a
  **strict JSON schema** to draft easy/medium/hard MCQs grounded *only* in the
  retrieved text, matching the existing card shape (stem, options, correct[],
  qtype, kind, explanation, reasoning_eligible); (3) emits Python-dict blocks for
  `static_cards.py`. Target ~18–24 cards/topic (matching current density) →
  ~220 new cards.
- **Verification pass:** every generated card spot-checked against its source
  chunk before commit; medically wrong-but-pretty cards rejected
  (`feedback_generated_imagery_medical` ethos applies to text too).
- **Cost:** live Gemini calls + prod quota. Per `CLAUDE.md`, the paid run is
  confirmed with the user immediately before executing; tests run in MOCK_MODE.
- **UI/fan:** Foundations topics render in the existing `CardFanCarousel` via its
  built-in hue-placeholder fallback (no blank cards), ordered after "Mixed",
  visually grouped as "Foundations" vs the role's procedural topics. Per-topic
  Nano-Banana images are a later polish pass (non-blocking).

## 5. OSCE — merge OA/PSA + verify coverage

- **Pool-based resolver.** In `tools/api/routers/cases.py` (and
  `tools/cases/topic_sets.py`), change case visibility from exact-role equality
  to **pool** equality (OA/PSA→CLINICAL, OT→OT), mirroring flashcards'
  `pool_for_role`. OA and PSA students then see **one shared CLINICAL case set**.
- **Dedupe the fork.** Merge the 51 OA + 50 PSA files into one deduplicated
  CLINICAL set (~50–60 unique cases): keep the better-authored variant of each
  duplicated scenario, retag to the CLINICAL pool, delete redundant copies. OT's
  50 cases unchanged. Existing checklist-provenance guard
  (`tests/cases/test_checklist_provenance.py`) must stay green.
- **Coverage of knowledge domains in OSCE.** OSCE stations are practical/
  scenario-based. Every **procedural** competency per pool keeps a station.
  Knowledge domains are represented **within scenarios** where clinically
  meaningful (disease recognition, triage/escalation, pharmacology-in-context,
  ethics/communication stations) rather than as contrived standalone stations.
  Each silly knowledge chapter is explicitly mapped in the coverage matrix to the
  case(s) that exercise it — so it is **mapped, never silently missed**. Any
  chapter with no meaningful practical station is listed as
  "flashcards+tutor-only" with a one-line rationale for the user to override.

## 6. Proving completeness — the coverage matrix & test

- **`docs/notes/silly-coverage-matrix.md`** — the human-readable master matrix:
  every silly document → its chapters/sub-topics → flashcard topic_key(s) →
  OSCE case(s)/rationale → role(s). Built from the DB, reviewed by the user.
- **`tests/content/test_coverage.py`** — machine guard asserting: (a) every
  FOUNDATIONS + pool topic has ≥ a minimum number of cards in all three tiers;
  (b) every role-tagged checklist/SOP procedure maps to a flashcard topic **and**
  an OSCE case in the correct pool; (c) no silly knowledge domain from a fixed
  enumerated list is absent from the flashcard taxonomy. Fails CI if coverage
  regresses.

## 7. Verification gates (before each ship)

`python -m pytest -q` (incl. new coverage test) · `cd frontend && npm run
typecheck && npm run build` · `node frontend/tests/aurora_assert.mjs` ·
`node frontend/tests/station_assert.mjs`. All green before pushing to `main`
(auto-deploys to Render prod). Ship order: **(1) flashcards** (taxonomy + cards),
then **(2) OSCE** (resolver + merge).

## 8. Out of scope (YAGNI)

Per-topic generated imagery for new Foundations topics (hue fallback suffices
initially); tutor-chat topic changes; any new DB migration (cards stay static in
`static_cards.py`; OSCE cases stay JSON files).
