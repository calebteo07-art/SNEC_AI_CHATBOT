/* PHOTOPIC · the blink in daylight
 * Two paper shutters with a gem-spectrum seam. Pure CSS transitions on
 * transform — TransitionProvider's state machine drives them via data
 * attributes. The login engulf uses the ink cover variant.
 */
import { useWipeNavigate } from "./TransitionProvider";

export function TransitionLayer() {
  const { phase, instant, cover } = useWipeNavigate();

  return (
    <div
      aria-hidden="true"
      className="fx-wipe"
      data-phase={phase}
      data-instant={instant ? "true" : "false"}
      data-cover={cover}
    >
      <div className="fx-wipe-lid fx-wipe-lid--top" />
      <div className="fx-wipe-lid fx-wipe-lid--bottom" />
    </div>
  );
}
