"""OSCE patient-face archetypes — deterministic demographic → face mapping.

Pure and server-authoritative (WAT: probabilistic AI reasons, deterministic code
executes). `ARCHETYPES` is the single source of valid ids, used to render, to
validate, and to generate. Ethnicity-from-name is a deliberately conservative,
default-safe heuristic (RICOE v2 §8 patient-faces spec): right for the vast
majority of Singaporean names, and when unsure it defaults to the largest group
rather than guessing wrong. It never raises.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Archetype:
    id: str
    label: str
    ethnicity: str   # chinese | malay | indian | any (children)
    gender: str      # male | female
    band: str        # young | middle | senior | elderly | child
    prompt: str      # warm semi-realistic portrait prompt for the flash generator


ETHNICITIES = ("chinese", "malay", "indian")
GENDERS = ("male", "female")
ADULT_BANDS = ("young", "middle", "senior", "elderly")

_BAND_PHRASE = {
    "young": "adult in their early thirties",
    "middle": "person in their early fifties",
    "senior": "person in their late sixties",
    "elderly": "elderly person in their late seventies",
}
_ETH_PHRASE = {"chinese": "Chinese", "malay": "Malay", "indian": "Indian"}


def _gender_noun(gender: str, band: str) -> str:
    if band == "child":
        return "boy" if gender == "male" else "girl"
    return "man" if gender == "male" else "woman"


def _adult_prompt(ethnicity: str, gender: str, band: str) -> str:
    noun = _gender_noun(gender, band)
    return (
        f"A warm, semi-realistic portrait of a {_BAND_PHRASE[band]} "
        f"{_ETH_PHRASE[ethnicity]} Singaporean {noun}, friendly approachable "
        "expression, soft even studio lighting, plain warm-neutral background, "
        "head-and-shoulders, facing the camera, dignified and natural. Softly "
        "rendered photorealism — not hyperreal, not a cartoon. No text, no "
        "border, no watermark."
    )


def _child_prompt(gender: str) -> str:
    noun = "boy" if gender == "male" else "girl"
    return (
        f"A warm, semi-realistic portrait of a Singaporean {noun} around eight "
        "years old, cheerful gentle expression, soft even studio lighting, plain "
        "warm-neutral background, head-and-shoulders, facing the camera, natural "
        "and friendly. Softly rendered photorealism — not hyperreal, not a "
        "cartoon. No text, no border, no watermark."
    )


def _build_registry() -> dict[str, Archetype]:
    reg: dict[str, Archetype] = {}
    for eth in ETHNICITIES:
        for g in GENDERS:
            for b in ADULT_BANDS:
                aid = f"{eth}_{g}_{b}"
                reg[aid] = Archetype(aid, f"{eth.title()} {g} {b}", eth, g, b, _adult_prompt(eth, g, b))
    for g in GENDERS:
        aid = "child_boy" if g == "male" else "child_girl"
        reg[aid] = Archetype(aid, f"Child {_gender_noun(g, 'child')}", "any", g, "child", _child_prompt(g))
    return reg


ARCHETYPES: dict[str, Archetype] = _build_registry()


# ── Classification (pure, default-safe) ───────────────────────────────────────

_MALAY_TOKENS = {"bin", "binte", "bte"}
_MALAY_NAMES = {
    "muhammad", "mohamed", "mohammad", "nur", "nurul", "siti", "ahmad", "farah",
    "hafiz", "yusof", "ismail", "abdullah", "aisyah", "faizal", "rahman", "hassan",
}
_INDIAN_NAMES = {
    "rajasekaran", "pillai", "nair", "kumar", "raj", "saraswathy", "devi",
    "krishnan", "ramasamy", "subramaniam", "anand", "priya", "suresh", "lakshmi",
}
_HONORIFIC_GENDER = {
    "mr": "male", "master": "male", "mdm": "female", "ms": "female",
    "miss": "female", "mrs": "female",
}


def _classify_ethnicity(name: str) -> str:
    low = name.lower()
    if "s/o" in low or "d/o" in low:
        return "indian"
    tokens = set(low.replace(".", "").split())
    if tokens & _MALAY_TOKENS or tokens & _MALAY_NAMES:
        return "malay"
    if tokens & _INDIAN_NAMES:
        return "indian"
    return "chinese"


def _classify_gender(patient: dict) -> str:
    g = str(patient.get("gender", "")).strip().lower()
    if g in ("male", "female"):
        return g
    parts = str(patient.get("name", "")).split()
    first = parts[0].lower().rstrip(".") if parts else ""
    return _HONORIFIC_GENDER.get(first, "male")


def _classify_band(age) -> str:
    try:
        a = int(age)
    except (TypeError, ValueError):
        a = 40
    if a < 16:
        return "child"
    if a < 40:
        return "young"
    if a < 60:
        return "middle"
    if a < 75:
        return "senior"
    return "elderly"


def classify_patient(patient: dict) -> str:
    """Map a case `patient` dict to a registered archetype id. Never raises."""
    band = _classify_band(patient.get("age"))
    gender = _classify_gender(patient)
    if band == "child":
        return "child_boy" if gender == "male" else "child_girl"
    ethnicity = _classify_ethnicity(str(patient.get("name", "")))
    return f"{ethnicity}_{gender}_{band}"


def face_path(archetype_id: str) -> str:
    """Public path a browser loads for an archetype face."""
    return f"/patients/{archetype_id}.webp"
