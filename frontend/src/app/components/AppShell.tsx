import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useAuth } from "./AuthContext";
import { syncStreakFromBackend, syncHeartsFromBackend } from "../utils/gamification";

/* ── Nav definitions ──────────────────────────────────────── */
const STUDENT_NAV = [
  { path: "/dashboard", label: "Learn",    icon: LearnIcon    },
  { path: "/cases",     label: "Cases",    icon: CasesIcon    },
  { path: "/chat",      label: "Tutor",    icon: TutorIcon    },
  { path: "/progress",  label: "Progress", icon: ProgressIcon },
] as const;

const ADMIN_NAV = [
  { path: "/admin", label: "Admin", icon: AdminIcon },
] as const;

const SUPERVISOR_NAV = [
  { path: "/supervisor", label: "Reports", icon: ProgressIcon },
] as const;

/* ── AppShell ─────────────────────────────────────────────── */
export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [xp, setXp]         = useState(0);
  const [streak, setStreak]  = useState(0);
  const [hearts, setHearts]  = useState(5);
  const [level, setLevel]    = useState(1);

  useEffect(() => {
    fetch("/api/progress", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        setStreak(d.streak ?? 0);
        setXp(d.xp ?? 0);
        setHearts(d.hearts ?? 5);
        setLevel(d.level ?? 1);
        syncStreakFromBackend(d.streak ?? 0);
        syncHeartsFromBackend(d.hearts ?? 5);
      })
      .catch(() => {});
  }, [pathname]);

  // Suppress unused warning — logout available via ProfileScreen
  void logout;

  const role = user?.role ?? "student";
  const NAV = role === "admin" ? ADMIN_NAV : role === "supervisor" ? SUPERVISOR_NAV : STUDENT_NAV;

  const activeRoute = [...STUDENT_NAV, ...ADMIN_NAV, ...SUPERVISOR_NAV].find(n => pathname.startsWith(n.path))?.path ?? "";

  const initials = (user?.fullName ?? "?")
    .split(" ")
    .map(w => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const currentLevelBase = (level - 1) * 500;
  const xpIntoLevel = Math.max(0, xp - currentLevelBase);
  const xpFillPct = Math.min(100, Math.round((xpIntoLevel / 500) * 100));

  const roleLabel = role === "student" ? (user?.studentRole ?? "Student") : role === "admin" ? "Admin" : "Supervisor";

  return (
    <div className="app">
      {/* ── Sidebar ───────────────────────────────────────── */}
      <nav className="sidebar" aria-label="Main navigation">
        {/* Ghost eye texture */}
        <img
          src="/anatomy/eye-hero.png"
          className="sidebar-ghost"
          aria-hidden="true"
          alt=""
        />

        {/* Logo row */}
        <button
          className="sidebar-logo"
          onClick={() => navigate("/dashboard")}
          aria-label="EyeBot home"
        >
          <div className="sidebar-logo-icon">
            <EyeSvgLogo />
          </div>
          <span className="sidebar-brand-text">EyeBot</span>
        </button>

        {/* Nav items */}
        <div className="sidebar-nav">
          {NAV.map(({ path, label, icon: Icon }) => (
            <button
              key={path}
              className={`nav-item${activeRoute === path ? " active" : ""}`}
              onClick={() => navigate(path)}
              aria-label={label}
              aria-current={activeRoute === path ? "page" : undefined}
            >
              <Icon active={activeRoute === path} />
              {label}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Gamification stats — student only */}
        {role === "student" && (
          <div className="sidebar-stats">
            <div className="sidebar-stat-label">Performance</div>

            <div className="sidebar-stat-row">
              <FlameIcon />
              <span className="sidebar-stat-val">{streak}</span>
              <span>day streak</span>
            </div>

            <div className="sidebar-stat-row">
              <StarIcon />
              <span className="sidebar-stat-val">{xp}</span>
              <span>XP · Lv {level}</span>
            </div>

            <div className="sidebar-stat-row">
              <HeartIcon />
              <span className="sidebar-stat-val">{hearts}</span>
              <span>/ 5 hearts</span>
            </div>

            <div className="sidebar-xp-wrap">
              <div className="sidebar-xp-label">
                Lv {level} → {level + 1} · {xpIntoLevel} / 500 xp
              </div>
              <div className="sidebar-xp-track">
                <div className="sidebar-xp-fill" style={{ width: `${xpFillPct}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* User card → profile */}
        <button
          className="sidebar-user"
          onClick={() => navigate("/profile")}
          aria-label="View profile"
        >
          <div className="sidebar-avatar">{initials}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user?.fullName ?? "User"}</div>
            <div className="sidebar-user-role">{roleLabel}</div>
          </div>
        </button>
      </nav>

      {/* ── Main column ───────────────────────────────────── */}
      <div className="main">
        <main className="content">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="bottom-nav" aria-label="Main navigation">
        {NAV.map(({ path, label, icon: Icon }) => (
          <button
            key={path}
            className={`bottom-nav-item${activeRoute === path ? " active" : ""}`}
            onClick={() => navigate(path)}
            aria-label={label}
          >
            <Icon active={activeRoute === path} />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

/* ── SVG assets ───────────────────────────────────────────── */

function EyeSvgLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 26 26" fill="none">
      <ellipse cx="13" cy="13" rx="11" ry="7" stroke="#fff" strokeWidth="1.8" />
      <circle cx="13" cy="13" r="4.5" fill="#fff" />
      <circle cx="14.5" cy="11.5" r="1.6" fill="rgba(6,182,212,0.5)" />
      <circle cx="13" cy="13" r="2" fill="rgba(6,13,24,0.85)" />
    </svg>
  );
}

function LearnIcon({ active }: { active: boolean }) {
  const c = active ? "#22d3ee" : "rgba(255,255,255,0.38)";
  return (
    <svg width="18" height="18" viewBox="0 0 22 22" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M3 11L11 3L19 11V19H14V14H8V19H3V11Z"
        fill={active ? "rgba(34,211,238,0.18)" : "none"}
        stroke={c} strokeWidth="1.6" strokeLinejoin="round"
      />
    </svg>
  );
}

function CasesIcon({ active }: { active: boolean }) {
  const c = active ? "#22d3ee" : "rgba(255,255,255,0.38)";
  return (
    <svg width="18" height="18" viewBox="0 0 22 22" fill="none" style={{ flexShrink: 0 }}>
      <rect x="3" y="7" width="16" height="12" rx="2" stroke={c} strokeWidth="1.6" />
      <path d="M8 7V5.5C8 4.67 8.67 4 9.5 4H12.5C13.33 4 14 4.67 14 5.5V7" stroke={c} strokeWidth="1.6" />
      <line x1="7" y1="12" x2="15" y2="12" stroke={c} strokeWidth="1.4" strokeLinecap="round" opacity={0.7} />
      <line x1="7" y1="15" x2="12" y2="15" stroke={c} strokeWidth="1.4" strokeLinecap="round" opacity={0.45} />
    </svg>
  );
}

function TutorIcon({ active }: { active: boolean }) {
  const c = active ? "#22d3ee" : "rgba(255,255,255,0.38)";
  return (
    <svg width="18" height="18" viewBox="0 0 22 22" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M4 5H18C18.55 5 19 5.45 19 6V14C19 14.55 18.55 15 18 15H8L4 18V6C4 5.45 4.45 5 5 5H4Z"
        fill={active ? "rgba(34,211,238,0.18)" : "none"}
        stroke={c} strokeWidth="1.6" strokeLinejoin="round"
      />
      <circle cx="8"  cy="10" r="1" fill={c} />
      <circle cx="11" cy="10" r="1" fill={c} />
      <circle cx="14" cy="10" r="1" fill={c} />
    </svg>
  );
}

function AdminIcon({ active }: { active: boolean }) {
  const c = active ? "#22d3ee" : "rgba(255,255,255,0.38)";
  return (
    <svg width="18" height="18" viewBox="0 0 22 22" fill="none" style={{ flexShrink: 0 }}>
      <path d="M11 3L19 7V11C19 15.1 16.4 18.9 11 20C5.6 18.9 3 15.1 3 11V7L11 3Z"
        fill={active ? "rgba(34,211,238,0.18)" : "none"}
        stroke={c} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 11L10 13L14 9" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProgressIcon({ active }: { active: boolean }) {
  const c = active ? "#22d3ee" : "rgba(255,255,255,0.38)";
  return (
    <svg width="18" height="18" viewBox="0 0 22 22" fill="none" style={{ flexShrink: 0 }}>
      <rect x="3"  y="14" width="4" height="5" rx="1" fill={active ? "rgba(34,211,238,0.5)" : c} />
      <rect x="9"  y="10" width="4" height="9" rx="1" fill={active ? "rgba(34,211,238,0.5)" : c} />
      <rect x="15" y="6"  width="4" height="13" rx="1" fill={active ? "#22d3ee" : c} />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="var(--streak)">
      <path d="M8 1.5C8 1.5 4 6 4 9.5C4 11.7 5.8 13.5 8 13.5C10.2 13.5 12 11.7 12 9.5C12 6 8 1.5 8 1.5Z" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="var(--gold)">
      <polygon points="7,1.5 8.8,5.5 13,5.9 10,8.6 11,12.5 7,10.2 3,12.5 4,8.6 1,5.9 5.2,5.5" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="var(--heart)">
      <path d="M8 13C8 13 2 9 2 5.5C2 3.57 3.57 2 5.5 2C6.61 2 7.6 2.52 8 3.36C8.4 2.52 9.39 2 10.5 2C12.43 2 14 3.57 14 5.5C14 9 8 13 8 13Z" />
    </svg>
  );
}
