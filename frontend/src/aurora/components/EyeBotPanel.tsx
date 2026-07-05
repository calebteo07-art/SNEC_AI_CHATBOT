"use client";
/* EyeBotPanel — the cool "talk to EyeBot" pane: hands-on manual procedures only.
   The student picks a procedure chip (ActionPalette), types their technique, and
   EyeBot replies with the deterministic reading + a short coaching note. Renders
   only eyebot-channel messages. Presentational — state lives in CaseSession. */
import { useEffect, useRef } from "react";
import { ActionPalette, EXAM_PREFIX, GRADE_PREFIX, type ExamAction, type ActionGrade } from "@/aurora/components/ActionPalette";

const VERDICT_LABEL: Record<string, string> = {
  strong: "Strong technique", partial: "Partial", developing: "Developing",
};

/* Real-time grade of a typed technique vs the case's crafted model answer (ricoe C6):
   a verdict chip, what the student covered, what the model answer still expects, the
   grounded coaching tip, and the model answer itself so they learn the reference. */
function GradeCard({ grade }: { grade: ActionGrade }) {
  const tone = grade.verdict === "strong" ? "great" : grade.verdict === "partial" ? "ok" : "low";
  return (
    <div className="aurora-grade" data-tone={tone} data-testid="action-grade">
      <div className="aurora-grade-head">
        <span className="aurora-grade-badge">{VERDICT_LABEL[grade.verdict] ?? grade.verdict}</span>
        {grade.coaching && <span className="aurora-grade-tip">{grade.coaching}</span>}
      </div>
      {grade.covered.length > 0 && (
        <ul className="aurora-grade-list is-covered">
          {grade.covered.map((c, i) => <li key={i}><span aria-hidden>✓</span>{c}</li>)}
        </ul>
      )}
      {grade.missing.length > 0 && (
        <ul className="aurora-grade-list is-missing">
          {grade.missing.map((m, i) => <li key={i}><span aria-hidden>◦</span>{m}</li>)}
        </ul>
      )}
      {grade.model_answer && (
        <p className="aurora-grade-model"><b>Model answer:</b> {grade.model_answer}</p>
      )}
    </div>
  );
}

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
  // Auto-scroll the EyeBot thread to the latest reveal / coaching note (ricoe C8), scoped
  // to the pane so it never yanks the page. Setting scrollTop directly is a no-op when the
  // thread isn't a scroll container (mobile stack), so it's safe across layouts.
  const threadRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, coaching]);

  return (
    <section className="aurora-station-card aurora-station-main aurora-eyebot" data-testid="eyebot-pane">
      <div className="aurora-pane-head aurora-eyebot-head">
        {/* Action pfp — a static hand (ricoe C9). */}
        <span className="aurora-pane-dot" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
            <path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2" />
            <path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8" />
            <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
          </svg>
        </span>
        <div>
          <div className="aurora-pane-nm">EyeBot</div>
          <div className="aurora-pane-mt">Manual procedures · examiner</div>
        </div>
      </div>

      <div className="aurora-station-thread aurora-eyebot-thread" ref={threadRef}>
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
          if (m.role === "assistant" && m.content.startsWith(GRADE_PREFIX)) {
            try {
              const grade = JSON.parse(m.content.slice(GRADE_PREFIX.length)) as ActionGrade;
              return <GradeCard key={i} grade={grade} />;
            } catch { /* fall through to a plain bubble */ }
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
