import os
from pathlib import Path

root = Path(__file__).resolve().parents[1]
for line in (root / ".env").read_text(encoding="utf-8").splitlines():
    s = line.strip()
    if s and not s.startswith("#") and "=" in s:
        k, v = s.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

from google import genai

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
print("--- models mentioning 'image' ---")
for m in client.models.list():
    n = getattr(m, "name", "")
    if "image" in n.lower():
        print(n, "|", getattr(m, "supported_actions", None))
