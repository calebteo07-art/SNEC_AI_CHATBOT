"use client";
/* Atlas Rail — the persistent navigation spine. Groups STUDY / INSIGHT and a
   role-gated OVERSIGHT. Top strip carries the wordmark, the day streak and the
   ⌘K trigger; the profile + sign-out sit at the base. Collapses to a bottom bar
   on mobile (see aurora.css @media), where the base becomes a sheet raised by the
   trailing account button — the bar has no room for it inline, and hiding it (as
   this rail used to) left phone users with no way to sign out at all. */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/screens/AuthContext";
import { useProgress } from "@/hooks/useProgress";
import { useAvatar } from "@/hooks/useAvatar";
import { Eyecon } from "@/aurora/avatar/Eyecon";
import { Wordmark } from "@/aurora/Logo";
import { displayName } from "@/aurora/lib/displayName";

/* `short` is the phone label. The full label wants ~83px ("Virtual Patients") in a cell
   that is ~48px wide once six destinations share a 360px bar, so it would ellipsise to
   mush. The accessible name is always the FULL label (aria-label on the link), so the
   short form costs a screen-reader user nothing — and it is what keeps the landscape
   icon-only bar named. */
type NavItem = { href: string; label: string; short: string; icon: keyof typeof NAV_ICONS };

const STUDY: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", short: "Home", icon: "dashboard" },
  { href: "/flashcards", label: "Flashcards", short: "Cards", icon: "flashcards" },
  { href: "/chat", label: "Tutor", short: "Tutor", icon: "tutor" },
  { href: "/cases", label: "Virtual Patients", short: "Patients", icon: "cases" },
  { href: "/leaderboard", label: "Leaderboard", short: "Ranks", icon: "leaderboard" },
];
const ANALYTICS_NAV: NavItem[] = [
  { href: "/analytics", label: "Analytics", short: "Stats", icon: "analytics" },
];

export function AtlasRail({ pinned, onTogglePin }: { pinned?: boolean; onTogglePin?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { data: progress } = useProgress();
  const { data: avatar } = useAvatar((user?.role ?? "student") === "student");

  const role = user?.role ?? "student";
  // The nav chip is a student identity surface → their customised Eyecon (staff keep initials).
  const eyeconConfig = role === "student" ? avatar?.config : undefined;
  const showAnalytics = role === "admin" || role === "trainer";
  const name = displayName(user?.fullName, "EyeBot");
  const initials = name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  /* The account sheet — the mobile presentation of .aurora-rail-foot. Closed by an
     outside press or Esc, matching EyeconMenu's convention. `pointerdown` rather than
     `mousedown`: this surface is touch-first and pointer events cover both. */
  const [acctOpen, setAcctOpen] = useState(false);
  useEffect(() => { setAcctOpen(false); }, [pathname]); // never survive a navigation
  useEffect(() => {
    if (!acctOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t?.closest(".aurora-rail-foot") && !t?.closest(".aurora-rail-account")) setAcctOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAcctOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [acctOpen]);

  const signOut = useCallback(() => { void logout(); router.push("/"); }, [logout, router]);

  /* The visible text is the short form on phones and the full label on desktop (CSS picks
     one); both are aria-hidden so the accessible name comes solely from aria-label —
     always the full label, and it survives the landscape bar hiding the text entirely. */
  const Item = ({ href, label, short, icon }: NavItem) => (
    <Link href={href} className="aurora-navitem" aria-label={label} data-active={isActive(href)} aria-current={isActive(href) ? "page" : undefined}>
      {NAV_ICONS[icon]}
      <span className="aurora-navitem-full" aria-hidden>{label}</span>
      <span className="aurora-navitem-short" aria-hidden>{short}</span>
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
      </div>

      <div className="aurora-rail-scroll">
        <section className="aurora-rail-section">
          <p className="aurora-rail-label">Study</p>
          {STUDY.map((i) => <Item key={i.href} {...i} />)}
        </section>
        {showAnalytics && (
          <section className="aurora-rail-section">
            <p className="aurora-rail-label">Insights</p>
            {ANALYTICS_NAV.map((i) => <Item key={i.href} {...i} />)}
          </section>
        )}
      </div>

      {/* Phone-only: raises .aurora-rail-foot as a sheet. The bar cannot hold the foot
          inline, and hiding it removed the ONLY sign-out on every route but /dashboard. */}
      <button
        type="button"
        className="aurora-rail-account"
        aria-label="Account and sign out"
        aria-haspopup="menu"
        aria-expanded={acctOpen}
        onClick={() => setAcctOpen((v) => !v)}
      >
        <span className="aurora-avatar" data-eyecon={eyeconConfig ? "" : undefined}>
          {eyeconConfig ? <Eyecon config={eyeconConfig} size={30} /> : initials}
        </span>
      </button>

      <div className="aurora-rail-foot" data-open={acctOpen} role={acctOpen ? "menu" : undefined}>
        {/* Desktop's EyeBot mark lives in .aurora-rail-top, which the bar hides — so on a
            phone this sheet would carry a lone SNEC mark, and the branding lock is explicit
            that that is never a lockup. Phone-only (CSS), so desktop gains no second mark. */}
        <div className="aurora-rail-lockup">
          <Wordmark size={15} tone="white" />
        </div>
        <div className="aurora-snec-wrap" title="A Singapore National Eye Centre initiative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="aurora-snec" src="/brand/snec-logo.jpg" alt="Singapore National Eye Centre" />
        </div>
        {/* Display-only identity chip — the customized Eyecon + name, no navigation
            (re-customization is locked; the Profile screen is gone). Sign out is separate. */}
        <div className="aurora-profile">
          <span className="aurora-avatar" data-eyecon={eyeconConfig ? "" : undefined}>
            {eyeconConfig ? <Eyecon config={eyeconConfig} size={30} /> : initials}
          </span>
          <span className="aurora-profile-meta">
            <span className="aurora-profile-name">{name}</span>
            <span className="aurora-profile-role">{role === "trainer" ? "Trainer" : role}{user?.studentRole ? ` · ${user.studentRole}` : ""}</span>
          </span>
        </div>
        <button type="button" className="aurora-signout" role={acctOpen ? "menuitem" : undefined} onClick={signOut}>
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
  analytics: (<svg {...ico}><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12" y="8" width="3" height="10" /><rect x="17" y="4" width="3" height="14" /></svg>),
} as const;
