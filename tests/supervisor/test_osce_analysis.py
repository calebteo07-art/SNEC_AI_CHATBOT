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
