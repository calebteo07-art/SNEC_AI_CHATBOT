"""The three daily quests. Pure — generated from (student_id, date, weak_topics, role).

Nothing about a quest is stored, so the rules below ARE the feature:
  · Deterministic per student per day. Two uvicorn workers must agree, so the seed is
    sha256 and never Python's hash() (which is salted per process by PYTHONHASHSEED).
  · Exactly one of each kind, so a student never gets three flashcard quests.
  · Progress is computed from the activity tally, never separately advanced — which is
    what makes it impossible for a quest bar to disagree with what the student did.
  · The adaptive quest never leaves the ROLE'S OWN flashcard pools. `weak_topics` is
    derived from retention_scores, which mixes two namespaces: the closed flashcard one,
    and raw OSCE case topics written server-side by cases.py. An entry from outside the
    role's pools is both off-syllabus AND unwinnable — see the scope tests below.

⚠ THE OLD FIXTURE WAS THE BUG. These tests used to run on WEAK = ["gonioscopy",
"visual fields"], and neither string is a flashcard topic key at all — so the suite
asserted the adaptive quest targets "a weak topic" while proving nothing about whether
that topic was one the student could ever study. Every fixture here is now a real key
from flashcard_sets.FLASHCARD_TOPICS, or a deliberate impostor.
"""
from datetime import date

from tools.gamification.quests import QUEST_KINDS, daily_quests, quest_progress

TODAY = date(2026, 8, 4)

# Real keys. `glaucoma` is FOUNDATIONS (every role studies it); `distance_va` is CLINICAL
# (OA/PSA); `oct_macula` and `hvf` are OT-only.
WEAK = ["glaucoma", "distance_va"]
OT_ONLY = ["oct_macula", "hvf"]
# What actually shipped to an OA on 2026-08-06: a raw OSCE case topic, written into
# retention_scores by cases.py, rendered as "Clear 2 decks in Cirrus_Oct_Macular_Scan".
CASE_TOPIC = "Cirrus_Oct_Macular_Scan"


def test_the_set_is_deterministic_for_one_student_and_day():
    a = daily_quests("ann", TODAY, WEAK, "OA")
    b = daily_quests("ann", TODAY, WEAK, "OA")
    assert [q.title for q in a] == [q.title for q in b]


def test_different_days_give_different_sets():
    a = daily_quests("ann", TODAY, WEAK, "OA")
    b = daily_quests("ann", date(2026, 8, 5), WEAK, "OA")
    assert [q.title for q in a] != [q.title for q in b]


def test_different_students_can_differ_on_the_same_day():
    # Not a guarantee for any single pair, so assert across a spread: if every student got
    # the identical set the seed is not mixing the student id in at all.
    sets = {tuple(q.title for q in daily_quests(f"s{i}", TODAY, WEAK, "OA")) for i in range(40)}
    assert len(sets) > 1


def test_exactly_one_quest_of_each_kind():
    quests = daily_quests("ann", TODAY, WEAK, "OA")
    assert sorted(q.kind for q in quests) == sorted(QUEST_KINDS)


def _adaptive(*args):
    return next(q for q in daily_quests(*args) if q.kind == "adaptive")


def test_the_adaptive_quest_targets_a_weak_topic():
    adaptive = _adaptive("ann", TODAY, WEAK, "OA")
    assert adaptive.metric.startswith("topic:")
    assert adaptive.metric.removeprefix("topic:") in WEAK


def test_the_adaptive_quest_falls_back_when_there_are_no_weak_topics():
    # A brand-new student has no retention scores yet. The set must still be three quests.
    quests = daily_quests("new", TODAY, [], "OA")
    assert len(quests) == len(QUEST_KINDS)
    adaptive = next(q for q in quests if q.kind == "adaptive")
    assert adaptive.metric == "flashcards"


# ── role scope ────────────────────────────────────────────────────────────────────────
# The reported defect, and the two independent reasons it is a defect: an OA/PSA is not
# trained on Cirrus OCT, AND the quest could never have been completed — the daily tally's
# `topics` map is keyed by the same string update_profile wrote the retention entry under,
# and only a flashcard deck ever writes one. An OSCE-sourced topic reads 0/N forever.

def test_an_oa_is_never_given_an_ot_topic():
    # A spread, not one student: a single draw passing is luck, and this is the assertion
    # the whole change exists for.
    for i in range(60):
        adaptive = _adaptive(f"s{i}", TODAY, OT_ONLY, "OA")
        assert adaptive.metric == "flashcards", f"s{i} got {adaptive.metric}"


def test_psa_shares_the_oa_pool():
    # OA and PSA study the same course (flashcard_sets.pool_for_role), so PSA must behave
    # identically — not merely "also not OT".
    for i in range(20):
        assert _adaptive(f"s{i}", TODAY, OT_ONLY, "PSA").metric == "flashcards"
        assert _adaptive(f"s{i}", TODAY, WEAK, "PSA").metric.startswith("topic:")


def test_an_ot_does_get_an_ot_topic():
    # The filter must not simply reject everything procedural — that would trade a wrong
    # quest for a permanently generic one.
    metrics = {_adaptive(f"s{i}", TODAY, OT_ONLY, "OT").metric for i in range(40)}
    assert metrics <= {f"topic:{t}" for t in OT_ONLY}
    assert metrics, "an OT with OT weak topics must still get an adaptive topic quest"


def test_a_raw_case_topic_is_never_targeted():
    for i in range(40):
        adaptive = _adaptive(f"s{i}", TODAY, [CASE_TOPIC], "OT")
        assert adaptive.metric == "flashcards", f"s{i} got {adaptive.metric}"


def test_a_case_topic_does_not_crowd_out_the_real_one():
    # Mixed list: the in-scope topic must be reachable, never skipped because an impostor
    # sat at the index the seed picked.
    metrics = {_adaptive(f"s{i}", TODAY, [CASE_TOPIC, "glaucoma"], "OA").metric for i in range(40)}
    assert metrics == {"topic:glaucoma"}


def test_the_metric_is_the_stored_key_verbatim_so_the_tally_can_tick():
    # retention_scores and the daily tally are written from the SAME `topic` argument in the
    # same update_profile call, so the stored key IS the tally key. Normalising the metric
    # would silently break that identity and hand back an unwinnable quest — the exact
    # failure this whole change is fixing.
    adaptive = _adaptive("ann", TODAY, ["glaucoma__hard"], "OA")
    assert adaptive.metric == "topic:glaucoma__hard"
    activity = {"flashcards": 0, "osce": 0, "tutor": 0, "topics": {"glaucoma__hard": 3}, "xp": 0}
    assert quest_progress(adaptive, activity) == 3


def test_the_title_reads_as_a_label_and_never_as_a_slug():
    assert "Distance Visual Acuity" in _adaptive("ann", TODAY, ["distance_va"], "OA").title
    assert "Macular OCT" in _adaptive("ann", TODAY, ["oct_macula"], "OT").title
    # the difficulty suffix is display noise, not part of the topic's name
    assert "__" not in _adaptive("ann", TODAY, ["glaucoma__hard"], "OA").title


def test_an_unknown_role_gets_the_shared_clinical_pool():
    # pool_for_role treats anything that is not OT as CLINICAL, and every caller in the app
    # already relies on that. A missing role must degrade the same way rather than emptying
    # the pool and permanently disabling the adaptive quest.
    assert _adaptive("ann", TODAY, WEAK, "").metric.startswith("topic:")


# ── progress ──────────────────────────────────────────────────────────────────────────

def test_every_quest_has_a_positive_target_and_reward():
    for q in daily_quests("ann", TODAY, WEAK, "OA"):
        assert q.target > 0
        assert q.reward_xp > 0


def test_progress_reads_a_plain_source_metric():
    quests = daily_quests("ann", TODAY, WEAK, "OA")
    breadth = next(q for q in quests if q.kind == "breadth")
    activity = {"flashcards": 2, "osce": 1, "tutor": 0, "topics": {}, "xp": 0}
    assert quest_progress(breadth, activity) == activity[breadth.metric]


def test_progress_reads_a_topic_metric():
    adaptive = _adaptive("ann", TODAY, WEAK, "OA")
    topic = adaptive.metric.removeprefix("topic:")
    activity = {"flashcards": 5, "osce": 0, "tutor": 0, "topics": {topic: 5}, "xp": 0}
    assert quest_progress(adaptive, activity) == 5


def test_progress_reads_the_xp_metric_from_the_activity_dict():
    # xp is NOT stored in daily_state — it already lives in xp_today. The caller merges it
    # into the activity dict, and this pins that contract.
    quests = daily_quests("ann", TODAY, WEAK, "OA")
    stretch = next(q for q in quests if q.kind == "stretch")
    assert stretch.metric == "xp"
    assert quest_progress(stretch, {"flashcards": 0, "osce": 0, "tutor": 0, "topics": {}, "xp": 75}) == 75


def test_progress_is_zero_for_an_untouched_metric():
    quests = daily_quests("ann", TODAY, WEAK, "OA")
    for q in quests:
        assert quest_progress(q, {"flashcards": 0, "osce": 0, "tutor": 0, "topics": {}, "xp": 0}) == 0
