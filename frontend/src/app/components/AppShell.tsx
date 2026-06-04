import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useAuth } from "./AuthContext";

/* ── Nav items ────────────────────────────────────────────── */
const NAV = [
  { path: "/dashboard", label: "Learn",    icon: LearnIcon    },
  { path: "/cases",     label: "Cases",    icon: CasesIcon    },
  { path: "/chat",      label: "Tutor",    icon: TutorIcon    },
  { path: "/progress",  label: "Progress", icon: ProgressIcon },
] as const;

/* ── AppShell ─────────────────────────────────────────────── */
export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [xp, setXp]         = useState(0);
  const [xpGoal]             = useState(200);
  const [streak, setStreak]  = useState(0);
  const [hearts]              = useState(5);

  useEffect(() => {
    fetch("/api/progress", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        setStreak(d.streak ?? 0);
        const sessions = d.session_count ?? 0;
        setXp(Math.min((sessions % 10) * 20, 200));
      })
      .catch(() => { /* keep defaults */ });
  }, [pathname]);

  const activeRoute = NAV.find(n => pathname.startsWith(n.path))?.path ?? "";
  const crumb = NAV.find(n => pathname.startsWith(n.path))?.label ?? "";

  const initials = (user?.fullName ?? "?")
    .split(" ")
    .map(w => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const xpFillPct = Math.round((xp / xpGoal) * 100);

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

        {/* Logo */}
        <button
          className="sidebar-logo"
          onClick={() => navigate("/dashboard")}
          aria-label="EyeBot home"
        >
          <EyeSvgLogo />
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

        {/* User avatar */}
        <button
          className="sidebar-avatar"
          onClick={logout}
          title={`${user?.fullName ?? "User"} — click to sign out`}
          aria-label="Sign out"
        >
          {initials}
        </button>
      </nav>

      {/* ── Main column ───────────────────────────────────── */}
      <div className="main">
        {/* Topbar */}
        <header className="topbar">
          <span className="topbar-brand">
            EyeBot
            {crumb && (
              <span className="topbar-brand-crumb"> / {crumb}</span>
            )}
          </span>

          {/* XP progress bar */}
          <div className="topbar-xp-wrap">
            <span className="topbar-xp-label">
              {xp} / {xpGoal} xp
            </span>
            <div className="topbar-xp-track" role="progressbar" aria-valuenow={xpFillPct} aria-valuemin={0} aria-valuemax={100}>
              <div
                className="topbar-xp-fill"
                style={{ width: `${xpFillPct}%` }}
              />
            </div>
          </div>

          {/* Stat pills */}
          <div className="topbar-pills">
            <div className="stat-pill stat-pill--streak" aria-label={`${streak} day streak`}>
              <FlameIcon />
              {streak}
            </div>
            <div className="stat-pill stat-pill--xp" aria-label={`${xp} XP`}>
              <StarIcon />
              {xp} XP
            </div>
            <div className="stat-pill stat-pill--hearts" aria-label={`${hearts} hearts`}>
              <HeartIcon />
              {hearts}
            </div>
          </div>
        </header>

        {/* Screen content */}
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
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
      <ellipse cx="13" cy="13" rx="11" ry="7" stroke="#fff" strokeWidth="1.8" />
      <circle cx="13" cy="13" r="4.5" fill="#fff" />
      <circle cx="14.5" cy="11.5" r="1.6" fill="rgba(8,145,178,0.55)" />
      <circle cx="13" cy="13" r="2" fill="rgba(6,13,24,0.85)" />
    </svg>
  );
}

function LearnIcon({ active }: { active: boolean }) {
  const c = active ? "#22d3ee" : "rgba(255,255,255,0.38)";
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path
        d="M3 11L11 3L19 11V19H14V14H8V19H3V11Z"
        fill={active ? "rgba(34,211,238,0.18)" : "none"}
        stroke={c}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CasesIcon({ active }: { active: boolean }) {
  const c = active ? "#22d3ee" : "rgba(255,255,255,0.38)";
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
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
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path
        d="M4 5H18C18.55 5 19 5.45 19 6V14C19 14.55 18.55 15 18 15H8L4 18V6C4 5.45 4.45 5 5 5H4Z"
        fill={active ? "rgba(34,211,238,0.18)" : "none"}
        stroke={c}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="8"  cy="10" r="1" fill={c} />
      <circle cx="11" cy="10" r="1" fill={c} />
      <circle cx="14" cy="10" r="1" fill={c} />
    </svg>
  );
}

function ProgressIcon({ active }: { active: boolean }) {
  const c = active ? "#22d3ee" : "rgba(255,255,255,0.38)";
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <rect x="3" y="14" width="4" height="5" rx="1" fill={active ? "rgba(34,211,238,0.5)" : c} />
      <rect x="9" y="10" width="4" height="9" rx="1" fill={active ? "rgba(34,211,238,0.5)" : c} />
      <rect x="15" y="6"  width="4" height="13" rx="1" fill={active ? "#22d3ee" : c} />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5C8 1.5 4 6 4 9.5C4 11.7 5.8 13.5 8 13.5C10.2 13.5 12 11.7 12 9.5C12 6 8 1.5 8 1.5Z" fill="currentColor" opacity={0.9} />
      <path d="M8 7.5C8 7.5 6.5 9.5 6.5 10.5C6.5 11.05 7 11.5 7.5 11.5C7.5 11.5 7.2 10.5 8 9.5C8.8 10.5 8.5 11.5 8.5 11.5C9 11.5 9.5 11.05 9.5 10.5C9.5 9.5 8 7.5 8 7.5Z" fill="rgba(255,255,255,0.5)" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <polygon points="7,1.5 8.8,5.5 13,5.9 10,8.6 11,12.5 7,10.2 3,12.5 4,8.6 1,5.9 5.2,5.5" fill="currentColor" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M8 13C8 13 2 9 2 5.5C2 3.57 3.57 2 5.5 2C6.61 2 7.6 2.52 8 3.36C8.4 2.52 9.39 2 10.5 2C12.43 2 14 3.57 14 5.5C14 9 8 13 8 13Z" fill="currentColor" />
    </svg>
  );
}
