import React, { useEffect, useState, useRef } from "react";
import { motion } from "motion/react";
import { HolographicEyeLogo } from "./HolographicEyeLogo";
import { useNavigate } from "react-router";
import { useAuth } from "./AuthContext";
import { LogOut, UserPlus, ShieldCheck, Users, Activity, BarChart2, Upload } from "lucide-react";
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

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-[#2a2a4a] rounded-xl p-4 text-center">
      <div className="text-2xl font-bold mb-1" style={{ color: color ?? "#8C6D3F" }}>{value}</div>
      <div className="text-[#888] text-xs">{label}</div>
    </div>
  );
}

function fmtTokens(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n); }

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
      fetch(`${API}/api/supervisor/cohort`, { credentials: "include" }).then((r) => r.json()).catch(() => null),
      fetch(`${API}/api/supervisor/at-risk`, { credentials: "include" }).then((r) => r.json()).catch(() => ({ at_risk: [] })),
      fetch(`${API}/api/admin/token-summary`, { credentials: "include" }).then((r) => r.json()).catch(() => ({ total_tokens: 0 })),
      fetch(`${API}/api/supervisor/insights`, { credentials: "include" }).then((r) => r.json()).catch(() => ({ insight: "" })),
    ]).then(([cohortData, riskData, tokenData, insightData]) => {
      if (cohortData) setCohort(cohortData);
      setAtRisk(riskData?.at_risk ?? []);
      setTotalTokens(tokenData?.total_tokens ?? 0);
      setAiInsight(insightData?.insight ?? "");
    }).finally(() => setOverviewLoading(false));

    fetch(`${API}/api/admin/approved`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setApproved(d.students ?? []))
      .catch(() => {})
      .finally(() => setApprovedLoading(false));
  }, []);

  const loadStudents = () => {
    if (studentsLoaded) return;
    setStudentsLoading(true);
    Promise.all([
      fetch(`${API}/api/admin/students`, { credentials: "include" }).then((r) => r.json()).catch(() => ({ students: [] })),
      fetch(`${API}/api/admin/token-summary`, { credentials: "include" }).then((r) => r.json()).catch(() => ({ by_student: [] })),
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
      .then((r) => r.json())
      .then((d) => { setFeed(d.feed ?? []); setFeedLoaded(true); })
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
      if (!res.ok) { const d = await res.json().catch(() => ({})); setAddError(d.detail ?? "Failed to add student."); return; }
      const data = await res.json();
      setAddedCredential({ email: newEmail.trim().toLowerCase() });
      setApproved((prev) => [...prev, { email: newEmail.trim().toLowerCase(), full_name: newName.trim(), role: newRole, added_by: adminId, added_at: "", student_id: "" }]);
      setNewEmail(""); setNewName(""); setNewRole("");
    } catch { setAddError("Network error."); }
    setAdding(false);
  };

  const handleRemove = async (email: string) => {
    setRemoving(email);
    setRemoveError("");
    try {
      const res = await fetch(`${API}/api/admin/approved/${encodeURIComponent(email)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) { setRemoveError("Failed to remove student."); setRemoving(null); return; }
      setApproved((prev) => prev.filter((s) => s.email !== email));
    } catch { setRemoveError("Network error — failed to remove student."); }
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
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) ?? "";
      const lines = text.split("\n").filter((l) => l.trim());
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
    } catch { setCsvImportSummary({ imported: 0, skipped: 0 }); setCsvErrors([{ row: 0, reason: "Network error — import failed." }]); }
    setCsvUploading(false);
  };

  const filteredStudents = students.filter((s) => {
    const q = studentSearch.toLowerCase();
    if (q && !s.full_name.toLowerCase().includes(q) && !s.email.toLowerCase().includes(q)) return false;
    if (studentFilter === "at-risk") return atRisk.some((r) => r.student_id === s.student_id);
    if (studentFilter !== "all") return s.role === studentFilter;
    return true;
  });

  // Reset to page 0 whenever search or filter changes
  React.useEffect(() => { setStudentPage(0); }, [studentSearch, studentFilter]);

  const totalPages = Math.ceil(filteredStudents.length / PAGE_SIZE);
  const pagedStudents = filteredStudents.slice(studentPage * PAGE_SIZE, (studentPage + 1) * PAGE_SIZE);

  const TABS = [
    { key: "overview" as Tab, label: "Overview", icon: <BarChart2 size={14} /> },
    { key: "students" as Tab, label: "Students", icon: <Users size={14} /> },
    { key: "accounts" as Tab, label: "Accounts", icon: <ShieldCheck size={14} /> },
    { key: "activity" as Tab, label: "Activity", icon: <Activity size={14} /> },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a14] text-[#ccc]">
      {/* Nav */}
      <div className="border-b border-[#3a3a5a] px-6 py-3 flex items-center justify-between bg-[#0f0f1e] sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <HolographicEyeLogo size={28} />
          <span className="text-[#8C6D3F] text-sm font-medium tracking-wide">EyeBot Admin</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowChangePassword(true)} className="text-[#888] hover:text-[#8C6D3F] text-xs transition-colors">Change password</button>
          <button onClick={() => { logout(); navigate("/"); }} className="flex items-center gap-1.5 text-[#888] hover:text-[#ccc] text-xs transition-colors">
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-4 border-b border-[#3a3a5a] bg-[#0f0f1e]">
        {TABS.map(({ key, label, icon }) => (
          <button key={key} onClick={() => handleTabChange(key)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs rounded-t-lg transition-colors"
            style={{ background: tab === key ? "#1a1a2e" : "transparent", color: tab === key ? "#8C6D3F" : "#888", borderBottom: tab === key ? "2px solid #8C6D3F" : "2px solid transparent" }}>
            {icon} {label}
          </button>
        ))}
      </div>

      <div className="p-6 max-w-6xl mx-auto">

        {/* OVERVIEW */}
        {tab === "overview" && (
          <div className="space-y-6">
            {overviewLoading ? (
              <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-[#8C6D3F]/40 border-t-[#8C6D3F] rounded-full animate-spin" /></div>
            ) : (
              <>
                <div className="grid grid-cols-5 gap-4">
                  <StatCard label="Total Students" value={cohort?.total_students ?? 0} />
                  <StatCard label="Active This Week" value={cohort?.active_this_week ?? 0} color="#4CAF50" />
                  <StatCard label="At Risk" value={cohort?.at_risk_count ?? 0} color="#ef4444" />
                  <StatCard label="Total Tokens" value={fmtTokens(totalTokens)} />
                  <StatCard label="Cohort Momentum" value="&#x2191;" color="#f59e0b" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#1a1a2e] rounded-xl p-5 border border-[#3a3a5a]">
                    <div className="text-[#ef4444] text-xs font-semibold uppercase tracking-widest mb-4">At-Risk Students</div>
                    {atRisk.length === 0 && <p className="text-[#888] text-sm">No at-risk students.</p>}
                    {atRisk.map((s) => (
                      <div key={s.student_id} className="flex justify-between items-center py-2 border-b border-[#3a3a5a]/50 last:border-0 text-sm">
                        <button onClick={() => setDetailStudentId(s.student_id)} className="text-[#ccc] hover:text-[#8C6D3F] transition-colors text-left">{s.name}</button>
                        <span className="text-[#ef4444] text-xs">{s.days_inactive}d inactive · {s.weak_topic_count} weak</span>
                      </div>
                    ))}
                  </div>
                  <div className="bg-[#1a1a2e] rounded-xl p-5 border border-[#3a3a5a]">
                    <div className="text-[#f59e0b] text-xs font-semibold uppercase tracking-widest mb-4">Cohort Weak Topics</div>
                    {(cohort?.weakest_topics ?? []).length === 0 && <p className="text-[#888] text-sm">No data yet.</p>}
                    {(cohort?.weakest_topics ?? []).slice(0, 5).map((t, i) => (
                      <div key={t} className="mb-3">
                        <div className="flex justify-between text-sm mb-1"><span>{t}</span></div>
                        <div className="bg-[#3a3a5a] h-1.5 rounded-full">
                          <div className="h-1.5 rounded-full bg-[#f59e0b]" style={{ width: `${Math.max(20, 90 - i * 15)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {aiInsight && (
                  <div className="bg-[#1a1a2e] border border-[#8C6D3F]/30 rounded-xl p-4 text-[#ccc] text-sm italic">{aiInsight}</div>
                )}
              </>
            )}
          </div>
        )}

        {/* STUDENTS */}
        {tab === "students" && (
          <div className="space-y-4">
            <div className="flex gap-3 items-center flex-wrap">
              <input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Search name or email&#x2026;"
                className="bg-[#1a1a2e] border border-[#3a3a5a] rounded-lg px-4 py-2 text-sm outline-none focus:border-[#8C6D3F] transition-colors flex-1 min-w-[200px]" />
              <div className="flex gap-1">
                {(["all", "OA", "OT", "PSA", "at-risk"] as const).map((f) => (
                  <button key={f} onClick={() => setStudentFilter(f)}
                    className="px-3 py-1.5 rounded-lg text-xs transition-colors"
                    style={{ background: studentFilter === f ? "#8C6D3F" : "#2a2a4a", color: studentFilter === f ? "white" : "#888" }}>
                    {f === "all" ? "All" : f === "at-risk" ? "At Risk" : f}
                  </button>
                ))}
              </div>
            </div>
            {studentsLoading ? (
              <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-[#8C6D3F]/40 border-t-[#8C6D3F] rounded-full animate-spin" /></div>
            ) : (
              <div className="bg-[#1a1a2e] rounded-xl border border-[#3a3a5a] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#3a3a5a]">
                      {["Name", "Email", "Role", "Sessions", "Streak", "Tokens", "Velocity", "Last Active"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-[#8C6D3F] text-xs uppercase tracking-wide font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedStudents.map((s) => (
                      <tr key={s.student_id} onClick={() => setDetailStudentId(s.student_id)}
                        className="border-b border-[#3a3a5a]/50 hover:bg-[#2a2a4a] cursor-pointer transition-colors">
                        <td className="px-4 py-3 text-[#ccc]">{s.full_name}</td>
                        <td className="px-4 py-3 text-[#888] text-xs">{s.email}</td>
                        <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-xs" style={{ background: "#8C6D3F22", color: "#8C6D3F" }}>{s.role}</span></td>
                        <td className="px-4 py-3 text-[#ccc]">{s.session_count}</td>
                        <td className="px-4 py-3 text-[#ccc]">{s.streak}</td>
                        <td className="px-4 py-3 text-[#8C6D3F]">{fmtTokens(tokensByStudent[s.student_id] ?? 0)}</td>
                        <td className="px-4 py-3 text-[#888] text-xs">{s.learning_velocity}</td>
                        <td className="px-4 py-3 text-[#888] text-xs">{s.last_active?.slice(0, 10) || "&#x2014;"}</td>
                      </tr>
                    ))}
                    {filteredStudents.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-[#888] text-sm">No students found.</td></tr>
                    )}
                  </tbody>
                </table>
                {filteredStudents.length > PAGE_SIZE && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-[#3a3a5a] text-xs text-[#888]">
                    <span>
                      Showing {studentPage * PAGE_SIZE + 1}–{Math.min((studentPage + 1) * PAGE_SIZE, filteredStudents.length)} of {filteredStudents.length} students
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setStudentPage((p) => Math.max(0, p - 1))}
                        disabled={studentPage === 0}
                        className="px-3 py-1 rounded bg-[#2a2a4a] disabled:opacity-40 hover:bg-[#3a3a5a] transition-colors"
                      >
                        ← Prev
                      </button>
                      <span className="px-3 py-1">Page {studentPage + 1} of {totalPages}</span>
                      <button
                        onClick={() => setStudentPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={studentPage >= totalPages - 1}
                        className="px-3 py-1 rounded bg-[#2a2a4a] disabled:opacity-40 hover:bg-[#3a3a5a] transition-colors"
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ACCOUNTS */}
        {tab === "accounts" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              {/* Add one student */}
              <div className="bg-[#1a1a2e] rounded-xl p-5 border border-[#3a3a5a]">
                <div className="text-[#8C6D3F] text-sm font-medium mb-4 flex items-center gap-2"><UserPlus size={14} /> Add one student</div>
                <form onSubmit={handleAdd} className="space-y-3">
                  {[
                    { label: "Full name", val: newName, set: setNewName, type: "text" },
                    { label: "Email", val: newEmail, set: setNewEmail, type: "email" },
                  ].map(({ label, val, set, type }) => (
                    <div key={label}>
                      <label className="block text-[#888] text-xs mb-1">{label}</label>
                      <input type={type} value={val} onChange={(e) => set(e.target.value)}
                        className="w-full bg-[#0f0f1e] border border-[#3a3a5a] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#8C6D3F] transition-colors" />
                    </div>
                  ))}
                  <div>
                    <label className="block text-[#888] text-xs mb-1">Role</label>
                    <select value={newRole} onChange={(e) => setNewRole(e.target.value)}
                      className="w-full bg-[#0f0f1e] border border-[#3a3a5a] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#8C6D3F] transition-colors">
                      <option value="">Select role&#x2026;</option>
                      <option value="OA">Ophthalmic Auxiliary (OA)</option>
                      <option value="OT">Ophthalmic Technician (OT)</option>
                      <option value="PSA">Patient Service Associate (PSA)</option>
                    </select>
                  </div>
                  {addError && <p className="text-[#ef4444] text-xs">{addError}</p>}
                  <button type="submit" disabled={adding}
                    className="w-full py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    style={{ background: "#8C6D3F", color: "white" }}>
                    {adding ? "Adding&#x2026;" : "Add Student"}
                  </button>
                </form>
                {addedCredential && (
                  <div className="mt-4 p-3 bg-[#0f0f1e] border border-[#8C6D3F]/40 rounded-lg">
                    <div className="text-[#4CAF50] text-xs mb-1">Student added successfully.</div>
                    <div className="text-[#888] text-xs">Login credentials emailed to {addedCredential.email}.</div>
                  </div>
                )}
              </div>

              {/* CSV upload */}
              <div className="bg-[#1a1a2e] rounded-xl p-5 border border-[#3a3a5a]">
                <div className="text-[#8C6D3F] text-sm font-medium mb-4 flex items-center gap-2"><Upload size={14} /> Bulk import via CSV</div>
                <div
                  className="border-2 border-dashed border-[#3a3a5a] rounded-xl p-8 text-center cursor-pointer hover:border-[#8C6D3F]/50 transition-colors mb-3"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleCsvFile(f); }}
                >
                  <div className="text-3xl mb-2">&#x1F4C4;</div>
                  <div className="text-[#888] text-xs">Drop CSV file here or click to browse</div>
                  <div className="text-[#555] text-xs mt-1">Columns: full_name, email, role</div>
                  <input ref={fileInputRef} type="file" accept=".csv" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); }} />
                </div>
                {csvPreview && (
                  <div className="bg-[#0f0f1e] rounded-lg p-3 text-xs mb-3">
                    <div className="text-[#4CAF50]">&#x2713; {csvPreview.count} students ready to import</div>
                  </div>
                )}
                {csvFile && (
                  <button onClick={handleCsvImport} disabled={csvUploading}
                    className="w-full py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    style={{ background: "#8C6D3F", color: "white" }}>
                    {csvUploading ? "Importing&#x2026;" : `Import ${csvPreview?.count ?? ""} Students`}
                  </button>
                )}
                {csvImportSummary && (
                  <div className="mt-3 text-xs space-y-1">
                    <div className="text-[#4CAF50]">Imported: {csvImportSummary.imported}</div>
                    {csvImportSummary.skipped > 0 && <div className="text-[#f59e0b]">Skipped: {csvImportSummary.skipped}</div>}
                    {csvErrors.map((e, i) => <div key={i} className="text-[#ef4444]">Row {e.row}: {e.reason}</div>)}
                  </div>
                )}
                {csvCredentials.length > 0 && (
                  <div className="mt-4">
                    <div className="text-[#8C6D3F] text-xs mb-2">Generated credentials (shown once):</div>
                    <div className="bg-[#0f0f1e] rounded-lg p-2 max-h-40 overflow-y-auto text-xs space-y-1">
                      {csvCredentials.map((c) => (
                        <div key={c.email} className="flex justify-between gap-2 py-1 border-b border-[#3a3a5a]/50">
                          <span className="text-[#888] truncate">{c.email}</span>
                          <span className="font-mono text-[#ccc] flex-shrink-0">{c.password}</span>
                        </div>
                      ))}
                    </div>
                    <div className="text-[#888] text-xs mt-1">All students have been emailed their credentials.</div>
                  </div>
                )}
              </div>
            </div>

            {/* Approved students table */}
            <div className="bg-[#1a1a2e] rounded-xl border border-[#3a3a5a] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#3a3a5a] text-[#8C6D3F] text-sm font-medium flex items-center justify-between">
                <span>Approved students ({approved.length})</span>
                {removeError && <span className="text-[#ef4444] text-xs font-normal">{removeError}</span>}
              </div>
              {approvedLoading ? (
                <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-[#8C6D3F]/40 border-t-[#8C6D3F] rounded-full animate-spin" /></div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#3a3a5a]">
                      {["Name", "Email", "Role", "Status", ""].map((h) => (
                        <th key={h} className="text-left px-4 py-2 text-[#888] text-xs font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {approved.map((s) => (
                      <tr key={s.email} className="border-b border-[#3a3a5a]/50">
                        <td className="px-4 py-2.5 text-[#ccc]">{s.full_name}</td>
                        <td className="px-4 py-2.5 text-[#888] text-xs">{s.email}</td>
                        <td className="px-4 py-2.5"><span className="px-1.5 py-0.5 rounded text-xs" style={{ background: "#8C6D3F22", color: "#8C6D3F" }}>{s.role}</span></td>
                        <td className="px-4 py-2.5"><span className={`text-xs ${s.student_id ? "text-[#4CAF50]" : "text-[#888]"}`}>{s.student_id ? "&#x2713; Active" : "Pending"}</span></td>
                        <td className="px-4 py-2.5 text-right">
                          <button onClick={() => handleRemove(s.email)} disabled={removing === s.email}
                            className="text-[#ef4444] text-xs hover:opacity-70 disabled:opacity-30">
                            {removing === s.email ? "&#x2026;" : "Remove"}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {approved.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-6 text-center text-[#888] text-sm">No approved students yet.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Promote staff */}
            <div className="bg-[#1a1a2e] rounded-xl p-5 border border-[#3a3a5a]">
              <div className="text-[#8C6D3F] text-sm font-medium mb-4 flex items-center gap-2"><ShieldCheck size={14} /> Promote staff</div>
              <form onSubmit={handlePromote} className="flex gap-3 flex-wrap items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[#888] text-xs mb-1">Staff email</label>
                  <input type="email" value={promoteEmail} onChange={(e) => setPromoteEmail(e.target.value)}
                    className="w-full bg-[#0f0f1e] border border-[#3a3a5a] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#8C6D3F] transition-colors" />
                </div>
                <div>
                  <label className="block text-[#888] text-xs mb-1">Role</label>
                  <select value={promoteRole} onChange={(e) => setPromoteRole(e.target.value)}
                    className="bg-[#0f0f1e] border border-[#3a3a5a] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#8C6D3F] transition-colors">
                    <option value="supervisor">Supervisor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <button type="submit" disabled={promoting}
                  className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  style={{ background: "#8C6D3F22", color: "#8C6D3F", border: "1px solid #8C6D3F44" }}>
                  {promoting ? "&#x2026;" : "Promote"}
                </button>
              </form>
              {promoteMsg && <p className="mt-2 text-xs text-[#4CAF50]">{promoteMsg}</p>}
            </div>
          </div>
        )}

        {/* ACTIVITY */}
        {tab === "activity" && (
          <div className="space-y-2">
            {feedLoading && <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-[#8C6D3F]/40 border-t-[#8C6D3F] rounded-full animate-spin" /></div>}
            {!feedLoading && feed.length === 0 && <p className="text-[#888] text-sm">No activity yet.</p>}
            {feed.map((item, i) => (
              <div key={i} className="bg-[#1a1a2e] rounded-lg px-4 py-3 border border-[#3a3a5a] flex justify-between items-center">
                <div>
                  <button onClick={() => setDetailStudentId(item.student_id)} className="text-[#8C6D3F] text-sm hover:underline">{item.name}</button>
                  <span className="text-[#888] text-xs ml-2">{item.detail}</span>
                  {item.token_count ? <span className="text-[#555] text-xs ml-2">· {item.token_count.toLocaleString()} tokens</span> : null}
                </div>
                <span className="text-[#555] text-xs flex-shrink-0">{item.timestamp?.slice(0, 10)}</span>
              </div>
            ))}
          </div>
        )}

      </div>

      {detailStudentId && (
        <AdminStudentDetail studentId={detailStudentId} onClose={() => setDetailStudentId(null)} />
      )}

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} onSuccess={() => setShowChangePassword(false)} />
      )}
    </div>
  );
}
