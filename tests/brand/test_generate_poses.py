from tools.brand import generate_poses as G


def test_estimate_covers_every_pose():
    rows = G.build_estimate()
    assert len(rows) == 3
    for pid, prompt in rows:
        assert pid and prompt
        assert "no text" in prompt.lower()


def test_uses_flash_model():
    assert G.MODEL.endswith("flash-image")


def test_generate_refuses_in_mock_mode(monkeypatch):
    import pytest
    monkeypatch.setattr(G, "MOCK_MODE", True)
    with pytest.raises(RuntimeError):
        G.generate_one("wave")
