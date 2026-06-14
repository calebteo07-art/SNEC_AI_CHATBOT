"use client";
/* AURORA application shell — Atlas Rail + a calm drifting mesh canvas behind
   native-scrolling content, plus the ⌘K command palette. Replaces the legacy
   topbar/pill-nav AppShell. No Lenis, no fluid canvas — motion is CSS-only and
   freezes under reduced motion. */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/screens/AuthContext";
import { useProgress } from "@/hooks/useProgress";
import { useReducedMotion } from "@/aurora/motion";
import { syncStreakFromBackend } from "@/lib/legacy/gamification";
import { AtlasRail } from "./components/AtlasRail";
import { CommandPalette, type Destination } from "./components/CommandPalette";

const STUDY: Destination[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/chat", label: "Tutor" },
  { href: "/cases", label: "Cases" },
  { href: "/flashcards", label: "Flashcards" },
];
const INSIGHT: Destination[] = [
  { href: "/progress", label: "Progress" },
  { href: "/summary", label: "Summary" },
];
const OVERSIGHT: Destination[] = [
  { href: "/supervisor", label: "Supervisor" },
  { href: "/admin", label: "Admin" },
];

export function AppShell({ children }: { children: ReactNode }) {
  useReducedMotion(); // AURORA owns html[data-motion] now that the legacy MotionProvider is gone
  const { user } = useAuth();
  const { data: progress } = useProgress();
  const [paletteOpen, setPaletteOpen] = useState(false);

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
  const destinations = useMemo<Destination[]>(
    () => [...STUDY, ...INSIGHT, ...(role === "admin" || role === "supervisor" ? OVERSIGHT : [])],
    [role],
  );

  return (
    <div className="aurora-shell">
      <AtlasRail onOpenPalette={() => setPaletteOpen(true)} />
      <main id="main" className="aurora-main">
        <div className="aurora-mesh" aria-hidden><span /><span /><span /></div>
        <div className="aurora-main-scroll">{children}</div>
      </main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} destinations={destinations} />
    </div>
  );
}
