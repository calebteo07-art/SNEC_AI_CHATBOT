"""Hand-crafted PHOTOPIC seed accents — zero API cost.

Procedurally writes the launch set of vector accents (gem-spectrum ink
schematics, one per key context), validates every document through the
fail-closed sanitizer, and rebuilds the manifest. The paid Gemini sweep
(generate_accents.py) replaces/extends these later.

Run:
    python -m tools.media.seed_accents
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.media.sanitize_svg import sanitize_svg  # noqa: E402
from tools.media import build_manifest  # noqa: E402

ACCENTS_DIR = PROJECT_ROOT / "frontend" / "public" / "media" / "accents"

GEMS = ["#3C90FF", "#4FA0FF", "#00BDD2", "#60D673", "#88DE42",
        "#FFCF03", "#FF9238", "#FF5A59", "#F96BD6", "#AD72FF"]


def _doc(body: str) -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" '
        'width="800" height="600">' + body + "</svg>"
    )


def login_iris() -> str:
    parts = ['<defs><radialGradient id="lg"><stop offset="0.55" stop-color="#3C90FF" stop-opacity="0"/>'
             '<stop offset="0.8" stop-color="#3C90FF" stop-opacity="0.35"/>'
             '<stop offset="1" stop-color="#AD72FF" stop-opacity="0.12"/></radialGradient></defs>']
    parts.append('<circle cx="400" cy="300" r="210" fill="url(#lg)"/>')
    for i, r in enumerate((150, 185, 222)):
        parts.append(
            f'<circle cx="400" cy="300" r="{r}" fill="none" stroke="{GEMS[i * 3 % 10]}" '
            f'stroke-width="{1.6 - i * 0.3}" stroke-opacity="{0.4 - i * 0.08}" '
            f'stroke-dasharray="{r} {r * 2.5}"/>'
        )
    for k in range(36):
        a = k / 36 * math.tau
        x1, y1 = 400 + math.cos(a) * 160, 300 + math.sin(a) * 160
        x2, y2 = 400 + math.cos(a) * (188 + (k % 4) * 9), 300 + math.sin(a) * (188 + (k % 4) * 9)
        c = GEMS[k % 10] if k % 3 == 0 else "#1F1F1F"
        op = 0.34 if k % 3 == 0 else 0.14
        parts.append(
            f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="{c}" stroke-width="1.1" stroke-opacity="{op}" stroke-linecap="round"/>'
        )
    parts.append('<circle cx="400" cy="300" r="56" fill="#1F1F1F" fill-opacity="0.85"/>')
    return _doc("".join(parts))


def dashboard_constellation() -> str:
    pts = [(120, 420, 0), (260, 250, 2), (430, 330, 4), (560, 170, 6), (700, 300, 9), (350, 500, 8)]
    parts = []
    for i in range(len(pts) - 1):
        x1, y1, _ = pts[i]
        x2, y2, _ = pts[i + 1]
        mx, my = (x1 + x2) / 2, min(y1, y2) - 46
        parts.append(
            f'<path d="M{x1} {y1} Q {mx:.0f} {my:.0f} {x2} {y2}" fill="none" '
            f'stroke="#1F1F1F" stroke-opacity="0.16" stroke-width="1.2"/>'
        )
    for x, y, g in pts:
        parts.append(f'<circle cx="{x}" cy="{y}" r="26" fill="{GEMS[g]}" fill-opacity="0.14"/>')
        parts.append(f'<circle cx="{x}" cy="{y}" r="9" fill="none" stroke="{GEMS[g]}" stroke-opacity="0.55" stroke-width="1.6"/>')
        parts.append(f'<circle cx="{x}" cy="{y}" r="2.6" fill="{GEMS[g]}" fill-opacity="0.8"/>')
    return _doc("".join(parts))


def cases_slitlamp() -> str:
    parts = ['<defs><linearGradient id="beam" x1="0" y1="0" x2="1" y2="0">'
             '<stop offset="0" stop-color="#3C90FF" stop-opacity="0"/>'
             '<stop offset="0.5" stop-color="#00BDD2" stop-opacity="0.3"/>'
             '<stop offset="1" stop-color="#F96BD6" stop-opacity="0"/></linearGradient></defs>']
    parts.append('<polygon points="60,180 740,272 740,330 60,420" fill="url(#beam)"/>')
    parts.append('<ellipse cx="400" cy="300" rx="120" ry="120" fill="none" stroke="#1F1F1F" stroke-opacity="0.25" stroke-width="1.5"/>')
    parts.append('<path d="M280 300 Q 400 196 520 300" fill="none" stroke="#3C90FF" stroke-opacity="0.5" stroke-width="2"/>')
    parts.append('<path d="M280 300 Q 400 404 520 300" fill="none" stroke="#AD72FF" stroke-opacity="0.4" stroke-width="2"/>')
    for k in range(7):
        x = 180 + k * 74
        parts.append(f'<line x1="{x}" y1="540" x2="{x + 30}" y2="540" stroke="#1F1F1F" stroke-opacity="0.18" stroke-width="1.2"/>')
    return _doc("".join(parts))


def summary_burst() -> str:
    parts = []
    for k in range(18):
        a = k / 18 * math.tau
        r1, r2 = 70 + (k % 3) * 22, 150 + (k % 5) * 36
        x1, y1 = 400 + math.cos(a) * r1, 300 + math.sin(a) * r1
        x2, y2 = 400 + math.cos(a) * r2, 300 + math.sin(a) * r2
        g = GEMS[k % 10]
        parts.append(
            f'<line x1="{x1:.0f}" y1="{y1:.0f}" x2="{x2:.0f}" y2="{y2:.0f}" '
            f'stroke="{g}" stroke-opacity="0.5" stroke-width="2.4" stroke-linecap="round"/>'
        )
        dx, dy = 400 + math.cos(a + 0.18) * (r2 + 26), 300 + math.sin(a + 0.18) * (r2 + 26)
        parts.append(f'<circle cx="{dx:.0f}" cy="{dy:.0f}" r="{3 + k % 4}" fill="{g}" fill-opacity="0.45"/>')
    return _doc("".join(parts))


def checkin_sunrise() -> str:
    parts = []
    for i, r in enumerate((110, 150, 192, 236)):
        g = GEMS[(i * 2 + 4) % 10]
        parts.append(
            f'<path d="M{400 - r} 420 A {r} {r} 0 0 1 {400 + r} 420" fill="none" '
            f'stroke="{g}" stroke-opacity="{0.45 - i * 0.08}" stroke-width="{2.2 - i * 0.35}" stroke-linecap="round"/>'
        )
    parts.append('<line x1="120" y1="420" x2="680" y2="420" stroke="#1F1F1F" stroke-opacity="0.25" stroke-width="1.4"/>')
    parts.append('<circle cx="400" cy="420" r="34" fill="#FFCF03" fill-opacity="0.3"/>')
    parts.append('<circle cx="400" cy="420" r="14" fill="#FF9238" fill-opacity="0.5"/>')
    return _doc("".join(parts))


SEEDS = {
    "login-seed-00.svg": login_iris,
    "dashboard-seed-00.svg": dashboard_constellation,
    "cases-seed-00.svg": cases_slitlamp,
    "summary-seed-00.svg": summary_burst,
    "checkin-seed-00.svg": checkin_sunrise,
}


def main() -> int:
    ACCENTS_DIR.mkdir(parents=True, exist_ok=True)
    for name, fn in SEEDS.items():
        svg = sanitize_svg(fn())  # fail-closed even for our own output
        (ACCENTS_DIR / name).write_text(svg, encoding="utf-8")
        print(f"  ok {name}")
    manifest = build_manifest.build()
    print(f"manifest v{manifest['version']}: {len(manifest['accents'])} accents")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
