"use client";
/* PlateWell — a dark rounded well that frames realistic Nano Banana eye imagery.
   Renders a plain <img> when a manifest src is provided; until then a CSS iris
   placeholder with a mono NANO BANANA caption. Imagery is always a plain <img>,
   never a canvas. */
import { useState, type ReactNode } from "react";

export function PlateWell({
  src,
  alt,
  ratio = 1.6,
  caption,
  children,
  className = "",
}: {
  src?: string;
  alt: string;
  ratio?: number;
  caption?: string;
  children?: ReactNode;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`aurora-plate ${className}`} style={{ aspectRatio: String(ratio) }}>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="aurora-plate-img" onError={() => setFailed(true)} />
      ) : (
        <div className="aurora-plate-ph" role="img" aria-label={alt}>
          <span className="aurora-plate-iris" aria-hidden />
          <span className="aurora-plate-tag">NANO BANANA</span>
        </div>
      )}
      {children}
      {caption && <span className="aurora-plate-caption">{caption}</span>}
    </div>
  );
}
