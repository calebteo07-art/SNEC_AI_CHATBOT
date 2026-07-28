"""Flashcard `topic_tag` -> case set-key group. Pure data + one function, no I/O.

`flashcard_attempts.topic_tag` carries FLASHCARD topic keys (45, defined in
tools/flashcards/flashcard_sets.py:26-79). OSCE aggregation groups by CASE set
keys (21, defined in tools/cases/topic_sets.py:17-69). The namespaces are
DISJOINT, and `topic_sets.resolve_set` cannot say "no match" — it falls through
its ordered substring rules to `_DEFAULT` (topic_sets.py:168), so a flashcard tag
handed to it is silently absorbed:

    resolve_set("OA", "anatomy_physiology") -> "history_taking"
    resolve_set("OT", "hrt")                -> "screening"

Whole knowledge families would then be ranked as weak *procedural* sets. Hence an
EXPLICIT map, never a derived one. tests/content/test_topic_crosswalk.py iterates
every key in both taxonomies, so new content fails CI rather than vanishing.
"""
from __future__ import annotations

from tools.flashcards.flashcard_sets import DIFFICULTIES

# Pseudo-group for flashcard topics with no OSCE counterpart. Not a case set key,
# so a group carrying it renders flashcard-only (osce attempts = 0).
KNOWLEDGE_GROUP: str = "knowledge_foundations"

# flashcard topic_key -> case set_key | KNOWLEDGE_GROUP.
FLASHCARD_TO_SET: dict[str, str] = {
    # --- FOUNDATIONS (12) ------------------------------------------------------
    # Shared knowledge layer studied by EVERY role (flashcard_sets.py:88-90). No
    # case set is a counterpart: the case library is split into two disjoint
    # procedural pools, so pointing a shared knowledge deck at a CLINICAL set key
    # would fold OT students' accuracy into a station they never sit — and the
    # reverse for OT. `ocular_emergencies` and `glaucoma` collide by NAME with
    # clinical concepts; that is not a counterpart, it is a collision.
    "anatomy_physiology": KNOWLEDGE_GROUP,
    "microbiology_infection": KNOWLEDGE_GROUP,
    "pharmacology": KNOWLEDGE_GROUP,
    "ocular_emergencies": KNOWLEDGE_GROUP,
    "professional_ethics": KNOWLEDGE_GROUP,
    "disorders_eyelid_lacrimal_orbit": KNOWLEDGE_GROUP,
    "disorders_cornea_conjunctiva": KNOWLEDGE_GROUP,
    "disorders_lens_cataract": KNOWLEDGE_GROUP,
    "disorders_uvea_retina": KNOWLEDGE_GROUP,
    "glaucoma": KNOWLEDGE_GROUP,
    "neuro_strabismus": KNOWLEDGE_GROUP,
    "systemic_disease": KNOWLEDGE_GROUP,

    # --- CLINICAL (14) -> CLINICAL set keys ------------------------------------
    "red_eye": "red_eye",
    "triage": "triage_referral",
    "history_taking": "history_taking",
    "distance_va": "visual_acuity",       # the OSCE set is "Visual Acuity & Refraction"
    "near_vision": "visual_acuity",
    "pinhole": "visual_acuity",
    "iop_nct": "tonometry_iop",
    "eye_drops": "eye_drops",
    "pupil_dilation": "pupil_dilation",
    "colour_vision": "colour_macular",    # the OSCE set is "Colour Vision & Amsler"
    "amsler_macula": "colour_macular",
    "fall_risk": "fall_risk",
    "perioperative": "perioperative",
    # Cross-cutting notation drilled for every role; no station examines it.
    "abbreviations": KNOWLEDGE_GROUP,

    # --- OT (19) -> OT set keys -------------------------------------------------
    "oct_macula": "oct_imaging",
    "oct_rnfl": "oct_imaging",
    "hvf": "visual_fields",
    "gvf": "visual_fields",
    "ascan_biometry": "biometry",
    "optical_biometry": "biometry",
    "endothelial": "anterior_segment",
    "asoct": "anterior_segment",
    "flare": "anterior_segment",
    "corneal_topography": "corneal_topography",
    "pam": "precataract_pam",
    # HRT is confocal scanning-laser tomography of the optic nerve head, i.e.
    # structural posterior-segment imaging — it belongs with the OCT stations.
    # resolve_set has no `hrt` rule and would dump it in `screening` via _DEFAULT.
    "hrt": "oct_imaging",
    "orthoptics": "orthoptics",
    "dayward_theatre": "dayward_theatre",
    "auto_refraction": "refraction_acuity",
    "aberrometry": "refraction_acuity",
    "lens_meter": "refraction_acuity",
    "retinal_imaging": "oct_imaging",
    "dr_grading": "screening",            # SORC grading is the screening station

    # --- Legacy / default column value ----------------------------------------
    # migration 010 declares `topic_tag TEXT NOT NULL DEFAULT 'general'`
    # (010_flashcard_attempts.sql:14) and the card serialiser falls back to it
    # (tools/api/routers/student.py:331,341). Real rows carry it; map it explicitly.
    "general": KNOWLEDGE_GROUP,
}

_DIFFICULTIES: frozenset[str] = frozenset(DIFFICULTIES)


def flashcard_group(topic_tag: str) -> str:
    """Bucket one `flashcard_attempts.topic_tag` into a topic group.

    Strips a trailing "__<difficulty>" first: flashcards build set keys as
    "<topic>__<difficulty>" (flashcard_sets.py:93) and either form can reach the
    column. Only a KNOWN difficulty is stripped, and `split_set_key` is
    deliberately not reused — its bare `rpartition("__")` returns ("", "", tag)
    for a plain topic key, which would blank every unsuffixed tag.

    Unknown tags fall back to KNOWLEDGE_GROUP, never to an OSCE-backed set: a
    stray tag must not be able to move a procedural group's accuracy. Every real
    topic is an explicit key above, enforced by tests/content/test_topic_crosswalk.py.
    """
    tag = (topic_tag or "").strip().lower()
    head, sep, tail = tag.rpartition("__")
    if sep and head and tail in _DIFFICULTIES:
        tag = head
    return FLASHCARD_TO_SET.get(tag, KNOWLEDGE_GROUP)
