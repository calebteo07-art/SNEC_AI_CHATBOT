"use client";
/* Admin — audit trail. The durable security/privilege log (audit_events, migration
   014): who did what, to whom, from where, and when — logins & failures, password
   resets, privilege grants/revocations, and blocked prompt-injection attempts. Admin-
   only (the backend re-enforces require_admin). Category filter + search + paginate,
   client-side over the recent window the hook fetches. Mirrors the AdminRoster table. */
import { useState } from "react";
import { formatDayLabel, formatFeedTime } from "@/screens/adminShared";
import { useAudit, type AuditEvent } from "@/hooks/useAdmin";

const PAGE_SIZE = 25;
const COLS = "150px 148px 1.5fr 1.4fr 1.7fr 118px";

type Tone = "blue" | "purple" | "rose" | "green" | "amber";
type Cat = "all" | "auth" | "security" | "privilege";

/* Human label + severity tone per action. Unknown actions fall back to the raw name. */
const ACTION_META: Record<string, { label: string; tone?: Tone }> = {
  login_success: { label: "Login", tone: "green" },
  login_failed: { label: "Login failed", tone: "rose" },
  login_denied: { label: "Login denied", tone: "amber" },
  password_change: { label: "Password changed", tone: "blue" },
  reset_requested: { label: "Reset requested", tone: "blue" },
  reset_completed: { label: "Reset completed", tone: "blue" },
  reset_failed: { label: "Reset failed", tone: "rose" },
  approve_student: { label: "Student approved", tone: "green" },
  create_staff: { label: "Staff created", tone: "purple" },
  promote: { label: "Promoted", tone: "purple" },
  demote: { label: "Demoted", tone: "amber" },
  unapprove_student: { label: "Student removed", tone: "amber" },
  input_blocked: { label: "Input blocked", tone: "rose" },
};
function actionMeta(a: string): { label: string; tone?: Tone } {
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p className="aurora-unavail" style={{ marginTop: -2 }}>
        Durable security &amp; privilege trail — logins and failures, password resets,
        role grants/revocations, and blocked prompt-injection attempts. Newest first;
        refreshes on focus and every 30&nbsp;seconds.
      </p>

      <div className="aurora-toolbar">
        <input
          className="aurora-field"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder="Search actor, target, action or detail…"
        />
        <div className="aurora-chips">
          {(["all", "auth", "security", "privilege"] as Cat[]).map((c) => (
            <button
              key={c}
              type="button"
              className={`aurora-chip${cat === c ? " aurora-flow" : ""}`}
              data-active={cat === c}
              onClick={() => { setCat(c); setPage(0); }}
            >
              <span>{CAT_LABEL[c]}</span>
            </button>
          ))}
        </div>
      </div>

      {auditQ.isLoading ? (
        <p className="aurora-unavail">Loading audit trail…</p>
      ) : (
        <div className="aurora-table-wrap" data-testid="admin-audit">
          <div className="aurora-trow aurora-thead" style={{ gridTemplateColumns: COLS }}>
            <span>When</span><span>Action</span><span>Actor</span><span>Target</span><span>Detail</span><span>IP</span>
          </div>
          {paged.map((e, i) => {
            const m = actionMeta(e.action);
            return (
              <div key={e.audit_id ?? `${e.ts}-${i}`} className="aurora-trow" style={{ gridTemplateColumns: COLS }}>
                <span className="aurora-tcell is-mono is-muted">{whenLabel(e.ts)}</span>
                <span><span className="aurora-badge" data-tone={m.tone}>{m.label}</span></span>
                <span className="aurora-tcell" style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }} title={e.actor}>{e.actor || "—"}</span>
                <span className="aurora-tcell is-muted" style={{ overflow: "hidden", textOverflow: "ellipsis" }} title={e.target}>{e.target || "—"}</span>
                <span className="aurora-tcell is-muted" style={{ overflow: "hidden", textOverflow: "ellipsis" }} title={e.detail}>{e.detail || "—"}</span>
                <span className="aurora-tcell is-mono is-muted" title={e.ip ?? ""}>{e.ip || "—"}</span>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="aurora-tempty">
              {events.length === 0
                ? "No audit events recorded yet — they appear here as logins, resets, and admin actions happen."
                : "No events match this filter."}
            </p>
          )}
        </div>
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="aurora-pager">
          <span>{safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
          <div className="aurora-pager-btns">
            <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}>← Prev</button>
            <span style={{ padding: "0 4px" }}>Page {safePage + 1} / {totalPages}</span>
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
