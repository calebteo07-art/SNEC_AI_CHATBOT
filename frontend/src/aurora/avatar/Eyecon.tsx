/* <Eyecon> — a student's customizable avatar (formerly <Selena>), raster-only.
   Resolution order: (1) the ready AI portrait cutout (the fused look; prod only),
   (2) the representative tile of the config, so a saved look reads as customized even
   without the paid render, (3) the default iris.png mascot. An optional CSS backdrop
   from the `background` axis sits behind it. Presentational + hook-free — renders on
   server or client. */
import type { AvatarConfig } from "./axes.generated";
import { backdropCss } from "./backdrops";
import { representativeTileSrc } from "./representativeTile";

const IRIS_SRC = "/brand/iris.png";

export function Eyecon({
  portraitUrl,
  config,
  background,
  size = 240,
  className,
}: {
  portraitUrl?: string | null;
  config?: Partial<AvatarConfig> | null;
  background?: string;
  size?: number;
  className?: string;
}) {
  const bg = background ?? config?.background;
  const src = portraitUrl || representativeTileSrc(config) || IRIS_SRC;
  return (
    <span
      role="img"
      aria-label="Eyecon, your avatar"
      className={`eyecon-wrap${className ? " " + className : ""}`}
      style={{ width: size, height: size, background: backdropCss(bg) }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- generated raster; no next/image on standalone */}
      <img
        className="eyecon-img"
        src={src}
        alt=""
        width={size}
        height={size}
        onError={(e) => {
          // A dead portrait/tile URL degrades to the default mascot — never broken art.
          if (e.currentTarget.getAttribute("src") !== IRIS_SRC) e.currentTarget.src = IRIS_SRC;
        }}
      />
    </span>
  );
}
