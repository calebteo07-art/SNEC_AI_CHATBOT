"use client";

import React, { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";

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

const DOMAINS = [
  { label: "History", scoreKey: "history_score" as keyof DomainResult, feedbackKey: "history_feedback" as keyof DomainResult },
  { label: "Investigations", scoreKey: "investigations_score" as keyof DomainResult, feedbackKey: "investigations_feedback" as keyof DomainResult },
  { label: "Diagnosis", scoreKey: "diagnosis_score" as keyof DomainResult, feedbackKey: "diagnosis_feedback" as keyof DomainResult },
  { label: "Management", scoreKey: "management_score" as keyof DomainResult, feedbackKey: "management_feedback" as keyof DomainResult },
];

const scoreColor = (s: number) => s >= 8 ? "#22c55e" : s >= 5 ? "#f59e0b" : "#ef4444";

function CaseSessionInner() {
  const searchParams = useSearchParams();
  const caseId = searchParams.get("id") ?? "";
  const router = useRouter();

  const [caseInfo, setCaseInfo] = useState<CaseInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [tickedSteps, setTickedSteps] = useState<Set<number>>(new Set());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [diagnosis, setDiagnosis] = useState("");
  const [managementPlan, setManagementPlan] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DomainResult | null>(null);
  const [debrief, setDebrief] = useState<string | null>(null);
  const [checklistComparison, setChecklistComparison] = useState<ChecklistStepResult[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showRight, setShowRight] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!caseId) return;
    fetch(`/api/cases/${caseId}`, { credentials: "include" })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setCaseInfo)
      .catch(() => setLoadError(`Case "${caseId}" not found.`));
  }, [caseId]);

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

  const handleSubmit = async () => {
    if (!diagnosis.trim() || !managementPlan.trim() || !caseId) return;
    setSubmitting(true); setSubmitError(null);
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
    } catch { setSubmitError("Could not evaluate. Please try again."); }
    finally { setSubmitting(false); }
  };

  const criticalTicked = checklist ? checklist.steps.filter(s => s.critical && tickedSteps.has(s.step_number)).length : 0;

  if (loadError) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] flex-col gap-4">
        <p className="text-[#F4EFE7]/50 text-sm">{loadError}</p>
        <button onClick={() => router.push("/cases")} className="text-[#F4EFE7]/60 text-sm font-semibold hover:text-[#F4EFE7] transition-colors">← Back to cases</button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-4">
      {/* HUD */}
      {caseInfo && (
        <div className="flex flex-wrap items-center gap-4 mb-4 pb-4 border-b border-[#F4EFE7]/10">
          <div>
            <div className="text-[#F4EFE7]/30 text-[9px] uppercase tracking-[0.14em] font-semibold">Patient</div>
            <div className="text-[#F4EFE7] text-sm font-semibold">{caseInfo.patient.name}</div>
          </div>
          <div>
            <div className="text-[#F4EFE7]/30 text-[9px] uppercase tracking-[0.14em] font-semibold">Age</div>
            <div className="text-[#F4EFE7] text-sm font-semibold">{caseInfo.patient.age} yr</div>
          </div>
          <div>
            <div className="text-[#F4EFE7]/30 text-[9px] uppercase tracking-[0.14em] font-semibold">Topic</div>
            <div className="text-[#F4EFE7] text-sm font-semibold">{caseInfo.topic}</div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[#F4EFE7]/30 text-[9px] uppercase tracking-[0.14em] font-semibold">Chief Complaint</div>
            <div className="text-[#F4EFE7]/70 text-xs italic truncate">&quot;{caseInfo.patient.presenting_complaint}&quot;</div>
          </div>
          <div className="ml-auto">
            <button
              onClick={() => setShowRight(v => !v)}
              className="bg-[#F4EFE7]/10 border border-[#F4EFE7]/15 rounded-full px-3 py-1 text-xs text-[#F4EFE7]/60 hover:bg-[#F4EFE7]/15 transition-colors"
            >
              {showRight ? "Hide panel" : "Assessment"}
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-4" style={{ height: "calc(100vh - 260px)", minHeight: 400 }}>
        {/* Left panel */}
        <div
          className="rounded-[24px] overflow-hidden flex flex-col shrink-0"
          style={{ width: 220, background: "rgba(244,239,231,0.04)", border: "1px solid rgba(244,239,231,0.08)" }}
        >
          {/* Anatomy banner */}
          <div className="relative h-24 shrink-0 overflow-hidden">
            <Image src="/images/eye-anterior.png" alt="" fill sizes="220px" className="object-cover opacity-60" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#181717]/85 to-transparent flex items-end p-3">
              <span className="text-[#F4EFE7]/70 text-[9px] uppercase tracking-[0.14em] font-semibold">Patient Guide</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {caseInfo ? (
              <div className="mb-3">
                <div className="text-[#F4EFE7] text-sm font-semibold">{caseInfo.patient.name}</div>
                <div className="text-[#F4EFE7]/40 text-xs mt-0.5">{caseInfo.patient.age} yrs · {caseInfo.topic}</div>
                <div className="mt-2 p-2 rounded-[10px] bg-blue-500/10 border-l-2 border-blue-400">
                  <div className="text-blue-400 text-[9px] uppercase tracking-[0.1em] font-semibold mb-1">Presenting complaint</div>
                  <p className="text-[#F4EFE7]/60 text-xs italic">&quot;{caseInfo.patient.presenting_complaint}&quot;</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 mb-3">
                {[80, 60, 90].map((w, i) => (
                  <div key={i} className="h-3 rounded-full bg-[#F4EFE7]/10 animate-pulse" style={{ width: `${w}%` }} />
                ))}
              </div>
            )}

            {checklist && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[#F4EFE7]/30 text-[9px] uppercase tracking-[0.14em] font-semibold">Checklist</span>
                  <span className="text-[10px] font-semibold" style={{ color: criticalTicked === checklist.critical_count ? "#22c55e" : "#f59e0b" }}>
                    {criticalTicked}/{checklist.critical_count}
                  </span>
                </div>
                <div className="space-y-0.5 max-h-48 overflow-y-auto">
                  {checklist.steps.map(step => {
                    const ticked = tickedSteps.has(step.step_number);
                    return (
                      <button
                        key={step.step_number}
                        onClick={() => toggleStep(step.step_number)}
                        className="flex items-start gap-2 w-full text-left py-1"
                      >
                        <span className="text-sm shrink-0 mt-px" style={{ color: ticked ? "#22c55e" : step.critical ? "#60a5fa" : "rgba(244,239,231,0.25)" }}>
                          {ticked ? "✓" : step.critical ? "●" : "○"}
                        </span>
                        <span className="text-xs leading-snug" style={{ color: ticked ? "rgba(244,239,231,0.3)" : "rgba(244,239,231,0.7)", textDecoration: ticked ? "line-through" : "none" }}>
                          {step.action}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Chat column */}
        <div className="flex-1 flex flex-col min-w-0 rounded-[24px] overflow-hidden" style={{ background: "rgba(244,239,231,0.03)", border: "1px solid rgba(244,239,231,0.07)" }}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && !result && (
              <div className="text-center pt-10 text-[#F4EFE7]/25 text-sm">
                Start by greeting your patient and taking a history.
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className="max-w-[80%]"
                style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", display: "flex", flexDirection: "column", marginLeft: m.role === "user" ? "auto" : 0 }}
              >
                <div className="text-[#F4EFE7]/25 text-[9px] uppercase tracking-[0.1em] font-semibold mb-1" style={{ textAlign: m.role === "user" ? "right" : "left" }}>
                  {m.role === "user" ? "You" : caseInfo?.patient.name ?? "Patient"}
                </div>
                <div
                  className="rounded-[16px] px-3.5 py-2.5 text-sm leading-relaxed"
                  style={{
                    background: m.role === "user" ? "#F4EFE7" : "rgba(244,239,231,0.07)",
                    color: m.role === "user" ? "#181717" : "#F4EFE7",
                    border: m.role === "user" ? "none" : "1px solid rgba(244,239,231,0.1)",
                    borderBottomRightRadius: m.role === "user" ? 4 : 16,
                    borderBottomLeftRadius: m.role === "assistant" ? 4 : 16,
                  }}
                >
                  {m.content}
                  {isStreaming && i === messages.length - 1 && m.role === "assistant" && (
                    <span className="inline-block w-0.5 h-4 bg-blue-400 ml-0.5 animate-pulse align-[-2px]" />
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex">
                <div className="bg-[#F4EFE7]/7 border border-[#F4EFE7]/10 rounded-[16px] px-3.5 py-2.5">
                  <span className="w-3 h-3 border border-[#F4EFE7]/20 border-t-[#F4EFE7]/60 rounded-full animate-spin block" />
                </div>
              </div>
            )}

            {/* Results card */}
            {result && (
              <div className="rounded-[20px] p-5 mt-4" style={{ background: "rgba(244,239,231,0.06)", border: "1px solid rgba(244,239,231,0.12)" }}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[#F4EFE7] text-lg font-semibold tracking-[-0.02em]">Case Complete</h2>
                  <div className="text-3xl font-medium tracking-[-0.03em]" style={{ color: scoreColor(result.total_score) }}>
                    {result.total_score}<span className="text-sm text-[#F4EFE7]/25">/10</span>
                  </div>
                </div>
                {DOMAINS.map(d => (
                  <div key={d.label} className="mb-3.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[#F4EFE7]/70 text-xs font-semibold">{d.label}</span>
                      <span className="text-xs font-bold" style={{ color: scoreColor(result[d.scoreKey] as number) }}>{result[d.scoreKey] as number}/10</span>
                    </div>
                    <div className="h-1 bg-[#F4EFE7]/10 rounded-full overflow-hidden mb-1.5">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${((result[d.scoreKey] as number) / 10) * 100}%`, background: scoreColor(result[d.scoreKey] as number) }} />
                    </div>
                    <p className="text-[#F4EFE7]/45 text-xs leading-relaxed">{result[d.feedbackKey] as string}</p>
                  </div>
                ))}
                {debrief && (
                  <div className="mt-4 p-3 rounded-[12px] bg-blue-500/10 border-l-2 border-blue-400">
                    <p className="text-blue-400 text-[9px] uppercase tracking-[0.12em] font-semibold mb-1.5">Overall Feedback</p>
                    <p className="text-[#F4EFE7]/70 text-xs leading-relaxed">{debrief}</p>
                  </div>
                )}
                {checklistComparison.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[#F4EFE7]/25 text-[9px] uppercase tracking-[0.14em] font-semibold mb-2">Checklist Review</p>
                    {checklistComparison.map(step => (
                      <div key={step.step_number} className="flex items-start gap-2 mb-1.5">
                        <span style={{ color: step.performed ? "#22c55e" : step.critical ? "#ef4444" : "rgba(244,239,231,0.2)" }} className="text-sm">
                          {step.performed ? "✓" : "✗"}
                        </span>
                        <span className="text-xs" style={{ color: step.performed ? "rgba(244,239,231,0.7)" : "rgba(244,239,231,0.3)" }}>{step.action}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 mt-5">
                  <button onClick={() => router.push("/cases")} className="flex-1 py-2.5 rounded-full border border-[#F4EFE7]/15 text-[#F4EFE7]/50 text-xs font-semibold hover:border-[#F4EFE7]/30 transition-colors">
                    More cases
                  </button>
                  <button onClick={() => router.push("/dashboard")} className="flex-1 py-2.5 rounded-full bg-[#F4EFE7] text-[#181717] text-xs font-semibold hover:bg-white transition-colors">
                    Back to Learn
                  </button>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          {!result && (
            <div className="p-3 border-t border-[#F4EFE7]/8 flex gap-2 items-end">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Talk to your patient…"
                rows={1}
                className="flex-1 bg-[#F4EFE7]/7 border border-[#F4EFE7]/10 rounded-[14px] px-4 py-2.5 text-[#F4EFE7] text-sm placeholder:text-[#F4EFE7]/25 outline-none focus:border-[#F4EFE7]/20 resize-none transition-colors leading-relaxed"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || sending || isStreaming}
                className="w-10 h-10 rounded-full bg-[#F4EFE7] flex items-center justify-center shrink-0 hover:bg-white transition-colors disabled:opacity-40"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M2 14L14 8L2 2V6.5L10 8L2 9.5V14Z" fill="#181717" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Right panel — assessment */}
        {showRight && !result && (
          <div
            className="rounded-[24px] overflow-hidden flex flex-col shrink-0 p-4 space-y-3"
            style={{ width: 200, background: "rgba(244,239,231,0.04)", border: "1px solid rgba(244,239,231,0.08)" }}
          >
            <div>
              <label className="text-[#F4EFE7]/30 text-[9px] uppercase tracking-[0.12em] font-semibold block mb-1.5">Diagnosis</label>
              <textarea
                value={diagnosis}
                onChange={e => setDiagnosis(e.target.value)}
                placeholder="Primary diagnosis…"
                rows={4}
                className="w-full bg-[#F4EFE7]/5 border border-[#F4EFE7]/10 rounded-[10px] px-2.5 py-2 text-[#F4EFE7] text-xs resize-none outline-none focus:border-[#F4EFE7]/20 transition-colors leading-relaxed"
              />
            </div>
            <div>
              <label className="text-[#F4EFE7]/30 text-[9px] uppercase tracking-[0.12em] font-semibold block mb-1.5">Management</label>
              <textarea
                value={managementPlan}
                onChange={e => setManagementPlan(e.target.value)}
                placeholder="Proposed management…"
                rows={4}
                className="w-full bg-[#F4EFE7]/5 border border-[#F4EFE7]/10 rounded-[10px] px-2.5 py-2 text-[#F4EFE7] text-xs resize-none outline-none focus:border-[#F4EFE7]/20 transition-colors leading-relaxed"
              />
            </div>
            {submitError && <p className="text-red-400 text-xs">{submitError}</p>}
            <button
              onClick={handleSubmit}
              disabled={submitting || !diagnosis.trim() || !managementPlan.trim()}
              className="w-full py-2.5 rounded-full bg-[#22c55e] text-[#181717] text-xs font-bold uppercase tracking-wide hover:brightness-110 transition-all disabled:opacity-40"
            >
              {submitting ? "Evaluating…" : "Submit →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CaseSessionPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-[#F4EFE7]/40 text-sm">Loading case…</div>}>
      <CaseSessionInner />
    </Suspense>
  );
}
