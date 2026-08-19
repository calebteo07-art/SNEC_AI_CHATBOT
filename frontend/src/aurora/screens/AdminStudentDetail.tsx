"use client";
/* Console student-detail modal (staff). Loads /api/admin/student/:id/detail and
   shows mini-stats + sessions/cases/topics sub-tabs + a lecturer note.

   It also downloads the two P2 documents — the student report and the OSCE dossier.

   Re-skinned onto .cs. Behaviour preserved exactly: the `seededFor` ref that stops a
   30s poll clobbering a mid-edit note, the AI narrative staying behind an explicit
   button (it is a paid call), and the `mastery.length > 0` omission guard. */
import { useEffect, useRef, useState } from "react";
import { useStudentDetail, type StudentDetail } from "@/hooks/useAdmin";
import { Icon } from "@/aurora/icons";
import { EngagementBlock } from "@/aurora/components/EngagementBlock";
import { DivergingBar } from "@/aurora/components/admin/DivergingBar";
import { masteryRows } from "@/aurora/components/admin/masteryView";
import { buildStudentReportHtml } from "@/aurora/lib/studentReportExport";
import { buildOsceDossierHtml } from "@/aurora/lib/osceDossierExport";
import type {
  Attempt, Axis, Band, Cell, Flag, Offender, StudentInsight, Trajectory, TrajectoryBand,
} from "@/aurora/lib/insight";
import { subScoreText, subScoreTitle } from "@/aurora/lib/caseGrade";
import { DataTable } from "@/aurora/console/DataTable";
import { BarList, type CsBarRow } from "@/aurora/console/BarList";
import { Badge, MiniStat, Panel } from "@/aurora/console/Panel";
import { CsSkeleton, CsError } from "@/aurora/console/states";

type SubTab = "sessions" | "cases" | "topics";
const SUBTAB_LABEL: Record<SubTab, string> = {
  sessions: "Sessions", cases: "Virtual patients", topics: "Topics & gaps",
};

/* ── the API payload → the shape the two documents read ──────────────────────────────
   /detail sends snake_case (tools/supervisor/student_insight.py); the builders read the
   camelCase StudentInsight (aurora/lib/insight.ts). This is the only place the two meet.

   Every null that MEANS something crosses unchanged. A missing cohort baseline stays null,
   because a 0 would read as "the cohort scored nothing"; a missing offender denominator
   stays null, because a number there prints a fraction the payload never supported. */
const num = (v: unknown): number => Number(v ?? 0);
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));
const list = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v as Record<string, unknown>[]) : [];

// All five `band_for` values, "absent" included — it is the Cell() default the backend hands
// to any topic missing from one axis. Narrowing it to "thin" here would have made a topic with
// NO data on an axis indistinguishable from one with too little, which is the one distinction
// this whole payload exists to keep.
const BANDS = ["thin", "weak", "developing", "strong", "absent"];

function toCell(v: unknown): Cell {
  const c = (v ?? {}) as Record<string, unknown>;
  const band = String(c.band ?? "");
  // `value` is null exactly when the band is "absent", and "absent" carries n === 0, so every
  // renderer's `n` guard fires before anything reads the 0 this coerces to. Falling back to
  // "absent" rather than "thin" on an unrecognised band keeps that invariant: an unknown band
  // is not evidence, and "thin" would let it print.
  return { value: num(c.value), n: num(c.n), band: (BANDS.includes(band) ? band : "absent") as Band };
}

function toTrajectory(v: unknown): Trajectory {
  const t = (v ?? {}) as Record<string, unknown>;
  return {
    band: String(t.band ?? "insufficient") as TrajectoryBand,
    delta: numOrNull(t.delta), n: num(t.n), needed: num(t.needed),
    firstMean: numOrNull(t.first_mean), secondMean: numOrNull(t.second_mean),
  };
}

function toOffender(o: Record<string, unknown>): Offender {
  return {
    action: String(o.action ?? ""), missed: num(o.missed), critical: Boolean(o.critical),
    // Null on the critical path: missed_critical carries no denominator at all.
    appeared: numOrNull(o.appeared),
  };
}

function toInsight(raw: Record<string, unknown>): StudentInsight {
  const ml = (raw.mark_loss ?? {}) as Record<string, unknown>;
  const lost = (ml.lost ?? {}) as Record<string, unknown>;
  const shares = (ml.shares ?? {}) as Record<string, unknown>;
  const excluded = (raw.excluded ?? {}) as Record<string, unknown>;
  return {
    topics: list(raw.topics).map((t) => ({
      topic: String(t.topic ?? ""), flag: String(t.flag ?? "") as Flag,
      flashcards: toCell(t.flashcards), station: toCell(t.station), retention: toCell(t.retention),
    })),
    contrasts: list(raw.contrasts).map((c) => ({
      topic: String(c.topic ?? ""), axis: String(c.axis ?? "") as Axis,
      student: num(c.student), cohortMean: numOrNull(c.cohort_mean),
      peers: num(c.peers), label: String(c.label ?? ""),
    })),
    markLoss: {
      lost: { checklist: num(lost.checklist), consult: num(lost.consult), judgement: num(lost.judgement) },
      totalLost: num(ml.total_lost),
      shares: { checklist: num(shares.checklist), consult: num(shares.consult), judgement: num(shares.judgement) },
      attempts: num(ml.attempts), excludedLegacy: num(ml.excluded_legacy),
    },
    offenders: list(raw.offenders).map(toOffender),
    criticalOffenders: list(raw.critical_offenders).map(toOffender),
    osceTrajectory: toTrajectory(raw.osce_trajectory),
    flashcardTrajectory: toTrajectory(raw.flashcard_trajectory),
    consultations: list(raw.consultations).map((c) => ({
      label: String(c.label ?? ""), count: num(c.count),
      lastSeen: String(c.last_seen ?? ""), derived: Boolean(c.derived),
    })),
    excluded: { unmappedCase: num(excluded.unmapped_case), unscored: num(excluded.unscored) },
  };
}

/** The masthead both documents carry. `full_name` is student_consent's and can be blank, so
    the id stands in rather than heading a document with nothing. */
const reportMeta = (d: StudentDetail) => ({
  studentId: d.student_id, fullName: d.full_name || d.student_id,
  email: d.email, role: d.role, dateStr: new Date().toLocaleString(),
});

/** EyeBot-<Kind>-<id8>-<yyyy-mm-dd>.html — this console's existing download convention. */
const fileName = (kind: string, studentId: string) =>
  `EyeBot-${kind}-${studentId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.html`;

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

  // Re-runs on every render, which costs nothing for three rows. (It used to feed the
  // downloaded report too; the rebuilt report is built from `insight` and carries no mastery
  // section, so this now serves the panel below alone.)
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

  // Fetched only when a download is clicked. The per-step ledger is ~5KB per attempt and
  // /detail is polled every 30s, so it must never ride along with the poll.
  const fetchAttempts = async (): Promise<Attempt[]> => {
    const r = await fetch(`/api/admin/student/${studentId}/attempts`, { credentials: "include" });
    if (!r.ok) throw new Error(`attempts ${r.status}`);
    const d = await r.json();
    return list(d.attempts).map((a) => ({
      caseId: String(a.case_id ?? ""), completedAt: String(a.completed_at ?? ""),
      totalScore: num(a.total_score), passed: Boolean(a.passed),
      score100: numOrNull(a.score_100), safe: a.safe == null ? null : Boolean(a.safe),
      checklistCoverage: numOrNull(a.checklist_coverage),
      consultTechnique: numOrNull(a.consult_technique),
      judgementSafety: numOrNull(a.judgement_safety),
      gradeScale: numOrNull(a.grade_scale),
      missedCritical: Array.isArray(a.missed_critical) ? a.missed_critical.map(String) : [],
      coaching: (a.coaching ?? null) as Record<string, unknown> | null,
      // null and [] are different claims and both survive this mapping: null means the
      // attempt predates migration 019 and has no ledger, [] means the case genuinely
      // resolved zero checklist steps. Collapsing either way asserts a record we lack.
      checklistDetail: a.checklist_detail == null ? null
        : list(a.checklist_detail).map((s) => ({
            stepNumber: num(s.step_number), action: String(s.action ?? ""),
            phase: String(s.phase ?? ""), critical: Boolean(s.critical),
            performed: Boolean(s.performed), skipped: Boolean(s.skipped),
          })),
    }));
  };

  // One self-contained, print-to-PDF HTML file. Re-runnable (unlike the one-time OSCE save).
  // The anchor is attached before the click and the URL revoked on a timer: Firefox ignores a
  // click on a detached anchor, and revoking in the same tick can cancel the download.
  const download = (html: string, filename: string) => {
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  /* No insight, no document. /detail fail-softs to `insight: null` when the assembler throws,
     and a document built from that is not empty — it is a full page of honest-state lines
     ("No cohort baseline", "Not enough attempts to call a trend") that read as findings about
     the student when the truth is that our analysis failed. Both buttons are disabled for the
     same reason, with the reason on screen.

     `attempts` is a separate matter: [] from a failed fetch is NOT "no attempts", and both
     builders already tell those apart by cross-checking the insight's own attempt counts, so
     the catch below degrades to "detail could not be loaded", never to a false absence. */
  const downloadReport = async () => {
    if (!data?.insight) return;
    const insight = toInsight(data.insight);
    const attempts = await fetchAttempts().catch(() => []);
    download(buildStudentReportHtml({ meta: reportMeta(data), insight, attempts, note }),
             fileName("Student", data.student_id));
  };

  const downloadDossier = async () => {
    if (!data?.insight) return;
    const insight = toInsight(data.insight);
    const attempts = await fetchAttempts().catch(() => []);
    download(buildOsceDossierHtml({ meta: reportMeta(data), insight, attempts }),
             fileName("OSCE-Dossier", data.student_id));
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
            {/* A tighter track than the Overview strip: these cells hold short figures and
                the default 168px minimum stretches them across the dialog. */}
            <div className="cs-strip" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(126px, 1fr))" }}>
              {[
                { label: "Sessions", val: String(data.session_count) },
                { label: "Streak", val: `${data.streak}d` },
                { label: "Cases", val: String(data.cases.length) },
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
                {/* .cs-btn-ghost has no :disabled rule, so the dimming is inline — a control
                    that looks live but does nothing is worse than no control. */}
                <button type="button" className="cs-btn-ghost" onClick={downloadReport}
                        disabled={!data.insight} style={data.insight ? undefined : { opacity: 0.55 }}>
                  Download report (HTML)
                </button>
                <button type="button" className="cs-btn-ghost" onClick={downloadDossier}
                        disabled={!data.insight} style={data.insight ? undefined : { opacity: 0.55 }}>
                  Download OSCE dossier (HTML)
                </button>
                {!data.insight && (
                  <p className="cs-note" style={{ flexBasis: "100%", margin: 0, maxWidth: "72ch" }}>
                    Downloads are unavailable: this student&rsquo;s analysis could not be assembled.
                    A document built without it would print &ldquo;no data yet&rdquo; lines that read
                    as findings about the student rather than as a failure on our side. This panel
                    refreshes every 30 seconds, so it usually clears on its own.
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
