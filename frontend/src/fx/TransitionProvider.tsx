/* DARK ADAPTATION · route wipe state machine
 * Tier-1 transitions: the screen blinks. Eyelid panels close over the old
 * route, navigation happens beneath the opaque cover, then the lids open on
 * the new route. `handoff` skips the close — for cases where something else
 * already covered the screen (The Gaze's pupil expansion on login).
 *
 * Promise-based so call-sites (and the audio layer) can sequence against it.
 * Reduced motion ⇒ instant cut, no overlay.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router";
import { useFx } from "./MotionProvider";
import { useAudio } from "./audio/useAudio";

export type WipePhase = "idle" | "closing" | "covered" | "opening";

/** A path to navigate to, or a callback that performs the navigation itself
 *  (needed when auth state must change or router state must be passed). */
export type WipeAction = string | (() => void);

interface TransitionContextValue {
  phase: WipePhase;
  /** True while the cover must appear without a closing animation. */
  instant: boolean;
  /** Blink: close → act under cover → open. Resolves when idle again. */
  wipe: (action: WipeAction) => Promise<void>;
  /** Cover appears instantly (caller already filled the screen) → act → open. */
  handoff: (action: WipeAction) => Promise<void>;
}

const CLOSE_MS = 280;
const OPEN_MS = 460;

const TransitionContext = createContext<TransitionContextValue | null>(null);

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const nextFrames = (n: number) =>
  new Promise<void>((resolve) => {
    let left = n;
    const step = () => (--left <= 0 ? resolve() : void requestAnimationFrame(step));
    requestAnimationFrame(step);
  });

export function TransitionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { reducedMotion } = useFx();
  const { play } = useAudio();
  const [phase, setPhase] = useState<WipePhase>("idle");
  const [instant, setInstant] = useState(false);
  const busyRef = useRef(false);

  const run = useCallback(
    (action: WipeAction) => {
      if (typeof action === "function") action();
      else navigate(action);
    },
    [navigate],
  );

  const wipe = useCallback(
    async (action: WipeAction) => {
      if (busyRef.current) return;
      if (reducedMotion) {
        run(action);
        return;
      }
      busyRef.current = true;
      play("whoosh");
      setInstant(false);
      setPhase("closing");
      await delay(CLOSE_MS + 40);
      run(action);
      setPhase("covered");
      await nextFrames(2);
      setPhase("opening");
      await delay(OPEN_MS);
      setPhase("idle");
      busyRef.current = false;
    },
    [run, reducedMotion, play],
  );

  const handoff = useCallback(
    async (action: WipeAction) => {
      if (busyRef.current) return;
      if (reducedMotion) {
        run(action);
        return;
      }
      busyRef.current = true;
      setInstant(true);
      setPhase("covered");
      await nextFrames(1);
      run(action);
      await nextFrames(2);
      setInstant(false);
      setPhase("opening");
      await delay(OPEN_MS);
      setPhase("idle");
      busyRef.current = false;
    },
    [run, reducedMotion],
  );

  const value = useMemo(
    () => ({ phase, instant, wipe, handoff }),
    [phase, instant, wipe, handoff],
  );

  return <TransitionContext.Provider value={value}>{children}</TransitionContext.Provider>;
}

export function useWipeNavigate(): TransitionContextValue {
  const ctx = useContext(TransitionContext);
  if (!ctx) throw new Error("useWipeNavigate must be used inside FxRoot");
  return ctx;
}
