#!/usr/bin/env python3
"""Google Gemini embedding wrapper for KB ingestion.

Uses gemini-embedding-2 via the google-genai SDK (same key as the rest of the platform).
Returns 1536-dim vectors (reduced via output_dimensionality to stay within pgvector HNSW
2000-dim limit). In MOCK_MODE (no API key), returns zero vectors so ingestion logic can
be tested without credentials.

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
EMBED_MODEL = "models/gemini-embedding-2"
EMBED_DIM = 1536  # reduced from 3072 to stay within pgvector HNSW 2000-dim limit

_client = None


def _get_client():
    global _client
    if _client is None:
        from google import genai
        _client = genai.Client(api_key=API_KEY)
    return _client


def embed_text(text: str) -> list[float]:
    """Return a 1536-dim embedding for a single text string."""
    if MOCK_MODE:
        return [0.0] * EMBED_DIM

    client = _get_client()
    from google.genai import types as _types
    result = client.models.embed_content(
        model=EMBED_MODEL,
        contents=text,
        config=_types.EmbedContentConfig(output_dimensionality=EMBED_DIM),
    )
    return list(result.embeddings[0].values)


def embed_batch(
    texts: list[str],
    batch_size: int = 50,
    sleep_between_batches: float = 1.0,
) -> list[list[float]]:
    """Return one 1536-dim embedding per input text, in the same order.

    IMPORTANT: gemini-embedding-2 (via the current google-genai SDK) returns a
    SINGLE embedding per request even when `contents` is a list — so we must
    embed one text per request to get a 1:1 mapping. Embedding multiple texts in
    one request silently collapses them to one vector, which previously caused
    ingestion to store far fewer (mismatched) chunks than the document had.

    `batch_size` now only controls rate-limit pacing (a short sleep is inserted
    after every `batch_size` requests), not how many texts share a request.

    Guarantees: len(return value) == len(texts).
    """
    if not texts:
        return []

    if MOCK_MODE:
        return [[0.0] * EMBED_DIM for _ in texts]

    client = _get_client()
    from google.genai import types as _types
    results: list[list[float]] = []

    for i, text in enumerate(texts):
        response = client.models.embed_content(
            model=EMBED_MODEL,
            contents=text,
            config=_types.EmbedContentConfig(output_dimensionality=EMBED_DIM),
        )
        results.append(list(response.embeddings[0].values))

        if (i + 1) % batch_size == 0 and (i + 1) < len(texts):
            time.sleep(sleep_between_batches)

    if len(results) != len(texts):  # defensive — must never happen
        raise RuntimeError(
            f"embed_batch produced {len(results)} vectors for {len(texts)} texts"
        )
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
