# OSCE Station — Station-100 scoring, Highlights/Watch-outs debrief, complete Action Palette — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the OSCE station's opaque `/40` four-domain score and four-paragraph debrief with a legible `/100` competency score and a short, polished Highlights/Watch-outs debrief, and turn the exam tray into a complete action palette with a clickable chip for every checklist step.

**Architecture:** A new pure module computes the `/100` from three traceable components (Thoroughness from critical-weighted checklist coverage, Technique and Judgment from the existing LLM domain scores, with a safety-gate cap on critical misses) and projects to the existing internal `/40` so progression/dashboards are untouched. The submit endpoint runs grading and a structured-JSON coaching call in parallel (3 LLM calls → 2). `build_actions` emits one merged chip per step; the frontend renders a phase-grouped palette and a redesigned result card.

**Tech Stack:** Python (FastAPI, pytest), google-genai (`ask` with `response_json_schema`), Next.js/React (TypeScript), Playwright harness (`station_assert.mjs`), CSS (aurora design tokens).

**Spec:** `docs/superpowers/specs/2026-06-23-osce-station-scoring-debrief-palette-design.md`

---

## File structure

**Create**
- `tools/cases/station_score.py` — pure Station-100 math (components, safety gate, verdict, `/40` projection).
- `tests/cases/test_station_score.py` — unit tests for the scoring math.
- `frontend/src/aurora/components/ActionPalette.tsx` — phase-grouped chip palette (replaces ExamTray usage).

**Modify**
- `tools/cases/examination_actions.py` — `build_actions` v2 (one merged chip per step, say/do, labels).
- `tests/cases/test_examination_actions.py` — rewrite for v2 behavior.
- `tools/cases/evaluate_response.py` — remove the `±1` management boost.
- `tools/api/routers/cases.py` — extend `DomainScore` + `ExaminationAction`, add `CoachingBlock`, compute Station-100 in `case_submit`, parallel coaching call, delete notes call.
- `tests/cases/test_station_endpoints.py` — update the action-shape assertion for v2.
- `frontend/src/aurora/screens/CaseSession.tsx` — interfaces, `sendMessage(text?)`, say/do `performAction`, redesigned `StationResult`, use `ActionPalette`.
- `frontend/src/aurora/aurora.css` — new debrief + palette styles.
- `frontend/tests/station_assert.mjs` + `frontend/tests/_mocks.mjs` — new station/submit shapes + assertions.

---

## Task 1: Station-100 scoring module (pure)

**Files:**
- Create: `tools/cases/station_score.py`
- Test: `tests/cases/test_station_score.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/cases/test_station_score.py
from tools.cases.station_score import compute_station_score, SAFETY_CAP

STEPS = [
    {"step_number": 1, "action": "Identify patient", "critical": True},
    {"step_number": 2, "action": "Hand hygiene", "critical": True},
    {"step_number": 3, "action": "Measure IOP", "critical": False},
    {"step_number": 4, "action": "Record in EMR", "critical": False},
]
FULL = {"history": 10, "investigations": 10, "diagnosis": 10, "management": 10}


def test_perfect_score_is_100_and_exam_ready():
    s = compute_station_score(FULL, STEPS, performed=[1, 2, 3, 4])
    assert s["thoroughness"] == 40
    assert s["technique"] == 30
    assert s["judgment"] == 30
    assert s["score_100"] == 100
    assert s["verdict"] == "Exam-ready"
    assert s["safe"] is True
    assert s["missed_critical"] == []
    assert s["total_score"] == 40  # round(100 * 0.4)


def test_thoroughness_is_critical_weighted():
    # Perform only the two critical steps (weight 2 each) = 4 of total weight 6.
    s = compute_station_score(FULL, STEPS, performed=[1, 2])
    assert s["thoroughness"] == round(40 * 4 / 6)  # 27


def test_safety_gate_caps_judgment_and_flags_missed_critical():
    # Miss critical step 2 (hand hygiene); judgment base 30 -> capped at 60%.
    s = compute_station_score(FULL, STEPS, performed=[1, 3, 4])
    assert s["safe"] is False
    assert "Hand hygiene" in s["missed_critical"]
    assert s["judgment"] == round(30 * SAFETY_CAP)  # 18


def test_pass_line_60_maps_to_24_over_40():
    # Construct a ~60 score: full coverage (40) + zero technique/judgment domains.
    zero = {"history": 0, "investigations": 0, "diagnosis": 0, "management": 0}
    s = compute_station_score(zero, STEPS, performed=[1, 2, 3, 4])
    assert s["score_100"] == 40  # only thoroughness
    assert s["verdict"] == "Keep practising"


def test_thoroughness_detail_text():
    s = compute_station_score(FULL, STEPS, performed=[1, 3, 4])
    assert s["thoroughness_detail"] == "3 of 4 steps · 1 of 2 critical missed"
    s2 = compute_station_score(FULL, STEPS, performed=[1, 2, 3, 4])
    assert s2["thoroughness_detail"] == "4 of 4 steps · all 2 critical done"


def test_empty_checklist_does_not_divide_by_zero():
    s = compute_station_score(FULL, [], performed=[])
    assert s["thoroughness"] == 0
    assert s["safe"] is True
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/cases/test_station_score.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'tools.cases.station_score'`

- [ ] **Step 3: Write the implementation**

```python
# tools/cases/station_score.py
"""Pure "Station 100" scoring for the OSCE station.

Builds one legible score out of 100 from three traceable components and projects
it back to the legacy /40 used for difficulty progression and staff dashboards:

    Thoroughness (0-40)  critical-weighted checklist coverage  (what you did)
    Technique    (0-30)  history + investigations              (how well)
    Judgment&safety(0-30) recognition + escalation, gated      (the clinical core)

A missed CRITICAL step caps Judgment & safety at SAFETY_CAP (real OSCE "critical
fail", softened for a learning tool) and raises a safety flag. Pure + deterministic.
"""

SAFETY_CAP = 0.6

_VERDICTS = (
    (85, "Exam-ready"),
    (70, "Solid"),
    (60, "Developing"),
    (0, "Keep practising"),
)


def _verdict(score_100: int) -> str:
    for threshold, label in _VERDICTS:
        if score_100 >= threshold:
            return label
    return "Keep practising"


def compute_station_score(domain_scores: dict, steps: list[dict], performed) -> dict:
    """Return the Station-100 score dict from LLM domain scores + checklist coverage.

    Args:
        domain_scores: {"history","investigations","diagnosis","management"} each 0-10.
        steps:         resolved checklist steps ({step_number, action, critical}).
        performed:     step numbers the student ticked.
    """
    performed_set = {int(n) for n in (performed or [])}

    earned = possible = 0
    crit_total = crit_done = done_steps = 0
    missed_critical: list[str] = []
    for s in steps:
        n = int(s.get("step_number", 0))
        crit = bool(s.get("critical"))
        w = 2 if crit else 1
        possible += w
        if crit:
            crit_total += 1
        if n in performed_set:
            done_steps += 1
            earned += w
            if crit:
                crit_done += 1
        elif crit:
            missed_critical.append(str(s.get("action", "")))

    thoroughness = round(40 * earned / possible) if possible else 0

    h = int(domain_scores.get("history", 0))
    inv = int(domain_scores.get("investigations", 0))
    technique = round(30 * (h + inv) / 20)

    dia = int(domain_scores.get("diagnosis", 0))
    mng = int(domain_scores.get("management", 0))
    safe = not missed_critical
    gate = 1.0 if safe else SAFETY_CAP
    judgment = round(30 * (dia + mng) / 20 * gate)

    score_100 = max(0, min(100, thoroughness + technique + judgment))

    if crit_total == 0:
        crit_detail = ""
    elif crit_done == crit_total:
        crit_detail = f"all {crit_total} critical done"
    else:
        crit_detail = f"{crit_total - crit_done} of {crit_total} critical missed"
    total_steps = len([s for s in steps])
    thoroughness_detail = f"{done_steps} of {total_steps} steps" + (f" · {crit_detail}" if crit_detail else "")

    return {
        "score_100": score_100,
        "thoroughness": thoroughness,
        "technique": technique,
        "judgment": judgment,
        "verdict": _verdict(score_100),
        "safe": safe,
        "missed_critical": missed_critical,
        "thoroughness_detail": thoroughness_detail,
        "total_score": round(score_100 * 0.4),
        "critical_hit": crit_done,
        "critical_total": crit_total,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/cases/test_station_score.py -q`
Expected: PASS (6 passed)

- [ ] **Step 5: Commit**

```bash
git add tools/cases/station_score.py tests/cases/test_station_score.py
git commit -m "feat(station): pure Station-100 scoring module (critical-weighted coverage + safety gate)"
```

---

## Task 2: `build_actions` v2 — one merged chip per step

**Files:**
- Modify: `tools/cases/examination_actions.py`
- Test (rewrite): `tests/cases/test_examination_actions.py`

- [ ] **Step 1: Rewrite the test for v2 behavior**

```python
# tests/cases/test_examination_actions.py
from tools.cases.examination_actions import build_actions

STEPS = [
    {"step_number": 1, "action": "Introduce self to patient", "category": "patient_education", "critical": False},
    {"step_number": 2, "action": "Identify the correct patient and check identity against 2 identifiers", "category": "patient_identification", "critical": True},
    {"step_number": 3, "action": "Performing 5 moments of hand hygiene", "category": "infection_control", "critical": True},
    {"step_number": 4, "action": "Before touching a patient", "category": "infection_control", "critical": True},
    {"step_number": 5, "action": "After touching a patient", "category": "infection_control", "critical": True},
    {"step_number": 6, "action": "Measure distance visual acuity with LogMAR", "category": "clinical_assessment", "critical": False},
    {"step_number": 7, "action": "Ask about patient complaints: Any trauma to the eye?", "category": "clinical_assessment", "critical": False},
]


def test_every_step_becomes_a_chip_nothing_missing():
    actions = build_actions({}, STEPS)
    covered = set()
    for a in actions:
        covered.update(a["satisfies_steps"])
    assert covered == {1, 2, 3, 4, 5, 6, 7}


def test_consecutive_same_label_steps_merge():
    actions = build_actions({}, STEPS)
    hh = next(a for a in actions if a["label"] == "Hand hygiene")
    # The "5 moments" parent + its two sub-rows collapse into one chip.
    assert set(hh["satisfies_steps"]) == {3, 4, 5}
    assert hh["mode"] == "do"


def test_process_steps_are_clickable_do_chips():
    actions = build_actions({}, STEPS)
    labels = {a["label"] for a in actions}
    assert "Introduce self" in labels
    assert "Identify patient" in labels


def test_history_question_is_a_say_chip_with_prompt():
    actions = build_actions({}, STEPS)
    ask = next(a for a in actions if a["mode"] == "say")
    assert ask["prompt_text"] == "Any trauma to the eye?"
    assert 7 in ask["satisfies_steps"]


def test_exam_step_reveals_its_finding():
    actions = build_actions({"va": {"right": "6/9", "left": "6/12"}}, STEPS)
    va = next(a for a in actions if 6 in a["satisfies_steps"])
    assert "6/9" in va["reveal_text"] and "6/12" in va["reveal_text"]


def test_blank_action_is_skipped():
    actions = build_actions({}, [{"step_number": 9, "action": "  ", "category": "clinical_", "critical": False}])
    assert actions == []
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/cases/test_examination_actions.py -q`
Expected: FAIL (old `build_actions` only emits finding chips, no `mode`/merge).

- [ ] **Step 3: Replace `examination_actions.py` with v2**

```python
# tools/cases/examination_actions.py
"""Build the OSCE action palette — one clickable chip for EVERY checklist step.

Each step becomes an action the student can click above the composer:
  - "do" steps (hand hygiene, identify patient, measure VA…) tick + post a
    performed note, and reveal a finding if the step maps to an examination_finding.
  - "say" steps (history questions) carry a patient-directed `prompt_text` the UI
    sends so the patient actually responds.
Consecutive chips that share the same (label, mode) merge, so split runs (e.g. the
"5 moments of hand hygiene" sub-rows) collapse into one chip that ticks them all.
Every non-blank step is covered — nothing is dropped. Pure + deterministic.
"""

FINDING_LABELS: dict[str, str] = {
    "va": "Test distance VA", "va_distance": "Test distance VA",
    "near_va": "Test near VA", "va_near": "Test near VA",
    "iop": "Measure IOP", "iop_nct": "Measure IOP",
    "anterior_segment": "Anterior segment", "fundus": "Fundus exam",
    "vital_signs": "Vital signs", "colour_vision": "Colour vision", "amsler": "Amsler grid",
}

_STEP_KEYWORDS: dict[str, tuple[str, ...]] = {
    "va": ("distance va", "visual acuity", "logmar", "snellen", "distance vision"),
    "near_va": ("near va", "near vision", "n chart", "near acuity"),
    "iop": ("iop", "tonometry", "intraocular pressure", "tonometer"),
    "anterior_segment": ("anterior segment", "slit lamp", "slit-lamp", "cornea"),
    "fundus": ("fundus", "retina", "optic disc", "dilated"),
    "vital_signs": ("blood pressure", "vital", "pulse"),
    "colour_vision": ("ishihara", "colour vision", "color vision"),
    "amsler": ("amsler",),
}
_ALIASES = {"va_distance": "va", "iop_nct": "iop", "va_near": "near_va"}

# Canonical short chip labels for "do" steps (first keyword match wins).
_LABEL_RULES: list[tuple[tuple[str, ...], str]] = [
    (("hand hygiene", "hand wash", "5 moments", "five moments", "moments of hand",
      "before touching", "after touching", "before clean procedure", "after body fluid",
      "patient surroundings"), "Hand hygiene"),
    (("wipe occluder", "occluder with alcohol"), "Wipe occluder"),
    (("disinfect", "wipe the essential parts", "disinfection of equipment"), "Disinfect equipment"),
    (("discard", "waste bag"), "Discard waste"),
    (("not allergic", "allerg"), "Check allergy"),
    (("doctor’s order", "doctor's order", "written order", "electronic order", "medication order", "doctor"), "Check doctor's order"),
    (("at least 2 identifiers", "identity against", "identify the correct patient", "identify patient"), "Identify patient"),
    (("patient name",), "Confirm name"),
    (("identification number", "date of birth", "address"), "Confirm NRIC / DOB"),
    (("introduce",), "Introduce self"),
    (("explain the procedure", "explain the purpose", "purpose and procedure", "purpose & procedure", "explain to the patient"), "Explain procedure"),
    (("consent",), "Take consent"),
    (("remove glasses", "contact lenses if worn"), "Remove glasses / CL"),
    (("prepare the appropriate eye drops", "prepare the eye drop"), "Prepare eye drops"),
    (("instil", "pull the lower lid"), "Instill drops"),
    (("pinhole",), "Pinhole test"),
    (("near vision", "near va"), "Test near VA"),
    (("distance vision", "distance va", "visual acuity", "logmar", "snellen"), "Test distance VA"),
    (("iop", "tonometry", "intraocular pressure"), "Measure IOP"),
    (("anterior segment", "slit lamp", "slit-lamp"), "Anterior segment"),
    (("fundus", "optic disc"), "Fundus exam"),
    (("ishihara", "colour vision", "color vision"), "Colour vision"),
    (("amsler",), "Amsler grid"),
    (("position", "chin and forehead", "chin rest"), "Position patient"),
    (("align", "focus the target", "acquisition"), "Align & focus"),
    (("validate the measurement", "validate the reading"), "Validate reading"),
    (("print",), "Print results"),
    (("record the date", "document the reading", "captured into", "record the"), "Document results"),
    (("monitor patient", "fixation loss"), "Monitor patient"),
    (("correct eye", "coloured sticker", "fall risk"), "Safety check"),
    (("ensure patient is comfortable", "patient is comfortable"), "Patient comfortable"),
    (("doctor to examine",), "Doctor to examine"),
    (("look upwards", "do not blink", "gaze at", "open both eyes", "look at the"), "Instruct patient"),
    (("listens attentively", "opening statement"), "Listen actively"),
]

_ASK_PREFIXES = ("ask", "asks", "enquire", "enquires")


def _reveal_text(value) -> str:
    if isinstance(value, dict):
        parts = [f"{s[0].upper()}: {value[s]}" for s in ("right", "left") if s in value]
        if parts:
            return " · ".join(parts)
        return " · ".join(f"{k}: {v}" for k, v in value.items())
    return str(value)


def _is_say(action: str) -> bool:
    a = action.strip().lower()
    return a.startswith(_ASK_PREFIXES) or "?" in a


def _say_prompt(action: str) -> str:
    if ":" in action:
        tail = action.rsplit(":", 1)[1].strip()
        if tail:
            return tail
    return action.strip()


def _say_label(prompt: str) -> str:
    p = prompt.strip().rstrip("?").strip()
    short = " ".join(p.split()[:5])
    return short[:30] or "Ask"


def _do_label(action: str, category: str) -> str:
    low = action.lower()
    for keywords, label in _LABEL_RULES:
        if any(kw in low for kw in keywords):
            return label
    head = action.split(":")[0].strip()
    short = " ".join(head.split()[:4]).rstrip(".,;:")
    return short[:34] or (category.replace("_", " ").title() if category else "Step")


def _finding_for_step(action: str, findings: dict) -> str:
    low = str(action).lower()
    for key, value in (findings or {}).items():
        canon = _ALIASES.get(key, key)
        keywords = _STEP_KEYWORDS.get(canon, (canon.replace("_", " "),))
        if any(kw in low for kw in keywords):
            return _reveal_text(value)
    return ""


def build_actions(examination_findings: dict, steps: list[dict]) -> list[dict]:
    """One chip per non-blank step; consecutive same-(label,mode) chips merge."""
    from tools.cases.phase_split import assign_phases

    phases = assign_phases(steps)
    raw: list[dict] = []
    for s, phase in zip(steps, phases):
        action = str(s.get("action", "")).strip()
        if not action:
            continue
        n = int(s.get("step_number", 0))
        if _is_say(action):
            prompt = _say_prompt(action)
            chip = {"label": _say_label(prompt), "mode": "say", "reveal_text": "", "prompt_text": prompt}
        else:
            chip = {
                "label": _do_label(action, str(s.get("category", ""))),
                "mode": "do",
                "reveal_text": _finding_for_step(action, examination_findings),
                "prompt_text": "",
            }
        chip.update({
            "step_number": n,
            "satisfies_steps": [n],
            "phase": int(phase),
            "critical": bool(s.get("critical", False)),
        })
        raw.append(chip)

    merged: list[dict] = []
    for a in raw:
        prev = merged[-1] if merged else None
        if prev and prev["label"] == a["label"] and prev["mode"] == a["mode"]:
            prev["satisfies_steps"] = sorted(set(prev["satisfies_steps"]) | set(a["satisfies_steps"]))
            prev["critical"] = prev["critical"] or a["critical"]
            if not prev["reveal_text"] and a["reveal_text"]:
                prev["reveal_text"] = a["reveal_text"]
        else:
            merged.append(a)

    for a in merged:
        a["key"] = f"s{a['satisfies_steps'][0]}"
    return merged
```

- [ ] **Step 4: Run to verify it passes**

Run: `python -m pytest tests/cases/test_examination_actions.py -q`
Expected: PASS (6 passed)

- [ ] **Step 5: Commit**

```bash
git add tools/cases/examination_actions.py tests/cases/test_examination_actions.py
git commit -m "feat(station): action palette covers every checklist step (say/do chips, merged runs)"
```

---

## Task 3: Remove the hidden ±1 management boost

**Files:**
- Modify: `tools/cases/evaluate_response.py:149-157`

- [ ] **Step 1: Delete the boost block**

In `evaluate_case`, replace:

```python
    # Boost management score for checklist compliance
    mgmt_score = int(domain_results["management"].get("score", 0))
    if critical_total > 0:
        compliance_ratio = critical_hit / critical_total
        if compliance_ratio >= 0.8 and mgmt_score < 10:
            mgmt_score = min(10, mgmt_score + 1)
        elif compliance_ratio < 0.5 and mgmt_score > 2:
            mgmt_score = max(0, mgmt_score - 1)
    domain_results["management"]["score"] = mgmt_score
```

with:

```python
    # Checklist compliance now drives Station-100 (Thoroughness + safety gate) in
    # tools/cases/station_score.py — no hidden per-domain nudge here.
    mgmt_score = int(domain_results["management"].get("score", 0))
```

- [ ] **Step 2: Run the cases suite to confirm nothing regressed**

Run: `python -m pytest tests/cases/ -q`
Expected: PASS (Task 5 updates `test_station_endpoints.py`; if run before Task 5, that file may fail on the action-shape assertion — acceptable, fixed in Task 5).

- [ ] **Step 3: Commit**

```bash
git add tools/cases/evaluate_response.py
git commit -m "refactor(station): drop hidden ±1 management boost (superseded by Station-100 safety gate)"
```

---

## Task 4: Submit endpoint — Station-100 + parallel coaching call

**Files:**
- Modify: `tools/api/routers/cases.py`

- [ ] **Step 1: Extend the response models**

In the model section, replace the `DomainScore` class with the extended version and add `CoachingBlock`:

```python
class DomainScore(BaseModel):
    history_score: int
    investigations_score: int
    diagnosis_score: int
    management_score: int
    history_feedback: str
    investigations_feedback: str
    diagnosis_feedback: str
    management_feedback: str
    total_score: int
    overall_feedback: str
    critical_hit: int = 0
    critical_total: int = 0
    # Station-100 (the student-facing model)
    score_100: int = 0
    verdict: str = ""
    thoroughness: int = 0
    technique: int = 0
    judgment: int = 0
    safe: bool = True
    missed_critical: list[str] = []
    thoroughness_detail: str = ""


class CoachingBlock(BaseModel):
    highlights: list[str] = []
    watch_outs: list[str] = []
    focus: str = ""
```

Add `coaching` to `CaseSubmitResponse`:

```python
class CaseSubmitResponse(BaseModel):
    result: DomainScore
    cards: list[Flashcard]
    mock_mode: bool
    debrief: str | None = None
    coaching: CoachingBlock = CoachingBlock()
    checklist_comparison: list[ChecklistStepResult] = []
    per_phase: list[PhaseSummary] = []
```

- [ ] **Step 2: Extend the `ExaminationAction` model for palette chips**

```python
class ExaminationAction(BaseModel):
    key: str
    label: str
    reveal_text: str
    satisfies_steps: list[int]
    mode: str = "do"
    prompt_text: str = ""
    phase: int = 2
    critical: bool = False
    step_number: int = 0
```

- [ ] **Step 3: Add the import + coaching schema near the top of the file**

Add to the imports block:

```python
from tools.cases.station_score import compute_station_score
```

Add a module-level constant after the imports:

```python
_COACHING_SCHEMA = {
    "type": "object",
    "properties": {
        "highlights": {"type": "array", "items": {"type": "string"}},
        "watch_outs": {"type": "array", "items": {"type": "string"}},
        "focus": {"type": "string"},
    },
    "required": ["highlights", "watch_outs", "focus"],
}
```

- [ ] **Step 4: Rewrite the body of `case_submit` from the grading section onward**

Replace everything in `case_submit` from the comment `# ── Launch the two independent Gemini calls concurrently` down to the final `return CaseSubmitResponse(...)` with:

```python
    # ── Build the coaching prompt up front: it needs only the transcript + the
    #    missed steps (NOT the numeric score), so grading and coaching run in
    #    parallel. The old separate "missed-step notes" call is folded in here.
    from tools.api.shared import _student_context_block
    try:
        _coach_ctx = await _student_context_block(student_id)
    except Exception:
        _coach_ctx = ""
    missed_actions = [c.action for c in checklist_comparison if not c.performed]
    coaching_system = (
        (_coach_ctx + "\n\n" if _coach_ctx else "")
        + "You are an ophthalmology clinical educator coaching an allied-health (OA/OT/PSA) "
        "student after an OSCE station. Return ONLY JSON: {\"highlights\":[..],\"watch_outs\":[..],"
        "\"focus\":\"..\"}. 2-3 highlights = concrete things they genuinely did well, drawn from the "
        "conversation. 2-3 watch_outs = the most important things to sharpen, each tied to a specific "
        "missed step and naming the clinical consequence in the same short phrase. focus = ONE sentence: "
        "the single most important thing for next time. Every item is a short phrase (~6-12 words), warm "
        "and specific. Reward triage/escalation within role; do not reward making a medical diagnosis."
    )
    coaching_messages = [{
        "role": "user",
        "content": (
            f"Case: {case['title']}\n"
            f"Findings submitted: {body.findings}\n"
            f"Recommendation submitted: {body.recommendation}\n"
            f"Steps the student missed: {', '.join(missed_actions) or 'none'}\n\n"
            "Conversation:\n" + "\n".join(
                f"{'Student' if m['role'] == 'user' else 'Patient'}: {m['content']}" for m in messages
            )
        ),
    }]

    grade_task = asyncio.create_task(
        asyncio.to_thread(evaluate_case, case, messages, student_id, body.performed_steps)
    )
    coaching_task = asyncio.create_task(asyncio.to_thread(
        ask,
        system_prompt=coaching_system,
        messages=coaching_messages,
        max_tokens=512,
        feature="debrief",
        model=MODEL,
        thinking_level="MEDIUM",
        response_json_schema=_COACHING_SCHEMA,
    ))

    try:
        raw_result = await grade_task
    except Exception:
        coaching_task.cancel()
        raise

    # ── Station-100: the legible score, computed from the SAME steps the student
    #    saw tick (the station-resolved checklist) so Thoroughness reconciles.
    score = compute_station_score(
        {
            "history": raw_result.get("history_score", 0),
            "investigations": raw_result.get("investigations_score", 0),
            "diagnosis": raw_result.get("diagnosis_score", 0),
            "management": raw_result.get("management_score", 0),
        },
        _cl_compare.get("steps", []),
        body.performed_steps,
    )

    await log_session(
        student_id=student_id,
        topic=f"Case: {case['title']}",
        messages=messages,
        token_count=0,
        model="mock" if MOCK_MODE else MODEL,
    )

    cards: list = []

    # Profile update: retention = score_100/100; missed-gap heuristic unchanged.
    try:
        from tools.profile.update_profile import update_profile
        missed = []
        for domain in ("history_feedback", "investigations_feedback", "diagnosis_feedback", "management_feedback"):
            feedback = raw_result.get(domain, "")
            if feedback and any(w in feedback.lower() for w in ("miss", "forgot", "lack", "no mention")):
                missed.append(f"{domain.replace('_feedback', '')} gap in {case['topic']}")
        await update_profile(
            student_id, topic=case["topic"], score=score["score_100"] / 100, new_missed_findings=missed,
        )
    except Exception:
        pass

    # Difficulty progression: pass at 60/100 (== 24/40).
    passed = score["score_100"] >= 60
    try:
        await log_case_completion(student_id, case_id, score["total_score"], passed)
    except Exception:
        pass

    audit_log("case_evaluated", student_id=student_id, feature="cases",
              detail=f"case_id={case['case_id']} score={score['score_100']}/100 "
                     f"checklist={score['critical_hit']}/{score['critical_total']}")

    # ── Coaching (best-effort): parse the structured JSON; never 500 the request.
    coaching = CoachingBlock()
    try:
        raw_coach = (await coaching_task or "").strip()
        if raw_coach.startswith("```"):
            raw_coach = raw_coach.split("```")[1]
            if raw_coach.startswith("json"):
                raw_coach = raw_coach[4:]
        data = json.loads(raw_coach)
        coaching = CoachingBlock(
            highlights=[str(x) for x in (data.get("highlights") or [])][:3],
            watch_outs=[str(x) for x in (data.get("watch_outs") or [])][:3],
            focus=str(data.get("focus") or ""),
        )
    except Exception:
        coaching = CoachingBlock()

    per_phase = _per_phase_summary(_cl_compare.get("steps", []), body.performed_steps)

    domain_fields = {k: raw_result.get(k, 0) for k in DomainScore.model_fields if k in raw_result}
    domain_fields.update({
        "total_score": score["total_score"],
        "score_100": score["score_100"],
        "verdict": score["verdict"],
        "thoroughness": score["thoroughness"],
        "technique": score["technique"],
        "judgment": score["judgment"],
        "safe": score["safe"],
        "missed_critical": score["missed_critical"],
        "thoroughness_detail": score["thoroughness_detail"],
        "critical_hit": score["critical_hit"],
        "critical_total": score["critical_total"],
    })
    return CaseSubmitResponse(
        result=DomainScore(**domain_fields),
        cards=[Flashcard(**c) for c in cards],
        mock_mode=MOCK_MODE,
        debrief=None,
        coaching=coaching,
        checklist_comparison=checklist_comparison,
        per_phase=[PhaseSummary(**p) for p in per_phase],
    )
```

> Note: the block that builds `checklist_comparison` and `missed_critical_actions` at the top of `case_submit` stays. `_cl_compare` is already assigned there; ensure it remains in scope (it is defined as `_cl_compare = _station_checklist(case)`). The old `notes_task`, the post-grade `debrief` prose call, and the `# ── Apply the missed-step notes` block are fully removed by this replacement.

- [ ] **Step 5: Run the API/cases suite**

Run: `python -m pytest tests/cases/ tests/api/ -q`
Expected: PASS except `test_station_endpoints.py` action-shape assertion (fixed in Task 5).

- [ ] **Step 6: Commit**

```bash
git add tools/api/routers/cases.py
git commit -m "feat(station): submit returns Station-100 + parallel structured coaching (3 calls -> 2)"
```

---

## Task 5: Fix the station-endpoints test for v2 actions

**Files:**
- Modify: `tests/cases/test_station_endpoints.py:44-47`

- [ ] **Step 1: Update the IOP action assertion**

Replace:

```python
    # examination action for IOP maps to step 2
    iop = next(a for a in data["examination_actions"] if a["key"] == "iop")
    assert 2 in iop["satisfies_steps"]
    assert "18 mmHg" in iop["reveal_text"]
```

with:

```python
    # every step is now a clickable chip; the IOP step (2) reveals its finding.
    iop = next(a for a in data["examination_actions"] if 2 in a["satisfies_steps"])
    assert "18 mmHg" in iop["reveal_text"]
    assert iop["mode"] == "do"
    covered = {n for a in data["examination_actions"] for n in a["satisfies_steps"]}
    assert covered == {1, 2, 3}  # nothing missing
```

- [ ] **Step 2: Run the full cases + api suite green**

Run: `python -m pytest tests/cases/ tests/api/ -q`
Expected: PASS (all)

- [ ] **Step 3: Commit**

```bash
git add tests/cases/test_station_endpoints.py
git commit -m "test(station): station endpoint asserts full-coverage v2 action palette"
```

---

## Task 6: Frontend — ActionPalette component

**Files:**
- Create: `frontend/src/aurora/components/ActionPalette.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";
/* ActionPalette — the complete "do something" tray for the OSCE station. Every
   checklist step is a clickable chip above the composer (nothing missing), grouped
   by phase. "do" chips perform the action (reveal a finding + tick); "say" chips
   ask the patient the question so they respond. A chip shows done once any of its
   steps is ticked. Presentational — all state is owned by the parent. */

export interface ExamAction {
  key: string;
  label: string;
  reveal_text: string;
  satisfies_steps: number[];
  mode: "do" | "say";
  prompt_text: string;
  phase: number;
  critical: boolean;
  step_number: number;
}

const PHASE_LABEL: Record<number, string> = { 1: "Prepare", 2: "Assess", 3: "Wrap up" };

export function ActionPalette({
  actions,
  ticked,
  busy,
  onPerform,
}: {
  actions: ExamAction[];
  ticked: Set<number>;
  busy: boolean;
  onPerform: (action: ExamAction) => void;
}) {
  if (actions.length === 0) return null;
  const phases = [1, 2, 3].filter((ph) => actions.some((a) => a.phase === ph));
  return (
    <div className="aurora-palette">
      <p className="aurora-station-tray-label">Actions · click to perform every step</p>
      <div className="aurora-palette-scroll">
        {phases.map((ph) => (
          <div key={ph} className="aurora-palette-group">
            <span className="aurora-palette-gl">{PHASE_LABEL[ph] ?? "Assess"}</span>
            <div className="aurora-palette-chips">
              {actions.filter((a) => a.phase === ph).map((a) => {
                const done = a.satisfies_steps.some((n) => ticked.has(n));
                const disabled = done || (a.mode === "say" && busy);
                return (
                  <button
                    key={a.key}
                    type="button"
                    className="aurora-pchip"
                    data-mode={a.mode}
                    data-done={done ? "true" : "false"}
                    data-crit={a.critical ? "true" : "false"}
                    disabled={disabled}
                    onClick={() => onPerform(a)}
                    aria-label={done ? `${a.label} — done` : `Perform ${a.label}`}
                    title={a.mode === "say" ? a.prompt_text : a.reveal_text || a.label}
                  >
                    <span className="ic" aria-hidden>{done ? "✓" : a.mode === "say" ? "“" : "+"}</span>
                    {a.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS (no new errors from this file)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/ActionPalette.tsx
git commit -m "feat(station): ActionPalette component — phase-grouped chip for every step"
```

---

## Task 7: Frontend — CaseSession wiring + redesigned StationResult

**Files:**
- Modify: `frontend/src/aurora/screens/CaseSession.tsx`

- [ ] **Step 1: Swap the import**

Replace:

```tsx
import { ExamTray, type ExamAction } from "@/aurora/components/ExamTray";
```

with:

```tsx
import { ActionPalette, type ExamAction } from "@/aurora/components/ActionPalette";
```

- [ ] **Step 2: Extend the result interfaces + add coaching state**

Replace the `DomainResult` interface with:

```tsx
interface DomainResult {
  history_score: number; investigations_score: number; diagnosis_score: number; management_score: number;
  history_feedback: string; investigations_feedback: string; diagnosis_feedback: string; management_feedback: string;
  total_score: number; overall_feedback: string; critical_hit: number; critical_total: number;
  score_100: number; verdict: string; thoroughness: number; technique: number; judgment: number;
  safe: boolean; missed_critical: string[]; thoroughness_detail: string;
}
interface Coaching { highlights: string[]; watch_outs: string[]; focus: string }
```

Add coaching state next to `const [debrief, setDebrief] = useState...`:

```tsx
  const [coaching, setCoaching] = useState<Coaching | null>(null);
```

In `handleSubmit`, after `setDebrief(data.debrief ?? null);` add:

```tsx
      setCoaching(data.coaching ?? null);
```

- [ ] **Step 3: Make `sendMessage` accept an optional explicit text (for say-chips)**

Change the signature and the two lines that read/clear the input:

```tsx
  const sendMessage = async (textArg?: string) => {
    const content = (textArg ?? input).trim();
    if (!content || sending || isStreaming || !caseId) return;
    const updated = [...messages, { role: "user", content } as ChatMessage];
    setMessages(updated);
    if (textArg === undefined) setInput("");
    setSending(true);
```

(The rest of `sendMessage` is unchanged.)

- [ ] **Step 4: Branch `performAction` on mode**

Replace `performAction` with:

```tsx
  const performAction = useCallback((a: ExamAction) => {
    if (a.satisfies_steps.some((n) => tickedRef.current.has(n))) return;
    if (a.mode === "say" && a.prompt_text) {
      void sendMessage(a.prompt_text);   // patient actually answers → observe ticks
      addAuto(a.satisfies_steps);        // the asking itself satisfies the step
      return;
    }
    setPerformedActions((prev) => new Set(prev).add(a.key));
    setMessages((prev) => [...prev, { role: "user", content: `${EXAM_PREFIX}${a.label} → ${a.reveal_text || "done"}]` }]);
    addAuto(a.satisfies_steps);
    scheduleObserve();
  }, [addAuto, scheduleObserve]);
```

> `sendMessage` is declared with `const` below `performAction`; since `performAction` is a `useCallback` whose body calls `sendMessage` at click time (not render time), reorder so `sendMessage` is defined above `performAction`, or keep `performAction` as a plain function. Simplest: move the `performAction` definition to just after `sendMessage`.

- [ ] **Step 5: Replace the `<ExamTray .../>` usage with `<ActionPalette .../>`**

Replace:

```tsx
              <ExamTray actions={station.examination_actions} performed={performedActions} onPerform={performAction} />
```

with:

```tsx
              <ActionPalette actions={station.examination_actions} ticked={ticked} busy={sending || isStreaming} onPerform={performAction} />
```

- [ ] **Step 6: Update the `StationData` action type + `StationResult` call**

In `interface StationData`, change `examination_actions: ExamAction[];` (already imported type — no change needed if the import provides the extended shape). Then replace the `{result && <StationResult ... />}` line with:

```tsx
            {result && <StationResult result={result} coaching={coaching} onMore={() => router.push("/cases")} onDash={() => router.push("/dashboard")} />}
```

- [ ] **Step 7: Replace the `StationResult` function entirely**

Replace the whole `function StationResult(...) { ... }` (and the now-unused `DomainResult` bar imports of `ProgressBar`/`DOMAINS`/`PHASE_CLASS`/`ChecklistStepResult`/`PhaseSummary` may be removed if unused) with:

```tsx
/* Station-100 debrief — count-up score /100 + verdict, pass-line meter, safety
   badge, three traceable component cards, and the short Highlights / Watch-outs
   lists with one focus line. Neat, scannable, CSS-only motion. */
const VERDICT_TONE: Record<string, string> = {
  "Exam-ready": "great", "Solid": "good", "Developing": "ok", "Keep practising": "low",
};
const COMPONENTS: { key: "thoroughness" | "technique" | "judgment"; label: string; max: number; sub: string }[] = [
  { key: "thoroughness", label: "Thoroughness", max: 40, sub: "Steps completed" },
  { key: "technique", label: "Technique", max: 30, sub: "History & examination" },
  { key: "judgment", label: "Judgment & safety", max: 30, sub: "Recognition & escalation" },
];

function StationResult({ result, coaching, onMore, onDash }: {
  result: DomainResult; coaching: Coaching | null; onMore: () => void; onDash: () => void;
}) {
  const { ref, display } = useCountUp<HTMLSpanElement>(result.score_100, { format: (n) => String(Math.round(n)) });
  const tone = VERDICT_TONE[result.verdict] ?? "ok";
  const missedOne = result.missed_critical[0];
  return (
    <div className="aurora-station-result" data-tone={tone}>
      <div className="aurora-s100-head">
        <div>
          <p className="aurora-eyebrow">Station complete</p>
          <span className="aurora-s100-verdict">{result.verdict}</span>
        </div>
        <span className="aurora-s100-score"><span ref={ref}>{display}</span><small>/100</small></span>
      </div>

      <div className="aurora-s100-meter" aria-hidden>
        <div className="aurora-s100-fill" style={{ width: `${result.score_100}%` }} />
        <div className="aurora-s100-passline" />
      </div>
      <p className="aurora-s100-meter-cap">Pass line 60 · {result.score_100 >= 60 ? "you passed this station" : `${60 - result.score_100} to pass`}</p>

      <div className={`aurora-s100-safety ${result.safe ? "is-safe" : "is-flag"}`}>
        <span aria-hidden>{result.safe ? "🛡" : "⚠"}</span>
        {result.safe
          ? "Safety check passed — no critical steps missed."
          : `Critical step missed: ${missedOne ?? "a must-do safety step"}.`}
      </div>

      <div className="aurora-s100-comps">
        {COMPONENTS.map((c) => {
          const pts = result[c.key];
          return (
            <div key={c.key} className="aurora-s100-comp">
              <div className="aurora-s100-comp-top"><span>{c.label}</span><b>{pts}<small>/{c.max}</small></b></div>
              <div className="aurora-s100-bar"><div style={{ width: `${(pts / c.max) * 100}%` }} /></div>
              <span className="aurora-s100-comp-sub">{c.key === "thoroughness" ? result.thoroughness_detail : c.sub}</span>
            </div>
          );
        })}
      </div>

      {coaching && (coaching.highlights.length > 0 || coaching.watch_outs.length > 0) && (
        <div className="aurora-s100-coach">
          <div className="aurora-s100-col is-good">
            <p className="aurora-s100-col-h">✓ What you did well</p>
            <ul>{coaching.highlights.map((h, i) => <li key={i} style={{ animationDelay: `${i * 70}ms` }}>{h}</li>)}</ul>
          </div>
          <div className="aurora-s100-col is-watch">
            <p className="aurora-s100-col-h">⚠ To sharpen next time</p>
            <ul>{coaching.watch_outs.map((w, i) => <li key={i} style={{ animationDelay: `${i * 70}ms` }}>{w}</li>)}</ul>
          </div>
        </div>
      )}

      {coaching?.focus && (
        <div className="aurora-s100-focus"><b>One thing for next time:</b> {coaching.focus}</div>
      )}

      <div className="aurora-station-result-actions">
        <button type="button" className="aurora-toggle" onClick={onMore}>More patients</button>
        <button type="button" className="aurora-station-submit-go" onClick={onDash}>Back to dashboard</button>
      </div>
    </div>
  );
}
```

> Remove the now-unused `checklistComparison`/`perPhase`/`debrief` rendering state only if it is no longer referenced; the `setChecklistComparison`/`setPerPhase` calls in `handleSubmit` may remain harmlessly. Delete the unused `DOMAINS`, `PHASE_CLASS`, `ProgressBar` import, `ChecklistStepResult`/`PhaseSummary` interfaces if `tsc` flags them as unused.

- [ ] **Step 8: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS (resolve any unused-symbol errors by deleting the dead code noted above)

- [ ] **Step 9: Commit**

```bash
git add frontend/src/aurora/screens/CaseSession.tsx
git commit -m "feat(station): Station-100 debrief + say/do palette wiring in CaseSession"
```

---

## Task 8: Frontend — CSS for the debrief + palette

**Files:**
- Modify: `frontend/src/aurora/aurora.css`

- [ ] **Step 1: Append the new style block**

Add at the end of the station section of `aurora.css` (search for `.aurora-station-result` to place it nearby):

```css
/* ── Station-100 debrief ─────────────────────────────────────────── */
.aurora-s100-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
.aurora-s100-verdict { font-size:1.35rem; font-weight:650; letter-spacing:-.01em; }
.aurora-s100-score { font-size:2.9rem; font-weight:700; line-height:1; font-variant-numeric:tabular-nums; }
.aurora-s100-score small { font-size:1rem; font-weight:500; opacity:.55; margin-left:2px; }
.aurora-station-result[data-tone="great"] .aurora-s100-score,
.aurora-station-result[data-tone="great"] .aurora-s100-verdict { color:#0f9d6b; }
.aurora-station-result[data-tone="good"] .aurora-s100-score,
.aurora-station-result[data-tone="good"] .aurora-s100-verdict { color:#1aa3a3; }
.aurora-station-result[data-tone="ok"] .aurora-s100-score,
.aurora-station-result[data-tone="ok"] .aurora-s100-verdict { color:#b8791a; }
.aurora-station-result[data-tone="low"] .aurora-s100-score,
.aurora-station-result[data-tone="low"] .aurora-s100-verdict { color:#c2502f; }

.aurora-s100-meter { position:relative; height:8px; border-radius:999px; background:rgba(0,0,0,.08); margin:14px 0 4px; overflow:hidden; }
.aurora-s100-fill { height:100%; border-radius:999px; background:currentColor; color:#1aa3a3; transition:width .9s cubic-bezier(.2,.8,.2,1); }
.aurora-station-result[data-tone="great"] .aurora-s100-fill { color:#0f9d6b; }
.aurora-station-result[data-tone="ok"] .aurora-s100-fill { color:#d99524; }
.aurora-station-result[data-tone="low"] .aurora-s100-fill { color:#d8623b; }
.aurora-s100-passline { position:absolute; top:-3px; left:60%; width:2px; height:14px; background:rgba(0,0,0,.4); }
.aurora-s100-meter-cap { font-size:.74rem; opacity:.6; margin:0 0 16px; }

.aurora-s100-safety { display:flex; align-items:center; gap:10px; padding:10px 14px; border-radius:12px; font-size:.86rem; margin-bottom:18px; }
.aurora-s100-safety.is-safe { background:rgba(29,158,117,.12); color:#0c6e51; }
.aurora-s100-safety.is-flag { background:rgba(216,90,48,.13); color:#9a3b1d; }

.aurora-s100-comps { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-bottom:20px; }
.aurora-s100-comp { background:rgba(0,0,0,.035); border-radius:12px; padding:12px 14px; }
.aurora-s100-comp-top { display:flex; justify-content:space-between; align-items:baseline; font-size:.82rem; }
.aurora-s100-comp-top b { font-size:1rem; font-weight:650; }
.aurora-s100-comp-top small { font-size:.72rem; opacity:.5; font-weight:500; }
.aurora-s100-bar { height:5px; border-radius:999px; background:rgba(0,0,0,.07); margin:8px 0 6px; overflow:hidden; }
.aurora-s100-bar > div { height:100%; border-radius:999px; background:#6a5cff; transition:width .9s cubic-bezier(.2,.8,.2,1); }
.aurora-s100-comp-sub { font-size:.72rem; opacity:.62; }

.aurora-s100-coach { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:16px; margin-bottom:18px; }
.aurora-s100-col-h { font-size:.8rem; font-weight:600; margin:0 0 8px; }
.aurora-s100-col.is-good .aurora-s100-col-h { color:#0f9d6b; }
.aurora-s100-col.is-watch .aurora-s100-col-h { color:#b8791a; }
.aurora-s100-col ul { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:7px; }
.aurora-s100-col li { font-size:.84rem; line-height:1.4; opacity:0; animation:s100rise .42s ease forwards; }
@keyframes s100rise { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }

.aurora-s100-focus { background:rgba(106,92,255,.1); color:#3d34a8; border-radius:12px; padding:12px 14px; font-size:.84rem; margin-bottom:18px; }
.aurora-s100-focus b { font-weight:650; }

/* ── Action palette ──────────────────────────────────────────────── */
.aurora-palette { margin-top:6px; }
.aurora-palette-scroll { display:flex; flex-direction:column; gap:8px; max-height:168px; overflow-y:auto; padding-right:2px; }
.aurora-palette-group { display:flex; align-items:flex-start; gap:8px; }
.aurora-palette-gl { flex:0 0 auto; font-size:.66rem; text-transform:uppercase; letter-spacing:.06em; opacity:.5; padding-top:6px; width:50px; }
.aurora-palette-chips { display:flex; flex-wrap:wrap; gap:6px; }
.aurora-pchip { display:inline-flex; align-items:center; gap:5px; font-size:.78rem; padding:5px 10px; border-radius:999px; border:1px solid rgba(0,0,0,.14); background:rgba(255,255,255,.7); cursor:pointer; transition:transform .12s, background .2s, border-color .2s; }
.aurora-pchip:hover:not(:disabled) { transform:translateY(-1px); border-color:rgba(106,92,255,.55); }
.aurora-pchip .ic { font-weight:700; opacity:.6; }
.aurora-pchip[data-mode="say"] { background:rgba(106,92,255,.07); }
.aurora-pchip[data-crit="true"]:not([data-done="true"]) { border-color:rgba(216,90,48,.5); }
.aurora-pchip[data-done="true"] { background:rgba(29,158,117,.13); border-color:transparent; color:#0c6e51; cursor:default; }
.aurora-pchip[data-done="true"] .ic { opacity:1; color:#0f9d6b; }
.aurora-pchip:disabled { cursor:default; }
```

> If the station uses a dark consult pane (recent `dark night theme` commit), verify these read well there; adjust the few hard-coded rgba/text colors to the pane's tokens if needed during the harness review.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/aurora/aurora.css
git commit -m "style(station): Station-100 debrief + action palette CSS"
```

---

## Task 9: Update the Playwright harness + mocks, run everything green

**Files:**
- Modify: `frontend/tests/station_assert.mjs`
- Modify: `frontend/tests/_mocks.mjs`

- [ ] **Step 1: Update the station mock in `station_assert.mjs`**

Replace the `examination_actions` array in the `/api/cases/C001/station` mock with a full palette (every step, with modes/phase):

```js
  examination_actions: [
    { key: "s1", label: "Identify patient", reveal_text: "", satisfies_steps: [1], mode: "do", prompt_text: "", phase: 1, critical: true, step_number: 1 },
    { key: "s2", label: "Explain procedure", reveal_text: "", satisfies_steps: [2], mode: "do", prompt_text: "", phase: 1, critical: false, step_number: 2 },
    { key: "s3", label: "Measure IOP", reveal_text: "IOP (NCT) · avg of 3 → R 18 mmHg · L 20 mmHg", satisfies_steps: [3], mode: "do", prompt_text: "", phase: 2, critical: true, step_number: 3 },
    { key: "s4", label: "Test distance VA", reveal_text: "Distance VA → R 6/9 · L 6/12", satisfies_steps: [4], mode: "do", prompt_text: "", phase: 2, critical: false, step_number: 4 },
    { key: "s5", label: "Document results", reveal_text: "", satisfies_steps: [5], mode: "do", prompt_text: "", phase: 3, critical: false, step_number: 5 },
    { key: "s6", label: "Advise on follow-up", reveal_text: "", satisfies_steps: [6], mode: "do", prompt_text: "", phase: 3, critical: false, step_number: 6 },
  ],
```

- [ ] **Step 2: Update the submit mock in `station_assert.mjs`**

Replace the `/api/cases/C001/submit` mock body with the new shape:

```js
await ctx.route("**/api/cases/C001/submit", (r) => r.fulfill(J({
  result: {
    history_score: 8, investigations_score: 7, diagnosis_score: 9, management_score: 6,
    history_feedback: "Thorough.", investigations_feedback: "Good.", diagnosis_feedback: "Correct.", management_feedback: "Reasonable.",
    total_score: 31, overall_feedback: "Strong consult.", critical_hit: 2, critical_total: 2,
    score_100: 78, verdict: "Solid", thoroughness: 31, technique: 24, judgment: 23,
    safe: true, missed_critical: [], thoroughness_detail: "5 of 6 steps · all 2 critical done",
  },
  cards: [], mock_mode: false,
  coaching: {
    highlights: ["Confirmed identity & consent early", "Clean NCT technique"],
    watch_outs: ["Document the follow-up interval", "Check VA before drops"],
    focus: "Always record a baseline acuity first.",
  },
  checklist_comparison: [], per_phase: [],
})));
```

- [ ] **Step 3: Update the harness assertions**

Replace assertion blocks 5, 7 with palette/Station-100 versions, and add a palette-coverage check. Replace the chunk from `// 5. clicking an exam chip` through the block 7 result assertions with:

```js
// 5. the palette renders a clickable chip for a process step (not just exam findings)
if (!(await p.locator('.aurora-pchip:has-text("Identify patient")').count())) die("palette missing the 'Identify patient' process chip");
if ((await p.locator('.aurora-pchip').count()) < 6) die("palette must expose a chip for every step");
ok("action palette exposes a chip for every step (process + exam)");

// 5a. clicking a "do" exam chip reveals the finding, ticks its step, marks chip done
await p.locator('.aurora-pchip:has-text("Measure IOP")').click();
await p.waitForSelector(".aurora-station-reveal", { timeout: 5000 });
if (!(await p.locator('.aurora-station-reveal:has-text("18 mmHg")').count())) die("reveal card missing IOP value");
if (!(await p.locator('.aurora-pchip[data-done="true"]:has-text("Measure IOP")').count())) die("exam chip did not become done");
if ((await p.locator('.aurora-station-step[data-ticked="true"]').count()) < 1) die("performing IOP did not tick its step row");
ok("do-chip reveals finding + ticks step + marks chip done");

// 6. sending a message streams a patient reply
await p.locator(".aurora-station-composer-input").fill("Good morning, can I confirm your name and NRIC?");
await p.locator(".aurora-station-composer-send").click();
await p.waitForFunction(() => document.querySelector(".aurora-station-thread")?.textContent?.includes("Good morning, doctor."), null, { timeout: 8000 });
ok("patient consult streams a reply");

// 7. submit → Station-100 debrief: /100 score, 3 component cards, Highlights/Watch-outs
await p.locator('.aurora-station-submit-toggle').click();
await p.locator('textarea[data-field="findings"]').fill("Stable IOP on repeat readings; no red flags. Routine review.");
await p.locator('textarea[data-field="recommendation"]').fill("Route as routine; document readings; advise to return if vision changes.");
await p.locator('.aurora-station-submit-go').click();
await p.waitForSelector(".aurora-station-result", { timeout: 10000 });
if (!(await p.locator('.aurora-s100-score:has-text("/100")').count())) die("result must show score out of 100");
if (!(await p.locator('.aurora-s100-verdict:has-text("Solid")').count())) die("result must show the verdict");
if ((await p.locator(".aurora-s100-comp").count()) !== 3) die("result must show 3 component cards");
if (!(await p.locator('.aurora-s100-safety.is-safe').count())) die("result must show the safety badge");
if (!(await p.locator('.aurora-s100-col.is-good li').count())) die("result must list highlights");
if (!(await p.locator('.aurora-s100-col.is-watch li').count())) die("result must list watch-outs");
ok("submit shows the Station-100 debrief (/100 + components + highlights/watch-outs)");
```

- [ ] **Step 4: Update `_mocks.mjs` (visual_sweep) station + submit**

In `frontend/tests/_mocks.mjs`, update the `**/api/cases/C001/station` `examination_actions` to include `mode/prompt_text/phase/critical/step_number` (same fields as Step 1; minimal: extend the single existing `iop` action with `mode:"do", prompt_text:"", phase:2, critical:false, step_number:2`), and replace the `**/api/cases/C001/submit` body with the new shape from Step 2 (score_100 + coaching). This keeps `visual_sweep.mjs` rendering the new debrief.

- [ ] **Step 5: Build the frontend and run the harness**

Run (per `project_harness_local_server`):
```bash
cd frontend && npm run build \
  && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/ \
  && (node .next/standalone/server.js & echo $! > /tmp/srv.pid) \
  && sleep 2 && node tests/station_assert.mjs http://127.0.0.1:3000 ; kill $(cat /tmp/srv.pid)
```
Expected: `ALL STATION ASSERTIONS PASSED`

- [ ] **Step 6: Commit**

```bash
git add frontend/tests/station_assert.mjs frontend/tests/_mocks.mjs
git commit -m "test(station): harness covers full palette + Station-100 debrief"
```

---

## Task 10: Full verification + ship

- [ ] **Step 1: Run the whole Python suite**

Run: `python -m pytest -q`
Expected: all green (prior baseline was 347 passing; new tests add to it).

- [ ] **Step 2: Run the frontend harness + a manual visual sweep**

Run: `cd frontend && MSYS_NO_PATHCONV=1 node tests/visual_sweep.mjs s100 http://127.0.0.1:3000 /cases` (after a fresh build; stop the server first if `.next/standalone` is locked) and eyeball the station + debrief screenshots.
Expected: clean render, no overflow, debrief reads neatly.

- [ ] **Step 3: Confirm the `±1` boost and old debrief are gone**

Run: `git grep -n "Boost management" tools/ ; git grep -n "What you did really well" tools/`
Expected: no matches (old prose debrief + boost removed).

- [ ] **Step 4: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill to merge `becky-speed` work to `main` (Render auto-deploys), or open a PR per the user's preference.

---

## Self-review

**Spec coverage**
- Part A (Station-100): Task 1 (math) + Task 4 (wired into submit, projection to /40, pass at 60). ✓
- Part B (debrief + parallel coaching, 3→2 calls): Task 4 (coaching call, parallel, notes folded in) + Task 7 (UI) + Task 8 (CSS). ✓
- Part C (complete palette, say/do, merge): Task 2 (build_actions) + Task 6 (component) + Task 7 (wiring). ✓
- Safety gate / removed ±1 boost: Task 1 + Task 3. ✓
- Tests: Tasks 1,2,5 (pytest), Task 9 (harness/mocks). ✓
- Constraints: total_score projection keeps progression (Task 4); `asyncio.to_thread` preserved (Task 4); harness mocks updated (Task 9). ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type consistency:** `compute_station_score` keys (`score_100`, `thoroughness`, `technique`, `judgment`, `verdict`, `safe`, `missed_critical`, `thoroughness_detail`, `total_score`, `critical_hit`, `critical_total`) are produced in Task 1 and consumed identically in Task 4 (`DomainScore`) and Task 7 (`DomainResult`). `ExamAction` fields (`mode`, `prompt_text`, `phase`, `critical`, `step_number`, `satisfies_steps`) match across Task 2 (Python), Task 4 (`ExaminationAction`), Task 6 (TS interface), and the Task 9 mocks. `Coaching`/`CoachingBlock` (`highlights`, `watch_outs`, `focus`) consistent across Task 4 and Task 7. ✓
