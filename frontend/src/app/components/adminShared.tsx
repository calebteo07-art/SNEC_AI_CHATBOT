import { ReactNode } from "react";

/* ── Types ────────────────────────────────────────────────── */
export interface ApprovedStudent {
  email: string; full_name: string; role: string;
  added_by: string; added_at: string; student_id: string;
}
export interface StudentProfile {
  student_id: string; full_name: string; email: string; role: string;
  session_count: number | string; streak: number | string;
  last_active: string; learning_velocity: string;
}
export interface FeedItem {
  type: string; student_id: string; name: string;
  detail: string; timestamp: string; token_count?: number;
}
export interface CohortData {
  total_students: number; active_this_week: number;
  at_risk_count: number; weakest_topics: string[];
}
export interface AtRiskItem {
  student_id: string; name: string;
  days_inactive: number; weak_topic_count: number;
}
export interface Credential { full_name: string; email: string; password: string; }

export type AdminOutletContext = { openDetail: (id: string) => void };

/* ── Role colours ─────────────────────────────────────────── */
const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  OA:         { bg: "rgba(34,197,94,0.15)",   color: "#22c55e" },
  OT:         { bg: "rgba(167,139,250,0.15)", color: "#a78bfa" },
  PSA:        { bg: "rgba(52,211,153,0.15)",  color: "#34d399" },
  admin:      { bg: "rgba(244,239,231,0.10)", color: "#F4EFE7" },
  supervisor: { bg: "rgba(96,165,250,0.15)",  color: "#60a5fa" },
};

export function RoleBadge({ role }: { role: string }) {
  const c = ROLE_COLORS[role] ?? { bg: "rgba(244,239,231,0.08)", color: "rgba(244,239,231,0.5)" };
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: c.bg, color: c.color }}
    >
      {role}
    </span>
  );
}

export function roleBadgeClass(role: string): string {
  const r = role.toLowerCase();
  if (r === "oa") return "role-badge oa";
  if (r === "ot") return "role-badge ot";
  if (r === "psa") return "role-badge psa";
  if (r === "admin") return "role-badge admin";
  if (r === "supervisor") return "role-badge supervisor";
  return "role-badge";
}

export function fmtTokens(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function getInitials(name: string) {
  return name.split(" ").filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

export function roleAvatarColors(role: string): { bg: string; text: string } {
  const c = ROLE_COLORS[role];
  if (c) return { bg: c.bg, text: c.color };
  return { bg: "rgba(244,239,231,0.08)", text: "rgba(244,239,231,0.5)" };
}

export function formatFeedTime(ts: string) {
  try { return new Date(ts).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

export function formatDayLabel(ts: string) {
  try {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-SG", { day: "numeric", month: "short" });
  } catch { return ""; }
}

export function groupFeedByDate(items: FeedItem[]): { label: string; items: FeedItem[] }[] {
  const groups: { label: string; items: FeedItem[] }[] = [];
  const map = new Map<string, FeedItem[]>();
  for (const item of items) {
    const label = formatDayLabel(item.timestamp);
    if (!map.has(label)) { map.set(label, []); groups.push({ label, items: map.get(label)! }); }
    map.get(label)!.push(item);
  }
  return groups;
}

/* ── KPI Card ────────────────────────────────────────────── */
export function KpiCard({ value, label, iconBg, icon }: {
  value: string | number; label: string; iconBg: string; icon: ReactNode;
}) {
  return (
    <div className="admin-kpi">
      <div className="admin-kpi-icon" style={{ background: iconBg }}>{icon}</div>
      <div className="admin-kpi-value">{value}</div>
      <div className="admin-kpi-label">{label}</div>
    </div>
  );
}

/* ── Icons ───────────────────────────────────────────────── */
export const IconUsers = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <circle cx="8" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
    <path d="M2 17C2 14.24 4.69 12 8 12C11.31 12 14 14.24 14 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M14 12C14.9 11.4 16 10.7 17 11C18.3 11.3 19 12.6 19 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="16" cy="7" r="2" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export const IconActive = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <path d="M10 2v4M10 14v4M2 10h4M14 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export const IconRisk = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <path d="M10 3L18 17H2L10 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <line x1="10" y1="9" x2="10" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="10" cy="15.5" r="0.75" fill="currentColor" />
  </svg>
);

export const IconTokens = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <path d="M2 6l8-3 8 3-8 3-8-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M2 10l8 3 8-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M2 14l8 3 8-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const IconTrend = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <polyline points="2,14 7,9 11,12 18,5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="14,5 18,5 18,9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconLogout = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M6 3H3C2.45 3 2 3.45 2 4V12C2 12.55 2.45 13 3 13H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M11 5L14 8L11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="14" y1="8" x2="6" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
