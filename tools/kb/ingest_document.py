#!/usr/bin/env python3
"""Orchestrates single-PDF ingestion into Supabase.

Pipeline per PDF:
  1. Insert/upsert documents row
  2. Extract text → chunk → embed → insert chunks
  3. Extract images → upload to Supabase Storage → insert images

Idempotent: skips already-ingested documents unless --force is passed.

Usage:
    from tools.kb.ingest_document import ingest
    document_id = ingest(Path("glaucoma.pdf"), module=2, category="disease")

Self-test:
    python tools/kb/ingest_document.py <path_to.pdf> [--force]
"""

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.kb.supabase_client import (
    get_document_id,
    insert_document,
    insert_chunks,
    insert_images,
    upload_kb_image,
)
from tools.kb.embed import embed_batch, MOCK_MODE as EMBED_MOCK
from tools.kb.chunker import chunk_text
from tools.kb.extract_pdf import extract_full_text, extract_text_by_page, extract_images_by_page

import fitz  # for page count


def _page_count(pdf_path: Path) -> int:
    doc = fitz.open(str(pdf_path))
    count = len(doc)
    doc.close()
    return count


def _derive_title(pdf_path: Path) -> str:
    """Derive a human-readable title from the filename."""
    stem = pdf_path.stem
    # Strip leading numbers/codes like "1.", "NU-PR-OPD-D0002"
    import re
    stem = re.sub(r"^[\d]+\.\s*", "", stem)
    stem = re.sub(r"^NU-PR-OPD-[A-Z0-9]+\s+", "", stem)
    # Replace underscores, hyphens with spaces; strip trailing version tags
    stem = re.sub(r"[_]", " ", stem)
    stem = re.sub(r"\s*[Vv]\d+$", "", stem)  # remove V1, V2, V3 suffix
    return stem.strip()


def _build_storage_path(module: int, doc_stem: str, img_filename: str) -> str:
    """Build Supabase Storage path for an image."""
    import re
    safe_stem = re.sub(r"[^\w\-]", "_", doc_stem)[:60]
    return f"module_{module}/{safe_stem}/{img_filename}"


def ingest(
    pdf_path: Path,
    module: int,
    category: str,
    force: bool = False,
) -> str:
    """Run the full ingestion pipeline for one PDF.

    Args:
        pdf_path: Absolute path to the PDF file.
        module:   1 or 2.
        category: One of anatomy | clinical_procedure | checklist | disease |
                  diagnostic | research | pharmacology | ethics | reference.
        force:    If True, re-ingest even if already present in Supabase.

    Returns:
        document_id (UUID string).
    """
    filename = f"Module {module}/{pdf_path.name}"
    title = _derive_title(pdf_path)

    # Check idempotency
    if not force:
        existing_id = get_document_id(filename)
        if existing_id:
            print(f"    [skip] Already ingested: {pdf_path.name} ({existing_id[:8]}…)")
            return existing_id

    # Step 1 — insert document metadata
    doc_row = {
        "filename": filename,
        "module": module,
        "category": category,
        "title": title,
        "page_count": _page_count(pdf_path),
    }
    document_id = insert_document(doc_row)

    # Step 2 — extract, chunk, embed, insert text chunks
    full_text = extract_full_text(pdf_path)
    if full_text.strip():
        chunks = chunk_text(full_text)

        # Determine page boundaries per chunk (approximate via char offsets)
        pages = extract_text_by_page(pdf_path)
        page_char_ends: list[int] = []
        running = 0
        for p in pages:
            running += len(p["text"]) + 2  # +2 for the \n\n join
            page_char_ends.append(running)

        def _char_to_page(char_pos: int) -> int:
            for i, end in enumerate(page_char_ends):
                if char_pos <= end:
                    return i
            return len(pages) - 1

        texts = [c["text"] for c in chunks]
        embeddings = embed_batch(texts)
        # Guard: a 1:1 text->embedding mapping is required. zip() below would
        # silently drop chunks if these lengths ever diverge (this exact bug
        # truncated a 75-chunk textbook to 2 chunks once).
        if len(embeddings) != len(chunks):
            raise RuntimeError(
                f"Embedding/chunk count mismatch for {pdf_path.name}: "
                f"{len(embeddings)} embeddings vs {len(chunks)} chunks"
            )

        chunk_rows = []
        for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
            page_start = _char_to_page(chunk["char_start"])
            chunk_rows.append({
                "document_id": document_id,
                "chunk_index": i,
                "page_start": page_start,
                "page_end": page_start,  # approximate
                "text": chunk["text"],
                "token_count": chunk["token_count"],
                "embedding": emb,
            })
        insert_chunks(chunk_rows)
        print(f"    text: {len(chunk_rows)} chunks ({len(full_text):,} chars)")
    else:
        print("    text: no extractable text (may be scanned/image-only PDF)")

    # Step 3 — extract and upload images
    tmp_dir = PROJECT_ROOT / ".tmp" / "kb_images" / f"mod{module}" / pdf_path.stem
    try:
        images = extract_images_by_page(pdf_path, tmp_dir)
    except Exception as exc:
        print(f"    images: extraction failed — {exc}")
        images = []

    image_rows = []
    for img in images:
        storage_path = _build_storage_path(module, pdf_path.stem, img["path"].name)
        try:
            img_bytes = img["path"].read_bytes()
            drive_url = upload_kb_image(storage_path, img_bytes)
        except Exception as exc:
            print(f"    image upload failed ({img['path'].name}): {exc}")
            drive_url = None

        image_rows.append({
            "document_id": document_id,
            "page_number": img["page"],
            "image_index": img["index"],
            "drive_file_id": storage_path,
            "drive_url": drive_url,
            "width_px": img["width"],
            "height_px": img["height"],
        })

    if image_rows:
        insert_images(image_rows)
        print(f"    images: {len(image_rows)} uploaded")

    # Clean up temp images to save disk space
    if tmp_dir.exists():
        import shutil
        shutil.rmtree(tmp_dir, ignore_errors=True)

    return document_id


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Ingest a single PDF into Supabase.")
    parser.add_argument("pdf_path", type=Path)
    parser.add_argument("--module", type=int, default=2)
    parser.add_argument("--category", type=str, default="disease")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    if not args.pdf_path.exists():
        print(f"File not found: {args.pdf_path}")
        sys.exit(1)

    print(f"Ingesting: {args.pdf_path.name}")
    print(f"  Module: {args.module}, Category: {args.category}, Force: {args.force}")
    doc_id = ingest(args.pdf_path, args.module, args.category, args.force)
    print(f"\n[PASS] document_id = {doc_id}")
    sys.exit(0)
