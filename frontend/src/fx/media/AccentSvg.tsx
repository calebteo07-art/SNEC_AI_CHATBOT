"use client";
/* PHOTOPIC · generative accent
 * Renders a library accent for the given context. Always through <img> —
 * even sanitized SVG never executes when rasterized by the image pipeline
 * (defence in depth on top of the fail-closed generation-time sanitizer).
 * Purely decorative: aria-hidden, fades in when loaded, renders nothing
 * when the library has no asset for the context.
 */
import { useState, type CSSProperties } from "react";
import { accentsFor, useMediaManifest } from "@/lib/media/client";
import type { NavContext } from "@/lib/media/types";

export function AccentSvg({
  context,
  style,
  className,
}: {
  context: NavContext;
  style?: CSSProperties;
  className?: string;
}) {
  const { data } = useMediaManifest();
  const [loaded, setLoaded] = useState(false);
  const [accent] = accentsFor(data, context, 1);
  if (!accent) return null;

  return (
    <img
      src={accent.path}
      alt=""
      aria-hidden="true"
      draggable={false}
      onLoad={() => setLoaded(true)}
      className={className}
      style={{
        opacity: loaded ? 1 : 0,
        transition: "opacity 700ms ease",
        pointerEvents: "none",
        userSelect: "none",
        ...style,
      }}
    />
  );
}
