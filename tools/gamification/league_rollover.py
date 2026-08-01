"""Close the previous league week — lazily, on the first board read of a new week.

There is no cron and no Celery beat in this app (the one existing queue has a known
silent-drop bug), so the rollover is triggered by traffic and made safe by a database
seal rather than by a scheduler or an in-process lock. That also satisfies the
no-shared-in-process-state invariant: any worker can win the seal, and only one will.

No pool splitting here, by design. `league.split_pools` exists (and stays tested) for a
Duolingo-scale cohort that has to shard hundreds of millions of users into 30-person
races — EyeBot serves one eye centre's students, tens at a time, so a division never
needs to shard. It used to be called here anyway: each division was split into
sub-pools and each sub-pool ranked separately, while `GET /api/leaderboard` ranked the
whole division with no splitting at all. Above `league.POOL_MAX` (30) those two
disagreed — a student raced one board all week and was judged against a different,
hash-bucketed population at the close. Migration 016 defaults every student into
division 1, so above 30 signups this was not a future risk, it was the launch-day
state. One division is one race: rank it as a single list, and the rollover and the
live board agree by construction at any cohort size. If a future cohort outgrows a
single pool, split *both* sides of this at once, in the same change — splitting only
the rollover is exactly how this divergence happened. Until then, a division that
crosses `POOL_MAX` only trips an audit event, so growth past that assumption surfaces
in the audit trail before a student notices their rank stopped meaning anything.
"""
from datetime import date

from tools.gamification.league import POOL_MAX, close_week
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
    already holds the seal (or the tables aren't there yet) — or if the work itself failed
    after the seal was taken. Safe to call on every read.

    A failure partway through (a transient Supabase blip, a table not yet migrated) releases
    the seal instead of leaving it held: without that, the week would be permanently marked
    closed with no outcomes ever written and no recovery short of manual SQL, since every
    later caller's take_seal would keep hitting the same duplicate key."""
    key = f"week:{week_start.isoformat()}"
    if not await db.take_seal(key):
        return False

    try:
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
            if len(members) > POOL_MAX:
                # A documented threshold nobody is watching is how this bug shipped in
                # the first place — surface it in the audit trail, not just a comment.
                # audit_events, not audit_log.log(): the .tmp/audit_log.jsonl file has no
                # reader in this app and lives on Render's ephemeral disk, so the record
                # would be gone by the next restart. audit_events is what the staff-facing
                # GET /api/admin/audit serves. Best-effort: the tripwire is an observer,
                # and it fires inside the block that releases the seal on error, so an
                # unguarded raise here would leave the week unclosed and nobody promoted.
                try:
                    await db.insert_audit_event(
                        action="league_pool_max_exceeded", feature="gamification",
                        detail=f"division {division} has {len(members)} members (max {POOL_MAX})",
                    )
                except Exception:
                    pass
            standings = sorted(
                ({"student_id": p["student_id"], "xp_final": scores.get(p["student_id"], 0)}
                 for p in members),
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
    except Exception as exc:
        # Everything above ran with the seal held — release it so the next board read
        # retries the whole rollover, rather than finding the week already "closed".
        # This caller is a fire-and-forget BackgroundTask, so return False instead of
        # raising (there is no one above us to usefully catch it) but still leave a
        # trace, or a real outage looks identical to the ordinary lost-the-race case.
        await db.release_seal(key)
        # audit_events, not audit_log.log(), for the same reason as the tripwire above: a
        # trace only counts if a human can find it, and .tmp/audit_log.jsonl has no reader
        # in this app and does not survive a restart. This is the event that least tolerates
        # that — a rollover failing on every retry means no week ever closes and nobody is
        # ever promoted, and nothing else in the system records why. Guarded because we are
        # already on the failure path: an audit write that raised here would turn the
        # returned False into an exception escaping into a fire-and-forget BackgroundTask.
        try:
            await db.insert_audit_event(action="league_rollover_error", feature="gamification",
                                        detail=str(exc))
        except Exception:
            pass
        return False

    return True
