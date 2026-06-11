/* DARK ADAPTATION · LiquidImage gate (NO three.js imports here)
 * Decides eligibility before the WebGL chunk is even fetched: touch
 * devices, low-tier hardware, and reduced-motion users get the plain
 * <img> and never pay for three.js.
 */
import { lazy, Suspense, type CSSProperties } from "react";
import { useFx } from "../MotionProvider";
import type { LiquidImageProps } from "./LiquidImage";

const Inner = lazy(() => import("./LiquidImage"));

function PlainImage({ src, alt, className, style, imgClassName, imgStyle }: LiquidImageProps) {
  return (
    <div
      className={className}
      style={{ position: "relative", overflow: "hidden", display: "block", ...style }}
    >
      <img
        src={src}
        alt={alt ?? ""}
        loading="lazy"
        className={imgClassName}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", ...imgStyle }}
      />
    </div>
  );
}

export function LiquidImage(props: LiquidImageProps) {
  const { tier, finePointer, reducedMotion } = useFx();
  const eligible = tier === "high" && finePointer && !reducedMotion;
  if (!eligible) return <PlainImage {...props} />;
  return (
    <Suspense fallback={<PlainImage {...props} />}>
      <Inner {...props} />
    </Suspense>
  );
}

export type { LiquidImageProps, CSSProperties as LiquidImageStyle };
