"use client";
/* EyeconGreetingLoop — the baked Veo greeting loop, overlaid on top of the default
   EyeconLogo mascot (which stays in the DOM as the always-present fallback). The clip
   is opaque (Veo can't emit alpha) with a baked warm background matching the card, so
   it fully covers the logo beneath. Self-contained (NO MotionProvider/useFx — it is
   not mounted in the student app): reduced motion is read straight from matchMedia +
   the data-motion attribute, like FeatureCarousel. Renders NULL when the asset is
   absent / reduced-motion / save-data / on error — then the frozen CSS mascot shows
   through. So under reduced motion there is no video and no static poster; the
   accessibility + logo-present harness assertions keep passing. */
import { useEffect, useRef, useState } from "react";

const SRC = "/media/loops/greeting-selena.mp4";
const POSTER = "/media/loops/greeting-selena.jpg";

function saveData(): boolean {
  if (typeof navigator === "undefined") return false;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !!conn?.saveData;
}

export function EyeconGreetingLoop({ available }: { available: boolean }) {
  const [off, setOff] = useState(true); // default off until we confirm motion is allowed (SSR-safe)
  const [failed, setFailed] = useState(false);
  const vref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const reduce =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.getAttribute("data-motion") === "reduce";
    setOff(reduce || saveData());
  }, []);

  if (!available || failed || off) return null;

  return (
    <span className="hm-eyeconloop" aria-hidden>
      <video
        ref={vref}
        src={SRC}
        poster={POSTER}
        muted
        loop
        playsInline
        autoPlay
        preload="metadata"
        className="hm-eyeconloop-v"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
