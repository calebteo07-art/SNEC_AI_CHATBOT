"use client";
/* AURORA application shell — Atlas Rail + a calm drifting mesh canvas behind
   native-scrolling content, plus the ⌘K command palette. Replaces the legacy
   topbar/pill-nav AppShell. No Lenis, no fluid canvas — motion is CSS-only and
   freezes under reduced motion. */
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
const INSIGHT: Destination[] = [
  { href: "/progress", label: "Progress" },
  { href: "/summary", label: "Summary" },
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
    return [...STUDY, ...INSIGHT];
  }, [role]);

  /* Staff get the dark "control console": a dedicated oversight-only rail on the
     same mesh/scroll markup, re-themed by the .console-dark scope. Students keep
     the light AURORA shell untouched. */
  if (isStaff) {
    return (
      <div className="aurora-shell console-dark">
        <ConsoleRail onOpenPalette={() => setPaletteOpen(true)} />
        <main id="main" className="aurora-main">
          <div className="aurora-mesh" aria-hidden><span /><span /><span /></div>
          <div className="aurora-main-scroll">{children}</div>
        </main>
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} destinations={destinations} />
      </div>
    );
  }

  /* Immersive Tutor — on /chat the rail + mesh fall away and the chat fills the
     whole viewport (IG-DM full screen). ⌘K still works; the in-chat back chevron
     returns to /dashboard. Reached only for non-staff (staff returned above). */
  if (pathname === "/chat") {
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
    <div className="aurora-shell">
      <AtlasRail onOpenPalette={() => setPaletteOpen(true)} />
      <main id="main" className="aurora-main">
        <div className="aurora-mesh" aria-hidden><span /><span /><span /></div>
        <div className="aurora-main-scroll"><RouteReveal>{children}</RouteReveal></div>
      </main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} destinations={destinations} />
    </div>
  );
}
