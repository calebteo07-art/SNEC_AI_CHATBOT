#!/usr/bin/env python3
"""OCR fallback for scanned / image-only PDFs using Gemini vision.

Some source PDFs (e.g. scanned book chapters) have almost no embedded text, so
extract_pdf returns only a few characters and the document is effectively absent
from the RAG knowledge base. This module rasterizes each page and asks Gemini to
transcribe it, so the content becomes searchable.

Used as an automatic fallback by ingest_document.ingest() when a PDF's extracted
text density is below `MIN_CHARS_PER_PAGE`. In MOCK_MODE (no API key) OCR is a
no-op (returns "").

Self-test:
    python tools/kb/ocr.py <path_to_scanned.pdf>
"""

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import time

import fitz  # pymupdf

from tools.shared.gemini_client import MOCK_MODE, FLASH_MODEL, _ensure_sdk_clients

# Below this average chars-per-page a PDF is treated as scanned/image-only.
# Real slide decks comfortably exceed this; scanned chapters fall far below.
MIN_CHARS_PER_PAGE = 100

_OCR_PROMPT = (
    "You are transcribing a page from a printed ophthalmology textbook. "
    "Extract ALL readable text from this page verbatim, preserving headings, "
    "lists and reading order. Do NOT summarise, add commentary, or describe "
    "figures. If the page contains no readable text, return an empty response."
)

def needs_ocr(text: str, page_count: int, threshold: int = MIN_CHARS_PER_PAGE) -> bool:
    """True if the extracted text is too sparse for the page count (likely scanned)."""
    if page_count <= 0:
        return False
    return (len(text or "") / page_count) < threshold


def _ocr_one_page(png: bytes, model: str) -> str:
    """OCR a single page image, trying each API key and retrying transient errors."""
    from google.genai import types
    parts = [types.Part.from_bytes(data=png, mime_type="image/png"), _OCR_PROMPT]
    last_exc: Exception | None = None
    for client in _ensure_sdk_clients():
        for attempt in range(3):
            try:
                resp = client.models.generate_content(model=model, contents=parts)
                return (resp.text or "").strip()
            except Exception as exc:
                last_exc = exc
                msg = str(exc)
                transient = ("500", "503", "504", "UNAVAILABLE", "DEADLINE_EXCEEDED",
                             "429", "RESOURCE_EXHAUSTED")
                if any(s in msg for s in transient):
                    time.sleep(1.0 * (2 ** attempt))  # backoff, then retry / next key
                    continue
                break  # non-transient — try next key
    if last_exc:
        print(f"    [ocr] page failed after retries: {last_exc}", flush=True)
    return ""


def ocr_pdf(pdf_path: Path, dpi: int = 200, model: str = FLASH_MODEL) -> str:
    """Transcribe every page of a PDF with Gemini vision; pages joined by blank lines."""
    if MOCK_MODE:
        return ""

    doc = fitz.open(str(pdf_path))
    pages_text: list[str] = []
    try:
        for i in range(len(doc)):
            png = doc[i].get_pixmap(dpi=dpi).tobytes("png")
            txt = _ocr_one_page(png, model)
            if txt:
                pages_text.append(txt)
    finally:
        doc.close()
    return "\n\n".join(pages_text)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python tools/kb/ocr.py <path_to.pdf>")
        sys.exit(1)
    p = Path(sys.argv[1])
    if not p.exists():
        print(f"File not found: {p}")
        sys.exit(1)
    print(f"OCR (mode={'MOCK' if MOCK_MODE else 'LIVE'}): {p.name}")
    text = ocr_pdf(p)
    print(f"  extracted {len(text):,} chars")
    print("  preview:", repr(text[:300]))
    sys.exit(0)
