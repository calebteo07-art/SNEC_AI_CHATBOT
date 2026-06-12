"use client";
/* PHOTOPIC · hero preloader
 * Once per session: a schematic iris draws itself on paper, the wordmark
 * rises on saccade timing, then the aperture collapses into the pupil with
 * a gem-spectrum fringe — handing the viewport to the app beneath.
 * Entirely decorative: aria-hidden, skipped for reduced motion (150ms fade),
 * z-400 above everything including the route shutter.
 */
import { useEffect, useRef, useState } from "react";
import { gsap, SplitText, useGSAP } from "../gsapSetup";
import { useFx } from "../MotionProvider";

const SEEN_KEY = "eyebot_preloader_seen";

const RINGS = [
  { r: 84, color: "#1F1F1F", width: 1.5, dur: 0.7 },
  { r: 64, color: "#3C90FF", width: 2, dur: 0.62 },
  { r: 46, color: "#00BDD2", width: 1.5, dur: 0.55 },
];

export function Preloader() {
  const { reducedMotion } = useFx();
  const rootRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setActive(sessionStorage.getItem(SEEN_KEY) !== "1");
    } catch {
      setActive(false);
    }
  }, []);

  const dismiss = () => {
    try { sessionStorage.setItem(SEEN_KEY, "1"); } catch { /* private mode */ }
    setActive(false);
  };

  useGSAP(
    () => {
      if (!active || !rootRef.current) return;

      if (reducedMotion) {
        gsap.to(rootRef.current, { autoAlpha: 0, duration: 0.15, delay: 0.2, onComplete: dismiss });
        return;
      }

      const root = rootRef.current;
      const q = gsap.utils.selector(root);
      const split = new SplitText(wordRef.current, { type: "chars" });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" }, onComplete: dismiss });

      /* 1 · the iris draws itself */
      tl.fromTo(
        q(".pl-ring"),
        { strokeDashoffset: (i: number) => 2 * Math.PI * RINGS[i].r },
        {
          strokeDashoffset: 0,
          duration: (i: number) => RINGS[i].dur,
          ease: "power2.inOut",
          stagger: 0.09,
        },
        0,
      );
      tl.fromTo(q(".pl-tick"), { scale: 0, opacity: 0 }, { scale: 1, opacity: 0.7, duration: 0.3, stagger: 0.016, transformOrigin: "center" }, 0.25);
      tl.fromTo(q(".pl-pupil"), { scale: 0 }, { scale: 1, duration: 0.4, ease: "back.out(2.2)", transformOrigin: "center" }, 0.35);

      /* 2 · wordmark rises on saccade timing */
      tl.fromTo(
        split.chars,
        { yPercent: 62, autoAlpha: 0, rotate: 2.5 },
        { yPercent: 0, autoAlpha: 1, rotate: 0, duration: 0.45, stagger: 0.028, ease: "back.out(1.6)" },
        0.38,
      );
      tl.fromTo(q(".pl-tagline"), { autoAlpha: 0, y: 8 }, { autoAlpha: 0.75, y: 0, duration: 0.4 }, 0.78);

      /* 3 · pupil acknowledges, then the aperture collapses into it */
      tl.to(q(".pl-pupil"), { scale: 1.5, duration: 0.28, ease: "power2.inOut", transformOrigin: "center" }, 1.2);
      tl.fromTo(
        q(".pl-fringe"),
        { scale: 1.35, autoAlpha: 0 },
        { scale: 0.0, autoAlpha: 0.85, duration: 0.62, ease: "expo.in", stagger: 0.05 },
        1.32,
      );
      tl.to(
        root,
        { clipPath: "circle(0% at 50% 50%)", duration: 0.68, ease: "expo.inOut" },
        1.38,
      );

      return () => split.revert();
    },
    { dependencies: [active, reducedMotion], scope: rootRef },
  );

  if (!active) return null;

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        background: "var(--canvas, #FDFDFC)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        clipPath: "circle(150% at 50% 50%)",
        pointerEvents: "all",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
        <svg width="200" height="200" viewBox="-100 -100 200 200">
          {/* radial ticks — the schematic iris fibres */}
          {Array.from({ length: 24 }, (_, i) => {
            const a = (i / 24) * Math.PI * 2;
            const x1 = Math.cos(a) * 50;
            const y1 = Math.sin(a) * 50;
            const x2 = Math.cos(a) * 60;
            const y2 = Math.sin(a) * 60;
            return (
              <line
                key={i}
                className="pl-tick"
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={i % 3 === 0 ? "#3C90FF" : "rgba(31,31,31,0.45)"}
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            );
          })}
          {RINGS.map(({ r, color, width }) => (
            <circle
              key={r}
              className="pl-ring"
              cx="0" cy="0" r={r}
              fill="none"
              stroke={color}
              strokeWidth={width}
              strokeDasharray={2 * Math.PI * r}
              transform="rotate(-90)"
              strokeLinecap="round"
            />
          ))}
          <circle className="pl-pupil" cx="0" cy="0" r="17" fill="#1F1F1F" />
        </svg>

        <div style={{ textAlign: "center" }}>
          <div
            ref={wordRef}
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: "clamp(2.2rem, 5vw, 3.4rem)",
              letterSpacing: "-0.04em",
              color: "#1F1F1F",
              lineHeight: 1,
              overflow: "hidden",
              paddingBottom: "0.08em",
            }}
          >
            EYEBOT
          </div>
          <p
            className="pl-tagline"
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              fontSize: "clamp(0.95rem, 1.6vw, 1.15rem)",
              color: "rgba(31,31,31,0.75)",
              marginTop: 10,
              opacity: 0,
            }}
          >
            an attentive tutor for the eye
          </p>
        </div>
      </div>

      {/* gem fringe rings riding the aperture collapse */}
      {["#3C90FF", "#F96BD6", "#00BDD2"].map((c) => (
        <div
          key={c}
          className="pl-fringe"
          style={{
            position: "absolute",
            width: "180vmax",
            height: "180vmax",
            borderRadius: "50%",
            border: `2px solid ${c}`,
            opacity: 0,
            pointerEvents: "none",
          }}
        />
      ))}
    </div>
  );
}
