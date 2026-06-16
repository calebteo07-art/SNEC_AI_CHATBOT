# tools/cases/seed_demographics.py
"""One-time tool: backfill fixed, internally-consistent Singapore demographics
into every case file so the identity-verification (QnA) step works.

Values are seeded by case_id, so the tool is idempotent (only adds when missing)
and stable across runs. Run:  python tools/cases/seed_demographics.py
"""

import json
import random
import sys
from datetime import date, timedelta
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CASES_DIR = PROJECT_ROOT / "cases"

# Singapore NRIC checksum: weighted sum -> remainder -> letter table.
_NRIC_WEIGHTS = [2, 7, 6, 5, 4, 3, 2]
_ST_LETTERS = ["J", "Z", "I", "H", "G", "F", "E", "D", "C", "B", "A"]

_STREETS = [
    "Ang Mo Kio Ave 3", "Bedok North Rd", "Clementi Ave 2", "Tampines St 21",
    "Toa Payoh Lor 4", "Jurong West St 42", "Hougang Ave 8", "Yishun Ring Rd",
    "Bukit Batok St 25", "Serangoon Central", "Pasir Ris Dr 1", "Woodlands Ave 6",
]


def nric_check_letter(prefix: str, digits: str) -> str:
    """Return the NRIC check letter for an S/T-prefixed 7-digit body."""
    total = sum(int(d) * w for d, w in zip(digits, _NRIC_WEIGHTS))
    if prefix in ("T", "G"):
        total += 4
    return _ST_LETTERS[total % 11]


def generate_nric(rng: random.Random, birth_year: int) -> str:
    prefix = "S" if birth_year < 2000 else "T"
    digits = "".join(str(rng.randint(0, 9)) for _ in range(7))
    return f"{prefix}{digits}{nric_check_letter(prefix, digits)}"


def generate_dob(rng: random.Random, age: int, ref_date: date) -> str:
    """Pick a DOB that yields `age` as of ref_date (birthday already passed)."""
    birth_year = ref_date.year - age
    # Constrain so the birthday is on/before ref_date's month/day this year.
    month = rng.randint(1, ref_date.month)
    max_day = ref_date.day if month == ref_date.month else 28
    day = rng.randint(1, max(1, max_day))
    return date(birth_year, month, day).isoformat()


def generate_address(rng: random.Random) -> str:
    blk = rng.randint(1, 799)
    street = rng.choice(_STREETS)
    unit = f"#{rng.randint(2, 18):02d}-{rng.randint(1, 999):03d}"
    postal = f"{rng.randint(100000, 829999)}"
    return f"Blk {blk} {street}, {unit}, Singapore {postal}"


def generate_phone(rng: random.Random) -> str:
    return rng.choice("89") + "".join(str(rng.randint(0, 9)) for _ in range(7))


def seed_case(case: dict, ref_date: date | None = None) -> bool:
    """Add demographics to case['patient'] if missing. Returns True if changed."""
    ref_date = ref_date or date.today()
    patient = case.get("patient") or {}
    if patient.get("nric"):
        return False
    rng = random.Random(case.get("case_id", "seed"))
    age = int(patient.get("age", 50))
    patient["nric"] = generate_nric(rng, ref_date.year - age)
    patient["date_of_birth"] = generate_dob(rng, age, ref_date)
    patient["address"] = generate_address(rng)
    patient["contact_number"] = generate_phone(rng)
    case["patient"] = patient
    return True


def main() -> int:
    changed = 0
    ref = date(2026, 6, 16)
    for cf in sorted(CASES_DIR.glob("*.json")):
        case = json.loads(cf.read_text(encoding="utf-8"))
        if seed_case(case, ref_date=ref):
            cf.write_text(json.dumps(case, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            changed += 1
    print(f"Seeded demographics into {changed} case files.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
