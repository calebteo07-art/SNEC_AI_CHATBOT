#!/usr/bin/env python3
"""Google Gemini embedding wrapper for KB ingestion.

Uses gemini-embedding-001 via the google-genai SDK (same key as the rest of the platform).
Returns 3072-dim vectors. In MOCK_MODE (no API key), returns zero vectors so
ingestion logic can be tested without credentials.

Usage:
    from tools.kb.embed import embed_text, embed_batch
    vector = embed_text("intraocular pressure measurement")
    vectors = embed_batch(["glaucoma", "retinal detachment", "cataract"])

Self-test:
    python tools/kb/embed.py
"""

import os
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv
load_dotenv(PROJECT_ROOT / ".env")

API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
MOCK_MODE = not API_KEY
EMBED_MODEL = "models/gemini-embedding-001"
EMBED_DIM = 3072

_client = None


def _get_client():
    global _client
    if _client is None:
        from google import genai
        _client = genai.Client(api_key=API_KEY)
    return _client


def embed_text(text: str) -> list[float]:
    """Return a 3072-dim embedding for a single text string."""
    if MOCK_MODE:
        return [0.0] * EMBED_DIM

    client = _get_client()
    result = client.models.embed_content(
        model=EMBED_MODEL,
        contents=text,
    )
    return list(result.embeddings[0].values)


def embed_batch(
    texts: list[str],
    batch_size: int = 50,
    sleep_between_batches: float = 1.0,
) -> list[list[float]]:
    """Return embeddings for a list of texts.

    Processes in batches to respect API rate limits. Returns a list of
    3072-dim vectors in the same order as `texts`.
    """
    if not texts:
        return []

    if MOCK_MODE:
        return [[0.0] * EMBED_DIM for _ in texts]

    client = _get_client()
    results: list[list[float]] = []

    for start in range(0, len(texts), batch_size):
        batch = texts[start : start + batch_size]
        response = client.models.embed_content(
            model=EMBED_MODEL,
            contents=batch,
        )
        results.extend(list(emb.values) for emb in response.embeddings)

        if start + batch_size < len(texts):
            time.sleep(sleep_between_batches)

    return results


if __name__ == "__main__":
    mode = "MOCK" if MOCK_MODE else "LIVE"
    print(f"Testing embed.py ({mode} mode)...\n")

    v = embed_text("intraocular pressure measurement technique")
    assert len(v) == EMBED_DIM, f"Expected {EMBED_DIM} dims, got {len(v)}"
    print(f"  [OK] embed_text: {EMBED_DIM}-dim vector, first value = {v[0]:.6f}")

    texts = ["glaucoma", "retinal detachment", "cataract surgery"]
    vs = embed_batch(texts)
    assert len(vs) == 3, f"Expected 3 vectors, got {len(vs)}"
    assert all(len(v) == EMBED_DIM for v in vs)
    print(f"  [OK] embed_batch: {len(vs)} vectors returned")

    if MOCK_MODE:
        print("\n  Running in MOCK mode -- no API calls made.")
        print("  Add GEMINI_API_KEY to .env to test live embeddings.")

    print("\n[PASS] embed.py working correctly.")
    sys.exit(0)
