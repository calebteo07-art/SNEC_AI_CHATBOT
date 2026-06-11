import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useOutlet } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { useAuth } from "./AuthContext";
import { useProgress } from "../../hooks/useProgress";
import { syncStreakFromBackend, syncHeartsFromBackend } from "../utils/gamification";
import { GuidedTour } from "./GuidedTour";
import { useFx, useWipeNavigate, useAudio, ScrollProvider } from "../../fx";
import { springs, focusPull, focusPullLite } from "../utils/springs";

const STUDENT_NAV = [
  { path: "/dashboard",  label: "Learn",    icon: LearnIcon,    tour: "learn"    },
  { path: "/cases",      label: "Cases",    icon: CasesIcon,    tour: "cases"    },
  { path: "/flashcards", label: "Cards",    icon: CardsIcon,    tour: undefined  },
  { path: "/chat",       label: "Chat",     icon: ChatIcon,     tour: "chat"     },
  { path: "/progress",   label: "Progress", icon: ProgressIcon, tour: "progress" },
] as const;

const ADMIN_NAV = [
  { path: "/admin", label: "Admin", icon: AdminIcon, tour: undefined },
] as const;

const SUPERVISOR_NAV = [
  { path: "/supervisor", label: "Reports", icon: ProgressIcon, tour: undefined },
] as const;

/** Collapse nested admin tabs to one key so AdminLayout's own Outlet
 *  never gets crossfaded by the shell-level transition. */
function routeKey(pathname: string): string {
  if (pathname.startsWith("/admin")) return "/admin";
  return pathname;
}

/** Frozen outlet: captures the outlet element at mount so the exiting
 *  route keeps rendering its own tree during the crossfade. This is the
 *  pattern that makes AnimatePresence work with the data router. */
function AnimatedOutlet() {
  const outlet = useOutlet();
  const [frozen] = useState(outlet);
  return frozen;
}

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data: progress } = useProgress();
  const { wipe } = useWipeNavigate();
  const { play } = useAudio();
  const { tier } = useFx();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!progress) return;
    syncStreakFromBackend(progress.streak);
    syncHeartsFromBackend(progress.hearts);
  }, [progress]);

  const role = user?.role ?? "student";
  const NAV = role === "admin" ? ADMIN_NAV : role === "supervisor" ? SUPERVISOR_NAV : STUDENT_NAV;
  const homeRoute = role === "admin" ? "/admin" : role === "supervisor" ? "/supervisor" : "/dashboard";
  const pageVariants = tier === "high" ? focusPull : focusPullLite;

  return (
    <div style={{ background: "#181717", height: "100vh", overflow: "hidden" }}>
      {/* Fixed top bar */}
      <header className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
        <div className="flex justify-between items-center px-5 py-4">
          <button
            onClick={() => navigate(homeRoute)}
            className="pointer-events-auto text-[#F4EFE7] text-base font-medium tracking-[-0.03em]"
            data-cursor="ring"
          >
            EyeBot®
          </button>
          <button
            onClick={() => void wipe(() => { logout(); navigate("/"); })}
            className="pointer-events-auto text-[#F4EFE7]/40 text-xs hover:text-[#F4EFE7]/70 transition-colors"
            data-cursor="ring"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Page content — the shell scroller (Lenis wrapper on flowing routes) */}
      <ScrollProvider scrollerRef={scrollerRef} contentRef={contentRef}>
        <div
          ref={scrollerRef}
          style={{ height: "100%", overflowY: "auto", paddingTop: "64px", paddingBottom: "112px" }}
        >
          <div ref={contentRef} style={{ position: "relative", minHeight: "100%" }}>
            <main id="main" style={{ minHeight: "100%" }}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={routeKey(pathname)}
                  variants={pageVariants}
                  initial="initial"
                  animate="enter"
                  exit="exit"
                  style={{ position: "relative", minHeight: "100%" }}
                >
                  <AnimatedOutlet />
                </motion.div>
              </AnimatePresence>
            </main>
          </div>
        </div>
      </ScrollProvider>

      {/* Fixed bottom pill nav */}
      <nav
        aria-label="Primary"
        data-tour-host
        className="fixed bottom-8 left-0 right-0 flex justify-center z-50 pointer-events-none"
      >
        <div className="pointer-events-auto flex items-center gap-1 bg-[#F4EFE7] rounded-full px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          {NAV.map(({ path, label, icon: Icon, tour }) => {
            const active = pathname === path || pathname.startsWith(path + "/");
            return (
              <button
                key={path}
                onClick={() => { if (!active) play("tick"); navigate(path); }}
                data-tour={tour}
                data-cursor="ring"
                aria-current={active ? "page" : undefined}
                className="relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-full text-[10px] font-semibold"
              >
                {active && (
                  <motion.span
                    layoutId="nav-active-pill"
                    className="absolute inset-0 rounded-full bg-[#181717]"
                    transition={springs.snappy}
                    aria-hidden="true"
                  />
                )}
                <span
                  className={`relative z-[1] flex flex-col items-center gap-0.5 transition-colors duration-200${
                    active ? " text-[#F4EFE7]" : " text-[#181717]/60 hover:text-[#181717]"
                  }`}
                >
                  <Icon active={active} />
                  <span>{label}</span>
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {role === "student" && <GuidedTour />}
    </div>
  );
}

/* ── Icons (active = cream on dark pill, inactive = dark on cream pill) ── */

function LearnIcon({ active }: { active: boolean }) {
  const c = active ? "#F4EFE7" : "rgba(24,23,23,0.6)";
  return (
    <svg width="16" height="16" viewBox="0 0 22 22" fill="none" style={{ flexShrink: 0 }}>
      <path d="M3 11L11 3L19 11V19H14V14H8V19H3V11Z" stroke={c} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function CasesIcon({ active }: { active: boolean }) {
  const c = active ? "#F4EFE7" : "rgba(24,23,23,0.6)";
  return (
    <svg width="16" height="16" viewBox="0 0 22 22" fill="none" style={{ flexShrink: 0 }}>
      <rect x="3" y="7" width="16" height="12" rx="2" stroke={c} strokeWidth="1.6" />
      <path d="M8 7V5.5C8 4.67 8.67 4 9.5 4H12.5C13.33 4 14 4.67 14 5.5V7" stroke={c} strokeWidth="1.6" />
    </svg>
  );
}

function CardsIcon({ active }: { active: boolean }) {
  const c = active ? "#F4EFE7" : "rgba(24,23,23,0.6)";
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
      <rect x="3" y="5" width="14" height="10" rx="2" stroke={c} strokeWidth="1.4" />
      <line x1="3" y1="9" x2="17" y2="9" stroke={c} strokeWidth="1.4" />
    </svg>
  );
}

function ChatIcon({ active }: { active: boolean }) {
  const c = active ? "#F4EFE7" : "rgba(24,23,23,0.6)";
  return (
    <svg width="16" height="16" viewBox="0 0 22 22" fill="none" style={{ flexShrink: 0 }}>
      <path d="M4 5H18C18.55 5 19 5.45 19 6V14C19 14.55 18.55 15 18 15H8L4 18V6C4 5.45 4.45 5 5 5H4Z"
        stroke={c} strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="8"  cy="10" r="1" fill={c} />
      <circle cx="11" cy="10" r="1" fill={c} />
      <circle cx="14" cy="10" r="1" fill={c} />
    </svg>
  );
}

function ProgressIcon({ active }: { active: boolean }) {
  const c = active ? "#F4EFE7" : "rgba(24,23,23,0.6)";
  return (
    <svg width="16" height="16" viewBox="0 0 22 22" fill="none" style={{ flexShrink: 0 }}>
      <rect x="3"  y="14" width="4" height="5" rx="1" fill={c} />
      <rect x="9"  y="10" width="4" height="9" rx="1" fill={c} />
      <rect x="15" y="6"  width="4" height="13" rx="1" fill={c} />
    </svg>
  );
}

function AdminIcon({ active }: { active: boolean }) {
  const c = active ? "#F4EFE7" : "rgba(24,23,23,0.6)";
  return (
    <svg width="16" height="16" viewBox="0 0 22 22" fill="none" style={{ flexShrink: 0 }}>
      <path d="M11 3L19 7V11C19 15.1 16.4 18.9 11 20C5.6 18.9 3 15.1 3 11V7L11 3Z" stroke={c} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 11L10 13L14 9" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
