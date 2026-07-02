#!/usr/bin/env python3
"""Read-only: dump *silly* source text for hand-authoring flashcards/cases.

No embeddings, no Gemini — a plain Supabase table read (documents + chunks).
Pass one or more document-title substrings (from docs/notes/silly-coverage-matrix.md);
prints every matching document's chunks in order so you can author grounded cards.

Usage:
  PYTHONIOENCODING=utf-8 PYTHONUTF8=1 \
    python tools/kb/dump_topic_sources.py "Harold Stein Chap 4 Pharmacology" "Duke NUS OT OA Course"
"""
import sys
sys.path.insert(0, ".")

from tools.kb.supabase_client import get_client


def dump(needles: list[str]) -> None:
    c = get_client()
    docs = c.table("documents").select("id,title,category").execute().data or []
    low = [n.lower() for n in needles]
    want = [d for d in docs if any(n in (d.get("title") or "").lower() for n in low)]
    if not want:
        print(f"[no documents matched] {needles}")
        print("available titles:")
        for d in sorted(docs, key=lambda x: x.get("title") or ""):
            print("  -", d.get("title"))
        return
    for d in want:
        rows = (c.table("chunks").select("chunk_index,text")
                .eq("document_id", d["id"]).order("chunk_index").execute().data) or []
        print(f"\n===== {d['title']}  [{d.get('category')}]  ({len(rows)} chunks) =====")
        for r in rows:
            print(f"\n--- chunk {r.get('chunk_index')} ---\n{r.get('text', '')}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: dump_topic_sources.py <title-substring> [more...]")
        sys.exit(1)
    dump(sys.argv[1:])
