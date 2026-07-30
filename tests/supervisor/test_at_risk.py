"""At-risk wiring: population, clock, failure propagation, banding (spec §6.1, D10, D12)."""
import time
from unittest.mock import AsyncMock, patch

import pytest

from tools.supervisor import at_risk as mod


def _profile(sid, weak_topics, last_active, streak=5, role="OA"):
    return {"student_id": sid, "weak_topics": weak_topics, "last_active": last_active,
            "streak": streak, "role": role}


def _case(sid, case_id, **over):
    row = {"student_id": sid, "case_id": case_id, "score_100": None, "passed": False,
           "safe": None, "missed_critical": []}
    row.update(over)
    return row


def _patches(profiles, cases=(), cards=()):
    """Patch the three reads get_at_risk makes. TTL 0 so the cache never hides a call."""
    return (
        patch("tools.shared.db.get_active_student_profiles",
              new=AsyncMock(return_value=(profiles, 0))),
        patch("tools.shared.db.get_all_case_scores",
              new=AsyncMock(return_value=(list(cases), True))),
        patch("tools.shared.db.get_all_flashcard_attempts",
              new=AsyncMock(return_value=(list(cards), True))),
        patch.object(mod, "_CACHE_TTL_S", 0),
    )


async def _run(profiles, cases=(), cards=(), today="2026-05-10"):
    from datetime import date as _date
    p1, p2, p3, p4 = _patches(profiles, cases, cards)
    with p1, p2, p3, p4, patch.object(mod, "app_today",
                                      return_value=_date.fromisoformat(today)):
        return await mod.get_at_risk()


# ── Row set and shape ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_returns_only_flagged_bands():
    # D12: low and no_data are computed but omitted, so all four existing consumers
    # keep reading "the list of students to act on".
    profiles = [
        _profile("s1", ["a", "b", "c", "d", "e"], "2026-04-20", streak=0),  # 20d, 5 weak
        _profile("s2", [], "2026-05-10", streak=9),                         # active today
        _profile("s3", [], None, streak=0),                                 # never started
    ]
    result = await _run(profiles)
    assert [r["student_id"] for r in result] == ["s1"]
    assert result[0]["band"] == "high"


@pytest.mark.asyncio
async def test_row_is_a_superset_of_the_old_contract():
    # weekly_digest._risk_section indexes days_inactive and weak_topics DIRECTLY
    # (weekly_digest.py:71-76) — a dropped key is a KeyError in a production email.
    profiles = [_profile("s1", ["a", "b", "c", "d", "e"], "2026-04-20", streak=0)]
    row = (await _run(profiles))[0]
    for key in ("student_id", "last_active", "days_inactive", "weak_topics", "weak_count",
                "risk_score", "band", "reasons"):
        assert key in row, f"missing {key}"
    assert row["weak_count"] == 5
    assert isinstance(row["reasons"], list) and row["reasons"]


@pytest.mark.asyncio
async def test_rows_are_sorted_worst_first():
    profiles = [
        _profile("mild", ["a", "b"], "2026-05-03", streak=3),
        _profile("severe", ["a", "b", "c", "d", "e"], "2026-04-01", streak=0),
    ]
    result = await _run(profiles)
    assert [r["student_id"] for r in result] == ["severe", "mild"]
    assert result[0]["risk_score"] >= result[1]["risk_score"]


# ── Performance signals reach the score ──────────────────────────────────────

@pytest.mark.asyncio
async def test_osce_failure_alone_can_flag_an_active_student():
    # The whole point of P2b. Under the old binary rule this student — active today,
    # no weak topics, 12 failed OSCE attempts — was invisible.
    profiles = [_profile("s1", [], "2026-05-10", streak=9)]
    cases = [_case("s1", f"c{i}", score_100=20, passed=False, safe=False) for i in range(12)]
    result = await _run(profiles, cases=cases)
    assert [r["student_id"] for r in result] == ["s1"]
    factors = [r["factor"] for r in result[0]["reasons"]]
    assert "osce_failure" in factors and "safety" in factors


@pytest.mark.asyncio
async def test_low_flashcard_accuracy_reaches_the_score():
    profiles = [_profile("s1", ["a", "b"], "2026-05-04", streak=0)]
    cards = [{"student_id": "s1", "topic_tag": "glaucoma", "correct": False}
             for _ in range(40)]
    result = await _run(profiles, cards=cards)
    assert "flashcard" in [r["factor"] for r in result[0]["reasons"]]


# ── Population, clock, failure ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_population_excludes_staff():
    # get_active_profiles() is NOT staff-free: a promoted trainer keeps their
    # approved_students row and a real "OA" role, so the old code could flag a
    # colleague at risk and email it in the weekly digest.
    profiles = [_profile("s1", ["a", "b", "c", "d", "e"], "2026-04-20", streak=0)]
    p1, p2, p3, p4 = _patches(profiles)
    from datetime import date as _date
    with p1, p2, p3, p4, patch.object(mod, "app_today",
                                      return_value=_date(2026, 5, 10)), \
         patch("tools.shared.db.get_active_profiles",
               new=AsyncMock(side_effect=AssertionError("must not read the staff-inclusive population"))):
        result = await mod.get_at_risk()
    assert len(result) == 1


@pytest.mark.asyncio
async def test_uses_the_sgt_clock():
    # last_active is written in SGT. Comparing against a UTC today can yield -1 days.
    profiles = [_profile("s1", [], "2026-05-10", streak=9)]
    p1, p2, p3, p4 = _patches(profiles)
    from datetime import date as _date
    with p1, p2, p3, p4, patch.object(mod, "app_today",
                                      return_value=_date(2026, 5, 10)) as sgt:
        await mod.get_at_risk()
    assert sgt.called, "get_at_risk must read the SGT clock, not date.today()"


@pytest.mark.asyncio
async def test_db_failure_propagates_instead_of_returning_empty():
    # The old `except Exception: return []` made supervisor.py's 500 guard unreachable,
    # so an outage rendered as "0 students at risk" — i.e. "everyone is fine".
    with patch("tools.shared.db.get_active_student_profiles",
               new=AsyncMock(side_effect=RuntimeError("supabase down"))), \
         patch.object(mod, "_CACHE_TTL_S", 0):
        with pytest.raises(RuntimeError):
            await mod.get_at_risk()


@pytest.mark.asyncio
async def test_unparseable_last_active_is_treated_as_unknown_not_as_today():
    # A garbage date must not read as "active today" (which would hide a real risk).
    profiles = [_profile("s1", [], "not-a-date", streak=0)]
    cases = [_case("s1", f"c{i}", score_100=10, passed=False) for i in range(20)]
    result = await _run(profiles, cases=cases)
    assert result and result[0]["days_inactive"] is None
    assert "inactivity" not in [r["factor"] for r in result[0]["reasons"]]


@pytest.mark.asyncio
async def test_future_last_active_is_clamped_not_emitted_negative():
    # Clock skew or an imported row can date last_active ahead of today. weekly_digest
    # renders this key verbatim, so an unclamped -10 mails "-10d inactive" to trainers.
    profiles = [_profile("s1", [], "2026-05-20", streak=0)]
    cases = [_case("s1", f"c{i}", score_100=10, passed=False) for i in range(20)]
    result = await _run(profiles, cases=cases)
    assert result[0]["days_inactive"] == 0


@pytest.mark.asyncio
async def test_a_flashcard_outage_degrades_instead_of_500ing():
    # get_all_flashcard_attempts documents that the CALLER must catch (db.py:565-568) and
    # the sibling cohort endpoint degrades it (admin.py:413-420) — a thin or missing
    # flashcard_attempts table is the NORMAL case. The other 82% of the rubric must still
    # score. Population and OSCE stay fail-closed; only this read degrades.
    profiles = [_profile("s1", ["a", "b", "c", "d", "e"], "2026-04-20", streak=0)]
    from datetime import date as _date
    with patch("tools.shared.db.get_active_student_profiles",
               new=AsyncMock(return_value=(profiles, 0))), \
         patch("tools.shared.db.get_all_case_scores", new=AsyncMock(return_value=([], True))), \
         patch("tools.shared.db.get_all_flashcard_attempts",
               new=AsyncMock(side_effect=RuntimeError("relation does not exist"))), \
         patch.object(mod, "_CACHE_TTL_S", 0), \
         patch.object(mod, "app_today", return_value=_date(2026, 5, 10)):
        result = await mod.get_at_risk()
    assert [r["student_id"] for r in result] == ["s1"]
    assert "flashcard" not in [r["factor"] for r in result[0]["reasons"]]


# ── The read cache ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_a_second_call_inside_the_ttl_does_not_rescan():
    # Two whole-table paginated reads on a 30s console poll, on Render's SINGLE worker.
    # Without this the cache could be deleted and no assertion would notice.
    profiles = [_profile("s1", ["a", "b", "c", "d", "e"], "2026-04-20", streak=0)]
    from datetime import date as _date
    cases_read = AsyncMock(return_value=([], True))
    with patch("tools.shared.db.get_active_student_profiles",
               new=AsyncMock(return_value=(profiles, 0))), \
         patch("tools.shared.db.get_all_case_scores", new=cases_read), \
         patch("tools.shared.db.get_all_flashcard_attempts",
               new=AsyncMock(return_value=([], True))), \
         patch.object(mod, "_CACHE_TTL_S", 45.0), \
         patch.object(mod, "app_today", return_value=_date(2026, 5, 10)):
        first = await mod.get_at_risk()
        second = await mod.get_at_risk()
    assert cases_read.await_count == 1
    assert [r["student_id"] for r in second] == ["s1"]
    assert second is not first, "a shared list lets one consumer's sort poison the TTL"


@pytest.mark.asyncio
async def test_concurrent_callers_scan_once_not_twice():
    # The console mounts useCohort and useAtRisk on the SAME 30s refetchInterval
    # (useAdmin.ts:9,22,34) and cohort_summary now awaits get_at_risk too, so the two
    # requests arrive together. A bare check-then-fill cache has an await between the
    # check and the fill, so BOTH miss and BOTH scan: 2 whole-table scans a minute on
    # Render's single worker, where /at-risk alone cost 1.
    import asyncio
    profiles = [_profile("s1", ["a", "b", "c", "d", "e"], "2026-04-20", streak=0)]
    from datetime import date as _date

    async def _slow_scan(*_a, **_k):
        await asyncio.sleep(0)  # yield, so a naive cache lets the second caller through
        return ([], True)

    cases_read = AsyncMock(side_effect=_slow_scan)
    with patch("tools.shared.db.get_active_student_profiles",
               new=AsyncMock(return_value=(profiles, 0))), \
         patch("tools.shared.db.get_all_case_scores", new=cases_read), \
         patch("tools.shared.db.get_all_flashcard_attempts",
               new=AsyncMock(side_effect=_slow_scan)), \
         patch.object(mod, "_CACHE_TTL_S", 45.0), \
         patch.object(mod, "app_today", return_value=_date(2026, 5, 10)):
        both = await asyncio.gather(mod.get_at_risk(), mod.get_at_risk())
    assert cases_read.await_count == 1, "concurrent callers must not both scan"
    assert [r["student_id"] for r in both[0]] == ["s1"]
    assert [r["student_id"] for r in both[1]] == ["s1"]


@pytest.mark.asyncio
async def test_an_entry_older_than_the_ttl_is_not_served():
    # Age is checked on READ. Seed a stale entry rather than moving the clock, so the
    # asyncio timer heap keeps its real time.monotonic.
    profiles = [_profile("s1", ["a", "b", "c", "d", "e"], "2026-04-20", streak=0)]
    from datetime import date as _date
    mod._cache["all"] = (time.monotonic() - 46.0, [])
    cases_read = AsyncMock(return_value=([], True))
    with patch("tools.shared.db.get_active_student_profiles",
               new=AsyncMock(return_value=(profiles, 0))), \
         patch("tools.shared.db.get_all_case_scores", new=cases_read), \
         patch("tools.shared.db.get_all_flashcard_attempts",
               new=AsyncMock(return_value=([], True))), \
         patch.object(mod, "_CACHE_TTL_S", 45.0), \
         patch.object(mod, "app_today", return_value=_date(2026, 5, 10)):
        result = await mod.get_at_risk()
    assert cases_read.await_count == 1, "a stale entry must not be served"
    assert [r["student_id"] for r in result] == ["s1"]
