"""Topic + difficulty taxonomy for flashcards — 45 sets per role.

Each role's deck is organised as 15 topics x 3 difficulty tiers (easy, medium,
hard) = 45 selectable sets. Mirrors the
check-in pooling so OA and PSA share one clinical pool and OT is separate:
- OT  -> ophthalmic investigations / imaging pool ("OT").
- OA and PSA study almost the same course, so they SHARE the clinical pool
  ("CLINICAL").

A "set" is identified by a `set_key` = "<topic_key>__<difficulty>" so the
frontend picker can offer topic AND difficulty, and the API can serve that
set's cards with per-user no-repeat rotation. Cards live in static_cards.py.
"""
from __future__ import annotations

DIFFICULTIES: list[str] = ["easy", "medium", "hard"]

# Ordered (topic_key, label) per pool — defines the 15 topics, in display order.
FLASHCARD_TOPICS: dict[str, list[tuple[str, str]]] = {
    "CLINICAL": [
        ("ocular_emergencies", "Ocular Emergencies"),
        ("red_eye", "Red Eye Differential"),
        ("triage", "Triage Categories"),
        ("history_taking", "History Taking"),
        ("distance_va", "Distance Visual Acuity"),
        ("near_vision", "Near Vision"),
        ("pinhole", "Pinhole Testing"),
        ("iop_nct", "IOP & Non-Contact Tonometry"),
        ("eye_drops", "Eye Drop Instillation"),
        ("pupil_dilation", "Pupil Dilation"),
        ("colour_vision", "Colour Vision (Ishihara)"),
        ("amsler_macula", "Amsler & Macula"),
        ("fall_risk", "Fall Risk"),
        ("perioperative", "Pre & Post-Operative Care"),
        ("abbreviations", "Ophthalmic Abbreviations"),
    ],
    "OT": [
        ("oct_macula", "Macular OCT"),
        ("oct_rnfl", "RNFL OCT"),
        ("hvf", "Humphrey Visual Field"),
        ("gvf", "Goldmann Visual Field"),
        ("ascan_biometry", "A-Scan Biometry"),
        ("optical_biometry", "Optical Biometry"),
        ("endothelial", "Endothelial Cell Count"),
        ("asoct", "Anterior Segment OCT"),
        ("flare", "Flare Test"),
        ("corneal_topography", "Corneal Topography"),
        ("pam", "Potential Acuity Meter"),
        ("hrt", "Heidelberg Retinal Tomography"),
        ("orthoptics", "Orthoptics"),
        ("dayward_theatre", "Dayward & Theatre"),
        ("auto_refraction", "Auto-Refraction & Keratometry"),
    ],
}


def pool_for_role(role: str) -> str:
    """OT has its own pool; OA and PSA share the CLINICAL pool."""
    return "OT" if (role or "").upper() == "OT" else "CLINICAL"


def make_set_key(topic_key: str, difficulty: str) -> str:
    return f"{topic_key}__{difficulty}"


def split_set_key(set_key: str) -> tuple[str, str]:
    """'topic__difficulty' -> (topic_key, difficulty)."""
    topic, _, difficulty = (set_key or "").rpartition("__")
    return topic, difficulty


def topics_for(role: str) -> list[tuple[str, str]]:
    return FLASHCARD_TOPICS[pool_for_role(role)]


def label_for(role: str, topic_key: str) -> str:
    for key, label in topics_for(role):
        if key == topic_key:
            return label
    return topic_key.replace("_", " ").title()


def sets_for(role: str) -> list[dict]:
    """All sets for a role, in (topic, difficulty) order."""
    out: list[dict] = []
    for topic_key, label in topics_for(role):
        for difficulty in DIFFICULTIES:
            out.append({
                "set_key": make_set_key(topic_key, difficulty),
                "topic_key": topic_key,
                "label": label,
                "difficulty": difficulty,
            })
    return out
