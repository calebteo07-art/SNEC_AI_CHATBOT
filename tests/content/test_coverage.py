"""Guards the *silly* -> flashcards coverage mandate: every knowledge/procedure
domain is a topic; every topic that has cards carries a theory/practical/
situational mix; the whole bank is authored to 50 cards/topic. See
reference_silly_kb + project_role_content_model.
"""
import pytest

from tools.flashcards.flashcard_sets import FLASHCARD_TOPICS, topics_for
from tools.flashcards.static_cards import FLASHCARDS

REQUIRED_FOUNDATION_KEYS = {
    "anatomy_physiology", "microbiology_infection", "pharmacology",
    "ocular_emergencies", "professional_ethics",
    "disorders_eyelid_lacrimal_orbit", "disorders_cornea_conjunctiva",
    "disorders_lens_cataract",
    "disorders_uvea_retina", "glaucoma", "neuro_strabismus", "systemic_disease",
}
KINDS = ("theory", "practical", "situational")
TARGET_CARDS_PER_TOPIC = 50
MIN_PER_KIND = 10


def _topic_cards(topic_key: str) -> list[dict]:
    """All cards for a topic across tiers, from whichever pool holds it."""
    for _pool, topics in FLASHCARDS.items():
        by_diff = topics.get(topic_key)
        if by_diff:
            return [c for cards in by_diff.values() for c in cards]
    return []


def _all_taxonomy_topics() -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for role in ("OA", "PSA", "OT"):
        for tk, _ in topics_for(role):
            if tk not in seen:
                seen.add(tk)
                out.append(tk)
    return out


def test_all_foundation_domains_are_topics():
    keys = {k for k, _ in FLASHCARD_TOPICS["FOUNDATIONS"]}
    missing = REQUIRED_FOUNDATION_KEYS - keys
    assert not missing, f"knowledge domains missing from taxonomy: {missing}"


def test_completed_topics_have_full_mix():
    """Always-green: a topic that reached the 50-card target must carry the full
    kind mix (>= MIN_PER_KIND of each). Topics still being authored (<50) are
    exempt so intermediate commits stay green."""
    for tk in _all_taxonomy_topics():
        cards = _topic_cards(tk)
        if len(cards) < TARGET_CARDS_PER_TOPIC:
            continue
        counts = {k: sum(1 for c in cards if c["kind"] == k) for k in KINDS}
        for k in KINDS:
            assert counts[k] >= MIN_PER_KIND, f"{tk}: kind '{k}'={counts[k]} (<{MIN_PER_KIND})"


@pytest.mark.xfail(reason="cards authored to 50/topic incrementally; flips to XPASS when the bank is complete, then remove this marker (Phase C)")
def test_every_topic_has_50_cards_full_mix():
    problems: list[str] = []
    for tk in _all_taxonomy_topics():
        cards = _topic_cards(tk)
        if len(cards) < TARGET_CARDS_PER_TOPIC:
            problems.append(f"{tk}: {len(cards)}/{TARGET_CARDS_PER_TOPIC} cards")
            continue
        counts = {k: sum(1 for c in cards if c["kind"] == k) for k in KINDS}
        for k in KINDS:
            if counts[k] < MIN_PER_KIND:
                problems.append(f"{tk}: kind '{k}'={counts[k]} (<{MIN_PER_KIND})")
    assert not problems, "incomplete topics:\n  " + "\n  ".join(problems)


def test_every_case_set_has_at_least_one_case_per_pool():
    """OSCE mandate: every clinical/OT topic-set has at least one case visible to
    its pool (OA covers CLINICAL — same as PSA; OT covers OT)."""
    import json
    from pathlib import Path
    from tools.cases.topic_sets import sets_for, resolve_set, case_visible

    cases_dir = Path(__file__).resolve().parent.parent.parent / "cases"
    loaded = [json.loads(p.read_text(encoding="utf-8")) for p in cases_dir.glob("case_*.json")]
    for role in ("OA", "OT"):
        visible = [c for c in loaded if case_visible(role, c.get("role", "any"))]
        buckets = {resolve_set(role, c.get("topic", "")) for c in visible}
        for set_key, _label in sets_for(role):
            assert set_key in buckets, f"{role} pool set '{set_key}' has no case"
