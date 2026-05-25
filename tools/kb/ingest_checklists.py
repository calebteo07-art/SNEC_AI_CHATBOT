#!/usr/bin/env python3
"""Parse checklist PDFs into structured JSON and store in Supabase.

Uses Gemini to extract step-by-step procedure data from raw PDF text.
Designed for the OT, PSA, and logbook checklist PDFs in the SNEC OAOT course.

Usage:
    from tools.kb.ingest_checklists import parse_checklist, ingest_checklist
    checklist = parse_checklist(pdf_path, checklist_type="OT", procedure_name="Basic Biometry")
    ingest_checklist(pdf_path, document_id, checklist_type="OT", procedure_name="Basic Biometry", module=2)

Self-test:
    python tools/kb/ingest_checklists.py <path_to_checklist.pdf> [--type OT] [--procedure "Basic Biometry"]
"""

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.kb.extract_pdf import extract_full_text
from tools.kb.supabase_client import upsert_checklist
from tools.shared.gemini_client import ask, MOCK_MODE

_PARSE_PROMPT = """You are a medical education data extractor. Extract all checklist steps from the ophthalmology procedure checklist below.

Return ONLY valid JSON with this exact structure — no other text, no markdown code fences:
{
  "procedure_name": "<name of the procedure>",
  "checklist_type": "<OT or PSA or logbook>",
  "total_steps": <integer>,
  "steps": [
    {
      "step_number": 1,
      "category": "<one of: patient_identification, consent, equipment, medication, documentation, patient_education, safety_check, post_procedure, clinical_assessment, infection_control>",
      "action": "<exact step text, cleaned of formatting artifacts>",
      "critical": <true if patient safety risk if skipped, else false>,
      "notes": "<any clarification or escalation note from the checklist, or null>"
    }
  ]
}

Rules:
- Include EVERY step — do not skip or summarise.
- Set critical=true for steps involving: patient identity check, correct eye confirmation, consent verification, drug dosage, needle/sharp handling, sterile field.
- Clean the action text: remove tick boxes (□ ✓), leading numbers if already in step_number, and any formatting noise.
- If the procedure name is not explicitly stated, infer it from the document content.
- Ensure steps are in the same order as the checklist.
"""

_MOCK_CHECKLIST = {
    "procedure_name": "Mock Procedure",
    "checklist_type": "OT",
    "total_steps": 3,
    "steps": [
        {"step_number": 1, "category": "patient_identification", "action": "Confirm patient identity", "critical": True, "notes": None},
        {"step_number": 2, "category": "equipment", "action": "Check equipment is calibrated", "critical": False, "notes": None},
        {"step_number": 3, "category": "documentation", "action": "Document findings in SCM", "critical": False, "notes": None},
    ],
}


def parse_checklist(
    pdf_path: Path,
    checklist_type: str,
    procedure_name: str | None = None,
) -> dict:
    """Extract structured checklist data from a PDF using Gemini.

    Args:
        pdf_path:       Path to the checklist PDF.
        checklist_type: 'OT', 'PSA', or 'logbook'.
        procedure_name: Override for the procedure name (Gemini infers if None).

    Returns:
        Parsed checklist dict matching the checklists.steps JSONB schema.
    """
    if MOCK_MODE:
        result = dict(_MOCK_CHECKLIST)
        result["checklist_type"] = checklist_type
        if procedure_name:
            result["procedure_name"] = procedure_name
        return result

    raw_text = extract_full_text(pdf_path)
    if not raw_text.strip():
        raise ValueError(f"No text could be extracted from {pdf_path.name}")

    # Truncate to first 8000 chars — checklists are short; this avoids token overrun
    text_excerpt = raw_text[:8000]

    override_note = (
        f"\nThe procedure name is: {procedure_name}\n" if procedure_name else ""
    )
    override_type = f"\nThe checklist type is: {checklist_type}\n"

    response = ask(
        system_prompt=_PARSE_PROMPT + override_note + override_type,
        messages=[{"role": "user", "content": text_excerpt}],
        max_tokens=4096,
        feature="default",
    )

    # Strip any accidental markdown fences
    text = response.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    parsed = json.loads(text)

    # Ensure required fields
    parsed.setdefault("checklist_type", checklist_type)
    parsed.setdefault("total_steps", len(parsed.get("steps", [])))
    if procedure_name:
        parsed["procedure_name"] = procedure_name

    return parsed


def ingest_checklist(
    pdf_path: Path,
    document_id: str,
    checklist_type: str,
    procedure_name: str | None,
    module: int,
) -> None:
    """Parse and store a checklist into Supabase.

    The document row must already exist (inserted by ingest_document.ingest()).
    """
    parsed = parse_checklist(pdf_path, checklist_type, procedure_name)

    upsert_checklist({
        "document_id": document_id,
        "checklist_type": checklist_type,
        "procedure_name": parsed.get("procedure_name", procedure_name or pdf_path.stem),
        "module": module,
        "steps": parsed,
        "total_steps": parsed.get("total_steps", len(parsed.get("steps", []))),
    })

    print(f"    checklist: '{parsed.get('procedure_name')}' — {parsed.get('total_steps')} steps")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Parse and ingest a checklist PDF.")
    parser.add_argument("pdf_path", type=Path)
    parser.add_argument("--type", dest="checklist_type", default="OT",
                        choices=["OT", "PSA", "logbook"])
    parser.add_argument("--procedure", dest="procedure_name", default=None)
    args = parser.parse_args()

    if not args.pdf_path.exists():
        print(f"File not found: {args.pdf_path}")
        sys.exit(1)

    print(f"Parsing checklist: {args.pdf_path.name}")
    parsed = parse_checklist(args.pdf_path, args.checklist_type, args.procedure_name)
    print(json.dumps(parsed, indent=2))
    print(f"\n[PASS] Parsed {parsed.get('total_steps')} steps for '{parsed.get('procedure_name')}'")
    sys.exit(0)
