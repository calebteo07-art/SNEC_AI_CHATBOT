import glob
import json

from tools.patients import archetypes as A


def test_registry_has_26_archetypes():
    assert len(A.ARCHETYPES) == 26
    adults = [a for a in A.ARCHETYPES.values() if a.band != "child"]
    children = [a for a in A.ARCHETYPES.values() if a.band == "child"]
    assert len(adults) == 24
    assert len(children) == 2
    assert set(A.ARCHETYPES) >= {"chinese_female_senior", "indian_male_middle", "child_boy", "child_girl"}


def test_every_archetype_id_matches_its_key():
    for key, arch in A.ARCHETYPES.items():
        assert arch.id == key
        assert arch.prompt


def test_classify_ethnicity_from_name():
    assert A.classify_patient({"name": "Mdm Lee Siew Poh", "age": 68, "gender": "female"}) == "chinese_female_senior"
    assert A.classify_patient({"name": "Mr Rajasekaran s/o Pillai", "age": 55, "gender": "male"}) == "indian_male_middle"
    assert A.classify_patient({"name": "Mr Muhammad Hafiz bin Yusof", "age": 30, "gender": "male"}) == "malay_male_young"
    assert A.classify_patient({"name": "Ms Farah binte Ahmad", "age": 45, "gender": "female"}) == "malay_female_middle"
    assert A.classify_patient({"name": "Mdm Nair Saraswathy", "age": 80, "gender": "female"}) == "indian_female_elderly"


def test_gender_falls_back_to_honorific_when_missing():
    assert A.classify_patient({"name": "Mr Tan Wee Kiat", "age": 50}).endswith("_male_middle")
    assert A.classify_patient({"name": "Mdm Wong Siok Tin", "age": 50}).endswith("_female_middle")


def test_age_bands_and_children():
    assert A.classify_patient({"name": "Master Nigel Lim", "age": 8, "gender": "male"}) == "child_boy"
    assert A.classify_patient({"name": "Miss Amy Lim", "age": 10, "gender": "female"}) == "child_girl"
    assert A.classify_patient({"name": "Mr X", "age": 25, "gender": "male"}) == "chinese_male_young"
    assert A.classify_patient({"name": "Mr X", "age": 59, "gender": "male"}) == "chinese_male_middle"
    assert A.classify_patient({"name": "Mr X", "age": 60, "gender": "male"}) == "chinese_male_senior"
    assert A.classify_patient({"name": "Mr X", "age": 75, "gender": "male"}) == "chinese_male_elderly"


def test_default_safe_on_junk():
    aid = A.classify_patient({})
    assert aid in A.ARCHETYPES


def test_face_path():
    assert A.face_path("chinese_female_senior") == "/patients/chinese_female_senior.webp"


def test_every_case_resolves_to_a_registered_archetype():
    files = glob.glob("cases/*.json")
    assert files, "no case files found — run from repo root"
    for f in files:
        case = json.load(open(f, encoding="utf-8"))
        aid = A.classify_patient(case["patient"])
        assert aid in A.ARCHETYPES, f"{f}: {aid} not registered"
