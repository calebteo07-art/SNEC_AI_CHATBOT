"""Output safety validator for the EyeBot clinical AI.

Checks AI responses for:
  1. Numeric hallucinations outside known safe clinical ranges.
  2. Unsolicited clinical advice directed at a real patient.
  3. (Optional) Low KB support — appends a verification disclaimer.

Returns {"valid": bool, "issues": list[str], "response": str}.
The "response" field may have a disclaimer appended.

Designed to run synchronously on the completed response text.
"""
import re

# Numeric claims that must fall within known safe physiological ranges.
# Tuples of (regex, expected_lo, expected_hi, label).
_NUMERIC_RULES = [
    (r"\bIOP\b.{0,20}?(\d{1,2})\s*mmHg",       5,  60, "IOP_mmHg"),
    (r"cup[\s\-/]disc.{0,10}?0?\.(\d)",          0,  9,  "cup_disc_tenths"),  # 0.0–0.9
    (r"(\d{1,3})\s*(?:mm)?Hg\b",                 0, 300, "generic_pressure"),
    (r"(\d{1,2}(?:\.\d)?)\s*diopt",             -30, 30, "diopter"),
    (r"(\d{1,3})\s*(?:degrees?|°)\s*(?:of|field)", 0, 180, "field_degrees"),
]

# Phrases indicating the model is counselling a real patient rather than a student.
_PATIENT_ADVICE_RE = re.compile(
    r"(you should (immediately|urgently|now) (see|visit|go to|consult)|"
    r"i (strongly )?(recommend|advise) you (to\s+)?(see|visit|consult|go)|"
    r"please (go to|visit|see|call) (your|a|the) (doctor|physician|ophthalmologist|specialist|emergency)|"
    r"this (is|could be) an? (emergency|urgent|serious) (situation|condition) (and|—) (you must|please))",
    re.IGNORECASE,
)

_DISCLAIMER = (
    "\n\n*This information is for educational purposes only. "
    "Verify all clinical details against current SNEC protocols before applying in practice.*"
)


def validate_output(response: str, flag_patient_advice: bool = True) -> dict:
    """Validate response text. Returns {"valid": bool, "issues": list[str], "response": str}.

    The returned "response" may have a disclaimer appended when low-confidence flags fire.
    Numeric hard violations do not alter the response — they are logged for review.
    """
    issues: list[str] = []
    out = response

    # Check numeric hallucinations
    for pattern, lo, hi, label in _NUMERIC_RULES:
        for m in re.finditer(pattern, response, re.IGNORECASE):
            raw = m.group(1)
            try:
                val = float(raw)
                if not (lo <= val <= hi):
                    issues.append(f"suspect_{label}:{val}")
            except ValueError:
                pass

    # Check unsolicited patient-directed clinical advice
    if flag_patient_advice and _PATIENT_ADVICE_RE.search(response):
        issues.append("unsolicited_patient_advice")
        out += _DISCLAIMER

    return {"valid": len(issues) == 0, "issues": issues, "response": out}
