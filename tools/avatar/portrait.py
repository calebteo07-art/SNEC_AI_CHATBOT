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
    "Character: 'Iris', an adorable one-eyed mascot — exactly ONE big round glossy eye on a "
    "smooth, rounded, hairless blob-like body (no hair), two tiny stubby arms. "
    "Render as a PREMIUM, over-the-top COLLECTIBLE character portrait: bold soft-3D Pixar "
    "style, ultra-glossy, vibrant saturated colours, dramatic cinematic rim-lighting, a dreamy "
    "glow with floating sparkles, rich depth and a wow-factor — genuinely eye-catching and "
    "delightful, like a legendary game-reward icon. Front view, centered, full body, generous "
    "margin, polished square, with the cohesive background described below. "
    "IMPORTANT: no text, no border, and NEVER paint a checkerboard or transparency pattern — "
    "always fill the background with the described scene."
)


def _humanize(id: str) -> str:
    s = "".join(f" {ch}" if ch.isupper() else ch for ch in id).strip().lower()
    return s


# Every phrasing is deliberately over-the-top + eye-catching (user, 2026-07-06): the render
# should feel like a premium collectible, not a flat sticker. Marquee options go maximalist.
_BODY = {
    "porcelain": "a glossy porcelain", "light": "a soft glowing light-skinned", "warm": "a warm sun-kissed",
    "tan": "a golden tan", "brown": "a rich glossy brown", "deep": "a deep glowing brown",
    "rich": "a gorgeous rich dark-brown", "ebony": "a radiant ebony",
}
_IRIS = {
    "galaxy": "a mesmerizing swirling galaxy iris exploding with tiny stars, glowing nebula wisps and cosmic sparkles",
    "darkBrown": "a deep glossy dark-brown iris with a bright starry catchlight",
    "rose": "a luminous rosy-pink iris that softly glows", "gold": "a radiant molten-gold iris that gleams like treasure",
}
_EYE = {
    "round": "enormous, round and impossibly glossy", "wide": "wide, bright and full of wonder",
    "almond": "an elegant almond shape", "sleepy": "dreamy and half-lidded",
    "upturned": "playfully upturned", "sparkle": "huge and sparkling with dazzling highlights",
    "starry": "beaming with big star-shaped highlights",
}
_MOUTH = {
    "smile": "a warm beaming smile", "grin": "an enormous joyful open grin", "soft": "a sweet gentle smile",
    "open": "a delighted little 'oh!'", "smirk": "a mischievous confident smirk",
    "ooh": "a starstruck 'ooh!'", "tongue": "a cheeky tongue-out grin",
}
_LASHES = {"natural": "soft fluttery lashes", "glam": "long, dramatic glamorous lashes", "cyber": "glowing neon cyber-lashes"}
_BLUSH = {
    "rose": "rosy glowing blush", "coral": "warm coral blush", "peach": "soft peachy blush", "plum": "rich plum blush",
    "berry": "bold berry blush", "sky": "dreamy sky-blue blush", "mint": "cool minty blush", "gold": "shimmering golden blush",
    "grape": "vivid grape blush", "teal": "bright teal blush", "stars": "a scatter of tiny glowing star freckles",
    "freckles": "cute sprinkled freckles",
}
_GLASSES = {
    "round": "chic round glasses", "square": "bold square glasses", "catEye": "sassy cat-eye glasses",
    "monocle": "a fancy gold monocle", "reading": "smart reading glasses", "goggles": "splashy swim goggles",
    "heart": "adorable heart-shaped glasses", "visor": "a sleek glowing futuristic visor",
}
_TOPPER = {
    "sprout": "a cute little green sprout popping from the top", "bow": "an oversized adorable bow",
    "cap": "a cool backwards baseball cap", "beanie": "a cozy slouchy beanie", "halo": "a glowing golden halo",
    "clip": "a sparkly hair clip", "flower": "a bright blooming flower", "antenna": "wiggly little antennae",
    "crown": "a dazzling jewel-encrusted gold crown", "horns": "tiny cheeky devil horns", "flame": "a dramatic dancing flame",
}
_ACCESSORY = {
    "headphones": "big cool headphones", "earmuffs": "fluffy oversized earmuffs", "bandage": "a tiny cute bandage",
    "sticker": "a shiny star sticker", "sparkles": "a flurry of floating magical sparkles",
}
_OUTFIT = {
    "scarf": "a cozy oversized knitted scarf", "bowtie": "a dapper bowtie", "collar": "a neat little collar",
    "lanyard": "an official staff lanyard", "hoodie": "a comfy streetwear hoodie", "labcoat": "a crisp white lab coat",
    "turtleneck": "a chic turtleneck", "overalls": "cute denim overalls", "cape": "a flowing heroic cape that billows dramatically",
}
_BG = {
    "mist": "a soft dreamy misty-grey studio glow", "blush": "a warm glowing blush-pink backdrop",
    "sky": "a bright cheerful sky-blue backdrop", "mint": "a fresh minty-green glow",
    "lilac": "a soft magical lilac haze", "sun": "a radiant sunny-yellow burst",
    "graphite": "a moody dramatic graphite-charcoal backdrop with a rim glow",
    "gemini": "a dreamy shimmering Gemini-gradient (lavender melting into peach)",
    "galaxy": "an epic deep-space galaxy full of stars and swirling nebulae",
    "confetti": "an explosion of playful pastel confetti", "sunset": "a glowing golden-hour sunset gradient",
    "ocean": "a serene glowing ocean-blue backdrop", "forest": "a soft enchanted forest-green glow",
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
    lines.append(f"Body: {_BODY.get(c['bodyColor'], 'a vibrant glossy ' + _humanize(c['bodyColor']) + '-coloured')} body.")
    lines.append(f"Her single eye is {_EYE.get(c['eyeShape'], _humanize(c['eyeShape']))} "
                 f"with {_IRIS.get(c['irisColor'], 'a vivid, glowing ' + _humanize(c['irisColor']) + ' iris')}.")
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
    lines.append(f"Background: {_BG.get(c['background'], 'a vivid, glowing ' + _humanize(c['background']) + ' backdrop')}.")
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
