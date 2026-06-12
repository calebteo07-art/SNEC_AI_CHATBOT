"use client";
/* PHOTOPIC · magnetic pull (GSAP quickTo)
 * Interface elements lean toward the cursor like iron filings — a few
 * pixels of attraction, gone the moment the pointer leaves. The internal
 * content shifts toward the pointer to acknowledge focus.
 * Inert on touch and under reduced motion.
 */
import { useRef, type CSSProperties, type ReactNode } from "react";
import { gsap, useGSAP } from "../gsapSetup";
import { useFx } from "../MotionProvider";

const MAX_SHIFT = 8; // px — subtle acknowledgement, never displacement

interface MagneticProps {
  children: ReactNode;
  /** Fraction of the pointer offset transferred to the element. */
  strength?: number;
  className?: string;
  style?: CSSProperties;
}

export function Magnetic({ children, strength = 0.3, style, ...rest }: MagneticProps) {
  const { finePointer, reducedMotion } = useFx();
  const ref = useRef<HTMLSpanElement>(null);
  const toX = useRef<((v: number) => void) | null>(null);
  const toY = useRef<((v: number) => void) | null>(null);

  useGSAP(
    () => {
      if (!ref.current || !finePointer || reducedMotion) return;
      toX.current = gsap.quickTo(ref.current, "x", { duration: 0.4, ease: "power3.out" });
      toY.current = gsap.quickTo(ref.current, "y", { duration: 0.4, ease: "power3.out" });
    },
    { dependencies: [finePointer, reducedMotion], scope: ref },
  );

  if (!finePointer || reducedMotion) {
    return (
      <span style={{ display: "inline-block", ...style }} {...rest}>
        {children}
      </span>
    );
  }

  const clamp = (v: number) => Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, v));

  return (
    <span
      ref={ref}
      style={{ display: "inline-block", willChange: "transform", ...style }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        toX.current?.(clamp((e.clientX - (r.left + r.width / 2)) * strength));
        toY.current?.(clamp((e.clientY - (r.top + r.height / 2)) * strength));
      }}
      onPointerLeave={() => {
        toX.current?.(0);
        toY.current?.(0);
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
