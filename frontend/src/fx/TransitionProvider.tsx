"use client";
/* DARK ADAPTATION · route wipe state machine
 * Tier-1 transitions: the screen blinks. Eyelid panels close over the old
 * route, navigation happens beneath the opaque cover, then the lids open on
 * the new route. `handoff` skips the close — for cases where something else
 * already covered the screen (The Gaze's pupil expansion on login).
 *
 * Promise-based so call-sites (and the audio layer) can sequence against it.
 * Reduced motion ⇒ instant cut, no overlay.
 *
 * App Router port: navigations commit asynchronously, so the cover is held
 * until the new pathname actually renders (with a short timeout fallback for
 * actions that don't change the path).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useFx } from "./MotionProvider";
import { useAudio } from "./audio/useAudio";

export type WipePhase = "idle" | "closing" | "covered" | "opening";

/** A path to navigate to, or a callback that performs the navigation itself
 *  (needed when auth state must change or storage must be written first). */
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
/** Upper bound on waiting for the App Router to commit — covers actions that
 *  navigate to the current path or don't navigate at all. */
const ROUTE_COMMIT_TIMEOUT_MS = 600;

const TransitionContext = createContext<TransitionContextValue | null>(null);

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const nextFrames = (n: number) =>
  new Promise<void>((resolve) => {
    let left = n;
    const step = () => (--left <= 0 ? resolve() : void requestAnimationFrame(step));
    requestAnimationFrame(step);
  });

export function TransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { reducedMotion } = useFx();
  const { play } = useAudio();
  const [phase, setPhase] = useState<WipePhase>("idle");
  const [instant, setInstant] = useState(false);
  const busyRef = useRef(false);
  const pendingCommit = useRef<{ fromPath: string; resolve: () => void } | null>(null);

  /* Resolve the in-flight wipe as soon as the new route's pathname renders. */
  useEffect(() => {
    const pending = pendingCommit.current;
    if (pending && pathname !== pending.fromPath) {
      pendingCommit.current = null;
      pending.resolve();
    }
  }, [pathname]);

  const run = useCallback(
    (action: WipeAction) => {
      if (typeof action === "function") action();
      else router.push(action);
    },
    [router],
  );

  const waitForCommit = useCallback((fromPath: string) => {
    return new Promise<void>((resolve) => {
      const settle = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        if (pendingCommit.current?.resolve === settle) pendingCommit.current = null;
        resolve();
      }, ROUTE_COMMIT_TIMEOUT_MS);
      pendingCommit.current = { fromPath, resolve: settle };
    });
  }, []);

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
      const committed = waitForCommit(window.location.pathname);
      run(action);
      setPhase("covered");
      await committed;
      await nextFrames(2);
      setPhase("opening");
      await delay(OPEN_MS);
      setPhase("idle");
      busyRef.current = false;
    },
    [run, reducedMotion, play, waitForCommit],
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
      const committed = waitForCommit(window.location.pathname);
      run(action);
      await committed;
      await nextFrames(2);
      setInstant(false);
      setPhase("opening");
      await delay(OPEN_MS);
      setPhase("idle");
      busyRef.current = false;
    },
    [run, reducedMotion, waitForCommit],
  );

  const value = useMemo(
    () => ({ phase, instant, wipe, handoff }),
    [phase, instant, wipe, handoff],
  );

  return <TransitionContext.Provider value={value}>{children}</TransitionContext.Provider>;
}

export function useWipeNavigate(): TransitionContextValue {
  const ctx = useContext(TransitionContext);
  if (!ctx) throw new Error("useWipeNavigate must be used inside the fx providers");
  return ctx;
}
