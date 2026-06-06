"""Input safety filter for the EyeBot clinical AI.

Two-stage pipeline:
  Stage 1 — regex (< 1ms): hard-block PII extraction, prompt injection, off-topic generation.
  Stage 2 — keyword (< 1ms): fast-pass for clearly ophtho-relevant queries.
  Stage 3 — LLM classification (only for ambiguous queries > 8 words with no ophtho signal).

Returns {"safe": bool, "reason": str}.
Designed to be called before any LLM invocation.
"""
import re

_BLOCK_PATTERNS = [
    r"\b(NRIC|IC\s*number|passport\s*number|birth\s*cert)\b",  # PII extraction
    r"ignore\s+(previous|above|all|prior)\s+instructions",      # prompt injection
    r"(you are now|pretend to be|act as)\s+(a\s+)?(different|another|evil)",
    r"(write|generate|create|compose)\s+a\s+(poem|story|song|rap|code|script|email\s+to)",
    r"\b(weather|sports|recipe|stock\s*price|cryptocurrency|betting|gambling|lottery)\b",
    r"\b(hack|jailbreak|bypass|exploit|vulnerabilit(y|ies))\b",
]
_BLOCK_RE = re.compile("|".join(_BLOCK_PATTERNS), re.IGNORECASE)

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


async def filter_input(query: str, student_role: str = "") -> dict:
    """Return {"safe": bool, "reason": str}.

    Fast path for the common case — only invokes Gemini for long ambiguous queries.
    """
    # Stage 1: regex hard-block (PII, injection, off-topic generation)
    if _BLOCK_RE.search(query):
        return {"safe": False, "reason": "blocked_pattern"}

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
        result = ask(
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
