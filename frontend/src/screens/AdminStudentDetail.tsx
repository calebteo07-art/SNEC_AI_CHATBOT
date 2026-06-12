import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { useAuth } from "./AuthContext";

interface Session {
  session_id: string;
  timestamp: string;
  topic: string;
  token_count: number;
  model: string;
}

interface Case {
  case_id: string;
  total_score: number;
  passed: boolean;
  completed_at: string;
}

interface DetailData {
  student_id: string;
  full_name: string;
  email: string;
  role: string;
  session_count: number;
  streak: number;
  last_active: string;
  learning_velocity: string;
  weak_topics: string[];
  missed_findings: string[];
  retention_scores: Record<string, number>;
  supervisor_note: string;
  sessions: Session[];
  cases: Case[];
  total_tokens: number;
}

type SubTab = "sessions" | "cases" | "topics";

function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function scoreColor(score: number) {
  if (score < 0.65) return "#ef4444";
  if (score < 0.80) return "#f59e0b";
  return "#4CAF50";
}

export function AdminStudentDetail({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const {} = useAuth();
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
      .catch(() => { setError(true); })
      .finally(() => setLoading(false));
  }, [studentId]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const saveNote = async () => {
    if (!data) return;
    setSavingNote(true);
    try {
      await fetch(`/api/supervisor/student/${studentId}/note`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ note }),
      });
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2000);
    } catch { /* non-fatal */ }
    setSavingNote(false);
  };

  const velocityColor = (v: string) => {
    if (v === "improving") return "#4CAF50";
    if (v === "declining") return "#ef4444";
    return "#f59e0b";
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          className="w-full max-w-3xl bg-[#0f0f1e] border border-[#3a3a5a] rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden"
          style={{ maxHeight: "90vh" }}
          initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
        >
          {/* Header bar */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3a5a] flex-shrink-0">
            <span className="text-[#8C6D3F] text-xs uppercase tracking-widest">Student Detail</span>
            <button onClick={onClose} className="text-[#888] hover:text-white transition-colors" aria-label="Close"><X size={18} /></button>
          </div>

          {loading && (
            <div className="flex-1 flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-[#8C6D3F]/40 border-t-[#8C6D3F] rounded-full animate-spin" />
            </div>
          )}

          {!loading && error && (
            <div className="flex-1 flex items-center justify-center py-20">
              <p className="text-[#888] text-sm">Could not load student data.</p>
            </div>
          )}

          {data && (
            <div className="flex-1 overflow-y-auto">
              <div className="p-6 space-y-6">

                {/* Student header */}
                <div className="flex items-center gap-4 pb-4 border-b border-[#3a3a5a]">
                  <div className="w-12 h-12 bg-[#8C6D3F] rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                    {data.full_name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-semibold text-base">{data.full_name}</div>
                    <div className="text-[#888] text-xs">{data.role} · {data.email}</div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <span className="px-2 py-1 rounded text-xs" style={{ background: "#4CAF5022", color: "#4CAF50" }}>● Active</span>
                    <span className="px-2 py-1 rounded text-xs" style={{ background: "#8C6D3F22", color: velocityColor(data.learning_velocity) }}>
                      {data.learning_velocity}
                    </span>
                  </div>
                </div>

                {/* Stat cards */}
                <div className="grid grid-cols-5 gap-3">
                  {[
                    { label: "Sessions", val: data.session_count },
                    { label: "Day Streak", val: data.streak },
                    { label: "Cases Done", val: data.cases.length },
                    { label: "Total Tokens", val: fmt(data.total_tokens) },
                    { label: "Last Active", val: data.last_active?.slice(0, 10) || "—" },
                  ].map(({ label, val }) => (
                    <div key={label} className="bg-[#2a2a4a] rounded-lg p-3 text-center">
                      <div className="text-[#8C6D3F] font-bold text-xl">{val}</div>
                      <div className="text-[#888] text-xs mt-1">{label}</div>
                    </div>
                  ))}
                </div>

                {/* Sub-tabs */}
                <div>
                  <div className="flex gap-1 mb-0">
                    {(["sessions", "cases", "topics"] as SubTab[]).map((t) => (
                      <button key={t} onClick={() => setSubTab(t)}
                        className="px-4 py-2 text-xs rounded-t-lg transition-colors capitalize"
                        style={{ background: subTab === t ? "#8C6D3F" : "#2a2a4a", color: subTab === t ? "white" : "#888" }}>
                        {t === "topics" ? "Topics & Gaps" : t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>

                  <div className="bg-[#2a2a4a] rounded-b-lg rounded-tr-lg p-4">
                    {subTab === "sessions" && (
                      <div>
                        <div className="text-[#888] text-xs mb-3">Last 30 sessions · most recent first</div>
                        {data.sessions.length === 0 && <p className="text-[#888] text-sm">No sessions yet.</p>}
                        <div>
                          {data.sessions.length > 0 && (
                            <div className="grid grid-cols-[100px_1fr_70px_60px] gap-2 text-[#8C6D3F] text-xs uppercase tracking-wide pb-2 border-b border-[#3a3a5a]">
                              <span>Date</span><span>Topic</span><span>Tokens</span><span>Model</span>
                            </div>
                          )}
                          {data.sessions.map((s) => (
                            <div key={s.session_id} className="grid grid-cols-[100px_1fr_70px_60px] gap-2 py-2 border-b border-[#3a3a5a]/50 text-sm">
                              <span className="text-[#888]">{s.timestamp?.slice(0, 10) || "—"}</span>
                              <span className="text-[#ccc] truncate">{s.topic || "—"}</span>
                              <span className="text-[#8C6D3F]">{s.token_count.toLocaleString()}</span>
                              <span className="text-[#888]">{s.model || "—"}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {subTab === "cases" && (
                      <div>
                        {data.cases.length > 0 && (
                          <p className="text-[#888] text-xs mb-3">
                            Passed {data.cases.filter((c) => c.passed).length} of {data.cases.length} cases
                          </p>
                        )}
                        {data.cases.length === 0 && <p className="text-[#888] text-sm">No case attempts yet.</p>}
                        {data.cases.length > 0 && (
                          <div>
                            <div className="grid grid-cols-[1fr_80px_70px_100px] gap-2 text-[#8C6D3F] text-xs uppercase tracking-wide pb-2 border-b border-[#3a3a5a]">
                              <span>Case</span><span>Score</span><span>Result</span><span>Date</span>
                            </div>
                            {data.cases.map((c, i) => (
                              <div key={i} className="grid grid-cols-[1fr_80px_70px_100px] gap-2 py-2 border-b border-[#3a3a5a]/50 text-sm">
                                <span className="text-[#ccc]">{c.case_id}</span>
                                <span className="text-[#ccc]">{c.total_score}/40</span>
                                <span style={{ color: c.passed ? "#4CAF50" : "#ef4444" }}>{c.passed ? "Pass" : "Fail"}</span>
                                <span className="text-[#888]">{c.completed_at?.slice(0, 10) || "—"}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {subTab === "topics" && (
                      <div className="space-y-4">
                        {Object.keys(data.retention_scores).length === 0 && data.missed_findings.length === 0 && (
                          <p className="text-[#888] text-sm">No topic data yet.</p>
                        )}
                        {Object.keys(data.retention_scores).length > 0 && (
                          <div>
                            {Object.entries(data.retention_scores).map(([topic, score]) => (
                              <div key={topic} className="mb-3">
                                <div className="flex justify-between text-sm mb-1">
                                  <span className="text-[#ccc]">{topic}</span>
                                  <span style={{ color: scoreColor(score) }}>{Math.round(score * 100)}%</span>
                                </div>
                                <div className="bg-[#1a1a2e] h-2 rounded-full">
                                  <div className="h-2 rounded-full transition-all" style={{ width: `${score * 100}%`, background: scoreColor(score) }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {data.missed_findings.length > 0 && (
                          <div>
                            <div className="text-[#888] text-xs uppercase tracking-wide mb-2">Consistently missed</div>
                            <ul className="space-y-1">
                              {data.missed_findings.map((f) => (
                                <li key={f} className="text-[#ccc] text-sm">· {f}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Lecturer note */}
                <div>
                  <div className="text-[#8C6D3F] text-xs uppercase tracking-wide mb-2">Lecturer note</div>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    className="w-full bg-[#1a1a2e] border border-[#3a3a5a] rounded-lg p-3 text-[#ccc] text-sm outline-none focus:border-[#8C6D3F] transition-colors resize-none"
                    placeholder="Add a note about this student..."
                  />
                  <button
                    onClick={saveNote}
                    disabled={savingNote}
                    className="mt-2 px-4 py-2 text-xs rounded-lg transition-colors disabled:opacity-50"
                    style={{ background: "#8C6D3F22", color: noteSaved ? "#4CAF50" : "#8C6D3F", border: "1px solid #8C6D3F44" }}
                  >
                    {noteSaved ? "Saved" : savingNote ? "Saving..." : "Save note"}
                  </button>
                </div>

              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
