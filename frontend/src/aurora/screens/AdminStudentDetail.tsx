"use client";
/* AURORA student-detail modal (admin). Loads /api/admin/student/:id/detail and
   shows mini-stats + sessions/cases/topics sub-tabs + a lecturer note. */
import { useEffect, useState } from "react";
import { fmtTokens } from "@/screens/adminShared";
import { Icon } from "@/aurora/icons";

interface Session { session_id: string; timestamp: string; topic: string; token_count: number; model: string; }
interface CaseRow { case_id: string; total_score: number; passed: boolean; completed_at: string; }
interface DetailData {
  student_id: string; full_name: string; email: string; role: string;
  session_count: number; streak: number; last_active: string; learning_velocity: string;
  weak_topics: string[]; missed_findings: string[]; retention_scores: Record<string, number>;
  supervisor_note: string; sessions: Session[]; cases: CaseRow[]; total_tokens: number;
}
type SubTab = "sessions" | "cases" | "topics";

export function AdminStudentDetail({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [subTab, setSubTab] = useState<SubTab>("sessions");
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/student/${studentId}/detail`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { setData(d); setNote(d.supervisor_note ?? ""); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [studentId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const saveNote = async () => {
    setSavingNote(true);
    try {
      await fetch(`/api/supervisor/student/${studentId}/note`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ note }),
      });
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2000);
    } catch { /* non-fatal */ }
    setSavingNote(false);
  };

  return (
    <div className="aurora-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="aurora-modal" role="dialog" aria-modal="true" aria-label="Student detail">
        <div className="aurora-modal-head">
          <div>
            <p className="aurora-modal-eyebrow">Student detail</p>
            <p className="aurora-modal-title">{data?.full_name ?? "…"}</p>
          </div>
          <button type="button" className="aurora-modal-close" onClick={onClose} aria-label="Close">
            <Icon.close size={18} />
          </button>
        </div>

        <div className="aurora-modal-body">
          {loading && <p className="aurora-muted">Loading student…</p>}
          {!loading && error && <p className="aurora-muted">Could not load student data.</p>}

          {data && (
            <>
              <div className="aurora-mini-stats">
                {[
                  { label: "Sessions", val: data.session_count },
                  { label: "Streak", val: `${data.streak}d` },
                  { label: "Cases", val: data.cases.length },
                  { label: "Tokens", val: fmtTokens(data.total_tokens) },
                  { label: "Last active", val: data.last_active?.slice(0, 10) || "—" },
                ].map((s) => (
                  <div key={s.label} className="aurora-mini-stat">
                    <div className="aurora-mini-stat-val">{s.val}</div>
                    <div className="aurora-mini-stat-label">{s.label}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="aurora-badge" data-tone="purple">{data.role}</span>
                <span className="aurora-badge" data-tone={data.learning_velocity === "declining" ? "rose" : "blue"}>
                  {data.learning_velocity}
                </span>
              </div>

              <div className="aurora-tabs" style={{ alignSelf: "flex-start" }}>
                {(["sessions", "cases", "topics"] as SubTab[]).map((t) => (
                  <button key={t} type="button" className={`aurora-tab${subTab === t ? " aurora-flow" : ""}`} data-active={subTab === t} onClick={() => setSubTab(t)}>
                    <span style={{ textTransform: "capitalize" }}>{t === "topics" ? "Topics & gaps" : t}</span>
                  </button>
                ))}
              </div>

              {subTab === "sessions" && (
                <div className="aurora-table-wrap">
                  <div className="aurora-trow aurora-thead" style={{ gridTemplateColumns: "100px 1fr 70px 70px" }}>
                    <span>Date</span><span>Topic</span><span>Tokens</span><span>Model</span>
                  </div>
                  {data.sessions.length === 0 && <p className="aurora-tempty">No sessions yet.</p>}
                  {data.sessions.map((s) => (
                    <div key={s.session_id} className="aurora-trow" style={{ gridTemplateColumns: "100px 1fr 70px 70px" }}>
                      <span className="aurora-tcell is-mono">{s.timestamp?.slice(0, 10) || "—"}</span>
                      <span className="aurora-tcell">{s.topic || "—"}</span>
                      <span className="aurora-tcell is-accent">{s.token_count.toLocaleString()}</span>
                      <span className="aurora-tcell is-muted">{s.model || "—"}</span>
                    </div>
                  ))}
                </div>
              )}

              {subTab === "cases" && (
                <div className="aurora-table-wrap">
                  <div className="aurora-trow aurora-thead" style={{ gridTemplateColumns: "1fr 80px 70px 100px" }}>
                    <span>Case</span><span>Score</span><span>Result</span><span>Date</span>
                  </div>
                  {data.cases.length === 0 && <p className="aurora-tempty">No case attempts yet.</p>}
                  {data.cases.map((c, i) => (
                    <div key={i} className="aurora-trow" style={{ gridTemplateColumns: "1fr 80px 70px 100px" }}>
                      <span className="aurora-tcell">{c.case_id}</span>
                      <span className="aurora-tcell is-mono">{c.total_score}/40</span>
                      <span className="aurora-tcell"><span className="aurora-badge" data-tone={c.passed ? "ok" : "rose"}>{c.passed ? "Pass" : "Fail"}</span></span>
                      <span className="aurora-tcell is-muted">{c.completed_at?.slice(0, 10) || "—"}</span>
                    </div>
                  ))}
                </div>
              )}

              {subTab === "topics" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {Object.keys(data.retention_scores).length === 0 && data.missed_findings.length === 0 && (
                    <p className="aurora-muted">No topic data yet.</p>
                  )}
                  {Object.keys(data.retention_scores).length > 0 && (
                    <div className="aurora-bars">
                      {Object.entries(data.retention_scores).map(([topic, score]) => {
                        const pct = Math.round(score * 100);
                        return (
                          <div key={topic} className="aurora-bar-row">
                            <span className="aurora-bar-label">{topic.replace(/_/g, " ")}</span>
                            <span className="aurora-bar-track"><span className="aurora-bar-fill" data-weak={score < 0.65} style={{ width: `${pct}%` }} /></span>
                            <span className="aurora-bar-pct">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {data.missed_findings.length > 0 && (
                    <div>
                      <p className="aurora-activity-head">Consistently missed</p>
                      <ul className="aurora-rose-list">
                        {data.missed_findings.map((f) => <li key={f}>{f}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div>
                <p className="aurora-activity-head">Lecturer note</p>
                <textarea
                  className="aurora-checkin-textarea"
                  style={{ marginBottom: 10 }}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Add a note about this student…"
                />
                <button type="button" className="aurora-btn-ghost" onClick={saveNote} disabled={savingNote}>
                  {noteSaved ? "Saved" : savingNote ? "Saving…" : "Save note"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
