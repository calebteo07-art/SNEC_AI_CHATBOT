"use client";
/* The Aperture centerpiece reuses the LOGIN screen's living eye (EyeHero) verbatim
   — the same macro-eye photograph and the same motion: cursor-gaze parallax, idle
   wander, and a breathing zoom. On "Open" the pupil engulf (light flood) plays,
   exactly like the login's success transition. */
import { forwardRef, useImperativeHandle, useRef } from "react";
import { EyeHero, type GazeHandle } from "@/screens/EyeHero";

export interface ApertureStageHandle {
  /** Floods the viewport from the pupil (login's engulf) — used as the launch. */
  expandPupil(): Promise<void>;
}

export const ApertureStage = forwardRef<ApertureStageHandle, { size?: number }>(
  function ApertureStage({ size = 240 }, ref) {
    const eye = useRef<GazeHandle>(null);
    useImperativeHandle(ref, () => ({
      expandPupil: () => eye.current?.expandPupil() ?? Promise.resolve(),
    }), []);
    return (
      <div className="aperture-stage" style={{ ["--iris-size" as string]: `${size}px` }}>
        <EyeHero ref={eye} />
      </div>
    );
  },
);
