"use client";
/* StationChecklist — the auto-tracked OSCE checklist for the Guided OSCE Station.
   READ-ONLY by design (2026-07-29): steps tick from the consult (/observe) or the action
   panel, never from a tap. Two things drove that — students were ticking rows instead of
   doing the work, and a fully-visible list is a script they read off instead of recalling
   their own history-taking questions (Branda). So rows are <li>, not <button>, and only
   earned text is printed: done + current are readable, everything ahead is masked
   (stationMask.ts). A 3-segment phase rail and per-phase counters keep progress legible —
   the student always knows HOW FAR they are, just not WHAT'S NEXT.
   Presentational — all state is owned by the parent. */
import { useEffect, useRef } from "react";
import { stepDisplay, isRevealed, maskFor, stepMark } from "@/aurora/lib/stationMask";

export interface StationStep {
  step_number: number;
  action: string;
  critical: boolean;
  category: string;
  notes: string | null;
}
export interface StationPhase {
  phase: number;
  name: string;
  steps: StationStep[];
}

const PHASE_CLASS: Record<number, string> = { 1: "p1", 2: "p2", 3: "p3" };

export function StationChecklist({
  procedureName,
  phases,
  ticked,
  autoSteps,
  skipped,
  current,
}: {
  procedureName: string;
  phases: StationPhase[];
  totalSteps: number; // kept for call-site compatibility
  ticked: Set<number>;
  autoSteps: Set<number>;
  /** Past the gate but never completed — rendered distinctly, and never counted as done. */
  skipped: Set<number>;
  current: number | null;
}) {
  // Keep the step you're on in view as the gate advances (ricoe C8). `block:"nearest"`
  // scrolls only the checklist's scroll container, minimally, and does nothing if the
  // current step is already visible — so no distracting jump on every auto-tick.
  const curRef = useRef<HTMLLIElement>(null);
  useEffect(() => { curRef.current?.scrollIntoView({ block: "nearest" }); }, [current]);

  // Two counts, because a skipped step passes the gate WITHOUT being done: `passedCounts`
  // says where you are (so the phase rail keeps moving), `doneCounts` says what you actually
  // completed (so the numbers never take credit for a skip).
  const passedCounts = phases.map((p) => p.steps.filter((s) => ticked.has(s.step_number)).length);
  const doneCounts = phases.map((p) => p.steps.filter((s) => ticked.has(s.step_number) && !skipped.has(s.step_number)).length);
  const totalSteps = phases.reduce((n, p) => n + p.steps.length, 0);
  const doneTotal = doneCounts.reduce((n, d) => n + d, 0);
  // "current" phase = first phase the gate hasn't cleared; -1 once all are behind you.
  const currentIdx = passedCounts.findIndex((passed, i) => passed < phases[i].steps.length);
  const anyAuto = phases.some((p) => p.steps.some((s) => autoSteps.has(s.step_number)));
  const anySkipped = skipped.size > 0;

  return (
    <div>
      <div className="aurora-station-rail" role="list" aria-label="OSCE phases">
        {phases.map((p, i) => {
          const done = passedCounts[i] === p.steps.length;
          const now = i === currentIdx;
          const cls = done ? "is-done" : now ? "is-now" : "is-todo";
          return (
            <div key={p.phase} className={`aurora-station-rl ${cls}`} role="listitem">
              <b>{`①②③`[i] ?? p.phase} {shortPhase(p.name)}</b>
              {doneCounts[i]}/{p.steps.length}
            </div>
          );
        })}
      </div>

      <p className="aurora-station-cl-label" title={procedureName}>
        Checklist · {doneTotal} of {totalSteps} done
      </p>
      <p className="aurora-station-cl-help">
        Steps tick themselves as you work — talk to the patient, or use the EyeBot panel.
      </p>

      {phases.map((p, i) => {
        const done = passedCounts[i] === p.steps.length;
        const now = i === currentIdx;
        return (
          <div key={p.phase} className={`aurora-station-phase ${PHASE_CLASS[p.phase] ?? "p2"}${done ? " is-done" : ""}${now ? " is-now" : ""}`}>
            <div className="aurora-station-phase-h">
              <span className="aurora-station-node" aria-hidden />
              <span className="aurora-station-phase-t">{p.name}</span>
              <span className="aurora-station-phase-n" aria-hidden>{doneCounts[i]}/{p.steps.length}</span>
            </div>
            <ul className="aurora-station-steps">
              {p.steps.map((s) => {
                const display = stepDisplay(s.step_number, ticked, skipped, current);
                const revealed = isRevealed(display);
                const { glyph, tone } = stepMark(display);
                return (
                  <li
                    key={s.step_number}
                    ref={display === "current" ? curRef : undefined}
                    className="aurora-station-step"
                    data-display={display}
                    data-tone={tone}
                    data-ticked={display === "done" ? "true" : "false"}
                    data-current={display === "current" ? "true" : "false"}
                    data-locked={display === "masked" ? "true" : "false"}
                    aria-current={display === "current" ? "step" : undefined}
                    title={display === "masked" ? "Unlocks as you complete the steps above" : undefined}
                  >
                    <span className="bx" aria-hidden>{glyph}</span>
                    {revealed ? (
                      <span>{s.action}</span>
                    ) : (
                      <>
                        <span className="mask" aria-hidden>{maskFor(s.action)}</span>
                        <span className="sr-only">Upcoming step, hidden until it is your turn</span>
                      </>
                    )}
                    {/* Words, not colour alone — the row has to state the failure for anyone
                        who can't separate the two reds, and for the printed record. */}
                    {display === "skipped" && <span className="miss">NOT DONE</span>}
                    {revealed && s.critical && <span className="crit">CRIT</span>}
                    {display === "done" && autoSteps.has(s.step_number) && (
                      <span className="au" title="Auto-detected from your consult" aria-label="auto-detected">✦</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <p className="aurora-station-cl-legend">
        {anyAuto ? <><span className="au">✦</span> ticked automatically from your conversation · </> : null}
        {anySkipped ? <><span className="miss-key">!</span> you couldn&rsquo;t complete this — it counts as not done · </> : null}
        upcoming steps stay hidden so you recall them yourself
      </p>
    </div>
  );
}

/* Short rail caption: first 1–2 meaningful words of the phase name. */
function shortPhase(name: string): string {
  const map: Record<string, string> = {
    "Preparation & Identification": "Prep & ID",
    "Clinical Assessment": "Assessment",
    "Documentation & Follow-up": "Documentation",
  };
  return map[name] ?? name;
}
