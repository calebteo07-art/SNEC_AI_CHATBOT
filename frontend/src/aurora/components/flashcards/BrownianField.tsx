"use client";
/* BrownianField — a cohesive cool-palette colour field that drifts with Brownian
   motion across its parent (the parent owns the position + blend). Now the activity
   canvas's BACKGROUND layer: large soft blooms wander the whole lavender field and
   read in the margins around the (opaque) card. DOM spots, one RAF loop, transform-
   only. Static + frozen under reduced motion. Decorative. */
import { useEffect, useRef } from "react";

const HUES = [192, 212, 226, 244, 256, 188]; // cyan · blue · blue-indigo · indigo · indigo · cyan — cool-only, echoes the indigo→cyan rim

export function BrownianField({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const reduced =
      document.documentElement.dataset.motion === "reduce" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const W = () => host.clientWidth || 1200;
    const H = () => host.clientHeight || 800;
    type Spot = { el: HTMLSpanElement; r: number; x: number; y: number; vx: number; vy: number };
    const spots: Spot[] = HUES.map((h) => {
      const r = 150 + Math.random() * 110; // big soft blooms for a full-canvas backdrop
      const el = document.createElement("span");
      el.className = "flash-spot";
      el.style.width = el.style.height = `${r * 2}px`;
      el.style.background =
        `radial-gradient(circle, hsl(${h} 80% 66% / .22), hsl(${h} 78% 68% / .06) 52%, transparent 70%)`;
      host.appendChild(el);
      const a = Math.random() * 6.28, sp = 0.6 + Math.random() * 0.9;
      return { el, r, x: Math.random() * W() - r, y: Math.random() * H() - r, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp };
    });
    const draw = (s: Spot) => { s.el.style.transform = `translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px)`; };
    spots.forEach(draw);
    if (reduced) return () => spots.forEach((s) => s.el.remove());

    let raf = 0;
    const tick = () => {
      const w = W(), h = H(), m = 120;       // generous margin — blooms may wander off-canvas a touch
      for (const s of spots) {
        s.vx += (Math.random() - 0.5) * 0.7; s.vy += (Math.random() - 0.5) * 0.7; // gentle jitter
        s.vx *= 0.97; s.vy *= 0.97;
        const sp = Math.hypot(s.vx, s.vy), mx = 2.1;       // calm cap
        if (sp > mx) { s.vx *= mx / sp; s.vy *= mx / sp; }
        s.x += s.vx; s.y += s.vy;
        const cx = s.x + s.r, cy = s.y + s.r;
        if (cx < -m) s.vx = Math.abs(s.vx); else if (cx > w + m) s.vx = -Math.abs(s.vx);
        if (cy < -m) s.vy = Math.abs(s.vy); else if (cy > h + m) s.vy = -Math.abs(s.vy);
        draw(s);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); spots.forEach((s) => s.el.remove()); };
  }, []);

  return <div ref={ref} className={`flash-bg ${className}`} aria-hidden="true" />;
}
