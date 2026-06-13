// AURORA control glyphs — small, legible vector icons for UI controls.
// Realistic eye imagery is reserved for brand/feature art (PlateWell); these
// bespoke glyphs cover close/back/chevron/send/menu/search/attach + an optics
// aperture motif (used for Cases). All inherit `currentColor`.
type IconProps = { size?: number; "aria-label"?: string };

const S = (size = 18) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const Icon = {
  close: (p: IconProps) => (<svg {...S(p.size)} aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>),
  back: (p: IconProps) => (<svg {...S(p.size)} aria-hidden><path d="M15 5l-7 7 7 7" /></svg>),
  chevron: (p: IconProps) => (<svg {...S(p.size)} aria-hidden><path d="M9 6l6 6-6 6" /></svg>),
  send: (p: IconProps) => (<svg {...S(p.size)} aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>),
  menu: (p: IconProps) => (<svg {...S(p.size)} aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>),
  search: (p: IconProps) => (<svg {...S(p.size)} aria-hidden><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>),
  attach: (p: IconProps) => (<svg {...S(p.size)} aria-hidden><path d="M12 5v14M5 12h14" /></svg>),
  // optics motif: aperture (used for Cases)
  aperture: (p: IconProps) => (<svg {...S(p.size)} aria-hidden><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.2" /></svg>),
};
