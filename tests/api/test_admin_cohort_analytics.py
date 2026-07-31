"""GET /api/admin/cohort-analytics — cohort performance from real OSCE + flashcard events.

Guards, in order of how badly each one burned us before:

1. STAFF ARE NOT STUDENTS. The population is db.get_active_student_profiles() (D10), which
   subtracts supervisors membership. db.get_active_profiles() is NOT staff-free — a promoted
   student keeps their approved_students row (admin.py:288-301) and the super-admin's address
   is routinely on the roster — and get_active_leaderboard_profiles() adds trainers/admins on
   purpose. Either one folds a lecturer's demo run into the cohort mean, forever.
2. A FLASHCARD OUTAGE IS NOT 0%. flashcard_attempts only started receiving rows in P2, so
   an empty/failing read is the NORMAL case and must render as "no data" — never a 0% bar.
3. AN OSCE OUTAGE IS NOT AN EMPTY COHORT. The opposite call: a failed case/profile read is
   a real 500. "The database is down" and "nobody has attempted anything" must not look
   identical on screen — that is precisely the P1 defect this phase exists to finish killing.
4. THE AGGREGATOR SEAM SURVIVES. Every aggregator returns dict[topic_group, {...}] and the
   endpoint is a thin projection over it, so Plan B's /student/{id}/detail cohort_avg can
   read the same dict. Enforced here, before Plan B exists (D4).
5. THE HONESTY SIGNALS REACH THE CLIENT. An unrecognised topic_tag is bucketed, not dropped,
   so drift renders as a complete and plausible panel; and weakness_score is a weighted,
   shrunk composite whose safety term is diluted by construction. The drift counter and the
   rubric (caveat included) are the only things that make either visible.
"""
import time
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from tools.api.routers import admin as admin_router
from tools.api.server import app
from tools.shared.jwt_utils import create_access_token
from tools.supervisor.cohort_analytics import WEIGHT_RUBRIC, osce_by_group
from tools.supervisor.discipline import pool_by_student
from tools.supervisor.topic_crosswalk import flashcard_group

client = TestClient(app)

_NOW = datetime.now(timezone.utc)

# Resolved THROUGH the crosswalk, not hardcoded, so this file tests the bucketing path
# rather than a private copy of Task 3's map. Task 3's review split the 12 FOUNDATIONS
# topics out of one shared bucket, so this is `knowledge_anatomy_physiology` — there is no
# `knowledge_foundations` group any more.
_KNOWLEDGE = flashcard_group("anatomy_physiology")


def _ts(days_ago: int) -> str:
    return (_NOW - timedelta(days=days_ago)).isoformat()


def _staff_cookie():
    # Unique sub per test FILE: slowapi keys the 30/minute bucket on the JWT sub, so a
    # shared sub would let another file's requests rate-limit these.
    return {"eyebot_token": create_access_token("stu_cohort_analytics", "admin", "OA")}


# Two OA/PSA students and one OT student. Roles map through discipline.pool_by_student:
# {OA, PSA} -> CLINICAL, {OT} -> OT.
_PROFILES = [
    {"student_id": "s_oa", "role": "OA"},
    {"student_id": "s_psa", "role": "PSA"},
    {"student_id": "s_ot", "role": "OT"},
]

# student_consent, needed only when the real db.get_active_student_profiles() runs (the
# staff test below). It joins supervisors -> consent.email -> student_id to subtract staff.
_CONSENT = [
    {"student_id": "s_oa", "email": "oa@x.edu"},
    {"student_id": "s_psa", "email": "psa@x.edu"},
    {"student_id": "s_ot", "email": "ot@x.edu"},
]

# A stand-in case index (the real one globs 155 case files). Same shape classify_case
# emits: {"pool", "set_key", "label", "difficulty"}.
_CASE_INDEX = {
    "case_oa_iop_01": {"pool": "CLINICAL", "set_key": "tonometry_iop",
                       "label": "Intraocular Pressure", "difficulty": "beginner"},
    "case_oa_iop_02": {"pool": "CLINICAL", "set_key": "tonometry_iop",
                       "label": "Intraocular Pressure", "difficulty": "intermediate"},
    "case_ot_oct_01": {"pool": "OT", "set_key": "oct_imaging",
                       "label": "OCT Imaging", "difficulty": "beginner"},
    # Only the ranking test below puts attempts on these two; a group materialises from
    # ROWS, not from the index, so they are inert everywhere else.
    "case_oa_drops_01": {"pool": "CLINICAL", "set_key": "eye_drops",
                         "label": "Eye Drop Instillation", "difficulty": "beginner"},
    "case_oa_fall_01": {"pool": "CLINICAL", "set_key": "fall_risk",
                        "label": "Fall Risk & Assessment", "difficulty": "beginner"},
}

_CASE_ROWS = [
    {"student_id": "s_oa", "case_id": "case_oa_iop_01", "completed_at": _ts(2),
     "score_100": 78, "safe": True, "passed": True, "total_score": 31},
    {"student_id": "s_oa", "case_id": "case_oa_iop_02", "completed_at": _ts(3),
     "score_100": 64, "safe": False, "passed": False, "total_score": 25},
    {"student_id": "s_psa", "case_id": "case_oa_iop_01", "completed_at": _ts(4),
     "score_100": 55, "safe": True, "passed": False, "total_score": 22},
    {"student_id": "s_ot", "case_id": "case_ot_oct_01", "completed_at": _ts(5),
     "score_100": 90, "safe": True, "passed": True, "total_score": 36},
]

# anatomy_physiology is a FOUNDATIONS topic, which §4.2 routes to a knowledge_* pseudo-group
# for every role; iop_nct is a CLINICAL procedural topic that pairs with a real station.
_FC_ROWS = [
    {"student_id": "s_oa", "topic_tag": "anatomy_physiology", "correct": True, "ts": _ts(2)},
    {"student_id": "s_oa", "topic_tag": "anatomy_physiology", "correct": False, "ts": _ts(2)},
    {"student_id": "s_psa", "topic_tag": "anatomy_physiology", "correct": True, "ts": _ts(3)},
    {"student_id": "s_oa", "topic_tag": "iop_nct", "correct": False, "ts": _ts(3)},
    {"student_id": "s_ot", "topic_tag": "anatomy_physiology", "correct": True, "ts": _ts(4)},
]


@pytest.fixture(autouse=True)
def _no_cohort_cache():
    """Disable BOTH caches in this file's path.

    The endpoint keeps a per-worker TTL cache keyed on (discipline, days) — without
    clearing it every test after the first would assert against the FIRST test's payload,
    patched DB mocks and all. TTL=0 disables its read and its write.

    The shared cohort READ cache underneath is disabled for the same reason and one more:
    several tests here issue multiple requests under DIFFERENT stubbed rows, and a live
    read cache would serve the first request's tables to all of them. It also decouples
    `await_count` from "the derived cache was missed", which is exactly what two tests
    below use it to measure. Read-sharing across endpoints is pinned in
    tests/api/test_admin_read_sharing.py, where it is the subject rather than a confound.
    """
    from tools.supervisor import cohort_reads

    admin_router._cohort_cache.clear()
    with patch("tools.api.routers.admin._COHORT_TTL_SECONDS", 0.0), \
         patch.object(cohort_reads, "_READ_TTL_S", 0):
        yield
    admin_router._cohort_cache.clear()


def _patches(case_rows=None, fc_rows=None, profiles=None, staff_excluded=0):
    # The population read is stubbed WHOLE here — db.get_active_student_profiles() returns
    # (students, staff_excluded) — so these tests assert over an already-clean cohort. The
    # subtraction itself is exercised end-to-end by test_cohort_analytics_excludes_staff
    # below, which stubs the function's INPUTS instead and lets the real join run.
    return (
        patch("tools.shared.db.get_active_student_profiles",
              new=AsyncMock(return_value=(_PROFILES if profiles is None else profiles,
                                          staff_excluded))),
        patch("tools.shared.db.get_all_case_scores",
              new=AsyncMock(return_value=(_CASE_ROWS if case_rows is None else case_rows, True))),
        patch("tools.shared.db.get_all_flashcard_attempts",
              new=AsyncMock(return_value=(_FC_ROWS if fc_rows is None else fc_rows, True))),
        patch("tools.api.routers.admin.get_case_index",
              new=AsyncMock(return_value=_CASE_INDEX)),
    )


def _get(query="", **kw):
    p1, p2, p3, p4 = _patches(**kw)
    with p1, p2, p3, p4:
        return client.get("/api/admin/cohort-analytics" + query, cookies=_staff_cookie())


def _get_real_population(query, *, profiles, consent, supervisors, case_rows):
    """Same request, but with the REAL db.get_active_student_profiles() in the path — only
    its four reads are stubbed. Every one of them must be: an unstubbed db.* call in an
    endpoint test reads live production Supabase."""
    _p1, p2, p3, p4 = _patches(case_rows=case_rows)
    with p2, p3, p4, \
         patch("tools.shared.db.get_active_profiles", new=AsyncMock(return_value=profiles)), \
         patch("tools.shared.db.get_all_consent", new=AsyncMock(return_value=consent)), \
         patch("tools.shared.db.get_all_supervisors", new=AsyncMock(return_value=supervisors)), \
         patch("tools.shared.db.super_admin_email", new=lambda: ""):
        return client.get("/api/admin/cohort-analytics" + query, cookies=_staff_cookie())


def test_cohort_analytics_returns_topic_rows_per_pool():
    r = _get("?discipline=oa_psa&days=90")
    assert r.status_code == 200
    body = r.json()
    assert body["discipline"] == "oa_psa"
    assert body["days"] == 90
    assert body["sources"] == {"osce": "ok", "flashcard": "ok"}
    row = next(t for t in body["topics"] if t["topic_group"] == "tonometry_iop")
    assert row["label"] == "Intraocular Pressure"
    assert row["pool"] == "CLINICAL"
    assert row["osce"]["attempts"] == 3
    assert set(row["osce"]) == {
        "attempts", "students", "avg_score", "scored_n", "pass_rate", "graded_n",
        "safety_fail_rate", "safety_gradable_n", "missed_top", "by_difficulty",
    }
    assert set(row) == {
        "topic_group", "label", "pool", "osce", "flashcard",
        "weakness_score", "low_confidence", "signals_present",
    }


def test_cohort_analytics_flashcard_only_group_has_empty_osce_not_zeros():
    """A knowledge_* group has no OSCE cases at all. Its counts are 0 (true: no attempts)
    but every rate stays None — D13. A 0.0 pass rate would read as "this cohort fails
    foundations", which is the exact lie P1 was about. The label comes from the flashcard
    deck the student actually studied, not from a title-cased group key."""
    r = _get("?discipline=oa_psa&days=90")
    row = next(t for t in r.json()["topics"] if t["topic_group"] == _KNOWLEDGE)
    assert row["label"] == "Ocular Anatomy & Physiology"
    assert row["osce"]["attempts"] == 0
    assert row["osce"]["avg_score"] is None
    assert row["osce"]["pass_rate"] is None
    assert row["osce"]["safety_fail_rate"] is None
    assert row["osce"]["by_difficulty"] == {"beginner": 0, "intermediate": 0, "advanced": 0}
    assert row["flashcard"]["n"] == 3          # s_oa x2 + s_psa x1; s_ot is out of pool
    assert row["flashcard"]["students"] == 2
    # Built fresh per row, never a module-level singleton: every flashcard-only group in
    # every pool takes this block, so one shared dict is the mutable-default bug waiting
    # for the first caller that edits a row in place. Identity dies at the JSON boundary,
    # so it can only be pinned on the builder itself.
    assert admin_router._empty_osce() is not admin_router._empty_osce()


def test_cohort_analytics_discipline_filter():
    """The two curricula are disjoint (D2), so a discipline view must not leak the other
    pool's groups — and `all` must return BOTH, each tagged with its own pool so the UI
    can render two labelled sections rather than one meaningless blended ranking.

    The totals block is scoped the same way. `students_with_flashcard_data` is the one that
    reads plausibly wrong: s_ot has flashcard rows, so an unscoped count reports 3 studying
    students under an oa_psa panel of 2 — a coverage figure larger than its own cohort."""
    oa = _get("?discipline=oa_psa&days=90").json()
    ot = _get("?discipline=ot&days=90").json()
    every = _get("?discipline=all&days=90").json()

    assert {t["topic_group"] for t in oa["topics"]} == {"tonometry_iop", _KNOWLEDGE}
    assert {t["pool"] for t in oa["topics"]} == {"CLINICAL"}
    assert oa["totals"]["students_in_pool"] == 2
    assert oa["totals"]["osce_attempts"] == 3
    assert oa["totals"]["students_with_flashcard_data"] == 2      # s_ot's rows are not here

    assert {t["topic_group"] for t in ot["topics"]} == {"oct_imaging", _KNOWLEDGE}
    assert {t["pool"] for t in ot["topics"]} == {"OT"}
    assert ot["totals"]["students_in_pool"] == 1
    assert ot["totals"]["osce_attempts"] == 1
    assert ot["totals"]["students_with_flashcard_data"] == 1

    assert {t["pool"] for t in every["topics"]} == {"CLINICAL", "OT"}
    assert {(t["pool"], t["topic_group"]) for t in every["topics"]} == {
        ("CLINICAL", "tonometry_iop"), ("CLINICAL", _KNOWLEDGE),
        ("OT", "oct_imaging"), ("OT", _KNOWLEDGE),
    }
    assert every["totals"]["students_in_pool"] == 3
    assert every["totals"]["osce_attempts"] == 4
    assert every["totals"]["students_with_flashcard_data"] == 3
    # Each pool's rows stay contiguous so the UI can slice two sections without re-sorting.
    pools_in_order = [t["pool"] for t in every["topics"]]
    assert pools_in_order == sorted(pools_in_order, key=["CLINICAL", "OT"].index)


# Three CLINICAL groups built so the ranking rule and the raw score DISAGREE:
#   tonometry_iop — 5 students x 1 good attempt: confident, weakness ~0.024
#   eye_drops     — 1 student x 1 terrible attempt: thin, weakness ~0.120
#   fall_risk     — 1 ungraded attempt: no signal at all, weakness None
# Sorting on the score alone would put eye_drops on top; sorting on confidence alone
# would leave fall_risk mid-list. Only the full key gives iop -> drops -> fall.
_RANK_PROFILES = [{"student_id": f"s_c{i}", "role": "OA"} for i in range(1, 6)]
_RANK_ROWS = (
    [{"student_id": f"s_c{i}", "case_id": "case_oa_iop_01", "completed_at": _ts(1),
      "score_100": 90, "safe": True, "passed": True} for i in range(1, 6)]
    + [{"student_id": "s_c1", "case_id": "case_oa_drops_01", "completed_at": _ts(1),
        "score_100": 10, "safe": True, "passed": False},
       {"student_id": "s_c5", "case_id": "case_oa_fall_01", "completed_at": _ts(1),
        "score_100": None, "safe": None, "passed": None}]
)


def test_cohort_analytics_ranks_confident_groups_above_thin_ones():
    """Small-n groups must never top the ranking (§5.3): one catastrophic attempt is not a
    cohort weakness, and a group with no grade at all is not a strong one. Pinned on the
    ROW ORDER the UI renders — the score alone would invert the first two."""
    body = _get("?discipline=oa_psa&days=90",
                profiles=_RANK_PROFILES, case_rows=_RANK_ROWS, fc_rows=[]).json()
    assert [t["topic_group"] for t in body["topics"]] == [
        "tonometry_iop", "eye_drops", "fall_risk"]
    by_group = {t["topic_group"]: t for t in body["topics"]}
    assert by_group["tonometry_iop"]["low_confidence"] is False
    assert by_group["eye_drops"]["low_confidence"] is True
    # The trap: the thin group really does score WORSE, and still must rank below.
    assert by_group["eye_drops"]["weakness_score"] > by_group["tonometry_iop"]["weakness_score"]
    assert by_group["fall_risk"]["weakness_score"] is None


def test_cohort_analytics_excludes_staff():
    """A promoted trainer sits INSIDE the population and must be subtracted by membership.

    This is the shape of the real defect: admin_promote adds a supervisors row and leaves
    the approved_students row in place (admin.py:288-301), so get_active_profiles() still
    returns t_trainer carrying the genuine "OA" the staff-only pool toggle wrote. Only the
    supervisors join removes them — pool_for_student_role() cannot, and a fixture that
    simply omits the trainer would pass with or without the fix, proving nothing.

    Their two flawless demo runs must move NOT ONE NUMBER in any of the three views — no
    denominator, no mean, and not the unclassified diagnostics, which count *students* the
    role map rejected, not non-students. And the drop must be REPORTED as
    totals.staff_excluded, never absorbed silently."""
    staff_profiles = _PROFILES + [{"student_id": "t_trainer", "role": "OA"}]
    # Stray case/whitespace on the consent email: the join must fold it the way db.py folds
    # emails everywhere else (.strip().lower()), or the trainer survives as an OA student.
    staff_consent = _CONSENT + [{"student_id": "t_trainer", "email": "  Trainer@X.edu  "}]
    staff_rows = _CASE_ROWS + [
        {"student_id": "t_trainer", "case_id": "case_oa_iop_01", "completed_at": _ts(1),
         "score_100": 100, "safe": True, "passed": True, "total_score": 40},
        {"student_id": "t_trainer", "case_id": "case_ot_oct_01", "completed_at": _ts(1),
         "score_100": 100, "safe": True, "passed": True, "total_score": 40},
    ]
    for discipline in ("oa_psa", "ot", "all"):
        clean = _get(f"?discipline={discipline}&days=90").json()
        dirty = _get_real_population(
            f"?discipline={discipline}&days=90",
            profiles=staff_profiles, consent=staff_consent,
            supervisors=[{"email": "trainer@x.edu", "role": "trainer"}],
            case_rows=staff_rows,
        ).json()
        # Popped first: this is the ONE field that is allowed to differ, and it must.
        assert dirty["totals"].pop("staff_excluded") == 1, "the drop was not reported"
        assert clean["totals"].pop("staff_excluded") == 0
        assert clean == dirty, f"a trainer's attempts changed the {discipline} cohort"


def test_cohort_analytics_unknown_discipline_400():
    r = _get("?discipline=nurses")
    assert r.status_code == 400
    assert "discipline" in r.json()["detail"]


def test_cohort_analytics_clamps_and_echoes_the_window():
    """The resolved window is echoed so the UI can label the panel honestly."""
    assert _get("?discipline=all&days=9999").json()["days"] == 365
    assert _get("?discipline=all&days=0").json()["days"] == 1
    assert _get("?discipline=all&days=all").json()["days"] == "all"
    assert _get("?discipline=all").json()["days"] == 90          # default
    r = _get("?discipline=all&days=lots")
    assert r.status_code == 400


def test_cohort_analytics_window_excludes_older_attempts():
    old = _CASE_ROWS + [
        {"student_id": "s_oa", "case_id": "case_oa_iop_01", "completed_at": "2020-01-01T00:00:00Z",
         "score_100": 10, "safe": True, "passed": False, "total_score": 4},
    ]
    windowed = _get("?discipline=oa_psa&days=90", case_rows=old).json()
    assert windowed["totals"]["osce_attempts"] == 3
    everything = _get("?discipline=oa_psa&days=all", case_rows=old).json()
    assert everything["totals"]["osce_attempts"] == 4


def test_cohort_analytics_window_excludes_older_flashcard_attempts():
    """The window has to bound BOTH sources, and this is the half that fails quietly. An
    unwindowed flashcard read prints an all-time accuracy under a "last 90 days" heading —
    no counter contradicts it, and a topic the cohort has since fixed keeps dragging its
    own row down. Pinned on the accuracy, which moves 66.7 -> 50.0 the moment one 2020 row
    leaks in."""
    old = _FC_ROWS + [
        {"student_id": "s_oa", "topic_tag": "anatomy_physiology", "correct": False,
         "ts": "2020-01-01T00:00:00Z"},
    ]
    windowed = _get("?discipline=oa_psa&days=90", fc_rows=old).json()
    row = next(t for t in windowed["topics"] if t["topic_group"] == _KNOWLEDGE)
    assert row["flashcard"] == {"accuracy": 66.7, "n": 3, "students": 2}
    everything = _get("?discipline=oa_psa&days=all", fc_rows=old).json()
    all_time = next(t for t in everything["topics"] if t["topic_group"] == _KNOWLEDGE)
    assert all_time["flashcard"] == {"accuracy": 50.0, "n": 4, "students": 2}


def test_flashcard_unavailable_is_flagged_not_zero():
    """A flashcard read failure yields flashcard: null per group and sources.flashcard =
    'unavailable' — NEVER {accuracy: 0.0}, which renders as a 0% bar and sends trainers to
    remediate a topic nobody has studied."""
    p1, _p2, _p3, p4 = _patches()
    with p1, \
         patch("tools.shared.db.get_all_case_scores", new=AsyncMock(return_value=(_CASE_ROWS, True))), \
         patch("tools.shared.db.get_all_flashcard_attempts", new=AsyncMock(side_effect=RuntimeError("PostgREST down"))), \
         p4:
        r = client.get("/api/admin/cohort-analytics?discipline=oa_psa&days=90",
                       cookies=_staff_cookie())
    assert r.status_code == 200
    body = r.json()
    assert body["sources"] == {"osce": "ok", "flashcard": "unavailable"}
    assert body["topics"], "an OSCE-only cohort still has topic rows"
    assert all(t["flashcard"] is None for t in body["topics"])
    assert body["totals"]["students_with_flashcard_data"] == 0
    # The OSCE half is untouched by the flashcard outage.
    assert body["totals"]["osce_attempts"] == 3


def test_cohort_analytics_500s_on_db_failure():
    """The mirror image of the test above: an OSCE or profile read failure is a REAL 500.
    Returning a plausible empty cohort would render "0 attempts, no weak topics" — an
    outage that reads as good news."""
    p1, _p2, p3, p4 = _patches()
    with p1, \
         patch("tools.shared.db.get_all_case_scores", new=AsyncMock(side_effect=RuntimeError("boom"))), \
         p3, p4:
        r = client.get("/api/admin/cohort-analytics?discipline=all", cookies=_staff_cookie())
    assert r.status_code == 500

    with patch("tools.shared.db.get_active_student_profiles", new=AsyncMock(side_effect=RuntimeError("boom"))), \
         patch("tools.shared.db.get_all_case_scores", new=AsyncMock(return_value=(_CASE_ROWS, True))), \
         p3, p4:
        r = client.get("/api/admin/cohort-analytics?discipline=all", cookies=_staff_cookie())
    assert r.status_code == 500
    # Covers the supervisors-read fault too: get_active_student_profiles RAISES on it by
    # design (Task 6), and the population read has no per-source degrade — a 500 is the
    # intended outcome, because an inflated denominator that looks correct is worse.


def test_cohort_analytics_counts_unclassified_without_hiding_them():
    """Fail closed, then say so. A student whose role maps to no pool is EXCLUDED from
    every view (§4.4 — case_pool() would silently default them into CLINICAL), and an
    attempt on a case missing from the library index is excluded from its group. Both are
    counted so a lecturer can see the console dropped something."""
    profiles = _PROFILES + [{"student_id": "s_ghost", "role": ""}]
    rows = _CASE_ROWS + [
        {"student_id": "s_oa", "case_id": "case_deleted_99", "completed_at": _ts(2),
         "score_100": 40, "safe": True, "passed": False, "total_score": 16},
    ]
    body = _get("?discipline=all&days=90", case_rows=rows, profiles=profiles).json()
    assert body["totals"]["unclassified_students"] == 1
    assert body["totals"]["unclassified_attempts"] == 1
    assert body["totals"]["students_in_pool"] == 3           # s_ghost excluded
    assert body["totals"]["osce_attempts"] == 4              # the orphan case is not grouped
    assert body["totals"]["students_with_osce_data"] == 3    # s_oa had SOME attempt
    assert body["totals"]["osce_students"] == 3


def test_cohort_analytics_osce_student_counters_diverge_on_an_unindexed_case():
    """The two student counters are not synonyms, and the ONLY thing separating them is the
    `case_id in case_index` term: ..._with_osce_data counts students the console holds rows
    for, osce_students counts the ones actually represented in a topic row above. They
    differ exactly when a case_id is missing from the library index — a deleted or renamed
    case file — and collapsing them either inflates the panel's coverage or hides a student
    whose whole term of work the console cannot place.

    The test above cannot see this: its orphan row belongs to s_oa, who also has an indexed
    attempt, so both counters read 3 with or without the term. Here the divergence is real
    — s_orphan has attempted nothing else."""
    profiles = _PROFILES + [{"student_id": "s_orphan", "role": "OA"}]
    rows = _CASE_ROWS + [
        {"student_id": "s_orphan", "case_id": "case_deleted_99", "completed_at": _ts(2),
         "score_100": 40, "safe": True, "passed": False, "total_score": 16},
    ]
    totals = _get("?discipline=oa_psa&days=90",
                  case_rows=rows, profiles=profiles).json()["totals"]
    assert totals["students_in_pool"] == 3
    assert totals["students_with_osce_data"] == 3   # s_oa, s_psa, s_orphan — all have rows
    assert totals["osce_students"] == 2             # s_orphan is in no topic row
    assert totals["osce_attempts"] == 3             # nor is their attempt in any total
    assert totals["unclassified_attempts"] == 1     # it is reported, not swallowed


def test_cohort_analytics_counts_attempts_whose_topic_tag_matched_nothing():
    """`topic_tag` is client-supplied and unvalidated, and flashcard_group BUCKETS an
    unrecognised tag into the knowledge group rather than dropping it — so a stale frontend
    build, a rename, or a refactor that starts sending `set_key` renders a complete,
    plausible, entirely wrong panel. This counter is the only thing that makes the drift
    visible on the day it starts."""
    drifted = _FC_ROWS + [
        # A case set_key, not a flashcard topic key — the exact refactor-drift shape.
        {"student_id": "s_oa", "topic_tag": "tonometry_iop", "correct": True, "ts": _ts(1)},
        # Real tag carrying a difficulty suffix and stray case: KNOWN, must not be counted.
        {"student_id": "s_psa", "topic_tag": "IOP_NCT__hard", "correct": True, "ts": _ts(1)},
        # Drift in the OTHER pool. Scoped like every other total, so the oa_psa panel does
        # not report a defect the OT panel owns.
        {"student_id": "s_ot", "topic_tag": "hrt__nonsense", "correct": True, "ts": _ts(1)},
    ]
    assert _get("?discipline=oa_psa&days=90",
                fc_rows=drifted).json()["totals"]["unknown_tag_attempts"] == 1
    assert _get("?discipline=all&days=90",
                fc_rows=drifted).json()["totals"]["unknown_tag_attempts"] == 2
    assert _get("?discipline=oa_psa&days=90").json()["totals"]["unknown_tag_attempts"] == 0


def test_cohort_analytics_ships_the_rubric_and_its_safety_caveat():
    """weakness_score is a weighted, shrunk, clamped composite; a bare number a trainer is
    expected to act on is unexplainable without the weights that produced it. And the
    safety caveat (§5.3) has no other home — `safe = not missed_critical` fills only for
    checklists that flag a critical step, so safety_fail_rate is diluted downward on the
    rest. A caveat that lives only in a docstring is the same as no caveat."""
    body = _get("?discipline=all&days=90").json()
    assert body["rubric"] == WEIGHT_RUBRIC, "the rubric must travel verbatim, not re-derived"
    caveat = body["rubric"]["caveats"]["safety"]
    assert caveat.strip(), "the safety caveat reached the client empty"
    assert "safety_gradable_n" in caveat, "the caveat must name the field that qualifies it"


def test_cohort_analytics_ttl_cache_serves_repeat_call():
    """Per-worker TTL cache over the DERIVED aggregate only — one call reads three whole
    tables and buckets them in Python, and the console polls."""
    reader = AsyncMock(return_value=(_CASE_ROWS, True))
    with patch("tools.api.routers.admin._COHORT_TTL_SECONDS", 60.0), \
         patch("tools.shared.db.get_active_student_profiles", new=AsyncMock(return_value=(_PROFILES, 0))), \
         patch("tools.shared.db.get_all_case_scores", new=reader), \
         patch("tools.shared.db.get_all_flashcard_attempts", new=AsyncMock(return_value=(_FC_ROWS, True))), \
         patch("tools.api.routers.admin.get_case_index", new=AsyncMock(return_value=_CASE_INDEX)):
        first = client.get("/api/admin/cohort-analytics?discipline=oa_psa&days=90",
                           cookies=_staff_cookie())
        second = client.get("/api/admin/cohort-analytics?discipline=oa_psa&days=90",
                            cookies=_staff_cookie())
        assert reader.await_count == 1, "the second call must be served from the TTL cache"
        # A different window is a different key: the cache must not serve one view's
        # numbers under another's label.
        other = client.get("/api/admin/cohort-analytics?discipline=oa_psa&days=30",
                           cookies=_staff_cookie())
        assert reader.await_count == 2, "a different window must not hit the same entry"
    assert first.status_code == 200
    assert first.json() == second.json()
    assert other.json()["days"] == 30


def test_cohort_analytics_ttl_cache_keys_on_discipline_too():
    """The other half of the cache key, and the worse half to lose. A `days` collision only
    mislabels a window; a `discipline` collision serves an OT trainer the CLINICAL panel —
    other students, other topics, someone else's cohort entirely — for up to 45s after any
    oa_psa request warms the entry, with the response still claiming discipline: "ot"."""
    reader = AsyncMock(return_value=(_CASE_ROWS, True))
    with patch("tools.api.routers.admin._COHORT_TTL_SECONDS", 60.0), \
         patch("tools.shared.db.get_active_student_profiles", new=AsyncMock(return_value=(_PROFILES, 0))), \
         patch("tools.shared.db.get_all_case_scores", new=reader), \
         patch("tools.shared.db.get_all_flashcard_attempts", new=AsyncMock(return_value=(_FC_ROWS, True))), \
         patch("tools.api.routers.admin.get_case_index", new=AsyncMock(return_value=_CASE_INDEX)):
        oa = client.get("/api/admin/cohort-analytics?discipline=oa_psa&days=90",
                        cookies=_staff_cookie()).json()
        ot = client.get("/api/admin/cohort-analytics?discipline=ot&days=90",
                        cookies=_staff_cookie()).json()
        assert reader.await_count == 2, "a different discipline must not hit the same entry"
    assert ot["discipline"] == "ot"
    assert {t["pool"] for t in ot["topics"]} == {"OT"}
    assert oa != ot


def test_cohort_analytics_ttl_cache_evicts_expired_entries_on_write():
    """The dict must SHRINK, not merely ignore what it holds. An expired entry was skipped
    on read and then left in place, so the cache retained every key it had ever been asked
    for: ~1100 of them (3 disciplines x [1, 365] plus "all") at ~37 KB of payload each, on
    the one 512 MB worker Render free gives us — reachable by a single staff account
    walking the ?days= sizes. "A stale entry is not served" is a DIFFERENT rule, already
    pinned above; only eviction bounds the memory, so this asserts on the dict itself.

    Both halves of the predicate are pinned: a sweep that also took the live entry would
    turn every write into a cache flush, which the timings above would never notice."""
    stale = ("ot", "365")
    fresh = ("all", "30")
    # Seeded past the TTL — an entry the read path would already refuse to serve.
    admin_router._cohort_cache[stale] = (time.monotonic() - 3600.0, {"seeded": "stale"})
    admin_router._cohort_cache[fresh] = (time.monotonic(), {"seeded": "fresh"})
    with patch("tools.api.routers.admin._COHORT_TTL_SECONDS", 60.0):
        r = _get("?discipline=oa_psa&days=90")
    assert r.status_code == 200
    assert set(admin_router._cohort_cache) == {("oa_psa", "90"), fresh}


def test_cohort_analytics_is_rate_limited_per_user():
    """The most expensive read on the console — three whole-table scans plus a 155-file
    index build — behind a dashboard that polls. It carries the same 30/minute cap as its
    heavy siblings (token-summary, audit), and nothing else in this file would notice the
    decorator going missing, because no other test makes 31 calls."""
    # Its own sub, so these 32 requests cannot spend the bucket every other test here uses.
    cookie = {"eyebot_token": create_access_token("stu_cohort_analytics_rl", "admin", "OA")}
    p1, p2, p3, p4 = _patches()
    with p1, p2, p3, p4:
        statuses = [client.get("/api/admin/cohort-analytics?discipline=all&days=90",
                               cookies=cookie).status_code for _ in range(32)]
    assert statuses[0] == 200, statuses
    assert 429 in statuses, f"expected a 429 once the per-minute cap is exceeded, got {statuses}"


def test_cohort_aggregator_returns_keyed_dict_reusable_by_student_detail():
    """D4 seam, enforced BEFORE Plan B exists — it is only cheap to preserve while there is
    one consumer. osce_by_group returns dict[topic_group, {...}] and the endpoint is a THIN
    projection over it, so Plan B's mastery cohort_avg can read the same dict filtered to
    one student's pool instead of growing a second, divergent aggregation path."""
    pools = pool_by_student(_PROFILES)
    grouped = osce_by_group(_CASE_ROWS, _CASE_INDEX, pools, pool="CLINICAL")
    assert isinstance(grouped, dict)
    assert set(grouped) == {"tonometry_iop"}
    assert grouped["tonometry_iop"]["avg_score"] is not None

    body = _get("?discipline=oa_psa&days=90").json()
    row = next(t for t in body["topics"] if t["topic_group"] == "tonometry_iop")
    # Verbatim, key for key: the endpoint must not recompute, round or re-derive anything.
    assert row["osce"] == grouped["tonometry_iop"]
