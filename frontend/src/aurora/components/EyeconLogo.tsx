/* EyeconLogo — the living EyeBot mascot mark (logo→raster brief). Two stacked
   rasters: the rest frame (the homepage iris.png) + one paid pose that cross-fades
   in on a CSS beat, plus an optional live "EyeBot" wordmark. Motion is CSS-only
   (brand-mascot.css) and freezes to the static rest frame under reduced motion.
   Callers size the mark via `size` (inline) or a sizing className (e.g. hm-iris).
   The brand mark is always the DEFAULT Eyecon, never a student's custom avatar. */
import { useState } from "react";

type Motion = "hello" | "groove" | "idle";
type PoseId = "rest" | "wave" | "cheer" | "groove";

const POSE_SRC: Record<PoseId, string> = {
  rest: "/brand/iris.png",
  wave: "/brand/poses/wave.webp",
  cheer: "/brand/poses/cheer.webp",
  groove: "/brand/poses/groove.webp",
};
// which paid pose each motion cross-fades to on its beat
const SWAP_FOR: Record<Motion, PoseId> = { hello: "wave", groove: "groove", idle: "cheer" };

export function EyeconLogo({
  motion = "idle",
  size,
  circle = false,
  withWordmark = false,
  wordTone = "ink",
  className = "",
}: {
  motion?: Motion;
  size?: number;
  circle?: boolean;
  withWordmark?: boolean;
  wordTone?: "ink" | "white";
  className?: string;
}) {
  const [swapOk, setSwapOk] = useState(true);
  const swap = SWAP_FOR[motion];
  const dim = size ? { width: size, height: size } : undefined;
  return (
    <span
      className={`eyecon-logo${circle ? " is-circle" : ""} ${className}`.trim()}
      style={dim}
      data-motion={motion}
      data-swap={swapOk ? "on" : "off"}
      data-testid="eyecon-logo"
    >
      <span className="eyecon-logo-stage" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="eyecon-logo-img eyecon-logo-rest" src={POSE_SRC.rest} alt="" />
        {swapOk && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="eyecon-logo-img eyecon-logo-swap"
            src={POSE_SRC[swap]}
            alt=""
            onError={() => setSwapOk(false)}
          />
        )}
      </span>
      {withWordmark && (
        <span className={`eyecon-logo-wm${wordTone === "white" ? " is-white" : ""}`}>EyeBot</span>
      )}
    </span>
  );
}
