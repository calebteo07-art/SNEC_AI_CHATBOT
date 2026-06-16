"use client";
/* The Aperture iris centerpiece. Always renders a pure-CSS iris; layers the
   medically-correct Nano Banana raster on top when present (onError hides it).
   `launching` plays the dilation that fills the screen on "Open". */
import { useState } from "react";
import { PLATE } from "@/aurora/media";

export function ApertureStage({
  size = 240, launching = false,
}: { size?: number; launching?: boolean }) {
  const [hasRaster, setHasRaster] = useState(true);
  return (
    <div className={`aperture-stage${launching ? " aperture-launching" : ""}`}>
      <div className="aperture-iris" style={{ ["--iris-size" as string]: `${size}px` }}>
        <div className="aperture-limbus" aria-hidden />
        <div className="aperture-iris-css" aria-hidden />
        {hasRaster && (
          <img
            className="aperture-iris-raster"
            src={PLATE.aperture}
            alt=""
            aria-hidden
            onError={() => setHasRaster(false)}
          />
        )}
      </div>
    </div>
  );
}
