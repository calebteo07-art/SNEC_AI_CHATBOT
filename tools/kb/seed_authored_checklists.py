#!/usr/bin/env python3
"""Seed authored (no-PDF) OSCE checklists into Supabase.

A few OSCE station procedures are taught in the Basic Eye Evaluation material but
do NOT have their own standalone checklist PDF (so run_ingestion.py cannot parse
them): Ishihara colour vision testing and Amsler grid testing. Their checklists
are authored here, by hand, from the SNEC Basic Eye Evaluation course content so
that the virtual-patient station resolves them from the database like every other
procedure (instead of falling back to a case's own rubric).

These are the source of truth for the two authored checklists. The provenance
test (tests/cases/test_checklist_provenance.py) reads the names from here.

Run once to populate / refresh:
    python tools/kb/seed_authored_checklists.py            # upsert into Supabase
    python tools/kb/seed_authored_checklists.py --dry-run  # print, don't write
"""

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Each entry mirrors the schema produced by ingest_checklists.parse_checklist.
# category values for `steps[].category` use the same enum as the PDF parser.
AUTHORED_CHECKLISTS: list[dict] = [
    {
        "procedure_name": "Ishihara Colour Vision Testing",
        "checklist_type": "logbook",   # basic eye evaluation skill, shared across OA/OT/PSA
        "module": 1,
        "steps": [
            {"step_number": 1, "category": "patient_identification",
             "action": "Perform hand hygiene and confirm the patient's identity (name and NRIC/date of birth) and the purpose of the test.",
             "critical": True, "notes": None},
            {"step_number": 2, "category": "clinical_assessment",
             "action": "Check whether the patient normally wears distance/near spectacles and ensure the appropriate correction is worn for the test.",
             "critical": False, "notes": "Uncorrected refractive blur can invalidate the result."},
            {"step_number": 3, "category": "equipment",
             "action": "Confirm the Ishihara plate set is complete and the plates are clean and undamaged.",
             "critical": False, "notes": None},
            {"step_number": 4, "category": "infection_control",
             "action": "Wipe the occluder with an alcohol wipe before use.",
             "critical": False, "notes": None},
            {"step_number": 5, "category": "safety_check",
             "action": "Conduct the test in good natural daylight-equivalent illumination; avoid dim or strongly tinted lighting.",
             "critical": True, "notes": "Incorrect lighting invalidates the pseudoisochromatic plates."},
            {"step_number": 6, "category": "patient_education",
             "action": "Explain the procedure: ask the patient to read the number seen on each plate (or trace the path), responding within about 3 seconds per plate.",
             "critical": False, "notes": None},
            {"step_number": 7, "category": "clinical_assessment",
             "action": "Show the demonstration plate first to confirm the patient understands the task.",
             "critical": False, "notes": None},
            {"step_number": 8, "category": "clinical_assessment",
             "action": "Hold each plate at the recommended distance (~75 cm), perpendicular to the line of sight, showing each plate for about 3 seconds.",
             "critical": False, "notes": None},
            {"step_number": 9, "category": "clinical_assessment",
             "action": "Test each eye separately (occlude the other eye) with correction worn, following the standard plate sequence.",
             "critical": False, "notes": None},
            {"step_number": 10, "category": "clinical_assessment",
             "action": "Avoid giving any verbal or non-verbal cue or reaction to the patient's responses during the test.",
             "critical": True, "notes": "Cueing biases the result."},
            {"step_number": 11, "category": "documentation",
             "action": "Tally and record the number of plates correctly identified out of the total, for each eye.",
             "critical": False, "notes": None},
            {"step_number": 12, "category": "documentation",
             "action": "Record the result objectively without interpreting or certifying colour vision status (the doctor's/medical examiner's role).",
             "critical": False, "notes": None},
            {"step_number": 13, "category": "post_procedure",
             "action": "Perform hand hygiene and hand the recorded result to the doctor, noting the testing purpose.",
             "critical": False, "notes": None},
        ],
    },
    {
        "procedure_name": "Amsler Grid Testing",
        "checklist_type": "logbook",
        "module": 1,
        "steps": [
            {"step_number": 1, "category": "patient_identification",
             "action": "Perform hand hygiene and confirm the patient's identity (name and NRIC/date of birth) and the indication for Amsler testing (e.g. macular/AMD monitoring).",
             "critical": True, "notes": None},
            {"step_number": 2, "category": "clinical_assessment",
             "action": "Take a focused history of any new central visual symptoms (distortion, wavy/bent lines, blurred or missing areas), including onset and which eye.",
             "critical": False, "notes": None},
            {"step_number": 3, "category": "equipment",
             "action": "Ensure the Amsler grid chart is clean and adequately illuminated.",
             "critical": False, "notes": None},
            {"step_number": 4, "category": "clinical_assessment",
             "action": "Ensure the patient wears their usual near/reading correction for the test.",
             "critical": False, "notes": None},
            {"step_number": 5, "category": "patient_education",
             "action": "Explain the procedure: hold the grid at normal reading distance (~30 cm), cover one eye, and look steadily at the central dot.",
             "critical": False, "notes": None},
            {"step_number": 6, "category": "clinical_assessment",
             "action": "Test one eye at a time (occlude the other), with the patient fixating on the central dot throughout.",
             "critical": True, "notes": "Loss of central fixation makes the test unreliable."},
            {"step_number": 7, "category": "clinical_assessment",
             "action": "Ask whether all corners and sides are visible and whether any lines appear wavy, bent, blurred or missing, or any area looks grey/dark.",
             "critical": False, "notes": None},
            {"step_number": 8, "category": "clinical_assessment",
             "action": "Record the specific location and nature of any distortion or scotoma on the grid, for each eye.",
             "critical": False, "notes": None},
            {"step_number": 9, "category": "clinical_assessment",
             "action": "Compare today's findings with the patient's previously recorded Amsler results.",
             "critical": False, "notes": None},
            {"step_number": 10, "category": "safety_check",
             "action": "Recognise that NEW distortion or scotoma (especially with reduced VA) in an at-risk patient is a red flag and escalate promptly to the doctor rather than filing as routine.",
             "critical": True, "notes": "New metamorphopsia may indicate wet AMD conversion needing urgent review."},
            {"step_number": 11, "category": "documentation",
             "action": "Document the Amsler grid findings clearly for each eye for handover and comparison.",
             "critical": False, "notes": None},
            {"step_number": 12, "category": "patient_education",
             "action": "Teach the patient home Amsler monitoring (each eye separately) and to return urgently if distortion worsens or new blank areas appear.",
             "critical": False, "notes": None},
            {"step_number": 13, "category": "post_procedure",
             "action": "Perform hand hygiene and hand the findings to the doctor, including the comparison with baseline.",
             "critical": False, "notes": None},
        ],
    },
]


def authored_checklist_names() -> list[str]:
    """Procedure names of the authored checklists (used by the provenance test)."""
    return [c["procedure_name"] for c in AUTHORED_CHECKLISTS]


def build_payload(entry: dict) -> dict:
    """Return the JSONB `steps` column payload, matching parse_checklist output."""
    return {
        "procedure_name": entry["procedure_name"],
        "checklist_type": entry["checklist_type"],
        "total_steps": len(entry["steps"]),
        "steps": entry["steps"],
    }


def seed(dry_run: bool = False) -> None:
    """Upsert each authored checklist (plus its synthetic document row) into Supabase."""
    for entry in AUTHORED_CHECKLISTS:
        payload = build_payload(entry)
        name = entry["procedure_name"]
        filename = f"Authored/{name}"

        print(f"{name}  [{entry['checklist_type']}]  {payload['total_steps']} steps")
        if dry_run:
            continue

        from tools.kb.supabase_client import insert_document, upsert_checklist
        document_id = insert_document({
            "filename": filename,
            "module": entry["module"],
            "category": "checklist",
            "title": name,
            "page_count": 0,
        })
        upsert_checklist({
            "document_id": document_id,
            "checklist_type": entry["checklist_type"],
            "procedure_name": name,
            "module": entry["module"],
            "steps": payload,
            "total_steps": payload["total_steps"],
        })
        print(f"    [ok] upserted (document {document_id[:8]}…)")


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    print(f"Seeding {len(AUTHORED_CHECKLISTS)} authored checklists"
          f"{' (DRY RUN)' if dry else ''}\n" + "=" * 60)
    seed(dry_run=dry)
    print("\nDone.")
