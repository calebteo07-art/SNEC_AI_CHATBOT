"""D7 leaderboard ranking — pure, deterministic (RICOE v2).

Everyone is visible by default; a student can hide (opt-out) and never appears.
Ranked by XP only; ties broken stably by resolved name. A role filter ranks within
that role. The viewer's own row is flagged. Name = the full roster name; a self-chosen
display_name only fills in for identities with no roster row (staff).
"""
from datetime import date

from tools.gamification.leaderboard import (
    rank_entries, full_name, weekly_tally, would_be_rank, _resolved_name,
)

WEEK = date(2026, 5, 4)  # a Monday — the weekly-leaderboard boundary (SGT)


def _p(sid, xp, **extra):
    """A minimal profile row (defaults role=OA, level derived from xp)."""
    return {
        "student_id": sid,
        "xp": xp,
        "level": (xp // 500) + 1,
        "role": extra.pop("role", "OA"),
        **extra,
    }


def test_full_name_normalises_whitespace():
    assert full_name("  Caleb   Teo ") == "Caleb Teo"
    assert full_name("Madonna") == "Madonna"
    assert full_name("") == ""          # blank stays blank so callers can fall back


def test_ranks_by_xp_descending():
    profiles = [_p("a", 100), _p("b", 300), _p("c", 200)]
    names = {"a": "Ann Aa", "b": "Bob Bb", "c": "Cy Cc"}
    out = rank_entries(profiles, names, viewer_id="a")
    assert [e["name"] for e in out] == ["Bob Bb", "Cy Cc", "Ann Aa"]
    assert [e["rank"] for e in out] == [1, 2, 3]
    assert [e["xp"] for e in out] == [300, 200, 100]


def test_ties_broken_stably_by_name():
    profiles = [_p("z", 200), _p("a", 200), _p("m", 200)]
    names = {"z": "Zoe Zz", "a": "Ada Aa", "m": "Mia Mm"}
    out = rank_entries(profiles, names, viewer_id="x")
    assert [e["name"] for e in out] == ["Ada Aa", "Mia Mm", "Zoe Zz"]
    assert [e["rank"] for e in out] == [1, 2, 3]


def test_excludes_hidden_and_recomputes_ranks():
    profiles = [_p("a", 300), _p("b", 200, leaderboard_hidden=True), _p("c", 100)]
    names = {"a": "Ann Aa", "b": "Bob Bb", "c": "Cy Cc"}
    out = rank_entries(profiles, names, viewer_id="a")
    assert [e["name"] for e in out] == ["Ann Aa", "Cy Cc"]
    assert [e["rank"] for e in out] == [1, 2]


def test_role_filter_ranks_within_role():
    profiles = [_p("a", 300, role="OA"), _p("b", 500, role="OT"), _p("c", 100, role="OA")]
    names = {"a": "Ann Aa", "b": "Bob Bb", "c": "Cy Cc"}
    out = rank_entries(profiles, names, viewer_id="a", role="OA")
    assert [e["name"] for e in out] == ["Ann Aa", "Cy Cc"]
    assert all(e["role"] == "OA" for e in out)
    assert [e["rank"] for e in out] == [1, 2]


def test_flags_viewer_row():
    profiles = [_p("a", 300), _p("b", 200)]
    names = {"a": "Ann Aa", "b": "Bob Bb"}
    out = rank_entries(profiles, names, viewer_id="b")
    you = [e for e in out if e["is_you"]]
    assert len(you) == 1 and you[0]["name"] == "Bob Bb"


def test_full_name_overrides_custom_display_name():
    # Full names are the mandate: the roster name wins even over a self-chosen display_name.
    profiles = [_p("a", 300, display_name="Iris Champ")]
    names = {"a": "Ann Aa"}
    out = rank_entries(profiles, names, viewer_id="a")
    assert out[0]["name"] == "Ann Aa"


def test_display_name_only_used_when_no_roster_name():
    # Staff have no consent/roster row, so there is no full name to show — their
    # self-chosen display_name fills in, and a neutral 'Student' is the last resort.
    profiles = [_p("staff", 300, display_name="Coordinator Lee"), _p("ghost", 100)]
    names = {}  # neither identity is on the roster
    out = rank_entries(profiles, names, viewer_id="staff")
    by_you = {e["is_you"]: e for e in out}
    assert by_you[True]["name"] == "Coordinator Lee"     # staff -> their display_name
    assert by_you[False]["name"] == "Student"            # nothing at all -> neutral fallback


def test_streak_and_avatar_passthrough():
    cfg = {"bodyColor": "aqua", "irisColor": "galaxy"}
    profiles = [_p("a", 300, streak=7, avatar_config=cfg)]
    names = {"a": "Ann Aa"}
    out = rank_entries(profiles, names, viewer_id="a")
    assert out[0]["streak_days"] == 7
    assert out[0]["avatar_config"] == cfg


def test_avatar_config_carries_character_axes_for_eyecon_fallback():
    # The <Eyecon> representative-tile fallback (frontend) needs the tile-bearing axes
    # (topper/outfit/glasses/…), not just `background`, to show a customized look on the
    # board when the paid AI portrait hasn't rendered. Lock in that the FULL config — not a
    # background-only subset — reaches each entry.
    cfg = {"bodyColor": "aqua", "topper": "crown", "outfit": "labcoat", "background": "galaxy"}
    profiles = [_p("a", 300, avatar_config=cfg)]
    out = rank_entries(profiles, {"a": "Ann Aa"}, viewer_id="a")
    assert out[0]["avatar_config"] == cfg
    assert out[0]["avatar_config"]["topper"] == "crown"


def test_missing_streak_and_avatar_default_safely():
    profiles = [_p("a", 300)]
    names = {"a": "Ann Aa"}
    out = rank_entries(profiles, names, viewer_id="a")
    assert out[0]["streak_days"] == 0
    assert out[0]["avatar_config"] is None


def test_level_derived_from_xp_not_the_stored_column():
    # There is no `level` column in the DB (reading it returned always-1). Level must
    # be computed from xp; a stale column value is ignored.
    profiles = [{"student_id": "a", "xp": 1250, "level": 1}]
    out = rank_entries(profiles, {"a": "Ann Aa"}, viewer_id="a")
    assert out[0]["level"] == 3   # 1250 // 500 + 1


def test_streak_days_healed_from_history_when_today_supplied():
    hist = ["2026-05-04", "2026-05-05", "2026-05-06"]
    profiles = [{"student_id": "a", "xp": 300, "streak": 0, "checkin_history": hist}]
    out = rank_entries(profiles, {"a": "Ann Aa"}, viewer_id="a", today=date(2026, 5, 6))
    assert out[0]["streak_days"] == 3   # recovered from the check-in log, not the 0 column


# ── Weekly leaderboard (resets each SGT week; ranks by XP earned THIS week) ──────

def test_ranks_by_weekly_xp_when_week_start_supplied():
    # Lifetime order is a(1000) > b(500); but THIS WEEK b earned far more, so the
    # weekly board flips them. The displayed score becomes the weekly value.
    profiles = [
        {"student_id": "a", "xp": 1000, "xp_week": 20, "xp_week_start": "2026-05-04"},
        {"student_id": "b", "xp": 500, "xp_week": 300, "xp_week_start": "2026-05-04"},
    ]
    out = rank_entries(profiles, {"a": "Ann Aa", "b": "Bob Bb"}, viewer_id="a", week_start=WEEK)
    assert [e["name"] for e in out] == ["Bob Bb", "Ann Aa"]   # weekly order, not lifetime
    assert [e["xp"] for e in out] == [300, 20]                # score shown = weekly
    assert out[1]["xp_total"] == 1000                         # lifetime preserved for tier ring
    assert out[1]["level"] == 3                               # level from LIFETIME (1000//500+1)


def test_stale_week_start_counts_as_zero_this_week():
    # b's big xp_week is from LAST week (start 04-27) — it counts 0 now and ranks last.
    profiles = [
        {"student_id": "a", "xp": 100, "xp_week": 50, "xp_week_start": "2026-05-04"},
        {"student_id": "b", "xp": 999, "xp_week": 900, "xp_week_start": "2026-04-27"},
    ]
    out = rank_entries(profiles, {"a": "Ann Aa", "b": "Bob Bb"}, viewer_id="a", week_start=WEEK)
    assert [e["name"] for e in out] == ["Ann Aa", "Bob Bb"]
    assert [e["xp"] for e in out] == [50, 0]


def test_missing_weekly_columns_count_as_zero_this_week():
    profiles = [
        {"student_id": "a", "xp": 300, "xp_week": 40, "xp_week_start": "2026-05-04"},
        {"student_id": "b", "xp": 700},  # no weekly columns at all -> 0 this week
    ]
    out = rank_entries(profiles, {"a": "Ann Aa", "b": "Bob Bb"}, viewer_id="a", week_start=WEEK)
    assert [e["name"] for e in out] == ["Ann Aa", "Bob Bb"]
    assert [e["xp"] for e in out] == [40, 0]


def test_week_start_none_ranks_by_lifetime_xp_backward_compat():
    # Pre-migration / pure path: no week boundary -> rank by lifetime xp (unchanged).
    profiles = [
        {"student_id": "a", "xp": 100, "xp_week": 999, "xp_week_start": "2026-05-04"},
        {"student_id": "b", "xp": 500},
    ]
    out = rank_entries(profiles, {"a": "Ann Aa", "b": "Bob Bb"}, viewer_id="a")
    assert [e["name"] for e in out] == ["Bob Bb", "Ann Aa"]   # lifetime order
    assert [e["xp"] for e in out] == [500, 100]


def test_entry_always_carries_lifetime_xp_total():
    profiles = [{"student_id": "a", "xp": 1250, "xp_week": 10, "xp_week_start": "2026-05-04"}]
    out = rank_entries(profiles, {"a": "Ann Aa"}, viewer_id="a", week_start=WEEK)
    assert out[0]["xp_total"] == 1250 and out[0]["level"] == 3 and out[0]["xp"] == 10


def test_weekly_tally_accumulates_within_the_same_week():
    assert weekly_tally(120, "2026-05-04", WEEK, 30) == 150


def test_weekly_tally_resets_when_week_start_is_stale():
    assert weekly_tally(500, "2026-04-27", WEEK, 30) == 30


def test_weekly_tally_resets_when_week_start_missing():
    assert weekly_tally(500, None, WEEK, 30) == 30


def test_weekly_tally_floors_at_zero():
    assert weekly_tally(10, "2026-05-04", WEEK, -50) == 0


# --- Email addresses must never render as a leaderboard name (bug hunt rank 10) ---
# Staff have no roster row, so identity seeds their student_name to their raw email.
# The board is shown to every student — an email is a PII/identity leak and violates
# the app-wide "@ is never a name" convention.

def test_resolved_name_never_renders_an_email():
    # roster name is an email (the staff case) → fall through, never surface the address
    assert "@" not in _resolved_name({"student_id": "s1"}, {"s1": "coach@snec.com.sg"})
    # display_name is an email too → still masked, lands on the neutral default
    assert _resolved_name({"student_id": "s1", "display_name": "boss@x.com"}, {"s1": ""}) == "Student"


def test_resolved_name_keeps_a_real_name():
    assert _resolved_name({"student_id": "s1"}, {"s1": "Alice Tan"}) == "Alice Tan"
    # a self-chosen non-email display name still fills in when there is no roster name
    assert _resolved_name({"student_id": "s1", "display_name": "Ace"}, {"s1": ""}) == "Ace"


def test_rank_entries_masks_email_names():
    profiles = [_p("s1", 300, checkin_history=[])]
    entries = rank_entries(profiles, {"s1": "coach@snec.com.sg"}, viewer_id="s1")
    assert "@" not in entries[0]["name"]


# ── Promotion league (division-scoped ranking + rank delta) ─────────────────────

def test_ranks_within_the_viewers_division():
    profiles = [
        _p("a", 100, division=2, xp_week=900, xp_week_start=WEEK.isoformat()),
        _p("b", 100, division=3, xp_week=999, xp_week_start=WEEK.isoformat()),
        _p("c", 100, division=2, xp_week=700, xp_week_start=WEEK.isoformat()),
    ]
    names = {"a": "Ann Aa", "b": "Bob Bb", "c": "Cy Cc"}
    out = rank_entries(profiles, names, viewer_id="a", week_start=WEEK, division=2)
    assert [e["name"] for e in out] == ["Ann Aa", "Cy Cc"]   # Bob is in another division
    assert [e["rank"] for e in out] == [1, 2]


def test_entries_carry_division_and_rank_delta():
    profiles = [
        _p("a", 100, division=2, xp_week=900, xp_week_start=WEEK.isoformat(), rank_prev=4),
        _p("c", 100, division=2, xp_week=700, xp_week_start=WEEK.isoformat()),
    ]
    names = {"a": "Ann Aa", "c": "Cy Cc"}
    out = rank_entries(profiles, names, viewer_id="a", week_start=WEEK, division=2)
    assert out[0]["division"] == 2
    assert out[0]["rank_delta"] == 3          # was 4th, now 1st
    assert out[1]["rank_delta"] is None       # no prior snapshot -> dash, not a fake 0


def test_division_none_ranks_everyone_as_before():
    """Pre-migration: no division column anywhere => one board, unchanged behaviour."""
    profiles = [_p("a", 300), _p("b", 500)]
    names = {"a": "Ann Aa", "b": "Bob Bb"}
    out = rank_entries(profiles, names, viewer_id="a", division=None)
    assert [e["rank"] for e in out] == [1, 2]
    assert out[0]["division"] == 1


def test_entries_carry_student_id_for_server_side_joins():
    """The router needs to map an entry back to its profile without matching on display
    name — two students can resolve to the same name. Never exposed in the API response."""
    profiles = [_p("a", 300), _p("b", 500)]
    names = {"a": "Ann Aa", "b": "Bob Bb"}
    out = rank_entries(profiles, names, viewer_id="a")
    assert [e["student_id"] for e in out] == ["b", "a"]


# ── would_be_rank: where a hidden student would stand ────────────────────────
# A hidden student is off the ladder for everyone (that is the consent guarantee), but
# still needs to see their own standing. This computes that position *against* the
# visible ladder without ever inserting them into it.

def test_would_be_rank_places_viewer_between_neighbours():
    entries = [{"xp": 300, "name": "Ann Aa"}, {"xp": 100, "name": "Bob Bb"}]
    assert would_be_rank(entries, 200, "Cy Cc") == 2


def test_would_be_rank_tops_the_board_and_bottoms_it():
    entries = [{"xp": 300, "name": "Ann Aa"}, {"xp": 100, "name": "Bob Bb"}]
    assert would_be_rank(entries, 999, "Cy Cc") == 1     # would be champion
    assert would_be_rank(entries, 0, "Cy Cc") == 3       # would be last


def test_would_be_rank_on_an_empty_board_is_first():
    assert would_be_rank([], 0, "Cy Cc") == 1


def test_would_be_rank_breaks_ties_the_same_way_rank_entries_does():
    """The number a hidden student sees must agree with the ladder everyone else sees,
    so the tie-break has to be the identical (-xp, name.lower()) key. On equal XP the
    earlier name ranks higher: 'Ada' beats 'Cy' beats 'Zoe'."""
    entries = [{"xp": 200, "name": "Ada Aa"}, {"xp": 200, "name": "Zoe Zz"}]
    assert would_be_rank(entries, 200, "Cy Cc") == 2
    assert would_be_rank(entries, 200, "Aaa Aa") == 1
    assert would_be_rank(entries, 200, "Zzz Zz") == 3


def test_would_be_rank_tie_break_is_case_insensitive():
    """rank_entries lowercases before comparing; an uppercase name must not sort ahead
    of every lowercase one (ASCII 'Z' < 'a')."""
    entries = [{"xp": 200, "name": "adam Aa"}]
    assert would_be_rank(entries, 200, "ZOE Zz") == 2


def test_would_be_rank_agrees_with_rank_entries_when_the_student_is_unhidden():
    """The property that matters: the rank a hidden student is shown is exactly the rank
    they would get by un-hiding. Verified against the real ranker rather than restated."""
    hidden = _p("h", 250, leaderboard_hidden=True)
    others = [_p("a", 300), _p("b", 200), _p("c", 100)]
    names = {"a": "Ann Aa", "b": "Bob Bb", "c": "Cy Cc", "h": "Hal Hh"}

    visible = rank_entries(others + [hidden], names, viewer_id="h")
    predicted = would_be_rank(visible, 250, "Hal Hh")

    unhidden = dict(hidden, leaderboard_hidden=False)
    actual = next(e["rank"] for e in rank_entries(others + [unhidden], names, viewer_id="h")
                  if e["student_id"] == "h")
    assert predicted == actual == 2
