"use client";
/* FeatureCarousel — a 3D coverflow of the three entry points (Tutor / Virtual
   Patients / Flashcards). All three stay visible: the centre card faces you, the
   two sides angle back. Auto-drifts slowly when idle; you can drag or use the arrows.

   Navigation is resolved at the STAGE, not per-card: a tap (little travel, quick)
   opens the card whose live centre is nearest the tap point. The old design relied
   on clicking the card's <Link> directly, but the perpetual drift + 3D perspective
   made the front card a moving, mis-projected target (clicks fell through to the
   stage) and left the two side cards pointer-events:none — so clicking a card often
   did nothing (ricoe D3). Resolving the tap against live rects fixes both. Keyboard
   Enter still navigates via the real <a href>. Positions are written straight to the
   DOM in a rAF loop (transform/opacity only) so React never re-renders. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Icon } from "./HomeIcons";

const FEATURES = [
  { tone: "tutor", href: "/chat", icon: "tutor", title: "Tutor", sub: "Ask anything — your AI eye coach", cta: "Open chat" },
  { tone: "vp", href: "/cases", icon: "vp", title: "Virtual Patients", sub: "Run a real OSCE station", cta: "Start a case" },
  { tone: "flash", href: "/flashcards", icon: "flash", title: "Flashcards", sub: "Active-recall drills that adapt", cta: "Study now" },
] as const;

export function FeatureCarousel() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const stageRef = useRef<HTMLDivElement>(null);
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const cardsRef = useRef<(HTMLAnchorElement | null)[]>([]);
  const focus = useRef(0);
  const vel = useRef(0);
  const dragging = useRef(false);
  const moved = useRef(false);
  const lastX = useRef(0);
  const downX = useRef(0);
  const downT = useRef(0);

  useEffect(() => {
    const cards = cardsRef.current.filter(Boolean) as HTMLAnchorElement[];
    const stage = stageRef.current;
    const n = cards.length;
    if (!n || !stage) return;

    const SX = 300, RY = 48, DZ = 170, SC = 0.14, HALF = n / 2;
    const BASE = 0.005; // constant ever-flowing drift (~0.3 cards/sec); never stops
    const TAP_SLOP = 8;  // px of travel below which a pointer-up counts as a tap, not a drag
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
        // pointer-events stay off (CSS) on every card — taps are resolved at the
        // stage, so drift/3D-projection can never swallow a click.
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

    // Open the card whose live centre is nearest the tap X — independent of which
    // card happens to be pointer-events-hot and of the 3D projection.
    const openNearest = (clientX: number) => {
      let best = 0, bestDist = Infinity;
      cards.forEach((c, i) => {
        const r = c.getBoundingClientRect();
        const dx = Math.abs(r.left + r.width / 2 - clientX);
        if (dx < bestDist) { bestDist = dx; best = i; }
      });
      routerRef.current.push(FEATURES[best].href);
    };

    const onDown = (e: PointerEvent) => {
      dragging.current = true; moved.current = false;
      lastX.current = e.clientX; downX.current = e.clientX; downT.current = performance.now();
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - lastX.current;
      if (Math.abs(e.clientX - downX.current) > TAP_SLOP) moved.current = true;
      focus.current -= dx / 260;
      lastX.current = e.clientX;
      vel.current = -dx / 260; // carry the drag speed into momentum on release
      if (motionOff) layout();
    };
    const onUp = (e: PointerEvent) => {
      const wasDragging = dragging.current;
      dragging.current = false;
      if (!wasDragging) return;
      // A tap (little travel, quick) opens the nearest card; a real drag just settles.
      if (!moved.current && performance.now() - downT.current < 700) openNearest(e.clientX);
    };

    layout();
    if (!motionOff) raf = requestAnimationFrame(tick);
    prevRef.current?.addEventListener("click", onPrev);
    nextRef.current?.addEventListener("click", onNext);
    stage.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    return () => {
      cancelAnimationFrame(raf);
      prevRef.current?.removeEventListener("click", onPrev);
      nextRef.current?.removeEventListener("click", onNext);
      stage.removeEventListener("pointerdown", onDown);
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
