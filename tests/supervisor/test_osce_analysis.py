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
