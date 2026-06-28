"use client";
/* BrownianField — a cohesive cool-palette colour field that drifts with rapid Brownian
   motion inside its parent's lower band (the parent owns the mask + position). DOM spots,
   one RAF loop, transform-only. Static + frozen under reduced motion. Decorative. */
import { useEffect, useRef } from "react";

const HUES = [214, 180, 250, 222, 172, 256]; // blue · teal · indigo, cohesive

export function BrownianField({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const reduced =
      document.documentElement.dataset.motion === "reduce" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const W = () => host.clientWidth || 680;
    const H = () => host.clientHeight || 240;
    type Spot = { el: HTMLSpanElement; r: number; x: number; y: number; vx: number; vy: number };
    const spots: Spot[] = HUES.map((h) => {
      const r = 100 + Math.random() * 55;
      const el = document.createElement("span");
      el.className = "flash-spot";
      el.style.width = el.style.height = `${r * 2}px`;
      el.style.background =
        `radial-gradient(circle, hsl(${h} 80% 60% / .44), hsl(${h} 78% 62% / .08) 56%, transparent 72%)`;
      host.appendChild(el);
      const a = Math.random() * 6.28, sp = 0.8 + Math.random() * 1.2;
      return { el, r, x: Math.random() * W() - r, y: Math.random() * H() - r, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp };
    });
    const draw = (s: Spot) => { s.el.style.transform = `translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px)`; };
    spots.forEach(draw);
    if (reduced) return () => spots.forEach((s) => s.el.remove());

    let raf = 0;
    const tick = () => {
      const w = W(), h = H(), m = 70;
      for (const s of spots) {
        s.vx += (Math.random() - 0.5) * 1.1; s.vy += (Math.random() - 0.5) * 1.1; // rapid jitter
        s.vx *= 0.96; s.vy *= 0.96;
        const sp = Math.hypot(s.vx, s.vy), mx = 3.6;       // rapid cap
        if (sp > mx) { s.vx *= mx / sp; s.vy *= mx / sp; }
        s.x += s.vx; s.y += s.vy;
        const cx = s.x + s.r, cy = s.y + s.r;
        if (cx < -m) s.vx = Math.abs(s.vx); else if (cx > w + m) s.vx = -Math.abs(s.vx);
        if (cy < 0) s.vy = Math.abs(s.vy); else if (cy > h + m) s.vy = -Math.abs(s.vy);
        draw(s);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); spots.forEach((s) => s.el.remove()); };
  }, []);

  return <div ref={ref} className={`flash-bg ${className}`} aria-hidden="true" />;
}
