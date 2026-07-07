# OSCE Patient-Face Archetype Library — design spec

> RICOE v2 · §8 paid-art pass (patient-faces half only). The logo→Selena raster
> variation is explicitly **out of scope** here — it breaks the locked mono
> Spark-Eye global logo and needs its own brief.
>
> Brainstormed with Caleb 2026-07-07. Locked scope decisions:
> archetype library (not per-patient), Nano-Banana **flash** model, **warm
> semi-realistic** style, **patient faces only** this pass.

---

## 1. Problem statement

Every OSCE virtual-patient station (155 cases, 150 unique patients) currently shows
the **same generic person-outline SVG** as the patient's conversation pfp
(`PatientChat.tsx`, the `.aurora-pane-dot`). The student takes a history from "Mdm
Lee Siew Poh, 68" but sees an anonymous icon. Giving each patient a face that
matches their demographics makes the encounter feel real and is the last unshipped
piece of RICOE v2's §8 art pass.

Generating 150 unique faces is unnecessary cost and QA effort. Patients cluster
tightly by Singapore's CMIO demographics, so a **small archetype library** mapped
deterministically to each patient gives every station a plausible, dignified face
at a fraction of the cost and review burden.

## 2. Goals & non-goals

**Goals**
- A small (~26) library of warm, semi-realistic Singaporean patient portraits.
- A **pure, deterministic** classifier mapping any case's patient → an archetype id.
- Cheap, go-ahead-gated, MOCK_MODE-safe generation mirroring the existing
  `generate_sprites.py` discipline.
- Frontend surfacing that refines **within** the OSCE lock (static talking-head),
  with a graceful fallback so nothing depends on the paid step landing.

**Non-goals**
- Per-patient unique faces (rejected: cost + QA).
- The logo→Selena raster variation (§8 other half — separate brief, breaks a lock).
- Uniforms / clinical scene art (excluded until Caleb asks).
- Any redesign of the locked OSCE station beyond swapping the pfp.
- Animation on the patient face (OSCE lock = *static* talking-head).

## 3. Locked decisions (2026-07-07 brainstorm)

| # | Decision | Value |
|---|----------|-------|
| P1 | Face strategy | **Archetype library** (~26), deterministic demographic mapping — not per-patient. |
| P2 | Model | **Nano-Banana flash** (`gemini-3.1-flash-image`) — matches the flash-default rule. |
| P3 | Style | **Warm semi-realistic** — softly-rendered, photo-like, dignified; not hyperreal, not cartoon. |
| P4 | Scope | **Patient faces only** this pass; logo→Selena deferred to its own brief. |
| P5 | Ship order | **Placeholders first** — commit labelled placeholders + wire the frontend green, then fire paid gen and swap in real faces. |

## 4. The archetype library (26)

Keyed by **ethnicity × gender × age-band**:

- **Ethnicity** {`chinese`, `malay`, `indian`} — Singapore CMIO majority set.
- **Gender** {`male`, `female`} — from `patient.gender`.
- **Age-band** {`young` 18–39, `middle` 40–59, `senior` 60–74, `elderly` 75+}.

3 × 2 × 4 = **24 adult archetypes**, plus **2 children** (`child_boy`, `child_girl`)
for the 8 paediatric cases (`age < 16`). Total **26**.

Archetype id format: `{ethnicity}_{gender}_{band}` (adults) or `child_{boy|girl}`.
Asset path: `frontend/public/patients/{archetype_id}.webp`.

**Ambiguity handling** (sensitive heuristic — kept conservative, default-safe):
names that don't match a Malay/Indian pattern default to `chinese` (SG's largest
group). "Others"/Eurasian patients therefore map to the nearest available
archetype rather than getting a wrong ethnicity guess; this is logged, never
crashes, and is documented as a known limitation.

## 5. Backend

### 5.1 Classifier — `tools/patients/archetypes.py` (pure, no I/O)
- `ARCHETYPES: dict[str, Archetype]` — server-authoritative registry: id →
  `{ label, ethnicity, gender, band, prompt }`. The single source of truth for
  valid ids, used to render, to validate, and to generate.
- `classify_patient(patient: dict) -> str` — returns an archetype id:
  - `gender` ← `patient["gender"]` (fallback: infer from the honorific
    `Mr`/`Mdm`/`Ms`/`Master`/`Miss`; final fallback `male`).
  - `band` ← `patient["age"]` (`<16` → child; else the four adult bands).
  - `ethnicity` ← `_classify_ethnicity(patient["name"])`:
    - Malay: tokens `bin`, `binte`, `bte`, or a Malay-Muslim given name set
      (`Muhammad`, `Nur`, `Siti`, `Ahmad`, `Farah`, …).
    - Indian: tokens `s/o`, `d/o`, or a Tamil/Indian surname set
      (`Rajasekaran`, `Pillai`, `Nair`, `Kumar`, `Raj`, …).
    - Else `chinese`.
  - Returns `child_boy`/`child_girl` when band is child.
- `face_path(archetype_id) -> str` → `"/patients/{id}.webp"`; the public URL a
  browser loads.
- **Invariants**: pure, deterministic, no network, never raises on odd input
  (unknown → default-safe id). Mirrors the WAT "deterministic Python tool" model.

### 5.2 Serve the face — `tools/api/routers/cases.py`
- Add `face: str` to the `CasePatientInfo` Pydantic model.
- Populate it via `archetypes.face_path(archetypes.classify_patient(case["patient"]))`
  at all three construction sites (`get_cases`, `get_case`, `get_case_station`).
- No new endpoint, no DB, no per-request generation — the id is computed from the
  already-loaded case JSON. Single source of truth stays in Python.

### 5.3 Generation script — `tools/patients/generate_faces.py`
Mirrors `tools/avatar/generate_sprites.py` exactly:
- `--estimate` — prints every archetype prompt + count + rough cost. **Zero API calls.**
- `--generate [--only a,b]` — the **paid** path. Refuses in MOCK_MODE. Uses
  `generate_sprites.generate_image_bytes(prompt, model=flash, reference=False)`
  (no Iris anchor — patients are not the mascot). Writes to `.tmp/patient-faces/`.
- `--install` — copies reviewed `.tmp/patient-faces/*` into
  `frontend/public/patients/` (optionally re-encoding to `.webp`).
- **Prompt contract** (per archetype, warm semi-realistic):
  > "A warm, semi-realistic portrait of a {band-phrase} {ethnicity} Singaporean
  > {man|woman|boy|girl}, friendly approachable expression, soft even studio
  > lighting, plain warm-neutral background, head-and-shoulders, facing the
  > camera, dignified and natural. Softly rendered photorealism — not hyperreal,
  > not a cartoon. No text, no border, no watermark."
  - band-phrase: young→"adult in their late twenties/thirties", middle→"in their
    fifties", senior→"in their late sixties", elderly→"in their late seventies",
    child→"around 8 years old".
- Output goes to gitignored `.tmp/`; nothing auto-commits.

## 6. Frontend

### 6.1 Placeholders (ship first)
A tiny committed set: 26 labelled placeholder `.webp` tiles (soft warm gradient +
the archetype label text), clearly marked as placeholders, in
`frontend/public/patients/`. Lets the whole surface ship + pass the harness before
any paid image exists.

### 6.2 Surfacing (refine within the OSCE lock)
- `PatientChat` pane head (`.aurora-patient-head`): replace the generic person SVG
  in `.aurora-pane-dot` with a circular `<img src={patient.face}>` (warm ring,
  `object-fit: cover`), with **graceful fallback to the existing SVG** on load
  error or missing field.
- Same face on the `CaseSession` consult header card (`.aurora-station-nm` block).
- CSS: static, circular, framed; 390px-safe; no motion (OSCE lock).
- `alt` text = the patient name for a11y.

## 7. Verification gate

- **pytest**: classifier unit tests (known names → expected ethnicity/gender/band,
  honorific fallback, child band, default-safe on junk); **coverage test** — every
  case in `cases/*.json` resolves to a registered archetype id;
  `generate_faces --estimate` smoke (no calls, prints 26 prompts).
- **frontend**: `npm run typecheck && npm run build`.
- **station harness**: asserts the patient pane renders a face `<img>` and that the
  SVG fallback still works when the asset is absent.
- **after paid install**: screenshot review of all 26 real faces for dignity +
  correctness; a behavioral check that a known station (e.g. Mdm Lee, 68) shows the
  expected-demographic face.
- **prod green** before any push to `main`.

## 8. Risks & mitigations

- *Ethnicity-from-name is a sensitive heuristic* → conservative rules, default-safe
  to the majority group, logged, documented as a known limitation; never a wrong
  guess that crashes. Reviewed in the face screenshots.
- *Paid step fails / drifts* → placeholders-first means the surface is already
  green and functional; real faces swap in behind a fallback.
- *Cross-image inconsistency across 26 flash renders* → one shared style contract +
  one review pass; regenerate individual archetypes with `--only` as needed.
- *Cost* → ~26 flash images (~$1–$2); `--estimate` confirms before any spend.

## 9. Sequencing (atomic, independently shippable)

1. **Classifier + registry** (`archetypes.py`) + TDD + coverage test. (pure backend)
2. **Serve `face`** on `CasePatientInfo` + tests. (backend)
3. **Placeholders + frontend surfacing** + station-harness assertion. (frontend)
4. **Generation script** (`generate_faces.py`) + `--estimate` smoke. (tooling)
5. **Paid gen → review → install** real faces → screenshot verify. (paid, go-ahead)

Steps 1–4 are keyless-green and ship first; step 5 is the single paid fire.

## 10. Open items

- Final band-phrase wording per archetype — settle in the generation script prompt.
- Whether to also show the face on the `Cases` selection cards — deferred; start
  with the station panes, revisit if it reads well.
