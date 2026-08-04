"""The Sub-scores column must never present two scoring eras on one scale.

Commit c227719 changed the OSCE grade from two AI schemes ×50 — where consult + judgement
summed to the /100 on their own — to three buckets 40/30/30. `case_progress` stores
`consult_technique` and `judgement_safety` as bare INTEGERs, so rows written before that
hold /50 values and rows written after hold /30 values, with nothing to tell them apart.
AdminStudentDetail renders them bare, so a trainer reads "40·38" then "22·26" and sees a
performance collapse that is purely a rescale.

`grade_scale` is that missing marker and `checklist_coverage` is the bucket the new scheme
weights heaviest (40 of the 100) and never persisted at all. Both are additive and nullable
(migration 017), so a NULL marker IS the legacy ×50 era — which is why the endpoint must
OMIT the keys on a legacy row rather than defaulting them to a number.
"""
import contextlib
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token
from tests.api.test_admin_student_detail import _detail_patches

client = TestClient(app)


def _detail_with_cases(rows):
    """The student-detail payload with `rows` as s1's own case attempts."""
    stack = _detail_patches() + [
        patch("tools.shared.db.get_case_results", new=AsyncMock(return_value=rows)),
    ]
    with contextlib.ExitStack() as es:
        for p in stack:
            es.enter_context(p)
        r = client.get("/api/admin/student/s1/detail",
                       cookies={"eyebot_token": create_access_token("user_001", "admin", "OA")})
    assert r.status_code == 200, r.text
    return r.json()["cases"][0]


def test_detail_carries_scale_marker_and_checklist_for_current_era():
    """A 40/30/30 row exposes all three buckets plus the marker that fixes the denominators."""
    row = _detail_with_cases([{
        "student_id": "s1", "case_id": "c_new", "total_score": 32, "passed": True,
        "score_100": 80, "safe": True, "grade_scale": 2,
        "checklist_coverage": 32, "consult_technique": 24, "judgement_safety": 24,
    }])
    assert row["grade_scale"] == 2
    assert row["checklist_coverage"] == 32
    assert row["consult_technique"] == 24
    assert row["judgement_safety"] == 24


def test_detail_omits_marker_on_legacy_fifty_scale_rows():
    """A pre-c227719 row has neither column. Omit both keys rather than inventing a scale —
    the frontend reads their absence as the ×50 era and labels the denominators /50."""
    row = _detail_with_cases([{
        "student_id": "s1", "case_id": "c_old", "total_score": 31, "passed": True,
        "score_100": 78, "safe": True,
        "consult_technique": 40, "judgement_safety": 38,
    }])
    assert "grade_scale" not in row
    assert "checklist_coverage" not in row
    # The /50 values still travel — they are correct, only their denominator was missing.
    assert row["consult_technique"] == 40
    assert row["judgement_safety"] == 38


def test_zero_coverage_row_is_still_marked_current_era():
    """The case that rules out inferring the era arithmetically.

    `consult + judgement == score_100` was the tempting discriminator for the ×50 era, and
    it is NOT sound: a current-era row whose student performed no checklist steps scores
    coverage 0, so 22 + 26 == 48 == score_100 there too. Inferring would label this student
    22/50 · 26/50 and understate them — the very error being fixed. The stored marker has
    to survive a zero-coverage row.
    """
    row = _detail_with_cases([{
        "student_id": "s1", "case_id": "c_zero", "total_score": 19, "passed": False,
        "score_100": 48, "safe": True, "grade_scale": 2,
        "checklist_coverage": 0, "consult_technique": 22, "judgement_safety": 26,
    }])
    assert row["grade_scale"] == 2
    assert row["checklist_coverage"] == 0      # a real zero, not a missing column
    assert row["consult_technique"] + row["judgement_safety"] == row["score_100"]
