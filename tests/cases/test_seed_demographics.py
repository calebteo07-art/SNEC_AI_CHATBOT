import copy
from datetime import date

from tools.cases.seed_demographics import seed_case, nric_check_letter

REF = date(2026, 6, 16)


def _case():
    return {"case_id": "case_demo_001", "patient": {"name": "Mr Tan", "age": 55}}


def test_adds_demographics_fields():
    c = _case()
    changed = seed_case(c, ref_date=REF)
    assert changed is True
    p = c["patient"]
    assert set(("nric", "date_of_birth", "address", "contact_number")) <= set(p)


def test_nric_format_and_checksum_valid():
    c = _case()
    seed_case(c, ref_date=REF)
    nric = c["patient"]["nric"]
    assert len(nric) == 9
    assert nric[0] in ("S", "T")
    assert nric[1:8].isdigit()
    assert nric[8] == nric_check_letter(nric[0], nric[1:8])


def test_dob_yields_stated_age():
    c = _case()
    seed_case(c, ref_date=REF)
    dob = date.fromisoformat(c["patient"]["date_of_birth"])
    age = REF.year - dob.year - ((REF.month, REF.day) < (dob.month, dob.day))
    assert age == 55


def test_deterministic_and_idempotent():
    a, b = _case(), _case()
    seed_case(a, ref_date=REF)
    seed_case(b, ref_date=REF)
    assert a["patient"]["nric"] == b["patient"]["nric"]
    assert a["patient"]["address"] == b["patient"]["address"]
    # second run on an already-seeded case makes no change
    again = copy.deepcopy(a)
    assert seed_case(again, ref_date=REF) is False
    assert again == a


def test_phone_is_8_digit_mobile():
    c = _case()
    seed_case(c, ref_date=REF)
    phone = c["patient"]["contact_number"]
    assert len(phone) == 8 and phone[0] in ("8", "9") and phone.isdigit()
