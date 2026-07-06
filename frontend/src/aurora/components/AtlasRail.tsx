"use client";
/* Atlas Rail — the persistent navigation spine. Groups STUDY / INSIGHT and a
   role-gated OVERSIGHT. Top strip carries the wordmark, the day streak and the
   ⌘K trigger; the profile + sign-out sit at the base. Collapses to a bottom bar
   on mobile (see aurora.css @media). */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/screens/AuthContext";
import { useProgress } from "@/hooks/useProgress";
import { Wordmark } from "@/aurora/Logo";

type NavItem = { href: string; label: string; icon: keyof typeof NAV_ICONS };

const STUDY: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/chat", label: "Tutor", icon: "tutor" },
  { href: "/cases", label: "Virtual Patients", icon: "cases" },
  { href: "/flashcards", label: "Flashcards", icon: "flashcards" },
  { href: "/leaderboard", label: "Leaderboard", icon: "leaderboard" },
];
const OVERSIGHT: NavItem[] = [
  { href: "/supervisor", label: "Supervisor", icon: "supervisor" },
  { href: "/admin", label: "Admin", icon: "admin" },
];

export function AtlasRail({ onOpenPalette, pinned, onTogglePin }: { onOpenPalette: () => void; pinned?: boolean; onTogglePin?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { data: progress } = useProgress();

  const role = user?.role ?? "student";
  const showOversight = role === "admin" || role === "supervisor";
  const initials = (user?.fullName ?? "EyeBot")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const Item = ({ href, label, icon }: NavItem) => (
    <Link href={href} className="aurora-navitem" data-active={isActive(href)} aria-current={isActive(href) ? "page" : undefined}>
      {NAV_ICONS[icon]}
      <span>{label}</span>
    </Link>
  );

  return (
    <nav className="aurora-rail aurora-rail-night" aria-label="Primary">
      <div className="aurora-rail-top">
        <Wordmark size={18} tone="white" />
        {onTogglePin && (
          <button
            type="button"
            className="aurora-rail-pin"
            data-pinned={pinned}
            onClick={onTogglePin}
            aria-label={pinned ? "Unpin sidebar (auto-collapse)" : "Pin sidebar open"}
            title={pinned ? "Unpin sidebar" : "Pin sidebar open"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="4" width="18" height="16" rx="2" /><line x1="9" y1="4" x2="9" y2="20" />
            </svg>
          </button>
        )}
      </div>
      <div className="aurora-rail-top" style={{ paddingTop: 0 }}>
        <span className="aurora-streak" title="Day streak">
          <span aria-hidden>◆</span><b>{progress?.streak ?? 0}</b> day
        </span>
        <button type="button" className="aurora-cmdk" onClick={onOpenPalette} aria-label="Open command palette">
          <span>Search</span><kbd>⌘K</kbd>
        </button>
      </div>

      <div className="aurora-rail-scroll">
        <section className="aurora-rail-section">
          <p className="aurora-rail-label">Study</p>
          {STUDY.map((i) => <Item key={i.href} {...i} />)}
        </section>
        {showOversight && (
          <section className="aurora-rail-section">
            <p className="aurora-rail-label">Oversight</p>
            {OVERSIGHT.map((i) => <Item key={i.href} {...i} />)}
          </section>
        )}
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
            <span className="aurora-profile-role">{role}{user?.studentRole ? ` · ${user.studentRole}` : ""}</span>
          </span>
        </Link>
        <button
          type="button"
          className="aurora-signout"
          onClick={() => { void logout(); router.push("/"); }}
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}

/* Compact line glyphs, currentColor, 18px grid. */
const ico = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const NAV_ICONS = {
  dashboard: (<svg {...ico}><path d="M4 12L12 4l8 8" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" /></svg>),
  tutor: (<svg {...ico}><path d="M5 5h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H9l-4 3V6a1 1 0 0 1 1-1Z" /><circle cx="9" cy="10" r="0.6" fill="currentColor" /><circle cx="12.5" cy="10" r="0.6" fill="currentColor" /><circle cx="16" cy="10" r="0.6" fill="currentColor" /></svg>),
  cases: (<svg {...ico}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3" /></svg>),
  flashcards: (<svg {...ico}><rect x="3" y="6" width="14" height="10" rx="2" /><path d="M7 4h14a0 0 0 0 1 0 0v12" /></svg>),
  leaderboard: (<svg {...ico}><path d="M3 20h18" /><path d="M5 20v-6h4v6" /><path d="M10 20V8h4v12" /><path d="M15 20v-9h4v9" /></svg>),
  supervisor: (<svg {...ico}><circle cx="9" cy="8" r="3" /><path d="M4 19a5 5 0 0 1 10 0" /><path d="M16 6.5a3 3 0 0 1 0 5.5" /><path d="M16.5 19a5 5 0 0 0-2-4" /></svg>),
  admin: (<svg {...ico}><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" /><path d="M9 12l2 2 4-4" /></svg>),
} as const;
