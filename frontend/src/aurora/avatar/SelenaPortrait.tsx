/* <SelenaPortrait> — the display surface for a student's Selena (RICOE v2, part 3).
   When the real 3D portrait is ready it shows the generated image, a polished OPAQUE card
   (flash-image bakes its own background — including the `background` axis — since it can't
   emit true alpha). Until then it falls back to the instant SVG <Selena> preview, drawn over
   a CSS backdrop derived from the `background` axis so the live edit still previews the scene.
   Presentational + hook-free, so it renders on the server or client. */
import type { AvatarConfig } from "./axes.generated";
import { Selena } from "./Selena";
import { BG_COLORS, type Background } from "./manifest";

// A few backdrops read as gradients for depth; the rest use the flat BG_COLORS tint.
const BG_GRADIENTS: Partial<Record<string, string>> = {
  gemini: "linear-gradient(135deg,#c9c2f5,#eae6fb 55%,#f6d9c4)",
  galaxy: "radial-gradient(circle at 32% 26%,#3a2b63,#241b3c 72%)",
  sunset: "linear-gradient(160deg,#fbdcc4,#f4ad86)",
  ocean: "linear-gradient(160deg,#d8eef6,#bfe0ef)",
  confetti: "radial-gradient(circle at 30% 20%,#fbe3eb,#fbf0f4)",
  sun: "linear-gradient(160deg,#fef2d4,#fbe6b0)",
};

function backdrop(bg?: string): string {
  if (bg && BG_GRADIENTS[bg]) return BG_GRADIENTS[bg]!;
  return bg && bg in BG_COLORS ? BG_COLORS[bg as Background] : "transparent";
}

export function SelenaPortrait({
  config,
  portraitUrl,
  portraitStatus,
  size = 220,
  className,
}: {
  config?: Partial<AvatarConfig>;
  portraitUrl?: string | null;
  portraitStatus?: string;
  size?: number;
  className?: string;
}) {
  const ready = portraitStatus === "ready" && !!portraitUrl;
  const h = Math.round((size * 260) / 240);
  return (
    <span
      className={`selena-portrait${className ? " " + className : ""}`}
      data-ready={ready || undefined}
      // The ready image is opaque (backdrop baked in) → no CSS backdrop; the SVG preview
      // is transparent → show the axis backdrop behind it.
      style={{ width: size, height: h, background: ready ? undefined : backdrop(config?.background) }}
    >
      {ready ? (
        // eslint-disable-next-line @next/next/no-img-element -- generated portrait, no next/image on standalone
        <img className="selena-portrait-img" src={portraitUrl!} alt="Your Selena" width={size} height={h} />
      ) : (
        <Selena config={config} size={size} />
      )}
      {portraitStatus === "pending" && (
        <span className="selena-portrait-badge" role="status">✨ rendering your 3D Selena…</span>
      )}
    </span>
  );
}
