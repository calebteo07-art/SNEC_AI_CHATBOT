from tools.api.routers.cases import _per_phase_summary


def test_per_phase_summary_counts_done_vs_total():
    steps = [
        {"step_number": 1, "category": "patient_identification", "action": "ID patient"},
        {"step_number": 2, "category": "clinical_assessment", "action": "Measure IOP"},
        {"step_number": 3, "category": "clinical_assessment", "action": "Take 3 readings"},
        {"step_number": 4, "category": "post_procedure", "action": "Record in EMR"},
    ]
    out = _per_phase_summary(steps, performed=[1, 2])
    by_name = {p["name"]: p for p in out}
    assert by_name["Preparation & Identification"]["done"] == 1
    assert by_name["Preparation & Identification"]["total"] == 1
    assert by_name["Clinical Assessment"]["done"] == 1
    assert by_name["Clinical Assessment"]["total"] == 2
    assert by_name["Documentation & Follow-up"]["done"] == 0
