"use client";
/* AtlasMap — the Cases centrepiece. A realistic eye in a dark plate with
   anatomical region pins; the active region glows in the Gemini gradient and
   filters the case list. Until Nano Banana imagery lands (Phase 8) the plate
   shows a CSS iris placeholder. */

export type RegionId = "all" | "cornea" | "iris" | "lens" | "optic" | "macula" | "retina";

export const REGIONS: { id: Exclude<RegionId, "all">; label: string; pos: { top: string; left: string }; keywords: string[] }[] = [
  { id: "cornea", label: "Cornea & anterior", pos: { top: "50%", left: "15%" }, keywords: ["cornea", "anterior", "keratit", "conjunctiv", "dry eye", "abrasion", "red eye"] },
  { id: "iris", label: "Iris & pupil", pos: { top: "27%", left: "36%" }, keywords: ["iris", "pupil", "uveitis", "chamber", "angle"] },
  { id: "lens", label: "Lens", pos: { top: "72%", left: "33%" }, keywords: ["lens", "cataract", "biometry", "phaco"] },
  { id: "optic", label: "Optic disc", pos: { top: "28%", left: "69%" }, keywords: ["optic", "glaucoma", "disc", "iop", "pressure", "nerve"] },
  { id: "macula", label: "Macula", pos: { top: "53%", left: "85%" }, keywords: ["macula", "amd", "oct", "dmo", "drusen"] },
  { id: "retina", label: "Peripheral retina", pos: { top: "77%", left: "67%" }, keywords: ["retina", "floater", "detachment", "diabetic", "vitreous", "flash"] },
];

export function AtlasMap({
  activeRegion,
  onRegion,
  imageSrc,
}: {
  activeRegion: RegionId;
  onRegion: (region: RegionId) => void;
  imageSrc?: string;
}) {
  return (
    <div className="aurora-atlas">
      <div className="aurora-atlas-plate">
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageSrc} alt="Anatomical eye atlas" className="aurora-atlas-img" />
        ) : (
          <span className="aurora-atlas-iris" aria-hidden />
        )}

        {REGIONS.map((r) => {
          const active = activeRegion === r.id;
          return (
            <button
              key={r.id}
              type="button"
              className="aurora-pin"
              data-active={active}
              aria-pressed={active}
              style={{ top: r.pos.top, left: r.pos.left }}
              onClick={() => onRegion(active ? "all" : r.id)}
            >
              <span className="aurora-pin-dot" />
              <span className="aurora-pin-label">{r.label}</span>
            </button>
          );
        })}

        <span className="aurora-atlas-tag">{imageSrc ? "ATLAS" : "NANO BANANA"}</span>
      </div>

      <div className="aurora-atlas-foot">
        <button
          type="button"
          className="aurora-region-reset"
          data-active={activeRegion === "all"}
          onClick={() => onRegion("all")}
        >
          All regions
        </button>
        {activeRegion !== "all" && (
          <span className="aurora-atlas-active aurora-clip">
            {REGIONS.find((r) => r.id === activeRegion)?.label}
          </span>
        )}
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
