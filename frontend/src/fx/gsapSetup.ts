"use client";
/* PHOTOPIC · GSAP bootstrap — imported once from app/providers.tsx.
 * Registers plugins and binds the global reduced-motion kill-switch.
 * ScrollTrigger + SplitText ship free with gsap@3.13+. */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

/* Lenis drives scroll position between frames — GSAP must not try to smooth
 * over dropped frames or the two clocks fight. */
gsap.ticker.lagSmoothing(0);

/* Hard kill-switch: OS-level reduced motion OR the user's in-app toggle
 * (html[data-motion="off"], set by MotionProvider). Tweens registered through
 * gsap.matchMedia in components pick this up automatically. */
export const MOTION_OK =
  "(prefers-reduced-motion: no-preference) and (min-width: 0px)";

export { gsap, ScrollTrigger, SplitText, useGSAP };
