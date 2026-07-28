"""osce_by_group must aggregate REAL case grades, honestly.

Four things this pins, each a way the panel could confidently lie:

1. **Retakes (D9).** Attainment is the BEST `score_100` per (student, case) — the
   same high-water rule the points economy already applies to OSCE rewards. Volume
   (`attempts`) counts every raw row, and `safety_fail_rate` is over raw attempts,
   because an unsafe encounter is an event, not an attainment level.
2. **Per-metric denominators (§5.3).** In production only 11 of 24 `case_progress`
   rows carry non-NULL `score_100`/`safe`, while `passed` is on every row since the
   base insert (`tools/shared/db.py:154-159`). `scored_n`, `graded_n` and
   `safety_gradable_n` are therefore three different numbers; one shared denominator
   would silently mis-state two metrics out of three.
3. **Nulls, not zeros (D13).** A rate with a zero denominator is `None`. 0.0 would
   rank an untouched topic as the cohort's worst.
4. **Fail closed.** An attempt whose case is not in the index, or whose student has
   no discipline, is EXCLUDED — never bucketed into a default group. `resolve_set`'s
   `_DEFAULT` fallback (`tools/cases/topic_sets.py:203`) is exactly the silent
   mis-grouping §4.1 exists to prevent.
"""
from tools.supervisor.cohort_analytics import osce_by_group

# case_id -> {"pool", "set_key", "label", "difficulty"} — the shape get_case_index()
# returns. Two CLINICAL cases in ONE set_key at different tiers, one OT case.
INDEX = {
    "case_oa_001": {"pool": "CLINICAL", "set_key": "tonometry_iop",
                    "label": "Intraocular Pressure", "difficulty": "beginner"},
    "case_oa_002": {"pool": "CLINICAL", "set_key": "tonometry_iop",
                    "label": "Intraocular Pressure", "difficulty": "advanced"},
    "case_ot_001": {"pool": "OT", "set_key": "oct_imaging",
                    "label": "OCT Imaging", "difficulty": "intermediate"},
}

# student_id -> pool, from discipline.pool_by_student(). Unknown roles are ABSENT,
# never defaulted to CLINICAL; staff were already subtracted from the population by
# db.get_active_student_profiles() (Task 6), not by the role map.
POOLS = {"s1": "CLINICAL", "s2": "CLINICAL", "s3": "OT"}

# A checklist `action` string longer than the 80-char wire cap.
LONG_STEP = ("Confirm the patient's identity against the appointment record and "
             "check both the name and the NRIC before starting the measurement")


def _row(student_id: str, case_id: str, **kw) -> dict:
    """A case_progress row. Grade columns are supplied per-test: a pre-Tier-2 row
    genuinely has no score_100/safe key at all."""
    row = {"student_id": student_id, "case_id": case_id,
           "completed_at": "2026-07-20T10:00:00Z"}
    row.update(kw)
    return row


def test_cohort_analytics_dedupes_retakes():
    """Five attempts at one case by one student: one attainment point at the BEST
    score, five attempts of volume, five raw attempts of safety signal. The naive
    mean of all five is 56.0 — which would report a student who reached 80 as
    borderline failing."""
    rows = [_row("s1", "case_oa_001", score_100=s, passed=s >= 60, safe=True)
            for s in (30, 45, 55, 70, 80)]
    g = osce_by_group(rows, INDEX, POOLS)["tonometry_iop"]
    assert g["students"] == 1
    assert g["attempts"] == 5
    assert g["avg_score"] == 80.0
    assert g["scored_n"] == 1
    assert g["pass_rate"] == 1.0
    assert g["graded_n"] == 1
    assert g["safety_gradable_n"] == 5


def test_best_attempt_wins_even_when_the_retake_is_worse():
    """BEST, not most-recent. Every other retake fixture here happens to climb, so
    "keep the latest row" would satisfy them all — this is the one that separates the
    high-water rule (D9) from last-write-wins. A student who aces a case and then
    fumbles a casual replay has not un-learned it, and `passed` must travel with the
    same winning row rather than being re-derived from the newest one."""
    rows = [_row("s1", "case_oa_001", score_100=90, passed=True),
            _row("s1", "case_oa_001", score_100=40, passed=False)]
    g = osce_by_group(rows, INDEX, POOLS)["tonometry_iop"]
    assert g["avg_score"] == 90.0
    assert g["pass_rate"] == 1.0
    assert g["scored_n"] == 1
    assert g["attempts"] == 2


def test_best_is_per_case_not_per_student():
    """Dedupe keys on (student, case), not student — a student's two DIFFERENT cases
    in one group are two attainment points, so one aced case cannot mask a weak one."""
    rows = [_row("s1", "case_oa_001", score_100=90, passed=True),
            _row("s1", "case_oa_002", score_100=50, passed=False)]
    g = osce_by_group(rows, INDEX, POOLS)["tonometry_iop"]
    assert g["scored_n"] == 2
    assert g["avg_score"] == 70.0
    assert g["pass_rate"] == 0.5
    assert g["students"] == 1


def test_osce_denominators_are_independent():
    """Three rows, three different denominators: one scored, three with `passed`, two
    with a safety verdict."""
    rows = [
        _row("s1", "case_oa_001", score_100=80, passed=True, safe=True),
        _row("s2", "case_oa_001", passed=False),               # pre-Tier-2: no score, no safe
        _row("s2", "case_oa_002", passed=True, safe=False),    # safety graded, still no score
    ]
    g = osce_by_group(rows, INDEX, POOLS)["tonometry_iop"]
    assert g["attempts"] == 3
    assert g["scored_n"] == 1
    assert g["graded_n"] == 3
    assert g["safety_gradable_n"] == 2
    assert g["avg_score"] == 80.0
    assert g["pass_rate"] == round(2 / 3, 3)
    assert g["safety_fail_rate"] == 0.5


def test_empty_group_returns_nulls_not_zeros():
    """An attempted-but-never-graded group reports its volume and nulls everything
    else. 0.0 here would sort this topic to the top of the weakness ranking and send
    a trainer to the emptiest topic, not the worst."""
    g = osce_by_group([_row("s1", "case_oa_001")], INDEX, POOLS)["tonometry_iop"]
    assert g["attempts"] == 1
    assert g["students"] == 1
    assert g["avg_score"] is None
    assert g["pass_rate"] is None
    assert g["safety_fail_rate"] is None
    assert g["scored_n"] == 0
    assert g["graded_n"] == 0
    assert g["safety_gradable_n"] == 0
    assert g["missed_top"] == []


def test_no_rows_returns_empty_dict_not_zero_filled_groups():
    """Untouched groups are ABSENT, never fabricated all-zero rows — the endpoint
    fills the full 21-group frame from the index and labels the gaps as empty."""
    assert osce_by_group([], INDEX, POOLS) == {}


def test_null_score_100_is_not_back_derived_from_total_score():
    """`tools/api/routers/cases.py:96` back-derives round(total_score / 0.4) for a
    student's own history. Cohort attainment must NOT: those rows are the pre-Tier-2
    attempts, whose /40 came from the older checklist-inclusive rubric that the /100
    two-scheme grade deliberately dropped (tools/cases/station_score.py:1-12), the
    inverse quantises to 2.5-point steps, and it cannot conjure `safe` — so avg_score
    would cover a wider population than safety_fail_rate over the same rows."""
    g = osce_by_group([_row("s1", "case_oa_001", total_score=32, passed=True)],
                      INDEX, POOLS)["tonometry_iop"]
    assert g["avg_score"] is None
    assert g["scored_n"] == 0
    assert g["graded_n"] == 1


def test_by_difficulty_counts_raw_attempts_from_the_index():
    """Difficulty mix is a real confound and is REPORTED, not normalised away: a group
    where students pushed on to Advanced reads weaker than one they only sampled at
    Foundational. Trainers need the mix in order to read the score."""
    rows = [
        _row("s1", "case_oa_001", score_100=70, passed=True),    # beginner
        _row("s1", "case_oa_001", score_100=75, passed=True),    # beginner retake — still volume
        _row("s2", "case_oa_002", score_100=40, passed=False),   # advanced
    ]
    g = osce_by_group(rows, INDEX, POOLS)["tonometry_iop"]
    assert g["by_difficulty"] == {"beginner": 2, "intermediate": 0, "advanced": 1}
    assert g["attempts"] == 3


def test_unknown_difficulty_is_dropped_not_counted_as_beginner():
    """Only the three stored tier names count. A mis-tiered case must show up as
    by_difficulty summing BELOW attempts, not as a fake Foundational attempt."""
    index = {"case_x": {"pool": "CLINICAL", "set_key": "red_eye",
                        "label": "Red Eye Differential", "difficulty": "expert"}}
    g = osce_by_group([_row("s1", "case_x", score_100=50, passed=False)],
                      index, POOLS)["red_eye"]
    assert g["by_difficulty"] == {"beginner": 0, "intermediate": 0, "advanced": 0}
    assert g["attempts"] == 1


def test_missed_top_requires_two_students_and_truncates():
    """A step missed by ONE student is dropped: at a ~10-student cohort it identifies
    the individual, and one miss is not a curriculum problem. Step text is capped at
    80 chars so a long checklist action cannot blow out the panel."""
    rows = [
        _row("s1", "case_oa_001", safe=False, missed_critical=[LONG_STEP, "Wash hands"]),
        _row("s2", "case_oa_001", safe=False, missed_critical=[LONG_STEP]),
        _row("s1", "case_oa_002", safe=False, missed_critical=["Wash hands"]),
    ]
    top = osce_by_group(rows, INDEX, POOLS)["tonometry_iop"]["missed_top"]
    assert [m["step"] for m in top] == [LONG_STEP[:80]]
    assert len(top[0]["step"]) == 80
    assert top[0]["count"] == 2
    assert top[0]["students"] == 2


def test_missed_top_caps_at_three_ranked_by_count():
    """Cap 3: the panel is a 'fix these next' list, not a checklist dump. Order is
    deterministic — dict insertion order must never leak into a ranked list a trainer
    acts on."""
    pools = {f"s{i}": "CLINICAL" for i in range(5)}
    rows = [
        _row(f"s{i}", "case_oa_001", safe=False, missed_critical=[step])
        for step, n in (("A step", 4), ("B step", 3), ("C step", 2), ("D step", 5))
        for i in range(n)
    ]
    top = osce_by_group(rows, INDEX, pools)["tonometry_iop"]["missed_top"]
    assert [m["step"] for m in top] == ["D step", "A step", "B step"]
    assert [m["count"] for m in top] == [5, 4, 3]


def test_unknown_case_excluded():
    """A case_id absent from the index (renamed or deleted case file) is dropped, not
    bucketed. The endpoint reports the drop as totals.unclassified_attempts."""
    rows = [
        _row("s1", "case_oa_001", score_100=80, passed=True),
        _row("s1", "case_deleted_999", score_100=10, passed=False),
    ]
    out = osce_by_group(rows, INDEX, POOLS)
    assert list(out) == ["tonometry_iop"]
    assert out["tonometry_iop"]["attempts"] == 1
    assert out["tonometry_iop"]["avg_score"] == 80.0


def test_student_without_a_pool_is_excluded():
    """An account with no pool_by_student entry is excluded (§4.4) — never call
    case_pool() on one, it returns CLINICAL for trainer/admin/None/typos alike, which
    would drop practice runs straight into the OA & PSA cohort. (Staff never reach
    here: db.get_active_student_profiles() subtracts them upstream, by membership.)"""
    rows = [
        _row("s1", "case_oa_001", score_100=80, passed=True),
        _row("trainer_x", "case_oa_001", score_100=100, passed=True),
    ]
    g = osce_by_group(rows, INDEX, POOLS)["tonometry_iop"]
    assert g["attempts"] == 1
    assert g["students"] == 1
    assert g["avg_score"] == 80.0


def test_pool_filter_keeps_only_that_disciplines_students():
    """The pool filter resolves from the STUDENT, not the case, so a future
    role:"any" case counts correctly in both disciplines (§4.4)."""
    rows = [
        _row("s1", "case_oa_001", score_100=80, passed=True),
        _row("s3", "case_ot_001", score_100=40, passed=False),
    ]
    assert list(osce_by_group(rows, INDEX, POOLS, pool="OT")) == ["oct_imaging"]
    assert list(osce_by_group(rows, INDEX, POOLS, pool="CLINICAL")) == ["tonometry_iop"]
    assert sorted(osce_by_group(rows, INDEX, POOLS)) == ["oct_imaging", "tonometry_iop"]


def test_safety_fail_rate_is_over_raw_attempts_not_best_attempts():
    """A student who fails safety and then passes the retake still HAD an unsafe
    encounter. The high-water rule is for attainment only (D9); collapsing safety to
    the best attempt would erase every critical miss a student later recovered from."""
    rows = [
        _row("s1", "case_oa_001", score_100=30, passed=False, safe=False),
        _row("s1", "case_oa_001", score_100=90, passed=True, safe=True),
    ]
    g = osce_by_group(rows, INDEX, POOLS)["tonometry_iop"]
    assert g["safety_gradable_n"] == 2
    assert g["safety_fail_rate"] == 0.5
    assert g["avg_score"] == 90.0
    assert g["scored_n"] == 1
