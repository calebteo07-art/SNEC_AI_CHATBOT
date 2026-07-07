# OSCE Patient-Face Archetype Library — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every OSCE virtual patient a demographically-matched face by deterministically mapping each case's patient to one of ~26 warm semi-realistic archetype portraits.

**Architecture:** A pure Python classifier (`tools/patients/archetypes.py`) maps a case `patient` dict → an archetype id from a server-authoritative registry. The cases router serves the derived face path on `CasePatientInfo`; the frontend renders it with a graceful fallback. A go-ahead-gated `generate_faces.py` (Nano-Banana **flash**, `reference=False`) produces the real art; committed PIL placeholders let the whole surface ship green first.

**Tech Stack:** Python 3.12 · FastAPI/Pydantic · pytest · Next.js/React/TS · Pillow (placeholders) · `tools/avatar/generate_sprites.py` (paid image core).

**Spec:** `docs/superpowers/specs/2026-07-07-osce-patient-faces-design.md`

---

## File structure

- Create `tools/patients/__init__.py` — package marker.
- Create `tools/patients/archetypes.py` — registry + pure classifier (Task 1).
- Create `tools/patients/make_placeholders.py` — PIL placeholder generator (Task 3).
- Create `tools/patients/generate_faces.py` — paid flash generation (Task 4).
- Create `tests/patients/__init__.py`, `tests/patients/test_archetypes.py` (Task 1),
  `tests/patients/test_generate_faces.py` (Task 4).
- Create `tests/api/test_cases_patient_face.py` (Task 2).
- Create `frontend/public/patients/*.webp` — 26 committed placeholders (Task 3).
- Modify `tools/api/routers/cases.py` — `CasePatientInfo.face` + `_patient_info` helper (Task 2).
- Modify `frontend/src/aurora/components/PatientChat.tsx` — face pfp + fallback (Task 3).
- Modify `frontend/src/aurora/screens/CaseSession.tsx` — type + pass face + left card src (Task 3).
- Modify `frontend/src/aurora/aurora.css` — `.aurora-pane-face` img styling (Task 3).
- Modify `frontend/tests/_mocks.mjs` + `frontend/tests/station_assert.mjs` — face assertion (Task 3).

---

## Task 1: Archetype registry + pure classifier

**Files:**
- Create: `tools/patients/__init__.py`
- Create: `tools/patients/archetypes.py`
- Test: `tests/patients/__init__.py`, `tests/patients/test_archetypes.py`

- [ ] **Step 1: Create the package marker**

Create `tools/patients/__init__.py`:

```python
"""Patient-facing OSCE assets — deterministic demographic → face-archetype mapping."""
```

- [ ] **Step 2: Write the failing test**

Create `tests/patients/__init__.py` (empty file), then `tests/patients/test_archetypes.py`:

```python
import glob
import json

from tools.patients import archetypes as A


def test_registry_has_26_archetypes():
    assert len(A.ARCHETYPES) == 26
    # 3 ethnicities x 2 genders x 4 adult bands + 2 children
    adults = [a for a in A.ARCHETYPES.values() if a.band != "child"]
    children = [a for a in A.ARCHETYPES.values() if a.band == "child"]
    assert len(adults) == 24
    assert len(children) == 2
    assert set(A.ARCHETYPES) >= {"chinese_female_senior", "indian_male_middle", "child_boy", "child_girl"}


def test_every_archetype_id_matches_its_key():
    for key, arch in A.ARCHETYPES.items():
        assert arch.id == key
        assert arch.prompt  # non-empty prompt for the generator


def test_classify_ethnicity_from_name():
    assert A.classify_patient({"name": "Mdm Lee Siew Poh", "age": 68, "gender": "female"}) == "chinese_female_senior"
    assert A.classify_patient({"name": "Mr Rajasekaran s/o Pillai", "age": 55, "gender": "male"}) == "indian_male_middle"
    assert A.classify_patient({"name": "Mr Muhammad Hafiz bin Yusof", "age": 30, "gender": "male"}) == "malay_male_young"
    assert A.classify_patient({"name": "Ms Farah binte Ahmad", "age": 45, "gender": "female"}) == "malay_female_middle"
    assert A.classify_patient({"name": "Mdm Nair Saraswathy", "age": 80, "gender": "female"}) == "indian_female_elderly"


def test_gender_falls_back_to_honorific_when_missing():
    assert A.classify_patient({"name": "Mr Tan Wee Kiat", "age": 50}).endswith("_male_middle")
    assert A.classify_patient({"name": "Mdm Wong Siok Tin", "age": 50}).endswith("_female_middle")


def test_age_bands_and_children():
    assert A.classify_patient({"name": "Master Nigel Lim", "age": 8, "gender": "male"}) == "child_boy"
    assert A.classify_patient({"name": "Miss Amy Lim", "age": 10, "gender": "female"}) == "child_girl"
    assert A.classify_patient({"name": "Mr X", "age": 25, "gender": "male"}) == "chinese_male_young"
    assert A.classify_patient({"name": "Mr X", "age": 59, "gender": "male"}) == "chinese_male_middle"
    assert A.classify_patient({"name": "Mr X", "age": 60, "gender": "male"}) == "chinese_male_senior"
    assert A.classify_patient({"name": "Mr X", "age": 75, "gender": "male"}) == "chinese_male_elderly"


def test_default_safe_on_junk():
    # never raises; always a registered id
    aid = A.classify_patient({})
    assert aid in A.ARCHETYPES


def test_face_path():
    assert A.face_path("chinese_female_senior") == "/patients/chinese_female_senior.webp"


def test_every_case_resolves_to_a_registered_archetype():
    files = glob.glob("cases/*.json")
    assert files, "no case files found — run from repo root"
    for f in files:
        case = json.load(open(f, encoding="utf-8"))
        aid = A.classify_patient(case["patient"])
        assert aid in A.ARCHETYPES, f"{f}: {aid} not registered"
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `python -m pytest tests/patients/test_archetypes.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'tools.patients.archetypes'`.

- [ ] **Step 4: Write the implementation**

Create `tools/patients/archetypes.py`:

```python
"""OSCE patient-face archetypes — deterministic demographic → face mapping.

Pure and server-authoritative (WAT: probabilistic AI reasons, deterministic code
executes). `ARCHETYPES` is the single source of valid ids, used to render, to
validate, and to generate. Ethnicity-from-name is a deliberately conservative,
default-safe heuristic (RICOE v2 §8 patient-faces spec): right for the vast
majority of Singaporean names, and when unsure it defaults to the largest group
rather than guessing wrong. It never raises.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Archetype:
    id: str
    label: str
    ethnicity: str   # chinese | malay | indian | any (children)
    gender: str      # male | female
    band: str        # young | middle | senior | elderly | child
    prompt: str      # warm semi-realistic portrait prompt for the flash generator


ETHNICITIES = ("chinese", "malay", "indian")
GENDERS = ("male", "female")
ADULT_BANDS = ("young", "middle", "senior", "elderly")

_BAND_PHRASE = {
    "young": "adult in their early thirties",
    "middle": "person in their early fifties",
    "senior": "person in their late sixties",
    "elderly": "elderly person in their late seventies",
}
_ETH_PHRASE = {"chinese": "Chinese", "malay": "Malay", "indian": "Indian"}


def _gender_noun(gender: str, band: str) -> str:
    if band == "child":
        return "boy" if gender == "male" else "girl"
    return "man" if gender == "male" else "woman"


def _adult_prompt(ethnicity: str, gender: str, band: str) -> str:
    noun = _gender_noun(gender, band)
    return (
        f"A warm, semi-realistic portrait of a {_BAND_PHRASE[band]} "
        f"{_ETH_PHRASE[ethnicity]} Singaporean {noun}, friendly approachable "
        "expression, soft even studio lighting, plain warm-neutral background, "
        "head-and-shoulders, facing the camera, dignified and natural. Softly "
        "rendered photorealism — not hyperreal, not a cartoon. No text, no "
        "border, no watermark."
    )


def _child_prompt(gender: str) -> str:
    noun = "boy" if gender == "male" else "girl"
    return (
        f"A warm, semi-realistic portrait of a Singaporean {noun} around eight "
        "years old, cheerful gentle expression, soft even studio lighting, plain "
        "warm-neutral background, head-and-shoulders, facing the camera, natural "
        "and friendly. Softly rendered photorealism — not hyperreal, not a "
        "cartoon. No text, no border, no watermark."
    )


def _build_registry() -> dict[str, Archetype]:
    reg: dict[str, Archetype] = {}
    for eth in ETHNICITIES:
        for g in GENDERS:
            for b in ADULT_BANDS:
                aid = f"{eth}_{g}_{b}"
                reg[aid] = Archetype(aid, f"{eth.title()} {g} {b}", eth, g, b, _adult_prompt(eth, g, b))
    for g in GENDERS:
        aid = "child_boy" if g == "male" else "child_girl"
        reg[aid] = Archetype(aid, f"Child {_gender_noun(g, 'child')}", "any", g, "child", _child_prompt(g))
    return reg


ARCHETYPES: dict[str, Archetype] = _build_registry()


# ── Classification (pure, default-safe) ───────────────────────────────────────

_MALAY_TOKENS = {"bin", "binte", "bte"}
_MALAY_NAMES = {
    "muhammad", "mohamed", "mohammad", "nur", "nurul", "siti", "ahmad", "farah",
    "hafiz", "yusof", "ismail", "abdullah", "aisyah", "faizal", "rahman", "hassan",
}
_INDIAN_NAMES = {
    "rajasekaran", "pillai", "nair", "kumar", "raj", "saraswathy", "devi",
    "krishnan", "ramasamy", "subramaniam", "anand", "priya", "suresh", "lakshmi",
}
_HONORIFIC_GENDER = {
    "mr": "male", "master": "male", "mdm": "female", "ms": "female",
    "miss": "female", "mrs": "female",
}


def _classify_ethnicity(name: str) -> str:
    low = name.lower()
    if "s/o" in low or "d/o" in low:
        return "indian"
    tokens = set(low.replace(".", "").split())
    if tokens & _MALAY_TOKENS or tokens & _MALAY_NAMES:
        return "malay"
    if tokens & _INDIAN_NAMES:
        return "indian"
    return "chinese"


def _classify_gender(patient: dict) -> str:
    g = str(patient.get("gender", "")).strip().lower()
    if g in ("male", "female"):
        return g
    parts = str(patient.get("name", "")).split()
    first = parts[0].lower().rstrip(".") if parts else ""
    return _HONORIFIC_GENDER.get(first, "male")


def _classify_band(age) -> str:
    try:
        a = int(age)
    except (TypeError, ValueError):
        a = 40
    if a < 16:
        return "child"
    if a < 40:
        return "young"
    if a < 60:
        return "middle"
    if a < 75:
        return "senior"
    return "elderly"


def classify_patient(patient: dict) -> str:
    """Map a case `patient` dict to a registered archetype id. Never raises."""
    band = _classify_band(patient.get("age"))
    gender = _classify_gender(patient)
    if band == "child":
        return "child_boy" if gender == "male" else "child_girl"
    ethnicity = _classify_ethnicity(str(patient.get("name", "")))
    return f"{ethnicity}_{gender}_{band}"


def face_path(archetype_id: str) -> str:
    """Public path a browser loads for an archetype face."""
    return f"/patients/{archetype_id}.webp"
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `python -m pytest tests/patients/test_archetypes.py -q`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add tools/patients/__init__.py tools/patients/archetypes.py tests/patients/__init__.py tests/patients/test_archetypes.py
git commit -m "feat(patients): archetype registry + deterministic classifier (ricoe §8)"
```

---

## Task 2: Serve the face path on `CasePatientInfo`

**Files:**
- Modify: `tools/api/routers/cases.py` (model at `:58-61`; sites at `:295-299`, `:414-418`, `:540-544`)
- Test: `tests/api/test_cases_patient_face.py`

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_cases_patient_face.py`:

```python
from tools.api.routers import cases


def test_patient_info_derives_face_path():
    info = cases._patient_info({"name": "Mdm Lee Siew Poh", "age": 68, "gender": "female",
                                "presenting_complaint": "Red eye"})
    assert info.face == "/patients/chinese_female_senior.webp"
    assert info.name == "Mdm Lee Siew Poh"
    assert info.age == 68
    assert info.presenting_complaint == "Red eye"


def test_patient_info_default_safe_face():
    info = cases._patient_info({"name": "Someone", "age": "n/a"})
    assert info.face.startswith("/patients/")
    assert info.face.endswith(".webp")


def test_model_has_face_field_default_empty():
    info = cases.CasePatientInfo(name="X", age=40, presenting_complaint="")
    assert info.face == ""
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m pytest tests/api/test_cases_patient_face.py -q`
Expected: FAIL — `AttributeError: module ... has no attribute '_patient_info'` (and the model has no `face`).

- [ ] **Step 3: Add the `face` field to the model**

In `tools/api/routers/cases.py`, change the `CasePatientInfo` model (currently lines 58-61):

```python
class CasePatientInfo(BaseModel):
    name: str
    age: int
    presenting_complaint: str
    face: str = ""   # public path to the demographic archetype face (ricoe §8)
```

- [ ] **Step 4: Add the `_patient_info` helper**

In `tools/api/routers/cases.py`, immediately after the `CasePatientInfo` class, add:

```python
def _patient_info(raw: dict) -> CasePatientInfo:
    """Build the API patient block from a raw case `patient` dict, deriving the
    demographic archetype face (deterministic, no I/O)."""
    from tools.patients import archetypes
    return CasePatientInfo(
        name=raw["name"],
        age=int(raw.get("age", 30)),
        presenting_complaint=raw.get("presenting_complaint", ""),
        face=archetypes.face_path(archetypes.classify_patient(raw)),
    )
```

- [ ] **Step 5: Route all three construction sites through the helper**

Replace the `patient=CasePatientInfo(...)` block at **each** of the three sites with the helper call.

Site A (`get_cases`, ~lines 295-299) — the raw dict is `c["patient"]`:

```python
            patient=_patient_info(c["patient"]),
```

Site B (`get_case`, ~lines 414-418) — raw dict is `case["patient"]`:

```python
        patient=_patient_info(case["patient"]),
```

Site C (`get_case_station`, ~lines 540-544) — raw dict is `case["patient"]`:

```python
            patient=_patient_info(case["patient"]),
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `python -m pytest tests/api/test_cases_patient_face.py -q`
Expected: PASS (3 tests).

- [ ] **Step 7: Run the full backend suite (no regressions)**

Run: `python -m pytest -q`
Expected: PASS (all prior tests still green + the new ones).

- [ ] **Step 8: Commit**

```bash
git add tools/api/routers/cases.py tests/api/test_cases_patient_face.py
git commit -m "feat(cases): serve demographic archetype face on CasePatientInfo (ricoe §8)"
```

---

## Task 3: Placeholders + frontend surfacing + harness

**Files:**
- Create: `tools/patients/make_placeholders.py`
- Create: `frontend/public/patients/*.webp` (26, generated by the script)
- Modify: `frontend/src/aurora/components/PatientChat.tsx`
- Modify: `frontend/src/aurora/screens/CaseSession.tsx` (type `:23`; pass prop `:419`; left card `:388`)
- Modify: `frontend/src/aurora/aurora.css`
- Modify: `frontend/tests/_mocks.mjs`, `frontend/tests/station_assert.mjs`

- [ ] **Step 1: Write the placeholder generator**

Create `tools/patients/make_placeholders.py`:

```python
#!/usr/bin/env python3
"""Generate clearly-marked placeholder patient faces for all archetypes.

Free + keyless (Pillow only). Draws a soft warm gradient tile with the archetype
label + a "PLACEHOLDER" band, so the frontend surface ships and passes the harness
before any paid Nano-Banana art exists (RICOE placeholders-first rule). The real
faces are produced later by generate_faces.py and overwrite these files.

Usage:  python tools/patients/make_placeholders.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

from tools.patients.archetypes import ARCHETYPES

OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "patients"
SIZE = 256


def _tile(label: str) -> Image.Image:
    img = Image.new("RGB", (SIZE, SIZE), (236, 230, 218))
    d = ImageDraw.Draw(img)
    for y in range(SIZE):  # warm vertical gradient
        t = y / SIZE
        d.line([(0, y), (SIZE, y)], fill=(int(216 - 20 * t), int(150 - 10 * t), int(123 - 8 * t)))
    d.ellipse([SIZE * 0.30, SIZE * 0.22, SIZE * 0.70, SIZE * 0.62], fill=(255, 255, 255))  # head
    d.rectangle([SIZE * 0.22, SIZE * 0.66, SIZE * 0.78, SIZE * 0.95], fill=(255, 255, 255))  # shoulders
    d.text((10, 8), "PLACEHOLDER", fill=(90, 40, 20))
    d.text((10, SIZE - 22), label, fill=(60, 30, 15))
    return img


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    for aid in ARCHETYPES:
        _tile(aid).save(OUT / f"{aid}.webp", "WEBP", quality=80)
    print(f"wrote {len(ARCHETYPES)} placeholders → {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Generate the placeholders**

Run: `python tools/patients/make_placeholders.py`
Expected: `wrote 26 placeholders → .../frontend/public/patients`. Confirm with `ls frontend/public/patients | wc -l` → `26`.

- [ ] **Step 3: Add the face type + pass it in `CaseSession.tsx`**

At `CaseSession.tsx:23`, extend the patient type:

```tsx
  patient: { name: string; age: number; presenting_complaint: string; face?: string };
```

At the left patient card (`:388`), use the face with the existing decorative plate as fallback:

```tsx
                <div className="aurora-station-ring"><img className="aurora-station-av" src={caseInfo.patient.face ?? PLATE.caseSession} alt={caseInfo.patient.name} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} /></div>
```

At the `<PatientChat ... />` call (`:418-419`), pass the face:

```tsx
        <PatientChat
          patientName={caseInfo?.patient.name ?? "Patient"}
          patientFace={caseInfo?.patient.face}
```

- [ ] **Step 4: Render the face pfp in `PatientChat.tsx`**

Add `patientFace?: string;` to the props interface (after `patientName: string;`), add `patientFace,` to the destructured params, and replace the `.aurora-pane-dot` SVG block with a face image that falls back to the SVG:

```tsx
        {/* Conversation pfp — the demographic archetype face (ricoe §8), SVG fallback. */}
        <span className="aurora-pane-dot aurora-pane-face" aria-hidden>
          {patientFace ? (
            <img src={patientFace} alt="" onError={(e) => { (e.currentTarget.style.display = "none"); }} />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          )}
        </span>
```

- [ ] **Step 5: Style the face pfp in `aurora.css`**

After the `.aurora-pane-dot svg` rule (`:1375`), add:

```css
.aurora-pane-face { overflow: hidden; }
.aurora-pane-face img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block; }
```

- [ ] **Step 6: Typecheck + build the frontend**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: no type errors; build succeeds. (If the Bash tool's cwd sticks in `frontend/`, reset it before other Bash calls — see the ricoe memory GOTCHA about `bash_guard.py` and a CWD-relative hook path.)

- [ ] **Step 7: Add the face to the station harness mock + assertion**

In `frontend/tests/_mocks.mjs` at the `/station` mock patient (~line 70), add a `face`:

```js
            patient: { name: "Mdm Tan", age: 64, presenting_complaint: "Acute pain with halos", face: "/patients/chinese_female_senior.webp" } },
```

In `frontend/tests/station_assert.mjs`, after the patient pane is present, add an assertion that the pfp renders the face image (find the existing patient-pane assertion block and add alongside it):

```js
  // ricoe §8 — the patient pfp shows the demographic archetype face.
  const faceSrc = await page.getAttribute('[data-testid="patient-pane"] .aurora-pane-face img', "src");
  assert(faceSrc && faceSrc.includes("/patients/"), `patient face img src = ${faceSrc}`);
```

- [ ] **Step 8: Run the station harness**

Run: `bash scripts/start-harness.sh station`
Expected: harness build → serve → assertions PASS (read the printed `HARNESS_EXIT=`/PASS lines, not a piped exit code). Kill any orphaned `:3000` node process first if a stale bundle is suspected (see memory GOTCHA).

- [ ] **Step 9: Commit**

```bash
git add tools/patients/make_placeholders.py frontend/public/patients frontend/src/aurora/components/PatientChat.tsx frontend/src/aurora/screens/CaseSession.tsx frontend/src/aurora/aurora.css frontend/tests/_mocks.mjs frontend/tests/station_assert.mjs
git commit -m "feat(osce): patient archetype face pfp + placeholders + harness (ricoe §8)"
```

---

## Task 4: Paid generation script (`generate_faces.py`) — keyless-green scaffold

**Files:**
- Create: `tools/patients/generate_faces.py`
- Test: `tests/patients/test_generate_faces.py`

- [ ] **Step 1: Write the failing test**

Create `tests/patients/test_generate_faces.py`:

```python
from tools.patients import generate_faces as G


def test_estimate_covers_every_archetype():
    rows = G.build_estimate()
    assert len(rows) == 26
    for aid, prompt in rows:
        assert aid and prompt
        assert "no text" in prompt.lower()


def test_uses_flash_model():
    # ricoe §8 P2: Nano-Banana flash, never pro.
    assert G.MODEL.endswith("flash-image")


def test_generate_refuses_in_mock_mode(monkeypatch):
    monkeypatch.setattr(G, "MOCK_MODE", True)
    import pytest
    with pytest.raises(RuntimeError):
        G.generate_one("chinese_male_young")
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m pytest tests/patients/test_generate_faces.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'tools.patients.generate_faces'`.

- [ ] **Step 3: Write the generator**

Create `tools/patients/generate_faces.py`:

```python
#!/usr/bin/env python3
"""OSCE patient faces via Nano Banana flash — PAID, go-ahead-gated (RICOE §8).

Mirrors tools/avatar/generate_sprites.py's cost discipline. Unlike the Selena
portraits, patient faces are NOT anchored to the Iris mascot (reference=False) —
they are warm, semi-realistic Singaporean patient portraits. Output lands in
.tmp/patient-faces/ for human review; --install copies approved faces into
frontend/public/patients/, overwriting the placeholders.

Usage:
    python tools/patients/generate_faces.py --estimate           # prints prompts, NO calls
    python tools/patients/generate_faces.py --generate [--only a,b]
    python tools/patients/generate_faces.py --install
"""
import argparse
import shutil
import sys
from pathlib import Path

from tools.avatar import generate_sprites
from tools.patients.archetypes import ARCHETYPES, face_path
from tools.shared.gemini_client import MOCK_MODE

MODEL = generate_sprites.MODELS["flash"]  # ricoe §8 P2 — flash only
PROJECT_ROOT = Path(__file__).resolve().parents[2]
TMP_DIR = PROJECT_ROOT / ".tmp" / "patient-faces"
PUBLIC_DIR = PROJECT_ROOT / "frontend" / "public" / "patients"


def build_estimate() -> list[tuple[str, str]]:
    """(archetype_id, prompt) for every archetype — the estimate/generate worklist."""
    return [(aid, arch.prompt) for aid, arch in ARCHETYPES.items()]


def generate_one(archetype_id: str) -> Path | None:
    """Render one archetype face (LIVE + PAID). Refuses in MOCK_MODE. Writes PNG/JPEG bytes."""
    if MOCK_MODE:
        raise RuntimeError("generate_one needs a live GEMINI_API_KEY; refusing to fabricate art in MOCK_MODE")
    arch = ARCHETYPES[archetype_id]
    data = generate_sprites.generate_image_bytes(arch.prompt, model=MODEL, reference=False)
    if not data:
        print(f"  [{archetype_id}] no image generated")
        return None
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    out = TMP_DIR / f"{archetype_id}.png"
    out.write_bytes(data)
    print(f"  [{archetype_id}] saved {out} ({len(data):,} bytes)")
    return out


def run_estimate() -> None:
    rows = build_estimate()
    print(f"ESTIMATE — {len(rows)} patient face(s) via {MODEL} (reference=False, warm semi-realistic)")
    print("Rough cost: flash image output bills a few cents each; confirm current pricing before the batch.\n")
    for aid, prompt in rows:
        print(f"— {aid}:\n    {prompt}\n")


def run_install() -> int:
    """Convert reviewed .tmp/patient-faces/*.png → frontend/public/patients/*.webp."""
    from PIL import Image
    srcs = sorted(TMP_DIR.glob("*.png"))
    if not srcs:
        print(f"nothing to install — {TMP_DIR} is empty (run --generate first)", file=sys.stderr)
        return 1
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    for src in srcs:
        aid = src.stem
        if aid not in ARCHETYPES:
            print(f"  skip {src.name} — not a known archetype")
            continue
        Image.open(src).convert("RGB").save(PUBLIC_DIR / f"{aid}.webp", "WEBP", quality=88)
        print(f"  installed {face_path(aid)}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate OSCE patient faces (paid; go-ahead only).")
    ap.add_argument("--estimate", action="store_true", help="Print prompts + count. No API calls.")
    ap.add_argument("--generate", action="store_true", help="Generate faces into .tmp/patient-faces/ (PAID).")
    ap.add_argument("--install", action="store_true", help="Copy reviewed faces into frontend/public/patients/.")
    ap.add_argument("--only", default="", help="Comma-separated archetype ids (default: all).")
    args = ap.parse_args()

    if args.install:
        return run_install()
    if not args.generate:
        run_estimate()
        return 0

    if MOCK_MODE:
        print("ERROR: no GEMINI_API_KEY (MOCK_MODE) — cannot generate real art.", file=sys.stderr)
        return 2
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    ids = [a for a in ARCHETYPES if not only or a in only]
    print(f"\nGENERATING {len(ids)} face(s) via {MODEL} into {TMP_DIR} …")
    ok = 0
    for aid in ids:
        try:
            if generate_one(aid):
                ok += 1
        except Exception as e:
            print(f"  [{aid}] FAILED: {type(e).__name__}: {str(e)[:300]}")
    print(f"\nDone: {ok}/{len(ids)} generated. Review {TMP_DIR} before --install.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python -m pytest tests/patients/test_generate_faces.py -q`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify `--estimate` runs keyless with no calls**

Run: `python tools/patients/generate_faces.py --estimate`
Expected: prints 26 archetype prompts, `via ...flash-image`, and exits 0. No network.

- [ ] **Step 6: Run the full backend suite**

Run: `python -m pytest -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tools/patients/generate_faces.py tests/patients/test_generate_faces.py
git commit -m "feat(patients): flash patient-face generator + estimate (ricoe §8, paid-gated)"
```

---

## Task 5: Paid generation → review → install (manual, on Caleb's go-ahead)

> This is the single paid fire. It is **not** run by an autonomous worker — a human
> invokes it and reviews the art. Caleb has pre-approved the spend; still show
> `--estimate` first and confirm before `--generate`.

- [ ] **Step 1: Show the estimate**

Run: `python tools/patients/generate_faces.py --estimate`
Confirm the 26 prompts read as warm, dignified, correct-demographic. Adjust
`archetypes.py` prompt wording if anything reads wrong, re-run.

- [ ] **Step 2: Generate the batch (PAID, flash)**

Requires a live `GEMINI_API_KEY` in `.env`.
Run: `python tools/patients/generate_faces.py --generate`
Expected: ~26 images into `.tmp/patient-faces/`. Regenerate any weak ones with
`--only chinese_male_senior,indian_female_young`.

- [ ] **Step 3: Human review**

Open `.tmp/patient-faces/`. Every face must be dignified, warm, plausibly the right
ethnicity/gender/age, no text/border/artefacts. Re-generate rejects with `--only`.

- [ ] **Step 4: Install (overwrites placeholders)**

Run: `python tools/patients/generate_faces.py --install`
Expected: 26 `frontend/public/patients/*.webp` overwritten with the real faces.

- [ ] **Step 5: Behavioral verify on the running app**

Rebuild + run the station harness (or the real app): open a known station (e.g. Mdm
Lee, 68 → `chinese_female_senior`) and confirm the pfp shows the expected face.
Run: `bash scripts/start-harness.sh station` — assertions PASS.

- [ ] **Step 6: Commit the real faces**

```bash
git add frontend/public/patients
git commit -m "feat(osce): install real Nano-Banana patient faces (ricoe §8 paid art)"
```

- [ ] **Step 7: Update the design-lock ledger**

Add a "Patient faces" entry to `docs/design-locks.md` recording the archetype axes,
the warm-semi-realistic style, the flash model, and the approved prompt contract
(per the generated-imagery standing rule: approved prompts get recorded). Commit.

---

## Self-review

- **Spec coverage**: §4 library → Task 1 registry (26). §5.1 classifier → Task 1.
  §5.2 serve face → Task 2. §5.3 generator → Task 4. §6.1 placeholders → Task 3
  Steps 1-2. §6.2 surfacing → Task 3 Steps 3-5. §7 verification → tests in every
  task + Task 3 Step 8 harness + Task 5 Step 5 behavioral. §8 risks (default-safe,
  placeholders-first, flash) → covered. All spec sections map to a task.
- **Placeholder scan**: no "TBD"/"handle edge cases"/"similar to" — every code step
  shows full code.
- **Type consistency**: `classify_patient`/`face_path`/`ARCHETYPES`/`Archetype`
  used identically across Tasks 1, 2, 4. `_patient_info` defined in Task 2, no other
  caller. `patientFace` prop / `.aurora-pane-face` class consistent across Task 3
  steps. `build_estimate`/`generate_one`/`MODEL` consistent in Task 4 test + impl.
- **Note**: `MOCK_MODE` is imported into `generate_faces` as a module global so the
  Task 4 `monkeypatch.setattr(G, "MOCK_MODE", True)` test works (it patches the
  binding the function reads).
```
