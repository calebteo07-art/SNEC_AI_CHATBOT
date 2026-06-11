/* DARK ADAPTATION · the reticle
 * A retinoscope-style cursor: cream dot riding fast, focus ring trailing
 * with lerp lag. Ring snaps wide on interactive targets, collapses to a
 * text beam over inputs. DOM-style updates from the shared ticker — zero
 * React renders per frame. Desktop fine-pointer only.
 */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { subscribeTicker } from "../ticker";
import { useFx } from "../MotionProvider";

export function CursorLayer() {
  const { finePointer, tier, reducedMotion } = useFx();
  const enabled = finePointer && tier === "high" && !reducedMotion;
  if (!enabled) return null;
  return <CursorInner />;
}

function CursorInner() {
  const rootRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!root || !dot || !ring) return;

    document.documentElement.classList.add("fx-cursor-active");

    const target = { x: -100, y: -100 };
    const dotPos = { x: -100, y: -100 };
    const ringPos = { x: -100, y: -100 };
    let seen = false;

    const onMove = (e: PointerEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
      if (!seen) {
        seen = true;
        dotPos.x = ringPos.x = target.x;
        dotPos.y = ringPos.y = target.y;
        root.dataset.hidden = "false";
      }
      const t = e.target as HTMLElement | null;
      let mode = "dot";
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) mode = "text";
      else if (t?.closest('[data-cursor="ring"], a, button, [role="button"], label')) mode = "ring";
      root.dataset.mode = mode;
    };
    const onLeave = () => {
      root.dataset.hidden = "true";
    };
    const onEnter = () => {
      if (seen) root.dataset.hidden = "false";
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.documentElement.addEventListener("pointerenter", onEnter);

    const unsubscribe = subscribeTicker((_t, dtMs) => {
      const dt = Math.min(dtMs / 1000, 0.064);
      const kFast = 1 - Math.exp(-dt * 30);
      const kSlow = 1 - Math.exp(-dt * 13);
      dotPos.x += (target.x - dotPos.x) * kFast;
      dotPos.y += (target.y - dotPos.y) * kFast;
      ringPos.x += (target.x - ringPos.x) * kSlow;
      ringPos.y += (target.y - ringPos.y) * kSlow;
      dot.style.transform = `translate3d(${dotPos.x}px, ${dotPos.y}px, 0)`;
      ring.style.transform = `translate3d(${ringPos.x}px, ${ringPos.y}px, 0)`;
    });

    return () => {
      unsubscribe();
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.documentElement.removeEventListener("pointerenter", onEnter);
      document.documentElement.classList.remove("fx-cursor-active");
    };
  }, []);

  return createPortal(
    <div ref={rootRef} className="fx-cursor" data-mode="dot" data-hidden="true" aria-hidden="true">
      <div ref={ringRef} className="fx-cursor-ring" />
      <div ref={dotRef} className="fx-cursor-dot" />
    </div>,
    document.body,
  );
}
