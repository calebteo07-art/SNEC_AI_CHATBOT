# OSCE case tiers — clinical-complexity & risk rebalance (2026-07-19)

## Why

Every case already carried a `difficulty` field and the Virtual Patients screen already
laid patients out as **Foundational → Developing → Advanced** (`Cases.tsx` TIERS, mapping
`beginner`/`intermediate`/`advanced`). But the library was badly skewed:

| Tier | OA | OT | PSA | **Total** |
|------|----|----|-----|-----------|
| Foundational (`beginner`) | 12 | 14 | 12 | **38** |
| Developing (`intermediate`) | 38 | 39 | 37 | **114** |
| Advanced (`advanced`) | 1 | 1 | 1 | **3** |

74% of cases sat in the middle and **each role had exactly one Advanced case**. The tiers
were also miscalibrated on *risk* — e.g. `case_oa_001` (acute angle-closure, a Category-1
emergency) and `case_oa_006` (battery-acid chemical injury) were both `beginner`.

## Decision

Re-classify all 155 cases into a real three-tier ladder by **clinical complexity & risk**.
The **stored keys stay `beginner`/`intermediate`/`advanced`** — the difficulty-unlock gate
in [`tools/api/routers/cases.py`](../../tools/api/routers/cases.py) and `test_case_access.py`
depend on them, and the UI already maps keys → nice labels. Students only ever see
Foundational / Developing / Advanced.

### Rubric (risk-dominant, applied per case)

- **Foundational** — routine, single well-defined procedure on a cooperative patient, no
  red flags, straightforward record-keeping (baseline VA/near-vision, NCT technique,
  Ishihara/Amsler screening, drop-instillation teaching, standard biometry/OCT capture).
- **Developing** — requires interpretation or multi-step reasoning, troubleshooting
  unreliable readings, moderate communication load (education, anxious/first-visit), or
  non-emergent escalation judgment (HVF/OCT/topography interpretation & monitoring, PAM,
  fall-risk assessment, most history-taking, red-eye differentials).
- **Advanced** — sight-threatening red-flag triage, safety-critical contraindications, or
  high-complexity interpretation on a difficult patient (AACG, CRAO, penetrating/chemical
  injury, hyphaema, retinal detachment, microbial keratitis, post-op endophthalmitis flag,
  narrow-angle-before-dilation, paediatric strabismus quantification, dense-media biometry,
  keratoconus/Fuchs, advanced perimetry).

## Result

| Tier | OA | OT | PSA | **Total** (was) |
|------|----|----|-----|-----------------|
| Foundational | 15 | 15 | 17 | **47** (38) |
| Developing | 26 | 29 | 22 | **77** (114) |
| Advanced | 10 | 10 | 11 | **31** (3) |

Advanced 3 → 31; the middle drops 74% → 50%; each role independently keeps a healthy ladder
(≥15 Foundational, ≥22 Developing, ≥10 Advanced) so the unlock gate stays satisfiable.
56 of 155 cases changed tier. Not equal thirds by design — allied-health work is genuinely
interpretation/education/safety-heavy, so Developing is legitimately the broadest band.

### Advanced tier (spelled out — these gate behind ≥2 Developing passes)

- **OA** — `oa_001` AACG triage · `oa_003` patient refuses indicated dilation · `oa_006`
  chemical injury · `oa_007` penetrating injury · `oa_016` AACG · `oa_017` hyphaema ·
  `oa_018` retinal detachment · `oa_020` microbial keratitis · `oa_030` narrow-angle
  contraindication · `oa_048` AACG (pain assessment).
- **OT** — `ot_003` topography keratoconus · `ot_005` endothelial (Fuchs) · `ot_018` GVF
  advanced glaucoma · `ot_032` Pentacam keratoconus · `ot_037` OCT troubleshoot through
  media opacity · `ot_042` A-scan dense cataract · `ot_043` endothelial low (Fuchs) ·
  `ot_045` paediatric esotropia (Hirschberg/Krimsky) · `ot_046` confrontation field,
  post-stroke hemianopia · `ot_051` wavefront aberrometry.
- **PSA** — `psa_005` PFAER high fall-risk · `psa_017` floaters/flashes w/ prior RD ·
  `psa_018` chemical splash · `psa_020` AACG red-flags · `psa_025` CL microbial keratitis ·
  `psa_032` alkali injury · `psa_033` penetrating injury · `psa_034` hyphaema · `psa_035`
  CRAO · `psa_037` post-op red eye (endophthalmitis flag) · `psa_039` narrow-angle
  contraindication.

The full Foundational/Developing assignment lives in the case JSON `difficulty` field and is
guarded by `tests/cases/test_case_tiers.py`.

## Consequences

- **Gate behaviour:** ~28 cases moved *up* (into Developing/Advanced), so they now sit
  behind the prerequisite passes. This is the intended pedagogical effect. It is graceful —
  no data migration; existing per-case pass records are untouched; a student simply clears
  the tier below to unlock.
- **No backend change.** Stored keys unchanged → gate logic and `test_case_access.py`
  untouched.

## Files

- `cases/*.json` — 56 `difficulty` values changed (value-only edits).
- `frontend/src/aurora/lib/tiers.ts` — new; single source of truth (`TIERS`, `tierLabel`).
- `frontend/src/aurora/screens/Cases.tsx` — import shared `TIERS` (drop local copy).
- `frontend/src/aurora/screens/CaseSession.tsx` — station HUD + export now show the tier
  label via `tierLabel()` instead of the raw stored key.
- `tests/cases/test_case_tiers.py` — new; validity + per-role ladder + gate-satisfiability
  + anti-dumping-ground guard.
