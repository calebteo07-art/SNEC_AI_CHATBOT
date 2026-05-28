"""Check-in endpoints."""
import json
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from tools.api.shared import limiter
from tools.profile.get_profile import get_profile
from tools.profile.update_profile import update_profile
from tools.shared.gemini_client import ask, MOCK_MODE
from tools.shared.gsheets import get_rows, append_row, update_row
from tools.shared.jwt_utils import get_current_user, CurrentUser

router = APIRouter()


# ── Check-in models ────────────────────────────────────────────────────────

class CheckinStatusResponse(BaseModel):
    checkin_done_today: bool
    streak: int
    weak_topic: str | None

class CheckinQuestionResponse(BaseModel):
    question: str
    topic: str

class CheckinAnswerRequest(BaseModel):
    student_id: str
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
        "STUDENT ROLE: Ophthalmic Auxiliary (OA). "
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


# ── Check-in endpoints ─────────────────────────────────────────────────────

@router.get("/api/checkin/status", response_model=CheckinStatusResponse)
def checkin_status(current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]
    try:
        profile = get_profile(student_id)
    except Exception:
        return CheckinStatusResponse(checkin_done_today=True, streak=0, weak_topic=None)

    done = str(profile.get("checkin_done_today", "false")).lower() == "true"
    streak = int(profile.get("streak", "0") or "0")
    try:
        import json as _json
        weak = _json.loads(profile.get("weak_topics", "[]") or "[]")
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
def checkin_question(request: Request, current_user: CurrentUser = Depends(get_current_user)):
    from tools.api.shared import _student_context_block
    student_id = current_user["sub"]
    import json as _json
    try:
        profile = get_profile(student_id)
        weak = _json.loads(profile.get("weak_topics", "[]") or "[]")
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
    ctx_block = _student_context_block(student_id)
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
            max_tokens=200,
            feature="checkin",
        )
    except RuntimeError as exc:
        if "quota_exceeded" in str(exc):
            raise HTTPException(status_code=503, detail="quota_exceeded")
        raise
    return CheckinQuestionResponse(question=question.strip(), topic=topic)


@router.post("/api/checkin/answer", response_model=CheckinAnswerResponse)
@limiter.limit("10/minute")
def checkin_answer(request: Request, body: CheckinAnswerRequest, current_user: CurrentUser = Depends(get_current_user)):
    from tools.api.shared import _student_context_block
    student_id = current_user["sub"]
    ctx_block = _student_context_block(student_id)
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
            max_tokens=2048,
            feature="checkin",
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
        update_profile(student_id, checkin_done=True)
    except Exception:
        pass

    return CheckinAnswerResponse(correct=correct, feedback=feedback)
