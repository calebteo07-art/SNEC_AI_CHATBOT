import pytest
import tools.shared.gemini_client as cc


# --- _to_gemini_history ---

def test_to_gemini_history_converts_assistant_to_model():
    messages = [
        {"role": "user", "content": "Hello"},
        {"role": "assistant", "content": "Hi there"},
        {"role": "user", "content": "Question?"},
    ]
    history, last = cc._to_gemini_history(messages)
    assert last == "Question?"
    assert history[0] == {"role": "user", "parts": ["Hello"]}
    assert history[1] == {"role": "model", "parts": ["Hi there"]}


def test_to_gemini_history_single_message():
    messages = [{"role": "user", "content": "Hello"}]
    history, last = cc._to_gemini_history(messages)
    assert history == []
    assert last == "Hello"


def test_to_gemini_history_empty():
    history, last = cc._to_gemini_history([])
    assert history == []
    assert last == ""


# --- ask() mock mode ---

def test_ask_mock_returns_chatbot_response(monkeypatch):
    monkeypatch.setattr(cc, "MOCK_MODE", True)
    result = cc.ask(
        system_prompt="You are an ophthalmology tutor.",
        messages=[{"role": "user", "content": "Explain glaucoma."}],
        feature="chatbot",
    )
    assert isinstance(result, str)
    assert len(result) > 10


def test_ask_mock_returns_flashcard_response(monkeypatch):
    monkeypatch.setattr(cc, "MOCK_MODE", True)
    result = cc.ask(
        system_prompt="Generate flashcards.",
        messages=[{"role": "user", "content": "Glaucoma cards."}],
        feature="flashcard",
    )
    assert isinstance(result, str)
    assert "front" in result  # mock flashcard JSON contains "front"


# --- ask_with_image() mock mode ---

def test_ask_with_image_mock_returns_image_response(monkeypatch, tmp_path):
    monkeypatch.setattr(cc, "MOCK_MODE", True)
    # Create a tiny valid PNG so the path exists (not read in mock mode)
    fake_img = tmp_path / "test.png"
    fake_img.write_bytes(b"")
    result = cc.ask_with_image(
        system_prompt="You are an ophthalmology examiner.",
        messages=[{"role": "user", "content": "Describe this image."}],
        image_path=fake_img,
        feature="image",
    )
    assert isinstance(result, str)
    assert len(result) > 10


# --- live mode (skipped without real key) ---

def test_ask_live_mode_returns_string():
    if cc.MOCK_MODE:
        pytest.skip("GEMINI_API_KEY not set — skipping live test")
    result = cc.ask(
        system_prompt="You are a helpful assistant. Answer in one sentence.",
        messages=[{"role": "user", "content": "What is glaucoma?"}],
        feature="default",
    )
    assert isinstance(result, str)
    assert len(result) > 10
