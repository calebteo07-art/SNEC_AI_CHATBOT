"use client";
/* AURORA student-detail modal (admin). Loads /api/admin/student/:id/detail and
   shows mini-stats + sessions/cases/topics sub-tabs + a lecturer note. */
import { useEffect, useRef, useState } from "react";
import { fmtTokens } from "@/screens/adminShared";
import { useStudentDetail } from "@/hooks/useAdmin";
import { Icon } from "@/aurora/icons";
import { EngagementBlock } from "@/aurora/components/EngagementBlock";
import { DivergingBar } from "@/aurora/components/admin/DivergingBar";
import { masteryRows } from "@/aurora/components/admin/masteryView";
import { buildStudentReportHtml, type StudentReportData } from "@/aurora/lib/studentReportExport";

type SubTab = "sessions" | "cases" | "topics";
const SUBTAB_LABEL: Record<SubTab, string> = {
  sessions: "Sessions", cases: "Virtual patients", topics: "Topics & gaps",
};

export function AdminStudentDetail({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const detailQ = useStudentDetail(studentId);
  const data = detailQ.data ?? null;
  const loading = detailQ.isLoading;
  const error = detailQ.isError;
  const [subTab, setSubTab] = useState<SubTab>("sessions");
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  // AI teaching narrative — fetched on demand (a paid call) so it never runs unasked.
  const [narrative, setNarrative] = useState("");
  const [narrLoading, setNarrLoading] = useState(false);

  // One call site, not one execution — this re-runs on every render, which costs nothing
  // for three rows. The point is that the downloaded report and the panel below cannot
  // describe the same student differently.
  const mastery = masteryRows(data?.mastery);

  const loadNarrative = async () => {
    setNarrLoading(true);
    try {
      const r = await fetch(`/api/admin/student/${studentId}/insights`, { credentials: "include" });
      const d = await r.json();
      setNarrative((d.narrative ?? "").trim() || "No AI narrative available right now — the findings above still summarise this student.");
    } catch { setNarrative("Could not generate the narrative just now. Please try again."); }
    setNarrLoading(false);
  };

  // Seed the editable note once per opened student — NOT on every poll refetch.
  // useStudentDetail polls every 30s; a background refetch can resolve to a new
  // object reference (last_active/session_count/sessions drift) even when the
  // note itself hasn't changed, and re-seeding on every `data` change would
  // overwrite mid-edit supervisor input with the stale server value.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (data && seededFor.current !== studentId) {
      setNote(data.supervisor_note ?? "");
      seededFor.current = studentId;
    }
  }, [data, studentId]);

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

  // Map the already-loaded per-student data (no fetch) into the report model and download it
  // as one self-contained, print-to-PDF HTML file. Re-runnable (unlike the one-time OSCE save)
  // — filename EyeBot-Student-<id8>-<yyyy-mm-dd>.html.
  const handleDownloadReport = () => {
    if (!data) return;
    const report: StudentReportData = {
      meta: {
        studentId: data.student_id, fullName: data.full_name, email: data.email,
        role: data.role, dateStr: new Date().toLocaleString(),
      },
      vitals: {
        sessions: data.session_count, streak: data.streak,
        lastActive: data.last_active?.slice(0, 10) || "", velocity: data.learning_velocity,
        cases: data.cases.length, tokens: fmtTokens(data.total_tokens),
      },
      topics: Object.entries(data.retention_scores).map(([topic, score]) => {
        const fc = data.flashcard_accuracy?.[topic];   // {correct,total,pct}; pct already 0–100
        return {
          topic,
          retentionPct: Math.round(score * 100),
          flashcardPct: fc ? Math.round(fc.pct) : null,
        };
      }),
      // Per-SCALE, not per-topic. The report used to carry a per-topic "cohort avg" column
      // fed by `cohort_retention` — a field no backend version ever sent, so it printed a
      // column of dashes. There is no honest per-topic cohort figure to put there; these
      // three scales are the comparison the API can actually make.
      mastery: mastery.map((r) => ({
        label: r.label, valueLabel: r.valueLabel, deltaLabel: r.deltaLabel, cohortLabel: r.cohortLabel,
      })),
      osce: data.cases.map((c) => ({
        caseId: c.case_id, totalScore: c.total_score, scoreMax: 40, passed: c.passed,
        score100: c.score_100 ?? null, safe: c.safe ?? null,
        missedCritical: c.missed_critical ?? [], dateStr: c.completed_at?.slice(0, 10) || "",
      })),
      weakTopics: data.weak_topics,
      missedFindings: data.missed_findings,
      note,
      activity: data.sessions.slice(0, 12).map((s) => ({ dateStr: s.timestamp?.slice(0, 10) || "", topic: s.topic })),
      findings: data.insights?.findings ?? [],
      narrative: narrative || data.insights?.narrative || "",
    };
    const blob = new Blob([buildStudentReportHtml(report)], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `EyeBot-Student-${data.student_id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
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

              <EngagementBlock sessions={data.sessions} />

              {/* Omitted entirely when `mastery` is null — the mastery reads failed, or this
                  student is not in the cohort population (a promoted trainer is on the
                  roster but excluded from it). Neither is "scored 0 against their peers". */}
              {mastery.length > 0 && (
                <section className="aurora-panel" data-testid="mastery-panel">
                  <p className="aurora-panel-head">Mastery vs cohort</p>
                  <p className="aurora-unavail" style={{ marginBottom: 12 }}>
                    Three separate scales — they measure different things and are never blended. The
                    cohort average excludes this student, so a delta of 0 means &ldquo;level with peers&rdquo;,
                    not &ldquo;no peers to compare&rdquo;.
                  </p>
                  <ul className="aurora-mastery-list">
                    {mastery.map((r) => (
                      <li key={r.key} data-testid="mastery-row" data-scale={r.key}>
                        <span className="aurora-mastery-label">{r.label}</span>
                        <span className="aurora-mastery-value" data-testid="mastery-value">{r.valueLabel}</span>
                        <DivergingBar pct={r.deltaPct} tone={r.tone} />
                        <span className="aurora-mastery-delta" data-testid="mastery-delta"
                              data-tone={r.tone}>{r.deltaLabel}</span>
                        <small className="aurora-mastery-cohort" data-testid="mastery-cohort">{r.cohortLabel}</small>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {data.insights && data.insights.findings.length > 0 && (
                <div className="aurora-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  <p className="aurora-activity-head" style={{ margin: 0 }}>Findings &amp; insights · all three features</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {data.insights.findings.map((f, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13.5, lineHeight: 1.45 }}>
                        <span className="aurora-badge" data-tone="purple" style={{ flex: "none", minWidth: 96, textAlign: "center" }}>{f.feature}</span>
                        <span>{f.text}</span>
                      </div>
                    ))}
                  </div>
                  {narrative ? (
                    <p style={{ margin: "4px 0 0", padding: "10px 12px", borderRadius: 8, background: "rgba(123,86,180,.08)", fontSize: 13.5, lineHeight: 1.5 }}>
                      <b>AI teaching insight:</b> {narrative}
                    </p>
                  ) : (
                    <button type="button" className="aurora-btn-ghost" style={{ alignSelf: "flex-start" }} onClick={loadNarrative} disabled={narrLoading}>
                      {narrLoading ? "Generating…" : "✨ Generate AI teaching narrative"}
                    </button>
                  )}
                </div>
              )}

              <div className="aurora-tabs" style={{ alignSelf: "flex-start" }}>
                {(["sessions", "cases", "topics"] as SubTab[]).map((t) => (
                  <button key={t} type="button" className={`aurora-tab${subTab === t ? " aurora-flow" : ""}`} data-active={subTab === t} onClick={() => setSubTab(t)}>
                    <span>{SUBTAB_LABEL[t]}</span>
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
                  <div className="aurora-trow aurora-thead" style={{ gridTemplateColumns: "1fr 80px 88px 66px 96px" }}>
                    <span>Case</span><span>Score</span><span>Sub-scores</span><span>Safety</span><span>Date</span>
                  </div>
                  {data.cases.length === 0 && <p className="aurora-tempty">No case attempts yet.</p>}
                  {data.cases.map((c, i) => {
                    const scored = c.score_100 !== undefined;
                    return (
                      <div key={i} className="aurora-trow" style={{ gridTemplateColumns: "1fr 80px 88px 66px 96px" }}>
                        <span className="aurora-tcell">{c.case_id}</span>
                        <span className="aurora-tcell is-mono">{scored ? `${c.score_100}/100` : `${c.total_score}/40`}</span>
                        <span className="aurora-tcell is-muted">
                          {c.consult_technique !== undefined && c.judgement_safety !== undefined
                            ? `${c.consult_technique}·${c.judgement_safety}` : "—"}
                        </span>
                        <span className="aurora-tcell">
                          {c.safe === undefined
                            ? <span className="aurora-badge" data-tone={c.passed ? "ok" : "rose"}>{c.passed ? "Pass" : "Fail"}</span>
                            : <span className="aurora-badge" data-tone={c.safe ? "ok" : "rose"}>{c.safe ? "Safe" : "Unsafe"}</span>}
                        </span>
                        <span className="aurora-tcell is-muted">{c.completed_at?.slice(0, 10) || "—"}</span>
                      </div>
                    );
                  })}
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
                  {data.flashcard_accuracy && Object.keys(data.flashcard_accuracy).length > 0 && (
                    <div>
                      <p className="aurora-activity-head">Flashcard accuracy (per topic)</p>
                      <div className="aurora-bars">
                        {Object.entries(data.flashcard_accuracy).map(([topic, a]) => (
                          <div key={topic} className="aurora-bar-row">
                            <span className="aurora-bar-label">{topic.replace(/_/g, " ")}</span>
                            <span className="aurora-bar-track"><span className="aurora-bar-fill" data-weak={a.pct < 65} style={{ width: `${Math.max(0, Math.min(100, a.pct))}%` }} /></span>
                            <span className="aurora-bar-pct">{a.correct}/{a.total}</span>
                          </div>
                        ))}
                      </div>
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
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="button" className="aurora-btn-ghost" onClick={saveNote} disabled={savingNote}>
                    {noteSaved ? "Saved" : savingNote ? "Saving…" : "Save note"}
                  </button>
                  <button type="button" className="aurora-btn-ghost" onClick={handleDownloadReport}>
                    Download report (HTML)
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
