"use client";
/* PrismStage — the simplified Flashcards centerpiece. A hand-built SVG in the
   refined "atlas" spirit of Virtual Patients, but a different motif: a single
   white beam enters a glass prism and disperses into a soft spectrum (optics,
   not an eye). It ties to the "Clarity / Depth / Lens" stepper language —
   bringing knowledge into focus and splitting it into its parts.

   Exposes launch(): a brief spectral light-flood used as the transition into
   the deck (resolves instantly under reduced motion, so it's safe there too). */
import { forwardRef, useImperativeHandle, useState } from "react";

export interface PrismStageHandle {
  /** A spectral flood blooms from the prism to cover the view — the launch. */
  launch(): Promise<void>;
}

function prefersReduced(): boolean {
  if (typeof window === "undefined") return false;
  return (
    document.documentElement.dataset.motion === "reduce" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export const PrismStage = forwardRef<PrismStageHandle>(function PrismStage(_props, ref) {
  const [flooding, setFlooding] = useState(false);

  useImperativeHandle(ref, () => ({
    launch: () => {
      if (prefersReduced()) return Promise.resolve();
      setFlooding(true);
      return new Promise<void>((resolve) => setTimeout(resolve, 600));
    },
  }), []);

  return (
    <div className="prism-stage">
      <svg className="prism-svg" viewBox="0 0 680 520" role="img"
        aria-label="A beam of white light passing through a glass prism and dispersing into a spectrum">
        <defs>
          <linearGradient id="prismGlass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(190,205,255,0.20)" />
            <stop offset="55%" stopColor="rgba(140,160,230,0.06)" />
            <stop offset="100%" stopColor="rgba(120,140,220,0.02)" />
          </linearGradient>
          <linearGradient id="prismSpectrum" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff5e6c" />
            <stop offset="18%" stopColor="#ff9f45" />
            <stop offset="36%" stopColor="#ffe14d" />
            <stop offset="54%" stopColor="#5ee08a" />
            <stop offset="72%" stopColor="#43d6e0" />
            <stop offset="100%" stopColor="#8b7bff" />
          </linearGradient>
          <radialGradient id="prismHalo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(150,170,255,0.22)" />
            <stop offset="100%" stopColor="rgba(150,170,255,0)" />
          </radialGradient>
          <filter id="prismBlur" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          <filter id="prismSoft" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>

        {/* Ambient halo behind the prism */}
        <circle className="prism-halo" cx="300" cy="250" r="210" fill="url(#prismHalo)" />

        {/* Dispersed spectrum — a soft blurred wedge plus crisp colour rays */}
        <g className="prism-spectrum">
          <polygon points="352,250 680,150 680,360" fill="url(#prismSpectrum)" opacity="0.45" filter="url(#prismBlur)" />
          <g strokeWidth="2.4" fill="none" filter="url(#prismSoft)" strokeLinecap="round">
            <path d="M352,250 L680,168" stroke="#ff5e6c" />
            <path d="M352,250 L680,196" stroke="#ff9f45" />
            <path d="M352,250 L680,224" stroke="#ffe14d" />
            <path d="M352,250 L680,256" stroke="#5ee08a" />
            <path d="M352,250 L680,292" stroke="#43d6e0" />
            <path d="M352,250 L680,332" stroke="#8b7bff" />
          </g>
        </g>

        {/* Incoming white beam → left face of the prism */}
        <g className="prism-beam">
          <line x1="40" y1="214" x2="250" y2="236" stroke="rgba(255,255,255,0.5)" strokeWidth="9" filter="url(#prismBlur)" />
          <line x1="40" y1="214" x2="252" y2="236" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
        </g>

        {/* The glass prism */}
        <g className="prism-glass">
          <polygon points="300,118 206,330 394,330" fill="url(#prismGlass)"
            stroke="rgba(205,218,255,0.55)" strokeWidth="1.6" strokeLinejoin="round" />
          {/* lit left edge + inner refracted streak */}
          <line x1="300" y1="118" x2="206" y2="330" stroke="rgba(230,238,255,0.85)" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="250" y1="236" x2="352" y2="250" stroke="rgba(255,255,255,0.30)" strokeWidth="1.4" strokeLinecap="round" />
          <polygon points="300,118 206,330 252,300" fill="rgba(255,255,255,0.05)" />
        </g>
      </svg>

      <div className={`prism-flood${flooding ? " is-on" : ""}`} aria-hidden />
    </div>
  );
});
