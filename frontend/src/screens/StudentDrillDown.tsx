import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { X, TrendingUp, TrendingDown, Minus, FileDown, Save, Clock } from "lucide-react";
import { useAuth } from "./AuthContext";

const API = "";

interface StudentProfile {
  student_id: string;
  weak_topics: string[];
  missed_findings: string[];
  retention_scores: Record<string, number>;
  session_count: number;
  streak: number;
  last_active: string;
  learning_velocity: string;
  checkin_done_today: boolean;
  supervisor_note?: string;
}

interface BenchmarkTopic {
  topic: string;
  avg_score: number;
  student_count: number;
}

interface Props {
  studentId: string;
  onClose: () => void;
  benchmarks: BenchmarkTopic[];
}

function VelocityIcon({ velocity }: { velocity: string }) {
  if (velocity === "improving") return <TrendingUp size={14} strokeWidth={1.5} className="text-[#4F6B3D]" />;
  if (velocity === "declining") return <TrendingDown size={14} strokeWidth={1.5} className="text-[#8B2D2D]" />;
  return <Minus size={14} strokeWidth={1.5} className="text-[#A39A8E]" />;
}

export function StudentDrillDown({ studentId, onClose, benchmarks }: Props) {
  const {} = useAuth();

  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [note, setNote] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pdfLoading, setPdfLoading] = useState(false);
  const [noteTimestamp, setNoteTimestamp] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/supervisor/student/${studentId}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data) => {
        setProfile(data);
        setNote(data.supervisor_note ?? "");
        setLoading(false);
      })
      .catch(() => {
        setError("We couldn't load this student's profile.");
        setLoading(false);
      });
  }, [studentId]);

  function handleSaveNote() {
    if (noteSaving) return;
    setNoteSaving(true);
    fetch(`${API}/api/supervisor/student/${studentId}/note`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ note }),
    })
      .then((r) => { if (!r.ok) throw new Error(); })
      .then(() => {
        setNoteSaved(true);
        setNoteTimestamp(new Date().toLocaleString("en-SG", {
          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
        }));
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setNoteSaved(false), 2500);
      })
      .catch(() => {})
      .finally(() => setNoteSaving(false));
  }

  function handleExportPdf() {
    if (pdfLoading) return;
    setPdfLoading(true);
    fetch(`${API}/api/supervisor/student/${studentId}/report`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `eyebot_student_${studentId.slice(0, 8)}_report.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => {})
      .finally(() => setPdfLoading(false));
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1F1A12]/30 backdrop-blur-sm px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-lg surface-card-lg overflow-hidden"
        initial={{ scale: 0.96, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-8 py-5 border-b border-[#1F1A12]/8">
          <div>
            <p
              className="text-[#8C6D3F]"
              style={{ fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 600 }}
            >
              · Student profile
            </p>
            <p
              className="mt-0.5 text-[#1F1A12]"
              style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", fontWeight: 400, letterSpacing: "-0.005em" }}
            >
              {studentId.slice(0, 8)}…
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportPdf}
              disabled={pdfLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#8C6D3F]/30 text-[#8C6D3F] hover:bg-[#8C6D3F]/6 transition-colors disabled:opacity-50"
              style={{ fontSize: "0.78rem", fontWeight: 500 }}
              title="Export PDF report"
            >
              {pdfLoading
                ? <div className="w-3 h-3 border border-[#8C6D3F]/30 border-t-[#8C6D3F] rounded-full animate-spin" />
                : <FileDown size={13} strokeWidth={1.5} />
              }
              Export PDF
            </button>
            <button onClick={onClose} className="text-[#A39A8E] hover:text-[#1F1A12] transition-colors">
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        <div className="px-8 py-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
          {loading && (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-[#1F1A12]/10 border-t-[#8C6D3F] rounded-full animate-spin" />
            </div>
          )}
          {error && <p className="text-[#8B2D2D]" style={{ fontSize: "0.92rem" }}>{error}</p>}
          {profile && (
            <div className="space-y-7">
              <div className="grid grid-cols-3 bg-[#1F1A12]/8 border border-[#1F1A12]/8 rounded-xl overflow-hidden" style={{ gap: "1px" }}>
                {[
                  { label: "Sessions", value: profile.session_count },
                  { label: "Streak", value: `${profile.streak}d` },
                  { label: "Last active", value: profile.last_active || "Never" },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white px-4 py-4 text-center">
                    <p
                      className="text-[#A39A8E] mb-1"
                      style={{ fontSize: "0.62rem", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600 }}
                    >
                      {label}
                    </p>
                    <p
                      className="text-[#1F1A12]"
                      style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 400 }}
                    >
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <VelocityIcon velocity={profile.learning_velocity} />
                <span className="text-[#5C544A] capitalize" style={{ fontSize: "0.88rem" }}>
                  {profile.learning_velocity}
                </span>
              </div>

              <div>
                <p
                  className="text-[#8C6D3F] mb-3"
                  style={{ fontSize: "0.68rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600 }}
                >
                  · Weak topics
                </p>
                {profile.weak_topics.length === 0 ? (
                  <p className="text-[#A39A8E]" style={{ fontSize: "0.88rem" }}>
                    None — all topics above threshold.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {profile.weak_topics.map((t) => {
                      const score = profile.retention_scores[t];
                      return (
                        <span
                          key={t}
                          className="px-3 py-1 rounded-full bg-[#8B2D2D]/8 border border-[#8B2D2D]/20 text-[#8B2D2D]"
                          style={{ fontSize: "0.78rem", fontWeight: 500 }}
                        >
                          {t}{score !== undefined ? ` · ${Math.round(score * 100)}%` : ""}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* vs. Cohort */}
              {(() => {
                const cohortMap = Object.fromEntries(benchmarks.map(b => [b.topic, b.avg_score]));
                const overlap = Object.keys(profile.retention_scores).filter(t => t in cohortMap);
                if (overlap.length === 0) return null;
                return (
                  <div>
                    <p
                      className="text-[#8C6D3F] mb-3"
                      style={{ fontSize: "0.68rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600 }}
                    >
                      · vs. cohort
                    </p>
                    <div className="space-y-2.5">
                      {overlap.map((t, idx) => {
                        const sPct = Math.round(profile.retention_scores[t] * 100);
                        const cPct = Math.round(cohortMap[t] * 100);
                        const delta = sPct - cPct;
                        const deltaColor = delta >= 0 ? "#4F6B3D" : "#8B2D2D";
                        const deltaLabel = delta >= 0 ? `+${delta}%` : `${delta}%`;
                        return (
                          <motion.div
                            key={t}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.3, delay: idx * 0.04 }}
                            className="flex items-center gap-3"
                          >
                            <span
                              className="text-[#5C544A] truncate text-right shrink-0"
                              style={{ fontSize: "0.78rem", width: "7rem" }}
                              title={t.replace(/_/g, " ")}
                            >
                              {t.replace(/_/g, " ")}
                            </span>
                            <div className="flex-1 flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[#A39A8E] shrink-0" style={{ fontSize: "0.62rem", width: "2.4rem" }}>You</span>
                                <div className="flex-1 h-1.5 rounded-full bg-[#8C6D3F]/8 overflow-hidden">
                                  <div className="h-full rounded-full bg-[#8C6D3F]" style={{ width: `${sPct}%` }} />
                                </div>
                                <span className="text-[#5C544A] tabular-nums shrink-0" style={{ fontSize: "0.72rem", minWidth: "2.2rem" }}>{sPct}%</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[#A39A8E] shrink-0" style={{ fontSize: "0.62rem", width: "2.4rem" }}>Cohort</span>
                                <div className="flex-1 h-1.5 rounded-full bg-[#4F6B3D]/8 overflow-hidden">
                                  <div className="h-full rounded-full bg-[#4F6B3D]" style={{ width: `${cPct}%` }} />
                                </div>
                                <span className="text-[#5C544A] tabular-nums shrink-0" style={{ fontSize: "0.72rem", minWidth: "2.2rem" }}>{cPct}%</span>
                              </div>
                            </div>
                            <span
                              className="shrink-0 text-center rounded-full px-1.5 py-0.5 tabular-nums"
                              style={{
                                fontSize: "0.7rem", fontWeight: 600, color: deltaColor,
                                background: delta >= 0 ? "#4F6B3D14" : "#8B2D2D14",
                                minWidth: "3rem",
                              }}
                            >
                              {deltaLabel}
                            </span>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div>
                <p
                  className="text-[#8C6D3F] mb-3"
                  style={{ fontSize: "0.68rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600 }}
                >
                  · Missed findings
                </p>
                {profile.missed_findings.length === 0 ? (
                  <p className="text-[#A39A8E]" style={{ fontSize: "0.88rem" }}>
                    None recorded.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {profile.missed_findings.map((f, i) => (
                      <li
                        key={i}
                        className="text-[#5C544A] flex items-start gap-3"
                        style={{ fontSize: "0.9rem", lineHeight: 1.6 }}
                      >
                        <span className="text-[#8C6D3F] mt-1.5 w-1 h-1 rounded-full bg-[#8C6D3F] flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Supervisor note */}
              <div className="rounded-2xl border border-[#8C6D3F]/20 bg-[#0d1626] overflow-hidden">
                <div className="px-5 py-3 border-b border-[#8C6D3F]/12 flex items-center justify-between">
                  <p
                    className="text-[#8C6D3F]"
                    style={{ fontSize: "0.68rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600 }}
                  >
                    · Supervisor note
                  </p>
                  {noteTimestamp && (
                    <span className="flex items-center gap-1 text-[#A39A8E]" style={{ fontSize: "0.72rem" }}>
                      <Clock size={10} strokeWidth={1.5} />
                      Saved {noteTimestamp}
                    </span>
                  )}
                </div>
                <div className="px-5 py-4">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note — e.g. 'Spoke 2 Jun, will revisit biometry next week.'"
                    rows={4}
                    className="w-full px-0 py-0 bg-transparent text-[#1F1A12] placeholder-[#4a5568] resize-none focus:outline-none border-l-2 border-[#8C6D3F]/40 pl-3 transition-colors"
                    style={{ fontSize: "0.88rem", lineHeight: 1.65 }}
                  />
                  <div className="mt-3 flex items-center justify-between">
                    <span
                      className="transition-opacity duration-500"
                      style={{ fontSize: "0.78rem", color: "#4F6B3D", opacity: noteSaved ? 1 : 0 }}
                    >
                      Saved
                    </span>
                    <button
                      onClick={handleSaveNote}
                      disabled={noteSaving}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#1F1A12] text-[#FBF8F1] hover:bg-[#3A3024] transition-colors disabled:opacity-50"
                      style={{ fontSize: "0.78rem", fontWeight: 500 }}
                    >
                      {noteSaving
                        ? <div className="w-3 h-3 border border-[#FBF8F1]/30 border-t-[#FBF8F1] rounded-full animate-spin" />
                        : <Save size={12} strokeWidth={1.5} />
                      }
                      Save note
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
