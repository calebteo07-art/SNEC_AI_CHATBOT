"""Guards the flashcard-topic -> case-set-group crosswalk against content drift.

Flashcard topic keys and case set keys are DISJOINT namespaces. `resolve_set`
cannot express "no match" — it falls through to `_DEFAULT`, dumping unmatched
topics into `history_taking` (CLINICAL) or `screening` (OT). So the mapping is
authored by hand, and this file is what stops it rotting: every real key in both
taxonomies is iterated, so adding a flashcard topic or renaming a case set FAILS
CI instead of silently vanishing into a bucket.
"""
from tools.cases.topic_sets import resolve_set, sets_for
from tools.flashcards.flashcard_sets import DIFFICULTIES, FLASHCARD_TOPICS, make_set_key
from tools.supervisor.topic_crosswalk import (
    FLASHCARD_TO_SET,
    KNOWLEDGE_GROUP,
    flashcard_group,
)

# `sets_for` routes through case_pool(), so "OA" -> CLINICAL and "OT" -> OT —
# the same two live pools tests/content/test_coverage.py iterates.
CLINICAL_SET_KEYS = {k for k, _ in sets_for("OA")}
OT_SET_KEYS = {k for k, _ in sets_for("OT")}
ALL_SET_KEYS = CLINICAL_SET_KEYS | OT_SET_KEYS

# Tags that are NOT taxonomy topics but do reach the column: migration 010 declares
# `topic_tag TEXT NOT NULL DEFAULT 'general'` (010_flashcard_attempts.sql:14) and the
# card serialiser falls back to "general" (tools/api/routers/student.py:331,341).
LEGACY_TAGS = {"general"}


def _all_flashcard_topics() -> list[str]:
    """Every topic key across FOUNDATIONS + CLINICAL + OT, in declaration order."""
    return [tk for topics in FLASHCARD_TOPICS.values() for tk, _label in topics]


def test_every_flashcard_topic_has_an_explicit_group():
    """No real topic may rely on flashcard_group's fallback — the fallback exists
    for garbage tags, not for content the taxonomy actually ships."""
    missing = [tk for tk in _all_flashcard_topics() if tk not in FLASHCARD_TO_SET]
    assert not missing, f"flashcard topics missing from FLASHCARD_TO_SET: {missing}"


def test_every_mapped_value_is_a_real_group():
    """A typo'd or renamed target would create a phantom group that no OSCE
    attempt can ever join, so the topic's accuracy would render against nothing."""
    bad = {tk: grp for tk, grp in FLASHCARD_TO_SET.items()
           if grp != KNOWLEDGE_GROUP and grp not in ALL_SET_KEYS}
    assert not bad, f"crosswalk targets that are not real case set keys: {bad}"


def test_no_stale_crosswalk_entries():
    """Catches the other direction: a topic renamed in flashcard_sets.py leaves a
    dead entry here, and the renamed topic silently takes the fallback."""
    known = set(_all_flashcard_topics()) | LEGACY_TAGS
    stale = sorted(set(FLASHCARD_TO_SET) - known)
    assert not stale, f"crosswalk keys that are no longer flashcard topics: {stale}"


def test_foundations_and_knowledge_tags_route_to_the_knowledge_group():
    """FOUNDATIONS is studied by EVERY role (flashcard_sets.py:88-90), so it has no
    single-pool OSCE counterpart. Same for the two knowledge-shaped CLINICAL tags."""
    knowledge = [tk for tk, _ in FLASHCARD_TOPICS["FOUNDATIONS"]] + ["abbreviations", "general"]
    for tk in knowledge:
        assert flashcard_group(tk) == KNOWLEDGE_GROUP, f"{tk} escaped the knowledge group"


def test_foundations_name_collisions_stay_in_the_knowledge_group():
    """`ocular_emergencies` and `perioperative` exist in BOTH namespaces. The
    FOUNDATIONS deck of that name is knowledge recall, and OT students study it
    too — pointing it at the CLINICAL OSCE set would inject OT flashcard accuracy
    into a station those students never sit. Pinned so nobody 'fixes' the collision."""
    assert "ocular_emergencies" in CLINICAL_SET_KEYS
    assert flashcard_group("ocular_emergencies") == KNOWLEDGE_GROUP
    # The CLINICAL *flashcard* topic of the same name as a CLINICAL set does map across.
    assert flashcard_group("perioperative") == "perioperative"


def test_procedural_topics_stay_inside_their_own_pool():
    """A cross-pool mis-bucket is invisible in the totals but silently blends an OT
    cohort's accuracy into a CLINICAL group (or vice versa)."""
    for pool, allowed in (("CLINICAL", CLINICAL_SET_KEYS), ("OT", OT_SET_KEYS)):
        for tk, _label in FLASHCARD_TOPICS[pool]:
            grp = flashcard_group(tk)
            assert grp in allowed or grp == KNOWLEDGE_GROUP, \
                f"{pool} topic {tk!r} -> {grp!r}, which is not a {pool} set key"


def test_clinical_and_ot_set_keys_are_disjoint():
    """Downstream (`TopicGroupRow.pool`) derives a group's discipline from its set
    key alone. That is only sound while the two pools share no key."""
    overlap = CLINICAL_SET_KEYS & OT_SET_KEYS
    assert not overlap, f"set key collides across pools: {overlap}"


def test_flashcard_group_strips_the_difficulty_suffix():
    """Flashcards build "<topic>__<difficulty>" set keys (flashcard_sets.py:93) — a
    third, unrelated meaning of "set key". An unstripped tag misses every entry."""
    for tk in _all_flashcard_topics():
        for difficulty in DIFFICULTIES:
            assert flashcard_group(make_set_key(tk, difficulty)) == flashcard_group(tk)
    assert flashcard_group("iop_nct__easy") == "tonometry_iop"
    assert flashcard_group("iop_nct") == "tonometry_iop"


def test_flashcard_group_tolerates_empty_and_unknown_tags():
    """Unknown tags must land in the knowledge bucket, NEVER in an OSCE-backed
    group — a bad tag cannot be allowed to move a procedural set's accuracy."""
    for tag in ("", "not_a_topic", "totally__bogus"):
        assert flashcard_group(tag) == KNOWLEDGE_GROUP


def test_crosswalk_beats_resolve_set_on_the_real_failure_cases():
    """The defect this module exists for. resolve_set has no rule for these topics
    and its _DEFAULT swallows them into a real OSCE set."""
    assert resolve_set("OA", "anatomy_physiology") == "history_taking"
    assert flashcard_group("anatomy_physiology") == KNOWLEDGE_GROUP
    assert resolve_set("OA", "abbreviations") == "history_taking"
    assert flashcard_group("abbreviations") == KNOWLEDGE_GROUP
    assert resolve_set("OT", "hrt") == "screening"
    assert flashcard_group("hrt") == "oct_imaging"
