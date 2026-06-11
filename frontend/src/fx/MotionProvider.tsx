/* DARK ADAPTATION · motion governance
 * Single source of truth for reduced-motion and the device performance tier.
 * Every effect layer (Lenis, cursor, gaze, liquid, blur) consults this context;
 * tier "off" means the user asked for reduced motion — everything degrades to static.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { MotionConfig } from "motion/react";

export type FxTier = "high" | "low" | "off";

interface FxContextValue {
  /** "high" = full effects, "low" = no blur/WebGL extras, "off" = reduced motion. */
  tier: FxTier;
  reducedMotion: boolean;
  /** Mouse-like pointer present — gates cursor, magnetic, hover shaders. */
  finePointer: boolean;
}

const FxContext = createContext<FxContextValue>({
  tier: "high",
  reducedMotion: false,
  finePointer: true,
});

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
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
  const reducedMotion = useMedia("(prefers-reduced-motion: reduce)");
  const finePointer = useMedia("(pointer: fine)");
  const [hwTier] = useState<"high" | "low">(detectHardwareTier);

  const value = useMemo<FxContextValue>(
    () => ({
      tier: reducedMotion ? "off" : hwTier,
      reducedMotion,
      finePointer,
    }),
    [reducedMotion, finePointer, hwTier],
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
