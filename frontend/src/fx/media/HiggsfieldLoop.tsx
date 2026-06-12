"use client";
/* PHOTOPIC · Higgsfield cinematic loop
 * Poster paints immediately; the video element is only created once the slot
 * scrolls into view, cross-fades in on canplay, and pauses off-screen.
 * Reduced motion or save-data: poster only, no video element ever.
 * No loop in the library for this context: renders nothing (layout owns
 * any fallback).
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useFx } from "../MotionProvider";
import { loopFor, useMediaManifest } from "@/lib/media/client";
import type { NavContext } from "@/lib/media/types";

function saveData(): boolean {
  if (typeof navigator === "undefined") return false;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !!conn?.saveData;
}

export function HiggsfieldLoop({
  context,
  style,
  className,
}: {
  context: NavContext;
  style?: CSSProperties;
  className?: string;
}) {
  const { reducedMotion } = useFx();
  const { data } = useMediaManifest();
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  const loop = loopFor(data, context);
  const posterOnly = reducedMotion || saveData() || failed;

  useEffect(() => {
    const el = hostRef.current;
    if (!el || posterOnly) return;
    const io = new IntersectionObserver(
      (entries) => setInView(entries[0].isIntersecting),
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [posterOnly]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (inView) void v.play().catch(() => setFailed(true));
    else v.pause();
  }, [inView, playing]);

  if (!loop) return null;

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={className}
      style={{ position: "relative", overflow: "hidden", ...style }}
    >
      {loop.poster && (
        <img
          src={loop.poster}
          alt=""
          draggable={false}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
      {/* skeleton shimmer until the stream is ready */}
      {!posterOnly && !playing && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(100deg, transparent 30%, rgba(60,144,255,0.06) 50%, transparent 70%)",
            backgroundSize: "220% 100%",
            animation: "hl-shimmer 1.6s ease-in-out infinite",
          }}
        />
      )}
      {!posterOnly && inView && (
        <video
          ref={videoRef}
          src={loop.src}
          poster={loop.poster ?? undefined}
          muted
          loop
          playsInline
          preload="none"
          onCanPlay={() => setPlaying(true)}
          onError={() => setFailed(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: playing ? 1 : 0,
            transition: "opacity 800ms ease",
          }}
        />
      )}
      <style>{`@keyframes hl-shimmer { from { background-position: 160% 0; } to { background-position: -60% 0; } }`}</style>
    </div>
  );
}
