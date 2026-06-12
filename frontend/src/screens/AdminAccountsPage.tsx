import { useState, useRef, useEffect, FormEvent } from "react";
import { motion } from "motion/react";
import { useAuth } from "./AuthContext";
import { ApprovedStudent, Credential, getInitials, roleAvatarColors } from "./adminShared";

const API = "";

const inputCls = "w-full bg-[#1F1F1F]/5 border border-[#1F1F1F]/10 rounded-[12px] px-3 py-2.5 text-[#1F1F1F] text-sm placeholder:text-[#1F1F1F]/25 outline-none focus:border-[#1F1F1F]/25 transition-colors";
const cardStyle = { background: "rgba(31,31,31,0.04)", border: "1px solid rgba(31,31,31,0.08)" };
const labelCls = "text-[#1F1F1F]/30 text-[9px] uppercase tracking-[0.14em] font-semibold block mb-1.5";

export function AdminAccountsPage() {
  const { user } = useAuth();
  const adminId = user?.studentId ?? "";

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

  useEffect(() => {
    fetch(`${API}/api/admin/approved`, { credentials: "include" })
      .then(r => r.json())
      .then(d => setApproved(d.students ?? []))
      .catch(() => {})
      .finally(() => setApprovedLoading(false));
  }, []);

  const handleAdd = async (e: FormEvent) => {
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
      if (!res.ok) { setRemoveError("Failed to remove."); setRemoving(null); return; }
      setApproved(prev => prev.filter(s => s.email !== email));
    } catch { setRemoveError("Network error."); }
    setRemoving(null);
  };

  const handlePromote = async (e: FormEvent) => {
    e.preventDefault();
    setPromoting(true); setPromoteMsg("");
    try {
      const res = await fetch(`${API}/api/admin/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: promoteEmail.trim().toLowerCase(), role: promoteRole }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setPromoteMsg((d as { detail?: string }).detail ?? "Failed."); }
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
          className="rounded-[24px] p-6"
          style={cardStyle}
        >
          <p className={`mb-5 text-[#1F1F1F]/50`}
             style={{ fontSize: "0.68rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600 }}>
            · Add one student
          </p>
          <form onSubmit={handleAdd} className="space-y-3">
            {([
              { label: "Full name", val: newName, set: setNewName, type: "text", placeholder: "Jane Doe" },
              { label: "Email",     val: newEmail, set: setNewEmail, type: "email", placeholder: "jane@snec.com.sg" },
            ] as { label: string; val: string; set: (v: string) => void; type: string; placeholder: string }[]).map(({ label, val, set, type, placeholder }) => (
              <div key={label}>
                <label className={labelCls}>{label}</label>
                <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={placeholder} className={inputCls} />
              </div>
            ))}
            <div>
              <label className={labelCls}>Role</label>
              <select
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
                className={`${inputCls} cursor-pointer`}
                style={{ background: "rgba(31,31,31,0.05)", colorScheme: "light" }}
              >
                <option value="">Select role…</option>
                <option value="OA">Ophthalmic Assistant (OA)</option>
                <option value="OT">Ophthalmic Technician (OT)</option>
                <option value="PSA">Patient Service Associate (PSA)</option>
              </select>
            </div>
            {addError && <p className="text-red-400 text-xs">{addError}</p>}
            <button
              type="submit"
              disabled={adding}
              className="w-full mt-1 py-2.5 rounded-full bg-[#1F1F1F] text-[#FDFDFC] text-sm font-semibold hover:bg-white transition-colors disabled:opacity-50"
            >
              {adding ? "Adding…" : "Add Student"}
            </button>
          </form>
          {addedCredential && (
            <div className="mt-3 p-3 rounded-[12px] bg-green-500/10 border border-green-500/20">
              <p className="text-green-400 text-xs">Student added. Credentials emailed to {addedCredential.email}.</p>
            </div>
          )}
        </motion.div>

        {/* CSV import */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.06 }}
          className="rounded-[24px] p-6"
          style={cardStyle}
        >
          <p className="text-[#1F1F1F]/50 mb-5"
             style={{ fontSize: "0.68rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600 }}>
            · Bulk import via CSV
          </p>
          <div
            className="rounded-[16px] p-8 text-center cursor-pointer transition-colors"
            style={{ border: "2px dashed rgba(31,31,31,0.12)" }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleCsvFile(f); }}
            onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.borderColor = "rgba(31,31,31,0.25)")}
            onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.borderColor = "rgba(31,31,31,0.12)")}
          >
            <div style={{ fontSize: "2rem", marginBottom: 8 }}>📄</div>
            <p className="text-[#1F1F1F]/50 text-sm font-medium mb-1">Drop CSV here or click to browse</p>
            <p className="text-[#1F1F1F]/25 text-xs">Columns: full_name · email · role</p>
            <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); }} />
          </div>
          {csvPreview && <p className="mt-2 text-blue-400 text-xs">{csvPreview.count} students ready to import</p>}
          {csvFile && (
            <button
              onClick={handleCsvImport}
              disabled={csvUploading}
              className="w-full mt-3 py-2.5 rounded-full bg-[#1F1F1F] text-[#FDFDFC] text-sm font-semibold hover:bg-white transition-colors disabled:opacity-50"
            >
              {csvUploading ? "Importing…" : `Import ${csvPreview?.count ?? ""} Students`}
            </button>
          )}
          {csvImportSummary && (
            <div className="mt-3 space-y-1">
              <p className="text-green-400 text-xs">Imported: {csvImportSummary.imported}</p>
              {csvImportSummary.skipped > 0 && <p className="text-blue-400 text-xs">Skipped: {csvImportSummary.skipped}</p>}
              {csvErrors.map((e, i) => <p key={i} className="text-red-400 text-xs">Row {e.row}: {e.reason}</p>)}
            </div>
          )}
          {csvCredentials.length > 0 && (
            <div className="mt-4 rounded-[14px] overflow-hidden" style={{ border: "1px solid rgba(31,31,31,0.10)" }}>
              <div className="px-4 py-2" style={{ borderBottom: "1px solid rgba(31,31,31,0.08)" }}>
                <p className="text-[#1F1F1F]/30 text-[9px] uppercase tracking-[0.14em] font-semibold">Generated credentials (shown once)</p>
              </div>
              <div className="divide-y max-h-40 overflow-y-auto">
                {csvCredentials.map(c => (
                  <div key={c.email} className="flex items-center justify-between px-4 py-2">
                    <span className="text-[#1F1F1F]/40 text-xs truncate">{c.email}</span>
                    <span className="text-[#1F1F1F]/70 text-xs font-mono shrink-0 ml-3">{c.password}</span>
                  </div>
                ))}
              </div>
              <p className="px-4 py-2 text-center text-[#1F1F1F]/25 text-xs">
                Credentials have been emailed to all students.
              </p>
            </div>
          )}
        </motion.div>
      </div>

      {/* Approved students list */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.12 }}
        className="rounded-[24px] overflow-hidden"
        style={cardStyle}
      >
        <div className="px-6 py-4 flex items-center justify-between gap-4" style={{ borderBottom: "1px solid rgba(31,31,31,0.08)" }}>
          <p className="text-[#1F1F1F]/40 text-[9px] uppercase tracking-[0.18em] font-semibold">
            Approved students ({approved.length})
          </p>
          <div className="flex items-center gap-3">
            {removeError && <span className="text-red-400 text-xs">{removeError}</span>}
            <input
              value={accountSearch}
              onChange={e => setAccountSearch(e.target.value)}
              placeholder="Search…"
              className="bg-[#1F1F1F]/5 border border-[#1F1F1F]/10 rounded-[10px] px-3 py-1.5 text-[#1F1F1F] text-xs placeholder:text-[#1F1F1F]/25 outline-none focus:border-[#1F1F1F]/25 transition-colors"
              style={{ width: "180px" }}
            />
          </div>
        </div>

        {approvedLoading ? (
          <div className="flex justify-center py-8">
            <span className="w-5 h-5 border-2 border-[#1F1F1F]/20 border-t-[#1F1F1F]/60 rounded-full animate-spin" />
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
                  className="flex items-center gap-4 px-6 py-3 transition-colors"
                  style={{ borderBottom: "1px solid rgba(31,31,31,0.05)" }}
                  onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.background = "rgba(31,31,31,0.03)")}
                  onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.background = "transparent")}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: bg, color: text, fontSize: "0.7rem", fontWeight: 700 }}
                  >
                    {getInitials(s.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1F1F1F]/80 truncate">{s.full_name}</p>
                    <p className="text-xs text-[#1F1F1F]/30 truncate">{s.email}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold shrink-0"
                        style={{ background: bg, color: text }}>
                    {s.role}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${s.student_id ? "bg-green-500/15 text-green-400" : "bg-[#1F1F1F]/8 text-[#1F1F1F]/30"}`}>
                    {s.student_id ? "✓ Active" : "Pending"}
                  </span>
                  <button
                    onClick={() => handleRemove(s.email)}
                    disabled={removing === s.email}
                    className="p-1.5 rounded-full text-[#1F1F1F]/20 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40 shrink-0"
                  >
                    {removing === s.email
                      ? <span className="w-3.5 h-3.5 border border-red-400/30 border-t-red-400 rounded-full animate-spin block" />
                      : <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                    }
                  </button>
                </motion.div>
              );
            })}
            {filteredApproved.length === 0 && (
              <p className="text-center py-8 text-[#1F1F1F]/25 text-sm">
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
        className="rounded-[24px] p-6"
        style={cardStyle}
      >
        <p className="text-[#1F1F1F]/50 mb-4"
           style={{ fontSize: "0.68rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600 }}>
          · Promote to staff
        </p>
        <form onSubmit={handlePromote} className="flex items-end gap-3 flex-wrap">
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className={labelCls}>Staff email</label>
            <input
              type="email"
              value={promoteEmail}
              onChange={e => setPromoteEmail(e.target.value)}
              placeholder="staff@snec.com.sg"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Role</label>
            <select
              value={promoteRole}
              onChange={e => setPromoteRole(e.target.value)}
              className={`${inputCls} cursor-pointer w-auto`}
              style={{ background: "rgba(31,31,31,0.05)", colorScheme: "light" }}
            >
              <option value="supervisor">Supervisor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={promoting}
            className="px-5 py-2.5 rounded-full bg-[#1F1F1F] text-[#FDFDFC] text-sm font-semibold hover:bg-white transition-colors disabled:opacity-50"
          >
            {promoting ? "…" : "Promote"}
          </button>
        </form>
        {promoteMsg && (
          <p className="mt-3 text-green-400 text-xs">{promoteMsg}</p>
        )}
      </motion.div>
    </div>
  );
}
