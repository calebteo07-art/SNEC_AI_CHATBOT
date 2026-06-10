"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/providers/AuthProvider";

interface ApprovedStudent { email: string; full_name: string; role: string; added_by: string; added_at: string; student_id: string; }
interface StudentProfile { student_id: string; full_name: string; email: string; role: string; session_count: number | string; streak: number | string; last_active: string; learning_velocity: string; }
interface FeedItem { type: string; student_id: string; name: string; detail: string; timestamp: string; token_count?: number; }
interface CohortData { total_students: number; active_this_week: number; at_risk_count: number; weakest_topics: string[]; }
interface AtRiskItem { student_id: string; name: string; days_inactive: number; weak_topic_count: number; }
interface Credential { full_name: string; email: string; password: string; }

type Tab = "overview" | "students" | "accounts" | "activity";

function fmtTokens(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n); }

function getInitials(name: string) {
  return name.split(" ").filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  OA:  { bg: "rgba(34,197,94,0.12)", color: "#16a34a" },
  OT:  { bg: "rgba(167,139,250,0.12)", color: "#7c3aed" },
  PSA: { bg: "rgba(52,211,153,0.12)", color: "#059669" },
  admin:      { bg: "rgba(60,144,255,0.1)", color: "#3C90FF" },
  supervisor: { bg: "rgba(96,165,250,0.12)", color: "#2563eb" },
};

function RoleBadge({ role }: { role: string }) {
  const c = ROLE_COLORS[role] ?? { bg: "rgba(0,0,0,0.06)", color: "rgba(0,0,0,0.4)" };
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: c.bg, color: c.color }}>
      {role}
    </span>
  );
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

export default function AdminPage() {
  const { user } = useAuth();
  const adminId = user?.studentId ?? "";

  const [tab, setTab] = useState<Tab>("overview");

  const [cohort, setCohort] = useState<CohortData | null>(null);
  const [atRisk, setAtRisk] = useState<AtRiskItem[]>([]);
  const [totalTokens, setTotalTokens] = useState(0);
  const [aiInsight, setAiInsight] = useState("");
  const [overviewLoading, setOverviewLoading] = useState(true);

  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [tokensByStudent, setTokensByStudent] = useState<Record<string, number>>({});
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentFilter, setStudentFilter] = useState<"all" | "OA" | "OT" | "PSA" | "at-risk">("all");

  const [approved, setApproved] = useState<ApprovedStudent[]>([]);
  const [approvedLoading, setApprovedLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  const [addedCredential, setAddedCredential] = useState<{ email: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
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

  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedLoaded, setFeedLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/supervisor/cohort", { credentials: "include" }).then(r => r.json()).catch(() => null),
      fetch("/api/supervisor/at-risk", { credentials: "include" }).then(r => r.json()).catch(() => ({ at_risk: [] })),
      fetch("/api/admin/token-summary", { credentials: "include" }).then(r => r.json()).catch(() => ({ total_tokens: 0 })),
      fetch("/api/supervisor/insights", { credentials: "include" }).then(r => r.json()).catch(() => ({ insight: "" })),
    ]).then(([cohortData, riskData, tokenData, insightData]) => {
      if (cohortData) setCohort(cohortData);
      setAtRisk(riskData?.at_risk ?? []);
      setTotalTokens(tokenData?.total_tokens ?? 0);
      setAiInsight(insightData?.insight ?? "");
    }).finally(() => setOverviewLoading(false));

    fetch("/api/admin/approved", { credentials: "include" })
      .then(r => r.json()).then(d => setApproved(d.students ?? [])).catch(() => {})
      .finally(() => setApprovedLoading(false));
  }, []);

  const loadStudents = () => {
    if (studentsLoaded) return;
    setStudentsLoading(true);
    Promise.all([
      fetch("/api/admin/students", { credentials: "include" }).then(r => r.json()).catch(() => ({ students: [] })),
      fetch("/api/admin/token-summary", { credentials: "include" }).then(r => r.json()).catch(() => ({ by_student: [] })),
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
    fetch("/api/admin/activity", { credentials: "include" })
      .then(r => r.json()).then(d => { setFeed(d.feed ?? []); setFeedLoaded(true); }).catch(() => {})
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
      const res = await fetch("/api/admin/approved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: newEmail.trim().toLowerCase(), full_name: newName.trim(), role: newRole }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setAddError((d as { detail?: string }).detail ?? "Failed to add."); return; }
      await res.json();
      setAddedCredential({ email: newEmail.trim().toLowerCase() });
      setApproved(prev => [...prev, { email: newEmail.trim().toLowerCase(), full_name: newName.trim(), role: newRole, added_by: adminId, added_at: "", student_id: "" }]);
      setNewEmail(""); setNewName(""); setNewRole("");
    } catch { setAddError("Network error."); }
    setAdding(false);
  };

  const handleRemove = async (email: string) => {
    setRemoving(email);
    try {
      const res = await fetch(`/api/admin/approved/${encodeURIComponent(email)}`, { method: "DELETE", credentials: "include" });
      if (res.ok) setApproved(prev => prev.filter(s => s.email !== email));
    } catch { /* ignore */ }
    setRemoving(null);
  };

  const handlePromote = async (e: React.FormEvent) => {
    e.preventDefault();
    setPromoting(true); setPromoteMsg("");
    try {
      const res = await fetch("/api/admin/promote", {
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
      const res = await fetch("/api/admin/upload-csv", { method: "POST", credentials: "include", body: form });
      const data = await res.json();
      setCsvImportSummary({ imported: data.imported, skipped: data.skipped });
      setCsvErrors(data.errors ?? []);
      setCsvCredentials(data.credentials ?? []);
      setCsvFile(null); setCsvPreview(null);
    } catch {
      setCsvImportSummary({ imported: 0, skipped: 0 });
      setCsvErrors([{ row: 0, reason: "Network error." }]);
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

  const TABS: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "students", label: "Students" },
    { key: "accounts", label: "Accounts" },
    { key: "activity", label: "Activity" },
  ];

  const inputCls = "w-full bg-white/70 border border-black/[0.08] rounded-[12px] px-3 py-2.5 text-[#1F1F1F] text-sm placeholder:text-[#1F1F1F]/30 outline-none focus:border-[#3C90FF]/30 transition-colors";

  return (
    <div className="max-w-5xl mx-auto px-5 py-6">
      {/* Header */}
      <h1 className="gem-gradient-text text-[52px] font-medium tracking-[-0.04em] leading-none mb-6">Admin</h1>

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-8 p-1 rounded-full gem-glass w-fit">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className="rounded-full px-4 py-1.5 text-sm font-semibold transition-all"
            style={{
              background: tab === key ? "#3C90FF" : "transparent",
              color: tab === key ? "#FFFFFF" : "rgba(0,0,0,0.45)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === "overview" && (
        overviewLoading ? (
          <div className="flex justify-center py-16">
            <span className="w-8 h-8 border-2 border-[#3C90FF]/20 border-t-[#3C90FF] rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: "Total Students", val: cohort?.total_students ?? 0, color: "#3C90FF" },
                { label: "Active This Week", val: cohort?.active_this_week ?? 0, color: "#22c55e" },
                { label: "At Risk", val: cohort?.at_risk_count ?? 0, color: "#ef4444" },
                { label: "AI Tokens", val: fmtTokens(totalTokens), color: "#f59e0b" },
                { label: "Momentum", val: "↑", color: "#a78bfa" },
              ].map(({ label, val, color }) => (
                <div key={label} className="gem-glass rounded-[20px] p-4">
                  <div className="text-[#1F1F1F]/35 text-[9px] uppercase tracking-[0.14em] font-semibold mb-2">{label}</div>
                  <div className="text-2xl font-medium tracking-[-0.03em]" style={{ color }}>{val}</div>
                </div>
              ))}
            </div>

            {aiInsight && (
              <div className="gem-glass rounded-[20px] p-5">
                <p className="text-[#1F1F1F]/40 text-[9px] uppercase tracking-[0.16em] font-semibold mb-2">AI Insight</p>
                <p className="text-[#1F1F1F]/60 text-sm leading-relaxed italic">&quot;{aiInsight}&quot;</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="gem-glass rounded-[20px] p-5">
                <p className="text-red-500 text-[9px] uppercase tracking-[0.16em] font-semibold mb-3">At-Risk Students</p>
                {atRisk.length === 0 ? (
                  <p className="text-[#1F1F1F]/25 text-sm">No at-risk students.</p>
                ) : (
                  <div className="space-y-2">
                    {atRisk.map(s => (
                      <div key={s.student_id} className="flex items-center justify-between">
                        <span className="text-[#1F1F1F]/70 text-sm font-medium">{s.name}</span>
                        <span className="text-[#1F1F1F]/30 text-xs">{s.days_inactive}d · {s.weak_topic_count} weak</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="gem-glass rounded-[20px] p-5">
                <p className="text-amber-600 text-[9px] uppercase tracking-[0.16em] font-semibold mb-3">Weak Topics</p>
                {(cohort?.weakest_topics ?? []).length === 0 ? (
                  <p className="text-[#1F1F1F]/25 text-sm">No data yet.</p>
                ) : (
                  <div className="space-y-2">
                    {(cohort?.weakest_topics ?? []).slice(0, 5).map((t, i) => (
                      <div key={t} className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-black/[0.06] rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.max(20, 90 - i * 15)}%` }} />
                        </div>
                        <span className="text-[#1F1F1F]/50 text-xs shrink-0 w-28 truncate">{t}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      )}

      {/* STUDENTS */}
      {tab === "students" && (
        <div>
          <div className="flex gap-3 mb-4 flex-wrap">
            <input
              className={`flex-1 min-w-[200px] ${inputCls}`}
              value={studentSearch}
              onChange={e => setStudentSearch(e.target.value)}
              placeholder="Search name or email…"
            />
            <div className="flex gap-1 flex-wrap">
              {(["all", "OA", "OT", "PSA", "at-risk"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setStudentFilter(f)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                  style={{
                    background: studentFilter === f ? "#3C90FF" : "rgba(0,0,0,0.06)",
                    color: studentFilter === f ? "#FFFFFF" : "rgba(0,0,0,0.45)",
                  }}
                >
                  {f === "all" ? "All" : f === "at-risk" ? "At Risk" : f}
                </button>
              ))}
            </div>
          </div>

          {studentsLoading ? (
            <div className="flex justify-center py-12">
              <span className="w-6 h-6 border-2 border-[#3C90FF]/20 border-t-[#3C90FF] rounded-full animate-spin" />
            </div>
          ) : (
            <div className="gem-glass rounded-[20px] overflow-hidden">
              <div className="grid text-[9px] uppercase tracking-[0.14em] font-semibold text-[#1F1F1F]/35 px-4 py-2.5 border-b border-black/[0.06]"
                style={{ gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr 1fr 1fr" }}>
                <span>Name</span><span>Email</span><span>Role</span><span>Sessions</span><span>Streak</span><span>Tokens</span><span>Last Active</span>
              </div>
              {filteredStudents.map((s, i) => (
                <div
                  key={s.student_id}
                  className="grid items-center px-4 py-3 hover:bg-black/[0.02] transition-colors border-b border-black/[0.04] last:border-0"
                  style={{ gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr 1fr 1fr", animationDelay: `${i * 20}ms` }}
                >
                  <span className="text-[#1F1F1F]/80 text-sm font-medium truncate">{s.full_name}</span>
                  <span className="text-[#1F1F1F]/40 text-xs truncate">{s.email}</span>
                  <span><RoleBadge role={s.role} /></span>
                  <span className="text-[#1F1F1F]/50 text-xs font-mono">{s.session_count}</span>
                  <span className="text-[#1F1F1F]/50 text-xs font-mono">{s.streak}</span>
                  <span className="text-[#3C90FF] text-xs font-mono font-semibold">{fmtTokens(tokensByStudent[s.student_id] ?? 0)}</span>
                  <span className="text-[#1F1F1F]/25 text-xs font-mono">{s.last_active?.slice(0, 10) || "—"}</span>
                </div>
              ))}
              {filteredStudents.length === 0 && (
                <div className="text-center py-10 text-[#1F1F1F]/25 text-sm">No students found.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ACCOUNTS */}
      {tab === "accounts" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Add one student */}
            <div className="gem-glass rounded-[24px] p-6">
              <p className="text-[#1F1F1F]/40 text-[9px] uppercase tracking-[0.18em] font-semibold mb-5">Add One Student</p>
              <form onSubmit={handleAdd} className="space-y-3">
                {[
                  { label: "Full name", val: newName, set: setNewName, type: "text", placeholder: "Jane Doe" },
                  { label: "Email", val: newEmail, set: setNewEmail, type: "email", placeholder: "jane@snec.com.sg" },
                ].map(({ label, val, set, type, placeholder }) => (
                  <div key={label}>
                    <label className="text-[#1F1F1F]/35 text-[9px] uppercase tracking-[0.14em] font-semibold block mb-1.5">{label}</label>
                    <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={placeholder} className={inputCls} />
                  </div>
                ))}
                <div>
                  <label className="text-[#1F1F1F]/35 text-[9px] uppercase tracking-[0.14em] font-semibold block mb-1.5">Role</label>
                  <select value={newRole} onChange={e => setNewRole(e.target.value)} className={`${inputCls} cursor-pointer`}>
                    <option value="">Select role…</option>
                    <option value="OA">Ophthalmic Assistant (OA)</option>
                    <option value="OT">Ophthalmic Technician (OT)</option>
                    <option value="PSA">Patient Service Associate (PSA)</option>
                  </select>
                </div>
                {addError && <p className="text-red-500 text-xs">{addError}</p>}
                <button type="submit" disabled={adding} className="w-full py-2.5 rounded-full bg-[#3C90FF] text-white text-sm font-semibold hover:bg-[#5AA6FF] transition-colors disabled:opacity-50">
                  {adding ? "Adding…" : "Add Student"}
                </button>
              </form>
              {addedCredential && (
                <div className="mt-3 p-3 rounded-[12px] bg-green-500/10 border border-green-500/20">
                  <p className="text-green-600 text-xs">Added. Credentials emailed to {addedCredential.email}.</p>
                </div>
              )}
            </div>

            {/* CSV import */}
            <div className="gem-glass rounded-[24px] p-6">
              <p className="text-[#1F1F1F]/40 text-[9px] uppercase tracking-[0.18em] font-semibold mb-5">Bulk Import via CSV</p>
              <div
                className="border-2 border-dashed border-black/10 rounded-[16px] p-8 text-center cursor-pointer hover:border-[#3C90FF]/30 hover:bg-[#3C90FF]/[0.02] transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleCsvFile(f); }}
              >
                <p className="text-[#1F1F1F]/50 text-sm font-medium mb-1">Drop CSV here or click to browse</p>
                <p className="text-[#1F1F1F]/30 text-xs">Columns: full_name · email · role</p>
                <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); }} />
              </div>
              {csvPreview && <p className="mt-2 text-[#3C90FF] text-xs">{csvPreview.count} students ready to import</p>}
              {csvFile && (
                <button onClick={handleCsvImport} disabled={csvUploading} className="w-full mt-3 py-2.5 rounded-full bg-[#3C90FF] text-white text-sm font-semibold hover:bg-[#5AA6FF] transition-colors disabled:opacity-50">
                  {csvUploading ? "Importing…" : `Import ${csvPreview?.count ?? ""} Students`}
                </button>
              )}
              {csvImportSummary && (
                <div className="mt-3 space-y-2">
                  <p className="text-green-600 text-xs">Imported: {csvImportSummary.imported}</p>
                  {csvImportSummary.skipped > 0 && <p className="text-[#3C90FF] text-xs">Skipped: {csvImportSummary.skipped}</p>}
                  {csvErrors.map((e, i) => <p key={i} className="text-red-500 text-xs">Row {e.row}: {e.reason}</p>)}
                </div>
              )}
              {csvCredentials.length > 0 && (
                <div className="mt-4 gem-glass rounded-[14px] overflow-hidden">
                  <div className="px-4 py-2 border-b border-black/[0.06]">
                    <p className="text-[#1F1F1F]/30 text-[9px] uppercase tracking-[0.14em] font-semibold">Generated credentials (shown once)</p>
                  </div>
                  <div className="max-h-32 overflow-y-auto divide-y divide-black/[0.04]">
                    {csvCredentials.map(c => (
                      <div key={c.email} className="flex items-center justify-between px-4 py-2">
                        <span className="text-[#1F1F1F]/40 text-xs truncate">{c.email}</span>
                        <span className="text-[#1F1F1F]/70 text-xs font-mono shrink-0 ml-3">{c.password}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Approved list */}
          <div className="gem-glass rounded-[24px] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06]">
              <p className="text-[#1F1F1F]/40 text-[9px] uppercase tracking-[0.18em] font-semibold">Approved Students ({approved.length})</p>
            </div>
            {approvedLoading ? (
              <div className="flex justify-center py-8">
                <span className="w-5 h-5 border-2 border-[#3C90FF]/20 border-t-[#3C90FF] rounded-full animate-spin" />
              </div>
            ) : (
              <div className="divide-y divide-black/[0.04]">
                {approved.map(s => (
                  <div key={s.email} className="flex items-center gap-4 px-5 py-3 hover:bg-black/[0.02] transition-colors">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold bg-[#3C90FF]/10 text-[#3C90FF]">
                      {getInitials(s.full_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#1F1F1F]/80 text-sm font-medium truncate">{s.full_name}</p>
                      <p className="text-[#1F1F1F]/40 text-xs truncate">{s.email}</p>
                    </div>
                    <RoleBadge role={s.role} />
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${s.student_id ? "bg-green-500/10 text-green-600" : "bg-black/[0.06] text-[#1F1F1F]/35"}`}>
                      {s.student_id ? "Active" : "Pending"}
                    </span>
                    <button
                      onClick={() => handleRemove(s.email)}
                      disabled={removing === s.email}
                      className="text-[#1F1F1F]/20 hover:text-red-500 transition-colors disabled:opacity-40 shrink-0"
                    >
                      {removing === s.email ? (
                        <span className="w-3.5 h-3.5 border border-red-400/30 border-t-red-400 rounded-full animate-spin block" />
                      ) : "✕"}
                    </button>
                  </div>
                ))}
                {approved.length === 0 && <p className="text-center py-8 text-[#1F1F1F]/25 text-sm">No approved students yet.</p>}
              </div>
            )}
          </div>

          {/* Promote staff */}
          <div className="gem-glass rounded-[24px] p-6">
            <p className="text-[#1F1F1F]/40 text-[9px] uppercase tracking-[0.18em] font-semibold mb-4">Promote to Staff</p>
            <form onSubmit={handlePromote} className="flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className="text-[#1F1F1F]/35 text-[9px] uppercase tracking-[0.14em] font-semibold block mb-1.5">Staff email</label>
                <input type="email" value={promoteEmail} onChange={e => setPromoteEmail(e.target.value)} placeholder="staff@snec.com.sg" className={inputCls} />
              </div>
              <div>
                <label className="text-[#1F1F1F]/35 text-[9px] uppercase tracking-[0.14em] font-semibold block mb-1.5">Role</label>
                <select value={promoteRole} onChange={e => setPromoteRole(e.target.value)} className={`${inputCls} cursor-pointer`} style={{ width: 140 }}>
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button type="submit" disabled={promoting} className="px-5 py-2.5 rounded-full bg-[#3C90FF] text-white text-sm font-semibold hover:bg-[#5AA6FF] transition-colors disabled:opacity-50">
                {promoting ? "…" : "Promote"}
              </button>
            </form>
            {promoteMsg && <p className="text-green-600 text-xs mt-3">{promoteMsg}</p>}
          </div>
        </div>
      )}

      {/* ACTIVITY */}
      {tab === "activity" && (
        <div className="space-y-8">
          {feedLoading && (
            <div className="flex justify-center py-12">
              <span className="w-6 h-6 border-2 border-[#3C90FF]/20 border-t-[#3C90FF] rounded-full animate-spin" />
            </div>
          )}
          {!feedLoading && feed.length === 0 && (
            <p className="text-center py-12 text-[#1F1F1F]/25 text-sm">No activity recorded yet.</p>
          )}
          {!feedLoading && groupFeedByDate(feed).map(group => (
            <div key={group.label}>
              <div className="flex items-center gap-4 mb-3">
                <span className="text-[#1F1F1F]/35 text-[9px] uppercase tracking-[0.18em] font-semibold shrink-0">{group.label}</span>
                <div className="flex-1 h-px bg-black/[0.06]" />
              </div>
              <div className="space-y-2">
                {group.items.map((item, i) => {
                  const isCase = item.type === "case";
                  const failed = item.detail.startsWith("✗");
                  return (
                    <div key={i} className="gem-glass flex items-center gap-4 rounded-[16px] px-5 py-3.5">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: isCase ? (failed ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)") : "rgba(60,144,255,0.12)" }}
                      >
                        <span className="text-sm">
                          {isCase ? (failed ? "✗" : "✓") : "💬"}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-[#1F1F1F]/70 text-sm font-semibold shrink-0">{item.name}</span>
                          <span className="text-[#1F1F1F]/40 text-sm truncate">{item.detail.replace(/^[✓✗]\s*/, "")}</span>
                        </div>
                        {item.token_count ? (
                          <p className="text-[#1F1F1F]/25 text-xs mt-0.5">{item.token_count.toLocaleString()} tokens</p>
                        ) : null}
                      </div>
                      <span className="text-[#1F1F1F]/25 text-xs font-mono shrink-0">{formatFeedTime(item.timestamp)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
