"use client";
/* PHOTOPIC · motion governance
 * Single source of truth for reduced-motion and the device performance tier.
 * Every effect layer (Lenis, fluid, gaze, liquid, GSAP) consults this context;
 * tier "off" means motion is reduced — everything degrades to static.
 *
 * Two inputs can reduce motion: the OS media query, and the user's in-app
 * toggle (persisted at localStorage["eyebot_motion"]). The resolved state is
 * mirrored to <html data-motion="on|off"> so CSS and gsap.matchMedia can key
 * off it without React.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { MotionConfig } from "motion/react";

export type FxTier = "high" | "low" | "off";
export type MotionPref = "auto" | "reduced";

const MOTION_PREF_KEY = "eyebot_motion";

interface FxContextValue {
  /** "high" = full effects, "low" = no WebGL extras, "off" = reduced motion. */
  tier: FxTier;
  reducedMotion: boolean;
  /** Mouse-like pointer present — gates magnetic pull and hover shaders. */
  finePointer: boolean;
  /** The user's in-app override (profile toggle). */
  motionPref: MotionPref;
  setMotionPref: (pref: MotionPref) => void;
}

const FxContext = createContext<FxContextValue>({
  tier: "high",
  reducedMotion: false,
  finePointer: true,
  motionPref: "auto",
  setMotionPref: () => {},
});

function useMedia(query: string): boolean {
  /* Hydration-safe: server and first client render agree on `false`; the
   * effect corrects immediately after mount (consumers render in providers
   * that ARE server-rendered, unlike the ssr:false screens). */
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

function detectHardwareTier(): "high" | "low" {
  if (typeof navigator === "undefined") return "high";
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  if (nav.connection?.saveData) return "low";
  if (nav.deviceMemory !== undefined && nav.deviceMemory < 4) return "low";
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) return "low";
  return "high";
}

export function MotionProvider({ children }: { children: ReactNode }) {
  const mediaReduced = useMedia("(prefers-reduced-motion: reduce)");
  const finePointer = useMedia("(pointer: fine)");
  const [hwTier] = useState<"high" | "low">(detectHardwareTier);
  const [motionPref, setMotionPrefState] = useState<MotionPref>("auto");

  useEffect(() => {
    try {
      if (localStorage.getItem(MOTION_PREF_KEY) === "reduced") setMotionPrefState("reduced");
    } catch { /* private mode */ }
  }, []);

  const setMotionPref = useCallback((pref: MotionPref) => {
    setMotionPrefState(pref);
    try {
      if (pref === "reduced") localStorage.setItem(MOTION_PREF_KEY, "reduced");
      else localStorage.removeItem(MOTION_PREF_KEY);
    } catch { /* private mode */ }
  }, []);

  const reducedMotion = mediaReduced || motionPref === "reduced";

  /* CSS + gsap.matchMedia hook: html[data-motion="off"] */
  useEffect(() => {
    document.documentElement.setAttribute("data-motion", reducedMotion ? "off" : "on");
  }, [reducedMotion]);

  const value = useMemo<FxContextValue>(
    () => ({
      tier: reducedMotion ? "off" : hwTier,
      reducedMotion,
      finePointer,
      motionPref,
      setMotionPref,
    }),
    [reducedMotion, finePointer, hwTier, motionPref, setMotionPref],
  );

  return (
    <FxContext.Provider value={value}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </FxContext.Provider>
  );
}

export function useFx(): FxContextValue {
  return useContext(FxContext);
}
