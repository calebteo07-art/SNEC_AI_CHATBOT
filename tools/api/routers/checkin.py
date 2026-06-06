"""Check-in endpoints."""
import json
import secrets
from datetime import date as _date

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from tools.api.shared import limiter
from tools.profile.get_profile import get_profile
from tools.profile.update_profile import update_profile
from tools.shared.gemini_client import ask, MOCK_MODE, MODEL_PRO
from tools.shared.jwt_utils import get_current_user, CurrentUser

router = APIRouter()

# Per-student daily question cache: student_id -> (date_iso, CheckinQuestionResponse)
_question_cache: dict[str, tuple[str, "CheckinQuestionResponse"]] = {}


# ── Check-in models ────────────────────────────────────────────────────────

class CheckinStatusResponse(BaseModel):
    checkin_done_today: bool
    streak: int
    weak_topic: str | None

class CheckinQuestionResponse(BaseModel):
    question: str
    topic: str

class CheckinAnswerRequest(BaseModel):
    question: str
    answer: str
    topic: str

class CheckinAnswerResponse(BaseModel):
    correct: bool
    feedback: str


# ── Topic pools and question styles ───────────────────────────────────────

_CHECKIN_TOPIC_POOL: dict[str, list[str]] = {
    "OA": [
        "IOP measurement technique", "Goldmann tonometry", "non-contact tonometry",
        "pupil dilation procedure", "dilating drops and contraindications",
        "visual acuity testing", "Snellen chart technique", "pinhole test",
        "patient history taking", "chief complaint documentation",
        "pre-operative checklist", "post-operative instructions",
        "anterior chamber assessment", "confrontation visual field test",
        "colour vision testing", "Amsler grid", "cover-uncover test",
        "documentation and EMR entry", "infection control in ophthalmology",
        "patient consent and counselling",
    ],
    "OT": [
        "A-scan biometry", "IOL power calculation", "AL measurement",
        "Humphrey Visual Field interpretation", "glaucoma HVF patterns",
        "OCT retinal nerve fibre layer", "OCT macular scan interpretation",
        "corneal topography and Ks", "specular microscopy ECC",
        "pachymetry and central corneal thickness", "fluorescein angiography",
        "B-scan ultrasonography", "slit-lamp biomicroscopy technique",
        "gonioscopy principles", "contact lens fitting",
        "anterior segment OCT", "refraction and keratometry",
        "retinal imaging and fundus photography", "ERG principles",
        "tear film assessment and TBUT",
    ],
    "PSA": [
        "non-contact tonometry procedure", "LogMAR visual acuity",
        "ETDRS chart", "near visual acuity testing",
        "eye drop instillation technique", "patient fall risk assessment",
        "PFAER documentation", "wheelchair and mobility assistance",
        "queue management and patient flow", "ophthalmic emergency triage",
        "appointment scheduling and referrals", "patient identification protocols",
        "informed consent for imaging", "infection control hand hygiene",
        "handling anxious or visually impaired patients",
        "billing codes for ophthalmic procedures", "pre-visit instructions",
        "post-dilation patient safety", "spectacle dispensing basics",
        "low vision aids overview",
    ],
    "": [
        "anatomy of the anterior segment", "anatomy of the posterior segment",
        "common causes of red eye", "acute angle-closure glaucoma",
        "diabetic retinopathy staging", "age-related macular degeneration",
        "cataract grading and management", "corneal abrasion management",
        "retinal detachment symptoms", "optic nerve assessment",
        "refractive errors overview", "strabismus basics",
        "ocular pharmacology", "fluorescein staining",
        "emergency ocular trauma", "uveitis classification",
    ],
}

_CHECKIN_QUESTION_STYLES = [
    "Ask a concise scenario-based clinical question (2–3 sentences, real patient context).",
    "Ask a direct knowledge question testing recall of a specific concept, value, or procedure step.",
    "Ask a 'what would you do if…' practical decision question.",
    "Ask a question distinguishing normal from abnormal findings.",
    "Ask a question connecting the topic to a patient safety or quality-care consideration.",
    "Ask a step-by-step procedural question ('Describe how you would…').",
]

_ROLE_TUTOR_CONTEXT = {
    "OA": (
        "STUDENT ROLE: Ophthalmic Assistant (OA). "
        "Focus teaching on: patient history taking, IOP measurement, pupil dilation, "
        "pre-operative and post-operative care, patient education and counselling."
    ),
    "OT": (
        "STUDENT ROLE: Ophthalmic Technician (OT). "
        "Focus teaching on: A-scan biometry, Humphrey Visual Field testing, OCT imaging, "
        "corneal topography, endothelial cell count, equipment calibration and quality checks."
    ),
    "PSA": (
        "STUDENT ROLE: Patient Service Associate (PSA). "
        "Focus teaching on: history taking, LogMAR visual acuity testing, non-contact tonometry (NCT), "
        "eye drop instillation, pupil dilation, PFAER and fall risk assessment."
    ),
}


_FALLBACK_QUESTIONS: dict[str, str] = {
    # ── OA topics ──────────────────────────────────────────────────────────
    "IOP measurement technique": (
        "A patient is being prepared for routine glaucoma monitoring. What is the normal IOP range in mmHg, "
        "and what are three key steps you must complete before measuring IOP to ensure an accurate reading?"
    ),
    "Goldmann tonometry": (
        "During Goldmann applanation tonometry, you notice the fluorescein mires are not aligned correctly. "
        "Describe how to achieve proper mire alignment and state the endpoint you are looking for."
    ),
    "non-contact tonometry": (
        "You are performing NCT and keep getting inconsistent readings across three attempts. "
        "What are two common causes of unreliable NCT results, and when would you refer the patient for Goldmann tonometry instead?"
    ),
    "pupil dilation procedure": (
        "Before instilling dilating drops, what three contraindications must you check for, "
        "and what do you tell the patient to expect in terms of vision changes and duration of effect?"
    ),
    "dilating drops and contraindications": (
        "A patient mentions they have a narrow drainage angle. Which class of dilating drops is absolutely contraindicated, "
        "and why? Name one alternative procedure you could perform without dilating."
    ),
    "visual acuity testing": (
        "You are testing distance VA on an elderly patient who struggles to read the chart. "
        "Describe the correction-in-use protocol and at what point you would switch to a pinhole occluder."
    ),
    "Snellen chart technique": (
        "A patient achieves 6/9 vision with their glasses. Explain what this fraction means, "
        "at what distance the chart should be placed, and how you would document this finding in the EMR."
    ),
    "pinhole test": (
        "A patient's unaided VA is 6/18 but improves to 6/6 with pinhole. "
        "What does this tell you about the likely cause of their reduced vision, and what is the clinical significance?"
    ),
    "patient history taking": (
        "A patient presents with sudden onset floaters in the right eye. "
        "List five key questions you must ask in the history, and which symptom — if also present — would prompt immediate escalation."
    ),
    "chief complaint documentation": (
        "You are documenting a patient's presenting complaint of sudden blurred vision in the right eye. "
        "What six key elements must be captured in the history of presenting complaint for the ophthalmologist's review?"
    ),
    "pre-operative checklist": (
        "A patient is scheduled for cataract surgery on the right eye. "
        "List four items on the pre-operative checklist that you, as an OA, are responsible for confirming on the day of surgery."
    ),
    "post-operative instructions": (
        "After uncomplicated cataract surgery, what are the three most important post-operative instructions "
        "you must give the patient regarding activity restrictions and warning signs requiring urgent review?"
    ),
    "anterior chamber assessment": (
        "Using the pen-torch test, how do you assess anterior chamber depth as shallow or deep? "
        "What finding would make you reluctant to dilate this patient?"
    ),
    "confrontation visual field test": (
        "Describe how you perform a confrontation visual field test. "
        "If you detect a temporal field defect in the left eye only, what does this localise in the visual pathway?"
    ),
    "colour vision testing": (
        "You are administering the Ishihara test to a patient referred for possible optic neuritis. "
        "How many plates do you show, and what pattern of failure would be consistent with an acquired dyschromatopsia?"
    ),
    "Amsler grid": (
        "A patient with known AMD is asked to use the Amsler grid at home. "
        "Describe the correct viewing conditions and the two abnormal findings the patient should immediately report to the clinic."
    ),
    "cover-uncover test": (
        "Describe how you perform the cover-uncover test and the alternate cover test. "
        "What specific eye movement on uncovering indicates a tropia versus a phoria?"
    ),
    "documentation and EMR entry": (
        "You notice a previous IOP entry in the EMR appears to have been entered for the wrong eye. "
        "What is the correct process for amending a clinical record, and what must never be done?"
    ),
    "infection control in ophthalmology": (
        "Between slit-lamp examinations on different patients, what are the standard infection control steps "
        "you must complete for the chin rest, forehead rest, and any contact instruments?"
    ),
    "patient consent and counselling": (
        "A patient refuses pupil dilation because they are worried about driving home. "
        "How do you counsel them about the risks and alternatives, and what must be documented if they decline?"
    ),
    # ── OT topics ──────────────────────────────────────────────────────────
    "A-scan biometry": (
        "You are performing A-scan biometry on a pseudophakic eye for IOL power calculation. "
        "What mode should the ultrasound be set to, and why does the sound velocity setting matter for accuracy?"
    ),
    "IOL power calculation": (
        "A patient has an axial length of 22.5 mm and corneal power (K) of 44.0 / 44.5 D. "
        "Would you expect a higher or lower IOL power compared to a 24 mm eye, and why?"
    ),
    "AL measurement": (
        "You obtain three axial length readings of 23.42, 23.44, and 23.80 mm. "
        "Which reading is an outlier, and what is the maximum acceptable standard deviation before you must re-measure?"
    ),
    "Humphrey Visual Field interpretation": (
        "On a Humphrey 24-2 report, you see fixation losses of 4/18, false positives of 28%, and false negatives of 12%. "
        "Which reliability index most significantly invalidates the test, and why?"
    ),
    "glaucoma HVF patterns": (
        "Describe the typical Humphrey visual field pattern associated with an early superior arcuate scotoma in glaucoma. "
        "Which area of the optic nerve fibre layer does this correspond to?"
    ),
    "OCT retinal nerve fibre layer": (
        "An OCT RNFL report shows a red sector at 7 o'clock in the left eye on the deviation map. "
        "What quadrant of the RNFL does this represent, and how does this correlate to glaucoma staging?"
    ),
    "OCT macular scan interpretation": (
        "An OCT macular scan shows a hyporeflective space between the neurosensory retina and the RPE. "
        "What condition does this suggest, and which measurement is used to monitor treatment response?"
    ),
    "corneal topography and Ks": (
        "A patient's Pentacam shows SimK values of 42.5 D @ 90° and 48.2 D @ 180°. "
        "Calculate the astigmatism magnitude and state whether this is with-the-rule or against-the-rule astigmatism."
    ),
    "specular microscopy ECC": (
        "A pre-cataract patient has an endothelial cell count (ECC) of 1,200 cells/mm². "
        "What is the clinical significance, and at what ECC threshold would you flag concern for corneal decompensation post-operatively?"
    ),
    "pachymetry and central corneal thickness": (
        "A LASIK candidate has a central corneal thickness (CCT) of 490 µm. "
        "How does this affect IOP measurement reliability, and what is the minimum residual stromal bed required post-ablation?"
    ),
    "fluorescein angiography": (
        "During fluorescein angiography, the patient suddenly reports nausea and urticaria. "
        "List your immediate steps and identify which reaction requires emergency epinephrine administration."
    ),
    "B-scan ultrasonography": (
        "The ophthalmologist requests a B-scan on a patient with a dense cataract and no red reflex. "
        "What two posterior segment conditions are you specifically trying to exclude, and in what scanning position would you best detect a retinal detachment?"
    ),
    "slit-lamp biomicroscopy technique": (
        "You are setting up the slit-lamp for an anterior segment examination. "
        "Describe the correct patient positioning, initial illumination settings, and the first structure to examine systematically."
    ),
    "gonioscopy principles": (
        "Using the Shaffer grading system in gonioscopy, what grade would you assign if the trabecular meshwork is visible "
        "but the scleral spur cannot be identified? What is the clinical implication of this grade?"
    ),
    "contact lens fitting": (
        "A patient is being fitted with a rigid gas-permeable lens. "
        "Describe the fluorescein pattern that indicates ideal central fitting, and what adjustment you would make if the lens shows a flat fit centrally."
    ),
    "anterior segment OCT": (
        "Anterior segment OCT shows an anterior chamber depth of 2.1 mm. "
        "What condition does this raise concern for, and how does this finding influence the decision to dilate the patient?"
    ),
    "refraction and keratometry": (
        "A patient's manifest refraction is −2.50 / −1.00 × 180 and keratometry reads 42.50 D @ 90° / 43.50 D @ 180°. "
        "Is there significant residual refractive astigmatism, and what does this suggest about lenticular astigmatism?"
    ),
    "retinal imaging and fundus photography": (
        "You are capturing fundus photographs for diabetic retinal screening. "
        "List three image quality criteria to check before accepting the image, and state the ETDRS protocol for number and position of fields required."
    ),
    "ERG principles": (
        "A patient is referred for a full-field ERG. "
        "Describe what the a-wave and b-wave represent, and what diagnosis you would consider if the ERG shows a markedly reduced b-wave with a relatively preserved a-wave."
    ),
    "tear film assessment and TBUT": (
        "You perform a tear break-up time (TBUT) on a patient with ocular surface discomfort. "
        "What value is considered abnormally low, and how does the pattern of break-up (central vs peripheral) help distinguish aqueous-deficient from evaporative dry eye?"
    ),
    # ── PSA topics ─────────────────────────────────────────────────────────
    "non-contact tonometry procedure": (
        "You are about to perform NCT on a patient wearing soft contact lenses. "
        "What must you instruct the patient to do before the test, and how many valid readings per eye should you record?"
    ),
    "LogMAR visual acuity": (
        "A patient scores 3 errors on the 0.1 LogMAR line and 1 error on the 0.2 line. "
        "What is their final recorded LogMAR score? Convert this to an approximate Snellen equivalent."
    ),
    "ETDRS chart": (
        "The ETDRS chart is repositioned to 1 metre because the patient cannot read the top letter at 4 metres. "
        "Explain how you adjust the score to give the equivalent LogMAR result at 4 metres."
    ),
    "near visual acuity testing": (
        "A patient presents with difficulty reading fine print. "
        "Describe how you set up near visual acuity testing, specifying the test distance, correction used, and lighting conditions required."
    ),
    "eye drop instillation technique": (
        "A patient requires pilocarpine drops but is anxious about self-instillation. "
        "Describe the correct instillation technique step by step, including how to minimise systemic absorption and prevent cross-contamination between eyes."
    ),
    "patient fall risk assessment": (
        "You are assessing an elderly patient with known bilateral low vision and a walking frame. "
        "Identify three environmental risk factors in the clinic you should modify, and two mobility assessments relevant to fall risk."
    ),
    "PFAER documentation": (
        "A patient scores 3 on the PFAER. What level of fall risk does this represent, "
        "and what three specific interventions must be documented and initiated before the patient is mobilised?"
    ),
    "wheelchair and mobility assistance": (
        "You are assisting a visually impaired patient who prefers to walk rather than use a wheelchair. "
        "Describe the correct sighted-guide technique, and state when you must insist on wheelchair transfer instead."
    ),
    "queue management and patient flow": (
        "The clinic is running 45 minutes behind schedule. A patient who has been waiting 2 hours becomes frustrated and raises their voice. "
        "Describe your communication approach and the two escalation steps if the delay extends further."
    ),
    "ophthalmic emergency triage": (
        "A patient walks in reporting sudden unilateral vision loss in the right eye that started 30 minutes ago. "
        "What is your immediate priority action, and which two diagnoses require ophthalmologist review within 30 minutes?"
    ),
    "appointment scheduling and referrals": (
        "A GP referral for routine cataract assessment has no urgency flagged. "
        "Under what circumstances would you escalate the booking to a priority slot, and what referral information must be confirmed before scheduling?"
    ),
    "patient identification protocols": (
        "Before instilling dilating drops in the left eye, what three patient identification checks must you perform, "
        "and how do you confirm you are treating the correct eye?"
    ),
    "informed consent for imaging": (
        "A patient declines fluorescein angiography after you explain the procedure and its risks. "
        "What must be documented, and who has the authority to override a patient's informed refusal?"
    ),
    "infection control hand hygiene": (
        "State the WHO five moments of hand hygiene as they apply to an ophthalmic clinic setting. "
        "In which moment is alcohol hand rub insufficient and soap-and-water washing is required instead?"
    ),
    "handling anxious or visually impaired patients": (
        "A patient who is functionally blind in both eyes arrives unaccompanied for their appointment. "
        "Describe the communication adjustments and physical assistance you must provide from reception to the consultation chair."
    ),
    "billing codes for ophthalmic procedures": (
        "A patient has undergone NCT, LogMAR testing, and OCT in the same visit. "
        "What documentation is required to support accurate billing, and what is a PSA's responsibility if they identify a potential coding error?"
    ),
    "pre-visit instructions": (
        "A patient booked for a Humphrey visual field test calls to ask whether to take their glaucoma drops before coming. "
        "What is the correct advice, and what other pre-visit instructions are standard for this test?"
    ),
    "post-dilation patient safety": (
        "A patient has received 1% tropicamide and 2.5% phenylephrine for dilation. "
        "When is it generally safe for the patient to drive, and what two written instructions must be given before they leave?"
    ),
    "spectacle dispensing basics": (
        "A patient's prescription reads +2.00 / −0.75 × 90 for the right eye. "
        "In lay terms, describe what this correction means and one daily activity where they will most notice the improvement."
    ),
    "low vision aids overview": (
        "A patient with best corrected VA of 6/60 due to AMD is referred for low vision assessment. "
        "Name two optical aids and two non-optical aids that might improve daily functioning, and what determines which is most appropriate."
    ),
    # ── Default / General topics ────────────────────────────────────────────
    "anatomy of the anterior segment": (
        "Name the five main structures of the anterior segment in order from most anterior to most posterior, "
        "and state the primary function of the corneal endothelium."
    ),
    "anatomy of the posterior segment": (
        "Describe the retinal layers from innermost to outermost, "
        "and identify which layer is affected first in age-related macular degeneration."
    ),
    "common causes of red eye": (
        "A patient presents with unilateral red eye, photophobia, and reduced vision. "
        "Rank these four conditions in order of clinical urgency: conjunctivitis, corneal ulcer, acute anterior uveitis, acute angle-closure glaucoma."
    ),
    "acute angle-closure glaucoma": (
        "A patient presents with sudden headache, nausea, haloes around lights, and a rock-hard eye on palpation. "
        "What is the likely diagnosis, and what is the first pharmacological treatment given to rapidly lower IOP?"
    ),
    "diabetic retinopathy staging": (
        "Using the ETDRS classification, distinguish between moderate NPDR and severe NPDR using the 4-2-1 rule. "
        "What single finding marks the transition from severe NPDR to proliferative diabetic retinopathy?"
    ),
    "age-related macular degeneration": (
        "Describe the difference between dry and wet AMD in terms of fundoscopic appearance, speed of progression, "
        "and currently available treatment options."
    ),
    "cataract grading and management": (
        "Using the LOCS III system, what three lens parameters are graded? "
        "At what point does the clinician typically recommend surgery — based on symptoms, objective grade, or both?"
    ),
    "corneal abrasion management": (
        "A contact lens wearer presents with a painful, photophobic red eye and a 3×3 mm fluorescein-positive epithelial defect centrally. "
        "List three management steps and one specific follow-up instruction."
    ),
    "retinal detachment symptoms": (
        "A patient calls to report new floaters, flashes of light, and a dark curtain in their peripheral vision. "
        "Which symptom is most alarming, and what is the appropriate clinical response within the same day?"
    ),
    "optic nerve assessment": (
        "On fundoscopy, the optic disc appears pale with a cup-to-disc ratio of 0.8. "
        "What two conditions does this raise concern for, and which additional investigation would you request to evaluate the visual pathway?"
    ),
    "refractive errors overview": (
        "Differentiate myopia, hyperopia, and astigmatism by where the focal point falls relative to the retina. "
        "For each, state the type of corrective lens used."
    ),
    "strabismus basics": (
        "What is the difference between a manifest strabismus (tropia) and a latent strabismus (phoria)? "
        "Describe one clinical test that distinguishes them and the specific finding that confirms each."
    ),
    "ocular pharmacology": (
        "A patient starts long-term chloroquine therapy for rheumatoid arthritis. "
        "What ophthalmic side effect must be monitored, and how frequently should eye screening occur?"
    ),
    "fluorescein staining": (
        "During slit-lamp examination with fluorescein, a triangular staining area is seen nasally near the limbus. "
        "What is the likely diagnosis, and what does cobalt blue filter illumination reveal about corneal epithelial integrity?"
    ),
    "emergency ocular trauma": (
        "A patient presents with a penetrating eye injury from a wire. "
        "List three things you must NOT do at initial assessment, and describe the appropriate first-aid and referral pathway."
    ),
    "uveitis classification": (
        "Using anatomical location, classify uveitis into four types and describe the hallmark slit-lamp finding for anterior uveitis. "
        "Which systemic condition is most commonly associated with HLA-B27 and recurrent uveitis?"
    ),
}


def _static_fallback(topic: str) -> str:
    if topic in _FALLBACK_QUESTIONS:
        return _FALLBACK_QUESTIONS[topic]
    return (
        f"Describe the key steps, clinical considerations, and common pitfalls involved in {topic}. "
        "Include any relevant normal values, safety checks, or patient communication points a competent allied health professional should know."
    )


# ── Check-in endpoints ─────────────────────────────────────────────────────

@router.get("/api/checkin/status", response_model=CheckinStatusResponse)
async def checkin_status(current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]
    try:
        profile = await get_profile(student_id)
    except Exception:
        return CheckinStatusResponse(checkin_done_today=False, streak=0, weak_topic=None)

    done = bool(profile.get("checkin_done_today", False))
    streak = int(profile.get("streak") or 0)
    try:
        weak = profile.get("weak_topics", []) or []
        weak_topic = weak[0] if weak else None
    except Exception:
        weak_topic = None

    return CheckinStatusResponse(
        checkin_done_today=done,
        streak=streak,
        weak_topic=weak_topic,
    )


@router.get("/api/checkin/question", response_model=CheckinQuestionResponse)
@limiter.limit("10/minute")
async def checkin_question(request: Request, current_user: CurrentUser = Depends(get_current_user)):
    from tools.api.shared import _student_context_block
    student_id = current_user["sub"]

    # Return cached question if already generated today (saves API calls, keeps question stable)
    today = _date.today().isoformat()
    cached = _question_cache.get(student_id)
    if cached and cached[0] == today:
        return cached[1]

    try:
        profile = await get_profile(student_id)
        weak = profile.get("weak_topics", []) or []
        role = profile.get("role", "")
    except Exception:
        weak = []
        role = ""

    role_pool = _CHECKIN_TOPIC_POOL.get(role.upper(), _CHECKIN_TOPIC_POOL[""])
    # Weight weak topics 3× vs the general pool so gaps are targeted but not exclusively
    weighted = list(weak) * 3 + role_pool
    topic = secrets.choice(weighted) if weighted else "Ophthalmology"
    question_style = secrets.choice(_CHECKIN_QUESTION_STYLES)

    role_line = _ROLE_TUTOR_CONTEXT.get(role.upper(), "")
    try:
        ctx_block = await _student_context_block(student_id)
    except Exception:
        ctx_block = ""
    system = (
        (ctx_block + "\n\n" if ctx_block else "")
        + "You are an ophthalmology tutor running a 60-second warm-up check-in. "
        + question_style + " "
        + (f"Student role context: {role_line} " if role_line else "")
        + "Calibrate difficulty to the student's experience level and known gaps. "
        "Return only the question text — no preamble, no numbering, no label."
    )
    try:
        question = ask(
            system_prompt=system,
            messages=[{"role": "user", "content": f"Topic: {topic}"}],
            max_tokens=512,
            feature="checkin",
        )
        question_text = question.strip()
    except Exception:
        question_text = _static_fallback(topic)
    result = CheckinQuestionResponse(question=question_text, topic=topic)
    _question_cache[student_id] = (today, result)
    return result


@router.post("/api/checkin/answer", response_model=CheckinAnswerResponse)
@limiter.limit("10/minute")
async def checkin_answer(request: Request, body: CheckinAnswerRequest, current_user: CurrentUser = Depends(get_current_user)):
    from tools.api.shared import _student_context_block
    student_id = current_user["sub"]
    ctx_block = await _student_context_block(student_id)
    system = (
        (ctx_block + "\n\n" if ctx_block else "")
        + "You are a rigorous ophthalmology clinical educator evaluating a daily warm-up answer. "
        "Be honest and critical — if the answer is incomplete, vague, or missing key details, say so. "
        "Do not inflate scores or praise weak answers. "
        "Frame your feedback using the student's role and target the specific gaps listed above.\n\n"
        "Return ONLY valid JSON with no other text:\n"
        "{\n"
        '  "correct": true or false,\n'
        '  "feedback": "2–4 sentences: (1) directly assess what the student got right or wrong, '
        "being specific about gaps or misconceptions; (2) provide the accurate, complete clinical answer "
        "with precise values, protocols, or mechanisms a competent allied health professional should know; "
        '(3) explain why this matters in practice at SNEC — patient safety, workflow, or clinical outcome."\n'
        "}"
    )
    try:
        raw = ask(
            system_prompt=system,
            messages=[{
                "role": "user",
                "content": (
                    f"Question: {body.question}\n"
                    f"Student answer: {body.answer}"
                ),
            }],
            max_tokens=1024,
            feature="checkin",
            model=MODEL_PRO,
        )
    except RuntimeError as exc:
        if "quota_exceeded" in str(exc):
            raise HTTPException(status_code=503, detail="quota_exceeded")
        raise

    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    try:
        parsed = json.loads(text)
        correct = bool(parsed.get("correct", False))
        feedback = str(parsed.get("feedback", raw.strip()))
    except Exception:
        correct = "true" in raw.lower().split("correct:")[-1][:10]
        feedback_parts = raw.split("FEEDBACK:")
        feedback = feedback_parts[-1].strip() if len(feedback_parts) > 1 else raw.strip()

    try:
        await update_profile(student_id, checkin_done=True)
    except Exception:
        pass

    return CheckinAnswerResponse(correct=correct, feedback=feedback)
