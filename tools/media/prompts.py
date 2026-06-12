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
    "NO external references, NO event handlers. "
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

_RASTER_BASE = (
    "PHOTOPIC clinical-editorial photography: bright daylight studio, warm "
    "paper-white background #FDFDFC, soft shadows, a single subject with "
    "iridescent gem-spectrum reflections (blue, cyan, violet). Premium, "
    "calm, medical-grade cleanliness. No text, no people, no dark scenes."
)

RASTER_PROMPTS: dict[str, str] = {
    "login":     f"Macro photograph of a human iris in bright daylight, blue-cyan, floating on paper white. {_RASTER_BASE}",
    "dashboard": f"A sculptural glass lens resting on paper, refracting a gem-spectrum caustic. {_RASTER_BASE}",
    "summary":   f"Iridescent ink drop blooming in clear water over white, suspended mid-swirl. {_RASTER_BASE}",
}

LOOP_PROMPTS: dict[str, str] = {
    "login":   "Seamless 6s loop: extreme macro of a calm blue-cyan human iris on a paper-white field, micro contractions of the pupil, soft daylight, iridescent limbal shimmer. Clinical, serene, premium. Loop start/end identical.",
    "checkin": "Seamless 6s loop: a single drop of iridescent gem-spectrum ink (blue to violet) blooming slowly through white water on paper, ultra soft light. Loop start/end identical.",
    "summary": "Seamless 5s loop: gentle caustic light patterns in gem blues and violets drifting across warm white paper, barely-there. Loop start/end identical.",
}
