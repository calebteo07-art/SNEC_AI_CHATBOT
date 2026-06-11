/* DARK ADAPTATION · The Gaze — React shell
 * Lazy-loaded so three.js never rides in the main bundle. If WebGL is
 * unavailable the canvas stays blank and the CSS void beneath shows through.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { subscribeTicker } from "../ticker";
import { useFx } from "../MotionProvider";
import { GazeScene } from "./gazeScene";

export interface GazeHandle {
  /** Pupil dilates while a form input holds focus (mydriasis). */
  setFocus(focused: boolean): void;
  /** Darting micro-movement — call per keystroke. */
  saccade(): void;
  /** Engulf the viewport in pupil-charcoal; resolves when covered. */
  expandPupil(): Promise<void>;
}

export const TheGaze = forwardRef<GazeHandle>(function TheGaze(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<GazeScene | null>(null);
  const { tier, reducedMotion } = useFx();

  useImperativeHandle(
    ref,
    () => ({
      setFocus: (f) => sceneRef.current?.setFocus(f),
      saccade: () => sceneRef.current?.saccade(),
      expandPupil: () =>
        reducedMotion
          ? Promise.resolve()
          : sceneRef.current?.expandPupil() ?? Promise.resolve(),
    }),
    [reducedMotion],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let scene: GazeScene;
    try {
      scene = new GazeScene(canvas, tier === "high" ? 2 : 1.25);
    } catch {
      return; // no WebGL — the CSS void stays
    }
    sceneRef.current = scene;

    const onResize = () => scene.resize();
    window.addEventListener("resize", onResize);

    let unsubscribe: (() => void) | undefined;
    let onMove: ((e: PointerEvent) => void) | undefined;

    if (reducedMotion) {
      scene.renderStatic();
    } else {
      onMove = (e) =>
        scene.setPointer(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
      window.addEventListener("pointermove", onMove);
      unsubscribe = subscribeTicker((t, dt) => scene.render(t, dt));
    }

    return () => {
      window.removeEventListener("resize", onResize);
      if (onMove) window.removeEventListener("pointermove", onMove);
      unsubscribe?.();
      scene.dispose();
      sceneRef.current = null;
    };
  }, [tier, reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
    />
  );
});
