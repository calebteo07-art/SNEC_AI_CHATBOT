"use client";
/* The Gaze, made real.
 *
 * The procedural WebGL iris read as synthetic, so the login hero is now a real
 * macro photograph of a human eye (Nano Banana Pro, tools/media/generate_login_eye.py).
 * A static photo would feel dead, so we keep the *life* the old shader had,
 * driven entirely by cheap CSS transforms — no three.js:
 *   - gaze parallax: the eye drifts a few px toward the cursor (exponential lag)
 *   - idle wander before the first pointer event, so it never sits dead
 *   - a slow breathing zoom
 *   - focus lean: the eye leans in slightly while a form input holds focus
 *   - saccade: a tiny darting nudge per keystroke
 *
 * The eye owns only the gaze now; OnboardingScreen owns the login exit
 * (a quick fade), so the onFocus/onBlur/onChange wiring keeps working verbatim.
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

export interface GazeHandle {
  /** The eye leans in while a form input holds focus (attention cue). */
  setFocus(focused: boolean): void;
  /** Darting micro-movement — call per keystroke. */
  saccade(): void;
}

const SRC = "/brand/login-eye.png";
/* Max travel in px — the iris looks toward the cursor (bigger now that it's an
   isolated iris disc, so the gaze read clearly). */
const TRAVEL = 34;

function prefersReduced(): boolean {
  if (typeof window === "undefined") return false;
  return (
    document.documentElement.dataset.motion === "reduce" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export const EyeHero = forwardRef<GazeHandle>(function EyeHero(_props, ref) {
  const imgRef = useRef<HTMLImageElement>(null);
  const reduced = useRef(false);

  /* Motion state, mutated in the RAF loop (kept out of React state). */
  const s = useRef({
    px: 0, py: 0,        // smoothed pointer, [-1,1]
    tx: 0, ty: 0,        // target pointer, [-1,1]
    hasPointer: false,
    focus: 0,            // 0→1 eased focus lean
    focusTarget: 0,
    jx: 0, jy: 0,        // saccade jitter
  });

  useImperativeHandle(ref, () => ({
    setFocus: (f) => { s.current.focusTarget = f ? 1 : 0; },
    saccade: () => {
      s.current.jx = (Math.random() - 0.5) * 0.5;
      s.current.jy = (Math.random() - 0.5) * 0.32;
    },
  }), []);

  useEffect(() => {
    reduced.current = prefersReduced();
    const img = imgRef.current;
    if (!img) return;

    if (reduced.current) {
      img.style.transform = "none";
      return;
    }

    const onMove = (e: PointerEvent) => {
      s.current.tx = (e.clientX / window.innerWidth) * 2 - 1;
      s.current.ty = (e.clientY / window.innerHeight) * 2 - 1;
      s.current.hasPointer = true;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.064);
      last = now;
      const st = s.current;
      const t = now / 1000;

      // Idle wander until the cursor first moves.
      const tx = (st.hasPointer ? st.tx : Math.sin(t * 0.34) * 0.34) + st.jx;
      const ty = (st.hasPointer ? st.ty : Math.cos(t * 0.26) * 0.24) + st.jy;

      const follow = 1 - Math.exp(-dt * 5.0);
      st.px += (tx - st.px) * follow;
      st.py += (ty - st.py) * follow;
      st.jx *= Math.exp(-dt * 7);
      st.jy *= Math.exp(-dt * 7);
      st.focus += (st.focusTarget - st.focus) * (1 - Math.exp(-dt * 6));

      // Slow breathing + focus lean, applied as scale; parallax as translate.
      const breathe = 1.035 + Math.sin(t * 0.5) * 0.006 + st.focus * 0.022;
      const dx = st.px * TRAVEL;
      const dy = st.py * TRAVEL;
      img.style.transform =
        `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) scale(${breathe.toFixed(4)})`;

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="login-eye" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imgRef} src={SRC} alt="" draggable={false} />
    </div>
  );
});
