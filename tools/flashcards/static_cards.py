"""Static flashcard pool — 30 cards per student role (OA/OT/PSA).

Newly authored, grounded in workflows/ophthalmology_kb.md (Ocular Emergencies,
SNEC Triage, History Taking, Basic Eye Evaluation, OPD Clinical Skills,
Ophthalmic Investigations, Dayward & OT Skills, Orthoptics Assessment,
Abbreviations) and each role's checklist procedures.

Used by GET /api/flashcards/generate via tools.shared.static_pools.pick_next_unseen
to serve each student fresh cards (source="static") until the full 30-card
pool has been issued, then cycle with repeats.
"""

STATIC_FLASHCARDS: dict[str, list[dict]] = {
    "OA": [
        {
            "front": "What are the seven categories of ocular emergencies you should be alert for?",
            "back": "Physical injuries, chemical injuries, infections, painless sudden loss of vision, acute glaucoma, uveitis, and painful CN III palsy.",
            "topic_tag": "ocular_emergencies",
        },
        {
            "front": "In the red-eye differential, which condition presents with marked discharge but no pain or photophobia?",
            "back": "Conjunctivitis — marked discharge, no pain, no photophobia, normal visual acuity, and a normal pupil.",
            "topic_tag": "red_eye_differential",
        },
        {
            "front": "How does the pupil differ between acute angle-closure glaucoma and iritis?",
            "back": "In acute angle-closure glaucoma the pupil is large, oval, and fixed (mid-dilated, non-reactive). In iritis the pupil is smaller than normal or equal in size but reactive.",
            "topic_tag": "red_eye_differential",
        },
        {
            "front": "A patient presents with severe eye pain, headache, nausea and vomiting. What ocular emergency must you suspect, and what two pupil/cornea signs support it?",
            "back": "Suspect acute angle-closure glaucoma. Supporting signs are corneal oedema (hazy cornea) and a fixed, mid-dilated oval pupil.",
            "topic_tag": "acute_glaucoma",
        },
        {
            "front": "Name the four conditions classified as SNEC Triage Category 1, requiring assessment and treatment within 10 minutes.",
            "back": "Chemical burns (acid or alkali — start irrigation immediately), penetrating eye injury, sudden vision loss/CRAO with VA <6/60, and severe eye pain suggestive of acute angle-closure glaucoma.",
            "topic_tag": "triage",
        },
        {
            "front": "What four presentations fall under SNEC Triage Category 2 (within 30 minutes)?",
            "back": "Painless loss of vision (CRVO), history suggesting penetrating eye injury, hypopyon (pus in anterior chamber), and total hyphaema (blood filling the anterior chamber).",
            "topic_tag": "triage",
        },
        {
            "front": "A patient with a previous retinal history reports a sudden increase in floaters and new flashes. What triage category and underlying concern does this raise?",
            "back": "Category 3 (within 60 minutes) — suspect retinal detachment, especially given the previous retinal history.",
            "topic_tag": "triage",
        },
        {
            "front": "List three conditions classified as SNEC Triage Category 4 (within 2 hours, chronic or minor).",
            "back": "Any three of: conjunctivitis, blepharitis, chalazion, dry eyes, long-term floaters with no previous retinal history, or subtarsal foreign bodies with no redness.",
            "topic_tag": "triage",
        },
        {
            "front": "When taking a general health history, which two categories of systemic conditions are especially important to ask about and why?",
            "back": "Vascular conditions (diabetes, hypertension) and inflammatory conditions (arthritis, uveitis) — both have direct ocular complications and influence diagnosis and management.",
            "topic_tag": "history_taking",
        },
        {
            "front": "Why is it important to ask about anti-coagulants, herbal supplements, and steroid use during history taking?",
            "back": "Anti-coagulants increase bleeding risk during procedures or trauma; steroids and herbal supplements can affect IOP, healing, and interact with ocular treatments — all must be documented before intervention.",
            "topic_tag": "history_taking",
        },
        {
            "front": "A contact lens wearer presents with a red, painful eye. What two contact-lens-related history points should you check?",
            "back": "Check for overwear (e.g. wearing daily disposable lenses for 2-3 days) and use of an incorrect lens-care solution — both increase infection risk.",
            "topic_tag": "history_taking",
        },
        {
            "front": "Name four conditions you should specifically ask about in a patient's family ocular history.",
            "back": "Cataracts, glaucoma, retinal/corneal dystrophies, retinal detachment, and squint/strabismus (any four).",
            "topic_tag": "family_history",
        },
        {
            "front": "What is considered normal visual acuity on the Snellen scale, and how is the fraction defined?",
            "back": "Normal VA is 6/6. The fraction is the testing distance over the distance at which a normal eye can read that line of letters.",
            "topic_tag": "visual_acuity",
        },
        {
            "front": "What does a pinhole occluder test for, and how do you interpret the result?",
            "back": "It eliminates peripheral light rays to test whether reduced vision is due to a refractive error. If vision improves through the pinhole, the cause is refractive; if it doesn't improve, suspect media opacity or retinal/optic nerve disease.",
            "topic_tag": "visual_acuity",
        },
        {
            "front": "What is the normal IOP range, and on what principle does a non-contact (air-puff) tonometer work?",
            "back": "Normal IOP is 10-21 mmHg. NCT works on a time-interval principle — it measures the time from the air puff to the moment the cornea flattens (applanation); less time means a softer eye (lower IOP), more time means a harder eye (higher IOP).",
            "topic_tag": "iop_tonometry",
        },
        {
            "front": "By convention, which eye is tested first during NCT, and what must the patient remove beforehand?",
            "back": "The right eye is tested first by convention. The patient must remove glasses or contact lenses before testing.",
            "topic_tag": "iop_tonometry",
        },
        {
            "front": "Name two common dilating drops used in clinic, and the key contraindication that must be discussed with a nurse or doctor before dilating.",
            "back": "Tropicamide 1% and phenylephrine 2.5% are common dilating drops. Narrow angles are a contraindication — this must be discussed with the nurse/doctor before proceeding.",
            "topic_tag": "pupil_dilation",
        },
        {
            "front": "What two visual side effects should you warn a patient about after pupil dilation, and how long do they typically last?",
            "back": "Warn the patient of blurred near vision and photosensitivity (light sensitivity), which typically last 4-6 hours.",
            "topic_tag": "pupil_dilation",
        },
        {
            "front": "Which groups of patients are considered high fall-risk in the eye clinic, and what should you do if a patient screens positive?",
            "back": "Elderly patients, post-dilation patients (due to blurred vision), and visually impaired patients are high-risk. If a patient screens positive, document the action taken — e.g. accompanying the patient or providing a wheelchair.",
            "topic_tag": "fall_risk",
        },
        {
            "front": "Before instilling an eye drop, what three checks must you complete, and what is the correct technique?",
            "back": "Confirm the correct eye (RE/LE/Both), check the patient is not allergic, and explain the procedure. Then tilt the patient's head back, gently pull down the lower lid, instil one drop into the lower fornix, and have the patient close their eye gently with pressure on the nasolacrimal area.",
            "topic_tag": "eye_drops",
        },
        {
            "front": "What four results must be documented during a pre-operative assessment (Skill 11)?",
            "back": "ECG, blood pressure, blood sugar (if tested), and urine sugar (if tested) — with any abnormal results and the action taken documented.",
            "topic_tag": "pre_op_care",
        },
        {
            "front": "During pre-op counselling (Skill 11a), what three pieces of information must you give the patient?",
            "back": "The date of surgery, the patient's current medications, and the fasting requirement (the time from which they must start fasting).",
            "topic_tag": "pre_op_care",
        },
        {
            "front": "During post-operative eye dressing, what three anatomical areas must you observe, and what would be an abnormal finding for the wound section?",
            "back": "Observe the lids (oedema/redness/discharge), conjunctiva (redness/chemosis), and wound section. An abnormal wound finding would be haematoma, loose sutures, or signs of infection — report any abnormal findings immediately to the nurse-in-charge.",
            "topic_tag": "post_op_care",
        },
        {
            "front": "When triaging a patient (Skill 14), what should you record alongside the chief complaint and your provisional diagnosis?",
            "back": "Record the signs/symptoms related to the chief complaint, the anatomical parts involved, the actual diagnosis from the clinical notes (for learning comparison), the outcome (earlier TCU/Acute Care Clinic/keep current appointment), and any patient education given.",
            "topic_tag": "triage_documentation",
        },
        {
            "front": "When assisting in the consultation room (Skill 15), what dilation status options must be documented?",
            "back": "Document whether the patient received DBE (dilate both eyes), RE only, LE only, or Nil — alongside investigations ordered, diagnosis, management plan, TCU, and medications.",
            "topic_tag": "triage_documentation",
        },
        {
            "front": "What does the DISM mnemonic stand for in dayward pre-operative assessment?",
            "back": "Diagnosis, Indication for surgery, Surgery planned, and Medical conditions.",
            "topic_tag": "dayward",
        },
        {
            "front": "What three vital signs must be monitored and documented during dayward post-operative care?",
            "back": "Blood pressure (BP), respiratory rate (RR), and pulse rate (PR) — along with the TCU date/time and any post-op medications prescribed.",
            "topic_tag": "dayward",
        },
        {
            "front": "What do auto-refraction (AR) and auto-keratometry (AK) each measure, and when are they typically performed?",
            "back": "AR objectively measures refractive error (myopia, hyperopia, astigmatism); AK measures corneal curvature and astigmatism. Both are performed for new patients and as part of pre-operative assessment, especially for IOL power calculation.",
            "topic_tag": "auto_refraction",
        },
        {
            "front": "What does the Ishihara chart test for, and how is the result documented?",
            "back": "It tests for colour vision deficiency, particularly red-green colour blindness, using plates of coloured dots. The result is documented as the number of plates the patient reads correctly.",
            "topic_tag": "color_vision",
        },
        {
            "front": "What condition is the Amsler grid used to monitor, and what does an abnormal result look like?",
            "back": "It is used to detect central visual field defects and metamorphopsia, commonly to monitor macular conditions like AMD. An abnormal result is when the patient reports distortion, missing areas, or wavy lines while looking at the central dot.",
            "topic_tag": "amsler_grid",
        },
    ],
    "OT": [
        {
            "front": "What does A-scan biometry measure, and what is its main clinical indication?",
            "back": "A-scan biometry uses ultrasound to measure the axial length of the eyeball. It is mainly indicated pre-cataract surgery for IOL power calculation.",
            "topic_tag": "biometry",
        },
        {
            "front": "What are the two A-scan biometry techniques, and what preparation is needed for the contact method?",
            "back": "A-scan can be performed by contact or immersion technique. For the contact method, instil a topical anaesthetic before the probe touches the cornea.",
            "topic_tag": "biometry",
        },
        {
            "front": "How does optical coherence biometry differ from A-scan, and what are its advantages?",
            "back": "Optical coherence biometry is non-contact and measures axial length, corneal curvature, and anterior chamber depth. It is generally more accurate for IOL calculation in most eyes and is also used for contact lens fitting.",
            "topic_tag": "biometry",
        },
        {
            "front": "What is the normal endothelial cell density, and at what value does it raise concern?",
            "back": "Normal endothelial cell density is greater than 2000 cells/mm². Concern is raised if the count drops below 1500 cells/mm².",
            "topic_tag": "endothelial_cell_count",
        },
        {
            "front": "Name three clinical indications for performing endothelial cell count.",
            "back": "Pre-cataract surgery assessment, Fuchs endothelial dystrophy, contact lens wearers, and post-corneal transplant monitoring (any three).",
            "topic_tag": "endothelial_cell_count",
        },
        {
            "front": "What does the flare eye test measure, and in which condition is it used for monitoring?",
            "back": "It measures aqueous flare — the protein concentration in the anterior chamber — as an indicator of intraocular inflammation. It is used to monitor uveitis and post-surgical inflammation.",
            "topic_tag": "flare_test",
        },
        {
            "front": "What does Heidelberg Retinal Tomography (HRT) measure, and what is its main clinical use?",
            "back": "HRT performs 3D laser scanning of the optic nerve head to measure retinal nerve fibre layer (RNFL) thickness and optic disc parameters. It is used for glaucoma diagnosis and monitoring.",
            "topic_tag": "visual_field_imaging",
        },
        {
            "front": "What structures does Anterior Segment OCT (ASOCT) image, and list two of its indications.",
            "back": "ASOCT provides high-resolution cross-sectional imaging of the cornea, anterior chamber, angle, iris, and lens. Indications include corneal disease assessment and angle assessment for glaucoma (also post-surgical monitoring and refractive surgery planning).",
            "topic_tag": "oct_imaging",
        },
        {
            "front": "What are the standard Humphrey Visual Field test programmes, and which strategy variants are commonly used?",
            "back": "The 24-2 or 30-2 programmes are most common, especially for glaucoma, run with SITA Standard or SITA Fast strategies.",
            "topic_tag": "visual_field",
        },
        {
            "front": "What three reliability indices are checked on a Humphrey Visual Field, and what does it mean if they are high?",
            "back": "Fixation losses, false positives, and false negatives. High values in any of these indicate the test result is unreliable.",
            "topic_tag": "visual_field",
        },
        {
            "front": "Match the visual field defect to its likely cause: arcuate (Bjerrum) scotoma, altitudinal defect, and hemianopia.",
            "back": "Arcuate/Bjerrum scotoma suggests glaucoma; an altitudinal defect suggests ischaemic optic neuropathy; hemianopia suggests a neurological lesion at the chiasm or optic tract.",
            "topic_tag": "visual_field",
        },
        {
            "front": "What is Goldmann Visual Field (GVF) testing, and what advantage does it have over Humphrey (automated) perimetry?",
            "back": "GVF is manual kinetic perimetry that maps isopters (lines of equal sensitivity) across the visual field. Its advantage is being able to test very large visual fields and being useful for patients who cannot cooperate with automated testing.",
            "topic_tag": "visual_field",
        },
        {
            "front": "What does the Potential Acuity Meter (PAM) predict, what preparation does it require, and when is it indicated?",
            "back": "PAM predicts a patient's potential visual acuity after cataract surgery by projecting a Snellen chart directly onto the retina, bypassing the cataract. It requires pupil dilation and is indicated pre-cataract surgery in patients with dense cataracts to assess retinal function.",
            "topic_tag": "pam_test",
        },
        {
            "front": "What does corneal topography map, and name two of its indications.",
            "back": "It maps corneal curvature and elevation across the entire corneal surface. Indications include keratoconus screening, pre-LASIK assessment, and contact lens fitting (any two).",
            "topic_tag": "corneal_topography",
        },
        {
            "front": "What three topographic features are characteristic of keratoconus?",
            "back": "Inferior corneal steepening, an asymmetric bow-tie pattern, and irregular astigmatism.",
            "topic_tag": "corneal_topography",
        },
        {
            "front": "Describe two distinguishing features of the Modified LogMAR (M&S System) chart compared to a Snellen chart.",
            "back": "The Modified LogMAR chart has an inverted-triangle shape with 5 letters/numbers per line (except 6/120), and it is calibrated to the room/working distance — if the machine is moved, it must be recalibrated to the new room length.",
            "topic_tag": "visual_acuity",
        },
        {
            "front": "By convention, which eye is tested first for visual acuity, and what must you check before starting?",
            "back": "The right eye is tested first by convention. Check whether the patient is wearing their corrective lenses or contact lenses before starting.",
            "topic_tag": "visual_acuity",
        },
        {
            "front": "If a patient cannot read 6/120 even with a pinhole, what is the correct order of further VA testing?",
            "back": "Proceed in order: Count Fingers (CF) at 0.5m, 1m, 1.5m, 2m, then Hand Movement (HM), then Perception of Light (PL), then No Perception of Light (NPL).",
            "topic_tag": "visual_acuity",
        },
        {
            "front": "At what level of visual acuity should you apply a pinhole occluder during testing?",
            "back": "Apply the pinhole if the patient's vision is 6/12 or above, to determine whether the reduction is refractive in origin.",
            "topic_tag": "visual_acuity",
        },
        {
            "front": "Explain the time-interval principle behind non-contact (air-puff) tonometry, including one limitation.",
            "back": "NCT measures the time from the air puff to corneal flattening (applanation) — less time means a softer (lower IOP) eye, more time means a harder (higher IOP) eye. A limitation is that the air-puff tonometer tends to overestimate IOP at higher values.",
            "topic_tag": "iop_tonometry",
        },
        {
            "front": "What must be documented after performing NCT, and in what unit?",
            "back": "Document the right eye (RE) and left eye (LE) IOP readings in mmHg in SCM (the electronic patient record).",
            "topic_tag": "iop_tonometry",
        },
        {
            "front": "Outline the key steps of performing combined Auto-Refraction and Auto-Keratometry.",
            "back": "Perform hand hygiene, wipe the machine's contact parts with alcohol wipes, ask the patient to remove glasses/contact lenses, position them comfortably, instruct them to open both eyes wide and look at the fixation target, then perform the test as ordered.",
            "topic_tag": "auto_refraction",
        },
        {
            "front": "What information must be documented when instilling an eye drop?",
            "back": "Document the diagnosis, the purpose of the drop, the eye drop name and strength, and confirm the correct eye (RE/LE/Both), having checked the patient is not allergic.",
            "topic_tag": "eye_drops",
        },
        {
            "front": "What does a 'versions and ductions' assessment evaluate?",
            "back": "It evaluates eye movement in all directions of gaze, used to detect restrictions or abnormalities in ocular motility.",
            "topic_tag": "orthoptics",
        },
        {
            "front": "What does the cover/uncover test detect, and what is the difference between a tropia and a phoria?",
            "back": "It detects strabismus. A tropia is a manifest (constant) deviation visible without dissociation, while a phoria is a latent deviation only revealed when binocular fusion is broken (e.g. by covering one eye).",
            "topic_tag": "orthoptics",
        },
        {
            "front": "What is Near Point Convergence (NPC), and what is considered a normal value?",
            "back": "NPC is the closest distance at which the eyes can maintain convergence on a target before one eye drifts outward (convergence breaks down). A normal NPC is less than 10 cm.",
            "topic_tag": "orthoptics",
        },
        {
            "front": "What do the Krimsky and Hirschberg tests measure, and what tools do they use?",
            "back": "Both measure the angle of ocular deviation (strabismus) using the corneal light reflex; the Krimsky test additionally uses prisms placed in front of the eye to neutralise the deviation.",
            "topic_tag": "orthoptics",
        },
        {
            "front": "At what distance is the Near Vision Chart held, and what is considered normal near vision?",
            "back": "The chart is held at 35 cm from the patient's eyes, with correction in place. Normal near vision is N5 (the finest print).",
            "topic_tag": "visual_acuity",
        },
        {
            "front": "How is the result of an Ishihara colour vision test documented?",
            "back": "As the number of plates the patient reads correctly out of the total set.",
            "topic_tag": "color_vision",
        },
        {
            "front": "In the context of glaucoma imaging, what do the abbreviations RNFL and HRT stand for?",
            "back": "RNFL stands for Retinal Nerve Fibre Layer; HRT stands for Heidelberg Retinal Tomography — HRT measures RNFL thickness and optic disc parameters.",
            "topic_tag": "abbreviations",
        },
    ],
    "PSA": [
        {
            "front": "When performing distance visual acuity with the Modified LogMAR chart, what must the patient do before you can move to the next line down?",
            "back": "The patient must read all 5 letters/numbers on a line, from left to right, starting from the top. Testing stops at the first line where they cannot read all 5 letters.",
            "topic_tag": "visual_acuity",
        },
        {
            "front": "On the Snellen chart, how is partial line reading documented, and what is the standard testing distance?",
            "back": "Partial line reading is documented as +1/+2 or -1/-2 (letters read beyond or short of the line). The standard Snellen testing distance is 6 metres.",
            "topic_tag": "visual_acuity",
        },
        {
            "front": "When should you apply a pinhole occluder during a visual acuity check, and what does it help distinguish?",
            "back": "Apply it when vision is 6/12 or above. It helps distinguish whether reduced vision is due to a refractive error (improves with pinhole) or another cause such as media opacity or retinal/optic nerve disease (no improvement).",
            "topic_tag": "visual_acuity",
        },
        {
            "front": "At what distance should the Near Vision (N) chart be held, and what is the finest line a patient with normal near vision should read?",
            "back": "It should be held 35 cm from the patient's eyes, with their correction in place. Normal near vision is recorded as N5.",
            "topic_tag": "visual_acuity",
        },
        {
            "front": "What is the normal range for intraocular pressure (IOP), and how often should it be measured?",
            "back": "Normal IOP is 10-21 mmHg. It should be measured for all patients at all visits using non-contact tonometry (NCT).",
            "topic_tag": "iop_tonometry",
        },
        {
            "front": "List the key steps of performing NCT, including hand hygiene and equipment requirements.",
            "back": "Perform hand hygiene, wipe all patient-contact parts of the machine with alcohol wipes, ask the patient to remove glasses/contact lenses, position them comfortably, perform NCT on the right eye first, then wipe the machine and perform hand hygiene again before documenting RE and LE readings in mmHg.",
            "topic_tag": "iop_tonometry",
        },
        {
            "front": "What is a known limitation of air-puff (non-contact) tonometry at higher pressures?",
            "back": "Air-puff tonometers tend to overestimate IOP at higher values.",
            "topic_tag": "iop_tonometry",
        },
        {
            "front": "Describe the correct technique for instilling an eye drop into a patient's eye.",
            "back": "Tilt the patient's head back, gently pull the lower eyelid down to expose the lower fornix, instil one drop there, then ask the patient to gently close their eye and apply gentle pressure over the nasolacrimal area.",
            "topic_tag": "eye_drops",
        },
        {
            "front": "Before instilling any eye drop, what three things must you confirm with the patient or chart?",
            "back": "Confirm the correct eye (RE/LE/Both), check the patient has no known allergy to the drop, and explain the procedure to the patient before proceeding.",
            "topic_tag": "eye_drops",
        },
        {
            "front": "What must be documented before and during a pupil dilation procedure?",
            "back": "Document which eye(s) will be dilated, the pre-dilation pupil size in mm for both RE and LE, the dosage (number of instillations), and the time the drops were given.",
            "topic_tag": "pupil_dilation",
        },
        {
            "front": "What should you tell a patient to expect after their pupils have been dilated, and for how long?",
            "back": "Warn them of blurred near vision and increased light sensitivity (photosensitivity), which usually last 4-6 hours.",
            "topic_tag": "pupil_dilation",
        },
        {
            "front": "Who are the high fall-risk patient groups in an eye clinic, and what should you do if a patient is identified as high risk?",
            "back": "Elderly patients, patients who have just been dilated (blurred vision), and visually impaired patients are high risk. Document the action you take, such as accompanying the patient or arranging a wheelchair.",
            "topic_tag": "fall_risk",
        },
        {
            "front": "Which presentations require assessment and treatment within 10 minutes (Triage Category 1)?",
            "back": "Chemical burns (start irrigation immediately), penetrating eye injury, sudden vision loss with VA <6/60 (e.g. CRAO), and severe eye pain suggestive of acute angle-closure glaucoma.",
            "topic_tag": "triage",
        },
        {
            "front": "Which presentations should be seen within 30 minutes (Triage Category 2)?",
            "back": "Painless loss of vision (e.g. CRVO), a history suggesting penetrating eye injury, hypopyon, and total hyphaema.",
            "topic_tag": "triage",
        },
        {
            "front": "A patient calls describing new flashes and floaters with no history of retinal problems. Which triage category and timeframe applies, and what should you watch for if they do have a retinal history?",
            "back": "Category 3 — within 60 minutes. If the patient has a previous retinal history, sudden flashes or floaters raise suspicion of retinal detachment.",
            "topic_tag": "triage",
        },
        {
            "front": "Give three examples of conditions classified as Triage Category 4 (within 2 hours).",
            "back": "Any three of: conjunctivitis, blepharitis, chalazion, dry eyes, long-standing floaters with no retinal history, or subtarsal foreign body with no redness.",
            "topic_tag": "triage",
        },
        {
            "front": "What 'urgent condition' flags should you check for in Section A of the SNEC Triage Form?",
            "back": "Recent surgery, laser, or injection; whether the eye is the patient's only seeing eye; contact lens use; a history of uveitis; and previous retinal detachment.",
            "topic_tag": "triage",
        },
        {
            "front": "What does Section B of the SNEC Triage Form record, and what categories appear under Section C (Impression/Diagnosis)?",
            "back": "Section B records the outcome of triage — same-day appointment, A&E referral, or early appointment. Section C records the impression/diagnosis category, such as uveitis/infective, cornea, vitreo-retinal, glaucoma, neuro-ophthalmic, oculoplastics, trauma, or common conditions.",
            "topic_tag": "triage",
        },
        {
            "front": "When taking a patient's general health history, why do you ask about diabetes, hypertension, arthritis, and steroid use?",
            "back": "Diabetes and hypertension are vascular conditions with direct ocular complications (e.g. retinopathy); arthritis can be linked to inflammatory eye conditions like uveitis; and steroid use can affect IOP and ocular healing.",
            "topic_tag": "history_taking",
        },
        {
            "front": "What is the first set of questions you should ask about a patient's presenting visual problem?",
            "back": "Ask whether the change in vision was sudden or gradual, partial or total, and in one or both eyes — along with what correction (glasses/contact lenses) the patient currently uses.",
            "topic_tag": "history_taking",
        },
        {
            "front": "A patient wearing daily disposable contact lenses says they sometimes reuse a pair for 2-3 days. Why is this significant for history taking?",
            "back": "This is contact lens overwear, which significantly increases the risk of corneal infection and must be flagged in the history — along with checking if they are using the correct lens-care solution.",
            "topic_tag": "history_taking",
        },
        {
            "front": "How should ocular pain be assessed, and what combination of symptoms should raise suspicion of acute angle-closure glaucoma?",
            "back": "Document the pain level using a 0-10 scale, its exact type and location, whether analgesia helped, and whether there is photophobia. Severe pain combined with nausea and vomiting should raise suspicion of acute angle-closure glaucoma.",
            "topic_tag": "history_taking",
        },
        {
            "front": "What family history questions are relevant to an ophthalmology patient intake?",
            "back": "Ask about family history of cataracts, glaucoma, retinal or corneal dystrophies, retinal detachment, and squint/strabismus.",
            "topic_tag": "family_history",
        },
        {
            "front": "A patient has a red eye with marked discharge but no pain. Which condition is most likely, versus one with marked pain and photophobia but no discharge?",
            "back": "Marked discharge with no pain points to conjunctivitis. Marked pain and photophobia with no discharge points to iritis or acute glaucoma (acute glaucoma also has marked pain but only slight photophobia).",
            "topic_tag": "red_eye_differential",
        },
        {
            "front": "What combination of symptoms and signs should make you suspect acute angle-closure glaucoma in a patient checking in?",
            "back": "Severe eye pain with headache and nausea/vomiting, a hazy/oedematous-looking cornea, and a fixed, mid-dilated oval pupil.",
            "topic_tag": "acute_glaucoma",
        },
        {
            "front": "What is the Ishihara chart used for, and how would you describe it to a patient?",
            "back": "It tests for colour vision deficiency, especially red-green colour blindness, by asking the patient to identify numbers hidden within plates of coloured dots.",
            "topic_tag": "color_vision",
        },
        {
            "front": "How is the Amsler grid test performed, and what result would you flag as abnormal?",
            "back": "The patient covers one eye and looks at the central dot on the grid, reporting any distortion, missing areas, or wavy lines. Any of these findings is abnormal and suggests possible macular disease.",
            "topic_tag": "amsler_grid",
        },
        {
            "front": "What is the purpose of Auto-Refraction (AR) and Auto-Keratometry (AK), and for which patients are they typically performed?",
            "back": "AR objectively measures refractive error and AK measures corneal curvature/astigmatism. They are typically performed for new patients and as part of pre-operative assessment.",
            "topic_tag": "auto_refraction",
        },
        {
            "front": "What do the abbreviations TCU, NP, SCM, and DBE stand for?",
            "back": "TCU = To Come Up (follow-up appointment); NP = New Patient; SCM = System Configuration Management (the electronic patient record); DBE = Dilate Both Eyes.",
            "topic_tag": "abbreviations",
        },
        {
            "front": "When recording very poor vision, what do CF, HM, PL, and NPL mean, and in what order are they used?",
            "back": "CF = Count Fingers, HM = Hand Movement, PL = Perception of Light, NPL = No Perception of Light. They are used in that order when a patient cannot read even the largest chart line, even with a pinhole.",
            "topic_tag": "abbreviations",
        },
    ],
}
