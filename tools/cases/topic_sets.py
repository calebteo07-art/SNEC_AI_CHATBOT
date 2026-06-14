"""Topic-set taxonomy for cases — 10 selectable sets per role.

Each role's case library is organised into 10 topic-sets (the user picks a set
to study, target 5 cases each). Sets are grounded in the SNEC KB / role's field:
- OT  -> ophthalmic investigations / imaging.
- OA and PSA study almost the same course, so they share a parallel clinical
  taxonomy (one set differs to match each role's actual scope: OA does
  peri-operative care; PSA does front-line triage/referral).

`resolve_set(role, topic)` buckets a case's granular `topic` into its set using
ordered substring rules (first match wins), so existing cases need no edits and
new cases slot in automatically by their topic name.
"""
from __future__ import annotations

# Ordered (set_key, label) per role — defines the 10 sets and their display order.
SET_LABELS: dict[str, list[tuple[str, str]]] = {
    "OA": [
        ("ocular_emergencies", "Ocular Emergencies"),
        ("red_eye", "Red Eye Differential"),
        ("history_taking", "History Taking"),
        ("visual_acuity", "Visual Acuity & Refraction"),
        ("tonometry_iop", "Intraocular Pressure"),
        ("eye_drops", "Eye Drop Instillation"),
        ("pupil_dilation", "Pupil Dilation"),
        ("colour_macular", "Colour Vision & Amsler"),
        ("fall_risk", "Fall Risk & Assessment"),
        ("perioperative", "Pre & Post-Operative Care"),
    ],
    "PSA": [
        ("ocular_emergencies", "Ocular Emergencies"),
        ("red_eye", "Red Eye Differential"),
        ("history_taking", "History Taking"),
        ("visual_acuity", "Visual Acuity & Near Vision"),
        ("tonometry_iop", "Non-Contact Tonometry"),
        ("eye_drops", "Eye Drop Instillation"),
        ("pupil_dilation", "Pupil Dilation"),
        ("colour_macular", "Colour Vision & Amsler"),
        ("fall_risk", "Fall Risk & PFAER"),
        ("triage_referral", "Triage & Referral"),
    ],
    "OT": [
        ("oct_imaging", "OCT Imaging"),
        ("visual_fields", "Visual Field Testing"),
        ("biometry", "Biometry & IOL"),
        ("corneal_topography", "Corneal Topography"),
        ("anterior_segment", "Anterior Segment & Inflammation"),
        ("refraction_acuity", "Refraction & Acuity"),
        ("orthoptics", "Orthoptics"),
        ("screening", "Screening Tests"),
        ("precataract_pam", "Potential Acuity & Pre-Cataract"),
        ("dayward_theatre", "Dayward & Theatre"),
    ],
}

# Ordered substring rules per role; first match wins. Order matters where a topic
# contains several keywords (e.g. dilation before instillation).
_RULES: dict[str, list[tuple[str, str]]] = {
    "OA": [
        ("chemical", "ocular_emergencies"), ("penetrating", "ocular_emergencies"),
        ("foreign_body", "ocular_emergencies"), ("hyphaema", "ocular_emergencies"),
        ("acute_angle", "ocular_emergencies"), ("emergency", "ocular_emergencies"),
        ("subconjunctival", "red_eye"), ("keratitis", "red_eye"), ("uveitis", "red_eye"),
        ("conjunctivitis", "red_eye"), ("red_eye", "red_eye"), ("retinal_detachment", "red_eye"),
        ("history", "history_taking"),
        ("dilation", "pupil_dilation"), ("dilate", "pupil_dilation"), ("mydriasis", "pupil_dilation"),
        ("instillation", "eye_drops"), ("eye_drop", "eye_drops"),
        ("ishihara", "colour_macular"), ("colour", "colour_macular"), ("amsler", "colour_macular"),
        ("fall_risk", "fall_risk"), ("pfaer", "fall_risk"),
        ("preop", "perioperative"), ("pre_op", "perioperative"), ("postop", "perioperative"),
        ("post_op", "perioperative"), ("perioperative", "perioperative"), ("dayward", "perioperative"),
        ("dressing", "perioperative"), ("counselling", "perioperative"), ("cataract", "perioperative"),
        ("nct", "tonometry_iop"), ("tonometry", "tonometry_iop"), ("iop", "tonometry_iop"),
        ("refraction", "visual_acuity"), ("logmar", "visual_acuity"), ("snellen", "visual_acuity"),
        ("near_vision", "visual_acuity"), ("pinhole", "visual_acuity"), ("acuity", "visual_acuity"),
        ("va", "visual_acuity"),
        ("triage", "history_taking"),
    ],
    "PSA": [
        ("chemical", "ocular_emergencies"), ("penetrating", "ocular_emergencies"),
        ("foreign_body", "ocular_emergencies"), ("hyphaema", "ocular_emergencies"),
        ("acute_glaucoma", "ocular_emergencies"), ("redflags", "ocular_emergencies"),
        ("pain_assessment", "ocular_emergencies"),
        ("triage", "triage_referral"), ("referral", "triage_referral"),
        ("floaters", "triage_referral"), ("flashes", "triage_referral"),
        ("subconjunctival", "red_eye"), ("keratitis", "red_eye"), ("uveitis", "red_eye"),
        ("conjunctivitis", "red_eye"), ("red_eye", "red_eye"),
        ("history", "history_taking"),
        ("dilation", "pupil_dilation"), ("dilate", "pupil_dilation"), ("mydriasis", "pupil_dilation"),
        ("instillation", "eye_drops"), ("eye_drop", "eye_drops"),
        ("ishihara", "colour_macular"), ("colour", "colour_macular"), ("amsler", "colour_macular"),
        ("fall_risk", "fall_risk"), ("pfaer", "fall_risk"),
        ("nct", "tonometry_iop"), ("tonometry", "tonometry_iop"), ("iop", "tonometry_iop"),
        ("refraction", "visual_acuity"), ("logmar", "visual_acuity"), ("snellen", "visual_acuity"),
        ("near_vision", "visual_acuity"), ("pinhole", "visual_acuity"), ("acuity", "visual_acuity"),
        ("va", "visual_acuity"),
    ],
    "OT": [
        ("asoct", "anterior_segment"), ("endothelial", "anterior_segment"), ("flare", "anterior_segment"),
        ("oct", "oct_imaging"), ("macular", "oct_imaging"), ("rnfl", "oct_imaging"),
        ("hvf", "visual_fields"), ("humphrey", "visual_fields"), ("gvf", "visual_fields"),
        ("visual_field", "visual_fields"),
        ("topography", "corneal_topography"), ("pentacam", "corneal_topography"),
        ("biometry", "biometry"), ("ascan", "biometry"), ("a_scan", "biometry"), ("iol", "biometry"),
        ("coherence_biometry", "biometry"),
        ("cover_uncover", "orthoptics"), ("npc", "orthoptics"), ("convergence", "orthoptics"),
        ("versions", "orthoptics"), ("ductions", "orthoptics"), ("orthoptic", "orthoptics"),
        ("pam", "precataract_pam"), ("potential_acuity", "precataract_pam"),
        ("dayward", "dayward_theatre"), ("theatre", "dayward_theatre"), ("preoperative", "dayward_theatre"),
        ("instillation", "dayward_theatre"), ("pretest", "dayward_theatre"),
        ("nct", "screening"), ("tonometry", "screening"), ("ishihara", "screening"),
        ("auto_refraction", "refraction_acuity"), ("logmar", "refraction_acuity"),
        ("near_vision", "refraction_acuity"), ("pinhole", "refraction_acuity"),
        ("refraction", "refraction_acuity"), ("acuity", "refraction_acuity"),
    ],
}

# Fallback set per role when nothing matches (keeps every case bucketed).
_DEFAULT: dict[str, str] = {"OA": "history_taking", "PSA": "history_taking", "OT": "screening"}


def resolve_set(role: str, topic: str) -> str:
    """Return the set_key for a case's role + granular topic."""
    role = (role or "").upper()
    topic = (topic or "").lower()
    for kw, key in _RULES.get(role, []):
        if kw in topic:
            return key
    return _DEFAULT.get(role, "history_taking")


def label_for(role: str, set_key: str) -> str:
    for key, label in SET_LABELS.get((role or "").upper(), []):
        if key == set_key:
            return label
    return set_key.replace("_", " ").title()


def sets_for(role: str) -> list[tuple[str, str]]:
    return SET_LABELS.get((role or "").upper(), [])
