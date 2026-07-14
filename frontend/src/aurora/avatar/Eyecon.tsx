"use client";
/* <Eyecon> — the student's avatar. Two render paths: a saved LIBRARY pick
   (config.portrait = "<category>/<id>") renders as one pre-baked character tile; otherwise
   the avatar is composited client-side from the config axes — a back→front stack of isolated
   overlays + CSS-multiply colour tints (see layers.ts), over the CSS backdrop from the
   `background` axis. Presentational, hook-free, SSR-safe; a dead image src hides itself so a
   missing asset never shows broken art. */
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

  // A saved library pick is one pre-baked character tile — render it directly.
  if (config?.portrait) {
    return (
      <span role="img" aria-label="Eyecon, your avatar" className={wrap} style={frame}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="eyecon-layer" src={`/avatar/tiles/${config.portrait}.webp`} alt=""
             width={size} height={size}
             onError={(e) => { e.currentTarget.style.display = "none"; }} />
      </span>
    );
  }

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
