"""EyeBot animated-logo pose registry — the single source of truth for the paid
Selena pose frames (logo→raster brief, 2026-07-07). Pure data + a prompt builder;
no I/O, no network.

`rest` is deliberately NOT here: the rest frame is the existing /brand/iris.png,
reused free. Each pose is a whole-image expression/tilt variant of the one-eyed
Iris mascot (D9: Selena IS Iris — no limbs, no hair), anchored to iris.png at
generation time (reference=True). Prompts render on a flat chroma background that
the keying step (tools/brand/keying.py) removes to restore transparency."""
from __future__ import annotations

from dataclasses import dataclass

BG_KEY = "#00B140"  # flat chroma-green backdrop for keying (absent from the teal/cream mascot)

_ANCHOR = (
    "The same one-eyed EyeBot mascot as the reference image — a soft, rounded, "
    "hairless teal-and-cream character with a single large friendly eye and a calm "
    "gentle smile, identical proportions, colours, and rendering to the reference."
)
_FRAME = (
    f"Full body centered, plain flat solid chroma-green ({BG_KEY}) background, soft "
    "even lighting. No text, no border, no watermark, no extra characters."
)


@dataclass(frozen=True)
class Pose:
    id: str
    pose_line: str


POSES: dict[str, Pose] = {
    "wave": Pose("wave", "Leaning to one side in a warm friendly 'hello' tilt, the eye bright and welcoming."),
    "cheer": Pose("cheer", "Delighted, the eye happily crinkled into a cheerful upward curve, beaming."),
    "groove": Pose("groove", "Leaning with a playful dynamic bounce, mid-groove, lively and buoyant."),
}


def prompt(pose: Pose) -> str:
    """The full approved flash prompt for one pose (anchor + pose line + frame)."""
    return f"{_ANCHOR} {pose.pose_line} {_FRAME}"
