#!/usr/bin/env python3
"""Shared AI client — all Gemini API calls in the SNEC platform go through here.

Automatically runs in MOCK_MODE when GEMINI_API_KEY is not set, returning
structured fake responses so all features can be built and tested without an API key.
Switch to live mode by adding GEMINI_API_KEY to .env.

Usage (from other tools):
    from tools.shared.gemini_client import ask

Self-test:
    python tools/shared/gemini_client.py
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(PROJECT_ROOT / ".env")

# Model spec — edit here to change; env vars do not control model selection
FLASH_MODEL      = "gemini-3.5-flash"
FLASH_LITE_MODEL = "gemini-3.1-flash-lite"
# 2026-06-13: "gemini-3.1-pro" 404s on this key — ListModels shows only the
# -preview id is served for generateContent.
PRO_MODEL        = "gemini-3.1-pro-preview"

# Aliases used at call sites — no behaviour change needed at callers.
# Per request (2026-06-15): every runtime AI feature — student and admin —
# uses gemini-3.1-flash-lite. All three call-site aliases point at the flash-lite
# model so no individual call site needs editing. (Text embeddings and image
# generation are different model classes, configured separately and unaffected.)
MODEL       = FLASH_LITE_MODEL
MODEL_PRO   = FLASH_LITE_MODEL
MODEL_SMALL = FLASH_LITE_MODEL
# Load all available API keys — primary required, backups optional.
# Add GEMINI_API_KEY_2 / GEMINI_API_KEY_3 in Render env vars to enable rotation.
_API_KEYS: list[str] = [
    k.strip()
    for k in [
        os.getenv("GEMINI_API_KEY", ""),
        os.getenv("GEMINI_API_KEY_2", ""),
        os.getenv("GEMINI_API_KEY_3", ""),
    ]
    if k.strip()
]
API_KEY   = _API_KEYS[0] if _API_KEYS else ""
MOCK_MODE = not _API_KEYS

_SDK_CLIENTS: list = []  # populated lazily on first real API call


def _ensure_sdk_clients() -> list:
    """Lazily initialize SDK clients so google-genai import only runs in live mode."""
    global _SDK_CLIENTS
    if not _SDK_CLIENTS and _API_KEYS:
        from google import genai
        from google.genai import types
        # Hard request timeout so a hung upstream call can't pin a worker thread
        # forever (which would slowly exhaust the bounded threadpool under load).
        _timeout_ms = int(os.getenv("GEMINI_TIMEOUT_MS", "60000"))
        _http = types.HttpOptions(timeout=_timeout_ms)
        _SDK_CLIENTS = [genai.Client(api_key=k, http_options=_http) for k in _API_KEYS]
    return _SDK_CLIENTS


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
    "case_eval": (
        '{"history": {"score": 7, "feedback": "Good approach. Asked onset and laterality."}, '
        '"investigations": {"score": 7, "feedback": "Key tests ordered; HVF missing."}, '
        '"diagnosis": {"score": 8, "feedback": "Correct primary diagnosis reached."}, '
        '"management": {"score": 7, "feedback": "Treatment initiated but follow-up incomplete."}}'
    ),
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


# Gemini 2.x uses thinking_budget (tokens); thinking_level is a Gemini 3.x-only API.
# Map our internal level strings to concrete budgets for the current model generation.
_THINKING_BUDGETS: dict[str, int] = {
    "LOW":    1024,
    "MEDIUM": 8192,
    "HIGH":   16000,
}


def stream_ask(
    system_prompt: str,
    messages: list[dict],
    max_tokens: int = 2048,
    feature: str = "default",
    model: str | None = None,
    thinking_level: str = "MINIMAL",
):
    """Stream a conversation to Gemini via the google-genai SDK, yielding text chunks LIVE.

    becky §1: tokens are yielded as they arrive — no full-response buffering. Multi-key
    fallback + transient-error retry still apply to failures BEFORE the first token (where
    quota / availability errors almost always surface). Once the first token has been sent,
    a mid-stream error simply ends the stream with the partial answer already delivered —
    the SSE wrappers in chat.py / cases.py close that cleanly.
    """
    if MOCK_MODE:
        for word in _mock_response(feature).split(" "):
            yield word + " "
        return

    import time
    from google.genai import types

    _model = model or MODEL
    contents, _ = _build_contents(messages)
    config_kwargs_stream: dict = {
        "system_instruction": system_prompt,
        "max_output_tokens": max_tokens,
    }
    if thinking_level != "MINIMAL":
        config_kwargs_stream["thinking_config"] = types.ThinkingConfig(
            thinking_budget=_THINKING_BUDGETS.get(thinking_level, 1024)
        )
    config = types.GenerateContentConfig(**config_kwargs_stream)

    last_exc: Exception = RuntimeError("no_api_keys")

    for sdk_client in _ensure_sdk_clients():
        for attempt in range(3):
            started = False
            try:
                for chunk in sdk_client.models.generate_content_stream(
                    model=_model,
                    contents=contents,
                    config=config,
                ):
                    text = chunk.text
                    if text:
                        started = True
                        yield text                # live, token-by-token
                return                            # stream finished cleanly
            except RuntimeError:
                raise
            except Exception as exc:
                if started:
                    # Partial answer already delivered — do NOT retry or fall back
                    # (that would replay duplicate tokens). End the stream; the SSE
                    # layer closes gracefully. This is the one reliability tradeoff
                    # becky §1 accepts: failures cluster before the first token.
                    return
                msg = str(exc)
                if "429" in msg or "RESOURCE_EXHAUSTED" in msg or "quota" in msg.lower():
                    last_exc = RuntimeError("quota_exceeded")
                    break  # quota exhausted — try next key
                if "500" in msg or "503" in msg or "UNAVAILABLE" in msg:
                    last_exc = exc
                    if attempt < 2:
                        time.sleep(0.5 * (2 ** attempt))
                        continue
                    break
                last_exc = exc
                break  # unknown error — try next key

    _quota_or_raise(last_exc)
    return


def ask(
    system_prompt: str,
    messages: list[dict],
    max_tokens: int = 8192,
    feature: str = "default",
    model: str | None = None,
    thinking_level: str = "MINIMAL",
    json_mode: bool = False,
    response_json_schema: dict | None = None,
) -> str:
    """Send a conversation to Gemini via the google-genai SDK and return the full response text.
    Tries each available SDK client in order; retries up to 3 attempts per client on transient errors.
    """
    if MOCK_MODE:
        return _mock_response(feature)

    import time
    from google.genai import types

    _model = model or MODEL
    contents, _ = _build_contents(messages)

    config_kwargs: dict = {
        "system_instruction": system_prompt,
        "max_output_tokens": max_tokens,
    }
    if thinking_level != "MINIMAL":
        config_kwargs["thinking_config"] = types.ThinkingConfig(
            thinking_budget=_THINKING_BUDGETS.get(thinking_level, 1024)
        )
    if json_mode and response_json_schema is None:
        config_kwargs["response_mime_type"] = "application/json"
    if response_json_schema is not None:
        config_kwargs["response_mime_type"] = "application/json"
        config_kwargs["response_schema"] = response_json_schema

    config = types.GenerateContentConfig(**config_kwargs)

    last_exc: Exception = RuntimeError("no_api_keys")
    for sdk_client in _ensure_sdk_clients():
        for attempt in range(3):
            try:
                response = sdk_client.models.generate_content(
                    model=_model,
                    contents=contents,
                    config=config,
                )
                if not response.candidates:
                    return response.text or ""
                candidate = response.candidates[0]
                # Only raise on truncation for large-budget calls (short intentional caps are fine)
                if (max_tokens > 512
                        and getattr(getattr(candidate, 'finish_reason', None), 'name', None) == "MAX_TOKENS"):
                    raise RuntimeError(f"response_truncated: maxOutputTokens reached for feature={feature}")
                return response.text or ""
            except RuntimeError:
                raise
            except Exception as exc:
                msg = str(exc)
                if "429" in msg or "RESOURCE_EXHAUSTED" in msg or "quota" in msg.lower():
                    last_exc = RuntimeError("quota_exceeded")
                    break  # quota exhausted — try next key
                if "500" in msg or "503" in msg or "UNAVAILABLE" in msg:
                    last_exc = exc
                    if attempt < 2:
                        time.sleep(0.5 * (2 ** attempt))
                        continue
                    break
                last_exc = exc
                break  # unknown error — try next key

    _quota_or_raise(last_exc)



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
