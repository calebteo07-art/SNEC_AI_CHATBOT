"""Selena 3D portrait — the pure config→prompt and config→hash core (part 3).

The portrait is a soft-3D Iris rendered from a student's saved config. flash-image can't
emit true alpha, so v2 asks for a flat chroma-green (#00B140) backdrop instead and keys the
opaque render to a transparent 512² webp server-side (`tools.shared.keying`). The backdrop
is therefore a CSS layer applied client-side, NOT part of the look — `background` is excluded
from both the prompt and the cache hash (reverted to the transparent-over-CSS design,
2026-07-08; v1 briefly baked the background into the pixels, 2026-07-06).

Pure + registry-derived: `config_to_prompt` and `config_hash` do no I/O and never call
an API. Generation/storage live below; these are their deterministic inputs.
"""
import hashlib
import io
import json

from PIL import Image

from tools.avatar import generate_sprites
from tools.avatar.parts import AVATAR_AXES, DEFAULT_AVATAR
from tools.shared.gemini_client import MOCK_MODE
from tools.shared.keying import BG_KEY, despill_green, key_out, normalize_512

# The character axes only — v2 portraits are transparent cutouts, so `background`
# is a CSS layer behind the image and never reaches the prompt or the cache key.
PORTRAIT_AXES: list[str] = [a for a in AVATAR_AXES if a != "background"]

# Bumped whenever the render contract changes: salting the hash cache-busts every
# portrait minted under the old contract (v1 = opaque, baked background). Old v1
# cache rows and bucket objects are simply orphaned by the new hashes, not GC'd.
_HASH_SALT = "portrait:v2"

# The invariant style contract — what keeps a generated look recognizably Iris. Mirrors
# the STYLE in generate_sprites.py; kept here so the prompt core is self-contained.
_CONTRACT = (
    "Character: 'Iris', an adorable one-eyed mascot — exactly ONE big round glossy eye on a "
    "smooth, rounded, hairless blob-like body (no hair), two tiny stubby arms. "
    "Render as a PREMIUM, over-the-top COLLECTIBLE character portrait: bold soft-3D Pixar "
    "style, ultra-glossy, vibrant saturated colours, dramatic cinematic rim-lighting, a dreamy "
    "glow with floating sparkles, rich depth and a wow-factor — genuinely eye-catching and "
    "delightful, like a legendary game-reward icon. "
    "Front view, centered, full body, generous margin, polished square. "
    f"IMPORTANT: the ENTIRE background must be one flat, uniform, solid chroma-green ({BG_KEY}) — "
    "no gradient, no scene, no backdrop shadows, no text, no border, and NEVER a checkerboard "
    "or transparency pattern. Only the character casts subtle self-shading."
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
    "peach": "the classic warm peachy", "coral": "a juicy coral-pink", "rose": "a soft rosy-pink",
    "butter": "a creamy butter-yellow", "mint": "a fresh minty-green", "sage": "a gentle sage-green",
    "sky": "a dreamy sky-blue", "periwinkle": "a soft periwinkle-blue", "lavender": "a magical lavender",
    "slate": "a cool slate-blue", "bubblegum": "a poppy bubblegum-pink", "aqua": "a splashy aqua",
    "gold": "a gleaming molten-gold, like a trophy", "silver": "a polished chrome-silver, mirror-shiny",
    "midnight": "a deep midnight-navy with a starry shimmer", "watermelon": "a juicy watermelon-pink with a hint of green",
}
_IRIS = {
    "galaxy": "a mesmerizing swirling galaxy iris exploding with tiny stars, glowing nebula wisps and cosmic sparkles",
    "darkBrown": "a deep glossy dark-brown iris with a bright starry catchlight",
    "rose": "a luminous rosy-pink iris that softly glows", "gold": "a radiant molten-gold iris that gleams like treasure",
    "brown": "a warm glossy brown iris", "hazel": "a sparkling hazel iris flecked with gold",
    "amber": "a glowing amber iris like warm honey", "green": "a vivid emerald-green iris",
    "blue": "a brilliant crystal-blue iris", "gray": "a cool silvery-gray iris",
    "violet": "a dazzling violet iris", "teal": "a luminous teal iris",
    "lava": "a molten lava iris, glowing orange-red with ember cracks",
    "ice": "a glacial ice iris, pale crystal blue with frosty sparkle",
    "rainbow": "an impossible rainbow iris, a full spectrum swirl",
}
_EYE = {
    "round": "enormous, round and impossibly glossy", "wide": "wide, bright and full of wonder",
    "almond": "an elegant almond shape", "sleepy": "dreamy and half-lidded",
    "upturned": "playfully upturned", "sparkle": "huge and sparkling with dazzling highlights",
    "starry": "beaming with big star-shaped highlights",
    "heart": "shaped like a huge lovestruck heart",
    "dizzy": "a hilarious dizzy swirl, totally starstruck",
    "laser": "narrowed into an intense laser-focus glare with a glowing scanline",
    "pixel": "rendered as a chunky retro 8-bit pixel eye",
    "rainbow": "beaming a soft rainbow arc across the iris",
}
_MOUTH = {
    "smile": "a warm beaming smile", "grin": "an enormous joyful open grin", "soft": "a sweet gentle smile",
    "open": "a delighted little 'oh!'", "smirk": "a mischievous confident smirk",
    "ooh": "a starstruck 'ooh!'", "tongue": "a cheeky tongue-out grin",
    "laugh": "an uncontrollable head-back belly laugh",
    "catSmile": "a smug little :3 cat smile", "chomp": "a giant goofy chomp with one tooth showing",
    "whistle": "casually whistling with a tiny musical note",
    "pout": "a dramatic theatrical pout", "shocked": "a totally shocked jaw-drop",
    "evilGrin": "a cartoonishly evil scheming grin",
}
_LASHES = {
    "natural": "soft fluttery lashes", "glam": "long, dramatic glamorous lashes", "cyber": "glowing neon cyber-lashes",
    "feathery": "huge feathery false lashes, full drama",
    "butterfly": "lashes that curl into tiny butterfly wings",
}
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
    "dealWithIt": "pixelated 8-bit 'deal with it' sunglasses",
    "cinema3d": "retro red-and-cyan 3D cinema glasses",
    "ski": "mirrored ski goggles with a rainbow sheen",
    "star": "oversized star-shaped party glasses",
    "magnifier": "a comically huge detective's magnifying glass held up to the eye",
    "steampunk": "brass steampunk goggles with tiny gears",
    "broken": "cracked, taped-together nerd glasses worn proudly",
}
_TOPPER = {
    "sprout": "a cute little green sprout popping from the top", "bow": "an oversized adorable bow",
    "cap": "a cool backwards baseball cap", "beanie": "a cozy slouchy beanie", "halo": "a glowing golden halo",
    "clip": "a sparkly hair clip", "flower": "a bright blooming flower", "antenna": "wiggly little antennae",
    "crown": "a dazzling jewel-encrusted gold crown", "horns": "tiny cheeky devil horns", "flame": "a dramatic dancing flame",
    "wizardHat": "a giant starry wizard hat, slightly too big",
    "propeller": "a classic propeller beanie, propeller mid-spin",
    "trafficCone": "a tiny orange traffic cone worn proudly as a hat",
    "rubberDuck": "a small yellow rubber duck sitting calmly on top",
    "croissant": "a golden buttery croissant balanced like a beret",
    "vikingHelm": "a horned viking helmet, fearsome yet adorable",
    "pirateHat": "a swashbuckling pirate tricorn with a tiny skull",
    "cowboyHat": "a ten-gallon cowboy hat, yee-haw energy",
    "chefToque": "a tall white chef's toque",
    "discoBall": "a glittering mini disco ball hovering above, scattering sparkles",
    "catEars": "a soft pink cat-ear headband",
    "mushroom": "a cute red-and-white spotted mushroom cap",
}
_ACCESSORY = {
    "headphones": "big cool headphones", "earmuffs": "fluffy oversized earmuffs", "bandage": "a tiny cute bandage",
    "sticker": "a shiny star sticker", "sparkles": "a flurry of floating magical sparkles",
    "snorkel": "a snorkel and mask pushed up ready for adventure",
    "bobaTea": "clutching a giant boba milk tea with both tiny arms",
    "magicWand": "holding a sparkling magic wand mid-spell",
    "balloon": "holding a bright red balloon on a string",
    "goldChain": "an oversized chunky gold chain, maximum swagger",
    "mustache": "a magnificent curly gentleman's mustache",
    "fannyPack": "a neon 90s fanny pack worn with total confidence",
    "petSnail": "a tiny happy pet snail sitting beside her",
    "jetpack": "a mini rocket jetpack with a gentle flame",
    "umbrella": "a tiny striped umbrella held aloft",
}
_OUTFIT = {
    "scarf": "a cozy oversized knitted scarf", "bowtie": "a dapper bowtie", "collar": "a neat little collar",
    "lanyard": "an official staff lanyard", "hoodie": "a comfy streetwear hoodie", "labcoat": "a crisp white lab coat",
    "turtleneck": "a chic turtleneck", "overalls": "cute denim overalls", "cape": "a flowing heroic cape that billows dramatically",
    "dinoOnesie": "a full green dinosaur onesie with a hood of little teeth",
    "astronaut": "a puffy white astronaut suit with a mission patch",
    "tuxedo": "a dapper black tuxedo with a crisp bow tie",
    "bananaSuit": "a ridiculous full banana costume",
    "bubbleWrap": "armor made entirely of bubble wrap",
    "hawaiian": "a loud hibiscus-print hawaiian shirt",
    "knightArmor": "shining knight armor with a tiny plume",
    "chefApron": "a flour-dusted chef's apron",
    "pufferJacket": "an oversized cloud-like puffer jacket",
    "superSuit": "a heroic super-suit with a lightning emblem",
}

# axis → bespoke phrase map. Single lookup point for the tile prompts and the
# phrase-coverage gate (no shipped tile id may fall back to _humanize). The portrait
# prompt reads these same dicts directly in config_to_prompt.
PROMPT_MAPS: dict[str, dict[str, str]] = {
    "bodyColor": _BODY, "irisColor": _IRIS, "eyeShape": _EYE, "mouth": _MOUTH,
    "lashes": _LASHES, "blush": _BLUSH, "glasses": _GLASSES, "topper": _TOPPER,
    "accessory": _ACCESSORY, "outfit": _OUTFIT,
}


def phrase_for(axis: str, option_id: str) -> str | None:
    """The bespoke prompt phrase for an option id, or None if unmapped."""
    return PROMPT_MAPS.get(axis, {}).get(option_id)


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
    blob = json.dumps({"salt": _HASH_SALT, **norm}, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


def config_to_prompt(config: dict) -> str:
    """Compose the image prompt for a look. Skips `none` options; `background` is never
    included — the render always demands a flat chroma-green backdrop (see `_CONTRACT`)."""
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
    return "\n".join(lines)


# ── Generation + storage (Task 2 — the PAID path) ────────────────────────────
# These do real I/O. They are only ever reached on the genuine cache-missed save
# path (Task 3), never in tests: render_portrait refuses to run in MOCK_MODE.


# Below this fraction of fully-transparent pixels, the model ignored the chroma
# backdrop (a real keyed cutout is mostly transparent margin).
_MIN_ALPHA_RATIO = 0.05


def _alpha_ratio(img: Image.Image) -> float:
    return img.getchannel("A").histogram()[0] / float(img.width * img.height)


def render_portrait(config: dict, model: str = generate_sprites.MODELS["flash"]) -> bytes:
    """Render + key one transparent Selena cutout. LIVE + PAID (~1–2¢/image).

    Refuses in MOCK_MODE — we never fabricate art in tests/CI. The flash render
    comes back opaque on flat chroma green (flash has no true alpha); we key it
    out, despill, and normalise onto the 512² iris.png canvas. Render-QUALITY
    failures (undecodable bytes, ignored green screen) get exactly one retry;
    no-bytes-at-all is terminal — generate_image_bytes already retried transient
    upstream errors internally, so another outer pass would only amplify paid
    calls. On failure the caller marks the look `failed` (the UI falls back to
    the default mascot — never broken art). Returns RGBA webp bytes.
    """
    if MOCK_MODE:
        raise RuntimeError(
            "render_portrait needs a live GEMINI_API_KEY; refusing to fabricate art in MOCK_MODE"
        )
    prompt = config_to_prompt(config)
    last = "no render attempted"
    for _ in range(2):
        data = generate_sprites.generate_image_bytes(prompt, model=model)
        if not data:
            raise RuntimeError(
                "portrait generation returned no image bytes (client retries already exhausted)"
            )
        try:
            keyed = key_out(Image.open(io.BytesIO(data)), BG_KEY)
        except Exception:  # garbage/truncated bytes — a render-quality miss, worth one retry
            last = "render was not a decodable image"
            continue
        # Check BEFORE normalize_512 — normalize always adds a transparent letterbox
        # margin, which would mask a render that never keyed out any real background.
        if _alpha_ratio(keyed) < _MIN_ALPHA_RATIO:
            last = "model ignored the chroma backdrop (<5% transparent after keying)"
            continue
        img = normalize_512(despill_green(keyed))
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=90)
        return buf.getvalue()
    raise RuntimeError(f"portrait generation failed: {last}")


def _image_kind(data: bytes) -> tuple[str, str]:
    """(extension, content_type) sniffed from magic bytes. The v2 pipeline emits keyed
    RGBA webp; the JPEG branch stays defensively (raw un-keyed flash output is JPEG).
    Default to PNG for anything unrecognized so we never mislabel the object."""
    if data[:3] == b"\xff\xd8\xff":
        return "jpg", "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp", "image/webp"
    return "png", "image/png"


def store_portrait(config_hash: str, image_bytes: bytes) -> str:
    """Upload a rendered portrait to the public `selena-avatars` bucket, keyed by hash.

    Returns the public URL. The extension + content-type are sniffed from the bytes
    (webp for keyed v2 renders; JPEG kept as a defensive branch for raw flash output).
    Idempotent (upsert), so re-storing is safe.
    """
    ext, ctype = _image_kind(image_bytes)
    from tools.kb import supabase_client
    return supabase_client.upload_avatar(f"{config_hash}.{ext}", image_bytes, content_type=ctype)
