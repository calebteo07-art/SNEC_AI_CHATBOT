import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { HolographicEyeLogo } from "./HolographicEyeLogo";
import {
  Send, User, ArrowLeft, CheckSquare, AlertCircle,
  Layers, ChevronDown, ChevronUp,
} from "lucide-react";

interface CaseInfo {
  case_id: string;
  title: string;
  difficulty: string;
  topic: string;
  estimated_minutes: number;
  patient: { name: string; age: number; presenting_complaint: string };
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

  const [caseInfo, setCaseInfo] = useState<CaseInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [diagnosis, setDiagnosis] = useState("");
  const [managementPlan, setManagementPlan] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DomainResult | null>(null);
  const [cards, setCards] = useState<unknown[]>([]);
  const [debrief, setDebrief] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!caseId) return;
    fetch("/api/cases")
      .then((r) => r.json())
      .then((data) => {
        const found = data.cases.find((c: CaseInfo) => c.case_id === caseId);
        if (found) setCaseInfo(found);
        else setLoadError(`Case "${caseId}" not found.`);
      })
      .catch(() => setLoadError("Could not load case."));
  }, [caseId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const sendMessage = async () => {
    if (!input.trim() || sending || !caseId) return;
    const content = input.trim();
    const newMsg: ChatMessage = { role: "user", content };
    const updated = [...messages, newMsg];

    setMessages(updated);
    setInput("");
    setSending(true);

    const studentId = sessionStorage.getItem("eyeq_student_id") || "anonymous";
    try {
      const res = await fetch(`/api/cases/${caseId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: studentId, messages: updated }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "(I'm having trouble reaching the service right now.)" },
      ]);
    } finally {
      setSending(false);
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

    const studentId = sessionStorage.getItem("eyeq_student_id") || "anonymous";
    try {
      const res = await fetch(`/api/cases/${caseId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: studentId,
          messages,
          diagnosis: diagnosis.trim(),
          management_plan: managementPlan.trim(),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResult(data.result);
      setCards(data.cards);
      setDebrief(data.debrief ?? null);
      setShowSubmitForm(false);
    } catch {
      setSubmitError("We couldn't evaluate that. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const scoreColor = (s: number) =>
    s >= 8 ? "#4F6B3D" : s >= 5 ? "#9C7B1F" : "#8B2D2D";

  if (loadError) {
    return (
      <div className="min-h-screen bg-[#FBF8F1] flex items-center justify-center p-8">
        <div className="text-center">
          <AlertCircle size={36} strokeWidth={1.25} className="text-[#8B2D2D] mx-auto mb-5" />
          <p className="text-[#1F1A12] mb-5" style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem" }}>
            {loadError}
          </p>
          <button
            onClick={() => navigate("/cases")}
            className="text-[#8C6D3F] hover:underline text-sm"
          >
            ← Back to cases
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#FBF8F1] flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center gap-4 px-8 h-16 border-b border-[#1F1A12]/8 bg-[#FBF8F1]/80 backdrop-blur-sm">
        <button
          onClick={() => navigate("/cases")}
          className="inline-flex items-center gap-2 text-[#5C544A] hover:text-[#1F1A12] transition-colors text-sm"
        >
          <ArrowLeft size={15} strokeWidth={1.5} />
          Cases
        </button>
        <div className="flex items-center gap-3 mx-auto">
          <HolographicEyeLogo size={26} animated={false} />
          <span
            className="text-[#1F1A12]"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "0.98rem",
              fontWeight: 500,
              letterSpacing: "-0.005em",
            }}
          >
            {caseInfo ? caseInfo.title : "Loading…"}
          </span>
        </div>
        {!result && (
          <button
            onClick={() => setShowSubmitForm((v) => !v)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#8C6D3F]/8 border border-[#8C6D3F]/25 text-[#8C6D3F] hover:bg-[#8C6D3F]/12 transition-all"
            style={{ fontSize: "0.82rem", fontWeight: 500 }}
          >
            <CheckSquare size={13} strokeWidth={1.5} />
            Submit answer
            {showSubmitForm ? <ChevronUp size={12} strokeWidth={1.5} /> : <ChevronDown size={12} strokeWidth={1.5} />}
          </button>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Patient sidebar */}
        <div className="w-72 flex-shrink-0 border-r border-[#1F1A12]/8 flex flex-col overflow-y-auto bg-white/40">
          <div className="p-8">
            <p
              className="text-[#8C6D3F] mb-5"
              style={{ fontSize: "0.7rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 600 }}
            >
              · Patient
            </p>
            {caseInfo ? (
              <div className="space-y-5">
                <div>
                  <p
                    className="text-[#1F1A12]"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "1.35rem",
                      fontWeight: 400,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {caseInfo.patient.name}
                  </p>
                  <p className="text-[#5C544A] mt-0.5" style={{ fontSize: "0.85rem" }}>
                    {caseInfo.patient.age} years old
                  </p>
                </div>
                <div>
                  <p
                    className="text-[#A39A8E] mb-2"
                    style={{ fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600 }}
                  >
                    Presents with
                  </p>
                  <p
                    className="text-[#1F1A12] italic-display"
                    style={{ fontSize: "0.98rem", lineHeight: 1.55 }}
                  >
                    "{caseInfo.patient.presenting_complaint}"
                  </p>
                </div>
                <div>
                  <p
                    className="text-[#A39A8E] mb-1"
                    style={{ fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600 }}
                  >
                    Topic
                  </p>
                  <p className="text-[#8C6D3F]" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                    {caseInfo.topic}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {[80, 60, 90].map((w, i) => (
                  <div key={i} className="h-3 rounded bg-[#1F1A12]/6 animate-pulse" style={{ width: `${w}%` }} />
                ))}
              </div>
            )}
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
                className="flex-shrink-0 border-b border-[#1F1A12]/8 bg-white px-8 py-6"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <p
                  className="text-[#8C6D3F] mb-4"
                  style={{ fontSize: "0.7rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 600 }}
                >
                  · Submit answer
                </p>
                <div className="grid grid-cols-2 gap-6 mb-4">
                  <div>
                    <label
                      className="block text-[#A39A8E] mb-2"
                      style={{ fontSize: "0.72rem", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600 }}
                    >
                      Diagnosis
                    </label>
                    <textarea
                      value={diagnosis}
                      onChange={(e) => setDiagnosis(e.target.value)}
                      placeholder="State your diagnosis…"
                      rows={3}
                      className="w-full px-0 py-2 bg-transparent border-0 border-b border-[#1F1A12]/12 text-[#1F1A12] placeholder-[#A39A8E] outline-none focus:border-[#8C6D3F] resize-none transition-colors"
                      style={{ fontSize: "0.95rem", lineHeight: 1.55 }}
                    />
                  </div>
                  <div>
                    <label
                      className="block text-[#A39A8E] mb-2"
                      style={{ fontSize: "0.72rem", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600 }}
                    >
                      Management plan
                    </label>
                    <textarea
                      value={managementPlan}
                      onChange={(e) => setManagementPlan(e.target.value)}
                      placeholder="Outline your management plan…"
                      rows={3}
                      className="w-full px-0 py-2 bg-transparent border-0 border-b border-[#1F1A12]/12 text-[#1F1A12] placeholder-[#A39A8E] outline-none focus:border-[#8C6D3F] resize-none transition-colors"
                      style={{ fontSize: "0.95rem", lineHeight: 1.55 }}
                    />
                  </div>
                </div>
                {submitError && (
                  <p className="text-[#8B2D2D] mb-3" style={{ fontSize: "0.82rem" }}>{submitError}</p>
                )}
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
              className="flex-shrink-0 border-b border-[#1F1A12]/8 bg-white px-8 py-6 overflow-y-auto custom-scrollbar"
              style={{ maxHeight: "55%" }}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-baseline justify-between mb-6">
                <p
                  className="text-[#8C6D3F]"
                  style={{ fontSize: "0.7rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 600 }}
                >
                  · Evaluation
                </p>
                <span
                  style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 400, color: scoreColor(result.total_score / 4) }}
                >
                  {result.total_score}
                  <span className="text-[#A39A8E]">/40</span>
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-5">
                {DOMAINS.map(({ label, scoreKey, feedbackKey }) => {
                  const score = result[scoreKey] as number;
                  return (
                    <div
                      key={label}
                      className="px-5 py-4 rounded-xl border border-[#1F1A12]/8 bg-[#FBF8F1]/60"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p
                          className="text-[#1F1A12]"
                          style={{ fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 400 }}
                        >
                          {label}
                        </p>
                        <span style={{ fontSize: "0.85rem", fontWeight: 500, color: scoreColor(score) }}>
                          {score}/10
                        </span>
                      </div>
                      <p className="text-[#5C544A]" style={{ fontSize: "0.82rem", lineHeight: 1.55 }}>
                        {result[feedbackKey] as string}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="px-5 py-4 rounded-xl bg-[#8C6D3F]/5 border border-[#8C6D3F]/15 mb-5">
                <p className="text-[#1F1A12]" style={{ fontSize: "0.92rem", lineHeight: 1.65 }}>
                  {result.overall_feedback}
                </p>
              </div>

              {debrief && (
                <div className="px-5 py-5 rounded-xl border border-[#1F1A12]/8 bg-[#FBF8F1]/60 mb-5">
                  <p
                    className="text-[#A39A8E] mb-3"
                    style={{ fontSize: "0.66rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600 }}
                  >
                    Debrief
                  </p>
                  <div
                    className="text-[#1F1A12] whitespace-pre-wrap"
                    style={{ fontSize: "0.92rem", lineHeight: 1.7 }}
                  >
                    {debrief.split(/\*\*(.*?)\*\*/g).map((part, i) =>
                      i % 2 === 1 ? (
                        <strong key={i} className="text-[#1F1A12]">{part}</strong>
                      ) : (
                        <span key={i}>{part}</span>
                      )
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  if (cards.length > 0) {
                    sessionStorage.setItem("eyeq_session_cards", JSON.stringify(cards));
                  }
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
          <div className="flex-1 overflow-y-auto px-8 py-8 space-y-6 custom-scrollbar">
            {messages.length === 0 && !sending && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-sm">
                  <p
                    className="text-[#1F1A12] italic-display mb-2"
                    style={{ fontSize: "1.15rem" }}
                  >
                    Introduce yourself and begin the history.
                  </p>
                  <p className="text-[#A39A8E]" style={{ fontSize: "0.85rem" }}>
                    Press Enter to send · Shift + Enter for a new line
                  </p>
                </div>
              </div>
            )}

            {messages.map((m, i) => (
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
                    <HolographicEyeLogo size={26} animated={false} />
                  )}
                </div>
                <div className="flex-1 max-w-[680px]">
                  <p
                    className="text-[#A39A8E] mb-1"
                    style={{ fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600 }}
                  >
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
                  </p>
                </div>
              </motion.div>
            ))}

            {sending && (
              <div className="flex gap-4 items-center">
                <HolographicEyeLogo size={26} animated={true} />
                <div className="flex gap-1 items-center">
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
            <div className="flex-shrink-0 border-t border-[#1F1A12]/8 px-8 py-6 bg-[#FBF8F1]">
              <div className="flex gap-3 items-end max-w-3xl mx-auto">
                <div className="flex-1 bg-white border border-[#1F1A12]/10 rounded-2xl overflow-hidden focus-within:border-[#8C6D3F]/40 transition-all"
                  style={{ boxShadow: "0 1px 2px rgba(31,26,18,0.04)" }}
                >
                  <textarea
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
                  disabled={!input.trim() || sending}
                  className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                    input.trim() && !sending
                      ? "bg-[#8C6D3F] text-[#FBF8F1]"
                      : "bg-[#1F1A12]/5 text-[#A39A8E] cursor-not-allowed"
                  }`}
                  whileHover={input.trim() && !sending ? { scale: 1.05 } : undefined}
                  whileTap={input.trim() && !sending ? { scale: 0.95 } : undefined}
                >
                  <Send size={15} strokeWidth={1.5} />
                </motion.button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
