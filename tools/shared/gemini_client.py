#!/usr/bin/env python3
"""Shared AI client — all Gemini API calls in the SNEC platform go through here.

Automatically runs in MOCK_MODE when GEMINI_API_KEY is not set, returning
structured fake responses so all features can be built and tested without an API key.
Switch to live mode by adding GEMINI_API_KEY to .env.

Usage (from other tools):
    from tools.shared.gemini_client import ask, ask_with_image

Self-test:
    python tools/shared/gemini_client.py
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(PROJECT_ROOT / ".env")

MODEL       = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
MODEL_SMALL = os.getenv("GEMINI_MODEL_SMALL", "gemini-2.5-flash-lite")  # lightweight model for flashcards, hints
API_KEY     = os.getenv("GEMINI_API_KEY", "").strip()
MOCK_MODE   = not API_KEY

_client = None

if not MOCK_MODE:
    from google import genai as _genai
    _client = _genai.Client(api_key=API_KEY, http_options={"timeout": 30})

_MOCK_RESPONSES: dict[str, str] = {
    "chatbot": (
        "**Explanation:** Glaucoma is a group of eye conditions that damage the optic nerve, "
        "often caused by elevated intraocular pressure.\n\n"
        "**Mechanism:** Increased IOP compresses retinal ganglion cell axons at the lamina cribrosa, "
        "leading to progressive axonal death and visual field loss.\n\n"
        "**Clinical Pearl:** Normal-tension glaucoma occurs despite IOP within the normal range (10-21 mmHg), "
        "suggesting vascular and other factors also play a role.\n\n"
        "**Check Your Understanding:** What is the first-line treatment for open-angle glaucoma?"
    ),
    "flashcard": (
        '[{"front": "What is the most common type of glaucoma?", '
        '"back": "Primary open-angle glaucoma (POAG)", "topic_tag": "glaucoma"}, '
        '{"front": "Normal IOP range", "back": "10-21 mmHg", "topic_tag": "glaucoma"}, '
        '{"front": "First-line treatment for POAG", '
        '"back": "Prostaglandin analogue eye drops (e.g. latanoprost)", "topic_tag": "glaucoma"}]'
    ),
    "case": (
        "HISTORY: 65-year-old male presenting with gradual peripheral vision loss over 2 years. "
        "No pain. Family history of glaucoma.\n\n"
        "SCORE: History 8/10, Investigations 7/10, Diagnosis 9/10, Management 8/10\n\n"
        "FEEDBACK: Good systematic approach. Consider asking about medication history earlier. "
        "Correct diagnosis of POAG. Management plan appropriate — include follow-up interval."
    ),
    "image": (
        "FINDINGS: Optic disc shows increased cup-to-disc ratio (0.7). "
        "Superior and inferior notching of the neuroretinal rim. "
        "Peripapillary atrophy present. No obvious haemorrhages identified.\n\n"
        "DIAGNOSIS: Appearances consistent with glaucomatous optic neuropathy. "
        "Recommend visual field testing and OCT RNFL analysis."
    ),
    "case_eval": '{"score": 7, "feedback": "Good systematic approach. Asked key history questions. Consider exploring medication history and family risk factors more thoroughly."}',
    "guardrail_input": "yes",
    "default": "[MOCK] This is a mock response. Add GEMINI_API_KEY to .env to use the real Gemini API.",
    "checkin": (
        "What is the most common cause of painless, gradual visual field loss in a 65-year-old?"
    ),
    "debrief": (
        "**What you got right:** Correctly identified the presenting symptom as insidious peripheral vision loss. "
        "Good history of family risk factors.\n\n"
        "**What you missed:** Did not ask about medication history (steroids can cause secondary glaucoma). "
        "Investigation plan lacked pachymetry.\n\n"
        "**Why it matters clinically:** Corneal thickness affects IOP measurement accuracy — thin corneas underestimate IOP.\n\n"
        "**Focus for next time:** Review the full glaucoma investigation panel: HVF, OCT RNFL, gonioscopy, pachymetry."
    ),
}


def _mock_response(feature: str = "default") -> str:
    return _MOCK_RESPONSES.get(feature, _MOCK_RESPONSES["default"])


def _to_gemini_history(messages: list[dict]) -> tuple[list[dict], str]:
    """Convert Anthropic-format messages to Gemini chat history + last message text.

    Anthropic uses "assistant"; Gemini uses "model". All messages except the last
    become history; the last user message is returned separately.
    """
    if not messages:
        return [], ""
    history = [
        {"role": "model" if m["role"] == "assistant" else "user", "parts": [m["content"]]}
        for m in messages[:-1]
    ]
    return history, messages[-1]["content"]


def _build_contents(messages: list[dict]) -> tuple[list[dict], str]:
    """Build Gemini REST contents list from Anthropic-format messages."""
    history, last_message = _to_gemini_history(messages)
    contents = [
        {"role": h["role"], "parts": [{"text": p} if isinstance(p, str) else p for p in h["parts"]]}
        for h in history
    ]
    contents.append({"role": "user", "parts": [{"text": last_message}]})
    return contents, last_message


def _quota_or_raise(exc: Exception) -> None:
    msg = str(exc)
    if "429" in msg or "RESOURCE_EXHAUSTED" in msg or "quota" in msg.lower():
        raise RuntimeError("quota_exceeded") from exc
    raise exc


def stream_ask(
    system_prompt: str,
    messages: list[dict],
    max_tokens: int = 2048,
    feature: str = "default",
    model: str | None = None,
):
    """Stream a conversation to Gemini via REST, yielding text chunks as they arrive."""
    if MOCK_MODE:
        for word in _mock_response(feature).split(" "):
            yield word + " "
        return

    import httpx, json as _json

    _model = model or MODEL
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{_model}"
        f":streamGenerateContent?key={API_KEY}&alt=sse"
    )
    contents, _ = _build_contents(messages)
    body = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": contents,
        "generationConfig": {"maxOutputTokens": max_tokens},
    }

    try:
        resp = httpx.post(url, json=body, timeout=60)
        if resp.status_code == 429:
            raise RuntimeError("quota_exceeded")
        resp.raise_for_status()
        for line in resp.text.splitlines():
            if line.startswith("data: "):
                try:
                    data = _json.loads(line[6:])
                    text = data["candidates"][0]["content"]["parts"][0]["text"]
                    if text:
                        yield text
                except (KeyError, IndexError, _json.JSONDecodeError):
                    pass
    except RuntimeError:
        raise
    except Exception as exc:
        _quota_or_raise(exc)


def ask(
    system_prompt: str,
    messages: list[dict],
    max_tokens: int = 8192,
    feature: str = "default",
    model: str | None = None,
) -> str:
    """Send a conversation to Gemini via REST and return the full response text."""
    if MOCK_MODE:
        return _mock_response(feature)

    import httpx, json as _json

    _model = model or MODEL
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{_model}"
        f":generateContent?key={API_KEY}"
    )
    contents, _ = _build_contents(messages)
    body = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": contents,
        "generationConfig": {"maxOutputTokens": max_tokens},
    }

    try:
        resp = httpx.post(url, json=body, timeout=60)
        if resp.status_code == 429:
            raise RuntimeError("quota_exceeded")
        resp.raise_for_status()
        data = _json.loads(resp.text)
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except RuntimeError:
        raise
    except Exception as exc:
        _quota_or_raise(exc)


def ask_with_image(
    system_prompt: str,
    messages: list[dict],
    image_path: str | Path,
    max_tokens: int = 1024,
    feature: str = "image",
) -> str:
    """
    Send the last user message with an image attachment to Gemini.

    Vision calls are single-turn: only the last user message in `messages` is
    sent alongside the image. Prior conversation turns are ignored.

    Args:
        system_prompt: The system prompt.
        messages:      Conversation history; only the last user message is used.
        image_path:    Path to a local image file (JPG, PNG, GIF, WEBP).
        max_tokens:    Maximum tokens in the response.
        feature:       Feature name for mock routing.

    Returns:
        Response text as a string.
    """
    if MOCK_MODE:
        return _mock_response(feature)

    import PIL.Image
    from google import genai as _genai

    last_user_text = next(
        (m["content"] for m in reversed(messages) if m["role"] == "user"), ""
    )
    img = PIL.Image.open(Path(image_path))

    response = _client.models.generate_content(
        model=MODEL,
        config=_genai.types.GenerateContentConfig(
            system_instruction=system_prompt,
            max_output_tokens=max_tokens,
        ),
        contents=[last_user_text, img],
    )
    return response.text


if __name__ == "__main__":
    print("Testing claude_client.py (Gemini backend)...\n")

    mode = "MOCK" if MOCK_MODE else "LIVE"
    print(f"  Mode: {mode}")

    print("  Testing ask() - chatbot feature...")
    response = ask(
        system_prompt="You are an ophthalmology tutor.",
        messages=[{"role": "user", "content": "Explain glaucoma in one sentence."}],
        feature="chatbot",
    )
    assert len(response) > 10, "Response too short"
    print(f"  [OK] Response ({len(response)} chars): {response[:80]}...")

    print("  Testing ask() - flashcard feature...")
    response = ask(
        system_prompt="You are a flash-card generator.",
        messages=[{"role": "user", "content": "Generate cards for glaucoma."}],
        feature="flashcard",
    )
    assert len(response) > 10
    print(f"  [OK] Response ({len(response)} chars): {response[:80]}...")

    if MOCK_MODE:
        print("\n  Running in MOCK mode — no API calls made.")
        print("  Add GEMINI_API_KEY to .env to test live mode.")
    else:
        print("\n  Running in LIVE mode — real Gemini API calls used.")

    print("\n  [PASS] claude_client.py working correctly.")
    sys.exit(0)
