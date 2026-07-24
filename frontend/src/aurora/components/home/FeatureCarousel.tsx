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
import { inFrontCardZone } from "@/aurora/lib/hoverPause";
import { Icon } from "./HomeIcons";

const FEATURES = [
  { tone: "tutor", href: "/chat", title: "Tutor", sub: "Ask anything — your Socratic guide", cta: "Open chat", art: "/brand/features/tutor.webp" },
  { tone: "vp", href: "/cases", title: "Virtual Patients", sub: "Examine a real virtual patient", cta: "Start a case", art: "/brand/features/vp.webp" },
  { tone: "flash", href: "/flashcards", title: "Flashcards", sub: "Adaptive drills that stick", cta: "Study now", art: "/brand/features/flash.webp" },
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
  const hover = useRef(false);
  const dragging = useRef(false);
  const moved = useRef(false);
  const lastX = useRef(0);
  const downX = useRef(0);
  const downY = useRef(0);
  const downT = useRef(0);

  useEffect(() => {
    const cards = cardsRef.current.filter(Boolean) as HTMLAnchorElement[];
    const stage = stageRef.current;
    const n = cards.length;
    if (!n || !stage) return;

    /* Spacing/depth are derived from the card's LAID-OUT width (offsetWidth — layout
       width, immune to the transforms we write here), so the coverflow scales with the
       viewport instead of assuming the 466px desktop card. The old hardcoded SX=346
       spread a 390px phone's neighbours to centres ~-117 and ~507 — fully off-screen,
       yet still the nearest card to any tap near the edge. The ratios below reproduce
       the desktop geometry exactly at cw=466 (346/466, 176/466), so desktop is unchanged. */
    let SX = 346, DZ = 176;
    const metrics = () => {
      const cw = cards[0].offsetWidth || 466;
      SX = cw * (346 / 466);
      DZ = cw * (176 / 466);
    };
    const RY = 46, SC = 0.14, HALF = n / 2, FADE = HALF - 0.5;
    // Phones spin livelier than the calm desktop flow (user directive 2026-07-20). Gate on
    // the app's phone tiers exactly — coarse pointer + phone-sized viewport, either
    // orientation — so tablets/desktop keep 0.005. Read once on mount, like motionOff below.
    const phone =
      window.matchMedia("(max-width: 640px) and (pointer: coarse)").matches ||
      window.matchMedia("(max-height: 480px) and (pointer: coarse)").matches;
    const BASE = phone ? 0.02 : 0.005; // phone spins ~4x the calm desktop drift; never stops
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
        // Cards stay fully opaque out to the side positions and only fade in the
        // deep-back zone (ad > FADE), reaching 0 exactly at the back (ad = HALF) so
        // the wrap-around still happens while the card is invisible — no pop, no
        // washed-out sides.
        c.style.opacity =
          ad <= FADE ? "1" : String(Math.max(0, 1 - ((ad - FADE) / (HALF - FADE)) ** 2));
        c.style.zIndex = String(Math.round(1000 - ad * 100));
        // pointer-events stay off (CSS) on every card — taps are resolved at the
        // stage, so drift/3D-projection can never swallow a click.
      });
    };

    // One continuous flow: constant base drift + a decaying nudge (from arrows/drag
    // momentum). No snapping to whole cards, so nothing ever pops. Hovering the FRONT
    // CARD holds the drift so you can read (and click) it; a nudge already in flight
    // still decays out, so the arrows keep working with the cursor parked mid-stage.
    let raf = 0;
    const tick = () => {
      if (!dragging.current) {
        focus.current += (hover.current ? 0 : BASE) + vel.current;
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
    // card happens to be pointer-events-hot and of the 3D projection. Candidates whose
    // live centre projects OUTSIDE the stage are skipped: they are off-screen, so
    // resolving a tap to one opens a feature the user never saw (the same reason the
    // flashcards coverflow skips its parked cards). The nearest card is always within
    // half a step of the stage centre, so this never leaves a tap dead.
    const openNearest = (clientX: number) => {
      const s = stage.getBoundingClientRect();
      let best = -1, bestDist = Infinity;
      cards.forEach((c, i) => {
        const r = c.getBoundingClientRect();
        const centre = r.left + r.width / 2;
        if (centre < s.left || centre > s.right) return;
        const dx = Math.abs(centre - clientX);
        if (dx < bestDist) { bestDist = dx; best = i; }
      });
      if (best >= 0) routerRef.current.push(FEATURES[best].href);
    };

    const onDown = (e: PointerEvent) => {
      dragging.current = true; moved.current = false;
      lastX.current = e.clientX; downX.current = e.clientX; downY.current = e.clientY;
      downT.current = performance.now();
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - lastX.current;
      // Travel is measured on BOTH axes. Measuring only |dx| meant a vertical scroll
      // flick (|dx|<8, <700ms) still satisfied the tap test, so scrolling the page from
      // anywhere on the carousel navigated the user away at random.
      if (Math.abs(e.clientX - downX.current) > TAP_SLOP ||
          Math.abs(e.clientY - downY.current) > TAP_SLOP) moved.current = true;
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
    // `touch-action: pan-y` (home.css) hands vertical scroll to the browser, which then
    // cancels our pointer stream. Without this the drag would never end: `dragging` would
    // stay true and the drift — gated on it — would stop dead after the first scroll.
    const onCancel = () => { dragging.current = false; moved.current = true; vel.current = 0; };
    const onResize = () => { metrics(); layout(); };

    // Hover-pause, resolved by geometry for the same reason taps are: the cards are
    // pointer-events:none, so a CSS :hover target would swallow the clicks the stage
    // exists to catch. The zone is the FRONT CARD only — a box its laid-out size, centred
    // on the stage — so the side cards and the arrows keep the flow going. Mouse only:
    // touch has no hover, and a finger drag must never leave the ring frozen. Both
    // listeners are on the stage, so they only fire while the cursor is over it.
    const onHover = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const card = cards[0];
      hover.current = inFrontCardZone(
        stage.getBoundingClientRect(), card.offsetWidth, card.offsetHeight, e.clientX, e.clientY);
    };
    const onHoverOut = () => { hover.current = false; };

    metrics();
    layout();
    if (!motionOff) raf = requestAnimationFrame(tick);
    prevRef.current?.addEventListener("click", onPrev);
    nextRef.current?.addEventListener("click", onNext);
    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onHover);
    stage.addEventListener("pointerleave", onHoverOut);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      prevRef.current?.removeEventListener("click", onPrev);
      nextRef.current?.removeEventListener("click", onNext);
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onHover);
      stage.removeEventListener("pointerleave", onHoverOut);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("resize", onResize);
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
            {/* eslint-disable-next-line @next/next/no-img-element -- baked full-card art, no next/image on standalone */}
            <img className="hm-fcard-art" src={f.art} alt="" aria-hidden width={466} height={300} loading="lazy" />
            <span className="hm-fcard-body">
              <h3 className="disp">{f.title}</h3>
              <p>{f.sub}</p>
              <span className="hm-open">{f.cta} <Icon name="arrow" /></span>
            </span>
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
