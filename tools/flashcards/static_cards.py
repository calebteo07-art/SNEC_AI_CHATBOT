"""Static flashcard pool — organised as 30 sets per role (15 topics x easy/medium).

Replaces the former flat 30-card pool. Cards are short, neutral, KB-grounded
(Module 1 markdown, skill checklists, OSCE scripts) and tagged by topic +
difficulty. Mirrors the check-in pooling (see flashcard_sets.py):
- OT  -> "OT" pool (ophthalmic investigations / imaging).
- OA and PSA share the "CLINICAL" pool.

Structure: FLASHCARDS[pool][topic_key][difficulty] = [ {front, back}, x5 ].
Served via GET /api/flashcards/generate (optionally ?topic=&difficulty=) using
tools.shared.static_pools.pick_next_unseen for per-user no-repeat rotation.

Authoring status: filled incrementally, one (topic, difficulty) set per commit,
target 5 cards per set. Empty/short sets are simply not yet authored — the
topics endpoint reports per-set counts so the picker can disable empty sets.
"""
from __future__ import annotations

from tools.flashcards.flashcard_sets import (
    DIFFICULTIES,
    pool_for_role,
    topics_for,
    make_set_key,
)

# FLASHCARDS[pool][topic_key][difficulty] = list of {"front", "back"}
FLASHCARDS: dict[str, dict[str, dict[str, list[dict]]]] = {
    "CLINICAL": {
        "ocular_emergencies": {
            "easy": [
                {"front": "Name three of the seven types of ocular emergency.",
                 "back": "Any three of: physical injuries, chemical injuries, infections, painless sudden loss of vision, acute glaucoma, uveitis, painful CN III palsy."},
                {"front": "Is acute glaucoma an ocular emergency?",
                 "back": "Yes — acute glaucoma is one of the seven listed ocular emergencies."},
                {"front": "What pupil sign is seen in acute glaucoma?",
                 "back": "A fixed, mid-dilated pupil (large and oval)."},
                {"front": "What is a hyphaema?",
                 "back": "Blood in the anterior chamber (the front part of the eye)."},
                {"front": "What is a hypopyon?",
                 "back": "Pus in the anterior chamber — a sign of infection."},
            ],
            "medium": [
                {"front": "A patient has severe eye pain with headache, nausea and vomiting. Which emergency should you suspect?",
                 "back": "Acute angle-closure glaucoma."},
                {"front": "Why must a chemical eye injury be irrigated immediately?",
                 "back": "To wash out the chemical and limit ongoing damage — it is Triage Category 1 (within 10 minutes)."},
                {"front": "How do the pupils differ between acute glaucoma and uveitis?",
                 "back": "Acute glaucoma: large, oval, fixed pupil. Uveitis: smaller or same-sized pupil."},
                {"front": "A welder has painful, red, watering eyes a few hours after work. What is the likely cause?",
                 "back": "A flash burn (photokeratitis) from UV exposure; the pain is typically delayed."},
                {"front": "Which features point to acute angle-closure rather than a simple red eye?",
                 "back": "Severe pain with nausea/vomiting, haloes around lights, a hazy cornea, and a fixed mid-dilated pupil."},
            ],
        },
        "triage": {
            "easy": [
                {"front": "Within how long must a Triage Category 1 case be seen?",
                 "back": "Within 10 minutes."},
                {"front": "Within how long must a Triage Category 2 case be seen?",
                 "back": "Within 30 minutes."},
                {"front": "Within how long must a Triage Category 3 case be seen?",
                 "back": "Within 60 minutes."},
                {"front": "Within how long must a Triage Category 4 case be seen?",
                 "back": "Within 2 hours (minor or chronic conditions)."},
                {"front": "Is conjunctivitis Triage Category 1 or 4?",
                 "back": "Category 4 — a minor/chronic condition."},
            ],
            "medium": [
                {"front": "Which triage category is a chemical burn, and what is the first action?",
                 "back": "Category 1 (within 10 minutes) — start irrigation immediately."},
                {"front": "A patient with previous retinal history reports a sudden increase in floaters. Which category?",
                 "back": "Category 3 (within 60 minutes) — suspect retinal detachment."},
                {"front": "Central retinal artery occlusion (CRAO) with VA <6/60 is which category?",
                 "back": "Category 1 (within 10 minutes)."},
                {"front": "A total hyphaema is which triage category?",
                 "back": "Category 2 (within 30 minutes)."},
                {"front": "A welder's flash burn is which triage category?",
                 "back": "Category 3 (within 60 minutes) — painful red eye / flash burn."},
            ],
        },
        "red_eye": {
            "easy": [
                {"front": "In conjunctivitis, what is the discharge like?", "back": "Marked discharge."},
                {"front": "Which red-eye condition has no discharge but marked photophobia?", "back": "Iritis (anterior uveitis)."},
                {"front": "What is the pupil like in acute glaucoma?", "back": "Large, oval and fixed."},
                {"front": "Does conjunctivitis usually reduce visual acuity?", "back": "No — visual acuity is normal."},
                {"front": "Which red-eye conditions cause the most severe pain?", "back": "Acute glaucoma and keratitis (marked pain)."},
            ],
            "medium": [
                {"front": "Marked discharge, no pain, no photophobia, normal vision, normal pupil. Diagnosis?", "back": "Conjunctivitis."},
                {"front": "Marked pain, photophobia, reduced vision and a small pupil. Diagnosis?", "back": "Iritis (anterior uveitis)."},
                {"front": "Severe pain, reduced vision and a large fixed oval pupil. Diagnosis?", "back": "Acute (angle-closure) glaucoma."},
                {"front": "How does the pupil separate iritis from acute glaucoma?", "back": "Iritis: small or normal pupil. Acute glaucoma: large, oval, fixed pupil."},
                {"front": "Keratitis or a corneal abrasion typically causes what pain and discharge?", "back": "Marked pain with slight or no discharge; visual acuity varies with the lesion site."},
            ],
        },
        "history_taking": {
            "easy": [
                {"front": "Name two systemic conditions especially important in an eye history.", "back": "Diabetes and hypertension (vascular); inflammatory conditions like arthritis/uveitis also matter."},
                {"front": "Which medication groups must you specifically ask about?", "back": "Anticoagulants, steroids, herbal supplements, vitamins, anti-malarials."},
                {"front": "For a visual complaint, name two key questions.", "back": "Was the change sudden or gradual? One eye or both (and partial or total)?"},
                {"front": "What scale is used for pain assessment?", "back": "A 0-10 pain scale."},
                {"front": "Name two conditions to ask about in the family ocular history.", "back": "Glaucoma and cataract (also retinal detachment, dystrophies, squint)."},
            ],
            "medium": [
                {"front": "Why ask about anticoagulants before a procedure?", "back": "They increase bleeding risk during procedures or after trauma."},
                {"front": "Severe eye pain with nausea and vomiting in the history suggests what?", "back": "Acute angle-closure glaucoma."},
                {"front": "A contact lens wearer with a red eye — two history points that raise infection risk?", "back": "Overwear (e.g. daily lenses worn 2-3 days) and incorrect lens-care solution."},
                {"front": "Why ask about recent overseas travel when there is purulent discharge?", "back": "It may indicate an acquired infection or poor hygiene."},
                {"front": "A myopic patient reports new flashes and floaters — why does it matter?", "back": "Myopia raises retinal detachment risk; new flashes/floaters need prompt review."},
            ],
        },
        "distance_va": {
            "easy": [
                {"front": "What is normal distance VA on the Snellen scale?", "back": "6/6."},
                {"front": "Which eye is tested first by convention?", "back": "The right eye."},
                {"front": "At what VA do you apply the pinhole?", "back": "When VA is 6/12 or worse (reduced)."},
                {"front": "In the fraction 6/18, what does the top number mean?", "back": "The testing distance (6 metres)."},
                {"front": "Which chart is used for patients who cannot read letters?", "back": "The E chart (tumbling E)."},
            ],
            "medium": [
                {"front": "A patient cannot read any of the 6/60 line. What is the next step?", "back": "Proceed to 6/120; if still unable, move to CF, then HM, PL, NPL."},
                {"front": "Order the low-vision steps after 6/120 cannot be read.", "back": "Count Fingers (CF) → Hand Movement (HM) → Perception of Light (PL) → No Perception of Light (NPL)."},
                {"front": "VA improves with the pinhole — what does this suggest?", "back": "A refractive cause (correctable with glasses)."},
                {"front": "VA does not improve with the pinhole — what does this suggest?", "back": "A non-refractive cause such as media opacity or retinal/optic nerve disease."},
                {"front": "VA dropped from 6/12 to 6/120 since the last visit. What should you do?", "back": "Highlight the drop to the doctor."},
            ],
        },
        "iop_nct": {
            "easy": [
                {"front": "What is the normal IOP range?", "back": "10-21 mmHg."},
                {"front": "What does NCT use to measure IOP?", "back": "A puff of air (non-contact air-puff tonometer)."},
                {"front": "When is IOP measured?", "back": "For all patients, all visits."},
                {"front": "What must you do to machine contact parts before and after NCT?", "back": "Wipe them with alcohol wipes (and perform hand hygiene)."},
                {"front": "Which eye is measured first?", "back": "The right eye (by convention)."},
            ],
            "medium": [
                {"front": "Name two causes of unreliable NCT readings.", "back": "Blinking/poor cooperation and poor positioning or alignment."},
                {"front": "NCT readings remain unreliable. What should you do?", "back": "Refer for Goldmann applanation tonometry."},
                {"front": "Why might the air-puff tonometer overestimate at high IOP?", "back": "Air-puff (NCT) tends to overestimate at higher IOP values."},
                {"front": "An asymptomatic patient has IOP 26/24 mmHg. What do you do?", "back": "Confirm on repeat and flag for assessment — it is above normal and glaucoma is often symptomless."},
                {"front": "Why remove glasses or contact lenses before NCT?", "back": "They interfere with the air-puff measurement."},
            ],
        },
        "near_vision": {
            "easy": [
                {"front": "At what distance is the near vision (N) chart held?", "back": "35 cm."},
                {"front": "What is normal near vision?", "back": "N5 (the finest print)."},
                {"front": "When is near vision tested?", "back": "On the first visit and when ordered."},
                {"front": "How is each eye tested for near vision?", "back": "Separately, with the other eye occluded."},
                {"front": "Should correction be worn for the near VA test?", "back": "Yes — record near VA with correction in place."},
            ],
            "medium": [
                {"front": "A 50-year-old reads N10 unaided but N5 with a reading add. Diagnosis?", "back": "Presbyopia."},
                {"front": "Distance VA is 6/6 but near VA is reduced. What does this pattern suggest?", "back": "Presbyopia (age-related loss of near focusing)."},
                {"front": "Why ensure adequate lighting for near VA?", "back": "Poor lighting falsely reduces the recorded near acuity."},
                {"front": "How are near vision results documented?", "back": "As N5, N6, N8, N10, etc. — the smallest line read comfortably."},
                {"front": "A patient holds reading material further away to focus. What does this suggest?", "back": "Presbyopia."},
            ],
        },
        "pinhole": {
            "easy": [
                {"front": "What does a pinhole occluder do?", "back": "It blocks peripheral light rays so only central rays enter the eye."},
                {"front": "When is the pinhole used?", "back": "When VA is reduced (6/12 or worse)."},
                {"front": "Vision improves with the pinhole — refractive or not?", "back": "Refractive (likely correctable with glasses)."},
                {"front": "Vision does not improve with the pinhole — refractive or not?", "back": "Non-refractive (a media, retinal, or optic nerve cause)."},
                {"front": "Can the pinhole replace a formal refraction?", "back": "No — it only screens for a refractive cause."},
            ],
            "medium": [
                {"front": "A cataract patient's VA does not improve with the pinhole. Why?", "back": "The reduced vision is from media opacity (the cloudy lens), not refractive error."},
                {"front": "A myope's VA improves markedly with the pinhole. Interpretation?", "back": "Uncorrected refractive error — glasses are likely to help."},
                {"front": "Why does the pinhole sharpen vision in uncorrected refractive error?", "back": "It removes blur from peripheral rays, sharpening the retinal image."},
                {"front": "Pinhole gives only slight improvement in a dense cataract. Interpretation?", "back": "A mainly non-refractive (media) cause, perhaps with a small refractive component."},
                {"front": "At what VA threshold do you apply the pinhole?", "back": "6/12 or worse."},
            ],
        },
        "eye_drops": {
            "easy": [
                {"front": "Before instilling an eye drop, what must you confirm about the eye?", "back": "The correct eye (right, left, or both)."},
                {"front": "What must you check about the patient before instilling a drop?", "back": "That they are not allergic to it."},
                {"front": "Where is the drop instilled?", "back": "Into the lower fornix (gently pull the lower lid down)."},
                {"front": "After instilling, what should the patient do?", "back": "Close the eye gently and apply light pressure over the nasolacrimal area."},
                {"front": "Name two things to document for eye drop instillation.", "back": "Diagnosis/purpose and the drop name and strength."},
            ],
            "medium": [
                {"front": "Why apply pressure over the nasolacrimal area after instillation?", "back": "To reduce systemic absorption and keep the drop in the eye."},
                {"front": "Why confirm the correct eye and drug before instilling?", "back": "To avoid wrong-eye or wrong-drug errors (patient safety)."},
                {"front": "A patient says a past drop made the eye itchy and swollen. What do you do?", "back": "Treat it as a drug allergy — do not use that drop and flag it clearly."},
                {"front": "Why tilt the head back and pull the lower lid down?", "back": "To expose the lower fornix so the drop lands correctly."},
                {"front": "Two drops are ordered for the same eye. What is good practice?", "back": "Wait a short interval between them so the first drop is not washed out."},
            ],
        },
        "pupil_dilation": {
            "easy": [
                {"front": "Name a common dilating drop.", "back": "Tropicamide 1% (or phenylephrine 2.5%)."},
                {"front": "How long do dilation effects usually last?", "back": "About 4-6 hours."},
                {"front": "Name two effects to warn the patient about after dilation.", "back": "Blurred near vision and light sensitivity (photophobia)."},
                {"front": "Name a contraindication to routine pupil dilation.", "back": "Narrow (drainage) angles."},
                {"front": "Name two things to document for dilation.", "back": "Eye(s) dilated, pre-dilation pupil size, dosage, and time."},
            ],
            "medium": [
                {"front": "A patient mentions a previous acute angle-closure attack. What do you do before dilating?", "back": "Do not dilate routinely — check with the nurse/doctor (narrow-angle contraindication)."},
                {"front": "Why warn a driver about dilation?", "back": "Blurred vision and glare make driving unsafe for several hours."},
                {"front": "After dilation, what comfort measure can you offer?", "back": "Sunglasses/UV protectors for photosensitivity."},
                {"front": "Why record the pre-dilation pupil size?", "back": "To document the baseline and monitor the dilation response."},
                {"front": "Why does dilation raise fall risk in the elderly?", "back": "It blurs vision and adds photosensitivity on top of existing risks."},
            ],
        },
    },
    "OT": {
        "oct_macula": {
            "easy": [
                {"front": "What does a macular OCT image?",
                 "back": "A cross-sectional scan of the macula (the central retina)."},
                {"front": "Is OCT a contact or non-contact test?",
                 "back": "Non-contact — it is a light-based scan."},
                {"front": "Name one condition monitored with macular OCT.",
                 "back": "Diabetic macular oedema (or age-related macular degeneration)."},
                {"front": "What shows a good-quality OCT scan?",
                 "back": "Adequate signal strength and correct centration on the fovea."},
                {"front": "What OCT finding suggests macular oedema?",
                 "back": "Increased macular thickness with intraretinal fluid."},
            ],
            "medium": [
                {"front": "A diabetic has blurred central vision. What macular OCT finding fits macular oedema?",
                 "back": "Increased central retinal thickness with intraretinal (cystoid) fluid."},
                {"front": "Why might OCT signal strength be low in a cataract patient?",
                 "back": "The cloudy lens (media opacity) reduces the light signal reaching the retina."},
                {"front": "How can you improve a poor macular OCT caused by dry eye?",
                 "back": "Ask the patient to blink fully or instil a lubricant to refresh the tear film, then re-acquire."},
                {"front": "Why save a baseline macular OCT?",
                 "back": "For serial comparison, to monitor the disease and response to treatment."},
                {"front": "In wet AMD follow-up, what does persistent fluid on OCT suggest?",
                 "back": "Ongoing disease activity that may need continued treatment (the doctor decides)."},
            ],
        },
        "hvf": {
            "easy": [
                {"front": "What does the Humphrey Visual Field (HVF) test measure?",
                 "back": "Central and peripheral visual field sensitivity (automated static perimetry)."},
                {"front": "Which HVF programme is most common for glaucoma?",
                 "back": "The 24-2 programme (30-2 is also used)."},
                {"front": "Name one HVF reliability index.",
                 "back": "Fixation losses (also false positives and false negatives)."},
                {"front": "What does a high number of false positives mean?",
                 "back": "The test is unreliable."},
                {"front": "Name one condition monitored with HVF.",
                 "back": "Glaucoma (also neurological and retinal disease)."},
            ],
            "medium": [
                {"front": "An HVF shows high fixation losses and false positives. What should you do?",
                 "back": "Re-instruct the patient and repeat the test — the result is unreliable."},
                {"front": "What visual field pattern suggests glaucoma?",
                 "back": "An arcuate (Bjerrum) scotoma."},
                {"front": "What field pattern suggests a lesion at the optic chiasm or tract?",
                 "back": "A hemianopia (a neurological pattern)."},
                {"front": "Why must the correct near trial lens be used during HVF?",
                 "back": "To correct for near focus so the central field points are tested accurately."},
                {"front": "What must be acceptable before an HVF is interpreted?",
                 "back": "The reliability indices (fixation losses, false positives and false negatives)."},
            ],
        },
        "oct_rnfl": {
            "easy": [
                {"front": "What does an RNFL OCT measure?", "back": "The retinal nerve fibre layer thickness around the optic disc."},
                {"front": "RNFL OCT is mainly used to monitor which disease?", "back": "Glaucoma."},
                {"front": "Where must the RNFL scan be centred?", "back": "On the optic disc (peripapillary)."},
                {"front": "Is RNFL OCT contact or non-contact?", "back": "Non-contact."},
                {"front": "Why save an RNFL scan?", "back": "For serial comparison to track glaucoma progression."},
            ],
            "medium": [
                {"front": "What RNFL finding is typical of glaucoma?", "back": "RNFL thinning (often inferior or superior)."},
                {"front": "Why is correct disc centration important for RNFL OCT?", "back": "An off-centre measurement ring gives inaccurate, non-comparable thickness values."},
                {"front": "Name two quality checks before saving an RNFL scan.", "back": "Adequate signal strength and stable fixation (minimal motion artefact)."},
                {"front": "How is RNFL OCT used alongside the visual field?", "back": "Structural RNFL change is correlated with functional field loss to monitor glaucoma."},
                {"front": "A decentred RNFL scan shows asymmetric thinning. What do you do?", "back": "Re-acquire a properly centred scan before it is used."},
            ],
        },
        "gvf": {
            "easy": [
                {"front": "What does the Goldmann visual field (GVF) use?", "back": "Manual kinetic perimetry that maps isopters."},
                {"front": "Is GVF static or kinetic perimetry?", "back": "Kinetic (a moving target)."},
                {"front": "Name one advantage of GVF over automated fields.", "back": "It can test very large fields and suits patients who cannot do automated testing."},
                {"front": "Name one indication for GVF.", "back": "Advanced glaucoma, neurological conditions, low vision, or disability certification."},
                {"front": "What does an isopter represent?", "back": "A line joining points of equal retinal sensitivity."},
            ],
            "medium": [
                {"front": "A patient cannot cooperate with automated HVF. What alternative field test?", "back": "Goldmann visual field (GVF)."},
                {"front": "Why is GVF useful in advanced glaucoma?", "back": "It maps the remaining field, including large/peripheral areas automated tests handle poorly."},
                {"front": "GVF vs HVF — which is automated static perimetry?", "back": "HVF is automated static; GVF is manual kinetic."},
                {"front": "What is documented for a GVF?", "back": "Diagnosis, indication, and interpretation of the isopter results."},
                {"front": "For disability or low-vision certification, which field test is often used?", "back": "GVF."},
            ],
        },
        "ascan_biometry": {
            "easy": [
                {"front": "What does A-scan biometry measure?", "back": "The axial length of the eye."},
                {"front": "What is the main indication for A-scan biometry?", "back": "Pre-cataract surgery IOL power calculation."},
                {"front": "What kind of energy does A-scan use?", "back": "Ultrasound."},
                {"front": "For the contact method, what is instilled first?", "back": "A topical anaesthetic."},
                {"front": "Name the two A-scan techniques.", "back": "Contact (applanation) and immersion."},
            ],
            "medium": [
                {"front": "When is A-scan preferred over optical biometry?", "back": "When a dense cataract blocks the optical (light) signal."},
                {"front": "What error does corneal indentation cause in contact A-scan?", "back": "It falsely shortens the axial length."},
                {"front": "How does the immersion technique avoid that error?", "back": "It avoids pressing on (indenting) the cornea."},
                {"front": "Why take multiple A-scan readings?", "back": "To confirm consistency before accepting the axial length."},
                {"front": "A-scan gives axial length — what else is needed for IOL power?", "back": "Keratometry (corneal curvature)."},
            ],
        },
        "endothelial": {
            "easy": [
                {"front": "What does an endothelial cell count measure?", "back": "Corneal endothelial cell density (cells/mm2)."},
                {"front": "What is a normal endothelial cell density?", "back": "Above 2000 cells/mm2."},
                {"front": "Below what count is concern raised?", "back": "Below 1500 cells/mm2."},
                {"front": "Name one indication for an endothelial cell count.", "back": "Pre-cataract surgery, Fuchs dystrophy, contact lens wearers, or post-corneal transplant."},
                {"front": "Is the test contact or non-contact?", "back": "Non-contact (specular microscopy)."},
            ],
            "medium": [
                {"front": "Why does a low endothelial count matter before cataract surgery?", "back": "It raises the risk of corneal decompensation (oedema) after surgery."},
                {"front": "Vision worse in the morning, better later — which corneal condition?", "back": "Endothelial dysfunction such as Fuchs dystrophy."},
                {"front": "Besides density, what else is recorded?", "back": "Cell morphology (e.g. irregular cell shapes)."},
                {"front": "A count of 1300 cells/mm2 — normal or concerning?", "back": "Concerning — it is below the 1500 threshold."},
                {"front": "Why might a long-term contact lens wearer need this test?", "back": "Long-term lens wear can reduce endothelial cell density."},
            ],
        },
        "optical_biometry": {
            "easy": [
                {"front": "Is optical biometry contact or non-contact?", "back": "Non-contact."},
                {"front": "Name two measurements optical biometry provides.", "back": "Axial length, corneal curvature (keratometry), and anterior chamber depth (any two)."},
                {"front": "What is the main indication for optical biometry?", "back": "Pre-cataract surgery IOL power calculation."},
                {"front": "Optical vs A-scan — which is more accurate in most eyes?", "back": "Optical biometry."},
                {"front": "What does the measurement feed into?", "back": "The IOL power calculation."},
            ],
            "medium": [
                {"front": "Why is optical biometry preferred over A-scan when possible?", "back": "It is non-contact and more accurate for IOL calculation in most eyes."},
                {"front": "When does optical biometry fail, needing A-scan instead?", "back": "With a dense cataract that blocks the light signal."},
                {"front": "Why take multiple optical biometry readings?", "back": "To confirm consistency before the values are used."},
                {"front": "Besides cataract surgery, name one other use.", "back": "Contact lens fitting."},
                {"front": "Who selects the IOL power from the biometry?", "back": "The doctor — the OT measures and documents."},
            ],
        },
        "asoct": {
            "easy": [
                {"front": "What does ASOCT image?", "back": "The anterior segment — cornea, anterior chamber, angle, iris, and lens."},
                {"front": "Is ASOCT contact or non-contact?", "back": "Non-contact."},
                {"front": "Name one indication for ASOCT.", "back": "Anterior chamber angle assessment in glaucoma (also corneal disease, post-surgery, refractive planning)."},
                {"front": "What kind of image does ASOCT give?", "back": "A high-resolution cross-sectional image."},
                {"front": "Which angle does ASOCT help assess?", "back": "The anterior chamber (drainage) angle."},
            ],
            "medium": [
                {"front": "Why is ASOCT useful in a narrow-angle glaucoma suspect?", "back": "It images the anterior chamber angle to assess how narrow or open it is."},
                {"front": "ASOCT vs macular OCT — what is the difference in target?", "back": "ASOCT images the anterior segment; macular OCT images the retina/macula."},
                {"front": "Name a corneal use of ASOCT.", "back": "Assessing corneal disease, thickness, or post-surgical/refractive planning."},
                {"front": "Why is ASOCT preferred over a contact method for the angle?", "back": "It is non-contact, comfortable, and high-resolution."},
                {"front": "What does the OT document for ASOCT?", "back": "Diagnosis, indication, eye(s), and findings."},
            ],
        },
        "flare": {
            "easy": [
                {"front": "What does the flare test measure?", "back": "Aqueous flare — protein concentration in the anterior chamber."},
                {"front": "Flare is an indicator of what?", "back": "Intraocular inflammation."},
                {"front": "Name one indication for the flare test.", "back": "Uveitis monitoring (or post-surgical inflammation assessment)."},
                {"front": "Is the flare test contact or non-contact?", "back": "Non-contact (laser flare photometry)."},
                {"front": "A higher flare value means what?", "back": "More intraocular inflammation."},
            ],
            "medium": [
                {"front": "Why use the flare test in uveitis?", "back": "To objectively measure and monitor anterior chamber inflammation over time."},
                {"front": "How does flare help after surgery?", "back": "It quantifies post-operative inflammation to guide treatment such as steroid tapering."},
                {"front": "Mildly raised flare a week after cataract surgery — interpretation?", "back": "Expected early post-operative inflammation (lower than acute uveitis)."},
                {"front": "Why also measure the fellow eye?", "back": "As a baseline for comparison."},
                {"front": "Who decides on treatment from the flare value?", "back": "The doctor — the OT measures and documents."},
            ],
        },
        "corneal_topography": {
            "easy": [
                {"front": "What does corneal topography map?", "back": "Corneal curvature and elevation across the whole corneal surface."},
                {"front": "Name one indication for corneal topography.", "back": "Keratoconus screening (also pre-LASIK and contact lens fitting)."},
                {"front": "What pattern suggests keratoconus?", "back": "Inferior corneal steepening / asymmetric bow-tie / irregular astigmatism."},
                {"front": "What does the test document?", "back": "K readings, the pattern, and any irregularity."},
                {"front": "Is corneal topography used before refractive surgery?", "back": "Yes — for pre-LASIK assessment."},
            ],
            "medium": [
                {"front": "A young patient has inferior steepening and irregular astigmatism. Suspect?", "back": "Keratoconus."},
                {"front": "Why is topography done before LASIK?", "back": "To screen for keratoconus and irregular corneas that contraindicate surgery."},
                {"front": "How does topography help contact lens fitting?", "back": "It maps the corneal shape to select a well-fitting lens."},
                {"front": "Topography vs keratometry — what is topography's advantage?", "back": "It maps the entire corneal surface, not just central curvature."},
                {"front": "What does an asymmetric bow-tie pattern suggest?", "back": "Irregular astigmatism, possibly early keratoconus."},
            ],
        },
    },
}


# ── Serving helpers ──────────────────────────────────────────────────────────

def _tag(topic_key: str, difficulty: str, card: dict) -> dict:
    return {"front": card["front"], "back": card["back"],
            "topic_tag": topic_key, "difficulty": difficulty}


def get_set_cards(role: str, topic_key: str, difficulty: str) -> list[dict]:
    """Cards for one (topic, difficulty) set, tagged for serving."""
    pool = FLASHCARDS.get(pool_for_role(role), {})
    cards = pool.get(topic_key, {}).get(difficulty, [])
    return [_tag(topic_key, difficulty, c) for c in cards]


def get_all_cards(role: str) -> list[dict]:
    """Every authored card for a role's pool (used by the no-arg rotation)."""
    pool = FLASHCARDS.get(pool_for_role(role), {})
    out: list[dict] = []
    for topic_key, _ in topics_for(role):
        by_diff = pool.get(topic_key, {})
        for difficulty in DIFFICULTIES:
            for c in by_diff.get(difficulty, []):
                out.append(_tag(topic_key, difficulty, c))
    return out


def set_card_counts(role: str) -> dict[str, int]:
    """{set_key: number of authored cards} for every set in the role's pool."""
    pool = FLASHCARDS.get(pool_for_role(role), {})
    counts: dict[str, int] = {}
    for topic_key, _ in topics_for(role):
        by_diff = pool.get(topic_key, {})
        for difficulty in DIFFICULTIES:
            counts[make_set_key(topic_key, difficulty)] = len(by_diff.get(difficulty, []))
    return counts
