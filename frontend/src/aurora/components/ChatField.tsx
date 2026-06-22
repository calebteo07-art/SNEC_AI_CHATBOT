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
    const LINK = 122;
    const PR = 168; // pointer-influence radius
    let W = 0;
    let H = 0;
    let raf = 0;
    let pts: Pt[] = [];
    const ptr = { x: -9999, y: -9999, on: false };

    const size = () => {
      const r = canvas.getBoundingClientRect();
      W = r.width;
      H = r.height;
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const init = () => {
      const n = Math.min(132, Math.max(28, Math.round((W * H) / 8600)));
      pts = Array.from({ length: n }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
      }));
    };

    const render = () => {
      ctx.clearRect(0, 0, W, H);

      // Soft electric bloom that follows the pointer.
      if (ptr.on) {
        const g = ctx.createRadialGradient(ptr.x, ptr.y, 0, ptr.x, ptr.y, PR);
        g.addColorStop(0, "rgba(91, 91, 255, 0.13)");
        g.addColorStop(1, "rgba(91, 91, 255, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(ptr.x - PR, ptr.y - PR, PR * 2, PR * 2);
      }

      // Links — denser web, brightened near the pointer.
      for (let a = 0; a < pts.length; a++) {
        for (let b = a + 1; b < pts.length; b++) {
          const dx = pts[a].x - pts[b].x;
          const dy = pts[a].y - pts[b].y;
          const d = Math.hypot(dx, dy);
          if (d < LINK) {
            let alpha = 0.3 * (1 - d / LINK);
            if (ptr.on) {
              const near = Math.min(Math.hypot(pts[a].x - ptr.x, pts[a].y - ptr.y), Math.hypot(pts[b].x - ptr.x, pts[b].y - ptr.y));
              if (near < PR) alpha += 0.4 * (1 - near / PR) * (1 - d / LINK);
            }
            ctx.strokeStyle = `rgba(99, 99, 255, ${alpha})`;
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.moveTo(pts[a].x, pts[a].y);
            ctx.lineTo(pts[b].x, pts[b].y);
            ctx.stroke();
          }
        }
      }

      // Nodes — glowing electric dots, brighter + larger near the pointer.
      ctx.shadowColor = "rgba(91, 91, 255, 0.9)";
      ctx.shadowBlur = 6;
      for (const p of pts) {
        const near = ptr.on && Math.hypot(p.x - ptr.x, p.y - ptr.y) < PR;
        ctx.fillStyle = near ? "rgba(150, 150, 255, 0.95)" : "rgba(99, 99, 255, 0.72)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, near ? 2.4 : 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
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
    const onPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      ptr.x = e.clientX - r.left;
      ptr.y = e.clientY - r.top;
      ptr.on = ptr.x >= 0 && ptr.x <= W && ptr.y >= 0 && ptr.y <= H;
    };
    window.addEventListener("resize", onResize);
    if (!reduce) window.addEventListener("pointermove", onPointer);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return <canvas ref={ref} className="aurora-chat-field" aria-hidden="true" />;
}
