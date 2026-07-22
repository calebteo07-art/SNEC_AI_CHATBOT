"use client";
/* Admin — provisioning (ADMIN ONLY). Add one account (role: OA/OT/PSA/Trainer/
   Admin), bulk-import a student CSV, remove an approved account, or promote an
   existing email to Trainer/Admin. Same endpoints as the retired AdminAccounts;
   staff roles (Trainer/Admin) are handled by the widened POST /api/admin/approved
   + /api/admin/promote. The parent gates render on role === "admin"; the backend
   also enforces require_admin on every write here. */
import { useState, useRef, type FormEvent, type CSSProperties } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { type ApprovedStudent, type Credential, getInitials } from "@/screens/adminShared";
import { useApproved } from "@/hooks/useAdmin";
import { Icon } from "@/aurora/icons";

function roleTone(role: string): "blue" | "purple" | "rose" | undefined {
  if (role === "OA") return "blue";
  if (role === "OT") return "purple";
  if (role === "PSA") return "rose";
  return undefined;
}

export function AdminProvisioning() {
  const qc = useQueryClient();
  const { data: approved = [], isLoading: approvedLoading } = useApproved();
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  const [addedCredential, setAddedCredential] = useState<{ email: string; password: string; emailSent: boolean; emailError: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [promoteEmail, setPromoteEmail] = useState("");
  const [promoteRole, setPromoteRole] = useState("trainer");
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
  const [provMode, setProvMode] = useState<"one" | "csv">("one");

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setAddError("");
    if (!newEmail.trim() || !newName.trim() || !newRole) { setAddError("All fields are required."); return; }
    setAdding(true);
    try {
      const res = await fetch("/api/admin/approved", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ email: newEmail.trim().toLowerCase(), full_name: newName.trim(), role: newRole }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setAddError((d as { detail?: string }).detail ?? "Failed to add account."); setAdding(false); return; }
      const data = await res.json().catch(() => ({})) as { email_sent?: boolean; email_error?: string; password?: string };
      setAddedCredential({
        email: newEmail.trim().toLowerCase(),
        password: data.password ?? "",
        emailSent: !!data.email_sent,
        emailError: data.email_error ?? "",
      });
      setNewEmail(""); setNewName(""); setNewRole("");
      // Refetch the account list + roster/cohort/staff so the new account shows at once
      // (and a staff role lands in the Staff section, not the students list).
      qc.invalidateQueries({ queryKey: ["admin"] });
    } catch { setAddError("Network error."); }
    setAdding(false);
  };

  const handleRemove = async (email: string) => {
    setRemoving(email); setRemoveError("");
    try {
      const res = await fetch(`/api/admin/approved/${encodeURIComponent(email)}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { setRemoveError("Failed to remove."); setRemoving(null); return; }
      // Instant disappearance (optimistic), then reconcile the whole board with the
      // server so the removed student is gone from roster/cohort/staff too.
      qc.setQueryData<ApprovedStudent[]>(["admin", "approved"], (old) => (old ?? []).filter((s) => s.email !== email));
      qc.invalidateQueries({ queryKey: ["admin"] });
    } catch { setRemoveError("Network error."); }
    setRemoving(null);
  };

  const handlePromote = async (e: FormEvent) => {
    e.preventDefault();
    setPromoting(true); setPromoteMsg("");
    try {
      const res = await fetch("/api/admin/promote", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ email: promoteEmail.trim().toLowerCase(), new_role: promoteRole }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setPromoteMsg((d as { detail?: string }).detail ?? "Failed."); }
      else { setPromoteMsg("Done."); setPromoteEmail(""); qc.invalidateQueries({ queryKey: ["admin"] }); }
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
      const res = await fetch("/api/admin/upload-csv", { method: "POST", credentials: "include", body: form });
      const data = await res.json();
      setCsvImportSummary({ imported: data.imported, skipped: data.skipped });
      setCsvErrors(data.errors ?? []);
      setCsvCredentials(data.credentials ?? []);
      setCsvFile(null); setCsvPreview(null);
      // Imported students must show in the account list + roster without a reload.
      qc.invalidateQueries({ queryKey: ["admin"] });
    } catch {
      setCsvImportSummary({ imported: 0, skipped: 0 });
      setCsvErrors([{ row: 0, reason: "Network error — import failed." }]);
    }
    setCsvUploading(false);
  };

  const filteredApproved = approved.filter((s) => {
    if (!accountSearch) return true;
    const q = accountSearch.toLowerCase();
    return s.full_name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section className="aurora-panel console-card-accent" style={{ "--accent": "var(--g-green)" } as CSSProperties}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <p className="aurora-activity-head" style={{ margin: 0 }}>Provision accounts</p>
          <div className="console-segment" role="tablist" aria-label="Provisioning mode">
            <button type="button" role="tab" aria-selected={provMode === "one"} data-active={provMode === "one"} onClick={() => setProvMode("one")}>One account</button>
            <button type="button" role="tab" aria-selected={provMode === "csv"} data-active={provMode === "csv"} onClick={() => setProvMode("csv")}>Import CSV</button>
          </div>
        </div>

        {provMode === "one" ? (
          <>
            <form onSubmit={handleAdd} className="aurora-form-row">
              <div>
                <label className="aurora-form-label">Full name</label>
                <input className="aurora-field" style={{ width: "100%" }} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Jane Doe" />
              </div>
              <div>
                <label className="aurora-form-label">Email</label>
                <input className="aurora-field" style={{ width: "100%" }} type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="jane@snec.com.sg" />
              </div>
              <div>
                <label className="aurora-form-label">Role</label>
                <select className="aurora-select" style={{ width: "100%" }} value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                  <option value="">Select role…</option>
                  <option value="OA">Ophthalmic Assistant (OA)</option>
                  <option value="OT">Ophthalmic Technician (OT)</option>
                  <option value="PSA">Patient Service Associate (PSA)</option>
                  <option value="trainer">Trainer (staff)</option>
                  <option value="admin">Admin (staff)</option>
                </select>
              </div>
              {addError && <p className="aurora-note is-err">{addError}</p>}
              <button type="submit" className="aurora-btn" disabled={adding}>{adding ? "Adding…" : "Add account"}</button>
            </form>
            <p className="aurora-unavail" style={{ marginTop: 8 }}>
              Student roles (OA · OT · PSA) get a learner account. Trainer / Admin get staff access — Trainer sees the dashboard; Admin also provisions accounts here.
            </p>
            {addedCredential && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                {addedCredential.emailSent ? (
                  <p className="aurora-note is-ok">Account added. Login details emailed to {addedCredential.email}.</p>
                ) : (
                  <p className="aurora-note is-err">
                    Account added, but the email didn’t send{addedCredential.emailError ? ` — ${addedCredential.emailError}` : ""}. Give them the temporary password below (they’ll be asked to change it).
                  </p>
                )}
                {addedCredential.password && (
                  <p className="aurora-note">
                    Temporary password (shown once):{" "}
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{addedCredential.password}</span>
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div
              className="aurora-dropzone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleCsvFile(f); }}
            >
              <div style={{ fontSize: "1.6rem" }}>⬚</div>
              <p className="aurora-dropzone-title">Drop CSV here or click to browse</p>
              <p className="aurora-dropzone-sub">Columns: full_name · email · role (OA / OT / PSA)</p>
              <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); }} />
            </div>
            {csvPreview && <p className="aurora-note is-ok" style={{ marginTop: 8 }}>{csvPreview.count} students ready to import</p>}
            {csvFile && <button type="button" className="aurora-btn" style={{ width: "100%", marginTop: 10 }} onClick={handleCsvImport} disabled={csvUploading}>{csvUploading ? "Importing…" : `Import ${csvPreview?.count ?? ""} students`}</button>}
            {csvImportSummary && (
              <div style={{ marginTop: 10 }}>
                <p className="aurora-note is-ok">Imported: {csvImportSummary.imported}</p>
                {csvImportSummary.skipped > 0 && <p className="aurora-note">Skipped: {csvImportSummary.skipped}</p>}
                {csvErrors.map((er, i) => <p key={i} className="aurora-note is-err">Row {er.row}: {er.reason}</p>)}
              </div>
            )}
            {csvCredentials.length > 0 && (
              <div className="aurora-table-wrap" style={{ marginTop: 12 }}>
                <div className="aurora-trow aurora-thead" style={{ gridTemplateColumns: "1fr 1fr" }}><span>Email</span><span>Password (shown once)</span></div>
                {csvCredentials.map((c) => (
                  <div key={c.email} className="aurora-trow" style={{ gridTemplateColumns: "1fr 1fr" }}>
                    <span className="aurora-tcell is-muted">{c.email}</span>
                    <span className="aurora-tcell is-mono">{c.password}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section className="aurora-panel" style={{ padding: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 16px", borderBottom: "1px solid var(--hairline)" }}>
          <p className="aurora-activity-head" style={{ margin: 0 }}>Approved accounts ({approved.length})</p>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {removeError && <span className="aurora-note is-err">{removeError}</span>}
            <input className="aurora-field" style={{ width: 180, minWidth: 0, flex: "none" }} value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} placeholder="Search…" />
          </div>
        </div>
        {approvedLoading ? (
          <p className="aurora-tempty">Loading…</p>
        ) : filteredApproved.length === 0 ? (
          <p className="aurora-tempty">{accountSearch ? "No accounts match your search." : "No approved accounts yet."}</p>
        ) : (
          filteredApproved.map((s) => (
            <div key={s.email} className="aurora-acct-row">
              <span className="aurora-avatar" style={{ width: 30, height: 30 }}>{getInitials(s.full_name)}</span>
              <div className="aurora-acct-meta">
                <div className="aurora-acct-name">{s.full_name}</div>
                <div className="aurora-acct-email">{s.email}</div>
              </div>
              <span className="aurora-badge" data-tone={roleTone(s.role)}>{s.role}</span>
              <span className="aurora-badge" data-tone={s.student_id ? "green" : "amber"}>{s.student_id ? "Active" : "Pending"}</span>
              <button type="button" className="aurora-acct-remove" onClick={() => handleRemove(s.email)} disabled={removing === s.email} aria-label={`Remove ${s.full_name}`}>
                <Icon.close size={14} />
              </button>
            </div>
          ))
        )}
      </section>

      <details className="console-disclosure">
        <summary>
          <span>Promote existing email<span className="console-disc-sub" style={{ marginLeft: 8 }}>staff access</span></span>
          <svg className="console-disc-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
        </summary>
        <div className="console-disclosure-body">
          <p className="aurora-unavail" style={{ margin: "8px 0 12px" }}>
            Grant an existing account Trainer or Admin access. Trainer sees the dashboard; Admin also provisions accounts.
          </p>
          <form onSubmit={handlePromote} style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label className="aurora-form-label">Email</label>
              <input className="aurora-field" style={{ width: "100%" }} type="email" value={promoteEmail} onChange={(e) => setPromoteEmail(e.target.value)} placeholder="staff@snec.com.sg" />
            </div>
            <div>
              <label className="aurora-form-label">Role</label>
              <select className="aurora-select" value={promoteRole} onChange={(e) => setPromoteRole(e.target.value)}>
                <option value="trainer">Trainer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button type="submit" className="aurora-btn" disabled={promoting}>{promoting ? "…" : "Promote"}</button>
          </form>
          {promoteMsg && <p className="aurora-note is-ok" style={{ marginTop: 10 }}>{promoteMsg}</p>}
        </div>
      </details>
    </div>
  );
}
