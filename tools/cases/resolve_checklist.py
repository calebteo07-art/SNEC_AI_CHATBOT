# tools/cases/resolve_checklist.py
"""Resolve a case to the right OSCE checklist.

Order: (1) explicit case.checklist_procedure, (2) keyword map -> one of the 20
canonical Supabase checklists, (3) rubric fallback (build a checklist from the
case's embedded rubric.key_points). Pure functions — the endpoint wires the
canonical name to Supabase via get_checklist_by_name and uses build_rubric_checklist
when name is None or the lookup misses.
"""

# Marker for the supervisor LOGBOOK TALLY SHEETS that also live in the `checklists`
# table ("Dayward and OT Skills Observation", "Orthoptics Skills Observation", …).
# Each row is a roster entry repeated per observed patient ("Record patient's Date,
# Age, Sex, Race; … Obtain preceptor's Name and Signature"), not a step to perform, so
# a station must never resolve to one.
#
# The NAME is the discriminator — `checklist_type` is NOT: Ishihara, Amsler and I-Care
# are real procedures that are also tagged 'logbook'.
_TALLY_SHEET_MARKER = "skills observation"

# Checklist rows that a station must never grade against, mapped to their replacement.
# CC-D0008 (the SNEC Nursing competency assessment) is the authority for distance VA.
# The row ingested from the older SOP NU-PR-OPD-D0039 v03 contradicts it on reading
# direction (right-to-left vs left-to-right), test distance, and the pinhole steps at
# 6/60 and 6/120, so resolving to it would grade students on superseded steps. The row
# may still exist in Supabase until it is cleaned up.
# See docs/notes/2026-07-31-distance-va-source-conflict.md
SUPERSEDED_CHECKLISTS: dict[str, str] = {
    "Distance Vision Testing LogMAR (SOP)": "Distance Vision Testing LogMAR",
}


def is_tally_sheet(name: str | None) -> bool:
    """True if `name` is a preceptor logbook tally sheet rather than a procedure."""
    return _TALLY_SHEET_MARKER in (name or "").lower()


def current_checklist_name(name: str) -> str:
    """Map a superseded checklist name to the one that supersedes it."""
    return SUPERSEDED_CHECKLISTS.get(name, name)


# Ordered keyword rules — FIRST match wins, so list the more specific rules first.
KEYWORD_RULES: list[tuple[tuple[str, ...], str]] = [
    # Ophthalmic investigations with a hand-authored checklist (see
    # tools/kb/seed_authored_checklists.py). These MUST outrank the generic rules below:
    # "pam_dense_cataract" also contains "cataract", and "flare"/"endothelial" used to
    # fall through to the "Ophthalmic Investigations Skills Observation" LOGBOOK TALLY
    # SHEET, which left those stations with an empty action panel.
    (("pam", "potential_acuity", "macula_potential", "potential acuity"),
     "Macula Potential (Acuity Test) Investigation"),
    (("endothelial", "specular", "ecc"), "Endothelial Cell Count Investigation"),
    (("flare_test", "flare"), "Flare Cell Measurement Investigation"),
    (("aberrometry", "wavefront"), "Aberrometry Investigation"),
    (("focimetry", "lens_meter", "lensmeter", "focimeter"), "Lens Meter Investigation"),

    (("ishihara", "colour_vision", "color_vision"), "Ishihara Colour Vision Testing"),
    (("amsler", "metamorphopsia"), "Amsler Grid Testing"),
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
    # NOTE: endothelial / flare / PAM / aberrometry / focimetry are handled by the
    # authored-checklist rules at the top. What remains pointed at this LOGBOOK TALLY
    # SHEET (AS-OCT, fundus photography, DR grading) has no authored checklist yet — see
    # the "* Skills Observation" caveat in the module docstring.
    (("asoct", "as_oct", "anterior_segment_oct"), "Ophthalmic Investigations Skills Observation"),
    # "History Taking" is not a general history checklist — it is a 29-step RED EYE
    # interview. Steps 5-8 are literally "Ask about patient complaints of red eye: how long
    # has the eye been red?", 11/13/14 are itching and discharge colour, and step 28 is
    # "Ensure patient is directed to waiting room."
    #
    # The rule used to open with the catch-alls "history" and "triage", which dragged in
    # every history and triage case in the corpus regardless of presentation: CRAO (whose
    # own case file says "Quiet, white eye (no redness)" and whose management says "do not
    # leave the patient waiting" — so step 28 PAID the student for the one thing the case
    # forbids), retinal detachment, flashes/floaters, diabetic and general-health history,
    # and a TELEPHONE chemical-splash triage where the patient is not in the building and
    # every physical step is untickable.
    #
    # Narrowed to presentations that genuinely involve a red eye. Trauma and angle-closure
    # stay: those eyes ARE red. Everything dropped falls through to the case's own
    # rubric — derived from that case, so at worst it is generic, never contradictory.
    # A case whose topic slug doesn't say "red eye" but whose presentation does now names
    # the checklist explicitly (`checklist_procedure`), which is the honest place for it.
    # Pinned exactly by tests/cases/test_history_checklist_fit.py.
    (("red_eye", "uveitis", "iritis", "keratitis", "conjunctivitis", "subconjunctival",
      "dry_eye", "foreign_body", "chemical_injury", "glaucoma_triage", "flash_burn",
      "acute_angle_closure", "pain_assessment"), "History Taking"),
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
        return current_checklist_name(explicit), "explicit"
    blob = f"{case.get('topic', '')} {case.get('title', '')}"
    name = match_procedure(blob)
    if name:
        return current_checklist_name(name), "keyword"
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
