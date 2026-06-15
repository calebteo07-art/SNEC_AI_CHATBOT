"use client";
/* AURORA admin students — searchable, filterable, paginated roster. Row click
   opens the student-detail modal. Same endpoints as the legacy page. */
import { useEffect, useState } from "react";
import { useAdminOutlet, type StudentProfile, fmtTokens } from "@/screens/adminShared";

const PAGE_SIZE = 20;
const COLS = "2.2fr 2.4fr 84px 92px 78px 92px 112px";
type Filter = "all" | "OA" | "OT" | "PSA" | "at-risk";

function roleTone(role: string): "blue" | "purple" | "rose" | undefined {
  if (role === "OA") return "blue";
  if (role === "OT") return "purple";
  if (role === "PSA") return "rose";
  return undefined;
}

export function AdminStudents() {
  const { openDetail } = useAdminOutlet();
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [tokensByStudent, setTokensByStudent] = useState<Record<string, number>>({});
  const [atRisk, setAtRisk] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/students", { credentials: "include" }).then((r) => r.json()).catch(() => ({ students: [] })),
      fetch("/api/admin/token-summary", { credentials: "include" }).then((r) => r.json()).catch(() => ({ by_student: [] })),
      fetch("/api/supervisor/at-risk", { credentials: "include" }).then((r) => r.json()).catch(() => ({})),
    ]).then(([sd, td, rd]) => {
      setStudents(sd.students ?? []);
      const map: Record<string, number> = {};
      for (const item of (td.by_student ?? [])) map[item.student_id] = item.tokens;
      setTokensByStudent(map);
      const risk = (rd?.students ?? rd?.at_risk ?? []) as { student_id: string }[];
      setAtRisk(risk.map((r) => r.student_id));
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { setPage(0); }, [search, filter]);

  const filtered = students.filter((s) => {
    const q = search.toLowerCase();
    if (q && !s.full_name.toLowerCase().includes(q) && !s.email.toLowerCase().includes(q)) return false;
    if (filter === "at-risk") return atRisk.includes(s.student_id);
    if (filter !== "all") return s.role === filter;
    return true;
  });
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="aurora-toolbar">
        <input className="aurora-field" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email…" />
        <div className="aurora-chips">
          {(["all", "OA", "OT", "PSA", "at-risk"] as Filter[]).map((f) => (
            <button key={f} type="button" className={`aurora-chip${filter === f ? " aurora-flow" : ""}`} data-active={filter === f} onClick={() => setFilter(f)}>
              <span>{f === "all" ? "All" : f === "at-risk" ? "At risk" : f}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="aurora-muted">Loading roster…</p>
      ) : (
        <div className="aurora-table-wrap" data-testid="admin-student-table">
          <div className="aurora-trow aurora-thead" style={{ gridTemplateColumns: COLS }}>
            <span>Name</span><span>Email</span><span>Role</span><span>Sessions</span><span>Streak</span><span>Tokens</span><span>Last active</span>
          </div>
          {paged.map((s) => (
            <div key={s.student_id} className="aurora-trow is-clickable" style={{ gridTemplateColumns: COLS }} onClick={() => openDetail(s.student_id)}>
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
          <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
          <div className="aurora-pager-btns">
            <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>← Prev</button>
            <span style={{ padding: "0 4px" }}>Page {page + 1} / {totalPages}</span>
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
