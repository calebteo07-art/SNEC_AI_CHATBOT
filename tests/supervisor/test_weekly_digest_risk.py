"""Regression guard for the digest's "Students needing attention" row.

The digest is the ONE surface with no drill-down — a supervisor reads the email and acts,
so each row has to carry a reason, not a restatement of the column beside it. P2b
relabelled the table from `Nd inactive` + a weak-topic list to `score · band` + the top
SCORED reason, and that renderer had no test. This locks it.

Two concrete failure modes, both of which produce a plausible-looking email:

**`str(None)`.** `days_inactive` is None for a student flagged on OSCE failure alone
(at_risk.py flags on OSCE without any inactivity signal), and the old renderer
interpolated it straight into the cell, mailing supervisors "Noned inactive".

**The reason that isn't one.** `reasons` arrives sorted by contribution descending
(risk_model.score_student), so `reasons[0]` is the biggest actual driver. Taking anything
else — or falling back to the day count — turns the column into a second copy of the risk
score for every row where inactivity happens to dominate.
"""
from tools.supervisor.weekly_digest import _risk_section, _top_reason


def test_the_top_reason_is_the_highest_weighted_driver():
    # Pre-sorted by get_at_risk/score_student: biggest contributor first.
    row = {
        "reasons": [
            {"factor": "osce_pass_rate", "weight": 31.2, "detail": "Passing 1 of 5 graded stations"},
            {"factor": "inactivity", "weight": 12.0, "detail": "14 days inactive"},
        ],
        "days_inactive": 14,
    }
    assert _top_reason(row) == "Passing 1 of 5 graded stations"


def test_a_student_flagged_without_an_inactivity_signal_never_renders_none():
    row = {
        "reasons": [{"factor": "osce_safety", "weight": 40.0, "detail": "2 unsafe attempts"}],
        "days_inactive": None,
    }
    out = _top_reason(row)

    assert "None" not in out, "days_inactive=None must never reach the rendered cell"
    assert out == "2 unsafe attempts"


def test_falls_back_to_humanised_weak_topics_when_there_are_no_reasons():
    row = {"reasons": [], "weak_topics": ["anterior_segment", "visual_fields", "tonometry", "fourth"]}

    assert _top_reason(row) == "anterior segment, visual fields, tonometry", \
        "at most three, underscores humanised — a raw topic_tag is not supervisor-facing copy"


def test_a_row_with_nothing_to_say_renders_empty_rather_than_crashing():
    # The digest is sent by a Celery worker; an AttributeError here loses the whole email.
    assert _top_reason({}) == ""
    assert _top_reason({"reasons": None, "weak_topics": None}) == ""


def test_the_rendered_row_carries_score_and_band_and_does_not_restate_the_day_count():
    html = _risk_section([{
        "student_id": "s1234567890ab",
        "risk_score": 68,
        "band": "high",
        "reasons": [{"factor": "osce_pass_rate", "weight": 31.2,
                     "detail": "Passing 1 of 5 graded stations"}],
        "days_inactive": 14,
        "weak_topics": ["tonometry"],
    }])

    assert "68 · High" in html
    assert "Passing 1 of 5 graded stations" in html
    # The day count is NOT the reason here, so it must not appear at all — a row that
    # shows both is the pre-P2b table wearing new headers.
    assert "14 days" not in html and "14d" not in html


def test_an_empty_flagged_list_renders_the_all_clear_not_an_empty_table():
    html = _risk_section([])

    assert "No students flagged at risk this week" in html
    assert "<table" not in html, "an empty table under a heading reads as a broken render"


# ── WHO the row is about ─────────────────────────────────────────────────────
# Reported from production against the console's at-risk panel, which had the same
# defect: the flagged list identified students only by a truncated UUID. It is worse
# here. This table is MAILED, and as the module docstring says, it is the one surface
# with no drill-down — a supervisor reading "6393d988-0b6…" cannot look anyone up.

def _flagged(**over):
    row = {"student_id": "6393d988-0b6f-4a11-9e2c-1d7a55c30011", "risk_score": 80,
           "band": "high", "reasons": [{"factor": "inactivity", "weight": 60.0,
                                        "detail": "No activity for 83 days"}],
           "days_inactive": 83, "weak_topics": []}
    row.update(over)
    return row


def test_the_row_names_the_student():
    html = _risk_section([_flagged(full_name="Caleb Teo")])

    assert "Caleb Teo" in html
    assert "6393d988-0b6" not in html, "the id must not sit beside the name in an email"


def test_a_row_with_no_name_still_carries_a_traceable_id():
    """resolve_names() degrades to {}, so an unnamed row is a real wire state. It must
    fall back, never render an empty cell — a blank identity is worse than a raw id."""
    html = _risk_section([_flagged(full_name="")])

    assert "6393d988-0b6" in html


def test_a_name_is_escaped_before_it_reaches_the_email():
    """student_name is person-supplied and now interpolated into HTML that gets mailed."""
    html = _risk_section([_flagged(full_name='<script>alert(1)</script>')])

    assert "<script>" not in html
    assert "&lt;script&gt;" in html


def test_the_column_header_says_student_not_id():
    html = _risk_section([_flagged(full_name="Caleb Teo")])

    assert ">Student</th>" in html
