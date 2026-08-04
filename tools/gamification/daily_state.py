"""The daily activity tally — the substrate every Home quest is computed from.

Mirrors the xp_today / xp_today_date pattern already in update_profile: a blob plus the
SGT day it belongs to. A stamp that is not today reads as empty, so the day rolls over
with no reset job and no cron — the same trick xp_week_start uses for the weekly board.

Pure. No I/O, no clock of its own — the caller passes today in, so tests need no DB.
"""
import copy

# The activity keys a quest may target. A source outside this set is ignored rather than
# stored: an unrecognised key could never be read back by any quest, so recording it would
# be a silent no-op that looks like a working write.
SOURCES = ("flashcards", "osce", "tutor")

EMPTY_STATE = {
    "activity": {"flashcards": 0, "osce": 0, "tutor": 0, "topics": {}},
    "quests_claimed": [],
    "chest_claimed": False,
}


def read_daily_state(profile: dict, today) -> dict:
    """This student's state for `today`, or a fresh empty one.

    Absent columns (pre-migration 018) and a stale stamp are the same answer: empty. That
    equivalence is what lets the feature ship dark.
    """
    stamp = str(profile.get("daily_state_date") or "")
    if stamp != today.isoformat():
        return copy.deepcopy(EMPTY_STATE)
    stored = profile.get("daily_state")
    if not isinstance(stored, dict):
        return copy.deepcopy(EMPTY_STATE)
    state = copy.deepcopy(EMPTY_STATE)
    activity = stored.get("activity")
    if isinstance(activity, dict):
        for key in SOURCES:
            state["activity"][key] = int(activity.get(key) or 0)
        topics = activity.get("topics")
        if isinstance(topics, dict):
            state["activity"]["topics"] = {str(k): int(v or 0) for k, v in topics.items()}
    claimed = stored.get("quests_claimed")
    if isinstance(claimed, list):
        state["quests_claimed"] = [str(c) for c in claimed]
    state["chest_claimed"] = bool(stored.get("chest_claimed"))
    return state


def record_activity(state: dict, source: str, topic: str | None = None) -> dict:
    """One completed unit of work. Returns a NEW state — the caller still holds the
    profile's own dict, and mutating that in place would write yesterday's object back
    under today's stamp."""
    if source not in SOURCES:
        return copy.deepcopy(state)
    updated = copy.deepcopy(state)
    updated["activity"][source] = int(updated["activity"].get(source) or 0) + 1
    if topic:
        topics = updated["activity"]["topics"]
        topics[str(topic)] = int(topics.get(str(topic)) or 0) + 1
    return updated
