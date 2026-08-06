# Trainer reports P1 — data capture + analysis core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture the two things the reports need and cannot currently get (the per-step OSCE ledger, and what a student actually asked the tutor), then build the pure analysis core that turns raw rows into the six insights of the spec.

**Architecture:** Three pure Python modules in `tools/supervisor/` beside the analytics modules already there. `topic_map.py` owns the topic axis, `osce_analysis.py` owns cross-attempt analysis, `student_insight.py` assembles the payload. None does I/O, holds a clock, or calls AI — the endpoint reads the rows and passes them in. Two data changes feed them: migration 019 persists the checklist ledger, and the chat client starts sending a real consultation label.

**Tech Stack:** Python 3.12, pytest, FastAPI, Supabase (Postgres), TypeScript/React 19 (one small Tutor.tsx change).

**Spec:** [2026-08-06-trainer-reports-rebuild-design.md](../specs/2026-08-06-trainer-reports-rebuild-design.md). Section references below (§4.1 etc.) point at it.

**Out of scope for P1:** both HTML documents and the console rebuild. They are P2 and P3 and read this payload.

---

## File Structure

**Create**
| Path | Responsibility |
|------|----------------|
| `tools/db/migrations/019_case_progress_checklist_detail.sql` | Adds the nullable `checklist_detail` JSONB column |
| `tools/supervisor/topic_map.py` | Key normalisation, the knowledge × performance map, bands, flags, per-topic cohort means and contrast (§4.1, §4.5, §5) |
| `tools/supervisor/osce_analysis.py` | Mark-loss decomposition, repeat offenders, trajectory (§4.2–4.4) |
| `tools/supervisor/student_insight.py` | Consultation labels (§4.6) + the assembler that produces the one JSON payload |
| `tests/supervisor/test_topic_map.py` | |
| `tests/supervisor/test_osce_analysis.py` | |
| `tests/supervisor/test_student_insight.py` | |

**Modify**
| Path | Change |
|------|--------|
| `tools/supervisor/case_index.py:77-82` | Add `"topic"` to the index entry |
| `tools/shared/db.py:232-284` | `insert_case_result` gains `checklist_detail` |
| `tools/api/routers/cases.py` | `_persist_submit` writes the ledger; `case_submit` builds it |
| `tools/api/routers/chat.py:58` | Sanitise the client-supplied topic |
| `tools/api/routers/admin.py:776-949` | Read `card_rows` once, return `insight` |
| `frontend/src/aurora/screens/Tutor.tsx:163` | Send the consultation label |

---

## Task 1: Case topic on the case index

The station axis of the map needs `case_id → topic`. `get_case_index()` is already the cached, off-event-loop case→metadata map; it just doesn't carry the topic.

**Files:**
- Modify: `tools/supervisor/case_index.py:77-82`
- Test: `tests/supervisor/test_case_index.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/supervisor/test_case_index.py`:

```python
def test_classify_case_carries_the_raw_topic():
    """The station axis of the knowledge x performance map joins on the case's own topic
    string, not on the coarse topic-SET label -- flashcard topic_tags look like "tonometry",
    not like "history_taking"."""
    entry = classify_case({
        "case_id": "case_oa_001_poag",
        "role": "OA",
        "topic": "Tonometry",
        "topic_set": "tonometry_iop",
        "difficulty": "beginner",
    })
    assert entry is not None
    assert entry["topic"] == "Tonometry"


def test_classify_case_topic_defaults_to_empty_not_missing():
    """An entry always HAS the key, so a consumer never has to distinguish 'no topic' from
    'old index shape'."""
    entry = classify_case({
        "case_id": "case_oa_002",
        "role": "OA",
        "topic_set": "tonometry_iop",
        "difficulty": "beginner",
    })
    assert entry is not None
    assert entry["topic"] == ""
```

If `classify_case` is not already imported at the top of that file, add it:

```python
from tools.supervisor.case_index import classify_case
```

(`tonometry_iop` is a real key from `sets_for("OA")`. `classify_case` fails closed on an
unknown `topic_set` and returns `None`, so an invented key would make both tests fail on the
`is not None` assertion rather than on the thing they test.)

- [ ] **Step 2: Run to verify it fails**

```bash
python -m pytest tests/supervisor/test_case_index.py -k topic -q
```

Expected: FAIL — `KeyError: 'topic'`.

- [ ] **Step 3: Add the field**

In `tools/supervisor/case_index.py`, change the return of `classify_case`:

```python
    return {
        "pool": case_pool(role),
        "set_key": set_key,
        "label": label_for(role, set_key),
        "difficulty": str(case.get("difficulty") or "beginner"),
        # The case's OWN topic, not the topic-SET label above. The knowledge x performance
        # map joins stations against flashcard topic_tags ("tonometry", "visual fields"),
        # and the set label ("Diagnostics & imaging") never matches one.
        "topic": str(case.get("topic") or ""),
    }
```

- [ ] **Step 4: Run to verify it passes**

```bash
python -m pytest tests/supervisor/test_case_index.py -q
```

Expected: PASS, and every pre-existing test in the file still passes.

- [ ] **Step 5: Commit**

```bash
git add tools/supervisor/case_index.py tests/supervisor/test_case_index.py
git commit -m "feat(analytics): carry the case's raw topic on the case index"
```

---

## Task 2: Migration 019 — the `checklist_detail` column

**Files:**
- Create: `tools/db/migrations/019_case_progress_checklist_detail.sql`
- Modify: `tools/db/migrations/APPLIED.md`

- [ ] **Step 1: Write the migration**

Create `tools/db/migrations/019_case_progress_checklist_detail.sql`:

```sql
-- Migration 019: the per-step OSCE ledger
-- Run via the /db-migrate skill or the Supabase SQL editor.
--
-- `compute_station_score` and the submit handler build a full per-step comparison for every
-- station -- which steps were performed, which were skipped, which were critical -- and then
-- throw it away. Only the aggregate `checklist_coverage` (0-40, migration 017) survived, so
-- the single most teachable artefact the platform produces was destroyed at the end of every
-- attempt and no trainer could ever reconstruct a run.
--
-- Shape (one object per step, in the station's own order):
--   [{"step_number": 3, "action": "Check allergy status", "phase": "Preparation",
--     "critical": true, "performed": false, "skipped": true}]
--
-- `phase` is stamped from the same `group_by_phase` helper /station uses, so a persisted
-- ledger groups exactly as the ledger the student saw on screen.
--
-- NULL means "this attempt predates the column", NEVER "this student performed no steps".
-- Deliberately NOT backfilled: the per-step record is not recoverable from anything that was
-- stored, and inventing one would assert a record we cannot verify -- the same reasoning
-- migration 017 records for not backfilling `grade_scale`.
--
-- Additive and nullable -> db.insert_case_result writes it when present and falls back to the
-- base four columns until this migration is applied.

ALTER TABLE case_progress
  ADD COLUMN IF NOT EXISTS checklist_detail JSONB;
```

- [ ] **Step 2: Verify no PG-incompatible DDL**

Read the file back and confirm it contains no `ADD CONSTRAINT IF NOT EXISTS` and no
`CREATE POLICY IF NOT EXISTS` (both are Postgres 42601 syntax errors). `ADD COLUMN IF NOT
EXISTS` is valid and is the form used by migrations 011 and 017.

- [ ] **Step 3: Commit**

```bash
git add tools/db/migrations/019_case_progress_checklist_detail.sql
git commit -m "feat(db): migration 019 — persist the per-step OSCE ledger"
```

- [ ] **Step 4: Apply it**

Use the `/db-migrate` skill. Do **not** paste the file path into the Supabase SQL editor —
paste the SQL itself. Then append the row to `tools/db/migrations/APPLIED.md` in the format
the existing rows use, and commit that separately.

---

## Task 3: `db.insert_case_result` accepts the ledger

**Files:**
- Modify: `tools/shared/db.py:232-284`
- Test: `tests/shared/test_db.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/shared/test_db.py`, in the `case_progress` section:

```python
@pytest.mark.asyncio
async def test_insert_case_result_writes_the_checklist_ledger():
    client = _make_client([])
    detail = [{"step_number": 1, "action": "Wash hands", "phase": "Preparation",
               "critical": False, "performed": True, "skipped": False}]
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=client)):
        await db.insert_case_result("stu-001", "case_1", 30, True, checklist_detail=detail)
    payload = client.table.return_value.insert.call_args[0][0]
    assert payload["checklist_detail"] == detail


@pytest.mark.asyncio
async def test_insert_case_result_omits_the_ledger_when_absent():
    """Omitted, not written as null -- the rich/base fallback keys on the payload having
    nothing extra to shed, and a null would make every legacy-path insert look 'rich'."""
    client = _make_client([])
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=client)):
        await db.insert_case_result("stu-001", "case_1", 30, True)
    payload = client.table.return_value.insert.call_args[0][0]
    assert "checklist_detail" not in payload
```

- [ ] **Step 2: Run to verify it fails**

```bash
python -m pytest tests/shared/test_db.py -k checklist_ledger -q
```

Expected: FAIL — `TypeError: insert_case_result() got an unexpected keyword argument 'checklist_detail'`.

- [ ] **Step 3: Add the parameter**

In `tools/shared/db.py`, add to the signature of `insert_case_result` after `grade_scale`:

```python
    grade_scale: int | None = None,
    checklist_detail: list | None = None,
```

And in the body, after the `grade_scale` block:

```python
    if grade_scale is not None:
        rich["grade_scale"] = grade_scale
    # Migration 019. `is not None`, so an empty ledger (a case that resolved zero steps) is
    # still written as [] and stays distinguishable from a pre-019 row, which is NULL.
    if checklist_detail is not None:
        rich["checklist_detail"] = checklist_detail
```

Extend the docstring's final paragraph with:

```
    `checklist_detail` is the per-step ledger (migration 019): which steps were performed,
    which were skipped, in the station's own phase grouping. NULL means the row predates the
    column, never that nothing was performed.
```

- [ ] **Step 4: Run to verify it passes**

```bash
python -m pytest tests/shared/test_db.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/shared/db.py tests/shared/test_db.py
git commit -m "feat(db): insert_case_result persists the per-step ledger"
```

---

## Task 4: Persist the ledger at submit

`case_submit` already builds `checklist_comparison` (a `list[ChecklistStepResult]`) and holds
`_skipped_set`. It needs the phase name per step, which `group_by_phase` provides from the same
resolved steps.

**Files:**
- Modify: `tools/api/routers/cases.py` (`_persist_submit`, and its call in `case_submit`)
- Test: `tests/api/test_case_submit_ledger.py` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_case_submit_ledger.py`:

```python
"""The per-step ledger reaches the database (migration 019).

The value of this test is the SHAPE: a trainer's report is rebuilt from these keys, so a
rename here is a silently broken report, not a failing render.
"""
import pytest

from tools.api.routers.cases import _build_checklist_detail


def test_build_checklist_detail_stamps_phase_performed_and_skipped():
    steps = [
        {"step_number": 1, "action": "Greet and identify the patient", "critical": False},
        {"step_number": 2, "action": "Check allergy status", "critical": True},
        {"step_number": 3, "action": "Document the reading", "critical": False},
    ]
    detail = _build_checklist_detail(steps, performed={1}, skipped={2})

    assert [d["step_number"] for d in detail] == [1, 2, 3]
    assert detail[0]["performed"] is True and detail[0]["skipped"] is False
    # Given up on: NOT performed, and flagged so a reader can tell it from never-reached.
    assert detail[1]["performed"] is False and detail[1]["skipped"] is True
    assert detail[1]["critical"] is True
    # Never reached: not performed, not skipped.
    assert detail[2]["performed"] is False and detail[2]["skipped"] is False
    # Every step carries a phase name, so the persisted ledger groups like the live one.
    assert all(d["phase"] for d in detail)


def test_build_checklist_detail_is_empty_for_a_stepless_checklist():
    """A degraded station that resolved no steps writes [] -- which is distinguishable from
    a pre-019 row (NULL). It must not raise."""
    assert _build_checklist_detail([], performed=set(), skipped=set()) == []
```

- [ ] **Step 2: Run to verify it fails**

```bash
python -m pytest tests/api/test_case_submit_ledger.py -q
```

Expected: FAIL — `ImportError: cannot import name '_build_checklist_detail'`.

- [ ] **Step 3: Write the helper**

In `tools/api/routers/cases.py`, add near `_fallback_coaching` (it is a pure function; keep it
with the other pure helpers, not inside the handler):

```python
def _build_checklist_detail(steps: list[dict], *, performed: set[int],
                            skipped: set[int]) -> list[dict]:
    """The per-step ledger persisted with the attempt (migration 019).

    Built from the SAME resolved steps and the SAME phase grouping /station serves, so a
    report rebuilt from this row groups exactly as the ledger the student watched. `skipped`
    is recorded alongside `performed=False` rather than instead of it: on the day they are the
    same outcome, and the distinction is only for whoever reviews the attempt later.
    """
    phase_of: dict[int, str] = {}
    for group in group_by_phase(steps):
        for s in group["steps"]:
            phase_of[int(s.get("step_number", 0))] = str(group["name"])
    detail: list[dict] = []
    for s in steps:
        n = int(s.get("step_number", 0))
        detail.append({
            "step_number": n,
            "action": str(s.get("action", "")),
            "phase": phase_of.get(n, ""),
            "critical": bool(s.get("critical", False)),
            "performed": n in performed,
            "skipped": n in skipped,
        })
    return detail
```

Confirm `group_by_phase` is imported in this module. If it is not, add it beside the other
`tools.cases` imports at the top:

```python
from tools.cases.phase_split import group_by_phase
```

- [ ] **Step 4: Run to verify it passes**

```bash
python -m pytest tests/api/test_case_submit_ledger.py -q
```

Expected: PASS.

- [ ] **Step 5: Thread it through persistence**

In `tools/api/routers/cases.py`, add a parameter to `_persist_submit` after `coaching: dict,`:

```python
    coaching: dict,
    checklist_detail: list[dict],
```

and pass it in the `log_case_completion` call, after `grade_scale=`:

```python
            grade_scale=score.get("grade_scale"),
            checklist_detail=checklist_detail,
```

- [ ] **Step 6: Build it at the call site**

In `case_submit`, the resolved checklist is already in scope as `_cl_compare` (inside the `try`
that builds `checklist_comparison`). Hoist the steps so they survive that block — immediately
before the `try`, add:

```python
    _cl_steps: list[dict] = []
```

and inside the `try`, right after `_cl_compare = await asyncio.to_thread(_station_checklist, case)`:

```python
        _cl_steps = list(_cl_compare.get("steps") or [])
```

Then where `_persist_submit` is scheduled as a background task, add the argument:

```python
        checklist_detail=_build_checklist_detail(
            _cl_steps, performed=performed_set, skipped=_skipped_set),
```

Find the exact call with:

```bash
grep -n "_persist_submit" tools/api/routers/cases.py
```

- [ ] **Step 7: Run the case suite**

```bash
python -m pytest tests/api/ tests/cases/ -q
```

Expected: PASS, including the existing submit tests. A failure naming `_persist_submit` means
a call site was missed — every call must pass the new argument.

- [ ] **Step 8: Commit**

```bash
git add tools/api/routers/cases.py tests/api/test_case_submit_ledger.py
git commit -m "feat(osce): persist the per-step ledger with each attempt"
```

---

## Task 5: The tutor consultation label

Every tutor session is logged with the constant `"Ophthalmology"` — `chat.py:58` defaults it and
the client never sends one. The client already derives a human label for its own recent-sessions
list (`tutorSessions.deriveTopic`); it should send that.

**Files:**
- Modify: `frontend/src/aurora/screens/Tutor.tsx:163`
- Modify: `tools/api/routers/chat.py`
- Test: `tests/api/test_chat_topic_label.py` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_chat_topic_label.py`:

```python
"""The consultation label is sanitised server-side.

`_build_student_findings` splits tutor sessions from station sessions on
`topic.startswith("Case:")`. Once the label is client-supplied, that discriminator is
forgeable by anything a student types into the chat box -- so the prefix is stripped here.
"""
from tools.api.routers.chat import sanitize_topic


def test_sanitize_topic_strips_a_forged_case_prefix():
    assert sanitize_topic("Case: my fake station") == "my fake station"
    assert sanitize_topic("  case:   spaced  ") == "spaced"


def test_sanitize_topic_truncates_to_the_column_bound():
    assert len(sanitize_topic("x" * 500)) == 100


def test_sanitize_topic_falls_back_to_the_sentinel_when_empty():
    """An empty label must not become an empty topic: the reader distinguishes 'recorded'
    from 'not recorded' by the sentinel, and an empty string reads as neither."""
    assert sanitize_topic("") == "Ophthalmology"
    assert sanitize_topic("   ") == "Ophthalmology"
    assert sanitize_topic("Case:") == "Ophthalmology"
```

- [ ] **Step 2: Run to verify it fails**

```bash
python -m pytest tests/api/test_chat_topic_label.py -q
```

Expected: FAIL — `ImportError: cannot import name 'sanitize_topic'`.

- [ ] **Step 3: Write the sanitiser**

In `tools/api/routers/chat.py`, above the request model that declares `topic`, add:

```python
# chat.py has always defaulted `topic` to this, so every tutor row written before the client
# started sending a real label carries it. It stays the default AND the empty-label fallback,
# so "Ophthalmology" means exactly one thing to a reader: no label was recorded.
TOPIC_SENTINEL = "Ophthalmology"


def sanitize_topic(raw: str) -> str:
    """Normalise a client-supplied consultation label.

    Strips a leading "Case:" — `_build_student_findings` separates tutor sessions from station
    sessions on that prefix, and a discriminator a student can type is not a discriminator.
    """
    text = " ".join(str(raw or "").split())
    if text.lower().startswith("case:"):
        text = text[len("case:"):].strip()
    return text[:100] if text else TOPIC_SENTINEL
```

- [ ] **Step 4: Run to verify it passes**

```bash
python -m pytest tests/api/test_chat_topic_label.py -q
```

Expected: PASS.

- [ ] **Step 5: Apply it at the log call**

In `tools/api/routers/chat.py`, change the `log_session` call (currently `topic=body.topic`):

```python
        topic=sanitize_topic(body.topic),
```

- [ ] **Step 6: Send the label from the client**

In `frontend/src/aurora/screens/Tutor.tsx`, the fetch body is currently
`JSON.stringify({ messages: apiMessages })`. The conversation's FIRST user message is the label
— not the latest — so a five-turn conversation groups under one heading instead of five.
`deriveTopic` already implements exactly that rule and is already imported in this file.

Immediately before the `fetch("/api/chat", …)` call, add:

```typescript
    // The consultation label staff see (spec §4.6). Same rule as the recent-sessions list:
    // the conversation's first user message, so every turn of one chat groups under one
    // heading. Reuses deriveTopic rather than restating the rule.
    const consultTopic = deriveTopic(
      messages.concat(userMsg).map((m) =>
        m.type === "ai" ? { type: "ai" as const, id: m.id, text: m.content }
                        : { type: "user" as const, id: m.id, text: m.text }),
    );
```

and change the body to:

```typescript
        body: JSON.stringify({ messages: apiMessages, topic: consultTopic }),
```

- [ ] **Step 7: Typecheck**

```bash
cd frontend && npm run typecheck
```

Expected: no errors. (If the worktree has no `node_modules`, set it up per the "Worktree per
session" block in CLAUDE.md first.)

- [ ] **Step 8: Commit**

```bash
git add tools/api/routers/chat.py tests/api/test_chat_topic_label.py frontend/src/aurora/screens/Tutor.tsx
git commit -m "feat(tutor): record what the student actually consulted about"
```

---

## Task 6: `topic_map.py` — key normalisation and the union of topics

This is the fix for the silent-drop defect: the three sources key their topics differently, and
the current report joins on the raw key.

**Files:**
- Create: `tools/supervisor/topic_map.py`
- Test: `tests/supervisor/test_topic_map.py`

- [ ] **Step 1: Write the failing test**

Create `tests/supervisor/test_topic_map.py`:

```python
"""The knowledge x performance map (spec §4.1)."""
from tools.supervisor.topic_map import norm_key, topic_union


def test_norm_key_collapses_the_three_namespaces():
    assert norm_key("Visual_Fields") == "visual fields"
    assert norm_key("  VISUAL   FIELDS  ") == "visual fields"
    assert norm_key("visual fields") == "visual fields"


def test_norm_key_is_empty_for_nothing():
    assert norm_key(None) == ""
    assert norm_key("   ") == ""


def test_topic_union_keeps_a_topic_present_in_only_one_source():
    """The defect this module exists to fix: the old report iterated retention_scores and
    looked flashcards up by that key, so a flashcard-only topic never appeared at all."""
    rows = topic_union(
        flashcards={"tonometry": 1},
        stations={"visual fields": 1},
        retention={"Gonioscopy": 1},
    )
    assert rows == ["gonioscopy", "tonometry", "visual fields"]


def test_topic_union_merges_the_same_topic_written_three_ways():
    rows = topic_union(
        flashcards={"visual_fields": 1},
        stations={"Visual Fields": 1},
        retention={"VISUAL FIELDS": 1},
    )
    assert rows == ["visual fields"]
```

- [ ] **Step 2: Run to verify it fails**

```bash
python -m pytest tests/supervisor/test_topic_map.py -q
```

Expected: FAIL — `ModuleNotFoundError: No module named 'tools.supervisor.topic_map'`.

- [ ] **Step 3: Write the module head**

Create `tools/supervisor/topic_map.py`:

```python
"""Topic-axis analysis for one student: the knowledge x performance map (spec §4.1, §4.5, §5).

Three sources measure a student on different axes and key their topics DIFFERENTLY --
flashcard `topic_tag`s, OSCE case `topic`s, and the `retention_scores` dict. The report this
replaces joined them on the raw key, so a namespace mismatch printed a dash and a
flashcard-only topic never appeared at all (AdminStudentDetail.tsx:103). Everything here goes
through `norm_key` first and the row set is the UNION, never one source's keys.

Pure: no I/O, no clock, no AI.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

# The two weak lines DIFFER on purpose. 65 is the flashcard weak line used everywhere else in
# the app (admin.py's weak filter, the console bar hues); 60 is the OSCE pass mark
# (sessionExport.PASS_MARK). Borrowing one for the other would restate a passing station as a
# failure, or forgive a failing one.
KNOWLEDGE_WEAK = 65.0
PERFORMANCE_WEAK = 60.0
STRONG = 75.0

# Below these an axis has a value but no verdict -- it is reported as `thin`, with its n.
MIN_CARDS = 5
MIN_ATTEMPTS = 1

_WS = re.compile(r"\s+")


def norm_key(raw: object) -> str:
    """Collapse a topic (or any text key) onto one comparable form."""
    return _WS.sub(" ", str(raw or "").strip().lower().replace("_", " ")).strip()


def topic_union(*, flashcards: dict, stations: dict, retention: dict) -> list[str]:
    """Every topic any source knows about, normalised, sorted. Sorted for determinism: the
    row order of a printed report must not depend on dict insertion order."""
    keys = set()
    for source in (flashcards, stations, retention):
        for raw in source:
            key = norm_key(raw)
            if key:
                keys.add(key)
    return sorted(keys)
```

- [ ] **Step 4: Run to verify it passes**

```bash
python -m pytest tests/supervisor/test_topic_map.py -q
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/supervisor/topic_map.py tests/supervisor/test_topic_map.py
git commit -m "feat(analytics): normalise the three topic namespaces onto one key"
```

---

## Task 7: Bands and the per-axis cells

**Files:**
- Modify: `tools/supervisor/topic_map.py`
- Test: `tests/supervisor/test_topic_map.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/supervisor/test_topic_map.py`:

```python
from tools.supervisor.topic_map import Cell, band_for, flashcard_cells, station_cells, retention_cells


def test_band_for_uses_the_axis_weak_line():
    # 62 is a PASS at a station (pass mark 60) and WEAK on flashcards (weak line 65).
    assert band_for(62.0, n=10, minimum=5, weak_line=60.0) == "developing"
    assert band_for(62.0, n=10, minimum=5, weak_line=65.0) == "weak"


def test_band_for_is_thin_below_the_minimum():
    """A value computed from 2 cards is reported WITH its n and no verdict -- 'weak' off two
    cards is a claim the data cannot support."""
    assert band_for(20.0, n=2, minimum=5, weak_line=65.0) == "thin"


def test_band_for_is_absent_with_no_data():
    assert band_for(None, n=0, minimum=5, weak_line=65.0) == "absent"


def test_flashcard_cells_grade_on_correctness_not_on_score():
    """`score` is an XP value with a combo multiplier (student.py:528). Averaging it would
    print a grade that rises with a student's answer STREAK."""
    rows = [
        {"topic_tag": "tonometry", "correct": True, "score": 24},
        {"topic_tag": "Tonometry", "correct": False, "score": 0},
        {"topic_tag": "tonometry", "correct": True, "score": 2},
    ]
    cells = flashcard_cells(rows)
    assert cells["tonometry"].value == 66.7
    assert cells["tonometry"].n == 3
    assert cells["tonometry"].band == "thin"   # n=3 < MIN_CARDS


def test_station_cells_average_the_hundred_scale_and_report_exclusions():
    rows = [
        {"case_id": "c1", "score_100": 80},
        {"case_id": "c1", "score_100": 60},
        {"case_id": "c9", "score_100": 10},    # not in the index -> unmapped
        {"case_id": "c1", "total_score": 30},  # pre-011 row, no /100 -> unscored
    ]
    cells, excl = station_cells(rows, {"c1": "Tonometry"})
    assert cells["tonometry"].value == 70.0
    assert cells["tonometry"].n == 2
    assert excl == {"unmapped_case": 1, "unscored": 1}


def test_retention_cells_scale_the_zero_to_one_dict():
    cells = retention_cells({"Visual_Fields": 0.42})
    assert cells["visual fields"].value == 42.0
    assert cells["visual fields"].band == "weak"
```

- [ ] **Step 2: Run to verify it fails**

```bash
python -m pytest tests/supervisor/test_topic_map.py -q
```

Expected: FAIL — `ImportError: cannot import name 'Cell'`.

- [ ] **Step 3: Implement**

Append to `tools/supervisor/topic_map.py`:

```python
@dataclass(frozen=True)
class Cell:
    """One measurement of one topic on one axis. `n` travels with `value` everywhere: a
    percentage without its denominator is not a finding."""
    value: float | None = None
    n: int = 0
    band: str = "absent"     # strong | developing | weak | thin | absent


def band_for(value: float | None, *, n: int, minimum: int, weak_line: float) -> str:
    if value is None or n <= 0:
        return "absent"
    if n < minimum:
        return "thin"
    if value >= STRONG:
        return "strong"
    if value < weak_line:
        return "weak"
    return "developing"


def flashcard_cells(card_rows: list[dict]) -> dict[str, Cell]:
    """Per-topic flashcard grade = correct / total (spec §5).

    `score` is deliberately ignored: it is an XP value -- base points times a combo
    multiplier, clamped at student.py:528 -- so averaging it grades a student's answer streak
    rather than their correctness.
    """
    agg: dict[str, list[int]] = {}
    for row in card_rows:
        key = norm_key(row.get("topic_tag") or "general")
        if not key:
            continue
        bucket = agg.setdefault(key, [0, 0])
        bucket[1] += 1
        if row.get("correct"):
            bucket[0] += 1
    cells: dict[str, Cell] = {}
    for key, (correct, total) in agg.items():
        pct = round(100 * correct / total, 1)
        cells[key] = Cell(value=pct, n=total,
                          band=band_for(pct, n=total, minimum=MIN_CARDS, weak_line=KNOWLEDGE_WEAK))
    return cells


def station_cells(case_rows: list[dict],
                  case_topics: dict[str, str]) -> tuple[dict[str, Cell], dict[str, int]]:
    """Per-topic station performance, plus what was left out and why.

    Two exclusions, both COUNTED rather than dropped: an attempt whose case is missing from
    the index has no topic to sit under (bucketing it anywhere would invent a placement), and
    a pre-migration-011 row has no /100 score to place on this axis at all.
    """
    agg: dict[str, list[float]] = {}
    excluded = {"unmapped_case": 0, "unscored": 0}
    for row in case_rows:
        score = row.get("score_100")
        if score is None:
            excluded["unscored"] += 1
            continue
        key = norm_key(case_topics.get(str(row.get("case_id") or "").strip()))
        if not key:
            excluded["unmapped_case"] += 1
            continue
        bucket = agg.setdefault(key, [0.0, 0])
        bucket[0] += float(score)
        bucket[1] += 1
    cells: dict[str, Cell] = {}
    for key, (total, n) in agg.items():
        mean = round(total / n, 1)
        cells[key] = Cell(value=mean, n=int(n),
                          band=band_for(mean, n=int(n), minimum=MIN_ATTEMPTS,
                                        weak_line=PERFORMANCE_WEAK))
    return cells, excluded


def retention_cells(retention_scores: dict | None) -> dict[str, Cell]:
    """`retention_scores` is a 0-1 dict with no attempt count behind it, so n is 1 by
    construction. Banded on the knowledge line: it measures durability of recall, and the
    console has always coloured it against 0.65."""
    cells: dict[str, Cell] = {}
    for raw, score in (retention_scores or {}).items():
        key = norm_key(raw)
        if not key:
            continue
        try:
            pct = round(float(score) * 100, 1)
        except (TypeError, ValueError):
            continue
        cells[key] = Cell(value=pct, n=1,
                          band=band_for(pct, n=1, minimum=1, weak_line=KNOWLEDGE_WEAK))
    return cells
```

- [ ] **Step 4: Run to verify it passes**

```bash
python -m pytest tests/supervisor/test_topic_map.py -q
```

Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/supervisor/topic_map.py tests/supervisor/test_topic_map.py
git commit -m "feat(analytics): per-axis cells with bands and counted exclusions"
```

---

## Task 8: The flags — "knows it, can't do it"

The centrepiece. A flag must never fire off a cell that has no verdict.

**Files:**
- Modify: `tools/supervisor/topic_map.py`
- Test: `tests/supervisor/test_topic_map.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/supervisor/test_topic_map.py`:

```python
from tools.supervisor.topic_map import flag_for, build_topic_map


def _cell(value, n, minimum, weak_line):
    return Cell(value=value, n=n, band=band_for(value, n=n, minimum=minimum, weak_line=weak_line))


def _fc(value, n=20):
    return _cell(value, n, 5, 65.0)


def _st(value, n=3):
    return _cell(value, n, 1, 60.0)


def test_flag_knows_it_cant_do_it():
    assert flag_for(_fc(88.0), _st(41.0)) == "knows_cant_do"


def test_flag_rote():
    assert flag_for(_fc(50.0), _st(82.0)) == "rote"


def test_flag_consistent_gap():
    assert flag_for(_fc(48.0), _st(52.0)) == "consistent_gap"


def test_no_flag_when_the_two_agree():
    assert flag_for(_fc(80.0), _st(78.0)) == ""


def test_a_flag_never_fires_off_a_thin_cell():
    """4 cards is not evidence of knowledge, so 'knows it, can't do it' is not a claim we can
    make -- however tempting the shape of the numbers."""
    assert flag_for(_fc(100.0, n=4), _st(30.0)) == ""


def test_a_flag_never_fires_off_an_absent_cell():
    assert flag_for(Cell(), _st(30.0)) == ""
    assert flag_for(_fc(90.0), Cell()) == ""


def test_build_topic_map_leads_with_the_flagged_rows():
    """A trainer reads the map top-down for what to do next, so the actionable rows are
    first and the order is deterministic."""
    result = build_topic_map(
        card_rows=([{"topic_tag": "tonometry", "correct": True}] * 18
                   + [{"topic_tag": "gonioscopy", "correct": True}] * 18),
        case_rows=[{"case_id": "c1", "score_100": 30}, {"case_id": "c2", "score_100": 95}],
        retention_scores={"perimetry": 0.9},
        case_topics={"c1": "Tonometry", "c2": "Gonioscopy"},
    )
    assert [r.topic for r in result.rows][0] == "tonometry"
    assert result.rows[0].flag == "knows_cant_do"
    # The retention-only topic still gets a row, with two absent cells.
    perimetry = next(r for r in result.rows if r.topic == "perimetry")
    assert perimetry.flashcards.band == "absent" and perimetry.station.band == "absent"
    assert perimetry.retention.value == 90.0
```

- [ ] **Step 2: Run to verify it fails**

```bash
python -m pytest tests/supervisor/test_topic_map.py -q
```

Expected: FAIL — `ImportError: cannot import name 'flag_for'`.

- [ ] **Step 3: Implement**

Append to `tools/supervisor/topic_map.py`:

```python
# Ordered worst-first for the row sort below: a flagged row is the reason a trainer opens
# this table, so flagged rows lead it.
_FLAG_RANK = {"knows_cant_do": 0, "consistent_gap": 1, "rote": 2, "": 3}

_UNBANDED = ("thin", "absent")


def flag_for(flashcards: Cell, station: Cell) -> str:
    """The diagonal read of the map (spec §4.1).

    Both cells must be BANDED. A flag off a `thin` cell would turn four lucky cards into
    "knows it" and a single station into "can't do it" -- the shape of the numbers is
    suggestive there, which is exactly why the guard is explicit.
    """
    if flashcards.band in _UNBANDED or station.band in _UNBANDED:
        return ""
    if flashcards.value >= STRONG and station.value < PERFORMANCE_WEAK:
        return "knows_cant_do"
    if station.value >= STRONG and flashcards.value < KNOWLEDGE_WEAK:
        return "rote"
    if flashcards.band == "weak" and station.band == "weak":
        return "consistent_gap"
    return ""


@dataclass(frozen=True)
class TopicRow:
    topic: str
    flashcards: Cell
    station: Cell
    retention: Cell
    flag: str = ""


@dataclass(frozen=True)
class TopicMap:
    rows: list[TopicRow]
    excluded: dict[str, int]


def _worst_banded(row: TopicRow) -> float:
    """The lowest value this row has a VERDICT for. Unbanded axes are ignored rather than
    treated as 0 -- 'not measured' must never sort as 'terrible'."""
    values = [c.value for c in (row.flashcards, row.station, row.retention)
              if c.band not in _UNBANDED and c.value is not None]
    return min(values) if values else 999.0


def build_topic_map(*, card_rows: list[dict], case_rows: list[dict],
                    retention_scores: dict | None,
                    case_topics: dict[str, str]) -> TopicMap:
    """The knowledge x performance map: one row per topic ANY source knows about."""
    fc = flashcard_cells(card_rows)
    st, excluded = station_cells(case_rows, case_topics)
    rt = retention_cells(retention_scores)

    rows = []
    for topic in topic_union(flashcards=fc, stations=st, retention=rt):
        f, s, r = fc.get(topic, Cell()), st.get(topic, Cell()), rt.get(topic, Cell())
        rows.append(TopicRow(topic=topic, flashcards=f, station=s, retention=r,
                             flag=flag_for(f, s)))
    # Flagged rows first, then worst-measured first, then alphabetical so the order is
    # reproducible across runs and across the three renderers.
    rows.sort(key=lambda r: (_FLAG_RANK[r.flag], _worst_banded(r), r.topic))
    return TopicMap(rows=rows, excluded=excluded)
```

- [ ] **Step 4: Run to verify it passes**

```bash
python -m pytest tests/supervisor/test_topic_map.py -q
```

Expected: PASS (17 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/supervisor/topic_map.py tests/supervisor/test_topic_map.py
git commit -m "feat(analytics): the knowledge x performance map and its flags"
```

---

## Task 9: Per-topic cohort contrast

**Files:**
- Modify: `tools/supervisor/topic_map.py`
- Test: `tests/supervisor/test_topic_map.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/supervisor/test_topic_map.py`:

```python
from tools.supervisor.topic_map import cohort_topic_means, contrast_for, MIN_PEERS


def test_cohort_means_exclude_the_student_being_measured():
    """Leave-one-out: a student is never an input to the average they are measured against."""
    cards = ([{"student_id": "me", "topic_tag": "tonometry", "correct": False}] * 10
             + [{"student_id": "p1", "topic_tag": "tonometry", "correct": True}] * 10
             + [{"student_id": "p2", "topic_tag": "tonometry", "correct": True}] * 10)
    means = cohort_topic_means(card_rows=cards, case_rows=[], case_topics={},
                               exclude_student_id="me")
    assert means["tonometry"]["flashcards"] == (100.0, 2)


def test_cohort_means_average_students_not_pooled_cards():
    """Per-student then mean, so one heavy user cannot dominate the baseline."""
    cards = ([{"student_id": "p1", "topic_tag": "t", "correct": True}] * 100
             + [{"student_id": "p2", "topic_tag": "t", "correct": False}] * 2)
    means = cohort_topic_means(card_rows=cards, case_rows=[], case_topics={},
                               exclude_student_id="me")
    assert means["t"]["flashcards"] == (50.0, 2)


def test_contrast_individual_gap():
    row = TopicRow(topic="t", flashcards=_fc(40.0), station=Cell(), retention=Cell())
    c = contrast_for(row, {"t": {"flashcards": (80.0, 5)}})
    assert c is not None and c.label == "individual_gap"
    assert c.cohort_mean == 80.0 and c.peers == 5


def test_contrast_cohort_gap_when_the_peers_are_weak_too():
    """The curriculum signal: the student is weak AND so is everyone else."""
    row = TopicRow(topic="t", flashcards=_fc(52.0), station=Cell(), retention=Cell())
    c = contrast_for(row, {"t": {"flashcards": (55.0, 5)}})
    assert c is not None and c.label == "cohort_gap"


def test_contrast_both_when_the_student_trails_a_weak_cohort():
    row = TopicRow(topic="t", flashcards=_fc(30.0), station=Cell(), retention=Cell())
    c = contrast_for(row, {"t": {"flashcards": (60.0, 5)}})
    assert c is not None and c.label == "individual_gap_in_cohort_gap"


def test_contrast_refuses_a_baseline_below_the_peer_minimum():
    """Two peers is not a cohort. The row reports the shortfall instead of a number."""
    row = TopicRow(topic="t", flashcards=_fc(30.0), station=Cell(), retention=Cell())
    c = contrast_for(row, {"t": {"flashcards": (90.0, MIN_PEERS - 1)}})
    assert c is not None and c.label == "no_baseline" and c.peers == MIN_PEERS - 1


def test_contrast_is_none_when_the_student_is_not_weak_there():
    row = TopicRow(topic="t", flashcards=_fc(90.0), station=Cell(), retention=Cell())
    assert contrast_for(row, {"t": {"flashcards": (50.0, 9)}}) is None
```

- [ ] **Step 2: Run to verify it fails**

```bash
python -m pytest tests/supervisor/test_topic_map.py -q
```

Expected: FAIL — `ImportError: cannot import name 'cohort_topic_means'`.

- [ ] **Step 3: Implement**

Append to `tools/supervisor/topic_map.py`:

```python
# Three is the floor for calling something a cohort. Below it the row says so.
MIN_PEERS = 3
# How far below the peer mean counts as this student's own gap rather than noise.
INDIVIDUAL_GAP = 15.0


def _mean_of_student_means(per_student: dict[str, list[int]]) -> tuple[float, int]:
    """Average the STUDENTS, not the rows -- otherwise one heavy user is the baseline."""
    means = [100 * c / n for c, n in per_student.values() if n]
    if not means:
        return (0.0, 0)
    return (round(sum(means) / len(means), 1), len(means))


def cohort_topic_means(*, card_rows: list[dict], case_rows: list[dict],
                       case_topics: dict[str, str],
                       exclude_student_id: str) -> dict[str, dict]:
    """Per-topic peer baselines, leave-one-out: `{topic: {axis: (mean, peers)}}`."""
    cards: dict[str, dict[str, list[int]]] = {}
    for row in card_rows:
        sid = str(row.get("student_id") or "")
        if not sid or sid == exclude_student_id:
            continue
        key = norm_key(row.get("topic_tag") or "general")
        if not key:
            continue
        bucket = cards.setdefault(key, {}).setdefault(sid, [0, 0])
        bucket[1] += 1
        if row.get("correct"):
            bucket[0] += 1

    stations: dict[str, dict[str, list[float]]] = {}
    for row in case_rows:
        sid = str(row.get("student_id") or "")
        score = row.get("score_100")
        if not sid or sid == exclude_student_id or score is None:
            continue
        key = norm_key(case_topics.get(str(row.get("case_id") or "").strip()))
        if not key:
            continue
        bucket = stations.setdefault(key, {}).setdefault(sid, [0.0, 0])
        bucket[0] += float(score)
        bucket[1] += 1

    out: dict[str, dict] = {}
    for key, per_student in cards.items():
        out.setdefault(key, {})["flashcards"] = _mean_of_student_means(per_student)
    for key, per_student in stations.items():
        means = [total / n for total, n in per_student.values() if n]
        out.setdefault(key, {})["station"] = (
            (round(sum(means) / len(means), 1), len(means)) if means else (0.0, 0))
    return out


@dataclass(frozen=True)
class Contrast:
    topic: str
    axis: str            # flashcards | station
    student: float
    cohort_mean: float
    peers: int
    label: str           # individual_gap | cohort_gap | individual_gap_in_cohort_gap | no_baseline


def contrast_for(row: TopicRow, means: dict[str, dict]) -> Contrast | None:
    """Is this weakness the student's, or the cohort's? (spec §4.5)

    None when the student is not banded weak on either axis -- there is nothing to explain.
    """
    for axis, cell, weak_line in (("flashcards", row.flashcards, KNOWLEDGE_WEAK),
                                  ("station", row.station, PERFORMANCE_WEAK)):
        if cell.band != "weak" or cell.value is None:
            continue
        mean, peers = (means.get(row.topic, {}) or {}).get(axis, (None, 0))
        if mean is None or peers < MIN_PEERS:
            return Contrast(topic=row.topic, axis=axis, student=cell.value,
                            cohort_mean=0.0, peers=int(peers), label="no_baseline")
        cohort_weak = mean < weak_line
        trails = cell.value <= mean - INDIVIDUAL_GAP
        if cohort_weak and trails:
            label = "individual_gap_in_cohort_gap"
        elif cohort_weak:
            label = "cohort_gap"
        elif trails:
            label = "individual_gap"
        else:
            # Weak, but level with peers and the peers are fine -- nothing honest to say.
            continue
        return Contrast(topic=row.topic, axis=axis, student=cell.value,
                        cohort_mean=mean, peers=peers, label=label)
    return None
```

- [ ] **Step 4: Run to verify it passes**

```bash
python -m pytest tests/supervisor/test_topic_map.py -q
```

Expected: PASS (24 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/supervisor/topic_map.py tests/supervisor/test_topic_map.py
git commit -m "feat(analytics): per-topic cohort contrast — individual gap vs cohort gap"
```

---

## Task 10: `osce_analysis.py` — where the marks go

**Files:**
- Create: `tools/supervisor/osce_analysis.py`
- Test: `tests/supervisor/test_osce_analysis.py`

- [ ] **Step 1: Write the failing test**

Create `tests/supervisor/test_osce_analysis.py`:

```python
"""Cross-attempt OSCE analysis (spec §4.2-4.4)."""
from tools.supervisor.osce_analysis import mark_loss


def _attempt(cc=40, ct=30, js=30, scale=2, **extra):
    row = {"checklist_coverage": cc, "consult_technique": ct,
           "judgement_safety": js, "grade_scale": scale}
    row.update(extra)
    return row


def test_mark_loss_decomposes_the_lost_marks():
    rows = [_attempt(cc=30, ct=20, js=15), _attempt(cc=35, ct=25, js=10)]
    result = mark_loss(rows)
    assert result.lost == {"checklist": 15, "consult": 15, "judgement": 35}
    assert result.total_lost == 65
    assert result.shares["judgement"] == 53.8
    assert result.attempts == 2


def test_mark_loss_never_blends_the_retired_scale():
    """A NULL grade_scale is the x50 era. Mixing it in restates a rescale as a collapse --
    the exact failure migration 017 exists to prevent."""
    rows = [_attempt(cc=30, ct=20, js=15), _attempt(cc=40, ct=45, js=48, scale=None)]
    result = mark_loss(rows)
    assert result.attempts == 1
    assert result.excluded_legacy == 1
    assert result.lost == {"checklist": 10, "consult": 10, "judgement": 15}


def test_mark_loss_excludes_a_current_scale_row_missing_a_bucket():
    rows = [_attempt(cc=None)]
    result = mark_loss(rows)
    assert result.attempts == 0 and result.excluded_legacy == 1


def test_mark_loss_on_a_perfect_run_is_zero_not_empty():
    """'No marks lost' is a finding. A blank section would read as 'not measured'."""
    result = mark_loss([_attempt()])
    assert result.attempts == 1 and result.total_lost == 0
    assert result.shares == {"checklist": 0.0, "consult": 0.0, "judgement": 0.0}


def test_mark_loss_with_no_attempts():
    result = mark_loss([])
    assert result.attempts == 0 and result.total_lost == 0 and result.excluded_legacy == 0
```

- [ ] **Step 2: Run to verify it fails**

```bash
python -m pytest tests/supervisor/test_osce_analysis.py -q
```

Expected: FAIL — `ModuleNotFoundError: No module named 'tools.supervisor.osce_analysis'`.

- [ ] **Step 3: Implement**

Create `tools/supervisor/osce_analysis.py`:

```python
"""Cross-attempt OSCE analysis for one student (spec §4.2-4.4).

Everything here answers a question a table of totals cannot: where the marks actually go,
which steps a student misses HABITUALLY rather than once, and whether they are getting better.

Pure: no I/O, no clock, no AI.
"""
from __future__ import annotations

from dataclasses import dataclass

from tools.supervisor.topic_map import norm_key

# migration 017's stamp: 2 = the 40/30/30 buckets, NULL = the retired x50 era.
GRADE_SCALE_CURRENT = 2
BUCKET_MAX = {"checklist": 40, "consult": 30, "judgement": 30}
_BUCKET_COLUMN = {"checklist": "checklist_coverage", "consult": "consult_technique",
                  "judgement": "judgement_safety"}


@dataclass(frozen=True)
class MarkLoss:
    lost: dict[str, int]
    total_lost: int
    shares: dict[str, float]
    attempts: int
    excluded_legacy: int


def mark_loss(case_rows: list[dict]) -> MarkLoss:
    """Decompose the marks LOST across attempts (spec §4.2).

    Only attempts stamped with the current scale are summed. A row on the retired x50 scale
    is counted and named as excluded, never blended: its sub-scores are out of 50, and adding
    them to /30 figures would read as a performance collapse that is only a rescale.
    """
    lost = {"checklist": 0, "consult": 0, "judgement": 0}
    attempts = 0
    excluded = 0
    for row in case_rows:
        if row.get("grade_scale") != GRADE_SCALE_CURRENT:
            excluded += 1
            continue
        values = {b: row.get(col) for b, col in _BUCKET_COLUMN.items()}
        if any(v is None for v in values.values()):
            # Stamped current but missing a bucket: not decomposable, and guessing the
            # missing one would invent the very figure this section reports.
            excluded += 1
            continue
        for bucket, value in values.items():
            lost[bucket] += max(0, BUCKET_MAX[bucket] - int(value))
        attempts += 1
    total = sum(lost.values())
    shares = ({b: round(100 * v / total, 1) for b, v in lost.items()} if total
              else {b: 0.0 for b in lost})
    return MarkLoss(lost=lost, total_lost=total, shares=shares,
                    attempts=attempts, excluded_legacy=excluded)
```

- [ ] **Step 4: Run to verify it passes**

```bash
python -m pytest tests/supervisor/test_osce_analysis.py -q
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/supervisor/osce_analysis.py tests/supervisor/test_osce_analysis.py
git commit -m "feat(analytics): decompose where a student's OSCE marks go"
```

---

## Task 11: Repeat offenders

**Files:**
- Modify: `tools/supervisor/osce_analysis.py`
- Test: `tests/supervisor/test_osce_analysis.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/supervisor/test_osce_analysis.py`:

```python
from tools.supervisor.osce_analysis import repeat_offenders, critical_offenders


def _step(action, performed, critical=False):
    return {"step_number": 1, "action": action, "phase": "Preparation",
            "critical": critical, "performed": performed, "skipped": False}


def test_repeat_offenders_need_two_misses():
    """One miss is noise. Two is a habit -- and only the second one is worth a trainer's
    Tuesday."""
    rows = [
        {"checklist_detail": [_step("Check allergy status", False), _step("Wash hands", False)]},
        {"checklist_detail": [_step("Check allergy status", False), _step("Wash hands", True)]},
    ]
    out = repeat_offenders(rows)
    assert [o.action for o in out] == ["Check allergy status"]


def test_repeat_offenders_carry_the_denominator():
    """'Missed 3 times' is meaningless without the number of stations that CONTAINED the
    step: 3 of 3 is a blind spot, 3 of 12 is an off day."""
    rows = [{"checklist_detail": [_step("Check allergy status", False)]} for _ in range(3)]
    rows += [{"checklist_detail": [_step("Check allergy status", True)]} for _ in range(9)]
    out = repeat_offenders(rows)
    assert out[0].missed == 3 and out[0].appeared == 12


def test_repeat_offenders_merge_the_same_step_written_differently():
    rows = [
        {"checklist_detail": [_step("Check Allergy Status", False)]},
        {"checklist_detail": [_step("check allergy status", False)]},
    ]
    assert len(repeat_offenders(rows)) == 1


def test_repeat_offenders_ignore_a_row_with_no_ledger():
    """A pre-019 attempt has no ledger. It contributes nothing rather than counting as a
    station in which every step was performed."""
    rows = [{"checklist_detail": None},
            {"checklist_detail": [_step("Check allergy status", False)]}]
    assert repeat_offenders(rows) == []


def test_critical_offenders_work_without_a_ledger():
    """missed_critical has been stored since migration 011, so this half reaches back over
    every existing attempt. `appeared` is None: nothing recorded how many stations contained
    the step, and a fabricated denominator is worse than an absent one."""
    rows = [{"missed_critical": ["Check allergy status"]},
            {"missed_critical": ["Check allergy status", "Confirm patient identity"]}]
    out = critical_offenders(rows)
    assert [(o.action, o.missed, o.appeared) for o in out] == [
        ("Check allergy status", 2, None)]
```

- [ ] **Step 2: Run to verify it fails**

```bash
python -m pytest tests/supervisor/test_osce_analysis.py -k offender -q
```

Expected: FAIL — `ImportError: cannot import name 'repeat_offenders'`.

- [ ] **Step 3: Implement**

Append to `tools/supervisor/osce_analysis.py`:

```python
MIN_REPEATS = 2


@dataclass(frozen=True)
class Offender:
    action: str
    missed: int
    critical: bool
    # How many attempts CONTAINED this step. None when nothing recorded it (the
    # missed_critical path) -- an absent denominator is honest, a fabricated one is not.
    appeared: int | None = None


def repeat_offenders(case_rows: list[dict], minimum: int = MIN_REPEATS) -> list[Offender]:
    """Steps missed in `minimum` or more attempts, with the denominator (spec §4.3).

    Reads the migration-019 ledger. An attempt without one contributes nothing -- treating a
    NULL as "every step performed" would quietly clear a student's record.
    """
    seen: dict[str, dict] = {}
    for row in case_rows:
        detail = row.get("checklist_detail")
        if not isinstance(detail, list):
            continue
        for step in detail:
            key = norm_key(step.get("action"))
            if not key:
                continue
            entry = seen.setdefault(key, {"action": str(step.get("action") or ""),
                                          "missed": 0, "appeared": 0, "critical": False})
            entry["appeared"] += 1
            if not step.get("performed"):
                entry["missed"] += 1
            if step.get("critical"):
                entry["critical"] = True
    out = [Offender(action=e["action"], missed=e["missed"], appeared=e["appeared"],
                    critical=e["critical"])
           for e in seen.values() if e["missed"] >= minimum]
    return sorted(out, key=lambda o: (-o.missed, -(o.appeared or 0), o.action))


def critical_offenders(case_rows: list[dict], minimum: int = MIN_REPEATS) -> list[Offender]:
    """The same idea over `missed_critical`, stored since migration 011 -- so this half works
    on attempts that predate the ledger."""
    seen: dict[str, dict] = {}
    for row in case_rows:
        for raw in (row.get("missed_critical") or []):
            key = norm_key(raw)
            if not key:
                continue
            entry = seen.setdefault(key, {"action": str(raw), "missed": 0})
            entry["missed"] += 1
    out = [Offender(action=e["action"], missed=e["missed"], appeared=None, critical=True)
           for e in seen.values() if e["missed"] >= minimum]
    return sorted(out, key=lambda o: (-o.missed, o.action))
```

- [ ] **Step 4: Run to verify it passes**

```bash
python -m pytest tests/supervisor/test_osce_analysis.py -q
```

Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/supervisor/osce_analysis.py tests/supervisor/test_osce_analysis.py
git commit -m "feat(analytics): repeat offenders, always with their denominator"
```

---

## Task 12: Trajectory

**Files:**
- Modify: `tools/supervisor/osce_analysis.py`
- Test: `tests/supervisor/test_osce_analysis.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/supervisor/test_osce_analysis.py`:

```python
from tools.supervisor.osce_analysis import trajectory, MIN_TRAJECTORY_N


def test_trajectory_improving():
    t = trajectory([40.0, 50.0, 70.0, 80.0])
    assert t.band == "improving" and t.delta == 30.0
    assert t.first_mean == 45.0 and t.second_mean == 75.0


def test_trajectory_declining():
    assert trajectory([80.0, 78.0, 50.0, 48.0]).band == "declining"


def test_trajectory_steady_inside_the_dead_band():
    assert trajectory([60.0, 62.0, 63.0, 61.0]).band == "steady"


def test_trajectory_drops_the_middle_on_an_odd_count():
    """Halves must be equal-sized or the delta is an artefact of the split."""
    t = trajectory([10.0, 10.0, 999.0, 20.0, 20.0])
    assert t.first_mean == 10.0 and t.second_mean == 20.0


def test_trajectory_refuses_to_call_a_trend_off_two_points():
    t = trajectory([10.0, 90.0])
    assert t.band == "insufficient"
    assert t.delta is None
    assert t.n == 2 and t.needed == MIN_TRAJECTORY_N


def test_trajectory_of_nothing_is_insufficient_not_zero():
    t = trajectory([])
    assert t.band == "insufficient" and t.n == 0 and t.delta is None
```

- [ ] **Step 2: Run to verify it fails**

```bash
python -m pytest tests/supervisor/test_osce_analysis.py -k trajectory -q
```

Expected: FAIL — `ImportError: cannot import name 'trajectory'`.

- [ ] **Step 3: Implement**

Append to `tools/supervisor/osce_analysis.py`:

```python
MIN_TRAJECTORY_N = 4
# Movement smaller than this is inside the noise of a per-station grade.
TRAJECTORY_DEAD_BAND = 5.0


@dataclass(frozen=True)
class Trajectory:
    band: str                    # improving | steady | declining | insufficient
    delta: float | None
    n: int
    needed: int
    first_mean: float | None
    second_mean: float | None


def trajectory(values: list[float], minimum: int = MIN_TRAJECTORY_N) -> Trajectory:
    """First half vs second half (spec §4.4).

    `values` MUST already be in chronological order: the timestamp column differs by source
    (case_progress.completed_at vs flashcard_attempts.created_at), so ordering is the
    caller's job and sorting here would silently accept an unordered list.

    Below `minimum` this returns `insufficient` WITH the counts. It does not draw a line
    through two points -- which is what `learning_velocity`, the single word this replaces,
    has always been willing to do.
    """
    n = len(values)
    if n < minimum:
        return Trajectory(band="insufficient", delta=None, n=n, needed=minimum,
                          first_mean=None, second_mean=None)
    half = n // 2
    first, second = values[:half], values[n - half:]
    first_mean = sum(first) / len(first)
    second_mean = sum(second) / len(second)
    delta = round(second_mean - first_mean, 1)
    if delta >= TRAJECTORY_DEAD_BAND:
        band = "improving"
    elif delta <= -TRAJECTORY_DEAD_BAND:
        band = "declining"
    else:
        band = "steady"
    return Trajectory(band=band, delta=delta, n=n, needed=minimum,
                      first_mean=round(first_mean, 1), second_mean=round(second_mean, 1))
```

- [ ] **Step 4: Run to verify it passes**

```bash
python -m pytest tests/supervisor/test_osce_analysis.py -q
```

Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/supervisor/osce_analysis.py tests/supervisor/test_osce_analysis.py
git commit -m "feat(analytics): trajectory that refuses to call a trend off two points"
```

---

## Task 13: Consultation labels

**Files:**
- Create: `tools/supervisor/student_insight.py`
- Test: `tests/supervisor/test_student_insight.py`

- [ ] **Step 1: Write the failing test**

Create `tests/supervisor/test_student_insight.py`:

```python
"""Consultation labels and the assembled payload (spec §4.6)."""
from tools.supervisor.student_insight import consultations, TOPIC_SENTINEL


def test_consultations_use_the_recorded_label():
    rows = [{"topic": "how do I calibrate a Goldmann tonometer", "summary": "...",
             "created_at": "2026-08-02T10:00:00Z"}]
    out = consultations(rows, vocabulary=["tonometry"])
    assert out[0].label == "how do I calibrate a Goldmann tonometer"
    assert out[0].count == 1 and out[0].derived is False
    assert out[0].last_seen == "2026-08-02"


def test_consultations_group_repeats_and_keep_the_latest_date():
    rows = [{"topic": "gonioscopy", "created_at": "2026-08-01T09:00:00Z"},
            {"topic": "gonioscopy", "created_at": "2026-08-04T09:00:00Z"}]
    out = consultations(rows, vocabulary=[])
    assert out[0].count == 2 and out[0].last_seen == "2026-08-04"


def test_consultations_never_print_the_sentinel_as_a_subject():
    """Every legacy tutor row carries the chat default. Printing it as a topic is the defect
    this replaces -- it made every conversation look identical."""
    rows = [{"topic": TOPIC_SENTINEL, "summary": "Intraocular pressure is measured by...",
             "created_at": "2026-08-01T09:00:00Z"}]
    out = consultations(rows, vocabulary=["intraocular pressure", "pressure"])
    assert out[0].label == "intraocular pressure"    # longest match wins
    assert out[0].derived is True


def test_consultations_admit_when_nothing_can_be_derived():
    rows = [{"topic": TOPIC_SENTINEL, "summary": "Let us think about that together.",
             "created_at": "2026-08-01T09:00:00Z"}]
    out = consultations(rows, vocabulary=["gonioscopy"])
    assert out[0].label == "" and out[0].derived is False


def test_consultations_exclude_station_sessions():
    """Stations are logged into the same table with a server-written "Case: " prefix."""
    rows = [{"topic": "Case: Acute angle closure", "created_at": "2026-08-01T09:00:00Z"},
            {"topic": "gonioscopy", "created_at": "2026-08-01T09:00:00Z"}]
    out = consultations(rows, vocabulary=[])
    assert [c.label for c in out] == ["gonioscopy"]


def test_consultations_sort_by_count_then_recency():
    rows = [{"topic": "a", "created_at": "2026-08-01T09:00:00Z"},
            {"topic": "b", "created_at": "2026-08-05T09:00:00Z"},
            {"topic": "b", "created_at": "2026-08-06T09:00:00Z"}]
    assert [c.label for c in consultations(rows, vocabulary=[])] == ["b", "a"]
```

- [ ] **Step 2: Run to verify it fails**

```bash
python -m pytest tests/supervisor/test_student_insight.py -q
```

Expected: FAIL — `ModuleNotFoundError: No module named 'tools.supervisor.student_insight'`.

- [ ] **Step 3: Implement**

Create `tools/supervisor/student_insight.py`:

```python
"""Consultation labels + the assembled per-student insight payload (spec §4.6).

One object, three renderers: the console panel, the student report and the OSCE dossier all
read what this returns, so they cannot describe the same student differently.

Pure: no I/O, no clock, no AI.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

from tools.supervisor.topic_map import norm_key

# chat.py's default topic. Every tutor row written before the client started sending a real
# label carries it, so it means exactly one thing: no label was recorded.
TOPIC_SENTINEL = "Ophthalmology"
_STATION_PREFIX = "case:"


@dataclass(frozen=True)
class Consultation:
    label: str          # "" when nothing could be derived -> renders "Topic not recorded"
    count: int
    last_seen: str      # YYYY-MM-DD
    derived: bool       # True when matched from the summary rather than recorded


def _label_for(row: dict, vocabulary: list[str]) -> tuple[str, bool]:
    topic = str(row.get("topic") or "").strip()
    if topic and topic != TOPIC_SENTINEL:
        return topic, False
    # Legacy row: the student's question was never stored, so the only evidence of what was
    # discussed is the tutor's own last reply. Match it against the topic vocabulary; never
    # guess beyond it.
    summary = norm_key(row.get("summary"))
    for term in vocabulary:
        if term and term in summary:
            return term, True
    return "", False


def consultations(sessions: list[dict], *, vocabulary: list[str]) -> list[Consultation]:
    """Group tutor sessions into labels with counts (spec §4.6). No transcript.

    Station sessions are logged into the same table with a server-written "Case: " prefix and
    are excluded here.
    """
    # Longest first, so "intraocular pressure" wins over "pressure".
    terms = sorted({norm_key(v) for v in vocabulary if norm_key(v)}, key=len, reverse=True)
    groups: dict[str, dict] = {}
    for row in sessions:
        if str(row.get("topic") or "").strip().lower().startswith(_STATION_PREFIX):
            continue
        label, derived = _label_for(row, terms)
        seen = str(row.get("created_at") or "")[:10]
        entry = groups.setdefault(norm_key(label), {"label": label, "count": 0,
                                                    "last_seen": "", "derived": derived})
        entry["count"] += 1
        if seen > entry["last_seen"]:
            entry["last_seen"] = seen
    out = [Consultation(**e) for e in groups.values()]
    return sorted(out, key=lambda c: (-c.count, _negate_date(c.last_seen), c.label))


def _negate_date(iso_day: str) -> str:
    """Sort ISO days newest-first inside a tuple that is otherwise ascending."""
    return "".join(chr(ord("9") - int(ch)) if ch.isdigit() else ch for ch in iso_day)
```

- [ ] **Step 4: Run to verify it passes**

```bash
python -m pytest tests/supervisor/test_student_insight.py -q
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/supervisor/student_insight.py tests/supervisor/test_student_insight.py
git commit -m "feat(analytics): consultation labels that never print the chat default"
```

---

## Task 14: The assembler

One function, one payload. Everything above, plus the honest-state metadata the renderers need.

**Files:**
- Modify: `tools/supervisor/student_insight.py`
- Test: `tests/supervisor/test_student_insight.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/supervisor/test_student_insight.py`:

```python
from tools.supervisor.student_insight import build_student_insight


def _payload(**over):
    args = dict(profile={}, sessions=[], case_rows=[], card_rows=[],
                case_topics={}, cohort_card_rows=[], cohort_case_rows=[], student_id="me")
    args.update(over)
    return build_student_insight(**args)


def test_payload_is_json_serialisable():
    import json
    json.dumps(_payload())   # must not raise -- this goes straight out of a FastAPI handler


def test_payload_of_an_empty_student_is_shaped_not_missing():
    """A brand-new student must produce every key, so a renderer never has to distinguish
    'no data' from 'old payload shape'."""
    out = _payload()
    for key in ("topics", "mark_loss", "offenders", "critical_offenders",
                "osce_trajectory", "flashcard_trajectory", "consultations",
                "contrasts", "excluded"):
        assert key in out
    assert out["topics"] == []
    assert out["osce_trajectory"]["band"] == "insufficient"


def test_payload_orders_osce_attempts_chronologically_for_the_trajectory():
    """The rows arrive from Supabase unordered; trajectory trusts its input order."""
    rows = [{"case_id": "c1", "score_100": 90, "completed_at": "2026-08-04T00:00:00Z"},
            {"case_id": "c1", "score_100": 10, "completed_at": "2026-08-01T00:00:00Z"},
            {"case_id": "c1", "score_100": 80, "completed_at": "2026-08-05T00:00:00Z"},
            {"case_id": "c1", "score_100": 20, "completed_at": "2026-08-02T00:00:00Z"}]
    out = _payload(case_rows=rows)
    assert out["osce_trajectory"]["band"] == "improving"


def test_payload_carries_the_flag_a_trainer_opens_the_report_for():
    out = _payload(
        card_rows=[{"topic_tag": "tonometry", "correct": True}] * 18,
        case_rows=[{"case_id": "c1", "score_100": 35,
                    "completed_at": "2026-08-01T00:00:00Z"}],
        case_topics={"c1": "Tonometry"},
    )
    assert out["topics"][0]["flag"] == "knows_cant_do"
```

- [ ] **Step 2: Run to verify it fails**

```bash
python -m pytest tests/supervisor/test_student_insight.py -k payload -q
```

Expected: FAIL — `ImportError: cannot import name 'build_student_insight'`.

- [ ] **Step 3: Implement**

Append to `tools/supervisor/student_insight.py`:

```python
from tools.supervisor.osce_analysis import (
    critical_offenders, mark_loss, repeat_offenders, trajectory,
)
from tools.supervisor.topic_map import build_topic_map, cohort_topic_means, contrast_for

# Flashcard trajectory needs more points than OSCE: one card is a much smaller event than one
# station, so a handful of them says nothing about direction.
MIN_CARDS_FOR_TRAJECTORY = 20


def build_student_insight(*, profile: dict, sessions: list[dict], case_rows: list[dict],
                          card_rows: list[dict], case_topics: dict[str, str],
                          cohort_card_rows: list[dict], cohort_case_rows: list[dict],
                          student_id: str) -> dict:
    """Everything the three renderers read, as one JSON-ready dict.

    Every key is always present. A renderer must never have to tell "this student has no
    data" apart from "this payload predates the field".
    """
    topic_map = build_topic_map(card_rows=card_rows, case_rows=case_rows,
                                retention_scores=profile.get("retention_scores"),
                                case_topics=case_topics)

    means = cohort_topic_means(card_rows=cohort_card_rows, case_rows=cohort_case_rows,
                               case_topics=case_topics, exclude_student_id=student_id)
    contrasts = [c for c in (contrast_for(r, means) for r in topic_map.rows) if c]

    # Chronological, because `trajectory` trusts its input order by contract and Supabase
    # returns these rows unordered.
    osce_scores = [float(r["score_100"]) for r in
                   sorted(case_rows, key=lambda r: str(r.get("completed_at") or ""))
                   if r.get("score_100") is not None]
    card_scores = [100.0 if r.get("correct") else 0.0 for r in
                   sorted(card_rows, key=lambda r: str(r.get("created_at") or ""))]

    vocabulary = ([str(t) for t in (profile.get("retention_scores") or {})]
                  + [str(t) for t in case_topics.values()]
                  + [str(r.get("topic_tag") or "") for r in card_rows])

    return {
        "topics": [
            {"topic": r.topic, "flag": r.flag,
             "flashcards": asdict(r.flashcards), "station": asdict(r.station),
             "retention": asdict(r.retention)}
            for r in topic_map.rows
        ],
        "contrasts": [asdict(c) for c in contrasts],
        "mark_loss": asdict(mark_loss(case_rows)),
        "offenders": [asdict(o) for o in repeat_offenders(case_rows)],
        "critical_offenders": [asdict(o) for o in critical_offenders(case_rows)],
        "osce_trajectory": asdict(trajectory(osce_scores)),
        "flashcard_trajectory": asdict(
            trajectory(card_scores, minimum=MIN_CARDS_FOR_TRAJECTORY)),
        "consultations": [asdict(c) for c in consultations(sessions, vocabulary=vocabulary)],
        # Named exclusions, so a renderer can say WHICH attempts are missing from the map
        # rather than printing a total that quietly disagrees with the stations table.
        "excluded": topic_map.excluded,
    }
```

- [ ] **Step 4: Run to verify it passes**

```bash
python -m pytest tests/supervisor/ -q
```

Expected: PASS (all supervisor tests, ~30 new).

- [ ] **Step 5: Commit**

```bash
git add tools/supervisor/student_insight.py tests/supervisor/test_student_insight.py
git commit -m "feat(analytics): assemble the one per-student insight payload"
```

---

## Task 15: Wire it into the endpoint

`/api/admin/student/{id}/detail` already reads everything needed except the case-topic map. It
currently calls `db.get_topic_accuracy`, which itself calls `db.get_flashcard_attempts` and
discards the timestamps trajectory needs — so this swaps to the raw read and derives accuracy
from it. Same number of round trips.

**Files:**
- Modify: `tools/api/routers/admin.py:776-949`
- Test: `tests/api/test_admin_endpoints.py`

- [ ] **Step 1: Swap the autouse stub**

`tests/api/test_admin_endpoints.py:114` stubs the reader this endpoint is about to stop
calling. In the `defaults` dict of the autouse `_stub_all_reads` fixture, replace:

```python
        "tools.shared.db.get_topic_accuracy": {},
```

with:

```python
        # The detail endpoint reads the RAW attempts now and aggregates them in-process —
        # get_topic_accuracy called this same function and discarded the timestamps.
        "tools.shared.db.get_flashcard_attempts": [],
```

Leaving the old key stubbed and the new one unstubbed would let the handler reach the real
Supabase client, which the global `_forbid_real_supabase` conftest fixture fails loudly — a
useful failure, but not the one this task is about.

- [ ] **Step 2: Write the failing test**

Append to `tests/api/test_admin_endpoints.py`. It uses the module's own `client` TestClient and
its `_cookies` helper, and relies on the autouse stub above for every DB read:

```python
def test_student_detail_returns_the_insight_payload():
    """The three renderers read `insight`. Its absence is a blank report, not a broken one,
    so this asserts the key exists and is shaped even for a student with no data at all."""
    r = client.get("/api/admin/student/stu_x/detail", cookies=_admin_headers())
    assert r.status_code == 200
    insight = r.json()["insight"]
    assert "topics" in insight and "mark_loss" in insight
    assert insight["osce_trajectory"]["band"] == "insufficient"
```

Note: the handler now calls `get_case_index()`, which reads the 155 case JSONs off local disk
(not Supabase) and caches per worker. The first test to touch it pays about a second; that is
the same cost the cohort-analytics tests already pay.

- [ ] **Step 3: Run to verify it fails**

```bash
python -m pytest tests/api/test_admin_endpoints.py -k insight_payload -q
```

Expected: FAIL — `KeyError: 'insight'`.

- [ ] **Step 4: Swap the flashcard read**

In `tools/api/routers/admin.py`, in `admin_student_detail`, replace the `get_topic_accuracy`
block:

```python
    # The RAW attempts, not get_topic_accuracy: that helper calls this same function and
    # throws away the timestamps, which the flashcard trajectory needs. Per-topic accuracy is
    # derived from these rows in topic_map.flashcard_cells, so this is one read, not two.
    try:
        card_rows = await db.get_flashcard_attempts(student_id)
    except Exception:
        # Raises by design pre-migration-010 (db.py:566) — the normal state before the
        # flashcard log existed. Degrade to no cards, exactly as before.
        card_rows = []
    flashcard_acc = _accuracy_from_rows(card_rows)
```

and add the pure helper above the handler:

```python
def _accuracy_from_rows(card_rows: list[dict]) -> dict[str, dict]:
    """`get_topic_accuracy`'s aggregation, over rows we have already read. Kept byte-identical
    in shape ({topic: {correct, total, pct}}) because the existing `flashcard_accuracy`
    response field and its console bar list both read it."""
    agg: dict[str, dict] = {}
    for row in card_rows:
        topic = row.get("topic_tag") or "general"
        bucket = agg.setdefault(topic, {"correct": 0, "total": 0, "pct": 0.0})
        bucket["total"] += 1
        if row.get("correct"):
            bucket["correct"] += 1
    for bucket in agg.values():
        bucket["pct"] = (round(100 * bucket["correct"] / bucket["total"], 1)
                         if bucket["total"] else 0.0)
    return agg
```

- [ ] **Step 5: Build the payload**

Still in `admin_student_detail`, after the `findings` line and before the `return`:

```python
    # Best-effort, exactly like the mastery block above it: this is an ADDITION to a page that
    # already works, so a failure here emits `insight: None` and leaves the sessions, cases
    # and findings intact.
    insight = None
    try:
        case_topics = {cid: str(entry.get("topic") or "")
                       for cid, entry in (await get_case_index()).items()}
        insight = build_student_insight(
            profile=profile, sessions=all_sessions, case_rows=case_rows,
            card_rows=card_rows, case_topics=case_topics,
            cohort_card_rows=reads.card_rows if reads else [],
            cohort_case_rows=reads.case_rows if reads else [],
            student_id=student_id,
        )
    except Exception as exc:
        audit_log("student_insight_failed", student_id=student_id,
                  feature="admin", detail=str(exc))
        await db.insert_audit_event(action="student_insight_failed",
                                    actor=current_user["sub"], target=student_id,
                                    feature="admin", detail=str(exc),
                                    ip=_client_ip(request))
        insight = None
```

`reads` is assigned inside the mastery `try` above. Hoist it so it is reachable here: add
`reads = None` immediately before that `try` block.

Add `"insight": insight,` to the returned dict, and the imports at the top of the module:

```python
from tools.supervisor.case_index import get_case_index
from tools.supervisor.student_insight import build_student_insight
```

(`get_case_index` may already be imported for the cohort endpoints — check before adding.)

- [ ] **Step 6: Run to verify it passes**

```bash
python -m pytest tests/api/test_admin_endpoints.py -q
```

Expected: PASS.

- [ ] **Step 7: Full backend gate**

```bash
python -m pytest -q
```

Expected: PASS, no regressions.

- [ ] **Step 8: Commit**

```bash
git add tools/api/routers/admin.py tests/api/test_admin_endpoints.py
git commit -m "feat(admin): serve the per-student insight payload"
```

---

## Task 16: Ship P1

- [ ] **Step 1: Full gates**

```bash
python -m pytest -q
```

```bash
cd frontend && npm run typecheck && npm run build
```

Both must be green. Never push red.

- [ ] **Step 2: Rebase onto current main**

```bash
git fetch origin main && git rebase origin/main
```

If this pulls anything in, RE-RUN both gates before continuing.

- [ ] **Step 3: Push**

```bash
git fetch origin main && git push origin HEAD:main
```

- [ ] **Step 4: Check CI**

```bash
gh run list --branch main --limit 3
```

A `cancelled` run is not a pass. Wait for a real conclusion.

- [ ] **Step 5: Confirm the migration is applied**

Migration 019 must be applied in Supabase (Task 2 Step 4) for the ledger to persist. Until it
is, `insert_case_result` falls back to the base columns and `checklist_detail` stays NULL —
the code is safe, but no ledger accumulates. Verify with a real submitted station, or by
reading one row back, before calling P1 done.

---

## Self-Review

**Spec coverage**

| Spec § | Task |
|--------|------|
| §4.1 knowledge × performance map | 6, 7, 8 |
| §4.2 where the marks go | 10 |
| §4.3 repeat offenders | 11 |
| §4.4 trajectory | 12 |
| §4.5 cohort contrast | 9 |
| §4.6 consultation labels | 13 |
| §5 flashcard grade per topic | 7 (`flashcard_cells`, with the `score` rejection asserted) |
| §6.1 migration 019 | 2, 3, 4 |
| §6.2 tutor label capture | 5 |
| §6.3 case topic on the index | 1 |
| §8 honest states | Carried in the payload as bands, counts and named exclusions; the *rendering* of those states is P2/P3 |

**Deferred to P2/P3, deliberately:** §7 (both documents), §7.4 (console). They render this
payload and are the next two plans.
