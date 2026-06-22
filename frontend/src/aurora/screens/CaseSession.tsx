"use client";
/* AURORA Guided OSCE Station — the virtual-patient simulation rebuilt as a
   colourful, animated, light-mode OSCE station. A living gradient-mesh canvas
   frames two gradient-ring glass cards: (left) the patient + the auto-tracked,
   phase-grouped OSCE checklist; (right) the patient consult thread, examination
   tray, and scored debrief. SSE streaming chat + submit/scoring are preserved
   from the legacy screen. The checklist now comes from /station, ticks live via
   /observe + deterministic exam-action ticks (manual toggle retained), and
   grading shows a per-phase summary + encouraging debrief. Motion is CSS-only. */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { PLATE } from "@/aurora/media";
import { ProgressBar } from "@/aurora/components/ProgressBar";
import { useCountUp } from "@/hooks/useCountUp";
import { StationChecklist, type StationPhase, type StationStep } from "@/aurora/components/StationChecklist";
import { ExamTray, type ExamAction } from "@/aurora/components/ExamTray";

interface CaseInfo {
  case_id: string; title: string; difficulty: string; topic: string; estimated_minutes: number;
  patient: { name: string; age: number; presenting_complaint: string };
}
interface StationData {
  case: CaseInfo;
  checklist: { procedure_name: string; phases: StationPhase[]; total_steps: number; critical_count: number; source: string };
  examination_actions: ExamAction[];
}
interface ChatMessage { role: "user" | "assistant"; content: string }
interface DomainResult {
  history_score: number; investigations_score: number; diagnosis_score: number; management_score: number;
  history_feedback: string; investigations_feedback: string; diagnosis_feedback: string; management_feedback: string;
  total_score: number; overall_feedback: string; critical_hit: number; critical_total: number;
}
interface ChecklistStepResult { step_number: number; action: string; critical: boolean; performed: boolean; clinical_note: string | null }
interface PhaseSummary { phase: number; name: string; done: number; total: number }

// Labels are framed for allied-health roles (OA/OT/PSA): "Diagnosis" → clinical
// recognition/triage, "Management" → escalation & within-scope care. The score
// keys stay the same — only what the student sees changes.
const DOMAINS: { label: string; scoreKey: keyof DomainResult; feedbackKey: keyof DomainResult }[] = [
  { label: "History", scoreKey: "history_score", feedbackKey: "history_feedback" },
  { label: "Investigations", scoreKey: "investigations_score", feedbackKey: "investigations_feedback" },
  { label: "Clinical recognition", scoreKey: "diagnosis_score", feedbackKey: "diagnosis_feedback" },
  { label: "Escalation & care", scoreKey: "management_score", feedbackKey: "management_feedback" },
];

const EXAM_PREFIX = "[Examination performed: ";
const PHASE_CLASS: Record<number, string> = { 1: "p1", 2: "p2", 3: "p3" };

export function CaseSession() {
  const caseId = useParams().caseId as string;
  const router = useRouter();

  // Instant paint from the patient-selection handoff, confirmed by /station.
  const [caseInfo, setCaseInfo] = useState<CaseInfo | null>(() => {
    try {
      const handoff = sessionStorage.getItem("eyebot_case_handoff");
      if (!handoff) return null;
      const parsed = JSON.parse(handoff) as CaseInfo;
      return parsed.case_id === caseId ? parsed : null;
    } catch { return null; }
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [station, setStation] = useState<StationData | null>(null);

  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [autoSteps, setAutoSteps] = useState<Set<number>>(new Set());
  const [performedActions, setPerformedActions] = useState<Set<string>>(new Set());

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const [showSubmit, setShowSubmit] = useState(false);
  const [findings, setFindings] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DomainResult | null>(null);
  const [debrief, setDebrief] = useState<string | null>(null);
  const [checklistComparison, setChecklistComparison] = useState<ChecklistStepResult[]>([]);
  const [perPhase, setPerPhase] = useState<PhaseSummary[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const tickedRef = useRef<Set<number>>(new Set());
  const observeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observeAbort = useRef<AbortController | null>(null);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { tickedRef.current = ticked; }, [ticked]);

  // Fetch the full station payload (case + phased checklist + exam actions).
  useEffect(() => {
    if (!caseId) return;
    fetch(`/api/cases/${caseId}/station`, { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(); return r.json() as Promise<StationData>; })
      .then((d) => { setStation(d); setCaseInfo(d.case); })
      .catch(() => setLoadError(`Patient "${caseId}" not found.`));
  }, [caseId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);

  // Cleanup pending observe work on unmount.
  useEffect(() => () => { if (observeTimer.current) clearTimeout(observeTimer.current); observeAbort.current?.abort(); }, []);

  const addAuto = useCallback((stepNumbers: number[]) => {
    if (!stepNumbers.length) return;
    setTicked((prev) => { const n = new Set(prev); stepNumbers.forEach((s) => n.add(s)); return n; });
    setAutoSteps((prev) => { const n = new Set(prev); stepNumbers.forEach((s) => n.add(s)); return n; });
  }, []);

  // Debounced live examiner. Resilient: any failure silently keeps manual ticking.
  const scheduleObserve = useCallback(() => {
    if (!caseId) return;
    if (observeTimer.current) clearTimeout(observeTimer.current);
    observeTimer.current = setTimeout(async () => {
      observeAbort.current?.abort();
      const ctrl = new AbortController();
      observeAbort.current = ctrl;
      try {
        const res = await fetch(`/api/cases/${caseId}/observe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          signal: ctrl.signal,
          body: JSON.stringify({ messages: messagesRef.current, already_ticked: Array.from(tickedRef.current) }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { newly_satisfied?: number[] };
        addAuto(data.newly_satisfied ?? []);
      } catch { /* resilient: ignore quota / abort / network */ }
    }, 450);
  }, [caseId, addAuto]);

  const toggleStep = (n: number) => setTicked((prev) => {
    const next = new Set(prev);
    if (next.has(n)) {
      next.delete(n);
      setAutoSteps((a) => { const b = new Set(a); b.delete(n); return b; }); // manual untick clears the auto marker too
    } else {
      next.add(n);
    }
    return next;
  });

  const performAction = useCallback((a: ExamAction) => {
    if (performedActions.has(a.key)) return;
    setPerformedActions((prev) => new Set(prev).add(a.key));
    setMessages((prev) => [...prev, { role: "user", content: `${EXAM_PREFIX}${a.label} → ${a.reveal_text}]` }]);
    addAuto(a.satisfies_steps);
    scheduleObserve();
  }, [performedActions, addAuto, scheduleObserve]);

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
    } finally {
      setSending(false);
      setIsStreaming(false);
      scheduleObserve(); // run the examiner after the patient reply completes
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); }
  };

  const handleSubmit = async () => {
    if (!findings.trim() || !recommendation.trim() || !caseId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages, findings: findings.trim(), recommendation: recommendation.trim(), performed_steps: Array.from(ticked) }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResult(data.result);
      setDebrief(data.debrief ?? null);
      setChecklistComparison(data.checklist_comparison ?? []);
      setPerPhase(data.per_phase ?? []);
      setShowSubmit(false);
    } catch { setSubmitError("Could not evaluate. Please try again."); }
    finally { setSubmitting(false); }
  };

  const phases = station?.checklist.phases ?? [];
  const allSteps: StationStep[] = phases.flatMap((p) => p.steps);
  const criticalSteps = allSteps.filter((s) => s.critical);
  const uncheckedCritical = criticalSteps.filter((s) => !ticked.has(s.step_number));

  if (loadError) {
    return (
      <div className="aurora-station-error">
        <p>{loadError}</p>
        <button type="button" onClick={() => router.push("/cases")}>← Back to patients</button>
      </div>
    );
  }

  return (
    <div className="aurora-station" data-testid="station">
      <div className="aurora-station-mesh" aria-hidden />

      <header className="aurora-station-head">
        <button type="button" className="aurora-station-back" onClick={() => router.push("/cases")}>← Patients</button>
        <div>
          <p className="aurora-eyebrow">Virtual patient · OSCE station</p>
          <h1 className="aurora-station-title">
            {caseInfo?.title ?? "Guided OSCE Station"}
            {caseInfo && <> — <em>{caseInfo.patient.name}</em></>}
          </h1>
          {caseInfo && (
            <div className="aurora-station-hud">
              <span>{caseInfo.patient.age} yr</span>
              <span className="aurora-station-hud-sep">·</span>
              <span>{caseInfo.topic}</span>
              <span className="aurora-station-hud-sep">·</span>
              <span className="aurora-station-tier">{caseInfo.difficulty}</span>
            </div>
          )}
        </div>
      </header>

      <div className="aurora-station-grid">
        {/* Left — patient + auto-tracked checklist */}
        <aside className="aurora-station-card aurora-station-aside">
          {caseInfo && (
            <>
              <div className="aurora-station-pt">
                <div className="aurora-station-ring"><img className="aurora-station-av" src={PLATE.caseSession} alt="" aria-hidden onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} /></div>
                <div>
                  <div className="aurora-station-nm">{caseInfo.patient.name}</div>
                  <div className="aurora-station-mt">{caseInfo.patient.age} years · {caseInfo.topic}</div>
                </div>
              </div>
              <div className="aurora-station-cc">“{caseInfo.patient.presenting_complaint}”</div>
            </>
          )}
          {station && (
            <div className="aurora-station-clscroll">
              <StationChecklist
                procedureName={station.checklist.procedure_name}
                phases={phases}
                totalSteps={station.checklist.total_steps}
                ticked={ticked}
                autoSteps={autoSteps}
                onToggle={toggleStep}
              />
            </div>
          )}
          {station && !result && (
            <button type="button" className="aurora-station-submit-toggle" onClick={() => setShowSubmit((v) => !v)}>
              {showSubmit ? "Cancel" : "Submit handover →"}
            </button>
          )}
        </aside>

        {/* Right — consult thread + exam tray + composer / result */}
        <div className="aurora-station-main aurora-station-card">
          <p className="aurora-station-tray-label">Patient consult</p>
          <div className="aurora-station-thread">
            {messages.length === 0 && !result && (
              <p className="aurora-station-hint">Greet your patient and begin taking a history. Use the examination tray below to perform clinical tests.</p>
            )}
            {messages.map((m, i) => {
              if (m.role === "user" && m.content.startsWith(EXAM_PREFIX)) {
                const inner = m.content.slice(EXAM_PREFIX.length, -1); // strip prefix + trailing "]"
                const [label, ...rest] = inner.split(" → ");
                return (
                  <div key={i} className="aurora-station-reveal">
                    <span className="rl2">Examination performed · {label}</span>
                    <div className="v">{rest.join(" → ") || label}</div>
                  </div>
                );
              }
              return (
                <div key={i} className={`aurora-station-bubble ${m.role === "user" ? "me" : "pt"}`}>
                  <span className="who">{m.role === "user" ? "You" : caseInfo?.patient.name ?? "Patient"}</span>
                  <div>
                    {m.content}
                    {isStreaming && i === messages.length - 1 && m.role === "assistant" && <span className="aurora-caret" />}
                  </div>
                </div>
              );
            })}
            {sending && <div className="aurora-station-bubble pt"><div className="aurora-typing">•••</div></div>}

            {showSubmit && !result && (
              <div className="aurora-station-form">
                <p className="aurora-station-form-hint">You're documenting a handover — what you found and what you recommend, within your role. You don't make a medical diagnosis or prescribe treatment; that's for the doctor.</p>
                {uncheckedCritical.length > 0 && (
                  <p className="aurora-station-warn">⚠ {uncheckedCritical.length} critical step{uncheckedCritical.length !== 1 ? "s" : ""} not yet done</p>
                )}
                <label className="aurora-eyebrow">Findings &amp; clinical impression</label>
                <textarea className="aurora-input" data-field="findings" value={findings} onChange={(e) => setFindings(e.target.value)} placeholder="What you found and recognised — key history, test results, red-flag check…" rows={2} />
                <label className="aurora-eyebrow">Recommendation &amp; escalation</label>
                <textarea className="aurora-input" data-field="recommendation" value={recommendation} onChange={(e) => setRecommendation(e.target.value)} placeholder="Triage/urgency, who you'd escalate or refer to, and what you'd advise the patient…" rows={2} />
                {submitError && <p className="aurora-station-warn">{submitError}</p>}
                <button type="button" className="aurora-station-submit-go" disabled={submitting || !findings.trim() || !recommendation.trim()} onClick={handleSubmit}>
                  {submitting ? "Evaluating…" : "Submit handover →"}
                </button>
              </div>
            )}

            {result && <StationResult result={result} debrief={debrief} perPhase={perPhase} comparison={checklistComparison} onMore={() => router.push("/cases")} onDash={() => router.push("/dashboard")} />}
            <div ref={endRef} />
          </div>

          {station && !result && (
            <>
              <ExamTray actions={station.examination_actions} performed={performedActions} onPerform={performAction} />
              <div className="aurora-station-composer">
                <textarea className="aurora-station-composer-input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} placeholder="Talk to your patient…" rows={1} />
                <button type="button" className="aurora-station-composer-send" onClick={sendMessage} disabled={!input.trim() || sending || isStreaming} aria-label="Send">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* Scored debrief — count-up score out of 40, per-phase summary, domain bars,
   encouraging two-part debrief, and the OSCE checklist review with clinical notes. */
function StationResult({ result, debrief, perPhase, comparison, onMore, onDash }: {
  result: DomainResult; debrief: string | null; perPhase: PhaseSummary[];
  comparison: ChecklistStepResult[]; onMore: () => void; onDash: () => void;
}) {
  const { ref, display } = useCountUp<HTMLSpanElement>(result.total_score, { format: (n) => String(Math.round(n)) });
  const missed = comparison.filter((s) => !s.performed);
  const doneCount = comparison.length - missed.length;
  return (
    <div className="aurora-station-result">
      <div className="aurora-station-result-head">
        <h2>Consultation complete</h2>
        <span className="aurora-station-total"><span ref={ref}>{display}</span><small>/40</small></span>
      </div>

      {perPhase.length > 0 && (
        <div className="aurora-station-phasechips">
          {perPhase.map((p) => (
            <div key={p.phase} className={`aurora-station-phasechip ${PHASE_CLASS[p.phase] ?? "p2"}`}>
              <b>{p.done}/{p.total}</b>{p.name}
            </div>
          ))}
        </div>
      )}

      {/* Compact domain breakdown — scored bars only; the narrative lives in the debrief. */}
      <div className="aurora-station-domains">
        {DOMAINS.map((d) => (
          <div key={d.label} className="aurora-station-domain">
            <div className="aurora-station-domain-top">
              <span>{d.label}</span><span className="aurora-station-domain-val">{result[d.scoreKey] as number}/10</span>
            </div>
            <ProgressBar percent={(result[d.scoreKey] as number) * 10} label={d.label} />
          </div>
        ))}
      </div>

      {debrief && (
        <div className="aurora-station-debrief">
          <p className="aurora-eyebrow">Debrief</p>
          <p>{debrief}</p>
        </div>
      )}

      {/* Review: only what was missed — the actionable takeaways. */}
      {comparison.length > 0 && (
        missed.length > 0 ? (
          <div className="aurora-station-review">
            <p className="aurora-eyebrow">To remember next time · {doneCount}/{comparison.length} done</p>
            {missed.map((s) => (
              <div key={s.step_number} className="aurora-station-review-row" data-done="false">
                <span className="mk" aria-hidden>✗</span>
                <span>
                  {s.action}
                  {s.clinical_note && <span className="aurora-station-review-note">{s.clinical_note}</span>}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="aurora-station-review-clear">✓ Every checklist step covered — excellent work.</p>
        )
      )}

      <div className="aurora-station-result-actions">
        <button type="button" className="aurora-toggle" onClick={onMore}>More patients</button>
        <button type="button" className="aurora-station-submit-go" onClick={onDash}>Back to dashboard</button>
      </div>
    </div>
  );
}
