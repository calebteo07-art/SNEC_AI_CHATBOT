#!/usr/bin/env python3
"""Ingest .docx source documents (e.g. OSCE skill-station scripts) into the
Supabase KB, mirroring ingest_document.ingest() but for Word files.

The PDF pipeline (ingest_document.py) uses PyMuPDF and is PDF-only. OSCE scripts
arrive as .docx, so this path: extract text (extract_docx) -> REDACT secrets/PII
-> chunk -> embed -> insert document + chunks. No images.

SECURITY: the source OSCE docs contained live training-system credentials and
NRICs. redact() strips the credential block and NRICs before anything is chunked,
embedded, or written to the database.

PAID API: embeddings (Gemini) — small for these short docs. Idempotent: skips
already-ingested filenames unless force=True.

Usage:
    python tools/kb/ingest_docx.py "a.docx" "b.docx" --module 2 --category clinical_procedure
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.kb.extract_docx import extract_docx_text
from tools.kb.chunker import chunk_text
from tools.kb.embed import embed_batch, MOCK_MODE as EMBED_MOCK
from tools.kb.supabase_client import get_client, get_document_id, insert_document, insert_chunks

# Lines containing any of these (case-insensitive) are dropped wholesale — they
# are the credential block / student identifiers, never clinical content.
_SECRET_MARKERS = (
    "domain user name", "domain password", "scm user name", "scm password",
    "domain is shsu", "name of student", "snecscmtrg01", "snecpsa001",
    "i007love", "@pples2020",
)
_NRIC = re.compile(r"\b[STFGM]\d{7}[A-Z]\b", re.IGNORECASE)
_POSTAL = re.compile(r"\bSINGAPORE\s+\d{6}\b", re.IGNORECASE)


def redact(text: str) -> str:
    """Remove credential lines and mask NRICs / postal codes from doc text."""
    kept: list[str] = []
    for line in text.splitlines():
        low = line.lower()
        if any(m in low for m in _SECRET_MARKERS):
            continue
        line = _NRIC.sub("[NRIC]", line)
        line = _POSTAL.sub("[ADDRESS]", line)
        kept.append(line)
    return "\n".join(kept)


def _title(stem: str) -> str:
    """Human-readable title from the docx stem."""
    stem = re.sub(r"_[A-Z][a-z]+ ?[A-Z]?[a-z]*$", "", stem)  # trailing student name
    stem = stem.replace("Student copy", "").replace("Patient copy", "")
    stem = re.sub(r"^[\s\-_.]+", "", stem).strip(" -_.")
    return f"OSCE - {stem}" if stem else "OSCE script"


def ingest_docx(path: Path, module: int, category: str, force: bool = False) -> str | None:
    filename = f"OSCE/{path.stem}"
    if not force:
        existing = get_document_id(filename)
        if existing:
            print(f"    [skip] already ingested: {path.name} ({existing[:8]}...)")
            return existing

    raw = extract_docx_text(path)
    text = redact(raw)
    if not text.strip():
        print(f"    [skip] no text after redaction: {path.name}")
        return None

    document_id = insert_document({
        "filename": filename,
        "module": module,
        "category": category,
        "title": _title(path.stem),
        "page_count": 1,
    })

    # Drop any existing chunks for this document so re-ingestion stays idempotent
    # (insert is append-only, so without this a re-run would duplicate chunks).
    get_client().table("chunks").delete().eq("document_id", document_id).execute()

    chunks = chunk_text(text)
    texts = [c["text"] for c in chunks]
    embeddings = embed_batch(texts)
    rows = [{
        "document_id": document_id,
        "chunk_index": i,
        "page_start": 0,
        "page_end": 0,
        "text": c["text"],
        "token_count": c["token_count"],
        "embedding": emb,
    } for i, (c, emb) in enumerate(zip(chunks, embeddings))]
    insert_chunks(rows)
    flag = " (MOCK embeddings)" if EMBED_MOCK else ""
    print(f"    ok {path.name}: {len(rows)} chunk(s), {len(text):,} chars{flag}")
    return document_id


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="+", type=Path)
    parser.add_argument("--module", type=int, default=2)
    parser.add_argument("--category", type=str, default="clinical_procedure")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    errors = 0
    for f in args.files:
        print(f"[ingest] {f.name}")
        if not f.exists():
            print(f"    [MISSING] {f}")
            errors += 1
            continue
        try:
            ingest_docx(f, args.module, args.category, args.force)
        except Exception as exc:  # noqa: BLE001
            print(f"    [ERROR] {type(exc).__name__}: {str(exc)[:200]}")
            errors += 1
    print(f"done: {len(args.files) - errors}/{len(args.files)} ingested")
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
