"""Input safety filter for the EyeBot clinical AI.

Two-stage pipeline:
  Stage 1 — regex (< 1ms): hard-block PII extraction, prompt injection, off-topic generation.
  Stage 2 — keyword (< 1ms): fast-pass for clearly ophtho-relevant queries.
  Stage 3 — LLM classification (only for ambiguous queries > 8 words with no ophtho signal).

Returns {"safe": bool, "reason": str}.
Designed to be called before any LLM invocation.
"""
import asyncio
import re

# Prompt injection, impersonation, and clearly off-topic generation. Always blocked,
# in every context — tutor and virtual-patient case chat alike.
_ABUSE_PATTERNS = [
    r"ignore\s+(previous|above|all|prior)\s+instructions",      # prompt injection
    r"(you are now|pretend to be|act as)\s+(a\s+)?(different|another|evil)",
    r"(write|generate|create|compose)\s+a\s+(poem|story|song|rap|code|script|email\s+to)",
    r"\b(weather|sports|recipe|stock\s*price|cryptocurrency|betting|gambling|lottery)\b",
    r"\b(hack|jailbreak|bypass|exploit|vulnerabilit(y|ies))\b",
]
_ABUSE_RE = re.compile("|".join(_ABUSE_PATTERNS), re.IGNORECASE)

# Identity / PII extraction. Blocked for the general tutor (no reason to ask the tutor
# to extract someone's NRIC), but ALLOWED inside a virtual-patient case chat: confirming
# patient particulars (name, NRIC, DOB, address) is a required, graded part of the OSCE
# encounter, and the patient prompt is built to answer it from the case record.
_PII_PATTERNS = [
    r"\b(NRIC|IC\s*number|passport\s*number|birth\s*cert)\b",
]
_PII_RE = re.compile("|".join(_PII_PATTERNS), re.IGNORECASE)

_OPHTHO_KEYWORDS = {
    "eye", "vision", "visual", "retina", "retinal", "glaucoma", "cataract", "cornea",
    "corneal", "iop", "intraocular", "fundus", "lens", "optic", "tonometry", "tonometer",
    "oct", "visual field", "slit lamp", "dilation", "dilate", "mydriasis", "snellen",
    "logmar", "drop", "drops", "patient", "examination", "examine", "diagnosis",
    "diagnose", "treatment", "treat", "surgery", "procedure", "anatomy", "checklist",
    "technique", "biometry", "humphrey", "topography", "endothelial", "fluorescein",
    "ophthalm", "oph", "oa", "ot", "psa", "pfaer", "nct", "icp", "aqueous",
    "vitreous", "macula", "macular", "drusen", "choroid", "iris", "pupil", "sclera",
    "conjunctiva", "lacrimal", "duction", "vergence", "strabismus", "amblyopia",
    "keratoconus", "pterygium", "pinguecula", "uveitis", "scleritis", "episcleritis",
    "blepharitis", "chalazion", "hordeolum", "entropion", "ectropion", "ptosis",
    "proptosis", "nystagmus", "diplopia", "anisocoria", "mydriatic", "miotic",
    "cycloplegic", "prostaglandin", "beta-blocker", "carbonic anhydrase", "latanoprost",
    "timolol", "brimonidine", "pilocarpine", "acetazolamide", "a-scan", "b-scan",
    "gonioscopy", "perimetry", "electroretinogram", "erg", "vep", "sfe", "cup-disc",
    "c/d ratio", "amd", "diabetic retinopathy", "central serous", "brvo", "crvo",
    "rvo", "cnv", "epiretinal", "vitrectomy", "phacoemulsification", "trabeculectomy",
}


async def filter_input(query: str, student_role: str = "", patient_context: bool = False,
                       images_attached: bool = False) -> dict:
    """Return {"safe": bool, "reason": str}.

    Fast path for the common case — only invokes Gemini for long ambiguous queries.

    patient_context=True relaxes the filter for virtual-patient case chat: identity
    questions (name, NRIC, DOB, address) reach the patient model, and the
    ophthalmology-relevance gate is skipped — talking to a patient about their
    particulars, symptoms, and history is inherently on-topic, and the patient prompt
    governs what gets revealed. Prompt injection and off-topic abuse are still blocked.

    images_attached=True skips the same relevance gate for a tutor message carrying an
    image. The gate below judges the TEXT, and the text is exactly the part that is not
    about eyes when the picture is doing the asking ("what am I looking at here?").
    Stage 3 would hand that to a classifier that cannot see the attachment and sample a
    yes/no, so an innocent student would be told to "ask a clinical question" for sending
    a fundus photo. Abuse and PII still block — only relevance is waived.
    """
    # Stage 1: regex hard-block — prompt injection / impersonation / off-topic generation
    if _ABUSE_RE.search(query):
        return {"safe": False, "reason": "blocked_pattern"}

    # Virtual-patient case chat: identity questions are part of the encounter — allow
    # everything that cleared the abuse check above.
    if patient_context:
        return {"safe": True, "reason": "patient_context"}

    # General tutor: also hard-block PII extraction.
    if _PII_RE.search(query):
        return {"safe": False, "reason": "blocked_pattern"}

    # A picture is the subject of the question; the relevance gate can only read the text.
    if images_attached:
        return {"safe": True, "reason": "images_attached"}

    lower = query.lower()

    # Stage 2: keyword whitelist (vast majority of queries clear here)
    if any(kw in lower for kw in _OPHTHO_KEYWORDS):
        return {"safe": True, "reason": "ophtho_keyword_match"}

    # Stage 3: short queries with no signals — allow (avoid over-blocking greetings etc.)
    if len(query.split()) < 8:
        return {"safe": True, "reason": "short_query"}

    # Stage 3: LLM classification for ambiguous long queries (< 1% of traffic)
    try:
        from tools.shared.gemini_client import ask, MODEL_SMALL
        result = await asyncio.to_thread(
            ask,
            system_prompt=(
                "You are a content classifier for a medical education application. "
                "Answer ONLY 'yes' or 'no': Is this query related to ophthalmology, "
                "eye care, or medical education?"
            ),
            messages=[{"role": "user", "content": query}],
            max_tokens=5,
            feature="guardrail_input",
            model=MODEL_SMALL,
            thinking_level="MINIMAL",
        )
        safe = result.strip().lower().startswith("yes")
        return {"safe": safe, "reason": "llm_classified"}
    except Exception:
        # If classification fails, allow the query — never block on classifier error
        return {"safe": True, "reason": "classifier_error_passthrough"}
