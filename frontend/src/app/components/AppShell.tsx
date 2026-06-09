import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useAuth } from "./AuthContext";
import { useProgress } from "../../hooks/useProgress";
import { syncStreakFromBackend, syncHeartsFromBackend } from "../utils/gamification";
import { GuidedTour } from "./GuidedTour";

const STUDENT_NAV = [
  { path: "/dashboard",  label: "Learn",    icon: LearnIcon    },
  { path: "/cases",      label: "Cases",    icon: CasesIcon    },
  { path: "/flashcards", label: "Cards",    icon: CardsIcon    },
  { path: "/chat",       label: "Chat",     icon: ChatIcon     },
  { path: "/progress",   label: "Progress", icon: ProgressIcon },
] as const;

const ADMIN_NAV = [
  { path: "/admin", label: "Admin", icon: AdminIcon },
] as const;

const SUPERVISOR_NAV = [
  { path: "/supervisor", label: "Reports", icon: ProgressIcon },
] as const;

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data: progress } = useProgress();

  useEffect(() => {
    if (!progress) return;
    syncStreakFromBackend(progress.streak);
    syncHeartsFromBackend(progress.hearts);
  }, [progress]);

  const role = user?.role ?? "student";
  const NAV = role === "admin" ? ADMIN_NAV : role === "supervisor" ? SUPERVISOR_NAV : STUDENT_NAV;
  const ALL_PATHS = [...STUDENT_NAV, ...ADMIN_NAV, ...SUPERVISOR_NAV];
  const activeRoute = ALL_PATHS.find(n => pathname === n.path || pathname.startsWith(n.path + "/"))?.path ?? "";

  const homeRoute = role === "admin" ? "/admin" : role === "supervisor" ? "/supervisor" : "/dashboard";

  return (
    <div style={{ background: "#181717", minHeight: "100vh" }}>
      {/* Fixed top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
        <div className="flex justify-between items-center px-5 py-4">
          <button
            onClick={() => navigate(homeRoute)}
            className="pointer-events-auto text-[#F4EFE7] text-base font-medium tracking-[-0.03em]"
          >
            EyeBot®
          </button>
          <button
            onClick={() => { logout(); navigate("/"); }}
            className="pointer-events-auto text-[#F4EFE7]/40 text-xs hover:text-[#F4EFE7]/70 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Page content */}
      <div className="pt-16 pb-28">
        <Outlet />
      </div>

      {/* Fixed bottom pill nav */}
      <div className="fixed bottom-8 left-0 right-0 flex justify-center z-50 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-1 bg-[#F4EFE7] rounded-full px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          {NAV.map(({ path, label, icon: Icon }) => {
            const active = pathname === path || pathname.startsWith(path + "/");
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-full transition-all text-[10px] font-semibold${active ? " bg-[#181717] text-[#F4EFE7]" : " text-[#181717]/60 hover:text-[#181717]"}`}
              >
                <Icon active={active} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

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
