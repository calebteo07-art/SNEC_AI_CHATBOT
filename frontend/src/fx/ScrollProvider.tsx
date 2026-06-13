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
import { usePathname } from "next/navigation";
import { useMotionValue, type MotionValue } from "motion/react";
import Lenis from "lenis";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { subscribeTicker } from "./ticker";
import { useFx } from "./MotionProvider";
import { pushSplat } from "./canvas/fluidBus";

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
  const pathname = usePathname();
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
    let lastBurst = 0;
    instance.on("scroll", (l: Lenis) => {
      velocity.set(l.velocity);
      ScrollTrigger.update();
      /* momentum disturbs the ink — edge splats rising with the scroll */
      const v = l.velocity;
      const now = performance.now();
      if (Math.abs(v) > 2 && now - lastBurst > 33) {
        lastBurst = now;
        const push = Math.max(-80, Math.min(80, v));
        pushSplat({ x: 0.15, y: 0.06, dx: -push * 0.004, dy: push * 0.014 });
        pushSplat({ x: 0.85, y: 0.06, dx: push * 0.004, dy: push * 0.014 });
      }
    });
    /* Let ScrollTrigger read/write the Lenis-managed scroller. */
    ScrollTrigger.scrollerProxy(wrapper, {
      scrollTop(value?: number) {
        if (value !== undefined) instance.scrollTo(value, { immediate: true });
        return instance.scroll;
      },
      getBoundingClientRect() {
        return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
      },
    });
    ScrollTrigger.defaults({ scroller: wrapper });
    ScrollTrigger.refresh();
    const unsubscribe = subscribeTicker((time) => instance.raf(time));
    lenisRef.current = instance;
    setLenis(instance);

    return () => {
      unsubscribe();
      instance.destroy();
      lenisRef.current = null;
      setLenis(null);
      velocity.set(0);
      ScrollTrigger.defaults({ scroller: undefined });
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
  const fallbackRef = useRef<HTMLDivElement | null>(null);
  const fallbackVelocity = useMotionValue(0);
  /* AURORA teardown: with no ScrollProvider mounted (the AURORA shell uses
   * native scroll), return an inert context so legacy screens that read it keep
   * rendering — their scroll-driven effects simply no-op until rebuilt. */
  if (ctx) return ctx;
  return { scrollerRef: fallbackRef, velocity: fallbackVelocity, lenis: null };
}

/** Null-safe variant for components that may render outside the shell. */
export function useShellScrollMaybe(): ScrollContextValue | null {
  return useContext(ScrollContext);
}
