import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { HolographicEyeLogo } from "./HolographicEyeLogo";
import {
  Send, User, ArrowLeft, CheckSquare, AlertCircle,
  Layers, ChevronDown, ChevronUp, Menu, X as XIcon,
  ClipboardList, CheckCircle2, Circle, AlertTriangle,
} from "lucide-react";
import { useAuth } from "./AuthContext";

interface CaseInfo {
  case_id: string;
  title: string;
  difficulty: string;
  topic: string;
  estimated_minutes: number;
  patient: { name: string; age: number; presenting_complaint: string };
}

interface ChecklistStep {
  step_number: number;
  action: string;
  critical: boolean;
  category: string;
  notes: string | null;
}

interface Checklist {
  procedure_name: string;
  steps: ChecklistStep[];
  total_steps: number;
  critical_count: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface DomainResult {
  history_score: number;
  investigations_score: number;
  diagnosis_score: number;
  management_score: number;
  history_feedback: string;
  investigations_feedback: string;
  diagnosis_feedback: string;
  management_feedback: string;
  total_score: number;
  overall_feedback: string;
  critical_hit: number;
  critical_total: number;
}

interface ChecklistStepResult {
  step_number: number;
  action: string;
  critical: boolean;
  performed: boolean;
  clinical_note: string | null;
}

const DOMAINS: { label: string; scoreKey: keyof DomainResult; feedbackKey: keyof DomainResult }[] = [
  { label: "History",        scoreKey: "history_score",        feedbackKey: "history_feedback" },
  { label: "Investigations", scoreKey: "investigations_score",  feedbackKey: "investigations_feedback" },
  { label: "Diagnosis",      scoreKey: "diagnosis_score",       feedbackKey: "diagnosis_feedback" },
  { label: "Management",     scoreKey: "management_score",      feedbackKey: "management_feedback" },
];

export function CaseSessionScreen() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { authHeaders } = useAuth();

  const [caseInfo, setCaseInfo] = useState<CaseInfo | null>(
    (location.state as { caseInfo?: CaseInfo } | null)?.caseInfo ?? null
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [tickedSteps, setTickedSteps] = useState<Set<number>>(new Set());
  const [checklistOpen, setChecklistOpen] = useState(true);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [diagnosis, setDiagnosis] = useState("");
  const [managementPlan, setManagementPlan] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DomainResult | null>(null);
  const [cards, setCards] = useState<unknown[]>([]);
  const [debrief, setDebrief] = useState<string | null>(null);
  const [checklistComparison, setChecklistComparison] = useState<ChecklistStepResult[]>([]);
  const [checklistReviewOpen, setChecklistReviewOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load case info if not passed via router state
  useEffect(() => {
    if (caseInfo || !caseId) return;
    fetch(`/api/cases/${caseId}`, { headers: { ...authHeaders } })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setCaseInfo)
      .catch(() => setLoadError(`Case "${caseId}" not found.`));
  }, [caseId, caseInfo, authHeaders]);

  // Load checklist for this case
  useEffect(() => {
    if (!caseId) return;
    fetch(`/api/cases/${caseId}/checklist`, { headers: { ...authHeaders } })
      .then((r) => { if (!r.ok) return null; return r.json(); })
      .then((data) => { if (data) setChecklist(data); })
      .catch(() => {});
  }, [caseId, authHeaders]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const toggleStep = (stepNum: number) => {
    setTickedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepNum)) next.delete(stepNum);
      else next.add(stepNum);
      return next;
    });
  };

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
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ messages: updated }),
      });

      if (!res.ok || !res.body) throw new Error("Stream unavailable");

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
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
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last.role === "assistant")
                  return [...prev.slice(0, -1), { role: "assistant", content: last.content + parsed.text }];
                return prev;
              });
              messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }
          } catch { /* skip malformed SSE lines */ }
        }
      }
    } catch {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        const fallback = "(I'm having trouble reaching the service right now.)";
        if (last.role === "assistant")
          return [...prev.slice(0, -1), { role: "assistant", content: fallback }];
        return [...prev, { role: "assistant", content: fallback }];
      });
    } finally {
      setSending(false);
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleSubmit = async () => {
    if (!diagnosis.trim() || !managementPlan.trim() || !caseId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          messages,
          diagnosis: diagnosis.trim(),
          management_plan: managementPlan.trim(),
          performed_steps: Array.from(tickedSteps),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResult(data.result);
      setCards(data.cards);
      setDebrief(data.debrief ?? null);
      setChecklistComparison(data.checklist_comparison ?? []);
      setShowSubmitForm(false);
    } catch {
      setSubmitError("We couldn't evaluate that. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const scoreColor = (s: number) =>
    s >= 8 ? "#4F6B3D" : s >= 5 ? "#9C7B1F" : "#8B2D2D";

  const criticalTickedCount = checklist
    ? checklist.steps.filter((s) => s.critical && tickedSteps.has(s.step_number)).length
    : 0;
  const unticked = checklist
    ? checklist.steps.filter((s) => s.critical && !tickedSteps.has(s.step_number))
    : [];

  const ChecklistPanel = ({ compact }: { compact?: boolean }) => {
    if (!checklist) return null;
    return (
      <div className={compact ? "" : "mt-6"}>
        <button
          onClick={() => setChecklistOpen((v) => !v)}
          className="w-full flex items-center justify-between mb-3 group"
        >
          <div className="flex items-center gap-2">
            <ClipboardList size={13} strokeWidth={1.5} className="text-[#8C6D3F]" />
            <p className="annotation-label" style={{ marginBottom: 0 }}>Procedure Checklist</p>
          </div>
          <div className="flex items-center gap-2">
            <span style={{
              fontSize: "0.68rem", fontWeight: 600, letterSpacing: "0.12em",
              color: criticalTickedCount === checklist.critical_count ? "#4F6B3D" : "#9C7B1F",
            }}>
              {criticalTickedCount}/{checklist.critical_count} critical
            </span>
            {checklistOpen
              ? <ChevronUp size={13} strokeWidth={1.5} className="text-[#A39A8E]" />
              : <ChevronDown size={13} strokeWidth={1.5} className="text-[#A39A8E]" />
            }
          </div>
        </button>

        <AnimatePresence initial={false}>
          {checklistOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <p
                className="text-[#5C544A] mb-3 italic-display"
                style={{ fontSize: "0.78rem", lineHeight: 1.5 }}
              >
                {checklist.procedure_name}
              </p>
              <div className="space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                {checklist.steps.map((step) => {
                  const ticked = tickedSteps.has(step.step_number);
                  return (
                    <button
                      key={step.step_number}
                      onClick={() => toggleStep(step.step_number)}
                      className="w-full flex items-start gap-2.5 text-left group/step py-1 rounded transition-colors hover:bg-[#8C6D3F]/4"
                    >
                      <span className="flex-shrink-0 mt-0.5">
                        {ticked
                          ? <CheckCircle2 size={14} strokeWidth={1.5} className="text-[#4F6B3D]" />
                          : <Circle size={14} strokeWidth={1.5} className={step.critical ? "text-[#8C6D3F]" : "text-[#C5B9AC]"} />
                        }
                      </span>
                      <span
                        className="flex-1"
                        style={{
                          fontSize: "0.78rem",
                          lineHeight: 1.5,
                          color: ticked ? "#5C544A" : step.critical ? "#1F1A12" : "#7A6E65",
                          textDecoration: ticked ? "line-through" : "none",
                          textDecorationColor: "#A39A8E",
                        }}
                      >
                        {step.critical && !ticked && (
                          <span className="text-[#8C6D3F] font-semibold mr-1" style={{ fontSize: "0.65rem", letterSpacing: "0.1em" }}>
                            ●{" "}
                          </span>
                        )}
                        {step.action}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-[#A39A8E]" style={{ fontSize: "0.68rem", lineHeight: 1.5 }}>
                Tick steps as you cover them. Critical steps (●) are marked.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  if (loadError) {
    return (
      <div className="min-h-screen bg-[#FBF8F1] flex items-center justify-center p-8">
        <div className="text-center">
          <AlertCircle size={36} strokeWidth={1.25} className="text-[#8B2D2D] mx-auto mb-5" />
          <p className="text-[#1F1A12] mb-5" style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem" }}>
            {loadError}
          </p>
          <button onClick={() => navigate("/cases")} className="text-[#8C6D3F] hover:underline text-sm">
            ← Back to cases
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen aurora-bg flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center gap-2 sm:gap-4 px-4 sm:px-8 h-16 border-b border-[#1F1A12]/8 glass-nav">
        <button
          onClick={() => navigate("/cases")}
          className="inline-flex items-center gap-2 text-[#5C544A] hover:text-[#1F1A12] transition-colors text-sm"
        >
          <ArrowLeft size={15} strokeWidth={1.5} />
          <span className="hidden sm:inline">Cases</span>
        </button>
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          aria-expanded={sidebarOpen}
          aria-controls="patient-panel"
          aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          className="md:hidden inline-flex items-center gap-1.5 text-[#5C544A] hover:text-[#1F1A12] transition-colors text-sm"
        >
          {sidebarOpen ? <XIcon size={15} strokeWidth={1.5} aria-hidden="true" /> : <Menu size={15} strokeWidth={1.5} aria-hidden="true" />}
          <span style={{ fontSize: "0.82rem" }}>Guide</span>
        </button>
        <div className="flex items-center gap-3 mx-auto">
          <HolographicEyeLogo size={26} animated={false} aria-hidden="true" />
          <span
            className="text-[#1F1A12] truncate max-w-[140px] sm:max-w-none"
            style={{ fontFamily: "var(--font-display)", fontSize: "0.98rem", fontWeight: 500, letterSpacing: "-0.005em" }}
          >
            {caseInfo ? caseInfo.title : "Loading…"}
          </span>
        </div>
        {!result && (
          <button
            onClick={() => setShowSubmitForm((v) => !v)}
            className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-full bg-[#8C6D3F]/8 border border-[#8C6D3F]/25 text-[#8C6D3F] hover:bg-[#8C6D3F]/12 transition-all flex-shrink-0"
            style={{ fontSize: "0.82rem", fontWeight: 500 }}
          >
            <CheckSquare size={13} strokeWidth={1.5} />
            <span className="hidden sm:inline">Submit answer</span>
            {showSubmitForm ? <ChevronUp size={12} strokeWidth={1.5} /> : <ChevronDown size={12} strokeWidth={1.5} />}
          </button>
        )}
      </div>

      <div className="flex flex-1 min-h-0 flex-col md:flex-row">
        {/* Mobile sidebar — full-screen overlay */}
        <AnimatePresence>
          {sidebarOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                className="md:hidden fixed inset-0 z-40 bg-[#1F1A12]/30 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setSidebarOpen(false)}
                aria-hidden="true"
              />
              {/* Panel */}
              <motion.div
                id="patient-panel"
                className="md:hidden fixed top-0 right-0 bottom-0 z-50 w-full max-w-sm bg-[#FBF8F1]/97 backdrop-blur-xl overflow-y-auto shadow-2xl"
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 280 }}
              >
                {/* Close button */}
                <div className="sticky top-0 flex items-center justify-between px-5 py-4 border-b border-[#1F1A12]/8 bg-[#FBF8F1]/95 backdrop-blur-sm">
                  <p className="annotation-label" style={{ marginBottom: 0 }}>Patient Guide</p>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    aria-label="Close patient guide"
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[#5C544A] hover:bg-[#1F1A12]/6 transition-colors"
                  >
                    <XIcon size={16} strokeWidth={1.5} />
                  </button>
                </div>
                <div className="px-5 py-5">
                  {caseInfo ? (
                    <div className="space-y-4 mb-4">
                      <div>
                        <p className="text-[#1F1A12]" style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", fontWeight: 400 }}>
                          {caseInfo.patient.name}
                        </p>
                        <p className="text-[#5C544A] mt-0.5" style={{ fontSize: "0.85rem" }}>{caseInfo.patient.age} years old</p>
                      </div>
                      <div>
                        <p className="annotation-label mb-1">Presents with</p>
                        <p className="text-[#1F1A12] italic-display" style={{ fontSize: "0.95rem", lineHeight: 1.5 }}>"{caseInfo.patient.presenting_complaint}"</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 mb-4">{[80, 60, 90].map((w, i) => (
                      <div key={i} className="h-3 rounded bg-[#1F1A12]/6 animate-pulse" style={{ width: `${w}%` }} />
                    ))}</div>
                  )}
                  <div className="border-t border-[#1F1A12]/8 pt-4">
                    <ChecklistPanel compact />
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Desktop sidebar */}
        <div className="hidden md:flex w-72 flex-shrink-0 border-r border-[#1F1A12]/8 flex-col overflow-y-auto glass-editorial rounded-none" style={{ borderRadius: 0 }}>
          <div className="p-8">
            {/* Anatomy diagram */}
            <div className="relative h-28 mb-6 overflow-hidden rounded-xl">
              <motion.img
                src="/anatomy/eye-labeled.png"
                alt=""
                aria-hidden="true"
                className="w-full h-full object-cover anatomy-hero"
                style={{ position: "relative", opacity: 0.28 }}
                animate={{ scale: [1, 1.05, 1], y: [0, -5, 0] }}
                transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white/70" />
            </div>

            <p className="annotation-label mb-5">Patient</p>
            {caseInfo ? (
              <div className="space-y-5">
                <div>
                  <p className="text-[#1F1A12]" style={{ fontFamily: "var(--font-display)", fontSize: "1.35rem", fontWeight: 400, letterSpacing: "-0.01em" }}>
                    {caseInfo.patient.name}
                  </p>
                  <p className="text-[#5C544A] mt-0.5" style={{ fontSize: "0.85rem" }}>{caseInfo.patient.age} years old</p>
                </div>
                <div>
                  <p className="annotation-label mb-2">Presents with</p>
                  <p className="text-[#1F1A12] italic-display" style={{ fontSize: "0.98rem", lineHeight: 1.55 }}>
                    "{caseInfo.patient.presenting_complaint}"
                  </p>
                </div>
                <div>
                  <p className="annotation-label mb-1">Topic</p>
                  <p className="text-[#8C6D3F]" style={{ fontSize: "0.85rem", fontWeight: 500 }}>{caseInfo.topic}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {[80, 60, 90].map((w, i) => (
                  <div key={i} className="h-3 rounded bg-[#1F1A12]/6 animate-pulse" style={{ width: `${w}%` }} />
                ))}
              </div>
            )}

            {/* Checklist panel */}
            <div className="mt-6 pt-6 border-t border-[#1F1A12]/8">
              <ChecklistPanel />
            </div>
          </div>

          <div className="mt-auto p-8 border-t border-[#1F1A12]/8">
            <p className="text-[#5C544A]" style={{ fontSize: "0.78rem", lineHeight: 1.6, fontWeight: 300 }}>
              Take a history, request examinations and investigations, then submit your diagnosis when ready.
            </p>
          </div>
        </div>

        {/* Chat + results */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Submit form panel */}
          <AnimatePresence>
            {showSubmitForm && !result && (
              <motion.div
                className="flex-shrink-0 border-b border-[#1F1A12]/8 bg-white px-4 sm:px-8 py-6"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <p className="annotation-label mb-4">Submit Answer</p>

                {/* Warn if critical steps unticked */}
                {unticked.length > 0 && (
                  <div className="mb-4 flex items-start gap-2.5 px-4 py-3 rounded-xl bg-[#9C7B1F]/6 border border-[#9C7B1F]/20">
                    <AlertTriangle size={14} strokeWidth={1.5} className="text-[#9C7B1F] flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[#9C7B1F]" style={{ fontSize: "0.82rem", fontWeight: 500, marginBottom: "0.25rem" }}>
                        {unticked.length} critical step{unticked.length > 1 ? "s" : ""} not ticked
                      </p>
                      <p className="text-[#7A6E65]" style={{ fontSize: "0.78rem", lineHeight: 1.5 }}>
                        {unticked.slice(0, 3).map((s) => s.action).join(" · ")}
                        {unticked.length > 3 ? ` · +${unticked.length - 3} more` : ""}
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-4">
                  <div>
                    <label htmlFor="case-diagnosis-input" className="block text-[#A39A8E] mb-2" style={{ fontSize: "0.72rem", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600 }}>
                      Diagnosis
                    </label>
                    <textarea
                      id="case-diagnosis-input"
                      value={diagnosis}
                      onChange={(e) => setDiagnosis(e.target.value)}
                      placeholder="State your diagnosis…"
                      rows={3}
                      className="w-full px-0 py-2 bg-transparent border-0 border-b border-[#1F1A12]/12 text-[#1F1A12] placeholder-[#A39A8E] outline-none focus:border-[#8C6D3F] resize-none transition-colors"
                      style={{ fontSize: "0.95rem", lineHeight: 1.55 }}
                    />
                  </div>
                  <div>
                    <label htmlFor="case-management-input" className="block text-[#A39A8E] mb-2" style={{ fontSize: "0.72rem", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600 }}>
                      Management plan
                    </label>
                    <textarea
                      id="case-management-input"
                      value={managementPlan}
                      onChange={(e) => setManagementPlan(e.target.value)}
                      placeholder="Outline your management plan…"
                      rows={3}
                      className="w-full px-0 py-2 bg-transparent border-0 border-b border-[#1F1A12]/12 text-[#1F1A12] placeholder-[#A39A8E] outline-none focus:border-[#8C6D3F] resize-none transition-colors"
                      style={{ fontSize: "0.95rem", lineHeight: 1.55 }}
                    />
                  </div>
                </div>
                {submitError && <p className="text-[#8B2D2D] mb-3" style={{ fontSize: "0.82rem" }}>{submitError}</p>}
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !diagnosis.trim() || !managementPlan.trim()}
                  className="px-6 py-3 rounded-full bg-[#8C6D3F] text-[#FBF8F1] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  style={{ fontSize: "0.88rem", fontWeight: 500, letterSpacing: "0.02em" }}
                >
                  {submitting ? "Evaluating…" : "Submit for evaluation"}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Results */}
          {result && (
            <motion.div
              role="region"
              aria-label="Evaluation results"
              aria-live="polite"
              className="flex-shrink-0 border-b border-[#1F1A12]/8 bg-white px-4 sm:px-8 py-6 overflow-y-auto custom-scrollbar relative"
              style={{ maxHeight: "60%" }}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <motion.img
                src="/anatomy/eye-nerve.png"
                alt="" aria-hidden="true"
                style={{
                  position: "absolute", top: "50%", right: "-4rem",
                  transform: "translateY(-50%)",
                  width: "24rem", pointerEvents: "none", opacity: 0.08,
                  filter: "sepia(0.35) saturate(0.6)", mixBlendMode: "multiply",
                }}
                animate={{ y: [0, -8, 0], scale: [1, 1.04, 1] }}
                transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="flex items-baseline justify-between mb-6">
                <p className="annotation-label">Evaluation</p>
                <span style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 400, color: scoreColor(result.total_score / 4) }}>
                  {result.total_score}<span className="text-[#A39A8E]">/40</span>
                </span>
              </div>

              {/* Checklist compliance badge */}
              {result.critical_total > 0 && (
                <div
                  className="mb-5 flex items-center gap-3 px-5 py-3 rounded-xl border"
                  style={{
                    borderColor: result.critical_hit === result.critical_total ? "rgba(79,107,61,0.25)" : "rgba(140,109,63,0.25)",
                    background: result.critical_hit === result.critical_total ? "rgba(79,107,61,0.05)" : "rgba(140,109,63,0.05)",
                  }}
                >
                  <ClipboardList size={15} strokeWidth={1.5} style={{ color: result.critical_hit === result.critical_total ? "#4F6B3D" : "#8C6D3F", flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: "0.72rem", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600, color: result.critical_hit === result.critical_total ? "#4F6B3D" : "#8C6D3F", marginBottom: "0.1rem" }}>
                      Procedure Compliance
                    </p>
                    <p style={{ fontSize: "0.85rem", color: "#1F1A12" }}>
                      {result.critical_hit}/{result.critical_total} critical steps marked
                      {result.critical_hit === result.critical_total ? " — all critical steps covered" : ` — ${result.critical_total - result.critical_hit} step${result.critical_total - result.critical_hit > 1 ? "s" : ""} missed`}
                    </p>
                  </div>
                </div>
              )}

              {/* Checklist step-by-step review */}
              {checklistComparison.length > 0 && (
                <div className="mb-5 rounded-xl border border-[#1F1A12]/8 overflow-hidden">
                  <button
                    onClick={() => setChecklistReviewOpen((v) => !v)}
                    className="w-full flex items-center justify-between px-5 py-3 bg-[#FBF8F1]/60 hover:bg-[#F5F0E8]/80 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <ClipboardList size={14} strokeWidth={1.5} className="text-[#8C6D3F]" />
                      <span className="text-[#5C544A]" style={{ fontSize: "0.78rem", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600 }}>
                        Step Review
                      </span>
                      <span className="text-[#A39A8E]" style={{ fontSize: "0.78rem" }}>
                        ({checklistComparison.filter((s) => s.performed).length}/{checklistComparison.length} steps completed)
                      </span>
                    </div>
                    {checklistReviewOpen
                      ? <ChevronUp size={14} strokeWidth={1.5} className="text-[#A39A8E]" />
                      : <ChevronDown size={14} strokeWidth={1.5} className="text-[#A39A8E]" />
                    }
                  </button>

                  {checklistReviewOpen && (
                    <div className="divide-y divide-[#1F1A12]/6 bg-[#FFFDF9]">
                      {checklistComparison.map((step) => (
                        <div key={step.step_number} className="px-5 py-3">
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 mt-0.5">
                              {step.performed
                                ? <CheckCircle2 size={15} strokeWidth={1.5} style={{ color: "#4F6B3D" }} />
                                : <Circle size={15} strokeWidth={1.5} style={{ color: step.critical ? "#8B2D2D" : "#C4BBB0" }} />
                              }
                            </div>
                            <div className="flex-1 min-w-0">
                              <p
                                style={{
                                  fontSize: "0.85rem",
                                  lineHeight: 1.5,
                                  color: step.performed ? "#1F1A12" : step.critical ? "#8B2D2D" : "#A39A8E",
                                  fontWeight: step.critical && !step.performed ? 500 : 400,
                                }}
                              >
                                {step.action}
                                {step.critical && (
                                  <span
                                    className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[0.62rem] font-semibold tracking-wide"
                                    style={{
                                      background: step.performed ? "rgba(79,107,61,0.12)" : "rgba(139,45,45,0.1)",
                                      color: step.performed ? "#4F6B3D" : "#8B2D2D",
                                    }}
                                  >
                                    critical
                                  </span>
                                )}
                              </p>
                              {!step.performed && step.clinical_note && (
                                <p className="mt-1 text-[#8C6D3F]" style={{ fontSize: "0.78rem", lineHeight: 1.5, fontStyle: "italic" }}>
                                  {step.clinical_note}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                {DOMAINS.map(({ label, scoreKey, feedbackKey }) => {
                  const score = result[scoreKey] as number;
                  return (
                    <div key={label} className="px-5 py-4 rounded-xl border border-[#1F1A12]/8 bg-[#FBF8F1]/60">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[#1F1A12]" style={{ fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 400 }}>
                          {label}
                        </p>
                        <span style={{ fontSize: "0.85rem", fontWeight: 500, color: scoreColor(score) }}>{score}/10</span>
                      </div>
                      <p className="text-[#5C544A]" style={{ fontSize: "0.82rem", lineHeight: 1.55 }}>
                        {result[feedbackKey] as string}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="px-5 py-4 rounded-xl bg-[#8C6D3F]/5 border border-[#8C6D3F]/15 mb-5">
                <p className="text-[#1F1A12]" style={{ fontSize: "0.92rem", lineHeight: 1.65 }}>{result.overall_feedback}</p>
              </div>

              {debrief && (
                <div className="px-5 py-5 rounded-xl border border-[#1F1A12]/8 bg-[#FBF8F1]/60 mb-5">
                  <p className="text-[#A39A8E] mb-3" style={{ fontSize: "0.66rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600 }}>Debrief</p>
                  <div className="text-[#1F1A12] whitespace-pre-wrap" style={{ fontSize: "0.92rem", lineHeight: 1.7 }}>
                    {debrief.split(/\*\*(.*?)\*\*/g).map((part, i) =>
                      i % 2 === 1
                        ? <strong key={i} className="text-[#1F1A12]">{part}</strong>
                        : <span key={i}>{part}</span>
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  if (cards.length > 0) sessionStorage.setItem("eyebot_session_cards", JSON.stringify(cards));
                  navigate("/flashcards");
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#1F1A12] text-[#FBF8F1] hover:bg-[#3A3024] transition-all"
                style={{ fontSize: "0.88rem", fontWeight: 500, letterSpacing: "0.02em" }}
              >
                <Layers size={14} strokeWidth={1.5} />
                Generate flashcards ({cards.length})
              </button>
            </motion.div>
          )}

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6 custom-scrollbar">
            {messages.length === 0 && !sending && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-sm">
                  <p className="text-[#1F1A12] italic-display mb-2" style={{ fontSize: "1.15rem" }}>
                    Introduce yourself and begin the history.
                  </p>
                  <p className="text-[#A39A8E]" style={{ fontSize: "0.85rem" }}>
                    Press Enter to send · Shift + Enter for a new line
                  </p>
                </div>
              </div>
            )}
            {messages.map((m, i) => {
              const isLastAssistant = isStreaming && i === messages.length - 1 && m.role === "assistant";
              return (
                <motion.div
                  key={i}
                  className="flex gap-4 items-start"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="flex-shrink-0 mt-1">
                    {m.role === "user" ? (
                      <div className="w-7 h-7 rounded-full bg-[#8C6D3F]/12 flex items-center justify-center">
                        <User size={13} strokeWidth={1.5} className="text-[#8C6D3F]" />
                      </div>
                    ) : (
                      <HolographicEyeLogo size={26} animated={isLastAssistant} />
                    )}
                  </div>
                  <div className="flex-1 max-w-[680px]">
                    <p className="text-[#A39A8E] mb-1" style={{ fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600 }}>
                      {m.role === "user" ? "You" : "Patient"}
                    </p>
                    <p
                      className={m.role === "user" ? "text-[#5C544A]" : "text-[#1F1A12]"}
                      style={{
                        fontFamily: m.role === "user" ? "var(--font-body)" : "var(--font-display)",
                        fontSize: m.role === "user" ? "1rem" : "1.05rem",
                        lineHeight: 1.65,
                      }}
                    >
                      {m.content}
                      {isLastAssistant && (
                        <span className="inline-block w-[2px] h-[1.05em] bg-[#8C6D3F] ml-0.5 align-[-0.15em] animate-pulse" aria-hidden="true" />
                      )}
                    </p>
                  </div>
                </motion.div>
              );
            })}
            {sending && (
              <div className="flex gap-4 items-center" role="status" aria-label="Patient is responding">
                <HolographicEyeLogo size={26} animated={true} aria-hidden="true" />
                <div className="flex gap-1 items-center" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-[#8C6D3F]/60"
                      animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18 }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          {!result && (
            <div className="flex-shrink-0 border-t border-[#1F1A12]/8 px-4 sm:px-8 py-4 sm:py-6 bg-[#FBF8F1]">
              <div className="flex gap-3 items-end max-w-3xl mx-auto">
                <div
                  className="flex-1 bg-white border border-[#1F1A12]/10 rounded-2xl overflow-hidden focus-within:border-[#8C6D3F]/40 transition-all"
                  style={{ boxShadow: "0 1px 2px rgba(31,26,18,0.04)" }}
                >
                  <label htmlFor="case-chat-input" className="sr-only">Ask the patient a question</label>
                  <textarea
                    id="case-chat-input"
                    ref={inputRef}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask the patient a question…"
                    rows={1}
                    className="w-full px-5 py-3 bg-transparent text-[#1F1A12] placeholder-[#A39A8E] outline-none resize-none"
                    style={{ fontSize: "0.95rem", lineHeight: 1.55, minHeight: "48px", maxHeight: "120px" }}
                  />
                </div>
                <motion.button
                  onClick={sendMessage}
                  disabled={!input.trim() || sending || isStreaming}
                  aria-label="Send question"
                  className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                    input.trim() && !sending && !isStreaming
                      ? "bg-[#8C6D3F] text-[#FBF8F1]"
                      : "bg-[#1F1A12]/5 text-[#A39A8E] cursor-not-allowed"
                  }`}
                  whileHover={input.trim() && !sending && !isStreaming ? { scale: 1.05 } : undefined}
                  whileTap={input.trim() && !sending && !isStreaming ? { scale: 0.95 } : undefined}
                >
                  <Send size={15} strokeWidth={1.5} aria-hidden="true" />
                </motion.button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
