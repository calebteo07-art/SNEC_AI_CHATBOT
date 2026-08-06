"""Consultation labels + the assembled per-student insight payload (spec §4.6).

One object, three renderers: the console panel, the student report and the OSCE dossier all
read what this returns, so they cannot describe the same student differently.

Pure: no I/O, no clock, no AI.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

from tools.supervisor.topic_map import norm_key

# chat.py's default topic. Every tutor row written before the client started sending a real
# label carries it, so it means exactly one thing: no label was recorded.
TOPIC_SENTINEL = "Ophthalmology"
_STATION_PREFIX = "case:"


@dataclass(frozen=True)
class Consultation:
    label: str          # "" when nothing could be derived -> renders "Topic not recorded"
    count: int
    last_seen: str      # YYYY-MM-DD; "" when no session in the group carried a date
    # True when ANY session in the group was matched from its summary rather than recorded.
    # It is a trust caveat on the whole group, so it errs toward flagging: a label backed by
    # one recorded session and nine inferred ones is mostly guesswork, and saying so costs
    # less than presenting nine inferences as fact.
    derived: bool


def _label_for(row: dict, vocabulary: list[str]) -> tuple[str, bool]:
    topic = str(row.get("topic") or "").strip()
    if topic and topic != TOPIC_SENTINEL:
        return topic, False
    # Legacy row: the student's question was never stored, so the only evidence of what was
    # discussed is the tutor's own last reply. Match it against the topic vocabulary; never
    # guess beyond it.
    summary = norm_key(row.get("summary"))
    for term in vocabulary:
        if term and term in summary:
            return term, True
    return "", False


def consultations(sessions: list[dict], *, vocabulary: list[str]) -> list[Consultation]:
    """Group tutor sessions into labels with counts (spec §4.6). No transcript.

    Station sessions are logged into the same table with a server-written "Case: " prefix and
    are excluded here.
    """
    # Longest first, so "intraocular pressure" wins over "pressure".
    terms = sorted({norm_key(v) for v in vocabulary if norm_key(v)}, key=len, reverse=True)
    groups: dict[str, dict] = {}
    for row in sessions:
        if str(row.get("topic") or "").strip().lower().startswith(_STATION_PREFIX):
            continue
        label, derived = _label_for(row, terms)
        seen = str(row.get("created_at") or "")[:10]
        entry = groups.setdefault(norm_key(label), {"label": label, "count": 0,
                                                    "last_seen": "", "derived": False})
        entry["count"] += 1
        # ANY, not first-wins: seeding from whichever row arrived first would make a trust
        # caveat depend on Supabase's row order.
        entry["derived"] = entry["derived"] or derived
        if seen > entry["last_seen"]:
            entry["last_seen"] = seen
    out = [Consultation(**e) for e in groups.values()]
    # Most-consulted first, then newest. `not last_seen` demotes an undated group to the end
    # of its count group: an empty date negates to "", which would otherwise sort ahead of
    # every real one and present the group we know least about as the most recent.
    return sorted(out,
                  key=lambda c: (-c.count, not c.last_seen, _negate_date(c.last_seen), c.label))


def _negate_date(iso_day: str) -> str:
    """Sort ISO days newest-first inside a tuple that is otherwise ascending."""
    return "".join(chr(ord("9") - int(ch)) if ch.isdigit() else ch for ch in iso_day)
