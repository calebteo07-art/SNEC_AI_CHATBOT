from tools.flashcards.static_cards import get_set_cards


TEMPLATE = [("OA", "triage"), ("OT", "oct_macula")]


def test_template_topics_are_deep():
    for role, topic in TEMPLATE:
        for difficulty in ("easy", "medium", "hard"):
            cards = get_set_cards(role, topic, difficulty)
            assert len(cards) >= 10, (role, topic, difficulty, len(cards))


def test_template_topics_have_eligible_reasoning_cards():
    for role, topic in TEMPLATE:
        for difficulty in ("easy", "medium", "hard"):
            cards = get_set_cards(role, topic, difficulty)
            assert any(c["reasoning_eligible"] for c in cards), (role, topic, difficulty)


def test_template_topics_have_a_multi_select():
    # at least one multi-select somewhere in each template topic
    for role, topic in TEMPLATE:
        all_cards = []
        for difficulty in ("easy", "medium", "hard"):
            all_cards += get_set_cards(role, topic, difficulty)
        assert any(c["qtype"] == "multi" for c in all_cards), (role, topic)
