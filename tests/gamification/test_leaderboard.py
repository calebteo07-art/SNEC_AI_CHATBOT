"""D7 leaderboard ranking — pure, deterministic (RICOE v2).

Everyone is visible by default; a student can hide (opt-out) and never appears.
Ranked by XP only; ties broken stably by resolved name. A role filter ranks within
that role. The viewer's own row is flagged. Name = display_name if set, else
first-name + last-initial from the consent roster.
"""
from datetime import date

from tools.gamification.leaderboard import rank_entries, short_name


def _p(sid, xp, **extra):
    """A minimal profile row (defaults role=OA, level derived from xp)."""
    return {
        "student_id": sid,
        "xp": xp,
        "level": (xp // 500) + 1,
        "role": extra.pop("role", "OA"),
        **extra,
    }


def test_short_name_first_and_last_initial():
    assert short_name("Caleb Teo") == "Caleb T."
    assert short_name("Madonna") == "Madonna"
    assert short_name("") == "Student"


def test_ranks_by_xp_descending():
    profiles = [_p("a", 100), _p("b", 300), _p("c", 200)]
    names = {"a": "Ann Aa", "b": "Bob Bb", "c": "Cy Cc"}
    out = rank_entries(profiles, names, viewer_id="a")
    assert [e["name"] for e in out] == ["Bob B.", "Cy C.", "Ann A."]
    assert [e["rank"] for e in out] == [1, 2, 3]
    assert [e["xp"] for e in out] == [300, 200, 100]


def test_ties_broken_stably_by_name():
    profiles = [_p("z", 200), _p("a", 200), _p("m", 200)]
    names = {"z": "Zoe Zz", "a": "Ada Aa", "m": "Mia Mm"}
    out = rank_entries(profiles, names, viewer_id="x")
    assert [e["name"] for e in out] == ["Ada A.", "Mia M.", "Zoe Z."]
    assert [e["rank"] for e in out] == [1, 2, 3]


def test_excludes_hidden_and_recomputes_ranks():
    profiles = [_p("a", 300), _p("b", 200, leaderboard_hidden=True), _p("c", 100)]
    names = {"a": "Ann Aa", "b": "Bob Bb", "c": "Cy Cc"}
    out = rank_entries(profiles, names, viewer_id="a")
    assert [e["name"] for e in out] == ["Ann A.", "Cy C."]
    assert [e["rank"] for e in out] == [1, 2]


def test_role_filter_ranks_within_role():
    profiles = [_p("a", 300, role="OA"), _p("b", 500, role="OT"), _p("c", 100, role="OA")]
    names = {"a": "Ann Aa", "b": "Bob Bb", "c": "Cy Cc"}
    out = rank_entries(profiles, names, viewer_id="a", role="OA")
    assert [e["name"] for e in out] == ["Ann A.", "Cy C."]
    assert all(e["role"] == "OA" for e in out)
    assert [e["rank"] for e in out] == [1, 2]


def test_flags_viewer_row():
    profiles = [_p("a", 300), _p("b", 200)]
    names = {"a": "Ann Aa", "b": "Bob Bb"}
    out = rank_entries(profiles, names, viewer_id="b")
    you = [e for e in out if e["is_you"]]
    assert len(you) == 1 and you[0]["name"] == "Bob B."


def test_display_name_overrides_short_name():
    profiles = [_p("a", 300, display_name="Iris Champ")]
    names = {"a": "Ann Aa"}
    out = rank_entries(profiles, names, viewer_id="a")
    assert out[0]["name"] == "Iris Champ"


def test_blank_display_name_falls_back_to_short_name():
    profiles = [_p("a", 300, display_name="   ")]
    names = {"a": "Ann Aa"}
    out = rank_entries(profiles, names, viewer_id="a")
    assert out[0]["name"] == "Ann A."


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


def test_rank_entries_carries_portrait_urls():
    profiles = [
        {"student_id": "a", "xp": 10, "avatar_config": {"topper": "crown"}},
        {"student_id": "b", "xp": 5, "avatar_config": None},
    ]
    urls = {"a": "https://cdn/x.webp"}
    entries = rank_entries(profiles, {}, viewer_id="a", portraits=urls)
    assert entries[0]["portrait_url"] == "https://cdn/x.webp"
    assert entries[1]["portrait_url"] is None
