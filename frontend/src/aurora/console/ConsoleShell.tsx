"use client";
/* Console chrome — top bar, grouped nav, and THE single <main id="main"> for /admin.

   AppShell used to supply that landmark and no longer does (the console lives outside
   the (shell) route group), so this owns the only one on the page. /admin once shipped
   TWO mains, which handed a screen-reader user a choice of "main" regions on the
   densest screen in the app; zero is just as wrong, so console_assert pins it at
   exactly one.

   Governance links render for role === "admin" only. That is presentation, not
   security — every write behind them is re-enforced by require_admin server-side, and
   the routes re-guard the direct URL. */
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/screens/AuthContext";
import { useAtRisk } from "@/hooks/useAdmin";
import { DisciplineProvider, useDiscipline, DISCIPLINES } from "@/aurora/console/disciplineContext";

const TEACHING = [
  { href: "/admin", label: "Overview", hue: "var(--cs-blue)" },
  { href: "/admin/students", label: "Students", hue: "var(--cs-coral)" },
];
const GOVERNANCE = [
  { href: "/admin/accounts", label: "Accounts", hue: "var(--cs-teal)" },
  { href: "/admin/audit", label: "Audit", hue: "var(--cs-amber)" },
];

function TopBar() {
  const { discipline, setDiscipline } = useDiscipline();
  const path = usePathname();
  // The console's ONE h1. Without it the densest screen in the app had no page heading
  // at all — /admin/students opened on a bare search box. The section suffix is dropped
  // on Overview (it would just repeat the product name) and on a coarse pointer, where
  // the bottom tab bar already shows the active section and the bar has no room.
  const section = [...TEACHING, ...GOVERNANCE].find((i) => i.href === path)?.label;
  return (
    <header className="cs-top">
      <h1 className="cs-title">
        EyeBot <span>Console</span>
        {section && section !== "Overview" && <span className="cs-title-sec"> · {section}</span>}
      </h1>
      <div className="cs-seg" role="group" aria-label="Discipline filter" data-testid="cs-discipline">
        {DISCIPLINES.map((d) => (
          <button
            key={d.key}
            type="button"
            data-discipline={d.key}
            data-active={discipline === d.key}
            aria-pressed={discipline === d.key}
            onClick={() => setDiscipline(d.key)}
          >
            {d.label}
          </button>
        ))}
      </div>
      <span className="cs-live"><span className="cs-livedot" />Live · 30s</span>
      <Link href="/homepage" className="cs-back">← Student app</Link>
      <SignOut />
    </header>
  );
}

/* The console has no Atlas Rail, and the rail carried the ONLY sign-out in the app — so
   without this a trainer who opened /admin on a shared clinic terminal could not end
   their session without first navigating back to the student app. That is the exact
   incident mobile_signout_assert.mjs exists to prevent, and this surface shows the whole
   cohort's data. */
function SignOut() {
  const { logout } = useAuth();
  return (
    <button
      type="button" className="cs-signout" onClick={logout}
      aria-label="Sign out" title="Sign out" data-testid="cs-signout"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
    </button>
  );
}

function Nav() {
  const path = usePathname();
  const { user } = useAuth();
  const atRisk = useAtRisk();
  // Only ever a badge on a real count — never a "0" pill, and never a number while the
  // read is loading or failed (the same rule the stat cards follow).
  const flagged = atRisk.isLoading || atRisk.isError ? 0 : atRisk.data?.length ?? 0;

  const item = (i: { href: string; label: string; hue: string }) => {
    const active = path === i.href;
    return (
      <Link
        key={i.href}
        href={i.href}
        className="cs-navi"
        data-active={active}
        aria-current={active ? "page" : undefined}
      >
        <span className="cs-navdot" style={{ background: active ? "#fff" : i.hue }} />
        {i.label}
        {i.href === "/admin/students" && flagged > 0 && (
          <span className="cs-navn" aria-label={`${flagged} students need attention`}>{flagged}</span>
        )}
      </Link>
    );
  };

  return (
    <nav className="cs-nav" aria-label="Console">
      <span className="cs-navlab">Teaching</span>
      {TEACHING.map(item)}
      {user?.role === "admin" && (
        <>
          <span className="cs-navlab" style={{ marginTop: 8 }}>Governance</span>
          {GOVERNANCE.map(item)}
        </>
      )}
    </nav>
  );
}

export function ConsoleShell({ children }: { children: ReactNode }) {
  return (
    <DisciplineProvider>
      <div className="cs">
        <div className="cs-shell">
          <TopBar />
          <div className="cs-body">
            <Nav />
            <main id="main" className="cs-main">{children}</main>
          </div>
        </div>
      </div>
    </DisciplineProvider>
  );
}
