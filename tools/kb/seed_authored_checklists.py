#!/usr/bin/env python3
"""Seed authored (no-PDF) OSCE checklists into Supabase.

Some OSCE station procedures have no standalone checklist PDF, so run_ingestion.py
cannot parse one and the station has nothing real to resolve to. Their checklists are
authored here, by hand, FROM SNEC source material already in the KB:

  - Ishihara Colour Vision Testing, Amsler Grid Testing
      from the SNEC Basic Eye Evaluation course content (Module 1).
  - Macula Potential (PAM), Endothelial Cell Count, Flare Cell Measurement,
    Lens Meter, Aberrometry
      transcribed from the PROCESS sections of Loh, Eunice Tse Ching & Drury, Vicki
      (2016/2017), "Procedure Manual of Ophthalmic Investigations", SNEC — Chapter 5
      (Module 2 in the KB). Page refs live in each step's `notes`.

Without these, the stations resolved to a "* Skills Observation" row — a supervisor
LOGBOOK TALLY SHEET whose rows are "Patient 1: Date /Age/Sex/Race" — so students saw
meaningless steps and an empty action panel.

RULE: never invent a clinical step. Every step must trace to SNEC source; where the
source is silent, omit the step rather than guess.

These are the source of truth for the authored checklists. The provenance
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

    # ─────────────────────────────────────────────────────────────────────────
    # Ophthalmic Investigation procedures (Module 2).
    #
    # These stations previously resolved to the "Ophthalmic Investigations Skills
    # Observation" row — a supervisor LOGBOOK TALLY SHEET ("A scan biometry - Document
    # Date / Age / Sex / Race…" repeated 5x), so students saw meaningless steps and an
    # empty action panel.
    #
    # Every step below is transcribed from the PROCESS section of the SNEC source:
    #   Loh, Eunice Tse Ching & Drury, Vicki (2016/2017).
    #   "Procedure Manual of Ophthalmic Investigations", SNEC — Chapter 5.
    # It is in the KB (Module 2). Page refs are in each step's `notes`. Nothing here is
    # invented: where the manual is silent, the step is omitted rather than guessed.
    # ─────────────────────────────────────────────────────────────────────────
    {
        "procedure_name": "Macula Potential (Acuity Test) Investigation",
        "checklist_type": "OT",
        "module": 2,
        "steps": [
            {"step_number": 1, "category": "equipment",
             "action": "Remove the dust cover from the acquisition unit and switch on the Potential Acuity Meter.",
             "critical": False, "notes": "SNEC Procedure Manual p112, 1.1"},
            {"step_number": 2, "category": "safety_check",
             "action": "Ensure safety by checking that machine wires and cables are tucked safely away from the patient.",
             "critical": False, "notes": "SNEC Procedure Manual p112, 1.2"},
            {"step_number": 3, "category": "infection_control",
             "action": "Clean the surface of the machine with alcohol wipes to minimise the risk of cross infection.",
             "critical": True, "notes": "SNEC Procedure Manual p112, 1.3"},
            {"step_number": 4, "category": "patient_identification",
             "action": "Introduce self to patient and verify the patient's identity to ensure correctness.",
             "critical": True, "notes": "SNEC Procedure Manual p112, 1.4"},
            {"step_number": 5, "category": "documentation",
             "action": "Confirm the consulting doctor's request on the test required.",
             "critical": True, "notes": "SNEC Procedure Manual p112, 1.5"},
            {"step_number": 6, "category": "patient_education",
             "action": "Explain the purpose and procedure to the patient so as to allay fear and anxiety.",
             "critical": False, "notes": "SNEC Procedure Manual p113, 1.6"},
            {"step_number": 7, "category": "clinical_assessment",
             "action": "Ensure the patient's eye is dilated before proceeding.",
             "critical": True, "notes": "SNEC Procedure Manual p113, 1.7 — PAM requires a dilated pupil."},
            {"step_number": 8, "category": "patient_education",
             "action": "Ensure the patient's comfort and seek the patient's co-operation.",
             "critical": False, "notes": "SNEC Procedure Manual p113, 1.8"},
            {"step_number": 9, "category": "equipment",
             "action": "Dim the room light before the procedure.",
             "critical": True, "notes": "SNEC Procedure Manual p113, 1.9"},
            {"step_number": 10, "category": "equipment",
             "action": "Adjust the built-in corrective lens according to the patient's latest refraction records, corrected for near vision.",
             "critical": True, "notes": "SNEC Procedure Manual p132, 2.1 — near correction optimises best visual acuity."},
            {"step_number": 11, "category": "clinical_assessment",
             "action": "Position the patient comfortably on the chair facing the acquisition unit.",
             "critical": False, "notes": "SNEC Procedure Manual p132, 2.2"},
            {"step_number": 12, "category": "clinical_assessment",
             "action": "Adjust the table height according to the patient's sitting height so the patient rests chin and forehead comfortably without straining forward.",
             "critical": False, "notes": "SNEC Procedure Manual p132, 2.3 — minimises body movement."},
            {"step_number": 13, "category": "clinical_assessment",
             "action": "Advise the patient to place the chin on the chin rest and the forehead against the forehead strap.",
             "critical": False, "notes": "SNEC Procedure Manual p132, 2.4"},
            {"step_number": 14, "category": "clinical_assessment",
             "action": "Perform the test one eye at a time.",
             "critical": False, "notes": "SNEC Procedure Manual p132, 2.5"},
            {"step_number": 15, "category": "clinical_assessment",
             "action": "Align the aiming beam to the visual axis of the patient's eye so that the patient is focusing into the chart.",
             "critical": True, "notes": "SNEC Procedure Manual p132, 2.6"},
            {"step_number": 16, "category": "clinical_assessment",
             "action": "Request the patient to read out the number / alphabet chart inside the orange light.",
             "critical": True, "notes": "SNEC Procedure Manual p132, 2.7 — the light source position can be adjusted to different areas on the pupil to obtain best corrected results."},
            {"step_number": 17, "category": "documentation",
             "action": "Record the results into the patient's medical record folder.",
             "critical": True, "notes": "SNEC Procedure Manual p132, 2.8"},
            {"step_number": 18, "category": "infection_control",
             "action": "Disinfect the machine with alcohol wipes after each patient's use.",
             "critical": True, "notes": "SNEC Procedure Manual p132, 2.9"},
            {"step_number": 19, "category": "post_procedure",
             "action": "Switch off the machine and place the dust cover over it at the end of each session.",
             "critical": False, "notes": "SNEC Procedure Manual p132, 2.10-2.11"},
        ],
    },
    {
        "procedure_name": "Endothelial Cell Count Investigation",
        "checklist_type": "OT",
        "module": 2,
        "steps": [
            {"step_number": 1, "category": "equipment",
             "action": "Remove the dust cover and switch on the specular microscope.",
             "critical": False, "notes": "SNEC Procedure Manual p106, 1.1"},
            {"step_number": 2, "category": "safety_check",
             "action": "Ensure safety by checking that machine wires and cables are tucked safely away from the patient.",
             "critical": False, "notes": "SNEC Procedure Manual p106, 1.2"},
            {"step_number": 3, "category": "infection_control",
             "action": "Clean the surface of the machine with alcohol wipes to minimise the risk of cross infection.",
             "critical": True, "notes": "SNEC Procedure Manual p106, 1.3"},
            {"step_number": 4, "category": "patient_identification",
             "action": "Introduce self to patient and verify the patient's identity to ensure correctness.",
             "critical": True, "notes": "SNEC Procedure Manual p106, 1.4"},
            {"step_number": 5, "category": "documentation",
             "action": "Confirm the consulting doctor's request on the test required.",
             "critical": True, "notes": "SNEC Procedure Manual p106, 1.5"},
            {"step_number": 6, "category": "patient_education",
             "action": "Explain the purpose and procedure to the patient so as to allay fear and anxiety.",
             "critical": False, "notes": "SNEC Procedure Manual p106, 1.6"},
            {"step_number": 7, "category": "patient_education",
             "action": "Ensure the patient's comfort and seek the patient's co-operation.",
             "critical": False, "notes": "SNEC Procedure Manual p106, 1.7"},
            {"step_number": 8, "category": "documentation",
             "action": "Enter the patient's data and other required information into the machine.",
             "critical": False, "notes": "SNEC Procedure Manual p106, 2.1"},
            {"step_number": 9, "category": "clinical_assessment",
             "action": "Position the patient comfortably on the chair facing the machine.",
             "critical": False, "notes": "SNEC Procedure Manual p106, 2.2"},
            {"step_number": 10, "category": "clinical_assessment",
             "action": "Adjust the table height accordingly and advise the patient to place the chin on the chin rest and the forehead against the headrest.",
             "critical": False, "notes": "SNEC Procedure Manual p106, 2.3"},
            {"step_number": 11, "category": "safety_check",
             "action": "Place the chin on the LEFT chin rest to capture the image for the RIGHT eye, and on the RIGHT chin rest to capture the image for the LEFT eye.",
             "critical": True, "notes": "SNEC Procedure Manual p106, 2.4 — the chin rest side is opposite the eye being captured; getting this wrong labels the wrong eye."},
            {"step_number": 12, "category": "clinical_assessment",
             "action": "Perform the procedure on the Right eye first: align the patient's head to position the centre of the pupil in the centre of the computer monitor and advise the patient to fixate on the green light inside.",
             "critical": True, "notes": "SNEC Procedure Manual p87, 2.5"},
            {"step_number": 13, "category": "clinical_assessment",
             "action": "Click 'RECORD' to capture the image, then click 'PATTERN' to select the cell size.",
             "critical": False, "notes": "SNEC Procedure Manual p87, 2.5"},
            {"step_number": 14, "category": "clinical_assessment",
             "action": "Click 'ANALYSIS (MANUAL)' and select cells in a circular or centre-analysis pattern, identifying the true centre of the cells with a spiral, continuous and consistent selection technique.",
             "critical": True, "notes": "SNEC Procedure Manual p88, 2.5"},
            {"step_number": 15, "category": "clinical_assessment",
             "action": "Ensure the cells counted after analysis are more than 100, or as per the doctor's request.",
             "critical": True, "notes": "SNEC Procedure Manual p88, 2.5 — fewer than 100 cells is not a valid count."},
            {"step_number": 16, "category": "clinical_assessment",
             "action": "Repeat the procedure for the Left eye.",
             "critical": False, "notes": "SNEC Procedure Manual p88, 2.6"},
            {"step_number": 17, "category": "documentation",
             "action": "Print out the analysed results; the test will be saved automatically.",
             "critical": False, "notes": "SNEC Procedure Manual p88, 2.7"},
            {"step_number": 18, "category": "documentation",
             "action": "Paste and file the results into the patient's medical record folder.",
             "critical": True, "notes": "SNEC Procedure Manual p88, 2.8"},
            {"step_number": 19, "category": "infection_control",
             "action": "Disinfect the machine with alcohol wipes after each patient's use.",
             "critical": True, "notes": "SNEC Procedure Manual p88, 2.9"},
            {"step_number": 20, "category": "post_procedure",
             "action": "Switch off the machine and place the dust cover over it at the end of each session.",
             "critical": False, "notes": "SNEC Procedure Manual p88, 2.10-2.11"},
        ],
    },
    {
        "procedure_name": "Flare Cell Measurement Investigation",
        "checklist_type": "OT",
        "module": 2,
        "steps": [
            {"step_number": 1, "category": "equipment",
             "action": "Remove the dust cover and switch on the machine. Allow the machine to warm up and wait for it to finish auto-calibration.",
             "critical": True, "notes": "SNEC Procedure Manual p110, 1.1 — measuring before auto-calibration completes invalidates the reading."},
            {"step_number": 2, "category": "safety_check",
             "action": "Ensure safety by checking that machine wires and cables are tucked safely away from the patient.",
             "critical": False, "notes": "SNEC Procedure Manual p110, 1.2"},
            {"step_number": 3, "category": "infection_control",
             "action": "Clean the surface of the machine with alcohol wipes to minimise the risk of cross infection.",
             "critical": True, "notes": "SNEC Procedure Manual p110, 1.3"},
            {"step_number": 4, "category": "patient_identification",
             "action": "Introduce self to patient and verify the patient's identity to ensure correctness.",
             "critical": True, "notes": "SNEC Procedure Manual p110, 1.4"},
            {"step_number": 5, "category": "documentation",
             "action": "Confirm the consulting doctor's request on the test required.",
             "critical": True, "notes": "SNEC Procedure Manual p110, 1.5"},
            {"step_number": 6, "category": "patient_education",
             "action": "Explain the purpose and procedure to the patient so as to allay fear and anxiety.",
             "critical": False, "notes": "SNEC Procedure Manual p110, 1.6"},
            {"step_number": 7, "category": "patient_education",
             "action": "Ensure the patient's comfort and seek the patient's co-operation.",
             "critical": False, "notes": "SNEC Procedure Manual p110, 1.7"},
            {"step_number": 8, "category": "equipment",
             "action": "Select the appropriate test as indicated by the doctor.",
             "critical": True, "notes": "SNEC Procedure Manual p110, 2.1"},
            {"step_number": 9, "category": "clinical_assessment",
             "action": "Position the patient comfortably on the chair facing the machine.",
             "critical": False, "notes": "SNEC Procedure Manual p110, 2.2"},
            {"step_number": 10, "category": "clinical_assessment",
             "action": "Adjust the table height according to the patient's sitting height so the patient rests chin and forehead comfortably without straining forward.",
             "critical": False, "notes": "SNEC Procedure Manual p110, 2.3 — minimises body movement."},
            {"step_number": 11, "category": "clinical_assessment",
             "action": "Advise the patient to place the chin on the chin rest and the forehead against the forehead strap, then adjust the chin rest until the patient's eye level is aligned with the eye level mark on the headrest pole.",
             "critical": False, "notes": "SNEC Procedure Manual p110-111, 2.4-2.5"},
            {"step_number": 12, "category": "patient_education",
             "action": "Advise the patient to look at the external green fixation light and blink normally.",
             "critical": False, "notes": "SNEC Procedure Manual p91, 2.6"},
            {"step_number": 13, "category": "clinical_assessment",
             "action": "Perform the procedure on the Right eye first: position the microscope and light source 90 degrees apart so that the laser slit light connects the focal points at the cornea.",
             "critical": True, "notes": "SNEC Procedure Manual p91, 2.7"},
            {"step_number": 14, "category": "clinical_assessment",
             "action": "Press the 'MEASURE' button on the joystick to begin the laser beam scan and search for the patient's measurement site.",
             "critical": False, "notes": "SNEC Procedure Manual p91, 2.7"},
            {"step_number": 15, "category": "clinical_assessment",
             "action": "Locate the measurement site by moving the measuring window slightly below the centre of the optical axis, near the centre of the anterior chamber; the window blinks more rapidly as alignment nears, and alignment is correct when blinking becomes rapid or stops.",
             "critical": True, "notes": "SNEC Procedure Manual p91, 2.7"},
            {"step_number": 16, "category": "clinical_assessment",
             "action": "Press the 'STORE' button on the mobile stand to store the measurements once the flare measurement is displayed.",
             "critical": False, "notes": "SNEC Procedure Manual p91, 2.7"},
            {"step_number": 17, "category": "infection_control",
             "action": "Disinfect the machine with alcohol wipes after each patient's use.",
             "critical": True, "notes": "SNEC Procedure Manual p91"},
        ],
    },
    {
        "procedure_name": "Lens Meter Investigation",
        "checklist_type": "OT",
        "module": 2,
        "steps": [
            {"step_number": 1, "category": "equipment",
             "action": "Remove the dust cover and switch on the Lensmeter.",
             "critical": False, "notes": "SNEC Procedure Manual p125, 1.1"},
            {"step_number": 2, "category": "safety_check",
             "action": "Ensure safety by checking that machine wires and cables are tucked safely away from the patient.",
             "critical": False, "notes": "SNEC Procedure Manual p125, 1.2"},
            {"step_number": 3, "category": "equipment",
             "action": "Clean the optical surfaces using the air blower (AP Jet Cleaner) to remove dust and dirt.",
             "critical": False, "notes": "SNEC Procedure Manual p125, 1.3"},
            {"step_number": 4, "category": "equipment",
             "action": "Clean the optical surfaces using a micro fibre cloth to ensure the optical surfaces are not scratched.",
             "critical": False, "notes": "SNEC Procedure Manual p125, 1.4 — cloth only; other materials scratch the optics."},
            {"step_number": 5, "category": "equipment",
             "action": "Set the spherical and cylinder marking to 0/180 degrees by adjusting the diopter knob and the axis by adjusting the wheel turner.",
             "critical": True, "notes": "SNEC Procedure Manual p125, 2.1"},
            {"step_number": 6, "category": "clinical_assessment",
             "action": "Align the spectacle / lens by centering the target so that the optical centre coincides with the inside marking.",
             "critical": True, "notes": "SNEC Procedure Manual p125, 2.2"},
            {"step_number": 7, "category": "clinical_assessment",
             "action": "Check the spherical, cylinder and axis power by adjusting the diopter marking knob and the target rotation wheel.",
             "critical": True, "notes": "SNEC Procedure Manual p125, 2.3"},
            {"step_number": 8, "category": "documentation",
             "action": "Print or record the reading into the patient's medical record folder.",
             "critical": True, "notes": "SNEC Procedure Manual p125, 2.4"},
            {"step_number": 9, "category": "equipment",
             "action": "Remove dust from the optical surfaces using the air blower and clean the lens holder using a micro fibre cloth.",
             "critical": False, "notes": "SNEC Procedure Manual p125, 2.5-2.6"},
            {"step_number": 10, "category": "post_procedure",
             "action": "Switch off the equipment and place the dust cover over it at the end of each session.",
             "critical": False, "notes": "SNEC Procedure Manual p125, 2.7-2.8"},
        ],
    },
    {
        "procedure_name": "Aberrometry Investigation",
        "checklist_type": "OT",
        "module": 2,
        "steps": [
            {"step_number": 1, "category": "equipment",
             "action": "Remove the dust cover from the acquisition unit and switch on the machine. Allow the machine to warm up and wait for it to finish auto-calibration.",
             "critical": True, "notes": "SNEC Procedure Manual p57, 1.1"},
            {"step_number": 2, "category": "safety_check",
             "action": "Ensure safety by checking that machine wires and cables are tucked safely away from the patient.",
             "critical": False, "notes": "SNEC Procedure Manual p57, 1.2"},
            {"step_number": 3, "category": "infection_control",
             "action": "Clean the surface of the machine with alcohol wipes to minimise the risk of cross infection.",
             "critical": True, "notes": "SNEC Procedure Manual p57, 1.3"},
            {"step_number": 4, "category": "patient_identification",
             "action": "Introduce self to patient and verify the patient's identity to ensure correctness.",
             "critical": True, "notes": "SNEC Procedure Manual p57, 1.4"},
            {"step_number": 5, "category": "documentation",
             "action": "Confirm the consulting doctor's request on the test required.",
             "critical": True, "notes": "SNEC Procedure Manual p57, 1.5"},
            {"step_number": 6, "category": "patient_education",
             "action": "Explain the purpose and procedure to the patient so as to allay fear and anxiety.",
             "critical": False, "notes": "SNEC Procedure Manual p57, 1.6"},
            {"step_number": 7, "category": "patient_education",
             "action": "Ensure the patient's comfort and seek the patient's co-operation.",
             "critical": False, "notes": "SNEC Procedure Manual p57, 1.7"},
            {"step_number": 8, "category": "equipment",
             "action": "Dim the room light before the procedure.",
             "critical": True, "notes": "SNEC Procedure Manual p57, 1.8 — higher order aberration is pupil-dependent."},
            {"step_number": 9, "category": "documentation",
             "action": "Enter the patient's data and other required information into the machine.",
             "critical": False, "notes": "SNEC Procedure Manual p57, 2.1"},
            {"step_number": 10, "category": "equipment",
             "action": "Select the appropriate test as indicated by the doctor.",
             "critical": True, "notes": "SNEC Procedure Manual p57, 2.2"},
            {"step_number": 11, "category": "patient_education",
             "action": "Explain to the patient what they need to do and see, using the demo 'Mount Fuji' image, and inform the patient to relax and look at the centre of the target screen.",
             "critical": False, "notes": "SNEC Procedure Manual p57, 2.3-2.4"},
            {"step_number": 12, "category": "clinical_assessment",
             "action": "Advise the patient to place the chin on the chin rest and the forehead against the forehead strap, then adjust the chin rest until the canthus marker is aligned at eye level.",
             "critical": False, "notes": "SNEC Procedure Manual p59, 2.8"},
            {"step_number": 13, "category": "clinical_assessment",
             "action": "Perform the procedure on the Right eye first: move the acquisition head with the joystick until the right eye is centred on the monitor.",
             "critical": True, "notes": "SNEC Procedure Manual p59, 2.10 — the system automatically defines which eye is scanned."},
            {"step_number": 14, "category": "clinical_assessment",
             "action": "Centre the pupil between the circle and the intersection of the two crosses, ensuring a sharp contour between the pupil and the iris.",
             "critical": True, "notes": "SNEC Procedure Manual p59, 2.10"},
            {"step_number": 15, "category": "clinical_assessment",
             "action": "Press the joystick to capture the reading and continue with a second measurement, then click the 'Result Screen' to compute the final reading.",
             "critical": False, "notes": "SNEC Procedure Manual p59, 2.10"},
            {"step_number": 16, "category": "clinical_assessment",
             "action": "View and verify the results, then proceed to save and print the data.",
             "critical": True, "notes": "SNEC Procedure Manual p59, 2.10"},
            {"step_number": 17, "category": "clinical_assessment",
             "action": "Repeat the procedure for the Left eye.",
             "critical": False, "notes": "SNEC Procedure Manual p59, 2.11"},
            {"step_number": 18, "category": "documentation",
             "action": "File the data into the patient's medical record folder.",
             "critical": True, "notes": "SNEC Procedure Manual p59, 2.12"},
            {"step_number": 19, "category": "documentation",
             "action": "Verify the patient's data on the printed results, then initial and indicate the date beside the patient's particulars as a record of the check performed.",
             "critical": True, "notes": "SNEC Procedure Manual p59, 2.13"},
            {"step_number": 20, "category": "infection_control",
             "action": "Disinfect the machine with alcohol wipes after each patient's use.",
             "critical": True, "notes": "SNEC Procedure Manual p59, 2.14"},
            {"step_number": 21, "category": "post_procedure",
             "action": "Switch off the machine and place the dust cover over it at the end of each session.",
             "critical": False, "notes": "SNEC Procedure Manual p59, 2.15-2.16"},
        ],
    },
    {
        # Transcribed verbatim from CC-D0008, "Visual Acuity - Distance Vision Testing
        # for Adults & Children using LogMAR (Modified) Method" (SNEC Nursing Outpatient
        # Department competency assessment). CC-D0008 supersedes the older SOP
        # NU-PR-OPD-D0039 v03 on reading direction, test distance and both pinhole steps,
        # so neither the SOP PDF nor the PSA Checklist V2 PDF is parsed into a checklist
        # any more — this authored row is the single source.
        # Step 6 is the one addition, carried over from PSA Checklist V2 because
        # CC-D0008 is silent on occluder selection rather than contradicting it.
        # See docs/notes/2026-07-31-distance-va-source-conflict.md
        "procedure_name": "Distance Vision Testing LogMAR",
        "checklist_type": "PSA",
        "module": 2,
        "steps": [
            {"step_number": 1, "category": "documentation",
             "action": "Check doctor's order for visual acuity - distance vision testing in patient's medical record / EMR.",
             "critical": False, "notes": "CC-D0008 A.1"},
            {"step_number": 2, "category": "patient_education",
             "action": "Introduce self to patient.",
             "critical": False, "notes": "CC-D0008 A.2"},
            {"step_number": 3, "category": "patient_identification",
             "action": "Identify patient against medical record / EMR using at least 2 identifiers: Patient Name; Patient Identification Number / Address / Date of Birth.",
             "critical": True, "notes": "CC-D0008 A.3"},
            {"step_number": 4, "category": "patient_education",
             "action": "Explain the purpose and procedure to the patient.",
             "critical": False, "notes": "CC-D0008 A.4"},
            {"step_number": 5, "category": "infection_control",
             "action": "Perform hand hygiene.",
             "critical": True, "notes": "CC-D0008 B.1"},
            {"step_number": 6, "category": "equipment",
             "action": "Use the correct occluder: general occluder for a non-infected case; occluder with the orange sticker for an infected case.",
             "critical": False, "notes": "PSA Checklist V2 B.2 — CC-D0008 does not cover occluder selection, so this step is retained rather than dropped."},
            {"step_number": 7, "category": "infection_control",
             "action": "Wipe the occluder with alcohol wipes before the start of the procedure.",
             "critical": True, "notes": "CC-D0008 B.2"},
            {"step_number": 8, "category": "clinical_assessment",
             "action": "Position the patient comfortably in a sitting position.",
             "critical": False, "notes": "CC-D0008 B.3"},
            {"step_number": 9, "category": "clinical_assessment",
             "action": "Check patient's distant vision with corrective lenses or contact lenses (if worn) using the LogMAR M&S Smart system. The system is calibrated according to room length.",
             "critical": False, "notes": "CC-D0008 B.4. The distance is set by room calibration — do not teach a fixed figure."},
            {"step_number": 10, "category": "clinical_assessment",
             "action": "Test the right eye first (by convention) by occluding the left eye. Ask patient to read ALL 5 letters or numbers from left to right (largest characters) starting from the top line.",
             "critical": True, "notes": "CC-D0008 B.5. Left to right, and the right eye first — the superseded SOP said right to left."},
            {"step_number": 11, "category": "clinical_assessment",
             "action": "Patient must read ALL the 5 letters from the current line correctly before proceeding to read ALL the letters from the successive lines (e.g. lines 6/48, 6/38, 6/30, etc).",
             "critical": False, "notes": "CC-D0008 B.6. Snellen/LogMAR equivalents: 6/7.5=0.1, 6/9.5=0.2, 6/12=0.3, 6/15=0.4, 6/19=0.5, 6/24=0.6, 6/30=0.7, 6/38=0.8, 6/48=0.9, 6/60=1.0, 6/120=1.3."},
            {"step_number": 12, "category": "clinical_assessment",
             "action": "Stop the test when patient is unable to read all 5 letters from a line (e.g. 6/15). Count the number of letters that patient is able to read correctly from that line (e.g. 2 correct letters from the 6/15 line).",
             "critical": False, "notes": "CC-D0008 B.7"},
            {"step_number": 13, "category": "documentation",
             "action": "Document the reading as follows: the last line where patient is able to read ALL 5 letters correctly, in both Snellen and LogMAR (e.g. 6/19 (0.5)); and the number of correct letters read from the last attempted line (e.g. +2). Example: VR 6/19 +2 (0.5) with glasses, if worn.",
             "critical": False, "notes": "CC-D0008 B.8"},
            {"step_number": 14, "category": "clinical_assessment",
             "action": "When patient's vision is noted to be 6/12 & above, use a pinhole to attempt to improve vision. Request patient to read the last attempted line (e.g. 6/15); if patient reads ALL 5 letters, continue. Stop when patient is unable to read all 5 letters from a line (e.g. 6/12) and count the correct letters. Record any improvement, e.g. VR 6/19 +2 (0.5) => 6/15 +3 (0.4) with PH (with glasses, if worn).",
             "critical": False, "notes": "CC-D0008 B.9"},
            {"step_number": 15, "category": "clinical_assessment",
             "action": "If patient can read partial 6/60 (1.0) line (e.g. 2 correct letters), use a pinhole to attempt to improve vision. If patient reads ALL the letters from that line, continue downwards. If patient is still unable to read ALL 5 letters (e.g. 4 correct letters), stop the test and record, e.g. VR 6/60 (read 2 only) => 6/60 (read 4 only) with PH (with glasses, if worn).",
             "critical": False, "notes": "CC-D0008 B.10"},
            {"step_number": 16, "category": "clinical_assessment",
             "action": "If patient is unable to read any letter from the LogMAR 6/60 (1.0) line, use a pinhole on that line to attempt to improve vision. If patient reads ALL the letters, continue downwards. Stop when patient is unable to read ALL 5 letters and record, e.g. VR 6/60 (read none) => VR 6/48 +2 with PH (with glasses, if worn).",
             "critical": False, "notes": "CC-D0008 B.11. The superseded SOP omitted this pinhole attempt and went straight to 6/120."},
            {"step_number": 17, "category": "clinical_assessment",
             "action": "If patient is unable to read any letter or number from the 6/60 line with pinhole, proceed to 6/120 with NO pinhole. If patient is unable to read from the 6/120 line, then use a pinhole to attempt to improve vision and record, e.g. VR: 6/120 (can't read) => 6/120 with PH.",
             "critical": False, "notes": "CC-D0008 B.12. The superseded SOP had no pinhole step at 6/120."},
            {"step_number": 18, "category": "clinical_assessment",
             "action": "If patient is unable to read from the 6/120 (1.3) line with pinhole, proceed to test vision in the order stated and record the results accordingly: Count Fingers, Hand Movements, Light Perception, No Light Perception.",
             "critical": False, "notes": "CC-D0008 B.13"},
            {"step_number": 19, "category": "clinical_assessment",
             "action": "Repeat the test for the left eye with the right eye occluded.",
             "critical": False, "notes": "CC-D0008 B.14 (repeat steps 5 to 13)"},
            {"step_number": 20, "category": "infection_control",
             "action": "Wipe the occluder with alcohol wipes after the procedure.",
             "critical": True, "notes": "CC-D0008 B.15"},
            {"step_number": 21, "category": "infection_control",
             "action": "Perform hand hygiene.",
             "critical": True, "notes": "CC-D0008 B.16"},
            {"step_number": 22, "category": "documentation",
             "action": "Record the date / time / distance vision readings onto the patient's medical record / EMR.",
             "critical": False, "notes": "CC-D0008 C.1"},
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
