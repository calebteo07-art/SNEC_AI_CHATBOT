"""PHOTOPIC prompt library — keyed by frontend NavContext.

Single source of truth for every generated asset family:
  svg    — Gemini text models emit vector accents (sanitized fail-closed)
  raster — Nano Banana Pro imagery (gen_images.py precedent)
  loop   — Higgsfield video loop briefs (operator-driven via CLI skills)

Palette is locked to the PHOTOPIC tokens: paper #FDFDFC, ink #1F1F1F,
gem spectrum #3C90FF #4FA0FF #00BDD2 #60D673 #88DE42 #FFCF03 #FF9238
#FF5A59 #F96BD6 #AD72FF. Iridescent ink on paper — never neon-on-black.
"""

NAV_CONTEXTS = [
    "login", "checkin", "dashboard", "cases", "case-session",
    "flashcards", "summary", "progress", "supervisor", "admin", "profile",
]

_SVG_RULES = (
    "Reply with ONLY a single valid <svg> document, no markdown fences, no prose. "
    "Constraints: viewBox='0 0 800 600'; elements limited to svg,g,path,circle,"
    "ellipse,rect,line,polyline,polygon,defs,linearGradient,radialGradient,stop,"
    "clipPath,mask,filter,feTurbulence,feDisplacementMap,feGaussianBlur,"
    "feColorMatrix,feBlend; NO script, NO style attributes, NO foreignObject, "
    "NO external references, NO event handlers, NO <use>, NO <text>, NO <image>, "
    "NO font attributes of any kind. The document must be strictly well-formed "
    "XML — every tag closed, no stray characters. "
    "Palette only: #3C90FF #4FA0FF #00BDD2 #60D673 #88DE42 #FFCF03 #FF9238 "
    "#FF5A59 #F96BD6 #AD72FF, ink #1F1F1F at low opacity, on transparent. "
    "Aesthetic: PHOTOPIC — translucent iridescent ink blooming through paper; "
    "fine schematic linework like an ophthalmic diagram; generous negative space; "
    "opacities between 0.05 and 0.5. Never filled backgrounds."
)

SVG_PROMPTS: dict[str, str] = {
    "login":       f"An abstract iris of concentric arcs and radial fibre ticks, gem-blue to violet. {_SVG_RULES}",
    "checkin":     f"A rising sun of thin arcs over a horizon line — daily renewal, schematic. {_SVG_RULES}",
    "dashboard":   f"A loose constellation of small lens shapes connected by fine ink paths. {_SVG_RULES}",
    "cases":       f"A slit-lamp light path: two crossing beams refracting through a lens outline. {_SVG_RULES}",
    "case-session": f"A focused examination reticle: crosshair arcs around a calm pupil dot. {_SVG_RULES}",
    "flashcards":  f"Overlapping translucent card rectangles fanned like a recall deck. {_SVG_RULES}",
    "summary":     f"A small celebration burst of gem-coloured ink droplets and arcs. {_SVG_RULES}",
    "progress":    f"OCT-like horizontal strata with one bright scanning beam line. {_SVG_RULES}",
    "supervisor":  f"A cohort field: scattered small circles with a few highlighted in gem hues. {_SVG_RULES}",
    "admin":       f"A minimal control lattice: thin grid lines with gem accent nodes. {_SVG_RULES}",
    "profile":     f"A single elegant eye outline in two strokes with a gem-blue limbus arc. {_SVG_RULES}",
}

# AURORA rasters — realistic clinical eye imagery for the dark PlateWell / AtlasMap
# wells (#07080c-ish), lit with the Gemini gradient. Supersedes the PHOTOPIC
# paper-white rasters; ASCII-only (Windows console). 16:9 source, object-fit cover.
_RASTER_BASE = (
    "Clinical ophthalmic macro photography on a deep near-black field (#07080c), "
    "a single ocular subject, soft volumetric rim light in the Google Gemini "
    "gradient (blue #4285F4 to purple #9B72CB to rose #D96570) grazing the "
    "subject, ultra-clean medical-grade detail, shallow depth of field, premium "
    "and calm. No text, no people, no faces, no UI, no paper-white background, "
    "photorealistic."
)

RASTER_PROMPTS: dict[str, str] = {
    "dashboard":    f"Extreme macro of a single calm human iris with intricate fibre detail and a deep black pupil, floating on a deep near-black clinical field; a soft Gemini-gradient rim light grazes the limbus. {_RASTER_BASE}",
    "cases":        f"A photorealistic human anterior segment - cornea, a detailed iris and a sliver of sclera - centred on a near-black field with even soft illumination so overlaid markers stay legible; a faint Gemini-gradient glow at the edges. {_RASTER_BASE}",
    "case-session": f"A photorealistic retinal fundus photograph: the optic disc, branching retinal vessels and the macula, clinically plausible, on a dark vignette with a subtle Gemini-gradient sheen. {_RASTER_BASE}",
    # Pure clinical slit-lamp photo (no _RASTER_BASE: no Gemini rim, authentic look).
    "flashcards":   "A realistic clinical slit-lamp biomicroscopy photograph of a human eye, frontal view as seen through the slit lamp during an ophthalmic examination. A bright, crisp, well-defined vertical white slit beam forms a luminous optical section across the clear cornea - the brightest element - revealing faint fine vertical stromal striae deep within the beam (Vogt's striae). The iris shows natural fibre texture and colour with a deep black round pupil at the centre; at the periphery the limbus and a sliver of conjunctiva carry fine red blood vessels. The unlit surroundings fall into natural near-black darkness. Ultra-sharp, medical-grade, photorealistic, like a real ophthalmology teaching-atlas slit-lamp photo. No text, labels, arrows, measurement overlays, or UI; no people or faces beyond the eye; no fluorescein stain, no cobalt-blue light.",
}

LOOP_PROMPTS: dict[str, str] = {
    "login":     "Seamless 5s loop: extreme macro of a calm blue-cyan human iris on a paper-white field, micro contractions of the pupil, soft daylight, iridescent limbal shimmer. Clinical, serene, premium. Loop start/end identical.",
    "checkin":   "Seamless 5s loop: a single drop of iridescent gem-spectrum ink (blue to violet) blooming slowly through white water on paper, ultra soft light. Loop start/end identical.",
    "dashboard": "Seamless 5s loop: a sculptural clear glass lens resting on warm paper white, slowly drifting gem-spectrum caustic light (blue, cyan, violet) refracting across the paper, bright clinical daylight, premium calm. Loop start/end identical.",
    "summary":   "Seamless 5s loop: several tiny droplets of different gem-coloured inks (blue, cyan, violet, gold) blooming at once through clear water over warm white paper, a quiet celebration, ultra soft light. Loop start/end identical.",
}
