"""Topic + difficulty taxonomy for flashcards.

Topics are grouped into pools. Every role studies the shared FOUNDATIONS pool
(knowledge domains) PLUS its own procedural pool, each topic x 3 difficulty
tiers (easy, medium, hard). Mirrors check-in pooling for the procedural split:
- FOUNDATIONS -> shared knowledge (anatomy, microbiology, pharmacology, disease,
  ethics) studied by ALL roles.
- OT  -> ophthalmic investigations / imaging pool ("OT").
- OA and PSA study almost the same course, so they SHARE the clinical pool
  ("CLINICAL").
So topics_for(role) = FOUNDATIONS topics + the role's procedural-pool topics.

A "set" is identified by a `set_key` = "<topic_key>__<difficulty>" so the
frontend picker can offer topic AND difficulty, and the API can serve that
set's cards with per-user no-repeat rotation. Cards live in static_cards.py.
"""
from __future__ import annotations

DIFFICULTIES: list[str] = ["easy", "medium", "hard"]

# Ordered (topic_key, label) per pool, in display order.
# FOUNDATIONS is a shared knowledge layer studied by EVERY role (grounded in the
# KB knowledge domains: anatomy, microbiology, pharmacology, disease, ethics).
# CLINICAL = OA/PSA procedures; OT = ophthalmic-investigation procedures.
# topics_for(role) returns FOUNDATIONS + the role's procedural pool.
FLASHCARD_TOPICS: dict[str, list[tuple[str, str]]] = {
    "FOUNDATIONS": [
        ("anatomy_physiology", "Ocular Anatomy & Physiology"),
        ("microbiology_infection", "Microbiology & Infection Control"),
        ("pharmacology", "Ocular Pharmacology"),
        ("ocular_emergencies", "Ocular Emergencies"),
        ("professional_ethics", "Professional Practice & Ethics"),
        ("disorders_eyelid_lacrimal_orbit", "Eyelid, Lacrimal & Orbit Disorders"),
        ("disorders_cornea_conjunctiva", "Cornea, Sclera & Conjunctiva Disorders"),
        ("disorders_lens_cataract", "Lens & Cataract Disorders"),
        ("disorders_uvea_retina", "Uvea & Retina Disorders"),
        ("glaucoma", "Glaucoma"),
        ("neuro_strabismus", "Neuro-ophthalmology & Strabismus"),
        ("systemic_disease", "Systemic Disease & the Eye"),
    ],
    "CLINICAL": [
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
        # Gap-fill from the SNEC Procedure Manual (Ch5) + diagnostic docs:
        ("aberrometry", "Aberrometry"),
        ("lens_meter", "Lens Meter (Focimetry)"),
        ("retinal_imaging", "Retinal Imaging & Photography"),
        ("dr_grading", "Diabetic Retinopathy Grading (SORC)"),
    ],
}


def pool_for_role(role: str) -> str:
    """The role's PROCEDURAL pool. OT has its own; OA and PSA share CLINICAL."""
    return "OT" if (role or "").upper() == "OT" else "CLINICAL"


def pools_for(role: str) -> list[str]:
    """Every pool a role studies — shared FOUNDATIONS first, then its procedures.
    This (not pool_for_role) is the source of truth for card lookups."""
    return ["FOUNDATIONS", pool_for_role(role)]


def make_set_key(topic_key: str, difficulty: str) -> str:
    return f"{topic_key}__{difficulty}"


def split_set_key(set_key: str) -> tuple[str, str]:
    """'topic__difficulty' -> (topic_key, difficulty)."""
    topic, _, difficulty = (set_key or "").rpartition("__")
    return topic, difficulty


def topics_for(role: str) -> list[tuple[str, str]]:
    """Foundations topics + the role's procedural-pool topics, in display order."""
    out: list[tuple[str, str]] = []
    for pool in pools_for(role):
        out.extend(FLASHCARD_TOPICS[pool])
    return out


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


def topic_sets_for(role: str) -> list[dict]:
    """One selectable deck per topic (difficulty collapsed) — the no-difficulty
    selection model. `set_key` is just the `topic_key`; the API serves it by
    mixing all tiers of that topic."""
    return [
        {"set_key": topic_key, "topic_key": topic_key, "label": label}
        for topic_key, label in topics_for(role)
    ]


def typed_count(n: int) -> int:
    """How many typed-reasoning cards a deck of `n` should have (~1 per 5)."""
    return round(n / 5)
