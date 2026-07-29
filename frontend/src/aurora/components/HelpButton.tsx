"use client";
/* HelpButton — the "?" affordance and its card. One component, two surfaces (/cases and
   the station), content from stationHelp.ts so the vocabulary can never drift.
   Reuses the station overlay scrim/card so it lands inside the locked visual language.

   The card is deliberately four one-liners: it is a reminder, not the teaching. On the
   station it also carries `onReplay`, which re-opens the pre-flight briefing — that is
   where the real walkthrough lives, so "?" is mostly a launcher. */
import { useEffect, useRef, useState } from "react";
import { helpFor } from "@/aurora/lib/stationHelp";

export function HelpButton({
  surface, label = "How this works", onReplay,
}: { surface: "cases" | "station"; label?: string; onReplay?: () => void }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const content = helpFor(surface);

  // Focus into the dialog on open, back to the button on close, Esc closes, Tab is trapped.
  useEffect(() => {
    if (!open) return;
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
      else if (e.key === "Tab") { e.preventDefault(); cardRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => { setOpen(false); btnRef.current?.focus(); };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="aurora-help-btn"
        data-testid={`help-${surface}`}
        aria-label={label}
        title={label}
        onClick={() => setOpen(true)}
      >
        ?
      </button>
      {open && (
        <div className="aurora-station-overlay" role="dialog" aria-modal="true" aria-label={content.title} data-testid="help-modal">
          <div className="aurora-station-overlay-scrim" onClick={close} aria-hidden />
          <div ref={cardRef} tabIndex={-1} className="aurora-station-overlay-card aurora-help-card">
            <button type="button" className="aurora-station-overlay-x" onClick={close} aria-label="Close">✕</button>
            <p className="aurora-eyebrow">{content.title}</p>
            <dl className="aurora-help-list">
              {content.sections.map((s) => (
                <div key={s.heading}>
                  <dt>{s.heading}</dt>
                  <dd>{s.body}</dd>
                </div>
              ))}
            </dl>
            <div className="aurora-help-actions">
              {onReplay && (
                <button
                  type="button"
                  className="aurora-help-replay"
                  data-testid="help-replay"
                  onClick={() => { setOpen(false); onReplay(); }}
                >
                  ▸ Replay the walkthrough
                </button>
              )}
              <button type="button" className="aurora-station-submit-go" onClick={close}>Got it</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
