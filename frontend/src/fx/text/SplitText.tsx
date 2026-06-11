/* DARK ADAPTATION · kinetic type
 * Splits a string into chars or words that dart in on saccade timing.
 * Screen readers see one coherent string (aria-label on the parent,
 * fragments hidden); reduced motion renders plain text.
 */
import { type CSSProperties } from "react";
import { motion } from "motion/react";
import { useFx } from "../MotionProvider";
import { springs, staggerContainer } from "../../app/utils/springs";

const unitVariant = {
  hidden: { opacity: 0, y: "0.55em", rotate: 2.5 },
  visible: { opacity: 1, y: "0em", rotate: 0, transition: springs.snappy },
};

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
  const Tag = as;

  if (reducedMotion) {
    return (
      <Tag className={className} style={style}>
        {text}
      </Tag>
    );
  }

  const units = by === "word" ? text.split(/(\s+)/) : Array.from(text);

  return (
    <Tag className={className} style={style} aria-label={text}>
      <motion.span
        aria-hidden="true"
        style={{ display: "inline-block" }}
        variants={staggerContainer(stagger, delay)}
        initial="hidden"
        animate="visible"
      >
        {units.map((u, i) =>
          u.trim() === "" ? (
            <span key={i} style={{ whiteSpace: "pre" }}>
              {u}
            </span>
          ) : (
            <motion.span
              key={i}
              variants={unitVariant}
              style={{ display: "inline-block", whiteSpace: "pre", willChange: "transform" }}
            >
              {u}
            </motion.span>
          ),
        )}
      </motion.span>
    </Tag>
  );
}
