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
import { HelpButton } from "@/aurora/components/HelpButton";
import { ApiErrorNotice } from "@/aurora/components/ApiErrorNotice";
import { StationBriefing } from "@/aurora/components/StationBriefing";
import { type ExamAction, type ActionGrade, EXAM_PREFIX, GRADE_PREFIX } from "@/aurora/components/ActionPalette";
import { PatientChat } from "@/aurora/components/PatientChat";
import { EyeBotPanel } from "@/aurora/components/EyeBotPanel";
import { advance, gateIndex, currentStep, observeCanTick, performedOnly } from "@/aurora/lib/stationGate";
import { stationTurn, canSkip } from "@/aurora/lib/stationTurn";
import { admit, chipOutcome, dualHalf, dualHint, panelOnlySteps, type DualKind } from "@/aurora/lib/dualStep";
import { timerState, paceRead } from "@/aurora/lib/stationTimer";
import { submitErrorMessage } from "@/aurora/lib/submitError";
import { buildSessionHtml, type SessionExportData, type ScoreBucket } from "@/aurora/lib/sessionExport";
import { tierLabel } from "@/aurora/lib/tiers";
import { useAuth } from "@/screens/AuthContext";
import { useReward } from "@/aurora/rewards/RewardProvider";
import { grantAchievements } from "@/aurora/rewards/achieve";
import { displayName } from "@/aurora/lib/displayName";
import { createRoundForfeit, FORFEIT_LUMENS } from "@/aurora/lib/forfeitGuard";
import { leaveGuard } from "@/aurora/lib/leaveGuard";

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
interface ScorePart { label: string; pts: number; max: number }
interface SchemeBreakdown { parts: ScorePart[]; total: number; max: number; capped: boolean; cap_reason: string }
interface ScoreBreakdown { checklist: SchemeBreakdown; consult: SchemeBreakdown; judgement: SchemeBreakdown }
interface DomainResult {
  history_score: number; investigations_score: number; diagnosis_score: number; management_score: number;
  history_feedback: string; investigations_feedback: string; diagnosis_feedback: string; management_feedback: string;
  total_score: number; overall_feedback: string; critical_hit: number; critical_total: number;
  score_100: number; verdict: string;
  checklist_coverage: number; checklist_coverage_max: number;
  consult_technique: number; consult_technique_max: number;
  judgement_safety: number; judgement_safety_max: number;
  safe: boolean; missed_critical: string[];
  /** Optional: an older backend during a deploy window simply omits it. */
  breakdown?: ScoreBreakdown;
}
interface Coaching { highlights: string[]; did_wrong: string[]; missed: string[]; focus: string }

/** The grade's buckets — 40/30/30, checklist first because it is the largest and because
    completing the procedure IS the allied-health competency. Defined ONCE: the debrief cards
    and the saved report both render this, so the report can never omit a bucket the student
    saw on screen. Every value and max comes from the backend, which owns the formula — this
    hardcodes no weighting of its own. */
function scoreBuckets(result: DomainResult): ScoreBucket[] {
  const b = result.breakdown;
  return [
    {
      label: "Checklist coverage",
      pts: result.checklist_coverage, max: result.checklist_coverage_max,
      sub: "How much of the procedure you actually completed",
      parts: b?.checklist.parts,
    },
    {
      label: "Consultation & Technique",
      pts: result.consult_technique, max: result.consult_technique_max,
      sub: "History-taking and how well you performed the examination(s)",
      parts: b?.consult.parts,
      notes: [result.history_feedback, result.investigations_feedback].filter(Boolean),
    },
    {
      label: "Clinical Judgement & Safety",
      pts: result.judgement_safety, max: result.judgement_safety_max,
      sub: "Spotting the problem, triage, escalation & handover",
      parts: b?.judgement.parts,
      capReason: b?.judgement.capped ? b.judgement.cap_reason : undefined,
      notes: [result.diagnosis_feedback, result.management_feedback].filter(Boolean),
    },
  ];
}

// Decode one action-channel message into a readable {who, text} row for the export —
// mirrors EyeBotPanel's reveal/grade parsing so the saved transcript reads like the pane.
function decodeActionMessage(m: { role: "user" | "assistant"; content: string }): { who: string; text: string } {
  if (m.role === "user" && m.content.startsWith(EXAM_PREFIX)) {
    const inner = m.content.slice(EXAM_PREFIX.length, -1);
    const arrow = inner.indexOf(" → ");
    const label = arrow >= 0 ? inner.slice(0, arrow) : inner;
    const body = arrow >= 0 ? inner.slice(arrow + 3) : "";
    const sep = " · Result: ";
    const cut = body.indexOf(sep);
    const technique = cut >= 0 ? body.slice(0, cut) : body;
    const resultText = cut >= 0 ? body.slice(cut + sep.length) : "";
    let text = `Examination performed · ${label}`;
    if (technique) text += ` · Technique: ${technique}`;
    if (resultText) text += ` · Result: ${resultText}`;
    return { who: "You", text };
  }
  if (m.role === "assistant" && m.content.startsWith(GRADE_PREFIX)) {
    try {
      const g = JSON.parse(m.content.slice(GRADE_PREFIX.length)) as ActionGrade;
      const parts = [`Grade: ${g.verdict}`];
      if (g.covered?.length) parts.push(`Covered: ${g.covered.join("; ")}`);
      if (g.missing?.length) parts.push(`Still to include: ${g.missing.join("; ")}`);
      if (g.model_answer) parts.push(`Model answer: ${g.model_answer}`);
      if (g.coaching) parts.push(`Tip: ${g.coaching}`);
      return { who: "EyeBot", text: parts.join(" · ") };
    } catch { /* fall through to a plain bubble */ }
  }
  return { who: m.role === "user" ? "You" : "EyeBot", text: m.content };
}

export function CaseSession() {
  const caseId = useParams().caseId as string;
  const router = useRouter();
  const { user } = useAuth();
  const { enqueue } = useReward();
  const qc = useQueryClient();

  // Leave-forfeit guard: leaving a virtual patient before the handover is graded costs
  // Lumens (see the effect block below). Created once per mount.
  const guard = useRef(createRoundForfeit()).current;
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  // Where a confirmed leave goes. "/cases" for the ← Patients button; an intercepted rail /
  // ⌘K destination when the student tries to navigate away mid-station.
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Instant paint from the patient-selection handoff, confirmed by /station.
  const [caseInfo, setCaseInfo] = useState<CaseInfo | null>(() => {
    try {
      const handoff = sessionStorage.getItem("eyebot_case_handoff");
      if (!handoff) return null;
      const parsed = JSON.parse(handoff) as CaseInfo;
      return parsed.case_id === caseId ? parsed : null;
    } catch { return null; }
  });
  const [loadError, setLoadError] = useState<"missing" | "api" | null>(null);
  const [station, setStation] = useState<StationData | null>(null);

  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [autoSteps, setAutoSteps] = useState<Set<number>>(new Set());
  // The two halves of a dual-source step (one checklist row, both the chart AND the patient
  // — see lib/dualStep): chartDone is recorded by the chip, askedDual is an examiner credit
  // waiting for the chart half. A step in both ticks; a step in one is half done.
  const [chartDone, setChartDone] = useState<Set<number>>(new Set());
  const [askedDual, setAskedDual] = useState<Set<number>>(new Set());
  // Steps the student could not complete and skipped (see skipStep()). They pass the gate
  // so the session continues, but they are NEVER reported as performed.
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  // Tries on the current step since the gate last moved — a sent message, or a procedure
  // opened in the action panel. Past SKIP_AFTER with no tick ⇒ offer the way out.
  const [attempts, setAttempts] = useState(0);
  const [skipping, setSkipping] = useState(false);
  // The pre-flight briefing runs on EVERY station open (user, 2026-07-29) — no storage key,
  // no "seen" flag. `?` re-opens it mid-case, which is the only other way in.
  const [showBriefing, setShowBriefing] = useState(false);
  const dismissBriefing = useCallback(() => setShowBriefing(false), []);
  const replayBriefing = useCallback(() => setShowBriefing(true), []);

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
  // One-time session save: a download the student gets exactly once from the debrief.
  // Once saved (or once they leave the debrief) the ephemeral session can't be saved again.
  const [saved, setSaved] = useState(false);

  // Case clock (Branda: cases had no time limit). startedAt is a ref — a re-render must
  // never restart it; `nowMs` ticks once a second only while the station is live, so a
  // graded station stops costing renders.
  const startedAt = useRef<number>(Date.now());
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const endRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const tickedRef = useRef<Set<number>>(new Set());
  const orderRef = useRef<number[]>([]);
  // step_numbers the conversational examiner (/observe) can tick = all steps minus the
  // manual (action-panel-only) ones. Kept as a ref so runObserve can skip a pointless
  // examiner round-trip once they are all ticked.
  const observableStepsRef = useRef<number[]>([]);
  // Dual-source steps and their two halves — see lib/dualStep. Refs as well as state:
  // performAction must re-admit a pending examiner credit in the SAME tick as the click.
  const dualStepsRef = useRef<Set<number>>(new Set());
  const chartDoneRef = useRef<Set<number>>(new Set());
  const askedDualRef = useRef<Set<number>>(new Set());
  const panelOnlyRef = useRef<Set<number>>(new Set());
  const observeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observeAbort = useRef<AbortController | null>(null);
  const chatAbort = useRef<AbortController | null>(null);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { tickedRef.current = ticked; }, [ticked]);
  useEffect(() => {
    const order = (station?.checklist.phases ?? []).flatMap((p) => p.steps).map((s) => s.step_number);
    orderRef.current = order;
    // A dual-source step is the one manual step the examiner may also tick — its second
    // half is the consult, so hiding it would leave a critical step untickable forever.
    dualStepsRef.current = new Set(
      (station?.examination_actions ?? []).flatMap((a) => a.also_ask_steps ?? []),
    );
    const manual = panelOnlySteps(station?.examination_actions ?? []);
    panelOnlyRef.current = manual;
    observableStepsRef.current = order.filter((n) => !manual.has(n));
  }, [station]);

  // Fetch the full station payload (case + phased checklist + exam actions).
  useEffect(() => {
    if (!caseId) return;
    fetch(`/api/cases/${caseId}/station`, { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<StationData>; })
      .then((d) => { setStation(d); setCaseInfo(d.case); })
      /* A 404 is the only failure that means what it used to say for all of them: this
         patient isn't there, and a reload will produce the same nothing. Everything else
         — 5xx, an expired cookie, a dead proxy — is ours, and reads as ours. */
      .catch((e: Error) => setLoadError(e.message === "404" ? "missing" : "api"));
  }, [caseId]);

  // Fire the briefing once the station has painted, so its anchors exist to spotlight.
  useEffect(() => {
    if (!station) return;
    setShowBriefing(true);
  }, [station]);

  // Auto-scroll the patient thread only when the patient conversation changes — EyeBot
  // appends must not yank the patient pane to the bottom.
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.filter((m) => m.channel === "patient").length, sending]);

  // Tick the case clock while the station is live; stop the moment it's graded.
  useEffect(() => {
    if (!station || result) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [station, result]);

  // Cleanup pending observe work on unmount.
  useEffect(() => () => { if (observeTimer.current) clearTimeout(observeTimer.current); observeAbort.current?.abort(); chatAbort.current?.abort(); }, []);

  // ── Leave-forfeit ────────────────────────────────────────────────────────────
  // Leaving a virtual patient before the handover is graded forfeits Lumens (the server
  // owns the amount). The station is a forfeitable "round" from the moment it loads until a
  // result lands; the guard funnels every exit route through spend() so the hit is charged
  // exactly once and never once the station is complete. Mirrors the flashcards quit penalty.
  const stationActive = !!station && !result;
  useEffect(() => { guard.setActive(stationActive); }, [guard, stationActive]);

  // While the station is active, the persistent Atlas Rail and ⌘K palette (rendered by the
  // shell on top of the station) route through the leave confirm instead of silently
  // dropping the round — the loophole this closes. Disarms when the station is graded or the
  // screen unmounts, so navigation is free again. The forfeit is still charged once via
  // guard.spend(), so this never double-charges with the pagehide/unmount beacon below.
  useEffect(() => {
    if (!stationActive) return;
    leaveGuard.arm((href) => { setPendingHref(href); setLeaveConfirm(true); });
    return () => leaveGuard.disarm();
  }, [stationActive]);

  // Backstop for exits that can't route through the confirm dialog — a real unload (refresh /
  // tab-close, via pagehide) and browser Back (SPA unmount, via the effect cleanup). In-app
  // nav (the rail / ⌘K palette) is now intercepted above and charges through the confirm, so
  // by the time this fires for those routes guard.spend() has already been spent; spend()
  // dedupes every route against the others, so it stays one charge per station.
  useEffect(() => {
    const beacon = () => { if (guard.spend()) navigator.sendBeacon?.(`/api/cases/${caseId}/forfeit`); };
    window.addEventListener("pagehide", beacon);
    return () => { window.removeEventListener("pagehide", beacon); beacon(); };
  }, [guard, caseId]);

  // Controlled exit via the ← Patients button. sendBeacon (not fetch) so the −Lumens hit
  // survives the immediate navigation; spend() keeps it to a single charge; then nudge
  // [progress] so the balance reflects the hit on the next screen.
  const chargeForfeit = () => {
    if (!guard.spend()) return;
    navigator.sendBeacon?.(`/api/cases/${caseId}/forfeit`);
    qc.invalidateQueries({ queryKey: ["progress"] });
  };
  // Every leave request funnels here — the ← Patients button (→ /cases) and an intercepted
  // rail / ⌘K destination. In-progress ⇒ confirm first (pointed at `href`); a graded or
  // not-yet-loaded station leaves for free.
  const requestLeave = (href: string) => {
    if (guard.active) { setPendingHref(href); setLeaveConfirm(true); return; }
    router.push(href);
  };
  const attemptLeave = () => requestLeave("/cases");
  const confirmLeave = () => { chargeForfeit(); router.push(pendingHref ?? "/cases"); };
  const cancelLeave = () => { setLeaveConfirm(false); setPendingHref(null); };

  // Apply any examiner / exam-tray completions through the gate: only the longest
  // in-order run starting at the current step is ticked. Newly-ticked steps are
  // marked auto (for the ✦ badge). Out-of-order detections are ignored until their
  // predecessors are done — the examiner re-sends the whole transcript, so they tick
  // once the gate reaches them.
  const addAuto = useCallback((stepNumbers: number[]) => {
    if (!stepNumbers.length) return;
    // A dual-source step needs BOTH halves. The examiner may credit the asking first — hold
    // that credit until the chart half lands (performAction re-admits it), so the order the
    // student works in doesn't matter.
    const { tick, hold } = admit(stepNumbers, dualStepsRef.current, chartDoneRef.current);
    if (hold.length) {
      const held = new Set([...askedDualRef.current, ...hold]);
      askedDualRef.current = held;
      setAskedDual(held);
    }
    if (!tick.length) return;
    const prev = tickedRef.current;
    const next = advance(orderRef.current, prev, tick);
    if (next.size === prev.size) return; // nothing unlocked
    setTicked(next);
    setAutoSteps((a) => {
      const b = new Set(a);
      for (const s of next) if (!prev.has(s)) b.add(s);
      return b;
    });
  }, []);

  // Record the action-panel half of a dual step. The ref goes first, deliberately: addAuto
  // runs in the SAME tick and reads chartDoneRef to admit a held examiner credit.
  const applyCharted = useCallback((steps: number[]) => {
    if (!steps.length) return;
    const charted = new Set([...chartDoneRef.current, ...steps]);
    chartDoneRef.current = charted;
    setChartDone(charted);
  }, []);

  // Live examiner call. Resilient by design: a single transient failure (network blip,
  // brief quota, a slow single-worker thread) must never permanently drop a tick, so we
  // retry once. Aborts are ignored — a newer observe has already superseded this one. The
  // whole transcript (capped to the request limit) is sent every turn so a step the student
  // built up across SEVERAL messages keeps accruing evidence and ticks once recognised.
  const runObserve = useCallback(async (attempt = 0) => {
    if (!caseId) return;
    // Once every conversationally-observable step is ticked, /observe returns [] anyway
    // (manual steps tick via the action panel; /submit re-grades the full transcript), so
    // skip the round-trip — and, for gated cases, its access-check DB read — in the tail.
    if (!observeCanTick(observableStepsRef.current, tickedRef.current)) return;
    observeAbort.current?.abort();
    const ctrl = new AbortController();
    observeAbort.current = ctrl;
    try {
      const res = await fetch(`/api/cases/${caseId}/observe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: ctrl.signal,
        body: JSON.stringify({ messages: toApi(messagesRef.current.slice(-100)), already_ticked: Array.from(tickedRef.current), record_done: Array.from(chartDoneRef.current) }),
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

  // The way out of a step the student can't complete. Removing the manual tap made /observe
  // load-bearing: a step it never recognises would freeze the gate and leave every later
  // manual chip locked forever. One press, two stages — first ask the examiner to re-read
  // THIS step leniently, so a student who really did it keeps full credit; only if that
  // still finds nothing is the step skipped. A skip advances the gate and nothing else:
  // it is recorded as NOT performed, everywhere.
  const skipStep = useCallback(async () => {
    const step = currentStep(orderRef.current, tickedRef.current);
    if (step === null || skipping) return;
    setSkipping(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/observe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messages: toApi(messagesRef.current.slice(-100)),
          already_ticked: Array.from(tickedRef.current),
          focus_step: step,
          // The lenient re-read needs the chart half too, or a student stuck on a half-done
          // dual step is graded as having skipped work they actually did.
          record_done: Array.from(chartDoneRef.current),
        }),
      });
      const data = res.ok ? ((await res.json()) as { newly_satisfied?: number[] }) : { newly_satisfied: [] };
      if (data.newly_satisfied?.length) { addAuto(data.newly_satisfied); return; }
    } catch {
      /* fall through to the skip — the way out must never fail closed */
    } finally {
      setSkipping(false);
    }
    // Stage 2: the examiner still can't see it, so it wasn't done. Move the gate on and
    // record the skip — the grade, the debrief and the export all read it as not completed.
    setTicked((prev) => { const x = new Set(prev); x.add(step); return x; });
    setSkipped((prev) => { const x = new Set(prev); x.add(step); return x; });
  }, [caseId, skipping, addAuto]);

  const sendMessage = async (textArg?: string) => {
    const content = (textArg ?? input).trim();
    if (!content || sending || isStreaming || !caseId) return;
    // Defense-in-depth: the composer is hidden while the next step is a hands-on procedure,
    // so also refuse to send then — manual steps are performed in the action panel, not by chat.
    // A dual-source step is NOT one of those: asking the patient is half of it, so the
    // composer must stay open (this guard used to make that step impossible to complete).
    const order = orderRef.current;
    const gi = gateIndex(order, tickedRef.current);
    const gate = gi < order.length ? order[gi] : null;
    if (gate !== null && panelOnlyRef.current.has(gate)) return;
    const updated: ChatMessage[] = [...messages, { role: "user", content, channel: "patient" }];
    setMessages(updated);
    if (textArg === undefined) setInput("");
    setSending(true);
    try {
      // Only the patient conversation is sent as context — EyeBot exam chatter is excluded.
      const patientHistory = toApi(updated.filter((m) => m.channel === "patient"));
      // Abort the SSE stream on unmount (navigating away mid-reply) so it doesn't hold a
      // scarce worker concurrency slot to completion — mirrors the observe path.
      chatAbort.current?.abort();
      const ctrl = new AbortController();
      chatAbort.current = ctrl;
      const res = await fetch(`/api/cases/${caseId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: patientHistory }),
        signal: ctrl.signal,
      });
      // Branda (2026-07-29): "after multiple queries the AI is unable to continue". Every
      // non-OK response used to collapse into one dead string, so a rate-limit was
      // indistinguishable from a crash and the consult looked broken. Name the cause.
      if (res.status === 429) throw new Error("rate");
      if (!res.ok || !res.body) throw new Error("down");
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
    } catch (err) {
      // The thread stays alive and the composer stays enabled in every case — a consult
      // that can't be continued is exactly the failure this is fixing.
      const fb = (err as Error)?.message === "rate"
        ? "(You're sending faster than the patient can answer — give it a moment, then carry on.)"
        : "(I'm having trouble reaching the service right now.)";
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant" && last.channel === "patient")
          return [...prev.slice(0, -1), { ...last, content: fb }];
        return [...prev, { role: "assistant", content: fb, channel: "patient" }];
      });
    } finally {
      setSending(false);
      setIsStreaming(false);
      setAttempts((n) => n + 1); // enough of these with no tick ⇒ offer the way out
      // Skip the follow-up examiner pass when the stream was aborted (component unmounted),
      // otherwise we'd schedule an observe fetch after unmount.
      if (!chatAbort.current?.signal.aborted) scheduleObserve(); // run the examiner after the reply completes
    }
  };

  // Clicking a manual chip switches the bottom composer into "procedure mode": the
  // student must type the steps/rules before the step ticks. Only a FULLY-done chip
  // is a no-op (.every, matching the palette's done state) — a merged chip whose run
  // is only partly ticked must still open so its remaining steps can be completed.
  const performAction = (a: ExamAction) => {
    if (sending || isStreaming) return; // don't interleave with a live patient stream
    if (a.satisfies_steps.every((n) => tickedRef.current.has(n))) return;
    const out = chipOutcome(a.satisfies_steps, tickedRef.current, dualStepsRef.current,
                            chartDoneRef.current, askedDualRef.current);
    // A QUICK dual chip is the record half of its step ("…verify with the EMR AND ask the
    // patient"): reveal what the record says and remember the half — but do NOT tick, the
    // step waits for the examiner to see the patient asked. If it already did, that credit
    // is held in askedDual and admits now; otherwise the next examiner pass carries
    // record_done and can credit the asking on its own. An ASSESSED dual chip (hand hygiene
    // fused with the identity check) still has a technique to type, so it falls through to
    // the procedure panel and confirmProcedure records the half.
    if (out.charted.length && a.quick) {
      const body = a.reveal_text ? ` → record checked · Result: ${a.reveal_text}` : " → record checked";
      setMessages((prev) => [...prev, { role: "user", content: `${EXAM_PREFIX}${a.label}${body}]`, channel: "eyebot" }]);
      applyCharted(out.charted);
      addAuto(out.tick);
      scheduleObserve();
      return;
    }
    // Quick (mechanical) procedures need no typed technique — tick on one click with a short
    // performed note, and skip the AI coaching call (nothing to coach) (ricoe C5).
    if (a.quick) {
      const body = a.reveal_text ? ` → performed · Result: ${a.reveal_text}` : "";
      setMessages((prev) => [...prev, { role: "user", content: `${EXAM_PREFIX}${a.label}${body}]`, channel: "eyebot" }]);
      addAuto(out.tick);
      scheduleObserve();
      return;
    }
    // Opening a procedure and not completing it is this pane's version of "I tried" — the
    // student who does it twice doesn't know the technique, so it counts toward the way out.
    setAttempts((n) => n + 1);
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
    // The confirmed technique IS the panel half of an assessed dual step (hand hygiene fused
    // with the identity check), so it is recorded here rather than ticking the step — the
    // consult still owes the other half. Every other chip ticks exactly as before.
    const out = chipOutcome(a.satisfies_steps, tickedRef.current, dualStepsRef.current,
                            chartDoneRef.current, askedDualRef.current);
    applyCharted(out.charted);
    addAuto(out.tick);
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
        body: JSON.stringify({ messages: toApi(messages), findings: findings.trim(), recommendation: recommendation.trim(), performed_steps: performedOnly(ticked, skipped), skipped_steps: Array.from(skipped) }),
      });
      if (!res.ok) { setSubmitError(submitErrorMessage(res.status)); return; }
      const data = (await res.json()) as { result: DomainResult; coaching?: Coaching; lumens_awarded?: number };
      setResult(data.result);
      setCoaching(data.coaching ?? null);
      setShowSubmit(false);
      qc.invalidateQueries({ queryKey: ["progress"] });
      // Past this line the station IS graded and the debrief is on screen. Confetti and
      // Lumens are a garnish — if any of it throws it must not surface as "submission
      // failed", which the one outer catch used to do.
      try {
        const sc = data.result.score_100 ?? 0;
        const ids = ["first_station",
          ...(sc >= 60 ? ["station_pass"] : []),
          ...(sc >= 100 && data.result.safe && data.result.missed_critical.length === 0 ? ["flawless_station"] : [])];
        grantAchievements(user?.studentId ?? "", ids, data.lumens_awarded ?? 0).forEach(enqueue);
      } catch { /* graded and shown — an achievement hiccup is not the student's problem */ }
    } catch { setSubmitError(submitErrorMessage(null)); }  // fetch/JSON threw: it never landed
    finally { setSubmitting(false); }
  };

  // One-time session save: assemble the whole session (grade, AI summary, checklist, both
  // transcripts) into one printable HTML file and download it. Client-side + idempotent —
  // saved once, then the button is spent and the ephemeral session can't be saved again.
  const handleSave = () => {
    if (saved || !result || !caseInfo || !station) return;
    const checklist = station.checklist.phases.flatMap((p) =>
      p.steps.map((s) => ({
        phase: p.name, action: s.action, critical: s.critical,
        done: ticked.has(s.step_number) && !skipped.has(s.step_number), skipped: skipped.has(s.step_number),
      })),
    );
    const patientTranscript = messages
      .filter((m) => m.channel === "patient")
      .map((m) => ({ who: m.role === "user" ? "Student" : caseInfo.patient.name, text: m.content }));
    const actionTranscript = messages.filter((m) => m.channel === "eyebot").map(decodeActionMessage);
    const doneCount = checklist.filter((s) => s.done).length;
    const data: SessionExportData = {
      meta: {
        caseId, caseTitle: caseInfo.title, patientName: caseInfo.patient.name,
        patientAge: caseInfo.patient.age, topic: caseInfo.topic, difficulty: tierLabel(caseInfo.difficulty),
        studentName: displayName(user?.fullName, "Student"), dateStr: new Date().toLocaleString(),
      },
      // What the clock MEANT, not just what it read — crossed with coverage, so finishing
      // early with steps outstanding never reads as being fast.
      pace: paceRead(clock.elapsedMs, caseInfo.estimated_minutes, doneCount, checklist.length),
      score: {
        score100: result.score_100, verdict: result.verdict, safe: result.safe,
        missedCritical: result.missed_critical,
        buckets: scoreBuckets(result),
      },
      summary: {
        highlights: coaching?.highlights ?? [], didWrong: coaching?.did_wrong ?? [],
        missed: coaching?.missed ?? [], focus: coaching?.focus ?? "",
      },
      checklist, patientTranscript, actionTranscript,
    };
    const blob = new Blob([buildSessionHtml(data)], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `EyeBot-OSCE-${caseId}-${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setSaved(true);
  };

  const phases = station?.checklist.phases ?? [];
  const allSteps: StationStep[] = phases.flatMap((p) => p.steps);
  const criticalSteps = allSteps.filter((s) => s.critical);
  // A skipped step passed the gate but was never done, so it still counts as outstanding
  // here — the handover warning must not go quiet because a critical step was given up on.
  const uncheckedCritical = criticalSteps.filter((s) => !ticked.has(s.step_number) || skipped.has(s.step_number));
  const gateStep = currentStep(allSteps.map((s) => s.step_number), ticked); // current unlockable step, or null
  const clock = timerState(startedAt.current, nowMs, caseInfo?.estimated_minutes ?? 0);

  // The gate moved (or the station loaded) → the student isn't stuck any more.
  useEffect(() => { setAttempts(0); }, [gateStep]);

  const patientMessages = messages.filter((m) => m.channel === "patient").map(({ role, content }) => ({ role, content }));
  const eyebotMessages = messages.filter((m) => m.channel === "eyebot").map(({ role, content }) => ({ role, content }));
  const manualActions = (station?.examination_actions ?? []).filter((a) => a.kind === "manual");
  const hasEyebot = manualActions.length > 0;
  // The patient chat locks while the next checklist step is a hands-on procedure, so the
  // student performs it in the action panel (not by talking). Conversation-only cases (no
  // manual actions) never lock. A DUAL-SOURCE step is excluded: asking the patient is half
  // of it, so it must leave both panes live (the lock made that step impossible).
  const manualStepNumbers = panelOnlySteps(manualActions);
  // One source of truth for "where do I act now" — drives the pane spotlight, the badges
  // and the patient-composer lock that used to be computed separately here.
  const { turn, badge } = stationTurn(gateStep, manualStepNumbers, {
    loaded: !!station, hasResult: !!result, hasEyebot,
  });
  const patientLocked = turn === "eyebot";
  // Which half of the gate step is still outstanding, and the chips' half-done affordance.
  const halfOf = (step: number) => dualHalf(step, dualStepsRef.current, chartDone, askedDual, ticked);
  // Which patient-facing half the step owes — "now ask the patient" on a hygiene+identity
  // step would send the student hunting for a question the step never asked for.
  const dualKindOf = (step: number): DualKind =>
    ((station?.examination_actions ?? []).find((a) => (a.also_ask_steps ?? []).includes(step))
      ?.dual_kind as DualKind) || "ask";
  const gateHint = gateStep === null || result ? "" : dualHint(halfOf(gateStep), dualKindOf(gateStep));

  if (loadError) {
    return (
      <div className="aurora-station-error">
        {loadError === "missing"
          ? <p>Patient &quot;{caseId}&quot; not found.</p>
          : <ApiErrorNotice cause="Couldn’t open this station" />}
        <button type="button" onClick={() => router.push("/cases")}>← Back to patients</button>
      </div>
    );
  }

  return (
    <div className="aurora-station" data-testid="station">
      <div className="aurora-station-mesh" aria-hidden />

      <header className="aurora-station-head">
        <button type="button" className="aurora-station-back" data-testid="station-leave" onClick={attemptLeave}>← Patients</button>
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
              {/* The case TOPIC is the diagnosis on many cases (e.g. subconjunctival_haemorrhage)
                  — showing it here hands the student the answer before they start (Branda,
                  2026-07-29). The procedure is the honest label; the topic returns in the debrief. */}
              <span>{station?.checklist.procedure_name ?? "OSCE station"}</span>
              <span className="aurora-station-hud-sep">·</span>
              <span className="aurora-station-tier">{tierLabel(caseInfo.difficulty)}</span>
            </div>
          )}
        </div>
        {/* The clock is its own header pill, not a word in the metadata row — students were
            missing the pace entirely. Still soft: it goes negative and keeps counting, and
            nothing auto-submits (Branda: "no time limit for completing each case"). */}
        {clock.tone !== "none" && !result && (
          <div className="aurora-station-clockpill" data-tone={clock.tone} data-testid="station-clockpill"
               role="timer" aria-label={clock.tone === "over" ? `Over the ${caseInfo?.estimated_minutes}-minute guide by ${clock.label.replace("-", "")}` : `${clock.label} left of the ${caseInfo?.estimated_minutes}-minute guide`}>
            <span className="lb">{clock.tone === "over" ? "Over by" : "Time left"}</span>
            <span className="aurora-station-clock" data-testid="station-clock">
              {clock.tone === "over" ? clock.label.replace("-", "") : clock.label}
            </span>
            <span className="bar" aria-hidden><i style={{ width: `${(1 - clock.progress) * 100}%` }} /></span>
          </div>
        )}
        <HelpButton surface="station" onReplay={replayBriefing} />
      </header>

      <div className="aurora-station-grid" data-eyebot={hasEyebot ? "true" : "false"} data-turn={turn ?? "none"}>
        {/* Left — patient + auto-tracked checklist (unchanged) */}
        <aside className="aurora-station-card aurora-station-aside">
          {caseInfo && (
            <>
              <div className="aurora-station-pt">
                <div className="aurora-station-ring"><img className="aurora-station-av" src={caseInfo.patient.face ?? PLATE.caseSession} alt="" aria-hidden onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} /></div>
                <div>
                  <div className="aurora-station-nm">{caseInfo.patient.name}</div>
                  <div className="aurora-station-mt">{caseInfo.patient.age} years</div>
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
                skipped={skipped}
                current={gateStep}
              />
            </div>
          )}
          {station && !result && (
            <>
              <button type="button" className="aurora-station-submit-toggle" onClick={() => setShowSubmit(true)}>
                Submit handover →
              </button>
              <p className="aurora-station-stakes">Leaving before you submit forfeits {FORFEIT_LUMENS} Lumens.</p>
            </>
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
          locked={patientLocked}
          active={turn === "patient"}
          turnBadge={turn === "patient" ? badge : ""}
          canSkip={turn === "patient" && canSkip(turn, attempts, !!result)}
          skipping={skipping}
          onSkip={() => void skipStep()}
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
            active={turn === "eyebot"}
            turnBadge={turn === "eyebot" ? badge : ""}
            busy={sending || isStreaming}
            canSkip={turn === "eyebot" && canSkip(turn, attempts, !!result)}
            skipping={skipping}
            dualHint={gateHint}
            halfOf={halfOf}
            onSkip={() => void skipStep()}
            onPerform={performAction}
            onProcText={setProcText}
            onConfirm={confirmProcedure}
            onCancel={cancelProcedure}
          />
        )}
      </div>

      {clock.tone === "over" && !result && (
        <p className="aurora-station-overtime" data-testid="station-overtime">
          Time's up — write your handover now. Nothing is lost; the clock is for pace only.
        </p>
      )}

      {(showSubmit || result) && (
        <div className="aurora-station-overlay" role="dialog" aria-modal="true">
          <div className="aurora-station-overlay-scrim" onClick={() => { if (!result) setShowSubmit(false); }} aria-hidden />
          <div className="aurora-station-overlay-card">
            {!result ? (
              <div className="aurora-station-form">
                <button type="button" className="aurora-station-overlay-x" onClick={() => setShowSubmit(false)} aria-label="Close">✕</button>
                <p className="aurora-eyebrow">Handover</p>
                <p className="aurora-station-form-hint">You're documenting a handover — what you found and what you recommend, within your role. You don't make a medical diagnosis or prescribe treatment; that's for the doctor. Not every case needs escalation: if nothing is urgent, say so — &ldquo;routine, patient follows appointment time&rdquo; is a complete answer.</p>
                {uncheckedCritical.length > 0 && (
                  <p className="aurora-station-warn">⚠ {uncheckedCritical.length} critical step{uncheckedCritical.length !== 1 ? "s" : ""} not yet done</p>
                )}
                <label className="aurora-eyebrow">Findings</label>
                <textarea className="aurora-input" data-field="findings" value={findings} onChange={(e) => setFindings(e.target.value)} placeholder="What you found and recognised — key history, test results, red-flag check…" rows={3} />
                <label className="aurora-eyebrow">Next steps</label>
                <textarea className="aurora-input" data-field="recommendation" value={recommendation} onChange={(e) => setRecommendation(e.target.value)} placeholder="What happens next — continue as routine, or escalate/refer (say who, and how urgently), plus what you'd advise the patient…" rows={3} />
                {submitError && <p className="aurora-station-warn">{submitError}</p>}
                <button type="button" className="aurora-station-submit-go" disabled={submitting || !findings.trim() || !recommendation.trim()} onClick={handleSubmit}>
                  {submitting ? "Evaluating…" : "Submit handover →"}
                </button>
              </div>
            ) : (
              <StationResult result={result} coaching={coaching} topic={caseInfo?.topic ?? ""} saved={saved} onSave={handleSave} onMore={() => router.push("/cases")} onDash={() => router.push("/homepage")} />
            )}
          </div>
        </div>
      )}

      {leaveConfirm && (
        <div className="aurora-station-overlay" role="dialog" aria-modal="true" data-testid="station-leave-overlay">
          <div className="aurora-station-overlay-scrim" onClick={cancelLeave} aria-hidden />
          <div className="aurora-station-overlay-card aurora-station-leave">
            <p className="aurora-eyebrow">Leave the station?</p>
            <p className="aurora-station-form-hint">
              You haven't submitted your handover yet. Leaving now forfeits <b>{FORFEIT_LUMENS} Lumens</b> and the station counts as incomplete. No take-backs.
            </p>
            <div className="aurora-station-result-actions">
              <button type="button" className="aurora-station-leave-go" data-testid="station-leave-confirm" onClick={confirmLeave}>Leave &amp; forfeit {FORFEIT_LUMENS}</button>
              <button type="button" className="aurora-station-submit-go" data-testid="station-leave-cancel" autoFocus onClick={cancelLeave}>Stay in the station</button>
            </div>
          </div>
        </div>
      )}

      {showBriefing && station && !result && (
        <StationBriefing hasEyebot={hasEyebot} onDone={dismissBriefing} />
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
function StationResult({ result, coaching, topic, saved, onSave, onMore, onDash }: {
  result: DomainResult; coaching: Coaching | null; topic: string; saved: boolean;
  onSave: () => void; onMore: () => void; onDash: () => void;
}) {
  const { ref, display } = useCountUp<HTMLSpanElement>(result.score_100, { format: (n) => String(Math.round(n)) });
  const tone = VERDICT_TONE[result.verdict] ?? "ok";
  const missedOne = result.missed_critical[0];

  // Branda (2026-07-29): students couldn't tell why each bucket scored what it did. The
  // sub-scores come from the backend (it owns the formula) and the per-domain feedback has
  // been on the wire all along — the UI simply never rendered it.
  const comps = scoreBuckets(result);
  return (
    <div className="aurora-station-result" data-tone={tone}>
      <div className="aurora-s100-head">
        <div>
          {/* Safe to name the topic now the station is over — it was hidden throughout so
              the student had to reach the impression themselves. */}
          <p className="aurora-eyebrow">Station complete{topic ? ` · ${topic.replace(/_/g, " ")}` : ""}</p>
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
            {c.parts && c.parts.length > 0 && (
              <p className="aurora-s100-maths" data-testid="score-maths">
                {c.parts.map((part) => `${part.label} ${part.pts}/${part.max}`).join(" · ")}
                {" → "}
                <b>{c.pts}/{c.max}</b>
              </p>
            )}
            {c.capReason && (
              <p className="aurora-s100-cap" data-testid="score-cap">⚠ {c.capReason}</p>
            )}
            {(c.notes ?? []).map((n, i) => <p key={i} className="aurora-s100-why">{n}</p>)}
          </div>
        ))}
      </div>

      {coaching && (coaching.highlights.length > 0 || coaching.did_wrong.length > 0 || coaching.missed.length > 0) && (
        <div className="aurora-s100-coach" data-testid="ai-summary">
          {coaching.highlights.length > 0 && (
            <div className="aurora-s100-col is-good">
              <p className="aurora-s100-col-h">✓ What you did well</p>
              <ul>{coaching.highlights.map((h, i) => <li key={i} style={{ animationDelay: `${i * 70}ms` }}>{h}</li>)}</ul>
            </div>
          )}
          {coaching.did_wrong.length > 0 && (
            <div className="aurora-s100-col is-watch">
              <p className="aurora-s100-col-h">✗ Done wrong or only partially</p>
              <ul>{coaching.did_wrong.map((w, i) => <li key={i} style={{ animationDelay: `${i * 70}ms` }}>{w}</li>)}</ul>
            </div>
          )}
          {coaching.missed.length > 0 && (
            <div className="aurora-s100-col is-miss">
              <p className="aurora-s100-col-h">○ Missed or lacking</p>
              <ul>{coaching.missed.map((m, i) => <li key={i} style={{ animationDelay: `${i * 70}ms` }}>{m}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      {coaching?.focus && (
        <div className="aurora-s100-focus"><b>One thing for next time:</b> {coaching.focus}</div>
      )}

      <div className="aurora-station-save-row">
        <button type="button" className="aurora-station-save" data-testid="save-session" onClick={onSave} disabled={saved}>
          {saved ? "✓ Insights downloaded" : "⬇ Download session insights"}
        </button>
        <span className="aurora-station-save-note">
          {saved
            ? "Downloaded — open it or print to PDF to keep."
            : "Your personalised breakdown — what you did well, done wrong or only partially, and missed or lacking — plus your score and full transcript. One-time download."}
        </span>
      </div>

      <div className="aurora-station-result-actions">
        <button type="button" className="aurora-toggle" onClick={onMore}>More patients</button>
        <button type="button" className="aurora-station-submit-go" onClick={onDash}>Back to dashboard</button>
      </div>
    </div>
  );
}
