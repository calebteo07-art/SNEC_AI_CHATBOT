"""Guards the *silly* -> flashcards coverage mandate: every knowledge domain and
every procedural topic has a flashcard topic with cards in all tiers, for every
role. See reference_silly_kb + project_role_content_model.
"""
import pytest

from tools.flashcards.flashcard_sets import FLASHCARD_TOPICS, DIFFICULTIES, topics_for
from tools.flashcards.static_cards import FLASHCARDS, topic_card_counts

# The knowledge domains from silly that MUST each be a shared Foundations topic.
REQUIRED_FOUNDATION_KEYS = {
    "anatomy_physiology", "microbiology_infection", "pharmacology",
    "ocular_emergencies", "professional_ethics",
    "disorders_eyelid_lacrimal_orbit", "disorders_cornea_conjunctiva",
    "disorders_uvea_retina", "glaucoma", "neuro_strabismus", "systemic_disease",
}
MIN_CARDS_PER_TOPIC = 12  # ~4 per tier


def test_all_foundation_domains_are_topics():
    keys = {k for k, _ in FLASHCARD_TOPICS["FOUNDATIONS"]}
    missing = REQUIRED_FOUNDATION_KEYS - keys
    assert not missing, f"knowledge domains missing from taxonomy: {missing}"


def test_every_topic_has_cards_in_all_tiers_for_every_role():
    for role in ("OA", "PSA", "OT"):
        counts = topic_card_counts(role)
        for topic_key, _ in topics_for(role):
            for pool in FLASHCARDS:
                by_diff = FLASHCARDS[pool].get(topic_key)
                if by_diff:
                    for tier in DIFFICULTIES:
                        assert by_diff.get(tier), f"{role}/{topic_key} empty tier {tier}"
                    break
            else:
                raise AssertionError(f"{role}/{topic_key} has NO cards in any pool")
            assert counts.get(topic_key, 0) >= MIN_CARDS_PER_TOPIC, (
                f"{role}/{topic_key} under {MIN_CARDS_PER_TOPIC} cards")


def _placeholder_topics() -> set[str]:
    out = set()
    for _pool, topics in FLASHCARDS.items():
        for tk, by_diff in topics.items():
            if any(c.get("placeholder") for cards in by_diff.values() for c in cards):
                out.add(tk)
    return out


@pytest.mark.xfail(reason="Foundations/OT gap cards are placeholders until the gated live generation")
def test_no_placeholder_cards_remain():
    remaining = _placeholder_topics()
    assert remaining == set(), f"still placeholder: {sorted(remaining)}"
