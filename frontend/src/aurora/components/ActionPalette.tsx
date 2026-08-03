"use client";
/* ActionPalette — the quiet "manual procedures" strip above the composer. Only
   hands-on procedures (hand hygiene, VA, IOP, slit-lamp…) appear here; everything
   verbal (history, intro, consent…) is typed in the live consult and auto-ticked
   by the examiner. Clicking a chip does NOT auto-complete the step — the parent
   switches the composer into "procedure mode" where the student types the technique
   before it ticks. Presentational — all state is owned by the parent. */

// The transcript marker for a logged manual procedure. Shared so the writer
// (CaseSession.confirmProcedure) and the reader (EyeBotPanel reveal parser) can
// never drift out of sync.
export const EXAM_PREFIX = "[Examination performed: ";

// Marker for a real-time technique GRADE (ricoe C6). The JSON payload follows the
// marker with no trailing bracket (JSON may contain "]"), so readers slice the prefix
// only. Written by CaseSession.runAction, rendered by EyeBotPanel.
export const GRADE_PREFIX = "[[GRADE]]";

export interface ActionGrade {
  verdict: "strong" | "partial" | "developing" | string;
  covered: string[];
  missing: string[];
  model_answer: string;
  coaching: string;
}

export interface ExamAction {
  key: string;
  label: string;
  reveal_text: string;
  satisfies_steps: number[];
  mode: "do" | "say";
  prompt_text: string;
  phase: number;
  critical: boolean;
  step_number: number;
  kind: "manual" | "verbal";
  /** Manual chip with no assessable technique — ticks on one click, no typed explanation. */
  quick?: boolean;
  /** Dual-source step: this chip is only the CHART half, the patient must be asked too. */
  also_ask?: boolean;
}

export function ActionPalette({
  actions,
  ticked,
  current,
  activeKey,
  halfOf,
  onPerform,
}: {
  actions: ExamAction[];
  ticked: Set<number>;
  current: number | null;
  activeKey: string | null;
  /** Half-done state of one step for a dual-source chip (see lib/dualStep). */
  halfOf?: (step: number) => "none" | "record" | "asked";
  onPerform: (action: ExamAction) => void;
}) {
  const manual = actions.filter((a) => a.kind === "manual");
  if (manual.length === 0) return null;
  return (
    <div className="aurora-protray">
      <span className="aurora-protray-cap">Manual procedures · click one, then type your technique <em>(some just tick)</em></span>
      <div className="aurora-protray-chips">
        {manual.map((a) => {
          const done = a.satisfies_steps.every((n) => ticked.has(n));
          const earliest = a.satisfies_steps.find((n) => !ticked.has(n));
          const locked = !done && earliest !== undefined && earliest !== current;
          const active = a.key === activeKey;
          // A dual-source chip whose CHART half is already recorded has nothing left to do
          // here — the rest of the step happens in the consult, so it reads half-done and
          // stops taking clicks (re-clicking would just re-post the same reveal).
          const half = earliest === undefined ? "none" : halfOf?.(earliest) ?? "none";
          const charted = half === "record";
          return (
            <button
              key={a.key}
              type="button"
              className="aurora-pchip"
              data-done={done ? "true" : "false"}
              data-active={active ? "true" : "false"}
              data-locked={locked ? "true" : "false"}
              data-crit={a.critical ? "true" : "false"}
              data-quick={a.quick ? "true" : "false"}
              data-half={half}
              disabled={done || locked || charted}
              onClick={() => onPerform(a)}
              aria-label={done ? `${a.label} — done` : locked ? `${a.label} — locked` : charted ? `${a.label} — record checked, now ask the patient` : a.quick ? `Mark ${a.label} done` : `Perform ${a.label}`}
              title={locked ? "Finish the steps above first" : charted ? "Record checked — now ask the patient" : a.also_ask ? "Check the record, then ask the patient — this step needs both" : a.quick ? "Click to mark done — no typing needed" : a.reveal_text || a.label}
            >
              <span className="ic" aria-hidden>{done ? "✓" : charted ? "◐" : active ? "✎" : locked ? "🔒" : a.quick ? "⚡" : "+"}</span>
              {a.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
