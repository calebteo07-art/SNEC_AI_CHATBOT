# Distance VA — three SNEC sources, two still conflict (PARTLY RESOLVED)

**Status:** narrowed. SNEC supplied a third document on 2026-08-03. No content shipped yet.
**Verified** against the `.docx` of all three sources, not against the ingested Supabase rows.

## The three documents

| | **A. SOP** `NU-PR-OPD-D0039` v03 | **B. PSA Checklist V2** | **C. Competency** `CC-D0008` |
|---|---|---|---|
| Type | Policy & Procedure, Nursing Dept | PSA skills practice checklist | Nursing competency assessment |
| Control | v03, rev 22 Feb 2024, Restricted/Sensitive | none — "V2" only in the filename | doc no. only; embeds slides dated 25 Sept 2020 |
| Supabase row | `Distance Vision Testing LogMAR (SOP)` | `Distance Vision Testing LogMAR` | **not ingested** |
| Test distance | "the testing distance should be **4m**" | "calibrated according to **room length**" | "calibrated according to **room length**" |
| Reading direction | "from **right to left**" | "from **left to right**" | "from **left to right**" |
| No letters at 6/60 | **no pinhole** → straight to 6/120 | **pinhole first** | **pinhole first** |
| At 6/120 | no pinhole step; no LogMAR value | pinhole attempt; **6/120 (1.3)** | pinhole attempt; **6/120 (1.3)** |
| Orange-sticker occluder | absent | **present** | absent |

**C sides with B against A on every procedural conflict (2 v 1).** C also carries two
slides marked "New slide added on 25 Sept 2020" that introduce the two extra pinhole
steps explicitly, so they are a deliberate 2020 training change, not drift.

## What remains genuinely open

1. **Reading direction.** A flat contradiction; both cannot be right. 2 v 1 for left to right.
2. **The two extra pinhole steps.** Added Sept 2020 (per C's slides), yet SOP v03 —
   revised **later**, Feb 2024 — omits them. Deliberate removal or an oversight?
3. **Test distance.** Possibly not a real conflict: the M&S Smart System scales letters
   to room length, so if the SNEC rooms are 4 m then A states the figure and B/C state
   the principle. Needs one-line confirmation.
4. **Orange-sticker occluder.** In B only. Current practice or superseded?
5. **Children.** C is titled "for Adults **& Children**" but contains no child-specific
   step anywhere in the body. `cases/case_psa_001_logmar_child.json` tests a child at
   **3 metres**, which matches no document.

## Uncontested and shippable: the Snellen ↔ LogMAR ladder

From C's embedded M&S screen captures. All three documents agree wherever they
overlap (A quotes 6/19 (0.5), 6/15 (0.4), 6/60 (1.0)). **The app currently has no
conversion table at all and never mentions 6/9.5.**

| Snellen | LogMAR | | Snellen | LogMAR |
|---|---|---|---|---|
| 6/7.5 | 0.1 | | 6/30 | 0.7 |
| 6/9.5 | 0.2 | | 6/38 | 0.8 |
| 6/12 | 0.3 | | 6/48 | 0.9 |
| 6/15 | 0.4 | | 6/60 | 1.0 |
| 6/19 | 0.5 | | 6/120 | 1.3 |
| 6/24 | 0.6 | | | |

M&S screen grouping: **Screen 1** 6/60, 6/48, 6/38 · **Screen 2** 6/30, 6/24, 6/19 ·
**Screen 3** 6/15, 6/12, 6/9.5, 6/7.5. Every line carries exactly 5 characters.

Note **6/9.5**, not 6/9 — the modified-LogMAR chart line differs from the familiar
Snellen 6/9. Several flashcards use 6/9.

## Live impact (unchanged)

`tools/cases/resolve_checklist.py:51` maps every VA keyword to the **B** row, so the
A row is orphaned and no station can reach it. If B/C win, the current routing is
already correct and only A's row needs retiring.

## File:line inventory — blocked until items 1–5 above are answered

### Test distance
- `tests/fixtures/procedure_checklists.json:796` (B row) · `:910` (A row)
- `cases/case_oa_002_iop_va.json:44,79` — "4 metres"
- `cases/case_ot_011_modified_logmar_va_testing.json:46,55` — "calibrated working distance"
- `cases/case_psa_006_logmar_va_adult_new_patient.json:43,51` — "calibrated room distance"
- `cases/case_psa_001_logmar_child.json:43,83` — "3 metres" / "3 or 6 metres" — **matches nothing**
- `workflows/ophthalmology_kb.md:156` — "6 metres" — **matches nothing**
- `tools/flashcards/static_cards.py:909,934,956` — teaches 6 m — **matches nothing**
- `tools/flashcards/static_cards.py:940` — built on B's "calibrated according to room length"

Out of scope (Snellen projector, 6 m is correct there): `cases/case_psa_007_snellen_va_pinhole.json:42,50`.

### Reading direction — app is 100% left to right, i.e. B/C
- `tests/fixtures/procedure_checklists.json:796` (B) · `:916` (A, right to left)
- `cases/case_ot_011_modified_logmar_va_testing.json:58`
- `cases/case_psa_006_logmar_va_adult_new_patient.json:53`
- `workflows/ophthalmology_kb.md:169`

### Low-vision ladder
- `cases/case_oa_037_logmar_low_vision_progression.json` — follows A's ladder
- `tools/flashcards/static_cards.py:925,926` — mixed

### Orange-sticker occluder
- `tools/flashcards/static_cards.py:935,955`

### Both A and B agree — no change needed
Right eye first · read ALL 5 before progressing · lines 6/48, 6/38, 6/30 · notation
`VR 6/19 +2 (0.5) with gls` · pinhole when vision is 6/12 & above · CF → HM → PL → NPL ·
alcohol-wipe before **and** after · 2 identifiers · check the doctor's order · record to EMR.

### A-only closing steps dropped on ingestion
The A row stops at step 18. The SOP continues: wipe occluder after (§4.2.13), discard
waste + hand hygiene (§4.2.14), record to EMR (§4.3.1), doctor examines (§4.3.2).

## Once the five questions are answered

1. Reconcile the Supabase `checklists` rows; ingest C if it becomes authoritative;
   re-run `tools/kb/snapshot_checklists.py`.
2. Repoint or leave `resolve_checklist.py:51`.
3. Sweep the inventory above.
4. Add the Snellen ↔ LogMAR ladder as new teaching content.
5. Re-ingest the KB so the tutor stops citing whichever document loses.
6. Regression test pinning the agreed distance + direction, per `/ship-check`.
