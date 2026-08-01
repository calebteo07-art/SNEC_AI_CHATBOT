"""GET /api/leaderboard as a promotion-only weekly league.

The pure rules live in tools/gamification/league.py and the ranking in
tools/gamification/leaderboard.py; both are already tested. What is only testable here is
the *wiring*: division scoping, the fields that actually survive the Pydantic response
model, the privacy strip, the pre-migration fallback, and the two background jobs that
ride on board traffic because this app has no cron.
"""
from datetime import date
from unittest.mock import ANY, AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)

WEEK = date(2026, 8, 3)       # a Monday (SGT) — the live week
PREV_WEEK = date(2026, 7, 27)  # the week the rollover must close


def _cookies(sub: str = "d3_ann") -> dict:
    return {"eyebot_token": create_access_token(sub, "student", "OA")}


def _p(sid: str, division: int, xp_week: int, role: str = "OA", **extra) -> dict:
    return {"student_id": sid, "role": role, "division": division, "xp": xp_week * 10,
            "xp_week": xp_week, "xp_week_start": WEEK.isoformat(), **extra}


# Division 3 is the viewer's board; 2 and 4 exist only to prove scoping. d3_hid is hidden.
LEAGUE_PROFILES = [
    _p("d3_ann", 3, 300, "OA", rank_prev=4),   # climbed 3 places since the snapshot
    _p("d3_bob", 3, 200, "OT", rank_prev=1),   # slipped 1
    _p("d3_cy", 3, 100, "OA"),                 # no snapshot yet -> delta None
    _p("d3_dee", 3, 50, "PSA"),
    _p("d3_hid", 3, 9000, "OA", leaderboard_hidden=True),
    _p("d2_eve", 2, 400, "OA"),
    _p("d4_fay", 4, 999, "OT"),
]
LEAGUE_CONSENT = [
    {"student_id": "d3_ann", "student_name": "Ann Aa"},
    {"student_id": "d3_bob", "student_name": "Bob Bb"},
    {"student_id": "d3_cy", "student_name": "Cy Cc"},
    {"student_id": "d3_dee", "student_name": "Dee Dd"},
    {"student_id": "d3_hid", "student_name": "Hana Hh"},
    {"student_id": "d2_eve", "student_name": "Eve Ee"},
    {"student_id": "d4_fay", "student_name": "Fay Ff"},
]


def league_board(*, profiles=None, consent=None, seal=True, sub="d3_ann", query="", reads=1):
    """Call the board `reads` times with the clock pinned to WEEK and every DB seam stubbed.

    `run_rollover` is always stubbed: TestClient runs background tasks for real, and the
    live rollover would reach production Supabase (see _forbid_real_supabase).
    Returns (last response, take_seal mock, set_rank_prev_bulk mock, run_rollover mock).
    """
    with patch("tools.shared.clock.app_today", return_value=WEEK), \
         patch("tools.shared.clock.app_week_start", return_value=WEEK), \
         patch("tools.shared.db.get_active_leaderboard_profiles", new_callable=AsyncMock,
               return_value=profiles if profiles is not None else LEAGUE_PROFILES), \
         patch("tools.shared.db.get_all_consent", new_callable=AsyncMock,
               return_value=consent if consent is not None else LEAGUE_CONSENT), \
         patch("tools.shared.db.take_seal", new_callable=AsyncMock) as seal_mock, \
         patch("tools.shared.db.set_rank_prev_bulk", new_callable=AsyncMock) as bulk_mock, \
         patch("tools.api.routers.student.run_rollover", new_callable=AsyncMock) as roll_mock:
        if isinstance(seal, list):
            seal_mock.side_effect = seal
        else:
            seal_mock.return_value = seal
        for _ in range(reads):
            r = client.get(f"/api/leaderboard{query}", cookies=_cookies(sub))
    return r, seal_mock, bulk_mock, roll_mock


# ── Division scoping ──────────────────────────────────────────────────────────

def test_board_is_scoped_to_the_viewers_division():
    """A division-3 viewer sees the division-3 ladder and nothing else, labelled with the
    league metadata the promotion UI needs."""
    r, _, _, _ = league_board()
    assert r.status_code == 200
    body = r.json()
    assert [e["name"] for e in body["entries"]] == ["Ann Aa", "Bob Bb", "Cy Cc", "Dee Dd"]
    assert all(e["division"] == 3 for e in body["entries"])   # no d2_eve, no d4_fay
    assert body["division"] == 3
    assert body["division_name"] == "Gold"
    assert body["pool_size"] == 4          # 4 visible members of division 3
    assert body["promote_count"] == 3


def test_rank_delta_reaches_the_client():
    """LbEntry drops unknown keys silently, so rank_delta only ships if it is declared as
    a field — the arrows were invisible before that. Computed from rank_prev."""
    r, _, _, _ = league_board()
    by_name = {e["name"]: e for e in r.json()["entries"]}
    assert by_name["Ann Aa"]["rank_delta"] == 3    # rank_prev 4 -> live 1
    assert by_name["Bob Bb"]["rank_delta"] == -1   # rank_prev 1 -> live 2
    assert by_name["Cy Cc"]["rank_delta"] is None  # never snapshotted -> dash, not a fake 0


def test_role_filter_is_a_view_only_and_never_moves_the_promotion_line():
    """THE test in this file. `role` narrows what the student looks at; it must not narrow
    the pool the promotion maths describes, or a filtered board would tell a student they
    are promoting when they are not."""
    unfiltered = league_board()[0].json()
    filtered = league_board(query="?role=OA")[0].json()

    assert [e["name"] for e in filtered["entries"]] == ["Ann Aa", "Cy Cc"]  # the view narrows
    assert all(e["role"] == "OA" for e in filtered["entries"])
    # ...but the league facts describe the whole division, unchanged.
    assert filtered["pool_size"] == unfiltered["pool_size"] == 4
    assert filtered["promote_count"] == unfiltered["promote_count"] == 3
    assert filtered["division"] == 3 and filtered["division_name"] == "Gold"


def test_student_id_never_reaches_the_client():
    """rank_entries carries student_id for the server-side snapshot join; shipping it would
    hand every viewer the id of every other student on the board."""
    for query in ("", "?role=OA"):
        entries = league_board(query=query)[0].json()["entries"]
        assert entries
        assert all("student_id" not in e for e in entries)


def test_hidden_student_holds_no_promotion_slot():
    """A hidden student is invisible but still in the division. Counting them would inflate
    pool_size and hand out a promotion slot nobody can see or race for."""
    big = [_p(f"big_{i:02d}", 1, 100 - i) for i in range(16)]
    big.append(_p("big_hid", 1, 9999, leaderboard_hidden=True))
    consent = [{"student_id": p["student_id"], "student_name": f"Name {p['student_id']}"}
               for p in big]
    body = league_board(profiles=big, consent=consent, sub="big_00")[0].json()
    assert body["pool_size"] == 16       # 17 rows, one hidden
    assert body["promote_count"] == 4    # promote_count(17) would be 5
    assert len(body["entries"]) == 16


# ── Pre-migration (016 not applied: no profile row has a `division` column) ────

NO_LEAGUE_PROFILES = [
    {"student_id": "user_001", "xp": 300, "role": "OA", "streak": 4},
    {"student_id": "user_002", "xp": 500, "role": "OT"},
]
NO_LEAGUE_CONSENT = [
    {"student_id": "user_001", "student_name": "Ann Aa"},
    {"student_id": "user_002", "student_name": "Bob Bb"},
]


def test_degrades_to_one_undivided_board_before_migration_016():
    """main must stay deployable: with no `division` on any row the board behaves exactly
    as it did — one ladder, everyone on it, no arrows, no 500."""
    r, _, _, _ = league_board(profiles=NO_LEAGUE_PROFILES, consent=NO_LEAGUE_CONSENT,
                              sub="user_001")
    assert r.status_code == 200
    body = r.json()
    assert [e["name"] for e in body["entries"]] == ["Bob Bb", "Ann Aa"]  # everyone, XP desc
    assert body["division"] == 1 and body["division_name"] == "Bronze"
    assert all(e["division"] == 1 for e in body["entries"])
    assert all(e["rank_delta"] is None for e in body["entries"])  # no rank_prev column yet


def test_no_background_jobs_before_migration_016():
    """The rollover and the daily snapshot write columns/tables that do not exist yet, so
    a pre-migration read must not even reach for the seal."""
    _, seal, bulk, roll = league_board(profiles=NO_LEAGUE_PROFILES,
                                       consent=NO_LEAGUE_CONSENT, sub="user_001")
    seal.assert_not_awaited()
    bulk.assert_not_awaited()
    roll.assert_not_awaited()


# ── The two traffic-driven background jobs ────────────────────────────────────

@patch("starlette.background.BackgroundTasks.add_task")
def test_rollover_is_backgrounded_and_closes_the_PREVIOUS_week(mock_add):
    """Never the live week — closing the week in progress would promote on a partial score.
    And it must be a BackgroundTask: no student waits on a cohort-wide sweep. Patching
    add_task means nothing runs, so reaching the assertions proves it was scheduled and
    not awaited inline."""
    _, _, bulk, roll = league_board()
    scheduled = [c for c in mock_add.call_args_list if c.args[0] is roll]
    assert len(scheduled) == 1, "rollover must be scheduled on the background tasks"
    _fn, profiles, week = scheduled[0].args
    assert week == PREV_WEEK
    assert profiles == LEAGUE_PROFILES   # the full cohort, hidden rows included
    # the daily snapshot rides the same escape hatch off the request path
    assert any(c.args[0] is bulk for c in mock_add.call_args_list)


def test_daily_snapshot_records_every_division_once():
    """Arrows need yesterday's rank for the WHOLE cohort, ranked per division — a student
    in division 2 must be stamped with their division-2 rank, not a global one."""
    _, seal, bulk, _ = league_board()
    seal.assert_awaited_once_with(f"day:{WEEK.isoformat()}")
    bulk.assert_awaited_once()
    snapshot, day = bulk.await_args.args
    assert day == WEEK.isoformat()
    assert snapshot == {
        "d3_ann": 1, "d3_bob": 2, "d3_cy": 3, "d3_dee": 4,   # division 3
        "d2_eve": 1,                                          # alone in division 2
        "d4_fay": 1,                                          # alone in division 4
    }
    assert "d3_hid" not in snapshot   # hidden students are not ranked at all


def test_second_read_the_same_day_writes_no_snapshot():
    """Without the seal every request would restamp rank_prev with the live rank, so every
    delta would compute as 0 and the arrows would be dead forever."""
    _, seal, bulk, roll = league_board(seal=[True, False], reads=2)
    assert seal.await_count == 2        # every read asks...
    assert bulk.await_count == 1        # ...only the first one wins and writes
    # the rollover is seal-guarded internally, so it is still scheduled on every read
    assert roll.await_count == 2
    roll.assert_awaited_with(ANY, PREV_WEEK)


def test_board_still_reports_viewer_state_and_roles():
    """Everything the pre-league handler reported must survive the rewrite."""
    body = league_board(sub="d3_hid")[0].json()
    assert body["you_hidden"] is True
    assert set(body["roles"]) == {"OA", "OT", "PSA"}
    assert body["division"] == 3
