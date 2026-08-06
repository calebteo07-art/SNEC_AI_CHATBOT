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
