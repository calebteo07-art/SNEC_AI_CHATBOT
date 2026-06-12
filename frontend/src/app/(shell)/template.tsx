"use client";
/* PHOTOPIC · route-enter choreography
 * Templates remount on every child navigation — the App Router's enter hook.
 * Accommodation, in daylight: the incoming page settles into focus (rise +
 * fade). Exit animations don't exist in the App Router; the Tier-1 shutter
 * covers marquee transitions.
 */
import { useRef, type ReactNode } from "react";
import { gsap, useGSAP } from "@/fx/gsapSetup";

export default function ShellTemplate({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        if (document.documentElement.getAttribute("data-motion") === "off") return;
        gsap.fromTo(
          ref.current,
          { autoAlpha: 0, y: 14 },
          { autoAlpha: 1, y: 0, duration: 0.55, ease: "power3.out", clearProps: "all" },
        );
      });
    },
    { scope: ref },
  );

  return (
    <div ref={ref} style={{ minHeight: "100%" }}>
      {children}
    </div>
  );
}
