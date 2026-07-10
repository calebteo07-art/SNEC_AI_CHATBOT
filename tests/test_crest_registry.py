from tools.leaderboard.crest_art import CRESTS, prompt


def test_all_five_tiers_and_crown_present():
    assert set(CRESTS) == {"bronze", "silver", "gold", "platinum", "diamond", "crown"}


def test_prompts_are_nonempty_and_chroma_keyed():
    for cid, crest in CRESTS.items():
        p = prompt(crest)
        assert isinstance(p, str) and len(p) > 40, cid
        assert "#00B140" in p, cid
        assert crest["desc"].split()[0] in p or crest["name"].split()[0].lower() in p.lower(), cid
