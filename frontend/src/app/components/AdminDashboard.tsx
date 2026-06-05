import React, { useEffect, useState, useRef } from "react";
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
        {tab === "accounts" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="admin-form-grid">
              {/* Add one student */}
              <div className="admin-form-card">
                <div className="admin-section-label" style={{ color: "var(--teal-deep)" }}>
                  <IconAdd /> Add one student
                </div>
                <form onSubmit={handleAdd}>
                  {[
                    { label: "Full name", val: newName, set: setNewName, type: "text", placeholder: "Jane Doe" },
                    { label: "Email",     val: newEmail, set: setNewEmail, type: "email", placeholder: "jane@snec.com.sg" },
                  ].map(({ label, val, set, type, placeholder }) => (
                    <div key={label} className="admin-field">
                      <label className="admin-field-label">{label}</label>
                      <input
                        type={type}
                        value={val}
                        onChange={e => set(e.target.value)}
                        className="admin-input"
                        placeholder={placeholder}
                      />
                    </div>
                  ))}
                  <div className="admin-field">
                    <label className="admin-field-label">Role</label>
                    <select value={newRole} onChange={e => setNewRole(e.target.value)} className="admin-input">
                      <option value="">Select role…</option>
                      <option value="OA">Ophthalmic Assistant (OA)</option>
                      <option value="OT">Ophthalmic Technician (OT)</option>
                      <option value="PSA">Patient Service Associate (PSA)</option>
                    </select>
                  </div>
                  {addError && <p className="admin-msg error">{addError}</p>}
                  <button type="submit" className="admin-btn full" disabled={adding} style={{ marginTop: 4 }}>
                    {adding ? "Adding…" : "Add Student"}
                  </button>
                </form>
                {addedCredential && (
                  <div className="admin-msg success" style={{ marginTop: 12 }}>
                    Student added. Login credentials emailed to {addedCredential.email}.
                  </div>
                )}
              </div>

              {/* CSV upload */}
              <div className="admin-form-card">
                <div className="admin-section-label" style={{ color: "var(--teal-deep)" }}>
                  <IconUpload /> Bulk import via CSV
                </div>
                <div
                  className="csv-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleCsvFile(f); }}
                >
                  <div className="csv-dropzone-icon">📄</div>
                  <div className="csv-dropzone-hint">Drop CSV here or click to browse</div>
                  <div className="csv-dropzone-sub">Columns: full_name, email, role</div>
                  <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); }} />
                </div>
                {csvPreview && (
                  <div className="admin-msg info">{csvPreview.count} students ready to import</div>
                )}
                {csvFile && (
                  <button onClick={handleCsvImport} disabled={csvUploading} className="admin-btn full" style={{ marginTop: 8 }}>
                    {csvUploading ? "Importing…" : `Import ${csvPreview?.count ?? ""} Students`}
                  </button>
                )}
                {csvImportSummary && (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div className="admin-msg success">Imported: {csvImportSummary.imported}</div>
                    {csvImportSummary.skipped > 0 && <div className="admin-msg info">Skipped: {csvImportSummary.skipped}</div>}
                    {csvErrors.map((e, i) => <div key={i} className="admin-msg error">Row {e.row}: {e.reason}</div>)}
                  </div>
                )}
                {csvCredentials.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
                      Generated credentials (shown once)
                    </div>
                    <div className="cred-list">
                      {csvCredentials.map(c => (
                        <div key={c.email} className="cred-row">
                          <span className="cred-row-email">{c.email}</span>
                          <span className="cred-row-pass">{c.password}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                      Credentials have been emailed to all students.
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Approved students table */}
            <div className="admin-table-wrap">
              <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)" }}>
                  Approved students ({approved.length})
                </span>
                {removeError && <span className="admin-msg error" style={{ marginTop: 0 }}>{removeError}</span>}
              </div>
              {approvedLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
                  <span className="spinner spinner--teal" />
                </div>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      {["Name", "Email", "Role", "Status", ""].map(h => <th key={h}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {approved.map(s => (
                      <tr key={s.email} style={{ cursor: "default" }}>
                        <td style={{ fontWeight: 600 }}>{s.full_name}</td>
                        <td style={{ color: "var(--muted)", fontSize: 12 }}>{s.email}</td>
                        <td><span className={roleBadgeClass(s.role)}>{s.role}</span></td>
                        <td>
                          <span className={s.student_id ? "role-badge status-active" : "role-badge status-pending"}>
                            {s.student_id ? "✓ Active" : "Pending"}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            className="admin-btn danger"
                            onClick={() => handleRemove(s.email)}
                            disabled={removing === s.email}
                            style={{ padding: "4px 10px", fontSize: 11, borderBottomWidth: 2 }}
                          >
                            {removing === s.email ? "…" : "Remove"}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {approved.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: "24px 0", fontSize: 13 }}>
                          No approved students yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Promote staff */}
            <div className="admin-form-card">
              <div className="admin-section-label" style={{ color: "var(--teal-deep)" }}>
                <IconShield /> Promote staff
              </div>
              <form onSubmit={handlePromote} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div className="admin-field" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
                  <label className="admin-field-label">Staff email</label>
                  <input
                    type="email"
                    value={promoteEmail}
                    onChange={e => setPromoteEmail(e.target.value)}
                    className="admin-input"
                    placeholder="staff@snec.com.sg"
                  />
                </div>
                <div className="admin-field" style={{ marginBottom: 0 }}>
                  <label className="admin-field-label">Role</label>
                  <select value={promoteRole} onChange={e => setPromoteRole(e.target.value)} className="admin-input">
                    <option value="supervisor">Supervisor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <button type="submit" disabled={promoting} className="admin-btn">
                  {promoting ? "…" : "Promote"}
                </button>
              </form>
              {promoteMsg && <p className="admin-msg success">{promoteMsg}</p>}
            </div>
          </div>
        )}

        {/* ── ACTIVITY ───────────────────────────────────────── */}
        {tab === "activity" && (
          <div>
            {feedLoading && (
              <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
                <span className="spinner spinner--teal" />
              </div>
            )}
            {!feedLoading && feed.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--muted)" }}>No activity yet.</p>
            )}
            {feed.map((item, i) => (
              <div key={i} className="feed-item">
                <div style={{ display: "flex", alignItems: "center" }}>
                  <button className="feed-item-name" onClick={() => setDetailStudentId(item.student_id)}>
                    {item.name}
                  </button>
                  <span className="feed-item-detail">{item.detail}</span>
                  {item.token_count ? (
                    <span className="feed-item-tokens">· {item.token_count.toLocaleString()} tokens</span>
                  ) : null}
                </div>
                <span className="feed-item-date">{item.timestamp?.slice(0, 10)}</span>
              </div>
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
