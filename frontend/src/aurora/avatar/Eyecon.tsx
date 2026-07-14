"use client";
/* <Eyecon> — the student's avatar, composited client-side from config. Renders a
   back→front stack of isolated overlays + CSS-multiply colour tints (see layers.ts),
   over the CSS backdrop from the `background` axis. Presentational, hook-free, SSR-safe;
   a dead layer src hides itself so a missing asset never shows broken art. */
import type { CSSProperties } from "react";
import type { AvatarConfig } from "./axes.generated";
import { backdropCss } from "./backdrops";
import { eyeconLayers } from "./layers";

export function Eyecon({
  config,
  background,
  size = 240,
  className,
}: {
  config?: Partial<AvatarConfig> | null;
  background?: string;
  size?: number;
  className?: string;
}) {
  const bg = background ?? config?.background;
  const frame: CSSProperties = { width: size, height: size, background: backdropCss(bg) };
  const wrap = `eyecon-wrap${className ? " " + className : ""}`;

  return (
    <span role="img" aria-label="Eyecon, your avatar" className={wrap} style={frame}>
      {eyeconLayers(config).map((l) =>
        l.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={l.key} className="eyecon-layer" src={l.src} alt="" style={{ zIndex: l.z }}
               onError={(e) => { e.currentTarget.style.display = "none"; }} />
        ) : (
          <span key={l.key} className="eyecon-tint" aria-hidden
                style={{ zIndex: l.z, background: l.color,
                         WebkitMaskImage: `url(${l.maskSrc})`, maskImage: `url(${l.maskSrc})` }} />
        ),
      )}
    </span>
  );
}
