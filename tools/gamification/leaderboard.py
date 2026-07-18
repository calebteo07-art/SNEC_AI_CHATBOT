"""D7 leaderboard ranking — pure, deterministic (RICOE v2).

The leaderboard shows *everyone by default*; a student opts out with a hide toggle
(`leaderboard_hidden`) and then never appears — not even to themselves. Ranking is by
**XP earned in the current week** (the board refreshes every Monday, SGT): the router
passes `week_start` and only a profile's `xp_week` counts, and only while its stored
`xp_week_start` still matches — a stale/absent stamp reads as 0, so inactive students
drop to the bottom without any reset job. Lifetime `xp` still rides along on each entry
(`xp_total`) for the tier ring + level. Ties break stably by the resolved display name.
An optional role filter ranks within that role. This module does no I/O: the router
feeds it the profile rows + a name map and gets back ready rows.
"""
from datetime import date

from tools.gamification.streak import resolve_streak


def weekly_tally(prev_xp_week, prev_week_start, week_start: date, gain: int) -> int:
    """The new `xp_week` after earning `gain` this SGT week. Accumulates onto the stored
    tally while its `prev_week_start` still matches the current Monday; resets to just
    `gain` when the stamp is stale or missing (a fresh week). Floored at 0. Pure — the
    lazy-reset twin of the xp_today daily tally."""
    same_week = str(prev_week_start or "") == week_start.isoformat()
    base = int(prev_xp_week or 0) if same_week else 0
    return max(0, base + int(gain or 0))


def _weekly_xp(p: dict, week_start: date | None) -> int:
    """XP this profile has earned in the current week. `week_start=None` (pure path /
    pre-migration) falls back to lifetime xp so ranking is unchanged. Otherwise the
    stored `xp_week` counts only while its `xp_week_start` matches the current Monday."""
    if week_start is None:
        return int(p.get("xp") or 0)
    if str(p.get("xp_week_start") or "") == week_start.isoformat():
        return int(p.get("xp_week") or 0)
    return 0


def full_name(full: str) -> str:
    """A person's full roster name, whitespace-normalised. Blank stays blank so callers
    can fall back to a self-chosen name before the neutral default."""
    return " ".join((full or "").split())


def _resolved_name(profile: dict, names: dict[str, str]) -> str:
    """The full roster name always wins (that is the mandate — abbreviation was dropped
    2026-07-17). A self-chosen display_name only fills in for identities with no roster
    row (staff have no consent row); 'Student' is the last resort."""
    # An "@" means the value is an email, not a name — staff have no roster row so
    # identity seeds their student_name to their address. The board is public to the
    # cohort, so never surface it (the app-wide "@ is never a name" convention).
    roster = full_name(names.get(profile.get("student_id"), ""))
    if roster and "@" not in roster:
        return roster
    chosen = (profile.get("display_name") or "").strip()
    if chosen and "@" not in chosen:
        return chosen
    return "Student"


def _entry_streak(p: dict, today: date | None) -> int:
    """The streak to show on the board. Derived from checkin_history (healed source
    of truth) when `today` is supplied by the router; else the stored column (used by
    the pure unit tests). There is no `level`/streak_days column — both are derived."""
    if today is not None:
        return resolve_streak(p.get("streak"), p.get("streak_freezes"),
                              p.get("checkin_history") or [], today)["current"]
    return int(p.get("streak") or 0)


def rank_entries(
    profiles: list[dict],
    names: dict[str, str],
    viewer_id: str,
    role: str | None = None,
    today: date | None = None,
    week_start: date | None = None,
) -> list[dict]:
    """Rank visible profiles by **weekly XP** (desc), ties stable by name. Excludes hidden
    rows and (optionally) filters to a single role. Returns display-ready entry dicts.
    `week_start` (the current Monday) scopes the ranking to XP earned this week; when it's
    None the board falls back to lifetime XP (pre-migration / pure path). Each entry's `xp`
    is the *weekly* score shown on the board, while `xp_total` carries lifetime XP for the
    tier ring and `level` is derived from lifetime XP. `streak_days` is healed from
    checkin_history; the avatar renders client-side from `avatar_config`."""
    rows = [
        p for p in profiles
        if not p.get("leaderboard_hidden")
        and (role is None or (p.get("role") or "") == role)
    ]
    ranked = sorted(
        rows,
        key=lambda p: (-_weekly_xp(p, week_start), _resolved_name(p, names).lower()),
    )
    entries: list[dict] = []
    for i, p in enumerate(ranked):
        sid = p.get("student_id")
        lifetime = int(p.get("xp") or 0)
        entries.append({
            "rank": i + 1,
            "name": _resolved_name(p, names),
            "role": p.get("role") or "",
            "xp": _weekly_xp(p, week_start),   # weekly score — what the board ranks + shows
            "xp_total": lifetime,              # lifetime XP — drives the tier ring
            "level": (lifetime // 500) + 1,    # level stays lifetime-derived (prestige)
            "streak_days": _entry_streak(p, today),
            "avatar_config": p.get("avatar_config"),
            "is_you": sid == viewer_id,
        })
    return entries
