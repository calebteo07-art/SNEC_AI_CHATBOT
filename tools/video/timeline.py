"""Single source of truth for the EyeBot marketing video scenes."""
from dataclasses import dataclass

@dataclass(frozen=True)
class Scene:
    id: str
    duration: float          # seconds on the final timeline
    source: str              # broll | live | stills | brand
    label: str               # small corner feature label ("" = none)
    caption: str             # on-screen caption line(s)
    asset: str               # primary source file (relative to repo root)

SCENES = [
    Scene("01", 8,  "broll", "",            "In ophthalmology, every detail matters.",        ".tmp/video/broll/01_hook.mp4"),
    Scene("02", 4,  "brand", "",            "Meet EyeBot.",                                    ".tmp/video/stills/02_title.png"),
    Scene("03", 14, "live",  "AI Tutor",    "Ask anything — grounded, cited answers.",         ".tmp/video/live/03_chat.webm"),
    Scene("04", 14, "live",  "Living Eye",  "Explore real anatomy — click any structure.",     ".tmp/video/live/04_livingeye.webm"),
    Scene("05", 15, "live",  "OSCE Station","Run a full OSCE — examine, decide, get marked.",   ".tmp/video/live/05_osce.webm"),
    Scene("06", 13, "stills","Flashcards",  "Lock it in with active recall.",                  "frontend/final-flashcards.png"),
    Scene("07", 6,  "broll", "Oversight",   "Safe by design — faculty stay in the loop.",      ".tmp/video/broll/07_oversight.mp4"),
    Scene("08", 11, "broll", "",            "EyeBot — your AI partner in ophthalmology training.\nA Singapore National Eye Centre initiative.", ".tmp/video/broll/08_close.mp4"),
]

def total_duration() -> float:
    return float(sum(s.duration for s in SCENES))
