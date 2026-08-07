# tools/cases/reveal_findings.py
"""The findings a station's action panel may reveal, from wherever the case authored them.

`build_actions` reads one dict. It used to be handed `case["examination_findings"]` alone,
and on 15 stations the headline measurement is not there — it is under `investigations`,
authored as `ishihara_test`, `colour_vision_ishihara`, `amsler_grid`, `near_vision` or
`va_near`. `/station` never returns `investigations`, so those chips revealed "" : the
student performed the Ishihara test and the transcript showed no plate score, while the
checklist asked them to record the number of plates correct and /action graded them with
"Measured finding: (none)". The only route to the number was asking the patient to recite
their own colour-vision score — which is also the persona break we just closed.

Why `investigations` was previously ruled out as a reveal source, and why it is safe now:

  1. It also holds MARKING KEYS. 16 cases carry `task` / `key_points` there, and one of
     those revealed through a chip would hand over the answer. `strip_marking` removes them
     before anything here sees them (tools/cases/patient_view.py owns that list, so the
     patient channel and the reveal channel cannot drift apart).

  2. Its key names are not the engine's family names. `_ALIASES` maps them; anything
     unmapped stays inert, because `_finding_for_step` only reveals a key whose canonical
     family is in FINDING_LABELS *and* whose chip carries that family's label. An unknown
     key can never match, so widening the source cannot widen what leaks.

`examination_findings` wins every conflict: it is the authored, gated source, and this only
fills gaps.
"""

from tools.cases.patient_view import strip_marking

# investigations key -> the engine's canonical finding family, matched on a SUBSTRING
# because the corpus spells the same measurement several ways: `ishihara_test`,
# `ishihara_colour_vision` and `colour_vision_ishihara` are all the same reading, and an
# exact-name table silently missed whichever spelling nobody thought of.
#
# Only families that exist in FINDING_LABELS can ever reveal, so this stays an allowlist:
# a key matching nothing here is inert, exactly as it was before.
_FAMILY_RULES: tuple[tuple[tuple[str, ...], str], ...] = (
    (("ishihara", "colour_vision", "color_vision"), "colour_vision"),
    (("amsler",), "amsler"),
    (("near_vision", "near_va", "va_near", "near_acuity"), "near_va"),
)


def _family_for(key: str) -> str | None:
    low = str(key).lower()
    for needles, family in _FAMILY_RULES:
        if any(n in low for n in needles):
            return family
    return None


def revealable_findings(case: dict) -> dict:
    """Merge the case's authored measurements into one dict for `build_actions`."""
    findings = dict(case.get("examination_findings") or {})
    investigations = strip_marking(case.get("investigations") or {})
    if not isinstance(investigations, dict):
        return findings
    for key, value in investigations.items():
        family = _family_for(key)
        if family and family not in findings and value:
            findings[family] = value
    return findings
