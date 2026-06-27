from tools.flashcards.static_cards import FLASHCARDS, get_set_cards, get_all_cards


def _all_authored():
    for pool, topics in FLASHCARDS.items():
        for topic_key, by_diff in topics.items():
            for difficulty, cards in by_diff.items():
                for c in cards:
                    yield pool, topic_key, difficulty, c


def test_every_card_is_a_valid_mcq():
    seen_any = False
    for pool, topic_key, difficulty, c in _all_authored():
        seen_any = True
        assert isinstance(c["stem"], str) and c["stem"].strip(), (topic_key, difficulty)
        assert isinstance(c["options"], list) and len(c["options"]) >= 2, c["stem"]
        assert c["qtype"] in ("single", "multi"), c["stem"]
        assert c["kind"] in ("theory", "practical"), c["stem"]
        assert isinstance(c["explanation"], str) and c["explanation"].strip(), c["stem"]
        assert all(0 <= i < len(c["options"]) for i in c["correct"]), c["stem"]
        if c["qtype"] == "single":
            assert len(c["correct"]) == 1, c["stem"]
        else:
            assert len(c["correct"]) >= 2, c["stem"]
        assert isinstance(c.get("reasoning_eligible", False), bool), c["stem"]
    assert seen_any, "no authored cards found"


def test_no_duplicate_stems_within_a_set():
    for pool, topics in FLASHCARDS.items():
        for topic_key, by_diff in topics.items():
            for difficulty, cards in by_diff.items():
                stems = [c["stem"] for c in cards]
                assert len(stems) == len(set(stems)), (topic_key, difficulty)


def test_no_duplicate_stems_across_pool():
    for pool, topics in FLASHCARDS.items():
        all_stems = []
        for topic_key, by_diff in topics.items():
            for cards in by_diff.values():
                all_stems.extend(c["stem"] for c in cards)
        assert len(all_stems) == len(set(all_stems)), f"duplicate stems in pool {pool}"


def test_get_all_cards_tags_topic_and_difficulty():
    cards = get_all_cards("OA")
    c = cards[0]
    assert "topic_tag" in c and "difficulty" in c
    assert "options" in c and "correct" in c
