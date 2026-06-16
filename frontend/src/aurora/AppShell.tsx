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
import { ConsoleRail } from "./components/ConsoleRail";
import { CommandPalette, type Destination } from "./components/CommandPalette";
import { RouteReveal } from "@/fx/Reveal";

const STUDY: Destination[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/chat", label: "Tutor" },
  { href: "/cases", label: "Virtual Patients" },
  { href: "/flashcards", label: "Flashcards" },
];
/* Staff palettes mirror the ConsoleRail nav — no student surfaces. */
const ADMIN_DEST: Destination[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/students", label: "Students" },
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/activity", label: "Activity" },
  { href: "/profile", label: "Profile" },
];
const SUPERVISOR_DEST: Destination[] = [
  { href: "/supervisor", label: "Supervisor" },
  { href: "/admin", label: "Admin" },
  { href: "/profile", label: "Profile" },
];

export function AppShell({ children }: { children: ReactNode }) {
  useReducedMotion(); // AURORA owns html[data-motion] now that the legacy MotionProvider is gone
  const { user } = useAuth();
  const { data: progress } = useProgress();
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);

  /* The rail auto-collapses to an icon strip on every page (reclaiming width for
     content) and peeks open on hover. A pin locks it open; the choice persists. */
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
  const railState = pinned ? "pinned" : "collapsed";

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
  const isStaff = role === "admin" || role === "supervisor";
  const destinations = useMemo<Destination[]>(() => {
    if (role === "admin") return ADMIN_DEST;
    if (role === "supervisor") return SUPERVISOR_DEST;
    return STUDY;
  }, [role]);

  /* Staff get the dark "control console": a dedicated oversight-only rail on the
     same mesh/scroll markup, re-themed by the .console-dark scope. Students keep
     the light AURORA shell untouched. */
  if (isStaff) {
    return (
      <div className="aurora-shell console-dark" data-rail={railState}>
        <ConsoleRail onOpenPalette={() => setPaletteOpen(true)} pinned={pinned} onTogglePin={togglePin} />
        <main id="main" className="aurora-main">
          <div className="aurora-mesh" aria-hidden><span /><span /><span /></div>
          <div className="aurora-main-scroll">{children}</div>
        </main>
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} destinations={destinations} />
      </div>
    );
  }

  /* Immersive routes — on /chat and /flashcards the rail + mesh fall away and the
     screen fills the whole viewport. The Tutor is IG-DM full screen; Flashcards is
     "The Aperture", a self-themed Twilight world. ⌘K still works; each screen owns
     its own labelled back/exit affordance. Reached only for non-staff (staff above). */
  if (pathname === "/chat" || pathname === "/flashcards") {
    return (
      <div className="aurora-shell aurora-shell-immersive">
        <main id="main" className="aurora-main">
          <div className="aurora-main-scroll">{children}</div>
        </main>
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} destinations={destinations} />
      </div>
    );
  }

  return (
    <div className="aurora-shell" data-rail={railState}>
      <AtlasRail onOpenPalette={() => setPaletteOpen(true)} pinned={pinned} onTogglePin={togglePin} />
      <main id="main" className="aurora-main">
        <div className="aurora-mesh" aria-hidden><span /><span /><span /></div>
        <div className="aurora-main-scroll"><RouteReveal>{children}</RouteReveal></div>
      </main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} destinations={destinations} />
    </div>
  );
}
