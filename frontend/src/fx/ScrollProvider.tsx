/* DARK ADAPTATION · momentum scroll
 * One Lenis instance bound to the AppShell scroller div, alive only on the
 * flowing pages. Task surfaces (chat, flashcards, case sessions, admin) get
 * native scroll by destroying the instance — lenis.stop() would lock the
 * wheel entirely, which is the wrong failure mode for a clinical tool.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useLocation } from "react-router";
import { useMotionValue, type MotionValue } from "motion/react";
import Lenis from "lenis";
import { subscribeTicker } from "./ticker";
import { useFx } from "./MotionProvider";

const LENIS_ROUTES = new Set([
  "/dashboard",
  "/cases",
  "/progress",
  "/summary",
  "/profile",
  "/supervisor",
]);

interface ScrollContextValue {
  scrollerRef: RefObject<HTMLDivElement | null>;
  /** Lenis scroll velocity; 0 whenever momentum scroll is inactive. */
  velocity: MotionValue<number>;
  lenis: Lenis | null;
}

const ScrollContext = createContext<ScrollContextValue | null>(null);

export function ScrollProvider({
  scrollerRef,
  contentRef,
  children,
}: {
  scrollerRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const { reducedMotion } = useFx();
  const velocity = useMotionValue(0);
  const [lenis, setLenis] = useState<Lenis | null>(null);
  const lenisRef = useRef<Lenis | null>(null);

  const enabled = !reducedMotion && LENIS_ROUTES.has(pathname);

  useEffect(() => {
    if (!enabled) return;
    const wrapper = scrollerRef.current;
    const content = contentRef.current;
    if (!wrapper || !content) return;

    const instance = new Lenis({
      wrapper,
      content,
      duration: 1.05,
      smoothWheel: true,
      syncTouch: false, // touch scrolling stays fully native
    });
    instance.on("scroll", (l: Lenis) => velocity.set(l.velocity));
    const unsubscribe = subscribeTicker((time) => instance.raf(time));
    lenisRef.current = instance;
    setLenis(instance);

    return () => {
      unsubscribe();
      instance.destroy();
      lenisRef.current = null;
      setLenis(null);
      velocity.set(0);
    };
  }, [enabled, scrollerRef, contentRef, velocity]);

  /* Every page starts at the top. Through Lenis when active so its internal
     animated position stays in sync with the DOM. */
  useEffect(() => {
    if (lenisRef.current) {
      lenisRef.current.scrollTo(0, { immediate: true, force: true });
    } else {
      scrollerRef.current?.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [pathname, scrollerRef]);

  const value = useMemo(
    () => ({ scrollerRef, velocity, lenis }),
    [scrollerRef, velocity, lenis],
  );

  return <ScrollContext.Provider value={value}>{children}</ScrollContext.Provider>;
}

export function useShellScroll(): ScrollContextValue {
  const ctx = useContext(ScrollContext);
  if (!ctx) throw new Error("useShellScroll must be used inside AppShell's ScrollProvider");
  return ctx;
}

/** Null-safe variant for components that may render outside the shell. */
export function useShellScrollMaybe(): ScrollContextValue | null {
  return useContext(ScrollContext);
}
