"""Provide an ~86s cinematic music bed at .tmp/video/music/bed.mp3.

Primary path: download a royalty-free track (default: Kevin MacLeod "Inspired",
Creative Commons CC-BY 4.0) and trim / loudness-normalize / fade to length.
Fallback: synthesize an original ambient pad with ffmpeg (no licensing required).
"""
import subprocess, sys, urllib.request
from pathlib import Path

TRACK_URL = "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Inspired.mp3"
ATTRIBUTION = ('"Inspired" by Kevin MacLeod (incompetech.com) — '
               "Licensed under Creative Commons: By Attribution 4.0 — "
               "https://creativecommons.org/licenses/by/4.0/")
OUT = ".tmp/video/music/bed.mp3"


def download(url, out):
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=90) as r, open(out, "wb") as f:
        f.write(r.read())
    return out


def prepare(src, out=OUT, seconds=86):
    """Trim to length, fade in/out, loudness-normalize to a calm bed level."""
    af = f"afade=t=in:st=0:d=3,afade=t=out:st={seconds - 5}:d=5,loudnorm=I=-18:TP=-2"
    subprocess.run(["ffmpeg", "-y", "-i", src, "-t", str(seconds),
                    "-af", af, "-c:a", "libmp3lame", "-b:a", "192k", out], check=True)
    return out


def synth_bed(out=OUT, seconds=86):
    """Original ambient pad — stacked detuned sines + slow tremolo + echo."""
    desc = (f"aevalsrc='0.20*sin(2*PI*110*t)+0.16*sin(2*PI*164.81*t)"
            f"+0.12*sin(2*PI*220*t)+0.08*sin(2*PI*55*t):d={seconds}:s=44100',"
            "tremolo=f=0.12:d=0.4,aecho=0.8:0.7:60:0.3,lowpass=f=1400,"
            f"afade=t=in:st=0:d=4,afade=t=out:st={seconds - 5}:d=5,volume=0.6")
    subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", desc,
                    "-c:a", "libmp3lame", "-b:a", "192k", out], check=True)
    return out


def main():
    raw = ".tmp/video/music/source.mp3"
    try:
        download(TRACK_URL, raw)
        prepare(raw)
        print("MUSIC: downloaded + prepared bed.mp3")
        print("ATTRIBUTION:", ATTRIBUTION)
    except Exception as e:
        print("download failed, synthesizing original bed:", e, file=sys.stderr)
        synth_bed()
        print("MUSIC: synthesized ambient bed.mp3 (no attribution needed)")


if __name__ == "__main__":
    main()
