"use client";
/* AURORA application shell — Atlas Rail + a calm drifting mesh canvas behind
   native-scrolling content, plus the ⌘K command palette. Replaces the legacy
   topbar/pill-nav AppShell. No Lenis, no fluid canvas — motion is CSS-only and
   freezes under reduced motion. */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/screens/AuthContext";
import { useProgress } from "@/hooks/useProgress";
import { useReducedMotion } from "@/aurora/motion";
import { syncStreakFromBackend } from "@/lib/legacy/gamification";
import { AtlasRail } from "./components/AtlasRail";
import { CommandPalette, type Destination } from "./components/CommandPalette";
import { RouteReveal } from "@/fx/Reveal";

const STUDY: Destination[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/flashcards", label: "Flashcards" },
  { href: "/chat", label: "Tutor" },
  { href: "/cases", label: "Virtual Patients" },
];
/* Trainers/admins get one extra palette destination — the Analytics page. */
const ANALYTICS_DEST: Destination = { href: "/analytics", label: "Analytics" };

export function AppShell({ children }: { children: ReactNode }) {
  useReducedMotion(); // AURORA owns html[data-motion] now that the legacy MotionProvider is gone
  const { user } = useAuth();
  const { data: progress } = useProgress();
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);

  /* The rail is fully hidden on every page — content runs edge-to-edge and a slim
     gradient handle floats at the left margin. Hovering the handle (or the rail,
     or tabbing in) glides the rail back as an overlay; clicking the handle, or
     the in-rail pin, locks it open. The choice persists. */
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    try { setPinned(localStorage.getItem("eyebot_rail_pinned") === "1"); } catch { /* no storage */ }
  }, []);
  const togglePin = useCallback(() => {
    setPinned((p) => {
      const next = !p;
      try { localStorage.setItem("eyebot_rail_pinned", next ? "1" : "0"); } catch { /* no storage */ }
      return next;
    });
  }, []);
  const railState = pinned ? "pinned" : "hidden";

  /* Mirror the backend streak into the local cache, as the legacy shell did. */
  useEffect(() => {
    if (!progress) return;
    syncStreakFromBackend(progress.streak);
  }, [progress]);

  /* Global ⌘K / Ctrl+K toggles the palette. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const role = user?.role ?? "student";
  const destinations = useMemo<Destination[]>(() => {
    if (role === "admin" || role === "trainer") return [...STUDY, ANALYTICS_DEST];
    return STUDY;
  }, [role]);

  /* Immersive routes — on /chat and /flashcards the mesh falls away and the screen
     fills the whole viewport. The Tutor is IG-DM full screen; Flashcards is "The
     Aperture", a self-themed Twilight world. The rail stays a hover-reveal overlay
     here too (handle + AtlasRail) so navigation is one gesture away on every page;
     it never reflows the immersive canvas (CSS pins --rail-w at 0). ⌘K still works. */
  const immersive = pathname === "/chat" || pathname === "/flashcards";

  return (
    <div className={`aurora-shell${immersive ? " aurora-shell-immersive" : ""}`} data-rail={railState}>
      {!pinned && <RailHandle onReveal={togglePin} />}
      <AtlasRail onOpenPalette={() => setPaletteOpen(true)} pinned={pinned} onTogglePin={togglePin} />
      <main id="main" className="aurora-main">
        {!immersive && <div className="aurora-mesh" aria-hidden><span /><span /><span /></div>}
        <div className="aurora-main-scroll">{immersive ? children : <RouteReveal>{children}</RouteReveal>}</div>
      </main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} destinations={destinations} />
    </div>
  );
}

/* Edge handle — the only always-visible nav affordance when the rail is hidden.
   A frosted chip with a breathing Gemini-gradient spine + chevron. Hovering it
   reveals the rail (pure CSS via :has); clicking it pins the rail open. It rides
   outside the rail so it stays put while the rail glides over it, and is hidden
   on mobile (the bottom bar owns navigation there). */
function RailHandle({ onReveal }: { onReveal: () => void }) {
  return (
    <button
      type="button"
      className="aurora-rail-handle"
      onClick={onReveal}
      aria-label="Show navigation sidebar"
      title="Show navigation"
    >
      <span className="aurora-handle-chevron" aria-hidden>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </span>
    </button>
  );
}
