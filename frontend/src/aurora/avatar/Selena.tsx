/* <Selena> — a student's Selena, raster-only (seamless-custom spec, 2026-07-07).
   The custom look is ONE transparent AI render of the whole configuration
   (accessories baked in by the model — never client-side compositing, which was
   rejected). No portrait yet / failed / never customized → the literal homepage
   iris.png. Optional CSS backdrop from the `background` axis sits behind the
   cutout. Presentational + hook-free, renders on server or client. */
import { backdropCss } from "./backdrops";

const IRIS_SRC = "/brand/iris.png";

export function Selena({
  portraitUrl,
  background,
  size = 240,
  className,
}: {
  portraitUrl?: string | null;
  background?: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label="Selena, your avatar"
      className={`selena-wrap${className ? " " + className : ""}`}
      style={{ width: size, height: size, background: backdropCss(background) }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- generated raster; no next/image on standalone */}
      <img
        className="selena-img"
        src={portraitUrl || IRIS_SRC}
        alt=""
        width={size}
        height={size}
        onError={(e) => {
          // A dead portrait URL degrades to the default mascot — never broken art.
          if (e.currentTarget.getAttribute("src") !== IRIS_SRC) e.currentTarget.src = IRIS_SRC;
        }}
      />
    </span>
  );
}
