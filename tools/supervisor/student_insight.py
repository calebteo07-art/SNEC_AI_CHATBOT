"""Consultation labels + the assembled per-student insight payload (spec §4.6).

One object, three renderers: the console panel, the student report and the OSCE dossier all
read what this returns, so they cannot describe the same student differently.

Pure: no I/O, no clock, no AI.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

from tools.supervisor.osce_analysis import (
    critical_offenders, mark_loss, repeat_offenders, trajectory,
)
from tools.supervisor.topic_map import build_topic_map, cohort_topic_means, contrast_for, norm_key

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


# Flashcard trajectory needs more points than OSCE: one card is a much smaller event than one
# station, so a handful of them says nothing about direction.
MIN_CARDS_FOR_TRAJECTORY = 20

# The timestamp column differs by table, which is exactly why `trajectory` refuses to sort for
# itself. `flashcard_attempts` stamps `ts` (migration 010) and `case_progress` `completed_at`;
# both readers return their rows in an order this function must not inherit.
_CARD_TS = "ts"
_CASE_TS = "completed_at"


def build_student_insight(*, profile: dict, sessions: list[dict], case_rows: list[dict],
                          card_rows: list[dict], case_topics: dict[str, str],
                          cohort_card_rows: list[dict], cohort_case_rows: list[dict],
                          student_id: str) -> dict:
    """Everything the three renderers read, as one JSON-ready dict.

    Every key is always present. A renderer must never have to tell "this student has no
    data" apart from "this payload predates the field".
    """
    topic_map = build_topic_map(card_rows=card_rows, case_rows=case_rows,
                                retention_scores=profile.get("retention_scores"),
                                case_topics=case_topics)

    means = cohort_topic_means(card_rows=cohort_card_rows, case_rows=cohort_case_rows,
                               case_topics=case_topics, exclude_student_id=student_id)
    contrasts = [c for c in (contrast_for(r, means) for r in topic_map.rows) if c]

    # Chronological, because `trajectory` trusts its input order by contract: `get_case_results`
    # does not order at all and `get_flashcard_attempts` orders NEWEST FIRST, which would invert
    # every verdict it produced.
    osce_scores = [float(r["score_100"]) for r in
                   sorted(case_rows, key=lambda r: str(r.get(_CASE_TS) or ""))
                   if r.get("score_100") is not None]
    card_scores = [100.0 if r.get("correct") else 0.0 for r in
                   sorted(card_rows, key=lambda r: str(r.get(_CARD_TS) or ""))]

    vocabulary = ([str(t) for t in (profile.get("retention_scores") or {})]
                  + [str(t) for t in case_topics.values()]
                  + [str(r.get("topic_tag") or "") for r in card_rows])

    return {
        "topics": [
            {"topic": r.topic, "flag": r.flag,
             "flashcards": asdict(r.flashcards), "station": asdict(r.station),
             "retention": asdict(r.retention)}
            for r in topic_map.rows
        ],
        "contrasts": [asdict(c) for c in contrasts],
        "mark_loss": asdict(mark_loss(case_rows)),
        "offenders": [asdict(o) for o in repeat_offenders(case_rows)],
        "critical_offenders": [asdict(o) for o in critical_offenders(case_rows)],
        "osce_trajectory": asdict(trajectory(osce_scores)),
        "flashcard_trajectory": asdict(
            trajectory(card_scores, minimum=MIN_CARDS_FOR_TRAJECTORY)),
        "consultations": [asdict(c) for c in consultations(sessions, vocabulary=vocabulary)],
        # Named exclusions, so a renderer can say WHICH attempts are missing from the map
        # rather than printing a total that quietly disagrees with the stations table.
        "excluded": topic_map.excluded,
    }
