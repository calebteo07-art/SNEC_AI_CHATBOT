"""Generate the Flashcards hero CAST — four cute, soft-anime SNEC eye-clinic staff in
SingHealth blue scrubs with orange trim — and split them into four transparent sprites
that drop seamlessly onto the warm-cream flashcards surface.

Two modes (the eye generator tools/media/generate_flashcards_hero.py is untouched):

  # 1) PAID — generate N candidate ROW images (all 4 staff in one frame for a single,
  #    consistent style/scale/lighting), saved as flashcards-cast-cand-NN.png
  python tools/media/generate_flashcards_cast.py generate --count 3

  # 2) FREE — chroma-key the chosen candidate off its flat magenta background and slice
  #    it into 4 alpha-trimmed transparent sprites flashcards-cast-0..3.png, plus a
  #    flashcards-cast-preview.png composited on cream so you can eyeball the result.
  python tools/media/generate_flashcards_cast.py slice --src flashcards-cast-cand-00.png

Why a single row + slice instead of 4 separate generations: one image guarantees the four
characters share identical art style, proportions, scale and lighting. We slice at the
empty background gaps between them (falling back to equal quarters if they touch), then
alpha-trim each sprite so off-centring is harmless.

ASCII-only for the Windows console. Generation needs GEMINI_API_KEY in .env.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(PROJECT_ROOT / ".env")

ACCENTS_DIR = PROJECT_ROOT / "frontend" / "public" / "media" / "accents"
CREAM = (243, 237, 224)  # --flash-cream-1 #f3ede0, for the preview composite only
CHROMA = (255, 0, 255)   # flat magenta backdrop we key out

CAST_PROMPT = (
    "A clean, adorable yet premium SOFT MODERN ANIME illustration (Studio-Ghibli-inspired: "
    "warm soft cel shading, gentle clean line art, friendly expressive faces, naturally and "
    "properly proportioned bodies, NOT chibi, NOT big-headed) of FOUR cheerful Singaporean "
    "eye-clinic healthcare workers standing in a SINGLE HORIZONTAL ROW, evenly spaced with "
    "LARGE empty gaps between each person, every person fully separated and clearly NOT "
    "overlapping or touching the others, all exactly the same height, standing on the same "
    "ground line, shown three-quarter body (head to mid-thigh), facing the viewer with warm "
    "genuine friendly smiles, relaxed welcoming poses, faces fully visible (NO face masks). "
    "ALL FOUR wear IDENTICAL matching medical scrub uniforms: a medium royal-blue short-sleeve "
    "V-neck scrub top with BRIGHT ORANGE trim piping running along the V-neckline and along the "
    "short-sleeve cuffs, with matching medium royal-blue scrub trousers. "
    "From left to right: (1) an East-Asian Chinese MAN with short neat black hair; (2) a Malay "
    "WOMAN wearing a headscarf (tudung) in the EXACT SAME royal-blue colour as the scrubs, and a "
    "plain BLACK long-sleeve fitted compression top worn underneath the scrub top so that her "
    "arms are FULLY covered to the wrists; (3) a South-Asian Indian WOMAN with dark hair tied "
    "back neatly; (4) a Caucasian White MAN with short light-brown hair. Warm, diverse, "
    "inclusive, respectful and professional. "
    "Every character is isolated on a COMPLETELY FLAT, SOLID, UNIFORM, PURE MAGENTA background "
    "(hex ff00ff), perfectly even and evenly lit, with NO floor, NO scenery, NO props, NO cast "
    "shadows on the background and NO gradient anywhere in the background. "
    "Beautiful, polished, charming, high-quality gallery-grade character art. "
    "Absolutely NO text, NO letters, NO numbers, NO words, NO logos, NO brand marks, NO badges, "
    "NO name tags, NO lanyards, NO watermark, NO speech bubbles, NO border and NO frame."
)


# --------------------------------------------------------------------------- generate
def generate(count: int, aspect: str) -> int:
    if not os.getenv("GEMINI_API_KEY"):
        print("GEMINI_API_KEY not set - refusing to run.")
        return 1

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    model = os.getenv("NB_MODEL", "gemini-3-pro-image")
    ACCENTS_DIR.mkdir(parents=True, exist_ok=True)

    print(f"generating {count} x flashcards-cast-cand @ {aspect} ({model})")
    written = 0
    for n in range(count):
        try:
            res = client.models.generate_content(
                model=model,
                contents=CAST_PROMPT,
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                    image_config=types.ImageConfig(aspect_ratio=aspect),
                ),
            )
            saved = False
            for part in res.candidates[0].content.parts:
                if getattr(part, "inline_data", None):
                    out = ACCENTS_DIR / f"flashcards-cast-cand-{n:02d}.png"
                    out.write_bytes(part.inline_data.data)
                    print(f"  ok {out.name} ({len(part.inline_data.data) // 1024} KB)")
                    written += 1
                    saved = True
                    break
            if not saved:
                print(f"  WARN candidate {n}: no image part returned")
        except Exception as exc:  # noqa: BLE001 - one bad call shouldn't kill the run
            print(f"  ERROR candidate {n}: {type(exc).__name__}: {str(exc)[:160]}")

    print(f"done: {written}/{count} candidates -> {ACCENTS_DIR}")
    print("Inspect, then: python tools/media/generate_flashcards_cast.py slice --src <file>")
    return 0 if written else 1


# ------------------------------------------------------------------------------ slice
def _chroma_key(img):
    """Return an RGBA copy with the flat magenta backdrop turned transparent, the fringe
    ring eroded away, and magenta spill suppressed on the remaining soft edge."""
    from PIL import Image, ImageFilter

    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    cr, cg, cb = CHROMA
    t0, t1 = 90.0, 165.0  # full-bg distance / full-fg distance (feather between)

    # 1) distance-based alpha matte
    alpha = Image.new("L", (w, h), 0)
    ap = alpha.load()
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            dist = ((r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2) ** 0.5
            if dist <= t0:
                ap[x, y] = 0
            elif dist >= t1:
                ap[x, y] = 255
            else:
                ap[x, y] = int(255 * (dist - t0) / (t1 - t0))

    # 2) erode the matte by ~1px to bite off the anti-aliased fringe ring, then soften
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    img.putalpha(alpha)

    # 3) de-spill: on the soft edge only (0 < a < 255), kill any leftover magenta cast
    #    by pulling R and B down toward G. Fully-opaque interior (incl. skin) is untouched.
    px = img.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if 0 < a < 255 and r > g and b > g:
                r = g + (r - g) // 4
                b = g + (b - g) // 4
                px[x, y] = (r, g, b, a)
    return img


def _split_columns(img, n=4):
    """Find n character blobs by their empty-background gaps; return n (left,right)
    column spans. Falls back to equal quarters if fewer than n-1 gaps are found."""
    w, h = img.size
    px = img.load()
    col_alpha = [0] * w
    for x in range(w):
        s = 0
        for y in range(h):
            s += px[x, y][3]
        col_alpha[x] = s
    peak = max(col_alpha) or 1
    thresh = peak * 0.02
    empty = [a <= thresh for a in col_alpha]

    # runs of empty columns
    runs = []
    x = 0
    while x < w:
        if empty[x]:
            start = x
            while x < w and empty[x]:
                x += 1
            runs.append((start, x))  # [start, end)
        else:
            x += 1
    # internal gaps only (drop leading/trailing margins touching the frame edge)
    internal = [(s, e) for (s, e) in runs if s > 0 and e < w]
    internal.sort(key=lambda r: r[1] - r[0], reverse=True)
    cuts = sorted((s + e) // 2 for (s, e) in internal[: n - 1])

    if len(cuts) != n - 1:
        print(f"  NOTE only {len(cuts)} gap(s) found; falling back to equal quarters")
        cuts = [round(w * i / n) for i in range(1, n)]

    bounds = [0, *cuts, w]
    return [(bounds[i], bounds[i + 1]) for i in range(n)]


def _alpha_trim(crop, pad=6):
    bbox = crop.getbbox()  # bbox of non-zero (incl. alpha) region
    if not bbox:
        return crop
    l, t, r, b = bbox
    l = max(0, l - pad); t = max(0, t - pad)
    r = min(crop.width, r + pad); b = min(crop.height, b + pad)
    return crop.crop((l, t, r, b))


def slice_cast(src_name: str) -> int:
    from PIL import Image

    src = ACCENTS_DIR / src_name
    if not src.exists():
        print(f"source not found: {src}")
        return 1

    print(f"keying + slicing {src.name}")
    keyed = _chroma_key(Image.open(src))
    spans = _split_columns(keyed, 4)

    preview_cells = []
    for i, (l, r) in enumerate(spans):
        sprite = _alpha_trim(keyed.crop((l, 0, r, keyed.height)))
        out = ACCENTS_DIR / f"flashcards-cast-{i}.png"
        sprite.save(out)
        print(f"  ok {out.name}  span x[{l}:{r}]  -> {sprite.size}")
        preview_cells.append(sprite)

    # contact-sheet preview composited on cream so the blend is visible at a glance
    gap = 40
    ph = max(c.height for c in preview_cells)
    pw = sum(c.width for c in preview_cells) + gap * (len(preview_cells) + 1)
    preview = Image.new("RGB", (pw, ph + gap * 2), CREAM)
    x = gap
    for c in preview_cells:
        preview.paste(c, (x, gap + (ph - c.height)), c)
        x += c.width + gap
    pv = ACCENTS_DIR / "flashcards-cast-preview.png"
    preview.save(pv)
    print(f"  ok {pv.name} (composited on cream {CREAM})")
    print("done.")
    return 0


# ------------------------------------------------------------------------------- main
def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="mode", required=True)

    g = sub.add_parser("generate", help="PAID: generate candidate row images")
    g.add_argument("--count", type=int, default=3, help="candidates to generate")
    g.add_argument("--aspect", default="16:9", help="aspect ratio for the row")

    s = sub.add_parser("slice", help="FREE: key + split a chosen candidate into 4 sprites")
    s.add_argument("--src", required=True, help="candidate filename in the accents dir")

    args = parser.parse_args()
    if args.mode == "generate":
        return generate(args.count, args.aspect)
    return slice_cast(args.src)


if __name__ == "__main__":
    raise SystemExit(main())
