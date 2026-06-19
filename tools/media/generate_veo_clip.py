"""Generate one Veo 3.1 b-roll clip via the Gemini API (full premium model).

Text-to-video:
  python -m tools.media.generate_veo_clip --prompt "macro push into an iris" \
      --out .tmp/video/broll/01_hook.mp4
Image-to-video (seed from EyeBot's own imagery):
  python -m tools.media.generate_veo_clip --prompt "slow drift, light flares" \
      --image frontend/public/<eye>.png --out .tmp/video/broll/01_hook.mp4
"""
import argparse, mimetypes, os, sys, time
from pathlib import Path
from dotenv import load_dotenv
from google import genai
from google.genai import types

MODEL = "veo-3.1-generate-preview"   # full premium tier

def build_config(seconds="8", resolution="1080p", aspect="16:9"):
    return types.GenerateVideosConfig(
        aspectRatio=aspect, resolution=resolution, durationSeconds=str(seconds),
    )

def build_kwargs(prompt, image_path=None, seconds="8", resolution="1080p"):
    kwargs = {"model": MODEL, "prompt": prompt,
              "config": build_config(seconds, resolution)}
    if image_path:
        data = Path(image_path).read_bytes()
        mime = mimetypes.guess_type(image_path)[0] or "image/png"
        kwargs["image"] = types.Image(imageBytes=data, mimeType=mime)
    return kwargs

def generate(prompt, out, image=None, seconds="8", resolution="1080p",
             poll_s=10, timeout_s=900):
    load_dotenv()
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    op = client.models.generate_videos(**build_kwargs(prompt, image, seconds, resolution))
    waited = 0
    while not op.done:
        if waited > timeout_s:
            raise TimeoutError(f"Veo job exceeded {timeout_s}s")
        time.sleep(poll_s); waited += poll_s
        op = client.operations.get(op)
        print(f"  ...{waited}s", file=sys.stderr)
    vid = op.response.generated_videos[0]
    client.files.download(file=vid.video)
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    vid.video.save(out)
    print(f"saved {out}")
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--image", default=None)
    ap.add_argument("--seconds", default="8")
    ap.add_argument("--resolution", default="1080p")
    a = ap.parse_args()
    generate(a.prompt, a.out, a.image, a.seconds, a.resolution)

if __name__ == "__main__":
    main()
