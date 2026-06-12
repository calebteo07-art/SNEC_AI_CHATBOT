"""Generate PHOTOPIC accents via Gemini and rebuild the manifest.

SVG accents come from the text model (constrained output, sanitized
fail-closed); raster accents come from Nano Banana Pro, following the
proposal/gen_images.py precedent.

PAID API — run deliberately:
    python -m tools.media.generate_accents --kinds svg --contexts dashboard cases
    python -m tools.media.generate_accents --kinds svg,raster   # full sweep

Without GEMINI_API_KEY this exits without calling anything.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(PROJECT_ROOT / ".env")

from tools.media.prompts import NAV_CONTEXTS, RASTER_PROMPTS, SVG_PROMPTS  # noqa: E402
from tools.media.sanitize_svg import SvgRejected, sanitize_svg  # noqa: E402
from tools.media import build_manifest  # noqa: E402

ACCENTS_DIR = PROJECT_ROOT / "frontend" / "public" / "media" / "accents"

_FENCE = re.compile(r"```(?:svg|xml)?\s*([\s\S]*?)```", re.IGNORECASE)


def _extract_svg(text: str) -> str:
    m = _FENCE.search(text)
    if m:
        text = m.group(1)
    start = text.find("<svg")
    end = text.rfind("</svg>")
    if start == -1 or end == -1:
        raise SvgRejected("no <svg> document in model output")
    return text[start : end + len("</svg>")].strip()


def generate_svg(contexts: list[str], per_context: int = 1) -> list[Path]:
    from tools.shared.gemini_client import ask  # late import — needs API key

    written: list[Path] = []
    ACCENTS_DIR.mkdir(parents=True, exist_ok=True)
    for ctx in contexts:
        prompt = SVG_PROMPTS.get(ctx)
        if not prompt:
            continue
        for n in range(per_context):
            try:
                # Gemini 3.x spends "thinking" tokens from the same output budget;
                # 8192 starved the SVG body (observed MAX_TOKENS on every context).
                raw = ask(
                    "You are a precision vector illustrator. Reply with exactly one "
                    "standalone <svg> document and nothing else.",
                    [{"role": "user", "content": prompt}],
                    max_tokens=32768,
                    feature="media_accent",
                )
                svg = sanitize_svg(_extract_svg(raw))
            except SvgRejected as exc:
                print(f"  REJECTED {ctx} #{n}: rejected ({exc})")
                continue
            except Exception as exc:  # API/server errors must not kill the sweep
                print(f"  ERROR {ctx} #{n}: {type(exc).__name__}: {str(exc)[:160]}")
                continue
            out = ACCENTS_DIR / f"{ctx}-gen-{n:02d}.svg"
            out.write_text(svg, encoding="utf-8")
            written.append(out)
            print(f"  ok {out.name}")
    return written


def generate_raster(contexts: list[str]) -> list[Path]:
    from google import genai  # late import
    from google.genai import types

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    model = os.getenv("NB_MODEL", "gemini-3-pro-image")
    written: list[Path] = []
    ACCENTS_DIR.mkdir(parents=True, exist_ok=True)
    for ctx in contexts:
        prompt = RASTER_PROMPTS.get(ctx)
        if not prompt:
            continue
        res = client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=types.ImageConfig(aspect_ratio="16:9"),
            ),
        )
        for part in res.candidates[0].content.parts:
            if getattr(part, "inline_data", None):
                out = ACCENTS_DIR / f"{ctx}-photo-00.png"
                out.write_bytes(part.inline_data.data)
                written.append(out)
                print(f"  ok {out.name}")
                break
    return written


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kinds", default="svg", help="comma list: svg,raster")
    parser.add_argument("--contexts", nargs="*", default=NAV_CONTEXTS)
    parser.add_argument("--per-context", type=int, default=1)
    args = parser.parse_args()

    if not os.getenv("GEMINI_API_KEY"):
        print("GEMINI_API_KEY not set — refusing to run (mock mode has nothing to generate).")
        return 1

    kinds = {k.strip() for k in args.kinds.split(",")}
    if "svg" in kinds:
        print("Generating SVG accents…")
        generate_svg(args.contexts, args.per_context)
    if "raster" in kinds:
        print("Generating raster accents (Nano Banana Pro)…")
        generate_raster(args.contexts)

    manifest = build_manifest.build()
    print(f"manifest v{manifest['version']}: {len(manifest['accents'])} accents, {len(manifest['loops'])} loops")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
