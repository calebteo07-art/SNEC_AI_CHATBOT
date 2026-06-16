"use client";
/* AURORA supervisor drill-down — a student's vitals, weak topics, a vs-cohort
   comparison, missed findings, a supervisor note, and a PDF export. Endpoints
   preserved (/api/supervisor/student/:id, /note PATCH, /report blob). */
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/aurora/icons";
import { EngagementBlock } from "@/aurora/components/EngagementBlock";

export interface BenchmarkTopic { topic: string; avg_score: number; student_count: number; }
interface StudentProfile {
  student_id: string; weak_topics: string[]; missed_findings: string[];
  retention_scores: Record<string, number>; session_count: number; streak: number;
  last_active: string; learning_velocity: string; checkin_done_today: boolean; supervisor_note?: string;
  sessions?: { timestamp: string }[];
}

export function SupervisorDrillDown({ studentId, onClose, benchmarks }: { studentId: string; onClose: () => void; benchmarks: BenchmarkTopic[] }) {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [note, setNote] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`/api/supervisor/student/${studentId}`, { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { setProfile(d); setNote(d.supervisor_note ?? ""); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [studentId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const saveNote = () => {
    if (noteSaving) return;
    setNoteSaving(true);
    fetch(`/api/supervisor/student/${studentId}/note`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ note }),
    }).then((r) => { if (!r.ok) throw new Error(); }).then(() => {
      setNoteSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setNoteSaved(false), 2500);
    }).catch(() => {}).finally(() => setNoteSaving(false));
  };

  const exportPdf = () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    fetch(`/api/supervisor/student/${studentId}/report`, { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(); return r.blob(); })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `eyebot_student_${studentId.slice(0, 8)}_report.pdf`; a.click();
        URL.revokeObjectURL(url);
      }).catch(() => {}).finally(() => setPdfLoading(false));
  };

  const cohortMap = Object.fromEntries(benchmarks.map((b) => [b.topic, b.avg_score]));
  const overlap = profile ? Object.keys(profile.retention_scores).filter((t) => t in cohortMap) : [];

  return (
    <div className="aurora-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="aurora-modal" role="dialog" aria-modal="true" aria-label="Student profile">
        <div className="aurora-modal-head">
          <div>
            <p className="aurora-modal-eyebrow">Student profile</p>
            <p className="aurora-modal-title">{studentId.slice(0, 8)}…</p>
          </div>
          <div className="aurora-modal-actions">
            <button type="button" className="aurora-btn-ghost" onClick={exportPdf} disabled={pdfLoading}>{pdfLoading ? "…" : "Export PDF"}</button>
            <button type="button" className="aurora-modal-close" onClick={onClose} aria-label="Close"><Icon.close size={18} /></button>
          </div>
        </div>

        <div className="aurora-modal-body">
          {loading && <p className="aurora-muted">Loading profile…</p>}
          {!loading && error && <p className="aurora-muted">We couldn’t load this student’s profile.</p>}

          {profile && (
            <>
              <div className="aurora-mini-stats">
                <div className="aurora-mini-stat"><div className="aurora-mini-stat-val">{profile.session_count}</div><div className="aurora-mini-stat-label">Sessions</div></div>
                <div className="aurora-mini-stat"><div className="aurora-mini-stat-val">{profile.streak}d</div><div className="aurora-mini-stat-label">Streak</div></div>
                <div className="aurora-mini-stat"><div className="aurora-mini-stat-val" style={{ fontSize: 14 }}>{profile.last_active || "Never"}</div><div className="aurora-mini-stat-label">Last active</div></div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="aurora-badge" data-tone={profile.learning_velocity === "declining" ? "rose" : profile.learning_velocity === "improving" ? "blue" : undefined}>
                  {profile.learning_velocity}
                </span>
              </div>

              <EngagementBlock sessions={profile.sessions ?? []} />

              <div>
                <p className="aurora-activity-head">Weak topics</p>
                {profile.weak_topics.length === 0 ? (
                  <p className="aurora-muted">None — all topics above threshold.</p>
                ) : (
                  <div className="aurora-prog-chips">
                    {profile.weak_topics.map((t) => {
                      const score = profile.retention_scores[t];
                      return <span key={t} className="aurora-prog-chip">{t.replace(/_/g, " ")}{score !== undefined ? ` · ${Math.round(score * 100)}%` : ""}</span>;
                    })}
                  </div>
                )}
              </div>

              {overlap.length > 0 && (
                <div>
                  <p className="aurora-activity-head">vs. cohort</p>
                  <div className="aurora-bars">
                    {overlap.map((t) => {
                      const sPct = Math.round(profile.retention_scores[t] * 100);
                      const cPct = Math.round(cohortMap[t] * 100);
                      const delta = sPct - cPct;
                      return (
                        <div key={t} className="aurora-bar-row">
                          <span className="aurora-bar-label">{t.replace(/_/g, " ")}</span>
                          <span className="aurora-bar-track"><span className="aurora-bar-fill" data-weak={sPct < cPct} style={{ width: `${sPct}%` }} /></span>
                          <span className="aurora-bar-pct">{sPct}%</span>
                          <span className="aurora-bar-meta" style={{ color: delta >= 0 ? "var(--on-blue-2)" : "var(--on-rose)" }}>{delta >= 0 ? `+${delta}` : delta}% vs {cPct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {profile.missed_findings.length > 0 && (
                <div>
                  <p className="aurora-activity-head">Missed findings</p>
                  <ul className="aurora-rose-list">{profile.missed_findings.map((f, i) => <li key={i}>{f}</li>)}</ul>
                </div>
              )}

              <div>
                <p className="aurora-activity-head">Supervisor note</p>
                <textarea className="aurora-checkin-textarea" style={{ marginBottom: 10 }} rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note — e.g. 'Spoke 2 Jun, will revisit biometry next week.'" />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span className="aurora-note is-ok" style={{ opacity: noteSaved ? 1 : 0, transition: "opacity 0.4s" }}>Saved</span>
                  <button type="button" className="aurora-btn" onClick={saveNote} disabled={noteSaving}>{noteSaving ? "Saving…" : "Save note"}</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
