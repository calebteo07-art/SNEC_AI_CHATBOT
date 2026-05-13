#!/usr/bin/env python3
"""Evaluates a student's description of a retinal image against ground truth.

Usage (from run_quiz.py):
    from tools.image_quiz.evaluate_description import evaluate_description
    result = evaluate_description(image_meta, student_description, image_path)
"""

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared.gemini_client import ask, ask_with_image

EVAL_PROMPT = """You are an ophthalmology examiner evaluating a student's description of a retinal image.

You will be given the ground truth findings and the student's description.
Score the student out of 10 based on:
- Correct identification of key pathological findings (6 points)
- Correct diagnosis or differential (2 points)
- Correct laterality and modality identification (1 point)
- Systematic approach to description (1 point)

Return ONLY valid JSON, no other text:
{
  "score": <0-10>,
  "correct_findings": ["finding1", "finding2"],
  "missed_findings": ["finding1", "finding2"],
  "incorrect_findings": ["finding1"],
  "diagnosis_correct": true/false,
  "feedback": "<2-3 sentences of specific, educational feedback>"
}"""


def evaluate_description(
    image_meta: dict,
    student_description: str,
    image_path: str | Path | None = None,
) -> dict:
    """
    Evaluate a student's retinal image description.

    Args:
        image_meta:          Metadata dict from the JSON sidecar (contains ground truth).
        student_description: What the student described.
        image_path:          Path to the image (used for vision mode when API key present).

    Returns:
        Dict with score, correct/missed findings, and feedback.
    """
    ground_truth = json.dumps(image_meta.get("ground_truth", {}), indent=2)

    prompt = (
        f"GROUND TRUTH:\n{ground_truth}\n\n"
        f"STUDENT DESCRIPTION:\n{student_description}"
    )

    system = EVAL_PROMPT

    # Use vision if image available and API key present
    if image_path and Path(image_path).exists():
        response = ask_with_image(
            system_prompt=system,
            messages=[{"role": "user", "content": prompt}],
            image_path=image_path,
            max_tokens=512,
            feature="image",
        )
    else:
        response = ask(
            system_prompt=system,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=512,
            feature="image",
        )

    text = response.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {
            "score": 5,
            "correct_findings": image_meta.get("ground_truth", {}).get("key_findings", [])[:2],
            "missed_findings": [],
            "incorrect_findings": [],
            "diagnosis_correct": False,
            "feedback": response[:300],
        }
