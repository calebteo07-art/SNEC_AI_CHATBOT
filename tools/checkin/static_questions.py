"""Static check-in question pool — 30 questions per student role (OA/OT/PSA).

Reorganized from the former AI fallback question bank (tools/api/routers/checkin.py).
Each role's 30 questions = its 20 role-specific topics + 10 of the shared
general ophthalmology topics, selected for relevance to that role. Content
is reused verbatim — no new questions were authored.

Used by GET /api/checkin/question via tools.shared.static_pools.pick_by_day_count
to deterministically rotate each student through the full 30-question pool
before any repeats.
"""

CHECKIN_QUESTION_POOL: dict[str, list[dict]] = {
    "OA": [
        {
            "topic": "IOP measurement technique",
            "question": (
                "A patient is being prepared for routine glaucoma monitoring. What is the normal IOP range in mmHg, "
                "and what are three key steps you must complete before measuring IOP to ensure an accurate reading?"
            ),
        },
        {
            "topic": "Goldmann tonometry",
            "question": (
                "During Goldmann applanation tonometry, you notice the fluorescein mires are not aligned correctly. "
                "Describe how to achieve proper mire alignment and state the endpoint you are looking for."
            ),
        },
        {
            "topic": "non-contact tonometry",
            "question": (
                "You are performing NCT and keep getting inconsistent readings across three attempts. "
                "What are two common causes of unreliable NCT results, and when would you refer the patient for Goldmann tonometry instead?"
            ),
        },
        {
            "topic": "pupil dilation procedure",
            "question": (
                "Before instilling dilating drops, what three contraindications must you check for, "
                "and what do you tell the patient to expect in terms of vision changes and duration of effect?"
            ),
        },
        {
            "topic": "dilating drops and contraindications",
            "question": (
                "A patient mentions they have a narrow drainage angle. Which class of dilating drops is absolutely contraindicated, "
                "and why? Name one alternative procedure you could perform without dilating."
            ),
        },
        {
            "topic": "visual acuity testing",
            "question": (
                "You are testing distance VA on an elderly patient who struggles to read the chart. "
                "Describe the correction-in-use protocol and at what point you would switch to a pinhole occluder."
            ),
        },
        {
            "topic": "Snellen chart technique",
            "question": (
                "A patient achieves 6/9 vision with their glasses. Explain what this fraction means, "
                "at what distance the chart should be placed, and how you would document this finding in the EMR."
            ),
        },
        {
            "topic": "pinhole test",
            "question": (
                "A patient's unaided VA is 6/18 but improves to 6/6 with pinhole. "
                "What does this tell you about the likely cause of their reduced vision, and what is the clinical significance?"
            ),
        },
        {
            "topic": "patient history taking",
            "question": (
                "A patient presents with sudden onset floaters in the right eye. "
                "List five key questions you must ask in the history, and which symptom — if also present — would prompt immediate escalation."
            ),
        },
        {
            "topic": "chief complaint documentation",
            "question": (
                "You are documenting a patient's presenting complaint of sudden blurred vision in the right eye. "
                "What six key elements must be captured in the history of presenting complaint for the ophthalmologist's review?"
            ),
        },
        {
            "topic": "pre-operative checklist",
            "question": (
                "A patient is scheduled for cataract surgery on the right eye. "
                "List four items on the pre-operative checklist that you, as an OA, are responsible for confirming on the day of surgery."
            ),
        },
        {
            "topic": "post-operative instructions",
            "question": (
                "After uncomplicated cataract surgery, what are the three most important post-operative instructions "
                "you must give the patient regarding activity restrictions and warning signs requiring urgent review?"
            ),
        },
        {
            "topic": "anterior chamber assessment",
            "question": (
                "Using the pen-torch test, how do you assess anterior chamber depth as shallow or deep? "
                "What finding would make you reluctant to dilate this patient?"
            ),
        },
        {
            "topic": "confrontation visual field test",
            "question": (
                "Describe how you perform a confrontation visual field test. "
                "If you detect a temporal field defect in the left eye only, what does this localise in the visual pathway?"
            ),
        },
        {
            "topic": "colour vision testing",
            "question": (
                "You are administering the Ishihara test to a patient referred for possible optic neuritis. "
                "How many plates do you show, and what pattern of failure would be consistent with an acquired dyschromatopsia?"
            ),
        },
        {
            "topic": "Amsler grid",
            "question": (
                "A patient with known AMD is asked to use the Amsler grid at home. "
                "Describe the correct viewing conditions and the two abnormal findings the patient should immediately report to the clinic."
            ),
        },
        {
            "topic": "cover-uncover test",
            "question": (
                "Describe how you perform the cover-uncover test and the alternate cover test. "
                "What specific eye movement on uncovering indicates a tropia versus a phoria?"
            ),
        },
        {
            "topic": "documentation and EMR entry",
            "question": (
                "You notice a previous IOP entry in the EMR appears to have been entered for the wrong eye. "
                "What is the correct process for amending a clinical record, and what must never be done?"
            ),
        },
        {
            "topic": "infection control in ophthalmology",
            "question": (
                "Between slit-lamp examinations on different patients, what are the standard infection control steps "
                "you must complete for the chin rest, forehead rest, and any contact instruments?"
            ),
        },
        {
            "topic": "patient consent and counselling",
            "question": (
                "A patient refuses pupil dilation because they are worried about driving home. "
                "How do you counsel them about the risks and alternatives, and what must be documented if they decline?"
            ),
        },
        {
            "topic": "anatomy of the anterior segment",
            "question": (
                "Name the five main structures of the anterior segment in order from most anterior to most posterior, "
                "and state the primary function of the corneal endothelium."
            ),
        },
        {
            "topic": "common causes of red eye",
            "question": (
                "A patient presents with unilateral red eye, photophobia, and reduced vision. "
                "Rank these four conditions in order of clinical urgency: conjunctivitis, corneal ulcer, acute anterior uveitis, acute angle-closure glaucoma."
            ),
        },
        {
            "topic": "acute angle-closure glaucoma",
            "question": (
                "A patient presents with sudden headache, nausea, haloes around lights, and a rock-hard eye on palpation. "
                "What is the likely diagnosis, and what is the first pharmacological treatment given to rapidly lower IOP?"
            ),
        },
        {
            "topic": "cataract grading and management",
            "question": (
                "Using the LOCS III system, what three lens parameters are graded? "
                "At what point does the clinician typically recommend surgery — based on symptoms, objective grade, or both?"
            ),
        },
        {
            "topic": "corneal abrasion management",
            "question": (
                "A contact lens wearer presents with a painful, photophobic red eye and a 3×3 mm fluorescein-positive epithelial defect centrally. "
                "List three management steps and one specific follow-up instruction."
            ),
        },
        {
            "topic": "retinal detachment symptoms",
            "question": (
                "A patient calls to report new floaters, flashes of light, and a dark curtain in their peripheral vision. "
                "Which symptom is most alarming, and what is the appropriate clinical response within the same day?"
            ),
        },
        {
            "topic": "refractive errors overview",
            "question": (
                "Differentiate myopia, hyperopia, and astigmatism by where the focal point falls relative to the retina. "
                "For each, state the type of corrective lens used."
            ),
        },
        {
            "topic": "fluorescein staining",
            "question": (
                "During slit-lamp examination with fluorescein, a triangular staining area is seen nasally near the limbus. "
                "What is the likely diagnosis, and what does cobalt blue filter illumination reveal about corneal epithelial integrity?"
            ),
        },
        {
            "topic": "emergency ocular trauma",
            "question": (
                "A patient presents with a penetrating eye injury from a wire. "
                "List three things you must NOT do at initial assessment, and describe the appropriate first-aid and referral pathway."
            ),
        },
        {
            "topic": "uveitis classification",
            "question": (
                "Using anatomical location, classify uveitis into four types and describe the hallmark slit-lamp finding for anterior uveitis. "
                "Which systemic condition is most commonly associated with HLA-B27 and recurrent uveitis?"
            ),
        },
    ],
    "OT": [
        {
            "topic": "A-scan biometry",
            "question": (
                "You are performing A-scan biometry on a pseudophakic eye for IOL power calculation. "
                "What mode should the ultrasound be set to, and why does the sound velocity setting matter for accuracy?"
            ),
        },
        {
            "topic": "IOL power calculation",
            "question": (
                "A patient has an axial length of 22.5 mm and corneal power (K) of 44.0 / 44.5 D. "
                "Would you expect a higher or lower IOL power compared to a 24 mm eye, and why?"
            ),
        },
        {
            "topic": "AL measurement",
            "question": (
                "You obtain three axial length readings of 23.42, 23.44, and 23.80 mm. "
                "Which reading is an outlier, and what is the maximum acceptable standard deviation before you must re-measure?"
            ),
        },
        {
            "topic": "Humphrey Visual Field interpretation",
            "question": (
                "On a Humphrey 24-2 report, you see fixation losses of 4/18, false positives of 28%, and false negatives of 12%. "
                "Which reliability index most significantly invalidates the test, and why?"
            ),
        },
        {
            "topic": "glaucoma HVF patterns",
            "question": (
                "Describe the typical Humphrey visual field pattern associated with an early superior arcuate scotoma in glaucoma. "
                "Which area of the optic nerve fibre layer does this correspond to?"
            ),
        },
        {
            "topic": "OCT retinal nerve fibre layer",
            "question": (
                "An OCT RNFL report shows a red sector at 7 o'clock in the left eye on the deviation map. "
                "What quadrant of the RNFL does this represent, and how does this correlate to glaucoma staging?"
            ),
        },
        {
            "topic": "OCT macular scan interpretation",
            "question": (
                "An OCT macular scan shows a hyporeflective space between the neurosensory retina and the RPE. "
                "What condition does this suggest, and which measurement is used to monitor treatment response?"
            ),
        },
        {
            "topic": "corneal topography and Ks",
            "question": (
                "A patient's Pentacam shows SimK values of 42.5 D @ 90° and 48.2 D @ 180°. "
                "Calculate the astigmatism magnitude and state whether this is with-the-rule or against-the-rule astigmatism."
            ),
        },
        {
            "topic": "specular microscopy ECC",
            "question": (
                "A pre-cataract patient has an endothelial cell count (ECC) of 1,200 cells/mm². "
                "What is the clinical significance, and at what ECC threshold would you flag concern for corneal decompensation post-operatively?"
            ),
        },
        {
            "topic": "pachymetry and central corneal thickness",
            "question": (
                "A LASIK candidate has a central corneal thickness (CCT) of 490 µm. "
                "How does this affect IOP measurement reliability, and what is the minimum residual stromal bed required post-ablation?"
            ),
        },
        {
            "topic": "fluorescein angiography",
            "question": (
                "During fluorescein angiography, the patient suddenly reports nausea and urticaria. "
                "List your immediate steps and identify which reaction requires emergency epinephrine administration."
            ),
        },
        {
            "topic": "B-scan ultrasonography",
            "question": (
                "The ophthalmologist requests a B-scan on a patient with a dense cataract and no red reflex. "
                "What two posterior segment conditions are you specifically trying to exclude, and in what scanning position would you best detect a retinal detachment?"
            ),
        },
        {
            "topic": "slit-lamp biomicroscopy technique",
            "question": (
                "You are setting up the slit-lamp for an anterior segment examination. "
                "Describe the correct patient positioning, initial illumination settings, and the first structure to examine systematically."
            ),
        },
        {
            "topic": "gonioscopy principles",
            "question": (
                "Using the Shaffer grading system in gonioscopy, what grade would you assign if the trabecular meshwork is visible "
                "but the scleral spur cannot be identified? What is the clinical implication of this grade?"
            ),
        },
        {
            "topic": "contact lens fitting",
            "question": (
                "A patient is being fitted with a rigid gas-permeable lens. "
                "Describe the fluorescein pattern that indicates ideal central fitting, and what adjustment you would make if the lens shows a flat fit centrally."
            ),
        },
        {
            "topic": "anterior segment OCT",
            "question": (
                "Anterior segment OCT shows an anterior chamber depth of 2.1 mm. "
                "What condition does this raise concern for, and how does this finding influence the decision to dilate the patient?"
            ),
        },
        {
            "topic": "refraction and keratometry",
            "question": (
                "A patient's manifest refraction is −2.50 / −1.00 × 180 and keratometry reads 42.50 D @ 90° / 43.50 D @ 180°. "
                "Is there significant residual refractive astigmatism, and what does this suggest about lenticular astigmatism?"
            ),
        },
        {
            "topic": "retinal imaging and fundus photography",
            "question": (
                "You are capturing fundus photographs for diabetic retinal screening. "
                "List three image quality criteria to check before accepting the image, and state the ETDRS protocol for number and position of fields required."
            ),
        },
        {
            "topic": "ERG principles",
            "question": (
                "A patient is referred for a full-field ERG. "
                "Describe what the a-wave and b-wave represent, and what diagnosis you would consider if the ERG shows a markedly reduced b-wave with a relatively preserved a-wave."
            ),
        },
        {
            "topic": "tear film assessment and TBUT",
            "question": (
                "You perform a tear break-up time (TBUT) on a patient with ocular surface discomfort. "
                "What value is considered abnormally low, and how does the pattern of break-up (central vs peripheral) help distinguish aqueous-deficient from evaporative dry eye?"
            ),
        },
        {
            "topic": "anatomy of the posterior segment",
            "question": (
                "Describe the retinal layers from innermost to outermost, "
                "and identify which layer is affected first in age-related macular degeneration."
            ),
        },
        {
            "topic": "acute angle-closure glaucoma",
            "question": (
                "A patient presents with sudden headache, nausea, haloes around lights, and a rock-hard eye on palpation. "
                "What is the likely diagnosis, and what is the first pharmacological treatment given to rapidly lower IOP?"
            ),
        },
        {
            "topic": "diabetic retinopathy staging",
            "question": (
                "Using the ETDRS classification, distinguish between moderate NPDR and severe NPDR using the 4-2-1 rule. "
                "What single finding marks the transition from severe NPDR to proliferative diabetic retinopathy?"
            ),
        },
        {
            "topic": "age-related macular degeneration",
            "question": (
                "Describe the difference between dry and wet AMD in terms of fundoscopic appearance, speed of progression, "
                "and currently available treatment options."
            ),
        },
        {
            "topic": "cataract grading and management",
            "question": (
                "Using the LOCS III system, what three lens parameters are graded? "
                "At what point does the clinician typically recommend surgery — based on symptoms, objective grade, or both?"
            ),
        },
        {
            "topic": "retinal detachment symptoms",
            "question": (
                "A patient calls to report new floaters, flashes of light, and a dark curtain in their peripheral vision. "
                "Which symptom is most alarming, and what is the appropriate clinical response within the same day?"
            ),
        },
        {
            "topic": "optic nerve assessment",
            "question": (
                "On fundoscopy, the optic disc appears pale with a cup-to-disc ratio of 0.8. "
                "What two conditions does this raise concern for, and which additional investigation would you request to evaluate the visual pathway?"
            ),
        },
        {
            "topic": "strabismus basics",
            "question": (
                "What is the difference between a manifest strabismus (tropia) and a latent strabismus (phoria)? "
                "Describe one clinical test that distinguishes them and the specific finding that confirms each."
            ),
        },
        {
            "topic": "ocular pharmacology",
            "question": (
                "A patient starts long-term chloroquine therapy for rheumatoid arthritis. "
                "What ophthalmic side effect must be monitored, and how frequently should eye screening occur?"
            ),
        },
        {
            "topic": "uveitis classification",
            "question": (
                "Using anatomical location, classify uveitis into four types and describe the hallmark slit-lamp finding for anterior uveitis. "
                "Which systemic condition is most commonly associated with HLA-B27 and recurrent uveitis?"
            ),
        },
    ],
    "PSA": [
        {
            "topic": "non-contact tonometry procedure",
            "question": (
                "You are about to perform NCT on a patient wearing soft contact lenses. "
                "What must you instruct the patient to do before the test, and how many valid readings per eye should you record?"
            ),
        },
        {
            "topic": "LogMAR visual acuity",
            "question": (
                "A patient scores 3 errors on the 0.1 LogMAR line and 1 error on the 0.2 line. "
                "What is their final recorded LogMAR score? Convert this to an approximate Snellen equivalent."
            ),
        },
        {
            "topic": "ETDRS chart",
            "question": (
                "The ETDRS chart is repositioned to 1 metre because the patient cannot read the top letter at 4 metres. "
                "Explain how you adjust the score to give the equivalent LogMAR result at 4 metres."
            ),
        },
        {
            "topic": "near visual acuity testing",
            "question": (
                "A patient presents with difficulty reading fine print. "
                "Describe how you set up near visual acuity testing, specifying the test distance, correction used, and lighting conditions required."
            ),
        },
        {
            "topic": "eye drop instillation technique",
            "question": (
                "A patient requires pilocarpine drops but is anxious about self-instillation. "
                "Describe the correct instillation technique step by step, including how to minimise systemic absorption and prevent cross-contamination between eyes."
            ),
        },
        {
            "topic": "patient fall risk assessment",
            "question": (
                "You are assessing an elderly patient with known bilateral low vision and a walking frame. "
                "Identify three environmental risk factors in the clinic you should modify, and two mobility assessments relevant to fall risk."
            ),
        },
        {
            "topic": "PFAER documentation",
            "question": (
                "A patient scores 3 on the PFAER. What level of fall risk does this represent, "
                "and what three specific interventions must be documented and initiated before the patient is mobilised?"
            ),
        },
        {
            "topic": "wheelchair and mobility assistance",
            "question": (
                "You are assisting a visually impaired patient who prefers to walk rather than use a wheelchair. "
                "Describe the correct sighted-guide technique, and state when you must insist on wheelchair transfer instead."
            ),
        },
        {
            "topic": "queue management and patient flow",
            "question": (
                "The clinic is running 45 minutes behind schedule. A patient who has been waiting 2 hours becomes frustrated and raises their voice. "
                "Describe your communication approach and the two escalation steps if the delay extends further."
            ),
        },
        {
            "topic": "ophthalmic emergency triage",
            "question": (
                "A patient walks in reporting sudden unilateral vision loss in the right eye that started 30 minutes ago. "
                "What is your immediate priority action, and which two diagnoses require ophthalmologist review within 30 minutes?"
            ),
        },
        {
            "topic": "appointment scheduling and referrals",
            "question": (
                "A GP referral for routine cataract assessment has no urgency flagged. "
                "Under what circumstances would you escalate the booking to a priority slot, and what referral information must be confirmed before scheduling?"
            ),
        },
        {
            "topic": "patient identification protocols",
            "question": (
                "Before instilling dilating drops in the left eye, what three patient identification checks must you perform, "
                "and how do you confirm you are treating the correct eye?"
            ),
        },
        {
            "topic": "informed consent for imaging",
            "question": (
                "A patient declines fluorescein angiography after you explain the procedure and its risks. "
                "What must be documented, and who has the authority to override a patient's informed refusal?"
            ),
        },
        {
            "topic": "infection control hand hygiene",
            "question": (
                "State the WHO five moments of hand hygiene as they apply to an ophthalmic clinic setting. "
                "In which moment is alcohol hand rub insufficient and soap-and-water washing is required instead?"
            ),
        },
        {
            "topic": "handling anxious or visually impaired patients",
            "question": (
                "A patient who is functionally blind in both eyes arrives unaccompanied for their appointment. "
                "Describe the communication adjustments and physical assistance you must provide from reception to the consultation chair."
            ),
        },
        {
            "topic": "billing codes for ophthalmic procedures",
            "question": (
                "A patient has undergone NCT, LogMAR testing, and OCT in the same visit. "
                "What documentation is required to support accurate billing, and what is a PSA's responsibility if they identify a potential coding error?"
            ),
        },
        {
            "topic": "pre-visit instructions",
            "question": (
                "A patient booked for a Humphrey visual field test calls to ask whether to take their glaucoma drops before coming. "
                "What is the correct advice, and what other pre-visit instructions are standard for this test?"
            ),
        },
        {
            "topic": "post-dilation patient safety",
            "question": (
                "A patient has received 1% tropicamide and 2.5% phenylephrine for dilation. "
                "When is it generally safe for the patient to drive, and what two written instructions must be given before they leave?"
            ),
        },
        {
            "topic": "spectacle dispensing basics",
            "question": (
                "A patient's prescription reads +2.00 / −0.75 × 90 for the right eye. "
                "In lay terms, describe what this correction means and one daily activity where they will most notice the improvement."
            ),
        },
        {
            "topic": "low vision aids overview",
            "question": (
                "A patient with best corrected VA of 6/60 due to AMD is referred for low vision assessment. "
                "Name two optical aids and two non-optical aids that might improve daily functioning, and what determines which is most appropriate."
            ),
        },
        {
            "topic": "anatomy of the anterior segment",
            "question": (
                "Name the five main structures of the anterior segment in order from most anterior to most posterior, "
                "and state the primary function of the corneal endothelium."
            ),
        },
        {
            "topic": "common causes of red eye",
            "question": (
                "A patient presents with unilateral red eye, photophobia, and reduced vision. "
                "Rank these four conditions in order of clinical urgency: conjunctivitis, corneal ulcer, acute anterior uveitis, acute angle-closure glaucoma."
            ),
        },
        {
            "topic": "acute angle-closure glaucoma",
            "question": (
                "A patient presents with sudden headache, nausea, haloes around lights, and a rock-hard eye on palpation. "
                "What is the likely diagnosis, and what is the first pharmacological treatment given to rapidly lower IOP?"
            ),
        },
        {
            "topic": "age-related macular degeneration",
            "question": (
                "Describe the difference between dry and wet AMD in terms of fundoscopic appearance, speed of progression, "
                "and currently available treatment options."
            ),
        },
        {
            "topic": "corneal abrasion management",
            "question": (
                "A contact lens wearer presents with a painful, photophobic red eye and a 3×3 mm fluorescein-positive epithelial defect centrally. "
                "List three management steps and one specific follow-up instruction."
            ),
        },
        {
            "topic": "refractive errors overview",
            "question": (
                "Differentiate myopia, hyperopia, and astigmatism by where the focal point falls relative to the retina. "
                "For each, state the type of corrective lens used."
            ),
        },
        {
            "topic": "ocular pharmacology",
            "question": (
                "A patient starts long-term chloroquine therapy for rheumatoid arthritis. "
                "What ophthalmic side effect must be monitored, and how frequently should eye screening occur?"
            ),
        },
        {
            "topic": "fluorescein staining",
            "question": (
                "During slit-lamp examination with fluorescein, a triangular staining area is seen nasally near the limbus. "
                "What is the likely diagnosis, and what does cobalt blue filter illumination reveal about corneal epithelial integrity?"
            ),
        },
        {
            "topic": "emergency ocular trauma",
            "question": (
                "A patient presents with a penetrating eye injury from a wire. "
                "List three things you must NOT do at initial assessment, and describe the appropriate first-aid and referral pathway."
            ),
        },
        {
            "topic": "uveitis classification",
            "question": (
                "Using anatomical location, classify uveitis into four types and describe the hallmark slit-lamp finding for anterior uveitis. "
                "Which systemic condition is most commonly associated with HLA-B27 and recurrent uveitis?"
            ),
        },
    ],
}
