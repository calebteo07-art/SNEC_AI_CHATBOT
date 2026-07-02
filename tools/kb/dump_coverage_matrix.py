"""One-shot: dump every silly document -> its flashcard topic + OSCE note into a
markdown coverage matrix (docs/notes/silly-coverage-matrix.md). Not imported.

Maps each document to a flashcard topic_key via title/category substrings, using
the taxonomy in flashcard_sets.py. Unmapped rows are flagged "(REVIEW)" so no
document is silently missed.

Run: python tools/kb/dump_coverage_matrix.py > docs/notes/silly-coverage-matrix.md
"""
import sys
sys.path.insert(0, ".")
from tools.kb.supabase_client import get_client

# (substring in title, flashcard topic_key). First match wins; checked in order.
TITLE_MAP: list[tuple[str, str]] = [
    ("A&PPart", "anatomy_physiology"), ("Microbiology", "microbiology_infection"),
    ("InfectionControl", "microbiology_infection"), ("Infection Control", "microbiology_infection"),
    ("Pharmacology", "pharmacology"),
    ("OcularEmergencies", "ocular_emergencies"), ("Ocular Emergencies", "ocular_emergencies"),
    ("Ethics", "professional_ethics"), ("MSW", "professional_ethics"),
    ("Etiquette", "professional_ethics"), ("Communication", "professional_ethics"),
    ("eyelid", "disorders_eyelid_lacrimal_orbit"), ("Eyelid", "disorders_eyelid_lacrimal_orbit"),
    ("Lacrimal", "disorders_eyelid_lacrimal_orbit"), ("Orbit", "disorders_eyelid_lacrimal_orbit"),
    ("ptosis", "disorders_eyelid_lacrimal_orbit"), ("Ectropion", "disorders_eyelid_lacrimal_orbit"),
    ("Entropion", "disorders_eyelid_lacrimal_orbit"), ("chalazion", "disorders_eyelid_lacrimal_orbit"),
    ("Cornea", "disorders_cornea_conjunctiva"), ("Conjunctiva", "disorders_cornea_conjunctiva"),
    ("Sclera", "disorders_cornea_conjunctiva"),
    ("Uvea", "disorders_uvea_retina"), ("Uveitis", "disorders_uvea_retina"),
    ("Retina", "disorders_uvea_retina"), ("Inflammation", "disorders_uvea_retina"),
    ("Glaucoma", "glaucoma"),
    ("Nerve", "neuro_strabismus"), ("Neuro", "neuro_strabismus"), ("Optic", "neuro_strabismus"),
    ("Strabismus", "neuro_strabismus"), ("Amblyopia", "neuro_strabismus"),
    ("ExtraOcularMuscles", "neuro_strabismus"), ("ExtraOcular", "neuro_strabismus"),
    ("Asthma", "systemic_disease"), ("Diabetes", "systemic_disease"),
    ("Hypertension", "systemic_disease"), ("Systemic", "systemic_disease"),
    # Procedural / OT
    ("Biometry", "ascan_biometry"), ("OCT", "oct_macula"), ("HVF", "hvf"),
    ("GVF", "gvf"), ("Topography", "corneal_topography"), ("Pentacam", "corneal_topography"),
    ("Endothelial", "endothelial"), ("Auto Kerato", "auto_refraction"),
    ("Auto Refraction", "auto_refraction"), ("SORC", "dr_grading"), ("Grading", "dr_grading"),
    ("Angiography", "retinal_imaging"), ("photography", "retinal_imaging"),
    ("Non-Contact", "iop_nct"), ("Tonometry", "iop_nct"),
    ("Near Vision", "near_vision"), ("LogMAR", "distance_va"), ("Distance Vision", "distance_va"),
    ("History", "history_taking"), ("PFAER", "fall_risk"), ("Fall", "fall_risk"),
    ("eyedrops", "eye_drops"), ("eye drops", "eye_drops"), ("Instillation", "eye_drops"),
    ("Ishihara", "colour_vision"), ("Amsler", "amsler_macula"),
    ("Abbreviations", "abbreviations"),
    ("basiceyeevaluation", "history_taking"), ("Basiceyeevaluation", "history_taking"),
    ("Equipments", "aberrometry"), ("Lens Meter", "lens_meter"),
    ("Procedure Manual", "aberrometry"),  # textbook — Ch5 spans multiple OT topics
    ("OSCE", "history_taking"),  # OSCE scripts map to their station's topic (per-file)
    ("Log book", "history_taking"), ("Competency", "iop_nct"),
    ("SIDRP", "dr_grading"), ("Patternrecognition", "dr_grading"),
    # Talks / onboarding / textbook chapters
    ("LV OAOT", "distance_va"),          # low-vision talk
    ("Informatics", "professional_ethics"), ("Onboarding", "professional_ethics"),
    ("oittalk", "aberrometry"),          # ophthalmic-investigation techniques overview
    ("OphthalmicAssistantBookChap14", "disorders_cornea_conjunctiva"),  # contact lenses
    # Disease chapters with no dedicated region -> anterior-segment (lens/cataract)
    ("Lens", "disorders_cornea_conjunctiva"),
    # Research papers -> their clinical topic (supplementary grounding)
    ("chemicaleyeburns", "ocular_emergencies"),
    ("contactlens", "disorders_cornea_conjunctiva"),
    ("ThyroidEyeDisease", "disorders_eyelid_lacrimal_orbit"),
    ("giantretinaltear", "disorders_uvea_retina"),
    ("Amblyopiatherapy", "neuro_strabismus"),
    ("Interrelationship", "glaucoma"), ("intraocularpressure", "glaucoma"),
    ("ocularsurface", "disorders_cornea_conjunctiva"),
    ("anterioruveitis", "disorders_uvea_retina"),
]


def topic_for(title: str) -> str:
    for sub, tk in TITLE_MAP:
        if sub.lower() in title.lower():
            return tk
    return "(REVIEW)"


def main() -> None:
    c = get_client()
    docs = c.table("documents").select("category,module,title").order("category").order("title").execute().data
    cl = {x["procedure_name"]: x["checklist_type"]
          for x in c.table("checklists").select("procedure_name,checklist_type").execute().data}
    print("# silly -> flashcards / OSCE coverage matrix\n")
    print("Auto-generated stub (`tools/kb/dump_coverage_matrix.py`); hand-refine `(REVIEW)` rows.\n")
    print("Role rule: FOUNDATIONS topics -> ALL roles; CLINICAL -> OA/PSA; OT -> OT.\n")
    print("| category | module | silly document | flashcard topic | checklist role |")
    print("|---|---|---|---|---|")
    for d in docs:
        role = cl.get(d["title"], "")
        print(f"| {d['category']} | M{d['module']} | {d['title']} | `{topic_for(d['title'])}` | {role} |")


if __name__ == "__main__":
    main()
