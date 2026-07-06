"""D7 leaderboard ranking — pure, deterministic (RICOE v2).

The leaderboard shows *everyone by default*; a student opts out with a hide toggle
(`leaderboard_hidden`) and then never appears — not even to themselves. Ranking is by
**XP only**; ties are broken stably by the resolved display name so the order never
jitters between requests. An optional role filter ranks within that role. This module
does no I/O: the router feeds it the profile rows + a name map and gets back ready rows.
"""


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


def rank_entries(
    profiles: list[dict],
    names: dict[str, str],
    viewer_id: str,
    role: str | None = None,
) -> list[dict]:
    """Rank visible profiles by XP (desc), ties stable by name. Excludes hidden rows and
    (optionally) filters to a single role. Returns display-ready entry dicts."""
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
        entries.append({
            "rank": i + 1,
            "name": _resolved_name(p, names),
            "role": p.get("role") or "",
            "xp": int(p.get("xp") or 0),
            "level": int(p.get("level") or 1),
            "streak_days": int(p.get("streak") or 0),
            "avatar_config": p.get("avatar_config"),
            "is_you": sid == viewer_id,
        })
    return entries
