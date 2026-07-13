"use client";

/* Landscape gate for the OSCE station on phones. The virtual-patient station is a
   three-pane triptych (checklist ‖ patient consult ‖ EyeBot) that needs horizontal
   room, so on a portrait phone we take over the screen and ask the student to rotate.
   Pure CSS drives visibility — a single media query in aurora.css shows this only on a
   touch device held in portrait; turning the phone to landscape flips the query and
   reveals the station instantly. No JS, no orientation listeners, no hydration flicker
   (the `screen.orientation.lock` API only works fullscreen and is unsupported on iOS,
   so the CSS rotate-nag is the robust path). */
export function RotateGate() {
  return (
    <div className="rotate-gate" role="alertdialog" aria-modal="true" aria-label="Rotate your phone to landscape">
      <div className="rotate-gate-mesh" aria-hidden />
      <div className="rotate-gate-card">
        <span className="rotate-gate-phone" aria-hidden />
        <h2 className="rotate-gate-title">Rotate your phone</h2>
        <p className="rotate-gate-copy">
          The OSCE virtual-patient station needs landscape room for the checklist,
          patient consult, and EyeBot panel. Turn your phone sideways to begin.
        </p>
        <p className="rotate-gate-hint">
          Not turning? Switch off Portrait Orientation Lock in your phone&rsquo;s control centre.
        </p>
      </div>
    </div>
  );
}
