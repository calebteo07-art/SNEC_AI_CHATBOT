"use client";
/* FeatureCarousel — a 3D coverflow of the three entry points (Tutor / Virtual
   Patients / Flashcards). All three stay visible: the centre card faces you, the
   two sides angle back. Auto-drifts slowly when idle, and you can drag or use the
   arrows. Freezes (no drift) under reduced motion. Positions are written straight
   to the DOM in a rAF loop (transform/opacity only) so React never re-renders. */
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Icon } from "./HomeIcons";

const FEATURES = [
  { tone: "tutor", href: "/chat", icon: "tutor", title: "Tutor", sub: "Ask anything — your AI eye coach", cta: "Open chat" },
  { tone: "vp", href: "/cases", icon: "vp", title: "Virtual Patients", sub: "Run a real OSCE station", cta: "Start a case" },
  { tone: "flash", href: "/flashcards", icon: "flash", title: "Flashcards", sub: "Active-recall drills that adapt", cta: "Study now" },
] as const;

export function FeatureCarousel() {
  const stageRef = useRef<HTMLDivElement>(null);
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const cardsRef = useRef<(HTMLAnchorElement | null)[]>([]);
  const focus = useRef(0);
  const vel = useRef(0);
  const dragging = useRef(false);
  const moved = useRef(false);
  const lastX = useRef(0);

  useEffect(() => {
    const cards = cardsRef.current.filter(Boolean) as HTMLAnchorElement[];
    const stage = stageRef.current;
    const n = cards.length;
    if (!n || !stage) return;

    const SX = 300, RY = 48, DZ = 170, SC = 0.14, HALF = n / 2;
    const BASE = 0.005; // constant ever-flowing drift (~0.3 cards/sec); never stops
    const motionOff =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.getAttribute("data-motion") === "reduce";

    const dist = (i: number) => {
      let d = i - focus.current;
      d = ((d % n) + n) % n;
      if (d > n / 2) d -= n;
      return d;
    };
    const layout = () => {
      cards.forEach((c, i) => {
        const d = dist(i), ad = Math.abs(d);
        c.style.transform =
          `translateX(${d * SX}px) translateZ(${-ad * DZ}px) rotateY(${-d * RY}deg) scale(${1 - ad * SC})`;
        // Quadratic fade that reaches 0 exactly at the back (ad = HALF), so the
        // wrap-around happens while the card is invisible — no pop.
        c.style.opacity = String(Math.max(0, 1 - (ad / HALF) ** 2));
        c.style.zIndex = String(Math.round(1000 - ad * 100));
        c.style.pointerEvents = ad < 0.5 ? "auto" : "none";
      });
    };

    // One continuous flow: constant base drift + a decaying nudge (from arrows/drag
    // momentum). No snapping to whole cards, so nothing ever pops.
    let raf = 0;
    const tick = () => {
      if (!dragging.current) {
        focus.current += BASE + vel.current;
        vel.current *= 0.92;
        if (Math.abs(vel.current) < 1e-4) vel.current = 0;
      }
      focus.current = ((focus.current % n) + n) % n; // wrap; dist() keeps it seamless
      layout();
      raf = requestAnimationFrame(tick);
    };

    const nudge = (dir: number) => {
      if (motionOff) { focus.current += dir; layout(); }
      else vel.current += dir * 0.09; // smooth eased push, decays back into the flow
    };
    const onPrev = () => nudge(-1);
    const onNext = () => nudge(1);
    const onDown = (e: PointerEvent) => { dragging.current = true; moved.current = false; lastX.current = e.clientX; };
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - lastX.current;
      if (Math.abs(dx) > 3) moved.current = true;
      focus.current -= dx / 260;
      lastX.current = e.clientX;
      vel.current = -dx / 260; // carry the drag speed into momentum on release
      if (motionOff) layout();
    };
    const onUp = () => { dragging.current = false; }; // resumes the flow from wherever it is
    // A drag that ends on a card must not also navigate.
    const onClickCapture = (e: MouseEvent) => { if (moved.current) { e.preventDefault(); e.stopPropagation(); } };

    layout();
    if (!motionOff) raf = requestAnimationFrame(tick);
    prevRef.current?.addEventListener("click", onPrev);
    nextRef.current?.addEventListener("click", onNext);
    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("click", onClickCapture, true);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    return () => {
      cancelAnimationFrame(raf);
      prevRef.current?.removeEventListener("click", onPrev);
      nextRef.current?.removeEventListener("click", onNext);
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  return (
    <div className="hm-carousel" data-testid="feature-carousel" role="region" aria-label="Quick actions">
      <div className="hm-ring3d" ref={stageRef}>
        {FEATURES.map((f, idx) => (
          <Link
            key={f.href}
            href={f.href}
            className={`hm-fcard ${f.tone}`}
            data-testid="feature-card"
            ref={(el) => { cardsRef.current[idx] = el; }}
          >
            <Icon name={f.icon} className="hm-deco ico" />
            <span className="hm-tile"><Icon name={f.icon} /></span>
            <h3 className="disp">{f.title}</h3>
            <p>{f.sub}</p>
            <span className="hm-open">{f.cta} <Icon name="arrow" /></span>
          </Link>
        ))}
      </div>
      <div className="hm-carnav">
        <button ref={prevRef} type="button" className="hm-carbtn" aria-label="Previous">‹</button>
        <button ref={nextRef} type="button" className="hm-carbtn" aria-label="Next">›</button>
      </div>
    </div>
  );
}
