"use client";
/* <Eyecon> — the student's avatar. Three render paths, in order:
   1. a saved LIBRARY pick (config.portrait = "<category>/<id>") → one pre-baked character tile;
   2. a never-customized account (no pick, every composited axis still default) → the polished
      iris.png mascot — NOT the compositor, whose layer art is misregistered and rendered a
      distorted eye that looked nothing like the default on the leaderboard;
   3. a genuinely axis-customized config (no pick) → composited client-side from the axes: a
      back→front stack of isolated overlays + CSS-multiply colour tints (see layers.ts).
   All over the CSS backdrop from the `background` axis. Presentational, hook-free, SSR-safe;
   a dead image src hides itself so a missing asset never shows broken art. */
import type { CSSProperties } from "react";
import type { AvatarConfig } from "./axes.generated";
import { DEFAULT_AVATAR } from "./axes.generated";
import { backdropCss } from "./backdrops";
import { eyeconLayers } from "./layers";

/** The canonical default mascot (the homepage Iris) — what an un-customized Eyecon shows. */
const IRIS_SRC = "/brand/iris.png";

/** Axes the compositor actually draws a character from (`background` is only the backdrop). */
const LOOK_AXES = ["bodyColor", "irisColor", "eyeShape", "topper", "accessory", "outfit"] as const;

/** True when there's no library pick AND every composited axis is still its default — i.e. a
 *  never-customized account. Such a config renders the iris.png mascot instead of the (broken)
 *  compositor. A config with any non-default look axis still composites (see path 3). */
function isDefaultLook(c?: Partial<AvatarConfig> | null): boolean {
  if (c?.portrait) return false;
  return LOOK_AXES.every((k) => (c?.[k] ?? DEFAULT_AVATAR[k]) === DEFAULT_AVATAR[k]);
}

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

  // A never-customized account is the canonical default mascot — render the polished iris.png,
  // never the compositor (its misregistered layer art drew the distorted default eye).
  if (isDefaultLook(config)) {
    return (
      <span role="img" aria-label="Eyecon, your avatar" className={wrap} style={frame}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="eyecon-layer" src={IRIS_SRC} alt="" width={size} height={size}
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
