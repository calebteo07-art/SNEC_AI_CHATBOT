#!/usr/bin/env python3
"""PDF text and image extractor using pymupdf (fitz).

Extracts all readable text and all embedded images from a PDF.
Images smaller than 50x50 px are skipped (logos, decorative elements, watermarks).

Usage:
    from tools.kb.extract_pdf import extract_text_by_page, extract_images_by_page
    pages = extract_text_by_page(Path("glaucoma.pdf"))
    images = extract_images_by_page(Path("glaucoma.pdf"), output_dir=Path(".tmp/images/glaucoma"))

Self-test:
    python tools/kb/extract_pdf.py <path_to_any.pdf>
"""

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import fitz  # pymupdf

MIN_IMAGE_DIM = 50  # skip images smaller than this in either dimension


def extract_text_by_page(pdf_path: Path) -> list[dict]:
    """Extract plain text from each page.

    Returns:
        [{page: int (0-based), text: str}, ...]
    """
    doc = fitz.open(str(pdf_path))
    pages = []
    for page_num in range(len(doc)):
        text = doc[page_num].get_text()
        pages.append({"page": page_num, "text": text})
    doc.close()
    return pages


def extract_full_text(pdf_path: Path) -> str:
    """Return all text from the PDF joined by newlines between pages."""
    pages = extract_text_by_page(pdf_path)
    return "\n\n".join(p["text"] for p in pages if p["text"].strip())


def extract_images_by_page(pdf_path: Path, output_dir: Path) -> list[dict]:
    """Extract all embedded images from the PDF.

    Saves each image as a PNG to output_dir. Skips images smaller than
    MIN_IMAGE_DIM x MIN_IMAGE_DIM (logos, watermarks).

    Returns:
        [{page: int, index: int, path: Path, width: int, height: int}, ...]
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(str(pdf_path))
    extracted = []
    seen_xrefs: set[int] = set()

    for page_num in range(len(doc)):
        page = doc[page_num]
        image_list = page.get_images(full=True)
        for img_idx, img_ref in enumerate(image_list):
            xref = img_ref[0]
            if xref in seen_xrefs:
                continue
            seen_xrefs.add(xref)

            try:
                base_image = doc.extract_image(xref)
            except Exception:
                continue

            width = base_image.get("width", 0)
            height = base_image.get("height", 0)
            if width < MIN_IMAGE_DIM or height < MIN_IMAGE_DIM:
                continue

            img_bytes = base_image["image"]
            # Always save as PNG for consistency
            img_filename = f"page{page_num:04d}_img{img_idx:04d}.png"
            img_path = output_dir / img_filename

            if base_image["ext"].lower() == "png":
                img_path.write_bytes(img_bytes)
            else:
                # Convert non-PNG formats via fitz pixmap
                try:
                    pixmap = fitz.Pixmap(img_bytes)
                    if pixmap.n > 4:
                        pixmap = fitz.Pixmap(fitz.csRGB, pixmap)
                    pixmap.save(str(img_path))
                except Exception:
                    img_path.write_bytes(img_bytes)

            extracted.append({
                "page": page_num,
                "index": img_idx,
                "path": img_path,
                "width": width,
                "height": height,
            })

    doc.close()
    return extracted


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python tools/kb/extract_pdf.py <path_to.pdf>")
        sys.exit(1)

    pdf_path = Path(sys.argv[1])
    if not pdf_path.exists():
        print(f"File not found: {pdf_path}")
        sys.exit(1)

    print(f"Extracting text from: {pdf_path.name}")
    pages = extract_text_by_page(pdf_path)
    total_chars = sum(len(p["text"]) for p in pages)
    print(f"  Pages: {len(pages)}, Total chars: {total_chars:,}")
    if pages:
        preview = pages[0]["text"][:200].replace("\n", " ")
        print(f"  Page 0 preview: {preview!r}")

    out_dir = PROJECT_ROOT / ".tmp" / "extract_test" / pdf_path.stem
    print(f"\nExtracting images to: {out_dir}")
    images = extract_images_by_page(pdf_path, out_dir)
    print(f"  Images found: {len(images)}")
    for img in images[:3]:
        print(f"    Page {img['page']}: {img['width']}x{img['height']}px -> {img['path'].name}")

    print("\n[PASS] extract_pdf.py completed.")
    sys.exit(0)
