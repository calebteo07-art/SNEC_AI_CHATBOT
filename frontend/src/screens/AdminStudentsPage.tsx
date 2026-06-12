import { useEffect, useState } from "react";
import { useAdminOutlet, StudentProfile, AtRiskItem, RoleBadge, fmtTokens } from "./adminShared";

const API = "";
const PAGE_SIZE = 20;

export function AdminStudentsPage() {
  const { openDetail } = useAdminOutlet();

  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [tokensByStudent, setTokensByStudent] = useState<Record<string, number>>({});
  const [atRisk, setAtRisk] = useState<AtRiskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "OA" | "OT" | "PSA" | "at-risk">("all");
  const [page, setPage] = useState(0);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/admin/students`, { credentials: "include" }).then(r => r.json()).catch(() => ({ students: [] })),
      fetch(`${API}/api/admin/token-summary`, { credentials: "include" }).then(r => r.json()).catch(() => ({ by_student: [] })),
      fetch(`${API}/api/supervisor/at-risk`, { credentials: "include" }).then(r => r.json()).catch(() => ({ at_risk: [] })),
    ]).then(([sd, td, rd]) => {
      setStudents(sd.students ?? []);
      const map: Record<string, number> = {};
      for (const item of (td.by_student ?? [])) map[item.student_id] = item.tokens;
      setTokensByStudent(map);
      setAtRisk(rd?.at_risk ?? []);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { setPage(0); }, [search, filter]);

  const filtered = students.filter(s => {
    const q = search.toLowerCase();
    if (q && !s.full_name.toLowerCase().includes(q) && !s.email.toLowerCase().includes(q)) return false;
    if (filter === "at-risk") return atRisk.some(r => r.student_id === s.student_id);
    if (filter !== "all") return s.role === filter;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const inputCls = "flex-1 min-w-[200px] bg-[#F4EFE7]/5 border border-[#F4EFE7]/10 rounded-[12px] px-3 py-2.5 text-[#F4EFE7] text-sm placeholder:text-[#F4EFE7]/25 outline-none focus:border-[#F4EFE7]/25 transition-colors";

  const COLS = "2fr 2fr 1fr 1fr 1fr 1fr 1fr";

  return (
    <div>
      {/* Toolbar */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <input
          className={inputCls}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name or email…"
        />
        <div className="flex gap-1 flex-wrap">
          {(["all", "OA", "OT", "PSA", "at-risk"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={{
                background: filter === f ? "#F4EFE7" : "rgba(244,239,231,0.08)",
                color: filter === f ? "#181717" : "rgba(244,239,231,0.5)",
              }}
            >
              {f === "all" ? "All" : f === "at-risk" ? "At Risk" : f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <span className="w-6 h-6 border-2 border-[#F4EFE7]/20 border-t-[#F4EFE7]/60 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="rounded-[20px] overflow-hidden" style={{ border: "1px solid rgba(244,239,231,0.08)" }}>
          {/* Header */}
          <div
            className="grid text-[9px] uppercase tracking-[0.14em] font-semibold text-[#F4EFE7]/30 px-4 py-2.5"
            style={{ gridTemplateColumns: COLS, borderBottom: "1px solid rgba(244,239,231,0.08)" }}
          >
            <span>Name</span>
            <span>Email</span>
            <span>Role</span>
            <span>Sessions</span>
            <span>Streak</span>
            <span>Tokens</span>
            <span>Last Active</span>
          </div>

          {/* Rows */}
          {paged.map(s => (
            <div
              key={s.student_id}
              onClick={() => openDetail(s.student_id)}
              className="grid items-center px-4 py-3 transition-colors cursor-pointer"
              style={{
                gridTemplateColumns: COLS,
                borderBottom: "1px solid rgba(244,239,231,0.05)",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(244,239,231,0.04)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span className="text-[#F4EFE7]/80 text-sm font-medium truncate pr-2">{s.full_name}</span>
              <span className="text-[#F4EFE7]/35 text-xs truncate pr-2">{s.email}</span>
              <span><RoleBadge role={s.role} /></span>
              <span className="text-[#F4EFE7]/50 text-xs font-mono">{s.session_count}</span>
              <span className="text-[#F4EFE7]/50 text-xs font-mono">{s.streak}</span>
              <span className="text-[#60a5fa] text-xs font-mono font-semibold">{fmtTokens(tokensByStudent[s.student_id] ?? 0)}</span>
              <span className="text-[#F4EFE7]/25 text-xs font-mono">{s.last_active?.slice(0, 10) || "—"}</span>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="text-center py-10 text-[#F4EFE7]/25 text-sm">No students found.</div>
          )}
        </div>
      )}

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-xs text-[#F4EFE7]/30">
          <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 rounded-full text-[#F4EFE7]/40 hover:text-[#F4EFE7]/70 disabled:opacity-30 transition-colors"
              style={{ background: "rgba(244,239,231,0.06)" }}
            >
              ← Prev
            </button>
            <span className="flex items-center px-2">Page {page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 rounded-full text-[#F4EFE7]/40 hover:text-[#F4EFE7]/70 disabled:opacity-30 transition-colors"
              style={{ background: "rgba(244,239,231,0.06)" }}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
