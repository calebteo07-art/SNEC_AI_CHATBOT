"use client";
/* AtlasMap — the Virtual Patients navigator, "the Living Eye". The hero is a
   single Nano-Banana plate fusing a medically-correct SAGITTAL cross-section
   (cornea → iris → lens → vitreous → optic disc → macula) with a circular
   ophthalmoscopic FUNDUS inset. A normally-invisible overlay of region pins
   sits on the real structures; clicking a pin filters the patient journey to
   that part of the eye and reveals a short teaching readout. The hand-built SVG
   cross-section stays mounted underneath and shows automatically if the plate
   image is missing — generation never blocks the screen.

   Stable for the case-list smoke test: `.aurora-atlas-plate`, and `.aurora-pin`
   buttons whose text contains the region label (e.g. "Optic disc"). */
import { useState } from "react";

export type RegionId = "all" | "cornea" | "iris" | "lens" | "optic" | "macula" | "retina";

type Side = "up" | "down" | "left" | "right";

export const REGIONS: {
  id: Exclude<RegionId, "all">;
  label: string;
  pos: { top: string; left: string };
  side: Side;
  posterior?: boolean;
  keywords: string[];
}[] = [
  { id: "cornea", label: "Cornea", pos: { top: "44%", left: "17%" }, side: "down", keywords: ["cornea", "anterior", "keratit", "conjunctiv", "dry eye", "abrasion", "red eye"] },
  { id: "iris", label: "Iris & pupil", pos: { top: "39%", left: "28%" }, side: "up", keywords: ["iris", "pupil", "uveitis", "chamber", "angle"] },
  { id: "lens", label: "Lens", pos: { top: "52%", left: "35%" }, side: "down", keywords: ["lens", "cataract", "biometry", "phaco"] },
  { id: "optic", label: "Optic disc", pos: { top: "42%", left: "76%" }, side: "right", posterior: true, keywords: ["optic", "glaucoma", "disc", "iop", "pressure", "nerve"] },
  { id: "macula", label: "Macula", pos: { top: "51%", left: "78%" }, side: "right", posterior: true, keywords: ["macula", "amd", "oct", "dmo", "drusen"] },
  { id: "retina", label: "Peripheral retina", pos: { top: "84%", left: "59%" }, side: "down", posterior: true, keywords: ["retina", "floater", "detachment", "diabetic", "vitreous", "flash"] },
];

/* One-line clinical teaching note per region — surfaced in the readout when a
   region is active (in-UI explanation; helps students learn while they explore). */
const READOUT: Record<Exclude<RegionId, "all">, string> = {
  cornea: "The clear front window does most of the eye's focusing — abrasions, infection and dry eye live here.",
  iris: "The iris sets pupil size and guards the drainage angle — think uveitis and angle-closure.",
  lens: "The lens fine-tunes focus; when it clouds, that's a cataract.",
  optic: "Where ~1.2 million nerve fibres exit the eye — the disc is where glaucoma leaves its mark.",
  macula: "Your pinpoint of sharp central vision — AMD and diabetic macular oedema strike here.",
  retina: "The light-catching lining of the periphery — tears, detachment and floaters begin here.",
};

function FundusSvg() {
  // Hand-built fallback fundus: warm retina, optic disc, macula, vessel arcades.
  return (
    <svg viewBox="0 0 100 100" className="aurora-scope-svg" aria-hidden>
      <defs>
        <radialGradient id="fundusFill" cx="50%" cy="50%" r="62%">
          <stop offset="0%" stopColor="#E8915A" /><stop offset="60%" stopColor="#C75B36" /><stop offset="100%" stopColor="#7E2E1B" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="50" fill="url(#fundusFill)" />
      <ellipse cx="64" cy="42" rx="10" ry="12" fill="#FBD9A6" />
      <ellipse cx="64" cy="42" rx="4.5" ry="6" fill="#E89B57" />
      <ellipse cx="40" cy="54" rx="9" ry="7" fill="#5E2113" opacity="0.5" />
      <g stroke="#8E2E1A" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.85">
        <path d="M62,52 Q44,66 26,80" /><path d="M66,50 Q52,70 40,88" />
        <path d="M62,34 Q46,22 28,14" /><path d="M68,36 Q60,20 54,6" />
      </g>
    </svg>
  );
}

/* The hand-built sagittal cross-section — the graceful fallback shown when the
   generated plate is absent or fails to load. preserveAspectRatio "slice" so it
   fills the 4:3 plate the same way the raster does. */
function CrossSectionSvg() {
  return (
    <svg className="aurora-atlas-svg" viewBox="0 0 600 470" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Cross-section of the human eye showing cornea, iris, lens, vitreous, retina, macula and optic disc">
      <defs>
        <radialGradient id="eyeSclera" cx="42%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#FCFBF6" /><stop offset="70%" stopColor="#EFEBE0" /><stop offset="100%" stopColor="#D9D3C4" />
        </radialGradient>
        <radialGradient id="eyeVitreous" cx="58%" cy="50%" r="60%">
          <stop offset="0%" stopColor="rgba(150,182,236,.30)" /><stop offset="55%" stopColor="rgba(120,150,220,.12)" /><stop offset="100%" stopColor="rgba(120,150,220,0)" />
        </radialGradient>
        <linearGradient id="eyeIris" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4285F4" /><stop offset="52%" stopColor="#9B72CB" /><stop offset="100%" stopColor="#D96570" />
        </linearGradient>
        <radialGradient id="eyeLens" cx="42%" cy="40%" r="72%">
          <stop offset="0%" stopColor="rgba(255,255,255,.95)" /><stop offset="46%" stopColor="rgba(214,228,252,.78)" /><stop offset="100%" stopColor="rgba(150,176,232,.55)" />
        </radialGradient>
        <linearGradient id="eyeCornea" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(168,212,255,.42)" /><stop offset="100%" stopColor="rgba(120,168,240,.06)" />
        </linearGradient>
        <linearGradient id="eyeNerve" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F4E9C6" /><stop offset="100%" stopColor="#E2CB92" />
        </linearGradient>
        <radialGradient id="eyeAmbient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(133,120,220,.34)" /><stop offset="100%" stopColor="rgba(133,120,220,0)" />
        </radialGradient>
        <linearGradient id="eyeRay" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(255,246,214,0)" /><stop offset="40%" stopColor="rgba(255,243,206,.55)" /><stop offset="100%" stopColor="rgba(255,236,180,0)" />
        </linearGradient>
        <radialGradient id="eyeDisc" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="#FFF0DC" /><stop offset="100%" stopColor="#F0B98A" />
        </radialGradient>
      </defs>

      <ellipse cx="300" cy="240" rx="250" ry="210" fill="url(#eyeAmbient)" />

      <path d="M455,196 L560,120 L584,150 L470,230 Z" fill="url(#eyeNerve)" opacity="0.95" />
      <path d="M455,196 L560,120" stroke="rgba(190,70,70,.5)" strokeWidth="2" />
      <path d="M463,213 L572,135" stroke="rgba(170,90,60,.25)" strokeWidth="1.2" />

      <circle cx="300" cy="240" r="190" fill="url(#eyeSclera)" stroke="rgba(255,255,255,.14)" strokeWidth="1" />
      <circle cx="300" cy="240" r="168" fill="url(#eyeVitreous)" />

      <path d="M150.4,147.4 A 174,174 0 1 1 150.4,332.6" fill="none" stroke="#F7DCC6" strokeWidth="9" strokeLinecap="round" />
      <path d="M146,138 A 183,183 0 1 1 146,342" fill="none" stroke="#C76E76" strokeWidth="6" strokeLinecap="round" opacity="0.82" />

      <polygon points="190,235 466,239.5 466,240.5 190,245" fill="url(#eyeRay)" />

      <ellipse cx="466" cy="240" rx="15" ry="22" fill="#B4584F" opacity="0.55" />
      <circle cx="467" cy="240" r="4.5" fill="#7E3A33" />
      <ellipse cx="458" cy="198" rx="12" ry="17" fill="url(#eyeDisc)" stroke="rgba(190,120,70,.5)" strokeWidth="1" />

      <path d="M150,148 Q120,240 150,332 Q175,300 185,274 L185,206 Q175,180 150,148 Z" fill="rgba(176,206,246,.16)" />
      <path d="M150,150 Q176,178 186,206 L181,210 Q168,184 146,158 Z" fill="url(#eyeIris)" />
      <path d="M150,330 Q176,302 186,274 L181,270 Q168,296 146,322 Z" fill="url(#eyeIris)" />
      <path d="M152,156 L150,148 L160,162 Z" fill="#9B72CB" />
      <path d="M152,324 L150,332 L160,318 Z" fill="#9B72CB" />
      <g stroke="rgba(255,255,255,.4)" strokeWidth="1">
        <line x1="158" y1="160" x2="206" y2="196" /><line x1="160" y1="168" x2="208" y2="204" />
        <line x1="158" y1="320" x2="206" y2="284" /><line x1="160" y1="312" x2="208" y2="276" />
      </g>

      <path d="M210,184 Q252,240 210,296 Q170,240 210,184 Z" fill="url(#eyeLens)" stroke="rgba(255,255,255,.5)" strokeWidth="1" />
      <path d="M198,204 Q188,240 198,276" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1.5" strokeLinecap="round" />

      <path d="M150,148 Q66,240 150,332 Q104,240 150,148 Z" fill="url(#eyeCornea)" stroke="rgba(180,220,255,.5)" strokeWidth="1.4" />
      <path d="M120,196 Q86,240 120,286" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="1.6" strokeLinecap="round" />

      <path d="M185,206 L185,274 Q181,240 185,206 Z" stroke="#05060F" strokeWidth="5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function AtlasMap({
  activeRegion,
  onRegion,
  plateSrc,
  counts,
}: {
  activeRegion: RegionId;
  onRegion: (region: RegionId) => void;
  /** Generated combined plate (cross-section + fundus). Falls back to SVG if absent. */
  plateSrc?: string;
  /** Patients per region — rendered as a small badge on each pin. */
  counts?: Partial<Record<Exclude<RegionId, "all">, number>>;
}) {
  const [plateFailed, setPlateFailed] = useState(false);
  const activeDef = REGIONS.find((r) => r.id === activeRegion);
  const showPhoto = !!plateSrc && !plateFailed;

  return (
    <div className="aurora-atlas">
      <div className="aurora-atlas-plate" data-photo={showPhoto}>
        <span className="aurora-atlas-tag"><b>THE LIVING EYE</b> · sagittal section, right eye</span>
        <span className="aurora-atlas-axis">VISUAL AXIS →</span>

        {/* Hand-built cross-section: the fallback, always mounted underneath. */}
        <CrossSectionSvg />

        {/* Generated hero plate on top (hidden via CSS until it loads cleanly). */}
        {showPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={plateSrc}
            alt="Sagittal cross-section of the eye fused with an ophthalmoscopic fundus view"
            className="aurora-atlas-photo"
            onError={() => setPlateFailed(true)}
          />
        )}

        {activeDef && (
          <span className="aurora-atlas-focus" style={{ top: activeDef.pos.top, left: activeDef.pos.left }} aria-hidden />
        )}

        {REGIONS.map((r) => {
          const active = activeRegion === r.id;
          const n = counts?.[r.id];
          return (
            <button
              key={r.id}
              type="button"
              className="aurora-pin"
              data-active={active}
              data-side={r.side}
              data-empty={n === 0}
              aria-pressed={active}
              style={{ top: r.pos.top, left: r.pos.left }}
              onClick={() => onRegion(active ? "all" : r.id)}
            >
              <span className="aurora-pin-dot" />
              <span className="aurora-pin-label">
                {r.label}
                {n != null && n > 0 && <i className="aurora-pin-count">{n}</i>}
              </span>
            </button>
          );
        })}
      </div>

      {/* Teaching readout — replaces the separate porthole; the fundus now lives
          inside the plate. Updates as the student explores. */}
      <div className="aurora-atlas-readout" data-focus={!!activeDef}>
        <span className="aurora-atlas-readout-scope" aria-hidden><FundusSvg /></span>
        <div className="aurora-atlas-readout-body">
          <span className="aurora-atlas-readout-k">{activeDef ? activeDef.label : "Through the ophthalmoscope"}</span>
          <p className="aurora-atlas-readout-text">
            {activeDef ? READOUT[activeDef.id] : "Pick a part of the eye to focus the view and meet its patients."}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Does a case (by topic + title text) belong to a region? */
export function caseInRegion(text: string, region: RegionId): boolean {
  if (region === "all") return true;
  const def = REGIONS.find((r) => r.id === region);
  if (!def) return true;
  const hay = text.toLowerCase();
  return def.keywords.some((k) => hay.includes(k));
}
