"""Build an ffmpeg command that animates a still image into a 1080p clip."""


def kenburns_cmd(img, out, seconds=5, fps=30, zoom_to=1.12):
    frames = int(round(seconds * fps))
    # Upscale first so zoompan has pixels to work with; slow linear zoom-in, centered.
    vf = (
        "scale=3840:-1,"
        f"zoompan=z='min(zoom+0.0006,{zoom_to})':"
        f"d={frames}:fps={fps}:"
        "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080,"
        "format=yuv420p"
    )
    return ["ffmpeg", "-y", "-loop", "1", "-i", img, "-vf", vf,
            "-t", str(seconds), "-r", str(fps), "-c:v", "libx264",
            "-pix_fmt", "yuv420p", out]
