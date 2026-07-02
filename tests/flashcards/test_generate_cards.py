import os
os.environ.setdefault("MOCK_MODE", "1")

from tools.flashcards.generate_cards import validate_cards, CARD_KEYS


def test_validate_cards_accepts_a_wellformed_situational_card():
    good = [{"stem": "A diabetic patient's fundus photos are blurred by cataract. What do you do?",
             "options": ["Proceed and note media opacity limits grading",
                         "Cancel all imaging", "Dilate a second time", "Increase flash to maximum"],
             "correct": [0], "qtype": "single", "kind": "situational",
             "explanation": "Media opacity degrades DR grading; capture what you can and document the limitation.",
             "reasoning_eligible": True}]
    assert validate_cards(good) == [{k: good[0][k] for k in CARD_KEYS}]


def test_validate_cards_rejects_ungrounded_or_malformed():
    bad = [{"stem": "", "options": ["a"], "correct": [5], "qtype": "single",
            "kind": "theory", "explanation": "", "reasoning_eligible": False}]
    assert validate_cards(bad) == []
