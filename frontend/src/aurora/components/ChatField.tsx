"use client";
/* ChatField — the live electric constellation behind the tutor thread. A self-contained
   <canvas> particle field (drifting nodes + proximity links) in electric indigo, sized to
   its parent .aurora-chat. Vanilla rAF (no GSAP — MotionProvider isn't mounted), client-only
   so it never touches the server event loop, and frozen to a single static frame under
   reduced motion. */
import { useEffect, useRef } from "react";

type Pt = { x: number; y: number; vx: number; vy: number };

export function ChatField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.getAttribute("data-motion") === "reduce";

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const LINK = 96;
    let W = 0;
    let H = 0;
    let raf = 0;
    let pts: Pt[] = [];

    const size = () => {
      const r = canvas.getBoundingClientRect();
      W = r.width;
      H = r.height;
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const init = () => {
      const n = Math.min(72, Math.max(18, Math.round((W * H) / 14000)));
      pts = Array.from({ length: n }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
      }));
    };

    const render = () => {
      ctx.clearRect(0, 0, W, H);
      for (let a = 0; a < pts.length; a++) {
        for (let b = a + 1; b < pts.length; b++) {
          const dx = pts[a].x - pts[b].x;
          const dy = pts[a].y - pts[b].y;
          const d = Math.hypot(dx, dy);
          if (d < LINK) {
            ctx.strokeStyle = `rgba(91, 91, 255, ${0.15 * (1 - d / LINK)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pts[a].x, pts[a].y);
            ctx.lineTo(pts[b].x, pts[b].y);
            ctx.stroke();
          }
        }
      }
      ctx.fillStyle = "rgba(91, 91, 255, 0.5)";
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const loop = () => {
      for (const p of pts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
      }
      render();
      raf = requestAnimationFrame(loop);
    };

    size();
    init();
    if (reduce) render();
    else loop();

    const onResize = () => {
      size();
      init();
      if (reduce) render();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={ref} className="aurora-chat-field" aria-hidden="true" />;
}
