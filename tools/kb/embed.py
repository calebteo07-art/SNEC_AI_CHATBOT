#!/usr/bin/env python3
"""Google text-embedding-004 wrapper for KB ingestion.

Uses the same GEMINI_API_KEY as the rest of the platform. Returns 768-dim vectors.
In MOCK_MODE (no API key), returns zero vectors so ingestion logic can be tested.

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

import httpx

API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
MOCK_MODE = not API_KEY
EMBED_DIM = 768
_EMBED_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models"
    "/text-embedding-004:embedContent"
)
_BATCH_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models"
    "/text-embedding-004:batchEmbedContents"
)


def embed_text(text: str) -> list[float]:
    """Return a 768-dim embedding for a single text string."""
    if MOCK_MODE:
        return [0.0] * EMBED_DIM

    resp = httpx.post(
        f"{_EMBED_URL}?key={API_KEY}",
        json={
            "model": "models/text-embedding-004",
            "content": {"parts": [{"text": text}]},
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["embedding"]["values"]


def embed_batch(
    texts: list[str],
    batch_size: int = 100,
    sleep_between_batches: float = 1.0,
) -> list[list[float]]:
    """Return embeddings for a list of texts.

    Processes in batches of `batch_size` (max 100 per Google's API limit).
    Sleeps between batches to respect the free-tier rate limit of 1,500 req/min.

    Returns a list of 768-dim vectors in the same order as `texts`.
    """
    if not texts:
        return []

    if MOCK_MODE:
        return [[0.0] * EMBED_DIM for _ in texts]

    results: list[list[float]] = []
    for start in range(0, len(texts), batch_size):
        batch = texts[start : start + batch_size]
        requests = [
            {
                "model": "models/text-embedding-004",
                "content": {"parts": [{"text": t}]},
            }
            for t in batch
        ]
        resp = httpx.post(
            f"{_BATCH_URL}?key={API_KEY}",
            json={"requests": requests},
            timeout=60,
        )
        resp.raise_for_status()
        embeddings = resp.json()["embeddings"]
        results.extend(e["values"] for e in embeddings)

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
        print("\n  Running in MOCK mode — no API calls made.")
        print("  Add GEMINI_API_KEY to .env to test live embeddings.")

    print("\n[PASS] embed.py working correctly.")
    sys.exit(0)
