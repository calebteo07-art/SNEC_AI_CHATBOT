"""Close the previous league week — lazily, on the first board read of a new week.

There is no cron and no Celery beat in this app (the one existing queue has a known
silent-drop bug), so the rollover is triggered by traffic and made safe by a database
seal rather than by a scheduler or an in-process lock. That also satisfies the
no-shared-in-process-state invariant: any worker can win the seal, and only one will.
"""
from datetime import date

from tools.gamification.league import close_week, split_pools
from tools.shared import db


def _final_scores(profiles: list[dict], sealed: list[dict], week_start: date) -> dict[str, int]:
    """Each student's final score for the closed week.

    Two writers feed this. The earn path seals a score when a student earns in the new week
    (their live xp_week has already been reset, so the sealed row is the only truth). Anyone
    who has not earned still carries the old stamp, so their live column is still correct."""
    stamp = week_start.isoformat()
    scores = {r["student_id"]: int(r.get("xp_final") or 0)
              for r in sealed if str(r.get("week_start")) == stamp}
    for p in profiles:
        sid = p.get("student_id")
        if sid in scores:
            continue
        if str(p.get("xp_week_start") or "") == stamp:
            scores[sid] = int(p.get("xp_week") or 0)
    return scores


async def run_rollover(profiles: list[dict], week_start: date) -> bool:
    """Close `week_start`. Returns True if this caller did the work, False if someone else
    already holds the seal (or the tables aren't there yet). Safe to call on every read."""
    if not await db.take_seal(f"week:{week_start.isoformat()}"):
        return False

    sealed = await db.get_league_week_all(week_start.isoformat())
    scores = _final_scores(profiles, sealed, week_start)

    # Hidden students are dropped here, before ranking — a hidden student must never
    # occupy a promotion slot that a visible student can see going unused.
    visible = [p for p in profiles if not p.get("leaderboard_hidden")]

    by_division: dict[int, list[dict]] = {}
    for p in visible:
        sid = p.get("student_id")
        if sid not in scores:
            continue  # played no part in the closed week
        by_division.setdefault(int(p.get("division") or 1), []).append(p)

    all_rows: list[dict] = []
    for division, members in by_division.items():
        pools = split_pools([p["student_id"] for p in members], week_start)
        for pool in pools:
            standings = sorted(
                ({"student_id": sid, "xp_final": scores.get(sid, 0)} for sid in pool),
                key=lambda s: (-s["xp_final"], s["student_id"]),
            )
            all_rows.extend(close_week(standings, division))

    persisted = [{k: v for k, v in r.items() if k != "next_division"}
                 | {"week_start": week_start.isoformat()} for r in all_rows]
    await db.upsert_league_week(persisted)

    for r in all_rows:
        if r["outcome"] == "promoted":
            try:
                await db.update_profile(r["student_id"], division=r["next_division"])
            except Exception:
                continue  # one failed bump must not abandon the rest of the cohort
    return True
