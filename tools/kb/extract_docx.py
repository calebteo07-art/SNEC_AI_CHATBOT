#!/usr/bin/env python3
"""Extract plain text from a .docx file using only the standard library.

The KB pipeline's extract_pdf.py uses PyMuPDF (PDF only). Source material also
arrives as Word .docx (OSCE skill-station scripts), so this gives the ingestion
path a dependency-free way to pull their text. A .docx is a zip whose
word/document.xml holds the body; we walk paragraphs (incl. table cells) and
join runs, turning tabs into spaces and paragraphs into newlines.

Usage:
    from tools.kb.extract_docx import extract_docx_text
    text = extract_docx_text(Path("script.docx"))

CLI (dump text for one or more files):
    python tools/kb/extract_docx.py "a.docx" "b.docx"
"""
from __future__ import annotations

import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def extract_docx_text(path: str | Path) -> str:
    """Return the document body as text, one line per paragraph/row."""
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml")
    root = ET.fromstring(xml)
    lines: list[str] = []
    body = root.find(f"{_W}body")
    if body is None:
        return ""
    for para in body.iter(f"{_W}p"):
        parts: list[str] = []
        for node in para.iter():
            tag = node.tag
            if tag == f"{_W}t" and node.text:
                parts.append(node.text)
            elif tag == f"{_W}tab":
                parts.append("\t")
            elif tag in (f"{_W}br", f"{_W}cr"):
                parts.append("\n")
        line = "".join(parts).strip()
        if line:
            lines.append(line)
    return "\n".join(lines)


if __name__ == "__main__":
    for arg in sys.argv[1:]:
        p = Path(arg)
        print("=" * 78)
        print(f"FILE: {p.name}")
        print("=" * 78)
        try:
            print(extract_docx_text(p))
        except Exception as exc:  # noqa: BLE001
            print(f"[ERROR] {type(exc).__name__}: {exc}")
        print()
