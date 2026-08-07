"use client";
/* PatientChat — the warm "talk to the patient" pane of the OSCE station. Renders
   only patient-channel messages as a consult thread + a free-typed composer. Pure
   conversation: vocal/history steps are typed here and the examiner (/observe)
   auto-ticks them. Presentational — all state lives in CaseSession. */
import { type KeyboardEvent, type RefObject } from "react";
import { SkipStepButton } from "@/aurora/components/SkipStepButton";
import { autogrow } from "@/aurora/lib/autogrow";

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
  canSkip,
  skipping,
  onSkip,
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
  /** Enough messages on the same step with no tick — offer the way out (stationTurn.canSkip). */
  canSkip: boolean;
  skipping: boolean;
  onSkip: () => void;
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

      {/* role="log" + aria-live so a screen reader hears the patient answer, and tabIndex/
          role="region" so a keyboard user can reach and scroll the scrollback at all. The
          Tutor's ChatThread already ships exactly this; the station simply never got it. */}
      <div
        className="aurora-station-thread"
        role="log"
        aria-live="polite"
        aria-label={`Consultation with ${patientName}`}
        tabIndex={0}
      >
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
        {sending && (
          <div className="aurora-station-bubble pt">
            {/* The dots are decorative; the sr-only text is the actual announcement. */}
            <div className="aurora-typing" aria-hidden="true">•••</div>
            <span className="sr-only">{patientName} is replying…</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {!hasResult && locked && (
        <div className="aurora-station-locknote" data-testid="patient-lock">
          🔒 Next step is a hands-on procedure — perform it in the EyeBot panel.
        </div>
      )}

      {!hasResult && !locked && canSkip && <SkipStepButton busy={skipping} onSkip={onSkip} />}

      {!hasResult && !locked && (
        <div className="aurora-station-composer">
          <textarea
            className="aurora-station-composer-input"
            value={input}
            onChange={(e) => { onInputChange(e.target.value); autogrow(e.target); }}
            ref={(el) => autogrow(el)}
            onKeyDown={onKeyDown}
            placeholder="Talk to your patient…"
            aria-label="Message the patient"
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
