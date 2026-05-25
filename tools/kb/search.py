#!/usr/bin/env python3
"""Runtime RAG search — called by server.py before each chat response.

Embeds the user's query and retrieves the most relevant knowledge base chunks
from Supabase. Falls back gracefully if Supabase is not configured.

Usage (from server.py):
    from tools.kb.search import search, format_context, search_checklist
    chunks = search("how is intraocular pressure measured?")
    context = format_context(chunks)

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


def search_checklist(procedure_name: str) -> dict | None:
    """Retrieve the checklist for a specific procedure by name.

    Returns the parsed checklist dict (the `steps` column content) or None
    if no matching checklist is found or Supabase is not configured.
    """
    if not _SUPABASE_ENABLED or not procedure_name:
        return None

    from tools.kb.supabase_client import get_client

    try:
        client = get_client()
        result = client.rpc(
            "checklist_search",
            {"procedure": procedure_name},
        ).execute()
        if result.data:
            return result.data[0].get("steps")
    except Exception as exc:
        print(f"[checklist-search-error] {exc}", flush=True)

    return None


def fetch_checklists(role: str = "") -> list[dict]:
    """Fetch all checklists for the given role from Supabase.

    Always includes logbook checklists (shared across all roles).
    OT  → OT + logbook checklists.
    PSA → PSA + logbook checklists.
    OA  → all checklists (OT + PSA + logbook).
    Returns list of {procedure_name, checklist_type, steps, total_steps} dicts.
    """
    if not _SUPABASE_ENABLED:
        return []

    from tools.kb.supabase_client import get_client
    try:
        client = get_client()
        role_upper = (role or "").upper()

        if role_upper == "OT":
            # OT checklists + shared logbook checklists
            result = client.table("checklists").select(
                "procedure_name, checklist_type, steps, total_steps"
            ).in_("checklist_type", ["OT", "logbook"]).execute()
        elif role_upper == "PSA":
            # PSA checklists + shared logbook checklists
            result = client.table("checklists").select(
                "procedure_name, checklist_type, steps, total_steps"
            ).in_("checklist_type", ["PSA", "logbook"]).execute()
        else:
            # OA or unknown — return everything
            result = client.table("checklists").select(
                "procedure_name, checklist_type, steps, total_steps"
            ).execute()

        return result.data or []
    except Exception as exc:
        print(f"[fetch-checklists-error] {exc}", flush=True)
        return []


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
