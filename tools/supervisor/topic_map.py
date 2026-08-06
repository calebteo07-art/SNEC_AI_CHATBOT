"""Topic-axis analysis for one student: the knowledge x performance map (spec §4.1, §4.5, §5).

Three sources measure a student on different axes and key their topics DIFFERENTLY --
flashcard `topic_tag`s, OSCE case `topic`s, and the `retention_scores` dict. The report this
replaces joined them on the raw key, so a namespace mismatch printed a dash and a
flashcard-only topic never appeared at all (AdminStudentDetail.tsx:103). Everything here goes
through `norm_key` first and the row set is the UNION, never one source's keys.

Pure: no I/O, no clock, no AI.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

# The two weak lines DIFFER on purpose. 65 is the flashcard weak line used everywhere else in
# the app (admin.py's weak filter, the console bar hues); 60 is the OSCE pass mark
# (sessionExport.PASS_MARK). Borrowing one for the other would restate a passing station as a
# failure, or forgive a failing one.
KNOWLEDGE_WEAK = 65.0
PERFORMANCE_WEAK = 60.0
STRONG = 75.0

# Below these an axis has a value but no verdict -- it is reported as `thin`, with its n.
MIN_CARDS = 5
MIN_ATTEMPTS = 1

_WS = re.compile(r"\s+")


def norm_key(raw: object) -> str:
    """Collapse a topic (or any text key) onto one comparable form."""
    return _WS.sub(" ", str(raw or "").strip().lower().replace("_", " ")).strip()


def topic_union(*, flashcards: dict, stations: dict, retention: dict) -> list[str]:
    """Every topic any source knows about, normalised, sorted. Sorted for determinism: the
    row order of a printed report must not depend on dict insertion order."""
    keys = set()
    for source in (flashcards, stations, retention):
        for raw in source:
            key = norm_key(raw)
            if key:
                keys.add(key)
    return sorted(keys)


@dataclass(frozen=True)
class Cell:
    """One measurement of one topic on one axis. `n` travels with `value` everywhere: a
    percentage without its denominator is not a finding."""
    value: float | None = None
    n: int = 0
    band: str = "absent"     # strong | developing | weak | thin | absent


def band_for(value: float | None, *, n: int, minimum: int, weak_line: float) -> str:
    if value is None or n <= 0:
        return "absent"
    if n < minimum:
        return "thin"
    if value >= STRONG:
        return "strong"
    if value < weak_line:
        return "weak"
    return "developing"


def flashcard_cells(card_rows: list[dict]) -> dict[str, Cell]:
    """Per-topic flashcard grade = correct / total (spec §5).

    `score` is deliberately ignored: it is an XP value -- base points times a combo
    multiplier, clamped at student.py:528 -- so averaging it grades a student's answer streak
    rather than their correctness.
    """
    agg: dict[str, list[int]] = {}
    for row in card_rows:
        key = norm_key(row.get("topic_tag") or "general")
        if not key:
            continue
        bucket = agg.setdefault(key, [0, 0])
        bucket[1] += 1
        if row.get("correct"):
            bucket[0] += 1
    cells: dict[str, Cell] = {}
    for key, (correct, total) in agg.items():
        pct = round(100 * correct / total, 1)
        cells[key] = Cell(value=pct, n=total,
                          band=band_for(pct, n=total, minimum=MIN_CARDS, weak_line=KNOWLEDGE_WEAK))
    return cells


def station_cells(case_rows: list[dict],
                  case_topics: dict[str, str]) -> tuple[dict[str, Cell], dict[str, int]]:
    """Per-topic station performance, plus what was left out and why.

    Two exclusions, both COUNTED rather than dropped: an attempt whose case is missing from
    the index has no topic to sit under (bucketing it anywhere would invent a placement), and
    a pre-migration-011 row has no /100 score to place on this axis at all.
    """
    agg: dict[str, list[float]] = {}
    excluded = {"unmapped_case": 0, "unscored": 0}
    for row in case_rows:
        score = row.get("score_100")
        if score is None:
            excluded["unscored"] += 1
            continue
        key = norm_key(case_topics.get(str(row.get("case_id") or "").strip()))
        if not key:
            excluded["unmapped_case"] += 1
            continue
        bucket = agg.setdefault(key, [0.0, 0])
        bucket[0] += float(score)
        bucket[1] += 1
    cells: dict[str, Cell] = {}
    for key, (total, n) in agg.items():
        mean = round(total / n, 1)
        cells[key] = Cell(value=mean, n=int(n),
                          band=band_for(mean, n=int(n), minimum=MIN_ATTEMPTS,
                                        weak_line=PERFORMANCE_WEAK))
    return cells, excluded


def retention_cells(retention_scores: dict | None) -> dict[str, Cell]:
    """`retention_scores` is a 0-1 dict with no attempt count behind it, so n is 1 by
    construction. Banded on the knowledge line: it measures durability of recall, and the
    console has always coloured it against 0.65."""
    cells: dict[str, Cell] = {}
    for raw, score in (retention_scores or {}).items():
        key = norm_key(raw)
        if not key:
            continue
        try:
            pct = round(float(score) * 100, 1)
        except (TypeError, ValueError):
            continue
        cells[key] = Cell(value=pct, n=1,
                          band=band_for(pct, n=1, minimum=1, weak_line=KNOWLEDGE_WEAK))
    return cells


# Ordered worst-first for the row sort below: a flagged row is the reason a trainer opens
# this table, so flagged rows lead it.
_FLAG_RANK = {"knows_cant_do": 0, "consistent_gap": 1, "rote": 2, "": 3}

_UNBANDED = ("thin", "absent")


def flag_for(flashcards: Cell, station: Cell) -> str:
    """The diagonal read of the map (spec §4.1).

    Both cells must be BANDED. A flag off a `thin` cell would turn four lucky cards into
    "knows it" and a single station into "can't do it" -- the shape of the numbers is
    suggestive there, which is exactly why the guard is explicit.
    """
    if flashcards.band in _UNBANDED or station.band in _UNBANDED:
        return ""
    if flashcards.value >= STRONG and station.value < PERFORMANCE_WEAK:
        return "knows_cant_do"
    if station.value >= STRONG and flashcards.value < KNOWLEDGE_WEAK:
        return "rote"
    if flashcards.band == "weak" and station.band == "weak":
        return "consistent_gap"
    return ""


@dataclass(frozen=True)
class TopicRow:
    topic: str
    flashcards: Cell
    station: Cell
    retention: Cell
    flag: str = ""


@dataclass(frozen=True)
class TopicMap:
    rows: list[TopicRow]
    excluded: dict[str, int]


def _worst_banded(row: TopicRow) -> float:
    """The lowest value this row has a VERDICT for. Unbanded axes are ignored rather than
    treated as 0 -- 'not measured' must never sort as 'terrible'."""
    values = [c.value for c in (row.flashcards, row.station, row.retention)
              if c.band not in _UNBANDED and c.value is not None]
    return min(values) if values else 999.0


def build_topic_map(*, card_rows: list[dict], case_rows: list[dict],
                    retention_scores: dict | None,
                    case_topics: dict[str, str]) -> TopicMap:
    """The knowledge x performance map: one row per topic ANY source knows about."""
    fc = flashcard_cells(card_rows)
    st, excluded = station_cells(case_rows, case_topics)
    rt = retention_cells(retention_scores)

    rows = []
    for topic in topic_union(flashcards=fc, stations=st, retention=rt):
        f, s, r = fc.get(topic, Cell()), st.get(topic, Cell()), rt.get(topic, Cell())
        rows.append(TopicRow(topic=topic, flashcards=f, station=s, retention=r,
                             flag=flag_for(f, s)))
    # Flagged rows first, then worst-measured first, then alphabetical so the order is
    # reproducible across runs and across the three renderers.
    rows.sort(key=lambda r: (_FLAG_RANK[r.flag], _worst_banded(r), r.topic))
    return TopicMap(rows=rows, excluded=excluded)
