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
import { useCountUp } from "@/hooks/useCountUp";
import { StationChecklist, type StationPhase, type StationStep } from "@/aurora/components/StationChecklist";
import { ActionPalette, type ExamAction } from "@/aurora/components/ActionPalette";

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
  score_100: number; verdict: string; thoroughness: number; technique: number; judgment: number;
  safe: boolean; missed_critical: string[]; thoroughness_detail: string;
}
interface Coaching { highlights: string[]; watch_outs: string[]; focus: string }

const EXAM_PREFIX = "[Examination performed: ";

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

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [activeProcedure, setActiveProcedure] = useState<ExamAction | null>(null);
  const [procText, setProcText] = useState("");
  const [sending, setSending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const [showSubmit, setShowSubmit] = useState(false);
  const [findings, setFindings] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DomainResult | null>(null);
  const [coaching, setCoaching] = useState<Coaching | null>(null);
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

  // Live examiner call. Resilient by design: a single transient failure (network blip,
  // brief quota, a slow single-worker thread) must never permanently drop a tick, so we
  // retry once. Aborts are ignored — a newer observe has already superseded this one. The
  // whole transcript (capped to the request limit) is sent every turn so a step the student
  // built up across SEVERAL messages keeps accruing evidence and ticks once recognised.
  const runObserve = useCallback(async (attempt = 0) => {
    if (!caseId) return;
    observeAbort.current?.abort();
    const ctrl = new AbortController();
    observeAbort.current = ctrl;
    try {
      const res = await fetch(`/api/cases/${caseId}/observe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: ctrl.signal,
        body: JSON.stringify({ messages: messagesRef.current.slice(-100), already_ticked: Array.from(tickedRef.current) }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { newly_satisfied?: number[] };
      addAuto(data.newly_satisfied ?? []);
    } catch {
      // A newer observe took over (abort) → let it handle the latest transcript. Otherwise
      // it was a real blip: retry once after a short backoff so the tick still lands.
      if (ctrl.signal.aborted) return;
      if (attempt < 1) observeTimer.current = setTimeout(() => void runObserve(attempt + 1), 1200);
    }
  }, [caseId, addAuto]);

  // Debounced trigger — coalesces rapid activity into one trailing examiner pass.
  const scheduleObserve = useCallback(() => {
    if (!caseId) return;
    if (observeTimer.current) clearTimeout(observeTimer.current);
    observeTimer.current = setTimeout(() => void runObserve(0), 450);
  }, [caseId, runObserve]);

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

  const sendMessage = async (textArg?: string) => {
    const content = (textArg ?? input).trim();
    if (!content || sending || isStreaming || !caseId) return;
    const updated = [...messages, { role: "user", content } as ChatMessage];
    setMessages(updated);
    if (textArg === undefined) setInput("");
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

  // Clicking a manual chip switches the bottom composer into "procedure mode": the
  // student must type the steps/rules before the step ticks. Already-ticked → no-op.
  const performAction = (a: ExamAction) => {
    if (a.satisfies_steps.some((n) => tickedRef.current.has(n))) return;
    setActiveProcedure(a);
    setProcText("");
  };

  // Confirm the typed technique: post one reveal note (technique + finding) so the
  // step ticks, the finding shows, and the grader sees the technique in the transcript.
  const confirmProcedure = () => {
    const a = activeProcedure;
    const steps = procText.trim();
    if (!a || steps.length < 12) return;
    const result = a.reveal_text ? ` · Result: ${a.reveal_text}` : "";
    setMessages((prev) => [...prev, { role: "user", content: `${EXAM_PREFIX}${a.label} → ${steps}${result}]` }]);
    addAuto(a.satisfies_steps);
    setActiveProcedure(null);
    setProcText("");
    scheduleObserve();
  };

  const cancelProcedure = () => { setActiveProcedure(null); setProcText(""); };

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
      setCoaching(data.coaching ?? null);
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
                const arrow = inner.indexOf(" → ");
                const label = arrow >= 0 ? inner.slice(0, arrow) : inner;
                const body = arrow >= 0 ? inner.slice(arrow + 3) : "";
                const sep = " · Result: ";
                const cut = body.indexOf(sep);
                const technique = cut >= 0 ? body.slice(0, cut) : body;
                const resultText = cut >= 0 ? body.slice(cut + sep.length) : "";
                return (
                  <div key={i} className="aurora-station-reveal">
                    <span className="rl2">Examination performed · {label}</span>
                    {technique && <div className="v">{technique}</div>}
                    {resultText && <div className="rs">Result · {resultText}</div>}
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

            {result && <StationResult result={result} coaching={coaching} onMore={() => router.push("/cases")} onDash={() => router.push("/dashboard")} />}
            <div ref={endRef} />
          </div>

          {station && !result && (
            <>
              <ActionPalette actions={station.examination_actions} ticked={ticked} activeKey={activeProcedure?.key ?? null} onPerform={performAction} />
              {activeProcedure ? (
                <div className="aurora-station-proc">
                  <div className="aurora-station-proc-cap">
                    <span><b>{activeProcedure.label}</b> — type the steps &amp; safety rules you'd follow</span>
                    <button type="button" className="aurora-station-proc-x" onClick={cancelProcedure}>Cancel</button>
                  </div>
                  <div className="aurora-station-composer">
                    <textarea
                      className="aurora-station-composer-input aurora-station-proc-input"
                      value={procText}
                      onChange={(e) => setProcText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); confirmProcedure(); } }}
                      placeholder={`How you perform ${activeProcedure.label.toLowerCase()} — key steps, what you tell the patient, safety checks…`}
                      rows={2}
                      autoFocus
                    />
                    <button type="button" className="aurora-station-composer-send aurora-station-proc-go" onClick={confirmProcedure} disabled={procText.trim().length < 12} aria-label="Log procedure">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="aurora-station-composer">
                  <textarea className="aurora-station-composer-input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} placeholder="Talk to your patient…" rows={1} />
                  <button type="button" className="aurora-station-composer-send" onClick={() => sendMessage()} disabled={!input.trim() || sending || isStreaming} aria-label="Send">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* Station-100 debrief — count-up score /100 + verdict, pass-line meter, safety
   badge, three traceable component cards, and the short Highlights / Watch-outs
   lists with one focus line. Neat, scannable, CSS-only motion. */
const VERDICT_TONE: Record<string, string> = {
  "Exam-ready": "great", "Solid": "good", "Developing": "ok", "Keep practising": "low",
};
const COMPONENTS: { key: "thoroughness" | "technique" | "judgment"; label: string; max: number; sub: string }[] = [
  { key: "thoroughness", label: "Thoroughness", max: 40, sub: "Steps completed" },
  { key: "technique", label: "Technique", max: 30, sub: "History & examination" },
  { key: "judgment", label: "Judgment & safety", max: 30, sub: "Recognition & escalation" },
];

function StationResult({ result, coaching, onMore, onDash }: {
  result: DomainResult; coaching: Coaching | null; onMore: () => void; onDash: () => void;
}) {
  const { ref, display } = useCountUp<HTMLSpanElement>(result.score_100, { format: (n) => String(Math.round(n)) });
  const tone = VERDICT_TONE[result.verdict] ?? "ok";
  const missedOne = result.missed_critical[0];
  return (
    <div className="aurora-station-result" data-tone={tone}>
      <div className="aurora-s100-head">
        <div>
          <p className="aurora-eyebrow">Station complete</p>
          <span className="aurora-s100-verdict">{result.verdict}</span>
        </div>
        <span className="aurora-s100-score"><span ref={ref}>{display}</span><small>/100</small></span>
      </div>

      <div className="aurora-s100-meter" aria-hidden>
        <div className="aurora-s100-fill" style={{ width: `${result.score_100}%` }} />
        <div className="aurora-s100-passline" />
      </div>
      <p className="aurora-s100-meter-cap">Pass line 60 · {result.score_100 >= 60 ? "you passed this station" : `${60 - result.score_100} to pass`}</p>

      <div className={`aurora-s100-safety ${result.safe ? "is-safe" : "is-flag"}`}>
        <span aria-hidden>{result.safe ? "🛡" : "⚠"}</span>
        {result.safe
          ? "Safety check passed — no critical steps missed."
          : `Critical step missed: ${missedOne ?? "a must-do safety step"}.`}
      </div>

      <div className="aurora-s100-comps">
        {COMPONENTS.map((c) => {
          const pts = result[c.key];
          return (
            <div key={c.key} className="aurora-s100-comp">
              <div className="aurora-s100-comp-top"><span>{c.label}</span><b>{pts}<small>/{c.max}</small></b></div>
              <div className="aurora-s100-bar"><div style={{ width: `${(pts / c.max) * 100}%` }} /></div>
              <span className="aurora-s100-comp-sub">{c.key === "thoroughness" ? result.thoroughness_detail : c.sub}</span>
            </div>
          );
        })}
      </div>

      {coaching && (coaching.highlights.length > 0 || coaching.watch_outs.length > 0) && (
        <div className="aurora-s100-coach">
          <div className="aurora-s100-col is-good">
            <p className="aurora-s100-col-h">✓ What you did well</p>
            <ul>{coaching.highlights.map((h, i) => <li key={i} style={{ animationDelay: `${i * 70}ms` }}>{h}</li>)}</ul>
          </div>
          <div className="aurora-s100-col is-watch">
            <p className="aurora-s100-col-h">⚠ To sharpen next time</p>
            <ul>{coaching.watch_outs.map((w, i) => <li key={i} style={{ animationDelay: `${i * 70}ms` }}>{w}</li>)}</ul>
          </div>
        </div>
      )}

      {coaching?.focus && (
        <div className="aurora-s100-focus"><b>One thing for next time:</b> {coaching.focus}</div>
      )}

      <div className="aurora-station-result-actions">
        <button type="button" className="aurora-toggle" onClick={onMore}>More patients</button>
        <button type="button" className="aurora-station-submit-go" onClick={onDash}>Back to dashboard</button>
      </div>
    </div>
  );
}
