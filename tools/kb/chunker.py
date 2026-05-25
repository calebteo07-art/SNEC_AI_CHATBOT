#!/usr/bin/env python3
"""Token-aware text chunker for KB ingestion.

Splits document text into overlapping chunks sized for the Gemini context window.
Uses tiktoken (cl100k_base) as an approximate token counter — close enough for
Gemini's tokenizer without requiring an API call.

Usage:
    from tools.kb.chunker import chunk_text
    chunks = chunk_text(raw_text, chunk_tokens=800, overlap_tokens=100)

Self-test:
    python tools/kb/chunker.py
"""

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import tiktoken

_ENC = tiktoken.get_encoding("cl100k_base")


def _count_tokens(text: str) -> int:
    return len(_ENC.encode(text))


def chunk_text(
    text: str,
    chunk_tokens: int = 800,
    overlap_tokens: int = 100,
) -> list[dict]:
    """Split text into overlapping token-bounded chunks.

    Splits on paragraph boundaries first (double newlines) to keep semantic
    units intact, then hard-cuts by token count only when a paragraph is
    too long to fit in a single chunk.

    Returns:
        List of dicts: [{text, token_count, char_start}, ...]
    """
    if not text or not text.strip():
        return []

    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[dict] = []
    current_paras: list[str] = []
    current_tokens = 0
    char_cursor = 0

    def _flush(paras: list[str]) -> dict:
        joined = "\n\n".join(paras)
        return {"text": joined, "token_count": _count_tokens(joined), "char_start": char_cursor}

    for para in paragraphs:
        para_tokens = _count_tokens(para)

        if para_tokens > chunk_tokens:
            # Paragraph itself is too long — flush current buffer first, then hard-cut
            if current_paras:
                chunks.append(_flush(current_paras))
                current_paras = []
                current_tokens = 0

            words = para.split()
            sub_buf: list[str] = []
            sub_tokens = 0
            for word in words:
                wt = _count_tokens(word + " ")
                if sub_tokens + wt > chunk_tokens and sub_buf:
                    chunk_text_str = " ".join(sub_buf)
                    chunks.append({
                        "text": chunk_text_str,
                        "token_count": _count_tokens(chunk_text_str),
                        "char_start": char_cursor,
                    })
                    # Keep overlap
                    overlap_words = sub_buf[max(0, len(sub_buf) - overlap_tokens // 4):]
                    sub_buf = overlap_words + [word]
                    sub_tokens = _count_tokens(" ".join(sub_buf))
                else:
                    sub_buf.append(word)
                    sub_tokens += wt
            if sub_buf:
                chunk_text_str = " ".join(sub_buf)
                chunks.append({
                    "text": chunk_text_str,
                    "token_count": _count_tokens(chunk_text_str),
                    "char_start": char_cursor,
                })
            char_cursor += len(para) + 2
            continue

        if current_tokens + para_tokens > chunk_tokens and current_paras:
            chunks.append(_flush(current_paras))
            # Carry overlap: keep last few paragraphs that fit within overlap budget
            overlap_buf: list[str] = []
            overlap_t = 0
            for p in reversed(current_paras):
                pt = _count_tokens(p)
                if overlap_t + pt <= overlap_tokens:
                    overlap_buf.insert(0, p)
                    overlap_t += pt
                else:
                    break
            current_paras = overlap_buf
            current_tokens = overlap_t

        current_paras.append(para)
        current_tokens += para_tokens
        char_cursor += len(para) + 2

    if current_paras:
        chunks.append(_flush(current_paras))

    return chunks


if __name__ == "__main__":
    sample = (
        "Glaucoma is a group of eye conditions that damage the optic nerve.\n\n"
        "It is one of the leading causes of blindness worldwide.\n\n"
        "Primary open-angle glaucoma (POAG) is the most common form.\n\n"
        "Intraocular pressure (IOP) is a major risk factor, with normal range 10-21 mmHg.\n\n"
        "Treatment includes prostaglandin analogue eye drops as first-line therapy.\n\n"
    ) * 10  # Make it long enough to trigger chunking

    chunks = chunk_text(sample, chunk_tokens=200, overlap_tokens=30)
    print(f"Input: {_count_tokens(sample)} tokens -> {len(chunks)} chunks")
    for i, c in enumerate(chunks):
        print(f"  Chunk {i}: {c['token_count']} tokens, starts: {c['text'][:60]!r}")
    assert len(chunks) > 1, "Expected multiple chunks for long input"
    print("\n[PASS] chunker.py working correctly.")
    sys.exit(0)
