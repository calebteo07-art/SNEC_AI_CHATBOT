/* DARK ADAPTATION · magnetic pull
 * Interface elements lean toward the cursor like iron filings — a few
 * pixels of spring-loaded attraction, gone the moment the pointer leaves.
 * Inert on touch and under reduced motion.
 */
import { type CSSProperties, type ReactNode } from "react";
import { motion, useSpring } from "motion/react";
import { useFx } from "../MotionProvider";

/* Props are intentionally narrow (motion@12.40's HTMLMotionProps no longer
 * tolerates a React.HTMLAttributes spread — drag/animation handler names
 * collide). Every call site only ever passes these. */
interface MagneticProps {
  children: ReactNode;
  /** Fraction of the pointer offset transferred to the element. */
  strength?: number;
  className?: string;
  style?: CSSProperties;
}

export function Magnetic({ children, strength = 0.3, style, ...rest }: MagneticProps) {
  const { finePointer, reducedMotion } = useFx();
  const x = useSpring(0, { stiffness: 380, damping: 26, mass: 0.5 });
  const y = useSpring(0, { stiffness: 380, damping: 26, mass: 0.5 });

  if (!finePointer || reducedMotion) {
    return (
      <span style={{ display: "inline-block", ...style }} {...rest}>
        {children}
      </span>
    );
  }

  return (
    <motion.span
      style={{ display: "inline-block", x, y, ...style }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
      {...rest}
    >
      {children}
    </motion.span>
  );
}
