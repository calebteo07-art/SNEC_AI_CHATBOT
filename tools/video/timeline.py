"""Single source of truth for the EyeBot marketing video scenes.

Fast-paced cut: hook -> title -> three feature beats (Virtual Patients, AI Tutor,
Flashcards) -> oversight -> close. Scene ids stay tied to their content (02 = title
lockup, 08 = end card) so the assembler's overlay mapping and caption files line up.
"""
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
    Scene("01", 4.5, "broll", "",                "In ophthalmology, every detail matters.",         ".tmp/video/broll/01_hook.mp4"),
    Scene("02", 3.0, "broll", "",                "Meet EyeBot.",                                    ".tmp/video/broll/02_accent.mp4"),
    Scene("04", 11.0, "live", "Virtual Patients", "Virtual patients — examine and take a history.",  ".tmp/video/live/04_livingeye.webm"),
    Scene("03", 9.0, "live",  "AI Tutor",         "An AI tutor with grounded, cited answers.",       ".tmp/video/live/03_chat.webm"),
    Scene("06", 9.5, "live",  "Flashcards",        "Answer from recall — AI grades you instantly.",   ".tmp/video/live/06_flashcards.webm"),
    Scene("07", 4.5, "broll", "Oversight",        "Safe by design — with faculty oversight.",        ".tmp/video/broll/07_oversight.mp4"),
    Scene("08", 7.0, "broll", "",                "EyeBot — your AI partner in ophthalmology training.\nA Singapore National Eye Centre initiative.", ".tmp/video/broll/08_close.mp4"),
]

def total_duration() -> float:
    return float(sum(s.duration for s in SCENES))
