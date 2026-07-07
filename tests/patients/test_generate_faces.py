from tools.patients import generate_faces as G


def test_estimate_covers_every_archetype():
    rows = G.build_estimate()
    assert len(rows) == 26
    for aid, prompt in rows:
        assert aid and prompt
        assert "no text" in prompt.lower()


def test_uses_flash_model():
    # ricoe §8 P2: Nano-Banana flash, never pro.
    assert G.MODEL.endswith("flash-image")


def test_generate_refuses_in_mock_mode(monkeypatch):
    monkeypatch.setattr(G, "MOCK_MODE", True)
    import pytest
    with pytest.raises(RuntimeError):
        G.generate_one("chinese_male_young")
