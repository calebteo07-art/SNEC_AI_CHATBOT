"use client";
/* AURORA Case Session — the virtual-patient simulation. Two-pane: a dark imagery
   column (plate + patient + procedure checklist) and an interaction column (the
   patient interview thread + diagnosis/management submit + scored debrief). The
   SSE streaming, submit and scoring logic are preserved from the legacy screen;
   only the presentation is AURORA. */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { PlateWell } from "@/aurora/components/PlateWell";
import { PLATE } from "@/aurora/media";
import { ProgressBar } from "@/aurora/components/ProgressBar";

interface CaseInfo {
  case_id: string; title: string; difficulty: string; topic: string; estimated_minutes: number;
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
  { label: "History", scoreKey: "history_score", feedbackKey: "history_feedback" },
  { label: "Investigations", scoreKey: "investigations_score", feedbackKey: "investigations_feedback" },
  { label: "Diagnosis", scoreKey: "diagnosis_score", feedbackKey: "diagnosis_feedback" },
  { label: "Management", scoreKey: "management_score", feedbackKey: "management_feedback" },
];

export function CaseSession() {
  const caseId = useParams().caseId as string;
  const router = useRouter();

  const [caseInfo, setCaseInfo] = useState<CaseInfo | null>(() => {
    try {
      const handoff = sessionStorage.getItem("eyebot_case_handoff");
      if (!handoff) return null;
      const parsed = JSON.parse(handoff) as CaseInfo;
      return parsed.case_id === caseId ? parsed : null;
    } catch { return null; }
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [tickedSteps, setTickedSteps] = useState<Set<number>>(new Set());

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const [showSubmit, setShowSubmit] = useState(false);
  const [diagnosis, setDiagnosis] = useState("");
  const [managementPlan, setManagementPlan] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DomainResult | null>(null);
  const [debrief, setDebrief] = useState<string | null>(null);
  const [checklistComparison, setChecklistComparison] = useState<ChecklistStepResult[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (caseInfo || !caseId) return;
    fetch(`/api/cases/${caseId}`, { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setCaseInfo)
      .catch(() => setLoadError(`Case "${caseId}" not found.`));
  }, [caseId, caseInfo]);

  useEffect(() => {
    if (!caseId) return;
    fetch(`/api/cases/${caseId}/checklist`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        // tolerate both the flat shape and a { checklist: {...} } envelope
        const c = d?.checklist ?? d;
        if (c && Array.isArray(c.steps)) setChecklist(c);
      })
      .catch(() => {});
  }, [caseId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);

  const toggleStep = (n: number) => setTickedSteps((prev) => {
    const next = new Set(prev);
    if (next.has(n)) next.delete(n); else next.add(n);
    return next;
  });

  const sendMessage = async () => {
    if (!input.trim() || sending || isStreaming || !caseId) return;
    const content = input.trim();
    const updated = [...messages, { role: "user", content } as ChatMessage];
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
              endRef.current?.scrollIntoView({ behavior: "smooth" });
            }
          } catch { /* skip */ }
        }
      }
    } catch {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        const fb = "(I'm having trouble reaching the service right now.)";
        if (last && last.role === "assistant") return [...prev.slice(0, -1), { role: "assistant", content: fb }];
        return [...prev, { role: "assistant", content: fb }];
      });
    } finally { setSending(false); setIsStreaming(false); }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); }
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
      setShowSubmit(false);
    } catch { setSubmitError("Could not evaluate. Please try again."); }
    finally { setSubmitting(false); }
  };

  const criticalTicked = checklist ? checklist.steps.filter((s) => s.critical && tickedSteps.has(s.step_number)).length : 0;
  const criticalCount = checklist ? (checklist.critical_count ?? checklist.steps.filter((s) => s.critical).length) : 0;
  const unticked = checklist ? checklist.steps.filter((s) => s.critical && !tickedSteps.has(s.step_number)) : [];

  if (loadError) {
    return (
      <div className="aurora-session-error">
        <p>{loadError}</p>
        <button type="button" onClick={() => router.push("/cases")}>← Back to cases</button>
      </div>
    );
  }

  return (
    <div className="aurora-session">
      <header className="aurora-session-head">
        <button type="button" className="aurora-session-back" onClick={() => router.push("/cases")}>← Cases</button>
        {caseInfo && (
          <div className="aurora-session-hud">
            <span><b>{caseInfo.patient.name}</b> · {caseInfo.patient.age} yr</span>
            <span className="aurora-session-hud-sep">·</span>
            <span>{caseInfo.topic}</span>
            <span className="aurora-session-hud-sep">·</span>
            <span className="aurora-session-tier">{caseInfo.difficulty}</span>
            <span className="aurora-session-hud-sep">·</span>
            <span className="aurora-session-cc">“{caseInfo.patient.presenting_complaint}”</span>
          </div>
        )}
      </header>

      <div className="aurora-session-body">
        {/* Imagery + patient + checklist */}
        <aside className="aurora-session-aside">
          <PlateWell src={PLATE.caseSession} alt={`${caseInfo?.topic ?? "Eye"} reference plate`} ratio={1.5} />
          {caseInfo && (
            <div className="aurora-session-patient">
              <h1 className="aurora-session-patient-name">{caseInfo.patient.name}</h1>
              <p className="aurora-session-patient-meta">{caseInfo.patient.age} years · {caseInfo.topic}</p>
              <div className="aurora-session-cc-box">
                <p className="aurora-eyebrow">Presenting complaint</p>
                <p>“{caseInfo.patient.presenting_complaint}”</p>
              </div>
            </div>
          )}
          {checklist && (
            <div className="aurora-session-checklist">
              <div className="aurora-session-checklist-head">
                <span className="aurora-eyebrow">Procedure checklist</span>
                <span className="aurora-session-crit">{criticalTicked}/{criticalCount} critical</span>
              </div>
              <div className="aurora-session-steps">
                {checklist.steps.map((step, idx) => {
                  const ticked = tickedSteps.has(step.step_number);
                  return (
                    <button key={step.step_number ?? idx} type="button" className="aurora-session-step" data-ticked={ticked} onClick={() => toggleStep(step.step_number)}>
                      <span className="aurora-session-step-mark">{ticked ? "✓" : step.critical ? "●" : "○"}</span>
                      <span>{step.action}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {!result && (
            <button type="button" className="aurora-session-submit-toggle" onClick={() => setShowSubmit((v) => !v)}>
              {showSubmit ? "Cancel" : "Submit answer"}
            </button>
          )}
        </aside>

        {/* Interaction column */}
        <div className="aurora-session-main">
          <div className="aurora-session-thread">
            {messages.length === 0 && !result && (
              <p className="aurora-muted aurora-session-hint">Greet your patient and begin taking a history.</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`aurora-bubble ${m.role === "user" ? "is-user" : "is-patient"}`}>
                <span className="aurora-bubble-who">{m.role === "user" ? "You" : caseInfo?.patient.name ?? "Patient"}</span>
                <div className="aurora-bubble-body">
                  {m.content}
                  {isStreaming && i === messages.length - 1 && m.role === "assistant" && <span className="aurora-caret" />}
                </div>
              </div>
            ))}
            {sending && <div className="aurora-bubble is-patient"><div className="aurora-bubble-body aurora-typing">•••</div></div>}

            {showSubmit && !result && (
              <div className="aurora-session-form">
                {unticked.length > 0 && <p className="aurora-session-warn">⚠ {unticked.length} critical step{unticked.length !== 1 ? "s" : ""} not ticked</p>}
                <label className="aurora-eyebrow">Diagnosis</label>
                <textarea className="aurora-input" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Your primary diagnosis…" rows={2} />
                <label className="aurora-eyebrow">Management plan</label>
                <textarea className="aurora-input" value={managementPlan} onChange={(e) => setManagementPlan(e.target.value)} placeholder="Proposed management and follow-up…" rows={2} />
                {submitError && <p className="aurora-session-warn">{submitError}</p>}
                <button type="button" className="aurora-cta aurora-flow" disabled={submitting || !diagnosis.trim() || !managementPlan.trim()} onClick={handleSubmit}>
                  <span>{submitting ? "Evaluating…" : "Submit for evaluation →"}</span>
                </button>
              </div>
            )}

            {result && (
              <div className="aurora-session-result">
                <div className="aurora-session-result-head">
                  <h2 className="aurora-h1" style={{ fontSize: "1.4rem" }}>Case complete</h2>
                  <span className="aurora-session-total aurora-clip">{result.total_score}<small>/10</small></span>
                </div>
                {DOMAINS.map((d) => (
                  <div key={d.label} className="aurora-session-domain">
                    <div className="aurora-session-domain-top">
                      <span>{d.label}</span><span className="aurora-session-domain-val">{result[d.scoreKey] as number}/10</span>
                    </div>
                    <ProgressBar percent={(result[d.scoreKey] as number) * 10} label={d.label} />
                    <p className="aurora-session-domain-fb">{result[d.feedbackKey] as string}</p>
                  </div>
                ))}
                {debrief && (
                  <div className="aurora-session-debrief">
                    <p className="aurora-eyebrow">Overall feedback</p>
                    <p>{debrief}</p>
                  </div>
                )}
                {checklistComparison.length > 0 && (
                  <div className="aurora-session-review">
                    <p className="aurora-eyebrow">Checklist review</p>
                    {checklistComparison.map((s) => (
                      <div key={s.step_number} className="aurora-session-review-row" data-done={s.performed}>
                        <span>{s.performed ? "✓" : "✗"}</span><span>{s.action}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="aurora-session-result-actions">
                  <button type="button" className="aurora-toggle" onClick={() => router.push("/cases")}>More cases</button>
                  <button type="button" className="aurora-cta aurora-flow" onClick={() => router.push("/dashboard")}><span>Back to dashboard</span></button>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {!result && (
            <div className="aurora-session-composer">
              <textarea className="aurora-input aurora-composer-input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} placeholder="Talk to your patient…" rows={1} />
              <button type="button" className="aurora-send aurora-flow" onClick={sendMessage} disabled={!input.trim() || sending || isStreaming} aria-label="Send">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
