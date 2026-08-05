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
    assert body["division_name"] == "Solar"
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
    assert filtered["division"] == 3 and filtered["division_name"] == "Solar"


def test_student_id_never_reaches_the_client():
    """rank_entries carries student_id for the server-side snapshot join; shipping it would
    hand every viewer the id of every other student on the board."""
    for query in ("", "?role=OA"):
        entries = league_board(query=query)[0].json()["entries"]
        assert entries
        assert all("student_id" not in e for e in entries)


def test_the_summit_promotes_nobody():
    """close_week has always refused to promote out of Prism, but the live payload sent the
    pool's raw count anyway — so a Prism board drew a promotion cut and gold podium lips for
    a promotion that cannot happen, and the client had no way to know. promotionLineIndex
    documents "the top division promotes nobody" as a null case it can only reach via a 0."""
    top = [_p(f"d5_{i}", 5, 500 - i * 10) for i in range(6)]
    body = league_board(
        profiles=top,
        consent=[{"student_id": p["student_id"], "student_name": f"Name {p['student_id']}"}
                 for p in top],
        sub="d5_0",
    )[0].json()
    assert body["division"] == 5
    assert body["pool_size"] == 6        # the pool is real
    assert body["promote_count"] == 0    # ...and nobody climbs out of it


def test_hidden_student_holds_no_promotion_slot():
    """A hidden student is invisible but still in the division. Counting them would inflate
    pool_size and hand out a promotion slot nobody can see or race for."""
    big = [_p(f"big_{i:02d}", 1, 100 - i) for i in range(16)]
    big.append(_p("big_hid", 1, 9999, leaderboard_hidden=True))
    consent = [{"student_id": p["student_id"], "student_name": f"Name {p['student_id']}"}
               for p in big]
    body = league_board(profiles=big, consent=consent, sub="big_00")[0].json()
    assert body["pool_size"] == 16       # 17 rows, one hidden
    assert body["promote_count"] == 3    # the podium, and only the podium
    assert len(body["entries"]) == 16

    # ⚠ The assertion above lost its teeth on 2026-08-04: promote_count is 3 at both 16 and
    # 17, so it can no longer tell a counted hidden student from an uncounted one. A cohort
    # small enough for the n-1 guard to bite still can — 3 visible promotes 2, and 4 would
    # promote 3 — so the slot-inflation claim keeps a case that actually fails when broken.
    small = [_p(f"sm_{i}", 1, 100 - i) for i in range(3)]
    small.append(_p("sm_hid", 1, 9999, leaderboard_hidden=True))
    body = league_board(
        profiles=small,
        consent=[{"student_id": p["student_id"], "student_name": f"Name {p['student_id']}"}
                 for p in small],
        sub="sm_0",
    )[0].json()
    assert body["pool_size"] == 3
    assert body["promote_count"] == 2    # counting the hidden student would pay out 3


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
    assert body["division"] == 1 and body["division_name"] == "Ember"
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


# ── The Monday result (show-once, server-side) ────────────────────────────────

PREV = PREV_WEEK.isoformat()
RESULT_ROW = {"student_id": "d3_ann", "week_start": PREV, "division": 2,
              "xp_final": 7660, "rank_final": 2, "outcome": "promoted"}


def league_result(*, row=RESULT_ROW, profile=None, sub="d3_ann"):
    """GET the result with the clock PINNED to WEEK, so the closed week is always PREV_WEEK.

    Pinning is not decoration: the handler derives the week from app_week_start(), so a test
    that let the real clock run would silently start comparing a hard-coded date against a
    week that has moved on — and the show-once assertion would pass or fail by calendar luck.
    Returns (response, get_league_week mock).
    """
    with patch("tools.shared.clock.app_week_start", return_value=WEEK), \
         patch("tools.shared.db.get_league_week", new_callable=AsyncMock, return_value=row) as lw, \
         patch("tools.shared.db.get_profile", new_callable=AsyncMock,
               return_value=profile if profile is not None else {}):
        r = client.get("/api/league/result", cookies=_cookies(sub))
    return r, lw


def test_unseen_result_is_returned_with_both_division_names():
    """The ceremony's whole payload: what happened, where they were, where they land."""
    r, lw = league_result()
    assert r.status_code == 200
    body = r.json()
    assert body["week_start"] == PREV
    assert body["outcome"] == "promoted"
    assert body["rank_final"] == 2
    assert body["xp_final"] == 7660
    assert body["from_division_name"] == "Volt"   # raced division 2...
    assert body["to_division_name"] == "Solar"       # ...promoted into 3
    lw.assert_awaited_once_with("d3_ann", PREV)     # the CLOSED week, never the live one


def test_a_held_result_names_the_same_division_twice():
    """`to` advances only on a promotion — telling a held student they moved up would be a
    lie the very next board read contradicts."""
    body = league_result(row=RESULT_ROW | {"outcome": "held", "rank_final": 9})[0].json()
    assert body["from_division_name"] == body["to_division_name"] == "Volt"


def test_result_is_not_returned_twice():
    """THE test in this block. The seen-flag lives on the profile, not in localStorage, so
    the Monday ceremony fires exactly once per student — across every device they log in
    from. A ceremony that re-fires on every load is a bug this app has shipped before."""
    r, _ = league_result(profile={"league_result_seen_week": PREV})
    assert r.status_code == 200
    assert r.json() == {"result": None}


def test_a_stale_seen_flag_does_not_suppress_the_next_week():
    """The flag stores WHICH week was seen, not a boolean: seen-last-week must not swallow
    this Monday's result, or a student sees exactly one ceremony ever."""
    body = league_result(profile={"league_result_seen_week": "2026-07-20"})[0].json()
    assert body["outcome"] == "promoted"


def test_no_history_yet_is_a_null_result_not_a_500():
    """A student who joined mid-week has no closed row — that is the normal case, not an
    error, and it must not break the surface that asks."""
    r, _ = league_result(row=None)
    assert r.status_code == 200
    assert r.json() == {"result": None}


def test_a_missing_league_table_is_a_null_result_not_a_500():
    """Pre-016 the table does not exist at all. main stays deployable at every commit, so
    the ceremony endpoint has to stay quiet rather than 500 on every load."""
    with patch("tools.shared.clock.app_week_start", return_value=WEEK), \
         patch("tools.shared.db.get_league_week", new_callable=AsyncMock,
               side_effect=RuntimeError('relation "league_week" does not exist')), \
         patch("tools.shared.db.get_profile", new_callable=AsyncMock, return_value={}):
        r = client.get("/api/league/result", cookies=_cookies())
    assert r.status_code == 200
    assert r.json() == {"result": None}


def test_marking_seen_stores_the_week_server_side():
    """The write that makes show-once survive a device switch."""
    with patch("tools.shared.db.update_profile", new_callable=AsyncMock) as upd:
        r = client.post("/api/league/result/seen", json={"week_start": PREV},
                        cookies=_cookies("d3_ann"))
    assert r.status_code == 200
    upd.assert_awaited_once_with("d3_ann", league_result_seen_week=PREV)


def test_marking_seen_ignores_a_student_id_in_the_body():
    """Identity is the JWT sub, never the body. A body-trusting handler would let any
    student burn someone else's ceremony — and let them replay their own forever by naming
    an id that isn't theirs."""
    with patch("tools.shared.db.update_profile", new_callable=AsyncMock) as upd:
        r = client.post("/api/league/result/seen",
                        json={"week_start": PREV, "student_id": "d3_bob"},
                        cookies=_cookies("d3_ann"))
    assert r.status_code == 200
    upd.assert_awaited_once_with("d3_ann", league_result_seen_week=PREV)


def test_result_endpoints_require_auth():
    """No cookie, no result — and no DB call either (the guard fixture proves that)."""
    assert client.get("/api/league/result").status_code in (401, 403)
    assert client.post("/api/league/result/seen",
                       json={"week_start": PREV}).status_code in (401, 403)
