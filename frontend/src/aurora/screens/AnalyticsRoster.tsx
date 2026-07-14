"use client";
/* Analytics — roster. The cohort table: search + role/at-risk filter + paginate
   (the AdminStudents controls, now hook-driven so it refreshes in real time).
   A row click opens the reused AdminStudentDetail drill-down. */
import { useState } from "react";
import { fmtTokens } from "@/screens/adminShared";
import { AdminStudentDetail } from "@/aurora/screens/AdminStudentDetail";
import { useRoster, useAtRisk, useTokenSummary } from "@/hooks/useAnalytics";

const PAGE_SIZE = 20;
const COLS = "2.2fr 2.4fr 84px 92px 78px 92px 112px";
type Filter = "all" | "OA" | "OT" | "PSA" | "at-risk";

function roleTone(role: string): "blue" | "purple" | "rose" | undefined {
  if (role === "OA") return "blue";
  if (role === "OT") return "purple";
  if (role === "PSA") return "rose";
  return undefined;
}

export function AnalyticsRoster() {
  const roster = useRoster();
  const atRiskQ = useAtRisk();
  const tokensQ = useTokenSummary();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  const students = roster.data ?? [];
  const atRisk = (atRiskQ.data ?? []).map((r) => r.student_id);
  const tokensByStudent: Record<string, number> = {};
  for (const t of tokensQ.data?.by_student ?? []) tokensByStudent[t.student_id] = t.tokens;

  const filtered = students.filter((s) => {
    const q = search.toLowerCase();
    if (q && !s.full_name.toLowerCase().includes(q) && !s.email.toLowerCase().includes(q)) return false;
    if (filter === "at-risk") return atRisk.includes(s.student_id);
    if (filter !== "all") return s.role === filter;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="aurora-toolbar">
        <input className="aurora-field" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search name or email…" />
        <div className="aurora-chips">
          {(["all", "OA", "OT", "PSA", "at-risk"] as Filter[]).map((f) => (
            <button key={f} type="button" className={`aurora-chip${filter === f ? " aurora-flow" : ""}`} data-active={filter === f} onClick={() => { setFilter(f); setPage(0); }}>
              <span>{f === "all" ? "All" : f === "at-risk" ? "At risk" : f}</span>
            </button>
          ))}
        </div>
      </div>

      {roster.isLoading ? (
        <p className="aurora-unavail">Loading roster…</p>
      ) : (
        <div className="aurora-table-wrap" data-testid="analytics-roster">
          <div className="aurora-trow aurora-thead" style={{ gridTemplateColumns: COLS }}>
            <span>Name</span><span>Email</span><span>Role</span><span>Sessions</span><span>Streak</span><span>Tokens</span><span>Last active</span>
          </div>
          {paged.map((s) => (
            <div key={s.student_id} className="aurora-trow is-clickable" style={{ gridTemplateColumns: COLS }} onClick={() => setOpenId(s.student_id)}>
              <span className="aurora-tcell" style={{ fontWeight: 500, display: "flex", alignItems: "center", gap: 7 }}>
                {atRisk.includes(s.student_id) && <span className="console-risk-dot" title="At risk" aria-label="At risk" />}
                {s.full_name}
              </span>
              <span className="aurora-tcell is-muted">{s.email}</span>
              <span><span className="aurora-badge" data-tone={roleTone(s.role)}>{s.role}</span></span>
              <span className="aurora-tcell is-mono">{s.session_count}</span>
              <span className="aurora-tcell is-mono">{s.streak}</span>
              <span className="aurora-tcell is-accent">{fmtTokens(tokensByStudent[s.student_id] ?? 0)}</span>
              <span className="aurora-tcell is-mono">{s.last_active?.slice(0, 10) || "—"}</span>
            </div>
          ))}
          {filtered.length === 0 && <p className="aurora-tempty">No students found.</p>}
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

      {openId && <AdminStudentDetail studentId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
