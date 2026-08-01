# Distance VA — two SNEC sources conflict (BLOCKED on SNEC)

**Status:** blocked, awaiting SNEC clarification. No content shipped.
**Raised:** 2026-07-31, from `NU-PR-OPD-D0039 … LogMAR (Modified) Method.docx` (v03, rev 22 Feb 2024).

## The conflict

The app carries two different SNEC documents for the same procedure, both ingested
into Supabase `checklists` as separate rows:

Verified 2026-08-01 against **both primary documents** (the .docx of each), not against
the ingested Supabase rows. All differences below are quoted from source.

| | **SOP** — `NU-PR-OPD-D0039` v03 | **PSA Checklist V2** |
|---|---|---|
| Supabase row | `Distance Vision Testing LogMAR (SOP)` | `Distance Vision Testing LogMAR` |
| Source file | `Module 1 Content EyeBot/NU-PR-OPD-D0039 ….pdf` | `Module 2 Content EyeBot/PSA_Checklist_… V2.pdf` |
| Test distance | "the testing distance should be **4m**" | "is **calibrated according to room length**"; no figure |
| Reading direction | "from **right to left**" | "from **left to right**" |
| Partial 6/60 | pinhole; if still not all 5, stop and record | same |
| **No letters at 6/60** | **no pinhole** — straight to Snellen 6/120 | **pinhole first**, then 6/120 |
| **At 6/120** | unreadable → CF/HM/PL/NPL; no pinhole step, no LogMAR value | **adds a pinhole attempt**; labels the line **LogMAR 1.3** |
| Occluder | "Occluder with Pinholes" as a requisite | general occluder + **orange-sticker occluder for infected** |
| Document control | v03, rev 22 Feb 2024, Nursing Dept, Restricted/Sensitive | **no doc number, version or date** — "V2" is only in the filename |

Complementary rather than contradictory (each has steps the other omits): the SOP
opens with a requisites list (M&S Smart System, Occluder with Pinholes, Alcohol
Wipes, Good Lighting) and closes with discarding waste + doctor examines; V2 has
neither but adds "ensure patient is comfortable after the procedure".

**Correction to the first draft of this note:** the earlier "Below 6/60" row said the
SOP goes "6/60 partial → PH; none at 6/60 → 6/120". That collapsed two distinct
branches and implied the pinhole always precedes 6/120. It does not: under the SOP a
patient who reads *zero* letters at 6/60 goes to 6/120 with **no** pinhole. The
"two extra pinhole attempts in V2" claim was correct.

The V2-derived Supabase row was confirmed near-verbatim faithful to the V2 document.

**Live impact:** `tools/cases/resolve_checklist.py:51` maps every VA keyword
(`logmar`, `snellen`, `pinhole`, `visual_acuity`, `distance_va`, `e_chart`,
`low_vision`, `va_testing`) to the **V2** row. The SOP row is orphaned — no station
can reach it. Every VA station therefore grades against left-to-right and
room-length calibration.

## Open questions for SNEC

See the drafted email. Numbered Q1–Q5 there map to sections A1–A5 below.

## A. Blocked — conflict-dependent

### A1. Test distance
- `tests/fixtures/procedure_checklists.json:796` — V2 row, "calibrated according to room length"
- `tests/fixtures/procedure_checklists.json:910` — SOP row, "testing distance is 4m"
- `cases/case_oa_002_iop_va.json:44,79` — "4 metres" (SOP-aligned)
- `cases/case_ot_011_modified_logmar_va_testing.json:46,55` — "calibrated working distance"
- `cases/case_psa_006_logmar_va_adult_new_patient.json:43,51` — "calibrated room distance"
- `cases/case_psa_001_logmar_child.json:43,83` — "3 metres" / "3 or 6 metres" — **matches neither**
- `workflows/ophthalmology_kb.md:156` — "Standard testing distance: 6 metres" — **matches neither**
- `tools/flashcards/static_cards.py:909,934` — teaches 6 m as the test distance — **matches neither**
- `tools/flashcards/static_cards.py:940` — card is built on the V2 phrase "calibrated according to room length"
- `tools/flashcards/static_cards.py:956` — "largest LogMAR line at 6m" — **matches neither**

Not in scope (different instrument, 6 m is standard for a Snellen projector):
`cases/case_psa_007_snellen_va_pinhole.json:42,50`.

### A2. Reading direction — app is 100% V2 (left to right)
- `tests/fixtures/procedure_checklists.json:796` — V2 row
- `tests/fixtures/procedure_checklists.json:916` — SOP row (right to left)
- `cases/case_ot_011_modified_logmar_va_testing.json:58`
- `cases/case_psa_006_logmar_va_adult_new_patient.json:53`
- `workflows/ophthalmology_kb.md:169`

### A3. Low-vision ladder below 6/60
- `cases/case_oa_037_logmar_low_vision_progression.json` — follows the SOP ladder
- `tools/flashcards/static_cards.py:925,926` — mixed version

### A4. Orange-sticker occluder (V2 only, absent from SOP)
- `tools/flashcards/static_cards.py:935,955`

### A5. Which checklist governs the station
- `tools/cases/resolve_checklist.py:51-52`

## B. Both sources agree — no change needed

Right eye first by convention · read ALL 5 letters before progressing · lines
6/48, 6/38, 6/30 · notation `VR 6/19 +2 (0.5) with gls` · pinhole when vision is
6/12 & above · CF → HM → PL → NPL · alcohol-wipe the occluder before **and** after ·
2 patient identifiers · check the doctor's order · record date/time/readings in EMR.

## C. Independent defect — SOP row is truncated

The `(SOP)` row stops at step 18 ("Repeat the test for the Left eye"). The source
SOP continues past that point and those steps were dropped on ingestion:

- §4.2.13 Wipe occluder with alcohol wipes after the procedure
- §4.2.14 Discard all wastes into the waste bag and perform hand hygiene
- §4.3.1 Record the date / time / distance vision readings onto the patient's EMR notes
- §4.3.2 Doctor to examine patient's eyes after the procedure

Fixing this is faithfulness to the SOP, not a conflict call — but the row may be
merged or retired depending on SNEC's answer, so it is staged with the rest.

## Once SNEC answers

1. Reconcile the two Supabase `checklists` rows; re-run `tools/kb/snapshot_checklists.py`.
2. Repoint or leave `resolve_checklist.py:51`.
3. Sweep A1–A4 above.
4. Re-ingest the KB if the losing document should stop being cited by the tutor
   (both PDFs are currently in the RAG corpus, so the tutor can quote either).
5. Regression test pinning the agreed distance + reading direction, per `/ship-check`.
