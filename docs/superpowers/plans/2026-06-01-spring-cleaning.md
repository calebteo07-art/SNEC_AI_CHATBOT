# Spring Cleaning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five tool files that silently read from migrated Sheets tables, update all callers, delete dead files, untrack build artifacts, and remove dead code — without touching any active dev surface.

**Architecture:** All supervisor tools and the progress tool still call `get_rows("snec_profiles/sessions/consent/case_progress")` — tables that moved to Supabase in Phases 1–2. Making them async and switching to `db.*` is the same pattern used in all routers. Test mocks update from `patch("...get_rows")` to `patch("tools.shared.db.*")`. Structural cleanup (deletes, git untrack) is independent and safe.

**Tech Stack:** `supabase-py` async client (already in `tools/shared/db.py`), `pytest-asyncio`, FastAPI async route handlers.

**Design spec:** `docs/superpowers/specs/2026-06-01-spring-cleaning-design.md`

---

## Files Modified / Created

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `tools/progress/get_progress.py` | async, db.get_sessions() |
| Modify | `tools/api/routers/chat.py` | await _get_progress() at 2 call sites |
| Modify | `tools/supervisor/cohort_summary.py` | async, db.get_all_profiles(), native types |
| Modify | `tools/supervisor/cohort_benchmarks.py` | async, db.get_all_profiles(), native types |
| Modify | `tools/supervisor/at_risk.py` | async, db.get_all_profiles(), native types |
| Modify | `tools/supervisor/generate_report.py` | async, db.get_consent_by_student_id(), db.get_case_results() |
| Modify | `tools/supervisor/weekly_digest.py` | async build_digest_html + send_weekly_digest |
| Modify | `tools/api/routers/supervisor.py` | await all supervisor tool calls |
| Modify | `tests/supervisor/test_at_risk.py` | async tests, mock db.get_all_profiles |
| Modify | `tests/supervisor/test_cohort_summary.py` | async tests, mock db.get_all_profiles |
| Modify | `tools/shared/gsheets.py` | delete 3 dead async wrappers |
| Delete | `tools/profile/bootstrap_sheets.py` | dead setup script |
| Delete | `.superpowers/brainstorm/1725-1779868048/` | stale HTML artefacts |
| Delete | `pnpm-lock.yaml` (root) | orphaned lock file |
| Untrack | `frontend/dist/` | build artefacts committed before .gitignore rule |
| Delete | `docs/superpowers/plans/*.md` (8 files) | completed plans |

**What is NOT touched:** `tools/flashcards/`, `tools/supervisor/weekly_digest.py` Sheets calls (snec_flashcards/snec_supervisor_alerts stay on Sheets), `tools/shared/reauth.py`, `tools/kb/`, `workflows/`, `GEMINI.md`, `tests/` (except supervisor tests), `db.py` docstrings.

---

## Task 1: Fix get_progress.py — async + db.get_sessions()

**Files:**
- Modify: `tools/progress/get_progress.py`

The function currently calls sync `get_profile()` (now async) and reads session history from the migrated `snec_sessions` Sheets table. `db.get_sessions()` already returns rows newest-first, capped at limit — so no need to reverse.

- [ ] **Step 1: Replace full content of tools/progress/get_progress.py**

```python
#!/usr/bin/env python3
"""Compute a student's learning progress for the Progress screen."""
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.profile.get_profile import get_profile
from tools.shared import db


async def get_progress(student_id: str) -> dict:
    """Return structured progress data for the given student.

    Returns:
        {
          "session_count": int,
          "streak": int,
          "learning_velocity": str,
          "weak_topics": list[str],
          "topic_performance": list[{"topic": str, "score": float}],
          "sessions": list[{"session_id": str, "timestamp": str,
                            "topic": str, "summary": str, "mode": str}],
        }
    """
    profile = await get_profile(student_id)

    streak = int(profile.get("streak") or 0)
    session_count = int(profile.get("session_count") or 0)
    velocity = profile.get("learning_velocity") or "stable"
    weak_topics = profile.get("weak_topics") or []
    retention: dict = profile.get("retention_scores") or {}

    topic_performance = [
        {"topic": t, "score": round(s, 3)}
        for t, s in sorted(retention.items(), key=lambda x: x[1])
    ]

    raw_sessions = []
    try:
        raw_sessions = await db.get_sessions(student_id, limit=30)
    except Exception:
        pass

    sessions = []
    for s in raw_sessions:
        ts = str(s.get("created_at", ""))
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            friendly = dt.strftime("%d %b %Y")
        except Exception:
            friendly = ts[:10]
        sessions.append({
            "session_id": str(s.get("session_id", "")),
            "timestamp": friendly,
            "topic": s.get("topic") or "—",
            "summary": s.get("summary", ""),
            "mode": "chat",
        })

    return {
        "session_count": session_count,
        "streak": streak,
        "learning_velocity": velocity,
        "weak_topics": list(weak_topics)[:5],
        "topic_performance": topic_performance,
        "sessions": sessions,
    }
```

- [ ] **Step 2: Verify syntax**

```bash
python -c "import tools.progress.get_progress; print('ok')"
```

Expected: `ok`

---

## Task 2: Update chat.py — await get_progress at both call sites

**Files:**
- Modify: `tools/api/routers/chat.py`

Two route handlers call `_get_progress(student_id)` synchronously. Both handlers are already `async def` so adding `await` is all that's needed.

- [ ] **Step 1: Read lines 175–200 of tools/api/routers/chat.py to find the exact call sites**

- [ ] **Step 2: Change both call sites**

Find:
```python
        return _get_progress(student_id)
```
Replace ALL occurrences with:
```python
        return await _get_progress(student_id)
```

There are exactly 2 occurrences (in `get_my_progress` and `get_student_progress`).

- [ ] **Step 3: Run full test suite**

```bash
python -m pytest tests/ -q 2>&1 | tail -5
```

Expected: 139 passed.

- [ ] **Step 4: Commit**

```bash
git add tools/progress/get_progress.py tools/api/routers/chat.py
git commit -m "fix: get_progress async, reads chat_sessions from Supabase"
```

---

## Task 3: Fix cohort_summary.py — async + db.get_all_profiles()

**Files:**
- Modify: `tools/supervisor/cohort_summary.py`

Profiles from Supabase have native Python types: `weak_topics` is a `list`, `last_active` is a date string or `None` (not needing fromisoformat change — still works). No `json.loads` needed.

- [ ] **Step 1: Replace full content of tools/supervisor/cohort_summary.py**

```python
#!/usr/bin/env python3
"""Aggregate all student profiles into cohort-level statistics."""
import sys
from collections import Counter
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared import db
from tools.shared.audit_log import log


async def cohort_summary() -> dict:
    """
    Returns:
        {
            "total": int,
            "active_this_week": int,
            "inactive_7_plus_days": list[dict],
            "weakest_topics": list[str],
            "at_risk_count": int,
        }
    """
    try:
        profiles = await db.get_all_profiles()
    except Exception as exc:
        log("cohort_summary_error", feature="supervisor", detail=str(exc))
        return {
            "total": 0, "active_this_week": 0,
            "inactive_7_plus_days": [], "weakest_topics": [], "at_risk_count": 0,
        }

    today = date.today()
    active_this_week = 0
    inactive_7_plus = []
    topic_counter: Counter = Counter()
    at_risk_count = 0

    for p in profiles:
        last_active_raw = p.get("last_active")
        days_inactive = None
        if last_active_raw:
            try:
                last = date.fromisoformat(str(last_active_raw))
                days_inactive = (today - last).days
                if days_inactive < 7:
                    active_this_week += 1
                else:
                    inactive_7_plus.append({
                        "student_id": p["student_id"],
                        "last_active": str(last_active_raw),
                        "days_inactive": days_inactive,
                    })
            except (ValueError, TypeError):
                pass

        weak = p.get("weak_topics") or []
        topic_counter.update(weak)

        if days_inactive is not None and days_inactive >= 5 and len(weak) >= 2:
            at_risk_count += 1

    return {
        "total": len(profiles),
        "active_this_week": active_this_week,
        "inactive_7_plus_days": inactive_7_plus,
        "weakest_topics": [t for t, _ in topic_counter.most_common(3)],
        "at_risk_count": at_risk_count,
    }
```

- [ ] **Step 2: Verify syntax**

```bash
python -c "import tools.supervisor.cohort_summary; print('ok')"
```

Expected: `ok`

---

## Task 4: Fix cohort_benchmarks.py — async + db.get_all_profiles()

**Files:**
- Modify: `tools/supervisor/cohort_benchmarks.py`

Profiles now have `retention_scores` as a native `dict` — no `json.loads` needed.

- [ ] **Step 1: Replace full content of tools/supervisor/cohort_benchmarks.py**

```python
#!/usr/bin/env python3
"""Compute per-topic average retention scores across the whole cohort."""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared import db


async def get_cohort_benchmarks() -> list[dict]:
    """Return topics sorted weakest-first with cohort average retention.

    Only includes topics that appear in >= 2 student profiles.

    Returns:
        list of {"topic": str, "avg_score": float, "student_count": int}
    """
    try:
        profiles = await db.get_all_profiles()
    except Exception:
        return []

    totals: dict[str, float] = {}
    counts: dict[str, int] = {}

    for p in profiles:
        scores = p.get("retention_scores") or {}
        for topic, score in scores.items():
            try:
                score_f = float(score)
            except (TypeError, ValueError):
                continue
            totals[topic] = totals.get(topic, 0.0) + score_f
            counts[topic] = counts.get(topic, 0) + 1

    benchmarks = [
        {
            "topic": topic,
            "avg_score": round(totals[topic] / counts[topic], 4),
            "student_count": counts[topic],
        }
        for topic in totals
        if counts[topic] >= 2
    ]
    benchmarks.sort(key=lambda x: x["avg_score"])
    return benchmarks
```

- [ ] **Step 2: Verify syntax**

```bash
python -c "import tools.supervisor.cohort_benchmarks; print('ok')"
```

Expected: `ok`

---

## Task 5: Fix at_risk.py — async + db.get_all_profiles()

**Files:**
- Modify: `tools/supervisor/at_risk.py`

- [ ] **Step 1: Replace full content of tools/supervisor/at_risk.py**

```python
#!/usr/bin/env python3
"""Flag students who meet the at-risk threshold:
no login in 5+ days AND 2+ unresolved weak topics.
"""
import sys
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared import db
from tools.shared.audit_log import log

INACTIVE_THRESHOLD_DAYS = 5
WEAK_TOPIC_THRESHOLD = 2


async def get_at_risk() -> list[dict]:
    """
    Returns list of dicts:
        {student_id, last_active, days_inactive, weak_topics, weak_count}
    """
    try:
        profiles = await db.get_all_profiles()
    except Exception as exc:
        log("at_risk_error", feature="supervisor", detail=str(exc))
        return []

    today = date.today()
    at_risk = []

    for p in profiles:
        last_active_raw = p.get("last_active")
        if not last_active_raw:
            continue
        try:
            last = date.fromisoformat(str(last_active_raw))
            days_inactive = (today - last).days
        except (ValueError, TypeError):
            continue

        weak = p.get("weak_topics") or []

        if days_inactive >= INACTIVE_THRESHOLD_DAYS and len(weak) >= WEAK_TOPIC_THRESHOLD:
            at_risk.append({
                "student_id": p["student_id"],
                "last_active": str(last_active_raw),
                "days_inactive": days_inactive,
                "weak_topics": weak,
                "weak_count": len(weak),
            })

    return at_risk
```

- [ ] **Step 2: Verify syntax**

```bash
python -c "import tools.supervisor.at_risk; print('ok')"
```

Expected: `ok`

---

## Task 6: Fix generate_report.py and weekly_digest.py — async

**Files:**
- Modify: `tools/supervisor/generate_report.py`
- Modify: `tools/supervisor/weekly_digest.py`

`generate_report.py` currently calls `get_profile()`, `get_case_progress()` (both already async), and `get_rows("snec_consent/snec_case_progress")` — all without `await`, so the PDF always 500s. `weekly_digest.py` calls the now-async supervisor tools in a sync context.

- [ ] **Step 1: Replace the content of tools/supervisor/generate_report.py**

Replace ONLY the import block and the two functions `_get_student_name` and `generate_student_report`. Everything from the `buf = io.BytesIO()` line onwards (the PDF layout code) stays unchanged.

Replace from the top of the file through `def generate_student_report` until `buf = io.BytesIO()`:

```python
#!/usr/bin/env python3
"""Generate a one-page PDF student report for a supervisor."""

import asyncio
import io
import json
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, Spacer, SimpleDocTemplate, HRFlowable, Table, TableStyle

from tools.shared import db
from tools.profile.get_profile import get_profile

BRAND = colors.HexColor("#8C6D3F")
MUTED = colors.HexColor("#A39A8E")
DARK = colors.HexColor("#1F1A12")
RED = colors.HexColor("#8B2D2D")
GREEN = colors.HexColor("#4F6B3D")


async def _get_student_name(student_id: str) -> str:
    try:
        row = await db.get_consent_by_student_id(student_id)
        if row:
            return row.get("student_name", "") or row.get("email", student_id[:8])
    except Exception:
        pass
    return student_id[:8] + "…"


async def generate_student_report(student_id: str) -> bytes:
    """Return a one-page PDF report as bytes."""
    profile = await get_profile(student_id)
    name = await _get_student_name(student_id)
    case_rows = await db.get_case_results(student_id)

    weak_topics: list[str] = profile.get("weak_topics") or []
    retention: dict[str, float] = profile.get("retention_scores") or {}
    supervisor_note: str = profile.get("supervisor_note", "") or ""
    role: str = profile.get("role", "—")
    session_count: int = int(profile.get("session_count") or 0)
    streak: int = int(profile.get("streak") or 0)
    last_active: str = str(profile.get("last_active") or "—")
    velocity: str = profile.get("learning_velocity", "stable") or "stable"

    # Recent case attempts (up to 5, most recent first)
    recent_cases: list[dict] = []
    case_rows_sorted = sorted(case_rows, key=lambda r: str(r.get("completed_at", "")), reverse=True)
    seen: set[str] = set()
    for row in case_rows_sorted:
        cid = row.get("case_id", "")
        if cid and cid not in seen:
            seen.add(cid)
            recent_cases.append({
                "case_id": cid,
                "score": int(row.get("total_score") or 0),
                "passed": bool(row.get("passed", False)),
            })
        if len(recent_cases) >= 5:
            break
```

Then keep all remaining PDF layout code unchanged from `buf = io.BytesIO()` to end of file.

- [ ] **Step 2: Update weekly_digest.py — make build_digest_html and send_weekly_digest async**

Read `tools/supervisor/weekly_digest.py` and make these targeted changes:

Find the imports at the top of weekly_digest.py. Add the missing imports:
```python
import asyncio
```
(Add after existing imports, before the function definitions.)

Find:
```python
def build_digest_html(supervisor_email: str) -> str:
    summary    = cohort_summary()
    at_risk    = get_at_risk()
    benchmarks = get_cohort_benchmarks()
```
Replace with:
```python
async def build_digest_html(supervisor_email: str) -> str:
    summary    = await cohort_summary()
    at_risk    = await get_at_risk()
    benchmarks = await get_cohort_benchmarks()
```

Find:
```python
def send_weekly_digest(supervisor_email: str) -> None:
    html = build_digest_html(supervisor_email)
```
Replace with:
```python
async def send_weekly_digest(supervisor_email: str) -> None:
    html = await build_digest_html(supervisor_email)
```

- [ ] **Step 3: Verify syntax on both files**

```bash
python -c "import tools.supervisor.generate_report; print('ok')"
python -c "import tools.supervisor.weekly_digest; print('ok')"
```

Expected: both print `ok`

---

## Task 7: Update supervisor.py router — await all supervisor tool calls

**Files:**
- Modify: `tools/api/routers/supervisor.py`

All five supervisor tools are now async. The route handlers are already `async def`. Add `await` at each call site.

- [ ] **Step 1: Make all 8 targeted replacements**

In `supervisor_cohort`:
```python
# OLD:
result = _cohort_summary()
# NEW:
result = await _cohort_summary()
```

In `supervisor_at_risk`:
```python
# OLD:
students = _get_at_risk()
# NEW:
students = await _get_at_risk()
```

In `supervisor_student_report`:
```python
# OLD:
pdf_bytes = _generate_report(student_id)
# NEW:
pdf_bytes = await _generate_report(student_id)
```

In `supervisor_benchmarks`:
```python
# OLD:
topics = _get_benchmarks()
# NEW:
topics = await _get_benchmarks()
```

In `supervisor_send_digest`:
```python
# OLD:
_send_digest(body.recipient)
# NEW:
await _send_digest(body.recipient)
```

In `supervisor_insights` (two calls):
```python
# OLD:
cohort = _cohort_summary()
at_risk = _get_at_risk()
# NEW:
cohort = await _cohort_summary()
at_risk = await _get_at_risk()
```

- [ ] **Step 2: Verify no remaining un-awaited supervisor calls**

```bash
grep -n "_cohort_summary\|_get_at_risk\|_get_benchmarks\|_generate_report\|_send_digest" tools/api/routers/supervisor.py
```

Every line should have `await` before the call.

- [ ] **Step 3: Run full test suite**

```bash
python -m pytest tests/ -q 2>&1 | tail -5
```

Expected: 139 passed (supervisor tests haven't been updated yet — they mock sync functions so they'll still pass).

- [ ] **Step 4: Commit Tasks 3–7**

```bash
git add tools/supervisor/cohort_summary.py tools/supervisor/cohort_benchmarks.py \
        tools/supervisor/at_risk.py tools/supervisor/generate_report.py \
        tools/supervisor/weekly_digest.py tools/api/routers/supervisor.py
git commit -m "fix: supervisor tools async, read from Supabase profiles/consent/cases"
```

---

## Task 8: Update supervisor tests — async + mock db

**Files:**
- Modify: `tests/supervisor/test_at_risk.py`
- Modify: `tests/supervisor/test_cohort_summary.py`

Both test files patch `get_rows` and use JSON-string profile data. After the fix, they must patch `tools.shared.db.get_all_profiles` and use native Python types.

- [ ] **Step 1: Replace full content of tests/supervisor/test_at_risk.py**

```python
import pytest
from unittest.mock import AsyncMock, patch
from datetime import date


def _profile(sid, weak_topics, last_active):
    return {
        "student_id": sid,
        "weak_topics": weak_topics,
        "last_active": last_active,
    }


@pytest.mark.asyncio
async def test_at_risk_flags_inactive_with_weak_topics():
    profiles = [
        _profile("s1", ["glaucoma", "retina"], "2026-05-04"),  # 6 days ago, 2 weak
        _profile("s2", ["glaucoma"], "2026-05-04"),              # 6 days ago, 1 weak
        _profile("s3", ["glaucoma", "retina"], "2026-05-09"),   # 1 day ago, 2 weak
    ]
    with patch("tools.shared.db.get_all_profiles", new=AsyncMock(return_value=profiles)), \
         patch("tools.supervisor.at_risk.date") as mock_date:
        mock_date.today.return_value = date(2026, 5, 10)
        mock_date.fromisoformat = date.fromisoformat
        from tools.supervisor.at_risk import get_at_risk
        result = await get_at_risk()
    assert len(result) == 1
    assert result[0]["student_id"] == "s1"


@pytest.mark.asyncio
async def test_at_risk_empty_when_all_active():
    profiles = [
        _profile("s1", ["glaucoma", "retina"], "2026-05-09"),
        _profile("s2", ["glaucoma", "retina"], "2026-05-10"),
    ]
    with patch("tools.shared.db.get_all_profiles", new=AsyncMock(return_value=profiles)), \
         patch("tools.supervisor.at_risk.date") as mock_date:
        mock_date.today.return_value = date(2026, 5, 10)
        mock_date.fromisoformat = date.fromisoformat
        from tools.supervisor.at_risk import get_at_risk
        result = await get_at_risk()
    assert result == []
```

- [ ] **Step 2: Replace full content of tests/supervisor/test_cohort_summary.py**

```python
import pytest
from unittest.mock import AsyncMock, patch
from datetime import date as real_date


def _profile(sid, weak_topics, last_active, retention_scores=None):
    return {
        "student_id": sid,
        "weak_topics": weak_topics,
        "missed_findings": [],
        "retention_scores": retention_scores or {},
        "session_count": 5,
        "streak": 2,
        "last_active": last_active,
        "learning_velocity": "stable",
        "checkin_done_today": False,
    }


@pytest.mark.asyncio
async def test_cohort_summary_active_count():
    profiles = [
        _profile("s1", ["glaucoma"], "2026-05-09"),
        _profile("s2", ["retina"], "2026-05-03"),
        _profile("s3", [], "2026-05-10"),
    ]
    with patch("tools.shared.db.get_all_profiles", new=AsyncMock(return_value=profiles)), \
         patch("tools.supervisor.cohort_summary.date") as mock_date:
        mock_date.today.return_value = real_date(2026, 5, 10)
        mock_date.fromisoformat = real_date.fromisoformat
        from tools.supervisor.cohort_summary import cohort_summary
        result = await cohort_summary()
    assert result["total"] == 3
    assert result["active_this_week"] == 2  # s1 (1 day ago) and s3 (today)


@pytest.mark.asyncio
async def test_cohort_summary_weakest_topics():
    profiles = [
        _profile("s1", ["glaucoma", "retina"], "2026-05-10"),
        _profile("s2", ["glaucoma"], "2026-05-10"),
        _profile("s3", ["cornea"], "2026-05-10"),
    ]
    with patch("tools.shared.db.get_all_profiles", new=AsyncMock(return_value=profiles)), \
         patch("tools.supervisor.cohort_summary.date") as mock_date:
        mock_date.today.return_value = real_date(2026, 5, 10)
        mock_date.fromisoformat = real_date.fromisoformat
        from tools.supervisor.cohort_summary import cohort_summary
        result = await cohort_summary()
    assert result["weakest_topics"][0] == "glaucoma"  # appears in 2 profiles
```

- [ ] **Step 3: Run full test suite**

```bash
python -m pytest tests/ -q 2>&1 | tail -5
```

Expected: 139 passed.

- [ ] **Step 4: Commit**

```bash
git add tests/supervisor/test_at_risk.py tests/supervisor/test_cohort_summary.py
git commit -m "test: update supervisor tests for async db.get_all_profiles"
```

---

## Task 9: Remove dead gsheets async wrappers

**Files:**
- Modify: `tools/shared/gsheets.py`

`get_rows_async`, `append_row_async`, `update_row_async` were added in Phase 1 as a bridge. No file imports them anymore. Delete those ~15 lines.

- [ ] **Step 1: Read tools/shared/gsheets.py lines 184–200 to find the exact async wrapper block**

- [ ] **Step 2: Delete the three async wrapper functions**

Delete from (and including):
```python
async def get_rows_async(sheet_name: str, filters: dict | None = None) -> list[dict]:
    """Async wrapper — runs get_rows in a thread so it does not block the event loop."""
    return await asyncio.to_thread(get_rows, sheet_name, filters)


async def append_row_async(sheet_name: str, row: dict) -> None:
    """Async wrapper — runs append_row in a thread so it does not block the event loop."""
    await asyncio.to_thread(append_row, sheet_name, row)


async def update_row_async(
    sheet_name: str, key_col: str, key_val: str, updates: dict
) -> None:
    """Async wrapper — runs update_row in a thread so it does not block the event loop."""
    await asyncio.to_thread(update_row, sheet_name, key_col, key_val, updates)
```

Also remove the `import asyncio` line at the top if `asyncio` is no longer used elsewhere in the file.

- [ ] **Step 3: Confirm no remaining imports of the deleted functions**

```bash
grep -rn "get_rows_async\|append_row_async\|update_row_async" tools/ tests/ --include="*.py"
```

Expected: no output.

- [ ] **Step 4: Run full test suite**

```bash
python -m pytest tests/ -q 2>&1 | tail -5
```

Expected: 139 passed.

- [ ] **Step 5: Commit**

```bash
git add tools/shared/gsheets.py
git commit -m "chore: remove dead gsheets async wrappers (all routers now use db.*)"
```

---

## Task 10: Delete dead files

**Files:**
- Delete: `tools/profile/bootstrap_sheets.py`
- Delete: `.superpowers/` directory (stale brainstorm artefacts)
- Delete: `pnpm-lock.yaml` (root)

- [ ] **Step 1: Delete the three targets**

```bash
git rm tools/profile/bootstrap_sheets.py
git rm -r .superpowers/
git rm pnpm-lock.yaml
```

- [ ] **Step 2: Verify gone**

```bash
ls tools/profile/bootstrap_sheets.py .superpowers pnpm-lock.yaml 2>&1
```

Expected: "No such file or directory" for all three.

- [ ] **Step 3: Run full test suite**

```bash
python -m pytest tests/ -q 2>&1 | tail -5
```

Expected: 139 passed.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: delete dead files (bootstrap_sheets, superpowers artefacts, root pnpm-lock)"
```

---

## Task 11: Untrack frontend/dist from git

**Files:**
- Untrack: `frontend/dist/` (already gitignored, but was committed before the rule was active)

- [ ] **Step 1: Remove from git tracking without deleting local files**

```bash
git rm -r --cached frontend/dist/
```

- [ ] **Step 2: Confirm .gitignore already covers it**

```bash
grep "dist" .gitignore
```

Expected: `dist/` is present.

- [ ] **Step 3: Confirm it won't be re-added**

```bash
git status frontend/dist/
```

Expected: nothing — it should now be ignored.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: untrack frontend/dist build artefacts from git"
```

---

## Task 12: Delete completed plan docs

**Files:**
- Delete: all 8 files in `docs/superpowers/plans/`

These are fully implemented plans. They live in `.claudeignore` so they never load into context. The git history preserves them.

- [ ] **Step 1: Delete all plan files**

```bash
git rm docs/superpowers/plans/2026-05-27-admin-dashboard.md \
        docs/superpowers/plans/2026-05-28-case-difficulty-locks.md \
        docs/superpowers/plans/2026-05-28-jwt-authentication.md \
        docs/superpowers/plans/2026-05-28-otp-supabase-storage.md \
        docs/superpowers/plans/2026-05-28-split-server-routers.md \
        docs/superpowers/plans/2026-05-30-day5-mobile-pwa.md \
        docs/superpowers/plans/2026-05-30-phase1-db-migration-cookies.md \
        docs/superpowers/plans/2026-06-01-phase2-remaining-sheets-migration.md
```

- [ ] **Step 2: Verify docs/superpowers/plans/ is now empty**

```bash
ls docs/superpowers/plans/
```

Expected: empty directory or "No such file or directory".

- [ ] **Step 3: Commit and push everything**

```bash
git commit -m "chore: delete completed plan docs (all implemented, preserved in git history)"
git push
```

---

## Task 13: Final verification

- [ ] **Step 1: Full test suite — must be 139 passed**

```bash
python -m pytest tests/ -v 2>&1 | tail -20
```

Expected: 139 passed, 0 failed.

- [ ] **Step 2: Confirm no remaining stale Sheets reads for migrated tables**

```bash
grep -rn "snec_sessions\|snec_profiles\|snec_case_progress\|snec_consent\|snec_approved_students\|snec_supervisors" tools/ --include="*.py" | grep -v "bootstrap\|migrate\|# "
```

Expected: no output (all stale reads eliminated).

- [ ] **Step 3: Confirm no remaining dead async wrappers**

```bash
grep -rn "get_rows_async\|append_row_async\|update_row_async" . --include="*.py"
```

Expected: no output.

- [ ] **Step 4: Confirm git is clean**

```bash
git status
```

Expected: clean working tree.

---

## Self-Review

### Spec coverage
| Requirement | Task |
|---|---|
| Fix get_progress.py | Tasks 1–2 |
| Fix cohort_summary.py | Task 3 |
| Fix cohort_benchmarks.py | Task 4 |
| Fix at_risk.py | Task 5 |
| Fix generate_report.py | Task 6 |
| Fix weekly_digest.py | Task 6 |
| Update supervisor.py router | Task 7 |
| Update supervisor tests | Task 8 |
| Remove dead gsheets async wrappers | Task 9 |
| Delete bootstrap_sheets.py | Task 10 |
| Delete .superpowers/ artefacts | Task 10 |
| Delete root pnpm-lock.yaml | Task 10 |
| Untrack frontend/dist | Task 11 |
| Delete completed plan docs | Task 12 |

### Placeholder scan
No TBD, no vague steps. All code shown in full.

### Type consistency
- `db.get_all_profiles()` → `list[dict]` with native types — used consistently in Tasks 3–5
- `db.get_consent_by_student_id(student_id)` → `dict | None` — used in Tasks 6
- `db.get_case_results(student_id)` → `list[dict]` with `completed_at`, `case_id`, `total_score`, `passed` (bool) — used in Task 6
- `db.get_sessions(student_id, limit)` → `list[dict]` with `created_at`, `session_id`, `topic`, `summary` — used in Task 1
- All supervisor tool functions: `async def` → all callers in supervisor.py use `await` (Task 7)
- Profile native types: `weak_topics` is `list`, `retention_scores` is `dict` — no `json.loads` in any task

### What is not touched
- `tools/flashcards/generate_cards.py` — uses `snec_flashcards` (stays on Sheets, intentional)
- `tools/supervisor/weekly_digest.py` email/alert Sheets calls — untouched
- `tools/kb/` — untouched
- `tools/shared/reauth.py` — untouched
- `workflows/` — untouched
- `GEMINI.md` — untouched
- `tests/` except supervisor — untouched
- `db.py` — untouched (no modifications needed)
- All active router files except `chat.py` and `supervisor.py` — untouched
