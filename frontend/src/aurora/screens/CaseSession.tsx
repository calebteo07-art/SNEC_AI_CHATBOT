"use client";
/* AURORA Guided OSCE Station — the virtual-patient simulation as a colourful,
   animated, light-mode Triptych: (left) the patient + auto-tracked, phase-grouped
   OSCE checklist; (middle) the warm Patient chat (talk to the patient, SSE stream);
   (right) the cool EyeBot action panel (manual procedures → result + a short AI
   coaching note), shown only when the case has manual actions. One `messages` array
   tags each entry with `channel` so the two panes are filtered views that stay in
   sync — /observe and /submit see the full transcript, /chat sees patient-only.
   The checklist ticks live via /observe + deterministic exam-action ticks (manual
   toggle retained); the scored debrief opens in an overlay. Motion is CSS-only. */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { PLATE } from "@/aurora/media";
import { useCountUp } from "@/hooks/useCountUp";
import { StationChecklist, type StationPhase, type StationStep } from "@/aurora/components/StationChecklist";
import { type ExamAction, type ActionGrade, EXAM_PREFIX, GRADE_PREFIX } from "@/aurora/components/ActionPalette";
import { PatientChat } from "@/aurora/components/PatientChat";
import { EyeBotPanel } from "@/aurora/components/EyeBotPanel";
import { advance, gateIndex, currentStep } from "@/aurora/lib/stationGate";
import { useAuth } from "@/screens/AuthContext";
import { useReward } from "@/aurora/rewards/RewardProvider";
import { grantAchievements } from "@/aurora/rewards/achieve";

interface CaseInfo {
  case_id: string; title: string; difficulty: string; topic: string; estimated_minutes: number;
  patient: { name: string; age: number; presenting_complaint: string; face?: string };
}
interface StationData {
  case: CaseInfo;
  checklist: { procedure_name: string; phases: StationPhase[]; total_steps: number; critical_count: number; source: string };
  examination_actions: ExamAction[];
}
type Channel = "patient" | "eyebot";
interface ChatMessage { role: "user" | "assistant"; content: string; channel: Channel }
interface DomainResult {
  history_score: number; investigations_score: number; diagnosis_score: number; management_score: number;
  history_feedback: string; investigations_feedback: string; diagnosis_feedback: string; management_feedback: string;
  total_score: number; overall_feedback: string; critical_hit: number; critical_total: number;
  score_100: number; verdict: string; thoroughness: number; technique: number; judgment: number;
  safe: boolean; missed_critical: string[]; thoroughness_detail: string;
  technique_applies: boolean; thoroughness_max: number; technique_max: number; judgment_max: number;
}
interface Coaching { highlights: string[]; watch_outs: string[]; focus: string }

export function CaseSession() {
  const caseId = useParams().caseId as string;
  const router = useRouter();
  const { user } = useAuth();
  const { enqueue } = useReward();
  const qc = useQueryClient();

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
  // Count of in-flight EyeBot coaching calls (a counter, not a flag, so overlapping
  // procedures don't make the typing indicator vanish while one is still pending).
  const [coachingCount, setCoachingCount] = useState(0);

  // Backend reads only {role, content}; `channel` is a frontend view key. Strip it so
  // request bodies are byte-identical to today (no Pydantic extra-field breakage).
  const toApi = (msgs: ChatMessage[]) => msgs.map(({ role, content }) => ({ role, content }));

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
  const orderRef = useRef<number[]>([]);
  const observeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observeAbort = useRef<AbortController | null>(null);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { tickedRef.current = ticked; }, [ticked]);
  useEffect(() => {
    orderRef.current = (station?.checklist.phases ?? []).flatMap((p) => p.steps).map((s) => s.step_number);
  }, [station]);

  // Fetch the full station payload (case + phased checklist + exam actions).
  useEffect(() => {
    if (!caseId) return;
    fetch(`/api/cases/${caseId}/station`, { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(); return r.json() as Promise<StationData>; })
      .then((d) => { setStation(d); setCaseInfo(d.case); })
      .catch(() => setLoadError(`Patient "${caseId}" not found.`));
  }, [caseId]);

  // Auto-scroll the patient thread only when the patient conversation changes — EyeBot
  // appends must not yank the patient pane to the bottom.
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.filter((m) => m.channel === "patient").length, sending]);

  // Cleanup pending observe work on unmount.
  useEffect(() => () => { if (observeTimer.current) clearTimeout(observeTimer.current); observeAbort.current?.abort(); }, []);

  // Apply any examiner / exam-tray completions through the gate: only the longest
  // in-order run starting at the current step is ticked. Newly-ticked steps are
  // marked auto (for the ✦ badge). Out-of-order detections are ignored until their
  // predecessors are done — the examiner re-sends the whole transcript, so they tick
  // once the gate reaches them.
  const addAuto = useCallback((stepNumbers: number[]) => {
    if (!stepNumbers.length) return;
    const prev = tickedRef.current;
    const next = advance(orderRef.current, prev, stepNumbers);
    if (next.size === prev.size) return; // nothing unlocked
    setTicked(next);
    setAutoSteps((a) => {
      const b = new Set(a);
      for (const s of next) if (!prev.has(s)) b.add(s);
      return b;
    });
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
        body: JSON.stringify({ messages: toApi(messagesRef.current.slice(-100)), already_ticked: Array.from(tickedRef.current) }),
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

  // Manual control under strict gating: tapping the CURRENT row completes it (the
  // escape hatch when the examiner misses a step); tapping the most-recent done row
  // steps back one (recover a mis-tap). Locked / earlier-done rows are no-ops.
  const toggleStep = (n: number) => {
    // Decide against the latest QUEUED ticked set (the updater's `prev`), not the
    // render-lagged tickedRef, so a manual tap can't race an in-flight auto-tick.
    setTicked((prev) => {
      const order = orderRef.current;
      const gi = gateIndex(order, prev);
      const cur = gi < order.length ? order[gi] : null;
      const lastDone = gi > 0 ? order[gi - 1] : null;
      if (n === cur) {
        const x = new Set(prev); x.add(n); return x;
      }
      if (n === lastDone && prev.has(n)) {
        setAutoSteps((a) => { const b = new Set(a); b.delete(n); return b; });
        const x = new Set(prev); x.delete(n); return x;
      }
      return prev; // locked / earlier-done → no-op (same ref, no re-render)
    });
  };

  const sendMessage = async (textArg?: string) => {
    const content = (textArg ?? input).trim();
    if (!content || sending || isStreaming || !caseId) return;
    const updated: ChatMessage[] = [...messages, { role: "user", content, channel: "patient" }];
    setMessages(updated);
    if (textArg === undefined) setInput("");
    setSending(true);
    try {
      // Only the patient conversation is sent as context — EyeBot exam chatter is excluded.
      const patientHistory = toApi(updated.filter((m) => m.channel === "patient"));
      const res = await fetch(`/api/cases/${caseId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: patientHistory }),
      });
      if (!res.ok || !res.body) throw new Error("Stream unavailable");
      setMessages((prev) => [...prev, { role: "assistant", content: "", channel: "patient" }]);
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
                if (last && last.role === "assistant" && last.channel === "patient")
                  return [...prev.slice(0, -1), { ...last, content: last.content + parsed.text }];
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
        if (last && last.role === "assistant" && last.channel === "patient")
          return [...prev.slice(0, -1), { ...last, content: fb }];
        return [...prev, { role: "assistant", content: fb, channel: "patient" }];
      });
    } finally {
      setSending(false);
      setIsStreaming(false);
      scheduleObserve(); // run the examiner after the patient reply completes
    }
  };

  // Clicking a manual chip switches the bottom composer into "procedure mode": the
  // student must type the steps/rules before the step ticks. Only a FULLY-done chip
  // is a no-op (.every, matching the palette's done state) — a merged chip whose run
  // is only partly ticked must still open so its remaining steps can be completed.
  const performAction = (a: ExamAction) => {
    if (sending || isStreaming) return; // don't interleave with a live patient stream
    if (a.satisfies_steps.every((n) => tickedRef.current.has(n))) return;
    // Quick (mechanical) procedures need no typed technique — tick on one click with a short
    // performed note, and skip the AI coaching call (nothing to coach) (ricoe C5).
    if (a.quick) {
      const body = a.reveal_text ? ` → performed · Result: ${a.reveal_text}` : "";
      setMessages((prev) => [...prev, { role: "user", content: `${EXAM_PREFIX}${a.label}${body}]`, channel: "eyebot" }]);
      addAuto(a.satisfies_steps);
      scheduleObserve();
      return;
    }
    setActiveProcedure(a);
    setProcText("");
  };

  // Confirm the typed technique: post one eyebot-channel reveal (technique + finding) so the
  // step ticks and the grader sees the technique, then ask EyeBot for a short coaching note.
  const confirmProcedure = () => {
    const a = activeProcedure;
    const steps = procText.trim();
    if (!a || steps.length < 12) return;
    const resultText = a.reveal_text ? ` · Result: ${a.reveal_text}` : "";
    setMessages((prev) => [...prev, { role: "user", content: `${EXAM_PREFIX}${a.label} → ${steps}${resultText}]`, channel: "eyebot" }]);
    addAuto(a.satisfies_steps);
    setActiveProcedure(null);
    setProcText("");
    scheduleObserve();
    void runAction(a, steps);
  };

  // Real-time technique grade vs the crafted model answer (ricoe C6). Non-blocking +
  // graceful: the result is already shown and the step already ticked, so a failure just
  // means no grade card. The grade is encoded into one eyebot-channel message so it flows
  // through the existing thread; EyeBotPanel renders it as a structured card.
  const runAction = async (a: ExamAction, technique: string) => {
    if (!caseId) return;
    setCoachingCount((c) => c + 1);
    try {
      const res = await fetch(`/api/cases/${caseId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action_label: a.label, technique, finding: a.reveal_text, satisfies_steps: a.satisfies_steps }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as ActionGrade;
      if (data && data.verdict) {
        setMessages((prev) => [...prev, { role: "assistant", content: `${GRADE_PREFIX}${JSON.stringify(data)}`, channel: "eyebot" }]);
      } else if (data && data.coaching) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.coaching, channel: "eyebot" }]);
      }
    } catch {
      /* graceful: result already shown, no grade card */
    } finally {
      setCoachingCount((c) => c - 1);
    }
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
        body: JSON.stringify({ messages: toApi(messages), findings: findings.trim(), recommendation: recommendation.trim(), performed_steps: Array.from(ticked) }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { result: DomainResult; coaching?: Coaching; lumens_awarded?: number };
      setResult(data.result);
      setCoaching(data.coaching ?? null);
      setShowSubmit(false);
      qc.invalidateQueries({ queryKey: ["progress"] });
      const sc = data.result.score_100 ?? 0;
      const ids = ["first_station",
        ...(sc >= 60 ? ["station_pass"] : []),
        ...(sc >= 100 && data.result.safe && data.result.missed_critical.length === 0 ? ["flawless_station"] : [])];
      grantAchievements(user?.studentId ?? "", ids, data.lumens_awarded ?? 0).forEach(enqueue);
    } catch { setSubmitError("Could not evaluate. Please try again."); }
    finally { setSubmitting(false); }
  };

  const phases = station?.checklist.phases ?? [];
  const allSteps: StationStep[] = phases.flatMap((p) => p.steps);
  const criticalSteps = allSteps.filter((s) => s.critical);
  const uncheckedCritical = criticalSteps.filter((s) => !ticked.has(s.step_number));
  const gateStep = currentStep(allSteps.map((s) => s.step_number), ticked); // current unlockable step, or null

  const patientMessages = messages.filter((m) => m.channel === "patient").map(({ role, content }) => ({ role, content }));
  const eyebotMessages = messages.filter((m) => m.channel === "eyebot").map(({ role, content }) => ({ role, content }));
  const manualActions = (station?.examination_actions ?? []).filter((a) => a.kind === "manual");
  const hasEyebot = manualActions.length > 0;

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

      <div className="aurora-station-grid" data-eyebot={hasEyebot ? "true" : "false"}>
        {/* Left — patient + auto-tracked checklist (unchanged) */}
        <aside className="aurora-station-card aurora-station-aside">
          {caseInfo && (
            <>
              <div className="aurora-station-pt">
                <div className="aurora-station-ring"><img className="aurora-station-av" src={caseInfo.patient.face ?? PLATE.caseSession} alt="" aria-hidden onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} /></div>
                <div>
                  <div className="aurora-station-nm">{caseInfo.patient.name}</div>
                  <div className="aurora-station-mt">{caseInfo.patient.age} years · {caseInfo.topic}</div>
                </div>
              </div>
              <div className="aurora-station-cc">"{caseInfo.patient.presenting_complaint}"</div>
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
                current={gateStep}
                onToggle={toggleStep}
              />
            </div>
          )}
          {station && !result && (
            <button type="button" className="aurora-station-submit-toggle" onClick={() => setShowSubmit(true)}>
              Submit handover →
            </button>
          )}
        </aside>

        {/* Middle — patient consult (warm) */}
        <PatientChat
          patientName={caseInfo?.patient.name ?? "Patient"}
          patientFace={caseInfo?.patient.face}
          messages={patientMessages}
          input={input}
          sending={sending}
          isStreaming={isStreaming}
          hasResult={!!result}
          endRef={endRef}
          onInputChange={setInput}
          onSend={() => sendMessage()}
          onKeyDown={onKeyDown}
        />

        {/* Right — EyeBot manual procedures (cool); hidden when the case has none */}
        {hasEyebot && station && (
          <EyeBotPanel
            messages={eyebotMessages}
            actions={manualActions}
            ticked={ticked}
            current={gateStep}
            activeProcedure={activeProcedure}
            procText={procText}
            coaching={coachingCount > 0}
            showActions={!result}
            busy={sending || isStreaming}
            onPerform={performAction}
            onProcText={setProcText}
            onConfirm={confirmProcedure}
            onCancel={cancelProcedure}
          />
        )}
      </div>

      {(showSubmit || result) && (
        <div className="aurora-station-overlay" role="dialog" aria-modal="true">
          <div className="aurora-station-overlay-scrim" onClick={() => { if (!result) setShowSubmit(false); }} aria-hidden />
          <div className="aurora-station-overlay-card">
            {!result ? (
              <div className="aurora-station-form">
                <button type="button" className="aurora-station-overlay-x" onClick={() => setShowSubmit(false)} aria-label="Close">✕</button>
                <p className="aurora-eyebrow">Handover</p>
                <p className="aurora-station-form-hint">You're documenting a handover — what you found and what you recommend, within your role. You don't make a medical diagnosis or prescribe treatment; that's for the doctor.</p>
                {uncheckedCritical.length > 0 && (
                  <p className="aurora-station-warn">⚠ {uncheckedCritical.length} critical step{uncheckedCritical.length !== 1 ? "s" : ""} not yet done</p>
                )}
                <label className="aurora-eyebrow">Findings</label>
                <textarea className="aurora-input" data-field="findings" value={findings} onChange={(e) => setFindings(e.target.value)} placeholder="What you found and recognised — key history, test results, red-flag check…" rows={3} />
                <label className="aurora-eyebrow">Next steps</label>
                <textarea className="aurora-input" data-field="recommendation" value={recommendation} onChange={(e) => setRecommendation(e.target.value)} placeholder="Triage/urgency, who you'd escalate or refer to, and what you'd advise the patient…" rows={3} />
                {submitError && <p className="aurora-station-warn">{submitError}</p>}
                <button type="button" className="aurora-station-submit-go" disabled={submitting || !findings.trim() || !recommendation.trim()} onClick={handleSubmit}>
                  {submitting ? "Evaluating…" : "Submit handover →"}
                </button>
              </div>
            ) : (
              <StationResult result={result} coaching={coaching} onMore={() => router.push("/cases")} onDash={() => router.push("/dashboard")} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* Station-100 debrief — count-up score /100 + verdict, pass-line meter, safety
   badge, three traceable component cards, and the short Highlights / Watch-outs
   lists with one focus line. Neat, scannable, CSS-only motion. */
const VERDICT_TONE: Record<string, string> = {
  "Exam-ready": "great", "Solid": "good", "Developing": "ok", "Keep practising": "low",
};
function StationResult({ result, coaching, onMore, onDash }: {
  result: DomainResult; coaching: Coaching | null; onMore: () => void; onDash: () => void;
}) {
  const { ref, display } = useCountUp<HTMLSpanElement>(result.score_100, { format: (n) => String(Math.round(n)) });
  const tone = VERDICT_TONE[result.verdict] ?? "ok";
  const missedOne = result.missed_critical[0];

  // Data-driven cards: Technique appears only when the case has manual procedures,
  // and each denominator comes from the score so the 40/30/30 (manual) vs
  // 50/–/50 (conversation-only) split renders correctly.
  const comps: { label: string; pts: number; max: number; sub: string }[] = [
    { label: "OSCE checklist", pts: result.thoroughness, max: result.thoroughness_max, sub: `${result.thoroughness_detail} · the checklist counts toward your /100` },
    ...(result.technique_applies
      ? [{ label: "Technique", pts: result.technique, max: result.technique_max, sub: "How well you performed the procedure(s)" }]
      : []),
    { label: "Clinical judgement & safety", pts: result.judgment, max: result.judgment_max, sub: "Spotting the problem, triage, escalation & handover" },
  ];
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
        {comps.map((c) => (
          <div key={c.label} className="aurora-s100-comp">
            <div className="aurora-s100-comp-top"><span>{c.label}</span><b>{c.pts}<small>/{c.max}</small></b></div>
            <div className="aurora-s100-bar"><div style={{ width: `${c.max ? (c.pts / c.max) * 100 : 0}%` }} /></div>
            <span className="aurora-s100-comp-sub">{c.sub}</span>
          </div>
        ))}
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
