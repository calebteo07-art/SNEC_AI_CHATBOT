import React, { useEffect, useState, useRef } from "react";
import { motion } from "motion/react";
import { Search, X, MessageSquare, CheckCircle, XCircle } from "lucide-react";
import { useNavigate } from "react-router";
import { useAuth } from "./AuthContext";
import { AdminStudentDetail } from "./AdminStudentDetail";
import { ChangePasswordModal } from "./ChangePasswordModal";

const API = "";

interface ApprovedStudent { email: string; full_name: string; role: string; added_by: string; added_at: string; student_id: string; }
interface StudentProfile { student_id: string; full_name: string; email: string; role: string; session_count: number | string; streak: number | string; last_active: string; learning_velocity: string; }
interface FeedItem { type: string; student_id: string; name: string; detail: string; timestamp: string; token_count?: number; }
interface CohortData { total_students: number; active_this_week: number; at_risk_count: number; weakest_topics: string[]; }
interface AtRiskItem { student_id: string; name: string; days_inactive: number; weak_topic_count: number; }
interface Credential { full_name: string; email: string; password: string; }

type Tab = "overview" | "students" | "accounts" | "activity";

function roleBadgeClass(role: string): string {
  const r = role.toLowerCase();
  if (r === "oa") return "role-badge oa";
  if (r === "ot") return "role-badge ot";
  if (r === "psa") return "role-badge psa";
  if (r === "admin") return "role-badge admin";
  if (r === "supervisor") return "role-badge supervisor";
  return "role-badge";
}

function fmtTokens(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n); }

function getInitials(name: string) {
  return name.split(" ").filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function roleAvatarColors(role: string): { bg: string; text: string } {
  if (role === "OA")  return { bg: "#CCFBF1", text: "#0D9488" };
  if (role === "OT")  return { bg: "#EDE9FE", text: "#7C3AED" };
  if (role === "PSA") return { bg: "#D1FAE5", text: "#059669" };
  return { bg: "#F3F4F6", text: "#6B7280" };
}

function formatFeedTime(ts: string) {
  try { return new Date(ts).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

function formatDayLabel(ts: string) {
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

function groupFeedByDate(items: FeedItem[]): { label: string; items: FeedItem[] }[] {
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
function KpiCard({ value, label, iconBg, icon }: { value: string | number; label: string; iconBg: string; icon: React.ReactNode }) {
  return (
    <div className="admin-kpi">
      <div className="admin-kpi-icon" style={{ background: iconBg }}>{icon}</div>
      <div className="admin-kpi-value">{value}</div>
      <div className="admin-kpi-label">{label}</div>
    </div>
  );
}

/* ── Icons ───────────────────────────────────────────────── */
const IconUsers = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <circle cx="8" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
    <path d="M2 17C2 14.24 4.69 12 8 12C11.31 12 14 14.24 14 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M14 12C14.9 11.4 16 10.7 17 11C18.3 11.3 19 12.6 19 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="16" cy="7" r="2" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const IconActive = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <path d="M10 2v4M10 14v4M2 10h4M14 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const IconRisk = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <path d="M10 3L18 17H2L10 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <line x1="10" y1="9" x2="10" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="10" cy="15.5" r="0.75" fill="currentColor" />
  </svg>
);

const IconTokens = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <path d="M2 6l8-3 8 3-8 3-8-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M2 10l8 3 8-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M2 14l8 3 8-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const IconTrend = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <polyline points="2,14 7,9 11,12 18,5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="14,5 18,5 18,9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconAdd = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
    <line x1="8" y1="5" x2="8" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const IconShield = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M8 2L14 5V8C14 11.3 11.5 14.1 8 15C4.5 14.1 2 11.3 2 8V5L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M5.5 8L7 9.5L10.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconUpload = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M8 10V3M8 3L5 6M8 3L11 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 12H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const IconLogout = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M6 3H3C2.45 3 2 3.45 2 4V12C2 12.55 2.45 13 3 13H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M11 5L14 8L11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="14" y1="8" x2="6" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/* ── AdminDashboard ──────────────────────────────────────── */
export function AdminDashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const adminId = user?.studentId ?? "";

  const [tab, setTab] = useState<Tab>("overview");
  const [detailStudentId, setDetailStudentId] = useState<string | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);

  // Overview
  const [cohort, setCohort] = useState<CohortData | null>(null);
  const [atRisk, setAtRisk] = useState<AtRiskItem[]>([]);
  const [totalTokens, setTotalTokens] = useState(0);
  const [aiInsight, setAiInsight] = useState("");
  const [overviewLoading, setOverviewLoading] = useState(true);

  // Students
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [tokensByStudent, setTokensByStudent] = useState<Record<string, number>>({});
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentFilter, setStudentFilter] = useState<"all" | "OA" | "OT" | "PSA" | "at-risk">("all");
  const [studentPage, setStudentPage] = useState(0);
  const PAGE_SIZE = 20;

  // Accounts
  const [approved, setApproved] = useState<ApprovedStudent[]>([]);
  const [approvedLoading, setApprovedLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  const [addedCredential, setAddedCredential] = useState<{ email: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [promoteEmail, setPromoteEmail] = useState("");
  const [promoteRole, setPromoteRole] = useState("supervisor");
  const [promoting, setPromoting] = useState(false);
  const [promoteMsg, setPromoteMsg] = useState("");
  const [csvCredentials, setCsvCredentials] = useState<Credential[]>([]);
  const [csvErrors, setCsvErrors] = useState<{ row: number; reason: string }[]>([]);
  const [csvImportSummary, setCsvImportSummary] = useState<{ imported: number; skipped: number } | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvPreview, setCsvPreview] = useState<{ count: number } | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [accountSearch, setAccountSearch] = useState("");

  // Activity
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedLoaded, setFeedLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/supervisor/cohort`, { credentials: "include" }).then(r => r.json()).catch(() => null),
      fetch(`${API}/api/supervisor/at-risk`, { credentials: "include" }).then(r => r.json()).catch(() => ({ at_risk: [] })),
      fetch(`${API}/api/admin/token-summary`, { credentials: "include" }).then(r => r.json()).catch(() => ({ total_tokens: 0 })),
      fetch(`${API}/api/supervisor/insights`, { credentials: "include" }).then(r => r.json()).catch(() => ({ insight: "" })),
    ]).then(([cohortData, riskData, tokenData, insightData]) => {
      if (cohortData) setCohort(cohortData);
      setAtRisk(riskData?.at_risk ?? []);
      setTotalTokens(tokenData?.total_tokens ?? 0);
      setAiInsight(insightData?.insight ?? "");
    }).finally(() => setOverviewLoading(false));

    fetch(`${API}/api/admin/approved`, { credentials: "include" })
      .then(r => r.json())
      .then(d => setApproved(d.students ?? []))
      .catch(() => {})
      .finally(() => setApprovedLoading(false));
  }, []);

  const loadStudents = () => {
    if (studentsLoaded) return;
    setStudentsLoading(true);
    Promise.all([
      fetch(`${API}/api/admin/students`, { credentials: "include" }).then(r => r.json()).catch(() => ({ students: [] })),
      fetch(`${API}/api/admin/token-summary`, { credentials: "include" }).then(r => r.json()).catch(() => ({ by_student: [] })),
    ]).then(([sd, td]) => {
      setStudents(sd.students ?? []);
      const map: Record<string, number> = {};
      for (const item of (td.by_student ?? [])) map[item.student_id] = item.tokens;
      setTokensByStudent(map);
      setStudentsLoaded(true);
    }).finally(() => setStudentsLoading(false));
  };

  const loadFeed = () => {
    if (feedLoaded) return;
    setFeedLoading(true);
    fetch(`${API}/api/admin/activity`, { credentials: "include" })
      .then(r => r.json())
      .then(d => { setFeed(d.feed ?? []); setFeedLoaded(true); })
      .catch(() => {})
      .finally(() => setFeedLoading(false));
  };

  const handleTabChange = (t: Tab) => {
    setTab(t);
    if (t === "students") loadStudents();
    if (t === "activity") loadFeed();
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");
    if (!newEmail.trim() || !newName.trim() || !newRole) { setAddError("All fields are required."); return; }
    setAdding(true);
    try {
      const res = await fetch(`${API}/api/admin/approved`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: newEmail.trim().toLowerCase(), full_name: newName.trim(), role: newRole }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setAddError((d as { detail?: string }).detail ?? "Failed to add student."); return; }
      await res.json();
      setAddedCredential({ email: newEmail.trim().toLowerCase() });
      setApproved(prev => [...prev, { email: newEmail.trim().toLowerCase(), full_name: newName.trim(), role: newRole, added_by: adminId, added_at: "", student_id: "" }]);
      setNewEmail(""); setNewName(""); setNewRole("");
    } catch { setAddError("Network error."); }
    setAdding(false);
  };

  const handleRemove = async (email: string) => {
    setRemoving(email); setRemoveError("");
    try {
      const res = await fetch(`${API}/api/admin/approved/${encodeURIComponent(email)}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { setRemoveError("Failed to remove student."); setRemoving(null); return; }
      setApproved(prev => prev.filter(s => s.email !== email));
    } catch { setRemoveError("Network error."); }
    setRemoving(null);
  };

  const handlePromote = async (e: React.FormEvent) => {
    e.preventDefault();
    setPromoting(true); setPromoteMsg("");
    try {
      const res = await fetch(`${API}/api/admin/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: promoteEmail.trim().toLowerCase(), role: promoteRole }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setPromoteMsg(d.detail ?? "Failed."); }
      else { setPromoteMsg("Done."); setPromoteEmail(""); }
    } catch { setPromoteMsg("Network error."); }
    setPromoting(false);
  };

  const handleCsvFile = (f: File) => {
    setCsvFile(f);
    const reader = new FileReader();
    reader.onload = ev => {
      const text = (ev.target?.result as string) ?? "";
      const lines = text.split("\n").filter(l => l.trim());
      setCsvPreview({ count: Math.max(0, lines.length - 1) });
    };
    reader.readAsText(f);
  };

  const handleCsvImport = async () => {
    if (!csvFile) return;
    setCsvUploading(true);
    const form = new FormData();
    form.append("file", csvFile);
    try {
      const res = await fetch(`${API}/api/admin/upload-csv`, { method: "POST", credentials: "include", body: form });
      const data = await res.json();
      setCsvImportSummary({ imported: data.imported, skipped: data.skipped });
      setCsvErrors(data.errors ?? []);
      setCsvCredentials(data.credentials ?? []);
      setCsvFile(null); setCsvPreview(null);
    } catch {
      setCsvImportSummary({ imported: 0, skipped: 0 });
      setCsvErrors([{ row: 0, reason: "Network error — import failed." }]);
    }
    setCsvUploading(false);
  };

  const filteredStudents = students.filter(s => {
    const q = studentSearch.toLowerCase();
    if (q && !s.full_name.toLowerCase().includes(q) && !s.email.toLowerCase().includes(q)) return false;
    if (studentFilter === "at-risk") return atRisk.some(r => r.student_id === s.student_id);
    if (studentFilter !== "all") return s.role === studentFilter;
    return true;
  });

  React.useEffect(() => { setStudentPage(0); }, [studentSearch, studentFilter]);

  const totalPages = Math.ceil(filteredStudents.length / PAGE_SIZE);
  const pagedStudents = filteredStudents.slice(studentPage * PAGE_SIZE, (studentPage + 1) * PAGE_SIZE);

  const TABS: { key: Tab; label: string }[] = [
    { key: "overview",  label: "Overview"  },
    { key: "students",  label: "Students"  },
    { key: "accounts",  label: "Accounts"  },
    { key: "activity",  label: "Activity"  },
  ];

  return (
    <div className="admin-layout">

      {/* ── Tab bar ──────────────────────────────────────────── */}
      <div className="admin-tabbar">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            className={`admin-tab${tab === key ? " active" : ""}`}
            onClick={() => handleTabChange(key)}
          >
            {label}
          </button>
        ))}

        <div className="admin-tab-actions">
          <button className="admin-text-btn" onClick={() => setShowChangePassword(true)}>
            Change password
          </button>
          <button className="admin-text-btn danger" onClick={() => { logout(); navigate("/"); }}>
            <IconLogout /> Sign out
          </button>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────── */}
      <div className="admin-body">

        {/* ── OVERVIEW ───────────────────────────────────────── */}
        {tab === "overview" && (
          overviewLoading ? (
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 64 }}>
              <span className="spinner spinner--teal" />
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* KPI row */}
              <div className="admin-kpi-grid">
                <KpiCard value={cohort?.total_students ?? 0}   label="Total Students"   iconBg="var(--teal-bg)"    icon={<IconUsers   />} />
                <KpiCard value={cohort?.active_this_week ?? 0} label="Active This Week" iconBg="var(--emerald-bg)" icon={<IconActive  />} />
                <KpiCard value={cohort?.at_risk_count ?? 0}    label="At Risk"          iconBg="var(--heart-bg)"   icon={<IconRisk    />} />
                <KpiCard value={fmtTokens(totalTokens)}        label="Total AI Tokens"  iconBg="var(--streak-bg)"  icon={<IconTokens  />} />
                <KpiCard value="↑"                             label="Cohort Momentum"  iconBg="var(--purple-bg)"  icon={<IconTrend   />} />
              </div>

              {/* Two panels */}
              <div className="admin-panel-grid">
                <div className="admin-panel">
                  <div className="admin-panel-header" style={{ color: "var(--heart)" }}>
                    <IconRisk /> At-Risk Students
                  </div>
                  <div className="admin-panel-body">
                    {atRisk.length === 0 && (
                      <p style={{ fontSize: 13, color: "var(--muted)" }}>No at-risk students — great cohort health.</p>
                    )}
                    {atRisk.map(s => (
                      <div key={s.student_id} className="risk-row">
                        <button className="risk-row-name" onClick={() => setDetailStudentId(s.student_id)}>
                          {s.name}
                        </button>
                        <span className="risk-row-meta">{s.days_inactive}d inactive · {s.weak_topic_count} weak</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="admin-panel">
                  <div className="admin-panel-header" style={{ color: "var(--streak)" }}>
                    <IconTrend /> Cohort Weak Topics
                  </div>
                  <div className="admin-panel-body">
                    {(cohort?.weakest_topics ?? []).length === 0 && (
                      <p style={{ fontSize: 13, color: "var(--muted)" }}>No data yet — students haven't started.</p>
                    )}
                    {(cohort?.weakest_topics ?? []).slice(0, 5).map((t, i) => (
                      <div key={t} className="weak-topic-row">
                        <div className="weak-topic-label">{t}</div>
                        <div className="weak-bar-bg">
                          <div className="weak-bar-fill" style={{ width: `${Math.max(20, 90 - i * 15)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {aiInsight && (
                <div className="admin-insight">{aiInsight}</div>
              )}
            </div>
          )
        )}

        {/* ── STUDENTS ───────────────────────────────────────── */}
        {tab === "students" && (
          <div>
            <div className="admin-table-wrap">
              <div className="admin-table-toolbar">
                <input
                  className="admin-search"
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  placeholder="Search name or email…"
                />
                <div style={{ display: "flex", gap: 4 }}>
                  {(["all", "OA", "OT", "PSA", "at-risk"] as const).map(f => (
                    <button
                      key={f}
                      className={`admin-filter-pill${studentFilter === f ? " active" : ""}`}
                      onClick={() => setStudentFilter(f)}
                    >
                      {f === "all" ? "All" : f === "at-risk" ? "At Risk" : f}
                    </button>
                  ))}
                </div>
              </div>

              {studentsLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
                  <span className="spinner spinner--teal" />
                </div>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      {["Name", "Email", "Role", "Sessions", "Streak", "Tokens", "Velocity", "Last Active"].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedStudents.map(s => (
                      <tr key={s.student_id} onClick={() => setDetailStudentId(s.student_id)}>
                        <td style={{ fontWeight: 600 }}>{s.full_name}</td>
                        <td style={{ color: "var(--muted)", fontSize: 12 }}>{s.email}</td>
                        <td><span className={roleBadgeClass(s.role)}>{s.role}</span></td>
                        <td style={{ fontFamily: "var(--font-mono,monospace)" }}>{s.session_count}</td>
                        <td style={{ fontFamily: "var(--font-mono,monospace)" }}>{s.streak}</td>
                        <td style={{ fontFamily: "var(--font-mono,monospace)", color: "var(--teal-deep)", fontWeight: 600 }}>{fmtTokens(tokensByStudent[s.student_id] ?? 0)}</td>
                        <td style={{ color: "var(--muted)", fontSize: 12 }}>{s.learning_velocity}</td>
                        <td style={{ color: "var(--muted)", fontSize: 12, fontFamily: "var(--font-mono,monospace)" }}>{s.last_active?.slice(0, 10) || "—"}</td>
                      </tr>
                    ))}
                    {filteredStudents.length === 0 && (
                      <tr>
                        <td colSpan={8} style={{ textAlign: "center", color: "var(--muted)", padding: "32px 0", fontSize: 13 }}>
                          No students found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {filteredStudents.length > PAGE_SIZE && (
                <div className="admin-table-footer">
                  <span>
                    {studentPage * PAGE_SIZE + 1}–{Math.min((studentPage + 1) * PAGE_SIZE, filteredStudents.length)} of {filteredStudents.length}
                  </span>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button
                      className="admin-btn ghost"
                      onClick={() => setStudentPage(p => Math.max(0, p - 1))}
                      disabled={studentPage === 0}
                      style={{ padding: "5px 12px", fontSize: 12 }}
                    >
                      ← Prev
                    </button>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>Page {studentPage + 1} / {totalPages}</span>
                    <button
                      className="admin-btn ghost"
                      onClick={() => setStudentPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={studentPage >= totalPages - 1}
                      style={{ padding: "5px 12px", fontSize: 12 }}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ACCOUNTS ───────────────────────────────────────── */}
        {tab === "accounts" && (() => {
          const filteredApproved = approved.filter(s => {
            if (!accountSearch) return true;
            const q = accountSearch.toLowerCase();
            return s.full_name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
          });
          return (
            <div className="space-y-5">

              {/* Top row: Add student + CSV import */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                {/* Add one student */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="bg-white rounded-2xl border border-[#E8E2DA] p-6 shadow-[0_2px_8px_rgba(31,26,18,0.06)]"
                >
                  <p className="text-[#8C6D3F] mb-5"
                     style={{ fontSize: "0.68rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600 }}>
                    · Add one student
                  </p>
                  <form onSubmit={handleAdd}>
                    {([
                      { label: "Full name", val: newName, set: setNewName, type: "text", placeholder: "Jane Doe" },
                      { label: "Email",     val: newEmail, set: setNewEmail, type: "email", placeholder: "jane@snec.com.sg" },
                    ] as { label: string; val: string; set: (v: string) => void; type: string; placeholder: string }[]).map(({ label, val, set, type, placeholder }) => (
                      <div key={label} className="mb-4">
                        <label style={{ fontSize: "0.68rem", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600, color: "#A39A8E", display: "block", marginBottom: 6 }}>
                          {label}
                        </label>
                        <input
                          type={type}
                          value={val}
                          onChange={e => set(e.target.value)}
                          placeholder={placeholder}
                          className="w-full px-4 py-2.5 rounded-xl border border-[#E0DAD0] bg-white text-[#1F1A12] focus:outline-none focus:border-[#8C6D3F]/50 transition-colors"
                          style={{ fontSize: "0.9rem" }}
                        />
                      </div>
                    ))}
                    <div className="mb-4">
                      <label style={{ fontSize: "0.68rem", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600, color: "#A39A8E", display: "block", marginBottom: 6 }}>
                        Role
                      </label>
                      <select
                        value={newRole}
                        onChange={e => setNewRole(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-[#E0DAD0] bg-white text-[#1F1A12] focus:outline-none focus:border-[#8C6D3F]/50 transition-colors"
                        style={{ fontSize: "0.9rem" }}
                      >
                        <option value="">Select role…</option>
                        <option value="OA">Ophthalmic Assistant (OA)</option>
                        <option value="OT">Ophthalmic Technician (OT)</option>
                        <option value="PSA">Patient Service Associate (PSA)</option>
                      </select>
                    </div>
                    {addError && (
                      <div className="mb-3 px-4 py-3 rounded-xl bg-[#FEE2E2] border border-[#EF4444]/20 text-[#EF4444]"
                           style={{ fontSize: "0.85rem" }}>
                        {addError}
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={adding}
                      className="w-full mt-1 px-5 py-2.5 rounded-full bg-[#1F1A12] text-[#FAF8F4] font-medium hover:bg-[#3A3024] transition-colors disabled:opacity-50"
                      style={{ fontSize: "0.88rem" }}
                    >
                      {adding ? "Adding…" : "Add Student"}
                    </button>
                  </form>
                  {addedCredential && (
                    <div className="mt-3 px-4 py-3 rounded-xl bg-[#D1FAE5] border border-[#059669]/20 text-[#059669]"
                         style={{ fontSize: "0.85rem" }}>
                      Student added. Credentials emailed to {addedCredential.email}.
                    </div>
                  )}
                </motion.div>

                {/* CSV import */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.06 }}
                  className="bg-white rounded-2xl border border-[#E8E2DA] p-6 shadow-[0_2px_8px_rgba(31,26,18,0.06)]"
                >
                  <p className="text-[#8C6D3F] mb-5"
                     style={{ fontSize: "0.68rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600 }}>
                    · Bulk import via CSV
                  </p>
                  <div
                    className="border-2 border-dashed border-[#E0DAD0] rounded-2xl p-8 text-center cursor-pointer hover:border-[#8C6D3F]/40 hover:bg-[#FAF8F4] transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleCsvFile(f); }}
                  >
                    <div style={{ fontSize: "2rem", marginBottom: 8 }}>📄</div>
                    <p style={{ fontSize: "0.9rem", fontWeight: 500, color: "#1F1A12" }}>Drop CSV here or click to browse</p>
                    <p style={{ fontSize: "0.75rem", color: "#A39A8E", marginTop: 4 }}>Columns: full_name · email · role</p>
                    <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); }} />
                  </div>
                  {csvPreview && (
                    <div className="mt-3 px-4 py-3 rounded-xl bg-[#EFF6FF] border border-[#3B82F6]/20 text-[#3B82F6]"
                         style={{ fontSize: "0.85rem" }}>
                      {csvPreview.count} students ready to import
                    </div>
                  )}
                  {csvFile && (
                    <button
                      onClick={handleCsvImport}
                      disabled={csvUploading}
                      className="w-full mt-3 px-5 py-2.5 rounded-full bg-[#1F1A12] text-[#FAF8F4] font-medium hover:bg-[#3A3024] transition-colors disabled:opacity-50"
                      style={{ fontSize: "0.88rem" }}
                    >
                      {csvUploading ? "Importing…" : `Import ${csvPreview?.count ?? ""} Students`}
                    </button>
                  )}
                  {csvImportSummary && (
                    <div className="mt-3 space-y-2">
                      <div className="px-4 py-3 rounded-xl bg-[#D1FAE5] border border-[#059669]/20 text-[#059669]"
                           style={{ fontSize: "0.85rem" }}>
                        Imported: {csvImportSummary.imported}
                      </div>
                      {csvImportSummary.skipped > 0 && (
                        <div className="px-4 py-3 rounded-xl bg-[#EFF6FF] border border-[#3B82F6]/20 text-[#3B82F6]"
                             style={{ fontSize: "0.85rem" }}>
                          Skipped: {csvImportSummary.skipped}
                        </div>
                      )}
                      {csvErrors.map((e, i) => (
                        <div key={i} className="px-4 py-3 rounded-xl bg-[#FEE2E2] border border-[#EF4444]/20 text-[#EF4444]"
                             style={{ fontSize: "0.85rem" }}>
                          Row {e.row}: {e.reason}
                        </div>
                      ))}
                    </div>
                  )}
                  {csvCredentials.length > 0 && (
                    <div className="mt-4 rounded-xl border border-[#E8E2DA] overflow-hidden">
                      <div className="px-4 py-2 bg-[#FAF8F4] border-b border-[#E8E2DA]">
                        <p style={{ fontSize: "0.68rem", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600, color: "#A39A8E" }}>
                          Generated credentials (shown once)
                        </p>
                      </div>
                      <div className="divide-y divide-[#E8E2DA] max-h-40 overflow-y-auto">
                        {csvCredentials.map(c => (
                          <div key={c.email} className="flex items-center justify-between px-4 py-2.5">
                            <span className="truncate" style={{ fontSize: "0.82rem", color: "#A39A8E" }}>{c.email}</span>
                            <span style={{ fontSize: "0.82rem", fontFamily: "monospace", color: "#1F1A12", flexShrink: 0, marginLeft: 12 }}>{c.password}</span>
                          </div>
                        ))}
                      </div>
                      <p className="px-4 py-2 text-center" style={{ fontSize: "0.75rem", color: "#A39A8E" }}>
                        Credentials have been emailed to all students.
                      </p>
                    </div>
                  )}
                </motion.div>
              </div>

              {/* Approved students table */}
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.12 }}
                className="bg-white rounded-2xl border border-[#E8E2DA] overflow-hidden shadow-[0_2px_8px_rgba(31,26,18,0.06)]"
              >
                <div className="px-6 py-4 border-b border-[#E8E2DA] flex items-center justify-between gap-4">
                  <p style={{ fontSize: "0.68rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600, color: "#A39A8E" }}>
                    Approved students ({approved.length})
                  </p>
                  <div className="flex items-center gap-3">
                    {removeError && (
                      <span style={{ fontSize: "0.8rem", color: "#EF4444" }}>{removeError}</span>
                    )}
                    <div className="relative">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A39A8E]" />
                      <input
                        value={accountSearch}
                        onChange={e => setAccountSearch(e.target.value)}
                        placeholder="Search name or email…"
                        className="pl-9 pr-4 py-1.5 rounded-xl border border-[#E0DAD0] bg-[#FAF8F4] text-[#1F1A12] focus:outline-none focus:border-[#8C6D3F]/50 transition-colors"
                        style={{ fontSize: "0.82rem", width: "220px" }}
                      />
                    </div>
                  </div>
                </div>
                {approvedLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="w-5 h-5 border-2 border-[#E8E2DA] border-t-[#8C6D3F] rounded-full animate-spin" />
                  </div>
                ) : (
                  <div>
                    {filteredApproved.map((s, idx) => {
                      const { bg, text } = roleAvatarColors(s.role);
                      return (
                        <motion.div
                          key={s.email}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: idx * 0.025 }}
                          className="flex items-center gap-4 px-6 py-3 hover:bg-[#FAF8F4] transition-colors border-b border-[#E8E2DA] last:border-0"
                        >
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                            style={{ background: bg, color: text, fontSize: "0.7rem", fontWeight: 700 }}
                          >
                            {getInitials(s.full_name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#1F1A12] truncate">{s.full_name}</p>
                            <p className="text-xs text-[#A39A8E] truncate">{s.email}</p>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold shrink-0"
                                style={{ background: bg, color: text }}>
                            {s.role}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${s.student_id ? "bg-[#D1FAE5] text-[#059669]" : "bg-[#F3F4F6] text-[#6B7280]"}`}>
                            {s.student_id ? "✓ Active" : "Pending"}
                          </span>
                          <button
                            onClick={() => handleRemove(s.email)}
                            disabled={removing === s.email}
                            className="p-1.5 rounded-full hover:bg-[#FEE2E2] text-[#C4BBB0] hover:text-[#EF4444] transition-colors disabled:opacity-40 shrink-0"
                          >
                            {removing === s.email
                              ? <div className="w-3.5 h-3.5 border border-[#EF4444]/30 border-t-[#EF4444] rounded-full animate-spin" />
                              : <X size={13} strokeWidth={1.5} />
                            }
                          </button>
                        </motion.div>
                      );
                    })}
                    {filteredApproved.length === 0 && (
                      <p className="text-center py-8 text-[#A39A8E]" style={{ fontSize: "0.88rem" }}>
                        {accountSearch ? "No students match your search." : "No approved students yet."}
                      </p>
                    )}
                  </div>
                )}
              </motion.div>

              {/* Promote staff */}
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.18 }}
                className="bg-white rounded-2xl border border-[#E8E2DA] p-6 shadow-[0_2px_8px_rgba(31,26,18,0.06)]"
              >
                <p className="text-[#8C6D3F] mb-4"
                   style={{ fontSize: "0.68rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600 }}>
                  · Promote to staff
                </p>
                <form onSubmit={handlePromote} className="flex items-end gap-3 flex-wrap">
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label style={{ fontSize: "0.68rem", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600, color: "#A39A8E", display: "block", marginBottom: 6 }}>
                      Staff email
                    </label>
                    <input
                      type="email"
                      value={promoteEmail}
                      onChange={e => setPromoteEmail(e.target.value)}
                      placeholder="staff@snec.com.sg"
                      className="w-full px-4 py-2.5 rounded-xl border border-[#E0DAD0] bg-white text-[#1F1A12] focus:outline-none focus:border-[#8C6D3F]/50 transition-colors"
                      style={{ fontSize: "0.9rem" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.68rem", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600, color: "#A39A8E", display: "block", marginBottom: 6 }}>
                      Role
                    </label>
                    <select
                      value={promoteRole}
                      onChange={e => setPromoteRole(e.target.value)}
                      className="px-4 py-2.5 rounded-xl border border-[#E0DAD0] bg-white text-[#1F1A12] focus:outline-none focus:border-[#8C6D3F]/50 transition-colors"
                      style={{ fontSize: "0.9rem" }}
                    >
                      <option value="supervisor">Supervisor</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={promoting}
                    className="px-5 py-2.5 rounded-full bg-[#1F1A12] text-[#FAF8F4] font-medium hover:bg-[#3A3024] transition-colors disabled:opacity-50"
                    style={{ fontSize: "0.88rem" }}
                  >
                    {promoting ? "…" : "Promote"}
                  </button>
                </form>
                {promoteMsg && (
                  <div className="mt-3 px-4 py-3 rounded-xl bg-[#D1FAE5] border border-[#059669]/20 text-[#059669]"
                       style={{ fontSize: "0.85rem" }}>
                    {promoteMsg}
                  </div>
                )}
              </motion.div>
            </div>
          );
        })()}

        {/* ── ACTIVITY ───────────────────────────────────────── */}
        {tab === "activity" && (
          <div className="space-y-8">
            {feedLoading && (
              <div className="flex justify-center py-12">
                <div className="w-5 h-5 border-2 border-[#E8E2DA] border-t-[#8C6D3F] rounded-full animate-spin" />
              </div>
            )}
            {!feedLoading && feed.length === 0 && (
              <p className="text-center py-12 text-[#A39A8E]" style={{ fontSize: "0.92rem" }}>
                No activity recorded yet.
              </p>
            )}
            {!feedLoading && groupFeedByDate(feed).map((group, gIdx) => (
              <motion.div
                key={group.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: gIdx * 0.06 }}
              >
                {/* Day separator */}
                <div className="flex items-center gap-4 mb-3">
                  <span style={{ fontSize: "0.68rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700, color: "#A39A8E", flexShrink: 0 }}>
                    {group.label}
                  </span>
                  <div className="flex-1 h-px bg-[#E8E2DA]" />
                </div>

                {/* Events */}
                <div className="space-y-2">
                  {group.items.map((item, idx) => {
                    const isCase = item.type === "case";
                    const failed = item.detail.startsWith("✗");
                    return (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: idx * 0.03 }}
                        className="bg-white rounded-2xl border border-[#E8E2DA] px-5 py-4 flex items-center gap-4 hover:shadow-[0_2px_8px_rgba(31,26,18,0.08)] transition-shadow"
                      >
                        {/* Event icon */}
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                          isCase
                            ? (failed ? "bg-[#FEE2E2]" : "bg-[#D1FAE5]")
                            : "bg-[#EFF6FF]"
                        }`}>
                          {isCase
                            ? (failed
                                ? <XCircle size={15} className="text-[#EF4444]" />
                                : <CheckCircle size={15} className="text-[#059669]" />)
                            : <MessageSquare size={15} className="text-[#3B82F6]" />
                          }
                        </div>

                        {/* Name + detail */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <button
                              onClick={() => setDetailStudentId(item.student_id)}
                              className="text-sm font-semibold text-[#8C6D3F] hover:underline shrink-0"
                            >
                              {item.name}
                            </button>
                            <span className="text-sm text-[#5C544A] truncate">
                              {item.detail.replace(/^[✓✗]\s*/, "")}
                            </span>
                          </div>
                          {item.token_count ? (
                            <p style={{ fontSize: "0.75rem", color: "#A39A8E", marginTop: 2 }}>
                              {item.token_count.toLocaleString()} tokens
                            </p>
                          ) : null}
                        </div>

                        {/* Timestamp */}
                        <span className="shrink-0 tabular-nums" style={{ fontSize: "0.75rem", color: "#A39A8E" }}>
                          {formatFeedTime(item.timestamp)}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            ))}
          </div>
        )}

      </div>

      {/* ── Modals ───────────────────────────────────────────── */}
      {detailStudentId && (
        <AdminStudentDetail studentId={detailStudentId} onClose={() => setDetailStudentId(null)} />
      )}
      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} onSuccess={() => setShowChangePassword(false)} />
      )}
    </div>
  );
}
