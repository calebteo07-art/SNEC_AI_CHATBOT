"""D7 leaderboard ranking — pure, deterministic (RICOE v2).

The leaderboard shows *everyone by default*; a student opts out with a hide toggle
(`leaderboard_hidden`) and then never appears — not even to themselves. Ranking is by
**XP only**; ties are broken stably by the resolved display name so the order never
jitters between requests. An optional role filter ranks within that role. This module
does no I/O: the router feeds it the profile rows + a name map and gets back ready rows.
"""
from datetime import date

from tools.gamification.streak import resolve_streak


def short_name(full: str) -> str:
    """First name + last initial, e.g. 'Caleb Teo' -> 'Caleb T.'. Blank -> 'Student'."""
    parts = (full or "").strip().split()
    if not parts:
        return "Student"
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[-1][0]}."


def _resolved_name(profile: dict, names: dict[str, str]) -> str:
    """Prefer an explicit display_name; else the short name from the consent roster."""
    dn = (profile.get("display_name") or "").strip()
    if dn:
        return dn
    return short_name(names.get(profile.get("student_id"), ""))


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
    portraits: dict[str, str] | None = None,
    today: date | None = None,
) -> list[dict]:
    """Rank visible profiles by XP (desc), ties stable by name. Excludes hidden rows and
    (optionally) filters to a single role. Returns display-ready entry dicts. `portraits`
    is an optional student_id -> rendered headshot URL map (bulk-fetched by the router);
    missing entries just mean the default-mascot headshot shows. `level` is derived from
    XP and `streak_days` from checkin_history (neither is a stored column)."""
    rows = [
        p for p in profiles
        if not p.get("leaderboard_hidden")
        and (role is None or (p.get("role") or "") == role)
    ]
    ranked = sorted(
        rows,
        key=lambda p: (-int(p.get("xp") or 0), _resolved_name(p, names).lower()),
    )
    entries: list[dict] = []
    for i, p in enumerate(ranked):
        sid = p.get("student_id")
        xp = int(p.get("xp") or 0)
        entries.append({
            "rank": i + 1,
            "name": _resolved_name(p, names),
            "role": p.get("role") or "",
            "xp": xp,
            "level": (xp // 500) + 1,
            "streak_days": _entry_streak(p, today),
            "avatar_config": p.get("avatar_config"),
            "portrait_url": (portraits or {}).get(sid),
            "is_you": sid == viewer_id,
        })
    return entries
