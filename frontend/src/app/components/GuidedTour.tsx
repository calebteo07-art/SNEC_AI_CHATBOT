import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";

const STEP_DURATION = 6000;
const TOUR_KEY = "eyebot_tour_seen";
const TOOLTIP_W = 340;
const TOOLTIP_H = 170;
const GAP = 20;
const EDGE = 16;

const TOUR_STEPS = [
  {
    id: "welcome",
    target: null,
    title: "Welcome to EyeBot",
    body: "Your AI-powered ophthalmology learning companion. Here's a quick look at everything you can do.",
  },
  {
    id: "learn",
    target: '[data-tour="learn"]',
    title: "Learn",
    body: "Your daily curriculum — topics organised by your track (OA, OT, or PSA). Start here every session.",
  },
  {
    id: "cases",
    target: '[data-tour="cases"]',
    title: "Clinical Cases",
    body: "Practice with real clinical scenarios to build your diagnostic reasoning.",
  },
  {
    id: "chat",
    target: '[data-tour="chat"]',
    title: "AI Tutor",
    body: "Ask anything. Your tutor explains concepts, answers questions, and adapts to your level.",
  },
  {
    id: "progress",
    target: '[data-tour="progress"]',
    title: "Progress",
    body: "Track your performance across topics and see exactly where to focus next.",
  },
  {
    id: "gamification",
    target: '[data-tour="gamification"]',
    title: "Your Stats",
    body: "Earn XP, keep your daily streak alive, and protect your hearts as you study.",
  },
];

export function GuidedTour() {
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const prevElRef = useRef<HTMLElement | null>(null);

  // Delay initial appearance so the dashboard fully renders
  useEffect(() => {
    if (!import.meta.env.DEV && localStorage.getItem(TOUR_KEY) === "true") return;
    const t = setTimeout(() => setReady(true), 600);
    return () => clearTimeout(t);
  }, []);

  const cleanupPrev = useCallback(() => {
    const el = prevElRef.current;
    if (el) {
      el.style.zIndex = "";
      el.style.position = "";
      prevElRef.current = null;
    }
  }, []);

  const endTour = useCallback(() => {
    cleanupPrev();
    if (!import.meta.env.DEV) localStorage.setItem(TOUR_KEY, "true");
    setReady(false);
  }, [cleanupPrev]);

  // Elevate target element above overlay on each step
  useEffect(() => {
    if (!ready) return;
    cleanupPrev();

    const selector = TOUR_STEPS[step].target;
    if (!selector) {
      setTargetRect(null);
      return;
    }

    const el = document.querySelector<HTMLElement>(selector);
    if (!el) {
      setTargetRect(null);
      return;
    }

    el.style.position = "relative";
    el.style.zIndex = "101";
    prevElRef.current = el;
    setTargetRect(el.getBoundingClientRect());
  }, [step, ready, cleanupPrev]);

  // Cleanup on unmount
  useEffect(() => () => cleanupPrev(), [cleanupPrev]);

  // Auto-advance timer
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      if (step < TOUR_STEPS.length - 1) {
        setStep((s) => s + 1);
      } else {
        endTour();
      }
    }, STEP_DURATION);
    return () => clearTimeout(timer);
  }, [step, ready, endTour]);

  if (!ready) return null;

  // Tooltip position
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let tooltipTop: number;
  let tooltipLeft: number;

  if (!targetRect) {
    tooltipTop = vh / 2 - TOOLTIP_H / 2;
    tooltipLeft = vw / 2 - TOOLTIP_W / 2;
  } else {
    tooltipLeft = targetRect.right + GAP;
    tooltipTop = targetRect.top + targetRect.height / 2 - TOOLTIP_H / 2;
    if (tooltipLeft + TOOLTIP_W > vw - EDGE) {
      tooltipLeft = targetRect.left - TOOLTIP_W - GAP;
    }
    tooltipTop = Math.max(EDGE, Math.min(tooltipTop, vh - TOOLTIP_H - EDGE));
    tooltipLeft = Math.max(EDGE, tooltipLeft);
  }

  return createPortal(
    <>
      {/* Dim overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.65)",
          zIndex: 100,
          pointerEvents: "none",
        }}
      />

      {/* Skip button */}
      <button
        onClick={endTour}
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 103,
          background: "none",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 6,
          cursor: "pointer",
          fontSize: "0.78rem",
          letterSpacing: "0.03em",
          color: "rgba(255,255,255,0.55)",
          padding: "5px 12px",
          backdropFilter: "blur(8px)",
          transition: "color 0.15s, border-color 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "rgba(255,255,255,0.9)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.35)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "rgba(255,255,255,0.55)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
        }}
      >
        Skip tour
      </button>

      {/* Tooltip card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          className="glass-card iri-border"
          style={{
            position: "fixed",
            top: tooltipTop,
            left: tooltipLeft,
            width: TOOLTIP_W,
            padding: "1.25rem",
            zIndex: 102,
            pointerEvents: "auto",
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
        >
          {/* Step indicator dots */}
          <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                style={{
                  height: 4,
                  borderRadius: 2,
                  background: i === step ? "var(--teal, #22d3ee)" : "rgba(255,255,255,0.18)",
                  width: i === step ? 16 : 4,
                  transition: "all 0.25s ease",
                }}
              />
            ))}
          </div>

          <h3
            style={{
              fontSize: "1.05rem",
              fontWeight: 600,
              margin: 0,
              color: "var(--text)",
              fontFamily: "var(--font-display)",
            }}
          >
            {TOUR_STEPS[step].title}
          </h3>
          <p
            style={{
              fontSize: "0.88rem",
              color: "var(--text)",
              opacity: 0.65,
              margin: "6px 0 0",
              lineHeight: 1.5,
            }}
          >
            {TOUR_STEPS[step].body}
          </p>

          {/* Progress bar */}
          <div
            style={{
              marginTop: 16,
              height: 2,
              borderRadius: 1,
              background: "rgba(255,255,255,0.1)",
              overflow: "hidden",
            }}
          >
            <motion.div
              key={`bar-${step}`}
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: STEP_DURATION / 1000, ease: "linear" }}
              style={{
                height: "100%",
                background: "var(--teal, #22d3ee)",
                borderRadius: 1,
              }}
            />
          </div>
        </motion.div>
      </AnimatePresence>
    </>,
    document.body
  );
}
