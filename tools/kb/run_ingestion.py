#!/usr/bin/env python3
"""Master ingestion script — processes all 82 PDFs from Module 1 and Module 2.

Run this once to populate the Supabase knowledge base. It is idempotent:
already-ingested files are skipped unless --force is passed.

Estimated runtime: 45–60 minutes for the full corpus on first run.

Prerequisites:
  1. Supabase project created with schema from the plan (4 tables + 2 RPCs).
  2. Supabase Storage bucket named 'kb-images' created and set to Public.
  3. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set in .env.
  4. GEMINI_API_KEY set in .env (for embeddings and checklist parsing).

Usage:
    python tools/kb/run_ingestion.py                 # full run (skip existing)
    python tools/kb/run_ingestion.py --force          # re-ingest everything
    python tools/kb/run_ingestion.py --module 1       # only Module 1
    python tools/kb/run_ingestion.py --module 2       # only Module 2
    python tools/kb/run_ingestion.py --checklists     # only checklist PDFs
    python tools/kb/run_ingestion.py --dry-run        # print catalog, don't ingest
"""

import argparse
import sys
import traceback
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

MODULE_1_DIR = Path(r"C:\Users\caleb\OneDrive\Desktop\Module 1 Content EyeBot")
MODULE_2_DIR = Path(r"C:\Users\caleb\OneDrive\Desktop\Module 2 Content EyeBot")

# ─────────────────────────────────────────────────────────────────────────────
# PDF Catalog
# Each entry: {filename, module, category, is_checklist, checklist_type, procedure_name}
# is_checklist=True triggers structured parsing via ingest_checklists.py
# ─────────────────────────────────────────────────────────────────────────────

MODULE_1_CATALOG = [
    # Checklists / logbooks
    {
        "filename": "(7a)Competency Checklist CC-K0032 I-Care_ Nov 2021 (1).pdf",
        "category": "checklist", "is_checklist": True,
        "checklist_type": "logbook", "procedure_name": "I-Care Competency",
    },
    {
        "filename": "OA OT Log book Checklist Skills Observation OPD v5.pdf",
        "category": "checklist", "is_checklist": True,
        "checklist_type": "logbook", "procedure_name": "OPD Skills Observation",
    },
    {
        "filename": "OA OT Log book Dayward and OTChecklist Skills ObservationV5.pdf",
        "category": "checklist", "is_checklist": True,
        "checklist_type": "logbook", "procedure_name": "Dayward and OT Skills Observation",
    },
    {
        "filename": "OA OT Log book Oph Inv Checklist Skills ObservationV5.pdf",
        "category": "checklist", "is_checklist": True,
        "checklist_type": "logbook", "procedure_name": "Ophthalmic Investigations Skills Observation",
    },
    {
        "filename": "OA OT Log book OPH Optometry Checklist Skills Observation V1.pdf",
        "category": "checklist", "is_checklist": True,
        "checklist_type": "logbook", "procedure_name": "Optometry Skills Observation",
    },
    {
        "filename": "OA OT Log book OPH OrthopticsChecklist Skills ObservationV1.pdf",
        "category": "checklist", "is_checklist": True,
        "checklist_type": "logbook", "procedure_name": "Orthoptics Skills Observation",
    },
    # Anatomy & Physiology
    {"filename": "A&PPartI.pdf", "category": "anatomy"},
    {"filename": "A&PPartII.pdf", "category": "anatomy"},
    {"filename": "1.A&PPartIII.pdf", "category": "anatomy"},
    {"filename": "Microbiology_2025.pdf", "category": "anatomy"},
    # Ethics & Professional
    {"filename": "1. Medical Ethics and Legal Issues.pdf", "category": "ethics"},
    {
        "filename": "3. Priscilla Lim - role of MSW revised (Oph asst and tech course) (revised 13 Feb 2026).pdf",
        "category": "ethics",
    },
    {"filename": "Professional Etiquette And Code of Conduct_V2.pdf", "category": "ethics"},
    # Communication & Informatics
    {"filename": "2.CommunicationSkills_2023.pdf", "category": "clinical_procedure"},
    {
        "filename": "Nursing Informatics_New Hire Onboarding 2026 - Andrew Version.pdf",
        "category": "clinical_procedure",
    },
    # Reference
    {"filename": "3.OphthalmicAbbreviations.pdf", "category": "reference"},
    # Pharmacology
    {"filename": "Harold Stein Chap 4 Pharmacology.pdf", "category": "pharmacology"},
    # Clinical Procedures
    {"filename": "HistoryTaking10thintakeSNECDukeNUSprogram4June2021.pdf", "category": "clinical_procedure"},
    {"filename": "LV OAOT Talk 2026.pdf", "category": "clinical_procedure"},
    {
        "filename": "NU-PR-OPD-D0002 Non-Contact Tonometry.pdf",
        "category": "clinical_procedure", "is_checklist": True,
        "checklist_type": "PSA", "procedure_name": "Non-Contact Tonometry (SOP)",
    },
    {
        "filename": "NU-PR-OPD-D0003 Visual Acuity - Near Vision Testing.pdf",
        "category": "clinical_procedure", "is_checklist": True,
        "checklist_type": "PSA", "procedure_name": "Near Vision Testing (SOP)",
    },
    {
        "filename": "NU-PR-OPD-D0034 Auto Kerato-Refractometry.pdf",
        "category": "clinical_procedure", "is_checklist": True,
        "checklist_type": "OT", "procedure_name": "Auto Kerato-Refractometry (SOP)",
    },
    # Ingested as a reference document only, NOT as a checklist. CC-D0008 (the Nursing
    # competency assessment) supersedes this SOP on reading direction, test distance and
    # the pinhole steps at 6/60 and 6/120; ingesting it as a checklist created a second,
    # contradictory graded row. See docs/notes/2026-07-31-distance-va-source-conflict.md
    {
        "filename": "NU-PR-OPD-D0039 Visual Acuity-Distance Vision Testing Using LogMAR (Modified) Method.pdf",
        "category": "clinical_procedure",
    },
    {"filename": "oittalk.pdf", "category": "clinical_procedure"},
    {"filename": "OTOAInfectionControl_Jan2023.pdf", "category": "clinical_procedure"},
    {"filename": "TheOphthalmicAssistantBookChap14part2.pdf", "category": "clinical_procedure"},
    {"filename": "V2_Ophthalmic Equipments_Instruments.pdf", "category": "clinical_procedure"},
    {
        "filename": "V3_Basiceyeevaluation_16x9Template-Restricted,Non-Sensitive.pdf",
        "category": "clinical_procedure",
    },
    # Diagnostics
    {"filename": "GVFnHVF.pdf", "category": "diagnostic"},
    {"filename": "Part1-IntroductiontoSORC.pdf", "category": "diagnostic"},
    {"filename": "Part2-PrinciplesofGrading.pdf", "category": "diagnostic"},
    {"filename": "Part3-Patternrecognition.pdf", "category": "diagnostic"},
    # Systemic Diseases
    {"filename": "V2_ 2026_ Asthma.pdf", "category": "disease"},
    {"filename": "v2_ 2026_ Diabetes Mellitus.pdf", "category": "disease"},
    {"filename": "V2_2026_ Hypertension.pdf", "category": "disease"},
]

MODULE_2_CATALOG = [
    # OT Checklists
    {
        "filename": "OT_Checklist_BasicBiometryV1.pdf",
        "category": "checklist", "is_checklist": True,
        "checklist_type": "OT", "procedure_name": "Basic Biometry",
    },
    {
        "filename": "OT_Checklist_Cirrus-OCT V2.pdf",
        "category": "checklist", "is_checklist": True,
        "checklist_type": "OT", "procedure_name": "Cirrus OCT",
    },
    {
        "filename": "OT_Checklist_CorneaTopographyV3.pdf",
        "category": "checklist", "is_checklist": True,
        "checklist_type": "OT", "procedure_name": "Cornea Topography",
    },
    {
        "filename": "OT_Checklist_InstillationofeyedropsV4.pdf",
        "category": "checklist", "is_checklist": True,
        "checklist_type": "OT", "procedure_name": "Instillation of Eye Drops",
    },
    {
        "filename": "OT_Checklist_Visual Field (HVF) V3.pdf",
        "category": "checklist", "is_checklist": True,
        "checklist_type": "OT", "procedure_name": "Humphrey Visual Field",
    },
    # PSA Checklists
    {
        "filename": "PSA_Checklist_Distance Vision Testing for Adults Using LogMAR (Modified) Method V2.pdf",
        "category": "checklist", "is_checklist": True,
        "checklist_type": "PSA", "procedure_name": "Distance Vision Testing LogMAR",
    },
    {
        "filename": "PSA_Checklist_History taking V3.pdf",
        "category": "checklist", "is_checklist": True,
        "checklist_type": "PSA", "procedure_name": "History Taking",
    },
    {
        "filename": "PSA_Checklist_Instillation and dilatation of eye drops V5.pdf",
        "category": "checklist", "is_checklist": True,
        "checklist_type": "PSA", "procedure_name": "Eye Drop Instillation and Dilation",
    },
    {
        "filename": "PSA_Checklist_Non-Contact Tonometry V4.pdf",
        "category": "checklist", "is_checklist": True,
        "checklist_type": "PSA", "procedure_name": "Non-Contact Tonometry",
    },
    {
        "filename": "PSA_Checklist_PFAER & Fall Risk Assessment V3.pdf",
        "category": "checklist", "is_checklist": True,
        "checklist_type": "PSA", "procedure_name": "PFAER and Fall Risk Assessment",
    },
    # Research papers (OAOT series)
    {
        "filename": "(OAOT)25yearsTrendsandriskfactorsrelatedtosurgicaloutcomesofgiantretinaltearrhermatogenousretinaldetachment.pdf",
        "category": "research",
    },
    {
        "filename": "(OAOT)AmblyopiatherapyinAsianchildrenfactorsaffectingvisualoutcomeandparents'perceptionofchildren'sattitudestowardsamblyopiatreatment.pdf",
        "category": "research",
    },
    {"filename": "(OAOT)Anupdateonchemicaleyeburns.pdf", "category": "research"},
    {"filename": "(OAOT)Areviewofcosmeticcontactlensinfection.pdf", "category": "research"},
    {
        "filename": "(OAOT)DevelopmentandValidationofSingaporeThyroidEyeDiseaseQualityofLifeQuestionnaire.pdf",
        "category": "research",
    },
    {
        "filename": "(OAOT)Inter-relationshipbetweenageing,bodymassindex,diabetes,systemicbloodpressureandintraocularpressureinAsians.pdf",
        "category": "research",
    },
    {"filename": "(OAOT)Viral_anterior_uveitis.pdf", "category": "research"},
    {
        "filename": "ocularsurfacestatusinglaucomanandocularhypertensionpatientswithexisitngcornealdisorder.pdf",
        "category": "research",
    },
    # Diseases & Disorders
    {"filename": "3.OcularEmergencies-RFoo(2).pdf", "category": "disease"},
    {"filename": "3rd&6thNervePalsypdf.pdf", "category": "disease"},
    {"filename": "4. Disorders of the Orbit_Jan2024.pdf", "category": "disease"},
    {"filename": "5. Disorders of the Lacrimal system.pdf", "category": "disease"},
    {"filename": "6. Disorders of the eyelids chalazion stye trichiasis.pdf", "category": "disease"},
    {"filename": "7. Disorders of the Eyelids Ectropion.pdf", "category": "disease"},
    {"filename": "Amblyopia (Lazy Eye) - Conditions & Treatments.pdf", "category": "disease"},
    {
        "filename": "Diseases and Disorders of the Cornea Sclera Conjunctiva_ADNChitra_Jun2021.pdf",
        "category": "disease",
    },
    {"filename": "Diseases and Disorders of the Systemic Disorders by Dr Lee YF.pdf", "category": "disease"},
    {"filename": "DiseasesandDisordersoftheUvea_.pdf", "category": "disease"},
    {"filename": "DiseasesDisordersoftheRetinafinal.pdf", "category": "disease"},
    {"filename": "Disorders of the Lens_ADNChitra_Jan2024.pdf", "category": "disease"},
    {"filename": "DisordersoftheEyelidsEntropion.pdf", "category": "disease"},
    {"filename": "DrFooLLConjunctivaandSclera5102017.pdf", "category": "disease"},
    {"filename": "Glaucoma.pdf", "category": "disease"},
    {"filename": "IdentifiedDisordersoftheeyelidsptosis.pdf", "category": "disease"},
    {"filename": "IdentifiedDrSonal_ExtraOcularMuscles (1).pdf", "category": "disease"},
    {"filename": "Neuro-OphthalmologyOpticneuritisandGCA.pdf", "category": "disease"},
    {"filename": "Notes 5 March24  Uveitis.pdf", "category": "disease"},
    {"filename": "Notes Uveitis 5 March 2024_.pdf", "category": "disease"},
    {"filename": "OcularInflammationandImmunology.pdf", "category": "disease"},
    {"filename": "Strabismus (Squint) – What It Is, Causes & Treatment.pdf", "category": "disease"},
    # Diagnostics
    {"filename": "Biometry presentation.pdf", "category": "diagnostic"},
    {"filename": "External photography_Kasi.pdf", "category": "diagnostic"},
    {"filename": "GVFnHVF.pdf", "category": "diagnostic"},
    {"filename": "Kasi Sandhanam Retinal Angiography 2023.pdf", "category": "diagnostic"},
    {"filename": "Slit lamp photographyfinal 2023.pdf", "category": "diagnostic"},
    # Pharmacology
    {"filename": "Opthalmic Pharmacology for Duke NUS OT OA Course 2026.pdf", "category": "pharmacology"},
    # Clinical procedures
    {"filename": "oittalk.pdf", "category": "clinical_procedure"},
    # SNEC procedure reference textbook (Ophthalmic Investigation Service)
    {
        "filename": "Procedure Manual of Ophthalmic Investigations (SNEC 2017).pdf",
        "category": "clinical_procedure",
    },
]


def _resolve(module_dir: Path, filename: str) -> Path:
    return module_dir / filename


def _run(
    catalog: list[dict],
    module: int,
    module_dir: Path,
    force: bool,
    checklists_only: bool,
    total: int,
    counter: list[int],
    errors: list[str],
) -> None:
    from tools.kb.ingest_document import ingest
    from tools.kb.ingest_checklists import ingest_checklist

    for entry in catalog:
        counter[0] += 1
        idx = counter[0]
        filename = entry["filename"]
        pdf_path = _resolve(module_dir, filename)
        is_checklist = entry.get("is_checklist", False)

        if checklists_only and not is_checklist:
            continue

        print(f"[{idx}/{total}] Module {module}: {filename}")

        if not pdf_path.exists():
            msg = f"  [MISSING] File not found: {pdf_path}"
            print(msg)
            errors.append(msg)
            continue

        try:
            doc_id = ingest(pdf_path, module, entry["category"], force)

            if is_checklist:
                ingest_checklist(
                    pdf_path,
                    doc_id,
                    checklist_type=entry.get("checklist_type", "OT"),
                    procedure_name=entry.get("procedure_name"),
                    module=module,
                    force=force,
                )
        except Exception as exc:
            msg = f"  [ERROR] {filename}: {exc}"
            print(msg)
            traceback.print_exc()
            errors.append(msg)


def main():
    parser = argparse.ArgumentParser(description="Ingest all 82 PDFs into Supabase.")
    parser.add_argument("--force", action="store_true", help="Re-ingest already-ingested files.")
    parser.add_argument("--module", type=int, choices=[1, 2], default=None,
                        help="Process only module 1 or 2 (default: both).")
    parser.add_argument("--checklists", action="store_true", help="Process only checklist PDFs.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print catalog and file check without ingesting.")
    args = parser.parse_args()

    total = len(MODULE_1_CATALOG) + len(MODULE_2_CATALOG)
    counter = [0]
    errors: list[str] = []

    print(f"EyeBot KB Ingestion — {total} PDFs across Module 1 ({len(MODULE_1_CATALOG)}) + Module 2 ({len(MODULE_2_CATALOG)})")
    print(f"Force: {args.force} | Module filter: {args.module} | Checklists only: {args.checklists}")
    print("=" * 70)

    if args.dry_run:
        print("\n[DRY RUN] Checking file existence...\n")
        missing = []
        for entry in MODULE_1_CATALOG:
            p = MODULE_1_DIR / entry["filename"]
            status = "OK" if p.exists() else "MISSING"
            print(f"  M1 [{status}] {entry['filename']}")
            if not p.exists():
                missing.append(entry["filename"])
        for entry in MODULE_2_CATALOG:
            p = MODULE_2_DIR / entry["filename"]
            status = "OK" if p.exists() else "MISSING"
            print(f"  M2 [{status}] {entry['filename']}")
            if not p.exists():
                missing.append(entry["filename"])
        print(f"\n{len(missing)} missing files.")
        if missing:
            for m in missing:
                print(f"  - {m}")
        sys.exit(0)

    if args.module in (None, 1):
        _run(MODULE_1_CATALOG, 1, MODULE_1_DIR, args.force,
             args.checklists, total, counter, errors)

    if args.module in (None, 2):
        _run(MODULE_2_CATALOG, 2, MODULE_2_DIR, args.force,
             args.checklists, total, counter, errors)

    # Phase 3: self-test
    print("\n" + "=" * 70)
    print("Self-test: running a semantic search query...")
    try:
        from tools.kb.search import search, format_context
        chunks = search("intraocular pressure measurement", top_k=3)
        print(f"  Retrieved {len(chunks)} chunks for 'intraocular pressure measurement'")
        if chunks:
            print(f"  Top result: {chunks[0].get('title')} (sim={chunks[0].get('similarity', 0):.3f})")
    except Exception as exc:
        print(f"  Self-test failed: {exc}")

    print("\n" + "=" * 70)
    print(f"Ingestion complete. Errors: {len(errors)}")
    if errors:
        print("\nFailed files:")
        for e in errors:
            print(f"  {e}")
    sys.exit(0 if not errors else 1)


if __name__ == "__main__":
    main()
