"use client";
/* Reveal — rises content in as it first enters the viewport (IntersectionObserver,
   one-shot). RouteReveal — replays a page-enter on every navigation (keyed by
   pathname). Both are inert under reduced motion (motion.css resets them to their
   final state, so no JS branch is needed here). */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";

export function Reveal({ children, className = "", delay = 0, style }: {
  children?: ReactNode; className?: string; delay?: number; style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || revealed) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { setRevealed(true); io.disconnect(); break; }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    io.observe(el);
    return () => io.disconnect();
  }, [revealed]);
  return (
    <div
      ref={ref}
      className={`aurora-reveal ${className}`}
      data-revealed={revealed ? "true" : undefined}
      style={{ ["--reveal-delay" as string]: `${delay}ms`, ...style }}
    >
      {children}
    </div>
  );
}

export function RouteReveal({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <div key={pathname} className="aurora-page-enter">{children}</div>;
}
