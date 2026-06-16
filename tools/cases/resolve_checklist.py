# tools/cases/resolve_checklist.py
"""Resolve a case to the right OSCE checklist.

Order: (1) explicit case.checklist_procedure, (2) keyword map -> one of the 20
canonical Supabase checklists, (3) rubric fallback (build a checklist from the
case's embedded rubric.key_points). Pure functions — the endpoint wires the
canonical name to Supabase via get_checklist_by_name and uses build_rubric_checklist
when name is None or the lookup misses.
"""

# Ordered keyword rules — FIRST match wins, so list the more specific rules first.
KEYWORD_RULES: list[tuple[tuple[str, ...], str]] = [
    (("dilation", "mydriasis"), "Eye Drop Instillation and Dilation"),
    (("eye_drop", "eyedrop", "instillation", "drop_instillation"), "Instillation of Eye Drops"),
    (("nct", "tonometry", "non-contact", "non_contact", "iop"), "Non-Contact Tonometry"),
    (("ascan", "a_scan", "biometry"), "Basic Biometry"),
    (("oct", "cirrus", "rnfl", "macular_oct"), "Cirrus OCT"),
    (("topography", "pentacam", "keratoconus", "topo"), "Cornea Topography"),
    (("auto_refraction", "autorefraction", "kerato", "refractometry"), "Auto Kerato-Refractometry (SOP)"),
    (("near_vision", "near_va", "presbyopia"), "Near Vision Testing (SOP)"),
    (("logmar", "snellen", "e_chart", "distance_va", "distance_vision", "pinhole",
      "low_vision", "visual_acuity", "va_testing"), "Distance Vision Testing LogMAR"),
    (("hvf", "humphrey", "visual_field", "gvf", "perimetry", "confrontation"), "Humphrey Visual Field"),
    (("pfaer", "fall_risk"), "PFAER and Fall Risk Assessment"),
    (("dayward", "preop", "postop", "pre_op", "post_op", "preoperative",
      "postoperative", "day_ward"), "Dayward and OT Skills Observation"),
    (("orthoptic", "hirschberg", "krimsky", "cover_uncover", "versions", "ductions",
      "npc", "convergence", "strabismus", "esotropia", "squint"), "Orthoptics Skills Observation"),
    (("endothelial", "specular", "flare_test", "flare", "ecc"), "Ophthalmic Investigations Skills Observation"),
    (("history", "triage", "pain_assessment", "red_eye", "uveitis", "keratitis", "floaters",
      "flashes", "retinal_detachment", "conjunctivitis", "subconjunctival", "foreign_body",
      "chemical_injury", "penetrating", "hyphaema", "glaucoma_triage", "crao", "flash_burn",
      "anticoagulant", "acute_angle_closure", "vision_loss", "counselling"), "History Taking"),
]

# Categories used for rubric-derived steps, by rubric domain.
_RUBRIC_DOMAIN_CATEGORY = {
    "history": "clinical_assessment",
    "investigations": "clinical_assessment",
    "diagnosis": "clinical_assessment",
    "management": "documentation",
}


def match_procedure(text: str) -> str | None:
    """Return the canonical checklist name for a topic/title blob, or None."""
    hay = (text or "").lower()
    for keys, name in KEYWORD_RULES:
        if any(k in hay for k in keys):
            return name
    return None


def resolve_procedure_name(case: dict) -> tuple[str | None, str]:
    """Return (canonical_checklist_name_or_None, how).

    how is one of: "explicit", "keyword", "rubric_fallback".
    """
    explicit = (case.get("checklist_procedure") or "").strip()
    if explicit:
        return explicit, "explicit"
    blob = f"{case.get('topic', '')} {case.get('title', '')}"
    name = match_procedure(blob)
    if name:
        return name, "keyword"
    return None, "rubric_fallback"


def build_rubric_checklist(case: dict) -> dict:
    """Build a checklist dict from the case's embedded rubric.key_points.

    Returns {procedure_name, steps:[{step_number,category,action,critical,notes}],
    total_steps, critical_count, source:"rubric"}.
    """
    rubric = case.get("rubric") or {}
    steps: list[dict] = []
    n = 0
    for domain in ("history", "investigations", "diagnosis", "management"):
        block = rubric.get(domain) or {}
        for point in block.get("key_points", []):
            n += 1
            steps.append({
                "step_number": n,
                "category": _RUBRIC_DOMAIN_CATEGORY.get(domain, "clinical_assessment"),
                "action": str(point),
                "critical": False,
                "notes": None,
            })
    return {
        "procedure_name": case.get("topic", "Case checklist"),
        "steps": steps,
        "total_steps": len(steps),
        "critical_count": 0,
        "source": "rubric",
    }
