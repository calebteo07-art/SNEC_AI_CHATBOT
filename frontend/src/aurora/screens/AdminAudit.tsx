"use client";
/* Console — audit trail. The durable security/privilege log (audit_events, migration
   014): who did what, to whom, from where, and when — logins & failures, password
   resets, privilege grants/revocations, and blocked prompt-injection attempts. Admin-
   only (the backend re-enforces require_admin). Category filter + search + paginate,
   client-side over the recent window the hook fetches.

   Re-skinned onto .cs — filter, search and pager arithmetic are byte-identical; the
   severity tones now name console hues instead of a second private colour scale. */
import { useState } from "react";
import { formatDayLabel, formatFeedTime } from "@/screens/adminShared";
import { useAudit, type AuditEvent } from "@/hooks/useAdmin";
import { DataTable } from "@/aurora/console/DataTable";
import { Badge, type Hue } from "@/aurora/console/Panel";
import { CsSkeleton, CsError } from "@/aurora/console/states";

const PAGE_SIZE = 25;

type Cat = "all" | "auth" | "security" | "privilege";

/* Human label + severity hue per action. Unknown actions fall back to the raw name and
   an unhued (neutral) badge — an unrecognised action must not borrow a severity. */
const ACTION_META: Record<string, { label: string; tone?: Hue }> = {
  login_success: { label: "Login", tone: "teal" },
  login_failed: { label: "Login failed", tone: "coral" },
  login_denied: { label: "Login denied", tone: "amber" },
  password_change: { label: "Password changed", tone: "blue" },
  reset_requested: { label: "Reset requested", tone: "blue" },
  reset_completed: { label: "Reset completed", tone: "blue" },
  reset_failed: { label: "Reset failed", tone: "coral" },
  approve_student: { label: "Student approved", tone: "teal" },
  create_staff: { label: "Staff created", tone: "purple" },
  promote: { label: "Promoted", tone: "purple" },
  demote: { label: "Demoted", tone: "amber" },
  unapprove_student: { label: "Student removed", tone: "amber" },
  input_blocked: { label: "Input blocked", tone: "coral" },
};
function actionMeta(a: string): { label: string; tone?: Hue } {
  return ACTION_META[a] ?? { label: a.replace(/_/g, " "), tone: undefined };
}

const CAT_ACTIONS: Record<Exclude<Cat, "all">, string[]> = {
  auth: ["login_success", "login_denied", "login_failed", "password_change",
    "reset_requested", "reset_completed", "reset_failed"],
  security: ["login_failed", "login_denied", "reset_failed", "input_blocked"],
  privilege: ["approve_student", "create_staff", "promote", "demote", "unapprove_student"],
};
const CAT_LABEL: Record<Cat, string> = {
  all: "All", auth: "Auth", security: "Security", privilege: "Privilege",
};

function whenLabel(ts: string): string {
  const day = formatDayLabel(ts);
  const time = formatFeedTime(ts);
  return time ? `${day} · ${time}` : day || "—";
}

export function AdminAudit() {
  const auditQ = useAudit();
  const [cat, setCat] = useState<Cat>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const events = auditQ.data ?? [];
  const filtered = events.filter((e: AuditEvent) => {
    if (cat !== "all" && !CAT_ACTIONS[cat].includes(e.action)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      e.actor?.toLowerCase().includes(q) ||
      e.target?.toLowerCase().includes(q) ||
      e.action?.toLowerCase().includes(q) ||
      e.detail?.toLowerCase().includes(q)
    );
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p className="cs-note" style={{ margin: 0, maxWidth: "68ch" }}>
        Durable security &amp; privilege trail — logins and failures, password resets,
        role grants/revocations, and blocked prompt-injection attempts. Newest first;
        refreshes on focus and every 30&nbsp;seconds.
      </p>

      <div className="cs-toolbar">
        <input
          className="cs-field"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder="Search actor, target, action or detail…"
          aria-label="Search audit events"
        />
        <div className="cs-chips">
          {(["all", "auth", "security", "privilege"] as Cat[]).map((c) => (
            <button
              key={c}
              type="button"
              className="cs-chip"
              data-active={cat === c}
              onClick={() => { setCat(c); setPage(0); }}
            >
              {CAT_LABEL[c]}
            </button>
          ))}
        </div>
      </div>

      {auditQ.isLoading ? (
        <CsSkeleton rows={8} />
      ) : auditQ.isError ? (
        <CsError onRetry={() => auditQ.refetch()} label="Couldn’t load the audit trail." />
      ) : (
        <DataTable<AuditEvent>
          testId="admin-audit"
          rows={paged}
          rowKey={(e, i) => e.audit_id ?? `${e.ts}-${i}`}
          /* Two distinct empties: "nothing has happened yet" and "your filter matched
             nothing" are different facts, and collapsing them hides a working log. */
          empty={events.length === 0
            ? "No audit events recorded yet — they appear here as logins, resets, and admin actions happen."
            : "No events match this filter."}
          columns={[
            { key: "when", head: "When", width: "150px", primary: true, cell: (e) => <span className="cs-num" style={{ color: "var(--cs-ink-2)" }}>{whenLabel(e.ts)}</span> },
            { key: "action", head: "Action", width: "148px", cell: (e) => { const m = actionMeta(e.action); return <Badge hue={m.tone}>{m.label}</Badge>; } },
            { key: "actor", head: "Actor", width: "1.5fr", cell: (e) => <span style={{ fontWeight: 560 }} title={e.actor}>{e.actor || "—"}</span> },
            { key: "target", head: "Target", width: "1.4fr", cell: (e) => <span style={{ color: "var(--cs-ink-3)" }} title={e.target}>{e.target || "—"}</span> },
            { key: "detail", head: "Detail", width: "1.7fr", cell: (e) => <span style={{ color: "var(--cs-ink-3)" }} title={e.detail}>{e.detail || "—"}</span> },
            { key: "ip", head: "IP", width: "118px", cell: (e) => <span className="cs-num" style={{ color: "var(--cs-ink-3)" }} title={e.ip ?? ""}>{e.ip || "—"}</span> },
          ]}
        />
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="cs-pager">
          <span>{safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}>← Prev</button>
            <span style={{ padding: "0 4px" }}>Page {safePage + 1} / {totalPages}</span>
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
