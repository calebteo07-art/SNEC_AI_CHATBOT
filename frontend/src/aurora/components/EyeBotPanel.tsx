"use client";
/* EyeBotPanel — the cool "talk to EyeBot" pane: hands-on manual procedures only.
   The student picks a procedure chip (ActionPalette), types their technique, and
   EyeBot replies with the deterministic reading + a short coaching note. Renders
   only eyebot-channel messages. Presentational — state lives in CaseSession. */
import { ActionPalette, type ExamAction } from "@/aurora/components/ActionPalette";

const EXAM_PREFIX = "[Examination performed: ";

interface EyeBotMessage { role: "user" | "assistant"; content: string }

export function EyeBotPanel({
  messages,
  actions,
  ticked,
  current,
  activeProcedure,
  procText,
  coaching,
  showActions,
  busy,
  onPerform,
  onProcText,
  onConfirm,
  onCancel,
}: {
  messages: EyeBotMessage[];
  actions: ExamAction[];
  ticked: Set<number>;
  current: number | null;
  activeProcedure: ExamAction | null;
  procText: string;
  coaching: boolean;
  showActions: boolean;
  busy: boolean;
  onPerform: (action: ExamAction) => void;
  onProcText: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="aurora-station-card aurora-station-main aurora-eyebot" data-testid="eyebot-pane">
      <div className="aurora-pane-head aurora-eyebot-head">
        <span className="aurora-pane-dot" aria-hidden />
        <div>
          <div className="aurora-pane-nm">EyeBot</div>
          <div className="aurora-pane-mt">Manual procedures · examiner</div>
        </div>
      </div>

      <div className="aurora-station-thread aurora-eyebot-thread">
        {messages.length === 0 && (
          <p className="aurora-station-hint">Pick a procedure below, then describe your technique. EyeBot returns the reading and a quick tip.</p>
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
            <div key={i} className="aurora-station-bubble bot">
              <span className="who">EyeBot</span>
              <div>{m.content}</div>
            </div>
          );
        })}
        {coaching && <div className="aurora-station-bubble bot"><div className="aurora-typing">•••</div></div>}
      </div>

      {showActions && (
        <>
          <ActionPalette
            actions={actions}
            ticked={ticked}
            current={current}
            activeKey={activeProcedure?.key ?? null}
            onPerform={onPerform}
          />
          {activeProcedure && (
            <div className="aurora-station-proc">
              <div className="aurora-station-proc-cap">
                <span><b>{activeProcedure.label}</b> — type the steps &amp; safety rules you'd follow</span>
                <button type="button" className="aurora-station-proc-x" onClick={onCancel}>Cancel</button>
              </div>
              <div className="aurora-station-composer">
                <textarea
                  className="aurora-station-composer-input aurora-station-proc-input"
                  value={procText}
                  onChange={(e) => onProcText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onConfirm(); } }}
                  placeholder={`How you perform ${activeProcedure.label.toLowerCase()} — key steps, what you tell the patient, safety checks…`}
                  rows={2}
                  autoFocus
                />
                <button
                  type="button"
                  className="aurora-station-composer-send aurora-station-proc-go"
                  onClick={onConfirm}
                  disabled={busy || procText.trim().length < 12}
                  aria-label="Log procedure"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg>
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
