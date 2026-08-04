"use client";
/* Console student-detail modal (staff). Loads /api/admin/student/:id/detail and
   shows mini-stats + sessions/cases/topics sub-tabs + a lecturer note.

   Re-skinned onto .cs. Behaviour preserved exactly: the `seededFor` ref that stops a
   30s poll clobbering a mid-edit note, the AI narrative staying behind an explicit
   button (it is a paid call), the whole report-download mapping, and the
   `mastery.length > 0` omission guard. */
import { useEffect, useRef, useState } from "react";
import { fmtTokens } from "@/screens/adminShared";
import { useStudentDetail } from "@/hooks/useAdmin";
import { Icon } from "@/aurora/icons";
import { EngagementBlock } from "@/aurora/components/EngagementBlock";
import { DivergingBar } from "@/aurora/components/admin/DivergingBar";
import { masteryRows } from "@/aurora/components/admin/masteryView";
import { buildStudentReportHtml, type StudentReportData } from "@/aurora/lib/studentReportExport";
import { subScoreText, subScoreTitle } from "@/aurora/lib/caseGrade";
import { DataTable } from "@/aurora/console/DataTable";
import { BarList, type CsBarRow } from "@/aurora/console/BarList";
import { Badge, MiniStat, Panel } from "@/aurora/console/Panel";
import { CsSkeleton, CsError } from "@/aurora/console/states";

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

  const retentionBars: CsBarRow[] = Object.entries(data?.retention_scores ?? {}).map(([topic, score]) => ({
    label: topic.replace(/_/g, " "),
    value: Math.round(score * 100),
    readout: `${Math.round(score * 100)}%`,
    hue: score < 0.65 ? "coral" : "blue",
  }));
  const flashcardBars: CsBarRow[] = Object.entries(data?.flashcard_accuracy ?? {}).map(([topic, a]) => ({
    label: topic.replace(/_/g, " "),
    value: Math.max(0, Math.min(100, a.pct)),   // pct already 0-100
    readout: `${a.correct}/${a.total}`,
    hue: a.pct < 65 ? "coral" : "blue",
  }));

  return (
    <div className="cs-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cs-modal" role="dialog" aria-modal="true" aria-label="Student detail" style={{ maxWidth: 860 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <p className="cs-eyebrow" style={{ margin: 0 }}>Student detail</p>
            <p style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-.018em", margin: "3px 0 0" }}>
              {data?.full_name ?? "…"}
            </p>
          </div>
          <button type="button" className="cs-close" onClick={onClose} aria-label="Close">
            <Icon.close size={17} />
          </button>
        </div>

        {loading && <CsSkeleton rows={6} />}
        {!loading && error && <CsError onRetry={() => detailQ.refetch()} label="Could not load student data." />}

        {data && (
          <>
            {/* A tighter track than the Overview strip: five cells, and the default
                168px minimum orphans the fifth onto a row of its own. */}
            <div className="cs-strip" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(126px, 1fr))" }}>
              {[
                { label: "Sessions", val: String(data.session_count) },
                { label: "Streak", val: `${data.streak}d` },
                { label: "Cases", val: String(data.cases.length) },
                { label: "Tokens", val: fmtTokens(data.total_tokens) },
                { label: "Last active", val: data.last_active?.slice(0, 10) || "—" },
              ].map((s) => <MiniStat key={s.label} label={s.label} value={s.val} />)}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Badge hue="purple">{data.role}</Badge>
              <Badge hue={data.learning_velocity === "declining" ? "coral" : "blue"}>{data.learning_velocity}</Badge>
            </div>

            {/* Omitted entirely when `mastery` is null — the mastery reads failed, or this
                student is not in the cohort population (a promoted trainer is on the
                roster but excluded from it). Neither is "scored 0 against their peers". */}
            {mastery.length > 0 && (
              <Panel hue="blue" title="Mastery vs cohort" testId="mastery-panel">
                <p className="cs-note" style={{ maxWidth: "72ch" }}>
                  Three separate scales — they measure different things and are never blended. The
                  cohort average excludes this student, so a delta of 0 means &ldquo;level with peers&rdquo;,
                  not &ldquo;no peers to compare&rdquo;.
                </p>
                <ul className="cs-mastery">
                  {mastery.map((r) => (
                    <li key={r.key} data-testid="mastery-row" data-scale={r.key}>
                      <span className="cs-mastery-label">{r.label}</span>
                      <span className="cs-mastery-value cs-num" data-testid="mastery-value">{r.valueLabel}</span>
                      <DivergingBar pct={r.deltaPct} tone={r.tone} />
                      <span className="cs-mastery-delta" data-testid="mastery-delta" data-tone={r.tone}>{r.deltaLabel}</span>
                      <small className="cs-mastery-cohort" data-testid="mastery-cohort">{r.cohortLabel}</small>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            {data.insights && data.insights.findings.length > 0 && (
              <Panel hue="purple" title="Findings &amp; insights · all three features">
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {data.insights.findings.map((f, i) => (
                    <div key={i} style={{ display: "flex", gap: 9, alignItems: "baseline", fontSize: 13, lineHeight: 1.45 }}>
                      <span style={{ flex: "none", minWidth: 96 }}><Badge hue="purple">{f.feature}</Badge></span>
                      <span>{f.text}</span>
                    </div>
                  ))}
                </div>
                {/* The narrative is a PAID Gemini call — it stays behind an explicit press
                    and never fires on open. */}
                {narrative ? (
                  <p style={{ margin: "10px 0 0", padding: "10px 12px", borderRadius: 9, background: "rgba(129,84,190,.09)", fontSize: 13, lineHeight: 1.5 }}>
                    <b>AI teaching insight:</b> {narrative}
                  </p>
                ) : (
                  <button type="button" className="cs-btn-ghost" style={{ marginTop: 10 }} onClick={loadNarrative} disabled={narrLoading}>
                    {narrLoading ? "Generating…" : "✨ Generate AI teaching narrative"}
                  </button>
                )}
              </Panel>
            )}

            {/* Below the mastery read, not above it. The calendar is ~330px of mostly
                empty grid; leading with it pushed the one comparison a trainer opens
                this modal for under the fold. It sits with the sessions table now,
                which is the thing it actually annotates. */}
            <EngagementBlock sessions={data.sessions} />

            <div className="cs-seg" style={{ alignSelf: "flex-start", maxWidth: "100%", overflowX: "auto" }} role="tablist" aria-label="Student detail section">
              {(["sessions", "cases", "topics"] as SubTab[]).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={subTab === t} data-active={subTab === t} onClick={() => setSubTab(t)}>
                  {SUBTAB_LABEL[t]}
                </button>
              ))}
            </div>

            {subTab === "sessions" && (
              <DataTable
                rows={data.sessions}
                rowKey={(s) => s.session_id}
                empty="No sessions yet."
                columns={[
                  { key: "date", head: "Date", width: "104px", primary: true, cell: (s) => <span className="cs-num">{s.timestamp?.slice(0, 10) || "—"}</span> },
                  { key: "topic", head: "Topic", width: "1fr", cell: (s) => s.topic || "—" },
                  { key: "tokens", head: "Tokens", width: "78px", cell: (s) => <span className="cs-num" style={{ color: "var(--cs-blue)" }}>{s.token_count.toLocaleString()}</span> },
                  { key: "model", head: "Model", width: "78px", cell: (s) => <span style={{ color: "var(--cs-ink-3)" }}>{s.model || "—"}</span> },
                ]}
              />
            )}

            {subTab === "cases" && (
              <DataTable
                rows={data.cases}
                rowKey={(c, i) => `${c.case_id}-${i}`}
                empty="No case attempts yet."
                columns={[
                  { key: "case", head: "Case", width: "1fr", primary: true, cell: (c) => c.case_id },
                  // score_100 is the Tier-2 scale; pre-Tier-2 rows only ever had /40.
                  { key: "score", head: "Score", width: "84px", cell: (c) => <span className="cs-num">{c.score_100 !== undefined ? `${c.score_100}/100` : `${c.total_score}/40`}</span> },
                  // Denominators, always. These render bare INTEGERs from two scoring eras —
                  // ×50 before 2026-08-04, 40/30/30 after — so "40·38" above "22·26" read as
                  // a collapse that was only the rescale. caseGrade.ts owns which is which.
                  {
                    key: "sub", head: "Sub-scores", width: "158px",
                    cell: (c) => (
                      <span className="cs-num" style={{ color: "var(--cs-ink-3)" }} title={subScoreTitle(c)}>
                        {subScoreText(c)}
                      </span>
                    ),
                  },
                  {
                    key: "safety", head: "Safety", width: "74px",
                    cell: (c) => (c.safe === undefined
                      ? <Badge hue={c.passed ? "teal" : "coral"}>{c.passed ? "Pass" : "Fail"}</Badge>
                      : <Badge hue={c.safe ? "teal" : "coral"}>{c.safe ? "Safe" : "Unsafe"}</Badge>),
                  },
                  { key: "date", head: "Date", width: "98px", cell: (c) => <span className="cs-num" style={{ color: "var(--cs-ink-3)" }}>{c.completed_at?.slice(0, 10) || "—"}</span> },
                ]}
              />
            )}

            {subTab === "topics" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {retentionBars.length === 0 && flashcardBars.length === 0 && data.missed_findings.length === 0 && (
                  <p className="cs-note" style={{ margin: 0 }}>No topic data yet.</p>
                )}
                {retentionBars.length > 0 && (
                  <div>
                    <p className="cs-eyebrow" style={{ marginBottom: 4 }}>Topic retention</p>
                    <BarList rows={retentionBars} max={100} />
                  </div>
                )}
                {flashcardBars.length > 0 && (
                  <div>
                    <p className="cs-eyebrow" style={{ marginBottom: 4 }}>Flashcard accuracy (per topic)</p>
                    <BarList rows={flashcardBars} max={100} />
                  </div>
                )}
                {data.missed_findings.length > 0 && (
                  <div>
                    <p className="cs-eyebrow" style={{ marginBottom: 4 }}>Consistently missed</p>
                    <ul className="cs-misslist">
                      {data.missed_findings.map((f) => <li key={f}>{f}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div>
              <p className="cs-eyebrow" style={{ marginBottom: 5 }}>Lecturer note</p>
              <textarea
                className="cs-textarea"
                style={{ marginBottom: 10 }}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Add a note about this student…"
                aria-label="Lecturer note"
              />
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className="cs-btn-ghost" onClick={saveNote} disabled={savingNote}>
                  {noteSaved ? "Saved" : savingNote ? "Saving…" : "Save note"}
                </button>
                <button type="button" className="cs-btn-ghost" onClick={handleDownloadReport}>
                  Download report (HTML)
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
