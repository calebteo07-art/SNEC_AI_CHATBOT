"use client";
/* SelenaGreetingLoop — plays the baked Veo greeting loop when one is installed at
   /media/loops/greeting-selena.mp4. Self-contained (NO MotionProvider/useFx — it is
   not mounted in the student app): reduced motion is read straight from matchMedia +
   the data-motion attribute, exactly like FeatureCarousel. Renders null when the
   asset is absent / reduced-motion / save-data / on error, so GreetingHero's CSS
   mascot shows through as the fallback. Veo can't emit alpha, so the clip carries a
   baked warm background feathered to the greeting card. */
import { useEffect, useRef, useState } from "react";

const SRC = "/media/loops/greeting-selena.mp4";
const POSTER = "/media/loops/greeting-selena.jpg";

function saveData(): boolean {
  if (typeof navigator === "undefined") return false;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !!conn?.saveData;
}

export function SelenaGreetingLoop({ available }: { available: boolean }) {
  const [posterOnly, setPosterOnly] = useState(false);
  const [failed, setFailed] = useState(false);
  const vref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const reduce =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.getAttribute("data-motion") === "reduce";
    setPosterOnly(reduce || saveData());
  }, []);

  if (!available || failed) return null;

  return (
    <span className="hm-selenaloop" aria-hidden>
      {posterOnly ? (
        // eslint-disable-next-line @next/next/no-img-element -- static asset, no next/image on standalone
        <img src={POSTER} alt="" className="hm-selenaloop-v" onError={() => setFailed(true)} />
      ) : (
        <video
          ref={vref}
          src={SRC}
          poster={POSTER}
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          className="hm-selenaloop-v"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
