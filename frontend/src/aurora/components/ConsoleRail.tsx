"use client";
/* Console Rail — the dark staff navigation spine for the EyeBot control console.
   Replaces the light Atlas Rail for admin + supervisor: it advertises ONLY the
   oversight destinations (no student surfaces), so the lockout is visible as well
   as enforced by CheckInGuard. Reuses the .aurora-rail* classes (re-themed by the
   .console-dark scope on the shell) and inherits the same mobile bottom-bar
   collapse. The footer carries identity, Change password and Sign out. */
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/screens/AuthContext";
import { Wordmark } from "@/aurora/Logo";
import { ChangePasswordModal } from "@/screens/ChangePasswordModal";

type NavItem = { href: string; label: string; icon: keyof typeof NAV_ICONS; exact?: boolean };

/* admin → the four admin pages become the rail's primary nav (this is what
   removes the old duplicate pill-tabs). */
const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: "overview", exact: true },
  { href: "/admin/students", label: "Students", icon: "students" },
  { href: "/admin/accounts", label: "Accounts", icon: "accounts" },
  { href: "/admin/activity", label: "Activity", icon: "activity" },
];
/* supervisor → their dashboard plus an Admin cross-link. */
const SUPERVISOR_NAV: NavItem[] = [
  { href: "/supervisor", label: "Supervisor", icon: "supervisor", exact: true },
  { href: "/admin", label: "Admin", icon: "admin", exact: true },
];

export function ConsoleRail({ onOpenPalette }: { onOpenPalette: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [showChangePassword, setShowChangePassword] = useState(false);

  const role = user?.role ?? "student";
  const nav = role === "supervisor" ? SUPERVISOR_NAV : ADMIN_NAV;
  const sectionLabel = role === "supervisor" ? "Oversight" : "Administration";

  const initials = (user?.fullName ?? "EyeBot")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  /* /admin and /supervisor match exactly (their sub-routes are separate items);
     everything else also lights up on its child routes. Mirrors AdminShell. */
  const isActive = (item: NavItem) =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + "/");

  return (
    <>
      <nav className="aurora-rail" aria-label="Staff console">
        <div className="aurora-rail-top" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
          <Wordmark size={18} />
          <p className="aurora-rail-label" style={{ margin: 0 }}>Control console</p>
        </div>
        <div className="aurora-rail-top" style={{ paddingTop: 0 }}>
          <button type="button" className="aurora-cmdk" onClick={onOpenPalette} aria-label="Open command palette">
            <span>Search</span><kbd>⌘K</kbd>
          </button>
        </div>

        <div className="aurora-rail-scroll">
          <section className="aurora-rail-section">
            <p className="aurora-rail-label">{sectionLabel}</p>
            {nav.map((item) => {
              const active = isActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="aurora-navitem"
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                >
                  {NAV_ICONS[item.icon]}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </section>
        </div>

        <div className="aurora-rail-foot">
          <div className="aurora-snec-wrap" title="A Singapore National Eye Centre initiative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="aurora-snec" src="/brand/snec-logo.jpg" alt="Singapore National Eye Centre" />
          </div>
          <Link href="/profile" className="aurora-profile" aria-label="Profile">
            <span className="aurora-avatar">{initials}</span>
            <span className="aurora-profile-meta">
              <span className="aurora-profile-name">{user?.fullName ?? "EyeBot"}</span>
              <span className="aurora-profile-role">{role}</span>
            </span>
          </Link>
          <button type="button" className="aurora-admin-link" style={{ textAlign: "left", padding: "0 6px" }} onClick={() => setShowChangePassword(true)}>
            Change password
          </button>
          <button
            type="button"
            className="aurora-signout"
            onClick={() => { void logout(); router.push("/"); }}
          >
            Sign out
          </button>
        </div>
      </nav>

      {showChangePassword && (
        <ChangePasswordModal
          onClose={() => setShowChangePassword(false)}
          onSuccess={() => setShowChangePassword(false)}
        />
      )}
    </>
  );
}

/* Compact line glyphs, currentColor, 18px grid — match the Atlas Rail set. */
const ico = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const NAV_ICONS = {
  overview: (<svg {...ico}><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>),
  students: (<svg {...ico}><circle cx="8" cy="9" r="2.6" /><circle cx="16" cy="9" r="2.6" /><path d="M3.5 19a4.5 4.5 0 0 1 9 0" /><path d="M11.5 19a4.5 4.5 0 0 1 9 0" /></svg>),
  accounts: (<svg {...ico}><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M6 16.3a3 3 0 0 1 6 0" /><path d="M14.5 10h4M14.5 13.5h4" /></svg>),
  activity: (<svg {...ico}><path d="M3 12h3.5l2.2-6 4 13 2.3-7H21" /></svg>),
  supervisor: (<svg {...ico}><circle cx="9" cy="8" r="3" /><path d="M4 19a5 5 0 0 1 10 0" /><path d="M16 6.5a3 3 0 0 1 0 5.5" /><path d="M16.5 19a5 5 0 0 0-2-4" /></svg>),
  admin: (<svg {...ico}><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" /><path d="M9 12l2 2 4-4" /></svg>),
} as const;
