#!/usr/bin/env python3
"""KB semantic search + checklist lookup helpers.

`search`/`format_context` embed a query and pull the most relevant knowledge-base
chunks from Supabase. NOTE: runtime chat RAG was removed for speed (the tutor now
injects the static KB directly, see tools/api/routers/chat.py) — these are retained
for the ingestion self-test and a possible future re-enable. `get_checklist_by_name`
backs the OSCE checklist lookup used by the cases router. All degrade gracefully
when Supabase is not configured.

Self-test:
    python tools/kb/search.py "how is IOP measured?"
"""

import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv
load_dotenv(PROJECT_ROOT / ".env")

_SUPABASE_ENABLED = bool(os.getenv("SUPABASE_URL", "").strip())


def search(
    query: str,
    top_k: int = 6,
    min_similarity: float = 0.65,
) -> list[dict]:
    """Return the top-k most relevant KB chunks for a query.

    Returns an empty list if Supabase is not configured or the search fails.
    """
    if not _SUPABASE_ENABLED:
        return []

    from tools.kb.embed import embed_text
    from tools.kb.supabase_client import get_client

    try:
        embedding = embed_text(query)
        client = get_client()
        result = client.rpc(
            "semantic_search",
            {
                "query_embedding": embedding,
                "top_k": top_k,
                "min_similarity": min_similarity,
            },
        ).execute()
        return result.data or []
    except Exception as exc:
        print(f"[rag-search-error] {exc}", flush=True)
        return []


def format_context(chunks: list[dict]) -> str:
    """Format retrieved chunks into a context string for the system prompt.

    Groups chunks by source document and adds source attribution so the
    tutor can cite references accurately.
    """
    if not chunks:
        return ""

    # Group by document title
    by_doc: dict[str, list[str]] = {}
    for chunk in chunks:
        title = chunk.get("title", "Unknown Source")
        by_doc.setdefault(title, []).append(chunk["text"])

    sections = []
    for title, texts in by_doc.items():
        combined = "\n\n".join(texts)
        sections.append(f"### {title}\n\n{combined}")

    return "\n\n---\n\n".join(sections)


def get_checklist_by_name(name: str) -> dict | None:
    """Fetch a single checklist from Supabase by procedure name.

    Tries exact match first, then falls back to a case-insensitive partial match.
    Returns {procedure_name, steps, total_steps} or None if not found.
    """
    if not _SUPABASE_ENABLED or not name:
        return None

    from tools.kb.supabase_client import get_client
    try:
        client = get_client()
        # Exact match
        result = client.table("checklists").select(
            "procedure_name, steps, total_steps"
        ).eq("procedure_name", name).limit(1).execute()
        if result.data:
            return result.data[0]
        # Fuzzy fallback — match if name is a substring of procedure_name
        result = client.table("checklists").select(
            "procedure_name, steps, total_steps"
        ).ilike("procedure_name", f"%{name}%").limit(1).execute()
        return result.data[0] if result.data else None
    except Exception as exc:
        print(f"[get-checklist-error] {exc}", flush=True)
        return None


if __name__ == "__main__":
    query = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "intraocular pressure measurement"
    print(f"Searching KB for: {query!r}\n")

    if not _SUPABASE_ENABLED:
        print("[SKIP] SUPABASE_URL not set — cannot run live search.")
        print("  Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env to test.")
        sys.exit(0)

    chunks = search(query)
    print(f"Retrieved {len(chunks)} chunks:\n")
    for i, c in enumerate(chunks):
        sim = c.get("similarity", 0)
        title = c.get("title", "?")
        preview = c.get("text", "")[:120].replace("\n", " ")
        print(f"  [{i+1}] {title} (sim={sim:.3f})")
        print(f"       {preview!r}")

    if chunks:
        print("\n--- Formatted context preview ---")
        print(format_context(chunks)[:500])

    print("\n[PASS] search.py completed.")
    sys.exit(0)
