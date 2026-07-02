import os
os.environ.setdefault("MOCK_MODE", "1")

from tools.flashcards.generate_cards import build_prompt, validate_cards

SOURCE = "Timolol is a beta-blocker that lowers IOP by reducing aqueous production."


def test_build_prompt_includes_source_and_schema_rules():
    p = build_prompt("pharmacology", "Ocular Pharmacology", SOURCE, "easy", 6)
    assert "Ocular Pharmacology" in p and SOURCE in p
    assert "grounded" in p.lower() and "6" in p


def test_validate_cards_rejects_ungrounded_or_malformed():
    good = [{"stem": "How does timolol lower IOP?",
             "options": ["Reduces aqueous production", "Dilates pupil",
                         "Numbs cornea", "Stains epithelium"],
             "correct": [0], "qtype": "single", "kind": "theory",
             "explanation": "Timolol is a beta-blocker reducing aqueous production.",
             "reasoning_eligible": False}]
    assert validate_cards(good) == good
    bad = [{"stem": "", "options": ["a"], "correct": [5], "qtype": "single",
            "kind": "theory", "explanation": "", "reasoning_eligible": False}]
    assert validate_cards(bad) == []


def test_placeholder_cards_are_valid_and_flagged():
    from tools.flashcards.generate_cards import placeholder_cards, validate_cards, CARD_KEYS
    pc = placeholder_cards("pharmacology", "Ocular Pharmacology", per_tier=4)
    assert set(pc) == {"easy", "medium", "hard"}
    for tier, cards in pc.items():
        assert len(cards) == 4
        # each placeholder is a structurally valid MCQ
        assert validate_cards(cards) == [{k: c[k] for k in CARD_KEYS} for c in cards]
        assert all(c["placeholder"] for c in cards)
    # stems unique across the whole topic (no-duplicate-stem guard)
    stems = [c["stem"] for cards in pc.values() for c in cards]
    assert len(stems) == len(set(stems))
