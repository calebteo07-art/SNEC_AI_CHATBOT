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
    KNOWLEDGE_PREFIX,
    POOL_OVERRIDES,
    flashcard_group,
    is_known_tag,
    is_knowledge_group,
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

# Read at the call site of test_every_flashcard_topic_has_an_explicit_group's
# failure message — kept as one string so the module docstring's guidance and
# the CI failure message can't drift apart.
HOW_TO_MAP_A_NEW_TOPIC = (
    "resolve it against the live case library, not its name: if a set_key's "
    "OSCE cases actually cover it, map to that set_key; if it spans multiple "
    "pools or no station examines it, map it to its own knowledge_<topic> group."
)


def _all_flashcard_topics() -> list[str]:
    """Every topic key across FOUNDATIONS + CLINICAL + OT, in declaration order."""
    return [tk for topics in FLASHCARD_TOPICS.values() for tk, _label in topics]


def test_every_flashcard_topic_has_an_explicit_group():
    """No real topic may rely on flashcard_group's fallback — the fallback exists
    for garbage tags, not for content the taxonomy actually ships."""
    missing = [tk for tk in _all_flashcard_topics() if tk not in FLASHCARD_TO_SET]
    assert not missing, (
        f"flashcard topics missing from FLASHCARD_TO_SET: {missing}. "
        f"To fix: {HOW_TO_MAP_A_NEW_TOPIC}"
    )


def test_every_mapped_value_is_a_real_group():
    """A typo'd or renamed target would create a phantom group that no OSCE
    attempt can ever join, so the topic's accuracy would render against
    nothing. Knowledge-prefixed groups are exempt by design — they have no
    OSCE counterpart on purpose — but that exemption is only safe while no
    real set key can look like one, which
    test_no_real_set_key_uses_the_knowledge_prefix guards separately."""
    bad = {tk: grp for tk, grp in FLASHCARD_TO_SET.items()
           if not is_knowledge_group(grp) and grp not in ALL_SET_KEYS}
    assert not bad, f"crosswalk targets that are not real case set keys: {bad}"


def test_no_stale_crosswalk_entries():
    """Catches the other direction: a topic renamed in flashcard_sets.py leaves a
    dead entry here, and the renamed topic silently takes the fallback."""
    known = set(_all_flashcard_topics()) | LEGACY_TAGS
    stale = sorted(set(FLASHCARD_TO_SET) - known)
    assert not stale, f"crosswalk keys that are no longer flashcard topics: {stale}"


def test_foundations_topics_map_to_their_own_distinct_knowledge_group():
    """The property the per-topic knowledge split exists for: these 12 domains
    are 600 cards (26.7% of the 2250-card bank) alone, 650 (28.9%) counting
    `abbreviations`, which stays in the shared bucket below. Collapsed into
    one row, a genuine pharmacology weakness averages out against anatomy,
    ethics, systemic disease, etc. and can never surface in a ranking. Each
    FOUNDATIONS topic is instead identity-mapped to its own "knowledge_<topic>"
    group — asserting they are pairwise DISTINCT (not just knowledge_-prefixed)
    is the actual new guarantee here."""
    foundations = [tk for tk, _label in FLASHCARD_TOPICS["FOUNDATIONS"]]
    groups = {tk: flashcard_group(tk) for tk in foundations}
    assert len(set(groups.values())) == len(foundations), f"collision: {groups}"
    for tk, grp in groups.items():
        assert grp == f"{KNOWLEDGE_PREFIX}{tk}", \
            f"{tk} -> {grp!r}, expected {KNOWLEDGE_PREFIX}{tk}"


def test_non_taxonomy_tags_share_the_general_knowledge_group():
    """`abbreviations` (cross-cutting CLINICAL notation) and `general` (the DB
    column's legacy default) are not FOUNDATIONS domains and carry no
    standalone content of their own — unlike FOUNDATIONS topics, they still
    collapse into the single catch-all bucket."""
    for tk in ("abbreviations", "general"):
        assert flashcard_group(tk) == KNOWLEDGE_GROUP, f"{tk} escaped the shared knowledge group"


def test_ocular_emergencies_is_pool_dependent():
    """`ocular_emergencies` is the only one of the 21 case set keys with no
    flashcard topic mapped to it by default — and the largest CLINICAL set in
    the live case library (13 cases: chemical/alkali injury, penetrating
    injury, corneal foreign body, hyphaema, acute angle-closure glaucoma,
    CRAO, flash-burn, and red-flag/pain-assessment triage variants), the
    platform's highest-stakes clinical topic. Its FOUNDATIONS deck is studied
    by every role, but only OA/PSA sit a station for it — OT has none. So the
    same tag must resolve differently depending on which pool is asking.

    (This replaces an earlier version of this test whose docstring claimed
    resolving to the CLINICAL set key here would "inject OT accuracy into a
    station OT never sits". That was false: Task 8's flashcard_by_group(rows,
    student_pools, *, pool=...) filters attempt rows by the STUDENT's pool
    BEFORE this function is ever called, so an OT row cannot reach a CLINICAL
    view regardless of what flashcard_group returns. The pool argument here
    narrows the OUTPUT group; the caller already narrowed the INPUT rows.)"""
    assert "ocular_emergencies" in CLINICAL_SET_KEYS
    assert "ocular_emergencies" not in OT_SET_KEYS
    assert flashcard_group("ocular_emergencies", pool="CLINICAL") == "ocular_emergencies"
    assert flashcard_group("ocular_emergencies", pool="OT") == "knowledge_ocular_emergencies"
    assert flashcard_group("ocular_emergencies") == "knowledge_ocular_emergencies"
    # The CLINICAL *flashcard* topic of the same name as a CLINICAL set maps
    # across regardless of pool — no collision to resolve, so no override needed.
    assert flashcard_group("perioperative") == "perioperative"
    assert flashcard_group("perioperative", pool="CLINICAL") == "perioperative"


def test_pool_overrides_never_target_the_other_pools_set_keys():
    """A pool override exists so a shared FOUNDATIONS deck can route to a
    single-pool station. If an override's target were a set key from the
    OPPOSITE pool, flashcard_group(tag, pool=that_pool) would blend one
    pool's flashcard accuracy into the other pool's OSCE group."""
    assert POOL_OVERRIDES, "no overrides defined — is this test stale?"
    for (pool, tag), target in POOL_OVERRIDES.items():
        assert pool in ("CLINICAL", "OT"), f"unknown pool {pool!r} in override key ({pool}, {tag})"
        allowed = CLINICAL_SET_KEYS if pool == "CLINICAL" else OT_SET_KEYS
        other = OT_SET_KEYS if pool == "CLINICAL" else CLINICAL_SET_KEYS
        assert target in allowed, f"({pool}, {tag!r}) override targets a non-{pool} key: {target!r}"
        assert target not in other, f"({pool}, {tag!r}) override targets the other pool's key: {target!r}"


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


def test_no_real_set_key_uses_the_knowledge_prefix():
    """test_every_mapped_value_is_a_real_group exempts anything knowledge_-
    prefixed from having to be a real set key. That exemption is only sound
    while no real set key happens to start with the same prefix — otherwise a
    future case set named knowledge_* would silently merge the two namespaces."""
    collisions = {k for k in ALL_SET_KEYS if k.startswith(KNOWLEDGE_PREFIX)}
    assert not collisions, f"real set key(s) collide with the knowledge namespace: {collisions}"


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
    group — a bad tag cannot be allowed to move a procedural set's accuracy.
    Also true with a pool in scope: an unrecognised tag has no entry in
    POOL_OVERRIDES either, so it cannot borrow another topic's override."""
    for tag in ("", "not_a_topic", "totally__bogus"):
        assert flashcard_group(tag) == KNOWLEDGE_GROUP
        assert flashcard_group(tag, pool="CLINICAL") == KNOWLEDGE_GROUP
        assert flashcard_group(tag, pool="OT") == KNOWLEDGE_GROUP


def test_crosswalk_beats_resolve_set_on_the_real_failure_cases():
    """The defect this module exists for. resolve_set has no rule for these topics
    and its _DEFAULT swallows them into a real OSCE set."""
    assert resolve_set("OA", "anatomy_physiology") == "history_taking"
    assert flashcard_group("anatomy_physiology") == "knowledge_anatomy_physiology"
    assert resolve_set("OA", "abbreviations") == "history_taking"
    assert flashcard_group("abbreviations") == KNOWLEDGE_GROUP
    assert resolve_set("OT", "hrt") == "screening"
    assert flashcard_group("hrt") == "oct_imaging"


def test_is_known_tag_true_for_every_real_topic_and_legacy_tag():
    """The predicate Task 8 uses to count fallback hits must recognise every
    real topic (and the legacy DB default) as known — otherwise the counter
    would over-report drift that isn't actually happening."""
    for tk in _all_flashcard_topics():
        assert is_known_tag(tk), f"{tk} should be a known tag"
        for difficulty in DIFFICULTIES:
            assert is_known_tag(make_set_key(tk, difficulty)), \
                f"{make_set_key(tk, difficulty)} should be a known tag"
    assert is_known_tag("general")


def test_is_known_tag_false_for_drifted_or_garbage_tags():
    """The other half of the contract: anything that is NOT an explicit key must
    read as unknown, or a stale frontend build / renamed topic would silently
    stop being counted as drift."""
    for tag in ("", "not_a_topic", "set_key", "totally__bogus"):
        assert not is_known_tag(tag), f"{tag!r} should not be a known tag"
