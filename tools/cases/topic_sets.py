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
    # OA and PSA share ONE clinical pool (OA ≡ PSA). CLINICAL is the union of the
    # old OA + PSA sets — both perioperative (OA) and triage_referral (PSA).
    "CLINICAL": [
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
        ("triage_referral", "Triage & Referral"),
    ],
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
    # Unified clinical rules (OA ≡ PSA). Triage/referral gets its own set; the
    # PSA red-flag scenarios route to ocular_emergencies.
    "CLINICAL": [
        ("chemical", "ocular_emergencies"), ("penetrating", "ocular_emergencies"),
        ("foreign_body", "ocular_emergencies"), ("hyphaema", "ocular_emergencies"),
        ("acute_angle", "ocular_emergencies"), ("acute_glaucoma", "ocular_emergencies"),
        ("emergency", "ocular_emergencies"), ("redflags", "ocular_emergencies"),
        ("pain_assessment", "ocular_emergencies"), ("crao", "ocular_emergencies"),
        ("flash_burn", "ocular_emergencies"), ("welder", "ocular_emergencies"),
        ("triage", "triage_referral"), ("referral", "triage_referral"),
        ("floaters", "triage_referral"), ("flashes", "triage_referral"),
        ("subconjunctival", "red_eye"), ("keratitis", "red_eye"), ("uveitis", "red_eye"),
        ("conjunctivitis", "red_eye"), ("red_eye", "red_eye"), ("retinal_detachment", "red_eye"),
        ("dry_eye", "red_eye"),
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
    ],
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
        # Gap-fill OT stations (aberrometry, lens meter, retinal imaging, DR grading).
        ("aberrometry", "refraction_acuity"), ("wavefront", "refraction_acuity"),
        ("lens_meter", "refraction_acuity"), ("lensmeter", "refraction_acuity"),
        ("focimetry", "refraction_acuity"),
        ("retinal_imaging", "oct_imaging"), ("fundus_photography", "oct_imaging"),
        ("angiography", "oct_imaging"), ("photography", "oct_imaging"),
        ("dr_grading", "screening"), ("sorc", "screening"), ("retinopathy_grading", "screening"),
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

# Fallback set per pool when nothing matches (keeps every case bucketed).
_DEFAULT: dict[str, str] = {"CLINICAL": "history_taking", "OT": "screening"}


def case_pool(role: str) -> str:
    """OA and PSA share the CLINICAL case pool (OA ≡ PSA); OT is separate.
    Mirrors flashcards' pool_for_role for the OSCE side."""
    return "OT" if (role or "").upper() == "OT" else "CLINICAL"


def case_visible(student_role: str, case_role: str) -> bool:
    """A case is visible to a student if it's role-neutral ('any') or authored
    for a role in the student's pool (so OA-authored cases show to PSA, etc.)."""
    if (case_role or "any") == "any":
        return True
    return case_pool(case_role) == case_pool(student_role)


def resolve_set_strict(role: str, topic: str) -> str | None:
    """`resolve_set` without the `_DEFAULT` fallback: None when no rule matches.

    For a student-facing list "no match" being harmless (everything stays reachable
    via `_DEFAULT`) is the right call. Analytics callers need the opposite: filing an
    unrelated case into a fallback set would move a real group's cohort score, so they
    must be able to tell "no match" apart from "matched the fallback key on purpose."
    """
    pool = case_pool(role)
    topic = (topic or "").lower()
    for kw, key in _RULES.get(pool, []):
        if kw in topic:
            return key
    return None


def resolve_set(role: str, topic: str) -> str:
    """Return the set_key for a case's topic, bucketed within the role's POOL."""
    return resolve_set_strict(role, topic) or _DEFAULT.get(case_pool(role), "history_taking")


def label_for(role: str, set_key: str) -> str:
    for key, label in SET_LABELS.get(case_pool(role), []):
        if key == set_key:
            return label
    return set_key.replace("_", " ").title()


def sets_for(role: str) -> list[tuple[str, str]]:
    return SET_LABELS.get(case_pool(role), [])
