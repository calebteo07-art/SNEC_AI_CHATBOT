"""Lumens vault badge medallions — twenty VISION/ACUITY tiers with Iris (Selena) as the
mascot. This is the app's only badge collection (the separate daily-streak vault was
retired 2026-07-29), so the twenty descriptions below have to carry the whole escalation
on their own: frame material climbs weathered-bronze → copper → iron → steel → silver →
gold → gem-set gold → cosmic, the setting climbs dawn field → workshop → observatory →
deep space, and Iris climbs a sleepy first blink → a crowned, winged, galaxy-irised deity.

Nano-Banana flash, anchored to iris.png (reference=True). PAID + go-ahead-gated. Opaque
medallions, saved as jpg. Iris = one-eyed, hairless round blob.

Keep the slugs in sync with LUMEN_BADGES in
frontend/src/aurora/components/home/lumenBadges.ts — they ARE the image filenames.
"""

# Ordered by tier, lowest → highest. `frame` escalates the medallion itself; `desc` is
# what Iris is doing inside it; `bg` sets the world behind her.
BADGES: dict[str, dict] = {
    "first-blink": {
        "name": "First Blink",
        "frame": "a plain, softly weathered bronze rim, simple and humble",
        "desc": "her single eye half-closed and sleepily cracking open for the very first time, curled snugly in a mossy hollow",
        "bg": "a hushed pre-dawn meadow, the first pale light just touching the horizon",
    },
    "first-light": {
        "name": "First Light",
        "frame": "a bronze laurel-wreath rim",
        "desc": "nestled in a woven twig nest with a tiny green sprout unfurling above her, eye wide and hopeful",
        "bg": "a dewy sunrise field, warm gold rays fanning out behind her",
    },
    "wide-awake": {
        "name": "Wide Awake",
        "frame": "a polished copper rim with a fine beaded edge",
        "desc": "eye snapped fully round and alert, tiny arms stretched up mid-yawn-turned-cheer, a small steaming cup beside her",
        "bg": "a bright morning windowsill with warm light pouring in",
    },
    "clear-view": {
        "name": "Clear View",
        "frame": "a clean wrought-iron ring",
        "desc": "polishing a pane of glass with a little cloth, the smudge gone and the world crisp through it",
        "bg": "a soft blue-grey studio haze that turns sharp and clear behind the pane",
    },
    "sharp-focus": {
        "name": "Sharp Focus",
        "frame": "a precision steel rim milled with fine measurement notches",
        "desc": "eye narrowed to a keen, exact stare with one crisp needle-thin catchlight, perfectly poised",
        "bg": "a calm slate workshop wall with shallow depth of field",
    },
    "keen-eye": {
        "name": "Keen Eye",
        "frame": "a brushed steel rim with a knurled grip edge",
        "desc": "holding a small brass magnifier up to her eye, delighted at having spotted some tiny hidden detail",
        "bg": "a warm lamplit desk scattered with lenses",
    },
    "steady-gaze": {
        "name": "Steady Gaze",
        "frame": "a heavy dark gunmetal rim, solid and unmoving",
        "desc": "sitting perfectly still and unblinking on a smooth stone plinth, utterly composed",
        "bg": "a quiet misted mountain dusk",
    },
    "twenty-twenty": {
        "name": "20/20 Vision",
        "frame": "a bright polished silver rim",
        "desc": "beaming in front of a clinical acuity chart of crisp abstract optotype shapes that shrink row by row",
        "bg": "a clean bright examination room, cool and immaculate",
    },
    "crystal-lens": {
        "name": "Crystal Lens",
        "frame": "a silver rim set with clear faceted glass studs",
        "desc": "cradling a flawless ground-glass lens element that throws a clean pool of focused light",
        "bg": "a dim optics bench glinting with polished glass",
    },
    "eagle-eye": {
        "name": "Eagle Eye",
        "frame": "a bronze-and-gold rim with sculpted feathered wings sweeping out either side",
        "desc": "sharp and aquiline, perched proudly on a high crag with a small feathered mantle",
        "bg": "a sunlit canyon falling away into blue distance far below",
    },
    "hawkeye": {
        "name": "Hawkeye",
        "frame": "a rich gold rim crested with layered hawk plumage",
        "desc": "locked on to something far away, pupil contracted to a hunter's pinpoint, fierce but friendly",
        "bg": "a windswept high ridge under a burning amber sky",
    },
    "night-vision": {
        "name": "Night Vision",
        "frame": "a blue-black rim edged in luminous green",
        "desc": "her eye glowing a soft luminous green, seeing perfectly in the dark, pleased with herself",
        "bg": "a deep moonlit forest rendered in cool greens and blues",
    },
    "laser-focus": {
        "name": "Laser Focus",
        "frame": "a gold rim with sleek scarlet inlay",
        "desc": "projecting one thin, precise beam of pink-red light from her pupil onto a single exact point",
        "bg": "a dark chamber threaded with faint drifting light haze",
    },
    "farsight": {
        "name": "Farsight",
        "frame": "an antique gold rim engraved with orbital rings",
        "desc": "at the eyepiece of a grand brass telescope, seeing something wonderful and impossibly distant",
        "bg": "an open observatory dome under a deep star-strewn indigo sky",
    },
    "prism-sight": {
        "name": "Prism Sight",
        "frame": "a gold rim banded with a soft rainbow sheen",
        "desc": "splitting a shaft of white light through a crystal prism into a clean spectrum across her face, enchanted",
        "bg": "a dark violet void alive with drifting refracted colour",
    },
    "third-eye": {
        "name": "Third Eye",
        "frame": "an ornate gold rim with fine temple-carved filigree",
        "desc": "a second smaller eye opening and glowing gently on her brow above the first, serene and knowing",
        "bg": "a warm incense-lit sanctum haloed in soft gold",
    },
    "all-seeing": {
        "name": "All-Seeing",
        "frame": "a gold mandala rim ringed with many small watchful eyes",
        "desc": "at the calm centre of a slowly turning halo of little glowing eyes all looking outward, benevolent",
        "bg": "a deep temple-blue expanse dusted with golden motes",
    },
    "cosmic-gaze": {
        "name": "Cosmic Gaze",
        "frame": "a starlit gold rim dissolving into nebula at its edges",
        "desc": "her iris become a whole swirling galaxy, gazing politely into the infinite, awestruck",
        "bg": "a vast purple-teal nebula scattered with bright stars",
    },
    "visionary": {
        "name": "Visionary",
        "frame": "a jewel-encrusted gold rim with great iridescent wings and a gemmed crown above",
        "desc": "crowned and winged, radiant with golden light, wearing tiny heart-shaped rainbow glasses, triumphant",
        "bg": "a luminous cosmic swirl shot through with gold and rainbow light",
    },
    "eye-of-eternity": {
        "name": "Eye of Eternity",
        "frame": "a rim of pure living rainbow-gold light, endlessly intricate, haloed in radiant sigils",
        "desc": "ascended into a serene deity of pure sight, her single vast eye holding an entire universe, utterly legendary",
        "bg": "the birth of a galaxy — blazing white-gold at the centre, deep cosmic colour spiralling out forever",
    },
}


def prompt(b: dict) -> str:
    return (
        "A premium, adorable collectible achievement medallion of Iris — a one-eyed, hairless, "
        "round mascot blob with a single large friendly eye and no other facial features — "
        f"{b['desc']}. The medallion is framed by {b['frame']}, set against {b['bg']}. "
        "Circular medallion composition, soft rounded 3D enamel-and-metal game-UI style, gentle "
        "studio lighting, warm and cute and beautiful (never scary or menacing), centered and "
        "filling the frame. No text, no letters, no numbers, no watermark."
    )
