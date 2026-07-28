#!/usr/bin/env python3
"""Composited-Eyecon REAL layer art — the paid, go-ahead-gated Phase 2 pipeline.

Replaces the keyless placeholder layers (`generate_placeholder_layers.py`) with
Nano-Banana art that matches the layer contract in
`frontend/src/aurora/avatar/layers.ts`.

Phase-0 spike verdict (see docs/superpowers/specs, .tmp/eyecon-spike*) — how this
pipeline was designed against the model's real behaviour:
  • Standalone-rendered props look pasted + mis-scaled → REJECTED.
  • In-context render (the eyeless BASE passed as the reference image, prompt
    "add ONLY <feature>, change nothing else") keeps the body registered and the
    prop correctly proportioned + on-brand → USED.
  • flash-image is not a pixel-stable editor, so a naive luma-diff leaves body-edge
    ghosts. Isolation therefore uses SILHOUETTE-DELTA + a per-axis REGION:
      - prop axes (topper/accessory/outfit): keep comp pixels that are OUTSIDE the
        base silhouette (prop extends beyond the body) OR a strong colour change
        OVER the body, within the axis region.
      - eyeShape: region-DISC fill (keeps the white sclera so a body tint can't
        bleed through) + a derived iris-region mask for the iris colour tint.

SAFETY / COST DISCIPLINE (only ever runs when a human invokes it):
  python tools/avatar/generate_layers.py --estimate        # prompts + count. NO calls.
  python tools/avatar/generate_layers.py --base            # 1 paid render (the base).
  python tools/avatar/generate_layers.py --only topper:crown,eyeShape:starry   # subset (paid)
  python tools/avatar/generate_layers.py --axis topper     # one whole axis (paid)
  python tools/avatar/generate_layers.py --generate        # full batch (~70 paid)
  python tools/avatar/generate_layers.py --install         # copy .tmp art → frontend/public/avatar
Refuses the live path in MOCK_MODE. Output → .tmp/eyecon-layers/ (gitignored). Nothing
here auto-commits or installs without --install.
"""
from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from PIL import Image, ImageChops, ImageDraw, ImageFilter  # noqa: E402

from tools.avatar.parts import AVATAR_AXES  # noqa: E402
from tools.avatar.portrait import phrase_for  # noqa: E402
from tools.shared.gemini_client import MOCK_MODE, _API_KEYS  # noqa: E402
from tools.shared.keying import BG_KEY, despill_green, key_out, kill_green_residue, normalize_512  # noqa: E402

OUT_DIR = PROJECT_ROOT / ".tmp" / "eyecon-layers"
IRIS_REF = PROJECT_ROOT / "frontend" / "public" / "brand" / "iris.png"
INSTALL_DIR = PROJECT_ROOT / "frontend" / "public" / "avatar"
MODEL = "gemini-3.1-flash-image"
CANVAS = 512
_IMAGE_TIMEOUT_MS = 240_000

# Axes that need rendered overlay art (bodyColor/irisColor are CSS tints; background is CSS).
ART_AXES = ["eyeShape", "topper", "accessory", "outfit"]

CHROMA = ("flat uniform solid chroma-green (#00B140) background, no gradient, no scene, "
          "no text, no border, no shadow on the backdrop")

BASE_PROMPT = (
    "Character 'Iris', a cute one-eyed mascot, but render her BODY ONLY with NO eye. "
    "A smooth, rounded, hairless pale off-white / very light neutral blob body (almost white "
    "so it can be colour-tinted later), two tiny stubby arms, a small gentle smile, a subtle "
    "soft contact shadow. Where her single eye would be, leave SMOOTH BLANK skin — absolutely "
    "NO eye, no iris, no eyehole. Soft 3D Pixar/Ghibli style, front view, centered, full body, "
    "generous margin. " + CHROMA
)

_PRESERVE = (
    "Redraw this EXACT character IDENTICALLY — same pose, same size, same position, same "
    "proportions, same lighting, same pale off-white body, same tiny arms, same smile. Do NOT "
    "move, resize, or restyle the body. "
)

# Per-axis: how the added feature should be placed (goes into the prompt).
_PLACEMENT = {
    "topper": "resting on top of / floating just above her head like a hat or headpiece",
    "accessory": "worn or held naturally as an accessory",
    "outfit": "worn on her body as an outfit/garment",
}

# Outfits hug the body and often share its pale tone, so colour-diff isolation fails
# (mottled holes on white coats). Instead we render the body a flat KEYABLE MAGENTA
# while it wears the garment, then key the magenta body out — leaving only the garment
# cleanly, in its registered position. (Phase-0 verified on labcoat + astronaut.)
MAGENTA = "#FF00E5"
_PRESERVE_MAGENTA = (
    "Redraw this character's SHAPE IDENTICALLY — same pose, size, position, proportions, "
    "tiny arms, smile — BUT make her whole body/skin a flat solid bright magenta (#FF00E5), "
    "no shading variation on the body. "
)

# Guards against the model drawing a second figure / a scene, and against neckwear being
# rendered across the (eyeless) face midline like a blindfold.
_ONE_ONLY = ("Render EXACTLY ONE single character — no duplicate, no second smaller figure, no "
             "extra limbs, no ground plane, no scene. ")
_OUTFIT_PLACEMENT = ("Place any scarf / collar / tie / bow-tie / lanyard / neckwear LOW at the very "
                     "BASE of her body (her neck is at the bottom), NEVER across her middle and "
                     "NEVER over her face. A cape or cloak drapes DOWN BEHIND her with only its "
                     "edges peeking at the sides — it must not cover her front. ")


def _region_rect(y0: int, y1: int) -> Image.Image:
    m = Image.new("L", (CANVAS, CANVAS), 0)
    ImageDraw.Draw(m).rectangle([0, y0, CANVAS, y1], fill=255)
    return m


def _region_full() -> Image.Image:
    return Image.new("L", (CANVAS, CANVAS), 255)


# Per-axis isolation region (in the 512² registration space). Toppers sit up top;
# outfits hug the lower body; accessories can be anywhere.
def _axis_region(axis: str) -> Image.Image:
    if axis == "topper":
        m = _region_rect(0, 240)
    elif axis == "outfit":
        m = _region_rect(205, CANVAS)
    else:
        return _region_full()  # accessory
    return m.filter(ImageFilter.GaussianBlur(12))  # soft boundary — no hard rectangular cut


EYE_DISC = (256, 222, 122)  # cx, cy, r for the eyeShape region-fill + iris search


# ── Pure image ops (unit-tested in tests/avatar/test_layer_isolate.py) ──────────

def maxchan_diff(a: Image.Image, b: Image.Image) -> Image.Image:
    """Per-pixel max abs channel difference of two RGB(A) images → an L image."""
    d = ImageChops.difference(a.convert("RGB"), b.convert("RGB")).split()
    return ImageChops.lighter(ImageChops.lighter(d[0], d[1]), d[2])


_CHROMA_RGB = (0, 177, 64)  # #00B140


def _kill_chroma(img: Image.Image, tol: int = 60) -> Image.Image:
    """Zero alpha on residual chroma-green pixels (keying leftovers / enclosed pockets the
    corner-flood missed, then lit up by colour-diff as green speckle). Chroma green has
    red≈0, so natural prop greens (sprout, leaf) — whose red channel is well above `tol` —
    are safe."""
    img = img.convert("RGBA")
    px = img.load()
    cr, cg, cb = _CHROMA_RGB
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a and abs(r - cr) <= tol and abs(g - cg) <= tol and abs(b - cb) <= tol:
                px[x, y] = (r, g, b, 0)
    return img


def isolate_prop(base: Image.Image, comp: Image.Image, region: Image.Image,
                 color_thresh: int = 44) -> Image.Image:
    """Isolate a prop added over `base`: keep comp pixels that are OUTSIDE the base
    silhouette (prop extends beyond the body) OR differ strongly in colour (prop drawn
    over the body), restricted to `region`. Morphologically closed then de-rimmed so a
    1px registration wobble at the silhouette doesn't leak a ghost outline."""
    base = base.convert("RGBA")
    comp = comp.convert("RGBA")
    comp_a = comp.getchannel("A")
    opaque = comp_a.point(lambda v: 255 if v > 40 else 0)
    outside = base.getchannel("A").point(lambda v: 255 if v < 40 else 0)
    a_mask = ImageChops.multiply(opaque, outside)
    cdiff = maxchan_diff(base, comp).point(lambda v: 255 if v > color_thresh else 0)
    b_mask = ImageChops.multiply(opaque, cdiff)
    m = ImageChops.lighter(a_mask, b_mask)
    m = ImageChops.multiply(m, region)
    m = m.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    m = m.filter(ImageFilter.GaussianBlur(0.6))
    out = comp.copy()
    out.putalpha(ImageChops.multiply(comp_a, m))
    return _kill_chroma(out)


def _disc_mask(cx: int, cy: int, r: int, feather: float = 4.0) -> Image.Image:
    m = Image.new("L", (CANVAS, CANVAS), 0)
    ImageDraw.Draw(m).ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    return m.filter(ImageFilter.GaussianBlur(feather)) if feather else m


def strip_magenta_body(registered: Image.Image) -> Image.Image:
    """Remove the flat-magenta body from an already-green-keyed, normalized render,
    leaving only the garment in its registered position. Corner-flood clears magenta
    connected to the transparent margin; a per-pixel pass clears magenta enclosed by
    the garment. Edge despill neutralises the magenta rim on the garment."""
    img = key_out(registered.convert("RGBA"), MAGENTA, tol=80)
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and r > 140 and b > 90 and (r - g) > 60 and (b - g) > 10:  # strongly magenta
                px[x, y] = (r, g, b, 0)
    # soften any residual magenta rim: pull red/blue down toward green on edge pixels
    rim = img.getchannel("A").point(lambda v: 255 if v == 0 else 0).filter(ImageFilter.MaxFilter(5))
    rm = rim.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and rm[x, y] and r > g and b > g and (r - g) > 24:
                px[x, y] = (min(r, g + 12), g, min(b, g + 12), a)
    return img


def _eye_bbox(comp: Image.Image, base: Image.Image | None = None,
             search=EYE_DISC) -> tuple[int, int, int]:
    """Locate the WHOLE eyeball (not just its dark pupil) so the disc keeps the full
    glossy eye — light iris and pale sclera included. With `base`, the eye is where the
    render DIFFERS from the eyeless body (robust even when the iris is light gray); with
    no base (unit tests) the opaque region inside the search window stands in. The signal
    is denoised (erode 1px, then close) so render wobble can't inflate the box. Falls back
    to the default `search` disc when too little signal is found."""
    cx, cy, r = search
    comp = comp.convert("RGBA")
    win = _disc_mask(cx, cy, r, feather=0)
    if base is not None:
        sig = maxchan_diff(base, comp).point(lambda v: 255 if v > 40 else 0)
        sig = ImageChops.multiply(sig, comp.getchannel("A").point(lambda v: 255 if v > 40 else 0))
    else:
        sig = comp.getchannel("A").point(lambda v: 255 if v > 40 else 0)
    sig = ImageChops.multiply(sig, win).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(9))
    bb = sig.getbbox()
    if not bb:
        return search
    ecx, ecy = (bb[0] + bb[2]) // 2, (bb[1] + bb[3]) // 2
    rad = int(0.5 * max(bb[2] - bb[0], bb[3] - bb[1]) * 1.04)
    return (ecx, ecy, max(78, min(rad, 150)))


def isolate_eye(comp: Image.Image, base: Image.Image | None = None, disc=None) -> Image.Image:
    """Region-disc fill fitted to the whole eyeball: keep the entire eye (incl. light iris
    + white sclera) so a body-colour tint can't show through it, and so a light iris isn't
    clipped down to its pupil. Feathered disc edge blends into the face."""
    comp = comp.convert("RGBA")
    cx, cy, r = disc or _eye_bbox(comp, base)
    m = _disc_mask(cx, cy, r)
    out = comp.copy()
    out.putalpha(ImageChops.multiply(comp.getchannel("A"), m))
    return _kill_chroma(out)


def iris_mask_from_eye(eye_overlay: Image.Image, disc=EYE_DISC) -> Image.Image:
    """Derive the iris tint mask: a disc centred on the darkest blob (pupil/iris) inside
    the eye region. Returned as an opaque-white-on-transparent RGBA (matches the
    <id>.iris.webp contract). Falls back to the eye-disc centre if nothing dark found."""
    eye = eye_overlay.convert("RGBA")
    cx, cy, r = disc
    gray = eye.convert("L")
    px = gray.load()
    ax = eye.getchannel("A").load()
    xs, ys, n = 0, 0, 0
    for y in range(cy - r, cy + r, 2):
        for x in range(cx - r, cx + r, 2):
            if 0 <= x < CANVAS and 0 <= y < CANVAS and ax[x, y] > 60 and px[x, y] < 90:
                xs += x; ys += y; n += 1
    icx, icy = (xs // n, ys // n) if n else (cx, cy)
    out = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    disc_a = _disc_mask(icx, icy, 48, feather=2.0)
    solid = Image.new("RGBA", (CANVAS, CANVAS), (255, 255, 255, 255))
    out.paste(solid, (0, 0), disc_a)
    return out


# ── Paid generation ─────────────────────────────────────────────────────────

def _client():
    from google import genai
    from google.genai import types
    return genai.Client(api_key=_API_KEYS[0], http_options=types.HttpOptions(timeout=_IMAGE_TIMEOUT_MS))


def _render(prompt: str, reference: bytes | None) -> bytes | None:
    """One paid render. `reference` bytes (PNG) are passed as an editing anchor; None
    renders from prompt alone. Retries transient 5xx/deadline."""
    from google.genai import types
    client = _client()
    contents: list = [prompt]
    if reference is not None:
        contents.append(types.Part.from_bytes(data=reference, mime_type="image/png"))
    cfg = types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"])
    last = ""
    for attempt in range(3):
        try:
            resp = client.models.generate_content(model=MODEL, contents=contents, config=cfg)
        except Exception as e:  # noqa: BLE001
            last = f"{type(e).__name__}: {str(e)[:160]}"
            if attempt < 2 and any(s in str(e) for s in ("504", "503", "DEADLINE", "UNAVAILABLE")):
                print(f"    transient ({last}) — retry"); continue
            print(f"    FAILED: {last}"); return None
        if not resp.candidates:
            print("    no candidates"); return None
        for part in resp.candidates[0].content.parts:
            inline = getattr(part, "inline_data", None)
            if inline is not None and getattr(inline, "data", None):
                return inline.data
        txt = "".join(getattr(p, "text", "") or "" for p in resp.candidates[0].content.parts)
        print(f"    no image part. text={txt[:120]!r}"); return None
    return None


def _keyed(data: bytes) -> Image.Image:
    return despill_green(key_out(Image.open(io.BytesIO(data)).convert("RGBA"), BG_KEY))


def base_prompt() -> str:
    return BASE_PROMPT


def overlay_prompt(axis: str, option_id: str) -> str:
    phrase = phrase_for(axis, option_id) or option_id
    if axis == "eyeShape":
        return (_PRESERVE + "ADD ONLY her single big round glossy CARTOON eye in the centre of "
                f"her blank face: the eye is {phrase}, with a neutral LIGHT-GRAY iris (desaturated "
                "so it can be recoloured) and a round pupil with a soft catchlight. Keep it cute "
                "and stylised, NOT a realistic human eyeball. Change nothing else. " + _ONE_ONLY + CHROMA)
    if axis == "outfit":
        return (_PRESERVE_MAGENTA + f"She is wearing {phrase} on her magenta body. Render the "
                "garment in its natural colours and full detail. " + _OUTFIT_PLACEMENT + _ONE_ONLY + CHROMA)
    return (_PRESERVE + f"ADD ONLY {phrase}, {_PLACEMENT[axis]}. Change nothing else about the "
            "body. Keep the prop a clean separate object; do NOT let its colour, glow, or "
            "reflection wash onto her head or body. " + _ONE_ONLY + CHROMA)


def _base_path() -> Path:
    return OUT_DIR / "base" / "body.webp"


def get_or_make_base(rebase: bool = False) -> tuple[Image.Image, bytes]:
    """Return (normalized base image, reference PNG bytes). Cached in .tmp so every
    overlay renders against the SAME base for consistency."""
    ref_path = OUT_DIR / "base" / "_ref.png"
    bp = _base_path()
    if bp.exists() and ref_path.exists() and not rebase:
        return Image.open(bp).convert("RGBA"), ref_path.read_bytes()
    print("  [base] rendering eyeless body …")
    data = _render(base_prompt(), reference=IRIS_REF.read_bytes())
    if not data:
        raise SystemExit("base render failed")
    base = normalize_512(kill_green_residue(_kill_chroma(_keyed(data))))  # drop chroma residue + shadow-green smudge
    bp.parent.mkdir(parents=True, exist_ok=True)
    base.save(bp, "WEBP", quality=92)
    # reference = base on white, square, for the editing anchor
    ref = Image.new("RGBA", (1024, 1024), (255, 255, 255, 255))
    ref.alpha_composite(normalize_512(base, canvas=1024, margin=0.08))
    ref.convert("RGB").save(ref_path)
    print(f"  [base] saved {bp}")
    return base, ref_path.read_bytes()


# Props with ZERO legitimate green: a global colour threshold can't tell chroma residue
# from a genuinely-green prop (dino, sprout, crown gems all carry low-red green), but for
# these specific ids ANY green-dominant pixel is keying residue, so we strip it whole-frame
# (specks/arcs/slivers the conservative bottom-band pass can't reach). Verified no-green art.
_GREEN_IS_RESIDUE = {"fairyDust", "magicWand", "petSnail", "tuxedo", "knightArmor", "scarf"}


def _isolate_and_save(axis: str, option_id: str, comp: Image.Image, base: Image.Image) -> None:
    """Run the axis-appropriate isolation on a green-keyed, registered full render `comp`,
    and write overlay/<axis>/<id>.webp (+ .iris.webp for eyeShape) + a QA preview. Shared by
    the paid render path (make_overlay) and the free reprocess path (reprocess_overlay)."""
    axis_dir = OUT_DIR / "overlay" / axis
    axis_dir.mkdir(parents=True, exist_ok=True)
    if axis == "eyeShape":
        overlay = isolate_eye(comp, base)
        overlay.save(axis_dir / f"{option_id}.webp", "WEBP", quality=92)
        iris_mask_from_eye(overlay).save(axis_dir / f"{option_id}.iris.webp", "WEBP", quality=92)
    elif axis == "outfit":
        overlay = strip_magenta_body(comp)  # comp = magenta-bodied character; strip the body
        if option_id in _GREEN_IS_RESIDUE:
            overlay = kill_green_residue(overlay, r_max=256)  # no-green outfit → any green is residue
        overlay.save(axis_dir / f"{option_id}.webp", "WEBP", quality=92)
    else:
        overlay = isolate_prop(base, comp, _axis_region(axis))
        # No-green props: strip every green-dominant pixel (residue specks/arcs anywhere).
        # Otherwise strip only the bottom contact-shadow band, so a prop's legit green
        # feature higher up (wand sparkle, crown gem) survives untouched.
        overlay = (kill_green_residue(overlay, r_max=256) if option_id in _GREEN_IS_RESIDUE
                   else kill_green_residue(overlay, y_from=430))
        overlay.save(axis_dir / f"{option_id}.webp", "WEBP", quality=92)
    prev = Image.new("RGBA", (CANVAS, CANVAS), (234, 236, 239, 255))
    prev.alpha_composite(base)
    prev.alpha_composite(overlay)
    prev.convert("RGB").save(axis_dir / f"{option_id}_preview.png")


def make_overlay(axis: str, option_id: str, base: Image.Image, ref: bytes) -> bool:
    """Render + isolate one overlay; write overlay/<axis>/<id>.webp (+ iris mask for
    eyeShape) under OUT_DIR. Also writes a *_preview.png recompose for QA. Returns ok."""
    print(f"  [{axis}/{option_id}] render …")
    data = _render(overlay_prompt(axis, option_id), reference=ref)
    if not data:
        print(f"  [{axis}/{option_id}] NO IMAGE"); return False
    comp = normalize_512(_keyed(data))  # green-keyed + registered to base framing
    (OUT_DIR / "overlay" / axis).mkdir(parents=True, exist_ok=True)
    comp.save(OUT_DIR / "overlay" / axis / f"{option_id}.full.png", "PNG")  # keep raw render for QA/reprocess
    _isolate_and_save(axis, option_id, comp, base)
    print(f"  [{axis}/{option_id}] ok")
    return True


def reprocess_overlay(axis: str, option_id: str, base: Image.Image) -> bool:
    """Re-run isolation on the saved full render — NO API call. Returns False if the
    .full.png is missing (item was never rendered)."""
    full = OUT_DIR / "overlay" / axis / f"{option_id}.full.png"
    if not full.exists():
        print(f"  [{axis}/{option_id}] no .full.png — skip"); return False
    _isolate_and_save(axis, option_id, Image.open(full).convert("RGBA"), base)
    print(f"  [{axis}/{option_id}] reprocessed")
    return True


def _jobs(axes: list[str], only: set[str]) -> list[tuple[str, str]]:
    jobs: list[tuple[str, str]] = []
    for axis in axes:
        for oid in AVATAR_AXES[axis]:
            if oid == "none":
                continue
            if only and f"{axis}:{oid}" not in only and axis not in only:
                continue
            jobs.append((axis, oid))
    return jobs


def run_estimate(jobs: list[tuple[str, str]]) -> None:
    print(f"ESTIMATE — 1 base + {len(jobs)} overlay render(s) via {MODEL} = "
          f"{1 + len(jobs)} paid images.")
    print("Nano-Banana bills per generated image (a few cents each); confirm pricing in the "
          "Google AI Studio dashboard before the full batch.\n")
    print("BASE:\n   ", base_prompt()[:160], "…\n")
    for axis, oid in jobs[:6]:
        print(f"— {axis}/{oid}:\n    {overlay_prompt(axis, oid)[:180]} …\n")
    if len(jobs) > 6:
        print(f"… and {len(jobs) - 6} more overlays.")
    counts = {a: sum(1 for x, _ in jobs if x == a) for a in ART_AXES}
    print("\nper-axis overlay counts:", {k: v for k, v in counts.items() if v})


def run_install() -> int:
    """Copy the isolated .webp layers from .tmp → frontend/public/avatar, replacing
    placeholders. Only copies base/body.webp + overlay/**/<id>.webp (+ .iris.webp);
    skips the *_preview/*.full QA scratch."""
    import shutil
    src_base = _base_path()
    if not src_base.exists():
        print("no base at", src_base, "— run --base/--generate first"); return 2
    (INSTALL_DIR / "base").mkdir(parents=True, exist_ok=True)
    shutil.copy2(src_base, INSTALL_DIR / "base" / "body.webp")
    n = 1
    for axis in ART_AXES:
        sdir = OUT_DIR / "overlay" / axis
        if not sdir.exists():
            continue
        ddir = INSTALL_DIR / "overlay" / axis
        ddir.mkdir(parents=True, exist_ok=True)
        for f in sdir.glob("*.webp"):
            shutil.copy2(f, ddir / f.name)
            n += 1
    print(f"installed {n} files -> {INSTALL_DIR}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate real composited-Eyecon layer art (paid).")
    ap.add_argument("--estimate", action="store_true", help="Print prompts + count. No API calls.")
    ap.add_argument("--base", action="store_true", help="Render just the base body (1 paid).")
    ap.add_argument("--rebase", action="store_true", help="Force re-render the base.")
    ap.add_argument("--axis", default="", help="Generate one whole axis (topper|accessory|outfit|eyeShape).")
    ap.add_argument("--only", default="", help="Comma list of axis:id (or bare axis) to generate.")
    ap.add_argument("--generate", action="store_true", help="Full batch (all art axes; paid).")
    ap.add_argument("--reprocess", action="store_true", help="Re-isolate saved .full.png renders (no API calls).")
    ap.add_argument("--install", action="store_true", help="Copy .tmp layers → frontend/public/avatar.")
    args = ap.parse_args()

    if args.install:
        return run_install()

    axes = [args.axis] if args.axis else ART_AXES
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    jobs = _jobs(axes, only)

    if args.reprocess:
        base = Image.open(_base_path()).convert("RGBA")
        ok = sum(1 for a, o in jobs if reprocess_overlay(a, o, base))
        print(f"\nReprocessed {ok}/{len(jobs)} overlays (no API calls).")
        return 0

    if args.estimate or not (args.base or args.generate or args.axis or args.only):
        run_estimate(jobs)
        return 0

    if MOCK_MODE:
        print("ERROR: no GEMINI_API_KEY (MOCK_MODE) — cannot generate real art.", file=sys.stderr)
        return 2

    base, ref = get_or_make_base(rebase=args.rebase)
    if args.base and not (args.generate or args.axis or args.only):
        return 0

    ok = 0
    for axis, oid in jobs:
        try:
            if make_overlay(axis, oid, base, ref):
                ok += 1
        except Exception as e:  # noqa: BLE001
            print(f"  [{axis}/{oid}] EXC {type(e).__name__}: {str(e)[:160]}")
    print(f"\nDone: {ok}/{len(jobs)} overlays. Review previews in {OUT_DIR}/overlay/**, then --install.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
