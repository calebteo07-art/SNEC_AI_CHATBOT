"""Generate realistic imagery for the proposal via Gemini 'Nano Banana' (Pro).

Usage:  python gen_images.py <job|all>
Images are written to proposal/assets/.
"""
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ASSETS = HERE / "assets"
ASSETS.mkdir(exist_ok=True)

for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    s = line.strip()
    if s and not s.startswith("#") and "=" in s:
        k, v = s.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

from google import genai
from google.genai import types

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
MODEL = os.environ.get("NB_MODEL", "gemini-3-pro-image")

JOBS = {
    "eye_hero": ("16:9",
        "Extreme close-up macro photograph of one real human eye, hyper-realistic and "
        "razor sharp. The iris glows in luminous cyan and teal with intricate radial "
        "fibres and deep three-dimensional texture; a pure black pupil; a crisp catch-light "
        "reflection; fine realistic eyelashes. Dramatic cinematic lighting fading into a "
        "near-black background. Faint, elegant concentric light rings suggest a high-tech "
        "retinal scanner, yet it is unmistakably a real human eye. Palette: teal, cyan, "
        "deep ink-black, one subtle warm-gold glint. Shallow depth of field, ultra-detailed, "
        "8k medical-grade photography, centred."),
    "eye_portrait": ("3:4",
        "Vertical hyper-realistic macro photograph of one real human eye in the upper third, "
        "luminous teal-cyan iris with fine fibres, black pupil, realistic lashes, dramatic "
        "lighting dissolving into a deep near-black background with generous empty dark space "
        "below for text. Faint concentric scanner rings. Palette: teal, cyan, ink-black, a "
        "single warm-gold glint. Cinematic, ultra-detailed, 8k photoreal."),
    "clinic": ("16:9",
        "Documentary photograph of a modern eye clinic: a focused young clinician examining "
        "a patient's eye at a slit-lamp microscope, soft teal-tinted ambient light, warm skin "
        "tones, shallow depth of field, professional medical photography, calm and premium, "
        "photorealistic, 8k."),
    "innovation": ("16:9",
        "Conceptual hyper-realistic macro of a real human eye with faint holographic data, "
        "thin light grids and concentric scan rings reflected across the cornea and teal iris, "
        "deep black background, an artificial-intelligence-meets-ophthalmology concept that is "
        "still a real eye, cinematic, ultra-detailed, 8k photoreal, teal and cyan palette with "
        "a subtle gold accent."),
}


def gen(job):
    aspect, prompt = JOBS[job]
    out = ASSETS / f"{job}.png"
    configs = [
        dict(response_modalities=["IMAGE"], image_config=types.ImageConfig(aspect_ratio=aspect)),
        dict(response_modalities=["TEXT", "IMAGE"], image_config=types.ImageConfig(aspect_ratio=aspect)),
        dict(response_modalities=["TEXT", "IMAGE"]),
    ]
    for i, c in enumerate(configs):
        try:
            resp = client.models.generate_content(
                model=MODEL, contents=prompt, config=types.GenerateContentConfig(**c)
            )
        except Exception as e:
            print(f"[{job}] config {i} error: {e}")
            continue
        for cand in (resp.candidates or []):
            for part in (cand.content.parts or []):
                d = getattr(part, "inline_data", None)
                if d and d.data:
                    out.write_bytes(d.data)
                    print(f"[{job}] saved {out} ({len(d.data)//1024} KB) via config {i}")
                    return True
                if getattr(part, "text", None):
                    print(f"[{job}] text: {part.text[:160]}")
        print(f"[{job}] config {i}: no image returned")
    print(f"[{job}] FAILED")
    return False


if __name__ == "__main__":
    sel = sys.argv[1] if len(sys.argv) > 1 else "eye_hero"
    jobs = list(JOBS) if sel == "all" else [sel]
    for j in jobs:
        gen(j)
