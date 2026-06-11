/* DARK ADAPTATION · the blink
 * Two eyelid panels in stage charcoal. Pure CSS transitions on transform —
 * the state machine in TransitionProvider drives them via data attributes.
 */
import { useWipeNavigate } from "./TransitionProvider";

export function TransitionLayer() {
  const { phase, instant } = useWipeNavigate();

  return (
    <div
      aria-hidden="true"
      className="fx-wipe"
      data-phase={phase}
      data-instant={instant ? "true" : "false"}
    >
      <div className="fx-wipe-lid fx-wipe-lid--top" />
      <div className="fx-wipe-lid fx-wipe-lid--bottom" />
    </div>
  );
}
