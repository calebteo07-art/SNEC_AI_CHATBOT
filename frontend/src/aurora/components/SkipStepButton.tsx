"use client";
/* SkipStepButton — the way out of a checklist step the student cannot complete. Appears in
   whichever pane they're stuck in, after a few tries on the same step (stationTurn.canSkip).

   One press, two stages: the examiner re-reads THAT step leniently first, so a student who
   really did it keeps full credit; only if that finds nothing is the step skipped — recorded
   as not completed, and the session carries on. The note says so before they press, because
   the press costs them the mark. Presentational — state lives in CaseSession. */

export function SkipStepButton({ busy, onSkip }: { busy: boolean; onSkip: () => void }) {
  return (
    <div className="aurora-station-skip">
      <button
        type="button"
        className="aurora-station-skip-btn"
        data-testid="station-skip"
        onClick={onSkip}
        disabled={busy}
      >
        {busy ? "Checking your work…" : "Unable to complete this checklist item"}
      </button>
      <p className="aurora-station-skip-note">
        We&rsquo;ll look for it in your work first. If it still isn&rsquo;t there, this step is
        recorded as not completed and you move on to the rest of the station.
      </p>
    </div>
  );
}
