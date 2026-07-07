from tools.api.routers import cases


def test_patient_info_derives_face_path():
    info = cases._patient_info({"name": "Mdm Lee Siew Poh", "age": 68, "gender": "female",
                                "presenting_complaint": "Red eye"})
    assert info.face == "/patients/chinese_female_senior.webp"
    assert info.name == "Mdm Lee Siew Poh"
    assert info.age == 68
    assert info.presenting_complaint == "Red eye"


def test_patient_info_default_safe_face():
    info = cases._patient_info({"name": "Someone", "age": "n/a"})
    assert info.face.startswith("/patients/")
    assert info.face.endswith(".webp")


def test_model_has_face_field_default_empty():
    info = cases.CasePatientInfo(name="X", age=40, presenting_complaint="")
    assert info.face == ""
