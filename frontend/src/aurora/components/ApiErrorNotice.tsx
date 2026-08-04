"use client";
/* The one shape a student-facing API failure takes, on every surface: name the read that
   failed, instruct the reload (apiError.ts owns that sentence), and put the reload one
   click away so the instruction isn't homework.

   It carries its own opaque colours on purpose — the same panel renders on the light
   AURORA canvas (Home, Virtual Patients), the dark Forge, the dark arcade and the League's
   material ground, and a translucent fill would be unreadable on half of them. */
import { apiErrorMessage } from "@/aurora/lib/apiError";

export function ApiErrorNotice({ cause, className }: { cause?: string; className?: string }) {
  return (
    /* The inner class names look redundant beside the wrapper — they are load-bearing. This
       renders INSIDE feature blocks, and a feature that styles its own `p`/`button` descendants
       ties with a bare `.aurora-api-error p` on specificity — at which point the later
       declaration in aurora.css wins, and every feature block is declared later than this one.
       `p.aurora-api-error-msg` (0,2,1) outranks any `.feature p` (0,2,0) regardless of order. */
    <div role="alert" className={className ? `aurora-api-error ${className}` : "aurora-api-error"}>
      <p className="aurora-api-error-msg">{apiErrorMessage(cause)}</p>
      <button type="button" className="aurora-api-error-btn" onClick={() => window.location.reload()}>
        Reload page
      </button>
    </div>
  );
}
