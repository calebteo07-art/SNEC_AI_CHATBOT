"""Fail-closed SVG sanitizer for generated vector accents.

Model-generated SVG is an XSS vector: a <script> tag, an onload attribute,
or a foreignObject smuggles arbitrary code into the page. Every generated
SVG passes through here AT GENERATION TIME and is rejected wholesale on any
violation — there is no partial cleanup, because a sanitizer that "fixes"
hostile input invites bypass bugs.

The frontend additionally renders accents via <img src>, which never
executes scripts — defence in depth, not a reason to relax this.
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET

SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"

ALLOWED_ELEMENTS = {
    "svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline",
    "polygon", "defs", "linearGradient", "radialGradient", "stop",
    "clipPath", "mask", "filter", "feTurbulence", "feDisplacementMap",
    "feGaussianBlur", "feColorMatrix", "feBlend", "feFlood", "feComposite",
    "feOffset", "feMerge", "feMergeNode", "title", "desc",
}

ALLOWED_ATTRS = {
    # document
    "xmlns", "viewBox", "width", "height", "preserveAspectRatio", "version",
    # identity / reuse
    "id", "class", "href",
    # geometry
    "d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2",
    "points", "pathLength",
    # paint
    "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width",
    "stroke-opacity", "stroke-linecap", "stroke-linejoin",
    "stroke-dasharray", "stroke-dashoffset", "stroke-miterlimit",
    "opacity", "transform", "transform-origin",
    # gradients
    "gradientUnits", "gradientTransform", "spreadMethod", "offset",
    "stop-color", "stop-opacity", "fx", "fy",
    # clip / mask / filter plumbing
    "clip-path", "clip-rule", "mask", "filter", "filterUnits",
    "primitiveUnits", "maskUnits", "maskContentUnits", "clipPathUnits",
    # filter primitives
    "in", "in2", "result", "mode", "type", "values", "stdDeviation",
    "baseFrequency", "numOctaves", "seed", "stitchTiles", "scale",
    "xChannelSelector", "yChannelSelector", "flood-color", "flood-opacity",
    "operator", "k1", "k2", "k3", "k4", "dx", "dy",
}

_URL_FUNC = re.compile(r"url\s*\(", re.IGNORECASE)
_LOCAL_URL = re.compile(r"^url\(#[\w:.-]+\)$")


class SvgRejected(ValueError):
    """The document violated the allowlist; discard it entirely."""


def _local(tag_or_attr: str) -> str:
    return tag_or_attr.rsplit("}", 1)[-1]


def sanitize_svg(text: str) -> str:
    """Validate an SVG document; returns the original text on success,
    raises SvgRejected on any violation."""
    if not text or "<svg" not in text:
        raise SvgRejected("not an SVG document")
    lowered = text.lower()
    # stdlib ElementTree predates DTD hardening — refuse documents that
    # declare entities or doctypes outright.
    if "<!doctype" in lowered or "<!entity" in lowered:
        raise SvgRejected("doctype/entity declarations are not allowed")
    if "<script" in lowered or "javascript:" in lowered:
        raise SvgRejected("script content")

    try:
        root = ET.fromstring(text)
    except ET.ParseError as exc:
        raise SvgRejected(f"unparseable XML: {exc}") from exc

    if _local(root.tag) != "svg":
        raise SvgRejected("root element must be <svg>")

    for el in root.iter():
        tag = _local(el.tag)
        if tag not in ALLOWED_ELEMENTS:
            raise SvgRejected(f"element <{tag}> not allowed")
        for raw_name, value in el.attrib.items():
            name = _local(raw_name)
            if name.lower().startswith("on"):
                raise SvgRejected(f"event handler attribute {name}")
            if name == "style":
                raise SvgRejected("style attributes are not allowed")
            if name not in ALLOWED_ATTRS:
                raise SvgRejected(f"attribute {name} not allowed on <{tag}>")
            v = value.strip()
            if name == "href":
                if not v.startswith("#"):
                    raise SvgRejected("href must be a local fragment reference")
            elif _URL_FUNC.search(v) and not _LOCAL_URL.match(v):
                raise SvgRejected(f"non-local url() in {name}")
            if "javascript:" in v.lower() or "data:" in v.lower():
                raise SvgRejected(f"forbidden scheme in {name}")
    return text
