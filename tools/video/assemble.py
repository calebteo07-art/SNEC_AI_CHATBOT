"""Assemble the EyeBot marketing master from per-scene assets.

Per scene: build a normalized 1080p/30 background (video trimmed + last-frame held,
or a ken-burns still), overlay the scene's caption or brand lockup, then crossfade-chain
all scenes and mix the music bed. Output: marketing/eyebot_iela_2026.mp4
"""
import subprocess
from pathlib import Path
from tools.video.timeline import SCENES, total_duration
from tools.video.kenburns import kenburns_cmd

FPS, W, H = 30, 1920, 1080
SEG = ".tmp/video/segments"
CAP = ".tmp/video/captions"
STILL = ".tmp/video/stills"
MUSIC = ".tmp/video/music/bed.mp3"
XFADE = 0.35
OFFSETS = {"06": 5.0}   # per-scene start trim (skip the flashcards setup menu)


def _run(cmd):
    subprocess.run(cmd, check=True)


def _overlay_for(s):
    """The full-frame transparent PNG to composit on a scene (None = bare background)."""
    if s.id == "08":
        return f"{STILL}/08_end.png"            # end-card lockup over the close clip
    if s.id == "02":
        return f"{STILL}/02_title_overlay.png"  # title lockup over the accent clip
    if s.source == "brand":
        return None                              # opaque self-contained card
    return f"{CAP}/{s.id}.png"                   # lower-third caption + feature label


def _source_clip(s):
    """A silent 1080p/30 clip of exactly s.duration (video trimmed/held, or ken-burns still)."""
    raw = f"{SEG}/{s.id}_raw.mp4"
    if s.source in ("broll", "live"):
        vf = (f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
              f"fps={FPS},tpad=stop_mode=clone:stop_duration=30,format=yuv420p")
        ss = OFFSETS.get(s.id, 0)
        pre = ["-ss", str(ss)] if ss else []
        _run(["ffmpeg", "-y", *pre, "-i", s.asset, "-vf", vf, "-t", str(s.duration),
              "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", raw])
    else:  # stills / brand
        _run(kenburns_cmd(s.asset, raw, seconds=s.duration, fps=FPS))
    return raw


def _segment(s, raw):
    """Overlay caption/lockup (fading) onto the raw clip and add scene fades -> final segment."""
    seg = f"{SEG}/{s.id}.mp4"
    d = s.duration
    ov = _overlay_for(s)
    if ov is None:
        vf = f"fade=t=in:st=0:d=0.4,fade=t=out:st={d - 0.5}:d=0.5,format=yuv420p"
        _run(["ffmpeg", "-y", "-i", raw, "-vf", vf, "-t", str(d), "-r", str(FPS),
              "-c:v", "libx264", "-pix_fmt", "yuv420p", seg])
        return seg
    fc = (f"[0:v]format=yuv420p[v];"
          f"[1:v]format=rgba,fade=t=in:st=0.3:d=0.5:alpha=1,"
          f"fade=t=out:st={d - 0.8}:d=0.6:alpha=1[c];"
          f"[v][c]overlay=0:0:format=auto,"
          f"fade=t=in:st=0:d=0.4,fade=t=out:st={d - 0.5}:d=0.5[o]")
    _run(["ffmpeg", "-y", "-i", raw, "-loop", "1", "-framerate", str(FPS), "-t", str(d),
          "-i", ov, "-filter_complex", fc, "-map", "[o]",
          "-t", str(d), "-r", str(FPS), "-c:v", "libx264", "-pix_fmt", "yuv420p", seg])
    return seg


def _xfade_concat(segments, out):
    inputs = []
    for seg in segments:
        inputs += ["-i", seg]
    durs = [s.duration for s in SCENES]
    filt, prev, offset = [], "[0:v]", 0.0
    for i in range(1, len(segments)):
        offset += durs[i - 1] - XFADE
        label = f"[x{i}]"
        filt.append(f"{prev}[{i}:v]xfade=transition=fade:duration={XFADE}:"
                    f"offset={offset:.2f}{label}")
        prev = label
    _run(["ffmpeg", "-y", *inputs, "-filter_complex", ";".join(filt), "-map", prev,
          "-r", str(FPS), "-c:v", "libx264", "-pix_fmt", "yuv420p", out])
    return out


def _add_music(silent, music, out):
    total = total_duration() - XFADE * (len(SCENES) - 1)
    af = f"[1:a]atrim=0:{total:.2f},afade=t=out:st={total - 4:.2f}:d=4[a]"
    _run(["ffmpeg", "-y", "-i", silent, "-i", music, "-filter_complex", af,
          "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
          "-movflags", "+faststart", "-shortest", out])
    return out


def main(out="marketing/eyebot_iela_2026.mp4", music=MUSIC):
    Path(SEG).mkdir(parents=True, exist_ok=True)
    segs = []
    for s in SCENES:
        segs.append(_segment(s, _source_clip(s)))
    silent = f"{SEG}/_silent.mp4"
    _xfade_concat(segs, silent)
    Path("marketing").mkdir(exist_ok=True)
    _add_music(silent, music, out)
    print("master:", out)


if __name__ == "__main__":
    main()
