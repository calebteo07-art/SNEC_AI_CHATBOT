import pytest
from unittest.mock import patch
from tools.cases.log_case_completion import log_case_completion


@pytest.mark.asyncio
async def test_log_case_completion_passes_rich_grade_through():
    captured = {}

    async def _insert(**kwargs):
        captured.update(kwargs)

    with patch("tools.cases.log_case_completion.db.insert_case_result", new=_insert):
        await log_case_completion(
            "stu-001", "case_x", 32, True,
            score_100=80, safe=True, consult_technique=40, judgement_safety=40,
            missed_critical=["Measure IOP"], coaching={"focus": "escalate sooner"},
        )
    assert captured["score_100"] == 80
    assert captured["safe"] is True
    assert captured["consult_technique"] == 40
    assert captured["judgement_safety"] == 40
    assert captured["missed_critical"] == ["Measure IOP"]
    assert captured["coaching"] == {"focus": "escalate sooner"}


@pytest.mark.asyncio
async def test_log_case_completion_never_raises():
    async def _boom(**kwargs):
        raise RuntimeError("db down")

    # Best-effort logging must not propagate (e.g. columns absent pre-migration).
    with patch("tools.cases.log_case_completion.db.insert_case_result", new=_boom):
        await log_case_completion("stu-001", "case_x", 32, True, score_100=80)
