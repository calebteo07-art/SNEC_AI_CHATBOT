"use client";
/* Console — accounts (ADMIN ONLY). Add one account (role: OA/OT/PSA/Trainer/
   Admin), bulk-import a student CSV, remove an approved account, or promote an
   existing email to Trainer/Admin. Same endpoints as the retired AdminAccounts;
   staff roles (Trainer/Admin) are handled by the widened POST /api/admin/approved
   + /api/admin/promote. The parent gates render on role === "admin"; the backend
   also enforces require_admin on every write here.

   Re-skinned onto .cs. Every handler below — including the one-time password path and
   the optimistic removal — is byte-identical to the .aurora-admin version. This screen
   mints credentials and revokes access; a behavioural edit here is out of scope. */
import { useState, useRef, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { type ApprovedStudent, type Credential, getInitials } from "@/screens/adminShared";
import { useApproved } from "@/hooks/useAdmin";
import { DataTable } from "@/aurora/console/DataTable";
import { Badge, Panel, type Hue } from "@/aurora/console/Panel";
import { CsSkeleton, CsError } from "@/aurora/console/states";

function roleHue(role: string): Hue | undefined {
  if (role === "OA") return "blue";
  if (role === "OT") return "purple";
  if (role === "PSA") return "coral";
  return undefined;
}

export function AdminProvisioning() {
  const qc = useQueryClient();
  const { data: approved = [], isLoading: approvedLoading, isError: approvedFailed, refetch: refetchApproved } = useApproved();
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
  const [confirmRemove, setConfirmRemove] = useState<ApprovedStudent | null>(null);

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

  const err = { color: "var(--cs-coral)", fontWeight: 600 } as const;
  const ok = { color: "var(--cs-teal)", fontWeight: 600 } as const;

  return (
    <div data-testid="cs-accounts" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel hue="teal" title="Provision accounts">
        <div className="cs-seg" role="tablist" aria-label="Provisioning mode" style={{ width: "fit-content", marginBottom: 14 }}>
          <button type="button" role="tab" aria-selected={provMode === "one"} data-active={provMode === "one"} onClick={() => setProvMode("one")}>One account</button>
          <button type="button" role="tab" aria-selected={provMode === "csv"} data-active={provMode === "csv"} onClick={() => setProvMode("csv")}>Import CSV</button>
        </div>

        {provMode === "one" ? (
          <>
            <form onSubmit={handleAdd}>
              <div style={{ display: "grid", gap: 11, gridTemplateColumns: "repeat(auto-fit, minmax(185px, 1fr))" }}>
                <div style={{ minWidth: 0 }}>
                  <label className="cs-label" htmlFor="cs-new-name">Full name</label>
                  <input id="cs-new-name" className="cs-field" style={{ width: "100%", minWidth: 0 }} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Jane Doe" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label className="cs-label" htmlFor="cs-new-email">Email</label>
                  <input id="cs-new-email" className="cs-field" style={{ width: "100%", minWidth: 0 }} type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="jane@snec.com.sg" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label className="cs-label" htmlFor="cs-new-role">Role</label>
                  <select id="cs-new-role" className="cs-field" style={{ width: "100%", minWidth: 0 }} value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                    <option value="">Select role…</option>
                    <option value="OA">Ophthalmic Assistant (OA)</option>
                    <option value="OT">Ophthalmic Technician (OT)</option>
                    <option value="PSA">Patient Service Associate (PSA)</option>
                    <option value="trainer">Trainer (staff)</option>
                    <option value="admin">Admin (staff)</option>
                  </select>
                </div>
              </div>
              {addError && <p className="cs-note" style={{ ...err, margin: "11px 0 0" }}>{addError}</p>}
              <button type="submit" className="cs-btn" style={{ marginTop: 12 }} disabled={adding}>{adding ? "Adding…" : "Add account"}</button>
            </form>
            <p className="cs-note" style={{ margin: "12px 0 0", maxWidth: "72ch" }}>
              Student roles (OA · OT · PSA) get a learner account. Trainer / Admin get staff access — Trainer sees the dashboard; Admin also provisions accounts here.
            </p>
            {addedCredential && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                {addedCredential.emailSent ? (
                  <p className="cs-note" style={{ ...ok, margin: 0 }}>Account added. Login details emailed to {addedCredential.email}.</p>
                ) : (
                  <p className="cs-note" style={{ ...err, margin: 0 }}>
                    Account added, but the email didn’t send{addedCredential.emailError ? ` — ${addedCredential.emailError}` : ""}. Give them the temporary password below (they’ll be asked to change it).
                  </p>
                )}
                {addedCredential.password && (
                  <p className="cs-note" style={{ margin: 0 }}>
                    Temporary password (shown once):{" "}
                    <span className="cs-num" style={{ fontWeight: 700, color: "var(--cs-ink)" }}>{addedCredential.password}</span>
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div
              className="cs-drop"
              role="button" tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleCsvFile(f); }}
            >
              <div style={{ fontSize: 26, color: "var(--cs-ink-3)", lineHeight: 1 }}>⬚</div>
              <p style={{ fontSize: 13, fontWeight: 640, margin: "8px 0 3px" }}>Drop CSV here or click to browse</p>
              <p className="cs-note" style={{ margin: 0 }}>Columns: full_name · email · role (OA / OT / PSA)</p>
              <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); }} />
            </div>
            {csvPreview && <p className="cs-note" style={{ ...ok, margin: "10px 0 0" }}>{csvPreview.count} students ready to import</p>}
            {csvFile && <button type="button" className="cs-btn" style={{ width: "100%", marginTop: 10 }} onClick={handleCsvImport} disabled={csvUploading}>{csvUploading ? "Importing…" : `Import ${csvPreview?.count ?? ""} students`}</button>}
            {csvImportSummary && (
              <div style={{ marginTop: 10 }}>
                <p className="cs-note" style={{ ...ok, margin: 0 }}>Imported: {csvImportSummary.imported}</p>
                {csvImportSummary.skipped > 0 && <p className="cs-note" style={{ margin: "4px 0 0" }}>Skipped: {csvImportSummary.skipped}</p>}
                {csvErrors.map((er, i) => <p key={i} className="cs-note" style={{ ...err, margin: "4px 0 0" }}>Row {er.row}: {er.reason}</p>)}
              </div>
            )}
            {csvCredentials.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <DataTable<Credential>
                  rows={csvCredentials}
                  rowKey={(c) => c.email}
                  empty=""
                  columns={[
                    { key: "email", head: "Email", width: "1fr", primary: true, cell: (c) => c.email },
                    { key: "pw", head: "Password (shown once)", width: "1fr", cell: (c) => <span className="cs-num" style={{ fontWeight: 700 }}>{c.password}</span> },
                  ]}
                />
              </div>
            )}
          </>
        )}
      </Panel>

      <Panel hue="blue" title={`Approved accounts (${approved.length})`}>
        <div className="cs-toolbar" style={{ marginBottom: 11 }}>
          <input
            className="cs-field"
            value={accountSearch}
            onChange={(e) => setAccountSearch(e.target.value)}
            placeholder="Search name or email…"
            aria-label="Search approved accounts"
          />
          {removeError && <span className="cs-note" style={{ ...err, margin: 0 }}>{removeError}</span>}
        </div>
        {approvedLoading ? (
          <CsSkeleton rows={4} />
        ) : approvedFailed ? (
          <CsError onRetry={() => refetchApproved()} label="Couldn’t load approved accounts." />
        ) : (
          <DataTable<ApprovedStudent>
            rows={filteredApproved}
            rowKey={(s) => s.email}
            empty={accountSearch ? "No accounts match your search." : "No approved accounts yet."}
            columns={[
              {
                key: "name", head: "Name", width: "2fr", primary: true,
                cell: (s) => (
                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span className="cs-ava">{getInitials(s.full_name)}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{s.full_name}</span>
                  </span>
                ),
              },
              { key: "email", head: "Email", width: "2.2fr", cell: (s) => <span style={{ color: "var(--cs-ink-3)" }} title={s.email}>{s.email}</span> },
              { key: "role", head: "Role", width: "84px", cell: (s) => <Badge hue={roleHue(s.role)}>{s.role}</Badge> },
              { key: "status", head: "Status", width: "92px", cell: (s) => <Badge hue={s.student_id ? "teal" : "amber"}>{s.student_id ? "Active" : "Pending"}</Badge> },
              {
                key: "remove", head: "Access", width: "108px",
                cell: (s) => (
                  <button
                    type="button" className="cs-btn-ghost"
                    style={{ padding: "0 12px", fontSize: 12, color: "var(--cs-coral)" }}
                    onClick={() => setConfirmRemove(s)}
                    disabled={removing === s.email}
                    aria-label={`Remove ${s.full_name}`}
                  >
                    Remove
                  </button>
                ),
              },
            ]}
          />
        )}
      </Panel>

      <details className="cs-disc">
        <summary>
          <span>Promote existing email</span>
          <span className="cs-disc-sub">staff access</span>
          <svg className="cs-disc-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
        </summary>
        <div className="cs-disc-body">
          <p className="cs-note" style={{ margin: "0 0 12px", maxWidth: "72ch" }}>
            Grant an existing account Trainer or Admin access. Trainer sees the dashboard; Admin also provisions accounts.
          </p>
          <form onSubmit={handlePromote} style={{ display: "flex", alignItems: "flex-end", gap: 11, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 190 }}>
              <label className="cs-label" htmlFor="cs-promote-email">Email</label>
              <input id="cs-promote-email" className="cs-field" style={{ width: "100%", minWidth: 0 }} type="email" value={promoteEmail} onChange={(e) => setPromoteEmail(e.target.value)} placeholder="staff@snec.com.sg" />
            </div>
            <div>
              <label className="cs-label" htmlFor="cs-promote-role">Role</label>
              <select id="cs-promote-role" className="cs-field" style={{ flex: "none", minWidth: 130 }} value={promoteRole} onChange={(e) => setPromoteRole(e.target.value)}>
                <option value="trainer">Trainer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button type="submit" className="cs-btn" disabled={promoting}>{promoting ? "…" : "Promote"}</button>
          </form>
          {promoteMsg && <p className="cs-note" style={{ ...ok, margin: "10px 0 0" }}>{promoteMsg}</p>}
        </div>
      </details>

      {confirmRemove && (
        <div className="cs-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmRemove(null); }}>
          <div className="cs-modal" role="alertdialog" aria-modal="true" aria-label="Confirm account removal" style={{ maxWidth: 460, gap: 10 }}>
            <p className="cs-eyebrow" style={{ margin: 0, color: "var(--cs-coral)" }}>Remove access</p>
            <p style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-.015em", margin: 0 }}>{confirmRemove.full_name}</p>
            <p className="cs-note" style={{ margin: 0, fontSize: 12.5 }}>
              This revokes access for <strong style={{ color: "var(--cs-ink)" }}>{confirmRemove.email}</strong>. They will no longer be
              able to sign in, and they disappear from the roster and all cohort figures.
              This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
              <button
                type="button"
                className="cs-btn"
                disabled={removing === confirmRemove.email}
                onClick={() => { const email = confirmRemove.email; setConfirmRemove(null); handleRemove(email); }}
              >
                {removing === confirmRemove.email ? "Removing…" : "Remove access"}
              </button>
              <button type="button" className="cs-btn-ghost" onClick={() => setConfirmRemove(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
