from tools.flashcards.flashcard_sets import (
    FLASHCARD_TOPICS, pools_for, topics_for, pool_for_role,
)

FOUNDATION_KEYS = {
    "anatomy_physiology", "microbiology_infection", "pharmacology",
    "ocular_emergencies", "professional_ethics",
    "disorders_eyelid_lacrimal_orbit", "disorders_cornea_conjunctiva",
    "disorders_lens_cataract",
    "disorders_uvea_retina", "glaucoma", "neuro_strabismus", "systemic_disease",
}


def test_foundations_pool_exists_with_12_topics():
    keys = {k for k, _ in FLASHCARD_TOPICS["FOUNDATIONS"]}
    assert keys == FOUNDATION_KEYS


def test_pools_for_returns_foundations_first():
    assert pools_for("OA") == ["FOUNDATIONS", "CLINICAL"]
    assert pools_for("PSA") == ["FOUNDATIONS", "CLINICAL"]
    assert pools_for("OT") == ["FOUNDATIONS", "OT"]


def test_every_role_sees_foundations_plus_its_procedures():
    for role in ("OA", "PSA", "OT"):
        keys = {k for k, _ in topics_for(role)}
        assert FOUNDATION_KEYS <= keys
        pool_keys = {k for k, _ in FLASHCARD_TOPICS[pool_for_role(role)]}
        assert pool_keys <= keys


def test_ocular_emergencies_moved_out_of_clinical():
    assert "ocular_emergencies" not in {k for k, _ in FLASHCARD_TOPICS["CLINICAL"]}
    assert "ocular_emergencies" in FOUNDATION_KEYS


def test_get_topic_cards_resolves_foundations_topic():
    # Requires at least one authored/placeholder card under FOUNDATIONS/pharmacology.
    from tools.flashcards.static_cards import FLASHCARDS, get_topic_cards, topic_card_counts
    if "pharmacology" not in FLASHCARDS.get("FOUNDATIONS", {}):
        import pytest
        pytest.skip("Foundations cards not seeded yet")
    assert len(get_topic_cards("OT", "pharmacology")) > 0
    assert topic_card_counts("OT").get("pharmacology", 0) > 0
