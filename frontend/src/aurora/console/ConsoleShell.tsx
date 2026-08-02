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
  return (
    <header className="cs-top">
      <span className="cs-title">EyeBot <span>Console</span></span>
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
    </header>
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
