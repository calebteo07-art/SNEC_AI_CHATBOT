import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "@/lib/nav";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "./AuthContext";

/* ── Types (unchanged) ────────────────────────────────────── */
interface CaseInfo {
  case_id: string; title: string; difficulty: string; topic: string;
  estimated_minutes: number;
  patient: { name: string; age: number; presenting_complaint: string };
}
interface ChecklistStep { step_number: number; action: string; critical: boolean; category: string; notes: string | null; }
interface Checklist { procedure_name: string; steps: ChecklistStep[]; total_steps: number; critical_count: number; }
interface ChatMessage { role: "user" | "assistant"; content: string; }
interface DomainResult {
  history_score: number; investigations_score: number; diagnosis_score: number; management_score: number;
  history_feedback: string; investigations_feedback: string; diagnosis_feedback: string; management_feedback: string;
  total_score: number; overall_feedback: string; critical_hit: number; critical_total: number;
}
interface ChecklistStepResult { step_number: number; action: string; critical: boolean; performed: boolean; clinical_note: string | null; }

const DOMAINS: { label: string; scoreKey: keyof DomainResult; feedbackKey: keyof DomainResult }[] = [
  { label: "History",        scoreKey: "history_score",       feedbackKey: "history_feedback" },
  { label: "Investigations", scoreKey: "investigations_score", feedbackKey: "investigations_feedback" },
  { label: "Diagnosis",      scoreKey: "diagnosis_score",      feedbackKey: "diagnosis_feedback" },
  { label: "Management",     scoreKey: "management_score",     feedbackKey: "management_feedback" },
];

/* ── Score colour helper ──────────────────────────────────── */
const scoreColor = (s: number) =>
  s >= 8 ? "var(--emerald)" : s >= 5 ? "var(--gold)" : "var(--heart)";

/* ── CaseSessionScreen ────────────────────────────────────── */
export function CaseSessionScreen() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  useAuth();

  const [caseInfo, setCaseInfo]         = useState<CaseInfo | null>(() => {
    try {
      const handoff = sessionStorage.getItem("eyebot_case_handoff");
      if (!handoff) return null;
      const parsed = JSON.parse(handoff) as CaseInfo;
      return parsed.case_id === caseId ? parsed : null;
    } catch {
      return null;
    }
  });
  const [loadError, setLoadError]       = useState<string | null>(null);
  const [checklist, setChecklist]       = useState<Checklist | null>(null);
  const [tickedSteps, setTickedSteps]   = useState<Set<number>>(new Set());
  const [checklistOpen, setChecklistOpen] = useState(true);

  const [messages, setMessages]         = useState<ChatMessage[]>([]);
  const [input, setInput]               = useState("");
  const [sending, setSending]           = useState(false);
  const [isStreaming, setIsStreaming]   = useState(false);

  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [diagnosis, setDiagnosis]       = useState("");
  const [managementPlan, setManagementPlan] = useState("");
  const [submitting, setSubmitting]     = useState(false);
  const [result, setResult]             = useState<DomainResult | null>(null);
  const [debrief, setDebrief]           = useState<string | null>(null);
  const [checklistComparison, setChecklistComparison] = useState<ChecklistStepResult[]>([]);
  const [submitError, setSubmitError]   = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);

  /* Load case if not passed via router state */
  useEffect(() => {
    if (caseInfo || !caseId) return;
    fetch(`/api/cases/${caseId}`, { credentials: "include" })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setCaseInfo)
      .catch(() => setLoadError(`Case "${caseId}" not found.`));
  }, [caseId, caseInfo]);

  /* Load checklist */
  useEffect(() => {
    if (!caseId) return;
    fetch(`/api/cases/${caseId}/checklist`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setChecklist(d))
      .catch(() => {});
  }, [caseId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const toggleStep = (n: number) => {
    setTickedSteps(prev => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n); else next.add(n);
      return next;
    });
  };

  /* Send with SSE streaming — unchanged */
  const sendMessage = async () => {
    if (!input.trim() || sending || isStreaming || !caseId) return;
    const content = input.trim();
    const newMsg: ChatMessage = { role: "user", content };
    const updated = [...messages, newMsg];
    setMessages(updated);
    setInput("");
    setSending(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: updated }),
      });
      if (!res.ok || !res.body) throw new Error("Stream unavailable");
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);
      setSending(false);
      setIsStreaming(true);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data) as { text: string };
            if (parsed.text) {
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last.role === "assistant")
                  return [...prev.slice(0, -1), { role: "assistant", content: last.content + parsed.text }];
                return prev;
              });
              messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }
          } catch { /* skip */ }
        }
      }
    } catch {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        const fb = "(I'm having trouble reaching the service right now.)";
        if (last.role === "assistant") return [...prev.slice(0, -1), { role: "assistant", content: fb }];
        return [...prev, { role: "assistant", content: fb }];
      });
    } finally { setSending(false); setIsStreaming(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleSubmit = async () => {
    if (!diagnosis.trim() || !managementPlan.trim() || !caseId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages, diagnosis: diagnosis.trim(), management_plan: managementPlan.trim(), performed_steps: Array.from(tickedSteps) }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResult(data.result);
      setDebrief(data.debrief ?? null);
      setChecklistComparison(data.checklist_comparison ?? []);
      setShowSubmitForm(false);
    } catch { setSubmitError("Could not evaluate. Please try again."); }
    finally { setSubmitting(false); }
  };

  const criticalTicked = checklist ? checklist.steps.filter(s => s.critical && tickedSteps.has(s.step_number)).length : 0;
  const unticked = checklist ? checklist.steps.filter(s => s.critical && !tickedSteps.has(s.step_number)) : [];

  /* ── Load error ─────────────────────────────────────────── */
  if (loadError) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <p style={{ fontSize: 14, color: "var(--muted-text)" }}>{loadError}</p>
        <button onClick={() => navigate("/cases")} style={{ color: "var(--teal)", fontWeight: 700, fontSize: 13 }}>← Back to cases</button>
      </div>
    );
  }

  /* ── Main layout ────────────────────────────────────────── */
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* ── Top HUD: patient vitals ──────────────────────────── */}
      {caseInfo && (
        <div className="case-hud">
          <div className="case-hud-stat">
            <span className="case-hud-label">Patient</span>
            <span className="case-hud-val">{caseInfo.patient.name}</span>
          </div>
          <div className="case-hud-stat">
            <span className="case-hud-label">Age</span>
            <span className="case-hud-val">{caseInfo.patient.age}</span>
            <span className="case-hud-unit">yr</span>
          </div>
          <div className="case-hud-stat">
            <span className="case-hud-label">Topic</span>
            <span className="case-hud-val" style={{ fontSize: 12 }}>{caseInfo.topic}</span>
          </div>
          <div className="case-hud-stat">
            <span className="case-hud-label">Difficulty</span>
            <span className={`role-badge ${caseInfo.difficulty?.toLowerCase()}`} style={{ fontSize: 10 }}>
              {caseInfo.difficulty}
            </span>
          </div>
          <div className="case-hud-stat case-hud-stat--flex">
            <span className="case-hud-label">CC</span>
            <span className="case-hud-cc">{caseInfo.patient.presenting_complaint}</span>
          </div>
          <div className="case-hud-stat" style={{ marginLeft: "auto" }}>
            <span className="case-hud-label">Time</span>
            <span className="case-hud-val">{caseInfo.estimated_minutes}′</span>
          </div>
        </div>
      )}

      {/* ── Cockpit: left panel + chat + right panel ─────────── */}
      <div className="case-cockpit">

      {/* ── Left panel: patient + checklist ─────────────────── */}
      <aside style={{ width: 248, flexShrink: 0, background: "var(--card)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Anatomy banner */}
        <div style={{ height: 100, position: "relative", overflow: "hidden", flexShrink: 0, background: "var(--sidebar-bg)" }}>
          <img src="/anatomy/eye-anterior.png" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.6 }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(6,13,24,0.85) 0%, transparent 60%)", display: "flex", alignItems: "flex-end", padding: "10px 14px" }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(31,31,31,0.7)" }}>Patient Guide</span>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px" }}>
          {/* Patient info */}
          {caseInfo ? (
            <div style={{ marginBottom: 16 }}>
              <h1 style={{ fontSize: 18, fontWeight: 400, color: "var(--text)", letterSpacing: "-0.01em", fontFamily: "var(--font-serif)", fontStyle: "italic" }}>{caseInfo.patient.name}</h1>
              <div style={{ fontSize: 11, color: "var(--muted-text)", marginTop: 2 }}>{caseInfo.patient.age} years old · {caseInfo.topic}</div>
              <div style={{ marginTop: 10, padding: "10px 12px", background: "var(--teal-bg)", borderRadius: "var(--r-sm)", borderLeft: "3px solid var(--teal)" }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--teal)", marginBottom: 4 }}>Presenting complaint</div>
                <p style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.5, fontStyle: "italic" }}>"{caseInfo.patient.presenting_complaint}"</p>
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              {[80, 60, 90].map((w, i) => (
                <div key={i} style={{ height: 12, borderRadius: 6, background: "var(--border)", width: `${w}%` }} />
              ))}
            </div>
          )}

          <div style={{ height: 1, background: "var(--border)", margin: "14px 0" }} />

          {/* Checklist */}
          {checklist && (
            <div>
              <button
                onClick={() => setChecklistOpen(v => !v)}
                style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--faint)" }}>Procedure Checklist</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: criticalTicked === checklist.critical_count ? "var(--emerald)" : "var(--gold)" }}>
                  {criticalTicked}/{checklist.critical_count} critical
                </span>
              </button>
              {checklistOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 280, overflowY: "auto" }}>
                  {checklist.steps.map(step => {
                    const ticked = tickedSteps.has(step.step_number);
                    return (
                      <button
                        key={step.step_number}
                        onClick={() => toggleStep(step.step_number)}
                        style={{
                          display: "flex", alignItems: "flex-start", gap: 8, textAlign: "left",
                          background: "none", border: "none", cursor: "pointer", padding: "5px 0",
                        }}
                      >
                        <span style={{ flexShrink: 0, marginTop: 1, color: ticked ? "var(--emerald)" : step.critical ? "var(--teal)" : "var(--faint)", fontSize: 14 }}>
                          {ticked ? "✓" : step.critical ? "●" : "○"}
                        </span>
                        <span style={{ fontSize: 11, lineHeight: 1.45, color: ticked ? "var(--faint)" : "var(--text)", textDecoration: ticked ? "line-through" : "none" }}>
                          {step.action}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Submit button */}
        {!result && (
          <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
            <button
              onClick={() => setShowSubmitForm(v => !v)}
              style={{
                width: "100%", padding: "11px", borderRadius: "var(--r-sm)",
                background: showSubmitForm ? "var(--page)" : "var(--teal)",
                color: showSubmitForm ? "var(--muted)" : "#fff",
                border: showSubmitForm ? "1px solid var(--border)" : "none",
                borderBottom: showSubmitForm ? "1px solid var(--border)" : "4px solid var(--teal-shadow)",
                fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer",
              }}
            >
              {showSubmitForm ? "Cancel" : "Submit Answer"}
            </button>
          </div>
        )}
      </aside>

      {/* ── Right: chat + forms ──────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Submit form (collapsible) */}
        <AnimatePresence>
          {showSubmitForm && !result && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              style={{ flexShrink: 0, background: "var(--card)", borderBottom: "1px solid var(--border)", padding: "16px 20px", overflow: "hidden" }}
            >
              {unticked.length > 0 && (
                <div style={{ padding: "10px 12px", background: "var(--streak-bg)", border: "1px solid var(--streak)", borderRadius: "var(--r-sm)", marginBottom: 12, fontSize: 12, color: "var(--streak)" }}>
                  ⚠ {unticked.length} critical step{unticked.length !== 1 ? "s" : ""} not ticked
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 6 }}>Diagnosis</label>
                  <textarea
                    value={diagnosis}
                    onChange={e => setDiagnosis(e.target.value)}
                    placeholder="Your primary diagnosis…"
                    rows={3}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: "var(--r-sm)", border: "1.5px solid var(--border)", background: "var(--page)", fontSize: 13, resize: "none", outline: "none" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 6 }}>Management Plan</label>
                  <textarea
                    value={managementPlan}
                    onChange={e => setManagementPlan(e.target.value)}
                    placeholder="Proposed management and follow-up…"
                    rows={3}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: "var(--r-sm)", border: "1.5px solid var(--border)", background: "var(--page)", fontSize: 13, resize: "none", outline: "none" }}
                  />
                </div>
              </div>
              {submitError && <p style={{ color: "var(--heart)", fontSize: 12, marginBottom: 8 }}>{submitError}</p>}
              <button
                onClick={handleSubmit}
                disabled={submitting || !diagnosis.trim() || !managementPlan.trim()}
                style={{
                  padding: "10px 28px", borderRadius: "var(--r-full)",
                  background: "var(--emerald)", color: "#fff", border: "none",
                  borderBottom: "4px solid var(--emerald-shadow)",
                  fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
                  cursor: submitting ? "wait" : "pointer", opacity: submitting || !diagnosis.trim() ? 0.5 : 1,
                }}
              >
                {submitting ? "Evaluating…" : "Submit for Evaluation"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {messages.length === 0 && !result && (
            <div style={{ textAlign: "center", paddingTop: 40, color: "var(--faint)", fontSize: 13 }}>
              Start by greeting your patient and taking a history.
            </div>
          )}
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ maxWidth: "80%", alignSelf: m.role === "user" ? "flex-end" : "flex-start" }}
            >
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 4, textAlign: m.role === "user" ? "right" : "left" }}>
                {m.role === "user" ? "You" : caseInfo?.patient.name ?? "Patient"}
              </div>
              <div style={{
                padding: "12px 16px", borderRadius: "var(--r-md)",
                background: m.role === "user" ? "var(--teal)" : "var(--card)",
                color: m.role === "user" ? "#fff" : "var(--text)",
                border: m.role === "user" ? "none" : "1px solid var(--border)",
                fontSize: 13.5, lineHeight: 1.6,
                borderBottomRightRadius: m.role === "user" ? 4 : "var(--r-md)",
                borderBottomLeftRadius: m.role === "assistant" ? 4 : "var(--r-md)",
              }}>
                {m.content}
                {isStreaming && i === messages.length - 1 && m.role === "assistant" && (
                  <span style={{ display: "inline-block", width: 3, height: "1em", borderRadius: 2, background: "var(--teal)", marginLeft: 3, verticalAlign: "-0.1em", animation: "online-pulse 0.9s ease-in-out infinite" }} />
                )}
              </div>
            </motion.div>
          ))}
          {sending && (
            <div style={{ maxWidth: "80%", alignSelf: "flex-start" }}>
              <div style={{ padding: "12px 16px", borderRadius: "var(--r-md)", background: "var(--card)", border: "1px solid var(--border)" }}>
                <span className="spinner spinner--teal" style={{ width: 12, height: 12, borderWidth: 2 }} />
              </div>
            </div>
          )}

          {/* Results */}
          {result && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={{ background: "var(--card)", borderRadius: "var(--r-lg)", border: "1px solid var(--border)", padding: "20px", boxShadow: "var(--sh-md)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h2 style={{ fontSize: 18, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em" }}>Case Complete</h2>
                <div style={{ fontSize: 30, fontWeight: 900, color: scoreColor(result.total_score), letterSpacing: "-0.03em" }}>
                  {result.total_score}<span style={{ fontSize: 14, fontWeight: 600, color: "var(--faint)" }}>/10</span>
                </div>
              </div>
              {DOMAINS.map(d => (
                <div key={d.label} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text)" }}>{d.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: scoreColor(result[d.scoreKey] as number) }}>{result[d.scoreKey] as number}/10</span>
                  </div>
                  <div style={{ height: 4, borderRadius: "var(--r-full)", background: "var(--border)", overflow: "hidden", marginBottom: 6 }}>
                    <div style={{ height: "100%", borderRadius: "var(--r-full)", background: scoreColor(result[d.scoreKey] as number), width: `${(result[d.scoreKey] as number / 10) * 100}%`, transition: "width 0.8s ease" }} />
                  </div>
                  <p style={{ fontSize: 11.5, color: "var(--muted-text)", lineHeight: 1.55 }}>{result[d.feedbackKey] as string}</p>
                </div>
              ))}
              {debrief && (
                <div style={{ padding: "12px 14px", background: "var(--teal-bg)", borderRadius: "var(--r-sm)", borderLeft: "3px solid var(--teal)", marginTop: 16 }}>
                  <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--teal)", marginBottom: 6 }}>Overall feedback</p>
                  <p style={{ fontSize: 12.5, lineHeight: 1.65, color: "var(--text)" }}>{debrief}</p>
                </div>
              )}
              {checklistComparison.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 8 }}>Checklist Review</p>
                  {checklistComparison.map(step => (
                    <div key={step.step_number} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                      <span style={{ color: step.performed ? "var(--emerald)" : step.critical ? "var(--heart)" : "var(--faint)", fontSize: 13 }}>{step.performed ? "✓" : "✗"}</span>
                      <span style={{ fontSize: 11.5, color: step.performed ? "var(--text)" : "var(--muted)" }}>{step.action}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
                <button onClick={() => navigate("/cases")} style={{ padding: "10px 20px", borderRadius: "var(--r-full)", border: "1.5px solid var(--border)", background: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", color: "var(--muted-text)" }}>
                  More cases
                </button>
                <button onClick={() => navigate("/dashboard")} style={{ padding: "10px 20px", borderRadius: "var(--r-full)", background: "var(--teal)", color: "#fff", border: "none", borderBottom: "4px solid var(--teal-shadow)", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                  Back to Learn
                </button>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        {!result && (
          <div style={{ padding: "12px 20px", background: "var(--card)", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Talk to your patient…"
                rows={1}
                style={{
                  flex: 1, padding: "11px 18px", borderRadius: "var(--r-full)",
                  border: "1.5px solid var(--border)", background: "var(--surface-2)",
                  fontSize: 13.5, resize: "none", outline: "none", lineHeight: 1.5, color: "var(--text)",
                }}
              />
              <button
                className="send-btn"
                onClick={sendMessage}
                disabled={!input.trim() || sending || isStreaming}
                aria-label="Send"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 14L14 8L2 2V6.5L10 8L2 9.5V14Z" fill="#fff" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>{/* end chat column */}

      {/* ── Right panel: assessment / scoring ────────────────── */}
      <div className="case-right-panel">
        {!result ? (
          <>
            <div className="case-right-section">
              <div className="case-right-label">Diagnosis</div>
              <textarea
                value={diagnosis}
                onChange={e => setDiagnosis(e.target.value)}
                placeholder="Your primary diagnosis…"
                rows={4}
                style={{ width: "100%", padding: "8px 10px", borderRadius: "var(--r-xs)", border: "1px solid var(--border)", background: "var(--surface-2)", fontSize: 12, resize: "none", outline: "none", color: "var(--text)", lineHeight: 1.5 }}
              />
            </div>
            <div className="case-right-section">
              <div className="case-right-label">Management</div>
              <textarea
                value={managementPlan}
                onChange={e => setManagementPlan(e.target.value)}
                placeholder="Proposed management…"
                rows={4}
                style={{ width: "100%", padding: "8px 10px", borderRadius: "var(--r-xs)", border: "1px solid var(--border)", background: "var(--surface-2)", fontSize: 12, resize: "none", outline: "none", color: "var(--text)", lineHeight: 1.5 }}
              />
            </div>
            {unticked.length > 0 && (
              <div className="case-right-section">
                <div style={{ fontSize: 11, color: "var(--streak)", padding: "6px 8px", background: "var(--streak-bg)", borderRadius: "var(--r-xs)", border: "1px solid var(--streak)" }}>
                  ⚠ {unticked.length} critical step{unticked.length !== 1 ? "s" : ""} not ticked
                </div>
              </div>
            )}
            {submitError && (
              <div className="case-right-section">
                <p style={{ color: "var(--heart)", fontSize: 11 }}>{submitError}</p>
              </div>
            )}
            <div style={{ padding: "12px 14px" }}>
              <button
                onClick={handleSubmit}
                disabled={submitting || !diagnosis.trim() || !managementPlan.trim()}
                style={{
                  width: "100%", padding: "10px", borderRadius: "var(--r-xs)",
                  background: "var(--emerald)", color: "#000", border: "none",
                  borderBottom: "3px solid var(--emerald-shadow)",
                  fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
                  cursor: submitting ? "wait" : "pointer", opacity: submitting || !diagnosis.trim() ? 0.5 : 1,
                }}
              >
                {submitting ? "Evaluating…" : "Submit →"}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Score */}
            <div className="case-right-section">
              <div className="case-right-label">Score</div>
              <div className="case-right-score" style={{ color: scoreColor(result.total_score) }}>
                {result.total_score}<span style={{ fontSize: 14, color: "var(--faint)", fontWeight: 500 }}>/10</span>
              </div>
            </div>
            {/* Domain scores */}
            {DOMAINS.map(d => (
              <div key={d.label} className="case-right-section">
                <div className="case-domain-row">
                  <span className="case-domain-label">{d.label}</span>
                  <span className="case-domain-val" style={{ color: scoreColor(result[d.scoreKey] as number) }}>
                    {result[d.scoreKey] as number}/10
                  </span>
                </div>
                <div className="case-score-bar-track">
                  <div className="case-score-bar-fill" style={{ width: `${(result[d.scoreKey] as number / 10) * 100}%`, background: scoreColor(result[d.scoreKey] as number) }} />
                </div>
              </div>
            ))}
            {/* Actions */}
            <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
              <button onClick={() => navigate("/dashboard")} style={{ width: "100%", padding: "9px", borderRadius: "var(--r-xs)", background: "var(--teal)", color: "#000", border: "none", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
                Back to Learn
              </button>
              <button onClick={() => navigate("/cases")} style={{ width: "100%", padding: "9px", borderRadius: "var(--r-xs)", border: "1px solid var(--border)", background: "none", fontSize: 11, fontWeight: 600, color: "var(--muted-text)", cursor: "pointer" }}>
                More Cases
              </button>
            </div>
          </>
        )}
      </div>

      </div>{/* end .case-cockpit */}
    </div>
  );
}
