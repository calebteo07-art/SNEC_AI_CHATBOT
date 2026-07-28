from tools.flashcards.flashcard_sets import FLASHCARD_TOPICS
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
        assert c["kind"] in ("theory", "practical", "situational"), c["stem"]
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


def test_no_topic_key_lives_in_two_pools():
    """`_by_diff` searches pools in order and returns the FIRST match, so a topic
    key present in two pools silently shadows one of the decks. Keep every key
    unique to one pool — this is the invariant `_by_diff` documents."""
    homes: dict[str, list[str]] = {}
    for pool, topics in FLASHCARDS.items():
        for topic_key in topics:
            homes.setdefault(topic_key, []).append(pool)
    shadowed = {k: v for k, v in homes.items() if len(v) > 1}
    assert not shadowed, f"topic key in >1 pool — one deck is unreachable: {shadowed}"


def test_every_authored_card_reaches_some_role():
    """Authored cards a role's serving path never yields are dead content. Catches
    both ways a deck goes dark: shadowed by a same-name deck in an earlier pool,
    or left in a pool whose taxonomy no longer lists the topic."""
    served: set[str] = set()
    for role in ("OA", "PSA", "OT"):
        served |= {c["stem"] for c in get_all_cards(role)}
    orphaned: dict[str, int] = {}
    for pool, topic_key, _difficulty, c in _all_authored():
        if c["stem"] not in served:
            orphaned[f"{pool}/{topic_key}"] = orphaned.get(f"{pool}/{topic_key}", 0) + 1
    assert not orphaned, f"authored cards no student can ever be served: {orphaned}"


def test_every_pool_deck_is_listed_in_its_pool_taxonomy():
    """The reverse view: a deck whose own pool's topic list omits it can never be
    named by topics_for(), which is how the shadowed deck above went unnoticed."""
    unlisted = [
        f"{pool}/{topic_key}"
        for pool, topics in FLASHCARDS.items()
        for topic_key in topics
        if topic_key not in {k for k, _ in FLASHCARD_TOPICS.get(pool, [])}
    ]
    assert not unlisted, f"card decks missing from their pool's taxonomy: {unlisted}"


def test_get_all_cards_tags_topic_and_difficulty():
    cards = get_all_cards("OA")
    c = cards[0]
    assert "topic_tag" in c and "difficulty" in c
    assert "options" in c and "correct" in c
