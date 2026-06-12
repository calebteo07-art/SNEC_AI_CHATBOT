"use client";
/* PHOTOPIC · kinetic type (GSAP)
 * Splits a string into chars or words that dart in on saccade timing.
 * Same contract as v1: screen readers see one coherent string (aria-label
 * on the parent, fragments hidden); reduced motion renders plain text.
 * Splitting is manual (the input is a string prop, not measured DOM), so
 * the aria pattern is preserved exactly; GSAP drives the choreography.
 */
import { createElement, useRef, type CSSProperties } from "react";
import { gsap, useGSAP } from "../gsapSetup";
import { useFx } from "../MotionProvider";

type SplitTag = "h1" | "h2" | "h3" | "p" | "span" | "div";

export function SplitText({
  text,
  as = "span",
  by = "char",
  className,
  style,
  delay = 0,
  stagger = 0.028,
}: {
  text: string;
  as?: SplitTag;
  by?: "char" | "word";
  className?: string;
  style?: CSSProperties;
  delay?: number;
  stagger?: number;
}) {
  const { reducedMotion } = useFx();
  const ref = useRef<HTMLElement | null>(null);

  useGSAP(
    () => {
      if (reducedMotion || !ref.current) return;
      gsap.fromTo(
        ref.current.querySelectorAll(".st-unit"),
        { yPercent: 58, autoAlpha: 0, rotate: 2.5 },
        {
          yPercent: 0,
          autoAlpha: 1,
          rotate: 0,
          duration: 0.5,
          ease: "back.out(1.7)",
          stagger,
          delay,
        },
      );
    },
    { dependencies: [text, reducedMotion], scope: ref as React.RefObject<HTMLElement> },
  );

  if (reducedMotion) {
    return createElement(as, { className, style }, text);
  }

  const units = by === "word" ? text.split(/(\s+)/) : Array.from(text);

  return createElement(
    as,
    { className, style, "aria-label": text, ref },
    <span aria-hidden="true" style={{ display: "inline-block" }}>
      {units.map((u, i) =>
        u.trim() === "" ? (
          <span key={i} style={{ whiteSpace: "pre" }}>
            {u}
          </span>
        ) : (
          <span
            key={i}
            className="st-unit"
            style={{
              display: "inline-block",
              whiteSpace: "pre",
              willChange: "transform",
              visibility: "hidden",
            }}
          >
            {u}
          </span>
        ),
      )}
    </span>,
  );
}
