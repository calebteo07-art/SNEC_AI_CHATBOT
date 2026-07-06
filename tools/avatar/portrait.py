"""Selena 3D portrait — the pure config→prompt and config→hash core (part 3).

The portrait is a soft-3D Iris rendered from a student's saved config. flash-image can't
emit true alpha (asked for transparency it paints a checkerboard), so the image bakes its
OWN background from the `background` axis — which therefore IS part of the look and affects
both the prompt and the cache hash (revised 2026-07-06 from the transparent-over-CSS design).

Pure + registry-derived: `config_to_prompt` and `config_hash` do no I/O and never call
an API. Generation/storage live below; these are their deterministic inputs.
"""
import hashlib
import json

from tools.avatar import generate_sprites
from tools.avatar.parts import AVATAR_AXES, DEFAULT_AVATAR
from tools.shared.gemini_client import MOCK_MODE

# Every axis, background included — the render bakes its own backdrop (no true alpha).
PORTRAIT_AXES: list[str] = list(AVATAR_AXES)

# The invariant style contract — what keeps a generated look recognizably Iris. Mirrors
# the STYLE in generate_sprites.py; kept here so the prompt core is self-contained.
_CONTRACT = (
    "Character: 'Iris', a cute one-eyed mascot — exactly ONE big round glossy eye on a "
    "smooth, rounded, hairless blob-like body (no hair), two tiny stubby arms, friendly. "
    "Soft 3D Pixar/Ghibli style, gentle studio lighting, soft subsurface shading, subtle "
    "contact shadow. Front view, centered, full body, generous margin. Render as a polished "
    "square portrait with the cohesive background described below. "
    "IMPORTANT: no text, no border, and NEVER paint a checkerboard or transparency pattern — "
    "always fill the background with the described scene."
)


def _humanize(id: str) -> str:
    s = "".join(f" {ch}" if ch.isupper() else ch for ch in id).strip().lower()
    return s


_BODY = {
    "porcelain": "a porcelain skin-toned", "light": "a light skin-toned", "warm": "a warm skin-toned",
    "tan": "a tan skin-toned", "brown": "a brown skin-toned", "deep": "a deep brown skin-toned",
    "rich": "a rich dark brown", "ebony": "an ebony",
}
_IRIS = {
    "galaxy": "a swirling galaxy-purple iris full of tiny stars", "darkBrown": "a dark brown iris",
    "rose": "a rosy-pink iris", "gold": "a golden iris",
}
_EYE = {
    "round": "large and round", "wide": "wide and bright", "almond": "a gentle almond shape",
    "sleepy": "soft and sleepy", "upturned": "slightly upturned",
    "sparkle": "round with a happy sparkle", "starry": "round with star-shaped highlights",
}
_MOUTH = {
    "smile": "a calm gentle smile", "grin": "a big happy open grin", "soft": "a soft small smile",
    "open": "a small open 'oh'", "smirk": "a playful smirk", "ooh": "a surprised little 'ooh'",
    "tongue": "a cheeky tongue-out grin",
}
_LASHES = {"natural": "soft natural lashes", "glam": "long glamorous lashes", "cyber": "neon cyber lashes"}
_BLUSH = {
    "rose": "rosy blush", "coral": "coral blush", "peach": "soft peach blush", "plum": "plum blush",
    "berry": "berry blush", "sky": "sky-blue blush", "mint": "minty blush", "gold": "golden blush",
    "grape": "grape blush", "teal": "teal blush", "stars": "tiny star freckles on the cheeks",
    "freckles": "light freckles on the cheeks",
}
_GLASSES = {
    "round": "round glasses", "square": "square glasses", "catEye": "cat-eye glasses",
    "monocle": "a gold monocle", "reading": "reading glasses", "goggles": "swim goggles",
    "heart": "heart-shaped glasses", "visor": "a futuristic visor",
}
_TOPPER = {
    "sprout": "a tiny green leaf sprout on top", "bow": "a cute bow", "cap": "a baseball cap",
    "beanie": "a cozy beanie", "halo": "a glowing halo", "clip": "a little clip", "flower": "a small flower",
    "antenna": "tiny antennae", "crown": "a small gold crown", "horns": "tiny horns", "flame": "a little flame",
}
_ACCESSORY = {
    "headphones": "headphones", "earmuffs": "fuzzy earmuffs", "bandage": "a small bandage",
    "sticker": "a star sticker", "sparkles": "floating sparkles",
}
_OUTFIT = {
    "scarf": "a cozy knitted scarf", "bowtie": "a bowtie", "collar": "a little collar",
    "lanyard": "a staff lanyard", "hoodie": "a hoodie", "labcoat": "a white lab coat",
    "turtleneck": "a turtleneck", "overalls": "denim overalls", "cape": "a flowing cape",
}
_BG = {
    "mist": "a soft neutral misty-grey studio background",
    "blush": "a soft blush-pink background", "sky": "a gentle sky-blue background",
    "mint": "a soft mint-green background", "lilac": "a soft lilac background",
    "sun": "a warm sunny-yellow background", "graphite": "a deep graphite charcoal background",
    "gemini": "a dreamy Gemini-gradient background (lavender into peach)",
    "galaxy": "a deep starry galaxy background", "confetti": "a playful pastel confetti background",
    "sunset": "a warm sunset-gradient background", "ocean": "a calm ocean-blue background",
    "forest": "a soft forest-green background",
}


def _norm(config: dict) -> dict:
    """Fill defaults then apply the config's portrait axes — background/version/extras dropped."""
    out = {k: DEFAULT_AVATAR[k] for k in PORTRAIT_AXES}
    for k in PORTRAIT_AXES:
        if k in config and config[k] is not None:
            out[k] = config[k]
    return out


def config_hash(config: dict) -> str:
    """Stable 16-hex id for a character look (order-, extra-key-, and background-invariant)."""
    norm = _norm(config)
    blob = json.dumps(norm, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


def config_to_prompt(config: dict) -> str:
    """Compose the image prompt for a look. Skips `none` options; bakes in `background`."""
    c = _norm(config)
    lines = [_CONTRACT]
    lines.append(f"Body: {_BODY.get(c['bodyColor'], 'a ' + _humanize(c['bodyColor']) + '-coloured')} body.")
    lines.append(f"Her single eye is {_EYE.get(c['eyeShape'], _humanize(c['eyeShape']))} "
                 f"with {_IRIS.get(c['irisColor'], 'a ' + _humanize(c['irisColor']) + ' iris')}.")
    if c["lashes"] != "none":
        lines.append(f"Lashes: {_LASHES.get(c['lashes'], _humanize(c['lashes']))}.")
    lines.append(f"Expression: {_MOUTH.get(c['mouth'], _humanize(c['mouth']))}.")
    if c["blush"] != "none":
        lines.append(f"Cheeks: {_BLUSH.get(c['blush'], _humanize(c['blush']) + ' blush')}.")
    if c["glasses"] != "none":
        lines.append(f"Wearing {_GLASSES.get(c['glasses'], _humanize(c['glasses']))}.")
    if c["topper"] != "none":
        lines.append(f"On top: {_TOPPER.get(c['topper'], _humanize(c['topper']))}.")
    if c["accessory"] != "none":
        lines.append(f"Extra: {_ACCESSORY.get(c['accessory'], _humanize(c['accessory']))}.")
    if c["outfit"] != "none":
        lines.append(f"Outfit: {_OUTFIT.get(c['outfit'], _humanize(c['outfit']))}.")
    lines.append(f"Background: {_BG.get(c['background'], 'a soft ' + _humanize(c['background']) + ' background')}.")
    return "\n".join(lines)


# ── Generation + storage (Task 2 — the PAID path) ────────────────────────────
# These do real I/O. They are only ever reached on the genuine cache-missed save
# path (Task 3), never in tests: render_portrait refuses to run in MOCK_MODE.


def render_portrait(config: dict, model: str = generate_sprites.MODELS["flash"]) -> bytes:
    """Render the soft-3D Iris image for a look. LIVE + PAID (~1–2¢/image).

    Refuses in MOCK_MODE — we never fabricate art in tests/CI. Builds the prompt from
    the config (background baked in — flash-image has no true alpha) and anchors to
    iris.png via the shared image client. Returns the raw image bytes (JPEG in practice).
    """
    if MOCK_MODE:
        raise RuntimeError(
            "render_portrait needs a live GEMINI_API_KEY; refusing to fabricate art in MOCK_MODE"
        )
    data = generate_sprites.generate_image_bytes(config_to_prompt(config), model=model)
    if not data:
        raise RuntimeError("portrait generation returned no image bytes")
    return data


def _image_kind(data: bytes) -> tuple[str, str]:
    """(extension, content_type) sniffed from magic bytes. flash-image returns JPEG;
    default to PNG for anything unrecognized so we never mislabel the object."""
    if data[:3] == b"\xff\xd8\xff":
        return "jpg", "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp", "image/webp"
    return "png", "image/png"


def store_portrait(config_hash: str, image_bytes: bytes) -> str:
    """Upload a rendered portrait to the public `selena-avatars` bucket, keyed by hash.

    Returns the public URL. The extension + content-type are sniffed from the bytes
    (flash-image actually returns JPEG). Idempotent (upsert), so re-storing is safe.
    """
    ext, ctype = _image_kind(image_bytes)
    from tools.kb import supabase_client
    return supabase_client.upload_avatar(f"{config_hash}.{ext}", image_bytes, content_type=ctype)
