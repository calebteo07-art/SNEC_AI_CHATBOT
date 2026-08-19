"use client";
/* Console — students. The cohort table: search + role/at-risk filter + paginate
   (the AdminStudents controls, now hook-driven so it refreshes in real time).
   A row click opens the reused AdminStudentDetail drill-down.

   Re-skinned onto .cs — the filtering and paging arithmetic is byte-identical to the
   .aurora-admin version; only the markup moved. */
import { useState } from "react";
import { AdminStudentDetail } from "@/aurora/screens/AdminStudentDetail";
import { displayName } from "@/aurora/lib/displayName";
import { useRoster, useAtRisk, useStaff, type RosterRow, type StaffRow } from "@/hooks/useAdmin";
import { DataTable } from "@/aurora/console/DataTable";
import { Badge, Panel, type Hue } from "@/aurora/console/Panel";
import { CsSkeleton, CsError } from "@/aurora/console/states";

const PAGE_SIZE = 20;
type Filter = "all" | "OA" | "OT" | "PSA" | "at-risk";

function roleHue(role: string): Hue | undefined {
  if (role === "OA") return "blue";
  if (role === "OT") return "purple";
  if (role === "PSA") return "coral";
  return undefined;
}

export function AdminRoster() {
  const roster = useRoster();
  const atRiskQ = useAtRisk();
  const staffQ = useStaff();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  const students = roster.data ?? [];
  const staff = staffQ.data ?? [];
  // A failed at-risk read is NOT "nobody is flagged". With no rows the coral markers
  // simply vanish from a roster that still renders perfectly, and the "At risk" filter
  // answers an outage with a clean "No students found."
  //
  // `isSuccess`, not `!isError`: React Query retries a 503 with backoff, so for several
  // seconds the query is neither successful nor failed — and an empty at-risk list during
  // that window renders exactly the same reassuring lie, just time-boxed. The filter may
  // only show a table once the read it filters on has actually landed.
  const atRiskFailed = atRiskQ.isError;
  const atRiskReady = atRiskQ.isSuccess;
  const atRisk = (atRiskQ.data ?? []).map((r) => r.student_id);

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
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="cs-toolbar">
        <input
          className="cs-field"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder="Search name or email…"
          aria-label="Search students"
        />
        <div className="cs-chips">
          {(["all", "OA", "OT", "PSA", "at-risk"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              className="cs-chip"
              data-active={filter === f}
              onClick={() => { setFilter(f); setPage(0); }}
            >
              {f === "all" ? "All" : f === "at-risk" ? "At risk" : f}
            </button>
          ))}
        </div>
      </div>

      {/* The roster read succeeded, so the table below still renders — but the markers on
          it did not, and an unmarked row is indistinguishable from a safe one. */}
      {atRiskFailed && filter !== "at-risk" && (
        <CsError
          onRetry={() => atRiskQ.refetch()}
          label="Couldn’t load the at-risk flags — no student is marked below."
        />
      )}

      {roster.isLoading ? (
        <CsSkeleton rows={6} />
      ) : roster.isError ? (
        <CsError onRetry={() => roster.refetch()} label="Couldn’t load the roster." />
      ) : filter === "at-risk" && !atRiskReady ? (
        atRiskFailed
          ? <CsError onRetry={() => atRiskQ.refetch()} label="Couldn’t load the at-risk flags." />
          : <CsSkeleton rows={6} />
      ) : (
        <DataTable<RosterRow>
          testId="admin-roster"
          rows={paged}
          rowKey={(s) => s.student_id}
          onRowClick={(s) => setOpenId(s.student_id)}
          empty="No students found."
          columns={[
            {
              key: "name", head: "Name", width: "2.2fr", primary: true,
              cell: (s) => (
                <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                  {atRisk.includes(s.student_id) && (
                    <span
                      title="At risk" aria-label="At risk"
                      style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--cs-coral)", flex: "none" }}
                    />
                  )}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{s.full_name}</span>
                </span>
              ),
            },
            { key: "email", head: "Email", width: "2.4fr", cell: (s) => <span style={{ color: "var(--cs-ink-3)" }} title={s.email}>{s.email}</span> },
            { key: "role", head: "Role", width: "84px", cell: (s) => <Badge hue={roleHue(s.role)}>{s.role}</Badge> },
            { key: "sessions", head: "Sessions", width: "92px", cell: (s) => <span className="cs-num">{s.session_count}</span> },
            { key: "streak", head: "Streak", width: "78px", cell: (s) => <span className="cs-num">{s.streak}</span> },
            { key: "last", head: "Last active", width: "112px", cell: (s) => <span className="cs-num" style={{ color: "var(--cs-ink-3)" }}>{s.last_active?.slice(0, 10) || "—"}</span> },
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

      {/* Staff — trainers & admins. A separate section so student cohort/at-risk/
          benchmark numbers stay student-only. "Pending" = account created but not
          yet activated (first login mints the profile), listed from email + role. */}
      <Panel hue="purple" title={`Staff · trainers & admins (${staff.length})`}>
        <p className="cs-note">
          Staff don’t count toward cohort or at-risk numbers. “Pending” means the account exists
          but hasn’t been activated yet — the first login creates their profile.
        </p>
        {staffQ.isLoading ? (
          <CsSkeleton rows={2} />
        ) : staffQ.isError ? (
          <CsError onRetry={() => staffQ.refetch()} label="Couldn’t load staff accounts." />
        ) : (
          <DataTable<StaffRow>
            testId="admin-staff"
            rows={staff}
            rowKey={(s) => s.email}
            /* A pending row has no profile to open, so it stays un-clickable — the guard
               is the same one the .aurora version carried. */
            onRowClick={(s) => { if (s.status === "active" && s.student_id) setOpenId(s.student_id); }}
            empty="No staff accounts yet."
            columns={[
              { key: "name", head: "Name", width: "2fr", primary: true, cell: (s) => displayName(s.full_name || s.email) },
              { key: "email", head: "Email", width: "2.4fr", cell: (s) => <span style={{ color: "var(--cs-ink-3)" }} title={s.email}>{s.email}</span> },
              { key: "role", head: "Role", width: "92px", cell: (s) => <Badge hue={s.role === "admin" ? "purple" : "blue"}>{s.role === "admin" ? "Admin" : "Trainer"}</Badge> },
              {
                key: "status", head: "Status", width: "96px",
                cell: (s) => {
                  const activated = s.status === "active" && !!s.student_id;
                  return <Badge hue={activated ? "teal" : "amber"}>{activated ? "Active" : "Pending"}</Badge>;
                },
              },
              { key: "sessions", head: "Sessions", width: "84px", cell: (s) => <span className="cs-num">{s.status === "active" && s.student_id ? s.session_count : "—"}</span> },
              { key: "streak", head: "Streak", width: "72px", cell: (s) => <span className="cs-num">{s.status === "active" && s.student_id ? s.streak : "—"}</span> },
              { key: "last", head: "Last active", width: "112px", cell: (s) => <span className="cs-num" style={{ color: "var(--cs-ink-3)" }}>{s.status === "active" && s.student_id ? (s.last_active?.slice(0, 10) || "—") : "—"}</span> },
            ]}
          />
        )}
      </Panel>

      {openId && <AdminStudentDetail studentId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
