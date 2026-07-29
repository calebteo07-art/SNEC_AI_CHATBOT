"use client";
/* PatientChat — the warm "talk to the patient" pane of the OSCE station. Renders
   only patient-channel messages as a consult thread + a free-typed composer. Pure
   conversation: vocal/history steps are typed here and the examiner (/observe)
   auto-ticks them. Presentational — all state lives in CaseSession. */
import { type KeyboardEvent, type RefObject } from "react";

interface PatientMessage { role: "user" | "assistant"; content: string }

export function PatientChat({
  patientName,
  patientFace,
  messages,
  input,
  sending,
  isStreaming,
  hasResult,
  locked,
  active,
  turnBadge,
  canUnstick,
  unsticking,
  onUnstick,
  endRef,
  onInputChange,
  onSend,
  onKeyDown,
}: {
  patientName: string;
  patientFace?: string;
  messages: PatientMessage[];
  input: string;
  sending: boolean;
  isStreaming: boolean;
  hasResult: boolean;
  /** The next checklist step is a hands-on procedure → the patient composer is locked so
      the student performs it in the EyeBot action panel (not by chatting). */
  locked: boolean;
  /** This pane is where the student must act right now. */
  active: boolean;
  /** Badge copy — names the CHANNEL, never the clinical step. Empty when not active. */
  turnBadge: string;
  /** Three messages on the same step with no tick — offer the stuck-valve. */
  canUnstick: boolean;
  unsticking: boolean;
  onUnstick: () => void;
  endRef: RefObject<HTMLDivElement | null>;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <section className="aurora-station-card aurora-station-main aurora-patient" data-testid="patient-pane">
      <div className="aurora-pane-head aurora-patient-head">
        {/* Conversation pfp — the demographic archetype face (ricoe §8), SVG fallback. */}
        <span className="aurora-pane-dot aurora-pane-face" aria-hidden>
          {patientFace ? (
            <img src={patientFace} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          )}
        </span>
        <div>
          <div className="aurora-pane-nm">{patientName}</div>
          <div className="aurora-pane-mt">Patient · talk to take a history</div>
        </div>
        {active && turnBadge && (
          <span className="aurora-pane-turn" data-testid="turn-badge">{turnBadge}</span>
        )}
      </div>

      <div className="aurora-station-thread">
        {messages.length === 0 && !hasResult && (
          <p className="aurora-station-hint">Greet your patient and begin taking a history. Manual tests are done with EyeBot.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`aurora-station-bubble ${m.role === "user" ? "me" : "pt"}`}>
            <span className="who">{m.role === "user" ? "You" : patientName}</span>
            <div>
              {m.content}
              {isStreaming && i === messages.length - 1 && m.role === "assistant" && <span className="aurora-caret" />}
            </div>
          </div>
        ))}
        {sending && <div className="aurora-station-bubble pt"><div className="aurora-typing">•••</div></div>}
        <div ref={endRef} />
      </div>

      {!hasResult && locked && (
        <div className="aurora-station-locknote" data-testid="patient-lock">
          🔒 Next step is a hands-on procedure — perform it in the EyeBot panel.
        </div>
      )}

      {!hasResult && !locked && canUnstick && (
        <button
          type="button"
          className="aurora-station-unstick"
          data-testid="station-unstick"
          onClick={onUnstick}
          disabled={unsticking}
        >
          {unsticking ? "Re-checking your consult…" : "Examiner didn't catch that?"}
        </button>
      )}

      {!hasResult && !locked && (
        <div className="aurora-station-composer">
          <textarea
            className="aurora-station-composer-input"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Talk to your patient…"
            rows={1}
          />
          <button
            type="button"
            className="aurora-station-composer-send"
            onClick={onSend}
            disabled={!input.trim() || sending || isStreaming}
            aria-label="Send"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        </div>
      )}
    </section>
  );
}
